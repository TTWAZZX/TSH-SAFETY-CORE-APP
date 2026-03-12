// backend/routes/contractor.js
// Auth (authenticateToken) applied at mount level in server.js
// Write/delete operations require isAdmin

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
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

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
            FileUrl     TEXT         NOT NULL,
            FileType    VARCHAR(20)  DEFAULT 'pdf',
            UploadedBy  VARCHAR(100),
            UploadedAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_cat (Category),
            KEY idx_date (UploadedAt)
        )
    `);

    tablesReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTS: LIST
// ─────────────────────────────────────────────────────────────────────────────
router.get('/documents', async (req, res) => {
    try {
        await ensureTables();
        const { category, q } = req.query;

        let sql = 'SELECT * FROM Contractor_Documents WHERE 1=1';
        const params = [];

        if (category && category !== 'all') {
            sql += ' AND Category = ?';
            params.push(category);
        }

        if (q && q.trim()) {
            sql += ' AND Title LIKE ?';
            params.push(`%${q.trim()}%`);
        }

        sql += ' ORDER BY UploadedAt DESC';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Contractor documents fetch error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลเอกสารได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTS: UPLOAD (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/documents', isAdmin, upload.single('file'), async (req, res) => {
    try {
        await ensureTables();

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด' });
        }

        const { Title, Category } = req.body;
        if (!Title || !Title.trim()) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อเอกสาร' });
        }

        const ALLOWED_CATEGORIES = [
            'Contractor Policy', 'Work Permit', 'Safety Procedure', 'Training', 'Forms', 'ทั่วไป'
        ];
        const safeCategory = ALLOWED_CATEGORIES.includes(Category) ? Category : 'ทั่วไป';

        const ext = (req.file.originalname || '').split('.').pop().toLowerCase();

        await db.query(
            `INSERT INTO Contractor_Documents (id, Title, Category, FileUrl, FileType, UploadedBy)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                uuidv4(),
                Title.trim(),
                safeCategory,
                req.file.path,
                ext || 'pdf',
                req.user.name || req.user.id,
            ]
        );

        res.status(201).json({ success: true, message: 'อัปโหลดเอกสารสำเร็จ' });
    } catch (error) {
        console.error('Contractor document upload error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปโหลดเอกสารได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTS: DELETE (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/documents/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;

        const [rows] = await db.query('SELECT id FROM Contractor_Documents WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบเอกสารที่ต้องการลบ' });
        }

        await db.query('DELETE FROM Contractor_Documents WHERE id = ?', [id]);
        res.json({ success: true, message: 'ลบเอกสารสำเร็จ' });
    } catch (error) {
        console.error('Contractor document delete error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบเอกสารได้' });
    }
});

module.exports = router;
