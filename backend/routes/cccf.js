const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { storage: uploadStorage, fileFilter, deleteLocalUpload } = require('../storage');
const { isAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { sendMail, smtpConfigured } = require('../utils/email');
const { ensureEmployeeCompanyEmailColumn } = require('../utils/company-email');
const { buildHiyariEmail } = require('../utils/hiyari-email-template');

const upload = multer({ storage: uploadStorage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
const CURRENT_YEAR = new Date().getFullYear();
const COMPANY_EMAIL_DOMAIN = '@thaisummit-harness.co.th';
const DEFAULT_CCCF_ADMIN_EMAIL = 'sattaya_w@thaisummit-harness.co.th';
const VALID_CCCF_REVIEW_STATUS = ['PendingReview', 'Approved', 'Rejected', 'Completed'];
const VALID_CCCF_DOCUMENT_MODES = ['excel_review', 'direct_signed', 'legacy'];
const EXCEL_MIME_TYPES = new Set([
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function safeDeleteLocalUpload(fileUrl) {
    try {
        return deleteLocalUpload(fileUrl);
    } catch (err) {
        console.warn('[cccf] upload cleanup failed:', err.message);
        return false;
    }
}

function isAdminUser(req) {
    return String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin';
}

function getCccfAdminEmail() {
    return (process.env.CCCF_ADMIN_EMAIL || process.env.HIYARI_ADMIN_EMAIL || process.env.ADMIN_EMAIL || DEFAULT_CCCF_ADMIN_EMAIL).trim();
}

function normalizeCompanyEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isValidCompanyEmail(email) {
    const normalized = normalizeCompanyEmail(email);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && normalized.endsWith(COMPANY_EMAIL_DOMAIN);
}

function isExcelUpload(file) {
    return Boolean(file && (EXCEL_MIME_TYPES.has(file.mimetype) || /\.(xls|xlsx)$/i.test(file.originalname || '')));
}

function isPdfUpload(file) {
    return Boolean(file && (file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '')));
}

async function getCccfRequireCompanyEmail() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS App_Settings (
                key_name  VARCHAR(100) PRIMARY KEY,
                value     TEXT,
                UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        const [rows] = await db.query('SELECT value FROM App_Settings WHERE key_name = ?', ['cccf_require_company_email']);
        return ['1', 'true', 'yes', 'on'].includes(String(rows[0]?.value || '').trim().toLowerCase());
    } catch (err) {
        console.warn('[cccf] company email policy lookup failed:', err.message);
        return false;
    }
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

async function ensureCccfEmailOutboxTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS CCCF_EmailOutbox (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            PermanentID INT DEFAULT NULL,
            EventType   VARCHAR(80) NOT NULL DEFAULT 'General',
            Recipients  TEXT NOT NULL,
            Subject     VARCHAR(255) NOT NULL,
            Body        MEDIUMTEXT,
            HtmlBody    MEDIUMTEXT,
            Status      VARCHAR(30) NOT NULL DEFAULT 'Queued',
            Error       TEXT,
            SentAt      DATETIME DEFAULT NULL,
            CreatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_cccf_email_status (Status),
            INDEX idx_cccf_email_permanent (PermanentID)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
}

async function queueCccfEmail({ to, subject, body, html, permanentId, eventType }) {
    const recipients = String(to || '').split(',').map(v => v.trim()).filter(Boolean);
    if (!recipients.length) return;
    await ensureCccfEmailOutboxTable().catch(err => console.error('[cccf/email] ensure outbox failed:', err.message));
    const insertResult = await db.query(
        `INSERT INTO CCCF_EmailOutbox (PermanentID, EventType, Recipients, Subject, Body, HtmlBody, Status)
         VALUES (?, ?, ?, ?, ?, ?, 'Queued')`,
        [permanentId || null, eventType || 'General', recipients.join(','), subject, body, html || null]
    ).catch(err => {
        console.error('[cccf/email] queue failed:', err.message);
        return null;
    });
    const outboxId = insertResult?.[0]?.insertId;
    if (!smtpConfigured()) {
        console.log(`[cccf/email queued] ${eventType || 'General'} -> ${recipients.join(', ')} | ${subject}`);
        return;
    }
    try {
        await sendMail({ to: recipients.join(','), subject, text: body, html });
        if (outboxId) {
            await db.query(
                `UPDATE CCCF_EmailOutbox SET Status = 'Sent', SentAt = NOW(), Error = NULL WHERE id = ?`,
                [outboxId]
            );
        }
        console.log(`[cccf/email sent] ${eventType || 'General'} -> ${recipients.join(', ')} | ${subject}`);
    } catch (err) {
        if (outboxId) {
            await db.query(
                `UPDATE CCCF_EmailOutbox SET Status = 'Failed', Error = ? WHERE id = ?`,
                [err.message, outboxId]
            ).catch(updateErr => console.error('[cccf/email] status update failed:', updateErr.message));
        }
        console.error('[cccf/email] send failed:', err.message);
    }
}

function cccfMailSubject(action, detail = '') {
    return `[CCCF Form A Permanent] ${action}${detail ? ` - ${detail}` : ''}`;
}

function cccfCorporateMail({ subject, title, tone, greeting, intro, details, actions, note }) {
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

function buildCccfAdminSubmittedEmail(record) {
    return cccfCorporateMail({
        subject: cccfMailSubject('มีการส่งแบบฟอร์มใหม่', record.SubmitterName),
        title: 'มีการส่ง CCCF Form A Permanent ใหม่',
        tone: 'pending',
        greeting: 'เรียน ผู้ดูแลระบบความปลอดภัย',
        intro: [
            'ระบบได้รับการส่งแบบฟอร์ม CCCF Form A — Permanent ฉบับใหม่',
            'กรุณาตรวจสอบรายละเอียด งาน/พื้นที่ ระดับความเสี่ยง และไฟล์เอกสารแนบในระบบ',
        ],
        details: [
            { label: 'เลขที่รายการ', value: record.id, highlight: true },
            { label: 'ผู้รับผิดชอบ', value: record.SubmitterName, highlight: true },
            { label: 'รหัสพนักงาน', value: record.AssigneeID || '-' },
            { label: 'หน่วยงาน', value: record.Department || '-' },
            { label: 'งาน / พื้นที่', value: record.JobArea || '-' },
            { label: 'วันที่ส่ง', value: record.SubmitDate || '-' },
            { label: 'Stop Type', value: record.StopType ? `Stop ${record.StopType}` : '-' },
            { label: 'Risk Rank', value: record.Rank || '-', highlight: true },
            { label: 'ไฟล์แนบ', value: record.FileUrl ? 'มีไฟล์แนบแล้ว' : 'ยังไม่มีไฟล์แนบ' },
        ],
        actions: [
            'เปิดเมนู Patrol & CCCF > CCCF Form A — Permanent',
            'ตรวจสอบข้อมูลและไฟล์เอกสารแนบ',
            'ประสานผู้รับผิดชอบหากต้องแก้ไขหรือแนบเอกสารเพิ่มเติม',
        ],
        note: record.Summary || 'ไม่มี Summary เพิ่มเติม',
    });
}

function buildCccfOwnerSubmittedByAdminEmail(record) {
    return cccfCorporateMail({
        subject: cccfMailSubject('Admin ส่งแบบฟอร์มแทนท่าน', record.JobArea),
        title: 'มีการส่ง CCCF Form A Permanent แทนท่าน',
        tone: 'completed',
        greeting: `เรียน คุณ${record.SubmitterName || 'ผู้รับผิดชอบ'}`,
        intro: [
            'Safety Admin ได้บันทึกหรืออัปโหลด CCCF Form A — Permanent ในนามของท่านแล้ว',
            'กรุณาตรวจสอบความถูกต้องของข้อมูลและประสาน Safety Admin หากต้องการแก้ไข',
        ],
        details: [
            { label: 'งาน / พื้นที่', value: record.JobArea || '-', highlight: true },
            { label: 'วันที่ส่ง', value: record.SubmitDate || '-' },
            { label: 'Stop Type', value: record.StopType ? `Stop ${record.StopType}` : '-' },
            { label: 'Risk Rank', value: record.Rank || '-', highlight: true },
            { label: 'ไฟล์แนบ', value: record.FileUrl ? 'มีไฟล์แนบแล้ว' : 'ยังไม่มีไฟล์แนบ' },
        ],
        actions: [
            'เปิดเมนู Patrol & CCCF > CCCF Form A — Permanent เพื่อตรวจสอบรายการ',
            'แจ้ง Safety Admin หากข้อมูลไม่ถูกต้องหรือไฟล์แนบยังไม่ครบถ้วน',
        ],
        note: record.Summary || 'ไม่มี Summary เพิ่มเติม',
    });
}

function buildCccfOwnerUpdatedEmail(record, changedFile) {
    return cccfCorporateMail({
        subject: cccfMailSubject(changedFile ? 'Admin อัปเดตข้อมูลและไฟล์แนบ' : 'Admin อัปเดตข้อมูล', record.JobArea),
        title: 'รายการ CCCF Form A Permanent ถูกอัปเดต',
        tone: 'neutral',
        greeting: `เรียน คุณ${record.SubmitterName || 'ผู้รับผิดชอบ'}`,
        intro: [
            'Safety Admin ได้อัปเดตรายการ CCCF Form A — Permanent ที่เกี่ยวข้องกับท่าน',
            changedFile ? 'รายการนี้มีการเปลี่ยนไฟล์เอกสารแนบ กรุณาตรวจสอบไฟล์ล่าสุดในระบบ' : 'กรุณาตรวจสอบรายละเอียดล่าสุดในระบบ',
        ],
        details: [
            { label: 'เลขที่รายการ', value: record.id, highlight: true },
            { label: 'งาน / พื้นที่', value: record.JobArea || '-', highlight: true },
            { label: 'วันที่ส่ง', value: record.SubmitDate || '-' },
            { label: 'Stop Type', value: record.StopType ? `Stop ${record.StopType}` : '-' },
            { label: 'Risk Rank', value: record.Rank || '-', highlight: true },
            { label: 'ไฟล์แนบ', value: record.FileUrl ? 'มีไฟล์แนบแล้ว' : 'ยังไม่มีไฟล์แนบ' },
        ],
        actions: [
            'เปิดเมนู Patrol & CCCF > CCCF Form A — Permanent',
            'ตรวจสอบข้อมูลและไฟล์เอกสารแนบล่าสุด',
            'ประสาน Safety Admin หากพบข้อมูลไม่ถูกต้อง',
        ],
        note: record.Summary || 'ไม่มี Summary เพิ่มเติม',
    });
}

function buildCccfAssignmentEmail(assignment) {
    return cccfCorporateMail({
        subject: cccfMailSubject('มอบหมายให้ส่งแบบฟอร์ม Permanent', assignment.AssigneeName),
        title: 'ท่านได้รับมอบหมายให้ส่ง CCCF Form A Permanent',
        tone: 'pending',
        greeting: `เรียน คุณ${assignment.AssigneeName || 'ผู้รับผิดชอบ'}`,
        intro: [
            'Safety Admin ได้มอบหมายให้ท่านเป็นผู้รับผิดชอบการส่ง CCCF Form A — Permanent',
            'กรุณาดาวน์โหลดแบบฟอร์มที่เกี่ยวข้อง กรอกข้อมูล/ลงนาม และอัปโหลดกลับเข้าระบบเมื่อดำเนินการเรียบร้อย',
        ],
        details: [
            { label: 'ผู้รับผิดชอบ', value: assignment.AssigneeName || '-', highlight: true },
            { label: 'รหัสพนักงาน', value: assignment.EmployeeID || '-' },
            { label: 'หน่วยงาน', value: assignment.Department || '-' },
            { label: 'สิทธิ์ส่ง PDF ลงนามโดยตรง', value: assignment.AllowDirectSignedPdf ? 'เปิดสิทธิ์แล้ว' : 'ยังไม่เปิดสิทธิ์' },
            { label: 'กำหนดส่ง', value: assignment.DueDate || '-' },
            { label: 'หมายเหตุ', value: assignment.Note || '-' },
            { label: 'ผู้มอบหมาย', value: assignment.CreatedBy || 'Safety Admin' },
        ],
        actions: [
            'เปิดเมนู Patrol & CCCF > CCCF Form A — Permanent',
            'ดาวน์โหลดแบบฟอร์มที่เกี่ยวข้องและกรอกข้อมูลให้ครบถ้วน',
            assignment.AllowDirectSignedPdf
                ? 'สามารถเลือก “ส่ง PDF ลงนามโดยตรง” ได้ หากเอกสารลงนามครบถ้วนแล้ว'
                : 'ส่ง Excel ให้ Safety Admin ตรวจสอบก่อนพิมพ์/ลงนาม หรือรอ Admin เปิดสิทธิ์ Direct PDF หากจำเป็น',
        ],
        note: assignment.AllowDirectSignedPdf
            ? 'สิทธิ์ Direct PDF ใช้เฉพาะกรณีที่เอกสารผ่านขั้นตอนภายในครบถ้วนแล้ว'
            : 'หากไม่พบแบบฟอร์มหรือมีข้อสงสัย กรุณาประสาน Safety Admin',
    });
}

function buildCccfUserReviewEmail({ record, reviewStatus, reviewComment }) {
    const approved = reviewStatus === 'Approved';
    return cccfCorporateMail({
        subject: approved
            ? cccfMailSubject('Excel ผ่านการตรวจแล้ว กรุณาส่ง PDF ลงนาม', record.JobArea)
            : cccfMailSubject('Excel ต้องแก้ไขก่อนดำเนินการต่อ', record.JobArea),
        title: approved ? 'CCCF Form A Permanent ผ่านการตรวจ Excel แล้ว' : 'CCCF Form A Permanent ต้องแก้ไขไฟล์ Excel',
        tone: approved ? 'approved' : 'rejected',
        greeting: `เรียน คุณ${record.SubmitterName || 'ผู้รับผิดชอบ'}`,
        intro: approved
            ? [
                'Safety Admin ตรวจสอบไฟล์ Excel ของ CCCF Form A — Permanent แล้ว และอนุมัติให้ดำเนินการขั้นตอนลงนามได้',
                'กรุณาพิมพ์/ลงนามตามขั้นตอนภายใน แล้วอัปโหลดไฟล์ PDF ที่ลงนามแล้วกลับเข้าระบบ',
            ]
            : [
                'Safety Admin ตรวจสอบไฟล์ Excel ของ CCCF Form A — Permanent แล้ว และพบว่าต้องแก้ไขเพิ่มเติม',
                'กรุณาตรวจสอบหมายเหตุ แก้ไขไฟล์ Excel ให้ถูกต้อง และส่งเข้าระบบใหม่หรือประสาน Safety Admin',
            ],
        details: [
            { label: 'เลขที่รายการ', value: record.id, highlight: true },
            { label: 'งาน / พื้นที่', value: record.JobArea || '-', highlight: true },
            { label: 'ผลการตรวจ', value: approved ? 'ผ่านการตรวจ / Approved' : 'ต้องแก้ไข / Rejected', highlight: true },
            { label: 'หมายเหตุจากผู้ตรวจ', value: reviewComment || '-' },
            { label: 'Stop Type', value: record.StopType ? `Stop ${record.StopType}` : '-' },
            { label: 'Risk Rank', value: record.Rank || '-', highlight: true },
        ],
        actions: approved
            ? ['เปิดเมนู Patrol & CCCF > CCCF Form A — Permanent', 'เลือก “ส่ง PDF หลังผ่านการตรวจ” และอัปโหลด PDF ที่ลงนามแล้ว']
            : ['แก้ไขไฟล์ Excel ตามหมายเหตุจาก Safety Admin', 'ส่ง Excel ฉบับแก้ไข หรือประสาน Safety Admin หากต้องชี้แจงเพิ่มเติม'],
        note: record.Summary || 'ไม่มี Summary เพิ่มเติม',
    });
}

function buildCccfAdminSignedFileEmail(record, direct = false) {
    return cccfCorporateMail({
        subject: direct
            ? cccfMailSubject('มีการส่ง PDF ลงนามโดยตรง', record.SubmitterName)
            : cccfMailSubject('ผู้รับผิดชอบอัปโหลด PDF ลงนามแล้ว', record.SubmitterName),
        title: direct ? 'มีการส่ง CCCF PDF ลงนามโดยตรง' : 'มีการอัปโหลด CCCF PDF ที่ลงนามแล้ว',
        tone: 'completed',
        greeting: 'เรียน ผู้ดูแลระบบความปลอดภัย',
        intro: direct
            ? [
                'ผู้รับผิดชอบได้ส่ง CCCF Form A — Permanent พร้อมไฟล์ PDF ที่ลงนามแล้วโดยตรง',
                'กรุณาตรวจสอบเอกสารและบันทึกผลการติดตามตามขั้นตอนภายใน',
            ]
            : [
                'ผู้รับผิดชอบได้อัปโหลดไฟล์ PDF ที่ลงนามแล้ว หลังจาก Excel ผ่านการตรวจแล้ว',
                'กรุณาตรวจสอบเอกสารฉบับลงนามและปิดขั้นตอนเอกสารเมื่อข้อมูลครบถ้วน',
            ],
        details: [
            { label: 'เลขที่รายการ', value: record.id, highlight: true },
            { label: 'ผู้รับผิดชอบ', value: record.SubmitterName || '-', highlight: true },
            { label: 'รหัสพนักงาน', value: record.AssigneeID || '-' },
            { label: 'หน่วยงาน', value: record.Department || '-' },
            { label: 'งาน / พื้นที่', value: record.JobArea || '-' },
            { label: 'Stop Type', value: record.StopType ? `Stop ${record.StopType}` : '-' },
            { label: 'Risk Rank', value: record.Rank || '-', highlight: true },
        ],
        actions: [
            'เปิดเมนู Patrol & CCCF > CCCF Form A — Permanent',
            'ตรวจสอบไฟล์ PDF ที่ลงนามแล้ว',
            'ประสานผู้รับผิดชอบหากเอกสารยังไม่ครบถ้วน',
        ],
        note: record.Summary || 'ไม่มี Summary เพิ่มเติม',
    });
}

function buildCccfOwnerCompletedEmail({ record, completeComment }) {
    return cccfCorporateMail({
        subject: cccfMailSubject('เอกสารเสร็จสมบูรณ์แล้ว', record.JobArea),
        title: 'CCCF Form A Permanent เสร็จสมบูรณ์แล้ว',
        tone: 'completed',
        greeting: `เรียน คุณ${record.SubmitterName || 'ผู้รับผิดชอบ'}`,
        intro: [
            'Safety Admin ได้ตรวจสอบและปิดงานเอกสาร CCCF Form A — Permanent แล้ว',
            'รายการนี้ถูกบันทึกเป็น Complete ในระบบเรียบร้อย กรุณาเก็บเอกสารตามขั้นตอนของหน่วยงาน',
        ],
        details: [
            { label: 'เลขที่รายการ', value: record.id, highlight: true },
            { label: 'งาน / พื้นที่', value: record.JobArea || '-', highlight: true },
            { label: 'หน่วยงาน', value: record.Department || '-' },
            { label: 'Stop Type', value: record.StopType ? `Stop ${record.StopType}` : '-' },
            { label: 'Risk Rank', value: record.Rank || '-', highlight: true },
            { label: 'หมายเหตุปิดงาน', value: completeComment || '-' },
        ],
        actions: [
            'เปิดเมนู Patrol & CCCF > CCCF Form A — Permanent เพื่อตรวจสอบสถานะ',
            'ประสาน Safety Admin หากต้องการแก้ไขข้อมูลหลังปิดงาน',
        ],
        note: record.Summary || 'ไม่มี Summary เพิ่มเติม',
    });
}

function sendCccfError(res, err, fallback = 'ไม่สามารถดำเนินการกับข้อมูล CCCF ได้') {
    console.error('[cccf]', err?.message || err);
    if (err?.statusCode) {
        return res.status(err.statusCode).json({ success: false, message: err.message || fallback });
    }
    if (err?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(500).json({ success: false, message: 'ยังไม่พบตารางข้อมูล CCCF กรุณาตรวจสอบฐานข้อมูล' });
    }
    if (err?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, message: 'มีข้อมูลนี้อยู่ในระบบแล้ว' });
    }
    return res.status(500).json({ success: false, message: fallback });
}

function isValidDateInput(value) {
    if (!value) return true;
    const d = new Date(value);
    return !Number.isNaN(d.getTime());
}

function parsePositiveInt(value, fieldName, { allowZero = false } = {}) {
    const parsed = parseInt(value, 10);
    const min = allowZero ? 0 : 1;
    if (!Number.isFinite(parsed) || parsed < min) {
        const err = new Error(String(fieldName) + ' ไม่ถูกต้อง');
        err.statusCode = 400;
        throw err;
    }
    return parsed;
}

function parseOptionalNonNegativeInt(value, fieldName) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        const err = new Error(String(fieldName) + ' ไม่ถูกต้อง');
        err.statusCode = 400;
        throw err;
    }
    return parsed;
}

async function resolvePermanentSubmitter(req, payload = {}) {
    const admin = isAdminUser(req);
    let submitterName = req.user?.name || 'User';
    let department = req.user?.department || '';
    let assigneeId = payload.AssigneeID ? String(payload.AssigneeID).trim() : '';

    if (assigneeId) {
        const [empRows] = await db.query(
            'SELECT EmployeeID, EmployeeName, Department FROM Employees WHERE EmployeeID = ? LIMIT 1',
            [assigneeId]
        );
        if (!empRows.length) {
            const err = new Error('ไม่พบข้อมูลพนักงานจาก master');
            err.statusCode = 404;
            throw err;
        }
        submitterName = empRows[0].EmployeeName || submitterName;
        department = empRows[0].Department || department;
    } else if (admin) {
        submitterName = String(payload.SubmitterName || '').trim() || submitterName;
        department = String(payload.Department || '').trim() || department;
    }

    return {
        SubmitterName: submitterName,
        Department: department,
        AssigneeID: assigneeId || null,
    };
}

async function assertDirectSignedAllowed(req, assigneeId) {
    if (isAdminUser(req)) return true;
    const requesterId = String(req.user?.id || req.user?.EmployeeID || '').trim();
    if (!assigneeId || requesterId !== String(assigneeId)) {
        const err = new Error('ไม่มีสิทธิ์ส่ง PDF ลงนามโดยตรงแทนผู้รับผิดชอบรายนี้');
        err.statusCode = 403;
        throw err;
    }
    const [[assignment]] = await db.query(
        'SELECT AllowDirectSignedPdf FROM CCCF_Assignments WHERE EmployeeID = ? LIMIT 1',
        [assigneeId]
    );
    if (!assignment?.AllowDirectSignedPdf) {
        const err = new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์ส่ง PDF ลงนามโดยตรง');
        err.statusCode = 403;
        throw err;
    }
    return true;
}

// Auto-migrate & auto-create tables
(async () => {
    try {
        await db.query(`ALTER TABLE CCCF_FormA_Worker ADD COLUMN SafetyUnit VARCHAR(100) NOT NULL DEFAULT '' AFTER Department`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_FormA_Permanent ADD COLUMN StopType INT DEFAULT NULL AFTER Summary`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query('ALTER TABLE CCCF_FormA_Permanent ADD COLUMN `Rank` VARCHAR(10) DEFAULT NULL AFTER StopType');
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_FormA_Permanent ADD COLUMN DocumentMode VARCHAR(30) NOT NULL DEFAULT 'legacy' AFTER AssigneeID`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_FormA_Permanent ADD COLUMN ReviewStatus VARCHAR(30) NOT NULL DEFAULT 'Completed' AFTER DocumentMode`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_FormA_Permanent ADD COLUMN ReviewComment TEXT DEFAULT NULL AFTER ReviewStatus`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_FormA_Permanent ADD COLUMN ReviewedBy VARCHAR(100) DEFAULT NULL AFTER ReviewComment`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_FormA_Permanent ADD COLUMN ReviewedAt DATETIME DEFAULT NULL AFTER ReviewedBy`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_FormA_Permanent ADD COLUMN ExcelFileUrl TEXT DEFAULT NULL AFTER FileUrl`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_FormA_Permanent ADD COLUMN SignedFileUrl TEXT DEFAULT NULL AFTER ExcelFileUrl`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_FormA_Permanent ADD COLUMN SignedUploadedAt DATETIME DEFAULT NULL AFTER SignedFileUrl`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_Assignments ADD COLUMN EmployeeID VARCHAR(50) DEFAULT NULL AFTER id`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_Assignments ADD COLUMN AllowDirectSignedPdf TINYINT(1) NOT NULL DEFAULT 0 AFTER Department`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_Assignments ADD COLUMN DueDate DATE DEFAULT NULL AFTER AllowDirectSignedPdf`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_Assignments ADD COLUMN Note TEXT DEFAULT NULL AFTER DueDate`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`ALTER TABLE CCCF_Assignments ADD UNIQUE KEY uq_cccf_assignment_employee (EmployeeID)`);
    } catch (e) { /* index may already exist, table may not exist, or duplicate legacy rows may need manual cleanup */ }
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS CCCF_Unit_Targets (
                id                INT AUTO_INCREMENT PRIMARY KEY,
                unit_name         VARCHAR(200) NOT NULL,
                target_year       INT NOT NULL DEFAULT ${CURRENT_YEAR},
                yearly_target     INT NOT NULL DEFAULT 1,
                achieved_override INT DEFAULT NULL,
                UpdatedBy         VARCHAR(100),
                UpdatedAt         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_unit_year (unit_name, target_year)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    } catch (e) { console.error('[cccf] CCCF_Unit_Targets create:', e.message); }
    try {
        await db.query(`ALTER TABLE CCCF_Unit_Targets ADD COLUMN achieved_override INT DEFAULT NULL`);
    } catch (e) { /* column already exists */ }
    try {
        await db.query(`ALTER TABLE CCCF_Unit_Targets ADD COLUMN target_year INT NOT NULL DEFAULT ${CURRENT_YEAR} AFTER unit_name`);
    } catch (e) { /* column already exists */ }
    try {
        await db.query(`UPDATE CCCF_Unit_Targets SET target_year = ${CURRENT_YEAR} WHERE target_year IS NULL OR target_year = 0`);
    } catch (e) { /* ignore */ }
    try {
        await db.query(`ALTER TABLE CCCF_Unit_Targets DROP INDEX uq_unit`);
    } catch (e) { /* old index may not exist */ }
    try {
        await db.query(`ALTER TABLE CCCF_Unit_Targets ADD UNIQUE KEY uq_unit_year (unit_name, target_year)`);
    } catch (e) { /* index may already exist */ }
    try {
        await ensureCccfEmailOutboxTable();
    } catch (e) { console.error('[cccf] CCCF_EmailOutbox create:', e.message); }
})();

// -----------------------------------------------------------------------------
// LEGACY: CCCF Activity (gallery) - keep for backward compatibility
// -----------------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM CCCF_Activity ORDER BY ActivityDate DESC');
        res.json(rows);
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถดึงข้อมูลกิจกรรม CCCF ได้');
    }
});

router.post('/activity', async (req, res) => {
    try {
        const { ActivityDate, Area, Department, Description, Outcome } = req.body;
        if (!ActivityDate || !Area || !Department || !Description) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกวันที่ พื้นที่ หน่วยงาน และรายละเอียดกิจกรรม' });
        }
        if (!isValidDateInput(ActivityDate)) {
            return res.status(400).json({ success: false, message: 'วันที่กิจกรรมไม่ถูกต้อง' });
        }
        await db.query(
            `INSERT INTO CCCF_Activity (ActivityDate, Area, Department, Description, Outcome, CreatedBy) VALUES (?, ?, ?, ?, ?, ?)`,
            [ActivityDate, Area, Department, Description, Outcome, req.user?.name || 'User']
        );
        await logAudit(req, {
            action: 'CREATE_CCCF_ACTIVITY',
            module: 'cccf',
            targetType: 'CCCF_Activity',
            detail: `Created CCCF activity for ${ActivityDate}`,
            metadata: { Area, Department }
        });
        res.json({ success: true, message: 'บันทึกสำเร็จ' });
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถบันทึกกิจกรรม CCCF ได้');
    }
});

// -----------------------------------------------------------------------------
// FORM A WORKER - Hazard Identification by Worker
// -----------------------------------------------------------------------------

// GET /cccf/form-a-worker
router.get('/form-a-worker', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT * FROM CCCF_FormA_Worker ORDER BY SubmitDate DESC`
        );
        res.json(rows);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        sendCccfError(res, err, 'ไม่สามารถดึงข้อมูล CCCF Worker ได้');
    }
});

// POST /cccf/form-a-worker
router.post('/form-a-worker', async (req, res) => {
    try {
        // Read employee identity from JWT only; do not trust req.body for identity fields.
        const EmployeeName = req.user.name;
        const EmployeeID   = req.user.id;
        const Department   = req.user.department;

        const {
            SubmitDate, JobArea, Equipment, SafetyUnit,
            HazardDescription, HowItHappened, BodyPart, Suggestion,
            StopType, Rank
        } = req.body;

        if (!SubmitDate || !JobArea || !SafetyUnit || !HazardDescription || !StopType || !Rank) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }
        if (!isValidDateInput(SubmitDate)) {
            return res.status(400).json({ success: false, message: 'วันที่ส่งข้อมูลไม่ถูกต้อง' });
        }

        const [result] = await db.query(
            `INSERT INTO CCCF_FormA_Worker
             (EmployeeName, EmployeeID, Department, SafetyUnit, SubmitDate, JobArea, Equipment,
              HazardDescription, HowItHappened, BodyPart, Suggestion, StopType, \`Rank\`, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                EmployeeName, EmployeeID, Department, SafetyUnit || '',
                SubmitDate || new Date(), JobArea || '', Equipment || '',
                HazardDescription, HowItHappened || '', BodyPart || '', Suggestion || '',
                StopType, Rank, EmployeeName
            ]
        );
        await logAudit(req, {
            action: 'CREATE_CCCF_WORKER_FORM',
            module: 'cccf',
            targetType: 'CCCF_FormA_Worker',
            targetId: result.insertId,
            detail: `Created CCCF worker form ${result.insertId}`,
            metadata: { SubmitDate, JobArea, SafetyUnit, StopType, Rank }
        });
        res.json({ success: true, message: 'ส่งแบบฟอร์ม CCCF สำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ success: false, message: 'ยังไม่มีตาราง CCCF_FormA_Worker กรุณาสร้างตารางก่อน' });
        }
        sendCccfError(res, err, 'ไม่สามารถบันทึก CCCF Worker ได้');
    }
});

// PUT /cccf/form-a-worker/:id  (owner or admin)
router.put('/form-a-worker/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await db.query('SELECT EmployeeID FROM CCCF_FormA_Worker WHERE id = ?', [id]);
        if (!existing.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });

        const admin = isAdminUser(req);
        if (!admin && existing[0].EmployeeID !== req.user.id) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์แก้ไขรายการของผู้อื่น' });
        }

        const {
            SubmitDate, JobArea, Equipment, SafetyUnit,
            HazardDescription, HowItHappened, BodyPart, Suggestion,
            StopType, Rank
        } = req.body;

        if (!SubmitDate || !JobArea || !SafetyUnit || !HazardDescription || !StopType || !Rank) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        await db.query(
            `UPDATE CCCF_FormA_Worker SET
             SafetyUnit=?, SubmitDate=?, JobArea=?, Equipment=?,
             HazardDescription=?, HowItHappened=?, BodyPart=?, Suggestion=?,
             StopType=?, \`Rank\`=?
             WHERE id=?`,
            [
                SafetyUnit || '', SubmitDate || new Date(),
                JobArea || '', Equipment || '',
                HazardDescription, HowItHappened || '', BodyPart || '', Suggestion || '',
                StopType, Rank, id
            ]
        );
        await logAudit(req, {
            action: 'UPDATE_CCCF_WORKER_FORM',
            module: 'cccf',
            targetType: 'CCCF_FormA_Worker',
            targetId: id,
            detail: `Updated CCCF worker form ${id}`,
            metadata: { SubmitDate, JobArea, SafetyUnit, StopType, Rank }
        });
        res.json({ success: true, message: 'อัปเดตสำเร็จ' });
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถอัปเดต CCCF Worker ได้');
    }
});

