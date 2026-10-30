require('dotenv').config();
const { getPool } = require('../db');
const { createDocumentStore } = require('../src/documents');
async function main() {
  const pool = getPool(), documents = createDocumentStore(process.env.MONGO_URL);
  if (!documents) throw new Error('MONGO_URL requis');
  try {
    await documents.ready();
    const { rows } = await pool.query("SELECT id,user_id,detail FROM scans WHERE document_status='pending' ORDER BY id LIMIT 100");
    for (const scan of rows) { await documents.put(scan.id, scan.user_id, scan.detail); await pool.query("UPDATE scans SET document_status='mongo' WHERE id=$1", [scan.id]); }
    console.log('Réconciliation terminée (100 documents maximum par passage).');
  } finally { await documents.close(); await pool.end(); }
}
main().catch(() => { console.error('Réconciliation incomplète : vérifier MongoDB'); process.exitCode = 1; });
