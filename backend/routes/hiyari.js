// backend/routes/hiyari.js
// Auth (authenticateToken) applied at mount level
// Admin-only operations use isAdmin middleware

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const { isAdmin } = require('../middleware/auth');
const { storage: cloudinaryStorage, fileFilter } = require('../cloudinary');

const upload = multer({
    storage: cloudinaryStorage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
});

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE TABLES
// ─────────────────────────────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS HiyariReports (
            id                  VARCHAR(36)  NOT NULL PRIMARY KEY,
            ReportDate          DATE         NOT NULL,
            ReporterID          VARCHAR(50)  NOT NULL,
            ReporterName        VARCHAR(100) NOT NULL,
            Department          VARCHAR(100) NOT NULL,
            Location            VARCHAR(255),
            Description         TEXT         NOT NULL,
            PotentialConsequence VARCHAR(100),
            RiskLevel           VARCHAR(20)  DEFAULT 'Low',
            Suggestion          TEXT,
            AttachmentUrl       TEXT,
            Status              VARCHAR(20)  NOT NULL DEFAULT 'Open',
            CorrectiveAction    TEXT,
            AdminComment        TEXT,
            AdditionalFileUrl   TEXT,
            ClosedAt            DATETIME,
            ClosedBy            VARCHAR(100),
            CreatedAt           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_status (Status),
            KEY idx_dept (Department),
            KEY idx_date (ReportDate),
            KEY idx_risk (RiskLevel)
        )
    `);

    tablesReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS — KPI + Charts
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();

        // KPI totals
        const [[totals]] = await db.query(`
            SELECT
                COUNT(*)                                          AS total,
                SUM(Status = 'Open')                             AS open,
                SUM(Status = 'In Progress')                      AS inProgress,
                SUM(Status = 'Closed')                           AS closed
            FROM HiyariReports
            WHERE YEAR(ReportDate) = ?
        `, [year]);

        // Monthly trend
        const [monthly] = await db.query(`
            SELECT
                MONTH(ReportDate) AS month,
                COUNT(*)          AS count
            FROM HiyariReports
            WHERE YEAR(ReportDate) = ?
            GROUP BY MONTH(ReportDate)
            ORDER BY month
        `, [year]);

        // Consequence distribution
        const [consequence] = await db.query(`
            SELECT
                COALESCE(PotentialConsequence, 'ไม่ระบุ') AS label,
                COUNT(*) AS count
            FROM HiyariReports
            WHERE YEAR(ReportDate) = ?
            GROUP BY PotentialConsequence
            ORDER BY count DESC
        `, [year]);

        // Risk level distribution
        const [riskDist] = await db.query(`
            SELECT
                COALESCE(RiskLevel, 'Low') AS level,
                COUNT(*) AS count
            FROM HiyariReports
            WHERE YEAR(ReportDate) = ?
            GROUP BY RiskLevel
            ORDER BY FIELD(RiskLevel, 'Critical', 'High', 'Medium', 'Low')
        `, [year]);

        // Department ranking
        const [deptRank] = await db.query(`
            SELECT
                Department,
                COUNT(*) AS count
            FROM HiyariReports
            WHERE YEAR(ReportDate) = ?
            GROUP BY Department
            ORDER BY count DESC
            LIMIT 10
        `, [year]);

        res.json({
            success: true,
            data: {
                kpi: {
                    total:      totals.total      || 0,
                    open:       totals.open        || 0,
                    inProgress: totals.inProgress  || 0,
                    closed:     totals.closed      || 0,
                },
                monthly,
                consequence,
                riskDist,
                deptRank,
            }
        });
    } catch (error) {
        console.error('Hiyari stats error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลสถิติได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// LIST REPORTS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        await ensureTables();
        const { status, dept, year, q, risk } = req.query;

        let sql = 'SELECT * FROM HiyariReports WHERE 1=1';
        const params = [];

        if (status && status !== 'all') { sql += ' AND Status = ?'; params.push(status); }
        if (dept   && dept   !== 'all') { sql += ' AND Department = ?'; params.push(dept); }
        if (risk   && risk   !== 'all') { sql += ' AND RiskLevel = ?'; params.push(risk); }
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
        const [rows] = await db.query('SELECT * FROM HiyariReports WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBMIT REPORT (any authenticated user)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', upload.single('attachment'), async (req, res) => {
    try {
        await ensureTables();

        const { Description, Location, PotentialConsequence, RiskLevel, Suggestion, ReportDate } = req.body;

        if (!Description || !Description.trim()) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุรายละเอียดเหตุการณ์' });
        }

        const VALID_RISK   = ['Low', 'Medium', 'High', 'Critical'];
        const VALID_CONSQ  = [
            'บาดเจ็บเล็กน้อย', 'บาดเจ็บรุนแรง', 'เสียชีวิต',
            'ทรัพย์สินเสียหาย', 'ผลกระทบต่อสิ่งแวดล้อม',
            'การหยุดชะงักการผลิต', 'อื่นๆ'
        ];

        const safeRisk  = VALID_RISK.includes(RiskLevel)              ? RiskLevel              : 'Low';
        const safeConsq = VALID_CONSQ.includes(PotentialConsequence)  ? PotentialConsequence   : null;
        const fileUrl   = req.file ? req.file.path : null;
        const date      = ReportDate || new Date().toISOString().split('T')[0];

        await db.query(
            `INSERT INTO HiyariReports
                (id, ReportDate, ReporterID, ReporterName, Department, Location,
                 Description, PotentialConsequence, RiskLevel, Suggestion, AttachmentUrl, Status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open')`,
            [
                uuidv4(),
                date,
                req.user.id,
                req.user.name,
                req.user.department,
                (Location || '').trim() || null,
                Description.trim(),
                safeConsq,
                safeRisk,
                (Suggestion || '').trim() || null,
                fileUrl,
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

        const VALID_STATUS = ['Open', 'In Progress', 'Closed'];
        if (Status && !VALID_STATUS.includes(Status)) {
            return res.status(400).json({ success: false, message: 'สถานะไม่ถูกต้อง' });
        }

        const [rows] = await db.query('SELECT id, Status FROM HiyariReports WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });

        const isClosing  = Status === 'Closed' && rows[0].Status !== 'Closed';
        const closedAt   = isClosing ? new Date() : null;
        const closedBy   = isClosing ? req.user.name : null;

        await db.query(
            `UPDATE HiyariReports
             SET Status           = COALESCE(?, Status),
                 CorrectiveAction = COALESCE(?, CorrectiveAction),
                 AdminComment     = COALESCE(?, AdminComment),
                 ClosedAt         = CASE WHEN ? IS NOT NULL THEN ? ELSE ClosedAt END,
                 ClosedBy         = CASE WHEN ? IS NOT NULL THEN ? ELSE ClosedBy END
             WHERE id = ?`,
            [
                Status        || null,
                CorrectiveAction !== undefined ? CorrectiveAction : null,
                AdminComment     !== undefined ? AdminComment     : null,
                closedAt, closedAt,
                closedBy, closedBy,
                id,
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

        await db.query(
            'UPDATE HiyariReports SET AdditionalFileUrl = ? WHERE id = ?',
            [req.file.path, req.params.id]
        );

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
