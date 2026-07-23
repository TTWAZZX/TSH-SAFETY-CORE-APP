// backend/routes/accident.js
// Auth (authenticateToken) applied at mount level in server.js
// Write operations require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin }                        = require('../middleware/auth');
const { storage, deleteLocalUpload, cleanOriginalFilename } = require('../storage');
const { ensureAuditTable, logAudit } = require('../utils/audit');
const multer  = require('multer');

const accidentFileTypes = new Map([
    ['image/jpeg', new Set(['jpg', 'jpeg'])],
    ['image/png', new Set(['png'])],
    ['image/webp', new Set(['webp'])],
    ['image/gif', new Set(['gif'])],
    ['application/pdf', new Set(['pdf'])],
]);

// Accident attachments: verified raster-image/PDF MIME + extension pairs only.
const accFileFilter = (_req, file, cb) => {
    const ext = String(file.originalname || '').split('.').pop().toLowerCase();
    const accepted = Boolean(accidentFileTypes.get(file.mimetype)?.has(ext));
    cb(accepted ? null : new Error('ไฟล์แนบต้องเป็น JPG, PNG, WEBP, GIF หรือ PDF เท่านั้น'), accepted);
};

// Multer: up to 10 files, 20 MB each
const upload = multer({
    storage,
    fileFilter: accFileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
}).array('files', 10);

const monthlyFileTypes = new Map([
    ['application/pdf', new Set(['pdf'])],
    ['application/msword', new Set(['doc'])],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', new Set(['docx'])],
    ['application/vnd.ms-excel', new Set(['xls'])],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Set(['xlsx'])],
]);
const monthlyUpload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
        const ext = String(file.originalname || '').split('.').pop().toLowerCase();
        const allowed = monthlyFileTypes.get(file.mimetype);
        const accepted = Boolean(allowed?.has(ext));
        cb(accepted ? null : new Error('ไฟล์รายงานต้องเป็น PDF, Word หรือ Excel เท่านั้น'), accepted);
    },
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
}).single('reportFile');

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

const MODULE = 'accident';
const ACCIDENT_TYPES = new Set(['Near Miss', 'First Aid', 'Medical Treatment', 'Lost Time', 'Fatal']);
const EXCLUDED_STATS_TYPES = ["Near Miss", "First Aid"];
const INVESTIGATION_STATUSES = new Set(['Reported', 'Under Investigation', 'CAPA Assigned', 'Verified', 'Closed']);
const POTENTIAL_SEVERITIES = new Set(['Low', 'Medium', 'High', 'Critical']);
const STATS_ACCIDENT_CONDITION = `
    AccidentType NOT IN ('Near Miss', 'First Aid')
    AND (
        AccidentType IN ('Medical Treatment', 'Lost Time', 'Fatal')
        OR Severity = 'Critical'
        OR IsRecordable = 1
        OR LostDays > 0
    )
`;

function userName(req) {
    const u = req.user || {};
    return u.name || u.EmployeeName || u.employeeName || u.id || u.EmployeeID || 'System';
}

function runMonthlyUpload(req, res) {
    return new Promise((resolve, reject) =>
        monthlyUpload(req, res, err => (err ? reject(err) : resolve()))
    );
}

function normalizeYear(value, fallback = null) {
    if (value == null || value === '') return fallback;
    const n = Number.parseInt(value, 10);
    const current = new Date().getFullYear();
    if (!Number.isInteger(n) || n < 2000 || n > current + 5) return fallback;
    return n;
}

function daysInYear(year) {
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    return Math.round((end - start) / 86400000);
}

function accidentFreeDaysForYear(year, lastAccidentDate = null) {
    const now = new Date();
    const currentYear = now.getFullYear();
    if (year > currentYear) return 0;

    const end = year < currentYear
        ? new Date(year, 11, 31)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = lastAccidentDate
        ? new Date(lastAccidentDate)
        : new Date(year, 0, 1);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (start > end) return 0;
    return Math.min(daysInYear(year), Math.max(0, Math.floor((end - start) / 86400000) + 1));
}

function nonNegativeInt(value, fallback = 0, max = 999999999) {
    if (value == null || value === '') return fallback;
    const n = Number.parseInt(value, 10);
    if (!Number.isInteger(n) || n < 0) return fallback;
    return Math.min(n, max);
}

function nonNegativeNumber(value, fallback = 0, max = 999999999999) {
    if (value == null || value === '') return fallback;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(n, max);
}

function boolFlag(value) {
    if (value === true || value === 1) return 1;
    const v = String(value ?? '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(v) ? 1 : 0;
}

function percentValue(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return Number(n.toFixed(3));
}

function parseJsonObject(value, fallback = {}) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value && !Array.isArray(value) ? value : fallback;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch (_) {
        return fallback;
    }
}

function sanitizeMonthlyNumbers(value) {
    const raw = parseJsonObject(value, {});
    const clean = {};
    for (let i = 1; i <= 12; i++) {
        const key = String(i);
        const n = nonNegativeNumber(raw[key], 0);
        if (n > 0) clean[key] = Number(n.toFixed(2));
    }
    return clean;
}

function buildNearMissDetails(body) {
    if (s(body.AccidentType) !== 'Near Miss') return null;
    const fields = [
        'NearMissNo', 'NearMissWorkType', 'NearMissPhone', 'NearMissShift',
        'NearMissWorkingOn', 'NearMissEvent', 'NearMissImprovementPoint',
        'NearMissLayoutNote', 'NearMissEventTitle',
        'NearMissHazardFinding', 'NearMissRelatedPeople', 'NearMissCAPA',
        'NearMissRootCause',
    ];
    const details = {};
    for (const key of fields) {
        const value = s(body[key]);
        if (key === 'NearMissRelatedPeople' && value) {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed) && parsed.length) {
                    details[key] = parsed
                        .filter(p => p && (p.EmployeeID || p.EmployeeName))
                        .map(p => ({
                            EmployeeID: s(p.EmployeeID) || '',
                            EmployeeName: s(p.EmployeeName) || '',
                            Position: s(p.Position) || '',
                            Department: s(p.Department) || '',
                        }));
                    continue;
                }
            } catch (_) {
                // Keep legacy free-text Near Miss records readable.
            }
        }
        if (value) details[key] = value;
    }
    return Object.keys(details).length ? details : null;
}

function normalizeInvestigationStatus(value, status = '') {
    const next = s(value) || (s(status) === 'Closed' ? 'Closed' : 'Reported');
    return INVESTIGATION_STATUSES.has(next) ? next : 'Reported';
}

function normalizePotentialSeverity(value) {
    const next = s(value);
    return POTENTIAL_SEVERITIES.has(next) ? next : null;
}

