require('dotenv').config();
const { createApp } = require('./app');
const { getPool } = require('./db');
const { createRunner } = require('./src/tools');
const { createDocumentStore } = require('./src/documents');
const exiftool = require('./src/exif').createExif();
async function main() {
  const pool = getPool();
  await pool.query('SELECT 1');
  const documents = createDocumentStore(process.env.MONGO_URL);
  if (documents) await documents.ready();
  const app = createApp({ pool, secret: process.env.JWT_SECRET, production: process.env.NODE_ENV === 'production',
    origins: (process.env.FRONTEND_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()),
    trustProxy: process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : false,
    uploadDir: process.env.UPLOAD_DIR, exif: exiftool, documents,
    runner: createRunner({ enabled: process.env.SCANNERS_ENABLED === 'true',
      allowedUrls: (process.env.SCAN_ALLOWED_URLS || '').split(',').filter(Boolean),
      allowedIps: (process.env.SCAN_ALLOWED_IPS || '').split(',').filter(Boolean) }) });
  const server = app.listen(Number(process.env.PORT) || 3000, () => console.log('API NSPY démarrée'));
  const shutdown = () => { server.close(async () => { await exiftool.end(); if (documents) await documents.close(); await pool.end(); process.exit(0); }); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
main().catch(() => { console.error('Démarrage impossible : vérifier la configuration et les bases'); process.exit(1); });

