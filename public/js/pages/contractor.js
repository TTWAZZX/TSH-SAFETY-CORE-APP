// public/js/pages/contractor.js
import { API } from '../api.js';
import {
    hideLoading, showError, showLoading,
    openModal, closeModal, showToast, showConfirmationModal, showDocumentModal
} from '../ui.js';
import { normalizeApiArray } from '../utils/normalize.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const EXTERNAL_SYSTEMS = [
    {
        id: 'contractor-online',
        title: 'Contractor Online',
        description: 'ระบบจัดการและติดตามงานผู้รับเหมา ใช้สำหรับลงทะเบียน ตรวจสอบสถานะ และบริหารงานผู้รับเหมาภายในบริษัท',
        url: 'https://dev.tshpcl.com/contractor/login.php',
        icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                   d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
               </svg>`,
        color: '#0284c7',
        colorLight: '#e0f2fe',
    },
    {
        id: 'epass',
        title: 'Supplier E-Pass',
        description: 'ระบบบัตรผ่านอิเล็กทรอนิกส์สำหรับ Supplier และบุคคลภายนอก ใช้สำหรับขอบัตรผ่านเข้าออกบริเวณบริษัท',
        url: 'https://dev.tshpcl.com/epass/login.php',
        icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                   d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"/>
               </svg>`,
        color: '#7c3aed',
        colorLight: '#f3e8ff',
    },
];

