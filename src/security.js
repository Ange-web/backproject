const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const options = { algorithms: ['HS256'], issuer: 'nspy', audience: 'nspy-web' };
const cookieName = 'nspy_session';
const safeUser = 'id, email, username, nom, prenom, avatar_url';
const signupSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  username: z.string().trim().min(3).max(40).regex(/^[\p{L}\p{N}_-]+$/u),
  password: z.string().min(12).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Maximum 72 octets'),
  nom: z.string().trim().max(80).default(''), prenom: z.string().trim().max(80).default(''),
}).strict();
const loginSchema = z.object({ email: z.email().trim().toLowerCase(), password: z.string().min(1).max(200) }).strict();
const profileSchema = z.object({
  username: z.string().trim().min(3).max(40).regex(/^[\p{L}\p{N}_-]+$/u).optional(),
  nom: z.string().trim().max(80).optional(), prenom: z.string().trim().max(80).optional(),
}).strict().refine(v => Object.keys(v).length > 0, 'Aucune modification');
function parse(schema, body) {
  const r = schema.safeParse(body);
  if (!r.success) { const e = new Error(r.error.issues.map(v => v.message).join('. ')); e.status = 400; throw e; }
  return r.data;
}
function authTools(pool, secret, production) {
  const cookieOptions = { httpOnly: true, secure: production, sameSite: 'lax', path: '/', maxAge: 3600000 };
  function issue(res, user) {
    const csrfToken = crypto.randomBytes(32).toString('hex');
    const token = jwt.sign({ id: user.id, ver: user.auth_version, csrf: csrfToken }, secret,
      { algorithm: 'HS256', issuer: options.issuer, audience: options.audience, expiresIn: '1h' });
    res.cookie(cookieName, token, cookieOptions);
    res.cookie('nspy_csrf', csrfToken, { ...cookieOptions, httpOnly: false });
    return csrfToken;
  }
  function clear(res) {
    const { maxAge, ...clearOptions } = cookieOptions;
    res.clearCookie(cookieName, clearOptions);
    res.clearCookie('nspy_csrf', { ...clearOptions, httpOnly: false });
  }
  async function protect(req, res, next) {
    let payload;
    try { payload = jwt.verify(req.cookies[cookieName] || '', secret, options); }
    catch { return res.status(401).json({ error: 'Session absente ou expirée. Reconnectez-vous.' }); }
    if (!Number.isSafeInteger(payload.id) || typeof payload.csrf !== 'string') return res.status(401).json({ error: 'Session invalide' });
    const result = await pool.query('SELECT id, auth_version FROM public."user" WHERE id=$1', [payload.id]);
    if (!result.rows[0] || result.rows[0].auth_version !== payload.ver) return res.status(401).json({ error: 'Session révoquée' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const header = req.get('x-csrf-token') || '';
      if (Buffer.byteLength(header) !== Buffer.byteLength(payload.csrf) ||
        !crypto.timingSafeEqual(Buffer.from(header), Buffer.from(payload.csrf)))
        return res.status(403).json({ error: 'Protection CSRF : rechargez la session' });
    }
    req.user = { id: payload.id }; req.sessionCsrf = payload.csrf; next();
  }
  return { issue, protect, clear };
}
module.exports = { authTools, parse, signupSchema, loginSchema, profileSchema, safeUser };
