'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const mysql = require('mysql2/promise');
const remediation = require('../services/safety-vote-company-visibility-remediation');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const config = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
};
const loopback = new Set(['localhost', '127.0.0.1', '::1']);
const lifecycle = ['Scheduled', 'Open', 'Closed', 'Certified', 'Published'];
const count = value => Number(value || 0);

(async () => {
    assert(loopback.has(String(config.host || '').trim().toLowerCase()), 'Refusing non-loopback database');
    const db = await mysql.createConnection(config);
    try {
        const [settingRows] = await db.query("SELECT SettingKey,SettingValue FROM SafetyVote_Settings WHERE SettingKey IN ('module_enabled','company_wide_campaign_visibility_enabled','company_wide_campaign_visibility_contract','company_visibility_remediation_enabled','company_visibility_remediation_contract','phase7_integrations_enabled')");
        const settings = Object.fromEntries(settingRows.map(row => [row.SettingKey, String(row.SettingValue)]));
        assert.equal(settings.module_enabled, '1', 'Safety Vote Local UAT module is disabled');
        assert.equal(settings.company_wide_campaign_visibility_enabled, '1', 'Company-wide visibility gate is disabled');
        assert.equal(settings.company_wide_campaign_visibility_contract, '2026-10-24-company-wide-campaign-visibility-r1');
        assert.equal(settings.company_visibility_remediation_enabled, '1', 'Remediation gate is disabled');
        assert.equal(settings.company_visibility_remediation_contract, remediation.CONTRACT);
        assert(['0', '1'].includes(settings.phase7_integrations_enabled), 'Phase 7 integration governance setting is invalid');

        const [campaigns] = await db.query('SELECT c.id,c.CampaignCode,c.Status,c.DiscoveryMode,c.RowVersion,c.IsHidden,c.IsTest,v.TitleTh FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID ORDER BY c.id');
        const plan = remediation.buildPlan(campaigns);
        assert.equal(plan.counts.remediate, 0, `Legacy visibility candidates remain: ${plan.counts.remediate}`);
        const discoverable = campaigns.filter(row => lifecycle.includes(String(row.Status)) && count(row.IsHidden) === 0 && count(row.IsTest) === 0);
        assert(discoverable.length > 0, 'No published-lifecycle Local campaign is available for acceptance');
        assert.deepStrictEqual(discoverable.filter(row => row.DiscoveryMode !== 'public_listing').map(row => row.CampaignCode), [], 'Published-lifecycle campaigns must be stored as company-wide after remediation');

        const [[evidence]] = await db.query("SELECT (SELECT COUNT(*) FROM SafetyVote_EligibilitySnapshots) eligibilitySnapshots,(SELECT COUNT(*) FROM SafetyVote_EligibleVoters) eligibleVoters,(SELECT COUNT(*) FROM SafetyVote_Participation) participation,(SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_BallotAnswers) answers,(SELECT COUNT(*) FROM SafetyVote_JuryAssignments) juryAssignments,(SELECT COUNT(*) FROM SafetyVote_JuryScores) juryScores,(SELECT COUNT(*) FROM SafetyVote_ResultSnapshots) resultSnapshots,(SELECT COUNT(*) FROM SafetyVote_ResultRows) resultRows,(SELECT COUNT(*) FROM SafetyVote_Certifications) certifications,(SELECT COUNT(*) FROM SafetyVote_Reports) reports");
        const protectedCounts = Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, count(value)]));
        assert(protectedCounts.eligibilitySnapshots > 0 && protectedCounts.eligibleVoters > 0, 'Eligibility evidence is unavailable');
        assert(protectedCounts.resultSnapshots > 0 && protectedCounts.resultRows > 0, 'Immutable result evidence is unavailable');

        const [[integrity]] = await db.query("SELECT COUNT(*) snapshots,SUM(ResultHash IS NULL OR ResultHash NOT REGEXP '^[0-9a-fA-F]{64}$') invalidResultHashes,SUM(Status NOT IN ('Frozen','Certified','Published','Superseded','Voided')) invalidStatuses FROM SafetyVote_ResultSnapshots");
        assert.equal(count(integrity.invalidResultHashes), 0, 'A result snapshot has an invalid result hash');
        assert.equal(count(integrity.invalidStatuses), 0, 'A result snapshot has an unsupported state');
        const [resultGovernanceRows] = await db.query("SELECT c.CampaignCode,c.Status campaignStatus,v.ResultVisibility,rs.SnapshotNo,rs.Status snapshotStatus FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID LEFT JOIN SafetyVote_ResultSnapshots rs ON rs.CampaignID=c.id AND rs.CampaignVersionID=c.CurrentVersionID WHERE c.Status IN ('Closed','Certified','Published') AND c.IsHidden=0 AND c.IsTest=0 ORDER BY c.id,rs.SnapshotNo DESC");

        const [[remediationEvidence]] = await db.query("SELECT (SELECT COUNT(*) FROM SafetyVote_VisibilityRemediationBatches WHERE Status='Applied') batches,(SELECT COUNT(*) FROM SafetyVote_VisibilityRemediationItems WHERE Status='Applied') items,(SELECT COUNT(*) FROM SafetyVote_AuditLogs WHERE Action='SAFETY_VOTE_COMPANY_VISIBILITY_REMEDIATED') audits");
        assert(count(remediationEvidence.batches) >= 1, 'Applied remediation batch evidence is missing');
        assert(count(remediationEvidence.items) >= 1, 'Applied remediation item evidence is missing');
        assert(count(remediationEvidence.audits) >= count(remediationEvidence.items), 'Remediation audit evidence is incomplete');

        assert.notEqual(String(process.env.SAFETY_VOTE_PHASE7_ADAPTER_MODE || '').toLowerCase(), 'fixture', 'Local acceptance must not enable the fixture delivery adapter');
        assert.notEqual(String(process.env.SAFETY_VOTE_NOTIFICATION_TRANSPORT || '').toLowerCase(), 'fixture', 'Local acceptance must not enable notification delivery');
        assert.notEqual(String(process.env.SAFETY_VOTE_NOTIFICATION_TRANSPORT || '').toLowerCase(), 'production', 'Production notification transport must not be enabled during Local acceptance');
        console.log(JSON.stringify({
            decision: 'PASS_LOCAL_COMPANY_WIDE_VISIBILITY_FINAL_STATE',
            databaseHost: config.host,
            productionConnected: false,
            externalDelivery: false,
            settings: {
                moduleEnabled: true,
                visibilityEnabled: true,
                remediationEnabled: true,
                integrationGovernanceEnabled: settings.phase7_integrations_enabled === '1',
                externalAdapterConfigured: false,
            },
            campaigns: {
                total: campaigns.length,
                discoverable: discoverable.length,
                remainingRemediationCandidates: plan.counts.remediate,
                excluded: plan.counts.excluded,
            },
            protectedCounts,
            resultIntegrity: {
                snapshots: count(integrity.snapshots),
                invalidResultHashes: 0,
                invalidStatuses: 0,
            },
            resultGovernance: resultGovernanceRows.map(row => ({
                campaignCode: row.CampaignCode,
                campaignStatus: row.campaignStatus,
                resultVisibility: row.ResultVisibility,
                snapshotNo: row.SnapshotNo == null ? null : count(row.SnapshotNo),
                snapshotStatus: row.snapshotStatus || null,
            })),
            remediationEvidence: Object.fromEntries(Object.entries(remediationEvidence).map(([key, value]) => [key, count(value)])),
        }, null, 2));
    } finally {
        await db.end();
    }
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
