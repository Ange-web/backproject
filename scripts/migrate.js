require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const { getPool } = require('../db');
async function main() {
  const pool = getPool();
  try {
    await pool.query(await fs.readFile(path.join(__dirname, '../migrations/001_schema.sql'), 'utf8'));
    console.log('Schéma NSPY à jour.');
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Migration refusée : vérifier la configuration et les doublons email.'); process.exitCode = 1; });
