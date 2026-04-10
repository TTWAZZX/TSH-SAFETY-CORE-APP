// public/js/pages/yokoten.js
// Yokoten — Lesson Learned Sharing (Enterprise v2)
import { API } from '../api.js';
import {
    hideLoading, showLoading,
    openModal, closeModal, showToast, showConfirmationModal,
} from '../ui.js';
import { normalizeApiArray } from '../utils/normalize.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ['ทั่วไป', 'อุปกรณ์', 'กระบวนการ', 'สิ่งแวดล้อม', 'พฤติกรรม'];
const RISK_LEVELS = [
    { value: 'Low',      label: 'ต่ำ'      },
    { value: 'Medium',   label: 'ปานกลาง'  },
    { value: 'High',     label: 'สูง'       },
    { value: 'Critical', label: 'วิกฤต'    },
];
const RISK_BADGE = {
    Low:      'bg-emerald-100 text-emerald-700',
    Medium:   'bg-yellow-100 text-yellow-700',
    High:     'bg-orange-100 text-orange-700',
    Critical: 'bg-red-100 text-red-700',
};
const RISK_LABEL = { Low: 'ต่ำ', Medium: 'ปานกลาง', High: 'สูง', Critical: 'วิกฤต' };
const CAT_COLORS = ['#6366f1','#0ea5e9','#f59e0b','#10b981','#ef4444'];

// ─── State ────────────────────────────────────────────────────────────────────
let _isAdmin        = false;
let _activeTab      = 'topics';
let _topics         = [];            // GET /yokoten/topics — each has deptResponse
let _history        = [];            // GET /yokoten/dept-history
let _masterDepts    = [];            // GET /master/departments
let _safetyUnits    = [];            // GET /master/safety-units
let _deptCompletion = null;          // GET /yokoten/dept-completion (admin)
let _dashConfig     = {};            // GET /yokoten/dashboard-config
let _allResponses   = [];            // GET /yokoten/all-responses (admin)
let _empCompletion  = null;          // GET /yokoten/employee-completion (admin, lazy)
let _empFilterDept  = '';
let _dashYear       = new Date().getFullYear();
let _filterRisk     = '';
let _filterCat      = '';
let _filterAck      = '';            // 'responded' | 'pending' | 'rejected'
let _histFilterId   = '';
let _searchQ        = '';
let _adminView      = 'topics';      // 'topics' | 'dept' | 'config'
let _listenersReady = false;
let _chartCat       = null;
let _chartDept      = null;

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────
export async function loadYokotenPage() {
    const container = document.getElementById('yokoten-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _isAdmin = user.role === 'Admin' || user.Role === 'Admin';
    window.closeModal = closeModal;

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    _activeTab = window._getTab?.('yokoten', _activeTab) || _activeTab;
    await refreshData();
}

// ─── TAB CONFIG ───────────────────────────────────────────────────────────────
function _getTabs() {
    return [
        {
            id: 'dashboard', label: 'Dashboard',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>`,
        },
        {
            id: 'topics', label: 'หัวข้อ Yokoten',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347A3.001 3.001 0 0112 21a3.001 3.001 0 01-2.789-4.1l-.347-.347z"/>`,
        },
        {
            id: 'history', label: 'ประวัติแผนก',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>`,
        },
        ...(_isAdmin ? [{
            id: 'admin', label: 'จัดการ',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>`,
        }] : []),
    ];
}

// ─── SHELL ────────────────────────────────────────────────────────────────────
function buildShell() {
    const tabHtml = _getTabs().map(t => `
        <button id="yok-tab-btn-${t.id}" data-tab="${t.id}"
            class="yok-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    // Inject RTE + rendered-HTML styles once
    if (!document.getElementById('yok-rte-style')) {
        const s = document.createElement('style');
        s.id = 'yok-rte-style';
        s.textContent = `
            #yt-desc[contenteditable]:empty:not(:focus)::before,
            #yt-desc.rte-empty:not(:focus)::before {
                content: attr(data-placeholder);
                color: #94a3b8;
                pointer-events: none;
            }
            #yt-desc[contenteditable] { outline: none; }
            #yt-desc h3 { font-size: 0.95em; font-weight: 700; margin: 0.3em 0; }
            #yt-desc ul, #yt-desc ol { padding-left: 1.5em; margin: 0.3em 0; }
            #yt-desc li { margin: 0.15em 0; }
            .yok-rte-content h3 { font-size: 0.9em; font-weight: 700; margin: 0.25em 0; color: #1e293b; }
            .yok-rte-content ul, .yok-rte-content ol { padding-left: 1.4em; margin: 0.2em 0; }
            .yok-rte-content li { margin: 0.1em 0; }
            .yok-rte-content b, .yok-rte-content strong { font-weight: 700; }
            .yok-rte-content em { font-style: italic; }
            .yok-rte-content u { text-decoration: underline; }
            .yok-rte-content a { color: #0ea5e9; text-decoration: underline; }
            .yok-rte-content img { max-width: 100%; height: auto; border-radius: 6px; margin: 0.3em 0; display: block; }
            #yt-desc a { color: #0ea5e9; text-decoration: underline; }
            #yt-desc img { max-width: 100%; height: auto; border-radius: 6px; margin: 0.2em 0; display: block; }
            .rte-btn.rte-active { background: #e0f2fe; color: #0284c7; }
        `;
        document.head.appendChild(s);
    }

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- HERO HEADER -->
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="yok-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#yok-dots)"/></svg>
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
                                Yokoten
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">แบ่งปันบทเรียนด้านความปลอดภัย</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Lesson Learned Sharing · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-shrink-0 w-full md:w-auto">
                        <div id="yok-hero-stats" class="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full sm:w-auto">
                            ${[1,2,3,4].map(() => `
                            <div class="rounded-xl px-4 py-3 text-center animate-pulse" style="background:rgba(255,255,255,0.12);min-width:80px">
                                <div class="h-7 bg-white/20 rounded-lg mb-1.5 mx-auto w-10"></div>
                                <div class="h-3 bg-white/15 rounded w-14 mx-auto"></div>
                            </div>`).join('')}
                        </div>
                        ${_isAdmin ? `
                        <button id="yok-add-btn"
                            class="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all border border-white/30 bg-white/15 hover:bg-white/25 whitespace-nowrap">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                            </svg>
                            เพิ่มหัวข้อใหม่
                        </button>` : ''}
                    </div>
                </div>

                <!-- Tab bar -->
                <div class="flex overflow-x-auto gap-0 -mb-px scrollbar-none">
                    ${tabHtml}
                </div>
            </div>
        </div>

        <!-- Tab Content -->
        <div id="yok-content" class="min-h-[400px]">
            ${_spinner()}
        </div>

    </div>`;
}

// ─── TAB SWITCH ───────────────────────────────────────────────────────────────
function switchTab(tab) {
    _activeTab = tab;
    window._saveTab?.('yokoten', tab);

    // destroy charts when leaving dashboard
    if (tab !== 'dashboard') _destroyCharts();

    const active   = 'yok-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white';
    const inactive = 'yok-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';

    _getTabs().forEach(t => {
        const btn = document.getElementById(`yok-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === tab ? active : inactive;
        btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>${t.label}`;
    });

    const content = document.getElementById('yok-content');
    if (!content) return;

    switch (tab) {
        case 'dashboard': renderDashboard(content); break;
        case 'topics':    renderTopics(content);    break;
        case 'history':   renderHistory(content);   break;
        case 'admin':     renderAdmin(content);      break;
    }
}

// ─── DATA REFRESH ─────────────────────────────────────────────────────────────
async function refreshData() {
    showLoading('กำลังโหลด Yokoten...');
    try {
        const base = await Promise.all([
            API.get('/yokoten/topics'),
            API.get('/yokoten/dept-history'),
            API.get('/master/departments'),
            API.get('/master/safety-units'),
            API.get('/yokoten/dashboard-config'),
        ]);
        _topics      = normalizeApiArray(base[0]?.data ?? base[0]);
        _history     = normalizeApiArray(base[1]?.data ?? base[1]);
        _masterDepts = normalizeApiArray(base[2]?.data ?? base[2]);
        _safetyUnits = normalizeApiArray(base[3]?.data ?? base[3]);
        _dashConfig  = base[4]?.data ?? {};

        if (_isAdmin) {
            const [dc, ar] = await Promise.all([
                API.get('/yokoten/dept-completion'),
                API.get('/yokoten/all-responses'),
            ]);
            const raw = dc?.data ?? dc;
            _deptCompletion = raw?.deptSummary ? raw : null;
            _allResponses   = normalizeApiArray(ar?.data ?? ar);
        }
    } catch (err) {
        showToast('โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
    _renderHeroStats();
    switchTab(_activeTab);
}

// ─── HERO STATS STRIP ─────────────────────────────────────────────────────────
function _renderHeroStats() {
    const strip = document.getElementById('yok-hero-stats');
    if (!strip) return;
    const total     = _topics.length;
    const responded = _topics.filter(t => t.deptResponse).length;
    const pending   = total - responded;
    const rejected  = _topics.filter(t => t.deptResponse?.ApprovalStatus === 'rejected').length;
    const near      = _topics.filter(t => !t.deptResponse && _isNearOrOver(t.Deadline)).length;

    const stats = [
        { value: total,     label: 'หัวข้อทั้งหมด',  color: '#6ee7b7' },
        { value: responded, label: 'ตอบกลับแล้ว',    color: '#6ee7b7' },
        { value: pending,   label: 'รอตอบกลับ',      color: pending > 0  ? '#fde68a' : '#6ee7b7' },
        { value: near + rejected, label: 'เร่งด่วน/แก้ไข', color: (near + rejected) > 0 ? '#fca5a5' : '#6ee7b7' },
    ];

    strip.innerHTML = stats.map(s => `
        <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
            <p class="text-2xl font-bold" style="color:${s.color}">${s.value}</p>
            <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${s.label}</p>
        </div>`).join('');
}

// ─── TAB 1: DASHBOARD ────────────────────────────────────────────────────────
function renderDashboard(container) {
    // Year filter — derive available years from topic DateIssued, fallback to current year
    const allYears = [...new Set(_topics.map(t => t.DateIssued ? new Date(t.DateIssued).getFullYear() : null).filter(Boolean))].sort((a, b) => b - a);
    if (allYears.length && !allYears.includes(_dashYear)) _dashYear = allYears[0];
    const topics = allYears.length
        ? _topics.filter(t => !t.DateIssued || new Date(t.DateIssued).getFullYear() === _dashYear)
        : _topics;

    const total     = topics.length;
    const responded = topics.filter(t => t.deptResponse).length;
    const pending   = total - responded;
    const rejected  = topics.filter(t => t.deptResponse?.ApprovalStatus === 'rejected').length;
    const pendingAppr = topics.filter(t => t.deptResponse?.ApprovalStatus === 'pending').length;
    const overdue   = topics.filter(t => !t.deptResponse && _isOverdue(t.Deadline)).length;
    const pct       = total ? Math.round(responded * 100 / total) : 0;
    const barColor  = pct === 100 ? '#059669' : pct >= 60 ? '#0ea5e9' : pct >= 30 ? '#f59e0b' : '#ef4444';

    const catCount = {};
    CATEGORIES.forEach(c => { catCount[c] = 0; });
    topics.forEach(t => { catCount[t.Category || 'ทั่วไป'] = (catCount[t.Category || 'ทั่วไป'] || 0) + 1; });

    const riskCount = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    topics.forEach(t => { if (riskCount[t.RiskLevel] !== undefined) riskCount[t.RiskLevel]++; });

    // Pinned depts (from dashConfig)
    const pinnedDepts  = Array.isArray(_dashConfig.pinnedDepts)  ? _dashConfig.pinnedDepts  : [];

    // Urgent topics: rejected + overdue (no response)
    const urgentTopics = topics
        .filter(t => t.deptResponse?.ApprovalStatus === 'rejected' || (!t.deptResponse && _isNearOrOver(t.Deadline)))
        .sort((a, b) => {
            const score = t => t.deptResponse?.ApprovalStatus === 'rejected' ? 10 : _urgency(t.Deadline);
            return score(b) - score(a);
        });

    const yearPickerHtml = allYears.length > 1 ? `
        <div class="card p-3 flex items-center gap-3">
            <svg class="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <span class="text-xs font-semibold text-slate-500">ปีงบประมาณ</span>
            <div class="flex gap-1.5 flex-wrap">
                ${allYears.map(y => `
                <button class="yok-year-btn px-3 py-1 rounded-lg text-xs font-semibold transition-all ${y === _dashYear ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 bg-slate-50'}"
                        data-year="${y}"
                        ${y === _dashYear ? 'style="background:linear-gradient(135deg,#0ea5e9,#6366f1)"' : ''}>
                    ${y}
                </button>`).join('')}
            </div>
            <span class="ml-auto text-xs text-slate-400">${total} หัวข้อในปี ${_dashYear}</span>
        </div>` : '';

    container.innerHTML = `
    <div class="space-y-5">

        ${yearPickerHtml}

        <!-- KPI Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            ${_kpiCard(total,     'หัวข้อทั้งหมด',   '#0ea5e9', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347A3.001 3.001 0 0112 21a3.001 3.001 0 01-2.789-4.1l-.347-.347z"/>`, 'sky')}
            ${_kpiCard(responded, 'ส่วนงานตอบแล้ว',  '#059669', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>`,  'emerald')}
            ${_kpiCard(pending,   'รอตอบกลับ',       '#f59e0b', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>`,  'amber')}
            ${_kpiCard(rejected + overdue, 'เร่งด่วน/แก้ไข', '#ef4444', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>`, 'red')}
        </div>

        <!-- Progress + Charts -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- Progress -->
            <div class="card p-5 md:col-span-1 flex flex-col justify-center">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <svg class="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                        </svg>
                        ความคืบหน้า
                    </h3>
                    <span class="text-2xl font-black" style="color:${barColor}">${pct}%</span>
                </div>
                <div class="h-3 rounded-full bg-slate-100 overflow-hidden mb-2">
                    <div class="h-full rounded-full transition-all duration-700"
                         style="width:${pct}%;background:linear-gradient(90deg,#0ea5e9,#6366f1)"></div>
                </div>
                <p class="text-xs text-slate-400 mb-4">ตอบกลับ ${responded} จาก ${total} หัวข้อ</p>
                ${pendingAppr > 0 ? `<p class="text-xs text-yellow-600 font-medium mb-3">รอการอนุมัติ ${pendingAppr} รายการ</p>` : ''}
                <!-- Risk breakdown -->
                <div class="space-y-1.5">
                    ${['Critical','High','Medium','Low'].map(r => {
                        const cnt = riskCount[r] || 0;
                        if (!cnt) return '';
                        const pctR = total ? Math.round(cnt * 100 / total) : 0;
                        const colors = { Critical:'#ef4444', High:'#f97316', Medium:'#f59e0b', Low:'#10b981' };
                        return `<div class="flex items-center gap-2 text-xs">
                            <span class="w-14 text-slate-500 flex-shrink-0">${RISK_LABEL[r]}</span>
                            <div class="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div class="h-full rounded-full" style="width:${pctR}%;background:${colors[r]}"></div>
                            </div>
                            <span class="w-5 text-right font-medium text-slate-600">${cnt}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <!-- Category donut chart -->
            <div class="card p-5 md:col-span-2">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <svg class="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/>
                        </svg>
                        สัดส่วนตามหมวดหมู่
                    </h3>
                    ${_isAdmin ? `
                    <button id="yok-config-dash-btn"
                        class="text-xs text-sky-600 hover:underline font-medium flex items-center gap-1">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                        ตั้งค่า Dashboard
                    </button>` : ''}
                </div>
                <div class="flex items-center gap-6">
                    <div class="flex-shrink-0" style="width:140px;height:140px">
                        <canvas id="yok-cat-chart"></canvas>
                    </div>
                    <div class="flex-1 space-y-2">
                        ${CATEGORIES.map((c, i) => {
                            const cnt = catCount[c] || 0;
                            if (!cnt && total > 0) return '';
                            const pctC = total ? Math.round(cnt * 100 / total) : 0;
                            return `<div class="flex items-center gap-2 text-xs">
                                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${CAT_COLORS[i]}"></span>
                                <span class="flex-1 text-slate-600 truncate">${c}</span>
                                <span class="font-bold text-slate-700">${cnt}</span>
                                <span class="text-slate-400 w-8 text-right">${pctC}%</span>
                            </div>`;
                        }).filter(Boolean).join('')}
                        ${!total ? '<p class="text-sm text-slate-400">ยังไม่มีหัวข้อ</p>' : ''}
                    </div>
                </div>
            </div>
        </div>

        <!-- Pinned Departments -->
        ${pinnedDepts.length > 0 ? `
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <svg class="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                </svg>
                <h3 class="text-sm font-bold text-slate-700">ส่วนงานที่ติดตาม</h3>
                <span class="text-xs text-slate-400">(${pinnedDepts.length} ส่วนงาน)</span>
            </div>
            <div class="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                ${pinnedDepts.map(dept => {
                    const deptData = _deptCompletion?.deptSummary?.find(d => d.department === dept);
                    const pctD = deptData?.completionPct ?? null;
                    const respondedD = deptData?.respondedCount ?? 0;
                    const totalD = deptData?.totalTopics ?? total;
                    const pendingApprD = deptData?.pendingApproval ?? 0;
                    const rejectedD = deptData?.rejected ?? 0;
                    const color = pctD === 100 ? '#059669' : pctD >= 60 ? '#0ea5e9' : pctD >= 30 ? '#f59e0b' : '#ef4444';
                    return `
                    <div class="rounded-xl p-4 border border-slate-200 bg-white shadow-sm">
                        <div class="flex items-center justify-between mb-2">
                            <p class="text-sm font-semibold text-slate-700 truncate">${_esc(dept)}</p>
                            <span class="text-lg font-black flex-shrink-0 ml-2" style="color:${color}">${pctD !== null ? pctD + '%' : '-'}</span>
                        </div>
                        ${pctD !== null ? `
                        <div class="h-2 rounded-full bg-slate-100 overflow-hidden mb-2">
                            <div class="h-full rounded-full" style="width:${pctD}%;background:${color}"></div>
                        </div>` : ''}
                        <p class="text-xs text-slate-500">${respondedD}/${totalD} หัวข้อ
                            ${pendingApprD > 0 ? `· <span class="text-yellow-600">${pendingApprD} รออนุมัติ</span>` : ''}
                            ${rejectedD > 0 ? `· <span class="text-red-600">${rejectedD} ส่งกลับแก้ไข</span>` : ''}
                        </p>
                    </div>`;
                }).join('')}
            </div>
        </div>` : ''}

        <!-- Urgent / action required -->
        ${urgentTopics.length > 0 ? `
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">ต้องดำเนินการ (${urgentTopics.length})</h3>
                </div>
                <button class="text-xs text-sky-600 hover:underline font-medium" data-switch-tab="topics">ดูทั้งหมด</button>
            </div>
            <div class="divide-y divide-slate-100">
                ${urgentTopics.slice(0, 5).map(t => {
                    const isRejected = t.deptResponse?.ApprovalStatus === 'rejected';
                    return `
                    <div class="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-slate-800 truncate">${_esc(t.Title || _htmlToText(t.TopicDescription))}</p>
                            <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span class="px-1.5 py-0.5 rounded text-xs font-medium ${RISK_BADGE[t.RiskLevel] || 'bg-slate-100 text-slate-500'}">${RISK_LABEL[t.RiskLevel] || t.RiskLevel}</span>
                                ${isRejected
                                    ? `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">ถูกส่งกลับแก้ไข</span>`
                                    : _deadlineBadge(t.Deadline, false)}
                            </div>
                        </div>
                        <button class="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                                style="background:linear-gradient(135deg,#0ea5e9,#6366f1)"
                                data-switch-tab="topics">ดูหัวข้อ</button>
                    </div>`;
                }).join('')}
            </div>
        </div>` : responded === total && total > 0 ? `
        <div class="text-center py-12 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
            </div>
            <p class="font-semibold text-emerald-700">ตอบกลับครบทุกหัวข้อแล้ว!</p>
        </div>` : ''}

        ${_isAdmin && _deptCompletion?.deptSummary?.length ? _buildExecSection() : ''}
    </div>`;

    setTimeout(() => { _initCatChart(catCount); _initDeptChart(); }, 0);
}

function _initCatChart(catCount) {
    if (_chartCat) { _chartCat.destroy(); _chartCat = null; }
    const canvas = document.getElementById('yok-cat-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const labels = CATEGORIES.filter(c => (catCount[c] || 0) > 0);
    const data   = labels.map(c => catCount[c]);
    const colors = labels.map(c => CAT_COLORS[CATEGORIES.indexOf(c)]);
    _chartCat = new Chart(canvas, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
        options: {
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} หัวข้อ` } },
            },
            animation: { animateRotate: true, duration: 600 },
        },
    });
}

function _destroyCharts() {
    if (_chartCat)  { _chartCat.destroy();  _chartCat  = null; }
    if (_chartDept) { _chartDept.destroy(); _chartDept = null; }
}

// ─── EXECUTIVE DASHBOARD HELPERS ─────────────────────────────────────────────
function _buildExecSection() {
    const { deptSummary: rawDeptSummary, topics } = _deptCompletion;
    // Only show depts that are actually targeted by at least one topic (master-data driven)
    const deptSummary = _filterToTargetedDepts(rawDeptSummary, topics);

    const allResp      = _allResponses || [];
    const autoApproved = allResp.filter(r => r.IsRelated === 'Yes' && !r.ApprovalStatus).length;
    const pendingAppr  = allResp.filter(r => r.ApprovalStatus === 'pending').length;
    const approved     = allResp.filter(r => r.ApprovalStatus === 'approved').length;
    const rejected     = allResp.filter(r => r.ApprovalStatus === 'rejected').length;
    // Sum actual totalTopics per targeted dept
    const totalPossible = deptSummary.reduce((s, d) => s + (d.totalTopics || 0), 0);
    const notResponded  = Math.max(0, totalPossible - allResp.length);

    const fullD    = deptSummary.filter(d => d.completionPct === 100).length;
    const partialD = deptSummary.filter(d => d.completionPct > 0 && d.completionPct < 100).length;
    const zeroD    = deptSummary.filter(d => d.completionPct === 0).length;
    const chartH   = Math.max(200, Math.min(deptSummary.length * 26, 520));

    // ── Risk-level compliance (per-topic targeted depts only) ─────────────────
    const riskCompliance = ['Critical','High','Medium','Low'].map(risk => {
        const rTopics = topics.filter(t => t.RiskLevel === risk);
        if (!rTopics.length) return null;
        let responded = 0, total = 0;
        rTopics.forEach(t => {
            const targeted = _getTopicTargetedDepts(deptSummary, t);
            targeted.forEach(d => {
                total++;
                if (d.topicBreakdown.some(tb => tb.YokotenID === t.YokotenID && tb.responded)) responded++;
            });
        });
        const pct = total > 0 ? Math.round(responded * 100 / total) : 0;
        return { risk, topicCount: rTopics.length, pct, responded, total };
    }).filter(Boolean);

    // ── Avg response time (ResponseDate - topic DateIssued) ────────────────────
    const avgDays = (() => {
        let sum = 0, count = 0;
        allResp.forEach(r => {
            const topic = topics.find(t => t.YokotenID === r.YokotenID);
            if (topic?.DateIssued && r.ResponseDate) {
                const days = Math.round((new Date(r.ResponseDate) - new Date(topic.DateIssued)) / 86400000);
                if (days >= 0 && days < 730) { sum += days; count++; }
            }
        });
        return count > 0 ? Math.round(sum / count) : null;
    })();

    // ── Deadline alerts — use per-topic targeted depts ─────────────────────────
    const now = Date.now();
    const alertTopics = topics
        .filter(t => {
            if (!t.Deadline) return false;
            const daysLeft = Math.ceil((new Date(t.Deadline) - now) / 86400000);
            if (daysLeft > 14) return false;
            const targeted = _getTopicTargetedDepts(deptSummary, t);
            if (!targeted.length) return false;
            const respondedCount = targeted.filter(d =>
                d.topicBreakdown.some(tb => tb.YokotenID === t.YokotenID && tb.responded)
            ).length;
            return respondedCount < targeted.length;
        })
        .map(t => {
            const daysLeft   = Math.ceil((new Date(t.Deadline) - now) / 86400000);
            const targeted   = _getTopicTargetedDepts(deptSummary, t);
            const respondedDepts = targeted.filter(d =>
                d.topicBreakdown.some(tb => tb.YokotenID === t.YokotenID && tb.responded)
            ).length;
            return { ...t, daysLeft, respondedDepts, targetDepts: targeted.length };
        })
        .sort((a, b) => a.daysLeft - b.daysLeft);

    const riskColors = { Critical: { bg: '#fef2f2', text: '#dc2626', bar: '#ef4444' }, High: { bg: '#fff7ed', text: '#ea580c', bar: '#f97316' }, Medium: { bg: '#fffbeb', text: '#d97706', bar: '#f59e0b' }, Low: { bg: '#f0fdf4', text: '#059669', bar: '#10b981' } };

    return `
    <div class="flex items-center gap-3">
        <div class="h-px flex-1 bg-slate-200"></div>
        <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">ภาพรวมผู้บริหาร</span>
        <div class="h-px flex-1 bg-slate-200"></div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Dept completion horizontal bar chart (2/3 width) -->
        <div class="card p-5 lg:col-span-2">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                    ความคืบหน้ารายส่วนงาน
                </h3>
                <div class="flex items-center gap-3 text-xs text-slate-400">
                    <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full inline-block" style="background:#059669"></span>100%</span>
                    <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full inline-block" style="background:#f59e0b"></span>บางส่วน</span>
                    <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full inline-block" style="background:#ef4444"></span>ยังไม่ตอบ</span>
                </div>
            </div>
            <div style="height:${chartH}px">
                <canvas id="yok-dept-chart"></canvas>
            </div>
        </div>

        <!-- Approval funnel (1/3 width) -->
        <div class="card p-5 flex flex-col">
            <h3 class="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <svg class="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                </svg>
                สถานะการตอบกลับ
            </h3>
            <div class="space-y-3 flex-1">
                ${_approvalFunnelBar(notResponded,  totalPossible, '#e2e8f0', '#94a3b8', 'ยังไม่ตอบ')}
                ${_approvalFunnelBar(autoApproved,  totalPossible, '#dcfce7', '#059669', 'เกี่ยวข้อง (อัตโนมัติ)')}
                ${_approvalFunnelBar(pendingAppr,   totalPossible, '#fef9c3', '#d97706', 'รออนุมัติ')}
                ${_approvalFunnelBar(approved,      totalPossible, '#dbeafe', '#2563eb', 'อนุมัติแล้ว')}
                ${_approvalFunnelBar(rejected,      totalPossible, '#fee2e2', '#dc2626', 'ถูกส่งกลับแก้ไข')}
            </div>
            <div class="mt-4 pt-3 border-t border-slate-100 space-y-1">
                <div class="flex items-center justify-between text-xs">
                    <span class="text-slate-400">รวมทั้งหมดที่เป็นไปได้</span>
                    <span class="font-semibold text-slate-700">${totalPossible} รายการ</span>
                </div>
                <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full rounded-full" style="width:${totalPossible > 0 ? Math.round(allResp.length * 100 / totalPossible) : 0}%;background:linear-gradient(90deg,#0ea5e9,#6366f1)"></div>
                </div>
                <p class="text-xs text-slate-400 text-right">${totalPossible > 0 ? Math.round(allResp.length * 100 / totalPossible) : 0}% ตอบกลับแล้ว</p>
            </div>
        </div>
    </div>

    <!-- Risk Compliance + Deadline Alerts row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Risk-level compliance -->
        <div class="card p-5">
            <h3 class="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <svg class="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                การตอบรับตามระดับความเสี่ยง
            </h3>
            ${riskCompliance.length ? `
            <div class="space-y-3">
                ${riskCompliance.map(rc => {
                    const c = riskColors[rc.risk] || { bg: '#f8fafc', text: '#64748b', bar: '#94a3b8' };
                    return `
                <div class="rounded-xl p-3" style="background:${c.bg}">
                    <div class="flex items-center justify-between mb-1.5">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold" style="color:${c.text}">${RISK_LABEL[rc.risk]}</span>
                            <span class="text-xs text-slate-400">${rc.topicCount} หัวข้อ · ${rc.responded}/${rc.total} การตอบ</span>
                        </div>
                        <span class="text-sm font-black" style="color:${c.text}">${rc.pct}%</span>
                    </div>
                    <div class="h-2 rounded-full bg-white overflow-hidden">
                        <div class="h-full rounded-full transition-all" style="width:${rc.pct}%;background:${c.bar}"></div>
                    </div>
                </div>`;
                }).join('')}
            </div>` : '<p class="text-sm text-slate-400 py-4 text-center">ยังไม่มีข้อมูล</p>'}
        </div>

        <!-- Deadline alerts -->
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <svg class="w-4 h-4 ${alertTopics.length > 0 ? 'text-red-500' : 'text-slate-300'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <h3 class="text-sm font-bold text-slate-700">หัวข้อใกล้ครบกำหนด / เกินกำหนด</h3>
                ${alertTopics.length > 0 ? `<span class="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">${alertTopics.length}</span>` : ''}
            </div>
            ${alertTopics.length ? `
            <div class="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                ${alertTopics.map(t => {
                    const overdue = t.daysLeft < 0;
                    const today   = t.daysLeft === 0;
                    const tagBg   = overdue ? '#fef2f2' : today ? '#fff7ed' : '#fffbeb';
                    const tagTxt  = overdue ? '#dc2626'  : today ? '#ea580c'  : '#d97706';
                    const tagLabel = overdue ? `เกิน ${Math.abs(t.daysLeft)} วัน` : today ? 'วันนี้' : `อีก ${t.daysLeft} วัน`;
                    const missingPct = t.targetDepts > 0 ? Math.round((t.targetDepts - t.respondedDepts) * 100 / t.targetDepts) : 0;
                    return `
                <div class="px-5 py-3 flex items-center gap-3">
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-slate-700 truncate">${_esc(t.Title || _htmlToText(t.TopicDescription))}</p>
                        <div class="flex items-center gap-2 mt-0.5">
                            <span class="text-[10px] px-1.5 py-0.5 rounded font-semibold ${RISK_BADGE[t.RiskLevel] || 'bg-slate-100 text-slate-500'}">${RISK_LABEL[t.RiskLevel] || t.RiskLevel}</span>
                            <span class="text-[10px] text-slate-400">${t.respondedDepts}/${t.targetDepts} ส่วนงานตอบ</span>
                        </div>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <span class="text-xs font-bold px-2 py-1 rounded-lg" style="background:${tagBg};color:${tagTxt}">${tagLabel}</span>
                        <p class="text-[10px] text-slate-400 mt-1">ขาด ${missingPct}%</p>
                    </div>
                </div>`;
                }).join('')}
            </div>` : `
            <div class="py-10 text-center text-slate-400">
                <svg class="w-8 h-8 mx-auto mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p class="text-sm font-medium text-emerald-600">ไม่มีหัวข้อที่ใกล้ครบกำหนด</p>
            </div>`}
        </div>
    </div>

    <!-- Completion chips summary -->
    <div class="card p-4">
        <div class="flex flex-wrap items-center gap-4">
            <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-emerald-700" style="background:#f0fdf4">${fullD}</div>
                <span class="text-xs text-slate-500">ตอบครบ 100%</span>
            </div>
            <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-amber-600" style="background:#fffbeb">${partialD}</div>
                <span class="text-xs text-slate-500">ตอบบางส่วน</span>
            </div>
            <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-red-600" style="background:#fef2f2">${zeroD}</div>
                <span class="text-xs text-slate-500">ยังไม่ตอบ</span>
            </div>
            <div class="h-6 w-px bg-slate-200 mx-1"></div>
            <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-amber-600" style="background:#fef9c3">${pendingAppr}</div>
                <span class="text-xs text-slate-500">รออนุมัติ</span>
            </div>
            ${avgDays !== null ? `
            <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-sky-600" style="background:#f0f9ff">${avgDays}</div>
                <span class="text-xs text-slate-500">วันเฉลี่ยในการตอบ</span>
            </div>` : ''}
            <div class="flex items-center gap-2.5 ml-auto">
                <button class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all"
                        id="yok-pdf-btn-dash"
                        style="background:linear-gradient(135deg,#dc2626,#9f1239)">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                    </svg>
                    Export PDF
                </button>
            </div>
        </div>
    </div>`;
}

