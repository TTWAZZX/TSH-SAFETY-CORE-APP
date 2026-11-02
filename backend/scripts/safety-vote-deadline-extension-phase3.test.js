'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const node = read('backend/routes/safety-vote-phase2.js');
const php = read('api/handlers/safety_vote_phase2.php');
const ui = read('public/js/pages/admin-safety-vote-operations.js');
const admin = read('public/js/pages/admin-safety-vote-ux1.js');

for (const source of [node, php]) {
    for (const marker of ['reopen_existing', 'next_cycle_required', 'NEXT_CYCLE_REQUIRED', 'SAFETY_VOTE_CAMPAIGN_REOPENED_WITH_EXTENSION', 'ADMIN_GOVERNED_REOPEN']) assert(source.includes(marker), `Missing governed reopen marker ${marker}`);
    assert(source.includes('SafetyVote_ResultSnapshots'), 'Official result evidence check is missing');
    assert(source.includes('FOR UPDATE'), 'Transactional evidence locking is missing');
    assert(source.includes("Status='Open'") && source.includes('ClosedAt=NULL'), 'Closed campaign is not reopened atomically');
    assert(source.includes("Status='Frozen'") && source.includes('CloseAt='), 'Current version schedule/status is not reopened atomically');
    assert(source.includes('promotionIds') && source.includes('RowVersion'), 'Linked promotion concurrency guard is missing');
}
for (const forbidden of ['DELETE FROM SafetyVote_Ballots', 'DELETE FROM SafetyVote_Participation', 'DELETE FROM SafetyVote_Submissions', 'DELETE FROM SafetyVote_JuryAssignments']) {
    assert(!node.includes(forbidden) && !php.includes(forbidden), `Governed reopen must not remove business data: ${forbidden}`);
}
assert(ui.includes("'Closed', 'Certified', 'Published'"), 'Completed campaign states are missing from the extension UI');
assert(ui.includes("preview?.reopenAllowed ? 'REOPEN' : 'EXTEND'"), 'Reopen confirmation mode is missing');
assert(ui.includes('applyExtensionGovernanceUi') && ui.includes('open-versions'), 'Immutable-result next-cycle guidance is missing');
assert(admin.includes("step === 'versions'"), 'Operations cannot navigate to the non-destructive next-cycle workspace');
console.log('Safety Vote deadline extension Phase 3 governance: PASS');
