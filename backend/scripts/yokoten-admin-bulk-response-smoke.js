'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const frontend = read('public/js/pages/yokoten.js');
const nodeRoute = read('backend/routes/yokoten.js');
const phpRoute = read('api/handlers/workflow_phase6.php');

const checks = [];
function check(name, condition) {
    assert.ok(condition, name);
    checks.push(name);
}

check('Admin department picker uses directly clickable checkboxes',
    frontend.includes('type="checkbox" name="departments"')
        && frontend.includes('data-selection-group="departments"'));
check('Admin can select every unanswered department with one action',
    frontend.includes('data-selection-group="departments" data-selection-mode="all"')
        && frontend.includes('เลือกทั้งหมดที่ยังรอตอบ'));
check('Already answered departments are excluded from bulk selection',
    frontend.includes("${choice.responded ? 'disabled' : ''}")
        && frontend.includes('input[name="${groupName}"]:not(:disabled)'));
check('Selection count is visible and updated',
    frontend.includes('data-selection-count="departments"')
        && frontend.includes('function _syncAdminSelectionCount'));
check('Department payload remains an explicit JSON list',
    frontend.includes("fd.append('departments', JSON.stringify(departments));"));
check('One frontend submit continues to call the bulk-capable endpoint',
    frontend.includes("await API.post('/yokoten/respond', fd);"));
check('Node endpoint parses and inserts all requested departments',
    nodeRoute.includes('const requestedDepartments = parseDepartmentList(departments, department);')
        && nodeRoute.includes('const responseRows = targetDepartments.map(dept => ['));
check('Node endpoint rejects an already answered department before insert',
    nodeRoute.includes('Check if any selected dept already responded')
        && nodeRoute.includes('return res.status(409).json({'));
check('PHP endpoint parses a unique department list and inserts each department',
    phpRoute.includes('function wf_yokoten_departments')
        && phpRoute.includes('return array_values(array_unique($out));')
        && phpRoute.includes('foreach($depts as $dept){'));
check('PHP endpoint rejects an already answered department before insert',
    phpRoute.includes("'Selected department already responded.'")
        && phpRoute.includes("],409);"));

console.log(`Yokoten admin bulk-response smoke passed ${checks.length}/${checks.length}`);
for (const name of checks) console.log(`PASS ${name}`);