function _approvalFunnelBar(count, total, bg, color, label) {
    const pct = total > 0 ? Math.round(count * 100 / total) : 0;
    return `
    <div>
        <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-slate-500">${label}</span>
            <span class="text-xs font-bold" style="color:${color}">${count}</span>
        </div>
        <div class="h-2 rounded-full overflow-hidden" style="background:${bg}">
            <div class="h-full rounded-full" style="width:${pct}%;background:${color}"></div>
        </div>
    </div>`;
}

function _initDeptChart() {
    if (_chartDept) { _chartDept.destroy(); _chartDept = null; }
    const canvas = document.getElementById('yok-dept-chart');
    if (!canvas || !_deptCompletion?.deptSummary?.length || typeof Chart === 'undefined') return;

    // Only chart depts targeted by at least one topic
    const filtered = _filterToTargetedDepts(_deptCompletion.deptSummary, _deptCompletion.topics || []);
    const sorted = [...filtered].sort((a, b) => a.completionPct - b.completionPct);
    const labels  = sorted.map(d => d.department);
    const data    = sorted.map(d => d.completionPct);
    const colors  = sorted.map(d =>
        d.completionPct === 100 ? '#059669' :
        d.completionPct >= 50   ? '#f59e0b' : '#ef4444'
    );

    _chartDept = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderRadius: 4,
                borderSkipped: false,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const dept = _deptCompletion.deptSummary.find(d => d.department === ctx.label);
                            return ` ${ctx.raw}% · ${dept?.respondedCount || 0}/${dept?.totalTopics || 0} หัวข้อ`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    min: 0,
                    max: 100,
                    ticks: { callback: v => v + '%', font: { size: 10 } },
                    grid: { color: '#f1f5f9' },
                },
                y: {
                    ticks: {
                        font: { size: 10 },
                        callback: function(val) {
                            const name = this.getLabelForValue(val);
                            return name.length > 22 ? name.slice(0, 21) + '…' : name;
                        },
                    },
                    grid: { display: false },
                },
            },
        },
    });
}

