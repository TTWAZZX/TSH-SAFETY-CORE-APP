'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const ui = read('public', 'js', 'pages', 'bbs-smart-card.js');
const main = read('public', 'js', 'main.js');
const html = read('index.html');
const nodeRoute = read('backend', 'routes', 'bbs-smart-card.js');
const phpHandler = read('api', 'handlers', 'bbs_smart_card.php');

for (const marker of [
    "API.get('/bbs/admin/foundation')",
    "API.get('/bbs/admin/foundation').catch(()=>({data:null}))",
    'state.masterReference=foundation.data',
    'departments:foundation.data.departments||state.communityAdmin.departments',
    'function masterDepartments()',
    'function masterBbsLevels()',
    '${masterDepartmentOptions()}',
    '${masterBbsLevelOptions()}',
    'data-master-source="departments"',
    'data-bbs-master-readiness',
    'Master Data &amp; Card Readiness',
    'POSITION_MAPPING_REQUIRED',
    'GROUP_LEADER_MAPPING_REQUIRED',
    'PERSONAL_CARD_EMPLOYEE_REQUIRED',
    'personalCardEmployeeEmptyState()'
]) {
    assert.ok(ui.includes(marker), `Phase 10B-1 UI missing ${marker}`);
}

assert.ok(!ui.includes('function departmentOptions()'), 'Personal Card must not derive Department options from eligible card employees.');
assert.ok(!ui.includes("${['Operator','Group Leader','Department Head','Section Head','Manager'].map"), 'Personal Card BBS Level options must come from Foundation.');
assert.match(main, /bbs-smart-card\.js\?v=20260831-bbs-phase10c[123]/);
assert.match(html, /main\.js\?v=20260831-bbs-phase10c[123]-forklift-renewal-ky-chunk-r1/);

for (const marker of [
    "router.get('/admin/foundation', isAdmin",
    'SELECT id,Name,Status,is_safety_core FROM Master_Departments',
    'SELECT id,Name FROM Master_Positions',
    'SELECT id,name,short_code,department_id FROM Master_SafetyUnits',
    'SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees'
]) {
    assert.ok(nodeRoute.includes(marker), `Node Foundation missing ${marker}`);
}

for (const marker of [
    "'departments' => db_rows('SELECT id,Name,Status,is_safety_core FROM master_departments",
    "'positions' => $positions",
    "'units' => db_rows('SELECT id,name,short_code,department_id FROM master_safetyunits",
    "'employees' => db_rows('SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM employees"
]) {
    assert.ok(phpHandler.includes(marker), `PHP Foundation missing ${marker}`);
}

console.log('BBS Phase 10B-1 Master Data/readiness contract: PASS');
