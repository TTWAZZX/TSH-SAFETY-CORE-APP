// backend/routes/ojt.js
// Auth (authenticateToken) applied at mount level
// Write operations require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');
const { deleteLocalUpload } = require('../storage');
const { logAudit } = require('../utils/audit');

const MODULE = 'ojt';
const VALID_REVIEW_INTERVALS = [6, 12, 24];

function serverError(res, err, message = 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง') {
    console.error('[ojt]', err);
    return res.status(500).json({ success: false, message });
}

function userName(req) {
    return req.user?.name || req.user?.EmployeeName || req.user?.id || req.user?.EmployeeID || 'System';
}

function cleanText(value, max = 255) {
    return String(value || '').trim().slice(0, max);
}

function isPositiveId(value) {
    return /^\d+$/.test(String(value || '')) && Number(value) > 0;
}

function normalizeDate(value) {
    const raw = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return raw;
}

function nonNegativeInt(value, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) return null;
    return n;
}

function normalizeUploadUrl(value) {
    const raw = cleanText(value, 1024);
    if (!raw) return '';
    if (raw.startsWith('/uploads/')) return raw;
    try {
        const parsed = new URL(raw);
        if (['http:', 'https:'].includes(parsed.protocol) && parsed.pathname.includes('/uploads/')) {
            return raw;
        }
    } catch (_) {}
    return '';
}