// ─── TAB 2: TOPICS ────────────────────────────────────────────────────────────
function renderTopics(container) {
    // ── Year filter (shared state with dashboard) ──────────────────────────
    const allYears = [...new Set(_topics.map(t => t.DateIssued ? new Date(t.DateIssued).getFullYear() : null).filter(Boolean))].sort((a, b) => b - a);
    if (allYears.length && !allYears.includes(_dashYear)) _dashYear = allYears[0];
    const yearBase = allYears.length
        ? _topics.filter(t => !t.DateIssued || new Date(t.DateIssued).getFullYear() === _dashYear)
        : [..._topics];

    // ── Apply filters ──────────────────────────────────────────────────────
    let filtered = [...yearBase];
    if (_filterRisk) filtered = filtered.filter(t => t.RiskLevel === _filterRisk);
    if (_filterCat)  filtered = filtered.filter(t => (t.Category || 'ทั่วไป') === _filterCat);
    if (_filterAck === 'pending')   filtered = filtered.filter(t => !t.deptResponse);
    if (_filterAck === 'responded') filtered = filtered.filter(t => !!t.deptResponse);
    if (_filterAck === 'rejected')  filtered = filtered.filter(t => t.deptResponse?.ApprovalStatus === 'rejected');
    if (_searchQ.trim()) {
        const q = _searchQ.trim().toLowerCase();
        filtered = filtered.filter(t =>
            (t.Title || '').toLowerCase().includes(q) ||
            (t.TopicDescription || '').toLowerCase().includes(q)
        );
    }

    // Sort: rejected → overdue → near → pending → responded
    filtered.sort((a, b) => {
        const score = topic => {
            if (topic.deptResponse?.ApprovalStatus === 'rejected') return 10;
            if (!topic.deptResponse) return _urgency(topic.Deadline);
            return -1;
        };
        return score(b) - score(a);
    });

    // ── Mini KPI strip (from year-filtered base, before other filters) ──────
    const yTotal     = yearBase.length;
    const yResponded = yearBase.filter(t => t.deptResponse).length;
    const yPending   = yTotal - yResponded;
    const yUrgent    = yearBase.filter(t =>
        t.deptResponse?.ApprovalStatus === 'rejected' || (!t.deptResponse && _isNearOrOver(t.Deadline))
    ).length;
    const yPct       = yTotal ? Math.round(yResponded * 100 / yTotal) : 0;

    // ── Year picker HTML ──────────────────────────────────────────────────
    const yearPickerHtml = allYears.length > 1 ? `
    <div class="card p-3 flex flex-wrap items-center gap-3">
        <svg class="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        <span class="text-xs font-semibold text-slate-500">ปีงบประมาณ</span>
        <div class="flex gap-1.5 flex-wrap">
            ${allYears.map(y => `
            <button class="yok-year-btn px-3 py-1 rounded-lg text-xs font-semibold transition-all ${y === _dashYear ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 bg-slate-50'}"
                    data-year="${y}"
                    ${y === _dashYear ? 'style="background:linear-gradient(135deg,#0ea5e9,#6366f1)"' : ''}>
                ${y}
            </button>`).join('')}
        </div>
        <span class="ml-auto text-xs text-slate-400">${yTotal} หัวข้อในปี ${_dashYear}</span>
    </div>` : '';

    container.innerHTML = `
    <div class="space-y-4">

        ${yearPickerHtml}

        <!-- Mini KPI strip -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="card px-4 py-3 flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center bg-sky-50 flex-shrink-0">
                    <svg class="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347A3.001 3.001 0 0112 21a3.001 3.001 0 01-2.789-4.1l-.347-.347z"/>
                    </svg>
                </div>
                <div><p class="text-xl font-bold text-slate-800">${yTotal}</p><p class="text-xs text-slate-500">หัวข้อทั้งหมด</p></div>
            </div>
            <div class="card px-4 py-3 flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-50 flex-shrink-0">
                    <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <div><p class="text-xl font-bold text-slate-800">${yResponded}</p><p class="text-xs text-slate-500">ตอบแล้ว (${yPct}%)</p></div>
            </div>
            <div class="card px-4 py-3 flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-50 flex-shrink-0">
                    <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <div><p class="text-xl font-bold text-slate-800">${yPending}</p><p class="text-xs text-slate-500">รอตอบกลับ</p></div>
            </div>
            <div class="card px-4 py-3 flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center ${yUrgent > 0 ? 'bg-red-50' : 'bg-slate-50'} flex-shrink-0">
                    <svg class="w-4 h-4 ${yUrgent > 0 ? 'text-red-500' : 'text-slate-300'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                </div>
                <div><p class="text-xl font-bold text-slate-800">${yUrgent}</p><p class="text-xs text-slate-500">เร่งด่วน/แก้ไข</p></div>
            </div>
        </div>

        <!-- Filter bar -->
        <div class="card p-4">
            <div class="flex flex-wrap gap-3 items-center">
                <select id="yok-filter-risk" class="form-input py-1.5 text-sm">
                    <option value="">ทุกระดับความเสี่ยง</option>
                    ${RISK_LEVELS.map(r => `<option value="${r.value}" ${_filterRisk === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
                </select>
                <select id="yok-filter-cat" class="form-input py-1.5 text-sm">
                    <option value="">ทุกหมวดหมู่</option>
                    ${CATEGORIES.map(c => `<option value="${c}" ${_filterCat === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
                <select id="yok-filter-ack" class="form-input py-1.5 text-sm">
                    <option value="">ทุกสถานะ</option>
                    <option value="pending"   ${_filterAck === 'pending'   ? 'selected' : ''}>รอตอบกลับ</option>
                    <option value="responded" ${_filterAck === 'responded' ? 'selected' : ''}>ตอบกลับแล้ว</option>
                    <option value="rejected"  ${_filterAck === 'rejected'  ? 'selected' : ''}>ถูกส่งกลับแก้ไข</option>
                </select>
                <div class="relative flex-1 min-w-[160px]">
                    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input id="yok-search" type="text" placeholder="ค้นหาหัวข้อ..."
                           value="${_esc(_searchQ)}" class="form-input w-full pl-9 text-sm py-1.5">
                </div>
                <span class="text-xs text-slate-400 ml-auto">${filtered.length} หัวข้อ</span>
            </div>
        </div>

        <!-- Topic grid -->
        ${filtered.length
            ? `<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" id="yok-topic-list">${filtered.map(t => _buildTopicSummaryCard(t)).join('')}</div>`
            : `<div class="text-center py-16 text-slate-400">
                   <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                       <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                       </svg>
                   </div>
                   <p class="font-medium">ไม่มีหัวข้อที่ตรงกับเงื่อนไข</p>
               </div>`}
    </div>`;
}

// ─── TOPIC SUMMARY CARD (grid view) ──────────────────────────────────────────
function _buildTopicSummaryCard(t) {
    const dr        = t.deptResponse;
    const responded = !!dr;
    const approval  = dr?.ApprovalStatus || null;
    const rejected  = approval === 'rejected';
    const pending   = approval === 'pending';
    const urgency   = !responded && _isOverdue(t.Deadline)      ? 'overdue'
                    : !responded && _isNearDeadline(t.Deadline)  ? 'near' : '';

    const accentColor = rejected || urgency === 'overdue'
        ? 'linear-gradient(90deg,#ef4444,#dc2626)'
        : urgency === 'near'
        ? 'linear-gradient(90deg,#f97316,#ef4444)'
        : responded
        ? 'linear-gradient(90deg,#059669,#0d9488)'
        : 'linear-gradient(90deg,#0ea5e9,#6366f1)';

    const statusBadge = rejected
        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700"><span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>ส่งกลับแก้ไข</span>`
        : pending
        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700"><span class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>รออนุมัติ</span>`
        : responded
        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>ตอบแล้ว</span>`
        : urgency === 'overdue'
        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600"><span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>เกินกำหนด</span>`
        : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>รอตอบกลับ</span>`;

    const targetDeptCount = (Array.isArray(t.TargetDepts) && t.TargetDepts.length > 0)
        ? t.TargetDepts.length : _masterDepts.length;
    const respondedCount  = t.totalDeptCount || 0;
    const deptPct  = targetDeptCount > 0 ? Math.round(respondedCount * 100 / targetDeptCount) : 0;
    const barColor = deptPct === 100 ? '#059669' : deptPct >= 50 ? '#f59e0b' : '#94a3b8';
    const btnLabel = responded ? 'ดูรายละเอียด' : 'ดู / ตอบกลับ';

    return `
    <div class="card overflow-hidden flex flex-col">
        <div class="h-1.5 w-full flex-shrink-0" style="background:${accentColor}"></div>
        <div class="p-4 flex flex-col flex-1 gap-0">
            <!-- Badges row -->
            <div class="flex flex-wrap items-center gap-1.5 mb-2.5">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_BADGE[t.RiskLevel] || 'bg-slate-100 text-slate-500'}">
                    <span class="w-1.5 h-1.5 rounded-full" style="background:currentColor"></span>
                    ${RISK_LABEL[t.RiskLevel] || t.RiskLevel}
                </span>
                <span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">${_esc(t.Category || 'ทั่วไป')}</span>
                <span class="flex-1"></span>
                ${_deadlineBadge(t.Deadline, responded)}
            </div>

            <!-- Title (2-line clamp) -->
            <h3 class="font-semibold text-slate-800 text-sm leading-snug mb-1.5"
                style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.4em">
                ${_esc(t.Title || _htmlToText(t.TopicDescription))}
            </h3>

            <!-- Description preview: plain text, 1 line (strip HTML tags) -->
            ${t.Title
                ? `<p class="text-xs text-slate-400 truncate mb-3">${_esc(_htmlToText(t.TopicDescription))}</p>`
                : '<div class="mb-3"></div>'}

            <!-- Dept progress -->
            <div class="mb-4">
                <div class="flex items-center justify-between text-xs mb-1">
                    <span class="text-slate-400">ส่วนงานตอบ</span>
                    <span class="font-semibold text-slate-600">${respondedCount} / ${targetDeptCount}</span>
                </div>
                <div class="h-1.5 rounded-full overflow-hidden" style="background:#f1f5f9">
                    <div class="h-full rounded-full transition-all" style="width:${deptPct}%;background:${barColor}"></div>
                </div>
            </div>

            <!-- Bottom: status badge + action button -->
            <div class="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                ${statusBadge}
                <button class="yok-view-topic-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0 hover:opacity-90 transition-all"
                        style="background:linear-gradient(135deg,#0ea5e9,#6366f1)"
                        data-yid="${t.YokotenID}">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                    ${btnLabel}
                </button>
            </div>
        </div>
    </div>`;
}

// ─── TOPIC DETAIL MODAL ───────────────────────────────────────────────────────
function _buildTopicModal(t) {
    const dr          = t.deptResponse;
    const approval    = dr?.ApprovalStatus || null;
    const pending     = approval === 'pending';
    const targetDepts = Array.isArray(t.TargetDepts) ? t.TargetDepts : [];
    const targetUnits = Array.isArray(t.TargetUnits) ? t.TargetUnits : [];
    const yid         = t.YokotenID;
    const urgency     = !dr && _isOverdue(t.Deadline) ? 'overdue'
                      : !dr && _isNearDeadline(t.Deadline) ? 'near' : '';
    const accentBg    = urgency === 'overdue' || approval === 'rejected'
        ? 'linear-gradient(135deg,#fef2f2,#fff1f2)'
        : !dr ? 'linear-gradient(135deg,#f0f9ff,#eff6ff)'
        : 'linear-gradient(135deg,#f0fdf4,#ecfdf5)';

    return `
    <div data-yok-modal="1" class="space-y-4">

        <!-- Topic info panel -->
        <div class="rounded-xl p-4 border border-slate-200" style="background:${accentBg}">
            <div class="flex flex-wrap items-center gap-2 mb-2">
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${RISK_BADGE[t.RiskLevel] || 'bg-slate-100 text-slate-500'}">
                    <span class="w-1.5 h-1.5 rounded-full" style="background:currentColor"></span>
                    ${RISK_LABEL[t.RiskLevel] || t.RiskLevel}
                </span>
                <span class="px-2 py-0.5 rounded-full text-xs bg-white border border-slate-200 text-slate-600">${_esc(t.Category || 'ทั่วไป')}</span>
                ${_deadlineBadge(t.Deadline, !!dr)}
            </div>

            ${t.Title ? `<h2 class="font-bold text-slate-800 text-base leading-snug mb-1">${_esc(t.Title)}</h2>` : ''}
            <div class="text-sm text-slate-600 leading-relaxed yok-rte-content">${_sanitizeHtml(t.TopicDescription || '')}</div>

            ${t.AttachmentUrl ? `
            <a href="${t.AttachmentUrl}" target="_blank" rel="noopener noreferrer"
               class="inline-flex items-center gap-1.5 text-xs text-sky-600 hover:underline mt-2">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                </svg>
                ${_esc(t.AttachmentName || 'ดูไฟล์แนบ')}
            </a>` : ''}

            <div class="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-slate-200 text-xs text-slate-400">
                <span>ประกาศ: <span class="text-slate-600 font-medium">${_fmtDate(t.DateIssued)}</span></span>
                <span>ตอบแล้ว: <span class="text-slate-600 font-medium">${t.totalDeptCount || 0} ส่วนงาน</span></span>
                ${t.CreatedBy ? `<span>โดย: <span class="text-slate-600 font-medium">${_esc(t.CreatedBy)}</span></span>` : ''}
            </div>

            ${targetDepts.length > 0 ? `
            <div class="flex flex-wrap gap-1 mt-2">
                <span class="text-[10px] text-slate-400 self-center mr-0.5">ส่วนงานที่กำหนด:</span>
                ${targetDepts.map(d => `<span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-600 border border-sky-100">${_esc(d)}</span>`).join('')}
            </div>` : ''}
            ${targetUnits.length > 0 ? `
            <div class="flex flex-wrap gap-1 mt-1">
                <span class="text-[10px] text-slate-400 self-center mr-0.5">Unit:</span>
                ${targetUnits.map(u => `<span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-600 border border-violet-100">${_esc(u)}</span>`).join('')}
            </div>` : ''}
        </div>

        <!-- Response area (identified by ID so edit can swap content) -->
        <div id="yok-resp-area-${yid}">
            ${dr ? _buildResponseDisplay(t, dr) : _buildResponseForm(yid)}
        </div>

        <!-- Admin action row -->
        ${_isAdmin && dr ? `
        <div class="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100">
            ${pending ? `
            <button class="yok-approve-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                    data-rid="${dr.ResponseID}">อนุมัติ</button>
            <button class="yok-reject-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
                    data-rid="${dr.ResponseID}">ส่งกลับแก้ไข</button>` : ''}
            <button class="yok-del-resp-btn ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                    data-rid="${dr.ResponseID}">ลบการตอบกลับ</button>
        </div>` : ''}
    </div>`;
}

function _buildResponseDisplay(t, dr) {
    const approval = dr.ApprovalStatus;
    const approvalHtml = approval === 'approved'
        ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">อนุมัติแล้ว</span>`
        : approval === 'rejected'
        ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">ถูกส่งกลับแก้ไข</span>`
        : approval === 'pending'
        ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">รอการอนุมัติ</span>`
        : '';

    const files = dr.files || [];

    let html = `
    <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-2 text-sm">
            <svg class="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span class="font-semibold text-slate-700">${_esc(dr.EmployeeName || dr.EmployeeID)}</span>
            <span class="text-slate-400">·</span>
            <span class="${dr.IsRelated === 'Yes' ? 'text-emerald-600 font-medium' : 'text-slate-500'}">
                ${dr.IsRelated === 'Yes' ? 'เกี่ยวข้องกับส่วนงาน' : 'ไม่เกี่ยวข้อง'}
            </span>
            <span class="text-slate-400">·</span>
            <span class="text-xs text-slate-400">${_fmtDate(dr.ResponseDate)}</span>
            ${approvalHtml}
        </div>
        ${dr.Comment ? `<p class="text-sm text-slate-500 ml-6 italic">"${_esc(dr.Comment)}"</p>` : ''}
        ${dr.CorrectiveAction ? `
        <div class="ml-6 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p class="text-xs font-semibold text-amber-700 mb-1">วิธีการแก้ไข/ป้องกัน</p>
            <p class="text-sm text-amber-800">${_esc(dr.CorrectiveAction)}</p>
        </div>` : ''}`;

    if (dr.ApprovalStatus === 'rejected' && dr.ApprovalComment) {
        html += `
        <div class="ml-6 p-3 rounded-lg bg-red-50 border border-red-200">
            <p class="text-xs font-semibold text-red-700 mb-1">เหตุผลที่ส่งกลับแก้ไข (โดย ${_esc(dr.ApprovedBy || '-')})</p>
            <p class="text-sm text-red-800">${_esc(dr.ApprovalComment)}</p>
        </div>`;
    }

    if (files.length > 0) {
        html += `
        <div class="ml-6">
            <p class="text-xs font-semibold text-slate-500 mb-1.5">ไฟล์แนบ (${files.length})</p>
            <div class="flex flex-wrap gap-2">
                ${files.map(f => `
                <div class="inline-flex items-center gap-1">
                    <a href="${f.FileURL}" target="_blank" rel="noopener noreferrer"
                       class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
                        ${_fileIcon(f.FileType)}
                        <span class="max-w-[140px] truncate">${_esc(f.FileName)}</span>
                        <svg class="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                        </svg>
                    </a>
                    ${_isAdmin ? `
                    <button class="yok-del-file-btn p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            data-fid="${f.FileID}" data-yid="${t.YokotenID}" title="ลบไฟล์นี้">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>` : ''}
                </div>`).join('')}
            </div>
        </div>`;
    }

    // Allow edit if rejected or admin
    const canEdit = _isAdmin || (dr.ApprovalStatus === 'rejected');
    if (canEdit) {
        html += `
        <div class="ml-6 mt-2">
            <button class="yok-edit-resp-btn text-xs text-sky-600 hover:underline font-medium"
                    data-rid="${dr.ResponseID}" data-yid="${t.YokotenID}">
                แก้ไขการตอบกลับ
            </button>
        </div>`;
    }

    html += `</div>`;
    return html;
}

function _buildResponseForm(yokotenId, existingResp = null) {
    const rid = existingResp?.ResponseID || '';
    const isEdit = !!rid;
    const curRelated = existingResp?.IsRelated || 'No';
    return `
    <form class="yok-resp-form space-y-3" data-id="${yokotenId}" data-rid="${rid}">
        <p class="text-sm font-semibold text-slate-700">${isEdit ? 'แก้ไขการตอบกลับ' : 'ตอบกลับหัวข้อนี้'}</p>
        <div class="flex gap-5">
            <label class="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="isRelated" value="Yes" class="accent-emerald-500"
                       ${curRelated === 'Yes' ? 'checked' : ''}> เกี่ยวข้องกับส่วนงาน
            </label>
            <label class="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="isRelated" value="No" class="accent-slate-400"
                       ${curRelated !== 'Yes' ? 'checked' : ''}> ไม่เกี่ยวข้อง
            </label>
        </div>
        <textarea name="comment" rows="2" placeholder="ความคิดเห็น (ถ้ามี)"
                  class="form-textarea w-full resize-none text-sm">${_esc(existingResp?.Comment || '')}</textarea>
        <div id="corrective-wrap-${yokotenId}" class="${curRelated !== 'Yes' ? '' : 'hidden'}">
            <label class="block text-xs font-semibold text-slate-600 mb-1">
                วิธีการแก้ไข/ป้องกัน <span class="text-red-500">*</span>
                <span class="text-slate-400 font-normal">(จำเป็นสำหรับ "ไม่เกี่ยวข้อง")</span>
            </label>
            <textarea name="correctiveAction" rows="2" placeholder="ระบุมาตรการแก้ไขหรือป้องกัน..."
                      class="form-textarea w-full resize-none text-sm">${_esc(existingResp?.CorrectiveAction || '')}</textarea>
        </div>
        <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">แนบไฟล์ (รูป/PDF/Word/Excel สูงสุด 10 ไฟล์)</label>
            <input type="file" name="responseFiles" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                   class="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer">
        </div>
        <div class="flex justify-end gap-2">
            ${isEdit ? `<button type="button" class="yok-cancel-edit-btn px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50" data-yid="${yokotenId}">ยกเลิก</button>` : ''}
            <button type="submit"
                    class="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white"
                    style="background:linear-gradient(135deg,#0ea5e9,#6366f1)">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                ${isEdit ? 'บันทึกการแก้ไข' : 'ยืนยันการตอบกลับ'}
            </button>
        </div>
    </form>`;
}

// ─── TAB 3: HISTORY ───────────────────────────────────────────────────────────
function renderHistory(container) {
    const topicMap = new Map();
    _history.forEach(r => {
        if (r.YokotenID && !topicMap.has(r.YokotenID))
            topicMap.set(r.YokotenID, r.Title || r.TopicTitle || r.YokotenID);
    });

    let rows = _history;
    if (_histFilterId) rows = rows.filter(r => r.YokotenID === _histFilterId);

    const approvalBadge = (s) => {
        if (s === 'approved') return `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">อนุมัติ</span>`;
        if (s === 'rejected') return `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">ส่งกลับแก้ไข</span>`;
        if (s === 'pending')  return `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-700">รออนุมัติ</span>`;
        return '';
    };

    container.innerHTML = `
    <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
                <h3 class="text-sm font-bold text-slate-700">ประวัติการตอบกลับของส่วนงาน</h3>
                ${_isAdmin ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">Admin View</span>` : ''}
            </div>
            <div class="flex items-center gap-3">
                ${topicMap.size > 0 ? `
                <select id="yok-hist-filter" class="form-input py-1.5 text-sm">
                    <option value="">ทุกหัวข้อ</option>
                    ${[...topicMap.entries()].map(([id, name]) =>
                        `<option value="${id}" ${_histFilterId === id ? 'selected' : ''}>${_esc(String(name).slice(0, 40))}</option>`
                    ).join('')}
                </select>` : ''}
                <span class="text-xs text-slate-400">${rows.length} รายการ</span>
            </div>
        </div>
        ${rows.length ? `
        <div class="divide-y divide-slate-100">
            ${rows.map(r => {
                const files = r.files || [];
                const canEdit   = _isAdmin || r.ApprovalStatus === 'rejected';
                const canDelete = _isAdmin;
                return `
                <div class="px-5 py-4 hover:bg-slate-50 transition-colors">
                    <div class="flex flex-wrap items-start gap-3 justify-between">
                        <div class="flex-1 min-w-0">
                            <div class="flex flex-wrap items-center gap-2 mb-1">
                                <p class="text-sm font-semibold text-slate-800">${_esc(r.Title || r.TopicTitle || '-')}</p>
                                ${r.RiskLevel ? `<span class="px-1.5 py-0.5 rounded text-xs font-medium ${RISK_BADGE[r.RiskLevel] || 'bg-slate-100 text-slate-500'}">${RISK_LABEL[r.RiskLevel] || r.RiskLevel}</span>` : ''}
                            </div>
                            <div class="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                                <span class="font-medium">${_esc(r.EmployeeName || r.EmployeeID || '-')}</span>
                                <span class="text-slate-300">·</span>
                                <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${r.IsRelated === 'Yes' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                                    ${r.IsRelated === 'Yes' ? 'เกี่ยวข้อง' : 'ไม่เกี่ยวข้อง'}
                                </span>
                                ${approvalBadge(r.ApprovalStatus)}
                                <span class="text-xs text-slate-400">${_fmtDate(r.ResponseDate)}</span>
                            </div>
                            ${r.Comment ? `<p class="text-xs text-slate-500 mt-1 italic">"${_esc(r.Comment)}"</p>` : ''}
                            ${r.CorrectiveAction ? `
                            <div class="mt-2 p-2 rounded bg-amber-50 border border-amber-200">
                                <p class="text-xs font-semibold text-amber-700">วิธีการแก้ไข:</p>
                                <p class="text-xs text-amber-800">${_esc(r.CorrectiveAction)}</p>
                            </div>` : ''}
                            ${files.length > 0 ? `
                            <div class="mt-2 flex flex-wrap gap-1.5">
                                ${files.map(f => `
                                <a href="${f.FileURL}" target="_blank" rel="noopener noreferrer"
                                   class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors">
                                    ${_fileIcon(f.FileType)}
                                    <span class="max-w-[120px] truncate">${_esc(f.FileName)}</span>
                                </a>`).join('')}
                            </div>` : ''}
                            ${r.ApprovalStatus === 'rejected' && r.ApprovalComment ? `
                            <div class="mt-2 p-2 rounded bg-red-50 border border-red-200">
                                <p class="text-xs font-semibold text-red-700">เหตุผลที่ส่งกลับ (${_esc(r.ApprovedBy || '-')}):</p>
                                <p class="text-xs text-red-800">${_esc(r.ApprovalComment)}</p>
                            </div>` : ''}
                        </div>
                        ${(canEdit || canDelete) ? `
                        <div class="flex items-center gap-1.5 flex-shrink-0">
                            ${canEdit ? `
                            <button class="yok-hist-edit-btn flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-600 border border-sky-200 hover:bg-sky-50 transition-colors"
                                    data-rid="${r.ResponseID}" data-yid="${r.YokotenID}">
                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                                แก้ไข
                            </button>` : ''}
                            ${canDelete ? `
                            <button class="yok-hist-del-btn p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                    data-rid="${r.ResponseID}" title="ลบการตอบกลับ">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                            </button>` : ''}
                        </div>` : ''}
                    </div>
                </div>`;
            }).join('')}
        </div>` : `
        <div class="text-center py-16 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
            </div>
            <p class="font-medium">ยังไม่มีประวัติ</p>
            <p class="text-sm mt-1">ยังไม่มีการตอบกลับ Yokoten ในส่วนงานคุณ</p>
        </div>`}
    </div>`;
}

// ─── TAB 4: ADMIN ────────────────────────────────────────────────────────────
function renderAdmin(container) {
    container.innerHTML = `
    <div class="space-y-4">
        <!-- Sub-tab toggle -->
        <div class="card p-3 flex flex-wrap gap-2">
            <button data-adm-view="topics"
                class="adm-view-btn flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${_adminView === 'topics' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                </svg>
                จัดการหัวข้อ
            </button>
            <button data-adm-view="dept"
                class="adm-view-btn flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${_adminView === 'dept' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                ภาพรวม + อนุมัติ
            </button>
            <button data-adm-view="emp"
                class="adm-view-btn flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${_adminView === 'emp' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
                รายบุคคล
            </button>
            <button data-adm-view="config"
                class="adm-view-btn flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${_adminView === 'config' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                </svg>
                ตั้งค่า Dashboard
            </button>
            ${_adminView === 'dept' ? `
            <div class="ml-auto flex items-center gap-2">
                <button id="yok-export-btn-pdf"
                    class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white"
                    style="background:linear-gradient(135deg,#dc2626,#9f1239)">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                    </svg>
                    Export PDF
                </button>
                <button id="yok-export-btn"
                    class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white"
                    style="background:linear-gradient(135deg,#059669,#0d9488)">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    Export Excel
                </button>
            </div>` : ''}
        </div>

        <div id="adm-view-content">
            ${_adminView === 'topics' ? _buildAdminTopics()
            : _adminView === 'dept'  ? _buildAdminDept()
            : _adminView === 'emp'   ? _buildAdminEmp()
            : _buildAdminConfig()}
        </div>
    </div>`;
}

function _buildAdminTopics() {
    if (!_topics.length) {
        return `<div class="card text-center py-16 text-slate-400">
            <p class="font-medium">ยังไม่มีหัวข้อ Yokoten</p>
            <p class="text-sm mt-1">กดปุ่ม "เพิ่มหัวข้อใหม่" เพื่อเริ่มต้น</p>
        </div>`;
    }

    return `
    <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
                </svg>
                <h3 class="text-sm font-bold text-slate-700">รายการหัวข้อทั้งหมด (${_topics.length})</h3>
            </div>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th class="px-4 py-3">หัวข้อ / รายละเอียด</th>
                        <th class="px-4 py-3">ความเสี่ยง</th>
                        <th class="px-4 py-3">หมวดหมู่</th>
                        <th class="px-4 py-3">ครบกำหนด</th>
                        <th class="px-4 py-3">แผนกตอบ / ขาด</th>
                        <th class="px-4 py-3">สถานะ</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${_topics.map(t => {
                        // Use only depts targeted by this specific topic (master-data driven)
                        const rawDepts = _deptCompletion?.deptSummary || [];
                        const allDepts = _getTopicTargetedDepts(rawDepts, t);
                        const totalDepts = allDepts.length;
                        const respondedDepts = allDepts.filter(d =>
                            d.topicBreakdown.some(tb => tb.YokotenID === t.YokotenID && tb.responded)
                        );
                        const missingDepts = allDepts
                            .filter(d => !d.topicBreakdown.some(tb => tb.YokotenID === t.YokotenID && tb.responded))
                            .map(d => d.department);
                        const respondedCount = respondedDepts.length;
                        const topicPct = totalDepts > 0 ? Math.round(respondedCount * 100 / totalDepts) : 0;

                        return `
                        <tr class="hover:bg-slate-50 transition-colors ${!t.IsActive ? 'opacity-50' : ''}">
                            <td class="px-4 py-3 max-w-[220px]">
                                <p class="font-medium text-slate-800 truncate">${_esc(t.Title || '—')}</p>
                                <p class="text-xs text-slate-400 truncate mt-0.5">${_esc(_htmlToText(t.TopicDescription))}</p>
                            </td>
                            <td class="px-4 py-3">
                                <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_BADGE[t.RiskLevel] || 'bg-slate-100 text-slate-500'}">
                                    ${RISK_LABEL[t.RiskLevel] || t.RiskLevel}
                                </span>
                            </td>
                            <td class="px-4 py-3 text-xs text-slate-500">${_esc(t.Category || 'ทั่วไป')}</td>
                            <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">${t.Deadline ? _fmtDateOnly(t.Deadline) : '-'}</td>
                            <td class="px-4 py-3">
                                <div class="space-y-1">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-semibold text-slate-700">${respondedCount}/${totalDepts}</span>
                                        <div class="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                            <div class="h-full rounded-full"
                                                 style="width:${topicPct}%;background:${topicPct === 100 ? '#059669' : topicPct >= 50 ? '#f59e0b' : '#ef4444'}"></div>
                                        </div>
                                        <span class="text-xs font-bold" style="color:${topicPct === 100 ? '#059669' : topicPct >= 50 ? '#f59e0b' : '#ef4444'}">${topicPct}%</span>
                                    </div>
                                    ${missingDepts.length > 0 && missingDepts.length <= 3 ? `
                                    <div class="flex flex-wrap gap-1">
                                        ${missingDepts.map(dep => `
                                        <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 border border-red-100">
                                            ${_esc(dep)}
                                        </span>`).join('')}
                                    </div>` : missingDepts.length > 3 ? `
                                    <span class="text-[10px] text-red-500 font-medium">ยังไม่ตอบ ${missingDepts.length} แผนก</span>
                                    ` : ''}
                                </div>
                            </td>
                            <td class="px-4 py-3">
                                <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${t.IsActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                                    ${t.IsActive ? 'ใช้งาน' : 'ปิดแล้ว'}
                                </span>
                            </td>
                            <td class="px-4 py-3 text-right">
                                <div class="flex items-center gap-1 justify-end">
                                    <button class="btn-yok-edit px-3 py-1 rounded-lg text-xs font-semibold text-sky-600 hover:bg-sky-50 transition-colors"
                                            data-id="${t.YokotenID}">แก้ไข</button>
                                    <button class="btn-yok-delete p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            data-id="${t.YokotenID}" data-title="${_esc(t.Title || _htmlToText(t.TopicDescription))}" title="ลบ">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg>
                                    </button>
                                </div>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    </div>`;
}

function _buildAdminDept() {
    if (!_deptCompletion) {
        return `<div class="card text-center py-16 text-slate-400">
            <p class="font-medium">ยังไม่มีข้อมูลภาพรวมแผนก</p>
            <p class="text-sm mt-1">ตรวจสอบว่ามีแผนกใน Master Data แล้วหรือยัง</p>
        </div>`;
    }

    const { topics } = _deptCompletion;
    // Only show depts that are targeted by at least one topic (master-data driven)
    const deptSummary = _filterToTargetedDepts(_deptCompletion.deptSummary, topics);

    const totalDepts    = deptSummary.length;
    const fullDepts     = deptSummary.filter(d => d.completionPct === 100).length;
    const zeroDepts     = deptSummary.filter(d => d.completionPct === 0).length;
    const pendingApprTotal = deptSummary.reduce((s, d) => s + (d.pendingApproval || 0), 0);
    const sorted = [...deptSummary].sort((a, b) => {
        // rejected first, then pending approval, then by pct desc
        const scoreA = (a.rejected || 0) * 10 + (a.pendingApproval || 0) * 5 - a.completionPct;
        const scoreB = (b.rejected || 0) * 10 + (b.pendingApproval || 0) * 5 - b.completionPct;
        return scoreB - scoreA;
    });

    // Build responseId lookup from _allResponses for approve/reject
    // key: `${dept}::${yokotenId}` → ResponseID
    const respLookup = new Map();
    _allResponses.forEach(r => { respLookup.set(`${r.Department}::${r.YokotenID}`, r); });

    return `
    <div class="space-y-4">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${_kpiCard(totalDepts,    'แผนกทั้งหมด',    '#6366f1', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>`, 'indigo')}
            ${_kpiCard(fullDepts,     'ตอบครบทุกหัวข้อ', '#059669', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>`, 'emerald')}
            ${_kpiCard(pendingApprTotal, 'รออนุมัติ',   '#f59e0b', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>`, 'amber')}
            ${_kpiCard(zeroDepts,     'ยังไม่ตอบ',       '#ef4444', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>`, 'red')}
        </div>

        <!-- Dept summary table with approval actions -->
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="text-sm font-bold text-slate-700">ภาพรวมรายส่วนงาน</h3>
                <span class="text-xs text-slate-400">${totalDepts} ส่วนงาน · ${topics.length} หัวข้อ</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider text-left">
                            <th class="px-4 py-3">ส่วนงาน</th>
                            <th class="px-4 py-3 text-center">ตอบ/ทั้งหมด</th>
                            <th class="px-4 py-3">ความคืบหน้า</th>
                            <th class="px-4 py-3 text-center">รออนุมัติ</th>
                            <th class="px-4 py-3 text-center">ส่งกลับ</th>
                            <th class="px-4 py-3">ล่าสุด</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${sorted.map(d => {
                            const pct = d.completionPct;
                            const rowBg = d.rejected > 0   ? 'background:rgba(254,242,242,0.5)'
                                        : d.pendingApproval > 0 ? 'background:rgba(255,251,235,0.5)'
                                        : pct === 100 ? 'background:rgba(240,253,244,0.4)'
                                        : '';
                            const barColor = pct === 100 ? '#059669' : pct >= 50 ? '#f59e0b' : '#ef4444';
                            return `
                            <tr class="hover:bg-slate-50 transition-colors" style="${rowBg}">
                                <td class="px-4 py-3">
                                    <span class="font-medium text-slate-800">${_esc(d.department)}</span>
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <span class="font-semibold text-slate-700">${d.respondedCount}</span>
                                    <span class="text-slate-400">/${d.totalTopics}</span>
                                </td>
                                <td class="px-4 py-3 min-w-[120px]">
                                    <div class="flex items-center gap-2">
                                        <div class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                            <div class="h-full rounded-full" style="width:${pct}%;background:${barColor}"></div>
                                        </div>
                                        <span class="text-xs font-bold w-8 text-right" style="color:${barColor}">${pct}%</span>
                                    </div>
                                </td>
                                <td class="px-4 py-3 text-center">
                                    ${d.pendingApproval > 0
                                        ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">${d.pendingApproval}</span>`
                                        : `<span class="text-slate-300">-</span>`}
                                </td>
                                <td class="px-4 py-3 text-center">
                                    ${d.rejected > 0
                                        ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">${d.rejected}</span>`
                                        : `<span class="text-slate-300">-</span>`}
                                </td>
                                <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                                    ${d.lastResponse ? _fmtDateOnly(d.lastResponse) : '<span class="text-red-400">-</span>'}
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Responses needing approval -->
        ${_allResponses.filter(r => r.ApprovalStatus === 'pending' || r.ApprovalStatus === 'rejected').length > 0 ? `
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                </svg>
                <h3 class="text-sm font-bold text-slate-700">รายการรอการอนุมัติ / ถูกส่งกลับ</h3>
            </div>
            <div class="divide-y divide-slate-100">
                ${_allResponses
                    .filter(r => r.ApprovalStatus === 'pending' || r.ApprovalStatus === 'rejected')
                    .map(r => {
                        const isPending  = r.ApprovalStatus === 'pending';
                        const isRejected = r.ApprovalStatus === 'rejected';
                        return `
                        <div class="px-5 py-4">
                            <div class="flex flex-wrap items-start gap-3 justify-between">
                                <div class="flex-1 min-w-0">
                                    <div class="flex flex-wrap items-center gap-2 mb-1">
                                        <span class="font-semibold text-slate-700 text-sm">${_esc(r.Department)}</span>
                                        <span class="text-slate-400">·</span>
                                        <span class="text-sm text-slate-500">${_esc(r.Title || r.TopicTitle || r.YokotenID)}</span>
                                        ${isPending
                                            ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">รออนุมัติ</span>`
                                            : `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">ถูกส่งกลับแก้ไข</span>`}
                                    </div>
                                    <p class="text-xs text-slate-500">ตอบโดย: ${_esc(r.EmployeeName || r.EmployeeID)} · ${_fmtDate(r.ResponseDate)}</p>
                                    <p class="text-xs text-slate-600 mt-1">${r.IsRelated === 'No' ? 'ไม่เกี่ยวข้อง' : 'เกี่ยวข้อง'}</p>
                                    ${r.CorrectiveAction ? `<p class="text-xs text-amber-700 mt-1 italic">"${_esc(r.CorrectiveAction)}"</p>` : ''}
                                    ${isRejected && r.ApprovalComment ? `<p class="text-xs text-red-600 mt-1">เหตุผล: ${_esc(r.ApprovalComment)}</p>` : ''}
                                </div>
                                <div class="flex items-center gap-2 flex-shrink-0">
                                    ${isPending ? `
                                    <button class="yok-approve-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                                            data-rid="${r.ResponseID}">อนุมัติ</button>
                                    <button class="yok-reject-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
                                            data-rid="${r.ResponseID}">ส่งกลับแก้ไข</button>` : ''}
                                    <button class="yok-del-resp-btn px-2 py-1.5 rounded-lg text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                                            data-rid="${r.ResponseID}">ลบ</button>
                                </div>
                            </div>
                        </div>`;
                    }).join('')}
            </div>
        </div>` : ''}

        <!-- Matrix -->
        ${topics.length > 0 ? `
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <svg class="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18M10 3v18M14 3v18"/>
                </svg>
                <h3 class="text-sm font-bold text-slate-700">Matrix หัวข้อ × ส่วนงาน</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-xs border-collapse">
                    <thead>
                        <tr class="bg-slate-50">
                            <th class="px-3 py-2.5 text-left font-semibold text-slate-600 border-b border-r border-slate-100 sticky left-0 bg-slate-50 z-10 min-w-[140px]">ส่วนงาน</th>
                            ${topics.map(t => `
                            <th class="px-2 py-2 text-center font-medium text-slate-500 border-b border-slate-100 min-w-[80px]">
                                <div class="truncate" title="${_esc(t.title || _htmlToText(t.TopicDescription))}" style="max-width:80px">
                                    ${_esc((t.title || _htmlToText(t.TopicDescription)).slice(0, 18))}${(t.title || _htmlToText(t.TopicDescription)).length > 18 ? '…' : ''}
                                </div>
                                <span class="mt-0.5 inline-block px-1 py-0.5 rounded text-[10px] font-semibold ${RISK_BADGE[t.RiskLevel] || 'bg-slate-100 text-slate-400'}">
                                    ${RISK_LABEL[t.RiskLevel] || t.RiskLevel || ''}
                                </span>
                            </th>`).join('')}
                            <th class="px-3 py-2.5 text-center font-semibold text-slate-600 border-b border-l border-slate-100 min-w-[60px]">รวม</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${sorted.map(d => `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-3 py-2.5 font-medium text-slate-700 border-r border-slate-100 sticky left-0 bg-white z-10">
                                ${_esc(d.department)}
                            </td>
                            ${d.topicBreakdown.map(tb => {
                                const cellBg = !tb.responded ? '#fff1f2'
                                    : tb.approvalStatus === 'rejected'  ? '#fef9c3'
                                    : tb.approvalStatus === 'pending'   ? '#fefce8'
                                    : '#f0fdf4';
                                const icon = !tb.responded
                                    ? `<svg class="w-3.5 h-3.5 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`
                                    : tb.approvalStatus === 'rejected'
                                    ? `<svg class="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01"/></svg>`
                                    : tb.approvalStatus === 'pending'
                                    ? `<svg class="w-3.5 h-3.5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3"/></svg>`
                                    : `<svg class="w-3.5 h-3.5" style="color:#059669" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
                                return `
                                <td class="px-2 py-2 text-center" style="background:${cellBg}">
                                    <div class="flex items-center justify-center">${icon}</div>
                                    ${tb.responded ? `<div class="text-[10px] text-slate-400 mt-0.5">${_esc(tb.respondedBy || '')}</div>` : ''}
                                </td>`;
                            }).join('')}
                            <td class="px-3 py-2.5 text-center border-l border-slate-100">
                                <span class="font-bold ${d.completionPct === 100 ? 'text-emerald-600' : d.completionPct === 0 ? 'text-red-400' : 'text-amber-600'}">
                                    ${d.respondedCount}/${d.totalTopics}
                                </span>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : ''}
    </div>`;
}

function _buildAdminConfig() {
    const pinnedDepts = Array.isArray(_dashConfig.pinnedDepts) ? _dashConfig.pinnedDepts : [];
    return `
    <div class="card p-5">
        <h3 class="text-sm font-bold text-slate-700 mb-4">เลือกส่วนงานที่แสดงใน Dashboard</h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4 max-h-72 overflow-y-auto p-1">
            ${_masterDepts.map(d => `
            <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-sm">
                <input type="checkbox" name="pin-dept" value="${_esc(d.Name)}"
                       ${pinnedDepts.includes(d.Name) ? 'checked' : ''} class="accent-emerald-500 w-4 h-4">
                <span class="text-slate-700 text-xs">${_esc(d.Name)}</span>
            </label>`).join('')}
        </div>
        <div class="flex justify-end">
            <button id="yok-save-config-btn"
                class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style="background:linear-gradient(135deg,#0ea5e9,#6366f1)">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                บันทึกการตั้งค่า
            </button>
        </div>
    </div>`;
}

// ─── ADMIN: EMPLOYEE COMPLETION ──────────────────────────────────────────────
function _buildAdminEmp() {
    if (!_empCompletion) {
        return `<div class="card text-center py-16 text-slate-400">
            <div class="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mx-auto mb-3"></div>
            <p class="text-sm">กำลังโหลดข้อมูลพนักงาน...</p>
        </div>`;
    }

    const { topics, employees } = _empCompletion;
    let filtered = [...employees];
    if (_empFilterDept) filtered = filtered.filter(e => e.department === _empFilterDept);
    filtered.sort((a, b) => a.completionPct - b.completionPct);

    const allDepts = [...new Set(employees.map(e => e.department))].sort();
    const total100  = employees.filter(e => e.completionPct === 100).length;
    const total0    = employees.filter(e => e.completionPct === 0).length;
    const responders = employees.filter(e => e.breakdown.some(b => b.isDeptResponder)).length;

    return `
    <div class="space-y-4">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${_kpiCard(employees.length, 'พนักงานทั้งหมด', '#6366f1', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>`, 'indigo')}
            ${_kpiCard(total100, 'แผนกตอบครบทุกหัวข้อ', '#059669', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>`, 'emerald')}
            ${_kpiCard(responders, 'เป็นผู้ส่งตอบกลับ', '#0ea5e9', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>`, 'sky')}
            ${_kpiCard(total0, 'แผนกยังไม่ตอบเลย', '#ef4444', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>`, 'red')}
        </div>

        <div class="card p-4 flex items-center gap-3">
            <svg class="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
            </svg>
            <select id="yok-emp-dept-filter" class="form-input py-1.5 text-sm">
                <option value="">ทุกส่วนงาน</option>
                ${allDepts.map(d => `<option value="${_esc(d)}" ${_empFilterDept === d ? 'selected' : ''}>${_esc(d)}</option>`).join('')}
            </select>
            <span class="text-xs text-slate-400 ml-auto">${filtered.length} คน · ${topics.length} หัวข้อ</span>
        </div>

        <div class="card overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider text-left">
                            <th class="px-4 py-3">ชื่อ-สกุล</th>
                            <th class="px-4 py-3">ส่วนงาน</th>
                            <th class="px-4 py-3">ตำแหน่ง</th>
                            <th class="px-4 py-3 text-center">แผนกตอบ/ทั้งหมด</th>
                            <th class="px-4 py-3">ความคืบหน้า</th>
                            <th class="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${filtered.length ? filtered.map(emp => {
                            const pct      = emp.completionPct;
                            const barColor = pct === 100 ? '#059669' : pct >= 50 ? '#f59e0b' : '#ef4444';
                            const rowBg    = pct === 0   ? 'background:rgba(254,242,242,0.4)'
                                           : pct === 100 ? 'background:rgba(240,253,244,0.3)' : '';
                            const isResponder = emp.breakdown.some(b => b.isDeptResponder);
                            return `
                            <tr class="hover:bg-slate-50 transition-colors" style="${rowBg}">
                                <td class="px-4 py-3">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="font-medium text-slate-800">${_esc(emp.name)}</span>
                                        ${isResponder ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700">ผู้ส่งตอบ</span>` : ''}
                                    </div>
                                </td>
                                <td class="px-4 py-3 text-xs text-slate-500">${_esc(emp.department)}</td>
                                <td class="px-4 py-3 text-xs text-slate-500">${_esc(emp.position || '-')}</td>
                                <td class="px-4 py-3 text-center">
                                    <span class="font-semibold text-slate-700">${emp.respondedCount}</span>
                                    <span class="text-slate-400">/${emp.totalTopics}</span>
                                </td>
                                <td class="px-4 py-3 min-w-[120px]">
                                    <div class="flex items-center gap-2">
                                        <div class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                            <div class="h-full rounded-full" style="width:${pct}%;background:${barColor}"></div>
                                        </div>
                                        <span class="text-xs font-bold w-8 text-right" style="color:${barColor}">${pct}%</span>
                                    </div>
                                </td>
                                <td class="px-4 py-3 text-right">
                                    <button class="yok-emp-detail-btn text-xs text-sky-600 hover:underline font-medium"
                                            data-eid="${_esc(emp.employeeId)}">รายละเอียด</button>
                                </td>
                            </tr>`;
                        }).join('') : `
                        <tr><td colspan="6" class="px-4 py-12 text-center text-slate-400">ไม่มีข้อมูลพนักงาน</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}

function _showEmpBreakdown(employeeId) {
    const emp = _empCompletion?.employees?.find(e => e.employeeId === employeeId);
    if (!emp) return;
    const breakdown = emp.breakdown || [];
    const pct = emp.completionPct;
    const barColor = pct === 100 ? '#059669' : pct >= 50 ? '#f59e0b' : '#ef4444';

    const html = `
    <div class="space-y-3">
        <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-semibold text-slate-800">${_esc(emp.name)}</p>
                <p class="text-xs text-slate-500 truncate">${_esc(emp.department)} · ${_esc(emp.position || '-')}</p>
            </div>
            <div class="text-right flex-shrink-0">
                <p class="font-bold text-lg" style="color:${barColor}">${pct}%</p>
                <p class="text-xs text-slate-400">${emp.respondedCount}/${emp.totalTopics} หัวข้อ</p>
            </div>
        </div>
        <div class="divide-y divide-slate-100 max-h-72 overflow-y-auto rounded-xl border border-slate-100">
            ${breakdown.map(b => {
                const statusHtml = !b.deptResponded
                    ? `<span class="text-xs font-semibold text-red-500">ยังไม่ตอบ</span>`
                    : b.approvalStatus === 'rejected'  ? `<span class="text-xs font-semibold text-red-600">ส่งกลับแก้ไข</span>`
                    : b.approvalStatus === 'pending'   ? `<span class="text-xs font-semibold text-yellow-600">รออนุมัติ</span>`
                    : `<span class="text-xs font-semibold text-emerald-600">อนุมัติแล้ว</span>`;
                const dotColor = !b.deptResponded ? '#fca5a5'
                    : b.approvalStatus === 'rejected' ? '#ef4444'
                    : b.approvalStatus === 'pending'  ? '#f59e0b'
                    : '#059669';
                return `
                <div class="px-3 py-2.5 flex items-center gap-3">
                    <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${dotColor}"></span>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-slate-700 truncate">${_esc(b.title)}</p>
                        ${b.isDeptResponder ? `<p class="text-xs text-sky-600">คุณเป็นผู้ส่งตอบกลับของส่วนงาน</p>` : ''}
                    </div>
                    ${statusHtml}
                </div>`;
            }).join('')}
        </div>
        <div class="pt-2 border-t border-slate-100 flex justify-end">
            <button onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5 text-sm">ปิด</button>
        </div>
    </div>`;

    openModal(`รายละเอียด — ${_esc(emp.name)}`, html, 'max-w-lg');
}

// ─── TOPIC FORM MODAL (Add / Edit) ───────────────────────────────────────────
function openTopicForm(topic = null) {
    const isEdit = !!topic;
    const t = topic || {};

    const catOpts  = CATEGORIES.map(c => `<option value="${c}" ${(t.Category || 'ทั่วไป') === c ? 'selected' : ''}>${c}</option>`).join('');
    const riskOpts = RISK_LEVELS.map(r => `<option value="${r.value}" ${(t.RiskLevel || 'Low') === r.value ? 'selected' : ''}>${r.label}</option>`).join('');

    const existingAttachUrl  = t.AttachmentUrl  || '';
    const existingAttachName = t.AttachmentName || '';

    const html = `
    <form id="yok-topic-form" class="space-y-4">
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อหัวข้อ (ย่อ)</label>
            <input id="yt-title" type="text" value="${_esc(t.Title || '')}" maxlength="200"
                   placeholder="เช่น: อุบัติเหตุเครื่องปั๊ม ไลน์ B"
                   class="form-input w-full">
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียด <span class="text-red-500">*</span></label>
            <!-- Rich text toolbar -->
            <div class="flex flex-wrap gap-0.5 p-1.5 rounded-t-lg border border-b-0 border-slate-200 bg-slate-50" id="yt-rte-toolbar">
                <button type="button" data-cmd="bold"          title="หนา (Ctrl+B)"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
                </button>
                <button type="button" data-cmd="italic"        title="เอียง (Ctrl+I)"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>
                </button>
                <button type="button" data-cmd="underline"     title="ขีดเส้นใต้ (Ctrl+U)"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>
                </button>
                <div class="w-px h-6 bg-slate-200 mx-0.5 self-center"></div>
                <button type="button" data-cmd="insertUnorderedList" title="รายการแบบจุด"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>
                </button>
                <button type="button" data-cmd="insertOrderedList"   title="รายการแบบตัวเลข"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-8v2h14V3H7zm0 18h14v-2H7v2zm0-7h14v-2H7v2z"/></svg>
                </button>
                <div class="w-px h-6 bg-slate-200 mx-0.5 self-center"></div>
                <button type="button" data-cmd="formatBlock" data-val="h3" title="หัวข้อ"
                    class="rte-btn px-2 h-7 rounded flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-white hover:shadow-sm transition-all">H</button>
                <button type="button" data-cmd="removeFormat" title="ล้างการจัดรูปแบบ"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
                <div class="w-px h-6 bg-slate-200 mx-0.5 self-center"></div>
                <button type="button" data-cmd="justifyLeft" title="ชิดซ้าย"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>
                </button>
                <button type="button" data-cmd="justifyCenter" title="กึ่งกลาง"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>
                </button>
                <button type="button" data-cmd="justifyRight" title="ชิดขวา"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>
                </button>
                <button type="button" data-cmd="justifyFull" title="เต็มบรรทัด (Justify)"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z"/></svg>
                </button>
                <div class="w-px h-6 bg-slate-200 mx-0.5 self-center"></div>
                <button type="button" data-rte-action="link" title="แทรกลิงก์"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
                </button>
                <button type="button" data-cmd="unlink" title="ลบลิงก์"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2zm-3-4h8v2H8v-2zm8.71 7.29l1.41-1.41L20 20.88 21.46 22 22 21.46 8.29 7.75 6.88 9.17z"/></svg>
                </button>
                <button type="button" data-rte-action="image" title="แทรกรูปภาพ (URL)"
                    class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                </button>
            </div>
            <!-- Link / Image URL input bar (shown when link/image button clicked) -->
            <div id="yt-rte-input-bar" class="hidden items-center gap-2 border border-slate-200 border-t-0 bg-slate-50 px-2 py-1.5">
                <span id="yt-rte-input-label" class="text-xs text-slate-500 flex-shrink-0 w-16">URL ลิงก์:</span>
                <input id="yt-rte-url-input" type="text" placeholder="https://..."
                       class="flex-1 text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200">
                <button type="button" id="yt-rte-insert-btn"
                        class="flex-shrink-0 text-xs px-3 py-1 rounded bg-sky-500 text-white hover:bg-sky-600 font-semibold transition-colors">แทรก</button>
                <button type="button" id="yt-rte-cancel-bar"
                        class="flex-shrink-0 text-xs px-2 py-1 rounded text-slate-400 hover:bg-slate-200 transition-colors">ยกเลิก</button>
            </div>
            <!-- Editable area -->
            <div id="yt-desc"
                 contenteditable="true"
                 class="form-textarea w-full rounded-t-none min-h-[96px] focus:outline-none"
                 style="min-height:96px;border-top:0"
                 data-placeholder="อธิบายบทเรียน / เหตุการณ์ / ความรู้ที่ต้องการแบ่งปัน"></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมวดหมู่</label>
                <select id="yt-cat" class="form-input w-full">${catOpts}</select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ระดับความเสี่ยง</label>
                <select id="yt-risk" class="form-input w-full">${riskOpts}</select>
            </div>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันครบกำหนดรับทราบ</label>
            <input id="yt-deadline" type="date" value="${t.Deadline ? t.Deadline.split('T')[0] : ''}" class="form-input w-full">
        </div>

        <!-- Target Departments -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                แผนกที่ต้องรับทราบ
                <span class="text-xs font-normal text-slate-400 ml-1">(ว่าง = ทุกแผนก)</span>
            </label>
            ${_masterDepts.length > 0 ? `
            <div class="grid grid-cols-2 gap-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-36 overflow-y-auto">
                ${_masterDepts.map(d => {
                    const existing = _parseTargetDepts(t.TargetDepts);
                    const checked  = existing.length === 0 || existing.includes(d.Name);
                    return `
                    <label class="flex items-center gap-2 cursor-pointer text-sm p-1.5 rounded-lg hover:bg-white transition-colors">
                        <input type="checkbox" name="target-dept" value="${_esc(d.Name)}"
                               ${checked ? 'checked' : ''} class="accent-emerald-500 w-3.5 h-3.5">
                        <span class="text-slate-700 text-xs">${_esc(d.Name)}</span>
                    </label>`;
                }).join('')}
            </div>
            <div class="flex gap-3 mt-1.5">
                <button type="button" id="yt-select-all-depts"
                    class="text-xs text-sky-600 hover:underline">เลือกทั้งหมด</button>
                <button type="button" id="yt-clear-all-depts"
                    class="text-xs text-slate-400 hover:underline">ล้างทั้งหมด</button>
            </div>` : `<p class="text-xs text-slate-400">ไม่พบข้อมูลแผนกใน Master Data</p>`}
        </div>

        <!-- Target Units -->
        ${_safetyUnits.length > 0 ? `
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                Safety Unit ที่เกี่ยวข้อง
                <span class="text-xs font-normal text-slate-400 ml-1">(ไม่เลือก = ทุก Unit)</span>
            </label>
            <div class="grid grid-cols-2 gap-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-28 overflow-y-auto">
                ${_safetyUnits.map(u => {
                    const existingUnits = Array.isArray(t.TargetUnits) ? t.TargetUnits : [];
                    const checked = existingUnits.includes(u.name || u.Name);
                    return `
                    <label class="flex items-center gap-2 cursor-pointer text-sm p-1.5 rounded-lg hover:bg-white transition-colors">
                        <input type="checkbox" name="target-unit" value="${_esc(u.name || u.Name)}"
                               ${checked ? 'checked' : ''} class="accent-violet-500 w-3.5 h-3.5">
                        <span class="text-slate-700 text-xs">${_esc(u.name || u.Name)}</span>
                    </label>`;
                }).join('')}
            </div>
        </div>` : ''}

        <!-- Attachment: URL or Upload -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-2">ไฟล์แนบ</label>
            <div class="flex gap-4 mb-3">
                <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                    <input type="radio" name="attach-type" value="url" class="accent-emerald-500" ${!existingAttachUrl ? 'checked' : (existingAttachUrl ? 'checked' : '')}> ระบุ URL
                </label>
                <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                    <input type="radio" name="attach-type" value="file" class="accent-emerald-500"> อัปโหลดไฟล์
                </label>
            </div>

            <div id="yt-url-wrap">
                <input id="yt-attach" type="url" value="${_esc(existingAttachUrl)}"
                       placeholder="https://..." class="form-input w-full mb-2">
                <input id="yt-attachname" type="text" value="${_esc(existingAttachName)}"
                       placeholder="ชื่อไฟล์ เช่น: รายงานการสอบสวน.pdf" class="form-input w-full">
            </div>
            <div id="yt-file-wrap" class="hidden">
                <div class="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center">
                    <input id="yt-file" type="file"
                           accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                           class="hidden">
                    <label for="yt-file" class="cursor-pointer">
                        <div class="flex flex-col items-center gap-2">
                            <svg class="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                            </svg>
                            <p class="text-sm text-slate-500">คลิกเพื่อเลือกไฟล์</p>
                            <p class="text-xs text-slate-400">รองรับ: รูปภาพ, PDF, Word, Excel, PowerPoint (สูงสุด 20 MB)</p>
                        </div>
                    </label>
                    <div id="yt-file-name" class="mt-2 text-xs text-sky-600 font-medium hidden"></div>
                </div>
                ${existingAttachUrl ? `<p class="text-xs text-slate-400 mt-2">ไฟล์ปัจจุบัน: <a href="${existingAttachUrl}" target="_blank" class="text-sky-600 hover:underline">${_esc(existingAttachName || existingAttachUrl)}</a></p>` : ''}
            </div>
            <div id="yt-upload-progress" class="hidden mt-2">
                <div class="flex items-center gap-2 text-xs text-slate-500">
                    <div class="animate-spin w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
                    กำลังอัปโหลดไฟล์...
                </div>
            </div>
        </div>

        ${isEdit ? `
        <div class="flex items-center gap-3">
            <input id="yt-active" type="checkbox" ${t.IsActive ? 'checked' : ''} class="w-4 h-4 accent-emerald-500">
            <label for="yt-active" class="text-sm font-semibold text-slate-700">แสดงหัวข้อนี้ (ใช้งาน)</label>
        </div>` : ''}

        <div id="yt-error" class="text-sm text-red-500 font-medium hidden"></div>
        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="yt-submit" class="btn btn-primary px-5">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มหัวข้อ'}</button>
        </div>
    </form>`;

    openModal(isEdit ? 'แก้ไขหัวข้อ Yokoten' : 'เพิ่มหัวข้อ Yokoten', html, 'max-w-lg');

    setTimeout(() => {
        // ── Rich text editor init ─────────────────────────────────────────────
        const rteEl = document.getElementById('yt-desc');
        if (rteEl) {
            // Populate existing content (HTML or plain text)
            const existing = t.TopicDescription || '';
            rteEl.innerHTML = existing ? _sanitizeHtml(existing) : '';

            // Placeholder visibility
            const updatePlaceholder = () => {
                if (rteEl.innerText.trim() === '') {
                    rteEl.classList.add('rte-empty');
                } else {
                    rteEl.classList.remove('rte-empty');
                }
            };
            updatePlaceholder();
            rteEl.addEventListener('input', updatePlaceholder);
            rteEl.addEventListener('focus', updatePlaceholder);
            rteEl.addEventListener('blur',  updatePlaceholder);

            // Toolbar button clicks (alignment, formatting, link, image)
            let _rteAction  = null;   // 'link' | 'image'
            let _savedRange = null;

            const inputBar   = document.getElementById('yt-rte-input-bar');
            const inputLabel = document.getElementById('yt-rte-input-label');
            const urlInput   = document.getElementById('yt-rte-url-input');
            const insertBtn  = document.getElementById('yt-rte-insert-btn');
            const cancelBar  = document.getElementById('yt-rte-cancel-bar');

            const _hideInputBar = () => {
                inputBar?.classList.add('hidden');
                inputBar?.classList.remove('flex');
                _rteAction  = null;
                _savedRange = null;
            };

            const _saveSelection = () => {
                const sel = window.getSelection();
                return sel?.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
            };

            const _restoreSelection = (range) => {
                if (!range) return;
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            };

            // Update active state for alignment buttons on cursor move
            const _updateAlignBtns = () => {
                ['justifyLeft','justifyCenter','justifyRight','justifyFull'].forEach(cmd => {
                    const btn = document.querySelector(`#yt-rte-toolbar [data-cmd="${cmd}"]`);
                    if (btn) btn.classList.toggle('rte-active', document.queryCommandState(cmd));
                });
            };
            rteEl.addEventListener('keyup',  _updateAlignBtns);
            rteEl.addEventListener('mouseup', _updateAlignBtns);
            rteEl.addEventListener('focus',  _updateAlignBtns);

            document.getElementById('yt-rte-toolbar')?.addEventListener('mousedown', (ev) => {
                const btn = ev.target.closest('.rte-btn');
                if (!btn) return;
                ev.preventDefault(); // keep focus in editor

                const action = btn.dataset.rteAction;
                const cmd    = btn.dataset.cmd;
                const val    = btn.dataset.val || null;

                if (action === 'link' || action === 'image') {
                    _savedRange = _saveSelection();
                    _rteAction  = action;
                    if (inputLabel) inputLabel.textContent = action === 'link' ? 'URL ลิงก์:' : 'URL รูปภาพ:';
                    if (urlInput) urlInput.value = '';
                    inputBar?.classList.remove('hidden');
                    inputBar?.classList.add('flex');
                    setTimeout(() => urlInput?.focus(), 0);
                    return;
                }

                if (cmd) {
                    document.execCommand(cmd, false, val);
                    rteEl.focus();
                    _updateAlignBtns();
                }
            });

            // Insert link / image on confirm
            insertBtn?.addEventListener('click', () => {
                const url = urlInput?.value.trim();
                if (!url) return;
                _restoreSelection(_savedRange);
                rteEl.focus();
                if (_rteAction === 'link') {
                    document.execCommand('createLink', false, url);
                    // Add target="_blank" to newly created link
                    rteEl.querySelectorAll('a[href]').forEach(a => {
                        if (!a.target) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
                    });
                } else if (_rteAction === 'image') {
                    document.execCommand('insertImage', false, url);
                }
                _hideInputBar();
                updatePlaceholder();
            });

            cancelBar?.addEventListener('click', _hideInputBar);

            urlInput?.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter')  { ev.preventDefault(); insertBtn?.click(); }
                if (ev.key === 'Escape') _hideInputBar();
            });
        }

        // Select/clear all departments
        document.getElementById('yt-select-all-depts')?.addEventListener('click', () => {
            document.querySelectorAll('input[name="target-dept"]').forEach(cb => cb.checked = true);
        });
        document.getElementById('yt-clear-all-depts')?.addEventListener('click', () => {
            document.querySelectorAll('input[name="target-dept"]').forEach(cb => cb.checked = false);
        });

        // Attach-type radio toggle
        document.querySelectorAll('input[name="attach-type"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const isFile = radio.value === 'file' && radio.checked;
                document.getElementById('yt-url-wrap').classList.toggle('hidden', isFile);
                document.getElementById('yt-file-wrap').classList.toggle('hidden', !isFile);
            });
        });

        // File input change → show filename
        document.getElementById('yt-file')?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            const nameEl = document.getElementById('yt-file-name');
            if (file && nameEl) {
                nameEl.textContent = file.name + ' (' + (file.size / 1024 / 1024).toFixed(2) + ' MB)';
                nameEl.classList.remove('hidden');
            }
        });

        // Form submit
        document.getElementById('yok-topic-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl  = document.getElementById('yt-error');
            const submit = document.getElementById('yt-submit');
            // Read HTML from contenteditable; strip unsafe tags before sending
            const rte  = document.getElementById('yt-desc');
            const desc = rte ? _sanitizeHtml(rte.innerHTML).trim() : '';

            if (!desc) {
                errEl.textContent = 'กรุณากรอกรายละเอียดหัวข้อ';
                errEl.classList.remove('hidden');
                return;
            }
            errEl.classList.add('hidden');
            submit.disabled = true;
            submit.textContent = 'กำลังบันทึก...';

            let attachUrl  = null;
            let attachName = null;

            const attachType = document.querySelector('input[name="attach-type"]:checked')?.value;
            if (attachType === 'file') {
                const file = document.getElementById('yt-file')?.files?.[0];
                if (file) {
                    const progress = document.getElementById('yt-upload-progress');
                    progress?.classList.remove('hidden');
                    try {
                        const fd = new FormData();
                        fd.append('document', file);
                        const uploadRes = await API.post('/upload/document', fd);
                        attachUrl  = uploadRes.url || uploadRes.secure_url || uploadRes.data?.url || null;
                        attachName = file.name;
                    } catch (uploadErr) {
                        errEl.textContent = 'อัปโหลดไฟล์ไม่สำเร็จ: ' + (uploadErr.message || 'เกิดข้อผิดพลาด');
                        errEl.classList.remove('hidden');
                        submit.disabled = false;
                        submit.textContent = isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มหัวข้อ';
                        progress?.classList.add('hidden');
                        return;
                    }
                    progress?.classList.add('hidden');
                } else if (existingAttachUrl) {
                    // no new file chosen → keep existing
                    attachUrl  = existingAttachUrl;
                    attachName = existingAttachName;
                }
            } else {
                attachUrl  = document.getElementById('yt-attach')?.value.trim() || null;
                attachName = document.getElementById('yt-attachname')?.value.trim() || null;
            }

            // collect checked departments (null = all)
            const checkedDepts = [...document.querySelectorAll('input[name="target-dept"]:checked')]
                .map(cb => cb.value);
            const allDeptsSelected = checkedDepts.length === _masterDepts.length || checkedDepts.length === 0;

            const payload = {
                Title:            document.getElementById('yt-title').value.trim() || null,
                TopicDescription: desc,
                Category:         document.getElementById('yt-cat').value,
                RiskLevel:        document.getElementById('yt-risk').value,
                Deadline:         document.getElementById('yt-deadline').value || null,
                AttachmentUrl:    attachUrl,
                AttachmentName:   attachName,
                TargetDepts:      allDeptsSelected ? null : checkedDepts,
                TargetUnits:      (() => {
                    const checked = [...document.querySelectorAll('input[name="target-unit"]:checked')].map(cb => cb.value);
                    return checked.length > 0 ? checked : null;
                })(),
            };
            if (isEdit) {
                payload.IsActive = document.getElementById('yt-active').checked ? 1 : 0;
            }

            try {
                showLoading('กำลังบันทึก...');
                if (isEdit) {
                    await API.put(`/yokoten/topics/${topic.YokotenID}`, payload);
                } else {
                    await API.post('/yokoten/topics', payload);
                }
                closeModal();
                showToast(isEdit ? 'อัปเดตหัวข้อสำเร็จ' : 'เพิ่มหัวข้อสำเร็จ', 'success');
                await refreshData();
            } catch (err) {
                errEl.textContent = err.message || 'เกิดข้อผิดพลาด';
                errEl.classList.remove('hidden');
                submit.disabled = false;
                submit.textContent = isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มหัวข้อ';
            } finally {
                hideLoading();
            }
        });
    }, 50);
}

