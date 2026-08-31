import { API } from '../api.js';
import * as UI from '../ui.js';
import {
    createLatestRequestController,
    isAbortError,
    loadingErrorState,
    modalSkeleton,
    pageSkeleton,
    runBusy as sharedRunBusy,
    runFormBusy as sharedRunFormBusy,
} from '../utils/async-ui.js?v=20260715-phase32a-async-ux';

let _types = [];
let _permissions = {};
let _licenses = [];
let _templates = [];
let _reportData = null;
let _settings = {};
let _auditRows = [];
let _reminderData = null;
let _emailOutbox = [];
let _requests = [];
let _requestSummary = null;
let _requestFilters = { status: 'all', kind: 'all', overdue: false };
let _layoutPresets = [];
let _total = 0;
let _page = 1;
let _limit = 20;
let _activeTab = 'registry';
let _filters = { q: '', type: 'all', status: 'all', expireFrom: '', expireTo: '', certificate: 'all' };
let _bulkImportRows = [];
let _bulkSelected = new Set();
let _coreLoadedAt = 0;
let _settingsLoadedAt = 0;
let _dashboardLoadedAt = 0;
let _dashboardCache = null;
let _deepLinkHandled = false;
const FL_CACHE_MS = 5 * 60 * 1000;
const FL_DASHBOARD_CACHE_MS = 30 * 1000;

const esc = value => UI.escHtml ? UI.escHtml(value ?? '') : String(value ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
const can = key => Boolean(_permissions[key]);
const canRequest = () => can('FORKLIFT_REQUEST') || can('FORKLIFT_MANAGE');
const canAccessRequests = () => canRequest() || can('FORKLIFT_APPROVE');
const fmtDate = value => value ? String(value).slice(0, 10) : '-';
const toNum = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const initials = value => String(value || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?';
const cardWidthMm = version => Math.max(1, toNum(version?.CardWidthMm, 60));
const cardHeightMm = version => Math.max(1, toNum(version?.CardHeightMm, 82));
const cardAspectStyle = version => `aspect-ratio:${cardWidthMm(version)} / ${cardHeightMm(version)};`;
const cardSizeLabel = version => `${cardWidthMm(version).toFixed(0)} x ${cardHeightMm(version).toFixed(0)} mm`;
const transparentBgStyle = 'background-color:#f8fafc;background-image:linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;';
const FL_CARD_CACHE_BUST = '20260715-forklift-module-closeout';

const reportAsyncAction = (promise, errorMessage = 'ดำเนินการไม่สำเร็จ') => promise.catch(err => {
    if (!isAbortError(err)) UI.showToast(err?.message || errorMessage, 'error');
    return undefined;
});
const runForkliftAction = (button, message, task, errorMessage) => reportAsyncAction(
    sharedRunBusy(button, message, task),
    errorMessage,
);
const runForkliftForm = (form, submitter, message, task, errorMessage) => reportAsyncAction(
    sharedRunFormBusy(form, message, task, { submitter }),
    errorMessage,
);
const runBusy = runForkliftAction;
const fieldType = field => {
    const cfg = field.FieldConfig || {};
    if (cfg.type) return cfg.type;
    if (field.FieldKey === 'employee_photo') return 'image';
    if (field.FieldKey === 'qr_code') return 'qr';
    if (field.FieldKey === 'manager_signature') return 'signature';
    return 'text';
};
const fieldLabel = key => ({
    employee_photo: 'Employee photo',
    employee_name: 'Employee name',
    employee_id: 'Employee ID',
    department: 'Department',
    unit: 'Unit',
    position: 'Position',
    license_type: 'License type',
    license_no: 'License No.',
    card_no: 'Card No.',
    issue_date: 'Issue date',
    expire_date: 'Expire date',
    certificate_no: 'Certificate No.',
    manager_signature: 'Manager signature',
    qr_code: 'Verification QR',
    static_text: 'Static note',
}[key] || key);

function statusBadge(status) {
    const map = {
        ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        EXPIRING_SOON: 'bg-amber-50 text-amber-700 border-amber-200',
        EXPIRED: 'bg-red-50 text-red-700 border-red-200',
        SUSPENDED: 'bg-slate-100 text-slate-700 border-slate-200',
        ARCHIVED: 'bg-zinc-100 text-zinc-500 border-zinc-200',
    };
    const label = { ACTIVE: 'Active', EXPIRING_SOON: 'Expiring soon', EXPIRED: 'Expired', SUSPENDED: 'Suspended', ARCHIVED: 'Archived' }[status] || status || '-';
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${map[status] || 'bg-slate-50 text-slate-600 border-slate-200'}">${label}</span>`;
}

function requestStatusBadge(status) {
    const value = String(status || 'PENDING').toUpperCase();
    const map = {
        DRAFT: 'bg-slate-50 text-slate-700 border-slate-200',
        SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
        UNDER_REVIEW: 'bg-violet-50 text-violet-700 border-violet-200',
        RETURNED: 'bg-orange-50 text-orange-700 border-orange-200',
        PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
        APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        REJECTED: 'bg-red-50 text-red-700 border-red-200',
        CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
    };
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-black ${map[value] || 'bg-slate-50 text-slate-600 border-slate-200'}">${esc(value)}</span>`;
}

function requestKind(row = {}) {
    return String(row.RequestKind || 'NEW').toUpperCase() === 'RENEWAL' ? 'RENEWAL' : 'NEW';
}

function requestKindBadge(row = {}) {
    return requestKind(row) === 'RENEWAL'
        ? '<span class="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-black text-cyan-700">ต่ออายุ</span>'
        : '<span class="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">ขอใหม่</span>';
}

function approvedRequestHint(row = {}) {
    if (String(row.RequestStatus || '').toUpperCase() !== 'APPROVED' || !row.LicenseID) return '';
    return '<div class="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">อนุมัติแล้ว: ดูบัตรและเอกสารได้ที่แท็บทะเบียนใบอนุญาต</div>';
}

function sourceLicensePanel(detail = {}) {
    if (requestKind(detail) !== 'RENEWAL') return '';
    return `<section class="rounded-xl border border-cyan-100 bg-cyan-50/70 p-3 text-sm">
        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
                <p class="text-xs font-black text-cyan-700">อ้างอิงใบเดิม</p>
                <p class="font-black text-slate-800">${esc(detail.SourceLicenseNo || detail.SourceCardNo || '-')}</p>
                <p class="text-xs text-slate-500">Card: ${esc(detail.SourceCardNo || '-')} · หมดอายุเดิม ${fmtDate(detail.SourceExpireDate)}</p>
            </div>
            <div class="text-xs text-slate-500">ออกเดิม ${fmtDate(detail.SourceIssueDate)} · Cert ${esc(detail.SourceCertificateNo || '-')}</div>
        </div>
    </section>`;
}

function typeOptions(selected = '') {
    return _types.map(t => `<option value="${t.ID}" ${String(selected) === String(t.ID) ? 'selected' : ''}>${esc(t.NameTH || t.Code)}</option>`).join('');
}

function licenseTypeLabel(row = {}) {
    return row.LicenseTypeNames || (Array.isArray(row.LicenseTypes) ? row.LicenseTypes.map(type => type.NameTH || type.Code).filter(Boolean).join(', ') : '') || row.LicenseTypeNameTH || row.LicenseTypeCode || '-';
}

function templateTypeLabel(row = {}) {
    return row.LicenseTypeNames || (Array.isArray(row.LicenseTypes) ? row.LicenseTypes.map(type => type.NameTH || type.Code).filter(Boolean).join(' + ') : '') || row.LicenseTypeNameTH || 'All license types';
}

function imageFromFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Cannot read image file.')); };
        img.src = url;
    });
}

function canvasToPngFile(canvas, name) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) return reject(new Error('Cannot create transparent PNG.'));
            const base = String(name || 'employee-photo').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-');
            resolve(new File([blob], `${base}-transparent.png`, { type: 'image/png' }));
        }, 'image/png');
    });
}

async function canvasToUploadPngFile(canvas, name, maxBytes = 4.5 * 1024 * 1024) {
    let output = canvas;
    for (let attempt = 0; attempt < 4; attempt++) {
        const file = await canvasToPngFile(output, name);
        if (file.size <= maxBytes || Math.max(output.width, output.height) <= 900) return file;
        const resized = document.createElement('canvas');
        const scale = Math.sqrt(maxBytes / file.size) * 0.92;
        resized.width = Math.max(1, Math.round(output.width * Math.max(0.65, scale)));
        resized.height = Math.max(1, Math.round(output.height * Math.max(0.65, scale)));
        const resizedCtx = resized.getContext('2d');
        resizedCtx.imageSmoothingEnabled = true;
        resizedCtx.imageSmoothingQuality = 'high';
        resizedCtx.drawImage(output, 0, 0, resized.width, resized.height);
        output = resized;
    }
    return canvasToPngFile(output, name);
}

function colorDistanceAt(data, idx, bg) {
    const dr = data[idx] - bg[0];
    const dg = data[idx + 1] - bg[1];
    const db = data[idx + 2] - bg[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

const FL_MEDIAPIPE_VERSION = '0.10.35';
const FL_MEDIAPIPE_MODULE = new URL('../../vendor/mediapipe/vision_bundle.js', import.meta.url).href;
const FL_MEDIAPIPE_WASM = new URL('../../vendor/mediapipe/wasm', import.meta.url).href;
const FL_SELFIE_MODEL = new URL('../../vendor/mediapipe/selfie_multiclass_256x256.tflite', import.meta.url).href;
const FL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
let _photoSegmenterPromise = null;

function smoothStep(low, high, value) {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - (2 * t));
}

async function getPhotoSegmenter() {
    if (!_photoSegmenterPromise) {
        _photoSegmenterPromise = import(FL_MEDIAPIPE_MODULE).then(async ({ FilesetResolver, ImageSegmenter }) => {
            const vision = await FilesetResolver.forVisionTasks(FL_MEDIAPIPE_WASM);
            const options = {
                baseOptions: { modelAssetPath: FL_SELFIE_MODEL },
                runningMode: 'IMAGE',
                outputCategoryMask: false,
                outputConfidenceMasks: true,
            };
            try {
                return await ImageSegmenter.createFromOptions(vision, {
                    ...options,
                    baseOptions: { ...options.baseOptions, delegate: 'GPU' },
                });
            } catch (gpuError) {
                console.warn('Forklift photo segmentation GPU unavailable; using CPU.', gpuError);
                return ImageSegmenter.createFromOptions(vision, options);
            }
        }).catch(err => {
            _photoSegmenterPromise = null;
            throw err;
        });
    }
    return _photoSegmenterPromise;
}

function segmentPhoto(segmenter, img) {
    return new Promise((resolve, reject) => {
        try {
            segmenter.segment(img, result => resolve(result));
        } catch (err) {
            reject(err);
        }
    });
}

async function removePhotoBackgroundWithAi(file) {
    const img = await imageFromFile(file);
    const segmenter = await getPhotoSegmenter();
    const result = await segmentPhoto(segmenter, img);
    try {
        const backgroundMask = result?.confidenceMasks?.[0];
        if (!backgroundMask) throw new Error('AI did not return a portrait mask.');

        const maskWidth = backgroundMask.width;
        const maskHeight = backgroundMask.height;
        const background = backgroundMask.getAsFloat32Array();
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = maskWidth;
        maskCanvas.height = maskHeight;
        const maskCtx = maskCanvas.getContext('2d');
        const maskImage = maskCtx.createImageData(maskWidth, maskHeight);
        let foregroundPixels = 0;
        for (let i = 0; i < background.length; i++) {
            const foreground = 1 - background[i];
            const alpha = Math.round(smoothStep(0.06, 0.92, foreground) * 255);
            if (alpha >= 128) foregroundPixels++;
            const idx = i * 4;
            maskImage.data[idx] = alpha;
            maskImage.data[idx + 1] = alpha;
            maskImage.data[idx + 2] = alpha;
            maskImage.data[idx + 3] = 255;
        }
        if (foregroundPixels / background.length < 0.015) throw new Error('AI could not find a person in this photo.');
        maskCtx.putImageData(maskImage, 0, 0);

        const sourceWidth = img.naturalWidth || img.width;
        const sourceHeight = img.naturalHeight || img.height;
        const scale = Math.min(1, 2000 / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, width, height);
        const image = ctx.getImageData(0, 0, width, height);

        const scaledMask = document.createElement('canvas');
        scaledMask.width = width;
        scaledMask.height = height;
        const scaledCtx = scaledMask.getContext('2d', { willReadFrequently: true });
        scaledCtx.imageSmoothingEnabled = true;
        scaledCtx.imageSmoothingQuality = 'high';
        scaledCtx.filter = `blur(${Math.max(0.6, Math.min(1.4, Math.max(width, height) / 1600))}px)`;
        scaledCtx.drawImage(maskCanvas, 0, 0, width, height);
        const alphaData = scaledCtx.getImageData(0, 0, width, height).data;
        for (let i = 0; i < width * height; i++) {
            image.data[(i * 4) + 3] = Math.round(image.data[(i * 4) + 3] * alphaData[i * 4] / 255);
        }
        ctx.clearRect(0, 0, width, height);
        ctx.putImageData(image, 0, 0);
        const processed = await canvasToUploadPngFile(canvas, file.name);
        processed._backgroundRemovalMethod = 'ai';
        return processed;
    } finally {
        result?.close?.();
    }
}

async function removePhotoBackgroundByColor(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) throw new Error('รองรับ JPG, PNG, WebP เท่านั้น');
    const img = await imageFromFile(file);
    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const w = canvas.width;
    const h = canvas.height;
    const sample = Math.max(3, Math.min(16, Math.floor(Math.min(w, h) * 0.04)));
    const bg = [0, 0, 0];
    let count = 0;
    const addSample = (x0, y0) => {
        for (let y = y0; y < Math.min(h, y0 + sample); y++) {
            for (let x = x0; x < Math.min(w, x0 + sample); x++) {
                const idx = (y * w + x) * 4;
                if (data[idx + 3] < 10) continue;
                bg[0] += data[idx]; bg[1] += data[idx + 1]; bg[2] += data[idx + 2]; count++;
            }
        }
    };
    addSample(0, 0);
    addSample(Math.max(0, w - sample), 0);
    addSample(0, Math.max(0, h - sample));
    addSample(Math.max(0, w - sample), Math.max(0, h - sample));
    if (!count) {
        const processed = await canvasToUploadPngFile(canvas, file.name);
        processed._backgroundRemovalMethod = 'color-fallback';
        return processed;
    }
    bg[0] /= count; bg[1] /= count; bg[2] /= count;
    const tolerance = 42;
    const feather = 36;
    const maxDistance = tolerance + feather;
    const visited = new Uint8Array(w * h);
    const queue = [];
    const enqueue = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const pos = y * w + x;
        if (visited[pos]) return;
        const idx = pos * 4;
        if (data[idx + 3] < 10 || colorDistanceAt(data, idx, bg) <= maxDistance) {
            visited[pos] = 1;
            queue.push(pos);
        }
    };
    for (let x = 0; x < w; x++) { enqueue(x, 0); enqueue(x, h - 1); }
    for (let y = 0; y < h; y++) { enqueue(0, y); enqueue(w - 1, y); }
    for (let head = 0; head < queue.length; head++) {
        const pos = queue[head];
        const x = pos % w;
        const y = Math.floor(pos / w);
        enqueue(x + 1, y); enqueue(x - 1, y); enqueue(x, y + 1); enqueue(x, y - 1);
    }
    for (const pos of queue) {
        const idx = pos * 4;
        const keep = Math.max(0, Math.min(1, (colorDistanceAt(data, idx, bg) - tolerance) / feather));
        data[idx + 3] = Math.round(data[idx + 3] * keep);
    }
    ctx.putImageData(image, 0, 0);
    const processed = await canvasToUploadPngFile(canvas, file.name);
    processed._backgroundRemovalMethod = 'color-fallback';
    return processed;
}

async function removePhotoBackground(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) throw new Error('รองรับ JPG, PNG, WebP เท่านั้น');
    if (file.size > FL_PHOTO_MAX_BYTES) throw new Error('รูปภาพต้องมีขนาดไม่เกิน 5 MB');
    try {
        return await removePhotoBackgroundWithAi(file);
    } catch (err) {
        console.warn('Forklift AI background removal unavailable; using color fallback.', err);
        return removePhotoBackgroundByColor(file);
    }
}

function selectedTypeIds(row = {}) {
    const ids = Array.isArray(row.LicenseTypeIDs) ? row.LicenseTypeIDs : (Array.isArray(row.LicenseTypes) ? row.LicenseTypes.map(type => type.ID) : [row.LicenseTypeID]);
    return ids.map(String).filter(Boolean).slice(0, 2);
}

function typeCheckboxes(row = {}) {
    const selected = new Set(selectedTypeIds(row));
    return `<div id="fl-type-checks" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        ${_types.map(type => `<label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
            <input type="checkbox" name="LicenseTypeIDs" value="${esc(type.ID)}" class="fl-type-check h-4 w-4 rounded border-slate-300" ${selected.has(String(type.ID)) ? 'checked' : ''}>
            <span>${esc(type.NameTH || type.Code)}</span>
        </label>`).join('')}
        <p class="sm:col-span-2 text-[11px] text-slate-400">เลือกได้สูงสุด 2 ประเภทต่อหนึ่งบัตร</p>
    </div>`;
}

function templateTypeCheckboxes(row = {}) {
    const selected = new Set(selectedTypeIds(row));
    return `<div id="fl-template-type-checks" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        ${_types.map(type => `<label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
            <input type="checkbox" name="LicenseTypeIDs" value="${esc(type.ID)}" class="fl-template-type-check h-4 w-4 rounded border-slate-300" ${selected.has(String(type.ID)) ? 'checked' : ''}>
            <span>${esc(type.NameTH || type.Code)}</span>
        </label>`).join('')}
        <p class="sm:col-span-2 text-[11px] text-slate-400">ไม่เลือก = ทุกประเภท, เลือก Forklift + Stacker = ใช้เฉพาะบัตรแบบรวม</p>
    </div>`;
}

function isoToday() {
    return new Date().toISOString().slice(0, 10);
}

function addMonths(dateText, months) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ''))) return '';
    const [year, month, day] = String(dateText).split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setMonth(date.getMonth() + Math.max(1, Number(months) || 12));
    return date.toISOString().slice(0, 10);
}

function selectedValidityMonths(form, fallbackTypeId = '') {
    const checked = [...(form?.querySelectorAll?.('.fl-type-check:checked') || [])].map(input => String(input.value));
    const ids = checked.length ? checked : [String(fallbackTypeId || '')].filter(Boolean);
    const months = ids.map(id => Number(_types.find(type => String(type.ID) === String(id))?.DefaultValidityMonths || 12)).filter(value => value > 0);
    return months.length ? Math.min(...months) : 12;
}

function syncExpireDate(form, { issueName = 'IssueDate', expireName = 'ExpireDate', fallbackTypeId = '' } = {}) {
    const issue = form?.elements?.[issueName];
    const expire = form?.elements?.[expireName];
    if (!issue || !expire) return;
    if (!issue.value) issue.value = isoToday();
    expire.value = addMonths(issue.value, selectedValidityMonths(form, fallbackTypeId));
}

async function uploadRequestDocumentFile(requestId, type, file) {
    if (!file || !file.size) return null;
    const fd = new FormData();
    fd.set('DocumentType', type);
    fd.set('file', file);
    return API.post(`/forklift/requests/${requestId}/documents`, fd);
}

function invalidateForkliftCache(scope = 'data') {
    if (scope === 'all' || scope === 'core') _coreLoadedAt = 0;
    if (scope === 'all' || scope === 'settings') _settingsLoadedAt = 0;
    if (scope === 'all' || scope === 'dashboard' || scope === 'data') _dashboardLoadedAt = 0;
}

async function loadCoreData(signal) {
    if (_coreLoadedAt && Date.now() - _coreLoadedAt < FL_CACHE_MS && _types.length && Object.keys(_permissions).length) return;
    const [permRes, typeRes] = await Promise.all([
        API.get('/forklift/permissions', { signal }),
        API.get('/forklift/license-types', { signal }),
    ]);
    _permissions = permRes.data || {};
    _types = typeRes.data || [];
    _coreLoadedAt = Date.now();
}

async function loadSettingsData(force = false, signal) {
    if (!force && _settingsLoadedAt && Date.now() - _settingsLoadedAt < FL_CACHE_MS) return;
    _settings = (await API.get('/forklift/settings', { signal })).data || {};
    _settingsLoadedAt = Date.now();
}

async function fetchAll(signal) {
    await Promise.all([loadCoreData(signal), loadSettingsData(false, signal)]);
    if (_activeTab === 'approvals' && !approvalQueueEnabled()) _activeTab = 'registry';
    const params = new URLSearchParams({ page: _page, limit: _limit });
    Object.entries(_filters).forEach(([k, v]) => { if (v && v !== 'all') params.set(k, v); });
    if (_activeTab === 'registry') {
        const listRes = await API.get(`/forklift/licenses?${params.toString()}`, { signal });
        _licenses = listRes.data || [];
        _total = listRes.total || 0;
    }
    if (_activeTab === 'templates' && can('FORKLIFT_TEMPLATE_MANAGE')) {
        _templates = (await API.get('/forklift/templates', { signal })).data || [];
    }
    if (_activeTab === 'approvals' && canAccessRequests() && approvalQueueEnabled()) {
        const requestParams = new URLSearchParams({ status: _requestFilters.status, kind: _requestFilters.kind, limit: '100' });
        if (_requestFilters.overdue) requestParams.set('overdue', '1');
        const [requestRes, summaryRes] = await Promise.all([
            API.get(`/forklift/requests?${requestParams.toString()}`, { signal }),
            API.get('/forklift/requests/summary', { signal }).catch(err => { if (err?.name === 'AbortError') throw err; return { data: null }; }),
        ]);
        _requests = requestRes.data || [];
        _requestSummary = summaryRes.data || null;
    }
    if (_activeTab === 'reports') {
        const fallback = (promise, data) => promise.catch(err => { if (err?.name === 'AbortError') throw err; return { data }; });
        const reportPromise = can('FORKLIFT_EXPORT') ? API.get('/forklift/reports', { signal }) : Promise.resolve({ data: null });
        const auditPromise = can('FORKLIFT_AUDIT_VIEW') ? fallback(API.get('/forklift/audit?limit=25', { signal }), []) : Promise.resolve({ data: [] });
        const reminderPromise = can('FORKLIFT_EXPORT') ? fallback(API.get('/forklift/reminder-queue', { signal }), null) : Promise.resolve({ data: null });
        const outboxPromise = can('FORKLIFT_AUDIT_VIEW') ? fallback(API.get('/forklift/email-outbox?limit=30', { signal }), []) : Promise.resolve({ data: [] });
        const [reportRes, auditRes, reminderRes, outboxRes] = await Promise.all([reportPromise, auditPromise, reminderPromise, outboxPromise]);
        _reportData = reportRes.data || null;
        _auditRows = auditRes.data || [];
        _reminderData = reminderRes.data || null;
        _emailOutbox = outboxRes.data || [];
    }
}

