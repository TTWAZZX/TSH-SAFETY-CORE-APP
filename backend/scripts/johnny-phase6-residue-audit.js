'use strict';

const assert = require('assert');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

(async () => {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), 'Phase 6 residue audit refuses non-loopback DB_HOST');
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
    });
    try {
        const [rows] = await connection.query(
            'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME LIKE ? ORDER BY SCHEMA_NAME',
            ['tsh_johnny_phase6_%']
        );
        assert.strictEqual(rows.length, 0, `Phase 6 database residue remains: ${rows.map(row => row.SCHEMA_NAME).join(', ')}`);
        console.log('Johnny AI Phase 6 residue audit: PASS (0 disposable databases remain)');
    } finally {
        await connection.end();
    }
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
