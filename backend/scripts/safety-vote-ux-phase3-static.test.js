'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

(async () => {
    const page = read('public/js/pages/safety-vote-page-ux1.js');
    const components = read('public/js/pages/safety-vote-ux-components.js');
    const css = read('public/style.css');
    const main = read('public/js/main.js');
    const html = read('index.html');
    const preflight = read('docs/safety-vote-ux-phase3-preflight-scope.md');
    const model = await import(pathToFileURL(path.join(root, 'public', 'js', 'pages', 'safety-vote-participation-model.mjs')).href);
    let checks = 0;
    const check = (value, message) => { checks += 1; assert(value, message); };

    check(components.includes('__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true'), 'Safety Vote UX must remain strict opt-in');
    check(page.includes('loadLegacySafetyVotePage()'), 'flag-off rollback must load the legacy User/Juror workspace');
    check(page.includes("API.get('/safety-vote/me/campaigns'"), 'eligible campaign source must remain the existing API');
    check(page.includes("/ballot/submit`"), 'ballot submit must remain on the existing API');
    check(page.includes("'Idempotency-Key': state.requestKey"), 'ballot submit must send the stable request key');
    check(page.includes('if (state.inFlight) return'), 'in-flight duplicate protection is missing');
    check(page.includes('state.workflowDraftId'), 'submission retry must retain the created draft identity');
    check(page.includes('openSafetyVoteConfirmDialog'), 'immutable submit must use the shared accessible dialog');
    check(!/\bwindow\.(?:confirm|prompt|alert)\s*\(/.test(page), 'native modal APIs are not allowed');
    check(page.includes('ตรวจสอบก่อนส่ง') && page.includes('แก้ไขไม่ได้'), 'review and immutable wording are missing');
    check(page.includes('receiptMarkup') && page.includes('ไม่แสดงคำตอบหรือตัวเลือกที่ส่ง'), 'privacy-safe receipt wording is missing');
    check(page.includes('ใช้ค้นหาบัตรไม่ได้'), 'secret-ballot non-linkability wording is missing');
    check(page.includes('data-svp-search') && page.includes('data-svp-view'), 'My Activities search/status views are incomplete');
    check(page.includes('role="tablist"') && page.includes('aria-selected='), 'status tabs lack accessible semantics');
    check(page.includes('role="alert" tabindex="-1"'), 'validation summary must be focusable and announced');
    check(page.includes('data-svp-gallery') && page.includes("event.key === 'Escape'"), 'private image gallery keyboard behavior is missing');
    check(page.includes('submission_challenge') && page.includes('nomineeEmployeeId'), 'campaign-adaptive participation forms are incomplete');
    check(page.includes('loadLegacySafetyVotePage') && page.includes('data-svp-jury'), 'existing Juror workspace handoff is missing');
    check(page.includes('state.moduleDisabled') && page.includes('MODULE_DISABLED'), 'module_enabled fail-closed state is missing');
    check(page.includes('state.denied') && page.includes('PERMISSION_DENIED'), 'permission denied state is missing');
    const currentCacheKey = /safety-vote-(?:(?:ux(?:[3-8]|9c)|phase9abc-enabled)-r1|density-r[1-9]\d*)/;
    check(currentCacheKey.test(main) && currentCacheKey.test(html), 'Phase 3-or-later cache chain is incomplete');
    check(css.includes('Safety Vote UX/UI Phase 3'), 'Phase 3 scoped CSS marker is missing');
    check(css.includes('.svp-action-bar') && css.includes('env(safe-area-inset-bottom'), 'responsive sticky action bar is missing safe-area handling');
    check(css.includes('min-height: 44px'), '44 px touch targets are not enforced');
    check(css.includes(':focus-visible'), 'visible keyboard focus is missing');
    check(css.includes('@media (max-width: 430px)') && css.includes('@media (max-width: 767px)') && css.includes('@media (max-width: 1023px)'), 'required responsive breakpoints are incomplete');
    check(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion handling is missing');
    check(css.includes('overflow-x: clip'), 'horizontal overflow containment is missing');

    const questions = [{ id: 7, questionCode: 'Q1', questionType: 'single_choice', title: 'เลือกแนวคิด', isRequired: true, minSelections: 1, maxSelections: 1, options: [{ id: 70, optionCode: 'A', label: 'แนวคิด ก' }, { id: 71, optionCode: 'B', label: 'แนวคิด ข' }] }];
    check(model.validateParticipation(questions, {}).length === 1, 'required unanswered question must fail');
    check(model.validateParticipation(questions, { 7: [70] }).length === 0, 'valid choice answer must pass');
    const payload = model.buildBallotPayload({ campaign: { VersionNo: 3 }, questions }, { 7: [70] });
    check(payload.campaignVersion === 3 && payload.acknowledgedRules === true, 'ballot envelope does not match the existing API');
    check(payload.answers.length === 1 && payload.answers[0].optionIds[0] === 70, 'choice answer mapping is incorrect');
    const optional = [{ id: 8, questionCode: 'Q2', questionType: 'long_text', title: 'หมายเหตุ', isRequired: false, options: [] }];
    check(model.buildBallotPayload({ campaign: { VersionNo: 1 }, questions: optional }, {}).answers.length === 0, 'optional empty answers must be omitted');
    const ranked = [{ id: 9, questionCode: 'Q3', questionType: 'ranking', title: 'จัดลำดับ', isRequired: true, minSelections: 2, maxSelections: 2, options: [{ id: 1 }, { id: 2 }] }];
    check(model.validateParticipation(ranked, { 9: [1, 1] }).length > 0, 'duplicate ranks must fail client validation');
    const hidden = { id: 10, questionCode: 'Q4', questionType: 'long_text', title: 'รายละเอียด', isRequired: true, options: [], displayCondition: { questionCode: 'Q1', operator: 'equals', value: 'B' } };
    check(model.isQuestionVisible(hidden, [...questions, hidden], { 7: [70] }) === false, 'conditional question visibility is incorrect');
    const secretReceipt = model.safeReceipt({ campaign: { PrivacyMode: 'secret_ballot' }, receiptCode: 'SV-TEST' });
    check(secretReceipt.proof === 'accepted_only' && secretReceipt.canLocateBallot === false && secretReceipt.answersIncluded === false, 'secret receipt exposes excessive proof');
    check(!Object.prototype.hasOwnProperty.call(secretReceipt, 'answers'), 'receipt must never include answers');
    check(model.participationState({ Status: 'Open', ParticipationState: 'submitted' }) === 'submitted', 'submitted view classification is incorrect');
    check(model.filterCampaigns([{ Status: 'Open', TitleTh: 'กิจกรรมปลอดภัย' }], { view: 'open', query: 'ปลอดภัย' }).length === 1, 'Thai activity search is incorrect');

    for (const excluded of ['backend/routes', 'api/handlers', 'backend/migrations', 'shared']) {
        check(preflight.includes(excluded), `excluded scope is undocumented: ${excluded}`);
    }
    check(preflight.includes('GO_FOR_UX_PHASE3_LOCAL_IMPLEMENTATION'), 'preflight decision is missing');
    check(preflight.includes('RequestKeys') && preflight.includes('secret_ballot'), 'idempotency/privacy findings are incomplete');

    console.log(`Safety Vote UX Phase 3 static/unit/accessibility/scope contract: PASS (${checks} assertions)`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