// DELETE /cccf/form-a-worker/:id  (owner or admin)
router.delete('/form-a-worker/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const admin = isAdminUser(req);
        if (!admin) {
            // verify ownership
            const [existing] = await db.query('SELECT EmployeeID FROM CCCF_FormA_Worker WHERE id = ?', [id]);
            if (!existing.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
            if (existing[0].EmployeeID !== req.user.id) {
                return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ลบรายการของผู้อื่น' });
            }
        }
        const [result] = await db.query('DELETE FROM CCCF_FormA_Worker WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการลบ' });
        await logAudit(req, {
            action: 'DELETE_CCCF_WORKER_FORM',
            module: 'cccf',
            targetType: 'CCCF_FormA_Worker',
            targetId: id,
            detail: `Deleted CCCF worker form ${id}`
        });
        res.json({ success: true });
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถลบ CCCF Worker ได้');
    }
});

// -----------------------------------------------------------------------------
// FORM A PERMANENT - Supervisor Submission
// -----------------------------------------------------------------------------

// GET /cccf/form-a-permanent
router.get('/form-a-permanent', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT * FROM CCCF_FormA_Permanent ORDER BY SubmitDate DESC, id DESC`
        );
        res.json(rows);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        sendCccfError(res, err, 'ไม่สามารถดึงข้อมูล CCCF Permanent ได้');
    }
});

// POST /cccf/form-a-permanent  (with optional file upload)
router.post('/form-a-permanent', upload.single('FormFile'), async (req, res) => {
    try {
        const { JobArea, SubmitDate, Summary, StopType, Rank } = req.body;
        const requestedMode = String(req.body.DocumentMode || req.body.documentMode || 'excel_review').trim();
        const documentMode = VALID_CCCF_DOCUMENT_MODES.includes(requestedMode) ? requestedMode : 'excel_review';

        if (!JobArea || !StopType || !Rank) {
            safeDeleteLocalUpload(req.file?.path);
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        if (!isValidDateInput(SubmitDate)) {
            safeDeleteLocalUpload(req.file?.path);
            return res.status(400).json({ success: false, message: 'วันที่ส่งข้อมูลไม่ถูกต้อง' });
        }

        const { SubmitterName, Department, AssigneeID } = await resolvePermanentSubmitter(req, req.body);
        const ownerEmail = await getEmployeeCompanyEmail(AssigneeID);
        if (await getCccfRequireCompanyEmail() && !ownerEmail) {
            safeDeleteLocalUpload(req.file?.path);
            return res.status(400).json({ success: false, message: 'Employee Master ยังไม่มี CompanyEmail ของผู้รับผิดชอบ กรุณาอัปเดตก่อนส่ง CCCF Permanent' });
        }
        const fileUrl = req.file?.path || null;
        const stopTypeValue = parsePositiveInt(StopType, 'Stop Type');
        if (documentMode === 'excel_review' && (!req.file || !isExcelUpload(req.file))) {
            safeDeleteLocalUpload(req.file?.path);
            return res.status(400).json({ success: false, message: 'การส่ง Excel เพื่อตรวจสอบต้องแนบไฟล์ Excel (.xls/.xlsx)' });
        }
        if (documentMode === 'direct_signed') {
            if (!req.file || !isPdfUpload(req.file)) {
                safeDeleteLocalUpload(req.file?.path);
                return res.status(400).json({ success: false, message: 'การส่ง PDF ลงนามโดยตรงต้องแนบไฟล์ PDF' });
            }
            await assertDirectSignedAllowed(req, AssigneeID);
        }
        const reviewStatus = documentMode === 'excel_review' ? 'PendingReview' : 'Completed';
        const excelFileUrl = documentMode === 'excel_review' ? fileUrl : null;
        const signedFileUrl = documentMode === 'direct_signed' ? fileUrl : null;

        const [result] = await db.query(
            `INSERT INTO CCCF_FormA_Permanent
             (SubmitterName, Department, JobArea, SubmitDate, Summary, StopType, \`Rank\`, FileUrl,
              ExcelFileUrl, SignedFileUrl, SignedUploadedAt, AssigneeID, DocumentMode, ReviewStatus, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                SubmitterName, Department, JobArea || '', SubmitDate || new Date(),
                Summary || '', stopTypeValue, Rank || null, fileUrl,
                excelFileUrl, signedFileUrl, signedFileUrl ? new Date() : null,
                AssigneeID || null, documentMode, reviewStatus,
                req.user?.name || SubmitterName
            ]
        );
        await logAudit(req, {
            action: 'CREATE_CCCF_PERMANENT_FORM',
            module: 'cccf',
            targetType: 'CCCF_FormA_Permanent',
            targetId: result.insertId,
            detail: `Created CCCF permanent form ${result.insertId}`,
            metadata: { SubmitDate, JobArea, StopType, Rank, AssigneeID, uploaded: !!req.file }
        });
        const submittedRecord = {
            id: result.insertId,
            SubmitterName,
            Department,
            JobArea: JobArea || '',
            SubmitDate: SubmitDate || new Date().toISOString().slice(0, 10),
            Summary: Summary || '',
            StopType: stopTypeValue,
            Rank: Rank || null,
            FileUrl: fileUrl,
            ExcelFileUrl: excelFileUrl,
            SignedFileUrl: signedFileUrl,
            DocumentMode: documentMode,
            ReviewStatus: reviewStatus,
            AssigneeID: AssigneeID || null,
        };
        const adminMail = documentMode === 'direct_signed'
            ? buildCccfAdminSignedFileEmail(submittedRecord, true)
            : buildCccfAdminSubmittedEmail(submittedRecord);
        await queueCccfEmail({
            to: getCccfAdminEmail(),
            permanentId: result.insertId,
            eventType: documentMode === 'direct_signed' ? 'DirectSignedSubmitted' : 'Submitted',
            subject: adminMail.subject,
            body: adminMail.body,
            html: adminMail.html,
        });
        if (isAdminUser(req) && ownerEmail) {
            const ownerMail = buildCccfOwnerSubmittedByAdminEmail(submittedRecord);
            await queueCccfEmail({
                to: ownerEmail,
                permanentId: result.insertId,
                eventType: 'SubmittedByAdmin',
                subject: ownerMail.subject,
                body: ownerMail.body,
                html: ownerMail.html,
            });
        }
        res.json({ success: true, message: 'ส่งเอกสาร CCCF Permanent สำเร็จ' });
    } catch (err) {
        safeDeleteLocalUpload(req.file?.path);
        if (err.statusCode) {
            return sendCccfError(res, err, 'ไม่สามารถบันทึก CCCF Permanent ได้');
        }
        if (err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ success: false, message: 'ยังไม่มีตาราง CCCF_FormA_Permanent กรุณาสร้างตารางก่อน' });
        }
        sendCccfError(res, err, 'ไม่สามารถบันทึก CCCF Permanent ได้');
    }
});

// PUT /cccf/form-a-permanent/:id  (admin only)
router.put('/form-a-permanent/:id', isAdmin, upload.single('FormFile'), async (req, res) => {
    try {
        const { id } = req.params;
        const { JobArea, SubmitDate, Summary, StopType, Rank } = req.body;
        const [existing] = await db.query('SELECT * FROM CCCF_FormA_Permanent WHERE id = ? LIMIT 1', [id]);
        if (!existing.length) {
            safeDeleteLocalUpload(req.file?.path);
            return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
        }
        if (!JobArea || !StopType || !Rank) {
            safeDeleteLocalUpload(req.file?.path);
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }
        if (!isValidDateInput(SubmitDate)) {
            safeDeleteLocalUpload(req.file?.path);
            return res.status(400).json({ success: false, message: 'วันที่ส่งข้อมูลไม่ถูกต้อง' });
        }

        const { SubmitterName, Department, AssigneeID } = await resolvePermanentSubmitter(req, req.body);
        const currentRow = existing[0];
        const fileUrl = req.file?.path || currentRow.FileUrl || null;
        const stopTypeValue = parsePositiveInt(StopType, 'Stop Type');

        await db.query(
            `UPDATE CCCF_FormA_Permanent
             SET SubmitterName = ?, Department = ?, JobArea = ?, SubmitDate = ?, Summary = ?,
                 StopType = ?, \`Rank\` = ?, FileUrl = ?, AssigneeID = ?
             WHERE id = ?`,
            [
                SubmitterName,
                Department,
                JobArea || '',
                SubmitDate || new Date(),
                Summary || '',
                stopTypeValue,
                Rank || null,
                fileUrl,
                AssigneeID || null,
                id
            ]
        );
        if (req.file?.path && currentRow.FileUrl !== req.file.path) {
            safeDeleteLocalUpload(currentRow.FileUrl);
        }
        await logAudit(req, {
            action: 'UPDATE_CCCF_PERMANENT_FORM',
            module: 'cccf',
            targetType: 'CCCF_FormA_Permanent',
            targetId: id,
            detail: `Updated CCCF permanent form ${id}`,
            metadata: { SubmitDate, JobArea, StopType, Rank, AssigneeID, uploaded: !!req.file }
        });
        const updatedRecord = {
            id,
            SubmitterName,
            Department,
            JobArea: JobArea || '',
            SubmitDate: SubmitDate || new Date().toISOString().slice(0, 10),
            Summary: Summary || '',
            StopType: stopTypeValue,
            Rank: Rank || null,
            FileUrl: fileUrl,
            AssigneeID: AssigneeID || null,
        };
        const ownerEmail = await getEmployeeCompanyEmail(AssigneeID);
        if (ownerEmail) {
            const ownerMail = buildCccfOwnerUpdatedEmail(updatedRecord, !!req.file);
            await queueCccfEmail({
                to: ownerEmail,
                permanentId: id,
                eventType: req.file ? 'UpdatedWithFile' : 'Updated',
                subject: ownerMail.subject,
                body: ownerMail.body,
                html: ownerMail.html,
            });
        }
        res.json({ success: true, message: 'อัปเดตรายการ Permanent สำเร็จ' });
    } catch (err) {
        safeDeleteLocalUpload(req.file?.path);
        if (err.statusCode) {
            return sendCccfError(res, err, 'ไม่สามารถอัปเดต CCCF Permanent ได้');
        }
        sendCccfError(res, err, 'ไม่สามารถอัปเดต CCCF Permanent ได้');
    }
});

