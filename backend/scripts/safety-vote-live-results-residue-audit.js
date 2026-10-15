'use strict';

const assert = require('assert');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

(async () => {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(String(process.env.DB_HOST || '').toLowerCase()), 'Refusing non-loopback database');
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
    try {
        const [schemas] = await db.query('SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME LIKE ? OR SCHEMA_NAME LIKE ?', ['tsh_safety_vote_phase1_%', 'tsh_safety_vote_live_%']);
        const [settings] = await db.query("SELECT SettingKey,SettingValue FROM SafetyVote_Settings WHERE SettingKey IN ('schema_version','module_enabled','live_results_contract') ORDER BY SettingKey");
        const [[enabled]] = await db.query('SELECT COUNT(*) total FROM SafetyVote_CampaignVersions WHERE LiveLeaderboardEnabled=1');
        if (process.argv.includes('--cleanup')) {
            for (const row of schemas) {
                const name = String(row.SCHEMA_NAME || '');
                assert(/^(tsh_safety_vote_phase1_(node|php)|tsh_safety_vote_live)_\d+_\d+$/.test(name), `Refusing unexpected schema: ${name}`);
                await db.query(`DROP DATABASE \`${name}\``);
            }
        } else {
            assert.strictEqual(schemas.length, 0, `Disposable Safety Vote databases remain: ${schemas.map(row => row.SCHEMA_NAME).join(', ')}`);
        }
        const [remaining] = await db.query('SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME LIKE ? OR SCHEMA_NAME LIKE ?', ['tsh_safety_vote_phase1_%', 'tsh_safety_vote_live_%']);
        assert.strictEqual(remaining.length, 0, 'Disposable Safety Vote database cleanup failed');
        console.log(JSON.stringify({ decision: 'PASS_LOCAL_LIVE_RESULTS_RESIDUE_AUDIT', removedDisposableDatabases: process.argv.includes('--cleanup') ? schemas.length : 0, disposableDatabaseResidue: 0, settings, liveEnabledVersions: Number(enabled.total), productionConnected: false }));
    } finally { await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
