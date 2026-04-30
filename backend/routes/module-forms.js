// backend/routes/module-forms.js
// Form Templates per module (Hiyari, KY, etc.)
// GET — public read (authenticateToken at mount)
// POST/PUT/DELETE — admin only (isAdmin)

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { isAdmin } = require('../middleware/auth');
const { cloudinary, storage: cloudinaryStorage } = require('../cloudinary');

const ALLOWED_MODULES = ['hiyari', 'ky', 'fourm', 'general'];

const formFileFilter = (req, file, cb) => {
    const allowed = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg', 'image/png', 'image/webp',
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('ประเภทไฟล์ไม่รองรับ (รองรับ PDF, Word, Excel, รูปภาพ)'), false);
};

const upload = multer({
    storage: cloudinaryStorage,
    fileFilter: formFileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
});

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE TABLE
// ─────────────────────────────────────────────────────────────────────────────
let tableReady = false;
async function ensureTable() {
    if (tableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS Module_Forms (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            Module      VARCHAR(50)  NOT NULL,
            Title       VARCHAR(200) NOT NULL,
            Description TEXT,
            FileUrl     TEXT         NOT NULL,
            PublicID    VARCHAR(255),
            FileType    VARCHAR(100),
            FileSize    INT,
            Version     VARCHAR(30),
            IsActive    TINYINT(1)   NOT NULL DEFAULT 1,
            SortOrder   INT          NOT NULL DEFAULT 99,
            UploadedBy  VARCHAR(100),
            UploadedAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_module (Module),
            INDEX idx_active (IsActive)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    tableReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /module-forms?module=hiyari
// Returns active forms for a module, ordered by SortOrder then UploadedAt desc
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        await ensureTable();
        const { module, all } = req.query;
        const isAdminReq = req.user?.role === 'Admin';

        let sql = 'SELECT * FROM Module_Forms WHERE 1=1';
        const params = [];

        if (module) {
            if (!ALLOWED_MODULES.includes(module)) {
                return res.status(400).json({ success: false, message: 'Module ไม่ถูกต้อง' });
            }
            sql += ' AND Module = ?'; params.push(module);
        }

        // Non-admin always sees only active; admin sees all when ?all=1
        if (!isAdminReq || all !== '1') {
            sql += ' AND IsActive = 1';
        }

        sql += ' ORDER BY SortOrder ASC, UploadedAt DESC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /module-forms  (Admin — multipart, field: 'formFile')
// ─────────────────────────────────────────────────────────────────────────────
function _handleUpload(req, res, next) {
    upload.single('formFile')(req, res, (err) => {
        if (!err) return next();
        const msg = err?.message || 'อัปโหลดไฟล์ไม่สำเร็จ';
        console.error('[module-forms upload error]', msg);
        res.status(400).json({ success: false, message: msg });
    });
}

router.post('/', isAdmin, _handleUpload, async (req, res) => {
    try {
        await ensureTable();
        const { module, title, description, version, sortOrder } = req.body;

        if (!module || !ALLOWED_MODULES.includes(module)) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ module ที่ถูกต้อง' });
        }
        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแบบฟอร์ม' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์แบบฟอร์ม' });
        }

        const fileUrl  = req.file.path || req.file.secure_url || '';
        const publicId = req.file.filename || req.file.public_id || null;
        if (!fileUrl) {
            return res.status(500).json({ success: false, message: 'อัปโหลดไฟล์ไม่สำเร็จ: ไม่ได้รับ URL จาก storage' });
        }

        await db.query(`
            INSERT INTO Module_Forms
                (Module, Title, Description, FileUrl, PublicID, FileType, FileSize, Version, SortOrder, UploadedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            module,
            title.trim(),
            description?.trim() || null,
            fileUrl,
            publicId,
            req.file.mimetype || null,
            req.file.size || null,
            version?.trim() || null,
            sortOrder ? parseInt(sortOrder, 10) : 99,
            req.user.name || req.user.id,
        ]);

        res.json({ success: true, message: 'อัปโหลดแบบฟอร์มสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /module-forms/:id  (Admin — metadata only, no file re-upload here)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', isAdmin, async (req, res) => {
    try {
        await ensureTable();
        const id = parseInt(req.params.id, 10);
        if (!id || id <= 0) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });

        const { title, description, version, isActive, sortOrder } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแบบฟอร์ม' });
        }

        const [[row]] = await db.query('SELECT id FROM Module_Forms WHERE id = ?', [id]);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบแบบฟอร์ม' });

        await db.query(`
            UPDATE Module_Forms
            SET Title = ?, Description = ?, Version = ?, IsActive = ?, SortOrder = ?
            WHERE id = ?
        `, [
            title.trim(),
            description?.trim() || null,
            version?.trim() || null,
            isActive === false || isActive === 0 || isActive === '0' ? 0 : 1,
            sortOrder ? parseInt(sortOrder, 10) : 99,
            id,
        ]);

        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /module-forms/:id  (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', isAdmin, async (req, res) => {
    try {
        await ensureTable();
        const id = parseInt(req.params.id, 10);
        if (!id || id <= 0) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });

        const [[row]] = await db.query('SELECT id, PublicID, Title FROM Module_Forms WHERE id = ?', [id]);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบแบบฟอร์ม' });

        // Delete from Cloudinary (fire-and-forget)
        if (row.PublicID) {
            cloudinary.uploader.destroy(row.PublicID).catch(e =>
                console.warn('Module_Forms Cloudinary delete warn:', e.message)
            );
        }

        await db.query('DELETE FROM Module_Forms WHERE id = ?', [id]);
        res.json({ success: true, message: `ลบ "${row.Title}" สำเร็จ` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
