'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const phase5 = require('../services/safety-vote-phase5');

const root = path.resolve(__dirname, '..', '..');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const rows = Array.from({ length: 38 }, (_, index) => ({
    id: index + 1,
    RankNo: index + 1,
    CandidateNo: `WORK-${index + 1}`,
    DisplayName: `Work ${index + 1}`,
    MetricKey: 'combined_score',
    NumericValue: 100 - index,
    ResultState: index < 3 ? 'advanced' : 'not_advanced',
    MetadataJson: JSON.stringify({ juryScore: 100 - index, popularScore: 0, judgeCount: 5 }),
}));
const juryInput = {
    campaign: { id: 6, CampaignCode: 'SHE-006-2026', CampaignType: 'jury_scoring', Status: 'Published', ResultVisibility: 'hidden_until_close', OfficialResultTopN: 50 },
    snapshot: { id: 1, SnapshotNo: 1, Status: 'Published', ParticipationCount: 0, AcceptedBallotCount: 0, ResultHash: 'a'.repeat(64), QuorumState: 'met', TieState: 'none', ReconciliationState: 'balanced' },
    rows,
};

const nodeModel = phase5.officialResultModel(juryInput);
const phpModelRun = spawnSync(php, [path.join(root, 'api', 'tests', 'safety_vote_jury_official_result_runner.php')], {
    input: JSON.stringify(juryInput), encoding: 'utf8', windowsHide: true,
});
assert.equal(phpModelRun.status, 0, phpModelRun.stderr);
const phpModel = JSON.parse(phpModelRun.stdout);
assert.deepEqual(phpModel, nodeModel, 'Node/PHP Jury official-result model must remain identical');
assert.equal(nodeModel.integrity.eligible, true);
assert.equal(nodeModel.integrity.evidenceModel, 'jury_scores');
assert.equal(nodeModel.integrity.ballotZeroGuardApplied, false);
assert.equal(nodeModel.totalResultRows, 38);
assert.equal(nodeModel.noResult, false);
assert.equal(nodeModel.officialGroups[0].rows.length, 38);

const ballotCampaign = { CampaignType: 'popular_vote' };
const manufactured = [{ RankNo: 1, NumericValue: 99, ResultState: 'winner' }];
const ballotIntegrity = phase5.snapshotIntegrity({ ParticipationCount: 0, AcceptedBallotCount: 0 }, manufactured, ballotCampaign);
assert.equal(ballotIntegrity.eligible, false, 'Zero-ballot manufactured rankings must remain excluded');
assert.equal(ballotIntegrity.reason, 'ZERO_PARTICIPATION_MUST_NOT_HAVE_RANK');
assert.equal(ballotIntegrity.ballotZeroGuardApplied, true);

for (const relative of ['backend/routes/safety-vote-phase5.js', 'api/handlers/safety_vote_phase5.php']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert(source.includes('ballotZeroGuard'), `${relative} is missing the workflow-aware SQL selector`);
    assert(source.includes('?=0 OR NOT'), `${relative} is missing the Jury zero-ballot bypass`);
    assert(source.includes('RESULT_SNAPSHOT_NOT_AVAILABLE'), `${relative} must retain fail-closed snapshot handling`);
}

console.log('Safety Vote Jury official results integrity: PASS (38 Published Jury rows visible; zero-ballot manufactured Popular Vote remains excluded; Node/PHP parity)');
