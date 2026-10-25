'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

(async () => {
    const model = await import(`${pathToFileURL(path.join(root, 'public/js/pages/safety-vote-wizard-model.mjs')).href}?phase5a=${Date.now()}`);
    const types = ['survey','popular_vote','secret_election','submission_challenge','nomination','jury_scoring'];
    for (const campaignType of types) {
        const draft = { ...model.createWizardDraft(), campaignType, workSource: campaignType === 'jury_scoring' ? 'admin_curated' : null };
        const steps = model.wizardStepsFor(draft);
        assert.equal(steps.length, 9, `${campaignType} must keep the governed nine-step wizard`);
        assert.equal(steps[3][1], model.workflowProfileFor(draft).contentLabel);
        assert.equal(steps[4][1], model.workflowProfileFor(draft).operationLabel);
        assert.equal(steps[5][1], model.workflowProfileFor(draft).participantLabel);
    }

    const juryAdmin = model.applyTemplate(model.createWizardDraft(), 'jury_scoring');
    juryAdmin.rules = [];
    juryAdmin.eligibilityPreview = null;
    juryAdmin.eligibilityFrozen = false;
    assert.equal(model.workflowProfileFor(juryAdmin).eligibilityRequired, false);
    assert.deepEqual(model.validateStep(5, juryAdmin), []);
    assert.equal(model.readinessItems(juryAdmin).find(item => item.key === 'eligibility').pass, true);

    const juryImported = { ...juryAdmin, workSource:'imported' };
    assert.equal(model.workflowProfileFor(juryImported).eligibilityRequired, false);
    assert.deepEqual(model.validateStep(5, juryImported), []);

    const jurySubmission = { ...juryAdmin, workSource:'employee_submission' };
    assert.equal(model.workflowProfileFor(jurySubmission).eligibilityRequired, true);
    assert(model.validateStep(5, jurySubmission).length >= 3);
    assert.equal(model.readinessItems(jurySubmission).find(item => item.key === 'eligibility').pass, false);

    const survey = model.createWizardDraft();
    survey.rules = [];
    survey.eligibilityPreview = null;
    survey.eligibilityFrozen = false;
    assert.equal(model.workflowProfileFor(survey).eligibilityRequired, true);
    assert(model.validateStep(5, survey).length >= 3);

    const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
    const node = read('backend/routes/safety-vote-phase2.js');
    const php = read('api/handlers/safety_vote_phase2.php');
    assert(wizard.includes('wizardStepsFor(state.draft)'));
    assert(wizard.includes('data-svw-eligibility-skipped'));
    assert(wizard.includes('!workflowProfileFor(state.draft).eligibilityRequired'));
    for (const source of [node, php]) {
        assert(source.includes('ELIGIBILITY_NOT_REQUIRED'));
        assert(source.includes('JURY_CRITERIA_PRESENT'));
        assert(source.includes('JURY_WEIGHT_TOTAL'));
        assert(source.includes('JURY_ASSIGNMENTS_READY'));
    }
    assert(node.includes("require('../services/safety-vote-workflow-profile')"));
    assert(php.includes("require_once __DIR__.'/../lib/safety_vote_workflow_profile.php'"));
    console.log('Safety Vote Adaptive Wizard Phase 5A: PASS (adaptive 9-step labels, profile validation, conditional eligibility and runtime readiness parity)');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
