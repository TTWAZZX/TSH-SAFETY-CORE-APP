'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const root = path.resolve(__dirname, '..', '..');
const database = `tsh_safety_vote_phase5b6_test_${Date.now()}`;
assert(['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST || '').toLowerCase()), 'Migration test requires a loopback database');
assert(/^tsh_safety_vote_phase5b6_test_\d+$/.test(database));
let admin;
let connection;
(async () => {
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database, multipleStatements: true });
    await connection.query(`
        CREATE TABLE SafetyVote_Settings(SettingKey VARCHAR(100) PRIMARY KEY,SettingValue TEXT,UpdatedBy VARCHAR(20));
        CREATE TABLE SafetyVote_Campaigns(id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY);
        CREATE TABLE SafetyVote_CampaignVersions(id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,CampaignID BIGINT NOT NULL,CampaignType VARCHAR(40) NOT NULL);
        CREATE TABLE SafetyVote_Options(id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY);
        CREATE TABLE SafetyVote_Candidates(id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,CampaignVersionID BIGINT NOT NULL,OptionID BIGINT NOT NULL,CandidateNo VARCHAR(50) NOT NULL,Status VARCHAR(20) NOT NULL DEFAULT 'Active',SortOrder INT NOT NULL DEFAULT 0,CONSTRAINT fk_test_candidate_option FOREIGN KEY(OptionID) REFERENCES SafetyVote_Options(id));
        CREATE TABLE SafetyVote_Files(id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY);
    `);
    const migration = fs.readFileSync(path.join(root, 'backend', 'migrations', '20261025_safety_vote_jury_work_items_atomic_media.sql'), 'utf8');
    await connection.query(migration);
    await connection.query(migration);
    const [columns] = await connection.query("SELECT TABLE_NAME,COLUMN_NAME,IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND ((TABLE_NAME='SafetyVote_CampaignVersions' AND COLUMN_NAME='WorkSource') OR (TABLE_NAME='SafetyVote_Candidates' AND COLUMN_NAME IN ('OptionID','SourceType','SourceCampaignID','SourceCandidateID'))) ORDER BY TABLE_NAME,COLUMN_NAME", [database]);
    assert.strictEqual(columns.length, 5);
    assert.strictEqual(columns.find(row => String(row.COLUMN_NAME).toLowerCase() === 'optionid').IS_NULLABLE, 'YES');
    const [[ledger]] = await connection.query("SELECT COUNT(*) total FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME='SafetyVote_MediaMutations'", [database]);
    assert.strictEqual(Number(ledger.total), 1);
    const [settings] = await connection.query("SELECT SettingKey,SettingValue FROM SafetyVote_Settings WHERE SettingKey IN ('schema_version','jury_work_items_contract','atomic_media_contract') ORDER BY SettingKey");
    assert.deepStrictEqual(Object.fromEntries(settings.map(row => [row.SettingKey, row.SettingValue])), {
        atomic_media_contract: '2026-10-25-atomic-media-r1',
        jury_work_items_contract: '2026-10-25-jury-work-items-r1',
        schema_version: '2026-10-25-jury-work-items-atomic-media-r1',
    });
    console.log('Safety Vote Phase 5B + Phase 6 Backend migration: PASS (additive/idempotent/data-retaining)');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    if (connection) await connection.end();
    if (admin) { if (/^tsh_safety_vote_phase5b6_test_\d+$/.test(database)) await admin.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin.end(); }
});
