// backend/db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,      // ดึงจาก DB_HOST
    user: process.env.DB_USER,      // ดึงจาก DB_USER
    password: process.env.DB_PASS,  // ดึงจาก DB_PASS
    database: process.env.DB_NAME,  // ดึงจาก DB_NAME
    port: process.env.DB_PORT || 4000, // ดึงจาก DB_PORT
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// เพิ่มส่วนเช็คการเชื่อมต่อให้ด้วย จะได้รู้ว่าต่อติดไหม
pool.getConnection()
    .then(conn => {
        console.log("✅ Database Connected Successfully (TiDB Cloud)");
        conn.release();
    })
    .catch(err => {
        console.error("❌ Database Connection Failed:", err);
    });

module.exports = pool;