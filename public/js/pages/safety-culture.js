// public/js/pages/safety-culture.js

import { API } from '../api.js';
import { openModal, closeModal, showToast, escHtml } from '../ui.js';

// ── State ──────────────────────────────────────────────────────────────────
let _isAdmin        = false;
let _activeTab      = 'principles';
let _principles     = [];
let _assessments    = [];
let _ppeInspections = [];
let _ppeItems       = [];
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
let _ppeChartInst   = null;
let _filterDashMonth = 0;   // 0 = รายปี, 1-12 = เดือน
let _dashScores      = null; // [T1,T2,T3,T4,T5,T6(PPE),T7] ใช้โดย initCharts()
let _dataLoaded      = false; // true after first successful _loadHeroStats()

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
        { id: 'principles', label: 'วัฒนธรรมความปลอดภัย',
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
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
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
                                Safety Culture
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">Safety &amp; Environment Culture</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">วัฒนธรรมความปลอดภัยและสิ่งแวดล้อม · Thai Summit Harness Co., Ltd.</p>
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
    });

    document.addEventListener('change', e => {
        if (e.target?.id === 'sc-year-sel') {
            _filterYear = parseInt(e.target.value) || new Date().getFullYear();
            _filterDashMonth = 0; // reset month filter on year change
            _loadHeroStats();
        }
    });

    // Panel inline-onclick globals
    window._scSetDashMonth     = (v)   => { _filterDashMonth = parseInt(v)||0; _updateHeroStats(); renderPanel('dashboard'); };
    window._scSetDeptFilter    = (val) => { _filterPPEDept = val; renderPanel('ppe'); };
    window._scSetPPESub        = (s)   => { _ppeSub = s; renderPanel('ppe'); };
    window._scSetPPESearch     = (v)   => { _ppeSearch = v; renderPanel('ppe'); };
    window._scSetPPEWT         = (v)   => { _ppeFilterWT = v; renderPanel('ppe'); };
    window._scSetPPEStatus     = (v)   => { _ppeFilterStatus = v; renderPanel('ppe'); };
    window._scSetTab           = (id) => switchTab(id);
    window._scEditPrinciple    = (id) => openPrincipleForm(id);
    window._scAddAssessment    = () => openAssessmentForm(null);
    window._scEditAssessment   = (id) => openAssessmentForm(id);
    window._scDeleteAssessment = (id) => deleteAssessment(id);
    window._scAddPPE           = () => openPPEForm();
    window._scViewPPE          = (id) => viewPPERecord(id);
    window._scDeletePPE        = (id) => deletePPE(id);
    window._scExportPDF             = () => exportPDF();
    window._scExportAssessmentPDF   = (mode) => mode === 'monthly' ? openMonthPickerForPDF() : exportAssessmentYearlyPDF();
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
            API.get(`/safety-culture/ppe-violations?year=${_filterYear}`).catch(() => ({ data: [] })),
        ];
        if (_departments.length === 0) fetches.push(_fetchDepts());
        const [pRes, aRes, ppeRes, dRes, itemsRes, wtRes, violRes] = await Promise.all(fetches);
        _principles     = pRes.data      || [];
        _assessments    = aRes.data      || [];
        _ppeInspections = ppeRes.data    || [];
        _dashData       = dRes.data      || null;
        _ppeItems       = itemsRes?.data || [];
        _ppeWorkTypes   = wtRes?.data    || [];
        _ppeViolations  = violRes?.data  || [];
        _dataLoaded     = true;

        const avg      = _dashData?.avgScores;
        const ppeStats = _dashData?.ppeStats;

        let overallAvg = null;
        if (avg) {
            const vals = [avg.avg_t1, avg.avg_t2, avg.avg_t3, avg.avg_t4, avg.avg_t5, avg.avg_t7]
                .filter(v => v != null).map(v => parseFloat(v));
            if (vals.length) overallAvg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
        }
        const mat    = overallAvg ? getMaturity(overallAvg) : null;
        const ppePct = ppeStats?.overall_pct != null
            ? parseFloat(ppeStats.overall_pct).toFixed(1) + '%'
            : '—';

        _setStatVal(0, mat ? mat.label : '—');
        _setStatVal(1, overallAvg != null ? overallAvg + '%' : '—');
        _setStatVal(2, ppePct);
        _setStatVal(3, _ppeInspections.length);

        renderPanel(_activeTab);
    } catch (err) {
        showToast('โหลดข้อมูลไม่สำเร็จ: ' + escHtml(err.message), 'error');
    }
}

