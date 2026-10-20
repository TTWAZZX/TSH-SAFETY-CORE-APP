'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const migration = fs.readFileSync(path.join(root, 'backend', 'migrations', '20261020_safety_vote_eligibility_amendments.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'backend', 'migrations', '20261020_safety_vote_eligibility_amendments.rollback.sql'), 'utf8');
const deploy = fs.readFileSync(path.join(root, 'backend', 'scripts', 'safety-vote-eligibility-amendments-production-deploy.js'), 'utf8');
const deployHelper = fs.readFileSync(path.join(root, 'backend', 'scripts', 'safety-vote-eligibility-amendments-production-helper.php.template'), 'utf8');

assert.match(migration, /EligibilityEnrollmentMode VARCHAR\(32\) NOT NULL DEFAULT 'closed_after_open'/);
assert.match(migration, /ParentSnapshotID BIGINT NULL/);
assert.match(migration, /SnapshotKind VARCHAR\(32\) NOT NULL DEFAULT 'initial_freeze'/);
for (const table of ['SafetyVote_EligibilityAmendments', 'SafetyVote_EligibilityAmendmentMembers', 'SafetyVote_EligibilityAmendmentEvents']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
for (const mode of ['closed_after_open', 'admin_approval', 'automatic_rule_match']) {
    assert(migration.includes(mode), `missing policy contract: ${mode}`);
}
assert.match(migration, /PreviousEventHash CHAR\(64\) NULL/);
assert.match(migration, /EventHash CHAR\(64\) NOT NULL/);
assert.match(migration, /UNIQUE KEY uq_sv_elig_amend_event_sequence/);
assert.match(migration, /'eligibility_amendment_enabled','0','migration'/);
assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN|DATABASE)\b/i);
assert.match(rollback, /Data-preserving rollback/);
assert.match(rollback, /eligibility_amendment_enabled','0','rollback'/);
assert.doesNotMatch(rollback, /\bDROP\s+(?:TABLE|COLUMN|DATABASE)\b/i);
for (const marker of ['Candidate must be pushed', 'Worktree must be clean', 'doubleDownload', 'rollbackRuntime', 'rollbackSchema', 'zeroResidue']) {
    assert(deploy.includes(marker), `guarded Production deploy is missing ${marker}`);
}
for (const marker of ['HELPER_INTEGRITY_FAILED', 'UNEXPECTED_AMENDMENT_ROWS', 'businessRowsPreserved', "set_setting($pdo, 'eligibility_amendment_enabled', '1'"]) {
    assert(deployHelper.includes(marker), `guarded Production helper is missing ${marker}`);
}
assert.doesNotMatch(deployHelper, /DROP\s+(?:TABLE|COLUMN|DATABASE)/i);

console.log('Safety Vote eligibility amendments static contract: PASS (policy default, snapshot lineage, append-only evidence, disabled gate, guarded deploy and data-preserving rollback)');
