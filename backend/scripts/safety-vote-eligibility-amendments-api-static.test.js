'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const nodeRoute = read('backend/routes/safety-vote-eligibility-amendments.js');
const phpRoute = read('api/handlers/safety_vote_eligibility_amendments.php');
const server = read('backend/server.js');
const phpIndex = read('api/index.php');
const adminUx = read('public/js/pages/admin-safety-vote-ux1.js');
const eligibilityUx = read('public/js/pages/admin-safety-vote-eligibility.js');
const styles = read('public/style.css');
const nodeDiscovery = read('backend/routes/safety-vote-phase2.js');
const nodeDetail = read('backend/routes/safety-vote-phase3.js');
const phpDiscovery = read('api/handlers/safety_vote_phase2.php');
const phpDetail = read('api/handlers/safety_vote_phase3.php');
const userDiscoveryUx = read('public/js/pages/safety-vote-page-ux1.js');

for (const source of [nodeRoute, phpRoute]) {
    assert(source.includes('2026-10-20-safety-vote-eligibility-amendments-r1'));
    assert(source.includes('/eligibility/amendments/preview'));
    assert(source.includes('/eligibility/amendments/apply'));
    assert(source.includes('/eligibility/enrollment-mode'));
    assert(source.includes('ELIGIBILITY_AMENDMENT_DISABLED'));
    assert(source.includes('ELIGIBILITY_PREVIEW_STALE'));
    assert(source.includes('NO_NEW_ELIGIBLE_VOTERS'));
    assert(source.includes('SAFETY_VOTE_ELIGIBILITY_AMENDMENT_APPLIED'));
    assert(source.includes("SnapshotKind") || source.includes("'amendment'"));
    assert(source.includes('PreviousEventHash'));
    assert(source.includes('IdempotencyKeyHash'));
    assert(source.includes('ignoredRemovalCount'));
}
assert(server.includes("require('./routes/safety-vote-eligibility-amendments')"));
assert(phpIndex.includes("handlers/safety_vote_eligibility_amendments.php"));
assert(phpIndex.includes('handle_safety_vote_eligibility_amendment_routes'));
assert(!/DELETE FROM SafetyVote_EligibleVoters/i.test(nodeRoute));
assert(!/DELETE FROM SafetyVote_EligibleVoters/i.test(phpRoute));
assert(adminUx.includes('renderSafetyVoteEligibilityWorkspace'));
assert(adminUx.includes('open-eligibility'));
assert(eligibilityUx.includes('closed_after_open'));
assert(eligibilityUx.includes('admin_approval'));
assert(eligibilityUx.includes('automatic_rule_match'));
assert(eligibilityUx.includes("'Idempotency-Key'"));
assert(eligibilityUx.includes('ELIGIBILITY_PREVIEW_STALE'));
assert(styles.includes('.sve-shell'));
for (const source of [nodeDiscovery, nodeDetail, phpDiscovery, phpDetail]) {
    assert(source.includes('latest_frozen_snapshot'));
    assert(source.includes('ORDER BY SnapshotNo DESC,id DESC LIMIT 1') || source.includes('MAX(SnapshotNo) SnapshotNo'));
}
assert(nodeDiscovery.includes('EligibilitySnapshotID'));
assert(phpDiscovery.includes('EligibilitySnapshotID'));
assert(userDiscoveryUx.includes('refreshDiscoveryFromLatestSnapshot'));
assert(userDiscoveryUx.includes("window.addEventListener('focus'"));
assert(userDiscoveryUx.includes("document.addEventListener('visibilitychange'"));

console.log('Safety Vote eligibility amendment API/Admin UI static contract: PASS (status-aware policy, latest-snapshot discovery parity, stale-preview guard, idempotency, add-only lineage and audit)');
