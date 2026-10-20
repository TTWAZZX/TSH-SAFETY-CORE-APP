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
const operationsUx = read('public/js/pages/admin-safety-vote-operations.js');
const nodeOperations = read('backend/routes/safety-vote-phase5.js');
const phpOperations = read('api/handlers/safety_vote_phase5.php');

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
    assert(source.includes('SAFETY_VOTE_ELIGIBILITY_AUTO_ENROLLED'));
    assert(source.includes('participant_access'));
    assert(source.includes('automaticOnParticipantAccess'));
    assert(source.includes('eligibility_granted'));
    assert(source.includes('automatic_eligibility_granted'));
    assert(source.includes('internal_auto_enrollment'));
    assert(source.includes('CAMPAIGN_RULE_MATCH'));
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
for (const source of [nodeDiscovery, nodeDetail, phpDiscovery, phpDetail]) assert(source.includes('autoEnrollEligibleMember') || source.includes('svam_auto_enroll'));
assert(nodeDiscovery.includes("v.EligibilityEnrollmentMode='automatic_rule_match'"));
assert(phpDiscovery.includes("v.EligibilityEnrollmentMode='automatic_rule_match'"));
assert(eligibilityUx.includes('ระบบเพิ่มผู้ใช้ที่เข้าเงื่อนไขอัตโนมัติ'));
assert(nodeDiscovery.includes('EligibilitySnapshotID'));
assert(phpDiscovery.includes('EligibilitySnapshotID'));
assert(userDiscoveryUx.includes('refreshDiscoveryFromLatestSnapshot'));
assert(userDiscoveryUx.includes("window.addEventListener('focus'"));
assert(userDiscoveryUx.includes("document.addEventListener('visibilitychange'"));
assert(userDiscoveryUx.includes('automaticEligibilityNoticeMarkup'));
assert(userDiscoveryUx.includes('ได้รับสิทธิ์อัตโนมัติ'));
assert(userDiscoveryUx.includes('มีสิทธิ์เข้าร่วม'));
assert(userDiscoveryUx.includes('แอดมินเพิ่มสิทธิ์ให้'));
assert(userDiscoveryUx.includes('ดูรายละเอียดเท่านั้น'));
assert(userDiscoveryUx.includes('eligibilityBadgeMarkup'));
assert(userDiscoveryUx.includes("eligibility_granted: 'ได้รับสิทธิ์ใหม่'"));
assert(styles.includes('.svp-eligibility-granted'));
assert(styles.includes('.svp-auto-eligibility-chip'));
assert(styles.includes('.svp-eligibility-chip.is-initial_snapshot'));
for (const source of [nodeDiscovery, phpDiscovery]) {
    assert(source.includes('EligibilityInclusionSource'));
    assert(source.includes('EligibilityOrigin'));
    assert(source.includes('initial_snapshot'));
    assert(source.includes('admin_amendment'));
    assert(source.includes('public_listing'));
}
for (const source of [nodeDetail, phpDetail]) {
    assert(source.includes('InclusionSource'));
    assert(source.includes('eligibilityOrigin'));
    assert(source.includes('initial_snapshot'));
    assert(source.includes('admin_amendment'));
}
for (const source of [nodeOperations, phpOperations]) {
    assert(source.includes('automaticToday'));
    assert(source.includes('adminAppliedTotal'));
    assert(source.includes('eligibilityAdmissions'));
}
assert(operationsUx.includes('eligibilityAdmissionsMarkup'));
assert(operationsUx.includes('SAFETY_VOTE_ELIGIBILITY_AUTO_ENROLLED'));

console.log('Safety Vote eligibility amendment API/Admin UI static contract: PASS (automatic on-access enrollment, Node/PHP parity, concurrency guard, add-only snapshot lineage and audit)');
