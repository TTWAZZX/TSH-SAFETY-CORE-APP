// backend/routes/ky.js
// KY Ability (Kiken Yochi - Hazard Prediction)
// Auth (authenticateToken) applied at mount level
// Admin-only ops use isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const { createHash, randomUUID } = require('crypto');
const { isAdmin } = require('../middleware/auth');
const { storage: uploadStorage, fileFilter, deleteLocalUpload, uploadsDir, cleanOriginalFilename } = require('../storage');
const { logAudit } = require('../utils/audit');
const { sendMail, smtpConfigured } = require('../utils/email');
const { buildHiyariEmail } = require('../utils/hiyari-email-template');
const {
    validateCompanyEmail,
    ensureEmployeeCompanyEmailColumn,
} = require('../utils/company-email');

// Standard upload (images + docs)
const uploadFile = multer({
    storage: uploadStorage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
});

// Video upload
const videoFilter = (req, file, cb) => {
    const allowed = [
        'video/mp4', 'video/quicktime', 'video/avi', 'video/webm',
        'video/x-msvideo', 'video/x-matroska', 'video/mpeg',
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`ประเภทไฟล์วิดีโอไม่รองรับ: ${file.mimetype}`), false);
};
const uploadVideo = multer({
    storage: uploadStorage,
    fileFilter: videoFilter,
    limits: { fileSize: 200 * 1024 * 1024 },
});

// Combined upload
const uploadCombined = multer({
    storage: uploadStorage,
    fileFilter: (req, file, cb) => {
        const allowedAll = [
            'image/jpeg','image/png','image/gif','image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'video/mp4','video/quicktime','video/avi','video/webm',
            'video/x-msvideo','video/x-matroska','video/mpeg',
        ];
        if (allowedAll.includes(file.mimetype)) return cb(null, true);
        cb(new Error(`ประเภทไฟล์ไม่รองรับ: ${file.mimetype}`), false);
    },
    limits: { fileSize: 200 * 1024 * 1024 },
});

const KY_ATTACHMENT_LIMIT = 20 * 1024 * 1024;
const KY_VIDEO_LIMIT = 200 * 1024 * 1024;
const KY_VIDEO_CHUNK_SIZE = 256 * 1024;
const KY_VIDEO_CHUNK_MAX_ATTEMPTS = 3;
const KY_VIDEO_CHUNK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const KY_VIDEO_CHUNK_ROOT = path.join(__dirname, '..', 'private-uploads', 'ky-video-chunks');
const KY_VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'avi', 'mkv', 'mpeg', 'mpg']);
const KY_VIDEO_MIME_TYPES = new Set([
    'video/mp4', 'video/quicktime', 'video/webm', 'video/avi',
    'video/x-msvideo', 'video/x-matroska', 'video/mpeg',
]);
const KY_ANNUAL_VIDEO_STORAGE_MODES = new Set(['Production', 'CentralMachine']);
const KY_ANNUAL_VIDEO_STATUSES = new Set(['Pending', 'Verified', 'NeedsCorrection']);
const uploadKyVideoChunk = multer({
    storage: multer.memoryStorage(),
    // Busboy marks a file as limited when it reaches the exact configured cap.
    // Keep a tiny parser margin; the route still requires the exact expected bytes.
    limits: { files: 1, fileSize: KY_VIDEO_CHUNK_SIZE + (64 * 1024) },
});
fs.mkdirSync(KY_VIDEO_CHUNK_ROOT, { recursive: true });
const KY_REACTIONS = ['useful', 'practice', 'awareness', 'attention'];
const KY_VIDEO_SHOWCASE_DEFAULT_LIMIT = 6;
const KY_VIDEO_SHOWCASE_MAX_LIMIT = 50;
const KY_EMAIL_REQUIREMENT_SETTING_KEY = 'employee_email_required_positions';
const DEFAULT_KY_ADMIN_EMAIL = 'sattaya_w@thaisummit-harness.co.th';
const KY_DEFAULT_EMAIL_REQUIRED_POSITION_NAMES = [
    'ประธานกิตติมศักดิ์',
    'ผู้จัดการ',
    'ผู้จัดการทั่วไป',
    'ผู้ชำนาญการพิเศษ',
    'ผู้ช่วยผู้จัดการทั่วไป',
    'ผู้อำนวยการสายธุรกิจ Wiring Harness',
    'รักษาการผู้จัดการ',
    'หัวหน้าส่วน',
    'หัวหน้าแผนก',
];

function kyEmailLine(label, value) {
    return `${label}: ${value || '-'}`;
}

function kyEmailFooter() {
    return [
        '',
        '------------------------------------------------------------',
        'TSH Safety Core Activity System',
        'KY Ability / Kiken Yochi Activity Module',
        'อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ กรุณาอย่าตอบกลับอีเมลนี้',
    ].join('\n');
}

function getKyAdminEmail() {
    return (process.env.KY_ADMIN_EMAIL || process.env.HIYARI_ADMIN_EMAIL || process.env.ADMIN_EMAIL || DEFAULT_KY_ADMIN_EMAIL).trim();
}

function kyMailSubject(action, detail = '') {
    return `[KY Ability] ${action}${detail ? ` - ${detail}` : ''}`;
}

function kyCorporateMail({ subject, title, tone = 'neutral', greeting, intro, details, actions, note }) {
    const rendered = buildHiyariEmail({
        title,
        kicker: 'KY Ability / Kiken Yochi Activity',
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

function buildKySubmittedEmail(activity) {
    return kyCorporateMail({
        subject: kyMailSubject('ส่งกิจกรรมสำเร็จ', activity.Department || '-'),
        title: 'ระบบได้รับกิจกรรม KY ของท่านแล้ว',
        tone: 'pending',
        greeting: `เรียน คุณ${activity.ReporterName || 'ผู้รายงาน'}`,
        intro: [
            'ระบบได้รับกิจกรรม KY แล้ว และบันทึกเข้าสู่คิวให้ Safety Admin ตรวจสอบ',
            'ท่านสามารถติดตามสถานะได้ที่เมนู KY Ability > ประวัติกิจกรรม',
        ],
        details: [
            { label: 'เลขอ้างอิง', value: activity.id, highlight: true },
            { label: 'วันที่กิจกรรม', value: activity.ActivityDate },
            { label: 'ผู้รายงาน', value: activity.ReporterName, highlight: true },
            { label: 'แผนก', value: activity.Department },
            { label: 'Safety Unit', value: activity.SafetyUnit },
            { label: 'KYT Keyword', value: activity.KYTKeyword },
            { label: 'ประเภทความเสี่ยง', value: activity.RiskCategory },
            { label: 'สถานะ', value: 'Open / รอตรวจสอบ', highlight: true },
        ],
        actions: [
            'ติดตามสถานะรายการในหน้า KY Ability',
            'เตรียมข้อมูลเพิ่มเติมหาก Safety Admin ติดต่อขอรายละเอียด',
        ],
        note: activity.HazardDescription ? `หัวข้อความเสี่ยง: ${activity.HazardDescription}` : '',
    });
}

function buildKyAdminSubmittedEmail(activity) {
    return kyCorporateMail({
        subject: kyMailSubject('มีกิจกรรมใหม่รอตรวจสอบ', activity.Department || '-'),
        title: 'มีกิจกรรม KY ใหม่รอ Safety Admin ตรวจสอบ',
        tone: 'pending',
        greeting: 'เรียน ผู้ดูแลระบบความปลอดภัย',
        intro: [
            'ระบบได้รับกิจกรรม KY รายการใหม่แล้ว',
            'กรุณาตรวจสอบรายละเอียด ความถูกต้องของข้อมูล และอัปเดตสถานะ Reviewed หรือ Closed ตามขั้นตอน',
        ],
        details: [
            { label: 'เลขอ้างอิง', value: activity.id, highlight: true },
            { label: 'วันที่กิจกรรม', value: activity.ActivityDate },
            { label: 'ผู้รายงาน', value: activity.ReporterName, highlight: true },
            { label: 'รหัสพนักงาน', value: activity.ReporterID },
            { label: 'อีเมลผู้รายงาน', value: activity.ReporterEmail },
            { label: 'ผู้ส่งข้อมูล', value: activity.SubmittedByName },
            { label: 'แผนก', value: activity.Department },
            { label: 'Safety Unit', value: activity.SafetyUnit },
            { label: 'KYT Keyword', value: activity.KYTKeyword },
            { label: 'ประเภทความเสี่ยง', value: activity.RiskCategory },
            { label: 'สถานะ', value: 'Open / รอตรวจสอบ', highlight: true },
        ],
        actions: [
            'เปิดเมนู KY Ability > จัดการ เพื่อตรวจสอบรายการ',
            'อัปเดตสถานะเป็น Reviewed เมื่อทวนสอบแล้ว หรือ Closed เมื่อปิดงานครบถ้วน',
        ],
        note: activity.HazardDescription ? `รายละเอียดอันตราย: ${activity.HazardDescription}` : '',
    });
}

function buildKyReviewedEmail(activity) {
    return kyCorporateMail({
        subject: kyMailSubject('ตรวจสอบกิจกรรมแล้ว', activity.Department || '-'),
        title: 'Safety Admin ตรวจสอบกิจกรรม KY แล้ว',
        tone: 'approved',
        greeting: `เรียน คุณ${activity.ReporterName || 'ผู้รายงาน'}`,
        intro: [
            'Safety Admin ได้ตรวจสอบกิจกรรม KY ของท่านแล้ว',
            'รายการยังอาจรอ follow-up หรือปิดงานตามขั้นตอนของหน่วยงาน',
        ],
        details: [
            { label: 'เลขอ้างอิง', value: activity.id, highlight: true },
            { label: 'วันที่กิจกรรม', value: activity.ActivityDate },
            { label: 'ผู้รายงาน', value: activity.ReporterName },
            { label: 'แผนก', value: activity.Department },
            { label: 'Safety Unit', value: activity.SafetyUnit },
            { label: 'สถานะ', value: 'Reviewed / ตรวจสอบแล้ว', highlight: true },
            { label: 'ความคิดเห็น Admin', value: activity.AdminComment },
        ],
        actions: [
            'ตรวจสอบความคิดเห็นจาก Safety Admin',
            'ดำเนินการตาม countermeasure หรือข้อมูลติดตามที่เกี่ยวข้อง',
        ],
        note: 'หากข้อมูลไม่ถูกต้อง กรุณาประสาน Safety Admin เพื่อแก้ไขรายการ',
    });
}

function buildKyClosedEmail(activity) {
    return kyCorporateMail({
        subject: kyMailSubject('ปิดงานกิจกรรมแล้ว', activity.Department || '-'),
        title: 'กิจกรรม KY ได้รับการปิดงานแล้ว',
        tone: 'completed',
        greeting: `เรียน คุณ${activity.ReporterName || 'ผู้รายงาน'}`,
        intro: [
            'Safety Admin ได้ตรวจสอบและปิดงานกิจกรรม KY ของท่านแล้ว',
            'ขอบคุณสำหรับการมีส่วนร่วมในการค้นหาและป้องกันอันตรายเชิงรุก',
        ],
        details: [
            { label: 'เลขอ้างอิง', value: activity.id, highlight: true },
            { label: 'วันที่กิจกรรม', value: activity.ActivityDate },
            { label: 'ผู้รายงาน', value: activity.ReporterName },
            { label: 'แผนก', value: activity.Department },
            { label: 'Safety Unit', value: activity.SafetyUnit },
            { label: 'สถานะ', value: 'Closed / ปิดงานแล้ว', highlight: true },
            { label: 'ความคิดเห็น Admin', value: activity.AdminComment },
        ],
        actions: [
            'ไม่ต้องดำเนินการเพิ่มเติม เว้นแต่ Safety Admin ติดต่อขอข้อมูลเพิ่ม',
            'นำบทเรียนจากกิจกรรมไปสื่อสารภายในทีมตามความเหมาะสม',
        ],
        note: 'รายการที่ปิดแล้วจะยังอยู่ในประวัติกิจกรรม KY สำหรับตรวจสอบย้อนหลัง',
    });
}

function buildKyMissingSubmissionEmail(item) {
    const monthLabel = `${String(item.month).padStart(2, '0')}/${item.year}`;
    return kyCorporateMail({
        subject: kyMailSubject('แจ้งเตือนรายการยังไม่ส่ง', `${item.department || '-'} - ${monthLabel}`),
        title: 'แจ้งเตือนรายการ KY ยังไม่ส่งตามรอบ',
        tone: 'rejected',
        greeting: `เรียน ผู้รับผิดชอบ KY ${item.department || '-'}`,
        intro: [
            `ระบบตรวจพบว่ายังไม่มีรายการ KY สำหรับรอบ ${monthLabel} ตาม Program Config`,
            'กรุณาตรวจสอบและส่งกิจกรรม KY ในระบบเมื่อข้อมูลพร้อม',
        ],
        details: [
            { label: 'แผนก', value: item.department, highlight: true },
            { label: 'Safety Unit', value: item.safetyUnit },
            { label: 'รอบติดตาม', value: monthLabel },
            { label: 'กำหนดส่ง', value: item.deadlineLabel, highlight: true },
            { label: 'หมายเหตุ', value: item.deadlineNote },
        ],
        actions: [
            'ตรวจสอบกิจกรรม KY ของรอบที่แจ้งเตือน',
            'ส่งกิจกรรม KY ผ่านเมนู KY Ability > ส่งกิจกรรม KY',
            'ประสาน Safety Admin หาก Program Config หรือผู้รับผิดชอบไม่ถูกต้อง',
        ],
        note: 'อีเมลนี้ถูกส่งตาม Email Requirement Rules และข้อมูล CompanyEmail ใน Employee Master',
    });
}

async function queueKyEmail({ to, reportId, eventType, subject, body, html }) {
    const recipient = String(to || '').trim();
    if (!recipient) return { status: 'Skipped', recipient: null };
    const [insert] = await db.query(
        `INSERT INTO KY_EmailOutbox (ActivityID, EventType, Recipient, Subject, Body, HtmlBody, Status)
         VALUES (?, ?, ?, ?, ?, ?, 'Queued')`,
        [reportId || null, eventType || 'General', recipient, subject, body, html || null]
    ).catch(err => {
        console.error('[ky/email] queue failed:', err.message);
        return [null];
    });
    const outboxId = insert?.insertId;
    if (!smtpConfigured()) {
        console.log(`[ky/email queued] ${eventType || 'General'} -> ${recipient} | ${subject}`);
        return { status: 'Queued', recipient, outboxId };
    }
    try {
        await sendMail({ to: recipient, subject, text: body, html });
        if (outboxId) await db.query(`UPDATE KY_EmailOutbox SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?`, [outboxId]);
        return { status: 'Sent', recipient, outboxId };
    } catch (err) {
        if (outboxId) await db.query(`UPDATE KY_EmailOutbox SET Status='Failed', Error=? WHERE id=?`, [err.message, outboxId]).catch(() => {});
        console.error('[ky/email] send failed:', err.message);
        return { status: 'Failed', recipient, outboxId, error: err.message };
    }
}

function currentUserId(req) {
    return String(
        req.user?.employeeId ||
        req.user?.EmployeeID ||
        req.user?.EmployeeId ||
        req.user?.id ||
        req.user?.username ||
        req.user?.Username ||
        ''
    ).trim();
}

function isKyAdmin(req) {
    return String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin';
}

function parseSafetyUnits(value) {
    if (!value) return [];
    if (Array.isArray(value)) return [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return [...new Set(parsed.map(v => String(v || '').trim()).filter(Boolean))];
    } catch (_) {}
    return [...new Set(String(value).split(/[,;\r\n]+/).map(v => v.trim()).filter(Boolean))];
}

function kyNormKey(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function kyParticipantEmployeeIds(value) {
    const ids = new Set();
    const add = item => {
        if (item == null) return;
        if (typeof item === 'string' || typeof item === 'number') {
            const text = String(item).trim();
            if (/^[A-Za-z0-9._-]{2,30}$/.test(text) && /\d/.test(text)) ids.add(text);
            return;
        }
        if (typeof item !== 'object') return;
        const candidate = item.EmployeeID ?? item.employeeId ?? item.employeeID ?? item.id ?? item.ID ?? item.empId;
        if (candidate != null && String(candidate).trim()) ids.add(String(candidate).trim());
    };
    if (!value) return [];
    if (Array.isArray(value)) value.forEach(add);
    else {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) parsed.forEach(add);
            else if (parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.participants)) parsed.participants.forEach(add);
                else add(parsed);
            }
        } catch (_) {
            String(value).split(',').forEach(add);
        }
    }
    return [...ids];
}

function kyCanUploadFollowupVideoForUser(row, req) {
    const userId = currentUserId(req);
    const admin = isKyAdmin(req);
    if (admin) return true;
    if (!userId) return false;
    if ([row.ReporterID, row.SubmittedByID].some(id => String(id || '').trim() === userId)) return true;
    return kyParticipantEmployeeIds(row.Participants).some(id => String(id || '').trim() === userId);
}

function kyCanManageContestForScope(row, req) {
    if (kyCanUploadFollowupVideoForUser(row, req)) return true;
    const userDepartment = req.user?.department || req.user?.Department || '';
    const userUnit = req.user?.unit || req.user?.Unit || req.user?.safetyUnit || req.user?.SafetyUnit || '';
    if (!kyNormKey(userDepartment) || kyNormKey(userDepartment) !== kyNormKey(row.Department)) return false;
    return !kyNormKey(row.SafetyUnit) || kyNormKey(userUnit) === kyNormKey(row.SafetyUnit);
}

function kyVideoUploadDirectory(uploadId) {
    if (!/^[a-f0-9]{32}$/i.test(String(uploadId || ''))) return null;
    const target = path.resolve(KY_VIDEO_CHUNK_ROOT, uploadId);
    const root = `${path.resolve(KY_VIDEO_CHUNK_ROOT)}${path.sep}`;
    return target.startsWith(root) ? target : null;
}

function kyVideoManifestPath(uploadId) {
    const dir = kyVideoUploadDirectory(uploadId);
    return dir ? path.join(dir, 'manifest.json') : null;
}

function kyReadVideoManifest(uploadId) {
    const manifestPath = kyVideoManifestPath(uploadId);
    if (!manifestPath || !fs.existsSync(manifestPath)) return null;
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        return manifest && manifest.uploadId === uploadId ? manifest : null;
    } catch (_) {
        return null;
    }
}

function kyRemoveVideoUploadDirectory(uploadId) {
    const dir = kyVideoUploadDirectory(uploadId);
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function kyCleanupStaleVideoUploads() {
    const cutoff = Date.now() - KY_VIDEO_CHUNK_MAX_AGE_MS;
    for (const entry of fs.readdirSync(KY_VIDEO_CHUNK_ROOT, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^[a-f0-9]{32}$/i.test(entry.name)) continue;
        const dir = kyVideoUploadDirectory(entry.name);
        if (!dir) continue;
        try {
            if (fs.statSync(dir).mtimeMs < cutoff) kyRemoveVideoUploadDirectory(entry.name);
        } catch (_) {}
    }
}

function kyVideoPartPath(manifest, index) {
    const dir = kyVideoUploadDirectory(manifest?.uploadId);
    return dir ? path.join(dir, `${String(index).padStart(6, '0')}.part`) : null;
}

function kyVideoExpectedChunkSize(manifest, index) {
    const offset = index * manifest.chunkSize;
    return Math.min(manifest.chunkSize, manifest.fileSize - offset);
}

function kyVideoUploadConfig() {
    return {
        maxFileSize: KY_VIDEO_LIMIT,
        chunkSize: KY_VIDEO_CHUNK_SIZE,
        acceptedExtensions: [...KY_VIDEO_EXTENSIONS],
        acceptedMimeTypes: [...KY_VIDEO_MIME_TYPES],
        maxAttempts: KY_VIDEO_CHUNK_MAX_ATTEMPTS,
        requiresChunkSha256: true,
    };
}

function kyVideoFileHeaderIsValid(filePath, extension) {
    const handle = fs.openSync(filePath, 'r');
    try {
        const header = Buffer.alloc(16);
        const count = fs.readSync(handle, header, 0, header.length, 0);
        if (count < 4) return false;
        if (extension === 'avi') return header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'AVI ';
        if (extension === 'webm' || extension === 'mkv') return header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
        if (extension === 'mpeg' || extension === 'mpg') {
            return header[0] === 0x00 && header[1] === 0x00 && header[2] === 0x01 && (header[3] === 0xba || header[3] === 0xb3);
        }
        if (extension === 'mp4' || extension === 'mov') return count >= 12 && header.toString('ascii', 4, 8) === 'ftyp';
        return false;
    } finally {
        fs.closeSync(handle);
    }
}

function kyVideoPublicUrl(req, storedName, originalName) {
    const configured = String(process.env.PUBLIC_UPLOAD_BASE_URL || '').replace(/\/+$/, '');
    const base = configured || `${req.protocol}://${req.get('host')}`;
    return `${base}/uploads/${encodeURIComponent(storedName)}?filename=${encodeURIComponent(cleanOriginalFilename(originalName))}`;
}

async function kyLoadVideoUploadActivity(activityId) {
    const [rows] = await db.query(
        'SELECT id, ReporterID, SubmittedByID, Participants, VideoUrl, Status FROM KY_Activities WHERE id = ? LIMIT 1',
        [activityId]
    );
    return rows[0] || null;
}

function kyCheckVideoUploadAccess(row, req, manifest = null) {
    const userId = currentUserId(req);
    const admin = isKyAdmin(req);
    if (row?.VideoUrl) return { status: 409, code: 'KY_VIDEO_PROTECTED_BY_RETENTION', message: 'Confirm External Backup and remove the Production copy through Annual Video Evidence before replacing it.' };
    if (!row) return { status: 404, message: 'ไม่พบกิจกรรม KY' };
    if (!kyCanUploadFollowupVideoForUser(row, req)) return { status: 403, message: 'แนบวิดีโอได้เฉพาะเจ้าของรายการหรือ Admin' };
    if (manifest && (manifest.activityId !== row.id || manifest.initiatedBy !== userId)) {
        return { status: 403, message: 'ไม่สามารถใช้งานชุดอัปโหลดนี้ได้' };
    }
    return { userId, admin };
}

function kyMediaHealthStatus(rawUrl, field) {
    const url = String(rawUrl || '').trim();
    const empty = {
        field,
        url: '',
        scope: 'empty',
        status: 'empty',
        storedName: '',
        originalName: '',
        extension: '',
        size: null,
        modifiedAt: null,
        diskPath: null,
    };
    if (!url) return empty;

    let parsed = null;
    try {
        parsed = new URL(url, 'https://placeholder.local');
    } catch (_) {}

    const pathname = parsed?.pathname || url.split('?')[0] || '';
    const host = (parsed?.hostname || '').toLowerCase();
    const isLegacyLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isUpload = pathname.includes('/uploads/');
    const storedName = isUpload ? path.basename(decodeURIComponent(pathname)) : '';
    const originalName = parsed?.searchParams?.get('filename') || storedName;
    const extension = storedName ? path.extname(storedName).replace(/^\./, '').toLowerCase() : '';
    let diskPath = null;
    let stats = null;
    if (isUpload && storedName) {
        const candidate = path.join(uploadsDir, storedName);
        if (candidate.startsWith(uploadsDir) && fs.existsSync(candidate)) {
            diskPath = candidate;
            stats = fs.statSync(candidate);
        }
    }
    const scope = isUpload ? (isLegacyLocalhost ? 'legacy-localhost' : 'local') : 'external';
    const status = isLegacyLocalhost
        ? (stats ? 'legacy-localhost' : 'missing')
        : (isUpload ? (stats ? 'ok' : 'missing') : 'external');
    return {
        field,
        url,
        scope,
        status,
        storedName,
        originalName,
        extension,
        size: stats?.size ?? null,
        modifiedAt: stats ? stats.mtime.toISOString() : null,
        diskPath: diskPath ? path.basename(diskPath) : null,
    };
}

function kyPublicBaseUrl(req) {
    const configured = String(process.env.PUBLIC_UPLOAD_BASE_URL || process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || '').replace(/\/+$/, '');
    if (configured) return configured;
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('x-forwarded-host') || req.get('host') || '';
    return `${proto}://${host}`.replace(/\/+$/, '');
}

function kyPublicBaseUrlIsSafe(baseUrl) {
    try {
        const host = new URL(baseUrl).hostname.toLowerCase();
        return Boolean(host) && !['localhost', '127.0.0.1', '::1'].includes(host);
    } catch (_) {
        return false;
    }
}

function kyLegacyUploadRewrite(rawUrl, req) {
    const health = kyMediaHealthStatus(rawUrl, '');
    if (health.scope !== 'legacy-localhost' || health.status !== 'legacy-localhost' || !health.storedName) return null;
    let parsed;
    try {
        parsed = new URL(String(rawUrl || ''), 'https://placeholder.local');
    } catch (_) {
        return null;
    }
    const nextUrl = `${kyPublicBaseUrl(req)}/uploads/${encodeURIComponent(health.storedName)}${parsed.search || ''}`;
    return { ...health, nextUrl };
}

async function getKyReminderRequiredPositions() {
    const [positionRows] = await db.query('SELECT id, Name FROM Master_Positions ORDER BY Name ASC');
    const [settingRows] = await db.query(
        `SELECT value FROM App_Settings WHERE key_name = ? LIMIT 1`,
        [KY_EMAIL_REQUIREMENT_SETTING_KEY]
    ).catch(() => [[]]);
    let selectedIds = [];
    try {
        const raw = JSON.parse(settingRows[0]?.value || 'null');
        const ids = Array.isArray(raw) ? raw : raw?.positionIds;
        selectedIds = Array.isArray(ids)
            ? ids.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)
            : [];
    } catch (_) {}
    const selected = new Set(selectedIds);
    const usesSavedRule = Boolean(settingRows.length);
    return positionRows
        .filter(position => usesSavedRule
            ? selected.has(Number(position.id))
            : KY_DEFAULT_EMAIL_REQUIRED_POSITION_NAMES.includes(String(position.Name || '').trim()))
        .map(position => String(position.Name || '').trim())
        .filter(Boolean);
}

