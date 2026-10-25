'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const authorization = require('../services/safety-vote-participation-authorization');

const root = path.resolve(__dirname, '..', '..');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const open = { id: 1, CurrentVersionID: 10, Status: 'Open', CampaignType: 'popular_vote', IsHidden: 0, IsTest: 0, VotingWindowOpen: 1 };
const cases = [
    { action: 'ballot_submit', campaign: null, eligible: true },
    { action: 'ballot_submit', campaign: open, eligible: true },
    { action: 'ballot_submit', campaign: open, eligible: false },
    { action: 'ballot_submit', campaign: { ...open, VotingWindowOpen: 0 }, eligible: true },
    { action: 'ballot_submit', campaign: { ...open, IsHidden: 1 }, eligible: true },
    { action: 'ballot_submit', campaign: { ...open, IsTest: 1 }, eligible: true },
    { action: 'ballot_submit', campaign: { ...open, CampaignType: 'submission_challenge' }, eligible: true },
    { action: 'submission_create', campaign: { ...open, CampaignType: 'submission_challenge' }, eligible: true },
    { action: 'submission_update', campaign: { ...open, CampaignType: 'submission_challenge' }, eligible: true, owner: false, resourceVersionId: 10 },
    { action: 'submission_withdraw', campaign: { ...open, CampaignType: 'submission_challenge' }, eligible: true, owner: true, resourceVersionId: 9 },
    { action: 'nomination_consent', campaign: { ...open, CampaignType: 'award' }, nominee: true, resourceVersionId: 10 },
    { action: 'nomination_consent', campaign: { ...open, CampaignType: 'award' }, nominee: false, resourceVersionId: 10 },
    { action: 'jury_score_save', campaign: { ...open, CampaignType: 'jury_scoring' }, assignment: true, resourceVersionId: 10 },
    { action: 'jury_score_save', campaign: { ...open, CampaignType: 'jury_scoring' }, assignment: false, resourceVersionId: 10 },
    { action: 'jury_score_submit', campaign: { ...open, CampaignType: 'jury_scoring', Status: 'Closed', VotingWindowOpen: 0 }, assignment: true, resourceVersionId: 10 },
];
const node = cases.map(authorization.authorize);
const run = spawnSync(php, [path.join(__dirname, 'safety-vote-participation-authorization-php-runner.php')], { input: JSON.stringify(cases), encoding: 'utf8', windowsHide: true });
if (run.status !== 0) throw new Error(run.stderr || `PHP runner failed (${run.status})`);
const phpResults = JSON.parse(run.stdout);
assert.deepStrictEqual(phpResults, node, 'Node/PHP participation decisions must be byte-shape equivalent');
assert.deepStrictEqual(node.map(x => [x.allowed, x.status, x.code]), [
    [false,404,'CAMPAIGN_NOT_FOUND'],[true,200,'PARTICIPATION_AUTHORIZED'],[false,403,'CAMPAIGN_NOT_ELIGIBLE'],[false,409,'CAMPAIGN_NOT_IN_VOTING_WINDOW'],[false,409,'CAMPAIGN_NOT_PARTICIPATABLE'],[false,409,'CAMPAIGN_NOT_PARTICIPATABLE'],[false,409,'PARTICIPATION_ACTION_NOT_SUPPORTED'],[true,200,'PARTICIPATION_AUTHORIZED'],[false,403,'PARTICIPATION_OWNERSHIP_REQUIRED'],[false,409,'PARTICIPATION_VERSION_CONFLICT'],[true,200,'PARTICIPATION_AUTHORIZED'],[false,403,'PARTICIPATION_NOMINEE_REQUIRED'],[true,200,'PARTICIPATION_AUTHORIZED'],[false,403,'PARTICIPATION_ASSIGNMENT_REQUIRED'],[false,409,'CAMPAIGN_NOT_IN_VOTING_WINDOW'],
]);
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const contracts = read('backend/services/safety-vote-participation-authorization.js') + read('api/lib/safety_vote_participation_authorization.php');
const phase3 = read('backend/routes/safety-vote-phase3.js') + read('api/handlers/safety_vote_phase3.php');
const phase4 = read('backend/routes/safety-vote-phase4.js') + read('api/handlers/safety_vote_phase4.php');
const phase6 = read('backend/routes/safety-vote-phase6.js') + read('api/handlers/safety_vote_phase6.php');
const gallery = read('backend/routes/safety-vote-gallery.js') + read('api/handlers/safety_vote_gallery.php');
const integrationGroups = [
    [phase3, ['ballot_submit','answer_file_upload','submission_create','submission_update','submission_submit','submission_withdraw','submission_file_upload','nomination_create','nomination_consent']],
    [phase4, ['jury_score_save','jury_score_submit','jury_recuse']],
    [phase6, ['ballot_submit']],
    [gallery, ['submission_gallery_upload','submission_gallery_update','submission_gallery_remove']],
];
for (const [source, actions] of integrationGroups) for (const action of actions) assert(source.includes(action), `missing route integration marker: ${action}`);
for (const marker of ['PARTICIPATION_VERSION_CONFLICT','PARTICIPATION_ASSIGNMENT_REQUIRED','PARTICIPATION_NOMINEE_REQUIRED','PARTICIPATION_OWNERSHIP_REQUIRED']) assert(contracts.includes(marker), `missing guard marker: ${marker}`);
console.log(`Safety Vote Participation Authorization Node/PHP parity: PASS (${Object.keys(authorization.ACTIONS).length} governed actions, ${cases.length} parity fixtures)`);
