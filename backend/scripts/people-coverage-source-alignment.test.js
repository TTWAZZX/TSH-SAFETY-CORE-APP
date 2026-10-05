'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const node = fs.readFileSync(path.join(root, 'backend', 'routes', 'activity-targets.js'), 'utf8');
const php = fs.readFileSync(path.join(root, 'api', 'handlers', 'targets.php'), 'utf8');

for (const [runtime, source] of [['Node', node], ['PHP', php]]) {
    assert.ok(source.includes('distinct_worker_submitters'), `${runtime} must expose distinct CCCF Worker submitter coverage`);
    assert.ok(source.includes('distinct_permanent_assignees'), `${runtime} must expose distinct CCCF Permanent assignee coverage`);
    assert.ok(source.includes('department_attendee_snapshot'), `${runtime} must retain the SCW attendee snapshot source`);
    assert.ok(source.includes('distinct_passed_employees'), `${runtime} must expose distinct passed Training employees`);
    assert.ok(source.includes('distinct_near_miss_reporters'), `${runtime} must expose distinct Hiyari reporters`);
    assert.ok(/COUNT\(DISTINCT COALESCE\([\s\S]*AssigneeID[\s\S]*SubmitterName/.test(source), `${runtime} Permanent coverage must use stable assignee/legacy keys`);
    assert.ok(/COUNT\(DISTINCT NULLIF\(TRIM\([^)]*EmployeeID/.test(source), `${runtime} Training coverage must ignore blank/whitespace employee IDs`);
    assert.ok(/COUNT\(DISTINCT NULLIF\(TRIM\([^)]*ReporterID/.test(source), `${runtime} Hiyari coverage must ignore blank/whitespace reporter IDs`);
}

assert.ok(/CCCF_FormA_Permanent[\s\S]*AssigneeID = \?[\s\S]*AssigneeID IS NULL[\s\S]*SubmitterName/.test(node), 'Node My Targets must prefer AssigneeID and use the name only for identity-less legacy rows');
assert.ok(/cccf_forma_permanent[\s\S]*AssigneeID=\?[\s\S]*AssigneeID IS NULL[\s\S]*SubmitterName/.test(php), 'PHP My Targets must prefer AssigneeID and use the name only for identity-less legacy rows');

const nodePeople = fs.readFileSync(path.join(root, 'backend', 'routes', 'person-search.js'), 'utf8');
const phpPeople = fs.readFileSync(path.join(root, 'api', 'handlers', 'people.php'), 'utf8');
for (const [runtime, source] of [['Node Safety 360', nodePeople], ['PHP Safety 360', phpPeople]]) {
    assert.ok(source.includes('AssigneeID'), `${runtime} must use the canonical permanent assignee ID`);
    assert.ok(source.includes('AssigneeID IS NULL'), `${runtime} must retain legacy-name fallback only when assignee identity is absent`);
    assert.ok(source.includes('SubmitterName'), `${runtime} must retain readable legacy Permanent history`);
}

console.log('People Coverage source alignment passed: CCCF Worker/Permanent, SCW, Training and Hiyari contracts agree across PHP and Node.');
