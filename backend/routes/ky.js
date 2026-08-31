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
const { randomUUID } = require('crypto');
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
const KY_VIDEO_CHUNK_SIZE = 5 * 1024 * 1024;
const KY_VIDEO_CHUNK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const KY_VIDEO_CHUNK_ROOT = path.join(__dirname, '..', 'private-uploads', 'ky-video-chunks');
const KY_VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'avi', 'mkv', 'mpeg', 'mpg']);
const KY_VIDEO_MIME_TYPES = new Set([
    'video/mp4', 'video/quicktime', 'video/webm', 'video/avi',
    'video/x-msvideo', 'video/x-matroska', 'video/mpeg',
]);
const uploadKyVideoChunk = multer({
    storage: multer.memoryStorage(),
    // Busboy marks a file as limited when it reaches the exact configured cap.
    // Keep a tiny parser margin; the route still requires the exact expected bytes.
    limits: { files: 1, fileSize: KY_VIDEO_CHUNK_SIZE + (1024 * 1024) },
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
    if (!row) return { status: 404, message: 'ไม่พบกิจกรรม KY' };
    if (!kyCanUploadFollowupVideoForUser(row, req)) return { status: 403, message: 'แนบวิดีโอได้เฉพาะเจ้าของรายการหรือ Admin' };
    if (manifest && (manifest.activityId !== row.id || manifest.initiatedBy !== userId)) {
        return { status: 403, message: 'ไม่สามารถใช้งานชุดอัปโหลดนี้ได้' };
    }
    if (!admin && row.VideoUrl) return { status: 409, message: 'รายการนี้มีวิดีโอแล้ว กรุณาติดต่อ Admin หากต้องการเปลี่ยนไฟล์' };
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

    tablesReady = true;
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

        // Monthly trend
        const [monthly] = await db.query(`
            SELECT MONTH(ActivityDate) AS month, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY MONTH(ActivityDate)
            ORDER BY month
        `, [year, ...deptParams]);

        // By department
        const [byDept] = await db.query(`
            SELECT Department, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY Department
            ORDER BY count DESC
            LIMIT 15
        `, [year, ...deptParams]);

        // Monthly by department (for heatmap)
        const [deptMonthly] = await db.query(`
            SELECT Department, MONTH(ActivityDate) AS month, COUNT(*) AS count
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ? ${deptFilter}
            GROUP BY Department, MONTH(ActivityDate)
            ORDER BY Department, month
        `, [year, ...deptParams]);

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
                statusDist,
                riskCat,
                pendingDepts,
                pendingUnits,
                programProgress,
                topKeywords,
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
                COALESCE(rc.UsefulCount, 0)    AS UsefulCount,
                COALESCE(rc.PracticeCount, 0)  AS PracticeCount,
                COALESCE(rc.AwarenessCount, 0) AS AwarenessCount,
                COALESCE(rc.AttentionCount, 0) AS AttentionCount,
                COALESCE(rc.ReactionTotal, 0)  AS ReactionTotal,
                ur.Reaction AS MyReaction
            FROM KY_Activities a
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
            WHERE YEAR(a.ActivityDate) = ?
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
                    summary: { departments: 0, safetyUnits: 0, submitted: 0, complete: 0, waitingVideo: 0, missingFile: 0 },
                    unmatchedActivities: [],
                },
            });
        }
        const [activities] = await db.query(`
            SELECT id, ActivityDate, ReporterID, ReporterName, SubmittedByID, SubmittedByName,
                   Department, SafetyUnit, TeamName, KYTKeyword, RiskCategory, HazardDescription,
                   AttachmentUrl, VideoUrl, Status, Participants, CreatedAt
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ?
            ORDER BY ActivityDate DESC, CreatedAt DESC
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
            const hasVideo = Boolean(String(activity.VideoUrl || '').trim());
            const status = hasFile && hasVideo ? 'complete' : (hasFile ? 'waiting_video' : 'missing_file');
            row.submitted += 1;
            row[status === 'complete' ? 'complete' : status === 'waiting_video' ? 'waitingVideo' : 'missingFile'] += 1;
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
                canUploadVideo: kyCanUploadFollowupVideoForUser(activity, req) && (!hasVideo || isKyAdmin(req)),
            });
        });
        rows.forEach(row => {
            row.progressPct = row.yearlyTarget > 0 ? Math.min(100, Math.round(row.submitted / row.yearlyTarget * 100)) : 0;
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
            return acc;
        }, {
            departments: new Set(rows.map(row => row.department)).size,
            safetyUnits: rows.length,
            submitted: 0,
            complete: 0,
            waitingVideo: 0,
            missingFile: 0,
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

router.post('/:id/video-upload/init', async (req, res) => {
    try {
        await ensureTables();
        kyCleanupStaleVideoUploads();
        const row = await kyLoadVideoUploadActivity(req.params.id);
        const access = kyCheckVideoUploadAccess(row, req);
        if (access.status) return res.status(access.status).json({ success: false, message: access.message });

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
            createdAt: new Date().toISOString(),
        };
        fs.writeFileSync(kyVideoManifestPath(uploadId), JSON.stringify(manifest), { encoding: 'utf8', flag: 'wx' });
        res.status(201).json({ success: true, data: { uploadId, chunkSize: manifest.chunkSize, totalChunks: manifest.totalChunks } });
    } catch (error) {
        console.error('KY video chunk init error:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถเริ่มอัปโหลดวิดีโอ KY ได้' });
    }
});

router.post('/:id/video-upload/:uploadId/chunk/:index', (req, res) => {
    uploadKyVideoChunk.single('chunk')(req, res, async uploadError => {
        if (uploadError) {
            const message = uploadError.code === 'LIMIT_FILE_SIZE' ? 'ส่วนวิดีโอมีขนาดเกิน 5 MB' : (uploadError.message || 'อัปโหลดส่วนวิดีโอไม่สำเร็จ');
            return res.status(400).json({ success: false, code: 'KY_VIDEO_CHUNK_INVALID', message });
        }
        try {
            await ensureTables();
            const manifest = kyReadVideoManifest(req.params.uploadId);
            if (!manifest) return res.status(404).json({ success: false, message: 'ไม่พบชุดอัปโหลดหรือชุดอัปโหลดหมดอายุแล้ว' });
            const row = await kyLoadVideoUploadActivity(req.params.id);
            const access = kyCheckVideoUploadAccess(row, req, manifest);
            if (access.status) return res.status(access.status).json({ success: false, message: access.message });

            const index = Number(req.params.index);
            if (!Number.isInteger(index) || index < 0 || index >= manifest.totalChunks || !req.file?.buffer) {
                return res.status(400).json({ success: false, code: 'KY_VIDEO_CHUNK_INVALID', message: 'ข้อมูลส่วนวิดีโอไม่ถูกต้อง' });
            }
            const expectedSize = kyVideoExpectedChunkSize(manifest, index);
            if (req.file.buffer.length !== expectedSize) {
                return res.status(400).json({ success: false, code: 'KY_VIDEO_CHUNK_SIZE_MISMATCH', message: 'ขนาดส่วนวิดีโอไม่ตรงกับที่ระบบกำหนด' });
            }
            const partPath = kyVideoPartPath(manifest, index);
            fs.writeFileSync(partPath, req.file.buffer);
            res.json({ success: true, data: { uploadId: manifest.uploadId, index, receivedBytes: expectedSize } });
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
        try {
            for (let index = 0; index < manifest.totalChunks; index += 1) {
                fs.writeSync(finalHandle, fs.readFileSync(kyVideoPartPath(manifest, index)));
            }
        } finally {
            fs.closeSync(finalHandle);
        }
        if (fs.statSync(finalPath).size !== manifest.fileSize || !kyVideoFileHeaderIsValid(finalPath, manifest.extension)) {
            fs.unlinkSync(finalPath);
            finalPath = null;
            return res.status(400).json({ success: false, code: 'KY_VIDEO_CONTENT_INVALID', message: 'เนื้อหาไฟล์ไม่ใช่วิดีโอชนิดที่รองรับ' });
        }

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
                metadata: { chunks: manifest.totalChunks, bytes: manifest.fileSize, replacedExisting: Boolean(previousUrl) },
            });
        } catch (auditError) {
            console.error('KY video chunk audit error:', auditError);
        }
        res.json({ success: true, data: { id: req.params.id, videoUrl } });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
            connection.release();
        }
        if (finalPath && fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        console.error('KY video chunk complete error:', error);
        res.status(error.status || 500).json({ success: false, message: error.message || 'ไม่สามารถรวมวิดีโอ KY ได้' });
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
        const { status, dept, risk, source, year, month, q, depts, dateFrom, dateTo } = req.query;

        let sql = 'SELECT * FROM KY_Activities WHERE 1=1';
        const params = [];

        if (status && status !== 'all') { sql += ' AND Status = ?'; params.push(status); }

        // Single dept filter OR multi-dept (comma-separated) for program-config scoping
        if (dept && dept !== 'all') {
            sql += ' AND Department = ?'; params.push(dept);
        } else if (depts) {
            const deptList = depts.split(',').map(d => d.trim()).filter(Boolean);
            if (deptList.length) {
                sql += ` AND Department IN (${deptList.map(() => '?').join(',')})`;
                params.push(...deptList);
            }
        }

        if (risk  && risk  !== 'all') { sql += ' AND RiskCategory = ?'; params.push(risk); }
        if (source === 'admin') {
            sql += ' AND SubmittedByID IS NOT NULL AND SubmittedByID <> ReporterID';
        } else if (source === 'self') {
            sql += ' AND (SubmittedByID IS NULL OR SubmittedByID = ReporterID)';
        }
        // Date range overrides year/month when provided
        if (dateFrom && dateTo) {
            sql += ' AND ActivityDate BETWEEN ? AND ?'; params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            sql += ' AND ActivityDate >= ?'; params.push(dateFrom);
        } else if (dateTo) {
            sql += ' AND ActivityDate <= ?'; params.push(dateTo);
        } else {
            if (year)  { sql += ' AND YEAR(ActivityDate) = ?'; params.push(parseInt(year)); }
            if (month) { sql += ' AND MONTH(ActivityDate) = ?'; params.push(parseInt(month)); }
        }
        if (q && q.trim()) {
            sql += ' AND (ReporterName LIKE ? OR SubmittedByName LIKE ? OR Department LIKE ? OR SafetyUnit LIKE ? OR TeamName LIKE ? OR KYTKeyword LIKE ? OR HazardDescription LIKE ? OR Countermeasure LIKE ?)';
            const like = `%${q.trim()}%`;
            params.push(like, like, like, like, like, like, like, like);
        }

        sql += ' ORDER BY CreatedAt DESC';

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
        const [rows] = await connection.query('SELECT id, AttachmentUrl, VideoUrl FROM KY_Activities WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม KY' });
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