function approvalQueueEnabled() {
    return String((_settings || {}).approval_queue_enabled ?? '1') !== '0';
}

async function fetchDashboard(signal) {
    if (_dashboardCache && _dashboardLoadedAt && Date.now() - _dashboardLoadedAt < FL_DASHBOARD_CACHE_MS) return _dashboardCache;
    try {
        _dashboardCache = (await API.get('/forklift/dashboard', { signal })).data || {};
        _dashboardLoadedAt = Date.now();
        return _dashboardCache;
    } catch (err) {
        if (err?.name === 'AbortError') throw err;
        return _dashboardCache || {};
    }
}

function renderHeroLegacy(dash = {}) {
    const c = dash.counts || {};
    const items = [
        ['Total licenses', c.total || 0, 'records'],
        ['Licensed employees', c.distinctEmployees || 0, 'people'],
        ['Active', c.active || 0, 'current'],
        ['Compliance', `${c.total ? Math.round(((c.active || 0) / c.total) * 100) : 0}%`, 'active ratio'],
    ];
    return `
        <section class="relative overflow-hidden rounded-2xl p-4 md:p-6 text-white" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-30" style="background-image:radial-gradient(rgba(255,255,255,.22) 1px,transparent 1px);background-size:18px 18px"></div>
            <div class="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div class="min-w-0">
                    <span class="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black text-emerald-50 ring-1 ring-white/20">ใบอนุญาตรถยก</span>
                    <h1 class="mt-3 text-xl md:text-2xl font-black leading-snug">Forklift & Powered Industrial Truck License</h1>
                    <p class="mt-1 max-w-3xl text-sm font-semibold text-emerald-50/90">ทะเบียนใบอนุญาต, ต่ออายุ, เอกสาร, Template บัตร และแจ้งเตือนจาก Employee Master</p>
                </div>
                <div class="flex flex-wrap items-center gap-2 md:pt-3">
                    ${canRequest() && _activeTab === 'registry' && approvalQueueEnabled() ? `<button id="fl-request-btn" class="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-800 text-sm font-black shadow-sm hover:bg-white">+ สร้างคำขออนุมัติ</button>` : ''}
                    ${can('FORKLIFT_MANAGE') && _activeTab === 'registry' ? `<button id="fl-add-btn" class="px-4 py-2 rounded-xl bg-white text-emerald-700 text-sm font-black shadow-sm hover:bg-emerald-50">+ เพิ่มใบอนุญาต</button>` : ''}
                    ${can('FORKLIFT_TEMPLATE_MANAGE') && _activeTab === 'templates' ? `<button id="fl-template-add" class="px-4 py-2 rounded-xl bg-white text-emerald-700 text-sm font-black shadow-sm hover:bg-emerald-50">+ เพิ่ม Template</button>` : ''}
                </div>
            </div>
            <div class="relative mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                ${items.map(([label, value, sub]) => `
                    <div class="rounded-xl bg-white/14 border border-white/10 px-4 py-3 backdrop-blur">
                        <p class="text-2xl font-black leading-none">${esc(value)}</p>
                        <p class="mt-2 text-xs font-black text-emerald-50/90">${esc(label)}</p>
                        <p class="text-[11px] font-semibold text-emerald-50/65">${esc(sub)}</p>
                    </div>`).join('')}
            </div>
        </section>`;
}

function renderHero(dash = {}) {
    const c = dash.counts || {};
    const items = [
        ['Total licenses', c.total || 0, 'all records'],
        ['Licensed employees', c.distinctEmployees || 0, 'people'],
        ['Active', c.active || 0, 'current'],
        ['Compliance', `${c.total ? Math.round(((c.active || 0) / c.total) * 100) : 0}%`, 'active ratio'],
    ];
    return `
        <section class="relative overflow-hidden rounded-2xl p-4 md:p-6 text-white" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-30" style="background-image:radial-gradient(rgba(255,255,255,.22) 1px,transparent 1px);background-size:18px 18px"></div>
            <div class="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div class="min-w-0">
                    <span class="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black text-emerald-50 ring-1 ring-white/20">ใบอนุญาตรถยก</span>
                    <h1 class="mt-3 text-xl md:text-2xl font-black leading-snug">Forklift & Powered Industrial Truck License</h1>
                    <p class="mt-1 max-w-3xl text-sm font-semibold text-emerald-50/90">ทะเบียนใบอนุญาต, ต่ออายุ, เอกสาร, Template บัตร และแจ้งเตือนจาก Employee Master</p>
                </div>
                <div class="flex flex-wrap items-center gap-2 md:pt-3">
                    ${canRequest() && _activeTab === 'registry' && approvalQueueEnabled() ? `<button id="fl-request-btn" class="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-800 text-sm font-black shadow-sm hover:bg-white">+ สร้างคำขออนุมัติ</button>` : ''}
                    ${can('FORKLIFT_MANAGE') && _activeTab === 'registry' ? `<button id="fl-add-btn" class="px-4 py-2 rounded-xl bg-white text-emerald-700 text-sm font-black shadow-sm hover:bg-emerald-50">+ เพิ่มใบอนุญาตโดยตรง</button>` : ''}
                    ${can('FORKLIFT_TEMPLATE_MANAGE') && _activeTab === 'templates' ? `<button id="fl-template-add" class="px-4 py-2 rounded-xl bg-white text-emerald-700 text-sm font-black shadow-sm hover:bg-emerald-50">+ เพิ่ม Template</button>` : ''}
                </div>
            </div>
            <div class="relative mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                ${items.map(([label, value, sub]) => `
                    <div class="rounded-xl bg-white/14 border border-white/10 px-4 py-3 backdrop-blur">
                        <p class="text-2xl font-black leading-none">${esc(value)}</p>
                        <p class="mt-2 text-xs font-black text-emerald-50/90">${esc(label)}</p>
                        <p class="text-[11px] font-semibold text-emerald-50/65">${esc(sub)}</p>
                    </div>`).join('')}
            </div>
        </section>`;
}

function renderTabs() {
    const tabs = [
        ['registry', 'ทะเบียนใบอนุญาต'],
        ...(canAccessRequests() && approvalQueueEnabled() ? [['approvals', (can('FORKLIFT_MANAGE') || can('FORKLIFT_APPROVE')) ? 'คำขออนุมัติ' : 'คำขอของฉัน']] : []),
        ...(can('FORKLIFT_TEMPLATE_MANAGE') ? [['templates', 'Template บัตร']] : []),
        ['reports', 'รายงาน'],
    ];
    return `<div class="flex flex-wrap gap-2">${tabs.map(([key, label]) => `<button class="fl-tab px-4 py-2 rounded-xl text-sm font-black border shadow-sm ${_activeTab === key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}" data-tab="${key}">${label}</button>`).join('')}</div>`;
}

function renderAlerts(dash = {}) {
    const alerts = dash.alerts || {};
    const c = dash.counts || {};
    const total = toNum(c.total);
    const active = toNum(c.active);
    const compliance = total ? Math.round((active / total) * 100) : 0;
    const cards = [
        ['หมดอายุแล้ว', alerts.expired || [], 'bg-red-100 text-red-700'],
        ['เร่งด่วนใน 7 วัน', alerts.urgent7 || [], 'bg-amber-100 text-amber-700'],
        ['ไม่มี Certificate No.', alerts.missingCertificate || [], 'bg-slate-100 text-slate-700'],
    ];
    return `<section class="ds-section p-4">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <div class="flex items-center gap-4 min-w-[220px]">
                <div class="grid h-14 w-14 shrink-0 place-items-center rounded-full border-[6px] ${compliance >= 80 ? 'border-emerald-500 text-emerald-700' : compliance >= 60 ? 'border-amber-400 text-amber-700' : 'border-red-400 text-red-700'} bg-white text-sm font-black">${compliance}%</div>
                <div>
                    <h3 class="text-sm font-black text-slate-800">License Readiness</h3>
                    <p class="text-xs text-slate-500">ใบอนุญาตที่ Active เทียบกับทะเบียนทั้งหมด</p>
                </div>
            </div>
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div class="h-full rounded-full ${compliance >= 80 ? 'bg-emerald-500' : compliance >= 60 ? 'bg-amber-400' : 'bg-red-400'}" style="width:${Math.min(100, Math.max(0, compliance))}%"></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:min-w-[520px]">
                ${cards.map(([title, rows, cls]) => `
                    <div class="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                        <span class="inline-flex items-center gap-2 text-xs font-black ${cls} rounded-full px-2 py-1">${esc(title)} <b>${rows.length}</b></span>
                        <span class="mt-1 block truncate text-[11px] text-slate-500">${rows.length ? esc(rows[0].EmployeeName || rows[0].EmployeeNameSnapshot || rows[0].LicenseNo || '-') : 'ไม่มีรายการแจ้งเตือน'}</span>
                    </div>`).join('')}
            </div>
        </div>
    </section>`;
}

function renderFilters() {
    return `
        <section class="ds-section p-3">
            <div class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2.5">
                <input id="fl-q" class="form-input rounded-xl min-h-[44px]" placeholder="ค้นหา: รหัส/ชื่อ/เลขใบอนุญาต" value="${esc(_filters.q)}">
                <select id="fl-type" class="form-input rounded-xl min-h-[44px]"><option value="all">ทุกประเภท</option>${typeOptions(_filters.type)}</select>
                <select id="fl-status" class="form-input rounded-xl min-h-[44px]">
                    <option value="all">ทุกสถานะ</option>
                    <option value="ACTIVE" ${_filters.status === 'ACTIVE' ? 'selected' : ''}>Active</option>
                    <option value="EXPIRING_SOON" ${_filters.status === 'EXPIRING_SOON' ? 'selected' : ''}>Expiring soon</option>
                    <option value="EXPIRED" ${_filters.status === 'EXPIRED' ? 'selected' : ''}>Expired</option>
                    <option value="SUSPENDED" ${_filters.status === 'SUSPENDED' ? 'selected' : ''}>Suspended</option>
                    <option value="ARCHIVED" ${_filters.status === 'ARCHIVED' ? 'selected' : ''}>Archived</option>
                </select>
                <input id="fl-expire-from" type="date" class="form-input rounded-xl min-h-[44px]" value="${esc(_filters.expireFrom)}">
                <input id="fl-expire-to" type="date" class="form-input rounded-xl min-h-[44px]" value="${esc(_filters.expireTo)}">
                <select id="fl-certificate" class="form-input rounded-xl min-h-[44px]">
                    <option value="all">Certificate: ทั้งหมด</option>
                    <option value="yes" ${_filters.certificate === 'yes' ? 'selected' : ''}>มี Certificate</option>
                    <option value="no" ${_filters.certificate === 'no' ? 'selected' : ''}>ไม่มี Certificate</option>
                </select>
                <button id="fl-filter-btn" class="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 min-h-[44px] whitespace-nowrap">ค้นหา</button>
            </div>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>เรียงตาม License No. จากน้อยไปมาก · รายการที่ไม่มีเลขอยู่ท้ายสุด</span>
                <button id="fl-filter-reset" type="button" class="font-bold text-emerald-700 hover:text-emerald-800">ล้างตัวกรอง</button>
            </div>
        </section>`;
}

function rowActions(row) {
    return `<div class="flex flex-wrap items-center justify-end gap-1">
        <button class="fl-view px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold" data-id="${row.ID}">ดูรายละเอียด</button>
        ${canRequest() && approvalQueueEnabled() ? `<button class="fl-renew-request px-2 py-1 rounded-lg bg-cyan-50 text-cyan-700 text-xs font-bold" data-id="${row.ID}">ขอต่ออายุ</button>` : ''}
        ${can('FORKLIFT_MANAGE') ? `<button class="fl-edit px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold" data-id="${row.ID}">แก้ไข</button>` : ''}
        ${can('FORKLIFT_RENEW') ? `<button class="fl-renew px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold" data-id="${row.ID}">ต่ออายุ</button>` : ''}
        <button class="fl-card px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold" data-id="${row.ID}">บัตร</button>
        <button class="fl-docs px-2 py-1 rounded-lg bg-purple-50 text-purple-700 text-xs font-bold" data-id="${row.ID}">เอกสาร</button>
        ${can('FORKLIFT_SUSPEND') && row.EffectiveStatus !== 'SUSPENDED' ? `<button class="fl-suspend px-2 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold" data-id="${row.ID}">ระงับ</button>` : ''}
        ${can('FORKLIFT_SUSPEND') && row.EffectiveStatus === 'SUSPENDED' ? `<button class="fl-restore px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold" data-id="${row.ID}">คืนสิทธิ์</button>` : ''}
        ${can('FORKLIFT_MANAGE') ? `<button class="fl-archive px-2 py-1 rounded-lg bg-red-50 text-red-700 text-xs font-bold" data-id="${row.ID}">Archive</button>` : ''}
    </div>`;
}

function licenseDetailHtml(row) {
    const item = (label, value) => `<div class="rounded-xl border border-slate-100 bg-slate-50 p-3"><p class="text-[11px] font-bold text-slate-400">${esc(label)}</p><p class="mt-1 text-sm font-bold text-slate-800 break-words">${esc(value || '-')}</p></div>`;
    return `<div class="space-y-4">
        <div class="flex items-start justify-between gap-3"><div><h3 class="text-lg font-black text-slate-800">${esc(row.EmployeeName || row.EmployeeNameSnapshot || '-')}</h3><p class="text-sm text-slate-500">${esc(row.EmployeeID || '-')} · ${esc(row.Department || row.DepartmentSnapshot || '-')} / ${esc(row.Unit || row.UnitSnapshot || '-')}</p></div>${statusBadge(row.EffectiveStatus)}</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${item('ประเภทใบอนุญาต', licenseTypeLabel(row))}${item('ตำแหน่ง', row.Position || row.PositionSnapshot)}${item('License No.', row.LicenseNo)}${item('Card No.', row.CardNo)}${item('วันที่ออก', fmtDate(row.IssueDate))}${item('วันหมดอายุ', fmtDate(row.ExpireDate))}${item('Certificate No.', row.CertificateNo)}${item('สถานะ', row.EffectiveStatus || row.CurrentStatus)}</div>
        ${row.Note ? `<div class="rounded-xl border border-slate-100 p-3"><p class="text-[11px] font-bold text-slate-400">หมายเหตุ</p><p class="mt-1 text-sm text-slate-700 whitespace-pre-wrap">${esc(row.Note)}</p></div>` : ''}
        <div class="flex justify-end"><button type="button" id="fl-detail-close" class="px-4 py-2 rounded-xl border text-sm font-bold">ปิด</button></div>
    </div>`;
}

async function openLicenseDetail(id) {
    UI.openModal('รายละเอียดใบอนุญาตรถยก', modalSkeleton({ label: 'กำลังโหลดรายละเอียดใบอนุญาตรถยก', rows: 4 }), 'max-w-3xl');
    try {
        const row = (await API.get(`/forklift/licenses/${encodeURIComponent(id)}`)).data;
        UI.openModal('รายละเอียดใบอนุญาตรถยก', licenseDetailHtml(row), 'max-w-3xl');
        document.getElementById('fl-detail-close')?.addEventListener('click', UI.closeModal);
    } catch (err) {
        UI.openModal('โหลดรายละเอียดไม่สำเร็จ', `<div class="space-y-4 text-center"><p class="font-bold text-red-600">${esc(err?.message || 'ไม่สามารถโหลดรายละเอียดใบอนุญาตได้')}</p><button type="button" id="fl-detail-error-close" class="rounded-lg border px-4 py-2 text-sm font-bold">ปิด</button></div>`, 'max-w-md');
        document.getElementById('fl-detail-error-close')?.addEventListener('click', UI.closeModal);
    }
}

async function openDeepLinkedLicense() {
    if (_deepLinkHandled) return;
    const id = new URLSearchParams(window.location.search).get('forkliftLicense');
    if (!id) return;
    _deepLinkHandled = true;
    try { await openLicenseDetail(id); }
    catch (err) { UI.showToast(err?.message || 'ไม่สามารถเปิดรายละเอียดใบอนุญาตได้', 'error'); }
}

function renderRegistry() {
    const pages = Math.max(1, Math.ceil(_total / _limit));
    return `
        <section class="ds-section overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div><h2 class="font-black text-slate-800">ทะเบียนใบอนุญาต</h2><p class="text-xs text-slate-500">แสดง ${_licenses.length} / ${_total} รายการ</p></div>
                <div class="flex flex-wrap items-center justify-end gap-2 text-xs">
                    ${can('FORKLIFT_MANAGE') ? `<button id="fl-import-template" class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-600">Template</button><button id="fl-import-btn" class="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 font-bold text-emerald-700">Import Excel</button><input id="fl-import-file" type="file" class="hidden" accept=".xlsx,.xls,.csv">` : ''}
                    <button id="fl-prev" class="px-3 py-1.5 rounded-lg border ${_page <= 1 ? 'opacity-40' : ''}">ก่อนหน้า</button>
                    <span class="font-bold text-slate-500">${_page}/${pages}</span>
                    <button id="fl-next" class="px-3 py-1.5 rounded-lg border ${_page >= pages ? 'opacity-40' : ''}">ถัดไป</button>
                </div>
            </div>
            <div class="hidden lg:block overflow-x-auto">
                <table class="min-w-full text-sm">
                    <thead class="bg-slate-50 text-xs uppercase text-slate-500"><tr><th class="px-4 py-3 text-left">พนักงาน</th><th class="px-4 py-3 text-left">ประเภท</th><th class="px-4 py-3 text-left">เลขใบอนุญาต</th><th class="px-4 py-3 text-left">วันหมดอายุ</th><th class="px-4 py-3 text-left">สถานะ</th><th class="px-4 py-3 text-right">Action</th></tr></thead>
                    <tbody class="divide-y divide-slate-100">
                        ${_licenses.length ? _licenses.map(row => `<tr class="hover:bg-emerald-50/30">
                            <td class="px-4 py-3"><p class="font-bold text-slate-800">${esc(row.EmployeeName || row.EmployeeNameSnapshot || '-')}</p><p class="text-xs text-slate-400">${esc(row.EmployeeID)} · ${esc(row.Department || row.DepartmentSnapshot || '-')} / ${esc(row.Unit || row.UnitSnapshot || '-')}</p></td>
                            <td class="px-4 py-3">${esc(licenseTypeLabel(row))}</td>
                            <td class="px-4 py-3 font-mono text-xs">${esc(row.LicenseNo || '-')}<br><span class="text-slate-400">${esc(row.CardNo || '-')}</span></td>
                            <td class="px-4 py-3">${fmtDate(row.ExpireDate)}</td>
                            <td class="px-4 py-3">${statusBadge(row.EffectiveStatus)}</td>
                            <td class="px-4 py-3">${rowActions(row)}</td>
                        </tr>`).join('') : `<tr><td colspan="6" class="px-4 py-10 text-center text-slate-400">ยังไม่มีข้อมูลใบอนุญาต</td></tr>`}
                    </tbody>
                </table>
            </div>
            <div class="lg:hidden p-3 space-y-3">
                ${_licenses.length ? _licenses.map(row => `<article class="rounded-xl border border-slate-100 p-3">
                    <div class="flex items-start justify-between gap-2"><div><p class="font-black text-slate-800">${esc(row.EmployeeName || row.EmployeeNameSnapshot || '-')}</p><p class="text-xs text-slate-400">${esc(row.EmployeeID)} · ${esc(licenseTypeLabel(row))}</p></div>${statusBadge(row.EffectiveStatus)}</div>
                    <div class="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500"><div><b>License</b><br>${esc(row.LicenseNo || '-')}</div><div><b>Expire</b><br>${fmtDate(row.ExpireDate)}</div></div>
                    <div class="mt-3">${rowActions(row)}</div>
                </article>`).join('') : `<div class="py-10 text-center text-slate-400">ยังไม่มีข้อมูลใบอนุญาต</div>`}
            </div>
        </section>`;
}

function renderRequestsLegacy() {
    if (!can('FORKLIFT_MANAGE')) return `<section class="ds-section p-6 text-center text-slate-500">ต้องมี permission FORKLIFT_MANAGE เพื่อดู Approval Queue</section>`;
    const pending = _requests.filter(row => String(row.RequestStatus).toUpperCase() === 'PENDING').length;
    const approved = _requests.filter(row => String(row.RequestStatus).toUpperCase() === 'APPROVED').length;
    const rejected = _requests.filter(row => String(row.RequestStatus).toUpperCase() === 'REJECTED').length;
    return `<section class="ds-section overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
                <h2 class="font-black text-slate-800">Approval Queue</h2>
                <p class="text-xs text-slate-500">Pending ${pending} · Approved ${approved} · Rejected ${rejected}</p>
            </div>
            <button id="fl-request-add-2" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">+ Request approval</button>
        </div>
        <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
                <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr><th class="px-4 py-3 text-left">Request</th><th class="px-4 py-3 text-left">Employee</th><th class="px-4 py-3 text-left">Type</th><th class="px-4 py-3 text-left">Expire</th><th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3 text-right">Action</th></tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${_requests.length ? _requests.map(row => {
                        const pendingRow = String(row.RequestStatus).toUpperCase() === 'PENDING';
                        return `<tr class="hover:bg-emerald-50/30">
                            <td class="px-4 py-3"><div class="flex flex-wrap items-center gap-2"><p class="font-mono text-xs font-black text-slate-800">${esc(row.RequestNo || '-')}</p>${requestKindBadge(row)}</div><p class="text-xs text-slate-400">${fmtDate(row.RequestedAt)} · ${esc(row.RequestedBy || '-')}</p>${requestKind(row) === 'RENEWAL' && (row.SourceLicenseNo || row.SourceCardNo) ? `<p class="mt-1 text-[11px] font-bold text-cyan-700">อ้างอิง ${esc(row.SourceLicenseNo || row.SourceCardNo)} · เดิมหมดอายุ ${fmtDate(row.SourceExpireDate)}</p>` : ''}</td>
                            <td class="px-4 py-3"><p class="font-bold text-slate-800">${esc(row.EmployeeName || row.EmployeeNameSnapshot || '-')}</p><p class="text-xs text-slate-400">${esc(row.EmployeeID)} · ${esc(row.Department || row.DepartmentSnapshot || '-')} / ${esc(row.Unit || row.UnitSnapshot || '-')}</p></td>
                            <td class="px-4 py-3">${esc(licenseTypeLabel(row))}</td>
                            <td class="px-4 py-3">${fmtDate(row.ExpireDate)}</td>
                            <td class="px-4 py-3">${requestStatusBadge(row.RequestStatus)}${row.LicenseID ? `<p class="mt-1 text-[11px] text-emerald-700">License #${esc(row.LicenseID)}</p>` : ''}${row.ReviewNote ? `<p class="mt-1 max-w-xs truncate text-[11px] text-slate-400">${esc(row.ReviewNote)}</p>` : ''}${approvedRequestHint(row)}</td>
                            <td class="px-4 py-3 text-right">
                                <div class="flex flex-wrap items-center justify-end gap-1">
                                    ${pendingRow && can('FORKLIFT_APPROVE') ? `<button class="fl-approve px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold" data-id="${row.ID}">Approve</button><button class="fl-reject px-2 py-1 rounded-lg bg-red-50 text-red-700 text-xs font-bold" data-id="${row.ID}">Reject</button>` : ''}
                                    ${pendingRow ? `<button class="fl-cancel-request px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold" data-id="${row.ID}">Cancel</button>` : ''}
                                </div>
                            </td>
                        </tr>`;
                    }).join('') : `<tr><td colspan="6" class="px-4 py-10 text-center text-slate-400">ยังไม่มีคำขออนุมัติ</td></tr>`}
                </tbody>
            </table>
        </div>
    </section>`;
}

