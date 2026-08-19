'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildKySafetyCoreCountMap } = require('../utils/safety-core-ky');

const employees = [
    { EmployeeID: 'P1-U1', EmployeeName: 'P1 Unit One', Department: 'PRODUCTION 1 SEC.', Unit: 'Unit A' },
    { EmployeeID: 'P1-U2', EmployeeName: 'P1 Unit Two', Department: 'PRODUCTION 1 SEC.', Unit: 'Unit B' },
    { EmployeeID: 'P1-MGR', EmployeeName: 'P1 Manager', Department: 'PRODUCTION 1 SEC.', Unit: '' },
    { EmployeeID: 'P2-U1', EmployeeName: 'P2 Unit One', Department: 'PRODUCTION 2 SEC.', Unit: 'Unit A' },
];

const rows = [
    { id: 1, ActivityDate: '2026-01-05', Department: 'PRODUCTION 1 SEC.', SafetyUnit: 'Unit A' },
    { id: 2, ActivityDate: new Date(2026, 0, 20), Department: 'PRODUCTION 1 SEC.', SafetyUnit: 'Unit A' },
    { id: 3, ActivityDate: '2026-02-05', Department: 'PRODUCTION 1 SEC.', SafetyUnit: 'Unit B' },
    { id: 4, ActivityDate: '2026-03-05', Department: 'PRODUCTION 1 SEC.', SafetyUnit: '' },
    { id: 5, ActivityDate: '2026-04-05', Department: 'PRODUCTION 2 SEC.', SafetyUnit: 'Unit A' },
    { id: 6, ActivityDate: '2026-05-05', Department: 'PRODUCTION 1 SEC.', SafetyUnit: 'Unknown', Participants: '[{"EmployeeID":"P1-U1"}]' },
];

const expected = {
    'P1-U1': 3,
    'P1-U2': 2,
    'P1-MGR': 4,
    'P2-U1': 1,
};

const nodeResult = Object.fromEntries(buildKySafetyCoreCountMap(rows, employees));
assert.deepStrictEqual(nodeResult, expected, 'KY count must be monthly and scoped by Department + Safety Unit');
assert.ok(nodeResult['P1-MGR'] <= 12, 'department fallback must count distinct months, not every unit submission');

const phpCandidates = [process.env.PHP_BIN, 'C:\\xampp\\php\\php.exe', 'php'].filter(Boolean);
const phpBin = phpCandidates.find(candidate => candidate === 'php' || fs.existsSync(candidate));
assert.ok(phpBin, 'PHP runtime is required for Safety Core KY parity.');
const phpResult = spawnSync(
    phpBin,
    [path.join(__dirname, 'safety-core-ky-count-fixture.php')],
    { input: JSON.stringify({ rows, employees }), encoding: 'utf8' }
);
assert.strictEqual(phpResult.status, 0, phpResult.stderr || 'PHP Safety Core KY fixture failed.');
assert.deepStrictEqual(JSON.parse(phpResult.stdout), expected, 'Node/PHP Safety Core KY count parity');

console.log('PASS Safety Core KY monthly Department/Unit scope and Node/PHP parity');
