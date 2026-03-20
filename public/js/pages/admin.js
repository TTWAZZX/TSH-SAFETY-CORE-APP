import { showToast, showError, openModal, closeModal } from '../ui.js';
import { API } from '../api.js';

// ─── Global State ─────────────────────────────────────────────────────────────
let _currentTab   = 'dashboard';
let _calInst      = null;

// Employee tab state
let _empCache     = [];
let _deptCache    = [];
let _teamCache    = [];
let _posCache     = [];
let _unitCache    = [];
let _empSearch    = '';
let _empPage      = 1;
const EMP_PER_PAGE = 25;

// Audit log state
let _auditPage    = 1;
let _auditTotal   = 0;
const AUDIT_LIMIT  = 50;

// Scheduler temp state
let _allEmpCache  = [];

// Organization tab state
let _orgDepts      = [];   // { id, Name, is_safety_core, unit_count }
let _orgUnits      = [];   // { id, name, department_id, short_code }
let _orgSearch     = '';
let _orgFilter     = 'all'; // 'all' | 'safety' | 'general'
let _orgPage       = 1;
let _orgFetchError = false;
const ORG_PER_PAGE = 15;

// ─── Tab Config ───────────────────────────────────────────────────────────────
const TABS = [
    { key: 'dashboard',    label: 'ภาพรวม',           icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>` },
    { key: 'scheduler',    label: 'กำหนดการตรวจ',      icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>` },
    { key: 'employees',    label: 'ข้อมูลพนักงาน',     icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>` },
    { key: 'organization', label: 'โครงสร้างองค์กร',   icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>`, badge: 'NEW' },
    { key: 'permissions',  label: 'สิทธิ์การใช้งาน',   icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`, badge: 'NEW' },
    { key: 'master',       label: 'Master Data',       icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/></svg>` },
    { key: 'health',       label: 'System Health',     icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>` },
    { key: 'audit',        label: 'Audit Log',         icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>` },
];

// =============================================================================
// ENTRY POINT
// =============================================================================
export async function loadAdminPage() {
    const container = document.getElementById('admin-page');
    if (!container) return;

    // Tab buttons — underline style ใช้ใน tab bar ใต้ hero
    const tabHtml = TABS.map(t => `
        <button id="tab-btn-${t.key}" onclick="window._adminTab('${t.key}')"
            class="flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            ${t.icon}${t.label}
            ${t.badge ? `<span class="ml-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-400/80 text-white leading-none">${t.badge}</span>` : ''}
        </button>`).join('');

    container.innerHTML = `
    <div class="animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <!-- dot pattern -->
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="adm-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#adm-dots)"/></svg>
            </div>
            <!-- glow orb -->
            <div class="absolute -right-16 -top-16 w-72 h-72 rounded-full opacity-10 pointer-events-none" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 max-w-7xl mx-auto px-6 pt-6">
                <!-- Title row -->
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                Admin Control Center
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">System Console</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">ศูนย์ควบคุมระบบ · องค์กร · สิทธิ์การใช้งาน</p>
                    </div>
                    <!-- Stats strip — filled by STEP 2 -->
                    <div id="admin-hero-stats" class="grid grid-cols-3 md:grid-cols-3 gap-3 w-full md:w-auto"></div>
                </div>

                <!-- Tab bar — sits at bottom of hero -->
                <div class="mt-5 flex overflow-x-auto gap-0 -mb-px scrollbar-none">
                    ${tabHtml}
                </div>
            </div>
        </div>

        <!-- Content area -->
        <div class="max-w-7xl mx-auto px-6 pt-6">
            <div id="admin-content-area" class="relative min-h-[500px]"></div>
        </div>

    </div>`;

    // Expose globals — including modal helpers for inline onclick handlers in HTML strings
    window.closeModal          = closeModal;
    window._adminTab           = switchTab;
    window.switchAdminTab      = switchTab;
    window.addMasterData       = addMasterData;
    window.deleteMasterData    = deleteMasterData;
    window.editMasterData      = editMasterData;
    window.deleteSchedule      = deleteSchedule;
    window.filterEmployeesInTeam = filterEmployeesInTeam;
    window.updateSelectedCount = updateSelectedCount;
    window.loadSchedules       = loadSchedules;
    window.toggleViewMode      = toggleViewMode;

    switchTab(_currentTab);
    _loadHeroStats();   // async — fills stats strip without blocking tab render
}

// ─── Hero Stats Strip ──────────────────────────────────────────────────────────
async function _loadHeroStats() {
    const strip = document.getElementById('admin-hero-stats');
    if (!strip) return;

    // Placeholder skeleton while fetching
    strip.innerHTML = [1,2,3].map(() => `
        <div class="rounded-xl px-4 py-3 text-center animate-pulse" style="background:rgba(255,255,255,0.12);min-width:90px">
            <div class="h-7 bg-white/20 rounded-lg mb-1.5 mx-auto w-12"></div>
            <div class="h-3 bg-white/15 rounded w-16 mx-auto"></div>
        </div>`).join('');

    try {
        const [dashRes, deptRes] = await Promise.all([
            API.get('/admin/dashboard-stats').catch(() => ({ data: {} })),
            API.get('/master/departments').catch(() => ({ data: [] })),
        ]);
        const d         = dashRes.data || {};
        const depts     = deptRes.data || [];
        const scDepts   = depts.filter(dep => dep.is_safety_core == 1).length;

        const stats = [
            { value: d.totalEmployees   ?? '—', label: 'พนักงานทั้งหมด',    color: '#6ee7b7' },
            { value: scDepts || 10,             label: 'Safety Core Dept', color: '#6ee7b7' },
            { value: d.openHiyari       ?? '—', label: 'Hiyari เปิดอยู่',  color: d.openHiyari > 0 ? '#fca5a5' : '#6ee7b7' },
        ];

        strip.innerHTML = stats.map(s => `
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:90px">
                <p class="text-2xl font-bold" style="color:${s.color}">${s.value}</p>
                <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${s.label}</p>
            </div>`).join('');
    } catch {
        strip.innerHTML = ''; // silent fail — hero still looks fine without stats
    }
}

function switchTab(key) {
    _currentTab = key;
    // Underline-style tab classes — active: white underline + white text; inactive: ghost
    const active   = 'flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white';
    const inactive = 'flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';
    TABS.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t.key}`);
        if (!btn) return;
        const badgeHtml = t.badge
            ? `<span class="ml-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-400/80 text-white leading-none">${t.badge}</span>`
            : '';
        btn.className = t.key === key ? active : inactive;
        btn.innerHTML = `${t.icon}${t.label}${badgeHtml}`;
    });

    const area = document.getElementById('admin-content-area');
    if (!area) return;
    area.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 text-slate-400">
            <div class="inline-block animate-spin rounded-full h-9 w-9 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <p class="text-sm">กำลังโหลด...</p>
        </div>`;

    if      (key === 'dashboard')    renderDashboard(area);
    else if (key === 'scheduler')    renderScheduler(area);
    else if (key === 'employees')    renderEmployeesTab(area);
    else if (key === 'organization') renderOrganization(area);
    else if (key === 'permissions')  renderPermissions(area);
    else if (key === 'master')       renderMasterData(area);
    else if (key === 'health')       renderSystemHealth(area);
    else if (key === 'audit')        renderAuditLog(area);
}

// =============================================================================
// TAB: ORGANIZATION
// =============================================================================
async function renderOrganization(container) {
    // Reset pagination on fresh load
    _orgPage = 1;

    // Skeleton layout — shows immediately while fetching
    container.innerHTML = `
    <div class="animate-fade-in space-y-5">

        <!-- Stats Cards -->
        <div id="org-stats-row" class="grid grid-cols-2 md:grid-cols-4 gap-4">
            ${[1,2,3,4].map(() => `
            <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm animate-pulse">
                <div class="h-8 bg-slate-100 rounded-lg w-12 mb-2"></div>
                <div class="h-3 bg-slate-100 rounded w-20"></div>
            </div>`).join('')}
        </div>

        <!-- Filter Bar -->
        <div class="card p-4 flex flex-wrap gap-3 items-center">
            <!-- Search -->
            <div class="relative flex-1 min-w-[200px]">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
                </svg>
                <input id="org-search" type="text" placeholder="ค้นหาชื่อแผนก..."
                    value="${_orgSearch}"
                    class="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    oninput="window._orgFilter()">
            </div>
            <!-- Type filter -->
            <div class="flex bg-slate-100 p-1 rounded-lg gap-0.5 flex-shrink-0">
                ${[
                    { v: 'all',     label: 'ทั้งหมด'          },
                    { v: 'safety',  label: 'Safety Core'      },
                    { v: 'general', label: 'หน่วยงานทั่วไป'   },
                ].map(o => `
                <button onclick="window._orgSetFilter('${o.v}')"
                    id="org-type-${o.v}"
                    class="px-3 py-1.5 rounded-md text-xs font-semibold transition-all
                        ${_orgFilter === o.v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}">
                    ${o.label}
                </button>`).join('')}
            </div>
            <!-- Clear -->
            <span id="org-clear-wrap" class="${_orgSearch || _orgFilter !== 'all' ? '' : 'hidden'}">
                <button onclick="window._orgClearFilter()"
                    class="text-xs text-slate-500 underline hover:text-slate-700">ล้างตัวกรอง</button>
            </span>
            <!-- Count badge -->
            <span id="org-count" class="text-xs text-slate-400 ml-auto"></span>
            <!-- Add dept button (admin only) -->
            ${TSHSession.getUser()?.role === 'Admin' || TSHSession.getUser()?.Role === 'Admin' ? `
            <button onclick="window._orgAddDept()"
                class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-sm"
                style="background:linear-gradient(135deg,#065f46,#0d9488)">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
                เพิ่มแผนก
            </button>` : ''}
        </div>

        <!-- Table -->
        <div class="card overflow-hidden">
            <div id="org-table-wrap">
                <div class="flex items-center justify-center py-16 text-slate-400">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
                </div>
            </div>
        </div>

        <!-- Pagination -->
        <div id="org-pagination" class="flex justify-center gap-1"></div>

    </div>`;

    // Expose filter handlers
    window._orgFilter      = _orgApplyFilter;
    window._orgSetFilter   = _orgSetTypeFilter;
    window._orgClearFilter = _orgClearFilter;

    // Fetch data then render
    await _orgFetchAll();

    if (_orgFetchError) {
        const wrap = document.getElementById('org-table-wrap');
        if (wrap) wrap.innerHTML = `
        <div class="text-center py-16 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <p class="font-semibold text-slate-600">โหลดข้อมูลไม่สำเร็จ</p>
            <p class="text-sm mt-1">ไม่สามารถเชื่อมต่อกับ API ได้</p>
            <button onclick="window._adminTab('organization')"
                class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm"
                style="background:linear-gradient(135deg,#065f46,#0d9488)">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                ลองใหม่
            </button>
        </div>`;
        // Fill stats with zeros on error
        const statsEl = document.getElementById('org-stats-row');
        if (statsEl) statsEl.innerHTML = [
            { value: 0, label: 'แผนกทั้งหมด' },
            { value: 0, label: 'Safety Core' },
            { value: 0, label: 'หน่วยงานทั่วไป' },
            { value: 0, label: 'Safety Units' },
        ].map(c => `
            <div class="bg-white rounded-xl p-4 border border-red-100 shadow-sm flex items-center gap-3 opacity-50">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-50">
                    <svg class="w-5 h-5 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01"/>
                    </svg>
                </div>
                <div>
                    <p class="text-2xl font-bold text-slate-300">${c.value}</p>
                    <p class="text-xs text-slate-400">${c.label}</p>
                </div>
            </div>`).join('');
        return;
    }

    _orgRenderStats();
    _orgRenderTable();
}

