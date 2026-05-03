// public/js/pages/ky.js
// KY Ability (Kiken Yochi - Hazard Prediction)
import { API } from '../api.js';
import {
    hideLoading, showError, showLoading,
    openModal, openDetailModal, closeModal, showToast, showConfirmationModal, showDocumentModal, escHtml,
    statusBadge as dsStatusBadge
} from '../ui.js';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';
import { buildActivityCard } from '../utils/activity-widget.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const RISK_CATEGORIES = ['ทั่วไป','สภาพแวดล้อม','เครื่องจักร','พฤติกรรม','เคมี','ไฟฟ้า','อื่นๆ'];
const STATUSES        = ['Open','Reviewed','Closed'];

const STATUS_BADGE = {
    'Open':     'bg-sky-100 text-sky-700',
    'Reviewed': 'bg-amber-100 text-amber-700',
    'Closed':   'bg-emerald-100 text-emerald-700',
};
const STATUS_LABEL = { 'Open':'รอตรวจสอบ', 'Reviewed':'ตรวจสอบแล้ว', 'Closed':'ปิดแล้ว' };

const RISK_BADGE_COLOR = {
    'ทั่วไป':       'bg-slate-100 text-slate-600',
    'สภาพแวดล้อม':  'bg-blue-100 text-blue-700',
    'เครื่องจักร':  'bg-orange-100 text-orange-700',
    'พฤติกรรม':     'bg-purple-100 text-purple-700',
    'เคมี':         'bg-yellow-100 text-yellow-700',
    'ไฟฟ้า':        'bg-red-100 text-red-700',
    'อื่นๆ':        'bg-slate-100 text-slate-500',
};

const RISK_CARDS = [
    { id:'ทั่วไป',       label:'ทั่วไป',       desc:'อันตรายทั่วไปที่พบได้ในพื้นที่ทำงาน',    color:'#64748b', bg:'#f8fafc', border:'#cbd5e1' },
    { id:'สภาพแวดล้อม', label:'สภาพแวดล้อม', desc:'เสียง / อุณหภูมิ / แสง / ฝุ่น',          color:'#0284c7', bg:'#eff6ff', border:'#bfdbfe' },
    { id:'เครื่องจักร',  label:'เครื่องจักร',  desc:'หมุน / หนีบ / อันตรายจากเครื่องจักร',    color:'#f97316', bg:'#fff7ed', border:'#fed7aa' },
    { id:'พฤติกรรม',     label:'พฤติกรรม',     desc:'Unsafe act / การปฏิบัติไม่ถูกต้อง',       color:'#8b5cf6', bg:'#f5f3ff', border:'#ddd6fe' },
    { id:'เคมี',         label:'เคมี',         desc:'สารเคมี / ของเหลวไวไฟ / ไอระเหย',         color:'#eab308', bg:'#fefce8', border:'#fef08a' },
    { id:'ไฟฟ้า',        label:'ไฟฟ้า',        desc:'กระแสไฟฟ้า / สายไฟ / อุปกรณ์ไฟฟ้า',      color:'#ef4444', bg:'#fef2f2', border:'#fecaca' },
    { id:'อื่นๆ',        label:'อื่นๆ',        desc:'อันตรายประเภทอื่นที่ไม่อยู่ในหมวดข้างต้น', color:'#0f766e', bg:'#f0fdf4', border:'#bbf7d0' },
];

