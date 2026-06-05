// backend/routes/dashboard.js
// Cross-module KPI overview — accessible to all authenticated users.
// Mounted at /api/dashboard (authenticateToken only, no isAdmin).
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');
const { getCoverageMatrix } = require('./activity-targets');

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

    return {
        healthGreen: clamp(body.healthGreen, DEFAULT_CONFIG.healthGreen, 1, 100),
        healthAmber: clamp(body.healthAmber, DEFAULT_CONFIG.healthAmber, 1, 100),
        alertDueSoonDays: clamp(body.alertDueSoonDays, DEFAULT_CONFIG.alertDueSoonDays, 1, 60),
        hiddenModules: toStringArray(body.hiddenModules),
        pinnedDepartments: toStringArray(body.pinnedDepartments),
    };
}

function pct(n, d) {
    const numerator = parseFloat(n) || 0;
    const denominator = parseFloat(d) || 0;
    if (!denominator) return null;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
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
    const deptRows = await safeRows(`SELECT Name FROM Master_Departments ORDER BY Name ASC`);
    const allDeptNames = deptRows.map(r => r.Name).filter(Boolean);
    const deptNames = config.pinnedDepartments?.length
        ? config.pinnedDepartments.filter(d => allDeptNames.includes(d))
        : allDeptNames.slice(0, 12);

    if (!deptNames.length) return [];
    const params = [year];

    const [
        employeeRows,
        trainingRows,
        kyConfigRows,
        kyRows,
        hiyariRows,
        fourmRows,
        yokotenTopicRows,
        yokotenResponseRows,
        patrolIssueRows,
        cccfWorkerRows,
        cccfAssignmentRows,
        cccfPermanentRows,
        accidentRows,
        machineRows,
        ojtRows,
        safetyCultureRows,
    ] = await Promise.all([
        safeRows(`
            SELECT Department, COUNT(DISTINCT EmployeeID) AS total
            FROM Employees
            WHERE Department IS NOT NULL AND Department <> ''
            GROUP BY Department
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
            SELECT Department,
                   COUNT(*) AS total,
                   COALESCE(SUM(Status IN ('Closed','closed')), 0) AS closed
            FROM HiyariReports
            WHERE YEAR(ReportDate)=?
            GROUP BY Department
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
            SELECT YokotenID, TargetDepts
            FROM YokotenTopics
            WHERE IsActive = 1
        `),
        safeRows(`
            SELECT YokotenID, Department, COUNT(*) AS cnt
            FROM YokotenResponses
            WHERE YEAR(ResponseDate)=? AND (IsDeleted IS NULL OR IsDeleted = 0)
            GROUP BY YokotenID, Department
        `, params),
        safeRows(`
            SELECT ResponsibleDept AS Department,
                   COUNT(*) AS total,
                   COALESCE(SUM(CurrentStatus = 'Closed'), 0) AS closed
            FROM Patrol_Issues
            WHERE YEAR(DateFound)=?
            GROUP BY ResponsibleDept
        `, params),
        safeRows(`
            SELECT Department, COUNT(DISTINCT NULLIF(EmployeeID, '')) AS submitted
            FROM CCCF_FormA_Worker
            WHERE YEAR(SubmitDate)=?
            GROUP BY Department
        `, params),
        safeRows(`
            SELECT COALESCE(e.Department, a.Department) AS Department,
                   COUNT(DISTINCT COALESCE(NULLIF(a.EmployeeID, ''), a.id)) AS assigned
            FROM CCCF_Assignments a
            LEFT JOIN Employees e ON e.EmployeeID = a.EmployeeID
            GROUP BY COALESCE(e.Department, a.Department)
        `),
        safeRows(`
            SELECT Department,
                   COUNT(DISTINCT COALESCE(NULLIF(AssigneeID, ''), id)) AS completed
            FROM CCCF_FormA_Permanent
            WHERE YEAR(SubmitDate)=?
            GROUP BY Department
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
            SELECT Department, OJTDate, NextReviewDate, AttendeeCount, YearlyTarget
            FROM OJT_Records
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
        for (const r of rows) m.set(String(r.Department || '').trim(), valueFn(r));
        return m;
    };
    const parseJsonArray = (value) => {
        if (!value) return [];
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.map(v => String(v || '').trim()).filter(Boolean) : [];
        } catch (_) {
            return String(value).split(',').map(v => v.trim()).filter(Boolean);
        }
    };
    const employeeCount = byDept(employeeRows, r => parseInt(r.total, 10) || 0);
    const training = byDept(trainingRows, r => pct(r.passed, r.total));
    const kyActual = byDept(kyRows, r => parseInt(r.cnt, 10) || 0);
    const kyTargets = new Map();
    for (const r of kyConfigRows) {
        const dept = String(r.Department || '').trim();
        if (!dept) continue;
        const units = parseJsonArray(r.SafetyUnits);
        const unitCount = Math.max(1, units.length);
        const yearlyTarget = parseInt(r.YearlyTarget, 10) || 12;
        kyTargets.set(dept, unitCount * yearlyTarget);
    }
    const hiyari = byDept(hiyariRows, r => {
        const total = parseInt(r.total, 10) || 0;
        return total ? pct(r.closed, total) : 100;
    });
    const fourm = byDept(fourmRows, r => pct(r.closed, r.total));
    const yokotenTargets = new Map();
    for (const topic of yokotenTopicRows) {
        const targets = parseJsonArray(topic.TargetDepts);
        const scoped = targets.length ? targets.filter(d => deptNames.includes(d)) : deptNames;
        for (const dept of scoped) yokotenTargets.set(dept, (yokotenTargets.get(dept) || 0) + 1);
    }
    const yokotenDone = new Map();
    for (const row of yokotenResponseRows) {
        const dept = String(row.Department || '').trim();
        if (!dept) continue;
        yokotenDone.set(dept, (yokotenDone.get(dept) || 0) + (parseInt(row.cnt, 10) || 0));
    }
    const patrolIssues = byDept(patrolIssueRows, r => {
        const total = parseInt(r.total, 10) || 0;
        return total ? pct(r.closed, total) : 100;
    });
    const cccfWorker = byDept(cccfWorkerRows, r => parseInt(r.submitted, 10) || 0);
    const cccfAssigned = byDept(cccfAssignmentRows, r => parseInt(r.assigned, 10) || 0);
    const cccfPermanent = byDept(cccfPermanentRows, r => parseInt(r.completed, 10) || 0);
    const accident = byDept(accidentRows, r => {
        const total = parseInt(r.total, 10) || 0;
        return total ? pct(r.closed, total) : 100;
    });
    const machine = byDept(machineRows, r => {
        const machines = parseInt(r.machines, 10) || 0;
        if (!machines) return null;
        const checkedItems = parseInt(r.checkedItems, 10) || 0;
        const compliancePct = checkedItems ? pct(r.passItems, checkedItems) : 0;
        const issueTotal = parseInt(r.issueTotal, 10) || 0;
        const issuePct = issueTotal ? pct(r.issueClosed, issueTotal) : 100;
        return Math.round((compliancePct + issuePct) / 2);
    });
    const ojt = byDept(ojtRows, r => {
        if (!r.OJTDate) return 0;
        const target = parseInt(r.YearlyTarget, 10) || 0;
        const attendees = parseInt(r.AttendeeCount, 10) || 0;
        const coverage = target > 0 ? pct(attendees, target) : 100;
        const nextReview = r.NextReviewDate ? new Date(r.NextReviewDate) : null;
        const overdue = nextReview && !Number.isNaN(nextReview.getTime()) && nextReview < new Date();
        return overdue ? Math.min(coverage, 50) : coverage;
    });
    const safetyCulture = byDept(safetyCultureRows, r => {
        const v = parseFloat(r.pct);
        return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null;
    });
    const targetMatrix = await getCoverageMatrix().catch(() => ({ rows: [] }));
    const targetByDept = new Map();
    for (const row of targetMatrix.rows) {
        const dept = String(row.department || '').trim();
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
        const empTotal = employeeCount.get(dept) || 0;
        const kyTarget = kyTargets.get(dept) || 12;
        const yokotenTarget = yokotenTargets.get(dept) || 0;
        const cccfAssignedTotal = cccfAssigned.get(dept) || 0;
        const targetMeta = targetByDept.get(dept) || { slots: 0, covered: 0, missing: 0, zero: 0, na: 0, scope: 0, override: 0, template: 0 };
        const cells = {
            activityTargets: targetMeta.slots ? pct(targetMeta.covered + targetMeta.na, targetMeta.slots) : null,
            cccfWorker: empTotal ? pct(cccfWorker.get(dept) || 0, empTotal) : null,
            cccfPermanent: cccfAssignedTotal ? pct(cccfPermanent.get(dept) || 0, cccfAssignedTotal) : null,
            patrolIssues: patrolIssues.get(dept) ?? 100,
            hiyari: hiyari.get(dept) ?? 100,
            ky: pct(kyActual.get(dept) || 0, kyTarget),
            yokoten: yokotenTarget ? pct(yokotenDone.get(dept) || 0, yokotenTarget) : null,
            training: training.get(dept),
            fourm: fourm.get(dept),
            accident: accident.get(dept) ?? 100,
            machine: machine.get(dept),
            ojt: ojt.get(dept) ?? 0,
            safetyCulture: safetyCulture.get(dept),
        };
        const values = Object.values(cells).filter(v => v !== null && v !== undefined);
        const score = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;
        return { department: dept, score, targetMeta, ...cells };
    }).sort((a, b) => a.score - b.score || a.department.localeCompare(b.department, 'th'));
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
            hiyariOpen, hiyariYear,
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
            policyTotal, policyAcked,
            committeeTotal,
            machineTotal, machineOpenIssues, machineCritical,
            ojtRecords, ojtDocs,
            contractorDocs, contractorRecent,
        ] = await Promise.all([
            // Patrol: unique sessions with at least 1 attendee this year
            safe(`SELECT COUNT(DISTINCT DATE(PatrolDate)) AS cnt FROM Patrol_Attendance WHERE YEAR(PatrolDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM Patrol_Attendance WHERE YEAR(PatrolDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM Patrol_Issues WHERE CurrentStatus NOT IN ('Closed')`),

            // CCCF
            safe(`SELECT COUNT(*) AS cnt FROM CCCF_FormA_Worker WHERE YEAR(SubmitDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM CCCF_Assignments`),
            safe(`SELECT COUNT(DISTINCT fa.AssigneeID) AS cnt FROM CCCF_FormA_Permanent fa
                  JOIN CCCF_Assignments ca ON fa.AssigneeID = ca.EmployeeID WHERE YEAR(fa.SubmitDate)=?`, [year]),

            // Yokoten
            safe(`SELECT COUNT(*) AS cnt FROM YokotenTopics WHERE IsActive=1`),
            safe(`SELECT COUNT(DISTINCT Department) AS cnt FROM YokotenResponses WHERE YEAR(ResponseDate)=?`, [year]),

            // Training
            safe(`SELECT COALESCE(SUM(TotalEmp),0) AS cnt FROM Training_Dept_Records WHERE Year=?`, [year]),
            safe(`SELECT COALESCE(SUM(PassedCount),0) AS cnt FROM Training_Dept_Records WHERE Year=?`, [year]),

            // Hiyari
            safe(`SELECT COUNT(*) AS cnt FROM HiyariReports WHERE Status NOT IN ('Closed','closed')`),
            safe(`SELECT COUNT(*) AS cnt FROM HiyariReports WHERE YEAR(ReportDate)=?`, [year]),

            // KY
            safe(`SELECT COUNT(*) AS cnt FROM KY_Activities WHERE YEAR(ActivityDate)=?`, [year]),

            // Accident
            safe(`SELECT COUNT(*) AS cnt FROM Accident_Reports WHERE YEAR(AccidentDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM Accident_Reports WHERE YEAR(AccidentDate)=? AND IsRecordable=1`, [year]),

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
            safe(`SELECT COUNT(*) AS cnt FROM KPIAnnouncements`),

            // Policy
            safe(`SELECT COUNT(*) AS cnt FROM Policies`),
            safe(`SELECT COUNT(*) AS cnt FROM Policy_Acknowledgements pa
                  JOIN Policies p ON p.id = pa.PolicyID
                  WHERE p.IsCurrent = 1`),

            // Committee
            safe(`SELECT COUNT(*) AS cnt FROM Committees`),

            // Machine Safety
            safe(`SELECT COUNT(*) AS cnt FROM Machine_Safety WHERE Status IS NULL OR Status <> 'inactive'`),
            safe(`SELECT COUNT(*) AS cnt FROM Machine_Safety_Issues WHERE Status='open'`),
            safe(`SELECT COUNT(*) AS cnt FROM Machine_Safety WHERE RiskLevel IN ('high','critical') AND (Status IS NULL OR Status <> 'inactive')`),

            // OJT / SCW
            safe(`SELECT COUNT(*) AS cnt FROM OJT_Records`),
            safe(`SELECT COUNT(*) AS cnt FROM SCW_Documents`),

            // Contractor
            safe(`SELECT COUNT(*) AS cnt FROM Contractor_Documents`),
            safe(`SELECT COUNT(*) AS cnt FROM Contractor_Documents WHERE UploadedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`),
        ]);

        // Derived metrics
        const patrolRate  = patrolAttended && patrolSessions
            ? Math.min(Math.round(patrolAttended / (patrolSessions * 1) * 100), 100) : null;
        const cccfPermPct = cccfAssigned
            ? Math.min(Math.round((cccfCompleted / cccfAssigned) * 100), 100) : null;
        const yokotenPct  = yokotenTopics
            ? Math.min(Math.round((yokotenResponded / yokotenTopics) * 100), 100) : null;
        const trainingPassRate = trTotalEmp
            ? Math.min(Math.round((trTotalPassed / trTotalEmp) * 100), 100) : null;
        const fourmActive = (parseInt(fourmOpen, 10) || 0) + (parseInt(fourmPending, 10) || 0);
        const fourmClosureRate = fourmTotal
            ? Math.min(Math.round((fourmClosed / fourmTotal) * 100), 100)
            : null;
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
                healthIndex,
                complianceMatrix,
                patrol:       { sessions: patrolSessions, attended: patrolAttended, openIssues: patrolOpenIssues, rate: patrolRate },
                cccf:         { workerYear: cccfWorkerYear, assigned: cccfAssigned, completed: cccfCompleted, permPct: cccfPermPct },
                yokoten:      { topics: yokotenTopics, responded: yokotenResponded, pct: yokotenPct },
                training:     { totalEmp: trTotalEmp, passed: trTotalPassed, passRate: trainingPassRate },
                hiyari:       { open: hiyariOpen, year: hiyariYear },
                ky:           { year: kyYear },
                accident:     { year: accYear, recordable: accRecordable },
                safetyCulture:{ year: scYear },
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
                policy:       { total: policyTotal, acknowledged: policyAcked },
                committee:    { total: committeeTotal },
                machineSafety:{ total: machineTotal, openIssues: machineOpenIssues, critical: machineCritical },
                ojt:          { records: ojtRecords, docs: ojtDocs },
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
            db.query(
                `SELECT t.YokotenID, t.Title, t.Deadline,
                        COUNT(r.ResponseID) AS respondedCount
                 FROM YokotenTopics t
                 LEFT JOIN YokotenResponses r
                        ON r.YokotenID = t.YokotenID
                           AND (r.IsDeleted IS NULL OR r.IsDeleted = 0)
                 WHERE t.Deadline IS NOT NULL AND t.Deadline < CURDATE() AND t.IsActive = 1
                 GROUP BY t.YokotenID, t.Title, t.Deadline
                 ORDER BY t.Deadline ASC LIMIT 10`
            ).then(([r]) => r).catch(() => []),

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
