'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const nodeProfile = read('backend/services/safety-vote-workflow-profile.js');
const phpProfile = read('api/lib/safety_vote_workflow_profile.php');
const browserProfile = read('public/js/pages/safety-vote-workflow-profile.mjs');
const nodeAuthorization = read('backend/services/safety-vote-participation-authorization.js');
const phpAuthorization = read('api/lib/safety_vote_participation_authorization.php');
const nodeVisibility = read('backend/services/safety-vote-phase1.js');
const phpVisibility = read('api/lib/safety_vote_phase1.php');
const nodeResults = read('backend/services/safety-vote-phase5.js');
const phpResults = read('api/lib/safety_vote_phase5.php');
const nodeRelease = read('backend/services/safety-vote-result-release.js');
const phpRelease = read('api/lib/safety_vote_result_release.php');
const nodeWorkItems = read('backend/routes/safety-vote-work-items.js');
const phpWorkItems = read('api/handlers/safety_vote_work_items.php');
const nodeJury = read('backend/routes/safety-vote-phase4.js');
const phpJury = read('api/handlers/safety_vote_phase4.php');
const phpJuryRules = read('api/lib/safety_vote_phase4.php');
const nodeBuilder = read('backend/routes/safety-vote-phase2.js');
const phpBuilder = read('api/handlers/safety_vote_phase2.php');
const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
const userPage = read('public/js/pages/safety-vote-page-ux1.js');
const juryWorkspace = read('public/js/pages/safety-vote-jury-workspace.js');
const css = read('public/style.css');
const index = read('index.html');
const main = read('public/js/main.js');
const adminEntry = read('public/js/pages/admin.js');
const backendPackage = JSON.parse(read('backend/package.json'));
const phase3ApiUat = read('backend/scripts/safety-vote-phase3-api-uat.js');

const employeeMasterSqlSources = [
    'api/handlers/safety_vote_planning.php',
    'api/handlers/safety_vote_phase3.php',
    'api/handlers/safety_vote_phase4.php',
    'api/handlers/safety_vote_phase5.php',
    'api/handlers/safety_vote_phase6.php',
    'api/handlers/safety_vote_phase7.php',
    'backend/routes/safety-vote-planning.js',
    'backend/routes/safety-vote-phase3.js',
    'backend/routes/safety-vote-phase4.js',
    'backend/routes/safety-vote-phase5.js',
    'backend/routes/safety-vote-phase6.js',
    'backend/routes/safety-vote-phase7.js',
    'backend/routes/safety-vote.js',
].map(read);

const campaignTypes = [
    'survey',
    'popular_vote',
    'secret_election',
    'submission_challenge',
    'nomination',
    'jury_scoring',
];

for (const source of [nodeProfile, phpProfile, browserProfile]) {
    assert(source.includes('2026-10-25-safety-vote-workflow-profile-r1'), 'Shared Workflow Profile contract is missing');
    for (const campaignType of campaignTypes) {
        assert(source.includes(campaignType), `Workflow Profile is missing ${campaignType}`);
    }
    assert(source.includes('conditional_by_work_source'), 'Jury eligibility must remain conditional on work source');
    assert(source.includes('employee_submission'), 'Employee-submission Jury workflow is missing');
}

for (const source of [nodeAuthorization, phpAuthorization]) {
    assert(source.includes('2026-10-25-safety-vote-participation-authorization-r1'), 'Participation authorization contract is missing');
    for (const action of ['ballot_submit', 'answer_file_upload', 'submission_create', 'submission_gallery_upload', 'submission_gallery_update', 'submission_gallery_remove', 'nomination_create', 'jury_score_submit']) {
        assert(source.includes(action), `Participation authorization is missing ${action}`);
    }
    assert(source.includes('CAMPAIGN_NOT_ELIGIBLE'), 'Eligibility denial code is missing');
    assert(source.includes('PARTICIPATION_ASSIGNMENT_REQUIRED'), 'Jury assignment denial code is missing');
}

for (const source of employeeMasterSqlSources) {
    assert(!/\b(?:FROM|JOIN)\s+Employees\b/.test(source), 'Safety Vote SQL must use the production table name `employees` with exact Linux casing');
}