function isDateValue(value) {
    if (!s(value)) return true;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function cleanupUploadedFiles(files) {
    if (!Array.isArray(files)) return;
    for (const f of files) {
        try {
            deleteLocalUpload(f.publicUrl || f.path);
        } catch (err) {
            console.warn('[accident] upload cleanup failed:', err.message);
        }
    }
}

function failValidation(req, res, message, status = 400) {
    cleanupUploadedFiles(req.files);
    return res.status(status).json({ success: false, message });
}

function serverError(res, err, message = 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง') {
    console.error('[accident]', err);
    return res.status(500).json({ success: false, message });
}

function uploadErrorMessage(err) {
    if (err?.code === 'LIMIT_FILE_SIZE') return 'ไฟล์แนบมีขนาดเกิน 20 MB';
    if (err?.code === 'LIMIT_UNEXPECTED_FILE') return 'จำนวนไฟล์แนบเกินที่ระบบกำหนด';
    return err?.message || 'อัปโหลดไฟล์ไม่สำเร็จ';
}

function accidentBusinessRuleError(body) {
    const type = s(body.AccidentType);
    const isRecordable = boolFlag(body.IsRecordable) === 1;
    const lostDays = nonNegativeInt(body.LostDays, 0, 36500);
    const needsRootCause = isRecordable || ['Medical Treatment', 'Lost Time', 'Fatal'].includes(type);
    const correctiveAction = type === 'Near Miss'
        ? (s(body.NearMissCAPA) || s(body.CorrectiveAction))
        : s(body.CorrectiveAction);

    if (!ACCIDENT_TYPES.has(type)) return 'ประเภทอุบัติเหตุไม่ถูกต้อง / Invalid accident type';
    if (type === 'Near Miss' && !s(body.NearMissEvent)) return 'กรุณาระบุเหตุการณ์ Near Miss / Please describe the Near Miss event';
    if (type === 'Near Miss' && !normalizePotentialSeverity(body.PotentialSeverity)) return 'กรุณาระบุระดับความรุนแรงที่อาจเกิดขึ้น / Please select potential severity';
    if (type === 'Lost Time' && lostDays < 1) return 'Lost Time ต้องระบุจำนวนวันหยุดงานมากกว่า 0';
    if (type === 'Medical Treatment' && !s(body.MedicalTreatment)) return 'Medical Treatment ต้องระบุรายละเอียดการรักษา';
    if (type === 'Fatal' && !isRecordable) return 'Fatal ต้องกำหนดเป็น Recordable';
    if (needsRootCause && !s(body.RootCause) && !s(body.RootCauseDetail)) return 'กรุณาระบุสาเหตุหรือรายละเอียดสาเหตุ';
    if (needsRootCause && !correctiveAction) return 'กรุณาระบุมาตรการแก้ไข';
    if (s(body.Status) === 'Closed' && !correctiveAction) return 'ปิดรายงานได้เมื่อมีมาตรการแก้ไข/CAPA แล้ว';
    if (s(body.Status) === 'Closed' && !s(body.VerificationResult)) return 'ปิดรายงานได้เมื่อมีผลการตรวจยืนยัน CAPA / CAPA verification result is required before closing';
    if (s(body.Status) === 'Closed' && !s(body.VerifiedBy)) return 'กรุณาระบุผู้ตรวจยืนยันก่อนปิดรายงาน / Verified by is required before closing';
    return '';
}

// ─── ENSURE TABLES ────────────────────────────────────────────────────────────
let tableReady = false;
let attachmentNamesRepaired = false;
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
        "ALTER TABLE Accident_Reports ADD COLUMN IsDeleted        TINYINT(1)   DEFAULT 0",
        "ALTER TABLE Accident_Reports ADD COLUMN NearMissDetails  JSON         DEFAULT NULL",
        "ALTER TABLE Accident_Reports ADD COLUMN InvestigationStatus VARCHAR(50) DEFAULT 'Reported'",
        "ALTER TABLE Accident_Reports ADD COLUMN PotentialSeverity   VARCHAR(20) DEFAULT NULL",
        "ALTER TABLE Accident_Reports ADD COLUMN VerificationResult  TEXT",
        "ALTER TABLE Accident_Reports ADD COLUMN VerifiedBy          VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE Accident_Reports ADD COLUMN VerifiedAt          DATE DEFAULT NULL",
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
            MonthlyManHours  JSON         DEFAULT NULL,
            AnnualManHours   DECIMAL(15,2) DEFAULT 0,
            CumulativeManHours DECIMAL(15,2) DEFAULT 0,
            UpdatedBy        VARCHAR(100) DEFAULT NULL,
            UpdatedAt        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_year (Year)
        )
    `);
    const performanceMigrate = [
        "ALTER TABLE Accident_Performance ADD COLUMN MonthlyManHours JSON DEFAULT NULL",
        "ALTER TABLE Accident_Performance ADD COLUMN AnnualManHours DECIMAL(15,2) DEFAULT 0",
        "ALTER TABLE Accident_Performance ADD COLUMN CumulativeManHours DECIMAL(15,2) DEFAULT 0",
    ];
    for (const sql of performanceMigrate) {
        try { await db.query(sql); } catch (_) { /* column already exists */ }
    }

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

    await db.query(`
        CREATE TABLE IF NOT EXISTS accident_hotspot_positions (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            AreaName     VARCHAR(255) NOT NULL,
            DisplayName  VARCHAR(255) DEFAULT NULL,
            MapXPercent  DECIMAL(6,3) NOT NULL,
            MapYPercent  DECIMAL(6,3) NOT NULL,
            IsPinned     TINYINT(1) NOT NULL DEFAULT 1,
            UpdatedBy    VARCHAR(100) DEFAULT NULL,
            UpdatedAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_acc_hotspot_area (AreaName),
            KEY idx_pinned (IsPinned)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    if (!attachmentNamesRepaired) {
        try {
            const [atts] = await db.query(
                'SELECT id, FileName FROM Accident_Attachments ORDER BY id DESC LIMIT 500'
            );
            for (const att of atts) {
                const fixed = cleanOriginalFilename(att.FileName);
                if (fixed && fixed !== att.FileName) {
                    await db.query('UPDATE Accident_Attachments SET FileName = ? WHERE id = ?', [fixed, att.id]);
                }
            }
        } catch (err) {
            console.warn('[accident] attachment filename repair skipped:', err.message);
        }
        attachmentNamesRepaired = true;
    }

    tableReady = true;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// Save req.files (after multer) to Accident_Attachments
async function saveAttachments(files, accidentId, uploaderName) {
    if (!files || files.length === 0) return;
    for (const f of files) {
        const fileUrl  = f.path;
        const publicId = f.filename || null;
        await db.query(
            `INSERT INTO Accident_Attachments
             (AccidentID, FileName, FileURL, PublicID, FileType, FileSize, UploadedBy)
             VALUES (?,?,?,?,?,?,?)`,
            [accidentId, f.originalName || f.originalname, fileUrl, publicId, f.mimetype, f.size || null, uploaderName]
        );
    }
}

// ─── GET /api/accident/reports ────────────────────────────────────────────────
router.get('/reports', async (req, res) => {
    try {
        const { department, type, status } = req.query;
        const year = normalizeYear(req.query.year, null);

        let sql = `
            SELECT r.*,
                   e.EmployeeName, e.Team,
                   (SELECT COUNT(*) FROM Accident_Attachments WHERE AccidentID = r.id) AS AttachmentCount
            FROM   Accident_Reports r
            LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
            WHERE  (r.IsDeleted IS NULL OR r.IsDeleted = 0)
        `;
        const params = [];
        if (req.query.year && !year) return res.status(400).json({ success: false, message: 'ปีที่เลือกไม่ถูกต้อง' });
        if (year)       { sql += ' AND YEAR(r.AccidentDate) = ?'; params.push(year); }
        if (department) { sql += ' AND r.Department = ?';          params.push(department); }
        if (type)       { sql += ' AND r.AccidentType = ?';        params.push(type); }
        if (status)     { sql += ' AND r.Status = ?';              params.push(status); }
        sql += ' ORDER BY r.AccidentDate DESC, r.id DESC';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        serverError(res, err, 'ไม่สามารถโหลดรายการรายงานอุบัติเหตุได้');
    }
});

// ─── GET /api/accident/reports/:id  (must be declared BEFORE bulk routes) ──────
router.get('/reports/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });
    try {
        const [[report]] = await db.query(
            `SELECT r.*, e.EmployeeName, e.Team
             FROM   Accident_Reports r
             LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
             WHERE  r.id = ? AND (r.IsDeleted IS NULL OR r.IsDeleted = 0)`,
            [id]
        );
        if (!report) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });

        const [attachments] = await db.query(
            'SELECT * FROM Accident_Attachments WHERE AccidentID = ? ORDER BY UploadedAt ASC',
            [id]
        );
        res.json({ success: true, data: { ...report, attachments } });
    } catch (err) {
        serverError(res, err, 'ไม่สามารถโหลดรายละเอียดรายงานอุบัติเหตุได้');
    }
});