// POST /cccf/form-a-permanent/:id/review  (admin: approve/reject Excel stage)
router.post('/form-a-permanent/:id/review', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const reviewStatus = String(req.body?.ReviewStatus || '').trim();
        const reviewComment = String(req.body?.ReviewComment || '').trim();
        if (!['Approved', 'Rejected'].includes(reviewStatus)) {
            return res.status(400).json({ success: false, message: 'ผลการตรวจต้องเป็น Approved หรือ Rejected' });
        }
        if (reviewStatus === 'Rejected' && !reviewComment) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุเหตุผลเมื่อ Reject' });
        }
        const [rows] = await db.query('SELECT * FROM CCCF_FormA_Permanent WHERE id = ? LIMIT 1', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
        const record = rows[0];
        if (!record.ExcelFileUrl && record.DocumentMode === 'excel_review') {
            return res.status(400).json({ success: false, message: 'รายการนี้ยังไม่มีไฟล์ Excel สำหรับตรวจสอบ' });
        }
        await db.query(
            `UPDATE CCCF_FormA_Permanent
             SET ReviewStatus = ?, ReviewComment = ?, ReviewedBy = ?, ReviewedAt = NOW()
             WHERE id = ?`,
            [reviewStatus, reviewComment || null, req.user?.name || 'Admin', id]
        );
        await logAudit(req, {
            action: reviewStatus === 'Approved' ? 'REVIEW_APPROVE_CCCF_PERMANENT' : 'REVIEW_REJECT_CCCF_PERMANENT',
            module: 'cccf',
            targetType: 'CCCF_FormA_Permanent',
            targetId: id,
            detail: `CCCF permanent form ${id} review ${reviewStatus}`,
            metadata: { reviewStatus, reviewComment }
        });
        const ownerEmail = await getEmployeeCompanyEmail(record.AssigneeID);
        if (ownerEmail) {
            const mail = buildCccfUserReviewEmail({
                record: { ...record, id },
                reviewStatus,
                reviewComment,
            });
            await queueCccfEmail({
                to: ownerEmail,
                permanentId: id,
                eventType: reviewStatus,
                subject: mail.subject,
                body: mail.body,
                html: mail.html,
            });
        }
        res.json({ success: true, message: 'บันทึกผลการตรวจสำเร็จ' });
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถบันทึกผลการตรวจ CCCF Permanent ได้');
    }
});

