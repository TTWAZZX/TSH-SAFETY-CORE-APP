'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const nodeVisibility = read('backend/services/safety-vote-phase1.js');
const phpVisibility = read('api/lib/safety_vote_phase1.php');
const nodeParticipation = read('backend/services/safety-vote-participation-authorization.js');
const phpParticipation = read('api/lib/safety_vote_participation_authorization.php');
const nodeResults = read('backend/services/safety-vote-phase5.js');
const phpResults = read('api/lib/safety_vote_phase5.php');
const nodeRemediation = read('backend/services/safety-vote-company-visibility-remediation.js');
const phpRemediation = read('api/lib/safety_vote_company_visibility_remediation.php');
const nodeRoutes = read('backend/routes/safety-vote-company-visibility-remediation.js');
const phpRoutes = read('api/handlers/safety_vote_company_visibility_remediation.php');
const server = read('backend/server.js');
const phpIndex = read('api/index.php');
const userPage = read('public/js/pages/safety-vote-page-ux1.js');
const participationModel = read('public/js/pages/safety-vote-participation-model.mjs');
const css = read('public/style.css');
const migration = read('backend/migrations/20261025_safety_vote_company_visibility_remediation.sql');
const rollback = read('backend/migrations/20261025_safety_vote_company_visibility_remediation_rollback.sql');

for (const source of [nodeVisibility, phpVisibility]) {
    assert(source.includes('2026-10-24-company-wide-campaign-visibility-r1'), 'Company visibility contract is missing');
    assert(source.includes('public_listing'), 'Company listing projection is missing');
}
assert(nodeVisibility.includes('campaignVisibilityContract'), 'Node visibility contract entry point is missing');
assert(phpVisibility.includes('sv_company_wide_catalog_enabled'), 'PHP visibility gate entry point is missing');
for (const source of [nodeParticipation, phpParticipation]) {
    assert(source.includes('2026-10-25-safety-vote-participation-authorization-r1'), 'Participation authorization contract is missing');
    assert(source.includes('CAMPAIGN_NOT_ELIGIBLE'), 'Eligibility denial is missing');
}
for (const source of [nodeResults, phpResults]) {
    assert(source.includes('2026-10-25-safety-vote-company-results-ux-r1'), 'Official-result member contract is missing');
    assert(source.includes('immutable_result_snapshot'), 'Immutable result source is missing');
}
for (const source of [nodeRemediation, phpRemediation]) {
    assert(source.includes('2026-10-25-safety-vote-company-visibility-remediation-r1'), 'Remediation contract is missing');
    assert(source.includes('REMEDIATE COMPANY VISIBILITY'), 'Exact apply confirmation is missing');
    assert(source.includes('VOIDED_CAMPAIGN'), 'Voided exclusion is missing');
}
for (const source of [nodeRoutes, phpRoutes]) {
    assert(source.includes('SAFETY_VOTE_MANAGE'), 'Admin permission boundary is missing');
    assert(source.includes('Idempotency-Key'), 'Idempotency boundary is missing');
    assert(source.includes('ROLLBACK COMPANY VISIBILITY'), 'Exact rollback confirmation is missing');
    assert(source.includes('SAFETY_VOTE_COMPANY_VISIBILITY_REMEDIATED'), 'Remediation audit is missing');
}
assert(server.includes("require('./routes/safety-vote-company-visibility-remediation')"), 'Node remediation routes are not mounted');
assert(phpIndex.includes("safety_vote_company_visibility_remediation.php"), 'PHP remediation routes are not mounted');
assert(userPage.includes("setAttribute('data-sv-company-user-ux', 'phase5')"), 'Company User UX release marker is missing');
assert(userPage.includes('/official-results'), 'Official result endpoint is not used by the User detail');
assert(participationModel.includes("view === 'read_only'"), 'Read-only lifecycle filter is missing');
assert(participationModel.includes("view === 'results'"), 'Official-results lifecycle filter is missing');
assert(css.includes('.svp-result-integrity'), 'Responsive result-integrity panel styling is missing');
assert(migration.includes('SafetyVote_VisibilityRemediationBatches') && migration.includes('SafetyVote_VisibilityRemediationItems'), 'Additive remediation evidence schema is incomplete');
assert(rollback.includes('company_visibility_remediation_enabled') && !/DROP\s+TABLE/i.test(rollback), 'Rollback must disable safely without deleting evidence');
assert(!/fetch\s*\(\s*['"]https?:\/\//i.test(userPage), 'Company User UX must not call an external origin');

console.log('Safety Vote Company-wide Visibility Final Acceptance static gate: PASS (visibility, authorization, immutable results, remediation, rollback, responsive UX and external-origin guard)');
