// backend/routes/ky.js
// KY Ability (Kiken Yochi - Hazard Prediction)
// Auth (authenticateToken) applied at mount level
// Admin-only ops use isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { randomUUID } = require('crypto');
const { isAdmin } = require('../middleware/auth');
const { cloudinary, storage: cloudinaryStorage, fileFilter } = require('../cloudinary');

// Standard upload (images + docs)
const uploadFile = multer({
    storage: cloudinaryStorage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
});

// Video upload
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
    limits: { fileSize: 200 * 1024 * 1024 },
});

// Combined upload
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

    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Program_Config (
            id           INT          AUTO_INCREMENT PRIMARY KEY,
            Year         INT          NOT NULL,
            Department   VARCHAR(100) NOT NULL,
            SafetyUnits  TEXT         DEFAULT NULL,
            YearlyTarget INT          NOT NULL DEFAULT 12,
            DeadlineDay  TINYINT      DEFAULT 15,
            DeadlineNote VARCHAR(255) DEFAULT NULL,
            IsActive     TINYINT(1)   NOT NULL DEFAULT 1,
            CreatedBy    VARCHAR(50),
            CreatedAt    DATETIME     DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_year (Year),
            KEY idx_year_dept (Year, Department)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    tablesReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE SEARCH — for participant typeahead
// ─────────────────────────────────────────────────────────────────────────────
router.get('/employees', async (req, res) => {
    try {
        const { q, dept } = req.query;
        let sql = `SELECT EmployeeID, EmployeeName, Department, Position FROM Employees WHERE 1=1`;
        const params = [];
        if (q && q.trim()) {
            sql += ` AND (EmployeeName LIKE ? OR EmployeeID LIKE ?)`;
            const like = `%${q.trim()}%`;
            params.push(like, like);
        }
        if (dept) { sql += ` AND Department = ?`; params.push(dept); }
        sql += ` ORDER BY EmployeeName LIMIT 40`;
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('KY employees error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถค้นหาพนักงานได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STATS — KPI + Charts
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();

        // Program config for this year
        const [configRows] = await db.query(
            `SELECT Department, SafetyUnits, YearlyTarget, DeadlineDay, DeadlineNote
             FROM KY_Program_Config WHERE Year = ? AND IsActive = 1 ORDER BY Department`,
            [year]
        );
        const configMap = {};
        configRows.forEach(c => { configMap[c.Department] = c; });
        let targetDepts = configRows.map(c => c.Department);

        // Fallback to Master_Departments if no program config
        let usingConfig = targetDepts.length > 0;
        if (!usingConfig) {
            try {
                const [dRows] = await db.query('SELECT Name FROM Master_Departments ORDER BY Name');
                targetDepts = dRows.map(d => d.Name);
            } catch (_) {}
        }

        // Dept filter clause — applied to ALL activity queries when config exists
        const deptFilter  = usingConfig && targetDepts.length > 0
            ? `AND Department IN (${targetDepts.map(() => '?').join(',')})`
            : '';
        const deptParams  = usingConfig && targetDepts.length > 0 ? targetDepts : [];

        // KPI
        const [[kpi]] = await db.query(`
            SELECT
                COUNT(*)                               AS total,
                COUNT(DISTINCT Department)             AS deptSubmitted,
                SUM(Status = 'Open')                   AS open,
                SUM(Status = 'Reviewed')               AS reviewed,
                SUM(Status = 'Closed')                 AS closed
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
        `, [year, ...deptParams]);

        // Monthly trend
        const [monthly] = await db.query(`
            SELECT MONTH(ActivityDate) AS month, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY MONTH(ActivityDate)
            ORDER BY month
        `, [year, ...deptParams]);

        // By department
        const [byDept] = await db.query(`
            SELECT Department, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY Department
            ORDER BY count DESC
            LIMIT 15
        `, [year, ...deptParams]);

        // Monthly by department (for heatmap)
        const [deptMonthly] = await db.query(`
            SELECT Department, MONTH(ActivityDate) AS month, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY Department, MONTH(ActivityDate)
            ORDER BY Department, month
        `, [year, ...deptParams]);

        // Status distribution
        const [statusDist] = await db.query(`
            SELECT Status, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY Status
        `, [year, ...deptParams]);

        // Risk category
        const [riskCat] = await db.query(`
            SELECT COALESCE(RiskCategory, 'ทั่วไป') AS label, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY RiskCategory
            ORDER BY count DESC
        `, [year, ...deptParams]);

        // Yearly submitted per dept
        const [yearlyByDept] = await db.query(`
            SELECT Department, COUNT(*) AS submitted
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY Department
        `, [year, ...deptParams]);

        // Top recurring KYT keywords (non-empty, for hazard pattern chart)
        const [topKeywords] = await db.query(`
            SELECT KYTKeyword AS keyword, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? AND KYTKeyword IS NOT NULL AND KYTKeyword != '' ${deptFilter}
            GROUP BY KYTKeyword
            ORDER BY count DESC
            LIMIT 10
        `, [year, ...deptParams]);
        const yearlyMap = {};
        yearlyByDept.forEach(r => { yearlyMap[r.Department] = r.submitted; });

        // Current month pending depts (depts in scope that haven't submitted this month)
        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curYear  = now.getFullYear();
        let pendingDepts = [];
        if (year === curYear && targetDepts.length) {
            try {
                const [submitted] = await db.query(
                    `SELECT DISTINCT Department FROM KY_Activities
                     WHERE MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ?`,
                    [curMonth, curYear]
                );
                const submittedSet = new Set(submitted.map(r => r.Department));
                pendingDepts = targetDepts.filter(n => !submittedSet.has(n));
            } catch (_) {}
        }

        // Program progress per dept
        const programProgress = targetDepts.map(dept => {
            const cfg = configMap[dept] || {};
            const target = cfg.YearlyTarget || 12;
            const submitted = yearlyMap[dept] || 0;
            let units = [];
            try { units = cfg.SafetyUnits ? JSON.parse(cfg.SafetyUnits) : []; } catch { units = []; }
            return {
                department: dept,
                submitted,
                target,
                pct: target > 0 ? Math.min(100, Math.round(submitted / target * 100)) : 0,
                safetyUnits: units,
                deadlineDay: cfg.DeadlineDay || 15,
                deadlineNote: cfg.DeadlineNote || null,
            };
        });

        const submittedDepts = targetDepts.filter(d => (yearlyMap[d] || 0) > 0);

        res.json({
            success: true,
            data: {
                kpi: {
                    total:         kpi.total         || 0,
                    deptSubmitted: submittedDepts.length,
                    totalDepts:    targetDepts.length,
                    pendingDepts:  Math.max(0, targetDepts.length - submittedDepts.length),
                    completionRate: targetDepts.length > 0
                        ? Math.round((submittedDepts.length / targetDepts.length) * 100) : 0,
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
                programProgress,
                topKeywords,
                usingConfig,
            }
        });
    } catch (error) {
        console.error('KY stats error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลสถิติได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHECK — yearly progress for a department
// ─────────────────────────────────────────────────────────────────────────────
router.get('/check', async (req, res) => {
    try {
        await ensureTables();
        const { dept, year } = req.query;
        if (!dept || !year) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ dept, year' });
        }

        const y = parseInt(year);

        // Get target from program config
        const [cfgRows] = await db.query(
            `SELECT YearlyTarget FROM KY_Program_Config WHERE Year = ? AND Department = ? AND IsActive = 1 LIMIT 1`,
            [y, dept]
        );
        const target = cfgRows[0]?.YearlyTarget || 12;

        const [rows] = await db.query(
            `SELECT COUNT(*) AS cnt FROM KY_Activities
             WHERE Department = ? AND YEAR(ActivityDate) = ?`,
            [dept, y]
        );
        const count = rows[0]?.cnt || 0;

        // Check if already submitted this month
        const now = new Date();
        const [monthRows] = await db.query(
            `SELECT id FROM KY_Activities
             WHERE Department = ? AND MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ?
             LIMIT 1`,
            [dept, now.getMonth() + 1, y]
        );
        const submittedThisMonth = monthRows.length > 0;

        res.json({
            success: true,
            count,
            target,
            submittedThisMonth,
            yearlyDone:    count,          // actual yearly count (number, not boolean)
            yearlyTarget:  target,
            isYearlyFull:  count >= target,
            data: monthRows[0] || null,
        });
    } catch (error) {
        console.error('KY check error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAM CONFIG — CRUD (must be BEFORE /:id routes)
// ─────────────────────────────────────────────────────────────────────────────

// GET list for year
router.get('/program-config', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const [rows] = await db.query(
            `SELECT * FROM KY_Program_Config WHERE Year = ? ORDER BY Department`,
            [year]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('KY program-config GET error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลได้' });
    }
});

// POST batch upsert — body: { year, entries: [{department, safetyUnits:[], yearlyTarget, deadlineDay, deadlineNote}] }
router.post('/program-config', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { year, entries } = req.body;
        if (!year || !Array.isArray(entries) || !entries.length) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ year และ entries' });
        }
        const y = parseInt(year);
        let created = 0, updated = 0;

        for (const entry of entries) {
            const { department, safetyUnits, yearlyTarget, deadlineDay, deadlineNote } = entry;
            if (!department) continue;

            const units = Array.isArray(safetyUnits) ? JSON.stringify(safetyUnits) : (safetyUnits || null);
            const target = parseInt(yearlyTarget) || 12;
            const dDay   = parseInt(deadlineDay) || 15;
            const note   = (deadlineNote || '').trim() || null;

            // Check existing
            const [exist] = await db.query(
                `SELECT id FROM KY_Program_Config WHERE Year = ? AND Department = ?`,
                [y, department]
            );
            if (exist.length) {
                await db.query(
                    `UPDATE KY_Program_Config
                     SET SafetyUnits=?, YearlyTarget=?, DeadlineDay=?, DeadlineNote=?, IsActive=1, CreatedBy=?
                     WHERE Year=? AND Department=?`,
                    [units, target, dDay, note, req.user.id, y, department]
                );
                updated++;
            } else {
                await db.query(
                    `INSERT INTO KY_Program_Config (Year, Department, SafetyUnits, YearlyTarget, DeadlineDay, DeadlineNote, IsActive, CreatedBy)
                     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
                    [y, department, units, target, dDay, note, req.user.id]
                );
                created++;
            }
        }

        res.json({ success: true, message: `บันทึกสำเร็จ (เพิ่ม ${created}, อัปเดต ${updated})` });
    } catch (error) {
        console.error('KY program-config POST error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกได้' });
    }
});

// PUT update single entry
router.put('/program-config/:cfgId', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { cfgId } = req.params;
        const id = parseInt(cfgId);
        if (!id || id <= 0) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });

        const [rows] = await db.query('SELECT id FROM KY_Program_Config WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });

        const { safetyUnits, yearlyTarget, deadlineDay, deadlineNote, isActive } = req.body;
        const fields = [];
        const vals   = [];

        if (safetyUnits !== undefined) {
            const units = Array.isArray(safetyUnits) ? JSON.stringify(safetyUnits) : (safetyUnits || null);
            fields.push('SafetyUnits = ?'); vals.push(units);
        }
        if (yearlyTarget !== undefined) { fields.push('YearlyTarget = ?'); vals.push(parseInt(yearlyTarget) || 12); }
        if (deadlineDay  !== undefined) { fields.push('DeadlineDay = ?');  vals.push(parseInt(deadlineDay) || 15); }
        if (deadlineNote !== undefined) { fields.push('DeadlineNote = ?'); vals.push((deadlineNote || '').trim() || null); }
        if (isActive     !== undefined) { fields.push('IsActive = ?');     vals.push(isActive ? 1 : 0); }

        if (!fields.length) return res.json({ success: true, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });

        vals.push(id);
        await db.query(`UPDATE KY_Program_Config SET ${fields.join(', ')} WHERE id = ?`, vals);
        res.json({ success: true, message: 'อัปเดตสำเร็จ' });
    } catch (error) {
        console.error('KY program-config PUT error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตได้' });
    }
});

// DELETE single entry
router.delete('/program-config/:cfgId', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const id = parseInt(req.params.cfgId);
        if (!id || id <= 0) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });

        const [rows] = await db.query('SELECT id, Department FROM KY_Program_Config WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });

        await db.query('DELETE FROM KY_Program_Config WHERE id = ?', [id]);
        res.json({ success: true, message: `ลบ "${rows[0].Department}" ออกจากโปรแกรม KY สำเร็จ` });
    } catch (error) {
        console.error('KY program-config DELETE error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        await ensureTables();
        const { status, dept, risk, year, month, q, depts, dateFrom, dateTo } = req.query;

        let sql = 'SELECT * FROM KY_Activities WHERE 1=1';
        const params = [];

        if (status && status !== 'all') { sql += ' AND Status = ?'; params.push(status); }

        // Single dept filter OR multi-dept (comma-separated) for program-config scoping
        if (dept && dept !== 'all') {
            sql += ' AND Department = ?'; params.push(dept);
        } else if (depts) {
            const deptList = depts.split(',').map(d => d.trim()).filter(Boolean);
            if (deptList.length) {
                sql += ` AND Department IN (${deptList.map(() => '?').join(',')})`;
                params.push(...deptList);
            }
        }

        if (risk  && risk  !== 'all') { sql += ' AND RiskCategory = ?'; params.push(risk); }
        // Date range overrides year/month when provided
        if (dateFrom && dateTo) {
            sql += ' AND ActivityDate BETWEEN ? AND ?'; params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            sql += ' AND ActivityDate >= ?'; params.push(dateFrom);
        } else if (dateTo) {
            sql += ' AND ActivityDate <= ?'; params.push(dateTo);
        } else {
            if (year)  { sql += ' AND YEAR(ActivityDate) = ?'; params.push(parseInt(year)); }
            if (month) { sql += ' AND MONTH(ActivityDate) = ?'; params.push(parseInt(month)); }
        }
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

        const date  = ActivityDate || new Date().toISOString().split('T')[0];
        const year  = new Date(date).getFullYear();
        const dept  = req.user.department;

        // Check yearly limit against program config target
        const [cfgRows] = await db.query(
            `SELECT YearlyTarget FROM KY_Program_Config WHERE Year = ? AND Department = ? AND IsActive = 1 LIMIT 1`,
            [year, dept]
        );
        const target = cfgRows[0]?.YearlyTarget || 12;

        const [[{ cnt }]] = await db.query(
            `SELECT COUNT(*) AS cnt FROM KY_Activities
             WHERE Department = ? AND YEAR(ActivityDate) = ?`,
            [dept, year]
        );
        if (cnt >= target) {
            return res.status(409).json({
                success: false,
                message: `แผนก "${dept}" ส่งกิจกรรม KY ครบเป้าหมายแล้ว (${cnt}/${target} เรื่อง/ปี)`
            });
        }

        // Check 1 per month
        const month = new Date(date).getMonth() + 1;
        const [monthCheck] = await db.query(
            `SELECT id FROM KY_Activities
             WHERE Department = ? AND MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ?
             LIMIT 1`,
            [dept, month, year]
        );
        if (monthCheck.length > 0) {
            return res.status(409).json({
                success: false,
                message: `แผนก "${dept}" ส่งกิจกรรม KY สำหรับเดือนนี้แล้ว (1 เดือน / 1 เรื่อง)`
            });
        }

        const VALID_RISK = ['ทั่วไป','สภาพแวดล้อม','เครื่องจักร','พฤติกรรม','เคมี','ไฟฟ้า','อื่นๆ'];
        const safeRisk   = VALID_RISK.includes(RiskCategory) ? RiskCategory : 'ทั่วไป';

        let participantsStr = null;
        if (Participants) {
            try {
                JSON.parse(Participants);
                participantsStr = Participants;
            } catch {
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
                randomUUID(), date,
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

        res.status(201).json({
            success: true,
            message: `ส่งกิจกรรม KY สำเร็จ (${cnt + 1}/${target} เรื่องในปีนี้)`
        });
    } catch (error) {
        console.error('KY submit error:', error);
        if (error.status === 409) return res.status(409).json(error);
        res.status(500).json({ success: false, message: 'ไม่สามารถส่งกิจกรรม KY ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE (Admin)
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
            RiskCategory, HazardDescription, Countermeasure, Participants, ActivityDate
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

        const fields = [];
        const vals   = [];

        if (Status !== undefined)            { fields.push('Status = ?');            vals.push(Status); }
        if (AdminComment !== undefined)      { fields.push('AdminComment = ?');       vals.push(AdminComment); }
        if (TeamName !== undefined)          { fields.push('TeamName = ?');           vals.push(TeamName); }
        if (KYTKeyword !== undefined)        { fields.push('KYTKeyword = ?');         vals.push(KYTKeyword); }
        if (safeRisk !== undefined)          { fields.push('RiskCategory = ?');       vals.push(safeRisk); }
        if (HazardDescription !== undefined) { fields.push('HazardDescription = ?'); vals.push(HazardDescription); }
        if (Countermeasure !== undefined)    { fields.push('Countermeasure = ?');     vals.push(Countermeasure); }
        if (participantsStr !== undefined)   { fields.push('Participants = ?');       vals.push(participantsStr); }
        if (ActivityDate !== undefined)      { fields.push('ActivityDate = ?');       vals.push(ActivityDate); }
        if (newAttachment)                   { fields.push('AttachmentUrl = ?');      vals.push(newAttachment); }
        if (newVideo)                        { fields.push('VideoUrl = ?');           vals.push(newVideo); }

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
