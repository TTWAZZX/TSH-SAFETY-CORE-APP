'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const loopback = new Set(['localhost', '127.0.0.1', '::1']);
const activateLocal = process.argv.includes('--activate-local');
const activateRemovalLocal = process.argv.includes('--activate-removal-local');

(async () => {
    assert(loopback.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Refusing non-loopback database');
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, multipleStatements: true });
    try {
        const [[baseline]] = await db.query("SELECT COUNT(*) total FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('SafetyVote_Settings','SafetyVote_Campaigns','SafetyVote_CampaignVersions','SafetyVote_EligibilitySnapshots','SafetyVote_EligibleVoters','SafetyVote_AuditLogs')");
        assert.equal(Number(baseline.total), 6, `Safety Vote foundation is incomplete in configured Local database ${process.env.DB_NAME}; restore or migrate the foundation before applying eligibility amendments`);
        const [[before]] = await db.query('SELECT (SELECT COUNT(*) FROM SafetyVote_Campaigns) campaigns,(SELECT COUNT(*) FROM SafetyVote_CampaignVersions) versions,(SELECT COUNT(*) FROM SafetyVote_EligibilitySnapshots) snapshots,(SELECT COUNT(*) FROM SafetyVote_EligibleVoters) voters,(SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_AuditLogs) audits');
        const [beforeGates] = await db.query("SELECT SettingKey,SettingValue FROM SafetyVote_Settings WHERE SettingKey IN ('eligibility_amendment_enabled','eligibility_removal_enabled')");
        const beforeGateValue = key => String(beforeGates.find(row => row.SettingKey === key)?.SettingValue || '0');
        const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261020_safety_vote_eligibility_amendments.sql'), 'utf8');
        const removalMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261024_safety_vote_eligibility_removal_policy.sql'), 'utf8');
        await db.query(migration);
        await db.query(migration);
        await db.query(removalMigration);
        await db.query(removalMigration);
        if (activateLocal) await db.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='local-explicit-activation' WHERE SettingKey='eligibility_amendment_enabled'");
        if (activateRemovalLocal) await db.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='local-explicit-removal-activation' WHERE SettingKey='eligibility_removal_enabled'");
        const [[after]] = await db.query('SELECT (SELECT COUNT(*) FROM SafetyVote_Campaigns) campaigns,(SELECT COUNT(*) FROM SafetyVote_CampaignVersions) versions,(SELECT COUNT(*) FROM SafetyVote_EligibilitySnapshots) snapshots,(SELECT COUNT(*) FROM SafetyVote_EligibleVoters) voters,(SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_AuditLogs) audits');
        assert.deepStrictEqual(Object.values(after).map(Number), Object.values(before).map(Number), 'protected business rows changed');
        const [[tables]] = await db.query("SELECT COUNT(*) total FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('SafetyVote_EligibilityAmendments','SafetyVote_EligibilityAmendmentMembers','SafetyVote_EligibilityAmendmentEvents')");
        const [versionColumns] = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_CampaignVersions' AND COLUMN_NAME LIKE 'EligibilityEnrollment%'");
        const [snapshotColumns] = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_EligibilitySnapshots' AND COLUMN_NAME IN ('ParentSnapshotID','SnapshotKind')");
        const [[gate]] = await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='eligibility_amendment_enabled'");
        const [[removalGate]] = await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='eligibility_removal_enabled'");
        assert.equal(Number(tables.total), 3);
        assert.equal(versionColumns.length, 3);
        assert.equal(snapshotColumns.length, 2);
        assert.equal(gate.SettingValue, activateLocal ? '1' : beforeGateValue('eligibility_amendment_enabled'));
        assert.equal(removalGate.SettingValue, activateRemovalLocal ? '1' : beforeGateValue('eligibility_removal_enabled'));
        console.log(JSON.stringify({ decision: activateRemovalLocal ? 'PASS_LOCAL_ELIGIBILITY_REMOVAL_ACTIVATED' : activateLocal ? 'PASS_LOCAL_ELIGIBILITY_AMENDMENT_ACTIVATED' : 'PASS_LOCAL_ELIGIBILITY_AMENDMENT_SCHEMA', host: 'loopback', tables: 3, featureEnabled: gate.SettingValue === '1', removalFeatureEnabled: removalGate.SettingValue === '1', removalPolicy: 'unstarted_only', protectedRows: Object.fromEntries(Object.entries(after).map(([key, value]) => [key, Number(value)])), protectedRowsUnchanged: true, productionConnected: false }));
    } finally {
        await db.end();
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
