// backend/routes/hiyari.js
// Auth (authenticateToken) applied at mount level
// Admin-only operations use isAdmin middleware

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { randomUUID } = require('crypto');
const { isAdmin } = require('../middleware/auth');
const { storage: cloudinaryStorage, fileFilter } = require('../cloudinary');

const upload = multer({
    storage: cloudinaryStorage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
});

const VALID_RISK   = ['Low', 'Medium', 'High', 'Critical'];
const VALID_RANKS  = ['A', 'B', 'C'];
const VALID_STATUS = ['Open', 'In Progress', 'Closed'];
const VALID_CONSQ  = [
    'บาดเจ็บเล็กน้อย','บาดเจ็บรุนแรง','เสียชีวิต',
    'ทรัพย์สินเสียหาย','ผลกระทบต่อสิ่งแวดล้อม',
    'การหยุดชะงักการผลิต','อื่นๆ',
];
// Rank → canonical RiskLevel for backward-compat with history filter
const RANK_TO_RISK = { A: 'Critical', B: 'High', C: 'Low' };

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE TABLES
// ─────────────────────────────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS HiyariReports (
            id                   VARCHAR(36)  NOT NULL PRIMARY KEY,
            ReportDate           DATE         NOT NULL,
            ReporterID           VARCHAR(50)  NOT NULL,
            ReporterName         VARCHAR(100) NOT NULL,
            Department           VARCHAR(100) NOT NULL,
            Location             VARCHAR(255),
            Description          TEXT         NOT NULL,
            PotentialConsequence VARCHAR(100),
            RiskLevel            VARCHAR(20)  DEFAULT 'Low',
            RiskRank             VARCHAR(1),
            StopType             INT,
            Suggestion           TEXT,
            AttachmentUrl        TEXT,
            Status               VARCHAR(20)  NOT NULL DEFAULT 'Open',
            CorrectiveAction     TEXT,
            AdminComment         TEXT,
            AdditionalFileUrl    TEXT,
            ClosedAt             DATETIME,
            ClosedBy             VARCHAR(100),
            CreatedAt            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_status (Status),
            KEY idx_dept (Department),
            KEY idx_date (ReportDate),
            KEY idx_risk (RiskLevel),
            KEY idx_rank (RiskRank),
            KEY idx_stop (StopType)
        )
    `);

    // Migrate existing table — rename Rank→RiskRank (reserved keyword), add missing columns
    // CHANGE COLUMN succeeds only if `Rank` exists; ADD COLUMN is the fallback for fresh tables
    await db.query('ALTER TABLE HiyariReports CHANGE COLUMN `Rank` `RiskRank` VARCHAR(1)').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN RiskRank VARCHAR(1)').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN StopType INT').catch(() => {});
    // Re-create index on renamed column (drop is idempotent — catch if already gone)
    await db.query('ALTER TABLE HiyariReports DROP INDEX idx_rank').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD INDEX idx_rank (RiskRank)').catch(() => {});

    await db.query(`
        CREATE TABLE IF NOT EXISTS Hiyari_Dashboard_Config (
            ConfigKey  VARCHAR(100) NOT NULL PRIMARY KEY,
            ConfigValue TEXT,
            UpdatedBy  VARCHAR(100),
            UpdatedAt  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Hiyari_Assignments (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            EmployeeID   VARCHAR(50),
            AssigneeName VARCHAR(100) NOT NULL,
            Department   VARCHAR(100),
            Note         TEXT,
            DueDate      DATE,
            CreatedBy    VARCHAR(100),
            CreatedAt    DATETIME DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_emp (EmployeeID)
        )
    `);

    tablesReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS — KPI + Charts
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try { await ensureTables(); } catch (err) {
        console.error('[hiyari/stats] ensureTables failed:', err.message);
    }

    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Helper: run one query and return rows; never throws — logs and returns fallback on error
    const safeQuery = async (label, sql, params, fallback = []) => {
        try {
            const [rows] = await db.query(sql, params);
            return rows;
        } catch (err) {
            console.error(`[hiyari/stats] ${label} failed:`, err.message, '| SQL:', sql.replace(/\s+/g, ' ').trim());
            return fallback;
        }
    };

    // totals — aggregate query always returns exactly 1 row
    let totals = { total: 0, open: 0, inProgress: 0, closed: 0 };
    try {
        const [[row]] = await db.query(
            `SELECT COUNT(*) AS total,
                    SUM(Status = 'Open')        AS open,
                    SUM(Status = 'In Progress') AS inProgress,
                    SUM(Status = 'Closed')      AS closed
             FROM HiyariReports WHERE YEAR(ReportDate) = ?`,
            [year]
        );
        totals = row;
    } catch (err) {
        console.error('[hiyari/stats] totals failed:', err.message);
    }

    const monthly     = await safeQuery('monthly',     `SELECT MONTH(ReportDate) AS month, COUNT(*) AS count FROM HiyariReports WHERE YEAR(ReportDate) = ? GROUP BY MONTH(ReportDate) ORDER BY month`,                                    [year]);
    const consequence = await safeQuery('consequence', `SELECT COALESCE(PotentialConsequence,'ไม่ระบุ') AS label, COUNT(*) AS count FROM HiyariReports WHERE YEAR(ReportDate) = ? GROUP BY PotentialConsequence ORDER BY count DESC`, [year]);
    const riskDist    = await safeQuery('riskDist',    `SELECT COALESCE(RiskLevel,'Low') AS level, COUNT(*) AS count FROM HiyariReports WHERE YEAR(ReportDate) = ? GROUP BY RiskLevel ORDER BY FIELD(RiskLevel,'Critical','High','Medium','Low')`, [year]);
    const stopDist    = await safeQuery('stopDist',    `SELECT StopType, COUNT(*) AS count FROM HiyariReports WHERE YEAR(ReportDate) = ? AND StopType IS NOT NULL GROUP BY StopType ORDER BY StopType`,                                   [year]);
    const rankDist    = await safeQuery('rankDist',    `SELECT RiskRank AS \`Rank\`, COUNT(*) AS count FROM HiyariReports WHERE YEAR(ReportDate) = ? AND RiskRank IS NOT NULL GROUP BY RiskRank ORDER BY FIELD(RiskRank,'A','B','C')`,   [year]);
    const deptRank    = await safeQuery('deptRank',    `SELECT Department, COUNT(*) AS count FROM HiyariReports WHERE YEAR(ReportDate) = ? GROUP BY Department ORDER BY count DESC LIMIT 20`,                                            [year]);

    const overdueRows = await safeQuery('overdueCount',
        `SELECT COUNT(*) AS cnt FROM HiyariReports
         WHERE YEAR(ReportDate) = ? AND Status != 'Closed'
           AND (
             (RiskRank = 'A' AND DATEDIFF(CURDATE(), ReportDate) > 7)
             OR (RiskRank = 'B' AND DATEDIFF(CURDATE(), ReportDate) > 15)
             OR (RiskRank = 'C' AND DATEDIFF(CURDATE(), ReportDate) > 30)
             OR (RiskRank IS NULL AND RiskLevel = 'Critical' AND DATEDIFF(CURDATE(), ReportDate) > 7)
             OR (RiskRank IS NULL AND RiskLevel = 'High'     AND DATEDIFF(CURDATE(), ReportDate) > 15)
             OR (RiskRank IS NULL AND DATEDIFF(CURDATE(), ReportDate) > 30)
           )`,
        [year], [{ cnt: 0 }]
    );
    const overdueCount = Number(overdueRows[0]?.cnt) || 0;

    res.json({
        success: true,
        data: {
            kpi: {
                total:        totals.total      || 0,
                open:         totals.open       || 0,
                inProgress:   totals.inProgress || 0,
                closed:       totals.closed     || 0,
                overdueCount,
            },
            monthly, consequence, riskDist, stopDist, rankDist, deptRank,
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD CONFIG  (must be before /:id)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard-config', async (req, res) => {
    const SAFE_DEFAULT = { pinnedDepts: [] };
    try {
        await ensureTables();
    } catch (err) {
        console.error('[hiyari/dashboard-config] ensureTables failed:', err.message);
        return res.json({ success: true, data: SAFE_DEFAULT });
    }
    try {
        const [rows] = await db.query('SELECT ConfigKey, ConfigValue FROM Hiyari_Dashboard_Config');
        const config = { ...SAFE_DEFAULT };
        rows.forEach(r => {
            try { config[r.ConfigKey] = JSON.parse(r.ConfigValue); } catch { config[r.ConfigKey] = r.ConfigValue; }
        });
        res.json({ success: true, data: config });
    } catch (err) {
        console.error('[hiyari/dashboard-config] query failed:', err.message);
        res.json({ success: true, data: SAFE_DEFAULT });
    }
});

router.put('/dashboard-config', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { pinnedDepts } = req.body;
        if (pinnedDepts !== undefined) {
            await db.query(
                `INSERT INTO Hiyari_Dashboard_Config (ConfigKey, ConfigValue, UpdatedBy)
                 VALUES (?,?,?) ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue), UpdatedBy=VALUES(UpdatedBy)`,
                ['pinnedDepts', JSON.stringify(pinnedDepts), req.user.name]
            );
        }
        res.json({ success: true, message: 'บันทึกการตั้งค่า Dashboard สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENTS  (must be before /:id)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/assignments', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query(`
            SELECT a.id, a.EmployeeID,
                COALESCE(e.EmployeeName, a.AssigneeName) AS AssigneeName,
                COALESCE(e.Department,  a.Department)   AS Department,
                a.Note, a.DueDate, a.CreatedBy, a.CreatedAt
            FROM Hiyari_Assignments a
            LEFT JOIN Employees e ON e.EmployeeID = a.EmployeeID
            ORDER BY COALESCE(e.Department, a.Department), COALESCE(e.EmployeeName, a.AssigneeName)
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json({ success: true, data: [] });
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/assignments', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { EmployeeID, AssigneeName, Department, Note, DueDate } = req.body;
        if (!EmployeeID && (!AssigneeName || !Department)) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อและหน่วยงาน' });
        }
        let name = (AssigneeName || '').trim() || null;
        let dept = (Department  || '').trim() || null;
        if (EmployeeID) {
            const [emp] = await db.query('SELECT EmployeeName, Department FROM Employees WHERE EmployeeID = ? LIMIT 1', [EmployeeID]);
            if (!emp.length) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
            name = emp[0].EmployeeName || name;
            dept = emp[0].Department   || dept;
            const [dup] = await db.query('SELECT id FROM Hiyari_Assignments WHERE EmployeeID = ? LIMIT 1', [EmployeeID]);
            if (dup.length) return res.status(400).json({ success: false, message: 'พนักงานคนนี้ถูกมอบหมายแล้ว' });
        }
        await db.query(
            'INSERT INTO Hiyari_Assignments (EmployeeID, AssigneeName, Department, Note, DueDate, CreatedBy) VALUES (?,?,?,?,?,?)',
            [EmployeeID || null, name, dept, (Note || '').trim() || null, DueDate || null, req.user.name]
        );
        res.json({ success: true, message: 'เพิ่มรายการมอบหมายสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/assignments/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;
        const { EmployeeID, AssigneeName, Department, Note, DueDate } = req.body;
        const [exist] = await db.query('SELECT id FROM Hiyari_Assignments WHERE id = ? LIMIT 1', [id]);
        if (!exist.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการมอบหมาย' });
        if (!EmployeeID && (!AssigneeName || !Department)) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อและหน่วยงาน' });
        }
        let name = (AssigneeName || '').trim() || null;
        let dept = (Department  || '').trim() || null;
        let empId = EmployeeID || null;
        if (empId) {
            const [emp] = await db.query('SELECT EmployeeName, Department FROM Employees WHERE EmployeeID = ? LIMIT 1', [empId]);
            if (!emp.length) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
            name = emp[0].EmployeeName || name;
            dept = emp[0].Department   || dept;
            const [dup] = await db.query('SELECT id FROM Hiyari_Assignments WHERE EmployeeID = ? AND id <> ? LIMIT 1', [empId, id]);
            if (dup.length) return res.status(400).json({ success: false, message: 'พนักงานคนนี้ถูกมอบหมายแล้ว' });
        }
        await db.query(
            'UPDATE Hiyari_Assignments SET EmployeeID=?, AssigneeName=?, Department=?, Note=?, DueDate=?, CreatedBy=? WHERE id=?',
            [empId, name, dept, (Note || '').trim() || null, DueDate || null, req.user.name, id]
        );
        res.json({ success: true, message: 'อัปเดตรายการมอบหมายสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/assignments/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        await db.query('DELETE FROM Hiyari_Assignments WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบรายการมอบหมายสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// LIST REPORTS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        await ensureTables();
        const { status, dept, year, q, risk } = req.query;
        let sql = 'SELECT *, RiskRank AS `Rank` FROM HiyariReports WHERE 1=1';
        const params = [];
        if (status && status !== 'all') { sql += ' AND Status = ?';     params.push(status); }
        if (dept   && dept   !== 'all') { sql += ' AND Department = ?'; params.push(dept); }
        if (risk   && risk   !== 'all') { sql += ' AND RiskLevel = ?';  params.push(risk); }
        if (year)  { sql += ' AND YEAR(ReportDate) = ?'; params.push(parseInt(year)); }
        if (q && q.trim()) {
            sql += ' AND (ReporterName LIKE ? OR Description LIKE ? OR Location LIKE ?)';
            const like = `%${q.trim()}%`;
            params.push(like, like, like);
        }
        sql += ' ORDER BY CreatedAt DESC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Hiyari list error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลรายงานได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE REPORT
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT *, RiskRank AS `Rank` FROM HiyariReports WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBMIT REPORT
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', upload.single('attachment'), async (req, res) => {
    try {
        await ensureTables();
        const { Description, Location, PotentialConsequence, RiskLevel, Rank, StopType, Suggestion, ReportDate } = req.body;

        if (!Description || !Description.trim()) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุรายละเอียดเหตุการณ์' });
        }

        const safeRank     = VALID_RANKS.includes(Rank) ? Rank : null;
        const safeStopType = [1,2,3,4,5,6].includes(parseInt(StopType)) ? parseInt(StopType) : null;
        const safeConsq    = VALID_CONSQ.includes(PotentialConsequence) ? PotentialConsequence : null;
        // Derive RiskLevel from Rank for backward-compat; fall back to submitted RiskLevel
        const safeRisk     = safeRank ? RANK_TO_RISK[safeRank] : (VALID_RISK.includes(RiskLevel) ? RiskLevel : 'Low');
        const fileUrl      = req.file ? req.file.path : null;
        const date         = ReportDate || new Date().toISOString().split('T')[0];
        const reporterId   = req.user?.id || req.user?.EmployeeID || 'unknown';
        const reporterName = req.user?.name || req.user?.EmployeeName || reporterId;
        const department   = req.user?.department || req.user?.Department || 'ไม่ระบุ';

        await db.query(
            `INSERT INTO HiyariReports
                (id, ReportDate, ReporterID, ReporterName, Department, Location,
                 Description, PotentialConsequence, RiskLevel, RiskRank, StopType,
                 Suggestion, AttachmentUrl, Status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open')`,
            [
                randomUUID(), date,
                reporterId, reporterName, department,
                (Location || '').trim() || null,
                Description.trim(), safeConsq, safeRisk, safeRank, safeStopType,
                (Suggestion || '').trim() || null, fileUrl,
            ]
        );
        res.status(201).json({ success: true, message: 'ส่งรายงาน Hiyari-Hatto สำเร็จ' });
    } catch (error) {
        console.error('Hiyari submit error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถส่งรายงานได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE REPORT — Status / Corrective Action / Comment (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;
        const { Status, CorrectiveAction, AdminComment } = req.body;

        if (Status && !VALID_STATUS.includes(Status)) {
            return res.status(400).json({ success: false, message: 'สถานะไม่ถูกต้อง' });
        }

        const [rows] = await db.query('SELECT id, Status FROM HiyariReports WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });

        const isClosing = Status === 'Closed' && rows[0].Status !== 'Closed';
        const closedAt  = isClosing ? new Date() : null;
        const closedBy  = isClosing ? req.user.name : null;

        await db.query(
            `UPDATE HiyariReports
             SET Status           = COALESCE(?, Status),
                 CorrectiveAction = COALESCE(?, CorrectiveAction),
                 AdminComment     = COALESCE(?, AdminComment),
                 ClosedAt         = CASE WHEN ? IS NOT NULL THEN ? ELSE ClosedAt END,
                 ClosedBy         = CASE WHEN ? IS NOT NULL THEN ? ELSE ClosedBy END
             WHERE id = ?`,
            [
                Status || null,
                CorrectiveAction !== undefined ? CorrectiveAction : null,
                AdminComment     !== undefined ? AdminComment     : null,
                closedAt, closedAt, closedBy, closedBy, id,
            ]
        );
        res.json({ success: true, message: 'อัปเดตรายงานสำเร็จ' });
    } catch (error) {
        console.error('Hiyari update error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตรายงานได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD ADDITIONAL FILE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/attachment', isAdmin, upload.single('file'), async (req, res) => {
    try {
        await ensureTables();
        if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์' });
        const [rows] = await db.query('SELECT id FROM HiyariReports WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });
        await db.query('UPDATE HiyariReports SET AdditionalFileUrl = ? WHERE id = ?', [req.file.path, req.params.id]);
        res.json({ success: true, message: 'อัปโหลดไฟล์สำเร็จ', url: req.file.path });
    } catch (error) {
        console.error('Hiyari attachment error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปโหลดไฟล์ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT id FROM HiyariReports WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });
        await db.query('DELETE FROM HiyariReports WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบรายงานสำเร็จ' });
    } catch (error) {
        console.error('Hiyari delete error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบรายงานได้' });
    }
});

module.exports = router;