for (const source of [nodeVisibility, phpVisibility]) {
    assert(source.includes('public_listing'), 'Company-wide listing projection is missing');
    assert(source.includes('company'), 'Company-wide visibility boundary is missing');
}
for (const source of [nodeResults, phpResults]) {
    assert(source.includes('immutable_result_snapshot'), 'Official results must use an immutable result snapshot');
    assert(source.includes('no_result'), 'Official results must preserve explicit zero-result semantics');
}
for (const source of [nodeRelease, phpRelease]) {
    assert(source.includes('manual') && source.includes('automatic'), 'Manual/automatic release policies are incomplete');
    assert(source.includes('popular_vote') && source.includes('GOVERNANCE_COMPLETE') && source.includes('GOVERNANCE_PENDING'), 'Governed release decisions are incomplete');
}

for (const source of [nodeWorkItems, phpWorkItems]) {
    for (const scope of ['question_image', 'option_image', 'work_cover', 'work_gallery']) {
        assert(source.includes(scope), `Atomic media scope ${scope} is missing`);
    }
    assert(source.includes('SafetyVote_MediaMutations'), 'Atomic media audit evidence is missing');
    assert(source.includes('serverConfirmed'), 'Atomic media server confirmation is missing');
    assert(source.includes('/campaigns/:id/works'), 'Company work-gallery contract is missing');
}

for (const source of [nodeJury, phpJuryRules]) {
    assert(source.includes('2026-10-25-jury-work-criteria-matrix-r1'), 'Work x Criteria Matrix contract is missing');
    assert(source.includes('submitted_score_rows_to_frozen_result'), 'Jury score-to-result binding is missing');
    assert(source.includes('matrixHash'), 'Jury matrix integrity hash is missing');
}
assert(phpJury.includes('sv4_jury_matrix'), 'PHP Jury Matrix projection is missing');
for (const source of [nodeBuilder, phpBuilder]) {
    assert(source.includes('serverConfirmed'), 'Builder save must be server-confirmed');
    assert(source.includes('mediaContract'), 'Builder atomic-media contract is missing');
}

assert(wizard.includes('wizardStepsFor(state.draft)'), 'Adaptive Wizard tabs are not profile-driven');
assert(wizard.includes('data-svw-action="add-work"'), 'Jury work-item editor is missing');
assert(wizard.includes('/media/atomic'), 'Wizard does not use the atomic media endpoint');
assert(!wizard.includes("form.append('filePurpose','question_image')"), 'Legacy question-image upload remains in the Wizard');
assert(!wizard.includes("form.append('filePurpose', 'option_image')"), 'Legacy option-image upload remains in the Wizard');
assert(userPage.includes('data-svp-public-work-gallery'), 'Company read-only work gallery is missing');
assert(userPage.includes('/official-results'), 'Company detail does not use official results');
assert(juryWorkspace.includes('WORK × CRITERIA MATRIX'), 'Juror matrix workspace is missing');
assert(juryWorkspace.includes('data-sv-result-binding="submitted_score_rows_to_frozen_result"'), 'Juror result binding marker is missing');
assert(css.includes('.svj-matrix-contract'), 'Responsive Jury Matrix styling is missing');
for (const source of [index, main, adminEntry, wizard, userPage]) {
    assert(source.includes('20261025-safety-vote-final-phase7-r1') || source.includes('20261027-safety-vote-option-image-r2') || source.includes('20261027-safety-vote-gallery-lightbox-r1') || source.includes('20261027-safety-vote-gallery-choice-r2') || source.includes('20261027-safety-vote-gallery-bounded-r3') || source.includes('20261027-safety-vote-jury-work-media-r1'), 'Frontend Final Acceptance cache chain is stale');
}
assert(!/fetch\s*\(\s*['"]https?:\/\//i.test(`${wizard}\n${userPage}\n${juryWorkspace}`), 'Safety Vote UI must not call an external origin');
for (const migration of ['20261025_safety_vote_official_topn_next_cycle.sql', '20261025_safety_vote_result_release_policy.sql', '20261025_safety_vote_jury_work_items_atomic_media.sql']) {
    assert(phase3ApiUat.includes(migration), `Current clean-install UAT migration ${migration} is missing`);
}

for (const script of [
    'test:safety-vote-final-acceptance-phase7',
    'verify:safety-vote-final-acceptance-phase7-static',
    'verify:safety-vote-final-acceptance-phase7-migrations',
    'verify:safety-vote-final-acceptance-phase7-api',
    'verify:safety-vote-final-acceptance-phase7-browser',
]) {
    assert(backendPackage.scripts[script], `Final Acceptance command ${script} is missing`);
}

console.log(`Safety Vote Phase 7 Final Acceptance contract: PASS (${campaignTypes.length} campaign types, adaptive Wizard, guarded participation, immutable results, Jury Matrix and atomic media)`);