function kyReminderKey(item) {
    return `${item.year}|${item.month}|${item.department}|${item.safetyUnit || ''}`;
}

async function buildKyReminderQueue(year, month) {
    await ensureEmployeeCompanyEmailColumn(db);
    const [configRows, activityRows, employeeRows, requiredPositions] = await Promise.all([
        db.query(
            `SELECT Department, SafetyUnits, DeadlineDay, DeadlineNote
             FROM KY_Program_Config
             WHERE Year = ? AND IsActive = 1
             ORDER BY Department`,
            [year]
        ).then(([rows]) => rows),
        db.query(
            `SELECT DISTINCT Department, COALESCE(SafetyUnit, '') AS SafetyUnit
             FROM KY_Activities
             WHERE YEAR(ActivityDate) = ? AND MONTH(ActivityDate) = ?`,
            [year, month]
        ).then(([rows]) => rows),
        db.query(
            `SELECT EmployeeID, EmployeeName, Department, Unit, Position, CompanyEmail
             FROM Employees
             ORDER BY Department, Unit, Position, EmployeeName`
        ).then(([rows]) => rows),
        getKyReminderRequiredPositions(),
    ]);
    const requiredPositionSet = new Set(requiredPositions);
    const submittedScopes = new Set(activityRows.map(row =>
        `${String(row.Department || '').trim()}||${String(row.SafetyUnit || '').trim()}`
    ));
    const submittedDepts = new Set(activityRows.map(row => String(row.Department || '').trim()));
    const requiredEmployees = employeeRows.filter(employee =>
        requiredPositionSet.has(String(employee.Position || '').trim())
    );

    const rows = [];
    configRows.forEach(config => {
        const department = String(config.Department || '').trim();
        const safetyUnits = parseSafetyUnits(config.SafetyUnits);
        const scopes = safetyUnits.length ? safetyUnits : [''];
        scopes.forEach(safetyUnit => {
            const submitted = safetyUnit
                ? submittedScopes.has(`${department}||${safetyUnit}`)
                : submittedDepts.has(department);
            if (submitted) return;

            const departmentCandidates = requiredEmployees.filter(employee =>
                String(employee.Department || '').trim() === department
            );
            const unitCandidates = safetyUnit
                ? departmentCandidates.filter(employee => String(employee.Unit || '').trim() === safetyUnit)
                : [];
            const candidates = unitCandidates.length ? unitCandidates : departmentCandidates;
            const candidateScope = unitCandidates.length ? 'unit' : 'department';
            const readyRecipients = [];
            const missingEmail = [];
            const invalidEmail = [];
            candidates.forEach(employee => {
                const check = validateCompanyEmail(employee.CompanyEmail);
                if (!String(employee.CompanyEmail || '').trim()) missingEmail.push(employee);
                else if (!check.ok) invalidEmail.push(employee);
                else readyRecipients.push({ ...employee, CompanyEmail: check.email });
            });
            const uniqueRecipients = [];
            const recipientEmailSet = new Set();
            readyRecipients.forEach(employee => {
                if (recipientEmailSet.has(employee.CompanyEmail)) return;
                recipientEmailSet.add(employee.CompanyEmail);
                uniqueRecipients.push(employee);
            });
            let readiness = 'ready';
            let reason = '';
            if (!requiredPositions.length) {
                readiness = 'rule_not_configured';
                reason = 'Email Requirement Rules ยังไม่มีตำแหน่งสำหรับใช้ติดตาม KY';
            } else if (!candidates.length) {
                readiness = 'no_responsible_employee';
                reason = 'ไม่พบพนักงานในแผนกที่ตำแหน่งอยู่ใน Email Requirement Rules';
            } else if (!uniqueRecipients.length) {
                readiness = invalidEmail.length ? 'invalid_email' : 'missing_email';
                reason = invalidEmail.length
                    ? 'พบผู้รับผิดชอบ แต่อีเมลไม่ผ่านกติกาโดเมนบริษัท'
                    : 'พบผู้รับผิดชอบ แต่ยังไม่ได้กรอก CompanyEmail';
            }
            const deadlineDay = Number(config.DeadlineDay || 0);
            rows.push({
                key: kyReminderKey({ year, month, department, safetyUnit }),
                year,
                month,
                department,
                safetyUnit: safetyUnit || null,
                deadlineDay: deadlineDay || null,
                deadlineLabel: deadlineDay ? `วันที่ ${deadlineDay} ของเดือน` : null,
                deadlineNote: config.DeadlineNote || null,
                candidateScope,
                readiness,
                reason,
                recipients: uniqueRecipients.map(employee => ({
                    EmployeeID: employee.EmployeeID,
                    EmployeeName: employee.EmployeeName,
                    Position: employee.Position,
                    Unit: employee.Unit,
                    CompanyEmail: employee.CompanyEmail,
                })),
                reviewCandidates: candidates.map(employee => ({
                    EmployeeID: employee.EmployeeID,
                    EmployeeName: employee.EmployeeName,
                    Position: employee.Position,
                    Unit: employee.Unit,
                    CompanyEmail: String(employee.CompanyEmail || '').trim() || null,
                })),
            });
        });
    });

    return {
        year,
        month,
        requiredPositions,
        summary: {
            total: rows.length,
            ready: rows.filter(row => row.readiness === 'ready').length,
            blocked: rows.filter(row => row.readiness !== 'ready').length,
            recipients: rows.reduce((sum, row) => sum + row.recipients.length, 0),
        },
        rows,
        smtpConfigured: smtpConfigured(),
    };
}

function deleteUploadedKyFiles(req) {
    Object.values(req.files || {}).flat().forEach(file => deleteLocalUpload(file?.path));
}

function kyUploadErrorMessage(err) {
    if (err?.code === 'LIMIT_FILE_SIZE') return 'ไฟล์มีขนาดเกินกำหนด วิดีโอรองรับไม่เกิน 200 MB';
    return err?.message || 'อัปโหลดไฟล์ KY ไม่สำเร็จ';
}