function _setStatVal(idx, val) {
    const el = document.querySelector(`[data-sc-stat="${idx}"]`);
    if (el) el.textContent = val;
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

    let ppePct = null;
    if (filteredP.length > 0) {
        const passC = filteredP.filter(r => r.IsPass===1||r.IsPass==='1').length;
        ppePct = (passC / filteredP.length * 100).toFixed(1) + '%';
    } else if (mo === 0 && _dashData?.ppeStats?.overall_pct != null) {
        ppePct = parseFloat(_dashData.ppeStats.overall_pct).toFixed(1) + '%';
    }

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
    return `<div class="card p-4 space-y-3">${Array.from({length: rows}, () => _skRow('full', 3)).join('')}</div>`;
}
function _buildSkeleton(tabId) {
    const kpiRow = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${Array.from({length:4},()=>`<div class="card p-4 flex items-center gap-3 animate-pulse">
            <div class="w-10 h-10 rounded-xl bg-slate-200 flex-shrink-0"></div>
            <div class="flex-1 space-y-2"><div class="h-6 bg-slate-200 rounded w-16"></div><div class="h-3 bg-slate-100 rounded w-24"></div></div>
        </div>`).join('')}
    </div>`;

    if (tabId === 'dashboard') return `
    <div class="space-y-5 animate-pulse">
        <div class="card p-3"><div class="h-8 bg-slate-200 rounded w-48"></div></div>
        ${kpiRow}
        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            ${Array.from({length:7},()=>`<div class="card p-4 h-24 bg-slate-200 rounded-xl"></div>`).join('')}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="card p-5 h-72"><div class="h-4 bg-slate-200 rounded w-40 mb-4"></div><div class="h-56 bg-slate-100 rounded-xl"></div></div>
            <div class="card p-5 h-72"><div class="h-4 bg-slate-200 rounded w-40 mb-4"></div><div class="h-56 bg-slate-100 rounded-xl"></div></div>
        </div>
        <div class="card p-5 h-52"><div class="h-4 bg-slate-200 rounded w-40 mb-4"></div><div class="h-36 bg-slate-100 rounded-xl"></div></div>
    </div>`;

    if (tabId === 'assessment') return `
    <div class="space-y-4 animate-pulse">
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100"><div class="h-5 bg-slate-200 rounded w-48"></div></div>
            <div class="p-4 space-y-3">${Array.from({length:4},()=>`<div class="h-10 bg-slate-100 rounded-lg"></div>`).join('')}</div>
        </div>
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100"><div class="h-5 bg-slate-200 rounded w-40"></div></div>
            <div class="p-4 space-y-2">${Array.from({length:6},()=>`<div class="h-9 bg-slate-100 rounded-lg"></div>`).join('')}</div>
        </div>
    </div>`;

    if (tabId === 'ppe') return `
    <div class="space-y-4 animate-pulse">
        <div class="flex gap-2">${Array.from({length:3},()=>`<div class="h-9 w-24 bg-slate-200 rounded-lg"></div>`).join('')}</div>
        ${kpiRow}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="card p-5 h-64"><div class="h-4 bg-slate-200 rounded w-32 mb-4"></div><div class="space-y-3">${Array.from({length:5},()=>`<div class="h-6 bg-slate-100 rounded"></div>`).join('')}</div></div>
            <div class="card p-5 h-64"><div class="h-4 bg-slate-200 rounded w-32 mb-4"></div><div class="h-48 bg-slate-100 rounded-xl"></div></div>
        </div>
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100"><div class="h-5 bg-slate-200 rounded w-40"></div></div>
            <div class="p-4 space-y-2">${Array.from({length:5},()=>`<div class="h-9 bg-slate-100 rounded-lg"></div>`).join('')}</div>
        </div>
    </div>`;

    // principles (default)
    return `
    <div class="space-y-4 animate-pulse">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            ${Array.from({length:4},()=>`<div class="card p-3 flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-slate-200 flex-shrink-0"></div>
                <div class="flex-1 space-y-2"><div class="h-5 bg-slate-200 rounded w-16"></div><div class="h-3 bg-slate-100 rounded w-20"></div></div>
            </div>`).join('')}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            ${Array.from({length:8},()=>`<div class="card overflow-hidden h-72">
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
function buildPrinciplesHtml() {
    const cards = _principles.map(p => {
        const idx   = p.SortOrder - 1;
        const icon  = TOPIC_SVG[idx] || TOPIC_SVG[5];
        const isPPE = p.SortOrder === 6;
        return `
        <div class="card overflow-hidden hover:shadow-md transition-shadow flex flex-col">
            ${p.ImageUrl
                ? `<img src="${escHtml(p.ImageUrl)}" alt="${escHtml(p.Title)}" class="w-full h-44 object-cover cursor-zoom-in hover:opacity-90 transition-opacity" onclick="window._scViewImage('${escHtml(p.ImageUrl)}','${escHtml(p.Title)}')">`
                : `<div class="w-full h-44 flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#f0fdf4,#ecfdf5)">${icon}</div>`
            }
            <div class="p-4 flex flex-col flex-1">
                <div class="flex items-start gap-2 mb-2">
                    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white flex-shrink-0 mt-0.5" style="background:linear-gradient(135deg,#059669,#0d9488)">${p.SortOrder}</span>
                    <h3 class="font-semibold text-slate-800 text-sm leading-snug flex-1">${escHtml(p.Title)}</h3>
                    ${_isAdmin ? `<button onclick="window._scEditPrinciple('${escHtml(p.PrincipleID)}')" class="flex-shrink-0 p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 transition-colors" title="แก้ไข"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>` : ''}
                </div>
                <p class="text-xs text-slate-500 leading-relaxed flex-1">${escHtml(p.Description)}</p>
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
        <div class="card p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#059669,#0d9488)">
                <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            </div>
            <div>
                <p class="text-2xl font-bold ${overallAvgP!=null?(overallAvgP<70?'text-red-600':overallAvgP<90?'text-amber-600':'text-emerald-600'):'text-slate-300'}">${overallAvgP!=null?overallAvgP+'%':'—'}</p>
                <p class="text-xs text-slate-500">คะแนนเฉลี่ยปี ${thisYear}</p>
            </div>
        </div>
        <div class="card p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50">
                <svg class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>
            </div>
            <div>
                <p class="text-2xl font-bold ${ppePctP!=null?(ppePctP<70?'text-red-600':ppePctP<90?'text-amber-600':'text-emerald-600'):'text-slate-300'}">${ppePctP!=null?ppePctP+'%':'—'}</p>
                <p class="text-xs text-slate-500">PPE ผ่านตรวจปี ${thisYear} (${ppeTotalP} ครั้ง)</p>
            </div>
        </div>
        <div class="card p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${violTotalP>0?'bg-red-50':'bg-emerald-50'}">
                <svg class="w-5 h-5 ${violTotalP>0?'text-red-500':'text-emerald-500'}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
            </div>
            <div>
                <p class="text-2xl font-bold ${violTotalP>0?'text-red-600':'text-emerald-600'}">${violTotalP}</p>
                <p class="text-xs text-slate-500">การฝ่าฝืน PPE ปี ${thisYear}</p>
            </div>
        </div>
        <div class="card p-4 flex items-center gap-3">
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
    <div class="card p-5">
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
        <div>
            <p class="text-sm text-slate-500 mb-4">วัฒนธรรมความปลอดภัย ${_principles.length} หัวข้อ</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                ${cards || '<p class="col-span-full text-center py-12 text-slate-400">ไม่พบข้อมูล</p>'}
            </div>
        </div>
        ${recentActivity}
    </div>`;
}

// ── Tab: Assessment ────────────────────────────────────────────────────────
function buildMonthlyAssessmentSummary() {
    if (!_assessments.length) return '';
    const monthMap = {};
    _assessments.forEach(a => {
        const key = a.AssessmentDate
            ? String(a.AssessmentDate).substring(0, 7)
            : `${a.AssessmentYear}-00`;
        if (!monthMap[key]) monthMap[key] = [];
        monthMap[key].push(a);
    });
    const months = Object.keys(monthMap).sort().reverse();
    const SKEYS = ['T1_Score','T2_Score','T3_Score','T4_Score','T5_Score','T7_Score'];
    const SLBLS = ['T1','T2','T3','T4','T5','T7'];

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
    <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-semibold text-slate-700">สรุปรายเดือน ปี ${_filterYear}</h3>
            <span class="text-xs text-slate-400">${months.length} เดือน · คะแนน 0–100%</span>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
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

function buildAssessmentHtml() {
    const rows = _assessments.map(a => {
        const vals = [a.T1_Score, a.T2_Score, a.T3_Score, a.T4_Score, a.T5_Score, a.T7_Score].filter(v => v != null);
        const avg  = vals.length ? (vals.reduce((s, v) => s + parseFloat(v), 0) / vals.length) : null;
        const mat  = avg != null ? getMaturity(avg) : null;
        const scoreCell = (v) => {
            const n = v != null ? parseFloat(v) : null;
            return `<td class="px-3 py-2.5 text-center text-xs ${scoreColor(n)}"${n != null && n < 70 ? ' style="background:rgba(254,242,242,0.6)"' : ''}>${n != null ? Math.round(n)+'%' : '-'}</td>`;
        };
        const dateLabel = a.AssessmentDate ? fmtDate(a.AssessmentDate) : a.AssessmentYear;
        const weekLabel = a.WeekNo ? `<span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">W${a.WeekNo}</span>` : '';
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-2.5 text-sm font-medium text-slate-800 whitespace-nowrap">${dateLabel}${weekLabel}</td>
            <td class="px-4 py-2.5 text-sm text-slate-600">${escHtml(a.Area)}</td>
            ${scoreCell(a.T1_Score)}${scoreCell(a.T2_Score)}${scoreCell(a.T3_Score)}${scoreCell(a.T4_Score)}${scoreCell(a.T5_Score)}
            <td class="px-3 py-2.5 text-center text-xs text-slate-400 italic">PPE*</td>
            ${scoreCell(a.T7_Score)}
            <td class="px-4 py-2.5 text-center">${avg != null ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${mat.bg} ${mat.color}">${Math.round(avg)}%</span>` : '-'}</td>
            <td class="px-4 py-2.5 text-center text-xs">${mat ? `<span class="inline-flex items-center gap-1.5 font-semibold ${mat.color}"><span class="w-1.5 h-1.5 rounded-full inline-block ${mat.dot}"></span>${mat.label}</span>` : '-'}</td>
            ${_isAdmin ? `<td class="px-4 py-2.5 whitespace-nowrap">
                <button onclick="window._scEditAssessment('${a.AssessmentID}')" class="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 transition-colors" title="แก้ไข"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                <button onclick="window._scDeleteAssessment('${a.AssessmentID}')" class="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="ลบ"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
            </td>` : ''}
        </tr>`;
    }).join('');

    const colCount = _isAdmin ? 12 : 11;
    return `
    <div class="space-y-4">
        ${buildMonthlyAssessmentSummary()}
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
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="font-semibold text-slate-700">ประวัติการประเมิน ปี ${_filterYear}</h3>
                <span class="text-xs text-slate-400">${_assessments.length} รายการ</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">วันที่</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">พื้นที่</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="เดินบน Walk Way">T1</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="ไม่ใช้โทรศัพท์">T2</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="ข้ามถนนทางม้าลาย">T3</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="หยุดชี้นิ้ว">T4</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="ไม่ล้วงกระเป๋า">T5</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="PPE Control">T6</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="แยกขยะ">T7</th>
                            <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">เฉลี่ย</th>
                            <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">ระดับ</th>
                            ${_isAdmin ? '<th class="px-4 py-3"></th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan="${colCount}" class="text-center py-12 text-slate-400">ยังไม่มีผลการประเมินสำหรับปี ${_filterYear}</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
        <p class="text-xs text-slate-400">* T6 (PPE Control) คำนวณจาก PPE Inspection Checklist แยกต่างหาก</p>
        <div class="card p-4">
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

function buildPPEHtml() {
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
            class="px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${_ppeSub===t.id?'bg-emerald-600 text-white shadow-sm':'bg-white/60 text-slate-600 hover:bg-white'}">${t.label}</button>`).join('')}
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
    const all = _ppeInspections;
    const total      = all.length;
    const passCount  = all.filter(r => r.IsPass === 1 || r.IsPass === '1').length;
    const failCount  = total - passCount;
    const passRate   = total > 0 ? Math.round(passCount / total * 100) : null;
    const violCount  = _ppeViolations.length;

    const kpiCards = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                <svg class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div><p class="text-2xl font-bold text-slate-800">${total}</p><p class="text-xs text-slate-500">ครั้งตรวจทั้งหมด</p></div>
        </div>
        <div class="card p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                <svg class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            </div>
            <div><p class="text-2xl font-bold text-emerald-600">${passCount}</p><p class="text-xs text-slate-500">ผ่าน (100% Compliant)</p></div>
        </div>
        <div class="card p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-50">
                <svg class="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </div>
            <div><p class="text-2xl font-bold text-red-600">${failCount}</p><p class="text-xs text-slate-500">ไม่ผ่าน (มีรายการบกพร่อง)</p></div>
        </div>
        <div class="card p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${violCount>0?'bg-orange-50':'bg-slate-50'}">
                <svg class="w-5 h-5 ${violCount>0?'text-orange-500':'text-slate-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div><p class="text-2xl font-bold ${violCount>0?'text-orange-600':'text-slate-400'}">${violCount}</p><p class="text-xs text-slate-500">บันทึกฝ่าฝืน PPE</p></div>
        </div>
    </div>`;

    const passRateBar = passRate !== null ? `
    <div class="card p-5 border-l-4 ${passRate>=90?'border-emerald-400':passRate>=70?'border-amber-400':'border-red-400'}">
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
    _ppeViolations.forEach(v => {
        const key = v.EmployeeID || v.EmployeeName;
        if (!empViolMap2[key]) empViolMap2[key] = { name:v.EmployeeName, dept:v.Department, count:0, level:v.WarningLevel };
        empViolMap2[key].count++;
        empViolMap2[key].level = v.WarningLevel;
    });
    const highRisk2 = Object.values(empViolMap2).filter(e => e.count >= 2).sort((a,b) => b.count-a.count).slice(0,10);
    const highRiskTable2 = highRisk2.length ? `
    <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <span class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-100">
                <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </span>
            <div><h3 class="font-semibold text-slate-700">พนักงานที่มีบันทึกฝ่าฝืนซ้ำ</h3><p class="text-xs text-slate-400">≥ 2 ครั้ง</p></div>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
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
        ${kpiCards}
        ${passRateBar}
        ${depts2.length ? `
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="font-semibold text-slate-700">Pass Rate รายแผนก — ปี ${_filterYear}</h3>
                <span class="text-xs text-slate-400">${depts2.length} แผนก</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50"><tr>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">แผนก</th>
                        <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">ครั้ง</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Pass Rate</th>
                    </tr></thead>
                    <tbody>${deptRows2}</tbody>
                </table>
            </div>
        </div>` : `<div class="card p-8 text-center text-slate-400 text-sm">ยังไม่มีข้อมูล PPE Inspection สำหรับปี ${_filterYear}</div>`}
        ${highRiskTable2}
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
    <div class="card p-4 flex flex-wrap items-center gap-3">
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
        ${filterBar}
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="font-semibold text-slate-700">ประวัติการตรวจ PPE ปี ${_filterYear}</h3>
                <span class="text-xs text-slate-400">${filtered.length} รายการ</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50"><tr>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">วันที่</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">พนักงานที่ตรวจ</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">แผนก</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ประเภทงาน</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ผู้ตรวจ</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">รายการ</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ผล</th>
                        <th class="px-4 py-3"></th>
                    </tr></thead>
                    <tbody>${rows3||`<tr><td colspan="8" class="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>`}</tbody>
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
        <div class="card overflow-hidden">
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
            <div>${wtRows||'<div class="px-5 py-8 text-center text-sm text-slate-400">ยังไม่มีเทมเพลต — กดเพิ่มประเภทงาน</div>'}</div>
        </div>
        <div class="card overflow-hidden">
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
                    <span class="flex-1 text-sm text-slate-800 font-medium">${escHtml(item.ItemName)}</span>
                    <div class="flex gap-1">
                        <button onclick="window._scEditPPEItem('${item.ItemID}')" class="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                        <button onclick="window._scDeletePPEItem('${item.ItemID}')" class="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                    </div>
                </div>`).join('') : `<p class="px-5 py-4 text-sm text-slate-400">ยังไม่มีรายการ PPE</p>`}
            </div>
        </div>
    </div>`;
}

// ── PPE Violations sub-tab ─────────────────────────────────────────────────
function buildPPEViolations() {
    const empMapV = {};
    _ppeViolations.forEach(v => {
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

    const detailRowsV = _ppeViolations.slice().reverse().map(v => `
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
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100">
                <h3 class="font-semibold text-slate-700">สรุปรายพนักงาน</h3>
                <p class="text-xs text-slate-400 mt-0.5">${empsV.length} คน — ปี ${_filterYear}</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
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
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100">
                <h3 class="font-semibold text-slate-700">บันทึกทั้งหมด</h3>
                <p class="text-xs text-slate-400 mt-0.5">${_ppeViolations.length} รายการ</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
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
    } else if (mo === 0 && _dashData?.ppeStats?.overall_pct != null) {
        ppePct = parseFloat(_dashData.ppeStats.overall_pct);
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
    <div class="card p-3 flex flex-wrap items-center gap-3">
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
    if (mo === 0 && _dashData?.ppeStats?.itemBreakdown?.length) {
        ppeItemRows = _dashData.ppeStats.itemBreakdown;
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
        return `<div class="card p-4 text-center">
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
    const quickCards = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="card p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50">
                <svg class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <div>
                <p class="text-xl font-bold ${overallAvg!==null?(overallAvg<70?'text-red-600':overallAvg<90?'text-amber-600':'text-emerald-600'):'text-slate-400'}">${overallAvg!==null?overallAvg+'%':'—'}</p>
                <p class="text-xs text-slate-500">คะแนนเฉลี่ย ${periodLabel}</p>
            </div>
        </div>
        <div class="card p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                <svg class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
            </div>
            <div>
                <p class="text-sm font-bold text-emerald-600 truncate">${bestTopic?escHtml(bestTopic.label):'—'}</p>
                <p class="text-xs text-slate-500">หัวข้อคะแนนสูงสุด${bestTopic?' ('+bestTopic.avg+'%)':''}</p>
            </div>
        </div>
        <div class="card p-4 flex items-center gap-3">
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
    <div class="card p-4">
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
    <div class="card p-5">
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

    return `
    <div class="space-y-5">
        ${monthFilterBar}
        ${enterpriseStrip}
        ${quickCards}
        ${mat ? `
        <div class="card p-5 border-l-4 ${mat.border}">
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
        <div class="card p-10 text-center text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            </div>
            <p>ยังไม่มีข้อมูลการประเมิน${mo>0?`สำหรับ${periodLabel}`:''} — กรุณาบันทึกผลในแท็บ "ผลการประเมิน"</p>
        </div>`}

        ${violStrip}

        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">${scoreCards}</div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="card p-5">
                <h3 class="font-semibold text-slate-700 mb-4">คะแนนเฉลี่ยแต่ละหัวข้อ — Radar Chart <span class="text-xs font-normal text-slate-400">${periodLabel}</span></h3>
                <div class="relative" style="height:280px"><canvas id="sc-radar-chart"></canvas></div>
            </div>
            <div class="card p-5">
                <h3 class="font-semibold text-slate-700 mb-4">คะแนนแต่ละหัวข้อ — Bar Chart <span class="text-xs font-normal text-slate-400">${periodLabel}</span></h3>
                <div class="relative" style="height:280px"><canvas id="sc-bar-chart"></canvas></div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="card p-5">
                <h3 class="font-semibold text-slate-700 mb-4">แนวโน้มคะแนนเฉลี่ยรายปี — Trend <span class="text-xs font-normal text-slate-400">(แสดงเฉพาะรายปี)</span></h3>
                <div class="relative" style="height:220px"><canvas id="sc-line-chart"></canvas></div>
            </div>
            ${ppeRows.length ? `
            <div class="card p-5">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-semibold text-slate-700">PPE Compliance per Item — ${periodLabel}</h3>
                    <span class="text-xs text-slate-400">${filteredPPE.length} ครั้งตรวจ</span>
                </div>
                ${ppeRows}
            </div>` : '<div></div>'}
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
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">URL ไฟล์แนบ (Download)</label>
            <input name="AttachmentUrl" type="url" value="${escHtml(p.AttachmentUrl || '')}" placeholder="https://..." class="form-input w-full"></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อไฟล์แนบ</label>
            <input name="AttachmentName" type="text" value="${escHtml(p.AttachmentName || '')}" placeholder="เช่น คู่มือ Walk Way.pdf" class="form-input w-full"></div>
        <div id="sc-pf-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-lg');

    setTimeout(() => {
        document.getElementById('sc-pf')?.addEventListener('submit', async e => {
            e.preventDefault();
            const data  = Object.fromEntries(new FormData(e.target).entries());
            const errEl = document.getElementById('sc-pf-err');
            try {
                await API.put(`/safety-culture/principles/${data.PrincipleID}`, data);
                closeModal();
                showToast('บันทึกสำเร็จ', 'success');
                await _loadHeroStats();
            } catch (err) {
                errEl.textContent = escHtml(err.message || 'เกิดข้อผิดพลาด');
                errEl.classList.remove('hidden');
            }
        });
    }, 50);
}

// ── Assessment Form ────────────────────────────────────────────────────────
async function openAssessmentForm(id) {
    const a     = id ? _assessments.find(x => x.AssessmentID === id) : null;
    const today = new Date().toISOString().split('T')[0];

    // Lazy-load areas from master (Patrol_Areas)
    if (_scAreas.length === 0) {
        try {
            const r = await API.get('/master/areas');
            _scAreas = (r.data || []).map(ar => ar.Name).filter(Boolean);
        } catch { _scAreas = []; }
    }

    const TOPIC_DEFS = [
        { key: 'T1', label: '1. เดินบน Walk Way' },
        { key: 'T2', label: '2. ไม่ใช้โทรศัพท์ขณะเดิน' },
        { key: 'T3', label: '3. ข้ามถนนทางม้าลาย' },
        { key: 'T4', label: '4. หยุดยืนชี้นิ้ว' },
        { key: 'T5', label: '5. ไม่ล้วงกระเป๋า' },
        { key: 'T7', label: '7. แยกขยะถูกต้อง' },
    ];

    // Restore existing points from a.points array
    const getPoint = (tk, pn, field) => {
        if (!a?.points) return '';
        const pt = a.points.find(p => p.TopicKey === tk && parseInt(p.PointNo) === pn);
        return pt ? (pt[field] ?? '') : '';
    };

    const savedTopicAreas = a?.topicAreas || {};
    const areaOpts = _scAreas.length > 0
        ? `<option value="">— ไม่ระบุ —</option>` + _scAreas.map(ar => `<option value="${escHtml(ar)}">${escHtml(ar)}</option>`).join('')
        : `<option value="">— ไม่มีพื้นที่ในระบบ —</option>`;

    const topicBlocks = TOPIC_DEFS.map(t => {
        const existingScore = a ? (a[`${t.key}_Score`] != null ? Math.round(parseFloat(a[`${t.key}_Score`])) : '') : '';
        const savedArea = savedTopicAreas[t.key] || '';
        const pts = [1,2,3].map(pn => {
            const tot = getPoint(t.key, pn, 'TotalPeople');
            const cmp = getPoint(t.key, pn, 'ComplyPeople');
            return `
            <div class="flex items-center gap-2 py-1.5">
                <span class="text-xs text-slate-400 w-14 flex-shrink-0">จุดที่ ${pn}</span>
                <input type="number" min="0" placeholder="จำนวน"
                    id="sc-tot-${t.key}-${pn}" value="${tot}"
                    class="form-input text-xs py-1.5 w-24 flex-shrink-0" style="min-width:0">
                <input type="number" min="0" placeholder="ปฏิบัติ"
                    id="sc-cmp-${t.key}-${pn}" value="${cmp}"
                    class="form-input text-xs py-1.5 w-24 flex-shrink-0" style="min-width:0">
                <span id="sc-pct-${t.key}-${pn}" class="text-xs font-semibold w-12 text-right text-slate-400 flex-shrink-0">—%</span>
            </div>`;
        }).join('');

        // Area select — set selected after rendering via JS so it handles values not in the list gracefully
        const areaSelect = _scAreas.length > 0
            ? `<select id="sc-area-${t.key}" class="form-input text-xs py-1 flex-1" style="min-width:0">${areaOpts}</select>`
            : `<input id="sc-area-${t.key}" type="text" placeholder="ระบุพื้นที่..." value="${escHtml(savedArea)}" class="form-input text-xs py-1 flex-1" style="min-width:0">`;

        return `
        <div class="border border-slate-100 rounded-lg overflow-hidden">
            <div class="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                <span class="text-sm font-semibold text-slate-700">${t.label}</span>
                <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-400">ผลรวม:</span>
                    <span id="sc-wscore-${t.key}" class="text-sm font-bold text-emerald-600">—%</span>
                    <input type="hidden" name="${t.key}_Score" id="sc-hidden-${t.key}" value="${existingScore}">
                </div>
            </div>
            <div class="px-3 py-2 border-b border-slate-50 flex items-center gap-2">
                <span class="text-xs text-slate-500 w-14 flex-shrink-0">พื้นที่</span>
                ${areaSelect}
            </div>
            <div class="px-3">
                <div class="flex items-center gap-2 py-1 border-b border-slate-50">
                    <span class="text-xs text-slate-400 w-14 flex-shrink-0"></span>
                    <span class="text-xs text-slate-400 w-24 flex-shrink-0 text-center">จำนวน (คน)</span>
                    <span class="text-xs text-slate-400 w-24 flex-shrink-0 text-center">ปฏิบัติตาม</span>
                    <span class="text-xs text-slate-400 w-12 text-right flex-shrink-0">%</span>
                </div>
                ${pts}
            </div>
        </div>`;
    }).join('');

    openModal(a ? 'แก้ไขผลการประเมิน' : 'บันทึกผลการประเมิน', `
    <form id="sc-af" class="space-y-4">
        ${a ? `<input type="hidden" name="AssessmentID" value="${escHtml(a.AssessmentID)}">` : ''}
        <div class="grid grid-cols-3 gap-3">
            <div class="col-span-2"><label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่ประเมิน</label>
                <input name="AssessmentDate" type="date" required value="${a?.AssessmentDate ? String(a.AssessmentDate).substring(0,10) : today}" class="form-input w-full"></div>
            <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">สัปดาห์</label>
                <select name="WeekNo" class="form-input w-full">
                    <option value="">—</option>
                    ${[1,2,3,4].map(w => `<option value="${w}" ${a?.WeekNo == w ? 'selected' : ''}>W${w}</option>`).join('')}
                </select>
            </div>
        </div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">พื้นที่/แผนก</label>
            <input name="Area" type="text" value="${escHtml(a?.Area || 'ทั้งหมด')}" class="form-input w-full"></div>
        <div class="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
            หัวข้อที่ 6 (PPE Control) ไม่ต้องกรอกที่นี่ — คำนวณจาก PPE Inspection Checklist
        </div>
        <div class="space-y-3">${topicBlocks}</div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
            <textarea name="Notes" rows="2" class="form-textarea w-full resize-none">${escHtml(a?.Notes || '')}</textarea></div>
        <div id="sc-af-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-2xl');

    setTimeout(() => {
        const TKEYS = ['T1','T2','T3','T4','T5','T7'];

        // Restore saved per-topic areas on dropdowns (set selected after render)
        if (_scAreas.length > 0) {
            TKEYS.forEach(tk => {
                const sel = document.getElementById(`sc-area-${tk}`);
                const saved = savedTopicAreas[tk] || '';
                if (sel && saved) sel.value = saved;
            });
        }

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
                    scoreEl.className = `text-sm font-bold ${avg < 70 ? 'text-red-500' : avg < 90 ? 'text-amber-500' : 'text-emerald-600'}`;
                }
                if (hiddenEl) hiddenEl.value = avg;
            } else {
                if (scoreEl) { scoreEl.textContent = '—%'; scoreEl.className = 'text-sm font-bold text-slate-400'; }
                // Keep existing manual score if no points entered
            }
        }

        document.getElementById('sc-af')?.addEventListener('submit', async e => {
            e.preventDefault();
            const fd    = new FormData(e.target);
            const data  = Object.fromEntries(fd.entries());
            const errEl = document.getElementById('sc-af-err');

            // Collect points
            const points = [];
            TKEYS.forEach(tk => {
                [1,2,3].forEach(pn => {
                    const tot = parseInt(document.getElementById(`sc-tot-${tk}-${pn}`)?.value) || 0;
                    const cmp = parseInt(document.getElementById(`sc-cmp-${tk}-${pn}`)?.value) || 0;
                    if (tot > 0 || cmp > 0) {
                        points.push({ TopicKey: tk, PointNo: pn, TotalPeople: tot, ComplyPeople: cmp });
                    }
                });
            });
            data.points = JSON.stringify(points);

            // Collect per-topic areas
            const topicAreasObj = {};
            TKEYS.forEach(tk => {
                const el  = document.getElementById(`sc-area-${tk}`);
                const val = el?.value?.trim();
                if (val) topicAreasObj[tk] = val;
            });
            data.topicAreas = JSON.stringify(topicAreasObj);

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
            }
        });
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

    // Determine checklist items from selected work type or all items
    const itemsToShow = _ppeItems.length > 0
        ? _ppeItems
        : PPE_ITEMS.map(i => ({ ItemID: i.key, ItemName: i.label }));

    const deptOpts = _departments.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
    const wtOpts   = _ppeWorkTypes.map(w => `<option value="${escHtml(w.WorkTypeID)}" data-name="${escHtml(w.Name)}">${escHtml(w.Name)}</option>`).join('');

    const checklist = itemsToShow.map((item, idx) => `
    <div id="sc-prow-${escHtml(item.ItemID)}" class="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 border-b border-slate-100 gap-2">
        <div class="flex items-center gap-2 min-w-0">
            <span class="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 bg-emerald-100 text-emerald-700">${idx+1}</span>
            <span class="text-sm font-medium text-slate-700">${escHtml(item.ItemName)}</span>
        </div>
        <div class="flex gap-3 flex-shrink-0">
            <label class="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" name="ppe_${escHtml(item.ItemID)}" value="compliant" class="accent-emerald-500 sc-ppe-radio" onchange="window._scPPECalc()">
                <span class="text-emerald-600 font-medium">Compliant</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" name="ppe_${escHtml(item.ItemID)}" value="non-compliant" class="accent-red-500 sc-ppe-radio" onchange="window._scPPECalc()">
                <span class="text-red-500 font-medium">Non-Compliant</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" name="ppe_${escHtml(item.ItemID)}" value="na" checked class="accent-slate-400 sc-ppe-radio" onchange="window._scPPECalc()">
                <span class="text-slate-400">N/A</span>
            </label>
        </div>
    </div>`).join('');

    openModal('บันทึกผล PPE Inspection', `
    <form id="sc-ppef" class="space-y-5">
        <div class="rounded-xl border border-slate-100 p-4 space-y-3 bg-slate-50/50">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wide">ข้อมูลพื้นฐาน</p>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">วันที่ตรวจ</label>
                    <input name="InspectionDate" type="date" required value="${today}" class="form-input w-full"></div>
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">Area/พื้นที่</label>
                    <input name="Area" type="text" placeholder="เช่น Production Zone A" class="form-input w-full"></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">แผนก <span class="text-red-500">*</span></label>
                    ${_departments.length > 0
                        ? `<select name="Department" required class="form-input w-full"><option value="">— เลือกแผนก —</option>${deptOpts}</select>`
                        : `<input name="Department" type="text" required placeholder="ชื่อแผนก" class="form-input w-full">`}
                </div>
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">ประเภทงาน</label>
                    <select id="sc-ppef-wt" name="WorkTypeID" class="form-input w-full">
                        <option value="">— เลือกประเภทงาน (ถ้ามี) —</option>
                        ${wtOpts}
                    </select>
                </div>
            </div>
        </div>

        <div class="rounded-xl border border-slate-100 p-4 space-y-3 bg-slate-50/50">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wide">พนักงานที่ถูกตรวจ</p>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">รหัส/ชื่อพนักงาน</label>
                    <div class="relative">
                        <input id="sc-ppef-emp-q" type="text" placeholder="พิมพ์เพื่อค้นหา..."
                            class="form-input w-full" autocomplete="off"
                            oninput="window._scPPEEmpSearch(this.value)">
                        <div id="sc-ppef-emp-dd" class="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg hidden max-h-48 overflow-y-auto top-full mt-1"></div>
                    </div>
                    <input type="hidden" id="sc-ppef-emp-id" name="InspectedEmployeeID">
                    <input type="hidden" id="sc-ppef-emp-name" name="InspectedEmployeeName">
                </div>
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">หรือระบุชื่อด้วยตนเอง</label>
                    <input id="sc-ppef-emp-manual" name="InspectedManual" type="text" placeholder="ชื่อพนักงาน (กรณีไม่มีในระบบ)" class="form-input w-full"></div>
            </div>
        </div>

        <div class="rounded-xl border border-slate-100 p-4 space-y-3 bg-slate-50/50">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wide">ผู้ตรวจ (เว้นว่าง = ใช้บัญชีปัจจุบัน)</p>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">รหัส/ชื่อผู้ตรวจ</label>
                    <div class="relative">
                        <input id="sc-ppef-insp-q" type="text" placeholder="พิมพ์เพื่อค้นหา..."
                            class="form-input w-full" autocomplete="off"
                            oninput="window._scPPEInspSearch(this.value)">
                        <div id="sc-ppef-insp-dd" class="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg hidden max-h-48 overflow-y-auto top-full mt-1"></div>
                    </div>
                    <input type="hidden" id="sc-ppef-insp-id" name="InspectorID">
                    <input type="hidden" id="sc-ppef-insp-name" name="InspectorName">
                </div>
                <div><label class="block text-sm font-semibold text-slate-700 mb-1">หมายเหตุ</label>
                    <textarea name="Notes" rows="2" class="form-textarea w-full resize-none" placeholder="หมายเหตุ..."></textarea></div>
            </div>
        </div>

        <div class="rounded-xl border border-slate-200 overflow-hidden">
            <div class="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <p class="text-xs font-bold text-slate-600 uppercase tracking-wide">PPE Checklist (${itemsToShow.length} รายการ)</p>
                <div id="sc-ppef-result" class="text-xs font-semibold text-slate-400">ยังไม่มีการเลือก</div>
            </div>
            <div class="px-4 divide-y divide-slate-100">${checklist}</div>
        </div>

        <div id="sc-ppef-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="sc-ppef-submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-2xl');

    setTimeout(() => {
        window._scPPECalc = () => {
            const radios = document.querySelectorAll('.sc-ppe-radio');
            let compliant = 0, nonCompliant = 0, total = 0;
            const names = {};
            radios.forEach(r => {
                if (!names[r.name]) { names[r.name] = true; total++; }
                if (r.checked && r.value === 'compliant')     compliant++;
                if (r.checked && r.value === 'non-compliant') nonCompliant++;
            });
            const checked = compliant + nonCompliant;
            const res = document.getElementById('sc-ppef-result');
            if (res) {
                const isPass = checked > 0 && nonCompliant === 0;
                res.textContent = checked > 0
                    ? `${compliant}/${checked} รายการ — ${isPass ? 'ผ่าน' : 'ไม่ผ่าน'}`
                    : 'ยังไม่มีการเลือก';
                res.className = `text-xs font-semibold ${isPass ? 'text-emerald-600' : checked > 0 ? 'text-red-600' : 'text-slate-400'}`;
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
                const res = await API.get(`/accident/employees?q=${encodeURIComponent(q)}`);
                const list = res?.employees || [];
                dd.innerHTML = list.length
                    ? list.map(e => `<div class="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer" onclick="window._scPPEEmpSelect('${escHtml(e.EmployeeID)}','${escHtml(e.Name||e.EmployeeName||'')}')"><span class="font-medium">${escHtml(e.Name||e.EmployeeName||'')}</span> <span class="text-slate-400 text-xs">${escHtml(e.EmployeeID)} · ${escHtml(e.Department||'')}</span></div>`).join('')
                    : '<div class="px-3 py-2 text-sm text-slate-400">ไม่พบพนักงาน</div>';
                dd.classList.remove('hidden');
            } catch { dd.classList.add('hidden'); }
        };

        window._scPPEEmpSelect = (id, name) => {
            document.getElementById('sc-ppef-emp-id').value   = id;
            document.getElementById('sc-ppef-emp-name').value = name;
            document.getElementById('sc-ppef-emp-q').value    = `${name} (${id})`;
            document.getElementById('sc-ppef-emp-dd').classList.add('hidden');
        };

        window._scPPEInspSearch = async (q) => {
            const dd = document.getElementById('sc-ppef-insp-dd');
            if (!dd) return;
            if (!q || q.length < 2) { dd.classList.add('hidden'); return; }
            try {
                const res = await API.get(`/accident/employees?q=${encodeURIComponent(q)}`);
                const list = res?.employees || [];
                dd.innerHTML = list.length
                    ? list.map(e => `<div class="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer" onclick="window._scPPEInspSelect('${escHtml(e.EmployeeID)}','${escHtml(e.Name||e.EmployeeName||'')}')"><span class="font-medium">${escHtml(e.Name||e.EmployeeName||'')}</span> <span class="text-slate-400 text-xs">${escHtml(e.EmployeeID)}</span></div>`).join('')
                    : '<div class="px-3 py-2 text-sm text-slate-400">ไม่พบพนักงาน</div>';
                dd.classList.remove('hidden');
            } catch { dd.classList.add('hidden'); }
        };

        window._scPPEInspSelect = (id, name) => {
            document.getElementById('sc-ppef-insp-id').value   = id;
            document.getElementById('sc-ppef-insp-name').value = name;
            document.getElementById('sc-ppef-insp-q').value    = `${name} (${id})`;
            document.getElementById('sc-ppef-insp-dd').classList.add('hidden');
        };

        document.getElementById('sc-ppef')?.addEventListener('submit', async e => {
            e.preventDefault();
            const fd    = new FormData(e.target);
            const errEl = document.getElementById('sc-ppef-err');
            try {
                const wtSel  = document.getElementById('sc-ppef-wt');
                const wtName = wtSel?.options[wtSel.selectedIndex]?.dataset?.name || '';
                const empName = fd.get('InspectedEmployeeName') || fd.get('InspectedManual') || '';

                // Client-side: require at least one item with a Compliant/Non-Compliant status
                const itemsToUse2 = _ppeItems.length > 0 ? _ppeItems : PPE_ITEMS.map(i => ({ ItemID: i.key }));
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
                const itemsToUse = _ppeItems.length > 0 ? _ppeItems : PPE_ITEMS.map(i => ({ ItemID: i.key }));
                const items = itemsToUse.map(item => ({
                    ItemID: item.ItemID,
                    Status: fd.get(`ppe_${item.ItemID}`) || '',
                }));
                payload.items = JSON.stringify(items);

                const result = await API.post('/safety-culture/ppe-inspections', payload);

                // Show warning if auto-violation logging failed on the backend
                if (result?.violationResult?.error) {
                    showToast(`เกิดข้อผิดพลาดในการบันทึกการฝ่าฝืน: ${result.violationResult.error}`, 'warning');
                }

                closeModal();
                showToast('บันทึกผล PPE Inspection สำเร็จ', 'success');
                await _loadHeroStats();
            } catch (err) {
                errEl.textContent = escHtml(err.message || 'เกิดข้อผิดพลาด');
                errEl.classList.remove('hidden');
            }
        });
    }, 50);
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
        if (s === 'compliant')     return '<span class="text-sm font-semibold text-emerald-600">Compliant</span>';
        if (s === 'non-compliant') return '<span class="text-sm font-semibold text-red-500">Non-Compliant</span>';
        return '<span class="text-sm text-slate-400">N/A</span>';
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
    openModal('รายละเอียด PPE Inspection', `
    <div class="space-y-4">
        <div class="flex items-center justify-between">
            <div class="text-sm text-slate-500">ผลการตรวจ</div>
            ${passBadge}
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm bg-slate-50 rounded-xl p-4">
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
    <label class="flex items-center gap-2 py-1.5 cursor-pointer">
        <input type="checkbox" name="item_${escHtml(item.ItemID)}" value="${escHtml(item.ItemID)}" ${selectedItemIds.has(item.ItemID)?'checked':''}
            class="accent-emerald-500 w-4 h-4">
        <span class="text-sm text-slate-700">${escHtml(item.ItemName)}</span>
    </label>`).join('');

    openModal(wt ? 'แก้ไขประเภทงาน' : 'เพิ่มประเภทงาน', `
    <form id="sc-wtf" class="space-y-4">
        ${wt ? `<input type="hidden" name="WorkTypeID" value="${escHtml(wt.WorkTypeID)}">` : ''}
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อประเภทงาน <span class="text-red-500">*</span></label>
            <input name="Name" type="text" required value="${escHtml(wt?.Name||'')}" placeholder="เช่น งานเชื่อม, งานบรรจุ..." class="form-input w-full"></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">คำอธิบาย</label>
            <input name="Description" type="text" value="${escHtml(wt?.Description||'')}" class="form-input w-full"></div>
        ${_ppeItems.length ? `
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-2">PPE ที่ต้องใช้</label>
            <div class="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-0.5 max-h-48 overflow-y-auto">
                ${itemCheckboxes}
            </div>
        </div>` : ''}
        <div id="sc-wtf-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-md');

    setTimeout(() => {
        document.getElementById('sc-wtf')?.addEventListener('submit', async e => {
            e.preventDefault();
            const fd    = new FormData(e.target);
            const errEl = document.getElementById('sc-wtf-err');
            try {
                const itemIds = _ppeItems.filter(item => fd.get(`item_${item.ItemID}`)).map(item => item.ItemID);
                const payload = {
                    Name:        fd.get('Name')        || '',
                    Description: fd.get('Description') || '',
                    itemIds:     JSON.stringify(itemIds),
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
        });
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
            <table class="w-full text-sm">
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
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อรายการ PPE</label>
            <input name="ItemName" type="text" required value="${escHtml(item?.ItemName || '')}" placeholder="เช่น Safety Helmet, Gloves, ..." class="form-input w-full"></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">ลำดับ (SortOrder)</label>
            <input name="SortOrder" type="number" min="1" value="${item?.SortOrder ?? (_ppeItems.length + 1)}" class="form-input w-full"></div>
        <div id="sc-pif-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-sm');

    setTimeout(() => {
        document.getElementById('sc-pif')?.addEventListener('submit', async e => {
            e.preventDefault();
            const data  = Object.fromEntries(new FormData(e.target).entries());
            const errEl = document.getElementById('sc-pif-err');
            try {
                if (data.ItemID) {
                    await API.put(`/safety-culture/ppe-items/${data.ItemID}`, data);
                } else {
                    await API.post('/safety-culture/ppe-items', data);
                }
                closeModal();
                showToast('บันทึกรายการ PPE สำเร็จ', 'success');
                await _loadHeroStats();
            } catch (err) {
                errEl.textContent = escHtml(err.message || 'เกิดข้อผิดพลาด');
                errEl.classList.remove('hidden');
            }
        });
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
        const itemBreakdown = _dashData?.ppeStats?.itemBreakdown || [];
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
        `<div style="background:linear-gradient(135deg,#064e3b 0%,#065f46 60%,#0d9488 100%);` +
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
        `<span>รายงานวัฒนธรรมความปลอดภัย · Thai Summit Harness Co., Ltd.</span>` +
        `<span>หน้า ${n} จาก ${total} | สร้างเมื่อ ${genDate}</span></div>`;

    const sectionTitle = (text, accent) =>
        `<div style="font-size:13px;font-weight:600;color:#1e293b;border-bottom:2px solid ${accent||'#059669'};` +
        `padding-bottom:5px;margin-bottom:0;">${text}</div>`;

    const thHead = (...cols) =>
        `<thead><tr style="background:#f1f5f9;">${cols.map(([txt, align, w]) =>
            `<th style="padding:6px 10px;text-align:${align||'left'};font-size:11px;color:#64748b;font-weight:600;` +
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
        <div style="background:linear-gradient(135deg,#064e3b 0%,#065f46 60%,#0d9488 100%);
                    padding:28px 28px 22px;flex-shrink:0;position:relative;overflow:hidden;">
            <div style="position:absolute;inset:0;opacity:0.07;">
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
                    `<td style="padding:7px 10px;font-size:12px;color:#1e293b;">${it.name}</td>` +
                    `<td style="padding:7px 10px;font-size:12px;text-align:center;color:#1e293b;">${it.ok}</td>` +
                    `<td style="padding:7px 10px;font-size:12px;text-align:center;color:#1e293b;">${it.total}</td>` +
                    `<td style="padding:7px 10px;font-weight:700;color:${clr};text-align:right;">${pct != null ? pct.toFixed(1)+'%' : 'N/A'}</td>` +
                    `<td style="padding:7px 14px 7px 4px;width:130px;"><div style="display:flex;align-items:center;">${pct != null ? scoreBar(pct, clr) : ''}</div></td></tr>`;
            }).join('');
        }
        return (_dashData?.ppeStats?.itemBreakdown || []).map((item, i) => {
            const pct = item.total_count > 0 ? (item.ok_count / item.total_count) * 100 : null;
            const clr = scoreClr(pct); const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
            return `<tr style="background:${bg};">` +
                `<td style="padding:7px 10px;font-size:12px;color:#1e293b;">${item.ItemName||'—'}</td>` +
                `<td style="padding:7px 10px;font-size:12px;text-align:center;color:#1e293b;">${item.ok_count}</td>` +
                `<td style="padding:7px 10px;font-size:12px;text-align:center;color:#1e293b;">${item.total_count}</td>` +
                `<td style="padding:7px 10px;font-weight:700;color:${clr};text-align:right;">${pct != null ? pct.toFixed(1)+'%' : 'N/A'}</td>` +
                `<td style="padding:7px 14px 7px 4px;width:130px;"><div style="display:flex;align-items:center;">${pct != null ? scoreBar(pct, clr) : ''}</div></td></tr>`;
        }).join('');
    })();

    const deptTbody = deptRows.map((r, i) => {
        const clr = scoreClr(r.pct); const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
        return `<tr style="background:${bg};">` +
            `<td style="padding:6px 10px;font-size:12px;color:#1e293b;">${r.dept}</td>` +
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
            `<td style="padding:6px 6px;font-size:11px;color:#1e293b;">${(v.EmployeeName||'—').slice(0,20)}</td>` +
            `<td style="padding:6px 6px;font-size:11px;color:#64748b;">${(v.Department||'—').slice(0,18)}</td>` +
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
