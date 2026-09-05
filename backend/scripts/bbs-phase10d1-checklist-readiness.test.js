'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { checklistReadiness } = require('../services/bbs-checklist');

const root = path.resolve(__dirname, '..', '..');
const context = { departmentId:18, safetyUnitId:2, positionId:1, bbsLevel:'Operator' };
const base = { MappingIsActive:1, TemplateIsActive:1, VersionID:1, VersionNo:1, VersionStatus:'Published', EffectiveFrom:'2026-01-01', EffectiveTo:null, TemplateName:'Tube Cutting Daily', DepartmentID:18, SafetyUnitID:2, PositionID:null, BBSLevel:'Operator', Priority:10 };
const readiness = [
    { asOf:'2026-09-01', context, candidates:[base] },
    { asOf:'2026-09-01', context, candidates:[{ ...base, VersionStatus:'Draft' }] },
    { asOf:'2026-09-01', context, candidates:[{ ...base, DepartmentID:19 }] },
    { asOf:'2026-09-01', context, candidates:[{ ...base, EffectiveFrom:'2026-10-01' }] },
    { asOf:'2026-09-01', context, candidates:[] },
    { asOf:'2026-09-01', context, candidates:[base,{ ...base, VersionID:2 }] },
];
const expected = readiness.map(row => checklistReadiness(row.candidates, row.context, row.asOf));
assert.deepStrictEqual(expected.map(row => row.code), ['READY','VERSION_NOT_PUBLISHED','SCOPE_MISMATCH','VERSION_NOT_EFFECTIVE','NO_CHECKLIST','CHECKLIST_CONFLICT']);
assert.strictEqual(expected[0].checklistVersionId, 1);
assert.ok(expected.slice(1).every(row => row.ready === false));

const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const runner = path.join(root, 'api', 'tests', 'bbs_checklist_fixture_runner.php');
const phpResult = spawnSync(php, [runner], { input:JSON.stringify({ readiness }), encoding:'utf8' });
assert.strictEqual(phpResult.status, 0, phpResult.stderr);
assert.deepStrictEqual(JSON.parse(phpResult.stdout).readiness, expected, 'Node/PHP Checklist Readiness parity mismatch');

const nodeRoute = fs.readFileSync(path.join(root, 'backend', 'routes', 'bbs-smart-card.js'), 'utf8');
const phpRoute = fs.readFileSync(path.join(root, 'api', 'handlers', 'bbs_smart_card.php'), 'utf8');
const nodeObservation = fs.readFileSync(path.join(root, 'backend', 'routes', 'bbs-observations.js'), 'utf8');
const phpObservation = fs.readFileSync(path.join(root, 'api', 'handlers', 'bbs_observations.php'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'bbs-smart-card.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

for (const source of [nodeRoute, phpRoute]) for (const marker of ['ChecklistReadiness','BBS_Checklist_Scope_Mappings','PositionID','SafetyUnitID']) assert.ok(source.includes(marker), `Eligible employee readiness missing ${marker}`);
for (const source of [fs.readFileSync(path.join(root, 'backend', 'services', 'bbs-checklist.js'), 'utf8'),fs.readFileSync(path.join(root, 'api', 'lib', 'bbs_checklist.php'), 'utf8')]) for (const marker of ['READY','NO_CHECKLIST','SCOPE_MISMATCH','VERSION_NOT_PUBLISHED','VERSION_NOT_EFFECTIVE','CHECKLIST_CONFLICT']) assert.ok(source.includes(marker), `Checklist readiness resolver missing ${marker}`);
for (const source of [nodeObservation, phpObservation]) for (const marker of ['resolveChecklist','batch-observations/preview','observations/draft']) assert.ok(source.includes(marker) || (marker === 'resolveChecklist' && source.includes('bbs_observation_resolve')), `Observation server guard missing ${marker}`);
for (const marker of ['function employeeChecklistReadiness(','function checklistReadinessBadge(','NO_CHECKLIST','Scope ไม่ตรง','Version ยังไม่ Published','data-batch-employee',':not(:disabled)','state.batchSelected.filter','ยังเริ่มตรวจไม่ได้']) assert.ok(ui.includes(marker), `Checklist readiness UI missing ${marker}`);
assert.match(ui, /data-batch-employee[^>]+disabled/);
assert.match(ui, /disabled[^>]+data-bbs-start/);
require('./bbs-runtime-assets').assertBbsRuntimeAssets();


console.log('BBS Phase 10D-1 Checklist Readiness & Observation Eligibility: PASS');
