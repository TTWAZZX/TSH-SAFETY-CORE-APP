'use strict';

const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');
const BASE_URL = String(process.env.SAFETY_VOTE_LOCAL_UAT_URL || 'http://127.0.0.1:5000/api').replace(/\/+$/, '');

async function call(pathname, token, options = {}) {
    const response = await fetch(`${BASE_URL}${pathname}`, {
        method: options.method || 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const body = await response.json().catch(() => null);
    return { pathname, status: response.status, code: body?.code || null, message: body?.message || null, data: body?.data || null };
}

(async () => {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(new URL(BASE_URL).hostname), 'Refusing non-loopback API');
    assert(process.env.JWT_SECRET, 'JWT_SECRET is required');
    const { admin, user } = await loadReadyTestUsers(db);
    const [enrollmentColumns] = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_CampaignVersions' AND COLUMN_NAME IN ('EligibilityEnrollmentMode','EligibilityEnrollmentUpdatedAt','EligibilityEnrollmentUpdatedBy')");
    assert.equal(enrollmentColumns.length, 3, 'Eligibility enrollment columns are incomplete');
    const [campaignRows] = await db.query("SELECT c.id,c.CurrentVersionID,v.EligibilityEnrollmentMode,v.EligibilityEnrollmentUpdatedAt,v.EligibilityEnrollmentUpdatedBy FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID WHERE c.id=?", [4]);
    assert.equal(campaignRows.length, 1, 'Campaign 4 is unavailable');
    await db.query('SELECT c.*,v.VersionNo,v.ContractVersion,v.TemplateKey,v.CampaignType,v.PrivacyMode,v.TitleTh,v.TitleEn,v.Summary,v.Description,v.RulesText,v.TimeZone,v.OpenAt,v.CloseAt,v.ResultVisibility,v.PrivacyThreshold,v.MaxParticipationAttempts,v.LiveLeaderboardEnabled,v.LiveLeaderboardTopN,v.LiveLeaderboardScoreMode,v.LiveLeaderboardVisibility,v.LiveLeaderboardRefreshSeconds,v.LiveLeaderboardPrivacyThreshold,v.EligibilityEnrollmentMode,v.EligibilityEnrollmentUpdatedAt,v.EligibilityEnrollmentUpdatedBy,v.Status VersionStatus,v.RowVersion VersionRowVersion FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID WHERE c.id=?', [4]);
    const [eligibilityRules] = await db.query('SELECT id,ValuesJson FROM SafetyVote_EligibilityRules WHERE CampaignVersionID=? ORDER BY id', [campaignRows[0].CurrentVersionID]);
    for (const rule of eligibilityRules) JSON.parse(rule.ValuesJson || '[]');
    const adminToken = jwt.sign(admin, process.env.JWT_SECRET, { expiresIn: '5m' });
    const userToken = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '5m' });
    const checks = [];
    for (const pathname of ['/safety-vote/admin/health', '/safety-vote/admin/campaigns', '/safety-vote/admin/campaigns/4']) checks.push({ ...(await call(pathname, adminToken)), expectedStatus: 200 });
    for (const [pathname, expectedStatus] of [['/safety-vote/me/campaigns', 200], ['/safety-vote/campaigns/4/results', 200], ['/safety-vote/me/nominations', 200], ['/safety-vote/jury/assignments', 403], ['/safety-vote/notifications', 200]]) checks.push({ ...(await call(pathname, userToken)), expectedStatus });
    const failures = checks.filter(check => check.status !== check.expectedStatus);
    assert.deepStrictEqual(failures, [], JSON.stringify(checks.map(({ data, ...check }) => check), null, 2));
    const adminCampaign = checks.find(check => check.pathname === '/safety-vote/admin/campaigns')?.data?.rows?.find(row => Number(row.id) === 4);
    const userCampaign = checks.find(check => check.pathname === '/safety-vote/me/campaigns')?.data?.rows?.find(row => Number(row.id) === 4);
    assert.equal(adminCampaign?.Status, 'Closed', 'Admin catalogue must expose the reconciled Closed status');
    assert.equal(Number(adminCampaign?.PendingDraftVersionNo), 2, 'Admin catalogue must expose pending Draft V2');
    assert.equal(userCampaign?.Status, 'Closed', 'User catalogue must expose the reconciled Closed status');
    assert.equal(userCampaign?.CatalogueVisible, 1, 'Closed campaign must remain company-catalogue visible');
    const publicResult = checks.find(check => check.pathname === '/safety-vote/campaigns/4/results')?.data;
    assert(publicResult, 'Closed campaign result must remain publicly readable to authenticated employees');
    const activationGuard = await call(`/safety-vote/admin/campaigns/4/versions/${adminCampaign.PendingDraftVersionID}/activate`, adminToken, { method: 'POST', body: { confirmation: `ACTIVATE ${adminCampaign.CampaignCode} V${adminCampaign.PendingDraftVersionNo}` } });
    assert.equal(activationGuard.status, 409, JSON.stringify(activationGuard));
    assert.equal(activationGuard.code, 'REVISION_ACTIVATION_WOULD_HIDE_COMPLETED_CAMPAIGN', JSON.stringify(activationGuard));
    const [lifecycleRows] = await db.query("SELECT c.Status,c.ClosedAt,v.Status VersionStatus,(SELECT COUNT(*) FROM SafetyVote_CampaignVersions pending WHERE pending.CampaignID=c.id AND pending.Status='Draft' AND pending.id<>c.CurrentVersionID) PendingDrafts,(SELECT COUNT(*) FROM SafetyVote_AuditLogs a WHERE a.CampaignID=c.id AND a.Action='SAFETY_VOTE_SCHEDULE_CLOSE' AND a.ActorEmployeeID='SYSTEM_SCHEDULE') ScheduleCloseAudits FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID WHERE c.id=?", [4]);
    assert.equal(lifecycleRows.length, 1, 'Campaign 4 lifecycle state is unavailable');
    assert.equal(lifecycleRows[0].Status, 'Closed', 'Past-due campaign 4 was not reconciled to Closed');
    assert(lifecycleRows[0].ClosedAt, 'Closed campaign must retain an authoritative ClosedAt timestamp');
    assert.equal(lifecycleRows[0].VersionStatus, 'Closed', 'Past-due live version was not reconciled to Closed');
    assert.equal(Number(lifecycleRows[0].PendingDrafts), 1, 'Offline Draft revision must remain retained');
    assert.equal(Number(lifecycleRows[0].ScheduleCloseAudits), 1, 'Scheduled close must write exactly one idempotent system audit');
    const [resultRows] = await db.query("SELECT rs.id,rs.Status,rs.AcceptedBallotCount,rs.QuorumState,rs.TieState,COUNT(rr.id) ResultRows,SUM(rr.ResultState='no_result') NoResultRows,SUM(rr.RankNo IS NOT NULL) RankedRows FROM SafetyVote_ResultSnapshots rs LEFT JOIN SafetyVote_ResultRows rr ON rr.ResultSnapshotID=rs.id WHERE rs.CampaignVersionID=? AND rs.CalculationContract='2026-10-25-safety-vote-close-finalization-r1' GROUP BY rs.id ORDER BY rs.SnapshotNo DESC LIMIT 1", [campaignRows[0].CurrentVersionID]);
    assert.equal(resultRows.length, 1, 'Automatic close snapshot is missing');
    assert.equal(resultRows[0].Status, 'Frozen', 'Automatic close snapshot must be immutable');
    assert.equal(Number(resultRows[0].AcceptedBallotCount), 0, 'Local zero-vote fixture changed unexpectedly');
    assert.equal(Number(resultRows[0].NoResultRows), Number(resultRows[0].ResultRows), 'Zero-vote rows must all be explicit no_result rows');
    assert.equal(Number(resultRows[0].RankedRows), 0, 'Zero-vote snapshot must not manufacture a winner rank');
    console.log(JSON.stringify({ decision: 'PASS_LOCAL_SAFETY_VOTE_SCHEDULE_AND_REVISION_UAT', checks: checks.map(check => ({ pathname: check.pathname, status: check.status, expectedStatus: check.expectedStatus })), lifecycle: lifecycleRows[0], activationGuard: { status: activationGuard.status, code: activationGuard.code }, result: resultRows[0], productionConnected: false, mutationScope: 'read-only verification plus blocked activation attempt' }, null, 2));
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    await db.end();
});
