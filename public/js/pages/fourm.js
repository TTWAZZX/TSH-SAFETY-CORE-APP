// public/js/pages/fourm.js
// 4M Change Management — Enterprise Edition
import { API } from '../api.js';
import {
    hideLoading, showError, showLoading,
    openModal, closeModal, showToast, showConfirmationModal, showDocumentModal, escHtml
} from '../ui.js';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const CHANGE_TYPES    = ['Man', 'Machine', 'Material', 'Method'];
const NOTICE_STATUSES = ['Open', 'Pending', 'Closed'];
const MAN_STATUSES    = ['Pass', 'Fail', 'Pending'];
const OVERDUE_DAYS    = 30;

const TYPE_META = {
    Man:      { bg:'#eff6ff', text:'#1d4ed8', dot:'#3b82f6' },
    Machine:  { bg:'#fff7ed', text:'#c2410c', dot:'#f97316' },
    Material: { bg:'#f0fdf4', text:'#15803d', dot:'#22c55e' },
    Method:   { bg:'#faf5ff', text:'#7e22ce', dot:'#a855f7' },
};
const STATUS_META = {
    Open:    { label:'Open',        bg:'#e0f2fe', text:'#0369a1' },
    Pending: { label:'รอดำเนินการ', bg:'#fef9c3', text:'#a16207' },
    Closed:  { label:'ปิดแล้ว',     bg:'#f1f5f9', text:'#64748b' },
};

const CHART_COLORS = ['#6366f1','#f97316','#22c55e','#a855f7'];
const MONTHS_TH    = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

