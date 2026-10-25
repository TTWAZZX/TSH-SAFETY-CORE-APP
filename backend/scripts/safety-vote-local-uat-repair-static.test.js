'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const admin = read('public/js/pages/admin-safety-vote-ux1.js');
const detail = admin.slice(admin.indexOf('function detailMarkup(row)'), admin.indexOf('function campaignWorkspaceMarkup'));
assert(detail.includes('const liveJuryAction ='), 'live Jury action must be scoped inside detailMarkup');

const nodeHealth = read('backend/routes/safety-vote.js');
const phpHealth = read('api/handlers/safety_vote.php');
for (const marker of ['MaxParticipationAttempts', 'EligibilityEnrollmentMode', 'missingColumns']) {
    assert(nodeHealth.includes(marker), `Node schema health must verify ${marker}`);
    assert(phpHealth.includes(marker), `PHP schema health must verify ${marker}`);
}

const localControl = read('backend/scripts/safety-vote-local-uat-control.js');
for (const migration of ['20261008_safety_vote_phase6_secret_election.sql', '20261008_safety_vote_phase7_integrations_governance.sql', '20261016_safety_vote_participation_attempts.sql']) {
    assert(localControl.includes(migration), `Local UAT activation must include ${migration}`);
}

const storage = read('backend/storage.js');
const server = read('backend/server.js');
const phpBootstrap = read('api/bootstrap.php');
const phpIndex = read('api/index.php');
assert(storage.includes('function availablePublicUploadUrl') && server.includes('availablePublicUploadUrl(branding.logoUrl)'), 'Node must suppress missing Local public assets');
assert(phpBootstrap.includes('function available_upload_public_url') && phpIndex.includes("available_upload_public_url($branding['logoUrl']"), 'PHP must suppress missing Local public assets');

const index = read('index.html');
const main = read('public/js/main.js');
const adminEntry = read('public/js/pages/admin.js');
for (const source of [index, main, adminEntry]) assert(source.includes('20261025-schedule-revision-r1'), 'Frontend cache chain must use the current Safety Vote release key');

console.log('Safety Vote Local UAT repair static contract: PASS (schema drift, live Jury action, missing assets, cache chain)');
