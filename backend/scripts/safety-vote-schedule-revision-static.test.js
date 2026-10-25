'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const nodeFoundation = read('backend/routes/safety-vote.js');
const nodePhase3 = read('backend/routes/safety-vote-phase3.js');
const phpFoundation = read('api/handlers/safety_vote.php');
const phpPhase3 = read('api/handlers/safety_vote_phase3.php');
const admin = read('public/js/pages/admin-safety-vote-ux1.js');

for (const source of [nodeFoundation, phpFoundation]) {
    assert(source.includes("COALESCE(v.CloseAt,c.ScheduledCloseAt)<=NOW()"), 'Due-close time predicate is missing');
    assert(source.includes("Status='Closed'"), 'Due-close state transition is missing');
    assert(source.includes('SYSTEM_SCHEDULE'), 'System schedule actor is missing');
    assert(source.includes('SAFETY_VOTE_SCHEDULE_CLOSE'), 'Scheduled close audit is missing');
    assert(source.includes("WHERE id=? AND Status='Open'"), 'Idempotent Open-state update guard is missing');
    assert(source.includes('PendingDraftVersionID'), 'Pending Draft projection is missing');
}
for (const source of [nodePhase3, phpPhase3]) {
    assert(source.includes('CAMPAIGN_NOT_IN_VOTING_WINDOW'), 'Participant close-window guard is missing');
    assert(source.includes('VotingWindowOpen'), 'Authoritative voting-window check is missing');
}
assert(admin.includes('PendingDraftVersionID') && admin.includes('มี Draft V') && admin.includes('เปิด Draft V'), 'Admin pending revision badge/action is missing');
assert(read('index.html').includes('20261025-company-user-ux-phase5-r1'), 'Frontend release cache key was not advanced');

console.log('Safety Vote schedule lifecycle and Draft revision visibility static contract: PASS');