function handleKyUpload(req, res, next) {
    uploadCombined.fields([
        { name: 'attachment', maxCount: 1 },
        { name: 'video',      maxCount: 1 },
    ])(req, res, (err) => {
        if (err) {
            deleteUploadedKyFiles(req);
            console.error('[ky upload error]', err.message || err);
            return res.status(400).json({ success: false, message: kyUploadErrorMessage(err) });
        }

        const attachment = req.files?.attachment?.[0];
        if (attachment && attachment.size > KY_ATTACHMENT_LIMIT) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({
                success: false,
                message: 'ไฟล์แนบภาพหรือเอกสารมีขนาดเกิน 20 MB',
            });
        }

        next();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE TABLES
// ─────────────────────────────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Activities (
            id                 VARCHAR(36)  NOT NULL PRIMARY KEY,
            ActivityDate       DATE         NOT NULL,
            ReporterID         VARCHAR(50)  NOT NULL,
            ReporterName       VARCHAR(100) NOT NULL,
            ReporterEmail      VARCHAR(150),
            SubmittedByID      VARCHAR(50),
            SubmittedByName    VARCHAR(100),
            Department         VARCHAR(100) NOT NULL,
            SafetyUnit         VARCHAR(100),
            TeamName           VARCHAR(100),
            Participants       TEXT,
            KYTKeyword         VARCHAR(255),
            RiskCategory       VARCHAR(50)  DEFAULT 'ทั่วไป',
            HazardDescription  TEXT         NOT NULL,
            Countermeasure     TEXT,
            AttachmentUrl      TEXT,
            VideoUrl           TEXT,
            Status             VARCHAR(20)  NOT NULL DEFAULT 'Open',
            AdminComment       TEXT,
            CreatedAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_dept_ym (Department, ActivityDate),
            KEY idx_status (Status),
            KEY idx_date (ActivityDate)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Program_Config (
            id           INT          AUTO_INCREMENT PRIMARY KEY,
            Year         INT          NOT NULL,
            Department   VARCHAR(100) NOT NULL,
            SafetyUnits  TEXT         DEFAULT NULL,
            YearlyTarget INT          NOT NULL DEFAULT 12,
            DeadlineDay  TINYINT      DEFAULT 15,
            DeadlineNote VARCHAR(255) DEFAULT NULL,
            IsActive     TINYINT(1)   NOT NULL DEFAULT 1,
            CreatedBy    VARCHAR(50),
            CreatedAt    DATETIME     DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_year (Year),
            UNIQUE KEY uq_ky_program_year_dept (Year, Department),
            KEY idx_year_dept (Year, Department)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Keep the newest legacy config row before enforcing one config per department/year.
    await db.query(`
        DELETE older
        FROM KY_Program_Config older
        INNER JOIN KY_Program_Config newer
            ON older.Year = newer.Year
           AND older.Department = newer.Department
           AND older.id < newer.id
    `);
    try {
        await db.query(`ALTER TABLE KY_Program_Config ADD UNIQUE KEY uq_ky_program_year_dept (Year, Department)`);
    } catch (_) {}
    try {
        await db.query(`ALTER TABLE KY_Activities ADD COLUMN ReporterEmail VARCHAR(150) NULL AFTER ReporterName`);
    } catch (_) {}
    try {
        await db.query(`ALTER TABLE KY_Activities ADD COLUMN SubmittedByID VARCHAR(50) NULL AFTER ReporterName`);
    } catch (_) {}
    try {
        await db.query(`ALTER TABLE KY_Activities ADD COLUMN SubmittedByName VARCHAR(100) NULL AFTER SubmittedByID`);
    } catch (_) {}
    try {
        await db.query(`ALTER TABLE KY_Activities ADD COLUMN SafetyUnit VARCHAR(100) NULL AFTER Department`);
    } catch (_) {}
    try {
        await db.query(`ALTER TABLE KY_Activities ADD COLUMN ShowVideoOnDashboard TINYINT(1) NOT NULL DEFAULT 1 AFTER VideoUrl`);
    } catch (_) {}
    try {
        await db.query(`ALTER TABLE KY_Activities ADD COLUMN IsVideoPinned TINYINT(1) NOT NULL DEFAULT 0 AFTER ShowVideoOnDashboard`);
    } catch (_) {}

    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Video_Reactions (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            ActivityID  VARCHAR(36) NOT NULL,
            EmployeeID  VARCHAR(50) NOT NULL,
            Reaction    VARCHAR(30) NOT NULL,
            CreatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_ky_video_reaction_user (ActivityID, EmployeeID),
            KEY idx_activity (ActivityID),
            KEY idx_reaction (Reaction)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_EmailOutbox (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            ActivityID  VARCHAR(36),
            EventType   VARCHAR(60) NOT NULL,
            Recipient   VARCHAR(180) NOT NULL,
            Subject     VARCHAR(255) NOT NULL,
            Body        MEDIUMTEXT,
            HtmlBody    MEDIUMTEXT,
            Status      VARCHAR(20) NOT NULL DEFAULT 'Queued',
            Error       TEXT,
            CreatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            SentAt      DATETIME NULL,
            KEY idx_activity (ActivityID),
            KEY idx_status (Status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query('ALTER TABLE KY_EmailOutbox ADD COLUMN HtmlBody MEDIUMTEXT AFTER Body').catch(() => {});

    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Annual_Video_Evidence (
            id                         VARCHAR(36) NOT NULL PRIMARY KEY,
            EvidenceYear               SMALLINT NOT NULL,
            ScopeKey                   VARCHAR(220) NOT NULL,
            Department                 VARCHAR(100) NOT NULL,
            SafetyUnit                 VARCHAR(100) NULL,
            ActivityID                 VARCHAR(36) NULL,
            StorageMode                VARCHAR(30) NOT NULL,
            ExternalBackupConfirmed    TINYINT(1) NOT NULL DEFAULT 0,
            ExternalReference          TEXT NULL,
            OriginalFileName           VARCHAR(255) NOT NULL,
            MimeType                   VARCHAR(120) NULL,
            FileSize                   BIGINT UNSIGNED NOT NULL DEFAULT 0,
            SHA256                     CHAR(64) NOT NULL,
            ProductionVideoUrl         TEXT NULL,
            ProductionStoredName       VARCHAR(255) NULL,
            Status                     VARCHAR(30) NOT NULL DEFAULT 'Pending',
            DeclaredByID               VARCHAR(50) NULL,
            DeclaredByName             VARCHAR(100) NULL,
            DeclaredAt                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            VerifiedByID               VARCHAR(50) NULL,
            VerifiedByName             VARCHAR(100) NULL,
            VerifiedAt                 DATETIME NULL,
            VerificationNote           TEXT NULL,
            ProductionDeletedByID      VARCHAR(50) NULL,
            ProductionDeletedByName    VARCHAR(100) NULL,
            ProductionDeletedAt        DATETIME NULL,
            ProductionDeletionReason   TEXT NULL,
            RowVersion                 INT UNSIGNED NOT NULL DEFAULT 1,
            CreatedAt                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_ky_annual_video_scope (EvidenceYear, ScopeKey),
            KEY idx_ky_annual_video_activity (ActivityID),
            KEY idx_ky_annual_video_status (EvidenceYear, Status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Annual_Video_Evidence_Audit (
            id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            EvidenceID     VARCHAR(36) NOT NULL,
            ActivityID     VARCHAR(36) NULL,
            Action         VARCHAR(80) NOT NULL,
            ActorID        VARCHAR(50) NULL,
            ActorName      VARCHAR(100) NULL,
            BeforeJson     LONGTEXT NULL,
            AfterJson      LONGTEXT NULL,
            Detail         TEXT NULL,
            CreatedAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_ky_annual_video_audit_evidence (EvidenceID, CreatedAt),
            KEY idx_ky_annual_video_audit_action (Action, CreatedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Video_File_Inventory (
            id                         VARCHAR(36) NOT NULL PRIMARY KEY,
            EvidenceYear               SMALLINT NOT NULL,
            ActivityID                 VARCHAR(36) NOT NULL,
            Department                 VARCHAR(100) NOT NULL,
            SafetyUnit                 VARCHAR(100) NULL,
            ExternalBackupConfirmed    TINYINT(1) NOT NULL DEFAULT 0,
            ExternalReference          TEXT NULL,
            OriginalFileName           VARCHAR(255) NOT NULL,
            MimeType                   VARCHAR(120) NULL,
            FileSize                   BIGINT UNSIGNED NOT NULL DEFAULT 0,
            SHA256                     CHAR(64) NOT NULL,
            ProductionVideoUrl         TEXT NULL,
            ProductionStoredName       VARCHAR(255) NULL,
            Status                     VARCHAR(30) NOT NULL DEFAULT 'Pending',
            DeclaredByID               VARCHAR(50) NULL,
            DeclaredByName             VARCHAR(100) NULL,
            DeclaredAt                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            VerifiedByID               VARCHAR(50) NULL,
            VerifiedByName             VARCHAR(100) NULL,
            VerifiedAt                 DATETIME NULL,
            VerificationNote           TEXT NULL,
            ProductionDeletedByID      VARCHAR(50) NULL,
            ProductionDeletedByName    VARCHAR(100) NULL,
            ProductionDeletedAt        DATETIME NULL,
            ProductionDeletionReason   TEXT NULL,
            RowVersion                 INT UNSIGNED NOT NULL DEFAULT 1,
            CreatedAt                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_ky_video_inventory_activity (ActivityID),
            KEY idx_ky_video_inventory_status (EvidenceYear, Status),
            KEY idx_ky_video_inventory_department (EvidenceYear, Department, SafetyUnit)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Video_File_Inventory_Audit (
            id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            InventoryID    VARCHAR(36) NOT NULL,
            ActivityID     VARCHAR(36) NOT NULL,
            Action         VARCHAR(80) NOT NULL,
            ActorID        VARCHAR(50) NULL,
            ActorName      VARCHAR(100) NULL,
            BeforeJson     LONGTEXT NULL,
            AfterJson      LONGTEXT NULL,
            Detail         TEXT NULL,
            CreatedAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_ky_video_inventory_audit (InventoryID, CreatedAt),
            KEY idx_ky_video_inventory_audit_action (Action, CreatedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Activity_External_Video_Evidence (
            id                 VARCHAR(36) NOT NULL PRIMARY KEY,
            EvidenceYear       SMALLINT NOT NULL,
            ActivityID         VARCHAR(36) NOT NULL,
            Department         VARCHAR(100) NOT NULL,
            SafetyUnit         VARCHAR(100) NULL,
            ExternalReference  TEXT NOT NULL,
            OriginalFileName   VARCHAR(255) NOT NULL,
            MimeType           VARCHAR(120) NULL,
            FileSize           BIGINT UNSIGNED NOT NULL DEFAULT 0,
            SHA256             CHAR(64) NOT NULL,
            Status             VARCHAR(30) NOT NULL DEFAULT 'Pending',
            DeclaredByID       VARCHAR(50) NULL,
            DeclaredByName     VARCHAR(100) NULL,
            DeclaredAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            VerifiedByID       VARCHAR(50) NULL,
            VerifiedByName     VARCHAR(100) NULL,
            VerifiedAt         DATETIME NULL,
            VerificationNote   TEXT NULL,
            RowVersion         INT UNSIGNED NOT NULL DEFAULT 1,
            CreatedAt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_ky_activity_external_video (ActivityID),
            KEY idx_ky_activity_external_status (EvidenceYear, Status),
            KEY idx_ky_activity_external_scope (EvidenceYear, Department, SafetyUnit)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Activity_External_Video_Evidence_Audit (
            id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            EvidenceID  VARCHAR(36) NOT NULL,
            ActivityID  VARCHAR(36) NOT NULL,
            Action      VARCHAR(80) NOT NULL,
            ActorID     VARCHAR(50) NULL,
            ActorName   VARCHAR(100) NULL,
            BeforeJson  LONGTEXT NULL,
            AfterJson   LONGTEXT NULL,
            Detail      TEXT NULL,
            CreatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_ky_activity_external_audit (EvidenceID, CreatedAt),
            KEY idx_ky_activity_external_action (Action, CreatedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Annual_Unit_Contest_Entries (
            id              VARCHAR(36) NOT NULL PRIMARY KEY,
            EntryYear       SMALLINT NOT NULL,
            ScopeKey        VARCHAR(220) NOT NULL,
            Department      VARCHAR(100) NOT NULL,
            SafetyUnit      VARCHAR(100) NULL,
            ActivityID      VARCHAR(36) NOT NULL,
            Status          VARCHAR(30) NOT NULL DEFAULT 'Submitted',
            SubmittedByID   VARCHAR(50) NULL,
            SubmittedByName VARCHAR(100) NULL,
            SubmittedAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedByID     VARCHAR(50) NULL,
            UpdatedByName   VARCHAR(100) NULL,
            RowVersion      INT UNSIGNED NOT NULL DEFAULT 1,
            CreatedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_ky_contest_year_scope (EntryYear, ScopeKey),
            KEY idx_ky_contest_activity (ActivityID),
            KEY idx_ky_contest_status (EntryYear, Status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS KY_Annual_Unit_Contest_Entry_Audit (
            id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            EntryID     VARCHAR(36) NOT NULL,
            ActivityID  VARCHAR(36) NULL,
            Action      VARCHAR(80) NOT NULL,
            ActorID     VARCHAR(50) NULL,
            ActorName   VARCHAR(100) NULL,
            BeforeJson  LONGTEXT NULL,
            AfterJson   LONGTEXT NULL,
            Detail      TEXT NULL,
            CreatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_ky_contest_audit_entry (EntryID, CreatedAt),
            KEY idx_ky_contest_audit_activity (ActivityID, CreatedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    tablesReady = true;
}

function kyAnnualScopeKey(department, safetyUnit) {
    return `${kyNormKey(department)}||${kyNormKey(safetyUnit) || '__department__'}`.slice(0, 220);
}

function kyAnnualComplianceState(yearlyTarget, productionVideo, verifiedExternalVideo, pendingExternalVideo = 0) {
    const target = Math.max(0, Number(yearlyTarget || 0));
    const production = Math.max(0, Number(productionVideo || 0));
    const externalVerified = Math.max(0, Number(verifiedExternalVideo || 0));
    const externalPending = Math.max(0, Number(pendingExternalVideo || 0));
    const productionRequired = target > 0 ? 1 : 0;
    const externalRequired = Math.max(0, target - productionRequired);
    const evidenceTotal = production + externalVerified;
    const missingProduction = Math.max(0, productionRequired - production);
    const missingExternal = Math.max(0, externalRequired - externalVerified);
    // A surplus of one evidence type cannot replace the other requirement.
    // This is the number of additional distinct Activities still needed for compliance.
    const missingEvidenceTotal = missingProduction + missingExternal;
    return {
        yearlyTarget: target,
        productionRequired,
        externalRequired,
        evidenceTotal,
        pendingExternalVideo: externalPending,
        missingProduction,
        missingExternal,
        missingEvidenceTotal,
        annualCompliant: missingProduction === 0 && missingExternal === 0 && missingEvidenceTotal === 0,
        evidenceProgressPct: target > 0 ? Math.min(100, Math.round((evidenceTotal / target) * 100)) : 100,
    };
}

async function kyContestAudit(connection, req, action, before, after, detail = '') {
    const row = after || before || {};
    await connection.query(
        `INSERT INTO KY_Annual_Unit_Contest_Entry_Audit
         (EntryID,ActivityID,Action,ActorID,ActorName,BeforeJson,AfterJson,Detail)
         VALUES (?,?,?,?,?,?,?,?)`,
        [row.id, row.ActivityID || null, action, currentUserId(req) || null,
            req.user?.name || req.user?.EmployeeName || req.user?.username || 'User',
            before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, detail || null]
    );
}

async function kyActiveContestEntry(connection, activityId, lock = false) {
    const [rows] = await connection.query(
        `SELECT * FROM KY_Annual_Unit_Contest_Entries
         WHERE ActivityID=? AND Status='Submitted' LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [activityId]
    );
    return rows[0] || null;
}

function kyAnnualEvidencePublic(row) {
    return {
        ...row,
        ExternalBackupConfirmed: Boolean(Number(row.ExternalBackupConfirmed || 0)),
        fileDeleted: Boolean(row.ProductionDeletedAt),
        canDeleteProductionFile: row.Status === 'Verified'
            && row.StorageMode === 'CentralMachine'
            && Boolean(Number(row.ExternalBackupConfirmed || 0))
            && Boolean(String(row.ExternalReference || '').trim())
            && /^[a-f0-9]{64}$/i.test(String(row.SHA256 || ''))
            && Boolean(String(row.ProductionVideoUrl || '').trim())
            && !row.ProductionDeletedAt
            && !row.ContestEntryID,
        contestRetentionHold: Boolean(row.ContestEntryID),
    };
}

function kyVideoInventoryPublic(row) {
    const registered = Boolean(row?.InventoryID || row?.id);
    const status = registered ? String(row.Status || 'Pending') : 'Unregistered';
    const productionVideoUrl = String(row.CurrentVideoUrl || row.ProductionVideoUrl || '').trim();
    let productionOriginalFileName = String(row.ProductionStoredName || '').trim();
    if (!productionOriginalFileName && productionVideoUrl) {
        const cleanPath = productionVideoUrl.split(/[?#]/, 1)[0].replace(/\\/g, '/');
        try { productionOriginalFileName = decodeURIComponent(path.posix.basename(cleanPath)); }
        catch (_) { productionOriginalFileName = path.posix.basename(cleanPath); }
    }
    const deleted = Boolean(row.ProductionDeletedAt);
    return {
        ...row,
        id: row.InventoryID || row.id || null,
        registered,
        Status: status,
        ProductionVideoUrl: productionVideoUrl || row.ProductionVideoUrl || null,
        ProductionOriginalFileName: productionOriginalFileName || row.OriginalFileName || null,
        ExternalBackupConfirmed: Boolean(Number(row.ExternalBackupConfirmed || 0)),
        fileDeleted: deleted,
        contestRetentionHold: Boolean(row.ContestEntryID),
        canDeleteProductionFile: registered
            && status === 'Verified'
            && Boolean(Number(row.ExternalBackupConfirmed || 0))
            && Boolean(String(row.ExternalReference || '').trim())
            && /^[a-f0-9]{64}$/i.test(String(row.SHA256 || ''))
            && Boolean(productionVideoUrl)
            && !deleted
            && !row.ContestEntryID,
    };
}

function kyActivityExternalVideoPublic(row) {
    return {
        ...row,
        id: row?.EvidenceID || row?.id || null,
        Status: String(row?.Status || 'Pending'),
        hasValidMetadata: Boolean(String(row?.ExternalReference || '').trim())
            && Boolean(String(row?.OriginalFileName || '').trim())
            && Number(row?.FileSize || 0) > 0
            && /^[a-f0-9]{64}$/i.test(String(row?.SHA256 || '')),
    };
}

async function kyActivityExternalVideoAudit(connection, req, action, before, after, detail = '') {
    const row = after || before || {};
    await connection.query(
        `INSERT INTO KY_Activity_External_Video_Evidence_Audit
         (EvidenceID,ActivityID,Action,ActorID,ActorName,BeforeJson,AfterJson,Detail)
         VALUES (?,?,?,?,?,?,?,?)`,
        [row.id, row.ActivityID, action, currentUserId(req) || null,
            req.user?.name || req.user?.EmployeeName || req.user?.username || 'User',
            before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, detail || null]
    );
}

async function kyVideoInventoryAudit(connection, req, action, before, after, detail = '') {
    const row = after || before || {};
    await connection.query(
        `INSERT INTO KY_Video_File_Inventory_Audit
         (InventoryID, ActivityID, Action, ActorID, ActorName, BeforeJson, AfterJson, Detail)
         VALUES (?,?,?,?,?,?,?,?)`,
        [row.id, row.ActivityID, action, currentUserId(req) || null,
            req.user?.name || req.user?.EmployeeName || req.user?.username || 'Admin',
            before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, detail || null]
    );
}

function kyAnnualLocalVideo(rawUrl) {
    const health = kyMediaHealthStatus(rawUrl, 'VideoUrl');
    if (health.status !== 'ok' || !health.storedName) return null;
    const target = path.resolve(uploadsDir, health.storedName);
    const root = `${path.resolve(uploadsDir)}${path.sep}`;
    return target.startsWith(root) && fs.existsSync(target) ? target : null;
}

function kyFileSha256(filePath) {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

async function kyAnnualAudit(connection, req, action, before, after, detail = '') {
    const evidence = after || before || {};
    await connection.query(
        `INSERT INTO KY_Annual_Video_Evidence_Audit
         (EvidenceID, ActivityID, Action, ActorID, ActorName, BeforeJson, AfterJson, Detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            evidence.id,
            evidence.ActivityID || null,
            action,
            currentUserId(req) || null,
            req.user?.name || req.user?.EmployeeName || req.user?.username || 'Admin',
            before ? JSON.stringify(before) : null,
            after ? JSON.stringify(after) : null,
            detail || null,
        ]
    );
}

async function kyAnnualEvidenceRows(year) {
    const [rows] = await db.query(
        `SELECT e.*, a.ActivityDate, a.TeamName, a.KYTKeyword, a.ReporterName, ce.id AS ContestEntryID
         FROM KY_Annual_Video_Evidence e
         LEFT JOIN KY_Activities a ON a.id = e.ActivityID
         LEFT JOIN KY_Annual_Unit_Contest_Entries ce ON ce.ActivityID=e.ActivityID AND ce.Status='Submitted'
         WHERE e.EvidenceYear = ?
         ORDER BY e.Department, COALESCE(e.SafetyUnit, ''), e.UpdatedAt DESC`,
        [year]
    );
    return rows.map(kyAnnualEvidencePublic);
}

function kyProductionVideoSql(alias = 'a') {
    return `COALESCE(TRIM(${alias}.VideoUrl), '') <> ''`;
}

function kyVerifiedExternalVideoSql(alias = 'a') {
    return `(EXISTS (
        SELECT 1 FROM KY_Activity_External_Video_Evidence aev
        WHERE aev.ActivityID = ${alias}.id
          AND aev.Status = 'Verified'
          AND COALESCE(TRIM(aev.ExternalReference), '') <> ''
          AND aev.SHA256 REGEXP '^[0-9a-fA-F]{64}$'
    ) OR EXISTS (
        SELECT 1 FROM KY_Annual_Video_Evidence ave
        WHERE ave.ActivityID = ${alias}.id
          AND ave.StorageMode = 'CentralMachine'
          AND ave.Status = 'Verified'
          AND ave.ExternalBackupConfirmed = 1
          AND COALESCE(TRIM(ave.ExternalReference), '') <> ''
          AND ave.SHA256 REGEXP '^[0-9a-fA-F]{64}$'
    ) OR EXISTS (
        SELECT 1 FROM KY_Video_File_Inventory inv
        WHERE inv.ActivityID = ${alias}.id
          AND inv.Status = 'Verified'
          AND inv.ExternalBackupConfirmed = 1
          AND COALESCE(TRIM(inv.ExternalReference), '') <> ''
          AND inv.SHA256 REGEXP '^[0-9a-fA-F]{64}$'
    ))`;
}

function kyPendingExternalVideoSql(alias = 'a') {
    return `(EXISTS (
        SELECT 1 FROM KY_Activity_External_Video_Evidence aev
        WHERE aev.ActivityID = ${alias}.id
          AND aev.Status IN ('Pending', 'NeedsCorrection')
          AND COALESCE(TRIM(aev.ExternalReference), '') <> ''
          AND aev.SHA256 REGEXP '^[0-9a-fA-F]{64}$'
    ) OR EXISTS (
        SELECT 1 FROM KY_Annual_Video_Evidence ave
        WHERE ave.ActivityID = ${alias}.id
          AND ave.StorageMode = 'CentralMachine'
          AND ave.Status IN ('Pending', 'NeedsCorrection')
          AND ave.ExternalBackupConfirmed = 1
          AND COALESCE(TRIM(ave.ExternalReference), '') <> ''
          AND ave.SHA256 REGEXP '^[0-9a-fA-F]{64}$'
    ) OR EXISTS (
        SELECT 1 FROM KY_Video_File_Inventory inv
        WHERE inv.ActivityID = ${alias}.id
          AND inv.Status IN ('Pending', 'NeedsCorrection')
          AND inv.ExternalBackupConfirmed = 1
          AND COALESCE(TRIM(inv.ExternalReference), '') <> ''
          AND inv.SHA256 REGEXP '^[0-9a-fA-F]{64}$'
    ))`;
}

function kyVideoEvidenceSql(alias = 'a') {
    return `(${kyProductionVideoSql(alias)} OR ${kyVerifiedExternalVideoSql(alias)})`;
}

function kyVideoEvidenceSelectSql(alias = 'a') {
    const production = kyProductionVideoSql(alias);
    const verifiedExternal = kyVerifiedExternalVideoSql(alias);
    const pendingExternal = kyPendingExternalVideoSql(alias);
    return `
        (${production}) AS HasProductionVideo,
        (${verifiedExternal}) AS HasVerifiedExternalVideo,
        (${pendingExternal}) AS HasPendingExternalVideo,
        (${production} OR ${verifiedExternal}) AS HasVideoEvidence,
        CASE
            WHEN ${production} THEN 'Production'
            WHEN ${verifiedExternal} THEN 'ExternalVerified'
            WHEN ${pendingExternal} THEN 'ExternalPending'
            ELSE 'Missing'
        END AS VideoEvidenceStorage,
        (SELECT aev.id FROM KY_Activity_External_Video_Evidence aev WHERE aev.ActivityID=${alias}.id LIMIT 1) AS ActivityExternalEvidenceID,
        (SELECT aev.Status FROM KY_Activity_External_Video_Evidence aev WHERE aev.ActivityID=${alias}.id LIMIT 1) AS ActivityExternalStatus,
        (SELECT aev.RowVersion FROM KY_Activity_External_Video_Evidence aev WHERE aev.ActivityID=${alias}.id LIMIT 1) AS ActivityExternalRowVersion`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE SEARCH — for participant typeahead
// ─────────────────────────────────────────────────────────────────────────────
router.get('/employees', async (req, res) => {
    try {
        await ensureEmployeeCompanyEmailColumn(db);
        const { q, dept } = req.query;
        let sql = `SELECT EmployeeID, EmployeeName, Department, Position, CompanyEmail FROM Employees WHERE 1=1`;
        const params = [];
        if (q && q.trim()) {
            sql += ` AND (EmployeeName LIKE ? OR EmployeeID LIKE ?)`;
            const like = `%${q.trim()}%`;
            params.push(like, like);
        }
        if (dept) { sql += ` AND Department = ?`; params.push(dept); }
        sql += ` ORDER BY EmployeeName LIMIT 40`;
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('KY employees error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถค้นหาพนักงานได้' });
    }
});

// Employee Master email for current KY reporter
router.get('/email-profile', async (req, res) => {
    try {
        await ensureEmployeeCompanyEmailColumn(db);
        const employeeId = currentUserId(req);
        if (!employeeId) return res.json({ success: true, data: null });
        const [rows] = await db.query(
            `SELECT EmployeeID, EmployeeName, Department, Position, CompanyEmail
             FROM Employees WHERE EmployeeID = ? LIMIT 1`,
            [employeeId]
        );
        res.json({ success: true, data: rows[0] || null });
    } catch (error) {
        console.error('KY email profile error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงอีเมลผู้รายงานได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STATS — KPI + Charts
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();

        // Program config for this year
        const [configRows] = await db.query(
            `SELECT Department, SafetyUnits, YearlyTarget, DeadlineDay, DeadlineNote
             FROM KY_Program_Config WHERE Year = ? AND IsActive = 1 ORDER BY Department`,
            [year]
        );
        const configMap = {};
        configRows.forEach(c => { configMap[c.Department] = c; });
        let targetDepts = configRows.map(c => c.Department);

        // Fallback to Master_Departments if no program config
        let usingConfig = targetDepts.length > 0;
        if (!usingConfig) {
            try {
                const [dRows] = await db.query('SELECT Name FROM Master_Departments ORDER BY Name');
                targetDepts = dRows.map(d => d.Name);
            } catch (_) {}
        }

        // Dept filter clause — applied to ALL activity queries when config exists
        const deptFilter  = usingConfig && targetDepts.length > 0
            ? `AND Department IN (${targetDepts.map(() => '?').join(',')})`
            : '';
        const evidenceDeptFilter = usingConfig && targetDepts.length > 0
            ? `AND a.Department IN (${targetDepts.map(() => '?').join(',')})`
            : '';
        const deptParams  = usingConfig && targetDepts.length > 0 ? targetDepts : [];

        // KPI
        const [[kpi]] = await db.query(`
            SELECT
                COUNT(*)                               AS total,
                COUNT(DISTINCT Department)             AS deptSubmitted,
                SUM(Status = 'Open')                   AS open,
                SUM(Status = 'Reviewed')               AS reviewed,
                SUM(Status = 'Closed')                 AS closed
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
        `, [year, ...deptParams]);

        const productionVideo = kyProductionVideoSql('a');
        const verifiedExternal = kyVerifiedExternalVideoSql('a');
        const pendingExternal = kyPendingExternalVideoSql('a');
        const [[videoEvidenceRow]] = await db.query(`
            SELECT
                SUM(${productionVideo}) AS productionVideo,
                SUM(NOT (${productionVideo}) AND ${verifiedExternal}) AS verifiedExternalVideo,
                SUM(${productionVideo} OR ${verifiedExternal}) AS videoEvidenceTotal,
                   SUM(NOT (${productionVideo}) AND NOT (${verifiedExternal}) AND ${pendingExternal}) AS pendingExternalVideo
            FROM KY_Activities a
            WHERE YEAR(a.ActivityDate) = ? ${evidenceDeptFilter}
        `, [year, ...deptParams]);
        const videoEvidenceTotal = Number(videoEvidenceRow?.videoEvidenceTotal || 0);
        const activityTotal = Number(kpi.total || 0);
        const videoEvidence = {
            productionVideo: Number(videoEvidenceRow?.productionVideo || 0),
            verifiedExternalVideo: Number(videoEvidenceRow?.verifiedExternalVideo || 0),
            pendingExternalVideo: Number(videoEvidenceRow?.pendingExternalVideo || 0),
            videoEvidenceTotal,
            missingVideoEvidence: Math.max(0, activityTotal - videoEvidenceTotal - Number(videoEvidenceRow?.pendingExternalVideo || 0)),
            videoEvidenceRate: activityTotal > 0 ? Math.round(videoEvidenceTotal / activityTotal * 100) : 0,
        };

        // Monthly trend
        const [monthly] = await db.query(`
            SELECT MONTH(ActivityDate) AS month, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY MONTH(ActivityDate)
            ORDER BY month
        `, [year, ...deptParams]);

        // Department charts are config-authoritative. Query raw activity labels first,
        // then resolve them through the same whitespace/case-normalized key so a
        // configured department with zero activity is still represented.
        const [rawByDept] = await db.query(`
            SELECT Department, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ?
            GROUP BY Department
            ORDER BY count DESC`, [year]);

        const [rawDeptMonthly] = await db.query(`
            SELECT Department, MONTH(ActivityDate) AS month, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ?
            GROUP BY Department, MONTH(ActivityDate)
            ORDER BY Department, month`, [year]);
        const canonicalDeptByKey = new Map(targetDepts.map(dept => [kyNormKey(dept), dept]));
        const departmentCounts = new Map(targetDepts.map(dept => [dept, 0]));
        const departmentMonthCounts = new Map();
        const unmappedMap = new Map();
        rawByDept.forEach(row => {
            const rawDepartment = String(row.Department || '').trim();
            const canonical = canonicalDeptByKey.get(kyNormKey(rawDepartment));
            const count = Number(row.count || 0);
            if (canonical) departmentCounts.set(canonical, Number(departmentCounts.get(canonical) || 0) + count);
            else if (rawDepartment) unmappedMap.set(rawDepartment, Number(unmappedMap.get(rawDepartment) || 0) + count);
        });
        rawDeptMonthly.forEach(row => {
            const canonical = canonicalDeptByKey.get(kyNormKey(row.Department));
            if (!canonical) return;
            const key = `${canonical}||${Number(row.month)}`;
            departmentMonthCounts.set(key, Number(departmentMonthCounts.get(key) || 0) + Number(row.count || 0));
        });
        const byDept = targetDepts.length
            ? targetDepts.map(Department => ({ Department, count: Number(departmentCounts.get(Department) || 0), configured: usingConfig, hasActivity: Number(departmentCounts.get(Department) || 0) > 0 }))
            : rawByDept.map(row => ({ ...row, count: Number(row.count || 0), configured: false, hasActivity: Number(row.count || 0) > 0 }));
        const deptMonthly = targetDepts.flatMap(Department => Array.from({ length: 12 }, (_, index) => ({
            Department,
            month: index + 1,
            count: Number(departmentMonthCounts.get(`${Department}||${index + 1}`) || 0),
            configured: usingConfig,
        })));
        const unmappedDepartments = [...unmappedMap.entries()]
            .map(([Department, count]) => ({ Department, count }))
            .sort((a, b) => b.count - a.count || a.Department.localeCompare(b.Department));

        // Status distribution
        const [statusDist] = await db.query(`
            SELECT Status, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY Status
        `, [year, ...deptParams]);

        // Risk category
        const [riskCat] = await db.query(`
            SELECT COALESCE(RiskCategory, 'ทั่วไป') AS label, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY RiskCategory
            ORDER BY count DESC
        `, [year, ...deptParams]);

        // Yearly submitted per dept + safety unit
        const [yearlyByDeptUnit] = await db.query(`
            SELECT Department, COALESCE(SafetyUnit, '') AS SafetyUnit, COUNT(*) AS submitted
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY Department, COALESCE(SafetyUnit, '')
        `, [year, ...deptParams]);

        // Top recurring KYT keywords (non-empty, for hazard pattern chart)
        const [topKeywords] = await db.query(`
            SELECT KYTKeyword AS keyword, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? AND KYTKeyword IS NOT NULL AND KYTKeyword != '' ${deptFilter}
            GROUP BY KYTKeyword
            ORDER BY count DESC
            LIMIT 10
        `, [year, ...deptParams]);
        const yearlyMap = {};
        const yearlyUnitMap = {};
        yearlyByDeptUnit.forEach(r => {
            yearlyMap[r.Department] = (yearlyMap[r.Department] || 0) + Number(r.submitted || 0);
            const unitKey = String(r.SafetyUnit || '').trim();
            if (unitKey) yearlyUnitMap[`${r.Department}||${unitKey}`] = Number(r.submitted || 0);
        });

        // Current month pending depts / units (depts in scope that haven't submitted this month)
        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curYear  = now.getFullYear();
        let pendingDepts = [];
        let pendingUnits = [];
        if (year === curYear && targetDepts.length) {
            try {
                const [submitted] = await db.query(
                    `SELECT DISTINCT Department, COALESCE(SafetyUnit, '') AS SafetyUnit FROM KY_Activities
                     WHERE MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ? ${deptFilter}`,
                    [curMonth, curYear, ...deptParams]
                );
                const submittedDeptSet = new Set(submitted.map(r => r.Department));
                const submittedUnitSet = new Set(submitted.map(r => `${r.Department}||${String(r.SafetyUnit || '').trim()}`));
                targetDepts.forEach(dept => {
                    const cfg = configMap[dept] || {};
                    const units = parseSafetyUnits(cfg.SafetyUnits);
                    if (units.length) {
                        const deptPending = units.filter(unit => !submittedUnitSet.has(`${dept}||${unit}`));
                        if (deptPending.length) pendingDepts.push(dept);
                        deptPending.forEach(unit => pendingUnits.push({ department: dept, safetyUnit: unit }));
                    } else if (!submittedDeptSet.has(dept)) {
                        pendingDepts.push(dept);
                    }
                });
            } catch (_) {
                const [submitted] = await db.query(
                    `SELECT DISTINCT Department FROM KY_Activities
                     WHERE MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ? ${deptFilter}`,
                    [curMonth, curYear, ...deptParams]
                );
                const submittedSet = new Set(submitted.map(r => r.Department));
                pendingDepts = targetDepts.filter(n => !submittedSet.has(n));
            }
        }

        // Program progress per dept
        const programProgress = targetDepts.map(dept => {
            const cfg = configMap[dept] || {};
            const unitTarget = cfg.YearlyTarget || 12;
            const submitted = yearlyMap[dept] || 0;
            const units = parseSafetyUnits(cfg.SafetyUnits);
            const target = (units.length || 1) * unitTarget;
            const safetyUnitProgress = units.map(unit => {
                const unitSubmitted = yearlyUnitMap[`${dept}||${unit}`] || 0;
                return {
                    name: unit,
                    submitted: unitSubmitted,
                    target: unitTarget,
                    pct: unitTarget > 0 ? Math.min(100, Math.round(unitSubmitted / unitTarget * 100)) : 0,
                };
            });
            return {
                department: dept,
                submitted,
                target,
                pct: target > 0 ? Math.min(100, Math.round(submitted / target * 100)) : 0,
                safetyUnits: units,
                safetyUnitProgress,
                unitTarget,
                unitCount: units.length || 1,
                deadlineDay: cfg.DeadlineDay || 15,
                deadlineNote: cfg.DeadlineNote || null,
            };
        });

        const submittedDepts = targetDepts.filter(d => (yearlyMap[d] || 0) > 0);
        const totalTargets = programProgress.reduce((sum, p) => sum + Number(p.target || 0), 0);
        const totalSafetyUnits = programProgress.reduce((sum, p) => sum + Number(p.unitCount || 1), 0);

        res.json({
            success: true,
            data: {
                kpi: {
                    total:         kpi.total         || 0,
                    deptSubmitted: submittedDepts.length,
                    totalDepts:    targetDepts.length,
                    pendingDepts:  Math.max(0, targetDepts.length - submittedDepts.length),
                    safetyUnitsTotal: totalSafetyUnits,
                    targetTotal: totalTargets,
                    targetSubmitted: programProgress.reduce((sum, p) => sum + Number(p.submitted || 0), 0),
                    completionRate: targetDepts.length > 0
                        ? Math.round((submittedDepts.length / targetDepts.length) * 100) : 0,
                    open:     kpi.open     || 0,
                    reviewed: kpi.reviewed || 0,
                    closed:   kpi.closed   || 0,
                },
                monthly,
                byDept,
                deptMonthly,
                departmentSource: usingConfig ? 'ProgramConfig' : 'MasterDepartments',
                configuredDepartments: targetDepts,
                unmappedDepartments,
                statusDist,
                riskCat,
                pendingDepts,
                pendingUnits,
                programProgress,
                topKeywords,
                videoEvidence,
                usingConfig,
            }
        });
    } catch (error) {
        console.error('KY stats error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลสถิติได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHECK — yearly progress for a department
// ─────────────────────────────────────────────────────────────────────────────
router.get('/check', async (req, res) => {
    try {
        await ensureTables();
        const { dept, year, safetyUnit } = req.query;
        if (!dept || !year) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ dept, year' });
        }

        const y = parseInt(year);

        const requestedUnit = String(safetyUnit || '').trim();

        // Get target from program config
        const [cfgRows] = await db.query(
            `SELECT SafetyUnits, YearlyTarget FROM KY_Program_Config WHERE Year = ? AND Department = ? AND IsActive = 1 LIMIT 1`,
            [y, dept]
        );
        const units = parseSafetyUnits(cfgRows[0]?.SafetyUnits);
        const unitTarget = cfgRows[0]?.YearlyTarget || 12;
        const hasUnits = units.length > 0;
        const validUnit = requestedUnit && units.includes(requestedUnit) ? requestedUnit : '';
        const target = hasUnits && validUnit ? unitTarget : (hasUnits ? units.length * unitTarget : unitTarget);

        const [rows] = hasUnits && validUnit
            ? await db.query(
                `SELECT COUNT(*) AS cnt FROM KY_Activities
                 WHERE Department = ? AND SafetyUnit = ? AND YEAR(ActivityDate) = ?`,
                [dept, validUnit, y]
            )
            : await db.query(
                `SELECT COUNT(*) AS cnt FROM KY_Activities
                 WHERE Department = ? AND YEAR(ActivityDate) = ?`,
                [dept, y]
            );
        const count = rows[0]?.cnt || 0;

        // Check if already submitted this month
        const now = new Date();
        const [monthRows] = hasUnits && validUnit
            ? await db.query(
                `SELECT id FROM KY_Activities
                 WHERE Department = ? AND SafetyUnit = ? AND MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ?
                 LIMIT 1`,
                [dept, validUnit, now.getMonth() + 1, y]
            )
            : hasUnits
                ? [[], null]
                : await db.query(
                    `SELECT id FROM KY_Activities
                     WHERE Department = ? AND MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ?
                     LIMIT 1`,
                    [dept, now.getMonth() + 1, y]
                );
        const submittedThisMonth = monthRows.length > 0;

        res.json({
            success: true,
            count,
            target,
            safetyUnits: units,
            selectedSafetyUnit: validUnit,
            requiresSafetyUnit: hasUnits,
            unitTarget,
            submittedThisMonth,
            yearlyDone:    count,          // actual yearly count (number, not boolean)
            yearlyTarget:  target,
            isYearlyFull:  count >= target,
            data: monthRows[0] || null,
        });
    } catch (error) {
        console.error('KY check error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAM CONFIG — CRUD (must be BEFORE /:id routes)
// ─────────────────────────────────────────────────────────────────────────────

// GET list for year
router.get('/program-config', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const [rows] = await db.query(
            `SELECT * FROM KY_Program_Config WHERE Year = ? ORDER BY Department`,
            [year]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('KY program-config GET error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลได้' });
    }
});

// POST batch upsert — body: { year, entries: [{department, safetyUnits:[], yearlyTarget, deadlineDay, deadlineNote}] }
router.post('/program-config', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { year, entries } = req.body;
        if (!year || !Array.isArray(entries) || !entries.length) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ year และ entries' });
        }
        const y = parseInt(year);
        let created = 0, updated = 0;

        for (const entry of entries) {
            const { department, safetyUnits, yearlyTarget, deadlineDay, deadlineNote } = entry;
            if (!department) continue;

            const units = Array.isArray(safetyUnits) ? JSON.stringify(safetyUnits) : (safetyUnits || null);
            const target = parseInt(yearlyTarget) || 12;
            const dDay   = parseInt(deadlineDay) || 15;
            const note   = (deadlineNote || '').trim() || null;

            const [result] = await db.query(
                `INSERT INTO KY_Program_Config
                    (Year, Department, SafetyUnits, YearlyTarget, DeadlineDay, DeadlineNote, IsActive, CreatedBy)
                 VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                 ON DUPLICATE KEY UPDATE
                    SafetyUnits = VALUES(SafetyUnits),
                    YearlyTarget = VALUES(YearlyTarget),
                    DeadlineDay = VALUES(DeadlineDay),
                    DeadlineNote = VALUES(DeadlineNote),
                    IsActive = 1,
                    CreatedBy = VALUES(CreatedBy)`,
                [y, department, units, target, dDay, note, req.user.id]
            );
            if (result.affectedRows === 1) created++;
            else updated++;
        }

        await logAudit(req, {
            action: 'KY_PROGRAM_CONFIG_UPSERT',
            module: 'ky',
            targetType: 'KY_Program_Config',
            targetId: y,
            detail: `Configured KY program entries for ${y}`,
            metadata: { year: y, created, updated, entries: entries.length },
        });
        res.json({ success: true, message: `บันทึกสำเร็จ (เพิ่ม ${created}, อัปเดต ${updated})` });
    } catch (error) {
        console.error('KY program-config POST error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกได้' });
    }
});

// PUT update single entry
router.put('/program-config/:cfgId', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { cfgId } = req.params;
        const id = parseInt(cfgId);
        if (!id || id <= 0) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });

        const [rows] = await db.query('SELECT id FROM KY_Program_Config WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });

        const { safetyUnits, yearlyTarget, deadlineDay, deadlineNote, isActive } = req.body;
        const fields = [];
        const vals   = [];

        if (safetyUnits !== undefined) {
            const units = Array.isArray(safetyUnits) ? JSON.stringify(safetyUnits) : (safetyUnits || null);
            fields.push('SafetyUnits = ?'); vals.push(units);
        }
        if (yearlyTarget !== undefined) { fields.push('YearlyTarget = ?'); vals.push(parseInt(yearlyTarget) || 12); }
        if (deadlineDay  !== undefined) { fields.push('DeadlineDay = ?');  vals.push(parseInt(deadlineDay) || 15); }
        if (deadlineNote !== undefined) { fields.push('DeadlineNote = ?'); vals.push((deadlineNote || '').trim() || null); }
        if (isActive     !== undefined) { fields.push('IsActive = ?');     vals.push(isActive ? 1 : 0); }

        if (!fields.length) return res.json({ success: true, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });

        vals.push(id);
        await db.query(`UPDATE KY_Program_Config SET ${fields.join(', ')} WHERE id = ?`, vals);
        await logAudit(req, {
            action: 'KY_PROGRAM_CONFIG_UPDATE',
            module: 'ky',
            targetType: 'KY_Program_Config',
            targetId: id,
            detail: 'Updated KY program config entry',
            metadata: { fields: fields.map(field => field.split(' = ')[0]) },
        });
        res.json({ success: true, message: 'อัปเดตสำเร็จ' });
    } catch (error) {
        console.error('KY program-config PUT error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตได้' });
    }
});

// DELETE single entry
router.delete('/program-config/:cfgId', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const id = parseInt(req.params.cfgId);
        if (!id || id <= 0) return res.status(400).json({ success: false, message: 'ID ไม่ถูกต้อง' });

        const [rows] = await db.query('SELECT id, Department FROM KY_Program_Config WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });

        await db.query('DELETE FROM KY_Program_Config WHERE id = ?', [id]);
        await logAudit(req, {
            action: 'KY_PROGRAM_CONFIG_DELETE',
            module: 'ky',
            targetType: 'KY_Program_Config',
            targetId: id,
            detail: `Removed ${rows[0].Department} from KY program config`,
            metadata: { department: rows[0].Department },
        });
        res.json({ success: true, message: `ลบ "${rows[0].Department}" ออกจากโปรแกรม KY สำเร็จ` });
    } catch (error) {
        console.error('KY program-config DELETE error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO SHOWCASE + REACTIONS
// ─────────────────────────────────────────────────────────────────────────────
// KY missing submission reminder queue
router.get('/reminder-queue', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const now = new Date();
        const year = parseInt(req.query.year || now.getFullYear(), 10);
        const month = parseInt(req.query.month || (now.getMonth() + 1), 10);
        if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
            return res.status(400).json({ success: false, message: 'Year or month is invalid.' });
        }
        const data = await buildKyReminderQueue(year, month);
        res.json({ success: true, data });
    } catch (error) {
        console.error('KY reminder queue error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงคิวแจ้งเตือน KY ได้' });
    }
});

router.post('/reminders/send', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const now = new Date();
        const year = parseInt(req.body?.year || now.getFullYear(), 10);
        const month = parseInt(req.body?.month || (now.getMonth() + 1), 10);
        if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
            return res.status(400).json({ success: false, message: 'Year or month is invalid.' });
        }
        const selectedKeys = Array.isArray(req.body?.keys)
            ? new Set(req.body.keys.map(value => String(value || '').trim()).filter(Boolean))
            : null;
        const queue = await buildKyReminderQueue(year, month);
        const targets = queue.rows.filter(row =>
            row.readiness === 'ready' && (!selectedKeys || selectedKeys.has(row.key))
        );
        if (!targets.length) {
            return res.status(400).json({ success: false, message: 'ไม่มีรายการ KY ที่พร้อมส่ง Reminder ในรอบที่เลือก' });
        }

        const results = [];
        for (const item of targets) {
            const mail = buildKyMissingSubmissionEmail(item);
            for (const recipient of item.recipients) {
                const result = await queueKyEmail({
                    to: recipient.CompanyEmail,
                    reportId: null,
                    eventType: 'MissingSubmissionReminder',
                    subject: mail.subject,
                    body: mail.body,
                    html: mail.html,
                });
                results.push({
                    key: item.key,
                    department: item.department,
                    safetyUnit: item.safetyUnit,
                    recipient: recipient.CompanyEmail,
                    status: result?.status || 'Queued',
                });
            }
        }
        const summary = {
            scopes: targets.length,
            recipients: results.length,
            sent: results.filter(result => result.status === 'Sent').length,
            queued: results.filter(result => result.status === 'Queued').length,
            failed: results.filter(result => result.status === 'Failed').length,
        };
        await logAudit(req, {
            action: 'KY_MISSING_SUBMISSION_REMINDER_SEND',
            module: 'ky',
            targetType: 'KY_Reminder',
            targetId: `${year}-${String(month).padStart(2, '0')}`,
            detail: `Sent KY missing submission reminders for ${summary.scopes} scope(s)`,
            metadata: {
                year,
                month,
                selectedKeys: selectedKeys ? [...selectedKeys] : null,
                summary,
            },
        });
        res.json({
            success: true,
            message: smtpConfigured()
                ? `ส่ง Reminder KY แล้ว ${summary.recipients} อีเมล`
                : `บันทึก Reminder KY เข้าคิวแล้ว ${summary.recipients} อีเมล`,
            data: { summary, results, smtpConfigured: smtpConfigured() },
        });
    } catch (error) {
        console.error('KY reminder send error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถส่ง Reminder KY ได้' });
    }
});

router.get('/unit-contest-entries', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const [rows] = await db.query(
            `SELECT ce.*,a.ActivityDate,a.TeamName,a.KYTKeyword,a.ReporterID,a.ReporterName,
                    a.SubmittedByID,a.SubmittedByName,a.Participants,a.VideoUrl,a.Status AS ActivityStatus
             FROM KY_Annual_Unit_Contest_Entries ce
             INNER JOIN KY_Activities a ON a.id=ce.ActivityID
             WHERE ce.EntryYear=? AND ce.Status='Submitted'
             ORDER BY ce.Department,ce.SafetyUnit`, [year]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('KY contest entries error:', error);
        res.status(500).json({ success: false, message: 'Unable to load annual unit contest entries.' });
    }
});

router.post('/unit-contest-entries', async (req, res) => {
    const activityId = String(req.body?.activityId || '').trim();
    if (!activityId) return res.status(400).json({ success: false, message: 'Activity is required.' });
    let connection;
    try {
        await ensureTables();
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [activityRows] = await connection.query('SELECT * FROM KY_Activities WHERE id=? FOR UPDATE', [activityId]);
        const activity = activityRows[0];
        if (!activity) { await connection.rollback(); return res.status(404).json({ success: false, message: 'KY Activity not found.' }); }
        if (!String(activity.VideoUrl || '').trim()) { await connection.rollback(); return res.status(409).json({ success: false, code: 'KY_CONTEST_PRODUCTION_VIDEO_REQUIRED', message: 'Contest entry requires an existing Production video.' }); }
        if (!kyCanManageContestForScope(activity, req)) { await connection.rollback(); return res.status(403).json({ success: false, message: 'Only a user in this Unit or Admin can submit its contest entry.' }); }
        const year = new Date(activity.ActivityDate).getFullYear();
        const [configRows] = await connection.query('SELECT Department,SafetyUnits FROM KY_Program_Config WHERE Year=? AND IsActive=1', [year]);
        const config = configRows.find(row => kyNormKey(row.Department) === kyNormKey(activity.Department));
        const configuredUnits = parseSafetyUnits(config?.SafetyUnits);
        const unitValid = config && (configuredUnits.length === 0
            ? !kyNormKey(activity.SafetyUnit)
            : configuredUnits.some(unit => kyNormKey(unit) === kyNormKey(activity.SafetyUnit)));
        if (!unitValid) { await connection.rollback(); return res.status(409).json({ success: false, code: 'KY_CONTEST_SCOPE_NOT_CONFIGURED', message: 'Activity Department/Safety Unit is not active in the selected year Program Config.' }); }
        const scopeKey = kyAnnualScopeKey(activity.Department, activity.SafetyUnit);
        const [entryRows] = await connection.query('SELECT * FROM KY_Annual_Unit_Contest_Entries WHERE EntryYear=? AND ScopeKey=? FOR UPDATE', [year, scopeKey]);
        const before = entryRows[0] || null;
        if (before && before.Status === 'Submitted' && before.ActivityID === activity.id) {
            await connection.commit();
            return res.json({ success: true, data: before, idempotent: true });
        }
        if (before && before.Status === 'Submitted' && !isKyAdmin(req)) {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'KY_CONTEST_ENTRY_ADMIN_REPLACE_REQUIRED', message: 'This Unit already has a contest entry. Ask Admin to replace it.' });
        }
        const actorId = currentUserId(req) || null;
        const actorName = req.user?.name || req.user?.EmployeeName || req.user?.username || 'User';
        if (before) {
            await connection.query(
                `UPDATE KY_Annual_Unit_Contest_Entries SET ActivityID=?,Status='Submitted',SubmittedByID=?,SubmittedByName=?,SubmittedAt=NOW(),UpdatedByID=?,UpdatedByName=?,RowVersion=RowVersion+1 WHERE id=?`,
                [activity.id, actorId, actorName, actorId, actorName, before.id]
            );
        } else {
            await connection.query(
                `INSERT INTO KY_Annual_Unit_Contest_Entries
                 (id,EntryYear,ScopeKey,Department,SafetyUnit,ActivityID,Status,SubmittedByID,SubmittedByName,UpdatedByID,UpdatedByName)
                 VALUES (?,?,?,?,?,?,'Submitted',?,?,?,?)`,
                [randomUUID(), year, scopeKey, activity.Department, activity.SafetyUnit || null, activity.id, actorId, actorName, actorId, actorName]
            );
        }
        const [afterRows] = await connection.query('SELECT * FROM KY_Annual_Unit_Contest_Entries WHERE EntryYear=? AND ScopeKey=?', [year, scopeKey]);
        const after = afterRows[0];
        await kyContestAudit(connection, req, before ? 'ENTRY_REPLACED' : 'ENTRY_SUBMITTED', before, after, before ? `Replaced ${before.ActivityID} with ${activity.id}` : 'Annual Unit contest entry submitted');
        await connection.commit();
        res.json({ success: true, data: after });
    } catch (error) {
        if (connection) { try { await connection.rollback(); } catch (_) {} }
        console.error('KY contest submit error:', error);
        res.status(500).json({ success: false, message: 'Unable to submit annual Unit contest entry.' });
    } finally { if (connection) connection.release(); }
});

router.delete('/unit-contest-entries/:entryId', isAdmin, async (req, res) => {
    let connection;
    try {
        await ensureTables();
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT * FROM KY_Annual_Unit_Contest_Entries WHERE id=? FOR UPDATE', [req.params.entryId]);
        const before = rows[0];
        if (!before) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Contest entry not found.' }); }
        await connection.query(`UPDATE KY_Annual_Unit_Contest_Entries SET Status='Withdrawn',UpdatedByID=?,UpdatedByName=?,RowVersion=RowVersion+1 WHERE id=?`, [currentUserId(req) || null, req.user?.name || req.user?.EmployeeName || 'Admin', before.id]);
        const [afterRows] = await connection.query('SELECT * FROM KY_Annual_Unit_Contest_Entries WHERE id=?', [before.id]);
        await kyContestAudit(connection, req, 'ENTRY_WITHDRAWN', before, afterRows[0], String(req.body?.reason || '').trim());
        await connection.commit();
        res.json({ success: true, data: afterRows[0] });
    } catch (error) {
        if (connection) { try { await connection.rollback(); } catch (_) {} }
        res.status(500).json({ success: false, message: 'Unable to withdraw contest entry.' });
    } finally { if (connection) connection.release(); }
});

router.get('/unit-contest-entries/:entryId/audit', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT * FROM KY_Annual_Unit_Contest_Entry_Audit WHERE EntryID=? ORDER BY id DESC LIMIT 200', [req.params.entryId]);
        res.json({ success: true, data: rows });
    } catch (_) { res.status(500).json({ success: false, message: 'Unable to load contest entry audit.' }); }
});

router.get('/video-showcase', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const limit = Math.min(Math.max(parseInt(req.query.limit) || KY_VIDEO_SHOWCASE_DEFAULT_LIMIT, 1), KY_VIDEO_SHOWCASE_MAX_LIMIT);
        const userId = currentUserId(req) || '__anonymous__';

        const [rows] = await db.query(`
            SELECT
                a.id, a.ActivityDate, a.ReporterID, a.ReporterName, a.SubmittedByID, a.SubmittedByName,
                a.Department, a.SafetyUnit, a.TeamName, a.KYTKeyword, a.RiskCategory, a.HazardDescription,
                a.Countermeasure, a.VideoUrl, a.Status, a.IsVideoPinned, a.ShowVideoOnDashboard,
                ce.id AS ContestEntryID,ce.EntryYear AS ContestEntryYear,ce.SubmittedAt AS ContestSubmittedAt,
                COALESCE(rc.UsefulCount, 0)    AS UsefulCount,
                COALESCE(rc.PracticeCount, 0)  AS PracticeCount,
                COALESCE(rc.AwarenessCount, 0) AS AwarenessCount,
                COALESCE(rc.AttentionCount, 0) AS AttentionCount,
                COALESCE(rc.ReactionTotal, 0)  AS ReactionTotal,
                ur.Reaction AS MyReaction
            FROM KY_Annual_Unit_Contest_Entries ce
            INNER JOIN KY_Activities a ON a.id=ce.ActivityID
            LEFT JOIN (
                SELECT
                    ActivityID,
                    SUM(Reaction = 'useful')    AS UsefulCount,
                    SUM(Reaction = 'practice')  AS PracticeCount,
                    SUM(Reaction = 'awareness') AS AwarenessCount,
                    SUM(Reaction = 'attention') AS AttentionCount,
                    COUNT(*) AS ReactionTotal
                FROM KY_Video_Reactions
                GROUP BY ActivityID
            ) rc ON rc.ActivityID = a.id
            LEFT JOIN KY_Video_Reactions ur ON ur.ActivityID = a.id AND ur.EmployeeID = ?
            WHERE ce.EntryYear = ? AND ce.Status='Submitted'
              AND a.VideoUrl IS NOT NULL AND a.VideoUrl <> ''
              AND COALESCE(a.ShowVideoOnDashboard, 1) = 1
            ORDER BY COALESCE(a.IsVideoPinned, 0) DESC, COALESCE(rc.ReactionTotal, 0) DESC, a.CreatedAt DESC
            LIMIT ?
        `, [userId, year, limit]);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('KY video showcase error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงวิดีโอ KY ได้' });
    }
});

router.get('/file-health', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const [records] = await db.query(`
            SELECT id, ActivityDate, ReporterID, ReporterName, Department, SafetyUnit,
                   TeamName, KYTKeyword, AttachmentUrl, VideoUrl, Status, CreatedAt
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ?
            ORDER BY ActivityDate DESC, CreatedAt DESC
        `, [year]);
        const files = [];
        for (const record of records) {
            for (const [field, label] of [['AttachmentUrl', 'Attachment'], ['VideoUrl', 'Video']]) {
                const health = kyMediaHealthStatus(record[field], field);
                files.push({
                    activityId: record.id,
                    activityDate: record.ActivityDate,
                    reporterId: record.ReporterID,
                    reporterName: record.ReporterName,
                    department: record.Department,
                    safetyUnit: record.SafetyUnit,
                    teamName: record.TeamName,
                    kytKeyword: record.KYTKeyword,
                    recordStatus: record.Status,
                    label,
                    ...health,
                });
            }
        }
        const count = status => files.filter(file => file.status === status).length;
        const missingFiles = files.filter(file => file.status === 'missing');
        const legacyLocalhostFiles = files.filter(file => file.scope === 'legacy-localhost');
        res.json({
            success: true,
            data: {
                phase: 'ky_media_file_health',
                readOnly: true,
                year,
                summary: {
                    activities: records.length,
                    references: files.length,
                    ok: count('ok'),
                    missing: count('missing'),
                    legacyLocalhost: legacyLocalhostFiles.length,
                    external: count('external'),
                    empty: count('empty'),
                },
                files,
                missingFiles,
                legacyLocalhostFiles,
                note: 'Read-only KY media health report. No files or database rows are changed automatically.',
            },
        });
    } catch (error) {
        console.error('KY file health error:', error);
        res.status(500).json({ success: false, message: 'Unable to load KY media file health.' });
    }
});

router.get('/activity-video-evidence', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const [rows] = await db.query(
            `SELECT e.*,a.ActivityDate,a.TeamName,a.KYTKeyword,a.ReporterName,a.Status AS ActivityStatus
             FROM KY_Activity_External_Video_Evidence e
             INNER JOIN KY_Activities a ON a.id=e.ActivityID
             WHERE e.EvidenceYear=? ORDER BY a.ActivityDate DESC,e.UpdatedAt DESC`, [year]
        );
        res.json({ success: true, data: rows.map(kyActivityExternalVideoPublic) });
    } catch (error) {
        console.error('KY activity external video list error:', error);
        res.status(500).json({ success: false, message: 'Unable to load activity external video evidence.' });
    }
});