function renderRequests() {
    if (!canAccessRequests()) return `<section class="ds-section p-6 text-center text-slate-500">ไม่มีสิทธิ์เข้าถึงคำขออนุมัติ</section>`;
    if (!approvalQueueEnabled()) return `<section class="ds-section p-6 text-center text-slate-500">คำขออนุมัติถูกซ่อนไว้ในการตั้งค่า</section>`;
    const pending = _requests.filter(row => String(row.RequestStatus).toUpperCase() === 'PENDING').length;
    const approved = _requests.filter(row => String(row.RequestStatus).toUpperCase() === 'APPROVED').length;
    const rejected = _requests.filter(row => String(row.RequestStatus).toUpperCase() === 'REJECTED').length;
    const summary = _requestSummary || {};
    const signal = (label, value, tone = 'slate', note = '') => { const tones = { slate: 'text-slate-700', blue: 'text-blue-700', red: 'text-red-700', emerald: 'text-emerald-700', cyan: 'text-cyan-700' }; return `<div class="border-r border-slate-100 px-4 py-3 last:border-r-0"><p class="text-xs font-bold text-slate-500">${esc(label)}</p><p class="mt-1 text-xl font-black ${tones[tone] || tones.slate}">${Number(value || 0)}</p>${note ? `<p class="text-[11px] text-slate-400">${esc(note)}</p>` : ''}</div>`; };
    return `<div class="space-y-4"><section class="ds-section overflow-hidden">
        <div class="grid grid-cols-2 divide-y divide-slate-100 border-b border-slate-100 md:grid-cols-4 md:divide-y-0">${signal('รอส่ง / แก้ไข', Number(summary.draft || 0) + Number(summary.returned || 0), 'slate')}${signal('รอตรวจสอบ', Number(summary.submitted || 0) + Number(summary.underReview || 0), 'blue')}${signal('เกิน SLA', summary.overdue, Number(summary.overdue || 0) ? 'red' : 'emerald', `เกณฑ์ ${summary.slaDays || 3} วัน`)}${signal('คำขอต่ออายุ', summary.renewals, 'cyan')}</div>
        <div class="px-4 py-3 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
                <h2 class="font-black text-slate-800">คำขออนุมัติ</h2>
                <p class="text-xs text-slate-500">ใช้สำหรับตรวจคำขอออกใบอนุญาตก่อนสร้าง License จริง ถ้าไม่ใช้ workflow นี้สามารถซ่อน tab ได้ใน Settings</p>
                <p class="mt-1 text-xs text-slate-400">Open ${_requests.filter(row => ['DRAFT','RETURNED','SUBMITTED','UNDER_REVIEW','PENDING'].includes(String(row.RequestStatus).toUpperCase())).length} - Approved ${approved} - Rejected ${rejected}</p>
            </div>
            <button id="fl-request-add-2" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">+ สร้างคำขออนุมัติ</button>
        </div>
        <div class="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3 md:flex-row md:items-center">
            <select id="fl-request-status-filter" class="form-input rounded-lg text-sm"><option value="all">ทุกสถานะ</option>${['DRAFT','SUBMITTED','UNDER_REVIEW','RETURNED','APPROVED','REJECTED','CANCELLED'].map(value => `<option value="${value}" ${_requestFilters.status === value ? 'selected' : ''}>${value}</option>`).join('')}</select>
            <select id="fl-request-kind-filter" class="form-input rounded-lg text-sm"><option value="all">ทุกประเภทคำขอ</option><option value="NEW" ${_requestFilters.kind === 'NEW' ? 'selected' : ''}>ออกใบใหม่</option><option value="RENEWAL" ${_requestFilters.kind === 'RENEWAL' ? 'selected' : ''}>ต่ออายุ</option></select>
            <label class="flex items-center gap-2 text-sm font-bold text-slate-600"><input id="fl-request-overdue-filter" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-red-600" ${_requestFilters.overdue ? 'checked' : ''}>เฉพาะเกิน SLA</label>
            ${can('FORKLIFT_APPROVE') && Number(summary.overdue || 0) > 0 ? '<button id="fl-request-escalate" class="md:ml-auto rounded-lg bg-red-600 px-4 py-2 text-sm font-black text-white">ส่ง Escalation</button>' : ''}
        </div>
        <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
                <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr><th class="px-4 py-3 text-left">Request</th><th class="px-4 py-3 text-left">Employee</th><th class="px-4 py-3 text-left">Type</th><th class="px-4 py-3 text-left">Expire</th><th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3 text-right">Action</th></tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${_requests.length ? _requests.map(row => {
                        const pendingRow = ['SUBMITTED','UNDER_REVIEW','PENDING'].includes(String(row.RequestStatus).toUpperCase());
                        const submittedAt = row.SubmittedAt || row.RequestedAt;
                        const ageDays = submittedAt ? Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86400000) : 0;
                        const overdue = pendingRow && ageDays > Number(summary.slaDays || 3);
                        return `<tr class="hover:bg-emerald-50/30">
                            <td class="px-4 py-3"><div class="flex flex-wrap items-center gap-2"><p class="font-mono text-xs font-black text-slate-800">${esc(row.RequestNo || '-')}</p>${requestKindBadge(row)}</div><p class="text-xs text-slate-400">${fmtDate(row.RequestedAt)} - ${esc(row.RequestedBy || '-')}</p>${requestKind(row) === 'RENEWAL' && (row.SourceLicenseNo || row.SourceCardNo) ? `<p class="mt-1 text-[11px] font-bold text-cyan-700">อ้างอิง ${esc(row.SourceLicenseNo || row.SourceCardNo)} · เดิมหมดอายุ ${fmtDate(row.SourceExpireDate)}</p>` : ''}</td>
                            <td class="px-4 py-3"><p class="font-bold text-slate-800">${esc(row.EmployeeName || row.EmployeeNameSnapshot || '-')}</p><p class="text-xs text-slate-400">${esc(row.EmployeeID)} - ${esc(row.Department || row.DepartmentSnapshot || '-')} / ${esc(row.Unit || row.UnitSnapshot || '-')}</p></td>
                            <td class="px-4 py-3">${esc(licenseTypeLabel(row))}</td>
                            <td class="px-4 py-3">${fmtDate(row.ExpireDate)}</td>
                            <td class="px-4 py-3">${requestStatusBadge(row.RequestStatus)}${overdue ? `<span class="ml-1 inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-black text-red-700">เกิน SLA ${ageDays} วัน</span>` : ''}${row.LicenseID ? `<p class="mt-1 text-[11px] text-emerald-700">License #${esc(row.LicenseID)}</p>` : ''}${row.ReviewNote ? `<p class="mt-1 max-w-xs truncate text-[11px] text-slate-400">${esc(row.ReviewNote)}</p>` : ''}${approvedRequestHint(row)}</td>
                            <td class="px-4 py-3 text-right">
                                <div class="flex flex-wrap items-center justify-end gap-1">
                                    <button class="fl-request-detail px-2 py-1 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold" data-id="${row.ID}">รายละเอียด</button>
                                    ${pendingRow && can('FORKLIFT_APPROVE') ? `<button class="fl-approve px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold" data-id="${row.ID}">Approve</button><button class="fl-reject px-2 py-1 rounded-lg bg-red-50 text-red-700 text-xs font-bold" data-id="${row.ID}">Reject</button>` : ''}
                                    ${pendingRow ? `<button class="fl-cancel-request px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold" data-id="${row.ID}">Cancel</button>` : ''}
                                </div>
                            </td>
                        </tr>`;
                    }).join('') : `<tr><td colspan="6" class="px-4 py-10 text-center text-slate-400">ยังไม่มีคำขออนุมัติ</td></tr>`}
                </tbody>
            </table>
        </div>
    </section></div>`;
}

function formHtml(row = {}, { isRequest = false, selfRequest = false } = {}) {
    const issueValue = fmtDate(row.IssueDate) !== '-' ? fmtDate(row.IssueDate) : (isRequest ? isoToday() : '');
    const expireValue = fmtDate(row.ExpireDate) !== '-' ? fmtDate(row.ExpireDate) : (isRequest ? addMonths(issueValue, selectedValidityMonths({ querySelectorAll: () => [] }, row.LicenseTypeID || _types[0]?.ID)) : '');
    return `<form id="fl-form" class="space-y-4">
        <div>
            <label class="text-xs font-bold text-slate-500">${selfRequest ? 'ผู้ยื่นคำขอ' : 'ค้นหาพนักงานจาก Employee Master'}</label>
            <input id="fl-emp-search" class="form-input w-full rounded-xl mt-1" placeholder="พิมพ์รหัสหรือชื่อพนักงาน" value="${esc(row.EmployeeID ? `${row.EmployeeID} ${row.EmployeeName || ''}` : '')}" ${selfRequest ? 'readonly' : ''}>
            <input type="hidden" name="EmployeeID" value="${esc(row.EmployeeID || '')}">
            <div id="fl-emp-results" class="mt-2 max-h-48 overflow-auto rounded-xl border border-slate-100 hidden"></div>
        </div>
        <div id="fl-emp-card" class="${row.EmployeeID ? '' : 'hidden'} rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm"><p class="font-black text-slate-800">${esc(row.EmployeeName || row.EmployeeNameSnapshot || '-')}</p><p class="text-xs text-slate-500">${esc(row.EmployeeID || '')} · ${esc(row.Department || row.DepartmentSnapshot || '-')} / ${esc(row.Unit || row.UnitSnapshot || '-')} · ${esc(row.Position || row.PositionSnapshot || '-')}</p></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="md:col-span-2"><span class="text-xs font-bold text-slate-500">ประเภท</span><div class="mt-1">${typeCheckboxes(row)}</div></div>
            <label class="text-xs font-bold text-slate-500">Certificate No.<input name="CertificateNo" class="form-input w-full rounded-xl mt-1" value="${esc(row.CertificateNo || '')}"></label>
            ${isRequest ? '' : `<label class="text-xs font-bold text-slate-500">License No. <span class="text-slate-400">(เว้นว่างเพื่อรันอัตโนมัติ)</span><input name="LicenseNo" class="form-input w-full rounded-xl mt-1" value="${esc(row.LicenseNo || '')}"></label>
            <label class="text-xs font-bold text-slate-500">Card No. <span class="text-slate-400">(เว้นว่างเพื่อรันอัตโนมัติ)</span><input name="CardNo" class="form-input w-full rounded-xl mt-1" value="${esc(row.CardNo || '')}"></label>`}
            <label class="text-xs font-bold text-slate-500">วันที่ออกบัตร<input name="IssueDate" type="date" required class="form-input w-full rounded-xl mt-1" value="${esc(issueValue)}"></label>
            <label class="text-xs font-bold text-slate-500">วันหมดอายุ <span class="text-slate-400">(อัตโนมัติ)</span><input name="ExpireDate" type="date" required readonly class="form-input w-full rounded-xl mt-1 bg-slate-50" value="${esc(expireValue)}"></label>
            ${isRequest ? '' : `<label class="text-xs font-bold text-slate-500">สถานะ<select name="CurrentStatus" class="form-input w-full rounded-xl mt-1"><option value="ACTIVE" ${row.CurrentStatus !== 'SUSPENDED' ? 'selected' : ''}>ACTIVE</option><option value="SUSPENDED" ${row.CurrentStatus === 'SUSPENDED' ? 'selected' : ''}>SUSPENDED</option></select></label>`}
        </div>
        <label class="text-xs font-bold text-slate-500">หมายเหตุ<textarea name="Note" class="form-input w-full rounded-xl mt-1" rows="3">${esc(row.Note || '')}</textarea></label>
        ${isRequest ? `<section class="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
            <h3 class="text-sm font-black text-slate-800">เอกสารประกอบคำขอ</h3>
            <div class="mt-3 grid gap-3 md:grid-cols-2">
                <label class="text-xs font-bold text-slate-500">Certificate อบรม <span class="text-red-600">บังคับ</span><input name="TrainingCertificateFile" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" class="mt-1 block w-full text-xs"></label>
                <label class="text-xs font-bold text-slate-500">รูปพนักงาน <span class="text-red-600">บังคับ</span><input name="EmployeePhotoFile" type="file" required accept=".jpg,.jpeg,.png,.webp" class="mt-1 block w-full text-xs"></label>
                <label class="text-xs font-bold text-slate-500 md:col-span-2">อื่นๆ <span class="text-slate-400">ไม่บังคับ</span><input name="OtherDocumentFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="mt-1 block w-full text-xs"></label>
            </div>
        </section>` : ''}
        <div class="flex justify-end gap-2 pt-2"><button type="button" id="fl-cancel-btn" class="px-4 py-2 rounded-xl border text-sm font-bold">ยกเลิก</button><button class="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">${isRequest ? 'ส่งคำขออนุมัติ' : 'บันทึก'}</button></div>
    </form>`;
}

async function openForm(id = null, mode = 'license') {
    const isRequest = mode === 'request' && !id;
    const selfRequest = isRequest && !can('FORKLIFT_MANAGE');
    const row = id ? (await API.get(`/forklift/licenses/${id}`)).data : (selfRequest ? (await API.get('/forklift/request-profile')).data : {});
    UI.openModal(id ? 'แก้ไขใบอนุญาตรถยก' : (isRequest ? 'ส่งคำขออนุมัติใบอนุญาตรถยก' : 'เพิ่มใบอนุญาตรถยก'), formHtml(row, { isRequest, selfRequest }), 'max-w-3xl');
    const form = document.getElementById('fl-form');
    const search = document.getElementById('fl-emp-search');
    const results = document.getElementById('fl-emp-results');
    document.getElementById('fl-cancel-btn')?.addEventListener('click', UI.closeModal);
    document.querySelectorAll('.fl-type-check').forEach(input => input.addEventListener('change', () => {
        const checked = [...document.querySelectorAll('.fl-type-check:checked')];
        if (checked.length > 2) {
            input.checked = false;
            UI.showToast('เลือกประเภทรถยกได้สูงสุด 2 ประเภท', 'warning');
        }
        syncExpireDate(form, { fallbackTypeId: row.LicenseTypeID || _types[0]?.ID });
    }));
    form?.elements?.IssueDate?.addEventListener('change', () => syncExpireDate(form, { fallbackTypeId: row.LicenseTypeID || _types[0]?.ID }));
    syncExpireDate(form, { fallbackTypeId: row.LicenseTypeID || _types[0]?.ID });
    let timer = null;
    let searchVersion = 0;
    if (!selfRequest) search?.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            const version = ++searchVersion;
            const q = search.value.trim();
            if (q.length < 2) { results.classList.add('hidden'); return; }
            const rows = (await API.get(`/forklift/employees?q=${encodeURIComponent(q)}&limit=20`)).data || [];
            if (version !== searchVersion) return;
            results.innerHTML = rows.map(emp => `<button type="button" class="fl-emp-pick w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-slate-50" data-emp='${esc(JSON.stringify(emp))}'><b>${esc(emp.EmployeeName)}</b><br><span class="text-xs text-slate-500">${esc(emp.EmployeeID)} · ${esc(emp.Department)} / ${esc(emp.Unit)} · ${esc(emp.Position)}</span></button>`).join('') || '<div class="px-3 py-3 text-sm text-slate-400">ไม่พบพนักงาน</div>';
            results.classList.remove('hidden');
        }, 250);
    });
    results?.addEventListener('click', event => {
        const btn = event.target.closest('.fl-emp-pick');
        if (!btn) return;
        const emp = JSON.parse(btn.dataset.emp || '{}');
        form.EmployeeID.value = emp.EmployeeID || '';
        search.value = `${emp.EmployeeID} ${emp.EmployeeName}`;
        document.getElementById('fl-emp-card').classList.remove('hidden');
        document.getElementById('fl-emp-card').innerHTML = `<p class="font-black text-slate-800">${esc(emp.EmployeeName)}</p><p class="text-xs text-slate-500">${esc(emp.EmployeeID)} · ${esc(emp.Department || '-')} / ${esc(emp.Unit || '-')} · ${esc(emp.Position || '-')}</p>`;
        results.classList.add('hidden');
    });
    form?.addEventListener('submit', async event => {
        event.preventDefault();
        const body = Object.fromEntries(new FormData(form).entries());
        const trainingFile = form.TrainingCertificateFile?.files?.[0] || null;
        const photoFile = form.EmployeePhotoFile?.files?.[0] || null;
        const otherFile = form.OtherDocumentFile?.files?.[0] || null;
        delete body.TrainingCertificateFile;
        delete body.EmployeePhotoFile;
        delete body.OtherDocumentFile;
        const typeIds = [...form.querySelectorAll('.fl-type-check:checked')].map(input => input.value);
        body.LicenseTypeIDs = typeIds;
        body.LicenseTypeID = typeIds[0] || '';
        syncExpireDate(form, { fallbackTypeId: body.LicenseTypeID || _types[0]?.ID });
        body.ExpireDate = form.ExpireDate.value;
        if (!body.EmployeeID) return UI.showToast('กรุณาเลือกพนักงานจาก Employee Master', 'error');
        if (!typeIds.length) return UI.showToast('กรุณาเลือกประเภทรถยกอย่างน้อย 1 ประเภท', 'error');
        if (isRequest && (!trainingFile || !photoFile)) return UI.showToast('กรุณาแนบ Certificate อบรมและรูปพนักงานก่อนส่ง', 'error');
        await runForkliftForm(form, event.submitter || form.querySelector('button:not([type="button"])'), isRequest ? 'กำลังส่งคำขอ...' : 'กำลังบันทึก...', async () => {
            let result = null;
            if (id) result = await API.put(`/forklift/licenses/${id}`, body);
            else if (isRequest) {
                result = await API.post('/forklift/requests', body);
                await uploadRequestDocumentFile(result.id, 'TRAINING_CERTIFICATE', trainingFile);
                await uploadRequestDocumentFile(result.id, 'EMPLOYEE_PHOTO', photoFile);
                if (otherFile?.size) await uploadRequestDocumentFile(result.id, 'OTHER', otherFile);
                await API.post(`/forklift/requests/${result.id}/submit`, {});
            }
            else result = await API.post('/forklift/licenses', body);
            UI.closeModal();
            UI.showToast(isRequest ? 'ส่งคำขออนุมัติแล้ว' : 'บันทึกใบอนุญาตสำเร็จ', 'success');
            if (isRequest) _activeTab = 'approvals';
            invalidateForkliftCache('data');
            await render();
        }, 'บันทึกไม่สำเร็จ');
    });
}

