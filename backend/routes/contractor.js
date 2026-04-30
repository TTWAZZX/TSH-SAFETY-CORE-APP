// backend/routes/contractor.js
// Auth (authenticateToken) applied at mount level in server.js
// Write/delete operations require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { randomUUID } = require('crypto');
const cloudinary = require('cloudinary').v2;
const { isAdmin } = require('../middleware/auth');
const { storage: cloudinaryStorage, fileFilter } = require('../cloudinary');

const upload = multer({
    storage: cloudinaryStorage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
});

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const ALLOWED_CATEGORIES = [
    'Contractor Policy', 'Work Permit', 'Safety Procedure', 'Training', 'Forms', 'ทั่วไป',
];

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE TABLES
// ─────────────────────────────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS Contractor_Documents (
            id          VARCHAR(36)  NOT NULL PRIMARY KEY,
            Title       VARCHAR(255) NOT NULL,
            Category    VARCHAR(100) DEFAULT 'ทั่วไป',
            Description TEXT,
            FileUrl     TEXT         NOT NULL,
            PublicID    VARCHAR(255),
            FileType    VARCHAR(20)  DEFAULT 'pdf',
            FileSize    BIGINT       DEFAULT 0,
            UploadedBy  VARCHAR(100),
            UploadedAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_cat  (Category),
            KEY idx_date (UploadedAt)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Contractor_Activity_Log (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            ActionType VARCHAR(20)  NOT NULL,
            DocID      VARCHAR(36),
            DocTitle   VARCHAR(255),
            Category   VARCHAR(100),
            ActorName  VARCHAR(100),
            Detail     VARCHAR(255),
            CreatedAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_created (CreatedAt)
        )
    `);

    const colMigrations = [
        `ALTER TABLE Contractor_Documents ADD COLUMN Description TEXT AFTER Category`,
        `ALTER TABLE Contractor_Documents ADD COLUMN PublicID VARCHAR(255) AFTER FileUrl`,
        `ALTER TABLE Contractor_Documents ADD COLUMN FileSize BIGINT DEFAULT 0 AFTER FileType`,
        `ALTER TABLE Contractor_Documents ADD COLUMN UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER UploadedAt`,
    ];
    for (const sql of colMigrations) {
        try { await db.query(sql); } catch (_) { /* column already exists */ }
    }

    tablesReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function parseId(val) {
    const id = String(val || '').trim();
    if (!id) throw Object.assign(new Error('ID ไม่ถูกต้อง'), { status: 400 });
    return id;
}

function trim(val) {
    return typeof val === 'string' ? val.trim() : '';
}

async function logActivity(type, doc, actorName) {
    try {
        await db.query(
            `INSERT INTO Contractor_Activity_Log (ActionType, DocID, DocTitle, Category, ActorName)
             VALUES (?, ?, ?, ?, ?)`,
            [type, doc.id || null, (doc.Title || '').slice(0, 255), (doc.Category || '').slice(0, 100), (actorName || '').slice(0, 100)]
        );
    } catch (e) {
        console.warn('Activity log write failed:', e.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /documents — list with optional filters + date range
// ─────────────────────────────────────────────────────────────────────────────
router.get('/documents', async (req, res) => {
    try {
        await ensureTables();
        const { category, q, dateFrom, dateTo } = req.query;

        let sql = 'SELECT * FROM Contractor_Documents WHERE 1=1';
        const params = [];

        if (category && category !== 'all') {
            if (!ALLOWED_CATEGORIES.includes(category)) {
                return res.status(400).json({ success: false, message: 'หมวดหมู่ไม่ถูกต้อง' });
            }
            sql += ' AND Category = ?';
            params.push(category);
        }

        if (q && q.trim()) {
            sql += ' AND (Title LIKE ? OR Description LIKE ?)';
            const like = `%${q.trim()}%`;
            params.push(like, like);
        }

        if (dateFrom) {
            sql += ' AND DATE(UploadedAt) >= ?';
            params.push(dateFrom);
        }

        if (dateTo) {
            sql += ' AND DATE(UploadedAt) <= ?';
            params.push(dateTo);
        }

        sql += ' ORDER BY UploadedAt DESC';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows, total: rows.length });
    } catch (err) {
        console.error('Contractor documents fetch error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลเอกสารได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /documents/stats — aggregate counts by category
// ─────────────────────────────────────────────────────────────────────────────
router.get('/documents/stats', async (req, res) => {
    try {
        await ensureTables();

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total FROM Contractor_Documents`
        );
        const [byCategory] = await db.query(
            `SELECT Category, COUNT(*) AS cnt FROM Contractor_Documents GROUP BY Category ORDER BY cnt DESC`
        );
        const [[{ recentCount }]] = await db.query(
            `SELECT COUNT(*) AS recentCount FROM Contractor_Documents WHERE UploadedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
        );

        res.json({
            success: true,
            data: { total, byCategory, recentCount },
        });
    } catch (err) {
        console.error('Contractor stats error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลสถิติได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /activity — recent activity log
// ─────────────────────────────────────────────────────────────────────────────
router.get('/activity', async (req, res) => {
    try {
        await ensureTables();
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const [rows] = await db.query(
            `SELECT * FROM Contractor_Activity_Log ORDER BY CreatedAt DESC LIMIT ?`,
            [limit]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Contractor activity fetch error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลกิจกรรมได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /documents — upload (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/documents', isAdmin, upload.single('file'), async (req, res) => {
    try {
        await ensureTables();

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด' });
        }

        const title = trim(req.body.Title);
        if (!title) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อเอกสาร' });
        }
        if (title.length > 255) {
            return res.status(400).json({ success: false, message: 'ชื่อเอกสารยาวเกินไป (สูงสุด 255 ตัวอักษร)' });
        }

        const category    = ALLOWED_CATEGORIES.includes(trim(req.body.Category)) ? trim(req.body.Category) : 'ทั่วไป';
        const description = trim(req.body.Description).slice(0, 500) || null;
        const ext         = (req.file.originalname || '').split('.').pop().toLowerCase();
        const id          = randomUUID();
        const actorName   = req.user.name || req.user.id;

        await db.query(
            `INSERT INTO Contractor_Documents
                (id, Title, Category, Description, FileUrl, PublicID, FileType, FileSize, UploadedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, title, category, description, req.file.path, req.file.filename || null, ext || 'pdf', req.file.size || 0, actorName]
        );

        logActivity('upload', { id, Title: title, Category: category }, actorName);

        res.status(201).json({ success: true, message: 'อัปโหลดเอกสารสำเร็จ' });
    } catch (err) {
        console.error('Contractor document upload error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปโหลดเอกสารได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /documents/:id — update metadata (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/documents/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const id = parseId(req.params.id);

        const [rows] = await db.query('SELECT id, Title, Category FROM Contractor_Documents WHERE id = ?', [id]);
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'ไม่พบเอกสารที่ต้องการแก้ไข' });
        }

        const title = trim(req.body.Title);
        if (!title) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อเอกสาร' });
        }
        if (title.length > 255) {
            return res.status(400).json({ success: false, message: 'ชื่อเอกสารยาวเกินไป (สูงสุด 255 ตัวอักษร)' });
        }

        const category    = ALLOWED_CATEGORIES.includes(trim(req.body.Category)) ? trim(req.body.Category) : rows[0].Category;
        const description = trim(req.body.Description).slice(0, 500) || null;
        const actorName   = req.user.name || req.user.id;

        await db.query(
            `UPDATE Contractor_Documents SET Title = ?, Category = ?, Description = ? WHERE id = ?`,
            [title, category, description, id]
        );

        logActivity('edit', { id, Title: title, Category: category }, actorName);

        res.json({ success: true, message: 'อัปเดตข้อมูลเอกสารสำเร็จ' });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
        console.error('Contractor document update error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตข้อมูลเอกสารได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /documents/:id — hard delete + Cloudinary cleanup (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/documents/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const id = parseId(req.params.id);

        const [rows] = await db.query(
            'SELECT id, Title, Category, PublicID FROM Contractor_Documents WHERE id = ?',
            [id]
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'ไม่พบเอกสารที่ต้องการลบ' });
        }

        const { Title, Category, PublicID } = rows[0];
        const actorName = req.user.name || req.user.id;

        await db.query('DELETE FROM Contractor_Documents WHERE id = ?', [id]);

        logActivity('delete', { id, Title, Category }, actorName);

        if (PublicID) {
            cloudinary.uploader.destroy(PublicID).catch(e =>
                console.warn('Cloudinary delete warning:', PublicID, e?.message)
            );
        }

        res.json({ success: true, message: 'ลบเอกสารสำเร็จ' });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
        console.error('Contractor document delete error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบเอกสารได้' });
    }
});

module.exports = router;