// ─── RESPONSE SUBMIT (FormData) ──────────────────────────────────────────────
async function _submitResp(form, btn) {
    const yokotenId = form.dataset.id;
    const responseId = form.dataset.rid || '';  // empty = create, non-empty = update
    const isEdit = !!responseId;

    const isRelated        = form.querySelector('input[name="isRelated"]:checked')?.value || 'No';
    const comment          = form.querySelector('[name="comment"]')?.value || '';
    const correctiveAction = form.querySelector('[name="correctiveAction"]')?.value || '';
    const files            = form.querySelector('[name="responseFiles"]')?.files;

    if (isRelated === 'No' && !correctiveAction.trim()) {
        showToast('กรุณากรอกวิธีการแก้ไข/ป้องกัน', 'error');
        return;
    }

    const fd = new FormData();
    fd.append('yokotenId', yokotenId);
    fd.append('isRelated', isRelated);
    fd.append('comment', comment);
    fd.append('correctiveAction', correctiveAction);
    if (files) {
        Array.from(files).forEach(f => fd.append('responseFiles', f));
    }

    if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }

    try {
        showLoading('กำลังบันทึก...');
        if (isEdit) {
            await API.put(`/yokoten/respond/${responseId}`, fd);
        } else {
            await API.post('/yokoten/respond', fd);
        }
        closeModal();
        showToast(isEdit ? 'อัปเดตการตอบกลับสำเร็จ' : 'ตอบกลับสำเร็จ', 'success');
        await refreshData();
    } catch (err) {
        const msg = err?.message || 'เกิดข้อผิดพลาด';
        showToast(msg, 'error');
        if (btn) { btn.disabled = false; btn.textContent = isEdit ? 'บันทึกการแก้ไข' : 'ยืนยันการตอบกลับ'; }
    } finally {
        hideLoading();
    }
}