// POST /cccf/form-a-permanent/:id/signed-file  (owner/admin: upload signed PDF after approval)
router.post('/form-a-permanent/:id/signed-file', upload.single('FormFile'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.file || !isPdfUpload(req.file)) {
            safeDeleteLocalUpload(req.file?.path);
            return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์ PDF ที่ลงนามแล้ว' });
        }
        const [rows] = await db.query('SELECT * FROM CCCF_FormA_Permanent WHERE id = ? LIMIT 1', [id]);
        if (!rows.length) {
            safeDeleteLocalUpload(req.file?.path);
            return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
        }
        const record = rows[0];
        const requesterId = String(req.user?.id || req.user?.EmployeeID || '').trim();
        const canUpload = isAdminUser(req) || requesterId === String(record.AssigneeID || '').trim();
        if (!canUpload) {
            safeDeleteLocalUpload(req.file?.path);
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์อัปโหลด PDF ของรายการนี้' });
        }
        if (!['Approved', 'Completed'].includes(record.ReviewStatus || '')) {
            safeDeleteLocalUpload(req.file?.path);
            return res.status(400).json({ success: false, message: 'อัปโหลด PDF ได้หลังจาก Excel ผ่านการตรวจแล้วเท่านั้น' });
        }
        await db.query(
            `UPDATE CCCF_FormA_Permanent
             SET SignedFileUrl = ?, FileUrl = ?, SignedUploadedAt = NOW(), ReviewStatus = 'Completed'
             WHERE id = ?`,
            [req.file.path, req.file.path, id]
        );
        safeDeleteLocalUpload(record.SignedFileUrl && record.SignedFileUrl !== req.file.path ? record.SignedFileUrl : null);
        await logAudit(req, {
            action: 'UPLOAD_CCCF_PERMANENT_SIGNED_PDF',
            module: 'cccf',
            targetType: 'CCCF_FormA_Permanent',
            targetId: id,
            detail: `Uploaded signed PDF for CCCF permanent form ${id}`,
            metadata: { fileUrl: req.file.path }
        });
        const mail = buildCccfAdminSignedFileEmail({ ...record, FileUrl: req.file.path, SignedFileUrl: req.file.path }, false);
        await queueCccfEmail({
            to: getCccfAdminEmail(),
            permanentId: id,
            eventType: 'SignedFileUploaded',
            subject: mail.subject,
            body: mail.body,
            html: mail.html,
        });
        res.json({ success: true, message: 'อัปโหลด PDF ที่ลงนามแล้วสำเร็จ', url: req.file.path });
    } catch (err) {
        safeDeleteLocalUpload(req.file?.path);
        sendCccfError(res, err, 'ไม่สามารถอัปโหลด PDF ที่ลงนามแล้วได้');
    }
});

