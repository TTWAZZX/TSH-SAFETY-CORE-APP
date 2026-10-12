require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert(['localhost','127.0.0.1','::1'].includes(host), 'Local migration is loopback-only.');
    const dbName = String(process.env.DB_NAME || '').trim();
    assert(dbName && !/prod|production/i.test(dbName), 'Refusing a Production-like database name.');
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: dbName, multipleStatements: true });
    try {
        for (const file of ['20261012_file_library_foundation.sql', '20261012_file_library_access_controls.sql', '20261012_file_library_category_management.sql']) {
            const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', file), 'utf8');
            await db.query(sql);
        }
        const [[result]] = await db.query("SELECT COUNT(*) table_count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME='FileLibrary_Items'", [dbName]);
        assert.strictEqual(Number(result.table_count), 1);
        const [[shape]] = await db.query("SELECT COUNT(*) columns_count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='FileLibrary_Items' AND COLUMN_NAME IN ('AccessMode','DeliveryMode','LastAccessedAt')", [dbName]);
        assert.strictEqual(Number(shape.columns_count), 3);
        const [[categories]] = await db.query("SELECT COUNT(*) category_count FROM FileLibrary_Categories WHERE IsSystem=1");
        assert.strictEqual(Number(categories.category_count), 14);
        console.log('File Library local migration: PASS (schema/access/category master ready; existing rows preserved)');
    } finally { await db.end(); }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
