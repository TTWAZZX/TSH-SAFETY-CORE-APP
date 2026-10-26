'use strict';

const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');
const base = String(process.env.SAFETY_VOTE_LOCAL_UAT_URL || 'http://127.0.0.1:5000/api').replace(/\/+$/, '');

async function call(pathname, token = null, options = {}) {
    const response = await fetch(`${base}${pathname}`, {
        method: options.method || 'GET',
        headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => null);
    return { status: response.status, code: payload?.code || null, data: payload?.data || null };
}

(async () => {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(new URL(base).hostname), 'Refusing non-loopback API');
    assert(process.env.JWT_SECRET, 'JWT_SECRET is required');
    const { admin, user } = await loadReadyTestUsers(db);
    const adminToken = jwt.sign(admin, process.env.JWT_SECRET, { expiresIn: '5m' });
    const userToken = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '5m' });
    const [[before]] = await db.query('SELECT COUNT(*) ballots FROM SafetyVote_Ballots');
    const [[publishedFixture = null]] = await db.query(`
        SELECT c.id
          FROM SafetyVote_Campaigns c
          JOIN SafetyVote_ResultSnapshots rs ON rs.CampaignID=c.id AND rs.Status='Published'
         WHERE c.Status IN ('Closed','Certified','Published')
           AND c.IsHidden=0 AND c.IsTest=0
         ORDER BY c.id
         LIMIT 1
    `);
    const campaignId = publishedFixture ? Number(publishedFixture.id) : null;

    const anonymousCatalogue = await call('/safety-vote/me/campaigns');
    const anonymousResult = campaignId ? await call(`/safety-vote/campaigns/${campaignId}/official-results`) : null;
    const userCatalogue = await call('/safety-vote/me/campaigns', userToken);
    const userDetail = campaignId ? await call(`/safety-vote/campaigns/${campaignId}`, userToken) : null;
    const userResult = campaignId ? await call(`/safety-vote/campaigns/${campaignId}/official-results`, userToken) : null;
    const userAdminBoundary = await call('/safety-vote/admin/company-visibility-remediation/preview', userToken);
    const closedMutation = campaignId ? await call(`/safety-vote/campaigns/${campaignId}/ballot/submit`, userToken, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'phase7-final-closed-denial-0001' },
        body: { campaignVersion: 1, acknowledgedRules: true, answers: [] },
    }) : null;
    const adminHealth = await call('/safety-vote/admin/health', adminToken);
    const adminPreview = await call('/safety-vote/admin/company-visibility-remediation/preview', adminToken);
    const [[after]] = await db.query('SELECT COUNT(*) ballots FROM SafetyVote_Ballots');

    assert.equal(anonymousCatalogue.status, 401, 'Anonymous catalogue access must be denied');
    assert.equal(userCatalogue.status, 200, 'Authenticated company catalogue is unavailable');
    assert.equal(userCatalogue.data?.catalogueMode, 'company_authenticated');
    assert.equal(userAdminBoundary.status, 403, 'Ordinary user crossed the Admin remediation boundary');
    if (campaignId) {
        assert.equal(anonymousResult.status, 401, 'Anonymous official-result access must be denied');
        const card = userCatalogue.data?.rows?.find(row => Number(row.id) === campaignId);
        assert(card, `Published campaign ${campaignId} is missing from the company catalogue`);
        assert.equal(card.DiscoveryMode, 'public_listing');
        assert.equal(Number(card.CatalogueVisible), 1);
        assert.equal(userDetail.status, 200, 'Authenticated campaign detail is unavailable');
        assert.equal(userResult.status, 200, 'Published official results are unavailable');
        assert.equal(userResult.data?.source, 'immutable_result_snapshot');
        assert.equal(userResult.data?.snapshot?.status, 'Published');
        assert.match(String(userResult.data?.snapshot?.resultHash || ''), /^[0-9a-f]{64}$/i);
        assert.equal(userResult.data?.identityFieldsIncluded, false);
        assert([403, 409, 422].includes(closedMutation.status), `Closed campaign mutation returned ${closedMutation.status}`);
    }
    assert.equal(Number(after.ballots), Number(before.ballots), 'Denied closed-campaign mutation changed ballot evidence');
    assert.equal(adminHealth.status, 200, 'Admin Safety Vote health is unavailable');
    assert.equal(adminHealth.data?.visibilityContract?.enabled, true, 'Company visibility contract is not enabled');
    assert.equal(adminPreview.status, 200, 'Admin remediation preview is unavailable');
    assert.equal(adminPreview.data?.businessMutation, false);
    assert.equal(Number(adminPreview.data?.counts?.remediate), 0, 'Admin preview still has remediation candidates');

    console.log(JSON.stringify({
        decision: 'PASS_LOCAL_COMPANY_WIDE_VISIBILITY_FINAL_API',
        productionConnected: false,
        externalDelivery: false,
        checks: {
            anonymousCatalogue: anonymousCatalogue.status,
            anonymousOfficialResult: anonymousResult?.status ?? 'NO_PUBLISHED_FIXTURE',
            authenticatedCatalogue: userCatalogue.status,
            authenticatedDetail: userDetail?.status ?? 'NO_PUBLISHED_FIXTURE',
            immutableOfficialResult: userResult?.status ?? 'NO_PUBLISHED_FIXTURE',
            ordinaryUserAdminBoundary: userAdminBoundary.status,
            closedMutationDenied: closedMutation?.status ?? 'NO_PUBLISHED_FIXTURE',
            adminHealth: adminHealth.status,
            remediationPreview: adminPreview.status,
        },
        publishedFixtureCampaignId: campaignId,
        officialResult: userResult ? {
            snapshotStatus: userResult.data.snapshot.status,
            noResult: userResult.data.noResult,
            identityFieldsIncluded: userResult.data.identityFieldsIncluded,
        } : null,
        ballotsBefore: Number(before.ballots),
        ballotsAfter: Number(after.ballots),
    }, null, 2));
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    await db.end();
});