// ─── Fetch ─────────────────────────────────────────────────────────────────────
async function _orgFetchAll() {
    try {
        const [dRes, uRes] = await Promise.all([
            API.get('/admin/org/departments').catch(() => API.get('/master/departments')),
            API.get('/admin/org/units').catch(() => ({ data: [] })),
        ]);
        _orgDepts      = dRes.data || [];
        _orgUnits      = uRes.data || [];
        _orgFetchError = false;
    } catch {
        _orgDepts      = [];
        _orgUnits      = [];
        _orgFetchError = true;
    }
}

// ─── Stats Cards ───────────────────────────────────────────────────────────────
function _orgRenderStats() {
    const el = document.getElementById('org-stats-row');
    if (!el) return;

    const total   = _orgDepts.length;
    const safety  = _orgDepts.filter(d => d.is_safety_core == 1).length;
    const general = total - safety;
    const units   = _orgUnits.length;

    const cards = [
        { value: total,   label: 'แผนกทั้งหมด',     icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>`, bg: 'bg-slate-100', txt: 'text-slate-500' },
        { value: safety,  label: 'Safety Core',     icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>`, bg: 'bg-emerald-50', txt: 'text-emerald-500' },
        { value: general, label: 'หน่วยงานทั่วไป',  icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>`, bg: 'bg-sky-50', txt: 'text-sky-500' },
        { value: units,   label: 'Safety Units',    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>`, bg: 'bg-violet-50', txt: 'text-violet-500' },
    ];

    el.innerHTML = cards.map(c => `
        <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.bg}">
                <svg class="w-5 h-5 ${c.txt}" fill="none" viewBox="0 0 24 24" stroke="currentColor">${c.icon}</svg>
            </div>
            <div>
                <p class="text-2xl font-bold text-slate-800">${c.value}</p>
                <p class="text-xs text-slate-500">${c.label}</p>
            </div>
        </div>`).join('');
}

// ─── Filter helpers ────────────────────────────────────────────────────────────
function _orgGetFiltered() {
    return _orgDepts.filter(d => {
        if (_orgSearch && !d.Name.toLowerCase().includes(_orgSearch.toLowerCase())) return false;
        if (_orgFilter === 'safety'  && d.is_safety_core != 1) return false;
        if (_orgFilter === 'general' && d.is_safety_core == 1) return false;
        return true;
    });
}

function _orgApplyFilter() {
    _orgSearch = document.getElementById('org-search')?.value || '';
    _orgPage   = 1;
    _orgRenderTable();
    _orgUpdateClearBtn();
}

function _orgSetTypeFilter(v) {
    _orgFilter = v;
    _orgPage   = 1;
    // Update pill button styles
    ['all','safety','general'].forEach(k => {
        const btn = document.getElementById(`org-type-${k}`);
        if (!btn) return;
        btn.className = `px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            k === v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
        }`;
    });
    _orgRenderTable();
    _orgUpdateClearBtn();
}

function _orgClearFilter() {
    _orgSearch = '';
    _orgFilter = 'all';
    _orgPage   = 1;
    const inp = document.getElementById('org-search');
    if (inp) inp.value = '';
    _orgSetTypeFilter('all');
    _orgRenderTable();
    _orgUpdateClearBtn();
}

function _orgUpdateClearBtn() {
    const wrap = document.getElementById('org-clear-wrap');
    if (wrap) wrap.className = (_orgSearch || _orgFilter !== 'all') ? '' : 'hidden';
}

window._orgGotoPage = function(p) {
    _orgPage = p;
    _orgRenderTable();
    document.getElementById('org-table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ─── Table + Pagination — implemented in STEP 4 ────────────────────────────────
function _orgRenderTable() {
    const wrap = document.getElementById('org-table-wrap');
    if (!wrap) return;
    const filtered = _orgGetFiltered();
    const total    = filtered.length;
    const pages    = Math.ceil(total / ORG_PER_PAGE) || 1;
    _orgPage       = Math.min(_orgPage, pages);
    const slice    = filtered.slice((_orgPage - 1) * ORG_PER_PAGE, _orgPage * ORG_PER_PAGE);

    // Count badge
    const countEl = document.getElementById('org-count');
    if (countEl) countEl.textContent = `แสดง ${total} / ${_orgDepts.length} แผนก`;

    // Empty state
    if (slice.length === 0) {
        wrap.innerHTML = `
        <div class="text-center py-16 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
            </div>
            <p class="font-medium text-slate-500">ไม่พบแผนก</p>
            <p class="text-sm mt-1">ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p>
        </div>`;
        document.getElementById('org-pagination').innerHTML = '';
        return;
    }

    // Table — full implementation added in STEP 4
    const isAdmin = TSHSession.getUser()?.role === 'Admin' || TSHSession.getUser()?.Role === 'Admin';
    const rows = slice.map(d => {
        const isSafety  = d.is_safety_core == 1;
        const unitCount = _orgUnits.filter(u => u.department_id === d.id).length;
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
            <td class="px-4 py-3 text-sm font-semibold text-slate-800">${d.Name}</td>
            <td class="px-4 py-3">
                ${isSafety
                    ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                           <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>Safety Core
                       </span>`
                    : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                           <span class="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block"></span>ทั่วไป
                       </span>`}
            </td>
            <td class="px-4 py-3 text-center">
                ${isSafety
                    ? `<button onclick="window._orgViewUnits(${d.id},'${d.Name.replace(/'/g,"\\'")}')"
                           class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors">
                           <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
                           ${unitCount} unit${unitCount !== 1 ? 's' : ''}
                       </button>`
                    : `<span class="text-xs text-slate-300">—</span>`}
            </td>
            ${isAdmin ? `
            <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                    <button onclick="window._orgEditDept(${d.id},'${d.Name.replace(/'/g,"\\'")}',${isSafety ? 1 : 0})"
                        class="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="แก้ไข">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                </div>
            </td>` : ''}
        </tr>`;
    }).join('');

    wrap.innerHTML = `
    <table class="w-full text-left border-collapse">
        <thead>
            <tr class="bg-slate-50 border-b-2 border-slate-200">
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ชื่อแผนก / Section</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ประเภท</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Safety Units</th>
                ${isAdmin ? `<th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">จัดการ</th>` : ''}
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;

    // Pagination
    _orgRenderPagination(pages);
}

function _orgRenderPagination(pages) {
    const el = document.getElementById('org-pagination');
    if (!el || pages <= 1) { if (el) el.innerHTML = ''; return; }
    const btnBase = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors';
    el.innerHTML = Array.from({ length: pages }, (_, i) => i + 1).map(p =>
        `<button onclick="window._orgGotoPage(${p})"
             class="${btnBase} ${p === _orgPage
                 ? 'bg-emerald-600 text-white shadow-sm'
                 : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}">${p}</button>`
    ).join('');
}

// ─── Modal: Add Department ─────────────────────────────────────────────────────
window._orgAddDept = function() {
    openModal('เพิ่มแผนกใหม่', `
    <form id="org-dept-form" class="space-y-4">
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                ชื่อแผนก / Section <span class="text-red-500">*</span>
            </label>
            <input name="Name" type="text" required
                placeholder="เช่น QUALITY CONTROL SEC."
                class="form-input w-full">
        </div>
        <div class="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
            <input name="is_safety_core" type="checkbox" id="chk-safety-core"
                class="w-4 h-4 mt-0.5 text-emerald-600 rounded flex-shrink-0">
            <div>
                <label for="chk-safety-core" class="text-sm font-semibold text-slate-700 cursor-pointer">
                    Safety Core Department
                </label>
                <p class="text-xs text-slate-400 mt-0.5">
                    แผนกนี้ต้องทำ Safety Core Activity และมี Safety Units
                </p>
            </div>
        </div>
        <div id="org-dept-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()"
                class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">เพิ่มแผนก</button>
        </div>
    </form>`, 'max-w-md');

    setTimeout(() => {
        document.getElementById('org-dept-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd   = new FormData(e.target);
            const body = {
                Name:           fd.get('Name')?.toString().trim(),
                is_safety_core: fd.get('is_safety_core') ? 1 : 0,
            };
            const errEl = document.getElementById('org-dept-err');
            try {
                await API.post('/master/departments', { Name: body.Name });
                // If safety core — update the flag immediately after creation
                if (body.is_safety_core) {
                    const dRes = await API.get('/admin/org/departments');
                    const created = (dRes.data || []).find(d => d.Name === body.Name);
                    if (created) await API.put(`/admin/org/departments/${created.id}`, body);
                }
                closeModal();
                showToast('เพิ่มแผนกสำเร็จ', 'success');
                await _orgFetchAll();
                _orgRenderStats();
                _orgRenderTable();
            } catch (err) {
                if (errEl) { errEl.textContent = err.message || 'เกิดข้อผิดพลาด'; errEl.classList.remove('hidden'); }
            }
        });
    }, 50);
};

// ─── Modal: Edit Department ────────────────────────────────────────────────────
window._orgEditDept = function(id, name, isSafety) {
    openModal(`แก้ไขแผนก — ${name}`, `
    <form id="org-edit-dept-form" class="space-y-4">
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อแผนก <span class="text-red-500">*</span></label>
            <input name="Name" type="text" required value="${name.replace(/"/g,'&quot;')}"
                class="form-input w-full">
        </div>
        <div class="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
            <input name="is_safety_core" type="checkbox" id="chk-edit-safety"
                ${isSafety ? 'checked' : ''}
                class="w-4 h-4 mt-0.5 text-emerald-600 rounded flex-shrink-0">
            <div>
                <label for="chk-edit-safety" class="text-sm font-semibold text-slate-700 cursor-pointer">
                    Safety Core Department
                </label>
                <p class="text-xs text-slate-400 mt-0.5">
                    เปิด/ปิดการเป็น Safety Core และการมี Safety Units
                </p>
            </div>
        </div>
        <div id="org-edit-dept-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()"
                class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-md');

    setTimeout(() => {
        document.getElementById('org-edit-dept-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd   = new FormData(e.target);
            const body = {
                Name:           fd.get('Name')?.toString().trim(),
                is_safety_core: fd.get('is_safety_core') ? 1 : 0,
            };
            const errEl = document.getElementById('org-edit-dept-err');
            try {
                await API.put(`/admin/org/departments/${id}`, body);
                closeModal();
                showToast('บันทึกข้อมูลแผนกสำเร็จ', 'success');
                await _orgFetchAll();
                _orgRenderStats();
                _orgRenderTable();
                _loadHeroStats();   // refresh hero strip ด้วย
            } catch (err) {
                if (errEl) { errEl.textContent = err.message || 'เกิดข้อผิดพลาด'; errEl.classList.remove('hidden'); }
            }
        });
    }, 50);
};

// ─── Modal: View/Manage Safety Units ──────────────────────────────────────────
window._orgViewUnits = async function(deptId, deptName) {
    openModal(`Safety Units — ${deptName}`, `
    <div id="unit-modal-body" class="space-y-4">
        <div class="flex items-center justify-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
        </div>
    </div>`, 'max-w-lg');

    const isAdmin = TSHSession.getUser()?.role === 'Admin' || TSHSession.getUser()?.Role === 'Admin';

    async function reloadUnits() {
        const res  = await API.get(`/admin/org/units/${deptId}`);
        const list = res.data || [];
        const body = document.getElementById('unit-modal-body');
        if (!body) return;

        const unitRows = list.length === 0
            ? `<div class="text-center py-8 text-slate-400 text-sm">ยังไม่มี Safety Unit</div>`
            : list.map(u => `
            <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-violet-100">
                    <svg class="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/>
                    </svg>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-slate-800">${u.name}</p>
                    ${u.short_code ? `<p class="text-xs text-slate-400">${u.short_code}</p>` : ''}
                </div>
                ${isAdmin ? `
                <div class="flex gap-1 flex-shrink-0">
                    <button onclick="window._orgEditUnit(${u.id},'${u.name.replace(/'/g,"\\'")}','${(u.short_code||'').replace(/'/g,"\\'")}',${deptId},'${deptName.replace(/'/g,"\\'")}');"
                        class="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button onclick="window._orgDeleteUnit(${u.id},'${u.name.replace(/'/g,"\\'")}',${deptId},'${deptName.replace(/'/g,"\\'")}');"
                        class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>` : ''}
            </div>`).join('');

        body.innerHTML = `
        <div class="space-y-2">${unitRows}</div>
        ${isAdmin ? `
        <div class="border-t border-slate-100 pt-4">
            <form id="unit-add-form" class="flex gap-2 items-end">
                <div class="flex-1">
                    <label class="block text-xs font-semibold text-slate-600 mb-1">ชื่อ Unit <span class="text-red-500">*</span></label>
                    <input name="name" type="text" required placeholder="เช่น PD1 Assy 3/1"
                        class="form-input w-full text-sm">
                </div>
                <div class="w-28">
                    <label class="block text-xs font-semibold text-slate-600 mb-1">Short Code</label>
                    <input name="short_code" type="text" placeholder="เช่น PD1A31"
                        class="form-input w-full text-sm">
                </div>
                <button type="submit"
                    class="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all"
                    style="background:linear-gradient(135deg,#065f46,#0d9488)">
                    เพิ่ม
                </button>
            </form>
            <div id="unit-add-err" class="text-xs text-red-500 mt-1 hidden"></div>
        </div>` : ''}
        <div class="flex justify-end pt-2 border-t border-slate-100">
            <button onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5 text-sm">ปิด</button>
        </div>`;

        // Add unit form handler
        document.getElementById('unit-add-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd  = new FormData(e.target);
            const err = document.getElementById('unit-add-err');
            try {
                await API.post('/admin/org/units', {
                    name:          fd.get('name')?.toString().trim(),
                    short_code:    fd.get('short_code')?.toString().trim(),
                    department_id: deptId,
                });
                showToast('เพิ่ม Safety Unit สำเร็จ', 'success');
                e.target.reset();
                await reloadUnits();
                await _orgFetchAll();
                _orgRenderStats();
                _orgRenderTable();
            } catch (ex) {
                if (err) { err.textContent = ex.message || 'เกิดข้อผิดพลาด'; err.classList.remove('hidden'); }
            }
        });
    }

    await reloadUnits();
};

window._orgEditUnit = function(id, name, shortCode, deptId, deptName) {
    openModal(`แก้ไข Unit — ${name}`, `
    <form id="unit-edit-form" class="space-y-4">
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อ Unit <span class="text-red-500">*</span></label>
            <input name="name" type="text" required value="${name.replace(/"/g,'&quot;')}" class="form-input w-full">
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">Short Code</label>
            <input name="short_code" type="text" value="${shortCode.replace(/"/g,'&quot;')}" class="form-input w-full">
        </div>
        <div id="unit-edit-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window._orgViewUnits(${deptId},'${deptName.replace(/'/g,"\\'")}');"
                class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-sm');

    setTimeout(() => {
        document.getElementById('unit-edit-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd  = new FormData(e.target);
            const err = document.getElementById('unit-edit-err');
            try {
                await API.put(`/admin/org/units/${id}`, {
                    name:       fd.get('name')?.toString().trim(),
                    short_code: fd.get('short_code')?.toString().trim(),
                });
                showToast('บันทึกสำเร็จ', 'success');
                await window._orgViewUnits(deptId, deptName);
                await _orgFetchAll();
                _orgRenderTable();
            } catch (ex) {
                if (err) { err.textContent = ex.message || 'เกิดข้อผิดพลาด'; err.classList.remove('hidden'); }
            }
        });
    }, 50);
};

