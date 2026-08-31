'use strict';

const path = require('path');
const mysql = require('mysql2/promise');
const { bangkokIsoDate } = require('../services/bbs-phase1');
const { resolveCandidates } = require('../services/bbs-checklist');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const number = value => Number(value || 0);
const numericObject = row => Object.fromEntries(
    Object.entries(row || {}).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value])
);

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT || 3306),
    });

    try {
        const asOf = bangkokIsoDate();
        const [[scope]] = await db.query(
            `SELECT d.id DepartmentID,d.Name DepartmentName,u.id SafetyUnitID,u.name SafetyUnitName,
                    p.id PilotID,p.IsActive,p.EffectiveFrom,p.EffectiveTo
               FROM Master_Departments d
               JOIN Master_SafetyUnits u ON u.department_id=d.id
               LEFT JOIN BBS_Pilot_Scopes p ON p.DepartmentID=d.id AND p.SafetyUnitID=u.id
              WHERE LOWER(TRIM(d.Name))='maintenance sec.'
                AND LOWER(TRIM(u.name))='tube cutting'
              LIMIT 1`
        );

        if (!scope) throw new Error('Approved Pilot Master scope MAINTENANCE SEC. / Tube Cutting is unavailable.');

        const [[master]] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM Master_Departments WHERE Status='Active') ActiveDepartments,
                (SELECT COUNT(*) FROM Master_SafetyUnits) SafetyUnits,
                (SELECT COUNT(*) FROM Master_Positions) Positions,
                (SELECT COUNT(*) FROM Employees) Employees`
        );

        const [pilotPeopleByLevel] = await db.query(
            `SELECT COALESCE(m.BBSLevel,'Unmapped') BBSLevel,COUNT(*) EmployeeCount
               FROM Employees e
               LEFT JOIN Master_Positions pos ON LOWER(TRIM(pos.Name))=LOWER(TRIM(e.Position))
               LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=pos.id AND m.IsActive=1
              WHERE LOWER(TRIM(e.Department))=LOWER(TRIM(?))
                AND LOWER(TRIM(e.Unit))=LOWER(TRIM(?))
              GROUP BY COALESCE(m.BBSLevel,'Unmapped')
              ORDER BY BBSLevel`,
            [scope.DepartmentName, scope.SafetyUnitName]
        );

        const [[pilotPeople]] = await db.query(
            `SELECT COUNT(*) Employees,
                    SUM(m.id IS NOT NULL) MappedEmployees,
                    SUM(m.BBSLevel='Group Leader') GroupLeaders,
                    SUM(m.BBSLevel='Operator') Operators
               FROM Employees e
               LEFT JOIN Master_Positions pos ON LOWER(TRIM(pos.Name))=LOWER(TRIM(e.Position))
               LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=pos.id AND m.IsActive=1
              WHERE LOWER(TRIM(e.Department))=LOWER(TRIM(?))
                AND LOWER(TRIM(e.Unit))=LOWER(TRIM(?))`,
            [scope.DepartmentName, scope.SafetyUnitName]
        );

        const [[configuration]] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM BBS_Inspector_Enrollments x
                  WHERE x.DepartmentID=? AND x.SafetyUnitID=? AND x.Status='Active' AND x.IsActive=1
                    AND x.EffectiveFrom<=? AND COALESCE(x.EffectiveTo,'9999-12-31')>=?) ActiveEnrollments,
                (SELECT COUNT(*) FROM BBS_Hierarchy_Assignments x
                  WHERE x.DepartmentID=? AND x.SafetyUnitID=? AND x.IsActive=1
                    AND x.EffectiveFrom<=? AND COALESCE(x.EffectiveTo,'9999-12-31')>=?) ActiveAssignments,
                (SELECT COUNT(*) FROM BBS_Inspector_Schedule_Rules r
                  JOIN BBS_Inspector_Enrollments x ON x.id=r.EnrollmentID
                 WHERE x.DepartmentID=? AND x.SafetyUnitID=? AND x.Status='Active' AND x.IsActive=1
                   AND r.Status='Active' AND r.EffectiveFrom<=? AND COALESCE(r.EffectiveTo,'9999-12-31')>=?) ActiveScheduleRules,
                (SELECT COUNT(DISTINCT v.id) FROM BBS_Checklist_Versions v
                  JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID AND t.IsActive=1
                  JOIN BBS_Checklist_Scope_Mappings s ON s.VersionID=v.id AND s.IsActive=1
                 WHERE v.Status='Published' AND v.EffectiveFrom<=? AND COALESCE(v.EffectiveTo,'9999-12-31')>=?
                   AND (s.DepartmentID IS NULL OR s.DepartmentID=?)
                   AND (s.SafetyUnitID IS NULL OR s.SafetyUnitID=?)) ApplicablePublishedChecklists,
                (SELECT COUNT(*) FROM BBS_Card_Templates
                  WHERE DepartmentID=? AND Status='Active') ActivePersonalTemplates,
                (SELECT COUNT(*) FROM BBS_Department_Card_Templates
                  WHERE DepartmentID=? AND Status='Active') ActiveDepartmentTemplates,
                (SELECT COUNT(*) FROM BBS_Department_QR_Cards
                  WHERE DepartmentID=? AND Status='Active') ActiveDepartmentQrCards,
                (SELECT COUNT(*) FROM BBS_Community_Action_Handlers
                  WHERE DepartmentID=? AND IsActive=1) ActiveCommunityHandlers`,
            [
                scope.DepartmentID, scope.SafetyUnitID, asOf, asOf,
                scope.DepartmentID, scope.SafetyUnitID, asOf, asOf,
                scope.DepartmentID, scope.SafetyUnitID, asOf, asOf,
                asOf, asOf, scope.DepartmentID, scope.SafetyUnitID,
                scope.DepartmentID, scope.DepartmentID, scope.DepartmentID, scope.DepartmentID,
            ]
        );

        const [[checklistInventory]] = await db.query(
            `SELECT
                COUNT(DISTINCT t.id) Templates,
                COUNT(DISTINCT v.id) Versions,
                COUNT(DISTINCT CASE WHEN v.Status='Published' THEN v.id END) PublishedVersions,
                COUNT(DISTINCT CASE WHEN UPPER(t.TemplateCode) LIKE 'UAT-%' THEN t.id END) UatTemplates,
                COUNT(DISTINCT s.id) ActiveScopeMappings
               FROM BBS_Checklist_Templates t
               LEFT JOIN BBS_Checklist_Versions v ON v.TemplateID=t.id
               LEFT JOIN BBS_Checklist_Scope_Mappings s ON s.VersionID=v.id AND s.IsActive=1`
        );

        const [[workflowInventory]] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM BBS_Observations WHERE Status='Draft') DraftObservations,
                (SELECT COUNT(*) FROM BBS_Observations WHERE Status='Submitted') SubmittedObservations,
                (SELECT COUNT(*) FROM BBS_Corrective_Actions) CorrectiveActions,
                (SELECT COUNT(*) FROM BBS_Cards) PersonalCards,
                (SELECT COUNT(*) FROM BBS_Community_Reports) CommunityReports`
        );

        const [[kpiRule]] = await db.query(
            `SELECT id,BBSLevel,MetricKey,PeriodType,TargetCount,Weekdays,TimeZone,CountStatus,IsActive
               FROM BBS_KPI_Rules
              WHERE BBSLevel='Group Leader' AND MetricKey='submitted_observation' AND IsActive=1
              LIMIT 1`
        );

        const [eligibleByLevel] = await db.query(
            `SELECT m.BBSLevel,COUNT(*) EmployeeCount
               FROM Employees e
               JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
               JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1
              GROUP BY m.BBSLevel
              ORDER BY m.BBSLevel`
        );

        const [resolverContexts] = await db.query(
            `SELECT d.id DepartmentID,u.id SafetyUnitID,p.id PositionID,m.BBSLevel
               FROM Employees e
               JOIN Master_Departments d ON LOWER(TRIM(d.Name))=LOWER(TRIM(e.Department))
               JOIN Master_SafetyUnits u ON u.department_id=d.id AND LOWER(TRIM(u.name))=LOWER(TRIM(e.Unit))
               JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
               JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1`
        );
        const [resolverCandidates] = await db.query(
            `SELECT s.*,v.id VersionID,v.VersionNo,v.EffectiveFrom,v.EffectiveTo,
                    t.id TemplateID,t.TemplateCode,t.TemplateName
               FROM BBS_Checklist_Scope_Mappings s
               JOIN BBS_Checklist_Versions v ON v.id=s.VersionID AND v.Status='Published'
               JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID AND t.IsActive=1
              WHERE s.IsActive=1 AND v.EffectiveFrom<=?
                AND COALESCE(v.EffectiveTo,'9999-12-31')>=?`,
            [asOf, asOf]
        );
        const resolver = { contexts: resolverContexts.length, resolved: 0, noChecklist: 0, conflict: 0 };
        for (const context of resolverContexts) {
            const result = resolveCandidates(resolverCandidates, {
                departmentId: context.DepartmentID,
                safetyUnitId: context.SafetyUnitID,
                positionId: context.PositionID,
                bbsLevel: context.BBSLevel,
            });
            if (result.ok) resolver.resolved += 1;
            else if (result.code === 'CHECKLIST_CONFLICT') resolver.conflict += 1;
            else resolver.noChecklist += 1;
        }

        const [[hygiene]] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM BBS_Checklist_Scope_Mappings s
                  LEFT JOIN BBS_Checklist_Versions v ON v.id=s.VersionID WHERE v.id IS NULL) OrphanChecklistScopes,
                (SELECT COUNT(*) FROM BBS_Checklist_Categories c
                  LEFT JOIN BBS_Checklist_Versions v ON v.id=c.VersionID WHERE v.id IS NULL) OrphanCategories,
                (SELECT COUNT(*) FROM BBS_Checklist_Items i
                  LEFT JOIN BBS_Checklist_Categories c ON c.id=i.CategoryID WHERE c.id IS NULL) OrphanItems,
                (SELECT COUNT(*) FROM BBS_Observation_Answers a
                  LEFT JOIN BBS_Observations o ON o.id=a.ObservationID WHERE o.id IS NULL) OrphanAnswers,
                (SELECT COUNT(*) FROM BBS_Observation_Files f
                  LEFT JOIN BBS_Observations o ON o.id=f.ObservationID WHERE o.id IS NULL) OrphanObservationFiles,
                (SELECT COUNT(*) FROM BBS_Action_Files f
                  LEFT JOIN BBS_Corrective_Actions a ON a.id=f.ActionID WHERE a.id IS NULL) OrphanActionFiles,
                (SELECT COUNT(*) FROM Employees e
                  LEFT JOIN Master_Departments d ON LOWER(TRIM(d.Name))=LOWER(TRIM(e.Department))
                 WHERE d.id IS NULL) EmployeesMissingDepartment,
                (SELECT COUNT(*) FROM Employees e
                  LEFT JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
                 WHERE p.id IS NULL) EmployeesMissingPosition`
        );

        const formalObservationBlockers = [];
        if (number(scope.IsActive) !== 1) formalObservationBlockers.push('PILOT_SCOPE_INACTIVE');
        if (number(pilotPeople.Operators) < 1) formalObservationBlockers.push('NO_OPERATOR');
        if (number(configuration.ActiveEnrollments) < 1) formalObservationBlockers.push('NO_ACTIVE_INSPECTOR_ENROLLMENT');
        if (number(configuration.ActiveAssignments) < 1) formalObservationBlockers.push('NO_ACTIVE_ASSIGNMENT');
        if (number(configuration.ActiveScheduleRules) < 1) formalObservationBlockers.push('NO_ACTIVE_INSPECTOR_SCHEDULE');
        if (number(configuration.ApplicablePublishedChecklists) < 1) formalObservationBlockers.push('NO_APPLICABLE_PUBLISHED_CHECKLIST');
        if (!kpiRule || number(kpiRule.TargetCount) !== 1 || String(kpiRule.Weekdays) !== '1,2,3,4,5') formalObservationBlockers.push('GROUP_LEADER_KPI_RULE_NOT_READY');

        const cardCommunityBlockers = [];
        if (number(configuration.ActivePersonalTemplates) < 1) cardCommunityBlockers.push('NO_ACTIVE_PERSONAL_CARD_TEMPLATE');
        if (number(configuration.ActiveDepartmentTemplates) < 1) cardCommunityBlockers.push('NO_ACTIVE_DEPARTMENT_CARD_TEMPLATE');
        if (number(configuration.ActiveDepartmentQrCards) < 1) cardCommunityBlockers.push('NO_ACTIVE_DEPARTMENT_QR');
        if (number(configuration.ActiveCommunityHandlers) < 1) cardCommunityBlockers.push('NO_ACTIVE_COMMUNITY_HANDLER');

        const warnings = [];
        if (number(checklistInventory.UatTemplates) > 0) warnings.push('UAT_CHECKLISTS_PRESENT');
        if (number(workflowInventory.DraftObservations) > 0) warnings.push('DRAFT_OBSERVATIONS_REQUIRE_OWNER_REVIEW');
        if (number(hygiene.EmployeesMissingDepartment) > 0) warnings.push('EMPLOYEE_MASTER_DEPARTMENT_GAPS_OUTSIDE_PILOT');
        if (number(hygiene.EmployeesMissingPosition) > 0) warnings.push('EMPLOYEE_MASTER_POSITION_GAPS_OUTSIDE_PILOT');

        const report = {
            readOnly: true,
            asOf,
            approvedScope: {
                departmentId: number(scope.DepartmentID),
                department: scope.DepartmentName,
                safetyUnitId: number(scope.SafetyUnitID),
                safetyUnit: scope.SafetyUnitName,
                active: number(scope.IsActive) === 1,
            },
            master: numericObject(master),
            pilotPeople: {
                Employees: number(pilotPeople.Employees),
                MappedEmployees: number(pilotPeople.MappedEmployees),
                GroupLeaders: number(pilotPeople.GroupLeaders),
                Operators: number(pilotPeople.Operators),
                byLevel: pilotPeopleByLevel.map(row => ({ level: row.BBSLevel, employees: number(row.EmployeeCount) })),
            },
            kpiRule: kpiRule ? numericObject(kpiRule) : null,
            configuration: numericObject(configuration),
            checklistInventory: numericObject(checklistInventory),
            workflowInventory: numericObject(workflowInventory),
            eligibleEmployees: {
                total: eligibleByLevel.reduce((sum, row) => sum + number(row.EmployeeCount), 0),
                byLevel: eligibleByLevel.map(row => ({ level: row.BBSLevel, employees: number(row.EmployeeCount) })),
            },
            resolver,
            dataHygiene: numericObject(hygiene),
            formalObservationBlockers,
            cardCommunityBlockers,
            warnings,
            readiness: formalObservationBlockers.length || cardCommunityBlockers.length
                ? 'CONFIGURATION_REQUIRED'
                : 'READY_FOR_BUSINESS_UAT',
        };

        console.log(JSON.stringify(report, null, 2));
        console.log('BBS Phase 10C-0 readiness audit: PASS (read-only; no database mutation)');
    } finally {
        await db.end();
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