// GET /api/accident/reports/:id/audit (admin) — audit trail for a single report
router.get('/reports/:id/audit', isAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });
    try {
        const [[report]] = await db.query(
            'SELECT id FROM Accident_Reports WHERE id = ? AND (IsDeleted IS NULL OR IsDeleted = 0)',
            [id]
        );
        if (!report) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });
        const [rows] = await db.query(
            `SELECT id, ActionTime, AdminID, AdminName, Action, Detail, Metadata
             FROM Admin_AuditLogs
             WHERE Module = ?
               AND TargetType IN ('Accident_Reports', ?)
               AND TargetID = ?
             ORDER BY ActionTime DESC, id DESC
             LIMIT 20`,
            [MODULE, MODULE, String(id)]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        serverError(res, err, 'ไม่สามารถโหลดประวัติการแก้ไขรายงานได้');
    }
});

// ─── GET /api/accident/summary?year= ──────────────────────────────────────────
router.get('/summary', async (req, res) => {
    try {
        const year = normalizeYear(req.query.year, new Date().getFullYear());
        if (req.query.year && !year) return res.status(400).json({ success: false, message: 'ปีที่เลือกไม่ถูกต้อง' });
        const yf   = 'AND YEAR(AccidentDate) = ?';
        const yp   = [year];

        const [kpi] = await db.query(`
            SELECT
                COUNT(*)                                     AS total,
                COALESCE(SUM(${STATS_ACCIDENT_CONDITION}), 0) AS recordable,
                COALESCE(SUM(CASE WHEN ${STATS_ACCIDENT_CONDITION} THEN LostDays ELSE 0 END), 0) AS lostDays,
                COALESCE(SUM(AccidentType = 'Near Miss'), 0) AS nearMiss,
                COALESCE(SUM(AccidentType = 'Fatal'), 0)     AS fatal
            FROM Accident_Reports WHERE (IsDeleted IS NULL OR IsDeleted = 0) ${yf}
        `, yp);

        const lastRecSql = year ? `
            SELECT AccidentDate FROM Accident_Reports
            WHERE (IsDeleted IS NULL OR IsDeleted = 0)
              AND YEAR(AccidentDate) = ?
              AND ${STATS_ACCIDENT_CONDITION}
            ORDER BY AccidentDate DESC LIMIT 1
        ` : `
            SELECT AccidentDate FROM Accident_Reports
            WHERE (IsDeleted IS NULL OR IsDeleted = 0)
              AND ${STATS_ACCIDENT_CONDITION}
            ORDER BY AccidentDate DESC LIMIT 1
        `;
        const [lastRec] = await db.query(lastRecSql, year ? [year] : []);
        let daysSince = null;
        if (year) {
            daysSince = accidentFreeDaysForYear(year, lastRec[0]?.AccidentDate || null);
        } else if (lastRec[0]) {
            daysSince = Math.max(0, Math.floor((Date.now() - new Date(lastRec[0].AccidentDate).getTime()) / 86400000));
        }

        const trendSql = year
            ? `SELECT MONTH(AccidentDate) AS mo, COUNT(*) AS total,
                      SUM(${STATS_ACCIDENT_CONDITION}) AS recordable,
                      SUM(AccidentType = 'Near Miss') AS nearMiss,
                      SUM(CASE WHEN ${STATS_ACCIDENT_CONDITION} THEN LostDays ELSE 0 END) AS lostDays
               FROM Accident_Reports
               WHERE (IsDeleted IS NULL OR IsDeleted = 0) AND YEAR(AccidentDate) = ?
               GROUP BY MONTH(AccidentDate) ORDER BY mo`
            : `SELECT DATE_FORMAT(AccidentDate,'%Y-%m') AS period,
                      COUNT(*) AS total,
                      SUM(${STATS_ACCIDENT_CONDITION}) AS recordable,
                      SUM(AccidentType = 'Near Miss') AS nearMiss,
                      SUM(CASE WHEN ${STATS_ACCIDENT_CONDITION} THEN LostDays ELSE 0 END) AS lostDays
               FROM Accident_Reports
               WHERE (IsDeleted IS NULL OR IsDeleted = 0)
                 AND AccidentDate >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
               GROUP BY period ORDER BY period`;
        const [trend] = await db.query(trendSql, year ? [year] : []);

        const [byType] = await db.query(`
            SELECT AccidentType, COUNT(*) AS cnt
            FROM Accident_Reports WHERE (IsDeleted IS NULL OR IsDeleted = 0) ${yf}
            GROUP BY AccidentType ORDER BY cnt DESC
        `, yp);

        const [byDept] = await db.query(`
            SELECT Department,
                   COUNT(*)                       AS total,
                   COALESCE(SUM(${STATS_ACCIDENT_CONDITION}), 0) AS recordable,
                   COALESCE(SUM(CASE WHEN ${STATS_ACCIDENT_CONDITION} THEN LostDays ELSE 0 END), 0) AS lostDays
            FROM Accident_Reports
            WHERE (IsDeleted IS NULL OR IsDeleted = 0)
              AND Department IS NOT NULL AND Department <> '' ${yf}
            GROUP BY Department
            ORDER BY total DESC, recordable DESC
            LIMIT 10
        `, yp);

        const [recentReports] = await db.query(`
            SELECT id, AccidentDate, AccidentType, Department, Area, Status, DueDate,
                   EmployeeID, ReportedBy, ResponsiblePerson, InvestigationStatus, CreatedAt
            FROM Accident_Reports
            WHERE (IsDeleted IS NULL OR IsDeleted = 0) ${yf}
            ORDER BY CreatedAt DESC, id DESC
            LIMIT 8
        `, yp);

        const [openActions] = await db.query(`
            SELECT id, AccidentDate, AccidentType, Department, Area, Status, DueDate,
                   ResponsiblePerson, InvestigationStatus, CreatedAt
            FROM Accident_Reports
            WHERE (IsDeleted IS NULL OR IsDeleted = 0)
              AND COALESCE(Status,'Open') <> 'Closed' ${yf}
            ORDER BY
              CASE WHEN DueDate IS NULL THEN 1 ELSE 0 END,
              DueDate ASC,
              id DESC
            LIMIT 8
        `, yp);

        res.json({ success: true, data: { kpi: kpi[0], daysSince, trend, byType, byDept, recentReports, openActions } });
    } catch (err) {
        serverError(res, err, 'ไม่สามารถโหลดสรุปรายงานอุบัติเหตุได้');
    }
});