window._orgDeleteUnit = async function(id, name, deptId, deptName) {
    if (!confirm(`ลบ Unit "${name}"?`)) return;
    try {
        await API.delete(`/admin/org/units/${id}`);
        showToast('ลบ Unit สำเร็จ', 'success');
        await window._orgViewUnits(deptId, deptName);
        await _orgFetchAll();
        _orgRenderStats();
        _orgRenderTable();
    } catch (err) {
        showError(err.message || 'เกิดข้อผิดพลาด');
    }
};

// =============================================================================
// TAB: PERMISSIONS — Role × Permission matrix
// =============================================================================

// Permission display labels
const PERM_LABELS = {
    VIEW_DASHBOARD: { label: 'ดู Dashboard',    desc: 'เข้าถึงหน้าภาพรวมระบบ',        color: 'sky'     },
    MANAGE_USERS:   { label: 'จัดการ Users',    desc: 'เพิ่ม/แก้ไข/ลบพนักงาน',       color: 'rose'    },
    VIEW_REPORT:    { label: 'ดูรายงาน',        desc: 'ดาวน์โหลดและดูรายงานทั้งหมด',  color: 'indigo'  },
    APPROVE_SAFETY: { label: 'อนุมัติ Safety',  desc: 'อนุมัติกิจกรรมความปลอดภัย',    color: 'emerald' },
    SUBMIT_SAFETY:  { label: 'บันทึก Safety',   desc: 'บันทึก/ส่งข้อมูลความปลอดภัย',  color: 'amber'   },
};

async function renderPermissions(container) {
    container.innerHTML = `
    <div class="animate-fade-in space-y-5">
        <div class="flex items-center justify-between">
            <div>
                <h2 class="text-base font-bold text-slate-800">Permission Matrix</h2>
                <p class="text-xs text-slate-400 mt-0.5">คลิกช่องตาราง เพื่อเปิด/ปิด permission ของแต่ละ role</p>
            </div>
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                Admin only
            </span>
        </div>

        <!-- Matrix card -->
        <div class="card overflow-hidden">
            <div id="perm-matrix-wrap" class="overflow-x-auto">
                <div class="flex items-center justify-center py-16">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
                </div>
            </div>
        </div>

        <!-- Legend -->
        <div class="flex flex-wrap gap-4 text-xs text-slate-500">
            <span class="flex items-center gap-1.5">
                <span class="w-5 h-5 rounded-lg bg-emerald-500 flex items-center justify-center">
                    <svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                </span>
                อนุญาต (Granted)
            </span>
            <span class="flex items-center gap-1.5">
                <span class="w-5 h-5 rounded-lg bg-slate-200 flex items-center justify-center">
                    <svg class="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
                </span>
                ไม่อนุญาต (Denied)
            </span>
            <span class="flex items-center gap-1.5 ml-auto text-slate-400 italic">
                * ADMIN role ไม่สามารถลดสิทธิ์ได้
            </span>
        </div>
    </div>`;

    await _permLoadMatrix();
}

async function _permLoadMatrix() {
    const wrap = document.getElementById('perm-matrix-wrap');
    if (!wrap) return;

    try {
        const res  = await API.get('/admin/permissions/matrix');
        const { matrix, roles, permissions, roleLabels } = res.data;

        const ROLE_COLORS = {
            ADMIN:          { header: 'bg-slate-800 text-white',            pill: 'bg-slate-100 text-slate-700'     },
            EXECUTIVE:      { header: 'bg-indigo-600 text-white',           pill: 'bg-indigo-50 text-indigo-700'    },
            MANAGER:        { header: 'bg-sky-600 text-white',              pill: 'bg-sky-50 text-sky-700'          },
            STAFF:          { header: 'bg-slate-500 text-white',            pill: 'bg-slate-100 text-slate-600'     },
            SAFETY_OFFICER: { header: 'bg-emerald-600 text-white',          pill: 'bg-emerald-50 text-emerald-700'  },
        };

        const headerCells = roles.map(r => {
            const rc = ROLE_COLORS[r] || { header: 'bg-slate-600 text-white' };
            return `<th class="px-4 py-3 text-center min-w-[110px]">
                <span class="inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold ${rc.header}">
                    ${roleLabels[r] || r}
                </span>
            </th>`;
        }).join('');

        const bodyRows = permissions.map(p => {
            const pm = PERM_LABELS[p] || { label: p, desc: '', color: 'slate' };
            const cells = roles.map(r => {
                const granted  = matrix[r]?.[p] ? 1 : 0;
                const isAdmin  = r === 'ADMIN';
                const cellId   = `perm-${r}-${p}`;
                return `<td class="px-4 py-4 text-center">
                    <button id="${cellId}"
                        onclick="${isAdmin ? '' : `window._permToggle('${r}','${p}',${granted ? 0 : 1})`}"
                        class="w-8 h-8 rounded-lg inline-flex items-center justify-center transition-all
                            ${granted
                                ? 'bg-emerald-500 hover:bg-emerald-600 shadow-sm shadow-emerald-200'
                                : 'bg-slate-200 hover:bg-slate-300'}
                            ${isAdmin ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}"
                        ${isAdmin ? 'title="ADMIN ไม่สามารถลดสิทธิ์ได้"' : `title="${granted ? 'คลิกเพื่อปิด' : 'คลิกเพื่อเปิด'}"`}>
                        ${granted
                            ? `<svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>`
                            : `<svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>`}
                    </button>
                </td>`;
            }).join('');

            return `<tr class="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                <td class="px-5 py-4 min-w-[200px]">
                    <p class="text-sm font-semibold text-slate-800">${pm.label}</p>
                    <p class="text-xs text-slate-400 mt-0.5">${pm.desc}</p>
                </td>
                ${cells}
            </tr>`;
        }).join('');

        wrap.innerHTML = `
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="bg-slate-50 border-b-2 border-slate-200">
                    <th class="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Permission</th>
                    ${headerCells}
                </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
        </table>`;

    } catch (err) {
        wrap.innerHTML = `
        <div class="text-center py-16 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <p class="font-semibold text-slate-600">โหลด Permission Matrix ไม่สำเร็จ</p>
            <p class="text-sm mt-1 text-slate-400">${err.message || 'ไม่สามารถเชื่อมต่อกับ API ได้'}</p>
            <button onclick="window._adminTab('permissions')"
                class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm"
                style="background:linear-gradient(135deg,#065f46,#0d9488)">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                ลองใหม่
            </button>
        </div>`;
    }
}

