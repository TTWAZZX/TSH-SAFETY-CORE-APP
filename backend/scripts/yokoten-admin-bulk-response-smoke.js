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

check('Admin department picker uses directly clickable accessible controls',
    frontend.includes('class="yok-admin-selection-item')
        && frontend.includes('data-selection-group="departments"')
        && frontend.includes('role="checkbox"'));
check('Admin can select every unanswered department with one action',
    frontend.includes('data-selection-group="departments" data-selection-mode="all"')
        && frontend.includes('เลือกทั้งหมดที่ยังรอตอบ'));
check('Already answered departments are excluded from bulk selection',
    frontend.includes("${choice.responded ? 'disabled' : ''}")
        && frontend.includes('filter(item => !item.disabled)'));
check('Selection count is visible and updated',
    frontend.includes('data-selection-count="departments"')
        && frontend.includes('function _syncAdminSelectionCount'));
check('Department payload remains an explicit JSON list',
    frontend.includes("fd.append('departments', JSON.stringify(departments));"));
check('Department-to-Unit payload is explicit and generated from selected controls',
    frontend.includes('function _getAdminDepartmentUnitMap')
        && frontend.includes("fd.append('departmentUnits', JSON.stringify(departmentUnits));"));
check('Select-all Departments also selects matching scoped Units',
    frontend.includes('_renderAdminUnitSelection(form, { selectAll: shouldSelect })')
        && frontend.includes('data-admin-unit-list'));
check('One frontend submit continues to call the bulk-capable endpoint',
    frontend.includes("await API.post('/yokoten/respond', fd);"));
check('Node endpoint parses and inserts all requested departments',
    nodeRoute.includes('const requestedDepartments = parseDepartmentList(departments, department);')
        && nodeRoute.includes('const responseRows = targetDepartments.map(dept => ['));
check('Node endpoint validates and stores Units per Department',
    nodeRoute.includes('buildDepartmentUnitPlan({')
        && nodeRoute.includes('departmentUnitPlan.unitMap[dept]'));
check('Node endpoint locks the selected department scope in one transaction',
    nodeRoute.includes('await connection.beginTransaction();')
        && nodeRoute.includes('FOR UPDATE')
        && nodeRoute.includes('await connection.commit();'));
check('Node endpoint rejects an active response before persistence',
    nodeRoute.includes('const activeExisting = existingRows.filter')
        && nodeRoute.includes('return res.status(409).json({'));
check('Node endpoint safely reuses a soft-deleted slot without changing ResponseID',
    nodeRoute.includes('const deletedByDepartment = new Map();')
        && nodeRoute.includes('row[0] = deletedRow.ResponseID;')
        && nodeRoute.includes("'DELETE FROM Yokoten_Response_Files WHERE ResponseID = ?'")
        && nodeRoute.includes('SET SafetyUnit=?, EmployeeID=?')
        && nodeRoute.includes('IsDeleted=0')
        && !nodeRoute.includes('SET ResponseID=?, SafetyUnit=?'));
check('Node bulk response queues notifications without synchronous SMTP delivery',
    nodeRoute.includes('const attemptImmediate = responseRows.length === 1;')
        && nodeRoute.includes('{ attemptImmediate }'));
check('PHP endpoint parses a unique department list and inserts each department',
    phpRoute.includes('function wf_yokoten_departments')
        && phpRoute.includes('return array_values(array_unique($out));')
        && phpRoute.includes('foreach($depts as $dept){'));
check('PHP endpoint validates and stores Units per Department',
    phpRoute.includes('yokoten_scope_build_department_unit_plan([')
        && phpRoute.includes("$departmentUnitPlan['unitMap'][$dept]"));
check('PHP endpoint rejects an active response before persistence',
    phpRoute.includes("'Selected department already responded.'")
        && phpRoute.includes("],409);"));
check('PHP endpoint locks the selected department scope in one transaction',
    phpRoute.includes('$pdo=db();$ownsTransaction=!$pdo->inTransaction()')
        && phpRoute.includes('FOR UPDATE')
        && phpRoute.includes('if($ownsTransaction)$pdo->commit();'));
check('PHP endpoint safely reuses a soft-deleted slot without changing ResponseID',
    phpRoute.includes('$deletedByDepartment=[];')
        && phpRoute.includes("$rid=(string)$deletedRow['ResponseID'];")
        && phpRoute.includes("'DELETE FROM yokoten_response_files WHERE ResponseID=?'")
        && phpRoute.includes('SET SafetyUnit=?,EmployeeID=?')
        && phpRoute.includes('IsDeleted=0')
        && !phpRoute.includes('SET ResponseID=?,SafetyUnit=?'));
check('PHP bulk response queues notifications without synchronous SMTP delivery',
    phpRoute.includes('$attemptImmediate=count($ids)===1;')
        && phpRoute.includes("'notificationMode'=>"));

console.log(`Yokoten admin bulk-response smoke passed ${checks.length}/${checks.length}`);
for (const name of checks) console.log(`PASS ${name}`);
