'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { standardizeTrainingLogSnapshot } = require('../utils/fourmTrainingLog');

const root = path.resolve(__dirname, '..', '..');
const nodeRoute = fs.readFileSync(path.join(root, 'backend', 'routes', 'fourm.js'), 'utf8');
const phpHandler = fs.readFileSync(path.join(root, 'api', 'handlers', 'fourm_phase7.php'), 'utf8');

const context = {
    employeeId: '012345',
    employeeName: 'Somchai Safety',
    employeeDepartment: 'PRODUCTION 1 SEC.',
    employeeUnit: 'ASSEMBLY',
    employeePosition: 'Operator',
    curriculumId: 'cur-new',
    curriculumCode: 'PD1CU35',
    curriculumTitle: 'Element 35',
    curriculumDepartment: 'PRODUCTION 1 SEC.',
    year: 2026,
    courseId: 'course-new',
    courseCode: 'PD101002',
    courseTitle: 'Machine Safety',
};

const assigned = standardizeTrainingLogSnapshot({
    action: 'ASSIGNMENT_CREATE',
    side: 'after',
    value: { EmployeeID: '012345', EmployeeName: 'Somchai Safety', Notes: 'Initial scope' },
    context,
});
assert.strictEqual(assigned.auditSchemaVersion, 1);
assert.strictEqual(assigned.snapshotSide, 'after');
assert.strictEqual(assigned.entityType, 'course_assignment');
assert.strictEqual(assigned.employeeId, '012345');
assert.strictEqual(assigned.employeeUnit, 'ASSEMBLY');
assert.strictEqual(assigned.curriculumCode, 'PD1CU35');
assert.strictEqual(assigned.courseCode, 'PD101002');
assert.strictEqual(assigned.status, 'Assigned');
assert.strictEqual(assigned.notes, 'Initial scope');

const assignmentDepartments = standardizeTrainingLogSnapshot({
    action: 'ASSIGNMENT_CREATE',
    side: 'after',
    value: { Department: 'EMPLOYEE DEPT' },
    context: { ...context, curriculumDepartment: 'CURRICULUM DEPT' },
});
assert.strictEqual(assignmentDepartments.employeeDepartment, 'EMPLOYEE DEPT');
assert.strictEqual(assignmentDepartments.curriculumDepartment, 'CURRICULUM DEPT');

const curriculumDepartments = standardizeTrainingLogSnapshot({
    action: 'CURRICULUM_UPDATE',
    side: 'after',
    value: { Department: 'NEW CURRICULUM DEPT' },
    context,
});
assert.strictEqual(curriculumDepartments.employeeDepartment, context.employeeDepartment);
assert.strictEqual(curriculumDepartments.curriculumDepartment, 'NEW CURRICULUM DEPT');

const moved = standardizeTrainingLogSnapshot({
    action: 'CURRICULUM_ASSIGNMENT_TRANSFER',
    side: 'after',
    value: { TargetCurriculumID: 'cur-new', Status: 'Assigned', Reactivated: true },
    context,
});
assert.strictEqual(moved.entityType, 'curriculum_assignment');
assert.strictEqual(moved.curriculumId, 'cur-new');
assert.strictEqual(moved.curriculumCode, 'PD1CU35');
assert.strictEqual(moved.employeeName, 'Somchai Safety');
assert.strictEqual(moved.status, 'Assigned');
assert.strictEqual(moved.reactivated, true);

const disabled = standardizeTrainingLogSnapshot({
    action: 'COURSE_DISABLE',
    side: 'after',
    context,
});
assert.strictEqual(disabled.entityType, 'course');
assert.strictEqual(disabled.status, 'Inactive');

const standardKeys = [
    'auditSchemaVersion', 'snapshotSide', 'entityType',
    'employeeId', 'employeeName', 'employeeDepartment', 'employeeUnit', 'employeePosition',
    'curriculumId', 'curriculumCode', 'curriculumTitle', 'curriculumDepartment', 'year',
    'courseId', 'courseCode', 'courseTitle', 'assignmentId', 'status', 'notes', 'reactivated',
];
for (const key of standardKeys) {
    assert.ok(Object.prototype.hasOwnProperty.call(assigned, key), `Node snapshot is missing ${key}`);
    assert.match(phpHandler, new RegExp(`\\$source\\['${key}'\\]`), `PHP snapshot is missing ${key}`);
}

assert.match(nodeRoute, /standardizeTrainingLogSnapshot/);
assert.match(nodeRoute, /resolveTrainingLogContext/);
assert.match(nodeRoute, /TargetCurriculumID/);
assert.match(nodeRoute, /TargetCourseID/);
assert.match(nodeRoute, /EmployeeName AS employeeName/);
assert.match(nodeRoute, /action: existing \? 'COURSE_RESTORE' : 'COURSE_CREATE'/);
assert.match(phpHandler, /function fm_log_context/);
assert.match(phpHandler, /function fm_log_snapshot/);
assert.match(phpHandler, /fm_log_snapshot\(\$action,'before'/);
assert.match(phpHandler, /fm_log_snapshot\(\$action,'after'/);
assert.match(phpHandler, /function fm_assign\([^)]*bool \$writeLog=true/);
assert.match(phpHandler, /if\(\$writeLog\)fm_log/);
assert.strictEqual((phpHandler.match(/\],false\);fm_log\(\$u,'(?:CURRICULUM_)?ASSIGNMENT_TRANSFER'/g) || []).length, 2,
    'PHP curriculum and course transfers must suppress implicit destination assignment logs');

console.log('4M Training Matrix log contract tests passed.');
