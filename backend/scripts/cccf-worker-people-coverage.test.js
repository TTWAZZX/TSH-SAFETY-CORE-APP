'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const nodeTargets = fs.readFileSync(path.join(root, 'backend', 'routes', 'activity-targets.js'), 'utf8');
const phpTargets = fs.readFileSync(path.join(root, 'api', 'handlers', 'targets.php'), 'utf8');
const nodePeople = fs.readFileSync(path.join(root, 'backend', 'routes', 'person-search.js'), 'utf8');
const phpPeople = fs.readFileSync(path.join(root, 'api', 'handlers', 'people.php'), 'utf8');

function workerPersonKey(row) {
    const employeeId = String(row.EmployeeID || '').trim();
    if (employeeId) return `id:${employeeId}`;
    const employeeName = String(row.EmployeeName || '').trim().toLocaleLowerCase();
    return employeeName ? `name:${employeeName}` : null;
}

const fixtures = [
    { EmployeeID: '002390', EmployeeName: 'อรอุมา นามลี' },
    { EmployeeID: '002390', EmployeeName: 'อรอุมา นามลี' },
    { EmployeeID: '000002', EmployeeName: 'Second Person' },
    { EmployeeID: '', EmployeeName: ' Legacy Person ' },
    { EmployeeID: null, EmployeeName: 'legacy person' },
    { EmployeeID: '', EmployeeName: '' },
];
const distinctPeople = new Set(fixtures.map(workerPersonKey).filter(Boolean));
assert.deepStrictEqual([...distinctPeople], ['id:002390', 'id:000002', 'name:legacy person']);
assert.strictEqual(distinctPeople.size, 3, 'Repeated forms must count people once and legacy names must use a stable fallback');

for (const [runtime, source] of [['Node', nodeTargets], ['PHP', phpTargets]]) {
    assert.ok(source.includes("CONCAT('id:'"), `${runtime} Worker coverage must preserve EmployeeID as a string identity`);
    assert.ok(source.includes("CONCAT('name:'"), `${runtime} Worker coverage must retain a normalized legacy-name fallback`);
    assert.ok(source.includes('distinct_worker_submitters'), `${runtime} Worker coverage must expose the aligned calculation method`);
}
assert.ok(/COUNT\(DISTINCT COALESCE\([\s\S]*EmployeeID[\s\S]*EmployeeName/.test(nodeTargets), 'Node Worker coverage must count distinct stable submitter keys');
assert.ok(/COUNT\(DISTINCT COALESCE\([\s\S]*EmployeeID[\s\S]*EmployeeName/.test(phpTargets), 'PHP Worker coverage must count distinct stable submitter keys');
assert.ok(!/SELECT COUNT\(\*\) AS numerator\s+FROM CCCF_FormA_Worker/.test(nodeTargets), 'Node Worker coverage must not count forms as people');
assert.ok(!/SELECT COUNT\(\*\) AS numerator FROM cccf_forma_worker/.test(phpTargets), 'PHP Worker coverage must not count forms as people');

assert.ok(/personalCccfWorker\s*\?\s*personalCccfWorker\.completionPct/.test(nodePeople), 'Node Safety 360 must keep personal progress ahead of scope coverage');
assert.ok(/\$personalCccfWorker\s*\?\s*\$personalCccfWorker\['completionPct'\]/.test(phpPeople), 'PHP Safety 360 must keep personal progress ahead of scope coverage');
assert.ok(/personalCccfWorker\s*\?\s*personalCccfWorker\.completionPct/.test(nodeTargets), 'Node My Targets must keep personal progress ahead of scope coverage');
assert.ok(/\$personalCccfWorker\s*\?\s*\$personalCccfWorker\['completionPct'\]/.test(phpTargets), 'PHP My Targets must keep personal progress ahead of scope coverage');
assert.ok(nodePeople.includes("if (activity.key === 'cccf_worker') continue;"), 'Node Safety 360 must never substitute scope coverage for personal CCCF progress');
assert.ok(phpPeople.includes("if ($activity['key'] === 'cccf_worker') continue;"), 'PHP Safety 360 must never substitute scope coverage for personal CCCF progress');
assert.ok(nodeTargets.includes("if (activity.key === 'cccf_worker') continue;"), 'Node My Targets must never substitute scope coverage for personal CCCF progress');
assert.ok(phpTargets.includes("if ($activity['key'] === 'cccf_worker') continue;"), 'PHP My Targets must never substitute scope coverage for personal CCCF progress');

console.log('CCCF Worker People Coverage regression passed: distinct submitters, legacy fallback, leading-zero IDs, PHP/Node query parity, and personal-over-scope precedence.');
