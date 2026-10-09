'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

(async () => {
    const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
    const components = read('public/js/pages/safety-vote-ux-components.js');
    const admin = read('public/js/pages/admin-safety-vote-ux1.js');
    const css = read('public/style.css');
    const preflight = read('docs/safety-vote-ux-phase2-preflight-scope.md');
    const model = await import(pathToFileURL(path.join(root, 'public', 'js', 'pages', 'safety-vote-wizard-model.mjs')).href);

    assert(components.includes('__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true'), 'Safety Vote UX must remain strict opt-in');
    assert(admin.includes('renderLegacySafetyVoteFoundation(container)'), 'flag-off legacy rollback path is missing');
    assert(admin.includes('renderSafetyVoteCampaignWizard'), 'Admin campaign center must launch the Phase 2 wizard');
    assert.strictEqual(model.WIZARD_STEPS.length, 8, 'wizard must have exactly eight common steps');
    assert.deepStrictEqual(model.WIZARD_STEPS.map(step => step[0]), ['type', 'details', 'privacy', 'content', 'eligibility', 'schedule', 'results', 'review']);
    assert.strictEqual(model.CORE_TEMPLATES.length, 6, 'six Phase 0 core templates are required');
    assert.deepStrictEqual(model.CORE_TEMPLATES.filter(item => item.advancedRequired).map(item => item.key), ['secret_election', 'submission_challenge', 'nomination', 'jury_scoring']);

    for (const marker of ['data-sv-wizard=', 'role="progressbar"', 'aria-current="step"', 'data-svw-save-status', 'role="alert"', 'svw-action-bar', 'svw-readiness', 'data-svw-preview="user"', 'data-svw-preview="juror"']) {
        assert(wizard.includes(marker) || css.includes(marker), `wizard contract marker missing: ${marker}`);
    }
    assert(!/\bwindow\.(?:confirm|prompt|alert)\s*\(/.test(wizard), 'native modal APIs are not allowed in the wizard');
    assert(wizard.includes('openSafetyVoteConfirmDialog'), 'accessible confirm dialog must be used');
    assert(components.includes('safetyVoteCampaignPreview'), 'shared real-role preview component is missing');
    assert(components.includes('role="alertdialog"') && components.includes('aria-modal="true"'), 'confirm dialog semantics are missing');
    assert(css.includes('min-height: 44px'), '44 px touch-target rule is missing');
    assert(css.includes('@media (max-width: 430px)') && css.includes('@media (max-width: 767px)') && css.includes('@media (max-width: 1023px)'), 'responsive breakpoints are incomplete');
    assert(css.includes('env(safe-area-inset-bottom'), 'sticky action bar must honor mobile safe area');
    assert(css.includes(':focus-visible'), 'keyboard focus styling is missing');
    assert(wizard.includes('eligibilityFrozen ? true : saveRules()'), 'frozen eligibility must not be silently rewritten when advancing');
    assert((wizard.match(/await state\.saveChain/g) || []).length >= 2, 'navigation and eligibility preview must serialize behind autosave');

    const draft = model.createWizardDraft();
    assert.strictEqual(model.validateStep(1, draft).length, 1, 'title is required while campaign code is server-generated');
    draft.campaignCode = 'UX2-UNIT';
    draft.titleTh = 'ทดสอบสร้างแคมเปญ';
    draft.questions[0].title = 'ให้คะแนนกิจกรรม';
    draft.openAt = '2026-10-09T08:00';
    draft.closeAt = '2026-10-10T17:00';
    draft.eligibilityPreview = { eligibleCount: 2, accountReadyCount: 2, warningCount: 0 };
    draft.eligibilityFrozen = true;
    assert.strictEqual(model.validateStep(1, draft).length, 0);
    assert.strictEqual(model.validateStep(3, draft).length, 0);
    assert.strictEqual(model.validateStep(4, draft).length, 0);
    assert.strictEqual(model.validateStep(5, draft).length, 0);

    const popular = model.applyTemplate(draft, 'popular_vote');
    popular.questions[0].title = 'เลือกแนวคิดที่ชื่นชอบ';
    popular.questions[0].options = [{ label: 'แนวคิด ก' }, { label: 'แนวคิด ข' }];
    popular.eligibilityPreview = { eligibleCount: 2, accountReadyCount: 2, warningCount: 0 };
    popular.eligibilityFrozen = true;
    assert(model.contentValid(popular), 'popular-vote options should satisfy content readiness');
    const secret = model.applyTemplate(popular, 'secret_election');
    secret.resultVisibility = 'live';
    assert(!model.privacyValid(secret), 'secret ballot must reject live results');
    assert(model.validateStep(2, secret).length > 0, 'secret/live conflict must appear in validation summary');

    const payload = model.campaignPayload(popular);
    assert.strictEqual(payload.campaignType, 'popular_vote');
    assert.strictEqual(payload.campaignCode, 'UX2-UNIT');
    assert(payload.openAt.endsWith(':00'), 'campaign datetime must map to the existing API format');
    const questions = model.builderPayload(popular);
    assert.strictEqual(questions.length, 1);
    assert.strictEqual(questions[0].options.length, 2);
    assert.strictEqual(questions[0].options[0].optionCode, 'O1');

    const ready = model.readinessItems(popular, { campaignId: 1, builderSaved: true });
    assert(ready.slice(0, 5).every(item => item.pass), 'common readiness checks should pass for a complete popular vote');
    assert(ready.find(item => item.key === 'advanced').pass, 'popular vote must not require advanced workspace');
    const advanced = model.readinessItems(secret, { campaignId: 1, builderSaved: true });
    assert(!advanced.find(item => item.key === 'advanced').pass, 'secret election must remain routed through advanced setup');

    for (const excluded of ['backend/routes', 'api/handlers', 'backend/migrations', 'shared contract']) {
        assert(preflight.includes(excluded), `excluded scope is undocumented: ${excluded}`);
    }

    console.log('Safety Vote UX Phase 2 static/unit/accessibility/scope contract: PASS (43 assertions)');
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
