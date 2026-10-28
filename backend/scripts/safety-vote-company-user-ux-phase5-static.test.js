'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const nodeRoute = read('backend/routes/safety-vote-phase5.js');
const phpRoute = read('api/handlers/safety_vote_phase5.php');
const phpIndex = read('api/index.php');
const nodeModel = read('backend/services/safety-vote-phase5.js');
const phpModel = read('api/lib/safety_vote_phase5.php');
const page = read('public/js/pages/safety-vote-page-ux1.js');
const participationModel = read('public/js/pages/safety-vote-participation-model.mjs');
const style = read('public/style.css');
const index = read('index.html');

for (const source of [nodeRoute, phpRoute]) {
    assert(source.includes('/safety-vote/campaigns/:id/official-results') || source.includes("'/campaigns/:id/official-results'"), 'authenticated member official-result route is missing');
    assert(source.includes('SafetyVote_ResultSnapshots'), 'official results must read an immutable result snapshot');
    assert(source.includes('CampaignVersionID'), 'official results must stay on the current campaign version');
    assert(source.includes('SafetyVote_ResultRows'), 'official result rows are missing');
    const officialBlock = source.slice(source.indexOf('official-results'), source.indexOf('official-results') + 5000);
    assert(!officialBlock.includes('SafetyVote_Ballots'), 'member official results must not recompute from mutable ballots');
}
for (const source of [nodeModel, phpModel]) {
    for (const marker of ['MEMBER_RESULTS_CONTRACT', 'immutable_result_snapshot', 'company_authenticated_aggregate', 'CAMPAIGN_NOT_PUBLIC', 'RESULT_NOT_PUBLISHED', 'certified_only']) assert(source.includes(marker), `official result contract missing ${marker}`);
    assert(source.includes('identityFieldsIncluded') && source.includes('false'), 'member result model must exclude identity fields');
}
assert(phpIndex.includes('handle_safety_vote_member_results_route($method, $path);'), 'PHP member route is not registered');
for (const marker of ['แคมเปญทั้งหมด', 'เปิดดูรายละเอียดได้ · ไม่มีสิทธิ์ลงคะแนน', 'ดูผลกิจกรรม', '/official-results', 'data-svp-result-source="immutable-snapshot"', 'Result SHA-256', "data-sv-company-user-ux', 'phase5'"]) assert(page.includes(marker), `user UX missing ${marker}`);
assert(!page.includes('legacyOfficialResultsMarkup'), 'legacy recomputed result rendering must not remain reachable');
for (const marker of ["view === 'read_only'", "view === 'results'", "['Closed', 'Certified', 'Published'].includes(status)"]) assert(participationModel.includes(marker), `campaign filter contract missing ${marker}`);
for (const marker of ['.svp-result-integrity', '.svp-official-results__ranking', 'min-height:44px']) assert(style.includes(marker), `responsive result styling missing ${marker}`);
assert(/20261025-company-user-ux-phase5-r1|20261027-safety-vote-(?:jury-work-media-r2|preview-parity-r1|jury-score-ux-r1)|20261028-safety-vote-jury-scoring-r2/.test(index), 'Phase 5 frontend cache key is stale');

console.log('Safety Vote company User UX Phase 5 static contract: PASS (all campaigns, read-only detail, immutable official results, lifecycle filters and responsive integrity panel)');
