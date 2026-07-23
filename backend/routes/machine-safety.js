// backend/routes/machine-safety.js
// Auth (authenticateToken) applied at mount level
// Write operations require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { storage, fileFilter, deleteLocalUpload } = require('../storage');
const { isAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });
const MODULE = 'machine-safety';
const VALID_FILE_CATEGORIES = ['SafetyDeviceStandard', 'LayoutCheckpoint'];
const VALID_MACHINE_STATUS = ['active', 'maintenance', 'inactive', 'restricted', 'locked'];
const VALID_RISK_LEVELS = ['low', 'medium', 'high', 'critical'];
const VALID_ISSUE_SEVERITY = ['low', 'medium', 'high', 'critical'];

function serverError(res, err, message = 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง') {
    console.error('[machine-safety]', err);
    return res.status(500).json({ success: false, message });
}

function userName(req) {
    return req.user?.name || req.user?.EmployeeName || req.user?.id || req.user?.EmployeeID || 'System';
}

function isPositiveId(value) {
    return /^\d+$/.test(String(value || '')) && Number(value) > 0;
}

function cleanText(value, max = 255) {
    return String(value || '').trim().slice(0, max);
}

function normalizeDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const [year, month, day] = raw.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return raw;
}

function normalizeUrl(value) {
    const raw = cleanText(value, 1024);
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return raw;
    } catch (_) {}
    return '';
}

async function machineExists(id) {
    if (!isPositiveId(id)) return false;
    const [[row]] = await db.query('SELECT id FROM Machine_Safety WHERE id = ? LIMIT 1', [id]);
    return !!row;
}

function tryDeleteLocalUpload(fileUrl) {
    try {
        return deleteLocalUpload(fileUrl);
    } catch (err) {
        console.warn('[machine-safety] local file cleanup failed:', err.message);
        setTimeout(() => {
            try { deleteLocalUpload(fileUrl); } catch (_) {}
        }, 1500);
        return false;
    }
}