router.get('/activity-video-evidence/:evidenceId/audit', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query(
            `SELECT id,EvidenceID,ActivityID,Action,ActorID,ActorName,BeforeJson,AfterJson,Detail,CreatedAt
             FROM KY_Activity_External_Video_Evidence_Audit WHERE EvidenceID=? ORDER BY id DESC LIMIT 200`,
            [req.params.evidenceId]
        );
        res.json({ success: true, data: rows });
    } catch (_) {
        res.status(500).json({ success: false, message: 'Unable to load activity external video audit.' });
    }
});

router.post('/activity-video-evidence/declare', async (req, res) => {
    let connection;
    try {
        await ensureTables();
        const activityId = String(req.body?.activityId || '').trim();
        const externalReference = String(req.body?.externalReference || '').trim();
        const originalFileName = String(req.body?.originalFileName || '').trim().replace(/[\\/]+/g, '_').slice(0, 255);
        const mimeType = String(req.body?.mimeType || '').trim().slice(0, 120) || null;
        const fileSize = Number(req.body?.fileSize || 0);
        const sha256 = String(req.body?.sha256 || '').trim().toLowerCase();
        const requestedRowVersion = Number(req.body?.rowVersion || 0);
        if (!activityId || !externalReference || !originalFileName || !Number.isSafeInteger(fileSize) || fileSize <= 0 || !/^[a-f0-9]{64}$/.test(sha256)) {
            return res.status(400).json({ success: false, code: 'KY_ACTIVITY_EXTERNAL_METADATA_REQUIRED', message: 'Activity, central-machine reference, filename, size and SHA-256 are required.' });
        }
        const [activityRows] = await db.query('SELECT * FROM KY_Activities WHERE id=? LIMIT 1', [activityId]);
        const activity = activityRows[0];
        if (!activity) return res.status(404).json({ success: false, message: 'KY activity not found.' });
        if (!kyCanUploadFollowupVideoForUser(activity, req)) return res.status(403).json({ success: false, message: 'You cannot declare evidence for this activity.' });
        const evidenceYear = new Date(activity.ActivityDate).getFullYear();
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [currentRows] = await connection.query('SELECT * FROM KY_Activity_External_Video_Evidence WHERE ActivityID=? FOR UPDATE', [activityId]);
        const before = currentRows[0] || null;
        if (before?.Status === 'Verified') {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'KY_ACTIVITY_EXTERNAL_ALREADY_VERIFIED', message: 'This activity video is already verified. Mark it for correction before replacing it.' });
        }
        const samePending = before && before.Status === 'Pending'
            && String(before.ExternalReference) === externalReference && String(before.OriginalFileName) === originalFileName
            && Number(before.FileSize) === fileSize && String(before.SHA256).toLowerCase() === sha256;
        if (samePending) {
            await connection.commit();
            return res.json({ success: true, data: kyActivityExternalVideoPublic(before), idempotent: true });
        }
        if (before && requestedRowVersion > 0 && requestedRowVersion !== Number(before.RowVersion)) {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'KY_ACTIVITY_EXTERNAL_STALE', message: 'Activity video metadata changed. Refresh and retry.' });
        }
        const id = before?.id || randomUUID();
        const actorId = currentUserId(req) || null;
        const actorName = req.user?.name || req.user?.EmployeeName || req.user?.username || 'User';
        if (before) {
            await connection.query(
                `UPDATE KY_Activity_External_Video_Evidence SET EvidenceYear=?,Department=?,SafetyUnit=?,ExternalReference=?,OriginalFileName=?,MimeType=?,FileSize=?,SHA256=?,Status='Pending',DeclaredByID=?,DeclaredByName=?,DeclaredAt=NOW(),VerifiedByID=NULL,VerifiedByName=NULL,VerifiedAt=NULL,VerificationNote=NULL,RowVersion=RowVersion+1 WHERE id=?`,
                [evidenceYear, activity.Department, activity.SafetyUnit || null, externalReference, originalFileName, mimeType, fileSize, sha256, actorId, actorName, id]
            );
        } else {
            await connection.query(
                `INSERT INTO KY_Activity_External_Video_Evidence (id,EvidenceYear,ActivityID,Department,SafetyUnit,ExternalReference,OriginalFileName,MimeType,FileSize,SHA256,Status,DeclaredByID,DeclaredByName) VALUES (?,?,?,?,?,?,?,?,?,?,'Pending',?,?)`,
                [id, evidenceYear, activityId, activity.Department, activity.SafetyUnit || null, externalReference, originalFileName, mimeType, fileSize, sha256, actorId, actorName]
            );
        }
        const [afterRows] = await connection.query('SELECT * FROM KY_Activity_External_Video_Evidence WHERE id=?', [id]);
        await kyActivityExternalVideoAudit(connection, req, before ? 'METADATA_UPDATED' : 'DECLARED', before, afterRows[0], 'External activity video metadata recorded without uploading the video to Production.');
        await connection.commit();
        res.status(before ? 200 : 201).json({ success: true, data: kyActivityExternalVideoPublic(afterRows[0]) });
    } catch (error) {
        if (connection) { try { await connection.rollback(); } catch (_) {} }
        console.error('KY activity external video declaration error:', error);
        res.status(500).json({ success: false, message: 'Unable to declare activity external video evidence.' });
    } finally { if (connection) connection.release(); }
});

router.post('/activity-video-evidence/:evidenceId/verify', isAdmin, async (req, res) => {
    let connection;
    try {
        await ensureTables();
        const status = String(req.body?.status || 'Verified');
        const rowVersion = Number(req.body?.rowVersion || 0);
        const note = String(req.body?.note || '').trim();
        if (!['Verified', 'NeedsCorrection'].includes(status) || !Number.isInteger(rowVersion) || rowVersion < 1) return res.status(400).json({ success: false, message: 'Status and row version are required.' });
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT * FROM KY_Activity_External_Video_Evidence WHERE id=? FOR UPDATE', [req.params.evidenceId]);
        const before = rows[0];
        if (!before) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Activity external video evidence not found.' }); }
        if (Number(before.RowVersion) !== rowVersion) { await connection.rollback(); return res.status(409).json({ success: false, code: 'KY_ACTIVITY_EXTERNAL_STALE', message: 'Activity video metadata changed. Refresh and retry.' }); }
        if (status === 'Verified' && (!String(before.ExternalReference || '').trim() || !/^[a-f0-9]{64}$/i.test(String(before.SHA256 || '')))) {
            await connection.rollback();
            return res.status(400).json({ success: false, code: 'KY_ACTIVITY_EXTERNAL_METADATA_REQUIRED', message: 'Complete external video metadata is required before verification.' });
        }
        const actorId = currentUserId(req) || null;
        const actorName = req.user?.name || req.user?.EmployeeName || req.user?.username || 'Admin';
        await connection.query(
            `UPDATE KY_Activity_External_Video_Evidence SET Status=?,VerificationNote=?,VerifiedByID=?,VerifiedByName=?,VerifiedAt=?,RowVersion=RowVersion+1 WHERE id=? AND RowVersion=?`,
            [status, note || null, actorId, actorName, status === 'Verified' ? new Date() : null, before.id, rowVersion]
        );
        const [afterRows] = await connection.query('SELECT * FROM KY_Activity_External_Video_Evidence WHERE id=?', [before.id]);
        await kyActivityExternalVideoAudit(connection, req, status === 'Verified' ? 'ADMIN_VERIFIED' : 'NEEDS_CORRECTION', before, afterRows[0], note);
        await connection.commit();
        res.json({ success: true, data: kyActivityExternalVideoPublic(afterRows[0]) });
    } catch (error) {
        if (connection) { try { await connection.rollback(); } catch (_) {} }
        res.status(500).json({ success: false, message: 'Unable to verify activity external video evidence.' });
    } finally { if (connection) connection.release(); }
});

