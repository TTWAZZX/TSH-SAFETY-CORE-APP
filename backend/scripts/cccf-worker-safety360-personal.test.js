'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getCccfWorkerPersonalTargetResult } = require('../utils/cccf-worker-progress');

const root = path.resolve(__dirname, '..', '..');
const cases = [
    { employeeId: '002390', target: 237, actualTowardTarget: 1, rawRecords: 1, passPct: 100, targetSource: 'employee' },
    { employeeId: '000002', target: 2, actualTowardTarget: 1, rawRecords: 1, passPct: 80, targetSource: 'position' },
    { employeeId: '000003', target: 1, actualTowardTarget: 0, rawRecords: 0, passPct: 80, targetSource: 'employee' },
    { employeeId: '000004', target: 1, actualTowardTarget: 2, rawRecords: 2, passPct: 80, targetSource: 'unit' },
    { employeeId: '000005', target: 0, actualTowardTarget: 0, rawRecords: 0, passPct: 80, targetSource: 'position' },
];

const nodeResults = cases.map(row => getCccfWorkerPersonalTargetResult(row));
assert.strictEqual(nodeResults[0].completionPct, 100, 'Safety 360 must report 1/1 CCCF Worker as 100%');
assert.strictEqual(nodeResults[0].passed, true, 'Safety 360 must pass a completed 1/1 CCCF Worker target');
assert.strictEqual(nodeResults[0].yearlyTarget, 1, 'A coverage target of 237 people must become one personal submission target');
assert.strictEqual(nodeResults[0].configuredCoverageTarget, 237, 'The configured coverage target must remain available for audit');
assert.deepStrictEqual(nodeResults[0].calculationScope, { type: 'employee', employeeId: '002390' }, 'Leading-zero EmployeeID must remain a personal scope string');
assert.strictEqual(nodeResults[1].completionPct, 100, 'Any submitted Form A completes the binary personal requirement');
assert.strictEqual(nodeResults[1].passed, true);
assert.strictEqual(nodeResults[2].completionPct, 0);
assert.strictEqual(nodeResults[3].completionPct, 100, 'Personal completion must remain capped at 100%');
assert.strictEqual(nodeResults[4].completionPct, null, 'A zero personal target must not be presented as 0% completion');
assert.strictEqual(nodeResults[4].passed, null);

const phpCandidates = [process.env.PHP_BIN, 'C:\\xampp\\php\\php.exe', 'php'].filter(Boolean);
const phpBin = phpCandidates.find(candidate => candidate === 'php' || fs.existsSync(candidate));
assert.ok(phpBin, 'PHP runtime is required for CCCF Worker Safety 360 parity');
const phpResult = spawnSync(phpBin, [path.join(__dirname, 'cccf-worker-safety360-personal-fixture.php')], {
    cwd: root,
    input: JSON.stringify(cases),
    encoding: 'utf8',
});
assert.strictEqual(phpResult.status, 0, phpResult.stderr || 'PHP CCCF Worker Safety 360 fixture failed');
assert.deepStrictEqual(JSON.parse(phpResult.stdout), nodeResults, 'PHP and Node personal CCCF Worker calculations must remain identical');

const sources = {
    nodePeople: fs.readFileSync(path.join(root, 'backend', 'routes', 'person-search.js'), 'utf8'),
    nodeTargets: fs.readFileSync(path.join(root, 'backend', 'routes', 'activity-targets.js'), 'utf8'),
    phpPeople: fs.readFileSync(path.join(root, 'api', 'handlers', 'people.php'), 'utf8'),
    phpTargets: fs.readFileSync(path.join(root, 'api', 'handlers', 'targets.php'), 'utf8'),
};

assert.ok(sources.nodePeople.includes('personalCccfWorker.completionPct'), 'Node Safety 360 must prefer personal CCCF completion');
assert.ok(sources.nodePeople.includes('personalCccfWorker.calculationScope'), 'Node Safety 360 must expose employee calculation scope');
assert.ok(sources.nodeTargets.includes("measurementSource: personalCccfWorker ? 'employee_activity'"), 'Node My Targets must identify personal CCCF measurement');
assert.ok(sources.phpPeople.includes("$personalCccfWorker['completionPct']"), 'PHP Safety 360 must prefer personal CCCF completion');
assert.ok(sources.phpPeople.includes("$personalCccfWorker['calculationScope']"), 'PHP Safety 360 must expose employee calculation scope');
assert.ok(sources.phpTargets.includes("$personalCccfWorker ? 'employee_activity'"), 'PHP My Targets must identify personal CCCF measurement');
assert.ok(!sources.nodePeople.includes('const completionPct = ratio ? ratio.completionPct'), 'Node Safety 360 must not unconditionally prefer the Unit ratio');
assert.ok(!sources.phpPeople.includes("$completion = $ratio ? $ratio['completionPct']"), 'PHP Safety 360 must not unconditionally prefer the Unit ratio');

console.log(`CCCF Worker Safety 360 personal regression passed: ${cases.length} calculation cases with PHP/Node parity and both profile/target consumers guarded.`);
