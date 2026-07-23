// backend/routes/yokoten.js
// Auth (authenticateToken) applied at mount level
// Write operations for topics require isAdmin

const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { isAdmin } = require('../middleware/auth');
const { storage, deleteLocalUpload, cleanOriginalFilename } = require('../storage');
const multer   = require('multer');
const { randomUUID } = require('crypto');
const { sendMail, smtpConfigured } = require('../utils/email');
const { buildHiyariEmail } = require('../utils/hiyari-email-template');
const { buildDepartmentUnitPlan, parseDepartmentUnitMap } = require('../utils/yokoten-admin-scope');

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

    await db.query(`
        CREATE TABLE IF NOT EXISTS Yokoten_EmailOutbox (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            ResponseID  VARCHAR(36) DEFAULT NULL,
            EventType   VARCHAR(80) NOT NULL DEFAULT 'General',
            Recipients  TEXT NOT NULL,
            Subject     VARCHAR(255) NOT NULL,
            Body        MEDIUMTEXT,
            HtmlBody    MEDIUMTEXT,
            Status      VARCHAR(30) NOT NULL DEFAULT 'Queued',
            Error       TEXT,
            SentAt      DATETIME DEFAULT NULL,
            CreatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_response (ResponseID),
            KEY idx_status (Status)
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
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
}
function s(v) { return typeof v === 'string' ? v.trim() : v; }
function normalizeTopicRow(row) {
    return {
        ...row,
        TargetDepts: parseJson(row.TargetDepts),
        TargetUnits: parseJson(row.TargetUnits),
    };
}
function isDeptTargeted(topic, dept) {
    const targets = parseJson(topic?.TargetDepts).map(v => String(v || '').trim()).filter(Boolean);
    return targets.length === 0 || targets.includes(String(dept || '').trim());
}
function topicTargetedDepts(topic, depts) {
    return depts.filter(d => isDeptTargeted(topic, d.Name || d.department || d.Department));
}
async function hasMasterSafetyUnits() {
    try {
        const [[row]] = await db.query('SELECT COUNT(*) AS cnt FROM Master_SafetyUnits');
        return Number(row?.cnt || 0) > 0;
    } catch (_) {
        return false;
    }
}
async function getMasterDepartmentNames() {
    const [rows] = await db.query('SELECT Name FROM Master_Departments ORDER BY Name ASC');
    return rows.map(r => String(r.Name || '').trim()).filter(Boolean);
}
async function getMasterSafetyUnitNames() {
    try {
        const [rows] = await db.query('SELECT Name FROM Master_SafetyUnits ORDER BY Name ASC');
        return rows.map(r => String(r.Name || '').trim()).filter(Boolean);
    } catch (_) {
        return [];
    }
}
async function getMasterSafetyUnitsWithDepartment() {
    const [rows] = await db.query(
        `SELECT u.name, u.short_code, d.Name AS department
         FROM Master_SafetyUnits u
         LEFT JOIN Master_Departments d ON d.id = u.department_id
         ORDER BY u.department_id, u.sort_order, u.name`
    );
    return rows;
}
function filterMasterValues(values, masterValues) {
    const master = new Set((masterValues || []).map(v => String(v || '').trim()).filter(Boolean));
    return [...new Set((Array.isArray(values) ? values : [])
        .map(v => String(v || '').trim())
        .filter(v => v && (!master.size || master.has(v))))];
}
async function getDashboardConfig() {
    const [rows] = await db.query('SELECT ConfigKey, ConfigValue FROM Yokoten_Dashboard_Config');
    const config = { pinnedDepts: [], pinnedUnits: [] };
    rows.forEach(r => {
        try { config[r.ConfigKey] = JSON.parse(r.ConfigValue); } catch { config[r.ConfigKey] = r.ConfigValue; }
    });
    const [masterDepts, masterUnits] = await Promise.all([
        getMasterDepartmentNames(),
        getMasterSafetyUnitNames(),
    ]);
    config.pinnedDepts = filterMasterValues(config.pinnedDepts, masterDepts);
    config.pinnedUnits = filterMasterValues(config.pinnedUnits, masterUnits);
    config.masterDepts = masterDepts;
    config.masterUnits = masterUnits;
    return config;
}
function isSafetyUnitTargeted(topic, safetyUnit) {
    const unit = String(safetyUnit || '').trim();
    const targets = parseJson(topic?.TargetUnits).map(v => String(v || '').trim()).filter(Boolean);
    return !unit || targets.length === 0 || targets.includes(unit);
}
function displayUploadName(file) {
    return file.originalName || cleanOriginalFilename(file.originalname);
}
function uploadErrorMessage(err) {
    if (err?.code === 'LIMIT_FILE_SIZE') return 'ไฟล์มีขนาดเกิน 20 MB ต่อไฟล์';
    if (err?.code === 'LIMIT_FILE_COUNT') return 'แนบไฟล์ได้สูงสุด 10 ไฟล์ต่อรายการ';
    if (err?.message && /unsupported|type|mimetype/i.test(err.message)) {
        return 'ประเภทไฟล์ไม่รองรับ กรุณาแนบเฉพาะรูปภาพ PDF Word Excel หรือ PowerPoint';
    }
    return err?.message || 'ไม่สามารถอัปโหลดไฟล์ได้ กรุณาลองใหม่อีกครั้ง';
}
function parseDepartmentList(rawDepartments, rawDepartment) {
    if (Array.isArray(rawDepartments)) return rawDepartments.map(s).filter(Boolean);
    if (typeof rawDepartments === 'string' && rawDepartments.trim()) {
        try {
            const parsed = JSON.parse(rawDepartments);
            if (Array.isArray(parsed)) return parsed.map(s).filter(Boolean);
        } catch (_) {
            return rawDepartments.split(',').map(s).filter(Boolean);
        }
    }
    return s(rawDepartment) ? [s(rawDepartment)] : [];
}
function parseSafetyUnitList(...values) {
    const out = [];
    values.forEach(value => {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(v => out.push(s(String(v || ''))));
            return;
        }
        const text = String(value || '').trim();
        if (!text) return;
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                parsed.forEach(v => out.push(s(String(v || ''))));
                return;
            }
        } catch (_) {}
        text.split(/[,\n;|]+/).forEach(v => out.push(s(v)));
    });
    return [...new Set(out.filter(Boolean))];
}
async function cleanupUploadedFiles(files = []) {
    for (const file of (files || [])) {
        try { deleteLocalUpload(file.path); } catch (_) { /* best-effort cleanup */ }
    }
}
async function hasOtherFileReferences(fileRow) {
    if (!fileRow?.FileURL && !fileRow?.PublicID) return false;
    const conditions = [];
    const params = [];
    if (fileRow.PublicID) {
        conditions.push('PublicID = ?');
        params.push(fileRow.PublicID);
    }
    if (fileRow.FileURL) {
        conditions.push('FileURL = ?');
        params.push(fileRow.FileURL);
    }
    if (!conditions.length) return false;
    const [[row]] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM Yokoten_Response_Files
         WHERE FileID <> ? AND (${conditions.join(' OR ')})`,
        [fileRow.FileID, ...params]
    );
    return Number(row?.cnt || 0) > 0;
}
async function deletePhysicalFileIfUnreferenced(fileRow) {
    const stillUsed = await hasOtherFileReferences(fileRow);
    if (!stillUsed) {
        try { deleteLocalUpload(fileRow.FileURL); } catch (_) { /* DB delete should continue */ }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/yokoten/topics
// Returns active topics + dept-level response for caller's department
// ─────────────────────────────────────────────────────────────────────────────
function getYokotenAdminEmail() {
    return process.env.YOKOTEN_ADMIN_EMAIL
        || process.env.HIYARI_ADMIN_EMAIL
        || process.env.ADMIN_EMAIL
        || process.env.SMTP_FROM
        || process.env.SMTP_USER
        || 'sattaya_w@thaisummit-harness.co.th';
}

async function sendYokotenOutboxItem(outboxId) {
    const [[item]] = await db.query('SELECT * FROM Yokoten_EmailOutbox WHERE id=? LIMIT 1', [outboxId]);
    if (!item) {
        const err = new Error('Email queue item not found.');
        err.statusCode = 404;
        throw err;
    }
    try {
        const result = await sendMail({ to: item.Recipients, subject: item.Subject, text: item.Body, html: item.HtmlBody });
        if (result?.sent) {
            await db.query("UPDATE Yokoten_EmailOutbox SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?", [outboxId]);
            return { status: 'Sent' };
        }
        await db.query("UPDATE Yokoten_EmailOutbox SET Status='Queued', Error=? WHERE id=?", [result?.reason || 'SMTP not configured', outboxId]);
        return { status: 'Queued', error: result?.reason || 'SMTP not configured' };
    } catch (err) {
        await db.query("UPDATE Yokoten_EmailOutbox SET Status='Failed', Error=? WHERE id=?", [err.message || String(err), outboxId]);
        throw err;
    }
}

function buildYokotenMail({ row, eventType, actorName, recipientKind }) {
    const topicTitle = row.Title || row.TopicDescription || 'Yokoten';
    const dept = row.Department || '-';
    const isPending = row.ApprovalStatus === 'pending';
    const eventConfig = {
        Submitted: {
            subject: `[Yokoten] Department response submitted - ${dept}`,
            title: 'Yokoten response submitted',
            tone: isPending ? 'warning' : 'approved',
            intro: [
                'Your Yokoten department response has been recorded successfully.',
                isPending
                    ? 'This response is related to your department and is now waiting for admin approval.'
                    : 'Your department has completed this Yokoten response. No admin approval is required for a not-related response.',
            ],
            actions: ['Open Safety Core if you need to review the submitted Yokoten response.'],
        },
        Rejected: {
            subject: `[Yokoten] Response returned for correction - ${dept}`,
            title: 'Yokoten response returned for correction',
            tone: 'rejected',
            intro: [
                'Your Yokoten department response has been returned for correction.',
                'Please review the admin comment, update the response, and resubmit it in Safety Core.',
            ],
            actions: ['Open Safety Core, edit the rejected response, attach evidence if required, and resubmit.'],
        },
        Resubmitted: {
            subject: `[Yokoten] Corrected response resubmitted - ${dept}`,
            title: 'Yokoten corrected response resubmitted',
            tone: 'warning',
            intro: [
                'A Yokoten response that was previously rejected has been corrected and resubmitted.',
                'Please review the response again in the Yokoten approval queue.',
            ],
            actions: ['Open Safety Core and review the pending Yokoten response.'],
        },
        RelatedSubmitted: {
            subject: `[Yokoten] Related response waiting for approval - ${dept}`,
            title: 'Yokoten related response submitted',
            tone: 'warning',
            intro: [
                'A department marked this Yokoten topic as related and submitted corrective/preventive action evidence.',
                'Please review the response in the Yokoten approval queue.',
            ],
            actions: ['Open Safety Core and approve or return the pending Yokoten response.'],
        },
        Approved: {
            subject: `[Yokoten] Response approved - ${dept}`,
            title: 'Yokoten response approved',
            tone: 'approved',
            intro: [
                'Your Yokoten department response has been reviewed and approved.',
                'Please keep the corrective/preventive action evidence available for audit follow-up.',
            ],
            actions: ['Open Safety Core if you need to review the approved Yokoten response.'],
        },
    };
    const cfg = eventConfig[eventType] || eventConfig.Submitted;
    const details = [
        { label: 'Topic', value: topicTitle },
        { label: 'Department', value: dept },
        { label: 'Risk Level', value: row.RiskLevel || '-' },
        { label: 'Related', value: row.IsRelated || '-' },
        { label: 'Status', value: row.ApprovalStatus || (row.IsRelated === 'No' ? 'Recorded / Not related' : '-') },
        { label: 'Responder', value: row.EmployeeName || row.EmployeeID || '-' },
    ];
    if (row.ApprovalComment) details.push({ label: 'Admin Comment', value: row.ApprovalComment, highlight: true });
    if (actorName) details.push({ label: eventType === 'Resubmitted' ? 'Resubmitted By' : 'Actor', value: actorName, highlight: eventType !== 'Rejected' });

    return {
        subject: cfg.subject,
        ...buildHiyariEmail({
            title: cfg.title,
            kicker: 'Yokoten / Lesson Learned Sharing',
            moduleLabel: 'Yokoten / Lesson Learned Sharing Module',
            tone: cfg.tone,
            greeting: recipientKind === 'admin'
                ? 'Dear Safety Admin,'
                : `Dear ${row.EmployeeName || row.EmployeeID || 'user'},`,
            intro: cfg.intro,
            details,
            actions: cfg.actions,
            footerNote: 'This is an automated Yokoten notification from TSH Safety Core Activity System.',
        }),
    };
}

async function queueYokotenEmail(responseId, eventType, actorName) {
    try {
        const [rows] = await db.query(
            `SELECT r.ResponseID, r.Department, r.EmployeeID, r.EmployeeName, r.IsRelated,
                    r.CorrectiveAction, r.ApprovalStatus, r.ApprovalComment, r.ApprovedAt, r.ResponseDate,
                    t.Title, t.TopicDescription, t.RiskLevel, t.Deadline,
                    e.CompanyEmail
             FROM YokotenResponses r
             LEFT JOIN YokotenTopics t ON t.YokotenID = r.YokotenID
             LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
             WHERE r.ResponseID = ?`,
            [responseId]
        );
        const row = rows[0];
        if (!row) return;
        const recipientKind = (eventType === 'Resubmitted' || eventType === 'RelatedSubmitted') ? 'admin' : 'responder';
        const recipient = recipientKind === 'admin' ? getYokotenAdminEmail() : s(row.CompanyEmail);
        if (!recipient) return;
        const mail = buildYokotenMail({ row, eventType, actorName, recipientKind });

        const [insertResult] = await db.query(
            `INSERT INTO Yokoten_EmailOutbox
             (ResponseID, EventType, Recipients, Subject, Body, HtmlBody, Status)
             VALUES (?, ?, ?, ?, ?, ?, 'Queued')`,
            [responseId, eventType, recipient, mail.subject, mail.text, mail.html]
        );
        const outboxId = insertResult?.insertId;
        try {
            if (outboxId) await sendYokotenOutboxItem(outboxId);
        } catch (_) { /* status already updated by sender */ }
    } catch (err) {
        console.warn(`[Yokoten] ${eventType} email skipped:`, err.message);
    }
}

async function queueYokotenApprovalEmail(responseId, actorName) {
    return queueYokotenEmail(responseId, 'Approved', actorName);
}

router.get('/email-outbox', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const status = s(req.query.status || '');
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
        const params = [];
        let sql = 'SELECT id,ResponseID,EventType,Recipients,Subject,Status,Error,SentAt,CreatedAt FROM Yokoten_EmailOutbox';
        if (status && status !== 'all') {
            sql += ' WHERE Status=?';
            params.push(status);
        }
        sql += ' ORDER BY CreatedAt DESC, id DESC LIMIT ?';
        params.push(limit);
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows, smtpConfigured: smtpConfigured() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/email-outbox/retry-queued', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!smtpConfigured()) {
            return res.status(400).json({ success: false, message: 'SMTP is not configured.' });
        }
        const limit = Math.min(Math.max(parseInt(req.body?.limit, 10) || 20, 1), 50);
        const [rows] = await db.query(
            `SELECT id FROM Yokoten_EmailOutbox
             WHERE Status IN ('Queued','Failed')
             ORDER BY CreatedAt ASC, id ASC
             LIMIT ?`,
            [limit]
        );
        const results = [];
        for (const row of rows) {
            try {
                const result = await sendYokotenOutboxItem(row.id);
                results.push({ id: row.id, status: result.status });
            } catch (err) {
                results.push({ id: row.id, status: 'Failed', error: err.message });
            }
        }
        res.json({
            success: true,
            message: `Retried ${results.length} Yokoten email queue item(s)`,
            processed: results.length,
            sent: results.filter(r => r.status === 'Sent').length,
            failed: results.filter(r => r.status === 'Failed').length,
            data: results,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/email-outbox/:id/retry', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const result = await sendYokotenOutboxItem(req.params.id);
        res.json({ success: true, message: 'Yokoten email retried.', data: result });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
});

router.get('/topics', async (req, res) => {
    try {
        await ensureTables();
        const userDept = req.user.department;
        const userId   = req.user.id;

        const [topicRows] = await db.query(
            `SELECT * FROM YokotenTopics WHERE IsActive = 1 ORDER BY DateIssued DESC`
        );
        const isAdminUser = ['admin', 'super_admin'].includes(String(req.user.role || req.user.Role || '').toLowerCase());
        const topics = topicRows
            .map(normalizeTopicRow)
            .filter(t => isAdminUser || isDeptTargeted(t, userDept));

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
        const [sharedCounts] = await db.query(
            `SELECT YokotenID, COUNT(*) AS cnt FROM YokotenResponses
             WHERE IsRelated = 'Yes'
               AND ApprovalStatus = 'approved'
               AND (IsDeleted IS NULL OR IsDeleted = 0)
             GROUP BY YokotenID`
        );
        const sharedCountMap = new Map(sharedCounts.map(d => [d.YokotenID, d.cnt]));

        const result = topics.map(t => {
            const dr = deptMap.get(t.YokotenID) || null;
            return {
                ...t,
                deptResponse:    dr ? { ...dr, files: filesMap.get(dr.ResponseID) || [] } : null,
                totalDeptCount:  isAdminUser ? (deptCountMap.get(t.YokotenID) || 0) : null,
                sharedResponseCount: sharedCountMap.get(t.YokotenID) || 0,
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
router.get('/dept-completion', async (req, res) => {
    try {
        await ensureTables();
        const canSeeDetails = String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin';

        const [topicRows] = await db.query(
            `SELECT YokotenID, Title, TopicDescription, RiskLevel, Category, Deadline, TargetDepts, TargetUnits
             FROM YokotenTopics WHERE IsActive = 1 ORDER BY DateIssued DESC`
        );
        const topics = topicRows.map(normalizeTopicRow);

        const [depts] = await db.query(`SELECT Name FROM Master_Departments ORDER BY Name ASC`);

        // All responses + files for active topics (exclude soft-deleted)
        const [responses] = await db.query(
            `SELECT r.*,
                    COALESCE(NULLIF(r.SafetyUnit, ''), NULLIF(e.Unit, ''), NULLIF(e.Team, '')) AS EffectiveSafetyUnit,
                    (SELECT COUNT(*) FROM Yokoten_Response_Files f WHERE f.ResponseID = r.ResponseID) AS fileCount
             FROM YokotenResponses r
             LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
             WHERE r.YokotenID IN (SELECT YokotenID FROM YokotenTopics WHERE IsActive = 1)
               AND (r.IsDeleted IS NULL OR r.IsDeleted = 0)`
        );

        const lookup = new Map();
        responses.forEach(r => { lookup.set(`${r.Department}::${r.YokotenID}`, r); });

        const deptSummary = depts.map(d => {
            const dept = d.Name;
            let respondedCount = 0, pendingApproval = 0, rejected = 0;
            let lastResponse = null;

            const topicBreakdown = topics.filter(t => isDeptTargeted(t, dept)).map(t => {
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
                    respondedBy:    canSeeDetails ? (resp?.EmployeeName || null) : null,
                    responseDate:   canSeeDetails ? (resp?.ResponseDate || null) : null,
                    safetyUnit:     resp?.EffectiveSafetyUnit || resp?.SafetyUnit || null,
                    safetyUnits:    parseSafetyUnitList(resp?.EffectiveSafetyUnit || resp?.SafetyUnit),
                };
            });

            return {
                department:    dept,
                totalTopics:   topicBreakdown.length,
                respondedCount,
                pendingApproval,
                rejected,
                completionPct: topicBreakdown.length > 0 ? Math.round(respondedCount * 100 / topicBreakdown.length) : 0,
                lastResponse: canSeeDetails ? lastResponse : null,
                topicBreakdown,
            };
        });

        res.json({ success: true, data: { topics, deptSummary } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/yokoten/company-overview — user-safe aggregate scoped by admin config
// ─────────────────────────────────────────────────────────────────────────────
router.get('/company-overview', async (req, res) => {
    try {
        await ensureTables();
        const year = Number.parseInt(req.query.year, 10) || new Date().getFullYear();
        const cfg = await getDashboardConfig();
        const scopeDepts = cfg.pinnedDepts.length ? cfg.pinnedDepts : cfg.masterDepts;
        const scopeUnits = cfg.pinnedUnits;
        const scopeDeptSet = new Set(scopeDepts);

        const [topicRows] = await db.query(
            `SELECT YokotenID, Title, TopicDescription, RiskLevel, Category, Deadline, DateIssued, TargetDepts, TargetUnits
             FROM YokotenTopics
             WHERE IsActive = 1 AND (DateIssued IS NULL OR YEAR(DateIssued) = ?)
             ORDER BY DateIssued DESC`,
            [year]
        );
        const topics = topicRows.map(normalizeTopicRow).filter(t => {
            if (!scopeUnits.length) return true;
            const targetUnits = parseJson(t.TargetUnits).map(v => String(v || '').trim()).filter(Boolean);
            return targetUnits.length === 0 || targetUnits.some(unit => scopeUnits.includes(unit));
        });

        const [responses] = await db.query(
            `SELECT r.YokotenID, r.Department,
                    COALESCE(NULLIF(r.SafetyUnit, ''), NULLIF(e.Unit, ''), NULLIF(e.Team, '')) AS EffectiveSafetyUnit
             FROM YokotenResponses r
             LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
             WHERE r.YokotenID IN (SELECT YokotenID FROM YokotenTopics WHERE IsActive = 1)
               AND (r.IsDeleted IS NULL OR r.IsDeleted = 0)`
        );
        const responseSet = new Set();
        responses.forEach(r => {
            if (!scopeDeptSet.has(String(r.Department || '').trim())) return;
            if (scopeUnits.length) {
                const responseUnits = parseSafetyUnitList(r.EffectiveSafetyUnit);
                if (responseUnits.length && !responseUnits.some(unit => scopeUnits.includes(unit))) return;
            }
            responseSet.add(`${String(r.Department || '').trim()}::${r.YokotenID}`);
        });

        const [sharedRows] = await db.query(
            `SELECT YokotenID, COUNT(*) AS cnt
             FROM YokotenResponses
             WHERE IsRelated = 'Yes'
               AND ApprovalStatus = 'approved'
               AND (IsDeleted IS NULL OR IsDeleted = 0)
             GROUP BY YokotenID`
        );
        const sharedMap = new Map(sharedRows.map(r => [r.YokotenID, Number(r.cnt || 0)]));

        const deptStats = scopeDepts.map(dept => {
            const assigned = topics.filter(t => isDeptTargeted(t, dept));
            const responded = assigned.filter(t => responseSet.has(`${dept}::${t.YokotenID}`)).length;
            return {
                department: dept,
                totalTopics: assigned.length,
                respondedCount: responded,
                completionPct: assigned.length ? Math.round(responded * 100 / assigned.length) : 0,
            };
        });

        const topicStats = topics.map(t => {
            const targetDepts = scopeDepts.filter(dept => isDeptTargeted(t, dept));
            const responded = targetDepts.filter(dept => responseSet.has(`${dept}::${t.YokotenID}`)).length;
            return {
                yokotenId: t.YokotenID,
                title: t.Title || t.TopicDescription || '',
                riskLevel: t.RiskLevel || 'Low',
                category: t.Category || 'General',
                deadline: t.Deadline || null,
                targetDeptCount: targetDepts.length,
                respondedDeptCount: responded,
                completionPct: targetDepts.length ? Math.round(responded * 100 / targetDepts.length) : 0,
                sharedResponseCount: sharedMap.get(t.YokotenID) || 0,
            };
        }).filter(t => t.targetDeptCount > 0);

        const totalAssigned = deptStats.reduce((sum, d) => sum + d.totalTopics, 0);
        const responded = deptStats.reduce((sum, d) => sum + d.respondedCount, 0);
        const riskCounts = new Map();
        const categoryCounts = new Map();
        topicStats.forEach(t => {
            riskCounts.set(t.riskLevel, (riskCounts.get(t.riskLevel) || 0) + 1);
            categoryCounts.set(t.category, (categoryCounts.get(t.category) || 0) + 1);
        });

        res.json({
            success: true,
            data: {
                year,
                scope: {
                    departments: scopeDepts,
                    safetyUnits: scopeUnits,
                    configuredDepartments: cfg.pinnedDepts,
                    configuredSafetyUnits: cfg.pinnedUnits,
                    usingAllDepartments: cfg.pinnedDepts.length === 0,
                },
                overall: {
                    totalAssigned,
                    responded,
                    completionPct: totalAssigned ? Math.round(responded * 100 / totalAssigned) : 0,
                    sharedLearningCount: topicStats.reduce((sum, t) => sum + t.sharedResponseCount, 0),
                },
                departments: deptStats,
                topics: topicStats,
                riskDistribution: [...riskCounts.entries()].map(([riskLevel, count]) => ({ riskLevel, count })),
                categoryDistribution: [...categoryCounts.entries()].map(([category, count]) => ({ category, count })),
            },
        });
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
            SELECT r.*, COALESCE(NULLIF(r.SafetyUnit, ''), NULLIF(e.Unit, ''), NULLIF(e.Team, '')) AS EffectiveSafetyUnit,
                   t.Title, t.RiskLevel, t.TopicDescription AS TopicTitle
            FROM YokotenResponses r
            LEFT JOIN YokotenTopics t ON t.YokotenID = r.YokotenID
            LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
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
// GET /api/yokoten/topics/:id/shared-responses — user-safe approved learning
// ─────────────────────────────────────────────────────────────────────────────
router.get('/topics/:id/shared-responses', async (req, res) => {
    try {
        await ensureTables();
        const [topicRows] = await db.query(
            `SELECT YokotenID FROM YokotenTopics WHERE YokotenID = ? AND IsActive = 1`,
            [req.params.id]
        );
        if (!topicRows.length) {
            return res.status(404).json({ success: false, message: 'Topic not found.' });
        }

        const [rows] = await db.query(
            `SELECT r.ResponseID, r.YokotenID, r.Department,
                    COALESCE(NULLIF(r.SafetyUnit, ''), NULLIF(e.Unit, ''), NULLIF(e.Team, '')) AS SafetyUnit,
                    r.IsRelated, r.Comment, r.CorrectiveAction, r.ResponseDate
             FROM YokotenResponses r
             LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
             WHERE r.YokotenID = ?
               AND r.IsRelated = 'Yes'
               AND r.ApprovalStatus = 'approved'
               AND (r.IsDeleted IS NULL OR r.IsDeleted = 0)
             ORDER BY r.ResponseDate DESC`,
            [req.params.id]
        );

        const responseIds = rows.map(r => r.ResponseID).filter(Boolean);
        const filesMap = new Map();
        if (responseIds.length) {
            const [files] = await db.query(
                `SELECT FileID, ResponseID, FileName, FileURL, FileType, FileSize
                 FROM Yokoten_Response_Files
                 WHERE ResponseID IN (${responseIds.map(() => '?').join(',')})
                 ORDER BY CreatedAt ASC`,
                responseIds
            );
            files.forEach(f => {
                if (!filesMap.has(f.ResponseID)) filesMap.set(f.ResponseID, []);
                filesMap.get(f.ResponseID).push(f);
            });
        }

        const result = rows.map(r => ({
            responseId: r.ResponseID,
            yokotenId: r.YokotenID,
            department: r.Department,
            safetyUnit: r.SafetyUnit || null,
            isRelated: r.IsRelated,
            comment: r.Comment || null,
            correctiveAction: r.CorrectiveAction || null,
            responseDate: r.ResponseDate,
            files: filesMap.get(r.ResponseID) || [],
        }));
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
        const isAdminUser = ['admin', 'super_admin'].includes(String(req.user.role || '').toLowerCase());
        const requestedDept = String(req.query.department || '').trim();
        const dept = isAdminUser ? requestedDept : req.user.department;
        const { topicId } = req.query;

        let sql = `
            SELECT r.*, t.Title, t.TopicDescription AS TopicTitle, t.RiskLevel, t.Category
            FROM YokotenResponses r
            LEFT JOIN YokotenTopics t ON t.YokotenID = r.YokotenID
            WHERE (r.IsDeleted IS NULL OR r.IsDeleted = 0)
        `;
        const params = [];
        if (dept) { sql += ' AND r.Department = ?'; params.push(dept); }
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

        const [topicRows] = await db.query(
            `SELECT YokotenID, Title, TopicDescription, RiskLevel, TargetDepts, TargetUnits
             FROM YokotenTopics WHERE IsActive = 1 ORDER BY DateIssued DESC`
        );
        const topics = topicRows.map(normalizeTopicRow);

        const targetedDeptSet = new Set();
        topics.forEach(t => {
            const scoped = parseJson(t.TargetDepts);
            if (scoped.length === 0) {
                targetedDeptSet.add('*');
            } else {
                scoped.forEach(dept => targetedDeptSet.add(String(dept || '').trim()));
            }
        });

        let empSql = `SELECT EmployeeID, EmployeeName, Department, Position FROM Employees`;
        const empParams = [];
        if (department) { empSql += ` WHERE Department = ?`; empParams.push(department); }
        empSql += ` ORDER BY Department, EmployeeName`;
        const [employees] = await db.query(empSql, empParams);
        const scopedEmployees = employees.filter(emp =>
            targetedDeptSet.has('*') || targetedDeptSet.has(String(emp.Department || '').trim())
        );

        // Dept responses (one per dept per topic, exclude soft-deleted)
        const [responses] = await db.query(
            `SELECT YokotenID, Department, EmployeeID, IsRelated, ApprovalStatus, ResponseDate
             FROM YokotenResponses
             WHERE YokotenID IN (SELECT YokotenID FROM YokotenTopics WHERE IsActive = 1)
               AND (IsDeleted IS NULL OR IsDeleted = 0)`
        );
        const deptLookup = new Map();
        responses.forEach(r => { deptLookup.set(`${r.Department}::${r.YokotenID}`, r); });

        const result = scopedEmployees.map(emp => {
            let respondedCount = 0;
            const assignedTopics = topics.filter(t => isDeptTargeted(t, emp.Department));
            const breakdown = assignedTopics.map(t => {
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
                totalTopics:   assignedTopics.length,
                completionPct: assignedTopics.length > 0 ? Math.round(respondedCount * 100 / assignedTopics.length) : 0,
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
    uploadResponseFiles(req, res, async (err) => {
        if (err) {
            await cleanupUploadedFiles(req.files || []);
            return res.status(400).json({ success: false, message: uploadErrorMessage(err) });
        }
        next();
    });
}, async (req, res) => {
    try {
        await ensureTables();
        const user = req.user;
        const {
            yokotenId, isRelated, comment, correctiveAction,
            department, departments, safetyUnit, safetyUnits, departmentUnits,
        } = req.body;
        const isAdminUser = ['admin', 'super_admin'].includes(String(user.role || user.Role || '').toLowerCase());
        const requestedDepartments = parseDepartmentList(departments, department);
        const targetDepartments = isAdminUser && requestedDepartments.length
            ? requestedDepartments
            : [user.department].filter(Boolean);
        if (!targetDepartments.length) {
            await cleanupUploadedFiles(req.files || []);
            return res.status(400).json({ success: false, message: 'กรุณาระบุแผนกที่ต้องการตอบกลับ' });
        }
        const requestUnits = parseSafetyUnitList(safetyUnits, safetyUnit);
        const selectedUnits = isAdminUser
            ? requestUnits
            : parseSafetyUnitList(user.unit, user.Unit, user.team, user.Team);
        if (false) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือก Safety Unit' });
        }
        const isBehalf = isAdminUser && targetDepartments.some(dept => dept !== user.department);
        const responderName = isBehalf
            ? `${user.name} (Admin)`
            : user.name;

        // Validate topic exists
        const [topicRows] = await db.query(
            'SELECT * FROM YokotenTopics WHERE YokotenID = ? AND IsActive = 1', [yokotenId]
        );
        if (!topicRows.length) {
            await cleanupUploadedFiles(req.files || []);
            return res.status(404).json({ success: false, message: 'ไม่พบหัวข้อ Yokoten' });
        }
        const topic = normalizeTopicRow(topicRows[0]);
        const invalidDepartments = targetDepartments.filter(dept => !isDeptTargeted(topic, dept));
        if (invalidDepartments.length) {
            await cleanupUploadedFiles(req.files || []);
            return res.status(400).json({ success: false, message: `แผนกอยู่นอกขอบเขตหัวข้อ: ${invalidDepartments.join(', ')}` });
        }
        const topicUnits = parseJson(topic.TargetUnits).map(v => String(v || '').trim()).filter(Boolean);
        const hasDepartmentUnitMap = departmentUnits !== undefined && departmentUnits !== null && departmentUnits !== '';
        const parsedDepartmentUnits = hasDepartmentUnitMap ? parseDepartmentUnitMap(departmentUnits) : null;
        if (hasDepartmentUnitMap && parsedDepartmentUnits === null) {
            await cleanupUploadedFiles(req.files || []);
            return res.status(400).json({ success: false, message: 'Invalid Department-to-Safety-Unit mapping.' });
        }
        let departmentUnitPlan = null;
        if (isAdminUser && hasDepartmentUnitMap) {
            departmentUnitPlan = buildDepartmentUnitPlan({
                departments: targetDepartments,
                departmentUnits: parsedDepartmentUnits,
                fallbackUnits: selectedUnits,
                topicUnits,
                masterUnits: await getMasterSafetyUnitsWithDepartment(),
            });
            if (!departmentUnitPlan.ok) {
                await cleanupUploadedFiles(req.files || []);
                return res.status(400).json({
                    success: false,
                    message: departmentUnitPlan.errors.join('; '),
                    errors: departmentUnitPlan.errors,
                });
            }
        }
        if (isAdminUser && !departmentUnitPlan && topicUnits.length && selectedUnits.length === 0) {
            await cleanupUploadedFiles(req.files || []);
            return res.status(400).json({ success: false, message: 'Safety Unit is required for this scoped topic.' });
        }
        const targetUnit = selectedUnits.join(', ') || null;
        const masterUnits = await getMasterSafetyUnitNames();
        if (!departmentUnitPlan && selectedUnits.some(unit => masterUnits.length && !masterUnits.includes(unit))) {
            await cleanupUploadedFiles(req.files || []);
            return res.status(400).json({ success: false, message: 'Safety Unit ไม่อยู่ใน Master Data' });
        }
        if (!departmentUnitPlan && selectedUnits.some(unit => !isSafetyUnitTargeted(topic, unit))) {
            await cleanupUploadedFiles(req.files || []);
            return res.status(400).json({ success: false, message: 'Safety Unit อยู่นอกขอบเขตหัวข้อนี้' });
        }

        // Check if any selected dept already responded
        const placeholders = targetDepartments.map(() => '?').join(',');
        const [existing] = await db.query(
            `SELECT * FROM YokotenResponses
             WHERE YokotenID = ? AND Department IN (${placeholders})
               AND (IsDeleted IS NULL OR IsDeleted = 0)`,
            [yokotenId, ...targetDepartments]
        );
        if (existing.length > 0) {
            await cleanupUploadedFiles(req.files || []);
            const existingDepts = existing.map(r => r.Department).filter(Boolean).join(', ');
            return res.status(409).json({
                success: false,
                message: `ส่วนงานที่เลือกมีการตอบกลับแล้ว: ${existingDepts}`,
                existingResponse: existing[0],
            });
        }

        const related = s(isRelated) || 'No';
        const files = req.files || [];
        if (related === 'Yes' && !s(correctiveAction)) {
            await cleanupUploadedFiles(files);
            return res.status(400).json({ success: false, message: 'กรุณากรอกวิธีการแก้ไข/ป้องกัน เนื่องจากเลือก "เกี่ยวข้อง"' });
        }
        if (related === 'Yes' && files.length === 0) {
            await cleanupUploadedFiles(files);
            return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์หลักฐานอย่างน้อย 1 ไฟล์ เนื่องจากเลือก "เกี่ยวข้อง"' });
        }

        const approvalStatus = related === 'Yes' ? 'pending' : null;
        const actionValue = related === 'Yes' ? (s(correctiveAction) || null) : null;
        const responseRows = targetDepartments.map(dept => [
            randomUUID(), yokotenId,
            dept, departmentUnitPlan
                ? (departmentUnitPlan.unitMap[dept] || []).join(', ') || null
                : targetUnit,
            user.id, responderName,
            related,
            s(comment) || null,
            actionValue,
            approvalStatus,
        ]);

        await db.query(
            `INSERT INTO YokotenResponses
             (ResponseID, YokotenID, Department, SafetyUnit, EmployeeID, EmployeeName,
              IsRelated, Comment, CorrectiveAction, ApprovalStatus, ResponseDate)
             VALUES ?`,
            [responseRows.map(row => [...row, new Date()])]
        );

        // Attach the same uploaded files to each created response record.
        if (files.length > 0) {
            const fileRows = [];
            responseRows.forEach(row => {
                const responseId = row[0];
                const dept = row[2];
                files.forEach(f => {
                    fileRows.push([
                        randomUUID(), responseId, yokotenId, dept,
                        displayUploadName(f), f.path, f.filename || null,
                        f.mimetype, f.size, responderName,
                    ]);
                });
            });
            await db.query(
                `INSERT INTO Yokoten_Response_Files
                 (FileID, ResponseID, YokotenID, Department, FileName, FileURL, PublicID, FileType, FileSize, UploadedBy)
                 VALUES ?`,
                [fileRows]
            );
        }

        for (const row of responseRows) {
            await queueYokotenEmail(row[0], 'Submitted', responderName);
            if (related === 'Yes') {
                await queueYokotenEmail(row[0], 'RelatedSubmitted', responderName);
            }
        }

        res.json({
            success: true,
            message: targetDepartments.length > 1
                ? `บันทึกการตอบกลับ ${targetDepartments.length} แผนกสำเร็จ`
                : 'บันทึกการตอบกลับสำเร็จ',
            responseIds: responseRows.map(row => row[0]),
            responseId: responseRows[0]?.[0],
        });
    } catch (err) {
        await cleanupUploadedFiles(req.files || []);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/yokoten/respond/:id — update response (submitter or admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/respond/:id', (req, res, next) => {
    uploadResponseFiles(req, res, async (err) => {
        if (err) {
            await cleanupUploadedFiles(req.files || []);
            return res.status(400).json({ success: false, message: uploadErrorMessage(err) });
        }
        next();
    });
}, async (req, res) => {
    try {
        await ensureTables();
        const user = req.user;
        const { id } = req.params;
        const { isRelated, comment, correctiveAction, safetyUnit, safetyUnits } = req.body;

        const [rows] = await db.query(
            'SELECT * FROM YokotenResponses WHERE ResponseID = ? AND (IsDeleted IS NULL OR IsDeleted = 0)',
            [id]
        );
        if (!rows.length) {
            await cleanupUploadedFiles(req.files || []);
            return res.status(404).json({ success: false, message: 'ไม่พบการตอบกลับ' });
        }

        const resp = rows[0];
        const wasRejected = resp.ApprovalStatus === 'rejected';
        // Permission: admin OR same department (for rejected responses)
        const isAdminUser = ['admin', 'super_admin'].includes(String(user.role || user.Role || '').toLowerCase());
        const isSameDept  = resp.Department === user.department;
        if (!isAdminUser && isSameDept && resp.ApprovalStatus !== 'rejected') {
            await cleanupUploadedFiles(req.files || []);
            return res.status(403).json({
                success: false,
                message: 'แก้ไขได้เฉพาะรายการที่ผู้ดูแลส่งกลับให้แก้ไขเท่านั้น',
            });
        }
        if (!isAdminUser && !isSameDept) {
            await cleanupUploadedFiles(req.files || []);
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์แก้ไขการตอบกลับนี้' });
        }

        const files = req.files || [];
        const related = s(isRelated) || resp.IsRelated;
        const [fileCountRows] = await db.query(
            'SELECT COUNT(*) AS cnt FROM Yokoten_Response_Files WHERE ResponseID = ?',
            [id]
        );
        const existingFileCount = Number(fileCountRows?.[0]?.cnt || 0);
        if (related === 'Yes' && !s(correctiveAction)) {
            await cleanupUploadedFiles(files);
            return res.status(400).json({ success: false, message: 'กรุณากรอกวิธีการแก้ไข/ป้องกัน เนื่องจากเลือก "เกี่ยวข้อง"' });
        }
        if (related === 'Yes' && existingFileCount + files.length === 0) {
            await cleanupUploadedFiles(files);
            return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์หลักฐานอย่างน้อย 1 ไฟล์ เนื่องจากเลือก "เกี่ยวข้อง"' });
        }

        // If dept is re-submitting after rejection → reset to pending when the item is related and needs action review.
        const approvalStatus = related === 'Yes'
            ? (isAdminUser ? (resp.ApprovalStatus || 'pending') : 'pending')
            : null;
        const actionValue = related === 'Yes' ? (s(correctiveAction) || null) : null;
        const requestUnits = parseSafetyUnitList(safetyUnits, safetyUnit);
        const selectedUnits = isAdminUser
            ? requestUnits
            : parseSafetyUnitList(user.unit, user.Unit, user.team, user.Team);
        const targetUnit = selectedUnits.join(', ') || null;

        await db.query(
            `UPDATE YokotenResponses
             SET SafetyUnit=COALESCE(?, SafetyUnit), IsRelated=?, Comment=?, CorrectiveAction=?, ApprovalStatus=?,
                 ApprovalComment=?, ApprovedBy=?, ApprovedAt=?
             WHERE ResponseID=?`,
            [
                targetUnit,
                related,
                s(comment) ?? resp.Comment,
                actionValue,
                approvalStatus,
                isAdminUser ? resp.ApprovalComment : null,
                isAdminUser ? resp.ApprovedBy : null,
                isAdminUser ? resp.ApprovedAt : null,
                id,
            ]
        );

        // Append new files
        if (files.length > 0) {
            const fileRows = files.map(f => [
                randomUUID(), id, resp.YokotenID, resp.Department,
                displayUploadName(f), f.path, f.filename || null,
                f.mimetype, f.size, user.name,
            ]);
            await db.query(
                `INSERT INTO Yokoten_Response_Files
                 (FileID, ResponseID, YokotenID, Department, FileName, FileURL, PublicID, FileType, FileSize, UploadedBy)
                 VALUES ?`,
                [fileRows]
            );
        }

        if (wasRejected && approvalStatus === 'pending') {
            await queueYokotenEmail(id, 'Resubmitted', user.name);
        }

        res.json({ success: true, message: 'อัปเดตการตอบกลับสำเร็จ' });
    } catch (err) {
        await cleanupUploadedFiles(req.files || []);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/yokoten/respond/:id (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/respond/:id', isAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT ResponseID, IsDeleted FROM YokotenResponses WHERE ResponseID = ?',
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบการตอบกลับ' });

        // Soft delete keeps uploaded files intact (can be recovered if needed)
        const [result] = await db.query(
            'UPDATE YokotenResponses SET IsDeleted = 1 WHERE ResponseID = ? AND (IsDeleted IS NULL OR IsDeleted = 0)',
            [req.params.id]
        );
        res.json({ success: true, alreadyDeleted: result.affectedRows === 0, message: 'ลบการตอบกลับสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/yokoten/respond/:id/approve (admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/respond/:id/approve', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT ResponseID FROM YokotenResponses WHERE ResponseID = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบการตอบกลับ' });

        await db.query(
            `UPDATE YokotenResponses
             SET ApprovalStatus='approved', ApprovalComment=NULL,
                 ApprovedBy=?, ApprovedAt=NOW()
             WHERE ResponseID=?`,
            [req.user.name, req.params.id]
        );
        await queueYokotenApprovalEmail(req.params.id, req.user.name);
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
        const { comment, ApprovalComment } = req.body;
        const rejectionComment = s(comment ?? ApprovalComment) || null;

        const [rows] = await db.query('SELECT ResponseID FROM YokotenResponses WHERE ResponseID = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบการตอบกลับ' });

        await db.query(
            `UPDATE YokotenResponses
             SET ApprovalStatus='rejected', ApprovalComment=?,
                 ApprovedBy=?, ApprovedAt=NOW()
             WHERE ResponseID=?`,
            [rejectionComment, req.user.name, req.params.id]
        );
        await queueYokotenEmail(req.params.id, 'Rejected', req.user.name);
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

        await db.query('DELETE FROM Yokoten_Response_Files WHERE FileID = ?', [req.params.fileId]);
        await deletePhysicalFileIfUnreferenced(rows[0]);
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
        const config = await getDashboardConfig();
        delete config.masterDepts;
        delete config.masterUnits;
        res.json({ success: true, data: config });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/dashboard-config', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { pinnedDepts, pinnedUnits } = req.body;
        const [masterDepts, masterUnits] = await Promise.all([
            getMasterDepartmentNames(),
            getMasterSafetyUnitNames(),
        ]);

        const upsert = async (key, value) => {
            await db.query(
                `INSERT INTO Yokoten_Dashboard_Config (ConfigKey, ConfigValue, UpdatedBy)
                 VALUES (?,?,?) ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue), UpdatedBy=VALUES(UpdatedBy)`,
                [key, JSON.stringify(value), req.user.name]
            );
        };

        if (pinnedDepts !== undefined) await upsert('pinnedDepts', filterMasterValues(pinnedDepts, masterDepts));
        if (pinnedUnits !== undefined) await upsert('pinnedUnits', filterMasterValues(pinnedUnits, masterUnits));

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
        const [masterDepts, masterUnits] = await Promise.all([
            getMasterDepartmentNames(),
            getMasterSafetyUnitNames(),
        ]);
        const invalidDepts = (Array.isArray(TargetDepts) ? TargetDepts : [])
            .map(v => String(v || '').trim()).filter(v => v && !masterDepts.includes(v));
        const invalidUnits = (Array.isArray(TargetUnits) ? TargetUnits : [])
            .map(v => String(v || '').trim()).filter(v => v && masterUnits.length && !masterUnits.includes(v));
        if (invalidDepts.length) return res.status(400).json({ success: false, message: `Department is not in Master Data: ${invalidDepts.join(', ')}` });
        if (invalidUnits.length) return res.status(400).json({ success: false, message: `Safety Unit is not in Master Data: ${invalidUnits.join(', ')}` });
        if (false) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือก Safety Unit ที่เกี่ยวข้องอย่างน้อย 1 รายการ' });
        }

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
        const [masterDepts, masterUnits] = await Promise.all([
            getMasterDepartmentNames(),
            getMasterSafetyUnitNames(),
        ]);
        const invalidDepts = (Array.isArray(TargetDepts) ? TargetDepts : [])
            .map(v => String(v || '').trim()).filter(v => v && !masterDepts.includes(v));
        const invalidUnits = (Array.isArray(TargetUnits) ? TargetUnits : [])
            .map(v => String(v || '').trim()).filter(v => v && masterUnits.length && !masterUnits.includes(v));
        if (invalidDepts.length) return res.status(400).json({ success: false, message: `Department is not in Master Data: ${invalidDepts.join(', ')}` });
        if (invalidUnits.length) return res.status(400).json({ success: false, message: `Safety Unit is not in Master Data: ${invalidUnits.join(', ')}` });
        if (false) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือก Safety Unit ที่เกี่ยวข้องอย่างน้อย 1 รายการ' });
        }

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
        await ensureTables();
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0)
            return res.status(400).json({ success: false, message: 'กรุณาระบุรายการที่ต้องการอนุมัติ' });

        const safeIds = ids.map(id => s(String(id || ''))).filter(Boolean);
        if (safeIds.length === 0)
            return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });

        const placeholders = safeIds.map(() => '?').join(',');
        const [pendingRows] = await db.query(
            `SELECT ResponseID FROM YokotenResponses
             WHERE ResponseID IN (${placeholders}) AND ApprovalStatus='pending'
               AND (IsDeleted IS NULL OR IsDeleted = 0)`,
            safeIds
        );
        const [result] = await db.query(
            `UPDATE YokotenResponses
             SET ApprovalStatus='approved', ApprovedBy=?, ApprovedAt=NOW()
             WHERE ResponseID IN (${placeholders}) AND ApprovalStatus='pending'
               AND (IsDeleted IS NULL OR IsDeleted = 0)`,
            [req.user.name, ...safeIds]
        );
        for (const row of pendingRows) {
            await queueYokotenApprovalEmail(row.ResponseID, req.user.name);
        }
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
