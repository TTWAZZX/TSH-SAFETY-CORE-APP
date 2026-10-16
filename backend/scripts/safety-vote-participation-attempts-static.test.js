'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const contract = require('../services/safety-vote-phase1');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let checks = 0;
const ok = (value, message) => { assert(value, message); checks += 1; };

const campaigns = [
    { campaignCode: 'SHE-001-2026', titleTh: 'Default', campaignType: 'popular_vote', privacyMode: 'identified' },
    { campaignCode: 'SHE-002-2026', titleTh: 'Repeat', campaignType: 'popular_vote', privacyMode: 'confidential', maxParticipationAttempts: 3 },
    { campaignCode: 'SHE-003-2026', titleTh: 'Too many', campaignType: 'popular_vote', privacyMode: 'anonymous', maxParticipationAttempts: 11 },
    { campaignCode: 'SHE-004-2026', titleTh: 'Secret repeat', campaignType: 'secret_election', privacyMode: 'secret_ballot', maxParticipationAttempts: 2 },
];
const node = campaigns.map(row => contract.normalizeCampaign(row));
ok(node[0].ok && node[0].value.maxParticipationAttempts === 1, 'existing campaigns default to one attempt');
ok(node[1].ok && node[1].value.maxParticipationAttempts === 3, 'identified/confidential campaigns accept repeat attempts');
ok(!node[2].ok && node[2].errors.some(row => row.code === 'INVALID_RANGE'), 'attempt limit is bounded to 1-10');
ok(!node[3].ok && node[3].errors.some(row => row.code === 'SECRET_BALLOT_SINGLE_ATTEMPT_REQUIRED'), 'secret ballot remains one attempt');

const php = spawnSync(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', [path.join(root, 'api', 'tests', 'safety_vote_phase1_fixture_runner.php')], {
    input: JSON.stringify({ campaigns, rules: [], employees: [], hashInput: {} }), encoding: 'utf8', windowsHide: true,
});
assert.strictEqual(php.status, 0, php.stderr || 'PHP fixture runner failed');
ok(JSON.stringify(JSON.parse(php.stdout).campaigns) === JSON.stringify(node), 'Node/PHP attempt policy normalization parity');

const nodeRoute = read('backend/routes/safety-vote-phase3.js');
const phpRoute = read('api/handlers/safety_vote_phase3.php');
const nodeList = read('backend/routes/safety-vote-phase2.js');
const phpList = read('api/handlers/safety_vote_phase2.php');
const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
const user = read('public/js/pages/safety-vote-page-ux1.js');
const migration = read('backend/migrations/20261016_safety_vote_participation_attempts.sql');

for (const route of [nodeRoute, phpRoute]) {
    ok(route.includes('PARTICIPATION_LIMIT_REACHED'), 'server enforces exhausted attempts');
    ok(route.includes('MaxParticipationAttempts'), 'server reads campaign attempt policy');
    ok(route.includes('RemainingAttempts'), 'server exposes remaining attempts');
    ok(route.includes('SECRET_BALLOT_SINGLE_ATTEMPT_REQUIRED'), 'server protects secret ballot single-attempt contract');
    ok(route.includes("['identified','confidential']") || route.includes("['identified', 'confidential']"), 'own answers are restricted to attributable privacy modes');
}
for (const list of [nodeList, phpList]) {
    ok(list.includes('AttemptCount') && list.includes('MaxParticipationAttempts'), 'campaign list exposes attempt status');
}
ok(wizard.includes('maxParticipationAttempts') && wizard.includes('/participation-policy'), 'wizard saves the attempt policy');
ok(user.includes('ทำแล้ว ${Math.min(attemptCount, maxAttempts)}/${maxAttempts} ครั้ง'), 'campaign card shows completed attempts');
ok(user.includes('คำตอบที่คุณส่ง') && user.includes('new-attempt'), 'post-submit history and next-attempt action are present');
ok(user.includes('ไม่ระบุตัวตนหรือบัตรลงคะแนนลับ'), 'privacy-safe receipt-only explanation is present');
ok(migration.includes('ADD COLUMN IF NOT EXISTS MaxParticipationAttempts') && migration.includes('DEFAULT 1'), 'migration is additive and preserves one-attempt default');

console.log(`Safety Vote participation attempts static/security + Node/PHP parity: PASS (${checks} assertions)`);
