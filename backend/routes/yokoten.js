// backend/routes/yokoten.js
// Auth (authenticateToken) applied at mount level
// Write operations for topics require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// ─── ENSURE TABLE ─────────────────────────────────────────────────────────────
let tableReady = false;
async function ensureTables() {
    if (tableReady) return;

    // YokotenTopics — add new columns if not exist
    await db.query(`
        CREATE TABLE IF NOT EXISTS YokotenTopics (
            YokotenID       VARCHAR(36)  PRIMARY KEY,
            Title           VARCHAR(200) DEFAULT NULL,
            TopicDescription TEXT        NOT NULL,
            Category        VARCHAR(50)  DEFAULT 'ทั่วไป',
            RiskLevel       VARCHAR(20)  DEFAULT 'Low',
            DateIssued      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            Deadline        DATE         DEFAULT NULL,
            AttachmentUrl   TEXT         DEFAULT NULL,
            AttachmentName  VARCHAR(255) DEFAULT NULL,
            IsActive        TINYINT(1)   DEFAULT 1,
            CreatedBy       VARCHAR(100) DEFAULT NULL,
            UpdatedAt       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    // Migrate: add missing columns to existing table
    const migrations = [
        `ALTER TABLE YokotenTopics ADD COLUMN Title VARCHAR(200) DEFAULT NULL AFTER YokotenID`,
        `ALTER TABLE YokotenTopics ADD COLUMN Category VARCHAR(50) DEFAULT 'ทั่วไป' AFTER TopicDescription`,
        `ALTER TABLE YokotenTopics ADD COLUMN RiskLevel VARCHAR(20) DEFAULT 'Low' AFTER Category`,
        `ALTER TABLE YokotenTopics ADD COLUMN Deadline DATE DEFAULT NULL AFTER DateIssued`,
        `ALTER TABLE YokotenTopics ADD COLUMN AttachmentUrl TEXT DEFAULT NULL AFTER Deadline`,
        `ALTER TABLE YokotenTopics ADD COLUMN AttachmentName VARCHAR(255) DEFAULT NULL AFTER AttachmentUrl`,
        `ALTER TABLE YokotenTopics ADD COLUMN IsActive TINYINT(1) DEFAULT 1 AFTER AttachmentName`,
        `ALTER TABLE YokotenTopics ADD COLUMN CreatedBy VARCHAR(100) DEFAULT NULL AFTER IsActive`,
        `ALTER TABLE YokotenTopics ADD COLUMN UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ];
    for (const sql of migrations) {
        try { await db.query(sql); } catch (_) { /* column already exists */ }
    }

    // YokotenResponses — ensure exists
    await db.query(`
        CREATE TABLE IF NOT EXISTS YokotenResponses (
            ResponseID      VARCHAR(36)  PRIMARY KEY,
            YokotenID       VARCHAR(36)  NOT NULL,
            TopicDescription TEXT,
            EmployeeID      VARCHAR(50)  NOT NULL,
            EmployeeName    VARCHAR(100) DEFAULT NULL,
            Department      VARCHAR(100) DEFAULT NULL,
            ResponseDate    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            IsRelated       VARCHAR(10)  DEFAULT 'No',
            Comment         TEXT,
            RecordedBy      VARCHAR(100) DEFAULT NULL,
            KEY idx_yokoten  (YokotenID),
            KEY idx_emp      (EmployeeID),
            KEY idx_dept     (Department)
        )
    `);

    tableReady = true;
}

