'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const ok = (value, label) => { assert(value, label); checks.push(label); };

(async () => {
    const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
    const modelSource = read('public/js/pages/safety-vote-wizard-model.mjs');
    const nodeRoute = read('backend/routes/safety-vote-phase4.js');
    const phpRoute = read('api/handlers/safety_vote_phase4.php');
    const admin = read('public/js/pages/admin-safety-vote-ux1.js');
    const css = read('public/style.css');
    const model = await import(`${pathToFileURL(path.join(root, 'public/js/pages/safety-vote-wizard-model.mjs')).href}?jury=${Date.now()}`);

    ok(model.WIZARD_STEPS.length === 9 && model.wizardStepsFor({ campaignType:'jury_scoring' })[4][0] === 'operation', 'nine-step adaptive wizard includes Jury Criteria and Assignment operation');
    const draft = model.applyTemplate(model.createWizardDraft(), 'jury_scoring');
    ok(draft.juryCriteria.length === 3 && draft.juryCriteria.reduce((sum, item) => sum + item.weight, 0) === 100, 'production-safe default weighted criteria');
    ok(model.juryValidationErrors(draft).some(error => error.includes('กรรมการ')), 'jury validation requires an individual assignment');
    draft.juryAssignments = [{ id: 1, Status: 'Draft', JurorEmployeeID: 'E001' }];
    ok(model.juryValidationErrors(draft).length === 0, 'valid criteria and active assignment pass validation');
    draft.juryCriteria[0].weight = 41;
    ok(model.juryValidationErrors(draft).some(error => error.includes('100%')), 'weight total must equal 100 percent');

    ok(wizard.includes('data-svw-criterion-field') && wizard.includes('safetyVotePeoplePickerMarkup') && wizard.includes('data-svw-revoke-juror'), 'wizard exposes criteria and shared People Picker assignment controls');
    ok(wizard.includes("['Scheduled','Open'].includes(campaignStatus)") && wizard.includes('liveJuryMode'), 'open campaign assignment-only mode');
    ok(admin.includes('data-sv-action="manage-live-jury"') && admin.includes("action === 'manage-live-jury'"), 'Admin campaign detail exposes live juror management');
    ok(wizard.includes('safetyVotePeoplePickerMarkup') && wizard.includes('/jury/assignments/${assignmentId}'), 'wizard uses shared governed People Picker and revoke API');
    ok(nodeRoute.includes("router.get('/admin/campaigns/:id/jury/master'") && phpRoute.includes("$juryMaster=route_params"), 'Node and PHP employee-master route parity');
    ok(nodeRoute.includes("router.delete('/admin/campaigns/:id/jury/assignments/:assignmentId'") && phpRoute.includes('$assignmentDelete&&$method===\'DELETE\''), 'Node and PHP logical revoke route parity');
    ok(nodeRoute.includes("['Draft','Scheduled','Open'].includes(c.Status)") && phpRoute.includes("in_array($c['Status'],['Draft','Scheduled','Open'],true)"), 'assignment changes allowed in governed live states');
    ok(nodeRoute.includes("if(row.Status==='Submitted')") && phpRoute.includes("if($row['Status']==='Submitted')"), 'submitted assignments remain immutable');
    ok(nodeRoute.includes('retainedDraftScores') && phpRoute.includes("'retainedDraftScores'"), 'revoking an unsubmitted juror retains Draft score evidence on both runtimes');
    ok(nodeRoute.includes('ScoreCount FROM SafetyVote_JuryAssignments') && phpRoute.includes('ScoreCount FROM SafetyVote_JuryAssignments'), 'Admin assignment projection reports retained Draft score counts');
    ok(nodeRoute.includes('restored:Boolean(revoked)') && phpRoute.includes("'restored'=>(bool)$restorable"), 'revoked assignment is restored instead of duplicated');
    ok(nodeRoute.includes('SELECT id,StageKey,StageName') && phpRoute.includes('SELECT id,StageKey,StageName'), 'stage writes return persisted IDs on both runtimes');
    ok(css.includes('.svw-jury-builder') && css.includes('@media (max-width:700px)'), 'responsive Jury Wizard styles');
    ok(!modelSource.includes("jury_scoring', label: 'การประกวดโดยคณะกรรมการ', description: 'กำหนดเกณฑ์และมอบหมายกรรมการ', privacyMode: 'confidential', questionType: 'single_choice', advancedRequired: true"), 'jury campaign no longer requires legacy advanced workspace');

    console.log(`Safety Vote Jury Wizard static/model contract: PASS (${checks.length} assertions)`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
