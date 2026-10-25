'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const rules = require('../services/safety-vote-work-items');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const fixtures = [
    { workSource: 'admin_curated', works: [{ workCode: 'WORK-01', title: 'ผลงานหนึ่ง', description: 'รายละเอียด' }] },
    { workSource: 'employee_submission', works: [] },
    { workSource: 'imported', works: [{ sourceCandidateId: 42, workCode: 'IMPORT-01', title: 'ผลงานนำเข้า' }] },
    { workSource: 'imported', works: [{ workCode: 'BROKEN', title: 'ไม่มีต้นทาง' }] },
];
const nodeResult = fixtures.map(item => rules.parse(item));
const phpBin = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const phpLib = path.join(root, 'api', 'lib', 'safety_vote_work_items.php').replace(/\\/g, '/');
const phpCode = `require '${phpLib}'; $rows=json_decode(base64_decode($argv[1]),true); echo json_encode(array_map('svwi_parse',$rows),JSON_UNESCAPED_UNICODE);`;
const php = spawnSync(phpBin, ['-r', phpCode, Buffer.from(JSON.stringify(fixtures)).toString('base64')], { encoding: 'utf8', windowsHide: true });
assert.strictEqual(php.status, 0, php.stderr);
assert.deepStrictEqual(JSON.parse(php.stdout), nodeResult, 'Node/PHP work-item validation parity');
assert.strictEqual(nodeResult[0].ok, true);
assert.strictEqual(nodeResult[1].ok, true);
assert.strictEqual(nodeResult[2].ok, true);
assert.strictEqual(nodeResult[3].ok, false);

const nodeRoute = read('backend/routes/safety-vote-work-items.js');
const phpRoute = read('api/handlers/safety_vote_work_items.php');
const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
const userPage = read('public/js/pages/safety-vote-page-ux1.js');
const phase2Node = read('backend/routes/safety-vote-phase2.js');
const phase2Php = read('api/handlers/safety_vote_phase2.php');
for (const source of [nodeRoute, phpRoute]) {
    assert(source.includes('/admin/campaigns/:id/works'));
    assert(source.includes('/campaigns/:id/works'));
    assert(source.includes('/admin/campaigns/:id/media/atomic'));
    assert(source.includes('SafetyVote_MediaMutations'));
    assert(source.includes('serverConfirmed'));
    assert(source.includes('Idempotency') || source.includes('IDEMPOTENCY'));
}
assert(wizard.includes('ผลงาน ไม่ใช่คำถามให้คะแนน'));
assert(wizard.includes('data-svw-action="add-work"'));
assert(wizard.includes('/media/atomic'));
assert(userPage.includes('data-svp-public-work-gallery'));
assert(userPage.includes('/works`'));
assert(phase2Node.includes('frozenContent(c.CurrentVersionID,c.CampaignType'));
assert(phase2Php.includes("sv2_frozen_content((int)$c['CurrentVersionID'],(string)$c['CampaignType'])"));
console.log('Safety Vote Phase 5B + Phase 6 Backend static/parity contract: PASS');
