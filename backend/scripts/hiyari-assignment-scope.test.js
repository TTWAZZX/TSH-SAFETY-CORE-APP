'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const frontend = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'hiyari.js'), 'utf8');
const nodeRoute = fs.readFileSync(path.join(root, 'backend', 'routes', 'hiyari.js'), 'utf8');
const phpRoute = fs.readFileSync(path.join(root, 'api', 'handlers', 'workflow_phase6.php'), 'utf8');

for (const source of [nodeRoute, phpRoute]) {
    assert.ok(source.includes('assignmentScope'), 'Both runtimes must accept the assignmentScope contract');
    assert.ok(source.includes('HasAssignment'), 'Both runtimes must project HasAssignment on list rows');
    assert.ok(source.includes('EXISTS (SELECT 1 FROM'), 'Assigned scope must be resolved by the server');
    assert.ok(source.includes('NOT EXISTS (SELECT 1 FROM'), 'Outside scope must be resolved by the server');
}

assert.ok(nodeRoute.includes("req.query.assignmentScope || 'all'"), 'Node must preserve legacy all-row behavior when scope is omitted');
assert.ok(phpRoute.includes("$_GET['assignmentScope']??'all'"), 'PHP must preserve legacy all-row behavior when scope is omitted');

assert.ok(frontend.includes("let _filterAssignmentScope = 'assigned';"), 'History must default to assigned reports');
assert.ok(frontend.includes("assignmentScope:'assigned'"), 'Dashboard must request assigned-only statistics');
assert.ok(frontend.includes("params.set('assignmentScope', 'assigned')"), 'Admin review/year export must request assigned-only reports');
assert.ok(frontend.includes("params.set('assignmentScope', _filterAssignmentScope)"), 'History must request only its selected server scope');
assert.ok(frontend.includes("outsideParams.set('assignmentScope', 'outside')"), 'History must retain a dedicated outside-Assignment audit query');
assert.ok(frontend.includes("${hasAssignment ? 'มี Assignment' : 'นอก Assignment'}"), 'History rows must show their Assignment status');
assert.ok(frontend.includes('ไม่นำไปรวมใน Dashboard, Rank และ KPI ของ Assignment'), 'Outside warning must explain metric exclusion');
assert.ok(frontend.includes('const reports = normalizeApiArray(data.reports || [])'), 'PDF overview must use the same scoped reports as its KPI payload');
assert.ok(frontend.includes('const assignmentReports = normalizeApiArray(assignmentKpi?.reports || [])'), 'PDF Assignment roster must retain its annual progress dataset');
assert.ok(frontend.includes("_buildAssignmentRoster(assignmentKpi?.assignments || [], assignmentReports, _statsYear)"), 'PDF roster must not replace scoped dashboard reports');
assert.ok(frontend.includes("metricCard('รายงานใน Assignment'"), 'PDF overview must label its report scope explicitly');
assert.ok(frontend.includes("metricCard('ยังไม่ส่ง'"), 'PDF overview must expose the remaining Assignment follow-up count');

console.log('Hiyari Assignment scope regression passed.');
