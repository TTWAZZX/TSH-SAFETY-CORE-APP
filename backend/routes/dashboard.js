// backend/routes/dashboard.js
// Cross-module KPI overview — accessible to all authenticated users.
// Mounted at /api/dashboard (authenticateToken only, no isAdmin).
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');
const { getCoverageMatrix } = require('./activity-targets');
const { getCccfWorkerProgress } = require('../utils/cccf-worker-progress');
const { createDashboardMetric } = require('../utils/dashboard-metric-contract');
const { buildUnitCoverage } = require('../utils/yokoten-admin-scope');

const safe = async (sql, params = []) => {
    try { const [[r]] = await db.query(sql, params); return r?.cnt ?? r?.val ?? 0; }
    catch { return null; }
};

const safeRows = async (sql, params = []) => {
    try { const [rows] = await db.query(sql, params); return rows || []; }
    catch { return []; }
};

const DEFAULT_CONFIG = {
    healthGreen: 85,
    healthAmber: 65,
    alertDueSoonDays: 7,
    hiddenModules: [],
    pinnedDepartments: [],
    cccfWorkerSource: 'manual_unit_target',
    cccfWorkerSourceByYear: {},
};

let configReady = false;
async function ensureConfigTable() {
    if (configReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS Dashboard_Config (
            ConfigKey   VARCHAR(80) PRIMARY KEY,
            ConfigValue JSON,
            UpdatedBy   VARCHAR(100),
            UpdatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    await db.query(
        `INSERT IGNORE INTO Dashboard_Config (ConfigKey, ConfigValue, UpdatedBy)
         VALUES ('enterprise', ?, 'System')`,
        [JSON.stringify(DEFAULT_CONFIG)]
    );
    configReady = true;
}

async function getDashboardConfig() {
    try {
        await ensureConfigTable();
        const [rows] = await db.query(
            `SELECT ConfigValue FROM Dashboard_Config WHERE ConfigKey='enterprise' LIMIT 1`
        );
        const raw = rows[0]?.ConfigValue;
        const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
        return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

function sanitizeConfig(body = {}) {
    const clamp = (value, fallback, min = 0, max = 100) => {
        const n = parseInt(value, 10);
        if (Number.isNaN(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    };
    const toStringArray = (value) => Array.isArray(value)
        ? value.map(v => String(v || '').trim()).filter(Boolean).slice(0, 30)
        : [];
    const sourceByYear = Object.entries(
        body.cccfWorkerSourceByYear && typeof body.cccfWorkerSourceByYear === 'object' && !Array.isArray(body.cccfWorkerSourceByYear)
            ? body.cccfWorkerSourceByYear
            : {}
    ).reduce((result, [year, source]) => {
        const yearNo = parseInt(year, 10);
        if (yearNo >= 2000 && yearNo <= 2100) {
            result[String(yearNo)] = source === 'actual_department_worker'
                ? 'actual_department_worker'
                : 'manual_unit_target';
        }
        return result;
    }, {});

    return {
        healthGreen: clamp(body.healthGreen, DEFAULT_CONFIG.healthGreen, 1, 100),
        healthAmber: clamp(body.healthAmber, DEFAULT_CONFIG.healthAmber, 1, 100),
        alertDueSoonDays: clamp(body.alertDueSoonDays, DEFAULT_CONFIG.alertDueSoonDays, 1, 60),
        hiddenModules: toStringArray(body.hiddenModules),
        pinnedDepartments: toStringArray(body.pinnedDepartments),
        cccfWorkerSource: body.cccfWorkerSource === 'actual_department_worker'
            ? 'actual_department_worker'
            : 'manual_unit_target',
        cccfWorkerSourceByYear: sourceByYear,
    };
}

function resolveCccfWorkerSource(config = {}, year = new Date().getFullYear()) {
    const annual = config.cccfWorkerSourceByYear?.[String(parseInt(year, 10))];
    const source = annual || config.cccfWorkerSource;
    return source === 'actual_department_worker' ? 'actual_department_worker' : 'manual_unit_target';
}

function pct(n, d) {
    const numerator = parseFloat(n) || 0;
    const denominator = parseFloat(d) || 0;
    if (!denominator) return null;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function normalizeDepartmentKey(value) {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/\./g, '')
        .replace(/\s+/g, ' ');
}

function normalizeUnitKey(value) {
    return String(value || '')
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');
}

function buildHiyariAssignmentCoverage(assignmentRows = [], submissionRows = []) {
    const submittedEmployees = new Set(
        submissionRows
            .map(row => String(row.ReporterID || '').trim().toLowerCase())
            .filter(Boolean)
    );
    const coverage = new Map();
    for (const row of assignmentRows) {
        const department = normalizeDepartmentKey(row.Department);
        if (!department) continue;
        const metric = coverage.get(department) || {
            numerator: 0,
            denominator: 0,
            source: 'Distinct annual Hiyari assignees submitted / current assignments',
        };
        metric.denominator += 1;
        const employeeId = String(row.EmployeeID || '').trim().toLowerCase();
        if (employeeId && submittedEmployees.has(employeeId)) metric.numerator += 1;
        coverage.set(department, metric);
    }
    for (const metric of coverage.values()) {
        metric.value = pct(metric.numerator, metric.denominator);
    }
    return coverage;
}

function buildHealthIndex(metrics, config) {
    const positive = [
        metrics.patrolRate,
        metrics.cccfPermPct,
        metrics.yokotenPct,
        metrics.trainingPassRate,
    ].filter(v => v !== null && v !== undefined);
    const base = positive.length
        ? Math.round(positive.reduce((s, v) => s + v, 0) / positive.length)
        : 70;

    const penalty =
        Math.min((parseInt(metrics.accRecordable, 10) || 0) * 15, 30) +
        Math.min((parseInt(metrics.hiyariOpen, 10) || 0) * 2, 18) +
        Math.min((parseInt(metrics.fourmOpen, 10) || 0) * 2, 15) +
        Math.min((parseInt(metrics.patrolOpenIssues, 10) || 0) * 1, 15);

    const score = Math.max(0, Math.min(100, base - penalty));
    const status = score >= config.healthGreen ? 'Good' : score >= config.healthAmber ? 'Watch' : 'Critical';
    return { score, status, base, penalty, thresholds: { green: config.healthGreen, amber: config.healthAmber } };
}

async function buildComplianceMatrix(year, config) {
    const cccfWorkerSource = resolveCccfWorkerSource(config, year);
    const deptRows = await safeRows(`SELECT Name FROM Master_Departments ORDER BY Name ASC`);
    const allDeptNames = deptRows.map(r => r.Name).filter(Boolean);
    const deptNames = config.pinnedDepartments?.length
        ? config.pinnedDepartments.filter(d => allDeptNames.includes(d))
        : allDeptNames.slice(0, 12);

    if (!deptNames.length) return [];
    const params = [year];

    const [
        hiyariAssignmentRows,
        trainingRows,
        kyConfigRows,
        kyRows,
        hiyariSubmissionRows,
        fourmRows,
        yokotenConfigRows,
        yokotenTopicRows,
        yokotenResponseRows,
        patrolIssueRows,
        cccfUnitSettingRows,
        cccfUnitTargetRows,
        cccfWorkerUnitRows,
        masterUnitRows,
        cccfAssignmentRows,
        cccfPermanentRows,
        accidentRows,
        machineRows,
        ojtRows,
        safetyCultureRows,
    ] = await Promise.all([
        safeRows(`
            SELECT a.EmployeeID, COALESCE(e.Department, a.Department) AS Department
            FROM Hiyari_Assignments a
            LEFT JOIN Employees e ON e.EmployeeID = a.EmployeeID
        `),
        safeRows(`
            SELECT Department, SUM(PassedCount) AS passed, SUM(TotalEmp) AS total
            FROM Training_Dept_Records
            WHERE Year=?
            GROUP BY Department
        `, params),
        safeRows(`
            SELECT Department, SafetyUnits, YearlyTarget
            FROM KY_Program_Config
            WHERE Year = ? AND IsActive = 1
        `, params),
        safeRows(`
            SELECT Department, COUNT(*) AS cnt
            FROM KY_Activities
            WHERE YEAR(ActivityDate)=?
            GROUP BY Department
        `, params),
        safeRows(`
            SELECT DISTINCT ReporterID
            FROM HiyariReports
            WHERE DeletedAt IS NULL AND YEAR(ReportDate)=?
        `, params),
        safeRows(`
            SELECT Department,
                   COUNT(*) AS total,
                   COALESCE(SUM(Status = 'Closed'), 0) AS closed
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate)=?
            GROUP BY Department
        `, params),
        safeRows(`
            SELECT ConfigKey, ConfigValue
            FROM Yokoten_Dashboard_Config
            WHERE ConfigKey IN ('pinnedDepts', 'pinnedUnits')
        `),
        safeRows(`
            SELECT YokotenID, TargetDepts, TargetUnits
            FROM YokotenTopics
            WHERE IsActive = 1 AND (DateIssued IS NULL OR YEAR(DateIssued)=?)
        `, params),
        safeRows(`
            SELECT r.YokotenID, r.Department,
                   COALESCE(NULLIF(r.SafetyUnit, ''), NULLIF(e.Unit, ''), NULLIF(e.Team, '')) AS EffectiveSafetyUnit
            FROM YokotenResponses r
            LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
            WHERE (r.IsDeleted IS NULL OR r.IsDeleted = 0)
        `),
        safeRows(`
            SELECT IssueID, ResponsibleDept, CurrentStatus
            FROM Patrol_Issues
            WHERE YEAR(DateFound)=?
        `, params),
        safeRows(`SELECT value FROM App_Settings WHERE key_name='cccf_unit_sel' LIMIT 1`),
        safeRows(`
            SELECT unit_name AS Unit, yearly_target AS target, achieved_override AS achievedOverride
            FROM CCCF_Unit_Targets
            WHERE target_year=?
        `, params),
        safeRows(`
            SELECT TRIM(COALESCE(SafetyUnit,'')) AS Unit,
                   MAX(TRIM(COALESCE(Department,''))) AS Department,
                   COUNT(DISTINCT COALESCE(
                       NULLIF(TRIM(EmployeeID), ''),
                       NULLIF(LOWER(TRIM(EmployeeName)), ''),
                       CONCAT('__legacy_row__', id)
                   )) AS computedAchieved
            FROM CCCF_FormA_Worker
            WHERE YEAR(SubmitDate)=?
            GROUP BY TRIM(COALESCE(SafetyUnit,''))
        `, params),
        safeRows(`
            SELECT TRIM(u.name) AS Unit, TRIM(u.name) AS name, u.short_code,
                   TRIM(COALESCE(d.Name,'')) AS Department, TRIM(COALESCE(d.Name,'')) AS department
            FROM Master_SafetyUnits u
            LEFT JOIN Master_Departments d ON d.id=u.department_id
        `),
        safeRows(`
            SELECT COALESCE(e.Department, a.Department) AS Department,
                   COUNT(DISTINCT COALESCE(NULLIF(a.EmployeeID, ''), a.id)) AS assigned
            FROM CCCF_Assignments a
            LEFT JOIN Employees e ON e.EmployeeID = a.EmployeeID
            GROUP BY COALESCE(e.Department, a.Department)
        `),
        safeRows(`
            SELECT COALESCE(e.Department, a.Department, p.Department) AS Department,
                   COUNT(DISTINCT COALESCE(NULLIF(p.AssigneeID, ''), p.id)) AS completed
            FROM CCCF_FormA_Permanent p
            LEFT JOIN CCCF_Assignments a ON a.EmployeeID = p.AssigneeID
            LEFT JOIN Employees e ON e.EmployeeID = p.AssigneeID
            WHERE YEAR(p.SubmitDate)=?
              AND (p.ReviewStatus = 'Completed' OR (p.ReviewStatus IS NULL AND p.FileUrl IS NOT NULL))
            GROUP BY COALESCE(e.Department, a.Department, p.Department)
        `, params),
        safeRows(`
            SELECT Department,
                   COUNT(*) AS total,
                   COALESCE(SUM(Status IN ('Closed','closed')), 0) AS closed
            FROM Accident_Reports
            WHERE YEAR(AccidentDate)=? AND (IsDeleted IS NULL OR IsDeleted = 0)
            GROUP BY Department
        `, params),
        safeRows(`
            SELECT m.Department,
                   COUNT(DISTINCT m.id) AS machines,
                   COALESCE(SUM(c.passItems), 0) AS passItems,
                   COALESCE(SUM(c.checkedItems), 0) AS checkedItems,
                   COALESCE(SUM(i.issueTotal), 0) AS issueTotal,
                   COALESCE(SUM(i.issueClosed), 0) AS issueClosed
            FROM Machine_Safety m
            LEFT JOIN (
                SELECT MachineID,
                       SUM(Status = 'pass') AS passItems,
                       SUM(Status <> 'na') AS checkedItems
                FROM Machine_Safety_Compliance
                GROUP BY MachineID
            ) c ON c.MachineID = m.id
            LEFT JOIN (
                SELECT MachineID,
                       COUNT(*) AS issueTotal,
                       SUM(Status = 'resolved') AS issueClosed
                FROM Machine_Safety_Issues
                GROUP BY MachineID
            ) i ON i.MachineID = m.id
            WHERE m.Status IS NULL OR m.Status <> 'inactive'
            GROUP BY m.Department
        `),
        safeRows(`
            SELECT r.Department, r.OJTDate, r.NextReviewDate, r.AttendeeCount, r.YearlyTarget
            FROM OJT_Records r
            WHERE r.id = (
                SELECT r2.id
                FROM OJT_Records r2
                WHERE TRIM(r2.Department)=TRIM(r.Department)
                ORDER BY COALESCE(r2.UpdatedAt, r2.OJTDate) DESC, r2.id DESC
                LIMIT 1
            )
        `),
        safeRows(`
            SELECT Department, AVG(CompliancePct) AS pct
            FROM SC_PPEInspections
            WHERE YEAR(InspectionDate)=? AND (deleted_at IS NULL)
            GROUP BY Department
        `, params),
    ]);

    const byDept = (rows, valueFn) => {
        const m = new Map();
        for (const r of rows) {
            const deptKey = normalizeDepartmentKey(r.Department);
            if (deptKey) m.set(deptKey, valueFn(r));
        }
        return m;
    };
    const parseJsonArray = (value) => {
        if (!value) return [];
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.map(v => String(v || '').trim()).filter(Boolean) : [];
        } catch (_) {
            return String(value).split(/\s*(?:\|+|;|,)\s*/).map(v => v.trim()).filter(Boolean);
        }
    };
    const trainingStats = byDept(trainingRows, r => ({
        value: pct(r.passed, r.total),
        numerator: parseInt(r.passed, 10) || 0,
        denominator: parseInt(r.total, 10) || 0,
    }));
    const training = new Map([...trainingStats].map(([key, metric]) => [key, metric.value]));
    const kyActual = byDept(kyRows, r => parseInt(r.cnt, 10) || 0);
    const kyTargets = new Map();
    for (const r of kyConfigRows) {
        const dept = normalizeDepartmentKey(r.Department);
        if (!dept) continue;
        const units = parseJsonArray(r.SafetyUnits);
        const unitCount = Math.max(1, units.length);
        const yearlyTarget = parseInt(r.YearlyTarget, 10) || 12;
        kyTargets.set(dept, unitCount * yearlyTarget);
    }
    const hiyariCoverage = buildHiyariAssignmentCoverage(hiyariAssignmentRows, hiyariSubmissionRows);
    const fourm = byDept(fourmRows, r => pct(r.closed, r.total));
    const yokotenConfig = new Map(yokotenConfigRows.map(row => [
        String(row.ConfigKey || ''),
        parseJsonArray(row.ConfigValue),
    ]));
    const yokotenPinnedUnits = new Set((yokotenConfig.get('pinnedUnits') || []).map(normalizeUnitKey));
    const yokotenTopics = yokotenTopicRows.filter(topic => {
        if (!yokotenPinnedUnits.size) return true;
        const targetUnits = parseJsonArray(topic.TargetUnits).map(normalizeUnitKey);
        return !targetUnits.length || targetUnits.some(unit => yokotenPinnedUnits.has(unit));
    });
    const yokotenResponseMap = new Map();
    for (const row of yokotenResponseRows) {
        const department = normalizeDepartmentKey(row.Department);
        if (!department) continue;
        yokotenResponseMap.set(`${department}::${row.YokotenID}`, row);
    }
    const yokotenTargets = new Map();
    const yokotenDone = new Map();
    for (const topic of yokotenTopics) {
        const targets = parseJsonArray(topic.TargetDepts);
        const targetKeys = new Set(targets.map(normalizeDepartmentKey));
        const scoped = targets.length
            ? deptNames.filter(dept => targetKeys.has(normalizeDepartmentKey(dept)))
            : deptNames;
        for (const dept of scoped) {
            const deptKey = normalizeDepartmentKey(dept);
            if (!deptKey) continue;
            yokotenTargets.set(deptKey, (yokotenTargets.get(deptKey) || 0) + 1);
            const response = yokotenResponseMap.get(`${deptKey}::${topic.YokotenID}`) || null;
            const coverage = buildUnitCoverage({
                department: dept,
                topicUnits: parseJsonArray(topic.TargetUnits),
                responseUnits: parseJsonArray(response?.EffectiveSafetyUnit),
                responseExists: !!response,
                masterUnits: masterUnitRows,
            });
            if (coverage.complete) {
                yokotenDone.set(deptKey, (yokotenDone.get(deptKey) || 0) + 1);
            }
        }
    }
    const patrolIssueCounts = new Map();
    for (const issue of patrolIssueRows) {
        for (const department of parseJsonArray(issue.ResponsibleDept)) {
            const key = normalizeDepartmentKey(department);
            if (!key) continue;
            const counts = patrolIssueCounts.get(key) || { total: 0, closed: 0 };
            counts.total += 1;
            if (issue.CurrentStatus === 'Closed') counts.closed += 1;
            patrolIssueCounts.set(key, counts);
        }
    }
    const patrolIssues = new Map([...patrolIssueCounts].map(([key, counts]) => [
        key,
        counts.total ? pct(counts.closed, counts.total) : 100,
    ]));
    const selectedCccfUnits = new Set(parseJsonArray(cccfUnitSettingRows[0]?.value).map(normalizeUnitKey));
    const masterUnitDepartments = new Map();
    for (const row of masterUnitRows) {
        const unit = normalizeUnitKey(row.Unit);
        const department = normalizeDepartmentKey(row.Department);
        if (unit && department) masterUnitDepartments.set(unit, department);
    }
    const cccfWorkerUnitActual = new Map();
    const cccfWorkerUnitDepartment = new Map();
    for (const row of cccfWorkerUnitRows) {
        const unit = normalizeUnitKey(row.Unit);
        if (!unit) continue;
        cccfWorkerUnitActual.set(unit, Math.max(0, Number(row.computedAchieved || 0)));
        const department = normalizeDepartmentKey(row.Department);
        if (department) cccfWorkerUnitDepartment.set(unit, department);
    }
    const cccfWorkerByUnit = new Map();
    for (const row of cccfUnitTargetRows) {
        const unit = normalizeUnitKey(row.Unit);
        if (!unit || (selectedCccfUnits.size && !selectedCccfUnits.has(unit))) continue;
        const department = masterUnitDepartments.get(unit) || cccfWorkerUnitDepartment.get(unit);
        const target = Math.max(0, Number(row.target || 0));
        if (!department || target <= 0) continue;
        const computed = cccfWorkerUnitActual.get(unit) || 0;
        const hasOverride = row.achievedOverride !== null && row.achievedOverride !== undefined && row.achievedOverride !== '';
        const achieved = cccfWorkerSource === 'actual_department_worker'
            ? computed
            : (hasOverride ? Math.max(0, Number(row.achievedOverride || 0)) : computed);
        const metric = cccfWorkerByUnit.get(department) || {
            numerator: 0,
            denominator: 0,
            units: 0,
            source: cccfWorkerSource === 'actual_department_worker'
                ? 'Distinct CCCF Worker submitters / shared Unit targets'
                : 'CCCF manual Unit target/override',
        };
        metric.numerator += Math.min(achieved, target);
        metric.denominator += target;
        metric.units += 1;
        cccfWorkerByUnit.set(department, metric);
    }
    for (const metric of cccfWorkerByUnit.values()) {
        metric.value = pct(metric.numerator, metric.denominator);
    }
    const cccfAssigned = byDept(cccfAssignmentRows, r => parseInt(r.assigned, 10) || 0);
    const cccfPermanent = byDept(cccfPermanentRows, r => parseInt(r.completed, 10) || 0);
    const accidentStats = byDept(accidentRows, r => {
        const total = parseInt(r.total, 10) || 0;
        const closed = parseInt(r.closed, 10) || 0;
        return { value: total ? pct(closed, total) : 100, numerator: closed, denominator: total };
    });
    const accident = new Map([...accidentStats].map(([key, metric]) => [key, metric.value]));
    const machine = byDept(machineRows, r => {
        const machines = parseInt(r.machines, 10) || 0;
        if (!machines) return null;
        const checkedItems = parseInt(r.checkedItems, 10) || 0;
        const compliancePct = checkedItems ? pct(r.passItems, checkedItems) : 0;
        const issueTotal = parseInt(r.issueTotal, 10) || 0;
        const issuePct = issueTotal ? pct(r.issueClosed, issueTotal) : 100;
        return Math.round((compliancePct + issuePct) / 2);
    });
    const ojtStats = byDept(ojtRows, r => {
        if (!r.OJTDate) return { value: 0, numerator: 0, denominator: 0, overdue: false };
        const target = parseInt(r.YearlyTarget, 10) || 0;
        const attendees = parseInt(r.AttendeeCount, 10) || 0;
        const coverage = target > 0 ? pct(attendees, target) : 100;
        const nextReview = r.NextReviewDate ? new Date(r.NextReviewDate) : null;
        const overdue = nextReview && !Number.isNaN(nextReview.getTime()) && nextReview < new Date();
        return {
            value: overdue ? Math.min(coverage, 50) : coverage,
            numerator: attendees,
            denominator: target,
            overdue: Boolean(overdue),
        };
    });
    const ojt = new Map([...ojtStats].map(([key, metric]) => [key, metric.value]));
    const safetyCulture = byDept(safetyCultureRows, r => {
        const v = parseFloat(r.pct);
        return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null;
    });
    const targetMatrix = await getCoverageMatrix(year, { ensureSchema: false }).catch(() => ({ rows: [] }));
    const targetByDept = new Map();
    for (const row of targetMatrix.rows) {
        const dept = normalizeDepartmentKey(row.department);
        if (!dept) continue;
        if (!targetByDept.has(dept)) targetByDept.set(dept, { slots: 0, covered: 0, missing: 0, zero: 0, na: 0, scope: 0, override: 0, template: 0 });
        const meta = targetByDept.get(dept);
        meta.slots += 1;
        if (row.isNA) meta.na += 1;
        else if (row.source === 'missing') meta.missing += 1;
        else if (row.isZero) meta.zero += 1;
        else meta.covered += 1;
        if (Object.prototype.hasOwnProperty.call(meta, row.source)) meta[row.source] += 1;
    }

    return deptNames.map(dept => {
        const deptKey = normalizeDepartmentKey(dept);
        const kyTarget = kyTargets.get(deptKey) || 12;
        const yokotenTarget = yokotenTargets.get(deptKey) || 0;
        const cccfAssignedTotal = cccfAssigned.get(deptKey) || 0;
        const targetMeta = targetByDept.get(deptKey) || { slots: 0, covered: 0, missing: 0, zero: 0, na: 0, scope: 0, override: 0, template: 0 };
        const cccfWorkerMetric = cccfWorkerByUnit.get(deptKey);
        const patrolMetric = patrolIssueCounts.get(deptKey) || { total: 0, closed: 0 };
        const accidentMetric = accidentStats.get(deptKey) || { numerator: 0, denominator: 0 };
        const ojtMetric = ojtStats.get(deptKey);
        const trainingMetric = trainingStats.get(deptKey);
        const hiyariMetric = hiyariCoverage.get(deptKey);
        const cells = {
            activityTargets: targetMeta.slots ? pct(targetMeta.covered + targetMeta.na, targetMeta.slots) : null,
            cccfWorker: cccfWorkerMetric?.value ?? null,
            cccfPermanent: cccfAssignedTotal ? pct(cccfPermanent.get(deptKey) || 0, cccfAssignedTotal) : null,
            patrolIssues: patrolIssues.get(deptKey) ?? 100,
            hiyari: hiyariMetric?.value ?? null,
            ky: pct(kyActual.get(deptKey) || 0, kyTarget),
            yokoten: yokotenTarget ? pct(yokotenDone.get(deptKey) || 0, yokotenTarget) : null,
            training: training.get(deptKey),
            fourm: fourm.get(deptKey),
            accident: accident.get(deptKey) ?? 100,
            machine: machine.get(deptKey),
            ojt: ojt.get(deptKey) ?? 0,
            safetyCulture: safetyCulture.get(deptKey),
        };
        const coverageMeta = {
            activityTargets: { numerator: targetMeta.covered + targetMeta.na, denominator: targetMeta.slots, source: 'Activity target configuration' },
            cccfWorker: cccfWorkerMetric || null,
            cccfPermanent: { numerator: cccfPermanent.get(deptKey) || 0, denominator: cccfAssignedTotal, source: 'Completed CCCF Permanent / current assignments' },
            patrolIssues: { numerator: patrolMetric.closed, denominator: patrolMetric.total, source: patrolMetric.total ? 'Closed Patrol issues / issues found this year' : 'No Patrol issues found this year' },
            hiyari: hiyariMetric || null,
            ky: { numerator: kyActual.get(deptKey) || 0, denominator: kyTarget, source: 'KY activities / configured Unit targets' },
            yokoten: { numerator: yokotenDone.get(deptKey) || 0, denominator: yokotenTarget, source: 'Responded / assigned Yokoten topics issued this year' },
            training: trainingMetric ? { ...trainingMetric, source: 'Passed / total Training department records' } : null,
            accident: { numerator: accidentMetric.numerator, denominator: accidentMetric.denominator, source: accidentMetric.denominator ? 'Closed / reported accidents this year' : 'No accidents reported this year' },
            ojt: ojtMetric ? { ...ojtMetric, source: 'Current OJT attendee target and review date' } : null,
        };
        const values = Object.values(cells).filter(v => v !== null && v !== undefined);
        const score = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;
        return { department: dept, score, targetMeta, coverageMeta, ...cells };
    }).sort((a, b) => a.score - b.score || a.department.localeCompare(b.department, 'th'));
}

function dashboardList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(item => String(item || '').trim()).filter(Boolean) : [];
    } catch (_) {
        return String(value).split(/\s*(?:\|+|;|,)\s*/).map(item => item.trim()).filter(Boolean);
    }
}

async function dashboardRowState(sql, params = []) {
    try {
        const [rows] = await db.query(sql, params);
        return { available: true, row: rows[0] || {} };
    } catch (error) {
        return { available: false, row: {}, error: error.message };
    }
}

async function buildHiyariCompanyProgress(year) {
    const state = await dashboardRowState(`
        SELECT COUNT(DISTINCT a.id) AS denominator,
               COUNT(DISTINCT CASE WHEN r.id IS NOT NULL THEN a.id END) AS numerator
          FROM Hiyari_Assignments a
          LEFT JOIN HiyariReports r
            ON NULLIF(TRIM(r.ReporterID),'') = NULLIF(TRIM(a.EmployeeID),'')
           AND YEAR(r.ReportDate)=?
           AND r.DeletedAt IS NULL
           AND r.Status IN ('Closed','closed')
    `, [year]);
    return {
        available: state.available,
        error: state.error || null,
        numerator: Number(state.row.numerator || 0),
        denominator: Number(state.row.denominator || 0),
    };
}

async function buildPatrolCompanyProgress(year) {
    const now = new Date();
    const elapsedMonths = year < now.getFullYear() ? 12 : year > now.getFullYear() ? 0 : now.getMonth() + 1;
    const state = await dashboardRowState(`
        SELECT COALESCE(SUM(LEAST(COALESCE(actual.actualCount,0), roster.requiredSlots)),0) AS numerator,
               COALESCE(SUM(roster.requiredSlots),0) AS denominator
          FROM (
                SELECT EmployeeID,
                       CEIL(SUM(COALESCE(TargetPerYear,0)) * ? / 12) AS requiredSlots
                  FROM Patrol_Roster
                 GROUP BY EmployeeID
               ) roster
          LEFT JOIN (
                SELECT EmployeeID, SUM(actualCount) AS actualCount
                  FROM (
                        SELECT UserID AS EmployeeID, COUNT(*) AS actualCount
                          FROM Patrol_Attendance
                         WHERE YEAR(PatrolDate)=?
                         GROUP BY UserID
                        UNION ALL
                        SELECT EmployeeID, COUNT(*) AS actualCount
                          FROM Patrol_Self_Checkin
                         WHERE Year=?
                         GROUP BY EmployeeID
                       ) activity
                 GROUP BY EmployeeID
               ) actual ON actual.EmployeeID=roster.EmployeeID
    `, [elapsedMonths, year, year]);
    return {
        ...state,
        numerator: Number(state.row.numerator || 0),
        denominator: Number(state.row.denominator || 0),
        elapsedMonths,
    };
}

async function buildKyCompanyProgress(year) {
    try {
        const [[configs], [activities]] = await Promise.all([
            db.query(`
                SELECT Department, SafetyUnits, YearlyTarget
                  FROM KY_Program_Config
                 WHERE Year=? AND IsActive=1
            `, [year]),
            db.query(`
                SELECT Department, SafetyUnit, COUNT(*) AS actual
                  FROM KY_Activities
                 WHERE YEAR(ActivityDate)=?
                 GROUP BY Department, SafetyUnit
            `, [year]),
        ]);
        const activityMap = new Map();
        for (const row of activities) {
            const department = normalizeDepartmentKey(row.Department);
            const unit = normalizeUnitKey(row.SafetyUnit);
            activityMap.set(`${department}::${unit}`, Number(row.actual || 0));
        }

        let numerator = 0;
        let denominator = 0;
        for (const config of configs) {
            const department = normalizeDepartmentKey(config.Department);
            const units = dashboardList(config.SafetyUnits).map(normalizeUnitKey).filter(Boolean);
            const target = Math.max(0, Number(config.YearlyTarget || 0));
            if (!department || target <= 0) continue;
            if (units.length) {
                denominator += units.length * target;
                for (const unit of units) numerator += activityMap.get(`${department}::${unit}`) || 0;
            } else {
                denominator += target;
                for (const [scope, actual] of activityMap) {
                    if (scope.startsWith(`${department}::`)) numerator += actual;
                }
            }
        }
        return { available: true, numerator, denominator, configuredScopes: configs.length };
    } catch (error) {
        return { available: false, numerator: 0, denominator: 0, configuredScopes: 0, error: error.message };
    }
}

async function buildYokotenCompanyProgress(year) {
    try {
        const [[departments], [topics], [responses], [masterUnits]] = await Promise.all([
            db.query('SELECT Name FROM Master_Departments ORDER BY Name'),
            db.query(`
                SELECT YokotenID, TargetDepts, TargetUnits
                  FROM YokotenTopics
                 WHERE IsActive=1 AND (DateIssued IS NULL OR YEAR(DateIssued)=?)
            `, [year]),
            db.query(`
                SELECT r.YokotenID, r.Department,
                       COALESCE(NULLIF(r.SafetyUnit, ''), NULLIF(e.Unit, ''), NULLIF(e.Team, '')) AS EffectiveSafetyUnit
                  FROM YokotenResponses r
                  LEFT JOIN Employees e ON e.EmployeeID=r.EmployeeID
                 WHERE r.IsDeleted IS NULL OR r.IsDeleted=0
            `),
            db.query(`
                SELECT u.name, u.short_code, d.Name AS department
                  FROM Master_SafetyUnits u
                  LEFT JOIN Master_Departments d ON d.id=u.department_id
            `),
        ]);
        const departmentMap = new Map();
        for (const row of departments) {
            const key = normalizeDepartmentKey(row.Name);
            if (key) departmentMap.set(key, String(row.Name).trim());
        }

        const assignedPairs = new Set();
        const topicMap = new Map();
        const topicIds = new Set();
        const unknownDepartments = new Set();
        for (const topic of topics) {
            const topicId = String(topic.YokotenID);
            topicIds.add(topicId);
            topicMap.set(topicId, topic);
            const configured = dashboardList(topic.TargetDepts);
            const targets = configured.length ? configured.map(normalizeDepartmentKey) : [...departmentMap.keys()];
            for (const department of targets) {
                if (!departmentMap.has(department)) {
                    unknownDepartments.add(department);
                    continue;
                }
                assignedPairs.add(`${department}::${topicId}`);
            }
        }
        if (unknownDepartments.size) {
            return {
                available: false,
                numerator: 0,
                denominator: 0,
                topics: topics.length,
                respondedDepartments: 0,
                unknownDepartments: [...unknownDepartments],
                error: 'One or more Yokoten target Departments do not resolve to Master_Departments.',
            };
        }

        const respondedPairs = new Set();
        const respondedDepartments = new Set();
        for (const response of responses) {
            const topicId = String(response.YokotenID);
            if (!topicIds.has(topicId)) continue;
            const department = normalizeDepartmentKey(response.Department);
            const pair = `${department}::${topicId}`;
            if (!assignedPairs.has(pair)) continue;
            const topic = topicMap.get(topicId);
            const coverage = buildUnitCoverage({
                department: departmentMap.get(department) || response.Department,
                topicUnits: dashboardList(topic?.TargetUnits),
                responseUnits: dashboardList(response.EffectiveSafetyUnit),
                responseExists: true,
                masterUnits,
            });
            if (!coverage.complete) continue;
            respondedPairs.add(pair);
            respondedDepartments.add(department);
        }
        return {
            available: true,
            numerator: respondedPairs.size,
            denominator: assignedPairs.size,
            topics: topics.length,
            respondedDepartments: respondedDepartments.size,
            unknownDepartments: [],
        };
    } catch (error) {
        return {
            available: false,
            numerator: 0,
            denominator: 0,
            topics: 0,
            respondedDepartments: 0,
            unknownDepartments: [],
            error: error.message,
        };
    }
}

async function buildYokotenOverdueAlerts() {
    try {
        const [[departments], [topics], [responses], [masterUnits]] = await Promise.all([
            db.query('SELECT Name FROM Master_Departments ORDER BY Name'),
            db.query(`SELECT YokotenID,Title,Deadline,TargetDepts,TargetUnits
                        FROM YokotenTopics
                       WHERE Deadline IS NOT NULL AND Deadline<CURDATE() AND IsActive=1
                       ORDER BY Deadline ASC`),
            db.query(`SELECT r.YokotenID,r.Department,
                             COALESCE(NULLIF(r.SafetyUnit,''),NULLIF(e.Unit,''),NULLIF(e.Team,'')) EffectiveSafetyUnit
                        FROM YokotenResponses r
                        LEFT JOIN Employees e ON e.EmployeeID=r.EmployeeID
                       WHERE r.IsDeleted IS NULL OR r.IsDeleted=0`),
            db.query(`SELECT u.name,u.short_code,d.Name department
                        FROM Master_SafetyUnits u
                        LEFT JOIN Master_Departments d ON d.id=u.department_id`),
        ]);
        const departmentNames = departments.map(row => String(row.Name || '').trim()).filter(Boolean);
        const responseMap = new Map(responses.map(row => [
            `${normalizeDepartmentKey(row.Department)}::${String(row.YokotenID)}`,
            row,
        ]));
        return topics.map(topic => {
            const configured = dashboardList(topic.TargetDepts);
            const targets = configured.length ? configured.filter(dept => departmentNames.includes(dept)) : departmentNames;
            const respondedCount = targets.filter(dept => {
                const response = responseMap.get(`${normalizeDepartmentKey(dept)}::${String(topic.YokotenID)}`) || null;
                return buildUnitCoverage({
                    department: dept,
                    topicUnits: dashboardList(topic.TargetUnits),
                    responseUnits: dashboardList(response?.EffectiveSafetyUnit),
                    responseExists: !!response,
                    masterUnits,
                }).complete;
            }).length;
            return { ...topic, respondedCount, targetDeptCount: targets.length };
        }).filter(topic => topic.respondedCount < topic.targetDeptCount).slice(0, 10);
    } catch (_) {
        return [];
    }
}

// ─── GET /api/dashboard/overview ─────────────────────────────────────────────
router.get('/config', async (_req, res) => {
    const config = await getDashboardConfig();
    res.json({ success: true, data: config });
});

router.put('/config', isAdmin, async (req, res) => {
    try {
        await ensureConfigTable();
        const config = sanitizeConfig(req.body);
        await db.query(
            `INSERT INTO Dashboard_Config (ConfigKey, ConfigValue, UpdatedBy)
             VALUES ('enterprise', ?, ?)
             ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue), UpdatedBy=VALUES(UpdatedBy)`,
            [JSON.stringify(config), req.user?.name || req.user?.id || 'Admin']
        );
        res.json({ success: true, data: config, message: 'อัปเดต Dashboard config สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// โ”€โ”€โ”€ GET /api/dashboard/overview โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
router.get('/overview', async (_req, res) => {
    const year = new Date().getFullYear();
    try {
        const config = await getDashboardConfig();
        const [
            // Patrol
            patrolSessions, patrolAttended, patrolOpenIssues,
            // CCCF
            cccfWorkerYear, cccfAssigned, cccfCompleted,
            // Yokoten
            yokotenTopics, yokotenResponded,
            // Training
            trTotalEmp, trTotalPassed,
            // Hiyari
            hiyariOpen, hiyariYear, hiyariClosed,
            // KY
            kyYear,
            // Accident
            accYear, accRecordable,
            // Safety Culture
            scYear,
            // 4M Change
            fourmTotal, fourmOpen, fourmPending, fourmClosed, fourmOverdue, fourmTrainingRequired,
            fourmMatrixCurriculums, fourmMatrixCourses, fourmMatrixEmployees, fourmMatrixTransferred,
            // Enterprise modules not previously shown as cards
            kpiMetrics, kpiAnnouncements,
            policyTotal, policyAcked, policyEligible,
            committeeTotal,
            machineTotal, machineOpenIssues, machineCritical,
            ojtRecords, ojtDocs,
            contractorDocs, contractorRecent,
            // Canonical same-unit progress states
            patrolProgress, hiyariProgress, kyProgress, yokotenProgress,
            machineComplianceState, ojtProgressState, safetyCultureProgressState,
        ] = await Promise.all([
            // Patrol: unique sessions with at least 1 attendee this year
            safe(`SELECT COUNT(DISTINCT DATE(PatrolDate)) AS cnt FROM Patrol_Attendance WHERE YEAR(PatrolDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM Patrol_Attendance WHERE YEAR(PatrolDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM Patrol_Issues
                  WHERE YEAR(DateFound)=? AND CurrentStatus NOT IN ('Closed')`, [year]),

            // CCCF
            safe(`SELECT COUNT(*) AS cnt FROM CCCF_FormA_Worker WHERE YEAR(SubmitDate)=?`, [year]),
            safe(`SELECT COUNT(DISTINCT a.EmployeeID) AS cnt
                    FROM CCCF_Assignments a
                    JOIN Employees e ON e.EmployeeID=a.EmployeeID
                   WHERE a.EmployeeID IS NOT NULL AND TRIM(a.EmployeeID)<>''`),
            safe(`SELECT COUNT(DISTINCT fa.AssigneeID) AS cnt FROM CCCF_FormA_Permanent fa
                  JOIN CCCF_Assignments ca ON fa.AssigneeID = ca.EmployeeID
                  JOIN Employees e ON e.EmployeeID = ca.EmployeeID
                  WHERE YEAR(fa.SubmitDate)=?
                    AND (fa.ReviewStatus = 'Completed' OR (fa.ReviewStatus IS NULL AND fa.FileUrl IS NOT NULL))`, [year]),

            // Yokoten
            safe(`SELECT COUNT(*) AS cnt FROM YokotenTopics
                  WHERE IsActive=1 AND (DateIssued IS NULL OR YEAR(DateIssued)=?)`, [year]),
            safe(`SELECT COUNT(DISTINCT r.Department) AS cnt
                    FROM YokotenResponses r
                    JOIN YokotenTopics t ON t.YokotenID=r.YokotenID
                   WHERE (r.IsDeleted IS NULL OR r.IsDeleted=0)
                     AND t.IsActive=1
                     AND (t.DateIssued IS NULL OR YEAR(t.DateIssued)=?)`, [year]),

            // Training
            safe(`SELECT COALESCE(SUM(TotalEmp),0) AS cnt FROM Training_Dept_Records WHERE Year=?`, [year]),
            safe(`SELECT COALESCE(SUM(LEAST(GREATEST(COALESCE(PassedCount,0),0), GREATEST(COALESCE(TotalEmp,0),0))),0) AS cnt
                    FROM Training_Dept_Records WHERE Year=?`, [year]),

            // Hiyari
            safe(`SELECT COUNT(*) AS cnt FROM HiyariReports
                  WHERE YEAR(ReportDate)=? AND DeletedAt IS NULL
                    AND Status NOT IN ('Closed','closed')`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM HiyariReports
                  WHERE YEAR(ReportDate)=? AND DeletedAt IS NULL`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM HiyariReports
                  WHERE YEAR(ReportDate)=? AND DeletedAt IS NULL
                    AND Status IN ('Closed','closed')`, [year]),

            // KY
            safe(`SELECT COUNT(*) AS cnt FROM KY_Activities WHERE YEAR(ActivityDate)=?`, [year]),

            // Accident
            safe(`SELECT COUNT(*) AS cnt FROM Accident_Reports
                  WHERE YEAR(AccidentDate)=? AND (IsDeleted IS NULL OR IsDeleted=0)`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM Accident_Reports
                  WHERE YEAR(AccidentDate)=? AND IsRecordable=1
                    AND (IsDeleted IS NULL OR IsDeleted=0)`, [year]),

            // Safety Culture
            safe(`SELECT COUNT(*) AS cnt FROM SC_Assessments WHERE AssessmentYear=?`, [year]),

            // 4M Change
            safe(`SELECT COUNT(*) AS cnt FROM FourM_ChangeNotices WHERE YEAR(RequestDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM FourM_ChangeNotices WHERE Status='Open' AND YEAR(RequestDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM FourM_ChangeNotices WHERE Status='Pending' AND YEAR(RequestDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM FourM_ChangeNotices WHERE Status='Closed' AND YEAR(RequestDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM FourM_ChangeNotices
                  WHERE Status IN ('Open','Pending') AND DATEDIFF(CURDATE(), RequestDate) > 30 AND YEAR(RequestDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM FourM_ChangeNotices
                  WHERE TrainingRequired = 1 AND YEAR(RequestDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM FourM_Curriculums WHERE IsActive = 1 AND Year = ?`, [year]),
            safe(`SELECT COUNT(*) AS cnt
                  FROM FourM_Courses co
                  JOIN FourM_Curriculums cur ON cur.id = co.CurriculumID
                  WHERE co.IsActive = 1 AND cur.IsActive = 1 AND cur.Year = ?`, [year]),
            safe(`SELECT COUNT(DISTINCT ce.EmployeeID) AS cnt
                  FROM FourM_CurriculumEmployees ce
                  JOIN FourM_Curriculums cur ON cur.id = ce.CurriculumID
                  WHERE ce.Status = 'Assigned' AND cur.IsActive = 1 AND cur.Year = ?`, [year]),
            safe(`SELECT COUNT(*) AS cnt
                  FROM FourM_CurriculumEmployees ce
                  JOIN FourM_Curriculums cur ON cur.id = ce.CurriculumID
                  WHERE ce.Status = 'Transferred' AND cur.Year = ?`, [year]),

            // KPI
            safe(`SELECT COUNT(*) AS cnt FROM KPIData WHERE Year=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM KPIAnnouncements WHERE IsCurrent=1`),

            // Policy
            safe(`SELECT COUNT(*) AS cnt FROM Policies WHERE IsCurrent=1`),
            safe(`SELECT COUNT(DISTINCT pa.UserID) AS cnt FROM Policy_Acknowledgements pa
                  JOIN Policies p ON p.id = pa.PolicyID
                  WHERE p.IsCurrent = 1`),
            safe(`SELECT COUNT(*) AS cnt FROM Employees`),

            // Committee
            safe(`SELECT COUNT(*) AS cnt FROM Committees WHERE IsCurrent=1`),

            // Machine Safety
            safe(`SELECT COUNT(*) AS cnt FROM Machine_Safety WHERE Status IS NULL OR Status <> 'inactive'`),
            safe(`SELECT COUNT(*) AS cnt
                    FROM Machine_Safety_Issues i
                    JOIN Machine_Safety m ON m.id=i.MachineID
                   WHERE i.Status='open' AND (m.Status IS NULL OR m.Status<>'inactive')`),
            safe(`SELECT COUNT(*) AS cnt FROM Machine_Safety WHERE RiskLevel IN ('high','critical') AND (Status IS NULL OR Status <> 'inactive')`),

            // OJT / SCW
            safe(`SELECT COUNT(*) AS cnt FROM OJT_Records WHERE YEAR(OJTDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM SCW_Documents WHERE YEAR(UploadedAt)=?`, [year]),

            // Contractor
            safe(`SELECT COUNT(*) AS cnt FROM Contractor_Documents`),
            safe(`SELECT COUNT(*) AS cnt FROM Contractor_Documents WHERE UploadedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`),

            buildPatrolCompanyProgress(year),
            buildHiyariCompanyProgress(year),
            buildKyCompanyProgress(year),
            buildYokotenCompanyProgress(year),
            dashboardRowState(`
                SELECT COALESCE(SUM(c.Status='pass'),0) AS numerator,
                       COALESCE(SUM(c.Status<>'na'),0) AS denominator
                  FROM Machine_Safety m
                  JOIN Machine_Safety_Compliance c ON c.MachineID=m.id
                 WHERE m.Status IS NULL OR m.Status<>'inactive'
            `),
            dashboardRowState(`
                SELECT COALESCE(SUM(LEAST(GREATEST(COALESCE(AttendeeCount,0),0),
                                              GREATEST(COALESCE(YearlyTarget,0),0))),0) AS numerator,
                       COALESCE(SUM(GREATEST(COALESCE(YearlyTarget,0),0)),0) AS denominator,
                       COUNT(*) AS records,
                       COALESCE(SUM(NextReviewDate IS NOT NULL AND NextReviewDate<CURDATE()),0) AS overdue
                  FROM OJT_Records
                 WHERE YEAR(OJTDate)=?
            `, [year]),
            dashboardRowState(`
                SELECT COUNT(*) AS assessments,
                       COALESCE(SUM(COALESCE(T1_Score,0)+COALESCE(T2_Score,0)+
                                    COALESCE(T3_Score,0)+COALESCE(T4_Score,0)+
                                    COALESCE(T5_Score,0)+COALESCE(T7_Score,0)),0) AS numerator,
                       COALESCE(SUM((T1_Score IS NOT NULL)+(T2_Score IS NOT NULL)+
                                    (T3_Score IS NOT NULL)+(T4_Score IS NOT NULL)+
                                    (T5_Score IS NOT NULL)+(T7_Score IS NOT NULL)),0) * 100 AS denominator,
                       (SELECT AVG(CompliancePct) FROM SC_PPEInspections
                         WHERE YEAR(InspectionDate)=? AND deleted_at IS NULL) AS ppePct
                  FROM SC_Assessments
                 WHERE AssessmentYear=?
            `, [year, year]),
        ]);

        const cccfWorkerOverview = await getCccfWorkerProgress(db, year, { ensureSchema: false }).catch(() => ({ overall: {} }));
        const cccfWorkerActualTowardTarget = Number(cccfWorkerOverview.overall?.actualTowardTarget || cccfWorkerYear || 0);
        const cccfWorkerRawRecords = Number(cccfWorkerOverview.overall?.rawRecords || cccfWorkerYear || 0);

        const asOf = new Date().toISOString();
        const scope = { year };
        const fourmActive = (parseInt(fourmOpen, 10) || 0) + (parseInt(fourmPending, 10) || 0);
        const machineNumerator = Number(machineComplianceState.row.numerator || 0);
        const machineDenominator = Number(machineComplianceState.row.denominator || 0);
        const ojtNumerator = Number(ojtProgressState.row.numerator || 0);
        const ojtDenominator = Number(ojtProgressState.row.denominator || 0);
        const ojtOverdue = Number(ojtProgressState.row.overdue || 0);
        const safetyCultureNumerator = Number(safetyCultureProgressState.row.numerator || 0);
        const safetyCultureDenominator = Number(safetyCultureProgressState.row.denominator || 0);
        const safetyCulturePpePct = safetyCultureProgressState.row.ppePct == null
            ? null
            : Number(safetyCultureProgressState.row.ppePct);

        const moduleMetrics = {
            patrol: createDashboardMetric('patrol', {
                numerator: patrolProgress.numerator,
                denominator: patrolProgress.denominator,
                unit: 'attendance_slots',
                scope: { ...scope, window: 'year_to_date', elapsedMonths: patrolProgress.elapsedMonths },
                dataAvailable: patrolProgress.available,
                unavailableReason: patrolProgress.error,
                sourceDescription: 'Completed eligible attendance slots / roster attendance slots due year-to-date.',
                asOf,
            }),
            hiyari: createDashboardMetric('hiyari', {
                numerator: hiyariProgress.numerator,
                denominator: hiyariProgress.denominator,
                unit: 'employees',
                scope,
                dataAvailable: hiyariProgress.available,
                unavailableReason: hiyariProgress.error,
                sourceDescription: 'Distinct assigned employees with a closed current-year report / current Admin Hiyari assignments.',
                asOf,
            }),
            ky: createDashboardMetric('ky', {
                numerator: kyProgress.numerator,
                denominator: kyProgress.denominator,
                unit: 'activities',
                scope: { ...scope, configuredScopes: kyProgress.configuredScopes },
                dataAvailable: kyProgress.available,
                unavailableReason: kyProgress.error,
                sourceDescription: 'Eligible activities in configured Department and Safety Unit scopes / active configured yearly targets.',
                asOf,
            }),
            cccf: createDashboardMetric('cccf', {
                numerator: cccfCompleted,
                denominator: cccfAssigned,
                unit: 'employees',
                scope,
                dataAvailable: cccfCompleted !== null && cccfAssigned !== null,
                sourceDescription: 'Distinct valid current-year permanent Form A completions / distinct current employee assignments.',
                asOf,
            }),
            yokoten: createDashboardMetric('yokoten', {
                numerator: yokotenProgress.numerator,
                denominator: yokotenProgress.denominator,
                unit: 'department_topic_pairs',
                scope: { ...scope, topics: yokotenProgress.topics },
                dataAvailable: yokotenProgress.available,
                unavailableReason: yokotenProgress.error,
                sourceDescription: 'Valid Department-topic response pairs / assigned Department-topic pairs for active topics issued in the year.',
                asOf,
            }),
            training: createDashboardMetric('training', {
                numerator: trTotalPassed,
                denominator: trTotalEmp,
                unit: 'employees',
                scope,
                dataAvailable: trTotalPassed !== null && trTotalEmp !== null,
                sourceDescription: 'Capped passed employee count / total employee count in current-year training records.',
                asOf,
            }),
            accident: createDashboardMetric('accident', {
                numerator: accRecordable,
                value: accRecordable,
                unit: 'recordable_incidents',
                scope,
                dataAvailable: accRecordable !== null,
                status: Number(accRecordable || 0) === 0 ? 'ON_TRACK' : 'CRITICAL',
                statusReason: Number(accRecordable || 0) === 0
                    ? 'No recordable incidents in the current year.'
                    : `${accRecordable} recordable incident(s) in the current year.`,
                sourceDescription: 'Count of non-deleted recordable accident reports in the current year.',
                asOf,
            }),
            fourm: createDashboardMetric('fourm', {
                numerator: fourmClosed,
                denominator: fourmTotal,
                unit: 'change_notices',
                scope,
                dataAvailable: fourmClosed !== null && fourmTotal !== null,
                sourceDescription: 'Closed change notices / all change notices requested in the current year.',
                asOf,
            }),
            kpi: createDashboardMetric('kpi', {
                numerator: kpiMetrics,
                value: kpiMetrics,
                unit: 'metrics',
                scope,
                dataAvailable: kpiMetrics !== null,
                sourceDescription: 'Count of KPI metric rows configured for the current year.',
                asOf,
            }),
            policy: createDashboardMetric('policy', {
                numerator: policyAcked,
                denominator: Number(policyTotal || 0) > 0 ? policyEligible : 0,
                unit: 'employees',
                scope: { ...scope, currentPolicies: Number(policyTotal || 0) },
                dataAvailable: policyTotal !== null && policyAcked !== null && policyEligible !== null,
                zeroDenominatorReason: Number(policyTotal || 0) > 0
                    ? 'No eligible employees are present.'
                    : 'No current safety policy is configured.',
                sourceDescription: 'Distinct employees acknowledging the current policy / all employees eligible to acknowledge it.',
                asOf,
            }),
            committee: createDashboardMetric('committee', {
                numerator: committeeTotal,
                value: committeeTotal,
                unit: 'committees',
                scope,
                dataAvailable: committeeTotal !== null,
                sourceDescription: 'Count of current committee records.',
                asOf,
            }),
            'machine-safety': createDashboardMetric('machine-safety', {
                numerator: machineNumerator,
                denominator: machineDenominator,
                unit: 'compliance_items',
                scope,
                dataAvailable: machineComplianceState.available,
                unavailableReason: machineComplianceState.error,
                sourceDescription: 'Passed applicable compliance items / checked applicable compliance items on active machines.',
                asOf,
            }),
            ojt: createDashboardMetric('ojt', {
                numerator: ojtNumerator,
                denominator: ojtDenominator,
                unit: 'attendees',
                scope,
                dataAvailable: ojtProgressState.available,
                unavailableReason: ojtProgressState.error,
                sourceDescription: 'Capped attendee counts / configured yearly attendee targets in current-year OJT records.',
                asOf,
            }),
            contractor: createDashboardMetric('contractor', {
                numerator: contractorDocs,
                value: contractorDocs,
                unit: 'documents',
                scope,
                dataAvailable: contractorDocs !== null,
                sourceDescription: 'Count of contractor and supplier documents.',
                asOf,
            }),
            'safety-culture': createDashboardMetric('safety-culture', {
                numerator: safetyCultureNumerator,
                denominator: safetyCultureDenominator,
                unit: 'assessment_score_points',
                scope: { ...scope, ppeCompliancePercent: safetyCulturePpePct },
                dataAvailable: safetyCultureProgressState.available,
                unavailableReason: safetyCultureProgressState.error,
                sourceDescription: 'Sum of entered safety-culture topic scores / maximum points for those entered topics.',
                asOf,
            }),
        };

        const patrolRate = moduleMetrics.patrol.percent;
        const cccfPermPct = moduleMetrics.cccf.percent;
        const yokotenPct = moduleMetrics.yokoten.percent;
        const trainingPassRate = moduleMetrics.training.percent;
        const fourmClosureRate = moduleMetrics.fourm.percent;
        const healthIndex = buildHealthIndex({
            patrolRate, cccfPermPct, yokotenPct, trainingPassRate,
            accRecordable, hiyariOpen, fourmOpen: fourmActive, patrolOpenIssues,
        }, config);
        const complianceMatrix = await buildComplianceMatrix(year, config);

        res.json({
            success: true,
            data: {
                year,
                config,
                moduleMetrics,
                healthIndex,
                complianceMatrix,
                patrol:       {
                    sessions: patrolSessions,
                    attended: patrolAttended,
                    required: moduleMetrics.patrol.denominator,
                    completed: moduleMetrics.patrol.numerator,
                    openIssues: patrolOpenIssues,
                    rate: patrolRate,
                },
                cccf:         { workerYear: cccfWorkerActualTowardTarget, workerRawRecords: cccfWorkerRawRecords, workerCalculation: 'cccf_worker_progress_engine_actual_toward_target', assigned: cccfAssigned, completed: cccfCompleted, permPct: cccfPermPct },
                yokoten:      {
                    topics: yokotenTopics,
                    responded: yokotenResponded,
                    respondedPairs: moduleMetrics.yokoten.numerator,
                    assignedPairs: moduleMetrics.yokoten.denominator,
                    pct: yokotenPct,
                },
                training:     { totalEmp: trTotalEmp, passed: trTotalPassed, passRate: trainingPassRate },
                hiyari: {
                    open: hiyariOpen,
                    year: hiyariYear,
                    closed: hiyariClosed,
                    assignmentTarget: moduleMetrics.hiyari.denominator,
                    assignmentClosed: moduleMetrics.hiyari.numerator,
                    assignmentRemaining: Math.max(
                        0,
                        Number(moduleMetrics.hiyari.denominator || 0) - Number(moduleMetrics.hiyari.numerator || 0)
                    ),
                    closureRate: moduleMetrics.hiyari.percent,
                },
                ky:           { year: kyYear, target: moduleMetrics.ky.denominator, pct: moduleMetrics.ky.percent },
                accident:     { year: accYear, recordable: accRecordable, metricStatus: moduleMetrics.accident.status },
                safetyCulture:{
                    year: scYear,
                    pct: moduleMetrics['safety-culture'].percent,
                    ppePct: safetyCulturePpePct,
                },
                fourm:        {
                    total: fourmTotal,
                    open: fourmOpen,
                    pending: fourmPending,
                    closed: fourmClosed,
                    active: fourmActive,
                    overdue: fourmOverdue,
                    trainingRequired: fourmTrainingRequired,
                    closureRate: fourmClosureRate,
                    matrix: {
                        curriculums: fourmMatrixCurriculums,
                        courses: fourmMatrixCourses,
                        employees: fourmMatrixEmployees,
                        transferred: fourmMatrixTransferred,
                    },
                },
                kpi:          { metrics: kpiMetrics, announcements: kpiAnnouncements },
                policy:       { total: policyTotal, acknowledged: policyAcked, eligible: policyEligible, pct: moduleMetrics.policy.percent },
                committee:    { total: committeeTotal },
                machineSafety:{
                    total: machineTotal,
                    openIssues: machineOpenIssues,
                    critical: machineCritical,
                    passed: machineNumerator,
                    applicable: machineDenominator,
                    pct: moduleMetrics['machine-safety'].percent,
                },
                ojt:          {
                    records: ojtRecords,
                    docs: ojtDocs,
                    completed: ojtNumerator,
                    target: ojtDenominator,
                    overdue: ojtOverdue,
                    pct: moduleMetrics.ojt.percent,
                },
                contractor:   { docs: contractorDocs, recent: contractorRecent },
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/dashboard/alerts ───────────────────────────────────────────────
// Returns overdue items across modules for the alert widget on the home page.
router.get('/alerts', async (_req, res) => {
    try {
        const config = await getDashboardConfig();
        const dueSoonDays = config.alertDueSoonDays || DEFAULT_CONFIG.alertDueSoonDays;
        const [
            overdueAccident,
            dueSoonAccident,
            machineOverdue,
            yokotenOverdue,
            openPatrolIssues,
            fourmOverdue,
            fourmTrainingRequired,
        ] = await Promise.all([
            // Accident corrective actions past due date, not yet closed
            db.query(
                `SELECT id, AccidentDate, AccidentType, Department, DueDate
                 FROM Accident_Reports
                 WHERE DueDate IS NOT NULL AND DueDate < CURDATE()
                   AND Status != 'Closed' AND (IsDeleted IS NULL OR IsDeleted = 0)
                 ORDER BY DueDate ASC LIMIT 10`
            ).then(([r]) => r).catch(() => []),

            // Accident corrective actions due soon, not yet closed
            db.query(
                `SELECT id, AccidentDate, AccidentType, Department, DueDate
                 FROM Accident_Reports
                 WHERE DueDate IS NOT NULL
                   AND DueDate >= CURDATE()
                   AND DueDate <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
                   AND Status != 'Closed' AND (IsDeleted IS NULL OR IsDeleted = 0)
                 ORDER BY DueDate ASC LIMIT 10`,
                [dueSoonDays]
            ).then(([r]) => r).catch(() => []),

            // Machines with overdue inspection date
            db.query(
                `SELECT MachineID, MachineName, Department, NextInspectionDate
                 FROM Machine_Safety
                 WHERE NextInspectionDate IS NOT NULL AND NextInspectionDate < CURDATE()
                   AND (Status IS NULL OR Status NOT IN ('inactive'))
                 ORDER BY NextInspectionDate ASC LIMIT 10`
            ).then(([r]) => r).catch(() => []),

            // Yokoten topics past deadline still active
            buildYokotenOverdueAlerts(),

            // Open patrol issues (all time)
            db.query(
                `SELECT id, DateFound, Area, HazardType, ResponsibleDept, \`Rank\`
                 FROM Patrol_Issues WHERE CurrentStatus NOT IN ('Closed')
                 ORDER BY DateFound ASC LIMIT 10`
            ).then(([r]) => r).catch(() => []),

            // 4M notices open/pending longer than the standard SLA
            db.query(
                `SELECT id, NoticeNo, Title, ResponsiblePerson, Department, RequestDate, Status
                 FROM FourM_ChangeNotices
                 WHERE Status IN ('Open','Pending') AND DATEDIFF(CURDATE(), RequestDate) > 30
                 ORDER BY RequestDate ASC LIMIT 10`
            ).then(([r]) => r).catch(() => []),

            // 4M notices that require training follow-up
            db.query(
                `SELECT id, NoticeNo, Title, ResponsiblePerson, Department, RequestDate, Status
                 FROM FourM_ChangeNotices
                 WHERE TrainingRequired = 1 AND Status IN ('Open','Pending')
                 ORDER BY RequestDate ASC LIMIT 10`
            ).then(([r]) => r).catch(() => []),
        ]);

        res.json({
            success: true,
            data: { overdueAccident, dueSoonAccident, machineOverdue, yokotenOverdue, openPatrolIssues, fourmOverdue, fourmTrainingRequired, dueSoonDays }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
module.exports.buildComplianceMatrix = buildComplianceMatrix;
module.exports.resolveCccfWorkerSource = resolveCccfWorkerSource;
module.exports.buildHiyariAssignmentCoverage = buildHiyariAssignmentCoverage;
module.exports.dashboardMetricBuilders = {
    buildPatrolCompanyProgress,
    buildHiyariCompanyProgress,
    buildKyCompanyProgress,
    buildYokotenCompanyProgress,
    dashboardRowState,
};
