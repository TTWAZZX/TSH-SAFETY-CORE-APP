'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const root = path.resolve(__dirname, '..', '..');
const contract = JSON.parse(
    fs.readFileSync(path.join(root, 'config', 'dashboard-module-health-contract.json'), 'utf8')
);
const year = Number(process.argv.find(arg => /^20\d{2}$/.test(arg)) || new Date().getFullYear());
const jsonMode = process.argv.includes('--json');

function assertReadOnly(sql) {
    const normalized = String(sql || '').trim();
    assert.match(normalized, /^(SELECT|SHOW|DESCRIBE|EXPLAIN)\b/i, 'Dashboard baseline audit only permits read-only SQL');
    assert.doesNotMatch(normalized, /\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE|CALL|LOAD)\b/i);
}

async function selectOne(sql, params = []) {
    assertReadOnly(sql);
    const [rows] = await db.query(sql, params);
    return rows[0] || {};
}

async function fingerprint() {
    return selectOne(`
        SELECT
            (SELECT COUNT(*) FROM Employees) AS employees,
            (SELECT COUNT(*) FROM Policy_Acknowledgements) AS policyAcknowledgements,
            (SELECT COUNT(*) FROM Hiyari_Assignments) AS hiyariAssignments,
            (SELECT COUNT(*) FROM HiyariReports) AS hiyariReports,
            (SELECT COUNT(*) FROM Activity_Position_Templates) AS legacyPositionTargets,
            (SELECT COUNT(*) FROM Activity_Position_Template_Years) AS yearlyPositionTargets,
            (SELECT COUNT(*) FROM Activity_Scope_Overrides) AS legacyScopeTargets,
            (SELECT COUNT(*) FROM Activity_Scope_Override_Years) AS yearlyScopeTargets,
            (SELECT COUNT(*) FROM Employee_Activity_Targets) AS legacyEmployeeTargets,
            (SELECT COUNT(*) FROM Employee_Activity_Target_Years) AS yearlyEmployeeTargets
    `);
}

