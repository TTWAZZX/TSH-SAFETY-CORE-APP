// api/_db.js
let pool = null;

async function getPool() {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!url) {
    const err = new Error('DATABASE_URL missing');
    err.code = 'NO_DB_URL';
    throw err;
  }

  // lazy require เพื่อลดโอกาส crash ตอนโหลดไฟล์
  const mysql = require('mysql2/promise');

  pool = await mysql.createPool({
    uri: url, // เช่น mysql://user:pass@host:4000/db
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  return pool;
}

module.exports = { getPool };
