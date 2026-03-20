// public/js/pages/ky.js
// KY Ability (Kiken Yochi - Hazard Prediction)
import { API } from '../api.js';
import {
    hideLoading, showError, showLoading,
    openModal, closeModal, showToast, showConfirmationModal, showDocumentModal
} from '../ui.js';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';

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
let _participants  = [];   // for form

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
            <div class="flex justify-end">
                <select id="ky-stats-year" class="form-input py-1.5 text-sm w-32">
                    ${[0,1,2].map(i => {
                        const y = new Date().getFullYear() - i;
                        return `<option value="${y}" ${y === _statsYear ? 'selected':''}>${y}</option>`;
                    }).join('')}
                </select>
            </div>

            <!-- KPI -->
            <div id="ky-kpi-row" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                ${Array(4).fill(0).map(() =>
                    `<div class="card p-4 animate-pulse"><div class="h-8 bg-slate-100 rounded mb-2"></div><div class="h-4 bg-slate-50 rounded w-2/3"></div></div>`
                ).join('')}
            </div>

            <!-- Completion bar -->
            <div class="card p-5">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold text-slate-600">Department Submission Tracker (เดือนนี้)</h3>
                    <span id="ky-completion-badge" class="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">--</span>
                </div>
                <div id="ky-pending-list" class="text-xs text-slate-400">กำลังโหลด...</div>
            </div>

            <!-- Charts -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="lg:col-span-2 card p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">แนวโน้มกิจกรรม KY รายเดือน</h3>
                    <div class="relative" style="height:220px"><canvas id="ky-chart-line"></canvas></div>
                </div>
                <div class="card p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">ประเภทความเสี่ยง</h3>
                    <div class="relative" style="height:220px"><canvas id="ky-chart-doughnut"></canvas></div>
                </div>
            </div>

            <div class="card p-5">
                <h3 class="text-sm font-bold text-slate-600 mb-4">กิจกรรม KY แยกตามแผนก</h3>
                <div class="relative" style="height:200px"><canvas id="ky-chart-bar"></canvas></div>
            </div>
        </div>`;

    try {
        const res  = await API.get(`/ky/stats?year=${_statsYear}`);
        const data = res?.data || {};
        renderKPI(data.kpi || {});
        renderCompletionTracker(data.kpi || {}, data.pendingDepts || []);
        renderLineChart(data.monthly || []);
        renderDoughnutChart(data.riskCat || []);
        renderBarChart(data.byDept || []);
    } catch (err) {
        console.error('KY stats error:', err);
    }
}

function renderKPI(kpi) {
    const cards = [
        { label: 'กิจกรรม KY ทั้งหมด',    value: kpi.total || 0,          color: '#6366f1', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347A3.001 3.001 0 0112 21a3.001 3.001 0 01-2.789-4.1l-.347-.347z"/>` },
        { label: 'แผนกที่ส่งแล้ว',          value: kpi.deptSubmitted || 0, color: '#10b981', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
        { label: 'แผนกที่ยังไม่ส่ง',         value: kpi.pendingDepts || 0,  color: '#f97316', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
        { label: 'Completion Rate',           value: `${kpi.completionRate || 0}%`, color: '#0284c7', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>` },
    ];
    const row = document.getElementById('ky-kpi-row');
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

    // Check if dept already submitted this month
    let alreadySubmitted = false;
    let existingId = null;
    if (user.department) {
        try {
            const chk = await API.get(`/ky/check?dept=${encodeURIComponent(user.department)}&month=${curMonth}&year=${curYear}`);
            alreadySubmitted = chk?.exists || false;
            existingId = chk?.data?.id || null;
        } catch (_) {}
    }

    container.innerHTML = `
        <div class="max-w-2xl mx-auto">
            <div class="card overflow-hidden">
                <div class="h-1.5 w-full" style="background:linear-gradient(90deg,#6366f1,#8b5cf6)"></div>
                <div class="p-6 space-y-5">

                    ${alreadySubmitted ? `
                    <div class="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                        <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        <div>
                            <p class="font-semibold">แผนก "${user.department}" ได้ส่งกิจกรรม KY สำหรับเดือนนี้แล้ว</p>
                            <p class="text-xs mt-0.5 text-amber-600">(1 แผนก / 1 เรื่อง / 1 เดือน) — ดูรายละเอียดได้ที่แท็บ "ประวัติกิจกรรม"</p>
                        </div>
                    </div>` : `
                    <div class="flex gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700">
                        <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <span>ส่งกิจกรรม KY ประจำเดือน — 1 แผนก / 1 เรื่อง / 1 เดือน</span>
                    </div>`}

                    <form id="ky-form" class="space-y-4" ${alreadySubmitted ? 'style="opacity:0.6; pointer-events:none;"' : ''}>

                        <!-- Reporter (read-only) -->
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
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่กิจกรรม <span class="text-red-500">*</span></label>
                                <input type="date" name="ActivityDate" class="form-input w-full" value="${today}" max="${today}" required>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อทีม</label>
                                <input type="text" name="TeamName" class="form-input w-full" placeholder="เช่น ทีม A / Line 1">
                            </div>
                        </div>

                        <!-- Participants -->
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้เข้าร่วม</label>
                            <div class="flex gap-2 mb-2">
                                <input type="text" id="ky-participant-input" class="form-input flex-1 text-sm" placeholder="ชื่อผู้เข้าร่วม แล้วกด + หรือ Enter">
                                <button type="button" id="ky-add-participant"
                                        class="px-3 py-2 rounded-lg text-white text-sm font-semibold transition-all"
                                        style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">+</button>
                            </div>
                            <div id="ky-participants-tags" class="flex flex-wrap gap-1.5 min-h-[32px]">
                                <span class="text-xs text-slate-400 italic" id="ky-no-participants">ยังไม่มีผู้เข้าร่วม</span>
                            </div>
                            <input type="hidden" name="Participants" id="ky-participants-hidden">
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">KYT Keyword</label>
                                <input type="text" name="KYTKeyword" class="form-input w-full" placeholder="เช่น ลื่นหกล้ม / หนีบมือ / ไฟฟ้ารั่ว">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทความเสี่ยง</label>
                                <select name="RiskCategory" class="form-input w-full">
                                    ${RISK_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดอันตรายที่คาดการณ์ <span class="text-red-500">*</span></label>
                            <textarea name="HazardDescription" rows="3" required
                                      class="form-input w-full resize-none"
                                      placeholder="อธิบายอันตรายที่อาจเกิดขึ้นในงานที่ทำ..."></textarea>
                        </div>

                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">มาตรการตอบโต้ (Countermeasure)</label>
                            <textarea name="Countermeasure" rows="2"
                                      class="form-input w-full resize-none"
                                      placeholder="วิธีป้องกันหรือลดความเสี่ยงที่กำหนด..."></textarea>
                        </div>

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
}

function setupFormListeners() {
    // Attachment preview
    document.getElementById('ky-attachment')?.addEventListener('change', (e) => {
        const n = e.target.files[0]?.name || '';
        document.getElementById('ky-attachment-name').textContent = n ? n : '';
    });
    document.getElementById('ky-video')?.addEventListener('change', (e) => {
        const n = e.target.files[0]?.name || '';
        document.getElementById('ky-video-name').textContent = n ? n : '';
    });

    // Add participant
    const addParticipant = () => {
        const input = document.getElementById('ky-participant-input');
        const name  = (input?.value || '').trim();
        if (!name) return;
        if (_participants.includes(name)) { input.value = ''; return; }
        _participants.push(name);
        updateParticipantTags();
        input.value = '';
    };

    document.getElementById('ky-add-participant')?.addEventListener('click', addParticipant);
    document.getElementById('ky-participant-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addParticipant(); }
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
            fd.set('Participants', JSON.stringify(_participants));
            await API.post('/ky', fd);
            showToast('ส่งกิจกรรม KY สำเร็จ', 'success');
            _participants = [];
            e.target.reset();
            document.getElementById('ky-attachment-name').textContent = '';
            document.getElementById('ky-video-name').textContent = '';
            updateParticipantTags();
        } catch (err) {
            showError(err);
        } finally {
            hideLoading();
            btn.disabled = false;
            btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> ส่งกิจกรรม KY`;
        }
    });
}

function updateParticipantTags() {
    const container = document.getElementById('ky-participants-tags');
    const noEl      = document.getElementById('ky-no-participants');
    const hidden    = document.getElementById('ky-participants-hidden');
    if (!container) return;

    if (!_participants.length) {
        container.innerHTML = `<span class="text-xs text-slate-400 italic" id="ky-no-participants">ยังไม่มีผู้เข้าร่วม</span>`;
        if (hidden) hidden.value = '[]';
        return;
    }

    if (hidden) hidden.value = JSON.stringify(_participants);
    container.innerHTML = _participants.map((p, i) => `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">
            ${p}
            <button type="button" data-idx="${i}"
                    class="ky-remove-participant text-indigo-400 hover:text-indigo-700 leading-none font-bold ml-0.5">×</button>
        </span>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: HISTORY
// ─────────────────────────────────────────────────────────────────────────────
async function renderHistory(container) {
    container.innerHTML = `
        <div class="space-y-4">
            <div class="card p-4 flex flex-wrap gap-3 items-center justify-between">
                <div class="flex flex-wrap gap-2">
                    <select id="ky-filter-status" class="form-input py-1.5 text-sm">
                        <option value="all" ${_filterStatus==='all'?'selected':''}>ทุกสถานะ</option>
                        ${STATUSES.map(s => `<option value="${s}" ${_filterStatus===s?'selected':''}>${STATUS_LABEL[s]||s}</option>`).join('')}
                    </select>
                </div>
                <div class="relative w-full sm:w-64">
                    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input id="ky-history-search" type="text" placeholder="ค้นหา..."
                           value="${_searchQ}" class="form-input w-full pl-9 text-sm py-2">
                </div>
            </div>

            <div class="card overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">วันที่</th>
                                <th class="px-4 py-3">แผนก / ทีม</th>
                                <th class="px-4 py-3">KYT Keyword</th>
                                <th class="px-4 py-3">ประเภท</th>
                                <th class="px-4 py-3">ผู้รายงาน</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3"></th>
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
        if (_searchQ.trim())         params.set('q', _searchQ.trim());
        const res     = await API.get(`/ky?${params}`);
        const records = normalizeApiArray(res?.data ?? res);

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
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_BADGE_COLOR[r.RiskCategory] || 'bg-slate-100 text-slate-500'}">
                        ${r.RiskCategory || '-'}
                    </span>
                </td>
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">${r.ReporterName || '-'}</td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">
                        ${STATUS_LABEL[r.Status] || r.Status}
                    </span>
                </td>
                <td class="px-4 py-3 text-right">
                    <button class="btn-ky-view px-3 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
                            data-id="${r.id}">ดูรายละเอียด</button>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-red-500 text-sm">${err.message}</td></tr>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: MANAGE (Admin)
// ─────────────────────────────────────────────────────────────────────────────
async function renderManage(container) {
    container.innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-wrap gap-2 items-center">
                <select id="ky-manage-status" class="form-input py-1.5 text-sm">
                    <option value="all">ทุกสถานะ</option>
                    ${STATUSES.map(s => `<option value="${s}">${STATUS_LABEL[s]||s}</option>`).join('')}
                </select>
            </div>
            <div class="card overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">วันที่</th>
                                <th class="px-4 py-3">แผนก / ทีม</th>
                                <th class="px-4 py-3">Hazard / Keyword</th>
                                <th class="px-4 py-3">ประเภท</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="ky-manage-tbody" class="divide-y divide-slate-100">
                            ${loadingRow(6)}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

    await fetchAndRenderManage('all');
}

async function fetchAndRenderManage(statusFilter) {
    const tbody = document.getElementById('ky-manage-tbody');
    if (!tbody) return;
    try {
        const params = new URLSearchParams();
        if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
        const res     = await API.get(`/ky?${params}`);
        const records = normalizeApiArray(res?.data ?? res);

        if (!records.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-slate-400 text-sm">ไม่พบกิจกรรม KY</td></tr>`;
            return;
        }

        tbody.innerHTML = records.map(r => {
            const date = r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">${date}</td>
                <td class="px-4 py-3">
                    <div class="font-medium text-slate-800">${r.Department}</div>
                    ${r.TeamName ? `<div class="text-xs text-slate-400">${r.TeamName}</div>` : ''}
                    <div class="text-xs text-slate-400">${r.ReporterName}</div>
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs">
                    <div class="max-w-[180px] truncate">${r.HazardDescription || '-'}</div>
                    ${r.KYTKeyword ? `<div class="mt-0.5 text-indigo-500"># ${r.KYTKeyword}</div>` : ''}
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_BADGE_COLOR[r.RiskCategory] || 'bg-slate-100 text-slate-500'}">
                        ${r.RiskCategory || '-'}
                    </span>
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">
                        ${STATUS_LABEL[r.Status] || r.Status}
                    </span>
                </td>
                <td class="px-4 py-3 text-right">
                    <div class="flex items-center gap-1 justify-end">
                        <button class="btn-ky-manage px-3 py-1 rounded-lg text-xs font-semibold text-white transition-all"
                                style="background:linear-gradient(135deg,#6366f1,#8b5cf6)"
                                data-id="${r.id}">จัดการ</button>
                        <button class="btn-ky-delete p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                data-id="${r.id}" data-name="${r.Department}" title="ลบ">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-red-500 text-sm">${err.message}</td></tr>`;
    }
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

        const html = `
            <div class="space-y-4 text-sm">
                <div class="flex flex-wrap gap-2">
                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">${STATUS_LABEL[r.Status] || r.Status}</span>
                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${RISK_BADGE_COLOR[r.RiskCategory] || 'bg-slate-100 text-slate-500'}">${r.RiskCategory || 'ทั่วไป'}</span>
                    ${r.KYTKeyword ? `<span class="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700"># ${r.KYTKeyword}</span>` : ''}
                </div>

                <div class="grid grid-cols-2 gap-3">
                    ${infoField('วันที่', date)}
                    ${infoField('แผนก', r.Department || '-')}
                    ${infoField('ชื่อทีม', r.TeamName || '-')}
                    ${infoField('ผู้รายงาน', r.ReporterName || '-')}
                </div>

                ${participants.length ? `
                <div>
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">ผู้เข้าร่วม (${participants.length} คน)</p>
                    <div class="flex flex-wrap gap-1.5">
                        ${participants.map(p => `<span class="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">${p}</span>`).join('')}
                    </div>
                </div>` : ''}

                <div class="p-3 bg-red-50 rounded-xl border border-red-100">
                    <p class="text-xs text-red-500 font-semibold uppercase tracking-wider mb-1">อันตรายที่คาดการณ์</p>
                    <p class="text-slate-700 leading-relaxed">${r.HazardDescription || '-'}</p>
                </div>

                ${r.Countermeasure ? `
                <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">มาตรการตอบโต้</p>
                    <p class="text-slate-700 leading-relaxed">${r.Countermeasure}</p>
                </div>` : ''}

                ${r.AdminComment ? `
                <div class="p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <p class="text-xs text-amber-600 font-semibold uppercase tracking-wider mb-1">ความคิดเห็น Admin</p>
                    <p class="text-slate-700 leading-relaxed">${r.AdminComment}</p>
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

        openModal('กิจกรรม KY', html, 'max-w-2xl');
    } catch (err) {
        hideLoading();
        showError(err);
    }
}

function infoField(label, value) {
    return `<div>
        <p class="text-xs text-slate-400 font-medium mb-0.5">${label}</p>
        <p class="text-slate-700 font-semibold">${value}</p>
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
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600">
                    <strong>${r.Department}</strong>${r.TeamName ? ` · ${r.TeamName}` : ''} · ${r.ReporterName} · ${r.ActivityDate ? new Date(r.ActivityDate).toLocaleDateString('th-TH') : ''}
                </div>

                <form id="ky-manage-form" class="space-y-4">
                    <input type="hidden" name="id" value="${r.id}">

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานะ</label>
                            <select name="Status" class="form-input w-full">
                                ${STATUSES.map(s => `<option value="${s}" ${r.Status === s ? 'selected':''}>${STATUS_LABEL[s]||s}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-1.5">KYT Keyword</label>
                            <input type="text" name="KYTKeyword" class="form-input w-full" value="${r.KYTKeyword || ''}">
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดอันตราย</label>
                        <textarea name="HazardDescription" rows="2" class="form-input w-full resize-none">${r.HazardDescription || ''}</textarea>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">มาตรการตอบโต้</label>
                        <textarea name="Countermeasure" rows="2" class="form-input w-full resize-none">${r.Countermeasure || ''}</textarea>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1.5">ความคิดเห็น Admin</label>
                        <textarea name="AdminComment" rows="2" class="form-input w-full resize-none"
                                  placeholder="หมายเหตุ / ข้อเสนอแนะเพิ่มเติม...">${r.AdminComment || ''}</textarea>
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
                const body = Object.fromEntries(fd.entries());
                delete body.id;
                await API.put(`/ky/${r.id}`, body);
                closeModal();
                showToast('อัปเดตกิจกรรม KY สำเร็จ', 'success');
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
        if (!e.target.closest('#ky-page')) return;

        // Tab
        const tabBtn = e.target.closest('.ky-tab');
        if (tabBtn) { await switchTab(tabBtn.dataset.tab); return; }

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

        // Delete
        const delBtn = e.target.closest('.btn-ky-delete');
        if (delBtn) {
            const confirmed = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบกิจกรรม KY ของแผนก "${delBtn.dataset.name}" ใช่หรือไม่?`);
            if (confirmed) {
                showLoading('กำลังลบ...');
                try {
                    await API.delete(`/ky/${delBtn.dataset.id}`);
                    showToast('ลบกิจกรรม KY สำเร็จ', 'success');
                    const statusFilter = document.getElementById('ky-manage-status')?.value || 'all';
                    await fetchAndRenderManage(statusFilter);
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // Preview image
        const previewBtn = e.target.closest('.btn-ky-preview');
        if (previewBtn) { showDocumentModal(previewBtn.dataset.url, previewBtn.dataset.title); return; }
    });

    // Filter + search changes
    document.addEventListener('change', async (e) => {
        if (!e.target.closest('#ky-page')) return;
        if (e.target.id === 'ky-filter-status') { _filterStatus = e.target.value; await fetchAndRenderHistory(); return; }
        if (e.target.id === 'ky-manage-status') { await fetchAndRenderManage(e.target.value); return; }
        if (e.target.id === 'ky-stats-year')    { _statsYear = parseInt(e.target.value); const c = document.getElementById('ky-tab-content'); if (c) await renderDashboard(c); return; }
    });

    document.addEventListener('input', debounce(async (e) => {
        if (!e.target.closest('#ky-page')) return;
        if (e.target.id === 'ky-history-search') { _searchQ = e.target.value; await fetchAndRenderHistory(); }
    }, 350));
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