const CATEGORIES = ['all', 'Contractor Policy', 'Work Permit', 'Safety Procedure', 'Training', 'Forms'];
const CATEGORY_LABELS = {
    all: 'ทั้งหมด',
    'Contractor Policy': 'Contractor Policy',
    'Work Permit': 'Work Permit',
    'Safety Procedure': 'Safety Procedure',
    'Training': 'Training',
    'Forms': 'Forms',
};
const CATEGORY_COLORS = {
    'Contractor Policy': 'bg-blue-100 text-blue-700',
    'Work Permit': 'bg-amber-100 text-amber-700',
    'Safety Procedure': 'bg-red-100 text-red-700',
    'Training': 'bg-emerald-100 text-emerald-700',
    'Forms': 'bg-purple-100 text-purple-700',
    'ทั่วไป': 'bg-slate-100 text-slate-600',
};

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _allDocs = [];
let _activeCategory = 'all';
let _searchQuery = '';
let _listenersReady = false;
let _statsCache = { total: 0, policy: 0, permit: 0 };

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadContractorPage() {
    const container = document.getElementById('contractor-page');
    if (!container) return;

    window.closeModal = closeModal;

    const currentUser = TSHSession.getUser() || {};
    const isAdmin = currentUser.role === 'Admin' || currentUser.Role === 'Admin';

    container.innerHTML = buildPageShell(isAdmin);

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    await fetchDocuments();
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML BUILDERS
// ─────────────────────────────────────────────────────────────────────────────
function buildPageShell(isAdmin) {
    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- Hero Header -->
        <div class="relative overflow-hidden rounded-2xl"
             style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <!-- dot pattern -->
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%">
                    <defs><pattern id="con-dots" width="24" height="24" patternUnits="userSpaceOnUse">
                        <circle cx="12" cy="12" r="1.3" fill="white"/>
                    </pattern></defs>
                    <rect width="100%" height="100%" fill="url(#con-dots)"/>
                </svg>
            </div>
            <!-- glow orb -->
            <div class="absolute -top-16 -right-16 w-64 h-64 rounded-full pointer-events-none"
                 style="background:radial-gradient(circle,rgba(251,191,36,0.15) 0%,transparent 70%)"></div>
            <div class="relative z-10 p-6">
                <!-- Title row -->
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                             style="background:rgba(255,255,255,0.15);backdrop-filter:blur(8px)">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                            </svg>
                        </div>
                        <div>
                            <h1 class="text-2xl font-bold text-white leading-tight">Contractor Control</h1>
                            <p class="text-sm text-white/70 mt-0.5">ระบบและเอกสารสำหรับผู้รับเหมา · Thai Summit Harness Co., Ltd.</p>
                        </div>
                    </div>
                    ${isAdmin ? `
                    <button id="btn-upload-doc"
                            class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-shrink-0"
                            style="background:rgba(255,255,255,0.15);backdrop-filter:blur(8px);color:#fff;border:1px solid rgba(255,255,255,0.25)"
                            onmouseover="this.style.background='rgba(255,255,255,0.25)'"
                            onmouseout="this.style.background='rgba(255,255,255,0.15)'">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                        </svg>
                        อัปโหลดเอกสาร
                    </button>` : ''}
                </div>
                <!-- Stats strip -->
                <div id="contractor-hero-stats" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    ${[0,1,2,3].map(() => `
                    <div class="rounded-xl px-4 py-3 text-center animate-pulse" style="background:rgba(255,255,255,0.10)">
                        <div class="h-6 w-10 rounded bg-white/20 mx-auto mb-1"></div>
                        <div class="h-3 w-16 rounded bg-white/15 mx-auto"></div>
                    </div>`).join('')}
                </div>
            </div>
        </div>

        <!-- External Systems -->
        <div>
            <div class="flex items-center gap-2 mb-3">
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
                <h2 class="text-sm font-bold text-slate-500 uppercase tracking-wider">ระบบภายนอก</h2>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                ${EXTERNAL_SYSTEMS.map(sys => buildSystemCard(sys)).join('')}
            </div>
        </div>

        <!-- Documents Section -->
        <div>
            <div class="flex items-center gap-2 mb-3">
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <h2 class="text-sm font-bold text-slate-500 uppercase tracking-wider">เอกสาร Contractor</h2>
            </div>

            <!-- Filters Row -->
            <div class="card p-4 mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <!-- Category Tabs -->
                <div id="cat-tabs" class="flex flex-wrap gap-1.5">
                    ${CATEGORIES.map(cat => `
                    <button data-cat="${cat}"
                            class="cat-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
                                   ${cat === _activeCategory
                                     ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                     : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-600'}">
                        ${CATEGORY_LABELS[cat] || cat}
                    </button>`).join('')}
                </div>
                <!-- Search -->
                <div class="relative w-full sm:w-64">
                    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input id="doc-search" type="text" placeholder="ค้นหาเอกสาร..."
                           value="${_searchQuery}"
                           class="form-input w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-amber-400">
                </div>
            </div>

            <!-- Document Grid -->
            <div id="doc-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div class="col-span-full flex items-center justify-center py-16 text-slate-400">
                    <div class="text-center">
                        <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-amber-400 border-t-transparent mb-3"></div>
                        <p class="text-sm">กำลังโหลดข้อมูล...</p>
                    </div>
                </div>
            </div>
        </div>

    </div>`;
}

function buildSystemCard(sys) {
    return `
    <div class="card overflow-hidden hover:shadow-lg transition-all group">
        <div class="h-1.5 w-full" style="background: linear-gradient(90deg, ${sys.color}, ${sys.color}cc)"></div>
        <div class="p-5 flex items-start gap-4">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                 style="background: ${sys.colorLight}; color: ${sys.color}">
                ${sys.icon}
            </div>
            <div class="flex-1 min-w-0">
                <h3 class="font-bold text-slate-800 text-base leading-tight mb-1">${sys.title}</h3>
                <p class="text-xs text-slate-500 leading-relaxed mb-4">${sys.description}</p>
                <a href="${sys.url}" target="_blank" rel="noopener noreferrer"
                   class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                   style="background: linear-gradient(135deg, ${sys.color}, ${sys.color}cc); box-shadow: 0 2px 8px ${sys.color}40;"
                   onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px ${sys.color}60'"
                   onmouseout="this.style.transform=''; this.style.boxShadow='0 2px 8px ${sys.color}40'">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                    เปิดระบบ
                </a>
            </div>
        </div>
    </div>`;
}

function buildDocCard(doc, isAdmin) {
    const catColor = CATEGORY_COLORS[doc.Category] || CATEGORY_COLORS['ทั่วไป'];
    const ext = (doc.FileType || 'pdf').toLowerCase();
    const isPdf = ext === 'pdf';
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    const uploadDate = doc.UploadedAt
        ? new Date(doc.UploadedAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
        : '-';

    const fileIconColor = isPdf ? '#dc2626' : isImage ? '#0284c7' : '#7c3aed';
    const fileIconBg = isPdf ? '#fef2f2' : isImage ? '#e0f2fe' : '#f3e8ff';

    return `
    <div class="card overflow-hidden hover:shadow-md transition-all group flex flex-col">
        <div class="p-5 flex-1 flex flex-col gap-3">
            <div class="flex items-start gap-3">
                <!-- File icon -->
                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                     style="background: ${fileIconBg}; color: ${fileIconColor}">
                    ${getFileIcon(ext)}
                </div>
                <div class="flex-1 min-w-0">
                    <span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold mb-1 ${catColor}">
                        ${doc.Category || 'ทั่วไป'}
                    </span>
                    <h4 class="font-semibold text-slate-800 text-sm leading-snug line-clamp-2">${doc.Title}</h4>
                </div>
                ${isAdmin ? `
                <button class="btn-delete-doc flex-shrink-0 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        data-id="${doc.id}" data-title="${doc.Title}" title="ลบเอกสาร">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>` : ''}
            </div>

            <!-- Meta -->
            <div class="text-xs text-slate-400 flex items-center gap-3 mt-auto">
                <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    ${uploadDate}
                </span>
                <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                    ${doc.UploadedBy || '-'}
                </span>
            </div>
        </div>

        <!-- Action bar -->
        <div class="border-t border-slate-100 flex">
            ${(isPdf || isImage) ? `
            <button class="btn-preview-doc flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    data-url="${doc.FileUrl}" data-title="${doc.Title}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                ดูเอกสาร
            </button>
            <div class="w-px bg-slate-100"></div>` : ''}
            <a href="${doc.FileUrl}" download target="_blank" rel="noopener noreferrer"
               class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                ดาวน์โหลด
            </a>
        </div>
    </div>`;
}

function getFileIcon(ext) {
    if (ext === 'pdf') {
        return `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 2h10l5 5v15a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1h4zm9 1.5V8h4.5L16 3.5zM8.5 12a2 2 0 000 4h1v1h1v-1h1a2 2 0 000-4h-3zM9 13h3a1 1 0 010 2H9a1 1 0 010-2z"/>
        </svg>`;
    }
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        return `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>`;
    }
    if (['doc', 'docx'].includes(ext)) {
        return `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 2h10l5 5v15a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1h4zm9 1.5V8h4.5L16 3.5zM8 11h8v1H8v-1zm0 3h8v1H8v-1zm0 3h5v1H8v-1z"/>
        </svg>`;
    }
    if (['xls', 'xlsx'].includes(ext)) {
        return `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 2h10l5 5v15a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1h4zm9 1.5V8h4.5L16 3.5zM9 12l1.5 2.5L9 17h1.5l.75-1.5.75 1.5H13.5l-1.5-2.5L13.5 12H12l-.75 1.5L10.5 12H9z"/>
        </svg>`;
    }
    return `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
    </svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO STATS
// ─────────────────────────────────────────────────────────────────────────────
function _renderHeroStats() {
    const wrap = document.getElementById('contractor-hero-stats');
    if (!wrap) return;

    // Update cache when fetching full list
    if (_activeCategory === 'all' && !_searchQuery.trim()) {
        _statsCache.total  = _allDocs.length;
        _statsCache.policy = _allDocs.filter(d => d.Category === 'Contractor Policy').length;
        _statsCache.permit = _allDocs.filter(d => d.Category === 'Work Permit').length;
    }

    const stats = [
        { value: _statsCache.total,  label: 'เอกสารทั้งหมด',     icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>` },
        { value: _statsCache.policy, label: 'Contractor Policy', icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>` },
        { value: _statsCache.permit, label: 'Work Permit',        icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>` },
        { value: EXTERNAL_SYSTEMS.length, label: 'ระบบภายนอก',   icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>` },
    ];

    wrap.innerHTML = stats.map(s => `
        <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12)">
            <div class="flex items-center justify-center gap-1.5 mb-0.5 text-white/70">${s.icon}</div>
            <p class="text-2xl font-bold text-white leading-none">${s.value}</p>
            <p class="text-xs text-white/70 mt-0.5">${s.label}</p>
        </div>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────
async function fetchDocuments() {
    try {
        const params = new URLSearchParams();
        if (_activeCategory !== 'all') params.set('category', _activeCategory);
        if (_searchQuery.trim()) params.set('q', _searchQuery.trim());

        const res = await API.get(`/contractor/documents?${params.toString()}`);
        _allDocs = normalizeApiArray(res?.data ?? res);
        _renderHeroStats();
        renderDocGrid();
    } catch (error) {
        console.error('Contractor docs error:', error);
        const grid = document.getElementById('doc-grid');
        if (grid) grid.innerHTML = `
            <div class="col-span-full text-center py-16 text-slate-400">
                <div class="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                </div>
                <p class="font-semibold text-slate-600">โหลดข้อมูลไม่สำเร็จ</p>
                <p class="text-sm mt-1">ไม่สามารถโหลดรายการเอกสารได้</p>
            </div>`;
    }
}

function renderDocGrid() {
    const grid = document.getElementById('doc-grid');
    if (!grid) return;

    const currentUser = TSHSession.getUser() || {};
    const isAdmin = currentUser.role === 'Admin' || currentUser.Role === 'Admin';

    if (!_allDocs.length) {
        grid.innerHTML = `
            <div class="col-span-full card p-12 text-center">
                <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                </div>
                <p class="text-slate-500 font-medium">ยังไม่มีเอกสาร</p>
                <p class="text-slate-400 text-sm mt-1">${isAdmin ? 'กดปุ่ม "อัปโหลดเอกสาร" เพื่อเริ่มต้น' : 'ยังไม่มีเอกสารในหมวดหมู่นี้'}</p>
            </div>`;
        return;
    }

    grid.innerHTML = _allDocs.map(doc => buildDocCard(doc, isAdmin)).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', async (e) => {
        if (!e.target.closest('#contractor-page')) return;

        // Upload button
        if (e.target.closest('#btn-upload-doc')) {
            showUploadForm();
            return;
        }

        // Category tab
        const catBtn = e.target.closest('.cat-tab');
        if (catBtn) {
            _activeCategory = catBtn.dataset.cat || 'all';
            // Re-render tabs
            document.querySelectorAll('.cat-tab').forEach(btn => {
                const active = btn.dataset.cat === _activeCategory;
                btn.className = `cat-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    active
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-600'
                }`;
            });
            await fetchDocuments();
            return;
        }

        // Preview button
        const previewBtn = e.target.closest('.btn-preview-doc');
        if (previewBtn) {
            showDocumentModal(previewBtn.dataset.url, previewBtn.dataset.title);
            return;
        }

        // Delete button
        const deleteBtn = e.target.closest('.btn-delete-doc');
        if (deleteBtn) {
            const confirmed = await showConfirmationModal(
                'ยืนยันการลบ',
                `ต้องการลบเอกสาร "${deleteBtn.dataset.title}" ใช่หรือไม่?`
            );
            if (confirmed) {
                await deleteDocument(deleteBtn.dataset.id);
            }
            return;
        }
    });

    // Search debounce
    document.addEventListener('input', debounce(async (e) => {
        if (!e.target.matches('#doc-search')) return;
        _searchQuery = e.target.value;
        await fetchDocuments();
    }, 350));
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD FORM
// ─────────────────────────────────────────────────────────────────────────────
function showUploadForm() {
    const UPLOAD_CATEGORIES = ['Contractor Policy', 'Work Permit', 'Safety Procedure', 'Training', 'Forms', 'ทั่วไป'];

    const html = `
        <form id="contractor-upload-form" class="space-y-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    ชื่อเอกสาร <span class="text-red-500">*</span>
                </label>
                <input type="text" name="Title" class="form-input w-full" required
                       placeholder="เช่น ระเบียบปฏิบัติสำหรับผู้รับเหมา 2568">
            </div>

            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมวดหมู่</label>
                <select name="Category" class="form-input w-full">
                    ${UPLOAD_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
            </div>

            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    ไฟล์เอกสาร <span class="text-red-500">*</span>
                </label>
                <div id="drop-zone"
                     class="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-all">
                    <svg class="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                    </svg>
                    <p class="text-sm text-slate-500 mb-1">คลิกหรือลากไฟล์มาวาง</p>
                    <p class="text-xs text-slate-400">รองรับ PDF, Word, Excel, รูปภาพ · ขนาดสูงสุด 20 MB</p>
                    <input type="file" id="upload-file-input" name="file" class="hidden"
                           accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp">
                </div>
                <div id="file-preview" class="hidden mt-2 flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                    <svg class="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <span id="file-name" class="text-sm text-slate-700 truncate flex-1"></span>
                    <button type="button" id="btn-clear-file" class="text-slate-400 hover:text-red-500 flex-shrink-0">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4"
                        onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
                <button type="submit" id="submit-upload-btn" class="btn btn-primary px-5">อัปโหลด</button>
            </div>
        </form>`;

    openModal('อัปโหลดเอกสาร Contractor', html, 'max-w-lg');

    // File input handlers
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('upload-file-input');
    const filePreview = document.getElementById('file-preview');
    const fileName = document.getElementById('file-name');
    const clearBtn = document.getElementById('btn-clear-file');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('border-amber-400', 'bg-amber-50'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-amber-400', 'bg-amber-50'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('border-amber-400', 'bg-amber-50');
        if (e.dataTransfer.files[0]) {
            fileInput.files = e.dataTransfer.files;
            showFilePreview(e.dataTransfer.files[0].name);
        }
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) showFilePreview(fileInput.files[0].name);
    });
    clearBtn.addEventListener('click', () => {
        fileInput.value = '';
        filePreview.classList.add('hidden');
        dropZone.classList.remove('hidden');
    });

    function showFilePreview(name) {
        fileName.textContent = name;
        filePreview.classList.remove('hidden');
        dropZone.classList.add('hidden');
    }

    // Submit
    document.getElementById('contractor-upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitBtn = document.getElementById('submit-upload-btn');

        const fileEl = document.getElementById('upload-file-input');
        if (!fileEl.files || fileEl.files.length === 0) {
            showToast('กรุณาเลือกไฟล์ที่ต้องการอัปโหลด', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> กำลังอัปโหลด...`;

        try {
            showLoading('กำลังอัปโหลดเอกสาร...');
            const formData = new FormData(form);
            await API.post('/contractor/documents', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            closeModal();
            showToast('อัปโหลดเอกสารสำเร็จ', 'success');
            await fetchDocuments();
        } catch (error) {
            showError(error);
        } finally {
            hideLoading();
            submitBtn.disabled = false;
            submitBtn.textContent = 'อัปโหลด';
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────
async function deleteDocument(id) {
    showLoading('กำลังลบเอกสาร...');
    try {
        await API.delete(`/contractor/documents/${id}`);
        showToast('ลบเอกสารสำเร็จ', 'success');
        await fetchDocuments();
    } catch (error) {
        showError(error);
    } finally {
        hideLoading();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
