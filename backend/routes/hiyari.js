// backend/routes/hiyari.js
// Auth (authenticateToken) applied at mount level
// Admin-only operations use isAdmin middleware

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { randomUUID } = require('crypto');
const { isAdmin } = require('../middleware/auth');
const { storage: uploadStorage, fileFilter, deleteLocalUpload } = require('../storage');
const { ensureAuditTable, logAudit } = require('../utils/audit');
const { sendMail, smtpConfigured } = require('../utils/email');
const { ensureEmployeeCompanyEmailColumn } = require('../utils/company-email');
const { buildHiyariEmail } = require('../utils/hiyari-email-template');

const upload = multer({
    storage: uploadStorage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
});

const VALID_RISK   = ['Low', 'Medium', 'High', 'Critical'];
const VALID_RANKS  = ['A', 'B', 'C'];
const VALID_STATUS = ['Open', 'In Progress', 'Closed'];
const VALID_REVIEW_STATUS = ['PendingReview', 'Approved', 'Rejected', 'Completed'];
const VALID_STOP_TYPES = [1, 2, 3, 4, 5, 6];
const EXCEL_MIME_TYPES = new Set([
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const COMPANY_EMAIL_DOMAIN = '@thaisummit-harness.co.th';
const DEFAULT_HIYARI_ADMIN_EMAIL = 'sattaya_w@thaisummit-harness.co.th';
const VALID_CONSQ  = [
    'บาดเจ็บเล็กน้อย','บาดเจ็บรุนแรง','เสียชีวิต',
    'ทรัพย์สินเสียหาย','ผลกระทบต่อสิ่งแวดล้อม',
    'การหยุดชะงักการผลิต','อื่นๆ',
];
// Rank → canonical RiskLevel for backward-compat with history filter
const RANK_TO_RISK = { A: 'Critical', B: 'High', C: 'Low' };
const ACTIVE_REPORT = 'DeletedAt IS NULL';

function userName(req) {
    return req.user?.name || req.user?.EmployeeName || req.user?.id || req.user?.EmployeeID || 'System';
}

function userId(req) {
    return req.user?.id || req.user?.EmployeeID || req.user?.employeeId || 'unknown';
}

function isRequestAdmin(req) {
    return String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin';
}

function getHiyariAdminEmail() {
    return (process.env.HIYARI_ADMIN_EMAIL || process.env.ADMIN_EMAIL || DEFAULT_HIYARI_ADMIN_EMAIL).trim();
}

function normalizeCompanyEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isValidCompanyEmail(email) {
    const normalized = normalizeCompanyEmail(email);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && normalized.endsWith(COMPANY_EMAIL_DOMAIN);
}

async function getEmployeeCompanyEmail(employeeId) {
    const id = String(employeeId || '').trim();
    if (!id) return null;
    await ensureEmployeeCompanyEmailColumn(db);
    const [rows] = await db.query(
        `SELECT CompanyEmail FROM Employees
         WHERE EmployeeID = ? AND CompanyEmail IS NOT NULL AND TRIM(CompanyEmail) <> ''
         LIMIT 1`,
        [id]
    );
    const email = normalizeCompanyEmail(rows[0]?.CompanyEmail);
    return isValidCompanyEmail(email) ? email : null;
}

async function resolveReporterCompanyEmail(reporterId, submittedEmail) {
    const masterEmail = await getEmployeeCompanyEmail(reporterId);
    if (masterEmail) return masterEmail;
    const fallbackEmail = normalizeCompanyEmail(submittedEmail);
    return isValidCompanyEmail(fallbackEmail) ? fallbackEmail : null;
}

function isExcelUpload(file) {
    return Boolean(file && (EXCEL_MIME_TYPES.has(file.mimetype) || /\.(xls|xlsx)$/i.test(file.originalname || '')));
}

function isPdfUpload(file) {
    return Boolean(file && (file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '')));
}

async function queueHiyariEmail({ to, subject, body, html, reportId, eventType }) {
    const recipients = String(to || '').split(',').map(v => v.trim()).filter(Boolean);
    if (!recipients.length) return;
    const insertResult = await db.query(
        `INSERT INTO Hiyari_EmailOutbox (ReportID, EventType, Recipients, Subject, Body, HtmlBody, Status)
         VALUES (?, ?, ?, ?, ?, ?, 'Queued')`,
        [reportId || null, eventType || 'General', recipients.join(','), subject, body, html || null]
    ).catch(err => {
        console.error('[hiyari/email] queue failed:', err.message);
        return null;
    });
    const result = insertResult?.[0];
    const outboxId = result?.insertId;
    if (!smtpConfigured()) {
        console.log(`[hiyari/email queued] ${eventType || 'General'} -> ${recipients.join(', ')} | ${subject}`);
        return;
    }
    try {
        await sendMail({ to: recipients.join(','), subject, text: body, html });
        if (outboxId) {
            await db.query(
                `UPDATE Hiyari_EmailOutbox SET Status = 'Sent', SentAt = NOW(), Error = NULL WHERE id = ?`,
                [outboxId]
            );
        }
        console.log(`[hiyari/email sent] ${eventType || 'General'} -> ${recipients.join(', ')} | ${subject}`);
    } catch (err) {
        if (outboxId) {
            await db.query(
                `UPDATE Hiyari_EmailOutbox SET Status = 'Failed', Error = ? WHERE id = ?`,
                [err.message, outboxId]
            ).catch(updateErr => console.error('[hiyari/email] status update failed:', updateErr.message));
        }
        console.error('[hiyari/email] send failed:', err.message);
    }
}

function hiyariMailSubject(action, detail = '') {
    return `[Hiyari-Hatto] ${action}${detail ? ` - ${detail}` : ''}`;
}

function hiyariCorporateMail({ subject, title, tone, greeting, intro, details, actions, note }) {
    const rendered = buildHiyariEmail({
        title,
        tone,
        greeting,
        intro,
        details,
        actions,
        note,
        footerNote: 'อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ TSH Safety Core Activity กรุณาอย่าตอบกลับอีเมลนี้',
    });
    return { subject, body: rendered.text, html: rendered.html };
}

function buildAdminNewReportEmail({ reportId, reporterName, reporterId, department, submitterName, date, companyEmail, location, rank, stopType }) {
    return hiyariCorporateMail({
        subject: hiyariMailSubject('มีรายงานใหม่รอตรวจสอบ Excel', reporterName),
        title: 'มีรายงาน Hiyari-Hatto ใหม่ รอตรวจสอบ',
        tone: 'pending',
        greeting: 'เรียน ผู้ดูแลระบบความปลอดภัย',
        intro: [
            'ระบบได้รับรายงาน Hiyari-Hatto / Near-Miss ฉบับใหม่ และรอการตรวจสอบไฟล์ Excel',
            'กรุณาตรวจสอบไฟล์ Excel ที่แนบมา ตรวจความครบถ้วนของข้อมูล และบันทึกผลการตรวจในระบบ',
        ],
        details: [
            { label: 'เลขที่รายงาน', value: reportId, highlight: true },
            { label: 'ผู้รายงาน', value: reporterName, highlight: true },
            { label: 'รหัสพนักงาน', value: reporterId },
            { label: 'แผนก', value: department },
            { label: 'ผู้ส่งข้อมูล', value: submitterName },
            { label: 'วันที่รายงาน', value: date },
            { label: 'พื้นที่', value: location },
            { label: 'ประเภทอันตราย', value: stopType ? `Stop ${stopType}` : '-' },
            { label: 'ระดับความรุนแรง', value: rank, highlight: true },
            { label: 'อีเมลแจ้งผล', value: companyEmail },
        ],
        actions: [
            'เปิดเมนู Hiyari-Hatto > จัดการ > ตรวจรายงาน',
            'เปิดไฟล์ Excel ที่แนบมาและตรวจสอบความครบถ้วนของข้อมูล',
            'บันทึกผลเป็น ผ่านการตรวจสอบ หรือ ตีกลับเพื่อแก้ไข พร้อมหมายเหตุที่ชัดเจน',
        ],
        note: 'อีเมลนี้ถูกส่งถึง Safety Admin เนื่องจากมีรายงาน Near-Miss ใหม่เข้าสู่ขั้นตอนตรวจสอบ Excel',
    });
}

function buildUserReviewEmail({ reporterName, reviewStatus, reviewComment }) {
    const approved = reviewStatus === 'Approved';
    return hiyariCorporateMail({
        subject: approved
            ? hiyariMailSubject('ผลการตรวจรายงานผ่านแล้ว กรุณาดำเนินการลงนาม')
            : hiyariMailSubject('รายงานต้องแก้ไขก่อนดำเนินการต่อ'),
        title: approved ? 'รายงาน Hiyari ผ่านการตรวจสอบแล้ว' : 'รายงาน Hiyari ต้องแก้ไขเพิ่มเติม',
        tone: approved ? 'approved' : 'rejected',
        greeting: `เรียน คุณ${reporterName || 'ผู้รายงาน'}`,
        intro: approved
            ? [
                'รายงาน Hiyari-Hatto / Near-Miss ของท่านผ่านการตรวจสอบไฟล์ Excel แล้ว',
                'กรุณาพิมพ์รายงาน ดำเนินการลงนามตามขั้นตอน และอัปโหลดไฟล์ PDF ที่ลงนามแล้วกลับเข้าสู่ระบบ',
            ]
            : [
                'รายงาน Hiyari-Hatto / Near-Miss ของท่านยังไม่ผ่านการตรวจสอบไฟล์ Excel และต้องแก้ไขเพิ่มเติม',
                'กรุณาตรวจสอบหมายเหตุจาก Safety Admin แก้ไขไฟล์ Excel ให้ถูกต้อง และประสานงานเพิ่มเติมหากจำเป็น',
            ],
        details: [
            { label: 'ผลการตรวจ', value: approved ? 'ผ่านการตรวจสอบ' : 'ตีกลับเพื่อแก้ไข', highlight: true },
            { label: 'หมายเหตุจากผู้ตรวจ', value: reviewComment || '-' },
        ],
        actions: approved
            ? ['อัปโหลดไฟล์ PDF ที่ลงนามแล้วในเมนู Hiyari-Hatto หลังดำเนินการลงนามครบถ้วน']
            : ['แก้ไขไฟล์ Excel ตามหมายเหตุจากผู้ตรวจ', 'ประสาน Safety Admin หากต้องการข้อมูลหรือคำชี้แจงเพิ่มเติม'],
        note: approved
            ? 'รายงานนี้เข้าสู่ขั้นตอนส่ง PDF ที่ลงนามแล้ว'
            : 'รายงานนี้ยังอยู่ในขั้นตอนแก้ไขจนกว่าข้อมูลจะครบถ้วน',
    });
}

function buildUserOverrideApprovalEmail({ reporterName, overrideReason, approvedBy }) {
    return hiyariCorporateMail({
        subject: hiyariMailSubject('Admin อนุญาตให้ส่ง PDF ที่ลงนามแล้ว'),
        title: 'Admin อนุญาตให้ส่ง PDF ที่ลงนามแล้ว',
        tone: 'approved',
        greeting: `เรียน คุณ${reporterName || 'ผู้รายงาน'}`,
        intro: [
            'Safety Admin ได้อนุญาตให้รายงาน Hiyari-Hatto / Near-Miss ของท่านเข้าสู่ขั้นตอนส่ง PDF ที่ลงนามแล้ว โดยใช้สิทธิ์ Admin Override',
            'กรุณาพิมพ์รายงาน ดำเนินการลงนามตามขั้นตอนภายใน และอัปโหลดไฟล์ PDF ที่ลงนามแล้วกลับเข้าสู่ระบบ',
        ],
        details: [
            { label: 'ผู้อนุญาต', value: approvedBy, highlight: true },
            { label: 'เหตุผล', value: overrideReason || '-' },
        ],
        actions: ['อัปโหลดไฟล์ PDF ที่ลงนามแล้วในเมนู Hiyari-Hatto หลังลงนามครบถ้วน'],
        note: 'การอนุญาตกรณีพิเศษนี้ถูกบันทึกผู้อนุญาต เหตุผล และเวลาไว้เพื่อการตรวจสอบย้อนหลัง',
    });
}

function buildAdminSignedFileEmail({ reportId, reporterName }) {
    return hiyariCorporateMail({
        subject: hiyariMailSubject('ผู้รายงานอัปโหลด PDF ที่ลงนามแล้ว', reporterName),
        title: 'มีการอัปโหลด PDF ที่ลงนามแล้ว',
        tone: 'completed',
        greeting: 'เรียน ผู้ดูแลระบบความปลอดภัย',
        intro: [
            'ผู้รายงานได้อัปโหลดไฟล์ PDF ที่ลงนามแล้วสำหรับรายงาน Hiyari-Hatto / Near-Miss',
            'กรุณาตรวจสอบเอกสารฉบับลงนาม และดำเนินการปิดงานเมื่อข้อมูลครบถ้วน',
        ],
        details: [
            { label: 'เลขที่รายงาน', value: reportId, highlight: true },
            { label: 'ผู้รายงาน', value: reporterName, highlight: true },
        ],
        actions: [
            'เปิดรายละเอียดรายงานในเมนู Hiyari-Hatto',
            'ตรวจสอบไฟล์ PDF ที่ลงนามแล้ว',
            'บันทึก Corrective Action / Admin Comment และปิดรายงานเมื่อครบถ้วน',
        ],
        note: 'อีเมลนี้ถูกส่งถึง Safety Admin เมื่อผู้รายงานอัปโหลด PDF ที่ลงนามแล้วผ่าน workflow ปกติหรือ direct PDF',
    });
}

function buildUserStatusEmail({ reporterName, status, correctiveAction, adminComment }) {
    const closed = status === 'Closed';
    return hiyariCorporateMail({
        subject: closed
            ? hiyariMailSubject('ปิดรายงานเรียบร้อยแล้ว')
            : hiyariMailSubject('รายงานถูกเปิดกลับเพื่อดำเนินการต่อ'),
        title: closed ? 'ปิดรายงาน Hiyari เรียบร้อยแล้ว' : 'รายงาน Hiyari ถูกเปิดกลับเพื่อดำเนินการต่อ',
        tone: closed ? 'completed' : 'pending',
        greeting: `เรียน คุณ${reporterName || 'ผู้รายงาน'}`,
        intro: closed
            ? [
                'รายงาน Hiyari-Hatto / Near-Miss ของท่านได้รับการดำเนินการและปิดรายงานเรียบร้อยแล้ว',
                'ไม่ต้องดำเนินการเพิ่มเติม เว้นแต่ Safety Admin ติดต่อขอข้อมูลเพิ่มเติม',
            ]
            : [
                'รายงาน Hiyari-Hatto / Near-Miss ของท่านถูกเปิดกลับเพื่อดำเนินการเพิ่มเติม',
                'กรุณาติดตามสถานะในระบบ หรือประสาน Safety Admin ตามหมายเหตุด้านล่าง',
            ],
        details: [
            { label: 'สถานะปัจจุบัน', value: closed ? 'ปิดรายงานแล้ว' : `${status} / เปิดดำเนินการต่อ`, highlight: true },
            { label: 'Corrective Action', value: correctiveAction || '-' },
            { label: 'หมายเหตุจากผู้ดูแลระบบ', value: adminComment || '-' },
        ],
        actions: closed
            ? []
            : ['ตรวจสอบสถานะล่าสุดในเมนู Hiyari-Hatto', 'ประสาน Safety Admin หากต้องดำเนินการเพิ่มเติม'],
        note: closed
            ? 'รายงานนี้ดำเนินการครบตามขั้นตอน Hiyari close-out แล้ว'
            : 'รายงานนี้ถูกเปิดกลับและอาจต้องติดตามเพิ่มเติม',
    });
}

function isValidDateOnly(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    if (Number.isNaN(d.getTime())) return false;
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function todayDateOnly() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE TABLES
// ─────────────────────────────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;

    await ensureEmployeeCompanyEmailColumn(db);

    await db.query(`
        CREATE TABLE IF NOT EXISTS HiyariReports (
            id                   VARCHAR(36)  NOT NULL PRIMARY KEY,
            ReportDate           DATE         NOT NULL,
            ReporterID           VARCHAR(50)  NOT NULL,
            ReporterName         VARCHAR(100) NOT NULL,
            Department           VARCHAR(100) NOT NULL,
            SubmittedByID        VARCHAR(50),
            SubmittedByName      VARCHAR(100),
            IsSubmittedOnBehalf  TINYINT(1)   NOT NULL DEFAULT 0,
            CompanyEmail         VARCHAR(255),
            Location             VARCHAR(255),
            Description          TEXT         NOT NULL,
            PotentialConsequence VARCHAR(100),
            RiskLevel            VARCHAR(20)  DEFAULT 'Low',
            RiskRank             VARCHAR(1),
            StopType             INT,
            Suggestion           TEXT,
            AttachmentUrl        TEXT,
            Status               VARCHAR(20)  NOT NULL DEFAULT 'Open',
            ReviewStatus         VARCHAR(30)  NOT NULL DEFAULT 'PendingReview',
            ReviewComment        TEXT,
            ReviewedAt           DATETIME,
            ReviewedBy           VARCHAR(100),
            ReviewOverrideReason TEXT,
            ReviewOverrideBy     VARCHAR(100),
            ReviewOverrideAt     DATETIME,
            SignedFileUrl        TEXT,
            SignedUploadedAt     DATETIME,
            CorrectiveAction     TEXT,
            AdminComment         TEXT,
            AdditionalFileUrl    TEXT,
            ClosedAt             DATETIME,
            ClosedBy             VARCHAR(100),
            DeletedAt            DATETIME,
            DeletedBy            VARCHAR(100),
            CreatedAt            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_status (Status),
            KEY idx_dept (Department),
            KEY idx_date (ReportDate),
            KEY idx_risk (RiskLevel),
            KEY idx_rank (RiskRank),
            KEY idx_stop (StopType),
            KEY idx_review (ReviewStatus),
            KEY idx_email (CompanyEmail),
            KEY idx_deleted (DeletedAt)
        )
    `);

    // Migrate existing table — rename Rank→RiskRank (reserved keyword), add missing columns
    // CHANGE COLUMN succeeds only if `Rank` exists; ADD COLUMN is the fallback for fresh tables
    await db.query('ALTER TABLE HiyariReports CHANGE COLUMN `Rank` `RiskRank` VARCHAR(1)').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN RiskRank VARCHAR(1)').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN StopType INT').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN SubmittedByID VARCHAR(50)').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN SubmittedByName VARCHAR(100)').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN IsSubmittedOnBehalf TINYINT(1) NOT NULL DEFAULT 0').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN CompanyEmail VARCHAR(255)').catch(() => {});
    await db.query("ALTER TABLE HiyariReports ADD COLUMN ReviewStatus VARCHAR(30) NOT NULL DEFAULT 'PendingReview'").catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN ReviewComment TEXT').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN ReviewedAt DATETIME').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN ReviewedBy VARCHAR(100)').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN ReviewOverrideReason TEXT').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN ReviewOverrideBy VARCHAR(100)').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN ReviewOverrideAt DATETIME').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN SignedFileUrl TEXT').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN SignedUploadedAt DATETIME').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN DeletedAt DATETIME').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD COLUMN DeletedBy VARCHAR(100)').catch(() => {});
    // Re-create index on renamed column (drop is idempotent — catch if already gone)
    await db.query('ALTER TABLE HiyariReports DROP INDEX idx_rank').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD INDEX idx_rank (RiskRank)').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD INDEX idx_review (ReviewStatus)').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD INDEX idx_email (CompanyEmail)').catch(() => {});
    await db.query('ALTER TABLE HiyariReports ADD INDEX idx_deleted (DeletedAt)').catch(() => {});

    await db.query(`
        CREATE TABLE IF NOT EXISTS Hiyari_Dashboard_Config (
            ConfigKey  VARCHAR(100) NOT NULL PRIMARY KEY,
            ConfigValue TEXT,
            UpdatedBy  VARCHAR(100),
            UpdatedAt  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Hiyari_Assignments (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            EmployeeID   VARCHAR(50),
            AssigneeName VARCHAR(100) NOT NULL,
            Department   VARCHAR(100),
            AllowDirectSignedPdf TINYINT(1) NOT NULL DEFAULT 0,
            Note         TEXT,
            DueDate      DATE,
            CreatedBy    VARCHAR(100),
            CreatedAt    DATETIME DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_emp (EmployeeID)
        )
    `);
    await db.query('ALTER TABLE Hiyari_Assignments ADD COLUMN AllowDirectSignedPdf TINYINT(1) NOT NULL DEFAULT 0').catch(() => {});

    await db.query(`
        CREATE TABLE IF NOT EXISTS Hiyari_EmailOutbox (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            ReportID    VARCHAR(36),
            EventType   VARCHAR(50),
            Recipients  TEXT,
            Subject     VARCHAR(255),
            Body        TEXT,
            HtmlBody    MEDIUMTEXT,
            Status      VARCHAR(30) NOT NULL DEFAULT 'Queued',
            Error       TEXT,
            CreatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            SentAt      DATETIME,
            KEY idx_report (ReportID),
            KEY idx_status (Status)
        )
    `);
    await db.query('ALTER TABLE Hiyari_EmailOutbox ADD COLUMN HtmlBody MEDIUMTEXT AFTER Body').catch(() => {});

    tablesReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS — KPI + Charts
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try { await ensureTables(); } catch (err) {
        console.error('[hiyari/stats] ensureTables failed:', err.message);
    }

    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Helper: run one query and return rows; never throws — logs and returns fallback on error
    const safeQuery = async (label, sql, params, fallback = []) => {
        try {
            const [rows] = await db.query(sql, params);
            return rows;
        } catch (err) {
            console.error(`[hiyari/stats] ${label} failed:`, err.message, '| SQL:', sql.replace(/\s+/g, ' ').trim());
            return fallback;
        }
    };

    // totals — aggregate query always returns exactly 1 row
    let totals = { total: 0, open: 0, inProgress: 0, closed: 0 };
    try {
        const [[row]] = await db.query(
            `SELECT COUNT(*) AS total,
                    SUM(Status = 'Open')        AS open,
                    SUM(Status = 'In Progress') AS inProgress,
                    SUM(Status = 'Closed')      AS closed
             FROM HiyariReports WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ?`,
            [year]
        );
        totals = row;
    } catch (err) {
        console.error('[hiyari/stats] totals failed:', err.message);
    }

    const monthly     = await safeQuery('monthly',     `SELECT MONTH(ReportDate) AS month, COUNT(*) AS count FROM HiyariReports WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ? GROUP BY MONTH(ReportDate) ORDER BY month`,                                    [year]);
    const consequence = await safeQuery('consequence', `SELECT COALESCE(PotentialConsequence,'ไม่ระบุ') AS label, COUNT(*) AS count FROM HiyariReports WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ? GROUP BY PotentialConsequence ORDER BY count DESC`, [year]);
    const riskDist    = await safeQuery('riskDist',    `SELECT COALESCE(RiskLevel,'Low') AS level, COUNT(*) AS count FROM HiyariReports WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ? GROUP BY RiskLevel ORDER BY FIELD(RiskLevel,'Critical','High','Medium','Low')`, [year]);
    const stopDist    = await safeQuery('stopDist',    `SELECT StopType, COUNT(*) AS count FROM HiyariReports WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ? AND StopType IS NOT NULL GROUP BY StopType ORDER BY StopType`,                                   [year]);
    const rankDist    = await safeQuery('rankDist',    `SELECT RiskRank AS \`Rank\`, COUNT(*) AS count FROM HiyariReports WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ? AND RiskRank IS NOT NULL GROUP BY RiskRank ORDER BY FIELD(RiskRank,'A','B','C')`,   [year]);
    const deptRank    = await safeQuery('deptRank',    `SELECT Department, COUNT(*) AS count FROM HiyariReports WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ? GROUP BY Department ORDER BY count DESC LIMIT 20`,                                            [year]);
    const areaRank    = await safeQuery('areaRank',
        `SELECT COALESCE(NULLIF(TRIM(Location),''),'Unspecified') AS Location, COUNT(*) AS count
         FROM HiyariReports
         WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ?
         GROUP BY COALESCE(NULLIF(TRIM(Location),''),'Unspecified')
         ORDER BY count DESC
         LIMIT 12`,
        [year]
    );
    const monthlyRank = await safeQuery('monthlyRank',
        `SELECT MONTH(ReportDate) AS month, RiskRank AS \`Rank\`, COUNT(*) AS count
         FROM HiyariReports
         WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ? AND RiskRank IS NOT NULL
         GROUP BY MONTH(ReportDate), RiskRank
         ORDER BY MONTH(ReportDate), FIELD(RiskRank,'A','B','C')`,
        [year]
    );
    const monthlyStatus = await safeQuery('monthlyStatus',
        `SELECT MONTH(ReportDate) AS month, Status, COUNT(*) AS count
         FROM HiyariReports
         WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ?
         GROUP BY MONTH(ReportDate), Status
         ORDER BY MONTH(ReportDate), FIELD(Status,'Open','In Progress','Closed')`,
        [year]
    );

    const overdueRows = await safeQuery('overdueCount',
        `SELECT COUNT(*) AS cnt FROM HiyariReports
         WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ? AND Status != 'Closed'
           AND (
             (RiskRank = 'A' AND DATEDIFF(CURDATE(), ReportDate) > 7)
             OR (RiskRank = 'B' AND DATEDIFF(CURDATE(), ReportDate) > 15)
             OR (RiskRank = 'C' AND DATEDIFF(CURDATE(), ReportDate) > 30)
             OR (RiskRank IS NULL AND RiskLevel = 'Critical' AND DATEDIFF(CURDATE(), ReportDate) > 7)
             OR (RiskRank IS NULL AND RiskLevel = 'High'     AND DATEDIFF(CURDATE(), ReportDate) > 15)
             OR (RiskRank IS NULL AND DATEDIFF(CURDATE(), ReportDate) > 30)
           )`,
        [year], [{ cnt: 0 }]
    );
    const overdueCount = Number(overdueRows[0]?.cnt) || 0;

    res.json({
        success: true,
        data: {
            kpi: {
                total:        totals.total      || 0,
                open:         totals.open       || 0,
                inProgress:   totals.inProgress || 0,
                closed:       totals.closed     || 0,
                overdueCount,
            },
            monthly, consequence, riskDist, stopDist, rankDist, deptRank, areaRank, monthlyRank, monthlyStatus,
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD CONFIG  (must be before /:id)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard-config', async (req, res) => {
    const SAFE_DEFAULT = { pinnedDepts: [] };
    try {
        await ensureTables();
    } catch (err) {
        console.error('[hiyari/dashboard-config] ensureTables failed:', err.message);
        return res.json({ success: true, data: SAFE_DEFAULT });
    }
    try {
        const [rows] = await db.query('SELECT ConfigKey, ConfigValue FROM Hiyari_Dashboard_Config');
        const config = { ...SAFE_DEFAULT };
        rows.forEach(r => {
            try { config[r.ConfigKey] = JSON.parse(r.ConfigValue); } catch { config[r.ConfigKey] = r.ConfigValue; }
        });
        res.json({ success: true, data: config });
    } catch (err) {
        console.error('[hiyari/dashboard-config] query failed:', err.message);
        res.json({ success: true, data: SAFE_DEFAULT });
    }
});

router.put('/dashboard-config', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { pinnedDepts } = req.body;
        if (pinnedDepts !== undefined) {
            await db.query(
                `INSERT INTO Hiyari_Dashboard_Config (ConfigKey, ConfigValue, UpdatedBy)
                 VALUES (?,?,?) ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue), UpdatedBy=VALUES(UpdatedBy)`,
                ['pinnedDepts', JSON.stringify(pinnedDepts), req.user.name]
            );
        }
        res.json({ success: true, message: 'บันทึกการตั้งค่า Dashboard สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENTS  (must be before /:id)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/assignments', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query(`
            SELECT a.id, a.EmployeeID,
                COALESCE(e.EmployeeName, a.AssigneeName) AS AssigneeName,
                COALESCE(e.Department,  a.Department)   AS Department,
                e.CompanyEmail,
                a.AllowDirectSignedPdf, a.Note, a.DueDate, a.CreatedBy, a.CreatedAt
            FROM Hiyari_Assignments a
            LEFT JOIN Employees e ON e.EmployeeID = a.EmployeeID
            ORDER BY COALESCE(e.Department, a.Department), COALESCE(e.EmployeeName, a.AssigneeName)
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json({ success: true, data: [] });
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/assignments', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { EmployeeID, AssigneeName, Department, Note, DueDate, AllowDirectSignedPdf } = req.body;
        if (!EmployeeID && (!AssigneeName || !Department)) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อและหน่วยงาน' });
        }
        let name = (AssigneeName || '').trim() || null;
        let dept = (Department  || '').trim() || null;
        if (EmployeeID) {
            const [emp] = await db.query('SELECT EmployeeName, Department FROM Employees WHERE EmployeeID = ? LIMIT 1', [EmployeeID]);
            if (!emp.length) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
            name = emp[0].EmployeeName || name;
            dept = emp[0].Department   || dept;
            const [dup] = await db.query('SELECT id FROM Hiyari_Assignments WHERE EmployeeID = ? LIMIT 1', [EmployeeID]);
            if (dup.length) return res.status(400).json({ success: false, message: 'พนักงานคนนี้ถูกมอบหมายแล้ว' });
        }
        await db.query(
            'INSERT INTO Hiyari_Assignments (EmployeeID, AssigneeName, Department, AllowDirectSignedPdf, Note, DueDate, CreatedBy) VALUES (?,?,?,?,?,?,?)',
            [EmployeeID || null, name, dept, AllowDirectSignedPdf ? 1 : 0, (Note || '').trim() || null, DueDate || null, req.user.name]
        );
        res.json({ success: true, message: 'เพิ่มรายการมอบหมายสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/assignments/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;
        const { EmployeeID, AssigneeName, Department, Note, DueDate, AllowDirectSignedPdf } = req.body;
        const [exist] = await db.query('SELECT id FROM Hiyari_Assignments WHERE id = ? LIMIT 1', [id]);
        if (!exist.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการมอบหมาย' });
        if (!EmployeeID && (!AssigneeName || !Department)) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อและหน่วยงาน' });
        }
        let name = (AssigneeName || '').trim() || null;
        let dept = (Department  || '').trim() || null;
        let empId = EmployeeID || null;
        if (empId) {
            const [emp] = await db.query('SELECT EmployeeName, Department FROM Employees WHERE EmployeeID = ? LIMIT 1', [empId]);
            if (!emp.length) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
            name = emp[0].EmployeeName || name;
            dept = emp[0].Department   || dept;
            const [dup] = await db.query('SELECT id FROM Hiyari_Assignments WHERE EmployeeID = ? AND id <> ? LIMIT 1', [empId, id]);
            if (dup.length) return res.status(400).json({ success: false, message: 'พนักงานคนนี้ถูกมอบหมายแล้ว' });
        }
        await db.query(
            'UPDATE Hiyari_Assignments SET EmployeeID=?, AssigneeName=?, Department=?, AllowDirectSignedPdf=?, Note=?, DueDate=?, CreatedBy=? WHERE id=?',
            [empId, name, dept, AllowDirectSignedPdf ? 1 : 0, (Note || '').trim() || null, DueDate || null, req.user.name, id]
        );
        res.json({ success: true, message: 'อัปเดตรายการมอบหมายสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/assignments/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        await db.query('DELETE FROM Hiyari_Assignments WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบรายการมอบหมายสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// LIST REPORTS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/email-outbox', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200);
        const status = String(req.query.status || '').trim();
        const params = [];
        let sql = 'SELECT * FROM Hiyari_EmailOutbox';
        if (status && status !== 'all') {
            sql += ' WHERE Status = ?';
            params.push(status);
        }
        sql += ' ORDER BY CreatedAt DESC LIMIT ?';
        params.push(limit);
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows, smtpConfigured: smtpConfigured() });
    } catch (error) {
        console.error('[hiyari/email-outbox] query failed:', error.message);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลคิวอีเมลได้' });
    }
});

router.post('/email-outbox/:id/retry', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!smtpConfigured()) {
            return res.status(400).json({ success: false, message: 'ยังไม่ได้ตั้งค่า SMTP ในไฟล์ .env' });
        }
        const [rows] = await db.query('SELECT * FROM Hiyari_EmailOutbox WHERE id = ? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบอีเมลในคิว' });
        const item = rows[0];
        await sendMail({ to: item.Recipients, subject: item.Subject, text: item.Body, html: item.HtmlBody });
        await db.query(
            `UPDATE Hiyari_EmailOutbox SET Status = 'Sent', SentAt = NOW(), Error = NULL WHERE id = ?`,
            [item.id]
        );
        res.json({ success: true, message: 'ส่งอีเมลสำเร็จ' });
    } catch (error) {
        await db.query(
            `UPDATE Hiyari_EmailOutbox SET Status = 'Failed', Error = ? WHERE id = ?`,
            [error.message, req.params.id]
        ).catch(() => {});
        console.error('[hiyari/email-outbox] retry failed:', error.message);
        res.status(500).json({ success: false, message: 'ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบ SMTP' });
    }
});

router.post('/email-outbox/retry-queued', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!smtpConfigured()) {
            return res.status(400).json({ success: false, message: 'ยังไม่ได้ตั้งค่า SMTP ในไฟล์ .env' });
        }
        const limit = Math.min(Math.max(parseInt(req.body?.limit || '20', 10) || 20, 1), 50);
        const [rows] = await db.query(
            `SELECT * FROM Hiyari_EmailOutbox
             WHERE Status IN ('Queued', 'Failed')
             ORDER BY CreatedAt ASC
             LIMIT ?`,
            [limit]
        );

        let sent = 0;
        let failed = 0;
        for (const item of rows) {
            try {
                await sendMail({ to: item.Recipients, subject: item.Subject, text: item.Body, html: item.HtmlBody });
                await db.query(
                    `UPDATE Hiyari_EmailOutbox SET Status = 'Sent', SentAt = NOW(), Error = NULL WHERE id = ?`,
                    [item.id]
                );
                sent += 1;
            } catch (error) {
                await db.query(
                    `UPDATE Hiyari_EmailOutbox SET Status = 'Failed', Error = ? WHERE id = ?`,
                    [error.message, item.id]
                ).catch(() => {});
                failed += 1;
            }
        }

        res.json({ success: true, message: `Retry email queue completed: sent ${sent}, failed ${failed}`, sent, failed });
    } catch (error) {
        console.error('[hiyari/email-outbox] retry queued failed:', error.message);
        res.status(500).json({ success: false, message: 'ไม่สามารถ retry อีเมลค้างคิวได้' });
    }
});

router.get('/', async (req, res) => {
    try {
        await ensureTables();
        const { status, review, dept, year, q, risk, stopType, rank, month, area } = req.query;
        let sql = 'SELECT *, RiskRank AS `Rank` FROM HiyariReports WHERE DeletedAt IS NULL';
        const params = [];
        if (status && status !== 'all') { sql += ' AND Status = ?';     params.push(status); }
        if (review && review !== 'all') { sql += ' AND ReviewStatus = ?'; params.push(review); }
        if (dept   && dept   !== 'all') { sql += ' AND Department = ?'; params.push(dept); }
        if (risk   && risk   !== 'all') { sql += ' AND RiskLevel = ?';  params.push(risk); }
        if (rank   && rank   !== 'all') { sql += ' AND RiskRank = ?';   params.push(rank); }
        if (stopType && stopType !== 'all') {
            const stopId = parseInt(stopType);
            if (!Number.isNaN(stopId)) { sql += ' AND StopType = ?'; params.push(stopId); }
        }
        if (month && month !== 'all') {
            const monthNo = parseInt(month);
            if (!Number.isNaN(monthNo) && monthNo >= 1 && monthNo <= 12) {
                sql += ' AND MONTH(ReportDate) = ?';
                params.push(monthNo);
            }
        }
        if (area && area !== 'all') {
            sql += " AND COALESCE(NULLIF(TRIM(Location),''),'Unspecified') = ?";
            params.push(area);
        }
        if (year)  { sql += ' AND YEAR(ReportDate) = ?'; params.push(parseInt(year)); }
        if (q && q.trim()) {
            sql += ' AND (ReporterName LIKE ? OR Description LIKE ? OR Location LIKE ?)';
            const like = `%${q.trim()}%`;
            params.push(like, like, like);
        }
        sql += ' ORDER BY CreatedAt DESC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Hiyari list error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลรายงานได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE REPORT
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/timeline', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        await ensureAuditTable();
        const [exists] = await db.query('SELECT id FROM HiyariReports WHERE id = ? AND DeletedAt IS NULL', [req.params.id]);
        if (!exists.length) return res.status(404).json({ success: false, message: 'Report not found' });

        const [rows] = await db.query(
            `SELECT id, ActionTime, AdminID, AdminName, Action, Detail, Metadata
             FROM Admin_AuditLogs
             WHERE Module = 'hiyari' AND TargetType = 'HiyariReports' AND TargetID = ?
             ORDER BY ActionTime DESC, id DESC
             LIMIT 50`,
            [req.params.id]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Hiyari timeline error:', error);
        res.status(500).json({ success: false, message: 'Cannot load timeline' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT *, RiskRank AS `Rank` FROM HiyariReports WHERE id = ? AND DeletedAt IS NULL', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBMIT REPORT
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', upload.single('attachment'), async (req, res) => {
    let uploadedUrl = req.file ? req.file.path : null;
    try {
        await ensureTables();
        const {
            Description, Location, PotentialConsequence, RiskLevel, Rank, StopType, Suggestion,
            ReportDate, CompanyEmail, OnBehalfEmployeeID,
        } = req.body;
        const reject = (status, message) => {
            if (uploadedUrl) {
                deleteLocalUpload(uploadedUrl);
                uploadedUrl = null;
            }
            return res.status(status).json({ success: false, message });
        };

        if (!Description || !Description.trim()) {
            return reject(400, 'กรุณาระบุรายละเอียดเหตุการณ์');
        }
        if (!req.file || !isExcelUpload(req.file)) {
            return reject(400, 'กรุณาแนบไฟล์ Excel .xls หรือ .xlsx สำหรับให้แอดมินตรวจสอบ');
        }
        let companyEmail = null;
        const safeRank     = VALID_RANKS.includes(Rank) ? Rank : null;
        if (!safeRank) {
            return reject(400, 'Rank ไม่ถูกต้อง');
        }

        const safeStopType = VALID_STOP_TYPES.includes(parseInt(StopType)) ? parseInt(StopType) : null;
        if (!safeStopType) {
            return reject(400, 'Stop Type ไม่ถูกต้อง');
        }
        const safeConsq    = VALID_CONSQ.includes(PotentialConsequence) ? PotentialConsequence : null;
        // Derive RiskLevel from Rank for backward-compat; fall back to submitted RiskLevel
        const safeRisk     = safeRank ? RANK_TO_RISK[safeRank] : (VALID_RISK.includes(RiskLevel) ? RiskLevel : 'Low');
        const fileUrl      = uploadedUrl;
        const date         = ReportDate || todayDateOnly();
        if (!isValidDateOnly(date) || date > todayDateOnly()) {
            return reject(400, 'วันที่รายงานไม่ถูกต้อง');
        }
        const submitterId = userId(req);
        const submitterName = userName(req);
        let reporterId   = submitterId;
        let reporterName = submitterName;
        let department   = req.user?.department || req.user?.Department || 'ไม่ระบุ';
        let isSubmittedOnBehalf = 0;

        if (String(OnBehalfEmployeeID || '').trim()) {
            const [assignees] = await db.query(
                `SELECT a.EmployeeID,
                        COALESCE(e.EmployeeName, a.AssigneeName) AS AssigneeName,
                        COALESCE(e.Department, a.Department) AS Department
                 FROM Hiyari_Assignments a
                 LEFT JOIN Employees e ON e.EmployeeID = a.EmployeeID
                 WHERE a.EmployeeID = ?
                 LIMIT 1`,
                [String(OnBehalfEmployeeID).trim()]
            );
            if (!assignees.length) {
                return reject(400, 'เลือกส่งแทนได้เฉพาะพนักงานที่อยู่ในรายการมอบหมาย Hiyari');
            }
            reporterId = assignees[0].EmployeeID;
            reporterName = assignees[0].AssigneeName || reporterId;
            department = assignees[0].Department || department;
            isSubmittedOnBehalf = reporterId !== submitterId ? 1 : 0;
        }
        companyEmail = await resolveReporterCompanyEmail(reporterId, CompanyEmail);
        if (!companyEmail) {
            return reject(400, `Employee Master has no CompanyEmail for this reporter. Add CompanyEmail or submit a valid ${COMPANY_EMAIL_DOMAIN} email.`);
        }
        const reportId = randomUUID();

        await db.query(
            `INSERT INTO HiyariReports
                (id, ReportDate, ReporterID, ReporterName, Department,
                 SubmittedByID, SubmittedByName, IsSubmittedOnBehalf, CompanyEmail, Location,
                 Description, PotentialConsequence, RiskLevel, RiskRank, StopType,
                 Suggestion, AttachmentUrl, Status, ReviewStatus)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', 'PendingReview')`,
            [
                reportId, date,
                reporterId, reporterName, department,
                submitterId, submitterName, isSubmittedOnBehalf, companyEmail,
                (Location || '').trim() || null,
                Description.trim(), safeConsq, safeRisk, safeRank, safeStopType,
                (Suggestion || '').trim() || null, fileUrl,
            ]
        );
        await logAudit(req, {
            action: 'HIYARI_SUBMIT',
            module: 'hiyari',
            targetType: 'HiyariReports',
            targetId: reportId,
            detail: isSubmittedOnBehalf
                ? `Submitted Hiyari report on behalf of ${reporterId}`
                : `Submitted Hiyari report ${reportId}`,
            metadata: { reporterId, submitterId, isSubmittedOnBehalf: Boolean(isSubmittedOnBehalf), companyEmail },
        });
        const newReportMail = buildAdminNewReportEmail({
            reportId,
            reporterName,
            reporterId,
            department,
            submitterName,
            date,
            companyEmail,
            location: (Location || '').trim() || null,
            rank: safeRank,
            stopType: safeStopType,
        });
        await queueHiyariEmail({
            to: getHiyariAdminEmail(),
            reportId,
            eventType: 'Submitted',
            subject: newReportMail.subject,
            body: newReportMail.body,
            html: newReportMail.html,
        });
        res.status(201).json({ success: true, message: 'ส่งรายงาน Hiyari-Hatto สำเร็จ' });
    } catch (error) {
        if (uploadedUrl) deleteLocalUpload(uploadedUrl);
        console.error('Hiyari submit error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถส่งรายงานได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE REPORT — Status / Corrective Action / Comment (Admin)
// ─────────────────────────────────────────────────────────────────────────────
// Direct signed-PDF submit for assignees explicitly allowed by Admin.
router.post('/direct-signed', upload.single('attachment'), async (req, res) => {
    let uploadedUrl = req.file ? req.file.path : null;
    try {
        await ensureTables();
        const {
            Description, Location, PotentialConsequence, RiskLevel, Rank, StopType, Suggestion,
            ReportDate, CompanyEmail, OnBehalfEmployeeID,
        } = req.body;
        const reject = (status, message) => {
            if (uploadedUrl) {
                deleteLocalUpload(uploadedUrl);
                uploadedUrl = null;
            }
            return res.status(status).json({ success: false, message });
        };

        if (!Description || !Description.trim()) return reject(400, 'กรุณาระบุรายละเอียดเหตุการณ์');
        if (!req.file || !isPdfUpload(req.file)) return reject(400, 'การส่ง PDF โดยตรงต้องแนบไฟล์ PDF ที่ลงนามแล้ว');
        let companyEmail = null;

        const safeRank = VALID_RANKS.includes(Rank) ? Rank : null;
        if (!safeRank) return reject(400, 'Rank ไม่ถูกต้อง');
        const safeStopType = VALID_STOP_TYPES.includes(parseInt(StopType)) ? parseInt(StopType) : null;
        if (!safeStopType) return reject(400, 'Stop Type ไม่ถูกต้อง');
        const safeConsq = VALID_CONSQ.includes(PotentialConsequence) ? PotentialConsequence : null;
        const safeRisk = safeRank ? RANK_TO_RISK[safeRank] : (VALID_RISK.includes(RiskLevel) ? RiskLevel : 'Low');
        const date = ReportDate || todayDateOnly();
        if (!isValidDateOnly(date) || date > todayDateOnly()) return reject(400, 'วันที่รายงานไม่ถูกต้อง');

        const submitterId = String(userId(req));
        const submitterName = userName(req);
        const requestedReporterId = String(OnBehalfEmployeeID || submitterId).trim();
        const [assignees] = await db.query(
            `SELECT a.EmployeeID, a.AllowDirectSignedPdf,
                    COALESCE(e.EmployeeName, a.AssigneeName) AS AssigneeName,
                    COALESCE(e.Department, a.Department) AS Department
             FROM Hiyari_Assignments a
             LEFT JOIN Employees e ON e.EmployeeID = a.EmployeeID
             WHERE a.EmployeeID = ?
             LIMIT 1`,
            [requestedReporterId]
        );
        const assignee = assignees[0];
        if (!isRequestAdmin(req) && (!assignee || !assignee.AllowDirectSignedPdf)) {
            return reject(403, 'บัญชีนี้ยังไม่ได้รับสิทธิ์ส่ง PDF ที่ลงนามแล้วโดยตรง');
        }

        const reporterId = assignee?.EmployeeID || requestedReporterId;
        const reporterName = assignee?.AssigneeName || submitterName;
        const department = assignee?.Department || req.user?.department || req.user?.Department || 'ไม่ระบุ';
        const isSubmittedOnBehalf = reporterId !== submitterId ? 1 : 0;
        companyEmail = await resolveReporterCompanyEmail(reporterId, CompanyEmail);
        if (!companyEmail) {
            return reject(400, `Employee Master has no CompanyEmail for this reporter. Add CompanyEmail or submit a valid ${COMPANY_EMAIL_DOMAIN} email.`);
        }
        const reportId = randomUUID();

        await db.query(
            `INSERT INTO HiyariReports
                (id, ReportDate, ReporterID, ReporterName, Department,
                 SubmittedByID, SubmittedByName, IsSubmittedOnBehalf, CompanyEmail, Location,
                 Description, PotentialConsequence, RiskLevel, RiskRank, StopType,
                 Suggestion, Status, ReviewStatus, ReviewComment, SignedFileUrl, SignedUploadedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', 'Completed', ?, ?, NOW())`,
            [
                reportId, date, reporterId, reporterName, department,
                submitterId, submitterName, isSubmittedOnBehalf, companyEmail,
                (Location || '').trim() || null,
                Description.trim(), safeConsq, safeRisk, safeRank, safeStopType,
                (Suggestion || '').trim() || null,
                'ส่ง PDF ที่ลงนามแล้วโดยตรงตามสิทธิ์ Assignment',
                uploadedUrl,
            ]
        );
        const url = uploadedUrl;
        uploadedUrl = null;
        await logAudit(req, {
            action: 'HIYARI_DIRECT_SIGNED_SUBMIT',
            module: 'hiyari',
            targetType: 'HiyariReports',
            targetId: reportId,
            detail: `Submitted direct signed PDF Hiyari report ${reportId}`,
            metadata: { reporterId, submitterId, isSubmittedOnBehalf: Boolean(isSubmittedOnBehalf), fileUrl: url },
        });
        const signedFileMail = buildAdminSignedFileEmail({ reportId, reporterName });
        await queueHiyariEmail({
            to: getHiyariAdminEmail(),
            reportId,
            eventType: 'DirectSignedSubmitted',
            subject: signedFileMail.subject,
            body: signedFileMail.body,
            html: signedFileMail.html,
        });
        res.status(201).json({ success: true, message: 'ส่ง PDF ที่ลงนามแล้วโดยตรงสำเร็จ', id: reportId, url });
    } catch (error) {
        if (uploadedUrl) deleteLocalUpload(uploadedUrl);
        console.error('Hiyari direct signed submit error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถส่ง PDF ที่ลงนามแล้วโดยตรงได้' });
    }
});

// Allow Admin to approve signed-PDF submission when the normal Excel review flow
// cannot be completed, while keeping reason/audit/email traceability.
router.post('/:id/approve-pdf-override', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 5) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุเหตุผลการอนุญาตอย่างน้อย 5 ตัวอักษร' });
        }

        const [rows] = await db.query(
            `SELECT id, ReviewStatus, ReviewComment, CompanyEmail, ReporterName
             FROM HiyariReports WHERE id = ? AND DeletedAt IS NULL LIMIT 1`,
            [id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });

        if (['Approved', 'Completed'].includes(rows[0].ReviewStatus)) {
            return res.status(400).json({ success: false, message: 'รายงานนี้สามารถส่ง PDF ที่ลงนามแล้วได้อยู่แล้ว' });
        }

        const admin = userName(req);
        await db.query(
            `UPDATE HiyariReports
             SET ReviewStatus = 'Approved',
                 ReviewComment = ?,
                 ReviewedAt = NOW(),
                 ReviewedBy = ?,
                 ReviewOverrideReason = ?,
                 ReviewOverrideBy = ?,
                 ReviewOverrideAt = NOW()
             WHERE id = ? AND DeletedAt IS NULL`,
            [`Admin Override: ${reason}`, admin, reason, admin, id]
        );

        await logAudit(req, {
            action: 'HIYARI_REVIEW_OVERRIDE',
            module: 'hiyari',
            targetType: 'HiyariReports',
            targetId: id,
            detail: `Admin override approved signed PDF submission for Hiyari report ${id}`,
            metadata: {
                previousReviewStatus: rows[0].ReviewStatus,
                nextReviewStatus: 'Approved',
                reason,
            },
        });

        if (rows[0].CompanyEmail) {
            const mail = buildUserOverrideApprovalEmail({
                reporterName: rows[0].ReporterName || '-',
                overrideReason: reason,
                approvedBy: admin,
            });
            await queueHiyariEmail({
                to: rows[0].CompanyEmail,
                reportId: id,
                eventType: 'ReviewOverrideApproved',
                subject: mail.subject,
                body: mail.body,
                html: mail.html,
            });
        }

        res.json({ success: true, message: 'อนุญาตให้ส่ง PDF ที่ลงนามแล้วเรียบร้อยแล้ว' });
    } catch (error) {
        console.error('Hiyari override approval error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอนุญาตขั้นตอนเอกสารได้' });
    }
});