router.get('/annual-video-evidence', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        if (year < 2000 || year > 2200) return res.status(400).json({ success: false, message: 'Evidence year is invalid.' });
        const [configs] = await db.query(
            `SELECT Department, SafetyUnits, YearlyTarget FROM KY_Program_Config
             WHERE Year = ? AND IsActive = 1 ORDER BY Department`,
            [year]
        );
        const evidence = await kyAnnualEvidenceRows(year);
        const byScope = new Map(evidence.map(row => [row.ScopeKey, row]));
        const [activityExternalRows] = await db.query(
            `SELECT e.*,a.ActivityDate,a.TeamName,a.KYTKeyword,a.ReporterName,a.Status AS ActivityStatus
             FROM KY_Activity_External_Video_Evidence e
             INNER JOIN KY_Activities a ON a.id=e.ActivityID
             WHERE e.EvidenceYear=? ORDER BY a.ActivityDate DESC,e.UpdatedAt DESC`, [year]
        );
        const activityExternalEvidence = activityExternalRows.map(kyActivityExternalVideoPublic);
        const annualScopeVerifiedExternal = kyVerifiedExternalVideoSql('a');
        const annualScopePendingExternal = kyPendingExternalVideoSql('a');
        const [scopeActivityRows] = await db.query(
            `SELECT a.Department,a.SafetyUnit,
                    SUM(CASE WHEN COALESCE(TRIM(a.VideoUrl),'')<>'' THEN 1 ELSE 0 END) AS ProductionVideo,
                    SUM(CASE WHEN COALESCE(TRIM(a.VideoUrl),'')='' AND ${annualScopeVerifiedExternal} THEN 1 ELSE 0 END) AS VerifiedExternalVideo,
                    SUM(CASE WHEN COALESCE(TRIM(a.VideoUrl),'')='' AND NOT (${annualScopeVerifiedExternal}) AND ${annualScopePendingExternal} THEN 1 ELSE 0 END) AS PendingExternalVideo
             FROM KY_Activities a
             WHERE YEAR(a.ActivityDate)=? GROUP BY a.Department,a.SafetyUnit`, [year]
        );
        const activityScopeState = new Map(scopeActivityRows.map(row => [kyAnnualScopeKey(row.Department, row.SafetyUnit), {
            productionVideo: Number(row.ProductionVideo || 0),
            verifiedExternalVideo: Number(row.VerifiedExternalVideo || 0),
            pendingExternalVideo: Number(row.PendingExternalVideo || 0),
        }]));
        const scopes = [];
        for (const config of configs) {
            const units = parseSafetyUnits(config.SafetyUnits);
            const scopedUnits = units.length ? units : [''];
            for (const safetyUnit of scopedUnits) {
                const scopeKey = kyAnnualScopeKey(config.Department, safetyUnit);
                const item = byScope.get(scopeKey) || null;
                const activityState = activityScopeState.get(scopeKey) || { productionVideo: 0, verifiedExternalVideo: 0, pendingExternalVideo: 0 };
                const compliance = kyAnnualComplianceState(config.YearlyTarget || 12, activityState.productionVideo, activityState.verifiedExternalVideo, activityState.pendingExternalVideo);
                scopes.push({
                    scopeKey,
                    department: config.Department,
                    safetyUnit: safetyUnit || null,
                    compliant: compliance.annualCompliant,
                    annualCompliant: compliance.annualCompliant,
                    productionVideo: activityState.productionVideo,
                    verifiedExternalVideo: activityState.verifiedExternalVideo,
                    ...compliance,
                    complianceSource: compliance.annualCompliant ? 'DistinctActivities' : null,
                    pendingActivityExternal: !compliance.annualCompliant && activityState.pendingExternalVideo > 0,
                    evidence: item,
                });
            }
        }
        const [candidateRows] = await db.query(
            `SELECT a.id, a.ActivityDate, a.Department, a.SafetyUnit, a.TeamName, a.KYTKeyword,
                    a.ReporterName, a.VideoUrl
             FROM KY_Activities a
             LEFT JOIN KY_Annual_Video_Evidence e ON e.ActivityID = a.id
             WHERE YEAR(a.ActivityDate) = ? AND COALESCE(TRIM(a.VideoUrl), '') <> '' AND e.id IS NULL
             ORDER BY a.ActivityDate DESC, a.CreatedAt DESC LIMIT 300`,
            [year]
        );
        const candidates = candidateRows.map(row => {
            const scopeKey = kyAnnualScopeKey(row.Department, row.SafetyUnit);
            const scopeEvidence = byScope.get(scopeKey) || null;
            return {
                ...row,
                ScopeKey: scopeKey,
                ScopeEvidenceID: scopeEvidence?.id || null,
                ScopeEvidenceStatus: scopeEvidence?.Status || null,
                ScopeEvidenceActivityID: scopeEvidence?.ActivityID || null,
                ScopeAlreadyRegistered: Boolean(scopeEvidence),
            };
        });
        const [inventoryRows] = await db.query(
            `SELECT a.id AS ActivityID, a.ActivityDate, a.Department, a.SafetyUnit, a.TeamName, a.KYTKeyword,
                    a.ReporterName, a.VideoUrl AS CurrentVideoUrl,
                    inv.id AS InventoryID, inv.EvidenceYear, inv.ExternalBackupConfirmed, inv.ExternalReference,
                    inv.OriginalFileName, inv.MimeType, inv.FileSize, inv.SHA256, inv.ProductionVideoUrl,
                    inv.ProductionStoredName, inv.Status, inv.DeclaredByID, inv.DeclaredByName, inv.DeclaredAt,
                    inv.VerifiedByID, inv.VerifiedByName, inv.VerifiedAt, inv.VerificationNote,
                    inv.ProductionDeletedByID, inv.ProductionDeletedByName, inv.ProductionDeletedAt,
                    inv.ProductionDeletionReason, inv.RowVersion, inv.CreatedAt, inv.UpdatedAt,
                    ave.id AS AnnualEvidenceID, ave.Status AS AnnualEvidenceStatus,
                    ce.id AS ContestEntryID
             FROM KY_Activities a
             LEFT JOIN KY_Video_File_Inventory inv ON inv.ActivityID = a.id
             LEFT JOIN KY_Annual_Video_Evidence ave ON ave.ActivityID = a.id
             LEFT JOIN KY_Annual_Unit_Contest_Entries ce ON ce.ActivityID=a.id AND ce.Status='Submitted'
             WHERE YEAR(a.ActivityDate) = ?
               AND (COALESCE(TRIM(a.VideoUrl), '') <> '' OR inv.id IS NOT NULL)
             ORDER BY a.ActivityDate DESC, a.CreatedAt DESC`,
            [year]
        );
        const inventory = inventoryRows.map(kyVideoInventoryPublic);
        const inventorySummary = {
            total: inventory.length,
            productionFiles: inventory.filter(row => String(row.CurrentVideoUrl || '').trim()).length,
            unregistered: inventory.filter(row => !row.registered && String(row.CurrentVideoUrl || '').trim()).length,
            pending: inventory.filter(row => ['Pending', 'NeedsCorrection'].includes(row.Status)).length,
            verifiedExternal: inventory.filter(row => row.Status === 'Verified').length,
            reclaimableFiles: inventory.filter(row => row.canDeleteProductionFile).length,
            reclaimableBytes: inventory.filter(row => row.canDeleteProductionFile).reduce((sum, row) => sum + Number(row.FileSize || 0), 0),
            deletedFiles: inventory.filter(row => row.fileDeleted).length,
        };
        const verified = scopes.filter(row => row.compliant).length;
        res.json({
            success: true,
            data: {
                year,
                summary: {
                    requiredScopes: scopes.length,
                    verifiedScopes: verified,
                    pendingScopes: scopes.filter(row => !row.compliant && (row.evidence || row.pendingActivityExternal)).length,
                    missingScopes: scopes.filter(row => !row.compliant && !row.evidence && !row.pendingActivityExternal).length,
                    compliancePct: scopes.length ? Math.round((verified / scopes.length) * 100) : 0,
                    productionFiles: evidence.filter(row => row.ProductionVideoUrl && !row.ProductionDeletedAt).length,
                    reclaimableFiles: evidence.filter(row => row.canDeleteProductionFile).length,
                    reclaimableBytes: evidence.filter(row => row.canDeleteProductionFile).reduce((sum, row) => sum + Number(row.FileSize || 0), 0),
                },
                scopes,
                evidence,
                activityExternalEvidence,
                candidates,
                inventory,
                inventorySummary,
            },
        });
    } catch (error) {
        console.error('KY annual video evidence dashboard error:', error);
        res.status(500).json({ success: false, message: 'Unable to load annual KY video evidence.' });
    }
});

router.get('/annual-video-evidence/:evidenceId/audit', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query(
            `SELECT id, EvidenceID, ActivityID, Action, ActorID, ActorName, BeforeJson, AfterJson, Detail, CreatedAt
             FROM KY_Annual_Video_Evidence_Audit WHERE EvidenceID = ? ORDER BY id DESC LIMIT 200`,
            [req.params.evidenceId]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Unable to load annual video audit.' });
    }
});

router.get('/video-inventory/:inventoryId/audit', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query(
            `SELECT id, InventoryID, ActivityID, Action, ActorID, ActorName, BeforeJson, AfterJson, Detail, CreatedAt
             FROM KY_Video_File_Inventory_Audit WHERE InventoryID=? ORDER BY id DESC LIMIT 200`,
            [req.params.inventoryId]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Unable to load Production video inventory audit.' });
    }
});

router.get('/video-inventory/:inventoryId/download', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT * FROM KY_Video_File_Inventory WHERE id=? LIMIT 1', [req.params.inventoryId]);
        const row = rows[0];
        if (!row) return res.status(404).json({ success: false, message: 'Production video inventory record not found.' });
        if (row.ProductionDeletedAt) return res.status(410).json({ success: false, message: 'Production copy has already been removed.' });
        const localPath = kyAnnualLocalVideo(row.ProductionVideoUrl);
        if (!localPath) return res.status(404).json({ success: false, message: 'Production video file is unavailable.' });
        const actualHash = await kyFileSha256(localPath);
        if (actualHash !== String(row.SHA256 || '').toLowerCase()) {
            return res.status(409).json({ success: false, code: 'KY_VIDEO_INVENTORY_HASH_MISMATCH', message: 'Production file SHA-256 no longer matches its inventory record.' });
        }
        res.download(localPath, row.OriginalFileName || path.basename(localPath));
    } catch (error) {
        res.status(500).json({ success: false, message: 'Unable to download Production video inventory file.' });
    }
});

router.post('/video-inventory/declare', isAdmin, async (req, res) => {
    let connection;
    try {
        await ensureTables();
        const activityId = String(req.body?.activityId || '').trim();
        const externalReference = String(req.body?.externalReference || '').trim();
        const originalFileName = String(req.body?.originalFileName || '').trim().replace(/[\\/]+/g, '_').slice(0, 255);
        const mimeType = String(req.body?.mimeType || '').trim().slice(0, 120) || null;
        const fileSize = Number(req.body?.fileSize || 0);
        const sha256 = String(req.body?.sha256 || '').trim().toLowerCase();
        const adminAttested = String(req.body?.registrationMode || '') === 'AdminAttested';
        const requestedRowVersion = Number(req.body?.rowVersion || 0);
        if (!activityId || !externalReference || !originalFileName || (!adminAttested && (!Number.isSafeInteger(fileSize) || fileSize <= 0 || !/^[a-f0-9]{64}$/.test(sha256)))) {
            return res.status(400).json({ success: false, code: 'KY_VIDEO_INVENTORY_METADATA_REQUIRED', message: 'Activity, external reference, filename, size and SHA-256 are required.' });
        }
        const [activityRows] = await db.query('SELECT * FROM KY_Activities WHERE id=? LIMIT 1', [activityId]);
        const activity = activityRows[0];
        if (!activity) return res.status(404).json({ success: false, message: 'KY activity not found.' });
        const productionVideoUrl = String(activity.VideoUrl || '').trim();
        const localPath = kyAnnualLocalVideo(productionVideoUrl);
        if (!localPath) return res.status(400).json({ success: false, code: 'KY_VIDEO_INVENTORY_PRODUCTION_REQUIRED', message: 'This activity has no readable Production video.' });
        const productionSize = fs.statSync(localPath).size;
        const productionHash = await kyFileSha256(localPath);
        if (!adminAttested && (productionSize !== fileSize || productionHash !== sha256)) {
            return res.status(409).json({ success: false, code: 'KY_VIDEO_INVENTORY_BACKUP_MISMATCH', message: 'The selected external backup does not match the current Production video.' });
        }
        const recordedSize = adminAttested ? productionSize : fileSize;
        const recordedHash = adminAttested ? productionHash : sha256;
        const evidenceYear = new Date(activity.ActivityDate).getFullYear();
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [currentRows] = await connection.query('SELECT * FROM KY_Video_File_Inventory WHERE ActivityID=? FOR UPDATE', [activityId]);
        const before = currentRows[0] || null;
        if (before?.Status === 'Verified') {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'KY_VIDEO_INVENTORY_ALREADY_VERIFIED', message: 'This file is already verified. Mark it for correction before replacing its backup metadata.' });
        }
        if (before && requestedRowVersion !== Number(before.RowVersion)) {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'KY_VIDEO_INVENTORY_STALE', message: 'Inventory metadata changed. Refresh and retry.' });
        }
        const id = before?.id || randomUUID();
        const actorId = currentUserId(req) || null;
        const actorName = req.user?.name || req.user?.EmployeeName || req.user?.username || 'Admin';
        if (before) {
            await connection.query(
                `UPDATE KY_Video_File_Inventory SET EvidenceYear=?,Department=?,SafetyUnit=?,ExternalBackupConfirmed=1,ExternalReference=?,
                 OriginalFileName=?,MimeType=?,FileSize=?,SHA256=?,ProductionVideoUrl=?,ProductionStoredName=?,Status='Pending',
                 DeclaredByID=?,DeclaredByName=?,DeclaredAt=NOW(),VerifiedByID=NULL,VerifiedByName=NULL,VerifiedAt=NULL,
                 VerificationNote=NULL,ProductionDeletedByID=NULL,ProductionDeletedByName=NULL,ProductionDeletedAt=NULL,
                 ProductionDeletionReason=NULL,RowVersion=RowVersion+1 WHERE id=?`,
                [evidenceYear, activity.Department, activity.SafetyUnit || null, externalReference, originalFileName, mimeType,
                    recordedSize, recordedHash, productionVideoUrl, path.basename(localPath), actorId, actorName, id]
            );
        } else {
            await connection.query(
                `INSERT INTO KY_Video_File_Inventory
                 (id,EvidenceYear,ActivityID,Department,SafetyUnit,ExternalBackupConfirmed,ExternalReference,OriginalFileName,MimeType,
                  FileSize,SHA256,ProductionVideoUrl,ProductionStoredName,Status,DeclaredByID,DeclaredByName)
                 VALUES (?,?,?,?,?,1,?,?,?,?,?,?,?,'Pending',?,?)`,
                [id, evidenceYear, activityId, activity.Department, activity.SafetyUnit || null, externalReference, originalFileName,
                    mimeType, recordedSize, recordedHash, productionVideoUrl, path.basename(localPath), actorId, actorName]
            );
        }
        const [afterRows] = await connection.query('SELECT * FROM KY_Video_File_Inventory WHERE id=?', [id]);
        await kyVideoInventoryAudit(connection, req, before ? 'BACKUP_METADATA_UPDATED' : 'BACKUP_DECLARED', before, afterRows[0], adminAttested
            ? 'Admin registered the external filename; Production size and SHA-256 were captured server-side. External copy awaits Admin verification.'
            : 'External backup metadata matched the Production video.');
        await connection.commit();
        res.status(before ? 200 : 201).json({ success: true, data: kyVideoInventoryPublic(afterRows[0]) });
    } catch (error) {
        if (connection) { try { await connection.rollback(); } catch (_) {} }
        console.error('KY Production video inventory declaration error:', error);
        res.status(error.status || 500).json({ success: false, code: error.code, message: error.message || 'Unable to register Production video inventory.' });
    } finally { if (connection) connection.release(); }
});

router.post('/video-inventory/:inventoryId/verify', isAdmin, async (req, res) => {
    let connection;
    try {
        await ensureTables();
        const status = String(req.body?.status || 'Verified');
        const rowVersion = Number(req.body?.rowVersion || 0);
        const note = String(req.body?.note || '').trim();
        if (!['Verified', 'NeedsCorrection'].includes(status) || !Number.isInteger(rowVersion) || rowVersion < 1) {
            return res.status(400).json({ success: false, message: 'Status and row version are required.' });
        }
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT * FROM KY_Video_File_Inventory WHERE id=? FOR UPDATE', [req.params.inventoryId]);
        const before = rows[0];
        if (!before) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Production video inventory record not found.' }); }
        if (Number(before.RowVersion) !== rowVersion) { await connection.rollback(); return res.status(409).json({ success: false, code: 'KY_VIDEO_INVENTORY_STALE', message: 'Inventory metadata changed. Refresh and retry.' }); }
        if (status === 'Verified' && (!Number(before.ExternalBackupConfirmed) || !String(before.ExternalReference || '').trim() || !/^[a-f0-9]{64}$/i.test(String(before.SHA256 || '')))) {
            await connection.rollback();
            return res.status(400).json({ success: false, code: 'KY_EXTERNAL_BACKUP_REQUIRED', message: 'Complete external backup metadata is required before verification.' });
        }
        const actorId = currentUserId(req) || null;
        const actorName = req.user?.name || req.user?.EmployeeName || req.user?.username || 'Admin';
        await connection.query(
            `UPDATE KY_Video_File_Inventory SET Status=?,VerificationNote=?,VerifiedByID=?,VerifiedByName=?,VerifiedAt=?,RowVersion=RowVersion+1 WHERE id=? AND RowVersion=?`,
            [status, note || null, actorId, actorName, status === 'Verified' ? new Date() : null, before.id, rowVersion]
        );
        const [afterRows] = await connection.query('SELECT * FROM KY_Video_File_Inventory WHERE id=?', [before.id]);
        await kyVideoInventoryAudit(connection, req, status === 'Verified' ? 'ADMIN_VERIFIED' : 'NEEDS_CORRECTION', before, afterRows[0], note);
        await connection.commit();
        res.json({ success: true, data: kyVideoInventoryPublic(afterRows[0]) });
    } catch (error) {
        if (connection) { try { await connection.rollback(); } catch (_) {} }
        res.status(error.status || 500).json({ success: false, code: error.code, message: error.message || 'Unable to verify Production video inventory.' });
    } finally { if (connection) connection.release(); }
});

router.post('/video-inventory/delete-production', isAdmin, async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 100) : [];
    const reason = String(req.body?.reason || '').trim();
    if (!items.length || !reason) return res.status(400).json({ success: false, message: 'Select inventory records and provide a deletion reason.' });
    const quarantined = [];
    let connection;
    let committed = false;
    try {
        await ensureTables();
        connection = await db.getConnection();
        await connection.beginTransaction();
        const rows = [];
        for (const item of items) {
            const [found] = await connection.query('SELECT * FROM KY_Video_File_Inventory WHERE id=? FOR UPDATE', [String(item.id || '')]);
            const row = found[0];
            if (!row || Number(row.RowVersion) !== Number(item.rowVersion)) throw Object.assign(new Error('Inventory record is missing or stale.'), { status: 409, code: 'KY_VIDEO_INVENTORY_STALE' });
            if (await kyActiveContestEntry(connection, row.ActivityID, true)) throw Object.assign(new Error('This Production video is the active annual Unit contest entry and cannot be deleted.'), { status: 409, code: 'KY_CONTEST_ENTRY_RETENTION_HOLD' });
            if (!kyVideoInventoryPublic(row).canDeleteProductionFile) throw Object.assign(new Error('Every selected file must have a verified matching external backup.'), { status: 409, code: 'KY_VIDEO_INVENTORY_NOT_VERIFIED' });
            const [activityRows] = await connection.query('SELECT id,VideoUrl FROM KY_Activities WHERE id=? FOR UPDATE', [row.ActivityID]);
            if (!activityRows[0] || String(activityRows[0].VideoUrl || '') !== String(row.ProductionVideoUrl || '')) throw Object.assign(new Error('The activity video reference changed. Refresh and register the current file again.'), { status: 409, code: 'KY_VIDEO_INVENTORY_ACTIVITY_STALE' });
            const localPath = kyAnnualLocalVideo(row.ProductionVideoUrl);
            if (!localPath) throw Object.assign(new Error('A selected Production file is unavailable.'), { status: 404 });
            if ((await kyFileSha256(localPath)) !== String(row.SHA256 || '').toLowerCase()) throw Object.assign(new Error('A selected Production file failed SHA-256 verification.'), { status: 409, code: 'KY_VIDEO_INVENTORY_HASH_MISMATCH' });
            rows.push({ row, localPath });
        }
        for (const entry of rows) {
            const quarantine = `${entry.localPath}.ky-inventory-delete-${randomUUID()}.tmp`;
            fs.renameSync(entry.localPath, quarantine);
            quarantined.push({ ...entry, quarantine });
        }
        const actorId = currentUserId(req) || null;
        const actorName = req.user?.name || req.user?.EmployeeName || req.user?.username || 'Admin';
        for (const entry of quarantined) {
            await connection.query('UPDATE KY_Activities SET VideoUrl=NULL WHERE id=? AND VideoUrl=?', [entry.row.ActivityID, entry.row.ProductionVideoUrl]);
            await connection.query(
                `UPDATE KY_Video_File_Inventory SET ProductionDeletedByID=?,ProductionDeletedByName=?,ProductionDeletedAt=NOW(),ProductionDeletionReason=?,RowVersion=RowVersion+1 WHERE id=?`,
                [actorId, actorName, reason, entry.row.id]
            );
            const [afterRows] = await connection.query('SELECT * FROM KY_Video_File_Inventory WHERE id=?', [entry.row.id]);
            await kyVideoInventoryAudit(connection, req, 'PRODUCTION_FILE_DELETED', entry.row, afterRows[0], reason);
        }
        await connection.commit();
        committed = true;
        for (const entry of quarantined) { try { fs.unlinkSync(entry.quarantine); } catch (error) { console.error('KY inventory quarantine cleanup error:', error); } }
        res.json({ success: true, data: { deleted: quarantined.length } });
    } catch (error) {
        if (connection && !committed) { try { await connection.rollback(); } catch (_) {} }
        if (!committed) for (const entry of quarantined.reverse()) { try { if (fs.existsSync(entry.quarantine) && !fs.existsSync(entry.localPath)) fs.renameSync(entry.quarantine, entry.localPath); } catch (_) {} }
        res.status(error.status || 500).json({ success: false, code: error.code, message: error.message || 'Unable to delete Production video inventory files.' });
    } finally { if (connection) connection.release(); }
});

router.get('/annual-video-evidence/:evidenceId/download', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT * FROM KY_Annual_Video_Evidence WHERE id = ? LIMIT 1', [req.params.evidenceId]);
        const row = rows[0];
        if (!row) return res.status(404).json({ success: false, message: 'Annual video evidence not found.' });
        if (row.ProductionDeletedAt) return res.status(410).json({ success: false, message: 'Production copy has already been removed.' });
        const localPath = kyAnnualLocalVideo(row.ProductionVideoUrl);
        if (!localPath) return res.status(404).json({ success: false, message: 'Production video file is unavailable.' });
        const actualHash = await kyFileSha256(localPath);
        if (actualHash !== String(row.SHA256 || '').toLowerCase()) {
            return res.status(409).json({ success: false, code: 'KY_ANNUAL_VIDEO_HASH_MISMATCH', message: 'Production file SHA-256 no longer matches its evidence record.' });
        }
        res.download(localPath, row.OriginalFileName || path.basename(localPath));
    } catch (error) {
        console.error('KY annual video download error:', error);
        res.status(500).json({ success: false, message: 'Unable to download annual video evidence.' });
    }
});

