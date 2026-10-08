'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

(async () => {
    const page = read('public/js/pages/safety-vote-page-ux1.js');
    const workspace = read('public/js/pages/safety-vote-jury-workspace.js');
    const components = read('public/js/pages/safety-vote-ux-components.js');
    const css = read('public/style.css');
    const main = read('public/js/main.js');
    const html = read('index.html');
    const preflight = read('docs/safety-vote-ux-phase4-preflight-scope.md');
    const model = await import(pathToFileURL(path.join(root, 'public', 'js', 'pages', 'safety-vote-jury-model.mjs')).href);
    let checks = 0;
    const check = (value, message) => { checks += 1; assert(value, message); };

    check(components.includes('__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true'), 'Safety Vote UX must remain strict opt-in');
    check(page.includes('loadLegacySafetyVotePage()'), 'flag-off rollback must preserve the legacy workspace');
    check(page.includes('loadSafetyVoteJuryWorkspace'), 'role navigation must open the Phase 4 workspace');
    check(workspace.includes("API.get('/safety-vote/jury/assignments'"), 'jury queue must use the existing API');
    check(workspace.includes('/jury/assignments/${Number(id)}'), 'jury detail must use the existing API');
    check(workspace.includes('/scores`') && workspace.includes("API.put("), 'draft scores must use the existing PUT API');
    check(workspace.includes('/submit`') && workspace.includes("API.post("), 'final submit must use the existing API');
    check(workspace.includes('/recuse`'), 'recusal must use the existing API');
    check(!workspace.includes('/admin/jury/assignments/'), 'Juror UI must not call Admin reopen');
    check(workspace.includes('state.detail.blind'), 'blind-mode presentation is missing');
    check(!/\bwindow\.(?:confirm|prompt|alert)\s*\(/.test(workspace), 'native modal APIs are not allowed');
    check(workspace.includes('openSafetyVoteConfirmDialog'), 'immutable submit must use the accessible dialog');
    check(workspace.includes('openSafetyVoteReasonDialog'), 'recusal must use the accessible reason dialog');
    check(components.includes('role="dialog"') && components.includes('aria-modal="true"'), 'reason dialog semantics are missing');
    check(components.includes("event.key === 'Escape'"), 'dialog Escape behavior is missing');
    check(workspace.includes('sessionStorage') && workspace.includes('safety-vote-jury-draft:'), 'session-local autosave is missing');
    check(workspace.includes('clearStaleDrafts') && workspace.includes('clearLocalDraft'), 'local draft cleanup contract is missing');
    check(workspace.includes('บันทึกบนเซิร์ฟเวอร์เมื่อกรอกครบ'), 'local/server autosave distinction is missing');
    check(workspace.includes('validateScoreSheet') && workspace.includes('role="alert" tabindex="-1"'), 'focusable validation summary is missing');
    check(workspace.includes('ตรวจสอบก่อนส่ง') && workspace.includes('แก้ไขไม่ได้'), 'review/immutable wording is missing');
    check(workspace.includes('safeJuryReceipt') && workspace.includes('ไม่แสดงคะแนนหรือรายละเอียดผู้สมัคร'), 'privacy-safe receipt is missing');
    check(workspace.includes('ASSIGNMENT_NOT_FOUND'), 'direct-link assignment denial is missing');
    check(workspace.includes('SAFETY_VOTE_MODULE_DISABLED'), 'module fail-closed state is missing');
    check(workspace.includes('SCORE_SHEET_LOCKED') || workspace.includes('assignmentState(current.data.assignment)'), 'authoritative submit recovery is missing');
    check(/safety-vote-ux(?:4|5)-r1/.test(main) && /safety-vote-ux(?:4|5)-r1/.test(html), 'Phase 4-or-later cache chain is incomplete');
    check(css.includes('Safety Vote UX/UI Phase 4'), 'Phase 4 scoped CSS marker is missing');
    check(css.includes('.svj-action-bar') && css.includes('env(safe-area-inset-bottom'), 'responsive sticky action bar is missing safe-area handling');
    check(css.includes('min-height: 44px'), '44 px touch targets are not enforced');
    check(css.includes(':focus-visible'), 'visible keyboard focus is missing');
    check(css.includes('@media (max-width: 430px)') && css.includes('@media (max-width: 767px)') && css.includes('@media (max-width: 1023px)'), 'required responsive breakpoints are incomplete');
    check(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion handling is missing');
    check(css.includes('overflow-x: clip'), 'horizontal overflow containment is missing');

    const assignments = [
        { id: 1, Status: 'Draft', CampaignTitle: 'แนวคิด ก', StageID: 2 },
        { id: 2, Status: 'Submitted', CampaignTitle: 'แนวคิด ข', StageID: 2 },
        { id: 3, Status: 'Recused', ConflictState: 'recused', CampaignTitle: 'แนวคิด ค', StageID: 3 }
    ];
    check(model.assignmentState(assignments[0]) === 'draft', 'Draft state mapping is wrong');
    check(model.assignmentState(assignments[1]) === 'submitted', 'Submitted state mapping is wrong');
    check(model.assignmentState(assignments[2]) === 'recused', 'Recused state mapping is wrong');
    check(model.filterAssignments(assignments, { view: 'draft', query: 'ก' }).length === 1, 'Thai queue search/filter is wrong');
    check(JSON.stringify(model.assignmentProgress(assignments)) === JSON.stringify({ submitted: 1, recused: 1, pending: 1, total: 3 }), 'queue progress is wrong');

    const detail = {
        candidates: [{ id: 10, candidateNo: 'A01', displayName: 'Candidate A01' }],
        criteria: [{ id: 20, Title: 'ความปลอดภัย', MinScore: 0, MaxScore: 10, Weight: 60 }, { id: 21, Title: 'ความเป็นไปได้', MinScore: 1, MaxScore: 5, Weight: 40 }]
    };
    check(model.validateScoreSheet(detail, {}).length === 2, 'missing scores must fail validation');
    check(model.validateScoreSheet(detail, { '10:20': { score: 11 }, '10:21': { score: 3 } }).length === 1, 'out-of-range score must fail validation');
    const scores = { '10:20': { score: 8, comment: 'ชัดเจน' }, '10:21': { score: 4, comment: '' } };
    check(model.validateScoreSheet(detail, scores).length === 0, 'complete bounded sheet must pass');
    check(model.scoreProgress(detail, scores).completed === 2 && model.scoreProgress(detail, scores).percent === 100, 'score progress is wrong');
    const payload = model.buildScorePayload(detail, scores);
    check(payload.scores.length === 2 && payload.scores[0].candidateId === 10 && payload.scores[0].criterionId === 20, 'score payload mapping is wrong');
    const receipt = model.safeJuryReceipt({ id: 7, SheetVersion: 2, SubmittedAt: '2026-10-08T00:00:00Z' });
    check(receipt.immutable === true && receipt.scoresIncluded === false && receipt.candidateDetailsIncluded === false, 'receipt is not privacy-safe');
    check(!Object.prototype.hasOwnProperty.call(receipt, 'scores'), 'receipt must not include scores');

    for (const excluded of ['backend/routes', 'api', 'backend/migrations', 'shared']) check(preflight.includes(excluded), `excluded scope is undocumented: ${excluded}`);
    check(preflight.includes('GO_FOR_UX_PHASE4_LOCAL_IMPLEMENTATION'), 'preflight decision is missing');
    check(preflight.includes('SheetVersion+1') && preflight.includes('ConflictState=clear'), 'reopen/conflict findings are incomplete');

    console.log(`Safety Vote UX Phase 4 static/unit/accessibility/scope contract: PASS (${checks} assertions)`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
