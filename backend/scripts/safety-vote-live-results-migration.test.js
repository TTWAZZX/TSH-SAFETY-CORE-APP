'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const databaseName = `tsh_safety_vote_live_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const databaseGuard = /^tsh_safety_vote_live_\d+_\d+$/;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
const migrationFiles = [
    '20261008_safety_vote_phase1_foundation.sql',
    '20261008_safety_vote_phase2_core_mvp.sql',
    '20261008_safety_vote_phase3_survey_submission.sql',
    '20261008_safety_vote_phase4_jury_scoring.sql',
    '20261008_safety_vote_phase5_operations.sql',
    '20261008_safety_vote_phase6_secret_election.sql',
    '20261008_safety_vote_phase7_integrations_governance.sql',
    '20261009_safety_vote_phase10_4_media_versioning.sql',
    '20261010_safety_vote_ux_phase9a_engagement.sql',
    '20261010_safety_vote_ux_phase9b_planning_content_communication.sql',
    '20261010_safety_vote_ux_phase9c_engagement_analytics.sql',
    '20261015_safety_vote_live_results.sql',
    '20261015_safety_vote_live_results.sql'
];

let admin;
let disposable;

async function main() {
    assert(loopbackHosts.has(String(process.env.DB_HOST || '').toLowerCase()), 'loopback database required');
    assert(databaseGuard.test(databaseName), 'disposable database name guard failed');
    const connection = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS };
    admin = await mysql.createConnection(connection);
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    disposable = await mysql.createConnection({ ...connection, database: databaseName, multipleStatements: true });
    await disposable.query('CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission))');
    for (const file of migrationFiles) {
        process.stdout.write(`migration: ${file}\n`);
        await disposable.query(fs.readFileSync(path.join(root, 'backend', 'migrations', file), 'utf8'));
    }
    const [columns] = await disposable.query("SELECT COLUMN_NAME,COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='SafetyVote_CampaignVersions' AND COLUMN_NAME LIKE 'LiveLeaderboard%' ORDER BY ORDINAL_POSITION", [databaseName]);
    assert.strictEqual(columns.length, 6);
    assert.strictEqual(Number(columns.find(row => row.COLUMN_NAME === 'LiveLeaderboardEnabled').COLUMN_DEFAULT), 0);
    const [campaign] = await disposable.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,OwnerEmployeeID,CreatedBy,UpdatedBy) VALUES('SHE-001-2026','A1','A1','A1')");
    const [version] = await disposable.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,VersionNo,ContractVersion,CampaignType,PrivacyMode,TitleTh,LiveLeaderboardEnabled,LiveLeaderboardTopN,LiveLeaderboardScoreMode,LiveLeaderboardVisibility,LiveLeaderboardRefreshSeconds,LiveLeaderboardPrivacyThreshold,CreatedBy,UpdatedBy) VALUES(?,1,'2026-10-08-safety-vote-phase0-r1','popular_vote','identified','Fixture',1,10,'count_percentage','always',15,7,'A1','A1')", [campaign.insertId]);
    await disposable.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    await disposable.query(fs.readFileSync(path.join(root, 'backend', 'migrations', '20261015_safety_vote_live_results.rollback.sql'), 'utf8'));
    const [[kept]] = await disposable.query('SELECT TitleTh,LiveLeaderboardEnabled,LiveLeaderboardTopN FROM SafetyVote_CampaignVersions WHERE id=?', [version.insertId]);
    assert.strictEqual(kept.TitleTh, 'Fixture');
    assert.strictEqual(Number(kept.LiveLeaderboardEnabled), 0);
    assert.strictEqual(Number(kept.LiveLeaderboardTopN), 10);
    console.log('Safety Vote Live Results guarded disposable migration: PASS (idempotent x2, disabled default, data-preserving rollback)');
}

main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (disposable) await disposable.end().catch(() => {});
    if (!admin) return;
    if (databaseGuard.test(databaseName)) await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``).catch(() => {});
    await admin.end().catch(() => {});
});
