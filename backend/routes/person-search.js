// backend/routes/person-search.js
// Employee Safety 360: searchable person profile backed by existing module tables.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { ACTIVITIES, getMergedTargets, getDynamicActivityRatio, getPeopleCoverage, getFixedCountAlignment } = require('./activity-targets');
const { getCccfWorkerProgress } = require('../utils/cccf-worker-progress');

const n = (value) => parseInt(value, 10) || 0;
const MAX_QUERY_LENGTH = 100;
const MAX_RESULT_LIMIT = 50;
const MAX_PAGE = 10000;

function textLength(value) {
    return Array.from(String(value || '')).length;
}

function hasControlCharacters(value) {
    return /[\u0000-\u001f\u007f]/u.test(String(value || ''));
}

function parseBoundedInteger(value, { name, fallback, min, max }) {
    if (value === undefined || value === null || value === '') return { ok: true, value: fallback };
    const raw = String(value).trim();
    if (!/^\d+$/.test(raw)) return { ok: false, message: `${name} must be an integer from ${min} to ${max}.` };
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
        ? { ok: true, value: parsed }
        : { ok: false, message: `${name} must be an integer from ${min} to ${max}.` };
}

function escapeLike(value) {
    return String(value || '').replace(/[=%_]/g, match => `=${match}`);
}

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

function isAdminRequest(req) {
    const role = req.user?.role || req.user?.Role;
    return String(role || '').toLowerCase() === 'admin';
}

function canViewEmployee(req, employeeId) {
    return isAdminRequest(req) || String(req.user?.id || '') === String(employeeId || '');
}

