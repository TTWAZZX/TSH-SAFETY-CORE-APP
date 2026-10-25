'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const nodeContract = require('../services/safety-vote-workflow-profile');

(async () => {
    const browserContract = await import(pathToFileURL(path.join(__dirname, '../../public/js/pages/safety-vote-workflow-profile.mjs')).href);
    const cases = [
        'survey', 'popular_vote', 'secret_election', 'submission_challenge', 'nomination',
        { campaignType:'jury_scoring', workSource:'admin_curated' },
        { campaignType:'jury_scoring', workSource:'employee_submission' },
        { campaignType:'jury_scoring', workSource:'imported' }
    ];
    const expected = cases.map(value => nodeContract.resolveWorkflowProfile(value));
    const browser = cases.map(value => browserContract.resolveWorkflowProfile(value));
    assert.deepStrictEqual(browser, expected, 'Browser workflow profiles differ from Node');
    const php = spawnSync(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', [path.join(__dirname, '../../api/tests/safety_vote_workflow_profile_runner.php')], { input:JSON.stringify({ cases }), encoding:'utf8' });
    assert.strictEqual(php.status, 0, php.stderr);
    assert.deepStrictEqual(JSON.parse(php.stdout), expected, 'PHP workflow profiles differ from Node');
    const juryAdmin = expected[5], jurySubmission = expected[6], popular = expected[1];
    assert.strictEqual(juryAdmin.contentModel, 'work_items');
    assert.strictEqual(juryAdmin.eligibilityRequired, false);
    assert.strictEqual(jurySubmission.eligibilityRequired, true);
    assert.strictEqual(juryAdmin.juryRequired, true);
    assert.strictEqual(popular.eligibilityRequired, true);
    assert.strictEqual(popular.companyViewerMayParticipate, false);
    console.log('Safety Vote Workflow Profile Node/PHP/Browser parity: PASS (8 workflow variants)');
})().catch(error => { console.error(error); process.exitCode = 1; });
