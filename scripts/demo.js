// Local demonstration only: database resets whenever the process restarts.
const { newDb } = require('pg-mem');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../app');
const exiftool = require('../src/exif').createExif();
const db = newDb();
db.public.none(fs.readFileSync(path.join(__dirname, '../migrations/001_schema.sql'), 'utf8'));
const { Pool } = db.adapters.createPg();
const pool = new Pool();
const app = createApp({ pool, secret: require('node:crypto').randomBytes(48).toString('hex'),
  exif: exiftool, uploadDir: path.join(__dirname, '../private-uploads-demo') });
const server = app.listen(3000, '127.0.0.1', () => console.log('Démonstration locale : mémoire volatile, scans réseau désactivés'));
process.on('SIGTERM', () => server.close(async () => { await exiftool.end(); await pool.end(); process.exit(0); }));