// POST /cccf/form-a-permanent/:id/complete  (admin: close document and notify owner)
router.post('/form-a-permanent/:id/complete', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const completeComment = String(req.body?.ReviewComment || req.body?.CompleteComment || '').trim();
        const [rows] = await db.query('SELECT * FROM CCCF_FormA_Permanent WHERE id = ? LIMIT 1', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
        const record = rows[0];
        if (!record.SignedFileUrl && record.DocumentMode !== 'direct_signed') {
            return res.status(400).json({ success: false, message: 'ปิดงานได้หลังมี PDF ที่ลงนามแล้วเท่านั้น' });
        }
        await db.query(
            `UPDATE CCCF_FormA_Permanent
             SET ReviewStatus = 'Completed',
                 ReviewComment = COALESCE(NULLIF(?, ''), ReviewComment),
                 ReviewedBy = ?,
                 ReviewedAt = NOW()
             WHERE id = ?`,
            [completeComment, req.user?.name || 'Admin', id]
        );
        await logAudit(req, {
            action: 'COMPLETE_CCCF_PERMANENT_FORM',
            module: 'cccf',
            targetType: 'CCCF_FormA_Permanent',
            targetId: id,
            detail: `Completed CCCF permanent form ${id}`,
            metadata: { completeComment }
        });
        const ownerEmail = await getEmployeeCompanyEmail(record.AssigneeID);
        if (ownerEmail) {
            const mail = buildCccfOwnerCompletedEmail({ record: { ...record, id }, completeComment });
            await queueCccfEmail({
                to: ownerEmail,
                permanentId: id,
                eventType: 'Completed',
                subject: mail.subject,
                body: mail.body,
                html: mail.html,
            });
        }
        res.json({ success: true, message: 'ปิดงาน CCCF Permanent สำเร็จ' });
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถปิดงาน CCCF Permanent ได้');
    }
});