router.post('/annual-video-evidence/declare', async (req, res) => {
    let connection;
    try {
        await ensureTables();
        const activityId = String(req.body?.activityId || '').trim();
        const storageMode = String(req.body?.storageMode || '').trim();
        if (!activityId || !KY_ANNUAL_VIDEO_STORAGE_MODES.has(storageMode)) {
            return res.status(400).json({ success: false, message: 'Activity and storage mode are required.' });
        }
        const [activityRows] = await db.query('SELECT * FROM KY_Activities WHERE id = ? LIMIT 1', [activityId]);
        const activity = activityRows[0];
        if (!activity) return res.status(404).json({ success: false, message: 'KY activity not found.' });
        if (!kyCanUploadFollowupVideoForUser(activity, req)) return res.status(403).json({ success: false, message: 'You cannot declare evidence for this activity.' });
        const evidenceYear = new Date(activity.ActivityDate).getFullYear();
        const department = String(activity.Department || '').trim();
        const safetyUnit = String(activity.SafetyUnit || '').trim();
        const requestedRowVersion = Number(req.body?.rowVersion || 0);
        if (!Number.isInteger(evidenceYear) || evidenceYear < 2000 || evidenceYear > 2200 || !department) {
            return res.status(400).json({ success: false, message: 'The KY activity needs a valid activity date and Department.' });
        }
        const scopeKey = kyAnnualScopeKey(department, safetyUnit);
        let originalFileName = String(req.body?.originalFileName || '').trim().slice(0, 255);
        let mimeType = String(req.body?.mimeType || '').trim().slice(0, 120) || null;
        let fileSize = Number(req.body?.fileSize || 0);
        let sha256 = String(req.body?.sha256 || '').trim().toLowerCase();
        let productionVideoUrl = null;
        let productionStoredName = null;
        let externalReference = String(req.body?.externalReference || '').trim();
        const externalBackupConfirmed = req.body?.externalBackupConfirmed === true || Number(req.body?.externalBackupConfirmed) === 1;
        if (storageMode === 'Production') {
            productionVideoUrl = String(activity.VideoUrl || '').trim();
            const localPath = kyAnnualLocalVideo(productionVideoUrl);
            if (!localPath) return res.status(400).json({ success: false, message: 'This activity has no readable Production video.' });
            productionStoredName = path.basename(localPath);
            originalFileName = originalFileName || kyMediaHealthStatus(productionVideoUrl, 'VideoUrl').originalName || productionStoredName;
            fileSize = fs.statSync(localPath).size;
            sha256 = await kyFileSha256(localPath);
        } else {
            if (!externalBackupConfirmed || !externalReference) {
                return res.status(400).json({ success: false, code: 'KY_EXTERNAL_BACKUP_REQUIRED', message: 'Confirm the central-machine copy and provide its reference/path.' });
            }
            if (!originalFileName || !Number.isSafeInteger(fileSize) || fileSize <= 0 || !/^[a-f0-9]{64}$/.test(sha256)) {
                return res.status(400).json({ success: false, message: 'External evidence requires filename, size and SHA-256.' });
            }
            productionVideoUrl = String(activity.VideoUrl || '').trim() || null;
            if (productionVideoUrl) productionStoredName = kyMediaHealthStatus(productionVideoUrl, 'VideoUrl').storedName || null;
        }
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [currentRows] = await connection.query(
            'SELECT * FROM KY_Annual_Video_Evidence WHERE EvidenceYear = ? AND ScopeKey = ? FOR UPDATE',
            [evidenceYear, scopeKey]
        );
        const before = currentRows[0] || null;
        if (before?.Status === 'Verified') {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'KY_ANNUAL_VIDEO_ALREADY_VERIFIED', message: 'This annual scope is already verified. Mark it for correction before replacing it.' });
        }
        if (before && (!Number.isInteger(requestedRowVersion) || requestedRowVersion !== Number(before.RowVersion))) {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'KY_ANNUAL_VIDEO_STALE', message: 'Evidence was changed by another user. Refresh and retry.' });
        }
        const id = before?.id || randomUUID();
        const actorId = currentUserId(req) || null;
        const actorName = req.user?.name || req.user?.EmployeeName || req.user?.username || 'User';
        if (before) {
            await connection.query(
                `UPDATE KY_Annual_Video_Evidence SET ActivityID=?, StorageMode=?, ExternalBackupConfirmed=?, ExternalReference=?,
                 OriginalFileName=?, MimeType=?, FileSize=?, SHA256=?, ProductionVideoUrl=?, ProductionStoredName=?, Status='Pending',
                 DeclaredByID=?, DeclaredByName=?, DeclaredAt=NOW(), VerifiedByID=NULL, VerifiedByName=NULL, VerifiedAt=NULL,
                 VerificationNote=NULL, ProductionDeletedByID=NULL, ProductionDeletedByName=NULL, ProductionDeletedAt=NULL,
                 ProductionDeletionReason=NULL, RowVersion=RowVersion+1 WHERE id=?`,
                [activityId, storageMode, externalBackupConfirmed ? 1 : 0, externalReference || null, originalFileName, mimeType,
                    fileSize, sha256, productionVideoUrl, productionStoredName, actorId, actorName, id]
            );
        } else {
            await connection.query(
                `INSERT INTO KY_Annual_Video_Evidence
                 (id,EvidenceYear,ScopeKey,Department,SafetyUnit,ActivityID,StorageMode,ExternalBackupConfirmed,ExternalReference,
                  OriginalFileName,MimeType,FileSize,SHA256,ProductionVideoUrl,ProductionStoredName,Status,DeclaredByID,DeclaredByName)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [id, evidenceYear, scopeKey, department, safetyUnit || null, activityId, storageMode, externalBackupConfirmed ? 1 : 0,
                    externalReference || null, originalFileName, mimeType, fileSize, sha256, productionVideoUrl, productionStoredName,
                    'Pending', actorId, actorName]
            );
        }
        const [afterRows] = await connection.query('SELECT * FROM KY_Annual_Video_Evidence WHERE id = ?', [id]);
        await kyAnnualAudit(connection, req, before ? 'DECLARATION_UPDATED' : 'DECLARED', before, afterRows[0], 'Annual KY video evidence declared.');
        await connection.commit();
        res.status(before ? 200 : 201).json({ success: true, data: kyAnnualEvidencePublic(afterRows[0]) });
    } catch (error) {
        if (connection) { try { await connection.rollback(); } catch (_) {} }
        console.error('KY annual video declaration error:', error);
        res.status(500).json({ success: false, message: 'Unable to declare annual video evidence.' });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/annual-video-evidence/:evidenceId/verify', isAdmin, async (req, res) => {
    let connection;
    try {
        await ensureTables();
        const status = String(req.body?.status || 'Verified');
        const rowVersion = Number(req.body?.rowVersion || 0);
        const note = String(req.body?.note || '').trim();
        if (!['Verified', 'NeedsCorrection'].includes(status) || !Number.isInteger(rowVersion) || rowVersion < 1) {
            return res.status(400).json({ success: false, message: 'Status and row version are required.' });
        }
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT * FROM KY_Annual_Video_Evidence WHERE id = ? FOR UPDATE', [req.params.evidenceId]);
        const before = rows[0];
        if (!before) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Annual video evidence not found.' });
        }
        if (Number(before.RowVersion) !== rowVersion) {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'KY_ANNUAL_VIDEO_STALE', message: 'Evidence was changed by another user. Refresh and retry.' });
        }
        if (status === 'Verified' && before.StorageMode === 'CentralMachine' && (!Number(before.ExternalBackupConfirmed) || !String(before.ExternalReference || '').trim())) {
            await connection.rollback();
            return res.status(400).json({ success: false, code: 'KY_EXTERNAL_BACKUP_REQUIRED', message: 'External backup must be confirmed before verification.' });
        }
        const actorId = currentUserId(req) || null;
        const actorName = req.user?.name || req.user?.EmployeeName || req.user?.username || 'Admin';
        await connection.query(
            `UPDATE KY_Annual_Video_Evidence SET Status=?, VerificationNote=?, VerifiedByID=?, VerifiedByName=?,
             VerifiedAt=?, RowVersion=RowVersion+1 WHERE id=? AND RowVersion=?`,
            [status, note || null, actorId, actorName, status === 'Verified' ? new Date() : null, before.id, rowVersion]
        );
        const [afterRows] = await connection.query('SELECT * FROM KY_Annual_Video_Evidence WHERE id = ?', [before.id]);
        await kyAnnualAudit(connection, req, status === 'Verified' ? 'ADMIN_VERIFIED' : 'NEEDS_CORRECTION', before, afterRows[0], note);
        await connection.commit();
        res.json({ success: true, data: kyAnnualEvidencePublic(afterRows[0]) });
    } catch (error) {
        if (connection) { try { await connection.rollback(); } catch (_) {} }
        console.error('KY annual video verification error:', error);
        res.status(500).json({ success: false, message: 'Unable to verify annual video evidence.' });
    } finally { if (connection) connection.release(); }
});

router.post('/annual-video-evidence/delete-production', isAdmin, async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 100) : [];
    const reason = String(req.body?.reason || '').trim();
    if (!items.length || !reason) return res.status(400).json({ success: false, message: 'Select evidence and provide a deletion reason.' });
    const quarantined = [];
    let connection;
    let committed = false;
    try {
        await ensureTables();
        connection = await db.getConnection();
        await connection.beginTransaction();
        const rows = [];
        for (const item of items) {
            const [found] = await connection.query('SELECT * FROM KY_Annual_Video_Evidence WHERE id = ? FOR UPDATE', [String(item.id || '')]);
            const row = found[0];
            if (!row || Number(row.RowVersion) !== Number(item.rowVersion)) throw Object.assign(new Error('Evidence is missing or stale.'), { status: 409, code: 'KY_ANNUAL_VIDEO_STALE' });
            if (await kyActiveContestEntry(connection, row.ActivityID, true)) throw Object.assign(new Error('This Production video is the active annual Unit contest entry and cannot be deleted.'), { status: 409, code: 'KY_CONTEST_ENTRY_RETENTION_HOLD' });
            const safe = kyAnnualEvidencePublic(row);
            if (!safe.canDeleteProductionFile) throw Object.assign(new Error('Every selected file must be Admin verified with a confirmed external backup.'), { status: 409, code: 'KY_EXTERNAL_BACKUP_NOT_VERIFIED' });
            const [activityRows] = await connection.query('SELECT id, VideoUrl FROM KY_Activities WHERE id = ? FOR UPDATE', [row.ActivityID]);
            if (!activityRows[0] || String(activityRows[0].VideoUrl || '') !== String(row.ProductionVideoUrl || '')) {
                throw Object.assign(new Error('The activity video reference changed. Refresh and register the current file before deleting.'), { status: 409, code: 'KY_ANNUAL_VIDEO_ACTIVITY_STALE' });
            }
            const localPath = kyAnnualLocalVideo(row.ProductionVideoUrl);
            if (!localPath) throw Object.assign(new Error('A selected Production file is unavailable.'), { status: 404 });
            const hash = await kyFileSha256(localPath);
            if (hash !== String(row.SHA256).toLowerCase()) throw Object.assign(new Error('A selected Production file failed SHA-256 verification.'), { status: 409, code: 'KY_ANNUAL_VIDEO_HASH_MISMATCH' });
            rows.push({ row, localPath });
        }
        for (const entry of rows) {
            const quarantine = `${entry.localPath}.ky-delete-${randomUUID()}.tmp`;
            fs.renameSync(entry.localPath, quarantine);
            quarantined.push({ ...entry, quarantine });
        }
        const actorId = currentUserId(req) || null;
        const actorName = req.user?.name || req.user?.EmployeeName || req.user?.username || 'Admin';
        for (const entry of quarantined) {
            await connection.query('UPDATE KY_Activities SET VideoUrl=NULL WHERE id=? AND VideoUrl=?', [entry.row.ActivityID, entry.row.ProductionVideoUrl]);
            await connection.query(
                `UPDATE KY_Annual_Video_Evidence SET ProductionDeletedByID=?, ProductionDeletedByName=?, ProductionDeletedAt=NOW(),
                 ProductionDeletionReason=?, RowVersion=RowVersion+1 WHERE id=?`,
                [actorId, actorName, reason, entry.row.id]
            );
            const [afterRows] = await connection.query('SELECT * FROM KY_Annual_Video_Evidence WHERE id=?', [entry.row.id]);
            await kyAnnualAudit(connection, req, 'PRODUCTION_FILE_DELETED', entry.row, afterRows[0], reason);
        }
        await connection.commit();
        committed = true;
        for (const entry of quarantined) {
            try { fs.unlinkSync(entry.quarantine); } catch (cleanupError) { console.error('KY annual video quarantine cleanup error:', cleanupError); }
        }
        res.json({ success: true, data: { deleted: quarantined.length } });
    } catch (error) {
        if (connection && !committed) { try { await connection.rollback(); } catch (_) {} }
        if (!committed) {
            for (const entry of quarantined.reverse()) {
                try { if (fs.existsSync(entry.quarantine) && !fs.existsSync(entry.localPath)) fs.renameSync(entry.quarantine, entry.localPath); } catch (_) {}
            }
        }
        res.status(error.status || 500).json({ success: false, code: error.code, message: error.message || 'Unable to delete Production video files.' });
    } finally { if (connection) connection.release(); }
});

router.get('/evidence-overview', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const [configs] = await db.query(
            `SELECT Department, SafetyUnits, YearlyTarget
             FROM KY_Program_Config
             WHERE Year = ? AND IsActive = 1
             ORDER BY Department`,
            [year]
        );
        const rows = [];
        const rowMap = new Map();
        const configuredDeptKeys = new Set();
        const addRow = (department, safetyUnit, yearlyTarget, order) => {
            const key = `${kyNormKey(department)}||${kyNormKey(safetyUnit)}`;
            if (rowMap.has(key)) return;
            const row = {
                key,
                department,
                safetyUnit,
                yearlyTarget: Number(yearlyTarget || 0),
                submitted: 0,
                progressPct: 0,
                complete: 0,
                waitingVideo: 0,
                missingFile: 0,
                productionVideo: 0,
                verifiedExternalVideo: 0,
                pendingExternalVideo: 0,
                records: [],
                order,
            };
            rowMap.set(key, row);
            rows.push(row);
        };
        configs.forEach((cfg, deptIndex) => {
            const department = String(cfg.Department || '').trim();
            if (!department) return;
            configuredDeptKeys.add(kyNormKey(department));
            const units = parseSafetyUnits(cfg.SafetyUnits);
            (units.length ? units : ['']).forEach((unit, unitIndex) => {
                addRow(department, unit, cfg.YearlyTarget || 12, (deptIndex * 1000) + unitIndex);
            });
        });
        if (!rows.length) {
            return res.json({
                success: true,
                data: {
                    phase: 'ky_evidence_overview_phase6',
                    year,
                    sourceOfTruth: 'KY_Program_Config',
                    rows: [],
                    summary: { departments: 0, safetyUnits: 0, submitted: 0, complete: 0, waitingVideo: 0, missingFile: 0, productionVideo: 0, verifiedExternalVideo: 0, pendingExternalVideo: 0 },
                    unmatchedActivities: [],
                },
            });
        }
        const [contestRows] = await db.query(
            `SELECT * FROM KY_Annual_Unit_Contest_Entries WHERE EntryYear=? AND Status='Submitted'`,
            [year]
        );
        const contestByScope = new Map(contestRows.map(entry => [entry.ScopeKey, entry]));
        const [activities] = await db.query(`
            SELECT a.id, a.ActivityDate, a.ReporterID, a.ReporterName, a.SubmittedByID, a.SubmittedByName,
                   a.Department, a.SafetyUnit, a.TeamName, a.KYTKeyword, a.RiskCategory, a.HazardDescription,
                   a.AttachmentUrl, a.VideoUrl, a.Status, a.Participants, a.CreatedAt,
                   ${kyVideoEvidenceSelectSql('a')}
            FROM KY_Activities a
            WHERE YEAR(a.ActivityDate) = ?
            ORDER BY a.ActivityDate DESC, a.CreatedAt DESC
        `, [year]);
        const unmatchedActivities = [];
        activities.forEach(activity => {
            const deptKey = kyNormKey(activity.Department);
            if (!configuredDeptKeys.has(deptKey)) return;
            const key = `${deptKey}||${kyNormKey(activity.SafetyUnit)}`;
            const row = rowMap.get(key);
            if (!row) {
                unmatchedActivities.push({
                    id: activity.id,
                    department: activity.Department,
                    safetyUnit: activity.SafetyUnit,
                    reason: 'Safety Unit not active in Program Config',
                });
                return;
            }
            const hasFile = Boolean(String(activity.AttachmentUrl || '').trim());
            const hasProductionVideo = Boolean(Number(activity.HasProductionVideo || 0));
            const hasVerifiedExternalVideo = Boolean(Number(activity.HasVerifiedExternalVideo || 0));
            const hasPendingExternalVideo = Boolean(Number(activity.HasPendingExternalVideo || 0));
            const hasVideo = Boolean(Number(activity.HasVideoEvidence || 0));
            const contestEntry = contestByScope.get(kyAnnualScopeKey(activity.Department, activity.SafetyUnit)) || null;
            const status = hasFile && hasVideo
                ? 'complete'
                : (hasFile && hasPendingExternalVideo ? 'external_pending' : (hasFile ? 'waiting_video' : 'missing_file'));
            row.submitted += 1;
            if (status === 'complete') row.complete += 1;
            else if (status === 'waiting_video') row.waitingVideo += 1;
            else if (status === 'missing_file') row.missingFile += 1;
            if (hasProductionVideo) row.productionVideo += 1;
            else if (hasVerifiedExternalVideo) row.verifiedExternalVideo += 1;
            else if (hasPendingExternalVideo) row.pendingExternalVideo += 1;
            row.records.push({
                id: activity.id,
                activityDate: activity.ActivityDate,
                reporterId: activity.ReporterID,
                reporterName: activity.ReporterName,
                submittedById: activity.SubmittedByID,
                submittedByName: activity.SubmittedByName,
                department: row.department,
                safetyUnit: row.safetyUnit || '',
                teamName: activity.TeamName,
                kytKeyword: activity.KYTKeyword,
                riskCategory: activity.RiskCategory,
                hazard: activity.HazardDescription,
                status: activity.Status,
                evidenceStatus: status,
                hasFile,
                hasVideo,
                hasProductionVideo,
                hasVerifiedExternalVideo,
                hasPendingExternalVideo,
                videoEvidenceStorage: activity.VideoEvidenceStorage,
                activityExternalEvidenceId: activity.ActivityExternalEvidenceID || null,
                activityExternalStatus: activity.ActivityExternalStatus || null,
                activityExternalRowVersion: Number(activity.ActivityExternalRowVersion || 0),
                canUploadVideo: kyCanUploadFollowupVideoForUser(activity, req) && (!hasVideo || isKyAdmin(req)),
                canRegisterExternalVideo: isKyAdmin(req),
                isContestEntry: contestEntry?.ActivityID === activity.id,
                contestEntryId: contestEntry?.id || null,
                canSubmitContestEntry: hasProductionVideo && kyCanManageContestForScope(activity, req),
            });
        });
        rows.forEach(row => {
            row.progressPct = row.yearlyTarget > 0 ? Math.min(100, Math.round(row.submitted / row.yearlyTarget * 100)) : 0;
            Object.assign(row, kyAnnualComplianceState(row.yearlyTarget, row.productionVideo, row.verifiedExternalVideo, row.pendingExternalVideo));
            row.contestEntry = contestByScope.get(kyAnnualScopeKey(row.department, row.safetyUnit)) || null;
            row.hasContestEntry = Boolean(row.contestEntry);
        });
        const deptProgress = new Map();
        rows.forEach(row => {
            const key = kyNormKey(row.department);
            if (!deptProgress.has(key)) deptProgress.set(key, { submitted: 0, target: 0, pct: 0 });
            const dept = deptProgress.get(key);
            dept.submitted += row.submitted;
            dept.target += row.yearlyTarget;
            dept.pct = dept.target > 0 ? Math.min(100, Math.round(dept.submitted / dept.target * 100)) : 0;
        });
        rows.sort((a, b) => {
            const aDept = deptProgress.get(kyNormKey(a.department)) || { pct: 0 };
            const bDept = deptProgress.get(kyNormKey(b.department)) || { pct: 0 };
            return aDept.pct - bDept.pct
                || a.department.localeCompare(b.department)
                || Number(a.order || 0) - Number(b.order || 0);
        });
        rows.forEach(row => {
            delete row.order;
        });
        const summary = rows.reduce((acc, row) => {
            acc.submitted += row.submitted;
            acc.complete += row.complete;
            acc.waitingVideo += row.waitingVideo;
            acc.missingFile += row.missingFile;
            acc.productionVideo += row.productionVideo;
            acc.verifiedExternalVideo += row.verifiedExternalVideo;
            acc.pendingExternalVideo += row.pendingExternalVideo;
            acc.evidenceTotal += row.evidenceTotal;
            if (row.annualCompliant) acc.annualCompliantScopes += 1;
            if (row.hasContestEntry) acc.contestEntries += 1;
            return acc;
        }, {
            departments: new Set(rows.map(row => row.department)).size,
            safetyUnits: rows.length,
            submitted: 0,
            complete: 0,
            waitingVideo: 0,
            missingFile: 0,
            productionVideo: 0,
            verifiedExternalVideo: 0,
            pendingExternalVideo: 0,
            evidenceTotal: 0,
            annualCompliantScopes: 0,
            contestEntries: 0,
        });
        res.json({
            success: true,
            data: {
                phase: 'ky_evidence_overview_phase6',
                year,
                sourceOfTruth: 'KY_Program_Config',
                rows,
                summary,
                unmatchedActivities,
            },
        });
    } catch (error) {
        console.error('KY evidence overview error:', error);
        res.status(500).json({ success: false, message: 'Unable to load KY evidence overview.' });
    }
});

router.post('/file-health/repair-legacy', isAdmin, async (req, res) => {
    const connection = await db.getConnection();
    try {
        await ensureTables();
        const year = parseInt(req.body?.year || req.query.year) || new Date().getFullYear();
        const apply = req.body?.apply === true || req.body?.apply === 1 || req.body?.apply === '1';
        if (apply && req.body?.confirmation !== 'REPAIR_KY_LEGACY_URLS') {
            return res.status(400).json({
                success: false,
                message: 'Apply requires confirmation REPAIR_KY_LEGACY_URLS.',
            });
        }
        const publicBaseUrl = kyPublicBaseUrl(req);
        if (!kyPublicBaseUrlIsSafe(publicBaseUrl)) {
            return res.status(400).json({ success: false, message: 'A non-local public upload base URL is required.' });
        }
        const [records] = await connection.query(`
            SELECT id, ActivityDate, ReporterID, ReporterName, Department, SafetyUnit,
                   TeamName, KYTKeyword, AttachmentUrl, VideoUrl, Status, CreatedAt
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ?
            ORDER BY ActivityDate DESC, CreatedAt DESC
        `, [year]);
        const candidates = [];
        for (const record of records) {
            const updates = {};
            for (const field of ['AttachmentUrl', 'VideoUrl']) {
                const rewrite = kyLegacyUploadRewrite(record[field], req);
                if (!rewrite) continue;
                updates[field] = rewrite.nextUrl;
                candidates.push({
                    activityId: record.id,
                    activityDate: record.ActivityDate,
                    reporterId: record.ReporterID,
                    reporterName: record.ReporterName,
                    department: record.Department,
                    safetyUnit: record.SafetyUnit,
                    teamName: record.TeamName,
                    kytKeyword: record.KYTKeyword,
                    field,
                    storedName: rewrite.storedName,
                    oldUrl: record[field],
                    newUrl: rewrite.nextUrl,
                    size: rewrite.size,
                    modifiedAt: rewrite.modifiedAt,
                });
            }
        }
        let repaired = 0;
        if (apply && candidates.length) {
            await connection.beginTransaction();
            for (const candidate of candidates) {
                const field = candidate.field === 'AttachmentUrl' ? 'AttachmentUrl' : 'VideoUrl';
                const [result] = await connection.query(
                    `UPDATE KY_Activities SET ${field} = ? WHERE id = ? AND ${field} = ?`,
                    [candidate.newUrl, candidate.activityId, candidate.oldUrl]
                );
                repaired += Number(result.affectedRows || 0);
            }
            if (repaired !== candidates.length) {
                throw new Error(`KY legacy URL repair conflict: expected ${candidates.length}, updated ${repaired}`);
            }
            await connection.commit();
            await logAudit(req, {
                action: 'KY_REPAIR_LEGACY_MEDIA_URLS',
                module: 'ky',
                targetType: 'KY_Activities',
                targetId: year,
                detail: `Repaired ${repaired} KY legacy localhost media URL(s) for ${year}`,
                metadata: { year, repaired, candidates },
            });
        }
        res.json({
            success: true,
            data: {
                phase: 'ky_media_legacy_url_repair',
                dryRun: !apply,
                applied: apply,
                year,
                repaired: apply ? repaired : 0,
                candidateCount: candidates.length,
                candidates,
                note: apply
                    ? 'Legacy localhost KY media URLs were rewritten to the configured public upload base URL.'
                    : 'Dry run only. No database rows were changed.',
            },
        });
    } catch (error) {
        if (connection.connection?._closing !== true) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('KY legacy media repair error:', error);
        res.status(500).json({ success: false, message: 'Unable to repair KY legacy media URLs.' });
    } finally {
        connection.release();
    }
});

router.get('/videos', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 12, 1), 50);
        const offset = (page - 1) * pageSize;
        const userId = currentUserId(req) || '__anonymous__';
        const admin = isKyAdmin(req);
        const where = [
            'a.VideoUrl IS NOT NULL',
            "a.VideoUrl <> ''",
            'YEAR(a.ActivityDate) = ?',
        ];
        const params = [year];
        const add = (condition, value) => {
            if (value === undefined || value === null || value === '' || value === 'all') return;
            where.push(condition);
            params.push(value);
        };
        add('a.Department = ?', req.query.department || req.query.dept);
        add('a.SafetyUnit = ?', req.query.safetyUnit);
        add('a.RiskCategory = ?', req.query.riskCategory || req.query.risk);
        add('a.Status = ?', req.query.status);
        if (req.query.pinned !== undefined && req.query.pinned !== 'all') {
            where.push('COALESCE(a.IsVideoPinned, 0) = ?');
            params.push(req.query.pinned === '1' || req.query.pinned === 'true' ? 1 : 0);
        }
        if (!admin) {
            where.push('COALESCE(a.ShowVideoOnDashboard, 1) = 1');
        } else if (req.query.show !== undefined && req.query.show !== 'all') {
            where.push('COALESCE(a.ShowVideoOnDashboard, 1) = ?');
            params.push(req.query.show === '0' || req.query.show === 'false' || req.query.show === 'hidden' ? 0 : 1);
        }
        const q = String(req.query.q || '').trim();
        if (q) {
            where.push('(a.ReporterName LIKE ? OR a.SubmittedByName LIKE ? OR a.Department LIKE ? OR a.SafetyUnit LIKE ? OR a.TeamName LIKE ? OR a.KYTKeyword LIKE ? OR a.HazardDescription LIKE ? OR a.Countermeasure LIKE ?)');
            const like = `%${q}%`;
            params.push(like, like, like, like, like, like, like, like);
        }
        const whereSql = where.join(' AND ');
        const reactionJoin = `
            LEFT JOIN (
                SELECT
                    ActivityID,
                    SUM(Reaction = 'useful')    AS UsefulCount,
                    SUM(Reaction = 'practice')  AS PracticeCount,
                    SUM(Reaction = 'awareness') AS AwarenessCount,
                    SUM(Reaction = 'attention') AS AttentionCount,
                    COUNT(*) AS ReactionTotal
                FROM KY_Video_Reactions
                GROUP BY ActivityID
            ) rc ON rc.ActivityID = a.id
            LEFT JOIN KY_Video_Reactions ur ON ur.ActivityID = a.id AND ur.EmployeeID = ?`;

        const [items] = await db.query(`
            SELECT
                a.id, a.ActivityDate, a.ReporterID, a.ReporterName, a.SubmittedByID, a.SubmittedByName,
                a.Department, a.SafetyUnit, a.TeamName, a.KYTKeyword, a.RiskCategory, a.HazardDescription,
                a.Countermeasure, a.VideoUrl, a.Status, a.IsVideoPinned, a.ShowVideoOnDashboard, a.CreatedAt,
                COALESCE(rc.UsefulCount, 0)    AS UsefulCount,
                COALESCE(rc.PracticeCount, 0)  AS PracticeCount,
                COALESCE(rc.AwarenessCount, 0) AS AwarenessCount,
                COALESCE(rc.AttentionCount, 0) AS AttentionCount,
                COALESCE(rc.ReactionTotal, 0)  AS ReactionTotal,
                COALESCE(rc.ReactionTotal, 0)  AS ReactionCount,
                ur.Reaction AS MyReaction
            FROM KY_Activities a
            ${reactionJoin}
            WHERE ${whereSql}
            ORDER BY COALESCE(a.IsVideoPinned, 0) DESC, COALESCE(rc.ReactionTotal, 0) DESC, a.CreatedAt DESC
            LIMIT ? OFFSET ?
        `, [userId, ...params, pageSize, offset]);

        const [[totalRow]] = await db.query(`SELECT COUNT(*) AS total FROM KY_Activities a WHERE ${whereSql}`, params);
        const [[summaryRow]] = await db.query(`
            SELECT
                COUNT(*) AS totalVideos,
                SUM(COALESCE(a.IsVideoPinned, 0) = 1) AS pinnedVideos,
                SUM(COALESCE(a.ShowVideoOnDashboard, 1) = 0) AS hiddenVideos,
                COALESCE(SUM(COALESCE(rc.ReactionTotal, 0)), 0) AS totalReactions
            FROM KY_Activities a
            LEFT JOIN (
                SELECT ActivityID, COUNT(*) AS ReactionTotal
                FROM KY_Video_Reactions
                GROUP BY ActivityID
            ) rc ON rc.ActivityID = a.id
            WHERE ${whereSql}
        `, params);
        const [departments] = await db.query(`
            SELECT a.Department, COUNT(*) AS count
            FROM KY_Activities a
            WHERE ${whereSql} AND COALESCE(a.Department, '') <> ''
            GROUP BY a.Department
            ORDER BY count DESC, a.Department
            LIMIT 20
        `, params);

        res.json({
            success: true,
            data: {
                items,
                pagination: {
                    page,
                    pageSize,
                    total: Number(totalRow?.total || 0),
                    pages: Math.ceil(Number(totalRow?.total || 0) / pageSize),
                },
                summary: {
                    totalVideos: Number(summaryRow?.totalVideos || 0),
                    totalReactions: Number(summaryRow?.totalReactions || 0),
                    pinnedVideos: Number(summaryRow?.pinnedVideos || 0),
                    hiddenVideos: Number(summaryRow?.hiddenVideos || 0),
                    departments,
                },
                filters: {
                    year,
                    department: req.query.department || req.query.dept || 'all',
                    safetyUnit: req.query.safetyUnit || 'all',
                    riskCategory: req.query.riskCategory || req.query.risk || 'all',
                    status: req.query.status || 'all',
                    pinned: req.query.pinned ?? 'all',
                    show: admin ? (req.query.show ?? 'all') : '1',
                    q,
                },
            },
        });
    } catch (error) {
        console.error('KY all videos error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงคลังวิดีโอ KY ได้' });
    }
});

router.post('/:id/reaction', async (req, res) => {
    try {
        await ensureTables();
        const reaction = String(req.body?.reaction || '').trim();
        const userId = currentUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้งาน' });
        if (!KY_REACTIONS.includes(reaction)) {
            return res.status(400).json({ success: false, message: 'ประเภท Reaction ไม่ถูกต้อง' });
        }

        const [activities] = await db.query(
            `SELECT id FROM KY_Activities WHERE id = ? AND VideoUrl IS NOT NULL AND VideoUrl <> ''`,
            [req.params.id]
        );
        if (!activities.length) return res.status(404).json({ success: false, message: 'ไม่พบวิดีโอ KY' });

        await db.query(`
            INSERT INTO KY_Video_Reactions (ActivityID, EmployeeID, Reaction)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE Reaction = VALUES(Reaction), UpdatedAt = CURRENT_TIMESTAMP
        `, [req.params.id, userId, reaction]);

        res.json({ success: true, message: 'บันทึก Reaction สำเร็จ' });
    } catch (error) {
        console.error('KY reaction error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถบันทึก Reaction ได้' });
    }
});

router.get('/video-upload/config', (req, res) => {
    res.json({ success: true, data: kyVideoUploadConfig() });
});

router.post('/:id/video-upload/init', async (req, res) => {
    try {
        await ensureTables();
        kyCleanupStaleVideoUploads();
        const row = await kyLoadVideoUploadActivity(req.params.id);
        const access = kyCheckVideoUploadAccess(row, req);
        if (access.status) return res.status(access.status).json({ success: false, code: access.code, message: access.message });

        const fileName = cleanOriginalFilename(req.body?.fileName || 'video');
        const fileSize = Number(req.body?.fileSize || 0);
        const mimeType = String(req.body?.mimeType || '').trim().toLowerCase();
        const extension = path.extname(fileName).slice(1).toLowerCase();
        if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > KY_VIDEO_LIMIT) {
            return res.status(400).json({ success: false, code: 'KY_VIDEO_SIZE_INVALID', message: 'วิดีโอต้องมีขนาดไม่เกิน 200 MB' });
        }
        if (!KY_VIDEO_EXTENSIONS.has(extension) || (mimeType && !KY_VIDEO_MIME_TYPES.has(mimeType))) {
            return res.status(400).json({ success: false, code: 'KY_VIDEO_TYPE_INVALID', message: 'รองรับเฉพาะ MP4, MOV, WebM, AVI, MKV และ MPEG' });
        }

        const uploadId = randomUUID().replace(/-/g, '');
        const dir = kyVideoUploadDirectory(uploadId);
        fs.mkdirSync(dir, { recursive: false });
        const manifest = {
            uploadId,
            activityId: row.id,
            initiatedBy: access.userId,
            fileName,
            fileSize,
            mimeType,
            extension,
            chunkSize: KY_VIDEO_CHUNK_SIZE,
            totalChunks: Math.ceil(fileSize / KY_VIDEO_CHUNK_SIZE),
            maxFileSize: KY_VIDEO_LIMIT,
            requiresChunkSha256: true,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + KY_VIDEO_CHUNK_MAX_AGE_MS).toISOString(),
        };
        fs.writeFileSync(kyVideoManifestPath(uploadId), JSON.stringify(manifest), { encoding: 'utf8', flag: 'wx' });
        res.status(201).json({
            success: true,
            data: { ...kyVideoUploadConfig(), uploadId, totalChunks: manifest.totalChunks, expiresAt: manifest.expiresAt },
        });
    } catch (error) {
        console.error('KY video chunk init error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถเริ่มอัปโหลดวิดีโอ KY ได้' });
    }
});

router.post('/:id/video-upload/:uploadId/chunk/:index', (req, res) => {
    uploadKyVideoChunk.single('chunk')(req, res, async uploadError => {
        if (uploadError) {
            if (uploadError.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ success: false, code: 'KY_VIDEO_CHUNK_TOO_LARGE', message: 'ส่วนวิดีโอมีขนาดเกินขีดจำกัดที่เซิร์ฟเวอร์กำหนด', maxChunkSize: KY_VIDEO_CHUNK_SIZE });
            }
            return res.status(400).json({ success: false, code: 'KY_VIDEO_CHUNK_INVALID', message: uploadError.message || 'อัปโหลดส่วนวิดีโอไม่สำเร็จ' });
        }
        try {
            await ensureTables();
            const manifest = kyReadVideoManifest(req.params.uploadId);
            if (!manifest) return res.status(404).json({ success: false, message: 'ไม่พบชุดอัปโหลดหรือชุดอัปโหลดหมดอายุแล้ว' });
            const row = await kyLoadVideoUploadActivity(req.params.id);
            const access = kyCheckVideoUploadAccess(row, req, manifest);
            if (access.status) return res.status(access.status).json({ success: false, code: access.code, message: access.message });

            const index = Number(req.params.index);
            if (!Number.isInteger(index) || index < 0 || index >= manifest.totalChunks || !req.file?.buffer) {
                return res.status(400).json({ success: false, code: 'KY_VIDEO_CHUNK_INVALID', message: 'ข้อมูลส่วนวิดีโอไม่ถูกต้อง' });
            }
            const expectedSize = kyVideoExpectedChunkSize(manifest, index);
            if (req.file.buffer.length !== expectedSize) {
                return res.status(400).json({ success: false, code: 'KY_VIDEO_CHUNK_SIZE_MISMATCH', message: 'ขนาดส่วนวิดีโอไม่ตรงกับที่ระบบกำหนด' });
            }
            const suppliedHash = String(req.get('X-KY-Chunk-SHA256') || '').trim().toLowerCase();
            if (!/^[a-f0-9]{64}$/.test(suppliedHash)) {
                return res.status(400).json({ success: false, code: 'KY_VIDEO_CHUNK_HASH_REQUIRED', message: 'ไม่พบ SHA-256 ของส่วนวิดีโอหรือรูปแบบไม่ถูกต้อง' });
            }
            const actualHash = createHash('sha256').update(req.file.buffer).digest('hex');
            if (actualHash !== suppliedHash) {
                return res.status(409).json({ success: false, code: 'KY_VIDEO_CHUNK_HASH_MISMATCH', message: 'SHA-256 ของส่วนวิดีโอไม่ตรงกัน กรุณาอัปโหลดส่วนนี้ใหม่' });
            }
            const partPath = kyVideoPartPath(manifest, index);
            fs.writeFileSync(partPath, req.file.buffer);
            res.json({ success: true, data: { uploadId: manifest.uploadId, index, receivedBytes: expectedSize, sha256: actualHash } });
        } catch (error) {
            console.error('KY video chunk upload error:', error);
            res.status(500).json({ success: false, message: 'ไม่สามารถอัปโหลดส่วนวิดีโอ KY ได้' });
        }
    });
});

router.post('/:id/video-upload/:uploadId/complete', async (req, res) => {
    let finalPath = null;
    let connection = null;
    let lockHandle = null;
    let lockPath = null;
    try {
        await ensureTables();
        const manifest = kyReadVideoManifest(req.params.uploadId);
        if (!manifest) return res.status(404).json({ success: false, message: 'ไม่พบชุดอัปโหลดหรือชุดอัปโหลดหมดอายุแล้ว' });
        const initialRow = await kyLoadVideoUploadActivity(req.params.id);
        const initialAccess = kyCheckVideoUploadAccess(initialRow, req, manifest);
        if (initialAccess.status) return res.status(initialAccess.status).json({ success: false, message: initialAccess.message });

        lockPath = path.join(kyVideoUploadDirectory(manifest.uploadId), 'complete.lock');
        try {
            lockHandle = fs.openSync(lockPath, 'wx');
        } catch (error) {
            if (error.code === 'EEXIST') return res.status(409).json({ success: false, message: 'ระบบกำลังรวมวิดีโอนี้อยู่ กรุณารอสักครู่' });
            throw error;
        }

        let assembledSize = 0;
        for (let index = 0; index < manifest.totalChunks; index += 1) {
            const partPath = kyVideoPartPath(manifest, index);
            const expectedSize = kyVideoExpectedChunkSize(manifest, index);
            if (!partPath || !fs.existsSync(partPath) || fs.statSync(partPath).size !== expectedSize) {
                return res.status(409).json({ success: false, code: 'KY_VIDEO_CHUNKS_INCOMPLETE', message: `อัปโหลดวิดีโอยังไม่ครบ (ส่วนที่ ${index + 1})` });
            }
            assembledSize += expectedSize;
        }
        if (assembledSize !== manifest.fileSize) {
            return res.status(409).json({ success: false, code: 'KY_VIDEO_SIZE_MISMATCH', message: 'ขนาดวิดีโอรวมไม่ถูกต้อง' });
        }

        const storedName = `${Date.now()}-${randomUUID().replace(/-/g, '').slice(0, 16)}.${manifest.extension}`;
        finalPath = path.join(uploadsDir, storedName);
        const finalHandle = fs.openSync(finalPath, 'wx');
        const finalHash = createHash('sha256');
        try {
            for (let index = 0; index < manifest.totalChunks; index += 1) {
                const part = fs.readFileSync(kyVideoPartPath(manifest, index));
                finalHash.update(part);
                fs.writeSync(finalHandle, part);
            }
        } finally {
            fs.closeSync(finalHandle);
        }
        if (fs.statSync(finalPath).size !== manifest.fileSize || !kyVideoFileHeaderIsValid(finalPath, manifest.extension)) {
            fs.unlinkSync(finalPath);
            finalPath = null;
            return res.status(400).json({ success: false, code: 'KY_VIDEO_CONTENT_INVALID', message: 'เนื้อหาไฟล์ไม่ใช่วิดีโอชนิดที่รองรับ' });
        }
        const sha256 = finalHash.digest('hex');

        const videoUrl = kyVideoPublicUrl(req, storedName, manifest.fileName);
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [lockedRows] = await connection.query(
            'SELECT id, ReporterID, SubmittedByID, Participants, VideoUrl, Status FROM KY_Activities WHERE id = ? FOR UPDATE',
            [req.params.id]
        );
        const lockedRow = lockedRows[0] || null;
        const access = kyCheckVideoUploadAccess(lockedRow, req, manifest);
        if (access.status) {
            const err = new Error(access.message);
            err.status = access.status;
            err.code = access.code;
            throw err;
        }
        const previousUrl = lockedRow.VideoUrl || null;
        await connection.query('UPDATE KY_Activities SET VideoUrl = ? WHERE id = ?', [videoUrl, req.params.id]);
        await connection.commit();
        connection.release();
        connection = null;

        if (access.admin && previousUrl) deleteLocalUpload(previousUrl);
        kyRemoveVideoUploadDirectory(manifest.uploadId);
        finalPath = null;
        try {
            await logAudit(req, {
                action: 'KY_VIDEO_CHUNK_UPLOAD_COMPLETE',
                module: 'ky',
                targetType: 'KY_Activities',
                targetId: req.params.id,
                detail: access.admin && previousUrl ? 'Admin replaced KY video with chunk upload' : 'Uploaded KY video in chunks',
                metadata: { chunks: manifest.totalChunks, bytes: manifest.fileSize, sha256, replacedExisting: Boolean(previousUrl) },
            });
        } catch (auditError) {
            console.error('KY video chunk audit error:', auditError);
        }
        res.json({ success: true, data: { id: req.params.id, videoUrl, sha256 } });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
            connection.release();
        }
        if (finalPath && fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        console.error('KY video chunk complete error:', error);
        res.status(error.status || 500).json({ success: false, code: error.code, message: error.message || 'ไม่สามารถรวมวิดีโอ KY ได้' });
    } finally {
        if (lockHandle !== null) fs.closeSync(lockHandle);
        if (lockPath && fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    }
});

router.delete('/:id/video-upload/:uploadId', async (req, res) => {
    try {
        const manifest = kyReadVideoManifest(req.params.uploadId);
        if (!manifest) return res.json({ success: true });
        const row = await kyLoadVideoUploadActivity(req.params.id);
        const access = kyCheckVideoUploadAccess(row, req, manifest);
        if (access.status && access.status !== 409) return res.status(access.status).json({ success: false, message: access.message });
        kyRemoveVideoUploadDirectory(manifest.uploadId);
        res.json({ success: true });
    } catch (error) {
        console.error('KY video chunk abort error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถยกเลิกชุดอัปโหลดวิดีโอได้' });
    }
});

router.post('/:id/video', uploadVideo.single('video'), async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query(
            'SELECT id, ReporterID, SubmittedByID, Participants, VideoUrl, Status FROM KY_Activities WHERE id = ? LIMIT 1',
            [req.params.id]
        );
        if (!rows.length) {
            if (req.file?.path) deleteLocalUpload(req.file.path);
            return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม KY' });
        }
        const row = rows[0];
        const admin = isKyAdmin(req);
        const canUpload = kyCanUploadFollowupVideoForUser(row, req);
        if (row.VideoUrl) {
            if (req.file?.path) deleteLocalUpload(req.file.path);
            return res.status(409).json({ success: false, code: 'KY_VIDEO_PROTECTED_BY_RETENTION', message: 'Confirm External Backup and remove the Production copy through Annual Video Evidence before replacing it.' });
        }
        if (!canUpload) {
            if (req.file?.path) deleteLocalUpload(req.file.path);
            return res.status(403).json({ success: false, message: 'แนบวิดีโอได้เฉพาะเจ้าของรายการหรือ Admin' });
        }
        if (!req.file?.path) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์วิดีโอ' });
        }
        if (!admin && row.VideoUrl) {
            deleteLocalUpload(req.file.path);
            return res.status(409).json({ success: false, message: 'รายการนี้มีวิดีโอแล้ว กรุณาติดต่อ Admin หากต้องการเปลี่ยนไฟล์' });
        }
        const previousUrl = row.VideoUrl || null;
        await db.query('UPDATE KY_Activities SET VideoUrl = ? WHERE id = ?', [req.file.path, req.params.id]);
        if (admin && previousUrl) deleteLocalUpload(previousUrl);
        await logAudit(req, {
            action: 'KY_VIDEO_FOLLOWUP_UPLOAD',
            module: 'ky',
            targetType: 'KY_Activities',
            targetId: req.params.id,
            detail: admin && previousUrl ? 'Admin replaced KY follow-up video' : 'Uploaded KY follow-up video',
            metadata: { canUpload, admin, replacedExisting: Boolean(previousUrl), status: row.Status },
        });
        res.json({ success: true, data: { id: req.params.id, videoUrl: req.file.path } });
    } catch (error) {
        if (req.file?.path) deleteLocalUpload(req.file.path);
        console.error('KY follow-up video upload error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถแนบวิดีโอ KY ได้' });
    }
});

router.delete('/:id/reaction', async (req, res) => {
    try {
        await ensureTables();
        const userId = currentUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้งาน' });
        await db.query(`DELETE FROM KY_Video_Reactions WHERE ActivityID = ? AND EmployeeID = ?`, [req.params.id, userId]);
        res.json({ success: true, message: 'ลบ Reaction สำเร็จ' });
    } catch (error) {
        console.error('KY reaction delete error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบ Reaction ได้' });
    }
});

router.put('/:id/video-dashboard', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const show = req.body?.show === undefined ? null : (req.body.show ? 1 : 0);
        const pinned = req.body?.pinned === undefined ? null : (req.body.pinned ? 1 : 0);
        const fields = [];
        const vals = [];
        if (show !== null) { fields.push('ShowVideoOnDashboard = ?'); vals.push(show); }
        if (pinned !== null) { fields.push('IsVideoPinned = ?'); vals.push(pinned); }
        if (!fields.length) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
        vals.push(req.params.id);
        const [result] = await db.query(`UPDATE KY_Activities SET ${fields.join(', ')} WHERE id = ?`, vals);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม KY' });
        await logAudit(req, {
            action: 'KY_VIDEO_DASHBOARD_UPDATE',
            module: 'ky',
            targetType: 'KY_Activities',
            targetId: req.params.id,
            detail: 'Updated KY video dashboard settings',
            metadata: { show, pinned },
        });
        res.json({ success: true, message: 'อัปเดตการแสดงวิดีโอสำเร็จ' });
    } catch (error) {
        console.error('KY video dashboard update error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตการแสดงวิดีโอได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        await ensureTables();
        const { status, source, year, month, q, depts, dateFrom, dateTo, evidence } = req.query;
        const dept = req.query.department || req.query.dept;
        const risk = req.query.riskCategory || req.query.risk;
        const validDate = value => {
            if (!value) return true;
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
            if (!match) return false;
            const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
            return date.getUTCFullYear() === Number(match[1])
                && date.getUTCMonth() + 1 === Number(match[2])
                && date.getUTCDate() === Number(match[3]);
        };
        if (!validDate(dateFrom) || !validDate(dateTo) || (dateFrom && dateTo && dateFrom > dateTo)) {
            return res.status(400).json({ success: false, message: 'Invalid KY history date range.' });
        }

        const productionVideo = kyProductionVideoSql('a');
        const verifiedExternal = kyVerifiedExternalVideoSql('a');
        const pendingExternal = kyPendingExternalVideoSql('a');
        const videoEvidence = kyVideoEvidenceSql('a');
        let sql = `SELECT a.*, ${kyVideoEvidenceSelectSql('a')} FROM KY_Activities a WHERE 1=1`;
        const params = [];

        if (status && status !== 'all') { sql += ' AND a.Status = ?'; params.push(status); }

        // Single dept filter OR multi-dept (comma-separated) for program-config scoping
        if (dept && dept !== 'all') {
            sql += ' AND a.Department = ?'; params.push(dept);
        } else if (depts) {
            const deptList = depts.split(',').map(d => d.trim()).filter(Boolean).slice(0, 100);
            if (deptList.length) {
                sql += ` AND a.Department IN (${deptList.map(() => '?').join(',')})`;
                params.push(...deptList);
            }
        }

        if (risk  && risk  !== 'all') { sql += ' AND a.RiskCategory = ?'; params.push(risk); }
        if (source === 'admin') {
            sql += ' AND a.SubmittedByID IS NOT NULL AND a.SubmittedByID <> a.ReporterID';
        } else if (source === 'self') {
            sql += ' AND (a.SubmittedByID IS NULL OR a.SubmittedByID = a.ReporterID)';
        }
        if (evidence === 'complete') {
            sql += ` AND COALESCE(TRIM(a.AttachmentUrl),'') <> '' AND ${videoEvidence}`;
        } else if (evidence === 'waiting_video') {
            sql += ` AND COALESCE(TRIM(a.AttachmentUrl),'') <> '' AND NOT (${videoEvidence}) AND NOT (${pendingExternal})`;
        } else if (evidence === 'no_video') {
            sql += ` AND NOT (${videoEvidence}) AND NOT (${pendingExternal})`;
        } else if (evidence === 'production_video') {
            sql += ` AND ${productionVideo}`;
        } else if (evidence === 'external_verified') {
            sql += ` AND NOT (${productionVideo}) AND ${verifiedExternal}`;
        } else if (evidence === 'external_pending') {
            sql += ` AND NOT (${productionVideo}) AND NOT (${verifiedExternal}) AND ${pendingExternal}`;
        } else if (evidence === 'missing_file') {
            sql += " AND COALESCE(TRIM(a.AttachmentUrl),'') = ''";
        }
        // Date range overrides year/month when provided
        if (dateFrom && dateTo) {
            sql += ' AND a.ActivityDate BETWEEN ? AND ?'; params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            sql += ' AND a.ActivityDate >= ?'; params.push(dateFrom);
        } else if (dateTo) {
            sql += ' AND a.ActivityDate <= ?'; params.push(dateTo);
        } else {
            if (year)  { sql += ' AND YEAR(a.ActivityDate) = ?'; params.push(parseInt(year)); }
            if (month) { sql += ' AND MONTH(a.ActivityDate) = ?'; params.push(parseInt(month)); }
        }
        if (q && q.trim()) {
            sql += ' AND (a.ReporterName LIKE ? OR a.SubmittedByName LIKE ? OR a.Department LIKE ? OR a.SafetyUnit LIKE ? OR a.TeamName LIKE ? OR a.KYTKeyword LIKE ? OR a.HazardDescription LIKE ? OR a.Countermeasure LIKE ?)';
            const like = `%${q.trim().slice(0, 200)}%`;
            params.push(like, like, like, like, like, like, like, like);
        }

        sql += ' ORDER BY a.ActivityDate DESC, a.CreatedAt DESC';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('KY list error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE
// ─────────────────────────────────────────────────────────────────────────────
// KY email outbox - Admin retry support
router.get('/email-outbox', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const status = String(req.query.status || '').trim();
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 80, 1), 200);
        let sql = 'SELECT * FROM KY_EmailOutbox';
        const params = [];
        if (status && status !== 'all') {
            sql += ' WHERE Status = ?';
            params.push(status);
        }
        sql += ' ORDER BY CreatedAt DESC, id DESC LIMIT ?';
        params.push(limit);
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows, smtpConfigured: smtpConfigured() });
    } catch (error) {
        console.error('KY email outbox error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงคิวอีเมล KY ได้' });
    }
});

router.post('/email-outbox/retry-queued', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query(
            `SELECT * FROM KY_EmailOutbox
             WHERE Status IN ('Queued','Failed')
             ORDER BY CreatedAt ASC, id ASC
             LIMIT 50`
        );
        const results = [];
        for (const item of rows) {
            try {
                await sendMail({ to: item.Recipient, subject: item.Subject, text: item.Body, html: item.HtmlBody });
                await db.query(`UPDATE KY_EmailOutbox SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?`, [item.id]);
                results.push({ id: item.id, status: 'Sent' });
            } catch (error) {
                await db.query(`UPDATE KY_EmailOutbox SET Status='Failed', Error=? WHERE id=?`, [error.message, item.id]).catch(() => {});
                results.push({ id: item.id, status: 'Failed', error: error.message });
            }
        }
        res.json({
            success: true,
            message: `Retried ${results.length} KY email queue item(s)`,
            data: {
                results,
                sent: results.filter(row => row.status === 'Sent').length,
                failed: results.filter(row => row.status === 'Failed').length,
            },
        });
    } catch (error) {
        console.error('[ky/email-outbox] retry queued failed:', error.message);
        res.status(500).json({ success: false, message: 'Unable to retry KY email queue' });
    }
});

router.post('/email-outbox/:id/retry', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT * FROM KY_EmailOutbox WHERE id = ? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบอีเมลในคิว KY' });
        const item = rows[0];
        await sendMail({ to: item.Recipient, subject: item.Subject, text: item.Body, html: item.HtmlBody });
        await db.query(`UPDATE KY_EmailOutbox SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?`, [item.id]);
        res.json({ success: true, message: 'Retry อีเมล KY สำเร็จ' });
    } catch (error) {
        await db.query(`UPDATE KY_EmailOutbox SET Status='Failed', Error=? WHERE id=?`, [error.message, req.params.id]).catch(() => {});
        console.error('[ky/email-outbox] retry failed:', error.message);
        res.status(500).json({ success: false, message: 'ไม่สามารถ retry อีเมล KY ได้', error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT * FROM KY_Activities WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม KY' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBMIT (any authenticated user)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', handleKyUpload, async (req, res) => {
    try {
        await ensureTables();

        const {
            TeamName, Participants, KYTKeyword, RiskCategory,
            HazardDescription, Countermeasure, ActivityDate, ReporterEmployeeID, ReporterEmail, Department, SafetyUnit
        } = req.body;

        if (!HazardDescription || !HazardDescription.trim()) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'กรุณาระบุรายละเอียดอันตราย' });
        }
        if (!TeamName || !TeamName.trim()) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อทีม' });
        }
        if (!KYTKeyword || !KYTKeyword.trim()) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'กรุณาระบุ KYT Keyword' });
        }
        if (!Countermeasure || !Countermeasure.trim()) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'กรุณาระบุมาตรการตอบโต้' });
        }
        if (!req.files?.attachment?.[0]) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์ภาพหรือเอกสารประกอบกิจกรรม KY' });
        }
        const participantList = (() => {
            if (!Participants) return [];
            try {
                const parsed = JSON.parse(Participants);
                return Array.isArray(parsed) ? parsed.map(p => String(p || '').trim()).filter(Boolean) : [];
            } catch {
                return String(Participants).split(',').map(p => p.trim()).filter(Boolean);
            }
        })();
        if (!participantList.length) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'กรุณาระบุผู้เข้าร่วมกิจกรรม KY อย่างน้อย 1 คน' });
        }

        const date  = ActivityDate || new Date().toISOString().split('T')[0];
        const parsedDate = new Date(date);
        if (Number.isNaN(parsedDate.getTime())) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'วันที่กิจกรรม KY ไม่ถูกต้อง' });
        }
        const year  = parsedDate.getFullYear();
        const isAdminUser = String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin';
        const requestedReporterId = String(ReporterEmployeeID || '').trim();
        await ensureEmployeeCompanyEmailColumn(db);
        let reporter = {
            id: currentUserId(req) || req.user.id,
            name: req.user.name,
            department: req.user.department,
            companyEmail: null,
        };

        if (isAdminUser && requestedReporterId) {
            const [reporterRows] = await db.query(
                `SELECT EmployeeID, EmployeeName, Department, CompanyEmail
                 FROM Employees
                 WHERE EmployeeID = ?
                 LIMIT 1`,
                [requestedReporterId]
            );
            if (!reporterRows.length) {
                deleteUploadedKyFiles(req);
                return res.status(400).json({ success: false, message: 'ไม่พบพนักงานที่ Admin เลือกสำหรับส่งกิจกรรม KY แทน' });
            }
            reporter = {
                id: reporterRows[0].EmployeeID,
                name: reporterRows[0].EmployeeName,
                department: reporterRows[0].Department,
                companyEmail: reporterRows[0].CompanyEmail,
            };
        } else if (reporter.id) {
            const [reporterRows] = await db.query(
                `SELECT EmployeeID, EmployeeName, Department, CompanyEmail
                 FROM Employees WHERE EmployeeID = ? LIMIT 1`,
                [reporter.id]
            );
            if (reporterRows.length) {
                reporter = {
                    id: reporterRows[0].EmployeeID,
                    name: reporterRows[0].EmployeeName || reporter.name,
                    department: reporterRows[0].Department || reporter.department,
                    companyEmail: reporterRows[0].CompanyEmail,
                };
            }
        }

        const reporterEmailCheck = validateCompanyEmail(ReporterEmail || reporter.companyEmail);
        if (!reporterEmailCheck.ok) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: reporterEmailCheck.message });
        }

        const dept = String(Department || reporter.department || '').trim();
        if (!dept) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'ไม่พบแผนกของผู้รายงานกิจกรรม KY' });
        }

        const requestedSafetyUnit = String(SafetyUnit || '').trim();

        // Check yearly limit against program config target
        const [cfgRows] = await db.query(
            `SELECT SafetyUnits, YearlyTarget FROM KY_Program_Config WHERE Year = ? AND Department = ? AND IsActive = 1 LIMIT 1`,
            [year, dept]
        );
        const configuredUnits = parseSafetyUnits(cfgRows[0]?.SafetyUnits);
        const hasSafetyUnits = configuredUnits.length > 0;
        if (hasSafetyUnits && !requestedSafetyUnit) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'กรุณาเลือก Safety Unit สำหรับแผนกนี้' });
        }
        if (hasSafetyUnits && !configuredUnits.includes(requestedSafetyUnit)) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'Safety Unit ไม่อยู่ใน Program Config ของแผนกนี้' });
        }
        const safeSafetyUnit = hasSafetyUnits ? requestedSafetyUnit : null;
        const unitTarget = cfgRows[0]?.YearlyTarget || 12;
        const target = unitTarget;

        const [[{ cnt }]] = await db.query(
            `SELECT COUNT(*) AS cnt FROM KY_Activities
             WHERE Department = ? ${safeSafetyUnit ? 'AND SafetyUnit = ?' : ''} AND YEAR(ActivityDate) = ?`,
            safeSafetyUnit ? [dept, safeSafetyUnit, year] : [dept, year]
        );
        if (cnt >= target) {
            deleteUploadedKyFiles(req);
            return res.status(409).json({
                success: false,
                message: safeSafetyUnit
                    ? `Safety Unit "${safeSafetyUnit}" ส่งกิจกรรม KY ครบเป้าหมายแล้ว (${cnt}/${target} เรื่อง/ปี)`
                    : `แผนก "${dept}" ส่งกิจกรรม KY ครบเป้าหมายแล้ว (${cnt}/${target} เรื่อง/ปี)`
            });
        }

        // Check 1 per month
        const month = parsedDate.getMonth() + 1;
        const [monthCheck] = await db.query(
            `SELECT id FROM KY_Activities
             WHERE Department = ? ${safeSafetyUnit ? 'AND SafetyUnit = ?' : ''} AND MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ?
             LIMIT 1`,
            safeSafetyUnit ? [dept, safeSafetyUnit, month, year] : [dept, month, year]
        );
        if (monthCheck.length > 0) {
            deleteUploadedKyFiles(req);
            return res.status(409).json({
                success: false,
                message: safeSafetyUnit
                    ? `Safety Unit "${safeSafetyUnit}" ส่งกิจกรรม KY สำหรับเดือนนี้แล้ว (1 เดือน / 1 เรื่อง)`
                    : `แผนก "${dept}" ส่งกิจกรรม KY สำหรับเดือนนี้แล้ว (1 เดือน / 1 เรื่อง)`
            });
        }

        const VALID_RISK = ['ทั่วไป','สภาพแวดล้อม','เครื่องจักร','พฤติกรรม','เคมี','ไฟฟ้า','อื่นๆ'];
        const safeRisk   = VALID_RISK.includes(RiskCategory) ? RiskCategory : 'ทั่วไป';

        let participantsStr = null;
        if (participantList.length) {
            try {
                JSON.parse(Participants);
                participantsStr = Participants;
            } catch {
                participantsStr = JSON.stringify(participantList);
            }
        }

        const attachmentUrl = req.files?.attachment?.[0]?.path || null;
        const videoUrl      = req.files?.video?.[0]?.path      || null;

        const id = randomUUID();
        await db.query(
            `INSERT INTO KY_Activities
                (id, ActivityDate, ReporterID, ReporterName, ReporterEmail, SubmittedByID, SubmittedByName, Department, SafetyUnit, TeamName,
                 Participants, KYTKeyword, RiskCategory, HazardDescription,
                 Countermeasure, AttachmentUrl, VideoUrl, Status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open')`,
            [
                id, date,
                reporter.id, reporter.name, reporterEmailCheck.email,
                req.user.id, req.user.name,
                dept,
                safeSafetyUnit,
                (TeamName || '').trim() || null,
                participantsStr,
                (KYTKeyword || '').trim() || null,
                safeRisk,
                HazardDescription.trim(),
                (Countermeasure || '').trim() || null,
                attachmentUrl,
                videoUrl,
            ]
        );

        await logAudit(req, {
            action: 'KY_ACTIVITY_CREATE',
            module: 'ky',
            targetType: 'KY_Activities',
            targetId: id,
            detail: `Submitted KY activity for ${dept}`,
            metadata: {
                department: dept,
                safetyUnit: safeSafetyUnit,
                activityDate: date,
                riskCategory: safeRisk,
                reporterId: reporter.id,
                reporterName: reporter.name,
                submittedById: req.user.id,
                submittedByName: req.user.name,
                submittedOnBehalf: isAdminUser && requestedReporterId && requestedReporterId !== req.user.id,
                reporterEmail: reporterEmailCheck.email,
            },
            statusCode: 201,
        });
        if (reporterEmailCheck.email) {
            const mail = buildKySubmittedEmail({
                id,
                ActivityDate: date,
                ReporterID: reporter.id,
                ReporterName: reporter.name,
                ReporterEmail: reporterEmailCheck.email,
                Department: dept,
                SafetyUnit: safeSafetyUnit,
                KYTKeyword: (KYTKeyword || '').trim() || null,
                RiskCategory: safeRisk,
                HazardDescription: HazardDescription.trim(),
            });
            await queueKyEmail({
                to: reporterEmailCheck.email,
                reportId: id,
                eventType: 'Submitted',
                subject: mail.subject,
                body: mail.body,
                html: mail.html,
            });
        }
        const adminEmail = getKyAdminEmail();
        if (adminEmail) {
            const adminMail = buildKyAdminSubmittedEmail({
                id,
                ActivityDate: date,
                ReporterID: reporter.id,
                ReporterName: reporter.name,
                ReporterEmail: reporterEmailCheck.email,
                SubmittedByName: req.user.name,
                Department: dept,
                SafetyUnit: safeSafetyUnit,
                KYTKeyword: (KYTKeyword || '').trim() || null,
                RiskCategory: safeRisk,
                HazardDescription: HazardDescription.trim(),
            });
            await queueKyEmail({
                to: adminEmail,
                reportId: id,
                eventType: 'AdminSubmitted',
                subject: adminMail.subject,
                body: adminMail.body,
                html: adminMail.html,
            });
        }
        res.status(201).json({
            success: true,
            id,
            data: { id },
            message: safeSafetyUnit
                ? `ส่งกิจกรรม KY สำเร็จ (${safeSafetyUnit}: ${cnt + 1}/${target} เรื่องในปีนี้)`
                : `ส่งกิจกรรม KY สำเร็จ (${cnt + 1}/${target} เรื่องในปีนี้)`
        });
    } catch (error) {
        console.error('KY submit error:', error);
        deleteUploadedKyFiles(req);
        if (error.status === 409) return res.status(409).json(error);
        res.status(500).json({ success: false, message: 'ไม่สามารถส่งกิจกรรม KY ได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', isAdmin, handleKyUpload, async (req, res) => {
    try {
        await ensureTables();
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT id, Department, SafetyUnit, ActivityDate, AttachmentUrl, VideoUrl,
                    ReporterName, ReporterEmail, Status, AdminComment
             FROM KY_Activities WHERE id = ?`,
            [id]
        );
        if (!rows.length) {
            deleteUploadedKyFiles(req);
            return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม KY' });
        }
        const currentRow = rows[0];

        const VALID_STATUS = ['Open', 'Reviewed', 'Closed'];
        const {
            Status, AdminComment, TeamName, KYTKeyword,
            RiskCategory, HazardDescription, Countermeasure, Participants, ActivityDate, Department, SafetyUnit
        } = req.body;

        if (Status && !VALID_STATUS.includes(Status)) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'สถานะไม่ถูกต้อง' });
        }

        const targetDateValue = ActivityDate !== undefined ? ActivityDate : currentRow.ActivityDate;
        const scopedDate = new Date(targetDateValue);
        if (!targetDateValue || Number.isNaN(scopedDate.getTime())) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'วันที่กิจกรรมไม่ถูกต้อง' });
        }

        const targetDepartment = String(Department !== undefined ? Department : currentRow.Department || '').trim();
        if (!targetDepartment) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'กรุณาเลือกแผนกหลักของกิจกรรม KY' });
        }

        const scopedYear = scopedDate.getFullYear();
        const scopedMonth = scopedDate.getMonth() + 1;
        const [scopedCfgRows] = await db.query(
            `SELECT SafetyUnits, YearlyTarget FROM KY_Program_Config WHERE Year = ? AND Department = ? AND IsActive = 1 LIMIT 1`,
            [scopedYear, targetDepartment]
        );
        const scopedUnits = parseSafetyUnits(scopedCfgRows[0]?.SafetyUnits);
        const requestedScopedUnit = String(SafetyUnit !== undefined ? SafetyUnit : currentRow.SafetyUnit || '').trim();
        if (scopedUnits.length && !requestedScopedUnit) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'กรุณาเลือก Safety Unit สำหรับแผนกนี้' });
        }
        if (scopedUnits.length && !scopedUnits.includes(requestedScopedUnit)) {
            deleteUploadedKyFiles(req);
            return res.status(400).json({ success: false, message: 'Safety Unit ไม่อยู่ใน Program Config ของแผนกนี้' });
        }
        const safeScopedUnit = scopedUnits.length ? requestedScopedUnit : null;
        const useScopedUnit = Boolean(safeScopedUnit);
        const scopedTarget = scopedCfgRows[0]?.YearlyTarget || 12;

        const [[scopedYearCount]] = await db.query(
            `SELECT COUNT(*) AS cnt FROM KY_Activities
             WHERE Department = ? ${useScopedUnit ? 'AND SafetyUnit = ?' : ''} AND YEAR(ActivityDate) = ? AND id <> ?`,
            useScopedUnit ? [targetDepartment, safeScopedUnit, scopedYear, id] : [targetDepartment, scopedYear, id]
        );
        if ((scopedYearCount?.cnt || 0) >= scopedTarget) {
            deleteUploadedKyFiles(req);
            return res.status(409).json({
                success: false,
                message: useScopedUnit
                    ? `Safety Unit "${safeScopedUnit}" ส่งกิจกรรม KY ครบเป้าหมายปี ${scopedYear} แล้ว`
                    : `แผนก "${targetDepartment}" ส่งกิจกรรม KY ครบเป้าหมายปี ${scopedYear} แล้ว`,
            });
        }

        const [scopedMonthRows] = await db.query(
            `SELECT id FROM KY_Activities
             WHERE Department = ? ${useScopedUnit ? 'AND SafetyUnit = ?' : ''} AND MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ? AND id <> ?
             LIMIT 1`,
            useScopedUnit ? [targetDepartment, safeScopedUnit, scopedMonth, scopedYear, id] : [targetDepartment, scopedMonth, scopedYear, id]
        );
        if (scopedMonthRows.length) {
            deleteUploadedKyFiles(req);
            return res.status(409).json({
                success: false,
                message: useScopedUnit
                    ? `Safety Unit "${safeScopedUnit}" มีกิจกรรม KY ในเดือนที่เลือกแล้ว`
                    : `แผนก "${targetDepartment}" มีกิจกรรม KY ในเดือนที่เลือกแล้ว`,
            });
        }

        if (false && ActivityDate !== undefined) {
            const updatedDate = new Date(ActivityDate);
            if (!ActivityDate || Number.isNaN(updatedDate.getTime())) {
                deleteUploadedKyFiles(req);
                return res.status(400).json({ success: false, message: 'วันที่กิจกรรมไม่ถูกต้อง' });
            }

            const updatedYear = updatedDate.getFullYear();
            const updatedMonth = updatedDate.getMonth() + 1;
            const [cfgRows] = await db.query(
                `SELECT SafetyUnits, YearlyTarget FROM KY_Program_Config WHERE Year = ? AND Department = ? AND IsActive = 1 LIMIT 1`,
                [updatedYear, currentRow.Department]
            );
            const units = parseSafetyUnits(cfgRows[0]?.SafetyUnits);
            const target = cfgRows[0]?.YearlyTarget || 12;
            const unit = String(currentRow.SafetyUnit || '').trim();
            const useUnitScope = units.length > 0 && unit;
            const [[yearCount]] = await db.query(
                `SELECT COUNT(*) AS cnt
                 FROM KY_Activities
                 WHERE Department = ? ${useUnitScope ? 'AND SafetyUnit = ?' : ''} AND YEAR(ActivityDate) = ? AND id <> ?`,
                useUnitScope ? [currentRow.Department, unit, updatedYear, id] : [currentRow.Department, updatedYear, id]
            );
            if ((yearCount?.cnt || 0) >= target) {
                deleteUploadedKyFiles(req);
                return res.status(409).json({
                    success: false,
                    message: useUnitScope
                        ? `Safety Unit "${unit}" ส่งกิจกรรม KY ครบเป้าหมายปี ${updatedYear} แล้ว`
                        : `แผนก "${currentRow.Department}" ส่งกิจกรรม KY ครบเป้าหมายปี ${updatedYear} แล้ว`,
                });
            }

            const [monthRows] = await db.query(
                `SELECT id
                 FROM KY_Activities
                 WHERE Department = ? ${useUnitScope ? 'AND SafetyUnit = ?' : ''} AND MONTH(ActivityDate) = ? AND YEAR(ActivityDate) = ? AND id <> ?
                 LIMIT 1`,
                useUnitScope ? [currentRow.Department, unit, updatedMonth, updatedYear, id] : [currentRow.Department, updatedMonth, updatedYear, id]
            );
            if (monthRows.length) {
                deleteUploadedKyFiles(req);
                return res.status(409).json({
                    success: false,
                    message: useUnitScope
                        ? `Safety Unit "${unit}" มีกิจกรรม KY ในเดือนที่เลือกแล้ว`
                        : `แผนก "${currentRow.Department}" มีกิจกรรม KY ในเดือนที่เลือกแล้ว`,
                });
            }
        }

        const VALID_RISK = ['ทั่วไป','สภาพแวดล้อม','เครื่องจักร','พฤติกรรม','เคมี','ไฟฟ้า','อื่นๆ'];
        const safeRisk   = RiskCategory && VALID_RISK.includes(RiskCategory) ? RiskCategory : undefined;

        let participantsStr = undefined;
        if (Participants !== undefined) {
            try {
                JSON.parse(Participants);
                participantsStr = Participants;
            } catch {
                const arr = Participants.split(',').map(p => p.trim()).filter(Boolean);
                participantsStr = JSON.stringify(arr);
            }
        }

        const newAttachment = req.files?.attachment?.[0]?.path;
        const newVideo      = req.files?.video?.[0]?.path;
        if (newVideo && currentRow.VideoUrl) {
            deleteUploadedKyFiles(req);
            return res.status(409).json({ success: false, code: 'KY_VIDEO_PROTECTED_BY_RETENTION', message: 'Confirm External Backup and remove the Production copy through Annual Video Evidence before replacing it.' });
        }

        const fields = [];
        const vals   = [];

        if (Status !== undefined)            { fields.push('Status = ?');            vals.push(Status); }
        if (Department !== undefined)        { fields.push('Department = ?');        vals.push(targetDepartment); }
        if (SafetyUnit !== undefined || Department !== undefined || ActivityDate !== undefined) {
            fields.push('SafetyUnit = ?'); vals.push(safeScopedUnit);
        }
        if (AdminComment !== undefined)      { fields.push('AdminComment = ?');       vals.push(AdminComment); }
        if (TeamName !== undefined)          { fields.push('TeamName = ?');           vals.push(TeamName); }
        if (KYTKeyword !== undefined)        { fields.push('KYTKeyword = ?');         vals.push(KYTKeyword); }
        if (safeRisk !== undefined)          { fields.push('RiskCategory = ?');       vals.push(safeRisk); }
        if (HazardDescription !== undefined) { fields.push('HazardDescription = ?'); vals.push(HazardDescription); }
        if (Countermeasure !== undefined)    { fields.push('Countermeasure = ?');     vals.push(Countermeasure); }
        if (participantsStr !== undefined)   { fields.push('Participants = ?');       vals.push(participantsStr); }
        if (ActivityDate !== undefined)      { fields.push('ActivityDate = ?');       vals.push(ActivityDate); }
        if (newAttachment)                   { fields.push('AttachmentUrl = ?');      vals.push(newAttachment); }
        if (newVideo)                        { fields.push('VideoUrl = ?');           vals.push(newVideo); }

        if (fields.length === 0) {
            return res.json({ success: true, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
        }

        vals.push(id);
        await db.query(`UPDATE KY_Activities SET ${fields.join(', ')} WHERE id = ?`, vals);
        if (newAttachment) deleteLocalUpload(currentRow.AttachmentUrl);
        if (newVideo) deleteLocalUpload(currentRow.VideoUrl);

        await logAudit(req, {
            action: 'KY_ACTIVITY_UPDATE',
            module: 'ky',
            targetType: 'KY_Activities',
            targetId: id,
            detail: `Updated KY activity for ${targetDepartment}`,
            metadata: { fields: fields.map(field => field.split(' = ')[0]), department: targetDepartment, safetyUnit: safeScopedUnit },
        });
        if (Status === 'Reviewed' && currentRow.Status !== 'Reviewed' && currentRow.ReporterEmail) {
            const mail = buildKyReviewedEmail({
                ...currentRow,
                Department: targetDepartment,
                SafetyUnit: safeScopedUnit,
                ActivityDate: ActivityDate !== undefined ? ActivityDate : currentRow.ActivityDate,
                AdminComment: AdminComment !== undefined ? AdminComment : currentRow.AdminComment,
            });
            await queueKyEmail({
                to: currentRow.ReporterEmail,
                reportId: id,
                eventType: 'Reviewed',
                subject: mail.subject,
                body: mail.body,
                html: mail.html,
            });
        }
        if (Status === 'Closed' && currentRow.Status !== 'Closed' && currentRow.ReporterEmail) {
            const mail = buildKyClosedEmail({
                ...currentRow,
                Department: targetDepartment,
                SafetyUnit: safeScopedUnit,
                ActivityDate: ActivityDate !== undefined ? ActivityDate : currentRow.ActivityDate,
                AdminComment: AdminComment !== undefined ? AdminComment : currentRow.AdminComment,
            });
            await queueKyEmail({
                to: currentRow.ReporterEmail,
                reportId: id,
                eventType: 'Closed',
                subject: mail.subject,
                body: mail.body,
                html: mail.html,
            });
        }
        res.json({ success: true, message: 'อัปเดตกิจกรรม KY สำเร็จ' });
    } catch (error) {
        console.error('KY update error:', error);
        deleteUploadedKyFiles(req);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตข้อมูลได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', isAdmin, async (req, res) => {
    let connection;
    let committed = false;
    try {
        await ensureTables();
        connection = await db.getConnection();
        const [rows] = await connection.query(
            `SELECT a.id, a.AttachmentUrl, a.VideoUrl,
                    EXISTS(SELECT 1 FROM KY_Annual_Video_Evidence ave WHERE ave.ActivityID = a.id) AS HasAnnualVideoEvidence,
                    EXISTS(SELECT 1 FROM KY_Video_File_Inventory inv WHERE inv.ActivityID = a.id) AS HasVideoInventory
             FROM KY_Activities a WHERE a.id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม KY' });
        if (rows[0]?.VideoUrl || Number(rows[0]?.HasAnnualVideoEvidence || 0) || Number(rows[0]?.HasVideoInventory || 0)) {
            return res.status(409).json({ success: false, code: 'KY_VIDEO_PROTECTED_BY_RETENTION', message: 'This activity is protected by its video evidence retention record and cannot be deleted.' });
        }
        await connection.beginTransaction();
        await connection.query('DELETE FROM KY_Video_Reactions WHERE ActivityID = ?', [req.params.id]);
        await connection.query('DELETE FROM KY_Activities WHERE id = ?', [req.params.id]);
        await connection.commit();
        committed = true;
        deleteLocalUpload(rows[0].AttachmentUrl);
        deleteLocalUpload(rows[0].VideoUrl);
        await logAudit(req, {
            action: 'KY_ACTIVITY_DELETE',
            module: 'ky',
            targetType: 'KY_Activities',
            targetId: req.params.id,
            detail: 'Deleted KY activity',
        });
        res.json({ success: true, message: 'ลบกิจกรรม KY สำเร็จ' });
    } catch (error) {
        if (connection && !committed) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('KY delete error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
