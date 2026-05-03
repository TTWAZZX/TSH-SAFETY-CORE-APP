// public/js/pages/ojt.js — SCW / OJT Module
// OJT tracked per DEPARTMENT (one record per dept, upsert on update)
import { API } from '../api.js';
import {
    hideLoading, showError, showLoading,
    openModal, closeModal, showToast, showConfirmationModal,
    statusBadge as dsStatusBadge,
} from '../ui.js';
import { normalizeApiArray } from '../utils/normalize.js';
import { buildActivityCard } from '../utils/activity-widget.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_META = {
    'valid':    { label: 'Valid',           bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-400 animate-pulse' },
    'due-soon': { label: 'Due Soon',        bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-400' },
    'overdue':  { label: 'Overdue',         bg: 'bg-red-100',     text: 'text-red-600',     dot: 'bg-red-400' },
    'no-data':  { label: 'ยังไม่มีข้อมูล', bg: 'bg-slate-100',   text: 'text-slate-500',   dot: 'bg-slate-300' },
};

const DOC_TYPE_META = {
    pdf:  { label: 'PDF',    bg: 'bg-red-100',     text: 'text-red-700'     },
    doc:  { label: 'Word',   bg: 'bg-blue-100',    text: 'text-blue-700'    },
    docx: { label: 'Word',   bg: 'bg-blue-100',    text: 'text-blue-700'    },
    xls:  { label: 'Excel',  bg: 'bg-emerald-100', text: 'text-emerald-700' },
    xlsx: { label: 'Excel',  bg: 'bg-emerald-100', text: 'text-emerald-700' },
    ppt:  { label: 'PPT',    bg: 'bg-orange-100',  text: 'text-orange-700'  },
    pptx: { label: 'PPT',    bg: 'bg-orange-100',  text: 'text-orange-700'  },
    png:  { label: 'รูปภาพ', bg: 'bg-violet-100',  text: 'text-violet-700'  },
    jpg:  { label: 'รูปภาพ', bg: 'bg-violet-100',  text: 'text-violet-700'  },
    jpeg: { label: 'รูปภาพ', bg: 'bg-violet-100',  text: 'text-violet-700'  },
};

const SCW_ICONS = [
    `<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>`,
    `<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>`,
    `<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
];
const SCW_GRADIENTS = [
    'linear-gradient(135deg,#dc2626,#ea580c)',
    'linear-gradient(135deg,#d97706,#f59e0b)',
    'linear-gradient(135deg,#2563eb,#0284c7)',
];
const SCW_COLORS = ['red', 'amber', 'blue'];
const SCW_DEFAULTS = [
    { title: 'STOP — หยุด', text: 'หยุดการทำงานทันทีเมื่อพบสิ่งผิดปกติหรือไม่แน่ใจในความปลอดภัย อย่าฝืนทำงานต่อ' },
    { title: 'CALL — โทร',  text: 'แจ้งหัวหน้างานหรือผู้รับผิดชอบทันที อธิบายปัญหาที่พบให้ชัดเจน' },
    { title: 'WAIT — รอ',   text: 'รอการตอบสนองจากผู้รับผิดชอบ ห้ามเริ่มงานต่อจนกว่าจะได้รับอนุญาต' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const HIDDEN_DEPTS_KEY = 'tsh_ojt_hidden_depts';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _isAdmin        = false;
let _records        = [];
let _allDepts       = [];      // full dept list from Master_Departments
let _standard       = null;
let _docs           = [];
let _filterStatus   = '';
let _filterYear     = '';
let _searchQ        = '';
let _hiddenDepts    = new Set();
let _listenersReady = false;

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
export async function loadOjtPage() {
    const container = document.getElementById('ojt-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _isAdmin = user.role === 'Admin' || user.Role === 'Admin';
    window.closeModal = closeModal;
    _loadHiddenDepts();

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    await refreshData();
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="ojt-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#ojt-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none"
                 style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                </svg>
                                Stop · Call · Wait
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">OJT / SCW Safety</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">มาตรฐาน Stop-Call-Wait · เอกสาร SCW · สถานะการอบรม OJT รายแผนก</p>
                    </div>
                    <!-- Stats strip -->
                    <div id="ojt-hero-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 w-full md:w-auto flex-shrink-0">
                        ${[1,2,3,4].map(() => `
                        <div class="rounded-xl px-4 py-3 text-center animate-pulse" style="background:rgba(255,255,255,0.12);min-width:80px">
                            <div class="h-7 bg-white/20 rounded-lg mb-1.5 mx-auto w-10"></div>
                            <div class="h-3 bg-white/15 rounded w-14 mx-auto"></div>
                        </div>`).join('')}
                    </div>
                </div>
            </div>
        </div>

        <!-- Page sections -->
        <div id="ojt-content"></div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA REFRESH
// ─────────────────────────────────────────────────────────────────────────────
async function refreshData() {
    showLoading('กำลังโหลดข้อมูล OJT...');
    try {
        const [recRes, stdRes, docRes, deptRes] = await Promise.all([
            API.get('/ojt/records'),
            API.get('/ojt/standard'),
            API.get('/ojt/documents'),
            API.get('/master/departments'),
        ]);
        _records  = normalizeApiArray(recRes?.data ?? recRes);
        _standard = stdRes?.data ?? null;
        _docs     = normalizeApiArray(docRes?.data ?? docRes);
        _allDepts = normalizeApiArray(deptRes?.data ?? deptRes)
            .map(d => d.Name || d.name)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'th'));
    } catch (err) {
        showToast('โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
    _loadHeroStats();
    renderAll();
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO STATS STRIP
// ─────────────────────────────────────────────────────────────────────────────
async function _loadHeroStats() {
    const strip = document.getElementById('ojt-hero-stats');
    if (!strip) return;

    // Metrics based only on selected (visible) departments
    const visible = _records.filter(r => !_hiddenDepts.has(r.Department));
    const total   = visible.length;
    const valid   = visible.filter(r => _calcStatus(r.NextReviewDate) === 'valid').length;
    const dueSoon = visible.filter(r => _calcStatus(r.NextReviewDate) === 'due-soon').length;
    const overdue = visible.filter(r => _calcStatus(r.NextReviewDate) === 'overdue').length;
    const noData  = visible.filter(r => _calcStatus(r.NextReviewDate) === 'no-data').length;
    const denom   = total - noData;
    const pct     = denom > 0 ? Math.round(valid * 100 / denom) : 0;

    strip.innerHTML = `
        <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);min-width:80px">
            <p class="text-2xl font-bold text-white">${total}</p>
            <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">แผนกทั้งหมด</p>
        </div>
        <button class="btn-ojt-filter-stat rounded-xl px-4 py-3 text-center hover:bg-white/20 transition-colors" data-val="valid"
            style="background:rgba(255,255,255,0.12);min-width:80px">
            <p class="text-2xl font-bold" style="color:#6ee7b7">${valid}</p>
            <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">Valid</p>
        </button>
        <button class="btn-ojt-filter-stat rounded-xl px-4 py-3 text-center hover:bg-white/20 transition-colors" data-val="due-soon"
            style="background:${dueSoon > 0 ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.12)'};min-width:80px">
            <p class="text-2xl font-bold" style="color:${dueSoon > 0 ? '#fcd34d' : 'rgba(167,243,208,0.85)'}">${dueSoon}</p>
            <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">Due Soon</p>
        </button>
        <button class="btn-ojt-filter-stat rounded-xl px-4 py-3 text-center hover:bg-white/20 transition-colors" data-val="overdue"
            style="background:${overdue > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.12)'};min-width:80px">
            <p class="text-2xl font-bold" style="color:${overdue > 0 ? '#fca5a5' : 'rgba(167,243,208,0.85)'}">${overdue}</p>
            <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">Overdue</p>
        </button>
        <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);min-width:80px">
            <p class="text-2xl font-bold" style="color:${pct >= 80 ? '#6ee7b7' : pct >= 50 ? '#fcd34d' : '#fca5a5'}">${pct}%</p>
            <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">Compliance</p>
        </div>`;

    // Adjust grid to fit 5 items (+ optional activity target card)
    strip.className = 'grid grid-cols-3 md:grid-cols-5 gap-3 w-full md:w-auto flex-shrink-0';

    const atCard = await buildActivityCard('scw');
    if (atCard) {
        strip.insertAdjacentHTML('beforeend', atCard);
        strip.className = 'grid grid-cols-3 md:grid-cols-6 gap-3 w-full md:w-auto flex-shrink-0';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER ALL SECTIONS
// ─────────────────────────────────────────────────────────────────────────────
function renderAll() {
    const container = document.getElementById('ojt-content');
    if (!container) return;
    container.innerHTML = `
        <div class="space-y-6">
            ${_buildStandardSection()}
            ${_buildDocumentsSection()}
            ${_buildComplianceSection()}
        </div>`;
}

function _rerenderCompliance() {
    const el = document.getElementById('ojt-compliance-inner');
    if (el) el.innerHTML = _buildComplianceInner();
}

// ─── Section: Standard ───────────────────────────────────────────────────────
function _buildStandardSection() {
    const items = _getScwItems();
    const cards = items.map((item, i) => `
        <div class="rounded-xl p-5 border border-${SCW_COLORS[i]}-200 bg-${SCW_COLORS[i]}-50">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:${SCW_GRADIENTS[i]}">
                    ${SCW_ICONS[i]}
                </div>
                <h3 class="font-bold text-${SCW_COLORS[i]}-700">${_esc(item.title)}</h3>
            </div>
            <p class="text-sm text-slate-700 leading-relaxed">${_esc(item.text)}</p>
        </div>`).join('');

    const updatedAt = _standard?.UpdatedAt
        ? `<p class="text-xs text-slate-400 mt-1">อัปเดตโดย ${_esc(_standard.UpdatedBy || '—')} เมื่อ ${new Date(_standard.UpdatedAt).toLocaleDateString('th-TH')}</p>`
        : '';

    return `
    <div class="ds-section overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                     style="background:linear-gradient(135deg,#dc2626,#ea580c);box-shadow:0 2px 10px rgba(220,38,38,0.3)">
                    <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <div>
                    <p class="font-bold text-slate-800">มาตรฐาน Stop · Call · Wait</p>
                    ${updatedAt}
                </div>
            </div>
            ${_isAdmin ? `
            <button class="btn-ojt-edit-std flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                แก้ไข
            </button>` : ''}
        </div>
        <div class="p-5">
            <div class="grid md:grid-cols-3 gap-4">${cards}</div>
        </div>
    </div>`;
}

// ─── Section: Documents ──────────────────────────────────────────────────────
function _buildDocumentsSection() {
    const bodyHtml = _docs.length === 0
        ? `<div class="text-center py-10 text-slate-400">
            <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg class="w-7 h-7 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <p class="font-medium text-sm">ยังไม่มีเอกสาร SCW</p>
            ${_isAdmin ? `<p class="text-xs mt-1">คลิก "อัปโหลด" เพื่อเพิ่มไฟล์</p>` : ''}
           </div>`
        : `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${_docs.map(doc => {
                const ext  = (doc.FileType || doc.FileURL?.split('.').pop() || '').toLowerCase().replace(/\?.*/, '');
                const meta = DOC_TYPE_META[ext] || { label: ext.toUpperCase() || 'ไฟล์', bg: 'bg-slate-100', text: 'text-slate-600' };
                const kb   = doc.FileSizeKB ? (doc.FileSizeKB >= 1024 ? `${(doc.FileSizeKB/1024).toFixed(1)} MB` : `${doc.FileSizeKB} KB`) : '';
                const dt   = doc.UploadedAt ? new Date(doc.UploadedAt).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'2-digit' }) : '';
                return `
                <div class="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all bg-white">
                    <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100">
                        <svg class="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold text-slate-800 truncate">${_esc(doc.Title)}</p>
                        <div class="flex items-center gap-2 mt-1 flex-wrap">
                            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${meta.bg} ${meta.text}">${meta.label}</span>
                            ${kb ? `<span class="text-[10px] text-slate-400">${kb}</span>` : ''}
                            ${dt ? `<span class="text-[10px] text-slate-400">${dt}</span>` : ''}
                        </div>
                        <p class="text-[10px] text-slate-400 mt-0.5">โดย ${_esc(doc.UploadedBy || '—')}</p>
                    </div>
                    <div class="flex items-center gap-1 flex-shrink-0">
                        <a href="${doc.FileURL}" target="_blank" rel="noopener"
                            class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="เปิดไฟล์">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        </a>
                        ${_isAdmin ? `
                        <button class="btn-ojt-delete-doc p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            data-id="${doc.id}" data-title="${_esc(doc.Title)}" title="ลบเอกสาร">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>` : ''}
                    </div>
                </div>`;
            }).join('')}
           </div>`;

    return `
    <div class="ds-section overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                     style="background:linear-gradient(135deg,#dc2626,#ea580c);box-shadow:0 2px 10px rgba(220,38,38,0.3)">
                    <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <div>
                    <p class="font-bold text-slate-800">เอกสาร SCW</p>
                    <p class="text-xs text-slate-400">${_docs.length} ไฟล์</p>
                </div>
            </div>
            ${_isAdmin ? `
            <button class="btn-ojt-upload flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                style="background:linear-gradient(135deg,#dc2626,#ea580c);color:#fff">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                อัปโหลด
            </button>` : ''}
        </div>
        <div class="p-5">${bodyHtml}</div>
    </div>`;
}

// ─── Section: Compliance ─────────────────────────────────────────────────────
function _buildComplianceSection() {
    const totalDepts   = (_allDepts.length || _records.length);
    const visibleCount = _records.filter(r => !_hiddenDepts.has(r.Department)).length;
    const hiddenCount  = _hiddenDepts.size;
    return `
    <div class="ds-section overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                     style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 10px rgba(5,150,105,0.3)">
                    <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                </div>
                <div>
                    <p class="font-bold text-slate-800">OJT Compliance</p>
                    <p class="text-xs text-slate-400">แสดง ${visibleCount} จาก ${totalDepts} แผนก${hiddenCount > 0 ? ` · ซ่อน ${hiddenCount} แผนก` : ''}</p>
                </div>
            </div>
            ${_isAdmin ? `
            <button class="btn-ojt-manage-depts flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                จัดการแผนก${_hiddenDepts.size > 0 ? ` <span class="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">${_hiddenDepts.size} ซ่อน</span>` : ''}
            </button>` : ''}
        </div>
        <div id="ojt-compliance-inner" class="p-5">
            ${_buildComplianceInner()}
        </div>
    </div>`;
}

function _buildComplianceSummary() {
    const visible    = _records.filter(r => !_hiddenDepts.has(r.Department));
    const total      = visible.length;
    if (total === 0) return '';

    const valid      = visible.filter(r => _calcStatus(r.NextReviewDate) === 'valid').length;
    const dueSoon    = visible.filter(r => _calcStatus(r.NextReviewDate) === 'due-soon').length;
    const overdue    = visible.filter(r => _calcStatus(r.NextReviewDate) === 'overdue').length;
    const noData     = visible.filter(r => _calcStatus(r.NextReviewDate) === 'no-data').length;
    const denom      = total - noData;
    const compPct    = denom > 0 ? Math.round(valid * 100 / denom) : 0;

    const withTarget = visible.filter(r => parseInt(r.YearlyTarget) > 0);
    const metTarget  = withTarget.filter(r => parseInt(r.AttendeeCount) >= parseInt(r.YearlyTarget)).length;
    const targetPct  = withTarget.length > 0 ? Math.round(metTarget * 100 / withTarget.length) : null;

    const compColor  = compPct >= 80 ? '#059669' : compPct >= 50 ? '#d97706' : '#dc2626';
    const tgtColor   = targetPct === null ? '#94a3b8' : targetPct >= 80 ? '#059669' : targetPct >= 50 ? '#d97706' : '#dc2626';

    return `
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 p-4 rounded-xl border border-slate-100" style="background:#f8fafc">
        <div class="text-center">
            <p class="text-xl font-bold text-slate-800">${total}</p>
            <p class="text-xs text-slate-500 mt-0.5">แผนกที่เลือก</p>
        </div>
        <div class="text-center">
            <p class="text-xl font-bold" style="color:#059669">${valid}</p>
            <p class="text-xs text-slate-500 mt-0.5">Valid</p>
        </div>
        <div class="text-center">
            <p class="text-xl font-bold" style="color:${dueSoon > 0 ? '#d97706' : '#94a3b8'}">${dueSoon}</p>
            <p class="text-xs text-slate-500 mt-0.5">Due Soon</p>
        </div>
        <div class="text-center">
            <p class="text-xl font-bold" style="color:${overdue > 0 ? '#dc2626' : '#94a3b8'}">${overdue}</p>
            <p class="text-xs text-slate-500 mt-0.5">Overdue</p>
        </div>
        <div class="text-center sm:border-l sm:border-slate-200 sm:pl-3">
            <p class="text-xl font-bold" style="color:${compColor}">${compPct}%</p>
            <p class="text-xs text-slate-500 mt-0.5">Compliance</p>
        </div>
        ${withTarget.length > 0 ? `
        <div class="col-span-2 sm:col-span-5 border-t border-slate-100 pt-3 mt-1 flex items-center justify-between">
            <span class="text-xs text-slate-500">เป้าหมายผู้เข้าร่วม</span>
            <span class="text-xs font-semibold" style="color:${tgtColor}">${metTarget}/${withTarget.length} แผนกบรรลุเป้า${targetPct !== null ? ` (${targetPct}%)` : ''}</span>
        </div>` : ''}
    </div>`;
}

function _buildComplianceInner() {
    const filtered  = _getFiltered();
    const today     = new Date(); today.setHours(0, 0, 0, 0);

    // Distinguish "all depts hidden" from "filter produced no results"
    const visibleBeforeFilter = _records.filter(r => !_hiddenDepts.has(r.Department));
    const allDeptsHidden      = _records.length > 0 && visibleBeforeFilter.length === 0;

    const tableHtml = filtered.length === 0
        ? allDeptsHidden
            ? `<div class="text-center py-12 text-slate-400">
                <div class="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                </div>
                <p class="font-medium text-sm text-slate-600">ซ่อนแผนกทั้งหมดแล้ว</p>
                <p class="text-xs mt-1">ไม่มีแผนกที่เลือกแสดง</p>
                ${_isAdmin ? `<button class="btn-ojt-manage-depts mt-3 text-xs font-semibold text-emerald-600 hover:underline">จัดการแผนก</button>` : ''}
               </div>`
            : `<div class="text-center py-12 text-slate-400">
                <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-7 h-7 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                </div>
                <p class="font-medium text-sm">ไม่พบข้อมูล</p>
               </div>`
        : `<div class="overflow-x-auto">
            <table class="ds-table text-sm">
                <thead class="bg-slate-50 border-b border-slate-100">
                    <tr>
                        <th class="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">แผนก</th>
                        <th class="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">วันที่ OJT</th>
                        <th class="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">วันครบกำหนด</th>
                        <th class="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">วิทยากร</th>
                        <th class="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">ผู้เข้าร่วม</th>
                        <th class="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">เป้าหมาย</th>
                        <th class="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">สถานะ</th>
                        ${_isAdmin ? `<th class="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">จัดการ</th>` : ''}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                    ${filtered.map(r => {
                        const status = _calcStatus(r.NextReviewDate);
                        const meta   = STATUS_META[status];
                        let daysLabel = '';
                        if (r.NextReviewDate) {
                            const diff = Math.ceil((new Date(r.NextReviewDate) - today) / 86400000);
                            daysLabel  = diff < 0
                                ? `<br><span class="text-[10px] text-red-500">เกิน ${Math.abs(diff)} วัน</span>`
                                : `<br><span class="text-[10px] text-slate-400">เหลือ ${diff} วัน</span>`;
                        }
                        const rowBg = status === 'overdue'  ? 'style="background:rgba(254,242,242,0.5)"'
                                    : status === 'due-soon' ? 'style="background:rgba(255,251,235,0.4)"'
                                    : '';
                        return `
                        <tr ${rowBg} class="hover:bg-slate-50/60 transition-colors">
                            <td class="px-4 py-3 font-medium text-slate-800">${_esc(r.Department)}</td>
                            <td class="px-4 py-3 text-slate-600">${_fmtDate(r.OJTDate)}</td>
                            <td class="px-4 py-3 text-slate-600">${_fmtDate(r.NextReviewDate)}${daysLabel}</td>
                            <td class="px-4 py-3 text-slate-600">${_esc(r.TrainerName || '—')}</td>
                            <td class="px-4 py-3 text-slate-600">${r.AttendeeCount > 0 ? r.AttendeeCount + ' คน' : '—'}</td>
                            <td class="px-4 py-3">${_buildTargetBadge(r)}</td>
                            <td class="px-4 py-3">${dsStatusBadge(status, { label: meta.label })}</td>
                            ${_isAdmin ? `
                            <td class="px-4 py-3 text-right">
                                <div class="flex items-center justify-end gap-1.5">
                                    <button class="btn-ojt-edit-record flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors
                                        ${r.id ? 'border-blue-200 text-blue-600 hover:bg-blue-50' : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50'}"
                                        data-dept="${_esc(r.Department)}">
                                        ${r.id
                                            ? `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>อัปเดต OJT`
                                            : `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>บันทึก OJT`
                                        }
                                    </button>
                                    ${r.id ? `
                                    <button class="btn-ojt-view-history p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                                        data-dept="${_esc(r.Department)}" title="ดูประวัติ">
                                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                    </button>
                                    <button class="btn-ojt-delete-record p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                        data-id="${r.id}" data-dept="${_esc(r.Department)}" title="ลบ">
                                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                    </button>` : ''}
                                </div>
                            </td>` : ''}
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
           </div>`;

    const curYear = new Date().getFullYear();
    const yearOpts = [curYear - 1, curYear, curYear + 1].map(y =>
        `<option value="${y}" ${_filterYear === String(y) ? 'selected' : ''}>${y}</option>`
    ).join('');

    return `
        ${_buildComplianceSummary()}
        <div class="ds-filter-bar flex flex-wrap gap-3 items-center mb-4">
            <div class="relative flex-1 min-w-[180px]">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                <input id="ojt-search" type="text" placeholder="ค้นหาชื่อแผนก..." value="${_esc(_searchQ)}"
                    class="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
            </div>
            <select id="ojt-year" class="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400">
                <option value="">ทุกปี</option>
                ${yearOpts}
            </select>
            <select id="ojt-status" class="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400">
                <option value="">ทุกสถานะ</option>
                <option value="valid"    ${_filterStatus === 'valid'    ? 'selected' : ''}>Valid</option>
                <option value="due-soon" ${_filterStatus === 'due-soon' ? 'selected' : ''}>Due Soon (≤30 วัน)</option>
                <option value="overdue"  ${_filterStatus === 'overdue'  ? 'selected' : ''}>Overdue</option>
                <option value="no-data"  ${_filterStatus === 'no-data'  ? 'selected' : ''}>ยังไม่มีข้อมูล</option>
            </select>
            ${_filterStatus || _searchQ || _filterYear ? `
            <button class="btn-ojt-clear-filter text-xs text-slate-500 underline hover:text-slate-700">ล้างตัวกรอง</button>` : ''}
            <span class="text-xs text-slate-400 ml-auto">${filtered.length} แผนก</span>
        </div>
        ${tableHtml}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTER HELPER
// ─────────────────────────────────────────────────────────────────────────────
function _getFiltered() {
    const q = _searchQ.toLowerCase();
    return _records.filter(r => {
        if (_hiddenDepts.has(r.Department)) return false;
        if (q && !r.Department?.toLowerCase().includes(q)) return false;
        if (_filterStatus && _calcStatus(r.NextReviewDate) !== _filterStatus) return false;
        if (_filterYear && r.OJTDate) {
            if (new Date(r.OJTDate).getFullYear().toString() !== _filterYear) return false;
        }
        return true;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT DELEGATION
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', async (e) => {
        if (!e.target.closest('#ojt-page')) return;

        // Hero stats filter chip — sets filter and scrolls compliance into view
        const statBtn = e.target.closest('.btn-ojt-filter-stat');
        if (statBtn) {
            const val = statBtn.dataset.val;
            _filterStatus = _filterStatus === val ? '' : val;
            _rerenderCompliance();
            document.getElementById('ojt-compliance-inner')?.closest('.card, .ds-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        // Manage departments
        if (e.target.closest('.btn-ojt-manage-depts')) { openDeptSelectorModal(); return; }

        // Edit standard
        if (e.target.closest('.btn-ojt-edit-std')) { openStandardModal(); return; }

        // Upload doc
        if (e.target.closest('.btn-ojt-upload')) { openUploadDocModal(); return; }

        // Delete doc
        const deleteDocBtn = e.target.closest('.btn-ojt-delete-doc');
        if (deleteDocBtn) {
            await deleteDoc(parseInt(deleteDocBtn.dataset.id), deleteDocBtn.dataset.title);
            return;
        }

        // Edit OJT record
        const editRecordBtn = e.target.closest('.btn-ojt-edit-record');
        if (editRecordBtn) {
            const dept   = editRecordBtn.dataset.dept;
            const record = _records.find(r => r.Department === dept) || null;
            openRecordModal(dept, record);
            return;
        }

        // Delete OJT record
        const deleteRecordBtn = e.target.closest('.btn-ojt-delete-record');
        if (deleteRecordBtn) {
            await deleteRecord(parseInt(deleteRecordBtn.dataset.id), deleteRecordBtn.dataset.dept);
            return;
        }

        // View history
        const histBtn = e.target.closest('.btn-ojt-view-history');
        if (histBtn) { await openHistoryModal(histBtn.dataset.dept); return; }

        // Clear filter
        if (e.target.closest('.btn-ojt-clear-filter')) {
            _filterStatus = '';
            _searchQ      = '';
            _filterYear   = '';
            _rerenderCompliance();
            return;
        }
    });

    document.addEventListener('change', (e) => {
        if (!e.target.closest('#ojt-page')) return;
        if (e.target.id === 'ojt-status') {
            _filterStatus = e.target.value;
            _rerenderCompliance();
        }
        if (e.target.id === 'ojt-year') {
            _filterYear = e.target.value;
            _rerenderCompliance();
        }
    });

    document.addEventListener('input', _debounce((e) => {
        if (!e.target.closest('#ojt-page')) return;
        if (e.target.id === 'ojt-search') {
            _searchQ = e.target.value;
            _rerenderCompliance();
        }
    }, 300));
}

// ─────────────────────────────────────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────────────────────────────────────

function openStandardModal() {
    const items = _getScwItems();
    const fields = [0, 1, 2].map(i => {
        const item = items[i] || SCW_DEFAULTS[i];
        return `
        <div class="rounded-xl p-4 border border-${SCW_COLORS[i]}-100 bg-${SCW_COLORS[i]}-50/40 space-y-2">
            <div class="flex items-center gap-2 mb-1">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style="background:${SCW_GRADIENTS[i]}">
                    <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">${SCW_ICONS[i].match(/path[^>]*>[^<]*/)?.[0]?.replace(/^path/, '<path') || ''}</svg>
                </div>
                <span class="text-xs font-bold text-${SCW_COLORS[i]}-700">${['STOP', 'CALL', 'WAIT'][i]}</span>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">หัวข้อ</label>
                <input name="title_${i}" type="text" value="${_esc(item.title)}" required class="form-input w-full text-sm">
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">คำอธิบาย</label>
                <textarea name="text_${i}" rows="2" required class="form-textarea w-full text-sm">${_esc(item.text)}</textarea>
            </div>
        </div>`;
    }).join('');

    openModal('แก้ไขมาตรฐาน Stop-Call-Wait', `
        <form id="scw-standard-form" class="space-y-4">
            ${fields}
            <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
                <button type="submit" class="btn btn-primary px-5">บันทึก</button>
            </div>
        </form>`, 'max-w-xl');

    setTimeout(() => {
        document.getElementById('scw-standard-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const f    = e.target;
            const html = [0, 1, 2].map(i =>
                `<h3>${f.querySelector(`[name=title_${i}]`).value.trim()}</h3><p>${f.querySelector(`[name=text_${i}]`).value.trim()}</p>`
            ).join('\n');

            const btn = f.querySelector('[type=submit]');
            btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
            showLoading('กำลังบันทึก...');
            try {
                await API.put('/ojt/standard', { Content: html });
                closeModal();
                showToast('บันทึกมาตรฐาน SCW สำเร็จ', 'success');
                await refreshData();
            } catch (err) {
                showError(err);
                btn.disabled = false; btn.textContent = 'บันทึก';
            } finally { hideLoading(); }
        });
    }, 50);
}

function openUploadDocModal() {
    openModal('อัปโหลดเอกสาร SCW', `
        <form id="scw-doc-form" class="space-y-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อเอกสาร <span class="text-red-500">*</span></label>
                <input name="Title" type="text" required placeholder="เช่น คู่มือ Stop Call Wait ฉบับปรับปรุง" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ไฟล์ <span class="text-red-500">*</span></label>
                <input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                    class="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100">
                <p class="text-xs text-slate-400 mt-1">PDF, Word, Excel, PowerPoint, รูปภาพ (สูงสุด 20 MB)</p>
            </div>
            <div id="scw-doc-progress" class="hidden">
                <div class="flex items-center gap-2 text-xs text-slate-500">
                    <div class="animate-spin rounded-full h-4 w-4 border-2 border-emerald-500 border-t-transparent"></div>
                    กำลังอัปโหลด...
                </div>
            </div>
            <div id="scw-doc-error" class="text-sm text-red-500 hidden"></div>
            <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
                <button type="submit" id="scw-doc-submit" class="btn btn-primary px-5">อัปโหลด</button>
            </div>
        </form>`);

    setTimeout(() => {
        document.getElementById('scw-doc-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const form  = e.target;
            const title = form.querySelector('[name=Title]').value.trim();
            const file  = form.querySelector('[name=file]').files?.[0];
            if (!file) return;

            const errEl  = document.getElementById('scw-doc-error');
            const prog   = document.getElementById('scw-doc-progress');
            const submit = document.getElementById('scw-doc-submit');
            errEl.classList.add('hidden');
            prog.classList.remove('hidden');
            submit.disabled = true;

            try {
                const fd = new FormData();
                fd.append('document', file);
                const uploadData = await API.post('/upload/document', fd);
                if (!uploadData.url && !uploadData.secure_url) throw new Error(uploadData.message || 'อัปโหลดไฟล์ไม่สำเร็จ');

                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                await API.post('/ojt/documents', {
                    Title:      title,
                    FileURL:    uploadData.secure_url || uploadData.url,
                    FileType:   ext,
                    FileSizeKB: Math.round(file.size / 1024),
                });

                closeModal();
                showToast('อัปโหลดเอกสาร SCW สำเร็จ', 'success');
                await refreshData();
            } catch (err) {
                prog.classList.add('hidden');
                submit.disabled = false;
                errEl.textContent = err.message || 'เกิดข้อผิดพลาด';
                errEl.classList.remove('hidden');
            }
        });
    }, 50);
}

async function deleteDoc(id, title) {
    const confirmed = await showConfirmationModal('ลบเอกสาร', `ต้องการลบเอกสาร "${title}" ใช่หรือไม่?`);
    if (!confirmed) return;
    showLoading('กำลังลบ...');
    try {
        await API.delete(`/ojt/documents/${id}`);
        showToast('ลบเอกสารสำเร็จ', 'success');
        await refreshData();
    } catch (err) { showError(err); }
    finally { hideLoading(); }
}

function openRecordModal(department, record = null) {
    const today    = new Date().toISOString().split('T')[0];
    const ojtDate  = record?.OJTDate ? record.OJTDate.split('T')[0] : today;
    const interval = record?.ReviewIntervalMonths || 12;

    openModal(record?.id ? `อัปเดต OJT — ${department}` : `บันทึก OJT — ${department}`, `
        <form id="ojt-record-form" class="space-y-4">
            <input type="hidden" name="Department" value="${_esc(department)}">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่ OJT <span class="text-red-500">*</span></label>
                    <input name="OJTDate" type="date" required value="${ojtDate}" class="form-input w-full">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">รอบการทบทวน (เดือน)</label>
                    <select name="ReviewIntervalMonths" class="form-input w-full">
                        <option value="6"  ${interval == 6  ? 'selected' : ''}>6 เดือน</option>
                        <option value="12" ${interval == 12 ? 'selected' : ''}>12 เดือน</option>
                        <option value="24" ${interval == 24 ? 'selected' : ''}>24 เดือน</option>
                    </select>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">วิทยากร</label>
                    <input name="TrainerName" type="text" value="${_esc(record?.TrainerName || '')}" placeholder="ชื่อวิทยากร" class="form-input w-full">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">จำนวนผู้เข้าร่วม</label>
                    <input name="AttendeeCount" type="number" min="0" value="${record?.AttendeeCount || 0}" class="form-input w-full">
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เป้าหมายผู้เข้าร่วม (คน/ปี)</label>
                <input name="YearlyTarget" type="number" min="0"
                    value="${record?.YearlyTarget ?? ''}"
                    placeholder="เว้นว่างหากไม่มีเป้าหมาย"
                    class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
                <textarea name="Notes" rows="2" class="form-textarea w-full" placeholder="รายละเอียดเพิ่มเติม...">${_esc(record?.Notes || '')}</textarea>
            </div>
            <div id="ojt-record-error" class="text-sm text-red-500 hidden"></div>
            <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
                <button type="submit" class="btn btn-primary px-5">${record?.id ? 'อัปเดต' : 'บันทึก'}</button>
            </div>
        </form>`, 'max-w-lg');

    setTimeout(() => {
        document.getElementById('ojt-record-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const f    = e.target;
            const targetVal = f.querySelector('[name=YearlyTarget]').value.trim();
            const body = {
                Department:           f.querySelector('[name=Department]').value,
                OJTDate:              f.querySelector('[name=OJTDate]').value,
                ReviewIntervalMonths: parseInt(f.querySelector('[name=ReviewIntervalMonths]').value) || 12,
                TrainerName:          f.querySelector('[name=TrainerName]').value.trim(),
                AttendeeCount:        parseInt(f.querySelector('[name=AttendeeCount]').value) || 0,
                Notes:                f.querySelector('[name=Notes]').value.trim(),
                YearlyTarget:         targetVal !== '' ? parseInt(targetVal) || null : null,
            };

            const btn   = f.querySelector('[type=submit]');
            const errEl = document.getElementById('ojt-record-error');
            btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
            errEl.classList.add('hidden');
            showLoading('กำลังบันทึก...');
            try {
                await API.post('/ojt/records', body);
                closeModal();
                showToast('บันทึก OJT สำเร็จ', 'success');
                await refreshData();
            } catch (err) {
                showError(err);
                btn.disabled = false; btn.textContent = record?.id ? 'อัปเดต' : 'บันทึก';
                errEl.textContent = err.message || 'เกิดข้อผิดพลาด';
                errEl.classList.remove('hidden');
            } finally { hideLoading(); }
        });
    }, 50);
}

async function deleteRecord(id, department) {
    const confirmed = await showConfirmationModal('ลบข้อมูล OJT', `ต้องการลบข้อมูล OJT แผนก "${department}" ใช่หรือไม่?`);
    if (!confirmed) return;
    showLoading('กำลังลบ...');
    try {
        await API.delete(`/ojt/records/${id}`);
        showToast('ลบข้อมูล OJT สำเร็จ', 'success');
        await refreshData();
    } catch (err) { showError(err); }
    finally { hideLoading(); }
}

async function openHistoryModal(department) {
    openModal(`ประวัติ OJT — ${_esc(department)}`, `
        <div class="flex flex-col items-center justify-center py-12 text-slate-400">
            <div class="animate-spin rounded-full h-9 w-9 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <p class="text-sm">กำลังโหลด...</p>
        </div>`, 'max-w-2xl');

    try {
        const res     = await API.get(`/ojt/history/${encodeURIComponent(department)}`);
        const history = normalizeApiArray(res?.data ?? res);

        const bodyEl = document.getElementById('modal-body');
        if (!bodyEl) return;

        if (history.length === 0) {
            bodyEl.innerHTML = `<p class="text-center text-slate-400 py-10">ไม่พบประวัติ OJT ของแผนก ${_esc(department)}</p>`;
            return;
        }

        const latest = history[0] || null;
        const statusKey = _calcStatus(latest?.NextReviewDate);
        const statusMeta = STATUS_META[statusKey] || STATUS_META['no-data'];
        const totalAttendees = history.reduce((sum, h) => sum + (parseInt(h.AttendeeCount) || 0), 0);
        const latestInterval = latest?.ReviewIntervalMonths || '-';

        bodyEl.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Status</p>
                    <p class="mt-1 text-sm font-bold ${statusMeta.text}">${_esc(statusMeta.label)}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Latest OJT</p>
                    <p class="mt-1 text-sm font-bold text-slate-700">${_fmtDate(latest?.OJTDate)}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Next Review</p>
                    <p class="mt-1 text-sm font-bold ${statusKey === 'overdue' ? 'text-red-600' : statusKey === 'due-soon' ? 'text-amber-600' : 'text-slate-700'}">${_fmtDate(latest?.NextReviewDate)}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Attendees</p>
                    <p class="mt-1 text-sm font-bold text-slate-700">${totalAttendees.toLocaleString()} / ${latestInterval} mo</p>
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="ds-table text-sm">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="text-left px-3 py-2 text-xs font-semibold text-slate-600">วันที่ OJT</th>
                            <th class="text-left px-3 py-2 text-xs font-semibold text-slate-600">วันครบกำหนด</th>
                            <th class="text-left px-3 py-2 text-xs font-semibold text-slate-600">วิทยากร</th>
                            <th class="text-left px-3 py-2 text-xs font-semibold text-slate-600">ผู้เข้าร่วม</th>
                            <th class="text-left px-3 py-2 text-xs font-semibold text-slate-600">บันทึกโดย</th>
                            <th class="text-left px-3 py-2 text-xs font-semibold text-slate-600">เมื่อ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-50">
                        ${history.map(h => `
                        <tr class="hover:bg-slate-50">
                            <td class="px-3 py-2 text-slate-700">${_fmtDate(h.OJTDate)}</td>
                            <td class="px-3 py-2 text-slate-700">${_fmtDate(h.NextReviewDate)}</td>
                            <td class="px-3 py-2 text-slate-600">${_esc(h.TrainerName || '—')}</td>
                            <td class="px-3 py-2 text-slate-600">${h.AttendeeCount > 0 ? h.AttendeeCount + ' คน' : '—'}</td>
                            <td class="px-3 py-2 text-slate-600">${_esc(h.RecordedBy || '—')}</td>
                            <td class="px-3 py-2 text-slate-500 text-xs">${_fmtDate(h.RecordedAt)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (err) {
        closeModal();
        showToast('ไม่สามารถโหลดประวัติได้', 'error');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPARTMENT VISIBILITY
// ─────────────────────────────────────────────────────────────────────────────
function _loadHiddenDepts() {
    try {
        const stored = localStorage.getItem(HIDDEN_DEPTS_KEY);
        _hiddenDepts = new Set(stored ? JSON.parse(stored) : []);
    } catch { _hiddenDepts = new Set(); }
}

function _saveHiddenDepts() {
    localStorage.setItem(HIDDEN_DEPTS_KEY, JSON.stringify([..._hiddenDepts]));
}

function openDeptSelectorModal() {
    // Use master dept list; fallback to names from records if master fetch failed
    const allDepts = _allDepts.length > 0
        ? _allDepts
        : _records.map(r => r.Department).sort((a, b) => a.localeCompare(b, 'th'));
    const items = allDepts.map(d => `
        <label class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" class="ojt-dept-cb rounded border-slate-300 text-emerald-600" value="${_esc(d)}" ${!_hiddenDepts.has(d) ? 'checked' : ''}>
            <span class="text-sm text-slate-700">${_esc(d)}</span>
        </label>`).join('');

    openModal('จัดการแผนกที่แสดง', `
        <div>
            <div class="flex items-center gap-3 pb-3 mb-1 border-b border-slate-100">
                <button id="ojt-sel-all" class="text-xs font-semibold text-emerald-600 hover:underline">เลือกทั้งหมด</button>
                <span class="text-slate-300 text-xs">|</span>
                <button id="ojt-sel-none" class="text-xs font-semibold text-slate-500 hover:underline">ยกเลิกทั้งหมด</button>
                <span id="ojt-dept-sel-count" class="ml-auto text-xs text-slate-400">${allDepts.length - _hiddenDepts.size} / ${allDepts.length} แผนก</span>
            </div>
            <div class="max-h-72 overflow-y-auto -mx-1 px-1 space-y-0.5">
                ${items}
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-3">
                <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
                <button id="ojt-dept-save" class="btn btn-primary px-5">บันทึก</button>
            </div>
        </div>`, 'max-w-sm');

    setTimeout(() => {
        const countEl = document.getElementById('ojt-dept-sel-count');
        const updateCount = () => {
            const n = document.querySelectorAll('.ojt-dept-cb:checked').length;
            if (countEl) countEl.textContent = `${n} / ${allDepts.length} แผนก`;
        };

        document.getElementById('ojt-sel-all')?.addEventListener('click', () => {
            document.querySelectorAll('.ojt-dept-cb').forEach(cb => cb.checked = true);
            updateCount();
        });
        document.getElementById('ojt-sel-none')?.addEventListener('click', () => {
            document.querySelectorAll('.ojt-dept-cb').forEach(cb => cb.checked = false);
            updateCount();
        });
        document.querySelectorAll('.ojt-dept-cb').forEach(cb => cb.addEventListener('change', updateCount));

        document.getElementById('ojt-dept-save')?.addEventListener('click', () => {
            const checked = new Set([...document.querySelectorAll('.ojt-dept-cb:checked')].map(cb => cb.value));
            _hiddenDepts = new Set(allDepts.filter(d => !checked.has(d)));
            _saveHiddenDepts();
            closeModal();
            renderAll();         // rebuilds all sections (updates header subtitle too)
            _loadHeroStats();
        });
    }, 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// TARGET BADGE
// ─────────────────────────────────────────────────────────────────────────────
function _buildTargetBadge(r) {
    const target = r.YearlyTarget ? parseInt(r.YearlyTarget) : 0;
    if (!target) return '<span class="text-slate-400 text-sm">—</span>';

    const actual = parseInt(r.AttendeeCount) || 0;
    if (actual >= target) {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            ${actual}/${target} คน
        </span>`;
    }
    if (actual > 0) {
        const pct = Math.round(actual / target * 100);
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
            ${actual}/${target} คน (${pct}%)
        </span>`;
    }
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">
        0/${target} คน
    </span>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function _calcStatus(nextReviewDate) {
    if (!nextReviewDate) return 'no-data';
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const review = new Date(nextReviewDate);
    const diff   = Math.ceil((review - today) / 86400000);
    if (diff < 0)   return 'overdue';
    if (diff <= 30) return 'due-soon';
    return 'valid';
}

function _getScwItems() {
    if (_standard?.Content?.trim()) {
        const div = document.createElement('div');
        div.innerHTML = _standard.Content;
        const result = [];
        div.querySelectorAll('h3').forEach(h3 => {
            const p = h3.nextElementSibling;
            result.push({ title: h3.textContent.trim(), text: p?.textContent?.trim() || '' });
        });
        if (result.length) return result;
    }
    return SCW_DEFAULTS;
}

function _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmtDate(d) {
    return d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
}

function _debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
