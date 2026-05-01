// backend/routes/dashboard.js
// Cross-module KPI overview — accessible to all authenticated users.
// Mounted at /api/dashboard (authenticateToken only, no isAdmin).
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');

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

    const [trainingRows, kyRows, hiyariRows, fourmRows, yokotenRows, patrolRows] = await Promise.all([
        safeRows(`
            SELECT Department, SUM(PassedCount) AS passed, SUM(TotalEmp) AS total
            FROM Training_Dept_Records
            WHERE Year=?
            GROUP BY Department
        `, params),
        safeRows(`
            SELECT Department, COUNT(*) AS cnt
            FROM KY_Activities
            WHERE YEAR(ActivityDate)=?
            GROUP BY Department
        `, params),
        safeRows(`
            SELECT Department, COUNT(*) AS cnt
            FROM HiyariReports
            WHERE YEAR(ReportDate)=?
            GROUP BY Department
        `, params),
        safeRows(`
            SELECT Department, COUNT(*) AS cnt
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate)=?
            GROUP BY Department
        `, params),
        safeRows(`
            SELECT Department, COUNT(*) AS cnt
            FROM YokotenResponses
            WHERE YEAR(ResponseDate)=?
            GROUP BY Department
        `, params),
        safeRows(`
            SELECT Department, COUNT(*) AS cnt
            FROM Patrol_Attendance
            WHERE YEAR(PatrolDate)=?
            GROUP BY Department
        `, params),
    ]);

    const byDept = (rows, valueFn) => {
        const m = new Map();
        for (const r of rows) m.set(String(r.Department || '').trim(), valueFn(r));
        return m;
    };
    const training = byDept(trainingRows, r => pct(r.passed, r.total));
    const ky = byDept(kyRows, r => (parseInt(r.cnt, 10) || 0) > 0 ? 100 : 0);
    const hiyari = byDept(hiyariRows, r => (parseInt(r.cnt, 10) || 0) > 0 ? 100 : 0);
    const fourm = byDept(fourmRows, r => (parseInt(r.cnt, 10) || 0) > 0 ? 100 : 0);
    const yokoten = byDept(yokotenRows, r => (parseInt(r.cnt, 10) || 0) > 0 ? 100 : 0);
    const patrol = byDept(patrolRows, r => (parseInt(r.cnt, 10) || 0) > 0 ? 100 : 0);

    return deptNames.map(dept => {
        const cells = {
            patrol: patrol.get(dept) ?? 0,
            hiyari: hiyari.get(dept) ?? 0,
            ky: ky.get(dept) ?? 0,
            yokoten: yokoten.get(dept) ?? 0,
            training: training.get(dept),
            fourm: fourm.get(dept) ?? 0,
        };
        const values = Object.values(cells).filter(v => v !== null && v !== undefined);
        const score = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;
        return { department: dept, score, ...cells };
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
            fourmOpen,
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
            safe(`SELECT COUNT(*) AS cnt FROM FourM_ChangeNotices WHERE Status='Open'`),

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
        const healthIndex = buildHealthIndex({
            patrolRate, cccfPermPct, yokotenPct, trainingPassRate,
            accRecordable, hiyariOpen, fourmOpen, patrolOpenIssues,
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
                fourm:        { open: fourmOpen },
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
        ]);

        res.json({
            success: true,
            data: { overdueAccident, dueSoonAccident, machineOverdue, yokotenOverdue, openPatrolIssues, fourmOverdue, dueSoonDays }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
