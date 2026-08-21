// backend/routes/fourm.js
// 4M Change — Man Record + Change Notice
// Auth (authenticateToken) applied at mount level
// Admin-only write ops use isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { randomUUID } = require('crypto');
const { isAdmin } = require('../middleware/auth');
const { storage: uploadStorage, fileFilter, deleteLocalUpload } = require('../storage');
const { logAudit } = require('../utils/audit');
const { sendMail, smtpConfigured } = require('../utils/email');
const { buildHiyariEmail } = require('../utils/hiyari-email-template');
const { normalizeBulkCodeOptions, buildBulkCodePreview, canonicalBulkCodeChanges } = require('../utils/fourmCurriculumBulkCode');
const {
    normalizeCompanyEmail,
    selectResponsibleEmployeeId,
    uniqueNoticeRecipients,
    noticeDepartmentMismatch,
} = require('../utils/fourmNoticeResponsible');

const upload = multer({
    storage: uploadStorage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
});

function _handleUpload(field) {
    return (req, res, next) => {
        upload.single(field)(req, res, (err) => {
            if (!err) return next();
            const msg = err?.message || 'อัปโหลดไฟล์ไม่สำเร็จ';
            console.error('[fourm upload error]', msg);
            res.status(400).json({ success: false, message: msg });
        });
    };
}

const OVERDUE_DAYS = 30;
const VALID_IMPACT_LEVELS = new Set(['N/A', 'Low', 'Medium', 'High']);
const VALID_TASK_STATUSES = new Set(['Pending', 'In Progress', 'Done']);
const FOURM_ADMIN_EMAIL = process.env.FOURM_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'sattaya_w@thaisummit-harness.co.th';
const FOURM_TRAINING_MANAGE_PERMISSION = 'FOURM_TRAINING_MANAGE';
const FOURM_TRAINING_MANAGE_ALIASES = [FOURM_TRAINING_MANAGE_PERMISSION, 'fourm_training_manage'];

function getActorName(req) {
    return req.user?.name || req.user?.EmployeeName || req.user?.id || 'User';
}

function normalizeImpactLevel(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'N/A';
    return VALID_IMPACT_LEVELS.has(raw) ? raw : null;
}

function normalizeBoolFlag(value) {
    const raw = String(value || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on', 'required'].includes(raw) ? 1 : 0;
}

function normalizeDateOnly(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function normalizeImpactAssessment(body = {}) {
    const impact = {
        SafetyImpact: normalizeImpactLevel(body.SafetyImpact),
        QualityImpact: normalizeImpactLevel(body.QualityImpact),
        ProductionImpact: normalizeImpactLevel(body.ProductionImpact),
        EnvironmentImpact: normalizeImpactLevel(body.EnvironmentImpact),
        TrainingRequired: normalizeBoolFlag(body.TrainingRequired),
        ImpactNote: String(body.ImpactNote || '').trim() || null,
    };
    const invalid = ['SafetyImpact', 'QualityImpact', 'ProductionImpact', 'EnvironmentImpact']
        .find(field => impact[field] === null);
    if (invalid) return { error: 'Impact Assessment value is invalid.' };
    return { impact };
}

function normalizeTaskPayload(body = {}, existing = null) {
    const titleProvided = body.TaskTitle !== undefined;
    const ownerProvided = body.OwnerName !== undefined;
    const dueProvided = body.DueDate !== undefined;
    const statusProvided = body.Status !== undefined;
    const notesProvided = body.Notes !== undefined;
    const taskTitle = titleProvided ? String(body.TaskTitle || '').trim() : existing?.TaskTitle;
    const ownerName = ownerProvided ? String(body.OwnerName || '').trim() : existing?.OwnerName;
    const dueDate = dueProvided ? normalizeDateOnly(body.DueDate) : normalizeDateOnly(existing?.DueDate);
    const status = statusProvided ? String(body.Status || '').trim() : existing?.Status || 'Pending';
    const notes = notesProvided ? (String(body.Notes || '').trim() || null) : existing?.Notes || null;

    if (!taskTitle) return { error: 'Task title is required.' };
    if (status && !VALID_TASK_STATUSES.has(status)) return { error: 'Task status is invalid.' };
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: 'Due date is invalid.' };
    return { task: { TaskTitle: taskTitle, OwnerName: ownerName || null, DueDate: dueDate, Status: status || 'Pending', Notes: notes } };
}

function hasManCountValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
}

function parseManCount(value, fallback = 0) {
    if (!hasManCountValue(value)) return fallback;
    const raw = String(value).trim();
    if (!/^\d+$/.test(raw)) return null;
    return Number.parseInt(raw, 10);
}

function normalizeManCounts(input = {}, existing = null) {
    const totalProvided = hasManCountValue(input.TotalAttendance);
    const passProvided = hasManCountValue(input.Pass);
    const failProvided = hasManCountValue(input.Fail);
    const total = parseManCount(input.TotalAttendance, Number.parseInt(existing?.TotalAttendance, 10) || 0);
    const pass = parseManCount(input.Pass, Number.parseInt(existing?.Pass, 10) || 0);
    const fallbackFail = totalProvided || passProvided || !existing
        ? total - pass
        : Number.parseInt(existing?.Fail, 10) || 0;
    const fail = parseManCount(input.Fail, fallbackFail);

    if ([total, pass, fail].some(value => value === null || !Number.isInteger(value) || value < 0)) {
        return { error: 'จำนวนผู้เข้าสอบ ผ่าน และไม่ผ่าน ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป' };
    }
    if (pass > total || fail > total) {
        return { error: 'จำนวนผ่านหรือไม่ผ่านต้องไม่มากกว่าจำนวนผู้เข้าสอบทั้งหมด' };
    }
    if (pass + fail !== total) {
        return { error: 'จำนวนผ่านรวมกับไม่ผ่านต้องเท่ากับจำนวนผู้เข้าสอบทั้งหมด' };
    }
    return {
        counts: { total, pass, fail },
        hasUpdate: totalProvided || passProvided || failProvided,
    };
}

function fourmAuditMeta(record = {}, extra = {}) {
    return {
        noticeNo: record.NoticeNo || undefined,
        title: record.Title || undefined,
        department: record.Department || undefined,
        changeType: record.ChangeType || undefined,
        status: record.Status || undefined,
        examDate: record.ExamDate || undefined,
        ...extra,
    };
}

function cleanText(value, max = 255) {
    const text = String(value ?? '').trim();
    return text ? text.slice(0, max) : '';
}

function isFourmAdmin(req) {
    const role = req.user?.role || req.user?.Role;
    return String(role || '').toLowerCase() === 'admin';
}

function currentUserDept(req) {
    return cleanText(req.user?.department || req.user?.Department, 100);
}

function canReadTrainingDept(req, department) {
    if (isFourmAdmin(req)) return true;
    const ownDept = currentUserDept(req);
    return ownDept && cleanText(department, 100) === ownDept;
}

function permissionRoleKeys(req) {
    const raw = cleanText(req.user?.role || req.user?.Role, 50).toUpperCase();
    const keys = [];
    if (raw) keys.push(raw);
    return [...new Set(keys.filter(Boolean))];
}

let _fourmPermissionSeedReady = false;
async function ensureFourmPermissionSeed() {
    if (_fourmPermissionSeedReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS Admin_RolePermissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            role VARCHAR(50) NOT NULL,
            permission VARCHAR(80) NOT NULL,
            granted TINYINT NOT NULL DEFAULT 1,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_role_perm (role, permission)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS Admin_UserPermissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id VARCHAR(50) NOT NULL,
            permission VARCHAR(80) NOT NULL,
            granted TINYINT NOT NULL DEFAULT 1,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_user_perm (employee_id, permission)
        )
    `);
    for (const [role, granted] of [['ADMIN', 1], ['USER', 0], ['VIEWER', 0], ['STAFF', 0], ['MANAGER', 0], ['EXECUTIVE', 0], ['SAFETY_OFFICER', 0]]) {
        await db.query(
            'INSERT IGNORE INTO Admin_RolePermissions (role, permission, granted) VALUES (?,?,?)',
            [role, FOURM_TRAINING_MANAGE_PERMISSION, granted]
        );
    }
    _fourmPermissionSeedReady = true;
}

async function hasFourmTrainingManage(req) {
    if (isFourmAdmin(req)) return true;
    try {
        await ensureFourmPermissionSeed();
        const employeeId = cleanText(req.user?.id || req.user?.EmployeeID, 50);
        if (employeeId) {
            const [userRows] = await db.query(
                `SELECT granted FROM Admin_UserPermissions
                 WHERE employee_id = ? AND permission IN (?)
                 ORDER BY updated_at DESC LIMIT 1`,
                [employeeId, FOURM_TRAINING_MANAGE_ALIASES]
            );
            if (userRows.length) return Number(userRows[0].granted) === 1;
        }
        const roles = permissionRoleKeys(req);
        if (!roles.length) return false;
        const [roleRows] = await db.query(
            `SELECT granted FROM Admin_RolePermissions
             WHERE role IN (?) AND permission IN (?) AND granted = 1
             LIMIT 1`,
            [roles, FOURM_TRAINING_MANAGE_ALIASES]
        );
        return roleRows.length > 0;
    } catch (error) {
        console.warn('[4M training permission check]', error?.message || error);
        return false;
    }
}

async function canManageTrainingDept(req, department) {
    if (isFourmAdmin(req)) return true;
    if (!canReadTrainingDept(req, department)) return false;
    return hasFourmTrainingManage(req);
}

function denyDept(res) {
    return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์จัดการข้อมูลของแผนกนี้' });
}

async function insertTrainingMatrixLog(client, req, { action, curriculumId, courseId, employeeId, oldValue, newValue }) {
    const actorId = req.user?.id || req.user?.EmployeeID || null;
    const actorName = getActorName(req);
    await client.query(
        `INSERT INTO FourM_CurriculumLogs
         (Action, CurriculumID, CourseID, EmployeeID, OldValue, NewValue, PerformedByID, PerformedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            action,
            curriculumId || null,
            courseId || null,
            employeeId || null,
            oldValue ? JSON.stringify(oldValue) : null,
            newValue ? JSON.stringify(newValue) : null,
            actorId,
            actorName,
        ]
    );
}

async function logTrainingMatrix(req, { action, curriculumId, courseId, employeeId, oldValue, newValue, detail }) {
    await insertTrainingMatrixLog(db, req, { action, curriculumId, courseId, employeeId, oldValue, newValue });
    await logAudit(req, {
        action: `FOURM_TRAINING_${action}`,
        module: 'fourm',
        targetType: 'FourM_TrainingMatrix',
        targetId: employeeId || courseId || curriculumId,
        detail,
        metadata: { curriculumId, courseId, employeeId, oldValue, newValue },
        statusCode: 200,
    });
}

function buildFourMTemplate({ subject, title, tone = 'neutral', intro, details, actions, note }) {
    const mail = buildHiyariEmail({
        title,
        kicker: '4M CHANGE MANAGEMENT',
        moduleLabel: '4M Change Management Module',
        tone,
        greeting: 'Dear 4M Change stakeholder,',
        intro,
        details,
        actions,
        note,
        footerNote: 'This is an automatic notification from the 4M Change Management module. Please do not reply.',
    });
    return { subject, body: mail.text, html: mail.html };
}

function uniqueRecipients(values = []) {
    return uniqueNoticeRecipients(values);
}

async function queueFourMEmail({ to, noticeId, taskId, eventType, subject, body, html }) {
    const recipients = String(to || '').split(',').map(v => v.trim()).filter(Boolean);
    if (!recipients.length) return { status: 'Skipped', recipients: [] };

    const [insert] = await db.query(
        `INSERT INTO FourM_EmailOutbox
            (NoticeID, TaskID, EventType, Recipients, Subject, Body, HtmlBody, Status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Queued')`,
        [noticeId || null, taskId || null, eventType || 'General', recipients.join(','), subject, body, html || null]
    ).catch(err => {
        console.error('[fourm/email] queue failed:', err.message);
        return [null];
    });
    const outboxId = insert?.insertId;

    if (!smtpConfigured() || !outboxId || process.env.FOURM_EMAIL_BACKGROUND === 'false') {
        console.log(`[fourm/email queued] ${eventType || 'General'} -> ${recipients.join(', ')} | ${subject}`);
        return { status: 'Queued', recipients, outboxId };
    }

    setImmediate(async () => {
        try {
            await sendMail({ to: recipients.join(','), subject, text: body, html });
            await db.query(
                `UPDATE FourM_EmailOutbox SET Status = 'Sent', SentAt = NOW(), Error = NULL WHERE id = ?`,
                [outboxId]
            );
        } catch (err) {
            await db.query(
                `UPDATE FourM_EmailOutbox SET Status = 'Failed', Error = ? WHERE id = ?`,
                [err.message, outboxId]
            ).catch(() => {});
            console.error('[fourm/email] send failed:', err.message);
        }
    });
    return { status: 'Queued', recipients, outboxId };
}

async function getEmployeeCompanyEmail(employeeId) {
    const id = String(employeeId || '').trim();
    if (!id) return null;
    const [rows] = await db.query(
        `SELECT CompanyEmail FROM Employees
         WHERE EmployeeID = ? AND CompanyEmail IS NOT NULL AND TRIM(CompanyEmail) <> ''
         LIMIT 1`,
        [id]
    ).catch(() => [[]]);
    return normalizeCompanyEmail(rows[0]?.CompanyEmail);
}

async function getResponsibleEmployee(employeeId) {
    const id = String(employeeId || '').trim();
    if (!id) return null;
    const [rows] = await db.query(
        `SELECT EmployeeID, EmployeeName, Department, Unit, Position, CompanyEmail
         FROM Employees WHERE EmployeeID = ? LIMIT 1`,
        [id]
    );
    if (!rows.length) return null;
    const employee = rows[0];
    const companyEmail = normalizeCompanyEmail(employee.CompanyEmail);
    return {
        ...employee,
        CompanyEmail: companyEmail,
        EmailReady: Boolean(companyEmail),
    };
}

async function resolveNoticeResponsible(req, requestedEmployeeId) {
    const employeeId = selectResponsibleEmployeeId({
        isAdmin: isFourmAdmin(req),
        requestedEmployeeId,
        actorEmployeeId: req.user?.id || req.user?.EmployeeID,
    });
    return getResponsibleEmployee(employeeId);
}

function buildNoticeCreatedEmail(notice) {
    return buildFourMTemplate({
        subject: `[4M Change] New Change Notice - ${notice.NoticeNo || '-'}`,
        title: 'New 4M Change Notice',
        tone: 'neutral',
        intro: ['A new 4M Change Notice has been submitted. Please review the record and follow up as required.'],
        details: [
            { label: 'Notice No', value: notice.NoticeNo, highlight: true },
            { label: 'Title', value: notice.Title, highlight: true },
            { label: 'Change Type', value: notice.ChangeType },
            { label: 'Department', value: notice.Department },
            { label: 'Request Date', value: notice.RequestDate },
            { label: 'Created By', value: notice.CreatedBy },
            { label: 'Responsible Person', value: notice.ResponsiblePerson },
            { label: 'Status', value: notice.Status || 'Open', highlight: true },
        ],
        actions: ['Open Safety Core and review the Change Notice details.'],
        note: 'This email is generated from the 4M Change Management workflow.',
    });
}

function buildNoticeReassignedEmail(notice) {
    return buildFourMTemplate({
        subject: `[4M Change] Responsible person assigned - ${notice.NoticeNo || '-'}`,
        title: '4M Change Notice Assignment',
        tone: 'pending',
        intro: ['You have been assigned as the responsible person for this 4M Change Notice. Please review the details and follow up in Safety Core.'],
        details: [
            { label: 'Notice No', value: notice.NoticeNo, highlight: true },
            { label: 'Title', value: notice.Title, highlight: true },
            { label: 'Notice Department', value: notice.Department },
            { label: 'Responsible Person', value: notice.ResponsiblePerson, highlight: true },
            { label: 'Responsible Department', value: notice.ResponsibleDepartment },
            { label: 'Status', value: notice.Status || 'Open' },
        ],
        actions: ['Open Safety Core and review the assigned Change Notice.'],
        note: 'The Notice department and responsible employee department may be different by design.',
    });
}

function buildNoticeStatusEmail(notice, status) {
    return buildFourMTemplate({
        subject: `[4M Change] Notice status updated - ${notice.NoticeNo || '-'}`,
        title: status === 'Closed' ? '4M Change Notice Closed' : '4M Change Notice Status Updated',
        tone: status === 'Closed' ? 'completed' : 'pending',
        intro: ['The status of a 4M Change Notice has been updated. Please review the latest details in Safety Core.'],
        details: [
            { label: 'Notice No', value: notice.NoticeNo, highlight: true },
            { label: 'Title', value: notice.Title, highlight: true },
            { label: 'Department', value: notice.Department },
            { label: 'Responsible Person', value: notice.ResponsiblePerson },
            { label: 'Status', value: status, highlight: true },
        ],
        actions: ['Open Safety Core and confirm the current notice status.'],
        note: 'This email is generated from the 4M Change Management workflow.',
    });
}

