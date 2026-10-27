'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const nodeFoundation = read('backend/routes/safety-vote.js');
const nodeLifecycle = read('backend/routes/safety-vote-phase2.js');
const nodeResults = read('backend/routes/safety-vote-phase4.js');
const nodeFinalizer = read('backend/services/safety-vote-result-finalization.js');
const nodeVersions = read('backend/routes/safety-vote-phase10-4.js');
const phpFoundation = read('api/handlers/safety_vote.php');
const phpLifecycle = read('api/handlers/safety_vote_phase2.php');
const phpResults = read('api/handlers/safety_vote_phase4.php');
const phpFinalizer = read('api/lib/safety_vote_phase4.php');
const phpVersions = read('api/handlers/safety_vote_phase10_4.php');
const memberPage = read('public/js/pages/safety-vote-page-ux1.js');
const main = read('public/js/main.js');

assert(nodeFoundation.includes('finalizePopularVote'), 'Node scheduled close must invoke automatic finalization');
assert(phpFoundation.includes('sv4_finalize_closed_popular_vote'), 'PHP scheduled close must invoke automatic finalization');
for (const source of [nodeLifecycle, phpLifecycle]) {
    assert(source.includes('close-early'), 'Admin early-close route is missing');
    assert(source.includes('CLOSE '), 'Early close exact-confirmation contract is missing');
    assert(source.includes('resultFinalization'), 'Early-close response must disclose finalization outcome');
}
for (const source of [nodeFinalizer, phpFinalizer]) {
    assert(source.includes('2026-10-25-safety-vote-close-finalization-r1'), 'Node/PHP finalization contract mismatch');
    assert(source.includes('no_result'), 'Zero-vote result must be explicit');
    assert(source.includes('noResult'), 'Zero-vote response disclosure is missing');
}
for (const source of [nodeResults, phpResults]) {
    assert(source.includes('Quorum remains a disclosed advisory'), 'Quorum must not block certification');
    assert(source.includes("denominator") && source.includes("'no_result'"), 'Zero-vote ranking guard is missing');
}
for (const source of [nodeVersions, phpVersions]) {
    assert(source.includes('REVISION_ACTIVATION_WOULD_HIDE_COMPLETED_CAMPAIGN'), 'Completed-campaign catalogue preservation guard is missing');
}
assert(/20261027-safety-vote-(?:gallery-(?:lightbox-r1|choice-r2|bounded-r3)|jury-work-media-r1)/.test(read('index.html')), 'Frontend release cache key is stale');
assert(memberPage.includes('data-svp-official-results') && memberPage.includes('/official-results'), 'Closed campaign immutable official results are not rendered for members');
assert(memberPage.includes('ไม่มีบัตรที่ระบบรับรอง') && memberPage.includes('ไม่มีการจัดอันดับหรือสร้างผู้ชนะ'), 'Zero-vote public disclosure is missing');
assert(main.includes("replace(/^#\\/?/, '')"), 'Hash routes must accept both #safety-vote and #/safety-vote');

console.log('Safety Vote close/finalization/catalogue preservation static contract: PASS');