function clampScore(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function buildRiskProfile(metrics, activityTargets = []) {
    const riskEventCount = metrics.accidents + metrics.ppeViolations + metrics.patrolIssues;
    const configured = activityTargets.filter(Boolean);
    const evaluable = configured.filter(row => !row.noData && row.completionPct !== null && row.completionPct !== undefined);
    const score = evaluable.length
        ? clampScore(evaluable.reduce((sum, row) => sum + Number(row.completionPct || 0), 0) / evaluable.length)
        : null;
    const factorWeight = evaluable.length ? Math.round(100 / evaluable.length) : 0;
    const factors = evaluable.map(row => ({
        key: row.activityKey,
        label: row.label,
        score: clampScore(row.completionPct),
        weight: factorWeight,
    }));

    const reasons = [];
    const nextActions = [];
    configured.forEach(row => {
        if (row.noData || row.completionPct === null || row.completionPct === undefined) {
            reasons.push(`${row.label}: no data available for the configured target`);
            nextActions.push(`Verify source data for ${row.label}`);
        } else if (row.passed === false) {
            reasons.push(`${row.label}: ${row.actualCount || 0}/${row.yearlyTarget} (${row.completionPct}%), below ${row.passPct}% pass threshold`);
            nextActions.push(`Follow up the configured ${row.label} target`);
        }
    });
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
    if (!configured.length) reasons.push('No effective activity target configured by Admin');
    if (!reasons.length) reasons.push('All configured targets are on track and no major risk event was detected');
    if (!nextActions.length) nextActions.push(configured.length ? 'Maintain progress against configured targets' : 'No target-based follow-up required');

    const status = metrics.accidents > 0 || metrics.ppeViolations > 0 || (score !== null && score < 60)
        ? 'Action Needed'
        : metrics.patrolIssues > 0 || (score !== null && score < 80)
            ? 'Watch'
            : score === null
                ? (configured.length ? 'No Data' : 'No Target')
                : 'Good';

    return {
        score,
        status,
        factors,
        reasons: [...new Set(reasons)].slice(0, 8),
        nextActions: [...new Set(nextActions)].slice(0, 5),
        thresholds: { good: 80, watch: 60 },
        counters: {
            riskEventCount,
            configuredTargets: configured.length,
            evaluableTargets: evaluable.length,
        },
    };
}

function buildComplianceSignals(metrics, activityTargets = []) {
    const signals = activityTargets
        .filter(row => row.noData || row.passed === false)
        .map(row => ({
            key: row.activityKey,
            label: row.label,
            status: row.noData ? 'Watch' : Number(row.completionPct || 0) < 60 ? 'Action Needed' : 'Watch',
            value: row.noData ? 'No data' : `${row.actualCount || 0}/${row.yearlyTarget}`,
            detail: row.noData
                ? 'No source data for this configured target'
                : `${row.completionPct}% complete · pass threshold ${row.passPct}%`,
        }));
    const riskEvents = metrics.accidents + metrics.ppeViolations + metrics.patrolIssues;
    if (riskEvents > 0) {
        signals.push({
            key: 'risk',
            label: 'Risk Events',
            status: metrics.accidents > 0 || metrics.ppeViolations > 0 ? 'Action Needed' : 'Watch',
            value: `${riskEvents} events`,
            detail: `${metrics.accidents} accident, ${metrics.ppeViolations} PPE violation, ${metrics.patrolIssues} patrol issue`,
        });
    }
    return signals;
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
    const isAdmin = isAdminRequest(req);
    if ((req.query.q !== undefined && typeof req.query.q !== 'string')
        || (req.query.department !== undefined && typeof req.query.department !== 'string')) {
        return res.status(400).json({ success: false, message: 'Invalid search parameters.' });
    }
    const q = String(req.query.q || '').trim();
    const department = String(req.query.department || '').trim();
    const limitResult = parseBoundedInteger(req.query.limit, { name: 'limit', fallback: 20, min: 1, max: MAX_RESULT_LIMIT });
    const pageResult = parseBoundedInteger(req.query.page, { name: 'page', fallback: 1, min: 1, max: MAX_PAGE });
    if (!limitResult.ok) return res.status(400).json({ success: false, message: limitResult.message });
    if (!pageResult.ok) return res.status(400).json({ success: false, message: pageResult.message });
    if (isAdmin && (textLength(q) < 2 || textLength(q) > MAX_QUERY_LENGTH || hasControlCharacters(q))) {
        return res.status(400).json({ success: false, message: 'q must contain 2 to 100 characters.' });
    }
    if (textLength(department) > 150 || hasControlCharacters(department)) {
        return res.status(400).json({ success: false, message: 'department must contain at most 150 characters.' });
    }
    const limit = limitResult.value;
    const page = pageResult.value;
    const offset = (page - 1) * limit;
    const params = [];

    let sql = `SELECT EmployeeID, EmployeeName, Department, Unit, Team, Position FROM Employees WHERE ${isAdmin ? '1=1' : 'EmployeeID = ?'}`;
    if (!isAdmin) {
        params.push(String(req.user?.id || ''));
    } else if (q) {
        sql += ` AND (EmployeeID LIKE ? ESCAPE '=' OR EmployeeName LIKE ? ESCAPE '=' OR Department LIKE ? ESCAPE '=' OR Unit LIKE ? ESCAPE '=' OR Position LIKE ? ESCAPE '=')`;
        const like = `%${escapeLike(q)}%`;
        params.push(like, like, like, like, like);
    }
    if (isAdmin && department && department !== 'all') {
        sql += ` AND Department = ?`;
        params.push(department);
    }
    sql += ` ORDER BY EmployeeName ASC, EmployeeID ASC LIMIT ${limit} OFFSET ${offset}`;

    try {
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows, pagination: { page, limit, returned: rows.length } });
    } catch {
        res.status(500).json({ success: false, message: 'Unable to load employee search results.' });
    }
});