router.put('/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;
        const { Status, CorrectiveAction, AdminComment, ReviewStatus, ReviewComment } = req.body;

        if (Status && !VALID_STATUS.includes(Status)) {
            return res.status(400).json({ success: false, message: 'สถานะไม่ถูกต้อง' });
        }
        if (ReviewStatus && !VALID_REVIEW_STATUS.includes(ReviewStatus)) {
            return res.status(400).json({ success: false, message: 'สถานะตรวจเอกสารไม่ถูกต้อง' });
        }

        const [rows] = await db.query(
            'SELECT id, Status, CorrectiveAction, ReviewStatus, CompanyEmail, ReporterName, SignedFileUrl FROM HiyariReports WHERE id = ? AND DeletedAt IS NULL',
            [id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });

        const normalizedReviewStatus = rows[0].SignedFileUrl && ReviewStatus === 'Approved' ? 'Completed' : ReviewStatus;
        const nextStatus = Status || rows[0].Status;
        const nextCorrective = CorrectiveAction !== undefined ? String(CorrectiveAction || '').trim() : String(rows[0].CorrectiveAction || '').trim();
        if (nextStatus === 'Closed' && !nextCorrective) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ Corrective Action ก่อนปิดรายงาน' });
        }

        const normalizedReviewComment = ReviewComment !== undefined ? String(ReviewComment || '').trim() : undefined;
        if (normalizedReviewStatus === 'Rejected' && !normalizedReviewComment) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุเหตุผลเมื่อตีกลับรายงาน' });
        }
        const nextReviewComment = normalizedReviewStatus === 'Approved' && !normalizedReviewComment
            ? 'ตรวจสอบไฟล์ Excel แล้ว ข้อมูลครบถ้วน อนุญาตให้ดำเนินการลงนามและส่ง PDF'
            : normalizedReviewComment;

        const isClosing = nextStatus === 'Closed' && rows[0].Status !== 'Closed';
        const isReopening = rows[0].Status === 'Closed' && nextStatus !== 'Closed';
        const closedAt  = isClosing ? new Date() : null;
        const closedBy  = isClosing ? userName(req) : null;

        await db.query(
            `UPDATE HiyariReports
             SET Status           = COALESCE(?, Status),
                 CorrectiveAction = COALESCE(?, CorrectiveAction),
                 AdminComment     = COALESCE(?, AdminComment),
                 ReviewStatus      = COALESCE(?, ReviewStatus),
                 ReviewComment     = COALESCE(?, ReviewComment),
                 ReviewedAt        = CASE WHEN ? IS NULL THEN ReviewedAt ELSE NOW() END,
                 ReviewedBy        = CASE WHEN ? IS NULL THEN ReviewedBy ELSE ? END,
                 ClosedAt         = CASE WHEN ? THEN ? WHEN ? THEN NULL ELSE ClosedAt END,
                 ClosedBy         = CASE WHEN ? THEN ? WHEN ? THEN NULL ELSE ClosedBy END
             WHERE id = ?`,
            [
                Status || null,
                CorrectiveAction !== undefined ? CorrectiveAction : null,
                AdminComment     !== undefined ? AdminComment     : null,
                normalizedReviewStatus || null,
                ReviewComment !== undefined || normalizedReviewStatus === 'Approved' ? nextReviewComment : null,
                normalizedReviewStatus || null,
                normalizedReviewStatus || null,
                normalizedReviewStatus ? userName(req) : null,
                isClosing, closedAt, isReopening, isClosing, closedBy, isReopening, id,
            ]
        );
        await logAudit(req, {
            action: isClosing ? 'HIYARI_CLOSE' : isReopening ? 'HIYARI_REOPEN' : 'HIYARI_UPDATE',
            module: 'hiyari',
            targetType: 'HiyariReports',
            targetId: id,
            detail: `Hiyari report ${id}: ${rows[0].Status} -> ${nextStatus}`,
            metadata: {
                previousStatus: rows[0].Status,
                nextStatus,
                previousReviewStatus: rows[0].ReviewStatus,
                nextReviewStatus: normalizedReviewStatus || rows[0].ReviewStatus,
                correctiveChanged: CorrectiveAction !== undefined,
                commentChanged: AdminComment !== undefined,
                reviewCommentChanged: ReviewComment !== undefined,
            },
        });
        if (normalizedReviewStatus && normalizedReviewStatus !== rows[0].ReviewStatus && ['Approved', 'Rejected'].includes(normalizedReviewStatus)) {
            const reviewMail = buildUserReviewEmail({
                reporterName: rows[0].ReporterName || '-',
                reviewStatus: normalizedReviewStatus,
                reviewComment: String(nextReviewComment || '').trim(),
            });
            await queueHiyariEmail({
                to: rows[0].CompanyEmail,
                reportId: id,
                eventType: normalizedReviewStatus,
                subject: reviewMail.subject,
                body: reviewMail.body,
                html: reviewMail.html,
            });
        }
        if ((isClosing || isReopening) && rows[0].CompanyEmail) {
            const statusMail = buildUserStatusEmail({
                reporterName: rows[0].ReporterName || '-',
                status: nextStatus,
                correctiveAction: nextCorrective,
                adminComment: AdminComment !== undefined ? AdminComment : '',
            });
            await queueHiyariEmail({
                to: rows[0].CompanyEmail,
                reportId: id,
                eventType: isClosing ? 'Closed' : 'Reopened',
                subject: statusMail.subject,
                body: statusMail.body,
                html: statusMail.html,
            });
        }
        res.json({ success: true, message: 'อัปเดตรายงานสำเร็จ' });
    } catch (error) {
        console.error('Hiyari update error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตรายงานได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD ADDITIONAL FILE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/attachment', isAdmin, upload.single('file'), async (req, res) => {
    let uploadedUrl = req.file ? req.file.path : null;
    try {
        await ensureTables();
        if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์' });
        const [rows] = await db.query('SELECT id, AdditionalFileUrl FROM HiyariReports WHERE id = ? AND DeletedAt IS NULL', [req.params.id]);
        if (!rows.length) {
            deleteLocalUpload(uploadedUrl);
            uploadedUrl = null;
            return res.status(404).json({ success: false, message: 'Report not found' });
        }
        await db.query('UPDATE HiyariReports SET AdditionalFileUrl = ? WHERE id = ? AND DeletedAt IS NULL', [uploadedUrl, req.params.id]);
        deleteLocalUpload(rows[0].AdditionalFileUrl);
        const url = uploadedUrl;
        uploadedUrl = null;
        await logAudit(req, {
            action: 'HIYARI_ATTACHMENT_UPDATE',
            module: 'hiyari',
            targetType: 'HiyariReports',
            targetId: req.params.id,
            detail: `Updated Hiyari additional attachment ${req.params.id}`,
            metadata: { replacedExisting: Boolean(rows[0].AdditionalFileUrl), fileUrl: url },
        });
        res.json({ success: true, message: 'Upload completed', url });
    } catch (error) {
        if (uploadedUrl) deleteLocalUpload(uploadedUrl);
        console.error('Hiyari attachment error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปโหลดไฟล์ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD SIGNED FILE (Reporter, submitter, or admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/signed-file', upload.single('file'), async (req, res) => {
    let uploadedUrl = req.file ? req.file.path : null;
    try {
        await ensureTables();
        if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ที่ลงนามแล้ว' });
        if (!isPdfUpload(req.file)) {
            deleteLocalUpload(uploadedUrl);
            uploadedUrl = null;
            return res.status(400).json({ success: false, message: 'ไฟล์ลงนามต้องเป็น PDF เท่านั้น' });
        }
        const [rows] = await db.query(
            `SELECT id, ReporterID, SubmittedByID, ReporterName, CompanyEmail, ReviewStatus, SignedFileUrl
             FROM HiyariReports WHERE id = ? AND DeletedAt IS NULL LIMIT 1`,
            [req.params.id]
        );
        if (!rows.length) {
            deleteLocalUpload(uploadedUrl);
            uploadedUrl = null;
            return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });
        }
        const report = rows[0];
        const requester = String(userId(req));
        const canUpload = isRequestAdmin(req)
            || requester === String(report.ReporterID || '')
            || requester === String(report.SubmittedByID || '');
        if (!canUpload) {
            deleteLocalUpload(uploadedUrl);
            uploadedUrl = null;
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์อัปโหลดไฟล์ลงนามของรายงานนี้' });
        }
        if (!['Approved', 'Completed'].includes(report.ReviewStatus)) {
            deleteLocalUpload(uploadedUrl);
            uploadedUrl = null;
            return res.status(400).json({ success: false, message: 'อัปโหลดไฟล์ลงนามได้หลังรายงานผ่านการตรวจสอบแล้ว' });
        }

        await db.query(
            `UPDATE HiyariReports
             SET SignedFileUrl = ?, SignedUploadedAt = NOW(), ReviewStatus = 'Completed'
             WHERE id = ? AND DeletedAt IS NULL`,
            [uploadedUrl, req.params.id]
        );
        deleteLocalUpload(report.SignedFileUrl);
        const url = uploadedUrl;
        uploadedUrl = null;
        await logAudit(req, {
            action: 'HIYARI_SIGNED_FILE_UPLOAD',
            module: 'hiyari',
            targetType: 'HiyariReports',
            targetId: req.params.id,
            detail: `Uploaded signed Hiyari file ${req.params.id}`,
            metadata: { replacedExisting: Boolean(report.SignedFileUrl), fileUrl: url },
        });
        const signedFileMail = buildAdminSignedFileEmail({
            reportId: req.params.id,
            reporterName: report.ReporterName || '-',
        });
        await queueHiyariEmail({
            to: getHiyariAdminEmail(),
            reportId: req.params.id,
            eventType: 'SignedFileUploaded',
            subject: signedFileMail.subject,
            body: signedFileMail.body,
            html: signedFileMail.html,
        });
        res.json({ success: true, message: 'อัปโหลดไฟล์ลงนามสำเร็จ', url });
    } catch (error) {
        if (uploadedUrl) deleteLocalUpload(uploadedUrl);
        console.error('Hiyari signed file error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปโหลดไฟล์ลงนามได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT id FROM HiyariReports WHERE id = ? AND DeletedAt IS NULL', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายงาน' });
        await db.query('UPDATE HiyariReports SET DeletedAt = NOW(), DeletedBy = ? WHERE id = ? AND DeletedAt IS NULL', [userName(req), req.params.id]);
        await logAudit(req, {
            action: 'HIYARI_DELETE',
            module: 'hiyari',
            targetType: 'HiyariReports',
            targetId: req.params.id,
            detail: `Soft deleted Hiyari report ${req.params.id}`,
        });
        res.json({ success: true, message: 'ลบรายงานสำเร็จ' });
    } catch (error) {
        console.error('Hiyari delete error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบรายงานได้' });
    }
});

module.exports = router;