// DELETE /cccf/form-a-permanent/:id
router.delete('/form-a-permanent/:id', isAdmin, async (req, res) => {
    try {
        const [[row]] = await db.query('SELECT FileUrl, ExcelFileUrl, SignedFileUrl FROM CCCF_FormA_Permanent WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการลบ' });
        const [result] = await db.query('DELETE FROM CCCF_FormA_Permanent WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการลบ' });
        [...new Set([row?.FileUrl, row?.ExcelFileUrl, row?.SignedFileUrl].filter(Boolean))].forEach(url => safeDeleteLocalUpload(url));
        await logAudit(req, {
            action: 'DELETE_CCCF_PERMANENT_FORM',
            module: 'cccf',
            targetType: 'CCCF_FormA_Permanent',
            targetId: req.params.id,
            detail: `Deleted CCCF permanent form ${req.params.id}`
        });
        res.json({ success: true });
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถลบ CCCF Permanent ได้');
    }
});

// -----------------------------------------------------------------------------
// EMAIL OUTBOX - Admin retry support
// -----------------------------------------------------------------------------
router.get('/email-outbox', isAdmin, async (req, res) => {
    try {
        await ensureCccfEmailOutboxTable();
        const { status } = req.query;
        let sql = 'SELECT * FROM CCCF_EmailOutbox';
        const params = [];
        if (status) {
            sql += ' WHERE Status = ?';
            params.push(status);
        }
        sql += ' ORDER BY CreatedAt DESC LIMIT 200';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถโหลดคิวอีเมล CCCF ได้');
    }
});

