'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { standardizeTrainingLogSnapshot } = require('../utils/fourmTrainingLog');
const { TRAINING_LOG_ACTIONS, LEGACY_TRAINING_LOG_ACTIONS } = require('../utils/fourmTrainingLogActions');

assert.strictEqual(new Set(TRAINING_LOG_ACTIONS).size, 22, 'expected 22 unique Training Matrix actions');
const context = {
    employeeId: 'E001', employeeName: 'Employee One', employeeDepartment: 'DEPT A', employeeUnit: 'UNIT A', employeePosition: 'Operator',
    curriculumId: 'CUR-1', curriculumCode: 'CUR01', curriculumTitle: 'Curriculum', curriculumDepartment: 'DEPT A', year: 2026,
    courseId: 'COURSE-1', courseCode: 'C01', courseTitle: 'Course', assignmentId: 'ASSIGN-1',
};
for (const action of TRAINING_LOG_ACTIONS) {
    const before = standardizeTrainingLogSnapshot({ action, side: 'before', value: { Status: 'Assigned' }, context });
    const after = standardizeTrainingLogSnapshot({ action, side: 'after', value: {}, context });
    assert.strictEqual(before.auditSchemaVersion, 1, `${action}: before schema`);
    assert.strictEqual(after.auditSchemaVersion, 1, `${action}: after schema`);
    assert.strictEqual(before.snapshotSide, 'before', `${action}: before side`);
    assert.strictEqual(after.snapshotSide, 'after', `${action}: after side`);
    assert.ok(after.entityType, `${action}: entity type`);
    assert.strictEqual(after.curriculumId, 'CUR-1', `${action}: curriculum context`);
    if (action.includes('ASSIGNMENT')) assert.strictEqual(after.employeeId, 'E001', `${action}: employee context`);
    if (action.startsWith('COURSE_') && !action.startsWith('COURSE_MASTER_')) assert.strictEqual(after.courseId, 'COURSE-1', `${action}: course context`);
    if (action.includes('REMOVE')) assert.strictEqual(after.status, 'Removed', `${action}: removed status`);
    if (action.includes('DISABLE')) assert.strictEqual(after.status, 'Inactive', `${action}: inactive status`);
    if (action.includes('DELETE')) assert.strictEqual(after.status, 'Deleted', `${action}: deleted status`);
}

const node = fs.readFileSync(path.join(__dirname, '..', 'routes', 'fourm.js'), 'utf8');
const php = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'handlers', 'fourm_phase7.php'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'pages', 'fourm.js'), 'utf8');
for (const action of LEGACY_TRAINING_LOG_ACTIONS) assert.ok(ui.includes(`'${action}'`), `UI filter missing recognized legacy action ${action}`);
for (const action of TRAINING_LOG_ACTIONS) {
    assert.ok(node.includes(`'${action}'`), `Node writer missing ${action}`);
    assert.ok(ui.includes(`'${action}'`), `UI filter missing ${action}`);
}
for (const action of TRAINING_LOG_ACTIONS.filter(action => !action.endsWith('ASSIGNMENT_CREATE') && !action.endsWith('ASSIGNMENT_REASSIGN'))) {
    assert.ok(php.includes(`'${action}'`), `PHP writer missing ${action}`);
}
assert.match(php, /\$prefix=\$kind==='curriculum'\?'CURRICULUM_ASSIGNMENT':'ASSIGNMENT'/);
assert.match(php, /\$prefix\.\(\$old\?'_REASSIGN':'_CREATE'\)/);

console.log(`4M Training Matrix all-action tests passed (${TRAINING_LOG_ACTIONS.length} actions).`);
