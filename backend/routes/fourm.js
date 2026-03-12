// backend/routes/fourm.js
// 4M Change — Man Record + Change Notice
// Auth (authenticateToken) applied at mount level
// Admin-only write ops use isAdmin

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
        CREATE TABLE IF NOT EXISTS FourM_ManRecords (
            id               VARCHAR(36)  NOT NULL PRIMARY KEY,
            Department       VARCHAR(100) NOT NULL,
            TotalAttendance  INT          DEFAULT 0,
            Pass             INT          DEFAULT 0,
            Fail             INT          DEFAULT 0,
            Status           VARCHAR(20)  DEFAULT 'Pending',
            ExamDate         DATE,
            Notes            TEXT,
            CreatedBy        VARCHAR(100),
            CreatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_dept (Department),
            KEY idx_date (ExamDate)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS FourM_ChangeNotices (
            id                 VARCHAR(36)  NOT NULL PRIMARY KEY,
            NoticeNo           VARCHAR(50)  NOT NULL,
            RequestDate        DATE         NOT NULL,
            Title              VARCHAR(255) NOT NULL,
            Description        TEXT,
            ChangeType         VARCHAR(20)  NOT NULL,
            ResponsiblePerson  VARCHAR(100),
            Department         VARCHAR(100),
            AttachmentUrl      TEXT,
            Status             VARCHAR(20)  NOT NULL DEFAULT 'Open',
            ClosingComment     TEXT,
            ClosingDocUrl      TEXT,
            ClosedDate         DATE,
            ClosedBy           VARCHAR(100),
            CreatedByID        VARCHAR(50)  NOT NULL,
            CreatedBy          VARCHAR(100) NOT NULL,
            CreatedAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_type (ChangeType),
            KEY idx_status (Status),
            KEY idx_date (RequestDate),
            UNIQUE KEY uq_noticeno (NoticeNo)
        )
    `);

    tablesReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();

        // Notice KPI
        const [[noticeKpi]] = await db.query(`
            SELECT
                COUNT(*)                         AS total,
                SUM(Status = 'Open')             AS open,
                SUM(Status = 'Pending')          AS pending,
                SUM(Status = 'Closed')           AS closed
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
        `, [year]);

        // By change type
        const [byType] = await db.query(`
            SELECT ChangeType AS label, COUNT(*) AS count
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
            GROUP BY ChangeType ORDER BY count DESC
        `, [year]);

        // Monthly trend
        const [monthly] = await db.query(`
            SELECT MONTH(RequestDate) AS month, COUNT(*) AS count
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
            GROUP BY MONTH(RequestDate) ORDER BY month
        `, [year]);

        // By department
        const [byDept] = await db.query(`
            SELECT COALESCE(Department,'ไม่ระบุ') AS label, COUNT(*) AS count
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
            GROUP BY Department ORDER BY count DESC LIMIT 12
        `, [year]);

        // Man record summary (latest per dept)
        const [manSummary] = await db.query(`
            SELECT Department,
                SUM(TotalAttendance) AS totalAtt,
                SUM(Pass)            AS totalPass,
                SUM(Fail)            AS totalFail,
                MAX(ExamDate)        AS lastExam
            FROM FourM_ManRecords
            WHERE YEAR(ExamDate) = ? OR ExamDate IS NULL
            GROUP BY Department
        `, [year]);

        res.json({
            success: true,
            data: { noticeKpi, byType, monthly, byDept, manSummary }
        });
    } catch (error) {
        console.error('4M stats error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลสถิติได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAN RECORDS — LIST
// ─────────────────────────────────────────────────────────────────────────────
router.get('/man-records', async (req, res) => {
    try {
        await ensureTables();
        const { dept, year, q } = req.query;
        let sql = 'SELECT * FROM FourM_ManRecords WHERE 1=1';
        const params = [];
        if (dept && dept !== 'all') { sql += ' AND Department = ?'; params.push(dept); }
        if (year) { sql += ' AND YEAR(ExamDate) = ?'; params.push(parseInt(year)); }
        if (q && q.trim()) { sql += ' AND Department LIKE ?'; params.push(`%${q.trim()}%`); }
        sql += ' ORDER BY ExamDate DESC, CreatedAt DESC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลผลสอบได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAN RECORDS — CREATE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/man-records', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Department, TotalAttendance, Pass, Fail, Status, ExamDate, Notes } = req.body;
        if (!Department) return res.status(400).json({ success: false, message: 'กรุณาระบุแผนก' });

        const total = parseInt(TotalAttendance) || 0;
        const pass  = parseInt(Pass) || 0;
        const fail  = parseInt(Fail) || (total - pass);
        const VALID_STATUS = ['Pass','Fail','Pending'];
        const safeStatus   = VALID_STATUS.includes(Status) ? Status : 'Pending';

        await db.query(
            `INSERT INTO FourM_ManRecords (id,Department,TotalAttendance,Pass,Fail,Status,ExamDate,Notes,CreatedBy)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [uuidv4(), Department, total, pass, fail, safeStatus,
             ExamDate || null, (Notes||'').trim()||null, req.user.name]
        );
        res.status(201).json({ success: true, message: 'บันทึกผลสอบสำเร็จ' });
    } catch (error) {
        console.error('Man record create error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกผลสอบได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAN RECORDS — UPDATE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/man-records/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;
        const [rows] = await db.query('SELECT id FROM FourM_ManRecords WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูล' });

        const { Department, TotalAttendance, Pass, Fail, Status, ExamDate, Notes } = req.body;
        const VALID_STATUS = ['Pass','Fail','Pending'];
        const safeStatus   = VALID_STATUS.includes(Status) ? Status : undefined;

        const fields = []; const vals = [];
        if (Department !== undefined)       { fields.push('Department = ?');       vals.push(Department); }
        if (TotalAttendance !== undefined)  { fields.push('TotalAttendance = ?');  vals.push(parseInt(TotalAttendance)||0); }
        if (Pass !== undefined)             { fields.push('Pass = ?');             vals.push(parseInt(Pass)||0); }
        if (Fail !== undefined)             { fields.push('Fail = ?');             vals.push(parseInt(Fail)||0); }
        if (safeStatus !== undefined)       { fields.push('Status = ?');           vals.push(safeStatus); }
        if (ExamDate !== undefined)         { fields.push('ExamDate = ?');         vals.push(ExamDate||null); }
        if (Notes !== undefined)            { fields.push('Notes = ?');            vals.push(Notes); }

        if (!fields.length) return res.json({ success: true, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
        vals.push(id);
        await db.query(`UPDATE FourM_ManRecords SET ${fields.join(', ')} WHERE id = ?`, vals);
        res.json({ success: true, message: 'อัปเดตผลสอบสำเร็จ' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตผลสอบได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAN RECORDS — DELETE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/man-records/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        await db.query('DELETE FROM FourM_ManRecords WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE NOTICES — LIST
// ─────────────────────────────────────────────────────────────────────────────
router.get('/notices', async (req, res) => {
    try {
        await ensureTables();
        const { status, type, dept, year, q } = req.query;
        let sql = 'SELECT * FROM FourM_ChangeNotices WHERE 1=1';
        const params = [];
        if (status && status !== 'all') { sql += ' AND Status = ?'; params.push(status); }
        if (type   && type   !== 'all') { sql += ' AND ChangeType = ?'; params.push(type); }
        if (dept   && dept   !== 'all') { sql += ' AND Department = ?'; params.push(dept); }
        if (year) { sql += ' AND YEAR(RequestDate) = ?'; params.push(parseInt(year)); }
        if (q && q.trim()) {
            sql += ' AND (Title LIKE ? OR NoticeNo LIKE ? OR ResponsiblePerson LIKE ?)';
            const like = `%${q.trim()}%`;
            params.push(like, like, like);
        }
        sql += ' ORDER BY RequestDate DESC, CreatedAt DESC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูล Change Notice ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE NOTICES — GET SINGLE
// ─────────────────────────────────────────────────────────────────────────────
router.get('/notices/:id', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT * FROM FourM_ChangeNotices WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบ Change Notice' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE NOTICES — CREATE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/notices', isAdmin, upload.single('attachment'), async (req, res) => {
    try {
        await ensureTables();
        const { NoticeNo, RequestDate, Title, Description, ChangeType, ResponsiblePerson, Department } = req.body;
        if (!NoticeNo || !Title || !RequestDate || !ChangeType) {
            return res.status(400).json({ success: false, message: 'กรุณากรอก Notice No, วันที่, หัวข้อ และ Change Type' });
        }
        const VALID_TYPES = ['Man','Machine','Material','Method'];
        if (!VALID_TYPES.includes(ChangeType)) {
            return res.status(400).json({ success: false, message: 'Change Type ไม่ถูกต้อง' });
        }
        // Check duplicate NoticeNo
        const [exist] = await db.query('SELECT id FROM FourM_ChangeNotices WHERE NoticeNo = ?', [NoticeNo.trim()]);
        if (exist.length) return res.status(409).json({ success: false, message: `Notice No "${NoticeNo}" มีอยู่แล้ว` });

        const attachUrl = req.file ? req.file.path : null;
        await db.query(
            `INSERT INTO FourM_ChangeNotices
                (id,NoticeNo,RequestDate,Title,Description,ChangeType,
                 ResponsiblePerson,Department,AttachmentUrl,
                 CreatedByID,CreatedBy)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
                uuidv4(), NoticeNo.trim(), RequestDate, Title.trim(),
                (Description||'').trim()||null, ChangeType,
                (ResponsiblePerson||'').trim()||null,
                (Department||'').trim()||null,
                attachUrl,
                req.user.id, req.user.name,
            ]
        );
        res.status(201).json({ success: true, message: 'สร้าง Change Notice สำเร็จ' });
    } catch (error) {
        console.error('Notice create error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถสร้าง Change Notice ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE NOTICES — UPDATE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/notices/:id', isAdmin, upload.single('attachment'), async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;
        const [rows] = await db.query('SELECT id FROM FourM_ChangeNotices WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบ Change Notice' });

        const { Title, Description, ChangeType, ResponsiblePerson, Department, Status, RequestDate } = req.body;
        const VALID_TYPES  = ['Man','Machine','Material','Method'];
        const VALID_STATUS = ['Open','Pending','Closed'];

        const fields = []; const vals = [];
        if (Title !== undefined)             { fields.push('Title = ?');             vals.push(Title); }
        if (Description !== undefined)       { fields.push('Description = ?');       vals.push(Description); }
        if (ChangeType && VALID_TYPES.includes(ChangeType)) { fields.push('ChangeType = ?'); vals.push(ChangeType); }
        if (Status && VALID_STATUS.includes(Status))        { fields.push('Status = ?');     vals.push(Status); }
        if (ResponsiblePerson !== undefined) { fields.push('ResponsiblePerson = ?'); vals.push(ResponsiblePerson); }
        if (Department !== undefined)        { fields.push('Department = ?');        vals.push(Department); }
        if (RequestDate !== undefined)       { fields.push('RequestDate = ?');       vals.push(RequestDate); }
        if (req.file)                        { fields.push('AttachmentUrl = ?');     vals.push(req.file.path); }

        if (!fields.length) return res.json({ success: true, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
        vals.push(id);
        await db.query(`UPDATE FourM_ChangeNotices SET ${fields.join(', ')} WHERE id = ?`, vals);
        res.json({ success: true, message: 'อัปเดต Change Notice สำเร็จ' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดต Change Notice ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE NOTICES — CLOSE (creator OR admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/notices/:id/close', upload.single('closingDoc'), async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;
        const [rows] = await db.query(
            'SELECT id, CreatedByID, Status FROM FourM_ChangeNotices WHERE id = ?', [id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบ Change Notice' });

        const notice  = rows[0];
        const isAdmin = req.user.role === 'Admin' || req.user.Role === 'Admin';
        const isCreator = req.user.id === notice.CreatedByID;

        if (!isAdmin && !isCreator) {
            return res.status(403).json({ success: false, message: 'เฉพาะผู้สร้าง Notice หรือ Admin เท่านั้นที่สามารถปิดได้' });
        }
        if (notice.Status === 'Closed') {
            return res.status(400).json({ success: false, message: 'Change Notice นี้ถูกปิดแล้ว' });
        }

        const { ClosingComment, ClosedDate } = req.body;
        const closingDocUrl = req.file ? req.file.path : null;
        const closeDate     = ClosedDate || new Date().toISOString().split('T')[0];

        await db.query(
            `UPDATE FourM_ChangeNotices
             SET Status='Closed', ClosingComment=?, ClosingDocUrl=COALESCE(?,ClosingDocUrl),
                 ClosedDate=?, ClosedBy=?
             WHERE id=?`,
            [(ClosingComment||'').trim()||null, closingDocUrl, closeDate, req.user.name, id]
        );
        res.json({ success: true, message: 'ปิด Change Notice สำเร็จ' });
    } catch (error) {
        console.error('Notice close error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถปิด Change Notice ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE NOTICES — DELETE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/notices/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        await db.query('DELETE FROM FourM_ChangeNotices WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบ Change Notice สำเร็จ' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
    }
});

module.exports = router;
