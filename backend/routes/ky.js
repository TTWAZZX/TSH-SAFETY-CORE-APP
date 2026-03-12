// backend/routes/ky.js
// KY Ability (Kiken Yochi - Hazard Prediction)
// Auth (authenticateToken) applied at mount level
// Admin-only ops use isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const { isAdmin } = require('../middleware/auth');
const { cloudinary, storage: cloudinaryStorage, fileFilter } = require('../cloudinary');

// Standard upload (images + docs) — for attachments
const uploadFile = multer({
    storage: cloudinaryStorage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
});

// Video upload — permissive filter, larger limit
const videoFilter = (req, file, cb) => {
    const allowed = [
        'video/mp4', 'video/quicktime', 'video/avi', 'video/webm',
        'video/x-msvideo', 'video/x-matroska', 'video/mpeg',
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`ประเภทไฟล์วิดีโอไม่รองรับ: ${file.mimetype}`), false);
};
const uploadVideo = multer({
    storage: cloudinaryStorage,
    fileFilter: videoFilter,
    limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
});

// Combined upload — handle both attachment + video in one form
const uploadCombined = multer({
    storage: cloudinaryStorage,
    fileFilter: (req, file, cb) => {
        const allowedAll = [
            'image/jpeg','image/png','image/gif','image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'video/mp4','video/quicktime','video/avi','video/webm',
            'video/x-msvideo','video/x-matroska','video/mpeg',
        ];
        if (allowedAll.includes(file.mimetype)) return cb(null, true);
        cb(new Error(`ประเภทไฟล์ไม่รองรับ: ${file.mimetype}`), false);
    },
    limits: { fileSize: 200 * 1024 * 1024 },
});

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE TABLES
// ─────────────────────────────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Activities (
            id                 VARCHAR(36)  NOT NULL PRIMARY KEY,
            ActivityDate       DATE         NOT NULL,
            ReporterID         VARCHAR(50)  NOT NULL,
            ReporterName       VARCHAR(100) NOT NULL,
            Department         VARCHAR(100) NOT NULL,
            TeamName           VARCHAR(100),
            Participants       TEXT,
            KYTKeyword         VARCHAR(255),
            RiskCategory       VARCHAR(50)  DEFAULT 'ทั่วไป',
            HazardDescription  TEXT         NOT NULL,
            Countermeasure     TEXT,
            AttachmentUrl      TEXT,
            VideoUrl           TEXT,
            Status             VARCHAR(20)  NOT NULL DEFAULT 'Open',
            AdminComment       TEXT,
            CreatedAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_dept_ym (Department, ActivityDate),
            KEY idx_status (Status),
            KEY idx_date (ActivityDate)
        )
    `);

    tablesReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK DUPLICATE — 1 dept per month per year
// ─────────────────────────────────────────────────────────────────────────────
router.get('/check', async (req, res) => {
    try {
        await ensureTables();
        const { dept, month, year } = req.query;
        if (!dept || !month || !year) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ dept, month, year' });
        }
        const [rows] = await db.query(
            `SELECT id FROM KY_Activities
             WHERE Department = ? AND MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ?
             LIMIT 1`,
            [dept, parseInt(month), parseInt(year)]
        );
        res.json({ success: true, exists: rows.length > 0, data: rows[0] || null });
    } catch (error) {
        console.error('KY check error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STATS — KPI + Charts
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();

        // Total departments from master
        let totalDepts = 0;
        try {
            const [dRows] = await db.query('SELECT COUNT(*) AS cnt FROM Master_Departments');
            totalDepts = dRows[0]?.cnt || 0;
        } catch (_) { totalDepts = 0; }

        // KPI
        const [[kpi]] = await db.query(`
            SELECT
                COUNT(*)                               AS total,
                COUNT(DISTINCT Department)             AS deptSubmitted,
                SUM(Status = 'Open')                   AS open,
                SUM(Status = 'Reviewed')               AS reviewed,
                SUM(Status = 'Closed')                 AS closed
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ?
        `, [year]);

        // Monthly trend
        const [monthly] = await db.query(`
            SELECT MONTH(ActivityDate) AS month, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ?
            GROUP BY MONTH(ActivityDate)
            ORDER BY month
        `, [year]);

        // By department
        const [byDept] = await db.query(`
            SELECT Department, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ?
            GROUP BY Department
            ORDER BY count DESC
            LIMIT 15
        `, [year]);

        // Monthly by department (for heatmap)
        const [deptMonthly] = await db.query(`
            SELECT Department, MONTH(ActivityDate) AS month, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ?
            GROUP BY Department, MONTH(ActivityDate)
            ORDER BY Department, month
        `, [year]);

        // Status distribution
        const [statusDist] = await db.query(`
            SELECT Status, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ?
            GROUP BY Status
        `, [year]);

        // Risk category
        const [riskCat] = await db.query(`
            SELECT COALESCE(RiskCategory, 'ทั่วไป') AS label, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ?
            GROUP BY RiskCategory
            ORDER BY count DESC
        `, [year]);

        // Departments that have NOT submitted this month
        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curYear  = now.getFullYear();
        let pendingDepts = [];
        if (year === curYear) {
            try {
                const [allDepts] = await db.query('SELECT Name FROM Master_Departments ORDER BY Name');
                const [submitted] = await db.query(
                    `SELECT DISTINCT Department FROM KY_Activities
                     WHERE MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ?`,
                    [curMonth, curYear]
                );
                const submittedSet = new Set(submitted.map(r => r.Department));
                pendingDepts = allDepts.map(d => d.Name).filter(n => !submittedSet.has(n));
            } catch (_) {}
        }

        res.json({
            success: true,
            data: {
                kpi: {
                    total:        kpi.total        || 0,
                    deptSubmitted: kpi.deptSubmitted || 0,
                    totalDepts,
                    pendingDepts:  Math.max(0, totalDepts - (kpi.deptSubmitted || 0)),
                    completionRate: totalDepts > 0 ? Math.round(((kpi.deptSubmitted || 0) / totalDepts) * 100) : 0,
                    open:     kpi.open     || 0,
                    reviewed: kpi.reviewed || 0,
                    closed:   kpi.closed   || 0,
                },
                monthly,
                byDept,
                deptMonthly,
                statusDist,
                riskCat,
                pendingDepts,
            }
        });
    } catch (error) {
        console.error('KY stats error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลสถิติได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        await ensureTables();
        const { status, dept, year, month, q } = req.query;

        let sql = 'SELECT * FROM KY_Activities WHERE 1=1';
        const params = [];

        if (status && status !== 'all') { sql += ' AND Status = ?'; params.push(status); }
        if (dept   && dept   !== 'all') { sql += ' AND Department = ?'; params.push(dept); }
        if (year)  { sql += ' AND YEAR(ActivityDate) = ?'; params.push(parseInt(year)); }
        if (month) { sql += ' AND MONTH(ActivityDate) = ?'; params.push(parseInt(month)); }
        if (q && q.trim()) {
            sql += ' AND (ReporterName LIKE ? OR Department LIKE ? OR TeamName LIKE ? OR KYTKeyword LIKE ?)';
            const like = `%${q.trim()}%`;
            params.push(like, like, like, like);
        }

        sql += ' ORDER BY CreatedAt DESC';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('KY list error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT * FROM KY_Activities WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม KY' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBMIT (any authenticated user)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', uploadCombined.fields([
    { name: 'attachment', maxCount: 1 },
    { name: 'video',      maxCount: 1 },
]), async (req, res) => {
    try {
        await ensureTables();

        const {
            TeamName, Participants, KYTKeyword, RiskCategory,
            HazardDescription, Countermeasure, ActivityDate
        } = req.body;

        if (!HazardDescription || !HazardDescription.trim()) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุรายละเอียดอันตราย' });
        }

        const date   = ActivityDate || new Date().toISOString().split('T')[0];
        const month  = new Date(date).getMonth() + 1;
        const year   = new Date(date).getFullYear();
        const dept   = req.user.department;

        // Duplicate check
        const [existing] = await db.query(
            `SELECT id FROM KY_Activities
             WHERE Department = ? AND MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ?
             LIMIT 1`,
            [dept, month, year]
        );
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: `แผนก "${dept}" ได้ส่งกิจกรรม KY สำหรับเดือนนี้แล้ว (1 เดือน / 1 เรื่อง)`
            });
        }

        const VALID_RISK = ['ทั่วไป','สภาพแวดล้อม','เครื่องจักร','พฤติกรรม','เคมี','ไฟฟ้า','อื่นๆ'];
        const safeRisk   = VALID_RISK.includes(RiskCategory) ? RiskCategory : 'ทั่วไป';

        // Participants: accept JSON string or plain text
        let participantsStr = null;
        if (Participants) {
            try {
                JSON.parse(Participants); // already JSON
                participantsStr = Participants;
            } catch {
                // treat as comma-separated
                const arr = Participants.split(',').map(p => p.trim()).filter(Boolean);
                participantsStr = JSON.stringify(arr);
            }
        }

        const attachmentUrl = req.files?.attachment?.[0]?.path || null;
        const videoUrl      = req.files?.video?.[0]?.path      || null;

        await db.query(
            `INSERT INTO KY_Activities
                (id, ActivityDate, ReporterID, ReporterName, Department, TeamName,
                 Participants, KYTKeyword, RiskCategory, HazardDescription,
                 Countermeasure, AttachmentUrl, VideoUrl, Status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open')`,
            [
                uuidv4(), date,
                req.user.id, req.user.name, dept,
                (TeamName || '').trim() || null,
                participantsStr,
                (KYTKeyword || '').trim() || null,
                safeRisk,
                HazardDescription.trim(),
                (Countermeasure || '').trim() || null,
                attachmentUrl,
                videoUrl,
            ]
        );

        res.status(201).json({ success: true, message: 'ส่งกิจกรรม KY สำเร็จ' });
    } catch (error) {
        console.error('KY submit error:', error);
        if (error.status === 409) return res.status(409).json(error);
        res.status(500).json({ success: false, message: 'ไม่สามารถส่งกิจกรรม KY ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE (Admin) — status / comment / edit
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', isAdmin, uploadCombined.fields([
    { name: 'attachment', maxCount: 1 },
    { name: 'video',      maxCount: 1 },
]), async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;

        const [rows] = await db.query('SELECT id FROM KY_Activities WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม KY' });

        const VALID_STATUS = ['Open', 'Reviewed', 'Closed'];
        const {
            Status, AdminComment, TeamName, KYTKeyword,
            RiskCategory, HazardDescription, Countermeasure, Participants
        } = req.body;

        if (Status && !VALID_STATUS.includes(Status)) {
            return res.status(400).json({ success: false, message: 'สถานะไม่ถูกต้อง' });
        }

        const VALID_RISK = ['ทั่วไป','สภาพแวดล้อม','เครื่องจักร','พฤติกรรม','เคมี','ไฟฟ้า','อื่นๆ'];
        const safeRisk   = RiskCategory && VALID_RISK.includes(RiskCategory) ? RiskCategory : undefined;

        let participantsStr = undefined;
        if (Participants !== undefined) {
            try {
                JSON.parse(Participants);
                participantsStr = Participants;
            } catch {
                const arr = Participants.split(',').map(p => p.trim()).filter(Boolean);
                participantsStr = JSON.stringify(arr);
            }
        }

        const newAttachment = req.files?.attachment?.[0]?.path;
        const newVideo      = req.files?.video?.[0]?.path;

        // Build dynamic UPDATE
        const fields  = [];
        const vals    = [];

        if (Status !== undefined)           { fields.push('Status = ?');            vals.push(Status); }
        if (AdminComment !== undefined)     { fields.push('AdminComment = ?');       vals.push(AdminComment); }
        if (TeamName !== undefined)         { fields.push('TeamName = ?');           vals.push(TeamName); }
        if (KYTKeyword !== undefined)       { fields.push('KYTKeyword = ?');         vals.push(KYTKeyword); }
        if (safeRisk !== undefined)         { fields.push('RiskCategory = ?');       vals.push(safeRisk); }
        if (HazardDescription !== undefined){ fields.push('HazardDescription = ?'); vals.push(HazardDescription); }
        if (Countermeasure !== undefined)   { fields.push('Countermeasure = ?');     vals.push(Countermeasure); }
        if (participantsStr !== undefined)  { fields.push('Participants = ?');       vals.push(participantsStr); }
        if (newAttachment)                  { fields.push('AttachmentUrl = ?');      vals.push(newAttachment); }
        if (newVideo)                       { fields.push('VideoUrl = ?');           vals.push(newVideo); }

        if (fields.length === 0) {
            return res.json({ success: true, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
        }

        vals.push(id);
        await db.query(`UPDATE KY_Activities SET ${fields.join(', ')} WHERE id = ?`, vals);

        res.json({ success: true, message: 'อัปเดตกิจกรรม KY สำเร็จ' });
    } catch (error) {
        console.error('KY update error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตข้อมูลได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT id FROM KY_Activities WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม KY' });
        await db.query('DELETE FROM KY_Activities WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบกิจกรรม KY สำเร็จ' });
    } catch (error) {
        console.error('KY delete error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
    }
});

module.exports = router;