const CHART_COLORS = ['#6366f1','#f97316','#10b981','#0284c7','#a855f7','#f59e0b','#ef4444','#14b8a6'];
const MONTHS_TH    = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _isAdmin       = false;
let _activeTab     = 'dashboard';
let _statsYear     = new Date().getFullYear();
let _filterStatus  = 'all';
let _filterDept    = 'all';
let _searchQ       = '';
let _listenersReady= false;
let _chartLine     = null;
let _chartBar      = null;
let _chartDoughnut = null;
let _participants  = [];   // for form: [{ id, name, isLeader }]
let _historyRecords = [];  // cached for Excel export
let _filterHistYear = new Date().getFullYear();
let _filterHistDept = 'all';
let _filterHistRisk = 'all';
let _filterMgmtYear = new Date().getFullYear();
let _filterMgmtDept = 'all';
let _filterMgmtRisk = 'all';
let _filterDateFrom = '';
let _filterDateTo   = '';
let _departments    = [];
let _lastStatsData   = null;
let _kyProgConfig   = [];                          // KY_Program_Config for current year
let _manageSub      = 'coverage';                  // 'coverage' | 'config'
let _configYear     = new Date().getFullYear();
let _safetyUnits    = [];                          // Master_SafetyUnits
let _empSearchTimer = null;
let _empSearchResults = [];
let _kyForms         = [];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadKyPage() {
    const container = document.getElementById('ky-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _isAdmin = user.role === 'Admin' || user.Role === 'Admin';

    window.closeModal = closeModal;

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    _activeTab = window._getTab?.('ky', _activeTab) || _activeTab;
    switchTab(_activeTab);
    _loadHeroStats();
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB CONFIG
// ─────────────────────────────────────────────────────────────────────────────
function _getTabs() {
    return [
        { id: 'dashboard', label: 'Dashboard',      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
        { id: 'submit',    label: 'ส่งกิจกรรม KY',  icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>` },
        { id: 'history',   label: 'ประวัติ',         icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>` },
        ...(_isAdmin ? [{ id: 'manage', label: 'จัดการ', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>` }] : []),
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    const tabHtml = _getTabs().map(t => `
        <button id="ky-tab-btn-${t.id}" data-tab="${t.id}"
            class="ky-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="ky-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#ky-dots)"/></svg>
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
                                KY Ability
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">กิจกรรมทำนายอันตราย (Kiken Yochi)</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Hazard Prediction Activity · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <div id="ky-hero-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 w-full md:w-auto flex-shrink-0"></div>
                </div>

                <div class="flex overflow-x-auto gap-0 -mb-px scrollbar-none">
                    ${tabHtml}
                </div>
            </div>
        </div>

        <!-- Tab Content -->
        <div id="ky-tab-content" class="min-h-[400px]"></div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB SWITCH
// ─────────────────────────────────────────────────────────────────────────────
async function switchTab(tab) {
    _activeTab = tab;
    window._saveTab?.('ky', tab);

    const active   = 'ky-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white';
    const inactive = 'ky-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';

    _getTabs().forEach(t => {
        const btn = document.getElementById(`ky-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === tab ? active : inactive;
        btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>${t.label}`;
    });

    const content = document.getElementById('ky-tab-content');
    if (!content) return;

    content.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 text-slate-400">
            <div class="animate-spin rounded-full h-9 w-9 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <p class="text-sm">กำลังโหลด...</p>
        </div>`;

    switch (tab) {
        case 'dashboard': await renderDashboard(content); break;
        case 'submit':    await renderSubmitForm(content); break;
        case 'history':   await renderHistory(content);   break;
        case 'manage':    await renderManage(content);    break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPARTMENTS CACHE
// ─────────────────────────────────────────────────────────────────────────────
async function _fetchDepartments() {
    if (_departments.length) return;
    try {
        const res = await API.get('/master/departments');
        _departments = (res?.data || res || []).map(d => (d.Name || d.name || '').trim()).filter(Boolean);
    } catch { _departments = []; }
}

async function _fetchSafetyUnits() {
    if (_safetyUnits.length) return;
    try {
        const res = await API.get('/master/safety-units');
        _safetyUnits = (res?.data || res || []);
    } catch { _safetyUnits = []; }
}

async function _fetchProgramConfig(year) {
    try {
        const res = await API.get(`/ky/program-config?year=${year}`);
        _kyProgConfig = normalizeApiArray(res?.data ?? res);
    } catch { _kyProgConfig = []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO STATS STRIP
// ─────────────────────────────────────────────────────────────────────────────
async function _loadHeroStats() {
    const strip = document.getElementById('ky-hero-stats');
    if (!strip) return;

    strip.innerHTML = [1,2,3,4].map(() => `
        <div class="rounded-xl px-4 py-3 text-center animate-pulse" style="background:rgba(255,255,255,0.12);min-width:80px">
            <div class="h-7 bg-white/20 rounded-lg mb-1.5 mx-auto w-10"></div>
            <div class="h-3 bg-white/15 rounded w-14 mx-auto"></div>
        </div>`).join('');

    try {
        const year = new Date().getFullYear();
        const res  = await API.get(`/ky/stats?year=${year}`);
        const kpi  = res?.data?.kpi || {};

        const stats = [
            { value: kpi.total      ?? '—', label: 'ทั้งหมด',       color: '#6ee7b7' },
            { value: kpi.open       ?? '—', label: 'รอตรวจสอบ',     color: '#6ee7b7' },
            { value: kpi.reviewed   ?? '—', label: 'ตรวจสอบแล้ว',   color: '#6ee7b7' },
            { value: kpi.closed     ?? '—', label: 'ปิดแล้ว',        color: '#6ee7b7' },
        ];

        strip.innerHTML = stats.map(s => `
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
                <p class="text-2xl font-bold" style="color:${s.color}">${s.value}</p>
                <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${s.label}</p>
            </div>`).join('');

        const atCard = await buildActivityCard('ky');
        if (atCard) {
            strip.insertAdjacentHTML('beforeend', atCard);
            strip.className = 'grid grid-cols-3 md:grid-cols-5 gap-3 w-full md:w-auto flex-shrink-0';
        }
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
            <div class="flex items-center justify-end gap-3">
                <button id="ky-pdf-btn"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 transition-all">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M12 10v6m0 0l-3-3m3 3l3-3M4 17v1a2 2 0 002 2h12a2 2 0 002-2v-1M7 7l4.586-4.586a2 2 0 012.828 0L19 7"/>
                    </svg>
                    Export PDF
                </button>
                <select id="ky-stats-year" class="form-input py-1.5 text-sm w-32">
                    ${[0,1,2].map(i => {
                        const y = new Date().getFullYear() - i;
                        return `<option value="${y}" ${y === _statsYear ? 'selected':''}>${y}</option>`;
                    }).join('')}
                </select>
            </div>

            <div id="ky-executive-alert"></div>

            <!-- KPI -->
            <div id="ky-kpi-row" class="grid grid-cols-2 xl:grid-cols-5 gap-4">
                ${Array(4).fill(0).map(() =>
                    `<div class="ds-metric-card p-4 animate-pulse"><div class="h-8 bg-slate-100 rounded mb-2"></div><div class="h-4 bg-slate-50 rounded w-2/3"></div></div>`
                ).join('')}
            </div>

            <div id="ky-executive-summary"></div>

            <div id="ky-prog-progress"></div>

            <!-- Completion bar -->
            <div class="ds-section p-5">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold text-slate-600">Department Submission Tracker (เดือนนี้)</h3>
                    <span id="ky-completion-badge" class="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">--</span>
                </div>
                <div id="ky-pending-list" class="text-xs text-slate-400">กำลังโหลด...</div>
            </div>

            <!-- Charts -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="lg:col-span-2 ds-section p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">แนวโน้มกิจกรรม KY รายเดือน</h3>
                    <div class="relative" style="height:220px"><canvas id="ky-chart-line"></canvas></div>
                </div>
                <div class="ds-section p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">ประเภทความเสี่ยง</h3>
                    <div class="relative" style="height:220px"><canvas id="ky-chart-doughnut"></canvas></div>
                </div>
            </div>

            <div class="ds-section p-5">
                <h3 class="text-sm font-bold text-slate-600 mb-4">กิจกรรม KY แยกตามแผนก</h3>
                <div class="relative" style="height:200px"><canvas id="ky-chart-bar"></canvas></div>
            </div>

            <div id="ky-hazard-pattern"></div>

            <div id="ky-heatmap-panel"></div>
        </div>`;

    try {
        const res  = await API.get(`/ky/stats?year=${_statsYear}`);
        const data = res?.data || {};
        _lastStatsData = data;
        renderExecutiveAlert(data.kpi || {}, data.pendingDepts || []);
        renderKPI(data.kpi || {});
        renderExecutiveSummary(data);
        renderProgramProgress(data.programProgress || [], data.usingConfig);
        renderCompletionTracker(data.kpi || {}, data.pendingDepts || []);
        renderLineChart(data.monthly || []);
        renderDoughnutChart(data.riskCat || []);
        renderBarChart(data.byDept || []);
        renderHazardPattern(data.topKeywords || []);
        renderDepartmentHeatmap(data.deptMonthly || [], data.byDept || []);
    } catch (err) {
        console.error('KY stats error:', err);
    }
}

function renderKPI(kpi) {
    const closureRate = kpi.total > 0 ? Math.round(((kpi.closed || 0) / kpi.total) * 100) : 0;
    const cards = [
        { label: 'กิจกรรม KY ทั้งหมด', value: kpi.total || 0, color: '#6366f1', filter: 'all', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347A3.001 3.001 0 0112 21a3.001 3.001 0 01-2.789-4.1l-.347-.347z"/>` },
        { label: 'รอตรวจสอบ', value: kpi.open || 0, color: '#0284c7', filter: 'Open', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
        { label: 'ตรวจสอบแล้ว', value: kpi.reviewed || 0, color: '#f59e0b', filter: 'Reviewed', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>` },
        { label: 'ปิดแล้ว', value: kpi.closed || 0, color: '#10b981', filter: 'Closed', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
        { label: 'อัตราปิด', value: `${closureRate}%`, color: '#0f766e', filter: 'Closed', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>` },
    ];
    const row = document.getElementById('ky-kpi-row');
    if (!row) return;
    row.innerHTML = cards.map(c => `
        <button type="button" class="ds-metric-card p-5 flex items-center gap-4 text-left hover:-translate-y-0.5 hover:shadow-lg transition-all"
                data-ky-kpi-filter="${c.filter}" title="คลิกเพื่อดูรายการในแท็บประวัติ">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                 style="background:${c.color}18; color:${c.color}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${c.icon}</svg>
            </div>
            <div>
                <div class="text-2xl font-bold text-slate-800">${c.value}</div>
                <div class="text-xs text-slate-500 mt-0.5">${c.label}</div>
            </div>
        </button>`).join('');
}

function renderExecutiveAlert(kpi, pendingDepts) {
    const el = document.getElementById('ky-executive-alert');
    if (!el) return;

    const pending = pendingDepts.length || kpi.pendingDepts || 0;
    const open = kpi.open || 0;
    if (pending <= 0 && open <= 0) {
        el.innerHTML = `
            <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 text-emerald-800">
                    <span class="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    </span>
                    <div>
                        <p class="text-sm font-bold">สถานะ KY อยู่ในเกณฑ์ดี</p>
                        <p class="text-xs text-emerald-700">ไม่มีแผนกค้างส่งในเดือนนี้ และไม่มีรายการรอตรวจสอบ</p>
                    </div>
                </div>
            </div>`;
        return;
    }

    el.innerHTML = `
        <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div class="flex items-start gap-3 text-amber-900">
                <span class="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                </span>
                <div>
                    <p class="text-sm font-bold">ต้องติดตาม KY: ${pending} แผนกยังไม่ส่ง / ${open} รายการรอตรวจสอบ</p>
                    <p class="text-xs text-amber-700 mt-0.5">ใช้สำหรับประชุมติดตามรายเดือนและจัดลำดับแผนกที่ต้องเร่งสื่อสาร</p>
                </div>
            </div>
            <button type="button" data-ky-kpi-filter="Open" class="px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors">
                ไปที่รายการรอตรวจสอบ
            </button>
        </div>`;
}

function renderExecutiveSummary(data) {
    const el = document.getElementById('ky-executive-summary');
    if (!el) return;

    const kpi = data.kpi || {};
    const monthly = data.monthly || [];
    const riskCat = data.riskCat || [];
    const byDept = data.byDept || [];
    const currentMonth = new Date().getMonth() + 1;
    const currentMonthCount = monthly.find(r => Number(r.month) === currentMonth)?.count || 0;
    const topRisk = riskCat[0]?.label || '-';
    const topDept = byDept[0]?.Department || '-';
    const coverageGap = Math.max(0, (kpi.totalDepts || 0) - (kpi.deptSubmitted || 0));

    el.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div class="ds-metric-card p-5 border-l-4 border-l-indigo-500">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">This Month</p>
                <p class="text-2xl font-bold text-slate-800 mt-1">${currentMonthCount}</p>
                <p class="text-xs text-slate-500 mt-1">กิจกรรม KY ที่ส่งในเดือนปัจจุบัน</p>
            </div>
            <div class="ds-metric-card p-5 border-l-4 border-l-emerald-500">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">Department Coverage</p>
                <p class="text-2xl font-bold text-slate-800 mt-1">${kpi.deptSubmitted || 0}/${kpi.totalDepts || 0}</p>
                <p class="text-xs text-slate-500 mt-1">ยังเหลือ ${coverageGap} แผนกที่ต้องติดตาม</p>
            </div>
            <div class="ds-metric-card p-5 border-l-4 border-l-orange-500">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">Top Risk Theme</p>
                <p class="text-lg font-bold text-slate-800 mt-1 truncate">${escHtml(topRisk)}</p>
                <p class="text-xs text-slate-500 mt-1">ประเภทความเสี่ยงที่พบมากที่สุด</p>
            </div>
            <div class="ds-metric-card p-5 border-l-4 border-l-sky-500">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">Most Active Dept.</p>
                <p class="text-lg font-bold text-slate-800 mt-1 truncate">${escHtml(topDept)}</p>
                <p class="text-xs text-slate-500 mt-1">แผนกที่ส่งกิจกรรมสูงสุดในปีที่เลือก</p>
            </div>
        </div>`;
}

function renderHazardPattern(keywords) {
    const el = document.getElementById('ky-hazard-pattern');
    if (!el) return;
    if (!keywords.length) { el.innerHTML = ''; return; }

    const maxCount = Math.max(...keywords.map(k => k.count || 0), 1);
    const riskColors = ['#ef4444','#f97316','#eab308','#8b5cf6','#0284c7','#10b981','#64748b'];

    el.innerHTML = `
        <div class="ds-section p-5">
            <div class="flex items-center justify-between gap-3 mb-4">
                <div>
                    <h3 class="text-sm font-bold text-slate-700">KYT Keyword ที่พบซ้ำบ่อย</h3>
                    <p class="text-xs text-slate-400 mt-0.5">อันตรายหลักที่ทีมรายงานซ้ำ — ใช้เพื่อวางนโยบายป้องกันเชิงรุก</p>
                </div>
                <span class="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">${keywords.length} themes</span>
            </div>
            <div class="space-y-2.5">
                ${keywords.map((k, i) => {
                    const pct = Math.round((k.count / maxCount) * 100);
                    const color = riskColors[i % riskColors.length];
                    return `
                    <div class="flex items-center gap-3">
                        <span class="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style="background:${color}">${i + 1}</span>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center justify-between gap-2 mb-1">
                                <span class="text-xs font-semibold text-slate-700 truncate">${escHtml(k.keyword)}</span>
                                <span class="text-xs font-bold text-slate-500 flex-shrink-0">${k.count} ครั้ง</span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${color}"></div>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

function renderProgramProgress(progData, usingConfig) {
    const el = document.getElementById('ky-prog-progress');
    if (!el) return;
    if (!usingConfig || !progData.length) { el.innerHTML = ''; return; }

    // Sort: most behind first (lowest pct), then alphabetical
    const sorted = [...progData].sort((a, b) => a.pct - b.pct || a.department.localeCompare(b.department));
    const onTrack  = sorted.filter(d => d.pct >= 80).length;
    const atRisk   = sorted.filter(d => d.pct >= 40 && d.pct < 80).length;
    const critical = sorted.filter(d => d.pct < 40).length;

    const barColor = (pct) => pct >= 80 ? '#059669' : pct >= 40 ? '#d97706' : '#ef4444';
    const bgColor  = (pct) => pct >= 80 ? '#ecfdf5' : pct >= 40 ? '#fffbeb' : '#fef2f2';
    const txtColor = (pct) => pct >= 80 ? '#065f46' : pct >= 40 ? '#92400e' : '#991b1b';

    el.innerHTML = `
        <div class="ds-section p-5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                    <h3 class="text-sm font-bold text-slate-700">ความคืบหน้ากิจกรรม KY รายส่วนงาน</h3>
                    <p class="text-xs text-slate-400 mt-0.5">เป้าหมายรายปีตาม Program Config — เรียงจากแผนกที่ตามหลังก่อน</p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>On Track ${onTrack}
                    </span>
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                        <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>At Risk ${atRisk}
                    </span>
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>Critical ${critical}
                    </span>
                </div>
            </div>
            <div class="space-y-2.5">
                ${sorted.map(d => {
                    const clampedPct = Math.max(0, Math.min(100, d.pct));
                    const remaining  = Math.max(0, d.target - d.submitted);
                    return `
                    <div class="flex items-center gap-3">
                        <div class="w-36 sm:w-48 text-xs font-semibold text-slate-700 truncate flex-shrink-0" title="${escHtml(d.department)}">${escHtml(d.department)}</div>
                        <div class="flex-1 h-5 rounded-full overflow-hidden bg-slate-100 relative">
                            <div class="h-full rounded-full transition-all"
                                 style="width:${clampedPct}%;background:${barColor(d.pct)}"></div>
                            ${d.pct === 0 ? `<span class="absolute inset-0 flex items-center justify-center text-[10px] text-slate-400 font-semibold">ยังไม่ส่ง</span>` : ''}
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <span class="text-xs font-bold text-slate-700 w-12 text-right">${d.submitted}/${d.target}</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full w-14 text-center"
                                  style="background:${bgColor(d.pct)};color:${txtColor(d.pct)}">${clampedPct}%</span>
                            ${remaining > 0 ? `<span class="text-[10px] text-slate-400 hidden sm:block">เหลือ ${remaining}</span>` : `<span class="text-[10px] text-emerald-600 font-bold hidden sm:block">ครบแล้ว</span>`}
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

function renderDepartmentHeatmap(deptMonthly, byDept) {
    const el = document.getElementById('ky-heatmap-panel');
    if (!el) return;

    const depts = byDept.slice(0, 10).map(d => d.Department).filter(Boolean);
    const maxCount = Math.max(...deptMonthly.map(r => r.count || 0), 1);
    const countFor = (dept, month) => {
        const row = deptMonthly.find(r => r.Department === dept && Number(r.month) === month);
        return row?.count || 0;
    };
    const colorFor = (count) => {
        if (!count) return '#f1f5f9';
        const level = Math.min(1, count / maxCount);
        if (level > 0.75) return '#065f46';
        if (level > 0.5) return '#10b981';
        if (level > 0.25) return '#6ee7b7';
        return '#d1fae5';
    };

    el.innerHTML = `
        <div class="ds-section p-5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                    <h3 class="text-sm font-bold text-slate-700">KY Department Heatmap</h3>
                    <p class="text-xs text-slate-400 mt-0.5">แสดงความถี่กิจกรรมรายเดือนตามแผนก เพื่อดู pattern และแผนกที่ต้องกระตุ้น</p>
                </div>
                <div class="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span>น้อย</span><span class="w-3 h-3 rounded-sm bg-slate-100"></span><span class="w-3 h-3 rounded-sm bg-emerald-100"></span><span class="w-3 h-3 rounded-sm bg-emerald-300"></span><span class="w-3 h-3 rounded-sm bg-emerald-600"></span><span>มาก</span>
                </div>
            </div>
            ${depts.length ? `
            <div class="overflow-x-auto">
                <div class="min-w-[720px]">
                    <div class="grid gap-1" style="grid-template-columns:160px repeat(12,minmax(34px,1fr));">
                        <div></div>
                        ${MONTHS_TH.map(m => `<div class="text-[10px] text-center font-semibold text-slate-400">${m}</div>`).join('')}
                        ${depts.map(dept => `
                            <div class="text-xs font-semibold text-slate-600 truncate pr-2">${escHtml(dept)}</div>
                            ${Array.from({ length: 12 }, (_, i) => {
                                const month = i + 1;
                                const count = countFor(dept, month);
                                return `<div class="h-7 rounded-md border border-white flex items-center justify-center text-[10px] font-bold ${count ? 'text-white' : 'text-slate-300'}"
                                             style="background:${colorFor(count)}" title="${escHtml(dept)} ${MONTHS_TH[i]}: ${count}">${count || ''}</div>`;
                            }).join('')}
                        `).join('')}
                    </div>
                </div>
            </div>` : `<div class="text-center py-8 text-sm text-slate-400">ยังไม่มีข้อมูลพอสำหรับ Heatmap</div>`}
        </div>`;
}

function renderCompletionTracker(kpi, pendingDepts) {
    const badge = document.getElementById('ky-completion-badge');
    const list  = document.getElementById('ky-pending-list');
    if (!list) return;

    const rate = kpi.completionRate || 0;
    if (badge) badge.textContent = `${rate}% Completion`;

    const barColor = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';

    list.innerHTML = `
        <div class="mb-4">
            <div class="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>${kpi.deptSubmitted || 0} / ${kpi.totalDepts || 0} แผนก</span>
                <span style="color:${barColor}">${rate}%</span>
            </div>
            <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full rounded-full transition-all" style="width:${rate}%; background:linear-gradient(90deg,${barColor},${barColor}cc)"></div>
            </div>
        </div>
        ${pendingDepts.length ? `
        <div>
            <p class="text-xs font-semibold text-slate-500 mb-2">แผนกที่ยังไม่ส่ง (เดือนนี้)</p>
            <div class="flex flex-wrap gap-1.5">
                ${pendingDepts.map(d => `<span class="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-medium border border-red-100">${d}</span>`).join('')}
            </div>
        </div>` : `<p class="text-sm text-emerald-600 font-semibold flex items-center gap-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>ทุกแผนกส่งแล้วเดือนนี้</p>`}`;
}

function renderLineChart(monthly) {
    const ctx = document.getElementById('ky-chart-line');
    if (!ctx) return;
    if (_chartLine) { _chartLine.destroy(); _chartLine = null; }
    const counts = Array(12).fill(0);
    monthly.forEach(r => { counts[(r.month || 1) - 1] = r.count || 0; });
    _chartLine = new Chart(ctx, {
        type: 'line',
        data: {
            labels: MONTHS_TH,
            datasets: [{
                label: 'กิจกรรม KY',
                data: counts,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.08)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#6366f1',
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

function renderDoughnutChart(data) {
    const ctx = document.getElementById('ky-chart-doughnut');
    if (!ctx) return;
    if (_chartDoughnut) { _chartDoughnut.destroy(); _chartDoughnut = null; }
    _chartDoughnut = new Chart(ctx, {
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
                legend: { position: 'bottom', labels: { font: { family: 'Kanit', size: 11 }, padding: 8, boxWidth: 12 } }
            },
            cutout: '55%',
        }
    });
}

function renderBarChart(data) {
    const ctx = document.getElementById('ky-chart-bar');
    if (!ctx) return;
    if (_chartBar) { _chartBar.destroy(); _chartBar = null; }
    _chartBar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.Department),
            datasets: [{
                label: 'กิจกรรม KY',
                data: data.map(d => d.count),
                backgroundColor: '#6366f199',
                borderColor: '#6366f1',
                borderWidth: 2,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Kanit' } }, grid: { color: '#f1f5f9' } },
                x: { ticks: { font: { family: 'Kanit', size: 10 }, maxRotation: 40 }, grid: { display: false } },
            },
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: SUBMIT FORM
// ─────────────────────────────────────────────────────────────────────────────
async function renderSubmitForm(container) {
    const user  = TSHSession.getUser() || {};
    const today = new Date().toISOString().split('T')[0];
    const curMonth = new Date().getMonth() + 1;
    const curYear  = new Date().getFullYear();
    _participants = [];

    // Check this month + yearly progress
    let alreadySubmitted = false;
    let yearlyDone = 0;
    let yearlyTarget = 12;
    if (user.department) {
        try {
            const chk = await API.get(`/ky/check?dept=${encodeURIComponent(user.department)}&month=${curMonth}&year=${curYear}`);
            alreadySubmitted = chk?.submittedThisMonth || false;
            yearlyDone   = chk?.yearlyDone   ?? chk?.count ?? 0;
            yearlyTarget = chk?.yearlyTarget ?? chk?.target ?? 12;
        } catch (_) {}
    }

    const yearlyPct   = yearlyTarget > 0 ? Math.min(100, Math.round(yearlyDone / yearlyTarget * 100)) : 0;
    const yearlyColor = yearlyPct >= 100 ? '#10b981' : yearlyPct >= 50 ? '#f59e0b' : '#ef4444';

    container.innerHTML = `
        <div class="w-full max-w-none">
            <div class="ds-section overflow-hidden">
                <div class="h-1.5 w-full" style="background:linear-gradient(90deg,#6366f1,#8b5cf6)"></div>
                <div class="p-6 space-y-5">

                    <!-- Yearly progress strip -->
                    <div class="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                         style="background:#f8fafc;border:1px solid #e2e8f0;">
                        <div class="flex-1">
                            <div class="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
                                <span>ความคืบหน้า KY ปี ${curYear}</span>
                                <span style="color:${yearlyColor}">${yearlyDone} / ${yearlyTarget} ครั้ง</span>
                            </div>
                            <div class="h-2.5 rounded-full bg-slate-200 overflow-hidden">
                                <div class="h-full rounded-full transition-all" style="width:${yearlyPct}%;background:${yearlyColor}"></div>
                            </div>
                        </div>
                        <span class="text-2xl font-bold flex-shrink-0" style="color:${yearlyColor}">${yearlyPct}%</span>
                    </div>

                    ${alreadySubmitted ? `
                    <div class="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                        <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        <div>
                            <p class="font-semibold">แผนก "${escHtml(user.department || '')}" ได้ส่งกิจกรรม KY สำหรับเดือนนี้แล้ว</p>
                            <p class="text-xs mt-0.5 text-amber-600">ดูรายละเอียดได้ที่แท็บ "ประวัติกิจกรรม"</p>
                        </div>
                    </div>` : `
                    <div class="flex gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700">
                        <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <span>ส่งกิจกรรม KY ประจำเดือน — 1 แผนก / 1 เรื่อง / 1 เดือน (เป้าหมาย ${yearlyTarget} ครั้ง/ปี)</span>
                    </div>`}

                    <form id="ky-form" class="space-y-6" ${alreadySubmitted ? 'style="opacity:0.6; pointer-events:none;"' : ''}>

                        <!-- Reporter info -->
                        <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                            <div class="lg:col-span-2">
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หัวทีม / ผู้ส่งกิจกรรม</label>
                                <div class="flex items-center gap-2">
                                    <input type="text" class="form-input flex-1 bg-slate-50" value="${escHtml(user.name || '')}" readonly>
                                    <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 flex-shrink-0">หัวทีม</span>
                                </div>
                            </div>
                            <div class="lg:col-span-2">
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก</label>
                                <input type="text" class="form-input w-full bg-slate-50" value="${escHtml(user.department || '')}" readonly>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่กิจกรรม <span class="text-red-500">*</span></label>
                                <input type="date" name="ActivityDate" class="form-input w-full" value="${today}" max="${today}" required>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อทีม</label>
                                <input type="text" name="TeamName" class="form-input w-full" placeholder="เช่น ทีม A / Line 1">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">KYT Keyword</label>
                                <input type="text" name="KYTKeyword" class="form-input w-full" placeholder="เช่น ลื่นหกล้ม / หนีบมือ">
                            </div>
                        </div>

                        <!-- Risk category card-radio -->
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-2">ประเภทความเสี่ยง <span class="text-red-500">*</span></label>
                            <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2" id="ky-risk-cards">
                                ${RISK_CARDS.map((rc, i) => `
                                <label class="relative cursor-pointer" title="${escHtml(rc.desc)}">
                                    <input type="radio" name="RiskCategory" value="${rc.id}" class="peer sr-only" ${i === 0 ? 'checked' : ''}>
                                    <div class="rounded-xl border-2 p-3 text-center transition-all peer-checked:ring-2 peer-checked:ring-offset-1 select-none"
                                         style="background:${rc.bg};border-color:${rc.border};--ring-color:${rc.color}">
                                        <p class="text-xs font-bold mt-0.5" style="color:${rc.color}">${rc.label}</p>
                                        <p class="text-[10px] mt-0.5 leading-tight" style="color:${rc.color}88">${rc.desc.split('/')[0].trim()}</p>
                                    </div>
                                </label>`).join('')}
                            </div>
                            <style>
                                #ky-risk-cards label input:checked + div { box-shadow: 0 0 0 2px white, 0 0 0 4px var(--ring-color, #6366f1); }
                            </style>
                        </div>

                        <!-- Participants (employee typeahead) -->
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้เข้าร่วม
                                <span class="text-xs font-normal text-slate-400 ml-1">— ค้นหาพนักงานจากมาสเตอร์หรือพิมพ์ชื่อด้วยตัวเอง</span>
                            </label>
                            <div class="relative mb-2">
                                <div class="flex gap-2">
                                    <div class="relative flex-1">
                                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                                        </svg>
                                        <input type="text" id="ky-emp-search"
                                               class="form-input w-full pl-9 text-sm"
                                               placeholder="ค้นหาชื่อหรือรหัสพนักงาน..." autocomplete="off">
                                        <div id="ky-emp-dropdown"
                                             class="hidden absolute z-30 left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-slate-200 max-h-56 overflow-y-auto"></div>
                                    </div>
                                    <button type="button" id="ky-add-manual-btn"
                                            class="px-3 py-2 rounded-lg text-white text-sm font-semibold transition-all flex-shrink-0"
                                            title="เพิ่มชื่อตามที่พิมพ์โดยไม่ต้องค้นหา"
                                            style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">+ เพิ่ม</button>
                                </div>
                            </div>
                            <div id="ky-participants-tags" class="flex flex-wrap gap-1.5 min-h-[32px]">
                                <span class="text-xs text-slate-400 italic" id="ky-no-participants">ยังไม่มีผู้เข้าร่วม</span>
                            </div>
                            <input type="hidden" name="Participants" id="ky-participants-hidden">
                        </div>

                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดอันตรายที่คาดการณ์ <span class="text-red-500">*</span></label>
                                <textarea name="HazardDescription" rows="6" required
                                          class="form-input w-full resize-none"
                                          placeholder="อธิบายอันตรายที่อาจเกิดขึ้นในงานที่ทำ..."></textarea>
                            </div>

                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">มาตรการตอบโต้ (Countermeasure)</label>
                                <textarea name="Countermeasure" rows="6"
                                          class="form-input w-full resize-none"
                                          placeholder="วิธีป้องกันหรือลดความเสี่ยงที่กำหนด..."></textarea>
                            </div>
                        </div>

                        <!-- Forms download card -->
                        <div id="ky-forms-user-card"></div>

                        <!-- Attachment + Video -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ไฟล์แนบ (ภาพ / เอกสาร)</label>
                                <label class="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
                                    <svg class="w-6 h-6 text-slate-300 group-hover:text-indigo-400 transition-colors mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                    </svg>
                                    <span class="text-xs text-slate-500">ภาพ / PDF / Office</span>
                                    <input type="file" name="attachment" id="ky-attachment" class="hidden"
                                           accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx">
                                </label>
                                <p id="ky-attachment-name" class="text-xs text-indigo-600 mt-1 truncate"></p>
                                <div id="ky-attachment-preview" class="hidden mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3"></div>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วิดีโอหลักฐาน</label>
                                <label class="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all group">
                                    <svg class="w-6 h-6 text-slate-300 group-hover:text-purple-400 transition-colors mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                                    </svg>
                                    <span class="text-xs text-slate-500">MP4, MOV, AVI · ≤ 200 MB</span>
                                    <input type="file" name="video" id="ky-video" class="hidden"
                                           accept="video/mp4,video/quicktime,video/avi,video/webm,video/x-msvideo,video/mpeg">
                                </label>
                                <p id="ky-video-name" class="text-xs text-purple-600 mt-1 truncate"></p>
                                <div id="ky-video-preview" class="hidden mt-3 rounded-xl border border-purple-100 bg-purple-50/50 p-3"></div>
                            </div>
                        </div>

                        <div class="flex justify-end pt-2">
                            <button type="submit" id="ky-submit-btn"
                                    class="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
                                    style="background:linear-gradient(135deg,#6366f1,#8b5cf6); box-shadow:0 2px 8px rgba(99,102,241,0.35)"
                                    onmouseover="this.style.transform='translateY(-1px)'"
                                    onmouseout="this.style.transform=''">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                                </svg>
                                ส่งกิจกรรม KY
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

    setupFormListeners();

    // Load and inject active forms card
    _loadKyForms(false).then(forms => {
        const cardEl = document.getElementById('ky-forms-user-card');
        if (cardEl) cardEl.innerHTML = _renderKyFormsUserCard(forms);
    });
}

function setupFormListeners() {
    // Attachment preview
    document.getElementById('ky-attachment')?.addEventListener('change', (e) => {
        renderKyFilePreview(e.target, 'ky-attachment-name', 'ky-attachment-preview', 'attachment');
    });
    document.getElementById('ky-video')?.addEventListener('change', (e) => {
        renderKyFilePreview(e.target, 'ky-video-name', 'ky-video-preview', 'video');
    });

    document.getElementById('ky-attachment-preview')?.addEventListener('click', (e) => {
        if (!e.target.closest('[data-clear-ky-file]')) return;
        clearKyFile('ky-attachment', 'ky-attachment-name', 'ky-attachment-preview');
    });
    document.getElementById('ky-video-preview')?.addEventListener('click', (e) => {
        if (!e.target.closest('[data-clear-ky-file]')) return;
        clearKyFile('ky-video', 'ky-video-name', 'ky-video-preview');
    });

    // Employee typeahead search
    const empSearch = document.getElementById('ky-emp-search');
    const empDrop   = document.getElementById('ky-emp-dropdown');

    if (empSearch && empDrop) {
        empSearch.addEventListener('input', () => {
            clearTimeout(_empSearchTimer);
            const q = empSearch.value.trim();
            if (!q) { empDrop.classList.add('hidden'); return; }
            _empSearchTimer = setTimeout(async () => {
                try {
                    const res = await API.get(`/ky/employees?q=${encodeURIComponent(q)}`);
                    _empSearchResults = normalizeApiArray(res?.data ?? res);
                    if (!_empSearchResults.length) {
                        empDrop.innerHTML = `<div class="px-4 py-3 text-xs text-slate-400">ไม่พบพนักงาน — ใช้ปุ่ม "+ เพิ่ม" เพื่อเพิ่มชื่อตามที่พิมพ์</div>`;
                    } else {
                        empDrop.innerHTML = _empSearchResults.map((emp, i) => `
                            <button type="button" data-emp-idx="${i}"
                                    class="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
                                <span class="font-semibold text-slate-700">${escHtml(emp.EmployeeName || '')}</span>
                                <span class="text-xs text-slate-400 ml-2">${escHtml(emp.EmployeeID || '')}</span>
                                <span class="text-xs text-slate-400 ml-1">· ${escHtml(emp.Department || '')}</span>
                            </button>`).join('');
                    }
                    empDrop.classList.remove('hidden');
                } catch { empDrop.classList.add('hidden'); }
            }, 300);
        });

        empDrop.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-emp-idx]');
            if (!btn) return;
            const emp = _empSearchResults[parseInt(btn.dataset.empIdx)];
            if (!emp) return;
            _addParticipant(emp.EmployeeName, emp.EmployeeID);
            empSearch.value = '';
            empDrop.classList.add('hidden');
        });

        empSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { empDrop.classList.add('hidden'); empSearch.value = ''; }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#ky-emp-search') && !e.target.closest('#ky-emp-dropdown')) {
                empDrop?.classList.add('hidden');
            }
        }, { capture: true });
    }

    // Add participant manually (from typed text)
    document.getElementById('ky-add-manual-btn')?.addEventListener('click', () => {
        const input = document.getElementById('ky-emp-search');
        const name  = (input?.value || '').trim();
        if (!name) return;
        _addParticipant(name, null);
        input.value = '';
        document.getElementById('ky-emp-dropdown')?.classList.add('hidden');
    });

    // Form submit
    document.getElementById('ky-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('ky-submit-btn');
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> กำลังส่ง...`;

        try {
            showLoading('กำลังส่งกิจกรรม KY...');
            const fd = new FormData(e.target);
            fd.set('Participants', JSON.stringify(_participants.map(p => p.name)));
            await API.post('/ky', fd);
            showToast('ส่งกิจกรรม KY สำเร็จ', 'success');
            _participants = [];
            e.target.reset();
            document.getElementById('ky-attachment-name').textContent = '';
            document.getElementById('ky-video-name').textContent = '';
            clearKyFile('ky-attachment', 'ky-attachment-name', 'ky-attachment-preview');
            clearKyFile('ky-video', 'ky-video-name', 'ky-video-preview');
            updateParticipantTags();
            await _loadHeroStats();
        } catch (err) {
            showError(err);
        } finally {
            hideLoading();
            btn.disabled = false;
            btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> ส่งกิจกรรม KY`;
        }
    });
}

function _addParticipant(name, empId) {
    if (!name) return;
    if (_participants.some(p => p.name === name)) return;
    _participants.push({ name, empId: empId || null });
    updateParticipantTags();
}

function renderKyFilePreview(input, nameId, previewId, type) {
    const file = input.files?.[0];
    const nameEl = document.getElementById(nameId);
    const previewEl = document.getElementById(previewId);
    if (nameEl) nameEl.textContent = file?.name || '';
    if (!previewEl) return;

    if (!file) {
        previewEl.classList.add('hidden');
        previewEl.innerHTML = '';
        return;
    }

    const isImage = file.type?.startsWith('image/');
    const isVideo = file.type?.startsWith('video/');
    const previewUrl = (isImage || isVideo) ? URL.createObjectURL(file) : '';
    const media = isImage
        ? `<img src="${previewUrl}" alt="preview" class="w-full h-36 object-cover rounded-lg border border-white shadow-sm">`
        : isVideo
            ? `<video src="${previewUrl}" class="w-full h-36 object-cover rounded-lg border border-white shadow-sm" controls muted></video>`
            : `<div class="h-36 rounded-lg border border-white bg-white flex items-center justify-center text-slate-400 text-xs font-semibold">FILE</div>`;

    previewEl.classList.remove('hidden');
    previewEl.innerHTML = `
        <div class="flex gap-3">
            <div class="w-40 flex-shrink-0">${media}</div>
            <div class="min-w-0 flex-1">
                <p class="text-xs font-bold text-slate-700 truncate">${escHtml(file.name)}</p>
                <p class="text-[11px] text-slate-400 mt-1">${type === 'video' ? 'Video evidence' : 'Attachment'} · ${formatFileSize(file.size)}</p>
                <button type="button" data-clear-ky-file
                    class="mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:text-red-600 hover:border-red-200 transition-colors">
                    × ล้างไฟล์
                </button>
            </div>
        </div>`;
}

function clearKyFile(inputId, nameId, previewId) {
    const input = document.getElementById(inputId);
    const nameEl = document.getElementById(nameId);
    const previewEl = document.getElementById(previewId);
    if (input) input.value = '';
    if (nameEl) nameEl.textContent = '';
    if (previewEl) {
        previewEl.classList.add('hidden');
        previewEl.innerHTML = '';
    }
}

function formatFileSize(bytes) {
    if (!bytes) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function updateParticipantTags() {
    const container = document.getElementById('ky-participants-tags');
    const hidden    = document.getElementById('ky-participants-hidden');
    if (!container) return;

    if (!_participants.length) {
        container.innerHTML = `<span class="text-xs text-slate-400 italic" id="ky-no-participants">ยังไม่มีผู้เข้าร่วม</span>`;
        if (hidden) hidden.value = '[]';
        return;
    }

    if (hidden) hidden.value = JSON.stringify(_participants.map(p => p.name));
    container.innerHTML = _participants.map((p, i) => {
        const isLeader = i === 0;
        return `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${isLeader ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}">
            ${isLeader ? `<span class="text-[10px] font-bold bg-white bg-opacity-30 px-1.5 py-0.5 rounded-full text-indigo-900">หัวทีม</span>` : ''}
            ${escHtml(p.name)}
            ${p.empId ? `<span class="text-[10px] opacity-70">(${escHtml(p.empId)})</span>` : ''}
            <button type="button" data-idx="${i}"
                    class="ky-remove-participant ${isLeader ? 'text-indigo-200 hover:text-white' : 'text-indigo-400 hover:text-indigo-700'} leading-none font-bold ml-0.5">×</button>
        </span>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: HISTORY
// ─────────────────────────────────────────────────────────────────────────────
async function renderHistory(container) {
    await Promise.all([_fetchDepartments(), _fetchProgramConfig(_filterHistYear)]);

    // Limit dept dropdown to configured depts when config exists
    const configDepts = _kyProgConfig.filter(c => c.IsActive).map(c => c.Department);
    const histDeptList = configDepts.length ? configDepts : _departments;
    const usingConfigScope = configDepts.length > 0;

    container.innerHTML = `
        <div class="space-y-4">
            ${usingConfigScope ? `
            <div class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>แสดงเฉพาะ <strong>${configDepts.length} ส่วนงาน</strong> ที่อยู่ในโปรแกรม KY ปี ${_filterHistYear} — ตั้งค่าได้ในแท็บ "จัดการ"</span>
            </div>` : ''}
            <div class="ds-filter-bar flex flex-wrap gap-3 items-center justify-between">
                <div class="flex flex-wrap gap-2">
                    <select id="ky-hist-year" class="form-input py-1.5 text-sm">
                        ${[0,1,2].map(i => { const y = new Date().getFullYear()-i; return `<option value="${y}" ${y===_filterHistYear?'selected':''}>${y}</option>`; }).join('')}
                    </select>
                    <input id="ky-hist-date-from" type="date" class="form-input py-1.5 text-sm"
                           value="${_filterDateFrom}" title="วันที่เริ่มต้น">
                    <input id="ky-hist-date-to"   type="date" class="form-input py-1.5 text-sm"
                           value="${_filterDateTo}"   title="วันที่สิ้นสุด">
                    <select id="ky-hist-dept" class="form-input py-1.5 text-sm">
                        <option value="all" ${_filterHistDept==='all'?'selected':''}>ทุกแผนก${usingConfigScope ? ` (${configDepts.length} ส่วนงาน)` : ''}</option>
                        ${histDeptList.map(d => `<option value="${escHtml(d)}" ${_filterHistDept===d?'selected':''}>${escHtml(d)}</option>`).join('')}
                    </select>
                    <select id="ky-filter-status" class="form-input py-1.5 text-sm">
                        <option value="all" ${_filterStatus==='all'?'selected':''}>ทุกสถานะ</option>
                        ${STATUSES.map(s => `<option value="${s}" ${_filterStatus===s?'selected':''}>${STATUS_LABEL[s]||s}</option>`).join('')}
                    </select>
                    <select id="ky-hist-risk" class="form-input py-1.5 text-sm">
                        <option value="all" ${_filterHistRisk==='all'?'selected':''}>ทุกประเภทความเสี่ยง</option>
                        ${RISK_CATEGORIES.map(c => `<option value="${escHtml(c)}" ${_filterHistRisk===c?'selected':''}>${escHtml(c)}</option>`).join('')}
                    </select>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    <div class="relative w-full sm:w-64">
                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input id="ky-history-search" type="text" placeholder="ค้นหา..."
                               value="${_searchQ}" class="form-input w-full pl-9 text-sm py-2">
                    </div>
                    <button id="ky-export-btn"
                        class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 transition-all flex-shrink-0">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M12 10v6m0 0l-3-3m3 3l3-3M4 17v1a2 2 0 002 2h12a2 2 0 002-2v-1M7 7l4.586-4.586a2 2 0 012.828 0L19 7"/>
                        </svg>
                        Export Excel
                    </button>
                </div>
            </div>

            <div class="ds-table-wrap">
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">วันที่</th>
                                <th class="px-4 py-3">แผนก / ทีม</th>
                                <th class="px-4 py-3">KYT Keyword</th>
                                <th class="px-4 py-3">ประเภท</th>
                                <th class="px-4 py-3">ผู้รายงาน</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody id="ky-history-tbody" class="divide-y divide-slate-100">
                            ${loadingRow(7)}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

    await fetchAndRenderHistory();
}

async function fetchAndRenderHistory() {
    const tbody = document.getElementById('ky-history-tbody');
    if (!tbody) return;
    try {
        const params = new URLSearchParams();
        if (_filterStatus !== 'all') params.set('status', _filterStatus);
        // Date range overrides year filter when set
        if (_filterDateFrom) params.set('dateFrom', _filterDateFrom);
        if (_filterDateTo)   params.set('dateTo',   _filterDateTo);
        if (!_filterDateFrom && !_filterDateTo && _filterHistYear) params.set('year', _filterHistYear);
        if (_filterHistDept !== 'all') {
            params.set('dept', _filterHistDept);
        } else {
            // Scope to configured depts when "all" is selected and config exists
            const configDepts = _kyProgConfig.filter(c => c.IsActive).map(c => c.Department);
            if (configDepts.length) params.set('depts', configDepts.join(','));
        }
        if (_filterHistRisk !== 'all') params.set('risk', _filterHistRisk);
        if (_searchQ.trim())           params.set('q', _searchQ.trim());
        const res     = await API.get(`/ky?${params}`);
        const records = normalizeApiArray(res?.data ?? res);
        _historyRecords = records;

        if (!records.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400 text-sm">ไม่พบกิจกรรม KY</td></tr>`;
            return;
        }

        tbody.innerHTML = records.map(r => {
            const date = r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            return `
            <tr class="hover:bg-slate-50 transition-colors group">
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">${date}</td>
                <td class="px-4 py-3">
                    <div class="font-medium text-slate-800">${r.Department || '-'}</div>
                    ${r.TeamName ? `<div class="text-xs text-slate-400">${r.TeamName}</div>` : ''}
                </td>
                <td class="px-4 py-3 text-slate-700 max-w-[150px] truncate text-xs">${r.KYTKeyword || '-'}</td>
                <td class="px-4 py-3">
                    ${dsStatusBadge(r.RiskCategory || '-')}
                </td>
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">${r.ReporterName || '-'}</td>
                <td class="px-4 py-3">
                    ${dsStatusBadge(r.Status || '-', { label: STATUS_LABEL[r.Status] || r.Status || '-' })}
                </td>
                <td class="px-4 py-3 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button class="btn-ky-view px-3 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
                                data-id="${r.id}">ดู</button>
                        ${_isAdmin ? `
                        <button class="btn-ky-manage px-3 py-1 rounded-lg text-xs font-semibold text-white transition-all"
                                style="background:linear-gradient(135deg,#6366f1,#8b5cf6)"
                                data-id="${r.id}">จัดการ</button>
                        <button class="btn-ky-delete p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                data-id="${r.id}" data-name="${escHtml(r.Department || '-')}" title="ลบ">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-red-500 text-sm">${escHtml(err.message)}</td></tr>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: MANAGE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MODULE FORMS — KY
// ─────────────────────────────────────────────────────────────────────────────
function _kyFormFileLabel(mime) {
    if (!mime) return 'ไฟล์';
    if (mime.includes('pdf'))   return 'PDF';
    if (mime.includes('word') || mime.includes('officedocument.wordprocessing')) return 'Word';
    if (mime.includes('excel') || mime.includes('spreadsheetml')) return 'Excel';
    if (mime.startsWith('image/')) return 'รูปภาพ';
    return 'ไฟล์';
}

function _kyFormFileIcon(mime) {
    if (!mime) return '📄';
    if (mime.includes('pdf'))   return '📕';
    if (mime.includes('word') || mime.includes('officedocument.wordprocessing')) return '📘';
    if (mime.includes('excel') || mime.includes('spreadsheetml')) return '📗';
    if (mime.startsWith('image/')) return '🖼';
    return '📄';
}

async function _loadKyForms(adminAll = false) {
    try {
        const url = adminAll ? '/module-forms?module=ky&all=1' : '/module-forms?module=ky';
        const res = await API.get(url);
        _kyForms = normalizeApiArray(res?.data ?? res);
    } catch { _kyForms = []; }
    return _kyForms;
}

function _renderKyFormsManageSection() {
    const forms = _kyForms;
    const rows = forms.length
        ? forms.map(f => {
            const activeClass = f.IsActive ? '' : 'opacity-50';
            return `
            <tr class="hover:bg-slate-50 transition-colors ${activeClass}">
                <td class="px-4 py-3">
                    <div class="font-medium text-slate-800 text-sm">${escHtml(f.Title)}</div>
                    ${f.Description ? `<div class="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">${escHtml(f.Description)}</div>` : ''}
                </td>
                <td class="px-4 py-3 text-xs text-slate-500">${escHtml(f.Version || '—')}</td>
                <td class="px-4 py-3 text-xs text-slate-500">${_kyFormFileLabel(f.FileType)}</td>
                <td class="px-4 py-3">
                    ${f.IsActive
                        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>ใช้งาน</span>`
                        : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>ปิดใช้งาน</span>`}
                </td>
                <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">${new Date(f.UploadedAt).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                    <a href="${escHtml(f.FileUrl)}" target="_blank" class="px-3 py-1 rounded-lg text-xs font-semibold text-sky-600 hover:bg-sky-50 transition-colors inline-block">ดูไฟล์</a>
                    <button class="ky-form-toggle px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${f.IsActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}"
                            data-id="${f.id}" data-active="${f.IsActive}">${f.IsActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
                    <button class="ky-form-delete p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-0.5"
                            data-id="${f.id}" data-title="${escHtml(f.Title)}" title="ลบ">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </td>
            </tr>`;
        }).join('')
        : `<tr><td colspan="6" class="text-center py-8 text-slate-400 text-sm">
            <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
            </div>
            ยังไม่มีแบบฟอร์ม — กด "เพิ่มแบบฟอร์ม" เพื่อเพิ่ม
        </td></tr>`;

    const el = document.getElementById('ky-forms-tbody');
    if (el) el.innerHTML = rows;
}

function _openKyFormUploadModal() {
    const html = `
    <div class="space-y-4 p-1">
        <form id="ky-form-upload-form" class="space-y-3">
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">ชื่อแบบฟอร์ม <span class="text-red-500">*</span></label>
                <input type="text" id="kyff-title" class="form-input w-full rounded-xl text-sm" placeholder="เช่น แบบฟอร์มกิจกรรม KY" maxlength="200">
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">เวอร์ชั่น</label>
                    <input type="text" id="kyff-version" class="form-input w-full rounded-xl text-sm" placeholder="เช่น v1.0" maxlength="30">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">ลำดับแสดง</label>
                    <input type="number" id="kyff-sort" class="form-input w-full rounded-xl text-sm" placeholder="99" min="0" max="999">
                </div>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">คำอธิบาย</label>
                <textarea id="kyff-desc" rows="2" class="form-input w-full rounded-xl text-sm resize-none" placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"></textarea>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">ไฟล์แบบฟอร์ม <span class="text-red-500">*</span></label>
                <input type="file" id="kyff-file"
                       accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                       class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all">
                <p class="text-xs text-slate-400 mt-1">รองรับ PDF, Word, Excel, รูปภาพ · ขนาดไม่เกิน 20 MB</p>
            </div>
        </form>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button onclick="window.closeModal&&window.closeModal()" class="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">ยกเลิก</button>
            <button id="kyff-submit-btn" class="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                    style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
                อัปโหลดแบบฟอร์ม
            </button>
        </div>
    </div>`;
    openModal('เพิ่มแบบฟอร์ม KY', html, 'max-w-lg');
    document.getElementById('kyff-submit-btn')?.addEventListener('click', async () => {
        const title = document.getElementById('kyff-title')?.value.trim();
        const fileEl = document.getElementById('kyff-file');
        if (!title) { showToast('กรุณาระบุชื่อแบบฟอร์ม', 'error'); return; }
        if (!fileEl?.files?.length) { showToast('กรุณาเลือกไฟล์', 'error'); return; }
        const btn = document.getElementById('kyff-submit-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังอัปโหลด...'; }
        try {
            const fd = new FormData();
            fd.append('module', 'ky');
            fd.append('title', title);
            fd.append('description', document.getElementById('kyff-desc')?.value.trim() || '');
            fd.append('version', document.getElementById('kyff-version')?.value.trim() || '');
            fd.append('sortOrder', document.getElementById('kyff-sort')?.value || '99');
            fd.append('formFile', fileEl.files[0]);
            await API.post('/module-forms', fd);
            closeModal();
            showToast('อัปโหลดแบบฟอร์มสำเร็จ', 'success');
            await _loadKyForms(true);
            _renderKyFormsManageSection();
        } catch (err) {
            showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>อัปโหลดแบบฟอร์ม'; }
        }
    });
}

function _renderKyFormsUserCard(forms) {
    const active = forms.filter(f => f.IsActive);
    if (!active.length) return '';
    return `
    <div class="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <div class="flex items-center gap-2 mb-3">
            <svg class="w-4 h-4 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <span class="text-sm font-bold text-indigo-800">แบบฟอร์มที่ต้องกรอกและแนบ</span>
        </div>
        <p class="text-xs text-indigo-700 mb-3">กรุณาดาวน์โหลดแบบฟอร์ม กรอกข้อมูล และนำมาแนบในช่องไฟล์แนบด้านล่าง</p>
        <div class="space-y-2">
            ${active.map(f => `
            <div class="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-indigo-100 gap-3">
                <div class="flex items-center gap-2.5 min-w-0">
                    <span class="text-base flex-shrink-0">${_kyFormFileIcon(f.FileType)}</span>
                    <div class="min-w-0">
                        <div class="text-sm font-semibold text-slate-800 truncate">${escHtml(f.Title)}</div>
                        <div class="text-xs text-slate-400">${_kyFormFileLabel(f.FileType)}${f.Version ? ` · ${escHtml(f.Version)}` : ''}</div>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    <a href="${escHtml(f.FileUrl)}" target="_blank"
                       class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-600 hover:bg-sky-50 border border-sky-200 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                        ดูไฟล์
                    </a>
                    <a href="${escHtml(f.FileUrl)}" download
                       class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-100 border border-indigo-200 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                        </svg>
                        ดาวน์โหลด
                    </a>
                </div>
            </div>`).join('')}
        </div>
    </div>`;
}

async function renderManage(container) {
    await Promise.all([_fetchDepartments(), _fetchSafetyUnits(), _fetchProgramConfig(_filterMgmtYear)]);

    const subActive   = 'px-4 py-2 text-xs font-bold rounded-lg text-white transition-all';
    const subInactive = 'px-4 py-2 text-xs font-semibold rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-all';

    container.innerHTML = `
        <div class="space-y-4">
            <!-- Sub-tab bar -->
            <div class="ds-filter-bar flex flex-wrap items-center justify-between gap-3">
                <div class="flex gap-2">
                    <button id="ky-msub-coverage" class="${_manageSub==='coverage' ? subActive : subInactive}"
                            style="${_manageSub==='coverage' ? 'background:linear-gradient(135deg,#6366f1,#8b5cf6)' : ''}"
                            data-msub="coverage">ภาพรวม Coverage</button>
                    <button id="ky-msub-config" class="${_manageSub==='config' ? subActive : subInactive}"
                            style="${_manageSub==='config' ? 'background:linear-gradient(135deg,#6366f1,#8b5cf6)' : ''}"
                            data-msub="config">ตั้งค่าโปรแกรม KY</button>
                </div>
                <div class="flex gap-2 items-center">
                    <select id="ky-mgmt-year" class="form-input py-1.5 text-sm">
                        ${[0,1,2].map(i => { const y = new Date().getFullYear()-i; return `<option value="${y}" ${y===_filterMgmtYear?'selected':''}>${y}</option>`; }).join('')}
                    </select>
                    ${_manageSub === 'coverage' ? `
                    <select id="ky-mgmt-dept" class="form-input py-1.5 text-sm">
                        <option value="all" ${_filterMgmtDept==='all'?'selected':''}>ทุกแผนก</option>
                        ${_departments.map(d => `<option value="${escHtml(d)}" ${_filterMgmtDept===d?'selected':''}>${escHtml(d)}</option>`).join('')}
                    </select>
                    <select id="ky-mgmt-risk" class="form-input py-1.5 text-sm">
                        <option value="all" ${_filterMgmtRisk==='all'?'selected':''}>ทุกประเภทความเสี่ยง</option>
                        ${RISK_CATEGORIES.map(c => `<option value="${escHtml(c)}" ${_filterMgmtRisk===c?'selected':''}>${escHtml(c)}</option>`).join('')}
                    </select>` : ''}
                    ${_manageSub === 'config' && _isAdmin ? `
                    <button id="ky-add-config-btn"
                            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all"
                            style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        เพิ่มส่วนงาน
                    </button>` : ''}
                </div>
            </div>

            <div id="ky-manage-panel">
                <div class="ds-section p-5 animate-pulse"><div class="h-5 bg-slate-100 rounded w-48 mb-4"></div><div class="h-24 bg-slate-50 rounded-xl"></div></div>
            </div>
        </div>`;

    await _renderManagePanel();
}

async function _renderManagePanel() {
    const panel = document.getElementById('ky-manage-panel');
    if (!panel) return;
    if (_manageSub === 'config') {
        renderManageConfig(panel);
        // Load forms after DOM is ready
        _loadKyForms(_isAdmin).then(() => {
            _renderKyFormsManageSection();
            // Wire up forms buttons (only on config sub-tab)
            document.getElementById('btn-add-ky-form')?.addEventListener('click', _openKyFormUploadModal);
            document.getElementById('ky-forms-tbody')?.addEventListener('click', async e => {
                const toggleBtn = e.target.closest('.ky-form-toggle');
                const deleteBtn = e.target.closest('.ky-form-delete');
                if (toggleBtn) {
                    const id = toggleBtn.dataset.id;
                    const isActive = toggleBtn.dataset.active === '1' || toggleBtn.dataset.active === 'true' || toggleBtn.dataset.active === 1;
                    const form = _kyForms.find(f => String(f.id) === String(id));
                    if (!form) return;
                    try {
                        await API.put(`/module-forms/${id}`, {
                            title: form.Title,
                            description: form.Description,
                            version: form.Version,
                            sortOrder: form.SortOrder,
                            isActive: isActive ? 0 : 1,
                        });
                        showToast(isActive ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว', 'success');
                        await _loadKyForms(_isAdmin);
                        _renderKyFormsManageSection();
                    } catch (err) { showToast(err.message || 'เกิดข้อผิดพลาด', 'error'); }
                }
                if (deleteBtn) {
                    const id = deleteBtn.dataset.id;
                    const title = deleteBtn.dataset.title;
                    showConfirmationModal(`ลบแบบฟอร์ม "${title}" ใช่หรือไม่?`, async () => {
                        try {
                            await API.delete(`/module-forms/${id}`);
                            showToast('ลบแบบฟอร์มสำเร็จ', 'success');
                            await _loadKyForms(_isAdmin);
                            _renderKyFormsManageSection();
                        } catch (err) { showToast(err.message || 'เกิดข้อผิดพลาด', 'error'); }
                    });
                }
            });
        });
    } else {
        await fetchAndRenderManage('all');
    }
}

function renderManageConfig(wrap) {
    if (!wrap) wrap = document.getElementById('ky-manage-panel');
    if (!wrap) return;

    const configs = _kyProgConfig;

    wrap.innerHTML = `
        <div class="space-y-4">
            <div class="ds-table-wrap p-5">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">โปรแกรม KY ปี ${_filterMgmtYear}</h3>
                        <p class="text-xs text-slate-400 mt-0.5">กำหนดแผนก/ส่วนงานที่ต้องเข้าร่วม เป้าหมาย/ปี และวันกำหนดส่ง</p>
                    </div>
                    <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">${configs.length} ส่วนงาน</span>
                </div>
                ${configs.length ? `
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-3 py-2.5 text-left">แผนก</th>
                                <th class="px-3 py-2.5 text-left">Safety Units</th>
                                <th class="px-3 py-2.5 text-center">เป้าหมาย/ปี</th>
                                <th class="px-3 py-2.5 text-center">กำหนดส่ง</th>
                                <th class="px-3 py-2.5 text-center">สถานะ</th>
                                <th class="px-3 py-2.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${configs.map(cfg => {
                                let units = [];
                                try { units = JSON.parse(cfg.SafetyUnits || '[]'); } catch { units = []; }
                                return `
                                <tr class="hover:bg-slate-50 transition-colors">
                                    <td class="px-3 py-3 font-semibold text-slate-700">${escHtml(cfg.Department || '')}</td>
                                    <td class="px-3 py-3 text-xs text-slate-500">
                                        ${units.length ? units.map(u => `<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 mr-1">${escHtml(u)}</span>`).join('') : '<span class="text-slate-300">—</span>'}
                                    </td>
                                    <td class="px-3 py-3 text-center">
                                        <span class="font-bold text-indigo-600">${cfg.YearlyTarget || 12}</span>
                                        <span class="text-xs text-slate-400 ml-0.5">ครั้ง</span>
                                    </td>
                                    <td class="px-3 py-3 text-center text-xs text-slate-600">
                                        ${cfg.DeadlineDay ? `วันที่ ${cfg.DeadlineDay}` : '—'}
                                        ${cfg.DeadlineNote ? `<div class="text-slate-400">${escHtml(cfg.DeadlineNote)}</div>` : ''}
                                    </td>
                                    <td class="px-3 py-3 text-center">
                                        <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.IsActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                                            ${cfg.IsActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td class="px-3 py-3 text-right">
                                        <div class="flex items-center justify-end gap-1">
                                            <button class="btn-ky-cfg-edit px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                                                    data-id="${cfg.id}">แก้ไข</button>
                                            <button class="btn-ky-cfg-del p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                                    data-id="${cfg.id}" data-dept="${escHtml(cfg.Department || '')}">
                                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>` : `
                <div class="text-center py-12 text-slate-400">
                    <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                        <svg class="w-7 h-7 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                        </svg>
                    </div>
                    <p class="font-medium text-sm">ยังไม่มีการตั้งค่าโปรแกรม KY สำหรับปี ${_filterMgmtYear}</p>
                    <p class="text-xs mt-1">คลิก "เพิ่มส่วนงาน" เพื่อเริ่มกำหนดแผนกที่ต้องเข้าร่วม</p>
                </div>`}
            </div>

            <!-- Info card -->
            <div class="ds-section p-4 border-l-4 border-l-indigo-400 flex items-start gap-3">
                <svg class="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div class="text-xs text-slate-600">
                    <p class="font-semibold text-slate-700 mb-0.5">การตั้งค่าโปรแกรมมีผลอย่างไร</p>
                    <p>แผนกที่ตั้งค่าไว้จะปรากฏใน Dashboard และแผนภาพ Coverage — ระบบจะนับเฉพาะแผนกในโปรแกรมเพื่อคำนวณ Completion Rate, เปอร์เซ็นต์ความครอบคลุม และตัวเลขนำเสนอผู้บริหาร</p>
                </div>
            </div>

            <!-- Forms management section -->
            <div class="ds-table-wrap p-5">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">แบบฟอร์มที่เกี่ยวข้อง</h3>
                        <p class="text-xs text-slate-400 mt-0.5">จัดการแบบฟอร์มที่ผู้ใช้ต้องดาวน์โหลดและกรอก</p>
                    </div>
                    ${_isAdmin ? `
                    <button id="btn-add-ky-form"
                        class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                        style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        เพิ่มแบบฟอร์ม
                    </button>` : ''}
                </div>
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">ชื่อแบบฟอร์ม</th>
                                <th class="px-4 py-3">เวอร์ชั่น</th>
                                <th class="px-4 py-3">ประเภท</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3">วันที่อัปโหลด</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="ky-forms-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="6" class="text-center py-6 text-slate-400">
                                <div class="animate-spin inline-block h-5 w-5 border-4 border-indigo-400 border-t-transparent rounded-full mb-1.5"></div>
                                <div class="text-sm">กำลังโหลด...</div>
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
}

async function openAddConfigModal(existingCfg = null) {
    await Promise.all([_fetchDepartments(), _fetchSafetyUnits()]);

    const isEdit = !!existingCfg;
    let existingUnits = [];
    if (existingCfg?.SafetyUnits) {
        try { existingUnits = JSON.parse(existingCfg.SafetyUnits); } catch { existingUnits = []; }
    }

    // Departments not yet configured (for add mode)
    const usedDepts = isEdit ? [] : _kyProgConfig.map(c => c.Department);
    const availDepts = isEdit ? _departments : _departments.filter(d => !usedDepts.includes(d));

    // Safety units grouped by department
    const unitsByDept = {};
    _safetyUnits.forEach(u => {
        const dName = (u.DeptName || '').trim();
        if (!unitsByDept[dName]) unitsByDept[dName] = [];
        unitsByDept[dName].push(u);
    });

    const html = `
        <form id="ky-cfg-form" class="space-y-4">
            <input type="hidden" name="cfgId" value="${existingCfg?.id || ''}">

            ${isEdit ? `
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1">แผนก</label>
                <input type="text" class="form-input w-full bg-slate-50" value="${escHtml(existingCfg.Department || '')}" readonly>
                <input type="hidden" name="departments[]" value="${escHtml(existingCfg.Department || '')}">
            </div>` : `
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เลือกแผนก <span class="text-red-500">*</span>
                    <span class="text-xs font-normal text-slate-400 ml-1">(เลือกได้หลายแผนก)</span>
                </label>
                <div class="border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                    ${availDepts.length ? availDepts.map(d => `
                    <label class="flex items-center gap-2.5 p-2 rounded-lg hover:bg-indigo-50 cursor-pointer transition-colors">
                        <input type="checkbox" name="departments[]" value="${escHtml(d)}" class="rounded text-indigo-600 w-4 h-4">
                        <span class="text-sm text-slate-700">${escHtml(d)}</span>
                    </label>`).join('') : `<p class="text-xs text-slate-400 text-center py-4">ทุกแผนกได้รับการตั้งค่าแล้วสำหรับปีนี้</p>`}
                </div>
            </div>`}

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">เป้าหมาย/ปี (ครั้ง)</label>
                    <input type="number" name="YearlyTarget" class="form-input w-full" min="1" max="52"
                           value="${existingCfg?.YearlyTarget || 12}" required>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันกำหนดส่ง (วันที่ในเดือน)</label>
                    <input type="number" name="DeadlineDay" class="form-input w-full" min="1" max="31"
                           placeholder="เช่น 15" value="${existingCfg?.DeadlineDay || ''}">
                </div>
            </div>

            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุกำหนดส่ง</label>
                <input type="text" name="DeadlineNote" class="form-input w-full"
                       placeholder="เช่น ก่อนวันที่ 15 ของทุกเดือน"
                       value="${escHtml(existingCfg?.DeadlineNote || '')}">
            </div>

            ${_safetyUnits.length ? `
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Safety Units ที่เกี่ยวข้อง
                    <span class="text-xs font-normal text-slate-400 ml-1">(เลือกได้หลายหน่วย)</span>
                </label>
                <div class="border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
                    ${_safetyUnits.map(u => `
                    <label class="flex items-center gap-2.5 p-2 rounded-lg hover:bg-indigo-50 cursor-pointer transition-colors">
                        <input type="checkbox" name="SafetyUnits[]" value="${escHtml(u.name || u.short_code || '')}"
                               class="rounded text-indigo-600 w-4 h-4"
                               ${existingUnits.includes(u.name || u.short_code || '') ? 'checked' : ''}>
                        <span class="text-sm text-slate-700">${escHtml(u.name || '')}</span>
                        ${u.DeptName ? `<span class="text-xs text-slate-400">(${escHtml(u.DeptName)})</span>` : ''}
                    </label>`).join('')}
                </div>
            </div>` : ''}

            ${isEdit ? `
            <div class="flex items-center gap-2">
                <input type="checkbox" name="IsActive" id="cfg-is-active" value="1" class="rounded text-indigo-600 w-4 h-4"
                       ${existingCfg.IsActive ? 'checked' : ''}>
                <label for="cfg-is-active" class="text-sm text-slate-700">Active (เปิดใช้งาน)</label>
            </div>` : ''}

            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200"
                        onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
                <button type="submit" class="px-5 py-2 rounded-lg text-sm font-semibold text-white"
                        style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มส่วนงาน'}</button>
            </div>
        </form>`;

    openModal(isEdit ? `แก้ไขโปรแกรม KY — ${existingCfg.Department}` : `เพิ่มส่วนงานในโปรแกรม KY ปี ${_filterMgmtYear}`, html, 'max-w-xl');

    document.getElementById('ky-cfg-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);

        const departments = fd.getAll('departments[]').filter(Boolean);
        if (!departments.length) { showToast('กรุณาเลือกอย่างน้อย 1 แผนก', 'warning'); return; }

        const safetyUnits = fd.getAll('SafetyUnits[]').filter(Boolean);
        const payload = {
            Year:         _filterMgmtYear,
            YearlyTarget: parseInt(fd.get('YearlyTarget') || '12', 10),
            DeadlineDay:  fd.get('DeadlineDay') ? parseInt(fd.get('DeadlineDay'), 10) : null,
            DeadlineNote: fd.get('DeadlineNote') || null,
            SafetyUnits:  safetyUnits.length ? JSON.stringify(safetyUnits) : null,
            IsActive:     isEdit ? (fd.get('IsActive') === '1' ? 1 : 0) : 1,
        };

        try {
            showLoading('กำลังบันทึก...');
            if (isEdit) {
                await API.put(`/ky/program-config/${existingCfg.id}`, {
                    safetyUnits:  safetyUnits.length ? safetyUnits : null,
                    yearlyTarget: payload.YearlyTarget,
                    deadlineDay:  payload.DeadlineDay,
                    deadlineNote: payload.DeadlineNote,
                    isActive:     payload.IsActive,
                });
                showToast('แก้ไขโปรแกรม KY สำเร็จ', 'success');
            } else {
                await API.post('/ky/program-config', {
                    year: _filterMgmtYear,
                    entries: departments.map(dept => ({
                        department:   dept,
                        safetyUnits:  safetyUnits.length ? safetyUnits : null,
                        yearlyTarget: payload.YearlyTarget,
                        deadlineDay:  payload.DeadlineDay,
                        deadlineNote: payload.DeadlineNote,
                    })),
                });
                showToast(`เพิ่ม ${departments.length} ส่วนงาน สำเร็จ`, 'success');
            }
            closeModal();
            await _fetchProgramConfig(_filterMgmtYear);
            renderManageConfig();
        } catch (err) {
            showError(err);
        } finally {
            hideLoading();
        }
    });
}

async function fetchAndRenderManage(statusFilter) {
    const wrap = document.getElementById('ky-manage-panel');
    if (!wrap) return;
    try {
        const params = new URLSearchParams();
        if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
        if (_filterMgmtYear)           params.set('year', _filterMgmtYear);
        if (_filterMgmtDept !== 'all') params.set('dept', _filterMgmtDept);
        if (_filterMgmtRisk !== 'all') params.set('risk', _filterMgmtRisk);
        const res     = await API.get(`/ky?${params}`);
        const records = normalizeApiArray(res?.data ?? res);

        renderManageOverview(records);
    } catch (err) {
        if (wrap) wrap.innerHTML = `<div class="ds-empty-state p-6 text-center text-red-500 text-sm">${escHtml(err.message)}</div>`;
    }
}

function renderManageOverview(records) {
    const wrap = document.getElementById('ky-manage-panel');
    if (!wrap) return;

    const total = records.length;
    const open = records.filter(r => r.Status === 'Open');
    const reviewed = records.filter(r => r.Status === 'Reviewed');
    const closed = records.filter(r => r.Status === 'Closed');
    const submittedDepts = new Set(records.map(r => r.Department).filter(Boolean));
    // Prefer program-config depts if configured; fall back to master
    const activeConfig = _kyProgConfig.filter(c => c.IsActive);
    const configDepts  = activeConfig.map(c => c.Department);
    const baseDepts    = configDepts.length ? configDepts : _departments;
    const scopedDepts  = _filterMgmtDept !== 'all' ? [_filterMgmtDept] : baseDepts;
    const pendingDepts = scopedDepts.filter(d => !submittedDepts.has(d));
    const completion   = scopedDepts.length ? Math.round((submittedDepts.size / scopedDepts.length) * 100) : 0;
    const closeRate    = total ? Math.round((closed.length / total) * 100) : 0;

    // Build yearly target progress per dept (from config + records for selected year)
    const yearlyProgMap = {};
    activeConfig.forEach(cfg => { yearlyProgMap[cfg.Department] = { target: cfg.YearlyTarget || 12, submitted: 0 }; });
    records.forEach(r => { if (yearlyProgMap[r.Department]) yearlyProgMap[r.Department].submitted++; });

    const byDept = scopedDepts.map(dept => {
        const deptRecords = records.filter(r => r.Department === dept);
        const prog = yearlyProgMap[dept] || null;
        return {
            dept,
            total: deptRecords.length,
            open: deptRecords.filter(r => r.Status === 'Open').length,
            reviewed: deptRecords.filter(r => r.Status === 'Reviewed').length,
            closed: deptRecords.filter(r => r.Status === 'Closed').length,
            yearlySubmitted: prog?.submitted ?? deptRecords.length,
            yearlyTarget:    prog?.target    ?? null,
        };
    }).sort((a, b) => {
        // Sort: most behind on yearly target first, then by open count
        const aPct = a.yearlyTarget ? a.yearlySubmitted / a.yearlyTarget : 1;
        const bPct = b.yearlyTarget ? b.yearlySubmitted / b.yearlyTarget : 1;
        return aPct - bPct || b.open - a.open || a.dept.localeCompare(b.dept);
    });
    const actionQueue = [...open, ...reviewed].slice(0, 8);

    wrap.innerHTML = `
        <div class="grid grid-cols-2 xl:grid-cols-5 gap-4">
            ${manageMetric('ทั้งหมด', total, '#6366f1', 'รายการในปี/ตัวกรองนี้')}
            ${manageMetric('รอตรวจสอบ', open.length, '#0284c7', 'ต้อง review')}
            ${manageMetric('ตรวจสอบแล้ว', reviewed.length, '#f59e0b', 'รอปิดหรือ follow-up')}
            ${manageMetric('ปิดแล้ว', closed.length, '#10b981', `${closeRate}% close rate`)}
            ${manageMetric('Coverage', `${submittedDepts.size}/${scopedDepts.length || 0}`, '#0f766e', `${completion}% department coverage`)}
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div class="xl:col-span-2 ds-section p-5">
                <div class="flex items-center justify-between gap-3 mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">Department Coverage</h3>
                        <p class="text-xs text-slate-400 mt-0.5">แผนกที่ส่งแล้วและสถานะ review ของแต่ละแผนก</p>
                    </div>
                    <span class="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">${completion}%</span>
                </div>
                <div class="space-y-2 max-h-[430px] overflow-y-auto pr-1">
                    ${byDept.length ? byDept.map(d => deptProgressRow(d)).join('') : `<div class="text-center py-8 text-sm text-slate-400">ยังไม่มีข้อมูลแผนก</div>`}
                </div>
                ${configDepts.length ? `<p class="text-[10px] text-slate-400 mt-3">แถบสีคือความคืบหน้าเทียบเป้าหมายรายปีจาก Program Config</p>` : ''}
            </div>

            <div class="ds-section p-5">
                <h3 class="text-sm font-bold text-slate-700 mb-1">Action Queue</h3>
                <p class="text-xs text-slate-400 mb-4">รายการที่ต้องจัดการต่อจาก History</p>
                <div class="space-y-2 max-h-[430px] overflow-y-auto pr-1">
                    ${actionQueue.length ? actionQueue.map(r => manageActionItem(r)).join('') : `<div class="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-sm font-semibold text-emerald-700">ไม่มีรายการค้างจัดการ</div>`}
                </div>
            </div>
        </div>

        ${pendingDepts.length ? `
        <div class="ds-section p-5 border-l-4 border-l-amber-400">
            <h3 class="text-sm font-bold text-slate-700 mb-2">แผนกที่ยังไม่ส่งในช่วงที่เลือก</h3>
            <div class="flex flex-wrap gap-1.5">
                ${pendingDepts.map(d => `<span class="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-100 text-xs font-semibold">${escHtml(d)}</span>`).join('')}
            </div>
        </div>` : ''}
    `;
}

function manageMetric(label, value, color, sub) {
    return `
        <div class="ds-metric-card p-5 border-t-4" style="border-top-color:${color}">
            <p class="text-2xl font-bold" style="color:${color}">${value}</p>
            <p class="text-xs font-semibold text-slate-600 mt-1">${label}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">${sub}</p>
        </div>`;
}

function deptProgressRow(d) {
    const closePct    = d.total ? Math.round((d.closed / d.total) * 100) : 0;
    const hasYearly   = d.yearlyTarget !== null;
    const yearlyPct   = hasYearly && d.yearlyTarget > 0
        ? Math.min(100, Math.round(d.yearlySubmitted / d.yearlyTarget * 100)) : 0;
    const yBarColor   = yearlyPct >= 80 ? '#059669' : yearlyPct >= 40 ? '#d97706' : '#ef4444';
    const submitted   = d.total > 0;

    return `
        <div class="rounded-xl border ${submitted ? 'border-slate-100 bg-white' : 'border-amber-100 bg-amber-50'} p-3">
            <div class="flex items-center justify-between gap-3 mb-2">
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-bold text-slate-700 truncate">${escHtml(d.dept)}</p>
                    <p class="text-[11px] text-slate-400 mt-0.5">${submitted ? `${d.total} รายการ · Open ${d.open} · Reviewed ${d.reviewed} · Closed ${d.closed}` : 'ยังไม่ส่ง KY ในช่วงที่เลือก'}</p>
                </div>
                ${hasYearly ? `
                <div class="text-right flex-shrink-0">
                    <span class="text-xs font-bold px-2 py-1 rounded-full"
                          style="background:${yearlyPct>=80?'#ecfdf5':yearlyPct>=40?'#fffbeb':'#fef2f2'};color:${yearlyPct>=80?'#065f46':yearlyPct>=40?'#92400e':'#991b1b'}">
                        ${d.yearlySubmitted}/${d.yearlyTarget} รายปี
                    </span>
                </div>` : `
                <span class="text-xs font-bold ${submitted ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-amber-700 bg-white border-amber-200'} border px-2 py-1 rounded-full">${submitted ? `${closePct}% ปิดแล้ว` : 'Pending'}</span>`}
            </div>
            ${hasYearly ? `
            <div class="mb-1.5">
                <div class="flex justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>เป้าหมายรายปี</span><span>${yearlyPct}%</span>
                </div>
                <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full rounded-full transition-all" style="width:${yearlyPct}%;background:${yBarColor}"></div>
                </div>
            </div>` : ''}
            <div>
                <div class="flex justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>อัตราปิด (ของที่ส่งแล้ว)</span><span>${closePct}%</span>
                </div>
                <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full rounded-full" style="width:${closePct}%;background:linear-gradient(90deg,#6366f1,#10b981)"></div>
                </div>
            </div>
        </div>`;
}

function manageActionItem(r) {
    const date = r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH', { day:'numeric', month:'short' }) : '-';
    return `
        <div class="rounded-xl border border-slate-100 bg-white p-3">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="text-sm font-bold text-slate-700 truncate">${escHtml(r.Department || '-')} ${r.TeamName ? `· ${escHtml(r.TeamName)}` : ''}</p>
                    <p class="text-[11px] text-slate-400 mt-0.5">${date} · ${escHtml(r.ReporterName || '-')}</p>
                    <p class="text-xs text-slate-500 mt-1 line-clamp-2">${escHtml(r.HazardDescription || r.KYTKeyword || '-')}</p>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">${STATUS_LABEL[r.Status] || r.Status}</span>
            </div>
            <button class="btn-ky-manage mt-3 w-full px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all"
                    style="background:linear-gradient(135deg,#6366f1,#8b5cf6)"
                    data-id="${r.id}">อัปเดตสถานะ / Countermeasure</button>
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
async function showDetailModal(id) {
    try {
        showLoading('กำลังโหลด...');
        const res = await API.get(`/ky/${id}`);
        const r   = normalizeApiObject(res?.data ?? res);
        hideLoading();

        let participants = [];
        if (r.Participants) {
            try { participants = JSON.parse(r.Participants); } catch { participants = [r.Participants]; }
        }
        const isVideo = url => url && /\.(mp4|mov|webm|avi|mpeg)(\?.*)?$/i.test(url);
        const isImage = url => url && /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url);
        const date    = r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' }) : '-';
        const participantLabels = participants.map(p => {
            if (p && typeof p === 'object') return p.name || p.Name || p.EmployeeName || p.EmployeeID || JSON.stringify(p);
            return String(p || '');
        }).filter(Boolean);
        const statusLabel = STATUS_LABEL[r.Status] || r.Status || '-';
        const riskLabel = r.RiskCategory || 'General';

        const html = `
            <div class="space-y-4 text-sm">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Status</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(statusLabel)}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Risk</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(riskLabel)}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Date</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(date)}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Members</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${participantLabels.length || '-'}</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    ${infoField('วันที่', date)}
                    ${infoField('แผนก', r.Department || '-')}
                    ${infoField('ชื่อทีม', r.TeamName || '-')}
                    ${infoField('ผู้รายงาน', r.ReporterName || '-')}
                </div>

                ${participants.length ? `
                <div>
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">ผู้เข้าร่วม (${participants.length} คน)</p>
                    <div class="flex flex-wrap gap-1.5">
                        ${participantLabels.map(p => `<span class="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">${escHtml(p)}</span>`).join('')}
                    </div>
                </div>` : ''}

                <div class="p-3 bg-red-50 rounded-xl border border-red-100">
                    <p class="text-xs text-red-500 font-semibold uppercase tracking-wider mb-1">อันตรายที่คาดการณ์</p>
                    <p class="text-slate-700 leading-relaxed">${escHtml(r.HazardDescription || '-')}</p>
                </div>

                ${r.Countermeasure ? `
                <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">มาตรการตอบโต้</p>
                    <p class="text-slate-700 leading-relaxed">${escHtml(r.Countermeasure)}</p>
                </div>` : ''}

                ${r.AdminComment ? `
                <div class="p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <p class="text-xs text-amber-600 font-semibold uppercase tracking-wider mb-1">ความคิดเห็น Admin</p>
                    <p class="text-slate-700 leading-relaxed">${escHtml(r.AdminComment)}</p>
                </div>` : ''}

                <!-- Media -->
                ${(r.AttachmentUrl || r.VideoUrl) ? `
                <div>
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">สื่อแนบ</p>
                    <div class="flex flex-wrap gap-3">
                        ${r.AttachmentUrl ? buildMediaThumb(r.AttachmentUrl, 'ไฟล์แนบ', isImage(r.AttachmentUrl)) : ''}
                        ${r.VideoUrl      ? buildVideoThumb(r.VideoUrl)                                            : ''}
                    </div>
                </div>` : ''}
            </div>`;

        openDetailModal({
            title: escHtml(r.TeamName || 'KY Activity'),
            subtitle: `${date} · ${r.Department || '-'} · ${r.ReporterName || '-'}`,
            meta: [
                { label: statusLabel, className: `${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'} border-slate-200` },
                { label: riskLabel, className: `${RISK_BADGE_COLOR[r.RiskCategory] || 'bg-slate-100 text-slate-500'} border-slate-200` },
                r.KYTKeyword ? { label: `# ${r.KYTKeyword}`, className: 'bg-indigo-100 text-indigo-700 border-indigo-200' } : null,
            ],
            body: html,
            size: 'max-w-2xl'
        });
    } catch (err) {
        hideLoading();
        showError(err);
    }
}

function infoField(label, value) {
    return `<div>
        <p class="text-xs text-slate-400 font-medium mb-0.5">${escHtml(label)}</p>
        <p class="text-slate-700 font-semibold">${escHtml(value)}</p>
    </div>`;
}

function buildMediaThumb(url, label, isImage) {
    if (isImage) {
        return `<button class="btn-ky-preview group relative overflow-hidden rounded-xl border-2 border-slate-200 hover:border-indigo-400 transition-all w-24 h-24"
                         data-url="${url}" data-title="${label}">
            <img src="${url}" alt="${label}" class="w-full h-full object-cover">
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-end">
                <span class="w-full text-center text-white text-xs py-1 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-all">${label}</span>
            </div>
        </button>`;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer"
               class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-sm text-slate-600">
        <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
        </svg>
        ${label}
    </a>`;
}

function buildVideoThumb(url) {
    return `<div class="rounded-xl overflow-hidden border-2 border-slate-200 w-full max-w-xs">
        <video src="${url}" controls class="w-full max-h-40 bg-black" preload="metadata"></video>
        <div class="px-2 py-1 text-xs text-slate-500 bg-slate-50">วิดีโอหลักฐาน</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE MODAL (Admin)
// ─────────────────────────────────────────────────────────────────────────────
async function showManageModal(id) {
    try {
        showLoading('กำลังโหลด...');
        const res = await API.get(`/ky/${id}`);
        const r   = normalizeApiObject(res?.data ?? res);
        hideLoading();

        let participants = [];
        if (r.Participants) {
            try { participants = JSON.parse(r.Participants); } catch { participants = []; }
        }

        const html = `
            <div class="space-y-4 text-sm">
                <div class="p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-sm text-indigo-900">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <p class="font-bold">${escHtml(r.Department || '-')} ${r.TeamName ? `· ${escHtml(r.TeamName)}` : ''}</p>
                            <p class="text-xs text-slate-500 mt-0.5">${escHtml(r.ReporterName || '-')} · ${r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH') : '-'}</p>
                        </div>
                        <span class="px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">${STATUS_LABEL[r.Status] || r.Status}</span>
                    </div>
                    ${r.HazardDescription ? `<p class="text-xs text-slate-700 mt-3 line-clamp-2">${escHtml(r.HazardDescription)}</p>` : ''}
                </div>

                <form id="ky-manage-form" class="space-y-4">
                    <input type="hidden" name="id" value="${r.id}">

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานะ</label>
                            <select name="Status" class="form-input w-full">
                                ${STATUSES.map(s => `<option value="${s}" ${r.Status === s ? 'selected':''}>${STATUS_LABEL[s]||s}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">KYT Keyword</label>
                            <input type="text" name="KYTKeyword" class="form-input w-full" value="${escHtml(r.KYTKeyword || '')}">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทความเสี่ยง</label>
                            <select name="RiskCategory" class="form-input w-full">
                                ${RISK_CATEGORIES.map(c => `<option value="${escHtml(c)}" ${r.RiskCategory === c ? 'selected':''}>${escHtml(c)}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อทีม</label>
                            <input type="text" name="TeamName" class="form-input w-full" value="${escHtml(r.TeamName || '')}">
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดอันตราย</label>
                        <textarea name="HazardDescription" rows="3" class="form-input w-full resize-none">${escHtml(r.HazardDescription || '')}</textarea>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">มาตรการตอบโต้</label>
                        <textarea name="Countermeasure" rows="3" class="form-input w-full resize-none">${escHtml(r.Countermeasure || '')}</textarea>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">ความคิดเห็น Admin</label>
                        <textarea name="AdminComment" rows="2" class="form-input w-full resize-none"
                                  placeholder="หมายเหตุ / ข้อเสนอแนะเพิ่มเติม...">${escHtml(r.AdminComment || '')}</textarea>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">อัปโหลดไฟล์แนบใหม่</label>
                            ${r.AttachmentUrl ? `<a href="${escHtml(r.AttachmentUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 mb-2">ดูไฟล์ปัจจุบัน</a>` : ''}
                            <input type="file" name="attachment" id="ky-manage-attachment"
                                   accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                   class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">อัปโหลดวิดีโอใหม่</label>
                            ${r.VideoUrl ? `<a href="${escHtml(r.VideoUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-800 mb-2">ดูวิดีโอปัจจุบัน</a>` : ''}
                            <input type="file" name="video" id="ky-manage-video"
                                   accept="video/mp4,video/quicktime,video/avi,video/webm,video/x-msvideo,video/mpeg"
                                   class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100">
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button type="button" class="btn btn-secondary px-4"
                                onclick="document.getElementById('modal-close-btn').click()">ยกเลิก</button>
                        <button type="submit" id="ky-manage-save" class="btn btn-primary px-5">บันทึก</button>
                    </div>
                </form>
            </div>`;

        openModal('จัดการกิจกรรม KY', html, 'max-w-xl');

        document.getElementById('ky-manage-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveBtn = document.getElementById('ky-manage-save');
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> กำลังบันทึก...`;

            try {
                showLoading('กำลังบันทึก...');
                const fd = new FormData(e.target);
                fd.delete('id');
                await API.put(`/ky/${r.id}`, fd);
                closeModal();
                showToast('อัปเดตกิจกรรม KY สำเร็จ', 'success');
                if (_activeTab === 'history') await fetchAndRenderHistory();
                if (_activeTab === 'manage') await fetchAndRenderManage('all');
                await _loadHeroStats();
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
        if (!e.target.closest('#ky-page')) return;

        // Tab
        const tabBtn = e.target.closest('.ky-tab');
        if (tabBtn) { await switchTab(tabBtn.dataset.tab); return; }

        // Manage sub-tab
        const msubBtn = e.target.closest('[data-msub]');
        if (msubBtn) {
            _manageSub = msubBtn.dataset.msub;
            const c = document.getElementById('ky-tab-content');
            if (c) await renderManage(c);
            return;
        }

        // Remove participant tag
        const removeBtn = e.target.closest('.ky-remove-participant');
        if (removeBtn) {
            const idx = parseInt(removeBtn.dataset.idx);
            _participants.splice(idx, 1);
            updateParticipantTags();
            return;
        }

        // View detail
        if (e.target.closest('.btn-ky-view')) {
            await showDetailModal(e.target.closest('.btn-ky-view').dataset.id);
            return;
        }

        // Manage
        if (e.target.closest('.btn-ky-manage')) {
            await showManageModal(e.target.closest('.btn-ky-manage').dataset.id);
            return;
        }

        // Delete record
        const delBtn = e.target.closest('.btn-ky-delete');
        if (delBtn) {
            const confirmed = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบกิจกรรม KY ของแผนก "${escHtml(delBtn.dataset.name)}" ใช่หรือไม่?`);
            if (confirmed) {
                showLoading('กำลังลบ...');
                try {
                    await API.delete(`/ky/${delBtn.dataset.id}`);
                    showToast('ลบกิจกรรม KY สำเร็จ', 'success');
                    if (_activeTab === 'history') await fetchAndRenderHistory();
                    if (_activeTab === 'manage') await fetchAndRenderManage('all');
                    await _loadHeroStats();
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // Add config btn
        if (e.target.closest('#ky-add-config-btn')) {
            await openAddConfigModal();
            return;
        }

        // Edit config
        const cfgEditBtn = e.target.closest('.btn-ky-cfg-edit');
        if (cfgEditBtn) {
            const cfg = _kyProgConfig.find(c => String(c.id) === cfgEditBtn.dataset.id);
            if (cfg) await openAddConfigModal(cfg);
            return;
        }

        // Delete config
        const cfgDelBtn = e.target.closest('.btn-ky-cfg-del');
        if (cfgDelBtn) {
            const confirmed = await showConfirmationModal('ลบการตั้งค่า', `ต้องการลบโปรแกรม KY ของแผนก "${escHtml(cfgDelBtn.dataset.dept)}" ใช่หรือไม่?`);
            if (confirmed) {
                showLoading('กำลังลบ...');
                try {
                    await API.delete(`/ky/program-config/${cfgDelBtn.dataset.id}`);
                    showToast('ลบการตั้งค่าสำเร็จ', 'success');
                    await _fetchProgramConfig(_filterMgmtYear);
                    renderManageConfig();
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // Preview image
        const previewBtn = e.target.closest('.btn-ky-preview');
        if (previewBtn) { showDocumentModal(previewBtn.dataset.url, previewBtn.dataset.title); return; }

        // PDF export
        if (e.target.closest('#ky-pdf-btn')) { await exportKyPDF(); return; }

        // Export Excel
        if (e.target.closest('#ky-export-btn')) { exportKyExcel(); return; }

        const kpiFilterBtn = e.target.closest('[data-ky-kpi-filter]');
        if (kpiFilterBtn) {
            _filterStatus = kpiFilterBtn.dataset.kyKpiFilter || 'all';
            _filterHistYear = _statsYear;
            await switchTab('history');
            return;
        }
    });

    // Filter + search changes
    document.addEventListener('change', async (e) => {
        if (!e.target.closest('#ky-page')) return;
        if (e.target.id === 'ky-filter-status') { _filterStatus = e.target.value; await fetchAndRenderHistory(); return; }
        if (e.target.id === 'ky-hist-date-from') { _filterDateFrom = e.target.value; await fetchAndRenderHistory(); return; }
        if (e.target.id === 'ky-hist-date-to')   { _filterDateTo   = e.target.value; await fetchAndRenderHistory(); return; }
        if (e.target.id === 'ky-hist-year') {
            _filterHistYear = parseInt(e.target.value);
            _kyProgConfig = []; // clear so renderHistory fetches fresh config for new year
            const c = document.getElementById('ky-tab-content');
            if (c) await renderHistory(c); // full re-render: updates info banner + dept dropdown
            return;
        }
        if (e.target.id === 'ky-hist-dept')     { _filterHistDept = e.target.value; await fetchAndRenderHistory(); return; }
        if (e.target.id === 'ky-hist-risk')     { _filterHistRisk = e.target.value; await fetchAndRenderHistory(); return; }
        if (e.target.id === 'ky-mgmt-year')     {
            _filterMgmtYear = parseInt(e.target.value);
            _kyProgConfig = [];
            await _fetchProgramConfig(_filterMgmtYear);
            await _renderManagePanel();
            return;
        }
        if (e.target.id === 'ky-mgmt-dept')     { _filterMgmtDept = e.target.value; await fetchAndRenderManage('all'); return; }
        if (e.target.id === 'ky-mgmt-risk')     { _filterMgmtRisk = e.target.value; await fetchAndRenderManage('all'); return; }
        if (e.target.id === 'ky-stats-year')    { _statsYear = parseInt(e.target.value); const c = document.getElementById('ky-tab-content'); if (c) await renderDashboard(c); return; }
    });

    document.addEventListener('input', debounce(async (e) => {
        if (!e.target.closest('#ky-page')) return;
        if (e.target.id === 'ky-history-search') { _searchQ = e.target.value; await fetchAndRenderHistory(); }
    }, 350));
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL EXPORT
// ─────────────────────────────────────────────────────────────────────────────
function exportKyExcel() {
    if (!window.XLSX) { showToast('ไม่พบ SheetJS library — กรุณารีเฟรชหน้า', 'error'); return; }
    if (!_historyRecords.length) { showToast('ไม่มีข้อมูลสำหรับ Export', 'warning'); return; }

    const rows = _historyRecords.map(r => {
        let parts = [];
        try { parts = JSON.parse(r.Participants || '[]'); } catch { parts = []; }
        return {
            'วันที่กิจกรรม':       r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH') : '-',
            'แผนก':               r.Department       || '-',
            'ทีม':                r.TeamName         || '-',
            'ผู้รายงาน':           r.ReporterName     || '-',
            'KYT Keyword':        r.KYTKeyword       || '-',
            'ประเภทอันตราย':       r.RiskCategory     || '-',
            'รายละเอียดอันตราย':   r.HazardDescription || '-',
            'มาตรการตอบโต้':       r.Countermeasure   || '-',
            'ผู้เข้าร่วม':         parts.join(', ')   || '-',
            'จำนวนผู้เข้าร่วม':    parts.length,
            'สถานะ':              STATUS_LABEL[r.Status] || r.Status || '-',
        };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KY Activities');

    const colWidths = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length * 2, 12) }));
    ws['!cols'] = colWidths;

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `KY_Activities_${today}.xlsx`);
    showToast('Export สำเร็จ', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT
// ─────────────────────────────────────────────────────────────────────────────
async function exportKyPDF() {
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        showToast('ไม่พบ library สำหรับสร้าง PDF', 'error');
        return;
    }
    showLoading('กำลังสร้าง PDF...');
    try {
        // Fetch stats + open/reviewed action items in parallel
        const [statsRes, actionRes] = await Promise.all([
            API.get(`/ky/stats?year=${_statsYear}`),
            API.get(`/ky?year=${_statsYear}&status=Open`).catch(() => ({ data: [] })),
        ]);
        const reviewedRes = await API.get(`/ky?year=${_statsYear}&status=Reviewed`).catch(() => ({ data: [] }));

        const data     = statsRes?.data || {};
        const kpi      = data.kpi  || {};
        const counts   = Array(12).fill(0);
        (data.monthly || []).forEach(r => { counts[(r.month || 1) - 1] = r.count || 0; });
        const maxCount   = Math.max(...counts, 1);
        const today      = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        const openItems  = normalizeApiArray(actionRes?.data ?? actionRes);
        const reviewItems = normalizeApiArray(reviewedRes?.data ?? reviewedRes);
        const actionItems = [...openItems, ...reviewItems];

        const { jsPDF } = jspdf;
        const pdf       = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const render = async (html) => {
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1122px;background:#fff;font-family:Kanit,sans-serif;overflow:hidden;';
            div.innerHTML = html;
            document.body.appendChild(div);
            const canvas = await html2canvas(div, { scale: 1.5, useCORS: true, logging: false, width: 794, height: 1122 });
            document.body.removeChild(div);
            return canvas;
        };

        // Page 1 — Executive Summary + Monthly Trend
        const canvas1 = await render(_buildKyPdfPage1(kpi, counts, maxCount, _statsYear, today));
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);

        // Page 2 — Department Ranking + Risk Category
        pdf.addPage();
        const canvas2 = await render(_buildKyPdfPage2(data.byDept || [], data.riskCat || [], data.pendingDepts || [], _statsYear, today));
        pdf.addImage(canvas2.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);

        // Page 3 — Yearly Target Coverage per Department (only when program config active)
        pdf.addPage();
        const canvas3 = await render(_buildKyPdfPage3(data.programProgress || [], data.usingConfig, _statsYear, today));
        pdf.addImage(canvas3.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);

        // Page 4 — Action Follow-up (Open + Reviewed items)
        pdf.addPage();
        const canvas4 = await render(_buildKyPdfPage4(actionItems, kpi, _statsYear, today));
        pdf.addImage(canvas4.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);

        pdf.save(`KY_Activity_${_statsYear}.pdf`);
        showToast('สร้าง PDF สำเร็จ (4 หน้า)', 'success');
    } catch (err) {
        console.error('KY PDF error:', err);
        showToast('ไม่สามารถสร้าง PDF ได้', 'error');
    } finally {
        hideLoading();
    }
}

function _buildKyPdfPage1(kpi, counts, maxCount, year, today) {
    const kpiBoxes = [
        { label: 'กิจกรรมทั้งหมด',  value: kpi.total || 0,              color: '#6366f1' },
        { label: 'แผนกที่ส่งแล้ว',   value: kpi.deptSubmitted || 0,      color: '#10b981' },
        { label: 'แผนกที่ยังไม่ส่ง', value: kpi.pendingDepts || 0,       color: '#f97316' },
        { label: 'Completion Rate',   value: `${kpi.completionRate || 0}%`, color: '#0284c7' },
    ];

    const monthBars = MONTHS_TH.map((label, i) => {
        const count = counts[i];
        const pct   = Math.round(count / maxCount * 100);
        return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
            <span style="width:32px;font-size:10px;color:#64748b;text-align:right;flex-shrink:0;">${label}</span>
            <div style="flex:1;height:14px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
                ${count > 0 ? `<div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:3px;"></div>` : ''}
            </div>
            <span style="width:20px;font-size:10px;color:#374151;text-align:right;flex-shrink:0;">${count}</span>
        </div>`;
    }).join('');

    const statusBoxes = [
        { label: 'รอตรวจสอบ',   value: kpi.open     || 0, bg: '#eff6ff', color: '#1d4ed8' },
        { label: 'ตรวจสอบแล้ว', value: kpi.reviewed  || 0, bg: '#fffbeb', color: '#92400e' },
        { label: 'ปิดแล้ว',     value: kpi.closed    || 0, bg: '#ecfdf5', color: '#065f46' },
    ];

    return `
    <div style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;">
        <div style="background:linear-gradient(135deg,#4338ca 0%,#6366f1 55%,#8b5cf6 100%);padding:32px 36px 24px;flex-shrink:0;">
            <div style="color:rgba(199,210,254,0.85);font-size:11px;font-weight:600;letter-spacing:0.1em;margin-bottom:6px;">KY ABILITY · HAZARD PREDICTION</div>
            <div style="color:#fff;font-size:26px;font-weight:700;line-height:1.2;">รายงานกิจกรรม KY ปี ${year}</div>
            <div style="color:rgba(199,210,254,0.85);font-size:12px;margin-top:6px;">สร้างเมื่อ ${today} · Thai Summit Harness Co., Ltd.</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;padding:20px 36px;flex-shrink:0;">
            ${kpiBoxes.map(b => `
            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 12px;text-align:center;border-top:3px solid ${b.color};">
                <div style="font-size:22px;font-weight:700;color:${b.color};">${b.value}</div>
                <div style="font-size:10px;color:#64748b;margin-top:4px;">${b.label}</div>
            </div>`).join('')}
        </div>

        <div style="flex:1;padding:0 36px 16px;overflow:hidden;">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">แนวโน้มกิจกรรม KY รายเดือน ปี ${year}</div>
            ${monthBars}
        </div>

        <div style="padding:16px 36px;flex-shrink:0;">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;">สถานะกิจกรรม KY</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
                ${statusBoxes.map(b => `
                <div style="background:${b.bg};border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:20px;font-weight:700;color:${b.color};">${b.value}</div>
                    <div style="font-size:10px;color:#64748b;margin-top:2px;">${b.label}</div>
                </div>`).join('')}
            </div>
        </div>

        <div style="background:linear-gradient(90deg,#4338ca,#6366f1);padding:10px 36px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">กิจกรรม KY · Thai Summit Harness Co., Ltd.</span>
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">หน้า 1 จาก 4</span>
        </div>
    </div>`;
}

function _buildKyPdfPage2(byDept, riskCat, pendingDepts, year, today) {
    const maxDept = Math.max(...byDept.map(d => d.count || 0), 1);
    const maxRisk = Math.max(...riskCat.map(r => r.count || 0), 1);

    const deptRows = byDept.slice(0, 12).map((d, i) => {
        const pct = Math.round((d.count || 0) / maxDept * 100);
        return `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px 8px;font-size:11px;color:#374151;width:24px;">${i + 1}.</td>
            <td style="padding:6px 8px;font-size:11px;color:#374151;">${d.Department || '-'}</td>
            <td style="padding:6px 8px;width:200px;">
                <div style="background:#f1f5f9;height:10px;border-radius:3px;overflow:hidden;">
                    <div style="background:linear-gradient(90deg,#6366f1,#8b5cf6);height:100%;width:${pct}%;border-radius:3px;"></div>
                </div>
            </td>
            <td style="padding:6px 8px;font-size:11px;color:#374151;text-align:right;font-weight:600;">${d.count || 0}</td>
        </tr>`;
    }).join('');

    const riskRows = riskCat.map(r => {
        const pct = Math.round((r.count || 0) / maxRisk * 100);
        return `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:5px 8px;font-size:11px;color:#374151;">${r.label || '-'}</td>
            <td style="padding:5px 8px;width:180px;">
                <div style="background:#f1f5f9;height:10px;border-radius:3px;overflow:hidden;">
                    <div style="background:linear-gradient(90deg,#f97316,#a855f7);height:100%;width:${pct}%;border-radius:3px;"></div>
                </div>
            </td>
            <td style="padding:5px 8px;font-size:11px;color:#374151;text-align:right;font-weight:600;">${r.count || 0}</td>
        </tr>`;
    }).join('');

    const pendingHtml = pendingDepts.length ? `
        <div style="padding:14px 36px;flex-shrink:0;">
            <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:8px;">แผนกที่ยังไม่ส่งเดือนนี้ (${pendingDepts.length} แผนก)</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${pendingDepts.map(d => `<span style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;padding:3px 8px;font-size:10px;">${d}</span>`).join('')}
            </div>
        </div>` : '';

    return `
    <div style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;">
        <div style="background:#f8fafc;border-bottom:2px solid #6366f1;padding:16px 36px;flex-shrink:0;">
            <div style="font-size:14px;font-weight:700;color:#4338ca;">กิจกรรม KY ปี ${year} · รายละเอียดแผนกและประเภทอันตราย</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px;">สร้างเมื่อ ${today}</div>
        </div>

        <div style="padding:16px 36px;flex-shrink:0;">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">กิจกรรม KY แยกตามแผนก (สูงสุด 12 แผนก)</div>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f8fafc;">
                        <th style="padding:6px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;width:24px;">#</th>
                        <th style="padding:6px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;">แผนก</th>
                        <th style="padding:6px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;width:200px;">สัดส่วน</th>
                        <th style="padding:6px 8px;font-size:10px;color:#64748b;text-align:right;font-weight:600;">จำนวน</th>
                    </tr>
                </thead>
                <tbody>${deptRows || '<tr><td colspan="4" style="text-align:center;padding:12px;font-size:11px;color:#94a3b8;">ไม่มีข้อมูล</td></tr>'}</tbody>
            </table>
        </div>

        <div style="padding:0 36px 16px;flex-shrink:0;">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">ประเภทอันตราย</div>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f8fafc;">
                        <th style="padding:5px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;">ประเภท</th>
                        <th style="padding:5px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;width:180px;">สัดส่วน</th>
                        <th style="padding:5px 8px;font-size:10px;color:#64748b;text-align:right;font-weight:600;">จำนวน</th>
                    </tr>
                </thead>
                <tbody>${riskRows || '<tr><td colspan="3" style="text-align:center;padding:12px;font-size:11px;color:#94a3b8;">ไม่มีข้อมูล</td></tr>'}</tbody>
            </table>
        </div>

        ${pendingHtml}

        <div style="flex:1;"></div>

        <div style="background:linear-gradient(90deg,#4338ca,#6366f1);padding:10px 36px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">กิจกรรม KY · Thai Summit Harness Co., Ltd.</span>
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">หน้า 2 จาก 4</span>
        </div>
    </div>`;
}

function _buildKyPdfPage3(progData, usingConfig, year, today) {
    const footer = `
        <div style="background:linear-gradient(90deg,#4338ca,#6366f1);padding:10px 36px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">กิจกรรม KY · Thai Summit Harness Co., Ltd.</span>
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">หน้า 3 จาก 4</span>
        </div>`;

    if (!usingConfig || !progData.length) {
        return `
        <div style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;">
            <div style="background:#f8fafc;border-bottom:2px solid #6366f1;padding:16px 36px;flex-shrink:0;">
                <div style="font-size:14px;font-weight:700;color:#4338ca;">Department Coverage · ปี ${year}</div>
                <div style="font-size:10px;color:#64748b;margin-top:2px;">สร้างเมื่อ ${today}</div>
            </div>
            <div style="flex:1;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;">
                ไม่มีการตั้งค่า Program Config — กำหนดเป้าหมายรายส่วนงานได้ในแท็บ "จัดการ"
            </div>
            ${footer}
        </div>`;
    }

    const sorted = [...progData].sort((a, b) => a.pct - b.pct || a.department.localeCompare(b.department));
    const onTrack  = sorted.filter(d => d.pct >= 80).length;
    const atRisk   = sorted.filter(d => d.pct >= 40 && d.pct < 80).length;
    const critical = sorted.filter(d => d.pct < 40).length;
    const barCol = p => p >= 80 ? '#059669' : p >= 40 ? '#d97706' : '#ef4444';
    const txtCol = p => p >= 80 ? '#065f46' : p >= 40 ? '#92400e' : '#991b1b';
    const bgCol  = p => p >= 80 ? '#ecfdf5' : p >= 40 ? '#fffbeb' : '#fef2f2';

    const rows = sorted.map(d => {
        const pct = Math.max(0, Math.min(100, d.pct));
        return `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:7px 8px;font-size:11px;color:#374151;max-width:180px;">${d.department}</td>
            <td style="padding:7px 8px;width:240px;">
                <div style="background:#f1f5f9;height:12px;border-radius:4px;overflow:hidden;">
                    <div style="background:${barCol(pct)};height:100%;width:${pct}%;border-radius:4px;"></div>
                </div>
            </td>
            <td style="padding:7px 8px;font-size:11px;color:#374151;text-align:center;font-weight:600;">${d.submitted}/${d.target}</td>
            <td style="padding:7px 8px;text-align:center;">
                <span style="background:${bgCol(pct)};color:${txtCol(pct)};border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;">${pct}%</span>
            </td>
            <td style="padding:7px 8px;font-size:10px;color:#64748b;text-align:right;">${pct >= 100 ? 'ครบแล้ว' : `เหลือ ${Math.max(0, d.target - d.submitted)}`}</td>
        </tr>`;
    }).join('');

    return `
    <div style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;">
        <div style="background:#f8fafc;border-bottom:2px solid #6366f1;padding:16px 36px;flex-shrink:0;">
            <div style="font-size:14px;font-weight:700;color:#4338ca;">ความคืบหน้ากิจกรรม KY รายส่วนงาน · ปี ${year}</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px;">Program Config — เป้าหมายรายปี · สร้างเมื่อ ${today}</div>
        </div>

        <div style="padding:16px 36px;flex-shrink:0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
            <div style="background:#ecfdf5;border-radius:10px;padding:12px;text-align:center;border-top:3px solid #059669;">
                <div style="font-size:22px;font-weight:700;color:#059669;">${onTrack}</div>
                <div style="font-size:10px;color:#065f46;margin-top:3px;">On Track (≥ 80%)</div>
            </div>
            <div style="background:#fffbeb;border-radius:10px;padding:12px;text-align:center;border-top:3px solid #d97706;">
                <div style="font-size:22px;font-weight:700;color:#d97706;">${atRisk}</div>
                <div style="font-size:10px;color:#92400e;margin-top:3px;">At Risk (40–79%)</div>
            </div>
            <div style="background:#fef2f2;border-radius:10px;padding:12px;text-align:center;border-top:3px solid #ef4444;">
                <div style="font-size:22px;font-weight:700;color:#ef4444;">${critical}</div>
                <div style="font-size:10px;color:#991b1b;margin-top:3px;">Critical (< 40%)</div>
            </div>
        </div>

        <div style="flex:1;padding:0 36px 16px;overflow:hidden;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f8fafc;">
                        <th style="padding:7px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;">ส่วนงาน</th>
                        <th style="padding:7px 8px;font-size:10px;color:#64748b;text-align:left;font-weight:600;width:240px;">ความคืบหน้า</th>
                        <th style="padding:7px 8px;font-size:10px;color:#64748b;text-align:center;font-weight:600;">ส่งแล้ว/เป้า</th>
                        <th style="padding:7px 8px;font-size:10px;color:#64748b;text-align:center;font-weight:600;">%</th>
                        <th style="padding:7px 8px;font-size:10px;color:#64748b;text-align:right;font-weight:600;">เหลือ</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;font-size:11px;">ไม่มีข้อมูล</td></tr>'}</tbody>
            </table>
        </div>

        ${footer}
    </div>`;
}

function _buildKyPdfPage4(actionItems, kpi, year, today) {
    const openItems     = actionItems.filter(r => r.Status === 'Open');
    const reviewedItems = actionItems.filter(r => r.Status === 'Reviewed');
    const closureRate   = kpi.total > 0 ? Math.round(((kpi.closed || 0) / kpi.total) * 100) : 0;

    const itemRow = (r, statusColor, statusLabel) => {
        const date = r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-';
        const hazard = (r.HazardDescription || '').slice(0, 70) + ((r.HazardDescription || '').length > 70 ? '...' : '');
        return `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:5px 8px;font-size:10px;color:#374151;white-space:nowrap;">${date}</td>
            <td style="padding:5px 8px;font-size:10px;color:#374151;">${r.Department || '-'}</td>
            <td style="padding:5px 8px;font-size:10px;color:#374151;">${r.ReporterName || '-'}</td>
            <td style="padding:5px 8px;font-size:10px;color:#374151;">${r.RiskCategory || '-'}</td>
            <td style="padding:5px 8px;font-size:10px;color:#374151;max-width:180px;">${hazard}</td>
            <td style="padding:5px 8px;text-align:center;">
                <span style="background:${statusColor}18;color:${statusColor};border-radius:999px;padding:2px 7px;font-size:9px;font-weight:700;">${statusLabel}</span>
            </td>
        </tr>`;
    };

    const openRows     = openItems.slice(0, 14).map(r => itemRow(r, '#0284c7', 'รอตรวจสอบ')).join('');
    const reviewedRows = reviewedItems.slice(0, 10).map(r => itemRow(r, '#d97706', 'ตรวจสอบแล้ว')).join('');

    return `
    <div style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;">
        <div style="background:#f8fafc;border-bottom:2px solid #6366f1;padding:16px 36px;flex-shrink:0;">
            <div style="font-size:14px;font-weight:700;color:#4338ca;">Action Follow-up · ปี ${year}</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px;">รายการที่ต้องติดตาม — รอตรวจสอบ + ตรวจสอบแล้ว · สร้างเมื่อ ${today}</div>
        </div>

        <div style="padding:14px 36px;flex-shrink:0;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
            <div style="background:#eff6ff;border-radius:8px;padding:10px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#1d4ed8;">${openItems.length}</div>
                <div style="font-size:10px;color:#1e40af;margin-top:2px;">รอตรวจสอบ</div>
            </div>
            <div style="background:#fffbeb;border-radius:8px;padding:10px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#d97706;">${reviewedItems.length}</div>
                <div style="font-size:10px;color:#92400e;margin-top:2px;">ตรวจสอบแล้ว</div>
            </div>
            <div style="background:#ecfdf5;border-radius:8px;padding:10px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#059669;">${kpi.closed || 0}</div>
                <div style="font-size:10px;color:#065f46;margin-top:2px;">ปิดแล้ว</div>
            </div>
            <div style="background:#f0fdf4;border-radius:8px;padding:10px;text-align:center;border:1px solid #bbf7d0;">
                <div style="font-size:18px;font-weight:700;color:#0f766e;">${closureRate}%</div>
                <div style="font-size:10px;color:#0f766e;margin-top:2px;">Closure Rate</div>
            </div>
        </div>

        <div style="flex:1;padding:0 36px 8px;overflow:hidden;">
            ${openItems.length ? `
            <div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e0e7ff;">รายการรอตรวจสอบ (${openItems.length} รายการ)</div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
                <thead><tr style="background:#eff6ff;">
                    <th style="padding:5px 8px;font-size:9px;color:#1e40af;text-align:left;font-weight:700;">วันที่</th>
                    <th style="padding:5px 8px;font-size:9px;color:#1e40af;text-align:left;font-weight:700;">แผนก</th>
                    <th style="padding:5px 8px;font-size:9px;color:#1e40af;text-align:left;font-weight:700;">ผู้รายงาน</th>
                    <th style="padding:5px 8px;font-size:9px;color:#1e40af;text-align:left;font-weight:700;">ประเภท</th>
                    <th style="padding:5px 8px;font-size:9px;color:#1e40af;text-align:left;font-weight:700;">อันตราย</th>
                    <th style="padding:5px 8px;font-size:9px;color:#1e40af;text-align:center;font-weight:700;">สถานะ</th>
                </tr></thead>
                <tbody>${openRows || '<tr><td colspan="6" style="text-align:center;padding:8px;color:#94a3b8;font-size:10px;">ไม่มีรายการ</td></tr>'}</tbody>
            </table>` : ''}

            ${reviewedItems.length ? `
            <div style="font-size:11px;font-weight:700;color:#d97706;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #fef3c7;">รายการตรวจสอบแล้ว — รอปิด (${reviewedItems.length} รายการ)</div>
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr style="background:#fffbeb;">
                    <th style="padding:5px 8px;font-size:9px;color:#92400e;text-align:left;font-weight:700;">วันที่</th>
                    <th style="padding:5px 8px;font-size:9px;color:#92400e;text-align:left;font-weight:700;">แผนก</th>
                    <th style="padding:5px 8px;font-size:9px;color:#92400e;text-align:left;font-weight:700;">ผู้รายงาน</th>
                    <th style="padding:5px 8px;font-size:9px;color:#92400e;text-align:left;font-weight:700;">ประเภท</th>
                    <th style="padding:5px 8px;font-size:9px;color:#92400e;text-align:left;font-weight:700;">อันตราย</th>
                    <th style="padding:5px 8px;font-size:9px;color:#92400e;text-align:center;font-weight:700;">สถานะ</th>
                </tr></thead>
                <tbody>${reviewedRows || '<tr><td colspan="6" style="text-align:center;padding:8px;color:#94a3b8;font-size:10px;">ไม่มีรายการ</td></tr>'}</tbody>
            </table>` : ''}

            ${!openItems.length && !reviewedItems.length ? `
            <div style="display:flex;align-items:center;justify-content:center;height:60%;color:#059669;font-size:13px;font-weight:600;">
                ไม่มีรายการค้างจัดการ — ทุกรายการปิดแล้ว
            </div>` : ''}
        </div>

        <div style="background:linear-gradient(90deg,#4338ca,#6366f1);padding:10px 36px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">กิจกรรม KY · Thai Summit Harness Co., Ltd.</span>
            <span style="color:rgba(199,210,254,0.9);font-size:10px;">หน้า 4 จาก 4</span>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
function loadingRow(cols) {
    return `<tr><td colspan="${cols}" class="text-center py-8 text-slate-400">
        <div class="animate-spin inline-block h-6 w-6 border-4 border-indigo-400 border-t-transparent rounded-full mb-2"></div>
        <div class="text-sm">กำลังโหลด...</div>
    </td></tr>`;
}

function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
