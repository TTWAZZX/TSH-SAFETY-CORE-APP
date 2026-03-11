// backend/routes/ojt.js
// Auth (authenticateToken) applied at mount level
// Write operations require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');

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

    // Migration: add AttendeeCount if existing table lacks it
    try {
        await db.query('ALTER TABLE OJT_Records ADD COLUMN AttendeeCount INT DEFAULT 0');
    } catch (_) { /* already exists */ }

    // Drop EmployeeID / EmployeeName columns if they exist (old schema)
    // (TiDB supports IF EXISTS in DROP COLUMN)
    for (const col of ['EmployeeID', 'EmployeeName']) {
        try { await db.query(`ALTER TABLE OJT_Records DROP COLUMN ${col}`); } catch (_) {}
    }

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
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/ojt/standard  (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/standard', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Content } = req.body;
        const [rows] = await db.query('SELECT id FROM SCW_Standard LIMIT 1');
        if (rows.length > 0) {
            await db.query('UPDATE SCW_Standard SET Content=?, UpdatedBy=? WHERE id=?',
                [Content, req.user.name, rows[0].id]);
        } else {
            await db.query('INSERT INTO SCW_Standard (Content, UpdatedBy) VALUES (?,?)',
                [Content, req.user.name]);
        }
        res.json({ success: true, message: 'บันทึกเนื้อหา Stop-Call-Wait สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ojt/records  — upsert by Department (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/records', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Department, OJTDate, ReviewIntervalMonths, TrainerName, AttendeeCount, Notes } = req.body;

        if (!Department || !OJTDate) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกแผนกและวันที่ OJT' });
        }

        const interval = parseInt(ReviewIntervalMonths) || 12;
        const nextReview = new Date(OJTDate);
        nextReview.setMonth(nextReview.getMonth() + interval);
        const nextReviewDate = nextReview.toISOString().split('T')[0];

        // UPSERT — one record per department
        await db.query(
            `INSERT INTO OJT_Records
             (Department, OJTDate, NextReviewDate, ReviewIntervalMonths, TrainerName, AttendeeCount, Notes, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             OJTDate=VALUES(OJTDate), NextReviewDate=VALUES(NextReviewDate),
             ReviewIntervalMonths=VALUES(ReviewIntervalMonths),
             TrainerName=VALUES(TrainerName), AttendeeCount=VALUES(AttendeeCount),
             Notes=VALUES(Notes)`,
            [
                Department, OJTDate, nextReviewDate, interval,
                TrainerName || '', parseInt(AttendeeCount) || 0,
                Notes || '', req.user.name
            ]
        );
        res.json({ success: true, message: `บันทึก OJT แผนก ${Department} สำเร็จ` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/ojt/records/:id  — clear OJT data for a department (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/records/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM OJT_Records WHERE id=?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูล OJT สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
