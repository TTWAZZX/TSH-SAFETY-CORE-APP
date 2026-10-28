'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const contract = require('../services/safety-vote-phase1');

const root = path.resolve(__dirname, '..', '..');
const phpBin = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const fixture = {
    campaigns: [
        { campaignCode:' road safety 2569 ', titleTh:'โหวตภาพความปลอดภัย', campaignType:'popular_vote', privacyMode:'identified', resultVisibility:'hidden_until_close' },
        { campaignCode:'TOPN-CUSTOM', titleTh:'ผลแบบกำหนดเอง', campaignType:'popular_vote', privacyMode:'identified', resultVisibility:'hidden_until_close', officialResultTopN:37 },
        { campaignCode:'TOPN-ZERO', titleTh:'ผลไม่ถูกต้อง', campaignType:'popular_vote', privacyMode:'identified', resultVisibility:'hidden_until_close', officialResultTopN:0 },
        { campaignCode:'TOPN-HIGH', titleTh:'ผลเกินขอบเขต', campaignType:'popular_vote', privacyMode:'identified', resultVisibility:'hidden_until_close', officialResultTopN:101 },
        { campaignCode:'TOPN-FRACTION', titleTh:'ผลเป็นเศษส่วน', campaignType:'popular_vote', privacyMode:'identified', resultVisibility:'hidden_until_close', officialResultTopN:2.5 },
        { campaignCode:'KPO-SECRET', titleTh:'เลือกตั้ง คปอ.', campaignType:'secret_election', privacyMode:'secret_ballot', resultVisibility:'live' },
        { campaignCode:'', titleTh:'', campaignType:'unknown', privacyMode:'anonymous', resultVisibility:'published' },
    ],
    rules: [
        { ruleGroup:1, ruleOrder:1, effect:'include', attributeKey:'all', operator:'IN', values:[], reason:'พนักงานทั้งหมด' },
        { ruleGroup:1, ruleOrder:2, effect:'exclude', attributeKey:'employee_id', operator:'IN', values:['E003'], reason:'ยกเว้นบัญชีทดสอบ' },
    ],
    employees: [
        { employeeId:'E001', employeeName:'หนึ่ง', departmentId:1, safetyUnitId:10, positionId:100, role:'User', team:'A', masterWarnings:[], accountReady:true },
        { employeeId:'E003', employeeName:'สาม', departmentId:2, safetyUnitId:20, positionId:200, role:'User', team:'B', masterWarnings:[], accountReady:true },
    ],
    hashInput: { z:2, a:{ c:3, b:1 } },
};

const nodeResult = {
    campaigns: fixture.campaigns.map(contract.normalizeCampaign),
    campaignCodes: [1, 9, 999, 0, 1000].map(sequence => contract.formatCampaignCode(sequence, 2026)),
    visibilityContracts: [
        contract.campaignVisibilityContract({ discoveryMode:'eligible_only' }, false),
        contract.campaignVisibilityContract({ discoveryMode:'eligible_only' }, true),
    ],
    catalogueAccess: [
        contract.campaignCatalogueAccess({ Status:'Open', DiscoveryMode:'eligible_only' }, false, false),
        contract.campaignCatalogueAccess({ Status:'Open', DiscoveryMode:'eligible_only' }, false, true),
        contract.campaignCatalogueAccess({ Status:'Open', DiscoveryMode:'eligible_only' }, true, true),
        contract.campaignCatalogueAccess({ Status:'Draft', DiscoveryMode:'public_listing' }, false, true),
    ],
    ruleSet: contract.normalizeRules(fixture.rules),
};
nodeResult.eligible = contract.evaluateEligibility(nodeResult.ruleSet.rules, fixture.employees);
nodeResult.hash = contract.canonicalHash(fixture.hashInput);

const php = spawnSync(phpBin, [path.join(root, 'api', 'tests', 'safety_vote_phase1_fixture_runner.php')], {
    input: JSON.stringify(fixture), encoding:'utf8', windowsHide:true,
});
assert.strictEqual(php.status, 0, php.stderr || 'PHP fixture runner failed');
assert.deepStrictEqual(JSON.parse(php.stdout), nodeResult, 'Node/PHP Safety Vote contract mismatch');
assert.strictEqual(nodeResult.campaigns[1].ok, true, 'Custom Top N within 1-100 must be accepted');
assert.strictEqual(nodeResult.campaigns[1].value.officialResultTopN, 37, 'Custom Top N must be preserved');
for (const index of [2,3,4]) assert(nodeResult.campaigns[index].errors.some(error => error.field === 'officialResultTopN' && error.code === 'INVALID_RANGE'));

const nodeRoute = fs.readFileSync(path.join(root, 'backend', 'routes', 'safety-vote.js'), 'utf8');
const phpRoute = fs.readFileSync(path.join(root, 'api', 'handlers', 'safety_vote.php'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');
const phpIndex = fs.readFileSync(path.join(root, 'api', 'index.php'), 'utf8');
const adminPage = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'admin.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');
const forbiddenDdl = /\b(CREATE|ALTER|DROP|TRUNCATE)\s+TABLE\b/i;
assert.ok(!forbiddenDdl.test(nodeRoute), 'Node runtime must not own DDL');
assert.ok(!forbiddenDdl.test(phpRoute), 'PHP runtime must not own DDL');
assert.match(server, /use\('\/api\/safety-vote'/, 'Node route is not mounted');
assert.match(phpIndex, /handle_safety_vote_routes/, 'PHP route is not dispatched');
assert.match(nodeRoute, /SAFETY_VOTE_SCHEMA_NOT_READY/);
assert.match(phpRoute, /SAFETY_VOTE_SCHEMA_NOT_READY/);
assert.match(nodeRoute, /router\.delete\('\/admin\/campaigns\/:id\/files\/:fileId'/);
assert.match(phpRoute, /\$method==='DELETE'.*SAFETY_VOTE_FILE_REMOVE/s);
assert.match(adminPage, /safety-vote-foundation/);
assert.doesNotMatch(main, /key:\s*['"]safety-vote['"]/, 'Phase 1 must not expose a user module entry');

console.log('Safety Vote Phase 1 contract/static parity: PASS (Node/PHP fixture parity, fail-closed schema, private file lifecycle, Admin-only UI entry, no runtime DDL)');
