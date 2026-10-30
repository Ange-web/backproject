const express = require('express');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { z } = require('zod');
const { parse } = require('./security');
const fileId = z.string().uuid();
function problem(status, message) { const e = new Error(message); e.status = status; throw e; }
function fileRoutes({ pool, auth, uploadDir = path.join(process.cwd(), 'private-uploads'), exif, scanLimit }) {
  const root = path.resolve(uploadDir);
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } });
  router.use(auth.protect);
  router.use(scanLimit);
  function requireTool() { if (!exif) problem(503, 'Outil de métadonnées indisponible'); }
  async function owned(id, userId) {
    if (!fileId.safeParse(id).success) problem(404, 'Fichier introuvable');
    const { rows } = await pool.query('SELECT * FROM user_files WHERE id=$1 AND user_id=$2', [id, userId]);
    const row = rows[0];
    if (!row || Date.now() - new Date(row.created_at).getTime() > 86400000) problem(404, 'Fichier absent ou expiré');
    return { ...row, fullPath: path.join(root, row.stored_name) };
  }
  async function metadata(fullPath) {
    const data = await exif.read(fullPath);
    if (data.Error) problem(400, 'Image invalide ou non prise en charge');
    // Chemins, champs internes d'ExifTool, dates/permissions du serveur et données binaires ne sont jamais renvoyés.
    return Object.fromEntries(Object.entries(data).filter(([k, v]) => !['SourceFile', 'Directory', 'FileName', 'errors', 'warnings', 'ExifToolVersion', 'FilePermissions', 'FileModifyDate', 'FileAccessDate', 'FileInodeChangeDate'].includes(k) && !Buffer.isBuffer(v)));
  }
  function response(row, data) { return { storedName: row.id, originalName: row.original_name, metadata: data,
    downloadUrl: '/scan/exif/download/' + row.id, ready: true }; }
  router.post('/read', upload.single('image'), async (req, res) => {
    requireTool();
    if (!req.file) problem(400, 'Image JPEG ou PNG requise');
    const buffer = req.file.buffer;
    const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg = buffer.length > 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    if (!png && !jpg) problem(400, 'Seules les images JPEG et PNG sont acceptées');
    const { rows: usage } = await pool.query('SELECT COUNT(*)::integer AS count FROM user_files WHERE user_id=$1', [req.user.id]);
    if (usage[0].count >= 20) problem(429, 'Quota de 20 fichiers atteint. Supprimez un fichier ou attendez la purge.');
    const id = crypto.randomUUID(), stored = id + (png ? '.png' : '.jpg');
    const full = path.join(root, stored);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(full, buffer, { flag: 'wx', mode: 0o600 });
    try {
      const data = await metadata(full);
      const original = path.basename(req.file.originalname).replace(/[\x00-\x1f]/g, '').slice(0, 255) || 'image';
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO user_files (id,user_id,stored_name,original_name,mime_type) VALUES ($1,$2,$3,$4,$5)',
          [id, req.user.id, stored, original, png ? 'image/png' : 'image/jpeg']);
        const detail = { target: original, findings: [], duration_ms: 0, metadata_field_count: Object.keys(data).length };
        await client.query("INSERT INTO scans (user_id,tool_type,target,result_count,detail) VALUES ($1,'exif',$2,$3,$4)",
          [req.user.id, original, Object.keys(data).length, JSON.stringify(detail)]);
        await client.query('COMMIT');
      } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
      res.status(201).json(response({ id, original_name: original }, data));
    } catch (e) { await fs.rm(full, { force: true }); throw e; }
  });
  router.post('/edit', async (req, res) => {
    requireTool();
    const data = parse(z.object({ storedName: fileId, tag: z.enum(['Artist', 'Copyright', 'ImageDescription', 'Comment']), value: z.string().max(500) }).strict(), req.body);
    const row = await owned(data.storedName, req.user.id);
    await exif.write(row.fullPath, { [data.tag]: data.value }, ['-overwrite_original']);
    res.json(response(row, await metadata(row.fullPath)));
  });
  router.post('/delete', async (req, res) => {
    requireTool();
    const data = parse(z.object({ storedName: fileId }).strict(), req.body);
    const row = await owned(data.storedName, req.user.id);
    await exif.write(row.fullPath, { All: '' }, ['-all=', '-overwrite_original']);
    res.json(response(row, await metadata(row.fullPath)));
  });
  router.get('/download/:id', async (req, res) => {
    const row = await owned(req.params.id, req.user.id);
    res.type(row.mime_type).download(row.fullPath, row.original_name, err => { if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' }); });
  });
  router.delete('/:id', async (req, res) => {
    const row = await owned(req.params.id, req.user.id);
    await fs.rm(row.fullPath, { force: true });
    await pool.query('DELETE FROM user_files WHERE id=$1 AND user_id=$2', [row.id, req.user.id]);
    res.json({ message: 'Fichier supprimé' });
  });
  async function removeUser(userId) {
    const { rows } = await pool.query('SELECT stored_name FROM user_files WHERE user_id=$1', [userId]);
    for (const row of rows) await fs.rm(path.join(root, row.stored_name), { force: true });
  }
  return { router, removeUser };
}
module.exports = { fileRoutes };
