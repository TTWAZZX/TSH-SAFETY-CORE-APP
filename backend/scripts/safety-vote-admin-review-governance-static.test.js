'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const planning = require('../services/safety-vote-planning');
let passed = 0;
const ok = (condition, label) => { assert(condition, label); passed += 1; };

const nodeRoute = read('backend/routes/safety-vote-planning.js');
const phpRoute = read('api/handlers/safety_vote_planning.php');
const phpLib = read('api/lib/safety_vote_planning.php');
const ui = read('public/js/pages/admin-safety-vote-review.js');
const shell = read('public/js/pages/admin-safety-vote-ux1.js');
const css = read('public/style.css');

for (const endpoint of ['/admin/planning/review-queue', '/admin/planning/campaigns/:id/governance', '/admin/planning/campaigns/:id/review-notes']) {
    ok(nodeRoute.includes(endpoint), `Node route ${endpoint}`);
    ok(phpRoute.includes(endpoint.replace('/admin', '/safety-vote/admin')), `PHP route ${endpoint}`);
}
for (const marker of ['OwnerEmployeeID', 'SafetyVote_CampaignRoles', 'SafetyVote_AuditLogs', 'SAFETY_VOTE_AUDIT_VIEW', 'approvalState: false', 'containsBallotData: false']) ok(nodeRoute.includes(marker), marker);
ok(!nodeRoute.includes('/notifications/dispatch'), 'review contract never dispatches notifications');
ok(nodeRoute.includes('governanceSafe') && phpRoute.includes('JURY_SCORE|CANDIDATE'), 'timeline filters response identity domains');
ok(shell.includes("['review', 'ตรวจทานและกำกับ']") && shell.includes('renderSafetyVoteReviewWorkspace'), 'feature workspace integration');
for (const marker of ['ตรวจทานและกำกับงาน', 'ตัวขัดขวางความพร้อม', 'หมายเหตุตรวจทาน', 'ประวัติการกำกับจาก Audit', 'ทางลัดตามบริบท']) ok(ui.includes(marker), marker);
ok(ui.includes('maxlength="800"') && ui.includes('ห้ามบันทึกคำตอบ'), 'bounded privacy wording');
ok(css.includes('.sv-review-layout') && css.includes('@media(max-width:1023px)') && css.includes('min-height:44px'), 'responsive and target CSS');

const good = planning.normalizeReviewNote({ category: 'readiness', note: 'ตรวจรายละเอียดกำหนดเวลาอีกครั้ง' });
const badKey = planning.normalizeReviewNote({ category: 'general', note: 'x', ballotId: 12 });
const badText = planning.normalizeReviewNote({ category: 'general', note: 'Ballot ID 123 belongs here' });
ok(good.ok && !badKey.ok && !badText.ok, 'review note privacy validation');
const readiness = planning.reviewReadiness({ OwnerEmployeeID: 'SV-ADMIN', QuestionCount: 1, EligibilityRuleCount: 0, ScheduledOpenAt: '2026-10-10T10:00:00Z', ScheduledCloseAt: '2026-10-11T10:00:00Z' });
ok(readiness.percent === 75 && readiness.blockers[0].key === 'eligibility' && readiness.authoritative === false, 'derived readiness does not replace authoritative check');
const conflicts = planning.scheduleConflicts([{ CampaignID: 1, Channel: 'email', ScheduledAt: '2026-10-10 10:00:00' }, { CampaignID: 1, Channel: 'email', ScheduledAt: '2026-10-10 10:20:00' }]);
ok(conflicts.get(1) === 1, 'schedule conflict contract');

const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const phpCode = `require '${path.join(root, 'api/lib/safety_vote_planning.php').replace(/\\/g, '/')}'; echo json_encode([svpl_review_note(['category'=>'readiness','note'=>'ตรวจรายละเอียดกำหนดเวลาอีกครั้ง']),svpl_review_readiness(['OwnerEmployeeID'=>'SV-ADMIN','QuestionCount'=>1,'EligibilityRuleCount'=>0,'ScheduledOpenAt'=>'2026-10-10T10:00:00Z','ScheduledCloseAt'=>'2026-10-11T10:00:00Z']),svpl_schedule_conflicts([['CampaignID'=>1,'Channel'=>'email','ScheduledAt'=>'2026-10-10 10:00:00'],['CampaignID'=>1,'Channel'=>'email','ScheduledAt'=>'2026-10-10 10:20:00']])], JSON_UNESCAPED_UNICODE);`;
const run = spawnSync(php, ['-r', phpCode], { encoding: 'utf8' });
if (run.error?.code === 'EPERM') {
    ok(phpLib.includes('svpl_review_note') && phpLib.includes('svpl_review_readiness') && phpLib.includes('svpl_schedule_conflicts'), 'PHP parity functions present (sandbox spawn restricted)');
} else {
    assert.strictEqual(run.status, 0, run.stderr || run.error?.message);
    const parity = JSON.parse(run.stdout);
    ok(parity[0].ok === good.ok && parity[1].percent === readiness.percent && Number(parity[2]['1']) === conflicts.get(1), 'Node/PHP pure contract parity');
}
ok(phpLib.includes('SVPL_REVIEW_CONTRACT') && phpLib.includes('BALLOT_DATA_NOT_ALLOWED'), 'PHP review contract marker');
console.log(`Safety Vote Admin UX Improvement Phase 3 static/parity: PASS (${passed} assertions)`);