// ─── REJECT MODAL ────────────────────────────────────────────────────────────
function openRejectModal(responseId) {
    openModal('ส่งกลับแก้ไข', `
    <div class="space-y-3">
        <p class="text-sm text-slate-600">ระบุเหตุผลที่ส่งกลับให้แก้ไข</p>
        <textarea id="reject-comment" rows="3" class="form-textarea w-full resize-none text-sm"
                  placeholder="เหตุผล..."></textarea>
        <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-4 text-sm">ยกเลิก</button>
            <button id="reject-confirm-btn"
                class="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600">ยืนยัน</button>
        </div>
    </div>`, 'max-w-md');

    setTimeout(() => {
        document.getElementById('reject-confirm-btn')?.addEventListener('click', async () => {
            const comment = document.getElementById('reject-comment')?.value.trim();
            if (!comment) { showToast('กรุณาระบุเหตุผล', 'error'); return; }
            try {
                showLoading('กำลังดำเนินการ...');
                await API.post(`/yokoten/respond/${responseId}/reject`, { comment });
                closeModal();
                showToast('ส่งกลับแก้ไขสำเร็จ', 'success');
                await refreshData();
            } catch (err) { showToast(err?.message || 'เกิดข้อผิดพลาด', 'error'); }
            finally { hideLoading(); }
        });
    }, 50);
}

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', async (e) => {
        if (!e.target.closest('#yokoten-page') && !e.target.closest('[data-yok-modal]')) return;

        // Tab switch
        const tabBtn = e.target.closest('.yok-tab');
        if (tabBtn?.dataset.tab) { switchTab(tabBtn.dataset.tab); return; }

        // Add topic
        if (e.target.closest('#yok-add-btn')) { openTopicForm(null); return; }

        // Edit topic
        const editBtn = e.target.closest('.btn-yok-edit');
        if (editBtn) {
            const t = _topics.find(x => x.YokotenID === editBtn.dataset.id);
            if (t) openTopicForm(t);
            return;
        }

        // Delete topic
        const delBtn = e.target.closest('.btn-yok-delete');
        if (delBtn) {
            const confirmed = await showConfirmationModal('ยืนยันการลบ',
                `ต้องการลบหัวข้อ "${delBtn.dataset.title}" ?\n(หากมีการตอบกลับแล้ว ระบบจะปิดหัวข้อแทนการลบ)`);
            if (confirmed) {
                showLoading('กำลังดำเนินการ...');
                try { await API.delete(`/yokoten/topics/${delBtn.dataset.id}`); showToast('ดำเนินการสำเร็จ', 'success'); await refreshData(); }
                catch (err) { showToast(err?.message || 'เกิดข้อผิดพลาด', 'error'); }
                finally { hideLoading(); }
            }
            return;
        }

        // Year filter (dashboard + topics shared)
        const yearBtn = e.target.closest('.yok-year-btn');
        if (yearBtn) {
            _dashYear = parseInt(yearBtn.dataset.year, 10);
            _destroyCharts();
            const cont = document.getElementById('yok-content');
            if (_activeTab === 'dashboard') renderDashboard(cont);
            else if (_activeTab === 'topics') renderTopics(cont);
            return;
        }

        // View topic card → open detail modal
        const viewTopicBtn = e.target.closest('.yok-view-topic-btn');
        if (viewTopicBtn) {
            const yid = viewTopicBtn.dataset.yid;
            const t = _topics.find(x => x.YokotenID === yid);
            if (!t) return;
            const desc = t.TopicDescription || '';
            const title = t.Title || (desc.length > 60 ? desc.slice(0, 60) + '…' : desc);
            openModal(title, _buildTopicModal(t), 'max-w-2xl');
            return;
        }

        // Switch-tab link
        const switchBtn = e.target.closest('[data-switch-tab]');
        if (switchBtn) { switchTab(switchBtn.dataset.switchTab); return; }

        // Admin view toggle
        const admViewBtn = e.target.closest('.adm-view-btn');
        if (admViewBtn?.dataset.admView) {
            _adminView = admViewBtn.dataset.admView;
            renderAdmin(document.getElementById('yok-content'));
            // Lazy-load employee completion data on first visit
            if (_adminView === 'emp' && !_empCompletion) {
                (async () => {
                    try {
                        const res = await API.get('/yokoten/employee-completion');
                        _empCompletion = res?.data ?? res;
                        const admContent = document.getElementById('adm-view-content');
                        if (admContent && _adminView === 'emp') admContent.innerHTML = _buildAdminEmp();
                    } catch (err) {
                        showToast('โหลดข้อมูลพนักงานไม่สำเร็จ: ' + err.message, 'error');
                    }
                })();
            }
            return;
        }

        // Employee detail breakdown
        const empDetailBtn = e.target.closest('.yok-emp-detail-btn');
        if (empDetailBtn) { _showEmpBreakdown(empDetailBtn.dataset.eid); return; }

        // Delete individual response file (admin)
        const delFileBtn = e.target.closest('.yok-del-file-btn');
        if (delFileBtn) {
            const ok = await showConfirmationModal('ลบไฟล์', 'ต้องการลบไฟล์นี้? ไม่สามารถกู้คืนได้');
            if (!ok) return;
            const inModal = !!e.target.closest('[data-yok-modal]');
            const yid = delFileBtn.dataset.yid;
            try {
                showLoading('กำลังลบไฟล์...');
                await API.delete(`/yokoten/response-files/${delFileBtn.dataset.fid}`);
                showToast('ลบไฟล์สำเร็จ', 'success');
                await refreshData();
                // If inside modal, re-render the modal content in place
                if (inModal && yid) {
                    const t = _topics.find(x => x.YokotenID === yid);
                    const respArea = document.getElementById(`yok-resp-area-${yid}`);
                    if (t && respArea) respArea.innerHTML = t.deptResponse ? _buildResponseDisplay(t, t.deptResponse) : _buildResponseForm(yid);
                }
            } catch (err) { showToast(err?.message || 'เกิดข้อผิดพลาด', 'error'); }
            finally { hideLoading(); }
            return;
        }

        // Export PDF
        if (e.target.closest('#yok-export-btn-pdf') || e.target.closest('#yok-pdf-btn-dash')) { exportYokotenPDF(); return; }

        // Export Excel
        if (e.target.closest('#yok-export-btn')) { _exportExcel(); return; }

        // Dashboard config btn (from dashboard chart header)
        if (e.target.closest('#yok-config-dash-btn')) {
            switchTab('admin');
            _adminView = 'config';
            renderAdmin(document.getElementById('yok-content'));
            return;
        }

        // Approve response
        const approveBtn = e.target.closest('.yok-approve-btn');
        if (approveBtn) {
            const rid = approveBtn.dataset.rid;
            const ok = await showConfirmationModal('อนุมัติการตอบกลับ', 'ยืนยันการอนุมัติการตอบกลับนี้?');
            if (!ok) return;
            try {
                showLoading('กำลังดำเนินการ...');
                await API.post(`/yokoten/respond/${rid}/approve`, {});
                closeModal();
                showToast('อนุมัติสำเร็จ', 'success');
                await refreshData();
            } catch (err) { showToast(err?.message || 'เกิดข้อผิดพลาด', 'error'); }
            finally { hideLoading(); }
            return;
        }

        // Reject response
        const rejectBtn = e.target.closest('.yok-reject-btn');
        if (rejectBtn) { openRejectModal(rejectBtn.dataset.rid); return; }

        // Delete response (admin)
        const delRespBtn = e.target.closest('.yok-del-resp-btn');
        if (delRespBtn) {
            const ok = await showConfirmationModal('ลบการตอบกลับ', 'ต้องการลบการตอบกลับนี้? ไฟล์แนบทั้งหมดจะถูกลบด้วย');
            if (!ok) return;
            try {
                showLoading('กำลังดำเนินการ...');
                await API.delete(`/yokoten/respond/${delRespBtn.dataset.rid}`);
                closeModal();
                showToast('ลบการตอบกลับสำเร็จ', 'success');
                await refreshData();
            } catch (err) { showToast(err?.message || 'เกิดข้อผิดพลาด', 'error'); }
            finally { hideLoading(); }
            return;
        }

        // Edit response button (show edit form in resp-area, works in modal + inline)
        const editRespBtn = e.target.closest('.yok-edit-resp-btn');
        if (editRespBtn) {
            const yid = editRespBtn.dataset.yid;
            const t   = _topics.find(x => x.YokotenID === yid);
            const dr  = t?.deptResponse;
            if (!t || !dr) return;
            const respArea = document.getElementById(`yok-resp-area-${yid}`);
            if (respArea) respArea.innerHTML = _buildResponseForm(yid, dr);
            return;
        }

        // Cancel edit response — restore display without full page refresh
        const cancelEditBtn = e.target.closest('.yok-cancel-edit-btn');
        if (cancelEditBtn) {
            const yid = cancelEditBtn.dataset.yid;
            const t   = _topics.find(x => x.YokotenID === yid);
            const dr  = t?.deptResponse;
            const respArea = document.getElementById(`yok-resp-area-${yid}`);
            if (respArea && t && dr) {
                respArea.innerHTML = _buildResponseDisplay(t, dr);
            } else {
                await refreshData();
            }
            return;
        }

        // History tab: admin edit response
        const histEditBtn = e.target.closest('.yok-hist-edit-btn');
        if (histEditBtn) {
            const yid = histEditBtn.dataset.yid;
            const rid = histEditBtn.dataset.rid;
            // Find topic to get the YokotenID; find response from _history or _allResponses
            const resp = (_allResponses.length ? _allResponses : _history).find(r => r.ResponseID === rid || String(r.ResponseID) === rid);
            const t = _topics.find(x => x.YokotenID === yid);
            if (!t) return;
            // Temporarily inject the response as deptResponse on the topic for the form
            const tWithResp = { ...t, deptResponse: resp || t.deptResponse };
            const title = t.Title || (_htmlToText(t.TopicDescription).slice(0, 60));
            openModal(title, _buildTopicModal(tWithResp), 'max-w-2xl');
            return;
        }

        // History tab: admin delete response
        const histDelBtn = e.target.closest('.yok-hist-del-btn');
        if (histDelBtn) {
            const rid = histDelBtn.dataset.rid;
            const ok = await showConfirmationModal('ลบการตอบกลับ', 'ต้องการลบการตอบกลับนี้? ไฟล์แนบทั้งหมดจะถูกลบด้วย');
            if (!ok) return;
            try {
                showLoading('กำลังดำเนินการ...');
                await API.delete(`/yokoten/respond/${rid}`);
                showToast('ลบการตอบกลับสำเร็จ', 'success');
                await refreshData();
            } catch (err) { showToast(err?.message || 'เกิดข้อผิดพลาด', 'error'); }
            finally { hideLoading(); }
            return;
        }

        // Save dashboard config
        if (e.target.closest('#yok-save-config-btn')) {
            const checked = [...document.querySelectorAll('input[name="pin-dept"]:checked')].map(cb => cb.value);
            try {
                showLoading('กำลังบันทึก...');
                await API.put('/yokoten/dashboard-config', { pinnedDepts: checked });
                _dashConfig.pinnedDepts = checked;
                showToast('บันทึกการตั้งค่าสำเร็จ', 'success');
            } catch (err) { showToast(err?.message || 'เกิดข้อผิดพลาด', 'error'); }
            finally { hideLoading(); }
            return;
        }
    });

    // Form submit delegation
    document.addEventListener('submit', async (e) => {
        if (!e.target.closest('#yokoten-page') && !e.target.closest('[data-yok-modal]')) return;
        // Response form (inline in topics tab OR inside modal)
        if (e.target.classList.contains('yok-resp-form')) {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            await _submitResp(e.target, btn);
            return;
        }
    });

    // Filter changes
    document.addEventListener('change', (e) => {
        if (!e.target.closest('#yokoten-page') && !e.target.closest('[data-yok-modal]')) return;
        if (e.target.id === 'yok-filter-risk') { _filterRisk = e.target.value; renderTopics(document.getElementById('yok-content')); return; }
        if (e.target.id === 'yok-filter-cat')  { _filterCat  = e.target.value; renderTopics(document.getElementById('yok-content')); return; }
        if (e.target.id === 'yok-filter-ack')  { _filterAck  = e.target.value; renderTopics(document.getElementById('yok-content')); return; }
        if (e.target.id === 'yok-hist-filter') { _histFilterId = e.target.value; renderHistory(document.getElementById('yok-content')); return; }
        if (e.target.id === 'yok-emp-dept-filter') {
            _empFilterDept = e.target.value;
            const admContent = document.getElementById('adm-view-content');
            if (admContent) admContent.innerHTML = _buildAdminEmp();
            return;
        }
        // Toggle corrective action required field in response form
        if (e.target.name === 'isRelated') {
            const yokoId = e.target.closest('form.yok-resp-form')?.dataset?.id;
            if (!yokoId) return;
            const wrap = document.getElementById(`corrective-wrap-${yokoId}`);
            if (wrap) wrap.classList.toggle('hidden', e.target.value === 'Yes');
        }
    });

    // Search debounce
    document.addEventListener('input', _debounce((e) => {
        if (!e.target.closest('#yokoten-page') && !e.target.closest('[data-yok-modal]')) return;
        if (e.target.id === 'yok-search') {
            _searchQ = e.target.value;
            renderTopics(document.getElementById('yok-content'));
        }
    }, 300));
}



