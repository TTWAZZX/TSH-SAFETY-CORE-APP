// public/js/pages/contractor.js
import { API } from '../api.js';
import {
    openModal, closeModal, showToast,
    showConfirmationModal, showDocumentModal,
    showLoading, hideLoading,
} from '../ui.js';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const EXTERNAL_SYSTEMS = [
    {
        id: 'contractor-online',
        title: 'Contractor Online',
        description: 'ระบบจัดการและติดตามงานผู้รับเหมา ลงทะเบียน ตรวจสอบสถานะ และบริหารงาน',
        url: 'https://dev.tshpcl.com/contractor/login.php',
        color: '#0284c7',
        colorLight: '#e0f2fe',
        icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`,
    },
    {
        id: 'epass',
        title: 'Supplier E-Pass',
        description: 'บัตรผ่านอิเล็กทรอนิกส์สำหรับ Supplier และบุคคลภายนอก เข้า-ออกบริษัท',
        url: 'https://dev.tshpcl.com/epass/login.php',
        color: '#7c3aed',
        colorLight: '#f3e8ff',
        icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"/></svg>`,
    },
];

const CATEGORIES = ['Contractor Policy', 'Work Permit', 'Safety Procedure', 'Training', 'Forms', 'ทั่วไป'];

const CAT_META = {
    all:                  { label: 'ทั้งหมด',           bg: 'bg-slate-100',   text: 'text-slate-600',   dot: '#64748b' },
    'Contractor Policy':  { label: 'Contractor Policy', bg: 'bg-blue-100',    text: 'text-blue-700',    dot: '#0284c7' },
    'Work Permit':        { label: 'Work Permit',        bg: 'bg-amber-100',   text: 'text-amber-700',   dot: '#d97706' },
    'Safety Procedure':   { label: 'Safety Procedure',  bg: 'bg-red-100',     text: 'text-red-700',     dot: '#dc2626' },
    Training:             { label: 'Training',           bg: 'bg-emerald-100', text: 'text-emerald-700', dot: '#059669' },
    Forms:                { label: 'Forms',              bg: 'bg-purple-100',  text: 'text-purple-700',  dot: '#7c3aed' },
    ทั่วไป:               { label: 'ทั่วไป',             bg: 'bg-slate-100',   text: 'text-slate-600',   dot: '#64748b' },
};

const ACTIVITY_META = {
    upload: { label: 'อัปโหลด', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>`,  color: '#059669', bg: '#f0fdf4' },
    edit:   { label: 'แก้ไข',   icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>`, color: '#0284c7', bg: '#eff6ff' },
    delete: { label: 'ลบ',      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>`,  color: '#dc2626', bg: '#fef2f2' },
};

const TABS = [
    { id: 'dashboard', label: 'ภาพรวม',  icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
    { id: 'documents', label: 'เอกสาร',   icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` },
];