async function openRequestDetail(id) {
    UI.openModal('กำลังโหลดคำขอใบอนุญาต', modalSkeleton({ label: 'กำลังโหลดคำขอใบอนุญาต', rows: 5 }), 'max-w-4xl');
    const load = async () => {
        const detail = (await API.get(`/forklift/requests/${id}`)).data;
        const editable = ['DRAFT', 'RETURNED'].includes(String(detail.RequestStatus).toUpperCase());
        const reviewable = ['SUBMITTED', 'UNDER_REVIEW', 'PENDING'].includes(String(detail.RequestStatus).toUpperCase());
        const docByType = Object.fromEntries((detail.Documents || []).map(doc => [doc.DocumentType, doc]));
        const eventLabels = { CREATED: 'สร้าง Draft', RENEWAL_DRAFT_CREATED: 'สร้าง Draft ต่ออายุ', RENEWAL_DRAFT_REUSED: 'ดำเนินการต่อจาก Draft เดิม', DOCUMENT_UPLOADED: 'อัปโหลดเอกสาร', DOCUMENT_REMOVED: 'ลบเอกสาร', SUBMITTED: 'ส่งคำขอ', REVIEW_STARTED: 'เริ่มตรวจสอบ', RETURNED: 'ตีกลับให้แก้ไข', APPROVED: 'อนุมัติ', REJECTED: 'ไม่อนุมัติ', CANCELLED: 'ยกเลิก' };
        UI.openModal(`คำขอ ${detail.RequestNo || ''}`, `<div class="space-y-5">
            <section class="grid gap-3 md:grid-cols-4 text-sm"><div><p class="text-xs font-bold text-slate-400">พนักงาน</p><p class="font-black text-slate-800">${esc(detail.EmployeeName || detail.EmployeeNameSnapshot || '-')}</p><p class="text-xs text-slate-500">${esc(detail.EmployeeID || '')}</p></div><div><p class="text-xs font-bold text-slate-400">ประเภทรถยก</p><p class="font-bold text-slate-800">${esc(licenseTypeLabel(detail))}</p></div><div><p class="text-xs font-bold text-slate-400">ประเภทคำขอ</p>${requestKindBadge(detail)}</div><div><p class="text-xs font-bold text-slate-400">สถานะ</p>${requestStatusBadge(detail.RequestStatus)}</div></section>
            ${sourceLicensePanel(detail)}
            ${approvedRequestHint(detail)}
            <section class="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm md:grid-cols-4"><div><p class="text-xs font-bold text-slate-400">วันที่เริ่มรอบใหม่</p><p class="font-bold text-slate-800">${fmtDate(detail.IssueDate)}</p></div><div><p class="text-xs font-bold text-slate-400">วันหมดอายุใหม่</p><p class="font-bold text-slate-800">${fmtDate(detail.ExpireDate)}</p></div><div><p class="text-xs font-bold text-slate-400">Certificate No.</p><p class="font-bold text-slate-800">${esc(detail.CertificateNo || '-')}</p></div><div><p class="text-xs font-bold text-slate-400">หมายเหตุคำขอ</p><p class="font-bold text-slate-800">${esc(detail.RequestNote || '-')}</p></div></section>
            ${detail.ReviewNote ? `<div class="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm"><b>หมายเหตุผู้ตรวจ:</b> ${esc(detail.ReviewNote)}</div>` : ''}
            <section><h3 class="mb-2 font-black text-slate-800">เอกสารประกอบ</h3><div class="space-y-2">${(detail.Checklist || []).map(item => { const doc = docByType[item.type]; const required = item.required !== false; const accept = item.accept || '.pdf,.jpg,.jpeg,.png,.webp'; return `<div class="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"><div><p class="font-bold text-slate-800">${item.complete ? '✓' : '○'} ${esc(item.label)} <span class="ml-1 rounded-full ${required ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'} px-2 py-0.5 text-[10px] font-black">${required ? 'บังคับ' : 'ไม่บังคับ'}</span></p>${doc ? `<a class="text-xs text-blue-700 underline" href="${esc(doc.FileUrl)}" target="_blank" rel="noopener">${esc(doc.OriginalName || 'เปิดเอกสาร')}</a>` : `<p class="text-xs ${required ? 'text-red-600' : 'text-slate-400'}">${required ? 'ยังไม่มีเอกสาร' : 'แนบเพิ่มได้ถ้ามี'}</p>`}</div>${editable ? `<form class="fl-request-doc-upload flex items-center gap-2" data-type="${item.type}"><input name="file" type="file" required accept="${esc(accept)}" class="max-w-[220px] text-xs"><button class="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">อัปโหลด</button>${doc ? `<button type="button" class="fl-request-doc-delete rounded-lg border px-3 py-2 text-xs font-bold" data-id="${doc.ID}">ลบ</button>` : ''}</form>` : ''}</div>`; }).join('')}</div></section>
            <section><h3 class="mb-2 font-black text-slate-800">Timeline</h3><div class="space-y-2">${(detail.Events || []).map(event => `<div class="border-l-2 border-emerald-200 pl-3 text-sm"><p class="font-bold text-slate-800">${esc(eventLabels[event.EventType] || event.EventType)}</p><p class="text-xs text-slate-500">${esc(event.ActorName || event.ActorID || '-')} · ${fmtDate(event.CreatedAt)}${event.Comment ? ` · ${esc(event.Comment)}` : ''}</p></div>`).join('') || '<p class="text-sm text-slate-400">ยังไม่มีประวัติ</p>'}</div></section>
            <div class="flex flex-wrap justify-end gap-2">${editable && detail.CanSubmit ? '<button id="fl-request-submit" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white">ส่งขออนุมัติ</button>' : ''}${editable && !detail.CanSubmit ? '<span class="self-center text-xs font-bold text-orange-600">แนบเอกสารให้ครบก่อนส่ง</span>' : ''}${reviewable && can('FORKLIFT_APPROVE') && String(detail.RequestStatus).toUpperCase() !== 'UNDER_REVIEW' ? '<button id="fl-request-review" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white">เริ่มตรวจ</button>' : ''}${reviewable && can('FORKLIFT_APPROVE') ? '<button id="fl-request-return" class="rounded-lg bg-orange-50 px-4 py-2 text-sm font-black text-orange-700">ตีกลับ</button><button id="fl-request-approve-detail" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white">อนุมัติ</button><button id="fl-request-reject-detail" class="rounded-lg bg-red-50 px-4 py-2 text-sm font-black text-red-700">ไม่อนุมัติ</button>' : ''}${['DRAFT','RETURNED','SUBMITTED','PENDING'].includes(String(detail.RequestStatus).toUpperCase()) ? '<button id="fl-request-cancel-detail" class="rounded-lg border px-4 py-2 text-sm font-bold text-slate-600">ยกเลิกคำขอ</button>' : ''}</div>
        </div>`, 'max-w-4xl');
        document.querySelectorAll('.fl-request-doc-upload').forEach(form => form.addEventListener('submit', event => { event.preventDefault(); const fd = new FormData(form); fd.set('DocumentType', form.dataset.type); return runForkliftForm(form, event.submitter, 'กำลังอัปโหลด...', async () => { await API.post(`/forklift/requests/${id}/documents`, fd);UI.showToast('อัปโหลดเอกสารแล้ว', 'success');await load(); }, 'อัปโหลดเอกสารไม่สำเร็จ'); }));
        document.querySelectorAll('.fl-request-doc-delete').forEach(btn => btn.addEventListener('click', () => { if (!confirm('ลบเอกสารนี้?')) return; return runBusy(btn, 'กำลังลบ...', async () => { await API.delete(`/forklift/request-documents/${btn.dataset.id}`);await load(); }, 'ลบเอกสารไม่สำเร็จ'); }));
        document.getElementById('fl-request-submit')?.addEventListener('click', event => runBusy(event.currentTarget, 'กำลังส่ง...', async () => { await API.post(`/forklift/requests/${id}/submit`, {}); UI.showToast('ส่งคำขอแล้ว', 'success'); await load(); }));
        document.getElementById('fl-request-review')?.addEventListener('click', event => runBusy(event.currentTarget, 'กำลังเริ่มตรวจ...', async () => { await API.post(`/forklift/requests/${id}/start-review`, {}); await load(); }));
        document.getElementById('fl-request-return')?.addEventListener('click', event => { const ReviewNote = prompt('ระบุสิ่งที่ต้องแก้ไข') || ''; if (!ReviewNote) return; return runBusy(event.currentTarget, 'กำลังตีกลับ...', async () => { await API.post(`/forklift/requests/${id}/return`, { ReviewNote }); await load(); }); });
        document.getElementById('fl-request-approve-detail')?.addEventListener('click', event => { const ReviewNote = prompt('หมายเหตุการอนุมัติ (ถ้ามี)') || ''; return runBusy(event.currentTarget, 'กำลังอนุมัติ...', async () => { await API.post(`/forklift/requests/${id}/approve`, { ReviewNote }); UI.showToast('อนุมัติแล้ว ผู้ใช้ดูบัตรและเอกสารได้ที่ทะเบียนใบอนุญาต', 'success'); UI.closeModal(); invalidateForkliftCache('data'); await render(); }); });
        document.getElementById('fl-request-reject-detail')?.addEventListener('click', event => { const ReviewNote = prompt('ระบุเหตุผลที่ไม่อนุมัติ') || ''; if (!ReviewNote) return; return runBusy(event.currentTarget, 'กำลังปฏิเสธ...', async () => { await API.post(`/forklift/requests/${id}/reject`, { ReviewNote }); await load(); }); });
        document.getElementById('fl-request-cancel-detail')?.addEventListener('click', event => { if (!confirm('ยกเลิกคำขอนี้?')) return; return runBusy(event.currentTarget, 'กำลังยกเลิก...', async () => { await API.post(`/forklift/requests/${id}/cancel`, {}); UI.closeModal(); invalidateForkliftCache('data'); await render(); }); });
    };
    try { await load(); }
    catch (err) {
        UI.openModal('โหลดคำขอไม่สำเร็จ', `<div class="space-y-4 text-center"><p class="font-bold text-red-600">${esc(err?.message || 'ไม่สามารถโหลดรายละเอียดคำขอได้')}</p><button type="button" id="fl-request-load-close" class="rounded-lg border px-4 py-2 text-sm font-bold">ปิด</button></div>`, 'max-w-md');
        document.getElementById('fl-request-load-close')?.addEventListener('click', UI.closeModal);
    }
}

const RENEWAL_PROCESSING_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW', 'PENDING']);

async function findOpenRenewalRequest(licenseId) {
    const response = await API.get(`/forklift/requests?kind=RENEWAL&sourceLicenseId=${encodeURIComponent(licenseId)}&limit=1`);
    return (response.data || [])[0] || null;
}

async function focusExistingRenewalRequest(request, message = 'เปิดคำขอต่ออายุที่มีอยู่แล้ว') {
    const requestId = Number(request?.ID || request?.id || 0);
    if (!requestId) return;
    UI.closeModal();
    _activeTab = 'approvals';
    invalidateForkliftCache('data');
    await render();
    await openRequestDetail(requestId);
    UI.showToast(message, 'info');
}

async function openRenewalRequest(id) {
    const [licenseResponse, existing] = await Promise.all([
        API.get(`/forklift/licenses/${id}`),
        findOpenRenewalRequest(id),
    ]);
    const row = licenseResponse.data;
    const existingStatus = String(existing?.RequestStatus || '').toUpperCase();
    if (existing && RENEWAL_PROCESSING_STATUSES.has(existingStatus)) {
        await focusExistingRenewalRequest(existing, `คำขอ ${existing.RequestNo || ''} อยู่ระหว่างดำเนินการแล้ว`);
        return;
    }
    const existingDetail = existing && ['DRAFT', 'RETURNED'].includes(existingStatus)
        ? (await API.get(`/forklift/requests/${existing.ID}`)).data
        : null;
    const existingDocuments = new Set((existingDetail?.Documents || []).map(document => String(document.DocumentType || '').toUpperCase()));
    const renewalIssue = fmtDate(existingDetail?.IssueDate) !== '-' ? fmtDate(existingDetail.IssueDate) : isoToday();
    const renewalExpire = fmtDate(existingDetail?.ExpireDate) !== '-'
        ? fmtDate(existingDetail.ExpireDate)
        : addMonths(renewalIssue, selectedValidityMonths({ querySelectorAll: () => [] }, row.LicenseTypeID || row.LicenseTypeIDs?.[0]));
    const existingFileHint = type => existingDocuments.has(type) ? '<span class="text-emerald-600">มีไฟล์เดิมแล้ว เลือกใหม่เมื่อต้องการแทนที่</span>' : '<span class="text-red-600">บังคับ</span>';
    const requiredUnlessExisting = type => existingDocuments.has(type) ? '' : 'required';
    UI.openModal('สร้างคำขอต่ออายุใบอนุญาต', `<form id="fl-renew-request-form" class="space-y-4">
        <div class="rounded-lg border border-cyan-100 bg-cyan-50 p-3"><p class="font-black text-slate-800">${esc(row.EmployeeName || row.EmployeeNameSnapshot || '-')}</p><p class="text-xs text-slate-600">${esc(row.LicenseNo || '-')} · หมดอายุ ${fmtDate(row.ExpireDate)}</p></div>
        ${existingDetail ? `<div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><p class="font-black">ดำเนินการต่อจากคำขอ ${esc(existingDetail.RequestNo || '')}</p><p class="mt-1 text-xs">ระบบจะใช้ Draft/รายการที่ถูกตีกลับเดิม เอกสารเดิมยังอยู่และไฟล์ที่เลือกใหม่จะแทนที่เฉพาะประเภทนั้น</p>${existingDetail.ReviewNote ? `<p class="mt-2 text-xs"><b>สิ่งที่ต้องแก้ไข:</b> ${esc(existingDetail.ReviewNote)}</p>` : ''}</div>` : ''}
        <div class="grid gap-3 md:grid-cols-2"><label class="text-xs font-bold text-slate-500">วันที่เริ่มรอบใหม่<input name="NewIssueDate" type="date" required class="form-input mt-1 w-full rounded-lg" value="${esc(renewalIssue)}"></label><label class="text-xs font-bold text-slate-500">วันหมดอายุใหม่ <span class="text-slate-400">(อัตโนมัติ)</span><input name="NewExpireDate" type="date" required readonly class="form-input mt-1 w-full rounded-lg bg-slate-50" value="${esc(renewalExpire)}"></label></div>
        <label class="text-xs font-bold text-slate-500">Certificate No. ใหม่<input name="NewCertificateNo" class="form-input mt-1 w-full rounded-lg" value="${esc(existingDetail?.CertificateNo || row.CertificateNo || '')}"></label>
        <label class="text-xs font-bold text-slate-500">เหตุผล/หมายเหตุ<textarea name="RenewalNote" rows="3" class="form-input mt-1 w-full rounded-lg">${esc(existingDetail?.RequestNote || '')}</textarea></label>
        <section class="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3">
            <h3 class="text-sm font-black text-slate-800">เอกสารประกอบคำขอต่ออายุ</h3>
            <div class="mt-3 grid gap-3 md:grid-cols-2">
                <label class="text-xs font-bold text-slate-500">Certificate อบรม ${existingFileHint('TRAINING_CERTIFICATE')}<input name="TrainingCertificateFile" type="file" ${requiredUnlessExisting('TRAINING_CERTIFICATE')} accept=".pdf,.jpg,.jpeg,.png,.webp" class="mt-1 block w-full text-xs"></label>
                <label class="text-xs font-bold text-slate-500">รูปพนักงาน ${existingFileHint('EMPLOYEE_PHOTO')}<input name="EmployeePhotoFile" type="file" ${requiredUnlessExisting('EMPLOYEE_PHOTO')} accept=".jpg,.jpeg,.png,.webp" class="mt-1 block w-full text-xs"></label>
                <label class="text-xs font-bold text-slate-500">เอกสารต่ออายุ ${existingFileHint('RENEWAL_DOCUMENT')}<input name="RenewalDocumentFile" type="file" ${requiredUnlessExisting('RENEWAL_DOCUMENT')} accept=".pdf,.jpg,.jpeg,.png,.webp" class="mt-1 block w-full text-xs"></label>
                <label class="text-xs font-bold text-slate-500">อื่นๆ <span class="text-slate-400">ไม่บังคับ</span><input name="OtherDocumentFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="mt-1 block w-full text-xs"></label>
            </div>
        </section>
        <div class="flex justify-end gap-2"><button type="button" id="fl-renew-request-cancel" class="rounded-lg border px-4 py-2 text-sm font-bold">ยกเลิก</button><button class="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-black text-white">ส่งคำขอต่ออายุ</button></div>
    </form>`, 'max-w-2xl');
    const form = document.getElementById('fl-renew-request-form');
    form?.elements?.NewIssueDate?.addEventListener('change', () => {
        form.NewExpireDate.value = addMonths(form.NewIssueDate.value, selectedValidityMonths({ querySelectorAll: () => [] }, row.LicenseTypeID || row.LicenseTypeIDs?.[0]));
    });
    document.getElementById('fl-renew-request-cancel')?.addEventListener('click', UI.closeModal);
    form?.addEventListener('submit', async event => {
        event.preventDefault();
        const body = Object.fromEntries(new FormData(event.target).entries());
        const trainingFile = form.TrainingCertificateFile?.files?.[0] || null;
        const photoFile = form.EmployeePhotoFile?.files?.[0] || null;
        const renewalFile = form.RenewalDocumentFile?.files?.[0] || null;
        const otherFile = form.OtherDocumentFile?.files?.[0] || null;
        delete body.TrainingCertificateFile;
        delete body.EmployeePhotoFile;
        delete body.RenewalDocumentFile;
        delete body.OtherDocumentFile;
        body.NewExpireDate = form.NewExpireDate.value;
        if ((!trainingFile && !existingDocuments.has('TRAINING_CERTIFICATE')) || (!photoFile && !existingDocuments.has('EMPLOYEE_PHOTO')) || (!renewalFile && !existingDocuments.has('RENEWAL_DOCUMENT'))) return UI.showToast('กรุณาแนบ Certificate อบรม รูปพนักงาน และเอกสารต่ออายุให้ครบ', 'error');
        await runForkliftForm(form, event.submitter || form.querySelector('button:not([type="button"])'), 'กำลังส่งคำขอต่ออายุ...', async () => {
            let result;
            try {
                result = await API.post(`/forklift/licenses/${id}/renewal-request`, body);
            } catch (error) {
                if (error?.code === 'RENEWAL_REQUEST_ALREADY_OPEN' && error?.id) {
                    await focusExistingRenewalRequest(error, `คำขอ ${error.RequestNo || ''} อยู่ระหว่างดำเนินการแล้ว`);
                    return;
                }
                throw error;
            }
            if (trainingFile?.size) await uploadRequestDocumentFile(result.id, 'TRAINING_CERTIFICATE', trainingFile);
            if (photoFile?.size) await uploadRequestDocumentFile(result.id, 'EMPLOYEE_PHOTO', photoFile);
            if (renewalFile?.size) await uploadRequestDocumentFile(result.id, 'RENEWAL_DOCUMENT', renewalFile);
            if (otherFile?.size) await uploadRequestDocumentFile(result.id, 'OTHER', otherFile);
            await API.post(`/forklift/requests/${result.id}/submit`, {});
            UI.closeModal();
            _activeTab = 'approvals';
            invalidateForkliftCache('data');
            await render();
            UI.showToast(result.reused ? 'ดำเนินการต่อจาก Draft เดิมและส่งคำขอต่ออายุแล้ว' : 'ส่งคำขอต่ออายุแล้ว', 'success');
        }, 'ส่งคำขอต่ออายุไม่สำเร็จ');
    });
}

function renewFormHtml(row = {}) {
    return `<form id="fl-renew-form" class="space-y-4">
        <div class="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm"><p class="font-black text-slate-800">${esc(row.EmployeeName || row.EmployeeNameSnapshot || '-')}</p><p class="text-xs text-slate-500">${esc(row.LicenseNo || '-')} · เดิมหมดอายุ ${fmtDate(row.ExpireDate)}</p></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="text-xs font-bold text-slate-500">วันที่ออกบัตรใหม่<input name="NewIssueDate" type="date" required class="form-input w-full rounded-xl mt-1" value="${new Date().toISOString().slice(0, 10)}"></label>
            <label class="text-xs font-bold text-slate-500">วันหมดอายุใหม่<input name="NewExpireDate" type="date" required class="form-input w-full rounded-xl mt-1"></label>
            <label class="text-xs font-bold text-slate-500 md:col-span-2">Certificate No. ใหม่<input name="NewCertificateNo" class="form-input w-full rounded-xl mt-1" value="${esc(row.CertificateNo || '')}"></label>
        </div>
        <label class="text-xs font-bold text-slate-500">หมายเหตุการต่ออายุ<textarea name="RenewalNote" class="form-input w-full rounded-xl mt-1" rows="3"></textarea></label>
        <div class="flex justify-end gap-2"><button type="button" id="fl-renew-cancel" class="px-4 py-2 rounded-xl border text-sm font-bold">ยกเลิก</button><button class="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-black">บันทึกต่ออายุ</button></div>
    </form>`;
}

async function openRenew(id) {
    const row = (await API.get(`/forklift/licenses/${id}`)).data || {};
    UI.openModal('ต่ออายุใบอนุญาตรถยก', renewFormHtml(row), 'max-w-2xl');
    document.getElementById('fl-renew-cancel')?.addEventListener('click', UI.closeModal);
    document.getElementById('fl-renew-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        await runForkliftForm(event.target, event.submitter || event.target.querySelector('button:not([type="button"])'), 'กำลังต่ออายุ...', async () => {
            await API.post(`/forklift/licenses/${id}/renew`, Object.fromEntries(new FormData(event.target).entries()));
            invalidateForkliftCache('data');
            UI.closeModal();
            UI.showToast('ต่ออายุสำเร็จ', 'success');
            await render();
        }, 'ต่ออายุไม่สำเร็จ');
    });
}