function buildTaskEmail(notice, task, eventLabel) {
    const isDone = String(eventLabel || '').toLowerCase() === 'done';
    return buildFourMTemplate({
        subject: `[4M Change] Action Plan ${eventLabel} - ${notice.NoticeNo || '-'}`,
        title: isDone ? '4M Action Plan Completed' : 'New 4M Action Plan',
        tone: isDone ? 'completed' : 'pending',
        intro: [isDone
            ? 'A 4M Action Plan item has been marked as done.'
            : 'A new 4M Action Plan item has been created. Please follow up by the due date.'],
        details: [
            { label: 'Notice No', value: notice.NoticeNo, highlight: true },
            { label: 'Notice Title', value: notice.Title },
            { label: 'Task', value: task.TaskTitle, highlight: true },
            { label: 'Owner', value: task.OwnerName },
            { label: 'Due Date', value: task.DueDate },
            { label: 'Status', value: task.Status, highlight: true },
        ],
        actions: ['Open Safety Core and review or update the 4M Action Plan.'],
        note: 'This email is generated from the 4M Change Management workflow.',
    });
}

async function getNoticeForTask(req, noticeId) {
    const [rows] = await db.query(
        'SELECT id, NoticeNo, Title, Department, ChangeType, Status, CreatedByID FROM FourM_ChangeNotices WHERE id = ?',
        [noticeId]
    );
    if (!rows.length) return { error: { code: 404, message: 'ไม่พบ Change Notice' } };
    const notice = rows[0];
    const isAdminUser = req.user?.role === 'Admin' || req.user?.Role === 'Admin';
    const isCreator = req.user?.id === notice.CreatedByID;
    return { notice, canManage: isAdminUser || isCreator };
}

