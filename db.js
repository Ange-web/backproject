require('dotenv').config();
const { Pool } = require('pg');
let pool;
function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL est requis');
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: true, ...(process.env.DATABASE_CA ? { ca: process.env.DATABASE_CA.replace(/\\n/g, '\n') } : {}) } : false,
  });
  return pool;
}
module.exports = { getPool };
