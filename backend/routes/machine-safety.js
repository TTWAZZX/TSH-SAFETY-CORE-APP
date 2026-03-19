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
        `ALTER TABLE Machine_Safety ADD COLUMN Status ENUM('active','maintenance','inactive') NOT NULL DEFAULT 'active'`,
        `ALTER TABLE Machine_Safety ADD COLUMN RiskLevel ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low'`,
        `ALTER TABLE Machine_Safety ADD COLUMN NextInspectionDate DATE DEFAULT NULL`,
    ];
    for (const sql of migrations) {
        try { await db.query(sql); } catch (_) { /* already exists */ }
    }

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
                 WHERE f.MachineID = m.id AND f.FileCategory = 'LayoutCheckpoint') AS LayoutCheckpointCount
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

        const validStatus    = ['active','maintenance','inactive'];
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

        const validStatus    = ['active','maintenance','inactive'];
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

module.exports = router;
