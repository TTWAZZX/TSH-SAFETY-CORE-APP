// backend/db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

try {
    pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: true
        },
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log("✅ Database connection pool created in db.js");
} catch (error) {
    console.error("❌ DB Config Error:", error);
}

module.exports = pool;