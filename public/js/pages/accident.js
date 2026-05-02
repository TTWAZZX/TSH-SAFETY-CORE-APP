// public/js/pages/accident.js
// Accident Report — enterprise pattern (buildShell + switchTab)
import { API } from '../api.js';
import { openModal, openDetailModal, closeModal, showToast, showConfirmationModal } from '../ui.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const ACCIDENT_TYPES = ['Near Miss', 'First Aid', 'Medical Treatment', 'Lost Time', 'Fatal'];
const SEVERITIES     = ['Minor', 'Moderate', 'Serious', 'Critical'];
const ROOT_CAUSES    = [
    'พฤติกรรมไม่ปลอดภัย (Unsafe Act)',
    'สภาพแวดล้อมไม่ปลอดภัย (Unsafe Condition)',
    'ไม่ใช้อุปกรณ์ PPE',
    'ขาดการฝึกอบรม',
    'ความเหนื่อยล้า / ความประมาท',
    'ความบกพร่องของเครื่องจักร',
    'การจัดการไม่เหมาะสม',
    'อื่นๆ',
];
const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

const INJURY_TYPES = [
    'การตัด / บาด / ถลอก',
    'ฟกช้ำ / ฟกช้ำดำเขียว',
    'กระดูกหัก / เคลื่อน',
    'ไหม้ / ลวก',
    'ไฟฟ้าดูด',
    'ขาหัก / บาดเจ็บจากการหกล้ม',
    'สูดดมสารพิษ',
    'ตาได้รับบาดเจ็บ',
    'บาดเจ็บจากเครื่องจักร',
    'อื่นๆ',
];
const BODY_PARTS = [
    'ศีรษะ / หน้าผาก', 'ตา / ใบหน้า', 'คอ / บ่า', 'หน้าอก / ซี่โครง',
    'หลัง / เอว', 'แขน / ข้อศอก', 'มือ / นิ้วมือ', 'ขา / เข่า', 'เท้า / นิ้วเท้า',
    'ทั่วร่างกาย', 'อื่นๆ',
];
const EMPLOYMENT_TYPES = ['พนักงานประจำ', 'พนักงานชั่วคราว', 'พนักงานรับเหมา', 'นักศึกษาฝึกงาน'];

