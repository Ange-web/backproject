require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const { getPool } = require('../db');
async function main() {
  const pool = getPool(), root = path.resolve(process.env.UPLOAD_DIR || 'private-uploads');
  try {
    const { rows } = await pool.query("SELECT id,stored_name FROM user_files WHERE created_at < NOW() - INTERVAL '24 hours'");
    for (const row of rows) {
      await fs.rm(path.join(root, row.stored_name), { force: true });
      await pool.query('DELETE FROM user_files WHERE id=$1', [row.id]);
    }
    // Recover orphan files left by a crash between disk write and SQL insert.
    const { rows: kept } = await pool.query('SELECT stored_name FROM user_files');
    const names = new Set(kept.map(r => r.stored_name));
    for (const name of await fs.readdir(root).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
      if (!/^[0-9a-f-]{36}\.(png|jpg)$/.test(name) || names.has(name)) continue;
      const full = path.join(root, name), stat = await fs.stat(full);
      if (Date.now() - stat.mtimeMs > 86400000) await fs.rm(full);
    }
    console.log('Purge des fichiers expirés terminée.');
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Purge incomplète, relancer après correction'); process.exitCode = 1; });