function normalizeAreas(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(',');
    const seen = new Set();
    return raw.map(v => cleanText(v, 100)).filter(Boolean).filter(v => {
        const key = v.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function nextDocumentNo(executor = db) {
    const year = new Date().getFullYear();
    const prefix = `MSD-${year}-`;
    const [rows] = await executor.query(
        'SELECT MachineCode FROM Machine_Safety WHERE MachineCode LIKE ? ORDER BY MachineCode DESC LIMIT 1',
        [`${prefix}%`]
    );
    const last = rows[0]?.MachineCode || '';
    let seq = parseInt(String(last).slice(prefix.length), 10);
    seq = Number.isFinite(seq) ? seq + 1 : 1;
    for (let guard = 0; guard < 20; guard++) {
        const code = `${prefix}${String(seq).padStart(4, '0')}`;
        const [[duplicate]] = await executor.query('SELECT id FROM Machine_Safety WHERE MachineCode = ? LIMIT 1', [code]);
        if (!duplicate) return code;
        seq++;
    }
    return `${prefix}${Date.now().toString().slice(-6)}`;
}

async function withDocumentNumberLock(work) {
    const connection = await db.getConnection();
    let locked = false;
    try {
        const [[row]] = await connection.query(
            'SELECT GET_LOCK(?, 5) AS acquired',
            ['machine_safety_document_number']
        );
        locked = Number(row?.acquired) === 1;
        if (!locked) throw new Error('Machine Safety document number lock timeout');
        return await work(connection);
    } finally {
        if (locked) {
            try { await connection.query('SELECT RELEASE_LOCK(?)', ['machine_safety_document_number']); } catch (_) {}
        }
        connection.release();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE / MIGRATE TABLES (called once on first request)
// ─────────────────────────────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS Machine_Safety (
            id INT AUTO_INCREMENT PRIMARY KEY,
            MachineCode VARCHAR(50) NOT NULL,
            MachineName VARCHAR(255) NOT NULL,
            Department VARCHAR(100),
            Area VARCHAR(100),
            HasRiskAssessment TINYINT(1) DEFAULT 0,
            Remark TEXT,
            UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CreatedBy VARCHAR(100),
            UpdatedBy VARCHAR(100)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Machine_Safety_Files (
            id INT AUTO_INCREMENT PRIMARY KEY,
            MachineID INT NOT NULL,
            FileCategory VARCHAR(50) NOT NULL DEFAULT 'SafetyDeviceStandard',
            FileLabel VARCHAR(255),
            FileUrl VARCHAR(1024),
            UploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UploadedBy VARCHAR(100)
        )
    `);

    // Migrate: add FileCategory if table existed before this version
    try {
        await db.query(`ALTER TABLE Machine_Safety_Files ADD COLUMN FileCategory VARCHAR(50) NOT NULL DEFAULT 'SafetyDeviceStandard'`);
    } catch (_) { /* already exists */ }

    // Migrate: enterprise fields
    const migrations = [
        `ALTER TABLE Machine_Safety ADD COLUMN Status VARCHAR(20) NOT NULL DEFAULT 'active'`,
        `ALTER TABLE Machine_Safety MODIFY COLUMN Status VARCHAR(20) NOT NULL DEFAULT 'active'`,
        `ALTER TABLE Machine_Safety ADD COLUMN RiskLevel ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low'`,
        `ALTER TABLE Machine_Safety ADD COLUMN NextInspectionDate DATE DEFAULT NULL`,
        `ALTER TABLE Machine_Safety MODIFY COLUMN Area VARCHAR(500)`,
        `ALTER TABLE Machine_Safety ADD COLUMN EffectiveDate DATE DEFAULT NULL`,
        `ALTER TABLE Machine_Safety ADD COLUMN IssueBy VARCHAR(50) DEFAULT NULL`,
        `ALTER TABLE Machine_Safety ADD COLUMN IssueByName VARCHAR(255) DEFAULT NULL`,
        `ALTER TABLE Machine_Safety ADD COLUMN VerifiedBy VARCHAR(50) DEFAULT NULL`,
        `ALTER TABLE Machine_Safety ADD COLUMN VerifiedByName VARCHAR(255) DEFAULT NULL`,
    ];
    for (const sql of migrations) {
        try { await db.query(sql); } catch (_) { /* already exists */ }
    }

    await db.query(`
        CREATE TABLE IF NOT EXISTS Machine_Safety_Compliance (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            MachineID  INT NOT NULL,
            ItemCode   VARCHAR(10) NOT NULL,
            Status     ENUM('pass','fail','na') NOT NULL DEFAULT 'na',
            UpdatedAt  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UpdatedBy  VARCHAR(100),
            UNIQUE KEY uq_machine_item (MachineID, ItemCode)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Machine_Safety_Issues (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            MachineID   INT NOT NULL,
            Description TEXT NOT NULL,
            Severity    ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
            Status      ENUM('open','resolved') NOT NULL DEFAULT 'open',
            Resolution  TEXT,
            CreatedAt   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CreatedBy   VARCHAR(100),
            ResolvedAt  TIMESTAMP NULL DEFAULT NULL,
            ResolvedBy  VARCHAR(100),
            INDEX idx_machine (MachineID),
            INDEX idx_status  (Status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    tablesReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/machine-safety  — list all machines with per-category file counts
// HasSafetyDeviceStandard & HasLayoutCheckpoint are DERIVED from file counts
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const [machines] = await db.query(`
            SELECT m.*,
                (SELECT COUNT(*) FROM Machine_Safety_Files f
                 WHERE f.MachineID = m.id AND f.FileCategory = 'SafetyDeviceStandard') AS SafetyDeviceCount,
                (SELECT COUNT(*) FROM Machine_Safety_Files f
                 WHERE f.MachineID = m.id AND f.FileCategory = 'LayoutCheckpoint') AS LayoutCheckpointCount,
                (SELECT COUNT(*) FROM Machine_Safety_Compliance c
                 WHERE c.MachineID = m.id AND c.Status = 'pass') AS CompliancePassCount,
                (SELECT COUNT(*) FROM Machine_Safety_Compliance c
                 WHERE c.MachineID = m.id AND c.Status != 'na') AS ComplianceCheckedCount,
                (SELECT COUNT(*) FROM Machine_Safety_Issues i
                 WHERE i.MachineID = m.id AND i.Status = 'open') AS OpenIssueCount
            FROM Machine_Safety m
            ORDER BY m.MachineName ASC
        `);
        res.json({ success: true, data: machines });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถโหลดข้อมูลเครื่องจักรได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/machine-safety/:id/files  — all files for one machine
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/files', async (req, res) => {
    try {
        if (!isPositiveId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'รหัสข้อมูลเครื่องจักรไม่ถูกต้อง' });
        }
        const [files] = await db.query(
            `SELECT * FROM Machine_Safety_Files
             WHERE MachineID = ?
             ORDER BY FileCategory ASC, UploadedAt DESC`,
            [req.params.id]
        );
        res.json({ success: true, data: files });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถโหลดไฟล์แนบได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/machine-safety  — create machine (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { MachineName, Department, Area, Areas, HasRiskAssessment, Remark,
                Status, RiskLevel, NextInspectionDate, EffectiveDate,
                IssueBy, IssueByName, VerifiedBy, VerifiedByName } = req.body;

        const name = cleanText(MachineName, 255);
        const effectiveDate = normalizeDate(EffectiveDate);
        if (!name || !effectiveDate) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อเอกสารเครื่องจักรและวันบังคับใช้' });
        }
        const areaText = normalizeAreas(Areas ?? Area).join(', ');
        if (areaText.length > 500) {
            return res.status(400).json({ success: false, message: 'รายการพื้นที่ยาวเกิน 500 ตัวอักษร' });
        }
        if (Status && !VALID_MACHINE_STATUS.includes(Status)) {
            return res.status(400).json({ success: false, message: 'สถานะเครื่องจักรไม่ถูกต้อง' });
        }
        if (RiskLevel && !VALID_RISK_LEVELS.includes(RiskLevel)) {
            return res.status(400).json({ success: false, message: 'ระดับความเสี่ยงไม่ถูกต้อง' });
        }
        if (NextInspectionDate && !normalizeDate(NextInspectionDate)) {
            return res.status(400).json({ success: false, message: 'วันที่ตรวจสอบครั้งถัดไปไม่ถูกต้อง' });
        }

        const { result, code } = await withDocumentNumberLock(async connection => {
            const code = await nextDocumentNo(connection);
            const [result] = await connection.query(
                `INSERT INTO Machine_Safety
                 (MachineCode, MachineName, Department, Area, HasRiskAssessment, Remark,
                  Status, RiskLevel, NextInspectionDate, EffectiveDate,
                  IssueBy, IssueByName, VerifiedBy, VerifiedByName, CreatedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    code, name, cleanText(Department, 100), areaText,
                    HasRiskAssessment ? 1 : 0, cleanText(Remark, 5000),
                    Status || 'active', RiskLevel || 'low', normalizeDate(NextInspectionDate), effectiveDate,
                    cleanText(IssueBy, 50), cleanText(IssueByName, 255),
                    cleanText(VerifiedBy, 50), cleanText(VerifiedByName, 255), userName(req)
                ]
            );
            return { result, code };
        });
        await logAudit(req, {
            module: MODULE,
            action: 'CREATE_MACHINE_SAFETY_MACHINE',
            targetType: 'machine',
            targetId: result.insertId,
            detail: `Created machine ${code}`,
            metadata: { MachineCode: code, MachineName: name }
        });
        res.status(201).json({ success: true, message: 'เพิ่มข้อมูลเครื่องจักรสำเร็จ', id: result.insertId, MachineCode: code });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถเพิ่มข้อมูลเครื่องจักรได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/machine-safety/:id/links  — add URL link (no file upload, admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/links', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!(await machineExists(req.params.id))) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลเครื่องจักร' });
        }
        const { FileCategory, FileLabel, FileUrl } = req.body;
        const url = normalizeUrl(FileUrl);
        if (!url) return res.status(400).json({ success: false, message: 'กรุณาระบุ URL ที่ถูกต้อง' });
        if (FileCategory && !VALID_FILE_CATEGORIES.includes(FileCategory)) {
            return res.status(400).json({ success: false, message: 'ประเภทไฟล์ไม่ถูกต้อง' });
        }
        const category = FileCategory || 'SafetyDeviceStandard';
        const [result] = await db.query(
            `INSERT INTO Machine_Safety_Files (MachineID, FileCategory, FileLabel, FileUrl, UploadedBy)
             VALUES (?, ?, ?, ?, ?)`,
            [req.params.id, category, cleanText(FileLabel, 255) || url, url, userName(req)]
        );
        await logAudit(req, {
            module: MODULE,
            action: 'ADD_MACHINE_SAFETY_LINK',
            targetType: 'machine_file',
            targetId: result.insertId,
            detail: `Added ${category} link`,
            metadata: { MachineID: req.params.id, FileCategory: category }
        });
        res.json({ success: true, message: 'เพิ่ม URL สำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถเพิ่มลิงก์ไฟล์ได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/machine-safety/:id  — update machine (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!(await machineExists(req.params.id))) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลเครื่องจักร' });
        }
        const { MachineName, Department, Area, Areas, HasRiskAssessment, Remark,
                Status, RiskLevel, NextInspectionDate, EffectiveDate,
                IssueBy, IssueByName, VerifiedBy, VerifiedByName } = req.body;

        const [[existing]] = await db.query('SELECT MachineCode FROM Machine_Safety WHERE id = ? LIMIT 1', [req.params.id]);
        const name = cleanText(MachineName, 255);
        const effectiveDate = normalizeDate(EffectiveDate);
        if (!name || !effectiveDate) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อเอกสารเครื่องจักรและวันบังคับใช้' });
        }
        const areaText = normalizeAreas(Areas ?? Area).join(', ');
        if (areaText.length > 500) {
            return res.status(400).json({ success: false, message: 'รายการพื้นที่ยาวเกิน 500 ตัวอักษร' });
        }
        if (Status && !VALID_MACHINE_STATUS.includes(Status)) {
            return res.status(400).json({ success: false, message: 'สถานะเครื่องจักรไม่ถูกต้อง' });
        }
        if (RiskLevel && !VALID_RISK_LEVELS.includes(RiskLevel)) {
            return res.status(400).json({ success: false, message: 'ระดับความเสี่ยงไม่ถูกต้อง' });
        }
        if (NextInspectionDate && !normalizeDate(NextInspectionDate)) {
            return res.status(400).json({ success: false, message: 'วันที่ตรวจสอบครั้งถัดไปไม่ถูกต้อง' });
        }

        const updateDocument = async (executor, code) => {
            const [result] = await executor.query(
                `UPDATE Machine_Safety SET
                 MachineCode=?, MachineName=?, Department=?, Area=?,
                 HasRiskAssessment=?, Remark=?,
                 Status=?, RiskLevel=?, NextInspectionDate=?, EffectiveDate=?,
                 IssueBy=?, IssueByName=?, VerifiedBy=?, VerifiedByName=?, UpdatedBy=?
                 WHERE id=?`,
                [
                    code, name, cleanText(Department, 100), areaText,
                    HasRiskAssessment ? 1 : 0, cleanText(Remark, 5000),
                    Status || 'active', RiskLevel || 'low', normalizeDate(NextInspectionDate), effectiveDate,
                    cleanText(IssueBy, 50), cleanText(IssueByName, 255),
                    cleanText(VerifiedBy, 50), cleanText(VerifiedByName, 255),
                    userName(req), req.params.id
                ]
            );
            return result;
        };
        let code = existing?.MachineCode;
        let result;
        if (code) {
            result = await updateDocument(db, code);
        } else {
            ({ result, code } = await withDocumentNumberLock(async connection => {
                const generatedCode = await nextDocumentNo(connection);
                return { result: await updateDocument(connection, generatedCode), code: generatedCode };
            }));
        }
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลเครื่องจักร' });
        }
        await logAudit(req, {
            module: MODULE,
            action: 'UPDATE_MACHINE_SAFETY_MACHINE',
            targetType: 'machine',
            targetId: req.params.id,
            detail: `Updated machine ${code}`,
            metadata: { MachineCode: code, MachineName: name }
        });
        res.json({ success: true, message: 'อัปเดตข้อมูลเครื่องจักรสำเร็จ', MachineCode: code });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถอัปเดตข้อมูลเครื่องจักรได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/machine-safety/:id  — delete machine + its files (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', isAdmin, async (req, res) => {
    let connection;
    try {
        await ensureTables();
        if (!isPositiveId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'รหัสข้อมูลเครื่องจักรไม่ถูกต้อง' });
        }
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [[machine]] = await connection.query('SELECT id, MachineCode, MachineName FROM Machine_Safety WHERE id = ? LIMIT 1 FOR UPDATE', [req.params.id]);
        if (!machine) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลเครื่องจักร' });
        }
        const [files] = await connection.query('SELECT FileUrl FROM Machine_Safety_Files WHERE MachineID = ?', [req.params.id]);
        await connection.query('DELETE FROM Machine_Safety_Compliance WHERE MachineID = ?', [req.params.id]);
        await connection.query('DELETE FROM Machine_Safety_Issues WHERE MachineID = ?', [req.params.id]);
        await connection.query('DELETE FROM Machine_Safety_Files WHERE MachineID = ?', [req.params.id]);
        const [result] = await connection.query('DELETE FROM Machine_Safety WHERE id = ?', [req.params.id]);
        if (!result.affectedRows) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลเครื่องจักร' });
        }
        await connection.commit();
        files.forEach(file => tryDeleteLocalUpload(file.FileUrl));
        await logAudit(req, {
            module: MODULE,
            action: 'DELETE_MACHINE_SAFETY_MACHINE',
            targetType: 'machine',
            targetId: req.params.id,
            detail: `Deleted machine ${machine.MachineCode}`,
            metadata: { MachineCode: machine.MachineCode, MachineName: machine.MachineName, deletedFiles: files.length }
        });
        res.json({ success: true, message: 'ลบข้อมูลเครื่องจักรสำเร็จ' });
    } catch (err) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        return serverError(res, err, 'ไม่สามารถลบข้อมูลเครื่องจักรได้');
    } finally {
        connection?.release();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/machine-safety/:id/files  — upload file with category (admin)
// Body: FileCategory ('SafetyDeviceStandard' | 'LayoutCheckpoint'), FileLabel
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/files', isAdmin, upload.single('file'), async (req, res) => {
    try {
        await ensureTables();
        if (!(await machineExists(req.params.id))) {
            if (req.file?.path) tryDeleteLocalUpload(req.file.path);
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลเครื่องจักร' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์' });
        }

        const fileUrl = req.file.path;
        const { FileLabel, FileCategory } = req.body;

        if (FileCategory && !VALID_FILE_CATEGORIES.includes(FileCategory)) {
            tryDeleteLocalUpload(req.file.path);
            return res.status(400).json({ success: false, message: 'ประเภทไฟล์ไม่ถูกต้อง' });
        }
        const category = FileCategory || 'SafetyDeviceStandard';

        const [result] = await db.query(
            `INSERT INTO Machine_Safety_Files (MachineID, FileCategory, FileLabel, FileUrl, UploadedBy)
             VALUES (?, ?, ?, ?, ?)`,
            [req.params.id, category, cleanText(FileLabel, 255) || req.file.originalName || req.file.originalname, fileUrl, userName(req)]
        );
        await logAudit(req, {
            module: MODULE,
            action: 'UPLOAD_MACHINE_SAFETY_FILE',
            targetType: 'machine_file',
            targetId: result.insertId,
            detail: `Uploaded ${category} file`,
            metadata: { MachineID: req.params.id, FileCategory: category, filename: req.file.originalName || req.file.originalname }
        });
        res.json({ success: true, message: 'อัปโหลดไฟล์สำเร็จ' });
    } catch (err) {
        if (req.file?.path) tryDeleteLocalUpload(req.file.path);
        return serverError(res, err, 'ไม่สามารถอัปโหลดไฟล์ได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/machine-safety/files/:fileId  — delete file (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/files/:fileId', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [[file]] = await db.query('SELECT FileUrl FROM Machine_Safety_Files WHERE id = ?', [req.params.fileId]);
        if (!file) {
            return res.status(404).json({ success: false, message: 'ไม่พบไฟล์แนบ' });
        }
        const [result] = await db.query('DELETE FROM Machine_Safety_Files WHERE id = ?', [req.params.fileId]);
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'ไม่พบไฟล์แนบ' });
        }
        tryDeleteLocalUpload(file?.FileUrl);
        await logAudit(req, {
            module: MODULE,
            action: 'DELETE_MACHINE_SAFETY_FILE',
            targetType: 'machine_file',
            targetId: req.params.fileId,
            detail: 'Deleted machine safety file'
        });
        res.json({ success: true, message: 'ลบไฟล์สำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถลบไฟล์ได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/machine-safety/:id/compliance  — compliance items for one machine
// ─────────────────────────────────────────────────────────────────────────────
const COMPLIANCE_CODES = ['5.1','5.2','5.3','5.4','5.5','5.6','5.7','5.8'];

router.get('/:id/compliance', async (req, res) => {
    try {
        if (!isPositiveId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'รหัสข้อมูลเครื่องจักรไม่ถูกต้อง' });
        }
        const [rows] = await db.query(
            `SELECT ItemCode, Status, UpdatedAt, UpdatedBy
             FROM Machine_Safety_Compliance WHERE MachineID = ? ORDER BY ItemCode ASC`,
            [req.params.id]
        );
        const map  = Object.fromEntries(rows.map(r => [r.ItemCode, r]));
        const data = COMPLIANCE_CODES.map(code => map[code] || { ItemCode: code, Status: 'na', UpdatedAt: null, UpdatedBy: null });
        res.json({ success: true, data });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถโหลดข้อมูล Compliance ได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/machine-safety/:id/compliance  — batch upsert compliance (admin)
// Body: { items: [{ ItemCode, Status }] }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/compliance', isAdmin, async (req, res) => {
    let connection;
    try {
        await ensureTables();
        if (!(await machineExists(req.params.id))) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลเครื่องจักร' });
        }
        const items = req.body.items;
        if (!Array.isArray(items) || items.length > COMPLIANCE_CODES.length) {
            return res.status(400).json({ success: false, message: 'รูปแบบข้อมูล Compliance ไม่ถูกต้อง' });
        }
        const validStatus = ['pass', 'fail', 'na'];
        const seenCodes = new Set();
        const hasInvalidItem = items.some(item => {
            if (!COMPLIANCE_CODES.includes(item?.ItemCode)
                || !validStatus.includes(item?.Status)
                || seenCodes.has(item.ItemCode)) return true;
            seenCodes.add(item.ItemCode);
            return false;
        });
        if (hasInvalidItem) {
            return res.status(400).json({ success: false, message: 'รายการ Compliance ไม่ถูกต้องหรือซ้ำกัน' });
        }
        connection = await db.getConnection();
        await connection.beginTransaction();
        for (const item of items) {
            await connection.query(
                `INSERT INTO Machine_Safety_Compliance (MachineID, ItemCode, Status, UpdatedBy)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE Status=VALUES(Status), UpdatedBy=VALUES(UpdatedBy)`,
                [req.params.id, item.ItemCode, item.Status, userName(req)]
            );
        }
        await connection.commit();
        await logAudit(req, {
            module: MODULE,
            action: 'UPDATE_MACHINE_SAFETY_COMPLIANCE',
            targetType: 'machine',
            targetId: req.params.id,
            detail: 'Updated machine safety compliance',
            metadata: { itemCount: items.length }
        });
        res.json({ success: true, message: 'บันทึก Compliance สำเร็จ' });
    } catch (err) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        return serverError(res, err, 'ไม่สามารถบันทึก Compliance ได้');
    } finally {
        connection?.release();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/machine-safety/:id/issues  — issues for one machine
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/issues', async (req, res) => {
    try {
        if (!isPositiveId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'รหัสข้อมูลเครื่องจักรไม่ถูกต้อง' });
        }
        const [rows] = await db.query(
            `SELECT * FROM Machine_Safety_Issues WHERE MachineID = ? ORDER BY CreatedAt DESC`,
            [req.params.id]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถโหลดปัญหาของเครื่องจักรได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/machine-safety/:id/issues  — add issue (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/issues', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!(await machineExists(req.params.id))) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลเครื่องจักร' });
        }
        const { Description, Severity } = req.body;
        const description = cleanText(Description, 5000);
        if (!description) return res.status(400).json({ success: false, message: 'กรุณาระบุรายละเอียดปัญหา' });
        const [result] = await db.query(
            `INSERT INTO Machine_Safety_Issues (MachineID, Description, Severity, CreatedBy)
             VALUES (?, ?, ?, ?)`,
            [req.params.id, description, VALID_ISSUE_SEVERITY.includes(Severity) ? Severity : 'medium', userName(req)]
        );
        await logAudit(req, {
            module: MODULE,
            action: 'CREATE_MACHINE_SAFETY_ISSUE',
            targetType: 'machine_issue',
            targetId: result.insertId,
            detail: 'Created machine safety issue',
            metadata: { MachineID: req.params.id, Severity }
        });
        res.json({ success: true, message: 'เพิ่มปัญหาสำเร็จ', id: result.insertId });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถเพิ่มปัญหาได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/machine-safety/issues/:issueId  — resolve / reopen issue (admin)