window._permToggle = async function(role, permission, granted) {
    // Optimistic UI — flip the button immediately
    const btn = document.getElementById(`perm-${role}-${permission}`);
    if (btn) btn.style.opacity = '0.5';

    try {
        await API.put('/admin/permissions/matrix', { role, permission, granted });
        showToast(`${granted ? 'เปิด' : 'ปิด'} ${PERM_LABELS[permission]?.label || permission} สำหรับ ${role}`, 'success');
        await _permLoadMatrix();   // re-render matrix with fresh data
    } catch (err) {
        if (btn) btn.style.opacity = '1';
        showError(err.message || 'เกิดข้อผิดพลาด');
    }
};

// =============================================================================
// TAB: DASHBOARD
// =============================================================================
async function renderDashboard(container) {
    try {
        const res = await API.get('/admin/dashboard-stats');
        const d   = res.data || {};

        const cards = [
            { label: 'พนักงานทั้งหมด',     value: d.totalEmployees    ?? '—', color: 'indigo',  icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>` },
            { label: 'กำหนดการตรวจ/เดือน', value: d.schedulesThisMonth ?? '—', color: 'sky',     icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>` },
            { label: 'เวรที่ยังรอ',          value: d.pendingSchedules   ?? '—', color: 'amber',   icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
            { label: 'Hiyari ยังไม่ปิด',   value: d.openHiyari         ?? '—', color: 'rose',    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>` },
            { label: 'KY กิจกรรม/เดือน',  value: d.kyThisMonth        ?? '—', color: 'emerald', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
            { label: 'Change Notice Open', value: d.openChangeNotices  ?? '—', color: 'orange',  icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>` },
        ];

        const colorMap = {
            indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
            sky:    'bg-sky-50 text-sky-700 border-sky-100',
            amber:  'bg-amber-50 text-amber-700 border-amber-100',
            rose:   'bg-rose-50 text-rose-700 border-rose-100',
            emerald:'bg-emerald-50 text-emerald-700 border-emerald-100',
            orange: 'bg-orange-50 text-orange-700 border-orange-100',
        };

        const deptRows = (d.deptBreakdown || []).map(r => {
            const max  = d.deptBreakdown[0]?.cnt || 1;
            const pct  = Math.round((r.cnt / max) * 100);
            return `<div class="flex items-center gap-2 text-sm">
                <span class="w-28 truncate text-slate-600 text-xs">${r.Department || '—'}</span>
                <div class="flex-1 bg-slate-100 rounded-full h-2">
                    <div class="bg-indigo-500 h-2 rounded-full" style="width:${pct}%"></div>
                </div>
                <span class="w-6 text-right text-xs font-bold text-slate-500">${r.cnt}</span>
            </div>`;
        }).join('');

        const actionLabel = {
            CREATE_EMPLOYEE: 'เพิ่มพนักงาน', DELETE_EMPLOYEE: 'ลบพนักงาน',
            UPDATE_EMPLOYEE: 'แก้ไขพนักงาน', RESET_PASSWORD: 'รีเซ็ตรหัสผ่าน',
            IMPORT_EMPLOYEES: 'Import พนักงาน', CREATE_SCHEDULE: 'สร้างตารางเวร',
            BULK_CREATE_SCHEDULE: 'Bulk ตารางเวร', DELETE_SCHEDULE: 'ลบตารางเวร',
        };
        const recentRows = (d.recentAudit || []).map(a => `
            <div class="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono whitespace-nowrap">${a.Action}</span>
                <span class="text-xs text-slate-700 flex-1 truncate">${actionLabel[a.Action] || a.Action} — ${a.Detail || ''}</span>
                <span class="text-[10px] text-slate-400 whitespace-nowrap">${new Date(a.ActionTime).toLocaleTimeString('th-TH', {hour:'2-digit',minute:'2-digit'})}</span>
            </div>`).join('') || '<div class="text-xs text-slate-400 py-4 text-center">ยังไม่มีกิจกรรม</div>';

        container.innerHTML = `
        <div class="animate-fade-in space-y-6">
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                ${cards.map(c => `
                <div class="bg-white rounded-xl border ${colorMap[c.color].split(' ')[2]} shadow-sm p-4 flex flex-col gap-2">
                    <div class="p-2 ${colorMap[c.color].split(' ').slice(0,2).join(' ')} rounded-lg w-fit border ${colorMap[c.color].split(' ')[2]}">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${c.icon}</svg>
                    </div>
                    <div class="text-2xl font-bold text-slate-800">${c.value}</div>
                    <div class="text-xs text-slate-500 leading-tight">${c.label}</div>
                </div>`).join('')}
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 class="font-bold text-slate-700 mb-4 text-sm">พนักงานแยกตามหน่วยงาน</h3>
                    <div class="space-y-2.5">${deptRows || '<div class="text-xs text-slate-400 py-4 text-center">ไม่มีข้อมูล</div>'}</div>
                </div>
                <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-bold text-slate-700 text-sm">กิจกรรม Admin ล่าสุด</h3>
                        <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded">${d.auditToday ?? 0} รายการวันนี้</span>
                    </div>
                    <div>${recentRows}</div>
                    <button onclick="window._adminTab('audit')" class="mt-3 text-xs text-indigo-600 hover:underline">ดูทั้งหมด →</button>
                </div>
            </div>
        </div>`;
    } catch (err) {
        container.innerHTML = `<div class="text-center py-20 text-red-500 text-sm">โหลดข้อมูลไม่ได้: ${err.message}</div>`;
    }
}

// =============================================================================
// TAB: SCHEDULER
// =============================================================================
async function renderScheduler(container) {
    const today = new Date();
    const cm = today.getMonth() + 1;
    const cy = today.getFullYear();
    const monthOpts = Array.from({length:12}, (_,i) => {
        const m = i+1;
        return `<option value="${m}" ${m===cm?'selected':''}>${new Date(0,i).toLocaleString('th-TH',{month:'long'})}</option>`;
    }).join('');
    const yearOpts  = [cy-1,cy,cy+1].map(y=>`<option value="${y}" ${y===cy?'selected':''}>${y}</option>`).join('');

    container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
        <!-- Left panel -->
        <div class="lg:col-span-4 space-y-4">
            <!-- Single date form -->
            <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                <h3 class="font-bold text-slate-800 mb-4 text-sm border-b pb-2 flex items-center gap-2">
                    <svg class="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    สร้างตารางเวร (ทีละวัน)
                </h3>
                <form id="form-scheduler" onsubmit="return false;" class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">วันที่</label>
                        <input type="date" name="ScheduledDate" class="form-input w-full rounded-lg border-slate-300 text-sm" required>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เลือกทีม</label>
                        <div id="team-allocator-container" class="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                            <div class="text-xs text-slate-400 text-center py-4">กำลังโหลด...</div>
                        </div>
                    </div>
                    <button id="btn-save-schedule" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-sm shadow shadow-indigo-200 transition-all">
                        บันทึกตารางเวร
                    </button>
                </form>
            </div>

            <!-- Bulk create form -->
            <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                <h3 class="font-bold text-slate-800 mb-4 text-sm border-b pb-2 flex items-center gap-2">
                    <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    สร้างตารางเวร (หลายวัน)
                </h3>
                <div class="space-y-3 text-sm">
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">วันเริ่ม</label>
                            <input type="date" id="bulk-start" class="form-input w-full rounded-lg border-slate-300 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">วันสิ้นสุด</label>
                            <input type="date" id="bulk-end" class="form-input w-full rounded-lg border-slate-300 text-sm">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">วันในสัปดาห์</label>
                        <div class="flex flex-wrap gap-1.5">
                            ${['อา','จ','อ','พ','พฤ','ศ','ส'].map((d,i)=>`
                            <label class="flex items-center gap-1 text-xs cursor-pointer">
                                <input type="checkbox" class="bulk-dow w-3.5 h-3.5 text-emerald-600 rounded" value="${i}" ${i===1||i===3||i===5?'checked':''}>
                                ${d}
                            </label>`).join('')}
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">ทีม (เลือกได้หลายทีม)</label>
                        <div id="bulk-team-list" class="space-y-1 max-h-32 overflow-y-auto custom-scrollbar text-xs text-slate-400">กำลังโหลด...</div>
                    </div>
                    <div id="bulk-preview" class="hidden bg-slate-50 rounded-lg p-2 text-xs text-slate-600 border border-slate-200"></div>
                    <button id="btn-bulk-preview" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-medium text-xs transition-all">ดูตัวอย่าง</button>
                    <button id="btn-bulk-save" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold text-sm shadow shadow-emerald-200 transition-all hidden">
                        สร้างตารางเวรทั้งหมด
                    </button>
                </div>
            </div>
        </div>

        <!-- Right panel -->
        <div class="lg:col-span-8">
            <div class="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <div class="flex items-center gap-2">
                    <select id="filter-month" onchange="loadSchedules()" class="form-select text-sm border-slate-200 rounded-lg py-1.5 pl-3 pr-8 font-medium text-slate-700 bg-slate-50">${monthOpts}</select>
                    <select id="filter-year"  onchange="loadSchedules()" class="form-select text-sm border-slate-200 rounded-lg py-1.5 pl-3 pr-8 font-medium text-slate-700 bg-slate-50">${yearOpts}</select>
                    <button onclick="window.printScheduleReport()" class="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="พิมพ์รายงาน">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                    </button>
                </div>
                <div class="flex bg-slate-100 p-1 rounded-lg">
                    <button onclick="toggleViewMode('list')" id="btn-view-list" class="px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all bg-white shadow-sm text-slate-800">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg> List
                    </button>
                    <button onclick="toggleViewMode('calendar')" id="btn-view-calendar" class="px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all text-slate-500 hover:text-slate-700">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg> Calendar
                    </button>
                </div>
            </div>
            <div id="scheduler-content-wrapper">
                <div id="list-view-container" class="space-y-3 animate-fade-in">
                    <div class="py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">กำลังโหลด...</div>
                </div>
                <div id="calendar-view-container" class="hidden bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div id="calendar"></div>
                </div>
            </div>
        </div>
    </div>`;

    await Promise.all([loadTeamsAndEmployees(), loadSchedules()]);
    setupSchedulerEvents();
    setupBulkEvents();
}

window.toggleViewMode = (mode) => {
    _viewMode = mode;
    const listC = document.getElementById('list-view-container');
    const calC  = document.getElementById('calendar-view-container');
    const btnL  = document.getElementById('btn-view-list');
    const btnC  = document.getElementById('btn-view-calendar');
    const act   = 'bg-white shadow-sm text-slate-800';
    const inact = 'text-slate-500 hover:text-slate-700';
    if (mode === 'list') {
        listC?.classList.remove('hidden'); calC?.classList.add('hidden');
        if (btnL) btnL.className = `px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${act}`;
        if (btnC) btnC.className = `px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${inact}`;
    } else {
        listC?.classList.add('hidden'); calC?.classList.remove('hidden');
        if (btnL) btnL.className = `px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${inact}`;
        if (btnC) btnC.className = `px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${act}`;
        setTimeout(() => { if (_calInst) _calInst.render(); else loadSchedules(); }, 100);
    }
};

async function loadTeamsAndEmployees() {
    const tc = document.getElementById('team-allocator-container');
    const bl = document.getElementById('bulk-team-list');
    try {
        const [teamsRes, empsRes] = await Promise.all([API.get('/master/teams'), API.get('/employees')]);
        _allEmpCache = empsRes?.data || [];
        const teams  = teamsRes?.data || [];
        if (!tc) return;
        if (teams.length === 0) { tc.innerHTML = `<div class="text-xs text-slate-400 text-center py-4">ไม่มีทีม</div>`; return; }
        tc.innerHTML = teams.map(team => {
            const safe = team.Name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g,'_');
            return `
            <div class="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 team-card" data-team-name="${team.Name}" data-team-id="${safe}">
                <div class="p-2.5 bg-white flex items-center justify-between cursor-pointer" onclick="document.getElementById('body-${safe}').classList.toggle('hidden');">
                    <div class="flex items-center gap-2">
                        <input type="checkbox" class="team-checkbox w-4 h-4 text-indigo-600 rounded" value="${team.Name}" onclick="event.stopPropagation()">
                        <span class="font-semibold text-slate-700 text-xs">${team.Name}</span>
                        <span id="count-badge-${safe}" class="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full hidden">0</span>
                    </div>
                    <svg class="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </div>
                <div id="body-${safe}" class="hidden border-t border-slate-100 bg-white p-2">
                    <input type="text" placeholder="ค้นหา..." class="w-full text-xs border-slate-200 rounded mb-1.5 px-2 py-1" onkeyup="filterEmployeesInTeam(this,'${safe}')">
                    <div class="max-h-32 overflow-y-auto space-y-0.5 custom-scrollbar member-list-${safe}">
                        ${_allEmpCache.map(emp => `
                        <label class="flex items-center gap-2 p-1 hover:bg-slate-50 rounded cursor-pointer">
                            <input type="checkbox" name="members-${safe}" value="${emp.EmployeeID}" class="w-3 h-3 text-indigo-500 rounded" onchange="updateSelectedCount('${safe}')">
                            <span class="text-[11px] truncate">${emp.EmployeeName}</span>
                        </label>`).join('')}
                    </div>
                </div>
            </div>`;
        }).join('');
        // populate bulk team list
        if (bl) bl.innerHTML = teams.map(t => `
            <label class="flex items-center gap-2 p-1 hover:bg-slate-50 rounded cursor-pointer text-xs text-slate-700">
                <input type="checkbox" class="bulk-team-cb w-3.5 h-3.5 text-emerald-600 rounded" value="${t.Name}" checked>
                ${t.Name}
            </label>`).join('');
    } catch { if (tc) tc.innerHTML = `<div class="text-xs text-red-400 text-center py-2">โหลดทีมไม่ได้</div>`; }
}

window.updateSelectedCount = (safe) => {
    const cnt = document.querySelectorAll(`input[name="members-${safe}"]:checked`).length;
    const badge = document.getElementById(`count-badge-${safe}`);
    const cb    = document.querySelector(`.team-card[data-team-id="${safe}"] .team-checkbox`);
    if (badge) { badge.textContent = cnt; cnt > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden'); }
    if (cb && cnt > 0) cb.checked = true;
};
window.filterEmployeesInTeam = (input, safe) => {
    const q = input.value.toLowerCase();
    document.querySelectorAll(`.member-list-${safe} label`).forEach(l => {
        l.style.display = l.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
    });
};

async function loadSchedules() {
    const lc    = document.getElementById('list-view-container');
    const month = document.getElementById('filter-month')?.value;
    const year  = document.getElementById('filter-year')?.value;
    try {
        const res  = await API.get(`/admin/schedules?month=${month}&year=${year}`);
        const data = res?.data || [];
        if (!lc) return;
        if (data.length === 0) {
            lc.innerHTML = `<div class="text-center py-16 text-slate-400 border border-dashed rounded-xl bg-slate-50 text-sm">ไม่มีกำหนดการในเดือนนี้</div>`;
        } else {
            const grouped = data.reduce((acc, cur) => {
                const d = (cur.ScheduledDate||'').split('T')[0];
                if (!acc[d]) acc[d] = [];
                acc[d].push(cur); return acc;
            }, {});
            const statusColor = { Pending:'bg-amber-100 text-amber-700', Completed:'bg-emerald-100 text-emerald-700', Missed:'bg-red-100 text-red-600' };
            lc.innerHTML = Object.entries(grouped).sort((a,b)=>new Date(b[0])-new Date(a[0])).map(([date,items])=>{
                const dObj = new Date(date);
                return `
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div class="flex gap-3 mb-3 border-b pb-2.5">
                        <div class="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-center border border-indigo-100 min-w-[50px]">
                            <div class="text-[10px] font-bold uppercase">${dObj.toLocaleDateString('en-US',{month:'short'})}</div>
                            <div class="text-xl font-bold">${dObj.getDate()}</div>
                        </div>
                        <div>
                            <h4 class="font-bold text-slate-800 text-sm">${dObj.toLocaleDateString('th-TH',{dateStyle:'long'})}</h4>
                            <p class="text-xs text-slate-500">${items.length} ทีม</p>
                        </div>
                    </div>
                    <div class="space-y-1.5">
                        ${items.map(item => {
                            const sc = statusColor[item.Status] || 'bg-slate-100 text-slate-500';
                            return `
                            <div class="bg-slate-50 p-2 rounded-lg border border-slate-100 flex justify-between items-center">
                                <div class="flex items-center gap-2 flex-1 min-w-0">
                                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${sc} shrink-0">${item.Status||'Pending'}</span>
                                    <span class="font-semibold text-xs text-slate-700 truncate">${item.TeamName}</span>
                                </div>
                                <button onclick="deleteSchedule(${item.ScheduleID})" class="text-slate-300 hover:text-red-500 p-1 transition-colors shrink-0">
                                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                </button>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
            }).join('');
        }
        initCalendar(data);
    } catch (err) { console.error(err); }
}

function initCalendar(eventsData) {
    const el = document.getElementById('calendar');
    if (!el || !window.FullCalendar) return;
    const colorMap = { Pending:'#f59e0b', Completed:'#10b981', Missed:'#ef4444' };
    const events = eventsData.map(item => ({
        title: item.TeamName,
        start: (item.ScheduledDate||'').split('T')[0],
        backgroundColor: colorMap[item.Status] || '#6366f1',
        borderColor:     colorMap[item.Status] || '#4f46e5',
        extendedProps: { status: item.Status, id: item.ScheduleID },
    }));
    if (_calInst) { _calInst.destroy(); _calInst = null; }
    _calInst = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        headerToolbar: false,
        initialDate: `${document.getElementById('filter-year')?.value}-${String(document.getElementById('filter-month')?.value||1).padStart(2,'0')}-01`,
        height: 'auto',
        events,
        eventClick: (info) => {
            showToast(`${info.event.title} — ${info.event.extendedProps.status||'Pending'}`, 'info');
        },
    });
    _calInst.render();
}

function setupSchedulerEvents() {
    const btn  = document.getElementById('btn-save-schedule');
    const form = document.getElementById('form-scheduler');
    if (!btn || !form) return;
    const nb = btn.cloneNode(true);
    btn.parentNode.replaceChild(nb, btn);
    nb.onclick = async () => {
        const date = form.querySelector('input[name="ScheduledDate"]')?.value;
        if (!date) { showToast('กรุณาเลือกวันที่', 'error'); return; }
        const teams = [];
        document.querySelectorAll('.team-card').forEach(card => {
            const cb = card.querySelector('.team-checkbox');
            if (cb?.checked) teams.push(cb.value);
        });
        if (teams.length === 0) { showToast('กรุณาเลือกทีมอย่างน้อย 1 ทีม', 'error'); return; }
        const orig = nb.innerHTML;
        nb.disabled = true; nb.textContent = 'กำลังบันทึก...';
        try {
            await API.post('/admin/schedule/create', { ScheduledDate: date, Teams: teams });
            showToast('สร้างตารางเวรสำเร็จ', 'success');
            form.querySelector('input[name="ScheduledDate"]').value = '';
            document.querySelectorAll('.team-checkbox').forEach(c => c.checked = false);
            document.querySelectorAll('[id^="count-badge-"]').forEach(e => e.classList.add('hidden'));
            loadSchedules();
        } catch (err) { showError(err.message); }
        finally { nb.disabled = false; nb.innerHTML = orig; }
    };
}

function setupBulkEvents() {
    let _bulkDates = [];
    document.getElementById('btn-bulk-preview')?.addEventListener('click', () => {
        const start  = document.getElementById('bulk-start')?.value;
        const end    = document.getElementById('bulk-end')?.value;
        const dows   = [...document.querySelectorAll('.bulk-dow:checked')].map(c => +c.value);
        const teams  = [...document.querySelectorAll('.bulk-team-cb:checked')].map(c => c.value);
        if (!start || !end) { showToast('กรุณาเลือกช่วงวันที่', 'error'); return; }
        if (dows.length === 0) { showToast('กรุณาเลือกวันในสัปดาห์', 'error'); return; }
        if (teams.length === 0) { showToast('กรุณาเลือกทีม', 'error'); return; }
        _bulkDates = [];
        const cur = new Date(start);
        const fin = new Date(end);
        while (cur <= fin) {
            if (dows.includes(cur.getDay())) _bulkDates.push(cur.toISOString().split('T')[0]);
            cur.setDate(cur.getDate() + 1);
        }
        const preview = document.getElementById('bulk-preview');
        const saveBtn = document.getElementById('btn-bulk-save');
        if (_bulkDates.length === 0) {
            preview.textContent = 'ไม่มีวันตรงกับเงื่อนไข';
        } else {
            preview.innerHTML = `<strong>${_bulkDates.length} วัน × ${teams.length} ทีม = ${_bulkDates.length * teams.length} รายการ</strong><br>${_bulkDates.slice(0,5).join(', ')}${_bulkDates.length>5?` ... +${_bulkDates.length-5} วัน`:''}`;
            saveBtn?.classList.remove('hidden');
        }
        preview.classList.remove('hidden');
        // store for save btn
        saveBtn._dates = _bulkDates;
        saveBtn._teams = teams;
    });

    document.getElementById('btn-bulk-save')?.addEventListener('click', async function() {
        if (!this._dates?.length) return;
        const orig = this.innerHTML;
        this.disabled = true; this.textContent = 'กำลังสร้าง...';
        try {
            const res = await API.post('/admin/schedule/bulk-create', { dates: this._dates, Teams: this._teams });
            showToast(res.message || 'สร้างตารางเวรสำเร็จ', 'success');
            this.classList.add('hidden');
            document.getElementById('bulk-preview')?.classList.add('hidden');
            loadSchedules();
        } catch (err) { showError(err.message); }
        finally { this.disabled = false; this.innerHTML = orig; }
    });
}

window.deleteSchedule = async (id) => {
    if (!confirm('ลบรายการนี้?')) return;
    try {
        const res = await API.delete(`/admin/schedule/${id}`);
        if (res.success) { showToast('ลบเรียบร้อย', 'success'); loadSchedules(); }
        else showError(res.message);
    } catch (err) { showError(err.message); }
};

window.printScheduleReport = () => {
    const orig = document.title;
    document.title = `Patrol_Schedule_${new Date().toISOString().split('T')[0]}`;
    window.print();
    document.title = orig;
};

// =============================================================================
// TAB: MASTER DATA
// =============================================================================
async function renderMasterData(container) {
    const masterTypes = [
        { key:'departments', title:'Departments', sub:'แผนก', color:'indigo' },
        { key:'teams',       title:'Teams',       sub:'ทีม',  color:'sky'    },
        { key:'positions',   title:'Positions',   sub:'ตำแหน่ง', color:'violet' },
        { key:'roles',       title:'System Roles',sub:'สิทธิ์', color:'rose'  },
    ];
    const icons = {
        departments: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>`,
        teams:       `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>`,
        positions:   `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>`,
        roles:       `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>`,
    };
    const hdr = { indigo:'from-indigo-50 to-white border-indigo-100', sky:'from-sky-50 to-white border-sky-100', violet:'from-violet-50 to-white border-violet-100', rose:'from-rose-50 to-white border-rose-100' };

    container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        ${masterTypes.map(mt => `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[520px]">
            <div class="p-4 bg-gradient-to-b ${hdr[mt.color]} border-b flex justify-between items-center">
                <div class="flex items-center gap-2.5">
                    <div class="p-1.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                        <svg class="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">${icons[mt.key]}</svg>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-800 text-sm">${mt.title}</h3>
                        <p class="text-[10px] text-slate-500">${mt.sub}</p>
                    </div>
                </div>
                <span id="count-${mt.key}" class="text-[10px] font-bold bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-500">0</span>
            </div>
            <div class="p-3 border-b border-slate-100">
                <div class="flex gap-2">
                    <input type="text" id="input-${mt.key}" class="form-input w-full pl-3 py-1.5 rounded-lg text-xs border-slate-300 focus:ring-1 focus:ring-slate-800"
                        placeholder="เพิ่มรายการใหม่..." onkeypress="if(event.key==='Enter') addMasterData('${mt.key}')">
                    <button onclick="addMasterData('${mt.key}')" class="px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors">+</button>
                </div>
            </div>
            <ul id="list-${mt.key}" class="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
                <li class="text-center text-xs text-slate-400 py-10">กำลังโหลด...</li>
            </ul>
        </div>`).join('')}
    </div>`;

    masterTypes.forEach(mt => loadMasterList(mt.key));
}

async function loadMasterList(type) {
    const listEl  = document.getElementById(`list-${type}`);
    const countEl = document.getElementById(`count-${type}`);
    try {
        const res = await API.get(`/master/${type}`);
        if (!res.success) throw new Error(res.message);
        if (countEl) countEl.textContent = res.data.length;
        if (res.data.length === 0) { listEl.innerHTML = `<li class="text-center text-xs text-slate-300 py-10">ยังไม่มีข้อมูล</li>`; return; }
        listEl.innerHTML = res.data.map((item, i) => `
            <li class="group flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                <span class="text-[10px] text-slate-400 w-4 font-mono shrink-0">${i+1}</span>
                <span class="text-xs font-medium text-slate-700 flex-1 truncate">${item.Name}</span>
                <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editMasterData('${type}',${item.id},'${(item.Name||'').replace(/'/g,"\\'")}\")"
                        class="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button onclick="deleteMasterData('${type}',${item.id},'${(item.Name||'').replace(/'/g,"\\'")}\")"
                        class="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
            </li>`).join('');
    } catch { listEl.innerHTML = `<li class="text-center text-red-400 text-xs py-4">โหลดไม่ได้</li>`; }
}

window.addMasterData = async (type) => {
    const input = document.getElementById(`input-${type}`);
    const name  = input?.value.trim();
    if (!name) { showToast('กรุณาระบุชื่อ', 'error'); return; }
    try {
        const res = await API.post(`/master/${type}`, { Name: name });
        if (res.success) { showToast('เพิ่มสำเร็จ', 'success'); input.value = ''; loadMasterList(type); }
        else showError(res.message);
    } catch (err) { showError(err.message); }
};

window.editMasterData = (type, id, currentName) => {
    openModal(`แก้ไข ${type}`, `
        <form id="edit-master-form" class="space-y-4">
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">ชื่อใหม่</label>
                <input type="text" id="edit-master-input" class="form-input w-full rounded-lg text-sm" value="${currentName}" required autofocus>
            </div>
            <div class="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button type="submit" class="btn bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium">บันทึก</button>
            </div>
        </form>`, 'max-w-sm');
    setTimeout(() => {
        document.getElementById('edit-master-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('edit-master-input')?.value.trim();
            if (!name) return;
            try {
                const res = await API.put(`/master/${type}/${id}`, { Name: name });
                if (res.success) { showToast('แก้ไขสำเร็จ', 'success'); closeModal(); loadMasterList(type); }
                else showError(res.message);
            } catch (err) { showError(err.message); }
        });
    }, 50);
};

window.deleteMasterData = async (type, id, name) => {
    if (!confirm(`ลบ "${name}" ออกจาก ${type}?\nข้อมูลที่ผูกกันอาจได้รับผลกระทบ`)) return;
    try {
        const res = await API.delete(`/master/${type}/${id}`);
        if (res.success) { showToast('ลบสำเร็จ', 'success'); loadMasterList(type); }
        else showError(res.message);
    } catch (err) { showError(err.message); }
};

// =============================================================================
// TAB: EMPLOYEES
// =============================================================================
async function renderEmployeesTab(container) {
    _empPage = 1; _empSearch = '';
    container.innerHTML = `
    <div class="animate-fade-in space-y-4">
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div class="flex gap-2 flex-1 w-full sm:max-w-sm">
                <input type="text" id="emp-search-input" placeholder="ค้นหาชื่อ / รหัส / หน่วยงาน..."
                    class="form-input w-full rounded-lg text-sm border-slate-200"
                    oninput="window._empSearch(this.value)">
            </div>
            <div class="flex gap-2 flex-wrap">
                <button onclick="window._exportEmpExcel()" class="btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Export Excel
                </button>
                <button onclick="window._openImportModal()" class="btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                    Import Excel
                </button>
                <button onclick="window._openAddEmpModal()" class="btn bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 transition-colors shadow-sm shadow-emerald-100">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    เพิ่มพนักงาน
                </button>
            </div>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div id="emp-table-wrap">
                <div class="py-16 text-center text-slate-400 text-sm">กำลังโหลด...</div>
            </div>
        </div>
        <div id="emp-pagination" class="flex justify-between items-center"></div>
    </div>`;

    window._empSearch = (q) => { _empSearch = q.toLowerCase(); _empPage = 1; _renderEmpTable(); };

    const [empsRes, deptsRes, teamsRes, posRes, unitsRes] = await Promise.all([
        API.get('/employees').catch(() => ({ data: [] })),
        API.get('/master/departments').catch(() => ({ data: [] })),
        API.get('/master/teams').catch(() => ({ data: [] })),
        API.get('/master/positions').catch(() => ({ data: [] })),
        API.get('/admin/org/units').catch(() => ({ data: [] })),
    ]);
    _empCache  = empsRes?.data   || [];
    _deptCache = deptsRes?.data  || [];
    _teamCache = teamsRes?.data  || [];
    _posCache  = posRes?.data    || [];
    _unitCache = unitsRes?.data  || [];
    _renderEmpTable();
}

function _renderEmpTable() {
    const wrap   = document.getElementById('emp-table-wrap');
    const pagEl  = document.getElementById('emp-pagination');
    if (!wrap) return;

    const filtered = _empCache.filter(e =>
        !_empSearch ||
        (e.EmployeeName||'').toLowerCase().includes(_empSearch) ||
        (e.EmployeeID  ||'').toLowerCase().includes(_empSearch) ||
        (e.Department  ||'').toLowerCase().includes(_empSearch) ||
        (e.Position    ||'').toLowerCase().includes(_empSearch)
    );

    const totalPages = Math.max(1, Math.ceil(filtered.length / EMP_PER_PAGE));
    if (_empPage > totalPages) _empPage = totalPages;
    const start  = (_empPage - 1) * EMP_PER_PAGE;
    const paged  = filtered.slice(start, start + EMP_PER_PAGE);

    if (filtered.length === 0) {
        wrap.innerHTML = `<div class="py-16 text-center text-slate-400 text-sm">ไม่พบข้อมูลพนักงาน</div>`;
        if (pagEl) pagEl.innerHTML = '';
        return;
    }

    const roleBadge = (role) => {
        const map = { Admin:'bg-red-100 text-red-600', Viewer:'bg-sky-100 text-sky-600' };
        return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${map[role]||'bg-slate-100 text-slate-500'}">${role||'User'}</span>`;
    };

    wrap.innerHTML = `
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-left">
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">รหัส</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">ชื่อ-นามสกุล</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">หน่วยงาน</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">ตำแหน่ง</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Role</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-right">จัดการ</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
            ${paged.map(emp => `
            <tr class="hover:bg-slate-50 transition-colors group">
                <td class="px-4 py-3 font-mono text-xs text-slate-500">${emp.EmployeeID}</td>
                <td class="px-4 py-3 font-semibold text-slate-800 text-sm">${emp.EmployeeName||'—'}</td>
                <td class="px-4 py-3 text-slate-600 text-xs">${emp.Department||'—'}</td>
                <td class="px-4 py-3 text-slate-600 text-xs">${emp.Position||'—'}</td>
                <td class="px-4 py-3">${roleBadge(emp.Role)}</td>
                <td class="px-4 py-3 text-right">
                    <div class="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="window._openEditEmpModal('${emp.EmployeeID}')" title="แก้ไข"
                            class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button onclick="window._openResetPwModal('${emp.EmployeeID}','${(emp.EmployeeName||'').replace(/'/g,"\\'")}')" title="รีเซ็ตรหัสผ่าน"
                            class="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
                        </button>
                        <button onclick="window._deleteEmployee('${emp.EmployeeID}','${(emp.EmployeeName||'').replace(/'/g,"\\'")}')" title="ลบ"
                            class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`).join('')}
        </tbody>
    </table>
    <div class="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">
        แสดง ${start+1}–${Math.min(start+EMP_PER_PAGE,filtered.length)} จาก ${filtered.length} รายการ (ทั้งหมด ${_empCache.length})
    </div>`;

    if (pagEl) {
        pagEl.innerHTML = totalPages <= 1 ? '' : `
        <div class="flex items-center gap-2 text-xs text-slate-600">
            <button onclick="window._empChangePage(${_empPage-1})" ${_empPage<=1?'disabled':''} class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">← ก่อนหน้า</button>
            <span class="px-3">หน้า <strong>${_empPage}</strong> / ${totalPages}</span>
            <button onclick="window._empChangePage(${_empPage+1})" ${_empPage>=totalPages?'disabled':''} class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">ถัดไป →</button>
        </div>`;
    }
}

