import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveWorkflowProfile, wizardStepsFor, WORKFLOW_PROFILE_CONTRACT } from '../../public/js/pages/safety-vote-workflow-profile.mjs';

const read = relative => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const expected = {
    survey: ['questions', 'answer', 'respondent', 'required', false, false],
    popular_vote: ['voting_options', 'vote', 'voter', 'required', false, true],
    secret_election: ['ballot_candidates', 'secret_vote', 'elector', 'required', false, false],
    submission_challenge: ['submission_form', 'submit', 'submitter', 'required', false, true],
    nomination: ['nomination_form', 'nominate', 'nominator', 'required', false, false],
    jury_scoring: ['work_items', 'jury_score', 'conditional_submitter', 'conditional_by_work_source', true, true],
};

assert.equal(WORKFLOW_PROFILE_CONTRACT, '2026-10-25-safety-vote-workflow-profile-r1');
for (const [campaignType, contract] of Object.entries(expected)) {
    const profile = resolveWorkflowProfile({ campaignType });
    assert.deepEqual([
        profile.contentModel, profile.actionModel, profile.participantRole, profile.eligibilityPolicy,
        profile.juryRequired, profile.publicGallery,
    ], contract, `${campaignType} behavior changed`);
    assert.equal(profile.companyViewerMayParticipate, false, `${campaignType} visibility granted participation`);
    assert.deepEqual(wizardStepsFor({ campaignType }).map(([key]) => key), ['type', 'details', 'privacy', 'content', 'operation', 'eligibility', 'schedule', 'results', 'review']);
}

assert.equal(resolveWorkflowProfile({ campaignType: 'jury_scoring', workSource: 'admin_curated' }).eligibilityRequired, false);
assert.equal(resolveWorkflowProfile({ campaignType: 'jury_scoring', workSource: 'imported' }).eligibilityRequired, false);
assert.equal(resolveWorkflowProfile({ campaignType: 'jury_scoring', workSource: 'employee_submission' }).eligibilityRequired, true);

const nodeJury = read('backend/routes/safety-vote-phase4.js');
const phpJury = read('api/handlers/safety_vote_phase4.php');
const juryUi = read('public/js/pages/safety-vote-jury-workspace.js');
const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
for (const source of [nodeJury, phpJury]) {
    assert.match(source, /Draft['"],?['"]Scheduled['"],?['"]Open/, 'Jury add/remove lifecycle changed');
    assert.match(source, /Submitted/, 'Submitted Jury assignment immutability changed');
    assert.match(source, /retainedDraftScores/, 'Draft score retention changed');
}
for (const marker of ['data-svj-score-range', 'data-svj-score-step', 'data-svj-score-quick', 'data-svj-score-output', 'inputmode="decimal"']) {
    assert(juryUi.includes(marker), `Juror score UX marker missing: ${marker}`);
}
assert(wizard.includes('ส่งแล้ว · ถอนไม่ได้'), 'Submitted juror assignment must remain visibly immutable');
assert(wizard.includes('Reopen'), 'Submitted juror recovery guidance is missing');
assert(!/fetch\s*\(\s*['"]https?:\/\//i.test(`${juryUi}\n${wizard}`), 'Behavior-frozen UI must not call an external origin');

console.log('Safety Vote Behavior Freeze matrix: PASS (6 workflows, 3 Jury sources, 9 Wizard steps, governed Jury lifecycle and score UX)');
