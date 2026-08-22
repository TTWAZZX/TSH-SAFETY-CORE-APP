import { API } from '../api.js';
import { showLoading, hideLoading, showError, showToast, openModal, closeModal, showConfirmationModal, showDocumentModal } from '../ui.js?v=20260610-cccf-related-forms';
import { createLatestRequestController, guardActionHandler, guardSubmitHandler, pageSkeleton } from '../utils/async-ui.js?v=20260715-phase32c-residual-async';

// ─── Auth ─────────────────────────────────────────────────────────────────────
function hasAdminRole(user = {}) {
    const roleText = [
        user.role,
        user.Role,
        user.roleName,
        user.RoleName,
        user.userRole,
        user.UserRole,
        user.permission,
        user.Permission,
    ].map(v => String(v || '').trim().toLowerCase()).filter(Boolean);
    return user.isAdmin === true || user.IsAdmin === true || roleText.some(v => v === 'admin' || v.includes('admin'));
}

function resolveCccfAuthContext(sessionUser) {
    const user = sessionUser && typeof sessionUser === 'object'
        ? sessionUser
        : { name: '', id: '', department: '', team: '', role: 'User' };
    return { user, isAdmin: hasAdminRole(user) };
}

let currentUser = resolveCccfAuthContext(TSHSession.getUser()).user;
let isAdmin = hasAdminRole(currentUser);

function refreshCccfAuthContext() {
    const auth = resolveCccfAuthContext(TSHSession.getUser());
    currentUser = auth.user;
    isAdmin = auth.isAdmin;
}

// expose closeModal สำหรับ inline onclick ใน modal HTML strings
window.closeModal = closeModal;
window.showDocumentModal = showDocumentModal;

function cccfDelegatedActionOptions(scope, selector, options = {}) {
    return {
        ...options,
        target: event => event?.target?.closest?.(selector) || null,
        actionKey: (_event, button) => {
            const action = String(button?.className || '').split(/\s+/)
                .find(name => name.startsWith('cccf-') || name.startsWith('btn-')) || 'action';
            const recordId = button?.dataset?.id || button?.dataset?.assignmentId || 'unkeyed';
            return `cccf:${scope}:${action}:${recordId}`;
        },
    };
}

// ─── Static Data ──────────────────────────────────────────────────────────────
const STOP_TYPES = [
    { id: 1, code: 'Stop 1', label: 'อันตรายจากเครื่องจักร',        color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 2, code: 'Stop 2', label: 'อันตรายจากวัตถุหนักตกใส่',    color: '#f97316', bg: '#fff7ed', border: '#fed7aa', icon: 'M19 14l-7 7m0 0l-7-7m7 7V3' },
    { id: 3, code: 'Stop 3', label: 'อันตรายจากยานพาหนะ',          color: '#eab308', bg: '#fefce8', border: '#fef08a', icon: 'M8 17h8m-4-4v4M12 3L4 9v12h16V9l-8-6z' },
    { id: 4, code: 'Stop 4', label: 'อันตรายจากการตกจากที่สูง',    color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', icon: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6' },
    { id: 5, code: 'Stop 5', label: 'อันตรายจากไฟฟ้า',             color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 6, code: 'Stop 6', label: 'อันตรายอื่นๆ',                color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
];
const RANKS = [
    { rank: 'A', label: 'Rank A', desc: 'เสียชีวิต, พิการ, สูญเสียอวัยวะ', detail: '7 วัน',  color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    { rank: 'B', label: 'Rank B', desc: 'บาดเจ็บหยุดงาน',                   detail: '15 วัน', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
    { rank: 'C', label: 'Rank C', desc: 'บาดเจ็บเล็กน้อย ไม่หยุดงาน',      detail: '30 วัน', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
];

// ─── State ────────────────────────────────────────────────────────────────────
let _workerData    = [];
let _permanentData = [];
let _departments   = [];
let _employees     = [];
let _assignments   = [];
let _cccfForms     = [];
let _safetyUnits   = [];   // { id, name, department_id, DeptName }
let _unitTargets   = [];   // { unit_name, target_year, yearly_target } — yearly Form A people target
let _dashboardConfig = { cccfWorkerSource: 'manual_unit_target', cccfWorkerSourceByYear: {} };
let _cccfWorkerSource = 'manual_unit_target';
let _cccfUnitSel   = null;   // null = all units, array = selected unit names
let _cccfTargetSummary = null;
let _cccfWorkerProgress = null;
let _myWorkerTarget = null;
let _cccfRequireCompanyEmail = false;
let _wFilterDept   = '';
let _wFilterUnit   = '';
let _wFilterRank   = '';
let _wFilterStop   = 0;
let _wFilterPhoto  = '';
let _wSearch       = '';
let _wPage         = 0;    // pagination current page (0-indexed)
let _wPageSize     = 10;
const W_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 'all'];
let _pFilterDept   = '';
let _pFilterRank   = '';
let _pFilterStop   = 0;
let _pFilterStatus = '';
let _pFilterDue    = '';
let _pSearch       = '';
let _pPage         = 0;    // pagination current page (0-indexed)
const P_PAGE_SIZE  = 20;
let _unitYear      = new Date().getFullYear();  // year filter for unit summary
let _activeCccfTab = 'worker';
let _myCardYear    = new Date().getFullYear();  // year filter for "ของฉัน" card
let _unitChartInst = null;  // Chart.js instance (destroyed/recreated on update)
let _cccfCardSaveHold = null;
let _cccfCardSaveMenu = null;
let _cccfCardImageListenersReady = false;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value);
}

function toInlineJsString(value) {
    return JSON.stringify(String(value ?? '')).replace(/"/g, '&quot;');
}

function normalizeCccfWorkerSource(source) {
    return source === 'actual_department_worker' ? 'actual_department_worker' : 'manual_unit_target';
}

function resolveCccfWorkerSource(config = {}, year = new Date().getFullYear()) {
    const annual = config?.cccfWorkerSourceByYear;
    const annualSource = annual && typeof annual === 'object' && !Array.isArray(annual)
        ? annual[String(parseInt(year, 10))]
        : null;
    return normalizeCccfWorkerSource(annualSource || config?.cccfWorkerSource);
}

function getCccfWorkerRecordsForYear(year = _unitYear) {
    return _workerData.filter(row => new Date(row.SubmitDate).getFullYear() === Number(year));
}

function renderCccfWorkerModePanel() {
    const isActual = _cccfWorkerSource === 'actual_department_worker';
    const buddhistYear = _unitYear + 543;
    const actualYearCount = getCccfWorkerRecordsForYear(_unitYear).length;
    const currentYear = new Date().getFullYear();
    const yearOptions = [currentYear, currentYear - 1, currentYear - 2]
        .map(year => `<option value="${year}" ${year === _unitYear ? 'selected' : ''}>ปี ${year + 543}</option>`)
        .join('');
    const sourceButtons = isAdmin ? `
      <div class="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="group" aria-label="รูปแบบติดตามผล Form A Worker">
        <button type="button" data-cccf-source="manual_unit_target" onclick="window._cccfSetWorkerSource('manual_unit_target')"
          aria-pressed="${!isActual ? 'true' : 'false'}"
          class="px-3 py-2 rounded-lg text-xs font-black transition-colors ${!isActual ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">
          กรอกผลรวมราย Unit
          <span class="block text-[9px] font-semibold opacity-75">Manual / Override</span>
        </button>
        <button type="button" data-cccf-source="actual_department_worker" onclick="window._cccfSetWorkerSource('actual_department_worker')"
          aria-pressed="${isActual ? 'true' : 'false'}"
          class="px-3 py-2 rounded-lg text-xs font-black transition-colors ${isActual ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">
          คำนวณจากแบบฟอร์มจริง
          <span class="block text-[9px] font-semibold opacity-75">Actual records</span>
        </button>
      </div>` : `
      <span class="inline-flex items-center px-3 py-2 rounded-xl border text-xs font-bold ${isActual ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}">
        ${isActual ? 'คำนวณจากแบบฟอร์มที่ส่งจริง' : 'กรอกผลรวมราย Unit โดยผู้ดูแลระบบ'}
      </span>`;

    return `
    <div id="cccf-worker-mode-panel" class="rounded-2xl border p-4 ${isActual ? 'border-blue-200 bg-blue-50/70' : 'border-emerald-200 bg-emerald-50/70'}">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="flex items-start gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isActual ? 'bg-blue-600' : 'bg-emerald-600'} text-white font-black">
            ${isActual ? 'A' : 'M'}
          </div>
          <div class="min-w-0">
            <p class="text-sm font-black text-slate-800">รูปแบบติดตามผล Form A Worker · ปี ${buddhistYear}</p>
            <p class="text-xs text-slate-600 mt-1 leading-relaxed">
              ${isActual
                ? 'ใช้แบบฟอร์มที่พนักงานส่งจริงในการคำนวณ และแสดง Rank, รายการของฉัน, Stop 1–6 และรายการทั้งหมด'
                : 'ใช้ Target และผลที่ Admin กรอก/Override ราย Unit โดยไม่ใช้รายการแบบฟอร์มจริงในการคำนวณหน้าหลัก'}
            </p>
            ${!isActual && actualYearCount > 0 && isAdmin ? `
              <p class="text-[10px] text-amber-700 mt-1.5">มีข้อมูล Actual เดิม ${actualYearCount.toLocaleString()} รายการในปีนี้ เก็บไว้ครบและเปิดดูได้ด้านล่าง แต่ไม่นำมาปนกับผล Manual</p>` : ''}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 flex-shrink-0" data-cccf-card-ignore>
          <select id="cccf-worker-mode-year" onchange="window._unitSetYear(+this.value)"
            class="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white text-slate-600 focus:outline-none focus:border-emerald-400">
            ${yearOptions}
          </select>
          ${sourceButtons}
        </div>
      </div>
    </div>`;
}

function setupCccfCardImageExport() {
    if (_cccfCardImageListenersReady) return;
    _cccfCardImageListenersReady = true;

    document.addEventListener('click', event => {
        if (event.target.closest('[data-cccf-card-save-action]')) {
            const card = _cccfCardSaveMenu?.card;
            hideCccfCardImageMenu();
            if (card) downloadCccfCardImage(card);
            return;
        }
        if (!event.target.closest('#cccf-card-save-menu')) hideCccfCardImageMenu();
    });
    document.addEventListener('contextmenu', showCccfCardContextMenu);
    document.addEventListener('pointerdown', startCccfCardImageHold);
    document.addEventListener('pointermove', moveCccfCardImageHold);
    document.addEventListener('pointerup', cancelCccfCardImageHold);
    document.addEventListener('pointercancel', cancelCccfCardImageHold);
}

function showCccfCardContextMenu(event) {
    const card = event.target?.closest?.('[data-cccf-card-image]');
    if (!card || !document.getElementById('cccf-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"]')) return;
    event.preventDefault();
    showCccfCardImageMenu(card, event.clientX, event.clientY);
}

function startCccfCardImageHold(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const card = event.target?.closest?.('[data-cccf-card-image]');
    if (!card || !document.getElementById('cccf-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"]')) return;
    cancelCccfCardImageHold();
    _cccfCardSaveHold = {
        card,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
            if (!_cccfCardSaveHold || _cccfCardSaveHold.card !== card) return;
            showCccfCardImageMenu(card, _cccfCardSaveHold.x, _cccfCardSaveHold.y);
        }, 800),
    };
}

function moveCccfCardImageHold(event) {
    if (!_cccfCardSaveHold || event.pointerId !== _cccfCardSaveHold.pointerId) return;
    if (Math.abs(event.clientX - _cccfCardSaveHold.x) > 10 || Math.abs(event.clientY - _cccfCardSaveHold.y) > 10) {
        cancelCccfCardImageHold();
    }
}

function cancelCccfCardImageHold() {
    if (_cccfCardSaveHold?.timer) clearTimeout(_cccfCardSaveHold.timer);
    _cccfCardSaveHold = null;
}

function showCccfCardImageMenu(card, clientX, clientY) {
    hideCccfCardImageMenu();
    const menu = document.createElement('div');
    menu.id = 'cccf-card-save-menu';
    menu.className = 'fixed z-[9999] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl';
    menu.style.minWidth = '170px';
    menu.innerHTML = `
        <button type="button" data-cccf-card-save-action
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
    _cccfCardSaveMenu = { card, menu };
}

function hideCccfCardImageMenu() {
    _cccfCardSaveMenu?.menu?.remove?.();
    _cccfCardSaveMenu = null;
}

async function downloadCccfCardImage(card) {
    if (typeof html2canvas === 'undefined') {
        showToast('ไม่พบ library สำหรับบันทึกรูปภาพ', 'error');
        return;
    }
    const name = safeCccfFilePart(card.dataset.cccfCardImage || 'cccf-card');
    try {
        showLoading('Saving card image...');
        const canvas = await html2canvas(card, {
            backgroundColor: '#ffffff',
            scale: Math.min(2, window.devicePixelRatio || 1.5),
            useCORS: true,
            logging: false,
            onclone: doc => {
                doc.querySelectorAll('[data-cccf-card-ignore]').forEach(el => { el.style.display = 'none'; });
                doc.querySelectorAll('#cccf-card-save-menu').forEach(el => { el.style.display = 'none'; });
                doc.querySelectorAll('[data-cccf-card-image]').forEach(el => {
                    el.style.animation = 'none';
                    el.style.transition = 'none';
                });
            },
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${name}-${_unitYear || new Date().getFullYear()}.png`;
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

function safeCccfFilePart(value) {
    return String(value || 'cccf-card')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'cccf-card';
}

function sanitizeUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    try {
        const url = new URL(raw, window.location.origin);
        const uploadIndex = url.pathname.indexOf('/uploads/');
        if (uploadIndex >= 0) {
            const appPath = window.location.pathname || '/';
            const basePath = appPath.includes('/index.html')
                ? appPath.slice(0, appPath.indexOf('/index.html'))
                : appPath.replace(/\/[^/]*$/, '');
            const base = basePath.replace(/\/+$/, '');
            const alreadyUnderApp = base && url.pathname.startsWith(`${base}/uploads/`);
            if (base && url.origin === window.location.origin && !alreadyUnderApp) {
                return `${window.location.origin}${base}${url.pathname.slice(uploadIndex)}${url.search}${url.hash}`;
            }
        }
        const host = url.hostname.toLowerCase();
        const currentHost = window.location.hostname.toLowerCase();
        const targetIsLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
        const currentIsLocal = currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost === '::1';
        if (targetIsLocal && !currentIsLocal && uploadIndex >= 0) {
            const appPath = window.location.pathname || '/';
            const basePath = appPath.includes('/index.html')
                ? appPath.slice(0, appPath.indexOf('/index.html'))
                : appPath.replace(/\/[^/]*$/, '');
            const base = basePath.replace(/\/+$/, '');
            return `${window.location.origin}${base}${url.pathname.slice(uploadIndex)}${url.search}${url.hash}`;
        }
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
    } catch {
        return '';
    }
}