function documentListHtml(docs = [], renewals = []) {
    return `<div class="space-y-5">
        <form id="fl-doc-form" class="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select name="DocumentType" class="form-input rounded-xl"><option value="certificate">Certificate อบรม</option><option value="renewal">เอกสารต่ออายุ</option><option value="photo">รูปพนักงาน</option><option value="other">อื่น ๆ</option></select>
                <input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" class="form-input rounded-xl md:col-span-2">
            </div>
            <div class="flex items-center justify-between gap-2"><p class="text-xs text-slate-500">รองรับ PDF/JPG/PNG/WebP สูงสุด 5 MB ต่อไฟล์</p><button class="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-black">อัปโหลด</button></div>
        </form>
        <section><h3 class="font-black text-slate-800 mb-2">เอกสาร</h3><div class="space-y-2">
            ${docs.length ? docs.map(doc => `<div class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div class="min-w-0"><p class="font-bold text-sm text-slate-800 truncate">${esc(doc.OriginalName || doc.StoredName || 'document')}</p><p class="text-xs text-slate-400">${esc(doc.DocumentType)} · ${fmtDate(doc.UploadedAt)} · ${Math.round((Number(doc.FileSize || 0) / 1024) || 0)} KB</p></div><div class="flex gap-2 shrink-0"><a href="${esc(doc.FileUrl)}" target="_blank" rel="noopener" class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">เปิดดู</a>${can('FORKLIFT_DOCUMENT_MANAGE') ? `<button class="fl-doc-delete px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold" data-id="${doc.ID}">ลบ</button>` : ''}</div></div>`).join('') : `<div class="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">ยังไม่มีเอกสาร</div>`}
        </div></section>
        <section><h3 class="font-black text-slate-800 mb-2">ประวัติการต่ออายุ</h3><div class="space-y-2">
            ${renewals.length ? renewals.map(r => `<div class="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-sm"><p class="font-bold text-slate-800">${fmtDate(r.OldExpireDate)} → ${fmtDate(r.NewExpireDate)}</p><p class="text-xs text-slate-500">โดย ${esc(r.OperatedBy || '-')} · ${fmtDate(r.OperatedAt)} ${r.RenewalNote ? `· ${esc(r.RenewalNote)}` : ''}</p></div>`).join('') : `<div class="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">ยังไม่มีประวัติต่ออายุ</div>`}
        </div></section>
    </div>`;
}

async function openDocs(id) {
    const [docsRes, renewRes] = await Promise.all([API.get(`/forklift/licenses/${id}/documents`), API.get(`/forklift/licenses/${id}/renewals`)]);
    UI.openModal('เอกสารและประวัติใบอนุญาตรถยก', documentListHtml(docsRes.data || [], renewRes.data || []), 'max-w-4xl');
    document.getElementById('fl-doc-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        await runForkliftForm(event.target, event.submitter || event.target.querySelector('button:not([type="button"])'), 'กำลังอัปโหลด...', async () => {
            await API.post(`/forklift/licenses/${id}/documents`, new FormData(event.target));
            UI.showToast('อัปโหลดเอกสารสำเร็จ', 'success');
            await openDocs(id);
        }, 'อัปโหลดไม่สำเร็จ');
    });
    document.querySelectorAll('.fl-doc-delete').forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('ลบเอกสารนี้?')) return;
        return runBusy(btn, 'กำลังลบ...', async () => { await API.delete(`/forklift/documents/${btn.dataset.id}`);UI.showToast('ลบเอกสารสำเร็จ', 'success');await openDocs(id); }, 'ลบเอกสารไม่สำเร็จ');
    }));
}

function templateVersion(tpl) {
    return tpl.CurrentVersion || (tpl.Versions || [])[0] || {};
}

function templateStatus(tpl) {
    if (tpl.ArchivedAt) return 'archived';
    const ver = templateVersion(tpl);
    return String(ver.Status || '').toLowerCase() === 'published' ? 'published' : 'draft';
}

function templateStatusBadge(tpl) {
    const status = templateStatus(tpl);
    const inactive = Number(tpl.IsActive) !== 1 && status !== 'archived';
    const styles = {
        published: 'bg-emerald-50 text-emerald-700',
        draft: 'bg-amber-50 text-amber-700',
        archived: 'bg-slate-100 text-slate-500',
    };
    return `<span class="px-2 py-1 rounded-lg text-xs font-black ${styles[status] || styles.draft}">${esc(inactive ? `${status} / inactive` : status)}</span>`;
}

function renderTemplateCard(tpl) {
    const ver = templateVersion(tpl);
    const status = templateStatus(tpl);
    const active = Number(tpl.IsActive) === 1;
    const used = Number(tpl.PrintLogCount || 0);
    return `<article class="rounded-2xl border ${status === 'archived' ? 'border-slate-200 bg-slate-50' : 'border-slate-100 bg-white'} p-4">
        <div class="flex items-start justify-between gap-3">
            <div><h3 class="font-black text-slate-800">${esc(tpl.TemplateName)}</h3><p class="text-xs text-slate-500">${esc(templateTypeLabel(tpl))} - v${esc(ver.VersionNo || '-')} - ${esc(ver.Status || 'draft')} - used ${used}</p></div>
            ${templateStatusBadge(tpl)}
        </div>
        <div class="mt-4 grid grid-cols-2 gap-3">
            ${['FrontImageUrl', 'BackImageUrl'].map((key, idx) => `<div class="rounded-xl border border-slate-100 bg-slate-50 p-2"><p class="text-[11px] font-black text-slate-500 mb-1">${idx ? 'Back' : 'Front'} - ${esc(cardSizeLabel(ver))}</p>${ver[key] ? `<img src="${esc(ver[key])}" loading="lazy" decoding="async" class="mx-auto max-h-72 w-auto max-w-full object-cover rounded-lg bg-white" style="${cardAspectStyle(ver)}">` : `<div class="mx-auto max-h-72 w-full max-w-[220px] rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 grid place-items-center text-xs text-slate-400" style="${cardAspectStyle(ver)}">No image</div>`}</div>`).join('')}
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
            ${status !== 'archived' ? `<button class="fl-template-edit px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-black" data-id="${tpl.ID}">Editor</button>
            <button class="fl-template-version px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-black" data-id="${tpl.ID}">New version</button>
            ${String(ver.Status).toLowerCase() !== 'published' ? `<button class="fl-template-publish px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black" data-version="${ver.ID}">Publish</button>` : ''}
            <button class="fl-template-active px-3 py-2 rounded-xl ${active ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'} text-xs font-black" data-id="${tpl.ID}" data-active="${active ? '0' : '1'}">${active ? 'Set inactive' : 'Set active'}</button>
            <button class="fl-template-archive px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-black" data-id="${tpl.ID}">Archive</button>` : `<button class="fl-template-restore px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-black" data-id="${tpl.ID}">Restore</button>`}
            ${used === 0 ? `<button class="fl-template-delete px-3 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-black" data-id="${tpl.ID}">Delete</button>` : (can('IS_ADMIN') ? `<button class="fl-template-force-delete px-3 py-2 rounded-xl bg-red-100 text-red-800 text-xs font-black" data-id="${tpl.ID}" data-used="${used}">Force delete</button>` : '')}
        </div>
    </article>`;
}

function renderTemplateGroup(title, help, items) {
    return `<div class="space-y-3">
        <div class="flex items-end justify-between gap-3">
            <div><h3 class="text-sm font-black text-slate-700">${esc(title)}</h3><p class="text-xs text-slate-500">${esc(help)}</p></div>
            <span class="text-xs font-black text-slate-400">${items.length}</span>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
            ${items.length ? items.map(renderTemplateCard).join('') : `<div class="xl:col-span-2 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400 text-sm">No templates</div>`}
        </div>
    </div>`;
}

function renderTemplatesLegacy() {
    if (!can('FORKLIFT_TEMPLATE_MANAGE')) return `<section class="ds-section p-6 text-center text-slate-500">ต้องมี permission FORKLIFT_TEMPLATE_MANAGE</section>`;
    return `<section class="ds-section p-4">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div><h2 class="font-black text-slate-800">Template บัตร</h2><p class="text-xs text-slate-500">Upload front/back, manage versions, place fields, signature and QR.</p></div>
            <button id="fl-template-add-2" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">+ เพิ่ม Template</button>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
            ${_templates.length ? _templates.map(tpl => {
                const ver = templateVersion(tpl);
                return `<article class="rounded-2xl border border-slate-100 bg-white p-4">
                    <div class="flex items-start justify-between gap-3">
                        <div><h3 class="font-black text-slate-800">${esc(tpl.TemplateName)}</h3><p class="text-xs text-slate-500">${esc(templateTypeLabel(tpl))} · v${esc(ver.VersionNo || '-')} · ${esc(ver.Status || 'draft')}</p></div>
                        <span class="px-2 py-1 rounded-lg text-xs font-black ${String(ver.Status).toLowerCase() === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">${esc(ver.Status || 'draft')}</span>
                    </div>
                    <div class="mt-4 grid grid-cols-2 gap-3">
                        ${['FrontImageUrl', 'BackImageUrl'].map((key, idx) => `<div class="rounded-xl border border-slate-100 bg-slate-50 p-2"><p class="text-[11px] font-black text-slate-500 mb-1">${idx ? 'Back' : 'Front'} - ${esc(cardSizeLabel(ver))}</p>${ver[key] ? `<img src="${esc(ver[key])}" loading="lazy" decoding="async" class="mx-auto max-h-72 w-auto max-w-full object-cover rounded-lg bg-white" style="${cardAspectStyle(ver)}">` : `<div class="mx-auto max-h-72 w-full max-w-[220px] rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 grid place-items-center text-xs text-slate-400" style="${cardAspectStyle(ver)}">No image</div>`}</div>`).join('')}
                    </div>
                    <div class="mt-4 flex flex-wrap gap-2">
                        <button class="fl-template-edit px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-black" data-id="${tpl.ID}">Editor</button>
                        <button class="fl-template-version px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-black" data-id="${tpl.ID}">New version</button>
                        ${String(ver.Status).toLowerCase() !== 'published' ? `<button class="fl-template-publish px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black" data-version="${ver.ID}">Publish</button>` : ''}
                    </div>
                </article>`;
            }).join('') : `<div class="xl:col-span-2 rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400">ยังไม่มี Template บัตร</div>`}
        </div>
    </section>`;
}

function renderTemplates() {
    if (!can('FORKLIFT_TEMPLATE_MANAGE')) return `<section class="ds-section p-6 text-center text-slate-500">Permission FORKLIFT_TEMPLATE_MANAGE is required.</section>`;
    const groups = {
        published: _templates.filter(tpl => templateStatus(tpl) === 'published'),
        draft: _templates.filter(tpl => templateStatus(tpl) === 'draft'),
        archived: _templates.filter(tpl => templateStatus(tpl) === 'archived'),
    };
    return `<section class="ds-section p-4">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div><h2 class="font-black text-slate-800">Template บัตร</h2><p class="text-xs text-slate-500">Upload front/back, manage versions, place fields, archive old templates, and protect printed history.</p></div>
            <button id="fl-template-add-2" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">+ เพิ่ม Template</button>
        </div>
        <div class="space-y-6">
            ${_templates.length ? [
                renderTemplateGroup('Published', 'Available for print/export when active.', groups.published),
                renderTemplateGroup('Draft', 'Editable templates or unpublished versions.', groups.draft),
                renderTemplateGroup('Archived', 'Hidden from card rendering. Restore before editing or publishing.', groups.archived),
            ].join('') : `<div class="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400">ยังไม่มี Template บัตร</div>`}
        </div>
    </section>`;
}

function templateFormHtml() {
    return `<form id="fl-template-form" class="space-y-4">
        <label class="text-xs font-bold text-slate-500">Template name<input name="TemplateName" required class="form-input w-full rounded-xl mt-1" placeholder="เช่น Forklift standard 2026"></label>
        <div><span class="text-xs font-bold text-slate-500">License type</span><div class="mt-1">${templateTypeCheckboxes()}</div></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="text-xs font-bold text-slate-500">Front image<input name="FrontImage" type="file" accept=".jpg,.jpeg,.png,.webp" class="form-input w-full rounded-xl mt-1"></label>
            <label class="text-xs font-bold text-slate-500">Back image<input name="BackImage" type="file" accept=".jpg,.jpeg,.png,.webp" class="form-input w-full rounded-xl mt-1"></label>
            <label class="text-xs font-bold text-slate-500">Width mm<input name="CardWidthMm" type="number" step="0.01" class="form-input w-full rounded-xl mt-1" value="60.00"></label>
            <label class="text-xs font-bold text-slate-500">Height mm<input name="CardHeightMm" type="number" step="0.01" class="form-input w-full rounded-xl mt-1" value="82.00"></label>
            <label class="text-xs font-bold text-slate-500">DPI<input name="Dpi" type="number" class="form-input w-full rounded-xl mt-1" value="300"></label>
        </div>
        <div class="flex justify-end gap-2"><button type="button" id="fl-template-cancel" class="px-4 py-2 rounded-xl border text-sm font-bold">ยกเลิก</button><button class="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">บันทึก Template</button></div>
    </form>`;
}

function versionFormHtml() {
    return `<form id="fl-version-form" class="space-y-4">
        <p class="text-sm text-slate-500">สร้าง draft version ใหม่ โดยคัดลอก field เดิมทั้งหมด และเปลี่ยนภาพหน้า/หลังได้ถ้าต้องการ</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="text-xs font-bold text-slate-500">New front image<input name="FrontImage" type="file" accept=".jpg,.jpeg,.png,.webp" class="form-input w-full rounded-xl mt-1"></label>
            <label class="text-xs font-bold text-slate-500">New back image<input name="BackImage" type="file" accept=".jpg,.jpeg,.png,.webp" class="form-input w-full rounded-xl mt-1"></label>
        </div>
        <div class="flex justify-end gap-2"><button type="button" id="fl-version-cancel" class="px-4 py-2 rounded-xl border text-sm font-bold">ยกเลิก</button><button class="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-black">สร้าง Version</button></div>
    </form>`;
}

async function openTemplateForm() {
    UI.openModal('เพิ่ม Template บัตร', templateFormHtml(), 'max-w-2xl');
    document.getElementById('fl-template-cancel')?.addEventListener('click', UI.closeModal);
    document.querySelectorAll('.fl-template-type-check').forEach(input => input.addEventListener('change', () => {
        const checked = [...document.querySelectorAll('.fl-template-type-check:checked')];
        if (checked.length > 2) {
            input.checked = false;
            UI.showToast('เลือก License type ได้สูงสุด 2 ประเภทต่อ Template', 'warning');
        }
    }));
    document.getElementById('fl-template-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const fd = new FormData(form);
        const typeIds = [...form.querySelectorAll('.fl-template-type-check:checked')].map(input => input.value);
        fd.set('TemplateName', form.elements.TemplateName?.value || '');
        fd.delete('LicenseTypeIDs');
        fd.delete('LicenseTypeIDs[]');
        fd.set('LicenseTypeIDs', typeIds.join('|'));
        fd.set('LicenseTypeID', typeIds[0] || '');
        await runForkliftForm(form, event.submitter || form.querySelector('button:not([type="button"])'), 'กำลังสร้าง...', async () => {
            await API.post('/forklift/templates', fd);
            UI.closeModal();
            UI.showToast('สร้าง Template สำเร็จ', 'success');
            await render();
        }, 'สร้าง Template ไม่สำเร็จ');
    });
}

async function openNewVersion(templateId) {
    UI.openModal('สร้าง Template Version ใหม่', versionFormHtml(), 'max-w-2xl');
    document.getElementById('fl-version-cancel')?.addEventListener('click', UI.closeModal);
    document.getElementById('fl-version-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        await runForkliftForm(event.target, event.submitter || event.target.querySelector('button:not([type="button"])'), 'กำลังสร้าง Version...', async () => {
            await API.post(`/forklift/templates/${templateId}/versions`, new FormData(event.target));
            UI.closeModal();
            UI.showToast('สร้าง Version สำเร็จ', 'success');
            await render();
        }, 'สร้าง Version ไม่สำเร็จ');
    });
}

function previewFieldHtml(field, index, side, readonly) {
    const cfg = field.FieldConfig || {};
    if (cfg.visible === false || (cfg.side || 'front') !== side) return '';
    const type = fieldType(field);
    const style = `left:${toNum(cfg.x, 5)}%;top:${toNum(cfg.y, 5)}%;width:${toNum(cfg.width, 20)}%;height:${toNum(cfg.height, 8)}%;font-size:${toNum(cfg.fontSize, 6) * 2}px;font-weight:${esc(cfg.fontWeight || '700')};color:${esc(cfg.color || cfg.fontColor || '#0f172a')};text-align:${esc(cfg.align || cfg.textAlign || 'left')};`;
    const label = cfg.text || cfg.label || fieldLabel(field.FieldKey);
    let body = `<span class="truncate">${esc(label)}</span>`;
    if (type === 'image') body = `<span class="w-full h-full rounded bg-slate-200 grid place-items-center">PHOTO</span>`;
    if (type === 'signature') body = `<span class="w-full h-full rounded border border-dashed border-slate-400 grid place-items-center">SIGN</span>`;
    if (type === 'qr') body = `<span class="w-full h-full rounded bg-white border border-slate-700 grid place-items-center font-black">QR</span>`;
    return `<button type="button" class="fl-field-box absolute rounded border-2 border-emerald-500/80 bg-white/70 shadow-sm text-[10px] font-bold overflow-hidden ${readonly ? 'cursor-not-allowed opacity-80' : 'cursor-move'}" style="${style}" data-index="${index}" ${readonly ? 'disabled' : ''}>${body}</button>`;
}

function previewPanel(version, fields, side, readonly) {
    const image = side === 'front' ? version.FrontImageUrl : version.BackImageUrl;
    return `<div>
        <p class="text-xs font-black text-slate-500 mb-1">${side === 'front' ? 'Front' : 'Back'} preview <span class="font-semibold text-slate-400">(${esc(cardSizeLabel(version))})</span></p>
        <div class="fl-card-preview relative mx-auto w-full max-w-[360px] rounded-2xl overflow-hidden border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-200" data-side="${side}" style="${cardAspectStyle(version)}${image ? `background-image:url('${esc(image)}');background-size:cover;background-position:center;` : ''}">
            ${fields.map((f, i) => previewFieldHtml(f, i, side, readonly)).join('')}
        </div>
    </div>`;
}

function fieldEditorRows(fields, readonly) {
    return fields.map((field, i) => {
        const cfg = field.FieldConfig || {};
        const type = fieldType(field);
        const assetControls = ['image', 'signature'].includes(type) ? `
            <div class="mt-2 grid grid-cols-2 gap-1 text-[10px] text-slate-500">
                <label>Fit<select class="fl-field-choice form-input rounded-md text-[11px] py-1" data-index="${i}" data-key="fit" ${readonly ? 'disabled' : ''}><option value="cover" ${(cfg.fit || cfg.photoFitMode || 'cover') === 'cover' ? 'selected' : ''}>cover</option><option value="contain" ${(cfg.fit || cfg.photoFitMode) === 'contain' ? 'selected' : ''}>contain</option></select></label>
                <label>Zoom<input class="fl-field-num form-input rounded-md text-[11px] py-1" data-index="${i}" data-key="objectScale" type="number" step="0.05" min="0.5" max="3" value="${esc(cfg.objectScale ?? 1)}" ${readonly ? 'disabled' : ''}></label>
                <label>X<input class="fl-field-num form-input rounded-md text-[11px] py-1" data-index="${i}" data-key="objectX" type="number" step="1" min="0" max="100" value="${esc(cfg.objectX ?? 50)}" ${readonly ? 'disabled' : ''}></label>
                <label>Y<input class="fl-field-num form-input rounded-md text-[11px] py-1" data-index="${i}" data-key="objectY" type="number" step="1" min="0" max="100" value="${esc(cfg.objectY ?? 50)}" ${readonly ? 'disabled' : ''}></label>
            </div>` : '';
        const textControls = ['text', 'static'].includes(type) ? `
            <div class="mt-2 grid grid-cols-3 gap-1 text-[10px] text-slate-500">
                <label>Align<select class="fl-field-choice form-input rounded-md text-[11px] py-1" data-index="${i}" data-key="align" ${readonly ? 'disabled' : ''}>
                    <option value="left" ${(cfg.align || cfg.textAlign || 'left') === 'left' ? 'selected' : ''}>Left</option>
                    <option value="center" ${(cfg.align || cfg.textAlign) === 'center' ? 'selected' : ''}>Center</option>
                    <option value="right" ${(cfg.align || cfg.textAlign) === 'right' ? 'selected' : ''}>Right</option>
                </select></label>
                <label>Color<input class="fl-field-choice form-input h-9 rounded-md p-1" data-index="${i}" data-key="color" type="color" value="${esc(cfg.color || cfg.fontColor || '#0f172a')}" ${readonly ? 'disabled' : ''}></label>
                <label>Weight<select class="fl-field-choice form-input rounded-md text-[11px] py-1" data-index="${i}" data-key="fontWeight" ${readonly ? 'disabled' : ''}>
                    <option value="400" ${String(cfg.fontWeight || '') === '400' ? 'selected' : ''}>Normal</option>
                    <option value="700" ${String(cfg.fontWeight || '700') === '700' ? 'selected' : ''}>Bold</option>
                    <option value="900" ${String(cfg.fontWeight || '') === '900' || String(cfg.fontWeight || '') === '800' ? 'selected' : ''}>Extra</option>
                </select></label>
            </div>` : '';
        return `<tr class="border-b border-slate-100">
            <td class="px-2 py-2"><label class="flex items-center gap-2 text-xs font-bold"><input type="checkbox" class="fl-field-visible" data-index="${i}" ${cfg.visible !== false ? 'checked' : ''} ${readonly ? 'disabled' : ''}>${esc(fieldLabel(field.FieldKey))}</label>${assetControls}${textControls}</td>
            <td class="px-2 py-2"><select class="fl-field-side form-input rounded-lg text-xs" data-index="${i}" ${readonly ? 'disabled' : ''}><option value="front" ${(cfg.side || 'front') === 'front' ? 'selected' : ''}>front</option><option value="back" ${(cfg.side || 'front') === 'back' ? 'selected' : ''}>back</option></select></td>
            ${['x', 'y', 'width', 'height', 'fontSize'].map(key => `<td class="px-1 py-2"><input class="fl-field-num form-input rounded-lg text-xs w-16" data-index="${i}" data-key="${key}" type="number" step="0.1" value="${esc(cfg[key] ?? (key === 'fontSize' ? 6 : 10))}" ${readonly ? 'disabled' : ''}></td>`).join('')}
        </tr>`;
    }).join('');
}

function editorHtml(template, version, fields) {
    const readonly = String(version.Status || '').toLowerCase() === 'published' && !can('IS_ADMIN');
    return `<div id="fl-template-editor" class="space-y-4" data-readonly="${readonly ? '1' : '0'}">
        ${readonly ? `<div class="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-3 text-sm font-bold">Version นี้ Published แล้ว แก้ไขไม่ได้ ให้สร้าง New version ก่อน</div>` : `<p class="text-sm text-slate-500">ลาก field บน preview เพื่อย้ายตำแหน่ง หรือแก้ตัวเลข X/Y/Width/Height ด้านล่าง</p>`}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">${previewPanel(version, fields, 'front', readonly)}${previewPanel(version, fields, 'back', readonly)}</div>
        <div class="overflow-x-auto rounded-2xl border border-slate-100">
            <table class="min-w-full text-sm">
                <thead class="bg-slate-50 text-xs text-slate-500"><tr><th class="px-2 py-2 text-left">Field</th><th class="px-2 py-2 text-left">Side</th><th>X%</th><th>Y%</th><th>W%</th><th>H%</th><th>Font</th></tr></thead>
                <tbody>${fieldEditorRows(fields, readonly)}</tbody>
            </table>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
            ${!readonly ? `<select id="fl-layout-preset" class="form-input min-w-[220px] rounded-xl text-sm"><option value="">เลือก Layout preset</option>${_layoutPresets.map(preset => `<option value="${esc(preset.ID)}">${esc(preset.PresetName)}</option>`).join('')}</select><button type="button" id="fl-preset-apply" class="px-4 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-black">ใช้ Preset</button><button type="button" id="fl-preset-save" class="px-4 py-2 rounded-xl bg-violet-50 text-violet-700 text-sm font-black">บันทึกเป็น Preset</button><button type="button" id="fl-preset-delete" class="px-3 py-2 rounded-xl bg-red-50 text-red-700 text-sm font-black" title="ลบ preset ที่เลือก">ลบ Preset</button>` : ''}
            <button type="button" id="fl-editor-close" class="px-4 py-2 rounded-xl border text-sm font-bold">ปิด</button>
            ${!readonly ? `<button type="button" id="fl-editor-save" class="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">บันทึกตำแหน่ง</button><button type="button" id="fl-editor-publish" class="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-black">Publish</button>` : ''}
        </div>
    </div>`;
}

function renderEditorPreview(template, version, fields) {
    const box = document.getElementById('fl-template-editor');
    if (!box) return;
    const readonly = box.dataset.readonly === '1';
    box.innerHTML = editorHtml(template, version, fields).replace(/^<div[^>]*>|<\/div>$/g, '');
    bindTemplateEditor(template, version, fields, readonly);
}

function bindTemplateEditor(template, version, fields, readonly) {
    document.getElementById('fl-editor-close')?.addEventListener('click', UI.closeModal);
    document.querySelectorAll('.fl-field-visible').forEach(input => input.addEventListener('change', () => {
        fields[Number(input.dataset.index)].FieldConfig.visible = input.checked;
        renderEditorPreview(template, version, fields);
    }));
    document.querySelectorAll('.fl-field-side').forEach(input => input.addEventListener('change', () => {
        fields[Number(input.dataset.index)].FieldConfig.side = input.value;
        renderEditorPreview(template, version, fields);
    }));
    document.querySelectorAll('.fl-field-choice').forEach(input => input.addEventListener('change', () => {
        fields[Number(input.dataset.index)].FieldConfig[input.dataset.key] = input.value;
        renderEditorPreview(template, version, fields);
    }));
    document.querySelectorAll('.fl-field-num').forEach(input => input.addEventListener('input', () => {
        fields[Number(input.dataset.index)].FieldConfig[input.dataset.key] = toNum(input.value, 0);
        renderEditorPreview(template, version, fields);
    }));
    if (!readonly) {
        document.getElementById('fl-preset-apply')?.addEventListener('click', () => {
            const id = document.getElementById('fl-layout-preset')?.value;
            const preset = _layoutPresets.find(item => String(item.ID) === String(id));
            if (!preset) return UI.showToast('กรุณาเลือก Layout preset', 'warning');
            const next = (preset.fields || []).map(field => ({ FieldKey: field.FieldKey, FieldConfig: { ...(field.FieldConfig || {}) } }));
            fields.splice(0, fields.length, ...next);
            renderEditorPreview(template, version, fields);
            UI.showToast(`นำ Layout "${preset.PresetName}" มาใช้แล้ว กดบันทึกตำแหน่งเพื่อยืนยัน`, 'success');
        });
        document.getElementById('fl-preset-save')?.addEventListener('click', async () => {
            const name = prompt('ชื่อ Layout preset')?.trim();
            if (!name) return;
            await API.post('/forklift/layout-presets', { PresetName: name, fields: fields.map(field => ({ FieldKey: field.FieldKey, FieldConfig: field.FieldConfig || {} })) });
            _layoutPresets = (await API.get('/forklift/layout-presets')).data || [];
            renderEditorPreview(template, version, fields);
            UI.showToast('บันทึก Layout preset สำเร็จ', 'success');
        });
        document.getElementById('fl-preset-delete')?.addEventListener('click', async () => {
            const id = document.getElementById('fl-layout-preset')?.value;
            const preset = _layoutPresets.find(item => String(item.ID) === String(id));
            if (!preset || !confirm(`ลบ Layout preset "${preset.PresetName}"?`)) return;
            await API.delete(`/forklift/layout-presets/${id}`);
            _layoutPresets = (await API.get('/forklift/layout-presets')).data || [];
            renderEditorPreview(template, version, fields);
        });
        let drag = null;
        document.querySelectorAll('.fl-field-box').forEach(el => {
            el.addEventListener('pointerdown', event => {
                const panel = el.closest('.fl-card-preview');
                drag = { index: Number(el.dataset.index), panel, dx: event.offsetX, dy: event.offsetY };
                el.setPointerCapture(event.pointerId);
            });
            el.addEventListener('pointermove', event => {
                if (!drag || drag.index !== Number(el.dataset.index)) return;
                const rect = drag.panel.getBoundingClientRect();
                const cfg = fields[drag.index].FieldConfig;
                cfg.x = Math.max(0, Math.min(100 - toNum(cfg.width, 20), ((event.clientX - rect.left - drag.dx) / rect.width) * 100));
                cfg.y = Math.max(0, Math.min(100 - toNum(cfg.height, 8), ((event.clientY - rect.top - drag.dy) / rect.height) * 100));
                el.style.left = `${cfg.x}%`;
                el.style.top = `${cfg.y}%`;
            });
            el.addEventListener('pointerup', () => { drag = null; renderEditorPreview(template, version, fields); });
            el.addEventListener('pointercancel', () => { drag = null; });
        });
        document.getElementById('fl-editor-save')?.addEventListener('click', async () => {
            await API.put(`/forklift/template-versions/${version.ID}/fields`, { fields: fields.map(f => ({ FieldKey: f.FieldKey, FieldConfig: f.FieldConfig || {} })) });
            UI.showToast('บันทึกตำแหน่ง field สำเร็จ', 'success');
            await render();
        });
        document.getElementById('fl-editor-publish')?.addEventListener('click', async () => {
            if (!confirm('Publish version นี้? หลัง publish แล้วจะแก้ field ตรง version นี้ไม่ได้')) return;
            await API.post(`/forklift/template-versions/${version.ID}/publish`, {});
            UI.closeModal();
            UI.showToast('Publish Template สำเร็จ', 'success');
            await render();
        });
    }
}

async function openTemplateEditor(templateId) {
    const [templateRes, presetRes] = await Promise.all([API.get(`/forklift/templates/${templateId}`), API.get('/forklift/layout-presets')]);
    const template = templateRes.data || {};
    _layoutPresets = presetRes.data || [];
    const version = templateVersion(template);
    const fields = (version.Fields || []).map(f => ({ FieldKey: f.FieldKey, FieldConfig: { ...(f.FieldConfig || {}) } }));
    UI.openModal(`Template Editor: ${template.TemplateName || ''} v${version.VersionNo || '-'}`, editorHtml(template, version, fields), 'max-w-6xl');
    bindTemplateEditor(template, version, fields, String(version.Status || '').toLowerCase() === 'published' && !can('IS_ADMIN'));
}

function qrPattern(value = '') {
    const text = String(value || '');
    try {
        if (typeof window.qrcode === 'function') {
            const qr = window.qrcode(0, 'M');
            qr.addData(text);
            qr.make();
            return qr.createSvgTag(3, 3)
                .replace('<svg ', '<svg class="w-full h-full bg-white" ')
                .replace(/fill="#000000"/g, 'fill="#111827"');
        }
    } catch (err) {
        console.warn('[forklift] QR generator fallback:', err?.message || err);
    }
    const src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=16&data=${encodeURIComponent(text)}`;
    return `<img src="${esc(src)}" class="w-full h-full object-contain bg-white" alt="Verification QR">`;
}