// ─── GET /api/accident/analytics?year= ────────────────────────────────────────
router.get('/analytics', async (req, res) => {
    try {
        const year = normalizeYear(req.query.year, new Date().getFullYear());
        if (req.query.year && !year) return res.status(400).json({ success: false, message: 'ปีที่เลือกไม่ถูกต้อง' });
        const yf   = 'AND YEAR(AccidentDate) = ?';
        const yp   = [year];

        const [deptRank] = await db.query(`
            SELECT Department,
                   COUNT(*)                      AS total,
                   SUM(${STATS_ACCIDENT_CONDITION}) AS recordable,
                   SUM(CASE WHEN ${STATS_ACCIDENT_CONDITION} THEN LostDays ELSE 0 END) AS lostDays,
                   SUM(AccidentType='Near Miss') AS nearMiss,
                   SUM(AccidentType='Fatal')     AS fatal,
                   SUM(Severity='Critical')      AS critical
            FROM Accident_Reports
            WHERE (IsDeleted IS NULL OR IsDeleted = 0)
              AND Department IS NOT NULL AND Department <> '' ${yf}
            GROUP BY Department
            ORDER BY (SUM(IsRecordable)*3 + SUM(LostDays)*2 + COUNT(*)) DESC
            LIMIT 10
        `, yp);

        const [hotspot] = await db.query(`
            SELECT COALESCE(Area,'(ไม่ระบุ)') AS area, COUNT(*) AS cnt,
                   SUM(${STATS_ACCIDENT_CONDITION}) AS recordable,
                   SUM(CASE WHEN ${STATS_ACCIDENT_CONDITION} THEN LostDays ELSE 0 END) AS lostDays
            FROM Accident_Reports WHERE (IsDeleted IS NULL OR IsDeleted = 0) ${yf}
            GROUP BY Area ORDER BY cnt DESC LIMIT 8
        `, yp);

        const [rootCauses] = await db.query(`
            SELECT COALESCE(RootCause,'(ไม่ระบุ)') AS cause, COUNT(*) AS cnt
            FROM Accident_Reports WHERE (IsDeleted IS NULL OR IsDeleted = 0) ${yf}
            GROUP BY RootCause ORDER BY cnt DESC LIMIT 8
        `, yp);

        const [nearMissTrend] = await db.query(`
            SELECT MONTH(AccidentDate) AS mo, COUNT(*) AS cnt
            FROM Accident_Reports
            WHERE (IsDeleted IS NULL OR IsDeleted = 0)
              AND AccidentType = 'Near Miss' ${yf}
            GROUP BY MONTH(AccidentDate)
            ORDER BY mo
        `, yp);

        const [injuryTypeStats] = await db.query(`
            SELECT COALESCE(NULLIF(InjuryType,''),'(ไม่ระบุ)') AS label, COUNT(*) AS cnt
            FROM Accident_Reports
            WHERE (IsDeleted IS NULL OR IsDeleted = 0)
              AND ${STATS_ACCIDENT_CONDITION}
              AND AccidentType <> 'Near Miss' ${yf}
            GROUP BY COALESCE(NULLIF(InjuryType,''),'(ไม่ระบุ)')
            ORDER BY cnt DESC
            LIMIT 10
        `, yp);

        const [bodyPartStats] = await db.query(`
            SELECT COALESCE(NULLIF(BodyPart,''),'(ไม่ระบุ)') AS label, COUNT(*) AS cnt
            FROM Accident_Reports
            WHERE (IsDeleted IS NULL OR IsDeleted = 0)
              AND ${STATS_ACCIDENT_CONDITION}
              AND AccidentType <> 'Near Miss' ${yf}
            GROUP BY COALESCE(NULLIF(BodyPart,''),'(ไม่ระบุ)')
            ORDER BY cnt DESC
            LIMIT 10
        `, yp);

        res.json({ success: true, data: { deptRank, hotspot, rootCauses, nearMissTrend, injuryTypeStats, bodyPartStats } });
    } catch (err) {
        serverError(res, err, 'ไม่สามารถโหลดข้อมูลวิเคราะห์อุบัติเหตุได้');
    }
});

// ─── POST /api/accident/reports (admin) ───────────────────────────────────────
// GET /api/accident/hotspot-positions
router.get('/hotspot-positions', async (_req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT id, AreaName, DisplayName, MapXPercent, MapYPercent, IsPinned, UpdatedBy, UpdatedAt
            FROM accident_hotspot_positions
            ORDER BY AreaName ASC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        serverError(res, err, 'Cannot load accident hotspot positions.');
    }
});

