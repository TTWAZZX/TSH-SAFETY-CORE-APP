'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const databaseName = `tsh_safety_vote_release_policy_${stamp}`;
const databaseGuard = /^tsh_safety_vote_release_policy_\d+_\d+$/;

async function main() {
    assert(['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST).toLowerCase()), 'Disposable migration test requires a loopback database');
    assert(databaseGuard.test(databaseName));
    const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    try {
        await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName, multipleStatements: true });
        try {
            await connection.query("CREATE TABLE SafetyVote_Settings(SettingKey VARCHAR(120) PRIMARY KEY,SettingValue TEXT NOT NULL,UpdatedBy VARCHAR(50),UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);CREATE TABLE SafetyVote_CampaignVersions(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,OfficialResultTopN INT NOT NULL DEFAULT 5,CreatedBy VARCHAR(20),UpdatedBy VARCHAR(20));");
            const migration = fs.readFileSync(path.join(root, 'backend', 'migrations', '20261025_safety_vote_result_release_policy.sql'), 'utf8');
            const rollback = fs.readFileSync(path.join(root, 'backend', 'migrations', '20261025_safety_vote_result_release_policy.rollback.sql'), 'utf8');
            await connection.query(migration);
            await connection.query(migration);
            const [[columnCount]] = await connection.query("SELECT COUNT(*) total FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_CampaignVersions' AND COLUMN_NAME='ResultReleasePolicy'");
            assert.strictEqual(Number(columnCount.total), 1);
            await connection.query("INSERT INTO SafetyVote_CampaignVersions(ResultReleasePolicy,CreatedBy,UpdatedBy) VALUES('automatic','test','test')");
            await connection.query(rollback);
            const [[retained]] = await connection.query('SELECT ResultReleasePolicy FROM SafetyVote_CampaignVersions LIMIT 1');
            const [[marker]] = await connection.query("SELECT COUNT(*) total FROM SafetyVote_Settings WHERE SettingKey='result_release_policy_contract'");
            assert.strictEqual(retained.ResultReleasePolicy, 'automatic');
            assert.strictEqual(Number(marker.total), 0);
        } finally {
            await connection.end();
        }
    } finally {
        if (databaseGuard.test(databaseName)) await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        await admin.end();
    }
    console.log('Safety Vote result release policy additive/idempotent migration and data-preserving rollback: PASS');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
