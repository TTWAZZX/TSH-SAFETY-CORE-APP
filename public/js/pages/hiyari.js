// public/js/pages/hiyari.js
import { API } from '../api.js';
import {
    hideLoading, showError, showLoading,
    openModal, closeModal, showToast, showConfirmationModal, showDocumentModal
} from '../ui.js';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const CONSEQUENCES = [
    'บาดเจ็บเล็กน้อย', 'บาดเจ็บรุนแรง', 'เสียชีวิต',
    'ทรัพย์สินเสียหาย', 'ผลกระทบต่อสิ่งแวดล้อม',
    'การหยุดชะงักการผลิต', 'อื่นๆ',
];
const RISK_LEVELS = ['Low', 'Medium', 'High', 'Critical'];
const STATUSES    = ['Open', 'In Progress', 'Closed'];

const RISK_BADGE = {
    Low:      'bg-emerald-100 text-emerald-700',
    Medium:   'bg-yellow-100 text-yellow-700',
    High:     'bg-orange-100 text-orange-700',
    Critical: 'bg-red-100 text-red-700',
};
const RISK_LABEL = { Low: 'ต่ำ', Medium: 'ปานกลาง', High: 'สูง', Critical: 'วิกฤต' };

const STATUS_BADGE = {
    'Open':        'bg-sky-100 text-sky-700',
    'In Progress': 'bg-amber-100 text-amber-700',
    'Closed':      'bg-slate-100 text-slate-500',
};
const STATUS_LABEL = { 'Open': 'รอดำเนินการ', 'In Progress': 'กำลังดำเนินการ', 'Closed': 'ปิดแล้ว' };