// MUST be declared before PUT /:id to avoid /:id matching 'issues'
// ─────────────────────────────────────────────────────────────────────────────
router.put('/issues/:issueId', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Status, Resolution } = req.body;
        const validStatus = ['open', 'resolved'];
        if (!validStatus.includes(Status)) {
            return res.status(400).json({ success: false, message: 'สถานะปัญหาไม่ถูกต้อง' });
        }
        const status      = Status;
        const resolvedAt  = status === 'resolved' ? new Date() : null;
        const resolvedBy  = status === 'resolved' ? userName(req) : null;
        const [result] = await db.query(
            `UPDATE Machine_Safety_Issues
             SET Status=?, Resolution=?, ResolvedAt=?, ResolvedBy=? WHERE id=?`,
            [status, cleanText(Resolution, 5000) || null, resolvedAt, resolvedBy, req.params.issueId]
        );
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการปัญหา' });
        }
        await logAudit(req, {
            module: MODULE,
            action: 'UPDATE_MACHINE_SAFETY_ISSUE',
            targetType: 'machine_issue',
            targetId: req.params.issueId,
            detail: `Updated issue status to ${status}`,
            metadata: { Status: status }
        });
        res.json({ success: true, message: 'อัปเดตปัญหาสำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถอัปเดตปัญหาได้');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/machine-safety/issues/:issueId  — delete issue (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/issues/:issueId', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [result] = await db.query('DELETE FROM Machine_Safety_Issues WHERE id = ?', [req.params.issueId]);
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการปัญหา' });
        }
        await logAudit(req, {
            module: MODULE,
            action: 'DELETE_MACHINE_SAFETY_ISSUE',
            targetType: 'machine_issue',
            targetId: req.params.issueId,
            detail: 'Deleted machine safety issue'
        });
        res.json({ success: true, message: 'ลบปัญหาสำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถลบปัญหาได้');
    }
});

module.exports = router;