const EXTERNAL_SYSTEMS = [
    {
        title: '4M Change Testing',
        desc:  'ระบบทดสอบความรู้ 4M Change สำหรับพนักงาน ใช้สำหรับทดสอบและประเมินผลก่อนการเปลี่ยนแปลง',
        url:   'http://192.168.124.40/fourm_testing/',
        color: '#6366f1', light: '#eef2ff',
        icon:  `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>`,
    },
    {
        title: '4M Change Report',
        desc:  'ระบบรายงาน 4M Change ใช้สำหรับดูผลสรุปและรายงานการเปลี่ยนแปลง 4M ขององค์กร',
        url:   'http://192.168.124.40/fourm_report/login/',
        color: '#0284c7', light: '#e0f2fe',
        icon:  `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>`,
    },
    {
        title: 'Safety 4M Change',
        desc:  'ระบบ Safety 4M Change สำหรับการจัดการด้านความปลอดภัยที่เกี่ยวข้องกับการเปลี่ยนแปลง 4M',
        url:   'http://it.tshpcl.com/safety.exam/',
        color: '#059669', light: '#ecfdf5',
        icon:  `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>`,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _isAdmin        = false;
let _currentUser    = {};
let _activeTab      = 'dashboard';
let _statsYear      = new Date().getFullYear();
let _noticeFilter   = { status:'all', type:'all', dept:'all', year: new Date().getFullYear(), q:'', overdue:false };
let _manFilter      = { q:'', year: new Date().getFullYear() };
let _listenersReady = false;
let _chartLine      = null;
let _chartPie       = null;
let _chartBar       = null;
let _departments    = [];
let _statsData      = null;
let _lastNotices    = [];
let _fourmForms     = [];

// ─────────────────────────────────────────────────────────────────────────────
// Main Loader
// ─────────────────────────────────────────────────────────────────────────────
export async function loadFourmPage() {
    const container = document.getElementById('fourm-page');
    if (!container) return;

    _currentUser = TSHSession.getUser() || {};
    _isAdmin     = _currentUser.role === 'Admin' || _currentUser.Role === 'Admin';
    window.closeModal = closeModal;

    container.innerHTML = buildShell();

    if (!_listenersReady) { setupEventListeners(); _listenersReady = true; }
    _activeTab = window._getTab?.('fourm', _activeTab) || _activeTab;
    switchTab(_activeTab);
    _loadHeroStats();
    _loadDepts();
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────────────────────
function _getFourmTabs() {
    return [
        { id:'dashboard', label:'Dashboard',    icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
        { id:'notices',   label:'Change Notice',icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>` },
        { id:'man',       label:'Man Record',   icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>` },
        { id:'systems',   label:'ระบบภายนอก',  icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>` },
    ];
}

function buildShell() {
    const tabHtml = _getFourmTabs().map(t => `
        <button id="fourm-tab-btn-${t.id}" data-tab="${t.id}"
            class="fourm-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#312e81 0%,#4338ca 55%,#0284c7 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="fourm-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#fourm-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none"
                 style="background:radial-gradient(circle,#fff,transparent 70%)"></div>
            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                </svg>
                                4M Change
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">บริหารการเปลี่ยนแปลง 4M</h1>
                        <p class="text-sm mt-1" style="color:rgba(199,210,254,0.85)">Man · Machine · Material · Method · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <div id="fourm-hero-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 w-full md:w-auto flex-shrink-0"></div>
                </div>
                <div class="flex overflow-x-auto gap-0 -mb-px scrollbar-none">${tabHtml}</div>
            </div>
        </div>
        <div id="fourm-tab-content" class="min-h-[400px]"></div>
    </div>`;
}

async function switchTab(tab) {
    _activeTab = tab;
    window._saveTab?.('fourm', tab);
    const active   = 'fourm-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white';
    const inactive = 'fourm-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';
    _getFourmTabs().forEach(t => {
        const btn = document.getElementById(`fourm-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === tab ? active : inactive;
        btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>${t.label}`;
    });
    const c = document.getElementById('fourm-tab-content');
    if (!c) return;
    c.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-slate-400"><div class="animate-spin rounded-full h-9 w-9 border-4 border-indigo-500 border-t-transparent mb-3"></div><p class="text-sm">กำลังโหลด...</p></div>`;
    switch (tab) {
        case 'dashboard': await renderDashboard(c); break;
        case 'notices':   await renderNotices(c);   break;
        case 'man':       await renderMan(c);        break;
        case 'systems':   await renderSystems(c);    break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero Stats
// ─────────────────────────────────────────────────────────────────────────────
async function _loadHeroStats() {
    const strip = document.getElementById('fourm-hero-stats');
    if (!strip) return;
    strip.innerHTML = [1,2,3,4].map(() => `
        <div class="rounded-xl px-4 py-3 text-center animate-pulse" style="background:rgba(255,255,255,0.12);min-width:80px">
            <div class="h-7 bg-white/20 rounded-lg mb-1.5 mx-auto w-10"></div>
            <div class="h-3 bg-white/15 rounded w-14 mx-auto"></div>
        </div>`).join('');
    try {
        const res = await API.get(`/fourm/stats?year=${new Date().getFullYear()}`);
        _statsData = res?.data || {};
        const kpi     = _statsData.noticeKpi || {};
        const total   = parseInt(kpi.total)   || 0;
        const closed  = parseInt(kpi.closed)  || 0;
        const pending = parseInt(kpi.pending) || 0;
        const closureRate = total > 0 ? Math.round(closed / total * 100) : 0;
        const stats = [
            { value: total,            label:'ทั้งหมด',    color:'#c7d2fe' },
            { value: kpi.open ?? '—',  label:'Open',       color:'#bae6fd' },
            { value: pending || '—',   label:'รอดำเนินการ',color: pending > 0 ? '#fde68a' : '#c7d2fe' },
            { value: `${closureRate}%`,label:'Closure Rate',color: closureRate >= 80 ? '#a7f3d0' : closureRate >= 50 ? '#fde68a' : '#c7d2fe' },
        ];
        strip.innerHTML = stats.map(s => `
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
                <p class="text-2xl font-bold" style="color:${s.color}">${s.value}</p>
                <p class="text-[11px] mt-0.5" style="color:rgba(199,210,254,0.85)">${s.label}</p>
            </div>`).join('');
    } catch { strip.innerHTML = ''; }
}

async function _loadDepts() {
    if (_departments.length) return;
    try {
        const res = await API.get('/master/departments');
        _departments = (normalizeApiArray(res?.data ?? res) || [])
            .map(d => (d.Name || d.name || '').trim()).filter(Boolean);
    } catch { _departments = []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1: Dashboard
// ─────────────────────────────────────────────────────────────────────────────
async function renderDashboard(container) {
    container.innerHTML = `
        <div class="space-y-5">
            <div class="flex justify-end">
                <select id="fourm-stats-year" class="form-input py-1.5 text-sm w-32">
                    ${[0,1,2].map(i => { const y = new Date().getFullYear()-i; return `<option value="${y}" ${y===_statsYear?'selected':''}>${y}</option>`; }).join('')}
                </select>
            </div>
            <div id="fourm-dash-inner" class="space-y-5">
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    ${Array(4).fill(0).map(() => `<div class="card p-4 animate-pulse"><div class="h-8 bg-slate-100 rounded mb-2"></div><div class="h-4 bg-slate-50 rounded w-2/3"></div></div>`).join('')}
                </div>
            </div>
        </div>`;

    await _renderDashInner();
}

async function _renderDashInner() {
    const inner = document.getElementById('fourm-dash-inner');
    if (!inner) return;
    try {
        const res  = await API.get(`/fourm/stats?year=${_statsYear}`);
        const data = res?.data || {};
        const kpi  = data.noticeKpi || {};
        const overdue    = data.overdueCount || 0;
        const byDeptType = data.byDeptType   || [];

        const total   = parseInt(kpi.total)   || 0;
        const closed  = parseInt(kpi.closed)  || 0;
        const pending = parseInt(kpi.pending) || 0;
        const closureRate = total > 0 ? Math.round(closed / total * 100) : 0;

        inner.innerHTML = `
            ${_buildAlertStrip(kpi, overdue)}

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                ${_buildKpiCards(kpi, overdue, closureRate)}
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="lg:col-span-2 card p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">แนวโน้ม Change Notice รายเดือน</h3>
                    <div style="height:220px"><canvas id="fourm-chart-line"></canvas></div>
                </div>
                <div class="card p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">สัดส่วน Change Type</h3>
                    <div style="height:220px"><canvas id="fourm-chart-pie"></canvas></div>
                </div>
            </div>

            <div class="card p-5">
                <h3 class="text-sm font-bold text-slate-600 mb-4">Change Notice แยกตามแผนก (Top 10)</h3>
                <div style="height:220px"><canvas id="fourm-chart-bar"></canvas></div>
            </div>

            ${byDeptType.length ? _buildDeptMatrix(byDeptType) : ''}
        `;

        renderLineChart(data.monthly || []);
        renderPieChart(data.byType   || []);
        renderBarChart(data.byDept   || []);
    } catch (err) { console.error('4M dashboard error:', err); }
}

function _buildAlertStrip(kpi, overdue) {
    const pending = parseInt(kpi.pending) || 0;
    if (!pending && !overdue) return '';
    const items = [];
    if (pending) items.push(`<button class="fourm-kpi-nav font-semibold hover:underline" data-filter-status="Pending">${pending} รายการรอดำเนินการ</button>`);
    if (overdue) items.push(`<button class="fourm-kpi-nav font-semibold hover:underline" data-filter-overdue="1">${overdue} รายการค้างนาน (>${OVERDUE_DAYS} วัน)</button>`);
    return `
    <div class="flex items-center gap-3 p-3 rounded-xl text-sm" style="background:#fffbeb;border:1px solid #fde68a;color:#92400e">
        <svg class="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <div class="flex flex-wrap items-center gap-2">${items.join('<span class="opacity-40">·</span>')}</div>
    </div>`;
}

function _buildKpiCards(kpi, overdue, closureRate) {
    const cards = [
        { label:'Change Notice ทั้งหมด', value: parseInt(kpi.total)||0, color:'#6366f1',
          icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>`,
          filterStatus:'all' },
        { label:'Open', value: parseInt(kpi.open)||0, color:'#0284c7',
          icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>`,
          filterStatus:'Open' },
        { label:'รอดำเนินการ', value: parseInt(kpi.pending)||0, color:'#d97706',
          icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>`,
          filterStatus:'Pending', highlight: (parseInt(kpi.pending)||0) > 0 },
        { label:'ปิดแล้ว', value: parseInt(kpi.closed)||0, color:'#059669',
          icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>`,
          filterStatus:'Closed', sub: closureRate > 0 ? `${closureRate}% closure rate` : '' },
    ];
    return cards.map(c => `
        <button class="card p-5 flex items-center gap-4 text-left w-full hover:shadow-md transition-shadow group fourm-kpi-nav ${c.highlight ? 'ring-2 ring-amber-300' : ''}"
                data-filter-status="${c.filterStatus}">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                 style="background:${c.color}18;color:${c.color}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${c.icon}</svg>
            </div>
            <div>
                <div class="text-2xl font-bold text-slate-800">${c.value}</div>
                <div class="text-xs text-slate-500 mt-0.5">${c.label}</div>
                ${c.sub ? `<div class="text-xs font-semibold mt-0.5" style="color:#059669">${c.sub}</div>` : ''}
            </div>
        </button>`).join('');
}

function _buildDeptMatrix(byDeptType) {
    const depts = [...new Set(byDeptType.map(r => r.Department))].slice(0, 10);
    if (!depts.length) return '';
    return `
    <div class="card overflow-hidden">
        <div class="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18M10 3v18M14 3v18M3 3h18v18H3z"/>
            </svg>
            <h3 class="text-sm font-bold text-slate-700">แผนก × Change Type</h3>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-xs">
                <thead>
                    <tr class="bg-slate-50">
                        <th class="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider">แผนก</th>
                        ${CHANGE_TYPES.map(t => `<th class="px-3 py-2.5 text-center font-bold" style="color:${TYPE_META[t].text}">${t}</th>`).join('')}
                        <th class="px-3 py-2.5 text-center font-semibold text-slate-500 uppercase tracking-wider">รวม</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                    ${depts.map(dept => {
                        const deptRows = byDeptType.filter(r => r.Department === dept);
                        const total = deptRows.reduce((s, r) => s + (parseInt(r.count)||0), 0);
                        return `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-4 py-2.5 font-medium text-slate-700 max-w-[140px] truncate">${escHtml(dept)}</td>
                            ${CHANGE_TYPES.map(t => {
                                const item = deptRows.find(r => r.ChangeType === t);
                                const cnt  = parseInt(item?.count) || 0;
                                return `<td class="px-3 py-2.5 text-center">
                                    ${cnt ? `<span class="inline-block px-2 py-0.5 rounded-full font-semibold" style="background:${TYPE_META[t].bg};color:${TYPE_META[t].text}">${cnt}</span>` : '<span class="text-slate-300">—</span>'}
                                </td>`;
                            }).join('')}
                            <td class="px-3 py-2.5 text-center font-bold text-slate-700">${total}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderLineChart(monthly) {
    const ctx = document.getElementById('fourm-chart-line');
    if (!ctx) return;
    if (_chartLine) { _chartLine.destroy(); _chartLine = null; }
    const counts = Array(12).fill(0);
    monthly.forEach(r => { counts[(r.month||1)-1] = r.count||0; });
    _chartLine = new Chart(ctx, {
        type: 'line',
        data: { labels: MONTHS_TH, datasets: [{ label:'Change Notice', data: counts,
            borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.08)',
            tension:0.4, fill:true, pointBackgroundColor:'#6366f1', pointRadius:4 }] },
        options: { responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{ display:false } },
            scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1, font:{ family:'Kanit' } }, grid:{ color:'#f1f5f9' } },
                     x:{ ticks:{ font:{ family:'Kanit', size:11 } }, grid:{ display:false } } } }
    });
}

function renderPieChart(data) {
    const ctx = document.getElementById('fourm-chart-pie');
    if (!ctx) return;
    if (_chartPie) { _chartPie.destroy(); _chartPie = null; }
    _chartPie = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: data.map(d => d.label), datasets: [{ data: data.map(d => d.count),
            backgroundColor: CHART_COLORS, borderWidth:2, borderColor:'#fff' }] },
        options: { responsive:true, maintainAspectRatio:false, cutout:'55%',
            plugins:{ legend:{ position:'bottom', labels:{ font:{ family:'Kanit', size:11 }, padding:10, boxWidth:12 } } } }
    });
}

function renderBarChart(data) {
    const ctx = document.getElementById('fourm-chart-bar');
    if (!ctx) return;
    if (_chartBar) { _chartBar.destroy(); _chartBar = null; }
    _chartBar = new Chart(ctx, {
        type: 'bar',
        data: { labels: data.map(d => d.label), datasets: [{ label:'Change Notice', data: data.map(d => d.count),
            backgroundColor:'rgba(99,102,241,0.6)', borderColor:'#6366f1', borderWidth:2, borderRadius:6 }] },
        options: { responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{ display:false } },
            scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1, font:{ family:'Kanit' } }, grid:{ color:'#f1f5f9' } },
                     x:{ ticks:{ font:{ family:'Kanit', size:10 }, maxRotation:40 }, grid:{ display:false } } } }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Change Notice
// ─────────────────────────────────────────────────────────────────────────────
async function renderNotices(container) {
    const yearOpts = [0,1,2].map(i => { const y = new Date().getFullYear()-i; return `<option value="${y}" ${y===_noticeFilter.year?'selected':''}>${y}</option>`; }).join('');
    const deptOpts = `<option value="all">ทุกแผนก</option>${_departments.map(d => `<option value="${d}" ${_noticeFilter.dept===d?'selected':''}>${escHtml(d)}</option>`).join('')}`;
    const curStatusVal = _noticeFilter.overdue ? 'overdue' : _noticeFilter.status;

    container.innerHTML = `
        <div class="space-y-4">
            <div class="card p-4">
                <div class="flex flex-wrap gap-2.5 items-center">
                    <select id="notice-filter-year" class="form-input py-1.5 text-sm w-24">${yearOpts}</select>
                    <select id="notice-filter-status" class="form-input py-1.5 text-sm">
                        <option value="all"     ${curStatusVal==='all'    ?'selected':''}>ทุกสถานะ</option>
                        <option value="Open"    ${curStatusVal==='Open'   ?'selected':''}>Open</option>
                        <option value="Pending" ${curStatusVal==='Pending'?'selected':''}>รอดำเนินการ</option>
                        <option value="Closed"  ${curStatusVal==='Closed' ?'selected':''}>ปิดแล้ว</option>
                        <option value="overdue" ${curStatusVal==='overdue'?'selected':''}>ค้างนาน (&gt;${OVERDUE_DAYS} วัน)</option>
                    </select>
                    <select id="notice-filter-type" class="form-input py-1.5 text-sm">
                        <option value="all" ${_noticeFilter.type==='all'?'selected':''}>ทุก Type</option>
                        ${CHANGE_TYPES.map(t => `<option value="${t}" ${_noticeFilter.type===t?'selected':''}>${t}</option>`).join('')}
                    </select>
                    <select id="notice-filter-dept" class="form-input py-1.5 text-sm">${deptOpts}</select>
                    <div class="relative flex-1 min-w-[180px]">
                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input id="notice-search" type="text" placeholder="Notice No / หัวข้อ / ผู้รับผิดชอบ..."
                               value="${escHtml(_noticeFilter.q)}" class="form-input w-full pl-9 text-sm py-2">
                    </div>
                    <div class="flex items-center gap-2 ml-auto">
                        <button id="btn-export-notices"
                                class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                            </svg>
                            Excel
                        </button>
                        ${_isAdmin ? `
                        <button id="btn-add-notice"
                                class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white whitespace-nowrap"
                                style="background:linear-gradient(135deg,#6366f1,#0284c7);box-shadow:0 2px 8px rgba(99,102,241,0.3)">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                            </svg>
                            เพิ่ม Notice
                        </button>` : ''}
                    </div>
                </div>
            </div>

            <div class="card overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">Notice No</th>
                                <th class="px-4 py-3">วันที่</th>
                                <th class="px-4 py-3">หัวข้อ</th>
                                <th class="px-4 py-3">Change Type</th>
                                <th class="px-4 py-3">ผู้รับผิดชอบ</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3">วันที่ปิด</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="notice-tbody" class="divide-y divide-slate-100">${loadingRow(8)}</tbody>
                    </table>
                </div>
            </div>
        </div>`;

    await fetchAndRenderNotices();
}

async function fetchAndRenderNotices() {
    const tbody = document.getElementById('notice-tbody');
    if (!tbody) return;
    try {
        const p = new URLSearchParams();
        if (_noticeFilter.overdue) {
            p.set('overdue', '1');
        } else if (_noticeFilter.status !== 'all') {
            p.set('status', _noticeFilter.status);
        }
        if (_noticeFilter.type !== 'all') p.set('type', _noticeFilter.type);
        if (_noticeFilter.dept !== 'all') p.set('dept', _noticeFilter.dept);
        p.set('year', _noticeFilter.year);
        if (_noticeFilter.q.trim()) p.set('q', _noticeFilter.q.trim());

        const res  = await API.get(`/fourm/notices?${p}`);
        const rows = normalizeApiArray(res?.data ?? res);
        _lastNotices = rows;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400 text-sm">ไม่พบ Change Notice ที่ตรงกับเงื่อนไข</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const reqDate   = r.RequestDate ? new Date(r.RequestDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            const closeDate = r.ClosedDate  ? new Date(r.ClosedDate).toLocaleDateString('th-TH',  { day:'numeric', month:'short', year:'numeric' }) : '-';
            const canClose  = r.Status !== 'Closed' && (r.CreatedByID === _currentUser.id || _isAdmin);
            const tm   = TYPE_META[r.ChangeType] || { bg:'#f8fafc', text:'#64748b' };
            const sm   = STATUS_META[r.Status]   || { bg:'#f1f5f9', text:'#64748b', label: r.Status };

            const daysOld  = r.Status !== 'Closed' ? Math.floor((new Date() - new Date(r.RequestDate)) / 86400000) : 0;
            const isOverdue = daysOld > OVERDUE_DAYS;
            const rowStyle  = isOverdue ? 'background:rgba(254,242,242,0.7)' : '';

            return `
            <tr class="hover:bg-slate-50 transition-colors group" style="${rowStyle}">
                <td class="px-4 py-3">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-mono text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">${escHtml(r.NoticeNo||'-')}</span>
                        ${isOverdue ? `<span class="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">ค้าง ${daysOld - OVERDUE_DAYS} วัน</span>` : ''}
                    </div>
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${reqDate}</td>
                <td class="px-4 py-3">
                    <div class="font-medium text-slate-800 max-w-[180px] truncate">${escHtml(r.Title||'-')}</div>
                    ${r.Department ? `<div class="text-xs text-slate-400">${escHtml(r.Department)}</div>` : ''}
                </td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style="background:${tm.bg};color:${tm.text}">
                        <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:${TYPE_META[r.ChangeType]?.dot||tm.text}"></span>
                        ${escHtml(r.ChangeType||'-')}
                    </span>
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${escHtml(r.ResponsiblePerson||'-')}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style="background:${sm.bg};color:${sm.text}">
                        <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:${sm.text}"></span>
                        ${sm.label}
                    </span>
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${closeDate}</td>
                <td class="px-4 py-3 text-right">
                    <div class="flex items-center gap-1 justify-end">
                        <button class="btn-notice-view px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" data-id="${r.id}">ดู</button>
                        ${canClose ? `<button class="btn-notice-close px-2 py-1 rounded-lg text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors" data-id="${r.id}" data-no="${escHtml(r.NoticeNo)}">ปิด</button>` : ''}
                        ${_isAdmin ? `
                        <button class="btn-notice-edit px-2 py-1 rounded-lg text-xs font-semibold text-indigo-500 hover:bg-indigo-50 transition-colors" data-id="${r.id}">แก้ไข</button>
                        <button class="btn-notice-delete p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all" data-id="${r.id}" data-no="${escHtml(r.NoticeNo)}" title="ลบ">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500 text-sm">${escHtml(err.message)}</td></tr>`;
    }
}

function _exportNoticesToExcel() {
    if (!_lastNotices.length) { showToast('ไม่มีข้อมูลสำหรับ Export', 'warning'); return; }
    if (typeof XLSX === 'undefined') { showToast('ไม่พบ SheetJS library', 'error'); return; }
    const rows = _lastNotices.map(r => ({
        'Notice No':       r.NoticeNo || '',
        'วันที่ขอเปลี่ยน': r.RequestDate ? r.RequestDate.split('T')[0] : '',
        'หัวข้อ':          r.Title || '',
        'Change Type':     r.ChangeType || '',
        'แผนก':            r.Department || '',
        'ผู้รับผิดชอบ':     r.ResponsiblePerson || '',
        'สถานะ':           r.Status || '',
        'วันที่ปิด':        r.ClosedDate ? r.ClosedDate.split('T')[0] : '',
        'สร้างโดย':        r.CreatedBy || '',
        'ความคิดเห็นปิด':  r.ClosingComment || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Change Notices');
    XLSX.writeFile(wb, `4M_Change_Notices_${_noticeFilter.year}.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Notice Forms
// ─────────────────────────────────────────────────────────────────────────────
function showNoticeForm(existing = null) {
    const r     = normalizeApiObject(existing);
    const today = new Date().toISOString().split('T')[0];
    const html  = `
        <form id="notice-form" class="space-y-4" enctype="multipart/form-data">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">Notice No <span class="text-red-500">*</span></label>
                    <input type="text" name="NoticeNo" class="form-input w-full" required
                           value="${escHtml(r?.NoticeNo||'')}" placeholder="เช่น 4M-2025-001" ${existing?'readonly':''}>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่ขอเปลี่ยน <span class="text-red-500">*</span></label>
                    <input type="date" name="RequestDate" class="form-input w-full" required
                           value="${r?.RequestDate ? r.RequestDate.split('T')[0] : today}">
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หัวข้อ <span class="text-red-500">*</span></label>
                <input type="text" name="Title" class="form-input w-full" required
                       value="${escHtml(r?.Title||'')}" placeholder="ระบุหัวข้อการเปลี่ยนแปลง">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียด</label>
                <textarea name="Description" rows="3" class="form-input w-full resize-none"
                          placeholder="รายละเอียดการเปลี่ยนแปลง...">${escHtml(r?.Description||'')}</textarea>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">Change Type <span class="text-red-500">*</span></label>
                    <select name="ChangeType" class="form-input w-full" required>
                        ${CHANGE_TYPES.map(t => `<option value="${t}" ${r?.ChangeType===t?'selected':''}>${t}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก</label>
                    <input type="text" name="Department" class="form-input w-full" value="${escHtml(r?.Department||'')}" placeholder="แผนก">
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้รับผิดชอบ</label>
                <input type="text" name="ResponsiblePerson" class="form-input w-full"
                       value="${escHtml(r?.ResponsiblePerson||'')}" placeholder="ชื่อผู้รับผิดชอบ">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ไฟล์แนบ</label>
                <input type="file" name="attachment" class="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all"
                       accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp">
                ${r?.AttachmentUrl ? `<p class="text-xs text-indigo-600 mt-1">ไฟล์ปัจจุบัน: <a href="${r.AttachmentUrl}" target="_blank" class="underline">ดูไฟล์เดิม</a></p>` : ''}
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4" onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
                <button type="submit" id="notice-save-btn" class="btn btn-primary px-5">บันทึก</button>
            </div>
        </form>`;

    openModal(existing ? 'แก้ไข Change Notice' : 'สร้าง Change Notice', html, 'max-w-xl');

    document.getElementById('notice-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('notice-save-btn');
        btn.disabled = true; btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>กำลังบันทึก...`;
        try {
            showLoading('กำลังบันทึก...');
            const fd = new FormData(e.target);
            if (existing) { await API.put(`/fourm/notices/${r.id}`, fd); }
            else          { await API.post('/fourm/notices', fd); }
            closeModal();
            showToast(existing ? 'อัปเดต Change Notice สำเร็จ' : 'สร้าง Change Notice สำเร็จ', 'success');
            await fetchAndRenderNotices();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; btn.textContent = 'บันทึก'; }
    });
}

async function showNoticeDetail(id) {
    try {
        showLoading('กำลังโหลด...');
        const res = await API.get(`/fourm/notices/${id}`);
        const r   = normalizeApiObject(res?.data ?? res);
        hideLoading();

        const isImage = u => u && /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
        const fmtDate = d => d ? new Date(d).toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' }) : '-';
        const tm = TYPE_META[r.ChangeType] || { bg:'#f8fafc', text:'#64748b', dot:'#94a3b8' };
        const sm = STATUS_META[r.Status]   || { bg:'#f1f5f9', text:'#64748b', label: r.Status };

        const html = `
            <div class="space-y-4 text-sm">
                <div class="flex flex-wrap gap-2">
                    <span class="font-mono text-xs font-semibold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">${escHtml(r.NoticeNo)}</span>
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style="background:${tm.bg};color:${tm.text}">
                        <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:${TYPE_META[r.ChangeType]?.dot||tm.text}"></span>
                        ${escHtml(r.ChangeType)}
                    </span>
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style="background:${sm.bg};color:${sm.text}">
                        <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:${sm.text}"></span>
                        ${sm.label}
                    </span>
                </div>

                <h3 class="text-base font-bold text-slate-800">${escHtml(r.Title)}</h3>

                <div class="grid grid-cols-2 gap-3 text-xs">
                    ${infoBlock('วันที่ขอ', fmtDate(r.RequestDate))}
                    ${infoBlock('ผู้รับผิดชอบ', escHtml(r.ResponsiblePerson||'-'))}
                    ${infoBlock('แผนก', escHtml(r.Department||'-'))}
                    ${infoBlock('สร้างโดย', escHtml(r.CreatedBy||'-'))}
                </div>

                ${r.Description ? `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">รายละเอียด</p>
                    <p class="text-slate-700 leading-relaxed whitespace-pre-wrap">${escHtml(r.Description)}</p>
                </div>` : ''}

                ${r.ClosingComment ? `
                <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">ผลการดำเนินการ</p>
                    <p class="text-slate-700 leading-relaxed">${escHtml(r.ClosingComment)}</p>
                    <p class="text-xs text-slate-400 mt-1.5">ปิดโดย ${escHtml(r.ClosedBy||'-')} · ${fmtDate(r.ClosedDate)}</p>
                </div>` : ''}

                ${(r.AttachmentUrl||r.ClosingDocUrl) ? `
                <div>
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">ไฟล์แนบ</p>
                    <div class="flex flex-wrap gap-2">
                        ${r.AttachmentUrl  ? buildFileChip(r.AttachmentUrl,  'ไฟล์แนบ (Notice)',    isImage(r.AttachmentUrl))  : ''}
                        ${r.ClosingDocUrl  ? buildFileChip(r.ClosingDocUrl,  'เอกสารปิด Notice',    isImage(r.ClosingDocUrl))  : ''}
                    </div>
                </div>` : ''}
            </div>`;

        openModal('รายละเอียด Change Notice', html, 'max-w-xl');
    } catch (err) { hideLoading(); showError(err); }
}

function showCloseForm(id, noticeNo) {
    const today = new Date().toISOString().split('T')[0];
    const html  = `
        <form id="close-form" class="space-y-4">
            <div class="flex gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
                <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <span>การปิด Notice <strong>${escHtml(noticeNo)}</strong> ไม่สามารถย้อนกลับได้</span>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่ปิด <span class="text-red-500">*</span></label>
                <input type="date" name="ClosedDate" class="form-input w-full" value="${today}" required>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ความคิดเห็น / สรุปผล <span class="text-red-500">*</span></label>
                <textarea name="ClosingComment" rows="3" class="form-input w-full resize-none" required
                          placeholder="ระบุสรุปผลการดำเนินการ..."></textarea>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เอกสารประกอบการปิด (ถ้ามี)</label>
                <input type="file" name="closingDoc" class="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all"
                       accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp">
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4" onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
                <button type="submit" id="close-save-btn"
                        class="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white"
                        style="background:linear-gradient(135deg,#059669,#0d9488)">ปิด Change Notice</button>
            </div>
        </form>`;

    openModal(`ปิด Change Notice — ${escHtml(noticeNo)}`, html, 'max-w-lg');

    document.getElementById('close-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('close-save-btn');
        btn.disabled = true; btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>กำลังปิด...`;
        try {
            showLoading('กำลังปิด Change Notice...');
            const fd = new FormData(e.target);
            await API.post(`/fourm/notices/${id}/close`, fd);
            closeModal();
            showToast('ปิด Change Notice สำเร็จ', 'success');
            await fetchAndRenderNotices();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; btn.textContent = 'ปิด Change Notice'; }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3: Man Record
// ─────────────────────────────────────────────────────────────────────────────
async function renderMan(container) {
    const yearOpts = [0,1,2].map(i => { const y = new Date().getFullYear()-i; return `<option value="${y}" ${y===_manFilter.year?'selected':''}>${y}</option>`; }).join('');
    container.innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-wrap gap-3 items-center justify-between">
                <div class="flex items-center gap-2">
                    <select id="man-filter-year" class="form-input py-1.5 text-sm w-24">${yearOpts}</select>
                    <div class="relative w-64">
                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input id="man-search" type="text" placeholder="ค้นหาแผนก..."
                               value="${escHtml(_manFilter.q)}" class="form-input w-full pl-9 text-sm py-2">
                    </div>
                </div>
                ${_isAdmin ? `
                <button id="btn-add-man"
                        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                        style="background:linear-gradient(135deg,#6366f1,#0284c7);box-shadow:0 2px 8px rgba(99,102,241,0.3)">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                    บันทึกผลสอบ
                </button>` : ''}
            </div>

            <div class="card overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">แผนก</th>
                                <th class="px-4 py-3 text-center">ผู้เข้าสอบ</th>
                                <th class="px-4 py-3 text-center">ผ่าน</th>
                                <th class="px-4 py-3 text-center">ไม่ผ่าน</th>
                                <th class="px-4 py-3 text-center">Pass Rate</th>
                                <th class="px-4 py-3">ผลสอบ</th>
                                <th class="px-4 py-3">วันที่สอบ</th>
                                ${_isAdmin ? '<th class="px-4 py-3"></th>' : ''}
                            </tr>
                        </thead>
                        <tbody id="man-tbody" class="divide-y divide-slate-100">${loadingRow(_isAdmin?8:7)}</tbody>
                    </table>
                </div>
            </div>
        </div>`;

    await fetchAndRenderMan();
}

async function fetchAndRenderMan() {
    const tbody = document.getElementById('man-tbody');
    if (!tbody) return;
    try {
        const p = new URLSearchParams();
        if (_manFilter.q.trim()) p.set('q', _manFilter.q.trim());
        p.set('year', _manFilter.year);
        const res  = await API.get(`/fourm/man-records?${p}`);
        const rows = normalizeApiArray(res?.data ?? res);

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="${_isAdmin?8:7}" class="text-center py-10 text-slate-400 text-sm">ยังไม่มีผลสอบในปี ${_manFilter.year}</td></tr>`;
            return;
        }

        const MAN_STATUS_BADGE = { Pass:'bg-emerald-100 text-emerald-700', Fail:'bg-red-100 text-red-700', Pending:'bg-amber-100 text-amber-700' };

        tbody.innerHTML = rows.map(r => {
            const rate = r.TotalAttendance > 0 ? Math.round((r.Pass / r.TotalAttendance) * 100) : 0;
            const date = r.ExamDate ? new Date(r.ExamDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            const barColor = rate>=80 ? '#059669' : rate>=60 ? '#d97706' : '#ef4444';
            return `
            <tr class="hover:bg-slate-50 transition-colors group">
                <td class="px-4 py-3 font-medium text-slate-800">${escHtml(r.Department||'-')}</td>
                <td class="px-4 py-3 text-center text-slate-700">${r.TotalAttendance||0}</td>
                <td class="px-4 py-3 text-center font-semibold" style="color:#059669">${r.Pass||0}</td>
                <td class="px-4 py-3 text-center font-semibold" style="color:#ef4444">${r.Fail||0}</td>
                <td class="px-4 py-3 text-center">
                    <div class="flex items-center gap-2">
                        <div class="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div class="h-full rounded-full" style="width:${rate}%;background:${barColor}"></div>
                        </div>
                        <span class="text-xs font-bold w-8" style="color:${barColor}">${rate}%</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${MAN_STATUS_BADGE[r.Status]||'bg-slate-100 text-slate-500'}">${r.Status||'-'}</span>
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${date}</td>
                ${_isAdmin ? `
                <td class="px-4 py-3 text-right">
                    <div class="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="btn-man-edit p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" data-id="${r.id}" title="แก้ไข">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                        <button class="btn-man-delete p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" data-id="${r.id}" data-dept="${escHtml(r.Department)}" title="ลบ">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                </td>` : ''}
            </tr>`;
        }).join('');
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="${_isAdmin?8:7}" class="text-center py-6 text-red-500 text-sm">${escHtml(err.message)}</td></tr>`;
    }
}

function showManForm(existing = null) {
    const r = normalizeApiObject(existing);
    const html = `
        <form id="man-form" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div class="col-span-2">
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก <span class="text-red-500">*</span></label>
                    <input type="text" name="Department" class="form-input w-full" required
                           value="${escHtml(r?.Department||'')}" placeholder="ชื่อแผนก">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่สอบ</label>
                    <input type="date" name="ExamDate" class="form-input w-full"
                           value="${r?.ExamDate ? r.ExamDate.split('T')[0] : ''}">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผลสอบ</label>
                    <select name="Status" class="form-input w-full">
                        ${MAN_STATUSES.map(s => `<option value="${s}" ${r?.Status===s?'selected':''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้เข้าสอบทั้งหมด</label>
                    <input type="number" name="TotalAttendance" min="0" class="form-input w-full" value="${r?.TotalAttendance||0}">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผ่าน</label>
                    <input type="number" name="Pass" min="0" class="form-input w-full" value="${r?.Pass||0}">
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
                <textarea name="Notes" rows="2" class="form-input w-full resize-none">${escHtml(r?.Notes||'')}</textarea>
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4" onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
                <button type="submit" id="man-save-btn" class="btn btn-primary px-5">บันทึก</button>
            </div>
        </form>`;
    openModal(existing ? 'แก้ไขผลสอบ' : 'บันทึกผลสอบ', html, 'max-w-lg');

    document.getElementById('man-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('man-save-btn');
        btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
        try {
            showLoading('กำลังบันทึก...');
            const body = Object.fromEntries(new FormData(e.target).entries());
            if (existing) { await API.put(`/fourm/man-records/${r.id}`, body); }
            else          { await API.post('/fourm/man-records', body); }
            closeModal();
            showToast('บันทึกผลสอบสำเร็จ', 'success');
            await fetchAndRenderMan();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; btn.textContent = 'บันทึก'; }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 4: External Systems + Module Forms
// ─────────────────────────────────────────────────────────────────────────────
async function renderSystems(container) {
    container.innerHTML = `
        <div class="space-y-6">
            <div>
                <h3 class="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                    ระบบภายนอก
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    ${EXTERNAL_SYSTEMS.map(s => `
                    <div class="card overflow-hidden hover:shadow-lg transition-all group">
                        <div class="h-1.5 w-full" style="background:linear-gradient(90deg,${s.color},${s.color}cc)"></div>
                        <div class="p-5 flex flex-col gap-3">
                            <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                                 style="background:${s.light};color:${s.color}">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">${s.icon}</svg>
                            </div>
                            <div>
                                <h3 class="font-bold text-slate-800 leading-tight mb-1">${s.title}</h3>
                                <p class="text-xs text-slate-500 leading-relaxed mb-4">${s.desc}</p>
                                <a href="${s.url}" target="_blank" rel="noopener noreferrer"
                                   class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                                   style="background:linear-gradient(135deg,${s.color},${s.color}cc);box-shadow:0 2px 8px ${s.color}40">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                                    </svg>
                                    เปิดระบบ
                                </a>
                            </div>
                        </div>
                    </div>`).join('')}
                </div>
            </div>

            <div>
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                        แบบฟอร์มที่เกี่ยวข้อง
                    </h3>
                    ${_isAdmin ? `
                    <button id="btn-add-fourm-form"
                            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                            style="background:linear-gradient(135deg,#6366f1,#0284c7)">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        อัปโหลดแบบฟอร์ม
                    </button>` : ''}
                </div>
                <div id="fourm-forms-section">
                    <div class="card p-6 flex justify-center">
                        <div class="animate-spin h-5 w-5 border-2 border-indigo-400 border-t-transparent rounded-full"></div>
                    </div>
                </div>
            </div>
        </div>`;

    _loadFourmForms(_isAdmin).then(() => {
        _renderFourmFormsSection();
        document.getElementById('btn-add-fourm-form')?.addEventListener('click', _openFourmFormUploadModal);
        document.getElementById('fourm-forms-section')?.addEventListener('click', async (e) => {
            const toggleBtn = e.target.closest('.btn-fourm-form-toggle');
            if (toggleBtn) {
                const { id, active, title, version, sortOrder, description } = toggleBtn.dataset;
                try {
                    await API.put(`/module-forms/${id}`, { title, description, version, sortOrder: parseInt(sortOrder)||99, isActive: active === '1' ? 0 : 1 });
                    showToast('อัปเดตสำเร็จ', 'success');
                    await _loadFourmForms(true); _renderFourmFormsSection();
                } catch (err) { showError(err); }
                return;
            }
            const delBtn = e.target.closest('.btn-fourm-form-delete');
            if (delBtn) {
                const ok = await showConfirmationModal('ยืนยันการลบ', `ลบแบบฟอร์ม "${delBtn.dataset.title}" ใช่หรือไม่?`);
                if (ok) {
                    try {
                        await API.delete(`/module-forms/${delBtn.dataset.id}`);
                        showToast('ลบสำเร็จ', 'success');
                        await _loadFourmForms(true); _renderFourmFormsSection();
                    } catch (err) { showError(err); }
                }
                return;
            }
        });
    });
}

async function _loadFourmForms(adminAll = false) {
    try {
        const res = await API.get(`/module-forms?module=fourm${adminAll ? '&all=1' : ''}`);
        _fourmForms = normalizeApiArray(res?.data ?? res) || [];
    } catch { _fourmForms = []; }
}

function _renderFourmFormsSection() {
    const el = document.getElementById('fourm-forms-section');
    if (!el) return;

    if (_isAdmin) {
        if (!_fourmForms.length) {
            el.innerHTML = `<div class="card p-6 text-center text-slate-400 text-sm">ยังไม่มีแบบฟอร์ม — คลิก "อัปโหลดแบบฟอร์ม" เพื่อเพิ่ม</div>`;
            return;
        }
        el.innerHTML = `
        <div class="card overflow-hidden">
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th class="px-4 py-3 text-left">ชื่อแบบฟอร์ม</th>
                        <th class="px-4 py-3 text-left">เวอร์ชัน</th>
                        <th class="px-4 py-3 text-center">ลำดับ</th>
                        <th class="px-4 py-3 text-center">สถานะ</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody id="fourm-forms-tbody" class="divide-y divide-slate-100">
                    ${_fourmForms.map(f => `
                    <tr class="hover:bg-slate-50 group ${!f.IsActive ? 'opacity-50' : ''}">
                        <td class="px-4 py-3">
                            <a href="${f.FileUrl}" target="_blank" rel="noopener noreferrer"
                               class="font-medium text-indigo-700 hover:underline">${escHtml(f.Title)}</a>
                            ${f.Description ? `<p class="text-xs text-slate-400 mt-0.5 truncate max-w-xs">${escHtml(f.Description)}</p>` : ''}
                        </td>
                        <td class="px-4 py-3 text-slate-600 text-xs">${escHtml(f.Version||'-')}</td>
                        <td class="px-4 py-3 text-center text-slate-600">${f.SortOrder}</td>
                        <td class="px-4 py-3 text-center">
                            <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${f.IsActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                                ${f.IsActive ? 'แสดง' : 'ซ่อน'}
                            </span>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <div class="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                <button class="btn-fourm-form-toggle px-2 py-1 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors text-slate-500"
                                        data-id="${f.id}" data-active="${f.IsActive}" data-title="${escHtml(f.Title)}"
                                        data-version="${escHtml(f.Version||'')}" data-sort-order="${f.SortOrder}"
                                        data-description="${escHtml(f.Description||'')}">
                                    ${f.IsActive ? 'ซ่อน' : 'แสดง'}
                                </button>
                                <button class="btn-fourm-form-delete p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        data-id="${f.id}" data-title="${escHtml(f.Title)}" title="ลบ">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                    </svg>
                                </button>
                            </div>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    } else {
        const active = _fourmForms.filter(f => f.IsActive);
        if (!active.length) {
            el.innerHTML = `<div class="card p-6 text-center text-slate-400 text-sm">ยังไม่มีแบบฟอร์มที่พร้อมใช้งาน</div>`;
            return;
        }
        el.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${active.map(f => {
                const ext = (f.FileUrl || '').split('?')[0].split('.').pop().toUpperCase();
                return `
                <div class="card p-4 flex flex-col gap-2.5 hover:shadow-md transition-shadow">
                    <div class="flex items-start gap-3">
                        <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold" style="background:#eef2ff;color:#4338ca">${escHtml(ext||'FILE')}</div>
                        <div class="min-w-0">
                            <p class="font-semibold text-slate-800 text-sm leading-snug">${escHtml(f.Title)}</p>
                            ${f.Version ? `<p class="text-xs text-slate-400">${escHtml(f.Version)}</p>` : ''}
                        </div>
                    </div>
                    ${f.Description ? `<p class="text-xs text-slate-500 leading-relaxed">${escHtml(f.Description)}</p>` : ''}
                    <div class="flex gap-2 mt-auto pt-1">
                        <a href="${f.FileUrl}" target="_blank" rel="noopener noreferrer"
                           class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                            ดูไฟล์
                        </a>
                        <a href="${f.FileUrl}" download
                           class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                            ดาวน์โหลด
                        </a>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    }
}

function _openFourmFormUploadModal() {
    const html = `
        <form id="fourm-form-upload-form" class="space-y-4" enctype="multipart/form-data">
            <input type="hidden" name="module" value="fourm">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อแบบฟอร์ม <span class="text-red-500">*</span></label>
                <input type="text" name="title" class="form-input w-full" required placeholder="เช่น แบบฟอร์ม Change Notice 4M">
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">เวอร์ชัน</label>
                    <input type="text" name="version" class="form-input w-full" placeholder="เช่น v1.0">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ลำดับการแสดง</label>
                    <input type="number" name="sortOrder" class="form-input w-full" value="99" min="1">
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">คำอธิบาย</label>
                <textarea name="description" rows="2" class="form-input w-full resize-none" placeholder="รายละเอียดแบบฟอร์ม (ถ้ามี)"></textarea>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ไฟล์แบบฟอร์ม <span class="text-red-500">*</span></label>
                <input type="file" name="formFile" class="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all"
                       accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" required>
                <p class="text-xs text-slate-400 mt-1">รองรับ PDF, Word, Excel, รูปภาพ — สูงสุด 20 MB</p>
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4" onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
                <button type="submit" id="fourm-form-upload-btn"
                        class="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white"
                        style="background:linear-gradient(135deg,#6366f1,#0284c7)">อัปโหลด</button>
            </div>
        </form>`;

    openModal('อัปโหลดแบบฟอร์ม 4M Change', html, 'max-w-lg');

    document.getElementById('fourm-form-upload-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('fourm-form-upload-btn');
        btn.disabled = true; btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>กำลังอัปโหลด...`;
        try {
            showLoading('กำลังอัปโหลด...');
            await API.post('/module-forms', new FormData(e.target));
            closeModal();
            showToast('อัปโหลดแบบฟอร์มสำเร็จ', 'success');
            await _loadFourmForms(true); _renderFourmFormsSection();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; btn.textContent = 'อัปโหลด'; }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Listeners
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', async (e) => {
        if (!e.target.closest('#fourm-page')) return;

        // Tab buttons
        const tabBtn = e.target.closest('.fourm-tab');
        if (tabBtn) { await switchTab(tabBtn.dataset.tab); return; }

        // KPI card navigation → notices tab
        const kpiNav = e.target.closest('.fourm-kpi-nav');
        if (kpiNav) {
            const filterStatus  = kpiNav.dataset.filterStatus;
            const filterOverdue = kpiNav.dataset.filterOverdue;
            if (filterOverdue === '1') {
                _noticeFilter.overdue = true;
                _noticeFilter.status  = 'overdue';
            } else {
                _noticeFilter.overdue = false;
                _noticeFilter.status  = filterStatus || 'all';
            }
            _noticeFilter.year = _statsYear;
            await switchTab('notices');
            return;
        }

        // Excel export
        if (e.target.closest('#btn-export-notices')) { _exportNoticesToExcel(); return; }

        // Man record
        if (e.target.closest('#btn-add-man')) { showManForm(); return; }
        const manEdit = e.target.closest('.btn-man-edit');
        if (manEdit) {
            showLoading('กำลังโหลด...');
            try {
                const res = await API.get(`/fourm/man-records?year=${_manFilter.year}`);
                const all = normalizeApiArray(res?.data ?? res);
                const rec = all.find(r => r.id === manEdit.dataset.id);
                hideLoading();
                if (rec) showManForm(rec);
            } catch (err) { hideLoading(); showError(err); }
            return;
        }
        const manDel = e.target.closest('.btn-man-delete');
        if (manDel) {
            const ok = await showConfirmationModal('ยืนยันการลบ', `ลบผลสอบของแผนก "${manDel.dataset.dept}" ใช่หรือไม่?`);
            if (ok) {
                showLoading('กำลังลบ...');
                try { await API.delete(`/fourm/man-records/${manDel.dataset.id}`); showToast('ลบสำเร็จ','success'); await fetchAndRenderMan(); }
                catch (err) { showError(err); } finally { hideLoading(); }
            }
            return;
        }

        // Change Notice
        if (e.target.closest('#btn-add-notice')) { showNoticeForm(); return; }
        if (e.target.closest('.btn-notice-view'))  { await showNoticeDetail(e.target.closest('.btn-notice-view').dataset.id); return; }
        const noticeEdit = e.target.closest('.btn-notice-edit');
        if (noticeEdit) {
            showLoading('กำลังโหลด...');
            try { const res = await API.get(`/fourm/notices/${noticeEdit.dataset.id}`); hideLoading(); showNoticeForm(res?.data??res); }
            catch (err) { hideLoading(); showError(err); }
            return;
        }
        const noticeClose = e.target.closest('.btn-notice-close');
        if (noticeClose) { showCloseForm(noticeClose.dataset.id, noticeClose.dataset.no); return; }
        const noticeDel = e.target.closest('.btn-notice-delete');
        if (noticeDel) {
            const ok = await showConfirmationModal('ยืนยันการลบ', `ลบ Change Notice "${noticeDel.dataset.no}" ใช่หรือไม่?`);
            if (ok) {
                showLoading('กำลังลบ...');
                try { await API.delete(`/fourm/notices/${noticeDel.dataset.id}`); showToast('ลบสำเร็จ','success'); await fetchAndRenderNotices(); }
                catch (err) { showError(err); } finally { hideLoading(); }
            }
            return;
        }

        // File preview
        const prevBtn = e.target.closest('.btn-file-preview');
        if (prevBtn) { showDocumentModal(prevBtn.dataset.url, prevBtn.dataset.title); return; }
    });

    document.addEventListener('change', async (e) => {
        if (!e.target.closest('#fourm-page')) return;

        if (e.target.id === 'fourm-stats-year') {
            _statsYear = parseInt(e.target.value);
            await _renderDashInner();
            return;
        }
        if (e.target.id === 'notice-filter-year') {
            _noticeFilter.year = parseInt(e.target.value);
            await fetchAndRenderNotices();
            return;
        }
        if (e.target.id === 'notice-filter-status') {
            if (e.target.value === 'overdue') {
                _noticeFilter.overdue = true;
                _noticeFilter.status  = 'overdue';
            } else {
                _noticeFilter.overdue = false;
                _noticeFilter.status  = e.target.value;
            }
            await fetchAndRenderNotices();
            return;
        }
        if (e.target.id === 'notice-filter-type') { _noticeFilter.type = e.target.value; await fetchAndRenderNotices(); return; }
        if (e.target.id === 'notice-filter-dept') { _noticeFilter.dept = e.target.value; await fetchAndRenderNotices(); return; }
        if (e.target.id === 'man-filter-year')    { _manFilter.year    = parseInt(e.target.value); await fetchAndRenderMan();     return; }
    });

    document.addEventListener('input', debounce(async (e) => {
        if (!e.target.closest('#fourm-page')) return;
        if (e.target.id === 'notice-search') { _noticeFilter.q = e.target.value; await fetchAndRenderNotices(); return; }
        if (e.target.id === 'man-search')    { _manFilter.q    = e.target.value; await fetchAndRenderMan();     return; }
    }, 350));
}

// ─────────────────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────────────────
function infoBlock(label, value) {
    return `<div><p class="text-slate-400 font-medium mb-0.5">${label}</p><p class="font-semibold text-slate-700">${value}</p></div>`;
}

function buildFileChip(url, label, isImage) {
    if (isImage) {
        return `<button class="btn-file-preview group relative overflow-hidden rounded-xl border-2 border-slate-200 hover:border-indigo-400 transition-all w-20 h-20"
                         data-url="${url}" data-title="${label}">
            <img src="${url}" alt="${label}" class="w-full h-full object-cover">
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all"></div>
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

function loadingRow(cols) {
    return `<tr><td colspan="${cols}" class="text-center py-8 text-slate-400">
        <div class="animate-spin inline-block h-6 w-6 border-4 border-indigo-400 border-t-transparent rounded-full mb-2"></div>
        <div class="text-sm">กำลังโหลด...</div>
    </td></tr>`;
}

function debounce(fn, delay) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
}
