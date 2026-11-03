import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    campaignMatchesView,
    isViewOnlyJuryCampaign,
    workSource
} from '../../public/js/pages/safety-vote-participation-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const open = { Status: 'Open', VotingWindowOpen: 1, DiscoveryOnly: 0, ParticipationState: '' };
const curated = { ...open, CampaignType: 'jury_scoring', WorkSource: 'admin_curated' };
const imported = { ...open, CampaignType: 'jury_scoring', WorkSource: 'imported' };
const employeeSubmission = { ...open, CampaignType: 'jury_scoring', WorkSource: 'employee_submission' };
const popularVote = { ...open, CampaignType: 'popular_vote' };

assert.equal(workSource(curated), 'admin_curated');
assert.equal(isViewOnlyJuryCampaign(curated), true);
assert.equal(isViewOnlyJuryCampaign(imported), true);
assert.equal(isViewOnlyJuryCampaign(employeeSubmission), false);
assert.equal(campaignMatchesView(curated, 'open'), false);
assert.equal(campaignMatchesView(curated, 'read_only'), true);
assert.equal(campaignMatchesView(imported, 'open'), false);
assert.equal(campaignMatchesView(imported, 'read_only'), true);
assert.equal(campaignMatchesView(employeeSubmission, 'open'), true);
assert.equal(campaignMatchesView(employeeSubmission, 'read_only'), false);
assert.equal(campaignMatchesView(popularVote, 'open'), true);
assert.equal(campaignMatchesView(popularVote, 'read_only'), false);

const page = read('public/js/pages/safety-vote-page-ux1.js');
for (const marker of ['อยู่ระหว่างการตัดสิน', 'เปิดให้ชมผลงาน', 'เปิดรับผลงาน', 'ปิดการตัดสิน · รอสรุปผล', 'ดูสรุปผลได้']) {
    assert(page.includes(marker), `Jury catalogue presentation is missing: ${marker}`);
}
const nodeRoute = read('backend/routes/safety-vote-phase2.js');
const phpRoute = read('api/handlers/safety_vote_phase2.php');
assert(nodeRoute.includes('attachCatalogueWorkSources(rows)'), 'Node catalogue must project WorkSource');
assert(phpRoute.includes('sv2_attach_catalogue_work_sources($rows)'), 'PHP catalogue must project WorkSource');
assert(read('public/js/main.js').includes('20261103-safety-vote-jury-catalogue-state-r1'), 'page cache key is stale');
assert(read('index.html').includes('20261103-safety-vote-jury-catalogue-state-r1'), 'entry cache key is stale');

console.log('Safety Vote Jury catalogue state: PASS (view-only judging, employee submission, Popular Vote regression, Node/PHP WorkSource parity and cache chain)');