async function generateNoticeNo(requestDate) {
    const date = requestDate ? new Date(requestDate) : new Date();
    const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
    const prefix = `4M-${year}-`;
    const [rows] = await db.query(
        `SELECT MAX(CAST(SUBSTRING(NoticeNo, ?) AS UNSIGNED)) AS lastSeq
         FROM FourM_ChangeNotices
         WHERE NoticeNo LIKE ?`,
        [prefix.length + 1, `${prefix}%`]
    );
    const lastSeq = parseInt(rows[0]?.lastSeq, 10) || 0;
    return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE TABLES
// ─────────────────────────────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS FourM_ManRecords (
            id               VARCHAR(36)  NOT NULL PRIMARY KEY,
            Department       VARCHAR(100) NOT NULL,
            TotalAttendance  INT          DEFAULT 0,
            Pass             INT          DEFAULT 0,
            Fail             INT          DEFAULT 0,
            Status           VARCHAR(20)  DEFAULT 'Pending',
            ExamDate         DATE,
            Notes            TEXT,
            CreatedBy        VARCHAR(100),
            CreatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_dept (Department),
            KEY idx_date (ExamDate)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS FourM_ChangeNotices (
            id                 VARCHAR(36)  NOT NULL PRIMARY KEY,
            NoticeNo           VARCHAR(50)  NOT NULL,
            RequestDate        DATE         NOT NULL,
            Title              VARCHAR(255) NOT NULL,
            Description        TEXT,
            ChangeType         VARCHAR(20)  NOT NULL,
            ResponsiblePerson  VARCHAR(100),
            ResponsibleEmployeeID VARCHAR(50),
            Department         VARCHAR(100),
            AttachmentUrl      TEXT,
            Status             VARCHAR(20)  NOT NULL DEFAULT 'Open',
            ClosingComment     TEXT,
            ClosingDocUrl      TEXT,
            ClosedDate         DATE,
            ClosedBy           VARCHAR(100),
            SafetyImpact       VARCHAR(20)  DEFAULT 'N/A',
            QualityImpact      VARCHAR(20)  DEFAULT 'N/A',
            ProductionImpact   VARCHAR(20)  DEFAULT 'N/A',
            EnvironmentImpact  VARCHAR(20)  DEFAULT 'N/A',
            TrainingRequired   TINYINT(1)   DEFAULT 0,
            ImpactNote         TEXT,
            CreatedByID        VARCHAR(50)  NOT NULL,
            CreatedBy          VARCHAR(100) NOT NULL,
            CreatedAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_type (ChangeType),
            KEY idx_status (Status),
            KEY idx_date (RequestDate),
            UNIQUE KEY uq_noticeno (NoticeNo)
        )
    `);

    for (const sql of [
        `ALTER TABLE FourM_ChangeNotices ADD COLUMN SafetyImpact VARCHAR(20) DEFAULT 'N/A'`,
        `ALTER TABLE FourM_ChangeNotices ADD COLUMN QualityImpact VARCHAR(20) DEFAULT 'N/A'`,
        `ALTER TABLE FourM_ChangeNotices ADD COLUMN ProductionImpact VARCHAR(20) DEFAULT 'N/A'`,
        `ALTER TABLE FourM_ChangeNotices ADD COLUMN EnvironmentImpact VARCHAR(20) DEFAULT 'N/A'`,
        `ALTER TABLE FourM_ChangeNotices ADD COLUMN TrainingRequired TINYINT(1) DEFAULT 0`,
        `ALTER TABLE FourM_ChangeNotices ADD COLUMN ImpactNote TEXT`,
        `ALTER TABLE FourM_ChangeNotices ADD COLUMN ResponsibleEmployeeID VARCHAR(50) DEFAULT NULL AFTER ResponsiblePerson`,
        `ALTER TABLE FourM_ChangeNotices ADD INDEX idx_responsible_employee (ResponsibleEmployeeID)`,
    ]) {
        try { await db.query(sql); } catch (_) {}
    }

    await db.query(`
        CREATE TABLE IF NOT EXISTS FourM_ActionTasks (
            id             VARCHAR(36)  NOT NULL PRIMARY KEY,
            NoticeID       VARCHAR(36)  NOT NULL,
            TaskTitle      VARCHAR(255) NOT NULL,
            OwnerName      VARCHAR(100),
            DueDate        DATE,
            Status         VARCHAR(20)  NOT NULL DEFAULT 'Pending',
            Notes          TEXT,
            CompletedAt    DATETIME,
            CompletedBy    VARCHAR(100),
            CreatedByID    VARCHAR(50)  NOT NULL,
            CreatedBy      VARCHAR(100) NOT NULL,
            CreatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_notice (NoticeID),
            KEY idx_status (Status),
            KEY idx_due (DueDate)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS FourM_EmailOutbox (
            id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
            NoticeID    VARCHAR(36),
            TaskID      VARCHAR(36),
            EventType   VARCHAR(50)  NOT NULL,
            Recipients  TEXT         NOT NULL,
            Subject     VARCHAR(255) NOT NULL,
            Body        TEXT         NOT NULL,
            HtmlBody    MEDIUMTEXT,
            Status      VARCHAR(20)  NOT NULL DEFAULT 'Queued',
            SentAt      DATETIME,
            Error       TEXT,
            CreatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_notice (NoticeID),
            KEY idx_task (TaskID),
            KEY idx_status (Status),
            KEY idx_event (EventType)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    try { await db.query(`ALTER TABLE FourM_EmailOutbox ADD COLUMN HtmlBody MEDIUMTEXT`); } catch (_) {}

    await db.query(`
        CREATE TABLE IF NOT EXISTS FourM_Curriculums (
            id               VARCHAR(36)  NOT NULL PRIMARY KEY,
            \`Year\`          INT          NOT NULL,
            Department       VARCHAR(100) NOT NULL,
            CurriculumCode   VARCHAR(50)  NOT NULL,
            CurriculumTitle  VARCHAR(255) NOT NULL,
            Notes            TEXT,
            IsActive         TINYINT(1)   NOT NULL DEFAULT 1,
            CreatedByID      VARCHAR(50),
            CreatedBy        VARCHAR(100),
            CreatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_year_dept (\`Year\`, Department),
            KEY idx_code (CurriculumCode),
            UNIQUE KEY uq_fourm_curriculum (\`Year\`, Department, CurriculumCode)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS FourM_CourseMaster (
            id          VARCHAR(36)  NOT NULL PRIMARY KEY,
            CourseCode  VARCHAR(50)  NOT NULL,
            CourseTitle VARCHAR(255) NOT NULL,
            Category    VARCHAR(100),
            Notes       TEXT,
            IsActive    TINYINT(1)   NOT NULL DEFAULT 1,
            CreatedByID VARCHAR(50),
            CreatedBy   VARCHAR(100),
            CreatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_master_code (CourseCode),
            UNIQUE KEY uq_fourm_course_master (CourseCode)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS FourM_Courses (
            id          VARCHAR(36)  NOT NULL PRIMARY KEY,
            CurriculumID VARCHAR(36) NOT NULL,
            CourseMasterID VARCHAR(36),
            CourseCode  VARCHAR(50)  NOT NULL,
            CourseTitle VARCHAR(255) NOT NULL,
            SortOrder   INT          NOT NULL DEFAULT 99,
            IsActive    TINYINT(1)   NOT NULL DEFAULT 1,
            CreatedByID VARCHAR(50),
            CreatedBy   VARCHAR(100),
            CreatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_curriculum (CurriculumID),
            KEY idx_course_master (CourseMasterID),
            KEY idx_course_code (CourseCode),
            UNIQUE KEY uq_fourm_course (CurriculumID, CourseCode)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    for (const sql of [
        `ALTER TABLE FourM_Courses ADD COLUMN CourseMasterID VARCHAR(36)`,
        `ALTER TABLE FourM_Courses ADD KEY idx_course_master (CourseMasterID)`,
    ]) {
        try { await db.query(sql); } catch (_) {}
    }

    await db.query(`
        CREATE TABLE IF NOT EXISTS FourM_CourseEmployees (
            id             VARCHAR(36)  NOT NULL PRIMARY KEY,
            CourseID       VARCHAR(36)  NOT NULL,
            EmployeeID     VARCHAR(50)  NOT NULL,
            EmployeeName   VARCHAR(100) NOT NULL,
            Department     VARCHAR(100),
            Position       VARCHAR(100),
            Status         VARCHAR(20)  NOT NULL DEFAULT 'Assigned',
            AssignedAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            AssignedByID   VARCHAR(50),
            AssignedBy     VARCHAR(100),
            RemovedAt      DATETIME,
            RemovedByID    VARCHAR(50),
            RemovedBy      VARCHAR(100),
            Notes          TEXT,
            CreatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_course (CourseID),
            KEY idx_employee (EmployeeID),
            KEY idx_status (Status),
            UNIQUE KEY uq_fourm_course_employee (CourseID, EmployeeID)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS FourM_CurriculumEmployees (
            id             VARCHAR(36)  NOT NULL PRIMARY KEY,
            CurriculumID   VARCHAR(36)  NOT NULL,
            EmployeeID     VARCHAR(50)  NOT NULL,
            EmployeeName   VARCHAR(100) NOT NULL,
            Department     VARCHAR(100),
            Position       VARCHAR(100),
            Status         VARCHAR(20)  NOT NULL DEFAULT 'Assigned',
            AssignedAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            AssignedByID   VARCHAR(50),
            AssignedBy     VARCHAR(100),
            RemovedAt      DATETIME,
            RemovedByID    VARCHAR(50),
            RemovedBy      VARCHAR(100),
            Notes          TEXT,
            CreatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_curriculum (CurriculumID),
            KEY idx_employee (EmployeeID),
            KEY idx_status (Status),
            UNIQUE KEY uq_fourm_curriculum_employee (CurriculumID, EmployeeID)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS FourM_CurriculumLogs (
            id             INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
            Action         VARCHAR(50)  NOT NULL,
            CurriculumID   VARCHAR(36),
            CourseID       VARCHAR(36),
            EmployeeID     VARCHAR(50),
            OldValue       LONGTEXT,
            NewValue       LONGTEXT,
            PerformedByID  VARCHAR(50),
            PerformedBy    VARCHAR(100),
            PerformedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_curriculum (CurriculumID),
            KEY idx_course (CourseID),
            KEY idx_employee (EmployeeID),
            KEY idx_action (Action),
            KEY idx_time (PerformedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    tablesReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();

        // Notice KPI
        const [[noticeKpi]] = await db.query(`
            SELECT
                COUNT(*)                         AS total,
                COALESCE(SUM(Status = 'Open'), 0)    AS open,
                COALESCE(SUM(Status = 'Pending'), 0) AS pending,
                COALESCE(SUM(Status = 'Closed'), 0)  AS closed
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
        `, [year]);

        // By change type
        const [byType] = await db.query(`
            SELECT ChangeType AS label, COUNT(*) AS count
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
            GROUP BY ChangeType ORDER BY count DESC
        `, [year]);

        // Monthly trend
        const [monthly] = await db.query(`
            SELECT MONTH(RequestDate) AS month, COUNT(*) AS count
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
            GROUP BY MONTH(RequestDate) ORDER BY month
        `, [year]);

        // By department
        const [byDept] = await db.query(`
            SELECT COALESCE(Department,'ไม่ระบุ') AS label, COUNT(*) AS count
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
            GROUP BY Department ORDER BY count DESC LIMIT 12
        `, [year]);

        // Man record summary (latest per dept)
        const [manSummary] = await db.query(`
            SELECT Department,
                SUM(TotalAttendance) AS totalAtt,
                SUM(Pass)            AS totalPass,
                SUM(Fail)            AS totalFail,
                MAX(ExamDate)        AS lastExam
            FROM FourM_ManRecords
            WHERE YEAR(ExamDate) = ? OR ExamDate IS NULL
            GROUP BY Department
        `, [year]);

        // Overdue count (Open/Pending, older than OVERDUE_DAYS)
        const [[overdueRow]] = await db.query(`
            SELECT COUNT(*) AS overdueCount FROM FourM_ChangeNotices
            WHERE Status IN ('Open','Pending')
              AND DATEDIFF(CURDATE(), RequestDate) > ?
              AND YEAR(RequestDate) = ?
        `, [OVERDUE_DAYS, year]);

        // Dept × Type breakdown for matrix
        const [byDeptType] = await db.query(`
            SELECT COALESCE(NULLIF(TRIM(Department),''),'ไม่ระบุ') AS Department,
                   ChangeType, COUNT(*) AS count
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
            GROUP BY Department, ChangeType
            ORDER BY Department, ChangeType
        `, [year]);

        const [deptRank] = await db.query(`
            SELECT
                COALESCE(NULLIF(TRIM(Department),''),'ไม่ระบุ') AS Department,
                COUNT(*) AS total,
                SUM(Status = 'Open') AS open,
                SUM(Status = 'Pending') AS pending,
                SUM(Status = 'Closed') AS closed,
                SUM(Status IN ('Open','Pending') AND DATEDIFF(CURDATE(), RequestDate) > ?) AS overdue
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
            GROUP BY COALESCE(NULLIF(TRIM(Department),''),'ไม่ระบุ')
            ORDER BY total DESC, overdue DESC, pending DESC
            LIMIT 10
        `, [OVERDUE_DAYS, year]);

        const [pendingAging] = await db.query(`
            SELECT id, NoticeNo, Title, Department, ChangeType, Status, RequestDate,
                   ResponsiblePerson, DATEDIFF(CURDATE(), RequestDate) AS ageDays
            FROM FourM_ChangeNotices
            WHERE Status IN ('Open','Pending') AND YEAR(RequestDate) = ?
            ORDER BY ageDays DESC, RequestDate ASC
            LIMIT 10
        `, [year]);

        const [monthlyClosure] = await db.query(`
            SELECT MONTH(RequestDate) AS month,
                   COUNT(*) AS total,
                   SUM(Status = 'Closed') AS closed,
                   ROUND(SUM(Status = 'Closed') / NULLIF(COUNT(*), 0) * 100) AS closureRate
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
            GROUP BY MONTH(RequestDate)
            ORDER BY month
        `, [year]);

        const [lowClosureDept] = await db.query(`
            SELECT
                COALESCE(NULLIF(TRIM(Department),''),'ไม่ระบุ') AS Department,
                COUNT(*) AS total,
                SUM(Status = 'Closed') AS closed,
                SUM(Status IN ('Open','Pending')) AS active,
                ROUND(SUM(Status = 'Closed') / NULLIF(COUNT(*), 0) * 100) AS closureRate
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
            GROUP BY COALESCE(NULLIF(TRIM(Department),''),'ไม่ระบุ')
            HAVING total > 0
            ORDER BY closureRate ASC, active DESC, total DESC
            LIMIT 6
        `, [year]);

        const [typePendingRisk] = await db.query(`
            SELECT ChangeType,
                   COUNT(*) AS total,
                   SUM(Status = 'Open') AS open,
                   SUM(Status = 'Pending') AS pending,
                   SUM(Status IN ('Open','Pending') AND DATEDIFF(CURDATE(), RequestDate) > ?) AS overdue
            FROM FourM_ChangeNotices
            WHERE YEAR(RequestDate) = ?
            GROUP BY ChangeType
            ORDER BY pending DESC, overdue DESC, total DESC
            LIMIT 6
        `, [OVERDUE_DAYS, year]);

        const statsIsAdmin = isFourmAdmin(req);
        const statsUserDept = currentUserDept(req);
        const statsCanViewTrainingOps = statsIsAdmin || (Boolean(statsUserDept) && await hasFourmTrainingManage(req));
        const curriculumDeptWhere = statsIsAdmin
            ? ''
            : statsCanViewTrainingOps
                ? ' AND cur.Department = ?'
                : ' AND 1 = 0';
        const curriculumDeptParams = statsIsAdmin ? [] : (statsCanViewTrainingOps ? [statsUserDept] : []);
        const noticeDeptWhere = statsIsAdmin
            ? ''
            : statsCanViewTrainingOps
                ? " AND COALESCE(NULLIF(TRIM(n.Department), ''), '__UNSPECIFIED__') = ?"
                : ' AND 1 = 0';
        const noticeDeptParams = statsIsAdmin ? [] : (statsCanViewTrainingOps ? [statsUserDept || '__UNSPECIFIED__'] : []);

        const [[trainingSummary]] = await db.query(`
            SELECT
                COUNT(DISTINCT cur.id) AS curriculums,
                COUNT(DISTINCT CASE WHEN co.IsActive = 1 THEN co.id END) AS courses,
                COUNT(DISTINCT CASE WHEN ce.Status = 'Assigned' THEN ce.EmployeeID END) AS employees,
                SUM(CASE WHEN ce.Status = 'Transferred' THEN 1 ELSE 0 END) AS transferred
            FROM FourM_Curriculums cur
            LEFT JOIN FourM_Courses co ON co.CurriculumID = cur.id
            LEFT JOIN FourM_CurriculumEmployees ce ON ce.CurriculumID = cur.id
            WHERE cur.IsActive = 1 AND cur.Year = ?${curriculumDeptWhere}
        `, [year, ...curriculumDeptParams]);

        const trainingCoverageExists = `
            EXISTS (
                SELECT 1
                FROM FourM_Curriculums cur
                WHERE cur.IsActive = 1
                  AND cur.Year = YEAR(n.RequestDate)
                  AND COALESCE(NULLIF(TRIM(cur.Department), ''), '__UNSPECIFIED__') =
                      COALESCE(NULLIF(TRIM(n.Department), ''), '__UNSPECIFIED__')
                LIMIT 1
            )
        `;

        const [[trainingRequiredSummary]] = await db.query(`
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(n.Status IN ('Open','Pending')), 0) AS active,
                COALESCE(SUM(n.Status = 'Closed'), 0) AS closed,
                COALESCE(SUM(${trainingCoverageExists}), 0) AS covered,
                COALESCE(SUM(NOT ${trainingCoverageExists}), 0) AS missing
            FROM FourM_ChangeNotices n
            WHERE n.TrainingRequired = 1
              AND YEAR(n.RequestDate) = ?
              ${noticeDeptWhere}
        `, [year, ...noticeDeptParams]);

        const [trainingRequiredGapList] = await db.query(`
            SELECT n.id, n.NoticeNo, n.Title, n.Department, n.ChangeType, n.Status, n.RequestDate,
                   n.ResponsiblePerson, DATEDIFF(CURDATE(), n.RequestDate) AS ageDays
            FROM FourM_ChangeNotices n
            WHERE n.TrainingRequired = 1
              AND YEAR(n.RequestDate) = ?
              ${noticeDeptWhere}
              AND NOT ${trainingCoverageExists}
            ORDER BY (n.Status = 'Closed') ASC, ageDays DESC, n.RequestDate ASC
            LIMIT 6
        `, [year, ...noticeDeptParams]);

        const [trainingRequiredDeptGap] = await db.query(`
            SELECT COALESCE(NULLIF(TRIM(n.Department), ''), 'ไม่ระบุ') AS Department,
                   COUNT(*) AS total,
                   COALESCE(SUM(${trainingCoverageExists}), 0) AS covered,
                   COALESCE(SUM(NOT ${trainingCoverageExists}), 0) AS missing
            FROM FourM_ChangeNotices n
            WHERE n.TrainingRequired = 1
              AND YEAR(n.RequestDate) = ?
              ${noticeDeptWhere}
            GROUP BY COALESCE(NULLIF(TRIM(n.Department), ''), 'ไม่ระบุ')
            ORDER BY missing DESC, total DESC, Department
            LIMIT 8
        `, [year, ...noticeDeptParams]);

        const [trainingMatrixHealthRows] = await db.query(`
            SELECT *
            FROM (
                SELECT cur.id,
                       cur.Department,
                       cur.CurriculumCode,
                       cur.CurriculumTitle,
                       COALESCE(COUNT(DISTINCT CASE WHEN co.IsActive = 1 THEN co.id END), 0) AS CourseCount,
                       COALESCE(COUNT(DISTINCT CASE WHEN ce.Status = 'Assigned' THEN ce.EmployeeID END), 0) AS AssignedCount,
                       COALESCE(SUM(CASE WHEN ce.Status = 'Transferred' THEN 1 ELSE 0 END), 0) AS TransferredCount,
                       COALESCE(SUM(CASE WHEN ce.Status = 'Removed' THEN 1 ELSE 0 END), 0) AS RemovedCount
                FROM FourM_Curriculums cur
                LEFT JOIN FourM_Courses co ON co.CurriculumID = cur.id
                LEFT JOIN FourM_CurriculumEmployees ce ON ce.CurriculumID = cur.id
                WHERE cur.IsActive = 1 AND cur.Year = ?${curriculumDeptWhere}
                GROUP BY cur.id, cur.Department, cur.CurriculumCode, cur.CurriculumTitle
            ) h
            WHERE h.CourseCount = 0
               OR h.AssignedCount = 0
               OR h.TransferredCount + h.RemovedCount >= GREATEST(3, h.AssignedCount)
            ORDER BY
                (h.CourseCount = 0) DESC,
                (h.AssignedCount = 0) DESC,
                (h.TransferredCount + h.RemovedCount) DESC,
                h.Department,
                h.CurriculumCode
            LIMIT 8
        `, [year, ...curriculumDeptParams]);

        const [[trainingMatrixHealthSummary]] = await db.query(`
            SELECT
                COUNT(*) AS curriculums,
                COALESCE(SUM(CourseCount = 0), 0) AS noCourses,
                COALESCE(SUM(AssignedCount = 0), 0) AS noEmployees,
                COALESCE(SUM(TransferredCount + RemovedCount >= GREATEST(3, AssignedCount)), 0) AS movementWatch,
                COALESCE(SUM(CourseCount > 0 AND AssignedCount > 0), 0) AS ready
            FROM (
                SELECT cur.id,
                       COALESCE(COUNT(DISTINCT CASE WHEN co.IsActive = 1 THEN co.id END), 0) AS CourseCount,
                       COALESCE(COUNT(DISTINCT CASE WHEN ce.Status = 'Assigned' THEN ce.EmployeeID END), 0) AS AssignedCount,
                       COALESCE(SUM(CASE WHEN ce.Status = 'Transferred' THEN 1 ELSE 0 END), 0) AS TransferredCount,
                       COALESCE(SUM(CASE WHEN ce.Status = 'Removed' THEN 1 ELSE 0 END), 0) AS RemovedCount
                FROM FourM_Curriculums cur
                LEFT JOIN FourM_Courses co ON co.CurriculumID = cur.id
                LEFT JOIN FourM_CurriculumEmployees ce ON ce.CurriculumID = cur.id
                WHERE cur.IsActive = 1 AND cur.Year = ?${curriculumDeptWhere}
                GROUP BY cur.id
            ) h
        `, [year, ...curriculumDeptParams]);

        res.json({
            success: true,
            data: { noticeKpi, byType, monthly, byDept, manSummary,
                    overdueCount: overdueRow.overdueCount || 0, byDeptType,
                    trainingSummary: trainingSummary || {},
                    trainingRequiredSummary: trainingRequiredSummary || {},
                    trainingRequiredGapList,
                    trainingRequiredDeptGap,
                    trainingMatrixHealthSummary: trainingMatrixHealthSummary || {},
                    trainingMatrixHealthRows,
                    adminInsights: { deptRank, pendingAging, monthlyClosure, lowClosureDept, typePendingRisk } }
        });
    } catch (error) {
        console.error('4M stats error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลสถิติได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAN RECORDS — LIST
// ─────────────────────────────────────────────────────────────────────────────
router.get('/man-records', async (req, res) => {
    try {
        await ensureTables();
        const { dept, year, q, status } = req.query;
        let sql = 'SELECT * FROM FourM_ManRecords WHERE 1=1';
        const params = [];
        if (dept && dept !== 'all') { sql += ' AND Department = ?'; params.push(dept); }
        if (year) { sql += ' AND YEAR(ExamDate) = ?'; params.push(parseInt(year)); }
        if (status && ['Pass','Fail','Pending'].includes(status)) { sql += ' AND Status = ?'; params.push(status); }
        if (q && q.trim()) { sql += ' AND Department LIKE ?'; params.push(`%${q.trim()}%`); }
        sql += ' ORDER BY ExamDate DESC, CreatedAt DESC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลผลสอบได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAN RECORDS — CREATE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/training-department-scopes', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const q = String(req.query.q || '').trim();
        const dept = String(req.query.dept || '').trim();
        const where = ['cur.IsActive = 1', 'cur.`Year` = ?'];
        const params = [year];

        if (isFourmAdmin(req)) {
            if (dept && dept !== 'all') {
                where.push('cur.Department = ?');
                params.push(dept);
            }
        } else {
            const ownDept = currentUserDept(req);
            if (!ownDept) return res.json({ success: true, data: [] });
            where.push('cur.Department = ?');
            params.push(ownDept);
        }
        if (q) {
            where.push('cur.Department LIKE ?');
            params.push(`%${q}%`);
        }

        const [rows] = await db.query(
            `SELECT
                cur.Department,
                COUNT(DISTINCT cur.id) AS CurriculumCount,
                COUNT(DISTINCT CASE WHEN co.IsActive = 1 THEN co.id END) AS CourseCount,
                COUNT(DISTINCT CASE WHEN ce.Status = 'Assigned' THEN ce.EmployeeID END) AS ScopeEmployees,
                COUNT(DISTINCT CASE WHEN ce.Status = 'Transferred' THEN ce.id END) AS TransferredCount
             FROM FourM_Curriculums cur
             LEFT JOIN FourM_Courses co ON co.CurriculumID = cur.id
             LEFT JOIN FourM_CurriculumEmployees ce ON ce.CurriculumID = cur.id
             WHERE ${where.join(' AND ')}
             GROUP BY cur.Department
             HAVING ScopeEmployees > 0 OR CurriculumCount > 0
             ORDER BY cur.Department`,
            params
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('4M training department scope error:', error);
        res.status(500).json({ success: false, message: 'Cannot load Training Matrix department scope.' });
    }
});

router.post('/man-records', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Department, TotalAttendance, Pass, Fail, Status, ExamDate, Notes } = req.body;
        if (!Department) return res.status(400).json({ success: false, message: 'กรุณาระบุแผนก' });

        const countResult = normalizeManCounts({ TotalAttendance, Pass, Fail });
        if (countResult.error) return res.status(400).json({ success: false, message: countResult.error });
        const { total, pass, fail } = countResult.counts;
        const VALID_STATUS = ['Pass','Fail','Pending'];
        const safeStatus   = VALID_STATUS.includes(Status) ? Status : 'Pending';

        const id = randomUUID();
        await db.query(
            `INSERT INTO FourM_ManRecords (id,Department,TotalAttendance,Pass,Fail,Status,ExamDate,Notes,CreatedBy)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [id, Department, total, pass, fail, safeStatus,
             ExamDate || null, (Notes||'').trim()||null, req.user.name]
        );
        await logAudit(req, {
            action: 'FOURM_MAN_RECORD_CREATE',
            module: 'fourm',
            targetType: 'FourM_ManRecord',
            targetId: id,
            detail: `Create Man Record for ${Department}`,
            metadata: fourmAuditMeta({ Department, Status: safeStatus, ExamDate }, { totalAttendance: total, pass, fail }),
            statusCode: 201,
        });
        res.status(201).json({ success: true, message: 'บันทึกผลสอบสำเร็จ' });
    } catch (error) {
        console.error('Man record create error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกผลสอบได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAN RECORDS — UPDATE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/man-records/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;
        const [rows] = await db.query(
            'SELECT id, Department, Status, ExamDate, TotalAttendance, Pass, Fail FROM FourM_ManRecords WHERE id = ?',
            [id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูล' });

        const { Department, TotalAttendance, Pass, Fail, Status, ExamDate, Notes } = req.body;
        const VALID_STATUS = ['Pass','Fail','Pending'];
        const safeStatus   = VALID_STATUS.includes(Status) ? Status : undefined;
        const countResult = normalizeManCounts({ TotalAttendance, Pass, Fail }, rows[0]);
        if (countResult.error) return res.status(400).json({ success: false, message: countResult.error });

        const fields = []; const vals = [];
        if (Department !== undefined)       { fields.push('Department = ?');       vals.push(Department); }
        if (countResult.hasUpdate) {
            fields.push('TotalAttendance = ?', 'Pass = ?', 'Fail = ?');
            vals.push(countResult.counts.total, countResult.counts.pass, countResult.counts.fail);
        }
        if (safeStatus !== undefined)       { fields.push('Status = ?');           vals.push(safeStatus); }
        if (ExamDate !== undefined)         { fields.push('ExamDate = ?');         vals.push(ExamDate||null); }
        if (Notes !== undefined)            { fields.push('Notes = ?');            vals.push(Notes); }

        if (!fields.length) return res.json({ success: true, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
        vals.push(id);
        await db.query(`UPDATE FourM_ManRecords SET ${fields.join(', ')} WHERE id = ?`, vals);
        await logAudit(req, {
            action: 'FOURM_MAN_RECORD_UPDATE',
            module: 'fourm',
            targetType: 'FourM_ManRecord',
            targetId: id,
            detail: `Update Man Record for ${Department || rows[0].Department || id}`,
            metadata: fourmAuditMeta({
                Department: Department || rows[0].Department,
                Status: safeStatus || rows[0].Status,
                ExamDate: ExamDate !== undefined ? ExamDate : rows[0].ExamDate,
            }, {
                updatedFields: fields.map(field => field.split(' = ')[0]),
                totalAttendance: countResult.counts.total,
                pass: countResult.counts.pass,
                fail: countResult.counts.fail,
            }),
            statusCode: 200,
        });
        res.json({ success: true, message: 'อัปเดตผลสอบสำเร็จ' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตผลสอบได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAN RECORDS — DELETE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/man-records/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [[row]] = await db.query(
            'SELECT id, Department, Status, ExamDate, TotalAttendance, Pass, Fail FROM FourM_ManRecords WHERE id = ?',
            [req.params.id]
        );
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูล' });
        await db.query('DELETE FROM FourM_ManRecords WHERE id = ?', [req.params.id]);
        await logAudit(req, {
            action: 'FOURM_MAN_RECORD_DELETE',
            module: 'fourm',
            targetType: 'FourM_ManRecord',
            targetId: row.id,
            detail: `Delete Man Record for ${row.Department}`,
            metadata: fourmAuditMeta(row, {
                totalAttendance: row.TotalAttendance,
                pass: row.Pass,
                fail: row.Fail,
            }),
            statusCode: 200,
        });
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE NOTICES — LIST
// ─────────────────────────────────────────────────────────────────────────────
async function getTrainingCurriculum(id) {
    const [[row]] = await db.query('SELECT * FROM FourM_Curriculums WHERE id = ?', [id]);
    return row || null;
}

async function getTrainingCourse(id) {
    const [[row]] = await db.query(
        `SELECT c.*, cur.\`Year\`, cur.Department, cur.CurriculumCode, cur.CurriculumTitle
         FROM FourM_Courses c
         JOIN FourM_Curriculums cur ON cur.id = c.CurriculumID
         WHERE c.id = ?`,
        [id]
    );
    return row || null;
}

async function getTrainingAssignment(id) {
    const [[row]] = await db.query(
        `SELECT ce.*, c.CurriculumID, c.CourseCode, c.CourseTitle,
                cur.\`Year\`, cur.Department AS CurriculumDepartment, cur.CurriculumCode, cur.CurriculumTitle
         FROM FourM_CourseEmployees ce
         JOIN FourM_Courses c ON c.id = ce.CourseID
         JOIN FourM_Curriculums cur ON cur.id = c.CurriculumID
         WHERE ce.id = ?`,
        [id]
    );
    return row || null;
}

async function resolveEmployee(employeeId) {
    const [[emp]] = await db.query(
        'SELECT EmployeeID, EmployeeName, Department, Position FROM Employees WHERE EmployeeID = ? LIMIT 1',
        [employeeId]
    );
    return emp || null;
}

async function getActiveTrainingCurriculumForEmployee(employeeId, options = {}, client = db) {
    const curriculumParams = [employeeId];
    let curriculumSql = `
        SELECT cemp.id AS AssignmentID, cemp.EmployeeID, cemp.EmployeeName, cemp.Status,
               NULL AS CourseID, NULL AS CourseCode, NULL AS CourseTitle,
               cur.id AS CurriculumID, cur.\`Year\`, cur.Department AS CurriculumDepartment,
               cur.CurriculumCode, cur.CurriculumTitle
        FROM FourM_CurriculumEmployees cemp
        JOIN FourM_Curriculums cur ON cur.id = cemp.CurriculumID
        WHERE cemp.EmployeeID = ?
          AND cemp.Status = 'Assigned'
          AND cur.IsActive = 1`;

    if (Number.isInteger(options.year)) {
        curriculumSql += ' AND cur.`Year` = ?';
        curriculumParams.push(options.year);
    }
    if (options.department) {
        curriculumSql += ' AND cur.Department = ?';
        curriculumParams.push(options.department);
    }
    if (options.excludeAssignmentId) {
        curriculumSql += ' AND cemp.id <> ?';
        curriculumParams.push(options.excludeAssignmentId);
    }
    if (options.excludeCurriculumId) {
        curriculumSql += ' AND cur.id <> ?';
        curriculumParams.push(options.excludeCurriculumId);
    }

    curriculumSql += ' ORDER BY cemp.AssignedAt DESC LIMIT 1';
    const [[curriculumRow]] = await client.query(curriculumSql, curriculumParams);
    if (curriculumRow) return curriculumRow;

    const params = [employeeId];
    let sql = `
        SELECT ce.id AS AssignmentID, ce.EmployeeID, ce.EmployeeName, ce.Status,
               c.id AS CourseID, c.CourseCode, c.CourseTitle,
               cur.id AS CurriculumID, cur.\`Year\`, cur.Department AS CurriculumDepartment,
               cur.CurriculumCode, cur.CurriculumTitle
        FROM FourM_CourseEmployees ce
        JOIN FourM_Courses c ON c.id = ce.CourseID
        JOIN FourM_Curriculums cur ON cur.id = c.CurriculumID
        WHERE ce.EmployeeID = ?
          AND ce.Status = 'Assigned'
          AND cur.IsActive = 1
          AND c.IsActive = 1`;

    if (Number.isInteger(options.year)) { sql += ' AND cur.`Year` = ?'; params.push(options.year); }
    if (options.department) { sql += ' AND cur.Department = ?'; params.push(options.department); }
    if (options.excludeAssignmentId) { sql += ' AND ce.id <> ?'; params.push(options.excludeAssignmentId); }
    if (options.excludeCurriculumId) { sql += ' AND cur.id <> ?'; params.push(options.excludeCurriculumId); }
    if (options.excludeCourseId) { sql += ' AND c.id <> ?'; params.push(options.excludeCourseId); }
    sql += ' ORDER BY ce.AssignedAt DESC LIMIT 1';
    const [[row]] = await client.query(sql, params);
    return row || null;
}

async function getTrainingCurriculumAssignment(id) {
    const [[row]] = await db.query(
        `SELECT cemp.*, cur.\`Year\`, cur.Department AS CurriculumDepartment, cur.CurriculumCode, cur.CurriculumTitle
         FROM FourM_CurriculumEmployees cemp
         JOIN FourM_Curriculums cur ON cur.id = cemp.CurriculumID
         WHERE cemp.id = ?`,
        [id]
    );
    return row || null;
}

async function getCourseMaster(id) {
    const [[row]] = await db.query('SELECT * FROM FourM_CourseMaster WHERE id = ?', [id]);
    return row || null;
}

async function seedCourseMasterFromLinkedCourse(course, req) {
    const code = cleanText(course.CourseCode, 50);
    const title = cleanText(course.CourseTitle, 255);
    if (!code || !title) return null;
    const [[existing]] = await db.query('SELECT * FROM FourM_CourseMaster WHERE CourseCode = ? LIMIT 1', [code]);
    if (existing) {
        if (!course.CourseMasterID) {
            await db.query('UPDATE FourM_Courses SET CourseMasterID = ? WHERE id = ?', [existing.id, course.id]);
        }
        return existing;
    }
    const id = randomUUID();
    await db.query(
        `INSERT INTO FourM_CourseMaster (id, CourseCode, CourseTitle, CreatedByID, CreatedBy)
         VALUES (?, ?, ?, ?, ?)`,
        [id, code, title, req?.user?.id || req?.user?.EmployeeID || null, req ? getActorName(req) : 'System']
    );
    await db.query('UPDATE FourM_Courses SET CourseMasterID = ? WHERE id = ?', [id, course.id]);
    return { id, CourseCode: code, CourseTitle: title };
}

router.get('/training-permissions', async (req, res) => {
    try {
        await ensureTables();
        const canManageAll = isFourmAdmin(req);
        const department = currentUserDept(req);
        const hasManagePermission = await hasFourmTrainingManage(req);
        res.json({
            success: true,
            data: {
                permissionKey: FOURM_TRAINING_MANAGE_PERMISSION,
                canManageTraining: canManageAll || (Boolean(department) && hasManagePermission),
                canManageAll,
                canDeleteHistory: canManageAll,
                department,
            },
        });
    } catch (error) {
        console.error('4M training permission load error:', error);
        res.status(500).json({ success: false, message: 'Cannot load 4M training permissions' });
    }
});

router.get('/training-curriculums', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const requestedDept = cleanText(req.query.dept, 100);
        const includeInactive = req.query.includeInactive === '1';
        const params = [year];
        let sql = `
            SELECT cur.*,
                   COUNT(DISTINCT co.id) AS CourseCount,
                   COUNT(DISTINCT CASE WHEN cemp.Status = 'Assigned' THEN cemp.EmployeeID END) AS AssignedCount
            FROM FourM_Curriculums cur
            LEFT JOIN FourM_Courses co ON co.CurriculumID = cur.id AND co.IsActive = 1
            LEFT JOIN FourM_CurriculumEmployees cemp ON cemp.CurriculumID = cur.id AND cemp.Status = 'Assigned'
            WHERE cur.\`Year\` = ?`;
        if (!includeInactive) sql += ' AND cur.IsActive = 1';
        if (isFourmAdmin(req)) {
            if (requestedDept && requestedDept !== 'all') { sql += ' AND cur.Department = ?'; params.push(requestedDept); }
        } else {
            const ownDept = currentUserDept(req);
            if (!ownDept) return res.json({ success: true, data: [] });
            sql += ' AND cur.Department = ?'; params.push(ownDept);
        }
        sql += ' GROUP BY cur.id ORDER BY cur.Department ASC, cur.CurriculumCode ASC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('4M training curriculum list error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลหลักสูตร 4M ได้' });
    }
});

router.post('/training-curriculums/bulk-code-preview', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isFourmAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
        const options = normalizeBulkCodeOptions(req.body);
        const [rows] = await db.query(
            'SELECT id, `Year`, Department, CurriculumCode, CurriculumTitle, IsActive FROM FourM_Curriculums WHERE `Year` = ?',
            [options.year]
        );
        res.json({ success: true, data: buildBulkCodePreview(rows, options) });
    } catch (error) {
        if (error instanceof Error && /^Invalid|^Find|^The replacement|^Code fragments|^Department/.test(error.message)) {
            return res.status(400).json({ success: false, message: error.message });
        }
        console.error('4M curriculum bulk code preview error:', error);
        res.status(500).json({ success: false, message: 'Cannot preview bulk curriculum code change.' });
    }
});

router.put('/training-curriculums/bulk-code', isAdmin, async (req, res) => {
    let client;
    try {
        await ensureTables();
        if (!isFourmAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
        const options = normalizeBulkCodeOptions(req.body);
        client = await db.getConnection();
        await client.beginTransaction();
        const [rows] = await client.query(
            'SELECT id, `Year`, Department, CurriculumCode, CurriculumTitle, IsActive FROM FourM_Curriculums WHERE `Year` = ? FOR UPDATE',
            [options.year]
        );
        const preview = buildBulkCodePreview(rows, options);
        const blockedCount = preview.conflictCount + preview.ambiguousCount + preview.invalidCount;
        if (!preview.matchedCount) {
            await client.rollback();
            return res.status(400).json({ success: false, message: 'No curriculum codes match the requested fragment.', data: preview });
        }
        if (blockedCount || preview.readyCount !== preview.matchedCount) {
            await client.rollback();
            return res.status(409).json({ success: false, message: 'Bulk change blocked. Resolve every preview conflict first.', data: preview });
        }
        const expectedChanges = canonicalBulkCodeChanges(req.body.expectedChanges);
        const currentChanges = canonicalBulkCodeChanges(preview.rows);
        if (!expectedChanges.length || JSON.stringify(expectedChanges) !== JSON.stringify(currentChanges)) {
            await client.rollback();
            return res.status(409).json({ success: false, message: 'Curriculum data changed after preview. Preview the batch again.', data: preview });
        }

        const sourceById = new Map(rows.map(row => [String(row.id), row]));
        for (const item of preview.rows) {
            await client.query('UPDATE FourM_Curriculums SET CurriculumCode = ? WHERE id = ?', [
                `__BULK__${randomUUID()}`,
                item.id,
            ]);
        }
        for (const item of preview.rows) {
            await client.query('UPDATE FourM_Curriculums SET CurriculumCode = ? WHERE id = ?', [item.newCode, item.id]);
            await insertTrainingMatrixLog(client, req, {
                action: 'CURRICULUM_CODE_BULK_UPDATE',
                curriculumId: item.id,
                oldValue: { CurriculumCode: item.oldCode },
                newValue: {
                    CurriculumCode: item.newCode,
                    BatchScope: options,
                },
            });
        }
        await client.commit();
        const changedIds = preview.rows.map(row => row.id);
        try {
            await logAudit(req, {
                action: 'FOURM_TRAINING_CURRICULUM_CODE_BULK_UPDATE',
                module: 'fourm',
                targetType: 'FourM_TrainingMatrix',
                targetId: `${options.year}:${options.department}`,
                detail: `Bulk replace curriculum code ${options.find} -> ${options.replace} (${preview.readyCount} rows)`,
                metadata: {
                    scope: options,
                    changedIds,
                    changes: preview.rows.map(item => ({
                        id: item.id,
                        oldCode: sourceById.get(item.id)?.CurriculumCode || item.oldCode,
                        newCode: item.newCode,
                    })),
                },
                statusCode: 200,
            });
        } catch (auditError) {
            console.warn('4M curriculum bulk code admin audit error:', auditError?.message || auditError);
        }
        res.json({
            success: true,
            data: { ...preview, changedCount: preview.readyCount },
            message: `Updated ${preview.readyCount} curriculum codes.`,
        });
    } catch (error) {
        if (client) {
            try { await client.rollback(); } catch (_) { /* transaction already closed */ }
        }
        if (error instanceof Error && /^Invalid|^Find|^The replacement|^Code fragments|^Department/.test(error.message)) {
            return res.status(400).json({ success: false, message: error.message });
        }
        if (error?.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'A resulting curriculum code already exists in the same year and department.' });
        }
        console.error('4M curriculum bulk code update error:', error);
        res.status(500).json({ success: false, message: 'Cannot update curriculum codes.' });
    } finally {
        if (client) client.release();
    }
});

router.get('/training-employee-scopes', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const requestedDept = cleanText(req.query.dept, 100);
        const params = [year];
        let sql = `
            SELECT cemp.id AS AssignmentID, cemp.EmployeeID, cemp.EmployeeName, cemp.Department AS EmployeeDepartment,
                   cemp.Position, cemp.Status, cemp.AssignedAt,
                   NULL AS CourseID, NULL AS CourseCode, NULL AS CourseTitle,
                   cur.id AS CurriculumID, cur.\`Year\`, cur.Department AS CurriculumDepartment,
                   cur.CurriculumCode, cur.CurriculumTitle
            FROM FourM_CurriculumEmployees cemp
            JOIN FourM_Curriculums cur ON cur.id = cemp.CurriculumID
            WHERE cemp.Status = 'Assigned'
              AND cur.IsActive = 1
              AND cur.\`Year\` = ?`;

        if (isFourmAdmin(req)) {
            if (requestedDept && requestedDept !== 'all') {
                sql += ' AND cur.Department = ?';
                params.push(requestedDept);
            }
        } else {
            const ownDept = currentUserDept(req);
            if (!ownDept) return res.json({ success: true, data: [] });
            sql += ' AND cur.Department = ?';
            params.push(ownDept);
        }

        sql += ' ORDER BY cur.Department ASC, cemp.EmployeeName ASC, cemp.EmployeeID ASC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('4M training employee scope list error:', error);
        res.status(500).json({ success: false, message: 'Cannot load active 4M employee scopes' });
    }
});

router.get('/training-course-master', async (req, res) => {
    try {
        await ensureTables();
        const includeInactive = req.query.includeInactive === '1';
        const q = cleanText(req.query.q, 120).toLowerCase();
        const params = [];
        let sql = 'SELECT * FROM FourM_CourseMaster WHERE 1=1';
        if (!includeInactive) sql += ' AND IsActive = 1';
        if (q) {
            sql += ' AND (LOWER(CourseCode) LIKE ? OR LOWER(CourseTitle) LIKE ? OR LOWER(Category) LIKE ?)';
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        sql += ' ORDER BY CourseCode ASC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('4M course master list error:', error);
        res.status(500).json({ success: false, message: 'Cannot load 4M course master' });
    }
});

router.post('/training-course-master', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isFourmAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
        const CourseCode = cleanText(req.body.CourseCode ?? req.body.courseCode, 50);
        const CourseTitle = cleanText(req.body.CourseTitle ?? req.body.courseTitle, 255);
        const Category = cleanText(req.body.Category ?? req.body.category, 100) || null;
        const Notes = cleanText(req.body.Notes ?? req.body.notes, 1000) || null;
        if (!CourseCode || !CourseTitle) return res.status(400).json({ success: false, message: 'Course code and title are required' });
        const id = randomUUID();
        await db.query(
            `INSERT INTO FourM_CourseMaster (id, CourseCode, CourseTitle, Category, Notes, CreatedByID, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, CourseCode, CourseTitle, Category, Notes, req.user?.id || req.user?.EmployeeID || null, getActorName(req)]
        );
        await logTrainingMatrix(req, {
            action: 'COURSE_MASTER_CREATE',
            newValue: { CourseCode, CourseTitle, Category, Notes },
            detail: `Create 4M course master ${CourseCode}`,
        });
        res.status(201).json({ success: true, data: { id }, message: 'Course master saved' });
    } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Course code already exists in master' });
        console.error('4M course master create error:', error);
        res.status(500).json({ success: false, message: 'Cannot create 4M course master' });
    }
});

router.put('/training-course-master/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isFourmAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
        const current = await getCourseMaster(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: 'Course master not found' });
        const fields = []; const vals = [];
        for (const [key, col, max] of [['CourseCode','CourseCode',50], ['CourseTitle','CourseTitle',255], ['Category','Category',100], ['Notes','Notes',1000]]) {
            const raw = req.body[key] ?? req.body[key.charAt(0).toLowerCase() + key.slice(1)];
            if (raw !== undefined) { fields.push(`${col} = ?`); vals.push(cleanText(raw, max) || null); }
        }
        if (req.body.IsActive !== undefined || req.body.isActive !== undefined) {
            fields.push('IsActive = ?'); vals.push((req.body.IsActive ?? req.body.isActive) ? 1 : 0);
        }
        if (!fields.length) return res.json({ success: true, message: 'No update' });
        vals.push(req.params.id);
        await db.query(`UPDATE FourM_CourseMaster SET ${fields.join(', ')} WHERE id = ?`, vals);
        await db.query(
            `UPDATE FourM_Courses c
             JOIN FourM_CourseMaster m ON m.id = c.CourseMasterID
             SET c.CourseCode = m.CourseCode, c.CourseTitle = m.CourseTitle
             WHERE m.id = ?`,
            [req.params.id]
        );
        await logTrainingMatrix(req, {
            action: 'COURSE_MASTER_UPDATE',
            oldValue: current,
            newValue: req.body,
            detail: `Update 4M course master ${current.CourseCode}`,
        });
        res.json({ success: true, message: 'Course master updated' });
    } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Course code already exists in master' });
        console.error('4M course master update error:', error);
        res.status(500).json({ success: false, message: 'Cannot update 4M course master' });
    }
});

router.delete('/training-course-master/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isFourmAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
        const current = await getCourseMaster(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: 'Course master not found' });
        const hardDelete = req.query.hard === '1' || req.query.hard === 'true';
        if (hardDelete) {
            const [[linked]] = await db.query(
                'SELECT COUNT(*) AS count FROM FourM_Courses WHERE CourseMasterID = ?',
                [req.params.id]
            );
            if ((parseInt(linked?.count, 10) || 0) > 0) {
                return res.status(409).json({ success: false, message: 'Cannot permanently delete: this course is linked to curriculum courses.' });
            }
            await db.query('DELETE FROM FourM_CourseMaster WHERE id = ?', [req.params.id]);
            await logTrainingMatrix(req, {
                action: 'COURSE_MASTER_DELETE',
                oldValue: current,
                detail: `Delete 4M course master ${current.CourseCode}`,
            });
            return res.json({ success: true, message: 'Course master permanently deleted' });
        }
        await db.query('UPDATE FourM_CourseMaster SET IsActive = 0 WHERE id = ?', [req.params.id]);
        await logTrainingMatrix(req, {
            action: 'COURSE_MASTER_DISABLE',
            oldValue: current,
            detail: `Disable 4M course master ${current.CourseCode}`,
        });
        res.json({ success: true, message: 'Course master disabled' });
    } catch (error) {
        console.error('4M course master disable error:', error);
        res.status(500).json({ success: false, message: 'Cannot disable 4M course master' });
    }
});

router.post('/training-curriculums', async (req, res) => {
    try {
        await ensureTables();
        if (!isFourmAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
        const year = parseInt(req.body.Year ?? req.body.year, 10) || new Date().getFullYear();
        const Department = cleanText(req.body.Department ?? req.body.department, 100);
        const CurriculumCode = cleanText(req.body.CurriculumCode ?? req.body.curriculumCode, 50);
        const CurriculumTitle = cleanText(req.body.CurriculumTitle ?? req.body.curriculumTitle, 255);
        const Notes = cleanText(req.body.Notes ?? req.body.notes, 1000) || null;
        if (!Department || !CurriculumCode || !CurriculumTitle) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุแผนก รหัสหลักสูตร และชื่อหลักสูตร' });
        }
        if (!await canManageTrainingDept(req, Department)) return denyDept(res);
        const id = randomUUID();
        const actorName = getActorName(req);
        await db.query(
            `INSERT INTO FourM_Curriculums
             (id, \`Year\`, Department, CurriculumCode, CurriculumTitle, Notes, CreatedByID, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, year, Department, CurriculumCode, CurriculumTitle, Notes, req.user?.id || req.user?.EmployeeID || null, actorName]
        );
        await logTrainingMatrix(req, {
            action: 'CURRICULUM_CREATE',
            curriculumId: id,
            newValue: { Year: year, Department, CurriculumCode, CurriculumTitle },
            detail: `Create 4M curriculum ${CurriculumCode}`,
        });
        res.status(201).json({ success: true, data: { id }, message: 'สร้างหลักสูตร 4M สำเร็จ' });
    } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'มีหลักสูตรนี้ในปีและแผนกนี้แล้ว' });
        console.error('4M training curriculum create error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถสร้างหลักสูตร 4M ได้' });
    }
});

router.put('/training-curriculums/:id', async (req, res) => {
    try {
        await ensureTables();
        if (!isFourmAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
        const current = await getTrainingCurriculum(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
        const nextDept = cleanText(req.body.Department ?? req.body.department ?? current.Department, 100);
        if (!await canManageTrainingDept(req, current.Department) || !await canManageTrainingDept(req, nextDept)) return denyDept(res);
        const fields = []; const vals = [];
        const updates = [
            ['Year', '`Year`', value => parseInt(value, 10) || current.Year],
            ['Department', 'Department', value => cleanText(value, 100)],
            ['CurriculumCode', 'CurriculumCode', value => cleanText(value, 50)],
            ['CurriculumTitle', 'CurriculumTitle', value => cleanText(value, 255)],
            ['Notes', 'Notes', value => cleanText(value, 1000) || null],
            ['IsActive', 'IsActive', value => value ? 1 : 0],
        ];
        for (const [key, col, normalize] of updates) {
            const raw = req.body[key] ?? req.body[key.charAt(0).toLowerCase() + key.slice(1)];
            if (raw !== undefined) { fields.push(`${col} = ?`); vals.push(normalize(raw)); }
        }
        if (!fields.length) return res.json({ success: true, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
        vals.push(req.params.id);
        await db.query(`UPDATE FourM_Curriculums SET ${fields.join(', ')} WHERE id = ?`, vals);
        await logTrainingMatrix(req, {
            action: 'CURRICULUM_UPDATE',
            curriculumId: req.params.id,
            oldValue: current,
            newValue: req.body,
            detail: `Update 4M curriculum ${current.CurriculumCode}`,
        });
        res.json({ success: true, message: 'อัปเดตหลักสูตร 4M สำเร็จ' });
    } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'รหัสหลักสูตรซ้ำในปีและแผนกนี้' });
        console.error('4M training curriculum update error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตหลักสูตร 4M ได้' });
    }
});

router.delete('/training-curriculums/:id', async (req, res) => {
    try {
        await ensureTables();
        if (!isFourmAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
        const current = await getTrainingCurriculum(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
        if (!await canManageTrainingDept(req, current.Department)) return denyDept(res);
        await db.query('UPDATE FourM_Curriculums SET IsActive = 0 WHERE id = ?', [req.params.id]);
        await db.query('UPDATE FourM_Courses SET IsActive = 0 WHERE CurriculumID = ?', [req.params.id]);
        await logTrainingMatrix(req, {
            action: 'CURRICULUM_DISABLE',
            curriculumId: req.params.id,
            oldValue: current,
            detail: `Disable 4M curriculum ${current.CurriculumCode}`,
        });
        res.json({ success: true, message: 'ปิดใช้งานหลักสูตร 4M สำเร็จ' });
    } catch (error) {
        console.error('4M training curriculum disable error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถปิดใช้งานหลักสูตร 4M ได้' });
    }
});

router.get('/training-curriculums/:id/courses', async (req, res) => {
    try {
        await ensureTables();
        const curriculum = await getTrainingCurriculum(req.params.id);
        if (!curriculum) return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
        if (!canReadTrainingDept(req, curriculum.Department)) return denyDept(res);
        const includeInactive = req.query.includeInactive === '1';
        const [rows] = await db.query(
            `SELECT c.*, COUNT(DISTINCT CASE WHEN ce.Status = 'Assigned' THEN ce.EmployeeID END) AS AssignedCount
             FROM FourM_Courses c
             LEFT JOIN FourM_CourseEmployees ce ON ce.CourseID = c.id
             WHERE c.CurriculumID = ? ${includeInactive ? '' : 'AND c.IsActive = 1'}
             GROUP BY c.id
             ORDER BY c.SortOrder ASC, c.CourseCode ASC`,
            [req.params.id]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('4M training course list error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลรายวิชาได้' });
    }
});

router.post('/training-curriculums/:id/courses', async (req, res) => {
    try {
        await ensureTables();
        if (!isFourmAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
        const curriculum = await getTrainingCurriculum(req.params.id);
        if (!curriculum) return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
        if (!await canManageTrainingDept(req, curriculum.Department)) return denyDept(res);
        const masterIds = Array.isArray(req.body.CourseMasterIDs)
            ? req.body.CourseMasterIDs
            : Array.isArray(req.body.courseMasterIds)
                ? req.body.courseMasterIds
                : [];
        const singleMasterId = cleanText(req.body.CourseMasterID ?? req.body.courseMasterId, 36);
        const selectedMasterIds = [...new Set([...masterIds, singleMasterId].map(id => cleanText(id, 36)).filter(Boolean))];
        if (selectedMasterIds.length) {
            const actorName = getActorName(req);
            const SortOrder = parseInt(req.body.SortOrder ?? req.body.sortOrder, 10) || 99;
            const created = [];
            const skipped = [];
            for (const masterId of selectedMasterIds) {
                const master = await getCourseMaster(masterId);
                if (!master || Number(master.IsActive) !== 1) { skipped.push(masterId); continue; }
                const [[existing]] = await db.query(
                    'SELECT * FROM FourM_Courses WHERE CurriculumID = ? AND CourseCode = ? LIMIT 1',
                    [req.params.id, master.CourseCode]
                );
                if (existing?.IsActive) { skipped.push(master.CourseCode); continue; }
                if (existing) {
                    await db.query(
                        `UPDATE FourM_Courses
                         SET CourseMasterID = ?, CourseTitle = ?, SortOrder = ?, IsActive = 1
                         WHERE id = ?`,
                        [master.id, master.CourseTitle, SortOrder, existing.id]
                    );
                    created.push(existing.id);
                } else {
                    const id = randomUUID();
                    await db.query(
                        `INSERT INTO FourM_Courses
                         (id, CurriculumID, CourseMasterID, CourseCode, CourseTitle, SortOrder, CreatedByID, CreatedBy)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [id, req.params.id, master.id, master.CourseCode, master.CourseTitle, SortOrder, req.user?.id || req.user?.EmployeeID || null, actorName]
                    );
                    created.push(id);
                }
                await logTrainingMatrix(req, {
                    action: 'COURSE_LINK',
                    curriculumId: req.params.id,
                    newValue: { CourseMasterID: master.id, CourseCode: master.CourseCode, CourseTitle: master.CourseTitle, SortOrder },
                    detail: `Link 4M course ${master.CourseCode}`,
                });
            }
            return res.status(201).json({ success: true, data: { created, skipped }, message: 'Courses linked to curriculum' });
        }
        const CourseCode = cleanText(req.body.CourseCode ?? req.body.courseCode, 50);
        const CourseTitle = cleanText(req.body.CourseTitle ?? req.body.courseTitle, 255);
        const SortOrder = parseInt(req.body.SortOrder ?? req.body.sortOrder, 10) || 99;
        if (!CourseCode || !CourseTitle) return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสวิชาและชื่อวิชา' });
        const id = randomUUID();
        const actorName = getActorName(req);
        await db.query(
            `INSERT INTO FourM_Courses (id, CurriculumID, CourseCode, CourseTitle, SortOrder, CreatedByID, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, req.params.id, CourseCode, CourseTitle, SortOrder, req.user?.id || req.user?.EmployeeID || null, actorName]
        );
        await logTrainingMatrix(req, {
            action: 'COURSE_CREATE',
            curriculumId: req.params.id,
            courseId: id,
            newValue: { CourseCode, CourseTitle, SortOrder },
            detail: `Create 4M course ${CourseCode}`,
        });
        res.status(201).json({ success: true, data: { id }, message: 'สร้างรายวิชา 4M สำเร็จ' });
    } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'มีรหัสวิชานี้ในหลักสูตรแล้ว' });
        console.error('4M training course create error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถสร้างรายวิชา 4M ได้' });
    }
});

router.put('/training-courses/:id', async (req, res) => {
    try {
        await ensureTables();
        if (!isFourmAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
        const current = await getTrainingCourse(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: 'ไม่พบรายวิชา' });
        if (!await canManageTrainingDept(req, current.Department)) return denyDept(res);
        const fields = []; const vals = [];
        for (const [key, col, max] of [['CourseCode','CourseCode',50], ['CourseTitle','CourseTitle',255]]) {
            const raw = req.body[key] ?? req.body[key.charAt(0).toLowerCase() + key.slice(1)];
            if (raw !== undefined) { fields.push(`${col} = ?`); vals.push(cleanText(raw, max)); }
        }
        if (req.body.SortOrder !== undefined || req.body.sortOrder !== undefined) {
            fields.push('SortOrder = ?'); vals.push(parseInt(req.body.SortOrder ?? req.body.sortOrder, 10) || 99);
        }
        if (req.body.IsActive !== undefined || req.body.isActive !== undefined) {
            fields.push('IsActive = ?'); vals.push((req.body.IsActive ?? req.body.isActive) ? 1 : 0);
        }
        if (!fields.length) return res.json({ success: true, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
        vals.push(req.params.id);
        await db.query(`UPDATE FourM_Courses SET ${fields.join(', ')} WHERE id = ?`, vals);
        await logTrainingMatrix(req, {
            action: 'COURSE_UPDATE',
            curriculumId: current.CurriculumID,
            courseId: req.params.id,
            oldValue: current,
            newValue: req.body,
            detail: `Update 4M course ${current.CourseCode}`,
        });
        res.json({ success: true, message: 'อัปเดตรายวิชา 4M สำเร็จ' });
    } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'รหัสวิชาซ้ำในหลักสูตรนี้' });
        console.error('4M training course update error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตรายวิชา 4M ได้' });
    }
});

router.delete('/training-courses/:id', async (req, res) => {
    try {
        await ensureTables();
        if (!isFourmAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
        const current = await getTrainingCourse(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: 'ไม่พบรายวิชา' });
        if (!await canManageTrainingDept(req, current.Department)) return denyDept(res);
        await db.query('UPDATE FourM_Courses SET IsActive = 0 WHERE id = ?', [req.params.id]);
        await logTrainingMatrix(req, {
            action: 'COURSE_DISABLE',
            curriculumId: current.CurriculumID,
            courseId: req.params.id,
            oldValue: current,
            detail: `Disable 4M course ${current.CourseCode}`,
        });
        res.json({ success: true, message: 'ปิดใช้งานรายวิชา 4M สำเร็จ' });
    } catch (error) {
        console.error('4M training course disable error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถปิดใช้งานรายวิชา 4M ได้' });
    }
});

router.get('/training-curriculums/:id/assignments', async (req, res) => {
    try {
        await ensureTables();
        const curriculum = await getTrainingCurriculum(req.params.id);
        if (!curriculum) return res.status(404).json({ success: false, message: 'Curriculum not found' });
        if (!canReadTrainingDept(req, curriculum.Department)) return denyDept(res);
        const status = cleanText(req.query.status, 20);
        const params = [req.params.id];
        let statusWhere = '';
        if (status && status !== 'all') {
            statusWhere = 'AND cemp.Status = ?';
            params.push(status);
        }
        const [rows] = await db.query(
            `SELECT cemp.*
             FROM FourM_CurriculumEmployees cemp
             WHERE cemp.CurriculumID = ? ${statusWhere}
             ORDER BY cemp.Status = 'Assigned' DESC, cemp.EmployeeName ASC, cemp.EmployeeID ASC`,
            params
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('4M curriculum assignment list error:', error);
        res.status(500).json({ success: false, message: 'Cannot load curriculum assignments' });
    }
});

router.post('/training-curriculums/:id/assignments', async (req, res) => {
    try {
        await ensureTables();
        const curriculum = await getTrainingCurriculum(req.params.id);
        if (!curriculum) return res.status(404).json({ success: false, message: 'Curriculum not found' });
        if (!await canManageTrainingDept(req, curriculum.Department)) return denyDept(res);

        const [[courseReady]] = await db.query(
            'SELECT COUNT(*) AS TotalCourses FROM FourM_Courses WHERE CurriculumID = ? AND IsActive = 1',
            [req.params.id]
        );
        if (!courseReady || Number(courseReady.TotalCourses) < 1) {
            return res.status(400).json({ success: false, message: 'Add at least one course before assigning employees' });
        }

        const rawIds = Array.isArray(req.body.EmployeeIDs)
            ? req.body.EmployeeIDs
            : Array.isArray(req.body.employeeIds)
                ? req.body.employeeIds
                : [req.body.EmployeeID ?? req.body.employeeId];
        const employeeIds = [...new Set(rawIds.map(id => cleanText(id, 50)).filter(Boolean))];
        const notes = cleanText(req.body.Notes ?? req.body.notes, 1000) || null;
        if (!employeeIds.length) {
            return res.status(400).json({ success: false, message: 'Select at least one employee' });
        }

        const actorId = req.user?.id || req.user?.EmployeeID || null;
        const actorName = getActorName(req);
        const created = [];
        const reassigned = [];
        const skipped = [];
        const missing = [];
        const blocked = [];

        for (const employeeId of employeeIds) {
            const employee = await resolveEmployee(employeeId);
            if (!employee) { missing.push(employeeId); continue; }

            const [[existing]] = await db.query(
                'SELECT * FROM FourM_CurriculumEmployees WHERE CurriculumID = ? AND EmployeeID = ? LIMIT 1',
                [req.params.id, employee.EmployeeID]
            );
            if (existing?.Status === 'Assigned') { skipped.push(employee.EmployeeID); continue; }

            const activeOtherCurriculum = await getActiveTrainingCurriculumForEmployee(employee.EmployeeID, {
                year: curriculum.Year,
                department: curriculum.Department,
                excludeCurriculumId: curriculum.id,
            });
            if (activeOtherCurriculum) {
                blocked.push({
                    employeeId: employee.EmployeeID,
                    employeeName: employee.EmployeeName,
                    curriculumId: activeOtherCurriculum.CurriculumID,
                    curriculumCode: activeOtherCurriculum.CurriculumCode,
                    curriculumTitle: activeOtherCurriculum.CurriculumTitle,
                });
                continue;
            }

            if (existing) {
                await db.query(
                    `UPDATE FourM_CurriculumEmployees
                     SET EmployeeName = ?, Department = ?, Position = ?, Status = 'Assigned',
                         AssignedAt = NOW(), AssignedByID = ?, AssignedBy = ?,
                         RemovedAt = NULL, RemovedByID = NULL, RemovedBy = NULL, Notes = ?
                     WHERE id = ?`,
                    [employee.EmployeeName, employee.Department, employee.Position, actorId, actorName, notes, existing.id]
                );
                reassigned.push(employee.EmployeeID);
            } else {
                const id = randomUUID();
                await db.query(
                    `INSERT INTO FourM_CurriculumEmployees
                     (id, CurriculumID, EmployeeID, EmployeeName, Department, Position, Status, AssignedByID, AssignedBy, Notes)
                     VALUES (?, ?, ?, ?, ?, ?, 'Assigned', ?, ?, ?)`,
                    [id, req.params.id, employee.EmployeeID, employee.EmployeeName, employee.Department, employee.Position, actorId, actorName, notes]
                );
                created.push(employee.EmployeeID);
            }

            await logTrainingMatrix(req, {
                action: existing ? 'CURRICULUM_ASSIGNMENT_REASSIGN' : 'CURRICULUM_ASSIGNMENT_CREATE',
                curriculumId: req.params.id,
                employeeId: employee.EmployeeID,
                oldValue: existing || null,
                newValue: { ...employee, Status: 'Assigned', Notes: notes },
                detail: `Assign ${employee.EmployeeID} to 4M curriculum ${curriculum.CurriculumCode}`,
            });
        }

        if (!created.length && !reassigned.length && blocked.length) {
            return res.status(409).json({
                success: false,
                message: 'Employee is already active in another 4M curriculum',
                data: { created, reassigned, skipped, missing, blocked },
            });
        }

        res.status(201).json({
            success: true,
            message: blocked.length ? 'Saved assignments, but some employees are already active in another 4M curriculum' : 'Curriculum assignments saved',
            data: { created, reassigned, skipped, missing, blocked },
        });
    } catch (error) {
        console.error('4M curriculum assignment create error:', error);
        res.status(500).json({ success: false, message: 'Cannot assign employees to curriculum' });
    }
});

router.delete('/training-curriculum-assignments/:id', async (req, res) => {
    try {
        await ensureTables();
        const current = await getTrainingCurriculumAssignment(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: 'Assignment not found' });
        if (!await canManageTrainingDept(req, current.CurriculumDepartment)) return denyDept(res);
        await db.query(
            `UPDATE FourM_CurriculumEmployees
             SET Status = 'Removed', RemovedAt = NOW(), RemovedByID = ?, RemovedBy = ?
             WHERE id = ?`,
            [req.user?.id || req.user?.EmployeeID || null, getActorName(req), req.params.id]
        );
        await logTrainingMatrix(req, {
            action: 'CURRICULUM_ASSIGNMENT_REMOVE',
            curriculumId: current.CurriculumID,
            employeeId: current.EmployeeID,
            oldValue: current,
            detail: `Remove ${current.EmployeeID} from 4M curriculum ${current.CurriculumCode}`,
        });
        res.json({ success: true, message: 'Curriculum assignment removed' });
    } catch (error) {
        console.error('4M curriculum assignment remove error:', error);
        res.status(500).json({ success: false, message: 'Cannot remove curriculum assignment' });
    }
});

router.post('/training-curriculum-assignments/:id/transfer', async (req, res) => {
    let conn;
    try {
        await ensureTables();
        const current = await getTrainingCurriculumAssignment(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: 'Assignment not found' });
        if (current.Status !== 'Assigned') return res.status(400).json({ success: false, message: 'Only assigned employees can be transferred' });
        if (!await canManageTrainingDept(req, current.CurriculumDepartment)) return denyDept(res);

        const targetCurriculumId = cleanText(req.body.TargetCurriculumID ?? req.body.targetCurriculumId, 36);
        const notes = cleanText(req.body.Notes ?? req.body.notes, 1000) || null;
        if (!targetCurriculumId || targetCurriculumId === current.CurriculumID) {
            return res.status(400).json({ success: false, message: 'Select a different destination curriculum' });
        }
        const target = await getTrainingCurriculum(targetCurriculumId);
        if (!target || Number(target.IsActive) !== 1) return res.status(404).json({ success: false, message: 'Destination curriculum not found' });
        if (!await canManageTrainingDept(req, target.Department)) return denyDept(res);

        const [[courseReady]] = await db.query(
            'SELECT COUNT(*) AS TotalCourses FROM FourM_Courses WHERE CurriculumID = ? AND IsActive = 1',
            [targetCurriculumId]
        );
        if (!courseReady || Number(courseReady.TotalCourses) < 1) {
            return res.status(400).json({ success: false, message: 'Destination curriculum must have at least one active course' });
        }

        const actorId = req.user?.id || req.user?.EmployeeID || null;
        const actorName = getActorName(req);
        const transferAt = new Date();
        conn = await db.getConnection();
        await conn.beginTransaction();

        const [[targetExisting]] = await conn.query(
            'SELECT * FROM FourM_CurriculumEmployees WHERE CurriculumID = ? AND EmployeeID = ? LIMIT 1 FOR UPDATE',
            [targetCurriculumId, current.EmployeeID]
        );
        if (targetExisting?.Status === 'Assigned') {
            await conn.rollback();
            return res.status(409).json({ success: false, message: 'Employee is already assigned to destination curriculum' });
        }

        await conn.query(
            `UPDATE FourM_CurriculumEmployees
             SET Status = 'Transferred', RemovedAt = ?, RemovedByID = ?, RemovedBy = ?
             WHERE id = ?`,
            [transferAt, actorId, actorName, current.id]
        );

        let targetAssignmentId = targetExisting?.id || randomUUID();
        if (targetExisting) {
            await conn.query(
                `UPDATE FourM_CurriculumEmployees
                 SET EmployeeName = ?, Department = ?, Position = ?, Status = 'Assigned',
                     AssignedAt = ?, AssignedByID = ?, AssignedBy = ?,
                     RemovedAt = NULL, RemovedByID = NULL, RemovedBy = NULL, Notes = ?
                 WHERE id = ?`,
                [current.EmployeeName, current.Department, current.Position, transferAt, actorId, actorName, notes, targetExisting.id]
            );
        } else {
            await conn.query(
                `INSERT INTO FourM_CurriculumEmployees
                 (id, CurriculumID, EmployeeID, EmployeeName, Department, Position, Status, AssignedAt, AssignedByID, AssignedBy, Notes)
                 VALUES (?, ?, ?, ?, ?, ?, 'Assigned', ?, ?, ?, ?)`,
                [targetAssignmentId, targetCurriculumId, current.EmployeeID, current.EmployeeName, current.Department, current.Position, transferAt, actorId, actorName, notes]
            );
        }

        const oldValue = {
            assignmentId: current.id,
            curriculumId: current.CurriculumID,
            curriculumCode: current.CurriculumCode,
            curriculumTitle: current.CurriculumTitle,
            department: current.CurriculumDepartment,
            status: current.Status,
        };
        const newValue = {
            assignmentId: targetAssignmentId,
            curriculumId: target.id,
            curriculumCode: target.CurriculumCode,
            curriculumTitle: target.CurriculumTitle,
            department: target.Department,
            status: 'Assigned',
            reactivated: Boolean(targetExisting),
            notes,
        };
        await insertTrainingMatrixLog(conn, req, {
            action: 'CURRICULUM_ASSIGNMENT_TRANSFER',
            curriculumId: current.CurriculumID,
            employeeId: current.EmployeeID,
            oldValue,
            newValue,
        });
        await conn.commit();

        await logAudit(req, {
            action: 'FOURM_TRAINING_CURRICULUM_ASSIGNMENT_TRANSFER',
            module: 'fourm',
            targetType: 'FourM_TrainingMatrix',
            targetId: current.EmployeeID,
            detail: `Transfer ${current.EmployeeID} from ${current.CurriculumCode} to ${target.CurriculumCode}`,
            metadata: { employeeId: current.EmployeeID, oldValue, newValue },
            statusCode: 200,
        });
        res.json({ success: true, message: 'Curriculum assignment transferred', data: { oldAssignmentId: current.id, targetAssignmentId } });
    } catch (error) {
        if (conn) {
            try { await conn.rollback(); } catch (_) {}
        }
        console.error('4M curriculum assignment transfer error:', error);
        res.status(500).json({ success: false, message: 'Cannot transfer curriculum assignment' });
    } finally {
        if (conn) conn.release();
    }
});

router.get('/training-courses/:id/assignments', async (req, res) => {
    try {
        await ensureTables();
        const course = await getTrainingCourse(req.params.id);
        if (!course) return res.status(404).json({ success: false, message: 'ไม่พบรายวิชา' });
        if (!canReadTrainingDept(req, course.Department)) return denyDept(res);
        const status = cleanText(req.query.status, 20);
        const params = [req.params.id];
        let statusWhere = '';
        if (status && status !== 'all') {
            statusWhere = 'AND ce.Status = ?';
            params.push(status);
        }
        const [rows] = await db.query(
            `SELECT ce.*
             FROM FourM_CourseEmployees ce
             WHERE ce.CourseID = ? ${statusWhere}
             ORDER BY ce.Status = 'Assigned' DESC, ce.EmployeeName ASC, ce.EmployeeID ASC`,
            params
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('4M training assignment list error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงรายชื่อพนักงานในรายวิชาได้' });
    }
});

router.post('/training-courses/:id/assignments', async (req, res) => {
    try {
        await ensureTables();
        const course = await getTrainingCourse(req.params.id);
        if (!course) return res.status(404).json({ success: false, message: 'ไม่พบรายวิชา' });
        if (!await canManageTrainingDept(req, course.Department)) return denyDept(res);

        const rawIds = Array.isArray(req.body.EmployeeIDs)
            ? req.body.EmployeeIDs
            : Array.isArray(req.body.employeeIds)
                ? req.body.employeeIds
                : [req.body.EmployeeID ?? req.body.employeeId];
        const employeeIds = [...new Set(rawIds.map(id => cleanText(id, 50)).filter(Boolean))];
        const notes = cleanText(req.body.Notes ?? req.body.notes, 1000) || null;
        if (!employeeIds.length) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกพนักงานอย่างน้อย 1 คน' });
        }

        const actorId = req.user?.id || req.user?.EmployeeID || null;
        const actorName = getActorName(req);
        const created = [];
        const reassigned = [];
        const skipped = [];
        const missing = [];
        const blocked = [];

        for (const employeeId of employeeIds) {
            const employee = await resolveEmployee(employeeId);
            if (!employee) {
                missing.push(employeeId);
                continue;
            }

            const [[existing]] = await db.query(
                'SELECT * FROM FourM_CourseEmployees WHERE CourseID = ? AND EmployeeID = ? LIMIT 1',
                [course.id, employee.EmployeeID]
            );
            if (existing?.Status === 'Assigned') {
                skipped.push(employee.EmployeeID);
                continue;
            }

            const activeOtherCurriculum = await getActiveTrainingCurriculumForEmployee(employee.EmployeeID, {
                year: course.Year,
                department: course.Department,
                excludeCurriculumId: course.CurriculumID,
            });
            if (activeOtherCurriculum) {
                blocked.push({
                    employeeId: employee.EmployeeID,
                    employeeName: employee.EmployeeName,
                    curriculumId: activeOtherCurriculum.CurriculumID,
                    curriculumCode: activeOtherCurriculum.CurriculumCode,
                    curriculumTitle: activeOtherCurriculum.CurriculumTitle,
                    courseCode: activeOtherCurriculum.CourseCode,
                    courseTitle: activeOtherCurriculum.CourseTitle,
                });
                continue;
            }

            if (existing) {
                await db.query(
                    `UPDATE FourM_CourseEmployees
                     SET EmployeeName = ?, Department = ?, Position = ?, Status = 'Assigned',
                         AssignedAt = NOW(), AssignedByID = ?, AssignedBy = ?,
                         RemovedAt = NULL, RemovedByID = NULL, RemovedBy = NULL, Notes = ?
                     WHERE id = ?`,
                    [employee.EmployeeName, employee.Department, employee.Position, actorId, actorName, notes, existing.id]
                );
                reassigned.push(employee.EmployeeID);
                await logTrainingMatrix(req, {
                    action: 'ASSIGNMENT_REASSIGN',
                    curriculumId: course.CurriculumID,
                    courseId: course.id,
                    employeeId: employee.EmployeeID,
                    oldValue: existing,
                    newValue: { ...employee, Status: 'Assigned', Notes: notes },
                    detail: `Reassign ${employee.EmployeeID} to 4M course ${course.CourseCode}`,
                });
                continue;
            }

            const id = randomUUID();
            await db.query(
                `INSERT INTO FourM_CourseEmployees
                 (id, CourseID, EmployeeID, EmployeeName, Department, Position, Status, AssignedByID, AssignedBy, Notes)
                 VALUES (?, ?, ?, ?, ?, ?, 'Assigned', ?, ?, ?)`,
                [id, course.id, employee.EmployeeID, employee.EmployeeName, employee.Department, employee.Position, actorId, actorName, notes]
            );
            created.push(employee.EmployeeID);
            await logTrainingMatrix(req, {
                action: 'ASSIGNMENT_CREATE',
                curriculumId: course.CurriculumID,
                courseId: course.id,
                employeeId: employee.EmployeeID,
                newValue: { ...employee, Notes: notes },
                detail: `Assign ${employee.EmployeeID} to 4M course ${course.CourseCode}`,
            });
        }

        if (!created.length && !reassigned.length && blocked.length) {
            return res.status(409).json({
                success: false,
                message: 'Employee is already active in another 4M curriculum',
                data: { created, reassigned, skipped, missing, blocked },
            });
        }

        res.status(201).json({
            success: true,
            message: blocked.length
                ? 'Saved assignments, but some employees are already active in another 4M curriculum'
                : 'บันทึกรายชื่อพนักงานในรายวิชา 4M สำเร็จ',
            data: { created, reassigned, skipped, missing, blocked },
        });
    } catch (error) {
        console.error('4M training assignment create error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถเพิ่มรายชื่อพนักงานในรายวิชาได้' });
    }
});

router.put('/training-assignments/:id', async (req, res) => {
    try {
        await ensureTables();
        const current = await getTrainingAssignment(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: 'ไม่พบรายการพนักงานในรายวิชา' });
        if (!await canManageTrainingDept(req, current.CurriculumDepartment)) return denyDept(res);

        const fields = [];
        const vals = [];
        if (req.body.Notes !== undefined || req.body.notes !== undefined) {
            fields.push('Notes = ?');
            vals.push(cleanText(req.body.Notes ?? req.body.notes, 1000) || null);
        }
        if (req.body.Status !== undefined || req.body.status !== undefined) {
            const status = cleanText(req.body.Status ?? req.body.status, 20);
            if (!['Assigned', 'Removed', 'Transferred'].includes(status)) {
                return res.status(400).json({ success: false, message: 'สถานะรายการพนักงานไม่ถูกต้อง' });
            }
            fields.push('Status = ?');
            vals.push(status);
            if (status === 'Removed') {
                fields.push('RemovedAt = NOW()', 'RemovedByID = ?', 'RemovedBy = ?');
                vals.push(req.user?.id || req.user?.EmployeeID || null, getActorName(req));
            } else if (status === 'Assigned') {
                fields.push('RemovedAt = NULL', 'RemovedByID = NULL', 'RemovedBy = NULL');
            }
        }
        if (!fields.length) return res.json({ success: true, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
        vals.push(req.params.id);
        await db.query(`UPDATE FourM_CourseEmployees SET ${fields.join(', ')} WHERE id = ?`, vals);
        await logTrainingMatrix(req, {
            action: 'ASSIGNMENT_UPDATE',
            curriculumId: current.CurriculumID,
            courseId: current.CourseID,
            employeeId: current.EmployeeID,
            oldValue: current,
            newValue: req.body,
            detail: `Update 4M assignment ${current.EmployeeID} in ${current.CourseCode}`,
        });
        res.json({ success: true, message: 'อัปเดตรายการพนักงานในรายวิชา 4M สำเร็จ' });
    } catch (error) {
        console.error('4M training assignment update error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตรายการพนักงานในรายวิชาได้' });
    }
});

router.post('/training-assignments/:id/transfer', async (req, res) => {
    let conn;
    try {
        await ensureTables();
        const current = await getTrainingAssignment(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: 'ไม่พบรายการพนักงานในรายวิชา' });
        if (current.Status !== 'Assigned') {
            return res.status(400).json({ success: false, message: 'ย้ายได้เฉพาะรายการที่ยังอยู่ในสถานะ Assigned' });
        }
        if (!await canManageTrainingDept(req, current.CurriculumDepartment)) return denyDept(res);

        const targetCourseId = cleanText(
            req.body.TargetCourseID ?? req.body.targetCourseId ?? req.body.NewCourseID ?? req.body.newCourseId,
            36
        );
        const notes = cleanText(req.body.Notes ?? req.body.notes, 1000) || null;
        if (!targetCourseId) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกรายวิชาปลายทาง' });
        }
        if (targetCourseId === current.CourseID) {
            return res.status(400).json({ success: false, message: 'รายวิชาปลายทางต้องไม่ใช่รายวิชาเดิม' });
        }

        const targetCourse = await getTrainingCourse(targetCourseId);
        if (!targetCourse || Number(targetCourse.IsActive) !== 1) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายวิชาปลายทางที่เปิดใช้งาน' });
        }
        if (!await canManageTrainingDept(req, targetCourse.Department)) return denyDept(res);

        const actorId = req.user?.id || req.user?.EmployeeID || null;
        const actorName = getActorName(req);
        const transferAt = new Date();
        let targetAssignmentId = null;

        conn = await db.getConnection();
        await conn.beginTransaction();

        const [[targetExisting]] = await conn.query(
            'SELECT * FROM FourM_CourseEmployees WHERE CourseID = ? AND EmployeeID = ? LIMIT 1 FOR UPDATE',
            [targetCourse.id, current.EmployeeID]
        );
        if (targetExisting?.Status === 'Assigned') {
            await conn.rollback();
            return res.status(409).json({ success: false, message: 'พนักงานคนนี้อยู่ในรายวิชาปลายทางแล้ว' });
        }

        const activeOtherCurriculum = await getActiveTrainingCurriculumForEmployee(current.EmployeeID, {
            year: targetCourse.Year,
            department: targetCourse.Department,
            excludeAssignmentId: current.id,
            excludeCurriculumId: targetCourse.CurriculumID,
        }, conn);
        if (activeOtherCurriculum) {
            await conn.rollback();
            return res.status(409).json({
                success: false,
                message: 'Employee still has an active assignment in another 4M curriculum',
                data: { activeOtherCurriculum },
            });
        }

        await conn.query(
            `UPDATE FourM_CourseEmployees
             SET Status = 'Transferred', RemovedAt = ?, RemovedByID = ?, RemovedBy = ?
             WHERE id = ?`,
            [transferAt, actorId, actorName, current.id]
        );

        if (targetExisting) {
            targetAssignmentId = targetExisting.id;
            await conn.query(
                `UPDATE FourM_CourseEmployees
                 SET EmployeeName = ?, Department = ?, Position = ?, Status = 'Assigned',
                     AssignedAt = ?, AssignedByID = ?, AssignedBy = ?,
                     RemovedAt = NULL, RemovedByID = NULL, RemovedBy = NULL, Notes = ?
                 WHERE id = ?`,
                [
                    current.EmployeeName,
                    current.Department,
                    current.Position,
                    transferAt,
                    actorId,
                    actorName,
                    notes,
                    targetExisting.id,
                ]
            );
        } else {
            targetAssignmentId = randomUUID();
            await conn.query(
                `INSERT INTO FourM_CourseEmployees
                 (id, CourseID, EmployeeID, EmployeeName, Department, Position, Status, AssignedAt, AssignedByID, AssignedBy, Notes)
                 VALUES (?, ?, ?, ?, ?, ?, 'Assigned', ?, ?, ?, ?)`,
                [
                    targetAssignmentId,
                    targetCourse.id,
                    current.EmployeeID,
                    current.EmployeeName,
                    current.Department,
                    current.Position,
                    transferAt,
                    actorId,
                    actorName,
                    notes,
                ]
            );
        }

        const logOldValue = {
            assignmentId: current.id,
            curriculumId: current.CurriculumID,
            curriculumCode: current.CurriculumCode,
            courseId: current.CourseID,
            courseCode: current.CourseCode,
            courseTitle: current.CourseTitle,
            status: current.Status,
        };
        const logNewValue = {
            assignmentId: targetAssignmentId,
            curriculumId: targetCourse.CurriculumID,
            curriculumCode: targetCourse.CurriculumCode,
            courseId: targetCourse.id,
            courseCode: targetCourse.CourseCode,
            courseTitle: targetCourse.CourseTitle,
            status: 'Assigned',
            reactivated: Boolean(targetExisting),
            notes,
        };
        await insertTrainingMatrixLog(conn, req, {
            action: 'ASSIGNMENT_TRANSFER',
            curriculumId: current.CurriculumID,
            courseId: current.CourseID,
            employeeId: current.EmployeeID,
            oldValue: logOldValue,
            newValue: logNewValue,
        });
        await conn.commit();

        await logAudit(req, {
            action: 'FOURM_TRAINING_ASSIGNMENT_TRANSFER',
            module: 'fourm',
            targetType: 'FourM_TrainingMatrix',
            targetId: current.EmployeeID,
            detail: `Transfer ${current.EmployeeID} from ${current.CourseCode} to ${targetCourse.CourseCode}`,
            metadata: {
                employeeId: current.EmployeeID,
                oldCourseId: current.CourseID,
                oldCourseCode: current.CourseCode,
                newCourseId: targetCourse.id,
                newCourseCode: targetCourse.CourseCode,
                targetAssignmentId,
            },
            statusCode: 200,
        });
        res.json({
            success: true,
            message: 'ย้ายพนักงานไปรายวิชาปลายทางสำเร็จ',
            data: { oldAssignmentId: current.id, targetAssignmentId, targetCourseId: targetCourse.id },
        });
    } catch (error) {
        if (conn) {
            try { await conn.rollback(); } catch (_) {}
        }
        console.error('4M training assignment transfer error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถย้ายพนักงานไปรายวิชาปลายทางได้' });
    } finally {
        if (conn) conn.release();
    }
});

router.delete('/training-assignments/:id', async (req, res) => {
    try {
        await ensureTables();
        const current = await getTrainingAssignment(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: 'ไม่พบรายการพนักงานในรายวิชา' });
        if (!await canManageTrainingDept(req, current.CurriculumDepartment)) return denyDept(res);
        await db.query(
            `UPDATE FourM_CourseEmployees
             SET Status = 'Removed', RemovedAt = NOW(), RemovedByID = ?, RemovedBy = ?
             WHERE id = ?`,
            [req.user?.id || req.user?.EmployeeID || null, getActorName(req), req.params.id]
        );
        await logTrainingMatrix(req, {
            action: 'ASSIGNMENT_REMOVE',
            curriculumId: current.CurriculumID,
            courseId: current.CourseID,
            employeeId: current.EmployeeID,
            oldValue: current,
            detail: `Remove ${current.EmployeeID} from 4M course ${current.CourseCode}`,
        });
        res.json({ success: true, message: 'ลบรายชื่อพนักงานจากรายวิชา 4M สำเร็จ' });
    } catch (error) {
        console.error('4M training assignment remove error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบรายชื่อพนักงานจากรายวิชาได้' });
    }
});

router.get('/training-logs', async (req, res) => {
    try {
        await ensureTables();
        const curriculumId = cleanText(req.query.curriculumId, 36);
        const courseId = cleanText(req.query.courseId, 36);
        const employeeId = cleanText(req.query.employeeId, 50);
        const action = cleanText(req.query.action, 50);
        const dept = cleanText(req.query.dept, 100);
        const year = parseInt(req.query.year, 10);
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 300);
        const params = [];
        const where = [];
        if (curriculumId) { where.push('l.CurriculumID = ?'); params.push(curriculumId); }
        if (courseId) { where.push('l.CourseID = ?'); params.push(courseId); }
        if (employeeId) { where.push('l.EmployeeID = ?'); params.push(employeeId); }
        if (action && action !== 'all') { where.push('l.Action = ?'); params.push(action); }
        if (Number.isInteger(year) && year > 2000) { where.push('cur.`Year` = ?'); params.push(year); }
        if (isFourmAdmin(req) && dept && dept !== 'all') { where.push('cur.Department = ?'); params.push(dept); }
        if (!isFourmAdmin(req)) {
            const ownDept = currentUserDept(req);
            if (!ownDept) return res.json({ success: true, data: [] });
            where.push('cur.Department = ?');
            params.push(ownDept);
        }
        params.push(limit);
        const [rows] = await db.query(
            `SELECT l.*, cur.Department, cur.\`Year\`, cur.CurriculumCode, cur.CurriculumTitle,
                    co.CourseCode, co.CourseTitle
             FROM FourM_CurriculumLogs l
             LEFT JOIN FourM_Curriculums cur ON cur.id = l.CurriculumID
             LEFT JOIN FourM_Courses co ON co.id = l.CourseID
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY l.PerformedAt DESC, l.id DESC
             LIMIT ?`,
            params
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('4M training log list error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงประวัติ Training Matrix ได้' });
    }
});