// ─── GET /api/yokoten/topics ───────────────────────────────────────────────────
// Returns active topics + per-user response status
router.get('/topics', async (req, res) => {
    try {
        await ensureTables();
        const userId = req.user.id;
        const userDept = req.user.department;

        // All active topics
        const [topics] = await db.query(
            `SELECT * FROM YokotenTopics WHERE IsActive = 1 ORDER BY DateIssued DESC`
        );

        // My responses
        const [myResponses] = await db.query(
            `SELECT YokotenID, IsRelated, Comment, ResponseDate
             FROM YokotenResponses WHERE EmployeeID = ?`,
            [userId]
        );
        const myMap = new Map(myResponses.map(r => [r.YokotenID, r]));

        // Dept response counts per topic
        const [deptCounts] = await db.query(
            `SELECT YokotenID, COUNT(*) AS cnt
             FROM YokotenResponses WHERE Department = ?
             GROUP BY YokotenID`,
            [userDept]
        );
        const deptMap = new Map(deptCounts.map(d => [d.YokotenID, d.cnt]));

        const result = topics.map(t => ({
            ...t,
            myResponse: myMap.get(t.YokotenID) || null,
            deptResponseCount: deptMap.get(t.YokotenID) || 0,
        }));

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/yokoten/dept-status ─────────────────────────────────────────────
// Department response status for each topic (admin overview)
router.get('/dept-status', async (req, res) => {
    try {
        await ensureTables();
        const topicId = req.query.topicId;

        let sql = `
            SELECT r.YokotenID, r.Department,
                   COUNT(*) AS responseCount,
                   SUM(r.IsRelated = 'Yes') AS relatedCount,
                   MAX(r.ResponseDate) AS lastResponse
            FROM YokotenResponses r
        `;
        const params = [];
        if (topicId) {
            sql += ' WHERE r.YokotenID = ?';
            params.push(topicId);
        }
        sql += ' GROUP BY r.YokotenID, r.Department ORDER BY r.Department';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/yokoten/dept-history ────────────────────────────────────────────
// Response history for the current user's department
router.get('/dept-history', async (req, res) => {
    try {
        await ensureTables();
        const dept = req.user.department;
        const { topicId } = req.query;

        let sql = `
            SELECT r.*, t.Title, t.TopicDescription AS TopicTitle, t.RiskLevel, t.Category
            FROM YokotenResponses r
            LEFT JOIN YokotenTopics t ON t.YokotenID = r.YokotenID
            WHERE r.Department = ?
        `;
        const params = [dept];
        if (topicId) { sql += ' AND r.YokotenID = ?'; params.push(topicId); }
        sql += ' ORDER BY r.ResponseDate DESC LIMIT 100';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/yokoten/all-responses (admin) ───────────────────────────────────
router.get('/all-responses', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { topicId } = req.query;
        let sql = `
            SELECT r.*, t.Title, t.RiskLevel
            FROM YokotenResponses r
            LEFT JOIN YokotenTopics t ON t.YokotenID = r.YokotenID
        `;
        const params = [];
        if (topicId) { sql += ' WHERE r.YokotenID = ?'; params.push(topicId); }
        sql += ' ORDER BY r.ResponseDate DESC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/yokoten/pagedata (legacy compat) ────────────────────────────────
router.get('/pagedata', async (req, res) => {
    try {
        await ensureTables();
        const user = req.user;
        const [allTopics] = await db.query(
            'SELECT * FROM YokotenTopics WHERE IsActive = 1 ORDER BY DateIssued DESC'
        );
        const [myHistory] = await db.query(
            'SELECT * FROM YokotenResponses WHERE EmployeeID = ? ORDER BY ResponseDate DESC',
            [user.id]
        );
        const unacknowledgedCount = allTopics.length - myHistory.length;
        const lastAcknowledgedDate = myHistory.length > 0
            ? new Date(myHistory[0].ResponseDate).toLocaleDateString('th-TH')
            : 'N/A';
        res.json({
            success: true,
            data: {
                allTopics, myHistory,
                userStats: { unacknowledgedCount, acknowledgedCount: myHistory.length, lastAcknowledgedDate },
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/yokoten/acknowledge ────────────────────────────────────────────
router.post('/acknowledge', async (req, res) => {
    try {
        await ensureTables();
        const user = req.user;
        const { yokotenId, isRelated, comment } = req.body;

        const [topicRows] = await db.query(
            'SELECT * FROM YokotenTopics WHERE YokotenID = ?', [yokotenId]
        );
        if (topicRows.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบหัวข้อ Yokoten' });
        }

        // Check duplicate
        const [exist] = await db.query(
            'SELECT ResponseID FROM YokotenResponses WHERE YokotenID = ? AND EmployeeID = ?',
            [yokotenId, user.id]
        );
        if (exist.length > 0) {
            return res.status(409).json({ success: false, message: 'คุณได้รับทราบหัวข้อนี้แล้ว' });
        }

        const topic = topicRows[0];
        await db.query(
            `INSERT INTO YokotenResponses
             (ResponseID, YokotenID, TopicDescription, EmployeeID, EmployeeName,
              Department, ResponseDate, IsRelated, Comment, RecordedBy)
             VALUES (?,?,?,?,?,?,NOW(),?,?,?)`,
            [
                uuidv4(), yokotenId, topic.TopicDescription,
                user.id, user.name, user.department,
                isRelated || 'No', comment || '', user.name,
            ]
        );
        res.json({ success: true, message: 'บันทึกการรับทราบสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/yokoten/topics (admin) ─────────────────────────────────────────
router.post('/topics', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const {
            Title, TopicDescription, Category, RiskLevel,
            DateIssued, Deadline, AttachmentUrl, AttachmentName,
        } = req.body;

        if (!TopicDescription) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกรายละเอียดหัวข้อ' });
        }

        const id = uuidv4();
        await db.query(
            `INSERT INTO YokotenTopics
             (YokotenID, Title, TopicDescription, Category, RiskLevel,
              DateIssued, Deadline, AttachmentUrl, AttachmentName, IsActive, CreatedBy)
             VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
            [
                id, Title || null, TopicDescription,
                Category || 'ทั่วไป', RiskLevel || 'Low',
                DateIssued || new Date(), Deadline || null,
                AttachmentUrl || null, AttachmentName || null,
                req.user.name,
            ]
        );
        res.json({ success: true, message: 'เพิ่มหัวข้อ Yokoten สำเร็จ', id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/yokoten/topics/:id (admin) ──────────────────────────────────────
router.put('/topics/:id', isAdmin, async (req, res) => {
    try {
        const {
            Title, TopicDescription, Category, RiskLevel,
            DateIssued, Deadline, AttachmentUrl, AttachmentName, IsActive,
        } = req.body;

        if (!TopicDescription) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกรายละเอียดหัวข้อ' });
        }

        await db.query(
            `UPDATE YokotenTopics
             SET Title=?, TopicDescription=?, Category=?, RiskLevel=?,
                 DateIssued=?, Deadline=?, AttachmentUrl=?, AttachmentName=?, IsActive=?
             WHERE YokotenID=?`,
            [
                Title || null, TopicDescription, Category || 'ทั่วไป', RiskLevel || 'Low',
                DateIssued || new Date(), Deadline || null,
                AttachmentUrl || null, AttachmentName || null,
                IsActive !== undefined ? (IsActive ? 1 : 0) : 1,
                req.params.id,
            ]
        );
        res.json({ success: true, message: 'อัปเดตหัวข้อ Yokoten สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /api/yokoten/topics/:id (admin) ───────────────────────────────────
router.delete('/topics/:id', isAdmin, async (req, res) => {
    try {
        const [responses] = await db.query(
            'SELECT COUNT(*) AS cnt FROM YokotenResponses WHERE YokotenID = ?',
            [req.params.id]
        );
        if (responses[0].cnt > 0) {
            // Soft delete
            await db.query('UPDATE YokotenTopics SET IsActive = 0 WHERE YokotenID = ?', [req.params.id]);
            return res.json({ success: true, message: 'ปิดการใช้งานหัวข้อแล้ว (มีการตอบกลับอยู่)' });
        }
        await db.query('DELETE FROM YokotenTopics WHERE YokotenID = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบหัวข้อสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
