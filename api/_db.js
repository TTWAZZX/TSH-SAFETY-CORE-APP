let pool = null;
async function getPool() {
  if (pool) return pool;
  const mysql = require('mysql2/promise');
  pool = await mysql.createPool({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    waitForConnections: true, connectionLimit: 10
  });
  return pool;
}
module.exports = { getPool };