router.delete('/training-logs/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const id = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid training log id.' });
        }
        const [rows] = await db.query('SELECT * FROM FourM_CurriculumLogs WHERE id = ?', [id]);
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Training log not found.' });
        }
        const oldValue = rows[0];
        await db.query('DELETE FROM FourM_CurriculumLogs WHERE id = ?', [id]);
        await logAudit(req, {
            action: 'FOURM_TRAINING_LOG_DELETE',
            module: 'fourm',
            targetType: 'FourM_CurriculumLog',
            targetId: id,
            detail: `Delete 4M Training Matrix history log ${id}`,
            metadata: { oldValue },
            statusCode: 200,
        });
        res.json({ success: true });
    } catch (error) {
        console.error('4M training log delete error:', error);
        res.status(500).json({ success: false, message: 'Cannot delete Training Matrix history.' });
    }
});

router.get('/responsible-employees', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const q = String(req.query.q || '').trim();
        if (q.length < 2 || q.length > 100 || /[\u0000-\u001f\u007f]/.test(q)) {
            return res.status(400).json({ success: false, message: 'Search must contain 2 to 100 characters.' });
        }
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 30);
        const like = `%${q}%`;
        const [rows] = await db.query(
            `SELECT EmployeeID, EmployeeName, Department, Unit, Position, CompanyEmail
             FROM Employees
             WHERE EmployeeID LIKE ?
                OR EmployeeName LIKE ?
                OR Department LIKE ?
                OR Position LIKE ?
             ORDER BY (EmployeeID = ?) DESC, EmployeeName, EmployeeID
             LIMIT ?`,
            [like, like, like, like, q, limit]
        );
        res.json({
            success: true,
            data: rows.map(row => {
                const companyEmail = normalizeCompanyEmail(row.CompanyEmail);
                return { ...row, CompanyEmail: companyEmail, EmailReady: Boolean(companyEmail) };
            }),
        });
    } catch (error) {
        console.error('4M responsible employee search error:', error);
        res.status(500).json({ success: false, message: 'Cannot search responsible employees.' });
    }
});

