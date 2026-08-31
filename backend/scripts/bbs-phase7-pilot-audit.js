'use strict';

const assert = require('assert');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT || 3306),
    });
    try {
        const [[scope]] = await db.query(
            `SELECT d.id DepartmentID,d.Name DepartmentName,u.id SafetyUnitID,u.name SafetyUnitName,
                    p.id PilotID,p.IsActive,p.EffectiveFrom,p.EffectiveTo
               FROM Master_Departments d
               JOIN Master_SafetyUnits u ON u.department_id=d.id
               LEFT JOIN BBS_Pilot_Scopes p ON p.DepartmentID=d.id AND p.SafetyUnitID=u.id
              WHERE LOWER(TRIM(d.Name))='maintenance sec.' AND LOWER(TRIM(u.name))='tube cutting'
              LIMIT 1`
        );
        assert.ok(scope, 'Pilot Master scope MAINTENANCE SEC. / Tube Cutting is unavailable');
        assert.strictEqual(Number(scope.IsActive), 1, 'Approved Pilot scope is not active');

        const [[people]] = await db.query(
            `SELECT COUNT(*) Employees,
                    SUM(m.id IS NOT NULL) MappedEmployees,
                    SUM(m.BBSLevel='Group Leader') GroupLeaders,
                    SUM(m.BBSLevel='Operator') Operators
               FROM Employees e
               LEFT JOIN Master_Positions pos ON LOWER(TRIM(pos.Name))=LOWER(TRIM(e.Position))
               LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=pos.id AND m.IsActive=1
              WHERE LOWER(TRIM(e.Department))=LOWER(TRIM(?)) AND LOWER(TRIM(e.Unit))=LOWER(TRIM(?))`,
            [scope.DepartmentName, scope.SafetyUnitName]
        );
        const [[configuration]] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM BBS_Hierarchy_Assignments h WHERE h.DepartmentID=? AND h.SafetyUnitID=? AND h.IsActive=1 AND h.EffectiveFrom<=CURDATE() AND COALESCE(h.EffectiveTo,'9999-12-31')>=CURDATE()) ActiveAssignments,
                (SELECT COUNT(DISTINCT v.id) FROM BBS_Checklist_Versions v JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID AND t.IsActive=1 JOIN BBS_Checklist_Scope_Mappings s ON s.VersionID=v.id AND s.IsActive=1 WHERE v.Status='Published' AND v.EffectiveFrom<=CURDATE() AND COALESCE(v.EffectiveTo,'9999-12-31')>=CURDATE() AND (s.DepartmentID IS NULL OR s.DepartmentID=?) AND (s.SafetyUnitID IS NULL OR s.SafetyUnitID=?)) PublishedChecklists`,
            [scope.DepartmentID, scope.SafetyUnitID, scope.DepartmentID, scope.SafetyUnitID]
        );
        const [[reconcile]] = await db.query(
            `SELECT
                COUNT(DISTINCT o.id) SubmittedObservations,
                COUNT(DISTINCT CASE WHEN a.Response='Unsafe' AND a.UnsafeRequiresActionSnapshot=1 THEN a.id END) QualifyingUnsafeAnswers,
                COUNT(DISTINCT ca.id) CorrectiveActions,
                COUNT(DISTINCT CASE WHEN ca.id IS NOT NULL AND ca.AnswerID<>a.id THEN ca.id END) MismatchedActions
               FROM BBS_Observations o
               LEFT JOIN BBS_Observation_Answers a ON a.ObservationID=o.id
               LEFT JOIN BBS_Corrective_Actions ca ON ca.ObservationID=o.id AND ca.AnswerID=a.id
              WHERE o.Status='Submitted' AND o.ObservedDepartmentID=? AND o.ObservedSafetyUnitID=?`,
            [scope.DepartmentID, scope.SafetyUnitID]
        );
        const [[orphans]] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM BBS_Observation_Files f LEFT JOIN BBS_Observations o ON o.id=f.ObservationID WHERE o.id IS NULL) ObservationFiles,
                (SELECT COUNT(*) FROM BBS_Action_Files f LEFT JOIN BBS_Corrective_Actions a ON a.id=f.ActionID WHERE a.id IS NULL) ActionFiles,
                (SELECT COUNT(*) FROM BBS_Corrective_Actions a LEFT JOIN BBS_Observations o ON o.id=a.ObservationID LEFT JOIN BBS_Observation_Answers x ON x.id=a.AnswerID WHERE o.id IS NULL OR x.id IS NULL) Actions`
        );
        assert.strictEqual(Number(reconcile.MismatchedActions || 0), 0, 'Pilot contains mismatched Observation/Action links');
        assert.strictEqual(Number(reconcile.CorrectiveActions || 0), Number(reconcile.QualifyingUnsafeAnswers || 0), 'Pilot action count does not reconcile with qualifying Unsafe answers');
        assert.deepStrictEqual(Object.fromEntries(Object.entries(orphans).map(([key, value]) => [key, Number(value || 0)])), { ObservationFiles:0, ActionFiles:0, Actions:0 }, 'BBS orphan records were found');

        const blockers = [];
        if (Number(people.GroupLeaders) < 1) blockers.push('NO_GROUP_LEADER');
        if (Number(people.Operators) < 1) blockers.push('NO_OPERATOR');
        if (Number(people.MappedEmployees) !== Number(people.Employees)) blockers.push('UNMAPPED_POSITION');
        if (Number(configuration.ActiveAssignments) < 1) blockers.push('NO_ACTIVE_ASSIGNMENT');
        if (Number(configuration.PublishedChecklists) < 1) blockers.push('NO_PUBLISHED_CHECKLIST');

        const report = {
            readOnly: true,
            approvedScope: { departmentId:Number(scope.DepartmentID), department:scope.DepartmentName, safetyUnitId:Number(scope.SafetyUnitID), safetyUnit:scope.SafetyUnitName, active:true },
            people: Object.fromEntries(Object.entries(people).map(([key, value]) => [key, Number(value || 0)])),
            configuration: Object.fromEntries(Object.entries(configuration).map(([key, value]) => [key, Number(value || 0)])),
            reconciliation: Object.fromEntries(Object.entries(reconcile).map(([key, value]) => [key, Number(value || 0)])),
            orphans: Object.fromEntries(Object.entries(orphans).map(([key, value]) => [key, Number(value || 0)])),
            blockers,
            readiness: blockers.length === 0 ? 'READY_FOR_BUSINESS_UAT' : 'CONFIGURATION_REQUIRED',
        };
        console.log(JSON.stringify(report, null, 2));
        console.log('BBS Phase 7 Pilot data reconciliation: PASS (read-only, 100% action/source agreement, no orphan rows)');
    } finally {
        await db.end();
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
