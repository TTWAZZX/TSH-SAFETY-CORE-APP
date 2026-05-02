// backend/routes/yokoten.js
// Auth (authenticateToken) applied at mount level
// Write operations for topics require isAdmin

const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { isAdmin } = require('../middleware/auth');
const { cloudinary, storage, fileFilter } = require('../cloudinary');
const multer   = require('multer');
const { randomUUID } = require('crypto');

// ─── Multer for response files (multiple, up to 10, 20MB each) ───────────────
const responseFileFilter = (req, file, cb) => {
    const allowed = [
        'image/jpeg','image/png','image/gif','image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`ประเภทไฟล์ไม่รองรับ: ${file.mimetype}`), false);
};
const uploadResponseFiles = multer({
    storage,
    fileFilter: responseFileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
}).array('responseFiles', 10);

// ─── ENSURE TABLES ────────────────────────────────────────────────────────────
let tableReady = false;
async function ensureTables() {
    if (tableReady) return;

    // YokotenTopics
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
            TargetDepts     TEXT         DEFAULT NULL,
            TargetUnits     TEXT         DEFAULT NULL,
            IsActive        TINYINT(1)   DEFAULT 1,
            CreatedBy       VARCHAR(100) DEFAULT NULL,
            UpdatedAt       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    // YokotenResponses — ONE per (YokotenID, Department)
    await db.query(`
        CREATE TABLE IF NOT EXISTS YokotenResponses (
            ResponseID      VARCHAR(36)  PRIMARY KEY,
            YokotenID       VARCHAR(36)  NOT NULL,
            Department      VARCHAR(100) NOT NULL,
            SafetyUnit      VARCHAR(100) DEFAULT NULL,
            EmployeeID      VARCHAR(50)  NOT NULL,
            EmployeeName    VARCHAR(100) DEFAULT NULL,
            IsRelated       VARCHAR(10)  DEFAULT 'No',
            Comment         TEXT,
            CorrectiveAction TEXT        DEFAULT NULL,
            ApprovalStatus  VARCHAR(20)  DEFAULT NULL,
            ApprovalComment TEXT         DEFAULT NULL,
            ApprovedBy      VARCHAR(100) DEFAULT NULL,
            ApprovedAt      DATETIME     DEFAULT NULL,
            ResponseDate    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_dept_topic (YokotenID, Department),
            KEY idx_yokoten (YokotenID),
            KEY idx_dept    (Department),
            KEY idx_emp     (EmployeeID)
        )
    `);

    // Yokoten_Response_Files
    await db.query(`
        CREATE TABLE IF NOT EXISTS Yokoten_Response_Files (
            FileID      VARCHAR(36)  PRIMARY KEY,
            ResponseID  VARCHAR(36)  NOT NULL,
            YokotenID   VARCHAR(36)  NOT NULL,
            Department  VARCHAR(100) DEFAULT NULL,
            FileName    VARCHAR(255) NOT NULL,
            FileURL     TEXT         NOT NULL,
            PublicID    VARCHAR(255) DEFAULT NULL,
            FileType    VARCHAR(100) DEFAULT NULL,
            FileSize    INT          DEFAULT NULL,
            UploadedBy  VARCHAR(100) DEFAULT NULL,
            CreatedAt   DATETIME     DEFAULT CURRENT_TIMESTAMP,
            KEY idx_response (ResponseID),
            KEY idx_yokoten  (YokotenID)
        )
    `);

    // Yokoten_Dashboard_Config
    await db.query(`
        CREATE TABLE IF NOT EXISTS Yokoten_Dashboard_Config (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            ConfigKey   VARCHAR(50)  NOT NULL UNIQUE,
            ConfigValue TEXT,
            UpdatedBy   VARCHAR(100),
            UpdatedAt   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    // Migrations — add new columns to existing tables
    const migrations = [
        `ALTER TABLE YokotenTopics ADD COLUMN Title VARCHAR(200) DEFAULT NULL AFTER YokotenID`,
        `ALTER TABLE YokotenTopics ADD COLUMN Category VARCHAR(50) DEFAULT 'ทั่วไป' AFTER TopicDescription`,
        `ALTER TABLE YokotenTopics ADD COLUMN RiskLevel VARCHAR(20) DEFAULT 'Low' AFTER Category`,
        `ALTER TABLE YokotenTopics ADD COLUMN Deadline DATE DEFAULT NULL AFTER DateIssued`,
        `ALTER TABLE YokotenTopics ADD COLUMN AttachmentUrl TEXT DEFAULT NULL AFTER Deadline`,
        `ALTER TABLE YokotenTopics ADD COLUMN AttachmentName VARCHAR(255) DEFAULT NULL AFTER AttachmentUrl`,
        `ALTER TABLE YokotenTopics ADD COLUMN TargetDepts TEXT DEFAULT NULL AFTER AttachmentName`,
        `ALTER TABLE YokotenTopics ADD COLUMN TargetUnits TEXT DEFAULT NULL AFTER TargetDepts`,
        `ALTER TABLE YokotenTopics ADD COLUMN IsActive TINYINT(1) DEFAULT 1 AFTER TargetUnits`,
        `ALTER TABLE YokotenTopics ADD COLUMN CreatedBy VARCHAR(100) DEFAULT NULL AFTER IsActive`,
        `ALTER TABLE YokotenTopics ADD COLUMN UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
        `ALTER TABLE YokotenResponses ADD COLUMN SafetyUnit VARCHAR(100) DEFAULT NULL AFTER Department`,
        `ALTER TABLE YokotenResponses ADD COLUMN CorrectiveAction TEXT DEFAULT NULL AFTER Comment`,
        `ALTER TABLE YokotenResponses ADD COLUMN ApprovalStatus VARCHAR(20) DEFAULT NULL AFTER CorrectiveAction`,
        `ALTER TABLE YokotenResponses ADD COLUMN ApprovalComment TEXT DEFAULT NULL AFTER ApprovalStatus`,
        `ALTER TABLE YokotenResponses ADD COLUMN ApprovedBy VARCHAR(100) DEFAULT NULL AFTER ApprovalComment`,
        `ALTER TABLE YokotenResponses ADD COLUMN ApprovedAt DATETIME DEFAULT NULL AFTER ApprovedBy`,
        `ALTER TABLE YokotenResponses ADD COLUMN UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
        // Soft delete support
        `ALTER TABLE YokotenResponses ADD COLUMN IsDeleted TINYINT(1) DEFAULT 0`,
        // Add UNIQUE KEY (may fail if already exists — that's OK)
        `ALTER TABLE YokotenResponses ADD UNIQUE KEY uq_dept_topic (YokotenID, Department)`,
    ];
    for (const sql of migrations) {
        try { await db.query(sql); } catch (_) { /* column/key already exists */ }
    }

    tableReady = true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseJson(val) {
    if (!val) return [];
    try { return JSON.parse(val); } catch { return []; }
}
function s(v) { return typeof v === 'string' ? v.trim() : v; }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/yokoten/topics
// Returns active topics + dept-level response for caller's department
// ─────────────────────────────────────────────────────────────────────────────
router.get('/topics', async (req, res) => {
    try {
        await ensureTables();
        const userDept = req.user.department;
        const userId   = req.user.id;

        const [topics] = await db.query(
            `SELECT * FROM YokotenTopics WHERE IsActive = 1 ORDER BY DateIssued DESC`
        );

        // Dept response for caller's department (exclude soft-deleted)
        const [deptResponses] = await db.query(
            `SELECT r.* FROM YokotenResponses r
             WHERE r.Department = ? AND (r.IsDeleted IS NULL OR r.IsDeleted = 0)`,
            [userDept]
        );
        const deptMap = new Map(deptResponses.map(r => [r.YokotenID, r]));

        // Files for each dept response
        const responseIds = deptResponses.map(r => r.ResponseID).filter(Boolean);
        let filesMap = new Map();
        if (responseIds.length > 0) {
            const [files] = await db.query(
                `SELECT * FROM Yokoten_Response_Files WHERE ResponseID IN (${responseIds.map(() => '?').join(',')})`,
                responseIds
            );
            files.forEach(f => {
                if (!filesMap.has(f.ResponseID)) filesMap.set(f.ResponseID, []);
                filesMap.get(f.ResponseID).push(f);
            });
        }

        // Dept response counts per topic (exclude soft-deleted)
        const [deptCounts] = await db.query(
            `SELECT YokotenID, COUNT(*) AS cnt FROM YokotenResponses
             WHERE (IsDeleted IS NULL OR IsDeleted = 0) GROUP BY YokotenID`
        );
        const deptCountMap = new Map(deptCounts.map(d => [d.YokotenID, d.cnt]));

        const result = topics.map(t => {
            const dr = deptMap.get(t.YokotenID) || null;
            return {
                ...t,
                TargetDepts:     parseJson(t.TargetDepts),
                TargetUnits:     parseJson(t.TargetUnits),
                deptResponse:    dr ? { ...dr, files: filesMap.get(dr.ResponseID) || [] } : null,
                totalDeptCount:  deptCountMap.get(t.YokotenID) || 0,
            };
        });

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/yokoten/dept-completion (admin) — synced with Master_Departments
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dept-completion', isAdmin, async (req, res) => {
    try {
        await ensureTables();

        const [topics] = await db.query(
            `SELECT YokotenID, Title, TopicDescription, RiskLevel, Category, Deadline, TargetDepts, TargetUnits
             FROM YokotenTopics WHERE IsActive = 1 ORDER BY DateIssued DESC`
        );

        const [depts] = await db.query(`SELECT Name FROM Master_Departments ORDER BY Name ASC`);

        // All responses + files for active topics (exclude soft-deleted)
        const [responses] = await db.query(
            `SELECT r.*,
                    (SELECT COUNT(*) FROM Yokoten_Response_Files f WHERE f.ResponseID = r.ResponseID) AS fileCount
             FROM YokotenResponses r
             WHERE r.YokotenID IN (SELECT YokotenID FROM YokotenTopics WHERE IsActive = 1)
               AND (r.IsDeleted IS NULL OR r.IsDeleted = 0)`
        );

        const lookup = new Map();
        responses.forEach(r => { lookup.set(`${r.Department}::${r.YokotenID}`, r); });

        const deptSummary = depts.map(d => {
            const dept = d.Name;
            let respondedCount = 0, pendingApproval = 0, rejected = 0;
            let lastResponse = null;

            const topicBreakdown = topics.map(t => {
                const key  = `${dept}::${t.YokotenID}`;
                const resp = lookup.get(key) || null;
                if (resp) {
                    respondedCount++;
                    if (resp.ApprovalStatus === 'pending')  pendingApproval++;
                    if (resp.ApprovalStatus === 'rejected') rejected++;
                    if (!lastResponse || new Date(resp.ResponseDate) > new Date(lastResponse))
                        lastResponse = resp.ResponseDate;
                }
                return {
                    YokotenID:      t.YokotenID,
                    title:          t.Title || t.TopicDescription,
                    responded:      !!resp,
                    isRelated:      resp?.IsRelated || null,
                    approvalStatus: resp?.ApprovalStatus || null,
                    responseCount:  resp ? 1 : 0,
                    fileCount:      resp ? Number(resp.fileCount) : 0,
                    respondedBy:    resp?.EmployeeName || null,
                    responseDate:   resp?.ResponseDate || null,
                };
            });

            return {
                department:    dept,
                totalTopics:   topics.length,
                respondedCount,
                pendingApproval,
                rejected,
                completionPct: topics.length > 0 ? Math.round(respondedCount * 100 / topics.length) : 0,
                lastResponse,
                topicBreakdown,
            };
        });

        res.json({ success: true, data: { topics, deptSummary } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/yokoten/all-responses (admin) — all responses with files
// ─────────────────────────────────────────────────────────────────────────────
router.get('/all-responses', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { topicId, approvalStatus } = req.query;

        let sql = `
            SELECT r.*, t.Title, t.RiskLevel, t.TopicDescription AS TopicTitle
            FROM YokotenResponses r
            LEFT JOIN YokotenTopics t ON t.YokotenID = r.YokotenID
            WHERE (r.IsDeleted IS NULL OR r.IsDeleted = 0)
        `;
        const params = [];
        if (topicId) { sql += ' AND r.YokotenID = ?'; params.push(topicId); }
        if (approvalStatus) { sql += ' AND r.ApprovalStatus = ?'; params.push(approvalStatus); }
        sql += ' ORDER BY r.ResponseDate DESC';

        const [rows] = await db.query(sql, params);

        // Attach files
        const responseIds = rows.map(r => r.ResponseID);
        let filesMap = new Map();
        if (responseIds.length > 0) {
            const [files] = await db.query(
                `SELECT * FROM Yokoten_Response_Files WHERE ResponseID IN (${responseIds.map(() => '?').join(',')})`,
                responseIds
            );
            files.forEach(f => {
                if (!filesMap.has(f.ResponseID)) filesMap.set(f.ResponseID, []);
                filesMap.get(f.ResponseID).push(f);
            });
        }

        const result = rows.map(r => ({ ...r, files: filesMap.get(r.ResponseID) || [] }));
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/yokoten/dept-history — dept history (user's dept)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dept-history', async (req, res) => {
    try {
        await ensureTables();
        const dept = req.user.department;
        const { topicId } = req.query;

        let sql = `
            SELECT r.*, t.Title, t.TopicDescription AS TopicTitle, t.RiskLevel, t.Category
            FROM YokotenResponses r
            LEFT JOIN YokotenTopics t ON t.YokotenID = r.YokotenID
            WHERE r.Department = ? AND (r.IsDeleted IS NULL OR r.IsDeleted = 0)
        `;
        const params = [dept];
        if (topicId) { sql += ' AND r.YokotenID = ?'; params.push(topicId); }
        sql += ' ORDER BY r.ResponseDate DESC';

        const [rows] = await db.query(sql, params);

        // Attach files per response
        const responseIds = rows.map(r => r.ResponseID);
        let filesMap = new Map();
        if (responseIds.length > 0) {
            const [files] = await db.query(
                `SELECT * FROM Yokoten_Response_Files WHERE ResponseID IN (${responseIds.map(() => '?').join(',')})`,
                responseIds
            );
            files.forEach(f => {
                if (!filesMap.has(f.ResponseID)) filesMap.set(f.ResponseID, []);
                filesMap.get(f.ResponseID).push(f);
            });
        }

        const result = rows.map(r => ({ ...r, files: filesMap.get(r.ResponseID) || [] }));
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/yokoten/employee-completion (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/employee-completion', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { department } = req.query;

        const [topics] = await db.query(
            `SELECT YokotenID, Title, TopicDescription, RiskLevel
             FROM YokotenTopics WHERE IsActive = 1 ORDER BY DateIssued DESC`
        );

        let empSql = `SELECT EmployeeID, EmployeeName, Department, Position FROM Employees`;
        const empParams = [];
        if (department) { empSql += ` WHERE Department = ?`; empParams.push(department); }
        empSql += ` ORDER BY Department, EmployeeName`;
        const [employees] = await db.query(empSql, empParams);

        // Dept responses (one per dept per topic, exclude soft-deleted)
        const [responses] = await db.query(
            `SELECT YokotenID, Department, EmployeeID, IsRelated, ApprovalStatus, ResponseDate
             FROM YokotenResponses
             WHERE YokotenID IN (SELECT YokotenID FROM YokotenTopics WHERE IsActive = 1)
               AND (IsDeleted IS NULL OR IsDeleted = 0)`
        );
        const deptLookup = new Map();
        responses.forEach(r => { deptLookup.set(`${r.Department}::${r.YokotenID}`, r); });

        const result = employees.map(emp => {
            let respondedCount = 0;
            const breakdown = topics.map(t => {
                const key  = `${emp.Department}::${t.YokotenID}`;
                const resp = deptLookup.get(key) || null;
                const isDeptResponder = resp?.EmployeeID === emp.EmployeeID;
                if (resp) respondedCount++;
                return {
                    YokotenID:      t.YokotenID,
                    title:          t.Title || t.TopicDescription,
                    deptResponded:  !!resp,
                    isDeptResponder,
                    isRelated:      resp?.IsRelated || null,
                    approvalStatus: resp?.ApprovalStatus || null,
                };
            });
            return {
                employeeId:    emp.EmployeeID,
                name:          emp.EmployeeName,
                department:    emp.Department,
                position:      emp.Position,
                respondedCount,
                totalTopics:   topics.length,
                completionPct: topics.length > 0 ? Math.round(respondedCount * 100 / topics.length) : 0,
                breakdown,
            };
        });

        res.json({ success: true, data: { topics, employees: result } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/yokoten/respond — submit dept response (with optional files)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/respond', (req, res, next) => {
    uploadResponseFiles(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        next();
    });
}, async (req, res) => {
    try {
        await ensureTables();
        const user = req.user;
        const { yokotenId, isRelated, comment, correctiveAction } = req.body;

        // Validate topic exists
        const [topicRows] = await db.query(
            'SELECT * FROM YokotenTopics WHERE YokotenID = ? AND IsActive = 1', [yokotenId]
        );
        if (!topicRows.length) {
            return res.status(404).json({ success: false, message: 'ไม่พบหัวข้อ Yokoten' });
        }

        // Check if dept already responded
        const [existing] = await db.query(
            'SELECT * FROM YokotenResponses WHERE YokotenID = ? AND Department = ?',
            [yokotenId, user.department]
        );
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: `ส่วนงานของคุณตอบกลับแล้วโดย ${existing[0].EmployeeName || existing[0].EmployeeID}`,
                existingResponse: existing[0],
            });
        }

        // Validate corrective action for IsRelated = 'No'
        const related = s(isRelated) || 'No';
        if (related === 'No' && !s(correctiveAction)) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกวิธีการแก้ไข/ป้องกัน เนื่องจากเลือก "ไม่เกี่ยวข้อง"' });
        }

        const responseId   = randomUUID();
        const approvalStatus = related === 'No' ? 'pending' : null;

        await db.query(
            `INSERT INTO YokotenResponses
             (ResponseID, YokotenID, Department, SafetyUnit, EmployeeID, EmployeeName,
              IsRelated, Comment, CorrectiveAction, ApprovalStatus, ResponseDate)
             VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
            [
                responseId, yokotenId,
                user.department, user.team || null,
                user.id, user.name,
                related,
                s(comment) || null,
                s(correctiveAction) || null,
                approvalStatus,
            ]
        );

        // Upload files
        const files = req.files || [];
        if (files.length > 0) {
            const fileRows = files.map(f => [
                randomUUID(), responseId, yokotenId, user.department,
                f.originalname, f.path, f.filename || null,
                f.mimetype, f.size, user.name,
            ]);
            await db.query(
                `INSERT INTO Yokoten_Response_Files
                 (FileID, ResponseID, YokotenID, Department, FileName, FileURL, PublicID, FileType, FileSize, UploadedBy)
                 VALUES ?`,
                [fileRows]
            );
        }

        res.json({ success: true, message: 'บันทึกการตอบกลับสำเร็จ', responseId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/yokoten/respond/:id — update response (submitter or admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/respond/:id', (req, res, next) => {
    uploadResponseFiles(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        next();
    });
}, async (req, res) => {
    try {
        await ensureTables();
        const user = req.user;
        const { id } = req.params;
        const { isRelated, comment, correctiveAction } = req.body;

        const [rows] = await db.query('SELECT * FROM YokotenResponses WHERE ResponseID = ?', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบการตอบกลับ' });

        const resp = rows[0];
        // Permission: admin OR same department (for rejected responses)
        const isAdminUser = user.role === 'Admin';
        const isSameDept  = resp.Department === user.department;
        if (!isAdminUser && !isSameDept) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์แก้ไขการตอบกลับนี้' });
        }

        const related = s(isRelated) || resp.IsRelated;
        if (related === 'No' && !s(correctiveAction)) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกวิธีการแก้ไข/ป้องกัน' });
        }

        // If dept is re-submitting after rejection → reset to pending
        const approvalStatus = related === 'No'
            ? (isAdminUser ? (resp.ApprovalStatus || 'pending') : 'pending')
            : null;

        await db.query(
            `UPDATE YokotenResponses
             SET IsRelated=?, Comment=?, CorrectiveAction=?, ApprovalStatus=?,
                 ApprovalComment=?, ApprovedBy=?, ApprovedAt=?
             WHERE ResponseID=?`,
            [
                related,
                s(comment) ?? resp.Comment,
                s(correctiveAction) || null,
                approvalStatus,
                isAdminUser ? resp.ApprovalComment : null,
                isAdminUser ? resp.ApprovedBy : null,
                isAdminUser ? resp.ApprovedAt : null,
                id,
            ]
        );

        // Append new files
        const files = req.files || [];
        if (files.length > 0) {
            const fileRows = files.map(f => [
                randomUUID(), id, resp.YokotenID, resp.Department,
                f.originalname, f.path, f.filename || null,
                f.mimetype, f.size, user.name,
            ]);
            await db.query(
                `INSERT INTO Yokoten_Response_Files
                 (FileID, ResponseID, YokotenID, Department, FileName, FileURL, PublicID, FileType, FileSize, UploadedBy)
                 VALUES ?`,
                [fileRows]
            );
        }

        res.json({ success: true, message: 'อัปเดตการตอบกลับสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/yokoten/respond/:id (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/respond/:id', isAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM YokotenResponses WHERE ResponseID = ? AND (IsDeleted IS NULL OR IsDeleted = 0)',
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบการตอบกลับ' });

        // Soft delete — keep Cloudinary files intact (can be recovered if needed)
        await db.query(
            'UPDATE YokotenResponses SET IsDeleted = 1 WHERE ResponseID = ?',
            [req.params.id]
        );
        res.json({ success: true, message: 'ลบการตอบกลับสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/yokoten/respond/:id/approve (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/respond/:id/approve', isAdmin, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT ResponseID FROM YokotenResponses WHERE ResponseID = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบการตอบกลับ' });

        await db.query(
            `UPDATE YokotenResponses
             SET ApprovalStatus='approved', ApprovalComment=NULL,
                 ApprovedBy=?, ApprovedAt=NOW()
             WHERE ResponseID=?`,
            [req.user.name, req.params.id]
        );
        res.json({ success: true, message: 'อนุมัติการตอบกลับสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/yokoten/respond/:id/reject (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/respond/:id/reject', isAdmin, async (req, res) => {
    try {
        const { comment } = req.body;
        if (!s(comment)) return res.status(400).json({ success: false, message: 'กรุณาระบุเหตุผลที่ส่งกลับแก้ไข' });

        const [rows] = await db.query('SELECT ResponseID FROM YokotenResponses WHERE ResponseID = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบการตอบกลับ' });

        await db.query(
            `UPDATE YokotenResponses
             SET ApprovalStatus='rejected', ApprovalComment=?,
                 ApprovedBy=?, ApprovedAt=NOW()
             WHERE ResponseID=?`,
            [s(comment), req.user.name, req.params.id]
        );
        res.json({ success: true, message: 'ส่งกลับแก้ไขสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/yokoten/response-files/:fileId (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/response-files/:fileId', isAdmin, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM Yokoten_Response_Files WHERE FileID = ?', [req.params.fileId]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบไฟล์' });

        if (rows[0].PublicID) {
            try { await cloudinary.uploader.destroy(rows[0].PublicID); } catch (_) {}
        }
        await db.query('DELETE FROM Yokoten_Response_Files WHERE FileID = ?', [req.params.fileId]);
        res.json({ success: true, message: 'ลบไฟล์สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/yokoten/dashboard-config
// PUT /api/yokoten/dashboard-config (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard-config', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT ConfigKey, ConfigValue FROM Yokoten_Dashboard_Config');
        const config = {};
        rows.forEach(r => {
            try { config[r.ConfigKey] = JSON.parse(r.ConfigValue); } catch { config[r.ConfigKey] = r.ConfigValue; }
        });
        res.json({ success: true, data: config });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/dashboard-config', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { pinnedDepts, pinnedUnits } = req.body;

        const upsert = async (key, value) => {
            await db.query(
                `INSERT INTO Yokoten_Dashboard_Config (ConfigKey, ConfigValue, UpdatedBy)
                 VALUES (?,?,?) ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue), UpdatedBy=VALUES(UpdatedBy)`,
                [key, JSON.stringify(value), req.user.name]
            );
        };

        if (pinnedDepts !== undefined) await upsert('pinnedDepts', pinnedDepts);
        if (pinnedUnits !== undefined) await upsert('pinnedUnits', pinnedUnits);

        res.json({ success: true, message: 'บันทึกการตั้งค่า Dashboard สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/yokoten/topics (admin) — create topic
// ─────────────────────────────────────────────────────────────────────────────
router.post('/topics', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const {
            Title, TopicDescription, Category, RiskLevel,
            DateIssued, Deadline, AttachmentUrl, AttachmentName,
            TargetDepts, TargetUnits,
        } = req.body;

        if (!s(TopicDescription)) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกรายละเอียดหัวข้อ' });
        }

        const id = randomUUID();
        const targetDeptsJson = Array.isArray(TargetDepts) && TargetDepts.length > 0 ? JSON.stringify(TargetDepts) : null;
        const targetUnitsJson = Array.isArray(TargetUnits) && TargetUnits.length > 0 ? JSON.stringify(TargetUnits) : null;

        await db.query(
            `INSERT INTO YokotenTopics
             (YokotenID, Title, TopicDescription, Category, RiskLevel,
              DateIssued, Deadline, AttachmentUrl, AttachmentName,
              TargetDepts, TargetUnits, IsActive, CreatedBy)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)`,
            [
                id, s(Title) || null, s(TopicDescription),
                s(Category) || 'ทั่วไป', s(RiskLevel) || 'Low',
                DateIssued || new Date(), Deadline || null,
                s(AttachmentUrl) || null, s(AttachmentName) || null,
                targetDeptsJson, targetUnitsJson,
                req.user.name,
            ]
        );
        res.json({ success: true, message: 'เพิ่มหัวข้อ Yokoten สำเร็จ', id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/yokoten/topics/:id (admin) — update topic
// ─────────────────────────────────────────────────────────────────────────────
router.put('/topics/:id', isAdmin, async (req, res) => {
    try {
        const {
            Title, TopicDescription, Category, RiskLevel,
            DateIssued, Deadline, AttachmentUrl, AttachmentName,
            TargetDepts, TargetUnits, IsActive,
        } = req.body;

        if (!s(TopicDescription)) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกรายละเอียดหัวข้อ' });
        }

        const targetDeptsJson = Array.isArray(TargetDepts) && TargetDepts.length > 0 ? JSON.stringify(TargetDepts) : null;
        const targetUnitsJson = Array.isArray(TargetUnits) && TargetUnits.length > 0 ? JSON.stringify(TargetUnits) : null;

        await db.query(
            `UPDATE YokotenTopics
             SET Title=?, TopicDescription=?, Category=?, RiskLevel=?,
                 DateIssued=?, Deadline=?, AttachmentUrl=?, AttachmentName=?,
                 TargetDepts=?, TargetUnits=?, IsActive=?
             WHERE YokotenID=?`,
            [
                s(Title) || null, s(TopicDescription),
                s(Category) || 'ทั่วไป', s(RiskLevel) || 'Low',
                DateIssued || new Date(), Deadline || null,
                s(AttachmentUrl) || null, s(AttachmentName) || null,
                targetDeptsJson, targetUnitsJson,
                IsActive !== undefined ? (IsActive ? 1 : 0) : 1,
                req.params.id,
            ]
        );
        res.json({ success: true, message: 'อัปเดตหัวข้อ Yokoten สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/yokoten/bulk-approve (admin) — approve multiple pending responses
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bulk-approve', isAdmin, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0)
            return res.status(400).json({ success: false, message: 'กรุณาระบุรายการที่ต้องการอนุมัติ' });

        const safeIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
        if (safeIds.length === 0)
            return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });

        const placeholders = safeIds.map(() => '?').join(',');
        const [result] = await db.query(
            `UPDATE YokotenResponses
             SET ApprovalStatus='approved', ApprovedBy=?, ApprovedAt=NOW()
             WHERE ResponseID IN (${placeholders}) AND ApprovalStatus='pending'
               AND (IsDeleted IS NULL OR IsDeleted = 0)`,
            [req.user.name, ...safeIds]
        );
        res.json({ success: true, message: `อนุมัติ ${result.affectedRows} รายการสำเร็จ` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/yokoten/topics/:id (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/topics/:id', isAdmin, async (req, res) => {
    try {
        const [responses] = await db.query(
            'SELECT COUNT(*) AS cnt FROM YokotenResponses WHERE YokotenID = ?', [req.params.id]
        );
        if (responses[0].cnt > 0) {
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