function assetUrl(url) {
    const raw = String(url || '').trim();
    if (!raw || ['0', 'false', 'null', 'undefined'].includes(raw.toLowerCase())) return '';
    try {
        const absolute = new URL(raw, window.location.origin);
        if (absolute.origin === window.location.origin) absolute.searchParams.set('flcb', FL_CARD_CACHE_BUST);
        return absolute.href;
    } catch {
        return raw;
    }
}

function imageWithFallback({ src, cls = 'w-full h-full', style = '', alt = '', fallback = '' }) {
    const safeSrc = assetUrl(src);
    if (!safeSrc) return fallback;
    const safeFallback = String(fallback || '').replace(/"/g, '&quot;').replace(/`/g, '&#96;');
    return `<img src="${esc(safeSrc)}" class="${esc(cls)}" style="${style}" alt="${esc(alt)}" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="this.outerHTML=\`${safeFallback}\`">`;
}

function cardFieldValue(payload, field) {
    const values = payload.values || {};
    const cfg = field.FieldConfig || {};
    return cfg.text || values[field.FieldKey] || cfg.label || fieldLabel(field.FieldKey);
}

function cardFieldHtml(payload, field, side) {
    const cfg = field.FieldConfig || {};
    if (cfg.visible === false || (cfg.side || 'front') !== side) return '';
    const type = fieldType(field);
    const style = [
        `left:${toNum(cfg.x, 5)}%`,
        `top:${toNum(cfg.y, 5)}%`,
        `width:${toNum(cfg.width, 20)}%`,
        `height:${toNum(cfg.height, 8)}%`,
        `font-size:${toNum(cfg.fontSize, 6) * 2}px`,
        `font-weight:${esc(cfg.fontWeight || '700')}`,
        `color:${esc(cfg.color || cfg.fontColor || '#0f172a')}`,
        `text-align:${esc(cfg.align || cfg.textAlign || 'left')}`,
        `line-height:${toNum(cfg.lineHeight, 1.2)}`,
        `z-index:${toNum(cfg.zIndex, 10)}`,
    ].join(';');
    const value = cardFieldValue(payload, field);
    if (type === 'qr' || field.FieldKey === 'qr_code') {
        return `<a href="${esc(payload.verification?.url || value)}" target="_blank" rel="noopener" class="absolute grid place-items-center p-1 bg-white rounded" style="${style}" title="${esc(payload.verification?.url || value)}"><span class="block h-full max-w-full aspect-square">${qrPattern(payload.verification?.url || value)}</span></a>`;
    }
    if (type === 'image' || field.FieldKey === 'employee_photo') {
        const name = payload.license?.EmployeeName || payload.license?.EmployeeNameSnapshot || payload.license?.EmployeeID || '';
        const fit = esc(cfg.fit || cfg.photoFitMode || 'cover');
        const objectStyle = `object-fit:${fit};object-position:${toNum(cfg.objectX, 50)}% ${toNum(cfg.objectY, 50)}%;transform:scale(${toNum(cfg.objectScale, 1)});`;
        const fallback = `<span class="grid h-full w-full place-items-center bg-gradient-to-br from-emerald-100 to-slate-100 text-slate-700 text-base">${esc(initials(name))}</span>`;
        return `<div class="absolute grid place-items-center text-[10px] font-black text-slate-500 overflow-hidden" style="${style}">
            ${imageWithFallback({ src: value, style: objectStyle, alt: name, fallback })}
        </div>`;
    }
    if (type === 'signature' || field.FieldKey === 'manager_signature') {
        const fit = esc(cfg.fit || 'contain');
        const objectStyle = `object-fit:${fit};object-position:${toNum(cfg.objectX, 50)}% ${toNum(cfg.objectY, 50)}%;transform:scale(${toNum(cfg.objectScale, 1)});`;
        const fallback = `<span class="w-full border-b-2 border-slate-700/70 pb-1 text-center text-[10px] font-bold text-slate-700">Authorized signature</span>`;
        return `<div class="absolute grid place-items-center overflow-hidden" style="${style}">
            ${imageWithFallback({ src: value, style: objectStyle, alt: 'Manager signature', fallback })}
        </div>`;
    }
    return `<div class="absolute overflow-hidden" style="${style}">${esc(value)}</div>`;
}

function cardSideHtml(payload, side) {
    const version = payload.version || {};
    const bg = assetUrl(side === 'front' ? version.FrontImageUrl : version.BackImageUrl);
    return `<div class="fl-render-card relative mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-side="${side}" data-card-width-mm="${esc(cardWidthMm(version))}" data-card-height-mm="${esc(cardHeightMm(version))}" style="${cardAspectStyle(version)}${bg ? `background-image:url('${esc(bg)}');background-size:cover;background-position:center;` : 'background:linear-gradient(135deg,#ecfdf5,#ffffff 55%,#ccfbf1);'}">
        ${(payload.fields || []).map(field => cardFieldHtml(payload, field, side)).join('')}
    </div>`;
}

function cardModalHtml(payload, logs = []) {
    const license = payload.license || {};
    const photoUrl = payload.values?.employee_photo || '';
    return `<div class="space-y-4">
        <div class="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <p class="text-xs font-black text-emerald-700 uppercase tracking-wide">Card Preview</p>
                    <h3 class="font-black text-slate-800">${esc(license.EmployeeName || license.EmployeeNameSnapshot || '-')}</h3>
                    <p class="text-xs text-slate-500">${esc(license.EmployeeID || '')} · ${esc(license.LicenseNo || '-')} · Exp ${fmtDate(license.ExpireDate)}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${can('FORKLIFT_EXPORT') ? `<button id="fl-card-export" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">Export PNG</button>` : ''}
                    ${can('FORKLIFT_PRINT') ? '<button id="fl-card-print" class="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-black">Print</button>' : ''}
                </div>
            </div>
            <a href="${esc(payload.verification?.url || '#')}" target="_blank" rel="noopener" class="mt-3 block text-xs text-emerald-700 break-all">Verify URL: ${esc(payload.verification?.url || '-')}</a>
        </div>
        <section class="rounded-2xl border border-slate-100 bg-white p-4">
            <div class="flex flex-col md:flex-row md:items-center gap-4">
                <div class="h-20 w-16 overflow-hidden rounded-xl border border-slate-200 grid place-items-center text-slate-500 font-black shrink-0" style="${transparentBgStyle}">
                    ${imageWithFallback({ src: photoUrl, cls: 'h-full w-full object-cover', alt: license.EmployeeName || license.EmployeeID || '', fallback: esc(initials(license.EmployeeName || license.EmployeeNameSnapshot || license.EmployeeID)) })}
                </div>
                <div class="min-w-0 flex-1">
                    <h4 class="font-black text-slate-800 text-sm">Employee photo</h4>
                    <p class="text-xs text-slate-500">ใช้รูปนี้ใน field employee_photo ของ Card Template</p>
                    ${photoUrl ? `<a href="${esc(photoUrl)}" target="_blank" rel="noopener" class="mt-1 block truncate text-xs text-emerald-700">${esc(photoUrl)}</a>` : `<p class="mt-1 text-xs text-amber-600">ยังไม่มีรูป ระบบจะแสดง initials แทน</p>`}
                </div>
                ${can('FORKLIFT_DOCUMENT_MANAGE') ? `<form id="fl-photo-form" class="flex flex-wrap items-center gap-2">
                    <input id="fl-photo-input" name="photo" type="file" accept=".jpg,.jpeg,.png,.webp" class="form-input rounded-xl max-w-[220px] text-xs">
                    <button type="button" id="fl-photo-bg-remove" class="px-3 py-2 rounded-xl bg-sky-50 text-sky-700 text-xs font-black">Remove background</button>
                    <button class="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black">Upload</button>
                    ${photoUrl ? `<button type="button" id="fl-photo-delete" class="px-3 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-black">Remove</button>` : ''}
                    <div id="fl-photo-bg-preview" class="hidden basis-full rounded-xl border border-sky-100 bg-sky-50/50 p-3">
                        <div class="flex flex-wrap items-center gap-3">
                            <figure class="text-center">
                                <div class="h-24 w-20 overflow-hidden rounded-lg border border-slate-200 bg-white"><img id="fl-photo-bg-original" class="h-full w-full object-contain" alt="Original photo"></div>
                                <figcaption class="mt-1 text-[10px] font-bold text-slate-500">Original</figcaption>
                            </figure>
                            <figure class="text-center">
                                <div class="h-24 w-20 overflow-hidden rounded-lg border border-slate-200" style="${transparentBgStyle}"><img id="fl-photo-bg-img" class="h-full w-full object-contain" alt="Transparent preview"></div>
                                <figcaption class="mt-1 text-[10px] font-bold text-sky-700">Processed</figcaption>
                            </figure>
                            <div>
                                <p id="fl-photo-bg-method" class="text-xs font-black text-sky-700"></p>
                                <p class="mt-1 text-xs font-bold text-slate-500">Check hair, clothing, and PPE edges before Upload.</p>
                            </div>
                        </div>
                    </div>
                </form>` : ''}
            </div>
        </section>
        <div id="fl-card-print-area" class="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-white p-2 rounded-2xl">${cardSideHtml(payload, 'front')}${cardSideHtml(payload, 'back')}</div>
        <section class="rounded-2xl border border-slate-100 p-4">
            <h4 class="font-black text-slate-800 text-sm">Print / Export log</h4>
            <div class="mt-2 space-y-2 max-h-40 overflow-auto text-xs">
                ${logs.length ? logs.map(log => `<div class="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><span class="font-bold">${esc(log.Action)}</span><span>${esc(log.PrintedBy || '-')} · ${fmtDate(log.PrintedAt)}</span></div>`).join('') : `<p class="text-slate-400">ยังไม่มีประวัติการพิมพ์/ส่งออก</p>`}
            </div>
        </section>
    </div>`;
}

async function logCardAction(licenseId, payload, action, meta = {}) {
    await API.post(`/forklift/licenses/${licenseId}/print-log`, {
        Action: action,
        TemplateVersionID: payload.version?.ID || null,
        Snapshot: {
            LicenseID: payload.license?.ID,
            LicenseNo: payload.license?.LicenseNo,
            CardNo: payload.license?.CardNo,
            EmployeeID: payload.license?.EmployeeID,
            TemplateVersionID: payload.version?.ID,
            VerificationToken: payload.verification?.token,
        },
        RenderMetadata: meta,
    });
}

async function openCard(id) {
    const [cardRes, logsRes] = await Promise.all([
        API.get(`/forklift/licenses/${id}/card`),
        API.get(`/forklift/licenses/${id}/print-logs`).catch(() => ({ data: [] })),
    ]);
    const payload = cardRes.data || {};
    UI.openModal('Preview / Print บัตรรถยก', cardModalHtml(payload, logsRes.data || []), 'max-w-6xl');
    await logCardAction(id, payload, 'PREVIEW', { source: 'card-modal' }).catch(() => {});
    const photoInput = document.getElementById('fl-photo-input');
    photoInput?.addEventListener('change', () => {
        photoInput._transparentFile = null;
        for (const id of ['fl-photo-bg-original', 'fl-photo-bg-img']) {
            const image = document.getElementById(id);
            if (image?.dataset.url) URL.revokeObjectURL(image.dataset.url);
            if (image) { image.removeAttribute('src'); delete image.dataset.url; }
        }
        document.getElementById('fl-photo-bg-preview')?.classList.add('hidden');
    });
    document.getElementById('fl-photo-bg-remove')?.addEventListener('click', event => {
        const btn = event.currentTarget;
        const file = photoInput?.files?.[0];
        if (!file) return UI.showToast('กรุณาเลือกรูปก่อนลบพื้นหลัง', 'warning');
        return runForkliftAction(btn, 'Processing...', async () => {
            const transparentFile = await removePhotoBackground(file);
            photoInput._transparentFile = transparentFile;
            const preview = document.getElementById('fl-photo-bg-preview');
            const img = document.getElementById('fl-photo-bg-img');
            const original = document.getElementById('fl-photo-bg-original');
            if (original) {
                if (original.dataset.url) URL.revokeObjectURL(original.dataset.url);
                original.dataset.url = URL.createObjectURL(file);
                original.src = original.dataset.url;
            }
            if (img) {
                if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
                img.dataset.url = URL.createObjectURL(transparentFile);
                img.src = img.dataset.url;
            }
            const method = transparentFile._backgroundRemovalMethod === 'ai' ? 'AI person segmentation' : 'Color fallback';
            const methodEl = document.getElementById('fl-photo-bg-method');
            if (methodEl) methodEl.textContent = method;
            preview?.classList.remove('hidden');
            UI.showToast(`ลบพื้นหลังด้วย ${method} แล้ว กด Upload เพื่อบันทึก PNG โปร่งใส`, 'success');
        }, 'ลบพื้นหลังไม่สำเร็จ');
    });
    document.getElementById('fl-photo-form')?.addEventListener('submit', event => {
        event.preventDefault();
        const file = event.target.photo?.files?.[0];
        if (!file) return UI.showToast('กรุณาเลือกรูปพนักงาน', 'error');
        const fd = new FormData();
        fd.append('photo', event.target.photo?._transparentFile || file);
        return runForkliftForm(event.target, event.submitter, 'กำลังอัปโหลด...', async () => {
            await API.post(`/forklift/employees/${encodeURIComponent(payload.license?.EmployeeID || '')}/photo`, fd);
            UI.showToast('อัปโหลดรูปพนักงานสำเร็จ', 'success');
            await openCard(id);
        }, 'อัปโหลดรูปไม่สำเร็จ');
    });
    document.getElementById('fl-photo-delete')?.addEventListener('click', event => {
        if (!confirm('Remove employee photo from forklift card identity?')) return;
        return runForkliftAction(event.currentTarget, 'Removing...', async () => {
            await API.delete(`/forklift/employees/${encodeURIComponent(payload.license?.EmployeeID || '')}/photo`);
            UI.showToast('ลบรูปพนักงานสำเร็จ', 'success');
            await openCard(id);
        }, 'Remove photo failed.');
    });
    document.getElementById('fl-card-export')?.addEventListener('click', async () => {
        if (typeof window.html2canvas !== 'function') return UI.showToast('ไม่พบ html2canvas กรุณาโหลดหน้าใหม่', 'error');
        const area = document.getElementById('fl-card-print-area');
        const canvas = await window.html2canvas(area, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
        const a = document.createElement('a');
        a.download = `forklift-card-${payload.license?.LicenseNo || id}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        await logCardAction(id, payload, 'EXPORT_PNG', { width: canvas.width, height: canvas.height });
        UI.showToast('Export PNG สำเร็จ', 'success');
    });
    document.getElementById('fl-card-print')?.addEventListener('click', async () => {
        const area = document.getElementById('fl-card-print-area');
        if (!area) return UI.showToast('ไม่พบพื้นที่บัตรสำหรับพิมพ์', 'error');
        const version = payload.version || {};
        const width = cardWidthMm(version);
        const height = cardHeightMm(version);
        const style = document.createElement('style');
        style.id = 'fl-print-style';
        style.textContent = `@page{size:A4;margin:12mm}@media print{body *{visibility:hidden!important}#fl-card-print-area,#fl-card-print-area *{visibility:visible!important}#fl-card-print-area{position:fixed!important;inset:0 auto auto 0!important;width:auto!important;padding:0!important;display:grid!important;grid-template-columns:repeat(2,${width}mm)!important;gap:12mm!important;background:#fff!important}.fl-render-card{width:${width}mm!important;height:${height}mm!important;max-width:none!important;border-radius:4mm!important;box-shadow:none!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}`;
        document.getElementById('fl-print-style')?.remove();
        document.head.appendChild(style);
        const images = [...area.querySelectorAll('img')];
        await Promise.all(images.map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
        })));
        const cleanup = () => style.remove();
        window.addEventListener('afterprint', cleanup, { once: true });
        window.print();
        setTimeout(cleanup, 3000);
        await logCardAction(id, payload, 'PRINT', { target: 'browser-window' });
    });
}

function reportMetric(label, value, sub, tone = 'slate') {
    const colors = {
        emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
        amber: 'border-amber-100 bg-amber-50 text-amber-700',
        red: 'border-red-100 bg-red-50 text-red-700',
        slate: 'border-slate-100 bg-slate-50 text-slate-700',
    }[tone] || 'border-slate-100 bg-slate-50 text-slate-700';
    return `<div class="rounded-2xl border ${colors} p-4"><p class="text-xs font-black opacity-75">${esc(label)}</p><p class="mt-1 text-2xl font-black">${esc(value)}</p><p class="text-[11px] opacity-70">${esc(sub || '')}</p></div>`;
}