// PUT /api/accident/hotspot-positions (admin)
router.put('/hotspot-positions', isAdmin, async (req, res) => {
    try {
        await ensureTable();
        const input = Array.isArray(req.body?.positions) ? req.body.positions : [req.body || {}];
        const clean = [];
        for (const item of input) {
            const areaName = s(item.AreaName ?? item.areaName ?? item.area);
            const displayName = s(item.DisplayName ?? item.displayName) || areaName;
            const x = percentValue(item.MapXPercent ?? item.mapXPercent ?? item.x);
            const y = percentValue(item.MapYPercent ?? item.mapYPercent ?? item.y);
            if (!areaName || x == null || y == null) {
                return res.status(400).json({ success: false, message: 'Invalid hotspot position payload.' });
            }
            clean.push({ areaName, displayName, x, y, isPinned: boolFlag(item.IsPinned ?? item.isPinned ?? 1) });
        }
        for (const item of clean) {
            await db.query(`
                INSERT INTO accident_hotspot_positions
                    (AreaName, DisplayName, MapXPercent, MapYPercent, IsPinned, UpdatedBy)
                VALUES (?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE
                    DisplayName=VALUES(DisplayName),
                    MapXPercent=VALUES(MapXPercent),
                    MapYPercent=VALUES(MapYPercent),
                    IsPinned=VALUES(IsPinned),
                    UpdatedBy=VALUES(UpdatedBy)
            `, [item.areaName, item.displayName, item.x, item.y, item.isPinned, userName(req)]);
        }
        const [rows] = await db.query(`
            SELECT id, AreaName, DisplayName, MapXPercent, MapYPercent, IsPinned, UpdatedBy, UpdatedAt
            FROM accident_hotspot_positions
            ORDER BY AreaName ASC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        serverError(res, err, 'Cannot save accident hotspot position.');
    }
});

router.post('/reports', isAdmin, async (req, res) => {
    try {
        await ensureTable();
        await runUpload(req, res);
    } catch (err) {
        return res.status(400).json({ success: false, message: uploadErrorMessage(err) });
    }
    try {
        const {
            ReportDate, AccidentDate, AccidentTime, EmployeeID,
            Area, Location, AccidentType, Severity, Description,
            RootCause, RootCauseDetail, ImmediateCause, UnsafeAct, UnsafeCondition,
            CorrectiveAction, PreventiveAction, LostDays, IsRecordable, Status,
            ReportedBy, InjuryType, BodyPart, MedicalTreatment,
            Position, EmploymentType, ResponsiblePerson, DueDate,
            InvestigationStatus, PotentialSeverity, VerificationResult, VerifiedBy, VerifiedAt,
        } = req.body;

        if (!s(ReportDate) || !s(AccidentDate) || !s(EmployeeID) || !s(AccidentType)) {
            return failValidation(req, res, 'กรุณากรอกข้อมูลให้ครบ (วันที่รายงาน / วันที่เกิดเหตุ / รหัสพนักงาน / ประเภท)');
        }
        if (!isDateValue(ReportDate) || !isDateValue(AccidentDate) || !isDateValue(DueDate) || !isDateValue(VerifiedAt)) {
            return failValidation(req, res, 'รูปแบบวันที่ไม่ถูกต้อง');
        }
        const ruleError = accidentBusinessRuleError(req.body);
        if (ruleError) return failValidation(req, res, ruleError);

        const empId = s(EmployeeID);
        const [empRows] = await db.query(
            'SELECT EmployeeID, Department, Position AS EmpPosition FROM Employees WHERE EmployeeID = ?',
            [empId]
        );
        if (empRows.length === 0) {
            return failValidation(req, res, `ไม่พบรหัสพนักงาน "${empId}" ใน Employee Master Data`);
        }

        const department  = empRows[0].Department   || null;
        const empPosition = s(Position) || empRows[0].EmpPosition || null;
        const nearMissDetails = buildNearMissDetails(req.body);
        const nearMissJson = nearMissDetails ? JSON.stringify(nearMissDetails) : null;

        const [result] = await db.query(
            `INSERT INTO Accident_Reports
             (ReportDate, AccidentDate, AccidentTime, EmployeeID, Department, Area, Location,
              AccidentType, Severity, Description,
              RootCause, RootCauseDetail, ImmediateCause, UnsafeAct, UnsafeCondition,
              CorrectiveAction, PreventiveAction,
              LostDays, IsRecordable, Status, ReportedBy, CreatedBy,
              InjuryType, BodyPart, MedicalTreatment,
              Position, EmploymentType, ResponsiblePerson, DueDate, NearMissDetails,
              InvestigationStatus, PotentialSeverity, VerificationResult, VerifiedBy, VerifiedAt)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                s(ReportDate), s(AccidentDate), s(AccidentTime) || null,
                empId, department, s(Area) || null, s(Location) || null,
                s(AccidentType), s(Severity) || 'Minor',
                s(Description) || '',
                s(RootCause) || null, s(RootCauseDetail) || '',
                s(ImmediateCause) || null, s(UnsafeAct) || null, s(UnsafeCondition) || null,
                s(CorrectiveAction) || '', s(PreventiveAction) || null,
                nonNegativeInt(LostDays, 0, 36500), boolFlag(IsRecordable),
                s(Status) || 'Open',
                s(ReportedBy) || userName(req), userName(req),
                s(InjuryType) || null, s(BodyPart) || null, s(MedicalTreatment) || null,
                empPosition, s(EmploymentType) || null,
                s(ResponsiblePerson) || null, s(DueDate) || null, nearMissJson,
                normalizeInvestigationStatus(InvestigationStatus, Status),
                normalizePotentialSeverity(PotentialSeverity),
                s(VerificationResult) || null,
                s(VerifiedBy) || null,
                s(VerifiedAt) || null,
            ]
        );

        await saveAttachments(req.files, result.insertId, userName(req));
        await logAudit(req, {
            module: MODULE,
            action: s(AccidentType) === 'Near Miss' ? 'CREATE_NEAR_MISS_REPORT' : 'CREATE_ACCIDENT_REPORT',
            targetType: 'Accident_Reports',
            targetId: result.insertId,
            detail: `Created accident report ACC-${String(result.insertId).padStart(4, '0')}`,
            metadata: { EmployeeID: empId, AccidentDate: s(AccidentDate), AccidentType: s(AccidentType), files: (req.files || []).length },
        });
        res.json({ success: true, message: 'บันทึกรายงานอุบัติเหตุสำเร็จ', id: result.insertId });
    } catch (err) {
        cleanupUploadedFiles(req.files);
        serverError(res, err, 'ไม่สามารถบันทึกรายงานอุบัติเหตุได้');
    }
});