async function snapshot() {
    const entries = await Promise.all([
        selectOne(`
            SELECT COUNT(DISTINCT DATE(PatrolDate)) AS sessions,
                   COUNT(*) AS attendanceRows,
                   COUNT(DISTINCT UserID) AS distinctPeople
            FROM Patrol_Attendance
            WHERE YEAR(PatrolDate)=?
        `, [year]).then(value => ['patrol', value]),
        selectOne(`
            SELECT (SELECT COUNT(*) FROM HiyariReports
                     WHERE YEAR(ReportDate)=? AND DeletedAt IS NULL) AS yearReports,
                   (SELECT COUNT(*) FROM HiyariReports
                     WHERE YEAR(ReportDate)=? AND DeletedAt IS NULL
                       AND Status NOT IN ('Closed','closed')) AS yearOpen,
                   (SELECT COUNT(*) FROM Hiyari_Assignments) AS assignmentTarget,
                   (SELECT COUNT(DISTINCT a.id)
                      FROM Hiyari_Assignments a
                      JOIN HiyariReports r
                        ON NULLIF(TRIM(r.ReporterID),'')=NULLIF(TRIM(a.EmployeeID),'')
                     WHERE YEAR(r.ReportDate)=? AND r.DeletedAt IS NULL
                       AND r.Status IN ('Closed','closed')) AS assignmentClosed
        `, [year, year, year]).then(value => ['hiyari', value]),
        selectOne(`
            SELECT (SELECT COUNT(*) FROM KY_Activities WHERE YEAR(ActivityDate)=?) AS activities,
                   (SELECT COUNT(*) FROM KY_Program_Config WHERE Year=? AND IsActive=1) AS activeConfigs
        `, [year, year]).then(value => ['ky', value]),
        selectOne(`
            SELECT (SELECT COUNT(*) FROM CCCF_Assignments) AS assignments,
                   (SELECT COUNT(DISTINCT fa.AssigneeID)
                      FROM CCCF_FormA_Permanent fa
                      JOIN CCCF_Assignments ca ON ca.EmployeeID=fa.AssigneeID
                     WHERE YEAR(fa.SubmitDate)=?
                       AND (fa.ReviewStatus='Completed'
                            OR (fa.ReviewStatus IS NULL AND fa.FileUrl IS NOT NULL))) AS completed
        `, [year]).then(value => ['cccf', value]),
        selectOne(`
            SELECT (SELECT COUNT(*) FROM YokotenTopics WHERE IsActive=1) AS activeTopics,
                   (SELECT COUNT(DISTINCT Department)
                      FROM YokotenResponses
                     WHERE YEAR(ResponseDate)=?
                       AND (IsDeleted IS NULL OR IsDeleted=0)) AS respondingDepartments,
                   (SELECT COUNT(DISTINCT CONCAT(TRIM(Department),'::',YokotenID))
                      FROM YokotenResponses
                     WHERE YEAR(ResponseDate)=?
                       AND (IsDeleted IS NULL OR IsDeleted=0)) AS responsePairs
        `, [year, year]).then(value => ['yokoten', value]),
        selectOne(`
            SELECT COALESCE(SUM(TotalEmp),0) AS eligibleRecords,
                   COALESCE(SUM(PassedCount),0) AS passedRecords
            FROM Training_Dept_Records
            WHERE Year=?
        `, [year]).then(value => ['training', value]),
        selectOne(`
            SELECT COUNT(*) AS reports,
                   SUM(IsRecordable=1) AS recordable
            FROM Accident_Reports
            WHERE YEAR(AccidentDate)=?
              AND (IsDeleted IS NULL OR IsDeleted=0)
        `, [year]).then(value => ['accident', value]),
        selectOne(`
            SELECT COUNT(*) AS notices,
                   SUM(Status='Closed') AS closed,
                   SUM(Status IN ('Open','Pending')) AS active,
                   SUM(TrainingRequired=1) AS trainingRequired
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate)=?
        `, [year]).then(value => ['fourm', value]),
        selectOne(`
            SELECT (SELECT COUNT(*) FROM KPIData WHERE Year=?) AS metrics,
                   (SELECT COUNT(*) FROM KPIAnnouncements) AS announcements,
                   (SELECT COUNT(*) FROM KPIAnnouncements WHERE IsCurrent=1) AS currentAnnouncements
        `, [year]).then(value => ['kpi', value]),
        selectOne(`
            SELECT (SELECT COUNT(*) FROM Policies) AS policies,
                   (SELECT COUNT(*) FROM Policies WHERE IsCurrent=1) AS currentPolicies,
                   (SELECT COUNT(*) FROM Employees) AS employees,
                   (SELECT COUNT(DISTINCT pa.UserID)
                      FROM Policy_Acknowledgements pa
                      JOIN Policies p ON p.id=pa.PolicyID
                     WHERE p.IsCurrent=1) AS currentPolicyAcknowledged
        `).then(value => ['policy', value]),
        selectOne(`
            SELECT COUNT(*) AS committeeRows,
                   SUM(IsCurrent=1) AS currentRows
            FROM Committees
        `).then(value => ['committee', value]),
        selectOne(`
            SELECT SUM(Status IS NULL OR Status<>'inactive') AS activeMachines,
                   SUM(RiskLevel IN ('high','critical')
                       AND (Status IS NULL OR Status<>'inactive')) AS activeCritical,
                   (SELECT COUNT(*) FROM Machine_Safety_Issues WHERE Status='open') AS openIssues
            FROM Machine_Safety
        `).then(value => ['machine-safety', value]),
        selectOne(`
            SELECT COUNT(*) AS records,
                   SUM(YEAR(OJTDate)=?) AS yearRecords,
                   SUM(CASE WHEN YEAR(OJTDate)=? THEN AttendeeCount ELSE 0 END) AS yearAttendees,
                   SUM(CASE WHEN YEAR(OJTDate)=? THEN YearlyTarget ELSE 0 END) AS yearTarget
            FROM OJT_Records
        `, [year, year, year]).then(value => ['ojt', value]),
        selectOne(`
            SELECT COUNT(*) AS documents,
                   SUM(YEAR(UploadedAt)=?) AS yearDocuments,
                   SUM(UploadedAt >= DATE_SUB(NOW(),INTERVAL 30 DAY)) AS recentDocuments
            FROM Contractor_Documents
        `, [year]).then(value => ['contractor', value]),
        selectOne(`
            SELECT COUNT(*) AS assessments,
                   (SELECT AVG(CompliancePct)
                      FROM SC_PPEInspections
                     WHERE YEAR(InspectionDate)=?
                       AND deleted_at IS NULL) AS ppeCompliance
            FROM SC_Assessments
            WHERE AssessmentYear=?
        `, [year, year]).then(value => ['safety-culture', value]),
    ]);

    return Object.fromEntries(entries);
}