router.get('/profile/:employeeId', async (req, res) => {
    const employeeId = String(req.params.employeeId || '').trim();
    if (!employeeId) return res.status(400).json({ success: false, message: 'ต้องระบุ EmployeeID' });
    if (textLength(employeeId) > 50 || hasControlCharacters(employeeId)) {
        return res.status(400).json({ success: false, message: 'EmployeeID must contain at most 50 characters.' });
    }
    const yearResult = parseBoundedInteger(req.query.year, { name: 'year', fallback: new Date().getFullYear(), min: 2000, max: 2100 });
    if (!yearResult.ok) return res.status(400).json({ success: false, message: yearResult.message });
    const year = yearResult.value;
    if (!canViewEmployee(req, employeeId)) {
        return res.status(403).json({ success: false, message: 'คุณสามารถดู Safety 360 ของตนเองเท่านั้น' });
    }
    const isAdmin = isAdminRequest(req);

    try {
        const [[employee]] = await db.query(
            `SELECT EmployeeID, EmployeeName, Department, Unit, Team, Position, CompanyEmail
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
        const cccfWorkerProgress = await getCccfWorkerProgress(db, year, { ensureSchema: false }).catch(() => ({ employees: [] }));
        const cccfWorkerSelf = (cccfWorkerProgress.employees || [])
            .find(row => String(row.employeeId || '').trim() === String(employeeId || '').trim()) || null;

        const metrics = {
            patrol: n(patrol?.cnt),
            patrolIssues: n(patrolIssues?.cnt),
            cccfWorker: cccfWorkerSelf ? n(cccfWorkerSelf.actualTowardTarget) : n(cccfWorker?.cnt),
            cccfWorkerRaw: cccfWorkerSelf ? n(cccfWorkerSelf.rawRecords) : n(cccfWorker?.cnt),
            cccfWorkerTarget: cccfWorkerSelf ? n(cccfWorkerSelf.target) : 0,
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

        const activityActuals = {
            patrol: metrics.patrol, patrol_issue: metrics.patrolIssues,
            cccf_worker: metrics.cccfWorker, cccf_permanent: metrics.cccfPermanent,
            scw: metrics.scwDocs, training: metrics.trainingPassed, yokoten: metrics.yokoten,
            hiyari: metrics.hiyari, ky: metrics.ky,
        };
        const { overrideMap, scopeMap, templateMap, unit } = await getMergedTargets(employeeId, year, { ensureSchema: false });
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
            const yearlyTarget = activity.key === 'cccf_worker' && cccfWorkerSelf
                ? Number(cccfWorkerSelf.target || 0)
                : ratio ? ratio.denominator : Number(row.YearlyTarget);
            const actualCount = activity.key === 'cccf_worker' && cccfWorkerSelf
                ? Number(cccfWorkerSelf.actualTowardTarget || 0)
                : ratio ? ratio.numerator : Number(activityActuals[activity.key] || 0);
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
                rawRecords: activity.key === 'cccf_worker' && cccfWorkerSelf ? Number(cccfWorkerSelf.rawRecords || 0) : undefined,
                calculationMethod: activity.key === 'cccf_worker' && cccfWorkerSelf ? 'cccf_worker_progress_engine_actual_toward_target' : (ratio?.calculationMethod || null),
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
        const riskProfile = buildRiskProfile(metrics, activityTargets);
        const complianceSignals = buildComplianceSignals(metrics, activityTargets);

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

        const responseEmployee = isAdmin
            ? employee
            : {
                EmployeeID: employee.EmployeeID,
                EmployeeName: employee.EmployeeName,
                Department: employee.Department,
                Unit: employee.Unit,
                Team: employee.Team,
                Position: employee.Position,
            };
        const responseRiskProfile = isAdmin
            ? riskProfile
            : {
                score: riskProfile.score,
                status: riskProfile.status,
                thresholds: riskProfile.thresholds,
                factors: [],
                reasons: [],
                nextActions: [],
                counters: {},
            };
        res.json({
            success: true,
            data: {
                year,
                employee: responseEmployee,
                access: {
                    canViewSensitive: isAdmin,
                    canViewRiskDetail: isAdmin,
                    canExport: isAdmin,
                    scope: isAdmin ? 'all' : 'self',
                },
                metrics,
                complianceScore,
                overallStatus,
                riskProfile: responseRiskProfile,
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
    } catch {
        res.status(500).json({ success: false, message: 'Unable to load Safety 360 profile.' });
    }
});

module.exports = router;