router.get('/notices', async (req, res) => {
    try {
        await ensureTables();
        const { status, type, dept, year, q, overdue, mine, trainingRequired } = req.query;
        let sql = 'SELECT * FROM FourM_ChangeNotices WHERE 1=1';
        const params = [];
        if (overdue === '1') {
            sql += ` AND Status IN ('Open','Pending') AND DATEDIFF(CURDATE(), RequestDate) > ${OVERDUE_DAYS}`;
        } else if (status && status !== 'all') {
            sql += ' AND Status = ?'; params.push(status);
        }
        if (type   && type   !== 'all') { sql += ' AND ChangeType = ?'; params.push(type); }
        if (dept   && dept   !== 'all') { sql += ' AND Department = ?'; params.push(dept); }
        if (trainingRequired === '1') { sql += ' AND TrainingRequired = 1'; }
        if (mine === '1') {
            sql += ' AND (CreatedByID = ? OR ResponsibleEmployeeID = ?)';
            params.push(req.user.id, req.user.id);
        }
        if (year) { sql += ' AND YEAR(RequestDate) = ?'; params.push(parseInt(year)); }
        if (q && q.trim()) {
            sql += ' AND (Title LIKE ? OR NoticeNo LIKE ? OR ResponsiblePerson LIKE ?)';
            const like = `%${q.trim()}%`;
            params.push(like, like, like);
        }
        sql += ' ORDER BY RequestDate DESC, CreatedAt DESC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูล Change Notice ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE NOTICES — GET SINGLE
// ─────────────────────────────────────────────────────────────────────────────
router.get('/notice-next-no', async (req, res) => {
    try {
        await ensureTables();
        const noticeNo = await generateNoticeNo(req.query.date);
        res.json({ success: true, data: { NoticeNo: noticeNo } });
    } catch (error) {
        console.error('4M notice next no error:', error);
        res.status(500).json({ success: false, message: 'Cannot generate next Notice No.' });
    }
});

router.get('/notices/:id', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT * FROM FourM_ChangeNotices WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบ Change Notice' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE NOTICES — CREATE
// ─────────────────────────────────────────────────────────────────────────────
// ACTION TASKS - LIST
router.get('/notices/:id/tasks', async (req, res) => {
    try {
        await ensureTables();
        const { notice, error } = await getNoticeForTask(req, req.params.id);
        if (error) return res.status(error.code).json({ success: false, message: error.message });
        const [rows] = await db.query(
            `SELECT *
             FROM FourM_ActionTasks
             WHERE NoticeID = ?
             ORDER BY Status = 'Done', COALESCE(DueDate, '9999-12-31') ASC, CreatedAt ASC`,
            [notice.id]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('4M task list error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึง Action Plan ได้' });
    }
});

router.get('/email-outbox', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const status = String(req.query.status || '').trim();
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const params = [];
        let where = '';
        if (status) {
            where = 'WHERE Status = ?';
            params.push(status);
        }
        params.push(limit);
        const [rows] = await db.query(
            `SELECT id, NoticeID, TaskID, EventType, Recipients, Subject, Status, SentAt, Error, CreatedAt
             FROM FourM_EmailOutbox
             ${where}
             ORDER BY CreatedAt DESC, id DESC
             LIMIT ?`,
            params
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('4M email outbox error:', error);
        res.status(500).json({ success: false, message: 'Cannot load 4M email outbox.' });
    }
});

router.post('/email-outbox/:id/retry', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT * FROM FourM_EmailOutbox WHERE id = ? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Email queue item not found.' });
        const item = rows[0];
        try {
            await sendMail({ to: item.Recipients, subject: item.Subject, text: item.Body, html: item.HtmlBody });
            await db.query(
                `UPDATE FourM_EmailOutbox SET Status = 'Sent', SentAt = NOW(), Error = NULL WHERE id = ?`,
                [item.id]
            );
            res.json({ success: true, message: 'Email sent.' });
        } catch (error) {
            await db.query(
                `UPDATE FourM_EmailOutbox SET Status = 'Failed', Error = ? WHERE id = ?`,
                [error.message, item.id]
            );
            res.status(500).json({ success: false, message: error.message });
        }
    } catch (error) {
        console.error('4M email retry error:', error);
        res.status(500).json({ success: false, message: 'Cannot retry 4M email.' });
    }
});

// ACTION TASKS - CREATE (notice creator OR admin)
router.post('/notices/:id/tasks', async (req, res) => {
    try {
        await ensureTables();
        const { notice, canManage, error } = await getNoticeForTask(req, req.params.id);
        if (error) return res.status(error.code).json({ success: false, message: error.message });
        if (!canManage) return res.status(403).json({ success: false, message: 'เฉพาะผู้สร้าง Notice หรือ Admin เท่านั้นที่จัดการ Action Plan ได้' });
        const taskResult = normalizeTaskPayload(req.body);
        if (taskResult.error) return res.status(400).json({ success: false, message: taskResult.error });
        const task = taskResult.task;
        const id = randomUUID();
        const actorName = getActorName(req);
        const completedAt = task.Status === 'Done' ? new Date() : null;
        const completedBy = task.Status === 'Done' ? actorName : null;
        await db.query(
            `INSERT INTO FourM_ActionTasks
             (id, NoticeID, TaskTitle, OwnerName, DueDate, Status, Notes, CompletedAt, CompletedBy, CreatedByID, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, notice.id, task.TaskTitle, task.OwnerName, task.DueDate, task.Status, task.Notes,
             completedAt, completedBy, req.user.id, actorName]
        );
        await logAudit(req, {
            action: 'FOURM_ACTION_TASK_CREATE',
            module: 'fourm',
            targetType: 'FourM_ActionTask',
            targetId: id,
            detail: `Create Action Task for ${notice.NoticeNo || notice.id}`,
            metadata: fourmAuditMeta(notice, { task }),
            statusCode: 201,
        });
        const creatorEmail = await getEmployeeCompanyEmail(notice.CreatedByID);
        const recipients = uniqueRecipients([FOURM_ADMIN_EMAIL, creatorEmail]);
        const mail = buildTaskEmail(notice, { ...task, id }, 'Created');
        await queueFourMEmail({
            to: recipients.join(','),
            noticeId: notice.id,
            taskId: id,
            eventType: 'ActionTaskCreated',
            subject: mail.subject,
            body: mail.body,
            html: mail.html,
        });
        res.status(201).json({ success: true, message: 'เพิ่ม Action Plan สำเร็จ', data: { id } });
    } catch (error) {
        console.error('4M task create error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถเพิ่ม Action Plan ได้' });
    }
});

// ACTION TASKS - UPDATE (notice creator OR admin)
router.put('/notice-tasks/:taskId', async (req, res) => {
    try {
        await ensureTables();
        const [taskRows] = await db.query(
            `SELECT t.*, n.NoticeNo, n.Title, n.Department, n.ChangeType, n.Status AS NoticeStatus, n.CreatedByID AS NoticeCreatedByID
             FROM FourM_ActionTasks t
             JOIN FourM_ChangeNotices n ON n.id = t.NoticeID
             WHERE t.id = ?`,
            [req.params.taskId]
        );
        if (!taskRows.length) return res.status(404).json({ success: false, message: 'ไม่พบ Action Plan' });
        const current = taskRows[0];
        const isAdminUser = req.user?.role === 'Admin' || req.user?.Role === 'Admin';
        const isCreator = req.user?.id === current.NoticeCreatedByID;
        if (!isAdminUser && !isCreator) return res.status(403).json({ success: false, message: 'เฉพาะผู้สร้าง Notice หรือ Admin เท่านั้นที่จัดการ Action Plan ได้' });
        const taskResult = normalizeTaskPayload(req.body, current);
        if (taskResult.error) return res.status(400).json({ success: false, message: taskResult.error });
        const task = taskResult.task;
        const actorName = getActorName(req);
        const completedAt = task.Status === 'Done' ? (current.CompletedAt || new Date()) : null;
        const completedBy = task.Status === 'Done' ? (current.CompletedBy || actorName) : null;
        await db.query(
            `UPDATE FourM_ActionTasks
             SET TaskTitle=?, OwnerName=?, DueDate=?, Status=?, Notes=?, CompletedAt=?, CompletedBy=?
             WHERE id=?`,
            [task.TaskTitle, task.OwnerName, task.DueDate, task.Status, task.Notes, completedAt, completedBy, current.id]
        );
        await logAudit(req, {
            action: task.Status === 'Done' && current.Status !== 'Done' ? 'FOURM_ACTION_TASK_DONE' : 'FOURM_ACTION_TASK_UPDATE',
            module: 'fourm',
            targetType: 'FourM_ActionTask',
            targetId: current.id,
            detail: `Update Action Task for ${current.NoticeNo || current.NoticeID}`,
            metadata: fourmAuditMeta({
                NoticeNo: current.NoticeNo,
                Title: current.Title,
                Department: current.Department,
                ChangeType: current.ChangeType,
                Status: current.NoticeStatus,
            }, { previousTaskStatus: current.Status, task }),
            statusCode: 200,
        });
        if (task.Status === 'Done' && current.Status !== 'Done') {
            const creatorEmail = await getEmployeeCompanyEmail(current.NoticeCreatedByID);
            const recipients = uniqueRecipients([FOURM_ADMIN_EMAIL, creatorEmail]);
            const mail = buildTaskEmail(current, { ...current, ...task }, 'Done');
            await queueFourMEmail({
                to: recipients.join(','),
                noticeId: current.NoticeID,
                taskId: current.id,
                eventType: 'ActionTaskDone',
                subject: mail.subject,
                body: mail.body,
                html: mail.html,
            });
        }
        res.json({ success: true, message: 'อัปเดต Action Plan สำเร็จ' });
    } catch (error) {
        console.error('4M task update error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดต Action Plan ได้' });
    }
});

// ACTION TASKS - DELETE (notice creator OR admin)
router.delete('/notice-tasks/:taskId', async (req, res) => {
    try {
        await ensureTables();
        const [taskRows] = await db.query(
            `SELECT t.*, n.NoticeNo, n.Title, n.Department, n.ChangeType, n.Status AS NoticeStatus, n.CreatedByID AS NoticeCreatedByID
             FROM FourM_ActionTasks t
             JOIN FourM_ChangeNotices n ON n.id = t.NoticeID
             WHERE t.id = ?`,
            [req.params.taskId]
        );
        if (!taskRows.length) return res.status(404).json({ success: false, message: 'ไม่พบ Action Plan' });
        const task = taskRows[0];
        const isAdminUser = req.user?.role === 'Admin' || req.user?.Role === 'Admin';
        const isCreator = req.user?.id === task.NoticeCreatedByID;
        if (!isAdminUser && !isCreator) return res.status(403).json({ success: false, message: 'เฉพาะผู้สร้าง Notice หรือ Admin เท่านั้นที่จัดการ Action Plan ได้' });
        await db.query('DELETE FROM FourM_ActionTasks WHERE id = ?', [task.id]);
        await logAudit(req, {
            action: 'FOURM_ACTION_TASK_DELETE',
            module: 'fourm',
            targetType: 'FourM_ActionTask',
            targetId: task.id,
            detail: `Delete Action Task for ${task.NoticeNo || task.NoticeID}`,
            metadata: fourmAuditMeta({
                NoticeNo: task.NoticeNo,
                Title: task.Title,
                Department: task.Department,
                ChangeType: task.ChangeType,
                Status: task.NoticeStatus,
            }, { taskTitle: task.TaskTitle, taskStatus: task.Status }),
            statusCode: 200,
        });
        res.json({ success: true, message: 'ลบ Action Plan สำเร็จ' });
    } catch (error) {
        console.error('4M task delete error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบ Action Plan ได้' });
    }
});

router.post('/notices', _handleUpload('attachment'), async (req, res) => {
    try {
        await ensureTables();
        const { RequestDate, Title, Description, ChangeType, Department, ResponsibleEmployeeID } = req.body;
        if (!Title || !RequestDate || !ChangeType) {
            return res.status(400).json({ success: false, message: 'กรุณากรอก วันที่, หัวข้อ และ Change Type' });
        }
        const VALID_TYPES = ['Man','Machine','Material','Method'];
        if (!VALID_TYPES.includes(ChangeType)) {
            return res.status(400).json({ success: false, message: 'Change Type ไม่ถูกต้อง' });
        }
        const impactResult = normalizeImpactAssessment(req.body);
        if (impactResult.error) {
            if (req.file) deleteLocalUpload(req.file.path);
            return res.status(400).json({ success: false, message: impactResult.error });
        }
        const impact = impactResult.impact;
        const responsible = await resolveNoticeResponsible(req, ResponsibleEmployeeID);
        if (!responsible) {
            if (req.file) deleteLocalUpload(req.file.path);
            return res.status(400).json({ success: false, message: 'Responsible employee was not found in Employee Master.' });
        }
        const noticeNo = await generateNoticeNo(RequestDate);
        const actorName = getActorName(req);

        const attachUrl = req.file ? req.file.path : null;
        const id = randomUUID();
        await db.query(
            `INSERT INTO FourM_ChangeNotices
                (id,NoticeNo,RequestDate,Title,Description,ChangeType,
                 ResponsiblePerson,ResponsibleEmployeeID,Department,AttachmentUrl,
                 SafetyImpact,QualityImpact,ProductionImpact,EnvironmentImpact,TrainingRequired,ImpactNote,
                 CreatedByID,CreatedBy)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                id, noticeNo, RequestDate, Title.trim(),
                (Description||'').trim()||null, ChangeType,
                responsible.EmployeeName,
                responsible.EmployeeID,
                (Department||'').trim()||null,
                attachUrl,
                impact.SafetyImpact,
                impact.QualityImpact,
                impact.ProductionImpact,
                impact.EnvironmentImpact,
                impact.TrainingRequired,
                impact.ImpactNote,
                req.user.id, actorName,
            ]
        );
        await logAudit(req, {
            action: 'FOURM_NOTICE_CREATE',
            module: 'fourm',
            targetType: 'FourM_ChangeNotice',
            targetId: id,
            detail: `Create Change Notice ${noticeNo}`,
            metadata: fourmAuditMeta({
                NoticeNo: noticeNo,
                Title: Title.trim(),
                Department: (Department || '').trim() || null,
                ChangeType,
                Status: 'Open',
            }, {
                hasAttachment: Boolean(attachUrl),
                impact,
                responsibleEmployeeId: responsible.EmployeeID,
                responsiblePerson: responsible.EmployeeName,
                responsibleDepartment: responsible.Department || null,
                responsibleEmailReady: responsible.EmailReady,
                departmentMismatch: noticeDepartmentMismatch(Department, responsible.Department),
            }),
            statusCode: 201,
        });
        const createdNotice = {
            id,
            NoticeNo: noticeNo,
            RequestDate,
            Title: Title.trim(),
            Department: (Department || '').trim() || null,
            ChangeType,
            CreatedBy: actorName,
            ResponsibleEmployeeID: responsible.EmployeeID,
            ResponsiblePerson: responsible.EmployeeName,
            ResponsibleDepartment: responsible.Department || null,
            Status: 'Open',
        };
        const createMail = buildNoticeCreatedEmail(createdNotice);
        try {
            await queueFourMEmail({
                to: uniqueRecipients([responsible.CompanyEmail, FOURM_ADMIN_EMAIL]).join(','),
                noticeId: id,
                eventType: 'NoticeCreated',
                subject: createMail.subject,
                body: createMail.body,
                html: createMail.html,
            });
        } catch (emailError) {
            console.error('[fourm/email] notice create queue failed:', emailError.message);
        }
        res.status(201).json({ success: true, message: 'สร้าง Change Notice สำเร็จ', data: { NoticeNo: noticeNo } });
    } catch (error) {
        console.error('Notice create error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถสร้าง Change Notice ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE NOTICES — UPDATE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/notices/:id', isAdmin, _handleUpload('attachment'), async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;
        const [rows] = await db.query(
            `SELECT id, NoticeNo, Title, Department, ChangeType, Status, CreatedByID, AttachmentUrl,
                    ResponsibleEmployeeID, ResponsiblePerson
             FROM FourM_ChangeNotices WHERE id = ?`,
            [id]
        );
        if (!rows.length) {
            if (req.file) deleteLocalUpload(req.file.path);
            return res.status(404).json({ success: false, message: 'ไม่พบ Change Notice' });
        }

        const { Title, Description, ChangeType, ResponsibleEmployeeID, Department, Status, RequestDate } = req.body;
        const VALID_TYPES  = ['Man','Machine','Material','Method'];
        const VALID_STATUS = ['Open','Pending','Closed'];
        const impactResult = normalizeImpactAssessment(req.body);
        if (impactResult.error) {
            if (req.file) deleteLocalUpload(req.file.path);
            return res.status(400).json({ success: false, message: impactResult.error });
        }
        const impact = impactResult.impact;
        let responsible = null;
        if (ResponsibleEmployeeID !== undefined && String(ResponsibleEmployeeID || '').trim()) {
            responsible = await resolveNoticeResponsible(req, ResponsibleEmployeeID);
            if (!responsible) {
                if (req.file) deleteLocalUpload(req.file.path);
                return res.status(400).json({ success: false, message: 'Responsible employee was not found in Employee Master.' });
            }
        }
        const responsibleChanged = Boolean(
            responsible && String(responsible.EmployeeID) !== String(rows[0].ResponsibleEmployeeID || '')
        );
        if (Status === 'Closed') {
            if (req.file) deleteLocalUpload(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'กรุณาปิด Change Notice ผ่านขั้นตอนปิดงานเพื่อบันทึกผลการดำเนินการ',
            });
        }
        if (rows[0].Status === 'Closed' && Status && Status !== rows[0].Status) {
            if (req.file) deleteLocalUpload(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'Change Notice ที่ปิดแล้วไม่สามารถเปลี่ยนกลับเป็นสถานะเปิดผ่านการแก้ไขทั่วไปได้',
            });
        }

        const fields = []; const vals = [];
        if (Title !== undefined)             { fields.push('Title = ?');             vals.push(Title); }
        if (Description !== undefined)       { fields.push('Description = ?');       vals.push(Description); }
        if (ChangeType && VALID_TYPES.includes(ChangeType)) { fields.push('ChangeType = ?'); vals.push(ChangeType); }
        if (Status && VALID_STATUS.includes(Status))        { fields.push('Status = ?');     vals.push(Status); }
        if (responsible) {
            fields.push('ResponsiblePerson = ?', 'ResponsibleEmployeeID = ?');
            vals.push(responsible.EmployeeName, responsible.EmployeeID);
        }
        if (Department !== undefined)        { fields.push('Department = ?');        vals.push(Department); }
        if (RequestDate !== undefined)       { fields.push('RequestDate = ?');       vals.push(RequestDate); }
        if (req.body.SafetyImpact !== undefined)      { fields.push('SafetyImpact = ?');      vals.push(impact.SafetyImpact); }
        if (req.body.QualityImpact !== undefined)     { fields.push('QualityImpact = ?');     vals.push(impact.QualityImpact); }
        if (req.body.ProductionImpact !== undefined)  { fields.push('ProductionImpact = ?');  vals.push(impact.ProductionImpact); }
        if (req.body.EnvironmentImpact !== undefined) { fields.push('EnvironmentImpact = ?'); vals.push(impact.EnvironmentImpact); }
        if (req.body.TrainingRequired !== undefined)  { fields.push('TrainingRequired = ?');  vals.push(impact.TrainingRequired); }
        if (req.body.ImpactNote !== undefined)        { fields.push('ImpactNote = ?');        vals.push(impact.ImpactNote); }
        if (req.file)                        { fields.push('AttachmentUrl = ?');     vals.push(req.file.path); }

        if (!fields.length) return res.json({ success: true, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
        vals.push(id);
        await db.query(`UPDATE FourM_ChangeNotices SET ${fields.join(', ')} WHERE id = ?`, vals);
        if (req.file) deleteLocalUpload(rows[0].AttachmentUrl);
        await logAudit(req, {
            action: Status === 'Pending' && rows[0].Status !== 'Pending' ? 'FOURM_NOTICE_PENDING' : 'FOURM_NOTICE_UPDATE',
            module: 'fourm',
            targetType: 'FourM_ChangeNotice',
            targetId: id,
            detail: `${Status === 'Pending' && rows[0].Status !== 'Pending' ? 'Set Pending' : 'Update'} Change Notice ${rows[0].NoticeNo || id}`,
            metadata: fourmAuditMeta({
                NoticeNo: rows[0].NoticeNo,
                Title: Title !== undefined ? Title : rows[0].Title,
                Department: Department !== undefined ? Department : rows[0].Department,
                ChangeType: ChangeType || rows[0].ChangeType,
                Status: Status || rows[0].Status,
            }, {
                previousStatus: rows[0].Status,
                updatedFields: fields.map(field => field.split(' = ')[0]),
                replacedAttachment: Boolean(req.file),
                impact,
                responsibleEmployeeId: responsible?.EmployeeID || rows[0].ResponsibleEmployeeID || null,
                responsiblePerson: responsible?.EmployeeName || rows[0].ResponsiblePerson || null,
                responsibleDepartment: responsible?.Department || null,
                responsibleEmailReady: responsible ? responsible.EmailReady : undefined,
                departmentMismatch: responsible
                    ? noticeDepartmentMismatch(Department !== undefined ? Department : rows[0].Department, responsible.Department)
                    : undefined,
            }),
            statusCode: 200,
        });
        if (Status === 'Pending' && rows[0].Status !== 'Pending') {
            const creatorEmail = await getEmployeeCompanyEmail(rows[0].CreatedByID);
            const responsibleEmail = responsible?.CompanyEmail
                || await getEmployeeCompanyEmail(rows[0].ResponsibleEmployeeID);
            const recipients = uniqueRecipients([responsibleEmail, creatorEmail, FOURM_ADMIN_EMAIL]);
            const mail = buildNoticeStatusEmail({
                NoticeNo: rows[0].NoticeNo,
                Title: Title !== undefined ? Title : rows[0].Title,
                Department: Department !== undefined ? Department : rows[0].Department,
                ResponsiblePerson: responsible?.EmployeeName || rows[0].ResponsiblePerson,
            }, 'Pending');
            await queueFourMEmail({
                to: recipients.join(','),
                noticeId: id,
                eventType: 'NoticePending',
                subject: mail.subject,
                body: mail.body,
                html: mail.html,
            });
        }
        if (responsibleChanged) {
            const creatorEmail = await getEmployeeCompanyEmail(rows[0].CreatedByID);
            const reassignedNotice = {
                NoticeNo: rows[0].NoticeNo,
                Title: Title !== undefined ? Title : rows[0].Title,
                Department: Department !== undefined ? Department : rows[0].Department,
                ResponsiblePerson: responsible.EmployeeName,
                ResponsibleDepartment: responsible.Department || null,
                Status: Status || rows[0].Status,
            };
            const mail = buildNoticeReassignedEmail(reassignedNotice);
            await queueFourMEmail({
                to: uniqueRecipients([responsible.CompanyEmail, creatorEmail, FOURM_ADMIN_EMAIL]).join(','),
                noticeId: id,
                eventType: 'NoticeReassigned',
                subject: mail.subject,
                body: mail.body,
                html: mail.html,
            });
        }
        res.json({ success: true, message: 'อัปเดต Change Notice สำเร็จ' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดต Change Notice ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE NOTICES — CLOSE (creator OR admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/notices/:id/close', _handleUpload('closingDoc'), async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;
        const [rows] = await db.query(
            `SELECT id, NoticeNo, Title, Department, ChangeType, CreatedByID,
                    ResponsibleEmployeeID, ResponsiblePerson, Status, ClosingDocUrl
             FROM FourM_ChangeNotices WHERE id = ?`, [id]
        );
        if (!rows.length) {
            if (req.file) deleteLocalUpload(req.file.path);
            return res.status(404).json({ success: false, message: 'ไม่พบ Change Notice' });
        }

        const notice  = rows[0];
        const isAdmin = req.user.role === 'Admin' || req.user.Role === 'Admin';
        const isCreator = req.user.id === notice.CreatedByID;

        if (!isAdmin && !isCreator) {
            if (req.file) deleteLocalUpload(req.file.path);
            return res.status(403).json({ success: false, message: 'เฉพาะผู้สร้าง Notice หรือ Admin เท่านั้นที่สามารถปิดได้' });
        }
        if (notice.Status === 'Closed') {
            if (req.file) deleteLocalUpload(req.file.path);
            return res.status(400).json({ success: false, message: 'Change Notice นี้ถูกปิดแล้ว' });
        }

        const { ClosingComment, ClosedDate } = req.body;
        const closingComment = String(ClosingComment || '').trim();
        if (!closingComment) {
            if (req.file) deleteLocalUpload(req.file.path);
            return res.status(400).json({ success: false, message: 'กรุณาระบุสรุปผลก่อนปิด Change Notice' });
        }
        const closingDocUrl = req.file ? req.file.path : null;
        const closeDate     = ClosedDate || new Date().toISOString().split('T')[0];

        await db.query(
            `UPDATE FourM_ChangeNotices
             SET Status='Closed', ClosingComment=?, ClosingDocUrl=COALESCE(?,ClosingDocUrl),
                 ClosedDate=?, ClosedBy=?
             WHERE id=?`,
            [closingComment, closingDocUrl, closeDate, req.user.name, id]
        );
        if (closingDocUrl) deleteLocalUpload(notice.ClosingDocUrl);
        await logAudit(req, {
            action: 'FOURM_NOTICE_CLOSE',
            module: 'fourm',
            targetType: 'FourM_ChangeNotice',
            targetId: id,
            detail: `Close Change Notice ${notice.NoticeNo || id}`,
            metadata: fourmAuditMeta({ ...notice, Status: 'Closed' }, {
                previousStatus: notice.Status,
                closedDate: closeDate,
                hasClosingDoc: Boolean(closingDocUrl || notice.ClosingDocUrl),
            }),
            statusCode: 200,
        });
        const creatorEmail = await getEmployeeCompanyEmail(notice.CreatedByID);
        const responsibleEmail = await getEmployeeCompanyEmail(notice.ResponsibleEmployeeID);
        const closeMail = buildNoticeStatusEmail(notice, 'Closed');
        await queueFourMEmail({
            to: uniqueRecipients([responsibleEmail, creatorEmail, FOURM_ADMIN_EMAIL]).join(','),
            noticeId: id,
            eventType: 'NoticeClosed',
            subject: closeMail.subject,
            body: closeMail.body,
            html: closeMail.html,
        });
        res.json({ success: true, message: 'ปิด Change Notice สำเร็จ' });
    } catch (error) {
        console.error('Notice close error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถปิด Change Notice ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE NOTICES — DELETE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/notices/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [[row]] = await db.query(
            'SELECT id, NoticeNo, Title, Department, ChangeType, Status, AttachmentUrl, ClosingDocUrl FROM FourM_ChangeNotices WHERE id = ?',
            [req.params.id]
        );
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบ Change Notice' });
        await db.query('DELETE FROM FourM_ActionTasks WHERE NoticeID = ?', [req.params.id]);
        await db.query('DELETE FROM FourM_ChangeNotices WHERE id = ?', [req.params.id]);
        deleteLocalUpload(row?.AttachmentUrl);
        deleteLocalUpload(row?.ClosingDocUrl);
        await logAudit(req, {
            action: 'FOURM_NOTICE_DELETE',
            module: 'fourm',
            targetType: 'FourM_ChangeNotice',
            targetId: row.id,
            detail: `Delete Change Notice ${row.NoticeNo || row.id}`,
            metadata: fourmAuditMeta(row, {
                hadAttachment: Boolean(row.AttachmentUrl),
                hadClosingDoc: Boolean(row.ClosingDocUrl),
            }),
            statusCode: 200,
        });
        res.json({ success: true, message: 'ลบ Change Notice สำเร็จ' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
    }
});

module.exports = router;
