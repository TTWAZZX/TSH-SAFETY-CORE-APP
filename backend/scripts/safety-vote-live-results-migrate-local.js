'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const loopback = new Set(['localhost', '127.0.0.1', '::1']);

(async () => {
    assert(loopback.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Refusing non-loopback database');
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, multipleStatements: true });
    try {
        const [[baseline]] = await db.query("SELECT COUNT(*) total FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('SafetyVote_Settings','SafetyVote_CampaignVersions','SafetyVote_Ballots','SafetyVote_BallotAnswers')");
        assert.strictEqual(Number(baseline.total), 4, 'Safety Vote local baseline is incomplete');
        const [[before]] = await db.query('SELECT (SELECT COUNT(*) FROM SafetyVote_Campaigns) campaigns,(SELECT COUNT(*) FROM SafetyVote_CampaignVersions) versions,(SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_BallotAnswers) answers');
        await db.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261015_safety_vote_live_results.sql'), 'utf8'));
        const [[after]] = await db.query('SELECT (SELECT COUNT(*) FROM SafetyVote_Campaigns) campaigns,(SELECT COUNT(*) FROM SafetyVote_CampaignVersions) versions,(SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_BallotAnswers) answers');
        assert.deepStrictEqual(Object.values(after).map(Number), Object.values(before).map(Number), 'protected business rows changed');
        const [columns] = await db.query("SELECT COLUMN_NAME,COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_CampaignVersions' AND COLUMN_NAME LIKE 'LiveLeaderboard%' ORDER BY ORDINAL_POSITION");
        assert.strictEqual(columns.length, 6, 'Live Results columns are incomplete');
        assert.strictEqual(Number(columns.find(row => row.COLUMN_NAME === 'LiveLeaderboardEnabled').COLUMN_DEFAULT), 0, 'Live Results must default off');
        const [[setting]] = await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='schema_version'");
        assert.strictEqual(setting.SettingValue, '2026-10-15-live-results-r1');
        console.log(JSON.stringify({ decision: 'PASS_LOCAL_LIVE_RESULTS_SCHEMA', host: 'loopback', database: process.env.DB_NAME, columns: columns.length, defaultEnabled: false, protectedRowsUnchanged: true, productionConnected: false }));
    } finally {
        await db.end();
    }
})().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
