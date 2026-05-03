// public/js/pages/hiyari.js
import { API } from '../api.js';
import {
    hideLoading, showError, showLoading,
    openModal, openDetailModal, closeModal, showToast, showConfirmationModal, showDocumentModal, escHtml,
    statusBadge as dsStatusBadge
} from '../ui.js';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';
import { buildActivityCard } from '../utils/activity-widget.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants  (STOP_TYPES + RANKS mirror CCCF exactly)
// ─────────────────────────────────────────────────────────────────────────────
const STOP_TYPES = [
    { id: 1, code: 'Stop 1', label: 'อันตรายจากเครื่องจักร',        color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 2, code: 'Stop 2', label: 'อันตรายจากวัตถุหนักตกใส่',    color: '#f97316', bg: '#fff7ed', border: '#fed7aa', icon: 'M19 14l-7 7m0 0l-7-7m7 7V3' },
    { id: 3, code: 'Stop 3', label: 'อันตรายจากยานพาหนะ',          color: '#eab308', bg: '#fefce8', border: '#fef08a', icon: 'M8 17h8m-4-4v4M12 3L4 9v12h16V9l-8-6z' },
    { id: 4, code: 'Stop 4', label: 'อันตรายจากการตกจากที่สูง',    color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', icon: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6' },
    { id: 5, code: 'Stop 5', label: 'อันตรายจากไฟฟ้า',             color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 6, code: 'Stop 6', label: 'อันตรายอื่นๆ',                color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
];
const RANKS = [
    { rank: 'A', label: 'Rank A', desc: 'เสียชีวิต, พิการ, สูญเสียอวัยวะ', detail: '7 วัน',  color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    { rank: 'B', label: 'Rank B', desc: 'บาดเจ็บหยุดงาน',                   detail: '15 วัน', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
    { rank: 'C', label: 'Rank C', desc: 'บาดเจ็บเล็กน้อย ไม่หยุดงาน',      detail: '30 วัน', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
];

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
const RANK_BADGE = { A: 'bg-red-100 text-red-700', B: 'bg-orange-100 text-orange-700', C: 'bg-emerald-100 text-emerald-700' };
const RANK_LABEL = { A: 'Rank A', B: 'Rank B', C: 'Rank C' };

const STATUS_BADGE = {
    'Open':        'bg-sky-100 text-sky-700',
    'In Progress': 'bg-amber-100 text-amber-700',
    'Closed':      'bg-slate-100 text-slate-500',
};
const STATUS_LABEL = { 'Open': 'รอดำเนินการ', 'In Progress': 'กำลังดำเนินการ', 'Closed': 'ปิดแล้ว' };

const CHART_COLORS = ['#f97316','#ef4444','#8b5cf6','#06b6d4','#10b981','#f59e0b','#6366f1'];

// ─────────────────────────────────────────────────────────────────────────────
// SLA Helpers  (A=7d  B=15d  C=30d — mirrors RANK constants)
// ─────────────────────────────────────────────────────────────────────────────
const _SLA_DAYS = { A: 7, B: 15, C: 30, Critical: 7, High: 15, Medium: 30, Low: 30 };

function _getSLA(report) {
    if (!report || report.Status === 'Closed') return null;
    const days = report.Rank ? _SLA_DAYS[report.Rank] : _SLA_DAYS[report.RiskLevel];
    if (!days || !report.ReportDate) return null;
    const elapsed   = Math.floor((Date.now() - new Date(report.ReportDate)) / 86400000);
    const remaining = days - elapsed;
    return { days, elapsed, remaining, overdue: remaining < 0, warning: remaining >= 0 && remaining <= 3 };
}

function _buildSLABadge(sla) {
    if (!sla) return '';
    if (sla.overdue) return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ml-1" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5">เกิน ${Math.abs(sla.remaining)} วัน</span>`;
    if (sla.warning) return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ml-1" style="background:#fef9c3;color:#92400e;border:1px solid #fde68a">เหลือ ${sla.remaining} วัน</span>`;
    return '';
}

function _getSLARowStyle(sla) {
    if (!sla) return '';
    if (sla.overdue) return 'background:rgba(254,242,242,0.65)';
    if (sla.warning) return 'background:rgba(255,251,235,0.65)';
    return '';
}

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
let _historyYear    = '';
let _wizardStep     = 1;
let _searchQ        = '';
let _departments    = [];
let _listenersReady = false;
let _chartLine      = null;
let _chartPie       = null;
let _chartBar       = null;
let _chartStop      = null;
let _chartRank      = null;
let _dashConfig     = { pinnedDepts: [] };
let _assignments    = [];
let _empCache       = null;
let _posCache       = null;
let _hiyariForms    = [];

function _getAssignmentPeriod() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
        start,
        end,
        year: now.getFullYear(),
        label: now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }),
    };
}

function _isReportInPeriod(report, period) {
    if (!report?.ReportDate) return false;
    const dt = new Date(report.ReportDate);
    return dt >= period.start && dt < period.end;
}

function _buildAssignmentProgress(assignments, reports) {
    const period = _getAssignmentPeriod();
    const submittedIds = new Set(
        reports
            .filter(r => _isReportInPeriod(r, period))
            .map(r => String(r.ReporterID || '').trim())
            .filter(Boolean)
    );
    const byDept = new Map();

    assignments.forEach(a => {
        const dept = (a.Department || 'ไม่ระบุ').trim() || 'ไม่ระบุ';
        if (!byDept.has(dept)) byDept.set(dept, { dept, total: 0, submitted: 0 });
        const row = byDept.get(dept);
        row.total += 1;
        if (submittedIds.has(String(a.EmployeeID || '').trim())) row.submitted += 1;
    });

    return {
        period,
        submittedIds,
        depts: Array.from(byDept.values()).sort((a, b) => b.total - a.total || a.dept.localeCompare(b.dept)),
    };
}

async function _loadAssignmentKpi(year = new Date().getFullYear()) {
    const [assignRes, reportRes] = await Promise.all([
        API.get('/hiyari/assignments').catch(() => ({ data: [] })),
        API.get(`/hiyari?year=${year}`).catch(() => ({ data: [] })),
    ]);
    const assignments = normalizeApiArray(assignRes?.data ?? assignRes);
    const reports = normalizeApiArray(reportRes?.data ?? reportRes);
    const assignedIds = assignments.map(a => String(a.EmployeeID || '').trim()).filter(Boolean);
    const assignedSet = new Set(assignedIds);
    const submittedIds = new Set(
        reports
            .map(r => String(r.ReporterID || '').trim())
            .filter(id => assignedSet.has(id))
    );
    const closedIds = new Set(
        reports
            .filter(r => r.Status === 'Closed')
            .map(r => String(r.ReporterID || '').trim())
            .filter(id => assignedSet.has(id))
    );

    const total = assignments.length;
    const closed = closedIds.size;
    const submitted = submittedIds.size;
    return {
        total,
        open: Math.max(total - submitted, 0),
        inProgress: Math.max(submitted - closed, 0),
        closed,
        closureRate: total ? Math.round((closed / total) * 100) : 0,
        assignments,
        reports,
    };
}

