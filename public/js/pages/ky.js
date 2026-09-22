import { delegatedActionOptions, guardActionHandler, guardSubmitHandler } from '../utils/async-ui.js?v=20260715-phase32d-remaining-async-ux';
// public/js/pages/ky.js
// KY Ability (Kiken Yochi - Hazard Prediction)
import { API, apiFetch } from '../api.js';
import {
    hideLoading, showError, showLoading,
    openModal, openDetailModal, closeModal, showToast, showConfirmationModal, showDocumentModal, escHtml,
    statusBadge as dsStatusBadge, normalizeDocumentUrl
} from '../ui.js?v=20260602-mobile-nav-m53';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';
import { buildActivityCard } from '../utils/activity-widget.js?v=20260602-activity-targets-at10';
import { captureCardImage, isSharedCardImageExportEnabled } from '../utils/card-image-export.js?v=20260822-ky-export-r1';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const RISK_CATEGORIES = ['ทั่วไป','สภาพแวดล้อม','เครื่องจักร','พฤติกรรม','เคมี','ไฟฟ้า','อื่นๆ'];
const STATUSES        = ['Open','Reviewed','Closed'];

const STATUS_BADGE = {
    'Open':     'bg-sky-100 text-sky-700',
    'Reviewed': 'bg-amber-100 text-amber-700',
    'Closed':   'bg-emerald-100 text-emerald-700',
};
const STATUS_LABEL = { 'Open':'รอตรวจสอบ', 'Reviewed':'ตรวจสอบแล้ว', 'Closed':'ปิดแล้ว' };

const RISK_BADGE_COLOR = {
    'ทั่วไป':       'bg-slate-100 text-slate-600',
    'สภาพแวดล้อม':  'bg-blue-100 text-blue-700',
    'เครื่องจักร':  'bg-orange-100 text-orange-700',
    'พฤติกรรม':     'bg-purple-100 text-purple-700',
    'เคมี':         'bg-yellow-100 text-yellow-700',
    'ไฟฟ้า':        'bg-red-100 text-red-700',
    'อื่นๆ':        'bg-slate-100 text-slate-500',
};

const RISK_CARDS = [
    { id:'ทั่วไป',       label:'ทั่วไป',       desc:'อันตรายทั่วไปที่พบได้ในพื้นที่ทำงาน',    color:'#64748b', bg:'#f8fafc', border:'#cbd5e1' },
    { id:'สภาพแวดล้อม', label:'สภาพแวดล้อม', desc:'เสียง / อุณหภูมิ / แสง / ฝุ่น',          color:'#0284c7', bg:'#eff6ff', border:'#bfdbfe' },
    { id:'เครื่องจักร',  label:'เครื่องจักร',  desc:'หมุน / หนีบ / อันตรายจากเครื่องจักร',    color:'#f97316', bg:'#fff7ed', border:'#fed7aa' },
    { id:'พฤติกรรม',     label:'พฤติกรรม',     desc:'Unsafe act / การปฏิบัติไม่ถูกต้อง',       color:'#8b5cf6', bg:'#f5f3ff', border:'#ddd6fe' },
    { id:'เคมี',         label:'เคมี',         desc:'สารเคมี / ของเหลวไวไฟ / ไอระเหย',         color:'#eab308', bg:'#fefce8', border:'#fef08a' },
    { id:'ไฟฟ้า',        label:'ไฟฟ้า',        desc:'กระแสไฟฟ้า / สายไฟ / อุปกรณ์ไฟฟ้า',      color:'#ef4444', bg:'#fef2f2', border:'#fecaca' },
    { id:'อื่นๆ',        label:'อื่นๆ',        desc:'อันตรายประเภทอื่นที่ไม่อยู่ในหมวดข้างต้น', color:'#0f766e', bg:'#f0fdf4', border:'#bbf7d0' },
];

const CHART_COLORS = ['#6366f1','#f97316','#10b981','#0284c7','#a855f7','#f59e0b','#ef4444','#14b8a6'];
const MONTHS_TH    = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const KY_ATTACHMENT_LIMIT = 20 * 1024 * 1024;
const KY_VIDEO_LIMIT = 200 * 1024 * 1024;
const KY_VIDEO_CHUNK_SIZE = 1 * 1024 * 1024;
const KY_VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv', 'mpeg', 'mpg'];
const KY_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/avi', 'video/x-msvideo', 'video/x-matroska', 'video/mpeg'];
let _kyVideoUploadConfig = {
    maxFileSize: KY_VIDEO_LIMIT,
    chunkSize: KY_VIDEO_CHUNK_SIZE,
    acceptedExtensions: KY_VIDEO_EXTENSIONS,
    acceptedMimeTypes: KY_VIDEO_MIME_TYPES,
    maxAttempts: 3,
    requiresChunkSha256: true,
};
const KY_VIDEO_SHOWCASE_LIMIT = 6;
const KY_COMPANY_EMAIL_DOMAIN = '@thaisummit-harness.co.th';
const JOHNNY_IMAGE_RISK_DRAFT_KEY = 'johnny_image_risk_draft';
const KY_EXTERNAL_BACKUP_ROOT = '\\\\192.168.124.87';

async function uploadKyVideoInChunks(activityId, file, onProgress = () => {}) {
    if (!activityId) throw new Error('ไม่พบรหัสกิจกรรม KY สำหรับอัปโหลดวิดีโอ');
    const configuredLimit = Number(_kyVideoUploadConfig.maxFileSize || KY_VIDEO_LIMIT);
    if (!file || file.size <= 0 || file.size > configuredLimit) throw new Error(`วิดีโอต้องมีขนาดไม่เกิน ${formatFileSize(configuredLimit)}`);

    const initialized = await API.post(`/ky/${encodeURIComponent(activityId)}/video-upload/init`, {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || '',
    });
    const uploadId = initialized?.data?.uploadId;
    const chunkSize = Number(initialized?.data?.chunkSize || KY_VIDEO_CHUNK_SIZE);
    const totalChunks = Number(initialized?.data?.totalChunks || Math.ceil(file.size / chunkSize));
    const maxAttempts = Math.max(1, Math.min(5, Number(initialized?.data?.maxAttempts || _kyVideoUploadConfig.maxAttempts || 3)));
    if (!uploadId || !Number.isSafeInteger(chunkSize) || chunkSize <= 0 || chunkSize > KY_VIDEO_CHUNK_SIZE
        || !Number.isSafeInteger(totalChunks) || totalChunks <= 0 || totalChunks !== Math.ceil(file.size / chunkSize)) {
        if (uploadId) {
            await API.delete(`/ky/${encodeURIComponent(activityId)}/video-upload/${uploadId}`, { suppressErrorLog: true }).catch(() => {});
        }
        throw new Error('เซิร์ฟเวอร์ไม่สามารถเริ่มชุดอัปโหลดวิดีโอได้');
    }
    _kyVideoUploadConfig = { ..._kyVideoUploadConfig, ...initialized.data, maxAttempts };

    let uploadCompleted = false;
    try {
        onProgress(0, totalChunks, false, { phase: 'uploading', attempt: 1, index: 0 });
        for (let index = 0; index < totalChunks; index += 1) {
            const start = index * chunkSize;
            const chunk = file.slice(start, Math.min(file.size, start + chunkSize));
            const chunkSha256 = await sha256Blob(chunk);
            let lastError = null;
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                try {
                    onProgress(index, totalChunks, false, { phase: attempt > 1 ? 'retrying' : 'uploading', attempt, index });
                    const form = new FormData();
                    form.append('chunk', chunk, `${file.name}.part-${index}`);
                    await API.post(`/ky/${encodeURIComponent(activityId)}/video-upload/${uploadId}/chunk/${index}`, form, {
                        headers: { 'X-KY-Chunk-SHA256': chunkSha256 },
                    });
                    lastError = null;
                    break;
                } catch (error) {
                    lastError = error;
                    if (!isRetryableKyVideoChunkError(error) || attempt >= maxAttempts) break;
                    await new Promise(resolve => setTimeout(resolve, attempt * 500));
                }
            }
            if (lastError) throw lastError;
            onProgress(index + 1, totalChunks, false, { phase: 'uploading', attempt: 1, index });
        }
        onProgress(totalChunks, totalChunks, false, { phase: 'assembling', attempt: 1, index: totalChunks - 1 });
        const completed = await API.post(`/ky/${encodeURIComponent(activityId)}/video-upload/${uploadId}/complete`, {});
        uploadCompleted = true;
        onProgress(totalChunks, totalChunks, true, { phase: 'complete', attempt: 1, index: totalChunks - 1 });
        return completed;
    } catch (error) {
        if (!uploadCompleted) {
            await API.delete(`/ky/${encodeURIComponent(activityId)}/video-upload/${uploadId}`, { suppressErrorLog: true }).catch(() => {});
        }
        throw error;
    }
}

async function sha256Blob(blob) {
    if (!globalThis.crypto?.subtle) throw new Error('เบราว์เซอร์นี้ไม่รองรับการตรวจสอบ SHA-256 สำหรับอัปโหลดวิดีโอ');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function isRetryableKyVideoChunkError(error) {
    return !['KY_VIDEO_CHUNK_TOO_LARGE', 'KY_VIDEO_CHUNK_SIZE_MISMATCH', 'KY_VIDEO_CHUNK_HASH_REQUIRED', 'KY_VIDEO_CHUNK_INVALID'].includes(String(error?.code || ''));
}

async function loadKyVideoUploadConfig() {
    try {
        const response = await API.get('/ky/video-upload/config', { suppressErrorLog: true });
        const config = response?.data || {};
        if (Number.isSafeInteger(Number(config.maxFileSize)) && Number(config.maxFileSize) > 0
            && Number.isSafeInteger(Number(config.chunkSize)) && Number(config.chunkSize) > 0 && Number(config.chunkSize) <= KY_VIDEO_CHUNK_SIZE) {
            _kyVideoUploadConfig = { ..._kyVideoUploadConfig, ...config };
        }
    } catch (_) {
        // Safe defaults remain usable when an older backend is temporarily serving the page.
    }
}

function kyVideoAcceptValue() {
    const mimeTypes = Array.isArray(_kyVideoUploadConfig.acceptedMimeTypes) ? _kyVideoUploadConfig.acceptedMimeTypes : KY_VIDEO_MIME_TYPES;
    const extensions = Array.isArray(_kyVideoUploadConfig.acceptedExtensions) ? _kyVideoUploadConfig.acceptedExtensions : KY_VIDEO_EXTENSIONS;
    return [...new Set([...mimeTypes, ...extensions.map(extension => `.${extension}`)])].join(',');
}

function kyVideoLimitText() {
    return `MP4, MOV, WebM, AVI, MKV, MPEG · ≤ ${formatFileSize(Number(_kyVideoUploadConfig.maxFileSize || KY_VIDEO_LIMIT))} · Adaptive chunk ≤ ${formatFileSize(Number(_kyVideoUploadConfig.chunkSize || KY_VIDEO_CHUNK_SIZE))}`;
}

function setKyVideoUploadProgress(button, completed, total, done = false, meta = {}, label = 'กำลังอัปโหลดวิดีโอ') {
    if (!button) return;
    const percent = done ? 100 : (total > 0 ? Math.min(95, Math.round((completed / total) * 95)) : 0);
    const prefix = meta.phase === 'retrying'
        ? `กำลังลองใหม่ส่วนที่ ${Number(meta.index || 0) + 1} (${meta.attempt}/${_kyVideoUploadConfig.maxAttempts || 3})`
        : (meta.phase === 'assembling' ? 'กำลังตรวจสอบและรวมวิดีโอ' : label);
    button.textContent = `${prefix} ${percent}%`;
}

function kyMediaUrl(url) {
    return normalizeDocumentUrl(url || '');
}

function kyHasEvidenceFile(row) {
    return kyHasText(row?.AttachmentUrl);
}

function kyHasEvidenceVideo(row) {
    if (row && Object.prototype.hasOwnProperty.call(row, 'HasVideoEvidence')) {
        return Boolean(Number(row.HasVideoEvidence));
    }
    return kyHasText(row?.VideoUrl) || Boolean(row?.hasVideo);
}

function kyHasProductionVideo(row) {
    if (row && Object.prototype.hasOwnProperty.call(row, 'HasProductionVideo')) {
        return Boolean(Number(row.HasProductionVideo));
    }
    return Boolean(row?.hasProductionVideo) || kyHasText(row?.VideoUrl);
}

function kyHasVerifiedExternalVideo(row) {
    return row && Object.prototype.hasOwnProperty.call(row, 'HasVerifiedExternalVideo')
        ? Boolean(Number(row.HasVerifiedExternalVideo))
        : Boolean(row?.hasVerifiedExternalVideo);
}

function kyHasPendingExternalVideo(row) {
    return row && Object.prototype.hasOwnProperty.call(row, 'HasPendingExternalVideo')
        ? Boolean(Number(row.HasPendingExternalVideo))
        : Boolean(row?.hasPendingExternalVideo);
}

function kyEvidenceStatus(row) {
    const hasFile = kyHasEvidenceFile(row);
    const hasVideo = kyHasEvidenceVideo(row);
    if (hasFile && hasVideo) {
        const external = !kyHasProductionVideo(row) && kyHasVerifiedExternalVideo(row);
        return {
            id: 'complete',
            label: external ? 'File + verified external video' : 'File + Production video',
            shortLabel: external ? 'External verified' : 'Production video',
            className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        };
    }
    if (hasFile && kyHasPendingExternalVideo(row)) {
        return {
            id: 'external_pending',
            label: 'External video pending Admin verify',
            shortLabel: 'External pending',
            className: 'bg-amber-50 text-amber-700 border-amber-100',
        };
    }
    if (hasFile && !hasVideo) {
        return {
            id: 'waiting_video',
            label: 'Waiting for video',
            shortLabel: 'Need video',
            className: 'bg-purple-50 text-purple-700 border-purple-100',
        };
    }
    return {
        id: 'missing_file',
        label: 'Missing required file',
        shortLabel: 'Missing file',
        className: 'bg-red-50 text-red-700 border-red-100',
    };
}

function renderKyEvidenceBadge(row, compact = false) {
    const status = kyEvidenceStatus(row);
    return `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${status.className}">
        ${escHtml(compact ? status.shortLabel : status.label)}
    </span>`;
}

function summarizeKyEvidence(records) {
    const summary = {
        total: records.length,
        complete: 0,
        waitingVideo: 0,
        noVideo: 0,
        productionVideo: 0,
        verifiedExternalVideo: 0,
        pendingExternalVideo: 0,
        missingFile: 0,
        completionPct: 0,
        waitingVideoItems: [],
        missingFileItems: [],
    };
    records.forEach(row => {
        const status = kyEvidenceStatus(row).id;
        if (!kyHasEvidenceVideo(row)) summary.noVideo += 1;
        if (kyHasProductionVideo(row)) summary.productionVideo += 1;
        else if (kyHasVerifiedExternalVideo(row)) summary.verifiedExternalVideo += 1;
        else if (kyHasPendingExternalVideo(row)) summary.pendingExternalVideo += 1;
        if (status === 'complete') summary.complete += 1;
        else if (status === 'waiting_video' || status === 'external_pending') {
            summary.waitingVideo += 1;
            summary.waitingVideoItems.push(row);
        } else {
            summary.missingFile += 1;
            summary.missingFileItems.push(row);
        }
    });
    summary.completionPct = summary.total ? Math.round((summary.complete / summary.total) * 100) : 0;
    return summary;
}

function filterKyEvidenceRecords(records, filter) {
    if (!filter || filter === 'all') return records;
    if (filter === 'no_video') return records.filter(row => !kyHasEvidenceVideo(row));
    if (filter === 'production_video') return records.filter(kyHasProductionVideo);
    if (filter === 'external_verified') return records.filter(row => !kyHasProductionVideo(row) && kyHasVerifiedExternalVideo(row));
    if (filter === 'external_pending') return records.filter(row => !kyHasProductionVideo(row) && !kyHasVerifiedExternalVideo(row) && kyHasPendingExternalVideo(row));
    return records.filter(row => kyEvidenceStatus(row).id === filter);
}

function kyHasText(value) {
    return String(value || '').trim().length > 0;
}

function findKyCachedRecord(id) {
    const target = String(id || '');
    const pools = [
        _historyRecords,
        _kyEvidenceRecords,
        _kyVideoShowcase,
        _kyVideoLibrary.items,
    ];
    for (const pool of pools) {
        const found = (pool || []).find(row => String(row?.id) === target);
        if (found) return found;
    }
    return null;
}

async function runKyButtonAction(button, busyLabel, action) {
    if (!button || button.disabled) return;
    const previousHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add('opacity-60', 'cursor-wait');
    if (busyLabel) button.textContent = busyLabel;
    try {
        await action();
    } finally {
        button.disabled = false;
        button.classList.remove('opacity-60', 'cursor-wait');
        button.innerHTML = previousHtml;
    }
}

function kyFormValidationState(form = document.getElementById('ky-form')) {
    if (!form) return { ready: false, missing: ['Form'] };
    const missing = [];
    const value = name => form.querySelector(`[name="${name}"]`)?.value || '';
    const dept = document.getElementById('ky-main-dept')?.value || value('Department');
    const safetyUnitSelect = document.getElementById('ky-safety-unit-select');
    const attachment = document.getElementById('ky-attachment')?.files?.[0];
    if (_isAdmin && !kyHasText(document.getElementById('ky-reporter-id')?.value)) missing.push('Reporter');
    if (!kyHasText(dept)) missing.push('Department');
    if (safetyUnitSelect && !kyHasText(safetyUnitSelect.value)) missing.push('Safety Unit');
    if (!kyHasText(value('ActivityDate'))) missing.push('Activity date');
    if (!kyHasText(value('TeamName'))) missing.push('Team name');
    if (!kyHasText(value('KYTKeyword'))) missing.push('KYT keyword');
    if (!form.querySelector('[name="RiskCategory"]:checked')) missing.push('Risk category');
    if (!_participants.length) missing.push('Participants');
    if (!kyHasText(value('HazardDescription'))) missing.push('Hazard detail');
    if (!kyHasText(value('Countermeasure'))) missing.push('Countermeasure');
    if (!attachment) missing.push('Attachment file');
    return { ready: missing.length === 0, missing };
}

function updateKySubmitReadiness() {
    const box = document.getElementById('ky-submit-readiness');
    const btn = document.getElementById('ky-submit-btn');
    const state = kyFormValidationState();
    if (btn) {
        btn.disabled = !state.ready;
        btn.classList.toggle('opacity-60', !state.ready);
        btn.classList.toggle('cursor-not-allowed', !state.ready);
        btn.title = state.ready ? '' : `Missing: ${state.missing.join(', ')}`;
    }
    if (!box) return state;
    const items = [
        ['Reporter', !_isAdmin || kyHasText(document.getElementById('ky-reporter-id')?.value)],
        ['Department', !state.missing.includes('Department')],
        ['Safety Unit', !state.missing.includes('Safety Unit')],
        ['Activity date', !state.missing.includes('Activity date')],
        ['Team name', !state.missing.includes('Team name')],
        ['KYT keyword', !state.missing.includes('KYT keyword')],
        ['Risk category', !state.missing.includes('Risk category')],
        ['Participants', !state.missing.includes('Participants')],
        ['Hazard detail', !state.missing.includes('Hazard detail')],
        ['Countermeasure', !state.missing.includes('Countermeasure')],
        ['Attachment file', !state.missing.includes('Attachment file')],
        ['Video evidence', true, 'optional'],
    ];
    box.innerHTML = `
        <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3">
                <div>
                    <p class="text-xs font-bold text-slate-500 uppercase">Submit readiness</p>
                    <p class="text-sm font-bold ${state.ready ? 'text-emerald-700' : 'text-amber-700'}">
                        ${state.ready ? 'Ready to submit' : `${state.missing.length} required item(s) missing`}
                    </p>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-bold ${state.ready ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}">
                    ${state.ready ? 'Complete' : 'Incomplete'}
                </span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                ${items.map(([label, ok, note]) => `
                    <div class="rounded-lg border px-2.5 py-2 text-xs font-semibold ${ok ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-amber-100 bg-amber-50 text-amber-700'}">
                        <span class="mr-1">${ok ? '✓' : '!'}</span>${label}${note ? `<span class="block text-[10px] font-normal text-slate-400">${note}</span>` : ''}
                    </div>`).join('')}
            </div>
        </div>`;
    return state;
}
function kyEmailSourceLabel(source) {
    if (source === 'selected') return 'Employee Master ของผู้รายงาน';
    if (source === 'current') return 'Employee Master ของบัญชีปัจจุบัน';
    return 'Company Email';
}

function updateKyReporterEmailStatus(email, source = 'current') {
    const input = document.getElementById('ky-reporter-email');
    const note = document.getElementById('ky-reporter-email-note');
    const badge = document.getElementById('ky-reporter-email-badge');
    const editBtn = document.getElementById('ky-reporter-email-edit');
    if (!input) return;

    const value = String(email || '').trim();
    const hasEmail = Boolean(value);
    input.value = value;
    input.readOnly = hasEmail;
    input.classList.toggle('bg-slate-50', hasEmail);
    input.classList.toggle('cursor-not-allowed', hasEmail);
    input.dataset.masterEmail = value;

    if (badge) {
        badge.className = hasEmail
            ? 'px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200'
            : 'px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200';
        badge.textContent = hasEmail ? 'ดึงจาก Employee Master' : 'ยังไม่มี CompanyEmail';
    }
    if (editBtn) {
        editBtn.classList.toggle('hidden', !hasEmail);
    }
    if (note) {
        note.textContent = hasEmail
            ? `ระบบดึงจาก ${kyEmailSourceLabel(source)} แล้ว และจะบันทึกอีเมลนี้ไว้กับรายการ KY ณ วันที่ส่ง`
            : `ยังไม่พบ CompanyEmail ใน Employee Master กรอกอีเมลบริษัทได้หากต้องการรับแจ้งเตือน ต้องลงท้ายด้วย ${KY_COMPANY_EMAIL_DOMAIN}`;
    }
    renderKySubmitSummary();
}

function unlockKyReporterEmail() {
    const input = document.getElementById('ky-reporter-email');
    const note = document.getElementById('ky-reporter-email-note');
    const badge = document.getElementById('ky-reporter-email-badge');
    const editBtn = document.getElementById('ky-reporter-email-edit');
    if (!input) return;
    input.readOnly = false;
    input.classList.remove('bg-slate-50', 'cursor-not-allowed');
    input.focus();
    if (badge) {
        badge.className = 'px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-700 border border-sky-200';
        badge.textContent = 'แก้ไขเอง';
    }
    if (editBtn) editBtn.classList.add('hidden');
    if (note) note.textContent = `แก้ไขได้เฉพาะกรณีอีเมลใน Master ยังไม่ตรง ต้องลงท้ายด้วย ${KY_COMPANY_EMAIL_DOMAIN}`;
}

function renderKySubmitSummary() {
    const box = document.getElementById('ky-submit-summary');
    if (!box) return;

    const user = TSHSession.getUser() || {};
    const reporterName = _submitReporter?.EmployeeName || user.name || '-';
    const dept = document.getElementById('ky-main-dept')?.value || _submitReporter?.Department || user.department || '-';
    const safetyUnit = document.getElementById('ky-safety-unit-select')?.value || '-';
    const activityDate = document.querySelector('#ky-form [name="ActivityDate"]')?.value || '-';
    const email = document.getElementById('ky-reporter-email')?.value || '-';
    const risk = document.querySelector('#ky-form [name="RiskCategory"]:checked')?.value || '-';

    box.innerHTML = `
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
                <p class="text-xs font-bold text-slate-500 uppercase">ตรวจสอบก่อนส่ง / Review before submit</p>
                <h3 class="text-sm font-bold text-slate-800 mt-1">รายการนี้จะถูกบันทึกเป็น KY ของ ${escHtml(reporterName)}</h3>
            </div>
            <div class="text-xs font-semibold text-slate-500">ระบบจะส่งอีเมลแจ้งสถานะไปที่ <span class="text-slate-800">${escHtml(email)}</span></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-3 text-xs">
            <div class="rounded-lg bg-white border border-slate-200 px-3 py-2"><span class="block text-slate-400">วันที่</span><b class="text-slate-800">${escHtml(activityDate)}</b></div>
            <div class="rounded-lg bg-white border border-slate-200 px-3 py-2"><span class="block text-slate-400">แผนก</span><b class="text-slate-800">${escHtml(dept)}</b></div>
            <div class="rounded-lg bg-white border border-slate-200 px-3 py-2"><span class="block text-slate-400">Safety Unit</span><b class="text-slate-800">${escHtml(safetyUnit)}</b></div>
            <div class="rounded-lg bg-white border border-slate-200 px-3 py-2"><span class="block text-slate-400">ความเสี่ยง</span><b class="text-slate-800">${escHtml(risk)}</b></div>
            <div class="rounded-lg bg-white border border-slate-200 px-3 py-2"><span class="block text-slate-400">ผู้เข้าร่วม</span><b class="text-slate-800">${_participants.length || 0} คน</b></div>
        </div>`;
    updateKySubmitReadiness();
}

const KY_VIDEO_REACTIONS = [
    { id: 'useful',    emoji: '👍', label: 'Useful',        tone: '#2563eb' },
    { id: 'practice',  emoji: '✅', label: 'Good Practice', tone: '#059669' },
    { id: 'awareness', emoji: '💡', label: 'Awareness',     tone: '#7c3aed' },
    { id: 'attention', emoji: '⚠️', label: 'Attention',     tone: '#dc2626' },
];

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _isAdmin       = false;
let _activeTab     = 'dashboard';
let _statsYear     = new Date().getFullYear();
let _filterStatus  = 'all';
let _filterDept    = 'all';
let _searchQ       = '';
let _listenersReady= false;
let _chartLine     = null;
let _chartBar      = null;
let _chartDoughnut = null;
let _participants  = [];   // for form: [{ id, name, isLeader }]
let _historyRecords = [];  // cached for Excel export
let _filterHistYear = new Date().getFullYear();
let _filterHistDept = 'all';
let _filterHistRisk = 'all';
let _filterHistSource = 'all';
let _filterHistEvidence = 'all';
let _kyEvidenceChartFilter = 'all';
let _kyEvidenceSelectedKey = '';
let _kyEvidenceOverviewRows = [];
let _filterMgmtYear = new Date().getFullYear();
let _filterMgmtDept = 'all';
let _filterMgmtRisk = 'all';
let _filterDateFrom = '';
let _filterDateTo   = '';
let _historyRequestSeq = 0;
let _departments    = [];
let _lastStatsData   = null;
let _kyProgConfig   = [];                          // KY_Program_Config for current year
let _manageSub      = 'coverage';                  // 'coverage' | 'annual-video' | 'config' | 'forms'
let _kyAnnualVideoData = null;
let _kyAnnualAdminView = 'overview';               // overview | annual | inventory | cleanup
let _kyAnnualAdminFilters = { search: '', department: 'all', status: 'action' };
let _configYear     = new Date().getFullYear();
let _safetyUnits    = [];                          // Master_SafetyUnits
let _empSearchTimer = null;
let _empSearchResults = [];
let _reporterSearchTimer = null;
let _reporterSearchResults = [];
let _submitReporter = null;
let _submitEmailProfile = null;
let _kyForms         = [];
let _kyVideoShowcase = [];
let _kyVideoLibrary = {
    items: [],
    pagination: { page: 1, pageSize: 6, total: 0, pages: 0 },
    summary: { totalVideos: 0, totalReactions: 0, pinnedVideos: 0, hiddenVideos: 0, departments: [] },
    filters: {
        year: new Date().getFullYear(),
        department: 'all',
        safetyUnit: 'all',
        riskCategory: 'all',
        status: 'all',
        pinned: 'all',
        show: 'all',
        q: '',
    },
};
let _kyEvidenceRecords = [];
let _kyCardSaveMenu = null;
let _kyCardSaveHold = null;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadKyPage() {
    const container = document.getElementById('ky-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _isAdmin = user.role === 'Admin' || user.Role === 'Admin';

    window.closeModal = closeModal;

    await loadKyVideoUploadConfig();
    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    const johnnyDraft = _peekJohnnyImageRiskDraft('ky');
    _activeTab = johnnyDraft ? 'submit' : (window._getTab?.('ky', _activeTab) || _activeTab);
    switchTab(_activeTab);
    _loadHeroStats();
}

function _peekJohnnyImageRiskDraft(target) {
    try {
        const draft = JSON.parse(sessionStorage.getItem(JOHNNY_IMAGE_RISK_DRAFT_KEY) || 'null');
        return draft?.source === 'johnny_ai_image_analysis' && draft?.target === target ? draft : null;
    } catch {
        return null;
    }
}

function _consumeJohnnyImageRiskDraft(target) {
    const draft = _peekJohnnyImageRiskDraft(target);
    if (draft) sessionStorage.removeItem(JOHNNY_IMAGE_RISK_DRAFT_KEY);
    return draft;
}

function _johnnyDraftKyRiskCategoryIndex(answer = '') {
    const text = String(answer || '').toLowerCase();
    const pairs = [
        [/electric|ไฟฟ|สายไฟ|ปลั๊ก|ช็อต|shock/, 5],
        [/chemical|สารเคมี|sds|รั่วไหล|spill/, 4],
        [/machine|เครื่องจักร|หนีบ|ตัด|หมุน|guard|loto/, 2],
        [/unsafe act|พฤติกรรม|ไม่สวม|ไม่ใส่|ฝ่าฝืน/, 3],
        [/แสง|เสียง|ฝุ่น|ร้อน|อากาศ|environment/, 1],
    ];
    const found = pairs.find(([pattern]) => pattern.test(text));
    return found ? found[1] : 0;
}

function _applyJohnnyImageRiskDraftToKy() {
    const draft = _consumeJohnnyImageRiskDraft('ky');
    if (!draft) return;

    const form = document.getElementById('ky-form');
    if (!form) return;

    const answer = String(draft.answer || '').trim();
    const categoryIndex = _johnnyDraftKyRiskCategoryIndex(answer);
    const keyword = form.querySelector('[name="KYTKeyword"]');
    const hazard = form.querySelector('[name="HazardDescription"]');
    const countermeasure = form.querySelector('[name="Countermeasure"]');
    const riskInput = form.querySelectorAll('input[name="RiskCategory"]')[categoryIndex];

    if (riskInput) riskInput.checked = true;
    if (keyword && !keyword.value) keyword.value = 'Johnny AI image risk';
    if (hazard && !hazard.value) hazard.value = `Draft from Johnny AI image risk analysis\n\n${answer}`;
    if (countermeasure && !countermeasure.value) {
        countermeasure.value = 'Review the actual work area, confirm the hazards with the team, and define immediate controls plus permanent preventive actions before submitting.';
    }

    renderKySubmitSummary();
    form.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('change', { bubbles: true }));
    showToast('เติม draft จาก Johnny AI แล้ว กรุณาตรวจสอบก่อนส่ง', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB CONFIG
// ─────────────────────────────────────────────────────────────────────────────
function _getTabs() {
    return [
        { id: 'dashboard', label: 'Dashboard',      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
        { id: 'submit',    label: 'ส่งกิจกรรม KY',  icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>` },
        { id: 'history',   label: 'ประวัติ',         icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>` },
        ...(_isAdmin ? [{ id: 'manage', label: 'จัดการ', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>` }] : []),
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    const tabHtml = _getTabs().map(t => `
        <button id="ky-tab-btn-${t.id}" data-tab="${t.id}"
            class="ky-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" data-ky-card-image="ky-hero" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="ky-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#ky-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none"
                 style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347A3.001 3.001 0 0112 21a3.001 3.001 0 01-2.789-4.1l-.347-.347z"/>
                                </svg>
                                KY Ability
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">กิจกรรมทำนายอันตราย (Kiken Yochi)</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Hazard Prediction Activity · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <div id="ky-hero-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 w-full md:w-auto flex-shrink-0"></div>
                </div>

                <div class="flex overflow-x-auto gap-0 -mb-px scrollbar-none">
                    ${tabHtml}
                </div>
            </div>
        </div>

        <!-- Tab Content -->
        <div id="ky-tab-content" class="min-h-[400px]"></div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB SWITCH
// ─────────────────────────────────────────────────────────────────────────────
async function switchTab(tab) {
    _activeTab = tab;
    window._saveTab?.('ky', tab);

    const active   = 'ky-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white';
    const inactive = 'ky-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';

    _getTabs().forEach(t => {
        const btn = document.getElementById(`ky-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === tab ? active : inactive;
        btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>${t.label}`;
    });

    const content = document.getElementById('ky-tab-content');
    if (!content) return;

    content.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 text-slate-400">
            <div class="animate-spin rounded-full h-9 w-9 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <p class="text-sm">กำลังโหลด...</p>
        </div>`;

    switch (tab) {
        case 'dashboard': await renderDashboard(content); break;
        case 'submit':
            await renderSubmitForm(content);
            setTimeout(_applyJohnnyImageRiskDraftToKy, 0);
            break;
        case 'history':   await renderHistory(content);   break;
        case 'manage':    await renderManage(content);    break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPARTMENTS CACHE
// ─────────────────────────────────────────────────────────────────────────────
async function _fetchDepartments() {
    if (_departments.length) return;
    try {
        const res = await API.get('/master/departments');
        _departments = (res?.data || res || []).map(d => (d.Name || d.name || '').trim()).filter(Boolean);
    } catch { _departments = []; }
}

async function _fetchSafetyUnits() {
    if (_safetyUnits.length) return;
    try {
        const res = await API.get('/master/safety-units');
        _safetyUnits = (res?.data || res || []);
    } catch { _safetyUnits = []; }
}

async function _fetchProgramConfig(year) {
    try {
        const res = await API.get(`/ky/program-config?year=${year}`);
        _kyProgConfig = normalizeApiArray(res?.data ?? res);
    } catch { _kyProgConfig = []; }
}

function parseKySafetyUnits(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map(v => String(v || '').trim()).filter(Boolean);
    } catch (_) {}
    return String(value).split(',').map(v => v.trim()).filter(Boolean);
}

function formatKyDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

function kyActivityDate(value) {
    if (!value) return null;
    const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = match
        ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
        : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatKyActivityDate(value) {
    const date = kyActivityDate(value);
    return date ? date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
}

function formatKyActivityMonth(value) {
    const date = kyActivityDate(value);
    return date ? date.toLocaleDateString('th-TH', { month: 'short', year: 'numeric' }) : '-';
}

function getKyConfigForDept(department, year = _statsYear) {
    const dept = String(department || '').trim();
    return _kyProgConfig.find(c => String(c.Department || '').trim() === dept && (!year || Number(c.Year || year) === Number(year))) || null;
}

function getKySafetyUnitsForDept(department, year = _statsYear) {
    const cfg = getKyConfigForDept(department, year);
    return parseKySafetyUnits(cfg?.SafetyUnits);
}

function getKyDepartmentOptions(year = _statsYear) {
    const configured = _kyProgConfig
        .filter(c => !year || Number(c.Year || year) === Number(year))
        .filter(c => c.IsActive === undefined || Number(c.IsActive) === 1)
        .map(c => String(c.Department || '').trim())
        .filter(Boolean);
    const source = configured.length ? configured : _departments;
    return [...new Set(source.map(d => String(d || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function buildKyDepartmentOptions(selected = '', year = _statsYear) {
    const list = getKyDepartmentOptions(year);
    const value = String(selected || '').trim();
    if (value && !list.includes(value)) list.unshift(value);
    return list.map(dept => `<option value="${escHtml(dept)}" ${dept === value ? 'selected' : ''}>${escHtml(dept)}</option>`).join('');
}

function buildKyHeroTargetCard(kpi) {
    const target = Number(kpi?.targetTotal || 0);
    const actual = Number(kpi?.targetSubmitted ?? kpi?.total ?? 0);
    if (!target) return '';
    const rawPct = Math.round(actual * 100 / target);
    const pct = Math.min(100, rawPct);
    const now = new Date();
    const currentYear = now.getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear + 1, 0, 1);
    const elapsedPct = Math.max(0, Math.min(100, Math.round(((now - yearStart) / (yearEnd - yearStart)) * 100)));
    const paceGap = rawPct - elapsedPct;
    const paceLabel = rawPct >= 100 ? 'ครบเป้าปี' : paceGap >= 0 ? 'ตามแผนปี' : paceGap >= -10 ? 'ใกล้แผนปี' : 'ต่ำกว่าแผนปี';
    const barColor = rawPct >= 100 ? '#6ee7b7' : paceGap >= 0 ? '#6ee7b7' : paceGap >= -10 ? '#fde68a' : '#fca5a5';
    const textColor = rawPct >= 100 ? '#6ee7b7' : paceGap >= 0 ? '#6ee7b7' : paceGap >= -10 ? '#fde68a' : '#fca5a5';
    return `
        <div class="rounded-xl px-4 py-3 text-center"
             style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:116px">
            <p class="text-2xl font-black leading-tight" style="color:${textColor}">
                ${rawPct}<span class="text-sm font-bold" style="opacity:0.8">%</span>
            </p>
            <p class="text-[11px] mt-0.5 font-bold" style="color:rgba(167,243,208,0.9)">KPI รวมแผนก</p>
            <p class="text-[10px] leading-tight" style="color:rgba(209,250,229,0.72)">${actual}/${target} · ${paceLabel}</p>
            <div class="mt-1.5 h-1.5 rounded-full overflow-hidden"
                 style="background:rgba(255,255,255,0.2)">
                <div class="h-full rounded-full"
                     style="width:${pct}%;background:${barColor}"></div>
            </div>
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO STATS STRIP
// ─────────────────────────────────────────────────────────────────────────────
async function _loadHeroStats() {
    const strip = document.getElementById('ky-hero-stats');
    if (!strip) return;

    strip.innerHTML = [1,2,3,4].map(() => `
        <div class="rounded-xl px-4 py-3 text-center animate-pulse" style="background:rgba(255,255,255,0.12);min-width:80px">
            <div class="h-7 bg-white/20 rounded-lg mb-1.5 mx-auto w-10"></div>
            <div class="h-3 bg-white/15 rounded w-14 mx-auto"></div>
        </div>`).join('');

    try {
        const year = new Date().getFullYear();
        const res  = await API.get(`/ky/stats?year=${year}`);
        const kpi  = res?.data?.kpi || {};

        const stats = [
            { value: kpi.total      ?? '—', label: 'ทั้งหมด',       color: '#6ee7b7' },
            { value: kpi.open       ?? '—', label: 'รอตรวจสอบ',     color: '#6ee7b7' },
            { value: kpi.reviewed   ?? '—', label: 'ตรวจสอบแล้ว',   color: '#6ee7b7' },
            { value: kpi.closed     ?? '—', label: 'ปิดแล้ว',        color: '#6ee7b7' },
        ];

        strip.innerHTML = stats.map(s => `
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
                <p class="text-2xl font-bold" style="color:${s.color}">${s.value}</p>
                <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${s.label}</p>
            </div>`).join('');

        const atCard = _isAdmin
            ? buildKyHeroTargetCard(kpi)
            : await buildActivityCard('ky', { noDataMode: 'empty' });
        if (atCard) {
            strip.insertAdjacentHTML('beforeend', atCard);
            strip.className = 'grid grid-cols-3 md:grid-cols-5 gap-3 w-full md:w-auto flex-shrink-0';
        }
    } catch {
        strip.innerHTML = '';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
async function renderDashboard(container) {
    container.innerHTML = `
        <div class="space-y-5">
            <div class="ds-section p-5" data-ky-card-image="ky-dashboard-summary">
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                        <p class="text-xs font-bold text-emerald-700 uppercase">KY Dashboard</p>
                        <h2 class="text-lg font-bold text-slate-800 mt-1">ภาพรวมกิจกรรม KY / Hazard Prediction Activity</h2>
                        <p class="text-sm text-slate-500 mt-1">ติดตามการส่งรายแผนก สถานะตรวจสอบ และหัวข้อความเสี่ยงในปีที่เลือก</p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2" data-ky-card-ignore>
                        <label class="sr-only" for="ky-stats-year">ปีข้อมูล KY</label>
                        <select id="ky-stats-year" class="form-input py-2 text-sm w-32">
                            ${[0,1,2].map(i => {
                                const y = new Date().getFullYear() - i;
                                return `<option value="${y}" ${y === _statsYear ? 'selected':''}>${y}</option>`;
                            }).join('')}
                        </select>
                        <button id="ky-pdf-btn"
                            class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 transition-all">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M12 10v6m0 0l-3-3m3 3l3-3M4 17v1a2 2 0 002 2h12a2 2 0 002-2v-1M7 7l4.586-4.586a2 2 0 012.828 0L19 7"/>
                            </svg>
                            Export PDF
                        </button>
                    </div>
                </div>
                <div id="ky-executive-alert" class="pt-4"></div>
            </div>

            <!-- KPI -->
            <div id="ky-kpi-row" class="grid grid-cols-2 xl:grid-cols-5 gap-4">
                ${Array(4).fill(0).map(() =>
                    `<div class="ds-metric-card p-4 animate-pulse"><div class="h-8 bg-slate-100 rounded mb-2"></div><div class="h-4 bg-slate-50 rounded w-2/3"></div></div>`
                ).join('')}
            </div>

            <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div id="ky-executive-summary" class="xl:col-span-2"></div>
                <div id="ky-monthly-tracker-panel"></div>
            </div>

            <div id="ky-evidence-completion-panel"></div>

            <div id="ky-prog-progress"></div>

            <div id="ky-video-showcase"></div>

            <!-- Charts -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="lg:col-span-2 ds-section p-5" data-ky-card-image="ky-monthly-trend">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">แนวโน้มกิจกรรม KY รายเดือน</h3>
                    <div class="relative" style="height:220px"><canvas id="ky-chart-line"></canvas></div>
                </div>
                <div class="ds-section p-5" data-ky-card-image="ky-risk-category">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">ประเภทความเสี่ยง</h3>
                    <div class="relative" style="height:220px"><canvas id="ky-chart-doughnut"></canvas></div>
                </div>
            </div>

            <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div class="ds-section p-5" data-ky-card-image="ky-department-activity">
                    <h3 class="text-sm font-bold text-slate-600 mb-1">กิจกรรม KY แยกตามแผนก</h3>
                    <p class="text-xs text-slate-400 mb-4">เทียบจำนวนกิจกรรมของแผนกในปีที่เลือก</p>
                    <div class="relative" style="height:240px"><canvas id="ky-chart-bar"></canvas></div>
                </div>
                <div id="ky-hazard-pattern"></div>
            </div>

            <div id="ky-heatmap-panel"></div>
            <div id="ky-department-diagnostics"></div>
        </div>`;

    try {
        const res  = await API.get(`/ky/stats?year=${_statsYear}`);
        const data = res?.data || {};
        _lastStatsData = data;
        renderExecutiveAlert(data.kpi || {}, data.pendingDepts || []);
        renderKPI(data.kpi || {});
        renderExecutiveSummary(data);
        renderKyEvidenceFollowupPanel(null);
        renderProgramProgress(data.programProgress || [], data.usingConfig);
        renderCompletionTracker(data.kpi || {}, data.pendingDepts || []);
        renderLineChart(data.monthly || []);
        renderDoughnutChart(data.riskCat || []);
        renderBarChart(data.byDept || []);
        renderHazardPattern(data.topKeywords || []);
        renderDepartmentHeatmap(data.deptMonthly || [], data.byDept || []);
        renderDepartmentDiagnostics(data.unmappedDepartments || [], data.departmentSource);
        await loadAndRenderKyEvidenceCompletion();
        await renderVideoShowcase();
    } catch (err) {
        console.error('KY stats error:', err);
    }
}

function renderKPI(kpi) {
    const closureRate = kpi.total > 0 ? Math.round(((kpi.closed || 0) / kpi.total) * 100) : 0;
    const cards = [
        { label: 'กิจกรรม KY ทั้งหมด', value: kpi.total || 0, color: '#6366f1', filter: 'all', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347A3.001 3.001 0 0112 21a3.001 3.001 0 01-2.789-4.1l-.347-.347z"/>` },
        { label: 'รอตรวจสอบ', value: kpi.open || 0, color: '#0284c7', filter: 'Open', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
        { label: 'ตรวจสอบแล้ว', value: kpi.reviewed || 0, color: '#f59e0b', filter: 'Reviewed', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>` },
        { label: 'ปิดแล้ว', value: kpi.closed || 0, color: '#10b981', filter: 'Closed', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
        { label: 'อัตราปิด', value: `${closureRate}%`, color: '#0f766e', filter: 'Closed', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>` },
    ];
    const row = document.getElementById('ky-kpi-row');
    if (!row) return;
    row.innerHTML = cards.map(c => `
        <button type="button" class="ds-metric-card p-5 flex items-center gap-4 text-left hover:-translate-y-0.5 hover:shadow-lg transition-all"
                data-ky-card-image="ky-kpi-${_kySafeFilePart(c.filter)}"
                data-ky-kpi-filter="${c.filter}" title="คลิกเพื่อดูรายการในแท็บประวัติ">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                 style="background:${c.color}18; color:${c.color}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${c.icon}</svg>
            </div>
            <div>
                <div class="text-2xl font-bold text-slate-800">${c.value}</div>
                <div class="text-xs text-slate-500 mt-0.5">${c.label}</div>
            </div>
        </button>`).join('');
}

function renderExecutiveAlert(kpi, pendingDepts) {
    const el = document.getElementById('ky-executive-alert');
    if (!el) return;

    const pending = pendingDepts.length || kpi.pendingDepts || 0;
    const open = kpi.open || 0;
    if (pending <= 0 && open <= 0) {
        el.innerHTML = `
            <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 text-emerald-800">
                    <span class="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    </span>
                    <div>
                        <p class="text-sm font-bold">สถานะ KY อยู่ในเกณฑ์ดี</p>
                        <p class="text-xs text-emerald-700">ไม่มีแผนกค้างส่งในเดือนนี้ และไม่มีรายการรอตรวจสอบ</p>
                    </div>
                </div>
            </div>`;
        return;
    }

    el.innerHTML = `
        <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div class="flex items-start gap-3 text-amber-900">
                <span class="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                </span>
                <div>
                    <p class="text-sm font-bold">ต้องติดตาม KY: ${pending} แผนกยังไม่ส่ง / ${open} รายการรอตรวจสอบ</p>
                    <p class="text-xs text-amber-700 mt-0.5">ใช้สำหรับประชุมติดตามรายเดือนและจัดลำดับแผนกที่ต้องเร่งสื่อสาร</p>
                </div>
            </div>
            <button type="button" data-ky-kpi-filter="Open" class="px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors">
                ไปที่รายการรอตรวจสอบ
            </button>
        </div>`;
}

function renderExecutiveSummary(data) {
    const el = document.getElementById('ky-executive-summary');
    if (!el) return;

    const kpi = data.kpi || {};
    const monthly = data.monthly || [];
    const riskCat = data.riskCat || [];
    const byDept = data.byDept || [];
    const currentMonth = new Date().getMonth() + 1;
    const currentMonthCount = monthly.find(r => Number(r.month) === currentMonth)?.count || 0;
    const topRisk = riskCat[0]?.label || '-';
    const topDept = byDept[0]?.Department || '-';
    const coverageGap = Math.max(0, (kpi.totalDepts || 0) - (kpi.deptSubmitted || 0));

    el.innerHTML = `
        <div class="ds-section p-5 h-full" data-ky-card-image="ky-executive-summary">
            <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
                <div>
                    <p class="text-xs font-bold text-indigo-600 uppercase">Annual Overview</p>
                    <h3 class="text-base font-bold text-slate-800 mt-1">สรุปภาพรวม KY ปี ${_statsYear}</h3>
                    <p class="text-sm text-slate-500 mt-1">ใช้ดูความครอบคลุมการส่งรายแผนก และหัวข้อความเสี่ยงที่ควรนำไปติดตามต่อ</p>
                </div>
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${coverageGap ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}">
                    ${coverageGap ? `ต้องติดตาม ${coverageGap} แผนก` : 'ครอบคลุมครบตามข้อมูลปีนี้'}
                </span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div class="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p class="text-xs font-bold text-slate-400">เดือน ${MONTHS_TH[currentMonth - 1]} ${_statsYear}</p>
                    <p class="text-2xl font-bold text-slate-800 mt-1">${currentMonthCount}</p>
                    <p class="text-xs text-slate-500 mt-1">กิจกรรมที่ส่งเข้าระบบ</p>
                </div>
                <div class="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <p class="text-xs font-bold text-emerald-700">Coverage</p>
                    <p class="text-2xl font-bold text-slate-800 mt-1">${kpi.deptSubmitted || 0}/${kpi.totalDepts || 0}</p>
                    <p class="text-xs text-slate-500 mt-1">แผนกที่มีรายการในปีนี้</p>
                </div>
                <div class="rounded-xl border border-orange-100 bg-orange-50/60 p-4 min-w-0">
                    <p class="text-xs font-bold text-orange-700">ความเสี่ยงเด่น</p>
                    <p class="text-base font-bold text-slate-800 mt-2 truncate" title="${escHtml(topRisk)}">${escHtml(topRisk)}</p>
                    <p class="text-xs text-slate-500 mt-1">ประเภทที่พบมากที่สุด</p>
                </div>
                <div class="rounded-xl border border-sky-100 bg-sky-50/60 p-4 min-w-0">
                    <p class="text-xs font-bold text-sky-700">แผนกที่ส่งสูงสุด</p>
                    <p class="text-base font-bold text-slate-800 mt-2 truncate" title="${escHtml(topDept)}">${escHtml(topDept)}</p>
                    <p class="text-xs text-slate-500 mt-1">จากรายการปีที่เลือก</p>
                </div>
            </div>
        </div>`;
}

async function loadAndRenderKyEvidenceCompletion() {
    const el = document.getElementById('ky-evidence-completion-panel');
    if (!el) return;
    try {
        const params = new URLSearchParams({ year: String(_statsYear) });
        const overviewRes = await API.get(`/ky/evidence-overview?${params.toString()}`);
        const overview = normalizeApiObject(overviewRes?.data ?? overviewRes);
        const rows = normalizeApiArray(overview.rows || []);
        const records = rows.flatMap(row => normalizeApiArray(row.records || []).map(record => ({
            ...record,
            id: record.id,
            ActivityDate: record.activityDate,
            ReporterID: record.reporterId,
            ReporterName: record.reporterName,
            SubmittedByID: record.submittedById,
            SubmittedByName: record.submittedByName,
            Department: record.department,
            SafetyUnit: record.safetyUnit,
            TeamName: record.teamName,
            KYTKeyword: record.kytKeyword,
            RiskCategory: record.riskCategory,
            HazardDescription: record.hazard,
            Status: record.status,
            AttachmentUrl: record.hasFile ? 'configured-evidence-file' : '',
            VideoUrl: record.hasProductionVideo ? 'configured-production-video' : '',
            HasProductionVideo: record.hasProductionVideo ? 1 : 0,
            HasVerifiedExternalVideo: record.hasVerifiedExternalVideo ? 1 : 0,
            HasPendingExternalVideo: record.hasPendingExternalVideo ? 1 : 0,
            HasVideoEvidence: record.hasVideo ? 1 : 0,
            VideoEvidenceStorage: record.videoEvidenceStorage || 'Missing',
            canUploadVideo: Boolean(record.canUploadVideo),
            canRegisterExternalVideo: Boolean(record.canRegisterExternalVideo),
        })));
        _kyEvidenceOverviewRows = rows;
        _kyEvidenceRecords = records;
        renderKyEvidenceFollowupPanel(records);
    } catch (err) {
        console.error('KY evidence completion error:', err);
        _kyEvidenceOverviewRows = [];
        _kyEvidenceRecords = [];
        el.innerHTML = `
            <div class="ds-section p-5 border border-red-100 bg-red-50/40">
                <div class="text-sm font-bold text-red-700">Evidence completion unavailable</div>
                <div class="text-xs text-red-500 mt-1">${escHtml(err.message || 'Unable to load KY evidence status')}</div>
            </div>`;
    }
}

function renderKyEvidenceCompletionPanel(records) {
    const el = document.getElementById('ky-evidence-completion-panel');
    if (!el) return;
    if (!Array.isArray(records)) {
        el.innerHTML = `
            <div class="ds-section p-5" data-ky-card-image="ky-evidence-completion">
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div>
                        <p class="text-xs font-bold text-indigo-600 uppercase">Safety Unit Evidence</p>
                        <h3 class="text-sm font-bold text-slate-700 mt-1">Loading file / video progress</h3>
                    </div>
                    <div class="h-9 w-48 rounded-xl bg-slate-100 animate-pulse"></div>
                </div>
            </div>`;
        return;
    }
    if (!records.length) {
        _kyEvidenceRecords = [];
        el.innerHTML = `
            <div class="ds-section p-5" data-ky-card-image="ky-evidence-completion">
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div>
                        <p class="text-xs font-bold text-indigo-600 uppercase">Safety Unit Evidence</p>
                        <h3 class="text-sm font-bold text-slate-700 mt-1">KY file / video progress</h3>
                        <p class="text-sm text-slate-500 mt-1">No KY activity found for ${_statsYear}.</p>
                    </div>
                    <span class="px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-xs font-bold text-slate-500">No records</span>
                </div>
            </div>`;
        return;
    }

    _kyEvidenceRecords = records;
    const summary = summarizeKyEvidence(records);
    const unitRows = buildKyEvidenceUnitRows(records);
    const waitingUnits = unitRows
        .filter(row => row.waitingVideo || row.missingFile)
        .sort((a, b) => (b.waitingVideo + b.missingFile) - (a.waitingVideo + a.missingFile) || a.department.localeCompare(b.department))
        .slice(0, 6);
    const topRows = unitRows
        .slice()
        .sort((a, b) => a.videoPct - b.videoPct || b.waitingVideo - a.waitingVideo || a.department.localeCompare(b.department))
        .slice(0, 12);
    const metric = (value, label, tone, filter) => `
        <button type="button" data-ky-evidence-filter="${escHtml(filter)}"
                class="rounded-xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${tone}">
            <div class="text-2xl font-bold">${escHtml(String(value))}</div>
            <div class="text-xs font-semibold mt-0.5">${escHtml(label)}</div>
        </button>`;

    el.innerHTML = `
        <div class="ds-section p-5" data-ky-card-image="ky-evidence-completion">
            <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
                <div>
                    <p class="text-xs font-bold text-indigo-600 uppercase">Safety Unit Evidence</p>
                    <h3 class="text-base font-bold text-slate-800 mt-1">KY progress + file / video completion</h3>
                    <p class="text-sm text-slate-500 mt-1">One view for yearly KY progress and evidence readiness by Safety Unit.</p>
                </div>
                <div class="flex flex-wrap gap-2" data-ky-card-ignore>
                    <button type="button" data-ky-evidence-filter="all" class="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50">All</button>
                    <button type="button" data-ky-evidence-filter="complete" class="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700">Complete</button>
                    <button type="button" data-ky-evidence-filter="production_video" class="px-3 py-2 rounded-xl border border-sky-200 bg-sky-50 text-xs font-bold text-sky-700">Production</button>
                    <button type="button" data-ky-evidence-filter="external_verified" class="px-3 py-2 rounded-xl border border-teal-200 bg-teal-50 text-xs font-bold text-teal-700">External verified</button>
                    <button type="button" data-ky-evidence-filter="external_pending" class="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-xs font-bold text-amber-700">External pending</button>
                    <button type="button" data-ky-evidence-filter="waiting_video" class="px-3 py-2 rounded-xl border border-purple-200 bg-purple-50 text-xs font-bold text-purple-700">Need video</button>
                    <button type="button" data-ky-evidence-filter="missing_file" class="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-bold text-red-700">Missing file</button>
                </div>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3 mb-5">
                ${metric(summary.complete, 'File + video complete', 'border-emerald-100 bg-emerald-50 text-emerald-700', 'complete')}
                ${metric(summary.productionVideo, 'Production video', 'border-sky-100 bg-sky-50 text-sky-700', 'production_video')}
                ${metric(summary.verifiedExternalVideo, 'Verified external video', 'border-teal-100 bg-teal-50 text-teal-700', 'external_verified')}
                ${metric(summary.pendingExternalVideo, 'External pending verify', 'border-amber-100 bg-amber-50 text-amber-700', 'external_pending')}
                ${metric(summary.waitingVideo, 'Waiting for video', 'border-purple-100 bg-purple-50 text-purple-700', 'waiting_video')}
                ${metric(summary.missingFile, 'Missing required file', 'border-red-100 bg-red-50 text-red-700', 'missing_file')}
                ${metric(`${summary.complete}/${summary.total} = ${summary.completionPct}%`, 'Video completion rate', 'border-indigo-100 bg-indigo-50 text-indigo-700', 'no_video')}
            </div>
            <div class="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)] gap-4">
                <div class="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                        <div>
                            <h4 class="text-sm font-bold text-slate-700">Safety Unit evidence progress</h4>
                            <p class="text-xs text-slate-400 mt-0.5">Stacked bars show complete, waiting video, and missing file counts per unit.</p>
                        </div>
                        <div class="flex flex-wrap gap-2 text-[10px] font-bold">
                            <span class="inline-flex items-center gap-1 text-emerald-700"><span class="h-2 w-2 rounded-full bg-emerald-500"></span>Complete</span>
                            <span class="inline-flex items-center gap-1 text-purple-700"><span class="h-2 w-2 rounded-full bg-purple-500"></span>Need video</span>
                            <span class="inline-flex items-center gap-1 text-red-700"><span class="h-2 w-2 rounded-full bg-red-500"></span>Missing file</span>
                        </div>
                    </div>
                    <div class="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                        ${topRows.map(renderKyEvidenceUnitRow).join('')}
                    </div>
                </div>
                <div class="rounded-2xl border border-purple-100 bg-purple-50/50 p-4">
                    <div class="flex items-center justify-between gap-2 mb-4">
                        <div>
                            <h4 class="text-sm font-bold text-slate-700">Units needing video</h4>
                            <p class="text-xs text-slate-500 mt-0.5">Top follow-up targets.</p>
                        </div>
                        <span class="px-2 py-0.5 rounded-full bg-white border border-purple-100 text-[11px] font-bold text-purple-700">${waitingUnits.length}</span>
                    </div>
                    <div class="space-y-2">
                        ${waitingUnits.length ? waitingUnits.map(row => `
                            <button type="button" data-ky-evidence-filter="waiting_video"
                                class="w-full rounded-xl border border-white bg-white px-3 py-2 text-left hover:border-purple-200 hover:bg-purple-50 transition-colors">
                                <div class="flex items-center justify-between gap-2">
                                    <div class="min-w-0">
                                        <p class="text-xs font-bold text-slate-700 truncate">${escHtml(row.department)}</p>
                                        <p class="text-[11px] text-slate-400 truncate">${escHtml(row.unitLabel)}</p>
                                    </div>
                                    <span class="text-xs font-black text-purple-700">${row.waitingVideo}</span>
                                </div>
                            </button>`).join('') : `
                            <div class="rounded-xl border border-emerald-100 bg-white px-3 py-4 text-sm font-bold text-emerald-700">
                                All submitted records have video evidence.
                            </div>`}
                    </div>
                    ${summary.missingFile ? `
                    <div class="mt-4 rounded-xl border border-red-100 bg-white px-3 py-3 text-xs text-red-700">
                        <span class="font-bold">${summary.missingFile} record(s)</span> still miss the required attachment file.
                    </div>` : ''}
                </div>
            </div>
        </div>`;
}

function buildKyEvidenceUnitRows(records) {
    const rows = new Map();
    const progress = normalizeApiArray(_lastStatsData?.programProgress || []);
    const keyOf = (dept, unit) => `${dept || '-'}::${unit || '-'}`;
    const ensure = (dept, unit, extra = {}) => {
        const key = keyOf(dept, unit);
        if (!rows.has(key)) {
            rows.set(key, {
                department: dept || '-',
                unitLabel: unit || 'Department total',
                submitted: 0,
                target: extra.target || 0,
                progressSubmitted: extra.submitted || 0,
                complete: 0,
                waitingVideo: 0,
                missingFile: 0,
                noVideo: 0,
                videoPct: 0,
            });
        }
        const row = rows.get(key);
        if (extra.target) row.target = extra.target;
        if (extra.submitted) row.progressSubmitted = extra.submitted;
        return row;
    };

    progress.forEach(dept => {
        const units = normalizeApiArray(dept.safetyUnitProgress || []);
        if (units.length) {
            units.forEach(unit => ensure(dept.department, unit.name, {
                target: Number(unit.target || dept.unitTarget || 0),
                submitted: Number(unit.submitted || 0),
            }));
        } else {
            ensure(dept.department, '', {
                target: Number(dept.target || 0),
                submitted: Number(dept.submitted || 0),
            });
        }
    });

    records.forEach(record => {
        const row = ensure(record.Department || '-', record.SafetyUnit || '');
        row.submitted += 1;
        const status = kyEvidenceStatus(record).id;
        if (status === 'complete') row.complete += 1;
        else if (status === 'waiting_video' || status === 'external_pending') row.waitingVideo += 1;
        else row.missingFile += 1;
        if (!kyHasEvidenceVideo(record)) row.noVideo += 1;
    });

    return Array.from(rows.values())
        .map(row => ({
            ...row,
            target: row.target || row.submitted || row.progressSubmitted || 0,
            videoPct: row.submitted ? Math.round((row.complete / row.submitted) * 100) : 0,
            progressPct: row.target ? Math.min(100, Math.round(((row.progressSubmitted || row.submitted) / row.target) * 100)) : (row.submitted ? 100 : 0),
        }))
        .sort((a, b) => a.videoPct - b.videoPct || b.waitingVideo - a.waitingVideo || a.department.localeCompare(b.department));
}

function renderKyEvidenceUnitRow(row) {
    const total = Math.max(row.submitted, 1);
    const completePct = row.complete / total * 100;
    const waitingPct = row.waitingVideo / total * 100;
    const missingPct = row.missingFile / total * 100;
    const tone = row.videoPct >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
        : row.videoPct >= 40 ? 'text-purple-700 bg-purple-50 border-purple-100'
        : 'text-red-700 bg-red-50 border-red-100';
    return `
        <div class="rounded-xl border border-white bg-white px-3 py-3">
            <div class="grid grid-cols-1 xl:grid-cols-[minmax(180px,0.75fr)_minmax(260px,1fr)_minmax(140px,0.45fr)] gap-3 xl:items-center">
                <div class="min-w-0">
                    <p class="text-sm font-bold text-slate-700 truncate" title="${escHtml(row.department)}">${escHtml(row.department)}</p>
                    <p class="text-[11px] text-slate-400 truncate" title="${escHtml(row.unitLabel)}">${escHtml(row.unitLabel)}</p>
                </div>
                <div>
                    <div class="flex justify-between gap-2 text-[10px] text-slate-400 mb-1">
                        <span>Evidence completion</span>
                        <span>${row.complete}/${row.submitted || 0} videos · ${row.videoPct}%</span>
                    </div>
                    <div class="flex h-3 overflow-hidden rounded-full bg-slate-100">
                        <div class="h-full bg-emerald-500" style="width:${completePct}%"></div>
                        <div class="h-full bg-purple-500" style="width:${waitingPct}%"></div>
                        <div class="h-full bg-red-500" style="width:${missingPct}%"></div>
                    </div>
                    <div class="mt-2">
                        <div class="flex justify-between gap-2 text-[10px] text-slate-400 mb-1">
                            <span>KY yearly progress</span>
                            <span>${row.progressSubmitted || row.submitted || 0}/${row.target || 0} · ${row.progressPct}%</span>
                        </div>
                        <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div class="h-full rounded-full bg-indigo-500" style="width:${row.progressPct}%"></div>
                        </div>
                    </div>
                </div>
                <div class="flex flex-wrap xl:justify-end gap-1.5">
                    <span class="rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}">${row.videoPct}% video</span>
                    ${row.waitingVideo ? `<button type="button" data-ky-evidence-filter="waiting_video" class="rounded-full border border-purple-100 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700">${row.waitingVideo} need video</button>` : ''}
                    ${row.missingFile ? `<button type="button" data-ky-evidence-filter="missing_file" class="rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">${row.missingFile} missing file</button>` : ''}
                </div>
            </div>
        </div>`;
}

function buildConfiguredKyEvidenceRows(records) {
    if (_kyEvidenceOverviewRows.length) {
        return _kyEvidenceOverviewRows.map(row => ({
            key: row.key || `${String(row.department || '').trim()}::${String(row.safetyUnit || '').trim()}`,
            department: String(row.department || '').trim(),
            safetyUnit: String(row.safetyUnit || '').trim(),
            unitLabel: String(row.safetyUnit || '').trim() || String(row.department || '').trim(),
            isDepartmentScope: !String(row.safetyUnit || '').trim(),
            target: Number(row.yearlyTarget || 0),
            progressSubmitted: Number(row.submitted || 0),
            submitted: Number(row.submitted || 0),
            complete: Number(row.complete || 0),
            waitingVideo: Number(row.waitingVideo || 0),
            missingFile: Number(row.missingFile || 0),
            progressPct: Number(row.progressPct || 0),
            records: normalizeApiArray(row.records || []),
        }));
    }
    const rows = new Map();
    const keyOf = (department, unit) => `${String(department || '').trim()}::${String(unit || '').trim()}`;
    normalizeApiArray(_lastStatsData?.programProgress || []).forEach(department => {
        normalizeApiArray(department.safetyUnitProgress || []).forEach(unit => {
            const departmentName = String(department.department || '').trim();
            const unitName = String(unit.name || '').trim();
            if (!departmentName || !unitName) return;
            const key = keyOf(departmentName, unitName);
            rows.set(key, {
                key,
                department: departmentName,
                safetyUnit: unitName,
                unitLabel: unitName,
                isDepartmentScope: false,
                target: Number(unit.target || department.unitTarget || 0),
                progressSubmitted: Number(unit.submitted || 0),
                submitted: 0,
                complete: 0,
                waitingVideo: 0,
                missingFile: 0,
            });
        });
    });
    records.forEach(record => {
        const row = rows.get(keyOf(record.Department, record.SafetyUnit));
        if (!row) return;
        row.submitted += 1;
        const status = kyEvidenceStatus(record).id;
        if (status === 'complete') row.complete += 1;
        else if (status === 'waiting_video' || status === 'external_pending') row.waitingVideo += 1;
        else row.missingFile += 1;
    });
    return Array.from(rows.values()).map(row => ({
        ...row,
        target: row.target || row.progressSubmitted || row.submitted || 0,
        progressPct: row.target ? Math.min(100, Math.round((row.progressSubmitted / row.target) * 100)) : 0,
    })).sort((a, b) =>
        (b.missingFile + b.waitingVideo) - (a.missingFile + a.waitingVideo)
        || a.progressPct - b.progressPct
        || a.department.localeCompare(b.department)
        || a.unitLabel.localeCompare(b.unitLabel));
}

function getKyEvidenceDisplay(row) {
    const department = String(row.department || '').trim() || '-';
    const safetyUnit = String(row.safetyUnit || '').trim();
    const departmentScope = row.isDepartmentScope || !safetyUnit;
    return {
        primary: departmentScope ? department : (safetyUnit || row.unitLabel || '-'),
        secondary: departmentScope ? '' : department,
        scopeLabel: departmentScope ? 'Department scope' : 'Safety Unit',
        departmentScope,
    };
}

function renderConfiguredKyEvidenceBar(row, selected = false) {
    const total = Math.max(row.submitted, 1);
    const completePct = row.complete / total * 100;
    const waitingPct = row.waitingVideo / total * 100;
    const missingPct = row.missingFile / total * 100;
    const display = getKyEvidenceDisplay(row);
    return `
        <button type="button" data-ky-evidence-unit="${escHtml(row.key)}"
            data-ky-evidence-submitted="${Number(row.submitted || 0)}"
            data-ky-evidence-department-scope="${display.departmentScope ? '1' : '0'}"
            class="w-full px-3.5 py-2.5 text-left transition-colors ${selected ? 'bg-indigo-50/80' : 'hover:bg-emerald-50/50 odd:bg-white even:bg-slate-50/70'}">
            <div class="grid grid-cols-1 lg:grid-cols-[minmax(220px,0.34fr)_minmax(420px,1fr)_minmax(72px,0.08fr)] gap-3 lg:items-center">
                <div class="min-w-0">
                    <p class="${display.departmentScope ? 'text-sm font-black text-slate-800' : 'text-[13px] font-extrabold text-slate-800'} leading-tight break-words">${escHtml(display.primary)}</p>
                    ${display.secondary ? `<p class="text-[10px] font-semibold uppercase tracking-normal text-slate-400 mt-0.5 leading-tight break-words">${escHtml(display.secondary)}</p>` : ''}
                </div>
                <div class="min-w-0">
                    <div class="flex flex-wrap justify-between gap-2 text-[10px] mb-1">
                        <span class="text-slate-500">ครบ ${row.complete} · รอวิดีโอ ${row.waitingVideo} · ขาดไฟล์ ${row.missingFile}</span>
                        <span class="font-bold text-slate-700">ผลงาน ${row.progressSubmitted}/${row.target}</span>
                    </div>
                    <div class="flex h-4 overflow-hidden rounded bg-slate-100" role="img"
                        aria-label="${escHtml(row.unitLabel)}: complete ${row.complete}, waiting video ${row.waitingVideo}, missing file ${row.missingFile}">
                        <span class="h-full bg-emerald-500" style="width:${completePct}%"></span>
                        <span class="h-full bg-violet-500" style="width:${waitingPct}%"></span>
                        <span class="h-full bg-rose-500" style="width:${missingPct}%"></span>
                    </div>
                </div>
                <div class="flex items-center justify-between lg:justify-end gap-2">
                    <span class="text-sm font-black text-slate-700">${row.progressPct}%</span>
                    <i class="fas fa-chevron-${selected ? 'up' : 'down'} text-[10px] text-slate-400"></i>
                </div>
            </div>
        </button>`;
}

function canUploadKyFollowupVideo(record) {
    if (record && Object.prototype.hasOwnProperty.call(record, 'canUploadVideo')) return Boolean(record.canUploadVideo);
    if (_isAdmin) return true;
    const user = TSHSession.getUser() || {};
    const userId = String(user.id || user.employeeId || user.EmployeeID || '');
    return Boolean(userId) && [record.ReporterID, record.SubmittedByID].some(id => String(id || '') === userId);
}

function openKyFollowupVideoModal(record) {
    openModal('แนบวิดีโอ KY เพิ่มเติม', `
        <form id="ky-followup-video-form" class="space-y-4">
            <div>
                <p class="text-sm font-bold text-slate-800">${escHtml(record.TeamName || record.KYTKeyword || 'KY Activity')}</p>
                <p class="text-xs text-slate-500 mt-1">${escHtml(record.Department || '-')} · ${escHtml(record.SafetyUnit || '-')}</p>
            </div>
            <div class="rounded-lg border border-violet-100 bg-violet-50 px-3 py-3 text-xs text-violet-800">
                เพิ่มเฉพาะวิดีโอหลักฐาน ข้อมูลกิจกรรมและสถานะเดิมจะไม่ถูกแก้ไข
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5" for="ky-followup-video-file">ไฟล์วิดีโอ</label>
                <input id="ky-followup-video-file" name="video" type="file" accept="${escHtml(kyVideoAcceptValue())}" required class="form-input w-full">
                <p class="text-xs text-slate-400 mt-1">${escHtml(kyVideoLimitText())}</p>
            </div>
            <div class="flex justify-end gap-2">
                <button type="button" id="ky-followup-video-cancel" class="px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-600">ยกเลิก</button>
                <button type="submit" id="ky-followup-video-save" class="px-3 py-2 rounded-lg bg-violet-600 text-sm font-bold text-white">อัปโหลดวิดีโอ</button>
            </div>
        </form>`);
    document.getElementById('ky-followup-video-cancel')?.addEventListener('click', closeModal);
    document.getElementById('ky-followup-video-file')?.addEventListener('change', event => validateKySelectedFile(event.target, 'video'));
    document.getElementById('ky-followup-video-form')?.addEventListener('submit', guardSubmitHandler(async event => {
        event.preventDefault();
        const save = document.getElementById('ky-followup-video-save');
        if (save) save.disabled = true;
        try {
            showLoading('กำลังอัปโหลดวิดีโอ...');
            const file = document.getElementById('ky-followup-video-file')?.files?.[0];
            if (!file || !validateKySelectedFile(document.getElementById('ky-followup-video-file'), 'video')) return;
            await uploadKyVideoInChunks(record.id, file, (completed, total, done, meta) => setKyVideoUploadProgress(save, completed, total, done, meta));
            closeModal();
            showToast('แนบวิดีโอ KY สำเร็จ', 'success');
            await loadAndRenderKyEvidenceCompletion();
            await renderVideoShowcase();
        } catch (error) {
            showError(error);
        } finally {
            hideLoading();
            if (save) {
                save.disabled = false;
                save.textContent = 'อัปโหลดวิดีโอ';
            }
        }
    }));
}

function renderConfiguredKyEvidenceDrilldown(row, records) {
    const matching = records.filter(record =>
        String(record.Department || '').trim() === row.department
        && String(record.SafetyUnit || '').trim() === String(row.safetyUnit || '').trim())
        .filter(record => filterKyEvidenceRecords([record], _kyEvidenceChartFilter).length > 0)
        .sort((a, b) => String(b.ActivityDate || '').localeCompare(String(a.ActivityDate || '')));
    return `
        <div class="border-t-2 border-indigo-100 bg-indigo-50/40 px-1 py-4" data-ky-evidence-drilldown>
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                    <p class="text-sm font-bold text-slate-800">${escHtml(row.unitLabel)}</p>
                    <p class="text-xs text-slate-500">${escHtml(row.department)} · ${matching.length} รายการตามตัวกรอง</p>
                </div>
                <button type="button" data-ky-evidence-unit="${escHtml(row.key)}" class="self-start p-2 text-slate-500 hover:text-slate-800" title="ปิดรายการ"><i class="fas fa-times"></i></button>
            </div>
            <div class="divide-y divide-indigo-100 max-h-72 overflow-y-auto">
                ${matching.length ? matching.map(record => {
                    const status = kyEvidenceStatus(record);
                    return `
                        <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
                            <div class="min-w-0">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span class="text-xs font-bold text-slate-700">${formatKyDateTime(record.ActivityDate)}</span>
                                    ${renderKyEvidenceBadge(record, true)}
                                </div>
                                <p class="text-sm font-semibold text-slate-800 mt-1 break-words">${escHtml(record.TeamName || record.KYTKeyword || '-')}</p>
                                <p class="text-xs text-slate-500 mt-0.5 break-words">${escHtml(record.HazardDescription || '-')}</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <button type="button" class="btn-ky-view px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700" data-id="${escHtml(record.id || '')}">View</button>
                                ${status.id === 'waiting_video' && canUploadKyFollowupVideo(record) ? `<button type="button" class="btn-ky-video-followup px-3 py-2 rounded-lg text-xs font-bold text-white" style="background:#7c3aed" data-id="${escHtml(record.id || '')}">เพิ่มวิดีโอ</button>` : ''}
                                ${_isAdmin && status.id === 'missing_file' ? `<button type="button" class="btn-ky-manage px-3 py-2 rounded-lg text-xs font-bold text-white" style="background:#4f46e5" data-id="${escHtml(record.id || '')}">แนบไฟล์</button>` : ''}
                            </div>
                        </div>`;
                }).join('') : `<p class="py-6 text-center text-sm text-slate-500">ไม่มีรายการในสถานะนี้</p>`}
            </div>
        </div>`;
}

function openConfiguredKyEvidencePopup(row, records) {
    const matching = records.filter(record =>
        String(record.Department || '').trim() === row.department
        && (row.isDepartmentScope
            ? String(record.SafetyUnit || '').trim() === ''
            : String(record.SafetyUnit || '').trim() === String(row.safetyUnit || row.unitLabel || '').trim()))
        .filter(record => filterKyEvidenceRecords([record], _kyEvidenceChartFilter).length > 0)
        .sort((a, b) => String(b.ActivityDate || '').localeCompare(String(a.ActivityDate || '')));
    const display = getKyEvidenceDisplay(row);
    const title = display.secondary ? `${display.primary} - ${display.secondary}` : display.primary;
    const body = `
        <div id="ky-evidence-popup" class="space-y-4">
            <div class="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p class="text-sm font-bold text-slate-800 break-words">${escHtml(display.primary)}</p>
                <p class="text-xs text-slate-500 mt-1 break-words">${display.secondary ? `${escHtml(display.secondary)} / ` : ''}${escHtml(display.scopeLabel)} / ${matching.length} item(s)</p>
                <div class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div class="rounded-lg bg-white border border-slate-100 px-2 py-2"><div class="text-lg font-black text-slate-800">${row.submitted || 0}</div><div class="text-[10px] font-bold text-slate-400">Submitted</div></div>
                    <div class="rounded-lg bg-emerald-50 border border-emerald-100 px-2 py-2"><div class="text-lg font-black text-emerald-700">${row.complete || 0}</div><div class="text-[10px] font-bold text-emerald-700">Complete</div></div>
                    <div class="rounded-lg bg-violet-50 border border-violet-100 px-2 py-2"><div class="text-lg font-black text-violet-700">${row.waitingVideo || 0}</div><div class="text-[10px] font-bold text-violet-700">Need video</div></div>
                    <div class="rounded-lg bg-rose-50 border border-rose-100 px-2 py-2"><div class="text-lg font-black text-rose-700">${row.missingFile || 0}</div><div class="text-[10px] font-bold text-rose-700">Missing file</div></div>
                </div>
            </div>
            <div class="divide-y divide-slate-100 max-h-[62vh] overflow-y-auto pr-1">
                ${matching.length ? matching.map(record => {
                    const status = kyEvidenceStatus(record);
                    return `
                        <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
                            <div class="min-w-0">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span class="text-xs font-bold text-slate-700">${formatKyDateTime(record.ActivityDate)}</span>
                                    ${renderKyEvidenceBadge(record, true)}
                                </div>
                                <p class="text-sm font-semibold text-slate-800 mt-1 break-words">${escHtml(record.TeamName || record.KYTKeyword || '-')}</p>
                                <p class="text-xs text-slate-500 mt-0.5 break-words">${escHtml(record.HazardDescription || '-')}</p>
                            </div>
                            <div class="flex flex-wrap md:flex-nowrap items-center gap-2">
                                <button type="button" class="btn-ky-view px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700" data-id="${escHtml(record.id || '')}">View</button>
                                ${status.id === 'waiting_video' && canUploadKyFollowupVideo(record) ? `<button type="button" class="btn-ky-video-followup px-3 py-2 rounded-lg text-xs font-bold text-white" style="background:#7c3aed" data-id="${escHtml(record.id || '')}">เพิ่มวิดีโอ</button>` : ''}
                                ${_isAdmin && status.id === 'missing_file' ? `<button type="button" class="btn-ky-manage px-3 py-2 rounded-lg text-xs font-bold text-white" style="background:#4f46e5" data-id="${escHtml(record.id || '')}">แนบไฟล์</button>` : ''}
                            </div>
                        </div>`;
                }).join('') : `<p class="py-8 text-center text-sm text-slate-500">No KY records match this filter.</p>`}
            </div>
        </div>`;
    openModal(title, body, 'max-w-4xl');
}

function renderKyEvidenceFollowupPanel(records) {
    const el = document.getElementById('ky-evidence-completion-panel');
    if (!el) return;
    if (!Array.isArray(records)) {
        el.innerHTML = `<div class="ds-section p-5" data-ky-card-image="ky-evidence-completion"><div class="h-24 rounded bg-slate-100 animate-pulse"></div></div>`;
        return;
    }
    _kyEvidenceRecords = records;
    const summary = summarizeKyEvidence(records);
    const rows = buildConfiguredKyEvidenceRows(records);
    const belongsToScope = (record, row) => {
        if (String(record.Department || '').trim() !== row.department) return false;
        const recordUnit = String(record.SafetyUnit || '').trim();
        return row.isDepartmentScope ? recordUnit === '' : recordUnit === String(row.safetyUnit || '').trim();
    };
    const rowHasEvidenceState = (row, filter) => records.some(record => {
        if (!belongsToScope(record, row)) return false;
        if (filter === 'production_video') return kyHasProductionVideo(record);
        if (filter === 'external_verified') return !kyHasProductionVideo(record) && kyHasVerifiedExternalVideo(record);
        if (filter === 'external_pending') return !kyHasProductionVideo(record) && !kyHasVerifiedExternalVideo(record) && kyHasPendingExternalVideo(record);
        return true;
    });
    const visibleRows = rows.filter(row => {
        if (_kyEvidenceChartFilter === 'complete') return row.complete > 0;
        if (_kyEvidenceChartFilter === 'waiting_video') return row.waitingVideo > 0;
        if (_kyEvidenceChartFilter === 'missing_file') return row.missingFile > 0;
        if (['production_video', 'external_verified', 'external_pending'].includes(_kyEvidenceChartFilter)) {
            return rowHasEvidenceState(row, _kyEvidenceChartFilter);
        }
        return true;
    });
    if (_kyEvidenceSelectedKey && !rows.some(row => row.key === _kyEvidenceSelectedKey)) _kyEvidenceSelectedKey = '';
    const groupedRows = visibleRows.reduce((groups, row) => {
        const dept = row.department || '-';
        if (!groups.has(dept)) groups.set(dept, []);
        groups.get(dept).push(row);
        return groups;
    }, new Map());
    const groupedHtml = Array.from(groupedRows.entries()).map(([department, deptRows]) => {
        const singleDepartmentScope = deptRows.length === 1 && getKyEvidenceDisplay(deptRows[0]).departmentScope;
        return `
        <div class="py-2.5 border-t border-slate-200 first:border-t-0" data-ky-evidence-department="${escHtml(department)}" data-ky-evidence-single-department-scope="${singleDepartmentScope ? '1' : '0'}">
            ${singleDepartmentScope ? '' : `
            <div class="flex w-full flex-wrap items-center justify-between gap-2 mb-1.5 rounded-md border border-emerald-100 bg-emerald-50/80 px-3 py-2" data-ky-evidence-dept-header>
                <h4 class="text-sm font-black text-emerald-950 break-words">${escHtml(department)}</h4>
                <span class="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-emerald-700">${deptRows.length} scope(s)</span>
            </div>`}
            <div class="w-full divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden bg-slate-50/40">
                ${deptRows.map(row => renderConfiguredKyEvidenceBar(row, false)).join('')}
            </div>
        </div>`;
    }).join('');
    const filterButton = (id, label, activeClass) => `
        <button type="button" data-ky-evidence-chart-filter="${id}"
            class="px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${_kyEvidenceChartFilter === id ? activeClass : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}">${label}</button>`;
    const evidenceMetric = (value, label, tone, filter) => `
        <button type="button" data-ky-evidence-chart-filter="${filter}"
            class="rounded-xl border px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${tone}">
            <div class="text-xl font-black">${escHtml(String(value))}</div>
            <div class="text-[11px] font-bold mt-1">${escHtml(label)}</div>
        </button>`;
    const verifiedVideoTotal = summary.productionVideo + summary.verifiedExternalVideo;
    const verifiedVideoRate = summary.total ? Math.round((verifiedVideoTotal / summary.total) * 100) : 0;
    el.innerHTML = `
        <div class="ds-section p-5" data-ky-card-image="ky-evidence-completion" data-ky-evidence-overview>
            <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-5">
                <div>
                    <p class="text-xs font-bold text-indigo-600 uppercase">Safety Unit Evidence</p>
                    <h3 class="text-base font-bold text-slate-800 mt-1">KY file / video follow-up</h3>
                    <p class="text-sm text-slate-500 mt-1">ข้อมูลจริงตาม Safety Unit ที่เปิดใช้งานใน Program Config ปี ${_statsYear}</p>
                </div>
                <div class="flex flex-wrap gap-2" data-ky-card-ignore>
                    ${filterButton('all', 'ทั้งหมด', 'border-slate-700 bg-slate-800 text-white')}
                    ${filterButton('complete', 'หลักฐานครบ', 'border-emerald-600 bg-emerald-600 text-white')}
                    ${filterButton('production_video', 'Production', 'border-sky-600 bg-sky-600 text-white')}
                    ${filterButton('external_verified', 'External verified', 'border-teal-600 bg-teal-600 text-white')}
                    ${filterButton('external_pending', 'External pending', 'border-amber-500 bg-amber-500 text-white')}
                    ${filterButton('waiting_video', 'รอวิดีโอ', 'border-violet-600 bg-violet-600 text-white')}
                    ${filterButton('missing_file', 'ขาดไฟล์', 'border-rose-600 bg-rose-600 text-white')}
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5" data-ky-video-evidence-summary>
                ${evidenceMetric(summary.productionVideo, 'Production video', 'border-sky-100 bg-sky-50 text-sky-700', 'production_video')}
                ${evidenceMetric(summary.verifiedExternalVideo, 'Verified external video', 'border-teal-100 bg-teal-50 text-teal-700', 'external_verified')}
                ${evidenceMetric(summary.pendingExternalVideo, 'External pending verify', 'border-amber-100 bg-amber-50 text-amber-700', 'external_pending')}
                ${evidenceMetric(`${verifiedVideoTotal}/${summary.total} · ${verifiedVideoRate}%`, 'Verified video evidence', 'border-indigo-100 bg-indigo-50 text-indigo-700', 'all')}
            </div>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-slate-100 py-3 text-[11px] font-bold">
                <span class="inline-flex items-center gap-1.5 text-emerald-700"><span class="h-2.5 w-2.5 rounded-sm bg-emerald-500"></span>หลักฐานครบ</span>
                <span class="inline-flex items-center gap-1.5 text-violet-700"><span class="h-2.5 w-2.5 rounded-sm bg-violet-500"></span>รอวิดีโอ</span>
                <span class="inline-flex items-center gap-1.5 text-rose-700"><span class="h-2.5 w-2.5 rounded-sm bg-rose-500"></span>ขาดไฟล์</span>
                <span class="sm:ml-auto text-slate-400">คลิกแท่งเพื่อดูรายการ</span>
            </div>
            <div data-ky-evidence-bars>
                ${visibleRows.length ? groupedHtml : `
                    <div class="py-10 text-center"><p class="text-sm font-bold text-slate-600">ไม่พบ Safety Unit ตามตัวกรองนี้</p><p class="text-xs text-slate-400 mt-1">แสดงเฉพาะหน่วยที่ Active และตั้งค่าไว้ใน Program Config</p></div>`}
            </div>
        </div>`;
}

function renderHazardPattern(keywords) {
    const el = document.getElementById('ky-hazard-pattern');
    if (!el) return;
    if (!keywords.length) {
        el.innerHTML = `
            <div class="ds-section p-5 h-full" data-ky-card-image="ky-hazard-pattern">
                <h3 class="text-sm font-bold text-slate-700">KYT Keyword ที่พบซ้ำบ่อย</h3>
                <div class="min-h-[240px] flex items-center justify-center text-center">
                    <div>
                        <p class="text-sm font-semibold text-slate-500">ยังไม่มี Keyword สำหรับวิเคราะห์</p>
                        <p class="text-xs text-slate-400 mt-1">เมื่อมีการส่ง KYT Keyword ระบบจะแสดงหัวข้อที่พบซ้ำในส่วนนี้</p>
                    </div>
                </div>
            </div>`;
        return;
    }

    const maxCount = Math.max(...keywords.map(k => k.count || 0), 1);
    const riskColors = ['#ef4444','#f97316','#eab308','#8b5cf6','#0284c7','#10b981','#64748b'];

    el.innerHTML = `
        <div class="ds-section p-5 h-full" data-ky-card-image="ky-hazard-pattern">
            <div class="flex items-center justify-between gap-3 mb-4">
                <div>
                    <h3 class="text-sm font-bold text-slate-700">KYT Keyword ที่พบซ้ำบ่อย</h3>
                    <p class="text-xs text-slate-400 mt-0.5">อันตรายหลักที่ทีมรายงานซ้ำ — ใช้เพื่อวางนโยบายป้องกันเชิงรุก</p>
                </div>
                <span class="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">${keywords.length} themes</span>
            </div>
            <div class="space-y-2.5">
                ${keywords.map((k, i) => {
                    const pct = Math.round((k.count / maxCount) * 100);
                    const color = riskColors[i % riskColors.length];
                    return `
                    <div class="flex items-center gap-3">
                        <span class="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style="background:${color}">${i + 1}</span>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center justify-between gap-2 mb-1">
                                <span class="text-xs font-semibold text-slate-700 truncate">${escHtml(k.keyword)}</span>
                                <span class="text-xs font-bold text-slate-500 flex-shrink-0">${k.count} ครั้ง</span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${color}"></div>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

function renderProgramProgress(progData, usingConfig) {
    const el = document.getElementById('ky-prog-progress');
    if (!el) return;
    if (!usingConfig || !progData.length) { el.innerHTML = ''; return; }

    // Sort: most behind first (lowest pct), then alphabetical
    const sorted = [...progData].sort((a, b) => a.pct - b.pct || a.department.localeCompare(b.department));
    const onTrack  = sorted.filter(d => d.pct >= 80).length;
    const atRisk   = sorted.filter(d => d.pct >= 40 && d.pct < 80).length;
    const critical = sorted.filter(d => d.pct < 40).length;

    const barColor = (pct) => pct >= 80 ? '#059669' : pct >= 40 ? '#d97706' : '#ef4444';
    const bgColor  = (pct) => pct >= 80 ? '#ecfdf5' : pct >= 40 ? '#fffbeb' : '#fef2f2';
    const txtColor = (pct) => pct >= 80 ? '#065f46' : pct >= 40 ? '#92400e' : '#991b1b';

    el.innerHTML = `
        <div class="ds-section p-5" data-ky-card-image="ky-program-progress">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                    <h3 class="text-sm font-bold text-slate-700">ความคืบหน้า KY ตาม Safety Unit</h3>
                    <p class="text-xs text-slate-400 mt-0.5">เป้าหมาย = จำนวน Safety Unit × เป้าต่อ Unit จาก Program Config — เรียงจากจุดที่ตามหลังก่อน</p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>On Track ${onTrack}
                    </span>
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                        <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>At Risk ${atRisk}
                    </span>
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>Critical ${critical}
                    </span>
                </div>
            </div>
            <div class="space-y-3">
                ${sorted.map(d => {
                    const clampedPct = Math.max(0, Math.min(100, d.pct));
                    const remaining  = Math.max(0, d.target - d.submitted);
                    const unitTarget = d.unitTarget || 12;
                    const unitCount = d.unitCount || (d.safetyUnits?.length || 1);
                    const hasMultipleScopes = Array.isArray(d.safetyUnitProgress) && d.safetyUnitProgress.length > 1;
                    const unitRows = Array.isArray(d.safetyUnitProgress) && d.safetyUnitProgress.length
                        ? `<div class="${hasMultipleScopes ? 'mt-2 divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden bg-slate-50/40' : 'mt-2 grid grid-cols-1 gap-2'}">
                            ${d.safetyUnitProgress.map((u, unitIndex) => {
                                const uPct = Math.max(0, Math.min(100, u.pct || 0));
                                return `
                                <div class="${hasMultipleScopes ? `px-3 py-2 transition-colors hover:bg-emerald-50/50 ${unitIndex % 2 ? 'bg-slate-50/70' : 'bg-white'}` : 'rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 transition-colors hover:bg-emerald-50/50'}">
                                    <div class="flex items-center justify-between gap-2 text-[11px]">
                                        <span class="font-extrabold text-slate-700 truncate" title="${escHtml(u.name)}">${escHtml(u.name)}</span>
                                        <span class="font-bold" style="color:${txtColor(uPct)}">${u.submitted || 0}/${u.target || unitTarget}</span>
                                    </div>
                                    <div class="h-1.5 rounded-full bg-white overflow-hidden mt-1.5">
                                        <div class="h-full rounded-full" style="width:${uPct}%;background:${barColor(uPct)}"></div>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>` : '';
                    return `
                    <div class="rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-3">
                        ${hasMultipleScopes ? `
                        <div class="mb-2 flex w-full flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-100 bg-emerald-50/80 px-3 py-2" data-ky-progress-dept-header>
                            <h4 class="text-sm font-black text-emerald-950 break-words">${escHtml(d.department)}</h4>
                            <span class="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-emerald-700">${unitCount} scope(s)</span>
                        </div>` : ''}
                        <div class="flex flex-col lg:flex-row lg:items-center gap-3">
                            <div class="lg:w-56 min-w-0">
                                ${hasMultipleScopes ? '' : `<p class="text-sm font-black text-slate-800 truncate" title="${escHtml(d.department)}">${escHtml(d.department)}</p>`}
                                <p class="text-[10px] text-slate-400 mt-0.5">${unitCount} Safety Unit · ${unitTarget} ครั้ง/Unit/ปี</p>
                            </div>
                            <div class="flex-1 h-5 rounded-full overflow-hidden bg-slate-100 relative">
                                <div class="h-full rounded-full transition-all"
                                     style="width:${clampedPct}%;background:${barColor(d.pct)}"></div>
                                ${d.pct === 0 ? `<span class="absolute inset-0 flex items-center justify-center text-[10px] text-slate-400 font-semibold">ยังไม่ส่ง</span>` : ''}
                            </div>
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <span class="text-xs font-bold text-slate-700 w-16 text-right">${d.submitted}/${d.target}</span>
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full w-14 text-center"
                                      style="background:${bgColor(d.pct)};color:${txtColor(d.pct)}">${clampedPct}%</span>
                                ${remaining > 0 ? `<span class="text-[10px] text-slate-400 hidden sm:block">เหลือ ${remaining}</span>` : `<span class="text-[10px] text-emerald-600 font-bold hidden sm:block">ครบแล้ว</span>`}
                            </div>
                        </div>
                        ${unitRows}
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

function renderDepartmentHeatmap(deptMonthly, byDept) {
    const el = document.getElementById('ky-heatmap-panel');
    if (!el) return;

    const depts = byDept.map(d => d.Department).filter(Boolean);
    const maxCount = Math.max(...deptMonthly.map(r => r.count || 0), 1);
    const countFor = (dept, month) => {
        const row = deptMonthly.find(r => r.Department === dept && Number(r.month) === month);
        return row?.count || 0;
    };
    const colorFor = (count) => {
        if (!count) return '#f1f5f9';
        const level = Math.min(1, count / maxCount);
        if (level > 0.75) return '#065f46';
        if (level > 0.5) return '#10b981';
        if (level > 0.25) return '#6ee7b7';
        return '#d1fae5';
    };

    el.innerHTML = `
        <div class="ds-section p-5" data-ky-card-image="ky-department-heatmap">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                    <h3 class="text-sm font-bold text-slate-700">KY Department Heatmap</h3>
                    <p class="text-xs text-slate-400 mt-0.5">แสดงความถี่กิจกรรมรายเดือนตามแผนก เพื่อดู pattern และแผนกที่ต้องกระตุ้น</p>
                </div>
                <div class="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span>น้อย</span><span class="w-3 h-3 rounded-sm bg-slate-100"></span><span class="w-3 h-3 rounded-sm bg-emerald-100"></span><span class="w-3 h-3 rounded-sm bg-emerald-300"></span><span class="w-3 h-3 rounded-sm bg-emerald-600"></span><span>มาก</span>
                </div>
            </div>
            ${depts.length ? `
            <div class="overflow-x-auto">
                <div class="min-w-[720px]">
                    <div class="grid gap-1" style="grid-template-columns:160px repeat(12,minmax(34px,1fr));">
                        <div></div>
                        ${MONTHS_TH.map(m => `<div class="text-[10px] text-center font-semibold text-slate-400">${m}</div>`).join('')}
                        ${depts.map(dept => `
                            <div class="text-xs font-semibold text-slate-600 truncate pr-2" data-ky-heatmap-department="${escHtml(dept)}">${escHtml(dept)}</div>
                            ${Array.from({ length: 12 }, (_, i) => {
                                const month = i + 1;
                                const count = countFor(dept, month);
                                return `<div class="h-7 rounded-md border border-white flex items-center justify-center text-[10px] font-bold ${count ? 'text-white' : 'text-slate-300'}"
                                             style="background:${colorFor(count)}" title="${escHtml(dept)} ${MONTHS_TH[i]}: ${count}">${count}</div>`;
                            }).join('')}
                        `).join('')}
                    </div>
                </div>
            </div>` : `<div class="text-center py-8 text-sm text-slate-400">ยังไม่มีข้อมูลพอสำหรับ Heatmap</div>`}
        </div>`;
}

function renderCompletionTracker(kpi, pendingDepts) {
    const panel = document.getElementById('ky-monthly-tracker-panel');
    if (!panel) return;

    const totalDepts = kpi.totalDepts || 0;
    const isCurrentStatsYear = _statsYear === new Date().getFullYear();
    const coveredDepts = isCurrentStatsYear
        ? Math.max(0, totalDepts - pendingDepts.length)
        : (kpi.deptSubmitted || 0);
    const rate = totalDepts > 0
        ? Math.round((coveredDepts / totalDepts) * 100)
        : 0;
    const barColor = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';

    panel.innerHTML = `
        <div class="ds-section p-5 h-full" data-ky-card-image="ky-completion-tracker">
            <div class="flex items-start justify-between gap-3 mb-4">
                <div>
                    <p class="text-xs font-bold text-emerald-700 uppercase">Monthly Tracker</p>
                    <h3 class="text-sm font-bold text-slate-700 mt-1">${isCurrentStatsYear ? 'การส่งรายแผนกเดือนนี้' : `Coverage รายแผนกปี ${_statsYear}`}</h3>
                </div>
                <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">${rate}%</span>
            </div>
            <div class="mb-4">
                <div class="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>${coveredDepts} / ${totalDepts} แผนก</span>
                    <span style="color:${barColor}">Coverage</span>
                </div>
                <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full rounded-full transition-all" style="width:${rate}%; background:linear-gradient(90deg,${barColor},${barColor}cc)"></div>
                </div>
            </div>
            ${isCurrentStatsYear && pendingDepts.length ? `
            <div>
                <p class="text-xs font-semibold text-slate-500 mb-2">แผนกที่ยังไม่ส่ง</p>
                <div class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                    ${pendingDepts.map(d => `<span class="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-medium border border-red-100">${escHtml(d)}</span>`).join('')}
                </div>
            </div>` : isCurrentStatsYear ? `<p class="text-sm text-emerald-600 font-semibold flex items-center gap-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>ทุกแผนกส่งแล้วเดือนนี้</p>` : `<p class="text-sm text-slate-500">แสดงความครอบคลุมของปีที่เลือกจากรายการ KY ที่บันทึกไว้</p>`}
        </div>`;
}

const KY_REACTION_COUNT_FIELDS = {
    useful: 'UsefulCount',
    practice: 'PracticeCount',
    awareness: 'AwarenessCount',
    attention: 'AttentionCount',
};

function kyVideoReactionCount(row, reaction) {
    const field = KY_REACTION_COUNT_FIELDS[reaction];
    return Math.max(0, Number(row?.[field] || 0));
}

function kyVideoReactionTotal(row) {
    const explicit = Number(row?.ReactionTotal ?? row?.ReactionCount);
    if (!Number.isNaN(explicit) && explicit > 0) return explicit;
    return KY_VIDEO_REACTIONS.reduce((sum, r) => sum + kyVideoReactionCount(row, r.id), 0);
}

function normalizeKyVideoReactionCounts(row) {
    const next = { ...row };
    KY_VIDEO_REACTIONS.forEach(r => {
        const field = KY_REACTION_COUNT_FIELDS[r.id];
        next[field] = Math.max(0, Number(next[field] || 0));
    });
    const total = kyVideoReactionTotal(next);
    next.ReactionTotal = total;
    next.ReactionCount = total;
    return next;
}

function applyKyVideoReactionState(id, reaction, removed) {
    const updateRows = rows => rows.map(row => {
        if (String(row.id) !== String(id)) return row;
        const next = normalizeKyVideoReactionCounts(row);
        const previous = next.MyReaction || '';
        if (previous && previous !== reaction) {
            const previousField = KY_REACTION_COUNT_FIELDS[previous];
            if (previousField) next[previousField] = Math.max(0, Number(next[previousField] || 0) - 1);
        }
        if (removed) {
            const field = KY_REACTION_COUNT_FIELDS[reaction];
            if (field) next[field] = Math.max(0, Number(next[field] || 0) - 1);
            next.MyReaction = null;
        } else {
            const field = KY_REACTION_COUNT_FIELDS[reaction];
            if (field && previous !== reaction) next[field] = Number(next[field] || 0) + 1;
            next.MyReaction = reaction;
        }
        next.ReactionTotal = KY_VIDEO_REACTIONS.reduce((sum, r) => sum + kyVideoReactionCount(next, r.id), 0);
        next.ReactionCount = next.ReactionTotal;
        return next;
    });
    _kyVideoShowcase = updateRows(_kyVideoShowcase);
    _kyVideoLibrary.items = updateRows(_kyVideoLibrary.items || []);
}

function renderVideoShowcaseFromCache() {
    const el = document.getElementById('ky-video-showcase');
    if (!el || !_kyVideoShowcase.length) return;
    const totalReactions = _kyVideoShowcase.reduce((sum, v) => sum + kyVideoReactionTotal(v), 0);
    const totalBadge = Array.from(el.querySelectorAll('span')).find(span => /reactions$/i.test(span.textContent.trim()));
    if (totalBadge) totalBadge.textContent = `${totalReactions} reactions`;
    const buttons = Array.from(el.querySelectorAll('.ky-video-reaction'));
    _kyVideoShowcase.forEach(row => {
        KY_VIDEO_REACTIONS.forEach(reaction => {
            const btn = buttons.find(candidate =>
                String(candidate.dataset.id) === String(row.id) && candidate.dataset.reaction === reaction.id
            );
            const countEl = btn?.querySelector('.shrink-0');
            if (countEl) countEl.textContent = String(kyVideoReactionCount(row, reaction.id));
            if (btn) {
                const active = row.MyReaction === reaction.id;
                btn.classList.toggle('bg-indigo-50', active);
                btn.classList.toggle('border-indigo-200', active);
                btn.classList.toggle('text-indigo-700', active);
                btn.classList.toggle('bg-slate-50', !active);
                btn.classList.toggle('border-slate-200', !active);
                btn.classList.toggle('text-slate-600', !active);
            }
        });
    });
}

function renderKyVideoCardsFromCache(scope = document) {
    const rows = [...(_kyVideoShowcase || []), ...(_kyVideoLibrary.items || [])];
    const seen = new Set();
    rows.forEach(row => {
        if (!row?.id || seen.has(String(row.id))) return;
        seen.add(String(row.id));
        const cards = Array.from(scope.querySelectorAll?.('[data-ky-video-card-id]') || [])
            .filter(card => String(card.dataset.kyVideoCardId) === String(row.id));
        cards.forEach(card => {
            KY_VIDEO_REACTIONS.forEach(reaction => {
                const btn = card.querySelector(`.ky-video-reaction[data-reaction="${reaction.id}"]`);
                const countEl = btn?.querySelector('.shrink-0');
                if (countEl) countEl.textContent = String(kyVideoReactionCount(row, reaction.id));
                if (btn) {
                    const active = row.MyReaction === reaction.id;
                    btn.classList.toggle('bg-indigo-50', active);
                    btn.classList.toggle('border-indigo-200', active);
                    btn.classList.toggle('text-indigo-700', active);
                    btn.classList.toggle('bg-slate-50', !active);
                    btn.classList.toggle('border-slate-200', !active);
                    btn.classList.toggle('text-slate-600', !active);
                }
            });
        });
    });
}

async function renderVideoShowcase() {
    const el = document.getElementById('ky-video-showcase');
    if (!el) return;

    el.innerHTML = `
        <div class="ds-section p-5" data-ky-card-image="ky-video-showcase">
            <div class="animate-pulse h-40 rounded-xl bg-slate-50"></div>
        </div>`;

    try {
        const res = await API.get(`/ky/video-showcase?year=${_statsYear}&limit=${KY_VIDEO_SHOWCASE_LIMIT}`);
        _kyVideoShowcase = normalizeApiArray(res?.data ?? res).map(normalizeKyVideoReactionCounts);
    } catch (err) {
        console.error('KY video showcase error:', err);
        _kyVideoShowcase = [];
    }

    if (!_kyVideoShowcase.length) {
        el.innerHTML = `
            <div class="ds-section p-5" data-ky-card-image="ky-video-showcase">
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <p class="text-xs font-bold text-indigo-600 uppercase">KYT Video Showcase</p>
                        <h3 class="text-base font-bold text-slate-800 mt-1">คลังวิดีโอ KYT สำหรับแลกเปลี่ยนเรียนรู้</h3>
                        <p class="text-sm text-slate-500 mt-1">เมื่อผู้ใช้ส่งกิจกรรม KY พร้อมวิดีโอ ระบบจะแสดงคลิปเด่นและเปิดให้กด Reaction ในส่วนนี้</p>
                    </div>
                    <span class="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-500">ยังไม่มีวิดีโอ</span>
                </div>
            </div>`;
        return;
    }

    const totalVideos = _kyVideoShowcase.length;
    const totalReactions = _kyVideoShowcase.reduce((sum, v) => sum + kyVideoReactionTotal(v), 0);

    el.innerHTML = `
        <div class="ds-section p-5" data-ky-card-image="ky-video-showcase">
            <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
                <div>
                    <p class="text-xs font-bold text-indigo-600 uppercase">KYT Video Showcase</p>
                    <h3 class="text-base font-bold text-slate-800 mt-1">คลิป KYT ที่ใช้เรียนรู้ร่วมกัน · ปี ${_statsYear}</h3>
                    <p class="text-sm text-slate-500 mt-1">ผู้ใช้สามารถกด Reaction เพื่อสะท้อนว่าเคสใดควรนำไปสื่อสารหรือใช้เป็นตัวอย่างต่อ</p>
                </div>
                <div class="flex flex-wrap gap-2 text-xs">
                    <span class="px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold">${totalVideos} videos</span>
                    <span class="px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 font-bold">${totalReactions} reactions</span>
                    <button type="button" id="ky-video-view-all-btn" class="px-3 py-1.5 rounded-full bg-slate-900 text-white font-bold hover:bg-indigo-700 transition-colors">ดูทั้งหมด</button>
                </div>
            </div>
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
                ${_kyVideoShowcase.map(v => buildKyVideoCard(v)).join('')}
            </div>
        </div>`;
}

function buildKyVideoCard(v) {
    const date = v.ActivityDate ? new Date(v.ActivityDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
    const videoUrl = kyMediaUrl(v.VideoUrl);
    const counts = {
        useful: kyVideoReactionCount(v, 'useful'),
        practice: kyVideoReactionCount(v, 'practice'),
        awareness: kyVideoReactionCount(v, 'awareness'),
        attention: kyVideoReactionCount(v, 'attention'),
    };
    const myReaction = v.MyReaction || '';
    const isPinned = String(v.IsVideoPinned) === '1' || v.IsVideoPinned === true;
    const isHidden = String(v.ShowVideoOnDashboard) === '0' || v.ShowVideoOnDashboard === false;
    return `
        <div class="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm" data-ky-video-card-id="${escHtml(v.id)}">
            <div class="relative bg-slate-900">
                ${buildKyVideoLazyShell(videoUrl, v)}
                ${isPinned ? `<span class="absolute left-3 top-3 px-2.5 py-1 rounded-full bg-white/90 text-indigo-700 text-[10px] font-bold shadow">Pinned</span>` : ''}
                ${isHidden ? `<span class="absolute right-3 top-3 px-2.5 py-1 rounded-full bg-red-50/95 text-red-700 text-[10px] font-bold shadow">Hidden</span>` : ''}
            </div>
            <div class="p-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="text-sm font-bold text-slate-800 truncate">${escHtml(v.TeamName || v.KYTKeyword || 'KYT Video')}</p>
                        <p class="text-xs text-slate-400 mt-0.5">${date} · ${escHtml(v.Department || '-')} ${v.SafetyUnit ? `· ${escHtml(v.SafetyUnit)}` : ''}</p>
                    </div>
                    <span class="px-2 py-1 rounded-full text-[10px] font-bold ${RISK_BADGE_COLOR[v.RiskCategory] || 'bg-slate-100 text-slate-600'}">${escHtml(v.RiskCategory || 'ทั่วไป')}</span>
                </div>
                <p class="text-xs text-slate-500 mt-3 line-clamp-2">${escHtml(v.HazardDescription || v.KYTKeyword || '-')}</p>
                <div class="grid grid-cols-2 gap-2 mt-4">
                    ${KY_VIDEO_REACTIONS.map(r => `
                        <button type="button"
                                class="ky-video-reaction flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border text-xs font-bold transition-colors ${myReaction === r.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50'}"
                                data-id="${escHtml(v.id)}" data-reaction="${r.id}">
                            <span class="flex items-center gap-1.5 min-w-0">
                                <span class="text-base leading-none" aria-hidden="true">${r.emoji}</span>
                                <span class="truncate">${r.label}</span>
                            </span>
                            <span class="shrink-0" style="color:${r.tone}">${counts[r.id] || 0}</span>
                        </button>`).join('')}
                </div>
                <div class="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100">
                    <button type="button" class="btn-ky-view text-xs font-bold text-indigo-600 hover:text-indigo-800" data-id="${escHtml(v.id)}">ดูรายละเอียด</button>
                    ${_isAdmin ? `
                    <div class="flex items-center gap-1">
                        <button type="button" class="ky-video-pin px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500 hover:text-indigo-700 hover:border-indigo-200"
                                data-id="${escHtml(v.id)}" data-pinned="${isPinned ? '0' : '1'}">${isPinned ? 'Unpin' : 'Pin'}</button>
                        <button type="button" class="ky-video-visibility ky-video-hide px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-bold ${isHidden ? 'text-emerald-600 hover:text-emerald-700 hover:border-emerald-200' : 'text-slate-500 hover:text-red-700 hover:border-red-200'}"
                                data-id="${escHtml(v.id)}" data-show="${isHidden ? '1' : '0'}">${isHidden ? 'Show' : 'Hide'}</button>
                    </div>` : ''}
                </div>
            </div>
        </div>`;
}

function buildKyVideoLazyShell(videoUrl, row = {}) {
    if (!videoUrl) {
        return `<div class="w-full h-48 bg-slate-900 flex items-center justify-center text-xs font-bold text-slate-300">Video unavailable</div>`;
    }
    const title = row.TeamName || row.KYTKeyword || 'KYT Video';
    return `
        <div data-ky-video-shell>
            <button type="button" class="ky-video-load group flex h-48 w-full flex-col items-center justify-center gap-3 bg-slate-900 text-white transition-colors hover:bg-slate-800"
                    data-video-url="${escHtml(videoUrl)}" data-video-title="${escHtml(title)}">
                <span class="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-lg font-black group-hover:bg-white/25">▶</span>
                <span class="max-w-[80%] truncate text-xs font-bold">${escHtml(title)}</span>
                <span class="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-200">Click to load video</span>
            </button>
        </div>`;
}

function activateKyVideo(button) {
    const url = button?.dataset?.videoUrl || '';
    const title = button?.dataset?.videoTitle || 'KYT Video';
    const shell = button?.closest?.('[data-ky-video-shell]') || button?.parentElement;
    if (!url || !shell) return;
    shell.innerHTML = `
        <video src="${escHtml(url)}" class="w-full h-48 object-cover bg-black" controls preload="none" playsinline></video>
        <div class="hidden px-3 py-2 text-xs font-bold text-red-700 bg-red-50 border-t border-red-100" data-ky-video-error>
            Video file is unavailable. Please attach the video again.
        </div>`;
    const video = shell.querySelector('video');
    const error = shell.querySelector('[data-ky-video-error]');
    video?.addEventListener('error', () => {
        if (error) error.classList.remove('hidden');
    }, { once: true });
    try {
        video?.load();
        video?.play?.().catch(() => {});
    } catch {
        if (error) error.classList.remove('hidden');
    }
    video?.setAttribute('aria-label', title);
}

function kyVideoLibraryFilterValue(key) {
    return _kyVideoLibrary.filters?.[key] ?? (key === 'year' ? _statsYear : 'all');
}

function buildKyVideoLibraryQuery(overrides = {}) {
    const next = {
        ..._kyVideoLibrary.filters,
        ...overrides,
    };
    next.year = parseInt(next.year) || _statsYear || new Date().getFullYear();
    next.page = Math.max(parseInt(overrides.page ?? _kyVideoLibrary.pagination?.page ?? 1) || 1, 1);
    next.pageSize = Math.min(Math.max(parseInt(overrides.pageSize ?? _kyVideoLibrary.pagination?.pageSize ?? 6) || 6, 1), 50);
    const params = new URLSearchParams();
    ['year', 'page', 'pageSize', 'department', 'safetyUnit', 'riskCategory', 'status', 'pinned', 'show', 'q'].forEach(key => {
        const value = next[key];
        if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });
    return { params, next };
}

async function fetchKyVideoLibrary(overrides = {}) {
    const { params, next } = buildKyVideoLibraryQuery(overrides);
    const res = await API.get(`/ky/videos?${params.toString()}`);
    const payload = normalizeApiObject(res?.data ?? res);
    _kyVideoLibrary = {
        items: normalizeApiArray(payload.items || []).map(normalizeKyVideoReactionCounts),
        pagination: {
            page: Number(payload.pagination?.page || next.page || 1),
            pageSize: Number(payload.pagination?.pageSize || next.pageSize || 6),
            total: Number(payload.pagination?.total || 0),
            pages: Number(payload.pagination?.pages || 0),
        },
        summary: {
            totalVideos: Number(payload.summary?.totalVideos || 0),
            totalReactions: Number(payload.summary?.totalReactions || 0),
            pinnedVideos: Number(payload.summary?.pinnedVideos || 0),
            hiddenVideos: Number(payload.summary?.hiddenVideos || 0),
            departments: normalizeApiArray(payload.summary?.departments || []),
        },
        filters: {
            year: Number(payload.filters?.year || next.year || _statsYear),
            department: payload.filters?.department ?? next.department ?? 'all',
            safetyUnit: payload.filters?.safetyUnit ?? next.safetyUnit ?? 'all',
            riskCategory: payload.filters?.riskCategory ?? next.riskCategory ?? 'all',
            status: payload.filters?.status ?? next.status ?? 'all',
            pinned: payload.filters?.pinned ?? next.pinned ?? 'all',
            show: payload.filters?.show ?? next.show ?? 'all',
            q: payload.filters?.q ?? next.q ?? '',
        },
    };
}

function openKyVideoLibrary(initialFilters = {}) {
    _kyVideoLibrary.filters = {
        year: _statsYear,
        department: 'all',
        safetyUnit: 'all',
        riskCategory: 'all',
        status: 'all',
        pinned: 'all',
        show: 'all',
        q: '',
        ...initialFilters,
    };
    _kyVideoLibrary.pagination = {
        page: Math.max(parseInt(initialFilters.page) || 1, 1),
        pageSize: Math.min(Math.max(parseInt(initialFilters.pageSize) || 6, 1), 50),
        total: 0,
        pages: 0
    };
    openModal(
        'คลังวิดีโอ KYT ทั้งหมด',
        `<div id="ky-video-library-modal" class="space-y-4">
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="flex flex-col lg:flex-row lg:items-end gap-3">
                    <div class="flex-1">
                        <label class="block text-xs font-bold text-slate-500 mb-1">ค้นหา</label>
                        <input id="ky-video-lib-q" type="search" class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="ค้นหาชื่อส่วนงาน / แผนก / Keyword / อันตราย">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">ปี</label>
                        <input id="ky-video-lib-year" type="number" min="2020" max="2100" class="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm" value="${escHtml(_statsYear)}">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">ความเสี่ยง</label>
                        <select id="ky-video-lib-risk" class="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                            <option value="all">ทุกประเภท</option>
                            ${RISK_CATEGORIES.map(r => `<option value="${escHtml(r)}">${escHtml(r)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">สถานะ</label>
                        <select id="ky-video-lib-status" class="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                            <option value="all">ทุกสถานะ</option>
                            ${STATUSES.map(s => `<option value="${escHtml(s)}">${escHtml(STATUS_LABEL[s] || s)}</option>`).join('')}
                        </select>
                    </div>
                    <button type="button" id="ky-video-lib-refresh" class="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">ค้นหา</button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                    <select id="ky-video-lib-dept" class="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                        <option value="all">ทุกแผนก</option>
                    </select>
                    <select id="ky-video-lib-pinned" class="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                        <option value="all">Pinned / ไม่ pinned</option>
                        <option value="1">Pinned เท่านั้น</option>
                        <option value="0">ไม่ pinned</option>
                    </select>
                    <select id="ky-video-lib-show" class="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                        <option value="all">แสดง/ซ่อนทั้งหมด</option>
                        <option value="1">แสดงบน Dashboard</option>
                        <option value="0">ซ่อนจาก Dashboard</option>
                    </select>
                    <select id="ky-video-lib-page-size" class="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                        <option value="6">6 / หน้า</option>
                        <option value="12" selected>12 / หน้า</option>
                        <option value="24">24 / หน้า</option>
                        <option value="50">50 / หน้า</option>
                    </select>
                </div>
            </div>
            <div id="ky-video-library-body"></div>
        </div>`,
        'max-w-7xl'
    );
    renderKyVideoLibrary({ ...initialFilters, page: _kyVideoLibrary.pagination.page });
}

async function renderKyVideoLibrary(overrides = {}) {
    const modal = document.getElementById('ky-video-library-modal');
    const body = document.getElementById('ky-video-library-body');
    if (!modal || !body) return;
    body.innerHTML = `<div class="rounded-2xl border border-slate-200 bg-white p-6"><div class="animate-pulse h-44 bg-slate-50 rounded-xl"></div></div>`;
    try {
        await fetchKyVideoLibrary(overrides);
        syncKyVideoLibraryControls();
        const p = _kyVideoLibrary.pagination;
        const s = _kyVideoLibrary.summary;
        body.innerHTML = `
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                <div class="flex flex-wrap gap-2 text-xs font-bold">
                    <span class="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">${s.totalVideos} videos</span>
                    <span class="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">${s.totalReactions} reactions</span>
                    <span class="px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">${s.pinnedVideos} pinned</span>
                    ${_isAdmin ? `<span class="px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-100">${s.hiddenVideos} hidden</span>` : ''}
                </div>
                <p class="text-xs text-slate-500">หน้า ${p.pages ? p.page : 0} / ${p.pages || 0} · ทั้งหมด ${p.total} รายการ</p>
            </div>
            ${_kyVideoLibrary.items.length ? `
                <div class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
                    ${_kyVideoLibrary.items.map(v => buildKyVideoCard(v)).join('')}
                </div>
                <div class="flex items-center justify-between gap-3 mt-5">
                    <button type="button" class="ky-video-lib-page px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 disabled:opacity-40" data-page="${p.page - 1}" ${p.page <= 1 ? 'disabled' : ''}>ก่อนหน้า</button>
                    <div class="text-xs text-slate-500">แสดง ${_kyVideoLibrary.items.length} จาก ${p.total}</div>
                    <button type="button" class="ky-video-lib-page px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 disabled:opacity-40" data-page="${p.page + 1}" ${p.page >= p.pages ? 'disabled' : ''}>ถัดไป</button>
                </div>` : `
                <div class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                    <p class="text-base font-bold text-slate-700">ไม่พบวิดีโอตามเงื่อนไข</p>
                    <p class="text-sm text-slate-500 mt-1">ลองเปลี่ยนคำค้นหา ปี หรือ filter อีกครั้ง</p>
                </div>`}
        `;
    } catch (err) {
        console.error('KY video library error:', err);
        body.innerHTML = `<div class="rounded-2xl border border-red-100 bg-red-50 p-5 text-red-700 text-sm font-semibold">
            ไม่สามารถโหลดคลังวิดีโอ KY ได้
            <div class="mt-2 text-xs font-normal text-red-600">${escHtml(err?.message || 'Please try again.')}</div>
        </div>`;
    }
}

function syncKyVideoLibraryControls() {
    const f = _kyVideoLibrary.filters || {};
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };
    set('ky-video-lib-q', f.q || '');
    set('ky-video-lib-year', f.year || _statsYear);
    set('ky-video-lib-risk', f.riskCategory || 'all');
    set('ky-video-lib-status', f.status || 'all');
    set('ky-video-lib-pinned', f.pinned ?? 'all');
    set('ky-video-lib-show', f.show ?? 'all');
    set('ky-video-lib-page-size', _kyVideoLibrary.pagination?.pageSize || 6);
    const dept = document.getElementById('ky-video-lib-dept');
    if (dept) {
        const current = f.department || 'all';
        const departments = (_kyVideoLibrary.summary?.departments || []).map(d => d.Department).filter(Boolean);
        const options = ['all', ...new Set([...departments, current].filter(Boolean))];
        dept.innerHTML = options.map(d => `<option value="${escHtml(d)}">${d === 'all' ? 'ทุกแผนก' : escHtml(d)}</option>`).join('');
        dept.value = current;
    }
}

function collectKyVideoLibraryFilters() {
    return {
        year: parseInt(document.getElementById('ky-video-lib-year')?.value) || _statsYear,
        department: document.getElementById('ky-video-lib-dept')?.value || 'all',
        riskCategory: document.getElementById('ky-video-lib-risk')?.value || 'all',
        status: document.getElementById('ky-video-lib-status')?.value || 'all',
        pinned: document.getElementById('ky-video-lib-pinned')?.value ?? 'all',
        show: document.getElementById('ky-video-lib-show')?.value ?? 'all',
        pageSize: parseInt(document.getElementById('ky-video-lib-page-size')?.value) || 6,
        q: document.getElementById('ky-video-lib-q')?.value?.trim() || '',
    };
}

function renderLineChart(monthly) {
    const ctx = document.getElementById('ky-chart-line');
    if (!ctx) return;
    if (_chartLine) { _chartLine.destroy(); _chartLine = null; }
    const counts = Array(12).fill(0);
    monthly.forEach(r => { counts[(r.month || 1) - 1] = r.count || 0; });
    _chartLine = new Chart(ctx, {
        type: 'line',
        data: {
            labels: MONTHS_TH,
            datasets: [{
                label: 'กิจกรรม KY',
                data: counts,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.08)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#6366f1',
                pointRadius: 4,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Kanit' } }, grid: { color: '#f1f5f9' } },
                x: { ticks: { font: { family: 'Kanit', size: 11 } }, grid: { display: false } },
            },
        }
    });
}

function renderDoughnutChart(data) {
    const ctx = document.getElementById('ky-chart-doughnut');
    if (!ctx) return;
    if (_chartDoughnut) { _chartDoughnut.destroy(); _chartDoughnut = null; }
    _chartDoughnut = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.label),
            datasets: [{
                data: data.map(d => d.count),
                backgroundColor: CHART_COLORS,
                borderWidth: 2,
                borderColor: '#fff',
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Kanit', size: 11 }, padding: 8, boxWidth: 12 } }
            },
            cutout: '55%',
        }
    });
}

function renderBarChart(data) {
    const ctx = document.getElementById('ky-chart-bar');
    if (!ctx) return;
    if (_chartBar) { _chartBar.destroy(); _chartBar = null; }
    _chartBar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.Department),
            datasets: [{
                label: 'กิจกรรม KY',
                data: data.map(d => d.count),
                backgroundColor: '#6366f199',
                borderColor: '#6366f1',
                borderWidth: 2,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Kanit' } }, grid: { color: '#f1f5f9' } },
                x: { ticks: { font: { family: 'Kanit', size: 10 }, maxRotation: 40 }, grid: { display: false } },
            },
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: SUBMIT FORM
// ─────────────────────────────────────────────────────────────────────────────
async function renderSubmitForm(container) {
    const user  = TSHSession.getUser() || {};
    const today = new Date().toISOString().split('T')[0];
    const curMonth = new Date().getMonth() + 1;
    const curYear  = new Date().getFullYear();
    _participants = [];
    _submitReporter = null;
    const [, , emailProfileRes] = await Promise.all([
        _fetchDepartments(),
        _fetchProgramConfig(curYear),
        API.get('/ky/email-profile').catch(() => ({ data: null })),
    ]);
    _submitEmailProfile = emailProfileRes?.data || null;
    const defaultDepartment = String(user.department || '').trim();
    const departmentOptions = buildKyDepartmentOptions(defaultDepartment, curYear);

    // Check this month + yearly progress
    let alreadySubmitted = false;
    let yearlyDone = 0;
    let yearlyTarget = 12;
    const initialSafetyUnits = getKySafetyUnitsForDept(defaultDepartment, curYear);
    if (defaultDepartment) {
        try {
            const chk = await API.get(`/ky/check?dept=${encodeURIComponent(defaultDepartment)}&month=${curMonth}&year=${curYear}`);
            alreadySubmitted = initialSafetyUnits.length ? false : (chk?.submittedThisMonth || false);
            yearlyDone   = chk?.yearlyDone   ?? chk?.count ?? 0;
            yearlyTarget = chk?.yearlyTarget ?? chk?.target ?? 12;
        } catch (_) {}
    }

    const yearlyPct   = yearlyTarget > 0 ? Math.min(100, Math.round(yearlyDone / yearlyTarget * 100)) : 0;
    const yearlyColor = yearlyPct >= 100 ? '#10b981' : yearlyPct >= 50 ? '#f59e0b' : '#ef4444';
    const formLocked  = alreadySubmitted && !_isAdmin;

    container.innerHTML = `
        <div class="w-full max-w-none">
            <div class="ds-section overflow-hidden">
                <div class="h-1.5 w-full" style="background:linear-gradient(90deg,#6366f1,#8b5cf6)"></div>
                <div class="p-6 space-y-5">

                    <!-- Yearly progress strip -->
                    <div class="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                         style="background:#f8fafc;border:1px solid #e2e8f0;">
                        <div class="flex-1">
                            <div class="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
                                <span>ความคืบหน้า KY ปี ${curYear}</span>
                                <span id="ky-submit-progress-count" style="color:${yearlyColor}">${yearlyDone} / ${yearlyTarget} ครั้ง</span>
                            </div>
                            <div class="h-2.5 rounded-full bg-slate-200 overflow-hidden">
                                <div id="ky-submit-progress-bar" class="h-full rounded-full transition-all" style="width:${yearlyPct}%;background:${yearlyColor}"></div>
                            </div>
                        </div>
                        <span id="ky-submit-progress-pct" class="text-2xl font-bold flex-shrink-0" style="color:${yearlyColor}">${yearlyPct}%</span>
                    </div>

                    ${alreadySubmitted ? `
                    <div class="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                        <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        <div>
                            <p class="font-semibold">แผนก "${escHtml(user.department || '')}" ได้ส่งกิจกรรม KY สำหรับเดือนนี้แล้ว</p>
                            <p class="text-xs mt-0.5 text-amber-600">ดูรายละเอียดได้ที่แท็บ "ประวัติกิจกรรม"</p>
                        </div>
                    </div>` : `
                    <div class="flex gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700">
                        <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <span>ส่งกิจกรรม KY ประจำเดือน — ${initialSafetyUnits.length ? '1 Safety Unit / 1 เรื่อง / 1 เดือน' : '1 แผนก / 1 เรื่อง / 1 เดือน'} (เป้าหมาย ${yearlyTarget} ครั้ง/ปี)</span>
                    </div>`}

                    <form id="ky-form" class="space-y-6" ${formLocked ? 'style="opacity:0.6; pointer-events:none;"' : ''}>

                        <!-- Reporter info -->
                        ${_isAdmin ? `
                        <div class="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-3">
                            <div>
                                <p class="text-xs font-bold text-indigo-700 uppercase">Admin Submit On Behalf</p>
                                <h3 class="text-sm font-bold text-slate-800 mt-1">ส่งกิจกรรมแทนพนักงาน / Submit for Employee</h3>
                                <p class="text-xs text-slate-500 mt-1">เลือกพนักงานจากมาสเตอร์เพื่อใช้ชื่อและแผนกของคนนั้นเป็นผู้รายงานกิจกรรม KY</p>
                            </div>
                            <div class="relative">
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5" for="ky-reporter-search">ค้นหาพนักงานผู้รายงาน</label>
                                <input type="text" id="ky-reporter-search" class="form-input w-full"
                                       placeholder="ค้นหาชื่อหรือรหัสพนักงาน..." autocomplete="off">
                                <div id="ky-reporter-dropdown"
                                     class="hidden absolute z-40 left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-slate-200 max-h-60 overflow-y-auto"></div>
                                <input type="hidden" name="ReporterEmployeeID" id="ky-reporter-id">
                            </div>
                            <div id="ky-submit-reporter-card" class="rounded-xl border border-white bg-white px-4 py-3 text-sm text-slate-600">
                                ยังไม่ได้เลือกพนักงาน ระบบจะบันทึกด้วยบัญชี Admin ปัจจุบัน
                            </div>
                            <div id="ky-submit-progress-note" class="text-xs text-slate-500"></div>
                        </div>` : `
                        <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                            <div class="lg:col-span-2">
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หัวทีม / ผู้ส่งกิจกรรม</label>
                                <div class="flex items-center gap-2">
                                    <input type="text" class="form-input flex-1 bg-slate-50" value="${escHtml(user.name || '')}" readonly>
                                    <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 flex-shrink-0">หัวทีม</span>
                                </div>
                            </div>
                        </div>`}

                        <div class="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                                <label class="block text-sm font-bold text-slate-800" for="ky-reporter-email">Company Email สำหรับแจ้งสถานะ KY</label>
                                <span id="ky-reporter-email-badge" class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">ตรวจสอบอีเมล</span>
                            </div>
                            <div class="flex flex-col sm:flex-row gap-2">
                                <input type="email" name="ReporterEmail" id="ky-reporter-email" class="form-input w-full"
                                       value="${escHtml(_submitEmailProfile?.CompanyEmail || '')}"
                                       placeholder="name@thaisummit-harness.co.th" autocomplete="email">
                                <button type="button" id="ky-reporter-email-edit"
                                        class="hidden px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-sky-300 hover:text-sky-700">
                                    แก้ไข
                                </button>
                            </div>
                            <p id="ky-reporter-email-note" class="text-xs text-slate-500 mt-1">
                                ${_submitEmailProfile?.CompanyEmail
                                    ? 'ดึงจาก Employee Master แล้ว ระบบจะเก็บอีเมลนี้ไว้กับรายการ KY ณ วันที่ส่ง'
                                    : `ยังไม่พบอีเมลใน Employee Master กรอกอีเมลบริษัทได้หากต้องการรับแจ้งเตือน ต้องลงท้ายด้วย ${KY_COMPANY_EMAIL_DOMAIN}`}
                            </p>
                        </div>

                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5" for="ky-main-dept">Main Department / แผนกหลัก <span class="text-red-500">*</span></label>
                                <select id="ky-main-dept" name="Department" class="form-input w-full" required>
                                    <option value="">-- Select Department --</option>
                                    ${departmentOptions}
                                </select>
                                <p class="text-xs text-slate-400 mt-1">Department controls the Safety Unit list and yearly KY target scope.</p>
                            </div>
                            <div id="ky-dept-scope-note" class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 flex items-center">
                                เลือกแผนกหลักก่อน ระบบจะแสดง Safety Unit ตาม Program Config ของปีที่เลือก
                            </div>
                        </div>

                        <div id="ky-safety-unit-wrap"></div>

                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่กิจกรรม <span class="text-red-500">*</span></label>
                                <input type="date" name="ActivityDate" class="form-input w-full" value="${today}" max="${today}" required>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อทีม <span class="text-red-500">*</span></label>
                                <input type="text" name="TeamName" class="form-input w-full" placeholder="เช่น ทีม A / Line 1" required>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">KYT Keyword <span class="text-red-500">*</span></label>
                                <input type="text" name="KYTKeyword" class="form-input w-full" placeholder="เช่น ลื่นหกล้ม / หนีบมือ" required>
                            </div>
                        </div>

                        <!-- Risk category card-radio -->
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-2">ประเภทความเสี่ยง <span class="text-red-500">*</span></label>
                            <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2" id="ky-risk-cards">
                                ${RISK_CARDS.map((rc, i) => `
                                <label class="relative cursor-pointer" title="${escHtml(rc.desc)}">
                                    <input type="radio" name="RiskCategory" value="${rc.id}" class="peer sr-only" ${i === 0 ? 'checked' : ''}>
                                    <div class="rounded-xl border-2 p-3 text-center transition-all peer-checked:ring-2 peer-checked:ring-offset-1 select-none"
                                         style="background:${rc.bg};border-color:${rc.border};--ring-color:${rc.color}">
                                        <p class="text-xs font-bold mt-0.5" style="color:${rc.color}">${rc.label}</p>
                                        <p class="text-[10px] mt-0.5 leading-tight" style="color:${rc.color}88">${rc.desc.split('/')[0].trim()}</p>
                                    </div>
                                </label>`).join('')}
                            </div>
                            <style>
                                #ky-risk-cards label input:checked + div { box-shadow: 0 0 0 2px white, 0 0 0 4px var(--ring-color, #6366f1); }
                            </style>
                        </div>

                        <!-- Participants (employee typeahead) -->
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้เข้าร่วม <span class="text-red-500">*</span>
                                <span class="text-xs font-normal text-slate-400 ml-1">— ค้นหาพนักงานจากมาสเตอร์หรือพิมพ์ชื่อด้วยตัวเอง</span>
                            </label>
                            <div class="relative mb-2">
                                <div class="flex gap-2">
                                    <div class="relative flex-1">
                                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                                        </svg>
                                        <input type="text" id="ky-emp-search"
                                               class="form-input w-full pl-9 text-sm"
                                               placeholder="ค้นหาชื่อหรือรหัสพนักงาน..." autocomplete="off">
                                        <div id="ky-emp-dropdown"
                                             class="hidden absolute z-30 left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-slate-200 max-h-56 overflow-y-auto"></div>
                                    </div>
                                    <button type="button" id="ky-add-manual-btn"
                                            class="px-3 py-2 rounded-lg text-white text-sm font-semibold transition-all flex-shrink-0"
                                            title="เพิ่มชื่อตามที่พิมพ์โดยไม่ต้องค้นหา"
                                            style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">+ เพิ่ม</button>
                                </div>
                            </div>
                            <div id="ky-participants-tags" class="flex flex-wrap gap-1.5 min-h-[32px]">
                                <span class="text-xs text-slate-400 italic" id="ky-no-participants">ยังไม่มีผู้เข้าร่วม</span>
                            </div>
                            <input type="hidden" name="Participants" id="ky-participants-hidden">
                        </div>

                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดอันตรายที่คาดการณ์ <span class="text-red-500">*</span></label>
                                <textarea name="HazardDescription" rows="6" required
                                          class="form-input w-full resize-none"
                                          placeholder="อธิบายอันตรายที่อาจเกิดขึ้นในงานที่ทำ..."></textarea>
                            </div>

                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">มาตรการตอบโต้ (Countermeasure) <span class="text-red-500">*</span></label>
                                <textarea name="Countermeasure" rows="6"
                                          class="form-input w-full resize-none" required
                                          placeholder="วิธีป้องกันหรือลดความเสี่ยงที่กำหนด..."></textarea>
                            </div>
                        </div>

                        <!-- Forms download card -->
                        <div id="ky-forms-user-card"></div>

                        <!-- Attachment + Video -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ไฟล์แนบ (ภาพ / เอกสาร) <span class="text-red-500">*</span></label>
                                <label class="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
                                    <svg class="w-6 h-6 text-slate-300 group-hover:text-indigo-400 transition-colors mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                    </svg>
                                    <span class="text-xs text-slate-500">ภาพ / PDF / Office ไม่เกิน 20 MB</span>
                                    <input type="file" name="attachment" id="ky-attachment" class="hidden"
                                           accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx">
                                </label>
                                <p id="ky-attachment-name" class="text-xs text-indigo-600 mt-1 truncate"></p>
                                <div id="ky-attachment-preview" class="hidden mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3"></div>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วิดีโอหลักฐาน <span class="text-xs font-normal text-slate-400">(แนบย้อนหลังได้)</span></label>
                                <label class="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all group">
                                    <svg class="w-6 h-6 text-slate-300 group-hover:text-purple-400 transition-colors mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                                    </svg>
                                    <span class="text-xs text-slate-500">${escHtml(kyVideoLimitText())}</span>
                                    <input type="file" name="video" id="ky-video" class="hidden"
                                           accept="${escHtml(kyVideoAcceptValue())}">
                                </label>
                                <p id="ky-video-name" class="text-xs text-purple-600 mt-1 truncate"></p>
                                <div id="ky-video-preview" class="hidden mt-3 rounded-xl border border-purple-100 bg-purple-50/50 p-3"></div>
                                <label class="mt-3 flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 cursor-pointer">
                                    <input type="checkbox" id="ky-video-central-machine" class="mt-0.5 rounded text-teal-600">
                                    <span><strong class="block text-xs text-teal-800">เก็บวิดีโอไว้ที่เครื่องกลาง</strong><span class="block text-[10px] text-teal-700 mt-0.5">เลือกไฟล์เพื่อบันทึก Metadata และ SHA-256 เท่านั้น ระบบจะไม่อัปโหลดไฟล์นี้ขึ้น Production</span></span>
                                </label>
                                <div id="ky-video-central-reference-wrap" class="hidden mt-2">
                                    <label class="block text-xs font-bold text-slate-700 mb-1">พาธ / เลขอ้างอิงในเครื่องกลาง <span class="text-red-500">*</span></label>
                                    <input type="text" id="ky-video-central-reference" class="form-input w-full text-xs" maxlength="500" placeholder="เช่น \\\\FILE-SERVER\\KYT\\2026\\MAINTENANCE\\video.mp4">
                                </div>
                            </div>
                        </div>

                        <div id="ky-submit-summary" class="rounded-xl border border-slate-200 bg-slate-50 p-4"></div>
                        <div id="ky-submit-readiness" class="rounded-xl border border-slate-200 bg-white p-4"></div>

                        <div class="flex justify-end pt-2">
                            <button type="submit" id="ky-submit-btn"
                                    class="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
                                    style="background:linear-gradient(135deg,#6366f1,#8b5cf6); box-shadow:0 2px 8px rgba(99,102,241,0.35)"
                                    onmouseover="this.style.transform='translateY(-1px)'"
                                    onmouseout="this.style.transform=''">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                                </svg>
                                ส่งกิจกรรม KY
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

    setupFormListeners();
    renderKySafetyUnitSelect(document.getElementById('ky-main-dept')?.value || defaultDepartment);

    // Load and inject active forms card
    _loadKyForms(false).then(forms => {
        const cardEl = document.getElementById('ky-forms-user-card');
        if (cardEl) cardEl.innerHTML = _renderKyFormsUserCard(forms);
    });
}

function setupFormListeners() {
    updateKyReporterEmailStatus(_submitEmailProfile?.CompanyEmail || '', 'current');
    renderKySubmitSummary();
    document.getElementById('ky-reporter-email-edit')?.addEventListener('click', unlockKyReporterEmail);
    document.getElementById('ky-form')?.addEventListener('input', renderKySubmitSummary);
    document.getElementById('ky-form')?.addEventListener('change', renderKySubmitSummary);

    // Attachment preview
    document.getElementById('ky-attachment')?.addEventListener('change', (e) => {
        renderKyFilePreview(e.target, 'ky-attachment-name', 'ky-attachment-preview', 'attachment');
    });
    document.getElementById('ky-video')?.addEventListener('change', (e) => {
        renderKyFilePreview(e.target, 'ky-video-name', 'ky-video-preview', 'video');
    });
    document.getElementById('ky-video-central-machine')?.addEventListener('change', (e) => {
        document.getElementById('ky-video-central-reference-wrap')?.classList.toggle('hidden', !e.target.checked);
        const reference = document.getElementById('ky-video-central-reference');
        if (reference) reference.required = Boolean(e.target.checked);
        renderKySubmitSummary();
    });

    document.getElementById('ky-attachment-preview')?.addEventListener('click', (e) => {
        if (!e.target.closest('[data-clear-ky-file]')) return;
        clearKyFile('ky-attachment', 'ky-attachment-name', 'ky-attachment-preview');
    });
    document.getElementById('ky-video-preview')?.addEventListener('click', (e) => {
        if (!e.target.closest('[data-clear-ky-file]')) return;
        clearKyFile('ky-video', 'ky-video-name', 'ky-video-preview');
    });

    setupKyReporterSearch();

    document.getElementById('ky-main-dept')?.addEventListener('change', () => {
        const dept = document.getElementById('ky-main-dept')?.value || '';
        renderKySafetyUnitSelect(dept);
        if (dept) refreshKySubmitProgress(dept);
        renderKySubmitSummary();
    });

    document.getElementById('ky-safety-unit-select')?.addEventListener('change', () => {
        const dept = document.getElementById('ky-main-dept')?.value || _submitReporter?.Department || (TSHSession.getUser() || {}).department || '';
        refreshKySubmitProgress(dept);
        renderKySubmitSummary();
    });

    // Employee typeahead search
    const empSearch = document.getElementById('ky-emp-search');
    const empDrop   = document.getElementById('ky-emp-dropdown');

    if (empSearch && empDrop) {
        empSearch.addEventListener('input', () => {
            clearTimeout(_empSearchTimer);
            const q = empSearch.value.trim();
            if (!q) { empDrop.classList.add('hidden'); return; }
            _empSearchTimer = setTimeout(async () => {
                try {
                    const res = await API.get(`/ky/employees?q=${encodeURIComponent(q)}`);
                    _empSearchResults = normalizeApiArray(res?.data ?? res);
                    if (!_empSearchResults.length) {
                        empDrop.innerHTML = `<div class="px-4 py-3 text-xs text-slate-400">ไม่พบพนักงาน — ใช้ปุ่ม "+ เพิ่ม" เพื่อเพิ่มชื่อตามที่พิมพ์</div>`;
                    } else {
                        empDrop.innerHTML = _empSearchResults.map((emp, i) => `
                            <button type="button" data-emp-idx="${i}"
                                    class="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
                                <span class="font-semibold text-slate-700">${escHtml(emp.EmployeeName || '')}</span>
                                <span class="text-xs text-slate-400 ml-2">${escHtml(emp.EmployeeID || '')}</span>
                                <span class="text-xs text-slate-400 ml-1">· ${escHtml(emp.Department || '')}</span>
                            </button>`).join('');
                    }
                    empDrop.classList.remove('hidden');
                } catch { empDrop.classList.add('hidden'); }
            }, 300);
        });

        empDrop.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-emp-idx]');
            if (!btn) return;
            const emp = _empSearchResults[parseInt(btn.dataset.empIdx)];
            if (!emp) return;
            _addParticipant(emp.EmployeeName, emp.EmployeeID);
            empSearch.value = '';
            empDrop.classList.add('hidden');
        });

        empSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { empDrop.classList.add('hidden'); empSearch.value = ''; }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#ky-emp-search') && !e.target.closest('#ky-emp-dropdown')) {
                empDrop?.classList.add('hidden');
            }
        }, { capture: true });
    }

    // Add participant manually (from typed text)
    document.getElementById('ky-add-manual-btn')?.addEventListener('click', () => {
        const input = document.getElementById('ky-emp-search');
        const name  = (input?.value || '').trim();
        if (!name) return;
        _addParticipant(name, null);
        input.value = '';
        document.getElementById('ky-emp-dropdown')?.classList.add('hidden');
    });

    // Form submit
    document.getElementById('ky-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
        e.preventDefault();
        const readiness = updateKySubmitReadiness();
        if (!readiness.ready) {
            showToast(`กรอกข้อมูลยังไม่ครบ: ${readiness.missing.join(', ')}`, 'warning');
            return;
        }
        const btn = document.getElementById('ky-submit-btn');
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> กำลังส่ง...`;

        try {
            showLoading('กำลังส่งกิจกรรม KY...');
            const fd = new FormData(e.target);
            const videoFile = document.getElementById('ky-video')?.files?.[0] || null;
            const centralMachine = Boolean(document.getElementById('ky-video-central-machine')?.checked);
            const centralReference = String(document.getElementById('ky-video-central-reference')?.value || '').trim();
            if (centralMachine && (!videoFile || !centralReference)) {
                showToast('โหมดเครื่องกลางต้องเลือกไฟล์วิดีโอและระบุพาธ/เลขอ้างอิง', 'warning');
                return;
            }
            fd.delete('video');
            const reporterEmail = String(fd.get('ReporterEmail') || '').trim().toLowerCase();
            if (reporterEmail && !/^[^\s@]+@thaisummit-harness\.co\.th$/i.test(reporterEmail)) {
                showToast(`Company Email ต้องลงท้ายด้วย ${KY_COMPANY_EMAIL_DOMAIN}`, 'warning');
                return;
            }
            fd.set('ReporterEmail', reporterEmail);
            const dept = String(fd.get('Department') || document.getElementById('ky-main-dept')?.value || _submitReporter?.Department || (TSHSession.getUser() || {}).department || '').trim();
            if (!dept) {
                showToast('กรุณาเลือกแผนกหลักก่อนส่งกิจกรรม KY', 'warning');
                return;
            }
            const units = getKySafetyUnitsForDept(dept, new Date(fd.get('ActivityDate') || new Date()).getFullYear());
            const selectedUnit = String(fd.get('SafetyUnit') || '').trim();
            if (units.length && !selectedUnit) {
                showToast('กรุณาเลือก Safety Unit ก่อนส่งกิจกรรม KY', 'warning');
                return;
            }
            fd.set('Department', dept);
            fd.set('Participants', JSON.stringify(_participants.map(p => p.name)));
            const created = await API.post('/ky', fd);
            const activityId = created?.id || created?.data?.id;
            let videoUploadFailed = false;
            let annualEvidenceFailed = false;
            if (videoFile && centralMachine) {
                try {
                    btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> กำลังคำนวณ SHA-256...`;
                    const sha256 = await sha256Blob(videoFile);
                    await API.post('/ky/annual-video-evidence/declare', {
                        activityId,
                        storageMode: 'CentralMachine',
                        externalBackupConfirmed: true,
                        externalReference: centralReference,
                        originalFileName: videoFile.name,
                        mimeType: videoFile.type || '',
                        fileSize: videoFile.size,
                        sha256,
                    });
                } catch (videoError) {
                    annualEvidenceFailed = true;
                    console.error('KY central-machine video declaration failed:', videoError);
                }
            } else if (videoFile) {
                try {
                    await uploadKyVideoInChunks(activityId, videoFile, (completed, total, done, meta) => setKyVideoUploadProgress(btn, completed, total, done, meta));
                    try {
                        await API.post('/ky/annual-video-evidence/declare', { activityId, storageMode: 'Production' });
                    } catch (evidenceError) {
                        annualEvidenceFailed = true;
                        console.error('KY annual Production evidence registration skipped:', evidenceError);
                    }
                } catch (videoError) {
                    videoUploadFailed = true;
                    console.error('KY video upload after submit failed:', videoError);
                }
            }
            showToast(
                videoUploadFailed
                    ? 'บันทึกกิจกรรม KY แล้ว แต่วิดีโออัปโหลดไม่สำเร็จ กรุณาแนบย้อนหลังจากประวัติ'
                    : annualEvidenceFailed
                        ? 'บันทึกกิจกรรมและวิดีโอแล้ว แต่ Annual Evidence ของหน่วยงานมีรายการอยู่แล้ว Admin สามารถจัดการจากหน้า Annual Video Evidence'
                        : 'ส่งกิจกรรม KY สำเร็จ',
                videoUploadFailed || annualEvidenceFailed ? 'warning' : 'success'
            );
            _participants = [];
            e.target.reset();
            updateKyReporterEmailStatus(_submitEmailProfile?.CompanyEmail || '', 'current');
            document.getElementById('ky-attachment-name').textContent = '';
            document.getElementById('ky-video-name').textContent = '';
            clearKyFile('ky-attachment', 'ky-attachment-name', 'ky-attachment-preview');
            clearKyFile('ky-video', 'ky-video-name', 'ky-video-preview');
            const centralToggle = document.getElementById('ky-video-central-machine');
            if (centralToggle) centralToggle.checked = false;
            const centralRef = document.getElementById('ky-video-central-reference');
            if (centralRef) centralRef.value = '';
            document.getElementById('ky-video-central-reference-wrap')?.classList.add('hidden');
            _submitReporter = null;
            renderKySubmitReporter();
            renderKySubmitSummary();
            updateParticipantTags();
            await _loadHeroStats();
        } catch (err) {
            showError(err);
        } finally {
            hideLoading();
            btn.disabled = false;
            btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> ส่งกิจกรรม KY`;
        }
    }));
}

// The upstream merge left these submit helpers inside a private wrapper,
// which made them unavailable to setupFormListeners(). Keep the merged block
// scoped, but expose the four helpers used by the active KY submit flow.
const {
    setupKyReporterSearch,
    renderKySafetyUnitSelect,
    renderKySubmitReporter,
    refreshKySubmitProgress,
} = (() => {
function setupKyReporterSearch() {
    const reporterSearch = document.getElementById('ky-reporter-search');
    const reporterDrop   = document.getElementById('ky-reporter-dropdown');
    if (!reporterSearch || !reporterDrop) return;

    reporterSearch.addEventListener('input', () => {
        clearTimeout(_reporterSearchTimer);
        const q = reporterSearch.value.trim();
        if (!q) {
            reporterDrop.classList.add('hidden');
            return;
        }

        _reporterSearchTimer = setTimeout(async () => {
            try {
                const res = await API.get(`/ky/employees?q=${encodeURIComponent(q)}`);
                _reporterSearchResults = normalizeApiArray(res?.data ?? res);
                reporterDrop.innerHTML = _reporterSearchResults.length
                    ? _reporterSearchResults.map((emp, i) => `
                        <button type="button" data-reporter-idx="${i}"
                                class="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
                            <span class="font-semibold text-slate-700">${escHtml(emp.EmployeeName || '')}</span>
                            <span class="text-xs text-slate-400 ml-2">${escHtml(emp.EmployeeID || '')}</span>
                            <span class="text-xs text-slate-400 ml-1">· ${escHtml(emp.Department || '-')}</span>
                        </button>`).join('')
                    : `<div class="px-4 py-3 text-xs text-slate-400">ไม่พบพนักงานจากมาสเตอร์</div>`;
                reporterDrop.classList.remove('hidden');
            } catch {
                reporterDrop.classList.add('hidden');
            }
        }, 300);
    });

    reporterDrop.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-reporter-idx]');
        if (!btn) return;
        const reporter = _reporterSearchResults[parseInt(btn.dataset.reporterIdx)];
        if (!reporter) return;
        _submitReporter = reporter;
        reporterSearch.value = `${reporter.EmployeeName || ''} (${reporter.EmployeeID || ''})`;
        reporterDrop.classList.add('hidden');
        renderKySubmitReporter();
    });

    reporterSearch.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        reporterDrop.classList.add('hidden');
    });

    document.getElementById('ky-form')?.querySelector('[name="ActivityDate"]')?.addEventListener('change', async () => {
        const activityDate = document.getElementById('ky-form')?.querySelector('[name="ActivityDate"]')?.value;
        const year = activityDate ? new Date(activityDate).getFullYear() : new Date().getFullYear();
        await _fetchProgramConfig(year);
        const deptSelect = document.getElementById('ky-main-dept');
        const previousDept = deptSelect?.value || _submitReporter?.Department || (TSHSession.getUser() || {}).department || '';
        if (deptSelect) {
            deptSelect.innerHTML = `<option value="">-- Select Department --</option>${buildKyDepartmentOptions(previousDept, year)}`;
            deptSelect.value = previousDept;
        }
        const dept = deptSelect?.value || previousDept;
        renderKySafetyUnitSelect(dept);
        if (dept) refreshKySubmitProgress(dept);
    });
}

function renderKySafetyUnitSelect(department) {
    const wrap = document.getElementById('ky-safety-unit-wrap');
    if (!wrap) return;
    const activityDate = document.getElementById('ky-form')?.querySelector('[name="ActivityDate"]')?.value;
    const year = activityDate ? new Date(activityDate).getFullYear() : new Date().getFullYear();
    const units = getKySafetyUnitsForDept(department, year);

    if (!department) {
        wrap.innerHTML = `
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                เลือกพนักงานผู้รายงานก่อน ระบบจะแสดง Safety Unit ตาม Program Config ของแผนกนั้น
            </div>`;
        return;
    }

    if (!units.length) {
        wrap.innerHTML = `
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                แผนก ${escHtml(department)} ยังไม่ได้ผูก Safety Unit ใน Program Config — ระบบจะนับเป้าหมายระดับแผนก
            </div>`;
        return;
    }

    wrap.innerHTML = `
        <div class="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                    <label class="block text-sm font-bold text-slate-800 mb-1" for="ky-safety-unit-select">Safety Unit <span class="text-red-500">*</span></label>
                    <p class="text-xs text-slate-500">เลือกหน่วยงานย่อยที่ทำกิจกรรม KY — 1 Safety Unit ต้องทำตามเป้าหมายรายปีที่ Admin ตั้งไว้</p>
                </div>
                <span class="px-3 py-1.5 rounded-full bg-white border border-indigo-100 text-xs font-bold text-indigo-700">${units.length} Safety Units</span>
            </div>
            <select id="ky-safety-unit-select" name="SafetyUnit" class="form-input w-full mt-3" required>
                <option value="">— เลือก Safety Unit —</option>
                ${units.map(unit => `<option value="${escHtml(unit)}">${escHtml(unit)}</option>`).join('')}
            </select>
        </div>`;

    document.getElementById('ky-safety-unit-select')?.addEventListener('change', () => {
        refreshKySubmitProgress(department);
        renderKySubmitSummary();
    });
    renderKySubmitSummary();
}

function renderKySubmitReporter() {
    const idInput = document.getElementById('ky-reporter-id');
    const card = document.getElementById('ky-submit-reporter-card');
    const search = document.getElementById('ky-reporter-search');
    if (!idInput || !card) return;

    if (!_submitReporter) {
        idInput.value = '';
        if (search) search.value = '';
        card.innerHTML = 'ยังไม่ได้เลือกพนักงาน ระบบจะบันทึกด้วยบัญชี Admin ปัจจุบัน';
        const note = document.getElementById('ky-submit-progress-note');
        if (note) note.textContent = '';
        const currentUser = TSHSession.getUser() || {};
        const deptSelect = document.getElementById('ky-main-dept');
        const dept = deptSelect?.value || currentUser.department || '';
        if (deptSelect && !deptSelect.value && currentUser.department) deptSelect.value = currentUser.department;
        updateKyReporterEmailStatus(_submitEmailProfile?.CompanyEmail || '', 'current');
        renderKySafetyUnitSelect(dept);
        if (dept) refreshKySubmitProgress(dept);
        renderKySubmitSummary();
        return;
    }

    idInput.value = _submitReporter.EmployeeID || '';
    updateKyReporterEmailStatus(_submitReporter.CompanyEmail || '', 'selected');
    card.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
                <p class="font-bold text-slate-800">${escHtml(_submitReporter.EmployeeName || '-')}</p>
                <p class="text-xs text-slate-500">${escHtml(_submitReporter.EmployeeID || '-')} · ${escHtml(_submitReporter.Department || '-')} ${_submitReporter.Position ? `· ${escHtml(_submitReporter.Position)}` : ''}</p>
            </div>
            <button type="button" id="ky-clear-reporter"
                    class="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-red-200 hover:text-red-600">
                ล้างการเลือก
            </button>
        </div>`;
    document.getElementById('ky-clear-reporter')?.addEventListener('click', () => {
        _submitReporter = null;
        renderKySubmitReporter();
    });
    const deptSelect = document.getElementById('ky-main-dept');
    const reporterDept = _submitReporter.Department || '';
    if (deptSelect && reporterDept) deptSelect.value = reporterDept;
    const dept = deptSelect?.value || reporterDept;
    renderKySafetyUnitSelect(dept);
    if (dept) refreshKySubmitProgress(dept);
    renderKySubmitSummary();
}

async function refreshKySubmitProgress(department) {
    const activityDate = document.getElementById('ky-form')?.querySelector('[name="ActivityDate"]')?.value;
    const year = activityDate ? new Date(activityDate).getFullYear() : new Date().getFullYear();
    if (!department || !year) return;
    const selectedUnit = document.getElementById('ky-safety-unit-select')?.value || '';

    try {
        const unitParam = selectedUnit ? `&safetyUnit=${encodeURIComponent(selectedUnit)}` : '';
        const chk = await API.get(`/ky/check?dept=${encodeURIComponent(department)}&year=${year}${unitParam}`);
        const done = chk?.yearlyDone ?? chk?.count ?? 0;
        const target = chk?.yearlyTarget ?? chk?.target ?? 12;
        const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
        const color = pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
        const countEl = document.getElementById('ky-submit-progress-count');
        const barEl = document.getElementById('ky-submit-progress-bar');
        const pctEl = document.getElementById('ky-submit-progress-pct');
        const noteEl = document.getElementById('ky-submit-progress-note');
        if (countEl) {
            countEl.textContent = `${done} / ${target} ครั้ง`;
            countEl.style.color = color;
        }
        if (barEl) {
            barEl.style.width = `${pct}%`;
            barEl.style.background = color;
        }
        if (pctEl) {
            pctEl.textContent = `${pct}%`;
            pctEl.style.color = color;
        }
        if (noteEl) {
            const scope = selectedUnit ? `Safety Unit ${selectedUnit}` : `แผนก ${department}`;
            noteEl.textContent = chk?.submittedThisMonth
                ? `${scope} มีรายการ KY ของเดือนปัจจุบันแล้ว ระบบจะตรวจซ้ำตามวันที่กิจกรรมอีกครั้งตอนบันทึก`
                : `ความคืบหน้าปี ${year} ของ${scope}`;
            noteEl.className = `text-xs ${chk?.submittedThisMonth ? 'text-amber-700' : 'text-slate-500'}`;
        }
    } catch (_) {}
}

function setupKyReporterSearch() {
    const reporterSearch = document.getElementById('ky-reporter-search');
    const reporterDrop   = document.getElementById('ky-reporter-dropdown');
    if (!reporterSearch || !reporterDrop) return;

    reporterSearch.addEventListener('input', () => {
        clearTimeout(_reporterSearchTimer);
        const q = reporterSearch.value.trim();
        if (!q) {
            reporterDrop.classList.add('hidden');
            return;
        }

        _reporterSearchTimer = setTimeout(async () => {
            try {
                const res = await API.get(`/ky/employees?q=${encodeURIComponent(q)}`);
                _reporterSearchResults = normalizeApiArray(res?.data ?? res);
                reporterDrop.innerHTML = _reporterSearchResults.length
                    ? _reporterSearchResults.map((emp, i) => `
                        <button type="button" data-reporter-idx="${i}"
                                class="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
                            <span class="font-semibold text-slate-700">${escHtml(emp.EmployeeName || '')}</span>
                            <span class="text-xs text-slate-400 ml-2">${escHtml(emp.EmployeeID || '')}</span>
                            <span class="text-xs text-slate-400 ml-1">· ${escHtml(emp.Department || '-')}</span>
                        </button>`).join('')
                    : `<div class="px-4 py-3 text-xs text-slate-400">ไม่พบพนักงานจากมาสเตอร์</div>`;
                reporterDrop.classList.remove('hidden');
            } catch {
                reporterDrop.classList.add('hidden');
            }
        }, 300);
    });

    reporterDrop.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-reporter-idx]');
        if (!btn) return;
        const reporter = _reporterSearchResults[parseInt(btn.dataset.reporterIdx)];
        if (!reporter) return;
        _submitReporter = reporter;
        reporterSearch.value = `${reporter.EmployeeName || ''} (${reporter.EmployeeID || ''})`;
        reporterDrop.classList.add('hidden');
        renderKySubmitReporter();
    });

    reporterSearch.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        reporterDrop.classList.add('hidden');
    });

    document.getElementById('ky-form')?.querySelector('[name="ActivityDate"]')?.addEventListener('change', async () => {
        const activityDate = document.getElementById('ky-form')?.querySelector('[name="ActivityDate"]')?.value;
        const year = activityDate ? new Date(activityDate).getFullYear() : new Date().getFullYear();
        await _fetchProgramConfig(year);
        const deptSelect = document.getElementById('ky-main-dept');
        const previousDept = deptSelect?.value || _submitReporter?.Department || (TSHSession.getUser() || {}).department || '';
        if (deptSelect) {
            deptSelect.innerHTML = `<option value="">-- Select Department --</option>${buildKyDepartmentOptions(previousDept, year)}`;
            deptSelect.value = previousDept;
        }
        const dept = deptSelect?.value || previousDept;
        renderKySafetyUnitSelect(dept);
        if (dept) refreshKySubmitProgress(dept);
    });
}

function renderKySafetyUnitSelect(department) {
    const wrap = document.getElementById('ky-safety-unit-wrap');
    if (!wrap) return;
    const activityDate = document.getElementById('ky-form')?.querySelector('[name="ActivityDate"]')?.value;
    const year = activityDate ? new Date(activityDate).getFullYear() : new Date().getFullYear();
    const units = getKySafetyUnitsForDept(department, year);

    if (!department) {
        wrap.innerHTML = `
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                เลือกพนักงานผู้รายงานก่อน ระบบจะแสดง Safety Unit ตาม Program Config ของแผนกนั้น
            </div>`;
        return;
    }

    if (!units.length) {
        wrap.innerHTML = `
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                แผนก ${escHtml(department)} ยังไม่ได้ผูก Safety Unit ใน Program Config — ระบบจะนับเป้าหมายระดับแผนก
            </div>`;
        return;
    }

    wrap.innerHTML = `
        <div class="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                    <label class="block text-sm font-bold text-slate-800 mb-1" for="ky-safety-unit-select">Safety Unit <span class="text-red-500">*</span></label>
                    <p class="text-xs text-slate-500">เลือกหน่วยงานย่อยที่ทำกิจกรรม KY — 1 Safety Unit ต้องทำตามเป้าหมายรายปีที่ Admin ตั้งไว้</p>
                </div>
                <span class="px-3 py-1.5 rounded-full bg-white border border-indigo-100 text-xs font-bold text-indigo-700">${units.length} Safety Units</span>
            </div>
            <select id="ky-safety-unit-select" name="SafetyUnit" class="form-input w-full mt-3" required>
                <option value="">— เลือก Safety Unit —</option>
                ${units.map(unit => `<option value="${escHtml(unit)}">${escHtml(unit)}</option>`).join('')}
            </select>
        </div>`;

    document.getElementById('ky-safety-unit-select')?.addEventListener('change', () => {
        refreshKySubmitProgress(department);
        renderKySubmitSummary();
    });
    renderKySubmitSummary();
}

function renderKySubmitReporter() {
    const idInput = document.getElementById('ky-reporter-id');
    const card = document.getElementById('ky-submit-reporter-card');
    const search = document.getElementById('ky-reporter-search');
    if (!idInput || !card) return;

    if (!_submitReporter) {
        idInput.value = '';
        if (search) search.value = '';
        card.innerHTML = 'ยังไม่ได้เลือกพนักงาน ระบบจะบันทึกด้วยบัญชี Admin ปัจจุบัน';
        const note = document.getElementById('ky-submit-progress-note');
        if (note) note.textContent = '';
        const currentUser = TSHSession.getUser() || {};
        const deptSelect = document.getElementById('ky-main-dept');
        const dept = deptSelect?.value || currentUser.department || '';
        if (deptSelect && !deptSelect.value && currentUser.department) deptSelect.value = currentUser.department;
        updateKyReporterEmailStatus(_submitEmailProfile?.CompanyEmail || '', 'current');
        renderKySafetyUnitSelect(dept);
        if (dept) refreshKySubmitProgress(dept);
        renderKySubmitSummary();
        return;
    }

    idInput.value = _submitReporter.EmployeeID || '';
    updateKyReporterEmailStatus(_submitReporter.CompanyEmail || '', 'selected');
    card.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
                <p class="font-bold text-slate-800">${escHtml(_submitReporter.EmployeeName || '-')}</p>
                <p class="text-xs text-slate-500">${escHtml(_submitReporter.EmployeeID || '-')} · ${escHtml(_submitReporter.Department || '-')} ${_submitReporter.Position ? `· ${escHtml(_submitReporter.Position)}` : ''}</p>
            </div>
            <button type="button" id="ky-clear-reporter"
                    class="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-red-200 hover:text-red-600">
                ล้างการเลือก
            </button>
        </div>`;
    document.getElementById('ky-clear-reporter')?.addEventListener('click', () => {
        _submitReporter = null;
        renderKySubmitReporter();
    });
    const deptSelect = document.getElementById('ky-main-dept');
    const reporterDept = _submitReporter.Department || '';
    if (deptSelect && reporterDept) deptSelect.value = reporterDept;
    const dept = deptSelect?.value || reporterDept;
    renderKySafetyUnitSelect(dept);
    if (dept) refreshKySubmitProgress(dept);
    renderKySubmitSummary();
}

async function refreshKySubmitProgress(department) {
    const activityDate = document.getElementById('ky-form')?.querySelector('[name="ActivityDate"]')?.value;
    const year = activityDate ? new Date(activityDate).getFullYear() : new Date().getFullYear();
    if (!department || !year) return;
    const selectedUnit = document.getElementById('ky-safety-unit-select')?.value || '';

    try {
        const unitParam = selectedUnit ? `&safetyUnit=${encodeURIComponent(selectedUnit)}` : '';
        const chk = await API.get(`/ky/check?dept=${encodeURIComponent(department)}&year=${year}${unitParam}`);
        const done = chk?.yearlyDone ?? chk?.count ?? 0;
        const target = chk?.yearlyTarget ?? chk?.target ?? 12;
        const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
        const color = pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
        const countEl = document.getElementById('ky-submit-progress-count');
        const barEl = document.getElementById('ky-submit-progress-bar');
        const pctEl = document.getElementById('ky-submit-progress-pct');
        const noteEl = document.getElementById('ky-submit-progress-note');
        if (countEl) {
            countEl.textContent = `${done} / ${target} ครั้ง`;
            countEl.style.color = color;
        }
        if (barEl) {
            barEl.style.width = `${pct}%`;
            barEl.style.background = color;
        }
        if (pctEl) {
            pctEl.textContent = `${pct}%`;
            pctEl.style.color = color;
        }
        if (noteEl) {
            const scope = selectedUnit ? `Safety Unit ${selectedUnit}` : `แผนก ${department}`;
            noteEl.textContent = chk?.submittedThisMonth
                ? `${scope} มีรายการ KY ของเดือนปัจจุบันแล้ว ระบบจะตรวจซ้ำตามวันที่กิจกรรมอีกครั้งตอนบันทึก`
                : `ความคืบหน้าปี ${year} ของ${scope}`;
            noteEl.className = `text-xs ${chk?.submittedThisMonth ? 'text-amber-700' : 'text-slate-500'}`;
        }
    } catch (_) {}
}

return {
    setupKyReporterSearch,
    renderKySafetyUnitSelect,
    renderKySubmitReporter,
    refreshKySubmitProgress,
};
})();

function _addParticipant(name, empId) {
    if (!name) return;
    if (_participants.some(p => p.name === name)) return;
    _participants.push({ name, empId: empId || null });
    updateParticipantTags();
    renderKySubmitSummary();
}

function renderKyFilePreview(input, nameId, previewId, type) {
    const file = input.files?.[0];
    const nameEl = document.getElementById(nameId);
    const previewEl = document.getElementById(previewId);
    if (file && !validateKySelectedFile(input, type)) return;
    if (nameEl) nameEl.textContent = file?.name || '';
    updateKySubmitReadiness();
    if (!previewEl) return;

    if (!file) {
        previewEl.classList.add('hidden');
        previewEl.innerHTML = '';
        return;
    }

    const isImage = file.type?.startsWith('image/');
    const isVideo = file.type?.startsWith('video/');
    const previewUrl = (isImage || isVideo) ? URL.createObjectURL(file) : '';
    const media = isImage
        ? `<img src="${previewUrl}" alt="preview" class="w-full h-36 object-cover rounded-lg border border-white shadow-sm">`
        : isVideo
            ? `<video src="${previewUrl}" class="w-full h-36 object-cover rounded-lg border border-white shadow-sm" controls muted></video>`
            : `<div class="h-36 rounded-lg border border-white bg-white flex items-center justify-center text-slate-400 text-xs font-semibold">FILE</div>`;

    previewEl.classList.remove('hidden');
    previewEl.innerHTML = `
        <div class="flex gap-3">
            <div class="w-40 flex-shrink-0">${media}</div>
            <div class="min-w-0 flex-1">
                <p class="text-xs font-bold text-slate-700 truncate">${escHtml(file.name)}</p>
                <p class="text-[11px] text-slate-400 mt-1">${type === 'video' ? 'Video evidence' : 'Attachment'} · ${formatFileSize(file.size)}</p>
                <button type="button" data-clear-ky-file
                    class="mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:text-red-600 hover:border-red-200 transition-colors">
                    × ล้างไฟล์
                </button>
            </div>
        </div>`;
}

function validateKySelectedFile(input, type) {
    const file = input?.files?.[0];
    if (!file) return true;

    const maxSize = type === 'video' ? Number(_kyVideoUploadConfig.maxFileSize || KY_VIDEO_LIMIT) : KY_ATTACHMENT_LIMIT;
    if (type === 'video') {
        const extension = String(file.name || '').split('.').pop().toLowerCase();
        const acceptedExtensions = Array.isArray(_kyVideoUploadConfig.acceptedExtensions) ? _kyVideoUploadConfig.acceptedExtensions : KY_VIDEO_EXTENSIONS;
        const acceptedMimeTypes = Array.isArray(_kyVideoUploadConfig.acceptedMimeTypes) ? _kyVideoUploadConfig.acceptedMimeTypes : KY_VIDEO_MIME_TYPES;
        if (!acceptedExtensions.includes(extension) || (file.type && !acceptedMimeTypes.includes(file.type.toLowerCase()))) {
            input.value = '';
            showToast('รองรับเฉพาะวิดีโอ MP4, MOV, WebM, AVI, MKV และ MPEG', 'warning');
            return false;
        }
    }
    if (file.size <= maxSize) return true;

    input.value = '';
    showToast(
        type === 'video'
            ? `วิดีโอหลักฐานมีขนาดเกิน ${formatFileSize(maxSize)}`
            : 'ไฟล์แนบภาพหรือเอกสารมีขนาดเกิน 20 MB',
        'warning'
    );
    return false;
}

function clearKyFile(inputId, nameId, previewId) {
    const input = document.getElementById(inputId);
    const nameEl = document.getElementById(nameId);
    const previewEl = document.getElementById(previewId);
    if (input) input.value = '';
    if (nameEl) nameEl.textContent = '';
    if (previewEl) {
        previewEl.classList.add('hidden');
        previewEl.innerHTML = '';
    }
    updateKySubmitReadiness();
}

function formatFileSize(bytes) {
    if (!bytes) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function updateParticipantTags() {
    const container = document.getElementById('ky-participants-tags');
    const hidden    = document.getElementById('ky-participants-hidden');
    if (!container) return;

    if (!_participants.length) {
        container.innerHTML = `<span class="text-xs text-slate-400 italic" id="ky-no-participants">ยังไม่มีผู้เข้าร่วม</span>`;
        if (hidden) hidden.value = '[]';
        renderKySubmitSummary();
        return;
    }

    if (hidden) hidden.value = JSON.stringify(_participants.map(p => p.name));
    container.innerHTML = _participants.map((p, i) => {
        const isLeader = i === 0;
        return `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${isLeader ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}">
            ${isLeader ? `<span class="text-[10px] font-bold bg-white bg-opacity-30 px-1.5 py-0.5 rounded-full text-indigo-900">หัวทีม</span>` : ''}
            ${escHtml(p.name)}
            ${p.empId ? `<span class="text-[10px] opacity-70">(${escHtml(p.empId)})</span>` : ''}
            <button type="button" data-idx="${i}"
                    class="ky-remove-participant ${isLeader ? 'text-indigo-200 hover:text-white' : 'text-indigo-400 hover:text-indigo-700'} leading-none font-bold ml-0.5">×</button>
        </span>`;
    }).join('');
    renderKySubmitSummary();
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: HISTORY
// ─────────────────────────────────────────────────────────────────────────────
async function renderHistory(container) {
    await Promise.all([_fetchDepartments(), _fetchProgramConfig(_filterHistYear)]);

    // Limit dept dropdown to configured depts when config exists
    const configDepts = _kyProgConfig.filter(c => c.IsActive).map(c => c.Department);
    const histDeptList = configDepts.length ? configDepts : _departments;
    const usingConfigScope = configDepts.length > 0;

    container.innerHTML = `
        <div class="space-y-4">
            ${usingConfigScope ? `
            <div class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>แสดงเฉพาะ <strong>${configDepts.length} ส่วนงาน</strong> ที่อยู่ในโปรแกรม KY ปี ${_filterHistYear} — ตั้งค่าได้ในแท็บ "จัดการ"</span>
            </div>` : ''}
            <div class="ds-filter-bar p-4">
                <div class="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2 flex-1">
                        <select id="ky-hist-year" class="form-input py-2 text-sm min-w-0">
                            ${[0,1,2].map(i => { const y = new Date().getFullYear()-i; return `<option value="${y}" ${y===_filterHistYear?'selected':''}>ปี ${y}</option>`; }).join('')}
                        </select>
                        <input id="ky-hist-date-from" type="date" class="form-input py-2 text-sm min-w-0"
                               value="${_filterDateFrom}" title="วันที่เริ่มต้น">
                        <input id="ky-hist-date-to"   type="date" class="form-input py-2 text-sm min-w-0"
                               value="${_filterDateTo}"   title="วันที่สิ้นสุด">
                        <select id="ky-hist-dept" class="form-input py-2 text-sm min-w-0">
                            <option value="all" ${_filterHistDept==='all'?'selected':''}>ทุกแผนก${usingConfigScope ? ` (${configDepts.length})` : ''}</option>
                            ${histDeptList.map(d => `<option value="${escHtml(d)}" ${_filterHistDept===d?'selected':''}>${escHtml(d)}</option>`).join('')}
                        </select>
                        <select id="ky-filter-status" class="form-input py-2 text-sm min-w-0">
                            <option value="all" ${_filterStatus==='all'?'selected':''}>ทุกสถานะ</option>
                            ${STATUSES.map(s => `<option value="${s}" ${_filterStatus===s?'selected':''}>${STATUS_LABEL[s]||s}</option>`).join('')}
                        </select>
                        <select id="ky-hist-risk" class="form-input py-2 text-sm min-w-0">
                            <option value="all" ${_filterHistRisk==='all'?'selected':''}>ทุกประเภทความเสี่ยง</option>
                            ${RISK_CATEGORIES.map(c => `<option value="${escHtml(c)}" ${_filterHistRisk===c?'selected':''}>${escHtml(c)}</option>`).join('')}
                        </select>
                        <select id="ky-hist-source" class="form-input py-2 text-sm min-w-0">
                            <option value="all" ${_filterHistSource==='all'?'selected':''}>ทุกการบันทึก</option>
                            <option value="self" ${_filterHistSource==='self'?'selected':''}>ส่งตามบัญชีผู้รายงาน</option>
                            <option value="admin" ${_filterHistSource==='admin'?'selected':''}>Admin ส่งแทน</option>
                        </select>
                        <select id="ky-hist-evidence" class="form-input py-2 text-sm min-w-0">
                            <option value="all" ${_filterHistEvidence==='all'?'selected':''}>All evidence</option>
                            <option value="complete" ${_filterHistEvidence==='complete'?'selected':''}>File + video complete</option>
                            <option value="production_video" ${_filterHistEvidence==='production_video'?'selected':''}>Production video</option>
                            <option value="external_verified" ${_filterHistEvidence==='external_verified'?'selected':''}>Verified external video</option>
                            <option value="external_pending" ${_filterHistEvidence==='external_pending'?'selected':''}>External video pending verify</option>
                            <option value="waiting_video" ${_filterHistEvidence==='waiting_video'?'selected':''}>Waiting for video</option>
                            <option value="no_video" ${_filterHistEvidence==='no_video'?'selected':''}>No video</option>
                            <option value="missing_file" ${_filterHistEvidence==='missing_file'?'selected':''}>Missing file</option>
                        </select>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap xl:flex-nowrap xl:w-[420px]">
                        <div class="relative flex-1 min-w-[220px]">
                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input id="ky-history-search" type="text" placeholder="ค้นหารายงาน..."
                               value="${_searchQ}" class="form-input w-full pl-9 text-sm py-2">
                    </div>
                    <button id="ky-history-clear" type="button"
                        class="flex items-center justify-center px-3 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-all flex-shrink-0">
                        ล้างตัวกรอง
                    </button>
                    <button id="ky-export-btn"
                        class="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 transition-all flex-shrink-0">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M12 10v6m0 0l-3-3m3 3l3-3M4 17v1a2 2 0 002 2h12a2 2 0 002-2v-1M7 7l4.586-4.586a2 2 0 012.828 0L19 7"/>
                        </svg>
                        Export Excel
                    </button>
                </div>
                <div id="ky-history-filter-result" class="mt-3 text-xs text-slate-500" role="status" aria-live="polite"></div>
            </div>

            <div class="ds-table-wrap">
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">วันที่</th>
                                <th class="px-4 py-3">แผนก / ทีม</th>
                                <th class="px-4 py-3">KYT Keyword</th>
                                <th class="px-4 py-3">ประเภท</th>
                                <th class="px-4 py-3">ผู้รายงาน / การบันทึก</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3">Evidence</th>
                                <th class="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody id="ky-history-tbody" class="divide-y divide-slate-100">
                            ${loadingRow(8)}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

    await fetchAndRenderHistory();
}

async function fetchAndRenderHistory() {
    const tbody = document.getElementById('ky-history-tbody');
    if (!tbody) return;
    const requestId = ++_historyRequestSeq;
    const resultStatus = document.getElementById('ky-history-filter-result');
    tbody.setAttribute('aria-busy', 'true');
    if (resultStatus) resultStatus.textContent = 'กำลังกรองข้อมูล...';
    try {
        const params = new URLSearchParams();
        if (_filterStatus !== 'all') params.set('status', _filterStatus);
        // Date range overrides year filter when set
        if (_filterDateFrom) params.set('dateFrom', _filterDateFrom);
        if (_filterDateTo)   params.set('dateTo',   _filterDateTo);
        if (!_filterDateFrom && !_filterDateTo && _filterHistYear) params.set('year', _filterHistYear);
        if (_filterHistDept !== 'all') {
            params.set('department', _filterHistDept);
        } else {
            // Scope to configured depts when "all" is selected and config exists
            const configDepts = _kyProgConfig.filter(c => c.IsActive).map(c => c.Department);
            if (configDepts.length) params.set('depts', configDepts.join(','));
        }
        if (_filterHistRisk !== 'all') params.set('riskCategory', _filterHistRisk);
        if (_filterHistSource !== 'all') params.set('source', _filterHistSource);
        if (_filterHistEvidence !== 'all') params.set('evidence', _filterHistEvidence);
        if (_searchQ.trim())           params.set('q', _searchQ.trim());
        const res     = await API.get(`/ky?${params}`);
        if (requestId !== _historyRequestSeq) return;
        const records = filterKyEvidenceRecords(normalizeApiArray(res?.data ?? res), _filterHistEvidence);
        _historyRecords = records;
        if (resultStatus) resultStatus.textContent = `พบ ${records.length.toLocaleString('th-TH')} รายการตามตัวกรอง`;

        if (!records.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400 text-sm">ไม่พบกิจกรรม KY</td></tr>`;
            return;
        }

        tbody.innerHTML = records.map(r => {
            const date = r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            return `
            <tr class="hover:bg-slate-50 transition-colors group">
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">${date}</td>
                <td class="px-4 py-3">
                    <div class="font-medium text-slate-800">${r.Department || '-'}</div>
                    ${r.SafetyUnit ? `<div class="mt-1 inline-flex rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">${escHtml(r.SafetyUnit)}</div>` : ''}
                    ${r.TeamName ? `<div class="text-xs text-slate-400 mt-1">${r.TeamName}</div>` : ''}
                </td>
                <td class="px-4 py-3 text-slate-700 max-w-[150px] truncate text-xs">${r.KYTKeyword || '-'}</td>
                <td class="px-4 py-3">
                    ${dsStatusBadge(r.RiskCategory || '-')}
                </td>
                <td class="px-4 py-3 min-w-[180px]">
                    <div class="text-xs font-semibold text-slate-700">${escHtml(r.ReporterName || '-')}</div>
                    ${renderKySubmitSource(r)}
                </td>
                <td class="px-4 py-3">
                    ${dsStatusBadge(r.Status || '-', { label: STATUS_LABEL[r.Status] || r.Status || '-' })}
                </td>
                <td class="px-4 py-3">
                    ${renderKyEvidenceBadge(r)}
                </td>
                <td class="px-4 py-3 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button class="btn-ky-view px-3 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
                                data-id="${r.id}">ดู</button>
                        ${_isAdmin ? `
                        <button class="btn-ky-manage px-3 py-1 rounded-lg text-xs font-semibold text-white transition-all"
                                style="background:linear-gradient(135deg,#6366f1,#8b5cf6)"
                                data-id="${r.id}">จัดการ</button>
                        <button class="btn-ky-delete p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                data-id="${r.id}" data-name="${escHtml(r.Department || '-')}" title="ลบ">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        if (requestId !== _historyRequestSeq) return;
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500 text-sm">${escHtml(err.message)}</td></tr>`;
        if (resultStatus) resultStatus.textContent = 'กรองข้อมูลไม่สำเร็จ กรุณาลองใหม่';
    } finally {
        if (requestId === _historyRequestSeq) tbody.removeAttribute('aria-busy');
    }
}

function renderDepartmentDiagnostics(unmappedDepartments = [], source = 'ProgramConfig') {
    const el = document.getElementById('ky-department-diagnostics');
    if (!el) return;
    if (!unmappedDepartments.length) {
        el.innerHTML = `<div class="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700" data-ky-department-diagnostics>Department mapping complete · dashboard source: ${escHtml(source)}</div>`;
        return;
    }
    el.innerHTML = `<div class="rounded-xl border border-amber-200 bg-amber-50 p-4" data-ky-department-diagnostics>
        <p class="text-sm font-bold text-amber-800">Unmapped Department (${unmappedDepartments.length})</p>
        <p class="mt-1 text-xs text-amber-700">พบกิจกรรมที่ชื่อ Department ไม่ตรงกับ Program Config จึงไม่รวมในกราฟหลัก กรุณาตรวจสอบชื่อก่อนแก้ข้อมูล</p>
        <div class="mt-3 flex flex-wrap gap-2">${unmappedDepartments.map(row => `<span class="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-800">${escHtml(row.Department || '-')} · ${Number(row.count || 0)}</span>`).join('')}</div>
    </div>`;
}

function isKySubmittedOnBehalf(record) {
    return Boolean(record?.SubmittedByID && record?.ReporterID && record.SubmittedByID !== record.ReporterID);
}

function renderKySubmitSource(record) {
    if (!isKySubmittedOnBehalf(record)) {
        return `<div class="mt-1 inline-flex items-center rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">ส่งตามบัญชีผู้รายงาน</div>`;
    }

    return `
        <div class="mt-1 flex flex-col gap-0.5">
            <span class="inline-flex w-fit items-center rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">Admin ส่งแทน</span>
            <span class="text-[10px] text-slate-400">บันทึกโดย ${escHtml(record.SubmittedByName || record.SubmittedByID || '-')}</span>
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: MANAGE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MODULE FORMS — KY
// ─────────────────────────────────────────────────────────────────────────────
function _kyFormFileLabel(mime) {
    if (!mime) return 'ไฟล์';
    if (mime.includes('pdf'))   return 'PDF';
    if (mime.includes('word') || mime.includes('officedocument.wordprocessing')) return 'Word';
    if (mime.includes('excel') || mime.includes('spreadsheetml')) return 'Excel';
    if (mime.startsWith('image/')) return 'รูปภาพ';
    return 'ไฟล์';
}

function _kyFormFileIcon(mime) {
    if (!mime) return '📄';
    if (mime.includes('pdf'))   return '📕';
    if (mime.includes('word') || mime.includes('officedocument.wordprocessing')) return '📘';
    if (mime.includes('excel') || mime.includes('spreadsheetml')) return '📗';
    if (mime.startsWith('image/')) return '🖼';
    return '📄';
}

async function _loadKyForms(adminAll = false) {
    try {
        const url = adminAll ? '/module-forms?module=ky&all=1' : '/module-forms?module=ky';
        const res = await API.get(url);
        _kyForms = normalizeApiArray(res?.data ?? res);
    } catch { _kyForms = []; }
    return _kyForms;
}

function _renderKyFormsManageSection() {
    const forms = _kyForms;
    const rows = forms.length
        ? forms.map(f => {
            const activeClass = f.IsActive ? '' : 'opacity-50';
            return `
            <tr class="hover:bg-slate-50 transition-colors ${activeClass}">
                <td class="px-4 py-3">
                    <div class="font-medium text-slate-800 text-sm">${escHtml(f.Title)}</div>
                    ${f.Description ? `<div class="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">${escHtml(f.Description)}</div>` : ''}
                </td>
                <td class="px-4 py-3 text-xs text-slate-500">${escHtml(f.Version || '—')}</td>
                <td class="px-4 py-3 text-xs text-slate-500">${_kyFormFileLabel(f.FileType)}</td>
                <td class="px-4 py-3">
                    ${f.IsActive
                        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>ใช้งาน</span>`
                        : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>ปิดใช้งาน</span>`}
                </td>
                <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">${new Date(f.UploadedAt).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                    <a href="${escHtml(f.FileUrl)}" target="_blank" class="px-3 py-1 rounded-lg text-xs font-semibold text-sky-600 hover:bg-sky-50 transition-colors inline-block">ดูไฟล์</a>
                    <button class="ky-form-toggle px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${f.IsActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}"
                            data-id="${f.id}" data-active="${f.IsActive}">${f.IsActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
                    <button class="ky-form-delete p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-0.5"
                            data-id="${f.id}" data-title="${escHtml(f.Title)}" title="ลบ">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </td>
            </tr>`;
        }).join('')
        : `<tr><td colspan="6" class="text-center py-8 text-slate-400 text-sm">
            <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
            </div>
            ยังไม่มีแบบฟอร์ม — กด "เพิ่มแบบฟอร์ม" เพื่อเพิ่ม
        </td></tr>`;

    const el = document.getElementById('ky-forms-tbody');
    if (el) el.innerHTML = rows;
}

function _openKyFormUploadModal() {
    const html = `
    <div class="space-y-4 p-1">
        <form id="ky-form-upload-form" class="space-y-3">
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">ชื่อแบบฟอร์ม <span class="text-red-500">*</span></label>
                <input type="text" id="kyff-title" class="form-input w-full rounded-xl text-sm" placeholder="เช่น แบบฟอร์มกิจกรรม KY" maxlength="200">
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">เวอร์ชั่น</label>
                    <input type="text" id="kyff-version" class="form-input w-full rounded-xl text-sm" placeholder="เช่น v1.0" maxlength="30">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">ลำดับแสดง</label>
                    <input type="number" id="kyff-sort" class="form-input w-full rounded-xl text-sm" placeholder="99" min="0" max="999">
                </div>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">คำอธิบาย</label>
                <textarea id="kyff-desc" rows="2" class="form-input w-full rounded-xl text-sm resize-none" placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"></textarea>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">ไฟล์แบบฟอร์ม <span class="text-red-500">*</span></label>
                <input type="file" id="kyff-file"
                       accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                       class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all">
                <p class="text-xs text-slate-400 mt-1">รองรับ PDF, Word, Excel, รูปภาพ · ขนาดไม่เกิน 20 MB</p>
            </div>
        </form>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button onclick="window.closeModal&&window.closeModal()" class="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">ยกเลิก</button>
            <button id="kyff-submit-btn" class="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                    style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
                อัปโหลดแบบฟอร์ม
            </button>
        </div>
    </div>`;
    openModal('เพิ่มแบบฟอร์ม KY', html, 'max-w-lg');
    document.getElementById('kyff-submit-btn')?.addEventListener('click', guardActionHandler(async () => {
        const title = document.getElementById('kyff-title')?.value.trim();
        const fileEl = document.getElementById('kyff-file');
        if (!title) { showToast('กรุณาระบุชื่อแบบฟอร์ม', 'error'); return; }
        if (!fileEl?.files?.length) { showToast('กรุณาเลือกไฟล์', 'error'); return; }
        const btn = document.getElementById('kyff-submit-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังอัปโหลด...'; }
        try {
            const fd = new FormData();
            fd.append('module', 'ky');
            fd.append('title', title);
            fd.append('description', document.getElementById('kyff-desc')?.value.trim() || '');
            fd.append('version', document.getElementById('kyff-version')?.value.trim() || '');
            fd.append('sortOrder', document.getElementById('kyff-sort')?.value || '99');
            fd.append('formFile', fileEl.files[0]);
            await API.post('/module-forms', fd);
            closeModal();
            showToast('อัปโหลดแบบฟอร์มสำเร็จ', 'success');
            await _loadKyForms(true);
            _renderKyFormsManageSection();
        } catch (err) {
            showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>อัปโหลดแบบฟอร์ม'; }
        }
    }));
}

function _renderKyFormsUserCard(forms) {
    const active = forms.filter(f => f.IsActive);
    if (!active.length) return '';
    return `
    <div class="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <div class="flex items-center gap-2 mb-3">
            <svg class="w-4 h-4 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <span class="text-sm font-bold text-indigo-800">แบบฟอร์มที่ต้องกรอกและแนบ</span>
        </div>
        <p class="text-xs text-indigo-700 mb-3">กรุณาดาวน์โหลดแบบฟอร์ม กรอกข้อมูล และนำมาแนบในช่องไฟล์แนบด้านล่าง</p>
        <div class="space-y-2">
            ${active.map(f => `
            <div class="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-indigo-100 gap-3">
                <div class="flex items-center gap-2.5 min-w-0">
                    <span class="text-base flex-shrink-0">${_kyFormFileIcon(f.FileType)}</span>
                    <div class="min-w-0">
                        <div class="text-sm font-semibold text-slate-800 truncate">${escHtml(f.Title)}</div>
                        <div class="text-xs text-slate-400">${_kyFormFileLabel(f.FileType)}${f.Version ? ` · ${escHtml(f.Version)}` : ''}</div>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    <a href="${escHtml(f.FileUrl)}" target="_blank"
                       class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-600 hover:bg-sky-50 border border-sky-200 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                        ดูไฟล์
                    </a>
                    <a href="${escHtml(f.FileUrl)}" download
                       class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-100 border border-indigo-200 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                        </svg>
                        ดาวน์โหลด
                    </a>
                </div>
            </div>`).join('')}
        </div>
    </div>`;
}

async function renderManage(container) {
    await Promise.all([_fetchDepartments(), _fetchSafetyUnits(), _fetchProgramConfig(_filterMgmtYear)]);

    const subActive   = 'px-4 py-2 text-xs font-bold rounded-lg text-white transition-all';
    const subInactive = 'px-4 py-2 text-xs font-semibold rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-all';
    if (!['coverage', 'annual-video', 'config', 'forms'].includes(_manageSub)) _manageSub = 'coverage';

    container.innerHTML = `
        <div class="space-y-4">
        <div class="ds-section p-5" data-ky-card-image="ky-admin-workspace">
                <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div>
                        <p class="text-xs font-bold text-indigo-700 uppercase">KY Admin Workspace</p>
                        <h2 class="text-lg font-bold text-slate-800 mt-1">จัดการโปรแกรม KY / KY Program Control</h2>
                        <p class="text-sm text-slate-500 mt-1">ติดตามการส่งรายส่วนงาน ตรวจรายการค้าง และกำหนดเป้าหมายหรือแบบฟอร์มสำหรับปีที่เลือก</p>
                    </div>
                    <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 min-w-full xl:min-w-[360px] xl:max-w-[420px]">
                        <p class="font-bold text-slate-700">Admin focus</p>
                        <p class="mt-1">Coverage & Follow-up รวมภาพรวมการส่ง, คิวตรวจ, และรายการรอปิดงานไว้ในหน้าเดียว</p>
                    </div>
                </div>
            </div>

            <!-- Sub-tab bar -->
            <div class="ds-filter-bar flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap gap-2">
                    <button id="ky-msub-coverage" class="${_manageSub==='coverage' ? subActive : subInactive}"
                            style="${_manageSub==='coverage' ? 'background:linear-gradient(135deg,#6366f1,#8b5cf6)' : ''}"
                            data-msub="coverage">Coverage & Follow-up</button>
                    ${_isAdmin ? `<button id="ky-msub-annual-video" class="${_manageSub==='annual-video' ? subActive : subInactive}"
                            style="${_manageSub==='annual-video' ? 'background:linear-gradient(135deg,#059669,#0f766e)' : ''}"
                            data-msub="annual-video">Annual Video Evidence</button>` : ''}
                    <button id="ky-msub-config" class="${_manageSub==='config' ? subActive : subInactive}"
                            style="${_manageSub==='config' ? 'background:linear-gradient(135deg,#6366f1,#8b5cf6)' : ''}"
                            data-msub="config">ตั้งค่าโปรแกรม KY</button>
                    <button id="ky-msub-forms" class="${_manageSub==='forms' ? subActive : subInactive}"
                            style="${_manageSub==='forms' ? 'background:linear-gradient(135deg,#6366f1,#8b5cf6)' : ''}"
                            data-msub="forms">แบบฟอร์ม</button>
                </div>
                <div class="flex flex-wrap gap-2 items-center">
                    <select id="ky-mgmt-year" class="form-input py-1.5 text-sm">
                        ${[0,1,2].map(i => { const y = new Date().getFullYear()-i; return `<option value="${y}" ${y===_filterMgmtYear?'selected':''}>${y}</option>`; }).join('')}
                    </select>
                    ${_manageSub === 'coverage' ? `
                    <select id="ky-mgmt-dept" class="form-input py-1.5 text-sm">
                        <option value="all" ${_filterMgmtDept==='all'?'selected':''}>ทุกแผนก</option>
                        ${_departments.map(d => `<option value="${escHtml(d)}" ${_filterMgmtDept===d?'selected':''}>${escHtml(d)}</option>`).join('')}
                    </select>
                    <select id="ky-mgmt-risk" class="form-input py-1.5 text-sm">
                        <option value="all" ${_filterMgmtRisk==='all'?'selected':''}>ทุกประเภทความเสี่ยง</option>
                        ${RISK_CATEGORIES.map(c => `<option value="${escHtml(c)}" ${_filterMgmtRisk===c?'selected':''}>${escHtml(c)}</option>`).join('')}
                    </select>` : ''}
                    ${_manageSub === 'config' && _isAdmin ? `
                    <button id="ky-add-config-btn"
                            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all"
                            style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        เพิ่มส่วนงาน
                    </button>` : ''}
                </div>
            </div>

            <div id="ky-manage-panel">
                <div class="ds-section p-5 animate-pulse"><div class="h-5 bg-slate-100 rounded w-48 mb-4"></div><div class="h-24 bg-slate-50 rounded-xl"></div></div>
            </div>
        </div>`;

    await _renderManagePanel();
}

async function _renderManagePanel() {
    const panel = document.getElementById('ky-manage-panel');
    if (!panel) return;
    if (_manageSub === 'config') {
        renderManageConfig(panel);
    } else if (_manageSub === 'annual-video') {
        await renderKyAnnualVideoEvidence(panel);
    } else if (_manageSub === 'forms') {
        renderManageForms(panel);
        await _loadKyForms(_isAdmin);
        _renderKyFormsManageSection();
        wireKyFormsManageEvents();
    } else {
        await fetchAndRenderManage('all');
    }
}

function wireKyFormsManageEvents() {
    document.getElementById('btn-add-ky-form')?.addEventListener('click', _openKyFormUploadModal);
    document.getElementById('ky-forms-tbody')?.addEventListener('click', guardActionHandler(async e => {
        const toggleBtn = e.target.closest('.ky-form-toggle');
        const deleteBtn = e.target.closest('.ky-form-delete');
        if (toggleBtn) {
            const id = toggleBtn.dataset.id;
            const isActive = toggleBtn.dataset.active === '1' || toggleBtn.dataset.active === 'true' || toggleBtn.dataset.active === 1;
            const form = _kyForms.find(f => String(f.id) === String(id));
            if (!form) return;
            try {
                await API.put(`/module-forms/${id}`, {
                    title: form.Title,
                    description: form.Description,
                    version: form.Version,
                    sortOrder: form.SortOrder,
                    isActive: isActive ? 0 : 1,
                });
                showToast(isActive ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว', 'success');
                await _loadKyForms(_isAdmin);
                _renderKyFormsManageSection();
            } catch (err) { showToast(err.message || 'เกิดข้อผิดพลาด', 'error'); }
        }
        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            const title = deleteBtn.dataset.title;
            showConfirmationModal(`ลบแบบฟอร์ม "${title}" ใช่หรือไม่?`, async () => {
                try {
                    await API.delete(`/module-forms/${id}`);
                    showToast('ลบแบบฟอร์มสำเร็จ', 'success');
                    await _loadKyForms(_isAdmin);
                    _renderKyFormsManageSection();
                } catch (err) { showToast(err.message || 'เกิดข้อผิดพลาด', 'error'); }
            });
        }
    }, { render: false, target: event => event?.target?.closest?.('.ky-form-toggle, .ky-form-delete') || null, actionKey: (_event, button) => `ky:forms:${button.classList.contains('ky-form-delete') ? 'delete' : 'toggle'}:${button.dataset.id}` }));
}

async function renderKyAnnualVideoEvidence(panel = document.getElementById('ky-manage-panel')) {
    if (!panel) return;
    panel.innerHTML = `<div class="ds-section p-8 text-center text-sm text-slate-500">กำลังโหลด Annual Video Evidence...</div>`;
    try {
        const response = await API.get(`/ky/annual-video-evidence?year=${encodeURIComponent(_filterMgmtYear)}`);
        _kyAnnualVideoData = normalizeApiObject(response?.data ?? response) || {};
        const data = _kyAnnualVideoData;
        const summary = data.summary || {};
        const evidence = data.evidence || [];
        const scopes = data.scopes || [];
        const candidates = data.candidates || [];
        const inventory = data.inventory || [];
        const inventorySummary = data.inventorySummary || {};
        const annualCandidates = candidates.filter(row => !row.ScopeAlreadyRegistered);
        const annualCleanup = evidence.filter(row => row.canDeleteProductionFile);
        const inventoryCleanup = inventory.filter(row => row.canDeleteProductionFile);
        const adminDepartments = [...new Set([...scopes, ...inventory].map(row => String(row.department || row.Department || '').trim()).filter(Boolean))].sort();
        const actionRequired = Number(summary.pendingScopes || 0) + Number(summary.missingScopes || 0)
            + Number(inventorySummary.unregistered || 0) + Number(inventorySummary.pending || 0);
        const statusBadge = row => row.Status === 'Verified'
            ? '<span class="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">Verified</span>'
            : row.Status === 'NeedsCorrection'
                ? '<span class="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-700">Needs correction</span>'
                : row.Status === 'Unregistered'
                    ? '<span class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">Unregistered</span>'
                    : '<span class="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">Pending</span>';
        panel.innerHTML = `
            <div class="space-y-5">
                <div class="sticky top-0 z-20 ds-section p-3 shadow-sm" data-ky-annual-admin-toolbar>
                    <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                        <div class="flex gap-2 overflow-x-auto pb-1 xl:pb-0">
                            ${[['overview','Overview'],['annual','Annual Compliance'],['inventory','Production Inventory'],['cleanup','Cleanup Queue & Audit']].map(([value,label])=>`<button type="button" data-ky-annual-view="${value}" class="whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${_kyAnnualAdminView===value?'bg-emerald-700 text-white':'border border-slate-200 bg-white text-slate-600'}">${label}</button>`).join('')}
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 xl:max-w-3xl">
                            <input type="search" data-ky-annual-admin-search class="ds-input" value="${escHtml(_kyAnnualAdminFilters.search)}" placeholder="ค้นหา Scope, Unit, Activity หรือชื่อไฟล์">
                            <select data-ky-annual-admin-department class="ds-select"><option value="all">ทุก Department</option>${adminDepartments.map(dept=>`<option value="${escHtml(dept)}" ${_kyAnnualAdminFilters.department===dept?'selected':''}>${escHtml(dept)}</option>`).join('')}</select>
                            <select data-ky-annual-admin-status class="ds-select"><option value="action" ${_kyAnnualAdminFilters.status==='action'?'selected':''}>ต้องดำเนินการ (${actionRequired})</option><option value="all" ${_kyAnnualAdminFilters.status==='all'?'selected':''}>ทุกสถานะ</option><option value="missing">ยังไม่มี / Unregistered</option><option value="pending">รอ Verify / Needs correction</option><option value="verified">Verified</option><option value="ready">พร้อม Cleanup</option><option value="deleted">ลบ Production แล้ว</option></select>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-2 lg:grid-cols-6 gap-3" data-ky-annual-summary>
                    ${[
                        ['Required scopes', summary.requiredScopes || 0, 'text-slate-800'],
                        ['Verified', summary.verifiedScopes || 0, 'text-emerald-700'],
                        ['Pending', summary.pendingScopes || 0, 'text-amber-700'],
                        ['Missing', summary.missingScopes || 0, 'text-rose-700'],
                        ['Action required', actionRequired, 'text-indigo-700'],
                        ['Cleanup ready', `${annualCleanup.length + inventoryCleanup.length} · ${formatFileSize([...annualCleanup, ...inventoryCleanup].reduce((total,row)=>total+Number(row.FileSize||0),0))}`, 'text-teal-700'],
                    ].map(([label,value,color]) => `<div class="ds-section p-4"><p class="text-[10px] font-bold uppercase text-slate-400">${label}</p><p class="mt-1 text-xl font-bold ${color}">${value}</p></div>`).join('')}
                </div>
                <div class="ds-section p-5">
                    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                        <div><h3 class="font-bold text-slate-800">Annual Compliance Dashboard · ${escHtml(String(data.year || _filterMgmtYear))}</h3><p class="text-xs text-slate-500 mt-1">แต่ละ Department / Safety Unit ต้องมีหลักฐานวิดีโอที่ Admin ตรวจยืนยันอย่างน้อย 1 รายการต่อปี</p></div>
                        <div class="h-2.5 w-full lg:w-64 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${Math.max(0,Math.min(100,Number(summary.compliancePct||0)))}%"></div></div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                        ${scopes.length ? scopes.map(scope => `<div class="rounded-xl border ${scope.compliant?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-white'} p-3"><div class="flex items-center justify-between gap-2"><div><p class="text-xs font-bold text-slate-800">${escHtml(scope.department||'-')}</p><p class="text-[10px] text-slate-500">${escHtml(scope.safetyUnit||'ระดับ Department')}</p></div><span class="text-[10px] font-bold ${scope.compliant?'text-emerald-700':'text-rose-600'}">${scope.compliant?'ครบแล้ว':scope.evidence?'รอตรวจ':'ยังไม่มี'}</span></div></div>`).join('') : '<p class="text-sm text-slate-400">ยังไม่มี Program Config สำหรับปีนี้</p>'}
                    </div>
                </div>
                <div class="ds-section overflow-hidden">
                    <div class="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div><h3 class="font-bold text-slate-800">ทะเบียนหลักฐานและพื้นที่ Production</h3><p class="text-xs text-slate-500 mt-1">Metadata และ Audit จะคงอยู่หลังลบไฟล์ การลบทำได้เฉพาะรายการ Verified ที่ยืนยัน External Backup และ SHA-256 ตรงกัน</p></div>
                        <button type="button" data-ky-annual-delete-selected class="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-40">ลบไฟล์ Production ที่เลือก</button>
                    </div>
                    <div class="overflow-x-auto"><table class="ds-table text-sm"><thead><tr><th class="px-3 py-3"><input type="checkbox" data-ky-annual-check-all></th><th class="px-3 py-3">Scope / Activity</th><th class="px-3 py-3">Storage</th><th class="px-3 py-3">Metadata</th><th class="px-3 py-3">Status</th><th class="px-3 py-3 text-right">Action</th></tr></thead><tbody>
                        ${evidence.length ? evidence.map(row => `<tr data-ky-annual-evidence-row="${escHtml(row.id)}">
                            <td class="px-3 py-3"><input type="checkbox" data-ky-annual-select value="${escHtml(row.id)}" data-version="${Number(row.RowVersion||0)}" ${row.canDeleteProductionFile?'':'disabled'}></td>
                            <td class="px-3 py-3"><p class="font-bold text-slate-800">${escHtml(row.Department||'-')}</p><p class="text-xs text-slate-500">${escHtml(row.SafetyUnit||'ระดับ Department')} · ${escHtml(row.ActivityID||'-')}</p></td>
                            <td class="px-3 py-3"><p class="text-xs font-bold ${row.StorageMode==='CentralMachine'?'text-teal-700':'text-indigo-700'}">${escHtml(row.StorageMode||'-')}</p><p class="text-[10px] text-slate-400 max-w-[220px] truncate" title="${escHtml(row.ExternalReference||'')}">${escHtml(row.ExternalReference||'Production')}</p></td>
                            <td class="px-3 py-3"><p class="text-xs font-semibold text-slate-700 max-w-[220px] truncate">${escHtml(row.OriginalFileName||'-')}</p><p class="text-[10px] text-slate-400">${formatFileSize(row.FileSize||0)} · SHA ${escHtml(String(row.SHA256||'').slice(0,12))}…</p></td>
                            <td class="px-3 py-3">${statusBadge(row)}${row.fileDeleted?'<p class="text-[10px] text-rose-600 mt-1">Production file removed</p>':''}</td>
                            <td class="px-3 py-3"><div class="flex justify-end gap-1 flex-wrap">
                                ${row.ProductionVideoUrl&&!row.fileDeleted?`<button data-ky-annual-download="${escHtml(row.id)}" data-name="${escHtml(row.OriginalFileName||'video')}" class="px-2 py-1 rounded-lg border text-[10px] font-bold text-indigo-700">ดาวน์โหลด</button>`:''}
                                ${row.ProductionVideoUrl&&!row.fileDeleted&&row.StorageMode!=='CentralMachine'&&row.Status!=='Verified'?`<button data-ky-annual-confirm-external="${escHtml(row.id)}" class="px-2 py-1 rounded-lg border border-teal-200 text-[10px] font-bold text-teal-700">ยืนยันเครื่องกลาง</button>`:''}
                                <button data-ky-annual-audit="${escHtml(row.id)}" class="px-2 py-1 rounded-lg border text-[10px] font-bold text-slate-600">Audit</button>
                                ${row.Status!=='Verified'?`<button data-ky-annual-verify="${escHtml(row.id)}" data-version="${Number(row.RowVersion||0)}" class="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold">Verify</button>`:''}
                                ${row.Status!=='NeedsCorrection'?`<button data-ky-annual-correction="${escHtml(row.id)}" data-version="${Number(row.RowVersion||0)}" class="px-2 py-1 rounded-lg bg-amber-500 text-white text-[10px] font-bold">แก้ไข</button>`:''}
                                ${row.canDeleteProductionFile?`<button data-ky-annual-delete-one="${escHtml(row.id)}" data-version="${Number(row.RowVersion||0)}" class="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold">ลบไฟล์</button>`:''}
                            </div></td>
                        </tr>`).join('') : '<tr><td colspan="6" class="py-8 text-center text-sm text-slate-400">ยังไม่มีทะเบียนหลักฐานวิดีโอรายปี</td></tr>'}
                    </tbody></table></div>
                </div>
                ${annualCandidates.length ? `<div class="ds-section p-5"><h3 class="font-bold text-slate-800">กิจกรรมที่เลือกเป็นหลักฐาน Annual ได้ (${annualCandidates.length})</h3><p class="text-xs text-slate-500 mt-1 mb-3">แสดงเฉพาะ Scope ที่ยังไม่มีหลักฐานหลักประจำปี</p><div class="grid grid-cols-1 lg:grid-cols-2 gap-2 max-h-80 overflow-y-auto">${annualCandidates.map(row=>`<div class="rounded-xl border border-slate-200 p-3 flex items-center justify-between gap-3"><div class="min-w-0"><p class="text-xs font-bold text-slate-800 truncate">${escHtml(row.Department||'-')} · ${escHtml(row.SafetyUnit||'Department')}</p><p class="text-[10px] text-slate-500 truncate">${escHtml(row.TeamName||row.KYTKeyword||row.id)}</p></div><button data-ky-annual-register-production="${escHtml(row.id)}" class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold whitespace-nowrap">ลงทะเบียน Annual</button></div>`).join('')}</div></div>`:''}
                <div class="ds-section p-5" data-ky-video-inventory>
                    <div class="flex flex-col xl:flex-row xl:items-end justify-between gap-3 mb-4">
                        <div><h3 class="font-bold text-slate-800">Production Video Inventory (${Number(inventorySummary.total||inventory.length)})</h3><p class="text-xs text-slate-500 mt-1">แยกจาก Annual Compliance · ระบบเก็บ SHA-256 ของไฟล์ Production และต้อง Admin Verify ว่ามี External Backup จริงก่อนลบ Production</p></div>
                        <button type="button" data-ky-inventory-delete-selected class="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-40">ลบไฟล์ Inventory ที่เลือก</button>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-4">
                        ${[
                            ['Production', inventorySummary.productionFiles||0, 'text-sky-700'],
                            ['Unregistered', inventorySummary.unregistered||0, 'text-slate-700'],
                            ['Pending', inventorySummary.pending||0, 'text-amber-700'],
                            ['External verified', inventorySummary.verifiedExternal||0, 'text-emerald-700'],
                            ['Ready to clean', inventorySummary.reclaimableFiles||0, 'text-teal-700'],
                            ['Removed', inventorySummary.deletedFiles||0, 'text-rose-700'],
                        ].map(([label,value,color])=>`<div class="rounded-xl border border-slate-100 bg-slate-50 p-3"><p class="text-[10px] font-bold uppercase text-slate-400">${label}</p><p class="text-lg font-black ${color}">${value}</p></div>`).join('')}
                    </div>
                    <div class="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-[11px] text-indigo-800" data-ky-inventory-help>
                        <p class="font-bold">วิธีลงทะเบียน External Backup</p>
                        <p class="mt-1">1) เก็บวิดีโอไว้ใต้ ${escHtml(KY_EXTERNAL_BACKUP_ROOT)} 2) กดลงทะเบียนและกรอกชื่อไฟล์ 3) ระบบเก็บขนาด/SHA-256 ของต้นฉบับ Production ให้อัตโนมัติ 4) Admin Verify ว่าไฟล์เครื่องกลางมีอยู่จริง · ไม่ต้องเลือกหรืออัปโหลดไฟล์สำรองผ่าน Browser</p>
                    </div>
                    <div class="mb-3 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2">
                        <input type="search" data-ky-inventory-search class="ds-input" placeholder="ค้นหา Department, Safety Unit, ชื่อทีม หรือ Activity ID">
                        <select data-ky-inventory-filter class="ds-select"><option value="all">ทุกสถานะ</option><option value="unregistered">ยังไม่ลงทะเบียน Backup</option><option value="pending">รอ Verify</option><option value="verified">External verified</option><option value="reclaimable">พร้อมลบ Production</option><option value="deleted">ลบ Production แล้ว</option></select>
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1" data-ky-inventory-list>
                        ${inventory.length ? inventory.map(row=>`<div class="rounded-xl border ${row.canDeleteProductionFile?'border-teal-300 bg-teal-50/40':'border-slate-200 bg-white'} p-3" data-ky-inventory-row data-activity-date="${escHtml(String(row.ActivityDate||'').slice(0,10))}" data-search="${escHtml([row.Department,row.SafetyUnit,row.TeamName,row.KYTKeyword,row.ActivityID,row.ActivityDate,row.ProductionOriginalFileName,row.OriginalFileName].filter(Boolean).join(' ').toLowerCase())}" data-status="${row.fileDeleted?'deleted':row.canDeleteProductionFile?'reclaimable':row.Status==='Verified'?'verified':['Pending','NeedsCorrection'].includes(row.Status)?'pending':'unregistered'}">
                            <div class="flex items-start gap-3"><input type="checkbox" data-ky-inventory-select value="${escHtml(row.id||'')}" data-version="${Number(row.RowVersion||0)}" ${row.canDeleteProductionFile?'':'disabled'} class="mt-1"><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><p class="text-xs font-bold text-slate-800">${escHtml(row.Department||'-')} · ${escHtml(row.SafetyUnit||'Department')}</p>${statusBadge(row)}<span class="rounded-full bg-sky-50 px-2 py-1 text-[9px] font-bold text-sky-700">${escHtml(formatKyActivityMonth(row.ActivityDate))}</span>${row.AnnualEvidenceID?'<span class="rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-bold text-indigo-700">Annual primary</span>':''}</div><p class="mt-1 text-[10px] text-slate-500 truncate">${escHtml(formatKyActivityDate(row.ActivityDate))} · ${escHtml(row.TeamName||row.KYTKeyword||row.ActivityID)}</p><p class="mt-1 text-[10px] font-semibold text-slate-600 truncate" title="${escHtml(row.ProductionOriginalFileName||row.OriginalFileName||'')}">ไฟล์ Production: ${escHtml(row.ProductionOriginalFileName||row.OriginalFileName||'ไม่พบชื่อไฟล์')}</p>${row.registered?`<p class="mt-1 text-[10px] text-slate-400 truncate">ไฟล์ Backup ที่ตรวจ: ${escHtml(row.OriginalFileName||'-')}</p>`:''}${row.SHA256?`<p class="mt-1 text-[10px] text-slate-400">${formatFileSize(row.FileSize||0)} · SHA ${escHtml(String(row.SHA256).slice(0,12))}…</p>`:''}${row.fileDeleted?'<p class="mt-1 text-[10px] font-bold text-rose-600">Production file removed · metadata retained</p>':''}<p aria-live="polite" data-ky-inventory-registration-status="${escHtml(row.ActivityID)}" class="mt-2 rounded-lg border px-2 py-1.5 text-[10px] font-semibold ${row.registered?(row.Status==='Verified'?'text-emerald-700 bg-emerald-50 border-emerald-100':row.Status==='NeedsCorrection'?'text-rose-700 bg-rose-50 border-rose-100':'text-amber-700 bg-amber-50 border-amber-100'):'text-slate-600 bg-slate-50 border-slate-100'}">${row.registered?(row.Status==='Verified'?'ลงทะเบียนและ Admin Verify แล้ว':row.Status==='NeedsCorrection'?'ข้อมูล Backup ต้องแก้ไข':'ลงทะเบียนสำเร็จ · รอ Admin Verify'):'ยังไม่ได้ลงทะเบียน External Backup'}</p></div></div>
                            <div class="mt-3 flex flex-wrap justify-end gap-1">
                                <button type="button" data-ky-inventory-detail="${escHtml(row.id||row.ActivityID)}" class="rounded-lg border px-2 py-1 text-[10px] font-bold text-slate-600">Detail</button>
                                ${!row.registered&&row.CurrentVideoUrl?`<button type="button" data-id="${escHtml(row.ActivityID)}" data-production-name="${escHtml(row.ProductionOriginalFileName||row.OriginalFileName||'')}" data-ky-inventory-register="${escHtml(row.ActivityID)}" title="กรอกชื่อไฟล์ที่เก็บไว้ในเครื่องกลาง" class="px-2 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold">ลงทะเบียน External Backup</button>`:''}
                                ${row.registered&&row.CurrentVideoUrl&&!row.fileDeleted?`<button data-ky-inventory-download="${escHtml(row.id)}" data-name="${escHtml(row.OriginalFileName||'video')}" class="px-2 py-1 rounded-lg border text-[10px] font-bold text-indigo-700">ดาวน์โหลด</button>`:''}
                                ${row.registered?`<button data-ky-inventory-audit="${escHtml(row.id)}" class="px-2 py-1 rounded-lg border text-[10px] font-bold text-slate-600">Audit</button>`:''}
                                ${row.registered&&row.Status!=='Verified'?`<button data-ky-inventory-verify="${escHtml(row.id)}" data-version="${Number(row.RowVersion||0)}" class="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold">Verify</button>`:''}
                                ${row.registered&&row.Status!=='NeedsCorrection'?`<button data-ky-inventory-correction="${escHtml(row.id)}" data-version="${Number(row.RowVersion||0)}" class="px-2 py-1 rounded-lg bg-amber-500 text-white text-[10px] font-bold">แก้ไข</button>`:''}
                                ${row.canDeleteProductionFile?`<button data-ky-inventory-delete-one="${escHtml(row.id)}" data-version="${Number(row.RowVersion||0)}" class="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold">ลบไฟล์</button>`:''}
                            </div>
                        </div>`).join(''):'<p class="col-span-full py-8 text-center text-sm text-slate-400">ไม่พบวิดีโอใน Inventory ปีนี้</p>'}
                    </div>
                </div>
            </div>`;
        panel.querySelector('.space-y-5')?.insertAdjacentHTML('beforeend', buildKyCleanupQueue(evidence, inventory));
        configureKyAnnualAdminWorkspace(panel, { scopes, evidence, inventory, annualCandidates });
        panel.querySelector('[data-ky-inventory-search]')?.addEventListener('input', filterKyVideoInventory);
        panel.querySelector('[data-ky-inventory-filter]')?.addEventListener('change', filterKyVideoInventory);
        panel.querySelector('[data-ky-annual-admin-search]')?.addEventListener('input', event => {
            _kyAnnualAdminFilters.search = event.target.value || '';
            filterKyAnnualAdminWorkspace(panel);
        });
        panel.querySelector('[data-ky-annual-admin-department]')?.addEventListener('change', event => {
            _kyAnnualAdminFilters.department = event.target.value || 'all';
            filterKyAnnualAdminWorkspace(panel);
        });
        panel.querySelector('[data-ky-annual-admin-status]')?.addEventListener('change', event => {
            _kyAnnualAdminFilters.status = event.target.value || 'all';
            filterKyAnnualAdminWorkspace(panel);
        });
    } catch (err) {
        panel.innerHTML = `<div class="ds-section p-6 text-center text-sm text-red-600">${escHtml(err.message || 'โหลด Annual Video Evidence ไม่สำเร็จ')}</div>`;
    }
}

function buildKyCleanupQueue(annualEvidence = [], inventoryEvidence = []) {
    const annualRows = annualEvidence.filter(row => row.canDeleteProductionFile);
    const inventoryRows = inventoryEvidence.filter(row => row.canDeleteProductionFile);
    const auditHistory = [
        ...annualEvidence.filter(row => row.fileDeleted).map(row => ({ ...row, evidenceKind: 'annual' })),
        ...inventoryEvidence.filter(row => row.fileDeleted).map(row => ({ ...row, evidenceKind: 'inventory' })),
    ];
    const allRows = [...annualRows, ...inventoryRows];
    const reclaimableBytes = allRows.reduce((total, row) => total + Number(row.FileSize || 0), 0);
    const rowMarkup = (row, kind) => {
        const isAnnual = kind === 'annual';
        const id = String(row.id || '');
        const department = String(row.Department || row.department || '-');
        const safetyUnit = String(row.SafetyUnit || row.safetyUnit || 'Department');
        const search = [department, safetyUnit, row.TeamName, row.KYTKeyword, row.ActivityID, row.OriginalFileName, row.ExternalReference]
            .filter(Boolean).join(' ').toLowerCase();
        return `<div class="rounded-xl border border-teal-200 bg-teal-50/40 p-3" data-ky-admin-filter-row data-department="${escHtml(department)}" data-status="ready" data-search="${escHtml(search)}">
            <div class="flex items-start gap-3">
                <input type="checkbox" ${isAnnual ? 'data-ky-annual-select' : 'data-ky-inventory-select'} value="${escHtml(id)}" data-version="${Number(row.RowVersion || 0)}" class="mt-1">
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2"><p class="text-xs font-bold text-slate-800">${escHtml(department)} · ${escHtml(safetyUnit)}</p><span class="rounded-full bg-teal-100 px-2 py-1 text-[9px] font-bold text-teal-700">Guard passed</span></div>
                    <p class="mt-1 truncate text-[10px] text-slate-500">${escHtml(row.OriginalFileName || row.ActivityID || id)} · ${formatFileSize(row.FileSize || 0)}</p>
                    <p class="mt-1 truncate text-[10px] text-slate-400" title="${escHtml(row.ExternalReference || '')}">External: ${escHtml(row.ExternalReference || '-')} · SHA ${escHtml(String(row.SHA256 || '').slice(0, 16))}…</p>
                </div>
                <div class="flex flex-wrap justify-end gap-1">
                    <button type="button" ${isAnnual ? `data-ky-annual-detail="${escHtml(id)}"` : `data-ky-inventory-detail="${escHtml(id)}"`} class="rounded-lg border px-2 py-1 text-[10px] font-bold text-slate-600">Detail</button>
                    <button type="button" ${isAnnual ? `data-ky-annual-audit="${escHtml(id)}"` : `data-ky-inventory-audit="${escHtml(id)}"`} class="rounded-lg border px-2 py-1 text-[10px] font-bold text-slate-600">Audit</button>
                    <button type="button" ${isAnnual ? `data-ky-annual-delete-one="${escHtml(id)}"` : `data-ky-inventory-delete-one="${escHtml(id)}"`} data-version="${Number(row.RowVersion || 0)}" class="rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-bold text-white">ลบไฟล์</button>
                </div>
            </div>
        </div>`;
    };
    return `<div class="ds-section p-5 ${_kyAnnualAdminView === 'cleanup' ? '' : 'hidden'}" data-ky-cleanup-panel data-ky-annual-view-panel="cleanup">
        <div class="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div><h3 class="font-bold text-slate-800">Cleanup Queue & Audit</h3><p class="mt-1 text-xs text-slate-500">แสดงเฉพาะไฟล์ที่ผ่าน Admin Verify, ยืนยัน External Backup, มี SHA-256 ตรงกัน และยังผูกกับไฟล์ Production ปัจจุบัน</p></div>
            <div class="rounded-xl bg-teal-50 px-4 py-2 text-right"><p class="text-[10px] font-bold uppercase text-teal-600">Ready for guarded cleanup</p><p class="font-black text-teal-800">${allRows.length} files · ${formatFileSize(reclaimableBytes)}</p></div>
        </div>
        <div class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section class="rounded-2xl border border-slate-200 p-4" data-ky-cleanup-group="annual">
                <div class="mb-3 flex items-center justify-between gap-2"><div><h4 class="text-sm font-bold text-slate-800">Annual primary evidence</h4><p class="text-[10px] text-slate-500">${annualRows.length} รายการ</p></div><div class="flex items-center gap-2"><label class="text-[10px] font-bold text-slate-500"><input type="checkbox" data-ky-annual-check-all> เลือกทั้งหมด</label><button type="button" data-ky-annual-delete-selected class="rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-40">Bulk cleanup</button></div></div>
                <div class="space-y-2 max-h-[52vh] overflow-y-auto pr-1">${annualRows.length ? annualRows.map(row => rowMarkup(row, 'annual')).join('') : '<p class="py-8 text-center text-xs text-slate-400">ไม่มี Annual file ที่ผ่านเงื่อนไขการลบ</p>'}</div>
            </section>
            <section class="rounded-2xl border border-slate-200 p-4" data-ky-cleanup-group="inventory">
                <div class="mb-3 flex items-center justify-between gap-2"><div><h4 class="text-sm font-bold text-slate-800">Production inventory</h4><p class="text-[10px] text-slate-500">${inventoryRows.length} รายการ</p></div><div class="flex items-center gap-2"><label class="text-[10px] font-bold text-slate-500"><input type="checkbox" data-ky-inventory-check-all> เลือกทั้งหมด</label><button type="button" data-ky-inventory-delete-selected class="rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-40">Bulk cleanup</button></div></div>
                <div class="space-y-2 max-h-[52vh] overflow-y-auto pr-1">${inventoryRows.length ? inventoryRows.map(row => rowMarkup(row, 'inventory')).join('') : '<p class="py-8 text-center text-xs text-slate-400">ไม่มี Inventory file ที่ผ่านเงื่อนไขการลบ</p>'}</div>
            </section>
        </div>
        <section class="mt-4 rounded-2xl border border-slate-200 p-4">
            <div class="mb-3"><h4 class="text-sm font-bold text-slate-800">Cleanup audit history</h4><p class="text-[10px] text-slate-500">ไฟล์ Production ที่ลบแล้ว โดย Metadata, SHA-256 และ Audit ยังคงอยู่ (${auditHistory.length})</p></div>
            <div class="grid max-h-[40vh] grid-cols-1 gap-2 overflow-y-auto pr-1 lg:grid-cols-2">${auditHistory.length ? auditHistory.map(row => {
                const department = String(row.Department || '-');
                const id = String(row.id || '');
                const isAnnual = row.evidenceKind === 'annual';
                return `<div class="rounded-xl border border-rose-100 bg-rose-50/40 p-3" data-ky-admin-filter-row data-department="${escHtml(department)}" data-status="deleted" data-search="${escHtml([department,row.SafetyUnit,row.ActivityID,row.OriginalFileName,row.ExternalReference].filter(Boolean).join(' ').toLowerCase())}"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><p class="text-xs font-bold text-slate-800">${escHtml(department)} · ${escHtml(row.SafetyUnit||'Department')}</p><span class="rounded-full bg-rose-100 px-2 py-1 text-[9px] font-bold text-rose-700">Production removed</span></div><p class="mt-1 truncate text-[10px] text-slate-500">${escHtml(row.OriginalFileName||row.ActivityID||id)} · ${formatFileSize(row.FileSize||0)}</p><p class="mt-1 text-[10px] text-slate-400">Removed ${escHtml(row.ProductionDeletedAt||'-')} · SHA ${escHtml(String(row.SHA256||'').slice(0,16))}…</p></div><div class="flex gap-1"><button type="button" ${isAnnual?`data-ky-annual-detail="${escHtml(id)}"`:`data-ky-inventory-detail="${escHtml(id)}"`} class="rounded-lg border px-2 py-1 text-[10px] font-bold text-slate-600">Detail</button><button type="button" ${isAnnual?`data-ky-annual-audit="${escHtml(id)}"`:`data-ky-inventory-audit="${escHtml(id)}"`} class="rounded-lg border px-2 py-1 text-[10px] font-bold text-slate-600">Audit</button></div></div></div>`;
            }).join('') : '<p class="col-span-full py-6 text-center text-xs text-slate-400">ยังไม่มีประวัติการลบไฟล์ Production</p>'}</div>
        </section>
    </div>`;
}

function kyAnnualRowStatus(row, kind = 'annual') {
    if (row.fileDeleted) return 'deleted';
    if (row.canDeleteProductionFile) return 'ready';
    if (kind === 'inventory' && !row.registered) return 'missing';
    if (row.Status === 'Verified' || row.compliant) return 'verified';
    if (row.Status === 'Pending' || row.Status === 'NeedsCorrection' || row.evidence) return 'pending';
    return 'missing';
}

function applyKyAnnualAdminView(panel) {
    panel.querySelectorAll('[data-ky-annual-view-panel]').forEach(section => {
        section.classList.toggle('hidden', section.dataset.kyAnnualViewPanel !== _kyAnnualAdminView);
    });
    panel.querySelectorAll('[data-ky-annual-view]').forEach(button => {
        const active = button.dataset.kyAnnualView === _kyAnnualAdminView;
        button.classList.toggle('bg-emerald-700', active);
        button.classList.toggle('text-white', active);
        button.classList.toggle('border', !active);
        button.classList.toggle('border-slate-200', !active);
        button.classList.toggle('bg-white', !active);
        button.classList.toggle('text-slate-600', !active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function filterKyAnnualAdminWorkspace(panel = document.getElementById('ky-manage-panel')) {
    if (!panel) return;
    const search = String(_kyAnnualAdminFilters.search || '').trim().toLowerCase();
    const department = String(_kyAnnualAdminFilters.department || 'all');
    const status = String(_kyAnnualAdminFilters.status || 'all');
    let visible = 0;
    panel.querySelectorAll('[data-ky-admin-filter-row]').forEach(row => {
        const rowStatus = String(row.dataset.status || '');
        const statusMatch = status === 'all'
            || (status === 'action' && ['missing', 'pending', 'ready'].includes(rowStatus))
            || (status === 'missing' && ['missing', 'unregistered'].includes(rowStatus))
            || status === rowStatus;
        const departmentMatch = department === 'all' || row.dataset.department === department;
        const searchMatch = !search || String(row.dataset.search || row.textContent || '').toLowerCase().includes(search);
        const show = statusMatch && departmentMatch && searchMatch;
        row.classList.toggle('hidden', !show);
        if (show) visible += 1;
    });
    const result = panel.querySelector('[data-ky-filter-result]');
    if (result) result.textContent = `${visible} รายการที่ตรงตัวกรอง`;
}

function configureKyAnnualAdminWorkspace(panel, { scopes = [], evidence = [], inventory = [], annualCandidates = [] } = {}) {
    const summary = panel.querySelector('[data-ky-annual-summary]');
    const overviewPanel = summary?.nextElementSibling;
    const annualTable = panel.querySelector('[data-ky-annual-evidence-row], [data-ky-annual-check-all]')?.closest('.ds-section');
    const candidatePanel = panel.querySelector('[data-ky-annual-register-production]')?.closest('.ds-section');
    const inventoryPanel = panel.querySelector('[data-ky-video-inventory]');
    if (overviewPanel) overviewPanel.dataset.kyAnnualViewPanel = 'overview';
    if (annualTable) annualTable.dataset.kyAnnualViewPanel = 'annual';
    if (candidatePanel) candidatePanel.dataset.kyAnnualViewPanel = 'annual';
    if (inventoryPanel) inventoryPanel.dataset.kyAnnualViewPanel = 'inventory';

    const scopeCards = overviewPanel ? Array.from(overviewPanel.querySelectorAll('.grid > div')) : [];
    scopeCards.forEach((card, index) => {
        const row = scopes[index];
        if (!row) return;
        const department = String(row.department || '');
        card.dataset.kyAdminFilterRow = '';
        card.dataset.department = department;
        card.dataset.status = kyAnnualRowStatus(row);
        card.dataset.search = [department, row.safetyUnit].filter(Boolean).join(' ').toLowerCase();
    });
    annualTable?.querySelectorAll('[data-ky-annual-evidence-row]').forEach(rowElement => {
        const row = evidence.find(item => String(item.id) === rowElement.dataset.kyAnnualEvidenceRow);
        if (!row) return;
        rowElement.dataset.kyAdminFilterRow = '';
        rowElement.dataset.department = String(row.Department || '');
        rowElement.dataset.status = kyAnnualRowStatus(row);
        rowElement.dataset.search = [row.Department, row.SafetyUnit, row.ActivityID, row.OriginalFileName, row.ExternalReference].filter(Boolean).join(' ').toLowerCase();
        const actions = rowElement.querySelector('td:last-child > div');
        if (actions && !actions.querySelector('[data-ky-annual-detail]')) actions.insertAdjacentHTML('afterbegin', `<button type="button" data-ky-annual-detail="${escHtml(row.id)}" class="rounded-lg border px-2 py-1 text-[10px] font-bold text-slate-600">Detail</button>`);
    });
    candidatePanel?.querySelectorAll('[data-ky-annual-register-production]').forEach(button => {
        const row = annualCandidates.find(item => String(item.id) === button.dataset.kyAnnualRegisterProduction);
        const card = button.closest('.rounded-xl');
        if (!row || !card) return;
        card.dataset.kyAdminFilterRow = '';
        card.dataset.department = String(row.Department || '');
        card.dataset.status = 'missing';
        card.dataset.search = [row.Department, row.SafetyUnit, row.TeamName, row.KYTKeyword, row.id].filter(Boolean).join(' ').toLowerCase();
    });
    inventoryPanel?.querySelectorAll('[data-ky-inventory-row]').forEach(rowElement => {
        const row = inventory.find(item => String(item.id) === String(rowElement.querySelector('[data-ky-inventory-select]')?.value || ''))
            || inventory.find(item => String(item.ActivityID) === String(rowElement.querySelector('[data-ky-inventory-register]')?.dataset.kyInventoryRegister || ''));
        if (!row) return;
        rowElement.dataset.kyAdminFilterRow = '';
        rowElement.dataset.department = String(row.Department || '');
        rowElement.dataset.status = kyAnnualRowStatus(row, 'inventory');
        const actions = rowElement.querySelector('.flex.flex-wrap.justify-end');
        const detailId = row.id || row.ActivityID;
        if (actions && detailId && !actions.querySelector('[data-ky-inventory-detail]')) actions.insertAdjacentHTML('afterbegin', `<button type="button" data-ky-inventory-detail="${escHtml(detailId)}" class="rounded-lg border px-2 py-1 text-[10px] font-bold text-slate-600">Detail</button>`);
    });

    // Destructive controls live only in the guarded Cleanup workspace.
    annualTable?.querySelectorAll('[data-ky-annual-select], [data-ky-annual-check-all], [data-ky-annual-delete-selected], [data-ky-annual-delete-one]').forEach(control => (control.closest('th,td') || control).classList.add('hidden'));
    inventoryPanel?.querySelectorAll('[data-ky-inventory-select], [data-ky-inventory-delete-selected], [data-ky-inventory-delete-one]').forEach(control => control.classList.add('hidden'));

    const summaryActions = [
        { view: 'annual', status: 'all' }, { view: 'annual', status: 'verified' }, { view: 'annual', status: 'pending' },
        { view: 'annual', status: 'missing' }, { view: 'overview', status: 'action' }, { view: 'cleanup', status: 'ready' },
    ];
    Array.from(summary?.children || []).forEach((card, index) => {
        const action = summaryActions[index];
        if (!action) return;
        card.classList.add('cursor-pointer', 'transition', 'hover:ring-2', 'hover:ring-emerald-200');
        card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0');
        const activate = () => {
            _kyAnnualAdminView = action.view; _kyAnnualAdminFilters.status = action.status;
            const select = panel.querySelector('[data-ky-annual-admin-status]'); if (select) select.value = action.status;
            applyKyAnnualAdminView(panel); filterKyAnnualAdminWorkspace(panel);
        };
        card.addEventListener('click', activate);
        card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } });
    });
    panel.querySelectorAll('[data-ky-annual-view]').forEach(button => button.addEventListener('click', () => {
        _kyAnnualAdminView = button.dataset.kyAnnualView || 'overview';
        applyKyAnnualAdminView(panel); filterKyAnnualAdminWorkspace(panel);
    }));
    applyKyAnnualAdminView(panel);
    filterKyAnnualAdminWorkspace(panel);
}

function showKyVideoEvidenceDetail(kind, id) {
    const rows = kind === 'annual' ? (_kyAnnualVideoData?.evidence || []) : (_kyAnnualVideoData?.inventory || []);
    const row = rows.find(item => String(item.id) === String(id) || String(item.ActivityID) === String(id));
    if (!row) return;
    const field = (label, value, mono = false) => `<div class="rounded-xl border border-slate-200 p-3"><p class="text-[10px] font-bold uppercase text-slate-400">${label}</p><p class="mt-1 break-all text-xs font-semibold text-slate-700 ${mono ? 'font-mono' : ''}">${escHtml(value == null || value === '' ? '-' : String(value))}</p></div>`;
    openModal(kind === 'annual' ? 'Annual Evidence Detail Drawer' : 'Production Inventory Detail Drawer', `<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        ${field('Department', row.Department)}${field('Safety Unit', row.SafetyUnit || 'Department')}${field('Activity date', formatKyActivityDate(row.ActivityDate))}${field('Activity month', formatKyActivityMonth(row.ActivityDate))}${field('Activity ID', row.ActivityID, true)}${field('Status', row.Status)}
        ${field('Storage mode', row.StorageMode || (row.registered ? 'CentralMachine' : 'Production'))}${field('Production state', row.fileDeleted ? 'Removed' : 'Present')}
        ${field('File name', row.OriginalFileName)}${field('File size', formatFileSize(row.FileSize || 0))}
        <div class="sm:col-span-2">${field('External reference', row.ExternalReference)}</div><div class="sm:col-span-2">${field('SHA-256', row.SHA256, true)}</div>
        ${field('Verified by', row.VerifiedByName || row.VerifiedBy)}${field('Verified at', row.VerifiedAt)}${field('Removed by', row.FileDeletedByName || row.FileDeletedBy)}${field('Removed at', row.FileDeletedAt)}
    </div>`, 'max-w-xl ml-auto mr-0 h-full !max-h-screen !rounded-none');
}

async function downloadKyAnnualVideo(id, filename) {
    const response = await apiFetch(`/ky/annual-video-evidence/${encodeURIComponent(id)}/download`);
    if (!(response instanceof Response) || !response.ok) throw new Error('ดาวน์โหลดวิดีโอไม่สำเร็จ');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');link.href=url;link.download=filename||'ky-video';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function showKyAnnualAudit(id) {
    const response = await API.get(`/ky/annual-video-evidence/${encodeURIComponent(id)}/audit`);
    const rows = normalizeApiArray(response?.data ?? response);
    openModal('Annual Video Evidence Audit', `<div class="space-y-2 max-h-[60vh] overflow-y-auto">${rows.length?rows.map(row=>`<div class="rounded-xl border border-slate-200 p-3"><div class="flex justify-between gap-3"><p class="text-xs font-bold text-slate-800">${escHtml(row.Action||'-')}</p><p class="text-[10px] text-slate-400">${escHtml(row.CreatedAt||'')}</p></div><p class="text-xs text-slate-500 mt-1">${escHtml(row.ActorName||row.ActorID||'-')} · ${escHtml(row.Detail||'')}</p></div>`).join(''):'<p class="text-sm text-slate-400">ยังไม่มี Audit</p>'}</div>`, 'max-w-2xl');
}

async function downloadKyInventoryVideo(id, filename) {
    const response = await apiFetch(`/ky/video-inventory/${encodeURIComponent(id)}/download`);
    if (!(response instanceof Response) || !response.ok) throw new Error('ดาวน์โหลดวิดีโอ Inventory ไม่สำเร็จ');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');link.href=url;link.download=filename||'ky-video';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function showKyInventoryAudit(id) {
    const response = await API.get(`/ky/video-inventory/${encodeURIComponent(id)}/audit`);
    const rows = normalizeApiArray(response?.data ?? response);
    openModal('Production Video Inventory Audit', `<div class="space-y-2 max-h-[60vh] overflow-y-auto">${rows.length?rows.map(row=>`<div class="rounded-xl border border-slate-200 p-3"><div class="flex justify-between gap-3"><p class="text-xs font-bold text-slate-800">${escHtml(row.Action||'-')}</p><p class="text-[10px] text-slate-400">${escHtml(row.CreatedAt||'')}</p></div><p class="text-xs text-slate-500 mt-1">${escHtml(row.ActorName||row.ActorID||'-')} · ${escHtml(row.Detail||'')}</p></div>`).join(''):'<p class="text-sm text-slate-400">ยังไม่มี Audit</p>'}</div>`, 'max-w-2xl');
}

function buildKyInventoryBackupReference(file) {
    const safeName = String(file?.name || 'video')
        .replace(/[\\/]+/g, '_')
        .trim() || 'video';
    return `${KY_EXTERNAL_BACKUP_ROOT}\\${safeName}`;
}

function kyInventoryRegistrationError(error) {
    const code = String(error?.code || '');
    if (code === 'KY_VIDEO_INVENTORY_BACKUP_MISMATCH') {
        return new Error('ไฟล์ที่เลือกไม่ตรงกับวิดีโอ Production (ขนาดหรือ SHA-256 ไม่ตรงกัน) กรุณาเลือกไฟล์สำเนาต้นฉบับที่ยังไม่ถูกตัดต่อ บีบอัด หรือแปลงไฟล์');
    }
    if (code === 'KY_VIDEO_INVENTORY_PRODUCTION_REQUIRED') {
        return new Error('ไม่พบไฟล์วิดีโอ Production ที่อ่านได้สำหรับกิจกรรมนี้ กรุณาตรวจสอบไฟล์ต้นทางก่อนลงทะเบียน');
    }
    return error instanceof Error
        ? error
        : new Error(error?.message || 'ลงทะเบียน External Backup ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
}

function setKyInventoryRegistrationStatus(activityId, state, message) {
    const status = Array.from(document.querySelectorAll('[data-ky-inventory-registration-status]'))
        .find(element => String(element.dataset.kyInventoryRegistrationStatus || '') === String(activityId || ''));
    if (!status) return;
    const colors = {
        progress: 'text-indigo-700 bg-indigo-50 border-indigo-100',
        success: 'text-emerald-700 bg-emerald-50 border-emerald-100',
        error: 'text-rose-700 bg-rose-50 border-rose-100',
        neutral: 'text-slate-600 bg-slate-50 border-slate-100',
    };
    status.className = `mt-2 rounded-lg border px-2 py-1.5 text-[10px] font-semibold ${colors[state] || colors.neutral}`;
    status.textContent = String(message || '');
    status.hidden = !message;
}

function filterKyVideoInventory() {
    const search = String(document.querySelector('[data-ky-inventory-search]')?.value || '').trim().toLowerCase();
    const status = String(document.querySelector('[data-ky-inventory-filter]')?.value || 'all');
    document.querySelectorAll('[data-ky-inventory-row]').forEach(row => {
        const matchesSearch = !search || String(row.dataset.search || '').includes(search);
        const matchesStatus = status === 'all' || row.dataset.status === status;
        row.classList.toggle('hidden', !(matchesSearch && matchesStatus));
    });
}

function focusKyAnnualEvidenceRow(evidenceId) {
    const target = Array.from(document.querySelectorAll('[data-ky-annual-evidence-row]'))
        .find(row => String(row.dataset.kyAnnualEvidenceRow || '') === String(evidenceId || ''));
    if (!target) return false;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('ring-2', 'ring-emerald-400', 'bg-emerald-50');
    window.setTimeout(() => target.classList.remove('ring-2', 'ring-emerald-400', 'bg-emerald-50'), 2400);
    return true;
}

function renderManageConfig(wrap) {
    if (!wrap) wrap = document.getElementById('ky-manage-panel');
    if (!wrap) return;

    const configs = _kyProgConfig;
    const activeConfigs = configs.filter(cfg => cfg.IsActive);
    const targetTotal = activeConfigs.reduce((sum, cfg) => sum + Number(cfg.YearlyTarget || 12), 0);
    const unitLinked = activeConfigs.filter(cfg => {
        try { return JSON.parse(cfg.SafetyUnits || '[]').length > 0; } catch { return false; }
    }).length;

    wrap.innerHTML = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
                ${manageMetric('ส่วนงานทั้งหมด', configs.length, '#6366f1', `ปี ${_filterMgmtYear}`)}
                ${manageMetric('เปิดใช้งาน', activeConfigs.length, '#10b981', `${configs.length - activeConfigs.length} ปิดใช้งาน`)}
                ${manageMetric('เป้าหมายรวม', targetTotal, '#0284c7', 'ครั้งต่อปีจากรายการ Active')}
                ${manageMetric('ผูก Safety Unit', unitLinked, '#f59e0b', `จาก ${activeConfigs.length || 0} ส่วนงาน Active`)}
            </div>

            <div class="ds-table-wrap p-5">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">โปรแกรม KY ปี ${_filterMgmtYear}</h3>
                        <p class="text-xs text-slate-400 mt-0.5">กำหนดแผนก/ส่วนงานที่ต้องเข้าร่วม เป้าหมาย/ปี และวันกำหนดส่ง</p>
                    </div>
                    <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">${configs.length} ส่วนงาน</span>
                </div>
                ${configs.length ? `
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-3 py-2.5 text-left">แผนก</th>
                                <th class="px-3 py-2.5 text-left">Safety Units</th>
                                <th class="px-3 py-2.5 text-center">เป้าหมาย/ปี</th>
                                <th class="px-3 py-2.5 text-center">กำหนดส่ง</th>
                                <th class="px-3 py-2.5 text-center">สถานะ</th>
                                <th class="px-3 py-2.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${configs.map(cfg => {
                                let units = [];
                                try { units = JSON.parse(cfg.SafetyUnits || '[]'); } catch { units = []; }
                                return `
                                <tr class="hover:bg-slate-50 transition-colors">
                                    <td class="px-3 py-3 font-semibold text-slate-700">${escHtml(cfg.Department || '')}</td>
                                    <td class="px-3 py-3 text-xs text-slate-500">
                                        ${units.length ? units.map(u => `<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 mr-1">${escHtml(u)}</span>`).join('') : '<span class="text-slate-300">—</span>'}
                                    </td>
                                    <td class="px-3 py-3 text-center">
                                        <span class="font-bold text-indigo-600">${cfg.YearlyTarget || 12}</span>
                                        <span class="text-xs text-slate-400 ml-0.5">ครั้ง</span>
                                    </td>
                                    <td class="px-3 py-3 text-center text-xs text-slate-600">
                                        ${cfg.DeadlineDay ? `วันที่ ${cfg.DeadlineDay}` : '—'}
                                        ${cfg.DeadlineNote ? `<div class="text-slate-400">${escHtml(cfg.DeadlineNote)}</div>` : ''}
                                    </td>
                                    <td class="px-3 py-3 text-center">
                                        <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.IsActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                                            ${cfg.IsActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td class="px-3 py-3 text-right">
                                        <div class="flex items-center justify-end gap-1">
                                            <button class="btn-ky-cfg-edit px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                                                    data-id="${cfg.id}">แก้ไข</button>
                                            <button class="btn-ky-cfg-del p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                                    data-id="${cfg.id}" data-dept="${escHtml(cfg.Department || '')}">
                                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>` : `
                <div class="text-center py-12 text-slate-400">
                    <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                        <svg class="w-7 h-7 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                        </svg>
                    </div>
                    <p class="font-medium text-sm">ยังไม่มีการตั้งค่าโปรแกรม KY สำหรับปี ${_filterMgmtYear}</p>
                    <p class="text-xs mt-1">คลิก "เพิ่มส่วนงาน" เพื่อเริ่มกำหนดแผนกที่ต้องเข้าร่วม</p>
                </div>`}
            </div>

            <!-- Info card -->
            <div class="ds-section p-4 border-l-4 border-l-indigo-400 flex items-start gap-3">
                <svg class="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div class="text-xs text-slate-600">
                    <p class="font-semibold text-slate-700 mb-0.5">การตั้งค่าโปรแกรมมีผลอย่างไร</p>
                    <p>แผนกที่ตั้งค่าไว้จะปรากฏใน Dashboard และแผนภาพ Coverage — ระบบจะนับเฉพาะแผนกในโปรแกรมเพื่อคำนวณ Completion Rate, เปอร์เซ็นต์ความครอบคลุม และตัวเลขนำเสนอผู้บริหาร</p>
                </div>
            </div>

        </div>`;
}

function renderManageForms(wrap) {
    if (!wrap) wrap = document.getElementById('ky-manage-panel');
    if (!wrap) return;

    wrap.innerHTML = `
        <div class="space-y-4">
            <div class="ds-section p-4 border-l-4 border-l-indigo-400">
                <p class="text-xs font-bold text-indigo-700 uppercase">Forms Library</p>
                <h3 class="text-sm font-bold text-slate-800 mt-1">แบบฟอร์มที่เกี่ยวข้องกับ KY</h3>
                <p class="text-xs text-slate-500 mt-1">จัดการไฟล์ที่ผู้ใช้ต้องดาวน์โหลดหรือใช้ประกอบการส่งกิจกรรม KY โดยแยกออกจาก Program Config เพื่อให้ Admin หาเอกสารได้เร็วขึ้น</p>
            </div>
            <div class="ds-table-wrap p-5">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">รายการแบบฟอร์ม</h3>
                        <p class="text-xs text-slate-400 mt-0.5">เปิด/ปิดใช้งานหรือลบเอกสารที่ไม่ต้องใช้แล้ว</p>
                    </div>
                    ${_isAdmin ? `
                    <button id="btn-add-ky-form"
                        class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                        style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        เพิ่มแบบฟอร์ม
                    </button>` : ''}
                </div>
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">ชื่อแบบฟอร์ม</th>
                                <th class="px-4 py-3">เวอร์ชั่น</th>
                                <th class="px-4 py-3">ประเภท</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3">วันที่อัปโหลด</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="ky-forms-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="6" class="text-center py-6 text-slate-400">
                                <div class="animate-spin inline-block h-5 w-5 border-4 border-indigo-400 border-t-transparent rounded-full mb-1.5"></div>
                                <div class="text-sm">กำลังโหลด...</div>
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
}

async function openAddConfigModal(existingCfg = null) {
    await Promise.all([_fetchDepartments(), _fetchSafetyUnits()]);

    const isEdit = !!existingCfg;
    let existingUnits = [];
    if (existingCfg?.SafetyUnits) {
        try { existingUnits = JSON.parse(existingCfg.SafetyUnits); } catch { existingUnits = []; }
    }

    // Departments not yet configured (for add mode)
    const usedDepts = isEdit ? [] : _kyProgConfig.map(c => c.Department);
    const availDepts = isEdit ? _departments : _departments.filter(d => !usedDepts.includes(d));

    // Safety units grouped by department
    const unitsByDept = {};
    _safetyUnits.forEach(u => {
        const dName = (u.DeptName || '').trim();
        if (!unitsByDept[dName]) unitsByDept[dName] = [];
        unitsByDept[dName].push(u);
    });

    const html = `
        <form id="ky-cfg-form" class="space-y-4">
            <input type="hidden" name="cfgId" value="${existingCfg?.id || ''}">

            ${isEdit ? `
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1">แผนก</label>
                <input type="text" class="form-input w-full bg-slate-50" value="${escHtml(existingCfg.Department || '')}" readonly>
                <input type="hidden" name="departments[]" value="${escHtml(existingCfg.Department || '')}">
            </div>` : `
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เลือกแผนก <span class="text-red-500">*</span>
                    <span class="text-xs font-normal text-slate-400 ml-1">(เลือกได้หลายแผนก)</span>
                </label>
                <div class="border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                    ${availDepts.length ? availDepts.map(d => `
                    <label class="flex items-center gap-2.5 p-2 rounded-lg hover:bg-indigo-50 cursor-pointer transition-colors">
                        <input type="checkbox" name="departments[]" value="${escHtml(d)}" class="rounded text-indigo-600 w-4 h-4">
                        <span class="text-sm text-slate-700">${escHtml(d)}</span>
                    </label>`).join('') : `<p class="text-xs text-slate-400 text-center py-4">ทุกแผนกได้รับการตั้งค่าแล้วสำหรับปีนี้</p>`}
                </div>
            </div>`}

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">เป้าหมาย/ปี (ครั้ง)</label>
                    <input type="number" name="YearlyTarget" class="form-input w-full" min="1" max="52"
                           value="${existingCfg?.YearlyTarget || 12}" required>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันกำหนดส่ง (วันที่ในเดือน)</label>
                    <input type="number" name="DeadlineDay" class="form-input w-full" min="1" max="31"
                           placeholder="เช่น 15" value="${existingCfg?.DeadlineDay || ''}">
                </div>
            </div>

            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุกำหนดส่ง</label>
                <input type="text" name="DeadlineNote" class="form-input w-full"
                       placeholder="เช่น ก่อนวันที่ 15 ของทุกเดือน"
                       value="${escHtml(existingCfg?.DeadlineNote || '')}">
            </div>

            ${_safetyUnits.length ? `
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Safety Units ที่เกี่ยวข้อง
                    <span class="text-xs font-normal text-slate-400 ml-1">(เลือกได้หลายหน่วย)</span>
                </label>
                <div class="border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
                    ${_safetyUnits.map(u => `
                    <label class="flex items-center gap-2.5 p-2 rounded-lg hover:bg-indigo-50 cursor-pointer transition-colors">
                        <input type="checkbox" name="SafetyUnits[]" value="${escHtml(u.name || u.short_code || '')}"
                               class="rounded text-indigo-600 w-4 h-4"
                               ${existingUnits.includes(u.name || u.short_code || '') ? 'checked' : ''}>
                        <span class="text-sm text-slate-700">${escHtml(u.name || '')}</span>
                        ${u.DeptName ? `<span class="text-xs text-slate-400">(${escHtml(u.DeptName)})</span>` : ''}
                    </label>`).join('')}
                </div>
            </div>` : ''}

            ${isEdit ? `
            <div class="flex items-center gap-2">
                <input type="checkbox" name="IsActive" id="cfg-is-active" value="1" class="rounded text-indigo-600 w-4 h-4"
                       ${existingCfg.IsActive ? 'checked' : ''}>
                <label for="cfg-is-active" class="text-sm text-slate-700">Active (เปิดใช้งาน)</label>
            </div>` : ''}

            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200"
                        onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
                <button type="submit" class="px-5 py-2 rounded-lg text-sm font-semibold text-white"
                        style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มส่วนงาน'}</button>
            </div>
        </form>`;

    openModal(isEdit ? `แก้ไขโปรแกรม KY — ${existingCfg.Department}` : `เพิ่มส่วนงานในโปรแกรม KY ปี ${_filterMgmtYear}`, html, 'max-w-xl');

    document.getElementById('ky-cfg-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);

        const departments = fd.getAll('departments[]').filter(Boolean);
        if (!departments.length) { showToast('กรุณาเลือกอย่างน้อย 1 แผนก', 'warning'); return; }

        const safetyUnits = fd.getAll('SafetyUnits[]').filter(Boolean);
        const payload = {
            Year:         _filterMgmtYear,
            YearlyTarget: parseInt(fd.get('YearlyTarget') || '12', 10),
            DeadlineDay:  fd.get('DeadlineDay') ? parseInt(fd.get('DeadlineDay'), 10) : null,
            DeadlineNote: fd.get('DeadlineNote') || null,
            SafetyUnits:  safetyUnits.length ? JSON.stringify(safetyUnits) : null,
            IsActive:     isEdit ? (fd.get('IsActive') === '1' ? 1 : 0) : 1,
        };

        try {
            showLoading('กำลังบันทึก...');
            if (isEdit) {
                await API.put(`/ky/program-config/${existingCfg.id}`, {
                    safetyUnits:  safetyUnits.length ? safetyUnits : null,
                    yearlyTarget: payload.YearlyTarget,
                    deadlineDay:  payload.DeadlineDay,
                    deadlineNote: payload.DeadlineNote,
                    isActive:     payload.IsActive,
                });
                showToast('แก้ไขโปรแกรม KY สำเร็จ', 'success');
            } else {
                await API.post('/ky/program-config', {
                    year: _filterMgmtYear,
                    entries: departments.map(dept => ({
                        department:   dept,
                        safetyUnits:  safetyUnits.length ? safetyUnits : null,
                        yearlyTarget: payload.YearlyTarget,
                        deadlineDay:  payload.DeadlineDay,
                        deadlineNote: payload.DeadlineNote,
                    })),
                });
                showToast(`เพิ่ม ${departments.length} ส่วนงาน สำเร็จ`, 'success');
            }
            closeModal();
            await _fetchProgramConfig(_filterMgmtYear);
            renderManageConfig();
        } catch (err) {
            showError(err);
        } finally {
            hideLoading();
        }
    }));
}

async function fetchAndRenderManage(statusFilter) {
    const wrap = document.getElementById('ky-manage-panel');
    if (!wrap) return;
    try {
        const params = new URLSearchParams();
        if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
        if (_filterMgmtYear)           params.set('year', _filterMgmtYear);
        if (_filterMgmtDept !== 'all') params.set('dept', _filterMgmtDept);
        if (_filterMgmtRisk !== 'all') params.set('risk', _filterMgmtRisk);
        const [recordsRes, reminderRes, outboxRes, fileHealthRes] = await Promise.all([
            API.get(`/ky?${params}`),
            _isAdmin
                ? API.get(`/ky/reminder-queue?year=${_filterMgmtYear}`).catch(() => ({ data: null }))
                : Promise.resolve({ data: null }),
            _isAdmin
                ? API.get('/ky/email-outbox?limit=30').catch(() => ({ data: [] }))
                : Promise.resolve({ data: [] }),
            _isAdmin
                ? API.get(`/ky/file-health?year=${_filterMgmtYear}`).catch(err => ({ data: null, error: err?.message || 'Unable to load KY media health' }))
                : Promise.resolve({ data: null }),
        ]);
        const records = normalizeApiArray(recordsRes?.data ?? recordsRes);
        const reminderData = normalizeApiObject(reminderRes?.data ?? reminderRes);
        const outboxData = normalizeApiObject(outboxRes);
        const fileHealthData = normalizeApiObject(fileHealthRes?.data ?? fileHealthRes);

        renderManageOverview(records, reminderData, outboxData, fileHealthData);
    } catch (err) {
        if (wrap) wrap.innerHTML = `<div class="ds-empty-state p-6 text-center text-red-500 text-sm">${escHtml(err.message)}</div>`;
    }
}

function renderManageOverview(records, reminderData = null, outboxData = null, fileHealthData = null) {
    const wrap = document.getElementById('ky-manage-panel');
    if (!wrap) return;

    const total = records.length;
    const open = records.filter(r => r.Status === 'Open');
    const reviewed = records.filter(r => r.Status === 'Reviewed');
    const closed = records.filter(r => r.Status === 'Closed');
    const submittedDepts = new Set(records.map(r => r.Department).filter(Boolean));
    // Prefer program-config depts if configured; fall back to master
    const activeConfig = _kyProgConfig.filter(c => c.IsActive);
    const configDepts  = activeConfig.map(c => c.Department);
    const baseDepts    = configDepts.length ? configDepts : _departments;
    const scopedDepts  = _filterMgmtDept !== 'all' ? [_filterMgmtDept] : baseDepts;
    const pendingDepts = scopedDepts.filter(d => !submittedDepts.has(d));
    const completion   = scopedDepts.length ? Math.round((submittedDepts.size / scopedDepts.length) * 100) : 0;
    const closeRate    = total ? Math.round((closed.length / total) * 100) : 0;

    // Build yearly target progress per dept (from config + records for selected year)
    const yearlyProgMap = {};
    activeConfig.forEach(cfg => {
        const units = parseKySafetyUnits(cfg.SafetyUnits);
        const unitTarget = Number(cfg.YearlyTarget || 12);
        yearlyProgMap[cfg.Department] = {
            target: (units.length || 1) * unitTarget,
            submitted: 0,
            units,
            unitTarget,
            unitSubmitted: {},
        };
    });
    records.forEach(r => {
        if (!yearlyProgMap[r.Department]) return;
        yearlyProgMap[r.Department].submitted++;
        const unit = String(r.SafetyUnit || '').trim();
        if (unit) yearlyProgMap[r.Department].unitSubmitted[unit] = (yearlyProgMap[r.Department].unitSubmitted[unit] || 0) + 1;
    });

    const byDept = scopedDepts.map(dept => {
        const deptRecords = records.filter(r => r.Department === dept);
        const prog = yearlyProgMap[dept] || null;
        return {
            dept,
            total: deptRecords.length,
            open: deptRecords.filter(r => r.Status === 'Open').length,
            reviewed: deptRecords.filter(r => r.Status === 'Reviewed').length,
            closed: deptRecords.filter(r => r.Status === 'Closed').length,
            yearlySubmitted: prog?.submitted ?? deptRecords.length,
            yearlyTarget:    prog?.target    ?? null,
            unitTarget:      prog?.unitTarget ?? null,
            safetyUnits:     prog?.units || [],
            unitSubmitted:   prog?.unitSubmitted || {},
        };
    }).sort((a, b) => {
        // Sort: most behind on yearly target first, then by open count
        const aPct = a.yearlyTarget ? a.yearlySubmitted / a.yearlyTarget : 1;
        const bPct = b.yearlyTarget ? b.yearlySubmitted / b.yearlyTarget : 1;
        return aPct - bPct || b.open - a.open || a.dept.localeCompare(b.dept);
    });
    const actionQueue = [...open, ...reviewed].slice(0, 8);
    const onBehalfCount = records.filter(isKySubmittedOnBehalf).length;
    const scopeLabel = configDepts.length
        ? `${scopedDepts.length} ส่วนงานใน Program Config`
        : `${scopedDepts.length} แผนกจาก Master`;
    const pendingPreview = pendingDepts.slice(0, 6);
    const pendingMore = Math.max(0, pendingDepts.length - pendingPreview.length);
    const actionPanel = `
        <div class="ds-section p-5 h-full" data-ky-card-image="ky-manage-follow-up">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                    <h3 class="text-sm font-bold text-slate-700">Follow-up Queue</h3>
                    <p class="text-xs text-slate-400 mt-0.5">รายการ Open และ Reviewed ที่ต้องตรวจหรือปิดงานต่อ</p>
                </div>
                <span class="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">${actionQueue.length} รายการ</span>
            </div>
            <div class="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                ${actionQueue.length ? actionQueue.map(r => manageActionItem(r)).join('') : `<div class="rounded-xl bg-emerald-50 border border-emerald-100 p-5 text-sm font-semibold text-emerald-700">ไม่มีรายการค้างจัดการ</div>`}
            </div>
        </div>`;

    const reminderPanel = _isAdmin ? renderKyReminderQueuePanel(reminderData) : '';
    const emailPanel = _isAdmin ? renderKyEmailOutboxPanel(outboxData) : '';
    const fileHealthPanel = _isAdmin ? renderKyFileHealthPanel(fileHealthData) : '';

    wrap.innerHTML = `
        <div class="space-y-5">
            <div class="ds-section p-5 border-l-4 border-l-indigo-400">
                <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div>
                        <p class="text-xs font-bold text-indigo-700 uppercase">Coverage & Follow-up</p>
                        <h3 class="text-base font-bold text-slate-800 mt-1">ติดตามการส่ง KY และคิวตรวจงาน · ปี ${_filterMgmtYear}</h3>
                        <p class="text-xs text-slate-500 mt-1">${scopeLabel}${_filterMgmtRisk !== 'all' ? ` · กรองประเภทความเสี่ยง: ${escHtml(_filterMgmtRisk)}` : ''}</p>
                    </div>
                    <div class="flex flex-col sm:flex-row gap-2">
                        <span class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600">${onBehalfCount} รายการ Admin ส่งแทน</span>
                        <button type="button" data-ky-open-history
                                class="px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition-colors">
                            เปิดประวัติ KY
                        </button>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 xl:grid-cols-5 gap-4">
                ${manageMetric('ทั้งหมด', total, '#6366f1', 'รายการในปี/ตัวกรองนี้')}
                ${manageMetric('รอตรวจสอบ', open.length, '#0284c7', 'ต้อง review')}
                ${manageMetric('ตรวจสอบแล้ว', reviewed.length, '#f59e0b', 'รอปิดหรือ follow-up')}
                ${manageMetric('ปิดแล้ว', closed.length, '#10b981', `${closeRate}% close rate`)}
                ${manageMetric('Coverage', `${submittedDepts.size}/${scopedDepts.length || 0}`, '#0f766e', `${completion}% department coverage`)}
            </div>

            ${reminderPanel}
            ${fileHealthPanel}
            ${emailPanel}

            <div class="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)] gap-5">
                <div class="ds-section p-5" data-ky-card-image="ky-manage-safety-unit-coverage">
                    <div class="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-5">
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">Safety Unit Coverage</h3>
                            <p class="text-xs text-slate-400 mt-0.5">สถานะการส่งและการปิดงานเทียบเป้าหมายรายปี โดยนับจาก Safety Unit ที่ Admin ตั้งค่า</p>
                        </div>
                        <div class="flex flex-wrap items-center gap-1.5 text-xs">
                            <span class="font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">${completion}% coverage</span>
                            ${pendingDepts.length ? `<span class="font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">${pendingDepts.length} pending</span>` : ''}
                        </div>
                    </div>
                    ${pendingDepts.length ? `
                    <div class="mb-5 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5">
                        <div class="flex flex-col lg:flex-row lg:items-center gap-2">
                            <p class="text-xs font-bold text-amber-700 shrink-0">ยังไม่ส่งในช่วงที่เลือก</p>
                            <div class="flex flex-wrap gap-1.5">
                                ${pendingPreview.map(d => `<span class="px-2 py-0.5 rounded-md bg-white text-amber-700 border border-amber-100 text-[11px] font-semibold">${escHtml(d)}</span>`).join('')}
                                ${pendingMore ? `<span class="px-2 py-0.5 rounded-md bg-white text-amber-700 border border-amber-100 text-[11px] font-semibold">+${pendingMore} แผนก</span>` : ''}
                            </div>
                        </div>
                    </div>` : ''}
                    <div class="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                        ${byDept.length ? byDept.map(d => deptProgressRow(d)).join('') : `<div class="text-center py-8 text-sm text-slate-400">ยังไม่มีข้อมูลแผนก</div>`}
                    </div>
                    ${configDepts.length ? `<p class="text-[10px] text-slate-400 mt-4">Progress bar = รายการที่ส่งจริง / (จำนวน Safety Unit × เป้าต่อ Unit จาก Program Config)</p>` : ''}
                </div>
                ${actionPanel}
            </div>
        </div>
    `;
}

function renderKyReminderQueuePanel(data) {
    if (!data?.rows) {
        return `
            <div class="ds-section p-5 border-l-4 border-l-slate-300">
                <p class="text-sm font-bold text-slate-700">KY Reminder Queue</p>
                <p class="text-xs text-slate-400 mt-1">ยังไม่สามารถโหลดคิวแจ้งเตือนหน่วยงานที่ยังไม่ส่งได้</p>
            </div>`;
    }
    const rows = normalizeApiArray(data.rows);
    const readyRows = rows.filter(row => row.readiness === 'ready');
    const blockedRows = rows.filter(row => row.readiness !== 'ready');
    const monthLabel = `${String(data.month || new Date().getMonth() + 1).padStart(2, '0')}/${data.year || _filterMgmtYear}`;
    const smtpLabel = data.smtpConfigured
        ? 'SMTP พร้อมส่งทันที'
        : 'SMTP ยังไม่ตั้งค่า ระบบจะเก็บอีเมลไว้ในคิว';

    return `
        <div class="ds-section p-5 border-l-4 border-l-emerald-400">
            <div class="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                <div>
                    <p class="text-xs font-bold text-emerald-700 uppercase">KY Reminder / Follow-up Email</p>
                    <h3 class="text-sm font-bold text-slate-800 mt-1">แจ้งเตือนส่วนงานที่ยังไม่ส่ง KY รอบ ${escHtml(monthLabel)}</h3>
                    <p class="text-xs text-slate-500 mt-1">ดึงผู้รับผิดชอบจาก Employee Master ตาม Email Requirement Rules และเลือกอีเมลจากตำแหน่งในแผนกหรือ Safety Unit ที่เกี่ยวข้อง</p>
                </div>
                <div class="flex flex-col sm:flex-row gap-2">
                    <span class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600">${escHtml(smtpLabel)}</span>
                    <button type="button" data-ky-reminder-send-ready ${readyRows.length ? '' : 'disabled'}
                        class="px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        style="background:linear-gradient(135deg,#059669,#0f766e)">
                        ส่ง Reminder ที่พร้อม ${readyRows.length}
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                ${manageMetric('คิวติดตาม', data.summary?.total || rows.length, '#6366f1', `รอบ ${monthLabel}`)}
                ${manageMetric('พร้อมส่ง', data.summary?.ready || readyRows.length, '#059669', `${data.summary?.recipients || 0} ผู้รับอีเมล`)}
                ${manageMetric('ยังติดข้อมูล', data.summary?.blocked || blockedRows.length, '#f97316', 'แก้ Master หรือ Email Rule')}
                ${manageMetric('ตำแหน่งใน Rule', data.requiredPositions?.length || 0, '#0284c7', 'ใช้หา Responsible Person')}
            </div>
            <div class="grid grid-cols-1 2xl:grid-cols-2 gap-4 mt-4">
                <div class="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <div class="flex items-center justify-between gap-2 mb-3">
                        <p class="text-xs font-bold text-emerald-700">พร้อมส่ง Reminder</p>
                        <span class="px-2 py-0.5 rounded-full bg-white border border-emerald-100 text-[11px] font-bold text-emerald-700">${readyRows.length}</span>
                    </div>
                    <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
                        ${readyRows.length ? readyRows.map(row => `
                            <div class="rounded-xl border border-white bg-white p-3">
                                <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                    <div>
                                        <p class="text-sm font-bold text-slate-800">${escHtml(row.department || '-')}</p>
                                        <p class="text-xs text-slate-500 mt-0.5">${row.safetyUnit ? `Safety Unit: ${escHtml(row.safetyUnit)}` : 'นับระดับแผนก'} · ${row.candidateScope === 'unit' ? 'ผู้รับจาก Unit' : 'ผู้รับจากแผนก'}</p>
                                        <p class="text-[11px] text-slate-400 mt-1">${row.recipients.map(person => `${person.EmployeeName || person.EmployeeID} <${person.CompanyEmail}>`).map(escHtml).join(', ')}</p>
                                    </div>
                                    <button type="button" data-ky-reminder-send-key="${escHtml(row.key)}"
                                        class="px-2.5 py-1.5 rounded-lg border border-emerald-200 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                                        ส่งรายการนี้
                                    </button>
                                </div>
                            </div>`).join('') : `<div class="rounded-xl bg-white p-4 text-xs text-slate-500">ยังไม่มีรายการที่พร้อมส่งในรอบนี้</div>`}
                    </div>
                </div>
                <div class="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
                    <div class="flex items-center justify-between gap-2 mb-3">
                        <p class="text-xs font-bold text-amber-700">ต้องแก้ข้อมูลก่อนส่ง</p>
                        <span class="px-2 py-0.5 rounded-full bg-white border border-amber-100 text-[11px] font-bold text-amber-700">${blockedRows.length}</span>
                    </div>
                    <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
                        ${blockedRows.length ? blockedRows.map(row => `
                            <div class="rounded-xl border border-white bg-white p-3">
                                <p class="text-sm font-bold text-slate-800">${escHtml(row.department || '-')}</p>
                                <p class="text-xs text-slate-500 mt-0.5">${row.safetyUnit ? `Safety Unit: ${escHtml(row.safetyUnit)}` : 'นับระดับแผนก'}</p>
                                <p class="text-xs font-semibold text-amber-700 mt-1">${escHtml(row.reason || 'ยังไม่พร้อมส่ง')}</p>
                                ${row.reviewCandidates?.length ? `<p class="text-[11px] text-slate-400 mt-1">ตรวจ Employee Master: ${row.reviewCandidates.map(person => person.EmployeeName || person.EmployeeID).map(escHtml).join(', ')}</p>` : ''}
                            </div>`).join('') : `<div class="rounded-xl bg-white p-4 text-xs font-semibold text-emerald-700">ไม่มีรายการติดข้อมูล</div>`}
                    </div>
                </div>
            </div>
        </div>`;
}

function renderKyEmailOutboxPanel(data) {
    const rows = normalizeApiArray(data?.data ?? data);
    const smtpLabel = data?.smtpConfigured
        ? 'SMTP พร้อมส่ง'
        : 'SMTP ยังไม่ตั้งค่า ระบบจะเก็บคิวไว้';
    const queued = rows.filter(row => row.Status === 'Queued').length;
    const failed = rows.filter(row => row.Status === 'Failed').length;
    const sent = rows.filter(row => row.Status === 'Sent').length;
    const retryable = queued + failed;
    const statusClass = (status) => {
        if (status === 'Sent') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
        if (status === 'Failed') return 'bg-rose-50 text-rose-700 border-rose-100';
        return 'bg-amber-50 text-amber-700 border-amber-100';
    };

    return `
        <div class="ds-section p-5 border-l-4 border-l-violet-400">
            <div class="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                <div>
                    <p class="text-xs font-bold text-violet-700 uppercase">KY Email Outbox / Retry</p>
                    <h3 class="text-sm font-bold text-slate-800 mt-1">คิวอีเมลของการส่งกิจกรรม KY และ Reminder</h3>
                    <p class="text-xs text-slate-500 mt-1">${escHtml(smtpLabel)} · เก็บประวัติ Submitted, AdminSubmitted, Reviewed, Closed และ Missing Reminder</p>
                </div>
                <button type="button" data-ky-email-retry-all ${retryable ? '' : 'disabled'}
                    class="px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    style="background:linear-gradient(135deg,#7c3aed,#2563eb)">
                    Retry คิวค้าง ${retryable}
                </button>
            </div>
            <div class="grid grid-cols-3 gap-3 mt-4">
                ${manageMetric('Queued', queued, '#d97706', 'รอส่ง')}
                ${manageMetric('Failed', failed, '#e11d48', 'ต้อง Retry')}
                ${manageMetric('Sent', sent, '#059669', 'ส่งแล้ว')}
            </div>
            <div class="mt-4 overflow-x-auto rounded-xl border border-slate-100">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase">
                        <tr>
                            <th class="px-3 py-2">Event</th>
                            <th class="px-3 py-2">Recipient</th>
                            <th class="px-3 py-2">Status</th>
                            <th class="px-3 py-2">Created</th>
                            <th class="px-3 py-2"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                        ${rows.length ? rows.slice(0, 12).map(row => `
                            <tr>
                                <td class="px-3 py-2">
                                    <p class="font-bold text-slate-700">${escHtml(row.EventType || '-')}</p>
                                    <p class="text-[11px] text-slate-400 max-w-xs truncate" title="${escHtml(row.Subject || '')}">${escHtml(row.Subject || '-')}</p>
                                </td>
                                <td class="px-3 py-2 text-xs text-slate-600">${escHtml(row.Recipient || '-')}</td>
                                <td class="px-3 py-2">
                                    <span class="inline-flex px-2 py-0.5 rounded-full border text-[11px] font-bold ${statusClass(row.Status)}">${escHtml(row.Status || 'Queued')}</span>
                                    ${row.Error ? `<p class="text-[10px] text-rose-500 mt-1 max-w-xs truncate" title="${escHtml(row.Error)}">${escHtml(row.Error)}</p>` : ''}
                                </td>
                                <td class="px-3 py-2 text-xs text-slate-400">${escHtml(formatKyDateTime(row.CreatedAt))}</td>
                                <td class="px-3 py-2 text-right">
                                    ${row.Status !== 'Sent' ? `
                                        <button type="button" data-ky-email-retry-id="${row.id}"
                                            class="px-2.5 py-1.5 rounded-lg border border-violet-200 text-xs font-bold text-violet-700 hover:bg-violet-50">
                                            Retry
                                        </button>` : ''}
                                </td>
                            </tr>`).join('') : `
                            <tr><td colspan="5" class="px-3 py-6 text-center text-xs text-slate-400">ยังไม่มีคิวอีเมล KY</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>`;
}

async function sendKyMissingSubmissionReminders(keys = null) {
    try {
        showLoading('กำลังส่ง Reminder KY...');
        const res = await API.post('/ky/reminders/send', {
            year: _filterMgmtYear,
            keys: Array.isArray(keys) ? keys : undefined,
        });
        const summary = res?.data?.summary || {};
        showToast(res?.message || `ส่ง Reminder KY แล้ว ${summary.recipients || 0} อีเมล`, 'success');
        await fetchAndRenderManage('all');
    } catch (err) {
        showError(err);
    } finally {
        hideLoading();
    }
}

async function retryKyEmailOutbox(id = null) {
    try {
        showLoading(id ? 'กำลัง Retry อีเมล KY...' : 'กำลัง Retry คิวอีเมล KY...');
        const res = id
            ? await API.post(`/ky/email-outbox/${id}/retry`)
            : await API.post('/ky/email-outbox/retry-queued');
        showToast(res?.message || 'Retry อีเมล KY สำเร็จ', 'success');
        await fetchAndRenderManage('all');
    } catch (err) {
        showError(err);
    } finally {
        hideLoading();
    }
}

function manageMetric(label, value, color, sub) {
    return `
        <div class="ds-metric-card p-5 border-t-4 rounded-2xl" style="border-top-color:${color}">
            <p class="text-2xl font-bold" style="color:${color}">${value}</p>
            <p class="text-xs font-semibold text-slate-600 mt-1">${label}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">${sub}</p>
        </div>`;
}

function deptProgressRow(d) {
    const closePct    = d.total ? Math.round((d.closed / d.total) * 100) : 0;
    const hasYearly   = d.yearlyTarget !== null;
    const yearlyPct   = hasYearly && d.yearlyTarget > 0
        ? Math.min(100, Math.round(d.yearlySubmitted / d.yearlyTarget * 100)) : 0;
    const yBarColor   = yearlyPct >= 80 ? '#059669' : yearlyPct >= 40 ? '#d97706' : '#ef4444';
    const submitted   = d.total > 0;
    const unitRows = d.safetyUnits?.length ? `
        <div class="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            ${d.safetyUnits.map(unit => {
                const submittedCount = Number(d.unitSubmitted?.[unit] || 0);
                const target = Number(d.unitTarget || 12);
                const pct = target > 0 ? Math.min(100, Math.round(submittedCount / target * 100)) : 0;
                const color = pct >= 80 ? '#059669' : pct >= 40 ? '#d97706' : '#ef4444';
                return `
                <div class="rounded-lg border border-slate-100 bg-white/80 px-2.5 py-2">
                    <div class="flex justify-between gap-2 text-[11px]">
                        <span class="font-bold text-slate-600 truncate" title="${escHtml(unit)}">${escHtml(unit)}</span>
                        <span class="font-bold" style="color:${color}">${submittedCount}/${target}</span>
                    </div>
                    <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1.5">
                        <div class="h-full rounded-full" style="width:${pct}%;background:${color}"></div>
                    </div>
                </div>`;
            }).join('')}
        </div>` : '';

    return `
        <div class="rounded-xl border ${submitted ? 'border-slate-100 bg-white' : 'border-amber-100 bg-amber-50/70'} px-3 py-2.5">
            <div class="grid grid-cols-1 xl:grid-cols-[minmax(220px,0.8fr)_minmax(260px,1fr)_minmax(180px,0.7fr)] gap-3 xl:items-center">
                <div class="min-w-0">
                    <p class="text-sm font-bold text-slate-700 truncate">${escHtml(d.dept)}</p>
                    <p class="text-[11px] text-slate-400 mt-0.5">${submitted ? `${d.total} รายการ · Open ${d.open} · Reviewed ${d.reviewed} · Closed ${d.closed}` : 'ยังไม่ส่ง KY ในช่วงที่เลือก'}${d.safetyUnits?.length ? ` · ${d.safetyUnits.length} Safety Units` : ''}</p>
                </div>
                <div>
                    <div class="flex justify-between text-[10px] text-slate-400 mb-0.5">
                        <span>${hasYearly ? 'เป้าหมายรายปี' : 'รายการที่ส่ง'}</span>
                        <span>${hasYearly ? `${d.yearlySubmitted}/${d.yearlyTarget} · ${yearlyPct}%` : `${d.total} รายการ`}</span>
                    </div>
                    <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div class="h-full rounded-full transition-all" style="width:${hasYearly ? yearlyPct : (submitted ? 100 : 0)}%;background:${hasYearly ? yBarColor : '#059669'}"></div>
                    </div>
                </div>
                <div>
                    <div class="flex justify-between text-[10px] text-slate-400 mb-0.5">
                        <span>อัตราปิด</span><span>${closePct}%</span>
                    </div>
                    <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div class="h-full rounded-full" style="width:${closePct}%;background:linear-gradient(90deg,#6366f1,#10b981)"></div>
                    </div>
                </div>
            </div>
            ${unitRows}
        </div>`;
}

function renderKyFileHealthPanel(data) {
    if (!data?.summary) {
        return `
            <div class="ds-section p-5 border-l-4 border-l-slate-300" data-ky-media-file-health>
                <p class="text-sm font-bold text-slate-700">KY Media File Health</p>
                <p class="text-xs text-slate-400 mt-1">Read-only media health report is not available right now.</p>
            </div>`;
    }
    const s = data.summary || {};
    const issues = [
        ...normalizeApiArray(data.missingFiles || []),
        ...normalizeApiArray(data.legacyLocalhostFiles || []),
    ];
    const uniqueIssues = [];
    const seen = new Set();
    issues.forEach(item => {
        const key = `${item.activityId || ''}:${item.field || ''}:${item.url || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        uniqueIssues.push(item);
    });
    const statusTone = status => {
        if (status === 'ok') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
        if (status === 'missing') return 'bg-red-50 text-red-700 border-red-100';
        if (status === 'legacy-localhost') return 'bg-amber-50 text-amber-700 border-amber-100';
        if (status === 'external') return 'bg-sky-50 text-sky-700 border-sky-100';
        return 'bg-slate-50 text-slate-600 border-slate-100';
    };
    return `
        <div class="ds-section p-5 border-l-4 border-l-rose-400" data-ky-media-file-health>
            <div class="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                <div>
                    <p class="text-xs font-bold text-rose-700 uppercase">KY Media File Health</p>
                    <h3 class="text-sm font-bold text-slate-800 mt-1">Read-only attachment / video integrity report</h3>
                    <p class="text-xs text-slate-500 mt-1">Checks existing AttachmentUrl and VideoUrl references for ${escHtml(String(data.year || _filterMgmtYear))}. No database rows or files are changed.</p>
                </div>
                <span class="px-3 py-2 rounded-xl bg-white border border-rose-100 text-xs font-bold text-rose-700">${uniqueIssues.length} issue reference(s)</span>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
                ${manageMetric('OK', s.ok || 0, '#059669', 'file exists')}
                ${manageMetric('Missing', s.missing || 0, '#dc2626', 'file not found')}
                ${manageMetric('Legacy local', s.legacyLocalhost || 0, '#d97706', 'localhost URL')}
                ${manageMetric('External', s.external || 0, '#0284c7', 'outside uploads')}
                ${manageMetric('Empty', s.empty || 0, '#64748b', 'no URL')}
            </div>
            <div class="mt-4 overflow-x-auto rounded-xl border border-slate-100">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase">
                        <tr>
                            <th class="px-3 py-2">Record</th>
                            <th class="px-3 py-2">Field</th>
                            <th class="px-3 py-2">Status</th>
                            <th class="px-3 py-2">Stored file</th>
                            <th class="px-3 py-2 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                        ${uniqueIssues.length ? uniqueIssues.slice(0, 12).map(item => `
                            <tr>
                                <td class="px-3 py-2 min-w-[220px]">
                                    <p class="font-bold text-slate-700">${escHtml(item.department || '-')} ${item.safetyUnit ? `· ${escHtml(item.safetyUnit)}` : ''}</p>
                                    <p class="text-[11px] text-slate-400 truncate max-w-xs" title="${escHtml(item.teamName || item.kytKeyword || '')}">${escHtml(item.teamName || item.kytKeyword || item.activityId || '-')}</p>
                                </td>
                                <td class="px-3 py-2 text-xs font-bold text-slate-600">${escHtml(item.label || item.field || '-')}</td>
                                <td class="px-3 py-2">
                                    <span class="inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusTone(item.status)}">${escHtml(item.status || '-')}</span>
                                    ${item.scope === 'legacy-localhost' ? `<p class="mt-1 text-[10px] font-semibold text-amber-600">legacy localhost URL</p>` : ''}
                                </td>
                                <td class="px-3 py-2 text-xs text-slate-500 max-w-[260px]">
                                    <p class="truncate" title="${escHtml(item.storedName || '')}">${escHtml(item.storedName || '-')}</p>
                                    ${item.originalName ? `<p class="text-[10px] text-slate-400 truncate" title="${escHtml(item.originalName)}">${escHtml(item.originalName)}</p>` : ''}
                                </td>
                                <td class="px-3 py-2 text-right">
                                    <button type="button" class="btn-ky-manage px-3 py-1 rounded-lg text-xs font-bold text-purple-700 hover:bg-purple-50"
                                            data-id="${escHtml(item.activityId || '')}">Attach / repair</button>
                                </td>
                            </tr>`).join('') : `
                            <tr><td colspan="5" class="px-3 py-6 text-center text-xs font-bold text-emerald-700">No missing or legacy KY media references found for this year.</td></tr>`}
                    </tbody>
                </table>
            </div>
            <p class="mt-3 text-[11px] text-slate-400">${escHtml(data.note || 'Read-only report. No automatic cleanup is performed.')}</p>
        </div>`;
}

function manageActionItem(r) {
    const date = r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH', { day:'numeric', month:'short' }) : '-';
    return `
        <div class="rounded-xl border border-slate-100 bg-white p-3">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="text-sm font-bold text-slate-700 truncate">${escHtml(r.Department || '-')} ${r.SafetyUnit ? `· ${escHtml(r.SafetyUnit)}` : ''} ${r.TeamName ? `· ${escHtml(r.TeamName)}` : ''}</p>
                    <p class="text-[11px] text-slate-400 mt-0.5">${date} · ${escHtml(r.ReporterName || '-')}</p>
                    ${isKySubmittedOnBehalf(r) ? `<p class="text-[10px] font-bold text-indigo-600 mt-1">Admin ส่งแทน · ${escHtml(r.SubmittedByName || r.SubmittedByID || '-')}</p>` : ''}
                    <p class="text-xs text-slate-500 mt-1 line-clamp-2">${escHtml(r.HazardDescription || r.KYTKeyword || '-')}</p>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">${STATUS_LABEL[r.Status] || r.Status}</span>
            </div>
            <button class="btn-ky-manage mt-3 w-full px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all"
                    style="background:linear-gradient(135deg,#6366f1,#8b5cf6)"
                    data-id="${r.id}">อัปเดตสถานะ / Countermeasure</button>
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
async function showDetailModal(id) {
    const cached = findKyCachedRecord(id);
    try {
        showLoading('กำลังโหลด...');
        const res = await API.get(`/ky/${id}`);
        const r   = normalizeApiObject(res?.data ?? res);
        hideLoading();

        let participants = [];
        if (r.Participants) {
            try { participants = JSON.parse(r.Participants); } catch { participants = [r.Participants]; }
        }
        const isVideo = url => url && /\.(mp4|mov|webm|avi|mpeg)(\?.*)?$/i.test(url);
        const isImage = url => url && /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url);
        const date    = r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' }) : '-';
        const participantLabels = participants.map(p => {
            if (p && typeof p === 'object') return p.name || p.Name || p.EmployeeName || p.EmployeeID || JSON.stringify(p);
            return String(p || '');
        }).filter(Boolean);
        const statusLabel = STATUS_LABEL[r.Status] || r.Status || '-';
        const riskLabel = r.RiskCategory || 'General';

        const html = `
            <div class="space-y-4 text-sm">
                <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Status</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(statusLabel)}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Risk</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(riskLabel)}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Date</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(date)}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Members</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${participantLabels.length || '-'}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Evidence</p>
                        <div class="mt-1">${renderKyEvidenceBadge(r, true)}</div>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    ${infoField('วันที่', date)}
                    ${infoField('แผนก', r.Department || '-')}
                    ${infoField('Safety Unit', r.SafetyUnit || '-')}
                    ${infoField('ชื่อทีม', r.TeamName || '-')}
                    ${infoField('ผู้รายงาน', r.ReporterName || '-')}
                    ${r.ReporterEmail ? infoField('อีเมลแจ้งสถานะ', r.ReporterEmail) : ''}
                    ${r.SubmittedByName && r.SubmittedByID !== r.ReporterID ? infoField('ผู้บันทึกแทน', r.SubmittedByName) : ''}
                </div>

                ${participants.length ? `
                <div>
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">ผู้เข้าร่วม (${participants.length} คน)</p>
                    <div class="flex flex-wrap gap-1.5">
                        ${participantLabels.map(p => `<span class="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">${escHtml(p)}</span>`).join('')}
                    </div>
                </div>` : ''}

                <div class="p-3 bg-red-50 rounded-xl border border-red-100">
                    <p class="text-xs text-red-500 font-semibold uppercase tracking-wider mb-1">อันตรายที่คาดการณ์</p>
                    <p class="text-slate-700 leading-relaxed">${escHtml(r.HazardDescription || '-')}</p>
                </div>

                ${r.Countermeasure ? `
                <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">มาตรการตอบโต้</p>
                    <p class="text-slate-700 leading-relaxed">${escHtml(r.Countermeasure)}</p>
                </div>` : ''}

                ${r.AdminComment ? `
                <div class="p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <p class="text-xs text-amber-600 font-semibold uppercase tracking-wider mb-1">ความคิดเห็น Admin</p>
                    <p class="text-slate-700 leading-relaxed">${escHtml(r.AdminComment)}</p>
                </div>` : ''}

                <!-- Media -->
                ${(r.AttachmentUrl || r.VideoUrl) ? `
                <div>
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">สื่อแนบ</p>
                    <div class="flex flex-wrap gap-3">
                        ${r.AttachmentUrl ? buildMediaThumb(r.AttachmentUrl, 'ไฟล์แนบ', isImage(r.AttachmentUrl)) : ''}
                        ${r.VideoUrl      ? buildVideoThumb(r.VideoUrl)                                            : ''}
                    </div>
                </div>` : ''}
            </div>`;

        openDetailModal({
            title: escHtml(r.TeamName || 'KY Activity'),
            subtitle: `${date} · ${r.Department || '-'} · ${r.ReporterName || '-'}`,
            meta: [
                { label: statusLabel, className: `${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'} border-slate-200` },
                { label: riskLabel, className: `${RISK_BADGE_COLOR[r.RiskCategory] || 'bg-slate-100 text-slate-500'} border-slate-200` },
                r.KYTKeyword ? { label: `# ${r.KYTKeyword}`, className: 'bg-indigo-100 text-indigo-700 border-indigo-200' } : null,
            ],
            body: html,
            size: 'max-w-2xl'
        });
    } catch (err) {
        hideLoading();
        if (cached) {
            showKyCachedDetailModal(cached, err);
            return;
        }
        showError(err);
    }
}

function showKyCachedDetailModal(row, err) {
    const date = row.ActivityDate ? new Date(row.ActivityDate).toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' }) : '-';
    const statusLabel = STATUS_LABEL[row.Status] || row.Status || '-';
    const riskLabel = row.RiskCategory || 'General';
    const html = `
        <div class="space-y-4 text-sm">
            <div class="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-amber-800">
                <div class="font-bold">Loaded from the current list</div>
                <div class="mt-1 text-xs">Full detail API is temporarily unavailable: ${escHtml(err?.message || 'Failed to fetch')}</div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Status</p>
                    <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(statusLabel)}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Date</p>
                    <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(date)}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Department</p>
                    <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(row.Department || '-')}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Evidence</p>
                    <div class="mt-1">${renderKyEvidenceBadge(row, true)}</div>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                ${infoField('Safety Unit', row.SafetyUnit || '-')}
                ${infoField('Team', row.TeamName || '-')}
                ${infoField('KYT Keyword', row.KYTKeyword || '-')}
                ${infoField('Reporter', row.ReporterName || '-')}
            </div>
            <div class="p-3 bg-red-50 rounded-xl border border-red-100">
                <p class="text-xs text-red-500 font-semibold uppercase tracking-wider mb-1">Hazard</p>
                <p class="text-slate-700 leading-relaxed">${escHtml(row.HazardDescription || '-')}</p>
            </div>
            ${row.Countermeasure ? `
            <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">Countermeasure</p>
                <p class="text-slate-700 leading-relaxed">${escHtml(row.Countermeasure)}</p>
            </div>` : ''}
        </div>`;
    openDetailModal({
        title: escHtml(row.TeamName || row.KYTKeyword || 'KY Activity'),
        subtitle: `${date} · ${row.Department || '-'} · ${row.ReporterName || '-'}`,
        meta: [
            { label: 'Cached detail', className: 'bg-amber-100 text-amber-700 border-amber-200' },
            { label: riskLabel, className: `${RISK_BADGE_COLOR[row.RiskCategory] || 'bg-slate-100 text-slate-500'} border-slate-200` },
        ],
        body: html,
        size: 'max-w-2xl'
    });
}

function infoField(label, value) {
    return `<div>
        <p class="text-xs text-slate-400 font-medium mb-0.5">${escHtml(label)}</p>
        <p class="text-slate-700 font-semibold">${escHtml(value)}</p>
    </div>`;
}

function buildMediaThumb(url, label, isImage) {
    const safeUrl = kyMediaUrl(url);
    if (!safeUrl) return '';
    if (isImage) {
        return `<button class="btn-ky-preview group relative overflow-hidden rounded-xl border-2 border-slate-200 hover:border-indigo-400 transition-all w-24 h-24"
                         data-url="${escHtml(safeUrl)}" data-title="${escHtml(label)}">
            <img src="${escHtml(safeUrl)}" alt="${escHtml(label)}" class="w-full h-full object-cover">
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-end">
                <span class="w-full text-center text-white text-xs py-1 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-all">${label}</span>
            </div>
        </button>`;
    }
    return `<a href="${escHtml(safeUrl)}" target="_blank" rel="noopener noreferrer"
               class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-sm text-slate-600">
        <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
        </svg>
        ${label}
    </a>`;
}

function buildVideoThumb(url) {
    const safeUrl = kyMediaUrl(url);
    if (!safeUrl) return '';
    return `<div class="rounded-xl overflow-hidden border-2 border-slate-200 w-full max-w-xs" data-ky-video-shell>
        ${buildKyVideoLazyShell(safeUrl, { TeamName: 'Evidence video' })}
        <div class="px-2 py-1 text-xs text-slate-500 bg-slate-50">วิดีโอหลักฐาน</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE MODAL (Admin)
// ─────────────────────────────────────────────────────────────────────────────
async function showManageModal(id) {
    try {
        showLoading('กำลังโหลด...');
        const res = await API.get(`/ky/${id}`);
        const r   = normalizeApiObject(res?.data ?? res);
        hideLoading();

        let participants = [];
        if (r.Participants) {
            try { participants = JSON.parse(r.Participants); } catch { participants = []; }
        }
        const manageYear = r.ActivityDate ? new Date(r.ActivityDate).getFullYear() : new Date().getFullYear();
        const activityDateValue = r.ActivityDate ? new Date(r.ActivityDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        await Promise.all([_fetchDepartments(), _fetchProgramConfig(manageYear)]);
        let existingAnnualEvidence = null;
        try {
            const annualResponse = await API.get(`/ky/annual-video-evidence?year=${encodeURIComponent(manageYear)}`);
            const annualData = normalizeApiObject(annualResponse?.data ?? annualResponse);
            existingAnnualEvidence = normalizeApiArray(annualData.evidence || []).find(item => String(item.ActivityID || '') === String(r.id)) || null;
        } catch (annualError) {
            console.warn('KY annual evidence lookup unavailable in manage modal:', annualError);
        }
        const manageDeptOptions = buildKyDepartmentOptions(r.Department || '', manageYear);
        const manageUnitOptions = (department, selectedUnit, year) => {
            const units = getKySafetyUnitsForDept(department, year);
            const selected = String(selectedUnit || '').trim();
            if (selected && !units.includes(selected)) units.unshift(selected);
            if (!units.length) return `<option value="">No Safety Unit configured</option>`;
            return `<option value="">-- Select Safety Unit --</option>` + units.map(unit => `<option value="${escHtml(unit)}" ${unit === selected ? 'selected' : ''}>${escHtml(unit)}</option>`).join('');
        };

        const html = `
            <div class="space-y-4 text-sm">
                <div class="p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-sm text-indigo-900">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <p class="font-bold">${escHtml(r.Department || '-')} ${r.TeamName ? `· ${escHtml(r.TeamName)}` : ''}</p>
                            <p class="text-xs text-slate-500 mt-0.5">${escHtml(r.ReporterName || '-')} · ${r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH') : '-'}</p>
                        </div>
                        <span class="px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">${STATUS_LABEL[r.Status] || r.Status}</span>
                    </div>
                    ${r.HazardDescription ? `<p class="text-xs text-slate-700 mt-3 line-clamp-2">${escHtml(r.HazardDescription)}</p>` : ''}
                </div>

                <form id="ky-manage-form" class="space-y-4">
                    <input type="hidden" name="id" value="${r.id}">

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">Activity Date / วันที่กิจกรรม</label>
                            <input type="date" name="ActivityDate" id="ky-manage-date" class="form-input w-full" value="${activityDateValue}">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">Main Department / แผนกหลัก</label>
                            <select name="Department" id="ky-manage-dept" class="form-input w-full" required>
                                <option value="">-- Select Department --</option>
                                ${manageDeptOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">Safety Unit</label>
                            <select name="SafetyUnit" id="ky-manage-safety-unit" class="form-input w-full">
                                ${manageUnitOptions(r.Department || '', r.SafetyUnit || '', manageYear)}
                            </select>
                            <p class="text-xs text-slate-400 mt-1">Required when the selected department has units in Program Config.</p>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">Participants / ผู้เข้าร่วม</label>
                            <input type="text" name="Participants" class="form-input w-full" value="${escHtml(participants.join(', '))}" placeholder="Name 1, Name 2">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานะ</label>
                            <select name="Status" class="form-input w-full">
                                ${STATUSES.map(s => `<option value="${s}" ${r.Status === s ? 'selected':''}>${STATUS_LABEL[s]||s}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">KYT Keyword</label>
                            <input type="text" name="KYTKeyword" class="form-input w-full" value="${escHtml(r.KYTKeyword || '')}">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทความเสี่ยง</label>
                            <select name="RiskCategory" class="form-input w-full">
                                ${RISK_CATEGORIES.map(c => `<option value="${escHtml(c)}" ${r.RiskCategory === c ? 'selected':''}>${escHtml(c)}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อทีม</label>
                            <input type="text" name="TeamName" class="form-input w-full" value="${escHtml(r.TeamName || '')}">
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดอันตราย</label>
                        <textarea name="HazardDescription" rows="3" class="form-input w-full resize-none">${escHtml(r.HazardDescription || '')}</textarea>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">มาตรการตอบโต้</label>
                        <textarea name="Countermeasure" rows="3" class="form-input w-full resize-none">${escHtml(r.Countermeasure || '')}</textarea>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">ความคิดเห็น Admin</label>
                        <textarea name="AdminComment" rows="2" class="form-input w-full resize-none"
                                  placeholder="หมายเหตุ / ข้อเสนอแนะเพิ่มเติม...">${escHtml(r.AdminComment || '')}</textarea>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">อัปโหลดไฟล์แนบใหม่</label>
                            ${r.AttachmentUrl ? `<a href="${escHtml(kyMediaUrl(r.AttachmentUrl))}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 mb-2">ดูไฟล์ปัจจุบัน</a>` : ''}
                            <input type="file" name="attachment" id="ky-manage-attachment"
                                   accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                   class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">อัปโหลดวิดีโอใหม่</label>
                            ${r.VideoUrl ? `<a href="${escHtml(kyMediaUrl(r.VideoUrl))}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-800 mb-2">ดูวิดีโอปัจจุบัน</a>` : ''}
                            <input type="file" name="video" id="ky-manage-video"
                                   accept="${escHtml(kyVideoAcceptValue())}"
                                   class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100">
                        </div>
                    </div>

                    <div class="rounded-xl border border-teal-200 bg-teal-50/60 p-4">
                        <label class="flex items-start gap-3 ${existingAnnualEvidence?.Status === 'Verified' ? 'opacity-70' : 'cursor-pointer'}">
                            <input type="checkbox" id="ky-manage-video-central-machine" class="mt-1 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
                                   ${existingAnnualEvidence?.Status === 'Verified' ? 'disabled' : ''}>
                            <span>
                                <span class="block text-sm font-bold text-teal-800">เก็บวิดีโอไว้ที่เครื่องกลาง (ไม่อัปโหลดขึ้น Production)</span>
                                <span class="block text-xs text-teal-700 mt-1">ใช้ไฟล์ที่เลือกด้านบนเพื่อคำนวณ Metadata และ SHA-256 ใน Browser เท่านั้น รายการจะนับเป็นหลักฐานหลัง Admin Verify</span>
                            </span>
                        </label>
                        ${existingAnnualEvidence ? `<div class="mt-3 text-xs font-semibold ${existingAnnualEvidence.Status === 'Verified' ? 'text-emerald-700' : 'text-amber-700'}">Annual evidence ปัจจุบัน: ${escHtml(existingAnnualEvidence.Status || '-')} · ${escHtml(existingAnnualEvidence.StorageMode || '-')}</div>` : ''}
                        <div id="ky-manage-central-reference-wrap" class="hidden mt-3">
                            <label class="block text-xs font-bold text-teal-800 mb-1">ตำแหน่งไฟล์ / เลขอ้างอิงเครื่องกลาง</label>
                            <input type="text" id="ky-manage-video-central-reference" class="form-input w-full"
                                   placeholder="เช่น \\FILESERVER\\KYT\\2026\\MAINTENANCE\\video.mp4">
                            <p class="text-[11px] text-teal-700 mt-1">กิจกรรมต้องมีสถานะ “ปิดแล้ว” และไฟล์จะยังไม่ถูกนับจนกว่าจะ Verify ใน Annual Compliance Dashboard</p>
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button type="button" class="btn btn-secondary px-4"
                                onclick="document.getElementById('modal-close-btn').click()">ยกเลิก</button>
                        <button type="submit" id="ky-manage-save" class="btn btn-primary px-5">บันทึก</button>
                    </div>
                </form>
            </div>`;

        openModal('จัดการกิจกรรม KY', html, 'max-w-3xl');

        document.getElementById('ky-manage-attachment')?.addEventListener('change', (e) => {
            validateKySelectedFile(e.target, 'attachment');
        });
        document.getElementById('ky-manage-video')?.addEventListener('change', (e) => {
            validateKySelectedFile(e.target, 'video');
        });
        document.getElementById('ky-manage-video-central-machine')?.addEventListener('change', (e) => {
            document.getElementById('ky-manage-central-reference-wrap')?.classList.toggle('hidden', !e.target.checked);
        });

        const refreshManageSafetyUnit = async () => {
            const dateValue = document.getElementById('ky-manage-date')?.value;
            const year = dateValue ? new Date(dateValue).getFullYear() : manageYear;
            await _fetchProgramConfig(year);
            const dept = document.getElementById('ky-manage-dept')?.value || '';
            const unitEl = document.getElementById('ky-manage-safety-unit');
            if (unitEl) unitEl.innerHTML = manageUnitOptions(dept, unitEl.value || r.SafetyUnit || '', year);
        };
        document.getElementById('ky-manage-date')?.addEventListener('change', refreshManageSafetyUnit);
        document.getElementById('ky-manage-dept')?.addEventListener('change', refreshManageSafetyUnit);

        document.getElementById('ky-manage-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
            e.preventDefault();
            const saveBtn = document.getElementById('ky-manage-save');
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> กำลังบันทึก...`;

            try {
                showLoading('กำลังบันทึก...');
                const fd = new FormData(e.target);
                const videoFile = document.getElementById('ky-manage-video')?.files?.[0] || null;
                const centralMachine = Boolean(document.getElementById('ky-manage-video-central-machine')?.checked);
                const centralReference = String(document.getElementById('ky-manage-video-central-reference')?.value || '').trim();
                const selectedStatus = String(fd.get('Status') || r.Status || '');
                if (centralMachine && selectedStatus !== 'Closed') {
                    showToast('การบันทึกวิดีโอเครื่องกลางทำได้เมื่อกิจกรรมมีสถานะปิดแล้วเท่านั้น', 'warning');
                    return;
                }
                if (centralMachine && (!videoFile || !centralReference)) {
                    showToast('กรุณาเลือกไฟล์วิดีโอและระบุตำแหน่ง/เลขอ้างอิงเครื่องกลาง', 'warning');
                    return;
                }
                fd.delete('id');
                fd.delete('video');
                await API.put(`/ky/${r.id}`, fd);
                let videoUploadFailed = false;
                let videoEvidenceFailureMessage = '';
                if (videoFile) {
                    try {
                        if (centralMachine) {
                            saveBtn.textContent = 'กำลังคำนวณ SHA-256...';
                            const sha256 = await sha256Blob(videoFile);
                            await API.post('/ky/annual-video-evidence/declare', {
                                activityId: r.id,
                                storageMode: 'CentralMachine',
                                externalBackupConfirmed: true,
                                externalReference: centralReference,
                                originalFileName: videoFile.name,
                                mimeType: videoFile.type || 'application/octet-stream',
                                fileSize: videoFile.size,
                                sha256,
                                rowVersion: Number(existingAnnualEvidence?.RowVersion || 0),
                            });
                        } else {
                            await uploadKyVideoInChunks(r.id, videoFile, (completed, total, done, meta) => setKyVideoUploadProgress(saveBtn, completed, total, done, meta));
                        }
                    } catch (videoError) {
                        videoUploadFailed = true;
                        videoEvidenceFailureMessage = centralMachine
                            ? 'บันทึกกิจกรรมแล้ว แต่บันทึก Metadata วิดีโอเครื่องกลางไม่สำเร็จ กรุณาเปิดรายการแล้วลองอีกครั้ง'
                            : '';
                        console.error('KY admin video replacement failed:', videoError);
                    }
                }
                closeModal();
                showToast(
                    videoUploadFailed && videoEvidenceFailureMessage
                        ? videoEvidenceFailureMessage
                        : videoUploadFailed
                        ? 'บันทึกข้อมูลกิจกรรมแล้ว แต่วิดีโออัปโหลดไม่สำเร็จ กรุณาเปิดรายการแล้วลองแนบอีกครั้ง'
                        : 'อัปเดตกิจกรรม KY สำเร็จ',
                    videoUploadFailed ? 'warning' : 'success'
                );
                if (_activeTab === 'history') await fetchAndRenderHistory();
                if (_activeTab === 'manage') await fetchAndRenderManage('all');
                await _loadHeroStats();
            } catch (err) {
                showError(err);
            } finally {
                hideLoading();
                saveBtn.disabled = false;
                saveBtn.textContent = 'บันทึก';
            }
        }));
    } catch (err) {
        hideLoading();
        showError(err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', guardActionHandler(async (e) => {
        if (e.target.closest('[data-ky-card-save-action]')) {
            const card = _kyCardSaveMenu?.card;
            _kyHideCardImageMenu();
            if (card) _kyDownloadCardImage(card);
            return;
        }
        if (!e.target.closest('#ky-card-save-menu')) _kyHideCardImageMenu();
        if (!e.target.closest('#ky-page') && !e.target.closest('#ky-video-library-modal') && !e.target.closest('#ky-evidence-popup')) return;

        const videoLoadBtn = e.target.closest('.ky-video-load');
        if (videoLoadBtn) {
            activateKyVideo(videoLoadBtn);
            return;
        }

        // Tab
        const tabBtn = e.target.closest('.ky-tab');
        if (tabBtn) { await switchTab(tabBtn.dataset.tab); return; }

        // Manage sub-tab
        const msubBtn = e.target.closest('[data-msub]');
        if (msubBtn) {
            _manageSub = msubBtn.dataset.msub;
            const c = document.getElementById('ky-tab-content');
            if (c) await renderManage(c);
            return;
        }

        const annualRegisterBtn = e.target.closest('[data-ky-annual-register-production]');
        if (annualRegisterBtn) {
            const activityId = annualRegisterBtn.dataset.kyAnnualRegisterProduction;
            try {
                await runKyButtonAction(annualRegisterBtn, 'กำลังตรวจ SHA...', async () => {
                    await API.post('/ky/annual-video-evidence/declare', { activityId, storageMode: 'Production' });
                    showToast('ลงทะเบียนวิดีโอ Production แล้ว รอ Admin Verify', 'success');
                    await renderKyAnnualVideoEvidence();
                });
            } catch (error) {
                if (error?.code === 'KY_ANNUAL_VIDEO_ALREADY_VERIFIED' || error?.code === 'KY_ANNUAL_VIDEO_STALE') {
                    await renderKyAnnualVideoEvidence();
                    const refreshed = (_kyAnnualVideoData?.candidates || []).find(row => String(row.id) === String(activityId));
                    if (refreshed?.ScopeEvidenceID) focusKyAnnualEvidenceRow(refreshed.ScopeEvidenceID);
                    showToast('Scope นี้มีหลักฐานรายปีอยู่แล้ว ระบบพาไปยังรายการเดิมโดยไม่ลงทะเบียนซ้ำ', 'warning');
                } else {
                    showError(error);
                }
            }
            return;
        }

        const annualFocusBtn = e.target.closest('[data-ky-annual-focus-evidence]');
        if (annualFocusBtn) {
            if (!focusKyAnnualEvidenceRow(annualFocusBtn.dataset.kyAnnualFocusEvidence)) {
                showToast('ไม่พบรายการหลักฐานเดิม กรุณารีเฟรชหน้าแล้วลองอีกครั้ง', 'warning');
            }
            return;
        }

        const annualExternalBtn = e.target.closest('[data-ky-annual-confirm-external]');
        if (annualExternalBtn) {
            const row = (_kyAnnualVideoData?.evidence || []).find(item => String(item.id) === String(annualExternalBtn.dataset.kyAnnualConfirmExternal));
            if (!row) return;
            const reference = window.prompt('ระบุพาธ / เลขอ้างอิงของไฟล์ที่สำรองไว้ในเครื่องกลาง', row.ExternalReference || '') ?? null;
            if (!reference?.trim()) return;
            await API.post('/ky/annual-video-evidence/declare', {
                activityId: row.ActivityID,
                storageMode: 'CentralMachine',
                externalBackupConfirmed: true,
                externalReference: reference.trim(),
                originalFileName: row.OriginalFileName,
                mimeType: row.MimeType || '',
                fileSize: Number(row.FileSize || 0),
                sha256: row.SHA256,
                rowVersion: Number(row.RowVersion || 0),
            });
            showToast('บันทึก External Backup แล้ว กรุณา Verify อีกครั้งก่อนลบไฟล์ Production', 'success');
            await renderKyAnnualVideoEvidence();
            return;
        }

        const annualVerifyBtn = e.target.closest('[data-ky-annual-verify], [data-ky-annual-correction]');
        if (annualVerifyBtn) {
            const isCorrection = annualVerifyBtn.hasAttribute('data-ky-annual-correction');
            const id = isCorrection ? annualVerifyBtn.dataset.kyAnnualCorrection : annualVerifyBtn.dataset.kyAnnualVerify;
            const note = window.prompt(isCorrection ? 'ระบุสิ่งที่ต้องแก้ไข' : 'หมายเหตุการตรวจสอบ (เว้นว่างได้)', '') ?? null;
            if (note === null || (isCorrection && !note.trim())) return;
            await API.post(`/ky/annual-video-evidence/${encodeURIComponent(id)}/verify`, {
                status: isCorrection ? 'NeedsCorrection' : 'Verified',
                rowVersion: Number(annualVerifyBtn.dataset.version || 0),
                note: note.trim(),
            });
            showToast(isCorrection ? 'ส่งกลับเพื่อแก้ไขแล้ว' : 'Admin Verify สำเร็จ', 'success');
            await renderKyAnnualVideoEvidence();
            return;
        }

        const annualDownloadBtn = e.target.closest('[data-ky-annual-download]');
        if (annualDownloadBtn) {
            await runKyButtonAction(annualDownloadBtn, 'กำลังดาวน์โหลด...', () => downloadKyAnnualVideo(annualDownloadBtn.dataset.kyAnnualDownload, annualDownloadBtn.dataset.name));
            return;
        }

        const annualAuditBtn = e.target.closest('[data-ky-annual-audit]');
        if (annualAuditBtn) { await showKyAnnualAudit(annualAuditBtn.dataset.kyAnnualAudit); return; }

        const annualDetailBtn = e.target.closest('[data-ky-annual-detail]');
        if (annualDetailBtn) { showKyVideoEvidenceDetail('annual', annualDetailBtn.dataset.kyAnnualDetail); return; }

        const annualDeleteOneBtn = e.target.closest('[data-ky-annual-delete-one]');
        if (annualDeleteOneBtn) {
            const reason = window.prompt('ระบุเหตุผลการลบไฟล์จาก Production (Metadata, SHA-256 และ Audit จะยังอยู่)', '') ?? null;
            if (!reason?.trim()) return;
            const confirmed = await showConfirmationModal('ยืนยันลบไฟล์ Production', 'ลบไฟล์วิดีโอรายการนี้จาก Production ใช่หรือไม่? ระบบจะเก็บ Metadata, SHA-256 และ Audit ไว้');
            if (!confirmed) return;
            await API.post('/ky/annual-video-evidence/delete-production', {
                items: [{ id: annualDeleteOneBtn.dataset.kyAnnualDeleteOne, rowVersion: Number(annualDeleteOneBtn.dataset.version || 0) }],
                reason: reason.trim(),
            });
            showToast('ลบไฟล์ Production แล้ว โดยเก็บ Metadata และ Audit ไว้ครบ', 'success');
            await renderKyAnnualVideoEvidence();
            return;
        }

        if (e.target.closest('[data-ky-annual-check-all]')) {
            const checkAll = e.target.closest('[data-ky-annual-check-all]');
            const checked = Boolean(checkAll.checked);
            const scope = checkAll.closest('[data-ky-cleanup-group]') || checkAll.closest('[data-ky-annual-view-panel]') || document;
            scope.querySelectorAll('[data-ky-annual-select]:not(:disabled)').forEach(input => { input.checked = checked; });
            return;
        }

        if (e.target.closest('[data-ky-annual-delete-selected]')) {
            const trigger = e.target.closest('[data-ky-annual-delete-selected]');
            const scope = trigger.closest('[data-ky-cleanup-group]') || trigger.closest('[data-ky-annual-view-panel]') || document;
            const selected = Array.from(scope.querySelectorAll('[data-ky-annual-select]:checked:not(:disabled)')).map(input => ({ id: input.value, rowVersion: Number(input.dataset.version || 0) }));
            if (!selected.length) { showToast('เลือกรายการที่ Verified และยืนยัน External Backup ก่อน', 'warning'); return; }
            const selectedRows = (_kyAnnualVideoData?.evidence || []).filter(row => selected.some(item => String(item.id) === String(row.id)));
            const selectedBytes = selectedRows.reduce((total, row) => total + Number(row.FileSize || 0), 0);
            const reason = window.prompt('ระบุเหตุผลการลบไฟล์จาก Production (Metadata, SHA-256 และ Audit จะยังอยู่)', '') ?? null;
            if (!reason?.trim()) return;
            const confirmed = await showConfirmationModal('ยืนยันลบไฟล์ Production', `ลบวิดีโอ ${selected.length} รายการ (${formatFileSize(selectedBytes)}) จาก Production ใช่หรือไม่? ระบบตรวจแล้วว่าทุกรายการมี External Backup ที่ Admin Verify และ SHA-256 ตรงกัน การลบย้อนกลับไม่ได้ แต่ Metadata และ Audit จะคงอยู่`);
            if (!confirmed) return;
            await API.post('/ky/annual-video-evidence/delete-production', { items: selected, reason: reason.trim() });
            showToast(`ลบไฟล์ Production แล้ว ${selected.length} รายการ`, 'success');
            await renderKyAnnualVideoEvidence();
            return;
        }

        const inventoryRegisterBtn = e.target.closest('[data-ky-inventory-register]');
        if (inventoryRegisterBtn) {
            const activityId = inventoryRegisterBtn.dataset.kyInventoryRegister;
            const defaultName = String(inventoryRegisterBtn.dataset.productionName || '').trim();
            const enteredName = window.prompt('ระบุชื่อไฟล์วิดีโอที่เก็บไว้ในเครื่องกลาง', defaultName) ?? null;
            const fileName = String(enteredName || '').trim().replace(/[\\/]+/g, '_').slice(0, 255);
            if (!fileName) return;
            const reference = buildKyInventoryBackupReference({ name: fileName });
            try {
                await runKyButtonAction(inventoryRegisterBtn, 'กำลังลงทะเบียน...', async () => {
                    setKyInventoryRegistrationStatus(activityId, 'progress', `กำลังลงทะเบียน: ${fileName}`);
                    await API.post('/ky/video-inventory/declare', {
                        activityId,
                        externalReference: reference,
                        externalBackupConfirmed: true,
                        originalFileName: fileName,
                        registrationMode: 'AdminAttested',
                    });
                    setKyInventoryRegistrationStatus(activityId, 'success', `ลงทะเบียนสำเร็จ: ${fileName} · รอ Admin Verify`);
                    showToast(`ลงทะเบียนสำเร็จ · ${reference} · รอ Admin Verify`, 'success');
                    await renderKyAnnualVideoEvidence();
                });
            } catch (error) {
                const registrationError = kyInventoryRegistrationError(error);
                setKyInventoryRegistrationStatus(activityId, 'error', `ลงทะเบียนไม่สำเร็จ: ${registrationError.message}`);
                showError(registrationError);
            }
            return;
        }

        const inventoryVerifyBtn = e.target.closest('[data-ky-inventory-verify], [data-ky-inventory-correction]');
        if (inventoryVerifyBtn) {
            const isCorrection = inventoryVerifyBtn.hasAttribute('data-ky-inventory-correction');
            const id = isCorrection ? inventoryVerifyBtn.dataset.kyInventoryCorrection : inventoryVerifyBtn.dataset.kyInventoryVerify;
            const note = window.prompt(isCorrection ? 'ระบุสิ่งที่ต้องแก้ไข' : 'หมายเหตุการตรวจสอบ (เว้นว่างได้)', '') ?? null;
            if (note === null || (isCorrection && !note.trim())) return;
            await API.post(`/ky/video-inventory/${encodeURIComponent(id)}/verify`, {
                status: isCorrection ? 'NeedsCorrection' : 'Verified',
                rowVersion: Number(inventoryVerifyBtn.dataset.version || 0),
                note: note.trim(),
            });
            showToast(isCorrection ? 'ส่ง Inventory กลับเพื่อแก้ไขแล้ว' : 'Admin Verify Inventory สำเร็จ', 'success');
            await renderKyAnnualVideoEvidence();
            return;
        }

        const inventoryDownloadBtn = e.target.closest('[data-ky-inventory-download]');
        if (inventoryDownloadBtn) {
            await runKyButtonAction(inventoryDownloadBtn, 'กำลังดาวน์โหลด...', () => downloadKyInventoryVideo(inventoryDownloadBtn.dataset.kyInventoryDownload, inventoryDownloadBtn.dataset.name));
            return;
        }

        const inventoryAuditBtn = e.target.closest('[data-ky-inventory-audit]');
        if (inventoryAuditBtn) { await showKyInventoryAudit(inventoryAuditBtn.dataset.kyInventoryAudit); return; }

        const inventoryDetailBtn = e.target.closest('[data-ky-inventory-detail]');
        if (inventoryDetailBtn) { showKyVideoEvidenceDetail('inventory', inventoryDetailBtn.dataset.kyInventoryDetail); return; }

        const deleteInventoryItems = async items => {
            if (!items.length) { showToast('เลือกรายการ Inventory ที่ Verified และ SHA-256 ตรงกันก่อน', 'warning'); return; }
            const selectedRows = (_kyAnnualVideoData?.inventory || []).filter(row => items.some(item => String(item.id) === String(row.id)));
            const selectedBytes = selectedRows.reduce((total, row) => total + Number(row.FileSize || 0), 0);
            const reason = window.prompt('ระบุเหตุผลการลบไฟล์ Production (Metadata, SHA-256 และ Audit จะยังอยู่)', '') ?? null;
            if (!reason?.trim()) return;
            const confirmed = await showConfirmationModal('ยืนยันลบไฟล์ Production', `ลบวิดีโอ ${items.length} รายการ (${formatFileSize(selectedBytes)}) จาก Production ใช่หรือไม่? ระบบตรวจแล้วว่าทุกรายการมี External Backup ที่ Admin Verify และ fingerprint ของไฟล์ Production ยังไม่เปลี่ยน โดยจะคง Metadata, SHA-256 และ Audit ไว้`);
            if (!confirmed) return;
            await API.post('/ky/video-inventory/delete-production', { items, reason: reason.trim() });
            showToast(`ลบไฟล์ Production แล้ว ${items.length} รายการ และเปลี่ยน Dashboard เป็น External verified`, 'success');
            await renderKyAnnualVideoEvidence();
        };

        const inventoryDeleteOneBtn = e.target.closest('[data-ky-inventory-delete-one]');
        if (inventoryDeleteOneBtn) {
            await deleteInventoryItems([{ id: inventoryDeleteOneBtn.dataset.kyInventoryDeleteOne, rowVersion: Number(inventoryDeleteOneBtn.dataset.version || 0) }]);
            return;
        }

        if (e.target.closest('[data-ky-inventory-delete-selected]')) {
            const trigger = e.target.closest('[data-ky-inventory-delete-selected]');
            const scope = trigger.closest('[data-ky-cleanup-group]') || trigger.closest('[data-ky-annual-view-panel]') || document;
            const selected = Array.from(scope.querySelectorAll('[data-ky-inventory-select]:checked:not(:disabled)')).map(input => ({ id: input.value, rowVersion: Number(input.dataset.version || 0) }));
            await deleteInventoryItems(selected);
            return;
        }

        if (e.target.closest('[data-ky-inventory-check-all]')) {
            const checkAll = e.target.closest('[data-ky-inventory-check-all]');
            const scope = checkAll.closest('[data-ky-cleanup-group]') || document;
            scope.querySelectorAll('[data-ky-inventory-select]:not(:disabled)').forEach(input => { input.checked = Boolean(checkAll.checked); });
            return;
        }

        // Remove participant tag
        const removeBtn = e.target.closest('.ky-remove-participant');
        if (removeBtn) {
            const idx = parseInt(removeBtn.dataset.idx);
            _participants.splice(idx, 1);
            updateParticipantTags();
            return;
        }

        // View detail
        const viewBtn = e.target.closest('.btn-ky-view');
        if (viewBtn) {
            await runKyButtonAction(viewBtn, 'Loading...', async () => {
                await showDetailModal(viewBtn.dataset.id);
            });
            return;
        }

        const followupVideoBtn = e.target.closest('.btn-ky-video-followup');
        if (followupVideoBtn) {
            const record = _kyEvidenceRecords.find(item => String(item.id) === String(followupVideoBtn.dataset.id));
            if (record) openKyFollowupVideoModal(record);
            return;
        }

        // Manage
        const manageBtn = e.target.closest('.btn-ky-manage');
        if (manageBtn) {
            await runKyButtonAction(manageBtn, 'Loading...', async () => {
                await showManageModal(manageBtn.dataset.id);
            });
            return;
        }

        // Delete record
        const delBtn = e.target.closest('.btn-ky-delete');
        if (delBtn) {
            const confirmed = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบกิจกรรม KY ของแผนก "${escHtml(delBtn.dataset.name)}" ใช่หรือไม่?`);
            if (confirmed) {
                showLoading('กำลังลบ...');
                try {
                    await API.delete(`/ky/${delBtn.dataset.id}`);
                    showToast('ลบกิจกรรม KY สำเร็จ', 'success');
                    if (_activeTab === 'history') await fetchAndRenderHistory();
                    if (_activeTab === 'manage') await fetchAndRenderManage('all');
                    await _loadHeroStats();
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // Add config btn
        if (e.target.closest('#ky-add-config-btn')) {
            await openAddConfigModal();
            return;
        }

        // Edit config
        const cfgEditBtn = e.target.closest('.btn-ky-cfg-edit');
        if (cfgEditBtn) {
            const cfg = _kyProgConfig.find(c => String(c.id) === cfgEditBtn.dataset.id);
            if (cfg) await openAddConfigModal(cfg);
            return;
        }

        // Delete config
        const cfgDelBtn = e.target.closest('.btn-ky-cfg-del');
        if (cfgDelBtn) {
            const confirmed = await showConfirmationModal('ลบการตั้งค่า', `ต้องการลบโปรแกรม KY ของแผนก "${escHtml(cfgDelBtn.dataset.dept)}" ใช่หรือไม่?`);
            if (confirmed) {
                showLoading('กำลังลบ...');
                try {
                    await API.delete(`/ky/program-config/${cfgDelBtn.dataset.id}`);
                    showToast('ลบการตั้งค่าสำเร็จ', 'success');
                    await _fetchProgramConfig(_filterMgmtYear);
                    renderManageConfig();
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // Preview image
        const previewBtn = e.target.closest('.btn-ky-preview');
        if (previewBtn) { showDocumentModal(previewBtn.dataset.url, previewBtn.dataset.title); return; }

        // PDF export
        if (e.target.closest('#ky-pdf-btn')) { await exportKyPDF(); return; }

        // Export Excel
        if (e.target.closest('#ky-export-btn')) { exportKyExcel(); return; }

        if (e.target.closest('#ky-video-view-all-btn')) {
            openKyVideoLibrary();
            return;
        }

        const evidenceChartFilterBtn = e.target.closest('[data-ky-evidence-chart-filter]');
        if (evidenceChartFilterBtn) {
            _kyEvidenceChartFilter = evidenceChartFilterBtn.dataset.kyEvidenceChartFilter || 'all';
            _kyEvidenceSelectedKey = '';
            renderKyEvidenceFollowupPanel(_kyEvidenceRecords);
            return;
        }

        const evidenceUnitBtn = e.target.closest('[data-ky-evidence-unit]');
        if (evidenceUnitBtn) {
            const key = evidenceUnitBtn.dataset.kyEvidenceUnit || '';
            const row = buildConfiguredKyEvidenceRows(_kyEvidenceRecords).find(item => item.key === key);
            if (row) openConfiguredKyEvidencePopup(row, _kyEvidenceRecords);
            return;
        }

        const evidenceFilterBtn = e.target.closest('[data-ky-evidence-filter]');
        if (evidenceFilterBtn) {
            _filterHistEvidence = evidenceFilterBtn.dataset.kyEvidenceFilter || 'all';
            _activeTab = 'history';
            window._saveTab?.('ky', 'history');
            await switchTab('history');
            return;
        }

        if (e.target.closest('#ky-video-lib-refresh')) {
            await renderKyVideoLibrary({ ...collectKyVideoLibraryFilters(), page: 1 });
            return;
        }

        const videoLibPageBtn = e.target.closest('.ky-video-lib-page');
        if (videoLibPageBtn) {
            await renderKyVideoLibrary({ ...collectKyVideoLibraryFilters(), page: parseInt(videoLibPageBtn.dataset.page) || 1 });
            return;
        }

        const reactionBtn = e.target.closest('.ky-video-reaction');
        if (reactionBtn) {
            const id = reactionBtn.dataset.id;
            const reaction = reactionBtn.dataset.reaction;
            const current = [...(_kyVideoShowcase || []), ...(_kyVideoLibrary.items || [])]
                .find(v => String(v.id) === String(id))?.MyReaction;
            try {
                if (current === reaction) {
                    await API.delete(`/ky/${id}/reaction`);
                    applyKyVideoReactionState(id, reaction, true);
                    renderVideoShowcaseFromCache();
                    renderKyVideoCardsFromCache(document);
                    showToast('ลบ Reaction แล้ว', 'success');
                } else {
                    await API.post(`/ky/${id}/reaction`, { reaction });
                    applyKyVideoReactionState(id, reaction, false);
                    renderVideoShowcaseFromCache();
                    renderKyVideoCardsFromCache(document);
                    showToast('บันทึก Reaction แล้ว', 'success');
                }
                await renderVideoShowcase();
                if (document.getElementById('ky-video-library-modal')) {
                    await renderKyVideoLibrary({ ...collectKyVideoLibraryFilters(), page: _kyVideoLibrary.pagination?.page || 1 });
                }
            } catch (err) {
                showError(err);
            }
            return;
        }

        const pinBtn = e.target.closest('.ky-video-pin');
        if (pinBtn) {
            try {
                const nextPinned = pinBtn.dataset.pinned === '1';
                await API.put(`/ky/${pinBtn.dataset.id}/video-dashboard`, nextPinned ? { pinned: true, show: true } : { pinned: false });
                showToast('อัปเดตวิดีโอเด่นแล้ว', 'success');
                await renderVideoShowcase();
                if (document.getElementById('ky-video-library-modal')) {
                    await renderKyVideoLibrary({ ...collectKyVideoLibraryFilters(), page: _kyVideoLibrary.pagination?.page || 1 });
                }
            } catch (err) { showError(err); }
            return;
        }

        const visibilityBtn = e.target.closest('.ky-video-visibility, .ky-video-hide');
        if (visibilityBtn) {
            const nextShow = visibilityBtn.dataset.show === '1';
            const libraryWasOpen = Boolean(visibilityBtn.closest('#ky-video-library-modal'));
            const libraryFilters = libraryWasOpen ? collectKyVideoLibraryFilters() : null;
            const libraryPage = _kyVideoLibrary.pagination?.page || 1;
            const confirmed = nextShow || await showConfirmationModal('ซ่อนวิดีโอจาก Dashboard', 'ต้องการซ่อนวิดีโอนี้จาก KY Dashboard ใช่หรือไม่?');
            if (confirmed) {
                try {
                    await API.put(`/ky/${visibilityBtn.dataset.id}/video-dashboard`, nextShow ? { show: true } : { show: false, pinned: false });
                    showToast(nextShow ? 'แสดงวิดีโอแล้ว' : 'ซ่อนวิดีโอแล้ว', 'success');
                    await renderVideoShowcase();
                    if (libraryWasOpen) {
                        openKyVideoLibrary({ ...libraryFilters, page: libraryPage });
                    } else if (document.getElementById('ky-video-library-modal')) {
                        await renderKyVideoLibrary({ ...collectKyVideoLibraryFilters(), page: _kyVideoLibrary.pagination?.page || 1 });
                    }
                } catch (err) { showError(err); }
            }
            return;
        }

        const kpiFilterBtn = e.target.closest('[data-ky-kpi-filter]');
        if (kpiFilterBtn) {
            _filterStatus = kpiFilterBtn.dataset.kyKpiFilter || 'all';
            _filterHistYear = _statsYear;
            await switchTab('history');
            return;
        }

        if (e.target.closest('#ky-history-clear')) {
            _filterStatus = 'all';
            _filterHistDept = 'all';
            _filterHistRisk = 'all';
            _filterHistSource = 'all';
            _filterHistEvidence = 'all';
            _filterDateFrom = '';
            _filterDateTo = '';
            _searchQ = '';
            const content = document.getElementById('ky-tab-content');
            if (content) await renderHistory(content);
            return;
        }

        if (e.target.closest('[data-ky-open-history]')) {
            _filterHistYear = _filterMgmtYear;
            _filterHistDept = _filterMgmtDept;
            _filterHistRisk = _filterMgmtRisk;
            await switchTab('history');
            return;
        }

        if (e.target.closest('[data-ky-reminder-send-ready]')) {
            await sendKyMissingSubmissionReminders();
            return;
        }

        const reminderBtn = e.target.closest('[data-ky-reminder-send-key]');
        if (reminderBtn) {
            await sendKyMissingSubmissionReminders([reminderBtn.dataset.kyReminderSendKey]);
            return;
        }

        const retryAllBtn = e.target.closest('[data-ky-email-retry-all]');
        if (retryAllBtn) {
            await retryKyEmailOutbox();
            return;
        }

        const retryEmailBtn = e.target.closest('[data-ky-email-retry-id]');
        if (retryEmailBtn) {
            await retryKyEmailOutbox(retryEmailBtn.dataset.kyEmailRetryId);
            return;
        }
    }, delegatedActionOptions('ky')));

    // Filter + search changes
    document.addEventListener('change', async (e) => {
        if (!e.target.closest('#ky-page') && !e.target.closest('#ky-video-library-modal')) return;
        if (e.target.id === 'ky-filter-status') { _filterStatus = e.target.value; await fetchAndRenderHistory(); return; }
        if (e.target.id === 'ky-hist-date-from' || e.target.id === 'ky-hist-date-to') {
            if (e.target.id === 'ky-hist-date-from') _filterDateFrom = e.target.value;
            else _filterDateTo = e.target.value;
            const from = document.getElementById('ky-hist-date-from');
            const to = document.getElementById('ky-hist-date-to');
            const invalid = Boolean(_filterDateFrom && _filterDateTo && _filterDateFrom > _filterDateTo);
            from?.setCustomValidity(invalid ? 'วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด' : '');
            to?.setCustomValidity(invalid ? 'วันที่สิ้นสุดต้องไม่อยู่ก่อนวันที่เริ่มต้น' : '');
            if (invalid) { e.target.reportValidity(); return; }
            await fetchAndRenderHistory();
            return;
        }
        if (e.target.id === 'ky-hist-year') {
            _filterHistYear = parseInt(e.target.value);
            _kyProgConfig = []; // clear so renderHistory fetches fresh config for new year
            const c = document.getElementById('ky-tab-content');
            if (c) await renderHistory(c); // full re-render: updates info banner + dept dropdown
            return;
        }
        if (e.target.id === 'ky-hist-dept')     { _filterHistDept = e.target.value; await fetchAndRenderHistory(); return; }
        if (e.target.id === 'ky-hist-risk')     { _filterHistRisk = e.target.value; await fetchAndRenderHistory(); return; }
        if (e.target.id === 'ky-hist-source')   { _filterHistSource = e.target.value; await fetchAndRenderHistory(); return; }
        if (e.target.id === 'ky-hist-evidence') { _filterHistEvidence = e.target.value; await fetchAndRenderHistory(); return; }
        if (e.target.id === 'ky-mgmt-year')     {
            _filterMgmtYear = parseInt(e.target.value);
            _kyProgConfig = [];
            await _fetchProgramConfig(_filterMgmtYear);
            await _renderManagePanel();
            return;
        }
        if (e.target.id === 'ky-mgmt-dept')     { _filterMgmtDept = e.target.value; await fetchAndRenderManage('all'); return; }
        if (e.target.id === 'ky-mgmt-risk')     { _filterMgmtRisk = e.target.value; await fetchAndRenderManage('all'); return; }
        if (e.target.id === 'ky-stats-year')    { _statsYear = parseInt(e.target.value); const c = document.getElementById('ky-tab-content'); if (c) await renderDashboard(c); return; }
        if (e.target.closest('#ky-video-library-modal') && [
            'ky-video-lib-year',
            'ky-video-lib-risk',
            'ky-video-lib-status',
            'ky-video-lib-dept',
            'ky-video-lib-pinned',
            'ky-video-lib-show',
            'ky-video-lib-page-size',
        ].includes(e.target.id)) {
            await renderKyVideoLibrary({ ...collectKyVideoLibraryFilters(), page: 1 });
            return;
        }
    });

    document.addEventListener('input', debounce(async (e) => {
        if (!e.target.closest('#ky-page')) return;
        if (e.target.id === 'ky-history-search') { _searchQ = e.target.value; await fetchAndRenderHistory(); }
    }, 350));

    document.addEventListener('input', debounce(async (e) => {
        if (!e.target.closest('#ky-video-library-modal')) return;
        if (e.target.id === 'ky-video-lib-q') {
            await renderKyVideoLibrary({ ...collectKyVideoLibraryFilters(), page: 1 });
        }
    }, 450));

    document.addEventListener('contextmenu', _kyShowCardContextMenu);
    document.addEventListener('pointerdown', _kyStartCardImageHold);
    document.addEventListener('pointermove', _kyMoveCardImageHold);
    document.addEventListener('pointerup', _kyCancelCardImageHold);
    document.addEventListener('pointercancel', _kyCancelCardImageHold);
}

function _kyShowCardContextMenu(event) {
    const card = event.target?.closest?.('[data-ky-card-image]');
    if (!card || !document.getElementById('ky-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,video,[contenteditable="true"]')) return;
    event.preventDefault();
    _kyShowCardImageMenu(card, event.clientX, event.clientY);
}

function _kyStartCardImageHold(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const card = event.target?.closest?.('[data-ky-card-image]');
    if (!card || !document.getElementById('ky-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,video,[contenteditable="true"]')) return;
    _kyCancelCardImageHold();
    _kyCardSaveHold = {
        card,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
            if (!_kyCardSaveHold || _kyCardSaveHold.card !== card) return;
            _kyShowCardImageMenu(card, _kyCardSaveHold.x, _kyCardSaveHold.y);
        }, 800),
    };
}

function _kyMoveCardImageHold(event) {
    if (!_kyCardSaveHold || event.pointerId !== _kyCardSaveHold.pointerId) return;
    if (Math.abs(event.clientX - _kyCardSaveHold.x) > 10 || Math.abs(event.clientY - _kyCardSaveHold.y) > 10) {
        _kyCancelCardImageHold();
    }
}

function _kyCancelCardImageHold() {
    if (_kyCardSaveHold?.timer) clearTimeout(_kyCardSaveHold.timer);
    _kyCardSaveHold = null;
}

function _kyShowCardImageMenu(card, clientX, clientY) {
    _kyHideCardImageMenu();
    const menu = document.createElement('div');
    menu.id = 'ky-card-save-menu';
    menu.className = 'fixed z-[9999] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl';
    menu.style.minWidth = '170px';
    menu.innerHTML = `
        <button type="button" data-ky-card-save-action
            class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-black text-slate-700 hover:bg-emerald-50 hover:text-emerald-700">
            <svg class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m4 7H5a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2z"/>
            </svg>
            บันทึกเป็นรูปภาพ
        </button>`;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const left = Math.min(Math.max(8, clientX), window.innerWidth - rect.width - 8);
    const top = Math.min(Math.max(8, clientY), window.innerHeight - rect.height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    _kyCardSaveMenu = { card, menu };
}

function _kyHideCardImageMenu() {
    _kyCardSaveMenu?.menu?.remove?.();
    _kyCardSaveMenu = null;
}

async function _kyDownloadCardImage(card) {
    const targetName = card?.dataset?.kyCardImage || 'ky-card';
    const sharedTargets = new Set(['ky-program-progress', 'ky-evidence-completion']);
    const sharedEnabled = sharedTargets.has(targetName)
        && isSharedCardImageExportEnabled(undefined, 'ky');
    if (!sharedEnabled) return _kyDownloadCardImageLegacy(card);

    const name = _kySafeFilePart(targetName);
    try {
        showLoading('Saving card image...');
        const result = await captureCardImage(card, {
            filename: `${name}-${_statsYear}`,
            width: 1400,
            maxHeight: 5000,
            fullHeightViewport: true,
            expandTruncatedText: true,
            prepareClone: clone => {
                clone.style.setProperty('position', 'absolute', 'important');
                clone.style.setProperty('inset', '0 auto auto 0', 'important');
                clone.style.setProperty('margin', '0', 'important');
                clone.querySelectorAll('[data-ky-card-ignore], #ky-card-save-menu').forEach(element => {
                    element.style.setProperty('display', 'none', 'important');
                });
                clone.querySelectorAll('[data-ky-evidence-unit]').forEach(element => {
                    element.style.setProperty('display', 'block', 'important');
                    element.style.setProperty('width', '100%', 'important');
                    element.style.setProperty('height', 'auto', 'important');
                    element.style.setProperty('min-height', '0', 'important');
                    element.style.setProperty('overflow', 'visible', 'important');
                    element.style.setProperty('opacity', '1', 'important');
                    element.style.setProperty('visibility', 'visible', 'important');
                });
                clone.querySelectorAll('[data-ky-evidence-department], [data-ky-progress-dept-header]').forEach(element => {
                    element.style.setProperty('break-inside', 'avoid', 'important');
                });
            },
        });
        document.dispatchEvent(new CustomEvent('tsh:card-image-export-complete', {
            detail: { module: 'ky', target: targetName, engine: 'shared', width: result.width, height: result.height },
        }));
        showToast('บันทึกเป็นรูปภาพการ์ดแล้ว', 'success');
    } catch (error) {
        console.warn('[CardImageExport] KY shared capture failed; using legacy fallback.', error);
        document.dispatchEvent(new CustomEvent('tsh:card-image-export-complete', {
            detail: { module: 'ky', target: targetName, engine: 'legacy-fallback', errorCode: error?.code || 'CAPTURE_FAILED' },
        }));
        hideLoading();
        return _kyDownloadCardImageLegacy(card);
    } finally {
        hideLoading();
    }
}

async function _kyDownloadCardImageLegacy(card) {
    if (typeof html2canvas === 'undefined') {
        showToast('ไม่พบ library สำหรับบันทึกรูปภาพ', 'error');
        return;
    }
    const name = _kySafeFilePart(card.dataset.kyCardImage || 'ky-card');
    try {
        showLoading('Saving card image...');
        const canvas = await html2canvas(card, {
            backgroundColor: '#ffffff',
            scale: Math.min(2, window.devicePixelRatio || 1.5),
            useCORS: true,
            onclone: doc => {
                doc.querySelectorAll('[data-ky-card-ignore]').forEach(el => { el.style.display = 'none'; });
            },
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${name}-${_statsYear}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('บันทึกรูปภาพการ์ดแล้ว', 'success');
    } catch (err) {
        showToast(err?.message || 'บันทึกรูปภาพการ์ดไม่สำเร็จ', 'error');
    } finally {
        hideLoading();
    }
}

function _kySafeFilePart(value) {
    return String(value || 'ky-card')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'ky-card';
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL EXPORT
// ─────────────────────────────────────────────────────────────────────────────
function exportKyExcel() {
    if (!window.XLSX) { showToast('ไม่พบ SheetJS library — กรุณารีเฟรชหน้า', 'error'); return; }
    if (!_historyRecords.length) { showToast('ไม่มีข้อมูลสำหรับ Export', 'warning'); return; }

    const rows = _historyRecords.map(r => {
        let parts = [];
        try { parts = JSON.parse(r.Participants || '[]'); } catch { parts = []; }
        return {
            'วันที่กิจกรรม':       r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH') : '-',
            'แผนก':               r.Department       || '-',
            'Safety Unit':        r.SafetyUnit       || '-',
            'ทีม':                r.TeamName         || '-',
            'ผู้รายงาน':           r.ReporterName     || '-',
            'รูปแบบการบันทึก':     isKySubmittedOnBehalf(r) ? 'Admin ส่งแทน' : 'ส่งตามบัญชีผู้รายงาน',
            'ผู้บันทึกจริง':        r.SubmittedByName  || r.ReporterName || '-',
            'KYT Keyword':        r.KYTKeyword       || '-',
            'ประเภทอันตราย':       r.RiskCategory     || '-',
            'รายละเอียดอันตราย':   r.HazardDescription || '-',
            'มาตรการตอบโต้':       r.Countermeasure   || '-',
            'ผู้เข้าร่วม':         parts.join(', ')   || '-',
            'จำนวนผู้เข้าร่วม':    parts.length,
            'สถานะ':              STATUS_LABEL[r.Status] || r.Status || '-',
        };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KY Activities');

    const colWidths = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length * 2, 12) }));
    ws['!cols'] = colWidths;

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `KY_Activities_${today}.xlsx`);
    showToast('Export สำเร็จ', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT
// ─────────────────────────────────────────────────────────────────────────────
async function exportKyPDF() {
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        showToast('ไม่พบ library สำหรับสร้าง PDF', 'error');
        return;
    }
    showLoading('กำลังสร้าง PDF...');
    try {
        // Fetch KY-specific stats and follow-up items for the formal PDF pack.
        const [statsRes, actionRes, reviewedRes, evidenceRes, fileHealthRes] = await Promise.all([
            API.get(`/ky/stats?year=${_statsYear}`),
            API.get(`/ky?year=${_statsYear}&status=Open`).catch(() => ({ data: [] })),
            API.get(`/ky?year=${_statsYear}&status=Reviewed`).catch(() => ({ data: [] })),
            API.get(`/ky/evidence-overview?year=${_statsYear}`).catch(() => ({ data: null })),
            API.get(`/ky/file-health?year=${_statsYear}`).catch(() => ({ data: null })),
        ]);

        const data     = statsRes?.data || {};
        const kpi      = data.kpi  || {};
        const counts   = Array(12).fill(0);
        (data.monthly || []).forEach(r => { counts[(r.month || 1) - 1] = r.count || 0; });
        const maxCount   = Math.max(...counts, 1);
        const today      = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        const openItems  = normalizeApiArray(actionRes?.data ?? actionRes);
        const reviewItems = normalizeApiArray(reviewedRes?.data ?? reviewedRes);
        const actionItems = [...openItems, ...reviewItems].sort((a, b) => {
            const rank = row => !kyHasEvidenceFile(row) ? 0 : (!kyHasEvidenceVideo(row) ? 1 : 2);
            return rank(a) - rank(b) || String(b.ActivityDate || '').localeCompare(String(a.ActivityDate || ''));
        });
        const evidenceData = evidenceRes?.data || null;
        const fileHealthData = fileHealthRes?.data || null;

        const { jsPDF } = jspdf;
        const pdf       = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const render = async (html) => {
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1122px;background:#fff;font-family:Kanit,sans-serif;overflow:hidden;';
            div.innerHTML = html;
            document.body.appendChild(div);
            const canvas = await html2canvas(div, { scale: 1.5, useCORS: true, logging: false, width: 794, height: 1122 });
            document.body.removeChild(div);
            return canvas;
        };

        // Page 1 — Executive Summary + Trend + Risk
        const canvas1 = await render(_buildKyExecutivePdfPage1(data, kpi, counts, maxCount, _statsYear, today));
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);

        // Page 2 — Coverage + Actions + Approval
        pdf.addPage();
        const canvas2 = await render(_buildKyExecutivePdfPage2(data, actionItems, evidenceData, fileHealthData, _statsYear, today));
        pdf.addImage(canvas2.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);

        pdf.save(`KY_Activity_${_statsYear}.pdf`);
        showToast('สร้าง PDF สำเร็จ (2 หน้า)', 'success');
    } catch (err) {
        console.error('KY PDF error:', err);
        showToast('ไม่สามารถสร้าง PDF ได้', 'error');
    } finally {
        hideLoading();
    }
}

function _buildKyExecutivePdfPage1(data, kpi, counts, maxCount, year, today) {
    const byDept = data.byDept || [];
    const riskCat = data.riskCat || [];
    const topKeywords = data.topKeywords || [];
    const closureRate = kpi.total > 0 ? Math.round(((kpi.closed || 0) / kpi.total) * 100) : 0;
    const targetTotal = Number(kpi.targetTotal || 0);
    const targetSubmitted = Number(kpi.targetSubmitted || 0);
    const targetRate = targetTotal ? Math.round((targetSubmitted / targetTotal) * 100) : (Number(kpi.completionRate) || 0);
    const pendingCount = Number(kpi.open || 0) + Number(kpi.reviewed || 0);
    const healthLabel = targetRate >= 85 && pendingCount === 0 ? 'Stable' : targetRate >= 60 ? 'Watch' : 'Action';
    const healthColor = healthLabel === 'Stable' ? '#059669' : healthLabel === 'Watch' ? '#d97706' : '#dc2626';
    const K = "font-family:'Kanit',sans-serif;";
    const sectionTitle = (title, sub = '') => `<div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px"><div><h2 style="${K}font-size:14px;font-weight:900;color:#065f46;margin:0">${title}</h2>${sub ? `<p style="${K}font-size:9.5px;color:#64748b;margin:2px 0 0">${sub}</p>` : ''}</div></div>`;
    const reportHeader = `<div style="background:#065f46;color:#fff;padding:18px 28px;flex-shrink:0"><div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start"><div><p style="${K}font-size:10px;opacity:.82;margin:0 0 3px">Thai Summit Harness Co., Ltd. · Safety Summary Report</p><h1 style="${K}font-size:21px;font-weight:900;margin:0;line-height:1.18">KY Activity Report</h1><p style="${K}font-size:11px;opacity:.9;margin:5px 0 0">Hazard Prediction Activity · ประจำปี ${year}</p></div><div style="${K}text-align:right;font-size:9.5px;line-height:1.55;opacity:.92"><div>Generated: ${today}</div><div>Period: ${year}</div><div style="margin-top:4px;font-size:8.5px;opacity:.75">KY-${year}</div></div></div></div>`;
    const reportFooter = `<div style="margin-top:auto;padding:8px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;display:flex;align-items:center;justify-content:space-between;flex-shrink:0"><span style="${K}font-size:8.8px">KY Activity Report · Thai Summit Harness Co., Ltd.</span><span style="${K}font-size:8.8px">Page 1 / 2 · Summary</span></div>`;
    const kpiBoxes = [
        { label: 'KY Activities', value: kpi.total || 0, color: '#0f766e' },
        { label: 'Coverage', value: `${kpi.deptSubmitted || 0}/${kpi.totalDepts || 0}`, color: '#2563eb' },
        { label: 'Target', value: targetTotal ? `${targetSubmitted}/${targetTotal}` : '-', color: '#0f766e' },
        { label: 'Target Rate', value: `${targetRate}%`, color: targetRate >= 80 ? '#059669' : targetRate >= 50 ? '#d97706' : '#dc2626' },
        { label: 'Pending Dept.', value: kpi.pendingDepts || 0, color: (kpi.pendingDepts || 0) ? '#f97316' : '#64748b' },
        { label: 'Close Rate', value: `${closureRate}%`, color: '#0f766e' },
    ];
    const keyNotes = [
        `Program target ${targetSubmitted}/${targetTotal || '-'} (${targetRate}%)`,
        `Department coverage ${kpi.deptSubmitted || 0}/${kpi.totalDepts || 0} · Safety Units ${kpi.safetyUnitsTotal || '-'}`,
        `Open ${kpi.open || 0} · Reviewed ${kpi.reviewed || 0} · Closed ${kpi.closed || 0}`,
        byDept[0] ? `Top department: ${byDept[0].Department || '-'} (${byDept[0].count || 0})` : 'No department activity in current scope',
    ];
    const monthBars = MONTHS_TH.map((label, i) => {
        const count = counts[i];
        const pct = Math.round(count / maxCount * 100);
        return `
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;">
            <span style="width:30px;font-size:10px;color:#64748b;text-align:right;">${label}</span>
            <div style="flex:1;height:11px;background:#f1f5f9;border-radius:4px;overflow:hidden;">
                ${count ? `<div style="height:100%;width:${pct}%;background:#0f766e;border-radius:4px;"></div>` : ''}
            </div>
            <span style="width:20px;font-size:10px;color:#334155;text-align:right;font-weight:700;">${count}</span>
        </div>`;
    }).join('');
    const riskRows = riskCat.slice(0, 6).map((r, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding:6px 0;">
            <span style="font-size:11px;color:#334155;font-weight:700;">${i + 1}. ${escHtml(r.label || '-')}</span>
            <span style="font-size:11px;color:#0f766e;font-weight:800;">${r.count || 0}</span>
        </div>`).join('');
    const deptRows = byDept.slice(0, 6).map((d, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding:6px 0;">
            <span style="font-size:11px;color:#334155;font-weight:700;">${i + 1}. ${escHtml(d.Department || '-')}</span>
            <span style="font-size:11px;color:#059669;font-weight:800;">${d.count || 0}</span>
        </div>`).join('');
    const keywordRows = topKeywords.slice(0, 5).map((k, i) => `
        <span style="display:inline-block;margin:0 5px 6px 0;border:1px solid #bbf7d0;background:#f0fdf4;color:#065f46;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:700;">${i + 1}. ${escHtml(k.keyword || '-')} (${k.count || 0})</span>
    `).join('');

    return `
    <div style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;font-family:Kanit,sans-serif;color:#1e293b;">
        ${reportHeader}
        <div style="display:none">
            <div style="color:rgba(224,231,255,0.9);font-size:11px;font-weight:800;letter-spacing:0.08em;">KY EXECUTIVE PACK · HAZARD PREDICTION</div>
            <div style="color:#fff;font-size:26px;font-weight:800;line-height:1.2;margin-top:6px;">รายงานภาพรวมกิจกรรม KY ปี ${year}</div>
            <div style="color:rgba(224,231,255,0.85);font-size:12px;margin-top:6px;">Thai Summit Harness Co., Ltd. · สร้างเมื่อ ${today}</div>
        </div>
        <div style="flex:1;padding:18px 28px 14px;display:flex;flex-direction:column;gap:10px;min-height:0">
        ${sectionTitle('1. Report Summary / ภาพรวมรายงาน', 'สรุปกิจกรรม KY สถานะการส่ง และแนวโน้มรายเดือน')}
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;">
            ${kpiBoxes.map(b => `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:9px;text-align:center;min-height:66px">
                <div style="font-size:21px;font-weight:900;color:${b.color};line-height:1">${b.value}</div>
                <div style="font-size:8.7px;color:#475569;margin-top:6px;font-weight:800;">${b.label}</div>
            </div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:1.15fr .85fr;gap:12px;">
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
                <div style="font-size:12px;font-weight:900;color:#065f46;margin-bottom:8px">Key Notes / ประเด็นสำคัญ</div>
                ${keyNotes.map(t => `<div style="font-size:10.1px;color:#334155;margin-bottom:5px;display:flex;gap:6px"><span style="color:#f97316;font-weight:900">•</span><span>${escHtml(t)}</span></div>`).join('')}
            </div>
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center;">
                <div style="font-size:12px;font-weight:900;color:#065f46;margin-bottom:6px">Report Health</div>
                <div style="font-size:36px;font-weight:900;line-height:1;color:${healthColor}">${healthLabel}</div>
                <div style="font-size:9px;color:#64748b;margin:8px 0 9px">Target ${targetRate}% · Pending items ${pendingCount}</div>
                <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(0, Math.min(100, targetRate))}%;background:${healthColor};border-radius:999px"></div></div>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1.05fr .95fr;gap:12px;min-height:0;">
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
                ${sectionTitle('2. Monthly KY Trend', 'จำนวนกิจกรรมแยกรายเดือน')}
                ${monthBars}
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
                    ${sectionTitle('3. Top Risk Categories', 'ประเด็นเสี่ยงที่พบบ่อย')}
                    ${riskRows || '<div style="font-size:11px;color:#94a3b8;">ไม่มีข้อมูล</div>'}
                </div>
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
                    ${sectionTitle('4. Top Departments', 'ส่วนงานที่มีกิจกรรมสูงสุด')}
                    ${deptRows || '<div style="font-size:11px;color:#94a3b8;">ไม่มีข้อมูล</div>'}
                </div>
            </div>
        </div>
        <div>
            <div style="border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;padding:14px;">
                ${sectionTitle('5. Recurring KYT Keywords', 'Key Learning Themes')}
                ${keywordRows || '<span style="font-size:11px;color:#94a3b8;">ยังไม่มี Keyword สำหรับวิเคราะห์</span>'}
            </div>
        </div>
        </div>
        <div style="display:none">
            <span style="color:rgba(224,231,255,0.9);font-size:10px;">KY Executive Pack · Summary</span>
            <span style="color:rgba(224,231,255,0.9);font-size:10px;">หน้า 1 จาก 2</span>
        </div>
        ${reportFooter}
    </div>`;
}

function _buildKyExecutivePdfPage2(data, actionItems, evidenceData, fileHealthData, year, today) {
    const progress = (data.programProgress || []).slice().sort((a, b) => a.pct - b.pct || a.department.localeCompare(b.department));
    const pendingDepts = data.pendingDepts || [];
    const pendingUnits = data.pendingUnits || [];
    const kpi = data.kpi || {};
    const evidenceRows = normalizeApiArray(evidenceData?.rows || []);
    const evidenceSummary = evidenceRows.reduce((sum, row) => {
        sum.scopes += 1;
        sum.submitted += Number(row.submitted || 0);
        sum.complete += Number(row.complete || 0);
        sum.waitingVideo += Number(row.waitingVideo || 0);
        sum.missingFile += Number(row.missingFile || 0);
        sum.productionVideo += Number(row.productionVideo || 0);
        sum.verifiedExternalVideo += Number(row.verifiedExternalVideo || 0);
        sum.pendingExternalVideo += Number(row.pendingExternalVideo || 0);
        if (!String(row.safetyUnit || '').trim()) sum.departmentScopes += 1;
        return sum;
    }, { scopes: 0, submitted: 0, complete: 0, waitingVideo: 0, missingFile: 0, productionVideo: 0, verifiedExternalVideo: 0, pendingExternalVideo: 0, departmentScopes: 0 });
    const fileHealthSummary = fileHealthData?.summary || null;
    const evidenceBox = (label, value, color, note = '') => `
        <div style="border:1px solid #e2e8f0;border-radius:9px;background:#fff;padding:8px;text-align:center;">
            <div style="font-size:17px;font-weight:900;color:${color};line-height:1">${value}</div>
            <div style="font-size:7.6px;color:#475569;font-weight:900;margin-top:4px">${label}</div>
            ${note ? `<div style="font-size:6.8px;color:#94a3b8;margin-top:2px">${note}</div>` : ''}
        </div>`;
    const K = "font-family:'Kanit',sans-serif;";
    const sectionTitle = (title, sub = '') => `<div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px"><div><h2 style="${K}font-size:14px;font-weight:900;color:#065f46;margin:0">${title}</h2>${sub ? `<p style="${K}font-size:9.5px;color:#64748b;margin:2px 0 0">${sub}</p>` : ''}</div></div>`;
    const reportHeader = `<div style="background:#065f46;color:#fff;padding:18px 28px;flex-shrink:0"><div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start"><div><p style="${K}font-size:10px;opacity:.82;margin:0 0 3px">Thai Summit Harness Co., Ltd. · Safety Summary Report</p><h1 style="${K}font-size:21px;font-weight:900;margin:0;line-height:1.18">KY Activity Follow-up</h1><p style="${K}font-size:11px;opacity:.9;margin:5px 0 0">Coverage, Follow-up & Approval · ประจำปี ${year}</p></div><div style="${K}text-align:right;font-size:9.5px;line-height:1.55;opacity:.92"><div>Generated: ${today}</div><div>Period: ${year}</div><div style="margin-top:4px;font-size:8.5px;opacity:.75">KY-${year}</div></div></div></div>`;
    const reportFooter = `<div style="margin-top:auto;padding:8px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;display:flex;align-items:center;justify-content:space-between;flex-shrink:0"><span style="${K}font-size:8.8px">KY Activity Report · Thai Summit Harness Co., Ltd.</span><span style="${K}font-size:8.8px">Page 2 / 2 · Follow-up</span></div>`;
    const actionRows = actionItems.slice(0, 7).map((r, i) => {
        const date = r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-';
        const hazard = (r.HazardDescription || r.KYTKeyword || '-').slice(0, 58);
        const evidence = kyEvidenceStatus(r);
        const evidenceColor = evidence.id === 'missing_file' ? '#dc2626' : evidence.id === 'waiting_video' ? '#7c3aed' : '#059669';
        return `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px 7px;font-size:10px;color:#64748b;">${i + 1}</td>
            <td style="padding:6px 7px;font-size:10px;color:#334155;font-weight:700;">${date}</td>
            <td style="padding:6px 7px;font-size:10px;color:#334155;">${escHtml(r.Department || '-')}</td>
            <td style="padding:6px 7px;font-size:10px;color:#334155;">${escHtml(hazard)} <span style="color:${evidenceColor};font-weight:900;">· ${escHtml(evidence.shortLabel)}</span></td>
            <td style="padding:6px 7px;font-size:10px;color:${r.Status === 'Open' ? '#0284c7' : '#d97706'};font-weight:800;">${STATUS_LABEL[r.Status] || r.Status}</td>
        </tr>`;
    }).join('');
    const progressRows = progress.slice(0, 10).map(d => {
        const pct = Math.max(0, Math.min(100, d.pct || 0));
        const color = pct >= 80 ? '#059669' : pct >= 40 ? '#d97706' : '#ef4444';
        return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;min-height:22px;">
            <span style="width:190px;font-size:8.8px;line-height:1.18;color:#334155;font-weight:700;white-space:normal;overflow:visible;word-break:break-word;">${escHtml(d.department || '-')}</span>
            <div style="flex:1;height:10px;background:#f1f5f9;border-radius:4px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${color};"></div></div>
            <span style="width:48px;text-align:right;font-size:10px;color:#334155;font-weight:800;">${d.submitted || 0}/${d.target || 0}</span>
        </div>`;
    }).join('');
    const unitProgress = progress.flatMap(d => {
        const units = Array.isArray(d.safetyUnitProgress) ? d.safetyUnitProgress : [];
        return units.map(u => ({
            department: d.department || '-',
            name: u.name || '-',
            submitted: Number(u.submitted || 0),
            target: Number(u.target || d.unitTarget || 12),
            pct: Math.max(0, Math.min(100, Number(u.pct || 0))),
        }));
    }).sort((a, b) => a.pct - b.pct || a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
    const unitProgressRows = unitProgress.slice(0, 6).map(u => {
        const color = u.pct >= 80 ? '#059669' : u.pct >= 40 ? '#d97706' : '#ef4444';
        return `
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;min-height:20px;">
            <span style="width:112px;font-size:8.2px;line-height:1.15;color:#334155;font-weight:800;word-break:break-word;">${escHtml(u.name)}</span>
            <span style="width:78px;font-size:7.5px;line-height:1.15;color:#64748b;word-break:break-word;">${escHtml(u.department)}</span>
            <div style="flex:1;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;"><div style="height:100%;width:${u.pct}%;background:${color};"></div></div>
            <span style="width:38px;text-align:right;font-size:8.5px;color:${color};font-weight:900;">${u.submitted}/${u.target}</span>
        </div>`;
    }).join('');
    const pendingUnitChips = pendingUnits.length
        ? pendingUnits.slice(0, 8).map(u => `<span style="display:inline-block;margin:0 4px 5px 0;background:#fff;border:1px solid #fde68a;border-radius:999px;padding:3px 7px;font-size:8px;color:#92400e;font-weight:800;">${escHtml(u.safetyUnit || '-')}</span>`).join('')
        : '';
    const statusItems = [
        { label: 'Open / รอตรวจสอบ', value: kpi.open || 0, color: '#0284c7' },
        { label: 'Reviewed / ตรวจสอบแล้ว', value: kpi.reviewed || 0, color: '#d97706' },
        { label: 'Closed / ปิดแล้ว', value: kpi.closed || 0, color: '#059669' },
    ];
    const approvalBox = label => `
        <div style="height:70px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:9px;text-align:center">
            <div style="height:28px;border-bottom:1px solid #94a3b8;margin:0 8px 6px"></div>
            <div style="font-size:8.5px;font-weight:900;color:#1e293b">${label}</div>
            <div style="font-size:7.5px;color:#94a3b8;margin-top:2px">Date: ____ / ____ / ____</div>
        </div>`;

    return `
    <div style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;font-family:Kanit,sans-serif;color:#1e293b;">
        ${reportHeader}
        <div style="display:none">
            <div style="font-size:15px;font-weight:800;color:#065f46;">Coverage, Follow-up & Approval · ปี ${year}</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px;">สร้างเมื่อ ${today}</div>
        </div>
        <div style="flex:1;padding:18px 28px 14px;display:flex;flex-direction:column;gap:12px;min-height:0">
        <div style="display:grid;grid-template-columns:.95fr 1.05fr;gap:12px;">
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
                ${sectionTitle('6. Department Target Coverage', 'ความคืบหน้าตามเป้าหมายรายส่วนงาน')}
                ${progressRows || '<div style="font-size:11px;color:#94a3b8;">ไม่มี Program Config</div>'}
            </div>
            <div style="border:1px solid #fde68a;border-radius:12px;padding:14px;background:#fffbeb;">
                ${sectionTitle('7. Safety Unit Follow-up', 'ความคืบหน้าและ Unit ที่ยังต้องติดตาม')}
                ${unitProgressRows || '<div style="font-size:11px;color:#94a3b8;">ยังไม่มี Safety Unit ใน Program Config</div>'}
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:7px;margin-bottom:8px;">
                    ${evidenceBox('Configured scopes', evidenceSummary.scopes || kpi.safetyUnitsTotal || '-', '#0f766e', `${evidenceSummary.departmentScopes || 0} dept scope`)}
                    ${evidenceBox('File+Video complete', evidenceSummary.complete || 0, '#059669')}
                    ${evidenceBox('Production video', evidenceSummary.productionVideo || 0, '#0284c7')}
                    ${evidenceBox('External verified', evidenceSummary.verifiedExternalVideo || 0, '#0f766e')}
                    ${evidenceBox('External pending', evidenceSummary.pendingExternalVideo || 0, '#d97706')}
                    ${evidenceBox('Waiting video', evidenceSummary.waitingVideo || 0, '#7c3aed', 'includes pending verify')}
                    ${evidenceBox('Missing file', evidenceSummary.missingFile || 0, '#dc2626')}
                    ${evidenceBox('Video rate', `${data.videoEvidence?.videoEvidenceRate || 0}%`, '#4f46e5')}
                </div>
                <div style="font-size:7.8px;color:#92400e;font-weight:800;margin:-2px 0 7px;">Source of truth: KY Program Config ${year}. Blank SafetyUnit rows are department scope; configured SafetyUnit rows are unit scope.</div>
                <div style="border-top:1px solid #fde68a;margin-top:7px;padding-top:7px">
                    <div style="font-size:8.5px;font-weight:900;color:#92400e;margin-bottom:5px">Pending this period: ${pendingUnits.length || pendingDepts.length || 0}</div>
                    ${pendingUnitChips || (pendingDepts.length ? pendingDepts.slice(0, 6).map(d => `<span style="display:inline-block;margin:0 4px 5px 0;background:#fff;border:1px solid #fde68a;border-radius:999px;padding:3px 7px;font-size:8px;color:#92400e;font-weight:800;">${escHtml(d)}</span>`).join('') : '<div style="font-size:9px;color:#059669;font-weight:800;">ทุก Safety Unit / แผนก ส่งครบในช่วงที่เลือก</div>')}
                </div>
            </div>
        </div>
        <div>
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
                ${sectionTitle('8. Action Follow-up Queue', 'รายการที่ยังต้องติดตาม')}
                <table style="width:100%;border-collapse:collapse;">
                    <thead><tr style="background:#065f46;">
                        <th style="padding:6px 7px;font-size:9px;color:#fff;text-align:left;">#</th>
                        <th style="padding:6px 7px;font-size:9px;color:#fff;text-align:left;">Date</th>
                        <th style="padding:6px 7px;font-size:9px;color:#fff;text-align:left;">Dept</th>
                        <th style="padding:6px 7px;font-size:9px;color:#fff;text-align:left;">Issue</th>
                        <th style="padding:6px 7px;font-size:9px;color:#fff;text-align:left;">Status</th>
                    </tr></thead>
                    <tbody>${actionRows || '<tr><td colspan="5" style="padding:14px;text-align:center;color:#059669;font-size:11px;font-weight:800;">ไม่มีรายการค้างติดตาม</td></tr>'}</tbody>
                </table>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#ffffff;">
                ${sectionTitle('9. Status Control Summary', 'สถานะรายการ KY ที่ต้องควบคุมในรอบรายงาน')}
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                    ${statusItems.map(s => `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center;background:#f8fafc"><div style="font-size:22px;font-weight:900;color:${s.color};line-height:1">${s.value}</div><div style="font-size:8.5px;color:#475569;font-weight:800;margin-top:5px">${s.label}</div></div>`).join('')}
                </div>
                <div style="margin-top:9px;border:1px solid #dbeafe;border-radius:9px;background:#eff6ff;padding:7px 8px;font-size:8.2px;color:#1e40af;font-weight:800;line-height:1.45;">
                    Data freshness: generated ${escHtml(today)} · Source: KY Program Config + KY Activities${fileHealthSummary ? ` · Media health: missing=${fileHealthSummary.missing || 0}, legacyLocalhost=${fileHealthSummary.legacyLocalhost || 0}` : ''}
                </div>
                <div style="font-size:9.5px;color:#475569;line-height:1.55;margin-top:10px;">รายงานนี้สรุปข้อมูล KY ตามปีที่เลือก โดยใช้ข้อมูลจริงจากการส่งกิจกรรม, สถานะการตรวจสอบ, แผนก/Safety Unit, ประเภทความเสี่ยง และคิวติดตามในระบบ</div>
            </div>
            <div style="border:1px solid #d1fae5;background:#f0fdf4;border-radius:12px;padding:14px;">
                ${sectionTitle('10. Certification / Approval', 'สรุปเพื่อรับรองและลงนาม')}
                <div style="font-size:9.5px;color:#334155;line-height:1.55;margin-bottom:10px;">ตรวจทานความครบถ้วนของข้อมูล KY, รายการค้างตรวจ, และแผนกที่ยังไม่ครบเป้าหมาย ก่อนใช้รายงานนี้สำหรับประชุมติดตามความปลอดภัย</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${approvalBox('Prepared By')}${approvalBox('Approved By')}</div>
            </div>
        </div>
        </div>
        <div style="display:none">
            <span style="color:rgba(224,231,255,0.9);font-size:10px;">KY Executive Pack · Follow-up</span>
            <span style="color:rgba(224,231,255,0.9);font-size:10px;">หน้า 2 จาก 2</span>
        </div>
        ${reportFooter}
    </div>`;
}

function _buildKyPdfPage1(kpi, counts, maxCount, year, today) {
    const kpiBoxes = [
        { label: 'กิจกรรมทั้งหมด',  value: kpi.total || 0,              color: '#6366f1' },
        { label: 'แผนกที่ส่งแล้ว',   value: kpi.deptSubmitted || 0,      color: '#10b981' },
        { label: 'แผนกที่ยังไม่ส่ง', value: kpi.pendingDepts || 0,       color: '#f97316' },
        { label: 'Completion Rate',   value: `${kpi.completionRate || 0}%`, color: '#0284c7' },
    ];

    const monthBars = MONTHS_TH.map((label, i) => {
        const count = counts[i];
        const pct   = Math.round(count / maxCount * 100);
        return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
            <span style="width:32px;font-size:10px;color:#64748b;text-align:right;flex-shrink:0;">${label}</span>
            <div style="flex:1;height:14px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
                ${count > 0 ? `<div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:3px;"></div>` : ''}
            </div>
            <span style="width:20px;font-size:10px;color:#374151;text-align:right;flex-shrink:0;">${count}</span>
        </div>`;
    }).join('');

    const statusBoxes = [
        { label: 'รอตรวจสอบ',   value: kpi.open     || 0, bg: '#eff6ff', color: '#1d4ed8' },
        { label: 'ตรวจสอบแล้ว', value: kpi.reviewed  || 0, bg: '#fffbeb', color: '#92400e' },
        { label: 'ปิดแล้ว',     value: kpi.closed    || 0, bg: '#ecfdf5', color: '#065f46' },
    ];

    return `
    <div style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;">
        <div style="background:linear-gradient(135deg,#4338ca 0%,#6366f1 55%,#8b5cf6 100%);padding:32px 36px 24px;flex-shrink:0;">
            <div style="color:rgba(199,210,254,0.85);font-size:11px;font-weight:600;letter-spacing:0.1em;margin-bottom:6px;">KY ABILITY · HAZARD PREDICTION</div>
            <div style="color:#fff;font-size:26px;font-weight:700;line-height:1.2;">รายงานกิจกรรม KY ปี ${year}</div>
            <div style="color:rgba(199,210,254,0.85);font-size:12px;margin-top:6px;">สร้างเมื่อ ${today} · Thai Summit Harness Co., Ltd.</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;padding:20px 36px;flex-shrink:0;">
            ${kpiBoxes.map(b => `
            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 12px;text-align:center;border-top:3px solid ${b.color};">
                <div style="font-size:22px;font-weight:700;color:${b.color};">${b.value}</div>
                <div style="font-size:10px;color:#64748b;margin-top:4px;">${b.label}</div>
            </div>`).join('')}
        </div>

        <div style="flex:1;padding:0 36px 16px;overflow:hidden;">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">แนวโน้มกิจกรรม KY รายเดือน ปี ${year}</div>
            ${monthBars}
        </div>

        <div style="padding:16px 36px;flex-shrink:0;">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;">สถานะกิจกรรม KY</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
                ${statusBoxes.map(b => `
                <div style="background:${b.bg};border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:20px;font-weight:700;color:${b.color};">${b.value}</div>
                    <div style="font-size:10px;color:#64748b;margin-top:2px;">${b.label}</div>
                </div>`).join('')}
            </div>
        </div>

        <div style="background:linear-gradient(90deg,#4338ca,#6366f1);padding:10px 36px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">กิจกรรม KY · Thai Summit Harness Co., Ltd.</span>
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">หน้า 1 จาก 4</span>
        </div>
    </div>`;
}

function _buildKyPdfPage2(byDept, riskCat, pendingDepts, year, today) {
    const maxDept = Math.max(...byDept.map(d => d.count || 0), 1);
    const maxRisk = Math.max(...riskCat.map(r => r.count || 0), 1);

    const deptRows = byDept.slice(0, 12).map((d, i) => {
        const pct = Math.round((d.count || 0) / maxDept * 100);
        return `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px 8px;font-size:11px;color:#374151;width:24px;">${i + 1}.</td>
            <td style="padding:6px 8px;font-size:11px;color:#374151;">${d.Department || '-'}</td>
            <td style="padding:6px 8px;width:200px;">
                <div style="background:#f1f5f9;height:10px;border-radius:3px;overflow:hidden;">
                    <div style="background:linear-gradient(90deg,#6366f1,#8b5cf6);height:100%;width:${pct}%;border-radius:3px;"></div>
                </div>
            </td>
            <td style="padding:6px 8px;font-size:11px;color:#374151;text-align:right;font-weight:600;">${d.count || 0}</td>
        </tr>`;
    }).join('');

    const riskRows = riskCat.map(r => {
        const pct = Math.round((r.count || 0) / maxRisk * 100);
        return `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:5px 8px;font-size:11px;color:#374151;">${r.label || '-'}</td>
            <td style="padding:5px 8px;width:180px;">
                <div style="background:#f1f5f9;height:10px;border-radius:3px;overflow:hidden;">
                    <div style="background:linear-gradient(90deg,#f97316,#a855f7);height:100%;width:${pct}%;border-radius:3px;"></div>
                </div>
            </td>
            <td style="padding:5px 8px;font-size:11px;color:#374151;text-align:right;font-weight:600;">${r.count || 0}</td>
        </tr>`;
    }).join('');

    const pendingHtml = pendingDepts.length ? `
        <div style="padding:14px 36px;flex-shrink:0;">
            <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:8px;">แผนกที่ยังไม่ส่งเดือนนี้ (${pendingDepts.length} แผนก)</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${pendingDepts.map(d => `<span style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;padding:3px 8px;font-size:10px;">${d}</span>`).join('')}
            </div>
        </div>` : '';

    return `
    <div style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;">
        <div style="background:#f8fafc;border-bottom:2px solid #6366f1;padding:16px 36px;flex-shrink:0;">
            <div style="font-size:14px;font-weight:700;color:#4338ca;">กิจกรรม KY ปี ${year} · รายละเอียดแผนกและประเภทอันตราย</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px;">สร้างเมื่อ ${today}</div>
        </div>

        <div style="padding:16px 36px;flex-shrink:0;">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">กิจกรรม KY แยกตามแผนก (สูงสุด 12 แผนก)</div>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f8fafc;">
                        <th style="padding:6px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;width:24px;">#</th>
                        <th style="padding:6px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;">แผนก</th>
                        <th style="padding:6px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;width:200px;">สัดส่วน</th>
                        <th style="padding:6px 8px;font-size:10px;color:#64748b;text-align:right;font-weight:600;">จำนวน</th>
                    </tr>
                </thead>
                <tbody>${deptRows || '<tr><td colspan="4" style="text-align:center;padding:12px;font-size:11px;color:#94a3b8;">ไม่มีข้อมูล</td></tr>'}</tbody>
            </table>
        </div>

        <div style="padding:0 36px 16px;flex-shrink:0;">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">ประเภทอันตราย</div>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f8fafc;">
                        <th style="padding:5px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;">ประเภท</th>
                        <th style="padding:5px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;width:180px;">สัดส่วน</th>
                        <th style="padding:5px 8px;font-size:10px;color:#64748b;text-align:right;font-weight:600;">จำนวน</th>
                    </tr>
                </thead>
                <tbody>${riskRows || '<tr><td colspan="3" style="text-align:center;padding:12px;font-size:11px;color:#94a3b8;">ไม่มีข้อมูล</td></tr>'}</tbody>
            </table>
        </div>

        ${pendingHtml}

        <div style="flex:1;"></div>

        <div style="background:linear-gradient(90deg,#4338ca,#6366f1);padding:10px 36px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">กิจกรรม KY · Thai Summit Harness Co., Ltd.</span>
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">หน้า 2 จาก 4</span>
        </div>
    </div>`;
}

function _buildKyPdfPage3(progData, usingConfig, year, today) {
    const footer = `
        <div style="background:linear-gradient(90deg,#4338ca,#6366f1);padding:10px 36px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">กิจกรรม KY · Thai Summit Harness Co., Ltd.</span>
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">หน้า 3 จาก 4</span>
        </div>`;

    if (!usingConfig || !progData.length) {
        return `
        <div style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;">
            <div style="background:#f8fafc;border-bottom:2px solid #6366f1;padding:16px 36px;flex-shrink:0;">
                <div style="font-size:14px;font-weight:700;color:#4338ca;">Department Coverage · ปี ${year}</div>
                <div style="font-size:10px;color:#64748b;margin-top:2px;">สร้างเมื่อ ${today}</div>
            </div>
            <div style="flex:1;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;">
                ไม่มีการตั้งค่า Program Config — กำหนดเป้าหมายรายส่วนงานได้ในแท็บ "จัดการ"
            </div>
            ${footer}
        </div>`;
    }

    const sorted = [...progData].sort((a, b) => a.pct - b.pct || a.department.localeCompare(b.department));
    const onTrack  = sorted.filter(d => d.pct >= 80).length;
    const atRisk   = sorted.filter(d => d.pct >= 40 && d.pct < 80).length;
    const critical = sorted.filter(d => d.pct < 40).length;
    const barCol = p => p >= 80 ? '#059669' : p >= 40 ? '#d97706' : '#ef4444';
    const txtCol = p => p >= 80 ? '#065f46' : p >= 40 ? '#92400e' : '#991b1b';
    const bgCol  = p => p >= 80 ? '#ecfdf5' : p >= 40 ? '#fffbeb' : '#fef2f2';

    const rows = sorted.map(d => {
        const pct = Math.max(0, Math.min(100, d.pct));
        return `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:7px 8px;font-size:11px;color:#374151;max-width:180px;">${d.department}</td>
            <td style="padding:7px 8px;width:240px;">
                <div style="background:#f1f5f9;height:12px;border-radius:4px;overflow:hidden;">
                    <div style="background:${barCol(pct)};height:100%;width:${pct}%;border-radius:4px;"></div>
                </div>
            </td>
            <td style="padding:7px 8px;font-size:11px;color:#374151;text-align:center;font-weight:600;">${d.submitted}/${d.target}</td>
            <td style="padding:7px 8px;text-align:center;">
                <span style="background:${bgCol(pct)};color:${txtCol(pct)};border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;">${pct}%</span>
            </td>
            <td style="padding:7px 8px;font-size:10px;color:#64748b;text-align:right;">${pct >= 100 ? 'ครบแล้ว' : `เหลือ ${Math.max(0, d.target - d.submitted)}`}</td>
        </tr>`;
    }).join('');

    return `
    <div style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;">
        <div style="background:#f8fafc;border-bottom:2px solid #6366f1;padding:16px 36px;flex-shrink:0;">
            <div style="font-size:14px;font-weight:700;color:#4338ca;">ความคืบหน้ากิจกรรม KY รายส่วนงาน · ปี ${year}</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px;">Program Config — เป้าหมายรายปี · สร้างเมื่อ ${today}</div>
        </div>

        <div style="padding:16px 36px;flex-shrink:0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
            <div style="background:#ecfdf5;border-radius:10px;padding:12px;text-align:center;border-top:3px solid #059669;">
                <div style="font-size:22px;font-weight:700;color:#059669;">${onTrack}</div>
                <div style="font-size:10px;color:#065f46;margin-top:3px;">On Track (≥ 80%)</div>
            </div>
            <div style="background:#fffbeb;border-radius:10px;padding:12px;text-align:center;border-top:3px solid #d97706;">
                <div style="font-size:22px;font-weight:700;color:#d97706;">${atRisk}</div>
                <div style="font-size:10px;color:#92400e;margin-top:3px;">At Risk (40–79%)</div>
            </div>
            <div style="background:#fef2f2;border-radius:10px;padding:12px;text-align:center;border-top:3px solid #ef4444;">
                <div style="font-size:22px;font-weight:700;color:#ef4444;">${critical}</div>
                <div style="font-size:10px;color:#991b1b;margin-top:3px;">Critical (< 40%)</div>
            </div>
        </div>

        <div style="flex:1;padding:0 36px 16px;overflow:hidden;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f8fafc;">
                        <th style="padding:7px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;">ส่วนงาน</th>
                        <th style="padding:7px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;width:240px;">ความคืบหน้า</th>
                        <th style="padding:7px 8px;font-size:10px;color:#64748b;text-align:center;font-weight:600;">ส่งแล้ว/เป้า</th>
                        <th style="padding:7px 8px;font-size:10px;color:#64748b;text-align:center;font-weight:600;">%</th>
                        <th style="padding:7px 8px;font-size:10px;color:#64748b;text-align:right;font-weight:600;">เหลือ</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;font-size:11px;">ไม่มีข้อมูล</td></tr>'}</tbody>
            </table>
        </div>

        ${footer}
    </div>`;
}

function _buildKyPdfPage4(actionItems, kpi, year, today) {
    const openItems     = actionItems.filter(r => r.Status === 'Open');
    const reviewedItems = actionItems.filter(r => r.Status === 'Reviewed');
    const closureRate   = kpi.total > 0 ? Math.round(((kpi.closed || 0) / kpi.total) * 100) : 0;

    const itemRow = (r, statusColor, statusLabel) => {
        const date = r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-';
        const hazard = (r.HazardDescription || '').slice(0, 70) + ((r.HazardDescription || '').length > 70 ? '...' : '');
        return `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:5px 8px;font-size:10px;color:#374151;white-space:nowrap;">${date}</td>
            <td style="padding:5px 8px;font-size:10px;color:#374151;">${r.Department || '-'}</td>
            <td style="padding:5px 8px;font-size:10px;color:#374151;">${r.ReporterName || '-'}</td>
            <td style="padding:5px 8px;font-size:10px;color:#374151;">${r.RiskCategory || '-'}</td>
            <td style="padding:5px 8px;font-size:10px;color:#374151;max-width:180px;">${hazard}</td>
            <td style="padding:5px 8px;text-align:center;">
                <span style="background:${statusColor}18;color:${statusColor};border-radius:999px;padding:2px 7px;font-size:9px;font-weight:700;">${statusLabel}</span>
            </td>
        </tr>`;
    };

    const openRows     = openItems.slice(0, 14).map(r => itemRow(r, '#0284c7', 'รอตรวจสอบ')).join('');
    const reviewedRows = reviewedItems.slice(0, 10).map(r => itemRow(r, '#d97706', 'ตรวจสอบแล้ว')).join('');

    return `
    <div style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;">
        <div style="background:#f8fafc;border-bottom:2px solid #6366f1;padding:16px 36px;flex-shrink:0;">
            <div style="font-size:14px;font-weight:700;color:#4338ca;">Action Follow-up · ปี ${year}</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px;">รายการที่ต้องติดตาม — รอตรวจสอบ + ตรวจสอบแล้ว · สร้างเมื่อ ${today}</div>
        </div>

        <div style="padding:14px 36px;flex-shrink:0;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
            <div style="background:#eff6ff;border-radius:8px;padding:10px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#1d4ed8;">${openItems.length}</div>
                <div style="font-size:10px;color:#1e40af;margin-top:2px;">รอตรวจสอบ</div>
            </div>
            <div style="background:#fffbeb;border-radius:8px;padding:10px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#d97706;">${reviewedItems.length}</div>
                <div style="font-size:10px;color:#92400e;margin-top:2px;">ตรวจสอบแล้ว</div>
            </div>
            <div style="background:#ecfdf5;border-radius:8px;padding:10px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#059669;">${kpi.closed || 0}</div>
                <div style="font-size:10px;color:#065f46;margin-top:2px;">ปิดแล้ว</div>
            </div>
            <div style="background:#f0fdf4;border-radius:8px;padding:10px;text-align:center;border:1px solid #bbf7d0;">
                <div style="font-size:18px;font-weight:700;color:#0f766e;">${closureRate}%</div>
                <div style="font-size:10px;color:#0f766e;margin-top:2px;">Closure Rate</div>
            </div>
        </div>

        <div style="flex:1;padding:0 36px 8px;overflow:hidden;">
            ${openItems.length ? `
            <div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e0e7ff;">รายการรอตรวจสอบ (${openItems.length} รายการ)</div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
                <thead><tr style="background:#eff6ff;">
                    <th style="padding:5px 8px;font-size:9px;color:#1e40af;text-align:left;font-weight:700;">วันที่</th>
                    <th style="padding:5px 8px;font-size:9px;color:#1e40af;text-align:left;font-weight:700;">แผนก</th>
                    <th style="padding:5px 8px;font-size:9px;color:#1e40af;text-align:left;font-weight:700;">ผู้รายงาน</th>
                    <th style="padding:5px 8px;font-size:9px;color:#1e40af;text-align:left;font-weight:700;">ประเภท</th>
                    <th style="padding:5px 8px;font-size:9px;color:#1e40af;text-align:left;font-weight:700;">อันตราย</th>
                    <th style="padding:5px 8px;font-size:9px;color:#1e40af;text-align:center;font-weight:700;">สถานะ</th>
                </tr></thead>
                <tbody>${openRows || '<tr><td colspan="6" style="text-align:center;padding:8px;color:#94a3b8;font-size:10px;">ไม่มีรายการ</td></tr>'}</tbody>
            </table>` : ''}

            ${reviewedItems.length ? `
            <div style="font-size:11px;font-weight:700;color:#d97706;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #fef3c7;">รายการตรวจสอบแล้ว — รอปิด (${reviewedItems.length} รายการ)</div>
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr style="background:#fffbeb;">
                    <th style="padding:5px 8px;font-size:9px;color:#92400e;text-align:left;font-weight:700;">วันที่</th>
                    <th style="padding:5px 8px;font-size:9px;color:#92400e;text-align:left;font-weight:700;">แผนก</th>
                    <th style="padding:5px 8px;font-size:9px;color:#92400e;text-align:left;font-weight:700;">ผู้รายงาน</th>
                    <th style="padding:5px 8px;font-size:9px;color:#92400e;text-align:left;font-weight:700;">ประเภท</th>
                    <th style="padding:5px 8px;font-size:9px;color:#92400e;text-align:left;font-weight:700;">อันตราย</th>
                    <th style="padding:5px 8px;font-size:9px;color:#92400e;text-align:center;font-weight:700;">สถานะ</th>
                </tr></thead>
                <tbody>${reviewedRows || '<tr><td colspan="6" style="text-align:center;padding:8px;color:#94a3b8;font-size:10px;">ไม่มีรายการ</td></tr>'}</tbody>
            </table>` : ''}

            ${!openItems.length && !reviewedItems.length ? `
            <div style="display:flex;align-items:center;justify-content:center;height:60%;color:#059669;font-size:13px;font-weight:600;">
                ไม่มีรายการค้างจัดการ — ทุกรายการปิดแล้ว
            </div>` : ''}
        </div>

        <div style="background:linear-gradient(90deg,#4338ca,#6366f1);padding:10px 36px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">กิจกรรม KY · Thai Summit Harness Co., Ltd.</span>
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">หน้า 4 จาก 4</span>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
function loadingRow(cols) {
    return `<tr><td colspan="${cols}" class="text-center py-8 text-slate-400">
        <div class="animate-spin inline-block h-6 w-6 border-4 border-indigo-400 border-t-transparent rounded-full mb-2"></div>
        <div class="text-sm">กำลังโหลด...</div>
    </td></tr>`;
}

function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
