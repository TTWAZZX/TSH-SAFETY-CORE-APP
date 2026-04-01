// backend/routes/machine-safety.js
// Auth (authenticateToken) applied at mount level
// Write operations require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { storage, fileFilter } = require('../cloudinary');
const { isAdmin } = require('../middleware/auth');

const upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

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
        await ensureTables();
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
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/machine-safety/:id/files  — all files for one machine
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/files', async (req, res) => {
    try {
        await ensureTables();
        const [files] = await db.query(
            `SELECT * FROM Machine_Safety_Files
             WHERE MachineID = ?
             ORDER BY FileCategory ASC, UploadedAt DESC`,
            [req.params.id]
        );
        res.json({ success: true, data: files });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/machine-safety  — create machine (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { MachineCode, MachineName, Department, Area, HasRiskAssessment, Remark,
                Status, RiskLevel, NextInspectionDate } = req.body;

        if (!MachineCode || !MachineName) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสและชื่อเครื่องจักร' });
        }

        const validStatus    = ['active','maintenance','inactive','restricted','locked'];
        const validRiskLevel = ['low','medium','high','critical'];

        const [result] = await db.query(
            `INSERT INTO Machine_Safety
             (MachineCode, MachineName, Department, Area, HasRiskAssessment, Remark,
              Status, RiskLevel, NextInspectionDate, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                MachineCode, MachineName, Department || '', Area || '',
                HasRiskAssessment ? 1 : 0, Remark || '',
                validStatus.includes(Status) ? Status : 'active',
                validRiskLevel.includes(RiskLevel) ? RiskLevel : 'low',
                NextInspectionDate || null,
                req.user.name
            ]
        );
        res.json({ success: true, message: 'เพิ่มข้อมูลเครื่องจักรสำเร็จ', id: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/machine-safety/:id/links  — add URL link (no file upload, admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/links', isAdmin, async (req, res) => {
    try {
        const { FileCategory, FileLabel, FileUrl } = req.body;
        if (!FileUrl) return res.status(400).json({ success: false, message: 'กรุณาระบุ URL' });
        const validCategories = ['SafetyDeviceStandard', 'LayoutCheckpoint'];
        const category = validCategories.includes(FileCategory) ? FileCategory : 'SafetyDeviceStandard';
        await db.query(
            `INSERT INTO Machine_Safety_Files (MachineID, FileCategory, FileLabel, FileUrl, UploadedBy)
             VALUES (?, ?, ?, ?, ?)`,
            [req.params.id, category, FileLabel || FileUrl, FileUrl, req.user.name]
        );
        res.json({ success: true, message: 'เพิ่ม URL สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/machine-safety/:id  — update machine (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { MachineCode, MachineName, Department, Area, HasRiskAssessment, Remark,
                Status, RiskLevel, NextInspectionDate } = req.body;

        if (!MachineCode || !MachineName) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสและชื่อเครื่องจักร' });
        }

        const validStatus    = ['active','maintenance','inactive','restricted','locked'];
        const validRiskLevel = ['low','medium','high','critical'];

        await db.query(
            `UPDATE Machine_Safety SET
             MachineCode=?, MachineName=?, Department=?, Area=?,
             HasRiskAssessment=?, Remark=?,
             Status=?, RiskLevel=?, NextInspectionDate=?, UpdatedBy=?
             WHERE id=?`,
            [
                MachineCode, MachineName, Department || '', Area || '',
                HasRiskAssessment ? 1 : 0, Remark || '',
                validStatus.includes(Status) ? Status : 'active',
                validRiskLevel.includes(RiskLevel) ? RiskLevel : 'low',
                NextInspectionDate || null,
                req.user.name, req.params.id
            ]
        );
        res.json({ success: true, message: 'อัปเดตข้อมูลเครื่องจักรสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/machine-safety/:id  — delete machine + its files (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        await db.query('DELETE FROM Machine_Safety_Compliance WHERE MachineID = ?', [req.params.id]);
        await db.query('DELETE FROM Machine_Safety_Issues WHERE MachineID = ?', [req.params.id]);
        await db.query('DELETE FROM Machine_Safety_Files WHERE MachineID = ?', [req.params.id]);
        await db.query('DELETE FROM Machine_Safety WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลเครื่องจักรสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/machine-safety/:id/files  — upload file with category (admin)
// Body: FileCategory ('SafetyDeviceStandard' | 'LayoutCheckpoint'), FileLabel
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/files', isAdmin, upload.single('file'), async (req, res) => {
    try {
        await ensureTables();
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์' });
        }

        const fileUrl = req.file.path || req.file.secure_url;
        const { FileLabel, FileCategory } = req.body;

        const validCategories = ['SafetyDeviceStandard', 'LayoutCheckpoint'];
        const category = validCategories.includes(FileCategory) ? FileCategory : 'SafetyDeviceStandard';

        await db.query(
            `INSERT INTO Machine_Safety_Files (MachineID, FileCategory, FileLabel, FileUrl, UploadedBy)
             VALUES (?, ?, ?, ?, ?)`,
            [req.params.id, category, FileLabel || req.file.originalname, fileUrl, req.user.name]
        );
        res.json({ success: true, message: 'อัปโหลดไฟล์สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/machine-safety/files/:fileId  — delete file (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/files/:fileId', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Machine_Safety_Files WHERE id = ?', [req.params.fileId]);
        res.json({ success: true, message: 'ลบไฟล์สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/machine-safety/:id/compliance  — compliance items for one machine
// ─────────────────────────────────────────────────────────────────────────────
const COMPLIANCE_CODES = ['5.1','5.2','5.3','5.4','5.5','5.6','5.7','5.8'];

router.get('/:id/compliance', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query(
            `SELECT ItemCode, Status, UpdatedAt, UpdatedBy
             FROM Machine_Safety_Compliance WHERE MachineID = ? ORDER BY ItemCode ASC`,
            [req.params.id]
        );
        const map  = Object.fromEntries(rows.map(r => [r.ItemCode, r]));
        const data = COMPLIANCE_CODES.map(code => map[code] || { ItemCode: code, Status: 'na', UpdatedAt: null, UpdatedBy: null });
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/machine-safety/:id/compliance  — batch upsert compliance (admin)
// Body: { items: [{ ItemCode, Status }] }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/compliance', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const items       = req.body.items || [];
        const validStatus = ['pass', 'fail', 'na'];
        for (const item of items) {
            if (!COMPLIANCE_CODES.includes(item.ItemCode)) continue;
            const status = validStatus.includes(item.Status) ? item.Status : 'na';
            await db.query(
                `INSERT INTO Machine_Safety_Compliance (MachineID, ItemCode, Status, UpdatedBy)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE Status=VALUES(Status), UpdatedBy=VALUES(UpdatedBy)`,
                [req.params.id, item.ItemCode, status, req.user.name]
            );
        }
        res.json({ success: true, message: 'บันทึก Compliance สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/machine-safety/:id/issues  — issues for one machine
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/issues', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query(
            `SELECT * FROM Machine_Safety_Issues WHERE MachineID = ? ORDER BY CreatedAt DESC`,
            [req.params.id]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/machine-safety/:id/issues  — add issue (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/issues', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Description, Severity } = req.body;
        if (!Description) return res.status(400).json({ success: false, message: 'กรุณาระบุรายละเอียดปัญหา' });
        const validSeverity = ['low', 'medium', 'high', 'critical'];
        const [result] = await db.query(
            `INSERT INTO Machine_Safety_Issues (MachineID, Description, Severity, CreatedBy)
             VALUES (?, ?, ?, ?)`,
            [req.params.id, Description, validSeverity.includes(Severity) ? Severity : 'medium', req.user.name]
        );
        res.json({ success: true, message: 'เพิ่มปัญหาสำเร็จ', id: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/machine-safety/issues/:issueId  — resolve / reopen issue (admin)
// MUST be declared before PUT /:id to avoid /:id matching 'issues'
// ─────────────────────────────────────────────────────────────────────────────
router.put('/issues/:issueId', isAdmin, async (req, res) => {
    try {
        const { Status, Resolution } = req.body;
        const validStatus = ['open', 'resolved'];
        const status      = validStatus.includes(Status) ? Status : 'open';
        const resolvedAt  = status === 'resolved' ? new Date() : null;
        const resolvedBy  = status === 'resolved' ? req.user.name : null;
        await db.query(
            `UPDATE Machine_Safety_Issues
             SET Status=?, Resolution=?, ResolvedAt=?, ResolvedBy=? WHERE id=?`,
            [status, Resolution || null, resolvedAt, resolvedBy, req.params.issueId]
        );
        res.json({ success: true, message: 'อัปเดตปัญหาสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/machine-safety/issues/:issueId  — delete issue (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/issues/:issueId', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Machine_Safety_Issues WHERE id = ?', [req.params.issueId]);
        res.json({ success: true, message: 'ลบปัญหาสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