// ─── PUT /api/accident/reports/:id (admin) ────────────────────────────────────
router.put('/reports/:id', isAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });
    try {
        await ensureTable();
        await runUpload(req, res);
    } catch (err) {
        return res.status(400).json({ success: false, message: uploadErrorMessage(err) });
    }
    try {
        const {
            ReportDate, AccidentDate, AccidentTime, EmployeeID,
            Area, Location, AccidentType, Severity, Description,
            RootCause, RootCauseDetail, ImmediateCause, UnsafeAct, UnsafeCondition,
            CorrectiveAction, PreventiveAction, LostDays, IsRecordable, Status,
            ReportedBy, InjuryType, BodyPart, MedicalTreatment,
            Position, EmploymentType, ResponsiblePerson, DueDate,
            InvestigationStatus, PotentialSeverity, VerificationResult, VerifiedBy, VerifiedAt,
        } = req.body;

        if (!s(ReportDate) || !s(AccidentDate) || !s(EmployeeID) || !s(AccidentType)) {
            return failValidation(req, res, 'กรุณากรอกข้อมูลให้ครบ');
        }
        if (!isDateValue(ReportDate) || !isDateValue(AccidentDate) || !isDateValue(DueDate) || !isDateValue(VerifiedAt)) {
            return failValidation(req, res, 'รูปแบบวันที่ไม่ถูกต้อง');
        }
        const ruleError = accidentBusinessRuleError(req.body);
        if (ruleError) return failValidation(req, res, ruleError);

        const empId = s(EmployeeID);
        const [empRows] = await db.query(
            'SELECT EmployeeID, Department FROM Employees WHERE EmployeeID = ?',
            [empId]
        );
        if (empRows.length === 0) {
            return failValidation(req, res, `ไม่พบรหัสพนักงาน "${empId}" ใน Employee Master Data`);
        }

        // Verify the report exists (ownership check)
        const [[existing]] = await db.query('SELECT id FROM Accident_Reports WHERE id = ? AND (IsDeleted IS NULL OR IsDeleted = 0)', [id]);
        if (!existing) return failValidation(req, res, 'ไม่พบรายงาน', 404);

        const department = empRows[0].Department || null;
        const nearMissDetails = buildNearMissDetails(req.body);
        const nearMissJson = nearMissDetails ? JSON.stringify(nearMissDetails) : null;

        await db.query(
            `UPDATE Accident_Reports SET
                ReportDate=?, AccidentDate=?, AccidentTime=?,
                EmployeeID=?, Department=?, Area=?, Location=?,
                AccidentType=?, Severity=?, Description=?,
                RootCause=?, RootCauseDetail=?, ImmediateCause=?, UnsafeAct=?, UnsafeCondition=?,
                CorrectiveAction=?, PreventiveAction=?,
                LostDays=?, IsRecordable=?, Status=?, ReportedBy=?,
                InjuryType=?, BodyPart=?, MedicalTreatment=?,
                Position=?, EmploymentType=?, ResponsiblePerson=?, DueDate=?,
                NearMissDetails=?,
                InvestigationStatus=?, PotentialSeverity=?, VerificationResult=?, VerifiedBy=?, VerifiedAt=?
             WHERE id=?`,
            [
                s(ReportDate), s(AccidentDate), s(AccidentTime) || null,
                empId, department, s(Area) || null, s(Location) || null,
                s(AccidentType), s(Severity) || 'Minor',
                s(Description) || '',
                s(RootCause) || null, s(RootCauseDetail) || '',
                s(ImmediateCause) || null, s(UnsafeAct) || null, s(UnsafeCondition) || null,
                s(CorrectiveAction) || '', s(PreventiveAction) || null,
                nonNegativeInt(LostDays, 0, 36500), boolFlag(IsRecordable),
                s(Status) || 'Open', s(ReportedBy) || userName(req),
                s(InjuryType) || null, s(BodyPart) || null, s(MedicalTreatment) || null,
                s(Position) || null, s(EmploymentType) || null,
                s(ResponsiblePerson) || null, s(DueDate) || null,
                nearMissJson,
                normalizeInvestigationStatus(InvestigationStatus, Status),
                normalizePotentialSeverity(PotentialSeverity),
                s(VerificationResult) || null,
                s(VerifiedBy) || null,
                s(VerifiedAt) || null,
                id,
            ]
        );

        // Append any new files (does not remove existing ones)
        await saveAttachments(req.files, id, userName(req));
        await logAudit(req, {
            module: MODULE,
            action: s(Status) === 'Closed' ? 'CLOSE_ACCIDENT_REPORT' : 'UPDATE_ACCIDENT_REPORT',
            targetType: 'Accident_Reports',
            targetId: id,
            detail: `Updated accident report ACC-${String(id).padStart(4, '0')}`,
            metadata: { EmployeeID: empId, AccidentDate: s(AccidentDate), AccidentType: s(AccidentType), files: (req.files || []).length },
        });
        res.json({ success: true, message: 'อัปเดตรายงานอุบัติเหตุสำเร็จ' });
    } catch (err) {
        cleanupUploadedFiles(req.files);
        serverError(res, err, 'ไม่สามารถอัปเดตรายงานอุบัติเหตุได้');
    }
});

// ─── DELETE /api/accident/reports/:id (admin) ─────────────────────────────────
router.delete('/reports/:id', isAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });
    try {
        await ensureTable();
        const [[existing]] = await db.query(
            'SELECT id FROM Accident_Reports WHERE id = ? AND (IsDeleted IS NULL OR IsDeleted = 0)', [id]
        );
        if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });

        await db.query('UPDATE Accident_Reports SET IsDeleted = 1 WHERE id = ?', [id]);
        await logAudit(req, {
            module: MODULE,
            action: 'DELETE_ACCIDENT_REPORT',
            targetType: 'Accident_Reports',
            targetId: id,
            detail: `Soft deleted accident report ACC-${String(id).padStart(4, '0')}`,
        });
        res.json({ success: true, message: 'ลบรายงานสำเร็จ' });
    } catch (err) {
        serverError(res, err, 'ไม่สามารถลบรายงานอุบัติเหตุได้');
    }
});

// ─── DELETE /api/accident/attachments/:id (admin) ────────────────────────────
router.delete('/attachments/:id', isAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });
    try {
        await ensureTable();
        const [[att]] = await db.query(
            'SELECT * FROM Accident_Attachments WHERE id = ?', [id]
        );
        if (!att) return res.status(404).json({ success: false, message: 'ไม่พบไฟล์' });

        const [result] = await db.query('DELETE FROM Accident_Attachments WHERE id = ?', [id]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'ไม่พบไฟล์' });
        await _destroyFile(att);
        await logAudit(req, {
            module: MODULE,
            action: 'DELETE_ACCIDENT_ATTACHMENT',
            targetType: 'Accident_Attachments',
            targetId: id,
            detail: `Deleted accident attachment ${att.FileName || id}`,
            metadata: { AccidentID: att.AccidentID, FileName: att.FileName },
        });
        res.json({ success: true, message: 'ลบไฟล์สำเร็จ' });
    } catch (err) {
        serverError(res, err, 'ไม่สามารถลบไฟล์แนบได้');
    }
});

// Destroy an uploaded local file; errors are non-fatal
async function _destroyFile(att) {
    try {
        if (att.FileURL) {
            // Local: /uploads/filename → backend/uploads/filename
            deleteLocalUpload(att.FileURL);
        }
    } catch (_) { /* non-fatal */ }
}