function isOfficeFileUrl(value) {
    const safeUrl = sanitizeUrl(value);
    try {
        const path = decodeURIComponent(new URL(safeUrl, window.location.href).pathname);
        return /\.(docx?|xlsx?|pptx?)$/i.test(path);
    } catch {
        return /\.(docx?|xlsx?|pptx?)(?:[?#]|$)/i.test(String(value || ''));
    }
}

function openCccfRelatedForm(url, title) {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) {
        showToast('ไม่พบไฟล์แบบฟอร์ม', 'error');
        return;
    }
    if (isOfficeFileUrl(safeUrl)) {
        window.open(safeUrl, '_blank', 'noopener');
        return;
    }
    showDocumentModal(safeUrl, title || getFileNameFromUrl(safeUrl) || 'แบบฟอร์ม');
}

function downloadCccfRelatedForm(url, title) {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) {
        showToast('ไม่พบไฟล์แบบฟอร์ม', 'error');
        return;
    }
    const a = document.createElement('a');
    a.href = safeUrl;
    a.download = getFileNameFromUrl(safeUrl) || title || 'cccf-form';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function normalizeUnitName(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeTextKey(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getFileNameFromUrl(value) {
    const safeUrl = sanitizeUrl(value);
    if (!safeUrl) return '';
    try {
        const url = new URL(safeUrl);
        const name = decodeURIComponent(url.pathname.split('/').pop() || '');
        return name || 'ไฟล์แนบ';
    } catch {
        return 'ไฟล์แนบ';
    }
}

function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (!size) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getWorkerAttachments(record) {
    if (Array.isArray(record?.Attachments)) return record.Attachments;
    if (typeof record?.Attachments === 'string') {
        try {
            const parsed = JSON.parse(record.Attachments);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }
    return [];
}

function getPermanentNumber(record) {
    if (record?.PermanentNo) return String(record.PermanentNo);
    if (record?.PermanentSeq) return `CCCF${String(record.PermanentSeq).padStart(3, '0')}`;
    return record?.id ? `#${record.id}` : '—';
}

function renderWorkerAttachmentGallery(record) {
    const attachments = getWorkerAttachments(record);
    if (!attachments.length) return '';
    return `
      <div class="border-t border-slate-100 pt-4">
        <div class="mb-2 flex items-center justify-between gap-3">
          <p class="text-[10px] font-bold uppercase text-slate-400">รูปภาพแนบ</p>
          <span class="rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">${attachments.length} รูป</span>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          ${attachments.map(attachment => {
              const safeUrl = sanitizeUrl(attachment.FileUrl);
              if (!safeUrl) return '';
              return `<button type="button" class="group relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                onclick="showDocumentModal(${toInlineJsString(safeUrl)},${toInlineJsString(attachment.OriginalName || 'รูปภาพแนบ')})"
                title="ดูรูปขนาดใหญ่">
                <img src="${escapeAttr(safeUrl)}" alt="${escapeAttr(attachment.OriginalName || 'รูปภาพแนบ')}" loading="lazy"
                  class="h-full w-full object-cover transition-transform group-hover:scale-105">
              </button>`;
          }).join('')}
        </div>
      </div>`;
}

function renderFileActions(fileUrl, { compact = false } = {}) {
    const safeFileUrl = sanitizeUrl(fileUrl);
    if (!safeFileUrl) return '';
    const fileName = getFileNameFromUrl(safeFileUrl);
    const baseClass = compact
        ? 'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors'
        : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors';
    return `
      <div class="flex flex-wrap items-center gap-2 ${compact ? 'justify-center' : ''}">
        <a href="${escapeAttr(safeFileUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(fileName)}" onclick="event.stopPropagation()"
           class="${baseClass} bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100">
          เปิดไฟล์
        </a>
        <a href="${escapeAttr(safeFileUrl)}" download title="${escapeAttr(fileName)}" onclick="event.stopPropagation()"
           class="${baseClass} bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100">
          ดาวน์โหลด
        </a>
      </div>`;
}

function normalizeApiArray(res) {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    return [];
}

function cccfFormFileIcon(fileType) {
    const type = String(fileType || '').toLowerCase();
    if (type.includes('pdf')) return 'PDF';
    if (type.includes('excel') || type.includes('spreadsheet')) return 'XLS';
    if (type.includes('word')) return 'DOC';
    if (type.includes('image')) return 'IMG';
    return 'FILE';
}

function cccfFormFileLabel(fileType) {
    const type = String(fileType || '').toLowerCase();
    if (type.includes('pdf')) return 'PDF';
    if (type.includes('excel') || type.includes('spreadsheet')) return 'Excel';
    if (type.includes('word')) return 'Word';
    if (type.includes('image')) return 'รูปภาพ';
    return 'ไฟล์';
}

async function loadCccfForms(adminAll = false) {
    try {
        const res = await API.get(adminAll ? '/module-forms?module=cccf&all=1' : '/module-forms?module=cccf');
        _cccfForms = normalizeApiArray(res);
    } catch {
        _cccfForms = [];
    }
    return _cccfForms;
}

function renderCccfFormsUserCard(forms = _cccfForms, { compact = false } = {}) {
    const active = forms.filter(f => f.IsActive);
    if (!active.length) {
        return compact
            ? `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-400">ยังไม่มีแบบฟอร์มที่เกี่ยวข้องในระบบ</div>`
            : '';
    }
    return `
    <div class="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4" data-cccf-card-image="${compact ? 'cccf-related-forms-compact' : 'cccf-related-forms'}">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div>
          <p class="text-sm font-bold text-emerald-900">แบบฟอร์มที่เกี่ยวข้อง</p>
          <p class="text-xs text-emerald-700 mt-0.5">ดาวน์โหลดแบบฟอร์ม กรอก/ลงนาม แล้วแนบไฟล์ในช่อง FormFile</p>
        </div>
        <span class="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-100">${active.length} ไฟล์</span>
      </div>
      <div class="${compact ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 gap-2'}">
        ${active.map(f => {
            const safeUrl = sanitizeUrl(f.FileUrl);
            const title = f.Title || getFileNameFromUrl(safeUrl) || 'CCCF Form';
            const officeHint = isOfficeFileUrl(safeUrl)
                ? '<p class="mt-0.5 text-[10px] text-amber-600">ไฟล์ Office จะเปิด/ดาวน์โหลดจากไฟล์จริงโดยตรง</p>'
                : '';
            return `
            <div class="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-white px-3 py-2.5">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="shrink-0 rounded-lg bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">${cccfFormFileIcon(f.FileType)}</span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-slate-800">${escapeHtml(title)}</p>
                  <p class="text-[11px] text-slate-400">${cccfFormFileLabel(f.FileType)}${f.Version ? ` · ${escapeHtml(f.Version)}` : ''}</p>
                  ${officeHint}
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1.5" data-cccf-card-ignore>
                <button type="button" data-form-open="${escapeAttr(safeUrl)}" data-form-title="${escapeAttr(title)}"
                   class="rounded-lg border border-sky-200 px-2.5 py-1.5 text-[11px] font-bold text-sky-700 hover:bg-sky-50">เปิด</button>
                <button type="button" data-form-download="${escapeAttr(safeUrl)}" data-form-title="${escapeAttr(title)}"
                   class="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50">ดาวน์โหลด</button>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function canManageWorkerRecord(record) {
    return !!record && (isAdmin || record.EmployeeID === currentUser.id);
}

function getAssignmentEmployeeOptions() {
    const assignedIds = new Set(_assignments.map(a => String(a.EmployeeID || '').trim()).filter(Boolean));
    return [..._employees]
        .filter(emp => String(emp.EmployeeID || '').trim())
        .filter(emp => !assignedIds.has(String(emp.EmployeeID).trim()))
        .sort((a, b) => {
            const deptCompare = String(a.Department || '').localeCompare(String(b.Department || ''));
            if (deptCompare !== 0) return deptCompare;
            return String(a.EmployeeName || '').localeCompare(String(b.EmployeeName || ''));
        });
}

function getEmployeeById(employeeId) {
    const targetId = String(employeeId || '').trim();
    if (!targetId) return null;
    return _employees.find(emp => String(emp.EmployeeID || '').trim() === targetId) || null;
}

function getCurrentEmployeeUnit() {
    const employee = getEmployeeById(currentUser.id);
    return normalizeUnitName(employee?.Unit || currentUser.Unit || currentUser.unit || '');
}

function adminWorkerUnitField(selectedUnit = '') {
    const selected = normalizeUnitName(selectedUnit);
    return _safetyUnits.length
        ? `<select name="SafetyUnit" class="form-input w-full rounded-xl text-sm" required>
             <option value="">-- เลือก Unit --</option>
             ${_safetyUnits.map(u => `<option value="${escapeAttr(u.name)}" ${u.name === selected ? 'selected' : ''}>${escapeHtml(u.name)}${u.DeptName ? ` (${escapeHtml(u.DeptName)})` : ''}</option>`).join('')}
           </select>`
        : `<input type="text" name="SafetyUnit" class="form-input w-full rounded-xl text-sm" required value="${escapeAttr(selected)}" placeholder="ระบุ Safety Unit">`;
}

function lockedWorkerUnitField(unit, missingMessage = 'ยังไม่ได้กำหนด Safety Unit ใน Employee Master กรุณาติดต่อ Admin') {
    const value = normalizeUnitName(unit);
    if (!value) {
        return `<div class="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">${escapeHtml(missingMessage)}</div>
                <input type="hidden" name="SafetyUnit" value="">`;
    }
    return `<input type="text" class="form-input w-full rounded-xl text-sm bg-slate-50 text-slate-600 cursor-not-allowed" readonly value="${escapeAttr(value)}">
            <input type="hidden" name="SafetyUnit" value="${escapeAttr(value)}">`;
}

function getPermanentOwnerOptions() {
    const assignmentRows = _assignments
        .map(assignment => {
            const employee = getEmployeeById(assignment.EmployeeID);
            return {
                EmployeeID: String(assignment.EmployeeID || employee?.EmployeeID || '').trim(),
                EmployeeName: assignment.AssigneeName || employee?.EmployeeName || '',
                Department: assignment.Department || employee?.Department || '',
                CompanyEmail: assignment.CompanyEmail || employee?.CompanyEmail || '',
                source: 'assignment',
            };
        })
        .filter(row => row.EmployeeID);

    const map = new Map();
    [...assignmentRows, ..._employees.map(emp => ({
        EmployeeID: String(emp.EmployeeID || '').trim(),
        EmployeeName: emp.EmployeeName || emp.name || '',
        Department: emp.Department || '',
        CompanyEmail: emp.CompanyEmail || '',
        source: 'employee',
    }))].forEach(row => {
        if (!row.EmployeeID || map.has(row.EmployeeID)) return;
        map.set(row.EmployeeID, row);
    });

    return [...map.values()].sort((a, b) => {
        const assignmentDelta = (a.source === 'assignment' ? 0 : 1) - (b.source === 'assignment' ? 0 : 1);
        if (assignmentDelta !== 0) return assignmentDelta;
        const deptDelta = String(a.Department || '').localeCompare(String(b.Department || ''));
        if (deptDelta !== 0) return deptDelta;
        return String(a.EmployeeName || '').localeCompare(String(b.EmployeeName || ''));
    });
}

// ─── Window-level helpers ─────────────────────────────────────────────────────
window._cccfDeleteWorker = async (id) => {
    const ok = await showConfirmationModal('ยืนยันการลบ', 'ต้องการลบรายการ CCCF Worker นี้ใช่หรือไม่?');
    if (!ok) return;
    showLoading('กำลังลบ...');
    try {
        await API.delete(`/cccf/form-a-worker/${id}`);
        showToast('ลบสำเร็จ', 'success');
        loadCccfPage();
    } catch (err) { showError(err); } finally { hideLoading(); }
};
window._cccfDeletePermanent = async (id) => {
    const ok = await showConfirmationModal('ยืนยันการลบ', 'ต้องการลบรายการ CCCF Permanent นี้ใช่หรือไม่?');
    if (!ok) return;
    showLoading('กำลังลบ...');
    try {
        await API.delete(`/cccf/form-a-permanent/${id}`);
        showToast('ลบสำเร็จ', 'success');
        loadCccfPage();
    } catch (err) { showError(err); } finally { hideLoading(); }
};
window._cccfShowWorkerDetail = (id) => {
    const r = _workerData.find(x => x.id == id); if (!r) return;
    const rank = RANKS.find(x => x.rank === r.Rank) || RANKS[2];
    const stop = STOP_TYPES.find(x => x.id == r.StopType) || STOP_TYPES[5];
    const dateStr = r.SubmitDate ? new Date(r.SubmitDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const row = (label, val, full = false) => val
        ? `<div class="${full ? 'col-span-2' : ''}"><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">${escapeHtml(label)}</p><p class="text-sm text-slate-700">${escapeHtml(val)}</p></div>`
        : '';
    openModal('รายละเอียด CCCF Form A — Worker', `
      <div class="space-y-4 px-1">
        <div class="flex items-center gap-3 p-4 rounded-xl" style="background:${stop.bg};border:1px solid ${stop.border}">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style="background:${stop.color}18">
            <svg class="w-6 h-6" style="color:${stop.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${stop.icon}"/></svg>
          </div>
          <div class="flex-1">
            <p class="font-bold text-sm" style="color:${stop.color}">${escapeHtml(stop.code)} — ${escapeHtml(stop.label)}</p>
            <p class="text-xs text-slate-500 mt-0.5">บันทึกโดย ${escapeHtml(r.EmployeeName || '—')} · ${escapeHtml(dateStr)}</p>
          </div>
          <span class="w-10 h-10 rounded-xl flex items-center justify-center text-base font-black text-white flex-shrink-0" style="background:${rank.color}">${rank.rank}</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${row('ชื่อพนักงาน', r.EmployeeName)}
          ${row('รหัสพนักงาน', r.EmployeeID)}
          ${row('หน่วยงาน', r.Department)}
          ${row('วันที่ลงข้อมูล', dateStr)}
          ${row('พื้นที่ทำงาน / งาน', r.JobArea)}
          ${row('อุปกรณ์ / เครื่องจักร', r.Equipment)}
          ${row('รายละเอียดอันตราย', r.HazardDescription, true)}
          ${row('Safety Unit', r.SafetyUnit)}
          ${row('วิธีที่อาจเกิดอันตราย', r.HowItHappened, true)}
          ${row('อวัยวะที่เสี่ยง', r.BodyPart)}
          ${row('ข้อเสนอแนะ', r.Suggestion, true)}
        </div>
        ${renderWorkerAttachmentGallery(r)}
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
          ${canManageWorkerRecord(r) ? `<button onclick="closeModal();window._cccfEditWorker(${r.id})"
            class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-emerald-600 hover:bg-emerald-50 border border-emerald-100 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            แก้ไข
          </button>` : ''}
          ${canManageWorkerRecord(r) ? `<button onclick="closeModal();window._cccfDeleteWorker(${r.id})"
            class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-100 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            ลบ
          </button>` : ''}
        </div>
      </div>`, 'max-w-lg');
};
window._cccfShowPermanentDetail = (id) => {
    const r = _permanentData.find(x => x.id == id); if (!r) return;
    const dateStr = r.SubmitDate ? new Date(r.SubmitDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const safeFileUrl = sanitizeUrl(getPermanentDisplayFileUrl(r));
    const stop = STOP_TYPES.find(x => +x.id === +r.StopType) || null;
    const rank = RANKS.find(x => x.rank === r.Rank) || null;
    const status = getPermanentStatusMeta(r);
    const isCompleted = String(r.ReviewStatus || '') === 'Completed';
    const canUploadSigned = r.ReviewStatus === 'Approved' && (isAdmin || String(r.AssigneeID || '') === String(currentUser.id || ''));
    const canAdminComplete = isAdmin && !isCompleted && (r.SignedFileUrl || r.DocumentMode === 'direct_signed');
    openModal('รายละเอียด CCCF Form A — Permanent', `
      <div class="space-y-4 px-1">
        <div class="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
          <div class="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg class="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <div>
            <p class="text-[10px] font-black uppercase text-emerald-600">${escapeHtml(getPermanentNumber(r))}</p>
            <p class="font-bold text-sm text-emerald-800">${escapeHtml(r.JobArea || '—')}</p>
            <p class="text-xs text-slate-500 mt-0.5">ส่งโดย ${escapeHtml(r.SubmitterName || '—')} · ${escapeHtml(dateStr)}</p>
          </div>
          <span class="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${status.className}">
            <span class="h-1.5 w-1.5 rounded-full ${status.dotClass}"></span>${escapeHtml(status.label)}
          </span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">หมายเลข CCCF</p><p class="text-sm font-black text-emerald-700">${escapeHtml(getPermanentNumber(r))}</p></div>
          <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">ชื่อผู้ส่ง</p><p class="text-sm text-slate-700">${escapeHtml(r.SubmitterName || '—')}</p></div>
          <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">หน่วยงาน</p><p class="text-sm text-slate-700">${escapeHtml(r.Department || '—')}</p></div>
          <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">ชื่องาน / พื้นที่</p><p class="text-sm text-slate-700">${escapeHtml(r.JobArea || '—')}</p></div>
          <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">วันที่ส่ง</p><p class="text-sm text-slate-700">${escapeHtml(dateStr)}</p></div>
          ${r.Summary ? `<div class="col-span-2"><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">สรุปการดำเนินการ</p><p class="text-sm text-slate-700">${escapeHtml(r.Summary)}</p></div>` : ''}
          <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Stop Type</p><p class="text-sm text-slate-700">${escapeHtml(stop?.code || '—')}</p></div>
          <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Rank</p><p class="text-sm text-slate-700">${escapeHtml(rank?.label || '—')}</p></div>
          <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Document Mode</p><p class="text-sm text-slate-700">${escapeHtml(r.DocumentMode || 'legacy')}</p></div>
          <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Review Status</p><p class="text-sm text-slate-700">${escapeHtml(r.ReviewStatus || '—')}</p></div>
          ${r.ReviewComment ? `<div class="col-span-2"><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Review Comment</p><p class="text-sm text-slate-700">${escapeHtml(r.ReviewComment)}</p></div>` : ''}
        </div>
        ${isCompleted ? `<div class="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <p class="text-sm font-black text-emerald-800">ปิดงานแล้ว</p>
          <p class="mt-1 text-xs text-emerald-700">ปิดโดย ${escapeHtml(r.ReviewedBy || r.CompletedBy || 'Admin')} ${r.ReviewedAt || r.CompletedAt ? `· ${escapeHtml(r.ReviewedAt || r.CompletedAt)}` : ''}</p>
          ${r.ReviewComment ? `<p class="mt-2 text-xs text-emerald-700">${escapeHtml(r.ReviewComment)}</p>` : ''}
        </div>` : ''}
        ${safeFileUrl ? `<div class="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
          <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">${escapeHtml(getFileNameFromUrl(safeFileUrl))}</p>
          ${renderFileActions(safeFileUrl)}
        </div>` : ''}
        <div class="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
          ${canUploadSigned ? `<button onclick="closeModal();window._cccfUploadSignedPdf(${r.id})" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-sky-700 hover:bg-sky-50 border border-sky-100 transition-colors">
            ส่ง PDF หลังผ่านการตรวจ
          </button>` : ''}
          ${isAdmin && r.ReviewStatus === 'PendingReview' ? `<button onclick="closeModal();window._cccfReviewPermanent(${r.id}, 'Approved')" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border border-emerald-100 transition-colors">
            Approve Excel
          </button>
          <button onclick="closeModal();window._cccfReviewPermanent(${r.id}, 'Rejected')" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-rose-100 transition-colors">
            Reject Excel
          </button>` : ''}
          ${canAdminComplete ? `<button onclick="closeModal();window._cccfCompletePermanent(${r.id})" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-indigo-700 hover:bg-indigo-50 border border-indigo-100 transition-colors">
            ปิดงาน / แจ้ง User
          </button>` : ''}
        ${isAdmin ? `
          <button onclick="closeModal();window._cccfEditPermanent(${r.id})" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-emerald-600 hover:bg-emerald-50 border border-emerald-100 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            แก้ไข
          </button>
          <button onclick="closeModal();window._cccfDeletePermanent(${r.id})" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-100 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            ลบรายการนี้
          </button>
        ` : ''}
        </div>
      </div>`, 'max-w-lg');
};

window._cccfReviewPermanent = (id, reviewStatus) => {
    const record = _permanentData.find(x => String(x.id) === String(id));
    if (!record) return;
    const isRejected = reviewStatus === 'Rejected';
    openModal(isRejected ? 'Reject Excel / ตีกลับให้แก้ไข' : 'Approve Excel / อนุมัติให้ส่ง PDF', `
      <div class="space-y-4">
        <div class="rounded-xl border ${isRejected ? 'border-rose-100 bg-rose-50 text-rose-800' : 'border-emerald-100 bg-emerald-50 text-emerald-800'} px-4 py-3">
          <p class="text-sm font-bold">${escapeHtml(record.JobArea || 'CCCF Form A Permanent')}</p>
          <p class="mt-1 text-xs">${isRejected ? 'ระบุเหตุผลให้ผู้รับผิดชอบแก้ไขไฟล์ Excel' : 'ยืนยันว่าไฟล์ Excel ผ่านการตรวจแล้ว และให้ผู้รับผิดชอบส่ง PDF ที่ลงนามแล้ว'}</p>
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-bold text-slate-500">หมายเหตุถึงผู้รับผิดชอบ ${isRejected ? '<span class="text-red-500">*</span>' : ''}</label>
          <textarea id="cccf-review-comment" rows="4" class="form-input w-full resize-none rounded-xl text-sm" placeholder="${isRejected ? 'เช่น กรุณาแก้ไขข้อมูลในช่อง...' : 'เช่น ตรวจสอบแล้ว ข้อมูลครบถ้วน สามารถพิมพ์ลงนามและส่ง PDF ได้'}"></textarea>
        </div>
        <div class="flex justify-end gap-2 border-t border-slate-100 pt-2">
          <button type="button" onclick="closeModal()" class="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
          <button id="cccf-submit-review" type="button" class="rounded-xl px-5 py-2 text-sm font-bold text-white" style="background:${isRejected ? '#e11d48' : 'linear-gradient(135deg,#059669,#0d9488)'}">${isRejected ? 'Reject Excel' : 'Approve Excel'}</button>
        </div>
      </div>`, 'max-w-lg');
    document.getElementById('cccf-submit-review')?.addEventListener('click', guardActionHandler(async e => {
        const btn = e.currentTarget;
        const comment = document.getElementById('cccf-review-comment')?.value.trim() || '';
        if (isRejected && !comment) { showToast('กรุณาระบุเหตุผลเมื่อ Reject', 'error'); return; }
        btn.disabled = true;
        showLoading('กำลังบันทึกผลการตรวจ...');
        try {
            await API.post(`/cccf/form-a-permanent/${id}/review`, { ReviewStatus: reviewStatus, ReviewComment: comment });
            closeModal();
            showToast('บันทึกผลการตรวจสำเร็จ', 'success');
            await loadCccfPage();
        } catch (err) { showError(err); } finally { hideLoading(); btn.disabled = false; }
    }));
};

window._cccfUploadSignedPdf = (id) => {
    const record = _permanentData.find(x => String(x.id) === String(id));
    if (!record) return;
    openModal('ส่ง PDF หลังผ่านการตรวจ', `
      <div class="space-y-4">
        <div class="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sky-800">
          <p class="text-sm font-bold">${escapeHtml(record.JobArea || 'CCCF Form A Permanent')}</p>
          <p class="mt-1 text-xs">อัปโหลดไฟล์ PDF ที่พิมพ์และลงนามแล้ว เพื่อปิดขั้นตอนเอกสาร</p>
        </div>
        <input type="file" id="cccf-signed-pdf-file" accept=".pdf"
          class="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-sky-700 hover:file:bg-sky-100">
        <div class="flex justify-end gap-2 border-t border-slate-100 pt-2">
          <button type="button" onclick="closeModal()" class="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
          <button id="cccf-submit-signed-pdf" type="button" class="rounded-xl px-5 py-2 text-sm font-bold text-white" style="background:linear-gradient(135deg,#0284c7,#0d9488)">อัปโหลด PDF</button>
        </div>
      </div>`, 'max-w-lg');
    document.getElementById('cccf-submit-signed-pdf')?.addEventListener('click', guardActionHandler(async e => {
        const btn = e.currentTarget;
        const fileEl = document.getElementById('cccf-signed-pdf-file');
        if (!fileEl?.files?.length) { showToast('กรุณาเลือกไฟล์ PDF', 'error'); return; }
        btn.disabled = true;
        showLoading('กำลังอัปโหลด PDF...');
        try {
            const fd = new FormData();
            fd.append('FormFile', fileEl.files[0]);
            await API.post(`/cccf/form-a-permanent/${id}/signed-file`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            closeModal();
            showToast('อัปโหลด PDF ที่ลงนามแล้วสำเร็จ', 'success');
            await loadCccfPage();
        } catch (err) { showError(err); } finally { hideLoading(); btn.disabled = false; }
    }));
};

window._cccfCompletePermanent = (id) => {
    const record = _permanentData.find(x => String(x.id) === String(id));
    if (!record) return;
    const owner = getPermanentOwnerInfo(record);
    openModal('ปิดงาน CCCF Permanent', `
      <div class="space-y-4">
        <div class="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-indigo-800">
          <p class="text-sm font-bold">${escapeHtml(record.JobArea || 'CCCF Form A Permanent')}</p>
          <p class="mt-1 text-xs">ยืนยันว่าเอกสาร PDF ลงนามถูกต้องและปิดงานเป็น Complete พร้อมแจ้งผู้รับผิดชอบ</p>
        </div>
        <div id="cccf-complete-recipient" class="rounded-xl border ${owner.email ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-amber-100 bg-amber-50 text-amber-800'} px-4 py-3">
          <p class="text-[10px] font-black uppercase tracking-wider">${owner.email ? 'Completion email recipient' : 'Recipient email missing'}</p>
          <p class="mt-1 text-sm font-bold">${escapeHtml(owner.name || record.SubmitterName || 'ไม่พบชื่อผู้รับผิดชอบ')}</p>
          <p class="mt-0.5 text-xs">${escapeHtml(owner.department || record.Department || '—')} ${owner.employeeId ? `· ${escapeHtml(owner.employeeId)}` : ''}</p>
          <p class="mt-1 text-xs font-semibold">${owner.email ? escapeHtml(owner.email) : 'ยังไม่มี CompanyEmail ใน Employee Master ระบบจะปิดงานได้ แต่จะไม่ส่งเมลแทนไปหาแอดมิน'}</p>
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-bold text-slate-500">หมายเหตุปิดงาน</label>
          <textarea id="cccf-complete-comment" rows="3" class="form-input w-full resize-none rounded-xl text-sm" placeholder="เช่น ตรวจสอบ PDF ลงนามแล้ว เอกสารครบถ้วน"></textarea>
        </div>
        <div class="flex justify-end gap-2 border-t border-slate-100 pt-2">
          <button type="button" onclick="closeModal()" class="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
          <button id="cccf-submit-complete" type="button" class="rounded-xl px-5 py-2 text-sm font-bold text-white" style="background:linear-gradient(135deg,#4f46e5,#0d9488)">ปิดงาน</button>
        </div>
      </div>`, 'max-w-lg');
    document.getElementById('cccf-submit-complete')?.addEventListener('click', guardActionHandler(async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        showLoading('กำลังปิดงาน...');
        try {
            const res = await API.post(`/cccf/form-a-permanent/${id}/complete`, {
                CompleteComment: document.getElementById('cccf-complete-comment')?.value.trim() || '',
            });
            closeModal();
            if (res?.alreadyCompleted) {
                showToast('รายการนี้ปิดงานแล้ว', 'info');
            } else if (res?.recipientEmail) {
                showToast(`ปิดงานแล้ว และบันทึกเมลถึง ${res.recipientEmail}`, 'success');
            } else {
                showToast('ปิดงานแล้ว แต่ไม่พบอีเมลผู้รับผิดชอบใน Employee Master', 'warning');
            }
            await loadCccfPage();
        } catch (err) { showError(err); } finally { hideLoading(); btn.disabled = false; }
    }));
};
window._cccfOpenDeptFilter = () => {
    // จัดกลุ่ม unit ตาม department
    const deptMap = {};
    _safetyUnits.forEach(u => {
        const dName = u.DeptName || 'ไม่ระบุแผนก';
        if (!deptMap[dName]) deptMap[dName] = [];
        deptMap[dName].push(u.name);
    });
    const sel = _cccfUnitSel || [];
    const grouped = Object.entries(deptMap).sort(([a],[b]) => a.localeCompare(b));

    openModal('เลือก Unit ที่แสดงในสรุป', `
      <div class="space-y-3 px-1">
        <p class="text-xs text-slate-500">Admin เลือก Unit ที่ต้องการแสดงในตารางสรุป (ไม่เลือก = แสดงทั้งหมดที่มีข้อมูล)</p>
        <div class="flex gap-2 mb-2">
          <button onclick="document.querySelectorAll('.cccf-unit-chk').forEach(c=>c.checked=true)" class="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 transition-colors">เลือกทั้งหมด</button>
          <button onclick="document.querySelectorAll('.cccf-unit-chk').forEach(c=>c.checked=false)" class="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200 transition-colors">ล้างทั้งหมด</button>
        </div>
        <div class="max-h-72 overflow-y-auto space-y-3 pr-1">
          ${grouped.map(([dept, units]) => `
          <div>
            <p class="text-[10px] font-bold text-slate-400 uppercase px-1 mb-1">${escapeHtml(dept)}</p>
            <div class="space-y-1">
              ${units.map(uName => `
              <label class="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/40 cursor-pointer transition-all">
                <input type="checkbox" class="cccf-unit-chk w-4 h-4 rounded accent-emerald-600" value="${escapeAttr(uName)}" ${sel.includes(uName) ? 'checked' : ''}>
                <span class="text-sm text-slate-700">${escapeHtml(uName)}</span>
              </label>`).join('')}
            </div>
          </div>`).join('')}
          ${grouped.length === 0 ? '<p class="text-xs text-center text-slate-400 py-4">ยังไม่มีข้อมูล Safety Unit ในระบบ</p>' : ''}
        </div>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onclick="closeModal()" class="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
          <button id="btn-save-unit-sel" class="px-5 py-2 rounded-xl text-sm font-bold text-white transition-all" style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก</button>
        </div>
      </div>`, 'max-w-sm');

    document.getElementById('btn-save-unit-sel')?.addEventListener('click', guardActionHandler(async () => {
        const checked = [...document.querySelectorAll('.cccf-unit-chk:checked')].map(c => c.value);
        showLoading('กำลังบันทึก...');
        try {
            await API.put('/settings/cccf_unit_sel', { value: checked.length ? JSON.stringify(checked) : null });
            _cccfUnitSel = checked.length ? checked : null;
            closeModal();
            const inner = document.getElementById('cccf-unit-summary-inner');
            if (inner) { inner.innerHTML = renderUnitSummary(); setTimeout(() => initUnitChart(), 0); }
        } catch (err) { showError(err); } finally { hideLoading(); }
    }));
};

// ─── Edit Worker (own record) ─────────────────────────────────────────────────
window._cccfEditWorker = (id) => {
    const r = _workerData.find(x => x.id == id); if (!r) return;
    const selectableUnitField = _safetyUnits.length
        ? `<select name="SafetyUnit" class="form-input w-full rounded-xl text-sm" required>
             <option value="">— เลือก Unit —</option>
             ${_safetyUnits.map(u => `<option value="${escapeAttr(u.name)}" ${u.name === r.SafetyUnit ? 'selected' : ''}>${escapeHtml(u.name)}${u.DeptName ? ` (${escapeHtml(u.DeptName)})` : ''}</option>`).join('')}
           </select>`
        : `<input type="text" name="SafetyUnit" class="form-input w-full rounded-xl text-sm" required value="${escapeAttr(r.SafetyUnit || '')}">`;
    const unitField = isAdmin
        ? selectableUnitField
        : lockedWorkerUnitField(r.SafetyUnit, 'Unit ของรายการเดิมถูกล็อกไว้ หากต้องแก้ไขกรุณาติดต่อ Admin');

    const dateVal = r.SubmitDate ? r.SubmitDate.split('T')[0] : '';
    openModal('แก้ไข CCCF Form A — Worker', `
      <form id="cccf-edit-worker-form" class="space-y-5 px-1" novalidate>

        <!-- ข้อมูลพนักงาน -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">1</span>
            <span class="text-xs font-bold text-slate-700">ข้อมูลพนักงาน</span>
          </div>
          <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ชื่อพนักงาน</label>
              <input type="text" class="form-input w-full rounded-xl text-sm bg-slate-50 text-slate-500 cursor-not-allowed" readonly value="${escapeAttr(r.EmployeeName || '')}">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">วันที่ลงข้อมูล <span class="text-red-500">*</span></label>
              <input type="date" name="SubmitDate" class="form-input w-full rounded-xl text-sm" required value="${escapeAttr(dateVal)}">
            </div>
            <div class="col-span-2">
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Safety Unit <span class="text-red-500">*</span></label>
              ${unitField}
            </div>
          </div>
        </div>

        <!-- พื้นที่ทำงาน -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">2</span>
            <span class="text-xs font-bold text-slate-700">พื้นที่ทำงาน / อุปกรณ์</span>
          </div>
          <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">พื้นที่ / ชื่องาน <span class="text-red-500">*</span></label>
              <input type="text" name="JobArea" class="form-input w-full rounded-xl text-sm" required value="${escapeAttr(r.JobArea || '')}">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">อุปกรณ์ / เครื่องจักร</label>
              <input type="text" name="Equipment" class="form-input w-full rounded-xl text-sm" value="${escapeAttr(r.Equipment || '')}">
            </div>
          </div>
        </div>

        <!-- รายละเอียดอันตราย -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">3</span>
            <span class="text-xs font-bold text-slate-700">รายละเอียดอันตราย <span class="text-red-500">*</span></span>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">อธิบายอันตรายที่พบ <span class="text-red-500">*</span></label>
              <textarea name="HazardDescription" rows="2" class="form-input w-full rounded-xl text-sm resize-none" required>${escapeHtml(r.HazardDescription || '')}</textarea>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">วิธีที่อาจเกิดอันตราย</label>
                <textarea name="HowItHappened" rows="2" class="form-input w-full rounded-xl text-sm resize-none">${escapeHtml(r.HowItHappened || '')}</textarea>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">อวัยวะที่เสี่ยง</label>
                <input type="text" name="BodyPart" class="form-input w-full rounded-xl text-sm" value="${escapeAttr(r.BodyPart || '')}">
              </div>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ข้อเสนอแนะการแก้ไข</label>
              <textarea name="Suggestion" rows="2" class="form-input w-full rounded-xl text-sm resize-none">${escapeHtml(r.Suggestion || '')}</textarea>
            </div>
          </div>
        </div>

        <!-- Stop Type -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">4</span>
            <span class="text-xs font-bold text-slate-700">ประเภทอันตราย (Stop Type) <span class="text-red-500">*</span></span>
          </div>
          <div class="p-4 grid grid-cols-2 gap-2">
            ${STOP_TYPES.map(s => `
            <label class="cursor-pointer">
              <input type="radio" name="StopType" value="${s.id}" class="peer hidden" required ${r.StopType == s.id ? 'checked' : ''}>
              <div class="flex items-center gap-2.5 p-3 rounded-xl border-2 border-slate-100 hover:border-slate-200 peer-checked:border-current transition-all">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background:${s.bg}">
                  <svg class="w-4 h-4" style="color:${s.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${s.icon}"/></svg>
                </div>
                <div class="min-w-0">
                  <p class="text-[10px] font-bold" style="color:${s.color}">${s.code}</p>
                  <p class="text-[10px] text-slate-600 leading-snug">${s.label}</p>
                </div>
              </div>
            </label>`).join('')}
          </div>
        </div>

        <!-- Rank -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">5</span>
            <span class="text-xs font-bold text-slate-700">ระดับความรุนแรง (Rank) <span class="text-red-500">*</span></span>
          </div>
          <div class="p-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            ${RANKS.map(rk => `
            <label class="cursor-pointer">
              <input type="radio" name="Rank" value="${rk.rank}" class="peer hidden" required ${r.Rank === rk.rank ? 'checked' : ''}>
              <div class="p-3 rounded-xl border-2 text-center border-slate-100 peer-checked:border-current hover:border-slate-200 transition-all">
                <div class="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center text-sm font-black text-white" style="background:${rk.color}">${rk.rank}</div>
                <p class="text-[10px] font-bold" style="color:${rk.color}">${rk.label}</p>
                <p class="text-[9px] text-slate-500 mt-0.5 leading-snug">${rk.desc}</p>
              </div>
            </label>`).join('')}
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
          <button type="submit" id="btn-save-edit-worker" class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:shadow-md transition-all" style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึกการแก้ไข</button>
        </div>
      </form>`, 'max-w-2xl');

    document.getElementById('cccf-edit-worker-form')?.addEventListener('submit', guardSubmitHandler(async e => {
        e.preventDefault();
        if (!e.target.StopType.value) { showToast('กรุณาเลือกประเภทอันตราย', 'error'); return; }
        if (!e.target.Rank.value)     { showToast('กรุณาเลือกระดับความรุนแรง', 'error'); return; }
        const btn = document.getElementById('btn-save-edit-worker');
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span>กำลังบันทึก...';
        showLoading('กำลังบันทึก...');
        try {
            const data = Object.fromEntries(new FormData(e.target).entries());
            await API.put(`/cccf/form-a-worker/${id}`, data);
            closeModal();
            showToast('แก้ไขสำเร็จ', 'success');
            loadCccfPage();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; btn.textContent = 'บันทึกการแก้ไข'; }
    }));
};

// ─── Main Loader ──────────────────────────────────────────────────────────────
export async function loadCccfPage() {
    const container = document.getElementById('cccf-page');
    if (!container) return;
    // The CCCF module is imported before login. Re-read the verified session on
    // every page load so a same-page login/logout never leaves stale privileges.
    refreshCccfAuthContext();
    const request = createLatestRequestController('cccf:page-load');
    container.innerHTML = pageSkeleton({ label: 'กำลังโหลดข้อมูล CCCF', cards: 3, rows: 6 });
    try {
        const [workerRes, permanentRes, deptRes, empRes, assignRes, formsRes, unitsRes, unitTgtRes, targetSummaryRes, workerProgressRes, settingRes, emailPolicyRes, dashboardConfigRes, myTargetsRes] = await Promise.all([
            API.get('/cccf/form-a-worker').catch(() => []),
            API.get('/cccf/form-a-permanent').catch(() => []),
            API.get('/master/departments').catch(() => ({ data: [] })),
            API.get('/employees').catch(() => ({ data: [] })),
            API.get('/cccf/assignments').catch(() => []),
            API.get(isAdmin ? '/module-forms?module=cccf&all=1' : '/module-forms?module=cccf').catch(() => ({ data: [] })),
            API.get('/master/safety-units').catch(() => ({ data: [] })),
            API.get('/cccf/unit-targets').catch(() => []),
            API.get(`/cccf/target-summary?year=${_unitYear}`).catch(() => ({ data: null })),
            API.get(`/cccf/worker-progress?year=${_unitYear}`).catch(() => ({ data: null })),
            API.get('/settings/cccf_unit_sel').catch(() => ({ value: null })),
            API.get('/settings/cccf_require_company_email').catch(() => ({ value: null })),
            API.get('/dashboard/config').catch(() => ({ data: {} })),
            API.get('/activity-targets/me').catch(() => ({ data: null })),
        ]);
        if (!request.isLatest()) return;
        _workerData    = (Array.isArray(workerRes)    ? workerRes    : workerRes?.data    ?? [])
            .map(r => ({ ...r, SafetyUnit: normalizeUnitName(r.SafetyUnit) }));
        _permanentData = Array.isArray(permanentRes) ? permanentRes : permanentRes?.data ?? [];
        _departments   = Array.isArray(deptRes)      ? deptRes      : deptRes?.data      ?? [];
        _employees     = Array.isArray(empRes)       ? empRes       : empRes?.data       ?? [];
        _assignments   = Array.isArray(assignRes)    ? assignRes    : assignRes?.data    ?? [];
        _cccfForms     = Array.isArray(formsRes)     ? formsRes     : formsRes?.data     ?? [];
        _safetyUnits   = (Array.isArray(unitsRes)     ? unitsRes     : unitsRes?.data     ?? [])
            .map(u => ({ ...u, name: normalizeUnitName(u.name) }))
            .filter(u => u.name);
        _unitTargets   = (Array.isArray(unitTgtRes)   ? unitTgtRes   : unitTgtRes?.data   ?? [])
            .map(t => ({ ...t, unit_name: normalizeUnitName(t.unit_name) }));
        _cccfTargetSummary = targetSummaryRes?.data || null;
        _cccfWorkerProgress = workerProgressRes?.data || null;
        const myWorkerMetric = (myTargetsRes?.data?.targets || []).find(t =>
            t.activityKey === 'cccf_worker' && t.calculationScope?.type === 'employee'
        );
        _myWorkerTarget = Number(myWorkerMetric?.yearlyTarget || 0) > 0
            ? Number(myWorkerMetric.yearlyTarget)
            : null;
        _dashboardConfig = dashboardConfigRes?.data || dashboardConfigRes || {};
        _cccfWorkerSource = resolveCccfWorkerSource(_dashboardConfig, _unitYear);
        try {
            const savedUnits = settingRes?.value ? JSON.parse(settingRes.value) : null;
            _cccfUnitSel = Array.isArray(savedUnits)
                ? savedUnits.map(normalizeUnitName).filter(Boolean)
                : null;
        } catch { _cccfUnitSel = null; }
        _cccfRequireCompanyEmail = ['1', 'true', 'yes', 'on'].includes(String(emailPolicyRes?.value || '').trim().toLowerCase());

        const savedTab = window._getTab?.('cccf', 'worker');
        _activeCccfTab = savedTab === 'permanent' ? 'permanent' : 'worker';
        renderPage(container);
        setupCccfCardImageExport();
        if (savedTab !== 'worker') window._cccfSwitchTab?.(savedTab);
    } catch (err) {
        if (!request.isLatest()) return;
        console.error(err);
        container.innerHTML = `<div class="p-6 text-center text-red-500 text-sm">${escapeHtml(err.message)}</div>`;
    } finally { request.finish(); }
}

// ─── Computed helpers ─────────────────────────────────────────────────────────
function getFilteredWorker() {
    return _workerData.filter(r => {
        if (new Date(r.SubmitDate).getFullYear() !== Number(_unitYear)) return false;
        if (_wFilterDept && r.Department !== _wFilterDept) return false;
        if (_wFilterUnit && (r.SafetyUnit || 'ไม่ระบุ') !== _wFilterUnit) return false;
        if (_wFilterRank && r.Rank !== _wFilterRank) return false;
        if (_wFilterStop && r.StopType != _wFilterStop) return false;
        const attachmentCount = getWorkerAttachments(r).length;
        if (_wFilterPhoto === 'with' && attachmentCount === 0) return false;
        if (_wFilterPhoto === 'without' && attachmentCount > 0) return false;
        if (_wSearch) {
            const q = _wSearch.toLowerCase();
            if (!(r.EmployeeName||'').toLowerCase().includes(q) &&
                !(r.HazardDescription||'').toLowerCase().includes(q) &&
                !(r.JobArea||'').toLowerCase().includes(q)) return false;
        }
        return true;
    });
}

function getPagedWorker(filtered) {
    if (_wPageSize === 'all') return filtered;
    const size = Number(_wPageSize || 10);
    const start = _wPage * size;
    return filtered.slice(start, start + size);
}

function getPagedPermanent(filtered) {
    const start = _pPage * P_PAGE_SIZE;
    return filtered.slice(start, start + P_PAGE_SIZE);
}

function formatThaiDate(value, opts = { day: 'numeric', month: 'short', year: '2-digit' }) {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('th-TH', opts);
}

function getDueMeta(dueDate, statusKey = '') {
    if (!dueDate) {
        return {
            key: 'no_due',
            label: 'No Due Date',
            className: 'bg-slate-50 text-slate-500 border-slate-200',
        };
    }
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
        return {
            key: 'no_due',
            label: 'No Due Date',
            className: 'bg-slate-50 text-slate-500 border-slate-200',
        };
    }
    if (statusKey === 'complete') {
        return {
            key: 'done',
            label: `Due ${formatThaiDate(dueDate)}`,
            className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const days = Math.ceil((due - today) / 86400000);
    if (days < 0) {
        return {
            key: 'overdue',
            label: `Overdue ${Math.abs(days)} วัน`,
            className: 'bg-rose-50 text-rose-700 border-rose-100',
        };
    }
    if (days <= 7) {
        return {
            key: 'due_soon',
            label: days === 0 ? 'Due Today' : `Due in ${days} วัน`,
            className: 'bg-amber-50 text-amber-700 border-amber-100',
        };
    }
    return {
        key: 'scheduled',
        label: `Due ${formatThaiDate(dueDate)}`,
        className: 'bg-sky-50 text-sky-700 border-sky-100',
    };
}

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function getPermanentStatusMeta(submission) {
    if (!submission) {
        return {
            key: 'must_send',
            label: 'ต้องส่ง',
            className: 'bg-rose-50 text-rose-700 border border-rose-100',
            dotClass: 'bg-rose-500',
        };
    }
    const reviewStatus = String(submission.ReviewStatus || '').trim();
    if (reviewStatus === 'PendingReview') {
        return {
            key: 'pending_review',
            label: 'รอตรวจ Excel',
            className: 'bg-amber-50 text-amber-700 border border-amber-100',
            dotClass: 'bg-amber-400',
        };
    }
    if (reviewStatus === 'Approved') {
        return {
            key: 'approved',
            label: 'รอ PDF ลงนาม',
            className: 'bg-sky-50 text-sky-700 border border-sky-100',
            dotClass: 'bg-sky-500',
        };
    }
    if (reviewStatus === 'Rejected') {
        return {
            key: 'rejected',
            label: 'ต้องแก้ Excel',
            className: 'bg-rose-50 text-rose-700 border border-rose-100',
            dotClass: 'bg-rose-500',
        };
    }
    if (reviewStatus === 'Completed') {
        return {
            key: 'complete',
            label: 'ปิดงานแล้ว',
            className: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
            dotClass: 'bg-emerald-500',
        };
    }
    if (submission.FileUrl) {
        return {
            key: 'complete',
            label: 'Complete',
            className: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
            dotClass: 'bg-emerald-500',
        };
    }
    return {
        key: 'onprocess',
        label: 'On Process',
        className: 'bg-amber-50 text-amber-700 border border-amber-100',
        dotClass: 'bg-amber-400',
    };
}

function getPermanentDisplayFileUrl(record) {
    return record?.SignedFileUrl || record?.ExcelFileUrl || record?.FileUrl || '';
}

function getPermanentOwnerEmail(employeeId) {
    const target = String(employeeId || '').trim();
    const employee = getEmployeeById(target) || _assignments.find(a => String(a.EmployeeID || '').trim() === target);
    return String(employee?.CompanyEmail || '').trim();
}

function getPermanentOwnerInfo(record = {}) {
    const target = String(record?.AssigneeID || '').trim();
    const owner = target
        ? (getEmployeeById(target) || _assignments.find(a => String(a.EmployeeID || '').trim() === target) || null)
        : null;
    return {
        employeeId: target,
        name: owner?.EmployeeName || owner?.AssigneeName || record?.SubmitterName || '',
        department: owner?.Department || record?.Department || '',
        email: String(owner?.CompanyEmail || '').trim(),
    };
}

function canDirectSignedPdf(employeeId) {
    const target = String(employeeId || '').trim();
    if (!target) return false;
    return _assignments.some(a => String(a.EmployeeID || '').trim() === target && Number(a.AllowDirectSignedPdf || 0) === 1);
}

function getApprovedPermanentRecordsForOwner(employeeId) {
    const target = String(employeeId || '').trim();
    return [..._permanentData]
        .filter(row => String(row?.ReviewStatus || '').trim() === 'Approved')
        .filter(row => isAdmin || (target && String(row?.AssigneeID || '').trim() === target))
        .sort((a, b) => new Date(b.SubmitDate || b.CreatedAt || 0) - new Date(a.SubmitDate || a.CreatedAt || 0));
}

function getLatestPermanentForAssignment(assignment) {
    const employeeId = String(assignment?.EmployeeID || '').trim();
    const assigneeName = normalizeText(assignment?.AssigneeName);
    const department = normalizeText(assignment?.Department);

    return [..._permanentData]
        .filter(row => {
            const rowAssigneeId = String(row?.AssigneeID || '').trim();
            if (employeeId && rowAssigneeId) return rowAssigneeId === employeeId;
            return normalizeText(row?.SubmitterName) === assigneeName
                && normalizeText(row?.Department) === department;
        })
        .sort((a, b) => new Date(b.SubmitDate || b.CreatedAt || 0) - new Date(a.SubmitDate || a.CreatedAt || 0))[0] || null;
}

function buildPermanentTrackingRows() {
    const rows = [];
    const matchedSubmissionIds = new Set();

    _assignments.forEach(assignment => {
        const submission = getLatestPermanentForAssignment(assignment);
        if (submission?.id != null) matchedSubmissionIds.add(submission.id);
        const status = getPermanentStatusMeta(submission);
        const due = getDueMeta(assignment?.DueDate, status.key);
        rows.push({
            rowType: 'assigned',
            assignment,
            submission,
            id: submission?.id || null,
            PermanentYear: submission?.PermanentYear || null,
            PermanentSeq: submission?.PermanentSeq || null,
            PermanentNo: submission?.PermanentNo || '',
            displayName: assignment?.AssigneeName || submission?.SubmitterName || '—',
            Department: assignment?.Department || submission?.Department || '—',
            JobArea: submission?.JobArea || '',
            Summary: submission?.Summary || '',
            StopType: submission?.StopType || null,
            Rank: submission?.Rank || '',
            FileUrl: submission?.FileUrl || '',
            SubmitDate: submission?.SubmitDate || null,
            DueDate: assignment?.DueDate || null,
            AssignmentNote: assignment?.Note || '',
            status,
            due,
        });
    });

    _permanentData.forEach(submission => {
        if (matchedSubmissionIds.has(submission.id)) return;
        rows.push({
            rowType: 'submitted',
            assignment: null,
            submission,
            id: submission.id,
            PermanentYear: submission?.PermanentYear || null,
            PermanentSeq: submission?.PermanentSeq || null,
            PermanentNo: submission?.PermanentNo || '',
            displayName: submission?.SubmitterName || '—',
            Department: submission?.Department || '—',
            JobArea: submission?.JobArea || '',
            Summary: submission?.Summary || '',
            StopType: submission?.StopType || null,
            Rank: submission?.Rank || '',
            FileUrl: submission?.FileUrl || '',
            SubmitDate: submission?.SubmitDate || null,
            status: getPermanentStatusMeta(submission),
            DueDate: null,
            AssignmentNote: '',
            due: getDueMeta(null, getPermanentStatusMeta(submission).key),
        });
    });

    const statusOrder = { must_send: 0, rejected: 1, pending_review: 2, approved: 3, onprocess: 4, complete: 5 };
    return rows.sort((a, b) => {
        const typeDelta = (a.rowType === 'assigned' ? 0 : 1) - (b.rowType === 'assigned' ? 0 : 1);
        if (typeDelta !== 0) return typeDelta;
        const statusDelta = (statusOrder[a.status.key] ?? 9) - (statusOrder[b.status.key] ?? 9);
        if (statusDelta !== 0) return statusDelta;
        const dateDelta = new Date(b.SubmitDate || 0) - new Date(a.SubmitDate || 0);
        if (dateDelta !== 0) return dateDelta;
        const deptDelta = String(a.Department || '').localeCompare(String(b.Department || ''));
        if (deptDelta !== 0) return deptDelta;
        return String(a.displayName || '').localeCompare(String(b.displayName || ''));
    });
}

function getFilteredPermanent() {
    return buildPermanentTrackingRows().filter(r => {
        if (_pFilterDept && r.Department !== _pFilterDept) return false;
        if (_pFilterStatus && r.status.key !== _pFilterStatus) return false;
        if (_pFilterDue && r.due?.key !== _pFilterDue) return false;
        if (_pFilterRank && r.Rank !== _pFilterRank) return false;
        if (_pFilterStop && +r.StopType !== +_pFilterStop) return false;
        if (_pSearch) {
            const q = _pSearch.toLowerCase();
            if (!(r.displayName||'').toLowerCase().includes(q) &&
                !(r.Department||'').toLowerCase().includes(q) &&
                !(r.PermanentNo||'').toLowerCase().includes(q) &&
                !(r.JobArea||'').toLowerCase().includes(q) &&
                !(r.Summary||'').toLowerCase().includes(q) &&
                !(r.AssignmentNote||'').toLowerCase().includes(q)) return false;
        }
        return true;
    });
}

function renderPermanentStatusFilterChips() {
    const rows = buildPermanentTrackingRows();
    const counts = rows.reduce((acc, row) => {
        acc[row.status.key] = (acc[row.status.key] || 0) + 1;
        return acc;
    }, {});
    const items = [
        { key: '', label: 'ทั้งหมด', count: rows.length },
        { key: 'must_send', label: 'ต้องส่ง', count: counts.must_send || 0 },
        { key: 'pending_review', label: 'รอตรวจ Excel', count: counts.pending_review || 0 },
        { key: 'approved', label: 'รอ PDF', count: counts.approved || 0 },
        { key: 'rejected', label: 'ต้องแก้', count: counts.rejected || 0 },
        { key: 'complete', label: 'ปิดงานแล้ว', count: counts.complete || 0 },
    ];
    return items.map(item => {
        const active = _pFilterStatus === item.key;
        return `<button type="button" data-status="${escapeAttr(item.key)}"
            class="p-status-chip px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-200 hover:text-emerald-700'}">
            ${escapeHtml(item.label)} <span class="${active ? 'text-emerald-100' : 'text-slate-400'}">${item.count}</span>
        </button>`;
    }).join('');
}

function renderPermanentAdminReviewPanel() {
    if (!isAdmin) return '';
    const pendingRows = _permanentData
        .filter(row => String(row.ReviewStatus || '') === 'PendingReview')
        .sort((a, b) => new Date(a.SubmitDate || a.CreatedAt || 0) - new Date(b.SubmitDate || b.CreatedAt || 0));
    const approvedRows = _permanentData
        .filter(row => String(row.ReviewStatus || '') === 'Approved')
        .sort((a, b) => new Date(a.SubmitDate || a.CreatedAt || 0) - new Date(b.SubmitDate || b.CreatedAt || 0));
    const directPdfRows = _assignments.filter(a => Number(a.AllowDirectSignedPdf || 0) === 1);
    const pendingPreview = pendingRows.slice(0, 5).map(row => `
      <div class="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-white px-3 py-2">
        <div class="min-w-0">
          <p class="truncate text-sm font-bold text-slate-800">${escapeHtml(getPermanentNumber(row))} ${escapeHtml(row.JobArea || 'ไม่ระบุงาน')}</p>
          <p class="mt-0.5 text-[11px] text-slate-400">${escapeHtml(row.SubmitterName || '—')} · ${escapeHtml(row.Department || '—')} · ${escapeHtml(row.SubmitDate ? String(row.SubmitDate).split('T')[0] : '—')}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          ${row.ExcelFileUrl ? renderFileActions(row.ExcelFileUrl, { compact: true }) : ''}
          <button onclick="event.stopPropagation();window._cccfReviewPermanent(${row.id}, 'Approved')" class="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100">Approve</button>
          <button onclick="event.stopPropagation();window._cccfReviewPermanent(${row.id}, 'Rejected')" class="rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100">Reject</button>
        </div>
      </div>`).join('');

    return `
    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.8fr)] gap-4" data-cccf-card-image="cccf-permanent-admin-review">
      <div class="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm font-black text-amber-900">Admin Review Queue</p>
            <p class="mt-0.5 text-xs text-amber-700">Excel ที่รอ Safety Admin ตรวจสอบก่อนให้พิมพ์/ลงนาม</p>
          </div>
          <div class="flex items-center gap-2" data-cccf-card-ignore>
            <span class="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-amber-700 border border-amber-100">${pendingRows.length} Pending</span>
            <button type="button" onclick="window._cccfSetPermanentStatus('pending_review')" class="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100">ดูทั้งหมด</button>
          </div>
        </div>
        <div class="mt-3 space-y-2">
          ${pendingRows.length ? pendingPreview : `<div class="rounded-xl border border-dashed border-amber-200 bg-white/70 px-4 py-6 text-center text-sm text-amber-700">ไม่มี Excel รอตรวจในตอนนี้</div>`}
        </div>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <button type="button" onclick="window._cccfSetPermanentStatus('approved')" class="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-left hover:bg-sky-100">
          <p class="text-2xl font-black text-sky-700">${approvedRows.length}</p>
          <p class="mt-1 text-[11px] font-bold text-sky-800">รอ PDF ลงนาม</p>
        </button>
        <button type="button" onclick="window._cccfOpenEmailQueue()" class="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-left hover:bg-indigo-100">
          <p class="text-2xl font-black text-indigo-700">Email</p>
          <p class="mt-1 text-[11px] font-bold text-indigo-800">Outbox / Retry</p>
        </button>
        <button type="button" onclick="window._cccfOpenAssignmentManager()" class="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-left hover:bg-emerald-100">
          <p class="text-2xl font-black text-emerald-700">${directPdfRows.length}</p>
          <p class="mt-1 text-[11px] font-bold text-emerald-800">Direct PDF</p>
        </button>
        <button type="button" onclick="window._cccfToggleEmailPolicy()" class="rounded-2xl border ${_cccfRequireCompanyEmail ? 'border-rose-100 bg-rose-50 hover:bg-rose-100' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'} p-4 text-left">
          <p class="text-2xl font-black ${_cccfRequireCompanyEmail ? 'text-rose-700' : 'text-slate-600'}">${_cccfRequireCompanyEmail ? 'ON' : 'OFF'}</p>
          <p class="mt-1 text-[11px] font-bold ${_cccfRequireCompanyEmail ? 'text-rose-800' : 'text-slate-600'}">Require Email</p>
        </button>
      </div>
    </div>`;
}

// ─── My Card ─────────────────────────────────────────────────────────────────
function renderMyCard() {
    const myAll  = _workerData.filter(r => r.EmployeeID === currentUser.id);
    const currentYr = new Date().getFullYear();
    const myYear = myAll.filter(r => new Date(r.SubmitDate).getFullYear() === _myCardYear);
    const target = _myWorkerTarget;
    const count  = myYear.length;
    const pct    = target ? Math.min(100, Math.round((count / target) * 100)) : 0;
    const done   = !!target && count >= target;

    const ringColor = !target ? '#94a3b8' : done ? '#10b981' : count >= 1 ? '#f59e0b' : '#ef4444';
    const circumference = (2 * Math.PI * 20).toFixed(1);
    const dashOffset = ((1 - pct / 100) * 2 * Math.PI * 20).toFixed(1);
    const yearOpts = [currentYr, currentYr-1, currentYr-2]
        .map(y => `<option value="${y}" ${y === _myCardYear ? 'selected' : ''}>ปี ${y + 543}</option>`).join('');

    const rows = myYear.slice(0, 10).map(r => {
        const rank = RANKS.find(x => x.rank === r.Rank) || RANKS[2];
        const stop = STOP_TYPES.find(x => x.id == r.StopType) || STOP_TYPES[5];
        const dateStr = r.SubmitDate ? new Date(r.SubmitDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
        const desc = (r.HazardDescription || '').slice(0, 50) + ((r.HazardDescription || '').length > 50 ? '…' : '');
        return `<div class="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-emerald-50/40 transition-colors group cursor-pointer"
          onclick="window._cccfShowWorkerDetail(${r.id})">
          <div class="flex flex-col gap-0.5 flex-shrink-0">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border" style="background:${stop.bg};color:${stop.color};border-color:${stop.border}">${stop.code}</span>
            ${r.SafetyUnit ? `<span class="text-[9px] font-semibold text-emerald-600 truncate max-w-[70px]">${escapeHtml(r.SafetyUnit)}</span>` : ''}
          </div>
          <p class="flex-1 text-xs text-slate-600 min-w-0 truncate">${escapeHtml(desc || '—')}</p>
          <span class="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0" style="background:${rank.color}">${rank.rank}</span>
          <span class="text-[10px] text-slate-400 flex-shrink-0 w-16 text-right">${escapeHtml(dateStr)}</span>
          <div class="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            ${canManageWorkerRecord(r) ? `<button onclick="event.stopPropagation();window._cccfEditWorker(${r.id})"
              class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="แก้ไข">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button onclick="event.stopPropagation();window._cccfDeleteWorker(${r.id})"
              class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="ลบ">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>` : ''}
          </div>
        </div>`;
    }).join('');

    return `
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" data-cccf-card-image="cccf-my-worker-card" style="box-shadow:0 4px 16px rgba(5,150,105,0.08)">
      <div class="px-5 py-4 flex items-center justify-between border-b border-slate-100" style="background:linear-gradient(135deg,#f0fdf4,#ecfdf5)">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 10px rgba(5,150,105,0.3)">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-800">รายการของฉัน</h3>
            <p class="text-[10px] text-slate-500 mt-0.5">ส่งได้ไม่จำกัด · ${target ? `เป้าหมายปีละ ${target} ครั้ง` : 'ยังไม่ได้กำหนดเป้าตามตำแหน่ง'}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <select onchange="window._myCardSetYear(+this.value)" data-cccf-card-ignore
            class="text-xs py-1.5 px-3 rounded-lg border border-slate-200 bg-white text-slate-600 focus:outline-none focus:border-emerald-400">
            ${yearOpts}
          </select>
          <!-- Progress ring -->
          <div class="flex items-center gap-2.5">
            <div class="relative w-11 h-11 flex-shrink-0">
              <svg class="w-11 h-11 -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="none" stroke="#f1f5f9" stroke-width="5"/>
                <circle cx="24" cy="24" r="20" fill="none" stroke="${ringColor}" stroke-width="5"
                  stroke-linecap="round"
                  stroke-dasharray="${circumference}"
                  stroke-dashoffset="${dashOffset}"
                  style="transition:stroke-dashoffset 0.8s ease"/>
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <span class="text-[10px] font-black" style="color:${ringColor}">${target ? `${count}/${target}` : count}</span>
              </div>
            </div>
            <div>
              <p class="text-xs font-bold ${!target ? 'text-slate-500' : done ? 'text-emerald-600' : 'text-amber-600'}">${!target ? 'ยังไม่ได้ตั้งเป้า' : done ? 'ครบเป้าหมาย' : 'ยังไม่ครบ'}</p>
              <p class="text-[10px] text-slate-400">ปี ${_myCardYear}</p>
            </div>
          </div>
          <span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">${myYear.length} รายการ</span>
        </div>
      </div>
      ${myYear.length === 0
        ? `<div class="text-center py-10 text-slate-400">
             <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
               <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
             </div>
             <p class="text-sm font-medium">ยังไม่มีรายการในปี ${_myCardYear + 543}</p>
             <p class="text-xs mt-1">กดปุ่ม "ส่งแบบฟอร์ม CCCF" เพื่อเริ่มต้น</p>
           </div>`
        : `<div>${rows}</div>
           ${myYear.length > 10 ? `<div class="px-4 py-2.5 text-center border-t border-slate-50">
             <span class="text-[10px] text-slate-400">แสดง 10 รายการล่าสุด · ทั้งหมด ${myYear.length} รายการในปีนี้</span>
           </div>` : ''}`}
    </div>`;
}

// ─── Unit data helper ─────────────────────────────────────────────────────────
function cccfWorkerPersonKey(row = {}) {
    const employeeId = String(row.EmployeeID || '').trim();
    if (employeeId) return `employee:${employeeId}`;
    const employeeName = String(row.EmployeeName || '').trim().toLocaleLowerCase('th-TH');
    if (employeeName) return `legacy-name:${employeeName}`;
    const rowId = String(row.id || row.ID || '').trim();
    return rowId ? `legacy-row:${rowId}` : '';
}

function countDistinctCccfWorkerSubmitters(rows = []) {
    return new Set(rows.map(cccfWorkerPersonKey).filter(Boolean)).size;
}

function buildUnitData() {
    const masterUnitNames = _safetyUnits.map(u => normalizeUnitName(u.name)).filter(Boolean);
    const dataUnitNames   = [...new Set(_workerData.map(r => normalizeUnitName(r.SafetyUnit)).filter(Boolean))];
    const targetUnitNames = _unitTargets.map(t => normalizeUnitName(t.unit_name)).filter(Boolean);
    const allUnitNames    = [...new Set([...masterUnitNames, ...dataUnitNames, ...targetUnitNames])].sort();
    const unitNames = _cccfUnitSel
        ? allUnitNames.filter(n => _cccfUnitSel.includes(n))
        : allUnitNames;

    return unitNames.map(unit => {
        const tgtRow   = _unitTargets.find(t => normalizeUnitName(t.unit_name) === unit && +t.target_year === _unitYear);
        const target   = Math.max(0, Number(tgtRow?.yearly_target || 0));
        const yearData = _workerData.filter(r =>
            normalizeUnitName(r.SafetyUnit) === unit &&
            new Date(r.SubmitDate).getFullYear() === _unitYear
        );
        const achievedComputed = countDistinctCccfWorkerSubmitters(yearData);
        const achievedOverride = (tgtRow?.achieved_override != null) ? tgtRow.achieved_override : null;
        const achieved = _cccfWorkerSource === 'actual_department_worker'
            ? achievedComputed
            : achievedOverride !== null ? Number(achievedOverride) : achievedComputed;
        const remaining = target > 0 ? Math.max(0, target - achieved) : 0;
        const done = target > 0 && achieved >= target;
        const status = target <= 0 ? 'unset' : done ? 'done' : achieved > 0 ? 'progress' : 'not_started';
        return {
            unit,
            target,
            targetConfigured: !!tgtRow && target > 0,
            achieved,
            achievedComputed,
            achievedOverride: _cccfWorkerSource === 'actual_department_worker' ? null : achievedOverride,
            actualRecordCount: yearData.length,
            remaining,
            done,
            status,
            kind: 'unit',
        };
    });
}

function getCccfWorkerProgressForYear() {
    return Number(_cccfWorkerProgress?.year || 0) === Number(_unitYear) ? _cccfWorkerProgress : null;
}

function getCccfWorkerProgressUnits() {
    const data = getCccfWorkerProgressForYear();
    const selected = Array.isArray(_cccfUnitSel) && _cccfUnitSel.length
        ? new Set(_cccfUnitSel.map(normalizeUnitName))
        : null;
    return (data?.units || [])
        .map(row => ({ ...row, unit: normalizeUnitName(row.unit) }))
        .filter(row => !selected || selected.has(row.unit));
}

function cccfWorkerNum(value) {
    return Number(value || 0).toLocaleString();
}

function cccfWorkerStatusMeta(status) {
    const map = {
        not_started: { label: 'ยังไม่ส่ง', color: 'slate', pill: 'bg-slate-100 text-slate-700 border-slate-200' },
        in_progress: { label: 'ส่งแล้วแต่ยังไม่ครบ', color: 'amber', pill: 'bg-amber-100 text-amber-800 border-amber-200' },
        completed: { label: 'ครบเป้า', color: 'emerald', pill: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
        exceeded: { label: 'ส่งเกินเป้า', color: 'rose', pill: 'bg-rose-100 text-rose-800 border-rose-200' },
    };
    return map[status] || { label: status || '-', color: 'slate', pill: 'bg-slate-100 text-slate-700 border-slate-200' };
}

function renderCccfWorkerAdminMonitoring() {
    if (!isAdmin) return '';
    if (_cccfWorkerSource !== 'actual_department_worker') return '';
    const data = getCccfWorkerProgressForYear();
    if (!data) {
        return `<div class="mb-4 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500">
          Admin Monitoring ยังไม่ได้โหลดข้อมูล cccf_worker progress สำหรับปีนี้
        </div>`;
    }
    const units = getCccfWorkerProgressUnits();
    const sum = field => units.reduce((total, row) => total + Number(row[field] || 0), 0);
    const actualTowardTarget = sum('actualTowardTarget');
    const personalTargetTotal = sum('personalTargetTotal');
    const rawRecords = sum('rawRecords');
    const unitTarget = sum('unitTarget');
    const allocationDiff = unitTarget - personalTargetTotal;
    const pct = personalTargetTotal > 0 ? Math.round((actualTowardTarget / personalTargetTotal) * 100) : 0;
    const allocationClass = allocationDiff === 0
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-amber-200 bg-amber-50 text-amber-800';
    const allocationText = allocationDiff === 0
        ? 'เป้ารายบุคคลรวมตรงกับ CCCF_Unit_Targets'
        : allocationDiff > 0
            ? `กระจายเป้ารายบุคคลขาด ${cccfWorkerNum(allocationDiff)} จาก CCCF_Unit_Targets`
            : `กระจายเป้ารายบุคคลเกิน ${cccfWorkerNum(Math.abs(allocationDiff))} จาก CCCF_Unit_Targets`;
    const statusKeys = ['not_started', 'in_progress', 'completed', 'exceeded'];
    const statusCards = statusKeys.map(status => {
        const meta = cccfWorkerStatusMeta(status);
        const value = sum(status === 'not_started' ? 'notStarted' : status === 'in_progress' ? 'inProgress' : status);
        return `<button type="button" onclick="window._cccfOpenWorkerProgressBucket(null,'${status}')"
          class="text-left px-3 py-2 rounded-xl border ${meta.pill} hover:shadow-sm transition-all">
          <p class="text-lg font-black leading-none">${cccfWorkerNum(value)}</p>
          <p class="text-[10px] font-bold mt-1">${meta.label}</p>
        </button>`;
    }).join('');
    const rows = units.map(row => {
        const diff = Number(row.allocationDifference || 0);
        const diffClass = diff === 0 ? 'text-emerald-700 bg-emerald-50' : 'text-amber-800 bg-amber-50';
        const unitArg = toInlineJsString(row.unit);
        const bucketButton = (status, field) => {
            const meta = cccfWorkerStatusMeta(status);
            return `<button type="button" onclick="event.stopPropagation();window._cccfOpenWorkerProgressBucket(${unitArg},'${status}')"
              class="px-2 py-1 rounded-lg border ${meta.pill} hover:shadow-sm">${cccfWorkerNum(row[field])}</button>`;
        };
        return `<tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="px-3 py-2 text-xs font-semibold text-slate-700">${escapeHtml(row.unit || 'ไม่ระบุ Unit')}</td>
          <td class="px-3 py-2 text-center text-xs">${cccfWorkerNum(row.unitTarget)}</td>
          <td class="px-3 py-2 text-center text-xs font-semibold">${cccfWorkerNum(row.personalTargetTotal)}</td>
          <td class="px-3 py-2 text-center text-xs font-bold text-emerald-700">${cccfWorkerNum(row.actualTowardTarget)}</td>
          <td class="px-3 py-2 text-center text-xs font-bold text-slate-700">${cccfWorkerNum(row.rawRecords)}</td>
          <td class="px-3 py-2 text-center text-xs"><span class="px-2 py-1 rounded-lg ${diffClass}">${diff > 0 ? '+' : ''}${cccfWorkerNum(diff)}</span></td>
          <td class="px-3 py-2 text-center text-[11px]">${bucketButton('not_started', 'notStarted')}</td>
          <td class="px-3 py-2 text-center text-[11px]">${bucketButton('in_progress', 'inProgress')}</td>
          <td class="px-3 py-2 text-center text-[11px]">${bucketButton('completed', 'completed')}</td>
          <td class="px-3 py-2 text-center text-[11px]">${bucketButton('exceeded', 'exceeded')}</td>
        </tr>`;
    }).join('');
    return `<details class="mb-5 rounded-2xl border border-slate-200 bg-white overflow-hidden group" data-cccf-worker-admin-monitoring="phase4">
      <summary class="list-none cursor-pointer px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors flex flex-wrap items-center justify-between gap-3" data-cccf-card-ignore>
        <div>
          <h4 class="text-sm font-black text-slate-800">รายละเอียดตรวจสอบสำหรับแอดมิน</h4>
          <p class="text-[10px] text-slate-500 mt-0.5">ข้อมูลรายบุคคลและยอดดิบสำหรับตรวจสอบเมื่อยอดไม่ตรง</p>
        </div>
        <span class="text-[10px] font-bold text-slate-600">กดเพื่อดูรายละเอียด</span>
      </summary>
      <div>
      <div class="px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 class="text-sm font-black text-slate-800">CCCF Worker Admin Monitoring</h4>
          <p class="text-[10px] text-slate-500 mt-0.5">ข้อมูลตรวจสอบรายบุคคลเท่านั้น · KPI หลักใช้ Target ราย Unit และผู้ส่งจริงไม่ซ้ำ</p>
        </div>
        <span class="px-3 py-1.5 rounded-xl border text-[10px] font-bold ${allocationClass}">${allocationText} · เตือนเท่านั้น ไม่บล็อก</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 border-b border-slate-100">
        <div class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
          <p class="text-lg font-black text-slate-800">${cccfWorkerNum(unitTarget)}</p>
          <p class="text-[10px] font-bold text-slate-500">CCCF_Unit_Targets</p>
        </div>
        <div class="px-3 py-2 rounded-xl bg-blue-50 border border-blue-100">
          <p class="text-lg font-black text-blue-700">${cccfWorkerNum(personalTargetTotal)}</p>
          <p class="text-[10px] font-bold text-blue-600">Personal target total</p>
        </div>
        <div class="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
          <p class="text-lg font-black text-emerald-700">${cccfWorkerNum(actualTowardTarget)}</p>
          <p class="text-[10px] font-bold text-emerald-600">Actual toward target</p>
        </div>
        <div class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
          <p class="text-lg font-black text-slate-800">${cccfWorkerNum(rawRecords)}</p>
          <p class="text-[10px] font-bold text-slate-500">Raw records</p>
        </div>
        <div class="px-3 py-2 rounded-xl bg-purple-50 border border-purple-100">
          <p class="text-lg font-black text-purple-700">${personalTargetTotal > 0 ? `${pct}%` : 'N/A'}</p>
          <p class="text-[10px] font-bold text-purple-600">Capped progress</p>
        </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 pb-4">${statusCards}</div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[900px]">
          <thead class="bg-slate-50 border-y border-slate-100">
            <tr>
              <th class="px-3 py-2 text-left text-[10px] font-bold text-slate-500">Unit</th>
              <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">Unit Target</th>
              <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">Personal Target</th>
              <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">Actual toward target</th>
              <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">Raw records</th>
              <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">Diff</th>
              <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">ยังไม่ส่ง</th>
              <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">ยังไม่ครบ</th>
              <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">ครบเป้า</th>
              <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">เกินเป้า</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="10" class="px-3 py-8 text-center text-sm text-slate-400">ไม่มี Unit ในตัวกรองนี้</td></tr>`}</tbody>
        </table>
      </div>
      </div>
    </details>`;
}

// ─── Sub-renders ──────────────────────────────────────────────────────────────
function renderUnitSummary() {
    const units = buildUnitData();
    const isActualSource = _cccfWorkerSource === 'actual_department_worker';
    const sectionName = 'Unit';
    if (!units.length) return `<p class="col-span-full text-center py-6 text-slate-400 text-sm">ยังไม่มีข้อมูล ${sectionName} ในระบบ</p>`;

    const totalTarget   = units.reduce((s, u) => s + u.target, 0);
    const totalAchieved = units.reduce((s, u) => s + u.achieved, 0);
    const totalRemaining = units.reduce((s, u) => s + u.remaining, 0);
    const overallPct    = totalTarget > 0 ? Math.min(100, Math.round((totalAchieved / totalTarget) * 100)) : 0;
    const targetSummary = +_cccfTargetSummary?.year === _unitYear ? _cccfTargetSummary : null;
    const systemTarget = targetSummary?.systemTarget ?? null;
    const distributedTarget = targetSummary?.distributedTarget ?? null;
    const allocationDiff = targetSummary?.difference ?? null;
    const currentYear   = new Date().getFullYear();
    const yearOpts = [currentYear, currentYear-1, currentYear-2]
        .map(y => `<option value="${y}" ${y === _unitYear ? 'selected' : ''}>ปี ${y + 543}</option>`).join('');

    const editSvg = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`;

    const sourceControl = `
        <span class="text-[10px] font-bold px-2.5 py-1 rounded-lg ${isActualSource ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}">
          ${isActualSource ? 'คำนวณจากผู้ส่งจริงไม่ซ้ำ' : 'ผล Manual / Override'}
        </span>`;

    const tableRows = units.map((u, i) => {
        const unitArg  = toInlineJsString(u.unit);
        const progressPct = u.target > 0 ? Math.min(100, Math.round((u.achieved / u.target) * 100)) : 0;
        const progressColor = progressPct >= 100 ? '#10b981' : progressPct >= 50 ? '#f59e0b' : '#ef4444';
        const overrideBadge = (!isActualSource && isAdmin && u.achievedOverride !== null)
            ? `<span class="ml-1 text-[8px] font-bold text-emerald-600">(M)</span>` : '';
        const rowClick = isActualSource ? `window._wSetUnit(${unitArg})` : '';
        return `<tr class="${isActualSource ? 'cursor-pointer hover:bg-slate-50' : ''} transition-colors border-b border-slate-100 bg-white"
          ${rowClick ? `onclick="${rowClick}" title="คลิกเพื่อดูรายการของ Unit นี้"` : ''}>
          <td class="px-3 py-3 text-center text-xs font-semibold text-slate-400 w-7 flex-shrink-0">${i + 1}.</td>
          <td class="px-3 py-3 text-xs font-bold text-slate-700" style="white-space:normal;word-break:break-word">${escapeHtml(u.unit)}</td>
          <td class="px-3 py-3 text-center text-sm font-black text-slate-800 w-20">${u.target > 0 ? u.target.toLocaleString() : 'N/A'}</td>
          <td class="px-3 py-3 text-center text-sm font-black text-emerald-700 w-20">${u.achieved.toLocaleString()}${overrideBadge}</td>
          <td class="px-3 py-3 text-center text-sm font-black ${u.remaining > 0 ? 'text-rose-600' : 'text-emerald-700'} w-20">${u.target > 0 ? u.remaining.toLocaleString() : 'N/A'}</td>
          <td class="px-3 py-3 w-44">
            <div class="flex items-center gap-2">
              <div class="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full rounded-full" style="width:${progressPct}%;background:${progressColor}"></div>
              </div>
              <span class="w-10 text-right text-xs font-black text-slate-700">${u.target > 0 ? `${progressPct}%` : 'N/A'}</span>
            </div>
          </td>
          ${isAdmin && !isActualSource ? `<td class="px-1 py-2 text-center w-8">
            <button onclick="event.stopPropagation();window._cccfSetUnitTarget(${unitArg},${u.target},${u.achievedOverride !== null ? u.achievedOverride : 'null'},${u.achievedComputed})"
              class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors" title="แก้ไข Target และผล Manual">${editSvg}</button>
          </td>` : ''}
        </tr>`;
    }).join('');

    return `
    <!-- Stats strip -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
        ${[
          { label: 'ต้องส่งทั้งหมด', val: totalTarget.toLocaleString(), color: '#1e293b' },
          { label: 'ส่งแล้ว', val: totalAchieved.toLocaleString(), color: '#059669' },
          { label: 'ยังไม่ส่ง', val: totalRemaining.toLocaleString(), color: totalRemaining > 0 ? '#e11d48' : '#059669' },
          { label: 'ความคืบหน้า', val: totalTarget > 0 ? overallPct + '%' : 'N/A', color: totalTarget <= 0 ? '#64748b' : overallPct >= 100 ? '#059669' : overallPct >= 50 ? '#d97706' : '#dc2626' },
        ].map(s => `<div class="text-center px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 min-w-[110px]">
          <p class="text-lg font-black" style="color:${s.color}">${s.val}</p>
          <p class="text-[10px] text-slate-500 font-semibold mt-0.5">${s.label}</p>
        </div>`).join('')}
      </div>
      <div class="flex gap-2 ml-auto items-center" data-cccf-card-ignore>
        ${sourceControl}
        <select id="unit-year-filter" onchange="window._unitSetYear(+this.value)"
          class="text-xs py-1.5 px-3 rounded-lg border border-slate-200 bg-white text-slate-600 focus:outline-none focus:border-emerald-400">
          ${yearOpts}
        </select>
        ${isAdmin ? `<button onclick="window._cccfOpenDeptFilter()"
          class="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 border border-emerald-100 transition-colors">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
          เลือก Unit
        </button>` : ''}
      </div>
    </div>

    <div class="mb-4 px-4 py-3 rounded-xl border ${systemTarget === null ? 'border-slate-200 bg-slate-50' : allocationDiff < 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-xs font-bold ${systemTarget === null ? 'text-slate-600' : allocationDiff < 0 ? 'text-amber-800' : 'text-emerald-800'}">
            ${systemTarget === null
              ? 'ยังไม่ได้ตั้งเป้ารวมใน System Console'
              : `กระจายเป้าราย Unit แล้ว ${(distributedTarget || 0).toLocaleString()} / เป้ารวม ${Number(systemTarget).toLocaleString()}`}
          </p>
          <p class="text-[10px] mt-0.5 ${systemTarget === null ? 'text-slate-400' : allocationDiff < 0 ? 'text-amber-700' : 'text-emerald-700'}">
            ${systemTarget === null
              ? 'CCCF ยังใช้งานได้ตามปกติ และสามารถตั้ง Target ราย Unit ได้'
              : allocationDiff > 0
                ? `ยังไม่ได้กระจายอีก ${allocationDiff.toLocaleString()}`
                : allocationDiff < 0
                  ? `กระจายเกินเป้ารวม ${Math.abs(allocationDiff).toLocaleString()} (แจ้งเตือนเท่านั้น)`
                  : 'กระจายเป้าครบตามเป้ารวมแล้ว'}
          </p>
        </div>
        <div class="flex items-center gap-2">
        <span class="text-[10px] font-semibold text-slate-500">
          Target ราย Unit ใช้ร่วมกันทั้งสองโหมด
        </span>
        ${systemTarget === null && isAdmin ? `<button type="button" onclick="window._cccfOpenSystemTargets && window._cccfOpenSystemTargets()"
          class="text-[10px] font-black px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50">
          ไปตั้งค่า Target
        </button>` : ''}
        </div>
      </div>
    </div>

    ${isActualSource ? renderCccfWorkerAdminMonitoring() : ''}

    <!-- Combo layout: table (full height, no scroll) + chart -->
    <div class="flex gap-0 border border-slate-200 rounded-xl overflow-hidden" data-cccf-card-image="cccf-unit-summary-chart">

      <!-- Table: no fixed height, all rows visible -->
      <div class="flex-shrink-0 border-r border-slate-200 overflow-x-auto" style="min-width:620px">
        <table class="w-full">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 sticky top-0">
              <th class="px-3 py-2.5 text-center text-[10px] font-bold text-slate-500 w-7"> </th>
              <th class="px-3 py-2.5 text-left text-[10px] font-bold text-slate-600">${sectionName}</th>
              <th class="px-3 py-2.5 text-center text-[10px] font-bold text-slate-600 w-20">ต้องส่ง</th>
              <th class="px-3 py-2.5 text-center text-[10px] font-bold text-slate-600 w-20">ส่งแล้ว</th>
              <th class="px-3 py-2.5 text-center text-[10px] font-bold text-slate-600 w-20">ยังไม่ส่ง</th>
              <th class="px-3 py-2.5 text-center text-[10px] font-bold text-slate-600 w-44">ความคืบหน้า</th>
              ${isAdmin && !isActualSource ? `<th class="w-8"></th>` : ''}
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>

      <!-- Chart: flex-fill to match table height -->
      <div class="flex-1 bg-white flex flex-col min-w-0 p-4" style="min-width:240px">
        <p class="text-xs font-bold text-slate-600 text-center mb-2">ความคืบหน้าราย ${sectionName} — ปี ${_unitYear + 543}</p>
        <div class="flex items-center justify-center gap-4 text-[10px] text-slate-500 mb-3">
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded inline-block" style="background:rgba(52,211,153,0.85)"></span>Achieved</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded inline-block" style="background:rgba(253,230,138,0.85)"></span>Onprocess</span>
          <span class="flex items-center gap-1"><span class="inline-block w-6 border-t-2 border-dashed border-red-500"></span>Target</span>
        </div>
        <div class="relative flex-1" style="min-height:200px">
          <canvas id="cccf-unit-chart"></canvas>
        </div>
      </div>
    </div>`;
}

// ─── Chart.js Horizontal Combo Chart ─────────────────────────────────────────
function initUnitChart() {
    const ctx = document.getElementById('cccf-unit-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (_unitChartInst) { _unitChartInst.destroy(); _unitChartInst = null; }

    const units    = buildUnitData();
    const labels   = units.map(u => u.unit);
    const targets  = units.map(u => u.target);
    const achieved = units.map(u => u.achieved);
    const onproc   = units.map(u => u.remaining);

    // Row height in the table ≈ 36px; chart bar band should match
    const barThickness = 20;

    _unitChartInst = new Chart(ctx, {
        data: { labels, datasets: [
            {
                type: 'bar', label: 'Achieved', data: achieved,
                backgroundColor: 'rgba(52,211,153,0.85)', borderColor: '#10b981',
                borderWidth: 1, stack: 'total', order: 2,
                barThickness,
            },
            {
                type: 'bar', label: 'Onprocess', data: onproc,
                backgroundColor: 'rgba(253,230,138,0.85)', borderColor: '#fbbf24',
                borderWidth: 1, stack: 'total', order: 2,
                barThickness,
            },
            {
                type: 'line', label: 'Target', data: targets,
                borderColor: '#ef4444', borderDash: [5, 4], borderWidth: 2,
                pointBackgroundColor: '#ef4444', pointRadius: 4, pointHoverRadius: 6,
                fill: false, tension: 0, order: 1,
                // line dataset must share same indexAxis as bar
            },
        ]},
        options: {
            indexAxis: 'y',          // horizontal bars
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw} คน` } },
            },
            scales: {
                // x = value axis (horizontal)
                x: {
                    stacked: true, beginAtZero: true,
                    ticks: { font: { size: 9 }, precision: 0 },
                    grid: { color: 'rgba(0,0,0,0.05)' },
                },
                // y = category axis — show truncated unit names on each bar row
                y: {
                    stacked: true,
                    ticks: {
                        display: true,
                        font: { size: 9 },
                        color: '#475569',
                        callback: function(val) {
                            const name = this.getLabelForValue(val) || '';
                            return name.length > 22 ? name.slice(0, 21) + '…' : name;
                        },
                    },
                    grid: { display: false },
                },
            },
            layout: { padding: { right: 8, left: 4 } },
        },
    });
}

window._cccfOpenWorkerProgressBucket = (unit, status) => {
    if (!isAdmin) return;
    const data = getCccfWorkerProgressForYear();
    if (!data) {
        showToast('ยังไม่ได้โหลดข้อมูล CCCF worker progress', 'error');
        return;
    }
    const normalizedUnit = unit == null ? null : normalizeUnitName(unit);
    const statusMeta = cccfWorkerStatusMeta(status);
    const employees = (data.employees || [])
        .map(row => ({ ...row, unit: normalizeUnitName(row.unit) }))
        .filter(row => !normalizedUnit || row.unit === normalizedUnit)
        .filter(row => !status || row.status === status);
    const title = `CCCF Worker · ${normalizedUnit || 'ทุก Unit'} · ${statusMeta.label}`;
    const rows = employees.map((row, index) => {
        const meta = cccfWorkerStatusMeta(row.status);
        return `<tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="px-3 py-2 text-center text-xs text-slate-400">${index + 1}</td>
          <td class="px-3 py-2 text-xs font-semibold text-slate-800">${escapeHtml(row.employeeName || row.employeeId)}</td>
          <td class="px-3 py-2 text-xs text-slate-500">${escapeHtml(row.employeeId || '')}</td>
          <td class="px-3 py-2 text-xs text-slate-500">${escapeHtml(row.department || '')}</td>
          <td class="px-3 py-2 text-xs text-slate-500">${escapeHtml(row.unit || '')}</td>
          <td class="px-3 py-2 text-xs text-slate-500">${escapeHtml(row.position || '')}</td>
          <td class="px-3 py-2 text-center text-xs font-bold">${cccfWorkerNum(row.target)}</td>
          <td class="px-3 py-2 text-center text-xs font-bold text-emerald-700">${cccfWorkerNum(row.actualTowardTarget)}</td>
          <td class="px-3 py-2 text-center text-xs font-bold text-slate-700">${cccfWorkerNum(row.rawRecords)}</td>
          <td class="px-3 py-2 text-center text-xs">${cccfWorkerNum(row.remaining)}</td>
          <td class="px-3 py-2 text-center text-[10px]"><span class="px-2 py-1 rounded-lg border ${meta.pill}">${meta.label}</span></td>
          <td class="px-3 py-2 text-center text-[10px] text-slate-500">${escapeHtml(row.targetSource || '')}</td>
        </tr>`;
    }).join('');
    openModal(title, `
      <div class="space-y-4" data-cccf-worker-admin-monitoring-modal="phase3">
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p class="text-sm font-bold text-slate-700">${employees.length.toLocaleString()} คน</p>
          <p class="text-[10px] text-slate-500 mt-0.5">รายละเอียดตรวจสอบรายบุคคล · KPI หลักนับผู้ส่งจริงไม่ซ้ำเทียบกับ Target ราย Unit</p>
        </div>
        <div class="overflow-x-auto border border-slate-200 rounded-xl">
          <table class="w-full min-w-[980px]">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">#</th>
                <th class="px-3 py-2 text-left text-[10px] font-bold text-slate-500">Employee</th>
                <th class="px-3 py-2 text-left text-[10px] font-bold text-slate-500">ID</th>
                <th class="px-3 py-2 text-left text-[10px] font-bold text-slate-500">Department</th>
                <th class="px-3 py-2 text-left text-[10px] font-bold text-slate-500">Unit</th>
                <th class="px-3 py-2 text-left text-[10px] font-bold text-slate-500">Position</th>
                <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">Target</th>
                <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">Actual toward</th>
                <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">Raw</th>
                <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">Remain</th>
                <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">Status</th>
                <th class="px-3 py-2 text-center text-[10px] font-bold text-slate-500">Source</th>
              </tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="12" class="py-8 text-center text-sm text-slate-400">ไม่พบรายชื่อในกลุ่มนี้</td></tr>`}</tbody>
          </table>
        </div>
      </div>`, 'max-w-6xl');
};

async function refreshCccfWorkerProgress(year) {
    const res = await API.get(`/cccf/worker-progress?year=${year}`).catch(() => ({ data: null }));
    _cccfWorkerProgress = res?.data || null;
}

async function refreshCccfTargetSummary(year) {
    const res = await API.get(`/cccf/target-summary?year=${year}`).catch(() => ({ data: null }));
    _cccfTargetSummary = res?.data || null;
}

window._unitSetYear = async (year) => {
    _unitYear = year;
    await refreshCccfTargetSummary(year);
    await refreshCccfWorkerProgress(year);
    _cccfWorkerSource = resolveCccfWorkerSource(_dashboardConfig, year);
    const page = document.getElementById('cccf-page');
    if (page) renderPage(page);
};

window._myCardSetYear = (year) => {
    _myCardYear = year;
    const wrap = document.getElementById('cccf-my-card-wrap');
    if (wrap) wrap.innerHTML = renderMyCard();
};

window._unitUpdateRemaining = () => {
    const t    = parseInt(document.getElementById('unit-target-input')?.value) || 0;
    const aRaw = document.getElementById('unit-achieved-input')?.value.trim();
    const fallback = parseInt(document.getElementById('unit-achieved-input')?.dataset.computed) || 0;
    const a   = aRaw === '' ? fallback : (parseInt(aRaw) || 0);
    const rem = Math.max(0, t - a);
    const el  = document.getElementById('unit-remaining-val');
    if (el) { el.textContent = rem + ' คน'; el.style.color = rem > 0 ? '#dc2626' : '#059669'; }
};

window._cccfSetUnitTarget = (unit, currentTarget, achievedOverride, computedAchieved) => {
    const overrideVal = (achievedOverride !== null && achievedOverride !== undefined) ? achievedOverride : '';
    const initRemaining = Math.max(0, (currentTarget || 0) - (overrideVal !== '' ? (overrideVal || 0) : (computedAchieved || 0)));

    openModal(`แก้ไขข้อมูล Unit: ${unit}`, `
      <div class="space-y-4 px-1">
        <p class="text-xs text-slate-500">กำหนดค่าสำหรับ Unit นี้ในปี <strong>${_unitYear + 543}</strong></p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">เป้าหมาย (คน/ปี) <span class="text-red-500">*</span></label>
            <input id="unit-target-input" type="number" min="0" max="9999" value="${currentTarget || 0}"
              oninput="window._unitUpdateRemaining()"
              class="form-input w-full rounded-xl text-sm text-center font-bold" style="color:#1e293b">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
              Achieved (Override)
              <span class="font-normal normal-case text-slate-300 ml-1">ระบบ: ${computedAchieved} ครั้ง</span>
            </label>
            <input id="unit-achieved-input" type="number" min="0" max="9999"
              value="${overrideVal}" placeholder="${computedAchieved}"
              data-computed="${computedAchieved}"
              oninput="window._unitUpdateRemaining()"
              class="form-input w-full rounded-xl text-sm text-center font-bold" style="color:#059669">
            <p class="text-[9px] text-slate-400 mt-1">เว้นว่าง = ใช้ค่าจากระบบ</p>
          </div>
        </div>

        <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="flex-1">
            <p class="text-[10px] font-bold text-slate-400 uppercase">ยังไม่ส่ง (Remaining)</p>
            <p id="unit-remaining-val" class="text-xl font-black mt-0.5" style="color:${initRemaining > 0 ? '#dc2626' : '#059669'}">${initRemaining} คน</p>
          </div>
          <svg class="w-8 h-8 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onclick="closeModal()" class="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
          <button id="btn-save-unit-target" class="px-5 py-2 rounded-xl text-sm font-bold text-white" style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก</button>
        </div>
      </div>`, 'max-w-sm');

    document.getElementById('btn-save-unit-target')?.addEventListener('click', guardActionHandler(async () => {
        const targetVal  = parseInt(document.getElementById('unit-target-input')?.value) || 0;
        const achRaw     = document.getElementById('unit-achieved-input')?.value.trim();
        const achOverride = achRaw === '' ? null : (parseInt(achRaw) || 0);
        showLoading('กำลังบันทึก...');
        try {
            await API.put('/cccf/unit-targets', {
                unit_name: unit,
                target_year: _unitYear,
                yearly_target: targetVal,
                achieved_override: achOverride,
            });
            const res = await API.get('/cccf/unit-targets').catch(() => []);
            _unitTargets = (Array.isArray(res) ? res : res?.data ?? [])
                .map(t => ({ ...t, unit_name: normalizeUnitName(t.unit_name) }));
            await refreshCccfTargetSummary(_unitYear);
            await refreshCccfWorkerProgress(_unitYear);
            closeModal();
            showToast('บันทึกสำเร็จ', 'success');
            const wrap = document.getElementById('cccf-unit-summary-inner');
            if (wrap) { wrap.innerHTML = renderUnitSummary(); setTimeout(() => initUnitChart(), 0); }
        } catch (err) { showError(err); } finally { hideLoading(); }
    }));
};

function renderWorkerRows(data) {
    const cols = isAdmin ? 6 : 5;
    if (!data.length) return `<tr><td colspan="${cols}" class="text-center py-12">
        <div class="flex flex-col items-center gap-2 text-slate-400">
            <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            </div>
            <p class="text-sm font-medium">ไม่มีข้อมูล</p><p class="text-xs">ลองปรับตัวกรองหรือยังไม่มีการส่งแบบฟอร์ม</p>
        </div>
    </td></tr>`;
    return data.map(r => {
        const rank = RANKS.find(x => x.rank === r.Rank) || RANKS[2];
        const stop = STOP_TYPES.find(x => x.id == r.StopType) || STOP_TYPES[5];
        const dateStr = r.SubmitDate ? new Date(r.SubmitDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
        const desc = (r.HazardDescription||'').slice(0, 60) + ((r.HazardDescription||'').length > 60 ? '…' : '');
        return `<tr class="border-b border-slate-50 hover:bg-emerald-50/40 cursor-pointer transition-colors" onclick="window._cccfShowWorkerDetail(${r.id})">
          <td class="px-4 py-3">
            <p class="font-semibold text-slate-800 text-xs">${escapeHtml(r.EmployeeName || '—')}</p>
            <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(r.Department || '—')}</p>
          </td>
          <td class="px-4 py-3">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border" style="background:${stop.bg};color:${stop.color};border-color:${stop.border}">${escapeHtml(stop.code)}</span>
            ${r.SafetyUnit ? `<p class="text-[10px] font-semibold text-emerald-600 mt-0.5">${escapeHtml(r.SafetyUnit)}</p>` : ''}
            <p class="text-[10px] text-slate-500 mt-0.5">${escapeHtml(r.JobArea || '—')}</p>
          </td>
          <td class="px-4 py-3 max-w-[200px]">
            <p class="text-xs text-slate-600 leading-snug">${escapeHtml(desc || '—')}</p>
            ${getWorkerAttachments(r).length ? `<span class="mt-1.5 inline-flex items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-[9px] font-bold text-sky-700">
              มีรูปแนบ ${getWorkerAttachments(r).length}
            </span>` : ''}
          </td>
          <td class="px-4 py-3 text-center">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black text-white" style="background:${rank.color}">${rank.rank}</span>
          </td>
          <td class="px-4 py-3 text-center text-[10px] text-slate-400 whitespace-nowrap">${escapeHtml(dateStr)}</td>
          ${isAdmin ? `<td class="px-4 py-3 text-center">
            <div class="flex items-center justify-center gap-1">
              <button type="button" onclick="event.stopPropagation();window._cccfEditWorker(${r.id})"
                class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Edit">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
              <button type="button" onclick="event.stopPropagation();window._cccfDeleteWorker(${r.id})"
                class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Delete">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </td>` : ''}
        </tr>`;
    }).join('');
}

function renderPermanentRows(data) {
    const cols = isAdmin ? 7 : 6;
    if (!data.length) return `<tr><td colspan="${cols}" class="text-center py-12">
        <div class="flex flex-col items-center gap-2 text-slate-400">
            <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <p class="text-sm font-medium">ยังไม่มีรายการติดตาม</p>
        </div>
    </td></tr>`;
    return data.map(r => {
        const canOpenDetail = !!r.id;
        const dateStr = r.SubmitDate ? new Date(r.SubmitDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
        const stop = STOP_TYPES.find(x => +x.id === +r.StopType) || STOP_TYPES[5];
        const rank = RANKS.find(x => x.rank === r.Rank) || null;
        const displayFileUrl = getPermanentDisplayFileUrl(r);
        const canUploadSignedPdf = r.id && r.status.key === 'approved' && (isAdmin || String(r.submission?.AssigneeID || r.assignment?.EmployeeID || '') === String(currentUser.id || ''));
        return `<tr class="border-b border-slate-50 transition-colors ${canOpenDetail ? 'hover:bg-emerald-50/40 cursor-pointer' : 'bg-white'}" ${canOpenDetail ? `onclick="window._cccfShowPermanentDetail(${r.id})"` : ''}>
          <td class="px-4 py-3">
            ${r.id ? `<p class="mb-1 text-[10px] font-black text-emerald-700">${escapeHtml(getPermanentNumber(r))}</p>` : ''}
            <div class="flex items-center gap-2">
              <p class="font-semibold text-slate-800 text-xs">${escapeHtml(r.displayName || '—')}</p>
              ${r.rowType === 'assigned'
                ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200">Assigned</span>`
                : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-sky-50 text-sky-700 border border-sky-100">Ad hoc</span>`}
            </div>
            <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(r.Department || '—')}</p>
            ${r.rowType === 'assigned' ? `<span class="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold ${r.due?.className || 'bg-slate-50 text-slate-500 border-slate-200'}">${escapeHtml(r.due?.label || 'No Due Date')}</span>` : ''}
          </td>
          <td class="px-4 py-3 text-center">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${r.status.className}">
              <span class="w-1.5 h-1.5 rounded-full ${r.status.dotClass} inline-block"></span>${escapeHtml(r.status.label)}
            </span>
          </td>
          <td class="px-4 py-3 text-xs text-slate-600 max-w-[180px]">
            <p class="truncate">${escapeHtml(r.JobArea || (r.status.key === 'must_send' ? 'รอส่ง Form A Permanent' : '—'))}</p>
            ${r.Summary ? `<p class="text-[10px] text-slate-400 mt-0.5 truncate">${escapeHtml(r.Summary)}</p>` : ''}
            ${r.AssignmentNote ? `<p class="text-[10px] text-indigo-500 mt-0.5 truncate">Note: ${escapeHtml(r.AssignmentNote)}</p>` : ''}
          </td>
          <td class="px-4 py-3 text-xs text-slate-600">
            ${r.StopType || r.Rank ? `
              <div class="flex flex-col items-center gap-1.5">
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border" style="background:${stop.bg};color:${stop.color};border-color:${stop.border}">
                  ${escapeHtml(stop.code)}
                </span>
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border" style="background:${rank?.bg || '#f8fafc'};color:${rank?.color || '#64748b'};border-color:${rank?.border || '#e2e8f0'}">
                  ${escapeHtml(rank?.label || '—')}
                </span>
              </div>
            ` : `<span class="text-[10px] text-slate-300">—</span>`}
          </td>
          <td class="px-4 py-3 text-center">
            <div class="flex flex-col items-center gap-1.5">
              ${displayFileUrl
                ? renderFileActions(displayFileUrl, { compact: true })
                : `<span class="text-[10px] ${r.status.key === 'must_send' ? 'text-slate-300' : 'text-amber-500'}">${r.status.key === 'must_send' ? '—' : 'รอแนบไฟล์'}</span>`}
              ${canUploadSignedPdf ? `<button onclick="event.stopPropagation();window._cccfUploadSignedPdf(${r.id})" class="rounded-lg border border-sky-100 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700 hover:bg-sky-100">อัปโหลด PDF</button>` : ''}
            </div>
          </td>
          <td class="px-4 py-3 text-center text-[10px] text-slate-400 whitespace-nowrap">${escapeHtml(dateStr)}</td>
          ${isAdmin ? `<td class="px-4 py-3 text-center">
            <div class="flex items-center justify-center gap-1">
              ${r.id ? `
                ${r.status.key === 'pending_review' ? `
                  <button onclick="event.stopPropagation();window._cccfReviewPermanent(${r.id}, 'Approved')" class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Approve Excel">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  </button>
                  <button onclick="event.stopPropagation();window._cccfReviewPermanent(${r.id}, 'Rejected')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Reject Excel">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                ` : ''}
                ${canUploadSignedPdf ? `
                  <button onclick="event.stopPropagation();window._cccfUploadSignedPdf(${r.id})" class="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors" title="อัปโหลด PDF ลงนาม">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                  </button>
                ` : ''}
                <button onclick="event.stopPropagation();window._cccfEditPermanent(${r.id})" class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="แก้ไข">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button onclick="event.stopPropagation();window._cccfDeletePermanent(${r.id})" class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="ลบ">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              ` : `
                <button onclick="event.stopPropagation();window._cccfOpenPermanentForAssignee(${toInlineJsString(r.assignment?.EmployeeID || '')})" class="px-2 py-1 rounded-lg text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 transition-colors" title="เพิ่มแทนผู้ใช้">
                  เพิ่มแทน
                </button>
              `}
            </div>
          </td>` : ''}
        </tr>`;
    }).join('');
}

function renderPermanentDashboard() {
    const { byRank, byStop, latestRows, submittedDeptCount, withFileCount } = getPermanentDashboardStats();
    const latestHtml = latestRows.length
        ? latestRows.map(r => {
            const stop = STOP_TYPES.find(s => +s.id === +r.StopType) || STOP_TYPES[5];
            const rankColor = r.Rank === 'A' ? '#dc2626' : r.Rank === 'B' ? '#ea580c' : '#059669';
            return `<div class="flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
              <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background:${stop.bg}">
                <span class="text-[10px] font-black" style="color:${stop.color}">${escapeHtml(r.Rank || '—')}</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(r.JobArea || '—')}</p>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border" style="background:${stop.bg};color:${stop.color};border-color:${stop.border}">${escapeHtml(stop.code)}</span>
                  <span class="text-[10px] font-bold" style="color:${rankColor}">Rank ${escapeHtml(r.Rank || '—')}</span>
                </div>
                <p class="text-[11px] text-slate-500 mt-1 truncate">${escapeHtml(r.SubmitterName || '—')} · ${escapeHtml(r.Department || '—')}</p>
              </div>
              <span class="text-[10px] text-slate-400 whitespace-nowrap">${escapeHtml(formatThaiDate(r.SubmitDate))}</span>
            </div>`;
        }).join('')
        : `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีรายการส่งแบบฟอร์ม Permanent</div>`;

    return `
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div class="xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5" style="box-shadow:0 4px 16px rgba(5,150,105,0.08)">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-sm font-bold text-slate-700">Permanent Dashboard</h3>
            <p class="text-[10px] text-slate-400 mt-0.5">ภาพรวมการส่งแบบฟอร์มแก้ไขถาวร</p>
          </div>
          <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">${_permanentData.length} รายการ</span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-2xl font-black text-slate-800">${submittedDeptCount}</p>
            <p class="text-[10px] text-slate-500 mt-1">หน่วยงานที่ส่งแล้ว</p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-2xl font-black text-emerald-600">${withFileCount}</p>
            <p class="text-[10px] text-slate-500 mt-1">รายการที่แนบไฟล์</p>
          </div>
          <div class="rounded-xl border border-red-100 bg-red-50 p-4">
            <p class="text-2xl font-black text-red-600">${byRank.A}</p>
            <p class="text-[10px] text-slate-500 mt-1">Rank A</p>
          </div>
          <div class="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <p class="text-2xl font-black text-amber-600">${byRank.B}</p>
            <p class="text-[10px] text-slate-500 mt-1">Rank B</p>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          ${byStop.map(s => `<div class="rounded-xl border p-3 text-center" style="background:${s.bg};border-color:${s.border}">
            <p class="text-xl font-black" style="color:${s.color}">${s.count}</p>
            <p class="text-[10px] font-bold mt-1" style="color:${s.color}">${escapeHtml(s.code)}</p>
          </div>`).join('')}
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" style="box-shadow:0 4px 16px rgba(5,150,105,0.08)">
        <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <h3 class="text-sm font-bold text-slate-700">รายการล่าสุด</h3>
          <p class="text-[10px] text-slate-400 mt-0.5">5 รายการล่าสุดของ Permanent</p>
        </div>
        <div>${latestHtml}</div>
      </div>
    </div>`;
}

function renderPermanentDashboardExecutive() {
    const { byRank, byStop, latestRows, submittedDeptCount, withFileCount } = getPermanentDashboardStats();
    const { totalAssigned, completedCount, submitPct } = getPermanentProgressStats();
    const pendingCount = Math.max(0, totalAssigned - completedCount);
    const totalRows = _permanentData.length;
    const criticalShare = totalRows ? Math.round(((byRank.A + byRank.B) / totalRows) * 100) : 0;
    const leadingStop = [...byStop].sort((a, b) => b.count - a.count)[0] || null;
    const completionTone = submitPct >= 100 ? '#059669' : submitPct >= 60 ? '#d97706' : '#dc2626';

    const latestHtml = latestRows.length
        ? latestRows.map(r => {
            const stop = STOP_TYPES.find(s => +s.id === +r.StopType) || STOP_TYPES[5];
            const rankColor = r.Rank === 'A' ? '#dc2626' : r.Rank === 'B' ? '#ea580c' : '#059669';
            return `<div class="flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
              <div class="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style="background:${stop.bg}">
                <span class="text-[10px] font-black" style="color:${stop.color}">${escapeHtml(r.Rank || '—')}</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(r.JobArea || '—')}</p>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border" style="background:${stop.bg};color:${stop.color};border-color:${stop.border}">${escapeHtml(stop.code)}</span>
                  <span class="text-[10px] font-bold" style="color:${rankColor}">Rank ${escapeHtml(r.Rank || '—')}</span>
                </div>
                <p class="text-[11px] text-slate-500 mt-1 truncate">${escapeHtml(r.SubmitterName || '—')} · ${escapeHtml(r.Department || '—')}</p>
              </div>
              <span class="text-[10px] text-slate-400 whitespace-nowrap">${escapeHtml(formatThaiDate(r.SubmitDate))}</span>
            </div>`;
        }).join('')
        : `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีรายการส่งแบบฟอร์ม Permanent</div>`;

    return `
    <div class="space-y-4">
      <div class="grid grid-cols-1 xl:grid-cols-[1.55fr_.95fr] gap-4">
      <div class="rounded-[28px] overflow-hidden border border-slate-200 bg-white shadow-sm" data-cccf-card-image="cccf-permanent-executive-dashboard" style="box-shadow:0 18px 42px rgba(15,23,42,0.08)">
        <div class="px-6 py-6 text-white" style="background:linear-gradient(135deg,#0f172a 0%,#134e4a 55%,#0f766e 100%)">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="max-w-2xl">
              <p class="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-100/90">Executive Dashboard</p>
              <h3 class="mt-2 text-2xl font-black leading-tight">Form A Permanent Performance Overview</h3>
              <p class="mt-2 text-sm text-emerald-50/85">ภาพรวมการส่งแบบฟอร์มแก้ไขถาวรสำหรับการติดตามเชิงบริหาร พร้อมมุมมอง completion, risk mix และสถานะเอกสารแนบ</p>
            </div>
            <div class="min-w-[220px] rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm px-4 py-4">
              <p class="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-100/80">Completion Status</p>
              <div class="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p class="text-4xl font-black leading-none">${submitPct}<span class="text-lg">%</span></p>
                  <p class="mt-1 text-xs text-emerald-50/75">${completedCount} of ${totalAssigned || 0} assigned owners complete</p>
                </div>
                <div class="text-right">
                  <p class="text-[10px] uppercase tracking-[0.18em] text-emerald-100/70">Pending</p>
                  <p class="text-xl font-black">${pendingCount}</p>
                </div>
              </div>
              <div class="mt-4 h-2.5 rounded-full bg-white/15 overflow-hidden">
                <div class="h-full rounded-full" style="width:${submitPct}%;background:${submitPct>=100?'linear-gradient(90deg,#34d399,#86efac)':submitPct>=60?'linear-gradient(90deg,#f59e0b,#fde68a)':'linear-gradient(90deg,#f87171,#fecaca)'}"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="p-6 space-y-5">
          <div class="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Submitted Dept.</p>
              <p class="mt-3 text-3xl font-black text-slate-800">${submittedDeptCount}</p>
              <p class="mt-1 text-xs text-slate-500">ส่วนงานที่มีการส่งแล้ว</p>
            </div>
            <div class="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700/70">File Attachment</p>
              <p class="mt-3 text-3xl font-black text-emerald-700">${withFileCount}</p>
              <p class="mt-1 text-xs text-emerald-700/80">รายการที่แนบหลักฐานครบ</p>
            </div>
            <div class="rounded-2xl border border-red-100 bg-red-50 p-4">
              <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-red-600/75">Critical Risk</p>
              <p class="mt-3 text-3xl font-black text-red-600">${byRank.A}</p>
              <p class="mt-1 text-xs text-red-700/80">Rank A</p>
            </div>
            <div class="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700/75">High Concern</p>
              <p class="mt-3 text-3xl font-black text-amber-600">${byRank.B}</p>
              <p class="mt-1 text-xs text-amber-700/80">Rank B</p>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-[1.2fr_.8fr] gap-4">
            <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
              <div class="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p class="text-sm font-bold text-slate-800">Stop Type Distribution</p>
                  <p class="text-[11px] text-slate-500 mt-1">กระจายตัวของประเด็นตามกลุ่ม Stop เพื่อใช้ติดตามแนวโน้มหลัก</p>
                </div>
                <span class="text-[11px] font-bold px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-500">${totalRows} records</span>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                ${byStop.map(s => `
                  <div class="rounded-2xl border p-3.5 text-center bg-white" style="border-color:${s.border};box-shadow:inset 0 1px 0 rgba(255,255,255,.65)">
                    <div class="mx-auto w-10 h-10 rounded-2xl flex items-center justify-center" style="background:${s.bg}">
                      <span class="text-sm font-black" style="color:${s.color}">${s.count}</span>
                    </div>
                    <p class="text-[11px] font-bold mt-2" style="color:${s.color}">${escapeHtml(s.code)}</p>
                    <p class="text-[10px] text-slate-400 mt-1">${escapeHtml(s.label)}</p>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-white p-5">
              <p class="text-sm font-bold text-slate-800">Management Focus</p>
              <div class="mt-4 space-y-3">
                <div class="rounded-2xl p-4" style="background:linear-gradient(135deg,#eff6ff,#f8fafc);border:1px solid #bfdbfe">
                  <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700/75">Overall Risk Mix</p>
                  <p class="mt-2 text-3xl font-black text-slate-800">${criticalShare}%</p>
                  <p class="mt-1 text-xs text-slate-500">สัดส่วน Rank A + B จากรายการทั้งหมด</p>
                </div>
                <div class="rounded-2xl p-4" style="background:linear-gradient(135deg,#f0fdf4,#f8fafc);border:1px solid #bbf7d0">
                  <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700/75">Dominant Stop</p>
                  <p class="mt-2 text-lg font-black" style="color:${leadingStop?.color || '#0f172a'}">${escapeHtml(leadingStop?.code || '—')}</p>
                  <p class="mt-1 text-xs text-slate-500">${leadingStop?.count || 0} records require monitoring</p>
                </div>
                <div class="rounded-2xl p-4" style="background:linear-gradient(135deg,#fff7ed,#fefce8);border:1px solid #fed7aa">
                  <p class="text-[11px] font-bold uppercase tracking-[0.16em]" style="color:${completionTone}">Execution Outlook</p>
                  <p class="mt-2 text-lg font-black text-slate-800">${pendingCount} pending owners</p>
                  <p class="mt-1 text-xs text-slate-500">ยังไม่ Complete ตาม assignment</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden" data-cccf-card-image="cccf-permanent-recent-activity" style="box-shadow:0 18px 42px rgba(15,23,42,0.08)">
        <div class="px-5 py-5 border-b border-slate-100 bg-slate-50/70">
          <p class="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Recent Activity</p>
          <h3 class="mt-1 text-lg font-black text-slate-800">Latest Permanent Submissions</h3>
          <p class="text-[11px] text-slate-500 mt-1">5 รายการล่าสุดสำหรับใช้ตรวจสอบความเคลื่อนไหวหน้างาน</p>
        </div>
        <div>${latestHtml}</div>
      </div>
      </div>
      ${renderPermanentDepartmentProgress()}
    </div>`;
}

function getPermanentProgressStats() {
    const assignedRows = buildPermanentTrackingRows().filter(row => row.rowType === 'assigned');
    const completedCount = assignedRows.filter(row => row.status.key === 'complete').length;
    const totalAssigned = assignedRows.length;
    const submitPct = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0;
    return { totalAssigned, completedCount, submitPct };
}

function buildPermanentDepartmentProgress() {
    const deptMap = new Map();
    buildPermanentTrackingRows()
        .filter(row => row.rowType === 'assigned')
        .forEach(row => {
            const dept = String(row.Department || 'ไม่ระบุส่วนงาน').trim() || 'ไม่ระบุส่วนงาน';
            if (!deptMap.has(dept)) {
                deptMap.set(dept, { department: dept, total: 0, complete: 0, onprocess: 0, must_send: 0, latestDate: null });
            }
            const bucket = deptMap.get(dept);
            bucket.total += 1;
            bucket[row.status.key] += 1;
            const rowDate = row.SubmitDate ? new Date(row.SubmitDate) : null;
            if (rowDate && !Number.isNaN(rowDate.getTime()) && (!bucket.latestDate || rowDate > bucket.latestDate)) {
                bucket.latestDate = rowDate;
            }
        });

    return [...deptMap.values()]
        .map(row => ({
            ...row,
            progressPct: row.total ? Math.round((row.complete / row.total) * 100) : 0,
        }))
        .sort((a, b) => (b.progressPct - a.progressPct) || (a.must_send - b.must_send) || a.department.localeCompare(b.department));
}

function renderPermanentDepartmentProgress() {
    const rows = buildPermanentDepartmentProgress();
    if (!rows.length) return '';
    return `
    <div class="bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden" data-cccf-card-image="cccf-permanent-department-progress" style="box-shadow:0 18px 42px rgba(15,23,42,0.08)">
      <div class="px-5 py-5 border-b border-slate-100 bg-slate-50/70">
        <p class="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Department Progress</p>
        <h3 class="mt-1 text-lg font-black text-slate-800">ความสำเร็จรายส่วนงาน</h3>
        <p class="text-[11px] text-slate-500 mt-1">คำนวณจากรายชื่อที่แอดมิน assign ไว้ตั้งแต่ต้น แล้วดูว่าแต่ละส่วนงานไปถึงขั้นไหนแล้ว</p>
      </div>
      <div class="divide-y divide-slate-100">
        ${rows.map(row => `
          <div class="px-5 py-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-bold text-slate-800">${escapeHtml(row.department)}</p>
                <p class="text-[11px] text-slate-500 mt-1">${row.complete}/${row.total} complete · ${row.onprocess} on process · ${row.must_send} ต้องส่ง</p>
              </div>
              <div class="text-right">
                <p class="text-lg font-black ${row.progressPct >= 100 ? 'text-emerald-600' : row.progressPct >= 50 ? 'text-amber-600' : 'text-rose-600'}">${row.progressPct}%</p>
                <p class="text-[10px] text-slate-400">${row.latestDate ? `อัปเดตล่าสุด ${formatThaiDate(row.latestDate)}` : 'ยังไม่มีการส่ง'}</p>
              </div>
            </div>
            <div class="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
              <div style="width:${row.total ? (row.complete / row.total) * 100 : 0}%" class="bg-emerald-500"></div>
              <div style="width:${row.total ? (row.onprocess / row.total) * 100 : 0}%" class="bg-amber-400"></div>
              <div style="width:${row.total ? (row.must_send / row.total) * 100 : 0}%" class="bg-rose-400"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function getPermanentDashboardStats() {
    const latestRows = [..._permanentData]
        .sort((a, b) => new Date(b.SubmitDate || b.CreatedAt || 0) - new Date(a.SubmitDate || a.CreatedAt || 0))
        .slice(0, 5);
    const byRank = { A: 0, B: 0, C: 0 };
    const byStop = STOP_TYPES.map(s => ({ ...s, count: 0 }));
    const submittedDeptCount = new Set(_permanentData.map(r => (r.Department || '').trim()).filter(Boolean)).size;
    _permanentData.forEach(r => {
        if (byRank[r.Rank] !== undefined) byRank[r.Rank]++;
        const stop = byStop.find(s => +s.id === +r.StopType);
        if (stop) stop.count++;
    });
    return {
        latestRows,
        byRank,
        byStop,
        submittedDeptCount,
        withFileCount: _permanentData.filter(r => !!r.FileUrl).length,
    };
}

async function exportCccfWorkerPDF() {
    console.info('[cccf] Worker PDF export requested', { mode: _cccfWorkerSource, year: _unitYear });
    if (!window.jspdf || !window.html2canvas) {
        console.warn('[cccf] Worker PDF export dependencies are unavailable');
        showToast('ไม่พบ jsPDF หรือ html2canvas', 'error');
        return;
    }

    const isActual = _cccfWorkerSource === 'actual_department_worker';
    const filtered = isActual ? getFilteredWorker() : [];
    if (isActual && !filtered.length) {
        showToast('ไม่มีข้อมูลสำหรับส่งออก PDF', 'warning');
        return;
    }

    const K = "font-family:'Kanit',sans-serif;";
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const issueDate = formatThaiDate(now, { day: 'numeric', month: 'long', year: 'numeric' });
    const modeCode = isActual ? 'ACT' : 'MNL';
    const docNo = `CCCF-WK-${modeCode}-${now.getFullYear()}-${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
    const reportYear = _unitYear;
    const units = buildUnitData()
        .filter(u => u.target > 0 || u.achieved > 0)
        .sort((a, b) => a.unit.localeCompare(b.unit));
    if (!units.length) {
        showToast('ไม่มีข้อมูล Unit สำหรับส่งออก PDF', 'warning');
        return;
    }
    const totalTarget = units.reduce((sum, unit) => sum + Number(unit.target || 0), 0);
    const totalAchieved = units.reduce((sum, unit) => sum + Number(unit.achieved || 0), 0);
    const totalRemaining = units.reduce((sum, unit) => sum + Number(unit.remaining || 0), 0);
    const totalProgress = totalTarget > 0
        ? Math.min(100, Math.round((totalAchieved / totalTarget) * 100))
        : 0;
    const filteredRanks = { A: 0, B: 0, C: 0 };
    const filteredStops = STOP_TYPES.map(s => ({ ...s, count: filtered.filter(r => +r.StopType === +s.id).length }));
    filtered.forEach(r => { if (filteredRanks[r.Rank] !== undefined) filteredRanks[r.Rank]++; });
    const uniqueEmployees = isActual ? countDistinctCccfWorkerSubmitters(filtered) : 0;
    const attachmentRecordCount = isActual
        ? filtered.filter(record => getWorkerAttachments(record).length > 0).length
        : 0;
    const unitSourceNote = isActual
        ? 'Target ใช้ CCCF_Unit_Targets และส่งแล้วนับผู้ส่ง Form A Worker จริงแบบไม่ซ้ำในแต่ละ Unit'
        : 'Target และส่งแล้วใช้ผล Manual / Override ราย Unit โดยไม่นำรายการแบบฟอร์มจริงมาปนในการคำนวณ';
    const allocationNote = _cccfTargetSummary?.systemTarget == null
        ? 'ยังไม่ได้ตั้งเป้ารวมใน System Console'
        : `กระจายเป้าราย Unit ${Number(_cccfTargetSummary.distributedTarget || 0).toLocaleString()} / เป้ารวม ${Number(_cccfTargetSummary.systemTarget).toLocaleString()}`;
    const criticalRows = filtered
        .filter(r => r.Rank === 'A' || r.Rank === 'B')
        .sort((a, b) => {
            const rankOrder = { A: 0, B: 1, C: 2 };
            return (rankOrder[a.Rank] ?? 9) - (rankOrder[b.Rank] ?? 9) || new Date(b.SubmitDate) - new Date(a.SubmitDate);
        })
        .slice(0, 6);

    const activeFilters = [
        _wSearch ? `ค้นหา: ${_wSearch}` : '',
        _wFilterDept ? `ส่วนงาน: ${_wFilterDept}` : '',
        _wFilterUnit ? `Unit: ${_wFilterUnit}` : '',
        _wFilterRank ? `Rank: ${_wFilterRank}` : '',
        _wFilterStop ? `Stop: ${(STOP_TYPES.find(s => +s.id === +_wFilterStop)?.code) || _wFilterStop}` : '',
    ].filter(Boolean);
    const filterText = isActual
        ? (activeFilters.length ? activeFilters.join(' | ') : 'ไม่มีตัวกรองรายการเพิ่มเติม')
        : 'รายงานทุก Unit ที่เลือกในหน้าสรุป';
    const selectedUnitScope = Array.isArray(_cccfUnitSel) && _cccfUnitSel.length
        ? _cccfUnitSel.join(', ')
        : 'ทุก Unit ที่ตั้งค่าไว้';
    const PAGE_STYLE = K + 'width:794px;height:1122px;background:#ffffff;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;color:#1e293b;font-size:11px';
    const buildFooter = (pageNo, totalPages) => `
      <div style="margin-top:auto;padding:8px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <span style="${K}font-size:8.8px">CCCF Form A Worker Report · Thai Summit Harness Co., Ltd.</span>
        <span style="${K}font-size:8.8px">${escapeHtml(docNo)} · Page ${pageNo} / ${totalPages}</span>
      </div>`;
    const cccfHeader = (title, subtitle, meta = '') => `
      <div style="background:#065f46;color:#fff;height:112px;box-sizing:border-box;position:relative;flex-shrink:0;overflow:hidden">
        <div style="position:absolute;left:28px;right:28px;top:18px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start">
          <div>
            <p style="${K}font-size:10px;opacity:.82;margin:0 0 3px">Thai Summit Harness Co., Ltd. · Safety Summary Report</p>
            <h1 style="${K}font-size:21px;font-weight:900;margin:0;line-height:1.18">${title}</h1>
            <p style="${K}font-size:11px;opacity:.9;margin:5px 0 0">${subtitle}</p>
          </div>
          <div style="${K}text-align:right;font-size:9.5px;line-height:1.55;opacity:.92">
            <div>Issue Date: ${escapeHtml(issueDate)}</div>
            <div>${meta}</div>
            <div style="margin-top:4px;font-size:8.5px;opacity:.75">${escapeHtml(docNo)}</div>
          </div>
        </div>
      </div>`;
    const sectionTitle = (title, sub = '') => `<div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px"><div><h2 style="${K}font-size:14px;font-weight:900;color:#065f46;margin:0">${title}</h2>${sub ? `<p style="${K}font-size:9.5px;color:#64748b;margin:2px 0 0">${sub}</p>` : ''}</div></div>`;
    const kpiCard = (label, value, tone, sub = '') => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:11px;text-align:center;min-height:72px"><div style="${K}font-size:24px;font-weight:900;color:${tone};line-height:1">${value}</div><div style="${K}font-size:9.5px;color:#475569;margin-top:6px;font-weight:800">${label}</div>${sub ? `<div style="${K}font-size:8.5px;color:#94a3b8;margin-top:2px">${sub}</div>` : ''}</div>`;

    const summaryHtml = (() => {
        const stopCards = filteredStops.map(s =>
            `<div style="background:${s.bg};border:1px solid ${s.border};border-radius:12px;padding:12px 10px;text-align:center">
              <div style="${K}font-size:19px;font-weight:700;color:${s.color};line-height:1">${s.count}</div>
              <div style="${K}font-size:8.5px;font-weight:700;color:${s.color};margin-top:4px">${escapeHtml(s.code)}</div>
            </div>`
        ).join('');

        const criticalTable = criticalRows.length
            ? `<table style="width:100%;border-collapse:collapse">
                <thead>
                  <tr style="background:#fff7ed">
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#7c2d12;text-align:left;border-bottom:1px solid #fed7aa">วันที่</th>
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#7c2d12;text-align:left;border-bottom:1px solid #fed7aa">พนักงาน / Unit</th>
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#7c2d12;text-align:left;border-bottom:1px solid #fed7aa">ประเด็นสำคัญ</th>
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#7c2d12;text-align:center;border-bottom:1px solid #fed7aa;width:42px">Rank</th>
                  </tr>
                </thead>
                <tbody>
                  ${criticalRows.map(r => `
                    <tr>
                      <td style="${K}padding:7px 8px;font-size:8.7px;color:#475569;border-bottom:1px solid #ffedd5">${escapeHtml(formatThaiDate(r.SubmitDate))}</td>
                      <td style="${K}padding:7px 8px;font-size:8.7px;color:#1e293b;border-bottom:1px solid #ffedd5">${escapeHtml(r.EmployeeName || '—')}<div style="${K}font-size:8px;color:#94a3b8">${escapeHtml(r.SafetyUnit || 'ไม่ระบุ Unit')}</div></td>
                      <td style="${K}padding:7px 8px;font-size:8.7px;color:#475569;border-bottom:1px solid #ffedd5">${escapeHtml((r.HazardDescription || '—').slice(0, 90))}${(r.HazardDescription || '').length > 90 ? '...' : ''}</td>
                      <td style="${K}padding:7px 8px;font-size:8.7px;color:${r.Rank === 'A' ? '#dc2626' : '#ea580c'};font-weight:700;text-align:center;border-bottom:1px solid #ffedd5">${escapeHtml(r.Rank)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>`
            : `<div style="${K}font-size:9px;color:#94a3b8">ไม่มีรายการ Rank A/B ตามตัวกรองปัจจุบัน</div>`;

        const unitDoneCount = units.filter(unit => unit.target > 0 && unit.remaining === 0).length;
        const unitProgressCount = units.filter(unit => unit.target > 0 && unit.achieved > 0 && unit.remaining > 0).length;
        const unitNotStartedCount = units.filter(unit => unit.target <= 0 || unit.achieved <= 0).length;
        const modeBreakdown = isActual
            ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
                <div style="border:1px solid #dbeafe;border-radius:14px;padding:14px;background:#f8fafc">
                  <div style="${K}font-size:10px;font-weight:800;color:#334155;margin-bottom:10px">ข้อมูลประกอบการตรวจสอบ</div>
                  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
                    ${kpiCard('รายการแบบฟอร์ม', filtered.length.toLocaleString(), '#334155', 'Raw records')}
                    ${kpiCard('ผู้ส่งในรายการที่กรอง', uniqueEmployees.toLocaleString(), '#2563eb', 'ไม่ซ้ำ')}
                    ${kpiCard('Rank A / B', `${filteredRanks.A} / ${filteredRanks.B}`, filteredRanks.A ? '#dc2626' : '#d97706', 'Critical / High')}
                    ${kpiCard('มีไฟล์แนบ', attachmentRecordCount.toLocaleString(), '#7c3aed', 'รายการ')}
                  </div>
                </div>
                <div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px;background:#ffffff">
                  <div style="${K}font-size:10px;font-weight:800;color:#334155;margin-bottom:10px">ประเภทอันตราย Stop 1-6</div>
                  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px">${stopCards}</div>
                </div>
              </div>
              <div style="border:1px solid ${criticalRows.length ? '#fed7aa' : '#bbf7d0'};border-radius:14px;padding:13px 14px;background:${criticalRows.length ? '#fff7ed' : '#f0fdf4'}">
                <div style="${K}font-size:10px;font-weight:800;color:${criticalRows.length ? '#9a3412' : '#166534'};margin-bottom:${criticalRows.length ? '9px' : '0'}">ประเด็น Rank A/B ที่ควรติดตาม</div>
                ${criticalRows.length ? criticalTable : `<div style="${K}font-size:9px;color:#15803d">ไม่พบรายการ Rank A/B ตามตัวกรองปัจจุบัน</div>`}
              </div>`
            : `<div style="border:1px solid #d1fae5;border-radius:14px;padding:14px;background:#f0fdf4">
                <div style="${K}font-size:10px;font-weight:800;color:#065f46;margin-bottom:10px">สถานะ Unit ในโหมด Manual / Override</div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
                  ${kpiCard('ครบเป้า', unitDoneCount.toLocaleString(), '#059669', 'Unit')}
                  ${kpiCard('กำลังดำเนินการ', unitProgressCount.toLocaleString(), '#d97706', 'Unit')}
                  ${kpiCard('ยังไม่เริ่ม / ไม่ตั้งเป้า', unitNotStartedCount.toLocaleString(), '#dc2626', 'Unit')}
                </div>
              </div>`;

        return `<div style="${PAGE_STYLE}">
          ${cccfHeader(
              isActual ? 'CCCF Form A Worker - Actual Records' : 'CCCF Form A Worker - Unit Progress',
              isActual ? 'รายงานผลจากแบบฟอร์มจริงของผู้ปฏิบัติงาน' : 'รายงานความคืบหน้าราย Unit แบบ Manual / Override',
              `ปี ${reportYear + 543} · ${isActual ? 'ACTUAL' : 'MANUAL'}`
          )}
          <div style="flex:1;padding:18px 32px 20px;display:flex;flex-direction:column;gap:14px;min-height:0">
            ${sectionTitle('1. ภาพรวมรายงาน', isActual ? 'KPI หลักนับผู้ส่งจริงไม่ซ้ำตาม Target ราย Unit' : 'KPI หลักใช้ผล Manual / Override ตาม Target ราย Unit')}
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
              ${kpiCard('ต้องส่งทั้งหมด', totalTarget.toLocaleString(), '#1e293b', 'Target')}
              ${kpiCard('ส่งแล้ว', totalAchieved.toLocaleString(), '#059669', isActual ? 'ผู้ส่งจริงไม่ซ้ำ' : 'Manual / Override')}
              ${kpiCard('ยังไม่ส่ง', totalRemaining.toLocaleString(), totalRemaining > 0 ? '#dc2626' : '#059669', 'Remaining')}
              ${kpiCard('ความคืบหน้า', totalTarget > 0 ? `${totalProgress}%` : 'N/A', totalProgress >= 100 ? '#059669' : totalProgress >= 50 ? '#d97706' : '#dc2626', 'Progress')}
            </div>
            <div style="border:1px solid #dbe7df;border-radius:12px;padding:12px 14px;background:#f8fafc">
              <div style="${K}font-size:9px;font-weight:800;color:#64748b;letter-spacing:.8px;margin-bottom:5px">ขอบเขตรายงาน</div>
              <div style="${K}font-size:9px;color:#475569;line-height:1.65">โหมด: ${isActual ? 'คำนวณจากแบบฟอร์มจริง (Actual records)' : 'กรอกผลรวมราย Unit (Manual / Override)'}</div>
              <div style="${K}font-size:9px;color:#475569;line-height:1.65">ปี ${reportYear + 543} · Unit: ${escapeHtml(selectedUnitScope)} · ผู้จัดทำ: ${escapeHtml(currentUser.name || 'ไม่ระบุ')}</div>
              <div style="${K}font-size:9px;color:#475569;line-height:1.65">รายละเอียดรายการ: ${escapeHtml(filterText)}</div>
              <div style="${K}font-size:9px;color:#475569;line-height:1.6">${escapeHtml(unitSourceNote)}</div>
              <div style="${K}font-size:9px;color:#475569;line-height:1.6">${escapeHtml(allocationNote)}</div>
            </div>
            ${modeBreakdown}
            <div style="display:flex;justify-content:space-between;gap:24px;padding-top:6px">
              <div style="flex:1;border-top:1px solid #cbd5e1;padding-top:6px;text-align:center">
                <div style="${K}font-size:8px;color:#94a3b8">Prepared By / ผู้จัดทำรายงาน</div>
                <div style="${K}font-size:9px;color:#334155;font-weight:600;margin-top:2px">${escapeHtml(currentUser.name || '................................')}</div>
              </div>
              <div style="flex:1;border-top:1px solid #cbd5e1;padding-top:6px;text-align:center">
                <div style="${K}font-size:8px;color:#94a3b8">Reviewed / Approved</div>
                <div style="${K}font-size:9px;color:#334155;font-weight:600;margin-top:2px">................................</div>
              </div>
            </div>
          </div>
          __PAGE_FOOTER__
        </div>`;
    })();

    const unitRowsPerPage = 16;
    const unitPages = [];
    for (let start = 0; start < units.length; start += unitRowsPerPage) {
        const rows = units.slice(start, start + unitRowsPerPage);
        const rowsHtml = rows.map((unit, idx) => {
            const progress = unit.target > 0
                ? Math.min(100, Math.round((unit.achieved / unit.target) * 100))
                : 0;
            const progressColor = progress >= 100 ? '#059669' : progress >= 50 ? '#d97706' : '#dc2626';
            const rowNumber = start + idx + 1;
            return `<tr style="background:${rowNumber % 2 === 0 ? '#f8fafc' : '#ffffff'}">
              <td style="${K}padding:10px 8px;font-size:9px;color:#94a3b8;text-align:center;border-bottom:1px solid #e2e8f0">${rowNumber}</td>
              <td style="${K}padding:10px 10px;font-size:9.4px;color:#1e293b;font-weight:700;border-bottom:1px solid #e2e8f0">${escapeHtml(unit.unit)}</td>
              <td style="${K}padding:10px 8px;font-size:9.4px;color:#334155;font-weight:800;text-align:center;border-bottom:1px solid #e2e8f0">${unit.target > 0 ? unit.target.toLocaleString() : 'N/A'}</td>
              <td style="${K}padding:10px 8px;font-size:9.4px;color:#047857;font-weight:800;text-align:center;border-bottom:1px solid #e2e8f0">${unit.achieved.toLocaleString()}</td>
              <td style="${K}padding:10px 8px;font-size:9.4px;color:${unit.remaining > 0 ? '#dc2626' : '#047857'};font-weight:800;text-align:center;border-bottom:1px solid #e2e8f0">${unit.target > 0 ? unit.remaining.toLocaleString() : 'N/A'}</td>
              <td style="${K}padding:10px 10px;border-bottom:1px solid #e2e8f0">
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="height:7px;flex:1;background:#e2e8f0;border-radius:999px;overflow:hidden">
                    <div style="height:100%;width:${progress}%;background:${progressColor};border-radius:999px"></div>
                  </div>
                  <span style="${K}width:34px;text-align:right;font-size:9px;color:${progressColor};font-weight:800">${unit.target > 0 ? `${progress}%` : 'N/A'}</span>
                </div>
              </td>
            </tr>`;
        }).join('');

        unitPages.push(`<div style="${PAGE_STYLE}">
          ${cccfHeader(
              'CCCF Form A Worker - Unit Progress',
              `สรุปความคืบหน้าราย Unit · Unit ${start + 1}-${Math.min(start + unitRowsPerPage, units.length)} / ${units.length}`,
              `ปี ${reportYear + 543} · ${isActual ? 'ACTUAL' : 'MANUAL'}`
          )}
          <div style="flex:1;padding:18px 28px 14px;min-height:0">
            ${sectionTitle('2. ความคืบหน้าราย Unit', `ต้องส่ง / ส่งแล้ว / ยังไม่ส่ง / เปอร์เซ็นต์ · ${unitSourceNote}`)}
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
              ${kpiCard('ต้องส่งทั้งหมด', totalTarget.toLocaleString(), '#1e293b')}
              ${kpiCard('ส่งแล้ว', totalAchieved.toLocaleString(), '#059669')}
              ${kpiCard('ยังไม่ส่ง', totalRemaining.toLocaleString(), totalRemaining > 0 ? '#dc2626' : '#059669')}
              ${kpiCard('ความคืบหน้า', totalTarget > 0 ? `${totalProgress}%` : 'N/A', totalProgress >= 100 ? '#059669' : totalProgress >= 50 ? '#d97706' : '#dc2626')}
            </div>
            <table style="width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #dbe7df">
              <thead>
                <tr style="background:#065f46">
                  <th style="${K}padding:9px 8px;font-size:8.8px;color:#fff;text-align:center;width:30px">#</th>
                  <th style="${K}padding:9px 10px;font-size:8.8px;color:#fff;text-align:left">Unit</th>
                  <th style="${K}padding:9px 8px;font-size:8.8px;color:#fff;text-align:center;width:68px">ต้องส่ง</th>
                  <th style="${K}padding:9px 8px;font-size:8.8px;color:#fff;text-align:center;width:68px">ส่งแล้ว</th>
                  <th style="${K}padding:9px 8px;font-size:8.8px;color:#fff;text-align:center;width:68px">ยังไม่ส่ง</th>
                  <th style="${K}padding:9px 10px;font-size:8.8px;color:#fff;text-align:left;width:190px">ความคืบหน้า</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <div style="margin-top:10px;padding:9px 11px;border:1px solid #d1fae5;border-radius:9px;background:#f0fdf4;${K}font-size:8.8px;color:#166534;line-height:1.5">
              ${escapeHtml(allocationNote)} · แสดงครบทุก Unit ที่มี Target หรือผลการดำเนินงาน
            </div>
          </div>
          __PAGE_FOOTER__
        </div>`);
    }

    const rowsPerPage = 14;
    const detailPages = [];
    for (let start = 0; start < filtered.length; start += rowsPerPage) {
        const rows = filtered.slice(start, start + rowsPerPage);
        const rowsHtml = rows.map((r, idx) => {
            const stop = STOP_TYPES.find(s => +s.id === +r.StopType) || STOP_TYPES[5];
            const rankColor = r.Rank === 'A' ? '#dc2626' : r.Rank === 'B' ? '#ea580c' : '#059669';
            const desc = (r.HazardDescription || '—').trim();
            const attachmentCount = getWorkerAttachments(r).length;
            return `<tr style="background:${(start + idx) % 2 === 0 ? '#ffffff' : '#f8fafc'}">
              <td style="${K}padding:9px 6px;font-size:8.6px;color:#94a3b8;text-align:center;border-bottom:1px solid #eef2f7">${start + idx + 1}</td>
              <td style="${K}padding:9px 7px;font-size:8.6px;color:#475569;border-bottom:1px solid #eef2f7">${escapeHtml(formatThaiDate(r.SubmitDate))}</td>
              <td style="${K}padding:9px 7px;font-size:8.8px;color:#1e293b;font-weight:700;border-bottom:1px solid #eef2f7">${escapeHtml(r.EmployeeName || '—')}<div style="${K}font-size:8px;color:#64748b;font-weight:500">ID: ${escapeHtml(r.EmployeeID || '—')}</div><div style="${K}font-size:7.8px;color:#94a3b8;font-weight:500">${escapeHtml(r.Department || '—')}</div></td>
              <td style="${K}padding:9px 7px;font-size:8.6px;color:#475569;border-bottom:1px solid #eef2f7">${escapeHtml(r.SafetyUnit || '—')}</td>
              <td style="${K}padding:9px 7px;font-size:8.6px;color:#475569;border-bottom:1px solid #eef2f7">${escapeHtml(stop.code)}<div style="${K}font-size:8px;font-weight:800;color:${rankColor};margin-top:2px">Rank ${escapeHtml(r.Rank || '—')}</div></td>
              <td style="${K}padding:9px 7px;font-size:8.6px;color:#475569;border-bottom:1px solid #eef2f7">${escapeHtml(r.JobArea || '—')}</td>
              <td style="${K}padding:9px 7px;font-size:8.5px;color:#334155;border-bottom:1px solid #eef2f7;line-height:1.45">${escapeHtml(desc.slice(0, 180))}${desc.length > 180 ? '...' : ''}</td>
              <td style="${K}padding:9px 6px;font-size:8.4px;color:${attachmentCount > 0 ? '#047857' : '#64748b'};font-weight:700;text-align:center;border-bottom:1px solid #eef2f7">${attachmentCount > 0 ? `${attachmentCount} ไฟล์` : 'ไม่มี'}</td>
            </tr>`;
        }).join('');

        detailPages.push(`<div style="${PAGE_STYLE}">
          ${cccfHeader('CCCF Form A Worker - Actual Records Detail', `รายละเอียดแบบฟอร์มจริง · รายการ ${start + 1}-${Math.min(start + rowsPerPage, filtered.length)} / ${filtered.length}`, `ปี ${reportYear + 543} · ACTUAL`)}
          <div style="flex:1;padding:18px 24px 12px;min-height:0">
            ${sectionTitle('3. รายละเอียดแบบฟอร์มจริง', `EmployeeID / ชื่อ / Unit / Stop / Rank / พื้นที่ / อันตราย / ไฟล์แนบ · ${filterText}`)}
            <table style="width:100%;border-collapse:collapse;table-layout:fixed">
              <thead>
                <tr style="background:#065f46">
                  <th style="${K}padding:7px 6px;font-size:8px;color:#fff;text-align:center;width:26px">#</th>
                  <th style="${K}padding:7px 8px;font-size:8px;color:#fff;text-align:left;width:58px">วันที่</th>
                  <th style="${K}padding:7px 8px;font-size:8px;color:#fff;text-align:left;width:120px">พนักงาน / EmployeeID</th>
                  <th style="${K}padding:7px 8px;font-size:8px;color:#fff;text-align:left;width:82px">Unit</th>
                  <th style="${K}padding:7px 8px;font-size:8px;color:#fff;text-align:left;width:60px">Stop / Rank</th>
                  <th style="${K}padding:7px 8px;font-size:8px;color:#fff;text-align:left;width:88px">พื้นที่ / Area</th>
                  <th style="${K}padding:7px 8px;font-size:8px;color:#fff;text-align:left">รายละเอียดอันตราย / Hazard</th>
                  <th style="${K}padding:7px 6px;font-size:8px;color:#fff;text-align:center;width:48px">ไฟล์แนบ</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          __PAGE_FOOTER__
        </div>`);
    }

    const pageTemplates = [summaryHtml, ...unitPages, ...(isActual ? detailPages : [])];
    const totalPages = pageTemplates.length;
    const pageHTMLs = pageTemplates.map((html, idx) => html.replace('__PAGE_FOOTER__', buildFooter(idx + 1, totalPages)));

    const headerCaptureLooksClipped = canvas => {
        try {
            const context = canvas.getContext('2d', { willReadFrequently: true });
            const bandHeight = Math.max(8, Math.round((canvas.height / 1122) * 12));
            const pixels = context.getImageData(0, 0, canvas.width, bandHeight).data;
            let sampled = 0;
            let nonHeaderPixels = 0;
            for (let y = 0; y < bandHeight; y += 2) {
                for (let x = 0; x < canvas.width; x += 4) {
                    const offset = (y * canvas.width + x) * 4;
                    const distance = Math.abs(pixels[offset] - 6)
                        + Math.abs(pixels[offset + 1] - 95)
                        + Math.abs(pixels[offset + 2] - 70);
                    sampled += 1;
                    if (pixels[offset + 3] > 0 && distance > 70) nonHeaderPixels += 1;
                }
            }
            return nonHeaderPixels > Math.max(12, sampled * 0.002);
        } catch (error) {
            console.warn('CCCF PDF header validation skipped:', error);
            return false;
        }
    };

    const capturePdfPage = async html => {
        const el = document.createElement('div');
        try {
            // Keep the fixed A4 sheet inside the real viewport. html2canvas
            // can crop nodes that are off-screen or document-positioned while
            // the SPA is scrolled, especially on later pages.
            el.style.cssText = 'position:fixed;left:0;top:0;width:794px;height:1122px;z-index:-1;pointer-events:none';
            el.innerHTML = html;
            document.body.appendChild(el);
            await new Promise(resolve => requestAnimationFrame(resolve));
            return await window.html2canvas(el.firstElementChild, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: 794
            });
        } finally {
            el.remove();
        }
    };

    showLoading('กำลังสร้าง PDF...');
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 250));

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        for (let i = 0; i < pageHTMLs.length; i++) {
            showLoading(`กำลังสร้าง PDF... หน้า ${i + 1} / ${pageHTMLs.length}`);
            let canvas = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                canvas = await capturePdfPage(pageHTMLs[i]);
                if (!headerCaptureLooksClipped(canvas)) break;
                if (attempt === 3) throw new Error(`CCCF PDF header capture failed on page ${i + 1}`);
                console.warn(`CCCF PDF header retry: page ${i + 1}, attempt ${attempt + 1}`);
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            if (i > 0) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
        }

        pdf.save(`${docNo}.pdf`);
        console.info('[cccf] Worker PDF export completed', { mode: _cccfWorkerSource, year: _unitYear, pages: pageHTMLs.length });
        showToast(isActual
            ? `ดาวน์โหลด PDF สำเร็จ (${filtered.length} รายการจริง)`
            : `ดาวน์โหลด PDF สำเร็จ (${units.length} Unit)`, 'success');
    } catch (err) {
        console.error('CCCF PDF export error:', err);
        showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error');
    } finally {
        hideLoading();
    }
}

window.exportCccfWorkerPDF = exportCccfWorkerPDF;

window.exportCccfPermanentPDF = async function() {
    if (!window.jspdf || !window.html2canvas) {
        showToast('ไม่พบ jsPDF หรือ html2canvas', 'error');
        return;
    }

    const filtered = getFilteredPermanent();
    if (!filtered.length) {
        showToast('ไม่มีข้อมูลสำหรับส่งออก PDF', 'warning');
        return;
    }

    const K = "font-family:'Kanit',sans-serif;";
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const issueDate = formatThaiDate(now, { day: 'numeric', month: 'long', year: 'numeric' });
    const docNo = `CCCF-PM-${now.getFullYear()}-${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;

    // ── Stats from filtered tracking rows
    const completeRows  = filtered.filter(r => r.status.key === 'complete');
    const onprocessRows = filtered.filter(r => r.status.key === 'onprocess');
    const mustSendRows  = filtered.filter(r => r.status.key === 'must_send');
    const assignedRows  = filtered.filter(r => r.rowType === 'assigned');
    const withFileRows  = filtered.filter(r => !!r.FileUrl);
    const byRankPerm    = { A: 0, B: 0, C: 0 };
    const byStopPerm    = STOP_TYPES.map(s => ({ ...s, count: 0 }));
    filtered.forEach(r => {
        if (r.Rank && byRankPerm[r.Rank] !== undefined) byRankPerm[r.Rank]++;
        const stop = byStopPerm.find(s => +s.id === +r.StopType);
        if (stop) stop.count++;
    });
    const submitPctCalc = assignedRows.length
        ? Math.round((completeRows.filter(r => r.rowType === 'assigned').length / assignedRows.length) * 100)
        : 0;
    const deptProgress  = buildPermanentDepartmentProgress();
    const criticalRows  = filtered
        .filter(r => r.id && (r.Rank === 'A' || r.Rank === 'B'))
        .sort((a, b) => {
            const o = { A: 0, B: 1, C: 2 };
            return (o[a.Rank] ?? 9) - (o[b.Rank] ?? 9) || new Date(b.SubmitDate || 0) - new Date(a.SubmitDate || 0);
        })
        .slice(0, 8);

    const activeFilters = [
        _pSearch      ? `ค้นหา: ${_pSearch}` : '',
        _pFilterDept  ? `ส่วนงาน: ${_pFilterDept}` : '',
        _pFilterStatus ? `สถานะ: ${{ complete: 'สำเร็จ', onprocess: 'กำลังดำเนินการ', must_send: 'ต้องส่ง' }[_pFilterStatus] || _pFilterStatus}` : '',
        _pFilterRank  ? `Rank: ${_pFilterRank}` : '',
        _pFilterStop  ? `Stop: ${STOP_TYPES.find(s => +s.id === +_pFilterStop)?.code || _pFilterStop}` : '',
    ].filter(Boolean);
    const filterText = activeFilters.length ? activeFilters.join(' | ') : 'ไม่มีตัวกรองเพิ่มเติม';

    const PAGE_STYLE = K + 'width:794px;height:1122px;background:#ffffff;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;color:#1e293b;font-size:11px';
    const buildFooter = (pageNo, totalPages) => `
      <div style="margin-top:auto;padding:8px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <span style="${K}font-size:8.8px">CCCF Form A Permanent Report · Thai Summit Harness Co., Ltd.</span>
        <span style="${K}font-size:8.8px">${escapeHtml(docNo)} · Page ${pageNo} / ${totalPages}</span>
      </div>`;
    const cccfHeader = (title, subtitle, meta = '') => `
      <div style="background:#065f46;color:#fff;padding:18px 28px;flex-shrink:0">
        <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start">
          <div>
            <p style="${K}font-size:10px;opacity:.82;margin:0 0 3px">Thai Summit Harness Co., Ltd. · Safety Summary Report</p>
            <h1 style="${K}font-size:21px;font-weight:900;margin:0;line-height:1.18">${title}</h1>
            <p style="${K}font-size:11px;opacity:.9;margin:5px 0 0">${subtitle}</p>
          </div>
          <div style="${K}text-align:right;font-size:9.5px;line-height:1.55;opacity:.92">
            <div>Issue Date: ${escapeHtml(issueDate)}</div>
            <div>${meta}</div>
            <div style="margin-top:4px;font-size:8.5px;opacity:.75">${escapeHtml(docNo)}</div>
          </div>
        </div>
      </div>`;
    const sectionTitle = (title, sub = '') => `<div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px"><div><h2 style="${K}font-size:14px;font-weight:900;color:#065f46;margin:0">${title}</h2>${sub ? `<p style="${K}font-size:9.5px;color:#64748b;margin:2px 0 0">${sub}</p>` : ''}</div></div>`;
    const kpiCard = (label, value, tone, sub = '') => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:11px;text-align:center;min-height:72px"><div style="${K}font-size:24px;font-weight:900;color:${tone};line-height:1">${value}</div><div style="${K}font-size:9.5px;color:#475569;margin-top:6px;font-weight:800">${label}</div>${sub ? `<div style="${K}font-size:8.5px;color:#94a3b8;margin-top:2px">${sub}</div>` : ''}</div>`;

    // ── Summary page
    const summaryHtml = (() => {
        const stopCards = byStopPerm.map(s =>
            `<div style="background:${s.bg};border:1px solid ${s.border};border-radius:12px;padding:12px 10px;text-align:center">
              <div style="${K}font-size:19px;font-weight:700;color:${s.color};line-height:1">${s.count}</div>
              <div style="${K}font-size:8.5px;font-weight:700;color:${s.color};margin-top:4px">${escapeHtml(s.code)}</div>
            </div>`
        ).join('');

        const deptTable = deptProgress.length
            ? `<table style="width:100%;border-collapse:collapse">
                <thead>
                  <tr style="background:#f0fdf4">
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#475569;text-align:left;border-bottom:1px solid #d1fae5">ส่วนงาน</th>
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#475569;text-align:center;border-bottom:1px solid #d1fae5;width:46px">Total</th>
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#475569;text-align:center;border-bottom:1px solid #d1fae5;width:52px">Complete</th>
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#475569;text-align:center;border-bottom:1px solid #d1fae5;width:46px">%</th>
                  </tr>
                </thead>
                <tbody>
                  ${deptProgress.slice(0, 10).map(row => `
                    <tr>
                      <td style="${K}padding:7px 8px;font-size:8.8px;color:#1e293b;border-bottom:1px solid #eef2f7">${escapeHtml(row.department)}</td>
                      <td style="${K}padding:7px 8px;font-size:8.8px;color:#475569;text-align:center;border-bottom:1px solid #eef2f7">${row.total}</td>
                      <td style="${K}padding:7px 8px;font-size:8.8px;color:#059669;text-align:center;border-bottom:1px solid #eef2f7">${row.complete}</td>
                      <td style="${K}padding:7px 8px;font-size:8.8px;font-weight:700;text-align:center;border-bottom:1px solid #eef2f7;color:${row.progressPct >= 100 ? '#059669' : row.progressPct >= 50 ? '#d97706' : '#dc2626'}">${row.progressPct}%</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>`
            : `<div style="${K}font-size:9px;color:#94a3b8">ยังไม่มีข้อมูล Department Progress</div>`;

        const criticalTable = criticalRows.length
            ? `<table style="width:100%;border-collapse:collapse">
                <thead>
                  <tr style="background:#fff7ed">
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#7c2d12;text-align:left;border-bottom:1px solid #fed7aa">วันที่</th>
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#7c2d12;text-align:left;border-bottom:1px solid #fed7aa">ผู้รับผิดชอบ / ส่วนงาน</th>
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#7c2d12;text-align:left;border-bottom:1px solid #fed7aa">Job Area / Stop</th>
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#7c2d12;text-align:center;border-bottom:1px solid #fed7aa;width:42px">Rank</th>
                    <th style="${K}padding:7px 8px;font-size:8.5px;color:#7c2d12;text-align:center;border-bottom:1px solid #fed7aa;width:48px">File</th>
                  </tr>
                </thead>
                <tbody>
                  ${criticalRows.map(r => {
                      const stop = STOP_TYPES.find(s => +s.id === +r.StopType) || STOP_TYPES[5];
                      return `<tr>
                        <td style="${K}padding:7px 8px;font-size:8.7px;color:#475569;border-bottom:1px solid #ffedd5">${escapeHtml(formatThaiDate(r.SubmitDate))}</td>
                        <td style="${K}padding:7px 8px;font-size:8.7px;color:#1e293b;border-bottom:1px solid #ffedd5"><div style="${K}font-size:7.8px;font-weight:800;color:#047857">${escapeHtml(getPermanentNumber(r))}</div>${escapeHtml(r.displayName || '—')}<div style="${K}font-size:8px;color:#94a3b8">${escapeHtml(r.Department || '—')}</div></td>
                        <td style="${K}padding:7px 8px;font-size:8.7px;color:#475569;border-bottom:1px solid #ffedd5">${escapeHtml((r.JobArea || '—').slice(0, 55))}${(r.JobArea || '').length > 55 ? '...' : ''}<div style="${K}font-size:8px;color:#94a3b8">${escapeHtml(stop.code)}</div></td>
                        <td style="${K}padding:7px 8px;font-size:8.7px;font-weight:700;text-align:center;border-bottom:1px solid #ffedd5;color:${r.Rank === 'A' ? '#dc2626' : '#ea580c'}">${escapeHtml(r.Rank)}</td>
                        <td style="${K}padding:7px 8px;font-size:8.5px;text-align:center;border-bottom:1px solid #ffedd5;color:${r.FileUrl ? '#059669' : '#94a3b8'}">${r.FileUrl ? 'มีไฟล์' : '—'}</td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>`
            : `<div style="${K}font-size:9px;color:#94a3b8">ไม่มีรายการ Rank A/B ตามตัวกรองปัจจุบัน</div>`;

        return `<div style="${PAGE_STYLE}">
          ${cccfHeader('CCCF Form A Permanent Report', 'รายงานสรุปผลการดำเนินการแก้ไขถาวร', 'For Management Review')}
          <div style="flex:1;padding:18px 32px 20px;display:flex;flex-direction:column;gap:14px;min-height:0">
            ${sectionTitle('1. Report Summary / ภาพรวมรายงาน', 'สรุปสถานะการส่งเอกสารและการแก้ไขถาวรตามตัวกรองปัจจุบัน')}
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
              ${kpiCard('รายการทั้งหมด', filtered.length, '#0f766e', 'Total Tracked')}
              ${kpiCard('สำเร็จ', completeRows.length, '#059669', 'Complete')}
              ${kpiCard('Rank A', byRankPerm.A, byRankPerm.A ? '#dc2626' : '#64748b', 'Critical')}
              ${kpiCard('อัตราสำเร็จ', submitPctCalc+'%', submitPctCalc >= 80 ? '#059669' : submitPctCalc >= 50 ? '#d97706' : '#dc2626', 'Completion Rate')}
            </div>
            <div style="border:1px solid #dbe7df;border-radius:12px;padding:12px 14px;background:#f8fafc">
              <div style="${K}font-size:9px;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">Report Scope / ขอบเขตรายงาน</div>
              <div style="${K}font-size:9px;color:#475569;line-height:1.6">Filters Applied: ${escapeHtml(filterText)}</div>
              <div style="${K}font-size:9px;color:#475569;line-height:1.6">ผู้จัดทำ: ${escapeHtml(currentUser.name || 'ไม่ระบุ')} · สำเร็จ ${completeRows.length} · กำลังดำเนินการ ${onprocessRows.length} · ต้องส่ง ${mustSendRows.length} · มีไฟล์แนบ ${withFileRows.length}</div>
            </div>
            <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:14px">
              <div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px;background:#ffffff">
                <div style="${K}font-size:10px;font-weight:700;color:#334155;margin-bottom:10px">Department Progress / ความสำเร็จรายส่วนงาน</div>
                ${deptTable}
              </div>
              <div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px;background:#ffffff">
                <div style="${K}font-size:10px;font-weight:700;color:#334155;margin-bottom:10px">Stop Type Distribution / สัดส่วนประเภทอันตราย</div>
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${stopCards}</div>
              </div>
            </div>
            <div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px;background:#ffffff;flex:1;min-height:0">
              <div style="${K}font-size:10px;font-weight:700;color:#334155;margin-bottom:10px">Priority Issues for Management Attention / Rank A &amp; B</div>
              ${criticalTable}
            </div>
            <div style="display:flex;justify-content:space-between;gap:24px;padding-top:6px">
              <div style="flex:1;border-top:1px solid #cbd5e1;padding-top:6px;text-align:center">
                <div style="${K}font-size:8px;color:#94a3b8">Prepared By / ผู้จัดทำรายงาน</div>
                <div style="${K}font-size:9px;color:#334155;font-weight:600;margin-top:2px">${escapeHtml(currentUser.name || '................................')}</div>
              </div>
              <div style="flex:1;border-top:1px solid #cbd5e1;padding-top:6px;text-align:center">
                <div style="${K}font-size:8px;color:#94a3b8">Reviewed / Approved</div>
                <div style="${K}font-size:9px;color:#334155;font-weight:600;margin-top:2px">................................</div>
              </div>
            </div>
          </div>
          __FOOTER_SUMMARY__
        </div>`;
    })();

    // ── Detail pages
    const rowsPerPage = 24;
    const detailPages = [];
    for (let start = 0; start < filtered.length; start += rowsPerPage) {
        const rows = filtered.slice(start, start + rowsPerPage);
        const rowsHtml = rows.map((r, idx) => {
            const stop        = STOP_TYPES.find(s => +s.id === +r.StopType) || STOP_TYPES[5];
            const rankColor   = r.Rank === 'A' ? '#dc2626' : r.Rank === 'B' ? '#ea580c' : r.Rank === 'C' ? '#059669' : '#94a3b8';
            const statusLabel = r.status.key === 'complete' ? 'สำเร็จ' : r.status.key === 'onprocess' ? 'กำลังดำเนินการ' : 'ต้องส่ง';
            const statusColor = r.status.key === 'complete' ? '#059669' : r.status.key === 'onprocess' ? '#d97706' : '#dc2626';
            return `<tr style="background:${(start + idx) % 2 === 0 ? '#ffffff' : '#f8fafc'}">
              <td style="${K}padding:6px 6px;font-size:8.3px;color:#94a3b8;text-align:center;border-bottom:1px solid #eef2f7">${start + idx + 1}</td>
              <td style="${K}padding:6px 8px;font-size:8.3px;color:#475569;border-bottom:1px solid #eef2f7">${escapeHtml(formatThaiDate(r.SubmitDate))}</td>
              <td style="${K}padding:6px 8px;font-size:8.4px;color:#1e293b;border-bottom:1px solid #eef2f7"><div style="${K}font-size:7.5px;font-weight:800;color:#047857">${escapeHtml(getPermanentNumber(r))}</div>${escapeHtml(r.displayName || '—')}<div style="${K}font-size:7.6px;color:#94a3b8">${escapeHtml(r.Department || '—')}</div></td>
              <td style="${K}padding:6px 8px;font-size:8.2px;font-weight:700;color:${statusColor};border-bottom:1px solid #eef2f7">${statusLabel}</td>
              <td style="${K}padding:6px 8px;font-size:8.2px;color:#475569;border-bottom:1px solid #eef2f7">${escapeHtml(stop.code)}<div style="${K}font-size:7.6px;font-weight:700;color:${rankColor}">${r.Rank ? `Rank ${escapeHtml(r.Rank)}` : '—'}</div></td>
              <td style="${K}padding:6px 8px;font-size:8.2px;color:#475569;border-bottom:1px solid #eef2f7">${escapeHtml((r.JobArea || '—').slice(0, 60))}${(r.JobArea || '').length > 60 ? '...' : ''}${r.Summary ? `<div style="${K}font-size:7.6px;color:#94a3b8">${escapeHtml(r.Summary.slice(0, 60))}${r.Summary.length > 60 ? '...' : ''}</div>` : ''}</td>
              <td style="${K}padding:6px 8px;font-size:8.2px;text-align:center;border-bottom:1px solid #eef2f7;color:${r.FileUrl ? '#059669' : '#94a3b8'}">${r.FileUrl ? 'มีไฟล์' : '—'}</td>
            </tr>`;
        }).join('');

        detailPages.push(`<div style="${PAGE_STYLE}">
          ${cccfHeader('CCCF Form A Permanent Detail', `รายงานรายละเอียดตารางติดตาม · Records ${start + 1}-${Math.min(start + rowsPerPage, filtered.length)} / ${filtered.length}`, 'For Management Review')}
          <div style="flex:1;padding:18px 24px 12px;min-height:0">
            ${sectionTitle('2. Tracking Register / ตารางติดตาม', `Records ${start + 1}-${Math.min(start + rowsPerPage, filtered.length)} ตามเงื่อนไขที่เลือก`)}
            <table style="width:100%;border-collapse:collapse;table-layout:fixed">
              <thead>
                <tr style="background:#065f46">
                  <th style="${K}padding:7px 6px;font-size:8px;color:#fff;text-align:center;width:26px">#</th>
                  <th style="${K}padding:7px 8px;font-size:8px;color:#fff;text-align:left;width:58px">Last Update</th>
                  <th style="${K}padding:7px 8px;font-size:8px;color:#fff;text-align:left;width:130px">ผู้รับผิดชอบ / ส่วนงาน</th>
                  <th style="${K}padding:7px 8px;font-size:8px;color:#fff;text-align:left;width:66px">Status</th>
                  <th style="${K}padding:7px 8px;font-size:8px;color:#fff;text-align:left;width:66px">Stop / Rank</th>
                  <th style="${K}padding:7px 8px;font-size:8px;color:#fff;text-align:left">Job Area / Summary</th>
                  <th style="${K}padding:7px 8px;font-size:8px;color:#fff;text-align:center;width:44px">File</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          __FOOTER_DETAIL_${start}__
        </div>`);
    }

    const totalPages = 1 + detailPages.length;
    const pageHTMLs  = [
        summaryHtml.replace('__FOOTER_SUMMARY__', buildFooter(1, totalPages)),
        ...detailPages.map((html, idx) => html.replace(`__FOOTER_DETAIL_${idx * rowsPerPage}__`, buildFooter(idx + 2, totalPages))),
    ];

    showLoading('กำลังสร้าง PDF...');
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 250));

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        for (let i = 0; i < pageHTMLs.length; i++) {
            showLoading(`กำลังสร้าง PDF... หน้า ${i + 1} / ${pageHTMLs.length}`);
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1';
            el.innerHTML = pageHTMLs[i];
            document.body.appendChild(el);
            const canvas = await window.html2canvas(el.firstElementChild, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: 794,
            });
            document.body.removeChild(el);
            if (i > 0) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
        }

        pdf.save(`${docNo}.pdf`);
        showToast(`ดาวน์โหลด PDF สำเร็จ (${filtered.length} รายการ)`, 'success');
    } catch (err) {
        console.error('CCCF Permanent PDF export error:', err);
        showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error');
    } finally {
        hideLoading();
    }
};

// ─── Main Render ──────────────────────────────────────────────────────────────
function renderCccfHeroKpis() {
    let items;
    if (_activeCccfTab === 'permanent') {
        const trackingRows = buildPermanentTrackingRows();
        const byRank = { A: 0, B: 0, C: 0 };
        _permanentData.forEach(row => {
            if (byRank[row.Rank] !== undefined) byRank[row.Rank] += 1;
        });
        const { totalAssigned, completedCount, submitPct } = getPermanentProgressStats();
        items = [
            { label: 'รายการติดตามทั้งหมด', val: trackingRows.length, color: '#fff' },
            { label: 'Rank A (วิกฤต)', val: byRank.A, color: '#fca5a5' },
            { label: 'Rank B (หยุดงาน)', val: byRank.B, color: '#fdba74' },
            { label: 'Rank C (เล็กน้อย)', val: byRank.C, color: '#6ee7b7' },
            { label: 'ส่ง Permanent แล้ว', val: `${completedCount}/${totalAssigned}`, color: '#a5f3fc' },
            { label: 'ความคืบหน้า Permanent', val: `${submitPct}%`, color: submitPct >= 100 ? '#6ee7b7' : submitPct >= 50 ? '#fdba74' : '#fca5a5' },
        ];
    } else {
        const units = buildUnitData();
        const target = units.reduce((sum, row) => sum + Number(row.target || 0), 0);
        const achieved = units.reduce((sum, row) => sum + Number(row.achieved || 0), 0);
        const progress = target > 0 ? Math.round((Math.min(achieved, target) / target) * 100) : 0;
        if (_cccfWorkerSource === 'actual_department_worker') {
            const workerYearData = getCccfWorkerRecordsForYear(_unitYear);
            const byRank = { A: 0, B: 0, C: 0 };
            workerYearData.forEach(row => {
                if (byRank[row.Rank] !== undefined) byRank[row.Rank] += 1;
            });
            const withPhotos = workerYearData.filter(row => getWorkerAttachments(row).length > 0).length;
            items = [
                { label: `รายงาน Worker ปี ${_unitYear + 543}`, val: workerYearData.length, color: '#fff' },
                { label: 'Rank A (วิกฤต)', val: byRank.A, color: '#fca5a5' },
                { label: 'Rank B (หยุดงาน)', val: byRank.B, color: '#fdba74' },
                { label: 'Rank C (เล็กน้อย)', val: byRank.C, color: '#6ee7b7' },
                { label: 'มีรูปแนบ', val: withPhotos, color: '#a5f3fc' },
                { label: 'ความคืบหน้า Worker', val: target > 0 ? `${progress}%` : '—', color: progress >= 100 ? '#6ee7b7' : progress >= 50 ? '#fdba74' : '#fca5a5' },
            ];
        } else {
            const completedUnits = units.filter(row => row.status === 'done').length;
            const progressUnits = units.filter(row => row.status === 'progress').length;
            const waitingUnits = units.filter(row => row.status === 'not_started' || row.status === 'unset').length;
            items = [
                { label: `Target ปี ${_unitYear + 543}`, val: target.toLocaleString(), color: '#fff' },
                { label: 'Achieved / Override', val: achieved.toLocaleString(), color: '#6ee7b7' },
                { label: 'ความคืบหน้า Manual', val: target > 0 ? `${progress}%` : '—', color: progress >= 100 ? '#6ee7b7' : progress >= 50 ? '#fdba74' : '#fca5a5' },
                { label: 'Unit ครบเป้า', val: completedUnits, color: '#6ee7b7' },
                { label: 'Unit กำลังดำเนินการ', val: progressUnits, color: '#fdba74' },
                { label: 'Unit ยังไม่เริ่ม/ไม่ตั้งเป้า', val: waitingUnits, color: '#fca5a5' },
            ];
        }
    }

    return items.map(item => `<div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12)">
      <p class="text-2xl font-bold" style="color:${item.color}">${escapeHtml(item.val)}</p>
      <p class="text-[10px] mt-0.5" style="color:rgba(167,243,208,0.8)">${escapeHtml(item.label)}</p>
    </div>`).join('');
}

function refreshCccfHeroKpis() {
    const heroKpis = document.getElementById('cccf-hero-kpis');
    if (heroKpis) heroKpis.innerHTML = renderCccfHeroKpis();
}

function renderPage(container) {
    const { totalAssigned, completedCount, submitPct } = getPermanentProgressStats();
    const totalTracked = getFilteredPermanent().length;
    const isActualWorkerMode = _cccfWorkerSource === 'actual_department_worker';
    const manualLegacyCount = getCccfWorkerRecordsForYear(_unitYear).length;

    const today = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const deptOpts = ['', ...[...new Set(_workerData.map(r => r.Department).filter(Boolean))].sort()]
        .map(d => `<option value="${escapeAttr(d)}">${escapeHtml(d || '— ทุกส่วนงาน —')}</option>`).join('');
    const permDeptOpts = ['', ...[...new Set([..._assignments.map(r => r.Department), ..._permanentData.map(r => r.Department)].filter(Boolean))].sort()]
        .map(d => `<option value="${escapeAttr(d)}">${escapeHtml(d || '— ทุกส่วนงาน —')}</option>`).join('');

    container.innerHTML = `
    <div class="space-y-6 animate-fade-in pb-10">

      <!-- ═══ HERO ═══ -->
      <div class="relative overflow-hidden rounded-2xl" data-cccf-card-image="cccf-hero-summary" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
        <div class="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%"><defs><pattern id="cccf-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#cccf-dots)"/></svg>
        </div>
        <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>
        <div class="relative z-10 p-6">
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                  CCCF Activity
                </span>
              </div>
              <h1 class="text-2xl font-bold text-white">ค้นหาอันตราย & ปรับปรุงสภาพแวดล้อม</h1>
              <p class="text-sm mt-1" style="color:rgba(167,243,208,0.8)">Concern · Care · Continuous Find & Fix</p>
            </div>
            <div class="text-right flex-shrink-0">
              <p class="text-xs" style="color:rgba(167,243,208,0.7)">${escapeHtml(today)}</p>
              <p class="text-sm font-semibold text-white mt-0.5">${escapeHtml(currentUser.name || '—')}</p>
            </div>
          </div>
          <div id="cccf-hero-kpis" class="grid grid-cols-2 md:grid-cols-6 gap-3 mt-5">
            ${renderCccfHeroKpis()}
          </div>
        </div>
      </div>

      <!-- ═══ TABS ═══ -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-1 flex gap-1 max-w-md" data-cccf-card-ignore>
        <button id="btn-tab-worker" onclick="window._cccfSwitchTab('worker')"
          class="flex-1 py-2.5 text-sm font-bold text-white rounded-xl shadow-sm flex justify-center items-center gap-2 transition-all"
          style="background:linear-gradient(135deg,#059669,#0d9488)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          Form A Worker
        </button>
        <button id="btn-tab-permanent" onclick="window._cccfSwitchTab('permanent')"
          class="flex-1 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 rounded-xl flex justify-center items-center gap-2 transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          Form A Permanent
          ${submitPct < 100 && totalAssigned > 0
            ? `<span class="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white bg-amber-500">${Math.max(0, totalAssigned - completedCount)}</span>` : ''}
        </button>
      </div>

      <!-- ═══ WORKER TAB ═══ -->
      <div id="content-worker" class="space-y-5 animate-fade-in">

        <!-- Action bar -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3" data-cccf-card-ignore>
          <div>
            <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 10px rgba(5,150,105,0.3)">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              </span>
              CCCF Form A — Worker
            </h2>
            <p class="text-sm text-slate-400 mt-0.5 ml-10">การค้นหาอันตรายจากผู้ปฏิบัติงาน</p>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            <button id="btn-export-worker-pdf" type="button"
              class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M4 17v1a2 2 0 002 2h12a2 2 0 002-2v-1M7 7l4.586-4.586a2 2 0 012.828 0L19 7"/></svg>
              Export PDF
            </button>
            ${isActualWorkerMode ? `
            <button id="btn-open-worker-form"
              class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:shadow-md transition-all"
              style="background:linear-gradient(135deg,#059669,#0d9488)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              ส่งแบบฟอร์ม CCCF
            </button>` : ''}
          </div>
        </div>

        ${renderCccfWorkerModePanel()}

        <div id="cccf-worker-actual-overview" class="${isActualWorkerMode ? 'space-y-5' : 'hidden'}">
        ${renderCccfFormsUserCard(_cccfForms)}

        <!-- Rank criteria -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3" data-cccf-card-image="cccf-rank-criteria">
          ${RANKS.map(r => `
          <div class="bg-white rounded-xl p-4 border flex items-start gap-3 shadow-sm" style="border-color:${r.border}">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 text-white" style="background:${r.color}">${r.rank}</div>
            <div class="min-w-0">
              <p class="font-bold text-sm" style="color:${r.color}">${r.label}</p>
              <p class="text-xs text-slate-500 mt-0.5 leading-snug">${r.desc}</p>
              <span class="text-[10px] font-bold mt-1.5 px-2 py-0.5 rounded-full inline-block" style="background:${r.color}15;color:${r.color}">ระยะเวลา ${r.detail}</span>
            </div>
          </div>`).join('')}
        </div>

        <!-- ═══ การ์ดของฉัน ═══ -->
        <div id="cccf-my-card-wrap">${renderMyCard()}</div>

        <!-- Stop 1–6 -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5" data-cccf-card-image="cccf-stop-type-summary" style="box-shadow:0 4px 16px rgba(5,150,105,0.08)">
          <h3 class="text-sm font-bold text-slate-700 mb-4">อันตราย 6 ประการ (Stop 1–6)</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            ${STOP_TYPES.map(s => {
                const cnt = getCccfWorkerRecordsForYear(_unitYear).filter(r => r.StopType == s.id).length;
                return `<div class="rounded-xl border p-3 text-center cursor-pointer transition-all hover:shadow-md" style="background:${s.bg};border-color:${s.border}" onclick="window._wSetStop(${s.id})">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2" style="background:${s.color}20">
                    <svg class="w-4 h-4" style="color:${s.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${s.icon}"/></svg>
                  </div>
                  <p class="text-2xl font-black" style="color:${cnt > 0 ? s.color : '#cbd5e1'}">${cnt}</p>
                  <p class="text-[9px] font-bold mt-0.5" style="color:${s.color}">${s.code}</p>
                </div>`;
            }).join('')}
          </div>
        </div>
        </div>

        <!-- Unit summary — full width -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5" data-cccf-card-image="cccf-unit-summary-board" style="box-shadow:0 4px 16px rgba(5,150,105,0.08)">
          <div class="mb-4">
            <h3 class="text-sm font-bold text-slate-700">สรุปราย Unit</h3>
            <p class="text-[10px] text-slate-400 mt-0.5">${_cccfWorkerSource === 'actual_department_worker'
              ? 'คลิก Unit เพื่อกรองตาราง · Target ชุดเดียวกับ Manual / Override · Done นับผู้ส่ง Form A Worker จริงแบบไม่ซ้ำในปีและ Unit ที่เลือก'
              : 'Target จาก CCCF_Unit_Targets · Done ใช้ Manual / Override · Admin กดไอคอนดินสอเพื่อแก้ไขผลราย Unit'}</p>
          </div>
          <div id="cccf-unit-summary">
            <div id="cccf-unit-summary-inner">${renderUnitSummary()}</div>
          </div>
        </div>

        ${!isActualWorkerMode && isAdmin ? `
        <details id="cccf-manual-legacy-records" class="rounded-2xl border border-amber-200 bg-amber-50/60 overflow-hidden" data-cccf-card-ignore>
          <summary class="cursor-pointer list-none px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-amber-50">
            <div>
              <p class="text-sm font-black text-amber-900">ข้อมูล Actual เดิม · ปี ${_unitYear + 543}</p>
              <p class="text-[11px] text-amber-700 mt-0.5">เก็บข้อมูลไว้ครบเพื่อการตรวจสอบ แต่ไม่นำมาคำนวณในโหมด Manual / Override</p>
            </div>
            <span class="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-amber-200 text-xs font-black text-amber-800">${manualLegacyCount.toLocaleString()} รายการ · คลิกเพื่อเปิดดู</span>
          </summary>
          <div class="p-4 pt-0">` : !isActualWorkerMode ? '<div class="hidden">' : ''}

        <!-- Submission table — full width -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" data-cccf-card-image="cccf-worker-all-records" style="box-shadow:0 4px 16px rgba(5,150,105,0.08)">
          <!-- Filter bar -->
          <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/60" data-cccf-card-ignore>
            <div class="flex flex-wrap gap-2 items-center">
              <h3 class="text-sm font-bold text-slate-700 mr-1">รายการทั้งหมด</h3>
              <div class="w-px h-4 bg-slate-200"></div>
              <div class="relative flex-1 min-w-[140px]">
                <svg class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input id="w-search" type="text" placeholder="ค้นหาชื่อ, อันตราย..." value="${_wSearch}"
                  class="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200">
              </div>
              <select id="w-filter-dept" class="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 text-slate-600">
                ${deptOpts}
              </select>
              <select id="w-filter-rank" class="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 text-slate-600">
                <option value="">— ทุก Rank —</option>
                ${RANKS.map(r => `<option value="${r.rank}" ${_wFilterRank === r.rank ? 'selected' : ''}>${r.label}</option>`).join('')}
              </select>
              <select id="w-filter-stop" class="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 text-slate-600">
                <option value="0">— ทุก Stop —</option>
                ${STOP_TYPES.map(s => `<option value="${s.id}" ${_wFilterStop == s.id ? 'selected' : ''}>${s.code}</option>`).join('')}
              </select>
              <select id="w-filter-photo" class="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 text-slate-600">
                <option value="">— รูปแนบทั้งหมด —</option>
                <option value="with" ${_wFilterPhoto === 'with' ? 'selected' : ''}>มีรูปแนบ</option>
                <option value="without" ${_wFilterPhoto === 'without' ? 'selected' : ''}>ไม่มีรูปแนบ</option>
              </select>
              ${(_wSearch || _wFilterDept || _wFilterUnit || _wFilterRank || _wFilterStop || _wFilterPhoto)
                ? `<button id="w-clear-filter" class="text-xs px-3 py-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 transition-colors font-semibold">ล้างตัวกรอง</button>`
                : ''}
              <span class="text-[10px] text-slate-400 ml-auto whitespace-nowrap" id="w-count-label"></span>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr style="background:linear-gradient(135deg,#064e3b,#065f46)">
                  <th class="px-4 py-3 text-left text-[10px] font-bold text-emerald-100 uppercase">ชื่อ / ส่วนงาน</th>
                  <th class="px-4 py-3 text-left text-[10px] font-bold text-emerald-100 uppercase">Stop / Unit / พื้นที่</th>
                  <th class="px-4 py-3 text-left text-[10px] font-bold text-emerald-100 uppercase">รายละเอียดอันตราย</th>
                  <th class="px-4 py-3 text-center text-[10px] font-bold text-emerald-100 uppercase w-16">Rank</th>
                  <th class="px-4 py-3 text-center text-[10px] font-bold text-emerald-100 uppercase w-20">วันที่</th>
                  ${isAdmin ? `<th class="px-4 py-3 text-center text-[10px] font-bold text-emerald-100 uppercase w-24">Actions</th>` : ''}
                </tr>
              </thead>
              <tbody id="worker-table-body">${renderWorkerRows(getPagedWorker(getFilteredWorker()))}</tbody>
            </table>
          </div>
          <!-- Pagination -->
          <div id="w-pagination" class="px-5 py-3 border-t border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-cccf-card-ignore>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[10px] text-slate-400" id="w-page-info"></span>
              <select id="w-page-size" class="text-xs py-1.5 px-2 rounded-lg border border-slate-200 bg-white text-slate-600 focus:outline-none focus:border-emerald-400">
                ${W_PAGE_SIZE_OPTIONS.map(size => `<option value="${size}" ${String(_wPageSize) === String(size) ? 'selected' : ''}>${size === 'all' ? 'ทั้งหมด' : `${size} แถว`}</option>`).join('')}
              </select>
            </div>
            <div class="flex gap-2">
              <button id="w-prev-page" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">ก่อนหน้า</button>
              <button id="w-next-page" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">ถัดไป</button>
            </div>
          </div>
        </div>
        ${!isActualWorkerMode && isAdmin ? '</div></details>' : !isActualWorkerMode ? '</div>' : ''}
      </div>

      <!-- ═══ PERMANENT TAB ═══ -->
      <div id="content-permanent" class="hidden space-y-5 animate-fade-in">

        <!-- Action bar -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3" data-cccf-card-ignore>
          <div>
            <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 10px rgba(5,150,105,0.3)">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </span>
              CCCF Form A — Permanent
            </h2>
            <p class="text-sm text-slate-400 mt-0.5 ml-10">การส่งผลการดำเนินการถาวร</p>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            ${isAdmin ? `<button id="btn-manage-assignments"
              class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 bg-white transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              จัดการการมอบหมาย
            </button>` : ''}
            ${isAdmin ? `<button id="btn-manage-cccf-forms"
              class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-sky-200 text-sky-700 hover:bg-sky-50 bg-white transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              แบบฟอร์ม
            </button>` : ''}
            <button onclick="window.exportCccfPermanentPDF&&window.exportCccfPermanentPDF()"
              class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              Export PDF
            </button>
            <button id="btn-open-permanent-form"
              class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:shadow-md transition-all"
              style="background:linear-gradient(135deg,#059669,#0d9488)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              ส่งแบบฟอร์ม
            </button>
          </div>
        </div>

        ${renderCccfFormsUserCard(_cccfForms)}
        ${renderPermanentAdminReviewPanel()}

        <!-- Progress bar -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5" data-cccf-card-image="cccf-permanent-progress" style="box-shadow:0 4px 16px rgba(5,150,105,0.08)">
          <div class="flex items-center gap-5">
            <div class="relative w-16 h-16 flex-shrink-0">
              <svg class="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="26" fill="none" stroke="#f1f5f9" stroke-width="7"/>
                <circle cx="32" cy="32" r="26" fill="none"
                  stroke="${submitPct >= 100 ? '#10b981' : submitPct >= 50 ? '#f59e0b' : '#ef4444'}"
                  stroke-width="7" stroke-linecap="round"
                  stroke-dasharray="${(2*Math.PI*26).toFixed(1)}"
                  stroke-dashoffset="${((1-submitPct/100)*2*Math.PI*26).toFixed(1)}"
                  style="transition:stroke-dashoffset 1s ease"/>
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <span class="text-xs font-bold text-slate-700">${submitPct}%</span>
              </div>
            </div>
            <div class="flex-1">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-bold text-slate-700">ความคืบหน้าการส่งแบบฟอร์ม Permanent</span>
                <span class="text-xs text-slate-400 font-semibold">${completedCount} / ${totalAssigned} คน</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden mb-2">
                <div class="h-full rounded-full transition-all duration-700"
                  style="width:${submitPct}%;background:${submitPct>=100?'linear-gradient(90deg,#10b981,#34d399)':submitPct>=50?'linear-gradient(90deg,#f59e0b,#fcd34d)':'linear-gradient(90deg,#ef4444,#f87171)'}"></div>
              </div>
              <div class="flex gap-4 text-xs text-slate-500">
                <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>Complete ${completedCount}</span>
                <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-red-400 inline-block"></span>ยังไม่ Complete ${Math.max(0,totalAssigned-completedCount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div id="permanent-dashboard-wrap">${renderPermanentDashboardExecutive()}</div>

        <!-- Permanent submission table -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" data-cccf-card-image="cccf-permanent-tracking-table" style="box-shadow:0 4px 16px rgba(5,150,105,0.08)">
          <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex flex-wrap gap-2 items-center" data-cccf-card-ignore>
            <h3 class="text-sm font-bold text-slate-700 mr-2">ตารางติดตาม Form A Permanent</h3>
            <div class="flex flex-wrap gap-1.5 w-full sm:w-auto">
              ${renderPermanentStatusFilterChips()}
            </div>
            <div class="relative flex-1 min-w-[140px]">
              <svg class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input id="p-search" type="text" placeholder="ค้นหาชื่อ, ส่วนงาน, งาน..." value="${_pSearch}"
                class="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200">
            </div>
            <select id="p-filter-dept" class="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 text-slate-600">
              ${permDeptOpts}
            </select>
            <select id="p-filter-status" class="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 text-slate-600">
              <option value="">ทุก Status</option>
              <option value="must_send" ${_pFilterStatus === 'must_send' ? 'selected' : ''}>ต้องส่ง</option>
              <option value="pending_review" ${_pFilterStatus === 'pending_review' ? 'selected' : ''}>รอตรวจ Excel</option>
              <option value="approved" ${_pFilterStatus === 'approved' ? 'selected' : ''}>รอ PDF ลงนาม</option>
              <option value="rejected" ${_pFilterStatus === 'rejected' ? 'selected' : ''}>ต้องแก้ Excel</option>
              <option value="complete" ${_pFilterStatus === 'complete' ? 'selected' : ''}>ปิดงานแล้ว</option>
            </select>
            <select id="p-filter-due" class="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 text-slate-600">
              <option value="">ทุก Due</option>
              <option value="overdue" ${_pFilterDue === 'overdue' ? 'selected' : ''}>Overdue</option>
              <option value="due_soon" ${_pFilterDue === 'due_soon' ? 'selected' : ''}>Due Soon</option>
              <option value="no_due" ${_pFilterDue === 'no_due' ? 'selected' : ''}>No Due Date</option>
            </select>
            <select id="p-filter-due" class="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 text-slate-600">
              <option value="">ทุก Due</option>
              <option value="overdue" ${_pFilterDue === 'overdue' ? 'selected' : ''}>Overdue</option>
              <option value="due_soon" ${_pFilterDue === 'due_soon' ? 'selected' : ''}>Due Soon</option>
              <option value="no_due" ${_pFilterDue === 'no_due' ? 'selected' : ''}>No Due Date</option>
            </select>
            <select id="p-filter-rank" class="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 text-slate-600">
              <option value="">ทุก Rank</option>
              ${RANKS.map(r => `<option value="${r.rank}" ${_pFilterRank === r.rank ? 'selected' : ''}>${r.label}</option>`).join('')}
            </select>
            <select id="p-filter-stop" class="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 text-slate-600">
              <option value="0">ทุก Stop</option>
              ${STOP_TYPES.map(s => `<option value="${s.id}" ${+_pFilterStop === +s.id ? 'selected' : ''}>${s.code}</option>`).join('')}
            </select>
            <button id="p-clear-filter" class="text-xs px-3 py-2 rounded-xl text-slate-500 hover:text-red-500 hover:bg-red-50 border border-slate-200 transition-colors font-semibold">ล้างตัวกรอง</button>
            <span class="text-[10px] text-slate-400 ml-auto" id="p-count-label">${totalTracked} รายการ</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr style="background:linear-gradient(135deg,#064e3b,#065f46)">
                  <th class="px-4 py-3 text-left text-[10px] font-bold text-emerald-100 uppercase">ผู้รับผิดชอบ / ส่วนงาน</th>
                  <th class="px-4 py-3 text-center text-[10px] font-bold text-emerald-100 uppercase w-28">Status</th>
                  <th class="px-4 py-3 text-left text-[10px] font-bold text-emerald-100 uppercase">Job Area / Summary</th>
                  <th class="px-4 py-3 text-center text-[10px] font-bold text-emerald-100 uppercase w-28">Stop / Rank</th>
                  <th class="px-4 py-3 text-center text-[10px] font-bold text-emerald-100 uppercase w-20">File</th>
                  <th class="px-4 py-3 text-center text-[10px] font-bold text-emerald-100 uppercase w-24">Last Update</th>
                  ${isAdmin ? `<th class="px-4 py-3 w-10"></th>` : ''}
                </tr>
              </thead>
              <tbody id="permanent-table-body">${renderPermanentRows(getPagedPermanent(getFilteredPermanent()))}</tbody>
            </table>
          </div>
          <!-- Permanent Pagination -->
          <div id="p-pagination" class="px-5 py-3 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
            <span class="text-[10px] text-slate-400" id="p-page-info"></span>
            <div class="flex gap-2">
              <button id="p-prev-page" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">ก่อนหน้า</button>
              <button id="p-next-page" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">ถัดไป</button>
            </div>
          </div>
        </div>
      </div>

    </div>`;

    // ── Pagination helpers
    const updatePagination = (filtered) => {
        const total   = filtered.length;
        const size    = _wPageSize === 'all' ? (total || 1) : Number(_wPageSize || 10);
        const totalPg = _wPageSize === 'all' ? 1 : Math.max(1, Math.ceil(total / size));
        _wPage = Math.min(_wPage, totalPg - 1);
        const start   = total ? (_wPageSize === 'all' ? 1 : _wPage * size + 1) : 0;
        const end     = _wPageSize === 'all' ? total : Math.min(total, (_wPage + 1) * size);
        const info    = document.getElementById('w-page-info');
        const prev    = document.getElementById('w-prev-page');
        const next    = document.getElementById('w-next-page');
        if (info) info.textContent = total ? `แสดง ${start}-${end} จาก ${total} รายการ` : 'ไม่มีข้อมูล';
        if (prev) { prev.disabled = _wPageSize === 'all' || _wPage === 0; }
        if (next) { next.disabled = _wPageSize === 'all' || _wPage >= totalPg - 1; }
        const el = document.getElementById('w-count-label');
        if (el) el.textContent = `${total} รายการ`;
    };

    const applyWorkerRender = () => {
        const filtered = getFilteredWorker();
        const tbody = document.getElementById('worker-table-body');
        if (!tbody) return;
        tbody.innerHTML = renderWorkerRows(getPagedWorker(filtered));
        updatePagination(filtered);
    };
    applyWorkerRender();

    document.getElementById('w-prev-page')?.addEventListener('click', () => { _wPage--; applyWorkerRender(); });
    document.getElementById('w-next-page')?.addEventListener('click', () => { _wPage++; applyWorkerRender(); });
    document.getElementById('w-page-size')?.addEventListener('change', (event) => {
        _wPageSize = event.target.value === 'all' ? 'all' : Number(event.target.value || 10);
        _wPage = 0;
        applyWorkerRender();
    });

    // ── Tab switcher
    window._cccfSwitchTab = (tab) => {
        _activeCccfTab = tab === 'permanent' ? 'permanent' : 'worker';
        window._saveTab?.('cccf', tab);
        ['worker', 'permanent'].forEach(t => {
            const btn = document.getElementById(`btn-tab-${t}`);
            const cnt = document.getElementById(`content-${t}`);
            const active = t === tab;
            if (btn) {
                btn.className = `flex-1 py-2.5 text-sm ${active ? 'font-bold text-white rounded-xl shadow-sm' : 'font-medium text-slate-500 hover:bg-slate-50 rounded-xl'} flex justify-center items-center gap-2 transition-all`;
                btn.style.background = active ? 'linear-gradient(135deg,#059669,#0d9488)' : '';
            }
            if (cnt) { cnt.classList.toggle('hidden', !active); if (active) cnt.classList.add('animate-fade-in'); }
        });
        refreshCccfHeroKpis();
    };

    // ── Worker filters
    const refreshWorker = () => {
        _wSearch      = document.getElementById('w-search')?.value || '';
        _wFilterDept  = document.getElementById('w-filter-dept')?.value || '';
        _wFilterRank  = document.getElementById('w-filter-rank')?.value || '';
        _wFilterStop  = parseInt(document.getElementById('w-filter-stop')?.value) || 0;
        _wFilterPhoto = document.getElementById('w-filter-photo')?.value || '';
        // _wFilterUnit is set externally by _wSetUnit (unit summary click) — don't overwrite from DOM
        _wPage = 0;  // reset to first page on filter change
        applyWorkerRender();
        // show/hide clear button
        const hasFil = _wSearch || _wFilterDept || _wFilterUnit || _wFilterRank || _wFilterStop || _wFilterPhoto;
        const existing = document.getElementById('w-clear-filter');
        if (hasFil && !existing) {
            const span = document.getElementById('w-count-label');
            if (span) {
                const btn = document.createElement('button');
                btn.id = 'w-clear-filter';
                btn.className = 'text-xs px-3 py-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 transition-colors font-semibold';
                btn.textContent = 'ล้างตัวกรอง';
                btn.onclick = () => {
                    _wSearch = ''; _wFilterDept = ''; _wFilterUnit = ''; _wFilterRank = ''; _wFilterStop = 0; _wFilterPhoto = '';
                    loadCccfPage();
                };
                span.parentNode.insertBefore(btn, span);
            }
        }
    };

    document.getElementById('w-search')?.addEventListener('input', refreshWorker);
    document.getElementById('w-filter-dept')?.addEventListener('change', refreshWorker);
    document.getElementById('w-filter-rank')?.addEventListener('change', refreshWorker);
    document.getElementById('w-filter-stop')?.addEventListener('change', refreshWorker);
    document.getElementById('w-filter-photo')?.addEventListener('change', refreshWorker);
    document.getElementById('w-clear-filter')?.addEventListener('click', () => {
        _wSearch = ''; _wFilterDept = ''; _wFilterUnit = ''; _wFilterRank = ''; _wFilterStop = 0; _wFilterPhoto = '';
        loadCccfPage();
    });

    // set filter dropdowns to current state
    const wd = document.getElementById('w-filter-dept');
    if (wd && _wFilterDept) wd.value = _wFilterDept;
    const pd = document.getElementById('p-filter-dept');
    if (pd && _pFilterDept) pd.value = _pFilterDept;

    // ── Permanent pagination helper
    const updatePPagination = (filtered) => {
        const total   = filtered.length;
        const totalPg = Math.max(1, Math.ceil(total / P_PAGE_SIZE));
        _pPage = Math.min(_pPage, totalPg - 1);
        const start   = _pPage * P_PAGE_SIZE + 1;
        const end     = Math.min(total, (_pPage + 1) * P_PAGE_SIZE);
        const info    = document.getElementById('p-page-info');
        const prev    = document.getElementById('p-prev-page');
        const next    = document.getElementById('p-next-page');
        if (info) info.textContent = total ? `แสดง ${start}-${end} จาก ${total} รายการ` : 'ไม่มีข้อมูล';
        if (prev) { prev.disabled = _pPage === 0; }
        if (next) { next.disabled = _pPage >= totalPg - 1; }
        const el = document.getElementById('p-count-label');
        if (el) el.textContent = `${total} รายการ`;
    };

    // ── Permanent filter
    const applyPermanentRender = () => {
        const filtered = getFilteredPermanent();
        document.getElementById('permanent-table-body').innerHTML = renderPermanentRows(getPagedPermanent(filtered));
        updatePPagination(filtered);
    };
    applyPermanentRender();

    const refreshPermanent = () => {
        _pSearch = document.getElementById('p-search')?.value || '';
        _pFilterDept = document.getElementById('p-filter-dept')?.value || '';
        _pFilterStatus = document.getElementById('p-filter-status')?.value || '';
        _pFilterDue = document.getElementById('p-filter-due')?.value || '';
        _pFilterRank = document.getElementById('p-filter-rank')?.value || '';
        _pFilterStop = parseInt(document.getElementById('p-filter-stop')?.value, 10) || 0;
        _pPage = 0;  // reset to first page on filter change
        applyPermanentRender();
        updatePermanentStatusChips();
    };
    const updatePermanentStatusChips = () => {
        document.querySelectorAll('.p-status-chip').forEach(chip => {
            const active = (chip.dataset.status || '') === _pFilterStatus;
            chip.className = `p-status-chip px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-200 hover:text-emerald-700'}`;
            const count = chip.querySelector('span');
            if (count) count.className = active ? 'text-emerald-100' : 'text-slate-400';
        });
    };
    document.getElementById('p-search')?.addEventListener('input', refreshPermanent);
    document.getElementById('p-filter-dept')?.addEventListener('change', refreshPermanent);
    document.getElementById('p-filter-status')?.addEventListener('change', refreshPermanent);
    document.getElementById('p-filter-due')?.addEventListener('change', refreshPermanent);
    document.getElementById('p-filter-rank')?.addEventListener('change', refreshPermanent);
    document.getElementById('p-filter-stop')?.addEventListener('change', refreshPermanent);
    document.querySelectorAll('.p-status-chip').forEach(btn => btn.addEventListener('click', () => {
        _pFilterStatus = btn.dataset.status || '';
        const statusEl = document.getElementById('p-filter-status');
        if (statusEl) statusEl.value = _pFilterStatus;
        _pPage = 0;
        applyPermanentRender();
        updatePermanentStatusChips();
    }));
    document.getElementById('p-prev-page')?.addEventListener('click', () => { _pPage--; applyPermanentRender(); });
    document.getElementById('p-next-page')?.addEventListener('click', () => { _pPage++; applyPermanentRender(); });
    document.getElementById('p-clear-filter')?.addEventListener('click', () => {
        _pSearch = ''; _pFilterDept = ''; _pFilterStatus = ''; _pFilterDue = ''; _pFilterRank = ''; _pFilterStop = 0; _pPage = 0;
        const searchEl = document.getElementById('p-search');
        const deptEl   = document.getElementById('p-filter-dept');
        const statusEl = document.getElementById('p-filter-status');
        const dueEl    = document.getElementById('p-filter-due');
        const rankEl   = document.getElementById('p-filter-rank');
        const stopEl   = document.getElementById('p-filter-stop');
        if (searchEl) searchEl.value = '';
        if (deptEl)   deptEl.value = '';
        if (statusEl) statusEl.value = '';
        if (dueEl)    dueEl.value = '';
        if (rankEl)   rankEl.value = '';
        if (stopEl)   stopEl.value = '0';
        applyPermanentRender();
        updatePermanentStatusChips();
    });

    // ── Stop cards click to filter
    window._wSetStop = (id) => {
        _wFilterStop = (_wFilterStop == id) ? 0 : id;
        const sel = document.getElementById('w-filter-stop');
        if (sel) sel.value = _wFilterStop;
        refreshWorker();
    };
    window._wSetUnit = (unit) => {
        _wFilterUnit = (_wFilterUnit === unit) ? '' : unit;
        refreshWorker();
        window._cccfSwitchTab('worker');
    };
    window._wSetDept = (dept) => {
        _wFilterDept = (_wFilterDept === dept) ? '' : dept;
        const deptEl = document.getElementById('w-filter-dept');
        if (deptEl) deptEl.value = _wFilterDept;
        refreshWorker();
        window._cccfSwitchTab('worker');
    };
    window._cccfOpenSystemTargets = () => {
        window.location.hash = 'admin';
        setTimeout(() => window._adminTab?.('targets'), 250);
    };
    window._cccfSetWorkerSource = async (source) => {
        const nextSource = normalizeCccfWorkerSource(source);
        if (nextSource === _cccfWorkerSource) return;
        const previousSource = _cccfWorkerSource;
        const previousConfig = _dashboardConfig;
        const sourceByYear = {
            ...(_dashboardConfig.cccfWorkerSourceByYear && typeof _dashboardConfig.cccfWorkerSourceByYear === 'object'
                ? _dashboardConfig.cccfWorkerSourceByYear
                : {}),
            [String(_unitYear)]: nextSource,
        };
        const nextConfig = {
            ..._dashboardConfig,
            cccfWorkerSource: nextSource,
            cccfWorkerSourceByYear: sourceByYear,
        };
        showLoading('กำลังบันทึกแหล่งข้อมูล CCCF...');
        try {
            const saved = await API.put('/dashboard/config', nextConfig);
            _dashboardConfig = saved?.data || nextConfig;
            _cccfWorkerSource = resolveCccfWorkerSource(_dashboardConfig, _unitYear);
            const page = document.getElementById('cccf-page');
            if (page) renderPage(page);
            showToast(`บันทึกรูปแบบติดตามผลปี ${_unitYear + 543} สำเร็จ`, 'success');
        } catch (err) {
            _cccfWorkerSource = previousSource;
            _dashboardConfig = previousConfig;
            showError(err);
        } finally {
            hideLoading();
        }
    };

    // ── Buttons
    document.getElementById('btn-open-worker-form')?.addEventListener('click', openWorkerForm);
    document.getElementById('btn-export-worker-pdf')?.addEventListener('click', () => {
        exportCccfWorkerPDF();
    });
    document.getElementById('btn-open-permanent-form')?.addEventListener('click', () => openPermanentForm());
    document.getElementById('btn-manage-assignments')?.addEventListener('click', openAssignmentManager);
    document.getElementById('btn-manage-cccf-forms')?.addEventListener('click', openCccfFormsManager);
    container.querySelectorAll('[data-form-open]').forEach(btn => btn.addEventListener('click', () => openCccfRelatedForm(btn.dataset.formOpen, btn.dataset.formTitle)));
    container.querySelectorAll('[data-form-download]').forEach(btn => btn.addEventListener('click', () => downloadCccfRelatedForm(btn.dataset.formDownload, btn.dataset.formTitle)));
    window._cccfSetPermanentStatus = (status) => {
        _pFilterStatus = status || '';
        const statusEl = document.getElementById('p-filter-status');
        if (statusEl) statusEl.value = _pFilterStatus;
        _pPage = 0;
        applyPermanentRender();
        updatePermanentStatusChips();
        document.getElementById('permanent-table-body')?.closest('.bg-white')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window._cccfOpenAssignmentManager = openAssignmentManager;
    window._cccfOpenEmailQueue = openCccfEmailQueueModal;
    window._cccfToggleEmailPolicy = async () => {
        const next = !_cccfRequireCompanyEmail;
        const ok = await showConfirmationModal(
            next ? 'เปิดการบังคับ CompanyEmail' : 'ปิดการบังคับ CompanyEmail',
            next
                ? 'เมื่อเปิดแล้ว รายงาน CCCF Permanent ใหม่ต้องมี CompanyEmail ใน Employee Master ก่อนส่ง'
                : 'เมื่อปิดแล้ว ระบบจะแสดง warning แต่จะไม่บล็อกการส่งรายงานใหม่'
        );
        if (!ok) return;
        showLoading('กำลังบันทึกนโยบายอีเมล...');
        try {
            await API.put('/settings/cccf_require_company_email', { value: next ? '1' : '0' });
            _cccfRequireCompanyEmail = next;
            showToast(next ? 'เปิดการบังคับ CompanyEmail แล้ว' : 'ปิดการบังคับ CompanyEmail แล้ว', 'success');
            await loadCccfPage();
        } catch (err) { showError(err); } finally { hideLoading(); }
    };

    // ── Init unit chart after DOM settles
    setTimeout(() => initUnitChart(), 0);
}

// ─── Worker Form ──────────────────────────────────────────────────────────────
function openWorkerForm() {
    const today = new Date().toISOString().split('T')[0];
    const employeeUnit = getCurrentEmployeeUnit();
    const missingEmployeeUnit = !isAdmin && !employeeUnit;
    openModal('CCCF Form A — Worker', `
      <form id="cccf-worker-form" class="cccf-scroll-form space-y-5 px-1" novalidate>
        <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex gap-2.5 text-sm text-emerald-800">
          <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          กรอกข้อมูลการค้นหาอันตรายในพื้นที่ทำงาน เพื่อนำไปปรับปรุงความปลอดภัย
        </div>

        <!-- ข้อมูลพนักงาน -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">1</span>
            <span class="text-xs font-bold text-slate-700">ข้อมูลพนักงาน</span>
          </div>
          <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ชื่อพนักงาน</label>
              <input type="text" name="EmployeeName" class="form-input w-full rounded-xl text-sm bg-slate-50 text-slate-500 cursor-not-allowed" readonly value="${escapeAttr(currentUser.name || '')}">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">รหัสพนักงาน</label>
              <input type="text" name="EmployeeID" class="form-input w-full rounded-xl text-sm bg-slate-50 text-slate-500 cursor-not-allowed" readonly value="${escapeAttr(currentUser.id || '')}">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">หน่วยงาน</label>
              <input type="text" class="form-input w-full rounded-xl text-sm bg-slate-50 text-slate-500 cursor-not-allowed" readonly value="${escapeAttr(currentUser.department || '—')}">
              <input type="hidden" name="Department" value="${escapeAttr(currentUser.department || '')}">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">วันที่ลงข้อมูล <span class="text-red-500">*</span></label>
              <input type="date" name="SubmitDate" class="form-input w-full rounded-xl text-sm" required value="${today}">
            </div>
            <div class="col-span-2">
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Safety Unit <span class="text-red-500">*</span></label>
              ${isAdmin ? (_safetyUnits.length
                ? `<select name="SafetyUnit" class="form-input w-full rounded-xl text-sm" required>
                     <option value="">— เลือก Unit —</option>
                     ${_safetyUnits.map(u => `<option value="${escapeAttr(u.name)}">${escapeHtml(u.name)}${u.DeptName ? ` (${escapeHtml(u.DeptName)})` : ''}</option>`).join('')}
                   </select>`
                : `<input type="text" name="SafetyUnit" class="form-input w-full rounded-xl text-sm" required placeholder="ระบุ Unit ของคุณ">`) : lockedWorkerUnitField(employeeUnit)}
            </div>
          </div>
        </div>

        <!-- พื้นที่ทำงาน -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">2</span>
            <span class="text-xs font-bold text-slate-700">พื้นที่ทำงาน / อุปกรณ์</span>
          </div>
          <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">พื้นที่ / ชื่องาน <span class="text-red-500">*</span></label>
              <input type="text" name="JobArea" class="form-input w-full rounded-xl text-sm" required placeholder="เช่น Line 1, คลังสินค้า">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">อุปกรณ์ / เครื่องจักร</label>
              <input type="text" name="Equipment" class="form-input w-full rounded-xl text-sm" placeholder="เช่น รถยก, สายพาน">
            </div>
          </div>
        </div>

        <!-- รายละเอียดอันตราย -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">3</span>
            <span class="text-xs font-bold text-slate-700">รายละเอียดอันตราย <span class="text-red-500">*</span></span>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">อธิบายอันตรายที่พบ <span class="text-red-500">*</span></label>
              <textarea name="HazardDescription" rows="2" class="form-input w-full rounded-xl text-sm resize-none" required placeholder="อธิบายสภาพอันตรายที่พบ..."></textarea>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">วิธีที่อาจเกิดอันตราย</label>
                <textarea name="HowItHappened" rows="2" class="form-input w-full rounded-xl text-sm resize-none" placeholder="อธิบายกลไกการบาดเจ็บ..."></textarea>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">อวัยวะที่เสี่ยง</label>
                <input type="text" name="BodyPart" class="form-input w-full rounded-xl text-sm" placeholder="เช่น มือ, เท้า, ตา">
              </div>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ข้อเสนอแนะการแก้ไข</label>
              <textarea name="Suggestion" rows="2" class="form-input w-full rounded-xl text-sm resize-none" placeholder="แนวทางแก้ไขที่เสนอ..."></textarea>
            </div>
          </div>
        </div>

        <!-- Stop Type -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">4</span>
            <span class="text-xs font-bold text-slate-700">ประเภทอันตราย (Stop Type) <span class="text-red-500">*</span></span>
          </div>
          <div class="p-4 grid grid-cols-2 gap-2">
            ${STOP_TYPES.map(s => `
            <label class="cursor-pointer">
              <input type="radio" name="StopType" value="${s.id}" class="peer hidden" required>
              <div class="flex items-center gap-2.5 p-3 rounded-xl border-2 border-slate-100 hover:border-slate-200 peer-checked:border-current transition-all" style="--stop-color:${s.color}">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background:${s.bg}">
                  <svg class="w-4 h-4" style="color:${s.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${s.icon}"/></svg>
                </div>
                <div class="min-w-0">
                  <p class="text-[10px] font-bold" style="color:${s.color}">${s.code}</p>
                  <p class="text-[10px] text-slate-600 leading-snug">${s.label}</p>
                </div>
              </div>
            </label>`).join('')}
          </div>
        </div>

        <!-- Rank -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">5</span>
            <span class="text-xs font-bold text-slate-700">ระดับความรุนแรง (Rank) <span class="text-red-500">*</span></span>
          </div>
          <div class="p-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            ${RANKS.map(r => `
            <label class="cursor-pointer">
              <input type="radio" name="Rank" value="${r.rank}" class="peer hidden" required>
              <div class="p-3 rounded-xl border-2 text-center border-slate-100 peer-checked:border-current hover:border-slate-200 transition-all">
                <div class="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center text-sm font-black text-white" style="background:${r.color}">${r.rank}</div>
                <p class="text-[10px] font-bold" style="color:${r.color}">${r.label}</p>
                <p class="text-[9px] text-slate-500 mt-0.5 leading-snug">${r.desc}</p>
                <p class="text-[9px] font-bold mt-1" style="color:${r.color}">${r.detail}</p>
              </div>
            </label>`).join('')}
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 overflow-hidden" id="cccf-worker-image-section">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#0284c7,#0d9488)">6</span>
            <span class="text-xs font-bold text-slate-700">แนบรูปภาพ <span class="font-medium text-slate-400">(ไม่บังคับ)</span></span>
          </div>
          <div class="p-4 space-y-3">
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" id="cccf-worker-camera-button" class="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold text-sky-700 hover:bg-sky-100">ถ่ายรูป</button>
              <button type="button" id="cccf-worker-gallery-button" class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100">เลือกรูปจากเครื่อง</button>
            </div>
            <input type="file" id="cccf-worker-camera-input" accept="image/*" capture="environment" class="hidden">
            <input type="file" id="cccf-worker-gallery-input" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple class="hidden">
            <p class="text-[11px] leading-relaxed text-slate-400">สูงสุด 3 รูป รองรับ JPG, PNG, WebP และขนาดไม่เกิน 5 MB ต่อรูป</p>
            <div id="cccf-worker-image-preview" class="hidden grid grid-cols-2 gap-2 sm:grid-cols-3"></div>
            <div id="cccf-worker-image-error" class="hidden rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700"></div>
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
          <button type="submit" id="btn-submit-worker" ${missingEmployeeUnit ? 'disabled' : ''} class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-50" style="background:linear-gradient(135deg,#059669,#0d9488)">ส่งแบบฟอร์ม</button>
        </div>
      </form>`, 'max-w-2xl');

    const prepareCccfWorkerModalScroll = () => {
        const modalBody = document.getElementById('modal-body');
        if (!modalBody) return;
        modalBody.setAttribute('tabindex', '-1');
        modalBody.style.removeProperty('flex');
        modalBody.style.removeProperty('max-height');
        modalBody.style.overflowY = 'auto';
        modalBody.style.overscrollBehaviorY = 'contain';
        modalBody.style.webkitOverflowScrolling = 'touch';
        modalBody.scrollTop = 0;
    };
    prepareCccfWorkerModalScroll();
    requestAnimationFrame(prepareCccfWorkerModalScroll);
    const workerImageFiles = [];
    const cameraInput = document.getElementById('cccf-worker-camera-input');
    const galleryInput = document.getElementById('cccf-worker-gallery-input');
    const imagePreview = document.getElementById('cccf-worker-image-preview');
    const imageError = document.getElementById('cccf-worker-image-error');
    const showWorkerImageError = (message = '') => {
        if (!imageError) return;
        imageError.textContent = message;
        imageError.classList.toggle('hidden', !message);
    };
    const renderWorkerImagePreview = () => {
        if (!imagePreview) return;
        imagePreview.classList.toggle('hidden', workerImageFiles.length === 0);
        imagePreview.innerHTML = workerImageFiles.map((file, index) => `
          <div class="relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <img src="${escapeAttr(URL.createObjectURL(file))}" alt="${escapeAttr(file.name)}" class="h-full w-full object-cover">
            <button type="button" data-worker-image-remove="${index}" class="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/75 text-sm font-bold text-white" title="ลบรูป">×</button>
            <div class="absolute inset-x-0 bottom-0 truncate bg-slate-900/65 px-2 py-1 text-[9px] text-white">${escapeHtml(file.name)}</div>
          </div>`).join('');
    };
    const addWorkerImages = files => {
        showWorkerImageError('');
        for (const file of files) {
            if (workerImageFiles.length >= 3) {
                showWorkerImageError('แนบรูปภาพได้ไม่เกิน 3 รูป');
                break;
            }
            const extension = String(file.name || '').split('.').pop()?.toLowerCase();
            const allowedType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
            const allowedExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension);
            if (!allowedType || !allowedExtension) {
                showWorkerImageError('รองรับเฉพาะไฟล์ JPG, PNG และ WebP');
                continue;
            }
            if (file.size > 5 * 1024 * 1024) {
                showWorkerImageError(`ไฟล์ ${file.name} มีขนาดเกิน 5 MB`);
                continue;
            }
            const duplicate = workerImageFiles.some(item =>
                item.name === file.name && item.size === file.size && item.lastModified === file.lastModified
            );
            if (!duplicate) workerImageFiles.push(file);
        }
        renderWorkerImagePreview();
    };
    document.getElementById('cccf-worker-camera-button')?.addEventListener('click', () => cameraInput?.click());
    document.getElementById('cccf-worker-gallery-button')?.addEventListener('click', () => galleryInput?.click());
    cameraInput?.addEventListener('change', () => {
        addWorkerImages(Array.from(cameraInput.files || []));
        cameraInput.value = '';
    });
    galleryInput?.addEventListener('change', () => {
        addWorkerImages(Array.from(galleryInput.files || []));
        galleryInput.value = '';
    });
    imagePreview?.addEventListener('click', event => {
        const button = event.target.closest('[data-worker-image-remove]');
        if (!button) return;
        workerImageFiles.splice(Number(button.dataset.workerImageRemove), 1);
        showWorkerImageError('');
        renderWorkerImagePreview();
    });
    document.getElementById('cccf-worker-form')?.addEventListener('submit', guardSubmitHandler(async e => {
        e.preventDefault();
        const form = e.currentTarget;
        if (form.dataset.submitting === '1') return;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        data.SafetyUnit = normalizeUnitName(data.SafetyUnit);
        if (!String(data.SubmitDate || '').trim()) { showToast('กรุณาระบุวันที่', 'error'); return; }
        if (!String(data.JobArea || '').trim()) { showToast('กรุณาระบุพื้นที่/ชื่องาน', 'error'); return; }
        if (!String(data.SafetyUnit || '').trim()) { showToast('กรุณาระบุหน่วยงาน', 'error'); return; }
        if (!String(data.HazardDescription || '').trim()) { showToast('กรุณาระบุรายละเอียดอันตราย', 'error'); return; }
        if (!form.StopType.value) { showToast('กรุณาเลือกประเภทอันตราย', 'error'); return; }
        if (!form.Rank.value)     { showToast('กรุณาเลือกระดับความรุนแรง', 'error'); return; }
        const btn = document.getElementById('btn-submit-worker');
        form.dataset.submitting = '1';
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span>กำลังส่ง...';
        showLoading('กำลังบันทึก...');
        try {
            formData.set('SafetyUnit', data.SafetyUnit);
            workerImageFiles.forEach(file => formData.append('WorkerImages', file, file.name));
            await API.post('/cccf/form-a-worker', formData);
            closeModal();
            showToast('ส่งแบบฟอร์ม CCCF สำเร็จ', 'success');
            loadCccfPage();
        } catch (err) { showError(err); }
        finally { hideLoading(); delete form.dataset.submitting; btn.disabled = false; btn.textContent = 'ส่งแบบฟอร์ม'; }
    }));
}

function openPermanentForm(record = null, forcedAssigneeId = '') {
    const isEdit = !!record;
    const today = new Date().toISOString().split('T')[0];
    const ownerOptions = getPermanentOwnerOptions();
    const inferredOwner = record?.AssigneeID
        ? getEmployeeById(record.AssigneeID)
        : ownerOptions.find(opt =>
            normalizeText(opt.EmployeeName) === normalizeText(record?.SubmitterName)
            && normalizeText(opt.Department) === normalizeText(record?.Department)
        ) || null;
    const selectedOwnerId = String(forcedAssigneeId || record?.AssigneeID || inferredOwner?.EmployeeID || currentUser.id || '').trim();
    const selectedOwner = ownerOptions.find(opt => opt.EmployeeID === selectedOwnerId) || getEmployeeById(selectedOwnerId) || null;
    const ownerName = isAdmin ? (selectedOwner?.EmployeeName || record?.SubmitterName || currentUser.name || '') : (record?.SubmitterName || currentUser.name || '');
    const ownerDept = isAdmin ? (selectedOwner?.Department || record?.Department || currentUser.department || '') : (record?.Department || currentUser.department || '');
    const ownerEmail = getPermanentOwnerEmail(selectedOwnerId);
    const defaultMode = isEdit ? (record?.DocumentMode || 'legacy') : 'excel_review';
    const directAllowed = isAdmin || canDirectSignedPdf(selectedOwnerId);
    const approvedRecords = getApprovedPermanentRecordsForOwner(selectedOwnerId);

    openModal(`CCCF Form A - Permanent${isEdit ? ' (แก้ไข)' : ''}`, `
      <form id="cccf-permanent-form" class="space-y-4 px-1">
        <input type="hidden" name="AssigneeID" id="permanent-assignee-id" value="${escapeAttr(selectedOwnerId)}">
        <input type="hidden" name="SubmitterName" id="permanent-submitter-name" value="${escapeAttr(ownerName)}">
        <input type="hidden" name="Department" id="permanent-submitter-dept" value="${escapeAttr(ownerDept)}">
        <input type="hidden" name="DocumentMode" id="permanent-document-mode" value="${escapeAttr(defaultMode)}">
        <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex gap-2.5 text-sm text-emerald-800">
          <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
          ${isAdmin
            ? (isEdit ? 'แอดมินสามารถแก้ไขรายการ อัปไฟล์แทนผู้ใช้ และเปลี่ยนผู้รับผิดชอบได้จากฟอร์มนี้' : 'แอดมินสามารถสร้างหรืออัปไฟล์ Form A Permanent แทนผู้ใช้ได้จากฟอร์มนี้')
            : 'หัวหน้างานขึ้นไปส่งแบบฟอร์มที่ดำเนินการแก้ไขถาวรแล้ว พร้อมแนบไฟล์เอกสาร'}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)] gap-4 items-start">
          <div class="space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
          ${['ดาวน์โหลดแบบฟอร์ม', 'กรอก / ลงนาม', 'แนบไฟล์ FormFile', 'ส่งเข้าระบบ'].map((step, idx) => `
            <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-black text-white">${idx + 1}</span>
              <p class="mt-1 text-[11px] font-bold text-slate-700">${step}</p>
            </div>
          `).join('')}
        </div>
        ${renderCccfFormsUserCard(_cccfForms, { compact: true })}
        ${!isEdit ? `
        <div class="rounded-2xl border border-slate-200 bg-white p-3">
          <p class="mb-2 text-[10px] font-bold uppercase text-slate-400">รูปแบบการส่งเอกสาร</p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
            <label class="cursor-pointer">
              <input type="radio" name="PermanentDocumentModeChoice" value="excel_review" class="peer hidden" ${defaultMode === 'excel_review' ? 'checked' : ''}>
              <div class="h-full rounded-xl border border-amber-200 bg-amber-50 p-3 peer-checked:ring-2 peer-checked:ring-amber-300">
                <p class="text-sm font-black text-amber-800">ส่ง Excel เพื่อตรวจสอบ</p>
                <p class="mt-1 text-[11px] leading-relaxed text-amber-700">แนบ Excel ให้ Admin ตรวจสอบก่อนพิมพ์ลงนาม</p>
              </div>
            </label>
            <label class="${approvedRecords.length ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}">
              <input type="radio" name="PermanentDocumentModeChoice" value="signed_after_review" class="peer hidden" ${approvedRecords.length ? '' : 'disabled'}>
              <div class="h-full rounded-xl border border-sky-200 bg-sky-50 p-3 peer-checked:ring-2 peer-checked:ring-sky-300">
                <p class="text-sm font-black text-sky-800">ส่ง PDF หลังผ่านการตรวจ</p>
                <p class="mt-1 text-[11px] leading-relaxed text-sky-700">${approvedRecords.length ? 'เลือก Excel ที่ Approved แล้ว แล้วแนบ PDF ลงนาม' : 'ยังไม่มีรายการ Excel ที่ Approved สำหรับเจ้าของงานนี้'}</p>
              </div>
            </label>
            <label class="${directAllowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}">
              <input type="radio" name="PermanentDocumentModeChoice" value="direct_signed" class="peer hidden" ${directAllowed ? '' : 'disabled'}>
              <div class="h-full rounded-xl border border-emerald-200 bg-emerald-50 p-3 peer-checked:ring-2 peer-checked:ring-emerald-300">
                <p class="text-sm font-black text-emerald-800">ส่ง PDF ลงนามโดยตรง</p>
                <p class="mt-1 text-[11px] leading-relaxed text-emerald-700">${directAllowed ? 'แนบ PDF ที่ลงนามแล้วได้ทันที' : 'ต้องให้ Admin เปิดสิทธิ์ในรายการมอบหมายก่อน'}</p>
              </div>
            </label>
          </div>
          <div id="permanent-approved-picker-wrap" class="mt-3 hidden rounded-xl border border-sky-100 bg-sky-50 p-3">
            <label class="block text-[10px] font-bold uppercase text-sky-700 mb-1.5">รายการ Excel ที่ผ่านการตรวจ</label>
            <select id="permanent-approved-record-select" class="form-select w-full rounded-xl text-sm">
              <option value="">-- เลือกรายการ Approved --</option>
              ${approvedRecords.map(item => `
                <option value="${escapeAttr(item.id)}">
                  #${escapeHtml(item.id)} - ${escapeHtml(item.JobArea || 'ไม่ระบุงาน')} (${escapeHtml(item.SubmitDate ? String(item.SubmitDate).split('T')[0] : 'ไม่ระบุวันที่')})
                </option>
              `).join('')}
            </select>
            <div id="permanent-approved-record-preview" class="mt-2 text-xs text-sky-800"></div>
          </div>
        </div>` : ''}
          </div>
          <div class="space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${isAdmin ? `
            <div class="col-span-2">
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ผู้รับผิดชอบ / ส่งแทน</label>
              <select id="permanent-owner-select" class="form-select w-full rounded-xl text-sm">
                <option value="">-- เลือกผู้ใช้ --</option>
                ${ownerOptions.map(opt => `
                  <option value="${escapeAttr(opt.EmployeeID)}" ${String(opt.EmployeeID) === selectedOwnerId ? 'selected' : ''}>
                    ${escapeHtml(opt.EmployeeName || 'Unknown')} (${escapeHtml(opt.EmployeeID)}) - ${escapeHtml(opt.Department || 'No Department')}${opt.source === 'assignment' ? ' [Assigned]' : ''}
                  </option>
                `).join('')}
              </select>
              <p class="text-[11px] text-slate-400 mt-1">รายการที่ถูก assign จะขึ้นก่อนเพื่อให้แอดมินตามงานและอัปโหลดแทนได้เร็ว</p>
            </div>
          ` : ''}
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ชื่อผู้ส่ง</label>
            <input type="text" id="permanent-owner-name-display" class="form-input w-full rounded-xl text-sm bg-slate-50 text-slate-500 cursor-not-allowed" readonly value="${escapeAttr(ownerName || '')}">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">หน่วยงาน</label>
            <input type="text" id="permanent-owner-dept-display" class="form-input w-full rounded-xl text-sm bg-slate-50 text-slate-500 cursor-not-allowed" readonly value="${escapeAttr(ownerDept || '—')}">
          </div>
          <div class="col-span-2">
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Company Email</label>
            <div id="permanent-owner-email-display" class="rounded-xl border ${ownerEmail ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-amber-100 bg-amber-50 text-amber-800'} px-3 py-2 text-xs font-semibold">
              ${ownerEmail ? `Email: ${escapeHtml(ownerEmail)}` : 'ยังไม่มี CompanyEmail ใน Employee Master ระบบจะไม่ส่งอีเมลหาเจ้าของงาน'}
            </div>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ชื่องาน / พื้นที่ <span class="text-red-500">*</span></label>
            <input type="text" name="JobArea" id="permanent-job-area-input" class="form-input w-full rounded-xl text-sm" required placeholder="เช่น งานปรับปรุง Line 2" value="${escapeAttr(record?.JobArea || '')}">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">วันที่ส่ง</label>
            <input type="date" name="SubmitDate" id="permanent-submit-date-input" class="form-input w-full rounded-xl text-sm" value="${escapeAttr(record?.SubmitDate ? String(record.SubmitDate).split('T')[0] : today)}">
          </div>
          <div class="col-span-2">
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">สรุปการดำเนินการ</label>
            <textarea name="Summary" id="permanent-summary-input" rows="3" class="form-input w-full rounded-xl text-sm resize-none" placeholder="สรุปสิ่งที่ได้ดำเนินการแก้ไขถาวร...">${escapeHtml(record?.Summary || '')}</textarea>
          </div>
          <div class="col-span-2">
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">แนบไฟล์เอกสาร (PDF / รูปภาพ)</label>
            ${record?.FileUrl ? `<div class="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p class="mb-2 truncate text-[10px] font-bold text-slate-400 uppercase">${escapeHtml(getFileNameFromUrl(record.FileUrl))}</p>
                ${renderFileActions(record.FileUrl)}
              </div>` : ''}
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2 mt-1">Stop Type <span class="text-red-500">*</span></label>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              ${STOP_TYPES.map(s => `
                <label class="cursor-pointer">
                  <input type="radio" name="StopType" value="${s.id}" class="peer hidden" ${+record?.StopType === +s.id ? 'checked' : ''}>
                  <div class="h-full rounded-xl border p-3 transition-all peer-checked:ring-2 peer-checked:ring-emerald-300" style="background:${s.bg};border-color:${s.border}">
                    <p class="text-xs font-black" style="color:${s.color}">${escapeHtml(s.code)}</p>
                    <p class="text-[10px] mt-1 text-slate-600 leading-relaxed">${escapeHtml(s.label)}</p>
                  </div>
                </label>
              `).join('')}
            </div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">Risk Rank <span class="text-red-500">*</span></label>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
              ${RANKS.map(r => `
                <label class="cursor-pointer">
                  <input type="radio" name="Rank" value="${r.rank}" class="peer hidden" ${record?.Rank === r.rank ? 'checked' : ''}>
                  <div class="h-full rounded-xl border p-3 transition-all peer-checked:ring-2 peer-checked:ring-emerald-300" style="background:${r.bg};border-color:${r.border}">
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-sm font-black" style="color:${r.color}">${escapeHtml(r.label)}</p>
                      <span class="text-[10px] font-bold text-slate-500">${escapeHtml(r.detail)}</span>
                    </div>
                    <p class="text-[10px] mt-1 text-slate-600 leading-relaxed">${escapeHtml(r.desc)}</p>
                  </div>
                </label>
              `).join('')}
            </div>
            <input type="file" name="FormFile" id="permanent-file-input" accept=".xls,.xlsx"
              class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all">
            <div id="permanent-file-preview" class="hidden mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2"></div>
            <p id="permanent-file-help" class="text-xs text-slate-400 mt-1">${record?.FileUrl ? 'หากไม่เลือกไฟล์ใหม่ ระบบจะเก็บไฟล์เดิมไว้' : 'รองรับ Excel (.xls, .xlsx) สำหรับส่งให้ Admin ตรวจสอบ - ขนาดไม่เกิน 10 MB'}</p>
          </div>
        </div>
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
          <button type="submit" id="btn-submit-permanent" class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all" style="background:linear-gradient(135deg,#059669,#0d9488)">${isEdit ? 'บันทึกการแก้ไข' : 'ส่งเอกสาร'}</button>
        </div>
      </form>`, 'max-w-5xl');

    const ownerSelect = document.getElementById('permanent-owner-select');
    const ownerNameDisplay = document.getElementById('permanent-owner-name-display');
    const ownerDeptDisplay = document.getElementById('permanent-owner-dept-display');
    const ownerEmailDisplay = document.getElementById('permanent-owner-email-display');
    const assigneeInput = document.getElementById('permanent-assignee-id');
    const submitterInput = document.getElementById('permanent-submitter-name');
    const deptInput = document.getElementById('permanent-submitter-dept');
    const documentModeInput = document.getElementById('permanent-document-mode');
    const syncOwnerPreview = () => {
        if (!isAdmin) return;
        const selected = ownerOptions.find(opt => String(opt.EmployeeID) === String(ownerSelect?.value || '')) || null;
        assigneeInput.value = selected?.EmployeeID || '';
        submitterInput.value = selected?.EmployeeName || record?.SubmitterName || currentUser.name || '';
        deptInput.value = selected?.Department || record?.Department || currentUser.department || '';
        if (ownerNameDisplay) ownerNameDisplay.value = submitterInput.value;
        if (ownerDeptDisplay) ownerDeptDisplay.value = deptInput.value || '—';
        if (ownerEmailDisplay) {
            const email = getPermanentOwnerEmail(assigneeInput.value);
            ownerEmailDisplay.className = `rounded-xl border ${email ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-amber-100 bg-amber-50 text-amber-800'} px-3 py-2 text-xs font-semibold`;
            ownerEmailDisplay.textContent = email ? `Email: ${email}` : 'ยังไม่มี CompanyEmail ใน Employee Master ระบบจะไม่ส่งอีเมลหาเจ้าของงาน';
        }
    };
    ownerSelect?.addEventListener('change', syncOwnerPreview);
    syncOwnerPreview();

    const fileInput = document.getElementById('permanent-file-input');
    const filePreview = document.getElementById('permanent-file-preview');
    const approvedPickerWrap = document.getElementById('permanent-approved-picker-wrap');
    const approvedRecordSelect = document.getElementById('permanent-approved-record-select');
    const approvedRecordPreview = document.getElementById('permanent-approved-record-preview');
    const jobAreaInput = document.getElementById('permanent-job-area-input');
    const submitDateInput = document.getElementById('permanent-submit-date-input');
    const summaryInput = document.getElementById('permanent-summary-input');
    const getSelectedApprovedRecord = () => _permanentData.find(item => String(item.id) === String(approvedRecordSelect?.value || '')) || null;
    const syncApprovedRecordPreview = () => {
        const selected = getSelectedApprovedRecord();
        if (!approvedRecordPreview) return;
        if (!selected) {
            approvedRecordPreview.innerHTML = 'เลือกรายการที่ Excel ผ่านการตรวจแล้ว เพื่ออัปโหลด PDF ลงนามต่อจากรายการเดิม';
            return;
        }
        if (jobAreaInput) jobAreaInput.value = selected.JobArea || '';
        if (submitDateInput) submitDateInput.value = selected.SubmitDate ? String(selected.SubmitDate).split('T')[0] : today;
        if (summaryInput) summaryInput.value = selected.Summary || '';
        const stopInput = Array.from(document.querySelectorAll('input[name="StopType"]')).find(input => String(input.value) === String(selected.StopType || ''));
        const rankInput = Array.from(document.querySelectorAll('input[name="Rank"]')).find(input => String(input.value) === String(selected.Rank || ''));
        if (stopInput) stopInput.checked = true;
        if (rankInput) rankInput.checked = true;
        approvedRecordPreview.innerHTML = `
          <div class="rounded-lg bg-white/70 px-3 py-2 border border-sky-100">
            <p class="font-bold">#${escapeHtml(selected.id)} ${escapeHtml(selected.JobArea || 'ไม่ระบุงาน')}</p>
            <p class="mt-0.5 text-[11px] text-sky-700">ผู้รับผิดชอบ: ${escapeHtml(selected.SubmitterName || '—')} · วันที่ ${escapeHtml(selected.SubmitDate ? String(selected.SubmitDate).split('T')[0] : '—')}</p>
          </div>`;
    };
    const syncDocumentMode = () => {
        const selectedMode = document.querySelector('input[name="PermanentDocumentModeChoice"]:checked')?.value || documentModeInput?.value || 'excel_review';
        if (documentModeInput) documentModeInput.value = selectedMode;
        if (fileInput && !isEdit) {
            fileInput.accept = selectedMode === 'direct_signed' || selectedMode === 'signed_after_review' ? '.pdf' : '.xls,.xlsx';
        }
        if (approvedPickerWrap) approvedPickerWrap.classList.toggle('hidden', selectedMode !== 'signed_after_review');
        const fileLabel = document.getElementById('permanent-file-help');
        if (fileLabel && !isEdit) {
            fileLabel.textContent = selectedMode === 'direct_signed' || selectedMode === 'signed_after_review'
                ? 'รองรับ PDF ที่ลงนามแล้ว - ขนาดไม่เกิน 10 MB'
                : 'รองรับ Excel (.xls, .xlsx) สำหรับส่งให้ Admin ตรวจสอบ - ขนาดไม่เกิน 10 MB';
        }
        if (selectedMode === 'signed_after_review') syncApprovedRecordPreview();
    };
    approvedRecordSelect?.addEventListener('change', syncApprovedRecordPreview);
    document.querySelectorAll('input[name="PermanentDocumentModeChoice"]').forEach(input => {
        input.addEventListener('change', syncDocumentMode);
    });
    syncDocumentMode();
    fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!filePreview) return;
        if (!file) {
            filePreview.classList.add('hidden');
            filePreview.innerHTML = '';
            return;
        }
        filePreview.classList.remove('hidden');
        filePreview.innerHTML = `
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate text-xs font-bold text-emerald-800">${escapeHtml(file.name)}</p>
              <p class="text-[10px] text-emerald-600 mt-0.5">${escapeHtml(file.type || 'ไฟล์แนบ')} ${formatFileSize(file.size) ? `- ${formatFileSize(file.size)}` : ''}</p>
            </div>
            <span class="shrink-0 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-100">พร้อมอัปโหลด</span>
          </div>`;
    });

    document.getElementById('cccf-permanent-form')?.addEventListener('submit', guardSubmitHandler(async e => {
        e.preventDefault();
        const form = e.currentTarget;
        if (form.dataset.submitting === '1') return;
        const mode = documentModeInput?.value || 'excel_review';
        const approvedRecord = mode === 'signed_after_review' ? getSelectedApprovedRecord() : null;
        const stopType = form.querySelector('input[name="StopType"]:checked')?.value;
        const rank = form.querySelector('input[name="Rank"]:checked')?.value;
        if (mode === 'signed_after_review' && !approvedRecord) { showToast('กรุณาเลือกรายการ Excel ที่ Approved แล้ว', 'error'); return; }
        if (!String(form.JobArea?.value || '').trim()) { showToast('กรุณาระบุชื่องาน / พื้นที่', 'error'); return; }
        if (!String(form.SubmitDate?.value || '').trim()) { showToast('กรุณาระบุวันที่ส่ง', 'error'); return; }
        if (!stopType) { showToast('กรุณาเลือก Stop Type', 'error'); return; }
        if (!rank) { showToast('กรุณาเลือก Rank', 'error'); return; }
        if (isAdmin && !String(assigneeInput?.value || '').trim()) { showToast('กรุณาเลือกผู้รับผิดชอบ', 'error'); return; }
        if (_cccfRequireCompanyEmail && !getPermanentOwnerEmail(assigneeInput?.value || currentUser.id)) {
            showToast('Employee Master ยังไม่มี CompanyEmail ของผู้รับผิดชอบ กรุณาอัปเดตก่อนส่ง', 'error');
            return;
        }
        if (!isEdit && !fileInput?.files?.length) {
            showToast(mode === 'direct_signed' || mode === 'signed_after_review' ? 'กรุณาแนบ PDF ที่ลงนามแล้ว' : 'กรุณาแนบไฟล์ Excel เพื่อตรวจสอบ', 'error');
            return;
        }
        const btn = document.getElementById('btn-submit-permanent');
        form.dataset.submitting = '1';
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span>${isEdit ? 'กำลังบันทึก...' : 'กำลังส่ง...'}`;
        showLoading('กำลังบันทึก...');
        try {
            const fd = new FormData(form);
            const reqConfig = { headers: { 'Content-Type': 'multipart/form-data' } };
            if (mode === 'signed_after_review' && approvedRecord) {
                await API.post(`/cccf/form-a-permanent/${approvedRecord.id}/signed-file`, fd, reqConfig);
                showToast('อัปโหลด PDF ที่ลงนามแล้วสำเร็จ', 'success');
            } else if (isEdit) {
                await API.put(`/cccf/form-a-permanent/${record.id}`, fd, reqConfig);
                showToast('อัปเดตรายการ CCCF Permanent สำเร็จ', 'success');
            } else {
                await API.post('/cccf/form-a-permanent', fd, reqConfig);
                showToast('ส่งเอกสาร CCCF Permanent สำเร็จ', 'success');
            }
            closeModal();
            loadCccfPage();
        } catch (err) { showError(err); }
        finally {
            hideLoading();
            delete form.dataset.submitting;
            btn.disabled = false;
            btn.textContent = isEdit ? 'บันทึกการแก้ไข' : 'ส่งเอกสาร';
        }
    }, { render: false }));
}

window._cccfEditPermanent = (id) => {
    const record = _permanentData.find(x => x.id == id);
    if (!record) return;
    openPermanentForm(record);
};
window._cccfOpenPermanentForAssignee = (employeeId) => openPermanentForm(null, employeeId);

function renderCccfFormsManageRows() {
    const forms = _cccfForms;
    if (!forms.length) {
        return `<tr><td colspan="6" class="py-8 text-center text-sm text-slate-400">ยังไม่มีแบบฟอร์มที่เกี่ยวข้อง</td></tr>`;
    }
    return forms.map(f => `
      <tr class="border-b border-slate-100 last:border-0 ${f.IsActive ? '' : 'opacity-55'}">
        <td class="px-4 py-3">
          <p class="text-sm font-semibold text-slate-800">${escapeHtml(f.Title)}</p>
          ${f.Description ? `<p class="mt-0.5 max-w-[260px] truncate text-xs text-slate-400">${escapeHtml(f.Description)}</p>` : ''}
        </td>
        <td class="px-4 py-3 text-xs text-slate-500">${escapeHtml(f.Version || '—')}</td>
        <td class="px-4 py-3 text-xs text-slate-500">${cccfFormFileLabel(f.FileType)}</td>
        <td class="px-4 py-3">
          ${f.IsActive
            ? '<span class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-100">ใช้งาน</span>'
            : '<span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 border border-slate-200">ปิดใช้งาน</span>'}
        </td>
        <td class="px-4 py-3 text-[11px] text-slate-400 whitespace-nowrap">${formatThaiDate(f.UploadedAt)}</td>
        <td class="px-4 py-3 text-right whitespace-nowrap">
          <a href="${escapeAttr(sanitizeUrl(f.FileUrl))}" target="_blank" rel="noopener noreferrer"
             class="inline-flex rounded-lg px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50">เปิด</a>
          <button class="cccf-form-toggle inline-flex rounded-lg px-3 py-1 text-xs font-semibold ${f.IsActive ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'}"
                  data-id="${escapeAttr(f.id)}" data-active="${f.IsActive ? '1' : '0'}">
            ${f.IsActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          </button>
          <button class="cccf-form-delete inline-flex rounded-lg px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                  data-id="${escapeAttr(f.id)}" data-title="${escapeAttr(f.Title)}">ลบ</button>
        </td>
      </tr>
    `).join('');
}

function refreshCccfFormsManageRows() {
    const tbody = document.getElementById('cccf-forms-tbody');
    if (tbody) tbody.innerHTML = renderCccfFormsManageRows();
    const count = document.getElementById('cccf-forms-count');
    if (count) count.textContent = `${_cccfForms.length} รายการ`;
}

function openCccfFormUploadModal() {
    openModal('เพิ่มแบบฟอร์ม CCCF', `
      <div class="space-y-4 p-1">
        <form id="cccf-form-template-upload" class="space-y-3">
          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">ชื่อแบบฟอร์ม <span class="text-red-500">*</span></label>
            <input type="text" id="cff-title" class="form-input w-full rounded-xl text-sm" placeholder="เช่น CCCF Form A Permanent" maxlength="200">
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-600">เวอร์ชัน</label>
              <input type="text" id="cff-version" class="form-input w-full rounded-xl text-sm" placeholder="เช่น v1.0" maxlength="30">
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-600">ลำดับแสดง</label>
              <input type="number" id="cff-sort" class="form-input w-full rounded-xl text-sm" placeholder="99" min="0" max="999">
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">คำอธิบาย</label>
            <textarea id="cff-desc" rows="2" class="form-input w-full resize-none rounded-xl text-sm" placeholder="รายละเอียดเพิ่มเติม"></textarea>
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">ไฟล์แบบฟอร์ม <span class="text-red-500">*</span></label>
            <input type="file" id="cff-file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
              class="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100">
            <p class="mt-1 text-xs text-slate-400">รองรับ PDF, Word, Excel, รูปภาพ - ขนาดไม่เกิน 20 MB</p>
          </div>
        </form>
        <div class="flex justify-end gap-2 border-t border-slate-100 pt-2">
          <button type="button" onclick="closeModal()" class="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
          <button id="cff-submit-btn" type="button" class="rounded-xl px-5 py-2 text-sm font-bold text-white" style="background:linear-gradient(135deg,#059669,#0d9488)">อัปโหลดแบบฟอร์ม</button>
        </div>
      </div>`, 'max-w-lg');

    document.getElementById('cff-submit-btn')?.addEventListener('click', guardActionHandler(async e => {
        const btn = e.currentTarget;
        const title = document.getElementById('cff-title')?.value.trim();
        const fileEl = document.getElementById('cff-file');
        if (!title) { showToast('กรุณาระบุชื่อแบบฟอร์ม', 'error'); return; }
        if (!fileEl?.files?.length) { showToast('กรุณาเลือกไฟล์แบบฟอร์ม', 'error'); return; }
        btn.disabled = true;
        btn.textContent = 'กำลังอัปโหลด...';
        try {
            const fd = new FormData();
            fd.append('module', 'cccf');
            fd.append('title', title);
            fd.append('description', document.getElementById('cff-desc')?.value.trim() || '');
            fd.append('version', document.getElementById('cff-version')?.value.trim() || '');
            fd.append('sortOrder', document.getElementById('cff-sort')?.value || '99');
            fd.append('formFile', fileEl.files[0]);
            await API.post('/module-forms', fd);
            await loadCccfForms(true);
            closeModal();
            showToast('อัปโหลดแบบฟอร์มสำเร็จ', 'success');
            openCccfFormsManager();
        } catch (err) {
            showError(err);
            btn.disabled = false;
            btn.textContent = 'อัปโหลดแบบฟอร์ม';
        }
    }));
}

async function openCccfFormsManager() {
    await loadCccfForms(true);
    openModal('จัดการแบบฟอร์ม CCCF', `
      <div class="space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-semibold text-slate-800">แบบฟอร์มที่เกี่ยวข้องกับ CCCF Form A Permanent</p>
            <p class="mt-0.5 text-xs text-slate-400">ผู้ใช้จะเห็นเฉพาะแบบฟอร์มที่เปิดใช้งาน</p>
          </div>
          <div class="flex items-center gap-2">
            <span id="cccf-forms-count" class="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">${_cccfForms.length} รายการ</span>
            <button id="btn-add-cccf-form-template" type="button" class="rounded-xl px-4 py-2 text-sm font-bold text-white" style="background:linear-gradient(135deg,#059669,#0d9488)">เพิ่มแบบฟอร์ม</button>
          </div>
        </div>
        <div class="overflow-x-auto rounded-2xl border border-slate-200">
          <table class="w-full text-left">
            <thead class="bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
              <tr>
                <th class="px-4 py-3">ชื่อแบบฟอร์ม</th>
                <th class="px-4 py-3">เวอร์ชัน</th>
                <th class="px-4 py-3">ประเภท</th>
                <th class="px-4 py-3">สถานะ</th>
                <th class="px-4 py-3">วันที่อัปโหลด</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody id="cccf-forms-tbody">${renderCccfFormsManageRows()}</tbody>
          </table>
        </div>
      </div>`, 'max-w-4xl');

    document.getElementById('btn-add-cccf-form-template')?.addEventListener('click', openCccfFormUploadModal);
    document.getElementById('cccf-forms-tbody')?.addEventListener('click', guardActionHandler(async e => {
        const toggleBtn = e.target.closest('.cccf-form-toggle');
        const deleteBtn = e.target.closest('.cccf-form-delete');
        if (toggleBtn) {
            const form = _cccfForms.find(f => String(f.id) === String(toggleBtn.dataset.id));
            if (!form) return;
            try {
                await API.put(`/module-forms/${form.id}`, {
                    title: form.Title,
                    description: form.Description,
                    version: form.Version,
                    sortOrder: form.SortOrder,
                    isActive: toggleBtn.dataset.active === '1' ? 0 : 1,
                });
                await loadCccfForms(true);
                refreshCccfFormsManageRows();
                showToast('อัปเดตสถานะแบบฟอร์มสำเร็จ', 'success');
            } catch (err) { showError(err); }
        }
        if (deleteBtn) {
            const ok = await showConfirmationModal('ยืนยันการลบ', `ลบแบบฟอร์ม "${deleteBtn.dataset.title}" ใช่หรือไม่?`);
            if (!ok) return;
            try {
                await API.delete(`/module-forms/${deleteBtn.dataset.id}`);
                await loadCccfForms(true);
                refreshCccfFormsManageRows();
                showToast('ลบแบบฟอร์มสำเร็จ', 'success');
            } catch (err) { showError(err); }
        }
    }, cccfDelegatedActionOptions('forms', '.cccf-form-toggle, .cccf-form-delete', { render: false })));
}

function renderCccfEmailQueueRows(rows = []) {
    if (!rows.length) {
        return `<tr><td colspan="7" class="py-8 text-center text-sm text-slate-400">ยังไม่มีอีเมลในคิว</td></tr>`;
    }
    const statusClass = {
        Queued: 'bg-amber-50 text-amber-700 border-amber-100',
        Failed: 'bg-rose-50 text-rose-700 border-rose-100',
        Sent: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    };
    return rows.map(item => `
      <tr class="border-b border-slate-100 last:border-0">
        <td class="px-4 py-3">
          <p class="text-sm font-semibold text-slate-800">${escapeHtml(item.Subject || '—')}</p>
          ${item.Error ? `<p class="mt-1 max-w-[360px] truncate text-[10px] font-semibold text-rose-500">${escapeHtml(item.Error)}</p>` : ''}
        </td>
        <td class="px-4 py-3">
          <p class="max-w-[260px] truncate text-xs font-semibold text-slate-700">${escapeHtml(item.Recipients || '—')}</p>
          ${item.PermanentSubmitterName ? `<p class="mt-0.5 text-[10px] text-slate-400">Owner: ${escapeHtml(item.PermanentSubmitterName)}</p>` : ''}
        </td>
        <td class="px-4 py-3 text-xs text-slate-500">${escapeHtml(item.EventType || '—')}</td>
        <td class="px-4 py-3 text-xs text-slate-500">${escapeHtml(item.PermanentNo || item.PermanentID || '—')}</td>
        <td class="px-4 py-3">
          <span class="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass[item.Status] || 'bg-slate-50 text-slate-500 border-slate-200'}">${escapeHtml(item.Status || '—')}</span>
        </td>
        <td class="px-4 py-3 text-[11px] text-slate-400 whitespace-nowrap">${escapeHtml(item.SentAt || item.CreatedAt || '—')}</td>
        <td class="px-4 py-3 text-right">
          ${item.Status !== 'Sent' ? `<button class="cccf-email-retry rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100" data-id="${escapeAttr(item.id)}">Retry</button>` : ''}
        </td>
      </tr>`).join('');
}

async function openCccfEmailQueueModal(status = '', eventType = '') {
    openModal('CCCF Email Outbox', `
      <div class="space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-semibold text-slate-800">สถานะอีเมล CCCF</p>
            <p class="mt-0.5 text-xs text-slate-400">ตรวจสอบอีเมลที่ส่งสำเร็จ ล้มเหลว หรือรอ retry</p>
          </div>
          <div class="flex items-center gap-2">
            <select id="cccf-email-event-filter" class="form-select rounded-xl text-xs">
              <option value="">ทุก Event</option>
              ${['Completed', 'Submitted', 'SubmittedByAdmin', 'DirectSignedSubmitted', 'Updated', 'UpdatedWithFile', 'SignedFileUploaded', 'Approved', 'Rejected'].map(value => `<option value="${escapeAttr(value)}" ${eventType === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}
            </select>
            <select id="cccf-email-status-filter" class="form-select rounded-xl text-xs">
              <option value="">ทุกสถานะ</option>
              <option value="Queued" ${status === 'Queued' ? 'selected' : ''}>Queued</option>
              <option value="Failed" ${status === 'Failed' ? 'selected' : ''}>Failed</option>
              <option value="Sent" ${status === 'Sent' ? 'selected' : ''}>Sent</option>
            </select>
            <button id="cccf-email-retry-bulk" class="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100">Retry Queue</button>
          </div>
        </div>
        <div class="overflow-x-auto rounded-2xl border border-slate-200">
          <table class="w-full text-left">
            <thead class="bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
              <tr>
                <th class="px-4 py-3">Subject</th>
                <th class="px-4 py-3">Recipients</th>
                <th class="px-4 py-3">Event</th>
                <th class="px-4 py-3">Permanent</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3">Date</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody id="cccf-email-queue-body">
              <tr><td colspan="7" class="py-8 text-center text-sm text-slate-400">กำลังโหลด...</td></tr>
            </tbody>
          </table>
        </div>
      </div>`, 'max-w-5xl');

    const loadRows = async () => {
        const selectedStatus = document.getElementById('cccf-email-status-filter')?.value || '';
        const selectedEvent = document.getElementById('cccf-email-event-filter')?.value || '';
        const body = document.getElementById('cccf-email-queue-body');
        if (body) body.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-sm text-slate-400">กำลังโหลด...</td></tr>`;
        try {
            const params = new URLSearchParams();
            if (selectedStatus) params.set('status', selectedStatus);
            if (selectedEvent) params.set('eventType', selectedEvent);
            const res = await API.get(`/cccf/email-outbox${params.toString() ? `?${params.toString()}` : ''}`);
            if (body) body.innerHTML = renderCccfEmailQueueRows(res?.data || []);
        } catch (err) {
            if (body) body.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-sm text-rose-500">${escapeHtml(err.message || 'โหลดคิวอีเมลไม่สำเร็จ')}</td></tr>`;
        }
    };
    document.getElementById('cccf-email-status-filter')?.addEventListener('change', loadRows);
    document.getElementById('cccf-email-event-filter')?.addEventListener('change', loadRows);
    document.getElementById('cccf-email-retry-bulk')?.addEventListener('click', guardActionHandler(async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        showLoading('กำลัง retry คิวอีเมล...');
        try {
            const res = await API.post('/cccf/email-outbox/retry-queued', { limit: 20 });
            showToast(`Retry แล้ว ${res.processed || 0} รายการ ส่งสำเร็จ ${res.sent || 0}`, 'success');
            await loadRows();
        } catch (err) { showError(err); } finally { hideLoading(); btn.disabled = false; }
    }, { render: false }));
    document.getElementById('cccf-email-queue-body')?.addEventListener('click', guardActionHandler(async e => {
        const btn = e.target.closest('.cccf-email-retry');
        if (!btn) return;
        btn.disabled = true;
        showLoading('กำลัง retry อีเมล...');
        try {
            await API.post(`/cccf/email-outbox/${btn.dataset.id}/retry`, {});
            showToast('ส่งอีเมลสำเร็จ', 'success');
            await loadRows();
        } catch (err) { showError(err); } finally { hideLoading(); btn.disabled = false; }
    }, cccfDelegatedActionOptions('email-outbox', '.cccf-email-retry', { render: false })));
    await loadRows();
}

function openAssignmentEditor(assignmentId) {
    const assignment = _assignments.find(a => String(a.id) === String(assignmentId));
    if (!assignment) return;
    const employeeOptions = [..._employees]
        .filter(emp => String(emp.EmployeeID || '').trim())
        .sort((a, b) => {
            const deptCompare = String(a.Department || '').localeCompare(String(b.Department || ''));
            if (deptCompare !== 0) return deptCompare;
            return String(a.EmployeeName || '').localeCompare(String(b.EmployeeName || ''));
        });
    const selectedId = String(assignment.EmployeeID || '').trim();
    const selectedEmp = employeeOptions.find(emp => String(emp.EmployeeID || '').trim() === selectedId) || null;

    openModal('แก้ไขการมอบหมาย Form A Permanent', `
      <div class="space-y-4" id="assignment-editor">
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p class="text-[10px] font-bold text-slate-400 uppercase">Current Assignment</p>
          <p class="mt-1 text-sm font-semibold text-slate-800">${escapeHtml(assignment.AssigneeName || '—')}</p>
          <p class="text-[11px] text-slate-500 mt-1">${escapeHtml(assignment.Department || '—')}</p>
          ${assignment.EmployeeID ? `<p class="text-[10px] text-slate-400 mt-1">Employee ID: ${escapeHtml(assignment.EmployeeID)}</p>` : ''}
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">เลือกผู้รับผิดชอบใหม่</label>
          <select id="edit-assignee-id" class="form-select rounded-xl text-sm w-full">
            ${employeeOptions.map(emp => `
              <option value="${escapeAttr(emp.EmployeeID)}" ${String(emp.EmployeeID) === selectedId ? 'selected' : ''}>
                ${escapeHtml(emp.EmployeeName || 'Unknown')} (${escapeHtml(emp.EmployeeID)}) - ${escapeHtml(emp.Department || 'No Department')}
              </option>
            `).join('')}
          </select>
        </div>
        <div id="edit-assignment-preview" class="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <p class="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Preview</p>
          <p class="text-sm font-semibold text-slate-800">${escapeHtml(selectedEmp?.EmployeeName || assignment.AssigneeName || '—')}</p>
          <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(selectedEmp?.Department || assignment.Department || '—')}</p>
          <p class="text-[10px] text-slate-400 mt-1">Employee ID: ${escapeHtml(selectedEmp?.EmployeeID || assignment.EmployeeID || '—')}</p>
        </div>
        <label class="flex items-start gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-xs text-slate-600">
          <input id="edit-assignee-direct" type="checkbox" class="mt-0.5 h-4 w-4 rounded accent-emerald-600" ${Number(assignment.AllowDirectSignedPdf || 0) === 1 ? 'checked' : ''}>
          <span><b>เปิดสิทธิ์ส่ง PDF ลงนามโดยตรง</b><br><span class="text-slate-400">อนุญาตให้ส่ง PDF โดยไม่ต้องผ่าน Excel review</span></span>
        </label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">กำหนดส่ง</label>
            <input id="edit-assignee-due" type="date" class="form-input rounded-xl text-sm w-full" value="${escapeAttr(assignment.DueDate ? String(assignment.DueDate).split('T')[0] : '')}">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">หมายเหตุ</label>
            <input id="edit-assignee-note" type="text" class="form-input rounded-xl text-sm w-full" maxlength="500" placeholder="เช่น งานเร่งด่วน / เอกสารแนบเฉพาะ" value="${escapeAttr(assignment.Note || '')}">
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
          <button type="button" id="btn-save-assignment-edit" class="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all" style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึกการแก้ไข</button>
        </div>
      </div>`, 'max-w-2xl');

    const editSelect = document.getElementById('edit-assignee-id');
    const previewEl = document.getElementById('edit-assignment-preview');
    const syncPreview = () => {
        const emp = employeeOptions.find(row => String(row.EmployeeID) === String(editSelect?.value || '')) || null;
        if (!previewEl) return;
        previewEl.innerHTML = `
          <p class="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Preview</p>
          <p class="text-sm font-semibold text-slate-800">${escapeHtml(emp?.EmployeeName || '—')}</p>
          <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(emp?.Department || '—')}</p>
          <p class="text-[10px] text-slate-400 mt-1">Employee ID: ${escapeHtml(emp?.EmployeeID || '—')}</p>
        `;
    };
    editSelect?.addEventListener('change', syncPreview);
    syncPreview();

    document.getElementById('btn-save-assignment-edit')?.addEventListener('click', guardActionHandler(async e => {
        const btn = e.currentTarget;
        if (btn.dataset.submitting === '1') return;
        const employeeId = String(editSelect?.value || '').trim();
        if (!employeeId) { showToast('กรุณาเลือกผู้รับผิดชอบ', 'error'); return; }
        const allowDirect = document.getElementById('edit-assignee-direct')?.checked ? 1 : 0;
        const dueDate = document.getElementById('edit-assignee-due')?.value || null;
        const note = document.getElementById('edit-assignee-note')?.value.trim() || '';
        btn.dataset.submitting = '1';
        btn.disabled = true;
        showLoading();
        try {
            await API.put(`/cccf/assignments/${assignment.id}`, { EmployeeID: employeeId, AllowDirectSignedPdf: allowDirect, DueDate: dueDate, Note: note });
            showToast('อัปเดตรายการมอบหมายสำเร็จ', 'success');
            await loadCccfPage();
            closeModal();
            openAssignmentManager();
        } catch (err) { showError(err); } finally { hideLoading(); delete btn.dataset.submitting; btn.disabled = false; }
    }));
}

async function openAssignmentManagerLegacy() {
    const deptOpts = _departments.map(d => {
        const deptName = d.Name || d;
        return `<option value="${escapeAttr(deptName)}">${escapeHtml(deptName)}</option>`;
    }).join('');
    openModal('จัดการการมอบหมาย Form A Permanent', `
      <div class="space-y-4" id="assignment-manager">
        <div class="flex justify-between items-center">
          <p class="text-sm text-slate-500">กำหนดว่าส่วนงานใดต้องส่ง Form A Permanent</p>
          <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">${_assignments.length} รายการ</span>
        </div>
        <div class="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
          <p class="text-xs font-bold text-slate-600 uppercase tracking-wider">เพิ่มรายการใหม่</p>
          <div class="grid grid-cols-2 gap-2">
            <input type="text" id="new-assignee-name" class="form-input rounded-xl text-sm" placeholder="ชื่อหัวหน้างาน">
            <select id="new-assignee-dept" class="form-select rounded-xl text-sm">
              <option value="">-- เลือกหน่วยงาน --</option>
              ${deptOpts}
            </select>
              </div>
              <p class="text-[11px] text-slate-400">กด Ctrl หรือ Shift เพื่อเลือกหลายคนพร้อมกัน</p>
              <button id="btn-add-assignment" class="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all" style="background:linear-gradient(135deg,#059669,#0d9488)">
            + เพิ่มรายการ
          </button>
        </div>
        <div class="space-y-2 max-h-64 overflow-y-auto pr-1" id="assignment-list">
          ${_assignments.length > 0
            ? _assignments.map(a => `
              <div class="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200 hover:border-emerald-200 transition-all">
                <div>
                  <p class="font-semibold text-slate-800 text-sm">${escapeHtml(a.AssigneeName)}</p>
                  <p class="text-[10px] text-slate-400">${escapeHtml(a.Department)}</p>
                </div>
                <button data-id="${a.id}" class="btn-del-assignment p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>`).join('')
            : '<div class="text-center py-6 text-slate-400 text-sm bg-slate-50 rounded-xl">ยังไม่มีรายการ</div>'
          }
        </div>
      </div>`, 'max-w-lg');

    document.getElementById('btn-add-assignment')?.addEventListener('click', guardActionHandler(async () => {
        const name = document.getElementById('new-assignee-name').value.trim();
        const dept = document.getElementById('new-assignee-dept').value;
        if (!name || !dept) { showToast('กรุณากรอกชื่อและเลือกหน่วยงาน', 'error'); return; }
        showLoading();
        try {
            await API.post('/cccf/assignments', { AssigneeName: name, Department: dept });
            showToast('เพิ่มรายการสำเร็จ', 'success');
            const res = await API.get('/cccf/assignments').catch(() => []);
            _assignments = Array.isArray(res) ? res : res?.data ?? [];
            closeModal();
            openAssignmentManager();
        } catch (err) { showError(err); } finally { hideLoading(); }
    }, { render: false }));

    document.getElementById('assignment-list')?.addEventListener('click', guardActionHandler(async e => {
        const editBtn = e.target.closest('.btn-edit-assignment');
        if (editBtn) {
            openAssignmentEditor(editBtn.dataset.id);
            return;
        }
        const btn = e.target.closest('.btn-del-assignment');
        if (!btn) return;
        const ok = await showConfirmationModal('ยืนยันการลบ', 'ลบรายการมอบหมายนี้ใช่หรือไม่?');
        if (!ok) return;
        showLoading();
        try {
            await API.delete(`/cccf/assignments/${btn.dataset.id}`);
            showToast('ลบสำเร็จ', 'success');
            const res = await API.get('/cccf/assignments').catch(() => []);
            _assignments = Array.isArray(res) ? res : res?.data ?? [];
            closeModal();
            openAssignmentManager();
        } catch (err) { showError(err); } finally { hideLoading(); }
    }, cccfDelegatedActionOptions('assignments', '.btn-edit-assignment, .btn-del-assignment', { render: false })));
}

async function openAssignmentManager() {
    const employeeOptions = getAssignmentEmployeeOptions();
    const getEmployeePosition = (emp) => String(emp?.Position || emp?.Team || '').trim();
    const positionOptions = [...new Set(employeeOptions.map(getEmployeePosition).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    const buildEmployeeOptionHtml = (list) => list.map(emp => `
      <option value="${escapeAttr(emp.EmployeeID)}">${escapeHtml(emp.EmployeeName || emp.name || 'Unknown')} (${escapeHtml(emp.EmployeeID)}) - ${escapeHtml(emp.Department || 'No Department')}${getEmployeePosition(emp) ? ` - ${escapeHtml(getEmployeePosition(emp))}` : ''}</option>
    `).join('');
    const optionHtml = buildEmployeeOptionHtml(employeeOptions);
    const firstEmployee = employeeOptions[0] || null;

    openModal('จัดการการมอบหมาย Form A Permanent', `
      <div class="space-y-4" id="assignment-manager">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-semibold text-slate-800">กำหนดผู้รับผิดชอบจาก Master Employee</p>
            <p class="mt-0.5 text-xs text-slate-400">เพิ่มรายชื่อเข้ารายการมอบหมายก่อน แล้วจึงเปิดสิทธิ์ Direct PDF จากรายการด้านขวา</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">${_assignments.length} รายการ</span>
            <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">${_assignments.filter(a => Number(a.AllowDirectSignedPdf || 0) === 1).length} Direct PDF</span>
          </div>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.4fr)] gap-4 items-start">
        <div class="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
          <p class="text-xs font-bold text-slate-600 uppercase tracking-wider">เพิ่มรายการจาก Master Employee</p>
          ${employeeOptions.length ? `
            <div class="space-y-3">
              <select id="assignment-position-filter" class="form-select rounded-xl text-sm w-full">
                <option value="">ทุกตำแหน่ง</option>
                ${positionOptions.map(position => `<option value="${escapeAttr(position)}">${escapeHtml(position)}</option>`).join('')}
              </select>
              <select id="new-assignee-id" class="form-select rounded-xl text-sm w-full min-h-[220px]" multiple size="8">
                ${optionHtml}
              </select>
              <div id="assignment-master-preview" class="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p class="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Master Preview</p>
                <p class="text-sm font-semibold text-slate-800">${escapeHtml(firstEmployee?.EmployeeName || '—')}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(firstEmployee?.Department || '—')}</p>
                <p class="text-[10px] text-slate-400 mt-1">Employee ID: ${escapeHtml(firstEmployee?.EmployeeID || '—')}</p>
              </div>
              <div class="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Direct PDF จะเปิดได้หลังจากรายชื่อนี้ถูกเพิ่มเป็น assignment แล้ว เพื่อให้สิทธิ์ผูกกับงานที่มอบหมายจริง
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">กำหนดส่ง</label>
                  <input id="new-assignee-due" type="date" class="form-input rounded-xl text-sm w-full">
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">หมายเหตุ</label>
                  <input id="new-assignee-note" type="text" class="form-input rounded-xl text-sm w-full" maxlength="500" placeholder="ข้อความติดตามงาน">
                </div>
              </div>
              <p class="text-[11px] text-slate-400">กด Ctrl หรือ Shift เพื่อเลือกหลายคนพร้อมกัน</p>
              <button id="btn-add-assignment" class="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all" style="background:linear-gradient(135deg,#059669,#0d9488)">
                + เพิ่มรายการมอบหมาย
              </button>
            </div>
          ` : `
            <div class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-sm text-slate-400">
              ไม่พบรายชื่อจาก Master ที่พร้อมเพิ่ม หรือถูกมอบหมายครบแล้ว
            </div>
          `}
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4">
          <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-xs font-bold uppercase tracking-wider text-slate-600">รายการที่มอบหมายแล้ว</p>
              <p class="mt-0.5 text-[11px] text-slate-400">เปิดสิทธิ์ Direct PDF ได้เฉพาะรายชื่อในรายการนี้</p>
            </div>
            <span class="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500 border border-slate-200">${_assignments.length} assigned</span>
          </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-2 max-h-[520px] overflow-y-auto pr-1" id="assignment-list">
          ${_assignments.length > 0
            ? _assignments.map(a => `
              <div class="flex items-start justify-between gap-3 px-4 py-3 bg-white rounded-xl border ${Number(a.AllowDirectSignedPdf || 0) === 1 ? 'border-emerald-200 shadow-sm' : 'border-slate-200'} hover:border-emerald-200 transition-all">
                <div class="min-w-0">
                  <p class="truncate font-semibold text-slate-800 text-sm">${escapeHtml(a.AssigneeName)}</p>
                  <p class="truncate text-[10px] text-slate-400">${escapeHtml(a.Department)}</p>
                  ${a.EmployeeID ? `<p class="text-[10px] text-slate-300 mt-0.5">Employee ID: ${escapeHtml(a.EmployeeID)}</p>` : ''}
                  ${a.DueDate ? `<span class="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold ${getDueMeta(a.DueDate).className}">Due ${escapeHtml(formatThaiDate(a.DueDate))}</span>` : `<span class="mt-1 inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-400 border border-slate-200">No Due</span>`}
                  ${Number(a.AllowDirectSignedPdf || 0) === 1
                    ? `<span class="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-100">Direct PDF เปิดอยู่</span>`
                    : `<span class="mt-1 inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-500 border border-slate-200">Excel review ก่อน</span>`}
                  ${a.Note ? `<p class="mt-1 truncate text-[10px] text-indigo-500">Note: ${escapeHtml(a.Note)}</p>` : ''}
                </div>
                <div class="flex shrink-0 items-center gap-1.5">
                  <button data-id="${a.id}" data-direct="${Number(a.AllowDirectSignedPdf || 0) === 1 ? '1' : '0'}" class="btn-toggle-direct-assignment rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${Number(a.AllowDirectSignedPdf || 0) === 1 ? 'border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}">
                    ${Number(a.AllowDirectSignedPdf || 0) === 1 ? 'ปิด Direct' : 'เปิด Direct'}
                  </button>
                  <button data-id="${a.id}" class="btn-edit-assignment p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button data-id="${a.id}" class="btn-del-assignment p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>`).join('')
            : '<div class="text-center py-6 text-slate-400 text-sm bg-slate-50 rounded-xl">ยังไม่มีรายการมอบหมาย</div>'
          }
        </div>
        </div>
        </div>
      </div>`, 'max-w-6xl');

    const previewEl = document.getElementById('assignment-master-preview');
    const positionFilterEl = document.getElementById('assignment-position-filter');
    const employeeSelect = document.getElementById('new-assignee-id');
    const getFilteredEmployees = () => {
        const selectedPosition = positionFilterEl?.value || '';
        return selectedPosition
            ? employeeOptions.filter(emp => getEmployeePosition(emp) === selectedPosition)
            : employeeOptions;
    };
    const renderEmployeeSelect = (selectedEmployeeId = '') => {
        if (!employeeSelect) return;
        const filteredEmployees = getFilteredEmployees();
        employeeSelect.innerHTML = filteredEmployees.length
            ? buildEmployeeOptionHtml(filteredEmployees)
            : '<option value="">ไม่พบพนักงานในตำแหน่งนี้</option>';
        employeeSelect.disabled = filteredEmployees.length === 0;
        if (filteredEmployees.length) {
            const nextSelected = filteredEmployees.find(emp => String(emp.EmployeeID) === String(selectedEmployeeId)) || filteredEmployees[0];
            employeeSelect.value = String(nextSelected.EmployeeID);
        }
    };
    const syncAssignmentPreview = () => {
        if (!previewEl || !employeeSelect) return;
        const selected = employeeOptions.find(emp => String(emp.EmployeeID) === String(employeeSelect.value)) || null;
        previewEl.innerHTML = `
          <p class="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Master Preview</p>
          <p class="text-sm font-semibold text-slate-800">${escapeHtml(selected?.EmployeeName || '—')}</p>
          <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(selected?.Department || '—')}</p>
          <p class="text-[10px] text-slate-400 mt-1">Employee ID: ${escapeHtml(selected?.EmployeeID || '—')}</p>
        `;
    };
    positionFilterEl?.addEventListener('change', () => {
        renderEmployeeSelect();
        syncAssignmentPreview();
    });
    employeeSelect?.addEventListener('change', syncAssignmentPreview);
    renderEmployeeSelect(firstEmployee?.EmployeeID || '');
    syncAssignmentPreview();

    document.getElementById('btn-add-assignment')?.addEventListener('click', guardActionHandler(async e => {
        const btn = e.currentTarget;
        if (btn.dataset.submitting === '1') return;
        const employeeIds = Array.from(document.getElementById('new-assignee-id')?.selectedOptions || []).map(opt => String(opt.value)).filter(Boolean);
        const employeeId = employeeIds[0] || '';
        const dueDate = document.getElementById('new-assignee-due')?.value || null;
        const note = document.getElementById('new-assignee-note')?.value.trim() || '';
        if (!employeeId) { showToast('กรุณาเลือกรายชื่อจาก Master', 'error'); return; }
        btn.dataset.submitting = '1';
        btn.disabled = true;
        showLoading();
        try {
            const results = await Promise.allSettled(
                employeeIds.map(id => API.post('/cccf/assignments', { EmployeeID: id, AllowDirectSignedPdf: 0, DueDate: dueDate, Note: note }))
            );
            showToast('เพิ่มรายการมอบหมายสำเร็จ', 'success');
            await loadCccfPage();
            closeModal();
            openAssignmentManager();
        } catch (err) { showError(err); } finally { hideLoading(); delete btn.dataset.submitting; btn.disabled = false; }
    }));

    document.getElementById('assignment-list')?.addEventListener('click', guardActionHandler(async e => {
        const editBtn = e.target.closest('.btn-edit-assignment');
        if (editBtn) {
            openAssignmentEditor(editBtn.dataset.id);
            return;
        }
        const directBtn = e.target.closest('.btn-toggle-direct-assignment');
        if (directBtn) {
            if (directBtn.dataset.submitting === '1') return;
            const assignment = _assignments.find(a => String(a.id) === String(directBtn.dataset.id));
            if (!assignment?.EmployeeID) {
                showToast('เปิด Direct PDF ได้เฉพาะรายการที่ผูก Employee Master แล้ว', 'error');
                return;
            }
            const nextValue = directBtn.dataset.direct === '1' ? 0 : 1;
            directBtn.dataset.submitting = '1';
            directBtn.disabled = true;
            showLoading(nextValue ? 'กำลังเปิดสิทธิ์ Direct PDF...' : 'กำลังปิดสิทธิ์ Direct PDF...');
            try {
                await API.put(`/cccf/assignments/${assignment.id}`, {
                    EmployeeID: assignment.EmployeeID,
                    AllowDirectSignedPdf: nextValue,
                    DueDate: assignment.DueDate || null,
                    Note: assignment.Note || '',
                });
                showToast(nextValue ? 'เปิดสิทธิ์ Direct PDF สำเร็จ' : 'ปิดสิทธิ์ Direct PDF สำเร็จ', 'success');
                await loadCccfPage();
                closeModal();
                openAssignmentManager();
            } catch (err) { showError(err); } finally { hideLoading(); delete directBtn.dataset.submitting; directBtn.disabled = false; }
            return;
        }
        const btn = e.target.closest('.btn-del-assignment');
        if (!btn) return;
        if (btn.dataset.submitting === '1') return;
        const ok = await showConfirmationModal('ยืนยันการลบ', 'ลบรายการมอบหมายนี้ใช่หรือไม่?');
        if (!ok) return;
        btn.dataset.submitting = '1';
        btn.disabled = true;
        showLoading();
        try {
            await API.delete(`/cccf/assignments/${btn.dataset.id}`);
            showToast('ลบสำเร็จ', 'success');
            await loadCccfPage();
            closeModal();
            openAssignmentManager();
        } catch (err) { showError(err); } finally { hideLoading(); delete btn.dataset.submitting; btn.disabled = false; }
    }, cccfDelegatedActionOptions('assignments', '.btn-edit-assignment, .btn-toggle-direct-assignment, .btn-del-assignment', { render: false })));
}
