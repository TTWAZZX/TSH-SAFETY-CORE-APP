// backend/db.js
const mysql = require('mysql2/promise');
require('dotenv').config({ path: __dirname + '/.env' });

const useSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';

const poolConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 30000,
    idleTimeout: 60000,
};

if (useSsl) {
    poolConfig.ssl = {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
    };
}

const pool = mysql.createPool(poolConfig);

pool.getConnection()
    .then((conn) => {
        console.log(`Database Connected Successfully (${process.env.DB_HOST}:${poolConfig.port}/${process.env.DB_NAME})`);
        conn.release();
    })
    .catch((err) => {
        console.error('Database Connection Failed:', err.message || err.code || err);
    });

module.exports = pool;