// ─── GET /api/accident/performance?year= ─────────────────────────────────────
router.get('/performance', async (req, res) => {
    try {
        const year = normalizeYear(req.query.year, new Date().getFullYear());
        if (req.query.year && !year) return res.status(400).json({ success: false, message: 'ปีที่เลือกไม่ถูกต้อง' });

        const [[row]] = await db.query(
            'SELECT * FROM Accident_Performance WHERE Year = ?', [year]
        );

        // Safety board statistics intentionally exclude Near Miss and First Aid.
        // Counted cases reset by selected calendar year through AccidentDate.
        const [[kpi]] = await db.query(
            `SELECT
                COUNT(*) AS total,
                COALESCE(SUM(${STATS_ACCIDENT_CONDITION}), 0) AS statsTotal,
                COALESCE(SUM(CASE WHEN ${STATS_ACCIDENT_CONDITION} THEN LostDays ELSE 0 END), 0) AS lostDays,
                COALESCE(SUM(AccidentType = 'First Aid'), 0) AS firstAid,
                COALESCE(SUM(AccidentType = 'Medical Treatment'), 0) AS medicalTreatment,
                COALESCE(SUM(AccidentType = 'Lost Time'), 0) AS lostTime,
                COALESCE(SUM(AccidentType = 'Fatal'), 0) AS fatal,
                COALESCE(SUM(AccidentType = 'Near Miss'), 0) AS nearMiss,
                COALESCE(SUM((${STATS_ACCIDENT_CONDITION}) AND (AccidentType = 'Fatal' OR Severity = 'Critical')), 0) AS severe,
                COALESCE(SUM((${STATS_ACCIDENT_CONDITION}) AND LostDays > 3), 0) AS lostOver3,
                COALESCE(SUM((${STATS_ACCIDENT_CONDITION}) AND LostDays BETWEEN 1 AND 3), 0) AS lostUnderEqual3,
                COALESCE(SUM((${STATS_ACCIDENT_CONDITION}) AND COALESCE(LostDays, 0) = 0
                    AND AccidentType <> 'Fatal' AND Severity <> 'Critical'), 0) AS nonLostRecordable
             FROM Accident_Reports
             WHERE (IsDeleted IS NULL OR IsDeleted = 0) AND YEAR(AccidentDate) = ?`,
            [year]
        );
        const [[lastStat]] = await db.query(
            `SELECT AccidentDate
             FROM Accident_Reports
             WHERE (IsDeleted IS NULL OR IsDeleted = 0)
               AND YEAR(AccidentDate) = ?
               AND ${STATS_ACCIDENT_CONDITION}
             ORDER BY AccidentDate DESC, id DESC
             LIMIT 1`,
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
            MonthlyManHours:  null,
            AnnualManHours:   0,
            CumulativeManHours: 0,
            UpdatedBy:       null,
        };

        const monthlyManHours = sanitizeMonthlyNumbers(record.MonthlyManHours);
        const monthlyTotal = Object.values(monthlyManHours).reduce((sum, n) => sum + (Number(n) || 0), 0);
        const annualManHours = nonNegativeNumber(record.AnnualManHours, 0) || monthlyTotal || nonNegativeNumber(record.TotalHours, 0);
        const cumulativeManHours = nonNegativeNumber(record.CumulativeManHours, 0) || annualManHours;
        const statsCount = parseInt(kpi.statsTotal) || 0;
        const lostTimeCount = parseInt(kpi.lostTime) || 0;
        const statsLostDays = parseInt(kpi.lostDays) || 0;
        const effectiveLastAccidentDate = lastStat?.AccidentDate || record.LastAccidentDate || null;
        const rate = (count, base = 1000000) => annualManHours > 0
            ? Number(((Number(count) || 0) * base / annualManHours).toFixed(3))
            : 0;
        const rates = {
            monthlyManHours,
            annualManHours: Number(annualManHours.toFixed(2)),
            cumulativeManHours: Number(cumulativeManHours.toFixed(2)),
            hoursPer100k: Number((annualManHours / 100000).toFixed(3)),
            totalManHour: Number(annualManHours.toFixed(2)),
            IFR: rate(statsCount, 1000000),
            TCIR: rate(statsCount, 200000),
            LTIFR: rate(lostTimeCount, 1000000),
            ISR: rate(statsLostDays, 1000000),
            TRIR: rate(statsCount, 200000),
            lastStatAccidentDate: effectiveLastAccidentDate,
            statCounts: {
                total: statsCount,
                severe: parseInt(kpi.severe) || 0,
                lostOver3: parseInt(kpi.lostOver3) || 0,
                lostUnderEqual3: parseInt(kpi.lostUnderEqual3) || 0,
                nonLostRecordable: parseInt(kpi.nonLostRecordable) || 0,
                excludedFirstAid: parseInt(kpi.firstAid) || 0,
                excludedNearMiss: parseInt(kpi.nearMiss) || 0,
            },
        };
        const [monthlyReports] = await db.query(
            'SELECT * FROM accident_monthly_reports WHERE Year = ? ORDER BY MonthNo ASC',
            [year]
        );

        res.json({
            success: true,
            data: { ...record, LastAccidentDate: effectiveLastAccidentDate, recordableCount: statsCount, rates, monthlyReports },
        });
    } catch (err) {
        serverError(res, err, 'ไม่สามารถโหลดข้อมูล Safety Performance ได้');
    }
});

// ─── PUT /api/accident/performance (admin) ────────────────────────────────────
router.put('/performance', isAdmin, async (req, res) => {
    try {
        await ensureTable();
        const {
            Year, TotalHours, TotalDays, LastAccidentDate,
            TargetHours, TargetDays, MonthlyStatus,
            MonthlyManHours, AnnualManHours, CumulativeManHours,
        } = req.body;

        const year = normalizeYear(Year, null);
        if (!year) return res.status(400).json({ success: false, message: 'ปีที่เลือกไม่ถูกต้อง' });

        // Accept MonthlyStatus as string (JSON) or object
        let monthlyJson = null;
        if (MonthlyStatus != null && MonthlyStatus !== '') {
            monthlyJson = typeof MonthlyStatus === 'string'
                ? MonthlyStatus
                : JSON.stringify(MonthlyStatus);
            try { JSON.parse(monthlyJson); } catch (_) {
                return res.status(400).json({ success: false, message: 'ข้อมูลสถานะรายเดือนไม่ถูกต้อง' });
            }
        }
        const monthlyManHours = sanitizeMonthlyNumbers(MonthlyManHours);
        const monthlyManHoursJson = JSON.stringify(monthlyManHours);
        const monthlyTotal = Object.values(monthlyManHours).reduce((sum, n) => sum + (Number(n) || 0), 0);
        const annualHours = monthlyTotal || nonNegativeNumber(TotalHours, 0);
        const cumulativeHours = annualHours;
        const [[lastStat]] = await db.query(
            `SELECT AccidentDate
             FROM Accident_Reports
             WHERE (IsDeleted IS NULL OR IsDeleted = 0)
               AND YEAR(AccidentDate) = ?
               AND ${STATS_ACCIDENT_CONDITION}
             ORDER BY AccidentDate DESC, id DESC
             LIMIT 1`,
            [year]
        );
        const effectiveLastAccidentDate = lastStat?.AccidentDate || null;
        const autoDays = accidentFreeDaysForYear(year, effectiveLastAccidentDate);

        await db.query(`
            INSERT INTO Accident_Performance
                (Year, TotalHours, TotalDays, LastAccidentDate,
                 TargetHours, TargetDays, MonthlyStatus, MonthlyManHours,
                 AnnualManHours, CumulativeManHours, UpdatedBy)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
                TotalHours       = VALUES(TotalHours),
                TotalDays        = VALUES(TotalDays),
                LastAccidentDate = VALUES(LastAccidentDate),
                TargetHours      = VALUES(TargetHours),
                TargetDays       = VALUES(TargetDays),
                MonthlyStatus    = VALUES(MonthlyStatus),
                MonthlyManHours  = VALUES(MonthlyManHours),
                AnnualManHours   = VALUES(AnnualManHours),
                CumulativeManHours = VALUES(CumulativeManHours),
                UpdatedBy        = VALUES(UpdatedBy)
        `, [
            year,
            Math.round(annualHours),
            autoDays,
            effectiveLastAccidentDate,
            nonNegativeInt(TargetHours, 1000000),
            nonNegativeInt(TargetDays, 365),
            monthlyJson,
            monthlyManHoursJson,
            annualHours,
            cumulativeHours,
            userName(req),
        ]);

        await logAudit(req, {
            module: MODULE,
            action: 'UPDATE_ACCIDENT_PERFORMANCE',
            targetType: 'Accident_Performance',
            targetId: year,
            detail: `Updated accident performance ${year}`,
            metadata: { Year: year, TotalHours, TotalDays, TargetHours, TargetDays, AnnualManHours: annualHours, CumulativeManHours: cumulativeHours },
        });
        res.json({ success: true, message: 'บันทึกข้อมูล Safety Performance สำเร็จ' });
    } catch (err) {
        serverError(res, err, 'ไม่สามารถบันทึกข้อมูล Safety Performance ได้');
    }
});

