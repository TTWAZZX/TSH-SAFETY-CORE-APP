'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const root = path.resolve(__dirname, '..', '..');
const database = `tsh_safety_vote_question_images_test_${Date.now()}`;
const host = String(process.env.DB_HOST || '').toLowerCase();
assert(['localhost', '127.0.0.1', '::1'].includes(host), 'Question image migration test requires a loopback database');
assert(/^tsh_safety_vote_question_images_test_\d+$/.test(database));

let admin;
let db;
(async () => {
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database, multipleStatements: true });
    await db.query(`
        CREATE TABLE SafetyVote_Settings(SettingKey VARCHAR(100) PRIMARY KEY,SettingValue TEXT,UpdatedBy VARCHAR(20));
        CREATE TABLE SafetyVote_Files(id BIGINT AUTO_INCREMENT PRIMARY KEY);
        CREATE TABLE SafetyVote_Questions(id BIGINT AUTO_INCREMENT PRIMARY KEY,HelpText VARCHAR(1000));
    `);
    const migration = fs.readFileSync(path.join(root, 'backend', 'migrations', '20261024_safety_vote_question_images.sql'), 'utf8');
    await db.query(migration);
    await db.query(migration);
    const [columns] = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='SafetyVote_Questions' AND COLUMN_NAME IN ('ImageFileID','ImageAltText')", [database]);
    assert.deepStrictEqual(columns.map(row => row.COLUMN_NAME).sort(), ['ImageAltText', 'ImageFileID']);
    const [[indexes]] = await db.query("SELECT COUNT(*) total FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='SafetyVote_Questions' AND INDEX_NAME='idx_sv_question_image'", [database]);
    assert.strictEqual(Number(indexes.total), 1);
    const [[contract]] = await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='question_image_contract'");
    assert.strictEqual(contract.SettingValue, '2026-10-24-safety-vote-question-images-r1');
    console.log('Safety Vote question image migration: PASS (additive, idempotent, indexed)');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    if (db) await db.end();
    if (admin) { if (/^tsh_safety_vote_question_images_test_\d+$/.test(database)) await admin.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin.end(); }
});
