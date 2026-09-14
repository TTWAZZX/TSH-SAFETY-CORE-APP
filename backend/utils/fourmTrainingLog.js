'use strict';

const AUDIT_SCHEMA_VERSION = 1;

function firstValue(source, keys, fallback = null) {
    for (const key of keys) {
        if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') {
            return source[key];
        }
    }
    return fallback ?? null;
}

function inferredStatus(action, side, source) {
    const explicit = firstValue(source, ['status', 'Status']);
    if (explicit !== null) return explicit;
    const isActive = firstValue(source, ['isActive', 'IsActive']);
    if (isActive !== null) return Number(isActive) === 1 ? 'Active' : 'Inactive';
    if (side !== 'after') return null;
    if (action.includes('REMOVE')) return 'Removed';
    if (action.includes('DISABLE')) return 'Inactive';
    if (action.includes('DELETE')) return 'Deleted';
    if (action.includes('ASSIGNMENT') && (action.includes('CREATE') || action.includes('REASSIGN') || action.includes('TRANSFER'))) return 'Assigned';
    if (action.includes('CREATE') || action.includes('LINK') || action.includes('RESTORE')) return 'Active';
    return null;
}

function entityTypeForAction(action) {
    if (action.includes('ASSIGNMENT')) return action.startsWith('CURRICULUM_') ? 'curriculum_assignment' : 'course_assignment';
    if (action.startsWith('COURSE_MASTER_')) return 'course_master';
    if (action.startsWith('COURSE_')) return 'course';
    if (action.startsWith('CURRICULUM_')) return 'curriculum';
    return 'training_matrix';
}

function standardizeTrainingLogSnapshot({ action = '', side = 'after', value = null, context = {} } = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
    const normalizedAction = String(action || '').toUpperCase();
    const entityType = entityTypeForAction(normalizedAction);
    const sourceDepartment = firstValue(source, ['Department']);
    const isAssignment = entityType.includes('assignment');
    return {
        ...source,
        auditSchemaVersion: AUDIT_SCHEMA_VERSION,
        snapshotSide: side === 'before' ? 'before' : 'after',
        entityType,
        employeeId: firstValue(source, ['employeeId', 'EmployeeID'], context.employeeId),
        employeeName: firstValue(source, ['employeeName', 'EmployeeName'], context.employeeName),
        employeeDepartment: firstValue(source, ['employeeDepartment', 'EmployeeDepartment'], isAssignment ? sourceDepartment : context.employeeDepartment),
        employeeUnit: firstValue(source, ['employeeUnit', 'EmployeeUnit', 'Unit'], context.employeeUnit),
        employeePosition: firstValue(source, ['employeePosition', 'EmployeePosition', 'Position'], context.employeePosition),
        curriculumId: firstValue(source, ['curriculumId', 'CurriculumID', 'TargetCurriculumID'], context.curriculumId),
        curriculumCode: firstValue(source, ['curriculumCode', 'CurriculumCode'], context.curriculumCode),
        curriculumTitle: firstValue(source, ['curriculumTitle', 'CurriculumTitle'], context.curriculumTitle),
        curriculumDepartment: firstValue(source, ['curriculumDepartment', 'CurriculumDepartment'], isAssignment ? context.curriculumDepartment : (sourceDepartment ?? context.curriculumDepartment)),
        year: firstValue(source, ['year', 'Year'], context.year),
        courseId: firstValue(source, ['courseId', 'CourseID', 'TargetCourseID'], context.courseId),
        courseCode: firstValue(source, ['courseCode', 'CourseCode'], context.courseCode),
        courseTitle: firstValue(source, ['courseTitle', 'CourseTitle'], context.courseTitle),
        assignmentId: firstValue(source, ['assignmentId', 'AssignmentID', 'id'], context.assignmentId),
        status: inferredStatus(normalizedAction, side, source),
        notes: firstValue(source, ['notes', 'Notes'], context.notes),
        reactivated: Boolean(firstValue(source, ['reactivated', 'Reactivated'], false)),
    };
}

module.exports = {
    AUDIT_SCHEMA_VERSION,
    standardizeTrainingLogSnapshot,
};