// ─── EXPORT EXCEL ─────────────────────────────────────────────────────────────
function _exportExcel() {
    if (!_deptCompletion) {
        showToast('ไม่มีข้อมูลสำหรับ Export', 'error');
        return;
    }
    if (typeof XLSX === 'undefined') {
        showToast('SheetJS ยังโหลดไม่เสร็จ กรุณาลองใหม่', 'error');
        return;
    }

    const { deptSummary, topics } = _deptCompletion;
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Dept Summary ──────────────────────────────────────────────
    const summaryData = [
        ['แผนก', 'ตอบแล้ว', 'ทั้งหมด', 'ความคืบหน้า (%)', 'รอการอนุมัติ', 'ถูกปฏิเสธ', 'ล่าสุด'],
        ...[...deptSummary].sort((a, b) => b.completionPct - a.completionPct).map(d => [
            d.department,
            d.respondedCount,
            d.totalTopics,
            d.completionPct,
            d.pendingApproval,
            d.rejected,
            d.lastResponse ? new Date(d.lastResponse).toLocaleDateString('th-TH') : '-',
        ]),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'สรุปรายแผนก');

    // ── Sheet 2: Topic × Dept Matrix ──────────────────────────────────────
    const topicHeaders = topics.map(t => (t.Title || t.TopicDescription).slice(0, 30));
    const matrixHeader = ['แผนก', ...topicHeaders, 'รวม (%)'];
    const sorted = [...deptSummary].sort((a, b) => b.completionPct - a.completionPct);
    const matrixRows = sorted.map(d => [
        d.department,
        ...d.topicBreakdown.map(tb => {
            if (!tb.responded) return '—';
            const status = tb.approvalStatus;
            if (status === 'pending')  return '✓ (รอ)';
            if (status === 'rejected') return '✗ (ปฏิเสธ)';
            return '✓';
        }),
        `${d.completionPct}%`,
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([matrixHeader, ...matrixRows]);
    ws2['!cols'] = [{ wch: 25 }, ...topics.map(() => ({ wch: 18 })), { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Matrix');

    // ── Sheet 3: Missing Depts per Topic ──────────────────────────────────
    const missingRows = [['หัวข้อ', 'ระดับความเสี่ยง', 'แผนกที่ยังไม่ตอบ', 'จำนวนที่ขาด']];
    topics.forEach(t => {
        const missing = deptSummary
            .filter(d => !d.topicBreakdown.some(tb => tb.YokotenID === t.YokotenID && tb.responded))
            .map(d => d.department);
        if (missing.length > 0) {
            missingRows.push([
                t.Title || t.TopicDescription,
                RISK_LABEL[t.RiskLevel] || t.RiskLevel,
                missing.join(', '),
                missing.length,
            ]);
        }
    });
    if (missingRows.length > 1) {
        const ws3 = XLSX.utils.aoa_to_sheet(missingRows);
        ws3['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 50 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws3, 'แผนกที่ยังไม่ตอบ');
    }

    const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    XLSX.writeFile(wb, `Yokoten-Completion-${today}.xlsx`);
    showToast('Export Excel สำเร็จ', 'success');
}

// ─── EXPORT PDF ───────────────────────────────────────────────────────────────
async function exportYokotenPDF() {
    if (!window.jspdf || !window.html2canvas) {
        showToast('ไม่พบ jsPDF หรือ html2canvas กรุณาโหลดหน้าใหม่', 'error'); return;
    }
    if (!_deptCompletion?.deptSummary?.length) {
        showToast('ไม่มีข้อมูลสำหรับสร้าง PDF', 'error'); return;
    }

    const { topics } = _deptCompletion;
    // PDF uses only targeted depts — consistent with dashboard and admin views
    const deptSummary = _filterToTargetedDepts(_deptCompletion.deptSummary, topics);

    const now     = new Date();
    const pad     = n => String(n).padStart(2, '0');
    const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    const year    = now.getFullYear();
    const docNo   = 'YOK-' + year + '-' + pad(now.getMonth() + 1) + pad(now.getDate());
    const K       = "font-family:'Kanit',sans-serif;";

    const totalDepts     = deptSummary.length;
    const totalTopics    = topics.length;
    const fullDepts      = deptSummary.filter(d => d.completionPct === 100).length;
    const pendingApprTot = deptSummary.reduce((s, d) => s + (d.pendingApproval || 0), 0);
    const overallPct     = totalDepts > 0
        ? Math.round(deptSummary.reduce((s, d) => s + d.completionPct, 0) / totalDepts) : 0;
    const sorted = [...deptSummary].sort((a, b) => b.completionPct - a.completionPct);
    const pctCol = pct => pct === 100 ? '#059669' : pct >= 50 ? '#f59e0b' : '#ef4444';

    // ── Shared page constants ─────────────────────────────────────────────────
    const PAGE_S = K + 'width:794px;height:1122px;overflow:hidden;background:white;box-sizing:border-box;display:flex;flex-direction:column';

    const PAGE_FOOTER = '<div style="height:32px;background:linear-gradient(135deg,#064e3b,#0d9488);display:flex;align-items:center;justify-content:space-between;padding:0 36px;flex-shrink:0">'
        + '<span style="' + K + 'color:rgba(255,255,255,.65);font-size:8px">TSH Safety Core Activity System · รายงานสร้างโดยระบบอัตโนมัติ</span>'
        + '<span style="' + K + 'color:rgba(255,255,255,.65);font-size:8px">' + docNo + ' · ประจำปี ' + year + '</span>'
        + '</div>';

    const HEADER_BLOCK = '<div style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%);padding:22px 36px 18px;position:relative;overflow:hidden;flex-shrink:0">'
        + '<div style="position:absolute;top:-50px;right:-50px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.05)"></div>'
        + '<div style="position:relative;z-index:1">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">'
        + '<div>'
        + '<div style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.15);border-radius:20px;padding:3px 10px;margin-bottom:8px">'
        + '<span style="width:5px;height:5px;background:#34d399;border-radius:50%;display:inline-block"></span>'
        + '<span style="' + K + 'color:rgba(255,255,255,.85);font-size:9px;font-weight:600;letter-spacing:1.2px">OFFICIAL REPORT</span>'
        + '</div>'
        + '<div style="' + K + 'color:white;font-size:18px;font-weight:700;line-height:1.2;margin-bottom:3px">รายงานสรุป Yokoten</div>'
        + '<div style="' + K + 'color:rgba(255,255,255,.65);font-size:11px">Lesson Learned Sharing · Thai Summit Harness Co., Ltd.</div>'
        + '</div>'
        + '<div style="text-align:right">'
        + '<div style="' + K + 'color:rgba(255,255,255,.45);font-size:8.5px;margin-bottom:2px">เลขที่เอกสาร</div>'
        + '<div style="' + K + 'color:white;font-size:11px;font-weight:700">' + docNo + '</div>'
        + '<div style="' + K + 'color:rgba(255,255,255,.45);font-size:8.5px;margin-top:5px;margin-bottom:2px">วันที่สร้างรายงาน</div>'
        + '<div style="' + K + 'color:rgba(255,255,255,.65);font-size:10px">' + dateStr + '</div>'
        + '</div></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">'
        + '<div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px 12px;text-align:center"><div style="' + K + 'color:white;font-size:20px;font-weight:700">' + totalTopics + '</div><div style="' + K + 'color:rgba(255,255,255,.55);font-size:9px;margin-top:2px">หัวข้อ Yokoten</div></div>'
        + '<div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px 12px;text-align:center"><div style="' + K + 'color:white;font-size:20px;font-weight:700">' + totalDepts + '</div><div style="' + K + 'color:rgba(255,255,255,.55);font-size:9px;margin-top:2px">ส่วนงานทั้งหมด</div></div>'
        + '<div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px 12px;text-align:center"><div style="' + K + 'color:white;font-size:20px;font-weight:700">' + fullDepts + '</div><div style="' + K + 'color:rgba(255,255,255,.55);font-size:9px;margin-top:2px">ตอบครบทุกหัวข้อ</div></div>'
        + '<div style="background:rgba(255,255,255,.18);border-radius:10px;padding:10px 12px;text-align:center;border:1px solid rgba(255,255,255,.2)"><div style="' + K + 'color:#6ee7b7;font-size:20px;font-weight:700">' + overallPct + '%</div><div style="' + K + 'color:rgba(255,255,255,.55);font-size:9px;margin-top:2px">ความคืบหน้ารวม</div></div>'
        + '</div></div></div>';

    // ── Dept table helpers ────────────────────────────────────────────────────
    const THEAD = '<thead><tr style="background:linear-gradient(135deg,#064e3b,#0d9488)">'
        + '<th style="' + K + 'padding:7px 8px;color:rgba(255,255,255,.9);font-size:9px;text-align:center;width:24px">#</th>'
        + '<th style="' + K + 'padding:7px 8px;color:rgba(255,255,255,.9);font-size:9px;text-align:left">ส่วนงาน</th>'
        + '<th style="' + K + 'padding:7px 8px;color:rgba(255,255,255,.9);font-size:9px;text-align:center">ตอบ</th>'
        + '<th style="' + K + 'padding:7px 8px;color:rgba(255,255,255,.9);font-size:9px;text-align:center">ทั้งหมด</th>'
        + '<th style="' + K + 'padding:7px 8px;color:rgba(255,255,255,.9);font-size:9px;text-align:left;min-width:110px">ความคืบหน้า</th>'
        + '<th style="' + K + 'padding:7px 8px;color:rgba(255,255,255,.9);font-size:9px;text-align:center">รออนุมัติ</th>'
        + '<th style="' + K + 'padding:7px 8px;color:rgba(255,255,255,.9);font-size:9px;text-align:center">ส่งกลับ</th>'
        + '<th style="' + K + 'padding:7px 8px;color:rgba(255,255,255,.9);font-size:9px;text-align:center">ล่าสุด</th>'
        + '</tr></thead>';

    const makeRow = (d, idx) => {
        const pct  = d.completionPct;
        const pc   = pctCol(pct);
        const last = d.lastResponse
            ? new Date(d.lastResponse).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })
            : '—';
        return '<tr style="background:' + (idx % 2 === 0 ? '#f0fdf4' : '#fff') + ';border-bottom:1px solid #e8f5ee">'
            + '<td style="' + K + 'padding:5px 8px;font-size:9px;color:#94a3b8;text-align:center">' + (idx + 1) + '</td>'
            + '<td style="' + K + 'padding:5px 8px;font-size:9.5px;font-weight:600;color:#1e293b">' + (d.department || '—') + '</td>'
            + '<td style="' + K + 'padding:5px 8px;font-size:9.5px;font-weight:700;color:#059669;text-align:center">' + d.respondedCount + '</td>'
            + '<td style="' + K + 'padding:5px 8px;font-size:9.5px;color:#475569;text-align:center">' + d.totalTopics + '</td>'
            + '<td style="' + K + 'padding:5px 10px"><div style="display:flex;align-items:center;gap:4px">'
            + '<div style="flex:1;height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden">'
            + '<div style="height:100%;width:' + Math.min(pct, 100) + '%;background:' + pc + ';border-radius:3px"></div></div>'
            + '<span style="' + K + 'font-size:9px;font-weight:700;color:' + pc + ';min-width:26px;text-align:right">' + pct + '%</span>'
            + '</div></td>'
            + '<td style="' + K + 'padding:5px 8px;font-size:9.5px;text-align:center;color:' + (d.pendingApproval > 0 ? '#d97706' : '#cbd5e1') + ';font-weight:' + (d.pendingApproval > 0 ? '700' : '400') + '">' + (d.pendingApproval || '—') + '</td>'
            + '<td style="' + K + 'padding:5px 8px;font-size:9.5px;text-align:center;color:' + (d.rejected > 0 ? '#dc2626' : '#cbd5e1') + ';font-weight:' + (d.rejected > 0 ? '700' : '400') + '">' + (d.rejected || '—') + '</td>'
            + '<td style="' + K + 'padding:5px 8px;font-size:8.5px;color:#94a3b8;text-align:center">' + last + '</td>'
            + '</tr>';
    };

    const TABLE_LABEL = '<div style="' + K + 'padding:10px 36px 0;display:flex;align-items:center;gap:6px">'
        + '<div style="width:3px;height:14px;background:#059669;border-radius:2px"></div>'
        + '<span style="' + K + 'font-size:10px;font-weight:700;color:#334155">ความคืบหน้ารายส่วนงาน (' + totalDepts + ' ส่วนงาน)</span></div>';
    const CONT_LABEL = '<div style="' + K + 'padding:8px 36px 0;display:flex;justify-content:space-between;align-items:center">'
        + '<span style="' + K + 'font-size:9px;color:#94a3b8;font-style:italic">ความคืบหน้ารายส่วนงาน (ต่อ)</span>'
        + '<span style="' + K + 'font-size:9px;color:#94a3b8">' + docNo + '</span></div>';

    // ── Build data pages ──────────────────────────────────────────────────────
    const pageHTMLs = [];
    const ROWS_P1   = 22;
    const ROWS_FULL = 28;
    const chunks = [{ rows: sorted.slice(0, ROWS_P1), isFirst: true, startIdx: 0 }];
    for (let i = ROWS_P1; i < sorted.length; i += ROWS_FULL) {
        chunks.push({ rows: sorted.slice(i, i + ROWS_FULL), isFirst: false, startIdx: i });
    }
    chunks.forEach(chunk => {
        const rowsHtml = chunk.rows.map((d, j) => makeRow(d, chunk.startIdx + j)).join('');
        if (chunk.isFirst) {
            pageHTMLs.push('<div style="' + PAGE_S + '">'
                + '<div style="flex:1;min-height:0">'
                + HEADER_BLOCK + TABLE_LABEL
                + '<div style="padding:4px 36px 0"><table style="width:100%;border-collapse:collapse">'
                + THEAD + '<tbody>' + rowsHtml + '</tbody></table></div>'
                + '</div>' + PAGE_FOOTER + '</div>');
        } else {
            pageHTMLs.push('<div style="' + PAGE_S + '">'
                + '<div style="flex:1;min-height:0">'
                + CONT_LABEL
                + '<div style="padding:4px 36px 0"><table style="width:100%;border-collapse:collapse">'
                + THEAD + '<tbody>' + rowsHtml + '</tbody></table></div>'
                + '</div>' + PAGE_FOOTER + '</div>');
        }
    });

    // ── Summary page ──────────────────────────────────────────────────────────
    const barRowsHTML = sorted.map(d => {
        const pc = pctCol(d.completionPct);
        return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3.5px">'
            + '<div style="width:115px;font-size:8px;color:#475569;text-align:right;flex-shrink:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + d.department + '</div>'
            + '<div style="flex:1;height:7px;background:#f1f5f9;border-radius:4px;overflow:hidden">'
            + '<div style="height:100%;width:' + d.completionPct + '%;background:' + pc + ';border-radius:4px"></div></div>'
            + '<span style="' + K + 'font-size:7.5px;font-weight:700;color:' + pc + ';width:24px;flex-shrink:0">' + d.completionPct + '%</span>'
            + '</div>';
    }).join('');

    const topicRowsHTML = topics.map(t => {
        const targeted = _getTopicTargetedDepts(deptSummary, t);
        const deptResp = targeted.filter(d => d.topicBreakdown.some(tb => tb.YokotenID === t.YokotenID && tb.responded)).length;
        const tPct   = targeted.length > 0 ? Math.round(deptResp * 100 / targeted.length) : 0;
        const tColor = pctCol(tPct);
        const rColors = { Critical: '#ef4444', High: '#f97316', Medium: '#f59e0b', Low: '#10b981' };
        const rColor  = rColors[t.RiskLevel] || '#94a3b8';
        const titleRaw = t.Title || _htmlToText(t.TopicDescription) || '';
        const title    = titleRaw.slice(0, 30) + (titleRaw.length > 30 ? '…' : '');
        return '<tr style="border-bottom:1px solid #f1f5f9">'
            + '<td style="' + K + 'padding:5px 8px;font-size:8.5px;color:#1e293b">' + title + '</td>'
            + '<td style="padding:5px 6px;text-align:center"><span style="' + K + 'background:' + rColor + '20;color:' + rColor + ';font-size:7.5px;font-weight:700;padding:2px 6px;border-radius:10px">' + (t.RiskLevel || '—') + '</span></td>'
            + '<td style="' + K + 'padding:5px 6px;font-size:8.5px;font-weight:700;color:' + tColor + ';text-align:center">' + tPct + '%</td>'
            + '<td style="' + K + 'padding:5px 6px;font-size:8px;color:#94a3b8;text-align:center">' + deptResp + '/' + targeted.length + '</td>'
            + '</tr>';
    }).join('');

    pageHTMLs.push('<div style="' + K + 'width:794px;height:1122px;background:white;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden">'
        + '<div style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%);padding:28px 60px 24px;position:relative;overflow:hidden;flex-shrink:0">'
        + '<div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.05)"></div>'
        + '<div style="position:relative;z-index:1">'
        + '<div style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.15);border-radius:20px;padding:3px 10px;margin-bottom:10px">'
        + '<span style="width:5px;height:5px;background:#34d399;border-radius:50%;display:inline-block"></span>'
        + '<span style="' + K + 'color:rgba(255,255,255,.85);font-size:9px;font-weight:600;letter-spacing:1.2px">SUMMARY REPORT</span>'
        + '</div>'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-end">'
        + '<div><div style="' + K + 'color:white;font-size:22px;font-weight:700;line-height:1.2;margin-bottom:4px">สรุปผลรายงาน Yokoten</div>'
        + '<div style="' + K + 'color:rgba(255,255,255,.65);font-size:11px">Thai Summit Harness Co., Ltd. · ' + dateStr + '</div></div>'
        + '<div style="text-align:right"><div style="' + K + 'color:rgba(255,255,255,.45);font-size:8px;margin-bottom:2px">เลขที่เอกสาร</div>'
        + '<div style="' + K + 'color:white;font-size:11px;font-weight:700">' + docNo + '</div></div>'
        + '</div></div></div>'
        // Content
        + '<div style="flex:1;padding:30px 60px;display:flex;flex-direction:column;gap:20px;min-height:0;overflow:hidden">'
        // KPI row
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;flex-shrink:0">'
        + '<div style="background:#f0fdf4;border-radius:12px;padding:16px;text-align:center;border:1px solid #d1fae5"><div style="' + K + 'font-size:28px;font-weight:700;color:#059669">' + fullDepts + '</div><div style="' + K + 'font-size:8.5px;color:#6ee7b7;margin-top:3px">ตอบครบทุกหัวข้อ</div></div>'
        + '<div style="background:#f8fafc;border-radius:12px;padding:16px;text-align:center;border:1px solid #e2e8f0"><div style="' + K + 'font-size:28px;font-weight:700;color:#475569">' + totalDepts + '</div><div style="' + K + 'font-size:8.5px;color:#94a3b8;margin-top:3px">ส่วนงานทั้งหมด</div></div>'
        + '<div style="background:#fffbeb;border-radius:12px;padding:16px;text-align:center;border:1px solid #fef3c7"><div style="' + K + 'font-size:28px;font-weight:700;color:#d97706">' + pendingApprTot + '</div><div style="' + K + 'font-size:8.5px;color:#fbbf24;margin-top:3px">รออนุมัติ</div></div>'
        + '<div style="background:linear-gradient(135deg,#064e3b,#0d9488);border-radius:12px;padding:16px;text-align:center"><div style="' + K + 'font-size:28px;font-weight:700;color:#6ee7b7">' + overallPct + '%</div><div style="' + K + 'font-size:8.5px;color:rgba(255,255,255,.65);margin-top:3px">ความคืบหน้ารวม</div></div>'
        + '</div>'
        // 2-col: bar chart visual + topic table
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;flex:1;min-height:0;overflow:hidden">'
        // Left: CSS bar chart
        + '<div style="overflow:hidden">'
        + '<div style="' + K + 'font-size:9.5px;font-weight:700;color:#64748b;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:10px">ความคืบหน้ารายส่วนงาน</div>'
        + barRowsHTML
        + '</div>'
        // Right: topic summary
        + '<div>'
        + '<div style="' + K + 'font-size:9.5px;font-weight:700;color:#64748b;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:10px">สรุปรายหัวข้อ</div>'
        + '<table style="width:100%;border-collapse:collapse">'
        + '<thead><tr style="background:#f8fafc"><th style="' + K + 'padding:5px 8px;font-size:7.5px;color:#94a3b8;text-align:left;font-weight:600">หัวข้อ</th><th style="' + K + 'padding:5px 6px;font-size:7.5px;color:#94a3b8;text-align:center;font-weight:600">ระดับ</th><th style="' + K + 'padding:5px 6px;font-size:7.5px;color:#94a3b8;text-align:center;font-weight:600">%</th><th style="' + K + 'padding:5px 6px;font-size:7.5px;color:#94a3b8;text-align:center;font-weight:600">ตอบ</th></tr></thead>'
        + '<tbody>' + topicRowsHTML + '</tbody>'
        + '</table>'
        + '</div>'
        + '</div>'
        + '</div>'
        // Footer
        + '<div style="padding:12px 60px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">'
        + '<span style="' + K + 'font-size:7.5px;color:#94a3b8">TSH Safety Core Activity System · รายงานสร้างโดยระบบอัตโนมัติ</span>'
        + '<span style="' + K + 'font-size:7.5px;color:#94a3b8">' + dateStr + ' · ' + docNo + '</span>'
        + '</div>'
        + '</div>');

    // ── Render ────────────────────────────────────────────────────────────────
    showLoading('กำลังสร้าง PDF...');
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 300));

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const renderPage = async html => {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1';
            el.innerHTML = html;
            document.body.appendChild(el);
            const c = await window.html2canvas(el.firstElementChild, {
                scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', windowWidth: 794,
            });
            document.body.removeChild(el);
            return c;
        };

        for (let i = 0; i < pageHTMLs.length; i++) {
            if (i > 0) pdf.addPage();
            const canvas = await renderPage(pageHTMLs[i]);
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 210, 297);
        }

        const total = pdf.getNumberOfPages();
        for (let p = 1; p <= total; p++) {
            pdf.setPage(p);
            pdf.setFontSize(7.5); pdf.setTextColor(148, 163, 184);
            pdf.text('หน้า ' + p + ' / ' + total, 200, 293, { align: 'right' });
        }

        const fname = 'Yokoten-Report-' + year + '-' + pad(now.getMonth() + 1) + pad(now.getDate()) + '.pdf';
        pdf.save(fname);
        showToast('สร้าง PDF สำเร็จ (' + pageHTMLs.length + ' หน้า)', 'success');
    } catch (err) {
        showToast('เกิดข้อผิดพลาดในการสร้าง PDF: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

/**
 * Filter deptSummary to only include departments that are targeted by at
 * least one topic (respects per-topic TargetDepts; null = all depts).
 * Used by dashboard exec section, dept completion tab, chart, and PDF export
 * to ensure only admin-configured departments are shown.
 */
function _filterToTargetedDepts(deptSummary, topicsArr) {
    if (!deptSummary?.length || !topicsArr?.length) return deptSummary || [];
    const targeted = new Set();
    topicsArr.forEach(t => {
        const td = _parseTargetDepts(t.TargetDepts);
        if (td.length === 0) {
            // Topic targets all depts → every dept in summary is included
            deptSummary.forEach(d => targeted.add(d.department));
        } else {
            td.forEach(name => targeted.add(name));
        }
    });
    return deptSummary.filter(d => targeted.has(d.department));
}

/**
 * Return only the depts in deptSummary that are targeted by a specific topic.
 */
function _getTopicTargetedDepts(deptSummary, topic) {
    const td = _parseTargetDepts(topic?.TargetDepts);
    if (td.length === 0) return deptSummary; // no restriction = all depts
    return deptSummary.filter(d => td.includes(d.department));
}

/** Strip script/iframe/on* handlers from HTML before rendering. */
function _sanitizeHtml(html) {
    if (!html) return '';
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe[\s\S]*?>/gi, '')
        .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript:/gi, '');
}