const PAGE_SIZE   = 12;
const CACHE_TTL   = 5 * 60 * 1000; // 5 min

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE LAYER  — all API calls isolated here
// ═══════════════════════════════════════════════════════════════════════════════
const ContractorService = {
    async getDocs() {
        const res = await API.get('/contractor/documents');
        return normalizeApiArray(res?.data ?? res);
    },
    async getStats() {
        const res = await API.get('/contractor/documents/stats');
        return normalizeApiObject(res?.data ?? res);
    },
    async getActivity(limit = 20) {
        const res = await API.get(`/contractor/activity?limit=${limit}`);
        return normalizeApiArray(res?.data ?? res);
    },
    async upload(formData) {
        return API.post('/contractor/documents', formData);
    },
    async update(id, data) {
        return API.put(`/contractor/documents/${id}`, data);
    },
    async remove(id) {
        return API.delete(`/contractor/documents/${id}`);
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE  — simple TTL cache keyed by string
// ═══════════════════════════════════════════════════════════════════════════════
const _cache = {
    _store: {},
    get(key) {
        const entry = this._store[key];
        if (!entry || Date.now() - entry.ts > CACHE_TTL) return null;
        return entry.val;
    },
    set(key, val) {
        this._store[key] = { val, ts: Date.now() };
    },
    del(...keys) {
        keys.forEach(k => delete this._store[k]);
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// STATE  — single source of truth
// ═══════════════════════════════════════════════════════════════════════════════
const _state = {
    docs:      [],     // full list from API
    stats:     null,   // { total, byCategory, recentCount }
    activity:  [],     // Contractor_Activity_Log rows
    isAdmin:   false,
    activeTab: 'dashboard',
    page:      1,
    loading:   false,
    error:     null,
    filter: {
        category: 'all',
        query:    '',
        dateFrom: '',
        dateTo:   '',
        sortBy:   'newest',
    },
};

let _listenersReady  = false;
let _loadAllInFlight = false;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN LOADER
// ═══════════════════════════════════════════════════════════════════════════════
export async function loadContractorPage() {
    const container = document.getElementById('contractor-page');
    if (!container) return;

    const user       = TSHSession.getUser() || {};
    _state.isAdmin   = user.role === 'Admin' || user.Role === 'Admin';
    window.closeModal = closeModal;

    container.innerHTML = _buildShell();

    if (!_listenersReady) {
        _setupEventListeners();
        _listenersReady = true;
    }

    _activateTab(_state.activeTab, false);
    await _loadAll();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHELL
// ═══════════════════════════════════════════════════════════════════════════════
function _buildShell() {
    const tabsHtml = TABS.map(t => `
        <button id="con-tab-${t.id}" data-tab="${t.id}"
            class="con-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO ═══ -->
        <div class="relative overflow-hidden rounded-2xl"
             style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="con-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#con-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none"
                 style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                                </svg>
                                Contractor Control
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">ระบบและเอกสารสำหรับผู้รับเหมา</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Contractor Safety Management · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button id="btn-refresh"
                                class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                                style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.25)"
                                onmouseover="this.style.background='rgba(255,255,255,0.22)'"
                                onmouseout="this.style.background='rgba(255,255,255,0.12)'"
                                title="รีเฟรชข้อมูล">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                            รีเฟรช
                        </button>
                        ${_state.isAdmin ? `
                        <button id="btn-upload-doc"
                                class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                                style="background:rgba(255,255,255,0.15);backdrop-filter:blur(8px);color:#fff;border:1px solid rgba(255,255,255,0.3)"
                                onmouseover="this.style.background='rgba(255,255,255,0.25)'"
                                onmouseout="this.style.background='rgba(255,255,255,0.15)'">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                            </svg>
                            อัปโหลดเอกสาร
                        </button>` : ''}
                    </div>
                </div>

                <!-- Stats strip -->
                <div id="con-hero-stats" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    ${_buildStatsSkeleton(4)}
                </div>

                <!-- Tab bar -->
                <div class="flex overflow-x-auto gap-0 -mb-px scrollbar-none">
                    ${tabsHtml}
                </div>
            </div>
        </div>

        <!-- ═══ TAB PANELS ═══ -->
        <div id="con-panel-dashboard" class="hidden"></div>
        <div id="con-panel-documents" class="hidden"></div>

    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB ROUTING
// ═══════════════════════════════════════════════════════════════════════════════
function _activateTab(id, render = true) {
    _state.activeTab = id;

    TABS.forEach(t => {
        const btn    = document.getElementById(`con-tab-${t.id}`);
        const active = t.id === id;
        if (!btn) return;
        btn.className = `con-tab flex items-center gap-1.5 px-4 py-3 text-xs font-${active ? 'bold' : 'semibold'} whitespace-nowrap transition-all border-b-2 ${
            active ? 'border-white text-white' : 'border-transparent text-white/70 hover:text-white hover:border-white/40'
        }`;
    });

    TABS.forEach(t => document.getElementById(`con-panel-${t.id}`)?.classList.add('hidden'));
    document.getElementById(`con-panel-${id}`)?.classList.remove('hidden');

    if (!render) return;
    if (id === 'dashboard') _renderDashboard();
    if (id === 'documents') _renderDocuments();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HERO STATS  — driven by /stats API, not computed locally
// ═══════════════════════════════════════════════════════════════════════════════
function _renderHeroStats() {
    const wrap = document.getElementById('con-hero-stats');
    if (!wrap) return;

    const s = _state.stats;
    const total      = s?.total        ?? _state.docs.length;
    const recent     = s?.recentCount  ?? 0;
    const catCounts  = s?.byCategory   ?? [];
    const policies   = catCounts.find(r => r.Category === 'Contractor Policy')?.cnt  ?? 0;
    const permits    = catCounts.find(r => r.Category === 'Work Permit')?.cnt         ?? 0;

    const items = [
        { value: total,    label: 'เอกสารทั้งหมด',    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` },
        { value: policies, label: 'Contractor Policy', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>`, cat: 'Contractor Policy' },
        { value: permits,  label: 'Work Permit',       icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>`, cat: 'Work Permit' },
        { value: recent,   label: '30 วันล่าสุด',      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
    ];

    wrap.innerHTML = items.map(item => {
        const clickable = item.cat ? `data-filter-cat="${item.cat}" style="cursor:pointer"` : '';
        const hover     = item.cat ? `onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.12)'"` : '';
        return `
        <div class="con-stat-card rounded-xl px-4 py-3 text-center transition-all" ${clickable} ${hover}
             style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
            <div class="flex items-center justify-center mb-0.5" style="color:rgba(167,243,208,0.85)">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${item.icon}</svg>
            </div>
            <p class="text-2xl font-bold text-white leading-none">${item.value}</p>
            <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${item.label}</p>
            ${item.cat ? `<p class="text-[10px] mt-1 text-white/50">คลิกเพื่อกรอง</p>` : ''}
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════════════════════════════════════════
function _renderDashboard() {
    const panel = document.getElementById('con-panel-dashboard');
    if (!panel) return;

    const total     = _state.docs.length;
    const catCounts = CATEGORIES
        .map(cat => ({ cat, count: (_state.stats?.byCategory ?? []).find(r => r.Category === cat)?.cnt ?? _state.docs.filter(d => d.Category === cat).length }))
        .filter(x => x.count > 0);

    const recentDocs = [..._state.docs]
        .sort((a, b) => new Date(b.UploadedAt) - new Date(a.UploadedAt))
        .slice(0, 6);

    panel.innerHTML = `
    <div class="space-y-6">

        <!-- Top row: breakdown + systems -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <!-- Category breakdown -->
            <div class="lg:col-span-2 card p-5">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                        เอกสารตามหมวดหมู่
                    </h3>
                    <span class="text-xs text-slate-400">${total} รายการ</span>
                </div>
                ${total === 0
                    ? _buildEmptyState('emerald', 'ยังไม่มีเอกสาร', _state.isAdmin ? 'กดปุ่ม "อัปโหลดเอกสาร" ด้านบนเพื่อเริ่มต้น' : 'ยังไม่มีเอกสาร Contractor')
                    : `<div class="space-y-3">
                        ${catCounts.map(({ cat, count }) => {
                            const m   = CAT_META[cat] || CAT_META.ทั่วไป;
                            const pct = total > 0 ? Math.round(count / total * 100) : 0;
                            return `
                            <div class="flex items-center gap-3 cursor-pointer group" data-cat-row="${cat}">
                                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${m.bg} ${m.text} w-44 flex-shrink-0 group-hover:ring-2 group-hover:ring-offset-1 transition-all" style="--tw-ring-color:${m.dot}">
                                    <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:${m.dot}"></span>
                                    ${m.label}
                                </span>
                                <div class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${m.dot}"></div>
                                </div>
                                <span class="text-xs font-semibold text-slate-600 w-8 text-right">${count}</span>
                                <svg class="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                            </div>`;
                        }).join('')}
                    </div>`
                }
            </div>

            <!-- External systems -->
            <div class="card p-5 flex flex-col gap-3">
                <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2 flex-shrink-0">
                    <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                    ระบบภายนอก
                </h3>
                ${EXTERNAL_SYSTEMS.map(_buildSystemRow).join('')}
                <p class="text-xs text-slate-400 pt-2 border-t border-slate-100 leading-relaxed">
                    ระบบภายนอกจะเปิดในหน้าต่างใหม่ หากเข้าไม่ได้ โปรดติดต่อผู้ดูแลระบบ
                </p>
            </div>
        </div>

        <!-- Bottom row: recent uploads + activity log -->
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">

            <!-- Recent uploads (3/5) -->
            <div class="lg:col-span-3 card overflow-hidden">
                <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        อัปโหลดล่าสุด
                    </h3>
                    ${total > 0 ? `
                    <button data-tab-link="documents"
                            class="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
                        ดูทั้งหมด →
                    </button>` : ''}
                </div>
                ${recentDocs.length === 0
                    ? `<div class="p-8 text-center text-slate-400 text-sm">ยังไม่มีเอกสาร</div>`
                    : `<div class="divide-y divide-slate-50">${recentDocs.map(_buildRecentRow).join('')}</div>`
                }
            </div>

            <!-- Activity log (2/5) -->
            <div class="lg:col-span-2 card overflow-hidden">
                <div class="px-5 py-4 border-b border-slate-100">
                    <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
                        กิจกรรมล่าสุด
                    </h3>
                </div>
                <div id="con-activity-log" class="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                    ${_buildActivityList()}
                </div>
            </div>
        </div>

    </div>`;
}

function _buildActivityList() {
    if (!_state.activity.length) {
        return `<div class="p-8 text-center text-slate-400 text-sm">ยังไม่มีกิจกรรม</div>`;
    }
    return _state.activity.map(row => {
        const m    = ACTIVITY_META[row.ActionType] || ACTIVITY_META.upload;
        const catM = CAT_META[row.Category] || CAT_META.ทั่วไป;
        const ts   = row.CreatedAt
            ? new Date(row.CreatedAt).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';
        return `
        <div class="flex items-start gap-3 px-5 py-3">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                 style="background:${m.bg};color:${m.color}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${m.icon}</svg>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-slate-700 leading-snug truncate">${_esc(row.DocTitle || '—')}</p>
                <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${catM.bg} ${catM.text}">${catM.label}</span>
                    <span class="text-[10px] text-slate-400">${_esc(row.ActorName || '')}</span>
                </div>
            </div>
            <span class="text-[10px] text-slate-400 flex-shrink-0 mt-1">${ts}</span>
        </div>`;
    }).join('');
}

function _buildSystemRow(sys) {
    return `
    <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
        <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
             style="background:${sys.colorLight};color:${sys.color}">
            ${sys.icon}
        </div>
        <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-slate-700 leading-tight">${sys.title}</p>
            <p class="text-xs text-slate-400 line-clamp-2 leading-relaxed">${sys.description}</p>
        </div>
        <a href="${sys.url}" target="_blank" rel="noopener noreferrer"
           class="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-80"
           style="background:${sys.color}">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            เปิด
        </a>
    </div>`;
}

function _buildRecentRow(doc) {
    const meta = CAT_META[doc.Category] || CAT_META.ทั่วไป;
    const ext  = (doc.FileType || 'pdf').toLowerCase();
    const date = doc.UploadedAt
        ? new Date(doc.UploadedAt).toLocaleDateString('th-TH', { month: 'short', day: 'numeric', year: '2-digit' })
        : '-';
    return `
    <div class="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
             style="background:${_fileIconBg(ext)};color:${_fileIconColor(ext)}">
            ${_fileIcon(ext, 'w-4 h-4')}
        </div>
        <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-slate-700 truncate">${_esc(doc.Title)}</p>
            <p class="text-xs text-slate-400">${date} · ${_esc(doc.UploadedBy || '-')}</p>
        </div>
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${meta.bg} ${meta.text} flex-shrink-0">
            ${meta.label}
        </span>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENTS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function _renderDocuments() {
    const panel = document.getElementById('con-panel-documents');
    if (!panel) return;
    panel.innerHTML = _buildDocumentsPanel();
}

function _buildDocumentsPanel() {
    return `
    <div class="space-y-4">

        <!-- Filter bar -->
        <div class="card p-4 space-y-3">
            <!-- Row 1: category chips -->
            <div id="cat-tabs" class="flex flex-wrap gap-1.5">
                ${['all', ...CATEGORIES].map(cat => {
                    const m      = CAT_META[cat] || CAT_META.ทั่วไป;
                    const active = cat === _state.filter.category;
                    return `
                    <button data-cat="${cat}"
                            class="cat-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                active
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                            }">
                        ${m.label}
                    </button>`;
                }).join('')}
            </div>

            <!-- Row 2: keyword + date + sort -->
            <div class="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <div class="relative flex-1 min-w-0">
                    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input id="doc-search" type="text" placeholder="ค้นหาเอกสาร..."
                           value="${_esc(_state.filter.query)}"
                           class="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                </div>
                <div class="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                    <input id="doc-date-from" type="date" value="${_esc(_state.filter.dateFrom)}"
                           class="flex-1 sm:w-36 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-400 text-slate-600"
                           placeholder="วันเริ่มต้น">
                    <span class="text-slate-400 text-sm flex-shrink-0">–</span>
                    <input id="doc-date-to" type="date" value="${_esc(_state.filter.dateTo)}"
                           class="flex-1 sm:w-36 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-400 text-slate-600">
                    <select id="doc-sort"
                            class="flex-shrink-0 py-2 px-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-400 bg-white text-slate-600">
                        <option value="newest" ${_state.filter.sortBy === 'newest' ? 'selected' : ''}>ล่าสุด</option>
                        <option value="oldest" ${_state.filter.sortBy === 'oldest' ? 'selected' : ''}>เก่าสุด</option>
                        <option value="az"     ${_state.filter.sortBy === 'az'     ? 'selected' : ''}>A–Z</option>
                    </select>
                    <button id="btn-clear-filter"
                            class="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors whitespace-nowrap">
                        ล้างตัวกรอง
                    </button>
                </div>
            </div>

            <p id="doc-count" class="text-xs text-slate-400"></p>
        </div>

        <!-- Grid -->
        <div id="doc-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            ${_buildDocGridContent()}
        </div>

        <!-- Pagination -->
        <div id="doc-pagination"></div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtering + sorting (pure, no DOM side-effects)
// ─────────────────────────────────────────────────────────────────────────────
function _getFilteredDocs() {
    const { category, query, dateFrom, dateTo, sortBy } = _state.filter;
    let docs = [..._state.docs];

    if (category !== 'all') {
        docs = docs.filter(d => d.Category === category);
    }

    const q = query.trim().toLowerCase();
    if (q) {
        docs = docs.filter(d =>
            (d.Title || '').toLowerCase().includes(q) ||
            (d.Description || '').toLowerCase().includes(q)
        );
    }

    if (dateFrom) {
        docs = docs.filter(d => d.UploadedAt && _toDateStr(d.UploadedAt) >= dateFrom);
    }

    if (dateTo) {
        docs = docs.filter(d => d.UploadedAt && _toDateStr(d.UploadedAt) <= dateTo);
    }

    if (sortBy === 'oldest') {
        docs.sort((a, b) => new Date(a.UploadedAt) - new Date(b.UploadedAt));
    } else if (sortBy === 'az') {
        docs.sort((a, b) => (a.Title || '').localeCompare(b.Title || '', 'th'));
    } else {
        docs.sort((a, b) => new Date(b.UploadedAt) - new Date(a.UploadedAt));
    }

    return docs;
}

function _buildDocGridContent() {
    const filtered = _getFilteredDocs();
    const total    = filtered.length;

    // Update count label if already in DOM
    const countEl = document.getElementById('doc-count');
    if (countEl) countEl.textContent = `แสดง ${total} จาก ${_state.docs.length} รายการ`;

    if (total === 0) {
        return `<div class="col-span-full">${_buildEmptyState('slate', 'ไม่พบเอกสาร',
            _state.filter.query || _state.filter.category !== 'all' || _state.filter.dateFrom || _state.filter.dateTo
                ? 'ลองปรับตัวกรองหรือลบเงื่อนไขบางส่วน'
                : _state.isAdmin ? 'กดปุ่ม "อัปโหลดเอกสาร" ด้านบนเพื่อเริ่มต้น' : 'ยังไม่มีเอกสารในหมวดหมู่นี้'
        )}</div>`;
    }

    // Paginate — clamp page to valid range so deletes never leave an empty grid
    const maxPage   = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (_state.page > maxPage) _state.page = maxPage;
    const pageStart = (_state.page - 1) * PAGE_SIZE;
    const pageDocs  = filtered.slice(pageStart, pageStart + PAGE_SIZE);

    // Render pagination after grid
    setTimeout(() => _renderPagination(total), 0);

    return pageDocs.map(_buildDocCard).join('');
}

function _renderPagination(total) {
    const container = document.getElementById('doc-pagination');
    if (!container) return;

    const pages = Math.ceil(total / PAGE_SIZE);
    if (pages <= 1) { container.innerHTML = ''; return; }

    const cur = _state.page;
    const MAX_VISIBLE = 7;

    let pageNums = [];
    if (pages <= MAX_VISIBLE) {
        pageNums = Array.from({ length: pages }, (_, i) => i + 1);
    } else {
        const left  = Math.max(2, cur - 2);
        const right = Math.min(pages - 1, cur + 2);
        pageNums = [1];
        if (left > 2) pageNums.push('…');
        for (let i = left; i <= right; i++) pageNums.push(i);
        if (right < pages - 1) pageNums.push('…');
        pageNums.push(pages);
    }

    container.innerHTML = `
    <div class="flex items-center justify-between px-1">
        <p class="text-xs text-slate-400">
            หน้า ${cur} จาก ${pages} · แสดง ${Math.min(cur * PAGE_SIZE, total)} จาก ${total} รายการ
        </p>
        <div class="flex items-center gap-1">
            <button data-page="${cur - 1}" class="page-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all
                ${cur <= 1 ? 'text-slate-300 border-slate-100 cursor-not-allowed' : 'text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-600'}"
                ${cur <= 1 ? 'disabled' : ''}>
                ←
            </button>
            ${pageNums.map(n => n === '…'
                ? `<span class="px-2 py-1.5 text-xs text-slate-400">…</span>`
                : `<button data-page="${n}" class="page-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all
                    ${n === cur
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-600'
                    }">${n}</button>`
            ).join('')}
            <button data-page="${cur + 1}" class="page-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all
                ${cur >= pages ? 'text-slate-300 border-slate-100 cursor-not-allowed' : 'text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-600'}"
                ${cur >= pages ? 'disabled' : ''}>
                →
            </button>
        </div>
    </div>`;
}

function _refreshDocGrid() {
    _state.page = 1; // reset to first page on any filter change
    if (_state.activeTab !== 'documents') return;
    const grid = document.getElementById('doc-grid');
    if (grid) grid.innerHTML = _buildDocGridContent();
}

// ─────────────────────────────────────────────────────────────────────────────
// DOC CARD
// ─────────────────────────────────────────────────────────────────────────────
function _buildDocCard(doc) {
    const meta       = CAT_META[doc.Category] || CAT_META.ทั่วไป;
    const ext        = (doc.FileType || 'pdf').toLowerCase();
    const canPreview = ext === 'pdf' || ['jpg','jpeg','png','gif','webp'].includes(ext);
    const uploadDate = doc.UploadedAt
        ? new Date(doc.UploadedAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
        : '-';
    const safeTitle = _esc(doc.Title);
    const safeUrl   = _esc(doc.FileUrl);

    return `
    <div class="card overflow-hidden hover:shadow-md transition-all group flex flex-col" data-doc-id="${doc.id}">
        <div class="h-1 w-full" style="background:${meta.dot}"></div>
        <div class="p-5 flex-1 flex flex-col gap-3">
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                     style="background:${_fileIconBg(ext)};color:${_fileIconColor(ext)}">
                    ${_fileIcon(ext)}
                </div>
                <div class="flex-1 min-w-0">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold mb-1 ${meta.bg} ${meta.text}">
                        <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:${meta.dot}"></span>
                        ${meta.label}
                    </span>
                    <h4 class="font-semibold text-slate-800 text-sm leading-snug line-clamp-2">${safeTitle}</h4>
                    ${doc.Description ? `<p class="text-xs text-slate-400 mt-1 line-clamp-2">${_esc(doc.Description)}</p>` : ''}
                </div>
                ${_state.isAdmin ? `
                <div class="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="btn-edit-doc p-1.5 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            data-id="${doc.id}" data-title="${safeTitle}"
                            data-cat="${_esc(doc.Category || '')}" data-desc="${_esc(doc.Description || '')}"
                            title="แก้ไข">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button class="btn-delete-doc p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            data-id="${doc.id}" data-title="${safeTitle}" title="ลบ">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>` : ''}
            </div>
            <div class="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1 mt-auto">
                <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    ${uploadDate}
                </span>
                <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    ${_esc(doc.UploadedBy || '-')}
                </span>
                ${doc.FileSize ? `<span>${_formatSize(doc.FileSize)}</span>` : ''}
            </div>
        </div>
        <div class="border-t border-slate-100 flex">
            ${canPreview ? `
            <button class="btn-preview-doc flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                    data-url="${safeUrl}" data-title="${safeTitle}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                ดูเอกสาร
            </button>
            <div class="w-px bg-slate-100"></div>` : ''}
            <a href="${safeUrl}" download target="_blank" rel="noopener noreferrer"
               class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                ดาวน์โหลด
            </a>
        </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════════════════════
async function _loadAll(force = false) {
    if (_loadAllInFlight) return false;
    _loadAllInFlight = true;
    _state.loading   = true;
    _state.error     = null;
    let anyFailed    = false;

    try {
        const results = await Promise.allSettled([
            _loadDocs(force),
            _loadStats(force),
            _loadActivity(force),
        ]);

        anyFailed = results.some(r => r.status === 'rejected');
        if (anyFailed) {
            const errors = results
                .filter(r => r.status === 'rejected')
                .map(r => r.reason?.message || 'ไม่ทราบสาเหตุ');
            console.warn('Contractor load partial failure:', errors);
        }
    } finally {
        _loadAllInFlight = false;
        _state.loading   = false;
    }

    _renderHeroStats();
    _activateTab(_state.activeTab);
    return !anyFailed;
}

async function _loadDocs(force = false) {
    if (!force) {
        const cached = _cache.get('docs');
        if (cached) { _state.docs = cached; return; }
    }
    const docs       = await ContractorService.getDocs();
    _state.docs      = docs;
    _cache.set('docs', docs);
}

async function _loadStats(force = false) {
    if (!force) {
        const cached = _cache.get('stats');
        if (cached) { _state.stats = cached; return; }
    }
    const stats       = await ContractorService.getStats();
    _state.stats      = stats;
    _cache.set('stats', stats);
}

async function _loadActivity(force = false) {
    if (!force) {
        const cached = _cache.get('activity');
        if (cached) { _state.activity = cached; return; }
    }
    const activity       = await ContractorService.getActivity(20);
    _state.activity      = activity;
    _cache.set('activity', activity);
}

async function _reload() {
    _cache.del('docs', 'stats', 'activity');
    return _loadAll(true);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS  — single delegated listener
// ═══════════════════════════════════════════════════════════════════════════════
function _setupEventListeners() {
    document.addEventListener('click', async e => {
        if (!e.target.closest('#contractor-page')) return;

        // Tab switch
        const tabBtn = e.target.closest('.con-tab');
        if (tabBtn?.dataset.tab) { _activateTab(tabBtn.dataset.tab); return; }

        // "ดูทั้งหมด" link on dashboard
        const tabLink = e.target.closest('[data-tab-link]');
        if (tabLink) { _activateTab(tabLink.dataset.tabLink); return; }

        // Refresh
        if (e.target.closest('#btn-refresh')) {
            const btn = e.target.closest('#btn-refresh');
            btn.disabled = true;
            btn.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> รีเฟรช...`;
            const ok = await _reload();
            btn.disabled = false;
            btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> รีเฟรช`;
            showToast(ok ? 'รีเฟรชข้อมูลสำเร็จ' : 'โหลดข้อมูลบางส่วนไม่สำเร็จ กรุณาลองใหม่', ok ? 'success' : 'warning');
            return;
        }

        // Upload — guard prevents duplicate modals from double-click
        if (e.target.closest('#btn-upload-doc')) {
            const uploadBtn = e.target.closest('#btn-upload-doc');
            if (uploadBtn.dataset.opening) return;
            uploadBtn.dataset.opening = '1';
            setTimeout(() => delete uploadBtn.dataset.opening, 500);
            _showUploadForm();
            return;
        }

        // Clickable KPI card → filter by category
        const statCard = e.target.closest('.con-stat-card[data-filter-cat]');
        if (statCard) {
            _state.filter.category = statCard.dataset.filterCat;
            _state.page = 1;
            _activateTab('documents');
            return;
        }

        // Category breakdown row → filter
        const catRow = e.target.closest('[data-cat-row]');
        if (catRow) {
            _state.filter.category = catRow.dataset.catRow;
            _state.page = 1;
            _activateTab('documents');
            return;
        }

        // Category chip filter
        const catBtn = e.target.closest('.cat-tab');
        if (catBtn) {
            _state.filter.category = catBtn.dataset.cat || 'all';
            _state.page = 1;
            document.querySelectorAll('.cat-tab').forEach(btn => {
                const active = btn.dataset.cat === _state.filter.category;
                btn.className = `cat-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    active ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                }`;
            });
            _refreshDocGrid();
            return;
        }

        // Clear filters
        if (e.target.closest('#btn-clear-filter')) {
            _state.filter = { category: 'all', query: '', dateFrom: '', dateTo: '', sortBy: 'newest' };
            _state.page   = 1;
            _renderDocuments();
            return;
        }

        // Pagination
        const pageBtn = e.target.closest('.page-btn:not([disabled])');
        if (pageBtn?.dataset.page) {
            _state.page = parseInt(pageBtn.dataset.page);
            const grid  = document.getElementById('doc-grid');
            if (grid) { grid.innerHTML = _buildDocGridContent(); grid.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            return;
        }

        // Preview
        const previewBtn = e.target.closest('.btn-preview-doc');
        if (previewBtn) { showDocumentModal(previewBtn.dataset.url, previewBtn.dataset.title); return; }

        // Edit
        const editBtn = e.target.closest('.btn-edit-doc');
        if (editBtn) {
            _showEditForm({ id: editBtn.dataset.id, Title: editBtn.dataset.title, Category: editBtn.dataset.cat, Description: editBtn.dataset.desc });
            return;
        }

        // Delete
        const deleteBtn = e.target.closest('.btn-delete-doc');
        if (deleteBtn) {
            const ok = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบเอกสาร "${deleteBtn.dataset.title}" ใช่หรือไม่?`);
            if (ok) await _deleteDocument(deleteBtn.dataset.id);
            return;
        }
    });

    // Search debounce
    document.addEventListener('input', _debounce(e => {
        if (e.target.matches('#doc-search')) {
            _state.filter.query = e.target.value;
            _refreshDocGrid();
        }
    }, 300));

    // Sort + date change
    document.addEventListener('change', e => {
        if (e.target.matches('#doc-sort'))      { _state.filter.sortBy  = e.target.value; _refreshDocGrid(); }
        if (e.target.matches('#doc-date-from')) { _state.filter.dateFrom = e.target.value; _refreshDocGrid(); }
        if (e.target.matches('#doc-date-to'))   { _state.filter.dateTo   = e.target.value; _refreshDocGrid(); }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD FORM
// ═══════════════════════════════════════════════════════════════════════════════
function _showUploadForm() {
    const html = `
        <form id="contractor-upload-form" class="space-y-4" novalidate>
            ${_formField('uf-title', 'Title', 'text', 'ชื่อเอกสาร', true, 'เช่น ระเบียบปฏิบัติสำหรับผู้รับเหมา 2568', 255)}
            ${_formSelect('uf-cat', 'Category', 'หมวดหมู่', CATEGORIES)}
            ${_formTextarea('uf-desc', 'Description', 'คำอธิบาย (ไม่บังคับ)', 'รายละเอียดเพิ่มเติม...')}
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    ไฟล์เอกสาร <span class="text-red-500">*</span>
                </label>
                <div id="drop-zone" class="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all">
                    <svg class="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                    <p class="text-sm text-slate-500 mb-1">คลิกหรือลากไฟล์มาวาง</p>
                    <p class="text-xs text-slate-400">PDF, Word, Excel, รูปภาพ · ขนาดสูงสุด 20 MB</p>
                    <input type="file" id="upload-file-input" name="file" class="hidden"
                           accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp">
                </div>
                <div id="file-preview" class="hidden mt-2 flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-200">
                    <svg class="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <span id="file-name" class="text-sm text-slate-700 truncate flex-1"></span>
                    <span id="file-size-label" class="text-xs text-slate-400 flex-shrink-0"></span>
                    <button type="button" id="btn-clear-file" class="text-slate-400 hover:text-red-500 flex-shrink-0">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
                <p id="uf-file-err" class="text-xs text-red-500 mt-1 hidden"></p>
            </div>
            ${_formFooter('submit-upload-btn', 'อัปโหลด')}
        </form>`;

    openModal('อัปโหลดเอกสาร Contractor', html, 'max-w-lg');
    _initDropZone();

    document.getElementById('contractor-upload-form').addEventListener('submit', async e => {
        e.preventDefault();
        if (!_validateUploadForm()) return;
        await _withSpinner('submit-upload-btn', 'กำลังอัปโหลด...', async () => {
            await ContractorService.upload(new FormData(e.target));
            closeModal();
            showToast('อัปโหลดเอกสารสำเร็จ', 'success');
            await _reload();
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT FORM
// ═══════════════════════════════════════════════════════════════════════════════
function _showEditForm(doc) {
    const html = `
        <form id="contractor-edit-form" class="space-y-4" novalidate>
            ${_formField('ef-title', 'Title', 'text', 'ชื่อเอกสาร', true, '', 255, _esc(doc.Title))}
            ${_formSelect('ef-cat', 'Category', 'หมวดหมู่', CATEGORIES, doc.Category)}
            ${_formTextarea('ef-desc', 'Description', 'คำอธิบาย', '', _esc(doc.Description || ''))}
            ${_formFooter('submit-edit-btn', 'บันทึก')}
        </form>`;

    openModal('แก้ไขเอกสาร', html, 'max-w-md');

    document.getElementById('contractor-edit-form').addEventListener('submit', async e => {
        e.preventDefault();
        const titleEl  = document.getElementById('ef-title');
        const titleErr = document.getElementById('ef-title-err');
        if (!titleEl.value.trim()) {
            titleErr.textContent = 'กรุณากรอกชื่อเอกสาร';
            titleErr.classList.remove('hidden');
            return;
        }
        titleErr.classList.add('hidden');
        await _withSpinner('submit-edit-btn', 'บันทึก...', async () => {
            await ContractorService.update(doc.id, {
                Title:       titleEl.value.trim(),
                Category:    document.getElementById('ef-cat').value,
                Description: document.getElementById('ef-desc').value.trim(),
            });
            closeModal();
            showToast('บันทึกข้อมูลสำเร็จ', 'success');
            await _reload();
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════════════════════
async function _deleteDocument(id) {
    showLoading('กำลังลบเอกสาร...');
    try {
        await ContractorService.remove(id);
        showToast('ลบเอกสารสำเร็จ', 'success');
        // Optimistic update: remove from local state first, then reload
        _state.docs = _state.docs.filter(d => String(d.id) !== String(id));
        _cache.del('docs', 'stats', 'activity');
        _renderHeroStats();
        _activateTab(_state.activeTab);
        // Background reload to sync stats
        _loadStats(true).then(() => _renderHeroStats()).catch(() => {});
        _loadActivity(true).then(() => {
            const log = document.getElementById('con-activity-log');
            if (log) log.innerHTML = _buildActivityList();
        }).catch(() => {});
    } catch (err) {
        showToast(err?.message || 'ลบไม่สำเร็จ กรุณาลองใหม่', 'error');
    } finally {
        hideLoading();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REUSABLE FORM COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
function _formField(id, name, type, label, required, placeholder = '', maxlength = 255, value = '') {
    return `
    <div>
        <label class="block text-sm font-semibold text-slate-700 mb-1.5">
            ${label}${required ? ' <span class="text-red-500">*</span>' : ''}
        </label>
        <input type="${type}" id="${id}" name="${name}" value="${value}" placeholder="${placeholder}" maxlength="${maxlength}"
               class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
        <p id="${id}-err" class="text-xs text-red-500 mt-1 hidden"></p>
    </div>`;
}

function _formSelect(id, name, label, options, selected = '') {
    return `
    <div>
        <label class="block text-sm font-semibold text-slate-700 mb-1.5">${label}</label>
        <select id="${id}" name="${name}"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-emerald-400 bg-white">
            ${options.map(o => `<option value="${o}"${o === selected ? ' selected' : ''}>${o}</option>`).join('')}
        </select>
    </div>`;
}

function _formTextarea(id, name, label, placeholder = '', value = '') {
    return `
    <div>
        <label class="block text-sm font-semibold text-slate-700 mb-1.5">${label}</label>
        <textarea id="${id}" name="${name}" rows="2" maxlength="500" placeholder="${placeholder}"
                  class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 resize-none">${value}</textarea>
    </div>`;
}

function _formFooter(submitId, submitLabel) {
    return `
    <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button"
                class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
        <button type="submit" id="${submitId}"
                class="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style="background:#059669">${submitLabel}</button>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Drop zone
// ─────────────────────────────────────────────────────────────────────────────
function _initDropZone() {
    const dropZone  = document.getElementById('drop-zone');
    const fileInput = document.getElementById('upload-file-input');
    const preview   = document.getElementById('file-preview');
    const nameEl    = document.getElementById('file-name');
    const sizeEl    = document.getElementById('file-size-label');
    const clearBtn  = document.getElementById('btn-clear-file');
    if (!dropZone) return;

    const showPreview = file => {
        nameEl.textContent = file.name;
        sizeEl.textContent = _formatSize(file.size);
        preview.classList.remove('hidden');
        dropZone.classList.add('hidden');
        document.getElementById('uf-file-err')?.classList.add('hidden');
    };

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('border-emerald-400', 'bg-emerald-50'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-emerald-400', 'bg-emerald-50'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('border-emerald-400', 'bg-emerald-50');
        const file = e.dataTransfer.files[0];
        if (file) {
            const dt = new DataTransfer(); dt.items.add(file);
            fileInput.files = dt.files;
            showPreview(file);
        }
    });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) showPreview(fileInput.files[0]); });
    clearBtn.addEventListener('click', () => {
        fileInput.value = '';
        preview.classList.add('hidden');
        dropZone.classList.remove('hidden');
    });
}

function _validateUploadForm() {
    let valid = true;
    const titleEl   = document.getElementById('uf-title');
    const titleErr  = document.getElementById('uf-title-err');
    const fileInput = document.getElementById('upload-file-input');
    const fileErr   = document.getElementById('uf-file-err');

    if (!titleEl.value.trim()) {
        titleErr.textContent = 'กรุณากรอกชื่อเอกสาร';
        titleErr.classList.remove('hidden');
        titleEl.classList.add('border-red-400');
        valid = false;
    } else {
        titleErr.classList.add('hidden');
        titleEl.classList.remove('border-red-400');
    }

    if (!fileInput.files?.length) {
        fileErr.textContent = 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด';
        fileErr.classList.remove('hidden');
        valid = false;
    } else {
        const file = fileInput.files[0];
        if (file.size > 20 * 1024 * 1024) {
            fileErr.textContent = 'ขนาดไฟล์เกิน 20 MB กรุณาเลือกไฟล์ขนาดเล็กลง';
            fileErr.classList.remove('hidden');
            valid = false;
        } else if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
            fileErr.textContent = 'ประเภทไฟล์ไม่รองรับ กรุณาเลือก PDF, Word, Excel หรือรูปภาพ';
            fileErr.classList.remove('hidden');
            valid = false;
        } else {
            fileErr.classList.add('hidden');
        }
    }

    return valid;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
async function _withSpinner(btnId, label, fn) {
    const btn = document.getElementById(btnId);
    if (!btn) { await fn().catch(err => showToast(err?.message || 'เกิดข้อผิดพลาด', 'error')); return; }
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 align-middle"></span>${label}`;
    try {
        await fn();
    } catch (err) {
        showToast(err?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
}

function _buildStatsSkeleton(count) {
    return Array.from({ length: count }, () => `
        <div class="rounded-xl px-4 py-3 text-center animate-pulse" style="background:rgba(255,255,255,0.10)">
            <div class="h-6 w-10 rounded bg-white/20 mx-auto mb-1"></div>
            <div class="h-3 w-16 rounded bg-white/15 mx-auto"></div>
        </div>`).join('');
}

function _buildEmptyState(color, title, sub) {
    return `
    <div class="card p-12 text-center">
        <div class="w-16 h-16 rounded-2xl bg-${color}-50 flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-${color}-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
        </div>
        <p class="text-slate-500 font-medium">${title}</p>
        <p class="text-slate-400 text-sm mt-1">${sub}</p>
    </div>`;
}

const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]);

// Convert a MySQL datetime string or ISO string to "YYYY-MM-DD" using local time.
// mysql2 serializes DATETIME columns to ISO UTC strings (e.g. "2024-01-15T03:00:00.000Z").
// new Date(str).toLocaleDateString() gives the local calendar date, avoiding midnight-UTC
// off-by-one that would exclude docs uploaded in the first 7 hours of a Thailand day.
function _toDateStr(val) {
    if (!val) return '';
    const d = new Date(val);
    return isNaN(d) ? String(val).slice(0, 10)
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function _esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1048576)     return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

function _fileIconColor(ext) {
    if (ext === 'pdf') return '#dc2626';
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '#0284c7';
    if (['doc','docx'].includes(ext)) return '#1d4ed8';
    if (['xls','xlsx'].includes(ext)) return '#059669';
    return '#7c3aed';
}

function _fileIconBg(ext) {
    if (ext === 'pdf') return '#fef2f2';
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '#e0f2fe';
    if (['doc','docx'].includes(ext)) return '#eff6ff';
    if (['xls','xlsx'].includes(ext)) return '#f0fdf4';
    return '#f3e8ff';
}

function _fileIcon(ext, cls = 'w-5 h-5') {
    if (ext === 'pdf')
        return `<svg class="${cls}" fill="currentColor" viewBox="0 0 24 24"><path d="M7 2h10l5 5v15a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1h4zm9 1.5V8h4.5L16 3.5zM8.5 12a2 2 0 000 4h1v1h1v-1h1a2 2 0 000-4h-3zM9 13h3a1 1 0 010 2H9a1 1 0 010-2z"/></svg>`;
    if (['jpg','jpeg','png','gif','webp'].includes(ext))
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`;
    if (['doc','docx'].includes(ext))
        return `<svg class="${cls}" fill="currentColor" viewBox="0 0 24 24"><path d="M7 2h10l5 5v15a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1h4zm9 1.5V8h4.5L16 3.5zM8 11h8v1H8v-1zm0 3h8v1H8v-1zm0 3h5v1H8v-1z"/></svg>`;
    if (['xls','xlsx'].includes(ext))
        return `<svg class="${cls}" fill="currentColor" viewBox="0 0 24 24"><path d="M7 2h10l5 5v15a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1h4zm9 1.5V8h4.5L16 3.5zM9 12l1.5 2.5L9 17h1.5l.75-1.5.75 1.5H13.5l-1.5-2.5L13.5 12H12l-.75 1.5L10.5 12H9z"/></svg>`;
    return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`;
}
