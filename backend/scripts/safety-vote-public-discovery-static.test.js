'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const node2 = read('backend/routes/safety-vote-phase2.js');
const node3 = read('backend/routes/safety-vote-phase3.js');
const php2 = read('api/handlers/safety_vote_phase2.php');
const php3 = read('api/handlers/safety_vote_phase3.php');
const ui = read('public/js/pages/safety-vote-page-ux1.js');
const participationModel = read('public/js/pages/safety-vote-participation-model.mjs');
const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
const admin = read('public/js/pages/admin.js');
const adminSafetyVote = read('public/js/pages/admin-safety-vote-ux1.js');
const main = read('public/js/main.js');

for (const source of [node2, php2]) {
    assert(source.includes("c.DiscoveryMode='public_listing' OR eligible.EmployeeID IS NOT NULL"), 'member discovery query must include public listings while retaining frozen eligibility');
    assert(source.includes("c.DiscoveryMode='public_listing' AND eligible.EmployeeID IS NULL"), 'member discovery query must label non-eligible public cards');
    assert(source.includes('eligible.EmployeeID IS NOT NULL'), 'voting-window projection must retain eligibility enforcement');
    assert(source.includes('c.IsHidden=0 AND c.IsTest=0'), 'hidden and test campaigns must remain absent from member discovery');
}

for (const source of [node2, node3, php2, php3]) {
    for (const marker of ['discoveryOnly', 'public_listing_preview', 'CAMPAIGN_NOT_ELIGIBLE']) {
        assert(source.includes(marker), `public discovery detail parity missing ${marker}`);
    }
    assert(source.includes('promotionPreOpen||discoveryOnly') || source.includes('$promotionPreOpen||$discoveryOnly'), 'public discovery detail must suppress questions for non-eligible users');
}

assert(node3.includes('ownResponses:discoveryOnly?[]:'), 'Node must not expose own-response data in discovery-only detail');
assert(php3.includes("'ownResponses'=>$discoveryOnly?[]:"), 'PHP must not expose own-response data in discovery-only detail');
assert(node3.includes("if(!e){await cx.rollback();return fail(res,403,'CAMPAIGN_NOT_ELIGIBLE'"), 'Node ballot submission must independently reject non-eligible users');
assert(php3.includes("if(!$e){$pdo->rollBack();json_response(['success'=>false,'code'=>'CAMPAIGN_NOT_ELIGIBLE']"), 'PHP ballot submission must independently reject non-eligible users');

for (const marker of ['DiscoveryOnly', 'public_listing_preview', '!discoveryOnly && Number(campaign.LiveLeaderboardEnabled)', 'เปิดดูรายละเอียดได้ · ไม่มีสิทธิ์ลงคะแนน', 'ระบบจะไม่แสดงคำถามหรือปุ่มส่งคะแนน']) {
    assert(ui.includes(marker), `participant public-discovery UX missing ${marker}`);
}
assert(ui.includes("const VIEW_LABELS = { all: 'ทั้งหมด'"), 'participant list must expose an all-campaigns view');
assert(ui.includes("view: 'all'"), 'all campaigns must be the initial discovery view');
assert(ui.includes("participationState(item) === 'open' && Number(item.DiscoveryOnly || 0) !== 1"), 'discovery-only campaigns must not appear as actionable tasks');
assert(participationModel.includes("view === 'all' || participationState(campaign) === view"), 'campaign filtering must support the all-campaigns view');
assert(main.includes('20261016-safety-vote-public-discovery-r1'), 'Safety Vote page cache key was not advanced');
assert(wizard.includes('พนักงานที่เข้าสู่ระบบทุกคนเห็นการ์ดและรายละเอียด'), 'wizard must explain public discovery behavior');
assert(wizard.includes('เฉพาะผู้มีสิทธิ์ในรายชื่อที่ยืนยันแล้วเท่านั้นที่เห็นคำถามและลงคะแนนได้'), 'wizard must distinguish discovery from voting eligibility');
for (const source of [main, admin, adminSafetyVote]) assert(/20261016-safety-vote-(?:public-discovery|preview-parity)-r1/.test(source), 'Admin wizard cache chain was not advanced');

console.log('Safety Vote public discovery visibility/permission contract: PASS');