// ─── Monthly safety reports ──────────────────────────────────────────────────
router.get('/monthly-reports', async (req, res) => {
    try {
        const year = normalizeYear(req.query.year, new Date().getFullYear());
        if (req.query.year && !year) return res.status(400).json({ success: false, message: 'ปีที่เลือกไม่ถูกต้อง' });
        const [rows] = await db.query(
            'SELECT * FROM accident_monthly_reports WHERE Year = ? ORDER BY MonthNo ASC',
            [year]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        serverError(res, err, 'ไม่สามารถโหลดรายงานประจำเดือนได้');
    }
});

router.post('/monthly-reports', isAdmin, async (req, res) => {
    try {
        await ensureTable();
        await runMonthlyUpload(req, res);
    } catch (err) {
        cleanupUploadedFiles(req.file ? [req.file] : []);
        return res.status(400).json({ success: false, message: uploadErrorMessage(err) });
    }

    const file = req.file || null;
    const year = normalizeYear(req.body.Year, null);
    const month = Number.parseInt(req.body.MonthNo, 10);
    const status = ['green', 'red', 'pending'].includes(s(req.body.Status)) ? s(req.body.Status) : 'pending';
    if (!year || !Number.isInteger(month) || month < 1 || month > 12) {
        cleanupUploadedFiles(file ? [file] : []);
        return res.status(400).json({ success: false, message: 'ช่วงเวลารายงานประจำเดือนไม่ถูกต้อง' });
    }

    let conn;
    let committed = false;
    let oldFileUrl = null;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();
        const [[existing]] = await conn.query(
            'SELECT * FROM accident_monthly_reports WHERE Year = ? AND MonthNo = ? LIMIT 1 FOR UPDATE',
            [year, month]
        );
        oldFileUrl = existing?.ReportFileUrl || null;
        const fileUrl = file?.path || null;
        const fileName = file ? cleanOriginalFilename(file.originalName || file.originalname) : null;
        await conn.query(
            `INSERT INTO accident_monthly_reports
                (Year,MonthNo,Status,ReportFileUrl,ReportFileName,ReportFileType,ReportFileSize,Notes,UploadedBy,UploadedAt,UpdatedBy)
             VALUES (?,?,?,?,?,?,?,?,?,IF(? IS NULL,NULL,NOW()),?)
             ON DUPLICATE KEY UPDATE Status=VALUES(Status),ReportFileUrl=COALESCE(VALUES(ReportFileUrl),ReportFileUrl),
                ReportFileName=COALESCE(VALUES(ReportFileName),ReportFileName),ReportFileType=COALESCE(VALUES(ReportFileType),ReportFileType),
                ReportFileSize=COALESCE(VALUES(ReportFileSize),ReportFileSize),Notes=VALUES(Notes),
                UploadedBy=IF(VALUES(ReportFileUrl) IS NULL,UploadedBy,VALUES(UploadedBy)),
                UploadedAt=IF(VALUES(ReportFileUrl) IS NULL,UploadedAt,NOW()),UpdatedBy=VALUES(UpdatedBy)`,
            [year, month, status, fileUrl, fileName, file?.mimetype || null, file?.size || null,
                s(req.body.Notes) || null, file ? userName(req) : null, fileUrl, userName(req)]
        );
        const [[perf]] = await conn.query('SELECT MonthlyStatus FROM Accident_Performance WHERE Year = ? LIMIT 1', [year]);
        const monthlyStatus = parseJsonObject(perf?.MonthlyStatus, {});
        if (status === 'pending') delete monthlyStatus[String(month)];
        else monthlyStatus[String(month)] = status;
        await conn.query(
            `INSERT INTO Accident_Performance (Year,MonthlyStatus,UpdatedBy) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE MonthlyStatus=VALUES(MonthlyStatus),UpdatedBy=VALUES(UpdatedBy)`,
            [year, JSON.stringify(monthlyStatus), userName(req)]
        );
        await conn.commit();
        committed = true;
        if (file && oldFileUrl) {
            try { deleteLocalUpload(oldFileUrl); } catch (_) { /* replacement is already committed */ }
        }
        const [[saved]] = await db.query(
            'SELECT * FROM accident_monthly_reports WHERE Year = ? AND MonthNo = ? LIMIT 1',
            [year, month]
        );
        res.json({ success: true, data: saved });
    } catch (err) {
        if (conn && !committed) await conn.rollback().catch(() => {});
        if (!committed) cleanupUploadedFiles(file ? [file] : []);
        serverError(res, err, 'ไม่สามารถบันทึกรายงานประจำเดือนได้');
    } finally {
        conn?.release();
    }
});

router.delete('/monthly-reports/:id', isAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });
    let conn;
    let row;
    try {
        await ensureTable();
        conn = await db.getConnection();
        await conn.beginTransaction();
        [[row]] = await conn.query(
            'SELECT Year,MonthNo,ReportFileUrl FROM accident_monthly_reports WHERE id = ? LIMIT 1 FOR UPDATE',
            [id]
        );
        if (!row) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'ไม่พบรายงานประจำเดือน' });
        }
        await conn.query('DELETE FROM accident_monthly_reports WHERE id = ?', [id]);
        const [[perf]] = await conn.query('SELECT MonthlyStatus FROM Accident_Performance WHERE Year = ? LIMIT 1', [row.Year]);
        const monthlyStatus = parseJsonObject(perf?.MonthlyStatus, {});
        delete monthlyStatus[String(row.MonthNo)];
        await conn.query('UPDATE Accident_Performance SET MonthlyStatus = ? WHERE Year = ?', [JSON.stringify(monthlyStatus), row.Year]);
        await conn.commit();
        if (row.ReportFileUrl) {
            try { deleteLocalUpload(row.ReportFileUrl); } catch (_) { /* DB deletion remains authoritative */ }
        }
        res.json({ success: true });
    } catch (err) {
        if (conn) await conn.rollback().catch(() => {});
        serverError(res, err, 'ไม่สามารถลบรายงานประจำเดือนได้');
    } finally {
        conn?.release();
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
        serverError(res, err, 'ไม่สามารถค้นหาพนักงานได้');
    }
});

module.exports = router;
