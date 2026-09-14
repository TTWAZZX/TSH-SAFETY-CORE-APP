'use strict';

const assert = require('assert');
const db = require('../db');
const { TRAINING_LOG_ACTIONS, LEGACY_TRAINING_LOG_ACTIONS } = require('../utils/fourmTrainingLogActions');

function parseSnapshot(value) {
    if (value == null || value === '') return { value: null, invalid: false };
    if (typeof value === 'object') return { value, invalid: false };
    try { return { value: JSON.parse(value), invalid: false }; }
    catch { return { value: null, invalid: true }; }
}

(async () => {
    const [rows] = await db.query(
        `SELECT id,Action,CurriculumID,CourseID,EmployeeID,OldValue,NewValue,PerformedByID,PerformedBy,PerformedAt
         FROM FourM_CurriculumLogs ORDER BY id`
    );
    const actionCounts = new Map();
    let legacyRows = 0;
    let canonicalRows = 0;
    let invalidOldJson = 0;
    let invalidNewJson = 0;
    let missingActor = 0;
    let malformedCanonical = 0;
    const canonicalKeys = ['auditSchemaVersion','snapshotSide','entityType','curriculumId','status','reactivated'];
    for (const row of rows) {
        actionCounts.set(row.Action, (actionCounts.get(row.Action) || 0) + 1);
        const oldSnapshot = parseSnapshot(row.OldValue);
        const newSnapshot = parseSnapshot(row.NewValue);
        if (oldSnapshot.invalid) invalidOldJson += 1;
        if (newSnapshot.invalid) invalidNewJson += 1;
        if (!row.PerformedByID && !row.PerformedBy) missingActor += 1;
        const isCanonical = Number(newSnapshot.value?.auditSchemaVersion) === 1;
        if (isCanonical) {
            canonicalRows += 1;
            if (canonicalKeys.some(key => !(key in newSnapshot.value))) malformedCanonical += 1;
        } else legacyRows += 1;
    }
    for (const [action, count] of actionCounts) {
        const [[verified]] = await db.query('SELECT COUNT(*) total FROM FourM_CurriculumLogs WHERE Action=?', [action]);
        assert.strictEqual(Number(verified.total), count, `Action filter mismatch: ${action}`);
    }
    const [[orphans]] = await db.query(
        `SELECT
            SUM(l.CurriculumID IS NOT NULL AND c.id IS NULL) orphanCurriculum,
            SUM(l.CourseID IS NOT NULL AND co.id IS NULL) orphanCourse,
            SUM(l.EmployeeID IS NOT NULL AND e.EmployeeID IS NULL) orphanEmployee
         FROM FourM_CurriculumLogs l
         LEFT JOIN FourM_Curriculums c ON c.id=l.CurriculumID
         LEFT JOIN FourM_Courses co ON co.id=l.CourseID
         LEFT JOIN Employees e ON e.EmployeeID=l.EmployeeID`
    );
    const observedActions = [...actionCounts.keys()].sort();
    const report = {
        totalRows: rows.length,
        observedActionCount: observedActions.length,
        observedActions: Object.fromEntries([...actionCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
        expectedButNotObserved: TRAINING_LOG_ACTIONS.filter(action => !actionCounts.has(action)),
        recognizedLegacyActions: observedActions.filter(action => LEGACY_TRAINING_LOG_ACTIONS.includes(action)),
        unknownActions: observedActions.filter(action => !TRAINING_LOG_ACTIONS.includes(action) && !LEGACY_TRAINING_LOG_ACTIONS.includes(action)),
        canonicalRows,
        legacyRows,
        invalidOldJson,
        invalidNewJson,
        missingActor,
        malformedCanonical,
        orphanReferences: {
            curriculum: Number(orphans.orphanCurriculum || 0),
            course: Number(orphans.orphanCourse || 0),
            employee: Number(orphans.orphanEmployee || 0),
        },
        mutationStatementsExecuted: 0,
    };
    console.log(JSON.stringify(report, null, 2));
    if (invalidOldJson || invalidNewJson || malformedCanonical) process.exitCode = 2;
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    await db.end();
});
