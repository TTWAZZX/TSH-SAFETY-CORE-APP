import { guardSubmitHandler } from '../utils/async-ui.js?v=20260715-phase32d-remaining-async-ux';
// public/js/pages/safety-culture.js

import { API } from '../api.js';
import { openModal, closeModal, showToast, showLoading, hideLoading, escHtml } from '../ui.js?v=20260602-mobile-nav-m53';
import { captureCardImage, isSharedCardImageExportEnabled } from '../utils/card-image-export.js?v=20260820-card-image-phase2b';

// ── State ──────────────────────────────────────────────────────────────────
let _isAdmin        = false;
let _activeTab      = 'principles';
let _principles     = [];
let _assessments    = [];
let _ppeInspections = [];
let _ppeItems       = [];
let _assessmentLocations = [];
let _scAreas        = [];
let _dashData       = null;
let _filterYear     = new Date().getFullYear();
let _listenersReady = false;
let _radarChart     = null;
let _barChart       = null;
let _lineChart      = null;
let _departments    = [];
let _filterPPEDept  = '';
let _ppeWorkTypes   = [];
let _ppeViolations  = [];
let _ppeSub         = 'dashboard';
let _ppeSearch      = '';
let _ppeFilterWT    = '';
let _ppeFilterStatus = '';
let _ppeFilterMonth = 0;
let _ppeChartInst   = null;
let _campaignTypeFilter = 'all';
let _campaignStatusFilter = 'all';
let _campaignSearch = '';
let _campaignSearchTimer = null;
let _asmtFilterMonth = 0;
let _asmtFilterArea = '';
let _asmtFilterWeek = 0;
let _filterDashMonth = 0;   // 0 = รายปี, 1-12 = เดือน
let _dashScores      = null; // [T1,T2,T3,T4,T5,T6(PPE),T7] ใช้โดย initCharts()
let _dataLoaded      = false; // true after first successful _loadHeroStats()
let _loadRequestId   = 0;
let _scCardSaveHold  = null;
let _scCardSaveMenu  = null;

// ── Constants ──────────────────────────────────────────────────────────────
const TOPIC_LABELS = [
    'เดินบน Walk Way',
    'ไม่ใช้โทรศัพท์ขณะเดิน',
    'ข้ามถนนทางม้าลาย',
    'หยุดชี้นิ้วก่อนข้าม',
    'ไม่ล้วงกระเป๋า',
    'PPE Control',
    'แยกขยะถูกต้อง',
];

const TOPIC_SVG = [
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8.25V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18V8.25m-18 0V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v2.25m-18 0h18M5.25 6h.008v.008H5.25V6zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0h.008v.008H9.75V6zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0h.008v.008H14.25V6zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>`,
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18h3M3 3l18 18"/></svg>`,
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"/></svg>`,
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5"/></svg>`,
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.07 5.695a1.575 1.575 0 01-1.548 1.625 8.269 8.269 0 01-3.371-.999 21.571 21.571 0 01-1.364-.988 1.575 1.575 0 112.004-2.43c.09.063.183.133.274.195v-2.502zm0 0H9m7.5 3a3 3 0 00-3-3h-1.5a3 3 0 00-3 3v3.75a3 3 0 003 3h1.5a3 3 0 003-3V7.575z"/></svg>`,
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>`,
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>`,
];

const PPE_ITEMS = [
    { key: 'Helmet',     label: 'Safety Helmet',  icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>` },
    { key: 'Glasses',    label: 'Safety Glasses', icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>` },
    { key: 'Gloves',     label: 'Gloves',         icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.07 5.695a1.575 1.575 0 01-1.548 1.625 8.269 8.269 0 01-3.371-.999 21.571 21.571 0 01-1.364-.988 1.575 1.575 0 112.004-2.43c.09.063.183.133.274.195v-2.502zm0 0H9m7.5 3a3 3 0 00-3-3h-1.5a3 3 0 00-3 3v3.75a3 3 0 003 3h1.5a3 3 0 003-3V7.575z"/></svg>` },
    { key: 'Shoes',      label: 'Safety Shoes',   icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z"/></svg>` },
    { key: 'FaceShield', label: 'Face Shield',    icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>` },
    { key: 'EarPlug',    label: 'Ear Plug',       icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/></svg>` },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function getMaturity(avg) {
    const v = parseFloat(avg);
    if (v <= 40) return { label: 'Reactive',   color: 'text-red-600',     bg: 'bg-red-100',      border: 'border-red-300',     dot: 'bg-red-400' };
    if (v <= 60) return { label: 'Basic',       color: 'text-amber-600',   bg: 'bg-amber-100',    border: 'border-amber-300',   dot: 'bg-amber-400' };
    if (v <= 80) return { label: 'Proactive',   color: 'text-blue-600',    bg: 'bg-blue-100',     border: 'border-blue-300',    dot: 'bg-blue-400' };
    return               { label: 'Generative',  color: 'text-emerald-600', bg: 'bg-emerald-100',  border: 'border-emerald-300', dot: 'bg-emerald-400 animate-pulse' };
}

function fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

function getUploadDisplayName(url, fallback = '') {
    try {
        const u = new URL(url, window.location.origin);
        const fromMeta = u.searchParams.get('filename');
        if (fromMeta) return decodeURIComponent(fromMeta);
        return fallback || decodeURIComponent(u.pathname.split('/').pop() || '');
    } catch {
        return fallback || '';
    }
}

function safeResourceUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw, window.location.origin);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '';
        return raw;
    } catch { return ''; }
}

function inlineArg(value) {
    return escHtml(JSON.stringify(String(value ?? '')).replace(/</g, '\\u003c'));
}

async function uploadSafetyCultureFile(file, label = 'ไฟล์') {
    if (!file) return null;
    const fd = new FormData();
    fd.append('document', file);
    const res = await API.post('/upload/document', fd);
    if (!res?.url) throw new Error(`ไม่สามารถอัปโหลด${label}ได้`);
    return res;
}

async function cleanupUploadedUrl(url) {
    if (!url) return;
    try {
        await API.delete('/upload/document', { body: JSON.stringify({ url }) });
    } catch (_) {
        // Best effort only. The save flow should show the original error.
    }
}

function scoreColor(v) {
    if (v == null) return 'text-slate-300';
    const n = parseFloat(v);
    if (n >= 90) return 'text-emerald-600 font-semibold';
    if (n >= 70) return 'text-blue-600 font-semibold';
    if (n >= 50) return 'text-amber-600 font-semibold';
    return 'text-red-600 font-semibold';
}

// ── Tab Config ─────────────────────────────────────────────────────────────
function _getTabs() {
    return [
        { id: 'principles', label: 'สื่อรณรงค์และกิจกรรม',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>` },
        { id: 'dashboard',  label: 'Dashboard',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
        { id: 'assessment', label: 'ผลการประเมิน',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` },
        { id: 'ppe',        label: 'PPE Control',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M9 3.75a6.975 6.975 0 015.516 2.699A12.022 12.022 0 0120.25 12c0 6.077-3.86 11.253-9.25 12.622C5.61 23.253 1.75 18.077 1.75 12c0-1.93.394-3.76 1.099-5.416A6.977 6.977 0 019 3.75z"/>` },
    ];
}

// ── Entry Point ────────────────────────────────────────────────────────────
export async function loadSafetyCulturePage() {
    const container = document.getElementById('safety-culture-page');
    if (!container) return;

    const user  = TSHSession.getUser() || {};
    _isAdmin    = user.role === 'Admin' || user.Role === 'Admin';
    _filterYear = new Date().getFullYear();
    _activeTab  = window._getTab?.('safety-culture', 'principles') || 'principles';
    if (!_isAdmin && _ppeSub === 'violations') _ppeSub = 'dashboard';

    window.closeModal = closeModal;

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    switchTab(_activeTab);
    _loadHeroStats();
}

// ── Shell ──────────────────────────────────────────────────────────────────
function buildShell() {
    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);

    const tabHtml = _getTabs().map(t => `
        <button id="sc-tab-btn-${t.id}" data-tab="${t.id}"
            class="sc-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    const statCards = [
        { label: 'ระดับวัฒนธรรม',  idx: 0 },
        { label: 'คะแนนเฉลี่ย',    idx: 1 },
        { label: 'PPE Compliance',  idx: 2 },
        { label: 'ตรวจ PPE (ครั้ง)', idx: 3 },
    ].map(s => `
        <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
            <p class="text-xl font-bold text-white truncate" data-sc-stat="${s.idx}">—</p>
            <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${s.label}</p>
        </div>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" data-sc-card-image="safety-culture-hero-summary" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="sc-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#sc-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
                                </svg>
                                Safety Campaigns
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">Safety Communication &amp; Culture Program</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">ศูนย์รวมสื่อรณรงค์ กิจกรรม และการติดตามวัฒนธรรมความปลอดภัย · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-shrink-0 w-full md:w-auto">
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full sm:w-auto">
                            ${statCards}
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <select id="sc-year-sel" class="rounded-xl px-3 py-2 text-xs font-semibold text-white border border-white/30 bg-white/15 outline-none">
                                ${years.map(y => `<option value="${y}" ${y === _filterYear ? 'selected' : ''} class="text-slate-800 bg-white">${y}</option>`).join('')}
                            </select>
                            <button onclick="window._scExportPDF()" class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white border border-white/30 bg-white/15 hover:bg-white/25 transition-all whitespace-nowrap">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                Export PDF
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Tab bar -->
                <div class="flex overflow-x-auto gap-0 -mb-px scrollbar-none">
                    ${tabHtml}
                </div>
            </div>
        </div>

        <!-- ═══ TAB PANELS ═══ -->
        <div id="sc-panel-principles" class="hidden"></div>
        <div id="sc-panel-dashboard"  class="hidden"></div>
        <div id="sc-panel-assessment" class="hidden"></div>
        <div id="sc-panel-ppe"        class="hidden"></div>

    </div>`;
}

// ── Event Listeners (once) ─────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', e => {
        const tabBtn = e.target.closest('.sc-tab');
        if (tabBtn?.dataset?.tab) { switchTab(tabBtn.dataset.tab); return; }

        if (e.target.closest('[data-sc-card-save-action]')) {
            const card = _scCardSaveMenu?.card;
            _scHideCardImageMenu();
            if (card) _scDownloadCardImage(card);
            return;
        }

        if (!e.target.closest('#sc-card-save-menu')) _scHideCardImageMenu();
    });

    document.addEventListener('change', e => {
        if (e.target?.id === 'sc-year-sel') {
            _filterYear = parseInt(e.target.value) || new Date().getFullYear();
            _filterDashMonth = 0; // reset month filter on year change
            _loadHeroStats();
        }
    });

    document.addEventListener('contextmenu', _scShowCardContextMenu);
    document.addEventListener('pointerdown', _scStartCardImageHold);
    document.addEventListener('pointermove', _scMoveCardImageHold);
    document.addEventListener('pointerup', _scCancelCardImageHold);
    document.addEventListener('pointercancel', _scCancelCardImageHold);

    // Panel inline-onclick globals
    window._scSetDashMonth     = (v)   => { _filterDashMonth = parseInt(v)||0; _updateHeroStats(); renderPanel('dashboard'); };
    window._scSetDeptFilter    = (val) => { _filterPPEDept = val; renderPanel('ppe'); };
    window._scSetPPESub        = (s)   => {
        if (!_isAdmin && (s === 'worktypes' || s === 'violations')) s = 'dashboard';
        _ppeSub = s;
        renderPanel('ppe');
    };
    window._scSetPPESearch     = (v)   => { _ppeSearch = v; renderPanel('ppe'); };
    window._scSetPPEWT         = (v)   => { _ppeFilterWT = v; renderPanel('ppe'); };
    window._scSetPPEStatus     = (v)   => { _ppeFilterStatus = v; renderPanel('ppe'); };
    window._scSetPPEMonth      = (v)   => { _ppeFilterMonth = parseInt(v, 10) || 0; renderPanel('ppe'); };
    window._scSetPPEDept       = (v)   => { _filterPPEDept = (v || '').trim(); renderPanel('ppe'); };
    window._scClearPPEFilters  = ()    => { _ppeSearch = ''; _ppeFilterWT = ''; _ppeFilterStatus = ''; _ppeFilterMonth = 0; _filterPPEDept = ''; renderPanel('ppe'); };
    window._scPreviewPPEEvidence = (id) => previewPPEEvidence(id);
    window._scSetAsmtMonth     = (v)   => { _asmtFilterMonth = parseInt(v, 10) || 0; renderPanel('assessment'); };
    window._scSetAsmtArea      = (v)   => { _asmtFilterArea = (v || '').trim(); renderPanel('assessment'); };
    window._scSetAsmtWeek      = (v)   => { _asmtFilterWeek = parseInt(v, 10) || 0; renderPanel('assessment'); };
    window._scClearAsmtFilters = ()    => { _asmtFilterMonth = 0; _asmtFilterArea = ''; _asmtFilterWeek = 0; renderPanel('assessment'); };
    window._scSetTab           = (id) => switchTab(id);
    window._scEditPrinciple    = (id) => openPrincipleForm(id);
    window._scAddAssessment    = () => openAssessmentForm(null);
    window._scEditAssessment   = (id) => openAssessmentForm(id);
    window._scViewAssessment   = (id) => viewAssessmentDetail(id);
    window._scDeleteAssessment = (id) => deleteAssessment(id);
    window._scAddAssessmentLocation = () => openAssessmentLocationForm(null);
    window._scEditAssessmentLocation = (id) => openAssessmentLocationForm(id);
    window._scDeleteAssessmentLocation = (id) => deleteAssessmentLocation(id);
    window._scAddPPE           = () => openPPEForm();
    window._scViewPPE          = (id) => viewPPERecord(id);
    window._scDeletePPE        = (id) => deletePPE(id);
    window._scExportPDF             = () => exportPDF();
    window._scExportAssessmentPDF   = (mode) => mode === 'monthly' ? openMonthPickerForAssessmentPDF() : exportAssessmentYearlyHtmlPDF();
    window._scSetCampaignType       = (v) => { _campaignTypeFilter = v || 'all'; renderPanel('principles'); };
    window._scSetCampaignStatus     = (v) => { _campaignStatusFilter = v || 'all'; renderPanel('principles'); };
    window._scSetCampaignSearch     = (v) => {
        _campaignSearch = v || '';
        clearTimeout(_campaignSearchTimer);
        _campaignSearchTimer = setTimeout(() => renderPanel('principles'), 250);
    };
    window._scClearCampaignFilters  = () => { _campaignTypeFilter = 'all'; _campaignStatusFilter = 'all'; _campaignSearch = ''; renderPanel('principles'); };
    window._scPreviewCampaign       = (id) => previewCampaign(id);
    window._scAddPPEItem       = () => openPPEItemForm(null);
    window._scEditPPEItem      = (id) => openPPEItemForm(id);
    window._scDeletePPEItem    = (id) => deletePPEItem(id);
    window._scAddWorkType      = () => openWorkTypeForm(null);
    window._scEditWorkType     = (id) => openWorkTypeForm(id);
    window._scDeleteWorkType   = (id) => deleteWorkType(id);
    window._scDelViolation     = (id) => deleteViolation(id);
    window._scViewViolations   = (empId) => viewEmployeeViolations(empId);
    window._scViewImage        = (url, title) => {
        openModal(escHtml(title) || 'รูปภาพ',
            `<div class="flex justify-center"><img src="${escHtml(url)}" alt="${escHtml(title || '')}" class="max-w-full rounded-lg" style="max-height:70vh;object-fit:contain"></div>`,
            'max-w-4xl');
    };
}

// ── Switch Tab ─────────────────────────────────────────────────────────────
function _scShowCardContextMenu(event) {
    const card = event.target?.closest?.('[data-sc-card-image]');
    if (!card || !document.getElementById('safety-culture-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"]')) return;
    event.preventDefault();
    _scShowCardImageMenu(card, event.clientX, event.clientY);
}

function _scStartCardImageHold(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const card = event.target?.closest?.('[data-sc-card-image]');
    if (!card || !document.getElementById('safety-culture-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"]')) return;
    _scCancelCardImageHold();
    _scCardSaveHold = {
        card,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        fired: false,
        timer: setTimeout(() => {
            if (!_scCardSaveHold || _scCardSaveHold.card !== card) return;
            _scCardSaveHold.fired = true;
            _scShowCardImageMenu(card, _scCardSaveHold.x, _scCardSaveHold.y);
        }, 800),
    };
}

function _scMoveCardImageHold(event) {
    if (!_scCardSaveHold || event.pointerId !== _scCardSaveHold.pointerId) return;
    if (Math.abs(event.clientX - _scCardSaveHold.x) > 10 || Math.abs(event.clientY - _scCardSaveHold.y) > 10) {
        _scCancelCardImageHold();
    }
}

function _scCancelCardImageHold() {
    if (_scCardSaveHold?.timer) clearTimeout(_scCardSaveHold.timer);
    _scCardSaveHold = null;
}

function _scShowCardImageMenu(card, clientX, clientY) {
    _scHideCardImageMenu();
    const menu = document.createElement('div');
    menu.id = 'sc-card-save-menu';
    menu.className = 'fixed z-[9999] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl';
    menu.style.minWidth = '170px';
    menu.innerHTML = `
        <button type="button" data-sc-card-save-action
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
    _scCardSaveMenu = { card, menu };
}

function _scHideCardImageMenu() {
    _scCardSaveMenu?.menu?.remove?.();
    _scCardSaveMenu = null;
}

async function _scDownloadCardImage(card) {
    const targetName = card?.dataset?.scCardImage || 'safety-culture-card';
    const pilotEnabled = targetName === 'safety-culture-campaign-library'
        && isSharedCardImageExportEnabled(undefined, 'safety-culture');
    if (!pilotEnabled) return _scDownloadCardImageLegacy(card);

    const name = _scSafeFilePart(targetName);
    try {
        showLoading('Saving card image...');
        const result = await captureCardImage(card, {
            filename: `${name}-${_filterYear}`,
            width: 1200,
            expandTruncatedText: true,
            renderControlsAsText: true,
            prepareClone: clone => {
                clone.querySelectorAll('[data-sc-card-ignore]').forEach(element => {
                    element.style.setProperty('display', 'none', 'important');
                });
            },
        });
        document.dispatchEvent(new CustomEvent('tsh:card-image-export-complete', {
            detail: { module: 'safety-culture', target: targetName, engine: 'shared', width: result.width, height: result.height },
        }));
        showToast('บันทึกรูปภาพการ์ดแล้ว', 'success');
    } catch (error) {
        console.warn('[CardImageExport] Safety Culture shared capture failed; using legacy fallback.', error);
        document.dispatchEvent(new CustomEvent('tsh:card-image-export-complete', {
            detail: { module: 'safety-culture', target: targetName, engine: 'legacy-fallback', errorCode: error?.code || 'CAPTURE_FAILED' },
        }));
        hideLoading();
        return _scDownloadCardImageLegacy(card);
    } finally {
        hideLoading();
    }
}

async function _scDownloadCardImageLegacy(card) {
    if (typeof html2canvas === 'undefined') {
        showToast('ไม่พบ library สำหรับบันทึกรูปภาพ', 'error');
        return;
    }
    const name = _scSafeFilePart(card.dataset.scCardImage || 'safety-culture-card');
    try {
        showLoading('Saving card image...');
        const canvas = await html2canvas(card, {
            backgroundColor: '#ffffff',
            scale: Math.min(2, window.devicePixelRatio || 1.5),
            useCORS: true,
            onclone: doc => {
                doc.querySelectorAll('[data-sc-card-ignore]').forEach(el => { el.style.display = 'none'; });
            },
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${name}-${_filterYear}.png`;
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

function _scSafeFilePart(value) {
    return String(value || 'safety-culture-card')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'safety-culture-card';
}

function switchTab(id) {
    _activeTab = id;
    window._saveTab?.('safety-culture', id);

    _getTabs().forEach(t => {
        const btn = document.getElementById(`sc-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === id
            ? 'sc-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white'
            : 'sc-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';
    });

    ['principles', 'dashboard', 'assessment', 'ppe'].forEach(t => {
        document.getElementById(`sc-panel-${t}`)?.classList.add('hidden');
    });
    document.getElementById(`sc-panel-${id}`)?.classList.remove('hidden');

    renderPanel(id);
}

// ── Hero Stats (async fill) ────────────────────────────────────────────────
async function _fetchDepts() {
    const res  = await API.get('/master/departments').catch(() => ({ data: [] }));
    const raw  = res?.data ?? res;
    _departments = (Array.isArray(raw) ? raw : []).map(d => (d.Name || d.name || '').trim()).filter(Boolean);
}

async function _loadHeroStats() {
    const requestId = ++_loadRequestId;
    _dataLoaded = false;
    // show skeleton immediately in whichever panel is visible
    ['principles','dashboard','assessment','ppe'].forEach(id => {
        const p = document.getElementById(`sc-panel-${id}`);
        if (p && !p.classList.contains('hidden')) p.innerHTML = _buildSkeleton(id);
    });
    try {
        const fetches = [
            API.get('/safety-culture/principles'),
            API.get(`/safety-culture/assessments?year=${_filterYear}`),
            API.get(`/safety-culture/ppe-inspections?year=${_filterYear}`),
            API.get(`/safety-culture/dashboard?year=${_filterYear}`),
            API.get('/safety-culture/ppe-items').catch(() => ({ data: [] })),
            API.get('/safety-culture/ppe-work-types').catch(() => ({ data: [] })),
            _isAdmin
                ? API.get('/safety-culture/assessment-locations?all=1').catch(() => ({ data: [] }))
                : API.get('/safety-culture/assessment-locations').catch(() => ({ data: [] })),
            _isAdmin
                ? API.get(`/safety-culture/ppe-violations?year=${_filterYear}`).catch(() => ({ data: [] }))
                : Promise.resolve({ data: [] }),
        ];
        if (_departments.length === 0) fetches.push(_fetchDepts());
        const [pRes, aRes, ppeRes, dRes, itemsRes, wtRes, locRes, violRes] = await Promise.all(fetches);
        if (requestId !== _loadRequestId) return;
        _principles     = (pRes.data || []).map(p => ({
            ...p,
            ImageUrl: safeResourceUrl(p.ImageUrl),
            AttachmentUrl: safeResourceUrl(p.AttachmentUrl),
        }));
        _assessments    = aRes.data      || [];
        _ppeInspections = (ppeRes.data || []).map(r => ({ ...r, ImageUrl: safeResourceUrl(r.ImageUrl) }));
        _dashData       = dRes.data      || null;
        _ppeItems       = (itemsRes?.data || []).map(i => ({ ...i, ImageUrl: safeResourceUrl(i.ImageUrl) }));
        _ppeWorkTypes   = (wtRes?.data || []).map(w => ({
            ...w,
            items: (w.items || []).map(i => ({ ...i, ImageUrl: safeResourceUrl(i.ImageUrl) })),
        }));
        _assessmentLocations = locRes?.data || [];
        _ppeViolations  = violRes?.data  || [];
        _dataLoaded     = true;

        const avg      = _dashData?.avgScores;
        const ppeStats = _getPPEStats();

        let overallAvg = null;
        if (avg) {
            const vals = [avg.avg_t1, avg.avg_t2, avg.avg_t3, avg.avg_t4, avg.avg_t5, avg.avg_t7]
                .filter(v => v != null).map(v => parseFloat(v));
            if (vals.length) overallAvg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
        }
        const mat    = overallAvg ? getMaturity(overallAvg) : null;
        const ppePctVal = _ppeCompliancePct(_ppeInspections, ppeStats);
        const ppePct = ppePctVal != null ? ppePctVal.toFixed(1) + '%'
            : '—';

        _setStatVal(0, mat ? mat.label : '—');
        _setStatVal(1, overallAvg != null ? overallAvg + '%' : '—');
        _setStatVal(2, ppePct);
        _setStatVal(3, _ppeInspections.length);

        renderPanel(_activeTab);
    } catch (err) {
        if (requestId !== _loadRequestId) return;
        showToast('โหลดข้อมูลไม่สำเร็จ: ' + (err?.message || 'Unknown error'), 'error');
    }
}

function _setStatVal(idx, val) {
    const el = document.querySelector(`[data-sc-stat="${idx}"]`);
    if (el) el.textContent = val;
}

function _getPPEStats() {
    const stats = _dashData?.ppeStats;
    return Array.isArray(stats) ? (stats[0] || {}) : (stats || {});
}

function _ppeRecordCompliancePct(r) {
    const direct = parseFloat(r?.CompliancePct);
    if (Number.isFinite(direct)) return direct;

    const total = parseFloat(r?.TotalItems);
    const ok = parseFloat(r?.CompliantItems);
    if (Number.isFinite(total) && total > 0 && Number.isFinite(ok)) return (ok / total) * 100;

    const details = Array.isArray(r?.details) ? r.details : [];
    const counted = details.filter(d => ['compliant', 'non-compliant'].includes(String(d.Status || '').toLowerCase()));
    if (counted.length) {
        const compliant = counted.filter(d => String(d.Status || '').toLowerCase() === 'compliant').length;
        return (compliant / counted.length) * 100;
    }

    if (r?.IsPass != null) return _isPPEPass(r) ? 100 : 0;
    return null;
}

function _ppeCompliancePct(records, stats = _getPPEStats()) {
    const values = (records || []).map(_ppeRecordCompliancePct).filter(v => Number.isFinite(v));
    if (values.length) return values.reduce((a, b) => a + b, 0) / values.length;

    const aggregate = parseFloat(stats?.overall_pct);
    return Number.isFinite(aggregate) ? aggregate : null;
}

// Recomputes hero stat strip to match active month/year filter
function _updateHeroStats() {
    if (!_dataLoaded) return;
    const mo = _filterDashMonth;
    const SKEYS = ['T1_Score','T2_Score','T3_Score','T4_Score','T5_Score','T7_Score'];

    const filteredA = mo === 0 ? _assessments
        : _assessments.filter(a => a.AssessmentDate &&
            parseInt(String(a.AssessmentDate).substring(5,7),10) === mo);
    const filteredP = mo === 0 ? _ppeInspections
        : _ppeInspections.filter(r => {
            const d = r.InspectionDate || r.CreatedAt;
            return d && parseInt(String(d).substring(5,7),10) === mo;
        });

    const vals = SKEYS.flatMap(k => filteredA.filter(a => a[k] != null).map(a => parseFloat(a[k])));
    const avg  = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : null;
    const mat  = avg ? getMaturity(avg) : null;

    const ppePctVal = _ppeCompliancePct(filteredP, mo === 0 ? _getPPEStats() : {});
    const ppePct = ppePctVal != null ? ppePctVal.toFixed(1) + '%' : null;

    _setStatVal(0, mat ? mat.label : '—');
    _setStatVal(1, avg != null ? avg + '%' : '—');
    _setStatVal(2, ppePct ?? '—');
    _setStatVal(3, filteredP.length);
}

// ── Skeleton Loaders ───────────────────────────────────────────────────────
function _skRow(w='full', h=4) {
    return `<div class="bg-slate-200 rounded-lg animate-pulse" style="width:${w==='full'?'100%':w};height:${h * 4}px"></div>`;
}
function _skCard(rows = 2) {
    return `<div class="ds-section p-4 space-y-3">${Array.from({length: rows}, () => _skRow('full', 3)).join('')}</div>`;
}
function _buildSkeleton(tabId) {
    const kpiRow = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${Array.from({length:4},()=>`<div class="ds-metric-card p-4 flex items-center gap-3 animate-pulse">
            <div class="w-10 h-10 rounded-xl bg-slate-200 flex-shrink-0"></div>
            <div class="flex-1 space-y-2"><div class="h-6 bg-slate-200 rounded w-16"></div><div class="h-3 bg-slate-100 rounded w-24"></div></div>
        </div>`).join('')}
    </div>`;

    if (tabId === 'dashboard') return `
    <div class="space-y-5 animate-pulse">
        <div class="ds-filter-bar"><div class="h-8 bg-slate-200 rounded w-48"></div></div>
        ${kpiRow}
        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            ${Array.from({length:7},()=>`<div class="ds-metric-card p-4 h-24 bg-slate-200 rounded-xl"></div>`).join('')}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="ds-section p-5 h-72"><div class="h-4 bg-slate-200 rounded w-40 mb-4"></div><div class="h-56 bg-slate-100 rounded-xl"></div></div>
            <div class="ds-section p-5 h-72"><div class="h-4 bg-slate-200 rounded w-40 mb-4"></div><div class="h-56 bg-slate-100 rounded-xl"></div></div>
        </div>
        <div class="ds-section p-5 h-52"><div class="h-4 bg-slate-200 rounded w-40 mb-4"></div><div class="h-36 bg-slate-100 rounded-xl"></div></div>
    </div>`;

    if (tabId === 'assessment') return `
    <div class="space-y-4 animate-pulse">
        <div class="ds-section overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100"><div class="h-5 bg-slate-200 rounded w-48"></div></div>
            <div class="p-4 space-y-3">${Array.from({length:4},()=>`<div class="h-10 bg-slate-100 rounded-lg"></div>`).join('')}</div>
        </div>
        <div class="ds-section overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100"><div class="h-5 bg-slate-200 rounded w-40"></div></div>
            <div class="p-4 space-y-2">${Array.from({length:6},()=>`<div class="h-9 bg-slate-100 rounded-lg"></div>`).join('')}</div>
        </div>
    </div>`;

    if (tabId === 'ppe') return `
    <div class="space-y-4 animate-pulse">
        <div class="flex gap-2">${Array.from({length:3},()=>`<div class="h-9 w-24 bg-slate-200 rounded-lg"></div>`).join('')}</div>
        ${kpiRow}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="ds-section p-5 h-64"><div class="h-4 bg-slate-200 rounded w-32 mb-4"></div><div class="space-y-3">${Array.from({length:5},()=>`<div class="h-6 bg-slate-100 rounded"></div>`).join('')}</div></div>
            <div class="ds-section p-5 h-64"><div class="h-4 bg-slate-200 rounded w-32 mb-4"></div><div class="h-48 bg-slate-100 rounded-xl"></div></div>
        </div>
        <div class="ds-section overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100"><div class="h-5 bg-slate-200 rounded w-40"></div></div>
            <div class="p-4 space-y-2">${Array.from({length:5},()=>`<div class="h-9 bg-slate-100 rounded-lg"></div>`).join('')}</div>
        </div>
    </div>`;

    // principles (default)
    return `
    <div class="space-y-4 animate-pulse">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            ${Array.from({length:4},()=>`<div class="ds-metric-card p-3 flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-slate-200 flex-shrink-0"></div>
                <div class="flex-1 space-y-2"><div class="h-5 bg-slate-200 rounded w-16"></div><div class="h-3 bg-slate-100 rounded w-20"></div></div>
            </div>`).join('')}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            ${Array.from({length:8},()=>`<div class="ds-section overflow-hidden h-72">
                <div class="w-full h-44 bg-slate-200"></div>
                <div class="p-4 space-y-2"><div class="h-4 bg-slate-200 rounded w-3/4"></div><div class="h-3 bg-slate-100 rounded"></div><div class="h-3 bg-slate-100 rounded w-2/3"></div></div>
            </div>`).join('')}
        </div>
    </div>`;
}

// ── Render Panel ───────────────────────────────────────────────────────────
function destroyCharts() {
    [_radarChart, _barChart, _lineChart].forEach(c => { if (c) c.destroy(); });
    _radarChart = _barChart = _lineChart = null;
}

function renderPanel(id) {
    const panel = document.getElementById(`sc-panel-${id}`);
    if (!panel) return;
    // Show skeleton while data is still loading
    if (!_dataLoaded) { panel.innerHTML = _buildSkeleton(id); return; }
    destroyCharts();
    switch (id) {
        case 'principles': panel.innerHTML = buildPrinciplesHtml(); break;
        case 'assessment': panel.innerHTML = buildAssessmentHtml(); break;
        case 'ppe':        panel.innerHTML = buildPPEHtml();        break;
        case 'dashboard':
            panel.innerHTML = buildDashboardHtml();
            setTimeout(initCharts, 150);
            break;
    }
}

// ── Tab: Principles ────────────────────────────────────────────────────────
function campaignTypeOf(p = {}) {
    const hay = `${p.Title || ''} ${p.Description || ''} ${p.AttachmentName || ''}`.toLowerCase();
    if (hay.includes('activity') || hay.includes('กิจกรรม')) return 'activity';
    if (p.AttachmentUrl && !p.ImageUrl) return 'document';
    if (p.ImageUrl) return 'poster';
    return 'campaign';
}

function campaignTypeLabel(type) {
    return {
        poster: 'Poster',
        document: 'Document',
        activity: 'Activity',
        campaign: 'Campaign'
    }[type] || 'Campaign';
}

function campaignStatusOf(p = {}) {
    return (p.ImageUrl || p.AttachmentUrl) ? 'ready' : 'needs_asset';
}

function campaignStatusLabel(status) {
    return status === 'ready' ? 'พร้อมใช้' : 'รออัปเดตสื่อ';
}

function buildPrinciplesHtml() {
    const q = (_campaignSearch || '').trim().toLowerCase();
    const filteredPrinciples = _principles.filter(p => {
        const type = campaignTypeOf(p);
        const status = campaignStatusOf(p);
        const hay = `${p.Title || ''} ${p.Description || ''} ${p.AttachmentName || ''}`.toLowerCase();
        return (_campaignTypeFilter === 'all' || _campaignTypeFilter === type)
            && (_campaignStatusFilter === 'all' || _campaignStatusFilter === status)
            && (!q || hay.includes(q));
    });
    const featured = _principles.find(p => p.IsFeatured === 1 || p.IsFeatured === '1' || p.IsFeatured === true);

    const cards = filteredPrinciples.map(p => {
        const idx   = p.SortOrder - 1;
        const icon  = TOPIC_SVG[idx] || TOPIC_SVG[5];
        const isPPE = p.SortOrder === 6;
        const type = campaignTypeOf(p);
        const status = campaignStatusOf(p);
        const isFeatured = p.IsFeatured === 1 || p.IsFeatured === '1' || p.IsFeatured === true;
        return `
        <div class="ds-section overflow-hidden hover:shadow-md transition-shadow flex flex-col" data-sc-card-image="safety-culture-principle-${escHtml(p.SortOrder || p.PrincipleID || 'card')}">
            <button type="button" onclick="window._scPreviewCampaign('${escHtml(p.PrincipleID)}')" class="relative block text-left w-full group">
                ${p.ImageUrl
                    ? `<img src="${escHtml(safeResourceUrl(p.ImageUrl))}" alt="${escHtml(p.Title)}" class="w-full h-44 object-cover group-hover:opacity-90 transition-opacity">`
                    : `<div class="w-full h-44 flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#f0fdf4,#ecfdf5)">${icon}</div>`
                }
                <span class="absolute left-3 top-3 inline-flex items-center px-2.5 py-1 rounded-full bg-white/90 text-[10px] font-bold text-emerald-700 shadow-sm">${campaignTypeLabel(type)}</span>
                ${isFeatured ? `<span class="absolute right-3 top-3 inline-flex items-center px-2.5 py-1 rounded-full bg-amber-50/95 text-[10px] font-bold text-amber-700 border border-amber-100 shadow-sm">Featured</span>` : ''}
            </button>
            <div class="p-4 flex flex-col flex-1">
                <div class="flex items-start gap-2 mb-2">
                    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white flex-shrink-0 mt-0.5" style="background:linear-gradient(135deg,#059669,#0d9488)">${p.SortOrder}</span>
                    <h3 class="font-semibold text-slate-800 text-sm leading-snug flex-1">${escHtml(p.Title)}</h3>
                    ${_isAdmin ? `<button onclick="window._scEditPrinciple('${escHtml(p.PrincipleID)}')" class="flex-shrink-0 p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 transition-colors" title="แก้ไข"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>` : ''}
                </div>
                <p class="text-xs text-slate-500 leading-relaxed flex-1">${escHtml(p.Description)}</p>
                <div class="mt-3 flex items-center gap-2 flex-wrap">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${status === 'ready' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}">${campaignStatusLabel(status)}</span>
                    ${p.UpdatedAt ? `<span class="text-[10px] text-slate-400">Updated ${fmtDate(p.UpdatedAt)}</span>` : ''}
                </div>
                <div class="mt-3 flex flex-col gap-1.5">
                    ${p.AttachmentUrl ? `<a href="${escHtml(p.AttachmentUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline font-medium"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>${escHtml(p.AttachmentName || 'ดาวน์โหลดเอกสาร')}</a>` : ''}
                    ${isPPE ? `<button onclick="window._scSetTab('ppe')" class="text-left inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>ดู PPE Inspection Checklist →</button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    // KPI strip computed from loaded data
    const thisYear = _filterYear;
    const asmtThisYear = _assessments.filter(a => {
        const y = a.AssessmentDate ? String(a.AssessmentDate).substring(0,4) : String(a.AssessmentYear || '');
        return parseInt(y,10) === thisYear;
    });
    const SKEYS_P = ['T1_Score','T2_Score','T3_Score','T4_Score','T5_Score','T7_Score'];
    const allValsP = SKEYS_P.flatMap(k => asmtThisYear.filter(a => a[k] != null).map(a => parseFloat(a[k])));
    const overallAvgP = allValsP.length ? Math.round(allValsP.reduce((a,b)=>a+b,0)/allValsP.length) : null;
    const ppePassP = _ppeInspections.filter(r => {
        const y = (r.InspectionDate || r.CreatedAt || '').substring(0,4);
        return parseInt(y,10) === thisYear && (r.IsPass===1||r.IsPass==='1');
    }).length;
    const ppeTotalP = _ppeInspections.filter(r => {
        const y = (r.InspectionDate || r.CreatedAt || '').substring(0,4);
        return parseInt(y,10) === thisYear;
    }).length;
    const ppePctP = ppeTotalP > 0 ? Math.round(ppePassP/ppeTotalP*100) : null;
    const violTotalP = _ppeViolations.filter(v => {
        const y = (v.ViolationDate || '').substring(0,4);
        return parseInt(y,10) === thisYear;
    }).length;

    const matP = overallAvgP != null ? getMaturity(overallAvgP) : null;
    const kpiStrip = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="ds-metric-card p-4 flex items-center gap-3" data-sc-card-image="safety-culture-principles-average">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#059669,#0d9488)">
                <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            </div>
            <div>
                <p class="text-2xl font-bold ${overallAvgP!=null?(overallAvgP<70?'text-red-600':overallAvgP<90?'text-amber-600':'text-emerald-600'):'text-slate-300'}">${overallAvgP!=null?overallAvgP+'%':'—'}</p>
                <p class="text-xs text-slate-500">คะแนนเฉลี่ยปี ${thisYear}</p>
            </div>
        </div>
        <div class="ds-metric-card p-4 flex items-center gap-3" data-sc-card-image="safety-culture-principles-ppe">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50">
                <svg class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>
            </div>
            <div>
                <p class="text-2xl font-bold ${ppePctP!=null?(ppePctP<70?'text-red-600':ppePctP<90?'text-amber-600':'text-emerald-600'):'text-slate-300'}">${ppePctP!=null?ppePctP+'%':'—'}</p>
                <p class="text-xs text-slate-500">PPE ผ่านตรวจปี ${thisYear} (${ppeTotalP} ครั้ง)</p>
            </div>
        </div>
        <div class="ds-metric-card p-4 flex items-center gap-3" data-sc-card-image="safety-culture-principles-violations">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${violTotalP>0?'bg-red-50':'bg-emerald-50'}">
                <svg class="w-5 h-5 ${violTotalP>0?'text-red-500':'text-emerald-500'}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
            </div>
            <div>
                <p class="text-2xl font-bold ${violTotalP>0?'text-red-600':'text-emerald-600'}">${violTotalP}</p>
                <p class="text-xs text-slate-500">การฝ่าฝืน PPE ปี ${thisYear}</p>
            </div>
        </div>
        <div class="ds-metric-card p-4 flex items-center gap-3" data-sc-card-image="safety-culture-principles-maturity">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-purple-50">
                <svg class="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"/></svg>
            </div>
            <div>
                <p class="text-sm font-bold ${matP?matP.color:'text-slate-300'}">${matP?matP.label:'—'}</p>
                <p class="text-xs text-slate-500">Culture Maturity Level</p>
            </div>
        </div>
    </div>`;

    // Recent activity: last 3 assessments + last 3 PPE inspections
    const recentAsmts = [..._assessments]
        .filter(a => a.AssessmentDate)
        .sort((a,b) => new Date(b.AssessmentDate) - new Date(a.AssessmentDate))
        .slice(0,3);
    const recentPPE = [..._ppeInspections]
        .filter(r => r.InspectionDate || r.CreatedAt)
        .sort((a,b) => new Date(b.InspectionDate||b.CreatedAt) - new Date(a.InspectionDate||a.CreatedAt))
        .slice(0,3);

    const recentActivity = (recentAsmts.length || recentPPE.length) ? `
    <div class="ds-section p-5" data-sc-card-image="safety-culture-recent-activity">
        <h3 class="font-semibold text-slate-700 mb-4 text-sm flex items-center gap-2">
            <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            กิจกรรมล่าสุด
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">การประเมินล่าสุด</p>
                <div class="space-y-2">
                ${recentAsmts.length ? recentAsmts.map(a => {
                    const vals = ['T1_Score','T2_Score','T3_Score','T4_Score','T5_Score','T7_Score']
                        .filter(k => a[k] != null).map(k => parseFloat(a[k]));
                    const avg = vals.length ? Math.round(vals.reduce((x,y)=>x+y,0)/vals.length) : null;
                    const scoreBg = avg==null?'#e2e8f0':avg>=90?'#059669':avg>=70?'#d97706':'#ef4444';
                    const scoreCls = avg==null?'text-slate-400':avg>=90?'text-emerald-700':avg>=70?'text-amber-700':'text-red-700';
                    const scoreBadgeBg = avg==null?'bg-slate-100':avg>=90?'bg-emerald-100':avg>=70?'bg-amber-100':'bg-red-100';
                    return `<div class="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#059669,#0d9488)">
                            <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-semibold text-slate-800 truncate">${escHtml(a.AssessorName||'ไม่ระบุ')}</p>
                            <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <p class="text-xs text-slate-400">${fmtDate(a.AssessmentDate)}${a.WeekNo?` · W${a.WeekNo}`:''}</p>
                                ${a.Department?`<span class="inline-block px-1.5 py-0 rounded text-xs bg-slate-100 text-slate-500">${escHtml(a.Department)}</span>`:''}
                            </div>
                            ${avg!=null?`<div class="mt-1.5 bg-slate-100 rounded-full h-1.5"><div class="h-1.5 rounded-full transition-all" style="width:${avg}%;background:${scoreBg}"></div></div>`:''}
                        </div>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${scoreBadgeBg} ${scoreCls}">${avg!=null?avg+'%':'—'}</span>
                    </div>`;
                }).join('') : '<p class="text-xs text-slate-400 py-2">ยังไม่มีการประเมิน</p>'}
                </div>
            </div>
            <div>
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">การตรวจ PPE ล่าสุด</p>
                <div class="space-y-2">
                ${recentPPE.length ? recentPPE.map(r => {
                    const dateStr = fmtDate(r.InspectionDate || r.CreatedAt);
                    const isPass  = r.IsPass===1||r.IsPass==='1';
                    // Compute pass rate from details if available
                    let detailPct = null;
                    if (r.details && r.details.length > 0) {
                        const active = r.details.filter(d => d.Status !== 'na');
                        const ok     = active.filter(d => d.Status === 'compliant').length;
                        if (active.length > 0) detailPct = Math.round(ok / active.length * 100);
                    } else if (r.CompliancePct != null) {
                        detailPct = Math.round(parseFloat(r.CompliancePct));
                    }
                    const barColor = detailPct==null?'#e2e8f0':detailPct>=90?'#059669':detailPct>=70?'#d97706':'#ef4444';
                    return `<div class="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background:${isPass?'linear-gradient(135deg,#059669,#10b981)':'linear-gradient(135deg,#ef4444,#f87171)'}">
                            <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isPass?'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z':'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z'}"/></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-semibold text-slate-800 truncate">${escHtml(r.InspectedEmployeeName||r.EmployeeName||'ไม่ระบุ')}</p>
                            <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <p class="text-xs text-slate-400">${dateStr}</p>
                                ${r.Department?`<span class="inline-block px-1.5 py-0 rounded text-xs bg-slate-100 text-slate-500">${escHtml(r.Department)}</span>`:''}
                            </div>
                            ${detailPct!=null?`<div class="mt-1.5 bg-slate-100 rounded-full h-1.5"><div class="h-1.5 rounded-full transition-all" style="width:${detailPct}%;background:${barColor}"></div></div>`:''}
                        </div>
                        <div class="flex flex-col items-end gap-1 flex-shrink-0">
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${isPass?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700'}">
                                <span class="w-1.5 h-1.5 rounded-full inline-block ${isPass?'bg-emerald-400':'bg-red-400'}"></span>
                                ${isPass?'ผ่าน':'ไม่ผ่าน'}
                            </span>
                            ${detailPct!=null?`<span class="text-xs text-slate-400">${detailPct}%</span>`:''}
                        </div>
                    </div>`;
                }).join('') : '<p class="text-xs text-slate-400 py-2">ยังไม่มีการตรวจ PPE</p>'}
                </div>
            </div>
        </div>
    </div>` : '';

    return `
    <div class="space-y-5">
        ${kpiStrip}
        ${featured ? `<div class="ds-section overflow-hidden" data-sc-card-image="safety-culture-featured-campaign">
            <div class="grid grid-cols-1 lg:grid-cols-5">
                <button type="button" onclick="window._scPreviewCampaign('${escHtml(featured.PrincipleID)}')" class="lg:col-span-2 min-h-[220px] bg-emerald-50 flex items-center justify-center overflow-hidden">
                    ${featured.ImageUrl
                        ? `<img src="${escHtml(safeResourceUrl(featured.ImageUrl))}" alt="${escHtml(featured.Title)}" class="w-full h-full min-h-[220px] object-cover hover:scale-[1.02] transition-transform">`
                        : `<div class="w-full min-h-[220px] flex items-center justify-center" style="background:linear-gradient(135deg,#ecfdf5,#d1fae5)">${TOPIC_SVG[(featured.SortOrder || 1) - 1] || TOPIC_SVG[5]}</div>`}
                </button>
                <div class="lg:col-span-3 p-6 flex flex-col justify-center">
                    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold w-fit mb-3">
                        Featured Campaign
                    </div>
                    <h2 class="text-2xl font-black text-slate-800 leading-tight">${escHtml(featured.Title)}</h2>
                    <p class="mt-3 text-sm text-slate-500 leading-relaxed">${escHtml(featured.Description || '')}</p>
                    <div class="mt-5 flex flex-wrap gap-2">
                        <button type="button" onclick="window._scPreviewCampaign('${escHtml(featured.PrincipleID)}')" class="btn btn-primary px-4 py-2 text-sm">Preview Campaign</button>
                        ${featured.AttachmentUrl ? `<a href="${escHtml(featured.AttachmentUrl)}" target="_blank" rel="noopener" class="btn btn-secondary px-4 py-2 text-sm">Open Document</a>` : ''}
                    </div>
                </div>
            </div>
        </div>` : ''}
        <div class="ds-section p-5" data-sc-card-image="safety-culture-campaign-library">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
                <div>
                    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold mb-3">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5"/></svg>
                        Campaign Library
                    </div>
                    <h2 class="text-lg font-bold text-slate-800">สื่อรณรงค์และกิจกรรมความปลอดภัย</h2>
                    <p class="text-sm text-slate-500 mt-1">ใช้เป็นพื้นที่โชว์โปสเตอร์ เอกสารแนบ และกิจกรรมสื่อสารที่เกี่ยวข้องกับ Safety Culture</p>
                </div>
                <div class="grid grid-cols-2 gap-3 min-w-[260px]">
                    <div class="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Published Items</p>
                        <p class="text-xl font-black text-slate-800 mt-1">${_principles.length}</p>
                    </div>
                    <div class="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                        <p class="text-[10px] font-bold uppercase text-emerald-600">Current Year</p>
                        <p class="text-xl font-black text-emerald-700 mt-1">${thisYear}</p>
                    </div>
                </div>
            </div>
            <div class="mb-5 flex flex-col xl:flex-row xl:items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3">
                <div class="flex flex-col sm:flex-row gap-2 flex-1 min-w-0">
                <select class="form-input h-9 w-full sm:w-40 text-xs" onchange="window._scSetCampaignType(this.value)">
                    <option value="all" ${_campaignTypeFilter === 'all' ? 'selected' : ''}>ทุกหมวดหมู่</option>
                    <option value="poster" ${_campaignTypeFilter === 'poster' ? 'selected' : ''}>Poster</option>
                    <option value="document" ${_campaignTypeFilter === 'document' ? 'selected' : ''}>Document</option>
                    <option value="activity" ${_campaignTypeFilter === 'activity' ? 'selected' : ''}>Activity</option>
                    <option value="campaign" ${_campaignTypeFilter === 'campaign' ? 'selected' : ''}>Campaign</option>
                </select>
                <select class="form-input h-9 w-full sm:w-40 text-xs" onchange="window._scSetCampaignStatus(this.value)">
                    <option value="all" ${_campaignStatusFilter === 'all' ? 'selected' : ''}>ทุกสถานะ</option>
                    <option value="ready" ${_campaignStatusFilter === 'ready' ? 'selected' : ''}>พร้อมใช้</option>
                    <option value="needs_asset" ${_campaignStatusFilter === 'needs_asset' ? 'selected' : ''}>รออัปเดตสื่อ</option>
                </select>
                <div class="relative flex-1 min-w-[220px]">
                    <svg class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z"/></svg>
                    <input class="form-input h-9 w-full text-xs pl-9" value="${escHtml(_campaignSearch)}" oninput="window._scSetCampaignSearch(this.value)" placeholder="ค้นหาโปสเตอร์ / กิจกรรม / เอกสาร...">
                </div>
                </div>
                <div class="flex items-center justify-between xl:justify-end gap-3">
                    <span class="text-xs font-semibold text-slate-500 whitespace-nowrap">${filteredPrinciples.length}/${_principles.length} รายการ</span>
                    <button type="button" onclick="window._scClearCampaignFilters()" class="btn btn-secondary h-9 px-3 text-xs">ล้าง</button>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                ${cards || '<p class="col-span-full text-center py-12 text-slate-400">ไม่พบข้อมูล</p>'}
            </div>
        </div>
        ${recentActivity}
    </div>`;
}

function previewCampaign(id) {
    const p = _principles.find(x => x.PrincipleID === id);
    if (!p) return;
    const type = campaignTypeOf(p);
    const status = campaignStatusOf(p);
    const idx = (p.SortOrder || 1) - 1;
    openModal('รายละเอียดสื่อรณรงค์', `
    <div class="space-y-5">
        <div class="rounded-2xl overflow-hidden border border-slate-100 bg-slate-50">
            ${p.ImageUrl
                ? `<img src="${escHtml(safeResourceUrl(p.ImageUrl))}" alt="${escHtml(p.Title)}" class="w-full max-h-[62vh] object-contain bg-white">`
                : `<div class="w-full h-72 flex items-center justify-center" style="background:linear-gradient(135deg,#ecfdf5,#d1fae5)">${TOPIC_SVG[idx] || TOPIC_SVG[5]}</div>`}
        </div>
        <div class="flex flex-wrap items-center gap-2">
            <span class="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-bold">${campaignTypeLabel(type)}</span>
            <span class="inline-flex items-center px-3 py-1 rounded-full ${status === 'ready' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'} text-xs font-bold">${campaignStatusLabel(status)}</span>
            ${p.UpdatedAt ? `<span class="text-xs text-slate-400">Updated ${fmtDate(p.UpdatedAt)}</span>` : ''}
        </div>
        <div>
            <h2 class="text-xl font-black text-slate-800 leading-snug">${escHtml(p.Title)}</h2>
            <p class="mt-3 text-sm text-slate-600 leading-relaxed whitespace-pre-line">${escHtml(p.Description || '')}</p>
        </div>
        <div class="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
            ${p.AttachmentUrl ? `<a href="${escHtml(p.AttachmentUrl)}" target="_blank" rel="noopener" class="btn btn-primary px-4 py-2 text-sm">เปิดเอกสารแนบ</a>` : ''}
            ${p.ImageUrl ? `<a href="${escHtml(p.ImageUrl)}" target="_blank" rel="noopener" class="btn btn-secondary px-4 py-2 text-sm">เปิดรูปเต็ม</a>` : ''}
            ${_isAdmin ? `<button type="button" onclick="window.closeModal();setTimeout(()=>window._scEditPrinciple('${escHtml(p.PrincipleID)}'),80)" class="btn btn-secondary px-4 py-2 text-sm">แก้ไขข้อมูล</button>` : ''}
        </div>
    </div>`, 'max-w-5xl');
}

// ── Tab: Assessment ────────────────────────────────────────────────────────
function _assessmentRecordsForFilter() {
    return _assessments.filter(a => {
        if (_asmtFilterMonth) {
            if (!a.AssessmentDate || parseInt(String(a.AssessmentDate).substring(5, 7), 10) !== _asmtFilterMonth) return false;
        }
        if (_asmtFilterArea && String(a.Area || '').trim() !== _asmtFilterArea) return false;
        if (_asmtFilterWeek && parseInt(a.WeekNo, 10) !== _asmtFilterWeek) return false;
        return true;
    });
}

function _assessmentAvg(records, key) {
    const vals = (records || []).map(r => r?.[key]).filter(v => v != null).map(v => parseFloat(v)).filter(Number.isFinite);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function _assessmentOverall(records) {
    const vals = (records || []).map(r => {
        const row = ['T1_Score','T2_Score','T3_Score','T4_Score','T5_Score','T7_Score']
            .map(k => r?.[k]).filter(v => v != null).map(v => parseFloat(v)).filter(Number.isFinite);
        return row.length ? row.reduce((a, b) => a + b, 0) / row.length : null;
    }).filter(v => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function _assessmentTopicStats(records) {
    const keys = ['T1_Score','T2_Score','T3_Score','T4_Score','T5_Score','T7_Score'];
    const codes = ['T1','T2','T3','T4','T5','T7'];
    const labels = ['Walk Way','ไม่ใช้โทรศัพท์','ข้ามทางม้าลาย','หยุดยืนชี้นิ้ว','ไม่ล้วงกระเป๋า','แยกขยะ'];
    return keys.map((key, i) => ({ key, code: codes[i], label: labels[i], avg: _assessmentAvg(records, key) }));
}

function _asmtScoreBadge(v) {
    if (v == null) return `<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 text-xs font-bold">—</span>`;
    const n = Math.round(parseFloat(v));
    const cls = n >= 90 ? 'bg-emerald-100 text-emerald-700' : n >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full ${cls} text-xs font-bold">${n}%</span>`;
}

function buildAssessmentInsight(records) {
    const overall = _assessmentOverall(records);
    const topics = _assessmentTopicStats(records).filter(t => t.avg !== null);
    const best = topics.length ? topics.reduce((a, b) => b.avg > a.avg ? b : a) : null;
    const worst = topics.length ? topics.reduce((a, b) => b.avg < a.avg ? b : a) : null;
    const lowCount = topics.filter(t => t.avg < 70).length;
    const mat = overall != null ? getMaturity(overall) : null;
    const monthText = _asmtFilterMonth ? (TH_MONTHS_FULL?.[_asmtFilterMonth] || `เดือน ${_asmtFilterMonth}`) : 'ทั้งปี';
    const period = `${monthText} ${_filterYear}`;
    const insightText = !records.length
        ? 'ยังไม่มีข้อมูลตามตัวกรองนี้'
        : worst && worst.avg < 70
            ? `${worst.code} ${worst.label} ต่ำกว่าเกณฑ์ ควรติดตามเป็นลำดับแรก`
            : lowCount
                ? `มี ${lowCount} หัวข้อที่ต้องติดตามใกล้ชิด`
                : 'คะแนนโดยรวมอยู่ในระดับที่ควรรักษามาตรฐานต่อเนื่อง';
    return `
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div class="ds-metric-card p-4 lg:col-span-2 border-l-4 ${mat ? mat.border : 'border-slate-200'}" data-sc-card-image="safety-culture-assessment-insight">
            <p class="text-xs font-bold uppercase text-slate-400">Assessment Insight</p>
            <div class="mt-2 flex items-center gap-3 flex-wrap">
                <span class="text-3xl font-black ${overall != null ? scoreColor(overall) : 'text-slate-300'}">${overall != null ? Math.round(overall) + '%' : '—'}</span>
                ${mat ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${mat.bg} ${mat.color}"><span class="w-1.5 h-1.5 rounded-full ${mat.dot}"></span>${mat.label}</span>` : ''}
            </div>
            <p class="text-sm text-slate-600 mt-2">${escHtml(insightText)}</p>
            <p class="text-xs text-slate-400 mt-1">${escHtml(period)} · ${records.length}/${_assessments.length} รายการ</p>
        </div>
        <div class="ds-metric-card p-4" data-sc-card-image="safety-culture-assessment-best-topic">
            <p class="text-xs font-bold uppercase text-emerald-600">Best Topic</p>
            <p class="mt-2 text-sm font-black text-slate-800 truncate">${best ? `${best.code} ${escHtml(best.label)}` : '—'}</p>
            <div class="mt-2">${_asmtScoreBadge(best?.avg)}</div>
        </div>
        <div class="ds-metric-card p-4" data-sc-card-image="safety-culture-assessment-focus-topic">
            <p class="text-xs font-bold uppercase ${worst && worst.avg < 70 ? 'text-red-600' : 'text-amber-600'}">Focus Topic</p>
            <p class="mt-2 text-sm font-black text-slate-800 truncate">${worst ? `${worst.code} ${escHtml(worst.label)}` : '—'}</p>
            <div class="mt-2">${_asmtScoreBadge(worst?.avg)}</div>
        </div>
    </div>`;
}

function buildAssessmentFilterBar(records) {
    const monthLabels = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const areas = [...new Set(_assessments.map(a => String(a.Area || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
    return `
    <div class="ds-filter-bar flex flex-col xl:flex-row xl:items-center gap-3">
        <div class="flex flex-col sm:flex-row gap-2 flex-1 min-w-0">
            <select onchange="window._scSetAsmtMonth(this.value)" class="form-input h-9 text-xs w-full sm:w-40">
                <option value="0" ${_asmtFilterMonth === 0 ? 'selected' : ''}>ทุกเดือน</option>
                ${monthLabels.slice(1).map((m, i) => `<option value="${i + 1}" ${_asmtFilterMonth === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
            <select onchange="window._scSetAsmtWeek(this.value)" class="form-input h-9 text-xs w-full sm:w-36">
                <option value="0" ${_asmtFilterWeek === 0 ? 'selected' : ''}>ทุกสัปดาห์</option>
                ${[1,2,3,4].map(w => `<option value="${w}" ${_asmtFilterWeek === w ? 'selected' : ''}>W${w}</option>`).join('')}
            </select>
            <select onchange="window._scSetAsmtArea(this.value)" class="form-input h-9 text-xs w-full sm:min-w-56">
                <option value="" ${!_asmtFilterArea ? 'selected' : ''}>ทุกพื้นที่</option>
                ${areas.map(area => `<option value="${escHtml(area)}" ${_asmtFilterArea === area ? 'selected' : ''}>${escHtml(area)}</option>`).join('')}
            </select>
        </div>
        <div class="flex items-center justify-between xl:justify-end gap-3">
            <span class="text-xs font-semibold text-slate-500 whitespace-nowrap">${records.length}/${_assessments.length} รายการ</span>
            <button type="button" onclick="window._scClearAsmtFilters()" class="btn btn-secondary h-9 px-3 text-xs">ล้าง</button>
        </div>
    </div>`;
}

function buildAssessmentHeatmap(records) {
    const monthLabels = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const topics = [
        { key:'T1_Score', code:'T1', label:'Walk Way' },
        { key:'T2_Score', code:'T2', label:'No Phone' },
        { key:'T3_Score', code:'T3', label:'Crosswalk' },
        { key:'T4_Score', code:'T4', label:'Point&Call' },
        { key:'T5_Score', code:'T5', label:'Hands-Free' },
        { key:'T7_Score', code:'T7', label:'Waste Sort' },
    ];
    const cell = (v) => {
        if (v == null) return `<td class="px-2 py-2 text-center text-xs text-slate-300 bg-slate-50">—</td>`;
        const n = Math.round(v);
        const cls = n >= 90 ? 'bg-emerald-50 text-emerald-700' : n >= 70 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700';
        return `<td class="px-2 py-2 text-center text-xs font-black ${cls}">${n}%</td>`;
    };
    const rows = Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
        const entries = records.filter(a => a.AssessmentDate && parseInt(String(a.AssessmentDate).substring(5, 7), 10) === m);
        const vals = topics.map(t => _assessmentAvg(entries, t.key));
        const overall = _assessmentOverall(entries);
        return `<tr class="border-b border-slate-100">
            <td class="px-4 py-2 text-xs font-bold text-slate-600 whitespace-nowrap">${monthLabels[m]}</td>
            ${vals.map(cell).join('')}
            ${cell(overall)}
        </tr>`;
    }).join('');
    return `
    <div class="ds-section overflow-hidden" data-sc-card-image="safety-culture-assessment-heatmap">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
                <h3 class="font-semibold text-slate-700">Assessment Heatmap</h3>
                <p class="text-xs text-slate-400 mt-0.5">เดือน × หัวข้อ ใช้สีแดง/เหลือง/เขียวสำหรับ Monthly Review</p>
            </div>
            <span class="text-xs text-slate-400 whitespace-nowrap">แดง &lt;70 · เหลือง 70-89 · เขียว ≥90</span>
        </div>
        <div class="overflow-x-auto">
            <table class="ds-table text-sm">
                <thead class="bg-slate-50">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">เดือน</th>
                        ${topics.map(t => `<th class="px-2 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="${escHtml(t.label)}">${t.code}</th>`).join('')}
                        <th class="px-2 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Avg</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

function buildAssessmentNotes(records) {
    const notes = records
        .filter(a => String(a.Notes || '').trim())
        .sort((a, b) => String(b.AssessmentDate || '').localeCompare(String(a.AssessmentDate || '')))
        .slice(0, 5);
    if (!notes.length) return '';
    return `
    <div class="ds-section overflow-hidden" data-sc-card-image="safety-culture-assessment-notes">
        <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="font-semibold text-slate-700">Follow-up Notes</h3>
            <p class="text-xs text-slate-400 mt-0.5">ดึงจากช่อง Notes เดิมของผลการประเมิน</p>
        </div>
        <div class="divide-y divide-slate-100">
            ${notes.map(a => {
                const avg = _assessmentOverall([a]);
                return `<div class="px-5 py-3 flex items-start gap-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${avg != null && avg < 70 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'} text-xs font-black">${avg != null ? Math.round(avg) : '—'}</div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <p class="text-sm font-bold text-slate-800">${a.AssessmentDate ? fmtDate(a.AssessmentDate) : escHtml(a.AssessmentYear || '-')}</p>
                            ${a.WeekNo ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">W${a.WeekNo}</span>` : ''}
                            <span class="text-xs text-slate-400">${escHtml(a.Area || '-')}</span>
                        </div>
                        <p class="text-sm text-slate-600 mt-1 leading-relaxed">${escHtml(a.Notes || '')}</p>
                    </div>
                </div>`;
            }).join('')}
        </div>
    </div>`;
}

function buildMonthlyAssessmentSummary(records = _assessments) {
    if (!records.length) return '';
    const monthMap = {};
    records.forEach(a => {
        const key = a.AssessmentDate
            ? String(a.AssessmentDate).substring(0, 7)
            : `${a.AssessmentYear}-00`;
        if (!monthMap[key]) monthMap[key] = [];
        monthMap[key].push(a);
    });
    const months = Object.keys(monthMap).sort().reverse();
    const SKEYS = ['T1_Score','T2_Score','T3_Score','T4_Score','T5_Score','T7_Score'];
    const SLBLS = ['T1','T2','T3','T4','T5','T7'];
    const cardAttr = 'data-sc-card-image="safety-culture-assessment-monthly-summary"';

    const scoreCell = (p) => {
        if (p === null) return `<td class="px-2 py-2 text-center text-xs text-slate-300">—</td>`;
        const c = p < 70 ? 'text-red-600 font-bold' : p < 90 ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-semibold';
        const s = p < 70 ? ' style="background:rgba(254,242,242,0.6)"' : '';
        return `<td class="px-2 py-2 text-center text-xs ${c}"${s}>${Math.round(p)}%</td>`;
    };

    const rows = months.map(m => {
        const entries = monthMap[m];
        const [y, mo] = m.split('-');
        const mLabel = mo === '00'
            ? `ปี ${y}`
            : new Date(parseInt(y), parseInt(mo)-1, 1).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' });

        // Group by WeekNo (W1–W4) within this month
        const weekMap = { 1: [], 2: [], 3: [], 4: [] };
        const noWeek  = [];
        entries.forEach(a => {
            const wn = parseInt(a.WeekNo);
            if (wn >= 1 && wn <= 4) weekMap[wn].push(a);
            else noWeek.push(a);
        });
        const hasWeeks = Object.values(weekMap).some(w => w.length > 0);

        if (hasWeeks) {
            // W1–W4 per-topic sub-rows
            const topicRows = SKEYS.map((k, ki) => {
                const wCells = [1,2,3,4].map(wn => {
                    const wEntries = weekMap[wn];
                    if (!wEntries.length) return `<td class="px-2 py-2 text-center text-xs text-slate-200">—</td>`;
                    const vals = wEntries.map(e => e[k]).filter(v => v != null).map(v => parseFloat(v));
                    const p = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
                    return scoreCell(p);
                });
                const allVals = entries.map(e => e[k]).filter(v => v != null).map(v => parseFloat(v));
                const monthAvg = allVals.length ? allVals.reduce((a,b)=>a+b,0)/allVals.length : null;
                return `<tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-2 text-xs text-slate-500 font-medium pl-8" colspan="2">${SLBLS[ki]}</td>
                    ${wCells.join('')}
                    ${scoreCell(monthAvg)}
                </tr>`;
            });
            const avgRow_t = SKEYS.map(k => {
                const vals = entries.map(e => e[k]).filter(v => v != null).map(v => parseFloat(v));
                return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
            });
            const validAvg = avgRow_t.filter(v => v !== null);
            const overall = validAvg.length ? validAvg.reduce((a,b)=>a+b,0)/validAvg.length : null;
            return `
            <tr class="bg-slate-50 border-b border-slate-200">
                <td class="px-4 py-2.5 text-sm font-semibold text-slate-800 whitespace-nowrap" colspan="2">${mLabel} <span class="text-xs text-slate-400 font-normal">(${entries.length} สัปดาห์)</span></td>
                <td class="px-2 py-2 text-center text-xs text-slate-400">W1</td>
                <td class="px-2 py-2 text-center text-xs text-slate-400">W2</td>
                <td class="px-2 py-2 text-center text-xs text-slate-400">W3</td>
                <td class="px-2 py-2 text-center text-xs text-slate-400">W4</td>
                <td class="px-4 py-2.5 text-center">${overall !== null ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${overall>=90?'bg-emerald-100 text-emerald-700':overall>=70?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}">${Math.round(overall)}%</span>` : '—'}</td>
            </tr>
            ${topicRows.join('')}`;
        } else {
            // Legacy rows without WeekNo
            const pcts = SKEYS.map(k => {
                const vals = entries.map(e => e[k]).filter(v => v != null).map(v => parseFloat(v));
                return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
            });
            const validPcts = pcts.filter(p => p !== null);
            const overall = validPcts.length ? validPcts.reduce((a,b)=>a+b,0)/validPcts.length : null;
            return `<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">${mLabel}</td>
                <td class="px-3 py-3 text-center text-xs text-slate-500">${entries.length}</td>
                ${pcts.map(scoreCell).join('')}
                <td class="px-4 py-3 text-center">${overall !== null ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${overall>=90?'bg-emerald-100 text-emerald-700':overall>=70?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}">${Math.round(overall)}%</span>` : '—'}</td>
            </tr>`;
        }
    }).join('');

    return `
    <div class="ds-section overflow-hidden" ${cardAttr}>
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-semibold text-slate-700">สรุปรายเดือน ปี ${_filterYear}</h3>
            <span class="text-xs text-slate-400">${months.length} เดือน · คะแนน 0–100%</span>
        </div>
        <div class="overflow-x-auto">
            <table class="ds-table text-sm">
                <thead class="bg-slate-50">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase" colspan="2">เดือน / หัวข้อ</th>
                        <th class="px-2 py-3 text-center text-xs font-semibold text-slate-500 uppercase" colspan="4">สัปดาห์</th>
                        <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">รวม</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p class="px-5 py-2 text-xs text-slate-400 border-t border-slate-50">สีแดง = &lt;70% | สีเหลือง = 70–89% | สีเขียว = ≥90%</p>
    </div>`;
}

const ASSESSMENT_TOPIC_META = [
    { key: 'T1', label: 'เดินบน Walk Way', group: 'walkway' },
    { key: 'T2', label: 'ไม่ใช้โทรศัพท์ขณะเดิน', group: 'walkway' },
    { key: 'T3', label: 'ข้ามถนนทางม้าลาย', group: 'walkway' },
    { key: 'T4', label: 'หยุดยืนชี้นิ้ว', group: 'walkway' },
    { key: 'T5', label: 'ไม่ล้วงกระเป๋า', group: 'walkway' },
    { key: 'T7', label: 'แยกขยะถูกต้อง', group: 'waste' },
];

function assessmentLocationSummary(a = {}) {
    const points = Array.isArray(a.points) ? a.points : [];
    const names = [...new Set(points.map(p => String(p.LocationName || '').trim()).filter(Boolean))];
    const pointNos = [...new Set(points.map(p => `${p.TopicKey || ''}:${p.PointNo || ''}`).filter(Boolean))];
    return {
        locationCount: names.length,
        pointCount: pointNos.length,
        names,
        label: names.length ? names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '') : (a.Area || 'ไม่ระบุ'),
    };
}

function assessmentPointPct(pt = {}) {
    const total = parseInt(pt.TotalPeople, 10) || 0;
    const comply = parseInt(pt.ComplyPeople, 10) || 0;
    if (pt.Pct != null && pt.Pct !== '') return parseFloat(pt.Pct);
    return total > 0 ? (comply / total) * 100 : null;
}

function assessmentLocationStats(records = []) {
    const topicLookup = Object.fromEntries(ASSESSMENT_TOPIC_META.map(t => [t.key, t]));
    const map = {};
    records.forEach(a => {
        const points = Array.isArray(a.points) ? a.points : [];
        points.forEach(pt => {
            const name = String(pt.LocationName || '').trim();
            if (!name) return;
            const key = pt.LocationID || name;
            if (!map[key]) {
                map[key] = {
                    key,
                    name,
                    total: 0,
                    comply: 0,
                    checks: 0,
                    topicSet: new Set(),
                    lowTopics: {},
                    dates: new Set(),
                };
            }
            const row = map[key];
            const total = parseInt(pt.TotalPeople, 10) || 0;
            const comply = parseInt(pt.ComplyPeople, 10) || 0;
            row.total += total;
            row.comply += comply;
            row.checks++;
            if (a.AssessmentDate) row.dates.add(String(a.AssessmentDate).substring(0, 10));
            const topicKey = pt.TopicKey || '';
            if (topicKey) row.topicSet.add(topicKey);
            const pct = assessmentPointPct(pt);
            if (pct !== null && pct < 70) {
                const label = topicLookup[topicKey]?.label || topicKey || '-';
                row.lowTopics[topicKey || label] = { key: topicKey, label, pct };
            }
        });
    });
    return Object.values(map).map(row => ({
        ...row,
        pct: row.total > 0 ? Math.round(row.comply / row.total * 100) : null,
        topics: Array.from(row.topicSet),
        lowTopicList: Object.values(row.lowTopics).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)),
        dates: Array.from(row.dates).sort(),
    })).sort((a, b) => {
        if (a.pct === null && b.pct !== null) return 1;
        if (a.pct !== null && b.pct === null) return -1;
        if ((a.pct ?? 101) !== (b.pct ?? 101)) return (a.pct ?? 101) - (b.pct ?? 101);
        return b.checks - a.checks;
    });
}

function buildAssessmentLocationFocus(records = [], options = {}) {
    const stats = assessmentLocationStats(records);
    const limit = options.limit || 6;
    const rows = stats.slice(0, limit).map((loc, idx) => {
        const pct = loc.pct;
        const bar = pct === null ? 0 : Math.max(0, Math.min(100, pct));
        const tone = pct === null ? 'slate' : pct >= 90 ? 'emerald' : pct >= 70 ? 'amber' : 'red';
        const color = tone === 'emerald' ? '#059669' : tone === 'amber' ? '#d97706' : tone === 'red' ? '#ef4444' : '#94a3b8';
        const badge = tone === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : tone === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-100'
            : tone === 'red' ? 'bg-red-50 text-red-700 border-red-100'
            : 'bg-slate-50 text-slate-600 border-slate-100';
        const low = loc.lowTopicList.slice(0, 2).map(t => t.key || t.label).join(', ');
        return `
        <div class="rounded-xl border border-slate-100 bg-white px-4 py-3">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-sm font-bold text-slate-800 truncate">${idx + 1}. ${escHtml(loc.name)}</p>
                    <p class="text-[11px] text-slate-400 mt-0.5">${loc.checks} point rows · ${loc.total} people${low ? ` · Focus: ${escHtml(low)}` : ''}</p>
                </div>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-black ${badge}">${pct === null ? '-' : pct + '%'}</span>
            </div>
            <div class="mt-3 flex items-center gap-2">
                <div class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-2 rounded-full" style="width:${bar}%;background:${color}"></div>
                </div>
                <span class="text-[11px] font-semibold text-slate-400">${loc.comply}/${loc.total}</span>
            </div>
        </div>`;
    }).join('');
    return `
    <div class="ds-section p-5" data-sc-card-image="safety-culture-assessment-location-followup">
        <div class="flex items-start justify-between gap-3 mb-4">
            <div>
                <h3 class="font-semibold text-slate-700">${escHtml(options.title || 'Location Follow-up')}</h3>
                <p class="text-xs text-slate-400 mt-1">${escHtml(options.subtitle || 'Lowest assessment points from saved location rows')}</p>
            </div>
            <span class="text-xs font-semibold text-slate-400">${stats.length} locations</span>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
            ${rows || `<div class="lg:col-span-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">No location-level assessment data yet.</div>`}
        </div>
    </div>`;
}

function buildAssessmentHtml() {
    const filteredAssessments = _assessmentRecordsForFilter()
        .sort((a, b) => String(b.AssessmentDate || '').localeCompare(String(a.AssessmentDate || '')));
    const rows = filteredAssessments.map(a => {
        const vals = [a.T1_Score, a.T2_Score, a.T3_Score, a.T4_Score, a.T5_Score, a.T7_Score].filter(v => v != null);
        const avg  = vals.length ? (vals.reduce((s, v) => s + parseFloat(v), 0) / vals.length) : null;
        const mat  = avg != null ? getMaturity(avg) : null;
        const scoreCell = (v) => {
            const n = v != null ? parseFloat(v) : null;
            return `<td class="px-3 py-2.5 text-center text-xs ${scoreColor(n)}"${n != null && n < 70 ? ' style="background:rgba(254,242,242,0.6)"' : ''}>${n != null ? Math.round(n)+'%' : '-'}</td>`;
        };
        const dateLabel = a.AssessmentDate ? fmtDate(a.AssessmentDate) : a.AssessmentYear;
        const weekLabel = a.WeekNo ? `<span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">W${a.WeekNo}</span>` : '';
        const locSummary = assessmentLocationSummary(a);
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-2.5 text-sm font-medium text-slate-800 whitespace-nowrap">${dateLabel}${weekLabel}</td>
            <td class="px-4 py-2.5 text-sm text-slate-600">${escHtml(a.Area)}</td>
            <td class="px-4 py-2.5 text-xs text-slate-500 max-w-60">
                <button type="button" onclick="window._scViewAssessment('${a.AssessmentID}')" class="text-left hover:text-emerald-700 hover:underline">
                    <span class="block font-semibold text-slate-700 truncate">${escHtml(locSummary.label)}</span>
                    <span class="block text-[11px] text-slate-400">${locSummary.locationCount || locSummary.pointCount || 0} จุดตรวจ</span>
                </button>
            </td>
            ${scoreCell(a.T1_Score)}${scoreCell(a.T2_Score)}${scoreCell(a.T3_Score)}${scoreCell(a.T4_Score)}${scoreCell(a.T5_Score)}
            <td class="px-3 py-2.5 text-center text-xs text-slate-400 italic">PPE*</td>
            ${scoreCell(a.T7_Score)}
            <td class="px-4 py-2.5 text-center">${avg != null ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${mat.bg} ${mat.color}">${Math.round(avg)}%</span>` : '-'}</td>
            <td class="px-4 py-2.5 text-center text-xs">${mat ? `<span class="inline-flex items-center gap-1.5 font-semibold ${mat.color}"><span class="w-1.5 h-1.5 rounded-full inline-block ${mat.dot}"></span>${mat.label}</span>` : '-'}</td>
            <td class="px-4 py-2.5 text-xs text-slate-500 max-w-56 truncate" title="${escHtml(a.Notes || '')}">${a.Notes ? escHtml(a.Notes) : '<span class="text-slate-300">—</span>'}</td>
            ${_isAdmin ? `<td class="px-4 py-2.5 whitespace-nowrap">
                <button onclick="window._scViewAssessment('${a.AssessmentID}')" class="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="รายละเอียด"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button>
                <button onclick="window._scEditAssessment('${a.AssessmentID}')" class="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 transition-colors" title="แก้ไข"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                <button onclick="window._scDeleteAssessment('${a.AssessmentID}')" class="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="ลบ"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
            </td>` : ''}
        </tr>`;
    }).join('');

    const colCount = _isAdmin ? 14 : 13;
    return `
    <div class="space-y-4">
        ${_isAdmin ? buildAssessmentLocationsAdmin() : ''}
        ${buildAssessmentInsight(filteredAssessments)}
        ${buildAssessmentFilterBar(filteredAssessments)}
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
            ${buildMonthlyAssessmentSummary(filteredAssessments)}
            ${buildAssessmentHeatmap(filteredAssessments)}
        </div>
        ${buildAssessmentLocationFocus(filteredAssessments, {
            title: 'Assessment Location Follow-up',
            subtitle: 'จุดตรวจที่ควรติดตามจากข้อมูลรายจุดในตัวกรองปัจจุบัน',
        })}
        <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex gap-2">
                <button onclick="window._scExportAssessmentPDF('yearly')"
                    class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 transition-all">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    Export PDF รายปี
                </button>
                <button onclick="window._scExportAssessmentPDF('monthly')"
                    class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-emerald-700 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 transition-all">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    Export PDF รายเดือน
                </button>
            </div>
            ${_isAdmin ? `<button onclick="window._scAddAssessment()" class="btn btn-primary px-5 flex items-center gap-2"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>บันทึกผลการประเมิน</button>` : ''}
        </div>
        <div class="ds-section overflow-hidden" data-sc-card-image="safety-culture-assessment-history">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="font-semibold text-slate-700">ประวัติการประเมิน ปี ${_filterYear}</h3>
                <span class="text-xs text-slate-400">${filteredAssessments.length}/${_assessments.length} รายการ</span>
            </div>
            <div class="overflow-x-auto">
                <table class="ds-table text-sm">
                    <thead class="bg-slate-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">วันที่</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">พื้นที่</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">จุดตรวจ</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="เดินบน Walk Way">T1</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="ไม่ใช้โทรศัพท์">T2</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="ข้ามถนนทางม้าลาย">T3</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="หยุดชี้นิ้ว">T4</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="ไม่ล้วงกระเป๋า">T5</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="PPE Control">T6</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="แยกขยะ">T7</th>
                            <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">เฉลี่ย</th>
                            <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">ระดับ</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Follow-up Note</th>
                            ${_isAdmin ? '<th class="px-4 py-3"></th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan="${colCount}" class="text-center py-12 text-slate-400">ไม่พบผลการประเมินตามตัวกรองนี้ — ลองล้างตัวกรองหรือเปลี่ยนเดือน/พื้นที่/สัปดาห์</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
        ${buildAssessmentNotes(filteredAssessments)}
        <p class="text-xs text-slate-400">* T6 (PPE Control) คำนวณจาก PPE Inspection Checklist แยกต่างหาก</p>
        <div class="ds-section p-4" data-sc-card-image="safety-culture-assessment-maturity-guide">
            <h4 class="text-sm font-semibold text-slate-700 mb-3">Culture Maturity Level — คำอธิบายระดับ</h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                ${[
                    { range:'0–40%',   level:'Reactive',   cls:'border-red-200 bg-red-50',        txt:'text-red-600',     desc:'ตั้งรับ ยังไม่มีระบบ' },
                    { range:'41–60%',  level:'Basic',      cls:'border-amber-200 bg-amber-50',    txt:'text-amber-600',   desc:'มีกฎแต่ยังไม่สม่ำเสมอ' },
                    { range:'61–80%',  level:'Proactive',  cls:'border-blue-200 bg-blue-50',      txt:'text-blue-600',    desc:'ป้องกันล่วงหน้า ระบบดี' },
                    { range:'81–100%', level:'Generative', cls:'border-emerald-200 bg-emerald-50', txt:'text-emerald-600', desc:'วัฒนธรรมแข็งแกร่ง' },
                ].map(m => `<div class="border rounded-lg p-3 ${m.cls}"><div class="text-xs text-slate-500">${m.range}</div><div class="font-bold ${m.txt}">${m.level}</div><div class="text-xs text-slate-500 mt-0.5">${m.desc}</div></div>`).join('')}
            </div>
        </div>
    </div>`;
}

// ── Tab: PPE ───────────────────────────────────────────────────────────────
function _warnBadge(level) {
    const cfg = {
        verbal:         { cls:'bg-amber-100 text-amber-700',   dot:'bg-amber-400',  label:'ตักเตือนด้วยวาจา' },
        safety_notice:  { cls:'bg-orange-100 text-orange-700', dot:'bg-orange-400', label:'ใบแจ้งความปลอดภัย' },
        written_warning:{ cls:'bg-red-100 text-red-700',       dot:'bg-red-500',    label:'ใบเตือนลายลักษณ์อักษร' },
    };
    const c = cfg[level] || cfg.verbal;
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.cls}"><span class="w-1.5 h-1.5 rounded-full ${c.dot} inline-block"></span>${c.label}</span>`;
}

function _isPPEPass(r) {
    return r?.IsPass === 1 || r?.IsPass === '1';
}

function _monthFromDate(v) {
    if (!v) return 0;
    const m = parseInt(String(v).substring(5, 7), 10);
    return Number.isFinite(m) ? m : 0;
}

function _ppeRecordMatchesBaseFilters(r) {
    const recYear = parseInt(String(r.InspectionDate || r.CreatedAt || '').substring(0, 4), 10);
    if (recYear && recYear !== _filterYear) return false;
    if (_ppeFilterMonth && _monthFromDate(r.InspectionDate || r.CreatedAt) !== _ppeFilterMonth) return false;
    if (_filterPPEDept && String(r.Department || '').trim() !== _filterPPEDept) return false;
    if (_ppeFilterWT && !(r.WorkTypeID === _ppeFilterWT || r.WorkTypeName === _ppeFilterWT)) return false;
    if (_ppeFilterStatus === 'pass' && !_isPPEPass(r)) return false;
    if (_ppeFilterStatus === 'fail' && _isPPEPass(r)) return false;
    if (_ppeSearch) {
        const q = _ppeSearch.toLowerCase();
        return [
            r.InspectedEmployeeName,
            r.InspectedEmployeeID,
            r.Department,
            r.Area,
            r.InspectorName,
            r.WorkTypeName,
        ].some(v => String(v || '').toLowerCase().includes(q));
    }
    return true;
}

function _filteredPPEInspections() {
    return _ppeInspections.filter(_ppeRecordMatchesBaseFilters);
}

function _filteredPPEViolations() {
    return _ppeViolations.filter(v => {
        const recYear = parseInt(String(v.ViolationDate || v.CreatedAt || '').substring(0, 4), 10);
        if (recYear && recYear !== _filterYear) return false;
        if (_ppeFilterMonth && _monthFromDate(v.ViolationDate || v.CreatedAt) !== _ppeFilterMonth) return false;
        if (_filterPPEDept && String(v.Department || '').trim() !== _filterPPEDept) return false;
        if (_ppeSearch) {
            const q = _ppeSearch.toLowerCase();
            return [v.EmployeeName, v.EmployeeID, v.Department, v.InspectorName, v.Note]
                .some(x => String(x || '').toLowerCase().includes(q));
        }
        return true;
    });
}

function _ppeItemTotals(records) {
    const map = {};
    const ensure = (id, name) => {
        const key = id || name || 'unknown';
        if (!map[key]) map[key] = { id:key, name:name || key, total:0, ok:0, fail:0 };
        return map[key];
    };
    _ppeItems.forEach(i => ensure(i.ItemID, i.ItemName));
    records.forEach(r => {
        if (Array.isArray(r.details) && r.details.length) {
            r.details.forEach(d => {
                const status = String(d.Status || '').toLowerCase();
                if (status === 'na' || !status) return;
                const item = ensure(d.ItemID, d.ItemName);
                item.total++;
                if (status === 'compliant') item.ok++;
                if (status === 'non-compliant') item.fail++;
            });
        } else {
            PPE_ITEMS.forEach(item => {
                const status = String(r[item.key] || '').toLowerCase();
                if (status === 'na' || !status) return;
                const row = ensure(item.key, item.label);
                row.total++;
                if (status === 'compliant') row.ok++;
                if (status === 'non-compliant') row.fail++;
            });
        }
    });
    return Object.values(map).map(x => ({
        ...x,
        pct: x.total ? Math.round(x.ok / x.total * 100) : null,
    }));
}

function _ppeRepeatEmployees(violations) {
    const map = {};
    violations.forEach(v => {
        const key = v.EmployeeID || v.EmployeeName || 'unknown';
        if (!map[key]) map[key] = { id:v.EmployeeID, name:v.EmployeeName, dept:v.Department, count:0, level:v.WarningLevel };
        map[key].count++;
        map[key].level = v.WarningLevel;
    });
    return Object.values(map).sort((a,b) => b.count - a.count);
}

function _ppeFilterBar(count) {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const deptVals = [...new Set([
        ..._departments,
        ..._ppeInspections.map(r => r.Department).filter(Boolean),
        ..._ppeViolations.map(v => v.Department).filter(Boolean),
    ].map(v => String(v).trim()).filter(Boolean))].sort();
    const wtOptions = _ppeWorkTypes.map(w => `<option value="${escHtml(w.WorkTypeID)}" ${_ppeFilterWT===w.WorkTypeID?'selected':''}>${escHtml(w.Name)}</option>`).join('');
    return `
    <div class="ds-filter-bar flex flex-wrap items-center gap-3">
        <div class="w-full flex items-center justify-between gap-3 mb-1">
            <div>
                <p class="text-xs font-bold uppercase text-slate-500">ตัวกรอง / Filters</p>
                <p class="text-[11px] text-slate-400">กรองข้อมูลการตรวจ PPE ตามช่วงเวลา แผนก ประเภทงาน และผลตรวจ</p>
            </div>
            <span class="text-xs font-semibold text-slate-400">${count} รายการ / records</span>
        </div>
        <label class="flex-1 min-w-56">
            <span class="block text-[11px] font-semibold text-slate-500 mb-1">ค้นหา / Search</span>
            <input type="text" value="${escHtml(_ppeSearch)}" oninput="window._scSetPPESearch(this.value)"
                placeholder="รหัส/ชื่อพนักงาน แผนก หรือผู้ตรวจ..."
                class="form-input text-sm py-1.5 px-3 w-full">
        </label>
        <label class="min-w-36">
            <span class="block text-[11px] font-semibold text-slate-500 mb-1">เดือน / Month</span>
            <select onchange="window._scSetPPEMonth(this.value)" class="form-input text-sm py-1.5 px-3 w-full">
            <option value="0">ทุกเดือน / All</option>
            ${months.map(m => `<option value="${m}" ${_ppeFilterMonth===m?'selected':''}>${String(m).padStart(2,'0')}</option>`).join('')}
            </select>
        </label>
        <label class="min-w-44">
            <span class="block text-[11px] font-semibold text-slate-500 mb-1">แผนก / Department</span>
            <select onchange="window._scSetPPEDept(this.value)" class="form-input text-sm py-1.5 px-3 w-full">
            <option value="">ทุกแผนก / All</option>
            ${deptVals.map(d => `<option value="${escHtml(d)}" ${_filterPPEDept===d?'selected':''}>${escHtml(d)}</option>`).join('')}
            </select>
        </label>
        <label class="min-w-44">
            <span class="block text-[11px] font-semibold text-slate-500 mb-1">ประเภทงาน / Work Type</span>
            <select onchange="window._scSetPPEWT(this.value)" class="form-input text-sm py-1.5 px-3 w-full">
            <option value="">ทุกประเภทงาน / All</option>
            ${wtOptions}
            </select>
        </label>
        <label class="min-w-36">
            <span class="block text-[11px] font-semibold text-slate-500 mb-1">ผลตรวจ / Result</span>
            <select onchange="window._scSetPPEStatus(this.value)" class="form-input text-sm py-1.5 px-3 w-full">
            <option value="">ทุกผลตรวจ / All</option>
            <option value="pass" ${_ppeFilterStatus==='pass'?'selected':''}>ผ่าน / Pass</option>
            <option value="fail" ${_ppeFilterStatus==='fail'?'selected':''}>ไม่ผ่าน / Fail</option>
            </select>
        </label>
        <button type="button" onclick="window._scClearPPEFilters()" class="btn btn-secondary px-3 py-2 text-xs self-end">ล้างตัวกรอง / Clear</button>
    </div>`;
}

function assessmentLocationGroupLabel(group) {
    return {
        walkway: 'Walkway / Crossing',
        waste: 'Waste Sorting',
        other: 'Other',
    }[group] || group || '-';
}

function buildAssessmentLocationsAdmin() {
    const rows = _assessmentLocations.map(loc => {
        const active = Number(loc.IsActive) !== 0;
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-2.5 text-sm font-semibold text-slate-700">${escHtml(loc.LocationName || '')}</td>
            <td class="px-3 py-2.5 text-xs text-slate-500">${escHtml(assessmentLocationGroupLabel(loc.LocationGroup))}</td>
            <td class="px-3 py-2.5 text-xs text-slate-500">${escHtml(loc.AppliesTo || '')}</td>
            <td class="px-3 py-2.5 text-center text-xs text-slate-500">${loc.SortOrder ?? 99}</td>
            <td class="px-3 py-2.5 text-center">${active
                ? '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Active</span>'
                : '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">Inactive</span>'}</td>
            <td class="px-4 py-2.5 text-right whitespace-nowrap">
                <button onclick="window._scEditAssessmentLocation('${escHtml(loc.LocationID)}')" class="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100" title="แก้ไขจุดตรวจ">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                ${active ? `<button onclick="window._scDeleteAssessmentLocation('${escHtml(loc.LocationID)}')" class="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50" title="ปิดใช้งานจุดตรวจ">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 115.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                </button>` : ''}
            </td>
        </tr>`;
    }).join('');

    return `
    <details class="ds-section overflow-hidden" open>
        <summary class="px-5 py-4 cursor-pointer border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
                <h3 class="font-semibold text-slate-700">ตั้งค่าจุดตรวจ Safety Culture</h3>
                <p class="text-xs text-slate-400 mt-0.5">Master เฉพาะโมดูลนี้ ใช้เตรียม dropdown รายจุดใน Phase ถัดไป</p>
            </div>
            <button type="button" onclick="event.preventDefault(); window._scAddAssessmentLocation()" class="btn btn-secondary h-9 px-3 text-xs">+ เพิ่มจุดตรวจ</button>
        </summary>
        <div class="overflow-x-auto">
            <table class="ds-table text-sm">
                <thead class="bg-slate-50">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">จุดตรวจ</th>
                        <th class="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase">กลุ่ม</th>
                        <th class="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ใช้กับหัวข้อ</th>
                        <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase">ลำดับ</th>
                        <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase">สถานะ</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">ยังไม่มีจุดตรวจ กด “เพิ่มจุดตรวจ” เพื่อเริ่มตั้งค่า</td></tr>'}</tbody>
            </table>
        </div>
    </details>`;
}

function viewAssessmentDetail(id) {
    const a = _assessments.find(x => x.AssessmentID === id);
    if (!a) return;
    const points = Array.isArray(a.points) ? a.points : [];
    const topicLookup = Object.fromEntries(ASSESSMENT_TOPIC_META.map(t => [t.key, t]));
    const scoreKeys = ['T1','T2','T3','T4','T5','T7'];
    const vals = scoreKeys.map(k => a[`${k}_Score`]).filter(v => v != null).map(v => parseFloat(v));
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    const mat = avg != null ? getMaturity(avg) : null;
    const locSummary = assessmentLocationSummary(a);
    const scoreCards = scoreKeys.map(k => {
        const score = a[`${k}_Score`] != null ? parseFloat(a[`${k}_Score`]) : null;
        const meta = topicLookup[k];
        return `<div class="rounded-lg border border-slate-100 bg-white px-3 py-2">
            <p class="text-[11px] font-bold text-slate-400">${k}</p>
            <p class="text-sm font-semibold text-slate-700 truncate">${escHtml(meta?.label || k)}</p>
            <p class="mt-1 text-lg font-black ${scoreColor(score)}">${score != null ? Math.round(score) + '%' : '-'}</p>
        </div>`;
    }).join('');

    const grouped = {};
    points.forEach(pt => {
        const name = (pt.LocationName || '').trim() || `จุดที่ ${pt.PointNo || '-'}`;
        const groupKey = `${pt.LocationID || ''}::${name}::${pt.PointNo || ''}`;
        if (!grouped[groupKey]) grouped[groupKey] = { name, pointNo: pt.PointNo, rows: [] };
        grouped[groupKey].rows.push(pt);
    });
    const groupRows = Object.values(grouped).sort((a, b) => (parseInt(a.pointNo) || 99) - (parseInt(b.pointNo) || 99));

    const detailHtml = groupRows.length ? groupRows.map(group => {
        const rows = group.rows.sort((x, y) => ASSESSMENT_TOPIC_META.findIndex(t => t.key === x.TopicKey) - ASSESSMENT_TOPIC_META.findIndex(t => t.key === y.TopicKey)).map(pt => {
            const meta = topicLookup[pt.TopicKey] || { key: pt.TopicKey, label: pt.TopicKey };
            const total = parseInt(pt.TotalPeople, 10) || 0;
            const comply = parseInt(pt.ComplyPeople, 10) || 0;
            const pct = assessmentPointPct(pt);
            return `<tr class="border-b border-slate-50">
                <td class="px-3 py-2 text-xs font-bold text-slate-500">${escHtml(meta.key)}</td>
                <td class="px-3 py-2 text-sm text-slate-700">${escHtml(meta.label)}</td>
                <td class="px-3 py-2 text-right text-sm text-slate-600">${total}</td>
                <td class="px-3 py-2 text-right text-sm text-slate-600">${comply}</td>
                <td class="px-3 py-2 text-right text-sm ${scoreColor(pct)}">${pct != null ? Math.round(pct) + '%' : '-'}</td>
            </tr>`;
        }).join('');
        return `<div class="rounded-xl border border-slate-100 overflow-hidden bg-white">
            <div class="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                    <p class="text-sm font-bold text-slate-800">${escHtml(group.name)}</p>
                    <p class="text-xs text-slate-400">จุดที่ ${escHtml(group.pointNo || '-')}</p>
                </div>
                <span class="text-xs font-semibold text-slate-400">${group.rows.length} หัวข้อ</span>
            </div>
            <div class="overflow-x-auto">
                <table class="ds-table text-sm">
                    <thead class="bg-white">
                        <tr>
                            <th class="px-3 py-2 text-left text-xs font-semibold text-slate-400">รหัส</th>
                            <th class="px-3 py-2 text-left text-xs font-semibold text-slate-400">หัวข้อ</th>
                            <th class="px-3 py-2 text-right text-xs font-semibold text-slate-400">จำนวน</th>
                            <th class="px-3 py-2 text-right text-xs font-semibold text-slate-400">ปฏิบัติตาม</th>
                            <th class="px-3 py-2 text-right text-xs font-semibold text-slate-400">%</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    }).join('') : `
        <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
            <p class="text-sm font-semibold text-slate-500">ยังไม่มีข้อมูลรายจุด</p>
            <p class="text-xs text-slate-400 mt-1">บันทึกนี้อาจเป็นข้อมูลเก่าที่เก็บเฉพาะคะแนนรวม T1-T5/T7</p>
        </div>`;

    openModal('รายละเอียดผลการประเมิน', `
    <div class="space-y-4">
        <div class="rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-600 text-white p-5">
            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                    <p class="text-xs font-bold uppercase text-white/70">Safety Culture Assessment</p>
                    <h3 class="text-xl font-black mt-1">${escHtml(a.AssessmentDate ? fmtDate(a.AssessmentDate) : String(a.AssessmentYear || '-'))}${a.WeekNo ? ` · W${a.WeekNo}` : ''}</h3>
                    <p class="text-sm text-white/75 mt-1">${escHtml(locSummary.label)} · ${locSummary.locationCount || locSummary.pointCount || 0} จุดตรวจ</p>
                </div>
                <div class="text-right">
                    <p class="text-xs text-white/70">Average</p>
                    <p class="text-3xl font-black">${avg != null ? Math.round(avg) + '%' : '-'}</p>
                    <p class="text-xs font-semibold text-white/80">${mat?.label || ''}</p>
                </div>
            </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">${scoreCards}</div>
        <div class="space-y-3">${detailHtml}</div>
        ${a.Notes ? `<div class="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
            <p class="text-xs font-bold uppercase text-amber-700">Follow-up Note</p>
            <p class="text-sm text-slate-700 mt-1 whitespace-pre-line">${escHtml(a.Notes)}</p>
        </div>` : ''}
        <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
            ${_isAdmin ? `<button type="button" onclick="window.closeModal();setTimeout(()=>window._scEditAssessment('${escHtml(a.AssessmentID)}'),80)" class="btn btn-secondary px-4">แก้ไข</button>` : ''}
            <button type="button" onclick="window.closeModal()" class="btn btn-primary px-4">ปิด</button>
        </div>
    </div>`, 'max-w-5xl');
}

function openAssessmentLocationForm(id) {
    const loc = id ? _assessmentLocations.find(x => x.LocationID === id) : null;
    openModal(loc ? 'แก้ไขจุดตรวจ Safety Culture' : 'เพิ่มจุดตรวจ Safety Culture', `
    <form id="sc-loc-form" class="space-y-4">
        ${loc ? `<input type="hidden" name="LocationID" value="${escHtml(loc.LocationID)}">` : ''}
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อจุดตรวจ</label>
            <input name="LocationName" required maxlength="200" value="${escHtml(loc?.LocationName || '')}" class="form-input w-full" placeholder="เช่น ทางข้ามด้านหน้าบริษัท บริเวณป้อม รปภ.">
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">กลุ่มจุดตรวจ</label>
                <select name="LocationGroup" id="sc-loc-group" class="form-input w-full">
                    ${[
                        ['walkway', 'Walkway / Crossing'],
                        ['waste', 'Waste Sorting'],
                        ['other', 'Other'],
                    ].map(([v, label]) => `<option value="${v}" ${String(loc?.LocationGroup || 'walkway') === v ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ใช้กับหัวข้อ</label>
                <select name="AppliesTo" id="sc-loc-applies" class="form-input w-full">
                    ${[
                        ['T1-T5', 'T1-T5'],
                        ['T7', 'T7'],
                        ['all', 'ทั้งหมด'],
                    ].map(([v, label]) => `<option value="${v}" ${String(loc?.AppliesTo || 'T1-T5') === v ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ลำดับ</label>
                <input name="SortOrder" type="number" min="0" value="${escHtml(loc?.SortOrder ?? 99)}" class="form-input w-full">
            </div>
        </div>
        <label class="inline-flex items-center gap-2 text-sm text-slate-600">
            <input name="IsActive" type="checkbox" value="1" ${Number(loc?.IsActive ?? 1) !== 0 ? 'checked' : ''} class="rounded border-slate-300 text-emerald-600">
            เปิดใช้งานใน dropdown
        </label>
        <div id="sc-loc-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="sc-loc-submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-xl');

    setTimeout(() => {
        const groupEl = document.getElementById('sc-loc-group');
        const appliesEl = document.getElementById('sc-loc-applies');
        groupEl?.addEventListener('change', () => {
            if (!appliesEl) return;
            if (groupEl.value === 'waste') appliesEl.value = 'T7';
            if (groupEl.value === 'walkway') appliesEl.value = 'T1-T5';
        });
        document.getElementById('sc-loc-form')?.addEventListener('submit', guardSubmitHandler(async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd.entries());
            data.IsActive = fd.has('IsActive') ? 1 : 0;
            data.SortOrder = parseInt(data.SortOrder, 10) || 99;
            const errEl = document.getElementById('sc-loc-err');
            const submitBtn = document.getElementById('sc-loc-submit');
            errEl?.classList.add('hidden');
            if (submitBtn?.disabled) return;
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'กำลังบันทึก...'; }
            try {
                if (data.LocationID) await API.put(`/safety-culture/assessment-locations/${data.LocationID}`, data);
                else await API.post('/safety-culture/assessment-locations', data);
                closeModal();
                showToast('บันทึกจุดตรวจสำเร็จ', 'success');
                await _loadHeroStats();
            } catch (err) {
                errEl.textContent = escHtml(err.message || 'ไม่สามารถบันทึกจุดตรวจได้');
                errEl.classList.remove('hidden');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'บันทึก'; }
            }
        }));
    }, 50);
}

async function deleteAssessmentLocation(id) {
    const loc = _assessmentLocations.find(x => x.LocationID === id);
    if (!confirm(`ต้องการปิดใช้งานจุดตรวจ "${loc?.LocationName || id}"?`)) return;
    try {
        await API.delete(`/safety-culture/assessment-locations/${id}`);
        showToast('ปิดใช้งานจุดตรวจสำเร็จ', 'success');
        await _loadHeroStats();
    } catch (err) {
        showToast('ปิดใช้งานไม่สำเร็จ: ' + escHtml(err.message || ''), 'error');
    }
}

function _ppeComplianceInsight(records, violations) {
    const total = records.length;
    const pass = records.filter(_isPPEPass).length;
    const passRate = total ? Math.round(pass / total * 100) : null;
    const itemRisk = _ppeItemTotals(records).filter(x => x.total > 0).sort((a,b) => b.fail - a.fail || (a.pct ?? 101) - (b.pct ?? 101))[0];
    const deptMap = {};
    records.forEach(r => {
        const d = (r.Department || 'ไม่ระบุ').trim();
        if (!deptMap[d]) deptMap[d] = { dept:d, total:0, pass:0 };
        deptMap[d].total++;
        if (_isPPEPass(r)) deptMap[d].pass++;
    });
    const weakestDept = Object.values(deptMap)
        .map(d => ({ ...d, pct: d.total ? Math.round(d.pass / d.total * 100) : null }))
        .filter(d => d.total > 0)
        .sort((a,b) => (a.pct ?? 101) - (b.pct ?? 101) || b.total - a.total)[0];
    const repeat = _ppeRepeatEmployees(violations).find(e => e.count >= 2);
    const tone = passRate == null ? 'border-slate-200 bg-white' : passRate >= 90 ? 'border-emerald-200 bg-emerald-50' : passRate >= 70 ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50';
    return `
    <div class="ds-section border ${tone} p-5" data-sc-card-image="safety-culture-ppe-compliance-insight">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
                <p class="text-xs font-bold uppercase text-slate-500">PPE Compliance Insight</p>
                <h3 class="text-lg font-bold text-slate-800 mt-1">${passRate == null ? 'ยังไม่มีข้อมูลตามตัวกรอง' : `Pass Rate ${passRate}%`}</h3>
                <p class="text-sm text-slate-500 mt-1">${total} inspections · ${total - pass} failed · ${violations.length} violations</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                <div class="rounded-lg bg-white/80 border border-white p-3">
                    <p class="text-[11px] font-bold uppercase text-slate-400">Weakest item</p>
                    <p class="text-sm font-semibold text-slate-700 mt-1">${itemRisk ? escHtml(itemRisk.name) : '—'}</p>
                    <p class="text-xs text-slate-400">${itemRisk ? `${itemRisk.fail} fail / ${itemRisk.total} checks` : 'No checklist data'}</p>
                </div>
                <div class="rounded-lg bg-white/80 border border-white p-3">
                    <p class="text-[11px] font-bold uppercase text-slate-400">Focus department</p>
                    <p class="text-sm font-semibold text-slate-700 mt-1">${weakestDept ? escHtml(weakestDept.dept) : '—'}</p>
                    <p class="text-xs text-slate-400">${weakestDept ? `${weakestDept.pct}% from ${weakestDept.total} checks` : 'No department data'}</p>
                </div>
                <div class="rounded-lg bg-white/80 border border-white p-3">
                    <p class="text-[11px] font-bold uppercase text-slate-400">Repeat focus</p>
                    <p class="text-sm font-semibold text-slate-700 mt-1">${repeat ? escHtml(repeat.name || repeat.id || '—') : '—'}</p>
                    <p class="text-xs text-slate-400">${repeat ? `${repeat.count} violations` : 'No repeat violations'}</p>
                </div>
            </div>
        </div>
    </div>`;
}

function _ppeItemHeatmap(records) {
    const items = _ppeItemTotals(records).filter(x => x.total > 0).sort((a,b) => (a.pct ?? 101) - (b.pct ?? 101) || b.total - a.total).slice(0, 8);
    if (!items.length) return `
    <div class="ds-section p-5" data-sc-card-image="safety-culture-ppe-item-heatmap">
        <h3 class="font-semibold text-slate-700">PPE Item Heatmap</h3>
        <div class="text-sm text-slate-400 py-8 text-center">ยังไม่มีรายละเอียดรายการ PPE สำหรับช่วงนี้</div>
    </div>`;
    return `
    <div class="ds-section overflow-hidden" data-sc-card-image="safety-culture-ppe-item-heatmap">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-semibold text-slate-700">PPE Item Heatmap</h3>
            <span class="text-xs text-slate-400">lowest compliance first</span>
        </div>
        <div class="p-5 space-y-3">
            ${items.map(i => {
                const cls = i.pct >= 90 ? 'bg-emerald-500' : i.pct >= 70 ? 'bg-amber-500' : 'bg-red-500';
                return `<div>
                    <div class="flex items-center justify-between gap-3 text-sm">
                        <span class="font-medium text-slate-700 truncate">${escHtml(i.name)}</span>
                        <span class="text-xs font-bold ${scoreColor(i.pct)}">${i.pct}%</span>
                    </div>
                    <div class="mt-1 bg-slate-100 rounded-full h-2"><div class="${cls} h-2 rounded-full" style="width:${Math.min(i.pct,100)}%"></div></div>
                    <p class="text-[11px] text-slate-400 mt-0.5">${i.ok} compliant · ${i.fail} non-compliant · ${i.total} total</p>
                </div>`;
            }).join('')}
        </div>
    </div>`;
}

function _ppeRepeatFocus(violations) {
    const repeats = _ppeRepeatEmployees(violations).filter(e => e.count >= 2).slice(0, 8);
    return `
    <div class="ds-section overflow-hidden" data-sc-card-image="safety-culture-ppe-repeat-focus">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-semibold text-slate-700">Repeat Violation Focus</h3>
            <span class="text-xs text-slate-400">2+ records</span>
        </div>
        ${repeats.length ? `<div class="overflow-x-auto">
            <table class="ds-table text-sm">
                <tbody>${repeats.map(e => `<tr class="border-b border-slate-100 last:border-0">
                    <td class="px-4 py-3 font-medium text-slate-800">${escHtml(e.name || '—')}</td>
                    <td class="px-4 py-3 text-xs text-slate-500">${escHtml(e.dept || '—')}</td>
                    <td class="px-4 py-3 text-center font-bold text-red-600">${e.count}</td>
                    <td class="px-4 py-3">${_warnBadge(e.level)}</td>
                </tr>`).join('')}</tbody>
            </table>
        </div>` : `<div class="p-8 text-center text-sm text-slate-400">ยังไม่พบการฝ่าฝืนซ้ำในช่วงที่เลือก</div>`}
    </div>`;
}

function _ppeWorkTypeCoverage(records) {
    const map = {};
    _ppeWorkTypes.forEach(w => { map[w.WorkTypeID || w.Name] = { name:w.Name, count:0, pass:0 }; });
    records.forEach(r => {
        const key = r.WorkTypeID || r.WorkTypeName || 'other';
        if (!map[key]) map[key] = { name:r.WorkTypeName || 'ไม่ระบุประเภทงาน', count:0, pass:0 };
        map[key].count++;
        if (_isPPEPass(r)) map[key].pass++;
    });
    const rows = Object.values(map).sort((a,b) => b.count - a.count || a.name.localeCompare(b.name));
    return `
    <div class="ds-section overflow-hidden" data-sc-card-image="safety-culture-ppe-worktype-coverage">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-semibold text-slate-700">Work Type Coverage</h3>
            <span class="text-xs text-slate-400">${rows.length} work types</span>
        </div>
        <div class="divide-y divide-slate-100">
            ${rows.length ? rows.map(r => {
                const pct = r.count ? Math.round(r.pass / r.count * 100) : null;
                return `<div class="px-5 py-3 flex items-center justify-between gap-3">
                    <div class="min-w-0">
                        <p class="text-sm font-semibold text-slate-700 truncate">${escHtml(r.name)}</p>
                        <p class="text-xs text-slate-400">${r.count ? `${r.count} inspections · ${pct}% pass` : 'ยังไม่เคยตรวจในช่วงนี้'}</p>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold ${r.count ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}">${r.count}</span>
                </div>`;
            }).join('') : `<div class="p-8 text-center text-sm text-slate-400">ยังไม่มีเทมเพลตประเภทงาน PPE</div>`}
        </div>
    </div>`;
}

function _isImageEvidence(url) {
    return /\.(png|jpe?g|gif|webp|bmp)$/i.test(String(url || '').split('?')[0]);
}

function _ppeEvidenceButton(r) {
    if (!r?.ImageUrl) return '<span class="text-xs text-slate-300">—</span>';
    return `<button type="button" onclick="window._scPreviewPPEEvidence('${escHtml(r.InspectionID)}')" class="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 16.5V8.25A2.25 2.25 0 015.25 6h13.5A2.25 2.25 0 0121 8.25v8.25m-18 0A2.25 2.25 0 005.25 18.75h13.5A2.25 2.25 0 0021 16.5m-18 0l4.72-4.72a1.5 1.5 0 012.12 0l2.66 2.66 1.22-1.22a1.5 1.5 0 012.12 0L21 16.5"/></svg>
        Evidence
    </button>`;
}

function buildPPEHtml() {
    if (!_isAdmin && (_ppeSub === 'worktypes' || _ppeSub === 'violations')) _ppeSub = 'dashboard';
    const subTabs = [
        { id:'dashboard', label:'ภาพรวม' },
        { id:'history',   label:'ประวัติการตรวจ' },
        ..._isAdmin ? [{ id:'worktypes', label:'เทมเพลต PPE' }] : [],
        { id:'violations', label:'บันทึกฝ่าฝืน' },
    ];
    const subNav = `
    <div class="flex gap-1 flex-wrap">
        ${subTabs.map(t => `
        <button onclick="window._scSetPPESub('${t.id}')"
            class="px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${(!_isAdmin && t.id==='violations')?'hidden':''} ${_ppeSub===t.id?'bg-emerald-600 text-white shadow-sm':'bg-white/60 text-slate-600 hover:bg-white'}">${t.label}</button>`).join('')}
    </div>`;

    let content = '';
    if (_ppeSub === 'dashboard')       content = buildPPEDashboard();
    else if (_ppeSub === 'history')    content = buildPPEHistory();
    else if (_ppeSub === 'worktypes')  content = buildPPEWorkTypes();
    else if (_ppeSub === 'violations') content = buildPPEViolations();

    return `
    <div class="space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
            ${subNav}
            ${_isAdmin ? `
            <button onclick="window._scAddPPE()" class="btn btn-primary px-4 py-2 text-sm flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                บันทึกผล PPE Inspection
            </button>` : ''}
        </div>
        ${content}
    </div>`;
}

// ── PPE Dashboard sub-tab ──────────────────────────────────────────────────
function buildPPEDashboard() {
    const all = _filteredPPEInspections();
    const violations = _filteredPPEViolations();
    const total      = all.length;
    const passCount  = all.filter(_isPPEPass).length;
    const failCount  = total - passCount;
    const passRate   = total > 0 ? Math.round(passCount / total * 100) : null;
    const violCount  = violations.length;

    const kpiCards = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="ds-metric-card p-4 flex items-center gap-3" data-sc-card-image="safety-culture-ppe-kpi-total">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                <svg class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div><p class="text-2xl font-bold text-slate-800">${total}</p><p class="text-xs text-slate-500">ครั้งตรวจทั้งหมด</p></div>
        </div>
        <div class="ds-metric-card p-4 flex items-center gap-3" data-sc-card-image="safety-culture-ppe-kpi-pass">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                <svg class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            </div>
            <div><p class="text-2xl font-bold text-emerald-600">${passCount}</p><p class="text-xs text-slate-500">ผ่าน (100% Compliant)</p></div>
        </div>
        <div class="ds-metric-card p-4 flex items-center gap-3" data-sc-card-image="safety-culture-ppe-kpi-fail">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-50">
                <svg class="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </div>
            <div><p class="text-2xl font-bold text-red-600">${failCount}</p><p class="text-xs text-slate-500">ไม่ผ่าน (มีรายการบกพร่อง)</p></div>
        </div>
        <div class="ds-metric-card p-4 flex items-center gap-3" data-sc-card-image="safety-culture-ppe-kpi-violations">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${violCount>0?'bg-orange-50':'bg-slate-50'}">
                <svg class="w-5 h-5 ${violCount>0?'text-orange-500':'text-slate-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div><p class="text-2xl font-bold ${violCount>0?'text-orange-600':'text-slate-400'}">${violCount}</p><p class="text-xs text-slate-500">บันทึกฝ่าฝืน PPE</p></div>
        </div>
    </div>`;

    const passRateBar = passRate !== null ? `
    <div class="ds-section p-5 border-l-4 ${passRate>=90?'border-emerald-400':passRate>=70?'border-amber-400':'border-red-400'}" data-sc-card-image="safety-culture-ppe-pass-rate">
        <div class="flex items-center justify-between mb-2">
            <div>
                <p class="text-sm text-slate-500 font-medium">Pass Rate (Strict 100%) — ปี ${_filterYear}</p>
                <p class="text-3xl font-bold mt-1 ${passRate>=90?'text-emerald-600':passRate>=70?'text-amber-600':'text-red-600'}">${passRate}%</p>
            </div>
            <div class="text-right text-sm text-slate-400">${passCount} / ${total} รายการ</div>
        </div>
        <div class="bg-slate-100 rounded-full h-3"><div class="h-3 rounded-full ${passRate>=90?'bg-emerald-500':passRate>=70?'bg-amber-500':'bg-red-500'}" style="width:${Math.min(passRate,100)}%"></div></div>
    </div>` : '';

    const deptMap2 = {};
    all.forEach(r => {
        const d = (r.Department || '(ไม่ระบุ)').trim();
        if (!deptMap2[d]) deptMap2[d] = { total:0, pass:0 };
        deptMap2[d].total++;
        if (r.IsPass===1||r.IsPass==='1') deptMap2[d].pass++;
    });
    const depts2 = Object.entries(deptMap2)
        .map(([dept,d]) => ({ dept, total:d.total, pct: d.total>0 ? Math.round(d.pass/d.total*100) : null }))
        .sort((a,b) => (b.pct??-1)-(a.pct??-1));

    const deptRows2 = depts2.map(r => {
        const p = r.pct;
        const barClr = p===null?'#e2e8f0':p>=90?'#059669':p>=70?'#d97706':'#ef4444';
        const txtCls = p===null?'text-slate-400':p>=90?'text-emerald-600':p>=70?'text-amber-600':'text-red-600';
        return `<tr class="border-b border-slate-100 last:border-0">
            <td class="px-4 py-2.5 text-sm text-slate-700 font-medium">${escHtml(r.dept)}</td>
            <td class="px-4 py-2.5 text-xs text-slate-500 text-center">${r.total}</td>
            <td class="px-4 py-2.5">
                <div class="flex items-center gap-2">
                    <div class="flex-1 bg-slate-100 rounded-full h-2"><div class="h-2 rounded-full" style="width:${p??0}%;background:${barClr}"></div></div>
                    <span class="text-xs font-bold w-10 text-right ${txtCls}">${p!==null?p+'%':'—'}</span>
                </div>
            </td>
        </tr>`;
    }).join('');

    const empViolMap2 = {};
    violations.forEach(v => {
        const key = v.EmployeeID || v.EmployeeName;
        if (!empViolMap2[key]) empViolMap2[key] = { name:v.EmployeeName, dept:v.Department, count:0, level:v.WarningLevel };
        empViolMap2[key].count++;
        empViolMap2[key].level = v.WarningLevel;
    });
    const highRisk2 = Object.values(empViolMap2).filter(e => e.count >= 2).sort((a,b) => b.count-a.count).slice(0,10);
    const highRiskTable2 = highRisk2.length ? `
    <div class="ds-section overflow-hidden" data-sc-card-image="safety-culture-ppe-repeat-employees">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <span class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-100">
                <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </span>
            <div><h3 class="font-semibold text-slate-700">พนักงานที่มีบันทึกฝ่าฝืนซ้ำ</h3><p class="text-xs text-slate-400">≥ 2 ครั้ง</p></div>
        </div>
        <div class="overflow-x-auto">
            <table class="ds-table text-sm">
                <thead class="bg-slate-50"><tr>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">พนักงาน</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">แผนก</th>
                    <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">จำนวนครั้ง</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ระดับล่าสุด</th>
                </tr></thead>
                <tbody>${highRisk2.map(e => `<tr class="border-b border-slate-100 hover:bg-slate-50" style="background:rgba(254,242,242,0.4)">
                    <td class="px-4 py-3 font-medium text-slate-800">${escHtml(e.name||'—')}</td>
                    <td class="px-4 py-3 text-slate-500 text-xs">${escHtml(e.dept||'—')}</td>
                    <td class="px-4 py-3 text-center font-bold text-red-600">${e.count}</td>
                    <td class="px-4 py-3">${_warnBadge(e.level)}</td>
                </tr>`).join('')}</tbody>
            </table>
        </div>
    </div>` : '';

    return `
    <div class="space-y-5">
        ${_ppeFilterBar(all.length)}
        ${_ppeComplianceInsight(all, violations)}
        ${kpiCards}
        ${passRateBar}
        ${depts2.length ? `
        <div class="ds-section overflow-hidden" data-sc-card-image="safety-culture-ppe-department-pass-rate">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="font-semibold text-slate-700">Pass Rate รายแผนก — ปี ${_filterYear}</h3>
                <span class="text-xs text-slate-400">${depts2.length} แผนก</span>
            </div>
            <div class="overflow-x-auto">
                <table class="ds-table text-sm">
                    <thead class="bg-slate-50"><tr>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">แผนก</th>
                        <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">ครั้ง</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Pass Rate</th>
                    </tr></thead>
                    <tbody>${deptRows2}</tbody>
                </table>
            </div>
        </div>` : `<div class="ds-empty-state p-8 text-center text-slate-400 text-sm">ยังไม่มีข้อมูล PPE Inspection สำหรับปี ${_filterYear}</div>`}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            ${_ppeItemHeatmap(all)}
            ${_ppeWorkTypeCoverage(all)}
        </div>
        ${_ppeRepeatFocus(violations)}
    </div>`;
}

// ── PPE History sub-tab ────────────────────────────────────────────────────
function buildPPEHistory() {
    let filtered = _ppeInspections;
    if (_ppeSearch) {
        const q = _ppeSearch.toLowerCase();
        filtered = filtered.filter(r =>
            (r.InspectedEmployeeName||'').toLowerCase().includes(q) ||
            (r.Department||'').toLowerCase().includes(q) ||
            (r.InspectorName||'').toLowerCase().includes(q) ||
            (r.WorkTypeName||'').toLowerCase().includes(q)
        );
    }
    if (_ppeFilterWT)     filtered = filtered.filter(r => r.WorkTypeID === _ppeFilterWT || r.WorkTypeName === _ppeFilterWT);
    if (_ppeFilterStatus === 'pass') filtered = filtered.filter(r => r.IsPass===1||r.IsPass==='1');
    if (_ppeFilterStatus === 'fail') filtered = filtered.filter(r => !(r.IsPass===1||r.IsPass==='1'));

    const wtOptions = _ppeWorkTypes.map(w => `<option value="${escHtml(w.WorkTypeID)}" ${_ppeFilterWT===w.WorkTypeID?'selected':''}>${escHtml(w.Name)}</option>`).join('');
    const filterBar = `
    <div class="ds-filter-bar flex flex-wrap items-center gap-3">
        <input type="text" value="${escHtml(_ppeSearch)}" oninput="window._scSetPPESearch(this.value)"
            placeholder="ค้นหาพนักงาน / แผนก / ผู้ตรวจ..."
            class="form-input text-sm py-1.5 px-3 flex-1 min-w-48">
        <select onchange="window._scSetPPEWT(this.value)" class="form-input text-sm py-1.5 px-3 min-w-40">
            <option value="">— ทุกประเภทงาน —</option>
            ${wtOptions}
        </select>
        <select onchange="window._scSetPPEStatus(this.value)" class="form-input text-sm py-1.5 px-3">
            <option value="">— ผล —</option>
            <option value="pass" ${_ppeFilterStatus==='pass'?'selected':''}>ผ่าน</option>
            <option value="fail" ${_ppeFilterStatus==='fail'?'selected':''}>ไม่ผ่าน</option>
        </select>
    </div>`;

    filtered = _filteredPPEInspections();
    const filterBar2 = _ppeFilterBar(filtered.length);

    const rows3 = filtered.map(r => {
        const isPass  = r.IsPass===1||r.IsPass==='1';
        const rowBg   = isPass ? '' : ' style="background:rgba(254,242,242,0.45)"';
        const passBadge = isPass
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>ผ่าน</span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700"><span class="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"></span>ไม่ผ่าน</span>`;
        const pct3 = r.TotalItems>0 ? Math.round((r.CompliantItems/r.TotalItems)*100) : 0;
        return `<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors"${rowBg}>
            <td class="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">${fmtDate(r.InspectionDate)}</td>
            <td class="px-4 py-3 text-sm text-slate-800 font-medium">${escHtml(r.InspectedEmployeeName||r.InspectorName||'—')}</td>
            <td class="px-4 py-3 text-xs text-slate-500">${escHtml(r.Department||'—')}</td>
            <td class="px-4 py-3 text-xs text-slate-500">${escHtml(r.WorkTypeName||'—')}</td>
            <td class="px-4 py-3 text-sm text-slate-500">${escHtml(r.InspectorName||'—')}</td>
            <td class="px-4 py-3 text-xs text-slate-500">${r.CompliantItems||0}/${r.TotalItems||0} (${pct3}%)</td>
            <td class="px-4 py-3">${passBadge}</td>
            <td class="px-4 py-3">${_ppeEvidenceButton(r)}</td>
            <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                    <button onclick="window._scViewPPE('${r.InspectionID}')" class="p-1.5 rounded text-slate-400 hover:text-blue-500 hover:bg-slate-100 transition-colors" title="รายละเอียด"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button>
                    ${_isAdmin ? `<button onclick="window._scDeletePPE('${r.InspectionID}')" class="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="ลบ"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');

    return `
    <div class="space-y-4">
        ${filterBar2}
        <div class="ds-section overflow-hidden" data-sc-card-image="safety-culture-ppe-history">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="font-semibold text-slate-700">ประวัติการตรวจ PPE ปี ${_filterYear}</h3>
                <span class="text-xs text-slate-400">${filtered.length} รายการ</span>
            </div>
            <div class="overflow-x-auto">
                <table class="ds-table text-sm">
                    <thead class="bg-slate-50"><tr>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">วันที่</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">พนักงานที่ตรวจ</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">แผนก</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ประเภทงาน</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ผู้ตรวจ</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">รายการ</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ผล</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Evidence</th>
                        <th class="px-4 py-3"></th>
                    </tr></thead>
                    <tbody>${rows3||`<tr><td colspan="9" class="text-center py-12 text-slate-400">ไม่พบข้อมูลตามตัวกรอง — ลองเปลี่ยนปี แผนก ประเภทงาน หรือสถานะ</td></tr>`}</tbody>
                </table>
            </div>
        </div>
    </div>`;
}

// ── PPE Work Types (admin) ─────────────────────────────────────────────────
function buildPPEWorkTypes() {
    const wtRows = _ppeWorkTypes.map(w => {
        const itemNames = (w.items||[]).map(i => `<span class="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">${escHtml(i.ItemName)}</span>`).join(' ');
        return `<div class="flex items-start gap-3 px-5 py-4 border-b border-slate-100 last:border-0">
            <div class="flex-1">
                <div class="font-semibold text-slate-800 text-sm">${escHtml(w.Name)}</div>
                ${w.Description ? `<div class="text-xs text-slate-400 mt-0.5">${escHtml(w.Description)}</div>` : ''}
                <div class="flex flex-wrap gap-1.5 mt-2">${itemNames||'<span class="text-xs text-slate-300">ยังไม่มีรายการ PPE</span>'}</div>
            </div>
            <div class="flex gap-1 flex-shrink-0">
                <button onclick="window._scEditWorkType('${w.WorkTypeID}')" class="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                <button onclick="window._scDeleteWorkType('${w.WorkTypeID}')" class="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
            </div>
        </div>`;
    }).join('');

    return `
    <div class="space-y-4">
        <div class="ds-section overflow-hidden" data-sc-card-image="safety-culture-ppe-template-list">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                    <h3 class="font-semibold text-slate-700">เทมเพลต PPE ตามประเภทงาน</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${_ppeWorkTypes.length} ประเภท</p>
                </div>
                <button onclick="window._scAddWorkType()" class="btn btn-primary px-4 py-2 text-xs flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    เพิ่มประเภทงาน
                </button>
            </div>
            <div>${wtRows||'<div class="px-5 py-8 text-center text-sm text-slate-400">ยังไม่มีเทมเพลต PPE — กดเพิ่มประเภทงาน แล้วเลือก PPE ที่ต้องใช้ก่อนเริ่มตรวจ</div>'}</div>
        </div>
        <div class="ds-section overflow-hidden" data-sc-card-image="safety-culture-ppe-item-master">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                    <h3 class="font-semibold text-slate-700">จัดการรายการ PPE ทั้งหมด</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${_ppeItems.length} รายการ</p>
                </div>
                <button onclick="window._scAddPPEItem()" class="btn btn-secondary px-4 py-2 text-xs flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    เพิ่มรายการ PPE
                </button>
            </div>
            <div class="divide-y divide-slate-100">
                ${_ppeItems.length ? _ppeItems.map((item,idx) => `
                <div class="flex items-center gap-3 px-5 py-3">
                    <span class="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 bg-emerald-100 text-emerald-700">${idx+1}</span>
                    ${item.ImageUrl
                        ? `<img src="${escHtml(safeResourceUrl(item.ImageUrl))}" alt="${escHtml(item.ItemName)}" class="w-12 h-12 rounded-lg object-cover border border-slate-200 bg-white flex-shrink-0">`
                        : `<div class="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 flex-shrink-0"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75"/></svg></div>`}
                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-slate-800 font-semibold truncate">${escHtml(item.ItemName)}</p>
                        ${item.Description ? `<p class="text-xs text-slate-400 mt-0.5 truncate">${escHtml(item.Description)}</p>` : '<p class="text-xs text-slate-300 mt-0.5">ไม่มีคำอธิบาย / No description</p>'}
                    </div>
                    <div class="flex gap-1">
                        <button onclick="window._scEditPPEItem('${item.ItemID}')" class="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                        <button onclick="window._scDeletePPEItem('${item.ItemID}')" class="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                    </div>
                </div>`).join('') : `<p class="px-5 py-4 text-sm text-slate-400">ยังไม่มีรายการ PPE — เพิ่มหมวก แว่น ถุงมือ รองเท้า หรืออุปกรณ์ที่ต้องควบคุม</p>`}
            </div>
        </div>
    </div>`;
}

// ── PPE Violations sub-tab ─────────────────────────────────────────────────
function buildPPEViolations() {
    const violations = _filteredPPEViolations();
    const empMapV = {};
    violations.forEach(v => {
        const key = v.EmployeeID || v.EmployeeName;
        if (!empMapV[key]) empMapV[key] = { id:v.EmployeeID, name:v.EmployeeName, dept:v.Department, count:0, level:v.WarningLevel };
        empMapV[key].count++;
        empMapV[key].level = v.WarningLevel;
    });
    const empsV = Object.values(empMapV).sort((a,b) => b.count-a.count);

    const empRowsV = empsV.map(e => `
    <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
        <td class="px-4 py-3 font-medium text-slate-800 text-sm">${escHtml(e.name||'—')}</td>
        <td class="px-4 py-3 text-xs text-slate-500">${escHtml(e.dept||'—')}</td>
        <td class="px-4 py-3 text-center font-bold ${e.count>=3?'text-red-600':e.count>=2?'text-orange-600':'text-amber-600'}">${e.count}</td>
        <td class="px-4 py-3">${_warnBadge(e.level)}</td>
        <td class="px-4 py-3">
            <button onclick="window._scViewViolations('${escHtml(e.id||e.name)}')" class="text-xs text-blue-500 hover:underline">ดูบันทึก</button>
        </td>
    </tr>`).join('');

    const detailRowsV = violations.slice().reverse().map(v => `
    <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
        <td class="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">${fmtDate(v.ViolationDate)}</td>
        <td class="px-4 py-3 font-medium text-slate-800 text-sm">${escHtml(v.EmployeeName||'—')}</td>
        <td class="px-4 py-3 text-xs text-slate-500">${escHtml(v.Department||'—')}</td>
        <td class="px-4 py-3 text-center text-slate-600">${v.ViolationNo||1}</td>
        <td class="px-4 py-3">${_warnBadge(v.WarningLevel)}</td>
        <td class="px-4 py-3 text-sm text-slate-500">${escHtml(v.InspectorName||'—')}</td>
        <td class="px-4 py-3 text-xs text-slate-400 max-w-48 truncate" title="${escHtml(v.Note||'')}">${escHtml(v.Note||'—')}</td>
        ${_isAdmin ? `<td class="px-4 py-3"><button onclick="window._scDelViolation('${v.ViolationID}')" class="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></td>` : '<td></td>'}
    </tr>`).join('');

    return `
    <div class="space-y-5">
        ${_ppeFilterBar(violations.length)}
        <div class="ds-table-wrap" data-sc-card-image="safety-culture-ppe-violation-employees">
            <div class="px-5 py-4 border-b border-slate-100">
                <h3 class="font-semibold text-slate-700">สรุปรายพนักงาน</h3>
                <p class="text-xs text-slate-400 mt-0.5">${empsV.length} คน — ปี ${_filterYear}</p>
            </div>
            <div class="overflow-x-auto">
                <table class="ds-table text-sm">
                    <thead class="bg-slate-50"><tr>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">พนักงาน</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">แผนก</th>
                        <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">จำนวนครั้ง</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ระดับล่าสุด</th>
                        <th class="px-4 py-3"></th>
                    </tr></thead>
                    <tbody>${empRowsV||`<tr><td colspan="5" class="text-center py-8 text-slate-400">ยังไม่มีบันทึก</td></tr>`}</tbody>
                </table>
            </div>
        </div>
        <div class="ds-table-wrap" data-sc-card-image="safety-culture-ppe-violation-records">
            <div class="px-5 py-4 border-b border-slate-100">
                <h3 class="font-semibold text-slate-700">บันทึกทั้งหมด</h3>
                <p class="text-xs text-slate-400 mt-0.5">${_ppeViolations.length} รายการ</p>
            </div>
            <div class="overflow-x-auto">
                <table class="ds-table text-sm">
                    <thead class="bg-slate-50"><tr>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">วันที่</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">พนักงาน</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">แผนก</th>
                        <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">ครั้งที่</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ระดับ</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ผู้บันทึก</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">หมายเหตุ</th>
                        <th class="px-4 py-3"></th>
                    </tr></thead>
                    <tbody>${detailRowsV||`<tr><td colspan="8" class="text-center py-8 text-slate-400">ยังไม่มีบันทึก</td></tr>`}</tbody>
                </table>
            </div>
        </div>
    </div>`;
}


// ── Tab: Dashboard ─────────────────────────────────────────────────────────
function buildDashboardHtml() {
    const trend = _dashData?.yearTrend || [];

    // ── Month filter helper ──────────────────────────────────────────────────
    const SKEYS = ['T1_Score','T2_Score','T3_Score','T4_Score','T5_Score','T7_Score'];
    const mo = _filterDashMonth; // 0 = yearly

    // Filter assessments by month (or use all for yearly)
    const filteredAsmts = mo === 0
        ? _assessments
        : _assessments.filter(a => {
            if (!a.AssessmentDate) return false;
            return parseInt(String(a.AssessmentDate).substring(5,7), 10) === mo;
        });

    // Filter PPE inspections by month
    const filteredPPE = mo === 0
        ? _ppeInspections
        : _ppeInspections.filter(r => {
            const d = r.InspectionDate || r.CreatedAt;
            if (!d) return false;
            return parseInt(String(d).substring(5,7), 10) === mo;
        });

    // Compute T1-T5, T7 averages from filtered assessments (client-side)
    const computedAvgs = SKEYS.map(k => {
        const vals = filteredAsmts.filter(a => a[k] != null).map(a => parseFloat(a[k]));
        return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    }); // [t1,t2,t3,t4,t5,t7]

    // Compute PPE compliance from filtered PPE inspections
    let ppePct = null;
    if (filteredPPE.length > 0) {
        const passCount = filteredPPE.filter(r => r.IsPass===1||r.IsPass==='1').length;
        ppePct = Math.round(passCount / filteredPPE.length * 100);
    } else if (mo === 0 && _getPPEStats().overall_pct != null) {
        ppePct = parseFloat(_getPPEStats().overall_pct);
    }

    // Store for initCharts()
    _dashScores = [
        computedAvgs[0]??0, computedAvgs[1]??0, computedAvgs[2]??0,
        computedAvgs[3]??0, computedAvgs[4]??0,
        ppePct??0,
        computedAvgs[5]??0,
    ];

    // Overall avg
    const validAvgs = computedAvgs.filter(v => v != null);
    const overallAvg = validAvgs.length
        ? Math.round(validAvgs.reduce((a,b)=>a+b,0)/validAvgs.length)
        : null;
    const mat = overallAvg != null ? getMaturity(overallAvg) : null;

    // Period label
    const thMonths = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const periodLabel = mo === 0 ? `ปี ${_filterYear}` : `${thMonths[mo]} ${_filterYear}`;

    // Month filter bar HTML
    const monthOpts = [
        `<option value="0" ${mo===0?'selected':''}>รายปี (ทั้งปี)</option>`,
        ...Array.from({length:12},(_,i)=>i+1).map(m =>
            `<option value="${m}" ${mo===m?'selected':''}>${thMonths[m]}</option>`)
    ].join('');

    const monthFilterBar = `
    <div class="ds-filter-bar flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <span class="text-sm font-semibold text-slate-700">ดูข้อมูล:</span>
        </div>
        <select onchange="window._scSetDashMonth(this.value)"
            class="rounded-lg px-3 py-1.5 text-sm border border-slate-200 text-slate-700 bg-white outline-none focus:border-emerald-400">
            ${monthOpts}
        </select>
        <span class="text-xs text-slate-400 ml-auto">${filteredAsmts.length} รายการประเมิน · ${filteredPPE.length} ครั้งตรวจ PPE</span>
    </div>`;

    // PPE item breakdown — uses itemBreakdown from new backend (SC_PPE_Inspection_Details)
    // For monthly mode: compute client-side from filteredPPE details
    let ppeItemRows = [];
    if (mo === 0 && _getPPEStats().itemBreakdown?.length) {
        ppeItemRows = _getPPEStats().itemBreakdown;
    } else if (filteredPPE.length > 0) {
        const itemMap = {};
        filteredPPE.forEach(r => {
            (r.details || []).forEach(d => {
                if (d.Status === 'na') return;
                if (!itemMap[d.ItemID]) itemMap[d.ItemID] = { ItemName: d.ItemName, ok_count: 0, total_count: 0 };
                itemMap[d.ItemID].total_count++;
                if (d.Status === 'compliant') itemMap[d.ItemID].ok_count++;
            });
        });
        ppeItemRows = Object.values(itemMap);
    }

    const scoreCards = [
        { label: 'เดินบน Walk Way',   val: computedAvgs[0], code: 'T1' },
        { label: 'ไม่ใช้โทรศัพท์',   val: computedAvgs[1], code: 'T2' },
        { label: 'ข้ามถนนทางม้าลาย', val: computedAvgs[2], code: 'T3' },
        { label: 'หยุดยืนชี้นิ้ว',    val: computedAvgs[3], code: 'T4' },
        { label: 'ไม่ล้วงกระเป๋า',   val: computedAvgs[4], code: 'T5' },
        { label: 'PPE Control',       val: ppePct,           code: 'T6', note: '(จาก PPE%)' },
        { label: 'แยกขยะถูกต้อง',    val: computedAvgs[5], code: 'T7' },
    ].map(c => {
        const v   = c.val != null ? parseFloat(c.val) : null;
        const cls = scoreColor(v);
        return `<div class="ds-metric-card p-4 text-center" data-sc-card-image="safety-culture-score-${c.code.toLowerCase()}">
            <div class="flex justify-center mb-2">
                <span class="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white" style="background:linear-gradient(135deg,#059669,#0d9488)">${c.code}</span>
            </div>
            <div class="text-xs text-slate-500 leading-tight mb-2">${c.label}${c.note ? `<br><span class="opacity-60">${c.note}</span>` : ''}</div>
            <div class="text-2xl font-bold ${cls}">${v != null ? Math.round(v)+'%' : '–'}</div>
        </div>`;
    }).join('');

    const ppeRows = ppeItemRows.map(item => {
        const p      = item.total_count > 0 ? (item.ok_count / item.total_count * 100).toFixed(1) : null;
        const cls    = p === null ? 'text-slate-400' : parseFloat(p) >= 90 ? 'text-emerald-600' : parseFloat(p) >= 70 ? 'text-amber-600' : 'text-red-600';
        const barW   = p !== null ? parseFloat(p) : 0;
        const barBg  = p === null ? '#e2e8f0' : parseFloat(p) >= 90 ? '#059669' : parseFloat(p) >= 70 ? '#d97706' : '#ef4444';
        return `<div class="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
            <span class="text-sm text-slate-700 w-32 flex-shrink-0">${escHtml(item.ItemName)}</span>
            <div class="flex-1 bg-slate-100 rounded-full h-2"><div class="h-2 rounded-full" style="width:${barW}%;background:${barBg}"></div></div>
            <span class="text-xs text-slate-400 w-16 text-right">${item.ok_count}/${item.total_count}</span>
            <span class="text-sm font-bold w-12 text-right ${cls}">${p !== null ? p + '%' : '–'}</span>
        </div>`;
    }).join('');

    const AKEYS2 = ['T1_Score','T2_Score','T3_Score','T4_Score','T5_Score','T7_Score'];
    const ALBLS2 = ['Walk Way','ไม่ใช้โทรศัพท์','ข้ามถนน','หยุดชี้นิ้ว','ไม่ล้วงกระเป๋า','แยกขยะ'];
    const topicAvgs = AKEYS2.map((k,i) => {
        const vals = filteredAsmts.filter(a => a[k] != null).map(a => parseFloat(a[k]));
        return { label: ALBLS2[i], avg: vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : null };
    }).filter(t => t.avg !== null);
    const bestTopic  = topicAvgs.length ? topicAvgs.reduce((b,t) => t.avg > b.avg ? t : b) : null;
    const worstTopic = topicAvgs.length ? topicAvgs.reduce((w,t) => t.avg < w.avg ? t : w) : null;
    const locationStats = assessmentLocationStats(filteredAsmts);
    const locationFollowupPanel = buildAssessmentLocationFocus(filteredAsmts, {
        title: `Assessment Location Follow-up - ${periodLabel}`,
        subtitle: 'Lowest saved inspection points from this dashboard period',
        limit: 4,
    });
    const quickCards = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="ds-metric-card p-4 flex items-center gap-3" data-sc-card-image="safety-culture-dashboard-average">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50">
                <svg class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <div>
                <p class="text-xl font-bold ${overallAvg!==null?(overallAvg<70?'text-red-600':overallAvg<90?'text-amber-600':'text-emerald-600'):'text-slate-400'}">${overallAvg!==null?overallAvg+'%':'—'}</p>
                <p class="text-xs text-slate-500">คะแนนเฉลี่ย ${periodLabel}</p>
            </div>
        </div>
        <div class="ds-metric-card p-4 flex items-center gap-3" data-sc-card-image="safety-culture-dashboard-best-topic">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                <svg class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
            </div>
            <div>
                <p class="text-sm font-bold text-emerald-600 truncate">${bestTopic?escHtml(bestTopic.label):'—'}</p>
                <p class="text-xs text-slate-500">หัวข้อคะแนนสูงสุด${bestTopic?' ('+bestTopic.avg+'%)':''}</p>
            </div>
        </div>
        <div class="ds-metric-card p-4 flex items-center gap-3" data-sc-card-image="safety-culture-dashboard-focus-topic">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${worstTopic&&worstTopic.avg<70?'bg-red-50':'bg-amber-50'}">
                <svg class="w-5 h-5 ${worstTopic&&worstTopic.avg<70?'text-red-500':'text-amber-500'}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"/></svg>
            </div>
            <div>
                <p class="text-sm font-bold ${worstTopic&&worstTopic.avg<70?'text-red-600':'text-amber-600'} truncate">${worstTopic?escHtml(worstTopic.label):'—'}</p>
                <p class="text-xs text-slate-500">หัวข้อต้องพัฒนา${worstTopic?' ('+worstTopic.avg+'%)':''}</p>
            </div>
        </div>
    </div>`;

    // ── Violations summary (period-filtered)
    const violInPeriod = mo === 0 ? _ppeViolations
        : _ppeViolations.filter(v => v.ViolationDate &&
            parseInt(String(v.ViolationDate).substring(5,7),10) === mo);
    const violVerbal   = violInPeriod.filter(v => v.WarningLevel === 'verbal').length;
    const violNotice   = violInPeriod.filter(v => v.WarningLevel === 'safety_notice').length;
    const violWritten  = violInPeriod.filter(v => v.WarningLevel === 'written_warning').length;
    const violStrip = violInPeriod.length > 0 ? `
    <div class="ds-section p-4" data-sc-card-image="safety-culture-ppe-violation-summary">
        <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-slate-700 text-sm">PPE Violation Summary — ${periodLabel}</h3>
            <button onclick="window._scSetTab('ppe');setTimeout(()=>window._scSetPPESub('violations'),80)" class="text-xs text-emerald-600 hover:underline font-medium">ดูทั้งหมด →</button>
        </div>
        <div class="grid grid-cols-3 gap-3">
            <div class="rounded-xl p-3 text-center" style="background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3)">
                <p class="text-2xl font-bold text-amber-600">${violVerbal}</p>
                <p class="text-xs text-amber-700 mt-0.5">ตักเตือนวาจา</p>
            </div>
            <div class="rounded-xl p-3 text-center" style="background:rgba(249,115,22,0.12);border:1px solid rgba(249,115,22,0.3)">
                <p class="text-2xl font-bold text-orange-600">${violNotice}</p>
                <p class="text-xs text-orange-700 mt-0.5">ใบแจ้งความปลอดภัย</p>
            </div>
            <div class="rounded-xl p-3 text-center" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3)">
                <p class="text-2xl font-bold text-red-600">${violWritten}</p>
                <p class="text-xs text-red-700 mt-0.5">ใบเตือนลายลักษณ์อักษร</p>
            </div>
        </div>
    </div>` : '';

    const lowTopicCount = computedAvgs.filter(v => v != null && v < 70).length + (ppePct != null && ppePct < 90 ? 1 : 0);
    const ppeFailCount = filteredPPE.filter(r => !(r.IsPass===1||r.IsPass==='1')).length;
    const readinessStatus = overallAvg == null
        ? { label: 'No Data', value: '—', border: 'border-slate-200', bg: 'bg-white', text: 'text-slate-600' }
        : overallAvg >= 90 && (ppePct == null || ppePct >= 90) && violInPeriod.length === 0
            ? { label: 'Enterprise Ready', value: 'Stable', border: 'border-emerald-100', bg: 'bg-emerald-50', text: 'text-emerald-700' }
            : overallAvg >= 70
                ? { label: 'Monitor', value: 'Watch', border: 'border-amber-100', bg: 'bg-amber-50', text: 'text-amber-700' }
                : { label: 'Action Needed', value: 'Risk', border: 'border-red-100', bg: 'bg-red-50', text: 'text-red-700' };
    const enterpriseStrip = `
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <button onclick="window._scSetTab('dashboard')" class="text-left rounded-xl border ${readinessStatus.border} ${readinessStatus.bg} px-4 py-3 hover:shadow-sm transition-shadow">
            <p class="text-[10px] font-bold uppercase ${readinessStatus.text}">Culture Readiness</p>
            <p class="mt-1 text-sm font-black ${readinessStatus.text}">${readinessStatus.value}</p>
            <p class="mt-1 text-[11px] text-slate-500">${readinessStatus.label}</p>
        </button>
        <button onclick="window._scSetTab('assessment')" class="text-left rounded-xl border ${lowTopicCount ? 'border-amber-100 bg-amber-50' : 'border-emerald-100 bg-emerald-50'} px-4 py-3 hover:shadow-sm transition-shadow">
            <p class="text-[10px] font-bold uppercase ${lowTopicCount ? 'text-amber-600' : 'text-emerald-600'}">Weak Topics</p>
            <p class="mt-1 text-sm font-black ${lowTopicCount ? 'text-amber-700' : 'text-emerald-700'}">${lowTopicCount}</p>
            <p class="mt-1 text-[11px] text-slate-500">Below target</p>
        </button>
        <button onclick="window._scSetTab('ppe')" class="text-left rounded-xl border ${ppePct != null && ppePct < 90 ? 'border-amber-100 bg-amber-50' : 'border-slate-200 bg-white'} px-4 py-3 hover:shadow-sm transition-shadow">
            <p class="text-[10px] font-bold uppercase ${ppePct != null && ppePct < 90 ? 'text-amber-600' : 'text-slate-500'}">PPE Compliance</p>
            <p class="mt-1 text-sm font-black ${ppePct != null && ppePct < 90 ? 'text-amber-700' : 'text-slate-700'}">${ppePct != null ? Math.round(ppePct) + '%' : '—'}</p>
            <p class="mt-1 text-[11px] text-slate-500">${ppeFailCount} fail records</p>
        </button>
        <button onclick="window._scSetTab('ppe');setTimeout(()=>window._scSetPPESub('violations'),80)" class="text-left rounded-xl border ${violInPeriod.length ? 'border-red-100 bg-red-50' : 'border-slate-200 bg-white'} px-4 py-3 hover:shadow-sm transition-shadow">
            <p class="text-[10px] font-bold uppercase ${violInPeriod.length ? 'text-red-600' : 'text-slate-500'}">PPE Violations</p>
            <p class="mt-1 text-sm font-black ${violInPeriod.length ? 'text-red-700' : 'text-slate-700'}">${violInPeriod.length}</p>
            <p class="mt-1 text-[11px] text-slate-500">${periodLabel}</p>
        </button>
        <button onclick="window._scExportPDF()" class="text-left rounded-xl border border-slate-200 bg-white px-4 py-3 hover:shadow-sm transition-shadow">
            <p class="text-[10px] font-bold uppercase text-slate-500">Executive Pack</p>
            <p class="mt-1 text-sm font-black text-slate-700">PDF</p>
            <p class="mt-1 text-[11px] text-slate-500">Dashboard report</p>
        </button>
    </div>`;

    // ── Dept PPE breakdown (sorted by total inspections)
    const deptMap = {};
    filteredPPE.forEach(r => {
        const d = (r.Department || '').trim(); if (!d) return;
        if (!deptMap[d]) deptMap[d] = { pass: 0, fail: 0 };
        if (r.IsPass===1||r.IsPass==='1') deptMap[d].pass++; else deptMap[d].fail++;
    });
    const deptRows = Object.entries(deptMap)
        .map(([d, v]) => ({ dept: d, total: v.pass+v.fail, pass: v.pass, pct: Math.round(v.pass/(v.pass+v.fail)*100) }))
        .sort((a,b) => b.total - a.total).slice(0, 8);
    const deptBreakdown = deptRows.length > 1 ? `
    <div class="ds-section p-5" data-sc-card-image="safety-culture-ppe-department-breakdown">
        <h3 class="font-semibold text-slate-700 mb-4 text-sm">PPE Compliance by Department — ${periodLabel}</h3>
        <div class="space-y-2.5">
        ${deptRows.map(r => {
            const bg  = r.pct >= 90 ? '#059669' : r.pct >= 70 ? '#d97706' : '#ef4444';
            const cls = r.pct >= 90 ? 'text-emerald-600' : r.pct >= 70 ? 'text-amber-600' : 'text-red-600';
            return `<div class="flex items-center gap-3">
                <span class="text-xs text-slate-600 w-36 flex-shrink-0 truncate" title="${escHtml(r.dept)}">${escHtml(r.dept)}</span>
                <div class="flex-1 bg-slate-100 rounded-full h-2.5"><div class="h-2.5 rounded-full" style="width:${r.pct}%;background:${bg}"></div></div>
                <span class="text-xs text-slate-400 w-10 text-right">${r.pass}/${r.total}</span>
                <span class="text-xs font-bold w-10 text-right ${cls}">${r.pct}%</span>
            </div>`;
        }).join('')}
        </div>
    </div>` : '';

    const actionTopics = [
        { code: 'T1', label: 'เดินบน Walk Way', score: computedAvgs[0], target: 70, action: 'ทบทวนเส้นทาง Walk Way และเพิ่มการสื่อสารหน้าพื้นที่' },
        { code: 'T2', label: 'ไม่ใช้โทรศัพท์ขณะเดิน', score: computedAvgs[1], target: 70, action: 'สื่อสารย้ำจุดเสี่ยงและสุ่มสังเกตช่วงพัก/เปลี่ยนกะ' },
        { code: 'T3', label: 'ข้ามถนนทางม้าลาย', score: computedAvgs[2], target: 70, action: 'ตรวจสภาพทางม้าลาย ป้ายเตือน และจุดข้ามประจำ' },
        { code: 'T4', label: 'หยุดยืนชี้นิ้ว', score: computedAvgs[3], target: 70, action: 'จัดย้ำ Pointing & Calling พร้อมติดตามหน้างานรายสัปดาห์' },
        { code: 'T5', label: 'ไม่ล้วงกระเป๋า', score: computedAvgs[4], target: 70, action: 'เพิ่มโปสเตอร์/กิจกรรมเตือนพฤติกรรมขณะเดินในพื้นที่เสี่ยง' },
        { code: 'T6', label: 'PPE Control', score: ppePct, target: 90, action: ppePct == null ? 'เริ่มบันทึก PPE Inspection เพื่อปิดช่องข้อมูล' : 'ทบทวน PPE template และติดตามรายการไม่ผ่าน' },
        { code: 'T7', label: 'แยกขยะถูกต้อง', score: computedAvgs[5], target: 70, action: 'สื่อสารมาตรฐานการแยกขยะและตรวจจุดทิ้งขยะหลัก' },
    ];
    const priorityItems = actionTopics
        .filter(t => t.score == null || parseFloat(t.score) < t.target)
        .sort((a, b) => {
            if (a.score == null && b.score != null) return -1;
            if (a.score != null && b.score == null) return 1;
            return parseFloat(a.score || 0) - parseFloat(b.score || 0);
        });
    if (ppeFailCount > 0 && !priorityItems.some(t => t.code === 'T6')) {
        priorityItems.push({ code: 'T6', label: 'PPE Control', score: ppePct, target: 90, action: `ติดตาม PPE Inspection ที่ไม่ผ่าน ${ppeFailCount} รายการ` });
    }
    const focusRows = priorityItems.slice(0, 4).map((item, idx) => {
        const missing = item.score == null;
        const score = missing ? null : Math.round(parseFloat(item.score));
        const severity = missing ? 'Data Gap' : score < 70 ? 'Urgent' : 'Monitor';
        const badge = missing
            ? 'bg-slate-100 text-slate-600 border-slate-200'
            : score < 70
                ? 'bg-red-50 text-red-700 border-red-100'
                : 'bg-amber-50 text-amber-700 border-amber-100';
        const dot = missing ? 'bg-slate-400' : score < 70 ? 'bg-red-500' : 'bg-amber-500';
        return `<div class="flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black text-white" style="background:${idx === 0 ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'linear-gradient(135deg,#059669,#0d9488)'}">${item.code}</div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                    <p class="text-sm font-bold text-slate-800 truncate">${escHtml(item.label)}</p>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${badge}">
                        <span class="w-1.5 h-1.5 rounded-full ${dot}"></span>${severity}
                    </span>
                </div>
                <p class="text-xs text-slate-500 mt-1 leading-relaxed">${escHtml(item.action)}</p>
                <div class="mt-2 flex items-center gap-2">
                    <div class="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div class="h-1.5 rounded-full" style="width:${missing ? 0 : Math.max(0, Math.min(100, score))}%;background:${missing ? '#cbd5e1' : score < 70 ? '#ef4444' : '#d97706'}"></div>
                    </div>
                    <span class="text-xs font-black ${missing ? 'text-slate-400' : score < 70 ? 'text-red-600' : 'text-amber-600'}">${missing ? '—' : score + '%'}</span>
                </div>
            </div>
        </div>`;
    }).join('');
    const actionPanel = `
    <div class="ds-section p-5" data-sc-card-image="safety-culture-action-focus">
        <div class="flex items-start justify-between gap-4 mb-4">
            <div>
                <h3 class="font-semibold text-slate-700">Action Focus — ${periodLabel}</h3>
                <p class="text-xs text-slate-400 mt-1">หัวข้อเร่งติดตามจากคะแนน Assessment และ PPE</p>
            </div>
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${priorityItems.length ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}">
                ${priorityItems.length ? `${priorityItems.length} Focus` : 'Stable'}
            </span>
        </div>
        <div class="space-y-3">
            ${focusRows || `<div class="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-5 text-center">
                <p class="text-sm font-bold text-emerald-700">ไม่มีหัวข้อเร่งด่วนในช่วงนี้</p>
                <p class="text-xs text-emerald-600 mt-1">รักษามาตรฐานและติดตามผลต่อเนื่องในรอบถัดไป</p>
            </div>`}
        </div>
        <div class="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onclick="window._scSetTab('assessment')" class="btn btn-secondary h-9 px-3 text-xs">Assessment</button>
            <button type="button" onclick="window._scSetTab('ppe')" class="btn btn-primary h-9 px-3 text-xs">PPE Control</button>
        </div>
    </div>`;

    return `
    <div class="space-y-5">
        ${monthFilterBar}
        ${quickCards}
        ${mat ? `
        <div class="ds-section p-5 border-l-4 ${mat.border}" data-sc-card-image="safety-culture-maturity-level">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-sm text-slate-500 font-medium">Culture Maturity Level — ${periodLabel}</p>
                    <div class="flex items-center gap-3 mt-2">
                        <span class="text-4xl font-bold ${mat.color}">${overallAvg}%</span>
                        <span class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-bold text-sm ${mat.bg} ${mat.color}"><span class="w-2 h-2 rounded-full inline-block ${mat.dot}"></span>${mat.label}</span>
                    </div>
                </div>
                <div class="hidden md:block text-right text-sm text-slate-500">
                    <div>จาก ${filteredAsmts.length} รายการประเมิน</div>
                    <div>${filteredPPE.length} ครั้งตรวจ PPE · ${violInPeriod.length} การฝ่าฝืน</div>
                </div>
            </div>
        </div>` : `
        <div class="ds-empty-state p-10 text-center text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            </div>
            <p>ยังไม่มีข้อมูลการประเมิน${mo>0?`สำหรับ${periodLabel}`:''} — กรุณาบันทึกผลในแท็บ "ผลการประเมิน"</p>
        </div>`}

        ${violStrip}

        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">${scoreCards}</div>

        ${locationStats.length ? locationFollowupPanel : ''}

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="ds-section p-5">
                <h3 class="font-semibold text-slate-700 mb-4">คะแนนเฉลี่ยแต่ละหัวข้อ — Radar Chart <span class="text-xs font-normal text-slate-400">${periodLabel}</span></h3>
                <div class="relative" data-sc-card-image="safety-culture-radar-chart" style="height:280px"><canvas id="sc-radar-chart"></canvas></div>
            </div>
            <div class="ds-section p-5">
                <h3 class="font-semibold text-slate-700 mb-4">คะแนนแต่ละหัวข้อ — Bar Chart <span class="text-xs font-normal text-slate-400">${periodLabel}</span></h3>
                <div class="relative" data-sc-card-image="safety-culture-bar-chart" style="height:280px"><canvas id="sc-bar-chart"></canvas></div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="ds-section p-5">
                <h3 class="font-semibold text-slate-700 mb-4">แนวโน้มคะแนนเฉลี่ยรายปี — Trend <span class="text-xs font-normal text-slate-400">(แสดงเฉพาะรายปี)</span></h3>
                <div class="relative" data-sc-card-image="safety-culture-trend-chart" style="height:220px"><canvas id="sc-line-chart"></canvas></div>
            </div>
            ${ppeRows.length ? `
            <div class="ds-section p-5" data-sc-card-image="safety-culture-dashboard-ppe-items">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-semibold text-slate-700">PPE Compliance per Item — ${periodLabel}</h3>
                    <span class="text-xs text-slate-400">${filteredPPE.length} ครั้งตรวจ</span>
                </div>
                ${ppeRows}
            </div>` : actionPanel}
        </div>

        ${deptBreakdown}
    </div>`;
}

// ── Charts ─────────────────────────────────────────────────────────────────
function initCharts() {
    const trend = _dashData?.yearTrend || [];

    // Use pre-computed scores from buildDashboardHtml() (respects month filter)
    const scores = _dashScores || [0,0,0,0,0,0,0];

    const barColors = scores.map(s => s === 0 ? '#cbd5e1' : s >= 90 ? '#059669' : s >= 70 ? '#d97706' : '#ef4444');
    const barBorderColors = scores.map(s => s === 0 ? '#94a3b8' : s >= 90 ? '#047857' : s >= 70 ? '#b45309' : '#dc2626');

    const radarEl = document.getElementById('sc-radar-chart');
    if (radarEl) {
        const pointColors = scores.map(s => s === 0 ? '#94a3b8' : s >= 90 ? '#059669' : s >= 70 ? '#d97706' : '#ef4444');
        _radarChart = new Chart(radarEl, {
            type: 'radar',
            data: {
                labels: TOPIC_LABELS,
                datasets: [{ label: _filterDashMonth > 0 ? `เดือน ${_filterDashMonth}/${_filterYear}` : `ปี ${_filterYear}`, data: scores,
                    backgroundColor: 'rgba(5,150,105,0.12)', borderColor: '#059669',
                    borderWidth: 2, pointBackgroundColor: pointColors, pointBorderColor: pointColors, pointRadius: 5 }],
            },
            options: { responsive: true, maintainAspectRatio: false,
                scales: { r: { min: 0, max: 100, ticks: { stepSize: 20, font: { size: 9 } }, pointLabels: { font: { size: 10 } } } },
                plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: ctx => {
                        const v = ctx.raw;
                        const lbl = v === 0 ? 'N/A' : v >= 90 ? 'ผ่าน' : v >= 70 ? 'ต้องปรับปรุง' : 'ต้องแก้ไขด่วน';
                        return `${v > 0 ? v.toFixed(1) + '%' : 'N/A'} (${lbl})`;
                    }}}},
            },
        });
    }

    const barEl = document.getElementById('sc-bar-chart');
    if (barEl) {
        _barChart = new Chart(barEl, {
            type: 'bar',
            data: {
                labels: TOPIC_LABELS.map(l => l.length > 12 ? l.slice(0, 11) + '…' : l),
                datasets: [{ data: scores, backgroundColor: barColors, borderColor: barBorderColors, borderWidth: 1.5, borderRadius: 6 }],
            },
            options: { responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { min: 0, max: 100, ticks: { stepSize: 20, font: { size: 10 }, callback: v => v + '%' } },
                    x: { ticks: { font: { size: 9 } } },
                },
                plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } } } },
        });
    }

    const lineEl = document.getElementById('sc-line-chart');
    if (lineEl && trend.length) {
        _lineChart = new Chart(lineEl, {
            type: 'line',
            data: {
                labels: trend.map(t => t.AssessmentYear),
                datasets: [{ label: 'คะแนนเฉลี่ย (%)',
                    data: trend.map(t => Math.round(parseFloat(t.avg_score || 0))),
                    borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.1)',
                    borderWidth: 2.5, pointRadius: 5, fill: true, tension: 0.35 }],
            },
            options: { responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { min: 0, max: 100, ticks: { stepSize: 20, font: { size: 10 }, callback: v => v + '%' } },
                    x: { ticks: { font: { size: 11 } } },
                },
                plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ctx.raw + '%' } } } },
        });
    }
}

// ── Principle Form ─────────────────────────────────────────────────────────
function openPrincipleForm(id) {
    const p = _principles.find(x => x.PrincipleID === id);
    if (!p) return;
    openModal(`แก้ไขหัวข้อที่ ${p.SortOrder}`, `
    <form id="sc-pf" class="space-y-4">
        <input type="hidden" name="PrincipleID" value="${escHtml(p.PrincipleID)}">
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อหัวข้อ</label>
            <input name="Title" type="text" required value="${escHtml(p.Title)}" class="form-input w-full"></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">คำอธิบาย</label>
            <textarea name="Description" rows="3" class="form-textarea w-full resize-none">${escHtml(p.Description || '')}</textarea></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">URL รูปภาพ</label>
            <input name="ImageUrl" type="url" value="${escHtml(p.ImageUrl || '')}" placeholder="https://..." class="form-input w-full"></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">อัปโหลดรูปภาพ / Upload Image</label>
            <input id="sc-pf-image-file" type="file" accept="image/*" class="form-input w-full">
            <p class="text-xs text-slate-400 mt-1">ถ้าเลือกไฟล์ ระบบจะอัปโหลดเข้า server และแทนที่ URL รูปภาพด้านบน</p></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">URL ไฟล์แนบ (Download)</label>
            <input name="AttachmentUrl" type="url" value="${escHtml(p.AttachmentUrl || '')}" placeholder="https://..." class="form-input w-full"></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">อัปโหลดเอกสาร / Upload Document</label>
            <input id="sc-pf-doc-file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" class="form-input w-full">
            <p class="text-xs text-slate-400 mt-1">รองรับ PDF, Office และรูปภาพ ระบบจะกรอก URL และชื่อไฟล์ให้อัตโนมัติ</p></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อไฟล์แนบ</label>
            <input name="AttachmentName" type="text" value="${escHtml(p.AttachmentName || '')}" placeholder="เช่น คู่มือ Walk Way.pdf" class="form-input w-full"></div>
        <label class="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 cursor-pointer">
            <input name="IsFeatured" type="checkbox" class="mt-1 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500" ${(p.IsFeatured === 1 || p.IsFeatured === '1' || p.IsFeatured === true) ? 'checked' : ''}>
            <span>
                <span class="block text-sm font-bold text-slate-800">ตั้งเป็น Featured Campaign / Set as Featured</span>
                <span class="block text-xs text-slate-500 mt-0.5">เลือกได้ครั้งละ 1 การ์ดเท่านั้น ถ้าเลือกใบนี้ ระบบจะยกเลิก Featured ใบเดิมอัตโนมัติ</span>
            </span>
        </label>
        <div id="sc-pf-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="sc-pf-submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-lg');

    setTimeout(() => {
        document.getElementById('sc-pf')?.addEventListener('submit', guardSubmitHandler(async e => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data  = Object.fromEntries(formData.entries());
            data.IsFeatured = formData.has('IsFeatured') ? 1 : 0;
            const errEl = document.getElementById('sc-pf-err');
            const submitBtn = document.getElementById('sc-pf-submit');
            if (submitBtn?.disabled) return;
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'กำลังบันทึก...'; }
            let newImageUrl = '';
            let newDocUrl = '';
            try {
                const imageFile = document.getElementById('sc-pf-image-file')?.files?.[0];
                const docFile = document.getElementById('sc-pf-doc-file')?.files?.[0];
                if (imageFile) {
                    const uploaded = await uploadSafetyCultureFile(imageFile, 'รูปภาพ');
                    newImageUrl = uploaded.url;
                    data.ImageUrl = uploaded.url;
                }
                if (docFile) {
                    const uploaded = await uploadSafetyCultureFile(docFile, 'เอกสาร');
                    newDocUrl = uploaded.url;
                    data.AttachmentUrl = uploaded.url;
                    data.AttachmentName = uploaded.originalName || getUploadDisplayName(uploaded.url, docFile.name);
                }
                await API.put(`/safety-culture/principles/${data.PrincipleID}`, data);
                closeModal();
                showToast('บันทึกสำเร็จ', 'success');
                await _loadHeroStats();
            } catch (err) {
                await cleanupUploadedUrl(newImageUrl);
                await cleanupUploadedUrl(newDocUrl);
                errEl.textContent = escHtml(err.message || 'เกิดข้อผิดพลาด');
                errEl.classList.remove('hidden');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'บันทึก'; }
            }
        }));
    }, 50);
}

// ── Assessment Form ────────────────────────────────────────────────────────
async function openAssessmentForm(id) {
    const a     = id ? _assessments.find(x => x.AssessmentID === id) : null;
    const today = new Date().toISOString().split('T')[0];

    if (_assessmentLocations.length === 0) {
        try {
            const r = await API.get('/safety-culture/assessment-locations?all=1');
            _assessmentLocations = r.data || [];
        } catch { _assessmentLocations = []; }
    }

    const WALK_TOPICS = [
        { key: 'T1', label: '1. เดินบน Walk Way' },
        { key: 'T2', label: '2. ไม่ใช้โทรศัพท์ขณะเดิน' },
        { key: 'T3', label: '3. ข้ามถนนทางม้าลาย' },
        { key: 'T4', label: '4. หยุดยืนชี้นิ้ว' },
        { key: 'T5', label: '5. ไม่ล้วงกระเป๋า' },
    ];
    const WASTE_TOPIC = { key: 'T7', label: '7. แยกขยะถูกต้อง' };
    const ALL_TOPIC_KEYS = [...WALK_TOPICS.map(t => t.key), WASTE_TOPIC.key];

    const getPoint = (tk, pn) => {
        if (!a?.points) return '';
        const pt = a.points.find(p => p.TopicKey === tk && parseInt(p.PointNo) === pn);
        return pt || null;
    };

    const savedPointLocation = (topicKeys, pn) => {
        const keys = Array.isArray(topicKeys) ? topicKeys : [topicKeys];
        const pt = keys.map(k => getPoint(k, pn)).find(p => p?.LocationID || p?.LocationName);
        return {
            id: pt?.LocationID || '',
            name: pt?.LocationName || '',
        };
    };

    const locationOptions = (kind, saved = {}) => {
        const isWaste = kind === 'waste';
        const activeRows = _assessmentLocations.filter(loc => {
            const active = Number(loc.IsActive) !== 0 || loc.LocationID === saved.id;
            if (!active) return false;
            const group = String(loc.LocationGroup || '').toLowerCase();
            const applies = String(loc.AppliesTo || '').toLowerCase();
            if (applies === 'all') return true;
            if (isWaste) return group === 'waste' || applies === 't7';
            return group === 'walkway' || applies === 't1-t5';
        });
        const hasSavedNameOnly = saved.name && !activeRows.some(loc => loc.LocationID === saved.id || loc.LocationName === saved.name);
        const opts = [
            '<option value="">— เลือกจุดตรวจ —</option>',
            ...activeRows.map(loc => `<option value="${escHtml(loc.LocationID)}" data-name="${escHtml(loc.LocationName)}" ${loc.LocationID === saved.id ? 'selected' : ''}>${escHtml(loc.LocationName)}</option>`),
            hasSavedNameOnly ? `<option value="" data-name="${escHtml(saved.name)}" selected>${escHtml(saved.name)} (ข้อมูลเดิม)</option>` : '',
        ].join('');
        return opts || '<option value="">— ยังไม่มีจุดตรวจ —</option>';
    };

    const hiddenScores = ALL_TOPIC_KEYS.map(tk => {
        const existingScore = a ? (a[`${tk}_Score`] != null ? Math.round(parseFloat(a[`${tk}_Score`])) : '') : '';
        return `<input type="hidden" name="${tk}_Score" id="sc-hidden-${tk}" value="${existingScore}">`;
    }).join('');

    const scoreChips = ALL_TOPIC_KEYS.map(tk => `
        <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
            ${tk}: <span id="sc-wscore-${tk}" class="text-slate-400">—%</span>
        </span>`).join('');

    const topicRow = (topic, pn) => {
        const pt = getPoint(topic.key, pn);
        return `
        <div class="grid grid-cols-[1fr_88px_88px_54px] gap-2 items-center py-1.5">
            <span class="text-xs font-medium text-slate-600">${topic.label}</span>
            <input type="number" min="0" placeholder="จำนวน" id="sc-tot-${topic.key}-${pn}" value="${pt?.TotalPeople ?? ''}" class="form-input text-xs py-1.5 w-full" style="min-width:0">
            <input type="number" min="0" placeholder="ปฏิบัติ" id="sc-cmp-${topic.key}-${pn}" value="${pt?.ComplyPeople ?? ''}" class="form-input text-xs py-1.5 w-full" style="min-width:0">
            <span id="sc-pct-${topic.key}-${pn}" class="text-xs font-semibold text-right text-slate-400">—%</span>
        </div>`;
    };

    const walkPointBlocks = [1,2,3].map(pn => {
        const saved = savedPointLocation(WALK_TOPICS.map(t => t.key), pn);
        return `
        <div class="rounded-xl border border-slate-100 overflow-hidden">
            <div class="px-3 py-2 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2">
                <span class="text-sm font-bold text-slate-700 sm:w-16 flex-shrink-0">จุดที่ ${pn}</span>
                <select id="sc-loc-walk-${pn}" class="form-input text-sm py-1.5 flex-1">
                    ${locationOptions('walkway', saved)}
                </select>
            </div>
            <div class="px-3 py-2">
                <div class="grid grid-cols-[1fr_88px_88px_54px] gap-2 items-center border-b border-slate-50 pb-1 mb-1">
                    <span class="text-[11px] font-semibold text-slate-400">หัวข้อ</span>
                    <span class="text-[11px] font-semibold text-slate-400 text-center">จำนวน</span>
                    <span class="text-[11px] font-semibold text-slate-400 text-center">ปฏิบัติ</span>
                    <span class="text-[11px] font-semibold text-slate-400 text-right">%</span>
                </div>
                ${WALK_TOPICS.map(t => topicRow(t, pn)).join('')}
            </div>
        </div>`;
    }).join('');

    const wastePointBlocks = [1,2,3].map(pn => {
        const saved = savedPointLocation(WASTE_TOPIC.key, pn);
        const pt = getPoint(WASTE_TOPIC.key, pn);
        return `
        <div class="grid grid-cols-[72px_minmax(180px,1fr)_88px_88px_54px] gap-2 items-center py-1.5">
            <span class="text-xs font-bold text-slate-500">จุดที่ ${pn}</span>
            <select id="sc-loc-waste-${pn}" class="form-input text-xs py-1.5 w-full">
                ${locationOptions('waste', saved)}
            </select>
            <input type="number" min="0" placeholder="จำนวน" id="sc-tot-${WASTE_TOPIC.key}-${pn}" value="${pt?.TotalPeople ?? ''}" class="form-input text-xs py-1.5 w-full" style="min-width:0">
            <input type="number" min="0" placeholder="ปฏิบัติ" id="sc-cmp-${WASTE_TOPIC.key}-${pn}" value="${pt?.ComplyPeople ?? ''}" class="form-input text-xs py-1.5 w-full" style="min-width:0">
            <span id="sc-pct-${WASTE_TOPIC.key}-${pn}" class="text-xs font-semibold text-right text-slate-400">—%</span>
        </div>`;
    }).join('');

    openModal(a ? 'แก้ไขผลการประเมิน' : 'บันทึกผลการประเมิน', `
    <form id="sc-af" class="space-y-4">
        ${a ? `<input type="hidden" name="AssessmentID" value="${escHtml(a.AssessmentID)}">` : ''}
        ${hiddenScores}
        <input type="hidden" name="Area" id="sc-area-summary" value="${escHtml(a?.Area || 'หลายจุดตรวจ')}">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="sm:col-span-2"><label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่ประเมิน</label>
                <input name="AssessmentDate" type="date" required value="${a?.AssessmentDate ? String(a.AssessmentDate).substring(0,10) : today}" class="form-input w-full"></div>
            <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">สัปดาห์</label>
                <select name="WeekNo" class="form-input w-full">
                    <option value="">—</option>
                    ${[1,2,3,4].map(w => `<option value="${w}" ${a?.WeekNo == w ? 'selected' : ''}>W${w}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
            <div class="flex flex-wrap items-center gap-2 justify-between">
                <p class="text-xs text-emerald-800 font-semibold">เลือกจุดตรวจจาก Master ของ Safety Culture แล้วกรอกจำนวน/ปฏิบัติตามตามจุดจริง</p>
                <div class="flex flex-wrap gap-1.5">${scoreChips}</div>
            </div>
        </div>
        <div class="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
            หัวข้อที่ 6 (PPE Control) ไม่ต้องกรอกที่นี่ — คำนวณจาก PPE Inspection Checklist
        </div>
        <div class="rounded-xl border border-slate-100 overflow-hidden">
            <div class="px-4 py-3 bg-white border-b border-slate-100">
                <h3 class="text-sm font-bold text-slate-800">จุดเดินตรวจ / Walkway & Crossing</h3>
                <p class="text-xs text-slate-400 mt-0.5">แต่ละจุดตรวจให้กรอกครบหัวข้อ 1-5 ตามรอบเดินตรวจเดียวกัน</p>
            </div>
            <div class="p-3 space-y-3">${walkPointBlocks}</div>
        </div>
        <div class="rounded-xl border border-slate-100 overflow-hidden">
            <div class="px-4 py-3 bg-white border-b border-slate-100">
                <h3 class="text-sm font-bold text-slate-800">แยกขยะถูกต้อง / Waste Sorting</h3>
                <p class="text-xs text-slate-400 mt-0.5">ตรวจแยกจากจุดเดินตรวจได้ เลือกจุดถังขยะ/พื้นที่ทิ้งขยะแล้วกรอกเฉพาะหัวข้อ 7</p>
            </div>
            <div class="p-3 overflow-x-auto min-w-full">
                <div class="grid grid-cols-[72px_minmax(180px,1fr)_88px_88px_54px] gap-2 items-center border-b border-slate-50 pb-1 mb-1 min-w-[560px]">
                    <span class="text-[11px] font-semibold text-slate-400">จุด</span>
                    <span class="text-[11px] font-semibold text-slate-400">จุดตรวจ</span>
                    <span class="text-[11px] font-semibold text-slate-400 text-center">จำนวน</span>
                    <span class="text-[11px] font-semibold text-slate-400 text-center">ปฏิบัติ</span>
                    <span class="text-[11px] font-semibold text-slate-400 text-right">%</span>
                </div>
                <div class="min-w-[560px]">${wastePointBlocks}</div>
            </div>
        </div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
            <textarea name="Notes" rows="2" class="form-textarea w-full resize-none">${escHtml(a?.Notes || '')}</textarea></div>
        <div id="sc-af-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="sc-af-submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-4xl');

    setTimeout(() => {
        const TKEYS = ALL_TOPIC_KEYS;

        // Init display for existing point data
        TKEYS.forEach(tk => {
            [1,2,3].forEach(pn => updatePointPct(tk, pn));
            updateTopicScore(tk);
        });

        // Live recalc on any point input
        TKEYS.forEach(tk => {
            [1,2,3].forEach(pn => {
                ['tot','cmp'].forEach(f => {
                    document.getElementById(`sc-${f}-${tk}-${pn}`)?.addEventListener('input', () => {
                        updatePointPct(tk, pn);
                        updateTopicScore(tk);
                    });
                });
            });
        });

        function updatePointPct(tk, pn) {
            const totEl = document.getElementById(`sc-tot-${tk}-${pn}`);
            const cmpEl = document.getElementById(`sc-cmp-${tk}-${pn}`);
            const pctEl = document.getElementById(`sc-pct-${tk}-${pn}`);
            if (!totEl || !cmpEl || !pctEl) return;
            const tot = parseInt(totEl.value) || 0;
            const cmp = parseInt(cmpEl.value) || 0;
            if (tot > 0) {
                const p = Math.round((cmp / tot) * 100);
                pctEl.textContent = p + '%';
                pctEl.className = `text-xs font-semibold w-12 text-right flex-shrink-0 ${p < 70 ? 'text-red-500' : p < 90 ? 'text-amber-500' : 'text-emerald-600'}`;
            } else {
                pctEl.textContent = '—%';
                pctEl.className = 'text-xs font-semibold w-12 text-right flex-shrink-0 text-slate-400';
            }
        }

        function updateTopicScore(tk) {
            const pcts = [1,2,3].map(pn => {
                const tot = parseInt(document.getElementById(`sc-tot-${tk}-${pn}`)?.value) || 0;
                const cmp = parseInt(document.getElementById(`sc-cmp-${tk}-${pn}`)?.value) || 0;
                return tot > 0 ? (cmp / tot) * 100 : null;
            }).filter(p => p !== null);
            const scoreEl  = document.getElementById(`sc-wscore-${tk}`);
            const hiddenEl = document.getElementById(`sc-hidden-${tk}`);
            if (pcts.length > 0) {
                const avg = Math.round(pcts.reduce((a,b) => a+b, 0) / pcts.length);
                if (scoreEl) {
                    scoreEl.textContent = avg + '%';
                    scoreEl.className = avg < 70 ? 'text-red-500' : avg < 90 ? 'text-amber-600' : 'text-emerald-700';
                }
                if (hiddenEl) hiddenEl.value = avg;
            } else {
                const existing = hiddenEl?.value ? parseFloat(hiddenEl.value) : null;
                if (scoreEl) {
                    scoreEl.textContent = existing != null && !isNaN(existing) ? Math.round(existing) + '%' : '—%';
                    scoreEl.className = 'text-slate-400';
                }
            }
        }

        function selectedLocation(kind, pn) {
            const sel = document.getElementById(`sc-loc-${kind}-${pn}`);
            const opt = sel?.selectedOptions?.[0];
            if (!sel?.value && !opt?.dataset?.name) return { id: '', name: '' };
            return {
                id: sel?.value || '',
                name: opt?.dataset?.name || opt?.textContent?.replace(/\s*\(ข้อมูลเดิม\)\s*$/, '').trim() || '',
            };
        }

        function summarizeArea(points) {
            const names = [...new Set(points.map(p => p.LocationName).filter(Boolean))];
            if (names.length === 0) return 'หลายจุดตรวจ';
            if (names.length === 1) return names[0];
            return `หลายจุดตรวจ (${names.length} จุด)`;
        }

        document.getElementById('sc-af')?.addEventListener('submit', guardSubmitHandler(async e => {
            e.preventDefault();
            const fd    = new FormData(e.target);
            const data  = Object.fromEntries(fd.entries());
            const errEl = document.getElementById('sc-af-err');
            const submitBtn = document.getElementById('sc-af-submit');
            if (submitBtn?.disabled) return;
            errEl?.classList.add('hidden');

            // Collect points
            const points = [];
            let validationError = '';

            const collectTopicPoint = (tk, pn, kind) => {
                const loc = selectedLocation(kind, pn);
                const tot = parseInt(document.getElementById(`sc-tot-${tk}-${pn}`)?.value) || 0;
                const cmp = parseInt(document.getElementById(`sc-cmp-${tk}-${pn}`)?.value) || 0;
                if (cmp > tot) {
                    validationError = `จุดประเมิน ${tk} จุดที่ ${pn}: จำนวนคนที่ปฏิบัติตามต้องไม่มากกว่าจำนวนทั้งหมด`;
                }
                if ((tot > 0 || cmp > 0) && !loc.name) {
                    validationError = `กรุณาเลือกจุดตรวจสำหรับ ${tk} จุดที่ ${pn}`;
                }
                if (tot > 0 || cmp > 0) {
                    points.push({ TopicKey: tk, PointNo: pn, LocationID: loc.id, LocationName: loc.name, TotalPeople: tot, ComplyPeople: cmp });
                }
            };

            [1,2,3].forEach(pn => {
                WALK_TOPICS.forEach(t => collectTopicPoint(t.key, pn, 'walk'));
                collectTopicPoint(WASTE_TOPIC.key, pn, 'waste');
            });
            if (validationError) {
                errEl.textContent = validationError;
                errEl.classList.remove('hidden');
                return;
            }
            data.points = JSON.stringify(points);
            data.topicAreas = JSON.stringify({});
            data.Area = summarizeArea(points);

            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'กำลังบันทึก...'; }
            try {
                if (data.AssessmentID) {
                    await API.put(`/safety-culture/assessments/${data.AssessmentID}`, data);
                } else {
                    await API.post('/safety-culture/assessments', data);
                }
                closeModal();
                showToast('บันทึกผลการประเมินสำเร็จ', 'success');
                await _loadHeroStats();
            } catch (err) {
                errEl.textContent = escHtml(err.message || 'เกิดข้อผิดพลาด');
                errEl.classList.remove('hidden');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'บันทึก'; }
            }
        }));
    }, 50);
}

async function deleteAssessment(id) {
    if (!confirm('ต้องการลบผลการประเมินนี้?')) return;
    try {
        await API.delete(`/safety-culture/assessments/${id}`);
        showToast('ลบสำเร็จ', 'success');
        await _loadHeroStats();
    } catch (err) {
        showToast('ลบไม่สำเร็จ: ' + escHtml(err.message), 'error');
    }
}

// ── PPE Form (Enterprise 4-Section) ───────────────────────────────────────
async function openPPEForm() {
    if (!_isAdmin) { showToast('เฉพาะผู้ดูแลระบบเท่านั้น', 'error'); return; }
    const today = new Date().toISOString().split('T')[0];
    const currentUser = TSHSession.getUser() || {};
    const currentUserId = currentUser.id || currentUser.EmployeeID || '';
    const currentUserName = currentUser.name || currentUser.EmployeeName || '';

    if (_scAreas.length === 0) {
        try {
            const r = await API.get('/master/areas');
            _scAreas = (r.data || []).map(ar => ar.Name || ar.name).filter(Boolean);
        } catch { _scAreas = []; }
    }

    const deptOpts = _departments.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
    const wtOpts   = _ppeWorkTypes.map(w => `<option value="${escHtml(w.WorkTypeID)}" data-name="${escHtml(w.Name)}">${escHtml(w.Name)}</option>`).join('');
    const areaOpts = _scAreas.map(a => `<option value="${escHtml(a)}">${escHtml(a)}</option>`).join('');

    openModal('บันทึกผล PPE Inspection', `
    <form id="sc-ppef" class="space-y-5">
        <div class="rounded-xl border border-slate-100 p-4 space-y-3 bg-slate-50/50">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wide">ข้อมูลพื้นฐาน / Basic Information</p>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1">เทมเพลต PPE ตามประเภทงาน / PPE Template <span class="text-red-500">*</span></label>
                <select id="sc-ppef-wt" name="WorkTypeID" required class="form-input w-full">
                    <option value="">— เลือกเทมเพลต / Select Template —</option>
                    ${wtOpts}
                </select>
                <p class="text-[11px] text-slate-400 mt-1">เลือกเทมเพลตก่อน ระบบจะแสดงรายการ PPE ที่ต้องตรวจตามประเภทงานนี้</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">วันที่ตรวจ / Inspection Date</label>
                    <input name="InspectionDate" type="date" required value="${today}" class="form-input w-full"></div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1">พื้นที่ / Area</label>
                    <select id="sc-ppef-area-sel" class="form-input w-full">
                        <option value="">— เลือกพื้นที่ / Select Area —</option>
                        ${areaOpts}
                        <option value="__other__">อื่น ๆ / Other</option>
                    </select>
                    <input id="sc-ppef-area-other" type="text" placeholder="ระบุพื้นที่ / Specify area" class="form-input w-full mt-2 hidden">
                    <input id="sc-ppef-area" name="Area" type="hidden">
                </div>
            </div>
            <div><label class="block text-sm font-semibold text-slate-700 mb-1">แผนก / Department <span class="text-red-500">*</span></label>
                ${_departments.length > 0
                    ? `<select name="Department" required class="form-input w-full"><option value="">— เลือกแผนก —</option>${deptOpts}</select>`
                    : `<input name="Department" type="text" required placeholder="ชื่อแผนก" class="form-input w-full">`}
            </div>
        </div>

        <div class="rounded-xl border border-slate-100 p-4 space-y-3 bg-slate-50/50">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wide">พนักงานที่ถูกตรวจ / Inspected Employee</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">รหัส/ชื่อพนักงาน / Employee ID or Name</label>
                    <div class="relative">
                        <input id="sc-ppef-emp-q" type="text" placeholder="พิมพ์เพื่อค้นหา..."
                            class="form-input w-full" autocomplete="off"
                            oninput="window._scPPEEmpSearch(this.value)">
                        <div id="sc-ppef-emp-dd" class="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg hidden max-h-48 overflow-y-auto top-full mt-1"></div>
                    </div>
                    <input type="hidden" id="sc-ppef-emp-id" name="InspectedEmployeeID">
                    <input type="hidden" id="sc-ppef-emp-name" name="InspectedEmployeeName">
                </div>
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">กรณีไม่มีในระบบ / Manual Entry</label>
                    <input id="sc-ppef-emp-manual" name="InspectedManual" type="text" placeholder="ชื่อพนักงาน / Employee name" class="form-input w-full"></div>
            </div>
        </div>

        <div class="rounded-xl border border-slate-100 p-4 space-y-3 bg-slate-50/50">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wide">ผู้ตรวจ / Inspector</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">รหัส/ชื่อผู้ตรวจ / Inspector ID or Name</label>
                    <div class="relative">
                        <input id="sc-ppef-insp-q" type="text" value="${escHtml(currentUserName ? `${currentUserName} (${currentUserId})` : '')}" placeholder="พิมพ์เพื่อค้นหา..."
                            class="form-input w-full" autocomplete="off"
                            oninput="window._scPPEInspSearch(this.value)">
                        <div id="sc-ppef-insp-dd" class="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg hidden max-h-48 overflow-y-auto top-full mt-1"></div>
                    </div>
                    <input type="hidden" id="sc-ppef-insp-id" name="InspectorID" value="${escHtml(currentUserId)}">
                    <input type="hidden" id="sc-ppef-insp-name" name="InspectorName" value="${escHtml(currentUserName)}">
                </div>
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">หมายเหตุ / Note</label>
                    <textarea name="Notes" rows="2" class="form-textarea w-full resize-none" placeholder="หมายเหตุ..."></textarea></div>
            </div>
        </div>

        <div class="rounded-xl border border-slate-100 p-4 space-y-3 bg-slate-50/50">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wide">หลักฐานประกอบ / Evidence</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label class="block">
                    <span class="block text-xs font-semibold text-slate-500 mb-1">เลือกรูป/ไฟล์ / Choose File</span>
                    <input id="sc-ppef-evidence" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" class="form-input w-full">
                </label>
                <label class="block">
                    <span class="block text-xs font-semibold text-slate-500 mb-1">ถ่ายรูป / Take Photo</span>
                    <input id="sc-ppef-camera" type="file" accept="image/*" capture="environment" class="form-input w-full">
                </label>
            </div>
            <div id="sc-ppef-evidence-preview" class="hidden rounded-lg border border-slate-100 bg-white p-2 text-xs text-slate-500"></div>
            <p class="text-xs text-slate-400">รองรับรูปภาพ PDF และไฟล์เอกสาร หรือถ่ายรูปจากมือถือเพื่อเก็บหลักฐานบน server บริษัท</p>
        </div>

        <div class="rounded-xl border border-slate-200 overflow-hidden">
            <div class="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div>
                    <p class="text-xs font-bold text-slate-600 uppercase tracking-wide">รายการตรวจ PPE / PPE Checklist</p>
                    <p id="sc-ppef-template-note" class="text-[11px] text-slate-400 mt-0.5">กรุณาเลือกเทมเพลตก่อนเริ่มตรวจ / Please select a template</p>
                </div>
                <div id="sc-ppef-result" class="text-xs font-semibold text-slate-400">ยังไม่มีการเลือก / No selection</div>
            </div>
            <div id="sc-ppef-checklist" class="px-4 divide-y divide-slate-100">
                <div class="py-8 text-center text-sm text-slate-400">เลือกเทมเพลต PPE ตามประเภทงานเพื่อแสดงรายการตรวจ / Select a PPE template to show checklist</div>
            </div>
        </div>

        <div id="sc-ppef-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="sc-ppef-submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-2xl');

    setTimeout(() => {
        const getItemImg = item => item.ImageUrl
            ? `<img src="${escHtml(safeResourceUrl(item.ImageUrl))}" alt="${escHtml(item.ItemName)}" class="w-11 h-11 rounded-lg object-cover border border-slate-200 bg-white flex-shrink-0">`
            : `<div class="w-11 h-11 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75"/></svg></div>`;

        const renderTemplateChecklist = () => {
            const wtSel = document.getElementById('sc-ppef-wt');
            const wrap = document.getElementById('sc-ppef-checklist');
            const note = document.getElementById('sc-ppef-template-note');
            const wt = _ppeWorkTypes.find(w => w.WorkTypeID === wtSel?.value);
            const items = wt?.items || [];
            if (!wrap) return;
            if (!wt) {
                wrap.innerHTML = '<div class="py-8 text-center text-sm text-slate-400">เลือกเทมเพลต PPE ตามประเภทงานเพื่อแสดงรายการตรวจ / Select a PPE template to show checklist</div>';
                if (note) note.textContent = 'กรุณาเลือกเทมเพลตก่อนเริ่มตรวจ / Please select a template';
                window._scPPECalc();
                return;
            }
            if (!items.length) {
                wrap.innerHTML = '<div class="py-8 text-center text-sm text-amber-600">เทมเพลตนี้ยังไม่มีรายการ PPE / This template has no PPE items</div>';
                if (note) note.textContent = `${wt.Name} · 0 รายการ / items`;
                window._scPPECalc();
                return;
            }
            if (note) note.textContent = `${wt.Name} · ${items.length} รายการ / items`;
            wrap.innerHTML = items.map((item, idx) => `
            <div id="sc-prow-${escHtml(item.ItemID)}" class="flex flex-col lg:flex-row lg:items-center justify-between py-3 gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 bg-emerald-100 text-emerald-700">${idx+1}</span>
                    ${getItemImg(item)}
                    <div class="min-w-0">
                        <p class="text-sm font-semibold text-slate-800 truncate">${escHtml(item.ItemName)}</p>
                        ${item.Description ? `<p class="text-xs text-slate-400 mt-0.5">${escHtml(item.Description)}</p>` : ''}
                    </div>
                </div>
                <div class="flex flex-wrap gap-3 flex-shrink-0">
                    <label class="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input type="radio" name="ppe_${escHtml(item.ItemID)}" value="compliant" class="accent-emerald-500 sc-ppe-radio" onchange="window._scPPECalc()">
                        <span class="text-emerald-600 font-medium">ผ่าน / Compliant</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input type="radio" name="ppe_${escHtml(item.ItemID)}" value="non-compliant" class="accent-red-500 sc-ppe-radio" onchange="window._scPPECalc()">
                        <span class="text-red-500 font-medium">ไม่ผ่าน / Non-Compliant</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input type="radio" name="ppe_${escHtml(item.ItemID)}" value="na" checked class="accent-slate-400 sc-ppe-radio" onchange="window._scPPECalc()">
                        <span class="text-slate-400">ไม่เกี่ยวข้อง / N/A</span>
                    </label>
                </div>
            </div>`).join('');
            window._scPPECalc();
        };

        document.getElementById('sc-ppef-wt')?.addEventListener('change', renderTemplateChecklist);

        const syncArea = () => {
            const sel = document.getElementById('sc-ppef-area-sel');
            const other = document.getElementById('sc-ppef-area-other');
            const hidden = document.getElementById('sc-ppef-area');
            const isOther = sel?.value === '__other__';
            other?.classList.toggle('hidden', !isOther);
            if (hidden) hidden.value = isOther ? (other?.value || '').trim() : (sel?.value || '').trim();
        };
        document.getElementById('sc-ppef-area-sel')?.addEventListener('change', syncArea);
        document.getElementById('sc-ppef-area-other')?.addEventListener('input', syncArea);

        const updateEvidencePreview = () => {
            const file = document.getElementById('sc-ppef-camera')?.files?.[0] || document.getElementById('sc-ppef-evidence')?.files?.[0];
            const box = document.getElementById('sc-ppef-evidence-preview');
            if (!box) return;
            if (!file) { box.classList.add('hidden'); box.innerHTML = ''; return; }
            box.classList.remove('hidden');
            if (file.type?.startsWith('image/')) {
                const url = URL.createObjectURL(file);
                box.innerHTML = `<div class="flex items-center gap-3"><img src="${url}" class="w-16 h-16 rounded-lg object-cover border border-slate-200"><div><p class="font-semibold text-slate-700">${escHtml(file.name)}</p><p>${Math.round(file.size/1024)} KB</p></div></div>`;
            } else {
                box.innerHTML = `<div class="font-semibold text-slate-700">${escHtml(file.name)}</div><div>${Math.round(file.size/1024)} KB</div>`;
            }
        };
        document.getElementById('sc-ppef-evidence')?.addEventListener('change', updateEvidencePreview);
        document.getElementById('sc-ppef-camera')?.addEventListener('change', updateEvidencePreview);

        window._scPPECalc = () => {
            const radios = document.querySelectorAll('.sc-ppe-radio');
            let compliant = 0, nonCompliant = 0, total = 0, assessed = 0;
            const names = {};
            radios.forEach(r => {
                if (!names[r.name]) { names[r.name] = true; total++; }
                if (r.checked && r.value === 'compliant')     { compliant++; assessed++; }
                if (r.checked && r.value === 'non-compliant') { nonCompliant++; assessed++; }
            });
            const res = document.getElementById('sc-ppef-result');
            if (res) {
                const isPass = assessed > 0 && nonCompliant === 0;
                res.textContent = assessed > 0
                    ? `${compliant}/${assessed} รายการ — ${isPass ? 'ผ่าน / Pass' : 'ไม่ผ่าน / Fail'}`
                    : 'ยังไม่มีการเลือก / No selection';
                res.className = `text-xs font-semibold ${isPass ? 'text-emerald-600' : assessed > 0 ? 'text-red-600' : 'text-slate-400'}`;
            }
            // Highlight non-compliant rows
            radios.forEach(r => {
                if (!r.checked) return;
                const row = document.getElementById(`sc-prow-${r.name.replace('ppe_', '')}`);
                if (!row) return;
                row.style.background = r.value === 'non-compliant' ? 'rgba(254,242,242,0.6)' : '';
            });
        };

        window._scPPEEmpSearch = async (q) => {
            const dd = document.getElementById('sc-ppef-emp-dd');
            if (!dd) return;
            if (!q || q.length < 2) { dd.classList.add('hidden'); return; }
            try {
                const res = await API.get(`/person-search/employees?q=${encodeURIComponent(q)}&limit=20`);
                const list = res?.data || [];
                dd.innerHTML = list.length
                    ? list.map(e => `<div class="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer" onclick="window._scPPEEmpSelect(${inlineArg(e.EmployeeID)},${inlineArg(e.EmployeeName||'')},${inlineArg(e.Department||'')})"><span class="font-medium">${escHtml(e.EmployeeName||'')}</span> <span class="text-slate-400 text-xs">${escHtml(e.EmployeeID)} · ${escHtml(e.Department||'')}</span></div>`).join('')
                    : '<div class="px-3 py-2 text-sm text-slate-400">ไม่พบพนักงาน / No employee found</div>';
                dd.classList.remove('hidden');
            } catch { dd.classList.add('hidden'); }
        };

        window._scPPEEmpSelect = (id, name, dept) => {
            document.getElementById('sc-ppef-emp-id').value   = id;
            document.getElementById('sc-ppef-emp-name').value = name;
            document.getElementById('sc-ppef-emp-q').value    = `${name} (${id})`;
            document.getElementById('sc-ppef-emp-dd').classList.add('hidden');
            const deptEl = document.querySelector('#sc-ppef [name="Department"]');
            if (dept && deptEl && !deptEl.value) deptEl.value = dept;
        };

        window._scPPEInspSearch = async (q) => {
            const dd = document.getElementById('sc-ppef-insp-dd');
            if (!dd) return;
            if (!q || q.length < 2) { dd.classList.add('hidden'); return; }
            try {
                const res = await API.get(`/person-search/employees?q=${encodeURIComponent(q)}&limit=20`);
                const list = res?.data || [];
                dd.innerHTML = list.length
                    ? list.map(e => `<div class="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer" onclick="window._scPPEInspSelect(${inlineArg(e.EmployeeID)},${inlineArg(e.EmployeeName||'')})"><span class="font-medium">${escHtml(e.EmployeeName||'')}</span> <span class="text-slate-400 text-xs">${escHtml(e.EmployeeID)}</span></div>`).join('')
                    : '<div class="px-3 py-2 text-sm text-slate-400">ไม่พบพนักงาน / No employee found</div>';
                dd.classList.remove('hidden');
            } catch { dd.classList.add('hidden'); }
        };

        window._scPPEInspSelect = (id, name) => {
            document.getElementById('sc-ppef-insp-id').value   = id;
            document.getElementById('sc-ppef-insp-name').value = name;
            document.getElementById('sc-ppef-insp-q').value    = `${name} (${id})`;
            document.getElementById('sc-ppef-insp-dd').classList.add('hidden');
        };

        document.getElementById('sc-ppef')?.addEventListener('submit', guardSubmitHandler(async e => {
            e.preventDefault();
            const fd    = new FormData(e.target);
            const errEl = document.getElementById('sc-ppef-err');
            const submitBtn = document.getElementById('sc-ppef-submit');
            if (submitBtn?.disabled) return;
            errEl?.classList.add('hidden');
            let uploadedEvidenceUrl = '';
            try {
                const wtSel  = document.getElementById('sc-ppef-wt');
                const wtName = wtSel?.options[wtSel.selectedIndex]?.dataset?.name || '';
                const empName = fd.get('InspectedEmployeeName') || fd.get('InspectedManual') || '';
                const selectedWorkType = _ppeWorkTypes.find(w => w.WorkTypeID === fd.get('WorkTypeID'));
                if (!selectedWorkType) {
                    errEl.textContent = 'กรุณาเลือกเทมเพลต PPE ตามประเภทงาน / Please select PPE template';
                    errEl.classList.remove('hidden');
                    return;
                }

                // Client-side: require at least one item with a Compliant/Non-Compliant status
                const itemsToUse2 = selectedWorkType.items || [];
                const hasSel = itemsToUse2.some(item => {
                    const v = fd.get(`ppe_${item.ItemID}`);
                    return v === 'compliant' || v === 'non-compliant';
                });
                if (!hasSel) {
                    errEl.textContent = 'กรุณาเลือกสถานะ PPE อย่างน้อย 1 รายการ';
                    errEl.classList.remove('hidden');
                    return;
                }

                const payload = {
                    InspectionDate:         fd.get('InspectionDate'),
                    Area:                   fd.get('Area')        || '',
                    Department:             fd.get('Department')  || '',
                    Notes:                  fd.get('Notes')       || '',
                    WorkTypeID:             fd.get('WorkTypeID')  || '',
                    WorkTypeName:           wtName,
                    InspectedEmployeeID:    fd.get('InspectedEmployeeID') || '',
                    InspectedEmployeeName:  empName,
                    InspectorID:            fd.get('InspectorID')   || '',
                    InspectorName:          fd.get('InspectorName') || '',
                };
                const itemsToUse = selectedWorkType.items || [];
                const items = itemsToUse.map(item => ({
                    ItemID: item.ItemID,
                    Status: fd.get(`ppe_${item.ItemID}`) || '',
                }));
                payload.items = JSON.stringify(items);

                const evidenceFile = document.getElementById('sc-ppef-camera')?.files?.[0] || document.getElementById('sc-ppef-evidence')?.files?.[0];
                if (evidenceFile) {
                    const uploaded = await uploadSafetyCultureFile(evidenceFile, 'หลักฐาน PPE');
                    uploadedEvidenceUrl = uploaded.url;
                    payload.ImageUrl = uploaded.url;
                }

                if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'กำลังบันทึก...'; }
                const result = await API.post('/safety-culture/ppe-inspections', payload);

                // Show warning if auto-violation logging failed on the backend
                if (result?.violationResult?.error) {
                    showToast(`เกิดข้อผิดพลาดในการบันทึกการฝ่าฝืน: ${result.violationResult.error}`, 'warning');
                }

                closeModal();
                showToast('บันทึกผล PPE Inspection สำเร็จ', 'success');
                await _loadHeroStats();
            } catch (err) {
                await cleanupUploadedUrl(uploadedEvidenceUrl);
                errEl.textContent = escHtml(err.message || 'เกิดข้อผิดพลาด');
                errEl.classList.remove('hidden');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'บันทึก'; }
            }
        }));
    }, 50);
}

function previewPPEEvidence(id) {
    const r = _ppeInspections.find(x => x.InspectionID === id);
    if (!r?.ImageUrl) return;
    const name = getUploadDisplayName(r.ImageUrl, 'PPE evidence');
    if (_isImageEvidence(r.ImageUrl)) {
        openModal('PPE Evidence', `
            <div class="space-y-3">
                <div class="rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex justify-center">
                    <img src="${escHtml(safeResourceUrl(r.ImageUrl))}" alt="${escHtml(name)}" class="max-w-full" style="max-height:70vh;object-fit:contain">
                </div>
                <a href="${escHtml(r.ImageUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:underline">${escHtml(name || 'Open evidence')}</a>
            </div>`, 'max-w-4xl');
        return;
    }
    openModal('PPE Evidence', `
        <div class="rounded-xl border border-slate-100 bg-slate-50 p-5">
            <p class="text-sm text-slate-600 mb-3">${escHtml(name || 'Attached evidence')}</p>
            <a href="${escHtml(r.ImageUrl)}" target="_blank" rel="noopener" class="btn btn-primary px-4 py-2 text-sm inline-flex">Open file</a>
        </div>`, 'max-w-lg');
}

function viewPPERecord(id) {
    const r = _ppeInspections.find(x => x.InspectionID === id);
    if (!r) return;

    const isPass = r.IsPass === 1 || r.IsPass === '1';
    const passBadge = isPass
        ? `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold bg-emerald-100 text-emerald-700"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block"></span>ผ่าน</span>`
        : `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-700"><span class="w-2 h-2 rounded-full bg-red-400 inline-block"></span>ไม่ผ่าน</span>`;

    const statusBadge = (v) => {
        const s = (v || '').toLowerCase();
        if (s === 'compliant')     return '<span class="text-sm font-semibold text-emerald-600">ผ่าน / Compliant</span>';
        if (s === 'non-compliant') return '<span class="text-sm font-semibold text-red-500">ไม่ผ่าน / Non-Compliant</span>';
        return '<span class="text-sm text-slate-400">ไม่เกี่ยวข้อง / N/A</span>';
    };

    let rows;
    if (r.details && r.details.length > 0) {
        rows = r.details.map(d => {
            const nc = (d.Status || '').toLowerCase() === 'non-compliant';
            return `<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 ${nc?'':''}">
                <span class="text-sm text-slate-700">${escHtml(d.ItemName || '-')}</span>
                ${statusBadge(d.Status)}
            </div>`;
        }).join('');
    } else {
        rows = PPE_ITEMS.map(item => `
            <div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div class="flex items-center gap-2"><span>${item.icon}</span><span class="text-sm text-slate-700">${item.label}</span></div>
                ${statusBadge(r[item.key])}
            </div>`).join('');
    }
    const pct = parseFloat(r.CompliancePct || 0);
    const evidenceName = r.ImageUrl ? getUploadDisplayName(r.ImageUrl, 'PPE evidence') : '';
    openModal('รายละเอียด PPE Inspection', `
    <div class="space-y-4">
        <div class="flex items-center justify-between">
            <div class="text-sm text-slate-500">ผลการตรวจ</div>
            ${passBadge}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-slate-50 rounded-xl p-4">
            <div><span class="text-slate-500">วันที่: </span><span class="font-medium">${fmtDate(r.InspectionDate)}</span></div>
            <div><span class="text-slate-500">ผู้ตรวจ: </span><span class="font-medium">${escHtml(r.InspectorName || '-')}</span></div>
            <div><span class="text-slate-500">พนักงานที่ตรวจ: </span><span class="font-medium">${escHtml(r.InspectedEmployeeName || '-')}</span></div>
            <div><span class="text-slate-500">แผนก: </span><span class="font-medium">${escHtml(r.Department || '-')}</span></div>
            <div><span class="text-slate-500">พื้นที่: </span><span class="font-medium">${escHtml(r.Area || '-')}</span></div>
            <div><span class="text-slate-500">ประเภทงาน: </span><span class="font-medium">${escHtml(r.WorkTypeName || '-')}</span></div>
        </div>
        <div class="bg-white rounded-xl border border-slate-100 p-4">${rows}</div>
        <div class="flex items-center justify-between font-bold text-sm pt-1">
            <span class="text-slate-700">Compliance</span>
            <span class="text-xl ${pct>=90?'text-emerald-600':pct>=70?'text-amber-600':'text-red-600'}">${pct.toFixed(0)}% <span class="text-sm font-normal text-slate-500">(${r.CompliantItems||0}/${r.TotalItems||0})</span></span>
        </div>
        ${r.ImageUrl ? `<div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div class="text-xs font-semibold text-slate-500 uppercase mb-2">Evidence / หลักฐานแนบ</div>
            ${_isImageEvidence(r.ImageUrl) ? `<button type="button" onclick="window._scPreviewPPEEvidence('${escHtml(r.InspectionID)}')" class="block w-full mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <img src="${escHtml(safeResourceUrl(r.ImageUrl))}" alt="${escHtml(evidenceName)}" class="w-full" style="max-height:180px;object-fit:cover">
            </button>` : ''}
            <button type="button" onclick="window._scPreviewPPEEvidence('${escHtml(r.InspectionID)}')" class="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:underline">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>
                ${escHtml(evidenceName || 'เปิดหลักฐาน')}
            </button>
        </div>` : ''}
        ${r.Notes ? `<div class="text-xs text-slate-500 bg-slate-50 rounded-lg p-3"><strong>หมายเหตุ:</strong> ${escHtml(r.Notes)}</div>` : ''}
    </div>`, 'max-w-md');
}

async function deletePPE(id) {
    if (!_isAdmin) return;
    if (!confirm('ต้องการลบบันทึกการตรวจ PPE นี้?')) return;
    try {
        await API.delete(`/safety-culture/ppe-inspections/${id}`);
        showToast('ลบสำเร็จ', 'success');
        await _loadHeroStats();
    } catch (err) {
        showToast('ลบไม่สำเร็จ: ' + escHtml(err.message), 'error');
    }
}

// ── Work Type CRUD ─────────────────────────────────────────────────────────
function openWorkTypeForm(id) {
    const wt = id ? _ppeWorkTypes.find(w => w.WorkTypeID === id) : null;
    const selectedItemIds = new Set((wt?.items || []).map(i => i.ItemID));
    const itemCheckboxes = _ppeItems.map(item => `
    <label class="flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 cursor-pointer hover:border-emerald-200 hover:bg-emerald-50/40 transition-colors">
        <input type="checkbox" name="item_${escHtml(item.ItemID)}" value="${escHtml(item.ItemID)}" ${selectedItemIds.has(item.ItemID)?'checked':''}
            class="accent-emerald-500 w-4 h-4 mt-0.5 flex-shrink-0">
        <span class="text-sm text-slate-700 leading-5">${escHtml(item.ItemName)}</span>
    </label>`).join('');

    openModal(wt ? 'แก้ไขประเภทงาน' : 'เพิ่มประเภทงาน', `
    <form id="sc-wtf" class="space-y-5">
        ${wt ? `<input type="hidden" name="WorkTypeID" value="${escHtml(wt.WorkTypeID)}">` : ''}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อประเภทงาน <span class="text-red-500">*</span></label>
                <input name="Name" type="text" required value="${escHtml(wt?.Name||'')}" placeholder="เช่น งานเชื่อม, งานบรรจุ..." class="form-input w-full"></div>
            <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">คำอธิบาย</label>
                <input name="Description" type="text" value="${escHtml(wt?.Description||'')}" class="form-input w-full"></div>
        </div>
        ${_ppeItems.length ? `
        <div>
            <div class="flex items-end justify-between gap-3 mb-2">
                <label class="block text-sm font-semibold text-slate-700">PPE ที่ต้องใช้</label>
                <span class="text-xs text-slate-400">${_ppeItems.length} รายการ</span>
            </div>
            <div class="bg-slate-50 rounded-2xl border border-slate-100 p-4 max-h-[58vh] overflow-y-auto">
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                ${itemCheckboxes}
                </div>
            </div>
        </div>` : ''}
        <div id="sc-wtf-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-5xl');

    setTimeout(() => {
        document.getElementById('sc-wtf')?.addEventListener('submit', guardSubmitHandler(async e => {
            e.preventDefault();
            const fd    = new FormData(e.target);
            const errEl = document.getElementById('sc-wtf-err');
            try {
                const itemIds = _ppeItems.filter(item => fd.get(`item_${item.ItemID}`)).map(item => item.ItemID);
                if (!itemIds.length) {
                    errEl.textContent = 'กรุณาเลือก PPE ที่ต้องใช้ในเทมเพลตอย่างน้อย 1 รายการ';
                    errEl.classList.remove('hidden');
                    return;
                }
                const payload = {
                    Name:        fd.get('Name')        || '',
                    Description: fd.get('Description') || '',
                    itemIds:     JSON.stringify(itemIds),
                    ItemIDs:     itemIds,
                };
                const wtId = fd.get('WorkTypeID');
                if (wtId) {
                    await API.put(`/safety-culture/ppe-work-types/${wtId}`, payload);
                } else {
                    await API.post('/safety-culture/ppe-work-types', payload);
                }
                closeModal();
                showToast('บันทึกประเภทงานสำเร็จ', 'success');
                await _loadHeroStats();
            } catch (err) {
                errEl.textContent = escHtml(err.message || 'เกิดข้อผิดพลาด');
                errEl.classList.remove('hidden');
            }
        }));
    }, 50);
}

async function deleteWorkType(id) {
    if (!confirm('ต้องการลบประเภทงานนี้?')) return;
    try {
        await API.delete(`/safety-culture/ppe-work-types/${id}`);
        showToast('ลบสำเร็จ', 'success');
        await _loadHeroStats();
    } catch (err) {
        showToast('ลบไม่สำเร็จ: ' + escHtml(err.message), 'error');
    }
}

async function deleteViolation(id) {
    if (!_isAdmin) return;
    if (!confirm('ต้องการลบบันทึกการฝ่าฝืนนี้?')) return;
    try {
        await API.delete(`/safety-culture/ppe-violations/${id}`);
        showToast('ลบสำเร็จ', 'success');
        await _loadHeroStats();
    } catch (err) {
        showToast('ลบไม่สำเร็จ: ' + escHtml(err.message), 'error');
    }
}

function viewEmployeeViolations(empId) {
    const records = _ppeViolations.filter(v => (v.EmployeeID || v.EmployeeName) == empId);
    if (!records.length) return;
    const emp = records[0];
    const rows = records.map(v => `
    <tr class="border-b border-slate-100 last:border-0">
        <td class="px-3 py-2.5 text-sm text-slate-600 whitespace-nowrap">${fmtDate(v.ViolationDate)}</td>
        <td class="px-3 py-2.5 text-center text-slate-600">${v.ViolationNo||1}</td>
        <td class="px-3 py-2.5">${_warnBadge(v.WarningLevel)}</td>
        <td class="px-3 py-2.5 text-sm text-slate-500">${escHtml(v.InspectorName||'—')}</td>
        <td class="px-3 py-2.5 text-xs text-slate-400">${escHtml(v.Note||'—')}</td>
    </tr>`).join('');

    openModal(`บันทึกการฝ่าฝืน PPE — ${escHtml(emp.EmployeeName||'—')}`, `
    <div class="space-y-3">
        <div class="text-sm text-slate-500">แผนก: <span class="font-medium text-slate-700">${escHtml(emp.Department||'—')}</span></div>
        <div class="overflow-x-auto">
            <table class="ds-table text-sm">
                <thead class="bg-slate-50"><tr>
                    <th class="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">วันที่</th>
                    <th class="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase">ครั้งที่</th>
                    <th class="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">ระดับ</th>
                    <th class="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">ผู้บันทึก</th>
                    <th class="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">หมายเหตุ</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`, 'max-w-2xl');
}

// ── PPE Item Management ────────────────────────────────────────────────────
function openPPEItemForm(id) {
    const item = id ? _ppeItems.find(x => x.ItemID === id) : null;
    openModal(item ? 'แก้ไขรายการ PPE' : 'เพิ่มรายการ PPE', `
    <form id="sc-pif" class="space-y-4">
        ${item ? `<input type="hidden" name="ItemID" value="${escHtml(item.ItemID)}">` : ''}
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อรายการ PPE / PPE Item Name</label>
            <input name="ItemName" type="text" required value="${escHtml(item?.ItemName || '')}" placeholder="เช่น Safety Helmet, Gloves, ..." class="form-input w-full"></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">คำอธิบายสั้น / Description</label>
            <textarea name="Description" rows="2" class="form-textarea w-full resize-none" placeholder="ใช้เมื่อต้องการอธิบายวิธีตรวจหรือจุดสังเกต">${escHtml(item?.Description || '')}</textarea></div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รูปประกอบ / Item Image</label>
            <input id="sc-pif-image-file" type="file" accept="image/*" class="form-input w-full">
            <input name="ImageUrl" type="hidden" value="${escHtml(item?.ImageUrl || '')}">
            <div id="sc-pif-preview" class="${item?.ImageUrl ? '' : 'hidden'} mt-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
                ${safeResourceUrl(item?.ImageUrl) ? `<img src="${escHtml(safeResourceUrl(item.ImageUrl))}" alt="${escHtml(item.ItemName)}" class="w-24 h-24 rounded-lg object-cover border border-slate-200">` : ''}
            </div>
        </div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">ลำดับ / Sort Order</label>
            <input name="SortOrder" type="number" min="1" value="${item?.SortOrder ?? (_ppeItems.length + 1)}" class="form-input w-full"></div>
        <div id="sc-pif-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-sm');

    setTimeout(() => {
        document.getElementById('sc-pif-image-file')?.addEventListener('change', e => {
            const file = e.target.files?.[0];
            const box = document.getElementById('sc-pif-preview');
            if (!box || !file) return;
            box.classList.remove('hidden');
            box.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" class="w-24 h-24 rounded-lg object-cover border border-slate-200">`;
        });

        document.getElementById('sc-pif')?.addEventListener('submit', guardSubmitHandler(async e => {
            e.preventDefault();
            const data  = Object.fromEntries(new FormData(e.target).entries());
            const errEl = document.getElementById('sc-pif-err');
            let uploadedImageUrl = '';
            try {
                const imgFile = document.getElementById('sc-pif-image-file')?.files?.[0];
                if (imgFile) {
                    const uploaded = await uploadSafetyCultureFile(imgFile, 'รูป PPE');
                    uploadedImageUrl = uploaded.url;
                    data.ImageUrl = uploaded.url;
                }
                if (data.ItemID) {
                    await API.put(`/safety-culture/ppe-items/${data.ItemID}`, data);
                } else {
                    await API.post('/safety-culture/ppe-items', data);
                }
                closeModal();
                showToast('บันทึกรายการ PPE สำเร็จ', 'success');
                await _loadHeroStats();
            } catch (err) {
                await cleanupUploadedUrl(uploadedImageUrl);
                errEl.textContent = escHtml(err.message || 'เกิดข้อผิดพลาด');
                errEl.classList.remove('hidden');
            }
        }));
    }, 50);
}

async function deletePPEItem(id) {
    const item = _ppeItems.find(x => x.ItemID === id);
    if (!confirm(`ต้องการลบ "${item?.ItemName || 'รายการนี้'}" ออกจากรายการ PPE?`)) return;
    try {
        await API.delete(`/safety-culture/ppe-items/${id}`);
        showToast('ลบรายการ PPE สำเร็จ', 'success');
        await _loadHeroStats();
    } catch (err) {
        showToast('ลบไม่สำเร็จ: ' + escHtml(err.message), 'error');
    }
}

// ── PDF Export ─────────────────────────────────────────────────────────────

function _pdfSetScoreColor(pdf, val) {
    if (val == null)  { pdf.setTextColor(180, 180, 180); return; }
    if (val >= 90)    { pdf.setTextColor(5, 150, 105);   return; }
    if (val >= 70)    { pdf.setTextColor(180, 100, 10);  return; }
    pdf.setTextColor(200, 40, 40);
}

function _pdfScoreText(val) {
    return val != null ? Math.round(val) + '%' : '—';
}

function _pdfMonthlySummary(pdf, yStart, margin, cW, pageH) {
    const SKEYS = ['T1_Score','T2_Score','T3_Score','T4_Score','T5_Score','T7_Score'];
    const SLBLS = ['T1','T2','T3','T4','T5','T7'];
    const monthMap = {};
    _assessments.forEach(a => {
        const key = a.AssessmentDate ? String(a.AssessmentDate).substring(0, 7) : `${a.AssessmentYear}-00`;
        if (!monthMap[key]) monthMap[key] = [];
        monthMap[key].push(a);
    });
    const months = Object.keys(monthMap).sort();
    if (!months.length) return yStart;

    let y = yStart;
    if (y > pageH - 40) { pdf.addPage(); y = 20; }
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 30, 30);
    pdf.text('Monthly Assessment Summary', margin, y); y += 8;

    // Column layout for weekly mode: Topic(32) W1(27) W2(27) W3(27) W4(27) Avg(22) = 162mm
    const TOPIC_W = 32, WEEK_W = 27, AVG_W = 22;
    // Column layout for simple mode: Month(38) T1..T6 each colW, Avg(24)
    const SIMPLE_M = 38, SIMPLE_AVG = 24;
    const SIMPLE_CW = (cW - SIMPLE_M - SIMPLE_AVG) / 6;
    const ROW_H = 6.5;

    for (const m of months) {
        const entries = monthMap[m];
        const [yr, mo] = m.split('-');
        const mLabel = mo === '00' ? `Year ${yr}`
            : new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' });

        const weekMap = { 1: [], 2: [], 3: [], 4: [] };
        entries.forEach(a => {
            const wn = parseInt(a.WeekNo);
            if (wn >= 1 && wn <= 4) weekMap[wn].push(a);
        });
        const hasWeeks = Object.values(weekMap).some(w => w.length > 0);

        if (hasWeeks) {
            // Month header row
            if (y > pageH - 20) { pdf.addPage(); y = 20; }
            pdf.setFillColor(230, 244, 237);
            pdf.rect(margin, y - 4.5, cW, ROW_H, 'F');
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(6, 78, 59);
            pdf.text(mLabel, margin + 2, y);
            const whdrs = ['W1','W2','W3','W4','Avg'];
            whdrs.forEach((lbl, i) => {
                const xC = margin + TOPIC_W + (i < 4 ? i * WEEK_W + WEEK_W / 2 : 4 * WEEK_W + AVG_W / 2);
                pdf.setTextColor(80, 80, 80); pdf.setFont('helvetica', 'normal');
                pdf.text(lbl, xC, y, { align: 'center' });
            });
            y += ROW_H;

            // Per-topic sub-rows
            SKEYS.forEach((k, ki) => {
                if (y > pageH - 12) { pdf.addPage(); y = 20; }
                pdf.setFillColor(ki % 2 === 0 ? 248 : 255, ki % 2 === 0 ? 250 : 255, ki % 2 === 0 ? 252 : 255);
                pdf.rect(margin, y - 4.5, cW, ROW_H, 'F');
                pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(80, 80, 80);
                pdf.text('  ' + SLBLS[ki], margin + 2, y);

                [1, 2, 3, 4].forEach((wn, wi) => {
                    const vals = weekMap[wn].map(e => e[k]).filter(v => v != null).map(v => parseFloat(v));
                    const wAvg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
                    const xC = margin + TOPIC_W + wi * WEEK_W + WEEK_W / 2;
                    _pdfSetScoreColor(pdf, wAvg);
                    pdf.setFont('helvetica', wAvg != null && wAvg < 70 ? 'bold' : 'normal');
                    pdf.text(_pdfScoreText(wAvg), xC, y, { align: 'center' });
                });

                const allVals = entries.map(e => e[k]).filter(v => v != null).map(v => parseFloat(v));
                const mAvg = allVals.length ? allVals.reduce((a, b) => a + b, 0) / allVals.length : null;
                const xAvg = margin + TOPIC_W + 4 * WEEK_W + AVG_W / 2;
                _pdfSetScoreColor(pdf, mAvg);
                pdf.setFont('helvetica', 'bold');
                pdf.text(_pdfScoreText(mAvg), xAvg, y, { align: 'center' });
                y += ROW_H;
            });
        } else {
            // Simple flat row: Month | T1 T2 T3 T4 T5 T7 | Avg
            if (y > pageH - 14) { pdf.addPage(); y = 20; }
            pdf.setFillColor(241, 245, 249);
            pdf.rect(margin, y - 4.5, cW, ROW_H, 'F');
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(30, 30, 30);
            pdf.text(mLabel, margin + 2, y);

            const pcts = SKEYS.map(k => {
                const vals = entries.map(e => e[k]).filter(v => v != null).map(v => parseFloat(v));
                return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            });
            pcts.forEach((p, i) => {
                const xC = margin + SIMPLE_M + i * SIMPLE_CW + SIMPLE_CW / 2;
                _pdfSetScoreColor(pdf, p);
                pdf.setFont('helvetica', p != null && p < 70 ? 'bold' : 'normal');
                pdf.text(_pdfScoreText(p), xC, y, { align: 'center' });
            });
            const validPcts = pcts.filter(v => v !== null);
            const overall = validPcts.length ? validPcts.reduce((a, b) => a + b, 0) / validPcts.length : null;
            _pdfSetScoreColor(pdf, overall);
            pdf.setFont('helvetica', 'bold');
            pdf.text(_pdfScoreText(overall), margin + SIMPLE_M + 6 * SIMPLE_CW + SIMPLE_AVG / 2, y, { align: 'center' });
            y += ROW_H;
        }
        y += 2;
    }
    return y + 4;
}

function _pdfPpeSection(pdf, yStart, margin, cW, pageH, ppeList) {
    const inspections = ppeList !== undefined ? ppeList : _ppeInspections;
    let y = yStart;
    if (y > pageH - 40) { pdf.addPage(); y = 20; }
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 30, 30);
    pdf.text('PPE Compliance Result', margin, y); y += 7;

    // Build per-item aggregates from filtered inspection list
    if (_ppeItems.length > 0) {
        const itemTotals = {};
        _ppeItems.forEach(it => { itemTotals[it.ItemID] = { name: it.ItemName, ok: 0, total: 0 }; });
        inspections.forEach(r => {
            if (r.details && r.details.length > 0) {
                r.details.forEach(d => {
                    if (itemTotals[d.ItemID]) {
                        itemTotals[d.ItemID].total++;
                        if (d.Status === 'compliant') itemTotals[d.ItemID].ok++;
                    }
                });
            }
        });
        const itemRows = Object.values(itemTotals).filter(it => it.total > 0);
        if (!itemRows.length) {
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(150, 150, 150);
            pdf.text('ยังไม่มีข้อมูลการตรวจ PPE', margin + 2, y); y += 8;
            return y;
        }
        pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
        itemRows.forEach((it, i) => {
            if (y > pageH - 12) { pdf.addPage(); y = 20; }
            const pct = it.total > 0 ? (it.ok / it.total) * 100 : null;
            const pStr = pct != null ? pct.toFixed(1) + '%' : 'N/A';
            pdf.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
            pdf.rect(margin, y - 3.5, cW, 7, 'F');
            pdf.setTextColor(30, 30, 30); pdf.text(it.name, margin + 2, y);
            _pdfSetScoreColor(pdf, pct);
            pdf.setFont('helvetica', 'bold');
            pdf.text(pStr, margin + cW - 2, y, { align: 'right' });
            pdf.setFont('helvetica', 'normal'); y += 8;
        });
    } else {
        // No SC_PPE_Items configured — fall back to itemBreakdown from backend ppeStats
        const itemBreakdown = _getPPEStats().itemBreakdown || [];
        if (!itemBreakdown.length) {
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(150, 150, 150);
            pdf.text('ยังไม่มีข้อมูลรายการ PPE', margin + 2, y); y += 8;
            return y;
        }
        pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
        itemBreakdown.forEach((item, i) => {
            if (y > pageH - 12) { pdf.addPage(); y = 20; }
            const pct = item.total_count > 0 ? (item.ok_count / item.total_count) * 100 : null;
            const pStr = pct != null ? pct.toFixed(1) + '%' : 'N/A';
            pdf.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
            pdf.rect(margin, y - 3.5, cW, 7, 'F');
            pdf.setTextColor(30, 30, 30); pdf.text(item.ItemName || '—', margin + 2, y);
            _pdfSetScoreColor(pdf, pct);
            pdf.setFont('helvetica', 'bold');
            pdf.text(pStr, margin + cW - 2, y, { align: 'right' });
            pdf.setFont('helvetica', 'normal'); y += 8;
        });
    }
    return y + 4;
}

// ── Inline SVG chart helpers for PDF (no font/CORS dependency) ────────────
function _svgBar(scores, labels, w = 680, h = 160) {
    const n   = scores.length;
    const bW  = Math.floor((w - 40) / n) - 6;
    const aH  = h - 28;
    const bars = scores.map((s, i) => {
        const bH  = s > 0 ? Math.max(4, Math.round(s * aH / 100)) : 0;
        const x   = 20 + i * (bW + 6);
        const y   = h - 20 - bH;
        const clr = s === 0 ? '#cbd5e1' : s >= 90 ? '#059669' : s >= 70 ? '#d97706' : '#ef4444';
        return `<rect x="${x}" y="${y}" width="${bW}" height="${bH}" fill="${clr}" rx="3"/>
                ${s > 0 ? `<text x="${x + bW/2}" y="${y - 4}" text-anchor="middle" font-size="10" font-weight="700" fill="${clr}" font-family="Arial,sans-serif">${Math.round(s)}%</text>` : ''}
                <text x="${x + bW/2}" y="${h - 4}" text-anchor="middle" font-size="9" fill="#64748b" font-family="Arial,sans-serif">${labels[i] || ''}</text>`;
    }).join('');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        <line x1="10" y1="${h - 20}" x2="${w - 10}" y2="${h - 20}" stroke="#e2e8f0" stroke-width="1"/>
        ${bars}
    </svg>`;
}

function _svgRadar(scores, labels, size = 240) {
    const cx = size / 2, cy = size / 2, r = size * 0.37, n = scores.length;
    const pt = (val, i) => {
        const a = (i * 2 * Math.PI / n) - Math.PI / 2;
        const v = Math.min(val / 100, 1) * r;
        return [cx + v * Math.cos(a), cy + v * Math.sin(a)];
    };
    const rings = [20, 40, 60, 80, 100].map(p => {
        const pts = Array.from({length: n}, (_, i) => {
            const a = (i * 2 * Math.PI / n) - Math.PI / 2;
            const v = (p / 100) * r;
            return `${cx + v * Math.cos(a)},${cy + v * Math.sin(a)}`;
        }).join(' ');
        return `<polygon points="${pts}" fill="none" stroke="#e2e8f0" stroke-width="1"/>`;
    }).join('');
    const axes = Array.from({length: n}, (_, i) => {
        const a = (i * 2 * Math.PI / n) - Math.PI / 2;
        return `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(a)}" y2="${cy + r * Math.sin(a)}" stroke="#e2e8f0" stroke-width="1"/>`;
    }).join('');
    const dataPts = scores.map((s, i) => pt(s, i));
    const poly = `<polygon points="${dataPts.map(p => p.join(',')).join(' ')}" fill="rgba(5,150,105,0.15)" stroke="#059669" stroke-width="2"/>`;
    const dots = dataPts.map((p, i) => {
        const c = scores[i] === 0 ? '#cbd5e1' : scores[i] >= 90 ? '#059669' : scores[i] >= 70 ? '#d97706' : '#ef4444';
        return `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;
    }).join('');
    const lbls = labels.map((lbl, i) => {
        const a = (i * 2 * Math.PI / n) - Math.PI / 2;
        const lx = cx + (r + 24) * Math.cos(a);
        const ly = cy + (r + 24) * Math.sin(a);
        const short = lbl.length > 9 ? lbl.slice(0, 8) + '…' : lbl;
        return `<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="9" fill="#475569" font-family="Arial,sans-serif">${short}</text>`;
    }).join('');
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        ${rings}${axes}${poly}${dots}${lbls}
    </svg>`;
}

function _svgLine(trend, w = 340, h = 150) {
    if (!trend.length) return `<div style="height:${h}px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11px;font-family:Arial,sans-serif">ไม่มีข้อมูลแนวโน้ม</div>`;
    const vals = trend.map(t => Math.round(parseFloat(t.avg_score || 0)));
    const pad  = 30, aW = w - pad * 2, aH = h - pad;
    const px = i => pad + (trend.length > 1 ? (i / (trend.length - 1)) * aW : aW / 2);
    const py = v  => pad / 2 + aH - (v / 100) * aH;
    const linePath = `M ${vals.map((v, i) => `${px(i)},${py(v)}`).join(' L ')}`;
    const area     = `M ${px(0)},${py(0)} L ${vals.map((v, i) => `${px(i)},${py(v)}`).join(' L ')} L ${px(trend.length - 1)},${py(0)} Z`;
    const dots = trend.map((t, i) => {
        const c = vals[i] >= 90 ? '#059669' : vals[i] >= 70 ? '#d97706' : vals[i] > 0 ? '#ef4444' : '#94a3b8';
        return `<circle cx="${px(i)}" cy="${py(vals[i])}" r="4" fill="${c}" stroke="#fff" stroke-width="1.5"/>
                <text x="${px(i)}" y="${py(vals[i]) - 7}" text-anchor="middle" font-size="9" fill="${c}" font-weight="700" font-family="Arial,sans-serif">${vals[i]}%</text>
                <text x="${px(i)}" y="${h - 4}" text-anchor="middle" font-size="8" fill="#94a3b8" font-family="Arial,sans-serif">${t.AssessmentYear}</text>`;
    }).join('');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        <path d="${area}" fill="rgba(5,150,105,0.08)"/>
        <path d="${linePath}" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="${pad}" y1="${pad/2}" x2="${pad}" y2="${pad/2+aH}" stroke="#e2e8f0" stroke-width="1"/>
        <line x1="${pad}" y1="${pad/2+aH}" x2="${pad+aW}" y2="${pad/2+aH}" stroke="#e2e8f0" stroke-width="1"/>
        ${dots}
    </svg>`;
}

async function exportPDF() {
    if (typeof window.jspdf === 'undefined') {
        showToast('ไลบรารี PDF ยังโหลดไม่สำเร็จ', 'error'); return;
    }
    if (typeof window.html2canvas === 'undefined') {
        showToast('ไลบรารี html2canvas ยังโหลดไม่สำเร็จ', 'error'); return;
    }

    const mo = _filterDashMonth;
    const thMoFull = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const thMoShort = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const periodLabel = mo > 0 ? `${thMoFull[mo]} ${_filterYear}` : `ปี ${_filterYear}`;
    const periodShort = mo > 0 ? `${thMoShort[mo]}${_filterYear}` : `${_filterYear}`;
    const filename = mo > 0
        ? `Safety_Culture_${_filterYear}_${String(mo).padStart(2, '0')}.pdf`
        : `Safety_Culture_${_filterYear}.pdf`;

    const filteredAsmts = mo === 0 ? _assessments
        : _assessments.filter(a => a.AssessmentDate &&
            parseInt(String(a.AssessmentDate).substring(5, 7), 10) === mo);
    const filteredPPE = mo === 0 ? _ppeInspections
        : _ppeInspections.filter(r => {
            const d = r.InspectionDate || r.CreatedAt;
            return d && parseInt(String(d).substring(5, 7), 10) === mo;
        });
    const filteredViol = mo === 0 ? _ppeViolations
        : _ppeViolations.filter(v => v.ViolationDate &&
            parseInt(String(v.ViolationDate).substring(5, 7), 10) === mo);

    const ppePassCount = filteredPPE.filter(r => r.IsPass === 1 || r.IsPass === '1').length;
    let ppePct = filteredPPE.length > 0 ? Math.round(ppePassCount / filteredPPE.length * 100) : null;
    if (ppePct == null && mo === 0 && _getPPEStats().overall_pct != null) {
        ppePct = parseFloat(_getPPEStats().overall_pct);
    }

    const scoreKeys = ['T1_Score', 'T2_Score', 'T3_Score', 'T4_Score', 'T5_Score', 'T7_Score'];
    const computedAvgs = scoreKeys.map(k => {
        const vals = filteredAsmts
            .map(a => parseFloat(a[k]))
            .filter(v => Number.isFinite(v));
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
    const fallbackScores = Array.isArray(_dashScores) ? _dashScores : [0, 0, 0, 0, 0, 0, 0];
    const scoreOrFallback = (scoreIdx, avgIdx) => {
        if (computedAvgs[avgIdx] != null) return computedAvgs[avgIdx];
        return Number(fallbackScores[scoreIdx]) > 0 ? fallbackScores[scoreIdx] : 0;
    };
    const scores = [
        scoreOrFallback(0, 0),
        scoreOrFallback(1, 1),
        scoreOrFallback(2, 2),
        scoreOrFallback(3, 3),
        scoreOrFallback(4, 4),
        ppePct != null ? ppePct : (Number(fallbackScores[5]) > 0 ? fallbackScores[5] : 0),
        scoreOrFallback(6, 5)
    ];
    _dashScores = scores;
    const cultureScores = [scores[0], scores[1], scores[2], scores[3], scores[4], scores[6]];
    const validScores = cultureScores.filter(v => v > 0);
    const overallAvg = validScores.length
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : null;
    const mat = overallAvg != null ? getMaturity(overallAvg) : null;
    const violVerbal = filteredViol.filter(v => v.WarningLevel === 'verbal').length;
    const violNotice = filteredViol.filter(v => v.WarningLevel === 'safety_notice').length;
    const violWritten = filteredViol.filter(v => v.WarningLevel === 'written_warning').length;

    const scoreDefs = [
        ['T1', 'เดินบน Walk Way', scores[0]],
        ['T2', 'ไม่ใช้โทรศัพท์', scores[1]],
        ['T3', 'ข้ามถนนทางม้าลาย', scores[2]],
        ['T4', 'หยุดยืนชี้นิ้ว', scores[3]],
        ['T5', 'ไม่ล้วงกระเป๋า', scores[4]],
        ['T6', 'PPE Control', scores[5]],
        ['T7', 'แยกขยะถูกต้อง', scores[6]]
    ];
    const rankedScores = scoreDefs
        .filter(([, , score]) => Number(score) > 0)
        .sort((a, b) => b[2] - a[2]);
    const bestTopic = rankedScores[0];
    const weakTopic = rankedScores[rankedScores.length - 1];
    const suggestions = _buildSuggestionsFromScores(scores).slice(0, 4);

    const deptMap = {};
    filteredPPE.forEach(r => {
        const dept = r.Department || r.DeptName || 'ไม่ระบุแผนก';
        if (!deptMap[dept]) deptMap[dept] = { dept, total: 0, pass: 0 };
        deptMap[dept].total += 1;
        if (r.IsPass === 1 || r.IsPass === '1') deptMap[dept].pass += 1;
    });
    const deptRows = Object.values(deptMap)
        .map(d => ({ ...d, pct: d.total ? Math.round(d.pass / d.total * 100) : 0 }))
        .sort((a, b) => a.pct - b.pct || b.total - a.total)
        .slice(0, 5);

    const itemRows = [];
    if (_ppeItems && _ppeItems.length) {
        const itemTotals = {};
        _ppeItems.forEach(it => {
            const id = String(it.ItemID);
            itemTotals[id] = { name: it.ItemName || `PPE ${id}`, total: 0, ok: 0 };
        });
        filteredPPE.forEach(r => {
            let checks = r.ItemChecks || [];
            if (typeof checks === 'string') {
                try { checks = JSON.parse(checks); } catch { checks = []; }
            }
            checks.forEach(c => {
                const id = String(c.ItemID || c.itemId || c.id || '');
                if (!itemTotals[id]) return;
                itemTotals[id].total += 1;
                if (c.Status === 'ok' || c.status === 'ok' || c.IsOK === 1 || c.isOk === true) itemTotals[id].ok += 1;
            });
        });
        Object.values(itemTotals)
            .filter(it => it.total > 0)
            .map(it => ({ ...it, pct: Math.round(it.ok / it.total * 100) }))
            .sort((a, b) => a.pct - b.pct || b.total - a.total)
            .slice(0, 5)
            .forEach(it => itemRows.push(it));
    }
    if (!itemRows.length && _getPPEStats().itemBreakdown?.length) {
        _getPPEStats().itemBreakdown
            .map(item => ({
                name: item.ItemName || '-',
                total: item.total_count || 0,
                ok: item.ok_count || 0,
                pct: item.total_count > 0 ? Math.round(item.ok_count / item.total_count * 100) : 0
            }))
            .sort((a, b) => a.pct - b.pct || b.total - a.total)
            .slice(0, 5)
            .forEach(it => itemRows.push(it));
    }

    const dashboardTrend = Array.isArray(_dashData?.yearTrend) ? _dashData.yearTrend : [];
    let trend = dashboardTrend
        .filter(t => t && (t.avg_score != null || t.AvgScore != null))
        .map(t => ({
            AssessmentYear: t.AssessmentYear || t.year || t.Year || t.month_label || t.MonthLabel || '',
            avg_score: Math.round(parseFloat(t.avg_score ?? t.AvgScore ?? 0))
        }))
        .filter(t => Number.isFinite(t.avg_score) && t.avg_score > 0);
    if (!trend.length) {
        const monthScores = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, sum: 0, count: 0 }));
        _assessments.forEach(a => {
            if (!a.AssessmentDate || String(a.AssessmentDate).substring(0, 4) !== String(_filterYear)) return;
            const m = parseInt(String(a.AssessmentDate).substring(5, 7), 10);
            const vals = scoreKeys.map(k => parseFloat(a[k])).filter(v => Number.isFinite(v));
            const val = vals.length ? vals.reduce((sum, v) => sum + v, 0) / vals.length : 0;
            if (m >= 1 && m <= 12 && val > 0) {
                monthScores[m - 1].sum += val;
                monthScores[m - 1].count += 1;
            }
        });
        trend = monthScores
            .filter(r => r.count > 0)
            .map(r => ({ AssessmentYear: thMoShort[r.m], avg_score: Math.round(r.sum / r.count) }));
    }

    const recentViol = filteredViol
        .slice()
        .sort((a, b) => String(b.ViolationDate || '').localeCompare(String(a.ViolationDate || '')))
        .slice(0, 5);
    const hasScoreData = scoreDefs.some(([, , score]) => Number(score) > 0);
    const hasTrendData = trend.length > 0;

    const statusColor = val => val == null ? '#64748b' : val >= 90 ? '#059669' : val >= 70 ? '#d97706' : '#dc2626';
    const statusText = val => val == null ? 'N/A' : val >= 90 ? 'Good' : val >= 70 ? 'Watch' : 'Action';
    const scoreText = val => val == null || Number(val) <= 0 ? 'N/A' : `${Math.round(val)}%`;
    const row = (cells, opts = {}) => `<tr>${cells.map((c, i) => `<td style="${opts.bold ? 'font-weight:800;' : ''}${i === cells.length - 1 ? 'text-align:right;' : ''}">${c}</td>`).join('')}</tr>`;
    const empty = text => `<div class="empty">${escHtml(text)}</div>`;
    const metric = (label, value, note, color = '#065f46') => `
        <div class="metric">
            <div class="metric-label">${escHtml(label)}</div>
            <div class="metric-value" style="color:${color};">${escHtml(String(value))}</div>
            <div class="metric-note">${escHtml(note || '')}</div>
        </div>`;
    const section = (title, subtitle, html) => `
        <section class="section">
            <div class="section-head">
                <div>
                    <h2>${escHtml(title)}</h2>
                    ${subtitle ? `<p>${escHtml(subtitle)}</p>` : ''}
                </div>
            </div>
            ${html}
        </section>`;
    const table = (heads, bodyRows) => `
        <table>
            <thead><tr>${heads.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
            <tbody>${bodyRows.join('')}</tbody>
        </table>`;
    const targetFor = code => code === 'T6' ? 90 : 70;
    const actionDetailRows = scoreDefs
        .map(([code, topic, score]) => {
            const target = targetFor(code);
            const hasScore = Number(score) > 0;
            const gap = hasScore ? Math.max(0, target - Math.round(score)) : null;
            const priority = !hasScore ? 'Data Gap' : gap > 0 ? (gap >= 20 ? 'Urgent' : 'Watch') : 'Stable';
            return { code, topic, score, target, gap, priority };
        })
        .filter(r => r.priority !== 'Stable')
        .sort((a, b) => {
            if (a.priority === 'Data Gap' && b.priority !== 'Data Gap') return -1;
            if (a.priority !== 'Data Gap' && b.priority === 'Data Gap') return 1;
            return (b.gap || 0) - (a.gap || 0);
        })
        .slice(0, 5);
    const actionDetail = section('7. Priority Action Detail', 'Topic targets and follow-up priority from Safety Culture data',
        actionDetailRows.length
            ? table(['Code', 'Topic', 'Current', 'Target', 'Priority'], actionDetailRows.map(r =>
                row([
                    escHtml(r.code),
                    escHtml(r.topic),
                    r.score > 0 ? `${Math.round(r.score)}%` : 'No data',
                    `${r.target}%`,
                    `<span style="color:${r.priority === 'Urgent' ? '#dc2626' : r.priority === 'Watch' ? '#d97706' : '#64748b'};font-weight:900;">${r.priority}</span>`
                ])))
            : `<div class="empty compact">ทุกหัวข้ออยู่ในเกณฑ์เป้าหมายของรอบรายงานนี้</div>`);
    const healthItems = [
        ['Score Readiness', hasScoreData ? 'Ready' : 'No scored topics', hasScoreData ? '#059669' : '#d97706'],
        ['Trend Readiness', hasTrendData ? 'Ready' : 'No monthly trend', hasTrendData ? '#059669' : '#d97706'],
        ['PPE Readiness', filteredPPE.length ? `${filteredPPE.length} checks` : 'No PPE checks', filteredPPE.length ? '#059669' : '#d97706'],
        ['Violation Status', filteredViol.length ? `${filteredViol.length} records` : 'No violation', filteredViol.length ? '#dc2626' : '#059669']
    ];
    const reportHealth = section('4. Report Health', 'Data readiness for this Safety Culture dashboard export',
        `<div class="health-grid">${healthItems.map(([label, value, color]) => `
            <div class="health-item">
                <b>${escHtml(label)}</b>
                <span style="color:${color};">${escHtml(value)}</span>
            </div>`).join('')}</div>`);

    const page1 = `
        <div class="grid metrics">
            ${metric('Average Score', scoreText(overallAvg), 'Culture assessment topics', statusColor(overallAvg))}
            ${metric('Maturity', mat ? mat.label : 'N/A', overallAvg != null ? `${overallAvg}% culture average` : 'No assessment', mat?.color || '#64748b')}
            ${metric('PPE Compliance', ppePct == null ? 'N/A' : `${Math.round(ppePct)}%`, filteredPPE.length ? `${ppePassCount}/${filteredPPE.length} pass` : 'Dashboard aggregate', statusColor(ppePct))}
            ${metric('Violations', filteredViol.length, `Verbal ${violVerbal} | Notice ${violNotice} | Written ${violWritten}`, filteredViol.length ? '#dc2626' : '#059669')}
            ${metric('Assessment Records', filteredAsmts.length, periodLabel, '#0f766e')}
            ${metric('PPE Checks', filteredPPE.length, 'Inspection records', '#0f766e')}
        </div>
        <div class="two-col">
            ${section('1. Topic Score Register', 'Actual scores from Safety Culture dashboard',
                table(['Code', 'Topic', 'Score', 'Status'], scoreDefs.map(([code, name, score]) =>
                    row([escHtml(code), escHtml(name), scoreText(score), `<span style="color:${statusColor(score)};font-weight:800;">${statusText(score)}</span>`]))))}
            ${section('2. Management Focus', 'Priority points for follow-up',
                `<div class="focus-box">
                    <div><b>Best Topic</b><span>${bestTopic ? `${escHtml(bestTopic[1])} (${Math.round(bestTopic[2])}%)` : 'N/A'}</span></div>
                    <div><b>Weak Topic</b><span>${weakTopic ? `${escHtml(weakTopic[1])} (${Math.round(weakTopic[2])}%)` : 'N/A'}</span></div>
                    <div><b>PPE Risk</b><span>${ppePct == null ? 'No PPE data' : `${ppePct}% compliance`}</span></div>
                    <div><b>Violation Level</b><span>${filteredViol.length ? `${filteredViol.length} active records` : 'No violation record'}</span></div>
                </div>
                <ul class="notes">${(suggestions.length ? suggestions : ['ติดตามผล Safety Culture ตามรอบประเมิน']).map(s => `<li>${escHtml(s)}</li>`).join('')}</ul>`)}
        </div>
        ${section('3. Dashboard Scope', 'Records included in this PDF',
            `<div class="scope">
                <span>Period: <b>${escHtml(periodLabel)}</b></span>
                <span>Assessment: <b>${filteredAsmts.length}</b></span>
                <span>PPE Inspection: <b>${filteredPPE.length}</b></span>
                <span>Violation: <b>${filteredViol.length}</b></span>
                <span>Report: <b>${escHtml(periodShort)}</b></span>
            </div>`)}
        ${(!hasScoreData && !hasTrendData) ? reportHealth : ''}
    `;

    const page2 = `
        ${section('4. Score Visualization', 'Bar chart and radar profile',
            `<div class="chart-row">
                <div>${_svgBar(scoreDefs.map(([, , score]) => score || 0), scoreDefs.map(([code]) => code), 470, 170)}</div>
                <div>${_svgRadar(scoreDefs.map(([, , score]) => score || 0), scoreDefs.map(([code]) => code), 190)}</div>
            </div>`)}
        <div class="two-col">
            ${section('5. Monthly Trend', `Assessment trend for ${_filterYear}`,
                trend.length ? `<div class="line-chart">${_svgLine(trend, 340, 150)}</div>` : empty('ยังไม่มีข้อมูลแนวโน้มรายเดือน'))}
            ${section('6. Follow-up Notes', 'Safety Culture actions from current score profile',
                `<ul class="notes action-notes">${(suggestions.length ? suggestions : ['รักษาระดับวัฒนธรรมความปลอดภัยและติดตามผลตามรอบประเมิน']).map(s => `<li>${escHtml(s)}</li>`).join('')}</ul>`)}
        </div>
        ${actionDetail}
    `;

    const page3 = `
        <div class="two-col">
            ${section('7. PPE By Department', 'Lowest compliance first',
                deptRows.length
                    ? table(['Department', 'Pass/Total', 'Compliance'], deptRows.map(d =>
                        row([escHtml(d.dept), `${d.pass}/${d.total}`, `<span style="color:${statusColor(d.pct)};font-weight:800;">${d.pct}%</span>`])))
                    : empty('ยังไม่มีข้อมูล PPE ตามแผนกในช่วงที่เลือก'))}
            ${section('8. PPE By Item', 'Items requiring attention',
                itemRows.length
                    ? table(['PPE Item', 'OK/Total', 'Compliance'], itemRows.map(it =>
                        row([escHtml(it.name), `${it.ok}/${it.total}`, `<span style="color:${statusColor(it.pct)};font-weight:800;">${it.pct}%</span>`])))
                    : empty('ยังไม่มีข้อมูลรายการ PPE ในช่วงที่เลือก'))}
        </div>
        ${section('9. Violation Tracker', 'Latest warning records',
                recentViol.length
                    ? table(['Date', 'Employee', 'Level'], recentViol.map(v =>
                        row([escHtml(fmtDate(v.ViolationDate)), escHtml(v.EmployeeName || v.EmpName || '-'), escHtml(v.WarningLevel || '-') ])))
                    : empty('ไม่มี violation record ในช่วงที่เลือก'))}
    `;

    const hasOperationalData = deptRows.length || itemRows.length || recentViol.length || filteredPPE.length || filteredViol.length;
    const pages = [page1];
    if (hasScoreData || hasTrendData) pages.push(page2);
    if (hasOperationalData) pages.push(page3);
    const css = `
        <style>
            *{box-sizing:border-box}
            body{margin:0;font-family:Kanit,Arial,sans-serif;color:#1e293b;background:#fff}
            .sc-pdf-page{width:794px;height:1122px;background:#fff;position:relative;overflow:hidden;display:flex;flex-direction:column;font-size:11px}
            .header{background:#065f46;color:#fff;padding:18px 28px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-shrink:0}
            .header .eyebrow{font-size:10px;opacity:.82;margin:0 0 3px}
            .header h1{font-size:21px;line-height:1.15;margin:0;font-weight:900;letter-spacing:0}
            .header p{font-size:11px;margin:5px 0 0;opacity:.9;color:#fff}
            .badge{text-align:right;font-size:9.5px;line-height:1.55;opacity:.92;color:#ecfdf5;min-width:150px}
            .body{flex:1;padding:18px 28px 14px;overflow:hidden}
            .inner{transform-origin:top left;width:100%;max-width:738px}
            .footer{margin-top:auto;padding:8px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:9px;display:flex;justify-content:space-between;flex-shrink:0}
            .grid{display:grid;gap:8px}.metrics{grid-template-columns:repeat(3,1fr);margin-bottom:12px}
            .metric{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center;min-height:90px}
            .metric-label{font-size:10px;color:#475569;font-weight:800}
            .metric-value{font-size:26px;line-height:1;font-weight:900;margin-top:5px}
            .metric-note{font-size:9px;color:#94a3b8;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
            .section{border:1px solid #e2e8f0;border-radius:12px;background:#fff;overflow:hidden;margin-bottom:12px;padding:12px}
            .section-head{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #dbeafe;padding:0 0 7px;margin-bottom:10px}
            .section h2{font-size:14px;margin:0;color:#065f46;font-weight:900}
            .section p{font-size:9.5px;margin:2px 0 0;color:#64748b}
            table{width:100%;border-collapse:collapse;font-size:9.5px}
            th{background:#065f46;color:#fff;text-align:left;padding:7px 8px;font-size:9px}
            td{padding:7px 8px;border-bottom:3px solid #fff;vertical-align:top}
            tbody tr:nth-child(odd){background:#f8fafc}
            .focus-box{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:9px}
            .focus-box div{border:1px solid #e2e8f0;border-radius:5px;padding:7px;background:#fbfdff;min-height:52px}
            .focus-box b{display:block;font-size:9px;color:#64748b;text-transform:uppercase;margin-bottom:4px}
            .focus-box span{font-size:11px;font-weight:800;color:#0f172a}
            .notes{margin:0;padding:0 10px 9px 24px;font-size:10.5px;color:#334155}
            .action-notes{min-height:126px;padding-top:4px}
            .notes li{margin-bottom:4px}
            .chart-row{display:grid;grid-template-columns:1fr 220px;gap:12px;align-items:center;padding:8px}
            .line-chart{display:flex;justify-content:center;padding:6px}
            .empty{height:118px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11px}
            .empty.compact{height:70px}
            .scope{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;padding:10px;font-size:10.5px}
            .scope span{border:1px solid #e2e8f0;border-radius:5px;background:#fbfdff;padding:7px;color:#475569}
            .health-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:4px 0 0}
            .health-item{border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;padding:10px;min-height:58px}
            .health-item b{display:block;font-size:9.5px;color:#64748b;margin-bottom:5px;text-transform:uppercase}
            .health-item span{font-size:13px;font-weight:900}
        </style>`;

    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
    document.body.appendChild(root);

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        for (let i = 0; i < pages.length; i++) {
            const page = document.createElement('div');
            page.className = 'sc-pdf-page';
            page.innerHTML = `${css}
                <div class="header">
                    <div>
                        <p class="eyebrow">Thai Summit Harness Co., Ltd. · Safety Summary Report</p>
                        <h1>Safety Culture Dashboard Report</h1>
                        <p>รายงานภาพรวม ${escHtml(periodLabel)} · สร้างรายงานเมื่อ ${new Date().toLocaleDateString('th-TH', { day:'numeric', month:'long', year:'numeric' })}</p>
                    </div>
                    <div class="badge">Assessment: ${filteredAsmts.length}<br>PPE Check: ${filteredPPE.length}<br>Violation: ${filteredViol.length}</div>
                </div>
                <div class="body"><div class="inner">${pages[i]}</div></div>
                <div class="footer">
                    <span>Safety Culture Summary Report · Thai Summit Harness Co., Ltd.</span>
                    <span>Page ${i + 1} of ${pages.length}</span>
                </div>`;
            root.appendChild(page);

            const body = page.querySelector('.body');
            const inner = page.querySelector('.inner');
            const fitW = body.clientWidth / Math.max(inner.scrollWidth, 1);
            const fitH = body.clientHeight / Math.max(inner.scrollHeight, 1);
            const scale = Math.min(1, fitW, fitH);
            inner.style.transform = `scale(${scale})`;

            const canvas = await html2canvas(page, {
                scale: 1.55,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                windowWidth: 794,
                windowHeight: 1122
            });
            if (i > 0) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 210, 297);
            page.remove();
        }

        pdf.save(filename);
        showToast(`สร้าง PDF Dashboard สำเร็จ (${pages.length} หน้า)`, 'success');
    } catch (err) {
        console.error('[SafetyCulture] exportPDF failed:', err);
        showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
        root.remove();
    }
}

async function exportPDFLegacy() {
    if (typeof window.jspdf === 'undefined') {
        showToast('ไลบรารี PDF ยังโหลดไม่สำเร็จ', 'error'); return;
    }
    if (typeof window.html2canvas === 'undefined') {
        showToast('ไลบรารี html2canvas ยังโหลดไม่สำเร็จ', 'error'); return;
    }

    const mo = _filterDashMonth;
    const thMoFull = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                      'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const thMoShort = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                       'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const periodLabel = mo > 0 ? `${thMoFull[mo]} ${_filterYear}` : `ปี ${_filterYear}`;
    const periodShort = mo > 0 ? `${thMoShort[mo]}${_filterYear}` : `${_filterYear}`;
    const filename = mo > 0
        ? `Safety_Culture_${_filterYear}_${String(mo).padStart(2,'0')}.pdf`
        : `Safety_Culture_${_filterYear}.pdf`;

    // Period-filtered data
    const filteredAsmts = mo === 0 ? _assessments
        : _assessments.filter(a => a.AssessmentDate &&
            parseInt(String(a.AssessmentDate).substring(5,7),10) === mo);
    const filteredPPE = mo === 0 ? _ppeInspections
        : _ppeInspections.filter(r => {
            const d = r.InspectionDate || r.CreatedAt;
            return d && parseInt(String(d).substring(5,7),10) === mo;
        });
    const filteredViol = mo === 0 ? _ppeViolations
        : _ppeViolations.filter(v => v.ViolationDate &&
            parseInt(String(v.ViolationDate).substring(5,7),10) === mo);

    // KPI computations
    const scores = _dashScores || [0,0,0,0,0,0,0];
    const topicScores = [scores[0],scores[1],scores[2],scores[3],scores[4],scores[6]];
    const validScores = topicScores.filter(v => v > 0);
    const overallAvg = validScores.length
        ? Math.round(validScores.reduce((a,b)=>a+b,0)/validScores.length) : null;
    const mat = overallAvg != null ? getMaturity(overallAvg) : null;
    const ppePassCount = filteredPPE.filter(r => r.IsPass===1||r.IsPass==='1').length;
    const ppePct = filteredPPE.length > 0
        ? Math.round(ppePassCount / filteredPPE.length * 100) : null;
    const violVerbal  = filteredViol.filter(v => v.WarningLevel === 'verbal').length;
    const violNotice  = filteredViol.filter(v => v.WarningLevel === 'safety_notice').length;
    const violWritten = filteredViol.filter(v => v.WarningLevel === 'written_warning').length;

    const SCORE_DEFS = [
        ['T1','เดินบน Walk Way', scores[0]],
        ['T2','ไม่ใช้โทรศัพท์',  scores[1]],
        ['T3','ข้ามถนนทางม้าลาย',scores[2]],
        ['T4','หยุดยืนชี้นิ้ว',   scores[3]],
        ['T5','ไม่ล้วงกระเป๋า',  scores[4]],
        ['T6','PPE Control',      scores[5]],
        ['T7','แยกขยะถูกต้อง',   scores[6]],
    ];
    const worstScore = SCORE_DEFS.filter(([,,v]) => v > 0).sort(([,,a],[,,b]) => a-b)[0];
    const bestScore  = SCORE_DEFS.filter(([,,v]) => v > 0).sort(([,,a],[,,b]) => b-a)[0];

    // Dept PPE breakdown
    const deptPPEMap = {};
    filteredPPE.forEach(r => {
        const d = (r.Department || '').trim(); if (!d) return;
        if (!deptPPEMap[d]) deptPPEMap[d] = { pass: 0, fail: 0 };
        if (r.IsPass===1||r.IsPass==='1') deptPPEMap[d].pass++; else deptPPEMap[d].fail++;
    });
    const deptRows = Object.entries(deptPPEMap)
        .map(([dept, v]) => ({ dept, total: v.pass+v.fail, pass: v.pass, pct: Math.round(v.pass/(v.pass+v.fail)*100) }))
        .sort((a,b) => b.total - a.total).slice(0, 12);

    const yearTrend = _dashData?.yearTrend || [];

    showToast(`กำลังสร้าง PDF Dashboard ${periodLabel}...`, 'info');

    // ── Shared helpers ────────────────────────────────────────────────────────
    const scoreClr = (s) => s == null || s === 0 ? '#94a3b8' : s >= 90 ? '#059669' : s >= 70 ? '#d97706' : '#ef4444';
    const scoreBg  = (s) => s == null || s === 0 ? '#f1f5f9' : s >= 90 ? '#d1fae5' : s >= 70 ? '#fef3c7' : '#fee2e2';
    const fmtScore = (v) => v > 0 ? Math.round(v) + '%' : 'N/A';
    const genDate  = new Date().toLocaleDateString('th-TH', { dateStyle: 'medium' });

    const PAGE_W = 794, PAGE_H = 1122;
    const baseStyle = `font-family:'Kanit',Arial,sans-serif;font-size:13px;color:#1e293b;` +
        `background:#ffffff;width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;` +
        `box-sizing:border-box;position:relative;display:flex;flex-direction:column;`;

    const scoreBar = (pct, color) => {
        const w = pct != null ? Math.max(2, pct) : 0;
        return `<div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">` +
               `<div style="width:${w}%;height:100%;background:${color};border-radius:3px;"></div></div>`;
    };

    const kpiBox = (label, value, color, bg) =>
        `<div style="background:${bg};border:1.5px solid ${color}30;border-radius:10px;` +
        `padding:12px 8px;text-align:center;flex:1;min-width:0;">` +
        `<div style="font-size:10px;color:#64748b;margin-bottom:4px;line-height:1.3;">${label}</div>` +
        `<div style="font-size:22px;font-weight:700;color:${color};line-height:1;">${value}</div></div>`;

    const compactHeader = (title, subtitle) =>
        `<div style="background:#065f46;` +
        `padding:14px 28px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;">` +
        `<div><div style="font-size:11px;color:rgba(255,255,255,0.7);font-weight:400;letter-spacing:0.5px;">` +
        `THAI SUMMIT HARNESS CO., LTD.</div>` +
        `<div style="font-size:17px;font-weight:700;color:#ffffff;margin-top:2px;">${title}</div></div>` +
        `<div style="text-align:right;"><div style="font-size:11px;color:rgba(255,255,255,0.8);">${subtitle}</div>` +
        `<div style="font-size:10px;color:rgba(255,255,255,0.6);margin-top:2px;">${genDate}</div></div></div>`;

    const footerHtml = (n, total) =>
        `<div style="position:absolute;bottom:0;left:0;right:0;height:36px;background:#f8fafc;` +
        `border-top:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;` +
        `padding:0 28px;font-size:10px;color:#94a3b8;">` +
        `<span>Safety Culture Report - Thai Summit Harness Co., Ltd.</span>` +
        `<span>Page ${n} / ${total} | Generated ${genDate}</span></div>`;

    const sectionTitle = (text, accent) =>
        `<div style="font-size:13px;font-weight:600;color:#1e293b;border-bottom:2px solid ${accent||'#059669'};` +
        `padding-bottom:5px;margin-bottom:0;">${text}</div>`;

    const thHead = (...cols) =>
        `<thead><tr style="background:#065f46;">${cols.map(([txt, align, w]) =>
            `<th style="padding:6px 10px;text-align:${align||'left'};font-size:11px;color:#fff;font-weight:700;` +
            (w ? `width:${w};` : '') + `">${txt}</th>`).join('')}</tr></thead>`;

    // ── PAGE 1: KPI Overview ──────────────────────────────────────────────────
    const avgClr  = scoreClr(overallAvg); const avgBg  = scoreBg(overallAvg);
    const ppeCClr = scoreClr(ppePct);     const ppeCBg = scoreBg(ppePct);
    const violClr = filteredViol.length > 0 ? '#ef4444' : '#059669';
    const violBg  = filteredViol.length > 0 ? '#fee2e2' : '#d1fae5';

    const scoreTbody = SCORE_DEFS.map(([code, label, val], i) => {
        const clr = scoreClr(val > 0 ? val : null);
        const bg  = i % 2 === 0 ? '#f8fafc' : '#ffffff';
        return `<tr style="background:${bg};">` +
            `<td style="padding:7px 10px;font-size:11px;color:#64748b;font-weight:500;width:36px;">${code}</td>` +
            `<td style="padding:7px 4px;font-size:12px;color:#1e293b;">${label}</td>` +
            `<td style="padding:7px 10px;text-align:right;font-weight:700;color:${clr};font-size:13px;">${fmtScore(val)}</td>` +
            `<td style="padding:7px 10px 7px 0;width:120px;"><div style="display:flex;align-items:center;">` +
            scoreBar(val > 0 ? val : null, clr) + `</div></td></tr>`;
    }).join('');

    const suggestHtml1 = _buildSuggestionsFromScores(scores).slice(0,3).map(s =>
        `<div style="display:flex;gap:8px;margin-bottom:8px;">` +
        `<div style="flex-shrink:0;width:6px;height:6px;background:#059669;border-radius:50%;margin-top:6px;"></div>` +
        `<div style="font-size:11px;color:#374151;line-height:1.5;">${s}</div></div>`
    ).join('');

    const page1Html = `<div style="${baseStyle}">
        <div style="background:#065f46;
                    padding:28px 28px 22px;flex-shrink:0;position:relative;overflow:hidden;">
            <div style="display:none;">
                <svg width="100%" height="100%"><defs><pattern id="d" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="12" cy="12" r="1.5" fill="white"/></pattern></defs>
                <rect width="100%" height="100%" fill="url(#d)"/></svg></div>
            <div style="position:relative;text-align:center;">
                <div style="font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:1.5px;font-weight:400;margin-bottom:8px;">
                    THAI SUMMIT HARNESS CO., LTD.</div>
                <div style="font-size:26px;font-weight:700;color:#ffffff;margin-bottom:4px;">รายงานวัฒนธรรมความปลอดภัย</div>
                <div style="font-size:14px;color:rgba(255,255,255,0.85);margin-bottom:10px;">Safety Culture Dashboard Report</div>
                <div style="display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);
                            border-radius:20px;padding:5px 18px;font-size:13px;color:rgba(255,255,255,0.95);">
                    ${periodLabel}</div>
            </div>
        </div>
        <div style="padding:16px 28px 0;flex-shrink:0;">
            <div style="display:flex;gap:10px;margin-bottom:10px;">
                ${kpiBox('คะแนนเฉลี่ยรวม', overallAvg != null ? overallAvg + '%' : '—', avgClr, avgBg)}
                ${kpiBox('Culture Maturity', mat?.label || '—', avgClr, avgBg)}
                ${kpiBox('PPE Compliance', ppePct != null ? ppePct + '%' : '—', ppeCClr, ppeCBg)}
                ${kpiBox('การฝ่าฝืน PPE', String(filteredViol.length), violClr, violBg)}
            </div>
            <div style="display:flex;gap:10px;">
                ${kpiBox('รายการประเมิน', String(filteredAsmts.length), '#0284c7', '#e0f2fe')}
                ${kpiBox('ครั้งตรวจ PPE', String(filteredPPE.length), '#0284c7', '#e0f2fe')}
                ${kpiBox('หัวข้อคะแนนสูงสุด', bestScore ? `${bestScore[0]} (${Math.round(bestScore[2])}%)` : '—', '#059669', '#d1fae5')}
                ${kpiBox('หัวข้อต้องพัฒนา', worstScore ? `${worstScore[0]} (${Math.round(worstScore[2])}%)` : '—', '#ef4444', '#fee2e2')}
            </div>
        </div>
        <div style="padding:14px 28px 0;flex:1;min-height:0;overflow:hidden;">
            ${sectionTitle(`สรุปผลคะแนนรายหัวข้อ — ${periodLabel}`)}
            <table style="width:100%;border-collapse:collapse;margin-top:0;">
                <colgroup><col style="width:36px"><col><col style="width:70px"><col style="width:130px"></colgroup>
                ${thHead(['รหัส','left'],['หัวข้อประเมิน','left'],['คะแนน','right'],['','left'])}
                <tbody>${scoreTbody}</tbody>
            </table>
        </div>
        <div style="padding:12px 28px 0;flex-shrink:0;">
            ${sectionTitle('ข้อสังเกตและประเด็นสำคัญ')}
            <div style="margin-top:8px;">${suggestHtml1 || '<div style="font-size:11px;color:#94a3b8;">ผลการประเมินอยู่ในเกณฑ์ดี</div>'}</div>
        </div>
        ${footerHtml(1, 3)}
    </div>`;

    // ── PAGE 2: PPE & Violations ──────────────────────────────────────────────
    const ppeItemRows = (() => {
        if (_ppeItems.length > 0) {
            const itemTotals = {};
            _ppeItems.forEach(it => { itemTotals[it.ItemID] = { name: it.ItemName, ok: 0, total: 0 }; });
            filteredPPE.forEach(r => {
                (r.details || []).forEach(d => {
                    if (itemTotals[d.ItemID]) { itemTotals[d.ItemID].total++; if (d.Status === 'compliant') itemTotals[d.ItemID].ok++; }
                });
            });
            return Object.values(itemTotals).filter(it => it.total > 0).map((it, i) => {
                const pct = it.total > 0 ? (it.ok / it.total) * 100 : null;
                const clr = scoreClr(pct); const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
                return `<tr style="background:${bg};">` +
                    `<td style="padding:7px 10px;font-size:12px;color:#1e293b;">${escHtml(it.name)}</td>` +
                    `<td style="padding:7px 10px;font-size:12px;text-align:center;color:#1e293b;">${it.ok}</td>` +
                    `<td style="padding:7px 10px;font-size:12px;text-align:center;color:#1e293b;">${it.total}</td>` +
                    `<td style="padding:7px 10px;font-weight:700;color:${clr};text-align:right;">${pct != null ? pct.toFixed(1)+'%' : 'N/A'}</td>` +
                    `<td style="padding:7px 14px 7px 4px;width:130px;"><div style="display:flex;align-items:center;">${pct != null ? scoreBar(pct, clr) : ''}</div></td></tr>`;
            }).join('');
        }
        return (_getPPEStats().itemBreakdown || []).map((item, i) => {
            const pct = item.total_count > 0 ? (item.ok_count / item.total_count) * 100 : null;
            const clr = scoreClr(pct); const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
            return `<tr style="background:${bg};">` +
                `<td style="padding:7px 10px;font-size:12px;color:#1e293b;">${escHtml(item.ItemName||'—')}</td>` +
                `<td style="padding:7px 10px;font-size:12px;text-align:center;color:#1e293b;">${item.ok_count}</td>` +
                `<td style="padding:7px 10px;font-size:12px;text-align:center;color:#1e293b;">${item.total_count}</td>` +
                `<td style="padding:7px 10px;font-weight:700;color:${clr};text-align:right;">${pct != null ? pct.toFixed(1)+'%' : 'N/A'}</td>` +
                `<td style="padding:7px 14px 7px 4px;width:130px;"><div style="display:flex;align-items:center;">${pct != null ? scoreBar(pct, clr) : ''}</div></td></tr>`;
        }).join('');
    })();

    const deptTbody = deptRows.map((r, i) => {
        const clr = scoreClr(r.pct); const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
        return `<tr style="background:${bg};">` +
            `<td style="padding:6px 10px;font-size:12px;color:#1e293b;">${escHtml(r.dept)}</td>` +
            `<td style="padding:6px 10px;font-size:12px;text-align:center;color:#1e293b;">${r.pass}</td>` +
            `<td style="padding:6px 10px;font-size:12px;text-align:center;color:#1e293b;">${r.total}</td>` +
            `<td style="padding:6px 10px;font-weight:700;color:${clr};text-align:right;">${r.pct}%</td>` +
            `<td style="padding:6px 14px 6px 4px;width:130px;"><div style="display:flex;align-items:center;">${scoreBar(r.pct, clr)}</div></td></tr>`;
    }).join('');

    const LEVEL_LABELS = { verbal: 'ตักเตือนวาจา', safety_notice: 'ใบแจ้ง', written_warning: 'ใบเตือน' };
    const LEVEL_COLORS = { verbal: '#d97706', safety_notice: '#d97706', written_warning: '#ef4444' };
    const recentViol = [...filteredViol].sort((a,b) => new Date(b.ViolationDate||0)-new Date(a.ViolationDate||0)).slice(0,10);
    const violTbody = recentViol.map((v, i) => {
        const lvl = LEVEL_LABELS[v.WarningLevel] || v.WarningLevel || '—';
        const lClr = LEVEL_COLORS[v.WarningLevel] || '#64748b';
        const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
        return `<tr style="background:${bg};">` +
            `<td style="padding:6px 10px;font-size:11px;color:#64748b;">${fmtDate(v.ViolationDate)}</td>` +
            `<td style="padding:6px 6px;font-size:11px;color:#1e293b;">${escHtml((v.EmployeeName||'—').slice(0,20))}</td>` +
            `<td style="padding:6px 6px;font-size:11px;color:#64748b;">${escHtml((v.Department||'—').slice(0,18))}</td>` +
            `<td style="padding:6px 10px;font-size:11px;font-weight:600;color:${lClr};text-align:right;">${lvl}</td></tr>`;
    }).join('');

    const violBoxes = [
        { label: 'ตักเตือนวาจา', val: violVerbal, clr: violVerbal > 0 ? '#d97706' : '#059669', bg: violVerbal > 0 ? '#fef3c7' : '#d1fae5' },
        { label: 'ใบแจ้งความปลอดภัย', val: violNotice, clr: violNotice > 0 ? '#d97706' : '#059669', bg: violNotice > 0 ? '#fef3c7' : '#d1fae5' },
        { label: 'ใบเตือนลายลักษณ์อักษร', val: violWritten, clr: violWritten > 0 ? '#ef4444' : '#059669', bg: violWritten > 0 ? '#fee2e2' : '#d1fae5' },
    ].map(b =>
        `<div style="background:${b.bg};border:1.5px solid ${b.clr}30;border-radius:10px;` +
        `padding:10px 8px;text-align:center;flex:1;">` +
        `<div style="font-size:10px;color:#64748b;margin-bottom:4px;">${b.label}</div>` +
        `<div style="font-size:20px;font-weight:700;color:${b.clr};">${b.val}</div></div>`
    ).join('');

    const ppeTable = ppeItemRows
        ? `<table style="width:100%;border-collapse:collapse;">` +
          thHead(['รายการ PPE','left'],['ผ่าน','center','50px'],['ทั้งหมด','center','60px'],['อัตรา','right','65px'],['','left','130px']) +
          `<tbody>${ppeItemRows}</tbody></table>`
        : `<div style="padding:10px;font-size:11px;color:#94a3b8;">ยังไม่มีข้อมูล PPE</div>`;

    const page2Html = `<div style="${baseStyle}">
        ${compactHeader('PPE Compliance & Violations', periodLabel)}
        <div style="padding:14px 28px 0;flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:14px;">
            <div>${sectionTitle('ผลการตรวจ PPE รายรายการ')}<div style="margin-top:2px;">${ppeTable}</div></div>
            ${deptTbody ? `<div>${sectionTitle('ผลการตรวจ PPE รายแผนก')}
                <table style="width:100%;border-collapse:collapse;margin-top:2px;">
                    ${thHead(['แผนก','left'],['ผ่าน','center','50px'],['ทั้งหมด','center','60px'],['อัตรา','right','65px'],['','left','130px'])}
                    <tbody>${deptTbody}</tbody>
                </table></div>` : ''}
            <div>${sectionTitle('สรุปการฝ่าฝืน PPE','#ef4444')}
                <div style="display:flex;gap:10px;margin-top:8px;margin-bottom:10px;">${violBoxes}</div>
                ${violTbody
                    ? `<table style="width:100%;border-collapse:collapse;">
                        ${thHead(['วันที่','left','80px'],['พนักงาน','left'],['แผนก','left'],['ระดับ','right','90px'])}
                        <tbody>${violTbody}</tbody></table>`
                    : `<div style="font-size:11px;color:#94a3b8;padding:8px 0;">ไม่มีการฝ่าฝืนในช่วงเวลาที่เลือก</div>`}
            </div>
        </div>
        ${footerHtml(2, 3)}
    </div>`;

    // ── PAGE 3: Trends & Charts ───────────────────────────────────────────────
    const radarScores = [scores[0],scores[1],scores[2],scores[3],scores[4],scores[6]];
    const barLabels   = ['T1','T2','T3','T4','T5','T6','T7'];

    const trendTbody = yearTrend.map((t, i) => {
        const avg = Math.round(parseFloat(t.avg_score || 0));
        const clr = scoreClr(avg > 0 ? avg : null);
        const bg  = i % 2 === 0 ? '#f8fafc' : '#ffffff';
        return `<tr style="background:${bg};">` +
            `<td style="padding:6px 10px;font-size:12px;color:#64748b;font-weight:500;">${t.AssessmentYear}</td>` +
            `<td style="padding:6px 10px;font-size:12px;text-align:center;color:#1e293b;">${t.count||0}</td>` +
            `<td style="padding:6px 10px;font-weight:700;color:${clr};text-align:right;">${avg > 0 ? avg+'%' : '—'}</td>` +
            `<td style="padding:6px 14px 6px 4px;width:160px;"><div style="display:flex;align-items:center;">${avg > 0 ? scoreBar(avg, clr) : ''}</div></td></tr>`;
    }).join('');

    const suggestHtml3 = _buildSuggestionsFromScores(scores).slice(0,5).map(s =>
        `<div style="display:flex;gap:8px;margin-bottom:7px;">` +
        `<div style="flex-shrink:0;width:6px;height:6px;background:#059669;border-radius:50%;margin-top:5px;"></div>` +
        `<div style="font-size:11px;color:#374151;line-height:1.5;">${s}</div></div>`
    ).join('');

    const execSummary =
        `จากการประเมิน ${filteredAsmts.length} ครั้ง` +
        (filteredPPE.length > 0 ? ` และการตรวจ PPE ${filteredPPE.length} ครั้ง` : '') +
        ` ในช่วง${periodLabel}` +
        (overallAvg != null ? ` คะแนนเฉลี่ยรวมอยู่ที่ <strong>${overallAvg}%</strong> (${mat?.label || 'N/A'})` : '') +
        (ppePct != null ? ` อัตราผ่าน PPE <strong>${ppePct}%</strong>` : '') +
        (filteredViol.length > 0 ? ` พบการฝ่าฝืน <strong>${filteredViol.length} รายการ</strong>` : ' ไม่พบการฝ่าฝืน PPE') +
        (bestScore  ? ` หัวข้อที่มีผลดีที่สุดคือ <strong>${bestScore[1]}</strong> (${Math.round(bestScore[2])}%)` : '') +
        (worstScore ? ` หัวข้อที่ต้องพัฒนาคือ <strong>${worstScore[1]}</strong> (${Math.round(worstScore[2])}%)` : '');

    const page3Html = `<div style="${baseStyle}">
        ${compactHeader('แนวโน้มและการวิเคราะห์', periodLabel)}
        <div style="padding:14px 28px 0;flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:14px;">
            <div style="display:flex;gap:20px;align-items:flex-start;">
                <div style="flex:1;min-width:0;">
                    ${sectionTitle('คะแนนรายหัวข้อ')}
                    <div style="margin-top:6px;">${_svgBar(scores, barLabels, 420, 148)}</div>
                </div>
                <div style="flex-shrink:0;width:250px;">
                    ${sectionTitle('Spider Chart')}
                    <div style="margin-top:6px;">${_svgRadar(radarScores, ['T1','T2','T3','T4','T5','T7'], 230)}</div>
                </div>
            </div>
            ${yearTrend.length > 0 ? `<div>
                ${sectionTitle('แนวโน้มคะแนนเฉลี่ยรายปี')}
                <div style="display:flex;gap:20px;align-items:flex-start;margin-top:6px;">
                    <div style="flex:1;min-width:0;">
                        <table style="width:100%;border-collapse:collapse;">
                            ${thHead(['ปี','left','50px'],['จำนวนครั้ง','center'],['คะแนนเฉลี่ย','right','80px'],['','left','160px'])}
                            <tbody>${trendTbody}</tbody>
                        </table>
                    </div>
                    <div style="flex-shrink:0;width:290px;margin-top:4px;">${_svgLine(yearTrend, 290, 128)}</div>
                </div>
            </div>` : ''}
            <div>
                ${sectionTitle('ประเด็นที่ควรพัฒนาและข้อเสนอแนะ')}
                <div style="margin-top:8px;">${suggestHtml3 || '<div style="font-size:11px;color:#94a3b8;">ผลการประเมินอยู่ในเกณฑ์ดี</div>'}</div>
            </div>
            <div style="background:linear-gradient(135deg,#f0fdf4,#d1fae5);border:1.5px solid #059669;
                        border-radius:10px;padding:14px 16px;flex-shrink:0;">
                <div style="font-size:12px;font-weight:700;color:#064e3b;margin-bottom:6px;">
                    สรุปผู้บริหาร — ${periodLabel}</div>
                <div style="font-size:11px;color:#1e293b;line-height:1.7;">${execSummary}</div>
            </div>
        </div>
        ${footerHtml(3, 3)}
    </div>`;

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pages = [page1Html, page2Html, page3Html];

        for (let i = 0; i < pages.length; i++) {
            const wrap = document.createElement('div');
            wrap.style.cssText = `position:fixed;left:-9999px;top:0;width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;z-index:-1;`;
            wrap.innerHTML = pages[i];
            document.body.appendChild(wrap);

            await new Promise(r => setTimeout(r, 180));

            const canvas = await window.html2canvas(wrap, {
                scale: 2, useCORS: true, backgroundColor: '#ffffff',
                width: PAGE_W, height: PAGE_H, windowWidth: PAGE_W, windowHeight: PAGE_H,
            });
            document.body.removeChild(wrap);

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        }

        pdf.save(filename);
        showToast('สร้าง PDF Dashboard สำเร็จ', 'success');
    } catch (err) {
        console.error(err);
        showToast('สร้าง PDF ไม่สำเร็จ: ' + escHtml(err.message), 'error');
    }
}

// ── Assessment PDF helpers ─────────────────────────────────────────────────
const TH_MONTHS = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TH_MONTHS_FULL = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const ASMT_KEYS  = ['T1_Score','T2_Score','T3_Score','T4_Score','T5_Score','T7_Score'];
const ASMT_CODES = ['T1','T2','T3','T4','T5','T7'];
const ASMT_LBLS  = ['Walk Way','No Phone','Crosswalk','Point&Call','Hands-Free','Waste Sort'];

function _asmtPdfHeader(pdf, pageW, title, subtitle) {
    pdf.setFillColor(6, 78, 59);
    pdf.rect(0, 0, pageW, 28, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
    pdf.text(title, pageW / 2, 11, { align: 'center' });
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
    pdf.text(subtitle, pageW / 2, 20, { align: 'center' });
    pdf.setFontSize(7);
    pdf.text(`Generated: ${new Date().toLocaleDateString('th-TH', { dateStyle:'medium' })}`, pageW / 2, 25.5, { align: 'center' });
    return 36;
}

function _asmtPdfScoreTable(pdf, y, margin, cW, pageH, entries, sectionTitle) {
    if (y > pageH - 40) { pdf.addPage(); y = 20; }
    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 30, 30);
    pdf.text(sectionTitle, margin, y); y += 7;

    // W1-W4 columns
    const WEEKS = [1,2,3,4];
    const WEEK_X = (wi) => margin + 42 + wi * 22;

    // header row
    pdf.setFillColor(6, 78, 59);
    pdf.rect(margin, y - 4, cW, 7, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold');
    pdf.text('Topic', margin + 2, y);
    WEEKS.forEach(w => pdf.text(`W${w}`, WEEK_X(w-1), y, { align: 'center' }));
    pdf.text('Avg', margin + cW - 2, y, { align: 'right' });
    y += 7;

    // data rows — one per topic key (T1-T5, T7)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    ASMT_KEYS.forEach((k, ki) => {
        if (y > pageH - 12) { pdf.addPage(); y = 20; }
        const vals = entries.filter(a => a[k] != null).map(a => parseFloat(a[k]));
        const avg  = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
        pdf.setFillColor(ki%2===0?248:255, ki%2===0?250:255, ki%2===0?252:255);
        pdf.rect(margin, y - 3.5, cW, 7, 'F');
        pdf.setTextColor(80, 80, 80); pdf.text(ASMT_CODES[ki], margin + 2, y);
        pdf.setTextColor(30, 30, 30); pdf.text(ASMT_LBLS[ki], margin + 12, y);
        WEEKS.forEach(w => {
            const wVals = entries.filter(a => parseInt(a.WeekNo)===w && a[k]!=null).map(a=>parseFloat(a[k]));
            const wAvg  = wVals.length ? Math.round(wVals.reduce((a,b)=>a+b,0)/wVals.length) : null;
            _pdfSetScoreColor(pdf, wAvg);
            pdf.text(wAvg!=null?wAvg+'%':'—', WEEK_X(w-1), y, { align: 'center' });
        });
        _pdfSetScoreColor(pdf, avg);
        pdf.setFont('helvetica', 'bold');
        pdf.text(avg!=null?Math.round(avg)+'%':'—', margin + cW - 2, y, { align: 'right' });
        pdf.setFont('helvetica', 'normal');
        y += 8;
    });
    return y + 5;
}

function _asmtPdfMonthRow(pdf, y, margin, cW, pageH, moLabel, entries) {
    if (y > pageH - 12) { pdf.addPage(); y = 20; }
    const rowVals = ASMT_KEYS.map(k => {
        const v = entries.filter(a=>a[k]!=null).map(a=>parseFloat(a[k]));
        return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
    });
    const valid = rowVals.filter(v=>v!=null);
    const overall = valid.length ? Math.round(valid.reduce((a,b)=>a+b,0)/valid.length) : null;
    const colW = (cW - 40) / ASMT_KEYS.length;
    pdf.setFillColor(248, 250, 252);
    pdf.rect(margin, y - 3.5, cW, 7, 'F');
    pdf.setTextColor(30, 30, 30); pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
    pdf.text(moLabel, margin + 2, y);
    rowVals.forEach((v, i) => {
        _pdfSetScoreColor(pdf, v);
        pdf.text(v!=null?Math.round(v)+'%':'—', margin + 40 + i * colW + colW/2, y, { align: 'center' });
    });
    _pdfSetScoreColor(pdf, overall);
    pdf.setFont('helvetica', 'bold');
    pdf.text(overall!=null?overall+'%':'—', margin + cW - 2, y, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    return y + 8;
}

function openMonthPickerForPDF() {
    const thMonths_full = TH_MONTHS_FULL;
    const opts = Array.from({length:12},(_,i)=>i+1).map(m =>
        `<option value="${m}">${thMonths_full[m]}</option>`).join('');
    openModal('Export PDF รายเดือน', `
    <div class="space-y-4">
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">เลือกเดือน</label>
            <select id="sc-pdf-month-sel" class="form-input w-full">
                ${opts}
            </select>
        </div>
        <p class="text-xs text-slate-400">PDF จะแสดงผลการประเมินของเดือนที่เลือกในปี ${_filterYear} รวมทั้ง W1–W4 breakdown</p>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="button" onclick="window._scDoMonthPDF()" class="btn btn-primary px-5 flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                สร้าง PDF
            </button>
        </div>
    </div>`, 'max-w-sm');

    window._scDoMonthPDF = () => {
        const mo = parseInt(document.getElementById('sc-pdf-month-sel')?.value || '1');
        closeModal();
        exportAssessmentMonthlyPDF(mo);
    };
}

function exportAssessmentYearlyPDF() {
    if (typeof window.jspdf === 'undefined') { showToast('ไลบรารี PDF ยังโหลดไม่สำเร็จ', 'error'); return; }
    if (!_assessments.length) { showToast('ไม่มีข้อมูลการประเมินในปี ' + _filterYear, 'warning'); return; }
    showToast('กำลังสร้าง PDF รายปี...', 'info');
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
        const pageW = 210, pageH = 297, margin = 15, cW = pageW - margin * 2;

        let y = _asmtPdfHeader(pdf, pageW,
            `Safety Culture Assessment Report — ${_filterYear}`,
            `Thai Summit Harness Co., Ltd.  |  ${_assessments.length} รายการประเมิน`);

        // ── Yearly score table (all assessments)
        y = _asmtPdfScoreTable(pdf, y, margin, cW, pageH, _assessments, `Score Summary — ปี ${_filterYear}`);

        // ── Monthly breakdown table
        if (y > pageH - 50) { pdf.addPage(); y = 20; }
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 30, 30);
        pdf.text(`Monthly Breakdown — ${_filterYear}`, margin, y); y += 7;

        // table header
        pdf.setFillColor(6, 78, 59);
        pdf.rect(margin, y - 4, cW, 7, 'F');
        pdf.setTextColor(255, 255, 255); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold');
        pdf.text('Month', margin + 2, y);
        const colW2 = (cW - 40) / 7;
        ASMT_CODES.forEach((c, i) => pdf.text(c, margin + 40 + i * colW2 + colW2/2, y, { align: 'center' }));
        pdf.text('Avg', margin + cW - 2, y, { align: 'right' });
        y += 7;

        // group by month
        const monthMap = {};
        _assessments.forEach(a => {
            const m = a.AssessmentDate ? parseInt(String(a.AssessmentDate).substring(5,7), 10) : 0;
            if (!monthMap[m]) monthMap[m] = [];
            monthMap[m].push(a);
        });
        Object.keys(monthMap).map(Number).sort((a,b)=>a-b).forEach(m => {
            const label = m > 0 ? TH_MONTHS[m] : 'ไม่ระบุ';
            y = _asmtPdfMonthRow(pdf, y, margin, cW, pageH, label, monthMap[m]);
        });

        // ── Footer
        const total = pdf.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            pdf.setPage(i);
            pdf.setFontSize(7); pdf.setTextColor(160, 160, 160);
            pdf.text(`TSH Safety — Safety Culture Assessment Report ${_filterYear} — Page ${i}/${total}`, pageW/2, 291, { align:'center' });
        }

        pdf.save(`SC_Assessment_${_filterYear}.pdf`);
        showToast('สร้าง PDF รายปีสำเร็จ', 'success');
    } catch (err) {
        console.error(err);
        showToast('สร้าง PDF ไม่สำเร็จ: ' + escHtml(err.message), 'error');
    }
}

function exportAssessmentMonthlyPDF(month) {
    if (typeof window.jspdf === 'undefined') { showToast('ไลบรารี PDF ยังโหลดไม่สำเร็จ', 'error'); return; }
    const entries = _assessments.filter(a => {
        if (!a.AssessmentDate) return false;
        return parseInt(String(a.AssessmentDate).substring(5,7), 10) === month;
    });
    if (!entries.length) { showToast(`ไม่มีข้อมูลการประเมินเดือน ${TH_MONTHS_FULL[month]} ปี ${_filterYear}`, 'warning'); return; }
    showToast('กำลังสร้าง PDF รายเดือน...', 'info');
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
        const pageW = 210, pageH = 297, margin = 15, cW = pageW - margin * 2;

        let y = _asmtPdfHeader(pdf, pageW,
            `Safety Culture Assessment — ${TH_MONTHS_FULL[month]} ${_filterYear}`,
            `Thai Summit Harness Co., Ltd.  |  ${entries.length} รายการประเมิน`);

        // ── Score table for this month (W1-W4)
        y = _asmtPdfScoreTable(pdf, y, margin, cW, pageH, entries,
            `Score Summary — ${TH_MONTHS_FULL[month]} ${_filterYear}  (W1–W4)`);

        // ── Assessment list for this month
        if (y > pageH - 50) { pdf.addPage(); y = 20; }
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 30, 30);
        pdf.text('Assessment Records', margin, y); y += 7;

        // header
        pdf.setFillColor(6, 78, 59);
        pdf.rect(margin, y - 4, cW, 7, 'F');
        pdf.setTextColor(255, 255, 255); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold');
        pdf.text('Date', margin + 2, y);
        pdf.text('Week', margin + 30, y, { align: 'center' });
        pdf.text('Area', margin + 46, y);
        ASMT_CODES.forEach((c, i) => pdf.text(c, margin + 90 + i * 16, y, { align: 'center' }));
        pdf.text('Avg', margin + cW - 2, y, { align: 'right' });
        y += 7;

        pdf.setFont('helvetica', 'normal');
        entries.forEach((a, ri) => {
            if (y > pageH - 12) { pdf.addPage(); y = 20; }
            const rowVals = ASMT_KEYS.map(k => a[k]!=null?parseFloat(a[k]):null);
            const valid   = rowVals.filter(v=>v!=null);
            const avg     = valid.length ? Math.round(valid.reduce((s,v)=>s+v,0)/valid.length) : null;
            const dateStr = a.AssessmentDate ? String(a.AssessmentDate).substring(0,10) : '-';
            pdf.setFillColor(ri%2===0?248:255, ri%2===0?250:255, ri%2===0?252:255);
            pdf.rect(margin, y - 3.5, cW, 7, 'F');
            pdf.setTextColor(30, 30, 30);
            pdf.text(dateStr, margin + 2, y);
            pdf.text(a.WeekNo ? `W${a.WeekNo}` : '-', margin + 30, y, { align: 'center' });
            pdf.text((a.Area||'-').substring(0,14), margin + 46, y);
            rowVals.forEach((v, i) => {
                _pdfSetScoreColor(pdf, v);
                pdf.text(v!=null?Math.round(v)+'%':'—', margin + 90 + i * 16, y, { align: 'center' });
            });
            _pdfSetScoreColor(pdf, avg);
            pdf.setFont('helvetica', 'bold');
            pdf.text(avg!=null?avg+'%':'—', margin + cW - 2, y, { align: 'right' });
            pdf.setFont('helvetica', 'normal');
            y += 8;
        });

        // ── Footer
        const total = pdf.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            pdf.setPage(i);
            pdf.setFontSize(7); pdf.setTextColor(160, 160, 160);
            pdf.text(`TSH Safety — Safety Culture ${TH_MONTHS_FULL[month]} ${_filterYear} — Page ${i}/${total}`, pageW/2, 291, { align:'center' });
        }

        pdf.save(`SC_Assessment_${_filterYear}_${String(month).padStart(2,'0')}.pdf`);
        showToast('สร้าง PDF รายเดือนสำเร็จ', 'success');
    } catch (err) {
        console.error(err);
        showToast('สร้าง PDF ไม่สำเร็จ: ' + escHtml(err.message), 'error');
    }
}

function _asmtNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
}

function _asmtAvg(entries, key) {
    const vals = (entries || []).map(r => _asmtNum(r?.[key])).filter(v => v !== null);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
}

function _asmtOverall(entries) {
    const vals = (entries || []).map(r => {
        const row = ASMT_KEYS.map(k => _asmtNum(r?.[k])).filter(v => v !== null);
        return row.length ? row.reduce((s, v) => s + v, 0) / row.length : null;
    }).filter(v => v !== null);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
}

function _asmtScoreHtml(v, compact = false) {
    const n = _asmtNum(v);
    if (n === null) return `<span style="color:#94a3b8;font-weight:800;">-</span>`;
    const rounded = Math.round(n);
    const color = rounded >= 90 ? '#059669' : rounded >= 70 ? '#d97706' : '#dc2626';
    const bg = rounded >= 90 ? '#d1fae5' : rounded >= 70 ? '#fef3c7' : '#fee2e2';
    return `<span style="display:inline-block;min-width:${compact ? 34 : 44}px;text-align:center;padding:4px 8px;border-radius:999px;background:${bg};color:${color};font-weight:900;">${rounded}%</span>`;
}

function _asmtStatusText(v) {
    const n = _asmtNum(v);
    if (n === null) return 'No data';
    if (n >= 90) return 'Good';
    if (n >= 70) return 'Monitor';
    return 'Action';
}

function _asmtStatusColor(v) {
    const n = _asmtNum(v);
    if (n === null) return '#64748b';
    if (n >= 90) return '#059669';
    if (n >= 70) return '#d97706';
    return '#dc2626';
}

function _asmtTopicRows(entries, limit = ASMT_KEYS.length) {
    return ASMT_KEYS.map((k, i) => {
        const score = _asmtAvg(entries, k);
        const target = 70;
        return {
            code: ASMT_CODES[i],
            label: ASMT_LBLS[i],
            score,
            target,
            gap: score === null ? null : Math.max(0, target - score),
            status: _asmtStatusText(score)
        };
    }).sort((a, b) => {
        if (a.score === null && b.score !== null) return -1;
        if (a.score !== null && b.score === null) return 1;
        return (a.score ?? 0) - (b.score ?? 0);
    }).slice(0, limit);
}

function _asmtTopicPerformance(entries) {
    const rows = _asmtTopicRows(entries).map(r => `
        <tr>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-weight:900;color:#065f46;">${escHtml(r.code)}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;">${escHtml(r.label)}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${_asmtScoreHtml(r.score, true)}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.target}%</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:${_asmtStatusColor(r.score)};font-weight:900;">${escHtml(r.status)}</td>
        </tr>`).join('');
    return `
    <table style="width:100%;border-collapse:collapse;font-size:10.5px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
        <thead><tr style="background:#065f46;color:#fff;">
            <th style="padding:8px;text-align:left;">Code</th>
            <th style="padding:8px;text-align:left;">Topic</th>
            <th style="padding:8px;text-align:center;">Avg</th>
            <th style="padding:8px;text-align:center;">Target</th>
            <th style="padding:8px;text-align:right;">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

function _asmtActionFocus(entries) {
    const focus = _asmtTopicRows(entries)
        .filter(r => r.score === null || r.score < r.target)
        .slice(0, 4);
    if (!focus.length) {
        return `<div style="height:112px;display:flex;align-items:center;justify-content:center;border:1px solid #d1fae5;background:#ecfdf5;border-radius:10px;color:#047857;font-size:12px;font-weight:900;">All assessment topics are on target.</div>`;
    }
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${focus.map(r => `
            <div style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:10px;min-height:76px;">
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
                    <b style="font-size:11px;color:#065f46;">${escHtml(r.code)} ${escHtml(r.label)}</b>
                    <span style="font-size:11px;font-weight:900;color:${_asmtStatusColor(r.score)};">${r.score === null ? 'No data' : `${Math.round(r.score)}%`}</span>
                </div>
                <div style="font-size:9.5px;color:#64748b;margin-top:6px;line-height:1.45;">Target ${r.target}% · ${r.score === null ? 'Need assessment record' : `Gap ${r.gap}%`}</div>
            </div>`).join('')}
    </div>`;
}

function _asmtLocationFocusBlock(entries, limit = 5) {
    const stats = assessmentLocationStats(entries).slice(0, limit);
    if (!stats.length) {
        return `<div style="border:1px dashed #cbd5e1;background:#f8fafc;border-radius:10px;padding:16px;text-align:center;color:#64748b;font-size:11px;font-weight:800;">No location-level point data in this scope.</div>`;
    }
    const rows = stats.map(loc => {
        const pct = loc.pct;
        const color = pct === null ? '#64748b' : pct >= 90 ? '#059669' : pct >= 70 ? '#d97706' : '#dc2626';
        const bg = pct === null ? '#f1f5f9' : pct >= 90 ? '#d1fae5' : pct >= 70 ? '#fef3c7' : '#fee2e2';
        const focus = loc.lowTopicList.slice(0, 2).map(t => t.key || t.label).join(', ') || '-';
        return `<tr>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-weight:800;">${escHtml(loc.name)}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${loc.checks}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${loc.comply}/${loc.total}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;"><span style="display:inline-block;min-width:38px;padding:4px 8px;border-radius:999px;background:${bg};color:${color};font-weight:900;">${pct === null ? '-' : pct + '%'}</span></td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;color:#64748b;">${escHtml(focus)}</td>
        </tr>`;
    }).join('');
    return `
    <table style="width:100%;border-collapse:collapse;font-size:10px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
        <thead><tr style="background:#064e3b;color:#fff;">
            <th style="padding:8px;text-align:left;">Location</th>
            <th style="padding:8px;text-align:center;">Rows</th>
            <th style="padding:8px;text-align:center;">Comply/Total</th>
            <th style="padding:8px;text-align:center;">Score</th>
            <th style="padding:8px;text-align:left;">Focus Topics</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

function _asmtPage(title, subtitle, bodyHtml, pageNo, totalPages) {
    return `
    <div style="width:794px;height:1122px;background:#fff;color:#1e293b;font-family:'Kanit','Arial',sans-serif;box-sizing:border-box;position:relative;overflow:hidden;display:flex;flex-direction:column;">
        <div style="background:#065f46;color:#fff;padding:18px 28px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-shrink:0;">
            <div>
                <div style="font-size:10px;color:#d1fae5;font-weight:900;">Thai Summit Harness Co., Ltd. · Safety Summary Report</div>
                <h1 style="font-size:21px;line-height:1.2;margin:7px 0 4px;font-weight:900;color:#fff;">${title}</h1>
                <div style="font-size:11px;color:#d1fae5;font-weight:600;">${subtitle}</div>
            </div>
            <div style="text-align:right;font-size:9.5px;color:#d1fae5;font-weight:800;line-height:1.55;min-width:132px;">
                <div>Assessment</div>
                <div>FY ${_filterYear}</div>
                <div>${new Date().toLocaleDateString('th-TH')}</div>
            </div>
        </div>
        <div style="flex:1;padding:18px 28px 42px;overflow:hidden;">${bodyHtml}</div>
        <div style="position:absolute;left:0;right:0;bottom:0;background:#f8fafc;border-top:1px solid #e2e8f0;padding:8px 28px;font-size:9px;color:#64748b;display:flex;justify-content:space-between;">
            <span>Safety Culture Assessment Report - Thai Summit Harness Co., Ltd.</span>
            <span>Page ${pageNo} of ${totalPages}</span>
        </div>
    </div>`;
}

function _asmtSummaryCards(entries, label) {
    const overall = _asmtOverall(entries);
    const lowest = ASMT_KEYS.map((k, i) => ({ code: ASMT_CODES[i], label: ASMT_LBLS[i], score: _asmtAvg(entries, k) }))
        .filter(x => x.score !== null)
        .sort((a, b) => a.score - b.score)[0];
    const mat = overall !== null ? getMaturity(overall) : null;
    return `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;">
        <div style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:11px;min-height:74px;">
            <div style="font-size:9px;color:#64748b;font-weight:900;text-transform:uppercase;">Scope / ขอบเขต</div>
            <div style="font-size:16px;font-weight:900;margin-top:5px;">${escHtml(label)}</div>
        </div>
        <div style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:11px;min-height:74px;">
            <div style="font-size:9px;color:#64748b;font-weight:900;text-transform:uppercase;">Overall / คะแนนรวม</div>
            <div style="font-size:24px;font-weight:900;margin-top:3px;color:${_asmtStatusColor(overall)};">${overall === null ? '-' : `${overall}%`}</div>
        </div>
        <div style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:11px;min-height:74px;">
            <div style="font-size:9px;color:#64748b;font-weight:900;text-transform:uppercase;">Maturity</div>
            <div style="font-size:15px;font-weight:900;margin-top:5px;color:${mat?.color || '#64748b'};">${mat?.label || '-'}</div>
            <div style="font-size:8.5px;color:#94a3b8;margin-top:2px;">${lowest ? `Focus: ${lowest.code}` : 'No focus topic'}</div>
        </div>
        <div style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:11px;min-height:74px;">
            <div style="font-size:9px;color:#64748b;font-weight:900;text-transform:uppercase;">Records / จำนวนบันทึก</div>
            <div style="font-size:24px;font-weight:900;margin-top:3px;">${entries.length}</div>
        </div>
    </div>`;
}

function _asmtTable(entries) {
    const rows = entries.map((a, idx) => {
        const vals = ASMT_KEYS.map(k => _asmtNum(a[k]));
        const valid = vals.filter(v => v !== null);
        const avg = valid.length ? Math.round(valid.reduce((s, v) => s + v, 0) / valid.length) : null;
        return `<tr style="background:${idx % 2 ? '#ffffff' : '#f8fafc'};">
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-weight:800;">${escHtml((a.AssessmentDate || '').substring(0, 10) || '-')}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${a.WeekNo ? `W${a.WeekNo}` : '-'}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;">${escHtml(a.Area || '-')}</td>
            ${vals.map(v => `<td style="padding:7px 5px;border-bottom:1px solid #e2e8f0;text-align:center;">${_asmtScoreHtml(v, true)}</td>`).join('')}
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:900;">${_asmtScoreHtml(avg, true)}</td>
        </tr>`;
    }).join('');
    return `
    <table style="width:100%;border-collapse:collapse;font-size:10px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <thead>
            <tr style="background:#064e3b;color:#fff;">
                <th style="padding:8px;text-align:left;">Date</th>
                <th style="padding:8px;text-align:center;">Week</th>
                <th style="padding:8px;text-align:left;">Area</th>
                ${ASMT_CODES.map(c => `<th style="padding:8px;text-align:center;">${c}</th>`).join('')}
                <th style="padding:8px;text-align:right;">Avg</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

function _asmtMonthlySummaryTable() {
    const rows = Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
        const entries = _assessments.filter(a => a.AssessmentDate && parseInt(String(a.AssessmentDate).substring(5, 7), 10) === m);
        const avg = _asmtOverall(entries);
        return `<tr>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-weight:800;">${escHtml(TH_MONTHS_FULL[m])}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${entries.length}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${_asmtScoreHtml(avg, true)}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;">${escHtml(_asmtStatusText(avg))}</td>
        </tr>`;
    }).join('');
    return `
    <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <thead><tr style="background:#0f766e;color:#fff;">
            <th style="padding:8px;text-align:left;">Month / เดือน</th>
            <th style="padding:8px;text-align:center;">Records</th>
            <th style="padding:8px;text-align:center;">Avg</th>
            <th style="padding:8px;text-align:left;">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

function _asmtCompactRecords(entries, limit = 6) {
    const rows = entries.slice(0, limit).map((a, idx) => {
        const vals = ASMT_KEYS.map(k => _asmtNum(a[k]));
        const valid = vals.filter(v => v !== null);
        const avg = valid.length ? Math.round(valid.reduce((s, v) => s + v, 0) / valid.length) : null;
        return `<tr style="background:${idx % 2 ? '#ffffff' : '#f8fafc'};">
            <td style="padding:6px 7px;border-bottom:1px solid #e2e8f0;font-weight:800;">${escHtml((a.AssessmentDate || '').substring(0, 10) || '-')}</td>
            <td style="padding:6px 7px;border-bottom:1px solid #e2e8f0;text-align:center;">${a.WeekNo ? `W${a.WeekNo}` : '-'}</td>
            <td style="padding:6px 7px;border-bottom:1px solid #e2e8f0;">${escHtml(a.Area || '-')}</td>
            ${vals.map(v => `<td style="padding:6px 4px;border-bottom:1px solid #e2e8f0;text-align:center;">${_asmtScoreHtml(v, true)}</td>`).join('')}
            <td style="padding:6px 7px;border-bottom:1px solid #e2e8f0;text-align:right;">${_asmtScoreHtml(avg, true)}</td>
        </tr>`;
    }).join('');
    return `
    <table style="width:100%;border-collapse:collapse;font-size:9px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
        <thead><tr style="background:#065f46;color:#fff;">
            <th style="padding:7px;text-align:left;">Date</th>
            <th style="padding:7px;text-align:center;">Week</th>
            <th style="padding:7px;text-align:left;">Area</th>
            ${ASMT_CODES.map(c => `<th style="padding:7px 4px;text-align:center;">${c}</th>`).join('')}
            <th style="padding:7px;text-align:right;">Avg</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

function _asmtReviewBlock(entries, scopeLabel = '') {
    const focus = _asmtTopicRows(entries)
        .filter(r => r.score === null || r.score < r.target)
        .slice(0, 3);
    const focusText = focus.length
        ? focus.map(r => `${r.code} ${r.label}${r.score === null ? ' (No data)' : ` (${Math.round(r.score)}%)`}`).join(' | ')
        : 'All topics are on target';
    return `
    <div style="margin-top:14px;display:grid;grid-template-columns:1.1fr .9fr;gap:12px;">
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;min-height:138px;">
            <div style="border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px;">
                <h2 style="font-size:14px;margin:0;color:#065f46;font-weight:900;">Review & Follow-up</h2>
                <p style="font-size:9.5px;color:#64748b;margin:2px 0 0;">${escHtml(scopeLabel)} assessment action summary</p>
            </div>
            <div style="font-size:11px;color:#334155;line-height:1.65;">
                <div><b>Focus:</b> ${escHtml(focusText)}</div>
                <div><b>Next Action:</b> Review weak topics in monthly safety meeting and assign owner for follow-up.</div>
                <div><b>Evidence:</b> Keep assessment record, area note, and improvement action in Safety Culture module.</div>
            </div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;min-height:138px;">
            <div style="border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px;">
                <h2 style="font-size:14px;margin:0;color:#065f46;font-weight:900;">Approval</h2>
                <p style="font-size:9.5px;color:#64748b;margin:2px 0 0;">For monthly safety review use</p>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px;">
                <div style="border-top:1px solid #cbd5e1;padding-top:8px;text-align:center;font-size:10px;color:#64748b;">Prepared by</div>
                <div style="border-top:1px solid #cbd5e1;padding-top:8px;text-align:center;font-size:10px;color:#64748b;">Reviewed by</div>
            </div>
        </div>
    </div>`;
}

async function _saveScAssessmentHtmlPdf(pageHtmlList, filename) {
    if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
        showToast('ไลบรารี PDF ยังโหลดไม่สำเร็จ', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1;';
    document.body.appendChild(holder);
    try {
        for (let i = 0; i < pageHtmlList.length; i++) {
            holder.innerHTML = pageHtmlList[i];
            const page = holder.firstElementChild;
            const canvas = await window.html2canvas(page, {
                scale: 1.5,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false
            });
            if (i > 0) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
        }
        pdf.save(filename);
    } finally {
        holder.remove();
    }
}

function openMonthPickerForAssessmentPDF() {
    const opts = Array.from({ length: 12 }, (_, i) => i + 1)
        .map(m => `<option value="${m}">${escHtml(TH_MONTHS_FULL[m])}</option>`)
        .join('');
    openModal('Export Assessment PDF รายเดือน', `
    <div class="space-y-4">
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">เลือกเดือน / Select Month</label>
            <select id="sc-pdf-month-sel" class="form-input w-full">${opts}</select>
        </div>
        <p class="text-xs text-slate-500">ระบบจะสร้าง PDF แบบ A4 สำหรับนำเสนอ โดยแสดงคะแนน Safety Culture Assessment ของเดือนที่เลือกในปี ${_filterYear}</p>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="button" onclick="window._scDoMonthAssessmentPDF()" class="btn btn-primary px-5">สร้าง PDF</button>
        </div>
    </div>`, 'max-w-sm');
    window._scDoMonthAssessmentPDF = () => {
        const mo = parseInt(document.getElementById('sc-pdf-month-sel')?.value || '1', 10);
        closeModal();
        exportAssessmentMonthlyHtmlPDF(mo);
    };
}

async function exportAssessmentYearlyHtmlPDF() {
    if (!_assessments.length) {
        showToast('ไม่มีข้อมูลการประเมินในปี ' + _filterYear, 'warning');
        return;
    }
    showToast('กำลังสร้าง Assessment PDF รายปี...', 'info');
    try {
        const sorted = [..._assessments].sort((a, b) => String(a.AssessmentDate || '').localeCompare(String(b.AssessmentDate || '')));
        const detailChunks = [];
        for (let i = 0; i < sorted.length; i += 18) detailChunks.push(sorted.slice(i, i + 18));
        const totalPages = 1 + detailChunks.length;
        const pages = [];
        pages.push(_asmtPage(
            `Safety Culture Assessment Report - ${_filterYear}`,
            `รายงานภาพรวมประจำปี / Yearly executive summary`,
            `${_asmtSummaryCards(sorted, `FY ${_filterYear}`)}
             <div style="display:grid;grid-template-columns:1.05fr .95fr;gap:12px;margin-bottom:12px;">
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
                    <div style="border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px;">
                        <h2 style="font-size:14px;margin:0;color:#065f46;font-weight:900;">1. Topic Performance</h2>
                        <p style="font-size:9.5px;color:#64748b;margin:2px 0 0;">Average score by assessment topic</p>
                    </div>
                    ${_asmtTopicPerformance(sorted)}
                </div>
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
                    <div style="border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px;">
                        <h2 style="font-size:14px;margin:0;color:#065f46;font-weight:900;">2. Action Focus</h2>
                        <p style="font-size:9.5px;color:#64748b;margin:2px 0 0;">Lowest topics and target gaps</p>
                    </div>
                    ${_asmtActionFocus(sorted)}
                </div>
             </div>
             <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:12px;">
                    <div style="border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px;">
                        <h2 style="font-size:14px;margin:0;color:#065f46;font-weight:900;">3. Location Follow-up</h2>
                        <p style="font-size:9.5px;color:#64748b;margin:2px 0 0;">Lowest inspection points by saved assessment location</p>
                    </div>
                    ${_asmtLocationFocusBlock(sorted, 3)}
             </div>
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
                    <div style="border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px;">
                        <h2 style="font-size:14px;margin:0;color:#065f46;font-weight:900;">4. Monthly Performance</h2>
                        <p style="font-size:9.5px;color:#64748b;margin:2px 0 0;">Assessment records and monthly average status</p>
                    </div>
                    ${_asmtMonthlySummaryTable()}
             </div>`,
            1,
            totalPages
        ));
        detailChunks.forEach((chunk, idx) => {
            pages.push(_asmtPage(
                `Assessment Records - ${_filterYear}`,
                `รายการบันทึกผลการประเมิน / Assessment detail records`,
                `${_asmtSummaryCards(chunk, `Page ${idx + 1}`)}
                 ${_asmtTable(chunk)}`,
                idx + 2,
                totalPages
            ));
        });
        await _saveScAssessmentHtmlPdf(pages, `SC_Assessment_${_filterYear}.pdf`);
        showToast('สร้าง Assessment PDF รายปีสำเร็จ', 'success');
    } catch (err) {
        console.error(err);
        showToast('สร้าง Assessment PDF ไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด'), 'error');
    }
}

async function exportAssessmentMonthlyHtmlPDF(month) {
    const entries = _assessments.filter(a => a.AssessmentDate && parseInt(String(a.AssessmentDate).substring(5, 7), 10) === month)
        .sort((a, b) => String(a.AssessmentDate || '').localeCompare(String(b.AssessmentDate || '')));
    if (!entries.length) {
        showToast(`ไม่มีข้อมูลการประเมินเดือน ${TH_MONTHS_FULL[month]} ปี ${_filterYear}`, 'warning');
        return;
    }
    showToast('กำลังสร้าง Assessment PDF รายเดือน...', 'info');
    try {
        const chunks = [];
        for (let i = 0; i < entries.length; i += 18) chunks.push(entries.slice(i, i + 18));
        const totalPages = 1 + chunks.length;
        const pages = [];
        pages.push(_asmtPage(
            `Safety Culture Assessment - ${TH_MONTHS_FULL[month]} ${_filterYear}`,
            `รายงานประจำเดือน / Monthly executive summary`,
            `${_asmtSummaryCards(entries, `${TH_MONTHS_FULL[month]} ${_filterYear}`)}
             <div style="display:grid;grid-template-columns:1.05fr .95fr;gap:12px;margin-bottom:12px;">
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
                    <div style="border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px;">
                        <h2 style="font-size:14px;margin:0;color:#065f46;font-weight:900;">1. Topic Performance</h2>
                        <p style="font-size:9.5px;color:#64748b;margin:2px 0 0;">Monthly average score by topic</p>
                    </div>
                    ${_asmtTopicPerformance(entries)}
                </div>
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
                    <div style="border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px;">
                        <h2 style="font-size:14px;margin:0;color:#065f46;font-weight:900;">2. Action Focus</h2>
                        <p style="font-size:9.5px;color:#64748b;margin:2px 0 0;">Lowest topics and target gaps</p>
                    </div>
                    ${_asmtActionFocus(entries)}
                </div>
             </div>
             <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:12px;">
                    <div style="border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px;">
                        <h2 style="font-size:14px;margin:0;color:#065f46;font-weight:900;">3. Location Follow-up</h2>
                        <p style="font-size:9.5px;color:#64748b;margin:2px 0 0;">Lowest inspection points in selected month</p>
                    </div>
                    ${_asmtLocationFocusBlock(entries, 3)}
             </div>
             <div style="border:1px solid #d1fae5;background:#ecfdf5;border-radius:12px;padding:12px;font-size:11px;color:#047857;line-height:1.6;">
                <strong>Monthly Safety Review:</strong> ใช้หน้านี้เพื่อดูหัวข้อที่ต่ำกว่าเป้าหมาย มอบหมายผู้รับผิดชอบ และติดตามผลในเดือนถัดไป ส่วนรายละเอียดรายครั้งอยู่ในหน้า Register ถัดไป
             </div>`,
            1,
            totalPages
        ));
        chunks.forEach((chunk, idx) => {
            pages.push(_asmtPage(
                `Assessment Records - ${TH_MONTHS_FULL[month]} ${_filterYear}`,
                `รายการบันทึกผลการประเมินรายเดือน / Monthly assessment register`,
                `${_asmtSummaryCards(chunk, `Page ${idx + 1}`)}
                 ${_asmtTable(chunk)}
                 ${idx === 0 ? _asmtReviewBlock(entries, `${TH_MONTHS_FULL[month]} ${_filterYear}`) : ''}`,
                idx + 2,
                totalPages
            ));
        });
        await _saveScAssessmentHtmlPdf(pages, `SC_Assessment_${_filterYear}_${String(month).padStart(2, '0')}.pdf`);
        showToast('สร้าง Assessment PDF รายเดือนสำเร็จ', 'success');
    } catch (err) {
        console.error(err);
        showToast('สร้าง Assessment PDF ไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด'), 'error');
    }
}

// scores = [T1,T2,T3,T4,T5,T6(PPE),T7] — same order as _dashScores
function _buildSuggestionsFromScores(scores) {
    if (!scores) return ['กรุณาบันทึกผลการประเมินเพื่อรับคำแนะนำการพัฒนา'];
    const list = [];
    const pairs = [
        [scores[0], 'T1 Walk Way — เสริมสัญลักษณ์ Walk Way และจัดกิจกรรมรณรงค์'],
        [scores[1], 'T2 No-Phone Policy — เพิ่มป้ายเตือนและบังคับใช้อย่างสม่ำเสมอ'],
        [scores[2], 'T3 Crosswalk — ติดตั้งสิ่งกีดขวางเพื่อป้องกันการข้ามถนนผิดจุด'],
        [scores[3], 'T4 Pointing & Calling — บรรจุในการประชุม Safety Briefing ทุกวัน'],
        [scores[4], 'T5 Hands-Free Walking — อบรมให้ความรู้เรื่องการป้องกันการลื่นหกล้ม'],
        [scores[6], 'T7 Waste Segregation — ติดป้ายถังขยะให้ชัดเจนและจัดอบรมทบทวน'],
    ];
    pairs.forEach(([score, msg]) => { if (score > 0 && score < 70) list.push(msg); });
    if (scores[5] > 0 && scores[5] < 90) {
        list.push('PPE — เพิ่มความเข้มงวดในการตรวจ PPE ประจำวัน และจัดเตรียมอุปกรณ์สำรอง');
    }
    return list.length ? list : ['ทุกหัวข้ออยู่ในเกณฑ์ดี — รักษาระดับวัฒนธรรมความปลอดภัยให้ต่อเนื่อง'];
}

function buildSuggestions() {
    return _buildSuggestionsFromScores(_dashScores);
}
