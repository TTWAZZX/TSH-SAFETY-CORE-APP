// backend/db.js
const mysql = require('mysql2/promise');
require('dotenv').config({ path: __dirname + '/.env' });

const pool = mysql.createPool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port:     process.env.DB_PORT || 4000,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    },
    waitForConnections:    true,
    connectionLimit:       10,
    queueLimit:            0,
    // ป้องกัน ECONNRESET จาก TiDB Cloud ตัด idle connection
    enableKeepAlive:       true,
    keepAliveInitialDelay: 10000,   // ส่ง keepalive packet ทุก 10s
    connectTimeout:        30000,   // timeout สร้าง connection ใหม่ 30s
    idleTimeout:           60000,   // คืน connection กลับ pool เมื่อ idle 60s
});

pool.getConnection()
    .then(conn => {
        console.log("✅ Database Connected Successfully (TiDB Cloud)");
        conn.release();
    })
    .catch(err => {
        console.error("❌ Database Connection Failed:", err.message);
    });

module.exports = pool;