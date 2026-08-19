// public/js/pages/fourm.js
// 4M Change Management — Enterprise Edition
import { API } from '../api.js';
import {
    hideLoading, showError, showLoading,
    openModal, openDetailModal, closeModal, showToast, showConfirmationModal, showDocumentModal, escHtml,
    statusBadge as dsStatusBadge
} from '../ui.js?v=20260602-mobile-nav-m53';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';
import { createLatestRenderTarget, guardActionHandler, guardSubmitHandler, sectionSkeleton, withActionLock } from '../utils/async-ui.js?v=20260715-phase32c-residual-async';

function lockFourmInlineActions() {
    ['_fourmExportNoticePDF', '_fourmExportDashPDF', '_fourmExportDashPDFLegacy'].forEach(name => {
        const original = window[name];
        if (typeof original !== 'function' || original.__phase32cLocked) return;
        const guarded = (...args) => withActionLock(
            `fourm:inline:${name}:${args[0] == null ? 'global' : String(args[0])}`,
            () => original(...args),
        );
        guarded.__phase32cLocked = true;
        window[name] = guarded;
    });
}

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

const IMPACT_LEVELS = ['N/A', 'Low', 'Medium', 'High'];
const IMPACT_FIELDS = [
    { key:'SafetyImpact', label:'Safety / ความปลอดภัย' },
    { key:'QualityImpact', label:'Quality / คุณภาพ' },
    { key:'ProductionImpact', label:'Production / การผลิต' },
    { key:'EnvironmentImpact', label:'Environment / สิ่งแวดล้อม' },
];
const IMPACT_META = {
    'N/A':    { label:'N/A',    cls:'bg-slate-50 text-slate-500 border-slate-200' },
    Low:      { label:'Low',    cls:'bg-emerald-50 text-emerald-700 border-emerald-200' },
    Medium:   { label:'Medium', cls:'bg-amber-50 text-amber-700 border-amber-200' },
    High:     { label:'High',   cls:'bg-rose-50 text-rose-700 border-rose-200' },
};
const TASK_STATUSES = ['Pending', 'In Progress', 'Done'];
const TASK_META = {
    Pending:       { label:'Pending', cls:'bg-amber-50 text-amber-700 border-amber-200' },
    'In Progress': { label:'In Progress', cls:'bg-sky-50 text-sky-700 border-sky-200' },
    Done:          { label:'Done', cls:'bg-emerald-50 text-emerald-700 border-emerald-200' },
};
const COURSE_MASTER_CATEGORIES = [
    'การประเมินเชิงคุณภาพ',
    'การประเมินเชิงความปลอดภัย',
    'การประเมินจิตสำนึกความปลอดภัย',
];

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
let _noticeFilter   = { status:'all', type:'all', dept:'all', year: new Date().getFullYear(), q:'', overdue:false, mine:false, trainingRequired:false };
let _manFilter      = { q:'', status:'all', year: new Date().getFullYear() };
let _manSubtab      = 'summary';
const MAN_SUBTAB_STORAGE_KEY = 'fourm_man_subtab';
let _tmFilter       = { year: new Date().getFullYear(), dept:'all' };
let _listenersReady = false;
let _chartLine      = null;
let _chartPie       = null;
let _chartBar       = null;
let _chartMan       = null;
let _chartManDonut  = null;
let _departments    = [];
let _statsData      = null;
let _lastNotices    = [];
let _lastManRows    = [];
let _fourmForms     = [];
let _tmCurriculums  = [];
let _tmCourses      = [];
let _tmAssignments  = [];
let _tmEmployees    = [];
let _tmCourseMaster = [];
let _tmEmployeeScopes = [];
let _tmPermissions = { canManageTraining: false, canManageAll: false, canDeleteHistory: false, department: '', permissionKey: 'FOURM_TRAINING_MANAGE' };
let _tmInlineSelectedEmployees = new Set();
let _tmSelectedCurriculumId = null;
let _tmSelectedCourseId = null;
let _tmDetailTab    = 'courses';
let _tmShowCourseMaster = false;
let _tmShowEmployeeMaster = false;
let _tmSearch       = { curriculum:'', course:'', employee:'', inlineEmployee:'' };
let _fourmCardSaveMenu = null;
let _fourmCardSaveHold = null;

function canManageTrainingMatrix() {
    return _isAdmin || Boolean(_tmPermissions?.canManageTraining);
}

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
    if (_activeTab === 'systems') _activeTab = 'dashboard';
    try {
        const savedManSubtab = sessionStorage.getItem(MAN_SUBTAB_STORAGE_KEY);
        if (['summary', 'matrix'].includes(savedManSubtab)) _manSubtab = savedManSubtab;
    } catch (_) {}
    await Promise.all([
        _loadDepts(),
        fetchTrainingPermissions({ force: true }),
    ]);

    // Apply incoming filter from dashboard drill-down
    try {
        const _inFilter = JSON.parse(sessionStorage.getItem('pending_filter_fourm') || 'null');
        if (_inFilter) {
            sessionStorage.removeItem('pending_filter_fourm');
            if (_inFilter.tab) _activeTab = _inFilter.tab;
            if (_inFilter.status && _inFilter.status !== 'overdue') {
                _noticeFilter.status = _inFilter.status;
                _noticeFilter.overdue = false;
            }
            if (_inFilter.status === 'overdue') { _noticeFilter.status = 'overdue'; _noticeFilter.overdue = true; }
            if (_inFilter.trainingRequired === '1') _noticeFilter.trainingRequired = true;
        }
    } catch (_) {}

    switchTab(_activeTab);
    _loadHeroStats();
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────────────────────
function _getFourmTabs() {
    return [
        { id:'dashboard', label:'Dashboard',    icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
        { id:'notices',   label:'Change Notice',icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>` },
        { id:'man',       label:'Man Record',   icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>` },
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
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
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
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Man · Machine · Material · Method · Thai Summit Harness Co., Ltd.</p>
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
    const render = createLatestRenderTarget('fourm:tab-render', c);
    lockFourmInlineActions();
    c.innerHTML = sectionSkeleton({ label: 'กำลังโหลดข้อมูล 4M', rows: 6 });
    switch (tab) {
        case 'dashboard': await renderDashboard(render.target); break;
        case 'notices':   await renderNotices(render.target);   break;
        case 'man':       await renderMan(render.target);        break;
        default:          await renderDashboard(render.target); break;
    }
    if (render.isCurrent()) {
        lockFourmInlineActions();
        _fourmPrepareCardImageTargets();
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
        const open    = parseInt(kpi.open)    || 0;
        const closed  = parseInt(kpi.closed)  || 0;
        const pending = parseInt(kpi.pending) || 0;
        const closureRate = total > 0 ? Math.round(closed / total * 100) : 0;
        const stats = [
            { value: total,            label:'ทั้งหมด',    color:'#c7d2fe' },
            { value: open,             label:'Open',       color:'#bae6fd' },
            { value: pending,          label:'รอดำเนินการ',color: pending > 0 ? '#fde68a' : '#c7d2fe' },
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
            <div id="fourm-dash-inner" class="space-y-5">
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    ${Array(4).fill(0).map(() => `<div class="ds-metric-card p-4 animate-pulse"><div class="h-8 bg-slate-100 rounded mb-2"></div><div class="h-4 bg-slate-50 rounded w-2/3"></div></div>`).join('')}
                </div>
            </div>
        </div>`;

    await _renderDashInner();
}

async function _renderDashInner() {
    const inner = document.getElementById('fourm-dash-inner');
    if (!inner) return;
    try {
        const [statsRes, overdueRes, myRes] = await Promise.all([
            API.get(`/fourm/stats?year=${_statsYear}`),
            API.get(`/fourm/notices?overdue=1&year=${_statsYear}`).catch(() => ({ data: [] })),
            API.get(`/fourm/notices?mine=1&year=${_statsYear}`).catch(() => ({ data: [] })),
        ]);
        const data = statsRes?.data || {};
        const kpi  = data.noticeKpi || {};
        const overdue      = data.overdueCount || 0;
        const byDeptType   = data.byDeptType   || [];
        const overdueList  = normalizeApiArray(overdueRes?.data ?? overdueRes) || [];
        const myNotices    = normalizeApiArray(myRes?.data ?? myRes) || [];

        const total   = parseInt(kpi.total)   || 0;
        const closed  = parseInt(kpi.closed)  || 0;
        const closureRate = total > 0 ? Math.round(closed / total * 100) : 0;

        inner.innerHTML = `
            ${_buildQuickAccess()}

            ${canManageTrainingMatrix() ? _buildTrainingRequiredGap(data.trainingRequiredSummary || {}, data.trainingRequiredGapList || [], data.trainingRequiredDeptGap || []) : ''}

            ${canManageTrainingMatrix() ? _buildTrainingMatrixHealth(data.trainingMatrixHealthSummary || {}, data.trainingMatrixHealthRows || []) : ''}

            ${canManageTrainingMatrix() ? _buildTrainingDashboardSnapshot(data.trainingSummary || {}) : ''}

            ${_buildWorkPrioritySection({ kpi, closureRate, overdue, overdueList, myNotices, insights: data.adminInsights || {} })}

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                ${_buildKpiCards(kpi, overdue, closureRate)}
            </div>

            ${_isAdmin ? _buildAdminInsights(data.adminInsights || {}, data.byType || []) : ''}

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="lg:col-span-2 ds-section p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">แนวโน้ม Change Notice รายเดือน</h3>
                    <div style="height:220px"><canvas id="fourm-chart-line"></canvas></div>
                </div>
                <div class="ds-section p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">สัดส่วน Change Type</h3>
                    <div style="height:220px"><canvas id="fourm-chart-pie"></canvas></div>
                </div>
            </div>

            <div class="ds-section p-5">
                <h3 class="text-sm font-bold text-slate-600 mb-4">Change Notice แยกตามแผนก (Top 10)</h3>
                <div style="height:220px"><canvas id="fourm-chart-bar"></canvas></div>
            </div>

            ${byDeptType.length ? _buildDeptMatrix(byDeptType) : ''}

            ${_buildManSummary(data.manSummary || [])}

            ${_isAdmin ? _buildEmailOutboxPanel() : ''}
        `;

        renderLineChart(data.monthly || []);
        renderPieChart(data.byType   || []);
        renderBarChart(data.byDept   || []);

        _loadFourmForms(_isAdmin).then(() => {
            _renderFourmFormsDash();
            document.getElementById('btn-add-fourm-form-dash')?.addEventListener('click', _openFourmFormUploadModal);
            document.getElementById('fourm-forms-dash')?.addEventListener('click', guardActionHandler(async (e) => {
                const toggleBtn = e.target.closest('.btn-fourm-form-toggle');
                if (toggleBtn) {
                    const { id, active, title, version, sortOrder, description } = toggleBtn.dataset;
                    try {
                        await API.put(`/module-forms/${id}`, { title, description, version, sortOrder: parseInt(sortOrder)||99, isActive: active === '1' ? 0 : 1 });
                        showToast('อัปเดตสำเร็จ', 'success');
                        await _loadFourmForms(true); _renderFourmFormsDash();
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
                            await _loadFourmForms(true); _renderFourmFormsDash();
                        } catch (err) { showError(err); }
                    }
                }
            }, { render: false }));
        });
        if (_isAdmin) _loadFourmEmailOutbox();

    } catch (err) {
        console.error('4M dashboard error:', err);
        inner.innerHTML = _buildDashboardErrorState(err);
    }
}

function _buildDashboardErrorState(err) {
    const msg = err?.message || 'ไม่สามารถโหลด Dashboard ได้ / Cannot load dashboard.';
    return `
        <div class="rounded-xl border border-rose-200 bg-rose-50 p-5">
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div class="min-w-0">
                    <p class="text-[11px] font-black uppercase tracking-wider text-rose-500">Dashboard Error</p>
                    <h3 class="mt-1 text-base font-black text-rose-800">โหลดแดชบอร์ดไม่สำเร็จ / Cannot load dashboard</h3>
                    <p class="mt-1 text-sm font-semibold text-rose-700 break-words">${escHtml(msg)}</p>
                </div>
                <button type="button" id="fourm-dashboard-retry"
                        class="inline-flex items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-700">
                    ลองใหม่ / Retry
                </button>
            </div>
        </div>`;
}

function _buildTrainingRequiredGap(summary = {}, gapList = [], deptGap = []) {
    const total = parseInt(summary.total, 10) || 0;
    const covered = parseInt(summary.covered, 10) || 0;
    const missing = parseInt(summary.missing, 10) || 0;
    const active = parseInt(summary.active, 10) || 0;
    const coverageRate = total > 0 ? Math.round(covered / total * 100) : 100;
    const coverageColor = missing > 0 ? '#d97706' : '#059669';
    const rows = normalizeApiArray(gapList || []);
    const deptRows = normalizeApiArray(deptGap || []).filter(row => (parseInt(row.missing, 10) || 0) > 0).slice(0, 4);
    const ownDept = !_isAdmin && _tmPermissions?.department ? String(_tmPermissions.department) : '';
    const deptFilterAttr = ownDept ? `data-filter-dept="${escHtml(ownDept)}"` : '';
    const matrixDeptAttr = ownDept ? `data-dept="${escHtml(ownDept)}"` : '';
    const metric = (label, value, tone, attrs = '') => `
        <button type="button" class="fourm-kpi-nav rounded-xl border ${tone.border} ${tone.bg} p-3 text-left hover:bg-white hover:shadow-sm transition-all"
                ${attrs}>
            <p class="text-xl font-black ${tone.text}">${value}</p>
            <p class="mt-1 text-[11px] font-bold text-slate-500">${label}</p>
        </button>`;
    const rowHtml = rows.length ? rows.map(row => {
        const age = parseInt(row.ageDays, 10) || 0;
        const tm = TYPE_META[row.ChangeType] || { bg:'#f8fafc', text:'#64748b' };
        const sm = STATUS_META[row.Status] || { bg:'#f1f5f9', text:'#64748b', label: row.Status || '-' };
        return `
            <button type="button" class="btn-notice-view w-full text-left px-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-amber-50/60 transition-colors"
                    data-id="${escHtml(row.id || '')}">
                <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="font-mono text-[11px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">${escHtml(row.NoticeNo || '-')}</span>
                            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full" style="background:${tm.bg};color:${tm.text}">${escHtml(row.ChangeType || '-')}</span>
                            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full" style="background:${sm.bg};color:${sm.text}">${escHtml(sm.label || row.Status || '-')}</span>
                        </div>
                        <p class="mt-1 truncate text-sm font-bold text-slate-700">${escHtml(row.Title || '-')}</p>
                        <p class="mt-0.5 text-[11px] text-slate-400">${escHtml(row.Department || '-')} ${row.ResponsiblePerson ? `· ${escHtml(row.ResponsiblePerson)}` : ''}</p>
                    </div>
                    <span class="self-start md:self-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">${age} วัน / days</span>
                </div>
            </button>`;
    }).join('') : `
        <div class="px-4 py-7 text-center">
            <p class="text-sm font-black text-emerald-700">ครบถ้วนแล้ว / All covered</p>
            <p class="mt-1 text-xs font-semibold text-slate-400">Notice ที่ต้องอบรมมี Training Matrix scope รองรับแล้ว</p>
        </div>`;
    const deptHtml = deptRows.length ? deptRows.map(row => `
        <button type="button" class="fourm-open-training-matrix w-full rounded-lg border border-slate-100 bg-white px-3 py-2 text-left hover:border-emerald-200 hover:bg-emerald-50"
                data-year="${escHtml(String(_statsYear))}" data-dept="${escHtml(row.Department || '')}">
            <div class="flex items-center justify-between gap-3">
                <span class="truncate text-sm font-bold text-slate-700">${escHtml(row.Department || '-')}</span>
                <span class="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700">${parseInt(row.missing, 10) || 0} gap</span>
            </div>
            <p class="mt-1 text-[11px] font-semibold text-slate-400">${parseInt(row.covered, 10) || 0} covered / ${parseInt(row.total, 10) || 0} required</p>
        </button>`).join('') : `
        <div class="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-4 text-center text-xs font-bold text-emerald-700">
            ไม่มีแผนกที่ขาด scope / No department gap
        </div>`;

    return `
        <div class="ds-section overflow-hidden">
            <div class="border-b border-slate-100 bg-gradient-to-r from-white via-amber-50/50 to-emerald-50/50 px-5 py-4">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p class="text-[11px] font-black uppercase tracking-wider text-amber-600">Training Required Gap</p>
                        <h3 class="mt-0.5 text-base font-black text-slate-800">Notice ที่ต้องจัดอบรม / Training Required Follow-up</h3>
                        <p class="mt-1 text-xs font-semibold text-slate-500">เทียบกับ Training Matrix scope ปี ${_statsYear} ตามแผนกเดียวกัน</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" class="fourm-kpi-nav rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-50"
                                data-filter-status="all" data-filter-training-required="1" ${deptFilterAttr}>
                            ดู Notice ต้องอบรม / View required
                        </button>
                        <button type="button" class="fourm-open-training-matrix rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"
                                data-year="${escHtml(String(_statsYear))}" ${matrixDeptAttr}>
                            เปิด Training Matrix
                        </button>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)_minmax(260px,0.75fr)]">
                <div>
                    <div class="grid grid-cols-2 gap-3">
                        ${metric('ต้องอบรม / Required', total, { border:'border-amber-100', bg:'bg-amber-50/70', text:'text-amber-700' }, `data-filter-status="all" data-filter-training-required="1" ${deptFilterAttr}`)}
                        ${metric('ยัง Active', active, { border:'border-sky-100', bg:'bg-sky-50/70', text:'text-sky-700' }, `data-filter-status="all" data-filter-training-required="1" ${deptFilterAttr}`)}
                        ${metric('มี Scope แล้ว / Covered', covered, { border:'border-emerald-100', bg:'bg-emerald-50/70', text:'text-emerald-700' }, `data-filter-status="all" data-filter-training-required="1" ${deptFilterAttr}`)}
                        ${metric('ยังไม่มี Scope / Gap', missing, { border:'border-rose-100', bg:'bg-rose-50/70', text: missing ? 'text-rose-700' : 'text-slate-500' }, `data-filter-status="all" data-filter-training-required="1" ${deptFilterAttr}`)}
                    </div>
                    <div class="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                        <div class="flex items-center justify-between text-xs font-bold text-slate-500">
                            <span>Coverage / ความครอบคลุม</span>
                            <span style="color:${coverageColor}">${coverageRate}%</span>
                        </div>
                        <div class="mt-2 h-2 rounded-full bg-white overflow-hidden">
                            <div class="h-full rounded-full" style="width:${Math.min(coverageRate, 100)}%;background:${coverageColor}"></div>
                        </div>
                    </div>
                </div>
                <div class="overflow-hidden rounded-xl border border-slate-100 bg-white">
                    <div class="border-b border-slate-100 px-4 py-3">
                        <p class="text-[11px] font-black uppercase tracking-wider text-rose-500">Need Matrix Scope</p>
                        <h4 class="mt-0.5 text-sm font-bold text-slate-700">รายการที่ควรตามก่อน / Follow-up list</h4>
                    </div>
                    <div>${rowHtml}</div>
                </div>
                <div class="space-y-2">
                    <p class="text-[11px] font-black uppercase tracking-wider text-slate-400">Dept Gap / แผนกที่ยังขาด</p>
                    ${deptHtml}
                </div>
            </div>
        </div>`;
}

function _buildTrainingMatrixHealth(summary = {}, rows = []) {
    const curriculums = parseInt(summary.curriculums, 10) || 0;
    const ready = parseInt(summary.ready, 10) || 0;
    const noCourses = parseInt(summary.noCourses, 10) || 0;
    const noEmployees = parseInt(summary.noEmployees, 10) || 0;
    const movementWatch = parseInt(summary.movementWatch, 10) || 0;
    const issueCount = noCourses + noEmployees + movementWatch;
    const readyRate = curriculums > 0 ? Math.round(ready / curriculums * 100) : 100;
    const healthColor = issueCount ? '#d97706' : '#059669';
    const list = normalizeApiArray(rows || []);
    const ownDept = !_isAdmin && _tmPermissions?.department ? String(_tmPermissions.department) : '';
    const matrixDeptAttr = ownDept ? `data-dept="${escHtml(ownDept)}"` : '';
    const metric = (label, value, tone) => `
        <div class="rounded-xl border ${tone.border} ${tone.bg} px-3 py-3">
            <p class="text-xl font-black ${tone.text}">${value}</p>
            <p class="mt-1 text-[11px] font-bold text-slate-500">${label}</p>
        </div>`;
    const issueBadges = (row) => {
        const courseCount = parseInt(row.CourseCount, 10) || 0;
        const assignedCount = parseInt(row.AssignedCount, 10) || 0;
        const moved = (parseInt(row.TransferredCount, 10) || 0) + (parseInt(row.RemovedCount, 10) || 0);
        const badges = [];
        if (courseCount === 0) badges.push('<span class="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700">ไม่มีรายวิชา / No courses</span>');
        if (assignedCount === 0) badges.push('<span class="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700">ไม่มีพนักงาน / No employees</span>');
        if (moved >= Math.max(3, assignedCount)) badges.push(`<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">Movement ${moved}</span>`);
        return badges.join(' ');
    };
    const rowHtml = list.length ? list.map(row => {
        const moved = (parseInt(row.TransferredCount, 10) || 0) + (parseInt(row.RemovedCount, 10) || 0);
        return `
            <button type="button" class="fourm-open-training-matrix w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-emerald-50/60 transition-colors"
                    data-year="${escHtml(String(_statsYear))}" data-dept="${escHtml(row.Department || '')}">
                <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="font-mono text-[11px] font-black text-violet-700 bg-violet-50 px-2 py-0.5 rounded">${escHtml(row.CurriculumCode || '-')}</span>
                            ${issueBadges(row)}
                        </div>
                        <p class="mt-1 truncate text-sm font-bold text-slate-700">${escHtml(row.CurriculumTitle || '-')}</p>
                        <p class="mt-0.5 text-[11px] text-slate-400">${escHtml(row.Department || '-')} · ${parseInt(row.CourseCount, 10) || 0} courses · ${parseInt(row.AssignedCount, 10) || 0} employees · ${moved} moved</p>
                    </div>
                    <span class="self-start md:self-center rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-black text-emerald-700">เปิด / Open</span>
                </div>
            </button>`;
    }).join('') : `
        <div class="px-4 py-7 text-center">
            <p class="text-sm font-black text-emerald-700">พร้อมใช้งาน / Matrix looks healthy</p>
            <p class="mt-1 text-xs font-semibold text-slate-400">ทุกหลักสูตร active มีรายวิชาและพนักงานใน scope แล้ว</p>
        </div>`;

    return `
        <div class="ds-section overflow-hidden">
            <div class="border-b border-slate-100 bg-gradient-to-r from-white via-violet-50/40 to-emerald-50/50 px-5 py-4">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p class="text-[11px] font-black uppercase tracking-wider text-violet-600">Training Matrix Health</p>
                        <h3 class="mt-0.5 text-base font-black text-slate-800">สุขภาพตารางอบรม / Matrix Readiness</h3>
                        <p class="mt-1 text-xs font-semibold text-slate-500">ตรวจหลักสูตรที่สร้างไว้แล้ว แต่ยังไม่มีรายวิชา พนักงาน หรือมี movement สูง</p>
                    </div>
                    <button type="button" class="fourm-open-training-matrix rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"
                            data-year="${escHtml(String(_statsYear))}" ${matrixDeptAttr}>
                        เปิด Training Matrix
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
                <div>
                    <div class="grid grid-cols-2 gap-3">
                        ${metric('หลักสูตรทั้งหมด / Curriculums', curriculums, { border:'border-violet-100', bg:'bg-violet-50/70', text:'text-violet-700' })}
                        ${metric('พร้อมใช้ / Ready', ready, { border:'border-emerald-100', bg:'bg-emerald-50/70', text:'text-emerald-700' })}
                        ${metric('ไม่มีรายวิชา / No courses', noCourses, { border:'border-rose-100', bg:'bg-rose-50/70', text:noCourses ? 'text-rose-700' : 'text-slate-500' })}
                        ${metric('ไม่มีพนักงาน / No employees', noEmployees, { border:'border-amber-100', bg:'bg-amber-50/70', text:noEmployees ? 'text-amber-700' : 'text-slate-500' })}
                    </div>
                    <div class="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                        <div class="flex items-center justify-between text-xs font-bold text-slate-500">
                            <span>Readiness / ความพร้อม</span>
                            <span style="color:${healthColor}">${readyRate}%</span>
                        </div>
                        <div class="mt-2 h-2 rounded-full bg-white overflow-hidden">
                            <div class="h-full rounded-full" style="width:${Math.min(readyRate, 100)}%;background:${healthColor}"></div>
                        </div>
                        <p class="mt-2 text-[11px] font-semibold text-slate-400">Movement watch: ${movementWatch} หลักสูตร / curriculums</p>
                    </div>
                </div>
                <div class="overflow-hidden rounded-xl border border-slate-100 bg-white">
                    <div class="border-b border-slate-100 px-4 py-3">
                        <p class="text-[11px] font-black uppercase tracking-wider text-amber-600">Setup Issues</p>
                        <h4 class="mt-0.5 text-sm font-bold text-slate-700">หลักสูตรที่ควรตรวจ / Curriculums to review</h4>
                    </div>
                    <div>${rowHtml}</div>
                </div>
            </div>
        </div>`;
}

function _buildManSummary(rows) {
    if (!rows.length) return '';
    const totalAtt  = rows.reduce((s, r) => s + (parseInt(r.totalAtt)||0), 0);
    const totalPass = rows.reduce((s, r) => s + (parseInt(r.totalPass)||0), 0);
    const passRate  = totalAtt > 0 ? Math.round(totalPass / totalAtt * 100) : 0;
    const rateColor = passRate>=80 ? '#059669' : passRate>=60 ? '#d97706' : '#ef4444';
    return `
    <div class="ds-table-wrap">
        <div class="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <h3 class="text-sm font-bold text-slate-700">สรุปผลสอบ Man Record</h3>
            </div>
            <div class="flex items-center gap-4 text-xs text-slate-500">
                <span>${rows.length} แผนก · ผู้เข้าสอบ ${totalAtt} คน</span>
                <span class="font-bold text-sm" style="color:${rateColor}">Pass Rate ${passRate}%</span>
            </div>
        </div>
        <div class="overflow-x-auto">
            <table class="ds-table text-xs">
                <thead>
                    <tr class="bg-slate-50 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <th class="px-4 py-2.5">แผนก</th>
                        <th class="px-3 py-2.5 text-center">ผู้เข้าสอบ</th>
                        <th class="px-3 py-2.5 text-center">ผ่าน</th>
                        <th class="px-3 py-2.5 text-center">ไม่ผ่าน</th>
                        <th class="px-3 py-2.5">Pass Rate</th>
                        <th class="px-3 py-2.5">สอบล่าสุด</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                    ${rows.map(r => {
                        const att  = parseInt(r.totalAtt)||0;
                        const pass = parseInt(r.totalPass)||0;
                        const fail = parseInt(r.totalFail)||0;
                        const pct  = att > 0 ? Math.round(pass/att*100) : 0;
                        const col  = pct>=80 ? '#059669' : pct>=60 ? '#d97706' : '#ef4444';
                        const last = r.lastExam ? new Date(r.lastExam).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}) : '—';
                        return `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-4 py-2.5 font-medium text-slate-700 max-w-[140px] truncate">${escHtml(r.Department)}</td>
                            <td class="px-3 py-2.5 text-center text-slate-600">${att}</td>
                            <td class="px-3 py-2.5 text-center font-semibold" style="color:#059669">${pass}</td>
                            <td class="px-3 py-2.5 text-center font-semibold" style="color:#ef4444">${fail}</td>
                            <td class="px-3 py-2.5">
                                <div class="flex items-center gap-2">
                                    <div class="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div class="h-full rounded-full" style="width:${pct}%;background:${col}"></div>
                                    </div>
                                    <span class="font-bold text-[11px]" style="color:${col}">${pct}%</span>
                                </div>
                            </td>
                            <td class="px-3 py-2.5 text-slate-500 whitespace-nowrap">${last}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    </div>`;
}

function _buildWorkPrioritySection({ kpi = {}, closureRate = 0, overdue = 0, overdueList = [], myNotices = [], insights = {} } = {}) {
    const pending = parseInt(kpi.pending, 10) || 0;
    const open = parseInt(kpi.open, 10) || 0;
    const closed = parseInt(kpi.closed, 10) || 0;
    const adminAging = normalizeApiArray(insights.pendingAging || []);
    const priorityRows = _isAdmin
        ? (adminAging.length ? adminAging : normalizeApiArray(overdueList || [])).slice(0, 5)
        : normalizeApiArray(myNotices || []).filter(n => n.Status !== 'Closed').slice(0, 5);
    const minePending = normalizeApiArray(myNotices || []).filter(n => n.Status === 'Pending').length;
    const mineOpen = normalizeApiArray(myNotices || []).filter(n => n.Status === 'Open').length;
    const mineClosed = normalizeApiArray(myNotices || []).filter(n => n.Status === 'Closed').length;

    const queueTitle = _isAdmin ? 'Priority Queue / งานที่ควรตามก่อน' : 'My Work / งานของฉัน';
    const queueSub = _isAdmin
        ? 'รายการที่ค้างนานหรือมีความเสี่ยงต่อ SLA'
        : 'รายการที่ฉันสร้างและยังต้องติดตาม';
    const summaryCards = _isAdmin
        ? [
            { label:'Open', value: open, color:'#0284c7', filter:'Open' },
            { label:'Pending', value: pending, color: pending ? '#d97706' : '#64748b', filter:'Pending' },
            { label:`Overdue > ${OVERDUE_DAYS}d`, value: overdue, color: overdue ? '#ef4444' : '#059669', overdue:'1' },
            { label:'Closure', value:`${closureRate}%`, color: closureRate >= 80 ? '#059669' : closureRate >= 50 ? '#d97706' : '#ef4444', filter:'Closed' },
        ]
        : [
            { label:'My Open', value: mineOpen, color:'#0284c7', filter:'Open' },
            { label:'Need Action', value: minePending, color: minePending ? '#d97706' : '#64748b', filter:'Pending' },
            { label:'Closed', value: mineClosed, color:'#059669', filter:'Closed' },
            { label:'All Mine', value: myNotices.length, color:'#6366f1', mine:'1' },
        ];

    const rowHtml = priorityRows.length ? priorityRows.map(row => {
        const age = row.ageDays != null
            ? parseInt(row.ageDays, 10) || 0
            : row.RequestDate ? Math.max(0, Math.floor((Date.now() - new Date(row.RequestDate)) / 86400000)) : 0;
        const urgent = row.Status !== 'Closed' && age > OVERDUE_DAYS;
        const tm = TYPE_META[row.ChangeType] || { bg:'#f8fafc', text:'#64748b' };
        const sm = STATUS_META[row.Status] || { bg:'#f1f5f9', text:'#64748b', label: row.Status || '-' };
        return `
        <button type="button" class="btn-notice-view w-full text-left px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                data-id="${row.id}">
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="font-mono text-[11px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">${escHtml(row.NoticeNo || '-')}</span>
                        <span class="text-[11px] font-bold px-2 py-0.5 rounded-full" style="background:${tm.bg};color:${tm.text}">${escHtml(row.ChangeType || '-')}</span>
                        <span class="text-[11px] font-bold px-2 py-0.5 rounded-full" style="background:${sm.bg};color:${sm.text}">${escHtml(sm.label || row.Status || '-')}</span>
                    </div>
                    <p class="text-sm font-bold text-slate-700 mt-1 truncate">${escHtml(row.Title || '-')}</p>
                    <p class="text-[11px] text-slate-400 mt-0.5">${escHtml(row.Department || '-')} ${row.ResponsiblePerson ? `· ${escHtml(row.ResponsiblePerson)}` : ''}</p>
                </div>
                <span class="self-start md:self-center text-[11px] font-black px-2.5 py-1 rounded-full ${urgent ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}">${age} วัน</span>
            </div>
        </button>`;
    }).join('') : `
        <div class="px-4 py-8 text-center">
            <p class="text-sm font-bold text-emerald-600">${_isAdmin ? 'ไม่มีรายการเร่งด่วน' : 'ยังไม่มีงานค้างของฉัน'}</p>
            <p class="text-xs text-slate-400 mt-1">${_isAdmin ? 'ระบบยังอยู่ในสถานะควบคุมได้' : 'สร้าง Change Notice ใหม่ได้จาก Command Center'}</p>
        </div>`;

    return `
    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-4">
        <div class="ds-section p-5">
            <div class="flex items-start justify-between gap-3 mb-4">
                <div>
                    <p class="text-[11px] font-black uppercase tracking-wider text-indigo-500">${_isAdmin ? 'Admin Workbench' : 'User Workspace'}</p>
                    <h3 class="text-base font-black text-slate-800 mt-1">${_isAdmin ? 'สถานะงานที่ต้องควบคุม' : 'พื้นที่งานของฉัน'}</h3>
                </div>
                <button type="button" id="btn-add-notice" class="px-3 py-2 rounded-lg text-xs font-bold text-white shrink-0"
                        style="background:linear-gradient(135deg,#059669,#0d9488)">
                    + Change Notice
                </button>
            </div>
            <div class="grid grid-cols-2 gap-3">
                ${summaryCards.map(card => `
                <button type="button" class="fourm-kpi-nav rounded-xl border border-slate-100 bg-slate-50 p-3 text-left hover:bg-white hover:shadow-sm transition-all"
                        ${card.filter ? `data-filter-status="${card.filter}"` : ''}
                        ${card.overdue ? `data-filter-overdue="${card.overdue}"` : ''}
                        ${card.mine ? `data-filter-mine="${card.mine}"` : ''}>
                    <p class="text-xl font-black" style="color:${card.color}">${card.value}</p>
                    <p class="text-[11px] font-bold text-slate-400 mt-1">${card.label}</p>
                </button>`).join('')}
            </div>
        </div>
        <div class="ds-section overflow-hidden">
            <div class="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                    <p class="text-[11px] font-black uppercase tracking-wider ${_isAdmin ? 'text-rose-500' : 'text-indigo-500'}">${queueTitle}</p>
                    <h3 class="text-sm font-bold text-slate-700 mt-1">${queueSub}</h3>
                </div>
                <button type="button" class="fourm-kpi-nav px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                        data-filter-status="all" ${_isAdmin ? '' : 'data-filter-mine="1"'}>
                    ดูทั้งหมด
                </button>
            </div>
            <div>${rowHtml}</div>
        </div>
    </div>`;
}

function _buildTrainingDashboardSnapshot(summary = {}) {
    const curriculums = parseInt(summary.curriculums, 10) || 0;
    const courses = parseInt(summary.courses, 10) || 0;
    const employees = parseInt(summary.employees, 10) || 0;
    const transferred = parseInt(summary.transferred, 10) || 0;
    const hasScope = curriculums || courses || employees || transferred;
    const item = (icon, label, value, tone) => `
        <div class="rounded-xl border ${tone.border} ${tone.bg} px-3 py-3 flex items-center gap-3">
            <span class="w-9 h-9 rounded-lg bg-white/80 ${tone.text} flex items-center justify-center shrink-0 shadow-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">${icon}</svg>
            </span>
            <div class="min-w-0">
                <p class="text-lg font-black ${tone.text} leading-none">${value}</p>
                <p class="text-[11px] font-bold text-slate-500 mt-1 truncate">${label}</p>
            </div>
        </div>`;
    return `
        <div class="ds-section overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-white via-emerald-50/40 to-sky-50/50 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div class="flex items-center gap-3">
                    <span class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253"/>
                        </svg>
                    </span>
                    <div>
                        <p class="text-[11px] font-black uppercase tracking-wider text-emerald-600">Training Matrix Snapshot</p>
                        <h3 class="text-base font-black text-slate-800 mt-0.5">Scope หลักสูตรปี ${_statsYear}</h3>
                    </div>
                </div>
                <button type="button" class="fourm-open-training-matrix px-3 py-2 rounded-xl border border-emerald-200 bg-white text-xs font-black text-emerald-700 hover:bg-emerald-50">
                    เปิดตารางอบรม
                </button>
            </div>
            <div class="p-5">
                ${hasScope ? `
                <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
                    ${item('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253"/>', 'หลักสูตร / Curr.', curriculums, { border:'border-violet-100', bg:'bg-violet-50/60', text:'text-violet-700' })}
                    ${item('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5h6m-6 4h6m-7 4h8m-9 6h10a2 2 0 002-2V7.5L14.5 3H7a2 2 0 00-2 2v12a2 2 0 002 2z"/>', 'รายวิชา / Courses', courses, { border:'border-sky-100', bg:'bg-sky-50/60', text:'text-sky-700' })}
                    ${item('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m8-4a4 4 0 10-8 0 4 4 0 008 0z"/>', 'พนักงานใน Scope', employees, { border:'border-emerald-100', bg:'bg-emerald-50/60', text:'text-emerald-700' })}
                    ${item('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/>', 'ย้ายแล้ว / Transfer', transferred, { border:'border-amber-100', bg:'bg-amber-50/60', text:'text-amber-700' })}
                </div>` : `
                <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-sm font-bold text-slate-400 text-center">
                    ยังไม่มี Training Matrix scope ในปีนี้
                </div>`}
            </div>
        </div>`;
}

function _buildAdminInsights(insights = {}, byType = []) {
    const deptRows = normalizeApiArray(insights.deptRank || []).slice(0, 6);
    const agingRows = normalizeApiArray(insights.pendingAging || []).slice(0, 6);
    const closureRows = normalizeApiArray(insights.monthlyClosure || []);
    const lowClosureRows = normalizeApiArray(insights.lowClosureDept || []).slice(0, 3);
    const typeRiskRows = normalizeApiArray(insights.typePendingRisk || []).slice(0, 3);
    const typeRows = normalizeApiArray(byType || []).slice(0, 4);
    const topType = typeRows[0];
    const lowClosureDept = lowClosureRows[0];
    const pendingType = typeRiskRows.find(row => (parseInt(row.pending, 10) || 0) > 0)
        || typeRiskRows.find(row => (parseInt(row.open, 10) || 0) > 0)
        || typeRiskRows[0];
    const latestMonth = closureRows[closureRows.length - 1];
    const prevMonth = closureRows[closureRows.length - 2];
    const latestRate = parseInt(latestMonth?.closureRate, 10) || 0;
    const prevRate = parseInt(prevMonth?.closureRate, 10) || 0;
    const monthDelta = latestMonth && prevMonth ? latestRate - prevRate : null;
    const monthLabel = latestMonth ? MONTHS_TH[(parseInt(latestMonth.month, 10) || 1) - 1] : '-';
    const riskDept = deptRows.find(row => (parseInt(row.overdue, 10) || 0) > 0)
        || deptRows.find(row => (parseInt(row.pending, 10) || 0) > 0)
        || deptRows[0];
    const avgClosure = closureRows.length
        ? Math.round(closureRows.reduce((sum, row) => sum + (parseInt(row.closureRate, 10) || 0), 0) / closureRows.length)
        : 0;
    const longest = agingRows[0];
    const priorityLabel = longest
        ? `${longest.NoticeNo || '-'} · ${parseInt(longest.ageDays, 10) || 0} วัน`
        : 'ไม่มีรายการค้าง';
    const deltaColor = monthDelta == null ? '#64748b' : monthDelta >= 0 ? '#059669' : '#ef4444';
    const deltaLabel = monthDelta == null ? 'ยังไม่มีเดือนเปรียบเทียบ' : `${monthDelta >= 0 ? '+' : ''}${monthDelta}% จากเดือนก่อน`;

    const deptHtml = deptRows.length ? deptRows.map((row, index) => {
        const total = parseInt(row.total, 10) || 0;
        const overdue = parseInt(row.overdue, 10) || 0;
        const pending = parseInt(row.pending, 10) || 0;
        const closed = parseInt(row.closed, 10) || 0;
        const closeRate = total > 0 ? Math.round(closed / total * 100) : 0;
        const color = overdue ? '#ef4444' : pending ? '#d97706' : '#059669';
        return `
        <button type="button" class="fourm-kpi-nav w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                data-filter-status="all" data-filter-dept="${escHtml(row.Department || '')}">
            <span class="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black bg-slate-100 text-slate-500">${index + 1}</span>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-slate-700 truncate">${escHtml(row.Department || '-')}</p>
                <p class="text-[11px] text-slate-400">${total} notices · ${pending} pending · ${overdue} overdue</p>
            </div>
            <span class="text-xs font-black" style="color:${color}">${closeRate}%</span>
        </button>`;
    }).join('') : `<div class="px-4 py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูลแผนก</div>`;

    const typeHtml = typeRows.length ? typeRows.map((row, index) => {
        const count = parseInt(row.count, 10) || 0;
        const meta = TYPE_META[row.label] || { bg:'#f8fafc', text:'#64748b' };
        const max = Math.max(...typeRows.map(t => parseInt(t.count, 10) || 0), 1);
        return `
        <button type="button" class="fourm-kpi-nav w-full text-left px-3 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                data-filter-status="all" data-filter-type="${escHtml(row.label || '')}">
            <div class="flex items-center justify-between gap-3">
                <div class="min-w-0 flex items-center gap-2">
                    <span class="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black" style="background:${meta.bg};color:${meta.text}">${index + 1}</span>
                    <span class="text-sm font-bold text-slate-700 truncate">${escHtml(row.label || '-')}</span>
                </div>
                <span class="text-xs font-black" style="color:${meta.text}">${count}</span>
            </div>
            <div class="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full rounded-full" style="width:${Math.round(count / max * 100)}%;background:${meta.text}"></div>
            </div>
        </button>`;
    }).join('') : `<div class="px-4 py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูล Change Type</div>`;

    const agingHtml = agingRows.length ? agingRows.map(row => {
        const age = parseInt(row.ageDays, 10) || 0;
        const urgent = age > OVERDUE_DAYS;
        const tm = TYPE_META[row.ChangeType] || { bg:'#f8fafc', text:'#64748b' };
        return `
        <button type="button" class="btn-notice-view w-full text-left px-3 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                data-id="${row.id}">
            <div class="flex items-start gap-3">
                <span class="font-mono text-[11px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded mt-0.5">${escHtml(row.NoticeNo || '-')}</span>
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-bold text-slate-700 truncate">${escHtml(row.Title || '-')}</p>
                    <p class="text-[11px] text-slate-400 mt-0.5">${escHtml(row.Department || '-')} · <span style="color:${tm.text}">${escHtml(row.ChangeType || '-')}</span></p>
                </div>
                <span class="text-[11px] font-black px-2 py-0.5 rounded-full ${urgent ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}">${age} วัน</span>
            </div>
        </button>`;
    }).join('') : `<div class="px-4 py-8 text-center text-sm text-emerald-600 font-semibold">ไม่มีรายการค้างเปิด/รอดำเนินการ</div>`;

    const closureMini = closureRows.length ? closureRows.map(row => {
        const rate = parseInt(row.closureRate, 10) || 0;
        const month = MONTHS_TH[(parseInt(row.month, 10) || 1) - 1] || row.month;
        const color = rate >= 80 ? '#059669' : rate >= 50 ? '#d97706' : '#ef4444';
        return `<div class="flex items-center gap-2">
            <span class="w-9 text-[11px] font-bold text-slate-400">${month}</span>
            <div class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full rounded-full" style="width:${Math.min(rate, 100)}%;background:${color}"></div>
            </div>
            <span class="w-9 text-right text-[11px] font-black" style="color:${color}">${rate}%</span>
        </div>`;
    }).join('') : `<p class="text-sm text-slate-400 text-center py-6">ยังไม่มี closure trend</p>`;

    const riskSignalHtml = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <button type="button" class="fourm-kpi-nav rounded-xl border border-rose-100 bg-rose-50/60 p-4 text-left hover:bg-white hover:shadow-sm transition-all"
                    data-filter-status="all" ${lowClosureDept?.Department ? `data-filter-dept="${escHtml(lowClosureDept.Department)}"` : ''}>
                <p class="text-[11px] font-black uppercase tracking-wider text-rose-500">Low Closure Dept</p>
                <p class="text-base font-black text-slate-800 mt-1 truncate">${escHtml(lowClosureDept?.Department || '-')}</p>
                <p class="text-xs text-slate-500 mt-1">${parseInt(lowClosureDept?.closureRate, 10) || 0}% closure · ${parseInt(lowClosureDept?.active, 10) || 0} active</p>
            </button>
            <button type="button" class="fourm-kpi-nav rounded-xl border border-amber-100 bg-amber-50/60 p-4 text-left hover:bg-white hover:shadow-sm transition-all"
                    data-filter-status="Pending" ${pendingType?.ChangeType ? `data-filter-type="${escHtml(pendingType.ChangeType)}"` : ''}>
                <p class="text-[11px] font-black uppercase tracking-wider text-amber-600">Pending By Type</p>
                <p class="text-base font-black text-slate-800 mt-1 truncate">${escHtml(pendingType?.ChangeType || '-')}</p>
                <p class="text-xs text-slate-500 mt-1">${parseInt(pendingType?.pending, 10) || 0} pending · ${parseInt(pendingType?.overdue, 10) || 0} overdue</p>
            </button>
            <div class="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p class="text-[11px] font-black uppercase tracking-wider text-slate-400">Monthly Momentum</p>
                <p class="text-base font-black text-slate-800 mt-1">${escHtml(monthLabel)} · ${latestRate}%</p>
                <p class="text-xs font-bold mt-1" style="color:${deltaColor}">${escHtml(deltaLabel)}</p>
            </div>
        </div>`;

    return `
    <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <button type="button" class="fourm-kpi-nav ds-metric-card p-4 text-left hover:shadow-md transition-shadow"
                    data-filter-status="all" ${topType?.label ? `data-filter-type="${escHtml(topType.label)}"` : ''}>
                <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Top Change Type</p>
                <p class="text-xl font-black text-slate-800 mt-1">${escHtml(topType?.label || '-')}</p>
                <p class="text-xs text-slate-500 mt-1">${parseInt(topType?.count, 10) || 0} รายการในปีนี้</p>
            </button>
            <button type="button" class="fourm-kpi-nav ds-metric-card p-4 text-left hover:shadow-md transition-shadow"
                    data-filter-status="all" ${riskDept?.Department ? `data-filter-dept="${escHtml(riskDept.Department)}"` : ''}>
                <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Watch Department</p>
                <p class="text-xl font-black text-slate-800 mt-1 truncate">${escHtml(riskDept?.Department || '-')}</p>
                <p class="text-xs text-slate-500 mt-1">${parseInt(riskDept?.pending, 10) || 0} pending · ${parseInt(riskDept?.overdue, 10) || 0} overdue</p>
            </button>
            <button type="button" class="btn-notice-view ds-metric-card p-4 text-left hover:shadow-md transition-shadow"
                    ${longest?.id ? `data-id="${longest.id}"` : 'disabled'}>
                <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Longest Pending</p>
                <p class="text-xl font-black text-rose-600 mt-1">${escHtml(priorityLabel)}</p>
                <p class="text-xs text-slate-500 mt-1">10 รายการแรกเรียงตามอายุมากสุด</p>
            </button>
            <div class="ds-metric-card p-4">
                <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Avg Monthly Closure</p>
                <p class="text-xl font-black ${avgClosure >= 80 ? 'text-emerald-600' : avgClosure >= 50 ? 'text-amber-600' : 'text-rose-600'} mt-1">${avgClosure}%</p>
                <p class="text-xs text-slate-500 mt-1">เฉลี่ยจากเดือนที่มีรายการ</p>
            </div>
        </div>
        ${riskSignalHtml}
        <div class="grid grid-cols-1 xl:grid-cols-4 gap-4">
            <div class="ds-section overflow-hidden">
                <div class="px-5 py-3.5 border-b border-slate-100">
                    <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-500">Admin Insight</p>
                    <h3 class="text-sm font-bold text-slate-700 mt-1">แผนกที่เปิด Change Notice มากสุด</h3>
                </div>
                <div>${deptHtml}</div>
            </div>
            <div class="ds-section overflow-hidden">
                <div class="px-5 py-3.5 border-b border-slate-100">
                    <p class="text-[11px] font-bold uppercase tracking-wider text-sky-500">Change Type</p>
                    <h3 class="text-sm font-bold text-slate-700 mt-1">ประเภทที่เกิดบ่อยสุด</h3>
                </div>
                <div>${typeHtml}</div>
            </div>
            <div class="ds-section overflow-hidden">
                <div class="px-5 py-3.5 border-b border-slate-100">
                    <p class="text-[11px] font-bold uppercase tracking-wider text-rose-500">Priority Queue</p>
                    <h3 class="text-sm font-bold text-slate-700 mt-1">Pending / Open นานที่สุด</h3>
                </div>
                <div>${agingHtml}</div>
            </div>
            <div class="ds-section p-5">
                <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-500">Closure Rate</p>
                <h3 class="text-sm font-bold text-slate-700 mt-1 mb-4">อัตราปิดงานรายเดือน</h3>
                <div class="space-y-2">${closureMini}</div>
            </div>
        </div>
    </div>`;
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
        <button class="ds-metric-card flex items-center gap-4 text-left w-full hover:shadow-md transition-shadow group fourm-kpi-nav ${c.highlight ? 'ring-2 ring-amber-300 is-warn' : ''}"
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
    <div class="ds-table-wrap">
        <div class="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18M10 3v18M14 3v18M3 3h18v18H3z"/>
            </svg>
            <h3 class="text-sm font-bold text-slate-700">แผนก × Change Type</h3>
        </div>
        <div class="overflow-x-auto">
            <table class="ds-table text-xs">
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

function _buildSLAOverdueSection(kpi, closureRate, overdueList) {
    const closureColor = closureRate >= 80 ? '#059669' : closureRate >= 50 ? '#d97706' : '#ef4444';
    const circ    = 2 * Math.PI * 34;
    const dashFill = Math.round(circ * closureRate / 100);
    const dashGap  = Math.round(circ - dashFill);
    const overdueRows = overdueList.slice(0, 5).map(r => {
        const daysOld  = Math.floor((Date.now() - new Date(r.RequestDate)) / 86400000);
        const daysOver = Math.max(0, daysOld - OVERDUE_DAYS);
        return `
        <div class="px-4 py-3 flex items-start gap-3 border-b border-slate-50 last:border-b-0">
            <span class="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded flex-shrink-0 mt-0.5">${escHtml(r.NoticeNo||'—')}</span>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-slate-800 truncate">${escHtml(r.Title||'—')}</p>
                <p class="text-xs text-slate-400 mt-0.5">${escHtml(r.ResponsiblePerson||'—')}${r.Department ? ` · ${escHtml(r.Department)}` : ''}</p>
            </div>
            <span class="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0 mt-0.5">ค้าง ${daysOver} วัน</span>
        </div>`;
    }).join('');

    const overdueCount = parseInt(kpi.overdueCount ?? overdueList.length) || overdueList.length;

    return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="ds-section">
            <h3 class="text-sm font-bold text-slate-600 mb-4">ภาพรวมการดำเนินการ</h3>
            <div class="flex items-center gap-6">
                <div class="relative flex-shrink-0">
                    <svg width="88" height="88" viewBox="0 0 80 80" style="transform:rotate(-90deg)">
                        <circle cx="40" cy="40" r="34" fill="none" stroke="#e2e8f0" stroke-width="8"/>
                        <circle cx="40" cy="40" r="34" fill="none" stroke="${closureColor}" stroke-width="8"
                                stroke-dasharray="${dashFill} ${dashGap}" stroke-linecap="round"/>
                    </svg>
                    <div class="absolute inset-0 flex items-center justify-center">
                        <span class="text-lg font-extrabold" style="color:${closureColor}">${closureRate}%</span>
                    </div>
                </div>
                <div class="space-y-2.5 flex-1">
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-slate-500">Closure Rate</span>
                        <span class="font-bold" style="color:${closureColor}">${closureRate}%</span>
                    </div>
                    <div class="h-px bg-slate-100"></div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-slate-500">ปิดแล้ว</span>
                        <span class="font-bold text-emerald-600">${parseInt(kpi.closed)||0} รายการ</span>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-slate-500">ค้างนาน (&gt;${OVERDUE_DAYS} วัน)</span>
                        <span class="font-bold" style="color:${overdueList.length > 0 ? '#ef4444' : '#94a3b8'}">${overdueList.length} รายการ</span>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-slate-500">รอดำเนินการ</span>
                        <span class="font-bold" style="color:${(parseInt(kpi.pending)||0) > 0 ? '#d97706' : '#94a3b8'}">${parseInt(kpi.pending)||0} รายการ</span>
                    </div>
                </div>
                ${_noticeFilter.trainingRequired ? `
                <div class="px-4 pb-4">
                    <div class="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-2 flex items-center justify-between gap-3">
                        <p class="text-xs font-bold text-sky-700">กรองเฉพาะ Notice ที่ต้องจัด Training Matrix / Training Required only</p>
                        <button type="button" id="notice-clear-training-filter" class="text-xs font-black text-sky-700 hover:underline">ล้างตัวกรอง / Clear</button>
                    </div>
                </div>` : ''}
            </div>
        </div>

        <div class="ds-section overflow-hidden">
            <div class="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <h3 class="text-sm font-bold text-slate-700">รายการค้างนาน</h3>
                ${overdueList.length > 5
                    ? `<span class="ml-auto text-xs text-slate-400">แสดง 5 จาก ${overdueList.length} รายการ</span>`
                    : overdueList.length > 0
                        ? `<span class="ml-auto text-xs font-semibold text-red-600">${overdueList.length} รายการ</span>`
                        : ''}
            </div>
            ${overdueRows || `
            <div class="flex flex-col items-center justify-center py-8 text-slate-400">
                <svg class="w-8 h-8 mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p class="text-sm font-medium">ไม่มีรายการค้างนาน</p>
                <p class="text-xs mt-0.5">ทุกรายการอยู่ในระยะดำเนินการปกติ</p>
            </div>`}
        </div>
    </div>`;
}

function _buildQuickAccess() {
    return `
    <div class="ds-section overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div class="flex items-center gap-3">
                <span class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#064e3b,#0d9488)">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7h18M6 7v12m12-12v12M8 11h3m2 0h3M8 15h8"/>
                    </svg>
                </span>
                <div>
                    <p class="text-[11px] font-black uppercase tracking-wider text-emerald-600">4M Command Center</p>
                    <h3 class="text-base font-black text-slate-800 mt-0.5">ภาพรวมการเปลี่ยนแปลง 4M / Change Overview</h3>
                </div>
            </div>
            <div class="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div class="flex flex-wrap gap-2">
                    <div class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        <label class="text-[11px] font-bold text-slate-400 whitespace-nowrap" for="fourm-stats-year">Year</label>
                        <select id="fourm-stats-year" class="bg-transparent text-xs font-bold text-slate-700 outline-none">
                            ${[0,1,2].map(i => { const y = new Date().getFullYear()-i; return `<option value="${y}" ${y===_statsYear?'selected':''}>${y}</option>`; }).join('')}
                        </select>
                    </div>
                    <button type="button" id="btn-add-notice" class="px-3 py-2 rounded-lg text-xs font-bold text-white"
                            style="background:linear-gradient(135deg,#059669,#0d9488)">
                        + สร้าง Notice
                    </button>
                    <button type="button" class="fourm-kpi-nav px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                            data-filter-status="all" data-filter-mine="1">
                        รายการของฉัน
                    </button>
                    <button type="button" onclick="window._fourmExportDashPDF&&window._fourmExportDashPDF()"
                            class="px-3 py-2 rounded-lg border border-indigo-200 text-xs font-bold text-indigo-700 hover:bg-indigo-50">
                        ส่งออก PDF
                    </button>
                </div>
            </div>
        </div>
        <div class="p-5">
            <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.9fr)] gap-5">
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">ระบบที่เกี่ยวข้อง / Linked Systems</p>
                        <span class="hidden md:inline text-[11px] text-slate-400">ตรวจสอบ รายงาน และระบบเดิมที่เกี่ยวข้อง</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        ${EXTERNAL_SYSTEMS.map(s => `
                        <div class="flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-md"
                             style="background:${s.light};border-color:${s.color}30">
                            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                 style="background:linear-gradient(135deg,${s.color},${s.color}bb);box-shadow:0 4px 14px ${s.color}40">
                                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">${s.icon}</svg>
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="font-bold text-slate-800 text-sm truncate">${s.title}</p>
                                <p class="text-[11px] text-slate-500 mt-0.5 leading-snug">${s.desc.substring(0, 58)}...</p>
                            </div>
                            <a href="${s.url}" target="_blank" rel="noopener noreferrer"
                               class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white"
                               style="background:linear-gradient(135deg,${s.color},${s.color}cc);box-shadow:0 2px 8px ${s.color}30" title="เปิดระบบ">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                                </svg>
                            </a>
                        </div>`).join('')}
                    </div>
                </div>
                <div class="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">แบบฟอร์มที่เกี่ยวข้อง</p>
                            <p class="text-xs text-slate-500 mt-0.5">เอกสารใช้งานกับ 4M Change</p>
                        </div>
                        ${_isAdmin ? `
                        <button id="btn-add-fourm-form-dash"
                                class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
                                style="background:linear-gradient(135deg,#6366f1,#0284c7)">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                            </svg>
                            อัปโหลด
                        </button>
                        ` : ''}
                    </div>
                    <div id="fourm-forms-dash">
                        <div class="flex justify-center py-6">
                            <div class="animate-spin h-5 w-5 border-2 border-indigo-400 border-t-transparent rounded-full"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

function _buildQuickAccessLegacy() {
    return `
    <div class="ds-section overflow-hidden">
        <div class="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#6366f1,#0284c7)">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
                </svg>
            </span>
            <h3 class="text-sm font-bold text-slate-700">เครื่องมือ & แบบฟอร์ม</h3>
        </div>
        <div class="p-5">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2">
                    <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">ระบบที่เกี่ยวข้อง</p>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        ${EXTERNAL_SYSTEMS.map(s => `
                        <div class="flex flex-col items-center gap-3 p-4 rounded-xl border transition-all hover:shadow-md"
                             style="background:${s.light};border-color:${s.color}30">
                            <div class="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                                 style="background:linear-gradient(135deg,${s.color},${s.color}bb);box-shadow:0 4px 14px ${s.color}40">
                                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">${s.icon}</svg>
                            </div>
                            <div class="flex-1 text-center">
                                <p class="font-bold text-slate-800 text-sm">${s.title}</p>
                                <p class="text-xs text-slate-500 mt-1 leading-relaxed">${s.desc.substring(0, 55)}…</p>
                            </div>
                            <a href="${s.url}" target="_blank" rel="noopener noreferrer"
                               class="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white"
                               style="background:linear-gradient(135deg,${s.color},${s.color}cc);box-shadow:0 2px 8px ${s.color}35">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                                </svg>
                                เปิดระบบ
                            </a>
                        </div>`).join('')}
                    </div>
                </div>
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">แบบฟอร์มที่เกี่ยวข้อง</p>
                        ${_isAdmin ? `
                        <button id="btn-add-fourm-form-dash"
                                class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
                                style="background:linear-gradient(135deg,#6366f1,#0284c7)">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                            </svg>
                            อัปโหลด
                        </button>
                        ` : ''}
                    </div>
                    <div id="fourm-forms-dash">
                        <div class="flex justify-center py-6">
                            <div class="animate-spin h-5 w-5 border-2 border-indigo-400 border-t-transparent rounded-full"></div>
                        </div>
                    </div>
                </div>
            </div>
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
    const deptList = [..._departments];
    if (_noticeFilter.dept && _noticeFilter.dept !== 'all' && !deptList.includes(_noticeFilter.dept)) deptList.unshift(_noticeFilter.dept);
    const deptOpts = `<option value="all">ทุกแผนก</option>${deptList.map(d => `<option value="${escHtml(d)}" ${_noticeFilter.dept===d?'selected':''}>${escHtml(d)}</option>`).join('')}`;
    const curStatusVal = _noticeFilter.overdue ? 'overdue' : _noticeFilter.status;

    container.innerHTML = `
        <div class="space-y-4">
            <div class="ds-section p-5">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-500">Change Notice Control</p>
                        <h2 class="text-lg font-black text-slate-800 mt-1">รายการแจ้งเปลี่ยนแปลง / Change Notice</h2>
                        <p class="text-sm text-slate-500 mt-1">ใช้ติดตามรายการเปิดใหม่ งานรอดำเนินการ และรายการที่เกินระยะติดตาม</p>
                    </div>
                    <p class="text-xs text-slate-400">เลข Notice และผู้รับผิดชอบจะอ้างอิงจากข้อมูลที่บันทึกในระบบ</p>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button data-notice-focus="Open" class="text-left ds-metric-card is-info hover:shadow-sm transition-all">
                    <p class="text-[11px] font-bold uppercase text-sky-600">รายการเปิดอยู่ / Active</p>
                    <p class="text-sm font-black text-sky-800 mt-1">Change Notice ที่กำลังติดตาม</p>
                </button>
                <button data-notice-focus="Pending" class="text-left ds-metric-card is-warn hover:shadow-sm transition-all">
                    <p class="text-[11px] font-bold uppercase text-amber-600">รอดำเนินการ / Pending</p>
                    <p class="text-sm font-black text-amber-800 mt-1">รายการที่ต้องติดตามต่อ</p>
                </button>
                <button data-notice-focus="overdue" class="text-left ds-metric-card is-risk hover:shadow-sm transition-all">
                    <p class="text-[11px] font-bold uppercase text-rose-600">เกินกำหนด / Overdue</p>
                    <p class="text-sm font-black text-rose-800 mt-1">รายการที่ต้องเร่งทบทวน</p>
                </button>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)] overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-indigo-50/60 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5h6m-6 4h6m-7 4h8m-9 6h10a2 2 0 002-2V7.5L14.5 3H7a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                            </svg>
                        </span>
                        <div class="min-w-0">
                            <p class="text-[11px] font-black uppercase tracking-wider text-indigo-500">Notice Register</p>
                            <h3 class="text-sm font-black text-slate-800 truncate">ทะเบียน Change Notice</h3>
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button" data-notice-focus="Open" class="px-3 py-2 rounded-xl border text-xs font-black ${curStatusVal==='Open' ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}">Open</button>
                        <button type="button" data-notice-focus="Pending" class="px-3 py-2 rounded-xl border text-xs font-black ${curStatusVal==='Pending' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}">Pending</button>
                        <button type="button" data-notice-focus="overdue" class="px-3 py-2 rounded-xl border text-xs font-black ${curStatusVal==='overdue' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}">Overdue</button>
                        <button id="notice-filter-mine"
                                class="px-3 py-2 rounded-xl text-xs font-black border transition-colors ${_noticeFilter.mine ? 'text-indigo-700 border-indigo-200 bg-indigo-50' : 'text-slate-600 border-slate-200 bg-white hover:bg-slate-50'}">
                            My Notices
                        </button>
                    </div>
                </div>
                <div class="p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-3 xl:items-end">
                    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[110px_160px_150px_minmax(180px,1fr)] gap-2.5">
                        <label class="block">
                            <span class="block text-[11px] font-bold text-slate-400 mb-1">Year</span>
                            <select id="notice-filter-year" class="form-input py-2 text-sm w-full">${yearOpts}</select>
                        </label>
                        <label class="block">
                            <span class="block text-[11px] font-bold text-slate-400 mb-1">Status</span>
                            <select id="notice-filter-status" class="form-input py-2 text-sm w-full">
                        <option value="all"     ${curStatusVal==='all'    ?'selected':''}>ทุกสถานะ</option>
                        <option value="Open"    ${curStatusVal==='Open'   ?'selected':''}>Open</option>
                        <option value="Pending" ${curStatusVal==='Pending'?'selected':''}>รอดำเนินการ</option>
                        <option value="Closed"  ${curStatusVal==='Closed' ?'selected':''}>ปิดแล้ว</option>
                        <option value="overdue" ${curStatusVal==='overdue'?'selected':''}>ค้างนาน (&gt;${OVERDUE_DAYS} วัน)</option>
                            </select>
                        </label>
                        <label class="block">
                            <span class="block text-[11px] font-bold text-slate-400 mb-1">Type</span>
                            <select id="notice-filter-type" class="form-input py-2 text-sm w-full">
                        <option value="all" ${_noticeFilter.type==='all'?'selected':''}>ทุก Type</option>
                        ${CHANGE_TYPES.map(t => `<option value="${t}" ${_noticeFilter.type===t?'selected':''}>${t}</option>`).join('')}
                            </select>
                        </label>
                        <label class="block">
                            <span class="block text-[11px] font-bold text-slate-400 mb-1">Department</span>
                            <select id="notice-filter-dept" class="form-input py-2 text-sm w-full">${deptOpts}</select>
                        </label>
                    </div>
                    <div class="flex flex-col sm:flex-row gap-2">
                        <div class="relative flex-1 sm:min-w-[320px]">
                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input id="notice-search" type="text" placeholder="Notice No / หัวข้อ / ผู้รับผิดชอบ..."
                                   value="${escHtml(_noticeFilter.q)}" class="form-input w-full pl-9 text-sm py-2.5">
                        </div>
                        <button id="btn-export-notices"
                                    class="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                            </svg>
                            Excel
                        </button>
                        <button id="btn-add-notice"
                                    class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white whitespace-nowrap"
                                style="background:linear-gradient(135deg,#6366f1,#0284c7);box-shadow:0 2px 8px rgba(99,102,241,0.3)">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                            </svg>
                            New Notice
                        </button>
                    </div>
                </div>
            </div>

            <div class="ds-table-wrap">
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
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
        if (_noticeFilter.mine) p.set('mine', '1');
        if (_noticeFilter.trainingRequired) p.set('trainingRequired', '1');
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
                        ${isOverdue ? dsStatusBadge('Overdue', { label: `ค้าง ${daysOld - OVERDUE_DAYS} วัน` }) : ''}
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
                    ${dsStatusBadge(r.Status || '-', { label: sm.label })}
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${closeDate}</td>
                <td class="px-4 py-3 text-right">
                    <div class="flex items-center gap-1 justify-end">
                        <button class="btn-notice-view px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" data-id="${r.id}">ดู</button>
                        ${canClose ? `<button class="btn-notice-close px-2 py-1 rounded-lg text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors" data-id="${r.id}" data-no="${escHtml(r.NoticeNo)}">ปิด</button>` : ''}
                        ${_isAdmin && r.Status === 'Open' ? `<button class="btn-notice-pending px-2 py-1 rounded-lg text-xs font-semibold text-amber-600 hover:bg-amber-50 transition-colors" data-id="${r.id}" data-no="${escHtml(r.NoticeNo)}">Pending</button>` : ''}
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
        'Safety Impact':   r.SafetyImpact || 'N/A',
        'Quality Impact':  r.QualityImpact || 'N/A',
        'Production Impact': r.ProductionImpact || 'N/A',
        'Environment Impact': r.EnvironmentImpact || 'N/A',
        'Training Required': Number(r.TrainingRequired || 0) ? 'Yes' : 'No',
        'Impact Note':     r.ImpactNote || '',
        'แผนก':            r.Department || '',
        'ผู้รับผิดชอบ':     r.ResponsiblePerson || '',
        'สถานะ':           r.Status || '',
        'อายุรายการ (วัน)': r.Status === 'Closed' || !r.RequestDate ? '' : Math.max(0, Math.floor((Date.now() - new Date(r.RequestDate)) / 86400000)),
        'เกินกำหนด':       r.Status === 'Closed' || !r.RequestDate ? '' : Math.floor((Date.now() - new Date(r.RequestDate)) / 86400000) > OVERDUE_DAYS ? 'Yes' : 'No',
        'วันที่ปิด':        r.ClosedDate ? r.ClosedDate.split('T')[0] : '',
        'สร้างโดย':        r.CreatedBy || '',
        'ความคิดเห็นปิด':  r.ClosingComment || '',
        'ไฟล์ Notice':      r.AttachmentUrl ? 'Yes' : 'No',
        'ไฟล์ปิดงาน':       r.ClosingDocUrl ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Change Notices');
    XLSX.writeFile(wb, `4M_Change_Notices_${_noticeFilter.year}.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Notice Forms
// ─────────────────────────────────────────────────────────────────────────────
async function showNoticeForm(existing = null) {
    const r     = normalizeApiObject(existing);
    const today = new Date().toISOString().split('T')[0];
    const ownerName = r?.ResponsiblePerson || _currentUser.name || _currentUser.EmployeeName || _currentUser.id || '';
    let previewNoticeNo = r?.NoticeNo || 'Loading...';
    if (!existing) {
        try {
            const nextRes = await API.get(`/fourm/notice-next-no?date=${encodeURIComponent(today)}`);
            previewNoticeNo = nextRes?.data?.NoticeNo || nextRes?.data?.data?.NoticeNo || normalizeApiObject(nextRes)?.NoticeNo || 'Auto';
        } catch (_) {
            previewNoticeNo = 'Auto';
        }
    }
    const html  = `
        <form id="notice-form" class="space-y-4" enctype="multipart/form-data">
            <div class="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-sm text-slate-600">
                <p class="font-bold text-indigo-700">ข้อมูลประกอบการบันทึก / Notice Guidance</p>
                <p class="mt-1 leading-relaxed">ระบบสร้าง Notice No ให้อัตโนมัติ ผู้บันทึกปัจจุบันเป็นผู้รับผิดชอบรายการ และสามารถแนบหลักฐานประกอบได้เมื่อมีเอกสารที่เกี่ยวข้อง</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">Notice No</label>
                    <div class="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-sky-50 px-3 py-2">
                        <input id="notice-preview-no" type="text" class="w-full bg-transparent font-mono text-sm font-black text-indigo-700 outline-none" readonly
                               value="${escHtml(previewNoticeNo)}" placeholder="Auto">
                        ${existing ? '' : '<p class="mt-0.5 text-[11px] font-semibold text-slate-500">เลขนี้จะถูกใช้เมื่อบันทึก หากไม่มีรายการอื่นถูกสร้างในเวลาเดียวกัน</p>'}
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่ขอเปลี่ยน <span class="text-red-500">*</span></label>
                    <input type="date" id="notice-request-date" name="RequestDate" class="form-input w-full" required
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
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">Change Type <span class="text-red-500">*</span></label>
                    <select name="ChangeType" class="form-input w-full" required>
                        ${CHANGE_TYPES.map(t => `<option value="${t}" ${r?.ChangeType===t?'selected':''}>${t}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก</label>
                    ${_departments.length
                        ? `<select name="Department" class="form-input w-full">
                               <option value="">— ไม่ระบุ —</option>
                               ${_departments.map(d => `<option value="${escHtml(d)}" ${(r?.Department||'').trim()===d?'selected':''}>${escHtml(d)}</option>`).join('')}
                               ${r?.Department && !_departments.includes((r.Department||'').trim())
                                   ? `<option value="${escHtml(r.Department)}" selected>${escHtml(r.Department)}</option>` : ''}
                           </select>`
                        : `<input type="text" name="Department" class="form-input w-full" value="${escHtml(r?.Department||'')}" placeholder="แผนก">`
                    }
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้รับผิดชอบ</label>
                <input type="text" class="form-input w-full bg-slate-50 text-slate-500" readonly disabled
                       value="${escHtml(ownerName)}" placeholder="Owner">
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                <div>
                    <p class="text-sm font-bold text-slate-700">Impact Assessment / ประเมินผลกระทบ</p>
                    <p class="text-xs text-slate-500 mt-1">เลือกระดับผลกระทบเบื้องต้นของการเปลี่ยนแปลง เพื่อให้ Admin ใช้ติดตามความเสี่ยงได้ชัดเจนขึ้น</p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    ${IMPACT_FIELDS.map(field => `
                        <div>
                            <label class="block text-xs font-semibold text-slate-500 mb-1">${field.label}</label>
                            ${impactSelect(field.key, r?.[field.key] || 'N/A')}
                        </div>
                    `).join('')}
                </div>
                <label class="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <input type="checkbox" name="TrainingRequired" value="1" class="rounded border-slate-300 text-indigo-600"
                           ${Number(r?.TrainingRequired || 0) ? 'checked' : ''}>
                    ต้องอบรม/สื่อสารเพิ่มเติม / Training Required
                </label>
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1">Impact Note / หมายเหตุผลกระทบ</label>
                    <textarea name="ImpactNote" rows="2" class="form-input w-full resize-none"
                              placeholder="ระบุรายละเอียดผลกระทบหรือการควบคุมเบื้องต้น...">${escHtml(r?.ImpactNote || '')}</textarea>
                </div>
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

    if (!existing) {
        document.getElementById('notice-request-date')?.addEventListener('change', async (e) => {
            const input = document.getElementById('notice-preview-no');
            if (!input) return;
            input.value = 'Loading...';
            try {
                const nextRes = await API.get(`/fourm/notice-next-no?date=${encodeURIComponent(e.target.value || today)}`);
                input.value = nextRes?.data?.NoticeNo || nextRes?.data?.data?.NoticeNo || normalizeApiObject(nextRes)?.NoticeNo || 'Auto';
            } catch (_) {
                input.value = 'Auto';
            }
        });
    }

    document.getElementById('notice-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
        e.preventDefault();
        const btn = document.getElementById('notice-save-btn');
        btn.disabled = true; btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>กำลังบันทึก...`;
        try {
            showLoading('กำลังบันทึก...');
            const fd = new FormData(e.target);
            const attachment = fd.get('attachment');
            if (attachment instanceof File && attachment.name === '' && attachment.size === 0) {
                fd.delete('attachment');
            }
            if (!fd.has('TrainingRequired')) fd.set('TrainingRequired', '0');
            if (existing) { await API.put(`/fourm/notices/${r.id}`, fd); }
            else          { await API.post('/fourm/notices', fd); }
            closeModal();
            showToast(existing ? 'อัปเดต Change Notice สำเร็จ' : 'สร้าง Change Notice สำเร็จ', 'success');
            await fetchAndRenderNotices();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; btn.textContent = 'บันทึก'; }
    }));
}

async function showNoticeDetail(id) {
    try {
        showLoading('กำลังโหลด...');
        const res = await API.get(`/fourm/notices/${id}`);
        const r   = normalizeApiObject(res?.data ?? res);
        const taskRes = await API.get(`/fourm/notices/${id}/tasks`).catch(() => ({ data: [] }));
        const tasks = normalizeApiArray(taskRes?.data ?? taskRes);
        hideLoading();

        const isImage = u => u && /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
        const fmtDate = d => d ? new Date(d).toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' }) : null;
        const tm = TYPE_META[r.ChangeType] || { bg:'#f8fafc', text:'#64748b', dot:'#94a3b8' };
        const canManageTasks = r.Status !== 'Closed' && (_isAdmin || String(_currentUser.id || _currentUser.EmployeeID || '') === String(r.CreatedByID || ''));

        // Timeline: Open → Pending → Closed
        const TIMELINE_STEPS = [
            { key:'Open',    label:'เปิด Notice',     date: fmtDate(r.RequestDate) },
            { key:'Pending', label:'รอดำเนินการ',     date: null },
            { key:'Closed',  label:'ปิด Notice',      date: fmtDate(r.ClosedDate) },
        ];
        const STATUS_ORDER = { Open:0, Pending:1, Closed:2 };
        const currentIdx   = STATUS_ORDER[r.Status] ?? 0;

        const timelineHtml = `
        <div class="flex items-start gap-0 py-2">
            ${TIMELINE_STEPS.map((step, i) => {
                const isDone    = i < currentIdx;
                const isCurrent = i === currentIdx;
                const isLast    = i === TIMELINE_STEPS.length - 1;
                const dotColor  = isDone ? '#059669' : isCurrent ? '#6366f1' : '#cbd5e1';
                const lineColor = isDone ? '#059669' : '#e2e8f0';
                const labelColor = isCurrent ? '#1e293b' : isDone ? '#059669' : '#94a3b8';
                return `
                <div class="flex flex-col items-center flex-1 relative">
                    <div class="w-7 h-7 rounded-full flex items-center justify-center z-10 flex-shrink-0 border-2"
                         style="background:${isDone||isCurrent ? dotColor+'22' : '#f8fafc'};border-color:${dotColor}">
                        ${isDone
                            ? `<svg class="w-3.5 h-3.5" fill="none" stroke="${dotColor}" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>`
                            : isCurrent
                                ? `<span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${dotColor}"></span>`
                                : `<span class="w-2 h-2 rounded-full inline-block bg-slate-200"></span>`
                        }
                    </div>
                    ${!isLast ? `<div class="absolute top-3.5 left-1/2 w-full h-0.5" style="background:${lineColor}"></div>` : ''}
                    <p class="text-[11px] font-semibold mt-1.5 text-center" style="color:${labelColor}">${step.label}</p>
                    ${step.date ? `<p class="text-[10px] text-center mt-0.5" style="color:#94a3b8">${step.date}</p>` : ''}
                </div>`;
            }).join('')}
        </div>`;

        const html = `
            <div class="space-y-4 text-sm">
                <div class="px-4 py-3 rounded-xl border border-slate-100 bg-slate-50">
                    ${timelineHtml}
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    ${infoBlock('วันที่ขอเปลี่ยน', fmtDate(r.RequestDate)||'-')}
                    ${infoBlock('ผู้รับผิดชอบ', escHtml(r.ResponsiblePerson||'-'))}
                    ${infoBlock('แผนก', escHtml(r.Department||'-'))}
                    ${infoBlock('สร้างโดย', escHtml(r.CreatedBy||'-'))}
                </div>

                ${r.Description ? `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">รายละเอียด</p>
                    <p class="text-slate-700 leading-relaxed whitespace-pre-wrap">${escHtml(r.Description)}</p>
                </div>` : ''}

                <div class="p-3 bg-white rounded-xl border border-slate-100">
                    <div class="flex items-center justify-between gap-3 mb-3">
                        <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Impact Assessment</p>
                        ${Number(r.TrainingRequired || 0)
                            ? '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Training Required</span>'
                            : '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-50 text-slate-500 border border-slate-200">No Training Flag</span>'}
                    </div>
                    ${Number(r.TrainingRequired || 0) ? `
                    <div class="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                            <p class="text-xs font-black text-indigo-700">ต้องเชื่อม Training Matrix</p>
                            <p class="text-[11px] text-indigo-600 mt-0.5">เปิด scope ตามปีและแผนกของ Notice นี้เพื่อจัดหลักสูตร/พนักงานต่อ</p>
                        </div>
                        <button type="button" class="btn-notice-open-training px-3 py-1.5 rounded-lg text-xs font-black text-white"
                                style="background:linear-gradient(135deg,#6366f1,#0284c7)"
                                data-year="${r.RequestDate ? new Date(r.RequestDate).getFullYear() : _tmFilter.year}"
                                data-dept="${escHtml(r.Department || '')}">
                            เปิด Training Matrix
                        </button>
                    </div>` : ''}
                    <div class="grid grid-cols-2 gap-2">
                        ${IMPACT_FIELDS.map(field => `
                            <div class="rounded-lg border border-slate-100 bg-slate-50 p-2">
                                <p class="text-[11px] text-slate-400 font-semibold mb-1">${field.label}</p>
                                ${impactBadge(r[field.key] || 'N/A')}
                            </div>
                        `).join('')}
                    </div>
                    ${r.ImpactNote ? `<p class="text-slate-600 leading-relaxed whitespace-pre-wrap mt-3">${escHtml(r.ImpactNote)}</p>` : ''}
                </div>

                <div class="p-3 bg-white rounded-xl border border-slate-100">
                    <div class="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Action Plan / Follow-up Task</p>
                            <p class="text-xs text-slate-500 mt-1">ติดตามงานย่อยที่ต้องทำก่อนปิดหรือทบทวน Change Notice</p>
                        </div>
                        ${canManageTasks ? `
                            <button class="btn-fourm-task-add px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100"
                                    data-notice-id="${r.id}" data-notice-no="${escHtml(r.NoticeNo || '')}">
                                เพิ่มงาน
                            </button>` : ''}
                    </div>
                    ${renderTaskList(tasks, canManageTasks)}
                </div>

                ${r.ClosingComment ? `
                <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">ผลการดำเนินการ</p>
                    <p class="text-slate-700 leading-relaxed">${escHtml(r.ClosingComment)}</p>
                    <p class="text-xs text-slate-400 mt-1.5">ปิดโดย ${escHtml(r.ClosedBy||'-')} · ${fmtDate(r.ClosedDate)||'-'}</p>
                </div>` : ''}

                ${(r.AttachmentUrl||r.ClosingDocUrl) ? `
                <div>
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">ไฟล์แนบ</p>
                    <div class="flex flex-wrap gap-2">
                        ${r.AttachmentUrl ? buildFileChip(r.AttachmentUrl, 'ไฟล์แนบ (Notice)',  isImage(r.AttachmentUrl)) : ''}
                        ${r.ClosingDocUrl ? buildFileChip(r.ClosingDocUrl, 'เอกสารปิด Notice', isImage(r.ClosingDocUrl)) : ''}
                    </div>
                </div>` : ''}
            </div>`;

        const footer = `
            <div class="flex justify-end pt-3 border-t border-slate-100">
                <button onclick="window._fourmExportNoticePDF('${r.id}')"
                        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                        style="background:linear-gradient(135deg,#6366f1,#0284c7);box-shadow:0 2px 8px rgba(99,102,241,0.3)">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    ดาวน์โหลด PDF
                </button>
            </div>`;

        openDetailModal({
            title: escHtml(r.Title || 'Change Notice'),
            subtitle: `${r.NoticeNo || '-'} / ${r.Department || '-'}`,
            meta: [
                { label: r.Status || '-', className: r.Status === 'Closed' ? 'bg-slate-50 text-slate-600 border-slate-200' : r.Status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-sky-50 text-sky-700 border-sky-200' },
                { label: r.ChangeType || '-', className: 'border-slate-200', dot: TYPE_META[r.ChangeType]?.dot || tm.text },
            ],
            body: html,
            footer,
            size: 'max-w-2xl',
        });
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

    document.getElementById('close-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
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
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: PDF ต่อ Notice
// ─────────────────────────────────────────────────────────────────────────────
window._fourmExportNoticePDF = async function(id) {
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        showToast('ไม่พบ library สำหรับ PDF', 'error'); return;
    }
    showToast('กำลังสร้าง PDF...', 'info');
    try {
        const res = await API.get(`/fourm/notices/${id}`);
        const r   = normalizeApiObject(res?.data ?? res);
        const taskRes = await API.get(`/fourm/notices/${id}/tasks`).catch(() => ({ data: [] }));
        const tasks = normalizeApiArray(taskRes?.data ?? taskRes);

        const fmtDate = d => d ? new Date(d).toLocaleDateString('th-TH', { day:'numeric', month:'long', year:'numeric' }) : '—';
        const tm      = TYPE_META[r.ChangeType] || { bg:'#f8fafc', text:'#64748b' };
        const STATUS_ORDER = { Open:0, Pending:1, Closed:2 };
        const curIdx  = STATUS_ORDER[r.Status] ?? 0;
        const STEPS   = [
            { label:'เปิด Notice',   date: fmtDate(r.RequestDate) },
            { label:'รอดำเนินการ',  date: '' },
            { label:'ปิด Notice',    date: r.ClosedDate ? fmtDate(r.ClosedDate) : '' },
        ];

        const taskTotal = tasks.length;
        const taskDone = tasks.filter(t => t.Status === 'Done').length;
        const taskOpen = taskTotal - taskDone;
        const highImpactCount = IMPACT_FIELDS.filter(field => r[field.key] === 'High').length;
        const mediumImpactCount = IMPACT_FIELDS.filter(field => r[field.key] === 'Medium').length;
        const evidenceRows = [
            r.AttachmentUrl ? ['Notice Attachment', r.AttachmentUrl] : null,
            r.ClosingDocUrl ? ['Closing Evidence', r.ClosingDocUrl] : null,
        ].filter(Boolean);
        const reviewRows = [
            ['Prepared / Submitted', r.CreatedBy || '-', fmtDate(r.RequestDate)],
            ['Current Status', r.Status || '-', r.UpdatedAt ? fmtDate(r.UpdatedAt) : '-'],
            r.ClosedDate ? ['Closed', r.ClosedBy || '-', fmtDate(r.ClosedDate)] : null,
        ].filter(Boolean);

        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;font-family:Kanit,sans-serif';
        div.innerHTML = `
        <div class="fourm-pdf-page" style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;overflow:hidden">
            <!-- Header gradient -->
            <div style="background:#065f46;padding:24px 34px 22px;position:relative;overflow:hidden">
                <div style="display:none">
                    <svg width="100%" height="100%"><defs><pattern id="pd" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#pd)"/></svg>
                </div>
                <div style="position:relative;z-index:1">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
                        <span style="font-family:monospace;font-size:13px;font-weight:700;background:rgba(255,255,255,0.18);color:#fff;padding:4px 12px;border-radius:20px">${escHtml(r.NoticeNo||'—')}</span>
                        <span style="font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;background:${tm.bg};color:${tm.text}">${escHtml(r.ChangeType||'—')}</span>
                        <span style="font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;background:rgba(255,255,255,0.18);color:#e0e7ff">${escHtml(r.Status||'—')}</span>
                    </div>
                    <h1 style="color:#fff;font-size:21px;font-weight:800;margin:0 0 4px;line-height:1.24">${escHtml(r.Title||'—')}</h1>
                    <p style="color:rgba(199,210,254,0.85);font-size:12px;margin:0">4M Change Management · Thai Summit Harness Co., Ltd.</p>
                </div>
            </div>

            <!-- Timeline -->
            <div style="padding:14px 34px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
                <div style="display:flex;align-items:flex-start;gap:0">
                    ${STEPS.map((s, i) => {
                        const done = i < curIdx, cur = i === curIdx, last = i === STEPS.length-1;
                        const dot  = done ? '#059669' : cur ? '#6366f1' : '#cbd5e1';
                        return `
                        <div style="flex:1;display:flex;flex-direction:column;align-items:center;position:relative">
                            <div style="width:28px;height:28px;border-radius:50%;border:2.5px solid ${dot};background:${done||cur ? dot+'22' : '#f8fafc'};display:flex;align-items:center;justify-content:center;z-index:1;flex-shrink:0">
                                ${done
                                    ? `<svg width="14" height="14" fill="none" stroke="${dot}" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`
                                    : `<span style="width:${cur?10:8}px;height:${cur?10:8}px;border-radius:50%;background:${dot};display:inline-block"></span>`
                                }
                            </div>
                            ${!last ? `<div style="position:absolute;top:14px;left:50%;width:100%;height:2px;background:${done?'#059669':'#e2e8f0'}"></div>` : ''}
                            <p style="font-size:10px;font-weight:700;margin:5px 0 1px;color:${cur?'#1e293b':done?'#059669':'#94a3b8'};text-align:center">${s.label}</p>
                            ${s.date ? `<p style="font-size:10px;color:#94a3b8;text-align:center;margin:0">${s.date}</p>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <div style="padding:16px 34px;border-bottom:1px solid #f1f5f9">
                <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px">Control Summary</p>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
                    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px">
                        <p style="font-size:9px;font-weight:700;color:#94a3b8;margin:0 0 4px">HIGH IMPACT</p>
                        <p style="font-size:20px;font-weight:800;color:${highImpactCount ? '#e11d48' : '#059669'};margin:0">${highImpactCount}</p>
                    </div>
                    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px">
                        <p style="font-size:9px;font-weight:700;color:#94a3b8;margin:0 0 4px">MEDIUM IMPACT</p>
                        <p style="font-size:20px;font-weight:800;color:${mediumImpactCount ? '#d97706' : '#64748b'};margin:0">${mediumImpactCount}</p>
                    </div>
                    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px">
                        <p style="font-size:9px;font-weight:700;color:#94a3b8;margin:0 0 4px">ACTION OPEN</p>
                        <p style="font-size:20px;font-weight:800;color:${taskOpen ? '#d97706' : '#059669'};margin:0">${taskOpen}</p>
                    </div>
                    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px">
                        <p style="font-size:9px;font-weight:700;color:#94a3b8;margin:0 0 4px">ACTION DONE</p>
                        <p style="font-size:20px;font-weight:800;color:#059669;margin:0">${taskDone}/${taskTotal}</p>
                    </div>
                </div>
            </div>

            <!-- Info grid -->
            <div style="padding:16px 34px;display:grid;grid-template-columns:1fr 1fr;gap:10px;border-bottom:1px solid #f1f5f9">
                ${[
                    ['วันที่ขอเปลี่ยน', fmtDate(r.RequestDate)],
                    ['ผู้รับผิดชอบ',    r.ResponsiblePerson||'—'],
                    ['แผนก',            r.Department||'—'],
                    ['สร้างโดย',        r.CreatedBy||'—'],
                ].map(([l,v]) => `
                    <div style="background:#f8fafc;padding:10px 12px;border-radius:10px;border:1px solid #f1f5f9">
                        <p style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin:0 0 4px">${l}</p>
                        <p style="font-size:13px;font-weight:600;color:#334155;margin:0">${escHtml(v)}</p>
                    </div>`).join('')}
            </div>

            <div style="padding:16px 34px;border-bottom:1px solid #f1f5f9">
                <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px">Impact Assessment</p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">
                    ${IMPACT_FIELDS.map(field => `
                    <div style="background:#f8fafc;border:1px solid #f1f5f9;border-radius:10px;padding:8px">
                        <p style="font-size:9px;font-weight:700;color:#94a3b8;margin:0 0 4px">${escHtml(field.label.split('/')[0].trim())}</p>
                        <p style="font-size:13px;font-weight:800;color:#334155;margin:0">${escHtml(r[field.key] || 'N/A')}</p>
                    </div>`).join('')}
                </div>
                <p style="font-size:11px;color:#475569;margin:10px 0 0">Training Required: ${Number(r.TrainingRequired || 0) ? 'Yes' : 'No'}</p>
                ${r.ImpactNote ? `<p style="font-size:12px;color:#475569;line-height:1.6;margin:8px 0 0">${escHtml(r.ImpactNote)}</p>` : ''}
            </div>

            <div style="margin-top:auto;padding:9px 34px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
                <span style="color:#64748b;font-size:11px">4M Change Notice Report - Thai Summit Harness Co., Ltd.</span>
                <span style="color:#64748b;font-size:11px">Page 1 / 2</span>
            </div>
        </div>

        <div class="fourm-pdf-page" style="width:794px;height:1122px;display:flex;flex-direction:column;background:#fff;overflow:hidden;margin-top:16px">
            <div style="padding:20px 34px 18px;background:#065f46;color:#fff;display:flex;align-items:flex-start;justify-content:space-between;gap:20px">
                <div>
                    <p style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a7f3d0;margin:0 0 6px">4M Change Notice Report</p>
                    <h2 style="font-size:18px;font-weight:800;line-height:1.25;margin:0">${escHtml(r.NoticeNo||'—')} · ${escHtml(r.Title||'—')}</h2>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <p style="font-size:10px;color:#a7f3d0;margin:0 0 4px">Page 2 / 2</p>
                    <p style="font-size:12px;font-weight:700;margin:0">${escHtml(r.Status||'—')}</p>
                </div>
            </div>

            <div style="padding:18px 34px;border-bottom:1px solid #f1f5f9">
                <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px">Action Plan / Follow-up Task</p>
                ${tasks.length ? `
                    <table style="width:100%;border-collapse:collapse;font-size:11px">
                        <thead>
                            <tr style="background:#065f46;color:#fff;text-align:left">
                                <th style="padding:8px;border:1px solid #e2e8f0">Task</th>
                                <th style="padding:8px;border:1px solid #e2e8f0">Owner</th>
                                <th style="padding:8px;border:1px solid #e2e8f0">Due</th>
                                <th style="padding:8px;border:1px solid #e2e8f0">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tasks.map(t => `
                                <tr>
                                    <td style="padding:8px;border:1px solid #e2e8f0;color:#334155">${escHtml(t.TaskTitle || '-')}</td>
                                    <td style="padding:8px;border:1px solid #e2e8f0;color:#334155">${escHtml(t.OwnerName || '-')}</td>
                                    <td style="padding:8px;border:1px solid #e2e8f0;color:#334155">${t.DueDate ? fmtDate(t.DueDate) : '-'}</td>
                                    <td style="padding:8px;border:1px solid #e2e8f0;color:#334155">${escHtml(t.Status || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : `<p style="font-size:12px;color:#94a3b8;margin:0">ยังไม่มี Action Plan สำหรับ Notice นี้</p>`}
            </div>

            ${r.Description ? `
            <div style="padding:18px 34px 0;border-bottom:1px solid #f1f5f9">
                <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">รายละเอียด</p>
                <p style="font-size:13px;color:#475569;line-height:1.7;margin:0 0 20px;white-space:pre-wrap">${escHtml(r.Description)}</p>
            </div>` : ''}

            ${r.ClosingComment ? `
            <div style="margin:16px 34px 0;padding:14px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0">
                <p style="font-size:10px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.06em;margin:0 0 6px">ผลการดำเนินการ</p>
                <p style="font-size:13px;color:#166534;line-height:1.6;margin:0 0 8px">${escHtml(r.ClosingComment)}</p>
                <p style="font-size:11px;color:#4ade80;margin:0">ปิดโดย ${escHtml(r.ClosedBy||'—')} · ${fmtDate(r.ClosedDate)}</p>
            </div>` : ''}

            ${evidenceRows.length ? `
            <div style="margin:14px 34px 0;padding:11px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:10px">
                <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">Evidence / Attachments</p>
                ${evidenceRows.map(([label, path]) => `
                    <div style="display:flex;justify-content:space-between;gap:12px;border-top:1px solid #f1f5f9;padding:7px 0 0;margin-top:7px">
                        <span style="font-size:11px;font-weight:700;color:#475569">${escHtml(label)}</span>
                        <span style="font-size:10px;color:#64748b;text-align:right;word-break:break-all">${escHtml(path)}</span>
                    </div>
                `).join('')}
            </div>` : ''}

            <div style="margin:14px 34px 0;padding:11px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
                <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">Review / Approval History</p>
                <table style="width:100%;border-collapse:collapse;font-size:10px">
                    <tbody>
                        ${reviewRows.map(([step, actor, date]) => `
                            <tr>
                                <td style="padding:5px 0;color:#475569;font-weight:700;border-top:1px solid #e2e8f0">${escHtml(step)}</td>
                                <td style="padding:5px 8px;color:#334155;border-top:1px solid #e2e8f0">${escHtml(actor)}</td>
                                <td style="padding:5px 0;color:#64748b;text-align:right;border-top:1px solid #e2e8f0">${escHtml(date)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div style="margin:16px 34px 0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
                ${['Prepared By', 'Checked By', 'Approved By'].map(label => `
                    <div style="height:72px;border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#fff">
                        <p style="font-size:9px;font-weight:700;color:#94a3b8;margin:0 0 28px">${label}</p>
                        <div style="border-top:1px solid #cbd5e1;padding-top:4px;font-size:9px;color:#94a3b8;text-align:center">Signature / Date</div>
                    </div>
                `).join('')}
            </div>

            <!-- Footer -->
            <div style="margin-top:auto;padding:9px 34px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
                <span style="color:#64748b;font-size:11px">4M Change Notice Report - Thai Summit Harness Co., Ltd.</span>
                <span style="color:#64748b;font-size:11px">Page 2 / 2 - Generated ${new Date().toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})}</span>
            </div>
        </div>`;

        document.body.appendChild(div);
        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
            const pages = Array.from(div.querySelectorAll('.fourm-pdf-page'));
            for (let i = 0; i < pages.length; i++) {
                const canvas = await html2canvas(pages[i], { scale:1.5, useCORS:true, backgroundColor:'#fff', logging:false });
                if (i > 0) pdf.addPage();
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
                pdf.setFontSize(8);
                pdf.setTextColor(100, 116, 139);
                pdf.text(`Page ${i + 1} / ${pages.length}`, 190, 291, { align: 'right' });
            }
            const safeNo = (r.NoticeNo||'notice').replace(/[^a-zA-Z0-9\-_]/g, '_');
            pdf.save(`4M_${safeNo}.pdf`);
            showToast('ดาวน์โหลด PDF สำเร็จ', 'success');
        } finally {
            document.body.removeChild(div);
        }
    } catch (err) { showError(err); }
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3: Man Record
// ─────────────────────────────────────────────────────────────────────────────
async function renderMan(container) {
    container.innerHTML = `
        <div class="space-y-4">
            <div class="ds-section p-5">
                <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-500">Man Record</p>
                <h2 class="text-lg font-black text-slate-800 mt-1">บันทึกคน / Man Record & Training Matrix</h2>
                <p class="text-sm text-slate-500 mt-1">ติดตามสรุปผลสอบและ Scope หลักสูตรรายปีสำหรับ 4M Change Management</p>
            </div>
            <div class="flex flex-wrap gap-2 border-b border-slate-200">
                <button type="button" data-man-subtab="summary"
                    class="fourm-man-subtab px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${_manSubtab === 'summary' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}">
                    สรุปผลสอบ / Exam Summary
                </button>
                <button type="button" data-man-subtab="matrix"
                    class="fourm-man-subtab px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${_manSubtab === 'matrix' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}">
                    ตารางอบรม / Training Matrix
                </button>
            </div>
            <div id="fourm-man-subtab-content"></div>
        </div>`;
    const inner = document.getElementById('fourm-man-subtab-content');
    if (_manSubtab === 'matrix') await renderTrainingMatrix(inner);
    else await renderManSummary(inner);
}

async function renderManSummary(container) {
    const yearOpts = [0,1,2].map(i => { const y = new Date().getFullYear()-i; return `<option value="${y}" ${y===_manFilter.year?'selected':''}>${y}</option>`; }).join('');
    container.innerHTML = `
        <div class="space-y-4">
            <div class="ds-section p-5">
                <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-500">Man Record</p>
                <h2 class="text-lg font-black text-slate-800 mt-1">สรุปผลสอบรายแผนก / Department Exam Summary</h2>
                <p class="text-sm text-slate-500 mt-1">บันทึกจำนวนผู้เข้าสอบ ผ่าน และไม่ผ่านในระดับแผนก เพื่อใช้ติดตามภาพรวม 4M</p>
            </div>
            <div class="ds-filter-bar flex flex-wrap gap-3 items-center justify-between">
                <div class="flex items-center gap-2">
                    <label class="text-xs font-semibold text-slate-500" for="man-filter-year">ปีข้อมูล / Year</label>
                    <select id="man-filter-year" class="form-input py-1.5 text-sm w-24">${yearOpts}</select>
                    <select id="man-filter-status" class="form-input py-1.5 text-sm">
                        <option value="all" ${_manFilter.status==='all'?'selected':''}>ทุกผลสอบ / All Status</option>
                        ${MAN_STATUSES.map(s => `<option value="${s}" ${_manFilter.status===s?'selected':''}>${s}</option>`).join('')}
                    </select>
                    <div class="relative w-64">
                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input id="man-search" type="text" placeholder="ค้นหาแผนก..."
                               value="${escHtml(_manFilter.q)}" class="form-input w-full pl-9 text-sm py-2">
                    </div>
                </div>
                <p class="text-xs text-slate-400 mr-auto">ผลสอบในตารางเป็นข้อมูลสรุประดับแผนก</p>
                <button id="btn-export-man"
                        class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    Excel
                </button>
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

            <div id="man-kpi-strip" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                ${Array(4).fill(0).map(() => `
                <div class="ds-metric-card flex items-center gap-3 animate-pulse">
                    <div class="w-10 h-10 rounded-xl bg-slate-100 flex-shrink-0"></div>
                    <div class="flex-1">
                        <div class="h-7 bg-slate-100 rounded mb-2 w-14"></div>
                        <div class="h-3 bg-slate-50 rounded w-20"></div>
                    </div>
                </div>`).join('')}
            </div>

            <div id="man-chart-row" class="grid grid-cols-1 lg:grid-cols-3 gap-4" style="display:none">
                <div class="ds-section">
                    <h3 class="text-sm font-bold text-slate-600 mb-3">สัดส่วนผลสอบรวม</h3>
                    <div style="height:210px;position:relative"><canvas id="fourm-chart-man-donut"></canvas></div>
                </div>
                <div class="ds-section lg:col-span-2">
                    <h3 class="text-sm font-bold text-slate-600 mb-3">Pass Rate รายแผนก</h3>
                    <div id="man-chart-inner"><canvas id="fourm-chart-man"></canvas></div>
                </div>
            </div>

            <div class="ds-table-wrap">
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
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
        if (_manFilter.status !== 'all') p.set('status', _manFilter.status);
        p.set('year', _manFilter.year);
        const scopeParams = new URLSearchParams();
        scopeParams.set('year', _manFilter.year);
        if (_manFilter.q.trim()) scopeParams.set('q', _manFilter.q.trim());
        const [res, scopeRes] = await Promise.all([
            API.get(`/fourm/man-records?${p}`),
            API.get(`/fourm/training-department-scopes?${scopeParams}`).catch(() => ({ data: [] })),
        ]);
        const recordRows = normalizeApiArray(res?.data ?? res);
        const scopeRows = normalizeApiArray(scopeRes?.data ?? scopeRes);
        const scopeByDept = new Map(scopeRows.map(s => [String(s.Department || '').trim().toLowerCase(), s]));
        const rows = recordRows.map(r => {
            const key = String(r.Department || '').trim().toLowerCase();
            const scope = scopeByDept.get(key);
            if (scope) scopeByDept.delete(key);
            return {
                ...r,
                MatrixScopeEmployees: parseInt(scope?.ScopeEmployees, 10) || 0,
                MatrixCurriculumCount: parseInt(scope?.CurriculumCount, 10) || 0,
                MatrixCourseCount: parseInt(scope?.CourseCount, 10) || 0,
            };
        });
        if (_manFilter.status === 'all' || _manFilter.status === 'Pending') {
            scopeByDept.forEach(scope => rows.push({
                id: `matrix-${scope.Department}`,
                _virtual: true,
                Department: scope.Department,
                TotalAttendance: parseInt(scope.ScopeEmployees, 10) || 0,
                Pass: 0,
                Fail: 0,
                Status: 'Pending',
                ExamDate: null,
                Notes: 'Created from Training Matrix scope',
                MatrixScopeEmployees: parseInt(scope.ScopeEmployees, 10) || 0,
                MatrixCurriculumCount: parseInt(scope.CurriculumCount, 10) || 0,
                MatrixCourseCount: parseInt(scope.CourseCount, 10) || 0,
            }));
        }
        _lastManRows = rows;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="${_isAdmin?8:7}" class="text-center py-10 text-slate-400 text-sm">ยังไม่มีผลสอบในปี ${_manFilter.year}</td></tr>`;
            const kpiStrip = document.getElementById('man-kpi-strip');
            const chartRow = document.getElementById('man-chart-row');
            if (kpiStrip) kpiStrip.innerHTML = '';
            if (chartRow)  chartRow.style.display = 'none';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const rate = r.TotalAttendance > 0 ? Math.round((r.Pass / r.TotalAttendance) * 100) : 0;
            const date = r.ExamDate ? new Date(r.ExamDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            const barColor = rate>=80 ? '#059669' : rate>=60 ? '#d97706' : '#ef4444';
            return `
            <tr class="hover:bg-slate-50 transition-colors group">
                <td class="px-4 py-3 font-medium text-slate-800">
                    <div>${escHtml(r.Department||'-')}</div>
                    ${r.MatrixScopeEmployees ? `<div class="mt-1 flex flex-wrap items-center gap-1.5">
                        <span class="inline-flex px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">Matrix ${r.MatrixScopeEmployees} คน</span>
                        ${r._virtual ? '<span class="inline-flex px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">รอบันทึกผล</span>' : ''}
                    </div>` : ''}
                </td>
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
                    ${dsStatusBadge(r.Status || '-')}
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${date}</td>
                ${_isAdmin ? `
                <td class="px-4 py-3 text-right">
                    <div class="flex items-center gap-1 justify-end ${r._virtual ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity">
                        ${r._virtual ? `<button class="btn-man-from-scope px-2.5 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                            data-dept="${escHtml(r.Department || '')}" data-total="${parseInt(r.TotalAttendance, 10) || 0}">บันทึกผล</button>` : `
                        <button class="btn-man-edit p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" data-id="${r.id}" title="แก้ไข">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                        <button class="btn-man-delete p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" data-id="${r.id}" data-dept="${escHtml(r.Department)}" title="ลบ">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>`}
                    </div>
                </td>` : ''}
            </tr>`;
        }).join('');

        // KPI summary strip
        const totalAtt  = rows.reduce((s, r) => s + (parseInt(r.TotalAttendance)||0), 0);
        const totalPass = rows.reduce((s, r) => s + (parseInt(r.Pass)||0), 0);
        const passRate  = totalAtt > 0 ? Math.round(totalPass / totalAtt * 100) : 0;
        const rateColor = passRate>=80 ? '#059669' : passRate>=60 ? '#d97706' : '#ef4444';
        const kpiStrip = document.getElementById('man-kpi-strip');
        if (kpiStrip) {
            const KPI_CARDS = [
                { label:'แผนกที่บันทึก',  value: rows.length, color:'#6366f1',
                  icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>` },
                { label:'ผู้เข้าสอบรวม',  value: totalAtt,    color:'#0284c7',
                  icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>` },
                { label:'ผ่านทั้งหมด',    value: totalPass,   color:'#059669',
                  icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
                { label:'Pass Rate รวม',  value: `${passRate}%`, color: rateColor,
                  icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
            ];
            kpiStrip.innerHTML = KPI_CARDS.map(c => `
                <div class="ds-metric-card flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:${c.color}18;color:${c.color}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${c.icon}</svg>
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-slate-800">${c.value}</p>
                        <p class="text-xs text-slate-500">${c.label}</p>
                    </div>
                </div>`).join('');
        }

        // Charts row
        const chartRow   = document.getElementById('man-chart-row');
        const chartInner = document.getElementById('man-chart-inner');
        if (chartRow && rows.length > 0) {
            chartRow.style.display = '';

            // Aggregate totals for donut
            const totalPassD = rows.reduce((s, r) => s + (parseInt(r.Pass)||0), 0);
            const totalFailD = rows.reduce((s, r) => s + (parseInt(r.Fail)||0), 0);

            // Donut — Pass / Fail distribution
            if (_chartManDonut) { _chartManDonut.destroy(); _chartManDonut = null; }
            const ctxDonut = document.getElementById('fourm-chart-man-donut');
            if (ctxDonut && (totalPassD + totalFailD) > 0) {
                _chartManDonut = new Chart(ctxDonut, {
                    type: 'doughnut',
                    data: {
                        labels: ['ผ่าน', 'ไม่ผ่าน'],
                        datasets: [{
                            data: [totalPassD, totalFailD],
                            backgroundColor: ['rgba(5,150,105,0.8)', 'rgba(239,68,68,0.75)'],
                            borderColor:     ['#059669', '#ef4444'],
                            borderWidth: 2,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '62%',
                        plugins: {
                            legend: { position:'bottom', labels:{ font:{ family:'Kanit', size:11 }, padding:12, boxWidth:12 } },
                            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} คน` } }
                        }
                    }
                });
            }

            // Horizontal bar — pass rate per dept
            if (_chartMan) { _chartMan.destroy(); _chartMan = null; }
            const chartHeight = Math.max(180, rows.length * 34 + 40);
            if (chartInner) chartInner.style.height = `${chartHeight}px`;
            const ctx = document.getElementById('fourm-chart-man');
            if (ctx) {
                const labels   = rows.map(r => r.Department || '—');
                const rates    = rows.map(r => r.TotalAttendance > 0 ? Math.round((r.Pass / r.TotalAttendance) * 100) : 0);
                const bgColors = rates.map(v => v>=80 ? 'rgba(5,150,105,0.65)' : v>=60 ? 'rgba(217,119,6,0.65)' : 'rgba(239,68,68,0.65)');
                _chartMan = new Chart(ctx, {
                    type: 'bar',
                    data: { labels, datasets: [{ label:'Pass Rate (%)', data: rates, backgroundColor: bgColors, borderRadius: 6, borderWidth: 0 }] },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { min:0, max:100, ticks:{ callback: v => v+'%', font:{ family:'Kanit' } }, grid:{ color:'#f1f5f9' } },
                            y: { ticks:{ font:{ family:'Kanit', size:11 }, callback: function(val) {
                                const n = this.getLabelForValue(val);
                                return n.length > 18 ? n.slice(0,17)+'…' : n;
                            }}, grid:{ display:false } }
                        }
                    }
                });
            }
        } else if (chartRow) {
            chartRow.style.display = 'none';
        }
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="${_isAdmin?8:7}" class="text-center py-6 text-red-500 text-sm">${escHtml(err.message)}</td></tr>`;
    }
}

function _buildEmailOutboxPanel() {
    return `
    <div class="ds-section overflow-hidden">
        <div class="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
                <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-500">4M Notification</p>
                <h3 class="text-sm font-bold text-slate-700 mt-1">Email Outbox / คิวแจ้งเตือน 4M</h3>
            </div>
            <button type="button" onclick="window._fourmRefreshEmailOutbox&&window._fourmRefreshEmailOutbox()"
                    class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">
                รีเฟรช
            </button>
        </div>
        <div id="fourm-email-outbox" class="p-5">
            <div class="flex justify-center py-6">
                <div class="animate-spin h-5 w-5 border-2 border-indigo-400 border-t-transparent rounded-full"></div>
            </div>
        </div>
    </div>`;
}

function _renderFourmEmailOutbox(rows = []) {
    const el = document.getElementById('fourm-email-outbox');
    if (!el) return;
    if (!rows.length) {
        el.innerHTML = `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">ยังไม่มีคิวแจ้งเตือน 4M</div>`;
        return;
    }
    const statusClass = (status) => {
        if (status === 'Sent') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (status === 'Failed') return 'bg-rose-50 text-rose-700 border-rose-200';
        return 'bg-amber-50 text-amber-700 border-amber-200';
    };
    el.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        <th class="py-2 pr-3">Event</th>
                        <th class="py-2 pr-3">Subject</th>
                        <th class="py-2 pr-3">Recipient</th>
                        <th class="py-2 pr-3">Status</th>
                        <th class="py-2 pr-3 text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.slice(0, 8).map(row => `
                    <tr class="border-b border-slate-50 last:border-0">
                        <td class="py-2 pr-3 font-semibold text-slate-700">${escHtml(row.EventType || '-')}</td>
                        <td class="py-2 pr-3 text-slate-600">${escHtml(row.Subject || '-')}</td>
                        <td class="py-2 pr-3 text-slate-500">${escHtml(row.Recipients || '-')}</td>
                        <td class="py-2 pr-3">
                            <span class="inline-flex px-2 py-1 rounded-full border text-[11px] font-bold ${statusClass(row.Status)}">${escHtml(row.Status || 'Queued')}</span>
                        </td>
                        <td class="py-2 pr-3 text-right">
                            ${row.Status === 'Failed' || row.Status === 'Queued' ? `
                            <button type="button" class="btn-fourm-email-retry px-2.5 py-1 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                                    data-id="${row.id}">Retry</button>` : '<span class="text-xs text-slate-300">-</span>'}
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

async function _loadFourmEmailOutbox() {
    try {
        const res = await API.get('/fourm/email-outbox?limit=20');
        _renderFourmEmailOutbox(normalizeApiArray(res?.data ?? res) || []);
    } catch (err) {
        const el = document.getElementById('fourm-email-outbox');
        if (el) el.innerHTML = `<div class="rounded-xl border border-rose-100 bg-rose-50 p-5 text-sm text-rose-700">โหลดคิวแจ้งเตือนไม่สำเร็จ</div>`;
    }
}

window._fourmRefreshEmailOutbox = _loadFourmEmailOutbox;

function _exportManToExcel() {
    if (!_lastManRows.length) { showToast('ไม่มีข้อมูล Man Record สำหรับ Export', 'warning'); return; }
    if (typeof XLSX === 'undefined') { showToast('ไม่พบ SheetJS library', 'error'); return; }
    const rows = _lastManRows.map(r => {
        const total = parseInt(r.TotalAttendance) || 0;
        const pass = parseInt(r.Pass) || 0;
        return {
            'แผนก': r.Department || '',
            'วันที่สอบ': r.ExamDate ? r.ExamDate.split('T')[0] : '',
            'ผู้เข้าสอบทั้งหมด': total,
            'ผ่าน': pass,
            'ไม่ผ่าน': parseInt(r.Fail) || 0,
            'Pass Rate (%)': total > 0 ? Math.round(pass / total * 100) : 0,
            'ผลสอบ': r.Status || '',
            'หมายเหตุ': r.Notes || '',
            'บันทึกโดย': r.CreatedBy || '',
        };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Man Record');
    XLSX.writeFile(wb, `4M_Man_Record_${_manFilter.year}.xlsx`);
}

async function _loadTrainingMatrixExportData({ curriculumId = null } = {}) {
    const p = new URLSearchParams();
    p.set('year', _tmFilter.year);
    if (_tmFilter.dept !== 'all') p.set('dept', _tmFilter.dept);
    const curRes = await API.get(`/fourm/training-curriculums?${p}`);
    const allCurriculums = normalizeApiArray(curRes?.data ?? curRes);
    const curriculums = curriculumId
        ? allCurriculums.filter(cur => String(cur.id) === String(curriculumId))
        : allCurriculums;
    const courses = [];
    const assignments = [];

    const bundles = await Promise.all(curriculums.map(async cur => {
        const [courseRes, assRes] = await Promise.all([
            API.get(`/fourm/training-curriculums/${cur.id}/courses`).catch(() => ({ data: [] })),
            API.get(`/fourm/training-curriculums/${cur.id}/assignments?status=all`).catch(() => ({ data: [] })),
        ]);
        return { cur, courseRes, assRes };
    }));
    bundles.forEach(({ cur, courseRes, assRes }) => {
        const courseRows = normalizeApiArray(courseRes?.data ?? courseRes);
        for (const course of courseRows) {
            const fullCourse = { ...course, CurriculumID: cur.id, CurriculumCode: cur.CurriculumCode, CurriculumTitle: cur.CurriculumTitle, Year: cur.Year, Department: cur.Department };
            courses.push(fullCourse);
        }
        normalizeApiArray(assRes?.data ?? assRes).forEach(a => assignments.push({
            ...a,
            CurriculumID: cur.id,
            CurriculumCode: cur.CurriculumCode,
            CurriculumTitle: cur.CurriculumTitle,
            Year: cur.Year,
            ScopeDepartment: cur.Department,
            CourseCode: '',
            CourseTitle: '',
        }));
    });

    const logParams = new URLSearchParams();
    logParams.set('year', _tmFilter.year);
    logParams.set('limit', '300');
    if (_isAdmin && _tmFilter.dept !== 'all') logParams.set('dept', _tmFilter.dept);
    if (curriculumId) logParams.set('curriculumId', curriculumId);
    const logRes = await API.get(`/fourm/training-logs?${logParams}`).catch(() => ({ data: [] }));
    const selectedCurriculum = curriculums.length === 1 ? curriculums[0] : null;
    return {
        curriculums,
        courses,
        assignments,
        logs: normalizeApiArray(logRes?.data ?? logRes),
        generatedAt: new Date(),
        generatedBy: _currentUser.name || _currentUser.EmployeeName || _currentUser.id || '-',
        scope: {
            year: _tmFilter.year,
            department: _isAdmin ? (_tmFilter.dept === 'all' ? 'ทุกแผนก / All Departments' : _tmFilter.dept) : (_currentUser.department || _currentUser.Department || 'แผนกของฉัน / My Department'),
            curriculumId: selectedCurriculum?.id || null,
            curriculumCode: selectedCurriculum?.CurriculumCode || '',
            curriculumTitle: selectedCurriculum?.CurriculumTitle || '',
        },
    };
}

function _tmExcelWorksheet(rows, columns) {
    const headers = columns.map(col => col.header);
    const body = rows.map(row => columns.map(col => row[col.key] ?? ''));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
    ws['!cols'] = columns.map(col => ({ wch: col.width || 16 }));
    if (headers.length) {
        ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
    }
    columns.forEach((col, colIndex) => {
        if (!col.text) return;
        rows.forEach((row, rowIndex) => {
            const address = XLSX.utils.encode_cell({ c: colIndex, r: rowIndex + 1 });
            const cell = ws[address];
            if (!cell) return;
            cell.t = 's';
            cell.v = String(row[col.key] ?? '');
            cell.z = '@';
        });
    });
    return ws;
}

function _tmBuildExcelRows(data) {
    const activeAssignments = data.assignments
        .filter(row => (row.Status || 'Assigned') === 'Assigned')
        .sort((a, b) => String(a.EmployeeID || '').localeCompare(String(b.EmployeeID || ''), 'en'));
    const coursesByCurriculum = new Map();
    data.courses.forEach(course => {
        const key = String(course.CurriculumID || '');
        if (!coursesByCurriculum.has(key)) coursesByCurriculum.set(key, []);
        coursesByCurriculum.get(key).push(course);
    });
    coursesByCurriculum.forEach(rows => rows.sort((a, b) => (
        (parseInt(a.SortOrder, 10) || 99) - (parseInt(b.SortOrder, 10) || 99)
        || String(a.CourseCode || '').localeCompare(String(b.CourseCode || ''), 'th')
    )));

    const employeeRows = activeAssignments.map(a => ({
        employeeId: String(a.EmployeeID || ''),
        employeeName: a.EmployeeName || '',
        employeeDepartment: a.Department || '',
        position: a.Position || '',
        curriculumCode: a.CurriculumCode || '',
        curriculumTitle: a.CurriculumTitle || '',
        year: a.Year || data.scope.year,
        scopeDepartment: a.ScopeDepartment || '',
        assignedAt: a.AssignedAt ? String(a.AssignedAt).slice(0, 10) : '',
        notes: a.Notes || '',
    }));
    const employeeCourseRows = [];
    activeAssignments.forEach(a => {
        const linkedCourses = coursesByCurriculum.get(String(a.CurriculumID || '')) || [];
        const rows = linkedCourses.length ? linkedCourses : [null];
        rows.forEach(course => employeeCourseRows.push({
            employeeId: String(a.EmployeeID || ''),
            employeeName: a.EmployeeName || '',
            employeeDepartment: a.Department || '',
            position: a.Position || '',
            curriculumCode: a.CurriculumCode || '',
            curriculumTitle: a.CurriculumTitle || '',
            courseCode: course?.CourseCode || '',
            courseTitle: course?.CourseTitle || '',
            year: a.Year || data.scope.year,
            scopeDepartment: a.ScopeDepartment || '',
            assignedAt: a.AssignedAt ? String(a.AssignedAt).slice(0, 10) : '',
            notes: a.Notes || '',
        }));
    });
    employeeCourseRows.sort((a, b) => (
        String(a.curriculumCode).localeCompare(String(b.curriculumCode), 'th')
        || String(a.courseCode).localeCompare(String(b.courseCode), 'th')
        || String(a.employeeId).localeCompare(String(b.employeeId), 'en')
    ));
    return { activeAssignments, employeeRows, employeeCourseRows };
}

function showTrainingMatrixExcelExportModal() {
    const selected = _tmCurriculums.find(cur => String(cur.id) === String(_tmSelectedCurriculumId));
    const selectedLabel = selected
        ? `${selected.CurriculumCode || '-'} - ${selected.CurriculumTitle || '-'}`
        : 'ยังไม่ได้เลือกหลักสูตร / No curriculum selected';
    const html = `
        <div class="space-y-3">
            <button type="button" data-tm-excel-scope="selected" data-tm-excel-label="Selected curriculum"
                    class="w-full flex items-center justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-left hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    ${selected ? '' : 'disabled'}>
                <span class="min-w-0">
                    <span class="block text-sm font-black text-emerald-800">หลักสูตรที่เลือก / Selected curriculum</span>
                    <span class="block mt-1 text-xs text-emerald-700 truncate">${escHtml(selectedLabel)}</span>
                </span>
                <svg class="w-5 h-5 shrink-0 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/>
                </svg>
            </button>
            <button type="button" data-tm-excel-scope="all" data-tm-excel-label="All curriculums"
                    class="w-full flex items-center justify-between gap-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-4 text-left hover:bg-sky-100">
                <span class="min-w-0">
                    <span class="block text-sm font-black text-sky-800">ทุกหลักสูตร / All curriculums</span>
                    <span class="block mt-1 text-xs text-sky-700">${escHtml(String(_tmFilter.year))} · ${escHtml(_isAdmin && _tmFilter.dept === 'all' ? 'ทุกแผนก / All Departments' : (_tmFilter.dept || _currentUser.department || _currentUser.Department || '-'))}</span>
                </span>
                <svg class="w-5 h-5 shrink-0 text-sky-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h10"/>
                </svg>
            </button>
            <div id="tm-excel-export-status" class="hidden rounded-lg border px-3 py-2 text-xs font-bold"></div>
        </div>`;
    openModal('ส่งออก Training Matrix / Export Excel', html, 'max-w-lg');
    document.querySelectorAll('#modal-body [data-tm-excel-scope]').forEach(btn => {
        btn.addEventListener('click', guardActionHandler(async () => {
            const curriculumId = btn.dataset.tmExcelScope === 'selected' ? _tmSelectedCurriculumId : null;
            await _exportTrainingMatrixExcel({ curriculumId, triggerEl: btn });
        }));
    });
}

function _tmExcelLoadingMarkup(label = 'Training Matrix') {
    return `
        <span class="inline-flex items-center gap-2 min-w-0">
            <span class="animate-spin inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent shrink-0"></span>
            <span class="min-w-0">
                <span class="block text-sm font-black">กำลังเตรียม Excel... / Preparing Excel...</span>
                <span class="block mt-0.5 text-xs opacity-80 truncate">${escHtml(label)}</span>
            </span>
        </span>
        <span class="text-xs font-black uppercase tracking-wide opacity-70">Loading</span>`;
}

function _tmExcelCompactLoadingMarkup() {
    return `
        <span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"></span>
        <span>กำลังส่งออก...</span>`;
}

function _tmSetExcelExportState(triggerEl, state = 'idle', message = '') {
    const buttons = Array.from(document.querySelectorAll('[data-tm-excel-scope], #btn-tm-export-current-curriculum'));
    const status = document.getElementById('tm-excel-export-status');
    buttons.forEach(btn => {
        if (!btn.dataset.tmOriginalHtml) btn.dataset.tmOriginalHtml = btn.innerHTML;
        if (state === 'loading') {
            btn.disabled = true;
            btn.classList.add('cursor-wait');
        } else {
            btn.disabled = btn.matches('[data-tm-excel-scope="selected"]') && !_tmSelectedCurriculumId;
            btn.classList.remove('cursor-wait');
            btn.innerHTML = btn.dataset.tmOriginalHtml || btn.innerHTML;
        }
    });
    if (state === 'loading' && triggerEl) {
        if (!triggerEl.dataset.tmOriginalHtml) triggerEl.dataset.tmOriginalHtml = triggerEl.innerHTML;
        triggerEl.innerHTML = triggerEl.id === 'btn-tm-export-current-curriculum'
            ? _tmExcelCompactLoadingMarkup()
            : _tmExcelLoadingMarkup(triggerEl.dataset.tmExcelLabel || triggerEl.title || 'Training Matrix');
    }
    if (!status) return;
    if (state === 'idle') {
        status.className = 'hidden rounded-lg border px-3 py-2 text-xs font-bold';
        status.textContent = '';
        return;
    }
    const tone = state === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : state === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-sky-200 bg-sky-50 text-sky-700';
    status.className = `rounded-lg border px-3 py-2 text-xs font-bold ${tone}`;
    status.textContent = message || (state === 'loading' ? 'กำลังเตรียมไฟล์ Excel... / Preparing Excel file. Please wait...' : '');
}

async function _exportTrainingMatrixExcel({ curriculumId = null, triggerEl = null } = {}) {
    if (typeof XLSX === 'undefined') {
        const msg = 'ไม่พบ SheetJS library / SheetJS library not found. Cannot export Excel.';
        _tmSetExcelExportState(triggerEl, 'error', msg);
        showToast('ไม่พบ SheetJS library / SheetJS library not found', 'error');
        return;
    }
    try {
        _tmSetExcelExportState(triggerEl, 'loading', 'กำลังเตรียมไฟล์ Excel... / Preparing Excel file. Please wait...');
        showLoading('กำลังเตรียม Excel ตารางอบรม... / Preparing Training Matrix Excel...');
        const data = await _loadTrainingMatrixExportData({ curriculumId });
        if (!data.curriculums.length) {
            _tmSetExcelExportState(triggerEl, 'error', 'ไม่มีข้อมูล Training Matrix สำหรับ export / No Training Matrix data for export.');
            showToast('ไม่มีข้อมูล Training Matrix สำหรับ export / No Training Matrix data for export', 'warning');
            return;
        }
        const { activeAssignments, employeeRows, employeeCourseRows } = _tmBuildExcelRows(data);
        const summaryRows = [{
            year: data.scope.year,
            department: data.scope.department,
            curriculum: data.scope.curriculumCode
                ? `${data.scope.curriculumCode} - ${data.scope.curriculumTitle}`
                : 'ทุกหลักสูตร / All Curriculums',
            curriculums: data.curriculums.length,
            courses: data.courses.length,
            employees: activeAssignments.length,
            employeeCourseRows: employeeCourseRows.length,
            generatedBy: data.generatedBy,
            generatedAt: data.generatedAt.toLocaleString('th-TH'),
        }];
        const courseRows = data.courses.map(c => ({
            curriculumCode: c.CurriculumCode || '',
            curriculumTitle: c.CurriculumTitle || '',
            courseCode: c.CourseCode || '',
            courseTitle: c.CourseTitle || '',
            year: c.Year || data.scope.year,
            department: c.Department || '',
            assignedCount: activeAssignments.filter(a => String(a.CurriculumID) === String(c.CurriculumID)).length,
        }));

        const summaryColumns = [
            { key:'year', header:'Year / ปี', width:10 },
            { key:'department', header:'Department Scope / แผนก', width:24 },
            { key:'curriculum', header:'Curriculum Scope / หลักสูตร', width:42 },
            { key:'curriculums', header:'Curriculums / จำนวนหลักสูตร', width:18 },
            { key:'courses', header:'Courses / จำนวนรายวิชา', width:18 },
            { key:'employees', header:'Employees / จำนวนพนักงาน', width:18 },
            { key:'employeeCourseRows', header:'Employee-Course Rows', width:20 },
            { key:'generatedBy', header:'Generated By', width:24 },
            { key:'generatedAt', header:'Generated At', width:22 },
        ];
        const employeeColumns = [
            { key:'employeeId', header:'Employee ID / รหัสพนักงาน', width:20, text:true },
            { key:'employeeName', header:'Employee Name / ชื่อพนักงาน', width:30 },
            { key:'employeeDepartment', header:'Employee Department / แผนกพนักงาน', width:24 },
            { key:'position', header:'Position / ตำแหน่ง', width:24 },
            { key:'curriculumCode', header:'Curriculum Code / รหัสหลักสูตร', width:22 },
            { key:'curriculumTitle', header:'Curriculum / หลักสูตร', width:34 },
            { key:'year', header:'Year / ปี', width:10 },
            { key:'scopeDepartment', header:'Curriculum Department / แผนกหลักสูตร', width:26 },
            { key:'assignedAt', header:'Assigned Date / วันที่เพิ่ม', width:18 },
            { key:'notes', header:'Notes / หมายเหตุ', width:30 },
        ];
        const employeeCourseColumns = [
            ...employeeColumns.slice(0, 6),
            { key:'courseCode', header:'Course Code / รหัสวิชา', width:20 },
            { key:'courseTitle', header:'Course / รายวิชา', width:34 },
            ...employeeColumns.slice(6),
        ];
        const courseColumns = [
            { key:'curriculumCode', header:'Curriculum Code / รหัสหลักสูตร', width:22 },
            { key:'curriculumTitle', header:'Curriculum / หลักสูตร', width:34 },
            { key:'courseCode', header:'Course Code / รหัสวิชา', width:20 },
            { key:'courseTitle', header:'Course / รายวิชา', width:34 },
            { key:'year', header:'Year / ปี', width:10 },
            { key:'department', header:'Department / แผนก', width:24 },
            { key:'assignedCount', header:'Assigned Employees / พนักงาน', width:20 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, _tmExcelWorksheet(summaryRows, summaryColumns), 'Summary');
        XLSX.utils.book_append_sheet(wb, _tmExcelWorksheet(employeeCourseRows, employeeCourseColumns), 'Employee Course Detail');
        XLSX.utils.book_append_sheet(wb, _tmExcelWorksheet(employeeRows, employeeColumns), 'Employee IDs');
        XLSX.utils.book_append_sheet(wb, _tmExcelWorksheet(courseRows, courseColumns), 'Courses');
        const scopeName = data.scope.curriculumCode
            || data.scope.department
            || 'All_Curriculums';
        const safeScope = String(scopeName).replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_').replace(/^_+|_+$/g, '') || 'All_Curriculums';
        XLSX.writeFile(wb, `4M_Training_Matrix_${data.scope.year}_${safeScope}.xlsx`);
        _tmSetExcelExportState(triggerEl, 'success', 'Export Excel พร้อมแล้ว / Excel file is ready. Download should start automatically.');
        showToast('Export Excel ตารางอบรมสำเร็จ / Training Matrix Excel exported', 'success');
    } catch (err) {
        _tmSetExcelExportState(triggerEl, 'error', err?.message || 'ส่งออก Training Matrix Excel ไม่สำเร็จ / Cannot export Training Matrix Excel.');
        showError(err);
    }
    finally { hideLoading(); }
}

function _tmPdfPage(title, bodyHtml, footer) {
    return `
    <div class="fourm-tm-pdf-page" style="width:794px;height:1122px;background:#fff;font-family:Kanit,Arial,sans-serif;color:#1e293b;box-sizing:border-box;page-break-after:always;display:flex;flex-direction:column;overflow:hidden">
        <div style="background:#065f46;color:#fff;padding:18px 30px 16px;display:flex;justify-content:space-between;gap:16px;flex-shrink:0">
            <div>
                <div style="font-size:11px;font-weight:800;color:#a7f3d0;text-transform:uppercase;letter-spacing:.08em">Official 4M Training Matrix Report</div>
                <h1 style="font-size:20px;margin:4px 0 0;font-weight:900;color:#fff;line-height:1.18">${title}</h1>
            </div>
            <div style="text-align:right;font-size:11px;color:#d1fae5;line-height:1.5">${footer}</div>
        </div>
        <div class="fourm-tm-pdf-body" style="flex:1;padding:18px 30px 14px;overflow:hidden;min-height:0">
            <div class="fourm-tm-pdf-inner" style="transform-origin:top left">${bodyHtml}</div>
        </div>
        <div style="padding:8px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;color:#64748b;font-size:10px;flex-shrink:0">
            <span>4M Training Matrix Report - Thai Summit Harness Co., Ltd.</span>
            <span>Internal Use Only</span>
        </div>
    </div>`;
}

async function _exportTrainingMatrixPdf() {
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        showToast('ไม่พบ PDF libraries / PDF libraries not found', 'error');
        return;
    }
    let div;
    try {
        showLoading('กำลังเตรียม PDF ตารางอบรม... / Preparing Training Matrix PDF...');
        const data = await _loadTrainingMatrixExportData();
        if (!data.curriculums.length) {
            hideLoading();
            showToast('ไม่มีข้อมูล Training Matrix สำหรับ export / No Training Matrix data for export', 'warning');
            return;
        }
        const assignedCount = data.assignments.filter(a => a.Status === 'Assigned').length;
        const footer = `ปี / Year: ${data.scope.year}<br>แผนก / Department: ${escHtml(data.scope.department)}<br>สร้างเมื่อ / Generated: ${data.generatedAt.toLocaleString('th-TH')}<br>โดย / By: ${escHtml(data.generatedBy)}`;
        const summaryCards = [
            ['หลักสูตร / Curriculums', data.curriculums.length],
            ['รายวิชา / Courses', data.courses.length],
            ['พนักงานที่อยู่ใน Scope / Assigned Employees', assignedCount],
            ['รายการ Assignment / Assignment Rows', data.assignments.length],
        ].map(([label, value]) => `
            <div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px;background:#f8fafc">
                <div style="font-size:24px;font-weight:900;color:#0f766e">${value}</div>
                <div style="font-size:11px;color:#64748b;margin-top:3px">${label}</div>
            </div>`).join('');
        const curriculumTable = `
            <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:16px">
                <thead><tr style="background:#065f46;color:#fff">
                    <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">แผนก / Department</th>
                    <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">หลักสูตร / Curriculum</th>
                    <th style="padding:8px;border:1px solid #e2e8f0;text-align:center">รายวิชา / Courses</th>
                    <th style="padding:8px;border:1px solid #e2e8f0;text-align:center">พนักงาน / Assigned</th>
                </tr></thead>
                <tbody>${data.curriculums.map(c => `
                    <tr>
                        <td style="padding:7px;border:1px solid #e2e8f0">${escHtml(c.Department || '-')}</td>
                        <td style="padding:7px;border:1px solid #e2e8f0"><b>${escHtml(c.CurriculumCode || '-')}</b><br>${escHtml(c.CurriculumTitle || '-')}</td>
                        <td style="padding:7px;border:1px solid #e2e8f0;text-align:center">${parseInt(c.CourseCount) || 0}</td>
                        <td style="padding:7px;border:1px solid #e2e8f0;text-align:center">${parseInt(c.AssignedCount) || 0}</td>
                    </tr>`).join('')}</tbody>
            </table>`;
        const pages = [_tmPdfPage('ชุด Audit ตารางอบรม / Training Matrix Audit Package', `
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${summaryCards}</div>
            <h2 style="font-size:15px;margin:22px 0 0;color:#0f172a">Scope หลักสูตร / Curriculum Scope</h2>
            ${curriculumTable}
        `, footer)];

        const rows = data.assignments.length ? data.assignments : data.courses.map(c => ({
            ...c,
            ScopeDepartment: c.Department,
            EmployeeID: '',
            EmployeeName: 'ยังไม่มีพนักงาน / No assigned employee',
            Position: '',
            Status: '',
        }));
        const chunks = [];
        for (let i = 0; i < rows.length; i += 24) chunks.push(rows.slice(i, i + 24));
        chunks.forEach((chunk, idx) => {
            const table = `
            <table style="width:100%;border-collapse:collapse;font-size:10px">
                <thead><tr style="background:#065f46;color:#fff">
                    <th style="padding:7px;border:1px solid #e2e8f0;text-align:left">หลักสูตร / รายวิชา / Curriculum / Course</th>
                    <th style="padding:7px;border:1px solid #e2e8f0;text-align:left">พนักงาน / Employee</th>
                    <th style="padding:7px;border:1px solid #e2e8f0;text-align:left">ตำแหน่ง / Position</th>
                    <th style="padding:7px;border:1px solid #e2e8f0;text-align:left">สถานะ / Status</th>
                </tr></thead>
                <tbody>${chunk.map(a => `
                    <tr>
                        <td style="padding:6px;border:1px solid #e2e8f0"><b>${escHtml(a.CurriculumCode || '-')}</b><br>${escHtml(a.CourseCode || '-')} - ${escHtml(a.CourseTitle || '-')}</td>
                        <td style="padding:6px;border:1px solid #e2e8f0"><b>${escHtml(a.EmployeeName || '-')}</b><br>${escHtml(a.EmployeeID || '')}</td>
                        <td style="padding:6px;border:1px solid #e2e8f0">${escHtml(a.Position || '-')}</td>
                        <td style="padding:6px;border:1px solid #e2e8f0">${escHtml(a.Status || '-')}</td>
                    </tr>`).join('')}</tbody>
            </table>`;
            pages.push(_tmPdfPage(`Scope พนักงาน / Employee Scope (${idx + 1}/${chunks.length})`, table, footer));
        });

        div = document.createElement('div');
        div.style.position = 'fixed';
        div.style.left = '-9999px';
        div.style.top = '0';
        div.innerHTML = pages.join('');
        document.body.appendChild(div);
        div.querySelectorAll('.fourm-tm-pdf-body').forEach(body => {
            const inner = body.querySelector('.fourm-tm-pdf-inner');
            if (!inner) return;
            const scale = Math.min(1.08, Math.max(0.82, body.clientHeight / Math.max(1, inner.scrollHeight)));
            inner.style.transform = `scale(${scale})`;
            inner.style.width = `${100 / scale}%`;
        });
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
        const pageEls = Array.from(div.querySelectorAll('.fourm-tm-pdf-page'));
        for (let i = 0; i < pageEls.length; i++) {
            const canvas = await html2canvas(pageEls[i], { scale:1.5, useCORS:true, backgroundColor:'#fff', logging:false });
            if (i > 0) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
            pdf.setFontSize(8);
            pdf.setTextColor(100, 116, 139);
            pdf.text(`Page ${i + 1} / ${pageEls.length}`, 190, 291, { align: 'right' });
        }
        const deptName = data.scope.department.replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_');
        pdf.save(`4M_Training_Matrix_${data.scope.year}_${deptName}.pdf`);
        showToast('Export PDF ตารางอบรมสำเร็จ / Training Matrix PDF exported', 'success');
    } catch (err) { showError(err); }
    finally {
        hideLoading();
        if (div?.parentNode) div.parentNode.removeChild(div);
    }
}

function showManForm(existing = null) {
    const r = normalizeApiObject(existing);
    const isExistingRecord = Boolean(r?.id && !r?._virtual);
    const initTotal = parseInt(r?.TotalAttendance) || 0;
    const initPass  = parseInt(r?.Pass)  || 0;
    const parsedFail = parseInt(r?.Fail, 10);
    const initFail  = Number.isFinite(parsedFail) ? parsedFail : Math.max(0, initTotal - initPass);

    const deptField = _departments.length
        ? `<select name="Department" class="form-input w-full" required>
               <option value="">— เลือกแผนก —</option>
               ${_departments.map(d => `<option value="${escHtml(d)}" ${(r?.Department||'').trim()===d?'selected':''}>${escHtml(d)}</option>`).join('')}
               ${r?.Department && !_departments.includes((r.Department||'').trim())
                   ? `<option value="${escHtml(r.Department)}" selected>${escHtml(r.Department)}</option>` : ''}
           </select>`
        : `<input type="text" name="Department" class="form-input w-full" required
               value="${escHtml(r?.Department||'')}" placeholder="ชื่อแผนก">`;

    const html = `
        <form id="man-form" class="space-y-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก <span class="text-red-500">*</span></label>
                ${deptField}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่สอบ</label>
                    <input type="date" name="ExamDate" class="form-input w-full"
                           value="${r?.ExamDate ? r.ExamDate.split('T')[0] : ''}">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผลสอบ</label>
                    <select name="Status" class="form-input w-full">
                        ${MAN_STATUSES.map(s => `<option value="${s}" ${(r?.Status||'Pending')===s?'selected':''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้เข้าสอบทั้งหมด</label>
                    <input type="number" id="man-total" name="TotalAttendance" min="0" class="form-input w-full" value="${initTotal}">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผ่าน</label>
                    <input type="number" id="man-pass" name="Pass" min="0" class="form-input w-full" value="${initPass}">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ไม่ผ่าน</label>
                    <input type="number" id="man-fail" name="Fail" min="0" readonly class="form-input w-full bg-slate-50 text-slate-500" value="${initFail >= 0 ? initFail : 0}">
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
    openModal(isExistingRecord ? 'แก้ไขผลสอบ' : 'บันทึกผลสอบ', html, 'max-w-lg');

    // Auto-compute Fail = TotalAttendance - Pass when either field changes
    setTimeout(() => {
        const totalEl = document.getElementById('man-total');
        const passEl  = document.getElementById('man-pass');
        const failEl  = document.getElementById('man-fail');
        const sync = () => {
            const t = parseInt(totalEl?.value) || 0;
            const p = parseInt(passEl?.value)  || 0;
            const f = Math.max(0, t - p);
            if (failEl) failEl.value = f;
        };
        totalEl?.addEventListener('input', sync);
        passEl?.addEventListener('input', sync);
    }, 0);

    document.getElementById('man-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
        e.preventDefault();
        const btn = document.getElementById('man-save-btn');
        btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
        try {
            showLoading('กำลังบันทึก...');
            const body = Object.fromEntries(new FormData(e.target).entries());
            const total = Number.parseInt(body.TotalAttendance, 10) || 0;
            const pass = Number.parseInt(body.Pass, 10) || 0;
            const fail = Number.parseInt(body.Fail, 10) || 0;
            if (pass > total || pass + fail !== total) {
                hideLoading();
                btn.disabled = false;
                btn.textContent = 'บันทึก';
                showError('จำนวนผ่านรวมกับไม่ผ่านต้องเท่ากับจำนวนผู้เข้าสอบทั้งหมด');
                return;
            }
            if (isExistingRecord) { await API.put(`/fourm/man-records/${r.id}`, body); }
            else          { await API.post('/fourm/man-records', body); }
            closeModal();
            showToast('บันทึกผลสอบสำเร็จ', 'success');
            await fetchAndRenderMan();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; btn.textContent = 'บันทึก'; }
    }));
}
function renderTrainingHistoryTab(body) {
    const rows = _tmAssignments
        .filter(a => a.Status && a.Status !== 'Assigned')
        .filter(a => _tmTextMatches(a, ['EmployeeID', 'EmployeeName', 'Department', 'Position', 'Status', 'Notes', 'RemovedBy'], _tmSearch.employee));
    const removed = _tmAssignments.filter(a => a.Status === 'Removed').length;
    const transferred = _tmAssignments.filter(a => a.Status === 'Transferred').length;
    body.innerHTML = `
        <div class="space-y-3">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div class="flex flex-wrap gap-2">
                    <span class="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-600">${rows.length} History</span>
                    <span class="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700">${removed} Removed</span>
                    <span class="px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-[11px] font-bold text-sky-700">${transferred} Transferred</span>
                </div>
                <div class="relative flex-1 max-w-xl">
                    <input id="tm-assignment-search" type="text" class="form-input w-full pl-9 py-2 text-sm"
                           value="${escHtml(_tmSearch.employee)}"
                           placeholder="Search history">
                    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                </div>
            </div>
            <div class="overflow-x-auto border border-slate-100 rounded-xl">
                <table class="ds-table text-sm">
                    <thead>
                        <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <th class="px-4 py-3">Employee</th>
                            <th class="px-4 py-3">Department</th>
                            <th class="px-4 py-3">Status</th>
                            <th class="px-4 py-3">Changed</th>
                            <th class="px-4 py-3 text-right"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.length ? rows.map(a => {
                            const changedAt = a.RemovedAt ? new Date(a.RemovedAt).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' }) : '-';
                            return `
                            <tr class="hover:bg-slate-50">
                                <td class="px-4 py-3">
                                    <p class="font-bold text-slate-800">${escHtml(a.EmployeeName || a.EmployeeID || '-')}</p>
                                    <p class="text-xs font-mono text-slate-400">${escHtml(a.EmployeeID || '')}</p>
                                </td>
                                <td class="px-4 py-3">
                                    <p class="text-sm text-slate-600">${escHtml(a.Department || '-')}</p>
                                    <p class="text-xs text-slate-400">${escHtml(a.Position || '')}</p>
                                </td>
                                <td class="px-4 py-3">${_tmStatusBadge(a.Status)}</td>
                                <td class="px-4 py-3">
                                    <p class="text-xs font-bold text-slate-600">${escHtml(a.RemovedBy || '-')}</p>
                                    <p class="text-[11px] text-slate-400 mt-1">${escHtml(changedAt)}</p>
                                </td>
                                <td class="px-4 py-3 text-right">
                                    <button type="button" class="btn-tm-employee-history px-2 py-1 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                                            data-employee-id="${escHtml(a.EmployeeID || '')}" data-name="${escHtml(a.EmployeeName || a.EmployeeID || '')}">
                                        History
                                    </button>
                                </td>
                            </tr>`;
                        }).join('') : `<tr><td colspan="5" class="text-center py-10 text-slate-400 text-sm">No removed or transferred employee history in this curriculum</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>`;
}

async function fetchTrainingPermissions({ force = false } = {}) {
    if (!force && _tmPermissions?._loaded) return _tmPermissions;
    try {
        const res = await API.get('/fourm/training-permissions');
        _tmPermissions = {
            canManageTraining: false,
            canManageAll: false,
            canDeleteHistory: false,
            department: '',
            permissionKey: 'FOURM_TRAINING_MANAGE',
            ...(normalizeApiObject(res?.data ?? res) || {}),
            _loaded: true,
        };
    } catch (_) {
        _tmPermissions = {
            canManageTraining: _isAdmin,
            canManageAll: _isAdmin,
            canDeleteHistory: _isAdmin,
            department: _currentUser.department || _currentUser.Department || '',
            permissionKey: 'FOURM_TRAINING_MANAGE',
            _loaded: true,
        };
    }
    return _tmPermissions;
}

async function deleteTrainingLog(logId) {
    const id = String(logId || '').trim();
    if (!id || !_isAdmin) return;
    const ok = await showConfirmationModal(
        'ลบประวัติรายการนี้? / Delete history?',
        'รายการประวัติจะถูกลบออกจาก Training Matrix audit log ต้องการดำเนินการต่อไหม? / Delete this Training Matrix history item?'
    );
    if (!ok) return;
    try {
        showLoading('กำลังลบประวัติ... / Deleting history...');
        await API.delete(`/fourm/training-logs/${encodeURIComponent(id)}`);
        document.querySelectorAll(`[data-tm-log-row="${id}"]`).forEach(el => el.remove());
        showToast('ลบประวัติสำเร็จ / History deleted', 'success');
    } catch (err) {
        showError(err);
    } finally {
        hideLoading();
    }
}

window._tmDeleteTrainingLog = deleteTrainingLog;

async function renderTrainingMatrix(container) {
    if (!container) return;
    const yearOpts = [0,1,2,3].map(i => {
        const y = new Date().getFullYear() - i;
        return `<option value="${y}" ${y === _tmFilter.year ? 'selected' : ''}>${y}</option>`;
    }).join('');
    const deptOpts = _departments.map(d => `<option value="${escHtml(d)}" ${_tmFilter.dept === d ? 'selected' : ''}>${escHtml(d)}</option>`).join('');
    container.innerHTML = `
        <div class="space-y-4">
            <div class="ds-filter-bar flex flex-wrap gap-3 items-center justify-between">
                <div class="flex flex-wrap items-center gap-2">
                    <label class="text-xs font-semibold text-slate-500" for="tm-filter-year">ปี / Year</label>
                    <select id="tm-filter-year" class="form-input py-1.5 text-sm w-24">${yearOpts}</select>
                    ${_isAdmin ? `
                    <select id="tm-filter-dept" class="form-input py-1.5 text-sm min-w-[180px]">
                        <option value="all" ${_tmFilter.dept === 'all' ? 'selected' : ''}>ทุกแผนก / All Departments</option>
                        ${deptOpts}
                    </select>` : `
                    <span class="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-600">
                        ${escHtml(_currentUser.department || _currentUser.Department || 'แผนกของฉัน / My Department')}
                    </span>`}
                </div>
                <div class="flex items-center gap-2">
                    <button id="btn-tm-refresh" type="button"
                            class="px-3 py-2 rounded-lg text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50">
                        รีเฟรช
                    </button>
                    <button id="btn-tm-audit-log" type="button"
                            class="px-3 py-2 rounded-lg text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50">
                        Log
                    </button>
                    <button id="btn-tm-export-excel" type="button"
                            class="px-3 py-2 rounded-lg text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50">
                        Excel
                    </button>
                    <button id="btn-tm-export-pdf" type="button"
                            class="px-3 py-2 rounded-lg text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50">
                        PDF
                    </button>
                    ${_isAdmin ? `<button id="btn-tm-course-master" type="button"
                            class="px-3 py-2 rounded-lg text-sm font-bold text-indigo-700 border border-indigo-200 hover:bg-indigo-50">
                        คลังรายวิชา
                    </button>
                    <button id="btn-tm-add-curriculum" type="button"
                            class="px-4 py-2 rounded-lg text-sm font-bold text-white"
                            style="background:linear-gradient(135deg,#6366f1,#0284c7)">
                        เพิ่มหลักสูตร / Add
                    </button>` : `<span class="px-3 py-2 rounded-lg text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200">User: จัดการพนักงาน / Employees only</span>`}
                </div>
            </div>
            <div id="tm-kpi-strip" class="grid grid-cols-2 lg:grid-cols-5 gap-3">
                ${Array(5).fill(0).map(() => `
                <div class="ds-metric-card flex items-center gap-3 animate-pulse">
                    <div class="w-9 h-9 rounded-xl bg-slate-100 flex-shrink-0"></div>
                    <div class="flex-1 min-w-0">
                        <div class="h-6 bg-slate-100 rounded mb-2 w-12"></div>
                        <div class="h-3 bg-slate-50 rounded w-20"></div>
                    </div>
                </div>`).join('')}
            </div>
            <div id="tm-selection-summary"
                 class="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                กำลังโหลด Scope... / Loading selection...
            </div>
            <div class="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4">
                <div class="ds-section p-0 overflow-hidden">
                    <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                        <div>
                            <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-500">หลักสูตร / Curriculum</p>
                            <h3 class="text-sm font-black text-slate-700">หลักสูตร / Curriculum</h3>
                        </div>
                    </div>
                    <div class="px-3 pt-3">
                        <div class="relative">
                            <input id="tm-curriculum-search" type="text" class="form-input w-full pl-9 py-2 text-sm"
                                   value="${escHtml(_tmSearch.curriculum)}"
                                   placeholder="ค้นหาหลักสูตร / Search curriculum">
                            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                            </svg>
                        </div>
                    </div>
                    <div id="tm-curriculum-list" class="p-3 space-y-2 min-h-[280px]">
                        <div class="text-center py-8 text-slate-400 text-sm">กำลังโหลด... / Loading...</div>
                    </div>
                </div>
                <div class="ds-section p-0 overflow-hidden">
                    <div id="tm-detail-shell" class="min-h-[520px]">
                        <div class="p-6 text-center text-sm text-slate-400">เลือกหลักสูตร / Select a curriculum</div>
                    </div>
                </div>
            </div>
        </div>`;
    await fetchTrainingMatrix();
}

function renderTrainingMatrixKpis() {
    const el = document.getElementById('tm-kpi-strip');
    if (!el) return;

    const curriculumTotal = _tmCurriculums.length;
    const courseTotal = _tmCurriculums.reduce((sum, c) => sum + (parseInt(c.CourseCount, 10) || 0), 0);
    const employeeTotal = _tmCurriculums.reduce((sum, c) => sum + (parseInt(c.AssignedCount, 10) || 0), 0);
    const selectedTransferred = _tmAssignments.filter(a => a.Status === 'Transferred').length;
    const inactiveTotal = _tmCurriculums.filter(c => Number(c.IsActive) !== 1).length
        + _tmCourses.filter(c => Number(c.IsActive) !== 1).length;
    const scopeDept = _isAdmin
        ? (_tmFilter.dept === 'all' ? 'ทุกแผนก / All Depts' : _tmFilter.dept)
        : (_currentUser.department || _currentUser.Department || 'แผนกของฉัน / My Dept');
    const selectedCourse = _tmCourses.find(c => c.id === _tmSelectedCourseId);

    const cards = [
        {
            label: 'หลักสูตร / Curr.',
            sub: `${_tmFilter.year} · ${scopeDept}`,
            value: curriculumTotal,
            color: '#6366f1',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253"/>',
        },
        {
            label: 'รายวิชา / Course',
            sub: 'รวมใน Scope',
            value: courseTotal,
            color: '#0284c7',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5h6m-6 4h6m-7 4h8m-9 6h10a2 2 0 002-2V7.5L14.5 3H7a2 2 0 00-2 2v12a2 2 0 002 2z"/>',
        },
        {
            label: 'พนักงาน / Emp.',
            sub: 'Assigned ทั้งหมด',
            value: employeeTotal,
            color: '#059669',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m8-4a4 4 0 10-8 0 4 4 0 008 0z"/>',
        },
        {
            label: 'ย้ายแล้ว / Transferred',
            sub: selectedCourse ? `${selectedCourse.CourseCode || '-'} · วิชานี้` : 'เลือกรายวิชา',
            value: selectedTransferred,
            color: '#0ea5e9',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/>',
        },
        {
            label: 'ปิดใช้งาน / Inactive',
            sub: 'หลักสูตร + วิชา',
            value: inactiveTotal,
            color: inactiveTotal ? '#e11d48' : '#64748b',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>',
        },
    ];

    el.innerHTML = cards.map(card => `
        <div class="ds-metric-card flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                 style="background:${card.color}18;color:${card.color}">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">${card.icon}</svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-black text-slate-800 leading-tight">${card.value}</p>
                <p class="text-[11px] font-bold text-slate-600 truncate">${escHtml(card.label)}</p>
                <p class="text-[10px] text-slate-400 truncate">${escHtml(card.sub)}</p>
            </div>
        </div>
    `).join('');
}

function renderTrainingMatrixBreadcrumb() {
    const el = document.getElementById('tm-selection-summary');
    if (!el) return;

    const iconPaths = {
        calendar: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3M5 11h14M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z"/>',
        building: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/>',
        book: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253"/>',
        file: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5h6m-6 4h6m-7 4h8m-9 6h10a2 2 0 002-2V7.5L14.5 3H7a2 2 0 00-2 2v12a2 2 0 002 2z"/>',
        users: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m8-4a4 4 0 10-8 0 4 4 0 008 0z"/>',
        shield: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3l7 4v5c0 4.5-3 8.5-7 9.8C8 20.5 5 16.5 5 12V7l7-4zM9.5 12l1.8 1.8 3.7-4"/>',
        user: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0"/>'
    };
    const curriculum = _tmCurriculums.find(c => c.id === _tmSelectedCurriculumId);
    const dept = curriculum?.Department
        || (_isAdmin ? (_tmFilter.dept === 'all' ? 'All Departments' : _tmFilter.dept) : (_currentUser.department || _currentUser.Department || 'My Department'));
    const activeCount = _tmAssignments.filter(a => a.Status === 'Assigned').length;
    const courseCount = _tmCourses.filter(c => Number(c.IsActive) !== 0).length;
    const roleLabel = _isAdmin ? 'Admin' : 'User';
    const curriculumLabel = curriculum
        ? `${curriculum.CurriculumCode || '-'} ${curriculum.CurriculumTitle || ''}`.trim()
        : 'เลือกหลักสูตร';
    const contextChip = (iconName, value, cls = 'border-slate-200 bg-white text-slate-700', iconCls = 'bg-slate-100 text-slate-600') => `
        <span class="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-black shadow-sm ${cls}">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg ${iconCls}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${iconPaths[iconName] || iconPaths.file}</svg>
            </span>
            <span class="truncate max-w-[220px]">${escHtml(value || '-')}</span>
        </span>`;

    el.innerHTML = `
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 rounded-2xl border border-white/80 bg-gradient-to-r from-white via-slate-50 to-emerald-50/70 px-3 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/5">
            <div class="flex flex-wrap items-center gap-2 min-w-0">
                ${contextChip('calendar', String(_tmFilter.year || '-'), 'border-indigo-100 bg-white text-indigo-700', 'bg-indigo-50 text-indigo-600')}
                ${contextChip('building', dept || '-', 'border-sky-100 bg-white text-sky-700', 'bg-sky-50 text-sky-600')}
                ${contextChip('book', curriculumLabel, curriculum ? 'border-violet-100 bg-white text-violet-700' : 'border-slate-200 bg-white text-slate-500', curriculum ? 'bg-violet-50 text-violet-600' : 'bg-slate-100 text-slate-500')}
            </div>
            <div class="flex flex-wrap items-center gap-2 shrink-0">
                ${contextChip('file', `${courseCount} วิชา`, 'border-slate-200 bg-white text-slate-700', 'bg-slate-100 text-slate-600')}
                ${contextChip('users', `${activeCount} คน`, 'border-emerald-100 bg-white text-emerald-700', 'bg-emerald-50 text-emerald-600')}
                ${contextChip(_isAdmin ? 'shield' : 'user', roleLabel, _isAdmin ? 'border-amber-100 bg-white text-amber-700' : 'border-slate-200 bg-white text-slate-600', _isAdmin ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600')}
            </div>
        </div>`;
}

function renderTrainingDetailShell() {
    const el = document.getElementById('tm-detail-shell');
    if (!el) return;
    const curriculum = _tmCurriculums.find(c => c.id === _tmSelectedCurriculumId);
    if (!curriculum) {
        el.innerHTML = `<div class="p-6 text-center text-sm text-slate-400">เลือกหลักสูตร / Select a curriculum</div>`;
        return;
    }
    const courseCount = _tmCourses.filter(c => Number(c.IsActive) !== 0).length;
    const assignedCount = _tmAssignments.filter(a => a.Status === 'Assigned').length;
    const tabBtn = (tab, label) => `
        <button type="button" class="tm-detail-tab px-3 py-2 text-sm font-bold border-b-2 ${_tmDetailTab === tab ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}"
                data-tm-detail-tab="${tab}">
            ${label}
        </button>`;
    el.innerHTML = `
        <div class="px-4 py-4 border-b border-slate-100">
            <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-500">รายละเอียดหลักสูตร / Curriculum detail</p>
                    <h3 class="mt-1 text-lg font-black text-slate-800 truncate" title="${escHtml(curriculum.CurriculumTitle || '-')}">
                        ${escHtml(curriculum.CurriculumCode || '-')} - ${escHtml(curriculum.CurriculumTitle || '-')}
                    </h3>
                    <p class="mt-1 text-xs font-semibold text-slate-500">${escHtml(curriculum.Department || '-')} · ${escHtml(String(curriculum.Year || _tmFilter.year))}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <span class="px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-[11px] font-bold text-sky-700">${courseCount} วิชา / Courses</span>
                    <span class="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700">${assignedCount} คน / Employees</span>
                    ${!courseCount ? '<span class="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-700">เพิ่มรายวิชาก่อน Assign</span>' : ''}
                </div>
            </div>
            <div class="mt-4 flex flex-wrap gap-2 border-b border-slate-100">
                ${tabBtn('courses', 'รายวิชา / Courses')}
                ${tabBtn('employees', 'พนักงาน / Employees')}
            </div>
        </div>
        <div id="tm-detail-body" class="p-4"></div>`;
    renderTrainingDetailBody();
}

function renderTrainingDetailBody() {
    const body = document.getElementById('tm-detail-body');
    if (!body) return;
    const courseCount = _tmCourses.filter(c => Number(c.IsActive) !== 0).length;
    if (_tmDetailTab === 'employees') {
        const readyToAssign = _tmSelectedCurriculumId && courseCount;
        body.innerHTML = `
            <div class="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
                <div class="min-w-0">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
                <div class="relative flex-1">
                    <input id="tm-assignment-search" type="text" class="form-input w-full pl-9 py-2 text-sm"
                           value="${escHtml(_tmSearch.employee)}"
                           placeholder="ค้นหาพนักงาน / Search employees"
                           ${_tmSelectedCurriculumId ? '' : 'disabled'}>
                    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                </div>
                <button id="btn-tm-assign-employees" type="button"
                        class="px-3 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
                        style="background:#059669" ${readyToAssign && _tmInlineSelectedEmployees.size ? '' : 'disabled'}>
                    เพิ่มที่เลือก / Assign
                </button>
                <button id="btn-tm-toggle-employee-master" type="button"
                        class="px-3 py-2 rounded-lg text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50">
                    ${_tmShowEmployeeMaster ? 'ซ่อน Employee Master' : 'เลือกพนักงาน'}
                </button>
            </div>
            ${!courseCount ? '<div class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">ต้องเพิ่มรายวิชาในหลักสูตรก่อน จึงจะเพิ่มพนักงานได้ / Add courses first</div>' : ''}
            <div class="overflow-x-auto border border-slate-100 rounded-xl">
                <table class="ds-table text-sm">
                    <thead>
                        <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <th class="px-4 py-3">พนักงาน / Employee</th>
                            <th class="px-4 py-3">แผนก / Department</th>
                            <th class="px-4 py-3">สถานะ / Status</th>
                            <th class="px-4 py-3 text-right"></th>
                        </tr>
                    </thead>
                    <tbody id="tm-assignment-tbody">${loadingRow(4)}</tbody>
                </table>
            </div>
                </div>
                ${_tmShowEmployeeMaster ? `<div class="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div class="px-3 py-2 border-b border-slate-100">
                        <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-500">Employee Master</p>
                        <p class="text-sm font-black text-slate-700">เลือกพนักงาน / Pick employees</p>
                    </div>
                    <div id="tm-inline-employee-master" class="max-h-[430px] overflow-y-auto"></div>
                    <div id="tm-inline-employee-summary" class="border-t border-slate-100 px-3 py-2 text-xs font-bold text-slate-500">
                        เลือกแล้ว 0 คน / 0 selected
                    </div>
                </div>` : ''}
            </div>`;
        renderTrainingAssignments();
        renderInlineEmployeeMaster();
        return;
    }

    body.innerHTML = `
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
            <div class="relative flex-1">
                <input id="tm-course-search" type="text" class="form-input w-full pl-9 py-2 text-sm"
                       value="${escHtml(_tmSearch.course)}"
                       placeholder="ค้นหารายวิชา / Search course"
                       ${_tmSelectedCurriculumId ? '' : 'disabled'}>
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
            </div>
            ${_isAdmin ? `<button id="btn-tm-add-course" type="button"
                    class="px-3 py-2 rounded-lg text-sm font-bold text-indigo-700 border border-indigo-200 hover:bg-indigo-50 disabled:opacity-40"
                    ${_tmSelectedCurriculumId ? '' : 'disabled'}>
                เลือกจากคลังรายวิชา / Add
            </button>` : `<span class="px-3 py-2 rounded-lg text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200">อ่านอย่างเดียว / Read only</span>`}
        </div>
        <div id="tm-course-list" class="space-y-4 min-h-[280px]"></div>`;
    renderTrainingCourses();
}

async function fetchTrainingMatrix() {
    const list = document.getElementById('tm-curriculum-list');
    if (list) list.innerHTML = `<div class="text-center py-8 text-slate-400 text-sm">กำลังโหลด... / Loading...</div>`;
    try {
        const p = new URLSearchParams();
        p.set('year', _tmFilter.year);
        if (_tmFilter.dept !== 'all') p.set('dept', _tmFilter.dept);
        const res = await API.get(`/fourm/training-curriculums?${p}`);
        _tmCurriculums = normalizeApiArray(res?.data ?? res);
        if (!_tmCurriculums.some(c => c.id === _tmSelectedCurriculumId)) {
            _tmSelectedCurriculumId = _tmCurriculums[0]?.id || null;
        }
        renderTrainingMatrixKpis();
        renderTrainingMatrixBreadcrumb();
        await renderTrainingCurriculums();
        if (_tmSelectedCurriculumId) await fetchTrainingCourses(_tmSelectedCurriculumId);
        else {
            _tmCourses = [];
            _tmAssignments = [];
            renderTrainingDetailShell();
            renderTrainingMatrixKpis();
            renderTrainingMatrixBreadcrumb();
        }
    } catch (err) {
        if (list) list.innerHTML = `<div class="p-4 text-sm text-rose-600">${escHtml(err.message || 'โหลดหลักสูตรไม่สำเร็จ / Cannot load curriculums')}</div>`;
    }
}

async function fetchTrainingCourseMaster({ force = false } = {}) {
    if (_tmCourseMaster.length && !force) return _tmCourseMaster;
    const res = await API.get('/fourm/training-course-master');
    _tmCourseMaster = normalizeApiArray(res?.data ?? res);
    return _tmCourseMaster;
}

async function fetchTrainingEmployeeMaster({ force = false } = {}) {
    if (!_tmEmployees.length || force) {
        const res = await API.get('/employees');
        _tmEmployees = normalizeApiArray(res?.data ?? res);
    }
    const curriculum = _tmCurriculums.find(c => c.id === _tmSelectedCurriculumId);
    if (curriculum) {
        const scopeParams = new URLSearchParams();
        scopeParams.set('year', _tmFilter.year);
        if (curriculum.Department) scopeParams.set('dept', curriculum.Department);
        const scopeRes = await API.get(`/fourm/training-employee-scopes?${scopeParams}`).catch(() => ({ data: [] }));
        _tmEmployeeScopes = normalizeApiArray(scopeRes?.data ?? scopeRes);
    }
    return _tmEmployees;
}

function _tmTextMatches(row, keys, q) {
    const needle = (q || '').trim().toLowerCase();
    if (!needle) return true;
    return keys.some(key => String(row?.[key] || '').toLowerCase().includes(needle));
}

async function renderTrainingCurriculums() {
    const el = document.getElementById('tm-curriculum-list');
    if (!el) return;
    const rows = _tmCurriculums.filter(c => _tmTextMatches(c, ['CurriculumCode', 'CurriculumTitle', 'Department', 'Notes'], _tmSearch.curriculum));
    if (!_tmCurriculums.length) {
        el.innerHTML = `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-400">ยังไม่มีหลักสูตรใน Scope นี้ / No curriculum in selected scope</div>`;
        return;
    }
    if (!rows.length) {
        el.innerHTML = `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-400">ไม่พบหลักสูตรที่ค้นหา / No matching curriculum</div>`;
        return;
    }
    el.innerHTML = rows.map(c => {
        const active = c.id === _tmSelectedCurriculumId;
        return `
        <button type="button" class="tm-curriculum-item w-full text-left rounded-xl border p-3 transition-all ${active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}"
                data-id="${c.id}">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="text-xs font-mono text-slate-400">${escHtml(c.CurriculumCode || '-')}</p>
                    <p class="text-sm font-black text-slate-800 truncate" title="${escHtml(c.CurriculumTitle || '-')}">${escHtml(c.CurriculumTitle || '-')}</p>
                    <p class="text-xs text-slate-500 mt-1 truncate">${escHtml(c.Department || '-')}</p>
                </div>
                <span class="text-xs font-bold text-indigo-700 bg-white/70 rounded-full px-2 py-1">${parseInt(c.AssignedCount) || 0}</span>
            </div>
            <div class="flex items-center justify-between mt-2 text-[11px] text-slate-400">
                <span>${parseInt(c.CourseCount) || 0} วิชา / courses</span>
                <span>${c.IsActive ? 'ใช้งาน / Active' : 'ปิด / Inactive'}</span>
            </div>
            ${_isAdmin ? `<div class="flex justify-end gap-1.5 mt-2">
                <span class="btn-tm-edit-curriculum px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-700 hover:bg-white" data-id="${c.id}">แก้ไข / Edit</span>
                <span class="btn-tm-disable-curriculum px-2 py-1 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-white" data-id="${c.id}" data-title="${escHtml(c.CurriculumTitle || '')}">ปิด / Disable</span>
            </div>` : ''}
        </button>`;
    }).join('');
}

async function fetchTrainingCourses(curriculumId) {
    const el = document.getElementById('tm-course-list');
    if (el) el.innerHTML = `<div class="text-center py-8 text-slate-400 text-sm">กำลังโหลด... / Loading...</div>`;
    const btn = document.getElementById('btn-tm-add-course');
    if (btn) btn.disabled = !curriculumId;
    try {
        const [res] = await Promise.all([
            API.get(`/fourm/training-curriculums/${curriculumId}/courses`),
            fetchTrainingCourseMaster({ force: true }),
            fetchTrainingEmployeeMaster({ force: true }),
        ]);
        _tmCourses = normalizeApiArray(res?.data ?? res);
        _tmSelectedCourseId = null;
        renderTrainingMatrixKpis();
        renderTrainingMatrixBreadcrumb();
        await fetchTrainingAssignments(curriculumId);
        renderTrainingDetailShell();
    } catch (err) {
        if (el) el.innerHTML = `<div class="p-4 text-sm text-rose-600">${escHtml(err.message || 'โหลดรายวิชาไม่สำเร็จ / Cannot load courses')}</div>`;
    }
}

function renderTrainingCourses() {
    const el = document.getElementById('tm-course-list');
    if (!el) return;
    const search = document.getElementById('tm-course-search');
    if (search) search.disabled = !_tmSelectedCurriculumId;
    if (!_tmSelectedCurriculumId) {
        el.innerHTML = `<div class="text-center py-8 text-slate-400 text-sm">เลือกหลักสูตรก่อน / Select a curriculum</div>`;
        return;
    }
    const rows = _tmCourses.filter(c => _tmTextMatches(c, ['CourseCode', 'CourseTitle'], _tmSearch.course));
    const linkedCodes = new Set(_tmCourses.filter(c => Number(c.IsActive) !== 0).map(c => String(c.CourseCode || '').toLowerCase()));
    const masterRows = _tmCourseMaster
        .filter(m => _tmTextMatches(m, ['CourseCode', 'CourseTitle', 'Category'], _tmSearch.course))
        .slice(0, _tmShowCourseMaster ? 120 : 8);
    const linkedHtml = rows.length ? rows.map(c => {
        const active = c.id === _tmSelectedCourseId;
        return `
        <button type="button" class="tm-course-item w-full text-left rounded-xl border p-3 transition-all ${active ? 'border-sky-300 bg-sky-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}"
                data-id="${c.id}">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="text-xs font-mono text-slate-400">${escHtml(c.CourseCode || '-')}</p>
                    <p class="text-sm font-black text-slate-800 truncate" title="${escHtml(c.CourseTitle || '-')}">${escHtml(c.CourseTitle || '-')}</p>
                </div>
                <span class="text-xs font-bold text-sky-700 bg-white/70 rounded-full px-2 py-1">${parseInt(c.AssignedCount) || 0}</span>
            </div>
            <div class="flex justify-end gap-1.5 mt-2">
                ${_isAdmin ? `<span class="btn-tm-edit-course px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-700 hover:bg-white" data-id="${c.id}">แก้ไข / Edit</span>
                <span class="btn-tm-disable-course px-2 py-1 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-white" data-id="${c.id}" data-title="${escHtml(c.CourseTitle || '')}">ลบออก / Remove</span>` : ''}
            </div>
        </button>`;
    }).join('') : `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-400">ยังไม่มีรายวิชาในหลักสูตร / No linked course</div>`;
    const masterHtml = masterRows.length ? masterRows.map(m => {
        const linked = linkedCodes.has(String(m.CourseCode || '').toLowerCase());
        return `
        <div class="flex items-start justify-between gap-3 rounded-xl border ${linked ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-100 bg-white hover:bg-slate-50'} p-3">
            <div class="min-w-0">
                <p class="text-xs font-mono text-slate-400">${escHtml(m.CourseCode || '-')}</p>
                <p class="text-sm font-black text-slate-800 truncate" title="${escHtml(m.CourseTitle || '-')}">${escHtml(m.CourseTitle || '-')}</p>
                <p class="text-xs text-slate-500 mt-1">${escHtml(m.Category || 'General')}</p>
            </div>
            ${linked
                ? '<span class="px-2 py-1 rounded-full text-[11px] font-bold text-emerald-700 bg-white border border-emerald-200">อยู่แล้ว / Linked</span>'
                : _isAdmin ? `<button type="button" class="btn-tm-link-master-course px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-700 border border-indigo-200 hover:bg-indigo-50" data-id="${escHtml(m.id || '')}">เพิ่ม / Add</button>` : '<span class="px-2 py-1 rounded-full text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200">Admin only</span>'}
        </div>`;
    }).join('') : `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-400">ไม่พบรายวิชาในคลัง / No master course</div>`;
    el.innerHTML = `
        <div>
            <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-black text-slate-700">รายวิชาในหลักสูตร / Linked courses</h4>
                <span class="text-xs font-bold text-slate-400">${rows.length} รายการ</span>
            </div>
            <div class="space-y-2">${linkedHtml}</div>
        </div>
        ${_isAdmin ? `<div>
            <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-black text-slate-700">คลังรายวิชา / Course Master</h4>
                <button type="button" id="btn-tm-toggle-course-master" class="text-xs font-bold text-indigo-700 hover:underline">
                    ${_tmShowCourseMaster ? 'แสดงแบบย่อ / Compact' : 'ดูเพิ่ม / Expand'}
                </button>
            </div>
            <div class="space-y-2">${masterHtml}</div>
        </div>` : ''}`;
}

async function fetchTrainingAssignments(curriculumId) {
    const tbody = document.getElementById('tm-assignment-tbody');
    if (tbody) tbody.innerHTML = loadingRow(4);
    const btn = document.getElementById('btn-tm-assign-employees');
    if (btn) btn.disabled = !curriculumId || !_tmCourses.length;
    try {
        const res = await API.get(`/fourm/training-curriculums/${curriculumId}/assignments?status=all`);
        _tmAssignments = normalizeApiArray(res?.data ?? res);
        renderTrainingAssignments();
        renderTrainingMatrixKpis();
        renderTrainingMatrixBreadcrumb();
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-rose-600 text-sm">${escHtml(err.message || 'โหลดรายชื่อพนักงานไม่สำเร็จ / Cannot load assignments')}</td></tr>`;
    }
}

function _tmStatusBadge(status) {
    const s = status || 'Assigned';
    const label = s === 'Assigned' ? 'อยู่ในรายวิชา / Assigned'
        : s === 'Transferred' ? 'ย้ายแล้ว / Transferred'
        : s === 'Removed' ? 'ลบออก / Removed'
        : s;
    const cls = s === 'Assigned'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : s === 'Transferred'
            ? 'bg-sky-50 text-sky-700 border-sky-200'
            : 'bg-slate-50 text-slate-500 border-slate-200';
    return `<span class="inline-flex px-2 py-1 rounded-full border text-[11px] font-bold ${cls}">${escHtml(label)}</span>`;
}

function renderTrainingAssignments() {
    const tbody = document.getElementById('tm-assignment-tbody');
    const title = document.getElementById('tm-assignment-title');
    const search = document.getElementById('tm-assignment-search');
    if (search) search.disabled = !_tmSelectedCurriculumId;
    if (title) {
        title.textContent = 'รายชื่อ / Assignments';
        title.title = title.textContent;
    }
    if (!tbody) return;
    if (!_tmSelectedCurriculumId) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-slate-400 text-sm">เลือกหลักสูตรก่อน / Select a curriculum</td></tr>`;
        return;
    }
    const rows = _tmAssignments.filter(a => _tmTextMatches(a, ['EmployeeID', 'EmployeeName', 'Department', 'Position', 'Status', 'Notes'], _tmSearch.employee));
    if (!_tmAssignments.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-slate-400 text-sm">ยังไม่มีพนักงานในหลักสูตรนี้ / No employee assigned</td></tr>`;
        return;
    }
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-slate-400 text-sm">ไม่พบพนักงานที่ค้นหา / No matching employee</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(a => `
        <tr class="hover:bg-slate-50 group">
            <td class="px-4 py-3">
                <p class="font-bold text-slate-800">${escHtml(a.EmployeeName || a.EmployeeID || '-')}</p>
                <p class="text-xs font-mono text-slate-400">${escHtml(a.EmployeeID || '')}</p>
            </td>
            <td class="px-4 py-3">
                <p class="text-sm text-slate-600">${escHtml(a.Department || '-')}</p>
                <p class="text-xs text-slate-400">${escHtml(a.Position || '')}</p>
            </td>
            <td class="px-4 py-3">${_tmStatusBadge(a.Status)}</td>
            <td class="px-4 py-3 text-right">
                <div class="flex flex-wrap items-center justify-end gap-1.5">
                    <button type="button" class="btn-tm-employee-history px-2 py-1 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                            data-employee-id="${escHtml(a.EmployeeID || '')}" data-name="${escHtml(a.EmployeeName || a.EmployeeID || '')}">
                        ประวัติ / History
                    </button>
                    ${a.Status === 'Assigned' ? `
                    <button type="button" class="btn-tm-transfer-curriculum px-2 py-1 rounded-lg text-xs font-bold text-sky-700 hover:bg-sky-50"
                            data-id="${a.id}" data-name="${escHtml(a.EmployeeName || a.EmployeeID || '')}">
                        ย้าย / Transfer
                    </button>
                    <button type="button" class="btn-tm-remove-assignment px-2 py-1 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50"
                            data-id="${a.id}" data-name="${escHtml(a.EmployeeName || a.EmployeeID || '')}">ลบออก / Remove</button>
                    ` : ''}
                </div>
            </td>
        </tr>`).join('');
}

function renderInlineEmployeeMaster() {
    const list = document.getElementById('tm-inline-employee-master');
    const summary = document.getElementById('tm-inline-employee-summary');
    const btn = document.getElementById('btn-tm-assign-employees');
    if (!list) {
        if (btn) {
            btn.disabled = !_tmSelectedCurriculumId || !_tmCourses.length || !_tmInlineSelectedEmployees.size;
            btn.textContent = _tmInlineSelectedEmployees.size
                ? `เพิ่ม ${_tmInlineSelectedEmployees.size} คน / Assign ${_tmInlineSelectedEmployees.size}`
                : 'เพิ่มที่เลือก / Assign';
        }
        return;
    }
    const curriculum = _tmCurriculums.find(c => c.id === _tmSelectedCurriculumId);
    if (!curriculum) {
        list.innerHTML = `<div class="p-4 text-center text-sm text-slate-400">เลือกหลักสูตรก่อน / Select curriculum</div>`;
        return;
    }
    const dept = curriculum.Department || '';
    const assigned = new Set(_tmAssignments.filter(a => a.Status === 'Assigned').map(a => String(a.EmployeeID)));
    const activeScopeByEmployee = new Map(_tmEmployeeScopes.map(row => [String(row.EmployeeID), row]));
    const q = (_tmSearch.employee || '').trim().toLowerCase();
    const rows = _tmEmployees
        .filter(e => !dept || String(e.Department || '').trim() === String(dept).trim())
        .filter(e => {
            const hay = [e.EmployeeID, e.EmployeeName, e.Department, e.Position, e.Unit].join(' ').toLowerCase();
            return !q || hay.includes(q);
        })
        .slice(0, 160);
    if (!rows.length) {
        list.innerHTML = `<div class="p-4 text-center text-sm text-slate-400">ไม่พบพนักงาน / No employee found</div>`;
    } else {
        list.innerHTML = rows.map(e => {
            const activeScope = activeScopeByEmployee.get(String(e.EmployeeID));
            const isAssigned = assigned.has(String(e.EmployeeID));
            const isOtherCurriculum = activeScope && String(activeScope.CurriculumID) !== String(curriculum.id);
            const disabled = isAssigned || isOtherCurriculum || !_tmCourses.length;
            const checked = _tmInlineSelectedEmployees.has(String(e.EmployeeID));
            const note = isAssigned
                ? 'อยู่ในหลักสูตรนี้แล้ว'
                : isOtherCurriculum
                    ? `อยู่ ${activeScope.CurriculumCode || 'หลักสูตรอื่น'} แล้ว`
                    : !_tmCourses.length
                        ? 'เพิ่มรายวิชาก่อน'
                        : '';
            return `
            <label class="flex items-start gap-3 p-3 border-b border-slate-100 last:border-0 ${disabled ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'}">
                <input type="checkbox" name="InlineEmployeeIDs" value="${escHtml(e.EmployeeID || '')}" class="mt-1 rounded border-slate-300" ${disabled ? 'disabled' : ''} ${checked ? 'checked' : ''}>
                <span class="min-w-0">
                    <span class="block text-sm font-bold text-slate-800 truncate">${escHtml(e.EmployeeName || e.EmployeeID || '-')}</span>
                    <span class="block text-xs text-slate-500">${escHtml(e.EmployeeID || '')} · ${escHtml(e.Position || '-')}</span>
                    ${note ? `<span class="inline-flex mt-1 text-[11px] font-bold ${isOtherCurriculum ? 'text-amber-700' : 'text-emerald-700'}">${escHtml(note)}</span>` : ''}
                </span>
            </label>`;
        }).join('');
    }
    if (summary) {
        summary.textContent = `เลือกแล้ว ${_tmInlineSelectedEmployees.size} คน / ${_tmInlineSelectedEmployees.size} selected`;
    }
    if (btn) {
        btn.disabled = !_tmSelectedCurriculumId || !_tmCourses.length || !_tmInlineSelectedEmployees.size;
        btn.textContent = _tmInlineSelectedEmployees.size
            ? `เพิ่ม ${_tmInlineSelectedEmployees.size} คน / Assign ${_tmInlineSelectedEmployees.size}`
            : 'เพิ่มที่เลือก / Assign';
    }
}

function showTrainingCurriculumForm(existing = null) {
    const r = normalizeApiObject(existing);
    const ownDept = _currentUser.department || _currentUser.Department || '';
    const deptField = !_isAdmin
        ? `<input type="hidden" name="Department" value="${escHtml(r.Department || ownDept)}">
           <div class="form-input w-full bg-slate-50 text-slate-600">${escHtml(r.Department || ownDept || 'แผนกของฉัน / My Department')}</div>`
        : _departments.length
        ? `<select name="Department" class="form-input w-full" required>
            <option value="">เลือกแผนก / Select department</option>
            ${_departments.map(d => `<option value="${escHtml(d)}" ${(r.Department || _tmFilter.dept) === d ? 'selected' : ''}>${escHtml(d)}</option>`).join('')}
        </select>`
        : `<input name="Department" class="form-input w-full" required value="${escHtml(r.Department || (_tmFilter.dept !== 'all' ? _tmFilter.dept : ''))}">`;
    const html = `
        <form id="tm-curriculum-form" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ปี / Year</label>
                    <input type="number" name="Year" class="form-input w-full" required value="${r.Year || _tmFilter.year}">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก / Department</label>
                    ${deptField}
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รหัสหลักสูตร / Curriculum Code</label>
                <input name="CurriculumCode" class="form-input w-full" required value="${escHtml(r.CurriculumCode || '')}" placeholder="4M-MAN-001">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อหลักสูตร / Curriculum Title</label>
                <input name="CurriculumTitle" class="form-input w-full" required value="${escHtml(r.CurriculumTitle || '')}" placeholder="4M Change Management Basic">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ / Notes</label>
                <textarea name="Notes" rows="3" class="form-input w-full resize-none">${escHtml(r.Notes || '')}</textarea>
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4" onclick="window.closeModal&&window.closeModal()">ยกเลิก / Cancel</button>
                <button type="submit" id="tm-curriculum-save-btn" class="btn btn-primary px-5">บันทึก / Save</button>
            </div>
        </form>`;
    openModal(existing ? 'แก้ไขหลักสูตร / Edit Curriculum' : 'เพิ่มหลักสูตร / Add Curriculum', html, 'max-w-lg');
    document.getElementById('tm-curriculum-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('tm-curriculum-save-btn');
        btn.disabled = true;
        try {
            showLoading('กำลังบันทึกหลักสูตร... / Saving curriculum...');
            const body = Object.fromEntries(new FormData(e.target).entries());
            if (existing) await API.put(`/fourm/training-curriculums/${r.id}`, body);
            else await API.post('/fourm/training-curriculums', body);
            closeModal();
            showToast('บันทึกหลักสูตรสำเร็จ / Curriculum saved', 'success');
            _tmFilter.year = parseInt(body.Year, 10) || _tmFilter.year;
            if (_isAdmin) _tmFilter.dept = body.Department || _tmFilter.dept;
            await renderTrainingMatrix(document.getElementById('fourm-man-subtab-content'));
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; }
    });
}

function showTrainingCourseForm(existing = null) {
    const curriculum = _tmCurriculums.find(c => c.id === _tmSelectedCurriculumId);
    if (!curriculum) { showToast('เลือกหลักสูตรก่อน / Select a curriculum first', 'warning'); return; }
    const r = normalizeApiObject(existing);
    const html = `
        <form id="tm-course-form" class="space-y-4">
            <div class="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm text-slate-600">
                <span class="font-bold">${escHtml(curriculum.CurriculumCode || '')}</span> ${escHtml(curriculum.CurriculumTitle || '')}
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รหัสรายวิชา / Course Code</label>
                <input name="CourseCode" class="form-input w-full" required value="${escHtml(r.CourseCode || '')}" placeholder="MAN-01">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อรายวิชา / Course Title</label>
                <input name="CourseTitle" class="form-input w-full" required value="${escHtml(r.CourseTitle || '')}" placeholder="Change awareness">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ลำดับ / Sort Order</label>
                <input type="number" name="SortOrder" class="form-input w-full" value="${r.SortOrder || 99}">
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4" onclick="window.closeModal&&window.closeModal()">ยกเลิก / Cancel</button>
                <button type="submit" id="tm-course-save-btn" class="btn btn-primary px-5">บันทึก / Save</button>
            </div>
        </form>`;
    openModal(existing ? 'แก้ไขรายวิชา / Edit Course' : 'เพิ่มรายวิชา / Add Course', html, 'max-w-lg');
    document.getElementById('tm-course-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('tm-course-save-btn');
        btn.disabled = true;
        try {
            showLoading('กำลังบันทึกรายวิชา... / Saving course...');
            const body = Object.fromEntries(new FormData(e.target).entries());
            if (existing) await API.put(`/fourm/training-courses/${r.id}`, body);
            else await API.post(`/fourm/training-curriculums/${_tmSelectedCurriculumId}/courses`, body);
            closeModal();
            showToast('บันทึกรายวิชาสำเร็จ / Course saved', 'success');
            await fetchTrainingCourses(_tmSelectedCurriculumId);
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; }
    });
}

async function showTrainingCourseMasterModal() {
    let masters = [];
    try {
        showLoading('กำลังโหลดคลังรายวิชา... / Loading course master...');
        const res = await API.get('/fourm/training-course-master?includeInactive=1');
        masters = normalizeApiArray(res?.data ?? res);
        hideLoading();
    } catch (err) {
        hideLoading();
        showError(err);
        return;
    }
    const renderRows = (rows) => rows.length ? rows.map(m => {
        const active = Number(m.IsActive) === 1;
        const payload = encodeURIComponent(JSON.stringify(m));
        return `
        <div class="flex items-start justify-between gap-3 p-3 border-b border-slate-100 last:border-0">
            <div class="min-w-0">
                <p class="text-sm font-black text-slate-800 truncate">${escHtml(m.CourseCode || '-')} - ${escHtml(m.CourseTitle || '-')}</p>
                <p class="text-xs text-slate-500">${escHtml(m.Category || 'General')} · ${active ? 'Active' : 'Inactive'}</p>
            </div>
            <div class="flex flex-wrap justify-end gap-1.5 shrink-0">
                <button type="button" class="btn-tm-master-edit px-2 py-1 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                        data-master="${payload}">แก้ไข / Edit</button>
                ${active
                    ? `<button type="button" class="btn-tm-master-disable px-2 py-1 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50"
                            data-id="${escHtml(m.id || '')}" data-title="${escHtml(m.CourseTitle || '')}">ปิด / Disable</button>`
                    : `<button type="button" class="btn-tm-master-restore px-2 py-1 rounded-lg text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                            data-id="${escHtml(m.id || '')}" data-title="${escHtml(m.CourseTitle || '')}">เปิดใช้ / Restore</button>
                       <button type="button" class="btn-tm-master-hard-delete px-2 py-1 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50"
                            data-id="${escHtml(m.id || '')}" data-title="${escHtml(m.CourseTitle || '')}">ลบถาวร / Delete</button>`}
            </div>
        </div>`;
    }).join('') : `<div class="p-5 text-center text-sm text-slate-400">ยังไม่มีรายวิชา / No course master</div>`;
    const html = `
        <div class="space-y-4">
            <form id="tm-course-master-form" class="grid grid-cols-1 lg:grid-cols-[120px_1fr_140px_auto_auto] gap-2 items-end">
                <input type="hidden" name="id" value="">
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">รหัส / Code</label>
                    <input name="CourseCode" class="form-input w-full" required placeholder="MAN-01">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">ชื่อรายวิชา / Title</label>
                    <input name="CourseTitle" class="form-input w-full" required placeholder="Course title">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">หมวด / Category</label>
                    <select name="Category" class="form-input w-full" required>
                        <option value="">เลือกหมวด / Select category</option>
                        ${COURSE_MASTER_CATEGORIES.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
                    </select>
                </div>
                <button type="submit" id="tm-course-master-save-btn" class="btn btn-primary px-4">เพิ่ม / Add</button>
                <button type="button" id="tm-course-master-reset-btn" class="btn btn-secondary px-4 hidden">ยกเลิกแก้ไข</button>
            </form>
            <div class="relative">
                <input id="tm-course-master-admin-search" class="form-input w-full pl-9" placeholder="ค้นหารายวิชา / Search">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
            </div>
            <div id="tm-course-master-admin-list" class="max-h-[420px] overflow-y-auto border border-slate-200 rounded-xl">${renderRows(masters)}</div>
        </div>`;
    openModal('คลังรายวิชา / Course Master', html, 'max-w-4xl');
    const refreshRows = () => {
        const q = (document.getElementById('tm-course-master-admin-search')?.value || '').trim().toLowerCase();
        const rows = masters.filter(m => {
            const hay = [m.CourseCode, m.CourseTitle, m.Category].join(' ').toLowerCase();
            return !q || hay.includes(q);
        });
        const list = document.getElementById('tm-course-master-admin-list');
        if (list) list.innerHTML = renderRows(rows);
    };
    document.getElementById('tm-course-master-admin-search')?.addEventListener('input', debounce(refreshRows, 120));
    const resetMasterForm = () => {
        const form = document.getElementById('tm-course-master-form');
        if (!form) return;
        form.reset();
        form.elements.id.value = '';
        const saveBtn = document.getElementById('tm-course-master-save-btn');
        const resetBtn = document.getElementById('tm-course-master-reset-btn');
        if (saveBtn) saveBtn.textContent = 'เพิ่ม / Add';
        if (resetBtn) resetBtn.classList.add('hidden');
    };
    document.getElementById('tm-course-master-reset-btn')?.addEventListener('click', resetMasterForm);
    document.getElementById('tm-course-master-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('tm-course-master-save-btn');
        btn.disabled = true;
        try {
            showLoading('กำลังบันทึกรายวิชา... / Saving course...');
            const body = Object.fromEntries(new FormData(e.target).entries());
            const id = body.id;
            delete body.id;
            if (id) await API.put(`/fourm/training-course-master/${id}`, body);
            else await API.post('/fourm/training-course-master', body);
            const res = await API.get('/fourm/training-course-master?includeInactive=1');
            masters = normalizeApiArray(res?.data ?? res);
            _tmCourseMaster = masters.filter(m => Number(m.IsActive) === 1);
            resetMasterForm();
            refreshRows();
            renderTrainingCourses();
            showToast(id ? 'แก้ไขรายวิชาสำเร็จ / Course updated' : 'เพิ่มรายวิชาสำเร็จ / Course added', 'success');
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; }
    });
    document.getElementById('tm-course-master-admin-list')?.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-tm-master-edit');
        if (editBtn) {
            try {
                const rec = JSON.parse(decodeURIComponent(editBtn.dataset.master || '{}'));
                const form = document.getElementById('tm-course-master-form');
                if (!form) return;
                form.elements.id.value = rec.id || '';
                form.elements.CourseCode.value = rec.CourseCode || '';
                form.elements.CourseTitle.value = rec.CourseTitle || '';
                form.elements.Category.value = COURSE_MASTER_CATEGORIES.includes(rec.Category || '') ? rec.Category : '';
                const saveBtn = document.getElementById('tm-course-master-save-btn');
                const resetBtn = document.getElementById('tm-course-master-reset-btn');
                if (saveBtn) saveBtn.textContent = 'บันทึก / Save';
                if (resetBtn) resetBtn.classList.remove('hidden');
                form.elements.CourseCode.focus();
            } catch (_) {}
            return;
        }
        const restoreBtn = e.target.closest('.btn-tm-master-restore');
        if (restoreBtn) {
            try {
                showLoading('กำลังเปิดใช้งานรายวิชา... / Restoring course...');
                await API.put(`/fourm/training-course-master/${restoreBtn.dataset.id}`, { IsActive: 1 });
                const res = await API.get('/fourm/training-course-master?includeInactive=1');
                masters = normalizeApiArray(res?.data ?? res);
                _tmCourseMaster = masters.filter(m => Number(m.IsActive) === 1);
                refreshRows();
                renderTrainingCourses();
                showToast('เปิดใช้งานรายวิชาสำเร็จ / Course restored', 'success');
            } catch (err) { showError(err); }
            finally { hideLoading(); }
            return;
        }
        const btn = e.target.closest('.btn-tm-master-disable');
        const hardBtn = e.target.closest('.btn-tm-master-hard-delete');
        if (!btn && !hardBtn) return;
        const targetBtn = btn || hardBtn;
        const hardDelete = Boolean(hardBtn);
        const ok = await showConfirmationModal(
            hardDelete ? 'ลบถาวรรายวิชา? / Permanently delete?' : 'ปิดรายวิชา? / Disable course?',
            hardDelete
                ? `ลบ "${targetBtn.dataset.title || 'course'}" ออกจากคลังถาวรใช่ไหม? ทำได้เฉพาะรายวิชาที่ไม่ถูกผูกกับหลักสูตร / Permanently delete this unused course?`
                : `ปิดใช้งาน "${targetBtn.dataset.title || 'course'}" ในคลังรายวิชาใช่ไหม? / Disable this Course Master item?`
        );
        if (!ok) return;
        try {
            showLoading(hardDelete ? 'กำลังลบถาวรรายวิชา... / Permanently deleting course...' : 'กำลังปิดรายวิชา... / Disabling course...');
            await API.delete(`/fourm/training-course-master/${targetBtn.dataset.id}${hardDelete ? '?hard=1' : ''}`);
            const res = await API.get('/fourm/training-course-master?includeInactive=1');
            masters = normalizeApiArray(res?.data ?? res);
            _tmCourseMaster = masters.filter(m => Number(m.IsActive) === 1);
            refreshRows();
            renderTrainingCourses();
            showToast(hardDelete ? 'ลบรายวิชาถาวรสำเร็จ / Course permanently deleted' : 'ปิดรายวิชาสำเร็จ / Course disabled', 'success');
        } catch (err) { showError(err); }
        finally { hideLoading(); }
    });
}

async function linkTrainingMasterCourse(masterId) {
    if (!_tmSelectedCurriculumId || !masterId) return;
    try {
        showLoading('กำลังเพิ่มรายวิชา... / Linking course...');
        await API.post(`/fourm/training-curriculums/${_tmSelectedCurriculumId}/courses`, { CourseMasterIDs: [masterId] });
        showToast('เพิ่มรายวิชาเข้าหลักสูตรสำเร็จ / Course linked', 'success');
        await fetchTrainingCourses(_tmSelectedCurriculumId);
        await fetchTrainingMatrix();
    } catch (err) { showError(err); }
    finally { hideLoading(); }
}

async function assignInlineTrainingEmployees() {
    if (!_tmSelectedCurriculumId || !_tmInlineSelectedEmployees.size) return;
    try {
        showLoading('กำลังเพิ่มพนักงาน... / Assigning employees...');
        const res = await API.post(`/fourm/training-curriculums/${_tmSelectedCurriculumId}/assignments`, {
            EmployeeIDs: Array.from(_tmInlineSelectedEmployees),
        });
        const blocked = normalizeApiArray(res?.data?.blocked || []);
        _tmInlineSelectedEmployees.clear();
        showToast(
            blocked.length
                ? `เพิ่มสำเร็จบางส่วน: ${blocked.length} คนอยู่หลักสูตรอื่นแล้ว / Partially assigned`
                : 'เพิ่มพนักงานสำเร็จ / Employees assigned',
            blocked.length ? 'warning' : 'success'
        );
        await fetchTrainingCourses(_tmSelectedCurriculumId);
        await fetchTrainingEmployeeMaster({ force: true });
        renderTrainingDetailShell();
    } catch (err) { showError(err); }
    finally { hideLoading(); }
}

async function showTransferCurriculumAssignmentModal(assignmentId) {
    const assignment = _tmAssignments.find(a => String(a.id) === String(assignmentId));
    const currentCurriculum = _tmCurriculums.find(c => String(c.id) === String(_tmSelectedCurriculumId));
    if (!assignment || !currentCurriculum) {
        showToast('เลือกพนักงานและหลักสูตรก่อน / Select employee and curriculum first', 'warning');
        return;
    }
    let curriculums = [];
    try {
        showLoading('กำลังโหลดหลักสูตรปลายทาง... / Loading destination curriculums...');
        const p = new URLSearchParams();
        p.set('year', _tmFilter.year);
        if (_tmFilter.dept !== 'all') p.set('dept', _tmFilter.dept);
        const res = await API.get(`/fourm/training-curriculums?${p}`);
        curriculums = normalizeApiArray(res?.data ?? res)
            .filter(c => String(c.id) !== String(currentCurriculum.id))
            .filter(c => (parseInt(c.CourseCount, 10) || 0) > 0);
        hideLoading();
    } catch (err) {
        hideLoading();
        showError(err);
        return;
    }
    const options = curriculums.map(c => `<option value="${escHtml(c.id)}" data-dept="${escHtml(c.Department || '')}" data-code="${escHtml(c.CurriculumCode || '')}" data-title="${escHtml(c.CurriculumTitle || '')}">
        ${escHtml(`${c.Department || '-'} / ${c.CurriculumCode || '-'} - ${c.CurriculumTitle || '-'}`)}
    </option>`).join('');
    const html = `
        <form id="tm-curriculum-transfer-form" class="space-y-4">
            <div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p class="text-sm font-black text-slate-800">${escHtml(assignment.EmployeeName || assignment.EmployeeID || '-')}</p>
                <p class="text-xs text-slate-500 mt-1">${escHtml(assignment.EmployeeID || '')}</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
                <div class="rounded-xl border border-slate-200 bg-white p-3">
                    <p class="text-[11px] font-black uppercase tracking-wider text-slate-400">เดิม / Current</p>
                    <p class="mt-2 text-sm font-black text-slate-800">${escHtml(currentCurriculum.CurriculumCode || '-')} - ${escHtml(currentCurriculum.CurriculumTitle || '-')}</p>
                    <p class="mt-1 text-xs font-semibold text-slate-400">${escHtml(currentCurriculum.Department || '-')}</p>
                </div>
                <div class="hidden sm:flex items-center justify-center text-slate-300 font-black">&rarr;</div>
                <div id="tm-curriculum-transfer-preview" class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
                    <p class="text-[11px] font-black uppercase tracking-wider text-slate-400">ใหม่ / Destination</p>
                    <p class="mt-2 text-sm font-black text-slate-400">เลือกหลักสูตรปลายทาง</p>
                </div>
            </div>
            <div id="tm-curriculum-transfer-warning" class="hidden rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"></div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หลักสูตรปลายทาง / Destination Curriculum</label>
                <select name="TargetCurriculumID" class="form-input w-full" required>
                    <option value="">เลือกหลักสูตร / Select curriculum</option>
                    ${options}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ / Transfer Note</label>
                <textarea name="Notes" rows="3" class="form-input w-full resize-none"></textarea>
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4" onclick="window.closeModal&&window.closeModal()">ยกเลิก / Cancel</button>
                <button type="submit" id="tm-curriculum-transfer-save-btn" class="btn btn-primary px-5">ย้าย / Transfer</button>
            </div>
        </form>`;
    openModal('ย้ายพนักงานข้ามหลักสูตร / Transfer Employee', html, 'max-w-lg');
    const updatePreview = () => {
        const select = document.querySelector('#tm-curriculum-transfer-form select[name="TargetCurriculumID"]');
        const opt = select?.selectedOptions?.[0];
        const preview = document.getElementById('tm-curriculum-transfer-preview');
        const warning = document.getElementById('tm-curriculum-transfer-warning');
        if (!preview || !warning) return;
        if (!opt?.value) {
            preview.className = 'rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3';
            preview.innerHTML = '<p class="text-[11px] font-black uppercase tracking-wider text-slate-400">ใหม่ / Destination</p><p class="mt-2 text-sm font-black text-slate-400">เลือกหลักสูตรปลายทาง</p>';
            warning.classList.add('hidden');
            return;
        }
        preview.className = 'rounded-xl border border-sky-200 bg-sky-50 p-3';
        preview.innerHTML = `<p class="text-[11px] font-black uppercase tracking-wider text-sky-500">ใหม่ / Destination</p>
            <p class="mt-2 text-sm font-black text-slate-800">${escHtml(opt.dataset.code || '-')} - ${escHtml(opt.dataset.title || '-')}</p>
            <p class="mt-1 text-xs font-semibold text-sky-700">${escHtml(opt.dataset.dept || '-')}</p>`;
        if (String(opt.dataset.dept || '') !== String(currentCurriculum.Department || '')) {
            warning.textContent = 'โปรดตรวจสอบ: หลักสูตรปลายทางอยู่คนละแผนก / Different department';
            warning.classList.remove('hidden');
        } else {
            warning.classList.add('hidden');
        }
    };
    document.querySelector('#tm-curriculum-transfer-form select[name="TargetCurriculumID"]')?.addEventListener('change', updatePreview);
    document.getElementById('tm-curriculum-transfer-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const targetId = form.querySelector('select[name="TargetCurriculumID"]')?.value || '';
        const target = curriculums.find(c => String(c.id) === String(targetId));
        if (!target) { showToast('เลือกหลักสูตรปลายทางก่อน / Select destination curriculum', 'warning'); return; }
        const ok = await showConfirmationModal(
            'ยืนยันการย้าย / Confirm transfer',
            `คุณกำลังย้าย ${assignment.EmployeeName || assignment.EmployeeID || '-'} จาก ${currentCurriculum.CurriculumCode || '-'} ไป ${target.CurriculumCode || '-'} ใช่ไหม?`
        );
        if (!ok) return;
        const btn = document.getElementById('tm-curriculum-transfer-save-btn');
        btn.disabled = true;
        try {
            showLoading('กำลังย้ายพนักงาน... / Transferring employee...');
            const body = Object.fromEntries(new FormData(form).entries());
            await API.post(`/fourm/training-curriculum-assignments/${assignment.id}/transfer`, body);
            closeModal();
            showToast('ย้ายพนักงานสำเร็จ / Employee transferred', 'success');
            await fetchTrainingAssignments(_tmSelectedCurriculumId);
            await fetchTrainingMatrix();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; }
    });
}

async function showTrainingCoursePickerModal() {
    const curriculum = _tmCurriculums.find(c => c.id === _tmSelectedCurriculumId);
    if (!curriculum) { showToast('เลือกหลักสูตรก่อน / Select a curriculum first', 'warning'); return; }
    let masters = [];
    try {
        showLoading('กำลังโหลดคลังรายวิชา... / Loading course master...');
        const res = await API.get('/fourm/training-course-master');
        masters = normalizeApiArray(res?.data ?? res);
        hideLoading();
    } catch (err) {
        hideLoading();
        showError(err);
        return;
    }
    const linkedCodes = new Set(_tmCourses.filter(c => Number(c.IsActive) !== 0).map(c => String(c.CourseCode || '').toLowerCase()));
    const selectedIds = new Set();
    const html = `
        <form id="tm-course-picker-form" class="space-y-4">
            <div class="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p class="text-sm font-bold text-slate-700">${escHtml(curriculum.CurriculumCode || '')} - ${escHtml(curriculum.CurriculumTitle || '')}</p>
                <p class="text-xs text-slate-500 mt-1">เลือกจากคลังรายวิชา / Pick courses from master</p>
            </div>
            <div class="relative">
                <input id="tm-course-master-search" type="text" class="form-input w-full pl-9" placeholder="ค้นหารหัสหรือชื่อรายวิชา / Search course master">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
            </div>
            <div id="tm-course-master-list" class="max-h-[360px] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100"></div>
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-100">
                <div id="tm-course-picker-summary" class="text-sm font-bold text-slate-500">เลือกแล้ว 0 วิชา / 0 selected</div>
                <div class="flex justify-end gap-3">
                    <button type="button" class="btn btn-secondary px-4" onclick="window.closeModal&&window.closeModal()">ยกเลิก / Cancel</button>
                    <button type="submit" id="tm-course-picker-save-btn" class="btn btn-primary px-5" disabled>เพิ่มที่เลือก / Add selected</button>
                </div>
            </div>
        </form>`;
    openModal('เลือกจากคลังรายวิชา / Add Courses', html, 'max-w-2xl');
    const updateSummary = () => {
        const count = selectedIds.size;
        const summary = document.getElementById('tm-course-picker-summary');
        const btn = document.getElementById('tm-course-picker-save-btn');
        if (summary) summary.textContent = `เลือกแล้ว ${count} วิชา / ${count} selected`;
        if (btn) btn.disabled = count === 0;
    };
    const renderMasterList = () => {
        const q = (document.getElementById('tm-course-master-search')?.value || '').trim().toLowerCase();
        const rows = masters.filter(m => {
            const hay = [m.CourseCode, m.CourseTitle, m.Category].join(' ').toLowerCase();
            return !q || hay.includes(q);
        }).slice(0, 250);
        const list = document.getElementById('tm-course-master-list');
        if (!list) return;
        if (!rows.length) {
            list.innerHTML = `<div class="p-5 text-center text-sm text-slate-400">ไม่พบรายวิชา / No course found</div>`;
            return;
        }
        list.innerHTML = rows.map(m => {
            const linked = linkedCodes.has(String(m.CourseCode || '').toLowerCase());
            const checked = selectedIds.has(String(m.id));
            return `
            <label class="flex items-start gap-3 p-3 ${linked ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'}">
                <input type="checkbox" name="CourseMasterIDs" value="${escHtml(m.id || '')}" class="mt-1 rounded border-slate-300" ${linked ? 'disabled' : ''} ${checked ? 'checked' : ''}>
                <span class="min-w-0">
                    <span class="block text-sm font-black text-slate-800">${escHtml(m.CourseCode || '-')} - ${escHtml(m.CourseTitle || '-')}</span>
                    <span class="block text-xs text-slate-500">${escHtml(m.Category || 'General')}</span>
                    ${linked ? '<span class="inline-flex mt-1 text-[11px] font-bold text-emerald-700">อยู่ในหลักสูตรแล้ว / Already linked</span>' : ''}
                </span>
            </label>`;
        }).join('');
        updateSummary();
    };
    renderMasterList();
    document.getElementById('tm-course-master-search')?.addEventListener('input', debounce(renderMasterList, 120));
    document.getElementById('tm-course-master-list')?.addEventListener('change', (e) => {
        if (e.target?.name !== 'CourseMasterIDs') return;
        if (e.target.checked) selectedIds.add(String(e.target.value));
        else selectedIds.delete(String(e.target.value));
        updateSummary();
    });
    document.getElementById('tm-course-picker-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedIds.size) return;
        const btn = document.getElementById('tm-course-picker-save-btn');
        btn.disabled = true;
        try {
            showLoading('กำลังเพิ่มรายวิชา... / Linking courses...');
            await API.post(`/fourm/training-curriculums/${_tmSelectedCurriculumId}/courses`, { CourseMasterIDs: Array.from(selectedIds) });
            closeModal();
            showToast('เพิ่มรายวิชาเข้าหลักสูตรสำเร็จ / Courses linked', 'success');
            await fetchTrainingCourses(_tmSelectedCurriculumId);
            await fetchTrainingMatrix();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; }
    });
}

async function showAssignEmployeesModal() {
    const curriculum = _tmCurriculums.find(c => c.id === _tmSelectedCurriculumId);
    if (!curriculum) { showToast('เลือกหลักสูตรก่อน / Select a curriculum first', 'warning'); return; }
    if (!_tmCourses.length) { showToast('เพิ่มรายวิชาในหลักสูตรก่อน / Add courses first', 'warning'); return; }
    let activeScopeByEmployee = new Map();
    try {
        showLoading('กำลังโหลดรายชื่อพนักงาน... / Loading employees...');
        if (!_tmEmployees.length) {
            const res = await API.get('/employees');
            _tmEmployees = normalizeApiArray(res?.data ?? res);
        }
        const scopeParams = new URLSearchParams();
        scopeParams.set('year', _tmFilter.year);
        if (curriculum.Department) scopeParams.set('dept', curriculum.Department);
        const scopeRes = await API.get(`/fourm/training-employee-scopes?${scopeParams}`);
        const activeScopes = normalizeApiArray(scopeRes?.data ?? scopeRes);
        activeScopeByEmployee = new Map(activeScopes.map(row => [String(row.EmployeeID), row]));
        hideLoading();
    } catch (err) {
        hideLoading();
        showError(err);
        return;
    }
    const assigned = new Set(_tmAssignments.filter(a => a.Status === 'Assigned').map(a => String(a.EmployeeID)));
    const selectedEmployeeIds = new Set();
    const dept = curriculum.Department || '';
    const html = `
        <form id="tm-assign-form" class="space-y-4">
            <div class="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p class="text-sm font-bold text-slate-700">${escHtml(curriculum.CurriculumCode || '')} - ${escHtml(curriculum.CurriculumTitle || '')}</p>
                <p class="text-xs text-slate-500 mt-1">${escHtml(dept || '-')} · ${_tmCourses.length} วิชา / courses</p>
            </div>
            <div class="relative">
                <input id="tm-employee-search" type="text" class="form-input w-full pl-9" placeholder="ค้นหาพนักงานด้วยรหัส ชื่อ แผนก หรือตำแหน่ง / Search employee">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
            </div>
            <div id="tm-employee-pick-list" class="max-h-[360px] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100"></div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ / Notes</label>
                <textarea name="Notes" rows="2" class="form-input w-full resize-none"></textarea>
            </div>
            <div class="sticky bottom-0 -mx-1 bg-white/95 backdrop-blur border-t border-slate-100 pt-3 pb-1">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div id="tm-assign-selected-summary" class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">
                        เลือกแล้ว 0 คน / 0 selected
                    </div>
                    <div class="flex justify-end gap-3">
                        <button type="button" class="btn btn-secondary px-4" onclick="window.closeModal&&window.closeModal()">ยกเลิก / Cancel</button>
                        <button type="submit" id="tm-assign-save-btn" class="btn btn-primary px-5" disabled>เพิ่มที่เลือก / Assign Selected</button>
                    </div>
                </div>
            </div>
        </form>`;
    openModal('เพิ่มพนักงานเข้า Scope / Assign Employees', html, 'max-w-2xl');
    const updateSelectedSummary = () => {
        const count = selectedEmployeeIds.size;
        const summary = document.getElementById('tm-assign-selected-summary');
        const btn = document.getElementById('tm-assign-save-btn');
        if (summary) {
            summary.className = `rounded-lg border px-3 py-2 text-sm font-bold ${count ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`;
            summary.textContent = `เลือกแล้ว ${count} คน / ${count} selected`;
        }
        if (btn) {
            btn.disabled = count === 0;
            btn.textContent = count ? `เพิ่ม ${count} คน / Assign ${count}` : 'เพิ่มที่เลือก / Assign Selected';
        }
    };
    const renderPickList = () => {
        const q = (document.getElementById('tm-employee-search')?.value || '').trim().toLowerCase();
        const rows = _tmEmployees
            .filter(e => !dept || String(e.Department || '').trim() === String(dept).trim())
            .filter(e => {
                const hay = [e.EmployeeID, e.EmployeeName, e.Department, e.Position, e.Unit].join(' ').toLowerCase();
                return !q || hay.includes(q);
            })
            .slice(0, 200);
        const list = document.getElementById('tm-employee-pick-list');
        if (!list) return;
        if (!rows.length) {
            list.innerHTML = `<div class="p-5 text-center text-sm text-slate-400">ไม่พบพนักงาน / No employee found</div>`;
            return;
        }
        list.innerHTML = rows.map(e => {
            const isAssigned = assigned.has(String(e.EmployeeID));
            const isSelected = selectedEmployeeIds.has(String(e.EmployeeID));
            const activeScope = activeScopeByEmployee.get(String(e.EmployeeID));
            const isInOtherCurriculum = activeScope && String(activeScope.CurriculumID) !== String(curriculum.id);
            const isInSameCurriculum = activeScope && String(activeScope.CurriculumID) === String(curriculum.id);
            const disabled = isAssigned || isInOtherCurriculum;
            const rowNote = isAssigned
                ? 'อยู่ในรายวิชานี้แล้ว / Already assigned'
                : isInOtherCurriculum
                    ? `อยู่หลักสูตร ${activeScope.CurriculumCode || '-'} แล้ว / In another curriculum`
                    : isInSameCurriculum
                        ? `อยู่หลักสูตรนี้แล้ว / Same curriculum`
                        : '';
            return `
            <label class="flex items-start gap-3 p-3 ${disabled ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'}">
                <input type="checkbox" name="EmployeeIDs" value="${escHtml(e.EmployeeID || '')}" class="mt-1 rounded border-slate-300" ${disabled ? 'disabled' : ''} ${isSelected ? 'checked' : ''}>
                <span class="min-w-0">
                    <span class="block text-sm font-bold text-slate-800">${escHtml(e.EmployeeName || e.EmployeeID || '-')}</span>
                    <span class="block text-xs text-slate-500">${escHtml(e.EmployeeID || '')} · ${escHtml(e.Department || '-')} · ${escHtml(e.Position || '-')}</span>
                    ${rowNote ? `<span class="inline-flex mt-1 text-[11px] font-bold ${isInOtherCurriculum ? 'text-amber-700' : 'text-emerald-700'}">${escHtml(rowNote)}</span>` : ''}
                </span>
            </label>`;
        }).join('');
        updateSelectedSummary();
    };
    renderPickList();
    document.getElementById('tm-employee-search')?.addEventListener('input', debounce(renderPickList, 120));
    document.getElementById('tm-employee-pick-list')?.addEventListener('change', (e) => {
        if (e.target?.name !== 'EmployeeIDs') return;
        if (e.target.checked) selectedEmployeeIds.add(String(e.target.value));
        else selectedEmployeeIds.delete(String(e.target.value));
        updateSelectedSummary();
    });
    document.getElementById('tm-assign-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const checked = Array.from(selectedEmployeeIds);
        if (!checked.length) { showToast('เลือกพนักงานอย่างน้อย 1 คน / Select at least one employee', 'warning'); return; }
        const btn = document.getElementById('tm-assign-save-btn');
        btn.disabled = true;
        try {
            showLoading('กำลังเพิ่มพนักงาน... / Assigning employees...');
            const body = { EmployeeIDs: checked, Notes: new FormData(e.target).get('Notes') || '' };
            const res = await API.post(`/fourm/training-curriculums/${_tmSelectedCurriculumId}/assignments`, body);
            const blocked = normalizeApiArray(res?.data?.blocked || []);
            closeModal();
            showToast(
                blocked.length
                    ? `เพิ่มสำเร็จบางส่วน: ${blocked.length} คนอยู่หลักสูตรอื่นแล้ว / Partially assigned`
                    : 'เพิ่มพนักงานสำเร็จ / Employees assigned',
                blocked.length ? 'warning' : 'success'
            );
            await fetchTrainingAssignments(_tmSelectedCurriculumId);
            await fetchTrainingMatrix();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; }
    });
}

async function showTransferAssignmentModal(assignmentId) {
    const assignment = _tmAssignments.find(a => String(a.id) === String(assignmentId));
    const currentCourse = _tmCourses.find(c => c.id === _tmSelectedCourseId);
    if (!assignment || !currentCourse) { showToast('เลือกพนักงานที่อยู่ในรายวิชาก่อน / Select an assigned employee first', 'warning'); return; }

    let curriculums = [];
    let courseMap = new Map();
    try {
        showLoading('กำลังโหลดรายวิชาปลายทาง... / Loading destination courses...');
        const p = new URLSearchParams();
        p.set('year', _tmFilter.year);
        if (_tmFilter.dept !== 'all') p.set('dept', _tmFilter.dept);
        const curRes = await API.get(`/fourm/training-curriculums?${p}`);
        curriculums = normalizeApiArray(curRes?.data ?? curRes);
        for (const cur of curriculums) {
            const courseRes = await API.get(`/fourm/training-curriculums/${cur.id}/courses`).catch(() => ({ data: [] }));
            courseMap.set(cur.id, normalizeApiArray(courseRes?.data ?? courseRes).filter(c => c.id !== currentCourse.id));
        }
        hideLoading();
    } catch (err) {
        hideLoading();
        showError(err);
        return;
    }

    const currentCurriculum = _tmCurriculums.find(c => c.id === _tmSelectedCurriculumId) || curriculums.find(c => (courseMap.get(c.id) || []).some(x => x.id === currentCourse.id)) || {};
    const destinationCourses = [];
    const optionGroups = curriculums.map(cur => {
        const courses = courseMap.get(cur.id) || [];
        if (!courses.length) return '';
        courses.forEach(c => destinationCourses.push({ ...c, CurriculumID: cur.id, CurriculumCode: cur.CurriculumCode, CurriculumTitle: cur.CurriculumTitle, Department: cur.Department }));
        return `<optgroup label="${escHtml(`${cur.Department || '-'} / ${cur.CurriculumCode || ''} ${cur.CurriculumTitle || ''}`)}">
            ${courses.map(c => `<option value="${c.id}"
                data-course-code="${escHtml(c.CourseCode || '')}"
                data-course-title="${escHtml(c.CourseTitle || '')}"
                data-curriculum-code="${escHtml(cur.CurriculumCode || '')}"
                data-curriculum-title="${escHtml(cur.CurriculumTitle || '')}"
                data-department="${escHtml(cur.Department || '')}">${escHtml(`${c.CourseCode || '-'} - ${c.CourseTitle || '-'}`)}</option>`).join('')}
        </optgroup>`;
    }).join('');

    const html = `
        <form id="tm-transfer-form" class="space-y-4">
            <div class="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p class="text-sm font-bold text-slate-700">${escHtml(assignment.EmployeeName || assignment.EmployeeID || '-')}</p>
                <p class="text-xs text-slate-500 mt-1">${escHtml(assignment.EmployeeID || '')} · ปัจจุบัน / Current: ${escHtml(currentCourse.CourseCode || '')} - ${escHtml(currentCourse.CourseTitle || '')}</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
                <div class="rounded-xl border border-slate-200 bg-white p-3">
                    <p class="text-[11px] font-black uppercase tracking-wider text-slate-400">เดิม / Current</p>
                    <p class="mt-2 text-sm font-black text-slate-800">${escHtml(currentCourse.CourseCode || '-')} - ${escHtml(currentCourse.CourseTitle || '-')}</p>
                    <p class="mt-1 text-xs text-slate-500">${escHtml(currentCurriculum.CurriculumCode || '-')} ${escHtml(currentCurriculum.CurriculumTitle || '')}</p>
                    <p class="mt-1 text-xs font-semibold text-slate-400">${escHtml(currentCurriculum.Department || '-')}</p>
                </div>
                <div class="hidden sm:flex items-center justify-center text-slate-300 font-black">&rarr;</div>
                <div id="tm-transfer-target-preview" class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
                    <p class="text-[11px] font-black uppercase tracking-wider text-slate-400">ใหม่ / Destination</p>
                    <p class="mt-2 text-sm font-black text-slate-400">เลือกรายวิชาปลายทาง / Select destination</p>
                    <p class="mt-1 text-xs text-slate-400">ระบบจะแสดงหลักสูตรและแผนกที่นี่</p>
                </div>
            </div>
            <div id="tm-transfer-warning" class="hidden rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"></div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายวิชาปลายทาง / Destination Course</label>
                <select name="TargetCourseID" class="form-input w-full" required>
                    <option value="">เลือกรายวิชาปลายทาง / Select destination course</option>
                    ${optionGroups}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุการย้าย / Transfer Note</label>
                <textarea name="Notes" rows="3" class="form-input w-full resize-none" placeholder="เหตุผลหรือหมายเหตุ audit / Reason or audit note..."></textarea>
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4" onclick="window.closeModal&&window.closeModal()">ยกเลิก / Cancel</button>
                <button type="submit" id="tm-transfer-save-btn" class="btn btn-primary px-5">ย้าย / Transfer</button>
            </div>
        </form>`;
    openModal('ย้ายพนักงาน / Transfer Employee', html, 'max-w-lg');
    if (!optionGroups.trim()) {
        const select = document.querySelector('#tm-transfer-form select[name="TargetCourseID"]');
        if (select) select.innerHTML = '<option value="">ไม่มีรายวิชาปลายทาง / No destination course available</option>';
    }
    const updateTransferPreview = () => {
        const select = document.querySelector('#tm-transfer-form select[name="TargetCourseID"]');
        const preview = document.getElementById('tm-transfer-target-preview');
        const warning = document.getElementById('tm-transfer-warning');
        const option = select?.selectedOptions?.[0];
        if (!preview || !warning) return;
        if (!option || !option.value) {
            preview.className = 'rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3';
            preview.innerHTML = `
                <p class="text-[11px] font-black uppercase tracking-wider text-slate-400">ใหม่ / Destination</p>
                <p class="mt-2 text-sm font-black text-slate-400">เลือกรายวิชาปลายทาง / Select destination</p>
                <p class="mt-1 text-xs text-slate-400">ระบบจะแสดงหลักสูตรและแผนกที่นี่</p>`;
            warning.classList.add('hidden');
            warning.textContent = '';
            return;
        }
        const target = {
            CourseCode: option.dataset.courseCode || '',
            CourseTitle: option.dataset.courseTitle || '',
            CurriculumCode: option.dataset.curriculumCode || '',
            CurriculumTitle: option.dataset.curriculumTitle || '',
            Department: option.dataset.department || '',
        };
        preview.className = 'rounded-xl border border-sky-200 bg-sky-50 p-3';
        preview.innerHTML = `
            <p class="text-[11px] font-black uppercase tracking-wider text-sky-500">ใหม่ / Destination</p>
            <p class="mt-2 text-sm font-black text-slate-800">${escHtml(target.CourseCode || '-')} - ${escHtml(target.CourseTitle || '-')}</p>
            <p class="mt-1 text-xs text-slate-600">${escHtml(target.CurriculumCode || '-')} ${escHtml(target.CurriculumTitle || '')}</p>
            <p class="mt-1 text-xs font-semibold text-sky-700">${escHtml(target.Department || '-')}</p>`;
        const warnings = [];
        if (String(target.CurriculumCode || '') !== String(currentCurriculum.CurriculumCode || '')) warnings.push('คนละหลักสูตร / Different curriculum');
        if (String(target.Department || '') !== String(currentCurriculum.Department || '')) warnings.push('คนละแผนก / Different department');
        if (warnings.length) {
            warning.classList.remove('hidden');
            warning.textContent = `โปรดตรวจสอบ: ${warnings.join(' · ')}`;
        } else {
            warning.classList.add('hidden');
            warning.textContent = '';
        }
    };
    document.querySelector('#tm-transfer-form select[name="TargetCourseID"]')?.addEventListener('change', updateTransferPreview);
    updateTransferPreview();
    document.getElementById('tm-transfer-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('tm-transfer-save-btn');
        const form = e.target;
        const targetCourseId = form.querySelector('select[name="TargetCourseID"]')?.value || '';
        const targetCourse = destinationCourses.find(c => String(c.id) === String(targetCourseId));
        if (!targetCourse) { showToast('เลือกรายวิชาปลายทางก่อน / Select destination course first', 'warning'); return; }
        const ok = await showConfirmationModal(
            'ยืนยันการย้ายพนักงาน / Confirm transfer',
            `คุณกำลังย้าย ${assignment.EmployeeName || assignment.EmployeeID || '-'} จาก ${currentCourse.CourseCode || '-'} ไป ${targetCourse.CourseCode || '-'} ใช่ไหม? / Move from ${currentCourse.CourseCode || '-'} to ${targetCourse.CourseCode || '-'}?`
        );
        if (!ok) return;
        btn.disabled = true;
        try {
            showLoading('กำลังย้ายพนักงาน... / Transferring employee...');
            const body = Object.fromEntries(new FormData(form).entries());
            await API.post(`/fourm/training-assignments/${assignment.id}/transfer`, body);
            closeModal();
            showToast('ย้ายพนักงานสำเร็จ / Employee transferred', 'success');
            await fetchTrainingAssignments(_tmSelectedCourseId);
            await fetchTrainingMatrix();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; }
    });
}

async function showTrainingEmployeeHistoryModal(employeeId, employeeName = '') {
    if (!employeeId) { showToast('ไม่พบรหัสพนักงาน / Employee ID not found', 'warning'); return; }
    const safeName = employeeName || employeeId;
    const html = `
        <div class="space-y-4">
            <div class="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p class="text-sm font-black text-slate-800">${escHtml(safeName)}</p>
                <p class="text-xs font-mono text-slate-500 mt-1">${escHtml(employeeId)}</p>
            </div>
            <div id="tm-employee-history-list" class="max-h-[520px] overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                <div class="p-6 text-center text-sm text-slate-400">กำลังโหลดประวัติ... / Loading history...</div>
            </div>
        </div>`;
    openModal('ประวัติพนักงาน / Employee History', html, 'max-w-3xl');

    const list = document.getElementById('tm-employee-history-list');
    try {
        const p = new URLSearchParams();
        p.set('employeeId', employeeId);
        p.set('year', _tmFilter.year);
        p.set('limit', '120');
        if (_isAdmin && _tmFilter.dept !== 'all') p.set('dept', _tmFilter.dept);
        const res = await API.get(`/fourm/training-logs?${p}`);
        const rows = normalizeApiArray(res?.data ?? res);
        if (!list) return;
        if (!rows.length) {
            list.innerHTML = `<div class="p-6 text-center text-sm text-slate-400">ยังไม่มีประวัติของพนักงานคนนี้ในปี ${_tmFilter.year} / No history in this year</div>`;
            return;
        }
        list.innerHTML = rows.map(row => {
            const when = row.PerformedAt ? new Date(row.PerformedAt).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' }) : '-';
            const oldValue = _tmParseJson(row.OldValue) || {};
            const newValue = _tmParseJson(row.NewValue) || {};
            const transferMeta = row.Action === 'ASSIGNMENT_TRANSFER'
                ? `<div class="mt-2 rounded-lg bg-sky-50 border border-sky-100 px-3 py-2 text-xs text-sky-800">
                    <span class="font-bold">เดิม / Old:</span> ${escHtml(oldValue.curriculumCode || '')} / ${escHtml(oldValue.courseCode || '-')}
                    <span class="mx-2 text-sky-300">&rarr;</span>
                    <span class="font-bold">ใหม่ / New:</span> ${escHtml(newValue.curriculumCode || '')} / ${escHtml(newValue.courseCode || '-')}
                </div>` : '';
            return `
            <div class="p-4">
                <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            ${_tmLogActionBadge(row.Action)}
                            <span class="text-xs text-slate-400">${escHtml(row.Department || '-')} · ${escHtml(String(row.Year || _tmFilter.year))}</span>
                        </div>
                        <p class="mt-2 text-sm font-bold text-slate-800">${escHtml(_tmLogSummary(row))}</p>
                        <p class="mt-1 text-xs text-slate-500">
                            หลักสูตร / Curriculum: ${escHtml(row.CurriculumCode || '-')} · รายวิชา / Course: ${escHtml(row.CourseCode || '-')}
                        </p>
                        ${transferMeta}
                    </div>
                    <div class="text-right shrink-0">
                        <p class="text-xs font-bold text-slate-600">${escHtml(row.PerformedBy || '-')}</p>
                        <p class="text-[11px] text-slate-400 mt-1">${escHtml(when)}</p>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        if (list) list.innerHTML = `<div class="p-6 text-center text-sm text-rose-600">${escHtml(err.message || 'โหลดประวัติพนักงานไม่สำเร็จ / Cannot load employee history')}</div>`;
    }
}

function _tmParseJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return null; }
}

function _tmLogActionBadge(action) {
    const a = action || '-';
    const cls = a.includes('TRANSFER') ? 'bg-sky-50 text-sky-700 border-sky-200'
        : a.includes('REMOVE') || a.includes('DISABLE') ? 'bg-rose-50 text-rose-700 border-rose-200'
        : a.includes('CREATE') || a.includes('REASSIGN') ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-slate-50 text-slate-600 border-slate-200';
    return `<span class="inline-flex px-2 py-1 rounded-full border text-[11px] font-bold ${cls}">${escHtml(a)}</span>`;
}

function _tmLogSummary(row) {
    const oldValue = _tmParseJson(row.OldValue) || {};
    const newValue = _tmParseJson(row.NewValue) || {};
    if ((row.Action || '').includes('TRANSFER')) {
        return `From ${oldValue.courseCode || row.CourseCode || '-'} to ${newValue.courseCode || '-'}`;
    }
    if ((row.Action || '').includes('ASSIGNMENT')) {
        return `${row.EmployeeID || '-'} · ${newValue.EmployeeName || oldValue.EmployeeName || ''}`;
    }
    if ((row.Action || '').includes('COURSE')) {
        return `${row.CourseCode || newValue.CourseCode || oldValue.CourseCode || '-'} · ${row.CourseTitle || newValue.CourseTitle || oldValue.CourseTitle || ''}`;
    }
    if ((row.Action || '').includes('CURRICULUM')) {
        return `${row.CurriculumCode || newValue.CurriculumCode || oldValue.CurriculumCode || '-'} · ${row.CurriculumTitle || newValue.CurriculumTitle || oldValue.CurriculumTitle || ''}`;
    }
    return row.EmployeeID || row.CourseCode || row.CurriculumCode || '-';
}

async function showTrainingAuditLogModal(scope = 'current') {
    const actionOptions = [
        ['all', 'ทุก Action / All Actions'],
        ['CURRICULUM_CREATE', 'สร้างหลักสูตร / Curriculum Create'],
        ['CURRICULUM_UPDATE', 'แก้ไขหลักสูตร / Curriculum Update'],
        ['CURRICULUM_DISABLE', 'ปิดหลักสูตร / Curriculum Disable'],
        ['COURSE_MASTER_CREATE', 'สร้างคลังรายวิชา / Course Master Create'],
        ['COURSE_MASTER_UPDATE', 'แก้ไขคลังรายวิชา / Course Master Update'],
        ['COURSE_MASTER_DISABLE', 'ปิดคลังรายวิชา / Course Master Disable'],
        ['COURSE_MASTER_DELETE', 'ลบคลังรายวิชา / Course Master Delete'],
        ['COURSE_CREATE', 'สร้างรายวิชา / Course Create'],
        ['COURSE_UPDATE', 'แก้ไขรายวิชา / Course Update'],
        ['COURSE_DISABLE', 'ปิดรายวิชา / Course Disable'],
        ['ASSIGNMENT_CREATE', 'เพิ่มพนักงาน / Assignment Create'],
        ['ASSIGNMENT_REASSIGN', 'เพิ่มซ้ำกลับเข้า Scope / Assignment Reassign'],
        ['ASSIGNMENT_UPDATE', 'แก้ไข Assignment / Assignment Update'],
        ['ASSIGNMENT_REMOVE', 'ลบพนักงานออก / Assignment Remove'],
        ['ASSIGNMENT_TRANSFER', 'ย้ายพนักงาน / Assignment Transfer'],
        ['CURRICULUM_ASSIGNMENT_CREATE', 'เพิ่มพนักงานเข้าหลักสูตร / Curriculum Assignment Create'],
        ['CURRICULUM_ASSIGNMENT_REASSIGN', 'เพิ่มพนักงานกลับเข้าหลักสูตร / Curriculum Assignment Reassign'],
        ['CURRICULUM_ASSIGNMENT_REMOVE', 'นำพนักงานออกจากหลักสูตร / Curriculum Assignment Remove'],
        ['CURRICULUM_ASSIGNMENT_TRANSFER', 'ย้ายพนักงานข้ามหลักสูตร / Curriculum Assignment Transfer'],
    ];
    const html = `
        <div class="space-y-4">
            <div class="flex flex-wrap gap-2 items-center">
                <select id="tm-log-scope" class="form-input py-2 text-sm">
                    <option value="current" ${scope === 'current' ? 'selected' : ''}>รายการที่เลือก / Current Selection</option>
                    <option value="year" ${scope === 'year' ? 'selected' : ''}>ทั้งปี / แผนก / Whole Year / Department</option>
                </select>
                <select id="tm-log-action" class="form-input py-2 text-sm">
                    ${actionOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
                </select>
                <button type="button" id="tm-log-refresh" class="px-3 py-2 rounded-lg text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50">รีเฟรช / Refresh</button>
            </div>
            <div id="tm-log-list" class="max-h-[520px] overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                <div class="p-6 text-center text-sm text-slate-400">กำลังโหลด... / Loading...</div>
            </div>
        </div>`;
    openModal('ประวัติ Training Matrix / Training Matrix Audit Log', html, 'max-w-4xl');

    const loadLogs = async () => {
        const list = document.getElementById('tm-log-list');
        if (!list) return;
        list.innerHTML = `<div class="p-6 text-center text-sm text-slate-400">กำลังโหลด... / Loading...</div>`;
        try {
            const p = new URLSearchParams();
            p.set('year', _tmFilter.year);
            p.set('limit', '120');
            const selectedScope = document.getElementById('tm-log-scope')?.value || 'current';
            const action = document.getElementById('tm-log-action')?.value || 'all';
            if (action !== 'all') p.set('action', action);
            if (_isAdmin && _tmFilter.dept !== 'all') p.set('dept', _tmFilter.dept);
            if (selectedScope === 'current') {
                if (_tmSelectedCourseId) p.set('courseId', _tmSelectedCourseId);
                else if (_tmSelectedCurriculumId) p.set('curriculumId', _tmSelectedCurriculumId);
            }
            const res = await API.get(`/fourm/training-logs?${p}`);
            const rows = normalizeApiArray(res?.data ?? res);
            if (!rows.length) {
                list.innerHTML = `<div class="p-6 text-center text-sm text-slate-400">ยังไม่มีประวัติใน Scope นี้ / No audit log in this scope</div>`;
                return;
            }
            list.innerHTML = rows.map(row => {
                const when = row.PerformedAt ? new Date(row.PerformedAt).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' }) : '-';
                const oldValue = _tmParseJson(row.OldValue) || {};
                const newValue = _tmParseJson(row.NewValue) || {};
                const transferMeta = row.Action === 'ASSIGNMENT_TRANSFER'
                    ? `<div class="mt-2 rounded-lg bg-sky-50 border border-sky-100 px-3 py-2 text-xs text-sky-800">
                        <span class="font-bold">เดิม / Old:</span> ${escHtml(oldValue.curriculumCode || '')} / ${escHtml(oldValue.courseCode || '-')}
                        <span class="mx-2 text-sky-300">→</span>
                        <span class="font-bold">ใหม่ / New:</span> ${escHtml(newValue.curriculumCode || '')} / ${escHtml(newValue.courseCode || '-')}
                    </div>` : '';
                return `
                <div class="p-4">
                    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                                ${_tmLogActionBadge(row.Action)}
                                <span class="text-xs text-slate-400">${escHtml(row.Department || '-')} · ${escHtml(String(row.Year || _tmFilter.year))}</span>
                            </div>
                            <p class="mt-2 text-sm font-bold text-slate-800">${escHtml(_tmLogSummary(row))}</p>
                            <p class="mt-1 text-xs text-slate-500">
                                หลักสูตร / Curriculum: ${escHtml(row.CurriculumCode || '-')} · รายวิชา / Course: ${escHtml(row.CourseCode || '-')} · พนักงาน / Employee: ${escHtml(row.EmployeeID || '-')}
                            </p>
                            ${transferMeta}
                        </div>
                        <div class="text-right shrink-0">
                            <p class="text-xs font-bold text-slate-600">${escHtml(row.PerformedBy || '-')}</p>
                            <p class="text-[11px] text-slate-400 mt-1">${escHtml(when)}</p>
                        </div>
                    </div>
                </div>`;
            }).join('');
        } catch (err) {
            list.innerHTML = `<div class="p-6 text-center text-sm text-rose-600">${escHtml(err.message || 'โหลดประวัติไม่สำเร็จ / Cannot load audit log')}</div>`;
        }
    };
    document.getElementById('tm-log-refresh')?.addEventListener('click', loadLogs);
    document.getElementById('tm-log-scope')?.addEventListener('change', loadLogs);
    document.getElementById('tm-log-action')?.addEventListener('change', loadLogs);
    await loadLogs();
}
async function _loadFourmForms(adminAll = false) {
    try {
        const res = await API.get(`/module-forms?module=fourm${adminAll ? '&all=1' : ''}`);
        _fourmForms = normalizeApiArray(res?.data ?? res) || [];
    } catch { _fourmForms = []; }
}

function _renderFourmFormsDash() {
    const el = document.getElementById('fourm-forms-dash');
    if (!el) return;

    if (_isAdmin) {
        if (!_fourmForms.length) {
            el.innerHTML = `
            <div class="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center">
                <div class="mx-auto w-9 h-9 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center mb-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.5L13.5 4H7a2 2 0 00-2 2v13a2 2 0 002 2z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 4v6h6"/>
                    </svg>
                </div>
                <p class="text-xs font-bold text-slate-700">ยังไม่มีแบบฟอร์ม 4M</p>
                <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">อัปโหลดเอกสารมาตรฐาน เช่น แบบฟอร์ม Change Notice หรือ checklist เพื่อให้ผู้ใช้เข้าถึงจาก Dashboard ได้ทันที</p>
            </div>`;
            return;
        }
        el.innerHTML = `
        <div class="divide-y divide-slate-100">
            ${_fourmForms.map(f => {
                const ext = (f.FileUrl||'').split('?')[0].split('.').pop().toUpperCase();
                return `
                <div class="flex items-center gap-2.5 py-2.5 hover:bg-slate-50 rounded-lg group ${!f.IsActive ? 'opacity-50' : ''}">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                         style="background:#eef2ff;color:#4338ca">${escHtml(ext||'FILE')}</div>
                    <div class="flex-1 min-w-0">
                        <a href="${f.FileUrl}" target="_blank" rel="noopener noreferrer"
                           class="text-xs font-semibold text-slate-800 hover:text-indigo-600 leading-snug block truncate">${escHtml(f.Title)}</a>
                        ${f.Version ? `<span class="text-[10px] text-slate-400">${escHtml(f.Version)}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button class="btn-fourm-form-toggle text-[10px] font-semibold px-2 py-0.5 rounded-md hover:bg-slate-100 text-slate-500"
                                data-id="${f.id}" data-active="${f.IsActive}" data-title="${escHtml(f.Title)}"
                                data-version="${escHtml(f.Version||'')}" data-sort-order="${f.SortOrder}"
                                data-description="${escHtml(f.Description||'')}">
                            ${f.IsActive ? 'ซ่อน' : 'แสดง'}
                        </button>
                        <button class="btn-fourm-form-delete p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                data-id="${f.id}" data-title="${escHtml(f.Title)}" title="ลบ">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    } else {
        const active = _fourmForms.filter(f => f.IsActive);
        if (!active.length) {
            el.innerHTML = `
            <div class="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center">
                <div class="mx-auto w-9 h-9 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center mb-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6M7 21h10a2 2 0 002-2V9.5L13.5 4H7a2 2 0 00-2 2v13a2 2 0 002 2z"/>
                    </svg>
                </div>
                <p class="text-xs font-bold text-slate-700">ยังไม่มีแบบฟอร์มที่เปิดใช้งาน</p>
                <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">เมื่อผู้ดูแลระบบเปิดใช้งานเอกสาร แบบฟอร์มจะแสดงในส่วนนี้</p>
            </div>`;
            return;
        }
        el.innerHTML = `
        <div class="divide-y divide-slate-100">
            ${active.map(f => {
                const ext = (f.FileUrl||'').split('?')[0].split('.').pop().toUpperCase();
                return `
                <div class="flex items-center gap-2.5 py-2.5 hover:bg-slate-50 rounded-lg">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                         style="background:#eef2ff;color:#4338ca">${escHtml(ext||'FILE')}</div>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-slate-800 leading-snug truncate">${escHtml(f.Title)}</p>
                        ${f.Version ? `<span class="text-[10px] text-slate-400">${escHtml(f.Version)}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-1 flex-shrink-0">
                        <a href="${f.FileUrl}" target="_blank" rel="noopener noreferrer"
                           class="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="ดูไฟล์">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        </a>
                        <a href="${f.FileUrl}" download
                           class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="ดาวน์โหลด">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
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
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

    document.getElementById('fourm-form-upload-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
        e.preventDefault();
        const btn = document.getElementById('fourm-form-upload-btn');
        btn.disabled = true; btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>กำลังอัปโหลด...`;
        try {
            showLoading('กำลังอัปโหลด...');
            await API.post('/module-forms', new FormData(e.target));
            closeModal();
            showToast('อัปโหลดแบบฟอร์มสำเร็จ', 'success');
            await _loadFourmForms(true); _renderFourmFormsDash();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; btn.textContent = 'อัปโหลด'; }
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: Executive Dashboard PDF
// ─────────────────────────────────────────────────────────────────────────────
window._fourmExportDashPDF = async function() {
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        showToast('ไม่พบ library สำหรับ PDF', 'error'); return;
    }
    showToast('กำลังสร้าง PDF...', 'info');

    try {
        const [statsRes, noticesRes, manRes] = await Promise.all([
            API.get(`/fourm/stats?year=${_statsYear}`),
            API.get(`/fourm/notices?year=${_statsYear}`),
            API.get(`/fourm/man-records?year=${_statsYear}`),
        ]);
        const data = statsRes?.data || {};
        const kpi = data.noticeKpi || {};
        const trainingSummary = data.trainingSummary || {};
        const notices = normalizeApiArray(noticesRes?.data ?? noticesRes) || [];
        const manRecs = normalizeApiArray(manRes?.data ?? manRes) || [];
        const insights = data.adminInsights || {};
        const overdue = parseInt(data.overdueCount, 10) || 0;
        const total = parseInt(kpi.total, 10) || 0;
        const open = parseInt(kpi.open, 10) || 0;
        const pending = parseInt(kpi.pending, 10) || 0;
        const closed = parseInt(kpi.closed, 10) || 0;
        const closureRate = total > 0 ? Math.round((closed / total) * 100) : 0;
        const trainingCurriculums = parseInt(trainingSummary.curriculums, 10) || 0;
        const trainingCourses = parseInt(trainingSummary.courses, 10) || 0;
        const trainingEmployees = parseInt(trainingSummary.employees, 10) || 0;
        const trainingTransferred = parseInt(trainingSummary.transferred, 10) || 0;
        const deptRank = normalizeApiArray(insights.deptRank || []);
        const pendingAging = normalizeApiArray(insights.pendingAging || []);
        const monthlyClosure = normalizeApiArray(insights.monthlyClosure || []);
        const topType = normalizeApiArray(data.byType || [])[0];
        const watchDept = deptRank.find(row => (parseInt(row.overdue, 10) || 0) > 0)
            || deptRank.find(row => (parseInt(row.pending, 10) || 0) > 0)
            || deptRank[0];
        const longestPending = pendingAging[0];
        const latestClosure = monthlyClosure[monthlyClosure.length - 1];
        const prevClosure = monthlyClosure[monthlyClosure.length - 2];
        const latestRate = parseInt(latestClosure?.closureRate, 10) || 0;
        const prevRate = parseInt(prevClosure?.closureRate, 10) || 0;
        const monthDelta = latestClosure && prevClosure ? latestRate - prevRate : null;
        const latestMonthLabel = latestClosure ? MONTHS_TH[(parseInt(latestClosure.month, 10) || 1) - 1] : '-';
        const thaiYear = _statsYear + 543;
        const generated = new Date().toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' });
        const fmtShort = d => d ? new Date(d).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' }) : '-';

        const sectionTitle = title => `
            <div style="font-size:11px;font-weight:900;color:#065f46;text-transform:uppercase;letter-spacing:.04em;margin:0 0 9px;padding-bottom:6px;border-bottom:2px solid #d1fae5">${title}</div>`;
        const metric = (label, value, color = '#065f46', sub = '') => `
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;min-height:86px;display:flex;flex-direction:column;justify-content:center">
                <div style="font-size:25px;font-weight:900;color:${color};line-height:1">${escHtml(String(value))}</div>
                <div style="font-size:10px;font-weight:800;color:#475569;margin-top:7px;line-height:1.25">${escHtml(label)}</div>
                ${sub ? `<div style="font-size:8.5px;color:#94a3b8;margin-top:3px">${escHtml(sub)}</div>` : ''}
            </div>`;
        const insight = (label, value, sub = '', color = '#334155') => `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:11px 12px;min-height:76px">
                <div style="font-size:8.8px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em">${escHtml(label)}</div>
                <div style="font-size:13px;font-weight:900;color:${color};margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(value || '-')}</div>
                ${sub ? `<div style="font-size:9.2px;color:#64748b;margin-top:5px;line-height:1.25">${escHtml(sub)}</div>` : ''}
            </div>`;
        const emptyBox = text => `
            <div style="border:1px dashed #cbd5e1;background:#f8fafc;border-radius:10px;padding:22px;text-align:center;color:#94a3b8;font-size:12px;font-weight:800">${escHtml(text)}</div>`;
        const header = title => `
            <div style="background:#065f46;color:#fff;padding:18px 30px 16px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-shrink:0">
                <div>
                    <div style="font-size:9.5px;font-weight:900;color:#a7f3d0;text-transform:uppercase;letter-spacing:.08em">Official 4M Change Management Report</div>
                    <h1 style="font-size:19px;font-weight:900;line-height:1.18;margin:5px 0 0">${title}</h1>
                </div>
                <div style="text-align:right;font-size:9.2px;color:#d1fae5;line-height:1.45;white-space:nowrap">
                    <div>Thai Summit Harness Co., Ltd.</div>
                    <div>FY ${_statsYear}</div>
                    <div>Generated ${generated}</div>
                    <div>Internal Use Only</div>
                </div>
            </div>`;
        const footer = (pageNo, pageTotal) => `
            <div style="margin-top:auto;padding:8px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;color:#64748b;font-size:9px;flex-shrink:0">
                <span>4M Change Management Report - Thai Summit Harness Co., Ltd.</span>
                <span>Page ${pageNo} / ${pageTotal}</span>
            </div>`;
        const page = (title, body, pageNo, pageTotal) => `
            <div class="fourm-dash-pdf-page" style="width:794px;height:1122px;background:#fff;font-family:Kanit,Arial,sans-serif;color:#1e293b;display:flex;flex-direction:column;overflow:hidden">
                ${header(title)}
                <div class="fourm-dash-pdf-body" style="flex:1;padding:18px 30px 12px;overflow:hidden;min-height:0">
                    <div class="fourm-dash-pdf-inner" style="transform-origin:top left;display:flex;flex-direction:column;gap:13px">${body}</div>
                </div>
                ${footer(pageNo, pageTotal)}
            </div>`;
        const svgBar = (monthly, w = 420, h = 112) => {
            const counts = Array(12).fill(0);
            (monthly || []).forEach(r => { counts[(parseInt(r.month, 10) || 1) - 1] = parseInt(r.count, 10) || 0; });
            const max = Math.max(...counts, 1);
            const bw = Math.floor(w / 12) - 5;
            const bars = counts.map((v, i) => {
                const bh = Math.max(2, Math.round((v / max) * (h - 30)));
                const x = i * (w / 12) + 3;
                const y = h - 19 - bh;
                return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="#059669${v ? 'aa' : '22'}"/>
                    <text x="${x + bw / 2}" y="${h - 5}" text-anchor="middle" font-size="8" fill="#94a3b8">${MONTHS_TH[i]}</text>`;
            }).join('');
            return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
        };
        const typeRows = normalizeApiArray(data.byType || []);
        const typeMini = typeRows.length ? typeRows.slice(0, 4).map(t => {
            const tm = TYPE_META[t.label] || { bg:'#f8fafc', text:'#64748b' };
            return `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:10px">
                <span style="font-weight:800;color:${tm.text}">${escHtml(t.label || '-')}</span><span style="font-weight:900;color:#334155">${parseInt(t.count, 10) || 0}</span>
            </div>`;
        }).join('') : emptyBox('No change type data');
        const topNotices = notices.filter(n => n.Status !== 'Closed')
            .sort((a, b) => new Date(a.RequestDate) - new Date(b.RequestDate))
            .slice(0, 5);
        const noticeRows = topNotices.length ? `
            <table style="width:100%;border-collapse:collapse;font-size:10px">
                <thead><tr style="background:#065f46;color:#fff">
                    <th style="padding:6px;text-align:left">Notice</th><th style="padding:6px;text-align:left">Title</th><th style="padding:6px;text-align:center">Type</th><th style="padding:6px;text-align:center">Age</th><th style="padding:6px;text-align:left">Dept</th>
                </tr></thead>
                <tbody>${topNotices.map(n => {
                    const age = n.RequestDate ? Math.max(0, Math.floor((Date.now() - new Date(n.RequestDate)) / 86400000)) : 0;
                    const tm = TYPE_META[n.ChangeType] || { bg:'#f8fafc', text:'#64748b' };
                    return `<tr style="border-bottom:1px solid #e2e8f0">
                        <td style="padding:6px;font-family:monospace;font-weight:900;color:#065f46">${escHtml(n.NoticeNo || '-')}</td>
                        <td style="padding:6px;color:#334155">${escHtml((n.Title || '-').slice(0, 48))}</td>
                        <td style="padding:6px;text-align:center"><span style="display:inline-block;border-radius:999px;padding:1px 6px;background:${tm.bg};color:${tm.text};font-size:8px;font-weight:900">${escHtml(n.ChangeType || '-')}</span></td>
                        <td style="padding:6px;text-align:center;font-weight:900;color:${age > OVERDUE_DAYS ? '#dc2626' : '#475569'}">${age}d</td>
                        <td style="padding:6px;color:#64748b">${escHtml(n.Department || '-')}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>` : emptyBox('ไม่มีรายการที่ค้างดำเนินการ');
        const followUpNotes = `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:9.2px;line-height:1.35;color:#334155">
                <div><b style="color:#dc2626">Overdue</b><br>เร่งติดตาม Change Notice ที่เกิน ${OVERDUE_DAYS} วันและระบุ owner ให้ชัดเจน</div>
                <div><b style="color:#d97706">Training</b><br>เชื่อมรายการ Training Required เข้ากับ Training Matrix เพื่อปิด loop 4M</div>
                <div><b style="color:#059669">Control</b><br>เก็บ evidence และ review history ให้ครบก่อนปิดรายการ</div>
            </div>`;
        const manTotal = manRecs.reduce((s, r) => s + (parseInt(r.TotalAttendance, 10) || 0), 0);
        const manPass = manRecs.reduce((s, r) => s + (parseInt(r.Pass, 10) || 0), 0);
        const manPassRate = manTotal > 0 ? Math.round((manPass / manTotal) * 100) : 0;
        const deptRows = deptRank.length ? deptRank.slice(0, 5).map(row => `
            <div style="display:grid;grid-template-columns:minmax(0,1fr) 42px 42px 42px;gap:8px;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:9.5px">
                <b style="color:#334155;word-break:break-word">${escHtml(row.Department || '-')}</b>
                <span style="text-align:right;color:#0284c7;font-weight:900">${parseInt(row.total, 10) || 0}</span>
                <span style="text-align:right;color:#d97706;font-weight:900">${parseInt(row.pending, 10) || 0}</span>
                <span style="text-align:right;color:#dc2626;font-weight:900">${parseInt(row.overdue, 10) || 0}</span>
            </div>`).join('') : emptyBox('No department risk data');

        const pageBodies = [];
        pageBodies.push({
            title: `รายงาน 4M Change Management ปี ${thaiYear}`,
            body: `
                ${sectionTitle('1. Executive Summary / ภาพรวม 4M')}
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
                    ${metric('Total Change Notice', total, '#065f46')}
                    ${metric('Open', open, '#0284c7')}
                    ${metric('Pending', pending, pending ? '#d97706' : '#64748b')}
                    ${metric('Closed / Closure', closed, '#059669', `${closureRate}% closure rate`)}
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
                    ${insight('Top Change Type', topType?.label || '-', `${parseInt(topType?.count, 10) || 0} notices`, '#065f46')}
                    ${insight('Watch Department', watchDept?.Department || '-', `${parseInt(watchDept?.pending, 10) || 0} pending / ${parseInt(watchDept?.overdue, 10) || 0} overdue`, '#d97706')}
                    ${insight('Longest Pending', longestPending ? `${longestPending.NoticeNo || '-'} / ${parseInt(longestPending.ageDays, 10) || 0}d` : '-', longestPending?.Department || '', '#dc2626')}
                    ${insight('Monthly Momentum', `${latestMonthLabel} / ${latestRate}%`, monthDelta == null ? 'no previous month' : `${monthDelta >= 0 ? '+' : ''}${monthDelta}% vs previous`, monthDelta == null ? '#64748b' : monthDelta >= 0 ? '#059669' : '#dc2626')}
                </div>
                <div style="display:grid;grid-template-columns:1.25fr .75fr;gap:12px">
                    <div>${sectionTitle(`2. Priority Open Items (${topNotices.length})`)}${noticeRows}</div>
                    <div>${sectionTitle('3. Follow-up Notes')}${followUpNotes}</div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
                    ${metric('Training Curriculums', trainingCurriculums, '#7e22ce')}
                    ${metric('Linked Courses', trainingCourses, '#0284c7')}
                    ${metric('Employees in Scope', trainingEmployees, '#059669')}
                    ${metric('Transferred Rows', trainingTransferred, '#d97706')}
                </div>`
        });
        pageBodies.push({
            title: `Operational Snapshot ปี ${thaiYear}`,
            body: `
                <div style="display:grid;grid-template-columns:1.25fr .75fr;gap:14px">
                    <div>${sectionTitle('1. Monthly Trend / แนวโน้มรายเดือน')}<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px">${svgBar(data.monthly || [])}</div></div>
                    <div>${sectionTitle('2. Change Type')}<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;min-height:138px">${typeMini}</div></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                    <div>${sectionTitle('3. Department Focus')}<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px">${deptRows}</div></div>
                    <div>${sectionTitle('4. Man Record & Training Matrix')}
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:9px">
                            ${metric('Departments Recorded', manRecs.length, '#065f46')}
                            ${metric('Total Attendance', manTotal, '#0284c7')}
                            ${metric('Pass Rate', `${manPassRate}%`, manPassRate >= 80 ? '#059669' : manPassRate >= 60 ? '#d97706' : '#dc2626')}
                            ${metric('Overdue Notice', overdue, overdue ? '#dc2626' : '#059669')}
                        </div>
                    </div>
                </div>
                <div>${sectionTitle('5. Current Record Status')}
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
                        ${insight('Change Notice Register', `${notices.length} records`, notices.length ? 'detail pages included' : 'no register records in this year', '#065f46')}
                        ${insight('Man Record Register', `${manRecs.length} departments`, manRecs.length ? `${manTotal} attendance` : 'no exam summary in this year', '#0284c7')}
                        ${insight('Report Health', total || manRecs.length || trainingCurriculums ? 'Active Scope' : 'No Activity Yet', total || manRecs.length || trainingCurriculums ? 'monitor active scope' : 'start from Change Notice / Training Matrix', total || manRecs.length || trainingCurriculums ? '#059669' : '#64748b')}
                    </div>
                </div>`
        });
        const sparseReport = !notices.length && !manRecs.length;
        if (sparseReport) {
            pageBodies.splice(0, pageBodies.length, {
                title: `รายงาน 4M Change Management ปี ${thaiYear}`,
                body: `
                    ${sectionTitle('1. Executive Summary / ภาพรวม 4M')}
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
                        ${metric('Total Change Notice', total, '#065f46')}
                        ${metric('Open', open, '#0284c7')}
                        ${metric('Pending', pending, pending ? '#d97706' : '#64748b')}
                        ${metric('Closed / Closure', closed, '#059669', `${closureRate}% closure rate`)}
                    </div>
                    <div style="display:grid;grid-template-columns:1.18fr .82fr;gap:14px">
                        <div>
                            ${sectionTitle('2. Current Operational Picture')}
                            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#f8fafc">
                                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
                                    ${insight('Top Change Type', topType?.label || '-', `${parseInt(topType?.count, 10) || 0} notices`, '#065f46')}
                                    ${insight('Watch Department', watchDept?.Department || '-', `${parseInt(watchDept?.pending, 10) || 0} pending / ${parseInt(watchDept?.overdue, 10) || 0} overdue`, '#d97706')}
                                    ${insight('Longest Pending', longestPending ? `${longestPending.NoticeNo || '-'} / ${parseInt(longestPending.ageDays, 10) || 0}d` : '-', longestPending?.Department || '', '#dc2626')}
                                    ${insight('Monthly Momentum', `${latestMonthLabel} / ${latestRate}%`, monthDelta == null ? 'no previous month' : `${monthDelta >= 0 ? '+' : ''}${monthDelta}% vs previous`, monthDelta == null ? '#64748b' : monthDelta >= 0 ? '#059669' : '#dc2626')}
                                </div>
                            </div>
                        </div>
                        <div>
                            ${sectionTitle('3. Report Health')}
                            <div style="border:1px solid #d1fae5;border-radius:10px;padding:14px;background:#f0fdf4;min-height:178px">
                                <div style="font-size:23px;font-weight:900;color:${trainingCurriculums ? '#059669' : '#64748b'}">${trainingCurriculums ? 'Training Scope Active' : 'No Activity Yet'}</div>
                                <div style="font-size:10.5px;color:#475569;line-height:1.45;margin-top:8px">
                                    ปีนี้ยังไม่มี Change Notice และ Man Record ในทะเบียนรายงาน แต่มีข้อมูล Training Matrix scope อยู่ ${trainingCurriculums} หลักสูตร
                                </div>
                                <div style="height:7px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-top:14px">
                                    <div style="height:100%;width:${trainingCurriculums ? 45 : 8}%;background:${trainingCurriculums ? '#059669' : '#94a3b8'}"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
                        ${metric('Training Curriculums', trainingCurriculums, '#7e22ce')}
                        ${metric('Linked Courses', trainingCourses, '#0284c7')}
                        ${metric('Employees in Scope', trainingEmployees, '#059669')}
                        ${metric('Transferred Rows', trainingTransferred, '#d97706')}
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                        <div>
                            ${sectionTitle('4. Monthly Trend')}
                            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px">${svgBar(data.monthly || [], 335, 104)}</div>
                        </div>
                        <div>
                            ${sectionTitle('5. Next Follow-up')}
                            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#fff">
                                ${followUpNotes}
                            </div>
                        </div>
                    </div>`
            });
        }
        if (notices.length) {
            const list = [...notices].sort((a, b) => new Date(b.RequestDate) - new Date(a.RequestDate)).slice(0, 20);
            pageBodies.push({
                title: `Change Notice Register ปี ${thaiYear}`,
                body: `
                    ${sectionTitle(`Change Notice Detail (${list.length}/${notices.length})`)}
                    <table style="width:100%;border-collapse:collapse;font-size:9.6px">
                        <thead><tr style="background:#065f46;color:#fff">
                            <th style="padding:6px;text-align:left">Notice No</th><th style="padding:6px;text-align:left">Date</th><th style="padding:6px;text-align:left">Title</th><th style="padding:6px;text-align:center">Type</th><th style="padding:6px;text-align:left">Department</th><th style="padding:6px;text-align:center">Status</th>
                        </tr></thead>
                        <tbody>${list.map(n => {
                            const tm = TYPE_META[n.ChangeType] || { bg:'#f8fafc', text:'#64748b' };
                            const sm = STATUS_META[n.Status] || { bg:'#f1f5f9', text:'#64748b', label:n.Status || '-' };
                            return `<tr style="border-bottom:1px solid #e2e8f0">
                                <td style="padding:5px;font-family:monospace;font-weight:900;color:#065f46">${escHtml(n.NoticeNo || '-')}</td>
                                <td style="padding:5px;color:#64748b">${fmtShort(n.RequestDate)}</td>
                                <td style="padding:5px;color:#334155">${escHtml((n.Title || '-').slice(0, 42))}</td>
                                <td style="padding:5px;text-align:center"><span style="border-radius:999px;padding:1px 6px;background:${tm.bg};color:${tm.text};font-size:8px;font-weight:900">${escHtml(n.ChangeType || '-')}</span></td>
                                <td style="padding:5px;color:#64748b">${escHtml((n.Department || '-').slice(0, 22))}</td>
                                <td style="padding:5px;text-align:center"><span style="border-radius:999px;padding:1px 6px;background:${sm.bg};color:${sm.text};font-size:8px;font-weight:900">${escHtml(sm.label || n.Status || '-')}</span></td>
                            </tr>`;
                        }).join('')}</tbody>
                    </table>`
            });
        }
        if (manRecs.length) {
            pageBodies.push({
                title: `Man Record Summary ปี ${thaiYear}`,
                body: `
                    ${sectionTitle(`Department Exam Summary (${manRecs.length})`)}
                    <table style="width:100%;border-collapse:collapse;font-size:10px">
                        <thead><tr style="background:#065f46;color:#fff">
                            <th style="padding:6px;text-align:left">Department</th><th style="padding:6px;text-align:center">Attendance</th><th style="padding:6px;text-align:center">Pass</th><th style="padding:6px;text-align:center">Fail</th><th style="padding:6px;text-align:left">Pass Rate</th><th style="padding:6px;text-align:center">Status</th><th style="padding:6px;text-align:left">Exam Date</th>
                        </tr></thead>
                        <tbody>${manRecs.slice(0, 22).map(r => {
                            const totalAttendance = parseInt(r.TotalAttendance, 10) || 0;
                            const pass = parseInt(r.Pass, 10) || 0;
                            const fail = parseInt(r.Fail, 10) || 0;
                            const rate = totalAttendance > 0 ? Math.round((pass / totalAttendance) * 100) : 0;
                            const color = rate >= 80 ? '#059669' : rate >= 60 ? '#d97706' : '#dc2626';
                            return `<tr style="border-bottom:1px solid #e2e8f0">
                                <td style="padding:6px;font-weight:800;color:#334155">${escHtml(r.Department || '-')}</td>
                                <td style="padding:6px;text-align:center">${totalAttendance}</td>
                                <td style="padding:6px;text-align:center;color:#059669;font-weight:900">${pass}</td>
                                <td style="padding:6px;text-align:center;color:#dc2626;font-weight:900">${fail}</td>
                                <td style="padding:6px"><div style="height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden"><div style="height:100%;width:${rate}%;background:${color}"></div></div><span style="font-size:9px;color:${color};font-weight:900">${rate}%</span></td>
                                <td style="padding:6px;text-align:center">${escHtml(r.Status || '-')}</td>
                                <td style="padding:6px;color:#64748b">${fmtShort(r.ExamDate)}</td>
                            </tr>`;
                        }).join('')}</tbody>
                    </table>`
            });
        }

        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
        const totalPages = pageBodies.length;
        for (let i = 0; i < pageBodies.length; i++) {
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;left:-9999px;top:0;font-family:Kanit,Arial,sans-serif';
            div.innerHTML = page(pageBodies[i].title, pageBodies[i].body, i + 1, totalPages);
            document.body.appendChild(div);
            try {
                const body = div.querySelector('.fourm-dash-pdf-body');
                const inner = div.querySelector('.fourm-dash-pdf-inner');
                if (body && inner) {
                    const scale = Math.min(1.18, Math.max(0.82, body.clientHeight / Math.max(1, inner.scrollHeight)));
                    inner.style.transform = `scale(${scale})`;
                    inner.style.width = `${100 / scale}%`;
                }
                const canvas = await html2canvas(div.firstElementChild, { scale:1.5, useCORS:true, backgroundColor:'#fff', logging:false });
                if (i > 0) pdf.addPage();
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
            } finally {
                document.body.removeChild(div);
            }
        }

        pdf.save(`4M_Change_Management_${_statsYear}.pdf`);
        showToast(`ดาวน์โหลด PDF สำเร็จ (${totalPages} หน้า)`, 'success');
    } catch (err) { showError(err); }
};

window._fourmExportDashPDFLegacy = async function() {
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        showToast('ไม่พบ library สำหรับ PDF', 'error'); return;
    }
    showToast('กำลังสร้าง PDF...', 'info');

    try {
        const [statsRes, noticesRes, manRes] = await Promise.all([
            API.get(`/fourm/stats?year=${_statsYear}`),
            API.get(`/fourm/notices?year=${_statsYear}`),
            API.get(`/fourm/man-records?year=${_statsYear}`),
        ]);
        const data    = statsRes?.data || {};
        const kpi     = data.noticeKpi || {};
        const trainingSummary = data.trainingSummary || {};
        const notices = normalizeApiArray(noticesRes?.data ?? noticesRes) || [];
        const manRecs = normalizeApiArray(manRes?.data ?? manRes) || [];

        const overdue = data.overdueCount || 0;
        const total   = parseInt(kpi.total)   || 0;
        const closed  = parseInt(kpi.closed)  || 0;
        const closureRate = total > 0 ? Math.round(closed / total * 100) : 0;
        const trainingCurriculums = parseInt(trainingSummary.curriculums, 10) || 0;
        const trainingCourses = parseInt(trainingSummary.courses, 10) || 0;
        const trainingEmployees = parseInt(trainingSummary.employees, 10) || 0;
        const trainingTransferred = parseInt(trainingSummary.transferred, 10) || 0;
        const insights = data.adminInsights || {};
        const deptRank = normalizeApiArray(insights.deptRank || []);
        const pendingAging = normalizeApiArray(insights.pendingAging || []);
        const monthlyClosure = normalizeApiArray(insights.monthlyClosure || []);
        const lowClosureDept = normalizeApiArray(insights.lowClosureDept || [])[0];
        const typePendingRisk = normalizeApiArray(insights.typePendingRisk || [])[0];
        const topType = normalizeApiArray(data.byType || [])[0];
        const watchDept = deptRank.find(row => (parseInt(row.overdue, 10) || 0) > 0)
            || deptRank.find(row => (parseInt(row.pending, 10) || 0) > 0)
            || deptRank[0];
        const longestPending = pendingAging[0];
        const latestClosure = monthlyClosure[monthlyClosure.length - 1];
        const prevClosure = monthlyClosure[monthlyClosure.length - 2];
        const latestRate = parseInt(latestClosure?.closureRate, 10) || 0;
        const prevRate = parseInt(prevClosure?.closureRate, 10) || 0;
        const monthDelta = latestClosure && prevClosure ? latestRate - prevRate : null;
        const latestMonthLabel = latestClosure ? MONTHS_TH[(parseInt(latestClosure.month, 10) || 1) - 1] : '-';

        const fmtShort = d => d ? new Date(d).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' }) : '—';
        const thaiYear = _statsYear + 543;

        // ── SVG helpers ──────────────────────────────────────────────────────
        function svgBar(monthly, w=540, h=140) {
            const counts = Array(12).fill(0);
            (monthly||[]).forEach(r => { counts[(r.month||1)-1] = r.count||0; });
            const max = Math.max(...counts, 1);
            const bw  = Math.floor(w / 12) - 6;
            const colors = ['#6366f1'];
            const bars = counts.map((v, i) => {
                const bh = Math.round((v / max) * (h - 30));
                const x  = i * (w/12) + 3;
                const y  = h - 20 - bh;
                return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="4" fill="${colors[0]}99"/>
                        <text x="${x+bw/2}" y="${h-6}" text-anchor="middle" font-size="9" fill="#94a3b8">${MONTHS_TH[i]}</text>
                        ${v ? `<text x="${x+bw/2}" y="${y-4}" text-anchor="middle" font-size="9" font-weight="600" fill="#6366f1">${v}</text>` : ''}`;
            }).join('');
            return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
        }

        function svgPie(byType, size=120) {
            if (!byType?.length) return `<svg width="${size}" height="${size}"></svg>`;
            const tot = byType.reduce((s, d) => s + (d.count||0), 0);
            if (!tot) return `<svg width="${size}" height="${size}"></svg>`;
            const cx = size/2, cy = size/2, r = size/2 - 8;
            const PIE_COLORS = ['#6366f1','#f97316','#22c55e','#a855f7','#0ea5e9'];
            let angle = -Math.PI/2;
            const slices = byType.map((d, i) => {
                const sweep = (d.count / tot) * 2 * Math.PI;
                const x1 = cx + r * Math.cos(angle);
                const y1 = cy + r * Math.sin(angle);
                angle += sweep;
                const x2 = cx + r * Math.cos(angle);
                const y2 = cy + r * Math.sin(angle);
                const large = sweep > Math.PI ? 1 : 0;
                return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${PIE_COLORS[i%5]}"/>`;
            });
            return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"/>
                ${slices.join('')}
                <circle cx="${cx}" cy="${cy}" r="${r*0.45}" fill="white"/>
            </svg>`;
        }

        // ── Page builder ──────────────────────────────────────────────────────
        function header(title, sub='') {
            return `<div style="background:#065f46;padding:20px 32px 18px;position:relative;overflow:hidden">
                <div style="display:none"></div>
                <div style="position:relative;z-index:1">
                    <h1 style="color:#fff;font-size:18px;font-weight:800;margin:0 0 2px">${title}</h1>
                    ${sub ? `<p style="color:#d1fae5;font-size:11px;margin:0">${sub}</p>` : ''}
                </div>
            </div>`;
        }
        function footer(pg, total=4) {
            return `<div style="margin-top:auto;padding:9px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
                <span style="color:#64748b;font-size:10px">4M Change Management Report - Thai Summit Harness Co., Ltd.</span>
                <span style="color:#64748b;font-size:10px">Page ${pg} / ${total} - Generated ${new Date().toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})}</span>
            </div>`;
        }
        function kpiBox(label, value, color='#6366f1', sub='') {
            return `<div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #f1f5f9;box-shadow:0 1px 4px rgba(0,0,0,.06)">
                <p style="font-size:26px;font-weight:800;color:${color};margin:0 0 2px">${value}</p>
                <p style="font-size:11px;color:#64748b;margin:0">${label}</p>
                ${sub ? `<p style="font-size:10px;color:${color};font-weight:600;margin:4px 0 0">${sub}</p>` : ''}
            </div>`;
        }
        function insightBox(label, value, sub='', color='#334155') {
            return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px">
                <p style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin:0 0 5px">${label}</p>
                <p style="font-size:14px;font-weight:800;color:${color};margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(value || '-')}</p>
                ${sub ? `<p style="font-size:10px;color:#64748b;margin:4px 0 0">${escHtml(sub)}</p>` : ''}
            </div>`;
        }
        function sectionTitle(t) {
            return `<p style="font-size:11px;font-weight:800;color:#065f46;text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid #d1fae5">${t}</p>`;
        }

        const PAGE = (content) => `<div style="width:794px;height:1122px;background:#fff;font-family:Kanit,sans-serif;color:#1e293b;display:flex;flex-direction:column;overflow:hidden">
            ${content}
            ${footer(_currentPdfPage++)}
        </div>`;
        let _currentPdfPage = 1;

        // ── PAGE 1: KPI Overview ─────────────────────────────────────────────
        const topNotices = notices.filter(n => n.Status !== 'Closed')
            .sort((a,b) => new Date(a.RequestDate) - new Date(b.RequestDate))
            .slice(0, 5);
        const overdueLi = topNotices
            .filter(n => Math.floor((new Date()-new Date(n.RequestDate))/86400000) > OVERDUE_DAYS)
            .map(n => {
                const d = Math.floor((new Date()-new Date(n.RequestDate))/86400000);
                const tm = TYPE_META[n.ChangeType]||{bg:'#f8fafc',text:'#64748b'};
                return `<tr>
                    <td style="padding:6px 8px;font-size:12px;font-family:monospace;color:#6366f1">${escHtml(n.NoticeNo||'')}</td>
                    <td style="padding:6px 8px;font-size:11px;color:#334155">${escHtml(n.Title||'')}</td>
                    <td style="padding:6px 8px;text-align:center"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${tm.bg};color:${tm.text}">${escHtml(n.ChangeType)}</span></td>
                    <td style="padding:6px 8px;text-align:center;font-size:11px;color:#ef4444;font-weight:700">${d} วัน</td>
                    <td style="padding:6px 8px;font-size:11px;color:#64748b">${escHtml(n.Department||'—')}</td>
                </tr>`;
            });

        const page1 = PAGE(`
            ${header(`รายงาน 4M Change Management ปี ${thaiYear}`, `จัดทำ ${new Date().toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'})}`)}
            <div style="flex:1;padding:24px 32px;display:flex;flex-direction:column;gap:20px;overflow:hidden">
                ${sectionTitle('สรุป Change Notice')}
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
                    ${kpiBox('ทั้งหมด',           total,       '#6366f1')}
                    ${kpiBox('Open',               kpi.open||0, '#0284c7')}
                    ${kpiBox('รอดำเนินการ',        kpi.pending||0, (kpi.pending||0)>0?'#d97706':'#64748b')}
                    ${kpiBox('ปิดแล้ว',            closed,      '#059669', closureRate>0?`${closureRate}% closure rate`:'')}
                </div>
                ${sectionTitle('Command Center / Admin Decision Signals')}
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
                    ${insightBox('Top Change Type', topType?.label || '-', `${parseInt(topType?.count, 10) || 0} notices`, '#6366f1')}
                    ${insightBox('Watch Department', watchDept?.Department || '-', `${parseInt(watchDept?.pending, 10) || 0} pending · ${parseInt(watchDept?.overdue, 10) || 0} overdue`, '#d97706')}
                    ${insightBox('Longest Pending', longestPending ? `${longestPending.NoticeNo || '-'} · ${parseInt(longestPending.ageDays, 10) || 0} days` : '-', longestPending?.Department || '', '#ef4444')}
                    ${insightBox('Monthly Momentum', `${latestMonthLabel} · ${latestRate}%`, monthDelta == null ? 'no previous month' : `${monthDelta >= 0 ? '+' : ''}${monthDelta}% vs previous`, monthDelta == null ? '#64748b' : monthDelta >= 0 ? '#059669' : '#ef4444')}
                </div>
                ${overdue ? `
                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px">
                    <p style="font-size:12px;font-weight:700;color:#92400e;margin:0 0 4px">⚠ แจ้งเตือน: มี ${overdue} รายการค้างนานเกิน ${OVERDUE_DAYS} วัน</p>
                    <p style="font-size:11px;color:#a16207;margin:0">กรุณาตรวจสอบและดำเนินการโดยเร็ว</p>
                </div>` : ''}
                ${sectionTitle(`รายการที่ยังเปิดอยู่ / ค้างดำเนินการ (${topNotices.length} รายการ)`)}
                ${topNotices.length ? `
                <table style="width:100%;border-collapse:collapse;font-size:12px">
                    <thead>
                        <tr style="background:#f8fafc">
                            <th style="padding:8px;text-align:left;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Notice No</th>
                            <th style="padding:8px;text-align:left;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">หัวข้อ</th>
                            <th style="padding:8px;text-align:center;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Type</th>
                            <th style="padding:8px;text-align:center;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">อายุ</th>
                            <th style="padding:8px;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">แผนก</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${topNotices.map((n,i) => {
                            const d = Math.floor((new Date()-new Date(n.RequestDate))/86400000);
                            const over = d > OVERDUE_DAYS;
                            const tm = TYPE_META[n.ChangeType]||{bg:'#f8fafc',text:'#64748b'};
                            return `<tr style="border-bottom:1px solid #f1f5f9;${over?'background:rgba(254,242,242,0.5)':''}">
                                <td style="padding:7px 8px;font-size:11px;font-family:monospace;color:#6366f1;font-weight:700">${escHtml(n.NoticeNo||'')}</td>
                                <td style="padding:7px 8px;font-size:11px;color:#334155;max-width:220px">${escHtml((n.Title||'').substring(0,45))}</td>
                                <td style="padding:7px 8px;text-align:center"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${tm.bg};color:${tm.text}">${escHtml(n.ChangeType)}</span></td>
                                <td style="padding:7px 8px;text-align:center;font-size:11px;font-weight:700;color:${over?'#ef4444':'#334155'}">${d} วัน</td>
                                <td style="padding:7px 8px;font-size:11px;color:#64748b">${escHtml(n.Department||'—')}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>` : `<p style="font-size:12px;color:#94a3b8;text-align:center;padding:16px">ไม่มีรายการที่ค้างดำเนินการ</p>`}
            </div>`);

        // ── PAGE 2: Trend + Type + Dept×Type ────────────────────────────────
        const deptTypeData = data.byDeptType||[];
        const depts = [...new Set(deptTypeData.map(r => r.Department))].slice(0, 8);
        const noticeList = [...notices].sort((a,b) => new Date(b.RequestDate)-new Date(a.RequestDate)).slice(0,8);
        const manTotal    = manRecs.reduce((s, r) => s + (parseInt(r.TotalAttendance)||0), 0);
        const manPass     = manRecs.reduce((s, r) => s + (parseInt(r.Pass)||0), 0);
        const manPassRate = manTotal > 0 ? Math.round(manPass/manTotal*100) : 0;
        _currentPdfPage = 2;
        const page2 = PAGE(`
            ${header(`แนวโน้มและการกระจาย ปี ${thaiYear}`)}
            <div style="flex:1;padding:20px 32px;display:flex;flex-direction:column;gap:12px;overflow:hidden">
                ${sectionTitle('Admin Insight Refinement')}
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
                    ${insightBox('Low Closure Dept', lowClosureDept?.Department || '-', `${parseInt(lowClosureDept?.closureRate, 10) || 0}% closure · ${parseInt(lowClosureDept?.active, 10) || 0} active`, '#ef4444')}
                    ${insightBox('Pending By Type', typePendingRisk?.ChangeType || '-', `${parseInt(typePendingRisk?.pending, 10) || 0} pending · ${parseInt(typePendingRisk?.overdue, 10) || 0} overdue`, '#d97706')}
                    ${insightBox('Avg Monthly Closure', `${monthlyClosure.length ? Math.round(monthlyClosure.reduce((sum,row)=>sum+(parseInt(row.closureRate,10)||0),0)/monthlyClosure.length) : 0}%`, `${monthlyClosure.length} active months`, '#059669')}
                </div>
                <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;align-items:start">
                    <div>
                        ${sectionTitle('แนวโน้มรายเดือน (Change Notice)')}
                        ${svgBar(data.monthly, 520, 110)}
                    </div>
                    <div>
                        ${sectionTitle('สัดส่วน Change Type')}
                        <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
                            ${svgPie(data.byType, 92)}
                            <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center">
                                ${(data.byType||[]).map((d,i) => {
                                    const PIE_COLORS=['#6366f1','#f97316','#22c55e','#a855f7'];
                                    return `<span style="font-size:10px;display:flex;align-items:center;gap:3px">
                                        <span style="width:8px;height:8px;border-radius:50%;background:${PIE_COLORS[i%4]};display:inline-block"></span>
                                        ${escHtml(d.label)} (${d.count})
                                    </span>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                ${depts.length ? `
                ${sectionTitle('แผนก × Change Type Matrix')}
                <table style="width:100%;border-collapse:collapse;font-size:11px">
                    <thead>
                        <tr style="background:#f8fafc">
                            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#64748b;border-bottom:2px solid #e2e8f0">แผนก</th>
                            ${CHANGE_TYPES.map(t => `<th style="padding:7px 8px;text-align:center;font-size:10px;font-weight:700;border-bottom:2px solid #e2e8f0;color:${TYPE_META[t].text}">${t}</th>`).join('')}
                            <th style="padding:7px 8px;text-align:center;font-size:10px;color:#64748b;border-bottom:2px solid #e2e8f0">รวม</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${depts.map(dept => {
                            const rows = deptTypeData.filter(r => r.Department === dept);
                            const rowTotal = rows.reduce((s,r)=>s+(parseInt(r.count)||0),0);
                            return `<tr style="border-bottom:1px solid #f1f5f9">
                                <td style="padding:6px 8px;color:#334155;font-weight:600">${escHtml(dept)}</td>
                                ${CHANGE_TYPES.map(t => {
                                    const item = rows.find(r => r.ChangeType === t);
                                    const cnt  = parseInt(item?.count)||0;
                                    const tm   = TYPE_META[t];
                                    return `<td style="padding:6px 8px;text-align:center">
                                        ${cnt ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${tm.bg};color:${tm.text}">${cnt}</span>` : '<span style="color:#cbd5e1">—</span>'}
                                    </td>`;
                                }).join('')}
                                <td style="padding:6px 8px;text-align:center;font-weight:700;color:#334155">${rowTotal}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>` : ''}
                <div style="display:grid;grid-template-columns:1.45fr .85fr;gap:16px;align-items:start">
                    <div>
                        ${sectionTitle(`Recent Change Notice (${noticeList.length}/${notices.length})`)}
                        ${noticeList.length ? `
                        <table style="width:100%;border-collapse:collapse;font-size:10px">
                            <thead>
                                <tr style="background:#f8fafc">
                                    <th style="padding:6px;text-align:left;color:#64748b;border-bottom:2px solid #e2e8f0">Notice</th>
                                    <th style="padding:6px;text-align:left;color:#64748b;border-bottom:2px solid #e2e8f0">Title</th>
                                    <th style="padding:6px;text-align:center;color:#64748b;border-bottom:2px solid #e2e8f0">Type</th>
                                    <th style="padding:6px;text-align:center;color:#64748b;border-bottom:2px solid #e2e8f0">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${noticeList.map(n => {
                                    const tm = TYPE_META[n.ChangeType]||{bg:'#f8fafc',text:'#64748b'};
                                    const sm = STATUS_META[n.Status]||{bg:'#f1f5f9',text:'#64748b',label:n.Status};
                                    return `<tr style="border-bottom:1px solid #f1f5f9">
                                        <td style="padding:5px 6px;font-family:monospace;font-weight:700;color:#6366f1">${escHtml(n.NoticeNo||'')}</td>
                                        <td style="padding:5px 6px;color:#334155">${escHtml((n.Title||'').substring(0,34))}</td>
                                        <td style="padding:5px 6px;text-align:center"><span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:20px;background:${tm.bg};color:${tm.text}">${escHtml(n.ChangeType||'-')}</span></td>
                                        <td style="padding:5px 6px;text-align:center"><span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:20px;background:${sm.bg};color:${sm.text}">${escHtml(sm.label||n.Status||'-')}</span></td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>` : `<p style="font-size:12px;color:#94a3b8;text-align:center;padding:18px">No Change Notice records</p>`}
                    </div>
                    <div>
                        ${sectionTitle('Man Record Summary')}
                        <div style="display:grid;grid-template-columns:1fr;gap:8px">
                            ${kpiBox('Departments recorded', manRecs.length, '#6366f1')}
                            ${kpiBox('Total attendance', manTotal, '#0284c7')}
                            ${kpiBox('Pass rate', `${manPassRate}%`, manPassRate>=80?'#059669':manPassRate>=60?'#d97706':'#ef4444')}
                        </div>
                        <div style="height:10px"></div>
                        ${sectionTitle('Training Matrix Snapshot')}
                        <div style="display:grid;grid-template-columns:1fr;gap:8px">
                            ${kpiBox('Curriculums', trainingCurriculums, '#7e22ce')}
                            ${kpiBox('Linked courses', trainingCourses, '#0284c7')}
                            ${kpiBox('Employees in scope', trainingEmployees, '#059669')}
                            ${kpiBox('Transferred rows', trainingTransferred, '#d97706')}
                        </div>
                    </div>
                </div>
            </div>`);

        // ── PAGE 3: Notice List ──────────────────────────────────────────────
        _currentPdfPage = 3;
        const noticeListFull = [...notices].sort((a,b) => new Date(b.RequestDate)-new Date(a.RequestDate)).slice(0,22);
        const page3 = PAGE(`
            ${header(`รายการ Change Notice ปี ${thaiYear} (${notices.length} รายการ)`)}
            <div style="flex:1;padding:20px 32px;overflow:hidden">
                <table style="width:100%;border-collapse:collapse;font-size:11px">
                    <thead>
                        <tr style="background:#f8fafc">
                            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Notice No</th>
                            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">วันที่</th>
                            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">หัวข้อ</th>
                            <th style="padding:7px 8px;text-align:center;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Type</th>
                            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">แผนก</th>
                            <th style="padding:7px 8px;text-align:center;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">สถานะ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${noticeListFull.map(n => {
                            const tm = TYPE_META[n.ChangeType]||{bg:'#f8fafc',text:'#64748b'};
                            const sm = STATUS_META[n.Status]  ||{bg:'#f1f5f9',text:'#64748b',label:n.Status};
                            const daysOld = n.Status!=='Closed' ? Math.floor((new Date()-new Date(n.RequestDate))/86400000) : 0;
                            const isOvd   = daysOld > OVERDUE_DAYS;
                            return `<tr style="border-bottom:1px solid #f8fafc;${isOvd?'background:rgba(254,242,242,0.4)':''}">
                                <td style="padding:5px 8px;font-size:10px;font-family:monospace;color:#6366f1;font-weight:700">${escHtml(n.NoticeNo||'')}</td>
                                <td style="padding:5px 8px;font-size:10px;color:#64748b;white-space:nowrap">${fmtShort(n.RequestDate)}</td>
                                <td style="padding:5px 8px;font-size:11px;color:#334155;max-width:200px">${escHtml((n.Title||'').substring(0,38))}</td>
                                <td style="padding:5px 8px;text-align:center"><span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:20px;background:${tm.bg};color:${tm.text}">${escHtml(n.ChangeType)}</span></td>
                                <td style="padding:5px 8px;font-size:10px;color:#64748b">${escHtml((n.Department||'—').substring(0,18))}</td>
                                <td style="padding:5px 8px;text-align:center"><span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:20px;background:${sm.bg};color:${sm.text}">${sm.label}</span></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                ${notices.length > 22 ? `<p style="font-size:10px;color:#94a3b8;text-align:right;margin:8px 0 0">แสดง 22 จาก ${notices.length} รายการ — ดูทั้งหมดในระบบ</p>` : ''}
            </div>`);

        // ── PAGE 4: Man Record ───────────────────────────────────────────────
        _currentPdfPage = 4;
        const manTotalFull    = manRecs.reduce((s, r) => s + (r.TotalAttendance||0), 0);
        const manPassFull     = manRecs.reduce((s, r) => s + (r.Pass||0), 0);
        const manPassRateFull = manTotalFull > 0 ? Math.round(manPassFull/manTotalFull*100) : 0;
        const page4 = PAGE(`
            ${header(`ผลการทดสอบ Man Record ปี ${thaiYear}`)}
            <div style="flex:1;padding:22px 32px;display:flex;flex-direction:column;gap:16px;overflow:hidden">
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
                    ${kpiBox('แผนกที่บันทึก', manRecs.length, '#6366f1')}
                    ${kpiBox('ผู้เข้าสอบรวม', manTotal, '#0284c7')}
                    ${kpiBox('Pass Rate รวม', `${manPassRate}%`, manPassRate>=80?'#059669':manPassRate>=60?'#d97706':'#ef4444')}
                </div>
                ${sectionTitle(`สรุปผลสอบรายแผนก (${manRecs.length} แผนก)`)}
                ${manRecs.length ? `
                <table style="width:100%;border-collapse:collapse;font-size:12px">
                    <thead>
                        <tr style="background:#f8fafc">
                            <th style="padding:8px;text-align:left;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">แผนก</th>
                            <th style="padding:8px;text-align:center;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">ผู้เข้าสอบ</th>
                            <th style="padding:8px;text-align:center;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">ผ่าน</th>
                            <th style="padding:8px;text-align:center;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">ไม่ผ่าน</th>
                            <th style="padding:8px;text-align:left;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Pass Rate</th>
                            <th style="padding:8px;text-align:center;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">ผลสอบ</th>
                            <th style="padding:8px;text-align:left;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e2e8f0">วันที่สอบ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${manRecs.map(r => {
                            const rate = r.TotalAttendance > 0 ? Math.round((r.Pass/r.TotalAttendance)*100) : 0;
                            const rateColor = rate>=80?'#059669':rate>=60?'#d97706':'#ef4444';
                            const MAN_STATUS_COLORS = { Pass:'#059669', Fail:'#ef4444', Pending:'#d97706' };
                            const barW = Math.round(rate * 0.7);
                            return `<tr style="border-bottom:1px solid #f1f5f9">
                                <td style="padding:7px 8px;color:#334155;font-weight:600">${escHtml(r.Department||'—')}</td>
                                <td style="padding:7px 8px;text-align:center;color:#334155">${r.TotalAttendance||0}</td>
                                <td style="padding:7px 8px;text-align:center;font-weight:700;color:#059669">${r.Pass||0}</td>
                                <td style="padding:7px 8px;text-align:center;font-weight:700;color:#ef4444">${r.Fail||0}</td>
                                <td style="padding:7px 8px">
                                    <div style="display:flex;align-items:center;gap:6px">
                                        <div style="flex:1;height:6px;border-radius:4px;background:#f1f5f9;overflow:hidden">
                                            <div style="height:100%;border-radius:4px;background:${rateColor};width:${rate}%"></div>
                                        </div>
                                        <span style="font-size:11px;font-weight:700;color:${rateColor};width:36px">${rate}%</span>
                                    </div>
                                </td>
                                <td style="padding:7px 8px;text-align:center">
                                    <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${MAN_STATUS_COLORS[r.Status]||'#64748b'}22;color:${MAN_STATUS_COLORS[r.Status]||'#64748b'}">${escHtml(r.Status||'—')}</span>
                                </td>
                                <td style="padding:7px 8px;font-size:10px;color:#64748b;white-space:nowrap">${fmtShort(r.ExamDate)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>` : `<p style="font-size:12px;color:#94a3b8;text-align:center;padding:24px">ยังไม่มีข้อมูลผลสอบในปี ${thaiYear}</p>`}
            </div>`);

        // ── Render all pages ─────────────────────────────────────────────────
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
        const pages = [page1, page2, page3, page4];

        for (let i = 0; i < pages.length; i++) {
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;left:-9999px;top:0;font-family:Kanit,sans-serif';
            div.innerHTML = pages[i];
            document.body.appendChild(div);
            try {
                const canvas = await html2canvas(div.firstElementChild, { scale:1.5, useCORS:true, backgroundColor:'#fff', logging:false });
                if (i > 0) pdf.addPage();
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
            } finally {
                document.body.removeChild(div);
            }
        }

        pdf.save(`4M_Change_Management_${_statsYear}.pdf`);
        showToast('ดาวน์โหลด PDF สำเร็จ (4 หน้า)', 'success');
    } catch (err) { showError(err); }
};

// ─────────────────────────────────────────────────────────────────────────────
// Event Listeners
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', async (e) => {
        if (e.target.closest('[data-fourm-card-save-action]')) {
            const card = _fourmCardSaveMenu?.card;
            _fourmHideCardImageMenu();
            if (card) await _fourmDownloadCardImage(card);
            return;
        }
        if (!e.target.closest('#fourm-card-save-menu')) _fourmHideCardImageMenu();

        const noticeOpenTraining = e.target.closest('.btn-notice-open-training');
        if (noticeOpenTraining) {
            const year = parseInt(noticeOpenTraining.dataset.year, 10);
            if (year) _tmFilter.year = year;
            if (noticeOpenTraining.dataset.dept) _tmFilter.dept = noticeOpenTraining.dataset.dept;
            _manSubtab = 'matrix';
            try { sessionStorage.setItem(MAN_SUBTAB_STORAGE_KEY, 'matrix'); } catch (_) {}
            closeModal();
            await switchTab('man');
            return;
        }

        if (!e.target.closest('#fourm-page')) return;

        if (e.target.closest('#fourm-dashboard-retry')) {
            await _renderDashInner();
            return;
        }

        // Tab buttons
        const tabBtn = e.target.closest('.fourm-tab');
        if (tabBtn) { await switchTab(tabBtn.dataset.tab); return; }

        // KPI card navigation → notices tab
        const kpiNav = e.target.closest('.fourm-kpi-nav');
        if (kpiNav) {
            const filterStatus  = kpiNav.dataset.filterStatus;
            const filterOverdue = kpiNav.dataset.filterOverdue;
            const filterMine    = kpiNav.dataset.filterMine;
            const filterType    = kpiNav.dataset.filterType;
            const filterDept    = kpiNav.dataset.filterDept;
            const filterTrainingRequired = kpiNav.dataset.filterTrainingRequired;
            if (filterOverdue === '1') {
                _noticeFilter.overdue = true;
                _noticeFilter.status  = 'overdue';
            } else {
                _noticeFilter.overdue = false;
                _noticeFilter.status  = filterStatus || 'all';
            }
            _noticeFilter.mine = filterMine === '1';
            _noticeFilter.type = filterType || 'all';
            _noticeFilter.dept = filterDept || 'all';
            _noticeFilter.trainingRequired = filterTrainingRequired === '1';
            _noticeFilter.year = _statsYear;
            await switchTab('notices');
            return;
        }

        const emailRetry = e.target.closest('.btn-fourm-email-retry');
        if (emailRetry) {
            try {
                showLoading('กำลังส่งอีเมลซ้ำ...');
                await API.post(`/fourm/email-outbox/${emailRetry.dataset.id}/retry`, {});
                showToast('ส่งอีเมลซ้ำสำเร็จ', 'success');
                await _loadFourmEmailOutbox();
            } catch (err) { showError(err); }
            finally { hideLoading(); }
            return;
        }

        // Excel export
        if (e.target.closest('#btn-export-notices')) { _exportNoticesToExcel(); return; }
        if (e.target.closest('#btn-export-man')) { _exportManToExcel(); return; }

        // Man record
        const manSubtab = e.target.closest('.fourm-man-subtab');
        if (manSubtab) {
            _manSubtab = manSubtab.dataset.manSubtab || 'summary';
            try { sessionStorage.setItem(MAN_SUBTAB_STORAGE_KEY, _manSubtab); } catch (_) {}
            await renderMan(document.getElementById('fourm-tab-content'));
            return;
        }
        if (e.target.closest('#btn-add-man')) { showManForm(); return; }
        if (e.target.closest('#btn-tm-refresh')) { await fetchTrainingMatrix(); return; }
        if (e.target.closest('#btn-tm-audit-log')) { await showTrainingAuditLogModal(); return; }
        if (e.target.closest('#btn-tm-export-excel')) { showTrainingMatrixExcelExportModal(); return; }
        if (e.target.closest('#btn-tm-export-current-curriculum')) {
            const btn = e.target.closest('#btn-tm-export-current-curriculum');
            if (_tmSelectedCurriculumId) await _exportTrainingMatrixExcel({ curriculumId: _tmSelectedCurriculumId, triggerEl: btn });
            return;
        }
        const tmExcelScope = e.target.closest('[data-tm-excel-scope]');
        if (tmExcelScope) {
            const curriculumId = tmExcelScope.dataset.tmExcelScope === 'selected' ? _tmSelectedCurriculumId : null;
            await _exportTrainingMatrixExcel({ curriculumId, triggerEl: tmExcelScope });
            return;
        }
        if (e.target.closest('#btn-tm-export-pdf')) { await _exportTrainingMatrixPdf(); return; }
        if (e.target.closest('#btn-tm-course-master')) { await showTrainingCourseMasterModal(); return; }
        if (e.target.closest('#btn-tm-add-curriculum')) { showTrainingCurriculumForm(); return; }
        if (e.target.closest('#btn-tm-add-course')) { await showTrainingCoursePickerModal(); return; }
        if (e.target.closest('#btn-tm-assign-employees')) {
            if (!canManageTrainingMatrix()) { showToast('Read only: 4M Training PIC permission is required.', 'warning'); return; }
            if (_tmInlineSelectedEmployees.size) await assignInlineTrainingEmployees();
            else await showAssignEmployeesModal();
            return;
        }
        const tmLinkMaster = e.target.closest('.btn-tm-link-master-course');
        if (tmLinkMaster) { await linkTrainingMasterCourse(tmLinkMaster.dataset.id); return; }
        const tmDetailTab = e.target.closest('.tm-detail-tab');
        if (tmDetailTab) {
            _tmDetailTab = tmDetailTab.dataset.tmDetailTab || 'courses';
            renderTrainingDetailShell();
            return;
        }
        if (e.target.closest('#btn-tm-toggle-course-master')) {
            _tmShowCourseMaster = !_tmShowCourseMaster;
            renderTrainingCourses();
            return;
        }
        if (e.target.closest('#btn-tm-toggle-employee-master')) {
            if (!canManageTrainingMatrix()) { showToast('Read only: 4M Training PIC permission is required.', 'warning'); return; }
            _tmShowEmployeeMaster = !_tmShowEmployeeMaster;
            renderTrainingDetailShell();
            return;
        }
        const tmCurriculumEdit = e.target.closest('.btn-tm-edit-curriculum');
        if (tmCurriculumEdit) {
            const rec = _tmCurriculums.find(c => c.id === tmCurriculumEdit.dataset.id);
            if (rec) showTrainingCurriculumForm(rec);
            return;
        }
        const tmCurriculumDisable = e.target.closest('.btn-tm-disable-curriculum');
        if (tmCurriculumDisable) {
            const ok = await showConfirmationModal('ปิดหลักสูตร? / Disable curriculum?', `ปิด "${tmCurriculumDisable.dataset.title || 'curriculum'}" และรายวิชาทั้งหมดใช่ไหม? / Disable this curriculum and its courses?`);
            if (!ok) return;
            try {
                showLoading('กำลังปิดหลักสูตร... / Disabling curriculum...');
                await API.delete(`/fourm/training-curriculums/${tmCurriculumDisable.dataset.id}`);
                showToast('ปิดหลักสูตรสำเร็จ / Curriculum disabled', 'success');
                _tmSelectedCurriculumId = null;
                _tmSelectedCourseId = null;
                await fetchTrainingMatrix();
            } catch (err) { showError(err); }
            finally { hideLoading(); }
            return;
        }
        const tmCourseEdit = e.target.closest('.btn-tm-edit-course');
        if (tmCourseEdit) {
            const rec = _tmCourses.find(c => c.id === tmCourseEdit.dataset.id);
            if (rec) showTrainingCourseForm(rec);
            return;
        }
        const tmCourseDisable = e.target.closest('.btn-tm-disable-course');
        if (tmCourseDisable) {
            const ok = await showConfirmationModal('ลบรายวิชาออกจากหลักสูตร? / Remove course?', `ลบ "${tmCourseDisable.dataset.title || 'course'}" ออกจากหลักสูตรนี้ใช่ไหม? / Remove from this curriculum?`);
            if (!ok) return;
            try {
                showLoading('กำลังลบรายวิชาออกจากหลักสูตร... / Removing course...');
                await API.delete(`/fourm/training-courses/${tmCourseDisable.dataset.id}`);
                showToast('ลบรายวิชาออกจากหลักสูตรสำเร็จ / Course removed', 'success');
                _tmSelectedCourseId = null;
                await fetchTrainingCourses(_tmSelectedCurriculumId);
                await fetchTrainingMatrix();
            } catch (err) { showError(err); }
            finally { hideLoading(); }
            return;
        }
        const tmCurriculum = e.target.closest('.tm-curriculum-item');
        if (tmCurriculum) {
            _tmSelectedCurriculumId = tmCurriculum.dataset.id;
            _tmSelectedCourseId = null;
            _tmAssignments = [];
            _tmInlineSelectedEmployees.clear();
            _tmSearch.inlineEmployee = '';
            renderTrainingMatrixBreadcrumb();
            await renderTrainingCurriculums();
            await fetchTrainingCourses(_tmSelectedCurriculumId);
            return;
        }
        const tmCourse = e.target.closest('.tm-course-item');
        if (tmCourse) {
            _tmSelectedCourseId = tmCourse.dataset.id;
            renderTrainingMatrixBreadcrumb();
            renderTrainingCourses();
            return;
        }
        const tmRemove = e.target.closest('.btn-tm-remove-assignment');
        if (tmRemove) {
            if (!canManageTrainingMatrix()) { showToast('Read only: 4M Training PIC permission is required.', 'warning'); return; }
            const ok = await showConfirmationModal('ลบพนักงานออก? / Remove employee?', `ลบ "${tmRemove.dataset.name || 'employee'}" ออกจากรายวิชานี้ใช่ไหม? / Remove from this course?`);
            if (!ok) return;
            try {
                showLoading('กำลังลบพนักงานออก... / Removing assignment...');
                await API.delete(`/fourm/training-curriculum-assignments/${tmRemove.dataset.id}`);
                showToast('ลบพนักงานออกสำเร็จ / Assignment removed', 'success');
                await fetchTrainingAssignments(_tmSelectedCurriculumId);
                await fetchTrainingMatrix();
            } catch (err) { showError(err); }
            finally { hideLoading(); }
            return;
        }
        const tmEmployeeHistory = e.target.closest('.btn-tm-employee-history');
        if (tmEmployeeHistory) {
            await showTrainingEmployeeHistoryModal(tmEmployeeHistory.dataset.employeeId, tmEmployeeHistory.dataset.name);
            return;
        }
        const tmCurriculumTransfer = e.target.closest('.btn-tm-transfer-curriculum');
        if (tmCurriculumTransfer) {
            if (!canManageTrainingMatrix()) { showToast('Read only: 4M Training PIC permission is required.', 'warning'); return; }
            await showTransferCurriculumAssignmentModal(tmCurriculumTransfer.dataset.id);
            return;
        }
        const tmTransfer = e.target.closest('.btn-tm-transfer-assignment');
        if (tmTransfer) {
            if (!canManageTrainingMatrix()) { showToast('Read only: 4M Training PIC permission is required.', 'warning'); return; }
            await showTransferAssignmentModal(tmTransfer.dataset.id);
            return;
        }
        const manFromScope = e.target.closest('.btn-man-from-scope');
        if (manFromScope) {
            const total = parseInt(manFromScope.dataset.total, 10) || 0;
            showManForm({
                _virtual: true,
                Department: manFromScope.dataset.dept || '',
                TotalAttendance: total,
                Pass: 0,
                Fail: total,
                Status: 'Pending',
                ExamDate: new Date().toISOString().slice(0, 10),
                Notes: 'Auto-filled from Training Matrix scope',
            });
            return;
        }
        const manEdit = e.target.closest('.btn-man-edit');
        if (manEdit) {
            const rec = _lastManRows.find(r => String(r.id) === manEdit.dataset.id);
            if (rec) showManForm(rec);
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
        const noticeFocus = e.target.closest('[data-notice-focus]');
        if (noticeFocus) {
            const value = noticeFocus.dataset.noticeFocus;
            _noticeFilter.overdue = value === 'overdue';
            _noticeFilter.status = value === 'overdue' ? 'overdue' : value;
            const statusEl = document.getElementById('notice-filter-status');
            if (statusEl) statusEl.value = _noticeFilter.status;
            await fetchAndRenderNotices();
            return;
        }
        if (e.target.closest('#notice-filter-mine')) {
            _noticeFilter.mine = !_noticeFilter.mine;
            await renderNotices(document.getElementById('fourm-tab-content'));
            return;
        }
        if (e.target.closest('#notice-clear-training-filter')) {
            _noticeFilter.trainingRequired = false;
            await renderNotices(document.getElementById('fourm-tab-content'));
            return;
        }
        const taskAdd = e.target.closest('.btn-fourm-task-add');
        if (taskAdd) { showTaskForm(taskAdd.dataset.noticeId); return; }
        const taskEdit = e.target.closest('.btn-fourm-task-edit');
        if (taskEdit) {
            try { showTaskForm(JSON.parse(taskEdit.dataset.task || '{}').NoticeID, JSON.parse(taskEdit.dataset.task || '{}')); }
            catch (_) { showError('ไม่สามารถเปิดข้อมูล Action Plan ได้'); }
            return;
        }
        const taskDone = e.target.closest('.btn-fourm-task-done');
        if (taskDone) {
            try {
                showLoading('กำลังปิด Action Plan...');
                await API.put(`/fourm/notice-tasks/${taskDone.dataset.taskId}`, { Status: 'Done' });
                hideLoading();
                showToast('ปิด Action Plan สำเร็จ', 'success');
                await showNoticeDetail(taskDone.dataset.noticeId);
            } catch (err) { hideLoading(); showError(err); }
            return;
        }
        const taskDelete = e.target.closest('.btn-fourm-task-delete');
        if (taskDelete) {
            const ok = await showConfirmationModal('ลบ Action Plan?', 'รายการนี้จะถูกลบออกจาก Change Notice', { confirmText:'ลบ', type:'danger' });
            if (!ok) return;
            try {
                showLoading('กำลังลบ Action Plan...');
                await API.delete(`/fourm/notice-tasks/${taskDelete.dataset.taskId}`);
                hideLoading();
                showToast('ลบ Action Plan สำเร็จ', 'success');
                await showNoticeDetail(taskDelete.dataset.noticeId);
            } catch (err) { hideLoading(); showError(err); }
            return;
        }
        if (e.target.closest('.fourm-open-training-matrix')) {
            const btn = e.target.closest('.fourm-open-training-matrix');
            const year = parseInt(btn.dataset.year, 10);
            if (year) _tmFilter.year = year;
            if (btn.dataset.dept) _tmFilter.dept = btn.dataset.dept;
            _manSubtab = 'matrix';
            try { sessionStorage.setItem(MAN_SUBTAB_STORAGE_KEY, 'matrix'); } catch (_) {}
            await switchTab('man');
            return;
        }
        if (e.target.closest('#btn-add-notice')) { await showNoticeForm(); return; }
        if (e.target.closest('.btn-notice-view'))  { await showNoticeDetail(e.target.closest('.btn-notice-view').dataset.id); return; }
        const noticeEdit = e.target.closest('.btn-notice-edit');
        if (noticeEdit) {
            showLoading('กำลังโหลด...');
            try { const res = await API.get(`/fourm/notices/${noticeEdit.dataset.id}`); hideLoading(); await showNoticeForm(res?.data??res); }
            catch (err) { hideLoading(); showError(err); }
            return;
        }
        const noticeClose = e.target.closest('.btn-notice-close');
        if (noticeClose) { showCloseForm(noticeClose.dataset.id, noticeClose.dataset.no); return; }
        const noticePending = e.target.closest('.btn-notice-pending');
        if (noticePending) {
            const ok = await showConfirmationModal('เปลี่ยนสถานะ', `เปลี่ยน Notice "${noticePending.dataset.no}" เป็น Pending ใช่หรือไม่?`);
            if (ok) {
                showLoading('กำลังอัปเดต...');
                try {
                    await API.put(`/fourm/notices/${noticePending.dataset.id}`, { Status: 'Pending' });
                    showToast('เปลี่ยนสถานะเป็น Pending สำเร็จ', 'success');
                    await fetchAndRenderNotices();
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }
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

    document.addEventListener('contextmenu', _fourmShowCardContextMenu);
    document.addEventListener('pointerdown', _fourmStartCardImageHold);
    document.addEventListener('pointermove', _fourmMoveCardImageHold);
    document.addEventListener('pointerup', _fourmCancelCardImageHold);
    document.addEventListener('pointercancel', _fourmCancelCardImageHold);

    document.addEventListener('change', async (e) => {
        if (!e.target.closest('#fourm-page')) return;
        if (e.target?.name === 'InlineEmployeeIDs') {
            if (e.target.checked) _tmInlineSelectedEmployees.add(String(e.target.value));
            else _tmInlineSelectedEmployees.delete(String(e.target.value));
            renderInlineEmployeeMaster();
            return;
        }

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
        if (e.target.id === 'man-filter-status')  { _manFilter.status  = e.target.value; await fetchAndRenderMan();               return; }
        if (e.target.id === 'tm-filter-year')     { _tmFilter.year     = parseInt(e.target.value); _tmSelectedCurriculumId = null; _tmSelectedCourseId = null; _tmInlineSelectedEmployees.clear(); _tmSearch.inlineEmployee = ''; await fetchTrainingMatrix(); return; }
        if (e.target.id === 'tm-filter-dept')     { _tmFilter.dept     = e.target.value; _tmSelectedCurriculumId = null; _tmSelectedCourseId = null; _tmInlineSelectedEmployees.clear(); _tmSearch.inlineEmployee = ''; await fetchTrainingMatrix(); return; }
    });

    document.addEventListener('input', debounce(async (e) => {
        if (!e.target.closest('#fourm-page')) return;
        if (e.target.id === 'notice-search') { _noticeFilter.q = e.target.value; await fetchAndRenderNotices(); return; }
        if (e.target.id === 'man-search')    { _manFilter.q    = e.target.value; await fetchAndRenderMan();     return; }
        if (e.target.id === 'tm-curriculum-search') {
            _tmSearch.curriculum = e.target.value;
            await renderTrainingCurriculums();
            return;
        }
        if (e.target.id === 'tm-course-search') {
            _tmSearch.course = e.target.value;
            renderTrainingCourses();
            return;
        }
        if (e.target.id === 'tm-assignment-search') {
            _tmSearch.employee = e.target.value;
            renderTrainingAssignments();
            renderInlineEmployeeMaster();
            return;
        }
        if (e.target.id === 'tm-inline-employee-search') {
            _tmSearch.inlineEmployee = e.target.value;
            renderInlineEmployeeMaster();
            return;
        }
    }, 350));
}

// ─────────────────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────────────────
function _fourmGetCardImageTarget(event) {
    const page = document.getElementById('fourm-page');
    if (!page || !event.target || !page.contains(event.target)) return null;
    const card = event.target.closest('[data-fourm-card-image], .ds-section, .ds-metric-card, .ds-table-wrap');
    if (!card || !page.contains(card)) return null;
    if (card.closest('#fourm-card-save-menu')) return null;
    return card;
}

function _fourmIsInteractiveTarget(target) {
    return Boolean(target?.closest?.('button,a,input,select,textarea,label,[contenteditable="true"],.flatpickr-calendar'));
}

function _fourmShowCardContextMenu(event) {
    const card = _fourmGetCardImageTarget(event);
    if (!card) return;
    if (_fourmIsInteractiveTarget(event.target)) return;
    event.preventDefault();
    _fourmShowCardImageMenu(card, event.clientX, event.clientY);
}

function _fourmStartCardImageHold(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const card = _fourmGetCardImageTarget(event);
    if (!card) return;
    if (_fourmIsInteractiveTarget(event.target)) return;
    _fourmCancelCardImageHold();
    _fourmCardSaveHold = {
        card,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        fired: false,
        timer: setTimeout(() => {
            if (!_fourmCardSaveHold || _fourmCardSaveHold.card !== card) return;
            _fourmCardSaveHold.fired = true;
            _fourmShowCardImageMenu(card, _fourmCardSaveHold.x, _fourmCardSaveHold.y);
        }, 800),
    };
}

function _fourmMoveCardImageHold(event) {
    if (!_fourmCardSaveHold || event.pointerId !== _fourmCardSaveHold.pointerId) return;
    if (Math.abs(event.clientX - _fourmCardSaveHold.x) > 10 || Math.abs(event.clientY - _fourmCardSaveHold.y) > 10) {
        _fourmCancelCardImageHold();
    }
}

function _fourmCancelCardImageHold() {
    if (_fourmCardSaveHold?.timer) clearTimeout(_fourmCardSaveHold.timer);
    _fourmCardSaveHold = null;
}

function _fourmShowCardImageMenu(card, clientX, clientY) {
    _fourmHideCardImageMenu();
    const menu = document.createElement('div');
    menu.id = 'fourm-card-save-menu';
    menu.className = 'fixed z-[9999] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl';
    menu.style.minWidth = '190px';
    menu.innerHTML = `
        <button type="button" data-fourm-card-save-action
            class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-black text-slate-700 hover:bg-emerald-50 hover:text-emerald-700">
            <svg class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m4 7H5a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2z"/>
            </svg>
            บันทึกเป็นรูปภาพ / Save image
        </button>`;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const left = Math.min(Math.max(8, clientX), window.innerWidth - rect.width - 8);
    const top = Math.min(Math.max(8, clientY), window.innerHeight - rect.height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    _fourmCardSaveMenu = { card, menu };
}

function _fourmHideCardImageMenu() {
    _fourmCardSaveMenu?.menu?.remove?.();
    _fourmCardSaveMenu = null;
}

async function _fourmDownloadCardImage(card) {
    if (typeof html2canvas === 'undefined') {
        showToast('ไม่พบ library สำหรับบันทึกรูปภาพ / Image export library not found', 'error');
        return;
    }
    const name = _fourmSafeFilePart(card.dataset.fourmCardImage || _fourmCardTitle(card) || 'fourm-card');
    try {
        showLoading('กำลังบันทึกรูปภาพการ์ด... / Saving card image...');
        const canvas = await html2canvas(card, {
            backgroundColor: '#ffffff',
            scale: Math.min(2, window.devicePixelRatio || 1.5),
            useCORS: true,
            logging: false,
            onclone: doc => {
                doc.querySelectorAll('[data-fourm-card-ignore]').forEach(el => { el.style.display = 'none'; });
                doc.querySelectorAll('#fourm-card-save-menu').forEach(el => { el.remove(); });
            },
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${name}-${_statsYear}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('บันทึกรูปภาพการ์ดแล้ว / Card image saved', 'success');
    } catch (err) {
        showToast(err?.message || 'บันทึกรูปภาพการ์ดไม่สำเร็จ / Cannot save card image', 'error');
    } finally {
        hideLoading();
    }
}

function _fourmPrepareCardImageTargets() {
    const page = document.getElementById('fourm-page');
    if (!page) return;
    page.querySelectorAll('#fourm-tab-content .ds-section, #fourm-tab-content .ds-metric-card, #fourm-tab-content .ds-table-wrap').forEach((card, index) => {
        if (!card.dataset.fourmCardImage) {
            card.dataset.fourmCardImage = _fourmSafeFilePart(_fourmCardTitle(card) || `fourm-card-${index + 1}`);
        }
    });
}

function _fourmCardTitle(card) {
    const titleEl = card.querySelector?.('h2,h3,h4,[data-card-title]');
    const title = titleEl?.textContent || card.getAttribute?.('aria-label') || card.id || 'fourm-card';
    return String(title).replace(/\s+/g, ' ').trim();
}

function _fourmSafeFilePart(value) {
    return String(value || 'fourm-card')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'fourm-card';
}

function infoBlock(label, value) {
    return `<div><p class="text-slate-400 font-medium mb-0.5">${label}</p><p class="font-semibold text-slate-700">${value}</p></div>`;
}

function impactSelect(name, value) {
    const current = IMPACT_LEVELS.includes(value) ? value : 'N/A';
    return `<select name="${name}" class="form-input w-full">
        ${IMPACT_LEVELS.map(level => `<option value="${level}" ${current === level ? 'selected' : ''}>${level}</option>`).join('')}
    </select>`;
}

function impactBadge(value) {
    const meta = IMPACT_META[value] || IMPACT_META['N/A'];
    return `<span class="inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold ${meta.cls}">${meta.label}</span>`;
}

function taskBadge(status) {
    const meta = TASK_META[status] || TASK_META.Pending;
    return `<span class="inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold ${meta.cls}">${meta.label}</span>`;
}

function renderTaskList(tasks = [], canManage = false) {
    if (!tasks.length) {
        return `<div class="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-400">
            ยังไม่มี Action Plan สำหรับ Notice นี้
        </div>`;
    }
    const fmt = d => d ? new Date(d).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'numeric' }) : '-';
    return `<div class="space-y-2">
        ${tasks.map(t => {
            const overdue = t.Status !== 'Done' && t.DueDate && new Date(t.DueDate) < new Date(new Date().toISOString().slice(0, 10));
            return `<div class="rounded-xl border ${overdue ? 'border-rose-200 bg-rose-50/60' : 'border-slate-100 bg-slate-50'} p-3">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            ${taskBadge(t.Status)}
                            ${overdue ? '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-200">Overdue</span>' : ''}
                        </div>
                        <p class="font-bold text-slate-700 mt-2">${escHtml(t.TaskTitle || '-')}</p>
                        <p class="text-xs text-slate-500 mt-1">ผู้รับผิดชอบ: ${escHtml(t.OwnerName || '-')} · Due: ${fmt(t.DueDate)}</p>
                        ${t.Notes ? `<p class="text-xs text-slate-500 mt-2 whitespace-pre-wrap">${escHtml(t.Notes)}</p>` : ''}
                    </div>
                    ${canManage ? `<div class="flex flex-wrap gap-1.5 shrink-0">
                        ${t.Status !== 'Done' ? `<button class="btn-fourm-task-done px-2 py-1 rounded-lg text-xs font-bold text-emerald-700 hover:bg-emerald-50" data-task-id="${t.id}" data-notice-id="${t.NoticeID}">Done</button>` : ''}
                        <button class="btn-fourm-task-edit px-2 py-1 rounded-lg text-xs font-bold text-indigo-600 hover:bg-indigo-50"
                                data-task='${escHtml(JSON.stringify(t))}'>แก้ไข</button>
                        <button class="btn-fourm-task-delete px-2 py-1 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50"
                                data-task-id="${t.id}" data-notice-id="${t.NoticeID}">ลบ</button>
                    </div>` : ''}
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

function showTaskForm(noticeId, task = null) {
    const r = normalizeApiObject(task);
    const html = `
        <form id="fourm-task-form" class="space-y-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">งานที่ต้องติดตาม / Task <span class="text-red-500">*</span></label>
                <input name="TaskTitle" class="form-input w-full" required value="${escHtml(r.TaskTitle || '')}" placeholder="ระบุสิ่งที่ต้องดำเนินการ">
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้รับผิดชอบ / Owner</label>
                    <input name="OwnerName" class="form-input w-full" value="${escHtml(r.OwnerName || '')}" placeholder="ชื่อผู้รับผิดชอบ">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">กำหนดเสร็จ / Due Date</label>
                    <input type="date" name="DueDate" class="form-input w-full" value="${r.DueDate ? String(r.DueDate).split('T')[0] : ''}">
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานะ / Status</label>
                <select name="Status" class="form-input w-full">
                    ${TASK_STATUSES.map(s => `<option value="${s}" ${(r.Status || 'Pending') === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ / Notes</label>
                <textarea name="Notes" rows="3" class="form-input w-full resize-none" placeholder="รายละเอียดเพิ่มเติม...">${escHtml(r.Notes || '')}</textarea>
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4" onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
                <button type="submit" id="fourm-task-save-btn" class="btn btn-primary px-5">บันทึก</button>
            </div>
        </form>`;
    openModal(task ? 'แก้ไข Action Plan' : 'เพิ่ม Action Plan', html, 'max-w-lg');
    document.getElementById('fourm-task-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
        e.preventDefault();
        const btn = document.getElementById('fourm-task-save-btn');
        btn.disabled = true;
        try {
            showLoading('กำลังบันทึก Action Plan...');
            const body = Object.fromEntries(new FormData(e.target).entries());
            if (task?.id) await API.put(`/fourm/notice-tasks/${task.id}`, body);
            else await API.post(`/fourm/notices/${noticeId}/tasks`, body);
            closeModal();
            showToast('บันทึก Action Plan สำเร็จ', 'success');
            await showNoticeDetail(noticeId);
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; btn.textContent = 'บันทึก'; }
    }));
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
