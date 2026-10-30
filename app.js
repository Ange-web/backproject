const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { authTools, parse, signupSchema, loginSchema, profileSchema, safeUser } = require('./src/security');
const { createRunner } = require('./src/tools');
const { fileRoutes } = require('./src/files');
const PDFDocument = require('pdfkit');

function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
function createApp({ pool, secret, production = false, origins = ['http://localhost:5173', 'http://127.0.0.1:5173'],
  runner = createRunner(), documents = null, uploadDir, exif, limits = true, trustProxy = false } = {}) {
  if (!pool || !secret || secret.length < 32) throw new Error('Base SQL et secret de session de 32 caractères minimum requis');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(helmet());
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || origins.includes(origin)), credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      ((req.get('origin') && !origins.includes(req.get('origin'))) || req.get('sec-fetch-site') === 'cross-site'))
      return res.status(403).json({ error: 'Origine non autorisée' });
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  const auth = authTools(pool, secret, production);
  const limiter = (limit, windowMs, extra = {}) => limits ? rateLimit({ limit, windowMs, standardHeaders: 'draft-8', legacyHeaders: false, ...extra,
    message: { error: 'Trop de demandes. Réessayez plus tard.' } }) : (req, res, next) => next();
  // Seuls les échecs comptent : un utilisateur légitime n'est pas bloqué, la force brute l'est.
  const accountLimit = limiter(15, 15 * 60 * 1000, { skipSuccessfulRequests: true });
  const scanLimit = limiter(10, 60 * 1000);
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (req, res) => { await pool.query('SELECT 1'); res.json({ status: 'ready' }); });
  app.post('/new/signup', accountLimit, async (req, res) => {
    const data = parse(signupSchema, req.body);
    const password = await bcrypt.hash(data.password, 12);
    const result = await pool.query(`INSERT INTO public."user" (email,username,password,nom,prenom) VALUES ($1,$2,$3,$4,$5) RETURNING ${safeUser}`,
      [data.email, data.username, password, data.nom, data.prenom]);
    res.status(201).json({ user: result.rows[0] });
  });
  // A constant-cost comparison also runs when the email does not exist.
  const dummyHash = bcrypt.hashSync('unused-session-password-7a37', 12);
  app.post('/user/login', accountLimit, async (req, res) => {
    const data = parse(loginSchema, req.body);
    const { rows } = await pool.query('SELECT * FROM public."user" WHERE lower(email)=$1', [data.email]);
    const valid = await bcrypt.compare(data.password, rows[0]?.password || dummyHash);
    if (!rows[0] || !valid) fail(401, 'Email ou mot de passe incorrect');
    const csrfToken = auth.issue(res, rows[0]);
    const { rows: users } = await pool.query(`SELECT ${safeUser} FROM public."user" WHERE id=$1`, [rows[0].id]);
    res.json({ user: users[0], csrfToken });
  });
  app.get('/session', auth.protect, async (req, res) => {
    const { rows } = await pool.query(`SELECT ${safeUser} FROM public."user" WHERE id=$1`, [req.user.id]);
    res.json({ user: rows[0], csrfToken: req.sessionCsrf });
  });
  app.post('/user/logout', auth.protect, async (req, res) => {
    await pool.query('UPDATE public."user" SET auth_version=auth_version+1 WHERE id=$1', [req.user.id]);
    auth.clear(res); res.json({ message: 'Sessions déconnectées' });
  });
  app.get('/profile', auth.protect, async (req, res) => {
    const { rows } = await pool.query(`SELECT ${safeUser} FROM public."user" WHERE id=$1`, [req.user.id]);
    res.json({ user: rows[0] });
  });
  app.put('/profile', auth.protect, async (req, res) => {
    const data = parse(profileSchema, req.body);
    const fields = Object.keys(data);
    const { rows } = await pool.query(`UPDATE public."user" SET ${fields.map((k, i) => k + '=$' + (i + 1)).join(',')} WHERE id=$${fields.length + 1} RETURNING ${safeUser}`,
      [...Object.values(data), req.user.id]);
    res.json({ user: rows[0] });
  });
  app.put('/profile/password', accountLimit, auth.protect, async (req, res) => {
    const data = parse(z.object({ currentPassword: z.string().min(1).max(200), password: signupSchema.shape.password }).strict(), req.body);
    const { rows } = await pool.query('SELECT password FROM public."user" WHERE id=$1', [req.user.id]);
    if (!await bcrypt.compare(data.currentPassword, rows[0].password)) fail(401, 'Mot de passe actuel incorrect');
    await pool.query('UPDATE public."user" SET password=$1, auth_version=auth_version+1 WHERE id=$2', [await bcrypt.hash(data.password, 12), req.user.id]);
    auth.clear(res); res.json({ message: 'Mot de passe modifié. Reconnectez-vous.' });
  });
  const files = fileRoutes({ pool, auth, uploadDir, exif, scanLimit });
  app.use('/scan/exif', files.router);
  app.delete('/profile', accountLimit, auth.protect, async (req, res) => {
    const data = parse(z.object({ password: z.string().min(1).max(200) }).strict(), req.body);
    const { rows } = await pool.query('SELECT password FROM public."user" WHERE id=$1', [req.user.id]);
    if (!await bcrypt.compare(data.password, rows[0].password)) fail(401, 'Mot de passe incorrect');
    // External resources first; failures leave the account available for a retry.
    await files.removeUser(req.user.id);
    if (documents) await documents.removeUser(req.user.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM scans WHERE user_id=$1', [req.user.id]);
      await client.query('DELETE FROM user_files WHERE user_id=$1', [req.user.id]);
      await client.query('DELETE FROM public."user" WHERE id=$1', [req.user.id]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    auth.clear(res); res.json({ message: 'Compte et données supprimés' });
  });
  const activeUsers = new Set();
  async function saveScan(userId, kind, detail) {
    const rank = ['info', 'low', 'medium', 'high', 'critical'];
    const severity = detail.findings.reduce((acc, f) => rank.indexOf(f.severity) > rank.indexOf(acc) ? f.severity : acc, 'info');
    const { rows } = await pool.query(`INSERT INTO scans (user_id,tool_type,target,result_count,severity,duration_ms,detail,document_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [userId, kind, detail.target, detail.findings.length, severity, detail.duration_ms, JSON.stringify(detail), documents ? 'pending' : 'sql']);
    const scan = rows[0];
    if (documents) {
      try { await documents.put(scan.id, userId, detail); await pool.query('UPDATE scans SET document_status=$1 WHERE id=$2', ['mongo', scan.id]); }
      catch { /* SQL retains the complete result; a reconciliation command can retry. */ }
    }
    return envelope(scan, detail);
  }
  function envelope(scan, detail) {
    return { scan: { ...scan, detail: undefined, scan_date: scan.created_at, started_at: scan.created_at }, findings: detail.findings || [],
      stats: Object.fromEntries(['info', 'low', 'medium', 'high', 'critical'].map(s => [s + '_count', (detail.findings || []).filter(f => f.severity === s).length])),
      ipData: detail.ipData };
  }
  for (const kind of ['url', 'port']) app.post('/scan/' + kind, auth.protect, scanLimit, async (req, res) => {
    if (activeUsers.has(req.user.id) || activeUsers.size >= 2) fail(429, 'Une analyse est déjà en cours. Réessayez plus tard.');
    activeUsers.add(req.user.id);
    try {
      const body = parse(kind === 'url' ? z.object({ url: z.string().max(2048) }).strict() :
        z.object({ type: z.literal('public'), ip: z.string().max(45), ports: z.array(z.number().int().min(1).max(65535)).min(1).max(32) }).strict(), req.body);
      const detail = await runner(kind, body);
      const saved = await saveScan(req.user.id, kind, detail);
      res.json({ ...saved, results: saved.findings.map(f => ({ templateID: f.title, info: { name: f.title, severity: f.severity }, matched_at: f.evidence })) });
    } finally { activeUsers.delete(req.user.id); }
  });
  app.get('/scan/ip', auth.protect, (req, res) => res.json({ ip: req.ip,
    message: 'Adresse observée par le serveur ; aucun diagnostic de sécurité.' }));
  app.post('/scan/ip', auth.protect, scanLimit, async (req, res) => res.json(await saveScan(req.user.id, 'ip', {
    target: req.ip, findings: [], duration_ms: 0, ipData: { ip: req.ip } })));
  app.get('/stats', auth.protect, async (req, res) => {
    const { rows } = await pool.query('SELECT tool_type, COUNT(*)::integer AS count FROM scans WHERE user_id=$1 GROUP BY tool_type', [req.user.id]);
    const byType = Object.fromEntries(rows.map(r => [r.tool_type, Number(r.count)]));
    const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
    res.json({ totalScans: total, total_scans: total, urlScans: byType.url || 0, ipScans: byType.ip || 0, portScans: byType.port || 0,
      exifScans: byType.exif || 0, scans_by_type: byType });
  });
  app.get('/api/scans', auth.protect, async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Math.min(1000000, Number(req.query.offset) || 0));
    if (!Number.isInteger(limit) || !Number.isInteger(offset)) fail(400, 'Pagination invalide');
    const { rows } = await pool.query(`SELECT id,tool_type,target,result_count,created_at,status,severity,duration_ms,document_status
      FROM scans WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3`, [req.user.id, limit, offset]);
    res.json({ scans: rows.map(r => ({ ...r, scan_date: r.created_at })), limit, offset });
  });
  async function ownedScan(req) {
    if (!/^\d{1,10}$/.test(req.params.id)) fail(404, 'Analyse introuvable');
    const { rows } = await pool.query('SELECT * FROM scans WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id]);
    if (!rows[0]) fail(404, 'Analyse introuvable');
    let detail = rows[0].detail;
    if (documents && rows[0].document_status === 'mongo') { try { detail = await documents.get(rows[0].id, req.user.id) || detail; } catch { /* SQL fallback */ } }
    return envelope(rows[0], detail);
  }
  app.get('/api/scans/:id', auth.protect, async (req, res) => res.json(await ownedScan(req)));
  app.post('/api/scans/:id/report', auth.protect, async (req, res) => { await ownedScan(req); res.json({ ready: true }); });
  app.get('/api/scans/:id/report/latest', auth.protect, async (req, res) => {
    const detail = await ownedScan(req);
    res.type('pdf').attachment('NSPY-analyse-' + detail.scan.id + '.pdf');
    const doc = new PDFDocument({ margin: 48 });
    doc.on('error', () => res.destroy()); doc.pipe(res);
    doc.fontSize(23).text('NSPY - Rapport d’observations');
    doc.moveDown().fontSize(11).text('Ce rapport décrit les observations d’un outil à un instant donné. Il ne certifie pas la sécurité de la cible.');
    doc.moveDown().text('Cible : ' + detail.scan.target).text('Outil : ' + detail.scan.tool_type).text('Date : ' + new Date(detail.scan.created_at).toISOString());
    doc.moveDown().text('Observations : ' + detail.findings.length);
    for (const f of detail.findings) doc.moveDown().fontSize(12).text(f.title).fontSize(10).text('Niveau : ' + f.severity).text(f.description || '').text(f.evidence || '');
    if (!detail.findings.length) doc.text('Aucune observation enregistrée. Ce résultat ne garantit pas l’absence de vulnérabilités.');
    doc.end();
  });
  app.use((req, res) => res.status(404).json({ error: 'Route introuvable' }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.code === '23505') return res.status(409).json({ error: 'Impossible de créer ce compte avec ces informations' });
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : (err.status === 503 ? 503 : (err.status >= 400 && err.status < 500 ? err.status : 500));
    // Journal serveur sobre : méthode, chemin et message technique, jamais le corps de la requête ni de secret.
    if (status === 500) console.error(new Date().toISOString(), req.method, req.path, err.code || '', err.message);
    res.status(status).json({ error: status === 500 ? 'Opération impossible. Réessayez plus tard.' : (status === 413 ? 'Fichier trop volumineux (5 Mo maximum)' : err.message) });
  });
  return app;
}
module.exports = { createApp };
