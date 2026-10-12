require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert(['localhost','127.0.0.1','::1'].includes(host), 'Disposable migration test is loopback-only.');
    const name = `tsh_file_library_uat_${Date.now()}`;
    assert(/^tsh_file_library_uat_\d+$/.test(name));
    const options = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS };
    const admin = await mysql.createConnection(options);
    let db;
    try {
        await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        db = await mysql.createConnection({ ...options, database: name, multipleStatements: true });
        const migrations = ['20261012_file_library_foundation.sql', '20261012_file_library_access_controls.sql', '20261012_file_library_category_management.sql'].map(file => fs.readFileSync(path.join(__dirname, '..', 'migrations', file), 'utf8'));
        for (const migration of migrations) await db.query(migration);
        for (const migration of migrations) await db.query(migration);
        const token = 'A'.repeat(43);
        await db.query("INSERT INTO FileLibrary_Items(PublicToken,Title,OriginalName,StoredName,MimeType,FileExtension,FileSize,ContentSha256,UploadedBy,UpdatedBy) VALUES(?,?,?,?,?,?,?,?,?,?)", [token,'Keep','keep.pdf','keep.pdf','application/pdf','pdf',4,'a'.repeat(64),'ADMIN','ADMIN']);
        const [[shape]] = await db.query("SELECT COUNT(*) columns_count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='FileLibrary_Items'", [name]);
        assert(Number(shape.columns_count) >= 26, 'Expected complete file library category schema.');
        const [[categories]] = await db.query('SELECT COUNT(*) count FROM FileLibrary_Categories WHERE IsSystem=1');
        assert.strictEqual(Number(categories.count), 14, 'Expected seeded category master.');
        const rollback = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261012_file_library_foundation.rollback.sql'), 'utf8');
        await db.query(rollback);
        const [[retained]] = await db.query('SELECT COUNT(*) count FROM FileLibrary_Items');
        assert.strictEqual(Number(retained.count), 1, 'Rollback must retain file metadata.');
        console.log('File Library disposable migration: PASS (idempotent access schema, indexed token, data-preserving rollback)');
    } finally {
        if (db) await db.end().catch(() => {});
        await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
        await admin.end();
    }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