window._empChangePage = (p) => { _empPage = p; _renderEmpTable(); };

window._exportEmpExcel = () => {
    if (!window.XLSX) { showError('ไม่พบ SheetJS library'); return; }
    const data = _empCache.map(e => ({
        'รหัสพนักงาน': e.EmployeeID,
        'ชื่อ-นามสกุล': e.EmployeeName,
        'หน่วยงาน':    e.Department,
        'Unit':        e.Unit,
        'ตำแหน่ง':     e.Position,
        'ทีม':         e.Team,
        'Role':        e.Role,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, `Employees_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Export สำเร็จ', 'success');
};

function _buildUnitOpts(deptName, selectedUnit = '') {
    const dept      = _deptCache.find(d => d.Name === deptName);
    const deptUnits = dept ? _unitCache.filter(u => u.department_id === dept.id) : [];
    if (!deptUnits.length) return '<option value="">— ไม่มี Unit ในแผนกนี้ —</option>';
    return '<option value="">— เลือก Unit —</option>' +
        deptUnits.map(u => `<option value="${u.name}" ${u.name===selectedUnit?'selected':''}>${u.name}</option>`).join('');
}

window._empFilterUnits = (deptName) => {
    const sel = document.getElementById('emp-unit-select');
    if (!sel) return;
    sel.innerHTML = _buildUnitOpts(deptName);
    sel.disabled  = !deptName;
};

function _empFormFields(emp = {}) {
    const dOpts   = _deptCache.map(d=>`<option value="${d.Name}" ${d.Name===emp.Department?'selected':''}>${d.Name}</option>`).join('');
    const uOpts   = _buildUnitOpts(emp.Department || '', emp.Unit || '');
    const noUnits = !emp.Department;
    const pOpts   = _posCache.map(p=>`<option value="${p.Name}" ${p.Name===emp.Position?'selected':''}>${p.Name}</option>`).join('');
    const tOpts   = _teamCache.map(t=>`<option value="${t.Name}" ${t.Name===emp.Team?'selected':''}>${t.Name}</option>`).join('');
    const rOpts   = ['User','Admin','Viewer'].map(r=>`<option value="${r}" ${r===(emp.Role||'User')?'selected':''}>${r}</option>`).join('');
    return `
    <div class="grid grid-cols-2 gap-3">
        <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">รหัสพนักงาน <span class="text-red-500">*</span></label>
            <input type="text" name="EmployeeID" class="form-input w-full rounded-lg text-sm ${emp.EmployeeID?'bg-slate-50 cursor-not-allowed':''}"
                value="${emp.EmployeeID||''}" ${emp.EmployeeID?'readonly':'required'} placeholder="EMP001">
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">ชื่อ-นามสกุล <span class="text-red-500">*</span></label>
            <input type="text" name="EmployeeName" class="form-input w-full rounded-lg text-sm" required value="${emp.EmployeeName||''}" placeholder="ชื่อ นามสกุล">
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">หน่วยงาน</label>
            <select name="Department" class="form-select w-full rounded-lg text-sm"
                    onchange="window._empFilterUnits(this.value)">
                <option value="">— เลือก —</option>${dOpts}
            </select>
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">
                Safety Unit
                <span class="text-slate-400 normal-case font-normal text-[10px] ml-1">(เลือกแผนกก่อน)</span>
            </label>
            <select id="emp-unit-select" name="Unit" class="form-select w-full rounded-lg text-sm"
                    ${noUnits ? 'disabled' : ''}>${uOpts}</select>
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">ตำแหน่ง</label>
            <select name="Position" class="form-select w-full rounded-lg text-sm"><option value="">— เลือก —</option>${pOpts}</select>
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">ทีม <span class="text-slate-300 normal-case font-normal">(สำหรับตรวจ)</span></label>
            <select name="Team" class="form-select w-full rounded-lg text-sm"><option value="">— เลือก —</option>${tOpts}</select>
        </div>
        <div class="col-span-2">
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Role (สิทธิ์)</label>
            <select name="Role" class="form-select w-full rounded-lg text-sm">${rOpts}</select>
        </div>
    </div>`;
}

window._openAddEmpModal = () => {
    openModal('เพิ่มพนักงานใหม่', `
        <form id="emp-add-form" class="space-y-4">
            ${_empFormFields()}
            <div class="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button type="submit" class="btn bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium">บันทึก</button>
            </div>
        </form>`, 'max-w-lg');
    setTimeout(() => {
        document.getElementById('emp-add-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(e.target).entries());
            try {
                await API.post('/admin/employee/create', body);
                showToast('เพิ่มพนักงานสำเร็จ', 'success');
                closeModal();
                const res = await API.get('/employees').catch(() => ({ data: [] }));
                _empCache = res?.data || [];
                _renderEmpTable();
            } catch (err) { showError(err?.message || 'ไม่สามารถเพิ่มพนักงานได้'); }
        });
    }, 50);
};

window._openEditEmpModal = (empId) => {
    const emp = _empCache.find(e => e.EmployeeID === empId);
    if (!emp) return;
    openModal(`แก้ไขพนักงาน: ${emp.EmployeeName}`, `
        <form id="emp-edit-form" class="space-y-4">
            ${_empFormFields(emp)}
            <div class="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button type="submit" class="btn bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium">บันทึก</button>
            </div>
        </form>`, 'max-w-lg');
    setTimeout(() => {
        document.getElementById('emp-edit-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(e.target).entries());
            try {
                await API.put(`/admin/employee/${empId}`, body);
                showToast('อัปเดตข้อมูลสำเร็จ', 'success');
                closeModal();
                const idx = _empCache.findIndex(e => e.EmployeeID === empId);
                if (idx !== -1) _empCache[idx] = { ..._empCache[idx], ...body };
                _renderEmpTable();
            } catch (err) { showError(err?.message || 'ไม่สามารถอัปเดตข้อมูลได้'); }
        });
    }, 50);
};

window._openResetPwModal = (empId, empName) => {
    openModal(`รีเซ็ตรหัสผ่าน: ${empName}`, `
        <form id="reset-pw-form" class="space-y-4">
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                รหัสผ่านใหม่จะถูกเข้ารหัส (bcrypt) ทันที — ผู้ใช้ต้องเข้าสู่ระบบด้วยรหัสใหม่
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">รหัสผ่านใหม่ <span class="text-red-500">*</span></label>
                <input type="password" id="pw-new" name="newPassword" class="form-input w-full rounded-lg text-sm" required minlength="4" placeholder="อย่างน้อย 4 ตัวอักษร">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">ยืนยันรหัสผ่าน <span class="text-red-500">*</span></label>
                <input type="password" id="pw-confirm" class="form-input w-full rounded-lg text-sm" required placeholder="พิมพ์ซ้ำอีกครั้ง">
                <p id="pw-match-msg" class="text-xs mt-1 hidden"></p>
            </div>
            <div class="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button type="submit" class="btn bg-amber-600 text-white px-5 py-2 rounded-lg text-sm font-medium">รีเซ็ต</button>
            </div>
        </form>`, 'max-w-sm');
    setTimeout(() => {
        const confirm = document.getElementById('pw-confirm');
        const msg     = document.getElementById('pw-match-msg');
        const pw      = document.getElementById('pw-new');
        confirm?.addEventListener('input', () => {
            if (!msg) return;
            if (confirm.value === pw?.value) { msg.textContent = '✓ รหัสผ่านตรงกัน'; msg.className = 'text-xs mt-1 text-emerald-600'; }
            else { msg.textContent = '✗ รหัสผ่านไม่ตรงกัน'; msg.className = 'text-xs mt-1 text-red-500'; }
            msg.classList.remove('hidden');
        });
        document.getElementById('reset-pw-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (pw?.value !== confirm?.value) { showToast('รหัสผ่านไม่ตรงกัน', 'error'); return; }
            try {
                await API.post(`/admin/employee/${empId}/reset-password`, { newPassword: pw.value });
                showToast(`รีเซ็ตรหัสผ่านของ ${empName} สำเร็จ`, 'success');
                closeModal();
            } catch (err) { showError(err?.message || 'รีเซ็ตรหัสผ่านไม่สำเร็จ'); }
        });
    }, 50);
};

window._deleteEmployee = async (empId, empName) => {
    openModal('ยืนยันการลบ', `
            <div class="space-y-4">
                <div class="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p class="font-bold text-red-700 text-sm mb-1">กำลังจะลบพนักงานต่อไปนี้</p>
                    <p class="text-sm text-slate-700"><strong>${empName}</strong> <span class="font-mono text-xs text-slate-500">(${empId})</span></p>
                    <p class="text-xs text-red-600 mt-2">ข้อมูลทั้งหมดที่เชื่อมกับพนักงานคนนี้อาจได้รับผลกระทบ</p>
                </div>
                <div class="flex justify-end gap-2">
                    <button onclick="window.closeModal&&window.closeModal()" class="btn bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm">ยกเลิก</button>
                    <button id="confirm-delete-emp-btn" class="btn bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg text-sm font-medium">ลบข้อมูล</button>
                </div>
            </div>`, 'max-w-sm');
    setTimeout(() => {
        document.getElementById('confirm-delete-emp-btn')?.addEventListener('click', async () => {
            try {
                await API.delete(`/admin/employee/${empId}`);
                showToast('ลบข้อมูลสำเร็จ', 'success');
                closeModal();
                _empCache = _empCache.filter(e => e.EmployeeID !== empId);
                _renderEmpTable();
            } catch (err) { showError(err?.message || 'ลบไม่สำเร็จ'); }
        });
    }, 50);
};

window._openImportModal = () => {
    openModal('Import พนักงานจาก Excel', `
        <div class="space-y-4">
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <p class="font-bold mb-1">คอลัมน์ที่รองรับ:</p>
                <code class="block bg-amber-100 px-2 py-1 rounded">EmployeeID, EmployeeName, Department, Unit, Position, Team, Role</code>
                <p class="mt-1">ถ้า EmployeeID ซ้ำ จะอัปเดตข้อมูลเดิม (Upsert)</p>
            </div>
            <div id="import-drop-zone" class="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all">
                <svg class="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                <p id="import-file-label" class="text-sm text-slate-500">คลิกเพื่อเลือกไฟล์ หรือลากมาวาง</p>
                <p class="text-xs text-slate-400 mt-1">.xlsx หรือ .xls เท่านั้น</p>
                <input type="file" id="import-file-input" accept=".xlsx,.xls" class="hidden">
            </div>
            <div id="import-result" class="hidden text-sm"></div>
            <div class="flex justify-end gap-2 pt-2 border-t">
                <button onclick="window.closeModal&&window.closeModal()" class="btn bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm">ปิด</button>
                <button id="import-btn" onclick="window._doImport()" class="btn bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium">นำเข้าข้อมูล</button>
            </div>
        </div>`, 'max-w-md');
    setTimeout(() => {
        const zone  = document.getElementById('import-drop-zone');
        const input = document.getElementById('import-file-input');
        const label = document.getElementById('import-file-label');
        zone?.addEventListener('click', () => input?.click());
        input?.addEventListener('change', () => { if (input.files[0] && label) label.textContent = input.files[0].name; });
        zone?.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('border-emerald-400','bg-emerald-50'); });
        zone?.addEventListener('dragleave', () => zone.classList.remove('border-emerald-400','bg-emerald-50'));
        zone?.addEventListener('drop', e => {
            e.preventDefault(); zone.classList.remove('border-emerald-400','bg-emerald-50');
            if (e.dataTransfer.files[0] && input) { input.files = e.dataTransfer.files; if (label) label.textContent = e.dataTransfer.files[0].name; }
        });
    }, 50);
};

window._doImport = async () => {
    const input  = document.getElementById('import-file-input');
    const resEl  = document.getElementById('import-result');
    const btn    = document.getElementById('import-btn');
    if (!input?.files[0]) { showToast('กรุณาเลือกไฟล์ก่อน', 'error'); return; }
    if (!window.XLSX) { showError('ไม่พบ SheetJS library'); return; }
    btn.disabled = true; btn.textContent = 'กำลังนำเข้า...';
    try {
        const buf  = await input.files[0].arrayBuffer();
        const wb   = XLSX.read(buf, { type: 'array' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        if (data.length === 0) { showToast('ไฟล์ไม่มีข้อมูล', 'error'); return; }

        const fd = new FormData();
        fd.append('file', input.files[0]);
        const res = await API.postForm('/admin/employee/import', fd);
        resEl.className = 'text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl border border-emerald-200';
        resEl.textContent = res.message || `นำเข้าสำเร็จ`;
        resEl.classList.remove('hidden');
        showToast('Import สำเร็จ', 'success');
        const empsRes = await API.get('/employees').catch(() => ({ data: [] }));
        _empCache = empsRes?.data || [];
        _renderEmpTable();
    } catch (err) {
        resEl.className = 'text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-200';
        resEl.textContent = err?.message || 'เกิดข้อผิดพลาด';
        resEl.classList.remove('hidden');
    } finally { btn.disabled = false; btn.textContent = 'นำเข้าข้อมูล'; }
};

// =============================================================================
// TAB: SYSTEM HEALTH
// =============================================================================
async function renderSystemHealth(container) {
    try {
        const res = await API.get('/admin/system-health');
        const d   = res.data || {};
        const m   = d.modules || {};
        const al  = d.alerts  || {};

        const mkCard = (title, icon, items, color = 'slate') => {
            const colorClass = { indigo:'border-l-indigo-400', emerald:'border-l-emerald-400', amber:'border-l-amber-400', rose:'border-l-rose-400', sky:'border-l-sky-400', slate:'border-l-slate-300' };
            const rows = items.map(([label, val]) => {
                const isNull = val === null;
                return `<div class="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-0">
                    <span class="text-xs text-slate-600">${label}</span>
                    <span class="text-xs font-bold ${isNull?'text-slate-300 italic':'text-slate-800'}">${isNull?'ไม่มีตาราง':val}</span>
                </div>`;
            }).join('');
            return `
            <div class="bg-white rounded-xl border border-slate-200 border-l-4 ${colorClass[color]||colorClass.slate} shadow-sm p-4">
                <div class="flex items-center gap-2 mb-3">
                    <svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">${icon}</svg>
                    <h3 class="font-bold text-slate-700 text-sm">${title}</h3>
                </div>
                ${rows}
            </div>`;
        };

        const alertRows = (rows, cols, emptyMsg) => {
            if (!rows?.length) return `<div class="text-xs text-slate-400 py-4 text-center">${emptyMsg}</div>`;
            return `<table class="w-full text-xs"><tbody class="divide-y divide-slate-100">${rows.map(r =>
                `<tr>${cols.map(c => `<td class="py-1.5 px-2 ${c.cls||''}">${r[c.key]||'—'}</td>`).join('')}</tr>`
            ).join('')}</tbody></table>`;
        };

        container.innerHTML = `
        <div class="animate-fade-in space-y-6">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                ${mkCard('Employees', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>`,
                    [['พนักงานทั้งหมด', m.employees?.total], ['แผนก', m.employees?.depts], ['ทีม', m.employees?.teams]], 'indigo')}
                ${mkCard('Patrol', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>`,
                    [['Sessions', m.patrol?.sessions], ['Issues', m.patrol?.issues]], 'sky')}
                ${mkCard('Hiyari-Hatto', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>`,
                    [['รายงานทั้งหมด', m.hiyari?.total], ['ยังไม่ปิด', m.hiyari?.open]], 'rose')}
                ${mkCard('KY Activity', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>`,
                    [['กิจกรรมทั้งหมด', m.ky?.total]], 'emerald')}
                ${mkCard('4M Change', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>`,
                    [['Change Notice ทั้งหมด', m.fourm?.total], ['ยังเปิดอยู่', m.fourm?.open], ['Man Records', m.fourm?.manRecords]], 'amber')}
                ${mkCard('อื่นๆ', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>`,
                    [['เอกสาร Contractor', m.contractor?.docs], ['SCW Documents', m.ojt?.docs], ['Yokoten Topics', m.yokoten?.topics]], 'slate')}
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="bg-white rounded-xl border border-amber-200 shadow-sm p-5">
                    <h3 class="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
                        <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Change Notice ค้างนาน (&gt;30 วัน)
                    </h3>
                    ${alertRows(al.staleChangeNotices,
                        [{key:'NoticeNo',cls:'font-mono text-slate-500 w-32'},{key:'Department'},{key:'ChangeDate',cls:'text-slate-400'}],
                        'ไม่มีรายการค้าง — '
                    )}
                </div>
                <div class="bg-white rounded-xl border border-rose-200 shadow-sm p-5">
                    <h3 class="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
                        <svg class="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        Hiyari ค้างนาน (&gt;14 วัน)
                    </h3>
                    ${alertRows(al.staleHiyari,
                        [{key:'id',cls:'font-mono text-slate-500 w-12'},{key:'Department'},{key:'ReportDate',cls:'text-slate-400'}],
                        'ไม่มีรายการค้าง — ดี!'
                    )}
                </div>
            </div>
        </div>`;
    } catch (err) {
        container.innerHTML = `<div class="text-center py-20 text-red-500 text-sm">โหลดข้อมูลไม่ได้: ${err.message}</div>`;
    }
}

// =============================================================================
// TAB: AUDIT LOG
// =============================================================================
async function renderAuditLog(container) {
    _auditPage = 1;
    container.innerHTML = `
    <div class="animate-fade-in space-y-4">
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div class="flex gap-2 flex-wrap">
                <select id="audit-filter-action" onchange="window._loadAuditLog()" class="form-select text-sm border-slate-200 rounded-lg py-1.5 pl-3 pr-8">
                    <option value="">— ทุก Action —</option>
                    <option>CREATE_EMPLOYEE</option><option>UPDATE_EMPLOYEE</option><option>DELETE_EMPLOYEE</option>
                    <option>RESET_PASSWORD</option><option>IMPORT_EMPLOYEES</option>
                    <option>CREATE_SCHEDULE</option><option>BULK_CREATE_SCHEDULE</option><option>DELETE_SCHEDULE</option>
                </select>
            </div>
            <button onclick="window._loadAuditLog()" class="btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                รีเฟรช
            </button>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div id="audit-table-wrap"><div class="py-16 text-center text-slate-400 text-sm">กำลังโหลด...</div></div>
        </div>
        <div id="audit-pagination" class="flex justify-between items-center"></div>
    </div>`;

    window._loadAuditLog = () => loadAuditLog();
    window._auditChangePage = (p) => { _auditPage = p; loadAuditLog(); };
    loadAuditLog();
}

async function loadAuditLog() {
    const wrap    = document.getElementById('audit-table-wrap');
    const pagEl   = document.getElementById('audit-pagination');
    const action  = document.getElementById('audit-filter-action')?.value || '';
    if (!wrap) return;
    try {
        const res = await API.get(`/admin/audit-logs?page=${_auditPage}&limit=${AUDIT_LIMIT}&action=${action}`);
        _auditTotal = res.total || 0;
        const rows  = res.data  || [];
        const totalPages = Math.max(1, Math.ceil(_auditTotal / AUDIT_LIMIT));

        const actionColor = {
            CREATE_EMPLOYEE:'bg-emerald-100 text-emerald-700', DELETE_EMPLOYEE:'bg-red-100 text-red-600',
            UPDATE_EMPLOYEE:'bg-indigo-100 text-indigo-700',   RESET_PASSWORD:'bg-amber-100 text-amber-700',
            IMPORT_EMPLOYEES:'bg-sky-100 text-sky-700',        CREATE_SCHEDULE:'bg-violet-100 text-violet-700',
            BULK_CREATE_SCHEDULE:'bg-violet-100 text-violet-700', DELETE_SCHEDULE:'bg-red-100 text-red-600',
        };

        if (rows.length === 0) {
            wrap.innerHTML = `<div class="py-16 text-center text-slate-400 text-sm">ยังไม่มีบันทึกกิจกรรม</div>`;
        } else {
            wrap.innerHTML = `
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-left">
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">เวลา</th>
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Admin</th>
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Action</th>
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Target</th>
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">รายละเอียด</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${rows.map(r => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap font-mono">
                            ${new Date(r.ActionTime).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'})}
                        </td>
                        <td class="px-4 py-3 text-xs text-slate-700 font-medium">${r.AdminName||r.AdminID||'—'}</td>
                        <td class="px-4 py-3">
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${actionColor[r.Action]||'bg-slate-100 text-slate-500'}">${r.Action||'—'}</span>
                        </td>
                        <td class="px-4 py-3 text-xs text-slate-500 font-mono">${r.TargetType||''}${r.TargetID?` #${r.TargetID}`:''}</td>
                        <td class="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">${r.Detail||'—'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">
                แสดง ${((_auditPage-1)*AUDIT_LIMIT)+1}–${Math.min(_auditPage*AUDIT_LIMIT,_auditTotal)} จากทั้งหมด ${_auditTotal} รายการ
            </div>`;
        }

        if (pagEl) {
            pagEl.innerHTML = totalPages <= 1 ? '' : `
            <div class="flex items-center gap-2 text-xs text-slate-600">
                <button onclick="window._auditChangePage(${_auditPage-1})" ${_auditPage<=1?'disabled':''} class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">← ก่อนหน้า</button>
                <span class="px-3">หน้า <strong>${_auditPage}</strong> / ${totalPages}</span>
                <button onclick="window._auditChangePage(${_auditPage+1})" ${_auditPage>=totalPages?'disabled':''} class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">ถัดไป →</button>
            </div>`;
        }
    } catch (err) {
        wrap.innerHTML = `<div class="py-12 text-center text-red-400 text-sm">โหลดไม่ได้: ${err.message}</div>`;
    }
}