function csvCell(value) {
    const s = String(value ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportReportCsv() {
    const rows = _reportData?.rows || [];
    if (!rows.length) return UI.showToast('ไม่มีข้อมูลสำหรับ export', 'warning');
    const header = ['EmployeeID', 'EmployeeName', 'Department', 'Unit', 'Position', 'Type', 'LicenseNo', 'CardNo', 'IssueDate', 'ExpireDate', 'CertificateNo', 'Status'];
    const lines = rows.map(row => [
        row.EmployeeID,
        row.EmployeeName || row.EmployeeNameSnapshot,
        row.Department || row.DepartmentSnapshot,
        row.Unit || row.UnitSnapshot,
        row.Position || row.PositionSnapshot,
        licenseTypeLabel(row),
        row.LicenseNo,
        row.CardNo,
        fmtDate(row.IssueDate),
        fmtDate(row.ExpireDate),
        row.CertificateNo,
        row.EffectiveStatus,
    ].map(csvCell).join(','));
    const blob = new Blob(['\ufeff' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `forklift-license-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    UI.showToast('Export CSV สำเร็จ', 'success');
}

function reportGroupStats(rows, keyFn) {
    const map = new Map();
    rows.forEach(row => {
        const key = (keyFn(row) || 'ไม่ระบุ').trim() || 'ไม่ระบุ';
        const item = map.get(key) || { name: key, total: 0, active: 0, expiring: 0, expired: 0, missingCert: 0 };
        item.total += 1;
        if (row.EffectiveStatus === 'ACTIVE') item.active += 1;
        if (row.EffectiveStatus === 'EXPIRING_SOON') item.expiring += 1;
        if (row.EffectiveStatus === 'EXPIRED') item.expired += 1;
        if (!String(row.CertificateNo || '').trim()) item.missingCert += 1;
        map.set(key, item);
    });
    return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 8);
}

function renderRankingBars(title, rows) {
    const max = Math.max(1, ...rows.map(row => row.total));
    return `<section class="ds-section p-4">
        <div class="flex items-center justify-between gap-3">
            <h3 class="font-black text-slate-800">${esc(title)}</h3>
            <span class="text-xs text-slate-400">Active / Total</span>
        </div>
        <div class="mt-4 space-y-3">
            ${rows.length ? rows.map(row => {
                const pct = Math.round((row.total / max) * 100);
                const activePct = row.total ? Math.round((row.active / row.total) * 100) : 0;
                return `<div>
                    <div class="mb-1 flex items-center justify-between gap-3 text-xs">
                        <span class="font-bold text-slate-700 truncate">${esc(row.name)}</span>
                        <span class="font-black text-slate-500">${row.active}/${row.total}</span>
                    </div>
                    <div class="h-7 overflow-hidden rounded-lg bg-slate-100">
                        <div class="flex h-full items-center justify-end rounded-lg bg-gradient-to-r from-emerald-400 to-teal-400 px-2 text-[11px] font-black text-white" style="width:${pct}%">${activePct}%</div>
                    </div>
                    <p class="mt-1 text-[11px] text-slate-400">Expiring ${row.expiring} · Expired ${row.expired} · Missing cert ${row.missingCert}</p>
                </div>`;
            }).join('') : `<div class="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</div>`}
        </div>
    </section>`;
}

function renderReportRankings(rows) {
    const byDept = reportGroupStats(rows, row => row.Department || row.DepartmentSnapshot);
    const byUnit = reportGroupStats(rows, row => row.Unit || row.UnitSnapshot);
    return `<div class="grid grid-cols-1 xl:grid-cols-2 gap-4">${renderRankingBars('Department License Coverage', byDept)}${renderRankingBars('Unit License Coverage', byUnit)}</div>`;
}

async function exportReportPdf() {
    const target = document.getElementById('fl-report-print-area');
    if (!target) return UI.showToast('ไม่พบพื้นที่รายงานสำหรับ PDF', 'error');
    if (typeof window.html2canvas !== 'function' || !window.jspdf?.jsPDF) return UI.showToast('ไม่พบ PDF library กรุณาโหลดหน้าใหม่', 'error');
    try {
        UI.showLoading('กำลังสร้าง PDF...');
        const canvas = await window.html2canvas(target, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
        const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 8;
        const imgW = pageW - (margin * 2);
        const imgH = canvas.height * imgW / canvas.width;
        let y = margin;
        let remaining = imgH;
        const img = canvas.toDataURL('image/png');
        pdf.addImage(img, 'PNG', margin, y, imgW, imgH);
        remaining -= (pageH - margin * 2);
        while (remaining > 0) {
            pdf.addPage();
            y = margin - (imgH - remaining);
            pdf.addImage(img, 'PNG', margin, y, imgW, imgH);
            remaining -= (pageH - margin * 2);
        }
        pdf.save(`forklift-license-report-${new Date().toISOString().slice(0, 10)}.pdf`);
        UI.showToast('Export PDF สำเร็จ', 'success');
    } catch (err) {
        UI.showToast(err?.message || 'Export PDF ไม่สำเร็จ', 'error');
    } finally {
        UI.hideLoading?.();
    }
}

function normalizeImportDate(value) {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
        const parsed = window.XLSX.SSF.parse_date_code(value);
        if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    const text = String(value).trim();
    const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    const th = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (th) return `${th[3]}-${th[2].padStart(2, '0')}-${th[1].padStart(2, '0')}`;
    return '';
}

function normalizeImportKey(key) {
    return String(key || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function importValue(row, keys) {
    const lookup = {};
    Object.keys(row || {}).forEach(key => { lookup[normalizeImportKey(key)] = row[key]; });
    for (const key of keys) {
        const value = lookup[normalizeImportKey(key)];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
}

function resolveImportType(value) {
    const raw = String(value || '').trim();
    if (!raw) return _types[0]?.ID || '';
    const found = _types.find(type => String(type.ID) === raw || [type.Code, type.NameTH, type.NameEN].some(v => String(v || '').trim().toLowerCase() === raw.toLowerCase()));
    return found?.ID || raw;
}

function normalizeImportRow(row, index) {
    const EmployeeID = String(importValue(row, ['EmployeeID', 'Employee ID', 'รหัสพนักงาน']) || '').trim();
    const LicenseTypeID = resolveImportType(importValue(row, ['LicenseTypeID', 'LicenseType', 'Type', 'ประเภท']));
    const IssueDate = normalizeImportDate(importValue(row, ['IssueDate', 'Issue Date', 'วันที่ออกบัตร']));
    const ExpireDate = normalizeImportDate(importValue(row, ['ExpireDate', 'Expire Date', 'วันหมดอายุ']));
    const item = {
        rowNo: index + 2,
        EmployeeID,
        LicenseTypeID,
        IssueDate,
        ExpireDate,
        CertificateNo: String(importValue(row, ['CertificateNo', 'Certificate No', 'Certificate']) || '').trim(),
        LicenseNo: String(importValue(row, ['LicenseNo', 'License No']) || '').trim(),
        CardNo: String(importValue(row, ['CardNo', 'Card No']) || '').trim(),
        Note: String(importValue(row, ['Note', 'หมายเหตุ']) || '').trim(),
    };
    item.errors = [];
    if (!item.EmployeeID) item.errors.push('EmployeeID');
    if (!item.LicenseTypeID) item.errors.push('LicenseType');
    if (!item.IssueDate) item.errors.push('IssueDate');
    if (!item.ExpireDate) item.errors.push('ExpireDate');
    return item;
}

async function parseImportFile(file) {
    if (!window.XLSX) throw new Error('ไม่พบ SheetJS library');
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return rows.map(normalizeImportRow).filter(row => row.EmployeeID || row.CertificateNo || row.LicenseNo || row.CardNo);
}

function openBulkImportReview(rows) {
    _bulkImportRows = rows;
    const valid = rows.filter(row => !row.errors.length);
    UI.openModal('Import ใบอนุญาตรถยก', `
        <div class="space-y-4">
            <div class="grid grid-cols-3 gap-3">
                ${reportMetric('Rows', rows.length, 'from file', 'slate')}
                ${reportMetric('Ready', valid.length, 'can import', 'emerald')}
                ${reportMetric('Need fix', rows.length - valid.length, 'missing fields', rows.length === valid.length ? 'slate' : 'amber')}
            </div>
            <div class="max-h-80 overflow-auto rounded-xl border border-slate-100">
                <table class="min-w-full text-xs">
                    <thead class="sticky top-0 bg-slate-50 text-slate-500"><tr><th class="px-3 py-2 text-left">Row</th><th class="px-3 py-2 text-left">Employee</th><th class="px-3 py-2 text-left">Type</th><th class="px-3 py-2 text-left">Issue</th><th class="px-3 py-2 text-left">Expire</th><th class="px-3 py-2 text-left">Status</th></tr></thead>
                    <tbody class="divide-y divide-slate-100">${rows.map(row => `<tr><td class="px-3 py-2">${row.rowNo}</td><td class="px-3 py-2 font-bold">${esc(row.EmployeeID || '-')}</td><td class="px-3 py-2">${esc(row.LicenseTypeID || '-')}</td><td class="px-3 py-2">${esc(row.IssueDate || '-')}</td><td class="px-3 py-2">${esc(row.ExpireDate || '-')}</td><td class="px-3 py-2">${row.errors.length ? `<span class="text-amber-700 font-bold">${esc(row.errors.join(', '))}</span>` : '<span class="text-emerald-700 font-bold">Ready</span>'}</td></tr>`).join('')}</tbody>
                </table>
            </div>
            <div class="flex justify-end gap-2">
                <button type="button" id="fl-import-cancel" class="px-4 py-2 rounded-xl border text-sm font-bold">ยกเลิก</button>
                <button type="button" id="fl-import-run" class="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black" ${valid.length ? '' : 'disabled'}>Import ${valid.length} rows</button>
            </div>
        </div>`, 'max-w-5xl');
    document.getElementById('fl-import-cancel')?.addEventListener('click', UI.closeModal);
    document.getElementById('fl-import-run')?.addEventListener('click', runBulkImport);
}

async function runBulkImport() {
    const rows = _bulkImportRows.filter(row => !row.errors.length);
    if (!rows.length) return;
    const result = { success: 0, failed: [] };
    UI.showLoading('กำลัง import ใบอนุญาต...');
    try {
        for (const row of rows) {
            try {
                await API.post('/forklift/licenses', {
                    EmployeeID: row.EmployeeID,
                    LicenseTypeID: row.LicenseTypeID,
                    IssueDate: row.IssueDate,
                    ExpireDate: row.ExpireDate,
                    CertificateNo: row.CertificateNo,
                    LicenseNo: row.LicenseNo,
                    CardNo: row.CardNo,
                    Note: row.Note || 'Bulk import',
                });
                result.success += 1;
            } catch (err) {
                result.failed.push({ row: row.rowNo, EmployeeID: row.EmployeeID, message: err?.message || String(err) });
            }
        }
    } finally {
        UI.hideLoading?.();
    }
    UI.closeModal();
    UI.showToast(`Import สำเร็จ ${result.success} รายการ${result.failed.length ? `, ไม่สำเร็จ ${result.failed.length}` : ''}`, result.failed.length ? 'warning' : 'success');
    invalidateForkliftCache('data');
    await render();
    if (result.failed.length) {
        UI.openModal('Import ไม่สำเร็จบางรายการ', `<div class="space-y-2">${result.failed.map(row => `<div class="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">Row ${row.row} · ${esc(row.EmployeeID)} · ${esc(row.message)}</div>`).join('')}</div>`, 'max-w-3xl');
    }
}

function currentBulkIds() {
    return [..._bulkSelected].map(Number).filter(Boolean);
}

function reminderKeysForSelected() {
    const selected = new Set([..._bulkSelected].map(String));
    return (_reminderData?.rows || [])
        .filter(row => row.readiness === 'ready' && selected.has(String(row.license?.ID)))
        .map(row => row.key);
}

function runBulkStatus(action, button) {
    const ids = currentBulkIds();
    if (!ids.length) return UI.showToast('กรุณาเลือกรายการก่อน', 'warning');
    const reason = action === 'SUSPEND' ? (prompt('เหตุผลการระงับสิทธิ์แบบกลุ่ม') || '') : '';
    if (action === 'ARCHIVE' && !confirm(`Archive ${ids.length} license(s)?`)) return;
    return runForkliftAction(button, 'กำลังดำเนินการ...', async () => {
        const res = await API.post('/forklift/licenses/bulk-status', { ids, action, reason });
        UI.showToast(`${action} สำเร็จ ${res.data?.success || 0} รายการ${res.data?.failed ? `, failed ${res.data.failed}` : ''}`, res.data?.failed ? 'warning' : 'success');
        _bulkSelected.clear();
        invalidateForkliftCache('data');
        await render();
    }, 'Bulk operation ไม่สำเร็จ');
}

function downloadImportTemplate() {
    const header = ['EmployeeID', 'LicenseType', 'IssueDate', 'ExpireDate', 'CertificateNo', 'LicenseNo', 'CardNo', 'Note'];
    const sampleType = _types[0]?.Code || 'FORKLIFT';
    const sample = ['000000', sampleType, new Date().toISOString().slice(0, 10), new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10), 'CERT-001', '', '', ''];
    const blob = new Blob(['\ufeff' + [header.join(','), sample.map(csvCell).join(',')].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'forklift-license-import-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}

function renderSettingsPanel() {
    if (!can('FORKLIFT_SETTINGS_MANAGE')) return '';
    const s = _settings || {};
    return `<section class="ds-section p-4">
        <h3 class="font-black text-slate-800">Settings</h3>
        <form id="fl-settings-form" class="mt-3 grid grid-cols-1 md:grid-cols-6 gap-3">
            <label class="text-xs font-bold text-slate-500">Warn primary days<input name="expiry_warn_days_primary" type="number" min="1" max="365" class="form-input w-full rounded-xl mt-1" value="${esc(s.expiry_warn_days_primary || 60)}"></label>
            <label class="text-xs font-bold text-slate-500">Warn secondary<input name="expiry_warn_days_secondary" type="number" min="1" max="365" class="form-input w-full rounded-xl mt-1" value="${esc(s.expiry_warn_days_secondary || 30)}"></label>
            <label class="text-xs font-bold text-slate-500">Urgent days<input name="expiry_warn_days_urgent" type="number" min="0" max="90" class="form-input w-full rounded-xl mt-1" value="${esc(s.expiry_warn_days_urgent || 7)}"></label>
            <label class="text-xs font-bold text-slate-500">Validity months<input name="default_validity_months" type="number" min="1" max="120" class="form-input w-full rounded-xl mt-1" value="${esc(s.default_validity_months || 12)}"></label>
            <label class="text-xs font-bold text-slate-500">Upload MB<input name="document_max_upload_mb" type="number" min="1" max="20" class="form-input w-full rounded-xl mt-1" value="${esc(s.document_max_upload_mb || 5)}"></label>
            <label class="text-xs font-bold text-slate-500">Request SLA days<input name="request_sla_days" type="number" min="1" max="30" class="form-input w-full rounded-xl mt-1" value="${esc(s.request_sla_days || 3)}"></label>
            <label class="md:col-span-6 flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-sm font-bold text-slate-700">
                <input type="hidden" name="approval_queue_enabled" value="0">
                <input name="approval_queue_enabled" value="1" type="checkbox" class="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600" ${approvalQueueEnabled() ? 'checked' : ''}>
                <span><span class="block font-black text-slate-800">แสดง tab คำขออนุมัติ</span><span class="block text-xs font-semibold text-slate-500">ปิดเมื่อหน่วยงานออกใบอนุญาตโดยตรงและไม่ใช้ approval workflow</span></span>
            </label>
            <div class="md:col-span-6 flex justify-end"><button class="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-black">Save settings</button></div>
        </form>
        <div class="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
            <div class="flex flex-col md:flex-row md:items-center gap-3">
                <div class="h-16 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white grid place-items-center shrink-0">
                    ${s.manager_signature_url ? `<img src="${esc(s.manager_signature_url)}" class="h-full w-full object-contain" alt="Manager signature">` : `<span class="text-xs font-bold text-slate-400">No signature</span>`}
                </div>
                <div class="min-w-0 flex-1">
                    <h4 class="text-sm font-black text-slate-800">Manager signature</h4>
                    <p class="text-xs text-slate-500">Global signature used by every manager_signature field. Recommended transparent PNG: 900 x 420 px (minimum 600 x 280 px), about 2.1:1 ratio.</p>
                    ${s.manager_signature_url ? `<a href="${esc(s.manager_signature_url)}" target="_blank" rel="noopener" class="mt-1 block truncate text-xs text-emerald-700">${esc(s.manager_signature_url)}</a>` : ''}
                </div>
                <form id="fl-signature-form" class="flex flex-wrap items-center gap-2">
                    <input name="signature" type="file" accept=".jpg,.jpeg,.png,.webp" class="form-input rounded-xl max-w-[220px] text-xs">
                    <button class="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black">Upload</button>
                    ${s.manager_signature_url ? `<button type="button" id="fl-signature-delete" class="px-3 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-black">Remove</button>` : ''}
                </form>
            </div>
        </div>
    </section>`;
}

function renderAuditPanel() {
    if (!can('FORKLIFT_AUDIT_VIEW')) return '';
    return `<section class="ds-section p-4">
        <div class="flex items-center justify-between gap-3"><h3 class="font-black text-slate-800">Audit ล่าสุด</h3><span class="text-xs text-slate-400">${_auditRows.length} rows</span></div>
        <div class="mt-3 overflow-x-auto">
            <table class="min-w-full text-xs">
                <thead class="bg-slate-50 text-slate-500"><tr><th class="px-3 py-2 text-left">Time</th><th class="px-3 py-2 text-left">Action</th><th class="px-3 py-2 text-left">User</th><th class="px-3 py-2 text-left">Target</th></tr></thead>
                <tbody class="divide-y divide-slate-100">
                    ${_auditRows.length ? _auditRows.map(row => `<tr><td class="px-3 py-2">${esc(String(row.ActionTime || '').slice(0, 19).replace('T', ' '))}</td><td class="px-3 py-2 font-bold">${esc(row.Action)}</td><td class="px-3 py-2">${esc(row.AdminName || row.AdminID || '-')}</td><td class="px-3 py-2">${esc(row.TargetType || '-')} #${esc(row.TargetID || '-')}</td></tr>`).join('') : `<tr><td colspan="4" class="px-3 py-6 text-center text-slate-400">ยังไม่มี audit</td></tr>`}
                </tbody>
            </table>
        </div>
    </section>`;
}

function emailStatusBadge(status) {
    const map = {
        Sent: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        Queued: 'bg-amber-50 text-amber-700 border-amber-100',
        Failed: 'bg-red-50 text-red-700 border-red-100',
    };
    return `<span class="inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black ${map[status] || 'bg-slate-50 text-slate-600 border-slate-100'}">${esc(status || '-')}</span>`;
}

function renderReminderPanel() {
    if (!can('FORKLIFT_EXPORT')) return '';
    const rows = _reminderData?.rows || [];
    const readyRows = rows.filter(row => row.readiness === 'ready');
    return `<section class="ds-section p-4">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div><h3 class="font-black text-slate-800">Expiry Reminder Queue</h3><p class="text-xs text-slate-500">Ready ${readyRows.length} · Sent today ${_reminderData?.sentToday || 0} · Missing email ${_reminderData?.missingEmail || 0} · SMTP ${_reminderData?.smtpConfigured ? 'configured' : 'not configured'}</p></div>
            ${can('FORKLIFT_SETTINGS_MANAGE') ? `<button id="fl-reminder-send-ready" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black ${readyRows.length ? '' : 'opacity-50'}" ${readyRows.length ? '' : 'disabled'}>Queue ready reminders</button>` : ''}
        </div>
        <div class="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2 max-h-72 overflow-auto">
            ${rows.length ? rows.map(row => {
                const lic = row.license || {};
                return `<div class="rounded-xl border border-slate-100 p-3">
                    <div class="flex items-start justify-between gap-2">
                        <div><p class="font-black text-sm text-slate-800">${esc(lic.EmployeeName || lic.EmployeeNameSnapshot || '-')}</p><p class="text-xs text-slate-400">${esc(lic.EmployeeID)} · ${esc(lic.LicenseNo || '-')} · Exp ${fmtDate(lic.ExpireDate)}</p></div>
                        <span class="text-[11px] font-black ${row.readiness === 'ready' ? 'text-emerald-700' : 'text-amber-700'}">${esc(row.readiness)}</span>
                    </div>
                    <p class="mt-2 text-xs text-slate-500 break-all">${row.readiness === 'ready' ? esc(row.recipients?.join(', ') || '-') : esc(row.reason || '-')}</p>
                    ${can('FORKLIFT_SETTINGS_MANAGE') && row.readiness === 'ready' ? `<button class="fl-reminder-send-one mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black" data-key="${esc(row.key)}">Queue this</button>` : ''}
                </div>`;
            }).join('') : `<div class="lg:col-span-2 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">ไม่มีรายการใกล้หมดอายุ</div>`}
        </div>
    </section>`;
}

function campaignCandidates(rows = []) {
    return rows.filter(row => ['EXPIRING_SOON', 'EXPIRED', 'ACTIVE', 'SUSPENDED'].includes(row.EffectiveStatus)).slice(0, 100);
}

function renderBulkCampaignPanel(rows = []) {
    if (!can('FORKLIFT_RENEW') && !can('FORKLIFT_SUSPEND') && !can('FORKLIFT_MANAGE')) return '';
    const candidates = campaignCandidates(rows);
    const selectedCount = [..._bulkSelected].filter(id => candidates.some(row => String(row.ID) === String(id))).length;
    const expiringCount = candidates.filter(row => ['EXPIRING_SOON', 'EXPIRED'].includes(row.EffectiveStatus)).length;
    return `<section class="ds-section p-4">
        <div class="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div>
                <h3 class="font-black text-slate-800">Renewal Campaign & Bulk Operations</h3>
                <p class="text-xs text-slate-500">เลือกจาก report ปัจจุบัน · Candidate ${candidates.length} · Expiring/Expired ${expiringCount} · Selected ${selectedCount}</p>
            </div>
            <div class="flex flex-wrap gap-2">
                <button id="fl-bulk-select-expiring" class="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-black">Select expiring</button>
                <button id="fl-bulk-select-page" class="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black">Select shown</button>
                <button id="fl-bulk-clear" class="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-black">Clear</button>
            </div>
        </div>
        <div class="mt-3 grid grid-cols-1 xl:grid-cols-[1.4fr_.9fr] gap-4">
            <div class="max-h-72 overflow-auto rounded-xl border border-slate-100">
                <table class="min-w-full text-xs">
                    <thead class="sticky top-0 bg-slate-50 text-slate-500"><tr><th class="px-3 py-2 text-left">เลือก</th><th class="px-3 py-2 text-left">Employee</th><th class="px-3 py-2 text-left">License</th><th class="px-3 py-2 text-left">Expire</th><th class="px-3 py-2 text-left">Status</th></tr></thead>
                    <tbody class="divide-y divide-slate-100">
                        ${candidates.length ? candidates.map(row => `<tr>
                            <td class="px-3 py-2"><input type="checkbox" class="fl-bulk-check h-4 w-4 rounded border-slate-300" data-id="${row.ID}" ${_bulkSelected.has(String(row.ID)) ? 'checked' : ''}></td>
                            <td class="px-3 py-2"><b>${esc(row.EmployeeName || row.EmployeeNameSnapshot || '-')}</b><br><span class="text-slate-400">${esc(row.EmployeeID)}</span></td>
                            <td class="px-3 py-2 font-mono">${esc(row.LicenseNo || '-')}<br><span class="text-slate-400">${esc(licenseTypeLabel(row))}</span></td>
                            <td class="px-3 py-2">${fmtDate(row.ExpireDate)}</td>
                            <td class="px-3 py-2">${statusBadge(row.EffectiveStatus)}</td>
                        </tr>`).join('') : `<tr><td colspan="5" class="px-3 py-8 text-center text-slate-400">ไม่มีรายการสำหรับ campaign</td></tr>`}
                    </tbody>
                </table>
            </div>
            <form id="fl-bulk-renew-form" class="rounded-xl border border-slate-100 bg-slate-50/60 p-3 space-y-3">
                <h4 class="font-black text-slate-800 text-sm">Bulk renew selected</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label class="text-xs font-bold text-slate-500">Issue date<input name="NewIssueDate" type="date" required class="form-input w-full rounded-xl mt-1" value="${new Date().toISOString().slice(0, 10)}"></label>
                    <label class="text-xs font-bold text-slate-500">Expire date<input name="NewExpireDate" type="date" required class="form-input w-full rounded-xl mt-1"></label>
                    <label class="text-xs font-bold text-slate-500 sm:col-span-2">Note<input name="RenewalNote" class="form-input w-full rounded-xl mt-1" value="Bulk renewal campaign"></label>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${can('FORKLIFT_RENEW') ? `<button class="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-black ${selectedCount ? '' : 'opacity-50'}" ${selectedCount ? '' : 'disabled'}>Renew selected</button>` : ''}
                    ${can('FORKLIFT_SETTINGS_MANAGE') ? `<button type="button" id="fl-bulk-remind" class="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black ${selectedCount ? '' : 'opacity-50'}" ${selectedCount ? '' : 'disabled'}>Queue reminders</button>` : ''}
                    ${can('FORKLIFT_SUSPEND') ? `<button type="button" id="fl-bulk-suspend" class="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-black ${selectedCount ? '' : 'opacity-50'}" ${selectedCount ? '' : 'disabled'}>Suspend</button><button type="button" id="fl-bulk-restore" class="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black ${selectedCount ? '' : 'opacity-50'}" ${selectedCount ? '' : 'disabled'}>Restore</button>` : ''}
                    ${can('FORKLIFT_MANAGE') ? `<button type="button" id="fl-bulk-archive" class="px-3 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-black ${selectedCount ? '' : 'opacity-50'}" ${selectedCount ? '' : 'disabled'}>Archive</button>` : ''}
                </div>
            </form>
        </div>
    </section>`;
}

function renderEmailOutboxPanel() {
    if (!can('FORKLIFT_AUDIT_VIEW')) return '';
    return `<section class="ds-section p-4">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div><h3 class="font-black text-slate-800">Email Outbox</h3><p class="text-xs text-slate-500">${_emailOutbox.length} latest reminder emails</p></div>
            ${can('FORKLIFT_SETTINGS_MANAGE') ? `<button id="fl-email-retry-queued" class="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-black">Retry queued</button>` : ''}
        </div>
        <div class="mt-3 overflow-x-auto">
            <table class="min-w-full text-xs">
                <thead class="bg-slate-50 text-slate-500"><tr><th class="px-3 py-2 text-left">Created</th><th class="px-3 py-2 text-left">Event</th><th class="px-3 py-2 text-left">Recipients</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-right">Action</th></tr></thead>
                <tbody class="divide-y divide-slate-100">
                    ${_emailOutbox.length ? _emailOutbox.map(row => `<tr><td class="px-3 py-2">${esc(String(row.CreatedAt || '').slice(0, 19).replace('T', ' '))}</td><td class="px-3 py-2 font-bold">${esc(row.EventType)}</td><td class="px-3 py-2 max-w-xs truncate">${esc(row.Recipients)}</td><td class="px-3 py-2">${emailStatusBadge(row.Status)}</td><td class="px-3 py-2 text-right">${can('FORKLIFT_SETTINGS_MANAGE') && row.Status !== 'Sent' ? `<button class="fl-email-retry-one px-2 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold" data-id="${row.id}">Retry</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="5" class="px-3 py-6 text-center text-slate-400">ยังไม่มี email outbox</td></tr>`}
                </tbody>
            </table>
        </div>
    </section>`;
}

function renderReports() {
    if (!can('FORKLIFT_EXPORT')) return `<section class="ds-section p-6 text-center text-slate-500">ต้องมี permission FORKLIFT_EXPORT เพื่อดูรายงาน</section>`;
    const summary = _reportData?.summary || {};
    const rows = _reportData?.rows || [];
    return `<div class="space-y-4">
        <section class="grid grid-cols-2 lg:grid-cols-6 gap-3">
            ${reportMetric('Total', summary.total || 0, 'records', 'slate')}
            ${reportMetric('Active', summary.active || 0, 'valid licenses', 'emerald')}
            ${reportMetric('Expiring', summary.expiringSoon || 0, 'within warning', 'amber')}
            ${reportMetric('Expired', summary.expired || 0, 'need renewal', 'red')}
            ${reportMetric('Suspended', summary.suspended || 0, 'blocked', 'slate')}
            ${reportMetric('Missing cert', summary.missingCertificate || 0, 'certificate no.', 'amber')}
        </section>
        ${renderReportRankings(rows)}
        ${renderBulkCampaignPanel(rows)}
        <section id="fl-report-print-area" class="ds-section p-4">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div><h2 class="font-black text-slate-800">รายงานทะเบียนใบอนุญาต</h2><p class="text-xs text-slate-500">Generated ${esc(_reportData?.generatedAt || '-')}</p></div>
                <div class="flex flex-wrap gap-2">
                    <button id="fl-report-pdf" class="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-black">Export PDF</button>
                    <button id="fl-report-export" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">Export CSV</button>
                </div>
            </div>
            <div class="mt-4 overflow-x-auto max-h-[420px]">
                <table class="min-w-full text-xs">
                    <thead class="sticky top-0 bg-slate-50 text-slate-500"><tr><th class="px-3 py-2 text-left">Employee</th><th class="px-3 py-2 text-left">Dept/Unit</th><th class="px-3 py-2 text-left">Type</th><th class="px-3 py-2 text-left">License</th><th class="px-3 py-2 text-left">Expire</th><th class="px-3 py-2 text-left">Status</th></tr></thead>
                    <tbody class="divide-y divide-slate-100">
                        ${rows.length ? rows.slice(0, 100).map(row => `<tr><td class="px-3 py-2"><b>${esc(row.EmployeeName || row.EmployeeNameSnapshot || '-')}</b><br><span class="text-slate-400">${esc(row.EmployeeID)}</span></td><td class="px-3 py-2">${esc(row.Department || row.DepartmentSnapshot || '-')}<br><span class="text-slate-400">${esc(row.Unit || row.UnitSnapshot || '-')}</span></td><td class="px-3 py-2">${esc(licenseTypeLabel(row))}</td><td class="px-3 py-2 font-mono">${esc(row.LicenseNo || '-')}<br><span class="text-slate-400">${esc(row.CardNo || '-')}</span></td><td class="px-3 py-2">${fmtDate(row.ExpireDate)}</td><td class="px-3 py-2">${statusBadge(row.EffectiveStatus)}</td></tr>`).join('') : `<tr><td colspan="6" class="px-3 py-8 text-center text-slate-400">ไม่มีข้อมูลรายงาน</td></tr>`}
                    </tbody>
                </table>
            </div>
        </section>
        ${renderReminderPanel()}
        ${renderEmailOutboxPanel()}
        ${renderSettingsPanel()}
        ${renderAuditPanel()}
    </div>`;
}

async function render() {
    const container = document.getElementById('forklift-page');
    if (!container) return;
    const request = createLatestRequestController('forklift:page-render');
    const { signal } = request;
    container.innerHTML = pageSkeleton({ label: 'กำลังโหลดข้อมูลใบอนุญาตรถยก', cards: 3, rows: 6 });
    try {
        const [, dash] = await Promise.all([fetchAll(signal), fetchDashboard(signal)]);
        if (!request.isLatest()) return;
        if (!can('FORKLIFT_VIEW')) {
            container.innerHTML = `<section class="ds-section p-6 text-center"><h2 class="font-black text-slate-800">ไม่มีสิทธิ์เข้าถึง</h2><p class="text-sm text-slate-500 mt-1">ต้องมี permission FORKLIFT_VIEW</p></section>`;
            return;
        }
        const body = _activeTab === 'templates'
            ? `${renderTabs()}${renderTemplates()}`
            : (_activeTab === 'approvals'
                ? `${renderTabs()}${renderRequests()}`
            : (_activeTab === 'reports'
                ? `${renderTabs()}${renderReports()}`
                : `${renderAlerts(dash)}${renderTabs()}${renderFilters()}${renderRegistry()}`));
        container.innerHTML = `<div class="space-y-6 animate-fade-in pb-10">${renderHero(dash)}${body}</div>`;
        bindEvents();
        await openDeepLinkedLicense();
    } catch (err) {
        if (signal.aborted || isAbortError(err)) return;
        container.innerHTML = loadingErrorState(`โหลดโมดูลใบอนุญาตรถยกไม่สำเร็จ: ${err?.message || err}`);
    } finally {
        request.finish();
    }
}

function bindEvents() {
    document.querySelectorAll('.fl-tab').forEach(btn => btn.addEventListener('click', () => { _activeTab = btn.dataset.tab; render(); }));
    document.getElementById('fl-add-btn')?.addEventListener('click', () => openForm());
    document.querySelectorAll('.fl-view').forEach(btn => btn.addEventListener('click', () => openLicenseDetail(btn.dataset.id)));
    document.getElementById('fl-request-btn')?.addEventListener('click', () => openForm(null, 'request'));
    document.getElementById('fl-request-add-2')?.addEventListener('click', () => openForm(null, 'request'));
    document.getElementById('fl-filter-btn')?.addEventListener('click', () => {
        _filters = {
            q: document.getElementById('fl-q')?.value || '',
            type: document.getElementById('fl-type')?.value || 'all',
            status: document.getElementById('fl-status')?.value || 'all',
            expireFrom: document.getElementById('fl-expire-from')?.value || '',
            expireTo: document.getElementById('fl-expire-to')?.value || '',
            certificate: document.getElementById('fl-certificate')?.value || 'all',
        };
        _page = 1; render();
    });
    document.getElementById('fl-q')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') document.getElementById('fl-filter-btn')?.click();
    });
    document.getElementById('fl-filter-reset')?.addEventListener('click', () => {
        _filters = { q: '', type: 'all', status: 'all', expireFrom: '', expireTo: '', certificate: 'all' };
        _page = 1;
        render();
    });
    document.getElementById('fl-prev')?.addEventListener('click', () => { if (_page > 1) { _page--; render(); } });
    document.getElementById('fl-next')?.addEventListener('click', () => { if (_page * _limit < _total) { _page++; render(); } });
    document.getElementById('fl-report-export')?.addEventListener('click', exportReportCsv);
    document.getElementById('fl-report-pdf')?.addEventListener('click', exportReportPdf);
    document.querySelectorAll('.fl-bulk-check').forEach(input => input.addEventListener('change', () => {
        if (input.checked) _bulkSelected.add(String(input.dataset.id));
        else _bulkSelected.delete(String(input.dataset.id));
        render();
    }));
    document.getElementById('fl-bulk-select-expiring')?.addEventListener('click', () => {
        (_reportData?.rows || []).filter(row => ['EXPIRING_SOON', 'EXPIRED'].includes(row.EffectiveStatus)).forEach(row => _bulkSelected.add(String(row.ID)));
        render();
    });
    document.getElementById('fl-bulk-select-page')?.addEventListener('click', () => {
        campaignCandidates(_reportData?.rows || []).forEach(row => _bulkSelected.add(String(row.ID)));
        render();
    });
    document.getElementById('fl-bulk-clear')?.addEventListener('click', () => { _bulkSelected.clear(); render(); });
    document.getElementById('fl-bulk-renew-form')?.addEventListener('submit', event => {
        event.preventDefault();
        const ids = currentBulkIds();
        if (!ids.length) return UI.showToast('กรุณาเลือกรายการก่อน', 'warning');
        if (!confirm(`Renew ${ids.length} license(s)?`)) return;
        return runForkliftForm(event.target, event.submitter, 'กำลังต่ออายุ...', async () => {
            const body = { ...Object.fromEntries(new FormData(event.target).entries()), ids };
            const res = await API.post('/forklift/licenses/bulk-renew', body);
            UI.showToast(`ต่ออายุสำเร็จ ${res.data?.success || 0} รายการ${res.data?.failed ? `, failed ${res.data.failed}` : ''}`, res.data?.failed ? 'warning' : 'success');
            _bulkSelected.clear();
            invalidateForkliftCache('data');
            await render();
        }, 'Bulk renew ไม่สำเร็จ');
    });
    document.getElementById('fl-bulk-remind')?.addEventListener('click', event => {
        const keys = reminderKeysForSelected();
        if (!keys.length) return UI.showToast('รายการที่เลือกยังไม่พร้อมส่ง reminder หรือไม่มีอีเมล', 'warning');
        return runBusy(event.currentTarget, 'กำลังเข้าคิว...', async () => {
            const res = await API.post('/forklift/reminders/send', { keys });
            UI.showToast(`Queued ${res.data?.queued || 0} reminder(s)`, 'success');
            await render();
        }, 'ส่ง reminder ไม่สำเร็จ');
    });
    document.getElementById('fl-bulk-suspend')?.addEventListener('click', event => runBulkStatus('SUSPEND', event.currentTarget));
    document.getElementById('fl-bulk-restore')?.addEventListener('click', event => runBulkStatus('RESTORE', event.currentTarget));
    document.getElementById('fl-bulk-archive')?.addEventListener('click', event => runBulkStatus('ARCHIVE', event.currentTarget));
    document.getElementById('fl-import-template')?.addEventListener('click', downloadImportTemplate);
    document.getElementById('fl-import-btn')?.addEventListener('click', () => document.getElementById('fl-import-file')?.click());
    document.getElementById('fl-import-file')?.addEventListener('change', async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const rows = await parseImportFile(file);
            if (!rows.length) return UI.showToast('ไม่พบข้อมูลในไฟล์ import', 'warning');
            openBulkImportReview(rows);
        } catch (err) {
            UI.showToast(err?.message || 'อ่านไฟล์ import ไม่สำเร็จ', 'error');
        }
    });
    document.getElementById('fl-reminder-send-ready')?.addEventListener('click', event => {
        return runBusy(event.currentTarget, 'กำลังเข้าคิว...', async () => {
            const res = await API.post('/forklift/reminders/send', {});
            UI.showToast(`Queued ${res.data?.queued || 0} reminder(s)`, 'success');
            await render();
        }, 'ส่ง reminder ไม่สำเร็จ');
    });
    document.querySelectorAll('.fl-reminder-send-one').forEach(btn => btn.addEventListener('click', () => {
        return runBusy(btn, 'กำลังเข้าคิว...', async () => {
            const res = await API.post('/forklift/reminders/send', { keys: [btn.dataset.key] });
            UI.showToast(`Queued ${res.data?.queued || 0} reminder(s)`, 'success');
            await render();
        }, 'ส่ง reminder ไม่สำเร็จ');
    }));
    document.getElementById('fl-email-retry-queued')?.addEventListener('click', event => {
        return runBusy(event.currentTarget, 'กำลัง Retry...', async () => {
            await API.post('/forklift/email-outbox/retry-queued', { limit: 20 });
            UI.showToast('Retry queued สำเร็จ', 'success');
            await render();
        }, 'Retry ไม่สำเร็จ');
    });
    document.querySelectorAll('.fl-email-retry-one').forEach(btn => btn.addEventListener('click', () => {
        return runBusy(btn, 'กำลัง Retry...', async () => {
            await API.post(`/forklift/email-outbox/${btn.dataset.id}/retry`, {});
            UI.showToast('Retry email สำเร็จ', 'success');
            await render();
        }, 'Retry email ไม่สำเร็จ');
    }));
    document.getElementById('fl-settings-form')?.addEventListener('submit', event => {
        event.preventDefault();
        return runForkliftForm(event.target, event.submitter, 'กำลังบันทึก...', async () => {
            const res = await API.put('/forklift/settings', Object.fromEntries(new FormData(event.target).entries()));
            _settings = res.data || _settings;
            invalidateForkliftCache('settings');
            UI.showToast('บันทึก Settings สำเร็จ', 'success');
            await render();
        }, 'บันทึก Settings ไม่สำเร็จ');
    });
    document.getElementById('fl-signature-form')?.addEventListener('submit', event => {
        event.preventDefault();
        const file = event.target.signature?.files?.[0];
        if (!file) return UI.showToast('Please choose a signature image.', 'error');
        const fd = new FormData();
        fd.append('signature', file);
        return runForkliftForm(event.target, event.submitter, 'Uploading...', async () => {
            await API.post('/forklift/settings/manager-signature', fd);
            UI.showToast('Manager signature uploaded.', 'success');
            await render();
        }, 'Signature upload failed.');
    });
    document.getElementById('fl-signature-delete')?.addEventListener('click', event => {
        if (!confirm('Remove manager signature?')) return;
        return runForkliftAction(event.currentTarget, 'Removing...', async () => {
            await API.delete('/forklift/settings/manager-signature');
            UI.showToast('Manager signature removed.', 'success');
            await render();
        }, 'Remove signature failed.');
    });
    document.querySelectorAll('.fl-edit').forEach(btn => btn.addEventListener('click', () => openForm(btn.dataset.id)));
    document.querySelectorAll('.fl-request-detail').forEach(btn => btn.addEventListener('click', () => openRequestDetail(btn.dataset.id)));
    document.getElementById('fl-request-status-filter')?.addEventListener('change', async event => { _requestFilters.status = event.target.value; await render(); });
    document.getElementById('fl-request-kind-filter')?.addEventListener('change', async event => { _requestFilters.kind = event.target.value; await render(); });
    document.getElementById('fl-request-overdue-filter')?.addEventListener('change', async event => { _requestFilters.overdue = event.target.checked; await render(); });
    document.getElementById('fl-request-escalate')?.addEventListener('click', event => {
        if (!confirm('ส่งอีเมล Escalation สำหรับคำขอที่เกิน SLA ตอนนี้?')) return;
        return runForkliftAction(event.currentTarget, 'กำลังเข้าคิว...', async () => {
            const overdue = (await API.get('/forklift/requests/overdue')).data || [];
            const visible = new Set(_requests.map(row => Number(row.ID)));
            const ids = overdue.filter(row => visible.has(Number(row.ID))).map(row => Number(row.ID));
            if (!ids.length) return UI.showToast('ไม่มีคำขอเกิน SLA ในผลลัพธ์ที่กำลังแสดง', 'warning');
            const result = await API.post('/forklift/requests/escalations/send', { ids });
            UI.showToast(`เข้าคิว Escalation ${result.data?.queued || 0} รายการ`, 'success');
            await render();
        }, 'ส่ง Escalation ไม่สำเร็จ');
    });
    document.querySelectorAll('.fl-renew').forEach(btn => btn.addEventListener('click', () => openRenew(btn.dataset.id)));
    document.querySelectorAll('.fl-renew-request').forEach(btn => btn.addEventListener('click', () => reportAsyncAction(openRenewalRequest(btn.dataset.id), 'เปิดคำขอต่ออายุไม่สำเร็จ')));
    document.querySelectorAll('.fl-docs').forEach(btn => btn.addEventListener('click', () => openDocs(btn.dataset.id)));
    document.querySelectorAll('.fl-card').forEach(btn => btn.addEventListener('click', () => openCard(btn.dataset.id)));
    document.querySelectorAll('.fl-archive').forEach(btn => btn.addEventListener('click', () => { if (!confirm('Archive ใบอนุญาตนี้?')) return; return runBusy(btn, 'กำลัง Archive...', async () => { await API.delete(`/forklift/licenses/${btn.dataset.id}`); invalidateForkliftCache('data'); UI.showToast('Archive สำเร็จ', 'success'); await render(); }); }));
    document.querySelectorAll('.fl-suspend').forEach(btn => btn.addEventListener('click', () => { const reason = prompt('เหตุผลการระงับสิทธิ์') || ''; if (!reason) return; return runBusy(btn, 'กำลังระงับ...', async () => { await API.post(`/forklift/licenses/${btn.dataset.id}/suspend`, { reason }); invalidateForkliftCache('data'); UI.showToast('ระงับสิทธิ์สำเร็จ', 'success'); await render(); }); }));
    document.querySelectorAll('.fl-restore').forEach(btn => btn.addEventListener('click', () => runBusy(btn, 'กำลังคืนสิทธิ์...', async () => { await API.post(`/forklift/licenses/${btn.dataset.id}/restore`, {}); invalidateForkliftCache('data'); UI.showToast('คืนสิทธิ์สำเร็จ', 'success'); await render(); })));
    document.querySelectorAll('.fl-approve').forEach(btn => btn.addEventListener('click', () => {
        const ReviewNote = prompt('Review note (optional)') || '';
        return runBusy(btn, 'กำลังอนุมัติ...', async () => {
            await API.post(`/forklift/requests/${btn.dataset.id}/approve`, { ReviewNote });
            invalidateForkliftCache('data');
            UI.showToast('Approve สำเร็จและออกเลขใบอนุญาตแล้ว', 'success');
            await render();
        });
    }));
    document.querySelectorAll('.fl-reject').forEach(btn => btn.addEventListener('click', () => {
        const ReviewNote = prompt('เหตุผลการปฏิเสธ') || '';
        if (!ReviewNote) return;
        return runBusy(btn, 'กำลังปฏิเสธ...', async () => {
            await API.post(`/forklift/requests/${btn.dataset.id}/reject`, { ReviewNote });
            invalidateForkliftCache('data');
            UI.showToast('Reject สำเร็จ', 'success');
            await render();
        });
    }));
    document.querySelectorAll('.fl-cancel-request').forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Cancel request นี้?')) return;
        return runBusy(btn, 'กำลังยกเลิก...', async () => {
            await API.post(`/forklift/requests/${btn.dataset.id}/cancel`, {});
            invalidateForkliftCache('data');
            UI.showToast('Cancel request สำเร็จ', 'success');
            await render();
        });
    }));
    document.getElementById('fl-template-add')?.addEventListener('click', openTemplateForm);
    document.getElementById('fl-template-add-2')?.addEventListener('click', openTemplateForm);
    document.querySelectorAll('.fl-template-edit').forEach(btn => btn.addEventListener('click', () => openTemplateEditor(btn.dataset.id)));
    document.querySelectorAll('.fl-template-version').forEach(btn => btn.addEventListener('click', () => openNewVersion(btn.dataset.id)));
    document.querySelectorAll('.fl-template-publish').forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Publish Template version นี้?')) return;
        return runBusy(btn, 'กำลัง Publish...', async () => { await API.post(`/forklift/template-versions/${btn.dataset.version}/publish`, {});UI.showToast('Publish Template สำเร็จ', 'success');await render(); }, 'Publish Template ไม่สำเร็จ');
    }));
    document.querySelectorAll('.fl-template-active').forEach(btn => btn.addEventListener('click', () => {
        const active = btn.dataset.active === '1';
        if (!confirm(active ? 'Set this template active?' : 'Set this template inactive? It will not be used for card rendering.')) return;
        return runBusy(btn, 'กำลังบันทึก...', async () => { await API.post(`/forklift/templates/${btn.dataset.id}/active`, { IsActive: active ? 1 : 0 });UI.showToast(active ? 'Template active' : 'Template inactive', 'success');await render(); }, 'Update Template ไม่สำเร็จ');
    }));
    document.querySelectorAll('.fl-template-archive').forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Archive this template? It will be hidden from card rendering.')) return;
        return runBusy(btn, 'กำลัง Archive...', async () => { await API.post(`/forklift/templates/${btn.dataset.id}/archive`, {});UI.showToast('Template archived', 'success');await render(); }, 'Archive Template ไม่สำเร็จ');
    }));
    document.querySelectorAll('.fl-template-restore').forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Restore this template and make it active?')) return;
        return runBusy(btn, 'กำลัง Restore...', async () => { await API.post(`/forklift/templates/${btn.dataset.id}/restore`, {});UI.showToast('Template restored', 'success');await render(); }, 'Restore Template ไม่สำเร็จ');
    }));
    document.querySelectorAll('.fl-template-delete').forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Delete this unused template permanently? This cannot be undone.')) return;
        return runBusy(btn, 'กำลังลบ...', async () => {
            await API.delete(`/forklift/templates/${btn.dataset.id}`);
            UI.showToast('Template deleted', 'success');
            await render();
        }, 'Delete failed. Archive the template if it has print history.');
    }));
    document.querySelectorAll('.fl-template-force-delete').forEach(btn => btn.addEventListener('click', () => {
        const used = Number(btn.dataset.used || 0);
        if (!confirm(`Force delete this template and ${used} print/export log(s)? This cannot be undone.`)) return;
        if (!confirm('Confirm force delete: template, versions, fields, and linked print/export history will be permanently removed.')) return;
        return runBusy(btn, 'กำลัง Force delete...', async () => {
            await API.delete(`/forklift/templates/${btn.dataset.id}?force=1`);
            UI.showToast('Template force deleted', 'success');
            await render();
        }, 'Force delete failed.');
    }));
}

export async function loadForkliftPage() {
    await render();
}