const TYPE_COLOR = {
    'Near Miss':         { bg: 'bg-amber-100',  text: 'text-amber-700'  },
    'First Aid':         { bg: 'bg-blue-100',   text: 'text-blue-700'   },
    'Medical Treatment': { bg: 'bg-orange-100', text: 'text-orange-700' },
    'Lost Time':         { bg: 'bg-red-100',    text: 'text-red-700'    },
    'Fatal':             { bg: 'bg-slate-800',  text: 'text-white'      },
};
const SEV_COLOR = {
    'Minor':    { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    'Moderate': { bg: 'bg-amber-100',   text: 'text-amber-700'   },
    'Serious':  { bg: 'bg-orange-100',  text: 'text-orange-700'  },
    'Critical': { bg: 'bg-red-100',     text: 'text-red-700'     },
    'Fatal':    { bg: 'bg-red-900',     text: 'text-white'       },
};

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _isAdmin        = false;
let _activeTab      = 'dashboard';
let _statsYear      = new Date().getFullYear();
let _summary        = null;
let _analytics      = null;
let _reports        = [];
let _allDepts       = [];
let _filter         = { dept: '', type: '', status: '', year: new Date().getFullYear() };
let _listenersReady = false;
let _trendChart     = null;
let _deptChart      = null;
let _accEmpTimer    = null;
let _pendingFiles   = [];   // File objects staged before submit
let _perfData       = null; // cached Safety Performance record

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadAccidentPage() {
    const container = document.getElementById('accident-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _isAdmin = user.role === 'Admin' || user.Role === 'Admin';

    window.closeModal = closeModal;

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    _activeTab = window._getTab?.('accident', _activeTab) || _activeTab;
    switchTab(_activeTab);
    _loadHeroStats();
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB CONFIG
// ─────────────────────────────────────────────────────────────────────────────
function _getTabs() {
    return [
        { id: 'dashboard', label: 'ภาพรวม',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
        { id: 'analytics', label: 'วิเคราะห์',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/>` },
        { id: 'reports', label: 'รายงานทั้งหมด',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` },
        { id: 'performance', label: 'Safety KPI Board',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>` },
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);

    const tabHtml = _getTabs().map(t => `
        <button id="acc-tab-btn-${t.id}" data-tab="${t.id}"
            class="acc-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="acc-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#acc-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                </svg>
                                Accident Report
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">รายงานอุบัติเหตุ &amp; Safety Analytics</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Accident Report · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-shrink-0 w-full md:w-auto">
                        <!-- Stats strip -->
                        <div id="acc-stats-strip" class="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full sm:w-auto">
                            ${['—','—','—','—'].map((v, i) => {
                                const labels = ['วันปลอดอุบัติ','รวมทั้งหมด','Recordable','Near Miss'];
                                return `<div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
                                    <p class="text-2xl font-bold text-white acc-stat-val" data-idx="${i}">${v}</p>
                                    <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${labels[i]}</p>
                                </div>`;
                            }).join('')}
                        </div>
                        <!-- Actions -->
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <select id="acc-year-sel" class="rounded-xl px-3 py-2 text-xs font-semibold text-white border border-white/30 bg-white/15 outline-none">
                                ${years.map(y => `<option value="${y}" ${y===_statsYear?'selected':''} class="text-slate-800 bg-white">${y}</option>`).join('')}
                            </select>
                            ${_isAdmin ? `
                            <button id="acc-btn-add" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white border border-white/30 bg-white/15 hover:bg-white/25 transition-all whitespace-nowrap">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                บันทึกอุบัติเหตุ
                            </button>` : ''}
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
        <div id="acc-panel-dashboard"   class="hidden"></div>
        <div id="acc-panel-analytics"   class="hidden"></div>
        <div id="acc-panel-reports"     class="hidden"></div>
        <div id="acc-panel-performance" class="hidden"></div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS (once)
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', e => {
        const tabBtn = e.target.closest('.acc-tab');
        if (tabBtn?.dataset?.tab) { switchTab(tabBtn.dataset.tab); return; }

        if (e.target.closest('#acc-btn-add')) { openAccidentForm(null); return; }

        if (!e.target.closest('#acc-emp-dropdown') && !e.target.closest('#acc-emp-search')) {
            document.getElementById('acc-emp-dropdown')?.classList.add('hidden');
        }
    });

    document.addEventListener('change', e => {
        if (e.target?.id === 'acc-year-sel') {
            _statsYear = parseInt(e.target.value) || new Date().getFullYear();
            _filter.year = _statsYear;
            // Clear caches so panels always fetch fresh data for the new year
            _summary   = null;
            _analytics = null;
            _perfData  = null;
            _loadHeroStats();
            if (_activeTab === 'dashboard')   _renderDashboardPanel();
            else if (_activeTab === 'analytics')   _renderAnalyticsPanel();
            else if (_activeTab === 'performance') _renderPerformancePanel();
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SWITCH TAB
// ─────────────────────────────────────────────────────────────────────────────
function switchTab(tab) {
    _activeTab = tab;
    window._saveTab?.('accident', tab);

    _getTabs().forEach(t => {
        const btn = document.getElementById(`acc-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === tab
            ? 'acc-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white'
            : 'acc-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';
    });

    ['dashboard','analytics','reports','performance'].forEach(id => {
        document.getElementById(`acc-panel-${id}`)?.classList.add('hidden');
    });
    document.getElementById(`acc-panel-${tab}`)?.classList.remove('hidden');

    if (tab === 'dashboard')   _renderDashboardPanel();
    if (tab === 'analytics')   _renderAnalyticsPanel();
    if (tab === 'reports')     _renderReportsPanel();
    if (tab === 'performance') _renderPerformancePanel();
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO STATS (async)
// ─────────────────────────────────────────────────────────────────────────────
async function _loadHeroStats() {
    try {
        const res = await API.get(`/accident/summary?year=${_statsYear}`);
        _summary  = res.data || null;
        const kpi = _summary?.kpi || {};
        const ds  = _summary?.daysSince;
        const vals = [
            ds !== null ? ds : '—',
            kpi.total      ?? '—',
            kpi.recordable ?? '—',
            kpi.nearMiss   ?? '—',
        ];
        document.querySelectorAll('.acc-stat-val').forEach(el => {
            const i = parseInt(el.dataset.idx);
            if (vals[i] !== undefined) el.textContent = vals[i];
        });
    } catch { _summary = null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA FETCHERS
// ─────────────────────────────────────────────────────────────────────────────
async function _fetchDepts() {
    if (_allDepts.length) return;          // already loaded — skip
    try {
        const res = await API.get('/master/departments');
        const raw = res?.data ?? res;
        const list = (Array.isArray(raw) ? raw : [])
            .map(d => d.Name || d.name || '')
            .filter(Boolean);
        // Only cache when master actually returned data; otherwise leave empty
        // so the next call retries (avoids permanent empty-cache on transient error)
        if (list.length) _allDepts = [...new Set(list)].sort();
    } catch { /* leave _allDepts = [] so next call retries */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD PANEL
// ─────────────────────────────────────────────────────────────────────────────
async function _renderDashboardPanel() {
    const panel = document.getElementById('acc-panel-dashboard');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    if (!_summary) {
        try {
            const res = await API.get(`/accident/summary?year=${_statsYear}`);
            _summary  = res.data || null;
        } catch { _summary = null; }
    }

    const kpi       = _summary?.kpi      || {};
    const byType    = _summary?.byType   || [];
    const byDept    = _summary?.byDept   || [];
    const daysSince = _summary?.daysSince ?? null;

    const total      = parseInt(kpi.total)      || 0;
    const recordable = parseInt(kpi.recordable) || 0;
    const lostDays   = parseInt(kpi.lostDays)   || 0;
    const nearMiss   = parseInt(kpi.nearMiss)   || 0;
    const fatal      = parseInt(kpi.fatal)      || 0;

    const safeColor = daysSince === 0
        ? 'border-red-300'
        : daysSince !== null && daysSince < 30
            ? 'border-amber-200' : 'border-emerald-200';
    const safeText = daysSince === 0
        ? 'text-red-600'
        : daysSince !== null && daysSince < 30
            ? 'text-amber-600' : 'text-emerald-600';

    const kpiCards = [
        {
            label: 'รวมทั้งหมด', val: total, sub: 'รายการทั้งหมด',
            iclr: 'bg-slate-100', itext: 'text-slate-600',
            vclr: 'text-slate-800',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>',
        },
        {
            label: 'Recordable', val: recordable, sub: 'ต้องบันทึก (OSHA)',
            iclr: 'bg-orange-50', itext: 'text-orange-600',
            vclr: 'text-orange-600',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>',
        },
        {
            label: 'Lost Time Days', val: lostDays, sub: 'วันหยุดงานสะสม',
            iclr: 'bg-red-50', itext: 'text-red-600',
            vclr: 'text-red-600',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>',
        },
        {
            label: 'Near Miss', val: nearMiss, sub: 'เกือบเกิดเหตุ',
            iclr: 'bg-amber-50', itext: 'text-amber-600',
            vclr: 'text-amber-600',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>',
        },
        {
            label: 'Fatal', val: fatal, sub: 'อุบัติเหตุถึงชีวิต',
            iclr: fatal > 0 ? 'bg-red-100' : 'bg-slate-100',
            itext: fatal > 0 ? 'text-red-700' : 'text-slate-400',
            vclr: fatal > 0 ? 'text-red-700 font-black' : 'text-slate-400',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>',
        },
    ];

    panel.innerHTML = `
    <div class="space-y-6">

        <!-- KPI Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <!-- Days safe spotlight -->
            <div class="col-span-2 lg:col-span-1 bg-white rounded-xl p-5 border shadow-sm flex flex-col items-center justify-center text-center ${safeColor}"
                 style="box-shadow:0 4px 16px rgba(220,38,38,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <p class="text-xs font-semibold uppercase tracking-wide mb-1 ${safeText}">วันปลอดอุบัติเหตุ</p>
                <p class="text-4xl font-black ${safeText}">${daysSince !== null ? daysSince : '—'}</p>
                <p class="text-xs text-slate-400 mt-1">วัน (Recordable)</p>
            </div>
            <!-- Icon-style metric cards -->
            ${kpiCards.map(c => `
            <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${c.iclr}">
                        <svg class="w-4 h-4 ${c.itext}" fill="none" viewBox="0 0 24 24" stroke="currentColor">${c.icon}</svg>
                    </div>
                    <p class="text-xs text-slate-500 font-medium">${c.label}</p>
                </div>
                <p class="text-3xl font-bold ${c.vclr}">${c.val}</p>
                <p class="text-xs text-slate-400 mt-1">${c.sub}</p>
            </div>`).join('')}
        </div>

        <!-- Trend Chart + Type Breakdown -->
        <div class="grid lg:grid-cols-3 gap-6">

            <!-- Trend Chart -->
            <div class="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
                 style="box-shadow:0 4px 16px rgba(220,38,38,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#dc2626,#f97316)"></div>
                <div class="p-5">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                            </svg>
                            <h3 class="text-sm font-bold text-slate-700">แนวโน้มอุบัติเหตุ (Safety Trend)</h3>
                        </div>
                        <span class="text-xs text-slate-400">ปี ${_statsYear}</span>
                    </div>
                    <div style="height:220px"><canvas id="acc-trend-chart"></canvas></div>
                </div>
            </div>

            <!-- Type Breakdown -->
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
                 style="box-shadow:0 4px 16px rgba(220,38,38,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#f97316,#eab308)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">ประเภทอุบัติเหตุ</h3>
                    </div>
                    ${byType.length === 0
                        ? `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>`
                        : `<div class="space-y-2.5">
                            ${byType.map(t => {
                                const pct = total ? Math.round(parseInt(t.cnt) * 100 / total) : 0;
                                const col = TYPE_COLOR[t.AccidentType] || { bg: 'bg-slate-100' };
                                return `
                                <div>
                                    <div class="flex items-center justify-between mb-1 text-xs">
                                        <span class="font-medium text-slate-700">${t.AccidentType}</span>
                                        <span class="font-semibold text-slate-600">${t.cnt} (${pct}%)</span>
                                    </div>
                                    <div class="w-full bg-slate-100 rounded-full h-2">
                                        <div class="h-2 rounded-full ${col.bg}" style="width:${pct}%"></div>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>`}
                    ${fatal > 0 ? `
                    <div class="mt-4 rounded-xl bg-slate-900 text-white p-3 text-xs font-semibold flex items-center gap-2">
                        <svg class="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        อุบัติเหตุถึงชีวิต: ${fatal} ราย
                    </div>` : ''}
                </div>
            </div>
        </div>

        <!-- Department Breakdown Chart -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
             style="box-shadow:0 4px 16px rgba(220,38,38,0.08),0 1px 4px rgba(0,0,0,0.06)">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#dc2626,#9f1239)"></div>
            <div class="p-5">
                <div class="flex items-center gap-2 mb-4">
                    <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">อุบัติเหตุรายแผนก (${_statsYear})</h3>
                </div>
                ${byDept.length === 0
                    ? `<div class="text-center py-12 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูล</p></div>`
                    : `<div style="height:${Math.max(180, byDept.length * 36)}px"><canvas id="acc-dept-chart"></canvas></div>`}
            </div>
        </div>

    </div>`;

    setTimeout(() => { _drawTrendChart(); _drawDeptChart(byDept); }, 0);
}

function _drawTrendChart() {
    const canvas = document.getElementById('acc-trend-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_trendChart) { _trendChart.destroy(); _trendChart = null; }

    const trend = _summary?.trend || [];
    if (trend.length === 0) {
        canvas.parentElement.innerHTML = `<p class="flex items-center justify-center h-full text-slate-400 text-sm">ยังไม่มีข้อมูล</p>`;
        return;
    }

    const labels = trend.map(t => t.period || MONTHS_TH[(parseInt(t.mo) - 1)] || t.mo);
    const totals = trend.map(t => parseInt(t.total)      || 0);
    const recs   = trend.map(t => parseInt(t.recordable) || 0);

    _trendChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'รวม',        data: totals, backgroundColor: 'rgba(220,38,38,0.2)', borderColor: '#dc2626', borderWidth: 2, borderRadius: 4, order: 2 },
                { label: 'Recordable', data: recs,   type: 'line', borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#f97316', tension: 0.3, fill: true, order: 1 },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true } } },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
            },
        },
    });
}

function _drawDeptChart(byDept) {
    const canvas = document.getElementById('acc-dept-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_deptChart) { _deptChart.destroy(); _deptChart = null; }
    if (!byDept || byDept.length === 0) return;

    const sorted    = [...byDept].sort((a, b) => parseInt(a.total) - parseInt(b.total));
    // Full names stored separately for tooltip; axis labels truncated for display
    const fullNames = sorted.map(d => d.Department);
    const labels    = sorted.map(d => d.Department.length > 22 ? d.Department.slice(0, 21) + '…' : d.Department);
    const totals    = sorted.map(d => parseInt(d.total)      || 0);
    const recs      = sorted.map(d => Math.min(parseInt(d.recordable) || 0, parseInt(d.total) || 0)); // cap at total
    const nonRecs   = totals.map((t, i) => Math.max(0, t - recs[i]));   // non-recordable = total − recordable

    // Stacked bars: non-recordable (green) + recordable (orange) → full bar = total
    // This makes it visually impossible for recordable to exceed total
    _deptChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Minor / Near Miss',
                    data: nonRecs,
                    backgroundColor: 'rgba(5,150,105,0.6)',
                    borderColor: '#059669',
                    borderWidth: 1,
                    borderRadius: 0,
                    borderSkipped: false,
                    stack: 'a',
                },
                {
                    label: 'Recordable',
                    data: recs,
                    backgroundColor: 'rgba(249,115,22,0.75)',
                    borderColor: '#f97316',
                    borderWidth: 1,
                    borderRadius: 3,
                    borderSkipped: false,
                    stack: 'a',
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } },
                tooltip: {
                    callbacks: {
                        title: ctx => fullNames[ctx[0].dataIndex] || labels[ctx[0].dataIndex],
                        footer: ctx => {
                            const idx = ctx[0].dataIndex;
                            return `รวม: ${totals[idx]}`;
                        },
                    },
                },
            },
            scales: {
                x: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
                y: { stacked: true, grid: { display: false }, ticks: {
                    font: { size: 10 },
                    callback: function(val) {
                        const name = this.getLabelForValue(val);
                        return name.length > 22 ? name.slice(0, 21) + '…' : name;
                    },
                }},
            },
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS PANEL
// ─────────────────────────────────────────────────────────────────────────────
async function _renderAnalyticsPanel() {
    const panel = document.getElementById('acc-panel-analytics');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    try {
        const res  = await API.get(`/accident/analytics?year=${_statsYear}`);
        _analytics = res.data || null;
    } catch { _analytics = null; }

    const deptRank  = _analytics?.deptRank  || [];
    const hotspot   = _analytics?.hotspot   || [];
    const rootCauses = _analytics?.rootCauses || [];
    const maxHot    = parseInt(hotspot[0]?.cnt)   || 1;
    const maxRoot   = parseInt(rootCauses[0]?.cnt) || 1;

    const riskBadge = score => {
        if (score >= 10) return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700"><span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>High</span>`;
        if (score >= 5)  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700"><span class="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block"></span>Med</span>`;
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>Low</span>`;
    };

    panel.innerHTML = `
    <div class="space-y-6">

        <!-- Department Risk Ranking -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
             style="box-shadow:0 4px 16px rgba(220,38,38,0.08),0 1px 4px rgba(0,0,0,0.06)">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#dc2626,#7c3aed)"></div>
            <div class="p-5">
                <div class="flex items-center gap-2 mb-1">
                    <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">Department Risk Ranking</h3>
                </div>
                <p class="text-xs text-slate-400 mb-4 ml-6">คะแนนความเสี่ยง = Recordable×3 + LostDays×2 + รวม</p>
                ${deptRank.length === 0
                    ? `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>`
                    : `<div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr class="bg-slate-50 border-b-2 border-slate-200">
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">รวม</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-orange-500 uppercase tracking-wide text-center">Recordable</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-red-500 uppercase tracking-wide text-center">Lost Days</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-amber-500 uppercase tracking-wide text-center">Near Miss</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">ความเสี่ยง</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${deptRank.map((d, i) => {
                                    const score  = parseInt(d.recordable)*3 + parseInt(d.lostDays)*2 + parseInt(d.total);
                                    const isTop  = i === 0;
                                    return `
                                    <tr class="hover:bg-slate-50 transition-colors" style="${isTop?'background:rgba(254,242,242,0.5)':''}">
                                        <td class="px-3 py-3 font-bold ${isTop?'text-red-600':'text-slate-400'}">${i+1}</td>
                                        <td class="px-3 py-3 font-semibold text-slate-800">
                                            ${d.Department || '—'}
                                            ${d.fatal>0 ? `<span class="ml-1 text-xs text-white bg-slate-800 rounded px-1">Fatal</span>` : ''}
                                        </td>
                                        <td class="px-3 py-3 text-center font-bold text-slate-700">${d.total}</td>
                                        <td class="px-3 py-3 text-center text-orange-600 font-semibold">${d.recordable||0}</td>
                                        <td class="px-3 py-3 text-center text-red-600 font-semibold">${d.lostDays||0}</td>
                                        <td class="px-3 py-3 text-center text-amber-600">${d.nearMiss||0}</td>
                                        <td class="px-3 py-3 text-center">${riskBadge(score)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>`}
            </div>
        </div>

        <!-- Hotspot + Root Cause -->
        <div class="grid lg:grid-cols-2 gap-6">

            <!-- Accident Hotspot -->
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
                 style="box-shadow:0 4px 16px rgba(249,115,22,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#f97316,#eab308)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">Accident Hotspot</h3>
                        <span class="text-xs text-slate-400">(บริเวณที่เกิดบ่อย)</span>
                    </div>
                    ${hotspot.length === 0
                        ? `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>`
                        : `<div class="space-y-3">
                            ${hotspot.map((h, i) => {
                                const pct    = Math.round(parseInt(h.cnt) * 100 / maxHot);
                                const colors = ['bg-red-500','bg-orange-500','bg-amber-500','bg-yellow-400'];
                                const color  = colors[Math.min(i, colors.length - 1)];
                                return `
                                <div>
                                    <div class="flex items-center justify-between mb-1 text-xs">
                                        <span class="font-semibold text-slate-700 flex items-center gap-1.5">
                                            <span class="w-2 h-2 rounded-full ${color} flex-shrink-0"></span>
                                            ${h.area}
                                        </span>
                                        <span class="text-slate-500">${h.cnt} ครั้ง${h.recordable>0?` · <span class="text-orange-600">${h.recordable} rec.</span>`:''}</span>
                                    </div>
                                    <div class="w-full bg-slate-100 rounded-full h-2">
                                        <div class="h-2 rounded-full ${color} transition-all" style="width:${pct}%"></div>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>`}
                </div>
            </div>

            <!-- Root Causes -->
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
                 style="box-shadow:0 4px 16px rgba(139,92,246,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#8b5cf6,#6366f1)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">Top Root Cause</h3>
                        <span class="text-xs text-slate-400">(สาเหตุที่พบบ่อย)</span>
                    </div>
                    ${rootCauses.length === 0
                        ? `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>`
                        : `<div class="space-y-2.5">
                            ${rootCauses.map((r, i) => {
                                const pct  = Math.round(parseInt(r.cnt) * 100 / maxRoot);
                                const rank = ['text-purple-700 font-black','text-purple-600 font-bold','text-purple-500 font-semibold'];
                                const bar  = ['bg-purple-500','bg-purple-400','bg-purple-300'];
                                const ri   = Math.min(i, 2);
                                return `
                                <div class="flex items-center gap-3">
                                    <span class="text-sm w-5 text-center ${rank[ri]} flex-shrink-0">${i+1}</span>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center justify-between mb-0.5">
                                            <span class="text-xs font-medium text-slate-700 truncate" title="${_esc(r.cause)}">${r.cause}</span>
                                            <span class="text-xs text-slate-500 ml-2 flex-shrink-0">${r.cnt}</span>
                                        </div>
                                        <div class="w-full bg-slate-100 rounded-full h-1.5">
                                            <div class="h-1.5 rounded-full ${bar[ri]} transition-all" style="width:${pct}%"></div>
                                        </div>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>`}
                </div>
            </div>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS PANEL
// ─────────────────────────────────────────────────────────────────────────────
async function _renderReportsPanel() {
    const panel = document.getElementById('acc-panel-reports');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    await Promise.all([_fetchReports(), _fetchDepts()]);

    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);
    const depts   = _allDepts.length
        ? _allDepts
        : [...new Set(_reports.map(r => r.Department).filter(Boolean))].sort();

    panel.innerHTML = `
    <div class="space-y-4">
        <!-- Filter Bar -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div class="flex flex-wrap gap-3 items-center">
                <select id="acc-f-year" class="form-input text-sm">
                    ${years.map(y => `<option value="${y}" ${_filter.year==y?'selected':''}>${y}</option>`).join('')}
                </select>
                <select id="acc-f-dept" class="form-input text-sm">
                    <option value="">ทุกแผนก</option>
                    ${depts.map(d => `<option value="${d}" ${_filter.dept===d?'selected':''}>${d}</option>`).join('')}
                </select>
                <select id="acc-f-type" class="form-input text-sm">
                    <option value="">ทุกประเภท</option>
                    ${ACCIDENT_TYPES.map(t => `<option value="${t}" ${_filter.type===t?'selected':''}>${t}</option>`).join('')}
                </select>
                <select id="acc-f-status" class="form-input text-sm">
                    <option value="">ทุกสถานะ</option>
                    <option value="Open"   ${_filter.status==='Open'  ?'selected':''}>Open</option>
                    <option value="Closed" ${_filter.status==='Closed'?'selected':''}>Closed</option>
                </select>
                <span id="acc-rec-count" class="text-xs text-slate-400 ml-auto">${_reports.length} รายการ</span>
            </div>
        </div>

        <!-- Table -->
        <div id="acc-reports-wrap" class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            ${_buildReportsTable()}
        </div>
    </div>`;

    ['acc-f-year','acc-f-dept','acc-f-type','acc-f-status'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', async () => {
            _filter.year   = parseInt(document.getElementById('acc-f-year')?.value)   || curYear;
            _filter.dept   = document.getElementById('acc-f-dept')?.value   || '';
            _filter.type   = document.getElementById('acc-f-type')?.value   || '';
            _filter.status = document.getElementById('acc-f-status')?.value || '';
            await _fetchReports();
            const wrap = document.getElementById('acc-reports-wrap');
            if (wrap) wrap.innerHTML = _buildReportsTable();
            const cnt = document.getElementById('acc-rec-count');
            if (cnt)  cnt.textContent = `${_reports.length} รายการ`;
        });
    });
}

async function _fetchReports() {
    try {
        const p = new URLSearchParams();
        if (_filter.year)   p.set('year',       _filter.year);
        if (_filter.dept)   p.set('department', _filter.dept);
        if (_filter.type)   p.set('type',       _filter.type);
        if (_filter.status) p.set('status',     _filter.status);
        const res = await API.get(`/accident/reports?${p}`);
        _reports  = res.data || [];
    } catch { _reports = []; }
}

function _buildReportsTable() {
    if (_reports.length === 0) {
        return `
        <div class="text-center py-16 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <p class="font-medium">ไม่พบข้อมูลอุบัติเหตุ</p>
            <p class="text-sm mt-1">ลองเปลี่ยนตัวกรองหรือเพิ่มรายงานใหม่</p>
        </div>`;
    }

    const rows = _reports.map(r => {
        const dateStr    = r.AccidentDate
            ? new Date(r.AccidentDate).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
            : '—';
        const tc         = TYPE_COLOR[r.AccidentType] || { bg: 'bg-slate-100', text: 'text-slate-600' };
        const sc         = SEV_COLOR[r.Severity]      || { bg: 'bg-slate-100', text: 'text-slate-600' };
        const statusBadge = r.Status === 'Closed'
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500"><span class="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>Closed</span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block"></span>Open</span>`;
        const attCount   = parseInt(r.AttachmentCount) || 0;
        const attBadge   = attCount > 0
            ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 ml-1" title="${attCount} ไฟล์แนบ">
                   <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                   ${attCount}
               </span>`
            : '';
        const pdfBtn = `
            <button onclick="window._accViewReport(${r.id})" title="ดูรายละเอียด"
                class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
            </button>
            <button onclick="window._accExportPDF(${r.id})" title="ส่งออก PDF"
                class="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            </button>`;
        const adminBtns = _isAdmin ? `
            <button onclick="window._accEditReport(${r.id})" title="แก้ไข"
                class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
            <button onclick="window._accDeleteReport(${r.id})" title="ลบ"
                class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>` : '';

        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-500">${dateStr}</td>
            <td class="px-4 py-3 min-w-[120px]">
                <p class="text-sm font-semibold text-slate-800">${r.EmployeeID}${attBadge}</p>
                <p class="text-xs text-slate-400">${r.EmployeeName || '—'}</p>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">${r.Department || '—'}</td>
            <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">${r.Area || '—'}</td>
            <td class="px-4 py-3 whitespace-nowrap">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${tc.bg} ${tc.text}">${r.AccidentType}</span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}">${r.Severity}</span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 max-w-[140px] truncate" title="${_esc(r.RootCause||'')}">${r.RootCause || '—'}</td>
            <td class="px-4 py-3 text-center text-sm ${r.LostDays>0?'text-red-600 font-semibold':'text-slate-400'}">${r.LostDays || 0}</td>
            <td class="px-4 py-3">${statusBadge}</td>
            <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                    ${pdfBtn}${adminBtns}
                </div>
            </td>
        </tr>`;
    }).join('');

    return `
    <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="bg-slate-50 border-b-2 border-slate-200">
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">วันที่เกิดเหตุ</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">พนักงาน</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">บริเวณ</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ประเภท</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ความรุนแรง</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">สาเหตุ</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">วันหยุด</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">สถานะ</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">จัดการ</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCIDENT FORM — full 6-section form with file attachments
// ─────────────────────────────────────────────────────────────────────────────
function _sectionHeader(label) {
    return `<div class="flex items-center gap-2 pt-1 pb-0.5 border-b border-slate-100">
                <span class="w-1 h-4 rounded-full bg-red-500 flex-shrink-0"></span>
                <p class="text-xs font-bold text-slate-600 uppercase tracking-wide">${label}</p>
            </div>`;
}

function openAccidentForm(r, existingAttachments = []) {
    const isEdit = r && r.id;
    _pendingFiles = [];

    const d = v => (v && String(v) !== 'null') ? String(v) : '';

    const html = `
    <form id="acc-form" class="space-y-5">
        ${isEdit ? `<input type="hidden" name="id" value="${r.id}">` : ''}

        <!-- ── Section 1: General Info ───────────────────────────────────── -->
        ${_sectionHeader('ข้อมูลทั่วไป')}
        <div class="grid grid-cols-3 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่เกิดเหตุ <span class="text-red-500">*</span></label>
                <input type="text" id="acc-accident-date" name="AccidentDate" required
                    value="${d(r?.AccidentDate).split('T')[0] || ''}" class="form-input w-full bg-white">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่รายงาน <span class="text-red-500">*</span></label>
                <input type="text" id="acc-report-date" name="ReportDate" required
                    value="${d(r?.ReportDate).split('T')[0] || ''}" class="form-input w-full bg-white">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เวลาที่เกิดเหตุ</label>
                <input type="time" name="AccidentTime" value="${d(r?.AccidentTime)}" class="form-input w-full">
            </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานที่เกิดเหตุ (Location)</label>
                <input name="Location" value="${_esc(d(r?.Location))}"
                    placeholder="เช่น อาคาร A ชั้น 2" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">บริเวณ / พื้นที่ (Area)</label>
                <input name="Area" value="${_esc(d(r?.Area))}"
                    placeholder="เช่น Line 3, คลังสินค้า" class="form-input w-full">
            </div>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้รายงาน (Reported By)</label>
            <input name="ReportedBy" value="${_esc(d(r?.ReportedBy))}"
                placeholder="ชื่อผู้กรอกรายงาน" class="form-input w-full">
        </div>

        <!-- ── Section 2: Person ─────────────────────────────────────────── -->
        ${_sectionHeader('ข้อมูลผู้ประสบเหตุ')}
        <div class="bg-red-50 border border-red-100 rounded-xl p-3 flex gap-2 text-xs text-red-700">
            <svg class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            รหัสพนักงานต้องมีอยู่ใน Employee Master Data · แผนกถูกกรอกอัตโนมัติ
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รหัสพนักงาน (ผู้บาดเจ็บ) <span class="text-red-500">*</span></label>
            <div class="relative">
                <input id="acc-emp-search" name="EmployeeID" required
                    value="${d(r?.EmployeeID)}" placeholder="พิมพ์รหัสหรือชื่อพนักงาน..."
                    autocomplete="off" class="form-input w-full"
                    oninput="window._accSearchEmp(this.value)">
                <div id="acc-emp-dropdown" class="hidden absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto"></div>
            </div>
            <div id="acc-emp-info" class="${r?.EmployeeID ? '' : 'hidden'} mt-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5 border border-emerald-100">
                ${r?.EmployeeName ? `<svg class="w-3.5 h-3.5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>${_esc(r.EmployeeName)} · ${_esc(r.Department || '')}` : ''}
            </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ตำแหน่งงาน</label>
                <input name="Position" value="${_esc(d(r?.Position))}"
                    placeholder="ตำแหน่ง (ดึงจาก master อัตโนมัติ)" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทการจ้าง</label>
                <select name="EmploymentType" class="form-input w-full">
                    <option value="">— เลือก —</option>
                    ${EMPLOYMENT_TYPES.map(e => `<option value="${e}" ${d(r?.EmploymentType)===e?'selected':''}>${e}</option>`).join('')}
                </select>
            </div>
        </div>

        <!-- ── Section 3: Incident ───────────────────────────────────────── -->
        ${_sectionHeader('รายละเอียดเหตุการณ์')}
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทอุบัติเหตุ <span class="text-red-500">*</span></label>
                <select name="AccidentType" required class="form-input w-full">
                    <option value="">— เลือกประเภท —</option>
                    ${ACCIDENT_TYPES.map(t => `<option value="${t}" ${d(r?.AccidentType)===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ระดับความรุนแรง</label>
                <select name="Severity" class="form-input w-full">
                    ${SEVERITIES.map(s => `<option value="${s}" ${(d(r?.Severity)||'Minor')===s?'selected':''}>${s}</option>`).join('')}
                </select>
            </div>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดการเกิดเหตุ</label>
            <textarea name="Description" rows="3" class="form-textarea w-full resize-none"
                placeholder="อธิบายเหตุการณ์ที่เกิดขึ้นโดยละเอียด">${_esc(d(r?.Description))}</textarea>
        </div>

        <!-- ── Section 4: Injury ─────────────────────────────────────────── -->
        ${_sectionHeader('รายละเอียดการบาดเจ็บ')}
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ลักษณะการบาดเจ็บ</label>
                <select name="InjuryType" class="form-input w-full">
                    <option value="">— เลือก —</option>
                    ${INJURY_TYPES.map(t => `<option value="${t}" ${d(r?.InjuryType)===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ส่วนร่างกายที่บาดเจ็บ</label>
                <select name="BodyPart" class="form-input w-full">
                    <option value="">— เลือก —</option>
                    ${BODY_PARTS.map(b => `<option value="${b}" ${d(r?.BodyPart)===b?'selected':''}>${b}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันหยุดงาน (Lost Time Days)</label>
                <input type="number" name="LostDays" min="0" value="${d(r?.LostDays) || 0}" class="form-input w-full">
            </div>
            <div class="bg-slate-50 rounded-xl px-3 flex items-center border border-slate-100">
                <label class="flex items-center gap-3 cursor-pointer w-full">
                    <input type="checkbox" name="IsRecordable" ${r?.IsRecordable ? 'checked' : ''}
                        class="w-4 h-4 rounded accent-red-500 flex-shrink-0">
                    <span class="text-sm text-slate-700">เป็น <span class="font-semibold text-red-600">Recordable Case</span></span>
                </label>
            </div>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">การรักษาพยาบาล</label>
            <textarea name="MedicalTreatment" rows="2" class="form-textarea w-full resize-none"
                placeholder="รายละเอียดการรักษา / โรงพยาบาล">${_esc(d(r?.MedicalTreatment))}</textarea>
        </div>

        <!-- ── Section 5: Cause Analysis ────────────────────────────────── -->
        ${_sectionHeader('การวิเคราะห์สาเหตุ')}
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">สาเหตุทันที (Immediate Cause)</label>
            <input name="ImmediateCause" value="${_esc(d(r?.ImmediateCause))}"
                placeholder="สาเหตุที่เกิดขึ้นทันที" class="form-input w-full">
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">กระทำที่ไม่ปลอดภัย (Unsafe Act)</label>
                <input name="UnsafeAct" value="${_esc(d(r?.UnsafeAct))}"
                    placeholder="พฤติกรรมที่เกี่ยวข้อง" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สภาพที่ไม่ปลอดภัย (Unsafe Condition)</label>
                <input name="UnsafeCondition" value="${_esc(d(r?.UnsafeCondition))}"
                    placeholder="สภาพแวดล้อมที่เกี่ยวข้อง" class="form-input w-full">
            </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สาเหตุรากเหง้า (Root Cause)</label>
                <select name="RootCause" class="form-input w-full">
                    <option value="">— เลือกสาเหตุ —</option>
                    ${ROOT_CAUSES.map(rc => `<option value="${rc}" ${d(r?.RootCause)===rc?'selected':''}>${rc}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดสาเหตุ</label>
                <input name="RootCauseDetail" value="${_esc(d(r?.RootCauseDetail))}"
                    placeholder="อธิบายเพิ่มเติม" class="form-input w-full">
            </div>
        </div>

        <!-- ── Section 6: Actions + Attachments ─────────────────────────── -->
        ${_sectionHeader('มาตรการแก้ไขและเอกสาร')}
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">มาตรการแก้ไข (Corrective Action)</label>
                <textarea name="CorrectiveAction" rows="2" class="form-textarea w-full resize-none"
                    placeholder="มาตรการที่ดำเนินการแล้ว">${_esc(d(r?.CorrectiveAction))}</textarea>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">มาตรการป้องกัน (Preventive Action)</label>
                <textarea name="PreventiveAction" rows="2" class="form-textarea w-full resize-none"
                    placeholder="มาตรการเพื่อป้องกันการเกิดซ้ำ">${_esc(d(r?.PreventiveAction))}</textarea>
            </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้รับผิดชอบ</label>
                <input name="ResponsiblePerson" value="${_esc(d(r?.ResponsiblePerson))}"
                    placeholder="ชื่อผู้รับผิดชอบ" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">กำหนดเสร็จ</label>
                <input type="text" id="acc-due-date" name="DueDate"
                    value="${d(r?.DueDate).split('T')[0] || ''}" class="form-input w-full bg-white">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานะ</label>
                <select name="Status" class="form-input w-full">
                    <option value="Open"   ${(d(r?.Status)||'Open')==='Open'  ?'selected':''}>Open</option>
                    <option value="Closed" ${d(r?.Status)==='Closed'          ?'selected':''}>Closed</option>
                </select>
            </div>
        </div>

        <!-- Existing attachments (edit mode) -->
        ${existingAttachments.length > 0 ? `
        <div>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">ไฟล์แนบที่มีอยู่แล้ว</p>
            <div id="acc-existing-atts" class="space-y-1.5">
                ${existingAttachments.map(a => _buildExistingAttRow(a, r.id)).join('')}
            </div>
        </div>` : ''}

        <!-- New file upload zone -->
        <div>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">แนบไฟล์ใหม่ <span class="font-normal text-slate-400">(รูปภาพ / PDF · สูงสุด 10 ไฟล์ · ไฟล์ละไม่เกิน 20 MB)</span></p>
            <label id="acc-file-zone"
                class="flex flex-col items-center justify-center gap-2 w-full border-2 border-dashed border-slate-200 rounded-xl p-5 cursor-pointer hover:border-red-300 hover:bg-red-50 transition-colors">
                <svg class="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                <span class="text-sm text-slate-400">คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวาง</span>
                <input id="acc-file-input" type="file" multiple accept="image/*,.pdf"
                    class="hidden">
            </label>
            <div id="acc-pending-list" class="mt-2 space-y-1.5"></div>
        </div>

        <div id="acc-form-err" class="text-sm text-red-500 hidden"></div>

        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="acc-form-submit" class="btn btn-primary px-5"
                    style="background:linear-gradient(135deg,#dc2626,#b91c1c)">บันทึก</button>
        </div>
    </form>`;

    openModal(isEdit ? 'แก้ไขรายงานอุบัติเหตุ' : 'บันทึกรายงานอุบัติเหตุ', html, 'max-w-3xl');

    // Flatpickr
    if (typeof flatpickr !== 'undefined') {
        flatpickr('#acc-accident-date', { locale: 'th', dateFormat: 'Y-m-d', defaultDate: d(r?.AccidentDate).split('T')[0] || 'today' });
        flatpickr('#acc-report-date',   { locale: 'th', dateFormat: 'Y-m-d', defaultDate: d(r?.ReportDate).split('T')[0]   || 'today' });
        flatpickr('#acc-due-date',      { locale: 'th', dateFormat: 'Y-m-d', defaultDate: d(r?.DueDate).split('T')[0]      || null    });
    }

    // File input → validate + stage files
    document.getElementById('acc-file-input')?.addEventListener('change', e => {
        const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
        const files    = Array.from(e.target.files || []);
        const errs     = [];

        for (const f of files) {
            const allowed = f.type.startsWith('image/') || f.type === 'application/pdf';
            if (!allowed) {
                errs.push(`"${f.name}" ไม่รองรับ (รับเฉพาะรูปภาพ / PDF)`);
                continue;
            }
            if (f.size > MAX_SIZE) {
                errs.push(`"${f.name}" ขนาดเกิน 20 MB`);
                continue;
            }
            if (_pendingFiles.some(p => p.name === f.name && p.size === f.size)) {
                errs.push(`"${f.name}" ซ้ำ`);
                continue;
            }
            if (_pendingFiles.length >= 10) {
                errs.push('ไม่สามารถเพิ่มได้ — ครบ 10 ไฟล์แล้ว');
                break;
            }
            _pendingFiles.push(f);
        }

        e.target.value = ''; // reset so same file can be re-added after remove
        _renderPendingList();

        if (errs.length) {
            const errEl = document.getElementById('acc-form-err');
            if (errEl) {
                errEl.textContent = errs.join(' · ');
                errEl.classList.remove('hidden');
                setTimeout(() => errEl.classList.add('hidden'), 5000);
            }
        }
    });

    // Submit
    document.getElementById('acc-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        const btn  = document.getElementById('acc-form-submit');
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>กำลังบันทึก...';

        try {
            const fd = new FormData(form);
            // Normalize checkbox → 1/0
            fd.set('IsRecordable', form.querySelector('[name="IsRecordable"]')?.checked ? '1' : '0');
            // Append staged files
            _pendingFiles.forEach(f => fd.append('files', f));

            const id = form.querySelector('[name="id"]')?.value;
            if (id) {
                await API.put(`/accident/reports/${id}`, fd);
            } else {
                await API.post('/accident/reports', fd);
            }

            _pendingFiles = [];
            closeModal();
            showToast('บันทึกรายงานอุบัติเหตุสำเร็จ', 'success');
            _summary   = null;
            _analytics = null;
            _perfData  = null;
            _loadHeroStats();
            if (_activeTab === 'reports') {
                await _fetchReports();
                const wrap = document.getElementById('acc-reports-wrap');
                if (wrap) wrap.innerHTML = _buildReportsTable();
                const cnt  = document.getElementById('acc-rec-count');
                if (cnt)   cnt.textContent = `${_reports.length} รายการ`;
            } else if (_activeTab === 'dashboard') {
                _renderDashboardPanel();
            } else if (_activeTab === 'analytics') {
                _renderAnalyticsPanel();
            } else if (_activeTab === 'performance') {
                _renderPerformancePanel();
            }
        } catch (err) {
            const errEl = document.getElementById('acc-form-err');
            if (errEl) { errEl.textContent = err.message || 'เกิดข้อผิดพลาด'; errEl.classList.remove('hidden'); }
            btn.disabled = false;
            btn.textContent = 'บันทึก';
        }
    });
}

function _buildExistingAttRow(a, accidentId) {
    const isImg = a.FileType?.startsWith('image/');
    const icon  = isImg
        ? `<svg class="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`
        : `<svg class="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`;
    return `
    <div id="acc-att-${a.id}" class="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
        ${icon}
        <a href="${_esc(a.FileURL)}" target="_blank" rel="noopener"
           class="flex-1 text-xs text-blue-600 hover:underline truncate" title="${_esc(a.FileName)}">${_esc(a.FileName)}</a>
        <button type="button" onclick="window._accDeleteAttachment(${a.id})"
            class="p-0.5 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0" title="ลบไฟล์">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
    </div>`;
}

function _renderPendingList() {
    const el = document.getElementById('acc-pending-list');
    if (!el) return;
    if (_pendingFiles.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = _pendingFiles.map((f, i) => {
        const size = f.size > 1048576 ? `${(f.size/1048576).toFixed(1)} MB` : `${Math.round(f.size/1024)} KB`;
        const isImg = f.type.startsWith('image/');
        const icon  = isImg
            ? `<svg class="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`
            : `<svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>`;
        return `
        <div class="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
            ${icon}
            <span class="flex-1 text-xs text-slate-700 truncate" title="${_esc(f.name)}">${_esc(f.name)}</span>
            <span class="text-[10px] text-slate-400 flex-shrink-0">${size}</span>
            <button type="button" onclick="window._accRemovePending(${i})"
                class="p-0.5 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0" title="ลบออก">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFETY PERFORMANCE PANEL
// ─────────────────────────────────────────────────────────────────────────────
const MONTHS_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

async function _renderPerformancePanel() {
    const panel = document.getElementById('acc-panel-performance');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    try {
        const res = await API.get(`/accident/performance?year=${_statsYear}`);
        _perfData = res.data || null;
    } catch { _perfData = null; }

    if (!_perfData) {
        panel.innerHTML = `<div class="text-center py-16 text-slate-400 text-sm">โหลดข้อมูลไม่สำเร็จ</div>`;
        return;
    }

    const p        = _perfData;
    const today    = new Date();
    const lastDate = p.LastAccidentDate ? new Date(p.LastAccidentDate) : null;
    const daysSince = lastDate
        ? Math.floor((today - lastDate) / 86400000)
        : (parseInt(p.TotalDays) || 0);
    const hours    = parseInt(p.TotalHours)   || 0;
    const tgtDays  = parseInt(p.TargetDays)   || 365;
    const tgtHours = parseInt(p.TargetHours)  || 1000000;
    const isZero   = parseInt(p.recordableCount) === 0;
    const daysPct  = tgtDays  > 0 ? Math.min(100, Math.round(daysSince * 100 / tgtDays))  : 0;
    const hoursPct = tgtHours > 0 ? Math.min(100, Math.round(hours * 100 / tgtHours)) : 0;

    const fmtHours = h => {
        if (h >= 1000000) return (h / 1000000).toFixed(2) + 'M';
        return h.toLocaleString();
    };

    const monthlyStatus = (() => {
        try {
            return typeof p.MonthlyStatus === 'string'
                ? JSON.parse(p.MonthlyStatus)
                : (p.MonthlyStatus || {});
        } catch { return {}; }
    })();
    const monthValues = MONTHS_EN.map((_, i) => monthlyStatus[String(i + 1)] || 'pending');
    const safeMonths = monthValues.filter(v => v === 'green').length;
    const accidentMonths = monthValues.filter(v => v === 'red').length;
    const pendingMonths = 12 - safeMonths - accidentMonths;
    const perfStatus = isZero && daysPct >= 100 && hoursPct >= 100 ? 'Target achieved'
        : isZero ? 'On track'
        : 'Action required';
    const perfStatusClass = isZero && daysPct >= 100 && hoursPct >= 100 ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
        : isZero ? 'text-sky-700 bg-sky-50 border-sky-100'
        : 'text-red-700 bg-red-50 border-red-100';

    const bannerGrad = isZero
        ? 'linear-gradient(135deg,#064e3b 0%,#059669 55%,#0d9488 100%)'
        : 'linear-gradient(135deg,#7f1d1d 0%,#dc2626 55%,#f97316 100%)';

    panel.innerHTML = `
    <div class="space-y-5">

        <!-- ── Zero Accident Banner ─────────────────────────────────────────── -->
        <div class="relative overflow-hidden rounded-2xl" style="background:${bannerGrad}">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="perf-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1.2" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#perf-dots)"/></svg>
            </div>
            <div class="relative z-10 px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div class="text-center sm:text-left">
                    <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold mb-2 bg-white/20 text-white border border-white/30">
                        <span class="w-2 h-2 rounded-full animate-pulse inline-block ${isZero ? 'bg-emerald-300' : 'bg-red-300'}"></span>
                        ${isZero ? 'ZERO ACCIDENT' : 'มีอุบัติเหตุ Recordable'}
                    </div>
                    <p class="text-xl font-bold text-white">Safety Performance ปี ${_statsYear}</p>
                    <p class="text-sm mt-0.5" style="color:rgba(167,243,208,0.85)">
                        Recordable: ${p.recordableCount} ราย
                        ${p.UpdatedBy ? ` · อัปเดตโดย ${p.UpdatedBy}` : ''}
                    </p>
                </div>
                ${_isAdmin ? `
                <button onclick="window._accEditPerformance()"
                    class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white border border-white/30 bg-white/15 hover:bg-white/25 transition-all whitespace-nowrap flex-shrink-0">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    แก้ไขข้อมูล
                </button>` : ''}
            </div>
        </div>

        <!-- ── KPI Big Numbers ──────────────────────────────────────────────── -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div class="rounded-xl border ${perfStatusClass} px-4 py-3">
                <p class="text-[10px] font-bold uppercase opacity-70">Board Status</p>
                <p class="mt-1 text-sm font-black">${perfStatus}</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p class="text-[10px] font-bold uppercase text-slate-400">Days Progress</p>
                <p class="mt-1 text-sm font-black text-slate-700">${daysPct}% <span class="text-xs font-semibold text-slate-400">of target</span></p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p class="text-[10px] font-bold uppercase text-slate-400">Hours Progress</p>
                <p class="mt-1 text-sm font-black text-slate-700">${hoursPct}% <span class="text-xs font-semibold text-slate-400">of target</span></p>
            </div>
            <div class="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p class="text-[10px] font-bold uppercase text-emerald-500">Safe Months</p>
                <p class="mt-1 text-sm font-black text-emerald-700">${safeMonths}/12</p>
            </div>
            <div class="rounded-xl border ${accidentMonths ? 'border-red-100 bg-red-50' : 'border-slate-200 bg-white'} px-4 py-3">
                <p class="text-[10px] font-bold uppercase ${accidentMonths ? 'text-red-500' : 'text-slate-400'}">Review Months</p>
                <p class="mt-1 text-sm font-black ${accidentMonths ? 'text-red-700' : 'text-slate-700'}">${accidentMonths} accident / ${pendingMonths} pending</p>
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">

            <!-- Days without accident -->
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
                 style="box-shadow:0 4px 16px rgba(5,150,105,0.12),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1.5" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
                <div class="p-5 text-center">
                    <div class="flex items-center justify-center gap-1.5 mb-3">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                        <p class="text-xs font-bold text-slate-500 uppercase tracking-wide">วันปลอดอุบัติเหตุ</p>
                    </div>
                    <p class="text-7xl font-black text-emerald-600 leading-none tabular-nums">${daysSince.toLocaleString()}</p>
                    <p class="text-sm text-slate-400 mt-1">วัน (Days)</p>
                    <div class="mt-4">
                        <div class="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                            <span>เป้าหมาย ${tgtDays.toLocaleString()} วัน</span>
                            <span class="font-bold ${daysPct >= 100 ? 'text-emerald-600' : 'text-slate-600'}">${daysPct}%</span>
                        </div>
                        <div class="w-full bg-slate-100 rounded-full h-2.5">
                            <div class="h-2.5 rounded-full transition-all ${daysPct >= 100 ? 'bg-emerald-500' : 'bg-emerald-400'}"
                                 style="width:${daysPct}%"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Man-Hours without accident -->
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
                 style="box-shadow:0 4px 16px rgba(2,132,199,0.12),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1.5" style="background:linear-gradient(90deg,#0284c7,#0891b2)"></div>
                <div class="p-5 text-center">
                    <div class="flex items-center justify-center gap-1.5 mb-3">
                        <svg class="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <p class="text-xs font-bold text-slate-500 uppercase tracking-wide">Man-Hours ปลอดอุบัติเหตุ</p>
                    </div>
                    <p class="text-5xl font-black text-sky-600 leading-none tabular-nums">${fmtHours(hours)}</p>
                    <p class="text-sm text-slate-400 mt-1">Man-Hours</p>
                    <div class="mt-4">
                        <div class="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                            <span>เป้าหมาย ${fmtHours(tgtHours)}</span>
                            <span class="font-bold ${hoursPct >= 100 ? 'text-sky-600' : 'text-slate-600'}">${hoursPct}%</span>
                        </div>
                        <div class="w-full bg-slate-100 rounded-full h-2.5">
                            <div class="h-2.5 rounded-full transition-all ${hoursPct >= 100 ? 'bg-sky-500' : 'bg-sky-400'}"
                                 style="width:${hoursPct}%"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Last Accident Date -->
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
                 style="box-shadow:0 4px 16px rgba(220,38,38,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1.5" style="background:linear-gradient(90deg,#dc2626,#9f1239)"></div>
                <div class="p-5 text-center">
                    <div class="flex items-center justify-center gap-1.5 mb-3">
                        <svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        <p class="text-xs font-bold text-slate-500 uppercase tracking-wide">อุบัติเหตุล่าสุด</p>
                    </div>
                    ${lastDate
                        ? `<p class="text-3xl font-black text-red-600 leading-tight">
                               ${lastDate.toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'2-digit'})}
                           </p>
                           <p class="text-sm text-slate-400 mt-1">${daysSince.toLocaleString()} วันที่ผ่านมา</p>`
                        : `<p class="text-3xl font-black text-slate-300 leading-tight">—</p>
                           <p class="text-sm text-slate-400 mt-1">ยังไม่มีข้อมูล</p>`}
                    <div class="mt-4 rounded-xl px-3 py-2.5 ${isZero
                        ? 'bg-emerald-50 border border-emerald-100'
                        : 'bg-red-50 border border-red-100'}">
                        <div class="flex items-center justify-center gap-1.5">
                            <svg class="w-3.5 h-3.5 ${isZero ? 'text-emerald-600' : 'text-red-600'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                ${isZero
                                    ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>`
                                    : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>`}
                            </svg>
                            <p class="text-xs font-bold ${isZero ? 'text-emerald-700' : 'text-red-700'}">
                                ${isZero ? 'Zero Recordable ' + _statsYear : 'มี Recordable ' + _statsYear}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── Monthly Status Grid ───────────────────────────────────────────── -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
             style="box-shadow:0 4px 16px rgba(220,38,38,0.06),0 1px 4px rgba(0,0,0,0.06)">
            <div class="h-1.5" style="background:linear-gradient(90deg,#dc2626,#9f1239)"></div>
            <div class="p-5">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">Monthly Safety Status — ${_statsYear}</h3>
                    </div>
                    <div class="flex items-center gap-3 text-xs text-slate-400 flex-shrink-0">
                        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded inline-block" style="background:#059669"></span>ปลอดภัย</span>
                        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded inline-block" style="background:#dc2626"></span>มีอุบัติเหตุ</span>
                        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-slate-200 inline-block"></span>ยังไม่ถึง</span>
                    </div>
                </div>

                <div class="grid grid-cols-6 sm:grid-cols-12 gap-2">
                    ${MONTHS_EN.map((m, i) => {
                        const mo  = String(i + 1);
                        const st  = monthlyStatus[mo] || 'pending';
                        const yr  = parseInt(_statsYear);
                        const now = new Date();
                        const isCurrent = yr === now.getFullYear() && i === now.getMonth();
                        const isPast    = yr < now.getFullYear() ||
                                          (yr === now.getFullYear() && i < now.getMonth());

                        let cellStyle, textCls, subLabel;
                        if (st === 'green') {
                            cellStyle = 'background:#059669';
                            textCls   = 'text-white';
                            subLabel  = 'OK';
                        } else if (st === 'red') {
                            cellStyle = 'background:#dc2626';
                            textCls   = 'text-white';
                            subLabel  = 'ACC';
                        } else if (isCurrent) {
                            cellStyle = 'background:rgba(2,132,199,0.1);border:2px solid #0284c7';
                            textCls   = 'text-sky-700';
                            subLabel  = 'NOW';
                        } else {
                            cellStyle = 'background:#f1f5f9';
                            textCls   = isPast ? 'text-slate-400' : 'text-slate-300';
                            subLabel  = '—';
                        }

                        const clickAttr = _isAdmin
                            ? `onclick="window._accToggleMonth(${i+1})" style="${cellStyle};cursor:pointer"`
                            : `style="${cellStyle}"`;

                        return `
                        <div ${clickAttr}
                             class="rounded-xl py-3 text-center select-none transition-opacity ${_isAdmin ? 'hover:opacity-80' : ''} ${textCls}"
                             title="${_isAdmin ? 'คลิกเพื่อสลับ: ยังไม่ถึง → ปลอดภัย → มีอุบัติเหตุ → ยังไม่ถึง' : ''}">
                            <p class="text-xs font-bold">${m}</p>
                            <p class="text-[10px] mt-0.5 opacity-75">${subLabel}</p>
                        </div>`;
                    }).join('')}
                </div>

                ${_isAdmin ? `
                <p class="text-[11px] text-slate-400 mt-3">
                    <svg class="w-3 h-3 inline-block mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    คลิกที่เดือนเพื่อสลับสถานะ — บันทึกอัตโนมัติ
                </p>` : ''}
            </div>
        </div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW GLOBALS
// ─────────────────────────────────────────────────────────────────────────────
function _htmlEsc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _accInfoField(label, value) {
    return `<div>
        <p class="text-[10px] font-bold uppercase text-slate-400">${_htmlEsc(label)}</p>
        <p class="mt-1 text-sm font-semibold text-slate-700">${_htmlEsc(value || '-')}</p>
    </div>`;
}

function _renderAccidentDetail(r) {
    const fmtDate = value => value ? new Date(value).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'numeric' }) : '-';
    const typeColor = TYPE_COLOR[r.AccidentType] || { bg: 'bg-slate-100', text: 'text-slate-600' };
    const sevColor = SEV_COLOR[r.Severity] || { bg: 'bg-slate-100', text: 'text-slate-600' };
    const statusClass = r.Status === 'Closed' ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-amber-100 text-amber-700 border-amber-200';
    const attachments = Array.isArray(r.attachments) ? r.attachments : [];
    const due = r.DueDate ? new Date(r.DueDate) : null;
    const overdue = r.Status !== 'Closed' && due && due < new Date();
    const body = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Type</p>
                    <p class="mt-1 text-sm font-bold text-slate-700">${_htmlEsc(r.AccidentType || '-')}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Severity</p>
                    <p class="mt-1 text-sm font-bold text-slate-700">${_htmlEsc(r.Severity || '-')}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Lost Days</p>
                    <p class="mt-1 text-sm font-bold ${Number(r.LostDays) > 0 ? 'text-red-600' : 'text-slate-700'}">${Number(r.LostDays) || 0}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Due</p>
                    <p class="mt-1 text-sm font-bold ${overdue ? 'text-red-600' : 'text-slate-700'}">${_htmlEsc(fmtDate(r.DueDate))}</p>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                ${_accInfoField('Accident Date', `${fmtDate(r.AccidentDate)} ${r.AccidentTime || ''}`.trim())}
                ${_accInfoField('Report Date', fmtDate(r.ReportDate))}
                ${_accInfoField('Employee', `${r.EmployeeID || '-'} ${r.EmployeeName ? '- ' + r.EmployeeName : ''}`)}
                ${_accInfoField('Department', r.Department)}
                ${_accInfoField('Area', r.Area)}
                ${_accInfoField('Reporter', r.ReporterName)}
            </div>

            ${r.Description ? `<div class="rounded-xl border border-red-100 bg-red-50 p-3">
                <p class="text-xs font-bold uppercase text-red-500 mb-1">Incident Description</p>
                <p class="text-sm leading-relaxed text-slate-700">${_htmlEsc(r.Description)}</p>
            </div>` : ''}
            ${r.RootCause || r.RootCauseDetail ? `<div class="rounded-xl border border-amber-100 bg-amber-50 p-3">
                <p class="text-xs font-bold uppercase text-amber-600 mb-1">Root Cause</p>
                <p class="text-sm leading-relaxed text-slate-700">${_htmlEsc(r.RootCause || '-')}</p>
                ${r.RootCauseDetail ? `<p class="mt-1 text-sm leading-relaxed text-slate-600">${_htmlEsc(r.RootCauseDetail)}</p>` : ''}
            </div>` : ''}
            ${r.CorrectiveAction || r.PreventiveAction ? `<div class="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <p class="text-xs font-bold uppercase text-emerald-600 mb-1">Action Plan</p>
                ${r.CorrectiveAction ? `<p class="text-sm leading-relaxed text-slate-700"><span class="font-semibold">Corrective:</span> ${_htmlEsc(r.CorrectiveAction)}</p>` : ''}
                ${r.PreventiveAction ? `<p class="mt-1 text-sm leading-relaxed text-slate-700"><span class="font-semibold">Preventive:</span> ${_htmlEsc(r.PreventiveAction)}</p>` : ''}
                ${r.ResponsiblePerson ? `<p class="mt-2 text-xs font-semibold text-emerald-700">Owner: ${_htmlEsc(r.ResponsiblePerson)}</p>` : ''}
            </div>` : ''}
            ${attachments.length ? `<div>
                <p class="text-xs font-bold uppercase text-slate-400 mb-2">Attachments (${attachments.length})</p>
                <div class="flex flex-wrap gap-2">
                    ${attachments.map(a => `<a href="${_htmlEsc(a.FileURL)}" target="_blank" rel="noopener"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200">
                        <span class="max-w-[180px] truncate">${_htmlEsc(a.FileName || 'Attachment')}</span>
                    </a>`).join('')}
                </div>
            </div>` : ''}
        </div>`;

    openDetailModal({
        title: `ACC-${String(r.id || '').padStart(4, '0')}`,
        subtitle: `${fmtDate(r.AccidentDate)} · ${r.Department || '-'} · ${r.EmployeeName || r.EmployeeID || '-'}`,
        meta: [
            { label: r.Status || '-', className: statusClass },
            { label: r.AccidentType || '-', className: `${typeColor.bg} ${typeColor.text} border-slate-200` },
            { label: r.Severity || '-', className: `${sevColor.bg} ${sevColor.text} border-slate-200` },
            overdue ? { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-200' } : null,
        ],
        body,
        size: 'max-w-3xl'
    });
}

window._accViewReport = async id => {
    try {
        const res = await API.get(`/accident/reports/${id}`);
        if (res?.data) _renderAccidentDetail(res.data);
    } catch {
        showToast('ไม่สามารถโหลดรายละเอียดอุบัติเหตุได้', 'error');
    }
};

window._accEditReport = async id => {
    try {
        const res = await API.get(`/accident/reports/${id}`);
        if (res?.data) openAccidentForm(res.data, res.data.attachments || []);
    } catch {
        showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
    }
};

window._accDeleteReport = async id => {
    const ok = await showConfirmationModal('ยืนยันการลบ', 'ต้องการลบรายงานอุบัติเหตุนี้ใช่หรือไม่?');
    if (!ok) return;
    try {
        await API.delete(`/accident/reports/${id}`);
        showToast('ลบรายงานสำเร็จ', 'success');
        _summary   = null;
        _analytics = null;
        _perfData  = null;
        _loadHeroStats();
        await _fetchReports();
        const wrap = document.getElementById('acc-reports-wrap');
        if (wrap) wrap.innerHTML = _buildReportsTable();
        const cnt = document.getElementById('acc-rec-count');
        if (cnt)  cnt.textContent = `${_reports.length} รายการ`;
    } catch (err) {
        showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

window._accExportPDF = async id => {
    try {
        showLoading('กำลังสร้าง PDF...');
        const res = await API.get(`/accident/reports/${id}`);
        const r   = res?.data;
        if (!r) { showToast('ไม่พบรายงาน', 'error'); return; }

        const fmt = iso => iso ? new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const v   = val => val != null && val !== '' ? _esc(String(val)) : '—';

        const page = document.createElement('div');
        page.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;min-height:1122px;background:#fff;font-family:Kanit,sans-serif;display:flex;flex-direction:column';
        page.innerHTML = `
        <div style="background:linear-gradient(135deg,#7f1d1d,#dc2626);padding:28px 36px;color:#fff;flex-shrink:0">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <div>
                    <p style="font-size:11px;opacity:.75;margin:0 0 4px">รายงานอุบัติเหตุ / Accident Report</p>
                    <h1 style="font-size:22px;font-weight:700;margin:0">ACC-${String(r.id).padStart(4,'0')}</h1>
                </div>
                <div style="text-align:right;font-size:11px;opacity:.8">
                    <p style="margin:0">วันที่พิมพ์: ${fmt(new Date().toISOString())}</p>
                    <p style="margin:4px 0 0">สถานะ: ${v(r.Status)}</p>
                </div>
            </div>
        </div>

        <div style="flex:1;padding:28px 36px;display:flex;flex-direction:column;gap:18px">
            <!-- Section 1: ข้อมูลทั่วไป -->
            <div>
                <p style="font-size:10px;font-weight:700;color:#dc2626;letter-spacing:.06em;margin:0 0 8px;text-transform:uppercase">ข้อมูลทั่วไป</p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                    ${_pdfField('วันที่เกิดเหตุ', fmt(r.AccidentDate))}
                    ${_pdfField('วันที่รายงาน', fmt(r.ReportDate))}
                    ${_pdfField('เวลา', v(r.AccidentTime))}
                    ${_pdfField('บริเวณ/สถานที่', v(r.Area || r.Location))}
                    ${_pdfField('ผู้รายงาน', v(r.ReportedBy))}
                    ${_pdfField('แผนก', v(r.Department))}
                </div>
            </div>
            <!-- Section 2: ผู้ประสบเหตุ -->
            <div>
                <p style="font-size:10px;font-weight:700;color:#dc2626;letter-spacing:.06em;margin:0 0 8px;text-transform:uppercase">ผู้ประสบเหตุ</p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                    ${_pdfField('รหัสพนักงาน', v(r.EmployeeID))}
                    ${_pdfField('ชื่อ', v(r.EmployeeName))}
                    ${_pdfField('ตำแหน่ง', v(r.Position))}
                    ${_pdfField('ประเภทการจ้าง', v(r.EmploymentType))}
                </div>
            </div>
            <!-- Section 3: รายละเอียด -->
            <div>
                <p style="font-size:10px;font-weight:700;color:#dc2626;letter-spacing:.06em;margin:0 0 8px;text-transform:uppercase">รายละเอียดเหตุการณ์</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    ${_pdfField('ประเภทอุบัติเหตุ', v(r.AccidentType))}
                    ${_pdfField('ความรุนแรง', v(r.Severity))}
                </div>
                ${_pdfFieldFull('คำอธิบาย', v(r.Description))}
            </div>
            <!-- Section 4: การบาดเจ็บ -->
            <div>
                <p style="font-size:10px;font-weight:700;color:#dc2626;letter-spacing:.06em;margin:0 0 8px;text-transform:uppercase">การบาดเจ็บ</p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                    ${_pdfField('ประเภทการบาดเจ็บ', v(r.InjuryType))}
                    ${_pdfField('ส่วนของร่างกาย', v(r.BodyPart))}
                    ${_pdfField('วันหยุดงาน', r.LostDays > 0 ? r.LostDays + ' วัน' : '0 วัน')}
                    ${_pdfField('Recordable', r.IsRecordable ? 'ใช่' : 'ไม่ใช่')}
                    ${_pdfField('การรักษา', v(r.MedicalTreatment))}
                </div>
            </div>
            <!-- Section 5: สาเหตุ -->
            <div>
                <p style="font-size:10px;font-weight:700;color:#dc2626;letter-spacing:.06em;margin:0 0 8px;text-transform:uppercase">วิเคราะห์สาเหตุ</p>
                ${_pdfFieldFull('สาเหตุทันที', v(r.ImmediateCause))}
                ${_pdfFieldFull('พฤติกรรมไม่ปลอดภัย', v(r.UnsafeAct))}
                ${_pdfFieldFull('สภาพไม่ปลอดภัย', v(r.UnsafeCondition))}
                ${_pdfFieldFull('สาเหตุรากเหง้า', v(r.RootCause))}
            </div>
            <!-- Section 6: มาตรการ -->
            <div>
                <p style="font-size:10px;font-weight:700;color:#dc2626;letter-spacing:.06em;margin:0 0 8px;text-transform:uppercase">มาตรการแก้ไข</p>
                ${_pdfFieldFull('มาตรการแก้ไข', v(r.CorrectiveAction))}
                ${_pdfFieldFull('มาตรการป้องกัน', v(r.PreventiveAction))}
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px">
                    ${_pdfField('ผู้รับผิดชอบ', v(r.ResponsiblePerson))}
                    ${_pdfField('กำหนดเสร็จ', fmt(r.DueDate))}
                    ${_pdfField('สถานะ', v(r.Status))}
                </div>
            </div>
        </div>

        <div style="background:#7f1d1d;padding:10px 36px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
            <p style="color:rgba(255,255,255,.7);font-size:9px;margin:0">TSH Safety Core Activity System</p>
            <p style="color:rgba(255,255,255,.7);font-size:9px;margin:0">Accident Report ACC-${String(r.id).padStart(4,'0')}</p>
        </div>`;

        document.body.appendChild(page);
        const canvas = await html2canvas(page, { scale: 1.5, useCORS: true, logging: false });
        document.body.removeChild(page);

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        const fn = `ACC-${String(r.id).padStart(4,'0')}-${(r.AccidentDate||'').slice(0,10).replace(/-/g,'')}.pdf`;
        pdf.save(fn);
        showToast('ส่งออก PDF สำเร็จ', 'success');
    } catch (err) {
        showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
        hideLoading();
    }
};

function _pdfField(label, val) {
    return `<div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px">
        <p style="font-size:9px;color:#94a3b8;margin:0 0 2px">${label}</p>
        <p style="font-size:11px;color:#1e293b;font-weight:600;margin:0">${val}</p>
    </div>`;
}
function _pdfFieldFull(label, val) {
    return `<div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px;margin-bottom:8px">
        <p style="font-size:9px;color:#94a3b8;margin:0 0 2px">${label}</p>
        <p style="font-size:11px;color:#1e293b;margin:0;white-space:pre-wrap;line-height:1.5">${val}</p>
    </div>`;
}

window._accDeleteAttachment = async attId => {
    const ok = await showConfirmationModal('ลบไฟล์แนบ', 'ต้องการลบไฟล์นี้ใช่หรือไม่?');
    if (!ok) return;
    try {
        await API.delete(`/accident/attachments/${attId}`);
        document.getElementById(`acc-att-${attId}`)?.remove();
        showToast('ลบไฟล์สำเร็จ', 'success');
    } catch (err) {
        showToast(err.message || 'ลบไฟล์ไม่สำเร็จ', 'error');
    }
};

window._accRemovePending = idx => {
    _pendingFiles.splice(idx, 1);
    _renderPendingList();
};

window._accEditPerformance = () => {
    const p = _perfData || {};
    const lastDateVal = p.LastAccidentDate
        ? String(p.LastAccidentDate).split('T')[0]
        : '';
    const html = `
    <form id="perf-form" class="space-y-4">
        <input type="hidden" name="Year" value="${p.Year || new Date().getFullYear()}">
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ปี (Year)</label>
                <input type="text" value="${p.Year || new Date().getFullYear()}"
                    class="form-input w-full bg-slate-50" readonly>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันเกิดอุบัติเหตุล่าสุด</label>
                <input type="text" id="perf-last-date" name="LastAccidentDate"
                    value="${lastDateVal}" class="form-input w-full bg-white"
                    placeholder="เว้นว่างถ้าไม่มีข้อมูล">
            </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    Man-Hours ปลอดอุบัติเหตุ
                    <span class="font-normal text-slate-400">(สะสม)</span>
                </label>
                <input type="number" name="TotalHours" min="0"
                    value="${p.TotalHours || 0}" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    วันปลอดอุบัติเหตุ
                    <span class="font-normal text-slate-400">(คำนวณจากวันล่าสุดถ้ามี)</span>
                </label>
                <input type="number" name="TotalDays" min="0"
                    value="${p.TotalDays || 0}" class="form-input w-full">
            </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เป้าหมาย Man-Hours</label>
                <input type="number" name="TargetHours" min="0"
                    value="${p.TargetHours || 1000000}" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เป้าหมายวัน</label>
                <input type="number" name="TargetDays" min="0"
                    value="${p.TargetDays || 365}" class="form-input w-full">
            </div>
        </div>
        <div id="perf-form-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()"
                class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="perf-submit" class="btn btn-primary px-5"
                style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก</button>
        </div>
    </form>`;

    openModal('แก้ไข Safety Performance', html, 'max-w-lg');

    if (typeof flatpickr !== 'undefined') {
        flatpickr('#perf-last-date', { locale: 'th', dateFormat: 'Y-m-d' });
    }

    document.getElementById('perf-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('perf-submit');
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>บันทึก...';
        try {
            const fd   = new FormData(e.target);
            const body = Object.fromEntries(fd.entries());
            // Preserve existing monthly status (not edited here — use month grid)
            body.MonthlyStatus = (() => {
                try {
                    const ms = _perfData?.MonthlyStatus;
                    return typeof ms === 'string' ? ms : JSON.stringify(ms || {});
                } catch { return '{}'; }
            })();
            await API.put('/accident/performance', body);
            closeModal();
            showToast('บันทึกข้อมูลสำเร็จ', 'success');
            _perfData = null;
            _summary  = null;
            _loadHeroStats();
            _renderPerformancePanel();
        } catch (err) {
            const el = document.getElementById('perf-form-err');
            if (el) { el.textContent = err.message || 'เกิดข้อผิดพลาด'; el.classList.remove('hidden'); }
            btn.disabled = false;
            btn.textContent = 'บันทึก';
        }
    });
};

window._accToggleMonth = async month => {
    if (!_perfData) return;
    let ms = {};
    try {
        ms = typeof _perfData.MonthlyStatus === 'string'
            ? JSON.parse(_perfData.MonthlyStatus)
            : (_perfData.MonthlyStatus || {});
    } catch { ms = {}; }

    const mo = String(month);
    // Cycle: pending → green → red → pending
    if (!ms[mo] || ms[mo] === 'pending') ms[mo] = 'green';
    else if (ms[mo] === 'green')          ms[mo] = 'red';
    else                                  delete ms[mo];

    _perfData.MonthlyStatus = ms;

    try {
        await API.put('/accident/performance', {
            Year:            _perfData.Year,
            TotalHours:      _perfData.TotalHours,
            TotalDays:       _perfData.TotalDays,
            LastAccidentDate: _perfData.LastAccidentDate,
            TargetHours:     _perfData.TargetHours,
            TargetDays:      _perfData.TargetDays,
            MonthlyStatus:   JSON.stringify(ms),
        });
        _renderPerformancePanel();
    } catch {
        showToast('บันทึกสถานะไม่สำเร็จ', 'error');
        // Revert optimistic update
        _perfData = null;
        _renderPerformancePanel();
    }
};

window._accSearchEmp = val => {
    clearTimeout(_accEmpTimer);
    const dd = document.getElementById('acc-emp-dropdown');
    if (!dd) return;
    if (!val || val.length < 1) { dd.classList.add('hidden'); return; }
    _accEmpTimer = setTimeout(async () => {
        try {
            const res  = await API.get(`/accident/employees?q=${encodeURIComponent(val)}`);
            const emps = res.data || [];
            dd.innerHTML = emps.length === 0
                ? `<div class="px-4 py-3 text-sm text-slate-400">ไม่พบพนักงาน</div>`
                : emps.map(e => `
                    <button type="button" onclick="window._accSelectEmp('${_esc(e.EmployeeID)}','${_esc(e.EmployeeName)}','${_esc(e.Department||'')}','${_esc(e.Position||'')}')"
                        class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-red-50 transition-colors">
                        <div class="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                            <span class="text-xs font-bold text-red-600">${(e.EmployeeName||'?').charAt(0)}</span>
                        </div>
                        <div>
                            <p class="text-sm font-semibold text-slate-800">${e.EmployeeID} · ${e.EmployeeName}</p>
                            <p class="text-xs text-slate-400">${e.Department||''} ${e.Team ? '· '+e.Team : ''}${e.Position ? ' · '+e.Position : ''}</p>
                        </div>
                    </button>`).join('');
            dd.classList.remove('hidden');
        } catch { dd.classList.add('hidden'); }
    }, 250);
};

window._accSelectEmp = (id, name, dept, pos) => {
    const input    = document.getElementById('acc-emp-search');
    const info     = document.getElementById('acc-emp-info');
    const dd       = document.getElementById('acc-emp-dropdown');
    const posInput = document.querySelector('#acc-form [name="Position"]');
    if (input)    input.value = id;
    if (info)     { info.innerHTML = `<svg class="w-3.5 h-3.5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>${_esc(name)} · ${_esc(dept)}`; info.classList.remove('hidden'); }
    if (dd)       dd.classList.add('hidden');
    if (posInput && pos && !posInput.value) posInput.value = pos;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function _spinnerHtml() {
    return `<div class="flex flex-col items-center justify-center h-64 text-slate-400">
        <div class="animate-spin rounded-full h-10 w-10 border-4 border-red-500 border-t-transparent mb-3"></div>
        <p class="text-sm">กำลังโหลดข้อมูล...</p>
    </div>`;
}

function _esc(str) {
    return String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