function tryDeleteLocalUpload(fileUrl) {
    try {
        return deleteLocalUpload(fileUrl);
    } catch (err) {
        console.warn('[ojt] local file cleanup failed:', err.message);
        setTimeout(() => {
            try { deleteLocalUpload(fileUrl); } catch (_) {}
        }, 1500);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE TABLES
// ─────────────────────────────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS SCW_Standard (
            id INT AUTO_INCREMENT PRIMARY KEY,
            Content TEXT,
            UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UpdatedBy VARCHAR(100)
        )
    `);

    // Seed default content if empty
    const [rows] = await db.query('SELECT id FROM SCW_Standard LIMIT 1');
    if (rows.length === 0) {
        await db.query(
            'INSERT INTO SCW_Standard (Content, UpdatedBy) VALUES (?, ?)',
            [
                `<h3>หยุด (STOP)</h3><p>หยุดการทำงานทันทีเมื่อพบสิ่งผิดปกติ หรือไม่แน่ใจในความปลอดภัย อย่าฝืนทำงานต่อ</p>
<h3>โทร (CALL)</h3><p>แจ้งหัวหน้างาน หรือผู้รับผิดชอบทันที อธิบายปัญหาที่พบให้ชัดเจน</p>
<h3>รอ (WAIT)</h3><p>รอการตอบสนองจากผู้รับผิดชอบ ห้ามเริ่มงานต่อจนกว่าจะได้รับอนุญาต`,
                'System'
            ]
        );
    }

    // OJT tracked per DEPARTMENT (not per employee)
    await db.query(`
        CREATE TABLE IF NOT EXISTS OJT_Records (
            id INT AUTO_INCREMENT PRIMARY KEY,
            Department VARCHAR(100) NOT NULL,
            OJTDate DATE,
            NextReviewDate DATE,
            ReviewIntervalMonths INT DEFAULT 12,
            TrainerName VARCHAR(255),
            AttendeeCount INT DEFAULT 0,
            Notes TEXT,
            CreatedBy VARCHAR(100),
            UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_dept (Department)
        )
    `);

    // Migrations: add columns if existing table lacks them
    try {
        await db.query('ALTER TABLE OJT_Records ADD COLUMN AttendeeCount INT DEFAULT 0');
    } catch (_) { /* already exists */ }
    try {
        await db.query('ALTER TABLE OJT_Records ADD COLUMN YearlyTarget INT DEFAULT NULL');
    } catch (_) { /* already exists */ }

    // Drop EmployeeID / EmployeeName columns if they exist (old schema)
    // DROP COLUMN IF EXISTS is supported by the target MySQL-compatible database.
    for (const col of ['EmployeeID', 'EmployeeName']) {
        try { await db.query(`ALTER TABLE OJT_Records DROP COLUMN ${col}`); } catch (_) {}
    }

    // OJT History (audit trail per department)
    await db.query(`
        CREATE TABLE IF NOT EXISTS OJT_History (
            id                   INT AUTO_INCREMENT PRIMARY KEY,
            Department           VARCHAR(100) NOT NULL,
            OJTDate              DATE,
            NextReviewDate       DATE,
            ReviewIntervalMonths INT DEFAULT 12,
            TrainerName          VARCHAR(255),
            AttendeeCount        INT DEFAULT 0,
            Notes                TEXT,
            RecordedBy           VARCHAR(100),
            RecordedAt           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_dept (Department)
        )
    `);

    // SCW Documents (file attachments for Stop-Call-Wait)
    await db.query(`
        CREATE TABLE IF NOT EXISTS SCW_Documents (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            Title       VARCHAR(255) NOT NULL,
            FileURL     TEXT NOT NULL,
            FileType    VARCHAR(50),
            FileSizeKB  INT DEFAULT 0,
            UploadedBy  VARCHAR(100),
            UploadedAt  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const docMigrations = [
        `ALTER TABLE SCW_Documents ADD COLUMN Title VARCHAR(255) NULL`,
        `ALTER TABLE SCW_Documents ADD COLUMN FileURL TEXT NULL`,
        `ALTER TABLE SCW_Documents ADD COLUMN FileType VARCHAR(50)`,
        `ALTER TABLE SCW_Documents ADD COLUMN FileSizeKB INT DEFAULT 0`,
        `ALTER TABLE SCW_Documents ADD COLUMN UploadedBy VARCHAR(100)`,
        `ALTER TABLE SCW_Documents ADD COLUMN UploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    ];
    for (const sql of docMigrations) {
        try { await db.query(sql); } catch (_) { /* already exists */ }
    }
    try {
        await db.query(`
            UPDATE SCW_Documents
            SET
                Title = COALESCE(NULLIF(Title, ''), DocumentName),
                FileURL = COALESCE(NULLIF(FileURL, ''), DocumentLink)
            WHERE (Title IS NULL OR Title = '' OR FileURL IS NULL OR FileURL = '')
        `);
    } catch (_) { /* legacy columns may not exist on fresh installs */ }

    tablesReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ojt/standard
// ─────────────────────────────────────────────────────────────────────────────
router.get('/standard', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT * FROM SCW_Standard ORDER BY id DESC LIMIT 1');
        res.json({ success: true, data: rows[0] || null });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถโหลดมาตรฐาน Stop-Call-Wait ได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/ojt/standard  (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/standard', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const Content = cleanText(req.body?.Content, 10000);
        if (!Content) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุเนื้อหา Stop-Call-Wait' });
        }
        const [rows] = await db.query('SELECT id FROM SCW_Standard LIMIT 1');
        if (rows.length > 0) {
            await db.query('UPDATE SCW_Standard SET Content=?, UpdatedBy=? WHERE id=?',
                [Content, userName(req), rows[0].id]);
        } else {
            await db.query('INSERT INTO SCW_Standard (Content, UpdatedBy) VALUES (?,?)',
                [Content, userName(req)]);
        }
        await logAudit(req, {
            module: MODULE,
            action: 'UPDATE_SCW_STANDARD',
            targetType: 'SCW_Standard',
            targetId: rows[0]?.id || 'new',
            detail: 'Updated Stop-Call-Wait standard',
        });
        res.json({ success: true, message: 'บันทึกเนื้อหา Stop-Call-Wait สำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถบันทึกมาตรฐาน Stop-Call-Wait ได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ojt/records  — one record per department
// ─────────────────────────────────────────────────────────────────────────────
router.get('/records', async (req, res) => {
    try {
        await ensureTables();

        // Get all departments from master
        const [depts] = await db.query('SELECT Name FROM Master_Departments ORDER BY Name ASC');

        // Get existing OJT records
        const [records] = await db.query('SELECT * FROM OJT_Records ORDER BY Department ASC');
        const recordMap = {};
        records.forEach(r => { recordMap[r.Department] = r; });

        // Merge: every dept from master gets a row (with or without OJT data)
        const merged = depts.map(d => recordMap[d.Name] || {
            id: null,
            Department: d.Name,
            OJTDate: null,
            NextReviewDate: null,
            ReviewIntervalMonths: 12,
            TrainerName: null,
            AttendeeCount: 0,
            Notes: null,
        });

        // Also include any OJT records whose dept is NOT in master (legacy)
        records.forEach(r => {
            if (!depts.find(d => d.Name === r.Department)) merged.push(r);
        });

        res.json({ success: true, data: merged });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถโหลดข้อมูล OJT ได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ojt/records  — upsert by Department (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/records', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Department, OJTDate, ReviewIntervalMonths, TrainerName, AttendeeCount, Notes, YearlyTarget } = req.body;

        const department = cleanText(Department, 100);
        const ojtDate = normalizeDate(OJTDate);
        const interval = Number(ReviewIntervalMonths) || 12;
        const attendeeCount = nonNegativeInt(AttendeeCount, 0);
        const yearlyTarget = YearlyTarget !== undefined && YearlyTarget !== ''
            ? nonNegativeInt(YearlyTarget, null)
            : null;

        if (!department || !ojtDate) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกแผนกและวันที่ OJT ให้ถูกต้อง' });
        }
        if (!VALID_REVIEW_INTERVALS.includes(interval)) {
            return res.status(400).json({ success: false, message: 'รอบการทบทวนต้องเป็น 6, 12 หรือ 24 เดือน' });
        }
        if (attendeeCount === null) {
            return res.status(400).json({ success: false, message: 'จำนวนผู้เข้าร่วมต้องเป็นตัวเลข 0 ขึ้นไป' });
        }
        if (yearlyTarget === null && YearlyTarget !== undefined && YearlyTarget !== '') {
            return res.status(400).json({ success: false, message: 'เป้าหมายรายปีต้องเป็นตัวเลข 0 ขึ้นไป' });
        }

        const nextReview = new Date(`${ojtDate}T00:00:00`);
        nextReview.setMonth(nextReview.getMonth() + interval);
        const nextReviewDate = nextReview.toISOString().split('T')[0];

        // UPSERT — one record per department
        await db.query(
            `INSERT INTO OJT_Records
             (Department, OJTDate, NextReviewDate, ReviewIntervalMonths, TrainerName, AttendeeCount, Notes, YearlyTarget, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             OJTDate=VALUES(OJTDate), NextReviewDate=VALUES(NextReviewDate),
             ReviewIntervalMonths=VALUES(ReviewIntervalMonths),
             TrainerName=VALUES(TrainerName), AttendeeCount=VALUES(AttendeeCount),
             Notes=VALUES(Notes), YearlyTarget=VALUES(YearlyTarget)`,
            [
                department, ojtDate, nextReviewDate, interval,
                cleanText(TrainerName, 255), attendeeCount,
                cleanText(Notes, 5000), yearlyTarget, userName(req)
            ]
        );
        // Save to history
        await db.query(
            `INSERT INTO OJT_History
             (Department, OJTDate, NextReviewDate, ReviewIntervalMonths, TrainerName, AttendeeCount, Notes, RecordedBy)
             VALUES (?,?,?,?,?,?,?,?)`,
            [department, ojtDate, nextReviewDate, interval,
             cleanText(TrainerName, 255), attendeeCount, cleanText(Notes, 5000), userName(req)]
        );

        await logAudit(req, {
            module: MODULE,
            action: 'UPSERT_OJT_RECORD',
            targetType: 'OJT_Records',
            targetId: department,
            detail: `Saved OJT record for ${department}`,
            metadata: { Department: department, OJTDate: ojtDate, ReviewIntervalMonths: interval, AttendeeCount: attendeeCount, YearlyTarget: yearlyTarget }
        });

        res.json({ success: true, message: `บันทึก OJT แผนก ${department} สำเร็จ` });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถบันทึกข้อมูล OJT ได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ojt/history/:department  — OJT history for one department
// ─────────────────────────────────────────────────────────────────────────────
router.get('/history/:department', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query(
            'SELECT * FROM OJT_History WHERE Department=? ORDER BY RecordedAt DESC LIMIT 20',
            [req.params.department]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถโหลดประวัติ OJT ได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ojt/documents  — list SCW documents
// ─────────────────────────────────────────────────────────────────────────────
router.get('/documents', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT * FROM SCW_Documents ORDER BY id DESC');
        res.json({ success: true, data: rows });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถโหลดเอกสาร SCW ได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ojt/documents  — save document metadata (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/documents', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Title, FileURL, FileType, FileSizeKB } = req.body;
        const title = cleanText(Title, 255);
        const fileUrl = normalizeUploadUrl(FileURL);
        const fileSize = nonNegativeInt(FileSizeKB, 0);
        if (!title || !fileUrl) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อเอกสารและไฟล์ที่อัปโหลดให้ถูกต้อง' });
        }
        if (fileSize === null) {
            return res.status(400).json({ success: false, message: 'ขนาดไฟล์ต้องเป็นตัวเลข 0 ขึ้นไป' });
        }
        await db.query(
            'INSERT INTO SCW_Documents (Title, FileURL, FileType, FileSizeKB, UploadedBy) VALUES (?,?,?,?,?)',
            [title, fileUrl, cleanText(FileType, 50), fileSize, userName(req)]
        );
        await logAudit(req, {
            module: MODULE,
            action: 'CREATE_SCW_DOCUMENT',
            targetType: 'SCW_Documents',
            targetId: title,
            detail: `Uploaded SCW document: ${title}`,
            metadata: { Title: title, FileType: cleanText(FileType, 50), FileSizeKB: fileSize }
        });
        res.json({ success: true, message: 'อัปโหลดเอกสาร SCW สำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถบันทึกเอกสาร SCW ได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/ojt/documents/:id  — delete SCW document (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/documents/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isPositiveId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'รหัสเอกสารไม่ถูกต้อง' });
        }
        const [[doc]] = await db.query('SELECT FileURL FROM SCW_Documents WHERE id=?', [req.params.id]);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'ไม่พบเอกสาร SCW ที่ต้องการลบ' });
        }
        const [result] = await db.query('DELETE FROM SCW_Documents WHERE id=?', [req.params.id]);
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'ไม่พบเอกสาร SCW ที่ต้องการลบ' });
        }
        tryDeleteLocalUpload(doc.FileURL);
        await logAudit(req, {
            module: MODULE,
            action: 'DELETE_SCW_DOCUMENT',
            targetType: 'SCW_Documents',
            targetId: req.params.id,
            detail: 'Deleted SCW document'
        });
        res.json({ success: true, message: 'ลบเอกสาร SCW สำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถลบเอกสาร SCW ได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/ojt/records/:id  — clear OJT data for a department (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/records/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isPositiveId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'รหัสข้อมูล OJT ไม่ถูกต้อง' });
        }
        const [[row]] = await db.query('SELECT Department FROM OJT_Records WHERE id=?', [req.params.id]);
        const [result] = await db.query('DELETE FROM OJT_Records WHERE id=?', [req.params.id]);
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูล OJT ที่ต้องการลบ' });
        }
        await logAudit(req, {
            module: MODULE,
            action: 'DELETE_OJT_RECORD',
            targetType: 'OJT_Records',
            targetId: req.params.id,
            detail: `Deleted OJT record for ${row?.Department || req.params.id}`,
            metadata: { Department: row?.Department || null }
        });
        res.json({ success: true, message: 'ลบข้อมูล OJT สำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถลบข้อมูล OJT ได้');
    }
});

module.exports = router;
