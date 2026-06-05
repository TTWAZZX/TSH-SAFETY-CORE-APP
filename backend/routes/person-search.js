// backend/routes/person-search.js
// Employee Safety 360: searchable person profile backed by existing module tables.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { ensureEmployeeCompanyEmailColumn } = require('../utils/company-email');
const { ACTIVITIES, getMergedTargets, getDynamicActivityRatio, getPeopleCoverage, getFixedCountAlignment } = require('./activity-targets');

const n = (value) => parseInt(value, 10) || 0;

async function safeOne(sql, params = []) {
    try {
        const [[row]] = await db.query(sql, params);
        return row || null;
    } catch {
        return null;
    }
}

async function safeRows(sql, params = []) {
    try {
        const [rows] = await db.query(sql, params);
        return rows || [];
    } catch {
        return [];
    }
}

function canViewEmployee(req, employeeId) {
    const role = req.user?.role || req.user?.Role;
    return role === 'Admin' || String(req.user?.id || '') === String(employeeId || '');
}

function scoreFrom(items) {
    const valid = items.filter(i => i.target > 0);
    if (!valid.length) return null;
    const avg = valid.reduce((sum, i) => sum + Math.min(Math.round((i.actual / i.target) * 100), 100), 0) / valid.length;
    return Math.round(avg);
}

function pct(part, total) {
    const p = n(part);
    const t = n(total);
    if (t <= 0) return null;
    return Math.round((p / t) * 100);
}

function signalStatus({ actionNeeded = false, watch = false }) {
    if (actionNeeded) return 'Action Needed';
    if (watch) return 'Watch';
    return 'Good';
}

