'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

(async () => {
    const sql = fs.readFileSync(
        path.join(__dirname, '..', 'migrations', '20260901_bbs_phase10e_staged_admin_gate.sql'),
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
        const [[setting]] = await db.query(
            "SELECT SettingKey,SettingValue,UpdatedBy FROM BBS_Settings WHERE SettingKey='staged_admin_only' LIMIT 1"
        );
        if (String(setting?.SettingValue) !== '1') throw new Error('The staged Admin-only gate was not enabled.');
        console.log(JSON.stringify({
            localOnly: true,
            settingKey: setting.SettingKey,
            settingValue: String(setting.SettingValue),
            updatedBy: setting.UpdatedBy,
            businessRowsCreated: 0,
        }, null, 2));
        console.log('BBS Phase 10E local staged Admin-only gate: ENABLED');
    } finally {
        await db.end();
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
