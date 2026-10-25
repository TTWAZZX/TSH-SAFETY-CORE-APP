'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const root = path.resolve(__dirname, '..', '..');
const database = `tsh_safety_vote_gallery_test_${Date.now()}`;
const host = String(process.env.DB_HOST || '').toLowerCase();
assert(['localhost', '127.0.0.1', '::1'].includes(host), 'Gallery migration test requires a loopback database');
assert(/^tsh_safety_vote_gallery_test_\d+$/.test(database));

let admin;
let db;
(async () => {
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database, multipleStatements: true });
    await db.query(`
        CREATE TABLE SafetyVote_Settings(SettingKey VARCHAR(100) PRIMARY KEY,SettingValue TEXT,UpdatedBy VARCHAR(20));
        CREATE TABLE SafetyVote_Campaigns(id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY);
        CREATE TABLE SafetyVote_CampaignVersions(id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,CampaignID BIGINT NOT NULL);
        CREATE TABLE SafetyVote_Files(id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY);
    `);
    const migration = fs.readFileSync(path.join(root, 'backend', 'migrations', '20261024_safety_vote_candidate_submission_gallery.sql'), 'utf8');
    await db.query(migration);
    await db.query(migration);
    const [[table]] = await db.query("SELECT COUNT(*) total FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME='SafetyVote_GalleryItems'", [database]);
    assert.strictEqual(Number(table.total), 1);
    const [indexes] = await db.query("SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='SafetyVote_GalleryItems'", [database]);
    const names = indexes.map(row => row.INDEX_NAME);
    assert(names.includes('uq_sv_gallery_owner_file'));
    assert(names.includes('idx_sv_gallery_owner'));
    assert(names.includes('idx_sv_gallery_campaign'));
    const [[foreignKeys]] = await db.query("SELECT COUNT(*) total FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME='SafetyVote_GalleryItems'", [database]);
    assert.strictEqual(Number(foreignKeys.total), 3);
    const [[contract]] = await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='candidate_submission_gallery_contract'");
    assert.strictEqual(contract.SettingValue, '2026-10-24-safety-vote-gallery-r1');
    console.log('Safety Vote candidate/submission gallery migration: PASS (additive, idempotent, indexed, foreign-key protected)');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    if (db) await db.end();
    if (admin) { if (/^tsh_safety_vote_gallery_test_\d+$/.test(database)) await admin.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin.end(); }
});