async function personalTargetBaseline() {
    return selectOne(`
        SELECT COUNT(*) AS employees,
               SUM(CASE WHEN
                    EXISTS (SELECT 1 FROM Activity_Position_Templates p
                             WHERE p.PositionName=e.Position AND p.IsNA=0)
                 OR EXISTS (SELECT 1 FROM Activity_Position_Template_Years p
                             WHERE p.PositionName=e.Position
                               AND p.TargetYear IN (0,?)
                               AND p.IsNA=0)
                 OR EXISTS (SELECT 1 FROM Employee_Activity_Targets t
                             WHERE t.EmployeeID=e.EmployeeID AND t.IsNA=0)
                 OR EXISTS (SELECT 1 FROM Employee_Activity_Target_Years t
                             WHERE t.EmployeeID=e.EmployeeID
                               AND t.TargetYear IN (0,?)
                               AND t.IsNA=0)
                   THEN 1 ELSE 0 END) AS withAdminConfiguredTarget,
               SUM(CASE WHEN
                    NOT EXISTS (SELECT 1 FROM Activity_Position_Templates p
                                 WHERE p.PositionName=e.Position AND p.IsNA=0)
                AND NOT EXISTS (SELECT 1 FROM Activity_Position_Template_Years p
                                 WHERE p.PositionName=e.Position
                                   AND p.TargetYear IN (0,?)
                                   AND p.IsNA=0)
                AND NOT EXISTS (SELECT 1 FROM Employee_Activity_Targets t
                                 WHERE t.EmployeeID=e.EmployeeID AND t.IsNA=0)
                AND NOT EXISTS (SELECT 1 FROM Employee_Activity_Target_Years t
                                 WHERE t.EmployeeID=e.EmployeeID
                                   AND t.TargetYear IN (0,?)
                                   AND t.IsNA=0)
                   THEN 1 ELSE 0 END) AS withoutAdminConfiguredTarget
          FROM Employees e
    `, [year, year, year, year]);
}

async function main() {
    const before = await fingerprint();
    const modules = await snapshot();
    const personalTargets = await personalTargetBaseline();
    const after = await fingerprint();

    assert.deepStrictEqual(after, before, 'Read-only baseline fingerprint changed during audit');
    assert.deepStrictEqual(Object.keys(modules), contract.modules.map(module => module.key));

    const report = {
        audit: 'dashboard-module-health-d1-read-only-baseline',
        contractVersion: contract.contractVersion,
        year,
        databaseFingerprintUnchanged: true,
        modules,
        personalTargets,
    };

    if (jsonMode) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    console.log(`Dashboard Module Health D1 read-only baseline (${year})`);
    console.log(`Contract ${contract.contractVersion}; database fingerprint unchanged`);
    console.table(contract.modules.map(module => ({
        Module: module.key,
        Type: module.metricType,
        Baseline: JSON.stringify(modules[module.key]),
        'D2 State': module.implementationState,
    })));
    console.table([personalTargets]);
}

main()
    .then(() => db.end())
    .catch(async error => {
        console.error(error.stack || error);
        try { await db.end(); } catch (_) {}
        process.exitCode = 1;
    });
