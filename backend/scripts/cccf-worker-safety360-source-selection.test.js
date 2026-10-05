'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getCccfWorkerSafety360TargetResult } = require('../utils/cccf-worker-progress');

const root = path.resolve(__dirname, '..', '..');
const baseProgress = {
    employeeId: '002390', employeeName: 'อรอุมา นามลี', department: 'PRODUCTION 2 SEC.',
    unit: 'Production 2 Element', target: 237, passPct: 100, actualTowardTarget: 0,
    rawRecords: 0, targetSource: 'employee',
};
const cases = [
    { progress: baseProgress, unit: { unit: 'Production 2 Element', department: 'PRODUCTION 2 SEC.', unitTarget: 235, achievedOverride: 235, targetConfigured: true } },
    { progress: baseProgress, unit: { unit: 'Production 2 Element', department: 'PRODUCTION 2 SEC.', unitTarget: 235, achievedOverride: 0, targetConfigured: true } },
    { progress: { ...baseProgress, rawRecords: 1, actualTowardTarget: 1 }, unit: { unitTarget: 235, achievedOverride: null, targetConfigured: true } },
    { progress: baseProgress, unit: { unitTarget: 235, achievedOverride: null, targetConfigured: true } },
];

const nodeResults = cases.map(item => getCccfWorkerSafety360TargetResult(item.progress, item.unit));
assert.deepStrictEqual(
    { target: nodeResults[0].yearlyTarget, actual: nodeResults[0].actualCount, pct: nodeResults[0].completionPct, method: nodeResults[0].calculationMethod },
    { target: 235, actual: 235, pct: 100, method: 'cccf_worker_unit_achieved_override' },
    'Production-shaped Unit override must be the authoritative Safety 360 source'
);
assert.deepStrictEqual(nodeResults[0].calculationScope, { type: 'department_unit', department: 'PRODUCTION 2 SEC.', unit: 'Production 2 Element' });
assert.strictEqual(nodeResults[1].completionPct, 0, 'An explicit achieved override of zero is a real zero');
assert.strictEqual(nodeResults[1].noData, false);
assert.deepStrictEqual(
    { target: nodeResults[2].yearlyTarget, actual: nodeResults[2].actualCount, pct: nodeResults[2].completionPct, method: nodeResults[2].calculationMethod },
    { target: 1, actual: 1, pct: 100, method: 'cccf_worker_personal_binary_submission' },
    'Personal submission is the fallback only when no Unit achieved override exists'
);
assert.strictEqual(nodeResults[3].completionPct, 0);

const phpBin = [process.env.PHP_BIN, 'C:\\xampp\\php\\php.exe', 'php'].filter(Boolean).find(candidate => candidate === 'php' || fs.existsSync(candidate));
assert.ok(phpBin, 'PHP runtime is required');
const php = spawnSync(phpBin, [path.join(__dirname, 'cccf-worker-safety360-source-selection-fixture.php')], {
    cwd: root, input: JSON.stringify(cases), encoding: 'utf8',
});
assert.strictEqual(php.status, 0, php.stderr || 'PHP source-selection fixture failed');
assert.deepStrictEqual(JSON.parse(php.stdout), nodeResults, 'PHP/Node CCCF Worker Safety 360 source-selection parity');

console.log('CCCF Worker Safety 360 source selection passed: Unit achieved override precedence, explicit zero, personal fallback, PHP/Node parity.');