function clampScore(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function buildRiskProfile(metrics, { trainingPassRate, ppePassRate, currentYearActivity }) {
    const trainingScore = metrics.training === 0
        ? 55
        : clampScore(trainingPassRate);
    const fourmScore = metrics.fourmScopes > 0 ? 100 : 65;
    const riskEventCount = metrics.accidents + metrics.ppeViolations + metrics.patrolIssues;
    const riskScore = metrics.accidents > 0 || metrics.ppeViolations > 0
        ? 35
        : metrics.patrolIssues > 0 ? 70 : 100;
    const activityScore = currentYearActivity > 0 ? 100 : 60;
    const ppeScore = metrics.ppeViolations > 0
        ? 35
        : metrics.ppeInspections === 0 ? 75 : clampScore(ppePassRate);

    const factors = [
        { key: 'training', label: 'Training pass rate', score: trainingScore, weight: 30 },
        { key: 'fourm', label: '4M Training Matrix scope', score: fourmScore, weight: 20 },
        { key: 'risk', label: 'Accident / PPE / Patrol issue', score: riskScore, weight: 25 },
        { key: 'activity', label: 'KY / Hiyari / CCCF activity', score: activityScore, weight: 15 },
        { key: 'ppe', label: 'PPE compliance', score: ppeScore, weight: 10 },
    ];
    const score = clampScore(factors.reduce((sum, factor) => sum + (factor.score * factor.weight / 100), 0));

    const reasons = [];
    const nextActions = [];
    if (metrics.training === 0) {
        reasons.push('No individual training record in selected year');
        nextActions.push('Confirm required training record or add missing training evidence');
    } else if (trainingPassRate < 80) {
        reasons.push(`Training pass rate is ${trainingPassRate}%`);
        nextActions.push('Review failed training records and plan re-training');
    }
    if (metrics.fourmScopes === 0) {
        reasons.push('No active 4M Training Matrix curriculum scope');
        nextActions.push('Check whether this employee should be assigned to a 4M curriculum');
    }
    if (metrics.accidents > 0) {
        reasons.push(`${metrics.accidents} accident record(s) in selected year`);
        nextActions.push('Review accident investigation and corrective action status');
    }
    if (metrics.ppeViolations > 0) {
        reasons.push(`${metrics.ppeViolations} PPE violation(s) in selected year`);
        nextActions.push('Follow up PPE coaching or escalation records');
    }
    if (metrics.patrolIssues > 0) {
        reasons.push(`${metrics.patrolIssues} patrol issue(s) reported by this person`);
        nextActions.push('Review patrol issue closure and responsible department action');
    }
    if (currentYearActivity === 0) {
        reasons.push('No KY, Hiyari, or CCCF activity in selected year');
        nextActions.push('Encourage at least one proactive safety activity record');
    }
    if (metrics.ppeInspections > 0 && ppePassRate != null && ppePassRate < 90) {
        reasons.push(`PPE inspection pass rate is ${ppePassRate}%`);
        nextActions.push('Review PPE inspection findings for repeat gaps');
    }
    if (!reasons.length) reasons.push('No major risk or compliance gap detected for selected year');
    if (!nextActions.length) nextActions.push('Maintain current safety activity and training evidence');

    const status = metrics.accidents > 0 || metrics.ppeViolations > 0 || score < 60
        ? 'Action Needed'
        : score < 80 || metrics.patrolIssues > 0 || metrics.training === 0 || metrics.fourmScopes === 0 || currentYearActivity === 0
            ? 'Watch'
            : 'Good';

    return {
        score,
        status,
        factors,
        reasons,
        nextActions: [...new Set(nextActions)].slice(0, 5),
        thresholds: { good: 80, watch: 60 },
        counters: {
            trainingPassRate,
            ppePassRate,
            riskEventCount,
            currentYearActivity,
        },
    };
}

function timelineSeverity(type, status = '') {
    const t = String(type || '').toLowerCase();
    const s = String(status || '').toLowerCase();
    if (t.includes('accident') || t.includes('violation') || s.includes('not passed') || s.includes('issue')) return 'risk';
    if (t.includes('4m') || t.includes('training') || t.includes('cccf')) return 'info';
    return 'normal';
}

function timelineItem({ type, module, date, title, status, detail, refId }) {
    return {
        type,
        module,
        date,
        title: title || type,
        status: status || '',
        detail: detail || '',
        severity: timelineSeverity(type, status),
        refId: refId ?? null,
    };
}

router.get('/employees', async (req, res) => {
    const q = String(req.query.q || '').trim();
    const department = String(req.query.department || '').trim();
    const limit = Math.min(Math.max(n(req.query.limit) || 20, 1), 50);
    const params = [];

    let sql = `
        SELECT EmployeeID, EmployeeName, Department, Unit, Team, Position, CompanyEmail, Role
        FROM Employees
        WHERE 1=1
    `;
    if (q) {
        sql += ` AND (EmployeeID LIKE ? OR EmployeeName LIKE ? OR Department LIKE ? OR Unit LIKE ? OR Position LIKE ?)`;
        const like = `%${q}%`;
        params.push(like, like, like, like, like);
    }
    if (department && department !== 'all') {
        sql += ` AND Department = ?`;
        params.push(department);
    }
    sql += ` ORDER BY EmployeeName ASC LIMIT ${limit}`;

    try {
        await ensureEmployeeCompanyEmailColumn(db);
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/profile/:employeeId', async (req, res) => {
    const employeeId = String(req.params.employeeId || '').trim();
    const year = n(req.query.year) || new Date().getFullYear();
    if (!employeeId) return res.status(400).json({ success: false, message: 'ต้องระบุ EmployeeID' });

    try {
        await ensureEmployeeCompanyEmailColumn(db);
        const employee = await safeOne(
            `SELECT EmployeeID, EmployeeName, Department, Unit, Team, Position, CompanyEmail, Role
             FROM Employees WHERE EmployeeID = ?`,
            [employeeId]
        );
        if (!employee) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });

        const [
            patrol, patrolIssues, cccfWorker, cccfPermanent, training, trainingPassed,
            hiyari, ky, yokoten, accidents, fourmOwner, fourmCreated, policyAck,
            ppeViolations, scwDocs, ojtDept, patrolRecent, trainingRecent, hiyariRecent,
            kyRecent, accidentRecent, fourmRecent, yokotenRecent, selfPatrolRecent,
            fourmScopes, fourmLogs, cccfWorkerRecent, cccfPermanentRecent,
            ppeInspectionSummary, ppeInspectionRecent, ppeViolationRecent,
        ] = await Promise.all([
            safeOne(`SELECT COUNT(*) AS cnt FROM Patrol_Attendance WHERE UserID=? AND YEAR(PatrolDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM Patrol_Issues WHERE ReporterID=? AND YEAR(DateFound)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM CCCF_FormA_Worker WHERE EmployeeID=? AND YEAR(SubmitDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM CCCF_FormA_Permanent WHERE AssigneeID=? AND YEAR(SubmitDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM Training_Records WHERE EmployeeID=? AND YEAR(TrainingDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM Training_Records WHERE EmployeeID=? AND YEAR(TrainingDate)=? AND IsPassed=1`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM HiyariReports WHERE ReporterID=? AND YEAR(ReportDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM KY_Activities WHERE ReporterID=? AND YEAR(ActivityDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM YokotenResponses WHERE EmployeeID=? AND YEAR(ResponseDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM Accident_Reports WHERE EmployeeID=? AND YEAR(AccidentDate)=? AND (IsDeleted IS NULL OR IsDeleted=0)`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM FourM_ChangeNotices WHERE ResponsiblePerson=? AND YEAR(RequestDate)=?`, [employee.EmployeeName, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM FourM_ChangeNotices WHERE CreatedByID=? AND YEAR(RequestDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM Policy_Acknowledgements WHERE UserID=?`, [employeeId]),
            safeOne(`SELECT COUNT(*) AS cnt FROM SC_PPE_Violations WHERE EmployeeID=? AND YEAR(ViolationDate)=? AND (deleted_at IS NULL)`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM SCW_Documents WHERE UploadedBy=? AND YEAR(UploadedAt)=?`, [employee.EmployeeName, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM OJT_Records WHERE Department=? AND YEAR(OJTDate)=?`, [employee.Department, year]),
            safeRows(`SELECT id, PatrolDate, PatrolType, Area, Notes, RecordedBy
                      FROM Patrol_Attendance WHERE UserID=? AND YEAR(PatrolDate)=?
                      ORDER BY PatrolDate DESC, id DESC LIMIT 12`, [employeeId, year]),
            safeRows(`SELECT r.id, r.TrainingDate, r.Score, r.IsPassed, c.CourseName, c.CourseCode
                      FROM Training_Records r LEFT JOIN Training_Courses c ON c.id = r.CourseID
                      WHERE r.EmployeeID=? AND YEAR(r.TrainingDate)=?
                      ORDER BY r.TrainingDate DESC, r.id DESC LIMIT 8`, [employeeId, year]),
            safeRows(`SELECT id, ReportDate, Location, Description, Status
                      FROM HiyariReports WHERE ReporterID=? AND YEAR(ReportDate)=?
                      ORDER BY ReportDate DESC LIMIT 6`, [employeeId, year]),
            safeRows(`SELECT id, ActivityDate, TeamName, HazardDescription, Status
                      FROM KY_Activities WHERE ReporterID=? AND YEAR(ActivityDate)=?
                      ORDER BY ActivityDate DESC LIMIT 6`, [employeeId, year]),
            safeRows(`SELECT id, AccidentDate, AccidentType, Status, Location
                      FROM Accident_Reports
                      WHERE EmployeeID=? AND YEAR(AccidentDate)=? AND (IsDeleted IS NULL OR IsDeleted=0)
                      ORDER BY AccidentDate DESC LIMIT 6`, [employeeId, year]),
            safeRows(`SELECT id, NoticeNo, RequestDate, Title, Status, ChangeType
                      FROM FourM_ChangeNotices
                      WHERE (CreatedByID=? OR ResponsiblePerson=?) AND YEAR(RequestDate)=?
                      ORDER BY RequestDate DESC LIMIT 6`, [employeeId, employee.EmployeeName, year]),
            safeRows(`SELECT ResponseID, ResponseDate, YokotenID, ApprovalStatus, IsRelated
                      FROM YokotenResponses WHERE EmployeeID=? AND YEAR(ResponseDate)=?
                      ORDER BY ResponseDate DESC LIMIT 6`, [employeeId, year]),
            safeRows(`SELECT id, CheckinDate, Location, Notes
                      FROM Patrol_Self_Checkin WHERE EmployeeID=? AND Year=?
                      ORDER BY CheckinDate DESC LIMIT 8`, [employeeId, year]),
            safeRows(`SELECT ce.id AS AssignmentID, ce.Status, ce.AssignedAt, ce.RemovedAt,
                             cur.id AS CurriculumID, cur.CurriculumCode, cur.CurriculumTitle,
                             cur.Department, cur.Year,
                             COUNT(DISTINCT CASE WHEN c.IsActive=1 THEN c.id END) AS CourseCount
                      FROM FourM_CurriculumEmployees ce
                      JOIN FourM_Curriculums cur ON cur.id = ce.CurriculumID
                      LEFT JOIN FourM_Courses c ON c.CurriculumID = cur.id
                      WHERE ce.EmployeeID=? AND cur.Year=?
                      GROUP BY ce.id, ce.Status, ce.AssignedAt, ce.RemovedAt, cur.id, cur.CurriculumCode, cur.CurriculumTitle, cur.Department, cur.Year
                      ORDER BY ce.Status='Assigned' DESC, ce.AssignedAt DESC
                      LIMIT 8`, [employeeId, year]),
            safeRows(`SELECT l.id, l.Action, l.CurriculumID, l.CourseID, l.EmployeeID, l.OldValue, l.NewValue, l.PerformedBy, l.PerformedAt,
                             cur.CurriculumCode, cur.CurriculumTitle, c.CourseCode, c.CourseTitle
                      FROM FourM_CurriculumLogs l
                      LEFT JOIN FourM_Curriculums cur ON cur.id = l.CurriculumID
                      LEFT JOIN FourM_Courses c ON c.id = l.CourseID
                      WHERE l.EmployeeID=? AND YEAR(l.PerformedAt)=?
                      ORDER BY l.PerformedAt DESC
                      LIMIT 10`, [employeeId, year]),
            safeRows(`SELECT id, SubmitDate, JobArea, Equipment, SafetyUnit
                      FROM CCCF_FormA_Worker WHERE EmployeeID=? AND YEAR(SubmitDate)=?
                      ORDER BY SubmitDate DESC, id DESC LIMIT 6`, [employeeId, year]),
            safeRows(`SELECT id, SubmitDate, JobArea, Summary, StopType, \`Rank\`
                      FROM CCCF_FormA_Permanent WHERE AssigneeID=? AND YEAR(SubmitDate)=?
                      ORDER BY SubmitDate DESC, id DESC LIMIT 6`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS total,
                            SUM(CASE WHEN IsPass=1 THEN 1 ELSE 0 END) AS passed,
                            AVG(CompliancePct) AS avgCompliance
                     FROM SC_PPEInspections
                     WHERE InspectedEmployeeID=? AND YEAR(InspectionDate)=? AND (deleted_at IS NULL)`, [employeeId, year]),
            safeRows(`SELECT InspectionID, InspectionDate, Area, Department, WorkTypeName, IsPass, CompliancePct
                      FROM SC_PPEInspections
                      WHERE InspectedEmployeeID=? AND YEAR(InspectionDate)=? AND (deleted_at IS NULL)
                      ORDER BY InspectionDate DESC, CreatedAt DESC LIMIT 8`, [employeeId, year]),
            safeRows(`SELECT ViolationID, ViolationDate, WarningLevel, ViolationNo, InspectorName, Note
                      FROM SC_PPE_Violations
                      WHERE EmployeeID=? AND YEAR(ViolationDate)=? AND (deleted_at IS NULL)
                      ORDER BY ViolationDate DESC, CreatedAt DESC LIMIT 8`, [employeeId, year]),
        ]);

        const metrics = {
            patrol: n(patrol?.cnt),
            patrolIssues: n(patrolIssues?.cnt),
            cccfWorker: n(cccfWorker?.cnt),
            cccfPermanent: n(cccfPermanent?.cnt),
            training: n(training?.cnt),
            trainingPassed: n(trainingPassed?.cnt),
            hiyari: n(hiyari?.cnt),
            ky: n(ky?.cnt),
            yokoten: n(yokoten?.cnt),
            accidents: n(accidents?.cnt),
            fourmOwner: n(fourmOwner?.cnt),
            fourmCreated: n(fourmCreated?.cnt),
            policyAck: n(policyAck?.cnt),
            ppeViolations: n(ppeViolations?.cnt),
            scwDocs: n(scwDocs?.cnt),
            ojtDept: n(ojtDept?.cnt),
            fourmScopes: fourmScopes.filter(r => r.Status === 'Assigned').length,
            fourmLogs: fourmLogs.length,
            ppeInspections: n(ppeInspectionSummary?.total),
            ppeInspectionPassed: n(ppeInspectionSummary?.passed),
            ppeCompliancePct: ppeInspectionSummary?.avgCompliance == null ? null : Math.round(Number(ppeInspectionSummary.avgCompliance)),
        };

        const trainingPassRate = pct(metrics.trainingPassed, metrics.training);
        const ppePassRate = pct(metrics.ppeInspectionPassed, metrics.ppeInspections);
        const currentYearActivity = metrics.ky + metrics.hiyari + metrics.cccfWorker + metrics.cccfPermanent;
        const activityActuals = {
            patrol: metrics.patrol, patrol_issue: metrics.patrolIssues,
            cccf_worker: metrics.cccfWorker, cccf_permanent: metrics.cccfPermanent,
            scw: metrics.scwDocs, training: metrics.trainingPassed, yokoten: metrics.yokoten,
            hiyari: metrics.hiyari, ky: metrics.ky,
        };
        const { overrideMap, scopeMap, templateMap, unit } = await getMergedTargets(employeeId);
        const dynamicRatios = {
            patrol_issue: await getDynamicActivityRatio('patrol_issue', employee.Department, year),
            yokoten: await getDynamicActivityRatio('yokoten', employee.Department, year),
        };
        const effectiveTarget = key => overrideMap[key] || scopeMap[key] || templateMap[key] || null;
        const peopleCoverages = {};
        for (const activity of ACTIVITIES.filter(a => a.metricType === 'people_coverage')) {
            const target = effectiveTarget(activity.key);
            if (!target) continue;
            peopleCoverages[activity.key] = await getPeopleCoverage(
                activity.key,
                { department: employee.Department, unit },
                year,
                target.YearlyTarget
            );
        }
        const fixedCountAlignments = {
            patrol: await getFixedCountAlignment('patrol', { employeeId, department: employee.Department, unit }, year, effectiveTarget('patrol')?.YearlyTarget),
            ky: await getFixedCountAlignment('ky', { employeeId, department: employee.Department, unit }, year, effectiveTarget('ky')?.YearlyTarget),
        };
        const activityTargets = ACTIVITIES.map(activity => {
            const row = overrideMap[activity.key] || scopeMap[activity.key] || templateMap[activity.key] || null;
            const ratio = dynamicRatios[activity.key] || peopleCoverages[activity.key] || fixedCountAlignments[activity.key] || null;
            if ((!row && !ratio) || row?.IsNA) return null;
            const yearlyTarget = ratio ? ratio.denominator : Number(row.YearlyTarget);
            const actualCount = ratio ? ratio.numerator : Number(activityActuals[activity.key] || 0);
            const completionPct = ratio ? ratio.completionPct : yearlyTarget > 0 ? Math.min(100, Math.round(actualCount / yearlyTarget * 100)) : null;
            const passPct = Number(row?.PassPct ?? 80);
            return {
                activityKey: activity.key, label: activity.label, desc: activity.desc,
                metricType: activity.metricType, scopeType: activity.scopeType, unitLabel: activity.unitLabel, targetMode: activity.targetMode,
                yearlyTarget, passPct, actualCount, completionPct,
                passed: completionPct !== null ? completionPct >= passPct : null,
                source: row?.source || (ratio?.targetSource && ratio.targetSource !== 'activity_target' ? 'module' : ratio ? 'system' : 'none'),
                scope: row?.source === 'scope' ? { department: row.Department || '', unit: row.Unit || '' } : null,
                noData: ratio ? ratio.noData : false,
                calculationScope: ratio ? (ratio.calculationScope || { type: 'department', department: ratio.department }) : null,
                calculationMethod: ratio?.calculationMethod || null,
                targetSource: ratio?.targetSource || null,
            };
        }).filter(Boolean);
        const evaluableActivityTargets = activityTargets.filter(row => !row.noData && row.passed !== null);
        const activityTargetSummary = {
            configured: activityTargets.length,
            evaluable: evaluableActivityTargets.length,
            passed: evaluableActivityTargets.filter(row => row.passed === true).length,
            noData: activityTargets.length - evaluableActivityTargets.length,
        };
        const riskProfile = buildRiskProfile(metrics, { trainingPassRate, ppePassRate, currentYearActivity });
        const complianceSignals = [
            {
                key: 'training',
                label: 'Training',
                status: signalStatus({
                    actionNeeded: metrics.training > 0 && trainingPassRate < 60,
                    watch: metrics.training === 0 || (trainingPassRate != null && trainingPassRate < 80),
                }),
                value: metrics.training ? `${metrics.trainingPassed}/${metrics.training}` : 'No records',
                detail: trainingPassRate == null ? 'No training records for selected year' : `${trainingPassRate}% pass rate`,
            },
            {
                key: 'fourm',
                label: '4M Scope',
                status: signalStatus({ watch: metrics.fourmScopes === 0 }),
                value: `${metrics.fourmScopes} active`,
                detail: metrics.fourmScopes ? 'Employee is assigned to active 4M curriculum scope' : 'No active 4M Training Matrix scope',
            },
            {
                key: 'risk',
                label: 'Risk Events',
                status: signalStatus({
                    actionNeeded: metrics.accidents > 0 || metrics.ppeViolations > 0,
                    watch: metrics.patrolIssues > 0,
                }),
                value: `${metrics.accidents + metrics.ppeViolations + metrics.patrolIssues} events`,
                detail: `${metrics.accidents} accident, ${metrics.ppeViolations} PPE violation, ${metrics.patrolIssues} patrol issue`,
            },
            {
                key: 'activity',
                label: 'Safety Activity',
                status: signalStatus({ watch: currentYearActivity === 0 }),
                value: `${currentYearActivity} records`,
                detail: 'KY, Hiyari, CCCF records in selected year',
            },
            {
                key: 'ppe',
                label: 'PPE',
                status: signalStatus({
                    actionNeeded: metrics.ppeViolations > 0,
                    watch: metrics.ppeInspections > 0 && ppePassRate != null && ppePassRate < 90,
                }),
                value: metrics.ppeInspections ? `${metrics.ppeInspectionPassed}/${metrics.ppeInspections}` : 'No inspections',
                detail: metrics.ppeCompliancePct == null ? 'No PPE inspection data' : `${metrics.ppeCompliancePct}% average compliance`,
            },
        ];

        const overallStatus = riskProfile.status;
        const complianceScore = riskProfile.score;

        const timeline = [
            ...patrolRecent.map(r => timelineItem({ type: 'Patrol', module: 'patrol', date: r.PatrolDate, title: r.Area || r.PatrolType || 'Patrol record', status: r.PatrolType, detail: r.Notes, refId: r.id })),
            ...trainingRecent.map(r => timelineItem({ type: 'Training', module: 'training', date: r.TrainingDate, title: r.CourseName || r.CourseCode || 'Training', status: r.IsPassed ? 'Passed' : 'Not passed', detail: r.Score == null ? '' : `Score ${r.Score}`, refId: r.id })),
            ...hiyariRecent.map(r => timelineItem({ type: 'Hiyari', module: 'hiyari', date: r.ReportDate, title: r.Location || r.Description || 'Near-miss', status: r.Status, detail: r.Description, refId: r.id })),
            ...kyRecent.map(r => timelineItem({ type: 'KY', module: 'ky', date: r.ActivityDate, title: r.TeamName || r.HazardDescription || 'KY Activity', status: r.Status, detail: r.HazardDescription, refId: r.id })),
            ...accidentRecent.map(r => timelineItem({ type: 'Accident', module: 'accident', date: r.AccidentDate, title: r.AccidentType || r.Location || 'Accident report', status: r.Status, detail: r.Location, refId: r.id })),
            ...fourmRecent.map(r => timelineItem({ type: '4M Notice', module: 'fourm', date: r.RequestDate, title: `${r.NoticeNo || ''} ${r.Title || ''}`.trim(), status: r.Status, detail: r.ChangeType, refId: r.id })),
            ...fourmLogs.map(r => timelineItem({ type: '4M Matrix', module: 'fourm', date: r.PerformedAt, title: r.CurriculumTitle || r.CourseTitle || r.Action || '4M Training Matrix', status: r.Action, detail: r.CourseTitle || r.CurriculumCode, refId: r.id })),
            ...yokotenRecent.map(r => timelineItem({ type: 'Yokoten', module: 'yokoten', date: r.ResponseDate, title: `Yokoten #${r.YokotenID}`, status: r.ApprovalStatus, detail: r.IsRelated, refId: r.ResponseID })),
            ...selfPatrolRecent.map(r => timelineItem({ type: 'Self Patrol', module: 'patrol', date: r.CheckinDate, title: r.Location || 'Self Patrol', status: 'Recorded', detail: r.Notes, refId: r.id })),
            ...cccfWorkerRecent.map(r => timelineItem({ type: 'CCCF Worker', module: 'cccf', date: r.SubmitDate, title: r.JobArea || r.Equipment || 'CCCF Worker Form A', status: r.SafetyUnit, detail: r.Equipment, refId: r.id })),
            ...cccfPermanentRecent.map(r => timelineItem({ type: 'CCCF Permanent', module: 'cccf', date: r.SubmitDate, title: r.JobArea || r.Summary || 'CCCF Permanent Form A', status: r.Rank || r.StopType, detail: r.Summary, refId: r.id })),
            ...ppeInspectionRecent.map(r => timelineItem({ type: 'PPE Inspection', module: 'ppe', date: r.InspectionDate, title: r.WorkTypeName || r.Area || 'PPE inspection', status: r.IsPass ? 'Pass' : 'Issue', detail: r.CompliancePct == null ? '' : `${Math.round(Number(r.CompliancePct))}% compliance`, refId: r.InspectionID })),
            ...ppeViolationRecent.map(r => timelineItem({ type: 'PPE Violation', module: 'ppe', date: r.ViolationDate, title: r.WarningLevel || 'PPE violation', status: r.ViolationNo ? `No. ${r.ViolationNo}` : '', detail: r.Note || r.InspectorName, refId: r.ViolationID })),
        ]
            .filter(i => i.date)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 40);

        const timelineSummary = timeline.reduce((summary, item) => {
            summary.total += 1;
            summary.byModule[item.module] = (summary.byModule[item.module] || 0) + 1;
            summary.bySeverity[item.severity] = (summary.bySeverity[item.severity] || 0) + 1;
            return summary;
        }, { total: 0, byModule: {}, bySeverity: {} });

        res.json({
            success: true,
            data: {
                year,
                employee,
                access: { canManagePatrol: (req.user?.role || req.user?.Role) === 'Admin', canViewSensitive: canViewEmployee(req, employeeId) },
                metrics,
                complianceScore,
                overallStatus,
                riskProfile,
                complianceSignals,
                activityTargets,
                activityTargetSummary,
                fourmScopes,
                fourmLogs,
                cccfRecords: [...cccfWorkerRecent, ...cccfPermanentRecent],
                ppeInspections: ppeInspectionRecent,
                ppeViolations: ppeViolationRecent,
                patrolRecords: patrolRecent,
                selfPatrolRecords: selfPatrolRecent,
                trainingRecords: trainingRecent,
                timelineSummary,
                timeline,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