/** Convert HTML to plain text (for card previews / truncation). */
function _htmlToText(html) {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function _kpiCard(value, label, _color, iconPath, colorName) {
    return `
    <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-${colorName}-50">
            <svg class="w-5 h-5 text-${colorName}-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${iconPath}
            </svg>
        </div>
        <div>
            <p class="text-2xl font-bold text-slate-800">${value}</p>
            <p class="text-xs text-slate-500">${label}</p>
        </div>
    </div>`;
}

function _parseTargetDepts(raw) {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
}

function _urgency(deadline) {
    if (!deadline) return 0;
    const diff = new Date(deadline) - new Date();
    if (diff < 0) return 3;           // overdue
    if (diff < 86400000) return 2;    // today
    if (diff < 3 * 86400000) return 1; // near
    return 0;
}

function _isNearDeadline(deadline) {
    if (!deadline) return false;
    const diff = new Date(deadline) - new Date();
    return diff > 0 && diff < 3 * 86400000;
}
function _isOverdue(deadline) {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
}
function _isNearOrOver(deadline) {
    return _isNearDeadline(deadline) || _isOverdue(deadline);
}

function _deadlineBadge(deadline, acked) {
    if (!deadline || acked) return '';
    const d    = new Date(deadline);
    const now  = new Date();
    const diff = d - now;
    if (diff < 0)          return `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">เกินกำหนด</span>`;
    if (diff < 86400000)   return `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 animate-pulse">ครบกำหนดวันนี้</span>`;
    if (diff < 3*86400000) return `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700">ใกล้ครบกำหนด</span>`;
    return `<span class="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500">กำหนด: ${_fmtDateOnly(deadline)}</span>`;
}

function _fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}
function _fmtDateOnly(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fileIcon(mimeType) {
    const t = mimeType || '';
    if (t.startsWith('image/'))
        return `<svg class="w-3.5 h-3.5 flex-shrink-0 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`;
    if (t === 'application/pdf')
        return `<svg class="w-3.5 h-3.5 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`;
    if (t.includes('word'))
        return `<svg class="w-3.5 h-3.5 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`;
    if (t.includes('excel') || t.includes('spreadsheet'))
        return `<svg class="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`;
    if (t.includes('presentation') || t.includes('powerpoint'))
        return `<svg class="w-3.5 h-3.5 flex-shrink-0 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`;
    return `<svg class="w-3.5 h-3.5 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>`;
}

function _spinner() {
    return `<div class="flex flex-col items-center justify-center py-20 text-slate-400">
        <div class="animate-spin rounded-full h-9 w-9 border-4 border-emerald-500 border-t-transparent mb-3"></div>
        <p class="text-sm">กำลังโหลด...</p>
    </div>`;
}

function _debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
