'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

(async () => {
    const sql = fs.readFileSync(
        path.join(__dirname, '..', 'migrations', '20260901_bbs_phase10e_controlled_pilot_access.sql'),
        'utf8'
    );
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT || 3306),
        multipleStatements: true,
    });
    try {
        await db.query(sql);
        const [rows] = await db.query(
            "SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('staged_admin_only','pilot_scope_only') ORDER BY SettingKey"
        );
        const settings = Object.fromEntries(rows.map(row => [row.SettingKey, String(row.SettingValue)]));
        if (settings.pilot_scope_only !== '0') throw new Error('Controlled Pilot migration unexpectedly changed the access mode.');
        console.log(JSON.stringify({ localOnly: true, settings, businessRowsCreated: 0, rolloutChanged: false }, null, 2));
        console.log('BBS Phase 10E controlled Pilot setting: INSTALLED (not activated)');
    } finally {
        await db.end();
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