router.post('/email-outbox/:id/retry', isAdmin, async (req, res) => {
    try {
        await ensureCccfEmailOutboxTable();
        const [rows] = await db.query('SELECT * FROM CCCF_EmailOutbox WHERE id = ? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบอีเมลในคิว' });
        const item = rows[0];
        try {
            await sendMail({ to: item.Recipients, subject: item.Subject, text: item.Body, html: item.HtmlBody });
            await db.query(`UPDATE CCCF_EmailOutbox SET Status = 'Sent', SentAt = NOW(), Error = NULL WHERE id = ?`, [item.id]);
            res.json({ success: true, message: 'ส่งอีเมลสำเร็จ' });
        } catch (err) {
            await db.query(`UPDATE CCCF_EmailOutbox SET Status = 'Failed', Error = ? WHERE id = ?`, [err.message, item.id]);
            res.status(500).json({ success: false, message: err.message });
        }
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถ retry อีเมล CCCF ได้');
    }
});

router.post('/email-outbox/retry-queued', isAdmin, async (req, res) => {
    try {
        await ensureCccfEmailOutboxTable();
        const limit = Math.max(1, Math.min(parseInt(req.body?.limit || req.query?.limit || 20, 10) || 20, 50));
        const [rows] = await db.query(
            `SELECT * FROM CCCF_EmailOutbox
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
                await db.query(`UPDATE CCCF_EmailOutbox SET Status = 'Sent', SentAt = NOW(), Error = NULL WHERE id = ?`, [item.id]);
                sent++;
            } catch (err) {
                await db.query(`UPDATE CCCF_EmailOutbox SET Status = 'Failed', Error = ? WHERE id = ?`, [err.message, item.id]);
                failed++;
            }
        }
        res.json({ success: true, processed: rows.length, sent, failed });
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถ retry คิวอีเมล CCCF ได้');
    }
});

// -----------------------------------------------------------------------------
// UNIT TARGETS - Admin sets yearly target per Safety Unit
// -----------------------------------------------------------------------------

// GET /cccf/unit-targets
router.get('/unit-targets', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM CCCF_Unit_Targets ORDER BY target_year DESC, unit_name ASC');
        res.json(rows);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        sendCccfError(res, err, 'ไม่สามารถดึงข้อมูลเป้าหมาย CCCF ได้');
    }
});

// PUT /cccf/unit-targets/:unit (admin only)
router.put('/unit-targets/:unit', isAdmin, async (req, res) => {
    try {
        const unitName       = decodeURIComponent(req.params.unit);
        const targetYearRaw  = req.body.target_year || CURRENT_YEAR;
        const targetYear     = parsePositiveInt(targetYearRaw, 'ปีเป้าหมาย');
        if (targetYear < 2000 || targetYear > 2100) return res.status(400).json({ success: false, message: 'ปีเป้าหมายไม่ถูกต้อง' });
        const target         = parsePositiveInt(req.body.yearly_target, 'เป้าหมายรายปี', { allowZero: true });
        const achOverride    = parseOptionalNonNegativeInt(req.body.achieved_override, 'จำนวนที่ทำได้');
        if (!unitName.trim()) return res.status(400).json({ success: false, message: 'กรุณาระบุหน่วยงาน' });
        await db.query(
            `INSERT INTO CCCF_Unit_Targets (unit_name, target_year, yearly_target, achieved_override, UpdatedBy)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               yearly_target=VALUES(yearly_target),
               achieved_override=VALUES(achieved_override),
               UpdatedBy=VALUES(UpdatedBy)`,
            [unitName, targetYear, target, achOverride, req.user.name]
        );
        await logAudit(req, {
            action: 'UPDATE_CCCF_UNIT_TARGET',
            module: 'cccf',
            targetType: 'CCCF_Unit_Targets',
            targetId: `${unitName}:${targetYear}`,
            detail: `Updated CCCF target for ${unitName} ${targetYear}`,
            metadata: { unitName, targetYear, target, achOverride }
        });
        res.json({ success: true, message: 'บันทึกสำเร็จ' });
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถบันทึกเป้าหมาย CCCF ได้');
    }
});

// -----------------------------------------------------------------------------
// ASSIGNMENTS - Admin manages who must submit Form A Permanent
// -----------------------------------------------------------------------------

// GET /cccf/assignments
router.get('/assignments', async (req, res) => {
    try {
        await ensureEmployeeCompanyEmailColumn(db);
        const [rows] = await db.query(`
            SELECT
                a.id,
                a.EmployeeID,
                COALESCE(e.EmployeeName, a.AssigneeName) AS AssigneeName,
                COALESCE(e.Department, a.Department) AS Department,
                e.CompanyEmail,
                a.AllowDirectSignedPdf,
                a.DueDate,
                a.Note,
                a.CreatedBy
            FROM CCCF_Assignments a
            LEFT JOIN Employees e ON e.EmployeeID = a.EmployeeID
            ORDER BY COALESCE(e.Department, a.Department) ASC, COALESCE(e.EmployeeName, a.AssigneeName) ASC
        `);
        res.json(rows);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        sendCccfError(res, err, 'ไม่สามารถดึงข้อมูลมอบหมาย CCCF ได้');
    }
});

// POST /cccf/assignments
router.post('/assignments', isAdmin, async (req, res) => {
    try {
        const { EmployeeID, AssigneeName, Department, AllowDirectSignedPdf, DueDate, Note } = req.body;
        const directAllowed = AllowDirectSignedPdf === true || AllowDirectSignedPdf === 1 || AllowDirectSignedPdf === '1' ? 1 : 0;
        const dueDate = String(DueDate || '').trim() || null;
        const note = String(Note || '').trim() || null;
        if (dueDate && !isValidDateInput(dueDate)) {
            return res.status(400).json({ success: false, message: 'กำหนดส่งไม่ถูกต้อง' });
        }
        if (!EmployeeID && (!AssigneeName || !Department)) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อและหน่วยงาน' });
        }
        let payloadName = AssigneeName || null;
        let payloadDept = Department || null;

        if (EmployeeID) {
            const [empRows] = await db.query(
                'SELECT EmployeeID, EmployeeName, Department FROM Employees WHERE EmployeeID = ? LIMIT 1',
                [EmployeeID]
            );
            if (!empRows.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลพนักงานจาก master' });
            }
            const employee = empRows[0];
            payloadName = employee.EmployeeName || payloadName;
            payloadDept = employee.Department || payloadDept;

            const [exists] = await db.query(
                'SELECT id FROM CCCF_Assignments WHERE EmployeeID = ? LIMIT 1',
                [EmployeeID]
            );
            if (exists.length) {
                return res.status(400).json({ success: false, message: 'พนักงานคนนี้ถูกมอบหมายแล้ว' });
            }
        }
        const [result] = await db.query(
            'INSERT INTO CCCF_Assignments (EmployeeID, AssigneeName, Department, AllowDirectSignedPdf, DueDate, Note, CreatedBy) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [EmployeeID || null, payloadName, payloadDept, directAllowed, dueDate, note, req.user?.name || 'Admin']
        );
        await logAudit(req, {
            action: 'CREATE_CCCF_ASSIGNMENT',
            module: 'cccf',
            targetType: 'CCCF_Assignments',
            targetId: result.insertId,
            detail: `Created CCCF assignment ${result.insertId}`,
            metadata: { EmployeeID, AssigneeName: payloadName, Department: payloadDept, AllowDirectSignedPdf: directAllowed, DueDate: dueDate, Note: note }
        });
        const assigneeEmail = await getEmployeeCompanyEmail(EmployeeID);
        if (assigneeEmail) {
            const assignmentMail = buildCccfAssignmentEmail({
                EmployeeID,
                AssigneeName: payloadName,
                Department: payloadDept,
                AllowDirectSignedPdf: directAllowed,
                DueDate: dueDate,
                Note: note,
                CreatedBy: req.user?.name || 'Safety Admin',
            });
            await queueCccfEmail({
                to: assigneeEmail,
                permanentId: null,
                eventType: 'Assigned',
                subject: assignmentMail.subject,
                body: assignmentMail.body,
                html: assignmentMail.html,
            });
        }
        res.json({ success: true, message: 'เพิ่มรายการมอบหมายสำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ success: false, message: 'ยังไม่มีตาราง CCCF_Assignments' });
        }
        sendCccfError(res, err, 'ไม่สามารถเพิ่มรายการมอบหมาย CCCF ได้');
    }
});

// PUT /cccf/assignments/:id
router.put('/assignments/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { EmployeeID, AssigneeName, Department, AllowDirectSignedPdf, DueDate, Note } = req.body;
        const directAllowed = AllowDirectSignedPdf === true || AllowDirectSignedPdf === 1 || AllowDirectSignedPdf === '1' ? 1 : 0;
        const dueDate = String(DueDate || '').trim() || null;
        const note = String(Note || '').trim() || null;
        if (dueDate && !isValidDateInput(dueDate)) {
            return res.status(400).json({ success: false, message: 'กำหนดส่งไม่ถูกต้อง' });
        }
        const [existingRows] = await db.query('SELECT id FROM CCCF_Assignments WHERE id = ? LIMIT 1', [id]);
        if (!existingRows.length) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการมอบหมาย' });
        }
        if (!EmployeeID && (!AssigneeName || !Department)) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อและหน่วยงาน' });
        }

        let payloadName = AssigneeName || null;
        let payloadDept = Department || null;
        let payloadEmployeeId = EmployeeID || null;

        if (payloadEmployeeId) {
            const [empRows] = await db.query(
                'SELECT EmployeeID, EmployeeName, Department FROM Employees WHERE EmployeeID = ? LIMIT 1',
                [payloadEmployeeId]
            );
            if (!empRows.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลพนักงานจาก master' });
            }
            payloadName = empRows[0].EmployeeName || payloadName;
            payloadDept = empRows[0].Department || payloadDept;

            const [exists] = await db.query(
                'SELECT id FROM CCCF_Assignments WHERE EmployeeID = ? AND id <> ? LIMIT 1',
                [payloadEmployeeId, id]
            );
            if (exists.length) {
                return res.status(400).json({ success: false, message: 'พนักงานคนนี้ถูกมอบหมายแล้ว' });
            }
        }

        await db.query(
            'UPDATE CCCF_Assignments SET EmployeeID = ?, AssigneeName = ?, Department = ?, AllowDirectSignedPdf = ?, DueDate = ?, Note = ?, CreatedBy = ? WHERE id = ?',
            [payloadEmployeeId, payloadName, payloadDept, directAllowed, dueDate, note, req.user?.name || 'Admin', id]
        );
        await logAudit(req, {
            action: 'UPDATE_CCCF_ASSIGNMENT',
            module: 'cccf',
            targetType: 'CCCF_Assignments',
            targetId: id,
            detail: `Updated CCCF assignment ${id}`,
            metadata: { EmployeeID: payloadEmployeeId, AssigneeName: payloadName, Department: payloadDept, AllowDirectSignedPdf: directAllowed, DueDate: dueDate, Note: note }
        });
        const assigneeEmail = await getEmployeeCompanyEmail(payloadEmployeeId);
        if (assigneeEmail) {
            const assignmentMail = buildCccfAssignmentEmail({
                EmployeeID: payloadEmployeeId,
                AssigneeName: payloadName,
                Department: payloadDept,
                AllowDirectSignedPdf: directAllowed,
                DueDate: dueDate,
                Note: note,
                CreatedBy: req.user?.name || 'Safety Admin',
            });
            await queueCccfEmail({
                to: assigneeEmail,
                permanentId: null,
                eventType: 'AssignmentUpdated',
                subject: assignmentMail.subject,
                body: assignmentMail.body,
                html: assignmentMail.html,
            });
        }
        res.json({ success: true, message: 'อัปเดตรายการมอบหมายสำเร็จ' });
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถอัปเดตรายการมอบหมาย CCCF ได้');
    }
});

// DELETE /cccf/assignments/:id
router.delete('/assignments/:id', isAdmin, async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM CCCF_Assignments WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการลบ' });
        await logAudit(req, {
            action: 'DELETE_CCCF_ASSIGNMENT',
            module: 'cccf',
            targetType: 'CCCF_Assignments',
            targetId: req.params.id,
            detail: `Deleted CCCF assignment ${req.params.id}`
        });
        res.json({ success: true });
    } catch (err) {
        sendCccfError(res, err, 'ไม่สามารถลบรายการมอบหมาย CCCF ได้');
    }
});

module.exports = router;