const CHART_COLORS = ['#f97316','#ef4444','#8b5cf6','#06b6d4','#10b981','#f59e0b','#6366f1'];

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _isAdmin        = false;
let _activeTab      = 'dashboard';
let _reports        = [];
let _statsYear      = new Date().getFullYear();
let _filterStatus   = 'all';
let _filterDept     = 'all';
let _filterRisk     = 'all';
let _searchQ        = '';
let _departments    = [];
let _listenersReady = false;
let _chartLine      = null;
let _chartPie       = null;
let _chartBar       = null;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadHiyariPage() {
    const container = document.getElementById('hiyari-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _isAdmin = user.role === 'Admin' || user.Role === 'Admin';

    window.closeModal = closeModal;

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    // Load departments for form
    try {
        const res = await API.get('/master/departments');
        _departments = normalizeApiArray(res?.data ?? res).map(d => d.Name || d.name).filter(Boolean);
    } catch (_) { _departments = []; }

    _activeTab = window._getTab?.('hiyari', _activeTab) || _activeTab;
    switchTab(_activeTab);
    _loadHeroStats();   // async — fills stats strip without blocking tab render
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB CONFIG
// ─────────────────────────────────────────────────────────────────────────────
function _getTabs() {
    return [
        { id: 'dashboard', label: 'Dashboard',     icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
        { id: 'submit',    label: 'รายงานใหม่',   icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>` },
        { id: 'history',   label: 'ประวัติ',       icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>` },
        ...(_isAdmin ? [{ id: 'manage', label: 'จัดการ', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>` }] : []),
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    const tabHtml = _getTabs().map(t => `
        <button id="hiyari-tab-btn-${t.id}" data-tab="${t.id}"
            class="hiyari-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <!-- dot pattern -->
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="hiyari-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#hiyari-dots)"/></svg>
            </div>
            <!-- glow orb -->
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none"
                 style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <!-- Title row -->
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                </svg>
                                Hiyari-Hatto
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">รายงานเหตุการณ์เฉียดอุบัติเหตุ</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Near Miss Reporting · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <!-- Stats strip -->
                    <div id="hiyari-hero-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 w-full md:w-auto flex-shrink-0"></div>
                </div>

                <!-- Tab bar -->
                <div class="flex overflow-x-auto gap-0 -mb-px scrollbar-none">
                    ${tabHtml}
                </div>
            </div>
        </div>

        <!-- Tab Content -->
        <div id="hiyari-tab-content" class="min-h-[400px]"></div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────────────────────────────────────────
async function switchTab(tab) {
    _activeTab = tab;
    window._saveTab?.('hiyari', tab);

    const active   = 'hiyari-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white';
    const inactive = 'hiyari-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';

    _getTabs().forEach(t => {
        const btn = document.getElementById(`hiyari-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === tab ? active : inactive;
        btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>${t.label}`;
    });

    const content = document.getElementById('hiyari-tab-content');
    if (!content) return;

    content.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 text-slate-400">
            <div class="animate-spin rounded-full h-9 w-9 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <p class="text-sm">กำลังโหลด...</p>
        </div>`;

    switch (tab) {
        case 'dashboard': await renderDashboard(content); break;
        case 'submit':    renderSubmitForm(content);      break;
        case 'history':   await renderHistory(content);  break;
        case 'manage':    await renderManage(content);   break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO STATS STRIP
// ─────────────────────────────────────────────────────────────────────────────
async function _loadHeroStats() {
    const strip = document.getElementById('hiyari-hero-stats');
    if (!strip) return;

    // Skeleton while loading
    strip.innerHTML = [1,2,3,4].map(() => `
        <div class="rounded-xl px-4 py-3 text-center animate-pulse" style="background:rgba(255,255,255,0.12);min-width:80px">
            <div class="h-7 bg-white/20 rounded-lg mb-1.5 mx-auto w-10"></div>
            <div class="h-3 bg-white/15 rounded w-14 mx-auto"></div>
        </div>`).join('');

    try {
        const year = new Date().getFullYear();
        const res  = await API.get(`/hiyari/stats?year=${year}`);
        const kpi  = res?.data?.kpi || {};

        const stats = [
            { value: kpi.total      ?? '—', label: 'ทั้งหมด',       color: '#6ee7b7' },
            { value: kpi.open       ?? '—', label: 'รอดำเนินการ',    color: '#6ee7b7' },
            { value: kpi.inProgress ?? '—', label: 'กำลังดำเนินการ', color: (kpi.inProgress > 0) ? '#fde68a' : '#6ee7b7' },
            { value: kpi.closed     ?? '—', label: 'ปิดแล้ว',        color: '#6ee7b7' },
        ];

        strip.innerHTML = stats.map(s => `
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
                <p class="text-2xl font-bold" style="color:${s.color}">${s.value}</p>
                <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${s.label}</p>
            </div>`).join('');
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
            <!-- Year picker -->
            <div class="flex justify-end">
                <select id="stats-year" class="form-input py-1.5 text-sm w-32">
                    ${[0,1,2].map(i => {
                        const y = new Date().getFullYear() - i;
                        return `<option value="${y}" ${y === _statsYear ? 'selected' : ''}>${y}</option>`;
                    }).join('')}
                </select>
            </div>
            <!-- KPI row -->
            <div id="kpi-row" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                ${[1,2,3,4].map(() => `<div class="card p-4 animate-pulse"><div class="h-8 bg-slate-100 rounded mb-2"></div><div class="h-4 bg-slate-50 rounded w-2/3"></div></div>`).join('')}
            </div>
            <!-- Charts row -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="lg:col-span-2 card p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">แนวโน้มรายงานรายเดือน</h3>
                    <div class="relative" style="height:220px"><canvas id="chart-line"></canvas></div>
                </div>
                <div class="card p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">ผลที่อาจเกิดขึ้น</h3>
                    <div class="relative" style="height:220px"><canvas id="chart-pie"></canvas></div>
                </div>
            </div>
            <!-- Bottom row -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="card p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">ระดับความเสี่ยง</h3>
                    <div class="relative" style="height:180px"><canvas id="chart-risk"></canvas></div>
                </div>
                <div class="card p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">แผนกที่รายงานมากที่สุด</h3>
                    <div id="dept-rank" class="space-y-2"></div>
                </div>
            </div>
        </div>`;

    try {
        const res  = await API.get(`/hiyari/stats?year=${_statsYear}`);
        const data = res?.data || {};
        renderKPI(data.kpi || {});
        renderLineChart(data.monthly || []);
        renderPieChart(data.consequence || []);
        renderRiskChart(data.riskDist || []);
        renderDeptRank(data.deptRank || []);
    } catch (error) {
        console.error('Stats error:', error);
    }
}

function renderKPI(kpi) {
    const cards = [
        { label: 'รายงานทั้งหมด', value: kpi.total || 0, color: '#f97316', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>` },
        { label: 'รอดำเนินการ',   value: kpi.open  || 0, color: '#0284c7', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
        { label: 'กำลังดำเนินการ', value: kpi.inProgress || 0, color: '#d97706', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>` },
        { label: 'ปิดแล้ว',        value: kpi.closed || 0, color: '#059669', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
    ];
    const row = document.getElementById('kpi-row');
    if (!row) return;
    row.innerHTML = cards.map(c => `
        <div class="card p-5 flex items-center gap-4">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                 style="background:${c.color}18; color:${c.color}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${c.icon}</svg>
            </div>
            <div>
                <div class="text-2xl font-bold text-slate-800">${c.value}</div>
                <div class="text-xs text-slate-500 mt-0.5">${c.label}</div>
            </div>
        </div>`).join('');
}

function renderLineChart(monthly) {
    const ctx = document.getElementById('chart-line');
    if (!ctx) return;
    if (_chartLine) { _chartLine.destroy(); _chartLine = null; }

    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const counts  = Array(12).fill(0);
    monthly.forEach(r => { counts[(r.month || 1) - 1] = r.count || 0; });

    _chartLine = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'จำนวนรายงาน',
                data: counts,
                borderColor: '#f97316',
                backgroundColor: 'rgba(249,115,22,0.08)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#f97316',
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

function renderPieChart(data) {
    const ctx = document.getElementById('chart-pie');
    if (!ctx) return;
    if (_chartPie) { _chartPie.destroy(); _chartPie = null; }

    _chartPie = new Chart(ctx, {
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
                legend: { position: 'bottom', labels: { font: { family: 'Kanit', size: 11 }, padding: 10, boxWidth: 12 } }
            },
            cutout: '55%',
        }
    });
}

function renderRiskChart(data) {
    const ctx = document.getElementById('chart-risk');
    if (!ctx) return;
    if (_chartBar) { _chartBar.destroy(); _chartBar = null; }

    const colors = { Critical: '#ef4444', High: '#f97316', Medium: '#f59e0b', Low: '#10b981' };
    const ordered = ['Critical', 'High', 'Medium', 'Low'];
    const map = Object.fromEntries(data.map(d => [d.level, d.count]));

    _chartBar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ordered.map(l => RISK_LABEL[l] || l),
            datasets: [{
                data: ordered.map(l => map[l] || 0),
                backgroundColor: ordered.map(l => colors[l] + '99'),
                borderColor: ordered.map(l => colors[l]),
                borderWidth: 2,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Kanit' } }, grid: { color: '#f1f5f9' } },
                x: { ticks: { font: { family: 'Kanit' } }, grid: { display: false } },
            },
        }
    });
}

function renderDeptRank(depts) {
    const el = document.getElementById('dept-rank');
    if (!el) return;
    if (!depts.length) { el.innerHTML = '<p class="text-xs text-slate-400">ยังไม่มีข้อมูล</p>'; return; }
    const max = depts[0].count || 1;
    el.innerHTML = depts.slice(0, 8).map((d, i) => `
        <div class="flex items-center gap-2">
            <span class="text-xs font-bold w-4 text-slate-400">${i + 1}</span>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center mb-0.5">
                    <span class="text-xs font-medium text-slate-700 truncate">${d.Department}</span>
                    <span class="text-xs font-bold text-orange-600 ml-2">${d.count}</span>
                </div>
                <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full rounded-full" style="width:${Math.round((d.count/max)*100)}%; background:linear-gradient(90deg,#f97316,#ef4444)"></div>
                </div>
            </div>
        </div>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: SUBMIT FORM
// ─────────────────────────────────────────────────────────────────────────────
function renderSubmitForm(container) {
    const user = TSHSession.getUser() || {};
    const today = new Date().toISOString().split('T')[0];

    container.innerHTML = `
        <div class="max-w-2xl mx-auto">
            <div class="card overflow-hidden">
                <div class="h-1.5 w-full" style="background:linear-gradient(90deg,#f97316,#ef4444)"></div>
                <div class="p-6 space-y-5">
                    <!-- Info banner -->
                    <div class="flex gap-2 p-3 bg-orange-50 border border-orange-100 rounded-xl text-sm text-orange-700">
                        <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <span>รายงาน Hiyari-Hatto ช่วยให้องค์กรป้องกันอุบัติเหตุก่อนที่จะเกิดขึ้น ขอบคุณสำหรับการมีส่วนร่วม</span>
                    </div>

                    <form id="hiyari-form" class="space-y-4">
                        <!-- Reporter info (read-only from JWT) -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้รายงาน</label>
                                <input type="text" class="form-input w-full bg-slate-50" value="${user.name || ''}" readonly>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก</label>
                                <input type="text" class="form-input w-full bg-slate-50" value="${user.department || ''}" readonly>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่เกิดเหตุ <span class="text-red-500">*</span></label>
                                <input type="date" name="ReportDate" class="form-input w-full" value="${today}" max="${today}" required>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานที่เกิดเหตุ</label>
                                <input type="text" name="Location" class="form-input w-full" placeholder="เช่น โรงงาน A / แผนก Stamping">
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดเหตุการณ์ <span class="text-red-500">*</span></label>
                            <textarea name="Description" rows="3" required
                                      class="form-input w-full resize-none"
                                      placeholder="อธิบายเหตุการณ์ที่เกิดขึ้น หรือเกือบเกิดขึ้น..."></textarea>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผลที่อาจเกิดขึ้น</label>
                                <select name="PotentialConsequence" class="form-input w-full">
                                    <option value="">-- เลือก --</option>
                                    ${CONSEQUENCES.map(c => `<option value="${c}">${c}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ระดับความเสี่ยง</label>
                                <select name="RiskLevel" class="form-input w-full">
                                    ${RISK_LEVELS.map(r => `<option value="${r}">${RISK_LABEL[r]}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ข้อเสนอแนะ / แนวทางปรับปรุง</label>
                            <textarea name="Suggestion" rows="2"
                                      class="form-input w-full resize-none"
                                      placeholder="ข้อเสนอแนะเพื่อป้องกันไม่ให้เกิดซ้ำ..."></textarea>
                        </div>

                        <!-- File upload -->
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ภาพหรือไฟล์แนบ</label>
                            <label id="hiyari-drop" class="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-6 cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-all group">
                                <svg class="w-8 h-8 text-slate-300 group-hover:text-orange-400 transition-colors mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                </svg>
                                <span class="text-sm text-slate-500">คลิกเพื่อเลือกภาพหลักฐาน</span>
                                <span class="text-xs text-slate-400 mt-1">JPG, PNG, PDF · ≤ 20 MB</span>
                                <input type="file" name="attachment" id="hiyari-file" class="hidden" accept=".jpg,.jpeg,.png,.webp,.pdf">
                            </label>
                            <div id="hiyari-file-preview" class="hidden mt-2 flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                                <svg class="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                                </svg>
                                <span id="hiyari-file-name" class="flex-1 truncate text-slate-700"></span>
                                <button type="button" id="hiyari-clear-file" class="text-slate-400 hover:text-red-500">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>
                        </div>

                        <div class="flex justify-end pt-2">
                            <button type="submit" id="hiyari-submit-btn"
                                    class="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
                                    style="background:linear-gradient(135deg,#f97316,#ef4444); box-shadow:0 2px 8px rgba(249,115,22,0.35)"
                                    onmouseover="this.style.transform='translateY(-1px)'"
                                    onmouseout="this.style.transform=''">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                                </svg>
                                ส่งรายงาน
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

    // File input preview
    const fileInput   = document.getElementById('hiyari-file');
    const preview     = document.getElementById('hiyari-file-preview');
    const fileName    = document.getElementById('hiyari-file-name');
    const clearBtn    = document.getElementById('hiyari-clear-file');

    fileInput?.addEventListener('change', () => {
        if (fileInput.files[0]) {
            fileName.textContent = fileInput.files[0].name;
            preview.classList.remove('hidden');
        }
    });
    clearBtn?.addEventListener('click', () => {
        fileInput.value = '';
        preview.classList.add('hidden');
    });

    // Form submit
    document.getElementById('hiyari-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('hiyari-submit-btn');
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> กำลังส่ง...`;

        try {
            showLoading('กำลังส่งรายงาน...');
            const fd = new FormData(e.target);
            await API.post('/hiyari', fd);
            closeModal?.();
            showToast('ส่งรายงาน Hiyari-Hatto สำเร็จ', 'success');
            e.target.reset();
            preview.classList.add('hidden');
        } catch (err) {
            showError(err);
        } finally {
            hideLoading();
            btn.disabled = false;
            btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> ส่งรายงาน`;
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: HISTORY
// ─────────────────────────────────────────────────────────────────────────────
async function renderHistory(container) {
    container.innerHTML = `
        <div class="space-y-4">
            <!-- Filter bar -->
            <div class="card p-4 flex flex-wrap gap-3 items-center justify-between">
                <div class="flex flex-wrap gap-2">
                    ${buildFilterSelect('filter-status', 'สถานะ', [
                        { v:'all', l:'ทุกสถานะ' },
                        ...STATUSES.map(s => ({ v:s, l: STATUS_LABEL[s] || s }))
                    ], _filterStatus)}
                    ${buildFilterSelect('filter-risk', 'ความเสี่ยง', [
                        { v:'all', l:'ทุกระดับ' },
                        ...RISK_LEVELS.map(r => ({ v:r, l: RISK_LABEL[r] || r }))
                    ], _filterRisk)}
                </div>
                <div class="relative w-full sm:w-64">
                    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input id="history-search" type="text" placeholder="ค้นหา..."
                           value="${_searchQ}"
                           class="form-input w-full pl-9 text-sm py-2">
                </div>
            </div>
            <!-- Table -->
            <div class="card overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">วันที่</th>
                                <th class="px-4 py-3">ผู้รายงาน</th>
                                <th class="px-4 py-3">แผนก</th>
                                <th class="px-4 py-3">สถานที่</th>
                                <th class="px-4 py-3">ผลที่อาจเกิด</th>
                                <th class="px-4 py-3">ความเสี่ยง</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="history-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="8" class="text-center py-8 text-slate-400">
                                <div class="animate-spin inline-block h-6 w-6 border-4 border-orange-400 border-t-transparent rounded-full mb-2"></div>
                                <div class="text-sm">กำลังโหลด...</div>
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

    await fetchAndRenderTable();
}

function buildFilterSelect(id, placeholder, opts, current) {
    return `<select id="${id}" class="form-input py-1.5 text-sm">
        ${opts.map(o => `<option value="${o.v}" ${o.v === current ? 'selected' : ''}>${o.l}</option>`).join('')}
    </select>`;
}

async function fetchAndRenderTable() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    try {
        const params = new URLSearchParams();
        if (_filterStatus !== 'all') params.set('status', _filterStatus);
        if (_filterRisk   !== 'all') params.set('risk',   _filterRisk);
        if (_searchQ.trim())         params.set('q',      _searchQ.trim());

        const res = await API.get(`/hiyari?${params}`);
        _reports  = normalizeApiArray(res?.data ?? res);
        renderTable();
    } catch (err) {
        console.error('History error:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500 text-sm">เกิดข้อผิดพลาด: ${err.message}</td></tr>`;
    }
}

function renderTable() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    if (!_reports.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400 text-sm">ไม่พบรายงาน</td></tr>`;
        return;
    }

    tbody.innerHTML = _reports.map(r => {
        const date = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
        return `
        <tr class="hover:bg-slate-50 transition-colors group">
            <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${date}</td>
            <td class="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">${r.ReporterName || '-'}</td>
            <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${r.Department || '-'}</td>
            <td class="px-4 py-3 text-slate-600 max-w-[120px] truncate">${r.Location || '-'}</td>
            <td class="px-4 py-3 text-slate-600 text-xs max-w-[120px] truncate">${r.PotentialConsequence || '-'}</td>
            <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_BADGE[r.RiskLevel] || 'bg-slate-100 text-slate-500'}">
                    ${RISK_LABEL[r.RiskLevel] || r.RiskLevel || '-'}
                </span>
            </td>
            <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">
                    ${STATUS_LABEL[r.Status] || r.Status || '-'}
                </span>
            </td>
            <td class="px-4 py-3 text-right">
                <button class="btn-view-report px-3 py-1 rounded-lg text-xs font-semibold text-orange-600 hover:bg-orange-50 transition-colors"
                        data-id="${r.id}">ดูรายละเอียด</button>
            </td>
        </tr>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: ADMIN MANAGE
// ─────────────────────────────────────────────────────────────────────────────
async function renderManage(container) {
    container.innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-wrap gap-2 items-center">
                ${buildFilterSelect('manage-filter-status', 'สถานะ', [
                    { v:'all', l:'ทุกสถานะ' },
                    ...STATUSES.map(s => ({ v:s, l: STATUS_LABEL[s] || s }))
                ], 'all')}
                <span class="text-xs text-slate-400">คลิก "จัดการ" เพื่ออัปเดตสถานะและ Corrective Action</span>
            </div>
            <div class="card overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">วันที่</th>
                                <th class="px-4 py-3">ผู้รายงาน / แผนก</th>
                                <th class="px-4 py-3">รายละเอียด</th>
                                <th class="px-4 py-3">ความเสี่ยง</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="manage-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="6" class="text-center py-8 text-slate-400">
                                <div class="animate-spin inline-block h-6 w-6 border-4 border-orange-400 border-t-transparent rounded-full mb-2"></div>
                                <div class="text-sm">กำลังโหลด...</div>
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

    await fetchAndRenderManage('all');
}

async function fetchAndRenderManage(statusFilter) {
    const tbody = document.getElementById('manage-tbody');
    if (!tbody) return;
    try {
        const params = new URLSearchParams();
        if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
        const res    = await API.get(`/hiyari?${params}`);
        const reports = normalizeApiArray(res?.data ?? res);

        if (!reports.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-slate-400 text-sm">ไม่พบรายงาน</td></tr>`;
            return;
        }

        tbody.innerHTML = reports.map(r => {
            const date = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">${date}</td>
                <td class="px-4 py-3">
                    <div class="font-medium text-slate-800">${r.ReporterName || '-'}</div>
                    <div class="text-xs text-slate-400">${r.Department || '-'}</div>
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs max-w-[200px]">
                    <div class="truncate">${r.Description || '-'}</div>
                    ${r.Location ? `<div class="text-slate-400 mt-0.5 flex items-center gap-1"><svg class="w-3 h-3 inline-block flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>${r.Location}</div>` : ''}
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_BADGE[r.RiskLevel] || 'bg-slate-100 text-slate-500'}">
                        ${RISK_LABEL[r.RiskLevel] || r.RiskLevel || '-'}
                    </span>
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">
                        ${STATUS_LABEL[r.Status] || r.Status || '-'}
                    </span>
                </td>
                <td class="px-4 py-3 text-right flex items-center gap-1 justify-end">
                    <button class="btn-manage-report px-3 py-1 rounded-lg text-xs font-semibold text-white transition-all"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)"
                            data-id="${r.id}">จัดการ</button>
                    <button class="btn-delete-report p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            data-id="${r.id}" data-name="${r.ReporterName || ''}" title="ลบ">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('Manage fetch error:', err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
async function showDetailModal(id) {
    try {
        showLoading('กำลังโหลด...');
        const res = await API.get(`/hiyari/${id}`);
        const r   = normalizeApiObject(res?.data ?? res);
        hideLoading();

        const date = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' }) : '-';
        const isImg = url => url && /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url);

        const html = `
            <div class="space-y-4 text-sm">
                <!-- Status + Risk -->
                <div class="flex flex-wrap gap-2">
                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">
                        ${STATUS_LABEL[r.Status] || r.Status}
                    </span>
                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${RISK_BADGE[r.RiskLevel] || 'bg-slate-100 text-slate-500'}">
                        ความเสี่ยง: ${RISK_LABEL[r.RiskLevel] || r.RiskLevel || '-'}
                    </span>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    ${field('วันที่', date)}
                    ${field('สถานที่', r.Location || '-')}
                    ${field('ผู้รายงาน', r.ReporterName || '-')}
                    ${field('แผนก', r.Department || '-')}
                    ${field('ผลที่อาจเกิดขึ้น', r.PotentialConsequence || '-')}
                </div>

                ${r.Description ? `<div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">รายละเอียดเหตุการณ์</p>
                    <p class="text-slate-700 leading-relaxed">${r.Description}</p>
                </div>` : ''}

                ${r.Suggestion ? `<div class="p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <p class="text-xs text-blue-500 font-semibold uppercase tracking-wider mb-1">ข้อเสนอแนะ</p>
                    <p class="text-slate-700 leading-relaxed">${r.Suggestion}</p>
                </div>` : ''}

                ${r.CorrectiveAction ? `<div class="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">Corrective Action</p>
                    <p class="text-slate-700 leading-relaxed">${r.CorrectiveAction}</p>
                </div>` : ''}

                ${r.AdminComment ? `<div class="p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <p class="text-xs text-amber-600 font-semibold uppercase tracking-wider mb-1">ความคิดเห็น Admin</p>
                    <p class="text-slate-700 leading-relaxed">${r.AdminComment}</p>
                </div>` : ''}

                <!-- Attachments -->
                ${(r.AttachmentUrl || r.AdditionalFileUrl) ? `
                <div>
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">ไฟล์แนบ</p>
                    <div class="flex flex-wrap gap-2">
                        ${r.AttachmentUrl ? buildFileThumb(r.AttachmentUrl, 'ไฟล์จากผู้รายงาน', isImg(r.AttachmentUrl)) : ''}
                        ${r.AdditionalFileUrl ? buildFileThumb(r.AdditionalFileUrl, 'ไฟล์เพิ่มเติม (Admin)', isImg(r.AdditionalFileUrl)) : ''}
                    </div>
                </div>` : ''}

                ${r.Status === 'Closed' && r.ClosedAt ? `
                <p class="text-xs text-slate-400 text-right">ปิดโดย ${r.ClosedBy || '-'} เมื่อ ${new Date(r.ClosedAt).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' })}</p>` : ''}
            </div>`;

        openModal(`รายงาน Hiyari-Hatto`, html, 'max-w-2xl');
    } catch (err) {
        hideLoading();
        showError(err);
    }
}

function field(label, value) {
    return `<div>
        <p class="text-xs text-slate-400 font-medium mb-0.5">${label}</p>
        <p class="text-slate-700 font-semibold">${value}</p>
    </div>`;
}

function buildFileThumb(url, label, isImage) {
    if (isImage) {
        return `<button class="btn-preview-file group relative overflow-hidden rounded-xl border-2 border-slate-200 hover:border-orange-400 transition-all w-24 h-24"
                         data-url="${url}" data-title="${label}" title="${label}">
            <img src="${url}" alt="${label}" class="w-full h-full object-cover">
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-end">
                <span class="w-full text-center text-white text-xs py-1 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-all">${label}</span>
            </div>
        </button>`;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer"
               class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:border-orange-400 hover:bg-orange-50 transition-all text-sm text-slate-600">
        <svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
        </svg>
        ${label}
    </a>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE MODAL (Admin)
// ─────────────────────────────────────────────────────────────────────────────
async function showManageModal(id) {
    try {
        showLoading('กำลังโหลด...');
        const res = await API.get(`/hiyari/${id}`);
        const r   = normalizeApiObject(res?.data ?? res);
        hideLoading();

        const html = `
            <div class="space-y-4 text-sm">
                <!-- Brief info -->
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600">
                    <strong>${r.ReporterName}</strong> · ${r.Department} · ${r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH') : ''}
                    <p class="mt-1 text-slate-700">${r.Description || ''}</p>
                </div>

                <form id="manage-form" class="space-y-4">
                    <input type="hidden" name="id" value="${r.id}">

                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานะ</label>
                        <select name="Status" class="form-input w-full">
                            ${STATUSES.map(s => `<option value="${s}" ${r.Status === s ? 'selected' : ''}>${STATUS_LABEL[s] || s}</option>`).join('')}
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">Corrective Action</label>
                        <textarea name="CorrectiveAction" rows="3" class="form-input w-full resize-none"
                                  placeholder="ระบุมาตรการแก้ไข...">${r.CorrectiveAction || ''}</textarea>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">ความคิดเห็น / หมายเหตุ</label>
                        <textarea name="AdminComment" rows="2" class="form-input w-full resize-none"
                                  placeholder="หมายเหตุเพิ่มเติม...">${r.AdminComment || ''}</textarea>
                    </div>

                    <!-- Upload additional file -->
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">อัปโหลดไฟล์เพิ่มเติม (ถ้ามี)</label>
                        <input type="file" id="manage-file" accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
                               class="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 transition-all">
                    </div>

                    <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button type="button" class="btn btn-secondary px-4"
                                onclick="document.getElementById('modal-close-btn').click()">ยกเลิก</button>
                        <button type="submit" id="manage-save-btn" class="btn btn-primary px-5">บันทึก</button>
                    </div>
                </form>
            </div>`;

        openModal('จัดการรายงาน', html, 'max-w-xl');

        document.getElementById('manage-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveBtn = document.getElementById('manage-save-btn');
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> กำลังบันทึก...`;

            try {
                showLoading('กำลังบันทึก...');
                const fd = new FormData(e.target);

                // Update status / corrective action / comment
                await API.put(`/hiyari/${r.id}`, {
                    Status:          fd.get('Status'),
                    CorrectiveAction: fd.get('CorrectiveAction'),
                    AdminComment:    fd.get('AdminComment'),
                });

                // Upload additional file if selected
                const fileEl = document.getElementById('manage-file');
                if (fileEl?.files?.length) {
                    const fileFd = new FormData();
                    fileFd.append('file', fileEl.files[0]);
                    await API.post(`/hiyari/${r.id}/attachment`, fileFd);
                }

                closeModal();
                showToast('อัปเดตรายงานสำเร็จ', 'success');
                await fetchAndRenderManage('all');
            } catch (err) {
                showError(err);
            } finally {
                hideLoading();
                saveBtn.disabled = false;
                saveBtn.textContent = 'บันทึก';
            }
        });
    } catch (err) {
        hideLoading();
        showError(err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', async (e) => {
        if (!e.target.closest('#hiyari-page')) return;

        // Tab switch
        const tabBtn = e.target.closest('.hiyari-tab');
        if (tabBtn) { await switchTab(tabBtn.dataset.tab); return; }

        // View detail
        const viewBtn = e.target.closest('.btn-view-report');
        if (viewBtn) { await showDetailModal(viewBtn.dataset.id); return; }

        // Manage (Admin)
        const manageBtn = e.target.closest('.btn-manage-report');
        if (manageBtn) { await showManageModal(manageBtn.dataset.id); return; }

        // Delete (Admin)
        const deleteBtn = e.target.closest('.btn-delete-report');
        if (deleteBtn) {
            const confirmed = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบรายงานของ "${deleteBtn.dataset.name}" ใช่หรือไม่?`);
            if (confirmed) {
                showLoading('กำลังลบ...');
                try {
                    await API.delete(`/hiyari/${deleteBtn.dataset.id}`);
                    showToast('ลบรายงานสำเร็จ', 'success');
                    await fetchAndRenderManage('all');
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // File preview
        const previewBtn = e.target.closest('.btn-preview-file');
        if (previewBtn) {
            showDocumentModal(previewBtn.dataset.url, previewBtn.dataset.title);
            return;
        }
    });

    // Filter changes
    document.addEventListener('change', async (e) => {
        if (!e.target.closest('#hiyari-page')) return;

        if (e.target.id === 'filter-status') { _filterStatus = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'filter-risk')   { _filterRisk   = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'manage-filter-status') { await fetchAndRenderManage(e.target.value); return; }
        if (e.target.id === 'stats-year') {
            _statsYear = parseInt(e.target.value);
            const content = document.getElementById('hiyari-tab-content');
            if (content) await renderDashboard(content);
            return;
        }
    });

    // Search debounce
    document.addEventListener('input', debounce(async (e) => {
        if (!e.target.closest('#hiyari-page')) return;
        if (e.target.id === 'history-search') {
            _searchQ = e.target.value;
            await fetchAndRenderTable();
        }
    }, 350));
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
