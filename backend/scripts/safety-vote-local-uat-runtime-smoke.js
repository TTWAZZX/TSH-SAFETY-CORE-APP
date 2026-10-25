'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);
const db = require('../db');
const safetyVote = require('../routes/safety-vote');

(async () => {
    assert(LOOPBACK.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Refusing non-loopback database');
    const health = await safetyVote.schemaHealth();
    assert.equal(health.ready, true, JSON.stringify(health));
    assert.equal(health.moduleEnabled, true, 'Safety Vote module is disabled');
    assert.equal(health.capabilities?.questionImages, true, 'Question images capability is unavailable');
    assert.equal(health.capabilities?.candidateSubmissionGallery, true, 'Candidate/submission gallery capability is unavailable');
    assert.equal(health.capabilities?.companyWideCampaignVisibility, true, 'Company-wide catalogue capability is unavailable');
    const [settings] = await db.query(
        "SELECT SettingKey,SettingValue FROM SafetyVote_Settings WHERE SettingKey IN ('engagement_enabled','phase7_integrations_enabled','eligibility_amendment_enabled','eligibility_removal_enabled') ORDER BY SettingKey"
    );
    const gates = Object.fromEntries(settings.map(row => [row.SettingKey, String(row.SettingValue) === '1']));
    for (const [gate, enabled] of Object.entries(gates)) assert.equal(enabled, true, `${gate} is disabled`);
    console.log(JSON.stringify({
        decision: 'PASS_LOCAL_SAFETY_VOTE_RUNTIME_READY_FOR_UAT',
        health,
        gates,
        clientFlagsRequired: { safetyVoteUxV1: true, safetyVoteEngagementV1: true },
        externalDeliveryEnabled: false,
        productionConnected: false,
    }, null, 2));
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    await db.end();
});