function _renderAssignmentProgress(progress) {
    const wrap = document.getElementById('assignment-progress');
    if (!wrap) return;
    if (!progress.depts.length) {
        wrap.innerHTML = '';
        return;
    }

    const total = progress.depts.reduce((sum, d) => sum + d.total, 0);
    const submitted = progress.depts.reduce((sum, d) => sum + d.submitted, 0);
    const pct = total ? Math.round((submitted / total) * 100) : 0;

    wrap.innerHTML = `
        <div class="mb-4 rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                <div>
                    <p class="text-sm font-bold text-slate-800">Assignment Progress</p>
                    <p class="text-xs text-slate-500">รอบเดือน ${escHtml(progress.period.label)} · ส่งแล้ว ${submitted}/${total} คน (${pct}%)</p>
                </div>
                <div class="w-full md:w-48 h-2 rounded-full bg-white border border-orange-100 overflow-hidden">
                    <div class="h-full rounded-full" style="width:${pct}%;background:linear-gradient(90deg,#f97316,#ef4444)"></div>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                ${progress.depts.map(d => {
                    const deptPct = d.total ? Math.round((d.submitted / d.total) * 100) : 0;
                    return `
                    <div class="rounded-xl bg-white border border-orange-100 p-3">
                        <div class="flex items-center justify-between gap-2 mb-2">
                            <p class="text-xs font-bold text-slate-700 truncate">${escHtml(d.dept)}</p>
                            <span class="text-[11px] font-bold text-orange-700 whitespace-nowrap">${d.submitted}/${d.total} (${deptPct}%)</span>
                        </div>
                        <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div class="h-full rounded-full" style="width:${deptPct}%;background:#f97316"></div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

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

    // Apply incoming filter from dashboard drill-down
    try {
        const _inFilter = JSON.parse(sessionStorage.getItem('pending_filter_hiyari') || 'null');
        if (_inFilter) {
            sessionStorage.removeItem('pending_filter_hiyari');
            if (_inFilter.tab)    _activeTab    = _inFilter.tab;
            if (_inFilter.status) _filterStatus = _inFilter.status;
        }
    } catch (_) {}

    _activeTab = _activeTab || window._getTab?.('hiyari', 'dashboard') || 'dashboard';
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
                    <div id="hiyari-hero-stats" class="grid grid-cols-2 md:grid-cols-5 gap-3 w-full md:w-auto flex-shrink-0"></div>
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
    strip.innerHTML = [1,2,3,4,5].map(() => `
        <div class="rounded-xl px-4 py-3 text-center animate-pulse" style="background:rgba(255,255,255,0.12);min-width:80px">
            <div class="h-7 bg-white/20 rounded-lg mb-1.5 mx-auto w-10"></div>
            <div class="h-3 bg-white/15 rounded w-14 mx-auto"></div>
        </div>`).join('');

    try {
        const year = new Date().getFullYear();
        const kpi  = await _loadAssignmentKpi(year);

        const stats = [
            { value: kpi.total      ?? '—', label: 'ทั้งหมด',       color: '#6ee7b7' },
            { value: kpi.open       ?? '—', label: 'รอดำเนินการ',    color: (kpi.open > 0) ? '#fde68a' : '#6ee7b7' },
            { value: kpi.inProgress ?? '—', label: 'กำลังดำเนินการ', color: (kpi.inProgress > 0) ? '#fde68a' : '#6ee7b7' },
            { value: kpi.closed     ?? '—', label: 'ปิดแล้ว',        color: '#6ee7b7' },
            { value: `${kpi.closureRate}%`, label: 'อัตราปิด',        color: kpi.closureRate >= 80 ? '#6ee7b7' : kpi.closureRate >= 50 ? '#fde68a' : '#fca5a5' },
        ];

        strip.innerHTML = stats.map(s => `
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
                <p class="text-2xl font-bold" style="color:${s.color}">${s.value}</p>
                <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${s.label}</p>
            </div>`).join('');

        const atCard = await buildActivityCard('hiyari');
        if (atCard) {
            strip.insertAdjacentHTML('beforeend', atCard);
            strip.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 w-full md:w-auto flex-shrink-0';
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
            <!-- Toolbar -->
            <div class="flex flex-wrap items-center justify-between gap-3">
                <select id="stats-year" class="form-input py-1.5 text-sm w-32">
                    ${[0,1,2].map(i => {
                        const y = new Date().getFullYear() - i;
                        return `<option value="${y}" ${y === _statsYear ? 'selected' : ''}>${y}</option>`;
                    }).join('')}
                </select>
                <button id="hiyari-pdf-btn"
                    class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-orange-200 text-orange-700 bg-white hover:bg-orange-50 transition-all">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                    </svg>
                    Export PDF
                </button>
            </div>
            <!-- Executive summary -->
            <div id="hiyari-executive-summary">
                <div class="ds-section p-5 animate-pulse">
                    <div class="h-4 bg-slate-100 rounded w-40 mb-3"></div>
                    <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
                        ${[1,2,3,4,5].map(() => `<div class="h-16 bg-slate-50 rounded-xl"></div>`).join('')}
                    </div>
                </div>
            </div>
            <!-- Overdue alert (populated after stats load) -->
            <div id="overdue-alert" class="hidden"></div>

            <!-- KPI row -->
            <div id="kpi-row" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                ${[1,2,3,4].map(() => `<div class="ds-metric-card p-4 animate-pulse"><div class="h-8 bg-slate-100 rounded mb-2"></div><div class="h-4 bg-slate-50 rounded w-2/3"></div></div>`).join('')}
            </div>
            <!-- Stop + Rank row -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="ds-section p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">สรุปตาม Stop Type</h3>
                    <div class="relative" style="height:180px"><canvas id="chart-stop"></canvas></div>
                </div>
                <div class="ds-section p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">สรุปตาม Rank</h3>
                    <div id="rank-summary" class="space-y-3 mt-1"></div>
                </div>
            </div>
            <!-- STOP x Rank matrix -->
            <div class="ds-section">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">STOP × Rank Matrix</h3>
                        <p class="text-xs text-slate-400 mt-0.5">ภาพรวมความรุนแรงตามประเภทอันตราย เพื่อใช้ชี้จุดที่ต้องติดตามในการประชุมผู้บริหาร</p>
                    </div>
                    <span class="text-[10px] font-bold text-slate-400 uppercase">A=7 วัน · B=15 วัน · C=30 วัน</span>
                </div>
                <div id="stop-rank-matrix"></div>
            </div>
            <!-- SLA compliance -->
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div class="ds-section p-5">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">SLA Compliance</h3>
                            <p class="text-xs text-slate-400 mt-0.5">สถานะการควบคุมระยะเวลาดำเนินการตาม Rank</p>
                        </div>
                    </div>
                    <div id="sla-compliance-gauge"></div>
                </div>
                <div class="xl:col-span-2 ds-section p-5">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">Top Overdue / Near Due</h3>
                            <p class="text-xs text-slate-400 mt-0.5">รายการที่เกินกำหนดหรือใกล้ครบกำหนด เพื่อใช้ follow-up ในที่ประชุม</p>
                        </div>
                        <button id="sla-goto-history-btn"
                            class="px-3 py-1.5 rounded-xl text-xs font-bold text-orange-700 border border-orange-200 hover:bg-orange-50 transition-colors">
                            ดูทั้งหมด
                        </button>
                    </div>
                    <div id="top-overdue-list"></div>
                </div>
            </div>
            <!-- Heatmap -->
            <div class="ds-section p-5">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">Near-Miss Heatmap</h3>
                        <p class="text-xs text-slate-400 mt-0.5">12 เดือน × Stop Type สีเข้มตามจำนวนรายงาน เพื่อดู pattern การเกิดซ้ำ</p>
                    </div>
                    <div class="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                        <span>น้อย</span>
                        <span class="w-4 h-4 rounded bg-emerald-50 border border-emerald-100"></span>
                        <span class="w-4 h-4 rounded bg-orange-100 border border-orange-200"></span>
                        <span class="w-4 h-4 rounded bg-red-200 border border-red-300"></span>
                        <span>มาก</span>
                    </div>
                </div>
                <div id="near-miss-heatmap"></div>
            </div>
            <!-- Charts row -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="lg:col-span-2 ds-section p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">แนวโน้มรายงานรายเดือน</h3>
                    <div class="relative" style="height:220px"><canvas id="chart-line"></canvas></div>
                </div>
                <div class="ds-section p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">ผลที่อาจเกิดขึ้น</h3>
                    <div class="relative" style="height:220px"><canvas id="chart-pie"></canvas></div>
                </div>
            </div>
            <!-- Dept summary -->
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div class="ds-section p-5">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-sm font-bold text-slate-600">สรุปรายแผนก</h3>
                        ${_isAdmin ? `<button id="hiyari-dept-config-btn"
                            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                            ตั้งค่าแผนก
                        </button>` : ''}
                    </div>
                    <div id="dept-rank" class="space-y-2"></div>
                </div>
                <div class="ds-section p-5">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">Department Risk Ranking</h3>
                            <p class="text-xs text-slate-400 mt-0.5">คะแนนถ่วงน้ำหนัก: Rank A=5, B=3, C=1, เกิน SLA +2</p>
                        </div>
                        <span class="text-[10px] font-bold text-slate-400 uppercase">Weighted score</span>
                    </div>
                    <div id="dept-risk-ranking"></div>
                </div>
            </div>
        </div>`;

    try {
        const [statsRes, cfgRes, assignmentKpi] = await Promise.all([
            API.get(`/hiyari/stats?year=${_statsYear}`),
            API.get('/hiyari/dashboard-config').catch(() => ({ data: {} })),
            _loadAssignmentKpi(_statsYear),
        ]);
        const data = statsRes?.data || {};
        _dashConfig = cfgRes?.data || { pinnedDepts: [] };
        if (!Array.isArray(_dashConfig.pinnedDepts)) _dashConfig.pinnedDepts = [];

        renderKPI(assignmentKpi || {});
        renderExecutiveSummary(data, assignmentKpi || {});
        renderStopChart(data.stopDist || []);
        renderRankSummary(data.rankDist || []);
        renderStopRankMatrix(assignmentKpi?.reports || []);
        renderDeptRiskRanking(assignmentKpi?.reports || []);
        renderSLACompliance(assignmentKpi?.reports || []);
        renderNearMissHeatmap(assignmentKpi?.reports || []);
        renderLineChart(data.monthly || []);
        renderPieChart(data.consequence || []);
        renderDeptRank(data.deptRank || []);

        // Overdue alert strip
        const alertEl = document.getElementById('overdue-alert');
        const oc = data.kpi?.overdueCount || 0;
        if (alertEl) {
            if (oc > 0) {
                alertEl.className = '';
                alertEl.innerHTML = `
                <div class="flex items-center gap-3 p-4 rounded-xl border" style="background:#fef2f2;border-color:#fca5a5">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#fee2e2">
                        <svg class="w-5 h-5" style="color:#b91c1c" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold" style="color:#b91c1c">มีรายงาน ${oc} รายการ เกินกำหนดดำเนินการ</p>
                        <p class="text-xs mt-0.5" style="color:#dc2626">รายงานยังไม่ได้รับการแก้ไขภายในระยะเวลาที่กำหนดตาม Rank (A=7วัน / B=15วัน / C=30วัน)</p>
                    </div>
                    <button id="overdue-goto-btn"
                            class="px-4 py-2 rounded-xl text-xs font-bold text-white flex-shrink-0 transition-opacity hover:opacity-80"
                            style="background:#b91c1c">ดูรายการ</button>
                </div>`;
                document.getElementById('overdue-goto-btn')?.addEventListener('click', () => {
                    _filterStatus = 'Open';
                    const content = document.getElementById('hiyari-tab-content');
                    if (content) switchTab('history');
                });
            } else {
                alertEl.className = 'hidden';
                alertEl.innerHTML = '';
            }
        }
    } catch (error) {
        console.error('Stats error:', error);
    }
}

function renderKPI(kpi) {
    const cards = [
        { label: 'พนักงานที่มอบหมาย', value: kpi.total || 0,  color: '#f97316', status: 'all',         icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>` },
        { label: 'รอดำเนินการ',     value: kpi.open || 0,       color: '#0284c7', status: 'Open',        icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
        { label: 'กำลังดำเนินการ', value: kpi.inProgress || 0, color: '#d97706', status: 'In Progress', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>` },
        { label: 'ปิดแล้ว',         value: kpi.closed || 0,     color: '#059669', status: 'Closed',      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
    ];
    const row = document.getElementById('kpi-row');
    if (!row) return;
    row.innerHTML = cards.map(c => `
        <div class="ds-metric-card p-5 flex items-center gap-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all kpi-clickable"
             data-status="${c.status}" title="คลิกเพื่อกรองในประวัติ">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                 style="background:${c.color}18; color:${c.color}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${c.icon}</svg>
            </div>
            <div class="flex-1 min-w-0">
                <div class="text-2xl font-bold text-slate-800">${c.value}</div>
                <div class="text-xs text-slate-500 mt-0.5">${c.label}</div>
            </div>
            <svg class="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
        </div>`).join('');

    row.querySelectorAll('.kpi-clickable').forEach(card => {
        card.addEventListener('click', () => {
            _filterStatus = card.dataset.status;
            switchTab('history');
        });
    });
}

function renderExecutiveSummary(data, assignmentKpi) {
    const el = document.getElementById('hiyari-executive-summary');
    if (!el) return;

    const kpi = data?.kpi || {};
    const rankMap = Object.fromEntries((data?.rankDist || []).map(d => [d.Rank, Number(d.count) || 0]));
    const stopMap = Object.fromEntries((data?.stopDist || []).map(d => [Number(d.StopType), Number(d.count) || 0]));
    const topStop = STOP_TYPES
        .map(s => ({ ...s, count: stopMap[s.id] || 0 }))
        .sort((a, b) => b.count - a.count)[0];
    const topDept = (data?.deptRank || []).slice().sort((a, b) => (b.count || 0) - (a.count || 0))[0];
    const assignedTotal = assignmentKpi?.total || 0;
    const submitted = Math.max((assignmentKpi?.inProgress || 0) + (assignmentKpi?.closed || 0), 0);
    const submitPct = assignedTotal ? Math.round((submitted / assignedTotal) * 100) : 0;
    const rankA = rankMap.A || 0;
    const overdue = Number(kpi.overdueCount) || 0;

    const health = overdue > 0 || rankA > 0
        ? { label: 'ต้องติดตาม', bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' }
        : submitPct >= 80
            ? { label: 'อยู่ในเกณฑ์ดี', bg: '#ecfdf5', fg: '#047857', border: '#bbf7d0' }
            : { label: 'กำลังสะสมข้อมูล', bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa' };

    const summaryItems = [
        { label: 'ส่งตาม Assignment', value: `${submitted}/${assignedTotal}`, sub: `${submitPct}%`, color: '#0f766e' },
        { label: 'เกิน SLA', value: overdue, sub: overdue ? 'ต้องเร่งปิด' : 'ไม่มีรายการ', color: overdue ? '#b91c1c' : '#047857', action: 'overdue' },
        { label: 'Rank A', value: rankA, sub: rankA ? 'Critical watch' : 'ไม่พบ', color: rankA ? '#dc2626' : '#64748b', action: 'rankA' },
        { label: 'แผนกสูงสุด', value: topDept?.Department || '-', sub: topDept ? `${topDept.count || 0} รายการ` : 'ยังไม่มีข้อมูล', color: '#ea580c', action: topDept?.Department ? 'dept' : '' },
        { label: 'Stop Type สูงสุด', value: topStop?.code || '-', sub: topStop?.count ? `${topStop.count} รายการ` : 'ยังไม่มีข้อมูล', color: topStop?.color || '#64748b' },
    ];

    el.innerHTML = `
        <div class="ds-section overflow-hidden border border-emerald-100">
            <div class="flex flex-col xl:flex-row">
                <div class="xl:w-72 p-5 border-b xl:border-b-0 xl:border-r border-slate-100 bg-slate-50/70">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Executive Summary</p>
                            <h3 class="text-base font-bold text-slate-800 mt-1">ภาพรวม Hiyari ปี ${_statsYear}</h3>
                        </div>
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap"
                              style="background:${health.bg};color:${health.fg};border:1px solid ${health.border}">
                            ${health.label}
                        </span>
                    </div>
                    <p class="text-xs text-slate-500 mt-3 leading-relaxed">
                        ฐาน KPI อิงจากพนักงานที่มอบหมายในแท็บจัดการ และสถานะการปิดรายงานจริงในระบบ
                    </p>
                </div>
                <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                    ${summaryItems.map(item => `
                        <button type="button"
                            class="h-full text-left p-4 hover:bg-orange-50/60 transition-colors ${item.action ? 'cursor-pointer' : 'cursor-default'}"
                            ${item.action ? `data-summary-action="${item.action}"` : ''}
                            ${item.action === 'dept' ? `data-dept="${escHtml(topDept.Department)}"` : ''}>
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">${item.label}</p>
                            <p class="text-xl font-black truncate" style="color:${item.color}">${escHtml(String(item.value))}</p>
                            <p class="text-xs text-slate-500 mt-0.5 truncate">${escHtml(String(item.sub))}</p>
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>`;

    el.querySelectorAll('[data-summary-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.summaryAction;
            if (action === 'overdue') {
                _filterStatus = 'Open';
                _filterRisk = 'all';
                _filterDept = 'all';
            } else if (action === 'rankA') {
                _filterStatus = 'all';
                _filterRisk = 'Critical';
                _filterDept = 'all';
            } else if (action === 'dept') {
                _filterStatus = 'all';
                _filterRisk = 'all';
                _filterDept = btn.dataset.dept || 'all';
            }
            switchTab('history');
        });
    });
}

function renderStopRankMatrix(reports) {
    const el = document.getElementById('stop-rank-matrix');
    if (!el) return;

    const matrix = {};
    STOP_TYPES.forEach(st => {
        matrix[st.id] = { A: 0, B: 0, C: 0, total: 0 };
    });

    reports.forEach(r => {
        const stopId = Number(r.StopType);
        const rank = r.Rank || ({ Critical: 'A', High: 'B', Low: 'C', Medium: 'C' }[r.RiskLevel]);
        if (!matrix[stopId] || !['A', 'B', 'C'].includes(rank)) return;
        matrix[stopId][rank] += 1;
        matrix[stopId].total += 1;
    });

    const maxCell = Math.max(
        1,
        ...STOP_TYPES.flatMap(st => ['A', 'B', 'C'].map(rank => matrix[st.id][rank] || 0))
    );
    const rankMeta = {
        A: { label: 'Rank A', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
        B: { label: 'Rank B', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
        C: { label: 'Rank C', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    };
    const totalAll = STOP_TYPES.reduce((sum, st) => sum + matrix[st.id].total, 0);

    if (!totalAll) {
        el.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-6a2 2 0 012-2h2a2 2 0 012 2v6m-7 0h8m-8 0H5a2 2 0 01-2-2V7a2 2 0 012-2h3m11 12h-3m3 0a2 2 0 002-2V7a2 2 0 00-2-2h-3"/>
                    </svg>
                </div>
                <p class="text-sm">ยังไม่มีข้อมูลสำหรับสร้าง STOP × Rank Matrix</p>
            </div>`;
        return;
    }

    el.innerHTML = `
        <div class="overflow-x-auto">
            <table class="ds-table text-sm min-w-[720px]">
                <thead>
                    <tr class="text-left text-xs font-bold text-slate-400 uppercase tracking-wide">
                        <th class="px-3 py-2">Stop Type</th>
                        ${['A', 'B', 'C'].map(rank => `
                            <th class="px-3 py-2 text-center" style="color:${rankMeta[rank].color}">${rankMeta[rank].label}</th>
                        `).join('')}
                        <th class="px-3 py-2 text-center">รวม</th>
                        <th class="px-3 py-2">สัดส่วน</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${STOP_TYPES.map(st => {
                        const row = matrix[st.id];
                        const rowPct = totalAll ? Math.round((row.total / totalAll) * 100) : 0;
                        return `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-3 py-3">
                                <div class="flex items-center gap-2">
                                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${st.color}"></span>
                                    <div class="min-w-0">
                                        <p class="text-xs font-black text-slate-700">${st.code}</p>
                                        <p class="text-[10px] text-slate-400 truncate">${escHtml(st.label)}</p>
                                    </div>
                                </div>
                            </td>
                            ${['A', 'B', 'C'].map(rank => {
                                const count = row[rank] || 0;
                                const intensity = count ? Math.max(0.18, count / maxCell) : 0;
                                return `
                                <td class="px-3 py-3 text-center">
                                    <div class="mx-auto w-16 h-10 rounded-xl border flex items-center justify-center font-black text-sm"
                                         style="background:${count ? rankMeta[rank].bg : '#f8fafc'};border-color:${count ? rankMeta[rank].border : '#e2e8f0'};color:${count ? rankMeta[rank].color : '#cbd5e1'};opacity:${count ? 0.72 + (intensity * 0.28) : 1}">
                                        ${count}
                                    </div>
                                </td>`;
                            }).join('')}
                            <td class="px-3 py-3 text-center font-black text-slate-700">${row.total}</td>
                            <td class="px-3 py-3">
                                <div class="flex items-center gap-2">
                                    <div class="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                                        <div class="h-full rounded-full" style="width:${rowPct}%;background:linear-gradient(90deg,#f97316,#ef4444)"></div>
                                    </div>
                                    <span class="text-xs font-bold text-slate-500 w-9 text-right">${rowPct}%</span>
                                </div>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

function renderDeptRiskRanking(reports) {
    const el = document.getElementById('dept-risk-ranking');
    if (!el) return;

    const deptMap = new Map();
    const rankWeight = { A: 5, B: 3, C: 1, Critical: 5, High: 3, Medium: 1, Low: 1 };

    reports.forEach(r => {
        const dept = (r.Department || 'ไม่ระบุ').trim() || 'ไม่ระบุ';
        if (!deptMap.has(dept)) {
            deptMap.set(dept, { dept, score: 0, total: 0, rankA: 0, rankB: 0, rankC: 0, overdue: 0, open: 0 });
        }
        const row = deptMap.get(dept);
        const rank = r.Rank || ({ Critical: 'A', High: 'B', Medium: 'C', Low: 'C' }[r.RiskLevel]);
        const sla = _getSLA(r);

        row.total += 1;
        row.score += rankWeight[rank] || rankWeight[r.RiskLevel] || 1;
        if (rank === 'A') row.rankA += 1;
        else if (rank === 'B') row.rankB += 1;
        else row.rankC += 1;
        if (sla?.overdue) {
            row.overdue += 1;
            row.score += 2;
        }
        if (r.Status !== 'Closed') row.open += 1;
    });

    const rows = Array.from(deptMap.values())
        .sort((a, b) => b.score - a.score || b.rankA - a.rankA || b.overdue - a.overdue || b.total - a.total)
        .slice(0, 8);
    const maxScore = Math.max(1, ...rows.map(r => r.score));

    if (!rows.length) {
        el.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/>
                    </svg>
                </div>
                <p class="text-sm">ยังไม่มีข้อมูลสำหรับจัดอันดับความเสี่ยงรายแผนก</p>
            </div>`;
        return;
    }

    el.innerHTML = `
        <div class="space-y-2">
            ${rows.map((row, idx) => {
                const pct = Math.round((row.score / maxScore) * 100);
                const riskColor = row.rankA || row.overdue ? '#dc2626' : row.rankB ? '#ea580c' : '#16a34a';
                return `
                <button type="button" data-risk-dept="${escHtml(row.dept)}"
                        class="w-full text-left rounded-xl border border-slate-100 hover:border-orange-200 hover:bg-orange-50/60 transition-colors p-3">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
                             style="background:${riskColor}14;color:${riskColor}">#${idx + 1}</div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between gap-2 mb-1">
                                <p class="text-sm font-bold text-slate-800 truncate">${escHtml(row.dept)}</p>
                                <span class="text-sm font-black" style="color:${riskColor}">${row.score}</span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div class="h-full rounded-full" style="width:${pct}%;background:${riskColor}"></div>
                            </div>
                            <div class="flex flex-wrap gap-1.5 mt-2">
                                <span class="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-500">รวม ${row.total}</span>
                                <span class="px-1.5 py-0.5 rounded bg-red-50 text-[10px] font-semibold text-red-600">A ${row.rankA}</span>
                                <span class="px-1.5 py-0.5 rounded bg-orange-50 text-[10px] font-semibold text-orange-600">B ${row.rankB}</span>
                                <span class="px-1.5 py-0.5 rounded bg-emerald-50 text-[10px] font-semibold text-emerald-600">C ${row.rankC}</span>
                                <span class="px-1.5 py-0.5 rounded bg-rose-50 text-[10px] font-semibold text-rose-600">เกิน SLA ${row.overdue}</span>
                                <span class="px-1.5 py-0.5 rounded bg-sky-50 text-[10px] font-semibold text-sky-600">Open ${row.open}</span>
                            </div>
                        </div>
                    </div>
                </button>`;
            }).join('')}
        </div>`;

    el.querySelectorAll('[data-risk-dept]').forEach(btn => {
        btn.addEventListener('click', () => {
            _filterStatus = 'all';
            _filterRisk = 'all';
            _filterDept = btn.dataset.riskDept || 'all';
            switchTab('history');
        });
    });
}

function renderSLACompliance(reports) {
    const gaugeEl = document.getElementById('sla-compliance-gauge');
    const listEl = document.getElementById('top-overdue-list');
    if (!gaugeEl || !listEl) return;

    const active = reports.filter(r => r.Status !== 'Closed');
    const closed = reports.filter(r => r.Status === 'Closed');
    const overdue = active.filter(r => _getSLA(r)?.overdue);
    const nearDue = active.filter(r => {
        const sla = _getSLA(r);
        return sla?.warning && !sla.overdue;
    });
    const onTrack = active.filter(r => {
        const sla = _getSLA(r);
        return !sla || (!sla.overdue && !sla.warning);
    });
    const denominator = active.length + closed.length;
    const compliant = closed.length + onTrack.length;
    const pct = denominator ? Math.round((compliant / denominator) * 100) : 0;
    const gaugeColor = pct >= 90 ? '#059669' : pct >= 75 ? '#d97706' : '#dc2626';
    const dash = Math.max(0, Math.min(100, pct));

    gaugeEl.innerHTML = `
        <div class="flex flex-col items-center">
            <div class="relative w-40 h-40">
                <svg viewBox="0 0 120 120" class="w-40 h-40 -rotate-90">
                    <circle cx="60" cy="60" r="48" fill="none" stroke="#e2e8f0" stroke-width="12"/>
                    <circle cx="60" cy="60" r="48" fill="none" stroke="${gaugeColor}" stroke-width="12"
                            stroke-linecap="round" stroke-dasharray="${dash * 3.015} 301.5"/>
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <p class="text-3xl font-black" style="color:${gaugeColor}">${pct}%</p>
                    <p class="text-[10px] font-bold text-slate-400 uppercase">Compliance</p>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-2 w-full mt-4">
                <div class="rounded-xl bg-emerald-50 border border-emerald-100 p-2 text-center">
                    <p class="text-lg font-black text-emerald-700">${closed.length + onTrack.length}</p>
                    <p class="text-[10px] text-emerald-700 font-semibold">ปกติ</p>
                </div>
                <div class="rounded-xl bg-amber-50 border border-amber-100 p-2 text-center">
                    <p class="text-lg font-black text-amber-700">${nearDue.length}</p>
                    <p class="text-[10px] text-amber-700 font-semibold">ใกล้ครบ</p>
                </div>
                <div class="rounded-xl bg-red-50 border border-red-100 p-2 text-center">
                    <p class="text-lg font-black text-red-700">${overdue.length}</p>
                    <p class="text-[10px] text-red-700 font-semibold">เกิน SLA</p>
                </div>
            </div>
        </div>`;

    const priorityRows = [...overdue, ...nearDue]
        .map(r => ({ report: r, sla: _getSLA(r) }))
        .filter(x => x.sla)
        .sort((a, b) => a.sla.remaining - b.sla.remaining)
        .slice(0, 6);

    if (!priorityRows.length) {
        listEl.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <p class="text-sm">ไม่มีรายการเกิน SLA หรือใกล้ครบกำหนด</p>
            </div>`;
    } else {
        listEl.innerHTML = `
            <div class="space-y-2">
                ${priorityRows.map(({ report: r, sla }) => {
                    const st = STOP_TYPES.find(s => s.id === Number(r.StopType));
                    const rank = r.Rank || ({ Critical: 'A', High: 'B', Medium: 'C', Low: 'C' }[r.RiskLevel]) || '-';
                    const isOver = sla.overdue;
                    const date = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
                    return `
                    <button type="button" data-overdue-id="${r.id}"
                            class="w-full text-left rounded-xl border ${isOver ? 'border-red-100 bg-red-50/50 hover:bg-red-50' : 'border-amber-100 bg-amber-50/50 hover:bg-amber-50'} p-3 transition-colors">
                        <div class="flex flex-col md:flex-row md:items-center gap-2">
                            <div class="flex-1 min-w-0">
                                <div class="flex flex-wrap items-center gap-1.5 mb-1">
                                    <span class="px-1.5 py-0.5 rounded text-[10px] font-black ${rank === 'A' ? 'bg-red-100 text-red-700' : rank === 'B' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}">Rank ${rank}</span>
                                    ${st ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold" style="background:${st.bg};color:${st.color};border:1px solid ${st.border}">${st.code}</span>` : ''}
                                    <span class="text-[10px] text-slate-400">${date}</span>
                                </div>
                                <p class="text-sm font-bold text-slate-800 truncate">${escHtml(r.Department || '-')} · ${escHtml(r.ReporterName || '-')}</p>
                                <p class="text-xs text-slate-500 truncate mt-0.5">${escHtml(r.Description || '-')}</p>
                            </div>
                            <div class="md:w-28 flex-shrink-0 text-right">
                                <span class="inline-flex px-2 py-1 rounded-full text-[10px] font-black"
                                      style="background:${isOver ? '#fee2e2' : '#fef3c7'};color:${isOver ? '#b91c1c' : '#92400e'}">
                                    ${isOver ? `เกิน ${Math.abs(sla.remaining)} วัน` : `เหลือ ${sla.remaining} วัน`}
                                </span>
                            </div>
                        </div>
                    </button>`;
                }).join('')}
            </div>`;
    }

    listEl.querySelectorAll('[data-overdue-id]').forEach(btn => {
        btn.addEventListener('click', () => showDetailModal(btn.dataset.overdueId));
    });

    document.getElementById('sla-goto-history-btn')?.addEventListener('click', () => {
        _filterStatus = 'Open';
        _filterRisk = 'all';
        _filterDept = 'all';
        switchTab('history');
    });
}

function renderNearMissHeatmap(reports) {
    const el = document.getElementById('near-miss-heatmap');
    if (!el) return;

    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const matrix = {};
    STOP_TYPES.forEach(st => {
        matrix[st.id] = Array(12).fill(0);
    });

    reports.forEach(r => {
        const stopId = Number(r.StopType);
        if (!matrix[stopId] || !r.ReportDate) return;
        const dt = new Date(r.ReportDate);
        if (Number.isNaN(dt.getTime())) return;
        matrix[stopId][dt.getMonth()] += 1;
    });

    const values = STOP_TYPES.flatMap(st => matrix[st.id]);
    const max = Math.max(1, ...values);
    const total = values.reduce((sum, v) => sum + v, 0);

    if (!total) {
        el.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
                    </svg>
                </div>
                <p class="text-sm">ยังไม่มีข้อมูลสำหรับสร้าง Heatmap</p>
            </div>`;
        return;
    }

    const cellStyle = (count) => {
        if (!count) return 'background:#f8fafc;color:#cbd5e1;border-color:#e2e8f0';
        const intensity = count / max;
        if (intensity >= 0.75) return 'background:#fecaca;color:#991b1b;border-color:#fca5a5';
        if (intensity >= 0.45) return 'background:#fed7aa;color:#9a3412;border-color:#fdba74';
        if (intensity >= 0.2) return 'background:#fef3c7;color:#92400e;border-color:#fde68a';
        return 'background:#dcfce7;color:#166534;border-color:#bbf7d0';
    };

    el.innerHTML = `
        <div class="overflow-x-auto">
            <div class="min-w-[860px]">
                <div class="grid gap-1.5" style="grid-template-columns:130px repeat(12,minmax(42px,1fr));">
                    <div></div>
                    ${months.map(m => `<div class="text-center text-[10px] font-bold text-slate-400 uppercase">${m}</div>`).join('')}
                    ${STOP_TYPES.map(st => `
                        <div class="flex items-center gap-2 min-w-0 pr-2">
                            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${st.color}"></span>
                            <div class="min-w-0">
                                <p class="text-xs font-black text-slate-700">${st.code}</p>
                                <p class="text-[9px] text-slate-400 truncate">${escHtml(st.label)}</p>
                            </div>
                        </div>
                        ${matrix[st.id].map((count, idx) => `
                            <button type="button"
                                    data-heat-stop="${st.id}"
                                    data-heat-month="${idx + 1}"
                                    class="h-10 rounded-lg border text-xs font-black transition-transform hover:scale-[1.04]"
                                    style="${cellStyle(count)}"
                                    title="${st.code} · ${months[idx]}: ${count} รายการ">
                                ${count || ''}
                            </button>
                        `).join('')}
                    `).join('')}
                </div>
            </div>
        </div>`;

    el.querySelectorAll('[data-heat-stop]').forEach(btn => {
        btn.addEventListener('click', () => {
            _historyYear = String(_statsYear);
            _filterStatus = 'all';
            _filterRisk = 'all';
            _filterDept = 'all';
            _searchQ = '';
            switchTab('history');
        });
    });
}

function renderStopChart(data) {
    const ctx = document.getElementById('chart-stop');
    if (!ctx) return;
    if (_chartStop) { _chartStop.destroy(); _chartStop = null; }

    const map = Object.fromEntries(data.map(d => [d.StopType, d.count]));
    _chartStop = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: STOP_TYPES.map(s => s.code),
            datasets: [{
                data: STOP_TYPES.map(s => map[s.id] || 0),
                backgroundColor: STOP_TYPES.map(s => s.color + '99'),
                borderColor:     STOP_TYPES.map(s => s.color),
                borderWidth: 2,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false },
                tooltip: { callbacks: { label: ctx => {
                    const st = STOP_TYPES[ctx.dataIndex];
                    return ` ${st?.label || ''}: ${ctx.parsed.y}`;
                }}}
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Kanit' } }, grid: { color: '#f1f5f9' } },
                x: { ticks: { font: { family: 'Kanit', size: 11 } }, grid: { display: false } },
            },
        }
    });
}

function renderRankSummary(data) {
    const el = document.getElementById('rank-summary');
    if (!el) return;
    const map = Object.fromEntries(data.map(d => [d.Rank, d.count]));
    const total = data.reduce((s, d) => s + (d.count || 0), 0) || 1;
    el.innerHTML = RANKS.map(r => {
        const cnt = map[r.rank] || 0;
        const pct = Math.round(cnt / total * 100);
        return `
        <div>
            <div class="flex justify-between items-center mb-1">
                <span class="text-xs font-bold" style="color:${r.color}">${r.label}</span>
                <span class="text-xs text-slate-500">${cnt} รายการ (${total > 1 || cnt > 0 ? pct : 0}%)</span>
            </div>
            <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${r.color}"></div>
            </div>
            <p class="text-[10px] text-slate-400 mt-0.5">${r.desc} — ${r.detail}</p>
        </div>`;
    }).join('');
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
                tension: 0.4, fill: true,
                pointBackgroundColor: '#f97316', pointRadius: 4,
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
            datasets: [{ data: data.map(d => d.count), backgroundColor: CHART_COLORS, borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { family: 'Kanit', size: 11 }, padding: 10, boxWidth: 12 } } },
            cutout: '55%',
        }
    });
}

function renderDeptRank(allDepts) {
    const el = document.getElementById('dept-rank');
    if (!el) return;

    const pinned = _dashConfig.pinnedDepts || [];
    const countMap = Object.fromEntries(allDepts.map(d => [d.Department, d.count || 0]));
    const depts  = pinned.length
        ? pinned.map(dept => ({ Department: dept, count: countMap[dept] || 0 }))
        : allDepts.slice(0, 8);
    const savedStrip = pinned.length ? `
        <div class="mb-4 rounded-xl border border-orange-100 bg-orange-50/70 p-3">
            <p class="text-[10px] font-bold text-orange-700 uppercase mb-2">แผนกที่บันทึกไว้</p>
            <div class="flex flex-wrap gap-1.5">
                ${pinned.map(dept => `<span class="inline-flex items-center px-2 py-1 rounded-lg bg-white border border-orange-100 text-xs font-semibold text-slate-700">${escHtml(dept)}</span>`).join('')}
            </div>
        </div>` : '';

    if (!depts.length) {
        el.innerHTML = `${savedStrip}<div class="text-center py-6 text-slate-400">
            <p class="text-sm">${pinned.length ? 'ไม่พบข้อมูลสำหรับแผนกที่เลือก' : 'ยังไม่มีข้อมูล'}</p>
            ${_isAdmin && !pinned.length ? `<p class="text-xs mt-1">คลิก "ตั้งค่าแผนก" เพื่อเลือกแผนกที่ต้องการแสดง</p>` : ''}
        </div>`;
        return;
    }

    const max = Math.max(...depts.map(d => d.count), 1);
    el.innerHTML = `
        ${savedStrip}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${depts.map(d => `
            <div class="flex items-center gap-2">
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-0.5">
                        <span class="text-xs font-medium text-slate-700 truncate">${escHtml(d.Department)}</span>
                        <span class="text-xs font-bold text-orange-600 ml-2 flex-shrink-0">${d.count}</span>
                    </div>
                    <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div class="h-full rounded-full" style="width:${Math.round((d.count/max)*100)}%;background:linear-gradient(90deg,#f97316,#ef4444)"></div>
                    </div>
                </div>
            </div>`).join('')}
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD CONFIG MODAL (Admin)
// ─────────────────────────────────────────────────────────────────────────────
function openDashConfigModal() {
    const pinned = _dashConfig.pinnedDepts || [];
    const html = `
        <div class="space-y-4 px-1">
            <div class="bg-orange-50 border border-orange-100 rounded-xl p-3 flex gap-2.5 text-sm text-orange-800">
                <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                เลือกแผนกที่ต้องการแสดงในส่วน "สรุปรายแผนก" ถ้าไม่เลือกจะแสดง 8 แผนกแรก
            </div>
            <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">แผนกที่แสดง</label>
                <div class="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto pr-1" id="dept-config-list">
                    ${_departments.map(d => `
                    <label class="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200 cursor-pointer hover:border-orange-300 hover:bg-orange-50 transition-colors">
                        <input type="checkbox" name="dept" value="${escHtml(d)}" ${pinned.includes(d) ? 'checked' : ''}
                               class="w-4 h-4 rounded text-orange-500">
                        <span class="text-sm text-slate-700">${escHtml(d)}</span>
                    </label>`).join('')}
                </div>
            </div>
            <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onclick="window.closeModal&&window.closeModal()"
                        class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
                <button id="save-dash-config-btn"
                        class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                        style="background:linear-gradient(135deg,#f97316,#ef4444)">บันทึก</button>
            </div>
        </div>`;

    openModal('ตั้งค่าแผนกที่แสดง', html, 'max-w-md');

    document.getElementById('save-dash-config-btn')?.addEventListener('click', async () => {
        const checked = [...document.querySelectorAll('#dept-config-list input[name="dept"]:checked')]
            .map(cb => cb.value);
        const btn = document.getElementById('save-dash-config-btn');
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span> กำลังบันทึก...`;
        try {
            await API.put('/hiyari/dashboard-config', { pinnedDepts: checked });
            _dashConfig.pinnedDepts = checked;
            closeModal();
            showToast('บันทึกการตั้งค่าสำเร็จ', 'success');
            // Refresh dept display without full reload
            const allRes = await API.get(`/hiyari/stats?year=${_statsYear}`);
            renderDeptRank(allRes?.data?.deptRank || []);
        } catch (err) {
            showError(err);
        } finally {
            btn.disabled = false;
            btn.textContent = 'บันทึก';
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT — html2canvas approach (Thai font support)
// ─────────────────────────────────────────────────────────────────────────────
async function exportHiyariPDF() {
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        showToast('ไลบรารี PDF ยังไม่พร้อม', 'error');
        return;
    }
    const btn = document.getElementById('hiyari-pdf-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'กำลังสร้าง PDF...';
    }

    try {
        const [statsRes, assignmentKpi] = await Promise.all([
            API.get(`/hiyari/stats?year=${_statsYear}`),
            _loadAssignmentKpi(_statsYear),
        ]);
        const data = statsRes?.data || {};
        const reportKpi = data.kpi || {};
        const reports = assignmentKpi?.reports || [];
        const rankMap = Object.fromEntries((data.rankDist || []).map(d => [d.Rank, Number(d.count) || 0]));
        const stopMap = Object.fromEntries((data.stopDist || []).map(d => [Number(d.StopType), Number(d.count) || 0]));
        const deptData = (_dashConfig.pinnedDepts?.length)
            ? (data.deptRank || []).filter(d => _dashConfig.pinnedDepts.includes(d.Department))
            : (data.deptRank || []).slice(0, 8);
        const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
        const monthCounts = Array(12).fill(0);
        (data.monthly || []).forEach(r => { monthCounts[(r.month || 1) - 1] = Number(r.count) || 0; });
        const assignedTotal = assignmentKpi?.total || 0;
        const submitted = (assignmentKpi?.inProgress || 0) + (assignmentKpi?.closed || 0);
        const submitPct = assignedTotal ? Math.round((submitted / assignedTotal) * 100) : 0;
        const closureRate = assignmentKpi?.closureRate || 0;
        const overdueRows = reports
            .map(r => ({ report: r, sla: _getSLA(r) }))
            .filter(x => x.sla?.overdue || x.sla?.warning)
            .sort((a, b) => a.sla.remaining - b.sla.remaining)
            .slice(0, 12);
        const active = reports.filter(r => r.Status !== 'Closed');
        const closed = reports.filter(r => r.Status === 'Closed');
        const overdue = active.filter(r => _getSLA(r)?.overdue);
        const nearDue = active.filter(r => {
            const sla = _getSLA(r);
            return sla?.warning && !sla.overdue;
        });
        const onTrack = active.filter(r => {
            const sla = _getSLA(r);
            return !sla || (!sla.overdue && !sla.warning);
        });
        const slaDenom = active.length + closed.length;
        const slaPct = slaDenom ? Math.round(((closed.length + onTrack.length) / slaDenom) * 100) : 0;

        const matrix = {};
        STOP_TYPES.forEach(st => { matrix[st.id] = { A: 0, B: 0, C: 0, total: 0 }; });
        reports.forEach(r => {
            const stopId = Number(r.StopType);
            const rank = r.Rank || ({ Critical: 'A', High: 'B', Medium: 'C', Low: 'C' }[r.RiskLevel]);
            if (!matrix[stopId] || !['A','B','C'].includes(rank)) return;
            matrix[stopId][rank] += 1;
            matrix[stopId].total += 1;
        });
        const stopRankMatrixRows = STOP_TYPES.map(s => {
            const rankCells = ['A', 'B', 'C'].map(rank => {
                const color = rank === 'A' ? '#dc2626' : rank === 'B' ? '#ea580c' : '#16a34a';
                return `<td style="padding:9px;text-align:center;font-size:15px;font-weight:900;color:${color}">${matrix[s.id][rank]}</td>`;
            }).join('');
            return `
                <tr style="background:#f8fafc">
                    <td style="padding:9px 10px;border-radius:10px 0 0 10px"><b style="color:${s.color}">${s.code}</b><div style="font-size:9px;color:#64748b">${escHtml(s.label)}</div></td>
                    ${rankCells}
                    <td style="padding:9px;text-align:center;font-size:14px;font-weight:900;color:#334155;border-radius:0 10px 10px 0">${matrix[s.id].total}</td>
                </tr>`;
        }).join('');

        const deptRiskRows = (() => {
            const map = new Map();
            const weights = { A: 5, B: 3, C: 1, Critical: 5, High: 3, Medium: 1, Low: 1 };
            reports.forEach(r => {
                const dept = (r.Department || 'ไม่ระบุ').trim() || 'ไม่ระบุ';
                if (!map.has(dept)) map.set(dept, { dept, score: 0, total: 0, rankA: 0, rankB: 0, rankC: 0, overdue: 0, open: 0 });
                const row = map.get(dept);
                const rank = r.Rank || ({ Critical: 'A', High: 'B', Medium: 'C', Low: 'C' }[r.RiskLevel]);
                const sla = _getSLA(r);
                row.total += 1;
                row.score += weights[rank] || weights[r.RiskLevel] || 1;
                if (rank === 'A') row.rankA += 1;
                else if (rank === 'B') row.rankB += 1;
                else row.rankC += 1;
                if (sla?.overdue) { row.overdue += 1; row.score += 2; }
                if (r.Status !== 'Closed') row.open += 1;
            });
            return Array.from(map.values())
                .sort((a, b) => b.score - a.score || b.rankA - a.rankA || b.overdue - a.overdue || b.total - a.total)
                .slice(0, 10);
        })();
        const maxDeptScore = Math.max(1, ...deptRiskRows.map(r => r.score));

        const buildPage = (innerHtml) => {
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;min-height:1122px;background:#fff;font-family:Kanit,sans-serif;font-size:13px;color:#1e293b;display:flex;flex-direction:column';
            div.innerHTML = innerHtml;
            document.body.appendChild(div);
            return div;
        };

        const headerHtml = `
            <div style="background:#065f46;padding:22px 32px;color:#fff;flex-shrink:0">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
                    <div>
                        <p style="font-size:10px;opacity:0.78;margin:0 0 4px">Thai Summit Harness Co., Ltd. · Safety Executive Report</p>
                        <h1 style="font-size:20px;font-weight:800;margin:0">Hiyari-Hatto (Near-Miss)</h1>
                        <p style="font-size:12px;margin:5px 0 0;opacity:0.9">Period: ${_statsYear} · Generated: ${new Date().toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'})}</p>
                    </div>
                    <div style="text-align:right;font-size:10px;line-height:1.5;opacity:0.9">
                        <div>Rank A SLA: 7 days</div>
                        <div>Rank B SLA: 15 days</div>
                        <div>Rank C SLA: 30 days</div>
                    </div>
                </div>
            </div>`;

        const footerHtml = (page, total) => `
            <div style="flex-shrink:0;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;padding:8px 32px;display:flex;justify-content:space-between;margin-top:auto">
                <span>Hiyari-Hatto Executive Report · Thai Summit Harness Co., Ltd.</span>
                <span>Page ${page} of ${total}</span>
            </div>`;
        const sectionTitle = (title, sub = '') => `
            <div style="margin-bottom:12px">
                <h2 style="font-size:15px;font-weight:800;color:#065f46;margin:0">${title}</h2>
                ${sub ? `<p style="font-size:10px;color:#64748b;margin:3px 0 0">${sub}</p>` : ''}
            </div>`;
        const metricCard = (label, value, color, sub = '') => `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:13px;text-align:center">
                <div style="font-size:25px;font-weight:900;color:${color};line-height:1">${value}</div>
                <div style="font-size:10px;color:#475569;margin-top:5px;font-weight:700">${label}</div>
                ${sub ? `<div style="font-size:9px;color:#94a3b8;margin-top:2px">${sub}</div>` : ''}
            </div>`;
        const bar = (pct, color) => `<div style="height:7px;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(0, Math.min(100, pct))}%;background:${color};border-radius:999px"></div></div>`;

        const totalPages = 4;
        const p1 = buildPage(`
            ${headerHtml}
            <div style="padding:24px 32px;flex:1">
                ${sectionTitle('1. Executive Summary', 'KPI ฐาน assignment + สถานะการปิดรายงานจริงในระบบ')}
                <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px">
                    ${metricCard('Assigned', assignedTotal, '#0f766e', 'people')}
                    ${metricCard('Submitted', `${submitted}/${assignedTotal}`, '#0284c7', `${submitPct}%`)}
                    ${metricCard('Closed', assignmentKpi?.closed || 0, '#059669', `${closureRate}% closure`)}
                    ${metricCard('Overdue', overdue.length, overdue.length ? '#dc2626' : '#059669', 'SLA')}
                    ${metricCard('Rank A', rankMap.A || 0, (rankMap.A || 0) ? '#dc2626' : '#64748b', 'critical')}
                </div>
                <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:16px;margin-bottom:18px">
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px">
                        <div style="font-size:12px;font-weight:800;color:#065f46;margin-bottom:8px">Executive Notes</div>
                        ${[
                            `Submission coverage: ${submitted}/${assignedTotal} (${submitPct}%)`,
                            `SLA compliance: ${slaPct}% · overdue ${overdue.length} · near due ${nearDue.length}`,
                            `Critical watchpoint: Rank A ${rankMap.A || 0} case(s)`,
                            deptRiskRows[0] ? `Highest weighted-risk department: ${deptRiskRows[0].dept} (${deptRiskRows[0].score} pts)` : 'No department risk concentration detected',
                        ].map(t => `<div style="font-size:11px;color:#334155;margin-bottom:7px;display:flex;gap:6px"><span style="color:#f97316;font-weight:900">•</span><span>${escHtml(t)}</span></div>`).join('')}
                    </div>
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;text-align:center">
                        <div style="font-size:12px;font-weight:800;color:#065f46;margin-bottom:10px">SLA Compliance</div>
                        <div style="font-size:48px;font-weight:900;color:${slaPct >= 90 ? '#059669' : slaPct >= 75 ? '#d97706' : '#dc2626'};line-height:1">${slaPct}%</div>
                        <div style="font-size:10px;color:#64748b;margin-top:6px">Normal ${closed.length + onTrack.length} · Near ${nearDue.length} · Overdue ${overdue.length}</div>
                        <div style="margin-top:12px">${bar(slaPct, slaPct >= 90 ? '#059669' : slaPct >= 75 ? '#d97706' : '#dc2626')}</div>
                    </div>
                </div>
                ${sectionTitle('Rank & STOP Distribution')}
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
                    <div>
                        ${RANKS.map(r => {
                            const cnt = rankMap[r.rank] || 0;
                            const pct = Math.round(cnt / (reportKpi.total || 1) * 100);
                            return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><b style="color:${r.color}">${r.label}</b><span>${cnt} (${pct}%)</span></div>${bar(pct, r.color)}</div>`;
                        }).join('')}
                    </div>
                    <div>
                        ${STOP_TYPES.map(s => {
                            const cnt = stopMap[s.id] || 0;
                            const pct = Math.round(cnt / (reportKpi.total || 1) * 100);
                            return `<div style="margin-bottom:7px"><div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px"><b style="color:${s.color}">${s.code}</b><span>${cnt}</span></div>${bar(pct, s.color)}</div>`;
                        }).join('')}
                    </div>
                </div>
            </div>
            ${footerHtml(1,totalPages)}`);

        const p2 = buildPage(`
            ${headerHtml}
            <div style="padding:24px 32px;flex:1">
                ${sectionTitle('2. Trend & STOP × Rank Matrix', 'ใช้ดู pattern ความเสี่ยงตามเดือนและประเภทอันตราย')}
                <table style="width:100%;border-collapse:collapse;margin-bottom:22px;font-size:10px;border:1px solid #e2e8f0">
                    <tr style="background:#065f46;color:#fff">
                        ${months.map(m => `<th style="padding:6px 4px;text-align:center;font-weight:700">${m}</th>`).join('')}
                    </tr>
                    <tr>
                        ${monthCounts.map(c => `<td style="padding:8px 4px;text-align:center;font-weight:900;color:#0f766e;background:#ecfdf5">${c}</td>`).join('')}
                    </tr>
                </table>
                <table style="width:100%;border-collapse:separate;border-spacing:0 6px;font-size:10px">
                    <tr style="color:#64748b">
                        <th style="padding:6px;text-align:left">Stop Type</th>
                        <th style="padding:6px;text-align:center;color:#dc2626">Rank A</th>
                        <th style="padding:6px;text-align:center;color:#ea580c">Rank B</th>
                        <th style="padding:6px;text-align:center;color:#16a34a">Rank C</th>
                        <th style="padding:6px;text-align:center">Total</th>
                    </tr>
                    ${stopRankMatrixRows}
            </div>
            ${footerHtml(2,totalPages)}`);

        const p3 = buildPage(`
            ${headerHtml}
            <div style="padding:24px 32px;flex:1">
                ${sectionTitle('3. Department Risk Ranking', 'คะแนนถ่วงน้ำหนัก: Rank A=5, B=3, C=1, เกิน SLA +2')}
                <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:22px">
                    <tr style="background:#065f46;color:#fff">
                        <th style="padding:8px;text-align:center">#</th>
                        <th style="padding:8px;text-align:left">Department</th>
                        <th style="padding:8px;text-align:center">Score</th>
                        <th style="padding:8px;text-align:center">A</th>
                        <th style="padding:8px;text-align:center">B</th>
                        <th style="padding:8px;text-align:center">C</th>
                        <th style="padding:8px;text-align:center">Overdue</th>
                        <th style="padding:8px;text-align:left">Weight</th>
                    </tr>
                    ${deptRiskRows.map((r, i) => {
                        const pct = Math.round((r.score / maxDeptScore) * 100);
                        const color = r.rankA || r.overdue ? '#dc2626' : r.rankB ? '#ea580c' : '#16a34a';
                        return `<tr style="background:${i % 2 ? '#fff' : '#f8fafc'}">
                            <td style="padding:8px;text-align:center;font-weight:800">#${i + 1}</td>
                            <td style="padding:8px;font-weight:700">${escHtml(r.dept)}</td>
                            <td style="padding:8px;text-align:center;font-weight:900;color:${color}">${r.score}</td>
                            <td style="padding:8px;text-align:center;color:#dc2626;font-weight:800">${r.rankA}</td>
                            <td style="padding:8px;text-align:center;color:#ea580c;font-weight:800">${r.rankB}</td>
                            <td style="padding:8px;text-align:center;color:#16a34a;font-weight:800">${r.rankC}</td>
                            <td style="padding:8px;text-align:center;color:#b91c1c;font-weight:800">${r.overdue}</td>
                            <td style="padding:8px">${bar(pct, color)}</td>
                        </tr>`;
                    }).join('')}
                </table>
                ${sectionTitle('Pinned Department Summary')}
                ${deptData.length ? deptData.map(d => {
                    const pct = Math.round((d.count / (reportKpi.total || 1)) * 100);
                    return `<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><b>${escHtml(d.Department)}</b><span>${d.count} (${pct}%)</span></div>${bar(pct, '#f97316')}</div>`;
                }).join('') : `<p style="color:#94a3b8;font-size:12px">No pinned department data.</p>`}
            </div>
            ${footerHtml(3,totalPages)}`);

        const p4 = buildPage(`
            ${headerHtml}
            <div style="padding:24px 32px;flex:1">
                ${sectionTitle('4. Action Follow-up', 'รายการที่เกินกำหนดหรือใกล้ครบกำหนด สำหรับติดตามผลในที่ประชุม')}
                <table style="width:100%;border-collapse:collapse;font-size:9.5px">
                    <tr style="background:#065f46;color:#fff">
                        <th style="padding:7px;text-align:left">Date</th>
                        <th style="padding:7px;text-align:left">Department / Reporter</th>
                        <th style="padding:7px;text-align:center">Rank</th>
                        <th style="padding:7px;text-align:left">Stop</th>
                        <th style="padding:7px;text-align:left">Description</th>
                        <th style="padding:7px;text-align:right">SLA</th>
                    </tr>
                    ${overdueRows.length ? overdueRows.map(({ report: r, sla }, i) => {
                        const rank = r.Rank || ({ Critical: 'A', High: 'B', Medium: 'C', Low: 'C' }[r.RiskLevel]) || '-';
                        const st = STOP_TYPES.find(s => s.id === Number(r.StopType));
                        const color = sla.overdue ? '#dc2626' : '#d97706';
                        const date = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
                        return `<tr style="background:${i % 2 ? '#fff' : '#f8fafc'}">
                            <td style="padding:7px;color:#64748b">${date}</td>
                            <td style="padding:7px"><b>${escHtml(r.Department || '-')}</b><div style="font-size:8.5px;color:#64748b">${escHtml(r.ReporterName || '-')}</div></td>
                            <td style="padding:7px;text-align:center;font-weight:900;color:${rank === 'A' ? '#dc2626' : rank === 'B' ? '#ea580c' : '#16a34a'}">${rank}</td>
                            <td style="padding:7px;color:${st?.color || '#64748b'};font-weight:700">${st?.code || '-'}</td>
                            <td style="padding:7px;color:#334155">${escHtml(String(r.Description || '-').slice(0, 72))}</td>
                            <td style="padding:7px;text-align:right;font-weight:900;color:${color}">${sla.overdue ? `Over ${Math.abs(sla.remaining)}d` : `Due ${sla.remaining}d`}</td>
                        </tr>`;
                    }).join('') : `<tr><td colspan="6" style="padding:24px;text-align:center;color:#94a3b8">No overdue or near-due action items.</td></tr>`}
                </table>
                <div style="margin-top:18px;border:1px solid #e2e8f0;border-radius:12px;padding:14px">
                    <div style="font-size:12px;font-weight:800;color:#065f46;margin-bottom:6px">Management Attention Required</div>
                    <div style="font-size:10.5px;color:#334155;line-height:1.7">
                        1. Review overdue Rank A/B items first.<br>
                        2. Confirm owner and corrective action for departments with high weighted score.<br>
                        3. Monitor Stop Type concentration and assign prevention actions where repeated patterns appear.
                    </div>
                </div>
            </div>
            ${footerHtml(4,totalPages)}`);

        const { jsPDF } = jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        for (const [i, el] of [p1, p2, p3, p4].entries()) {
            const canvas = await html2canvas(el, { scale: 1.5, useCORS: true, logging: false });
            if (i > 0) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
            document.body.removeChild(el);
        }

        const fname = `Hiyari_${_statsYear}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.pdf`;
        pdf.save(fname);
        showToast('Export PDF สำเร็จ', 'success');
    } catch (err) {
        console.error('Hiyari PDF error:', err);
        showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Export PDF'; }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: SUBMIT FORM — 3-Step Wizard
// ─────────────────────────────────────────────────────────────────────────────
function renderSubmitForm(container) {
    _wizardStep = 1;
    const user  = TSHSession.getUser() || {};
    const today = new Date().toISOString().split('T')[0];

    const stepDefs = [
        { n:1, label:'ประเภทอันตราย' },
        { n:2, label:'รายละเอียด' },
        { n:3, label:'ส่งรายงาน' },
    ];

    container.innerHTML = `
    <div class="w-full space-y-4">

        <!-- ── Progress indicator ── -->
        <div class="ds-section p-5 md:p-6">
            <div class="flex items-center gap-0">
                ${stepDefs.map((s, idx) => `
                <div class="flex items-center ${idx < 2 ? 'flex-1' : ''}">
                    <div class="flex flex-col items-center">
                        <div id="wz-circle-${s.n}" class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${s.n === 1 ? 'text-white' : 'bg-slate-100 text-slate-400'}"
                             style="${s.n === 1 ? 'background:linear-gradient(135deg,#f97316,#ef4444)' : ''}">${s.n}</div>
                        <span id="wz-label-${s.n}" class="text-[10px] mt-1 font-semibold whitespace-nowrap ${s.n === 1 ? 'text-orange-600' : 'text-slate-400'}">${s.label}</span>
                    </div>
                    ${idx < 2 ? `<div id="wz-line-${s.n}" class="flex-1 h-1 rounded-full mx-2 transition-all bg-slate-200"></div>` : ''}
                </div>`).join('')}
            </div>
        </div>

        <!-- ── Form shell (single <form> wraps all steps so FormData works) ── -->
        <div class="ds-section overflow-hidden w-full">
            <div class="h-1.5 w-full" style="background:linear-gradient(90deg,#f97316,#ef4444)"></div>
            <div class="p-5 md:p-8">
            <form id="hiyari-form">

            <!-- ════ STEP 1: ประเภทอันตราย ════ -->
            <div id="wizard-step-1" class="space-y-5">
                <div class="flex items-center gap-2.5 mb-1">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-800 text-sm">เลือกประเภทอันตรายที่พบ</h3>
                        <p class="text-xs text-slate-400 mt-0.5">เลือกประเภทอันตรายและระดับความรุนแรงก่อน เพื่อช่วยกำหนด SLA การดำเนินการ</p>
                    </div>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">ประเภทอันตราย (Stop Type) <span class="text-red-500">*</span></label>
                    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
                        ${STOP_TYPES.map(st => `
                        <label class="cursor-pointer">
                            <input type="radio" name="StopType" value="${st.id}" class="peer hidden">
                            <div class="h-full min-h-[118px] rounded-xl border-2 p-3 transition-all peer-checked:ring-2 peer-checked:ring-orange-400 peer-checked:border-orange-300"
                                 style="background:${st.bg};border-color:${st.border}">
                                <div class="flex items-center gap-1.5 mb-1">
                                    <svg class="w-3.5 h-3.5 flex-shrink-0" style="color:${st.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${st.icon}"/>
                                    </svg>
                                    <p class="text-xs font-black" style="color:${st.color}">${st.code}</p>
                                </div>
                                <p class="text-[10px] text-slate-600 leading-relaxed">${st.label}</p>
                            </div>
                        </label>`).join('')}
                    </div>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">ระดับความรุนแรง (Rank) <span class="text-red-500">*</span></label>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                        ${RANKS.map(r => `
                        <label class="cursor-pointer">
                            <input type="radio" name="Rank" value="${r.rank}" class="peer hidden">
                            <div class="h-full min-h-[104px] rounded-xl border-2 p-3 transition-all peer-checked:ring-2 peer-checked:ring-orange-400 peer-checked:border-orange-300"
                                 style="background:${r.bg};border-color:${r.border}">
                                <div class="flex items-center justify-between mb-1">
                                    <p class="text-xs font-black" style="color:${r.color}">${r.label}</p>
                                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style="background:${r.color}22;color:${r.color}">${r.detail}</span>
                                </div>
                                <p class="text-[10px] text-slate-600">${r.desc}</p>
                            </div>
                        </label>`).join('')}
                    </div>
                </div>
                <div class="flex justify-end pt-3 border-t border-slate-100">
                    <button type="button" id="wz-next-1" class="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        ถัดไป
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- ════ STEP 2: รายละเอียด ════ -->
            <div id="wizard-step-2" class="hidden space-y-4">
                <div class="flex items-center gap-2.5 mb-1">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-800 text-sm">รายละเอียดเหตุการณ์</h3>
                        <p class="text-xs text-slate-400 mt-0.5">ระบุวันที่ สถานที่ และรายละเอียดของเหตุการณ์ที่พบ</p>
                    </div>
                </div>
                <div class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                         style="background:linear-gradient(135deg,#f97316,#ef4444)">${escHtml((user.name || '?')[0])}</div>
                    <div class="min-w-0">
                        <p class="font-semibold text-slate-800 text-sm truncate">${escHtml(user.name || '-')}</p>
                        <p class="text-xs text-slate-400">${escHtml(user.department || '-')}</p>
                    </div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div class="lg:col-span-3">
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Created Date <span class="text-red-500">*</span></label>
                        <input type="date" name="ReportDate" class="form-input w-full rounded-xl text-sm" value="${today}" max="${today}">
                    </div>
                    <div class="lg:col-span-9">
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">สถานที่เกิดเหตุ</label>
                        <input type="text" name="Location" class="form-input w-full rounded-xl text-sm" placeholder="โรงงาน / แผนก / เครื่องจักร...">
                    </div>
                </div>
                <div class="grid grid-cols-1 xl:grid-cols-12 gap-3">
                    <div class="xl:col-span-8">
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">รายละเอียดเหตุการณ์ <span class="text-red-500">*</span></label>
                    <textarea name="Description" rows="4" id="wz-description"
                              class="form-input w-full rounded-xl text-sm resize-none"
                              placeholder="อธิบายสิ่งที่เกิดขึ้นหรือเกือบเกิดขึ้นอย่างละเอียด เช่น ขณะทำอะไร เกิดอะไรขึ้น มีใครอยู่ด้วยหรือไม่..."></textarea>
                    </div>
                    <div class="xl:col-span-4">
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ผลที่อาจเกิดขึ้น</label>
                    <select name="PotentialConsequence" class="form-select w-full rounded-xl text-sm">
                        <option value="">-- เลือก --</option>
                        ${CONSEQUENCES.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <div class="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs text-orange-800">
                        เลือกผลกระทบที่ใกล้เคียงที่สุด เพื่อให้ทีม Safety วิเคราะห์ความเสี่ยงและแนวโน้มได้แม่นยำขึ้น
                    </div>
                    </div>
                </div>
                <div class="flex justify-between pt-3 border-t border-slate-100">
                    <button type="button" id="wz-back-2" class="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                        </svg>
                        ย้อนกลับ
                    </button>
                    <button type="button" id="wz-next-2" class="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        ถัดไป
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- ════ STEP 3: ข้อเสนอแนะ + ไฟล์ ════ -->
            <div id="wizard-step-3" class="hidden space-y-4">
                <div class="flex items-center gap-2.5 mb-1">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-800 text-sm">ข้อเสนอแนะ & ไฟล์แนบ</h3>
                        <p class="text-xs text-slate-400 mt-0.5">ระบุข้อเสนอแนะเพื่อป้องกัน และตรวจสอบข้อมูลก่อนส่ง</p>
                    </div>
                </div>
                <!-- Forms download card — injected by JS after load -->
                <div id="hiyari-forms-user-card"></div>
                <div class="grid grid-cols-1 xl:grid-cols-12 gap-3">
                    <div class="xl:col-span-7">
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ข้อเสนอแนะ / แนวทางปรับปรุง</label>
                    <textarea name="Suggestion" rows="3"
                              class="form-input w-full rounded-xl text-sm resize-none"
                              placeholder="ข้อเสนอแนะเพื่อป้องกันไม่ให้เกิดซ้ำ เช่น ปรับปรุง SOP / ซ่อมอุปกรณ์ / เพิ่ม Warning Sign..."></textarea>
                    </div>
                    <div class="xl:col-span-5">
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ไฟล์แนบ (รูปภาพ / เอกสาร)</label>
                    <input type="file" name="attachment" id="hiyari-file"
                           accept=".pdf,.png,.jpg,.jpeg,.webp"
                           class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 transition-all">
                    <p class="text-xs text-slate-400 mt-1">รองรับ JPG, PNG, PDF · ขนาดไม่เกิน 20 MB</p>
                    <div id="hiyari-file-preview" class="mt-3"></div>
                    </div>
                </div>
                <!-- Pre-submit summary -->
                <div id="wz-summary" class="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-2">
                    <p class="font-bold text-orange-800 text-sm mb-2">ตรวจสอบข้อมูลก่อนส่ง</p>
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-700">
                        <div><span class="text-slate-400">Stop Type:</span> <span id="sum-stop" class="font-semibold">-</span></div>
                        <div><span class="text-slate-400">Rank:</span> <span id="sum-rank" class="font-semibold">-</span></div>
                        <div><span class="text-slate-400">วันที่:</span> <span id="sum-date" class="font-semibold">-</span></div>
                        <div><span class="text-slate-400">สถานที่:</span> <span id="sum-location" class="font-semibold">-</span></div>
                        <div class="col-span-2"><span class="text-slate-400">รายละเอียด:</span> <span id="sum-desc" class="font-semibold">-</span></div>
                    </div>
                </div>
                <div class="flex justify-between pt-3 border-t border-slate-100">
                    <button type="button" id="wz-back-3" class="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                        </svg>
                        ย้อนกลับ
                    </button>
                    <button type="submit" id="hiyari-submit-btn"
                            class="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                        </svg>
                        ส่งรายงาน
                    </button>
                </div>
            </div>

            </form>
            </div>
        </div>
    </div>`;

    // ── Wizard step controller ─────────────────────────────────────────────────
    function _wzGo(toStep) {
        _wizardStep = toStep;
        [1, 2, 3].forEach(n => {
            const stepEl   = document.getElementById(`wizard-step-${n}`);
            const circleEl = document.getElementById(`wz-circle-${n}`);
            const labelEl  = document.getElementById(`wz-label-${n}`);
            const lineEl   = document.getElementById(`wz-line-${n}`);
            if (stepEl)   stepEl.classList.toggle('hidden', n !== toStep);
            if (circleEl) {
                const done   = n < toStep;
                const active = n === toStep;
                circleEl.style.background = active ? 'linear-gradient(135deg,#f97316,#ef4444)' : done ? '#f97316' : '';
                circleEl.className = `w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${active || done ? 'text-white' : 'bg-slate-100 text-slate-400'}`;
                circleEl.innerHTML = done
                    ? `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>`
                    : String(n);
            }
            if (labelEl)  labelEl.className = `text-[10px] mt-1 font-semibold whitespace-nowrap ${n === toStep ? 'text-orange-600' : n < toStep ? 'text-orange-400' : 'text-slate-400'}`;
            if (lineEl)   lineEl.style.background = n < toStep ? '#f97316' : '#e2e8f0';
        });
    }

    // Step 1 → 2
    document.getElementById('wz-next-1')?.addEventListener('click', () => {
        const form = document.getElementById('hiyari-form');
        if (!form?.querySelector('input[name="StopType"]:checked')?.value) { showToast('กรุณาเลือกประเภทอันตราย (Stop Type)', 'error'); return; }
        if (!form?.querySelector('input[name="Rank"]:checked')?.value)     { showToast('กรุณาเลือกระดับความรุนแรง (Rank)', 'error'); return; }
        _wzGo(2);
    });

    // Step 2 ↔ 1
    document.getElementById('wz-back-2')?.addEventListener('click', () => _wzGo(1));

    // Step 2 → 3 (validate + populate summary)
    document.getElementById('wz-next-2')?.addEventListener('click', () => {
        const desc = document.getElementById('wz-description')?.value.trim();
        if (!desc) { showToast('กรุณากรอกรายละเอียดเหตุการณ์', 'error'); return; }
        const form     = document.getElementById('hiyari-form');
        const stopVal  = form?.querySelector('input[name="StopType"]:checked')?.value;
        const rankVal  = form?.querySelector('input[name="Rank"]:checked')?.value;
        const dateVal  = form?.querySelector('input[name="ReportDate"]')?.value;
        const locVal   = form?.querySelector('input[name="Location"]')?.value.trim();
        const stopMeta = STOP_TYPES.find(s => String(s.id) === String(stopVal));
        const rankMeta = RANKS.find(r => r.rank === rankVal);
        const el = id => document.getElementById(id);
        if (el('sum-stop'))  el('sum-stop').textContent  = stopMeta ? `${stopMeta.code} — ${stopMeta.label}` : '-';
        if (el('sum-rank'))  el('sum-rank').textContent  = rankMeta ? `${rankMeta.label} (${rankMeta.detail})` : '-';
        if (el('sum-date'))  el('sum-date').textContent  = dateVal ? new Date(dateVal).toLocaleDateString('th-TH',{ day:'numeric', month:'long', year:'numeric' }) : '-';
        if (el('sum-location')) el('sum-location').textContent = locVal || 'ไม่ระบุ';
        if (el('sum-desc'))  el('sum-desc').textContent  = desc;
        _wzGo(3);
    });

    // Step 3 → 2
    document.getElementById('wz-back-3')?.addEventListener('click', () => _wzGo(2));

    // ── Load and inject active forms card ─────────────────────────────────────
    _loadHiyariForms(false).then(forms => {
        const cardEl = document.getElementById('hiyari-forms-user-card');
        if (cardEl) cardEl.innerHTML = _renderHiyariFormsUserCard(forms);
    });

    // ── Image / file preview ───────────────────────────────────────────────────
    document.getElementById('hiyari-file')?.addEventListener('change', function () {
        const preview = document.getElementById('hiyari-file-preview');
        if (!preview) return;
        const file = this.files[0];
        if (!file) { preview.innerHTML = ''; return; }
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            preview.innerHTML = `
            <div class="relative inline-block">
                <img src="${url}" class="w-32 h-32 rounded-xl object-cover border-2 border-orange-200 shadow-sm">
                <button type="button" id="clear-preview"
                        class="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold flex items-center justify-center hover:bg-red-600 transition-colors">×</button>
            </div>`;
        } else {
            preview.innerHTML = `
            <div class="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                <svg class="w-5 h-5 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <span class="text-xs text-slate-600 max-w-[200px] truncate">${escHtml(file.name)}</span>
                <button type="button" id="clear-preview" class="text-slate-400 hover:text-red-500 font-bold transition-colors ml-1">×</button>
            </div>`;
        }
        document.getElementById('clear-preview')?.addEventListener('click', () => {
            this.value = '';
            preview.innerHTML = '';
        });
    });

    // ── Final submit ───────────────────────────────────────────────────────────
    document.getElementById('hiyari-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form     = e.target;
        const stopType = form.querySelector('input[name="StopType"]:checked')?.value;
        const rank     = form.querySelector('input[name="Rank"]:checked')?.value;
        const desc     = form.querySelector('textarea[name="Description"]')?.value.trim();
        if (!stopType || !rank || !desc) {
            showToast('ข้อมูลไม่ครบ — กรุณาย้อนกลับและตรวจสอบ', 'error'); return;
        }
        const btn = document.getElementById('hiyari-submit-btn');
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span> กำลังส่ง...`;
        try {
            showLoading('กำลังส่งรายงาน...');
            await API.post('/hiyari', new FormData(form));
            showToast('ส่งรายงาน Hiyari-Hatto สำเร็จ', 'success');
            form.reset();
            const prev = document.getElementById('hiyari-file-preview');
            if (prev) prev.innerHTML = '';
            _wzGo(1);
            await _loadHeroStats();
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
            <div class="ds-filter-bar space-y-3">
                <div class="flex flex-wrap gap-2 items-center">
                    ${buildFilterSelect('filter-status', 'สถานะ', [
                        { v:'all', l:'ทุกสถานะ' },
                        ...STATUSES.map(s => ({ v:s, l: STATUS_LABEL[s] || s }))
                    ], _filterStatus)}
                    ${buildFilterSelect('filter-risk', 'Rank', [
                        { v:'all',      l:'ทุก Rank' },
                        { v:'Critical', l:'Rank A (Critical)' },
                        { v:'High',     l:'Rank B (High)' },
                        { v:'Low',      l:'Rank C (Low)' },
                    ], _filterRisk)}
                    ${buildFilterSelect('filter-dept', 'แผนก', [
                        { v:'all', l:'ทุกแผนก' },
                        ..._departments.map(d => ({ v:d, l:d }))
                    ], _filterDept)}
                    ${buildFilterSelect('history-year', 'ปี', [
                        { v:'', l:'ทุกปี' },
                        ...[0,1,2].map(i => { const y = new Date().getFullYear() - i; return { v:String(y), l:String(y) }; })
                    ], _historyYear)}
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    <div class="relative flex-1 min-w-[180px]">
                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input id="history-search" type="text" placeholder="ค้นหาชื่อ, สถานที่, รายละเอียด..."
                               value="${_searchQ}"
                               class="form-input w-full pl-9 text-sm py-2">
                    </div>
                    <button id="hiyari-export-btn"
                        class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-orange-200 text-orange-700 bg-white hover:bg-orange-50 transition-all flex-shrink-0">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M12 10v6m0 0l-3-3m3 3l3-3M4 17v1a2 2 0 002 2h12a2 2 0 002-2v-1M7 7l4.586-4.586a2 2 0 012.828 0L19 7"/>
                        </svg>
                        Export Excel
                    </button>
                </div>
            </div>
            <!-- Table -->
            <div class="ds-table-wrap">
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">วันที่</th>
                                <th class="px-4 py-3">ผู้รายงาน</th>
                                <th class="px-4 py-3">แผนก</th>
                                <th class="px-4 py-3">Stop Type</th>
                                <th class="px-4 py-3">Rank</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="history-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="7" class="text-center py-8 text-slate-400">
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
        if (_filterDept   !== 'all') params.set('dept',   _filterDept);
        if (_historyYear)            params.set('year',   _historyYear);
        if (_searchQ.trim())         params.set('q',      _searchQ.trim());

        const res = await API.get(`/hiyari?${params}`);
        _reports  = normalizeApiArray(res?.data ?? res);
        renderTable();
    } catch (err) {
        console.error('History error:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500 text-sm">เกิดข้อผิดพลาด: ${escHtml(err.message)}</td></tr>`;
    }
}

function renderTable() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    if (!_reports.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400 text-sm">ไม่พบรายงาน</td></tr>`;
        return;
    }

    tbody.innerHTML = _reports.map(r => {
        const date  = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
        const st    = STOP_TYPES.find(s => s.id === Number(r.StopType));
        const rankR = RANKS.find(x => x.rank === r.Rank);
        const sla   = _getSLA(r);
        const rowStyle = _getSLARowStyle(sla);
        return `
        <tr class="transition-colors group" style="${rowStyle}">
            <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">${date}</td>
            <td class="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">${escHtml(r.ReporterName || '-')}</td>
            <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">${escHtml(r.Department || '-')}</td>
            <td class="px-4 py-3">
                ${st
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                              style="background:${st.bg};color:${st.color};border:1px solid ${st.border}">${st.code}</span>`
                    : `<span class="text-xs text-slate-400">-</span>`}
            </td>
            <td class="px-4 py-3">
                ${rankR
                    ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RANK_BADGE[rankR.rank]}">${rankR.label}</span>`
                    : (r.RiskLevel
                        ? dsStatusBadge(r.RiskLevel || '-', { label: RISK_LABEL[r.RiskLevel] || r.RiskLevel || '-' })
                        : `<span class="text-xs text-slate-400">-</span>`)}
            </td>
            <td class="px-4 py-3">
                ${dsStatusBadge(r.Status || '-', { label: STATUS_LABEL[r.Status] || r.Status || '-' })}
                ${_buildSLABadge(sla)}
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
                <button class="btn-view-report px-3 py-1 rounded-lg text-xs font-semibold text-orange-600 hover:bg-orange-50 transition-colors"
                        data-id="${r.id}">ดูรายละเอียด</button>
                ${_isAdmin ? `
                    <button class="btn-manage-report px-3 py-1 rounded-lg text-xs font-semibold text-white transition-all ml-1"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)"
                            data-id="${r.id}">แก้ไข</button>
                    <button class="btn-delete-report p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-1"
                            data-id="${r.id}" data-name="${escHtml(r.ReporterName || '')}" title="ลบ">
                        <svg class="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: ADMIN MANAGE
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MODULE FORMS — shared helpers
// ─────────────────────────────────────────────────────────────────────────────
function _formFileIcon(mime) {
    if (!mime) return '📄';
    if (mime.includes('pdf'))   return '📕';
    if (mime.includes('word') || mime.includes('officedocument.wordprocessing')) return '📘';
    if (mime.includes('excel') || mime.includes('spreadsheetml')) return '📗';
    if (mime.startsWith('image/')) return '🖼';
    return '📄';
}

function _formFileLabel(mime) {
    if (!mime) return 'ไฟล์';
    if (mime.includes('pdf'))   return 'PDF';
    if (mime.includes('word') || mime.includes('officedocument.wordprocessing')) return 'Word';
    if (mime.includes('excel') || mime.includes('spreadsheetml')) return 'Excel';
    if (mime.startsWith('image/')) return 'รูปภาพ';
    return 'ไฟล์';
}

async function _loadHiyariForms(adminAll = false) {
    try {
        const url = adminAll ? '/module-forms?module=hiyari&all=1' : '/module-forms?module=hiyari';
        const res = await API.get(url);
        _hiyariForms = normalizeApiArray(res?.data ?? res);
    } catch { _hiyariForms = []; }
    return _hiyariForms;
}

function _renderHiyariFormsManage() {
    const forms = _hiyariForms;
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
                <td class="px-4 py-3 text-xs text-slate-500">${_formFileLabel(f.FileType)}</td>
                <td class="px-4 py-3">
                    ${f.IsActive
                        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>ใช้งาน</span>`
                        : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>ปิดใช้งาน</span>`}
                </td>
                <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">${new Date(f.UploadedAt).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                    <a href="${escHtml(f.FileUrl)}" target="_blank" class="px-3 py-1 rounded-lg text-xs font-semibold text-sky-600 hover:bg-sky-50 transition-colors inline-block">ดูไฟล์</a>
                    <button class="hiyari-form-toggle px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${f.IsActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}"
                            data-id="${f.id}" data-active="${f.IsActive}">${f.IsActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
                    <button class="hiyari-form-delete p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-0.5"
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

    const el = document.getElementById('hiyari-forms-tbody');
    if (el) el.innerHTML = rows;
}

function _openHiyariFormUploadModal() {
    const html = `
    <div class="space-y-4 p-1">
        <form id="hiyari-form-upload-form" class="space-y-3">
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">ชื่อแบบฟอร์ม <span class="text-red-500">*</span></label>
                <input type="text" id="hff-title" class="form-input w-full rounded-xl text-sm" placeholder="เช่น แบบฟอร์มรายงาน Hiyari-Hatto" maxlength="200">
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">เวอร์ชั่น</label>
                    <input type="text" id="hff-version" class="form-input w-full rounded-xl text-sm" placeholder="เช่น v1.0" maxlength="30">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">ลำดับแสดง</label>
                    <input type="number" id="hff-sort" class="form-input w-full rounded-xl text-sm" placeholder="99" min="0" max="999">
                </div>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">คำอธิบาย</label>
                <textarea id="hff-desc" rows="2" class="form-input w-full rounded-xl text-sm resize-none" placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"></textarea>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">ไฟล์แบบฟอร์ม <span class="text-red-500">*</span></label>
                <input type="file" id="hff-file"
                       accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                       class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 transition-all">
                <p class="text-xs text-slate-400 mt-1">รองรับ PDF, Word, Excel, รูปภาพ · ขนาดไม่เกิน 20 MB</p>
            </div>
        </form>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button onclick="window.closeModal&&window.closeModal()" class="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">ยกเลิก</button>
            <button id="hff-submit-btn" class="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                    style="background:linear-gradient(135deg,#f97316,#ef4444)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
                อัปโหลดแบบฟอร์ม
            </button>
        </div>
    </div>`;
    openModal('เพิ่มแบบฟอร์ม Hiyari', html, 'max-w-lg');
    document.getElementById('hff-submit-btn')?.addEventListener('click', async () => {
        const title = document.getElementById('hff-title')?.value.trim();
        const fileEl = document.getElementById('hff-file');
        if (!title) { showToast('กรุณาระบุชื่อแบบฟอร์ม', 'error'); return; }
        if (!fileEl?.files?.length) { showToast('กรุณาเลือกไฟล์', 'error'); return; }
        const btn = document.getElementById('hff-submit-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังอัปโหลด...'; }
        try {
            const fd = new FormData();
            fd.append('module', 'hiyari');
            fd.append('title', title);
            fd.append('description', document.getElementById('hff-desc')?.value.trim() || '');
            fd.append('version', document.getElementById('hff-version')?.value.trim() || '');
            fd.append('sortOrder', document.getElementById('hff-sort')?.value || '99');
            fd.append('formFile', fileEl.files[0]);
            await API.post('/module-forms', fd);
            closeModal();
            showToast('อัปโหลดแบบฟอร์มสำเร็จ', 'success');
            await _loadHiyariForms(true);
            _renderHiyariFormsManage();
        } catch (err) {
            showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>อัปโหลดแบบฟอร์ม'; }
        }
    });
}

function _renderHiyariFormsUserCard(forms) {
    const active = forms.filter(f => f.IsActive);
    if (!active.length) return '';
    return `
    <div class="rounded-xl border border-orange-200 bg-orange-50 p-4">
        <div class="flex items-center gap-2 mb-3">
            <svg class="w-4 h-4 text-orange-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <span class="text-sm font-bold text-orange-800">แบบฟอร์มที่ต้องกรอกและแนบ</span>
        </div>
        <p class="text-xs text-orange-700 mb-3">กรุณาดาวน์โหลดแบบฟอร์ม กรอกข้อมูล และนำมาแนบในช่องไฟล์แนบด้านล่าง</p>
        <div class="space-y-2">
            ${active.map(f => `
            <div class="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-orange-100 gap-3">
                <div class="flex items-center gap-2.5 min-w-0">
                    <span class="text-base flex-shrink-0">${_formFileIcon(f.FileType)}</span>
                    <div class="min-w-0">
                        <div class="text-sm font-semibold text-slate-800 truncate">${escHtml(f.Title)}</div>
                        <div class="text-xs text-slate-400">${_formFileLabel(f.FileType)}${f.Version ? ` · ${escHtml(f.Version)}` : ''}</div>
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
                       class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-orange-600 hover:bg-orange-100 border border-orange-200 transition-colors">
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
    container.innerHTML = `
        <div class="space-y-5">

            <!-- ── Assignment section ── -->
            <div class="ds-section p-5">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">รายการมอบหมาย</h3>
                        <p class="text-xs text-slate-400 mt-0.5">กำหนดพนักงานที่ต้องรายงาน Hiyari-Hatto</p>
                    </div>
                    <button id="btn-add-assignment"
                        class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                        style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        เพิ่มรายการ
                    </button>
                </div>
                <div id="assignment-progress"></div>
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">ชื่อ-นามสกุล</th>
                                <th class="px-4 py-3">รหัสพนักงาน</th>
                                <th class="px-4 py-3">แผนก</th>
                                <th class="px-4 py-3">วันกำหนดส่ง</th>
                                <th class="px-4 py-3">หมายเหตุ</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="assignments-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="7" class="text-center py-6 text-slate-400">
                                <div class="animate-spin inline-block h-5 w-5 border-4 border-orange-400 border-t-transparent rounded-full mb-1.5"></div>
                                <div class="text-sm">กำลังโหลด...</div>
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- ── Forms management section ── -->
            <div class="ds-section">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">แบบฟอร์มที่เกี่ยวข้อง</h3>
                        <p class="text-xs text-slate-400 mt-0.5">จัดการแบบฟอร์มที่ผู้ใช้ต้องดาวน์โหลดและกรอก</p>
                    </div>
                    <button id="btn-add-hiyari-form"
                        class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                        style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        เพิ่มแบบฟอร์ม
                    </button>
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
                        <tbody id="hiyari-forms-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="6" class="text-center py-6 text-slate-400">
                                <div class="animate-spin inline-block h-5 w-5 border-4 border-orange-400 border-t-transparent rounded-full mb-1.5"></div>
                                <div class="text-sm">กำลังโหลด...</div>
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

    await Promise.all([
        loadAndRenderAssignments(),
        _loadHiyariForms(true).then(() => _renderHiyariFormsManage()),
    ]);

    document.getElementById('btn-add-hiyari-form')?.addEventListener('click', _openHiyariFormUploadModal);

    document.querySelector('#hiyari-forms-tbody')?.addEventListener('click', async e => {
        const toggleBtn = e.target.closest('.hiyari-form-toggle');
        const deleteBtn = e.target.closest('.hiyari-form-delete');

        if (toggleBtn) {
            const id = toggleBtn.dataset.id;
            const isActive = toggleBtn.dataset.active === '1' || toggleBtn.dataset.active === 'true' || toggleBtn.dataset.active === 1;
            const form = _hiyariForms.find(f => String(f.id) === String(id));
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
                await _loadHiyariForms(true);
                _renderHiyariFormsManage();
            } catch (err) { showToast(err.message || 'เกิดข้อผิดพลาด', 'error'); }
        }

        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            const title = deleteBtn.dataset.title;
            showConfirmationModal(`ลบแบบฟอร์ม "${title}" ใช่หรือไม่?`, async () => {
                try {
                    await API.delete(`/module-forms/${id}`);
                    showToast('ลบแบบฟอร์มสำเร็จ', 'success');
                    await _loadHiyariForms(true);
                    _renderHiyariFormsManage();
                } catch (err) { showToast(err.message || 'เกิดข้อผิดพลาด', 'error'); }
            });
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENTS — load + render
// ─────────────────────────────────────────────────────────────────────────────
async function loadAndRenderAssignments() {
    const tbody = document.getElementById('assignments-tbody');
    if (!tbody) return;
    try {
        const period = _getAssignmentPeriod();
        const [assignRes, reportRes] = await Promise.all([
            API.get('/hiyari/assignments'),
            API.get(`/hiyari?year=${period.year}`).catch(() => ({ data: [] })),
        ]);
        _assignments = normalizeApiArray(assignRes?.data ?? assignRes);
        const periodReports = normalizeApiArray(reportRes?.data ?? reportRes);
        const progress = _buildAssignmentProgress(_assignments, periodReports);
        _renderAssignmentProgress(progress);

        if (!_assignments.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 text-sm">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/>
                    </svg>
                </div>
                ยังไม่มีรายการมอบหมาย
            </td></tr>`;
            return;
        }

        tbody.innerHTML = _assignments.map(a => {
            const due = a.DueDate ? new Date(a.DueDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            const submitted = progress.submittedIds.has(String(a.EmployeeID || '').trim());
            const statusHtml = submitted
                ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>ส่งแล้ว</span>`
                : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>ยังไม่ส่ง</span>`;
            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 font-medium text-slate-800">${escHtml(a.AssigneeName || '-')}</td>
                <td class="px-4 py-3 text-slate-500 text-xs">${escHtml(a.EmployeeID || '-')}</td>
                <td class="px-4 py-3 text-slate-600 text-xs">${escHtml(a.Department || '-')}</td>
                <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${due}</td>
                <td class="px-4 py-3 text-slate-400 text-xs max-w-[160px] truncate">${escHtml(a.Note || '-')}</td>
                <td class="px-4 py-3 whitespace-nowrap">${statusHtml}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                    <button class="btn-edit-assignment px-3 py-1 rounded-lg text-xs font-semibold text-orange-600 hover:bg-orange-50 transition-colors"
                            data-id="${a.id}">แก้ไข</button>
                    <button class="btn-delete-assignment p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-1"
                            data-id="${a.id}" data-name="${escHtml(a.AssigneeName || '')}" title="ลบ">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('Assignments fetch error:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-red-500 text-sm">เกิดข้อผิดพลาด: ${escHtml(err.message)}</td></tr>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENT MODAL (Add / Edit)
// ─────────────────────────────────────────────────────────────────────────────

// Fetch all employees from master once and cache
async function _loadEmpCache() {
    if (_empCache) return _empCache;
    try {
        const res  = await API.get('/employees');
        _empCache  = (res?.data || res || []).filter(e => e.EmployeeID);
    } catch { _empCache = []; }
    return _empCache;
}

// Fetch master positions once and cache (Name field)
async function _loadPosCache() {
    if (_posCache) return _posCache;
    try {
        const res = await API.get('/master/positions');
        _posCache = (res?.data || res || []).map(p => (p.Name || '').trim()).filter(Boolean).sort();
    } catch { _posCache = []; }
    return _posCache;
}

// Ensure master departments are loaded (already fetched on page load — this is a safe fallback)
async function _fetchDepartments() {
    if (_departments.length) return _departments;
    try {
        const res = await API.get('/master/departments');
        _departments = normalizeApiArray(res?.data ?? res).map(d => (d.Name || d.name || '').trim()).filter(Boolean);
    } catch { _departments = []; }
    return _departments;
}

// Shared submit handler for both Add and Edit
function _attachAssignmentFormSubmit(assignment) {
    const isEdit = !!assignment;
    document.getElementById('assignment-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd  = new FormData(e.target);
        const btn = document.getElementById('assignment-save-btn');
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span> กำลังบันทึก...`;

        const payload = {
            AssigneeName: fd.get('AssigneeName') || null,
            EmployeeID:   fd.get('EmployeeID')   || null,
            Department:   fd.get('Department')   || null,
            DueDate:      fd.get('DueDate')      || null,
            Note:         fd.get('Note')         || null,
        };

        try {
            if (isEdit) {
                await API.put(`/hiyari/assignments/${assignment.id}`, payload);
                showToast('แก้ไขรายการสำเร็จ', 'success');
            } else {
                await API.post('/hiyari/assignments', payload);
                showToast('เพิ่มรายการสำเร็จ', 'success');
            }
            closeModal();
            await loadAndRenderAssignments();
            await _loadHeroStats();
        } catch (err) {
            showError(err);
            btn.disabled = false;
            btn.textContent = isEdit ? 'บันทึก' : 'เพิ่ม';
        }
    });
}

function openAssignmentModal(assignment = null) {
    const isEdit = !!assignment;

    // ── EDIT MODE ────────────────────────────────────────────────────────────
    if (isEdit) {
        const html = `
        <div class="space-y-4 px-1">
            <div class="bg-orange-50 border border-orange-100 rounded-xl p-3 flex gap-2.5 text-sm text-orange-800">
                <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                แก้ไขข้อมูลรายการมอบหมาย
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm font-bold"
                     style="background:linear-gradient(135deg,#f97316,#ef4444)">
                    ${escHtml((assignment.AssigneeName || '?')[0])}
                </div>
                <div class="min-w-0">
                    <p class="font-semibold text-slate-800 text-sm">${escHtml(assignment.AssigneeName || '-')}</p>
                    <p class="text-xs text-slate-500">${[assignment.Department, assignment.EmployeeID].filter(Boolean).map(escHtml).join(' · ') || '-'}</p>
                </div>
            </div>
            <form id="assignment-form" class="space-y-3">
                <input type="hidden" name="EmployeeID"   value="${escHtml(assignment.EmployeeID   || '')}">
                <input type="hidden" name="AssigneeName" value="${escHtml(assignment.AssigneeName || '')}">
                <input type="hidden" name="Department"   value="${escHtml(assignment.Department   || '')}">
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">วันกำหนดส่ง</label>
                    <input type="date" name="DueDate" class="form-input w-full rounded-xl text-sm"
                           value="${assignment.DueDate ? assignment.DueDate.split('T')[0] : ''}">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">หมายเหตุ</label>
                    <textarea name="Note" rows="2" class="form-input w-full rounded-xl text-sm resize-none"
                              placeholder="รายละเอียดเพิ่มเติม...">${escHtml(assignment.Note || '')}</textarea>
                </div>
                <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
                    <button type="button" onclick="window.closeModal&&window.closeModal()"
                            class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
                    <button type="submit" id="assignment-save-btn"
                            class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)">บันทึก</button>
                </div>
            </form>
        </div>`;
        openModal('แก้ไขรายการมอบหมาย', html, 'max-w-md');
        _attachAssignmentFormSubmit(assignment);
        return;
    }

    // ── ADD MODE — multi-select with position/dept filters ───────────────────
    const html = `
    <div class="space-y-3 px-1">
        <div class="bg-orange-50 border border-orange-100 rounded-xl p-3 flex gap-2.5 text-sm text-orange-800">
            <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
            </svg>
            เลือกพนักงานจากตำแหน่ง/ส่วนงาน หรือค้นหาชื่อ — เลือกได้ทีละหลายคน
        </div>

        <!-- Filters -->
        <div class="grid grid-cols-2 gap-2">
            <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ตำแหน่ง</label>
                <select id="emp-filter-pos" class="form-select w-full rounded-xl text-sm">
                    <option value="">— ทุกตำแหน่ง —</option>
                </select>
            </div>
            <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ส่วนงาน / แผนก</label>
                <select id="emp-filter-dept" class="form-select w-full rounded-xl text-sm">
                    <option value="">— ทุกส่วนงาน —</option>
                </select>
            </div>
        </div>

        <!-- Search -->
        <div class="relative">
            <div class="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
            </div>
            <input type="text" id="emp-search-input" autocomplete="off"
                   class="form-input w-full rounded-xl text-sm pl-9"
                   placeholder="พิมพ์ชื่อหรือรหัสพนักงาน...">
            <div id="emp-search-spinner" class="hidden absolute inset-y-0 right-3 flex items-center">
                <span class="animate-spin w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full inline-block"></span>
            </div>
        </div>

        <!-- Results header: count + select-all -->
        <div id="emp-results-header" class="hidden flex items-center justify-between px-0.5">
            <p id="emp-result-count" class="text-[11px] text-slate-400"></p>
            <button id="emp-select-all-btn" type="button"
                    class="text-[11px] font-semibold text-orange-600 hover:text-orange-800 transition-colors">
                เลือกทั้งหมด
            </button>
        </div>

        <!-- Results list with checkboxes -->
        <div id="emp-search-results" class="hidden max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100"></div>

        <!-- Selected summary chips -->
        <div id="emp-sel-summary" class="hidden rounded-xl border border-orange-200 bg-orange-50 p-3">
            <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-semibold text-orange-800">
                    เลือกแล้ว <span id="sel-count">0</span> คน
                </span>
                <button id="emp-clear-all" type="button"
                        class="text-[11px] text-slate-400 hover:text-red-500 transition-colors">ล้างทั้งหมด</button>
            </div>
            <div id="sel-chips" class="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto"></div>
        </div>

        <!-- Placeholder -->
        <div id="emp-placeholder" class="py-6 text-center text-slate-400">
            <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                </svg>
            </div>
            <p class="text-sm font-medium">เลือกตำแหน่ง/ส่วนงาน หรือพิมพ์ค้นหา</p>
        </div>

        <!-- Common form fields + submit -->
        <form id="assignment-form" class="space-y-3 border-t border-slate-100 pt-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">วันกำหนดส่ง</label>
                    <input type="date" id="add-due-date" class="form-input w-full rounded-xl text-sm">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">หมายเหตุ</label>
                    <input type="text" id="add-note" class="form-input w-full rounded-xl text-sm"
                           placeholder="หมายเหตุ (ถ้ามี)">
                </div>
            </div>
            <div class="flex justify-end gap-3">
                <button type="button" onclick="window.closeModal&&window.closeModal()"
                        class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
                <button type="submit" id="assignment-save-btn" disabled
                        class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all opacity-50 cursor-not-allowed"
                        style="background:linear-gradient(135deg,#f97316,#ef4444)">
                    เพิ่ม <span id="save-count">0</span> คน
                </button>
            </div>
        </form>
    </div>`;

    openModal('เพิ่มรายการมอบหมาย', html, 'max-w-md');

    // ── State ─────────────────────────────────────────────────────────────────
    const assignedIds  = new Set(_assignments.map(a => a.EmployeeID).filter(Boolean));
    const selectedEmps = new Map(); // EmployeeID → emp object
    let   currentMatches = [];      // current filtered result (for select-all)

    const searchInput   = document.getElementById('emp-search-input');
    const filterPosEl   = document.getElementById('emp-filter-pos');
    const filterDeptEl  = document.getElementById('emp-filter-dept');
    const resultsEl     = document.getElementById('emp-search-results');
    const resultsHdrEl  = document.getElementById('emp-results-header');
    const countEl       = document.getElementById('emp-result-count');
    const selectAllBtn  = document.getElementById('emp-select-all-btn');
    const summaryEl     = document.getElementById('emp-sel-summary');
    const selCountEl    = document.getElementById('sel-count');
    const chipsEl       = document.getElementById('sel-chips');
    const placeholderEl = document.getElementById('emp-placeholder');
    const spinnerEl     = document.getElementById('emp-search-spinner');
    const saveBtn       = document.getElementById('assignment-save-btn');
    const saveCountEl   = document.getElementById('save-count');

    // ── Populate filter dropdowns ─────────────────────────────────────────────
    Promise.all([_loadPosCache(), _fetchDepartments()]).then(([positions]) => {
        positions.forEach(name => {
            filterPosEl.insertAdjacentHTML('beforeend', `<option value="${escHtml(name)}">${escHtml(name)}</option>`);
        });
        _departments.forEach(name => {
            filterDeptEl.insertAdjacentHTML('beforeend', `<option value="${escHtml(name)}">${escHtml(name)}</option>`);
        });
    });

    // ── Selection UI updater ──────────────────────────────────────────────────
    function updateSelectionUI() {
        const count = selectedEmps.size;
        selCountEl.textContent  = count;
        saveCountEl.textContent = count;

        if (count > 0) {
            summaryEl.classList.remove('hidden');
            placeholderEl.classList.add('hidden');
            saveBtn.disabled = false;
            saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            // Render chips
            chipsEl.innerHTML = Array.from(selectedEmps.values()).map(e => `
                <span class="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-orange-200 text-orange-900">
                    ${escHtml(e.EmployeeName || e.EmployeeID)}
                    <button type="button" data-remove="${escHtml(e.EmployeeID)}"
                            class="emp-chip-remove w-3.5 h-3.5 rounded-full hover:bg-orange-400 hover:text-white flex items-center justify-center text-orange-600 flex-shrink-0">×</button>
                </span>`).join('');
            chipsEl.querySelectorAll('.emp-chip-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    selectedEmps.delete(btn.dataset.remove);
                    updateSelectionUI();
                    syncCheckboxes();
                });
            });
        } else {
            summaryEl.classList.add('hidden');
            saveBtn.disabled = true;
            saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
            if (resultsEl.classList.contains('hidden')) placeholderEl.classList.remove('hidden');
        }

        // Update select-all button label
        const available = currentMatches.filter(e => !assignedIds.has(e.EmployeeID));
        const allSel    = available.length > 0 && available.every(e => selectedEmps.has(e.EmployeeID));
        selectAllBtn.textContent = allSel ? 'ยกเลิกทั้งหมด' : `เลือกทั้งหมด (${available.length})`;
    }

    // Sync checkbox states in the visible result list to match selectedEmps
    function syncCheckboxes() {
        resultsEl.querySelectorAll('.emp-cb[data-id]').forEach(cb => {
            cb.checked = selectedEmps.has(cb.dataset.id);
        });
    }

    // ── Render result rows with checkboxes ────────────────────────────────────
    function renderResults(matches, emps) {
        currentMatches = matches;
        const available = matches.filter(e => !assignedIds.has(e.EmployeeID));

        countEl.textContent = matches.length ? `แสดง ${matches.length} คน` : '';
        resultsHdrEl.classList.toggle('hidden', !matches.length);
        selectAllBtn.classList.toggle('hidden', !available.length);

        if (!matches.length) {
            resultsEl.innerHTML = `<div class="px-4 py-3 text-sm text-slate-400 text-center">ไม่พบพนักงานที่ตรงกัน</div>`;
            resultsEl.classList.remove('hidden');
            updateSelectionUI();
            return;
        }

        resultsEl.innerHTML = matches.map(e => {
            const already  = assignedIds.has(e.EmployeeID);
            const checked  = selectedEmps.has(e.EmployeeID);
            const subtitle = [e.Position, e.Department, e.EmployeeID].filter(Boolean).map(escHtml).join(' · ');
            return `
            <label class="emp-result-row flex items-center gap-3 px-3 py-2.5 transition-colors select-none
                          ${already ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-orange-50 cursor-pointer'}"
                   data-id="${escHtml(e.EmployeeID)}">
                <input type="checkbox" class="emp-cb w-4 h-4 rounded accent-orange-500 flex-shrink-0"
                       data-id="${escHtml(e.EmployeeID)}"
                       ${already ? 'disabled' : ''}
                       ${checked  ? 'checked' : ''}>
                <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                     style="background:${already ? '#cbd5e1' : 'linear-gradient(135deg,#f97316,#ef4444)'}">
                    ${escHtml((e.EmployeeName || '?')[0])}
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-slate-800 truncate">${escHtml(e.EmployeeName || '')}</p>
                    <p class="text-xs text-slate-400 truncate">${subtitle}</p>
                </div>
                ${already
                    ? `<span class="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-500">
                           <span class="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>เพิ่มแล้ว
                       </span>`
                    : ''}
            </label>`;
        }).join('');
        resultsEl.classList.remove('hidden');
        placeholderEl.classList.add('hidden');

        // Checkbox change handlers
        resultsEl.querySelectorAll('.emp-cb:not([disabled])').forEach(cb => {
            cb.addEventListener('change', () => {
                const emp = emps.find(e => e.EmployeeID === cb.dataset.id);
                if (!emp) return;
                if (cb.checked) selectedEmps.set(emp.EmployeeID, emp);
                else            selectedEmps.delete(emp.EmployeeID);
                updateSelectionUI();
            });
        });

        updateSelectionUI();
    }

    // ── Filter logic ──────────────────────────────────────────────────────────
    function applyFilters(emps) {
        const q    = searchInput.value.trim().toLowerCase();
        const pos  = filterPosEl.value;
        const dept = filterDeptEl.value;
        return emps.filter(e => {
            const matchPos  = !pos  || (e.Position   || '').trim() === pos;
            const matchDept = !dept || (e.Department || '').trim() === dept;
            const matchText = !q    ||
                (e.EmployeeName || '').toLowerCase().includes(q) ||
                (e.EmployeeID   || '').toLowerCase().includes(q);
            return matchPos && matchDept && matchText;
        });
    }

    async function refreshResults() {
        const q    = searchInput.value.trim();
        const pos  = filterPosEl.value;
        const dept = filterDeptEl.value;
        if (!q && !pos && !dept) {
            resultsEl.classList.add('hidden');
            resultsHdrEl.classList.add('hidden');
            currentMatches = [];
            if (!selectedEmps.size) placeholderEl.classList.remove('hidden');
            return;
        }
        spinnerEl.classList.remove('hidden');
        const emps = await _loadEmpCache();
        spinnerEl.classList.add('hidden');
        renderResults(applyFilters(emps), emps);
    }

    // ── Select all / clear all ────────────────────────────────────────────────
    selectAllBtn.addEventListener('click', async () => {
        const emps      = await _loadEmpCache();
        const available = currentMatches.filter(e => !assignedIds.has(e.EmployeeID));
        const allSel    = available.every(e => selectedEmps.has(e.EmployeeID));
        if (allSel) {
            available.forEach(e => selectedEmps.delete(e.EmployeeID));
        } else {
            available.forEach(e => selectedEmps.set(e.EmployeeID, e));
        }
        syncCheckboxes();
        updateSelectionUI();
    });

    document.getElementById('emp-clear-all').addEventListener('click', () => {
        selectedEmps.clear();
        syncCheckboxes();
        updateSelectionUI();
    });

    // ── Submit — loop POST per employee ───────────────────────────────────────
    document.getElementById('assignment-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!selectedEmps.size) return;
        const dueDate = document.getElementById('add-due-date').value || null;
        const note    = document.getElementById('add-note').value.trim() || null;
        const empList = Array.from(selectedEmps.values());

        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span> กำลังเพิ่ม...`;

        const failed = [];
        for (const emp of empList) {
            try {
                await API.post('/hiyari/assignments', {
                    EmployeeID:   emp.EmployeeID,
                    AssigneeName: emp.EmployeeName || '',
                    Department:   emp.Department   || '',
                    DueDate:      dueDate,
                    Note:         note,
                });
            } catch { failed.push(escHtml(emp.EmployeeName || emp.EmployeeID)); }
        }

        const ok = empList.length - failed.length;
        if (ok)           showToast(`เพิ่ม ${ok} คนสำเร็จ`, 'success');
        if (failed.length) showToast(`ไม่สามารถเพิ่มได้: ${failed.join(', ')}`, 'error');

        closeModal();
        await loadAndRenderAssignments();
        await _loadHeroStats();
    });

    // ── Event wiring ──────────────────────────────────────────────────────────
    filterPosEl.addEventListener('change',  () => refreshResults());
    filterDeptEl.addEventListener('change', () => refreshResults());
    let _searchTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(refreshResults, 200);
    });

    searchInput.focus();
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
            const sla  = _getSLA(r);
            const rowStyle = _getSLARowStyle(sla);
            return `
            <tr class="transition-colors" style="${rowStyle}">
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">${date}</td>
                <td class="px-4 py-3">
                    <div class="font-medium text-slate-800">${escHtml(r.ReporterName || '-')}</div>
                    <div class="text-xs text-slate-400">${escHtml(r.Department || '-')}</div>
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs max-w-[200px]">
                    <div class="truncate">${escHtml(r.Description || '-')}</div>
                    ${(() => { const st = STOP_TYPES.find(s => s.id === Number(r.StopType)); return st ? `<span class="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold" style="background:${st.bg};color:${st.color}">${st.code}</span>` : ''; })()}
                </td>
                <td class="px-4 py-3">
                    ${r.Rank
                        ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RANK_BADGE[r.Rank] || 'bg-slate-100 text-slate-500'}">${RANK_LABEL[r.Rank] || r.Rank}</span>`
                        : `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_BADGE[r.RiskLevel] || 'bg-slate-100 text-slate-500'}">${RISK_LABEL[r.RiskLevel] || r.RiskLevel || '-'}</span>`
                    }
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">
                        ${STATUS_LABEL[r.Status] || r.Status || '-'}
                    </span>
                    ${_buildSLABadge(sla)}
                </td>
                <td class="px-4 py-3 text-right flex items-center gap-1 justify-end">
                    <button class="btn-manage-report px-3 py-1 rounded-lg text-xs font-semibold text-white transition-all"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)"
                            data-id="${r.id}">จัดการ</button>
                    <button class="btn-delete-report p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            data-id="${r.id}" data-name="${escHtml(r.ReporterName || '')}" title="ลบ">
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

        const date  = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' }) : '-';
        const isImg = url => url && /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url);
        const stDet = STOP_TYPES.find(s => s.id === Number(r.StopType));
        const rankR = RANKS.find(x => x.rank === r.Rank);
        const statusLabel = STATUS_LABEL[r.Status] || r.Status || '-';
        const stopLabel = stDet?.code || '-';
        const rankLabel = rankR?.label || RISK_LABEL[r.RiskLevel] || r.RiskLevel || '-';
        const highRisk = ['A','B'].includes(r.Rank) || ['High','Critical'].includes(r.RiskLevel);

        const html = `
            <div class="space-y-4 px-1 text-sm">

                <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Status</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(statusLabel)}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Stop Type</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(stopLabel)}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Rank</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(rankLabel)}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Date</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(date)}</p>
                    </div>
                </div>

                <!-- Header block -->
                <div class="hidden">
                    <div class="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <svg class="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-sm text-orange-800">${escHtml(r.Location || 'Hiyari-Hatto')}</p>
                        <p class="text-xs text-slate-500 mt-0.5">รายงานโดย ${escHtml(r.ReporterName || '-')} · ${date}</p>
                    </div>
                    <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">
                            ${STATUS_LABEL[r.Status] || r.Status || '-'}
                        </span>
                        ${stDet
                            ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold" style="background:${stDet.bg};color:${stDet.color};border:1px solid ${stDet.border}">${stDet.code}</span>`
                            : ''}
                        ${rankR
                            ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold ${RANK_BADGE[rankR.rank]}">${rankR.label}</span>`
                            : (r.RiskLevel ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold ${RISK_BADGE[r.RiskLevel] || 'bg-slate-100 text-slate-500'}">${RISK_LABEL[r.RiskLevel] || r.RiskLevel}</span>` : '')}
                    </div>
                </div>

                <!-- Info grid -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">แผนก</p><p class="text-sm text-slate-700">${escHtml(r.Department || '-')}</p></div>
                    <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">ผลที่อาจเกิดขึ้น</p><p class="text-sm text-slate-700">${escHtml(r.PotentialConsequence || '-')}</p></div>
                    ${stDet ? `<div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Stop Type</p><p class="text-sm font-semibold" style="color:${stDet.color}">${stDet.code} — ${stDet.label}</p></div>` : ''}
                    ${rankR ? `<div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Rank</p><p class="text-sm font-bold" style="color:${rankR.color}">${rankR.label} · ${rankR.desc} (${rankR.detail})</p></div>` : ''}
                    ${r.Description ? `<div class="col-span-2"><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">รายละเอียดเหตุการณ์</p><p class="text-sm text-slate-700 leading-relaxed">${escHtml(r.Description)}</p></div>` : ''}
                    ${r.Suggestion ? `<div class="col-span-2"><p class="text-[10px] font-bold text-blue-400 uppercase mb-1">ข้อเสนอแนะ</p><p class="text-sm text-slate-700 leading-relaxed">${escHtml(r.Suggestion)}</p></div>` : ''}
                    ${r.CorrectiveAction ? `<div class="col-span-2"><p class="text-[10px] font-bold text-emerald-500 uppercase mb-1">Corrective Action</p><p class="text-sm text-slate-700 leading-relaxed">${escHtml(r.CorrectiveAction)}</p></div>` : ''}
                    ${r.AdminComment ? `<div class="col-span-2"><p class="text-[10px] font-bold text-amber-500 uppercase mb-1">ความคิดเห็น Admin</p><p class="text-sm text-slate-700 leading-relaxed">${escHtml(r.AdminComment)}</p></div>` : ''}
                </div>

                <!-- Attachments (CCCF file-link style for non-images) -->
                ${(r.AttachmentUrl || r.AdditionalFileUrl) ? `
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">ไฟล์แนบ</p>
                    <div class="flex flex-col gap-2">
                        ${r.AttachmentUrl ? (isImg(r.AttachmentUrl)
                            ? buildFileThumb(r.AttachmentUrl, 'ไฟล์จากผู้รายงาน', true)
                            : `<a href="${escHtml(r.AttachmentUrl)}" target="_blank" rel="noopener noreferrer"
                                  class="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-orange-300 hover:bg-orange-50 transition-colors">
                                <svg class="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                                <span class="text-sm font-semibold text-orange-700">ไฟล์จากผู้รายงาน</span>
                               </a>`)
                        : ''}
                        ${r.AdditionalFileUrl ? (isImg(r.AdditionalFileUrl)
                            ? buildFileThumb(r.AdditionalFileUrl, 'ไฟล์เพิ่มเติม (Admin)', true)
                            : `<a href="${escHtml(r.AdditionalFileUrl)}" target="_blank" rel="noopener noreferrer"
                                  class="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-orange-300 hover:bg-orange-50 transition-colors">
                                <svg class="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                                <span class="text-sm font-semibold text-orange-700">ไฟล์เพิ่มเติม (Admin)</span>
                               </a>`)
                        : ''}
                    </div>
                </div>` : ''}

                ${r.Status === 'Closed' && r.ClosedAt ? `
                <p class="text-xs text-slate-400 text-right">ปิดโดย ${escHtml(r.ClosedBy || '-')} เมื่อ ${new Date(r.ClosedAt).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' })}</p>` : ''}

                <!-- Hiyari → Yokoten shortcut (Rank A/B or High/Critical RiskLevel) -->
                ${highRisk ? `
                <div class="border-t border-slate-100 pt-4">
                    <p class="text-xs text-slate-400 mb-2">เหตุการณ์ความเสี่ยงสูง — สามารถแปลงเป็นบทเรียน Yokoten ได้</p>
                    <button id="btn-to-yokoten"
                        data-id="${r.id}"
                        data-title="${escHtml(r.PotentialConsequence || r.Description || 'Hiyari #' + r.id)}"
                        data-desc="${escHtml(r.Description || '')}"
                        data-dept="${escHtml(r.Department || '')}"
                        data-risk="${escHtml(r.RiskLevel || '')}"
                        class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                        style="background:linear-gradient(135deg,#0ea5e9,#6366f1);box-shadow:0 2px 8px rgba(14,165,233,0.35)">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                        </svg>
                        แปลงเป็น Yokoten Topic
                    </button>
                </div>` : ''}
            </div>`;

        openDetailModal({
            title: escHtml(r.Location || 'Hiyari-Hatto'),
            subtitle: `${date} · ${r.Department || '-'} · ${r.ReporterName || '-'}`,
            meta: [
                { label: statusLabel, className: `${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'} border-slate-200` },
                stDet ? { label: stDet.code, className: 'bg-orange-50 text-orange-700 border-orange-200' } : null,
                rankR ? { label: rankR.label, className: `${RANK_BADGE[rankR.rank] || 'bg-slate-100 text-slate-500'} border-slate-200` } : null,
                highRisk ? { label: 'High attention', className: 'bg-rose-50 text-rose-700 border-rose-200' } : null,
            ],
            body: html,
            size: 'max-w-2xl'
        });
    } catch (err) {
        hideLoading();
        showError(err);
    }
}

function field(label, value) {
    return `<div>
        <p class="text-xs text-slate-400 font-medium mb-0.5">${escHtml(label)}</p>
        <p class="text-slate-700 font-semibold">${escHtml(value)}</p>
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

                <!-- Header block (CCCF-style brief info) -->
                <div class="bg-orange-50 border border-orange-100 rounded-xl p-3 flex gap-2.5 text-sm text-orange-800">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-orange-100">
                        <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                        </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold">${escHtml(r.ReporterName || '-')} · ${escHtml(r.Department || '-')}</p>
                        <p class="text-xs text-slate-500 mt-0.5">${r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH') : ''}</p>
                        ${r.Description ? `<p class="text-xs text-slate-700 mt-1.5 line-clamp-2">${escHtml(r.Description)}</p>` : ''}
                    </div>
                </div>

                <form id="manage-form" class="space-y-4 px-1">
                    <input type="hidden" name="id" value="${r.id}">

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="col-span-2">
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">สถานะ</label>
                            <select name="Status" class="form-select w-full rounded-xl text-sm">
                                ${STATUSES.map(s => `<option value="${s}" ${r.Status === s ? 'selected' : ''}>${STATUS_LABEL[s] || s}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-span-2">
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Corrective Action</label>
                            <textarea name="CorrectiveAction" rows="3" class="form-input w-full rounded-xl text-sm resize-none"
                                      placeholder="ระบุมาตรการแก้ไข...">${escHtml(r.CorrectiveAction || '')}</textarea>
                        </div>
                        <div class="col-span-2">
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ความคิดเห็น / หมายเหตุ</label>
                            <textarea name="AdminComment" rows="2" class="form-input w-full rounded-xl text-sm resize-none"
                                      placeholder="หมายเหตุเพิ่มเติม...">${escHtml(r.AdminComment || '')}</textarea>
                        </div>
                        <div class="col-span-2">
                            ${r.AdditionalFileUrl ? `<a href="${escHtml(r.AdditionalFileUrl)}" target="_blank" rel="noopener noreferrer"
                                class="inline-flex items-center gap-2 text-xs font-semibold text-orange-700 hover:text-orange-800 mb-3">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                                ดูไฟล์ปัจจุบัน
                            </a>` : ''}
                            <input type="file" id="manage-file" accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
                                   class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 transition-all">
                            <p class="text-xs text-slate-400 mt-1">${r.AdditionalFileUrl ? 'หากไม่เลือกไฟล์ใหม่ ระบบจะเก็บไฟล์เดิมไว้' : 'รองรับ JPG, PNG, PDF, Word · ขนาดไม่เกิน 20 MB'}</p>
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
                        <button type="button" onclick="window.closeModal&&window.closeModal()"
                                class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
                        <button type="submit" id="manage-save-btn"
                                class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                                style="background:linear-gradient(135deg,#f97316,#ef4444)">บันทึก</button>
                    </div>
                </form>
            </div>`;

        openModal('จัดการรายงาน Hiyari', html, 'max-w-xl');

        document.getElementById('manage-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveBtn = document.getElementById('manage-save-btn');
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span> กำลังบันทึก...`;

            try {
                showLoading('กำลังบันทึก...');
                const fd = new FormData(e.target);

                // Update status / corrective action / comment (logic unchanged)
                await API.put(`/hiyari/${r.id}`, {
                    Status:           fd.get('Status'),
                    CorrectiveAction: fd.get('CorrectiveAction'),
                    AdminComment:     fd.get('AdminComment'),
                });

                // Upload additional file if selected (logic unchanged)
                const fileEl = document.getElementById('manage-file');
                if (fileEl?.files?.length) {
                    const fileFd = new FormData();
                    fileFd.append('file', fileEl.files[0]);
                    await API.post(`/hiyari/${r.id}/attachment`, fileFd);
                }

                closeModal();
                showToast('อัปเดตรายงานสำเร็จ', 'success');
                if (_activeTab === 'history') await fetchAndRenderTable();
                else if (_activeTab === 'manage') await loadAndRenderAssignments();
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
                    if (_activeTab === 'history') await fetchAndRenderTable();
                    else if (_activeTab === 'manage') await loadAndRenderAssignments();
                    await _loadHeroStats();
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

        // Export PDF (dashboard)
        if (e.target.closest('#hiyari-pdf-btn')) { exportHiyariPDF(); return; }

        // Dept config (dashboard admin)
        if (e.target.closest('#hiyari-dept-config-btn')) { openDashConfigModal(); return; }

        // Export Excel
        if (e.target.closest('#hiyari-export-btn')) { exportHiyariExcel(); return; }

        // Add assignment
        if (e.target.closest('#btn-add-assignment')) { openAssignmentModal(null); return; }

        // Edit assignment
        const editAssignBtn = e.target.closest('.btn-edit-assignment');
        if (editAssignBtn) {
            const a = _assignments.find(x => String(x.id) === String(editAssignBtn.dataset.id));
            if (a) openAssignmentModal(a);
            return;
        }

        // Delete assignment
        const delAssignBtn = e.target.closest('.btn-delete-assignment');
        if (delAssignBtn) {
            const confirmed = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบรายการมอบหมายของ "${delAssignBtn.dataset.name}" ใช่หรือไม่?`);
            if (confirmed) {
                showLoading('กำลังลบ...');
                try {
                    await API.delete(`/hiyari/assignments/${delAssignBtn.dataset.id}`);
                    showToast('ลบรายการสำเร็จ', 'success');
                    await loadAndRenderAssignments();
                    await _loadHeroStats();
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // Convert Hiyari → Yokoten topic
        const yokoBtn = e.target.closest('#btn-to-yokoten');
        if (yokoBtn) {
            try {
                sessionStorage.setItem('hiyari_to_yokoten', JSON.stringify({
                    sourceId:   yokoBtn.dataset.id,
                    title:      yokoBtn.dataset.title,
                    description: yokoBtn.dataset.desc,
                    department: yokoBtn.dataset.dept,
                    riskLevel:  yokoBtn.dataset.risk,
                }));
            } catch (_) {}
            window.closeModal?.();
            window.location.hash = 'yokoten';
            return;
        }
    });

    // Filter changes
    document.addEventListener('change', async (e) => {
        if (!e.target.closest('#hiyari-page')) return;

        if (e.target.id === 'filter-status') { _filterStatus = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'filter-risk')   { _filterRisk   = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'filter-dept')   { _filterDept   = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'history-year')  { _historyYear  = e.target.value; await fetchAndRenderTable(); return; }
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
// EXCEL EXPORT
// ─────────────────────────────────────────────────────────────────────────────
function exportHiyariExcel() {
    if (!window.XLSX) { showToast('ไม่พบ SheetJS library — กรุณารีเฟรชหน้า', 'error'); return; }
    if (!_reports.length) { showToast('ไม่มีข้อมูลสำหรับ Export', 'warning'); return; }

    const rows = _reports.map(r => ({
        'วันที่รายงาน':        r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH') : '-',
        'ผู้รายงาน':           r.ReporterName || '-',
        'รหัสพนักงาน':         r.ReporterID   || '-',
        'แผนก':               r.Department   || '-',
        'สถานที่':             r.Location     || '-',
        'รายละเอียดเหตุการณ์': r.Description  || '-',
        'ผลที่อาจเกิดขึ้น':    r.PotentialConsequence || '-',
        'ระดับความเสี่ยง':     RISK_LABEL[r.RiskLevel]  || r.RiskLevel  || '-',
        'สถานะ':              STATUS_LABEL[r.Status]   || r.Status     || '-',
        'การแก้ไขทันที':       r.ImmediateAction || '-',
        'มาตรการป้องกัน':      r.CorrectiveAction || '-',
        'ผู้รับผิดชอบ':        r.AssignedTo  || '-',
        'วันที่ปิด':           r.ClosedDate ? new Date(r.ClosedDate).toLocaleDateString('th-TH') : '-',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hiyari Reports');

    // Auto column width
    const colWidths = Object.keys(rows[0] || {}).map(k => ({
        wch: Math.max(k.length * 2, 14)
    }));
    ws['!cols'] = colWidths;

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Hiyari_${today}.xlsx`);
    showToast('Export สำเร็จ', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
