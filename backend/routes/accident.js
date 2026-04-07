// backend/routes/accident.js
// Auth (authenticateToken) applied at mount level in server.js
// Write operations require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin }                        = require('../middleware/auth');
const { storage, fileFilter, cloudinary, isLocal } = require('../cloudinary');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// Accident attachments: images + PDF only (tighter than global fileFilter)
const accFileFilter = (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('ไฟล์แนบต้องเป็นรูปภาพหรือ PDF เท่านั้น'), false);
    }
};

// Multer: up to 10 files, 20 MB each
const upload = multer({
    storage,
    fileFilter: accFileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
}).array('files', 10);

// Wrap multer in a promise so we can await it inside async routes
function runUpload(req, res) {
    return new Promise((resolve, reject) =>
        upload(req, res, err => (err ? reject(err) : resolve()))
    );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
// Validate & parse integer route params; returns null if invalid
function parseId(val) {
    const n = parseInt(val, 10);
    return isNaN(n) || n < 1 ? null : n;
}
// Trim a string value from req.body (null-safe)
const s = v => (v != null && typeof v === 'string') ? v.trim() : v;

// ─── ENSURE TABLES ────────────────────────────────────────────────────────────
let tableReady = false;
async function ensureTable() {
    if (tableReady) return;

    // Core table
    await db.query(`
        CREATE TABLE IF NOT EXISTS Accident_Reports (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            ReportDate       DATE         NOT NULL,
            AccidentDate     DATE         NOT NULL,
            AccidentTime     TIME         DEFAULT NULL,
            EmployeeID       VARCHAR(50)  NOT NULL,
            Department       VARCHAR(100) DEFAULT NULL,
            Area             VARCHAR(100) DEFAULT NULL,
            AccidentType     VARCHAR(50)  NOT NULL,
            Severity         VARCHAR(30)  DEFAULT 'Minor',
            Description      TEXT,
            RootCause        VARCHAR(100) DEFAULT NULL,
            RootCauseDetail  TEXT,
            CorrectiveAction TEXT,
            LostDays         INT          DEFAULT 0,
            IsRecordable     TINYINT(1)   DEFAULT 0,
            Status           VARCHAR(20)  DEFAULT 'Open',
            ReportedBy       VARCHAR(100) DEFAULT NULL,
            CreatedBy        VARCHAR(100),
            CreatedAt        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_dept (Department),
            KEY idx_date (AccidentDate),
            KEY idx_type (AccidentType),
            KEY idx_emp  (EmployeeID)
        )
    `);

    // Migrate new columns (try/catch per column — safe for existing tables)
    const migrate = [
        "ALTER TABLE Accident_Reports ADD COLUMN Location         VARCHAR(200) DEFAULT NULL",
        "ALTER TABLE Accident_Reports ADD COLUMN Position         VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE Accident_Reports ADD COLUMN EmploymentType   VARCHAR(50)  DEFAULT NULL",
        "ALTER TABLE Accident_Reports ADD COLUMN InjuryType       VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE Accident_Reports ADD COLUMN BodyPart         VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE Accident_Reports ADD COLUMN MedicalTreatment TEXT",
        "ALTER TABLE Accident_Reports ADD COLUMN ImmediateCause   TEXT",
        "ALTER TABLE Accident_Reports ADD COLUMN UnsafeAct        TEXT",
        "ALTER TABLE Accident_Reports ADD COLUMN UnsafeCondition  TEXT",
        "ALTER TABLE Accident_Reports ADD COLUMN PreventiveAction TEXT",
        "ALTER TABLE Accident_Reports ADD COLUMN ResponsiblePerson VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE Accident_Reports ADD COLUMN DueDate          DATE         DEFAULT NULL",
    ];
    for (const sql of migrate) {
        try { await db.query(sql); } catch (_) { /* column already exists */ }
    }

    // Safety Performance table
    await db.query(`
        CREATE TABLE IF NOT EXISTS Accident_Performance (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            Year             INT          NOT NULL,
            TotalHours       INT          DEFAULT 0,
            TotalDays        INT          DEFAULT 0,
            LastAccidentDate DATE         DEFAULT NULL,
            TargetHours      INT          DEFAULT 1000000,
            TargetDays       INT          DEFAULT 365,
            MonthlyStatus    JSON         DEFAULT NULL,
            UpdatedBy        VARCHAR(100) DEFAULT NULL,
            UpdatedAt        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_year (Year)
        )
    `);

    // Attachments table
    await db.query(`
        CREATE TABLE IF NOT EXISTS Accident_Attachments (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            AccidentID  INT          NOT NULL,
            FileName    VARCHAR(255) NOT NULL,
            FileURL     VARCHAR(500) NOT NULL,
            PublicID    VARCHAR(255) DEFAULT NULL,
            FileType    VARCHAR(100) DEFAULT NULL,
            FileSize    INT          DEFAULT NULL,
            UploadedBy  VARCHAR(100) DEFAULT NULL,
            UploadedAt  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            KEY idx_accident (AccidentID)
        )
    `);

    tableReady = true;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// Save req.files (after multer) to Accident_Attachments
async function saveAttachments(files, accidentId, uploaderName) {
    if (!files || files.length === 0) return;
    for (const f of files) {
        const fileUrl  = f.path;                      // Cloudinary URL or /uploads/...
        const publicId = f.filename || null;          // Cloudinary public_id (incl. folder)
        await db.query(
            `INSERT INTO Accident_Attachments
             (AccidentID, FileName, FileURL, PublicID, FileType, FileSize, UploadedBy)
             VALUES (?,?,?,?,?,?,?)`,
            [accidentId, f.originalname, fileUrl, publicId, f.mimetype, f.size || null, uploaderName]
        );
    }
}

// ─── GET /api/accident/reports ────────────────────────────────────────────────
router.get('/reports', async (req, res) => {
    try {
        await ensureTable();
        const { year, department, type, status } = req.query;

        let sql = `
            SELECT r.*,
                   e.EmployeeName, e.Team,
                   (SELECT COUNT(*) FROM Accident_Attachments WHERE AccidentID = r.id) AS AttachmentCount
            FROM   Accident_Reports r
            LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
            WHERE  1=1
        `;
        const params = [];
        if (year)       { sql += ' AND YEAR(r.AccidentDate) = ?'; params.push(year); }
        if (department) { sql += ' AND r.Department = ?';          params.push(department); }
        if (type)       { sql += ' AND r.AccidentType = ?';        params.push(type); }
        if (status)     { sql += ' AND r.Status = ?';              params.push(status); }
        sql += ' ORDER BY r.AccidentDate DESC, r.id DESC';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/accident/reports/:id  (must be declared BEFORE bulk routes) ──────
router.get('/reports/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });
    try {
        await ensureTable();
        const [[report]] = await db.query(
            `SELECT r.*, e.EmployeeName, e.Team
             FROM   Accident_Reports r
             LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
             WHERE  r.id = ?`,
            [id]
        );
        if (!report) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });

        const [attachments] = await db.query(
            'SELECT * FROM Accident_Attachments WHERE AccidentID = ? ORDER BY UploadedAt ASC',
            [id]
        );
        res.json({ success: true, data: { ...report, attachments } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/accident/summary?year= ──────────────────────────────────────────
router.get('/summary', async (req, res) => {
    try {
        await ensureTable();
        const year = parseInt(req.query.year) || null;
        const yf   = year ? `AND YEAR(AccidentDate) = ${year}` : '';

        const [kpi] = await db.query(`
            SELECT
                COUNT(*)                                     AS total,
                COALESCE(SUM(IsRecordable), 0)               AS recordable,
                COALESCE(SUM(LostDays), 0)                   AS lostDays,
                COALESCE(SUM(AccidentType = 'Near Miss'), 0) AS nearMiss,
                COALESCE(SUM(AccidentType = 'Fatal'), 0)     AS fatal
            FROM Accident_Reports WHERE 1=1 ${yf}
        `);

        const [lastRec] = await db.query(`
            SELECT AccidentDate FROM Accident_Reports
            WHERE IsRecordable = 1
            ORDER BY AccidentDate DESC LIMIT 1
        `);
        let daysSince = null;
        if (lastRec[0]) {
            daysSince = Math.floor((Date.now() - new Date(lastRec[0].AccidentDate).getTime()) / 86400000);
        }

        const trendSql = year
            ? `SELECT MONTH(AccidentDate) AS mo, COUNT(*) AS total,
                      SUM(IsRecordable) AS recordable, SUM(LostDays) AS lostDays
               FROM Accident_Reports WHERE YEAR(AccidentDate) = ${year}
               GROUP BY MONTH(AccidentDate) ORDER BY mo`
            : `SELECT DATE_FORMAT(AccidentDate,'%Y-%m') AS period,
                      COUNT(*) AS total, SUM(IsRecordable) AS recordable, SUM(LostDays) AS lostDays
               FROM Accident_Reports
               WHERE AccidentDate >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
               GROUP BY period ORDER BY period`;
        const [trend] = await db.query(trendSql);

        const [byType] = await db.query(`
            SELECT AccidentType, COUNT(*) AS cnt
            FROM Accident_Reports WHERE 1=1 ${yf}
            GROUP BY AccidentType ORDER BY cnt DESC
        `);

        const [byDept] = await db.query(`
            SELECT Department,
                   COUNT(*)                       AS total,
                   COALESCE(SUM(IsRecordable), 0) AS recordable,
                   COALESCE(SUM(LostDays), 0)     AS lostDays
            FROM Accident_Reports
            WHERE Department IS NOT NULL AND Department <> '' ${yf}
            GROUP BY Department
            ORDER BY total DESC, recordable DESC
            LIMIT 10
        `);

        res.json({ success: true, data: { kpi: kpi[0], daysSince, trend, byType, byDept } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/accident/analytics?year= ────────────────────────────────────────
router.get('/analytics', async (req, res) => {
    try {
        await ensureTable();
        const year = parseInt(req.query.year) || null;
        const yf   = year ? `AND YEAR(AccidentDate) = ${year}` : '';

        const [deptRank] = await db.query(`
            SELECT Department,
                   COUNT(*)                      AS total,
                   SUM(IsRecordable)             AS recordable,
                   SUM(LostDays)                 AS lostDays,
                   SUM(AccidentType='Near Miss') AS nearMiss,
                   SUM(AccidentType='Fatal')     AS fatal,
                   SUM(Severity='Critical')      AS critical
            FROM Accident_Reports
            WHERE Department IS NOT NULL AND Department <> '' ${yf}
            GROUP BY Department
            ORDER BY (SUM(IsRecordable)*3 + SUM(LostDays)*2 + COUNT(*)) DESC
            LIMIT 10
        `);

        const [hotspot] = await db.query(`
            SELECT COALESCE(Area,'(ไม่ระบุ)') AS area, COUNT(*) AS cnt,
                   SUM(IsRecordable) AS recordable, SUM(LostDays) AS lostDays
            FROM Accident_Reports WHERE 1=1 ${yf}
            GROUP BY Area ORDER BY cnt DESC LIMIT 8
        `);

        const [rootCauses] = await db.query(`
            SELECT COALESCE(RootCause,'(ไม่ระบุ)') AS cause, COUNT(*) AS cnt
            FROM Accident_Reports WHERE 1=1 ${yf}
            GROUP BY RootCause ORDER BY cnt DESC LIMIT 8
        `);

        res.json({ success: true, data: { deptRank, hotspot, rootCauses } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/accident/reports (admin) ───────────────────────────────────────
router.post('/reports', isAdmin, async (req, res) => {
    try {
        await ensureTable();
        await runUpload(req, res);
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
    try {
        const {
            ReportDate, AccidentDate, AccidentTime, EmployeeID,
            Area, Location, AccidentType, Severity, Description,
            RootCause, RootCauseDetail, ImmediateCause, UnsafeAct, UnsafeCondition,
            CorrectiveAction, PreventiveAction, LostDays, IsRecordable, Status,
            ReportedBy, InjuryType, BodyPart, MedicalTreatment,
            Position, EmploymentType, ResponsiblePerson, DueDate,
        } = req.body;

        if (!s(ReportDate) || !s(AccidentDate) || !s(EmployeeID) || !s(AccidentType)) {
            return res.status(400).json({
                success: false,
                message: 'กรุณากรอกข้อมูลให้ครบ (วันที่รายงาน / วันที่เกิดเหตุ / รหัสพนักงาน / ประเภท)',
            });
        }

        const empId = s(EmployeeID);
        const [empRows] = await db.query(
            'SELECT EmployeeID, Department, Position AS EmpPosition FROM Employees WHERE EmployeeID = ?',
            [empId]
        );
        if (empRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: `ไม่พบรหัสพนักงาน "${empId}" ใน Employee Master Data`,
            });
        }

        const department  = empRows[0].Department   || null;
        const empPosition = s(Position) || empRows[0].EmpPosition || null;

        const [result] = await db.query(
            `INSERT INTO Accident_Reports
             (ReportDate, AccidentDate, AccidentTime, EmployeeID, Department, Area, Location,
              AccidentType, Severity, Description,
              RootCause, RootCauseDetail, ImmediateCause, UnsafeAct, UnsafeCondition,
              CorrectiveAction, PreventiveAction,
              LostDays, IsRecordable, Status, ReportedBy, CreatedBy,
              InjuryType, BodyPart, MedicalTreatment,
              Position, EmploymentType, ResponsiblePerson, DueDate)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                s(ReportDate), s(AccidentDate), s(AccidentTime) || null,
                empId, department, s(Area) || null, s(Location) || null,
                s(AccidentType), s(Severity) || 'Minor',
                s(Description) || '',
                s(RootCause) || null, s(RootCauseDetail) || '',
                s(ImmediateCause) || null, s(UnsafeAct) || null, s(UnsafeCondition) || null,
                s(CorrectiveAction) || '', s(PreventiveAction) || null,
                parseInt(LostDays) || 0, IsRecordable ? 1 : 0,
                s(Status) || 'Open',
                s(ReportedBy) || req.user.name, req.user.name,
                s(InjuryType) || null, s(BodyPart) || null, s(MedicalTreatment) || null,
                empPosition, s(EmploymentType) || null,
                s(ResponsiblePerson) || null, s(DueDate) || null,
            ]
        );

        await saveAttachments(req.files, result.insertId, req.user.name);
        res.json({ success: true, message: 'บันทึกรายงานอุบัติเหตุสำเร็จ', id: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/accident/reports/:id (admin) ────────────────────────────────────
router.put('/reports/:id', isAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });
    try {
        await runUpload(req, res);
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
    try {
        const {
            ReportDate, AccidentDate, AccidentTime, EmployeeID,
            Area, Location, AccidentType, Severity, Description,
            RootCause, RootCauseDetail, ImmediateCause, UnsafeAct, UnsafeCondition,
            CorrectiveAction, PreventiveAction, LostDays, IsRecordable, Status,
            ReportedBy, InjuryType, BodyPart, MedicalTreatment,
            Position, EmploymentType, ResponsiblePerson, DueDate,
        } = req.body;

        if (!s(ReportDate) || !s(AccidentDate) || !s(EmployeeID) || !s(AccidentType)) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ' });
        }

        const empId = s(EmployeeID);
        const [empRows] = await db.query(
            'SELECT EmployeeID, Department FROM Employees WHERE EmployeeID = ?',
            [empId]
        );
        if (empRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: `ไม่พบรหัสพนักงาน "${empId}" ใน Employee Master Data`,
            });
        }

        // Verify the report exists (ownership check)
        const [[existing]] = await db.query('SELECT id FROM Accident_Reports WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });

        const department = empRows[0].Department || null;

        await db.query(
            `UPDATE Accident_Reports SET
                ReportDate=?, AccidentDate=?, AccidentTime=?,
                EmployeeID=?, Department=?, Area=?, Location=?,
                AccidentType=?, Severity=?, Description=?,
                RootCause=?, RootCauseDetail=?, ImmediateCause=?, UnsafeAct=?, UnsafeCondition=?,
                CorrectiveAction=?, PreventiveAction=?,
                LostDays=?, IsRecordable=?, Status=?, ReportedBy=?,
                InjuryType=?, BodyPart=?, MedicalTreatment=?,
                Position=?, EmploymentType=?, ResponsiblePerson=?, DueDate=?
             WHERE id=?`,
            [
                s(ReportDate), s(AccidentDate), s(AccidentTime) || null,
                empId, department, s(Area) || null, s(Location) || null,
                s(AccidentType), s(Severity) || 'Minor',
                s(Description) || '',
                s(RootCause) || null, s(RootCauseDetail) || '',
                s(ImmediateCause) || null, s(UnsafeAct) || null, s(UnsafeCondition) || null,
                s(CorrectiveAction) || '', s(PreventiveAction) || null,
                parseInt(LostDays) || 0, IsRecordable ? 1 : 0,
                s(Status) || 'Open', s(ReportedBy) || req.user.name,
                s(InjuryType) || null, s(BodyPart) || null, s(MedicalTreatment) || null,
                s(Position) || null, s(EmploymentType) || null,
                s(ResponsiblePerson) || null, s(DueDate) || null,
                id,
            ]
        );

        // Append any new files (does not remove existing ones)
        await saveAttachments(req.files, id, req.user.name);
        res.json({ success: true, message: 'อัปเดตรายงานอุบัติเหตุสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /api/accident/reports/:id (admin) ─────────────────────────────────
router.delete('/reports/:id', isAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });
    try {
        const [[existing]] = await db.query('SELECT id FROM Accident_Reports WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });

        // Delete associated attachments first (cloud + DB)
        const [atts] = await db.query(
            'SELECT * FROM Accident_Attachments WHERE AccidentID = ?', [id]
        );
        for (const att of atts) {
            await _destroyFile(att);
        }
        await db.query('DELETE FROM Accident_Attachments WHERE AccidentID = ?', [id]);
        await db.query('DELETE FROM Accident_Reports WHERE id = ?', [id]);
        res.json({ success: true, message: 'ลบรายงานสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /api/accident/attachments/:id (admin) ────────────────────────────
router.delete('/attachments/:id', isAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });
    try {
        const [[att]] = await db.query(
            'SELECT * FROM Accident_Attachments WHERE id = ?', [id]
        );
        if (!att) return res.status(404).json({ success: false, message: 'ไม่พบไฟล์' });

        await _destroyFile(att);
        await db.query('DELETE FROM Accident_Attachments WHERE id = ?', [id]);
        res.json({ success: true, message: 'ลบไฟล์สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Destroy a file from Cloudinary or local disk; errors are non-fatal
async function _destroyFile(att) {
    try {
        if (att.FileURL && att.FileURL.startsWith('https://res.cloudinary.com')) {
            // PublicID stored by multer-storage-cloudinary (includes folder)
            const resType = att.FileType?.startsWith('image/') ? 'image' : 'raw';
            if (att.PublicID) {
                await cloudinary.uploader.destroy(att.PublicID, { resource_type: resType });
            }
        } else if (isLocal && att.FileURL) {
            // Local: /uploads/filename → backend/uploads/filename
            const absPath = path.join(__dirname, '..', 'uploads', path.basename(att.FileURL));
            if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
        }
    } catch (_) { /* non-fatal */ }
}

// ─── GET /api/accident/performance?year= ─────────────────────────────────────
router.get('/performance', async (req, res) => {
    try {
        await ensureTable();
        const year = parseInt(req.query.year) || new Date().getFullYear();

        const [[row]] = await db.query(
            'SELECT * FROM Accident_Performance WHERE Year = ?', [year]
        );

        // Recordable count from Accident_Reports — used to compute Zero Accident status
        const [[kpi]] = await db.query(
            `SELECT COALESCE(SUM(IsRecordable), 0) AS recordable
             FROM Accident_Reports WHERE YEAR(AccidentDate) = ?`,
            [year]
        );

        const record = row || {
            Year:            year,
            TotalHours:      0,
            TotalDays:       0,
            LastAccidentDate: null,
            TargetHours:     1000000,
            TargetDays:      365,
            MonthlyStatus:   null,
            UpdatedBy:       null,
        };

        res.json({
            success: true,
            data: { ...record, recordableCount: parseInt(kpi.recordable) || 0 },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/accident/performance (admin) ────────────────────────────────────
router.put('/performance', isAdmin, async (req, res) => {
    try {
        await ensureTable();
        const {
            Year, TotalHours, TotalDays, LastAccidentDate,
            TargetHours, TargetDays, MonthlyStatus,
        } = req.body;

        const year = parseInt(Year) || new Date().getFullYear();

        // Accept MonthlyStatus as string (JSON) or object
        let monthlyJson = null;
        if (MonthlyStatus != null && MonthlyStatus !== '') {
            monthlyJson = typeof MonthlyStatus === 'string'
                ? MonthlyStatus
                : JSON.stringify(MonthlyStatus);
        }

        await db.query(`
            INSERT INTO Accident_Performance
                (Year, TotalHours, TotalDays, LastAccidentDate,
                 TargetHours, TargetDays, MonthlyStatus, UpdatedBy)
            VALUES (?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
                TotalHours       = VALUES(TotalHours),
                TotalDays        = VALUES(TotalDays),
                LastAccidentDate = VALUES(LastAccidentDate),
                TargetHours      = VALUES(TargetHours),
                TargetDays       = VALUES(TargetDays),
                MonthlyStatus    = VALUES(MonthlyStatus),
                UpdatedBy        = VALUES(UpdatedBy)
        `, [
            year,
            parseInt(TotalHours)  || 0,
            parseInt(TotalDays)   || 0,
            s(LastAccidentDate)   || null,
            parseInt(TargetHours) || 1000000,
            parseInt(TargetDays)  || 365,
            monthlyJson,
            req.user.name,
        ]);

        res.json({ success: true, message: 'บันทึกข้อมูล Safety Performance สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/accident/employees?q= ──────────────────────────────────────────
router.get('/employees', async (req, res) => {
    try {
        const q = req.query.q || '';
        let sql = `SELECT EmployeeID, EmployeeName, Department, Team, Position
                   FROM Employees WHERE 1=1`;
        const params = [];
        if (q) {
            sql += ' AND (EmployeeID LIKE ? OR EmployeeName LIKE ?)';
            params.push(`%${q}%`, `%${q}%`);
        }
        sql += ' ORDER BY EmployeeName ASC LIMIT 50';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
