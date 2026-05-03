import { showToast, showError, openModal, openDetailModal, closeModal, escHtml, metricCard, emptyState, statusBadge as dsStatusBadge } from '../ui.js';
import { API } from '../api.js';

// ─── Button loading helper (disable + spinner, returns original HTML) ──────────
const _SPIN_HTML = `<svg class="w-3.5 h-3.5 animate-spin inline-block" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>`;
function _btnLoad(btn, label = '') {
    if (!btn) return null;
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${_SPIN_HTML}${label ? ' ' + label : ''}`;
    return orig;
}
function _btnRestore(btn, orig) {
    if (!btn || orig === null) return;
    btn.disabled = false;
    btn.innerHTML = orig;
}
// Skeleton rows for list/table areas
function _skelRows(n = 4, cols = 4) {
    return `<div class="animate-pulse space-y-2 p-4">${Array.from({length:n}, () =>
        `<div class="flex gap-3 items-center">${Array.from({length:cols}, (_, i) =>
            `<div class="h-3 rounded bg-slate-100 flex-${i===0?'none w-24':'1'}"></div>`).join('')}</div>`
    ).join('')}</div>`;
}
function _skelSpinner() {
    return `<div class="flex flex-col items-center justify-center py-12 text-slate-400"><div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent mb-3"></div><p class="text-xs">กำลังโหลด...</p></div>`;
}

// ─── Global State ─────────────────────────────────────────────────────────────
let _currentTab   = 'dashboard';
let _calInst      = null;
let _viewMode     = 'list';

// Employee tab state
let _empCache     = [];
let _deptCache    = [];
let _posCache     = [];
let _unitCache    = [];
let _empSearch    = '';
let _empPage      = 1;
const EMP_PER_PAGE = 25;

// Audit log state
let _auditPage         = 1;
let _auditTotal        = 0;
let _auditRows         = [];
let _auditFilterFailed = false;
const AUDIT_LIMIT      = 50;


// Organization tab state
let _orgDepts      = [];   // { id, Name, is_safety_core, unit_count }
let _orgUnits      = [];   // { id, name, department_id, short_code }
let _orgSearch     = '';
let _orgFilter     = 'all'; // 'all' | 'safety' | 'general'
let _orgPage       = 1;
let _orgFetchError = false;
const ORG_PER_PAGE = 15;
let _masterQuality = { teams: [], positions: [], roles: [], areas: [] };

// ─── Tab Config ───────────────────────────────────────────────────────────────
const TABS = [
    { key: 'dashboard',    label: 'ภาพรวม',           icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>` },
    { key: 'scheduler',    label: 'กำหนดการตรวจ',      icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>` },
    { key: 'employees',    label: 'ข้อมูลพนักงาน',     icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>` },
    { key: 'reference',    label: 'ข้อมูลอ้างอิง',     icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>` },
    { key: 'permissions',  label: 'สิทธิ์การใช้งาน',   icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>` },
    { key: 'health',       label: 'System Health',     icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>` },
    { key: 'audit',        label: 'Audit Log',         icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>` },
    { key: 'targets',      label: 'เป้าหมายกิจกรรม',   icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>` },
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
                    <div id="admin-hero-stats" class="grid grid-cols-2 md:grid-cols-3 gap-3 w-full md:w-auto"></div>
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
    window.loadSchedules       = loadSchedules;
    window.toggleViewMode      = toggleViewMode;

    _currentTab = window._getTab?.('admin', _currentTab) || _currentTab;
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
    window._saveTab?.('admin', key);
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
    else if (key === 'reference')    renderReference(area);
    else if (key === 'permissions')  renderPermissions(area);
    else if (key === 'health')       renderSystemHealth(area);
    else if (key === 'audit')        renderAuditLog(area);
    else if (key === 'targets')      renderActivityTargets(area);
}

// =============================================================================
// TAB: REFERENCE DATA (แผนก + Teams + Positions + Roles)
// =============================================================================
async function renderReference(container) {
    _orgPage = 1;

    const refTypes = [
        { key:'teams',     title:'Teams',        sub:'ทีมเดินตรวจ', color:'sky',    icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>` },
        { key:'positions', title:'Positions',    sub:'ตำแหน่งงาน',  color:'violet', icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>` },
        { key:'roles',     title:'System Roles', sub:'บทบาทผู้ใช้',  color:'rose',   icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>` },
    ];
    const hdrCls = { sky:'from-sky-50 to-white', violet:'from-violet-50 to-white', rose:'from-rose-50 to-white' };

    container.innerHTML = `
    <div class="animate-fade-in space-y-6">

        <!-- ─── Section 1: แผนก / หน่วยงาน ─── -->
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">แผนก / หน่วยงาน</p>

          <!-- Stats skeleton -->
          <div id="org-stats-row" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              ${[1,2,3,4].map(() => `
              <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm animate-pulse">
                  <div class="h-8 bg-slate-100 rounded-lg w-12 mb-2"></div>
                  <div class="h-3 bg-slate-100 rounded w-20"></div>
              </div>`).join('')}
          </div>
          <div id="master-quality-row" class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
              ${[1,2,3,4,5].map(() => `
              <div class="rounded-xl border border-slate-100 bg-white px-4 py-3 animate-pulse">
                  <div class="h-3 bg-slate-100 rounded w-20 mb-2"></div>
                  <div class="h-4 bg-slate-100 rounded w-14"></div>
              </div>`).join('')}
          </div>

          <!-- Filter Bar -->
          <div class="ds-filter-bar flex flex-wrap gap-3 items-center mb-4">
              <div class="relative flex-1 min-w-[200px]">
                  <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
                  </svg>
                  <input id="org-search" type="text" placeholder="ค้นหาชื่อแผนก..."
                      value="${_orgSearch}"
                      class="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      oninput="window._orgFilter()">
              </div>
              <div class="flex bg-slate-100 p-1 rounded-lg gap-0.5 flex-shrink-0">
                  ${[{ v:'all', label:'ทั้งหมด' }, { v:'safety', label:'Safety Core' }, { v:'general', label:'หน่วยงานทั่วไป' }].map(o => `
                  <button onclick="window._orgSetFilter('${o.v}')" id="org-type-${o.v}"
                      class="px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${_orgFilter === o.v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}">
                      ${o.label}
                  </button>`).join('')}
              </div>
              <span id="org-clear-wrap" class="${_orgSearch || _orgFilter !== 'all' ? '' : 'hidden'}">
                  <button onclick="window._orgClearFilter()" class="text-xs text-slate-500 underline hover:text-slate-700">ล้างตัวกรอง</button>
              </span>
              <span id="org-count" class="text-xs text-slate-400 ml-auto"></span>
              ${TSHSession.getUser()?.role === 'Admin' || TSHSession.getUser()?.Role === 'Admin' ? `
              <button onclick="window._orgAddDept()"
                  class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm"
                  style="background:linear-gradient(135deg,#065f46,#0d9488)">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                  เพิ่มแผนก
              </button>` : ''}
          </div>

          <div class="ds-table-wrap">
              <div id="org-table-wrap">
                  <div class="flex items-center justify-center py-16 text-slate-400">
                      <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
                  </div>
              </div>
          </div>
          <div id="org-pagination" class="flex justify-center gap-1 mt-3"></div>
        </div>

        <!-- ─── Section 2: Teams / Positions / Roles ─── -->
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">ข้อมูลอ้างอิง (Teams · Positions · Roles)</p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${refTypes.map(rt => `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col" style="max-height:420px">
                <div class="p-4 bg-gradient-to-b ${hdrCls[rt.color]} to-white border-b flex justify-between items-center flex-shrink-0">
                    <div class="flex items-center gap-2.5">
                        <div class="p-1.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                            <svg class="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">${rt.icon}</svg>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800 text-sm">${rt.title}</h3>
                            <p class="text-[10px] text-slate-500">${rt.sub}</p>
                        </div>
                    </div>
                    <span id="count-${rt.key}" class="text-[10px] font-bold bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-500">0</span>
                </div>
                <div class="p-3 border-b border-slate-100 flex-shrink-0">
                    <div class="flex gap-2">
                        <input type="text" id="input-${rt.key}" class="form-input w-full pl-3 py-1.5 rounded-lg text-xs border-slate-300 focus:ring-1 focus:ring-slate-800"
                            placeholder="เพิ่มรายการใหม่..." onkeypress="if(event.key==='Enter') addMasterData('${rt.key}')">
                        <button onclick="addMasterData('${rt.key}')" class="px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors">+</button>
                    </div>
                </div>
                <ul id="list-${rt.key}" class="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
                    <li class="text-center text-xs text-slate-400 py-8">กำลังโหลด...</li>
                </ul>
            </div>`).join('')}
          </div>
        </div>

        <!-- ─── Section 3: พื้นที่โรงงาน (Patrol Areas) ─── -->
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">พื้นที่โรงงาน (Patrol Areas) — ซิงค์ทั้งระบบ</p>
          <div class="bg-white rounded-xl border border-emerald-100 shadow-sm overflow-hidden">
            <div class="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div class="p-1.5 bg-white rounded-lg border border-emerald-200 shadow-sm">
                  <svg class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </div>
                <div>
                  <h3 class="font-bold text-slate-800 text-sm">พื้นที่โรงงาน</h3>
                  <p class="text-[10px] text-slate-500">ใช้ใน: Rotation · รายงานปัญหา · Self-Patrol</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span id="count-areas" class="text-[10px] font-bold bg-white px-2 py-0.5 rounded-full border border-emerald-200 text-emerald-700">0</span>
                <button onclick="window.openAddAreaModal()"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition-all hover:opacity-90"
                  style="background:linear-gradient(135deg,#059669,#0d9488)">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                  เพิ่มพื้นที่
                </button>
              </div>
            </div>
            <div class="p-4">
              <div id="areas-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                <div class="text-center text-xs text-slate-400 py-6 col-span-full">กำลังโหลด...</div>
              </div>
            </div>
          </div>
        </div>

    </div>`;

    window._orgFilter      = _orgApplyFilter;
    window._orgSetFilter   = _orgSetTypeFilter;
    window._orgClearFilter = _orgClearFilter;

    await _orgFetchAll();

    if (_orgFetchError) {
        const wrap = document.getElementById('org-table-wrap');
        if (wrap) wrap.innerHTML = `
        <div class="text-center py-16 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <p class="font-semibold text-slate-600">โหลดข้อมูลไม่สำเร็จ</p>
            <p class="text-sm mt-1">ไม่สามารถเชื่อมต่อกับ API ได้</p>
            <button onclick="window._adminTab('reference')"
                class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm"
                style="background:linear-gradient(135deg,#065f46,#0d9488)">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
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
    _renderMasterQuality();
    _orgRenderTable();
    loadMasterList('teams');
    loadMasterList('positions');
    loadMasterList('roles');
    loadAreasList();
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
        <div class="ds-metric-card flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.bg}">
                <svg class="w-5 h-5 ${c.txt}" fill="none" viewBox="0 0 24 24" stroke="currentColor">${c.icon}</svg>
            </div>
            <div>
                <p class="text-2xl font-bold text-slate-800">${c.value}</p>
                <p class="text-xs text-slate-500">${c.label}</p>
            </div>
        </div>`).join('');
}

function _countDuplicateNames(rows, key = 'Name') {
    const seen = new Map();
    (rows || []).forEach(r => {
        const name = String(r?.[key] || '').trim().toLowerCase();
        if (!name) return;
        seen.set(name, (seen.get(name) || 0) + 1);
    });
    return Array.from(seen.values()).filter(n => n > 1).length;
}

function _renderMasterQuality() {
    const el = document.getElementById('master-quality-row');
    if (!el) return;
    const safetyDepts = _orgDepts.filter(d => d.is_safety_core == 1);
    const safetyNoUnit = safetyDepts.filter(d => !_orgUnits.some(u => u.department_id === d.id)).length;
    const duplicateMaster =
        _countDuplicateNames(_orgDepts) +
        _countDuplicateNames(_masterQuality.teams) +
        _countDuplicateNames(_masterQuality.positions) +
        _countDuplicateNames(_masterQuality.roles) +
        _countDuplicateNames(_masterQuality.areas);
    const emptyRequired =
        _orgDepts.filter(d => !(d.Name || '').trim()).length +
        _orgUnits.filter(u => !(u.name || '').trim()).length;
    const referenceLoaded = ['teams','positions','roles','areas'].filter(k => _masterQuality[k].length > 0).length;
    const masterTotal = _orgDepts.length + _orgUnits.length + _masterQuality.teams.length + _masterQuality.positions.length + _masterQuality.roles.length + _masterQuality.areas.length;
    const riskCount = safetyNoUnit + duplicateMaster + emptyRequired;
    const readiness = riskCount === 0 && masterTotal > 0
        ? { label: 'Ready', bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700' }
        : { label: 'Review', bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700' };
    el.innerHTML = `
    <button type="button" onclick="document.getElementById('org-table-wrap')?.scrollIntoView({behavior:'smooth',block:'start'})"
        class="text-left rounded-xl border ${readiness.border} ${readiness.bg} px-4 py-3 hover:shadow-sm transition-shadow">
        <p class="text-[10px] font-bold uppercase ${readiness.text}">Master Readiness</p>
        <p class="mt-1 text-sm font-black ${readiness.text}">${readiness.label}</p>
        <p class="mt-1 text-[11px] text-slate-500">${riskCount} issue signals</p>
    </button>
    <button type="button" onclick="window._orgSetFilter('safety')"
        class="text-left rounded-xl border ${safetyNoUnit ? 'border-amber-100 bg-amber-50' : 'border-slate-200 bg-white'} px-4 py-3 hover:shadow-sm transition-shadow">
        <p class="text-[10px] font-bold uppercase ${safetyNoUnit ? 'text-amber-600' : 'text-slate-500'}">Safety Core Units</p>
        <p class="mt-1 text-sm font-black ${safetyNoUnit ? 'text-amber-700' : 'text-slate-700'}">${safetyDepts.length - safetyNoUnit}/${safetyDepts.length}</p>
        <p class="mt-1 text-[11px] text-slate-500">${safetyNoUnit} dept without unit</p>
    </button>
    <div class="rounded-xl border ${duplicateMaster ? 'border-red-100 bg-red-50' : 'border-slate-200 bg-white'} px-4 py-3">
        <p class="text-[10px] font-bold uppercase ${duplicateMaster ? 'text-red-600' : 'text-slate-500'}">Duplicate Names</p>
        <p class="mt-1 text-sm font-black ${duplicateMaster ? 'text-red-700' : 'text-slate-700'}">${duplicateMaster}</p>
        <p class="mt-1 text-[11px] text-slate-500">Across master lists</p>
    </div>
    <div class="rounded-xl border ${emptyRequired ? 'border-red-100 bg-red-50' : 'border-slate-200 bg-white'} px-4 py-3">
        <p class="text-[10px] font-bold uppercase ${emptyRequired ? 'text-red-600' : 'text-slate-500'}">Blank Required</p>
        <p class="mt-1 text-sm font-black ${emptyRequired ? 'text-red-700' : 'text-slate-700'}">${emptyRequired}</p>
        <p class="mt-1 text-[11px] text-slate-500">Dept/unit names</p>
    </div>
    <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p class="text-[10px] font-bold uppercase text-slate-500">Reference Sets</p>
        <p class="mt-1 text-sm font-black text-slate-700">${referenceLoaded}/4 loaded</p>
        <p class="mt-1 text-[11px] text-slate-500">${masterTotal.toLocaleString()} total records</p>
    </div>`;
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
    <table class="ds-table text-left border-collapse">
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
            const errEl  = document.getElementById('org-dept-err');
            const subBtn = e.target.querySelector('[type=submit]');
            const orig   = _btnLoad(subBtn, 'กำลังเพิ่ม...');
            try {
                await API.post('/master/departments', { Name: body.Name });
                if (body.is_safety_core) {
                    const dRes = await API.get('/admin/org/departments');
                    const created = (dRes.data || []).find(d => d.Name === body.Name);
                    if (created) await API.put(`/admin/org/departments/${created.id}`, body);
                }
                closeModal();
                showToast('เพิ่มแผนกสำเร็จ', 'success');
                await _orgFetchAll();
                _orgRenderStats();
                _renderMasterQuality();
                _orgRenderTable();
            } catch (err) {
                _btnRestore(subBtn, orig);
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
            const errEl  = document.getElementById('org-edit-dept-err');
            const subBtn = e.target.querySelector('[type=submit]');
            const orig   = _btnLoad(subBtn, 'กำลังบันทึก...');
            try {
                await API.put(`/admin/org/departments/${id}`, body);
                closeModal();
                showToast('บันทึกข้อมูลแผนกสำเร็จ', 'success');
                await _orgFetchAll();
                _orgRenderStats();
                _renderMasterQuality();
                _orgRenderTable();
                _loadHeroStats();
            } catch (err) {
                _btnRestore(subBtn, orig);
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
                _renderMasterQuality();
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
        _renderMasterQuality();
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

        <!-- System Roles -->
        <div>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">System Roles</p>
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col" style="max-height:340px">
                <div class="p-4 bg-gradient-to-b from-rose-50 to-white border-b flex justify-between items-center flex-shrink-0">
                    <div class="flex items-center gap-2.5">
                        <div class="p-1.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                            <svg class="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800 text-sm">System Roles</h3>
                            <p class="text-[10px] text-slate-500">สิทธิ์ระบบ (Admin / User / Viewer)</p>
                        </div>
                    </div>
                    <span id="count-roles" class="text-[10px] font-bold bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-500">0</span>
                </div>
                <div class="p-3 border-b border-slate-100 flex-shrink-0">
                    <div class="flex gap-2">
                        <input type="text" id="input-roles" class="form-input w-full pl-3 py-1.5 rounded-lg text-xs border-slate-300 focus:ring-1 focus:ring-slate-800"
                            placeholder="เพิ่ม Role ใหม่..." onkeypress="if(event.key==='Enter') addMasterData('roles')">
                        <button onclick="addMasterData('roles')" class="px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors">+</button>
                    </div>
                </div>
                <ul id="list-roles" class="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
                    <li class="text-center text-xs text-slate-400 py-8">กำลังโหลด...</li>
                </ul>
            </div>
        </div>

        <!-- Permission Matrix -->
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
        <div class="ds-table-wrap">
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

    loadMasterList('roles');
    await _permLoadMatrix();
}

async function _permLoadMatrix() {
    const wrap = document.getElementById('perm-matrix-wrap');
    if (!wrap) return;
    wrap.innerHTML = _skelRows(5, 4);
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

function _adminActionCenterHtml(d = {}) {
    const severityClass = {
        high: 'border-rose-200 bg-rose-50 text-rose-700',
        medium: 'border-amber-200 bg-amber-50 text-amber-700',
        low: 'border-sky-200 bg-sky-50 text-sky-700',
        ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
    const severityDot = {
        high: 'bg-rose-500',
        medium: 'bg-amber-500',
        low: 'bg-sky-500',
        ok: 'bg-emerald-500',
    };
    const actionItems = (d.actionRequired || []).filter(item => Number(item.count || 0) > 0);
    const actionRows = actionItems.map(item => `
        <button onclick="window._adminTab('${item.tab || 'health'}')"
            class="w-full text-left border ${severityClass[item.severity] || severityClass.ok} rounded-lg px-3 py-3 hover:shadow-sm transition-all">
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-2 h-2 rounded-full ${severityDot[item.severity] || severityDot.ok} flex-shrink-0"></span>
                    <span class="text-xs font-bold truncate">${escHtml(item.label || '-')}</span>
                </div>
                <span class="text-sm font-black tabular-nums">${Number(item.count || 0)}</span>
            </div>
        </button>
    `).join('');
    const actionRequiredHtml = actionItems.length ? actionRows : `
        <div class="border border-emerald-200 bg-emerald-50 rounded-xl px-4 py-6 text-center">
            <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            </div>
            <p class="text-sm font-bold text-emerald-800">No urgent admin actions</p>
        </div>`;
    const ux = d.uxHealth || { score: 100, high: 0, medium: 0, low: 0 };
    const score = Math.max(0, Math.min(100, Number(ux.score ?? 100)));
    const scoreColor = score >= 85 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : score >= 65 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-rose-700 bg-rose-50 border-rose-200';
    const barColor = score >= 85 ? 'bg-emerald-500' : score >= 65 ? 'bg-amber-500' : 'bg-rose-500';

    return `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div class="flex items-center justify-between gap-3 mb-4">
                <div>
                    <h3 class="font-bold text-slate-800 text-sm">Action Required</h3>
                </div>
                <button onclick="window._adminTab('health')" class="text-xs font-bold text-slate-500 hover:text-slate-800">System Health</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${actionRequiredHtml}</div>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <h3 class="font-bold text-slate-800 text-sm">UX Health</h3>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-black border ${scoreColor}">${score}</span>
            </div>
            <div class="mt-5 space-y-3">
                <div>
                    <div class="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                        <span>Readiness</span><span>${score}%</span>
                    </div>
                    <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div class="h-full rounded-full ${barColor}" style="width:${score}%"></div>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="rounded-lg bg-rose-50 border border-rose-100 py-2"><div class="text-lg font-black text-rose-700">${ux.high || 0}</div><div class="text-[10px] text-rose-600">High</div></div>
                    <div class="rounded-lg bg-amber-50 border border-amber-100 py-2"><div class="text-lg font-black text-amber-700">${ux.medium || 0}</div><div class="text-[10px] text-amber-600">Medium</div></div>
                    <div class="rounded-lg bg-sky-50 border border-sky-100 py-2"><div class="text-lg font-black text-sky-700">${ux.low || 0}</div><div class="text-[10px] text-sky-600">Low</div></div>
                </div>
            </div>
        </div>
    </div>`;
}

// =============================================================================
// TAB: DASHBOARD
// =============================================================================
async function renderDashboard(container) {
    container.innerHTML = _skelSpinner();
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
            ${_adminActionCenterHtml(d)}
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
        container.innerHTML = `<div class="text-center py-20 text-red-500 text-sm">โหลดข้อมูลไม่ได้: ${escHtml(err.message)}</div>`;
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
    <div class="space-y-4 animate-fade-in">
        <!-- Filter bar -->
        <div class="flex flex-col sm:flex-row justify-between items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex items-center gap-2">
                <select id="filter-month" onchange="loadSchedules()" class="form-select text-sm border-slate-200 rounded-lg py-1.5 pl-3 pr-8 font-medium text-slate-700 bg-slate-50">${monthOpts}</select>
                <select id="filter-year"  onchange="loadSchedules()" class="form-select text-sm border-slate-200 rounded-lg py-1.5 pl-3 pr-8 font-medium text-slate-700 bg-slate-50">${yearOpts}</select>
                <button onclick="window.printScheduleReport()" class="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="พิมพ์รายงาน">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                </button>
                <button onclick="window._ptDownloadMonthlyPDF()" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-white shadow-sm" style="background:linear-gradient(135deg,#166534,#15803d)" title="ดาวน์โหลด PDF ตารางรายเดือน">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    PDF รายเดือน
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
        <!-- Info note -->
        <div class="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Sessions สร้างอัตโนมัติจาก Rotation Matrix ด้านล่าง — กำหนด Rotation แล้วกดปุ่ม "สร้าง Sessions อัตโนมัติ"
        </div>
        <!-- List / Calendar -->
        <div id="scheduler-content-wrapper">
            <div id="list-view-container" class="space-y-3 animate-fade-in">
                <div class="py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">กำลังโหลด...</div>
            </div>
            <div id="calendar-view-container" class="hidden bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div id="calendar"></div>
            </div>
        </div>
    </div>

    <!-- ══ SECTION: Team Management ══════════════════════════════════════ -->
    <div class="mt-8 space-y-4 animate-fade-in">
        <div class="flex items-center justify-between">
            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                จัดการทีม Safety Patrol (Top / คปอ. / Management)
            </p>
            <button onclick="window._ptAddTeam()" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm" style="background:linear-gradient(135deg,#065f46,#0d9488)">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                เพิ่มทีม
            </button>
        </div>
        <div id="pt-teams-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <div class="col-span-full flex justify-center py-10">
                <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
            </div>
        </div>
    </div>

    <!-- ══ SECTION: Rotation Matrix ══════════════════════════════════════ -->
    <div class="mt-8 space-y-4 animate-fade-in">
        <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                ตารางหมุนเวียนพื้นที่รายเดือน
            </p>
            <div class="flex items-center gap-2">
                <select id="rotation-year" class="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-400">
                    ${[cy-1,cy,cy+1].map(y=>`<option value="${y}" ${y===cy?'selected':''}>${y}</option>`).join('')}
                </select>
                <button onclick="window._ptLoadRotation()" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    โหลด
                </button>
                <button onclick="window._ptAutoFill()" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    Auto-fill ทั้งปี
                </button>
                <button id="pt-rot-save-btn" onclick="window._ptSaveRotation(this)" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    บันทึก Rotation
                </button>
                <button onclick="window._ptGenSessions()" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-white transition-colors shadow-sm" style="background:linear-gradient(135deg,#6366f1,#0284c7)">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    สร้าง Sessions อัตโนมัติ
                </button>
            </div>
        </div>
        <div class="card overflow-x-auto">
            <div id="pt-rotation-wrap">
                <div class="flex justify-center py-10">
                    <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- ══ SECTION: Member Rotation Matrix ══════════════════════════════════ -->
    <div class="mt-8 space-y-4 animate-fade-in">
        <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                ตารางสลับสมาชิกรายเดือน
            </p>
            <div class="flex flex-wrap items-center gap-2">
                <!-- Search box -->
                <div class="relative">
                    <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <input id="pt-member-rot-search" type="text" placeholder="ค้นหาสมาชิก..."
                        class="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 w-44"
                        oninput="window._ptFilterMemberMatrix(this.value)">
                </div>
                <button onclick="window._ptSwapTwoModal()" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
                    สลับสองคน
                </button>
                <button onclick="window._ptAutoFillModal()" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    Auto-fill สมาชิก
                </button>
                <button id="pt-mem-rot-save-btn" onclick="window._ptSaveMemberRotation(this)" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    บันทึก
                </button>
            </div>
        </div>
        <div class="card overflow-x-auto">
            <div id="pt-member-rotation-wrap">
                <div class="flex justify-center py-10">
                    <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- ══ SECTION: Member Schedule Report ══════════════════════════════════ -->
    <div class="mt-8 space-y-4 animate-fade-in">
        <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    รายงานตารางเดินตรวจรายบุคคล
                </p>
                <p class="text-[10px] text-slate-400 mt-0.5 ml-6">แสดงวันที่เดินของแต่ละคนทั้งปี · ส่งออก PDF สำหรับใช้งานองค์กร</p>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="window._ptLoadMemberSchedule()" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    โหลดข้อมูล
                </button>
                <button onclick="window._ptDownloadSchedulePDF()" class="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg text-white shadow-sm transition-colors" style="background:linear-gradient(135deg,#0f172a,#1e40af)">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    ดาวน์โหลด PDF
                </button>
            </div>
        </div>
        <div class="ds-section overflow-hidden">
            <div id="pt-schedule-report-wrap">
                <div class="text-center py-12 text-slate-400 text-sm">
                    <svg class="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    กด "โหลดข้อมูล" เพื่อดูรายงาน
                </div>
            </div>
        </div>
    </div>`;

    await loadSchedules();

    // Load patrol team sections
    await Promise.all([_ptLoadTeams(), _ptLoadRotation(), _ptLoadMemberRotation()]);
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


async function loadSchedules() {
    const lc    = document.getElementById('list-view-container');
    const month = document.getElementById('filter-month')?.value;
    const year  = document.getElementById('filter-year')?.value;
    if (lc) lc.innerHTML = _skelSpinner();
    try {
        const res  = await API.get(`/patrol/monthly-summary?month=${month}&year=${year}`);
        const data = res?.data || [];
        if (!lc) return;
        if (data.length === 0) {
            lc.innerHTML = `<div class="text-center py-16 text-slate-400 border border-dashed rounded-xl bg-slate-50 text-sm">ไม่มีกำหนดการในเดือนนี้ — กำหนด Rotation แล้วกดสร้าง Sessions</div>`;
        } else {
            const grouped = data.reduce((acc, cur) => {
                const d = (cur.ScheduledDate||'').split('T')[0];
                if (!acc[d]) acc[d] = [];
                acc[d].push(cur); return acc;
            }, {});
            const statusBg  = { Pending:'bg-amber-100 text-amber-700', Completed:'bg-emerald-100 text-emerald-700', Missed:'bg-red-100 text-red-600', Cancelled:'bg-slate-100 text-slate-400' };
            const roundLabel = { 1: 'รอบ 1', 2: 'รอบ 2' };
            lc.innerHTML = Object.entries(grouped).sort((a,b)=>new Date(a[0])-new Date(b[0])).map(([date,items])=>{
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
                            const isCancelled = item.Status === 'Cancelled';
                            const sc    = statusBg[item.Status] || 'bg-slate-100 text-slate-500';
                            const color = isCancelled ? '#94a3b8' : (item.TeamColor || '#6366f1');
                            const round = roundLabel[item.PatrolRound] || '';
                            return `
                            <div class="p-2.5 rounded-lg border flex justify-between items-center gap-2 transition-all ${isCancelled ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-slate-50 border-slate-100'}">
                                <div class="flex items-center gap-2 flex-1 min-w-0">
                                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${color}"></span>
                                    <span class="font-semibold text-xs truncate ${isCancelled ? 'line-through text-slate-400' : 'text-slate-700'}">${item.TeamName||'-'}</span>
                                    ${item.AreaName && !isCancelled ? `<span class="text-[10px] text-slate-400 truncate hidden sm:inline">${item.AreaName}</span>` : ''}
                                    ${isCancelled ? `<span class="text-[10px] text-slate-400 italic">ยกเลิกแล้ว</span>` : ''}
                                </div>
                                <div class="flex items-center gap-1.5 flex-shrink-0">
                                    ${round ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">${round}</span>` : ''}
                                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${sc}">${isCancelled ? 'ยกเลิก' : (item.Status||'Pending')}</span>
                                    <button onclick="window._ptToggleCancel('${item.id}',this)" class="${isCancelled ? 'text-emerald-400 hover:text-emerald-600' : 'text-slate-300 hover:text-orange-500'} p-1 transition-colors" title="${isCancelled ? 'เปิดใช้งานอีกครั้ง' : 'ยกเลิก session นี้'}">
                                        ${isCancelled
                                            ? `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
                                            : `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>`
                                        }
                                    </button>
                                    <button onclick="window.editSchedule('${item.id}','${(item.ScheduledDate||'').split('T')[0]}','${item.TeamName||''}','${item.AreaName||''}',${item.PatrolRound||1})" class="text-slate-300 hover:text-blue-500 p-1 transition-colors" title="แก้ไขวันที่">
                                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                    </button>
                                    <button onclick="deleteSchedule('${item.id}')" class="text-slate-300 hover:text-red-500 p-1 transition-colors" title="ลบ">
                                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                    </button>
                                </div>
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
    const statusColor = { Pending:'#f59e0b', Completed:'#10b981', Missed:'#ef4444' };
    const events = eventsData.map(item => {
        const bg = item.TeamColor || statusColor[item.Status] || '#6366f1';
        return {
            title: item.TeamName + (item.AreaName ? ` · ${item.AreaName}` : ''),
            start: (item.ScheduledDate||'').split('T')[0],
            backgroundColor: bg,
            borderColor:     bg,
            extendedProps: { status: item.Status, id: item.id },
        };
    });
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


window.deleteSchedule = async (id) => {
    if (!confirm('ลบ session นี้?')) return;
    try {
        const res = await API.delete(`/patrol/sessions/${id}`);
        if (res.success) { showToast('ลบเรียบร้อย', 'success'); loadSchedules(); }
        else showError(res.message);
    } catch (err) { showError(err.message); }
};

window.editSchedule = function(id, currentDate, teamName, areaName, round) {
    const statusOpts = ['Pending','Completed','Missed'].map(s =>
        `<option value="${s}">${s}</option>`
    ).join('');
    openModal('แก้ไข Session', `
    <div class="space-y-4">
        <div class="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600 space-y-0.5">
            <p class="font-semibold text-slate-800">${teamName}</p>
            <p class="text-xs text-slate-400">${areaName ? 'พื้นที่: '+areaName+' · ' : ''}รอบ ${round}</p>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่เดิน <span class="text-red-500">*</span></label>
            <input type="date" id="edit-session-date" value="${currentDate}" class="form-input w-full">
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานะ</label>
            <select id="edit-session-status" class="form-input w-full">${statusOpts}</select>
        </div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="button" onclick="window._doEditSchedule(${id},this)" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </div>`, 'max-w-sm');
};

window._doEditSchedule = async function(id, btn) {
    const dateVal   = document.getElementById('edit-session-date')?.value;
    const statusVal = document.getElementById('edit-session-status')?.value;
    if (!dateVal) { showToast('กรุณาเลือกวันที่', 'error'); return; }
    const orig = _btnLoad(btn, 'กำลังบันทึก...');
    try {
        await API.put(`/patrol/sessions/${id}`, { PatrolDate: dateVal, Status: statusVal });
        closeModal();
        showToast('แก้ไขเรียบร้อย', 'success');
        loadSchedules();
    } catch (err) {
        _btnRestore(btn, orig);
        showError(err.message);
    }
};

window.printScheduleReport = () => {
    const orig = document.title;
    document.title = `Patrol_Schedule_${new Date().toISOString().split('T')[0]}`;
    window.print();
    document.title = orig;
};

// =============================================================================
// PATROL TEAM MANAGEMENT (Scheduler sub-section)
// =============================================================================

const PT_GROUP_LABEL = { A: 'พุธที่ 1 & 3', B: 'พุธที่ 2 & 4' };
const PT_TYPE_LABEL  = {
    top:        'Top Management (1 ครั้ง/เดือน — รอบ 2)',
    management: 'Management (2 ครั้ง/เดือน — รอบ 1 & 2)',
    committee:  'คปอ. (1 ครั้ง/เดือน — รอบ 2)',
};
const MONTHS_TH_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

let _ptTeams = [];
let _ptAreas = [];

async function _ptLoadTeams() {
    try {
        const [tRes, aRes] = await Promise.all([
            API.get('/patrol/teams'),
            API.get('/patrol/areas'),
        ]);
        _ptTeams = tRes.data || [];
        _ptAreas = aRes.data || [];
    } catch { _ptTeams = []; _ptAreas = []; }
    _ptRenderTeams();
}

function _ptRenderTeams() {
    const grid = document.getElementById('pt-teams-grid');
    if (!grid) return;

    if (_ptTeams.length === 0) {
        grid.innerHTML = `
        <div class="col-span-full text-center py-12 text-slate-400">
            <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg class="w-7 h-7 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <p class="font-medium text-sm">ยังไม่มีทีม</p>
            <p class="text-xs mt-1">กดปุ่ม "เพิ่มทีม" เพื่อสร้างทีม Patrol</p>
        </div>`;
        return;
    }

    grid.innerHTML = _ptTeams.map(t => `
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <!-- Team header -->
        <div class="px-4 py-3 flex items-center justify-between border-b border-slate-100"
             style="background:linear-gradient(135deg,${t.Color}18,transparent)">
            <div class="flex items-center gap-2.5">
                <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${t.Color}"></span>
                <div>
                    <p class="font-bold text-slate-800 text-sm">${t.Name}</p>
                    <p class="text-[10px] text-slate-400">กลุ่ม ${t.PatrolGroup} · ${PT_GROUP_LABEL[t.PatrolGroup]}</p>
                </div>
            </div>
            <div class="flex items-center gap-1">
                <span class="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">${t.MemberCount} คน</span>
                <span id="pt-badge-${t.id}" class="text-[9px] px-1.5 py-0.5 rounded-full font-bold hidden"></span>
                <button onclick="window._ptEditTeam(${t.id})" class="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button onclick="window._ptDeleteTeam(${t.id},'${t.Name.replace(/'/g,"\\'")}')\" class="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        </div>
        <!-- Members -->
        <div id="pt-members-${t.id}" class="p-2 min-h-[60px]">
            <div class="text-center text-xs text-slate-400 py-3">กำลังโหลด...</div>
        </div>
        <!-- Add member button -->
        <div class="px-3 pb-3">
            <button onclick="window._ptAddMember(${t.id},'${t.Name.replace(/'/g,"\\'")}')\"
                class="w-full py-1.5 text-xs font-semibold rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                + เพิ่มสมาชิก
            </button>
        </div>
    </div>`).join('');

    // Load members for each team
    _ptTeams.forEach(t => _ptLoadMembers(t.id));
}

async function _ptLoadMembers(teamId) {
    const el = document.getElementById(`pt-members-${teamId}`);
    if (!el) return;
    try {
        const res = await API.get(`/patrol/teams/${teamId}/members`);
        const members = res.data || [];
        if (members.length === 0) {
            el.innerHTML = `<p class="text-center text-xs text-slate-300 py-3">ยังไม่มีสมาชิก</p>`;
            return;
        }
        const top   = members.filter(m => m.PatrolType === 'top');
        const mgmt  = members.filter(m => m.PatrolType === 'management');
        const comm  = members.filter(m => m.PatrolType === 'committee');

        // Validation badge in team card header
        const badge = document.getElementById(`pt-badge-${teamId}`);
        if (badge) {
            const missing = [];
            if (top.length === 0)  missing.push('ขาด Top');
            if (comm.length === 0) missing.push('ขาด คปอ.');
            if (missing.length > 0) {
                badge.textContent = missing.join(' · ');
                badge.className = 'text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700';
                badge.classList.remove('hidden');
            } else {
                badge.textContent = '✓ ครบ';
                badge.className = 'text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700';
                badge.classList.remove('hidden');
            }
        }

        const renderGroup = (list, label, color) => list.length === 0 ? '' : `
            <div class="px-2 pt-1.5">
                <p class="text-[9px] font-bold uppercase text-${color}-500 mb-1">${label}</p>
                ${list.map(m => `
                <div class="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <div class="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-${color}-100 text-${color}-600 text-[9px] font-bold">
                            ${(m.EmployeeName||'?').charAt(0)}
                        </div>
                        <p class="text-xs text-slate-700 truncate">${m.EmployeeName||m.EmployeeID||'—'}</p>
                    </div>
                    <button onclick="window._ptRemoveMember(${teamId},${m.id})"
                        class="p-1 text-slate-400 hover:text-red-500 flex-shrink-0 transition-colors" title="ลบออกจากทีม">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>`).join('')}
            </div>`;
        el.innerHTML = renderGroup(top, 'Top Management · 1×/เดือน', 'rose')
                     + renderGroup(comm, 'คปอ. · 1×/เดือน', 'amber')
                     + renderGroup(mgmt, 'Management · 2×/เดือน', 'indigo');
    } catch { el.innerHTML = `<p class="text-center text-xs text-red-400 py-3">โหลดไม่ได้</p>`; }
}

// ── Add / Edit Team modal ──────────────────────────────────────────────────────
window._ptAddTeam = function() {
    openModal('เพิ่มทีม Patrol', `
    <form id="pt-team-form" class="space-y-4">
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อทีม <span class="text-red-500">*</span></label>
            <input name="Name" required placeholder="เช่น ทีม 1" class="form-input w-full">
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">กลุ่มวันเดิน <span class="text-red-500">*</span></label>
            <select name="PatrolGroup" class="form-input w-full">
                <option value="A">กลุ่ม A — พุธที่ 1 & 3 ของเดือน</option>
                <option value="B">กลุ่ม B — พุธที่ 2 & 4 ของเดือน</option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">สีทีม</label>
            <input type="color" name="Color" value="#6366f1" class="h-9 w-full rounded-lg border border-slate-200 cursor-pointer">
        </div>
        <div id="pt-team-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-md');
    setTimeout(() => {
        document.getElementById('pt-team-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await API.post('/patrol/teams', { Name: fd.get('Name'), PatrolGroup: fd.get('PatrolGroup'), Color: fd.get('Color') });
                closeModal(); showToast('เพิ่มทีมสำเร็จ', 'success');
                await _ptLoadTeams();
            } catch (err) {
                const el = document.getElementById('pt-team-err');
                if (el) { el.textContent = err.message; el.classList.remove('hidden'); }
            }
        });
    }, 50);
};

window._ptEditTeam = function(id) {
    const t = _ptTeams.find(x => x.id === id);
    if (!t) return;
    openModal('แก้ไขทีม', `
    <form id="pt-team-form" class="space-y-4">
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อทีม</label>
            <input name="Name" required value="${t.Name}" class="form-input w-full">
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">กลุ่มวันเดิน</label>
            <select name="PatrolGroup" class="form-input w-full">
                <option value="A" ${t.PatrolGroup==='A'?'selected':''}>กลุ่ม A — พุธที่ 1 & 3 ของเดือน</option>
                <option value="B" ${t.PatrolGroup==='B'?'selected':''}>กลุ่ม B — พุธที่ 2 & 4 ของเดือน</option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">สีทีม</label>
            <input type="color" name="Color" value="${t.Color||'#6366f1'}" class="h-9 w-full rounded-lg border border-slate-200 cursor-pointer">
        </div>
        <div id="pt-team-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-md');
    setTimeout(() => {
        document.getElementById('pt-team-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await API.put(`/patrol/teams/${id}`, { Name: fd.get('Name'), PatrolGroup: fd.get('PatrolGroup'), Color: fd.get('Color') });
                closeModal(); showToast('บันทึกสำเร็จ', 'success');
                await _ptLoadTeams();
            } catch (err) {
                const el = document.getElementById('pt-team-err');
                if (el) { el.textContent = err.message; el.classList.remove('hidden'); }
            }
        });
    }, 50);
};

window._ptDeleteTeam = async function(id, name) {
    if (!confirm(`ลบทีม "${name}" และสมาชิกทั้งหมด?`)) return;
    try {
        await API.delete(`/patrol/teams/${id}`);
        showToast('ลบทีมสำเร็จ', 'success');
        await _ptLoadTeams();
    } catch (err) { showError(err.message); }
};

// ── Add Member modal ───────────────────────────────────────────────────────────
window._ptAddMember = async function(teamId, teamName) {
    let empList = [];
    try { const r = await API.get('/employees'); empList = r.data || r || []; } catch { empList = []; }

    const selected = new Set(); // เก็บ EmployeeID ที่เลือกไว้ข้ามการค้นหา

    const renderList = (filter = '') => {
        const q = filter.toLowerCase();
        const filtered = empList.filter(e =>
            !q ||
            (e.EmployeeName||'').toLowerCase().includes(q) ||
            (e.EmployeeID||'').toLowerCase().includes(q) ||
            (e.Department||'').toLowerCase().includes(q)
        );
        if (filtered.length === 0) return `<p class="text-center text-xs text-slate-400 py-6">ไม่พบพนักงาน</p>`;
        return filtered.map(e => `
            <label class="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors">
                <input type="checkbox" class="pt-mem-cb w-4 h-4 rounded accent-emerald-600 flex-shrink-0"
                    value="${e.EmployeeID}" ${selected.has(e.EmployeeID) ? 'checked' : ''}>
                <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-800 truncate">${e.EmployeeName||e.EmployeeID}</p>
                    <p class="text-[10px] text-slate-400 truncate">${e.EmployeeID}${e.Department ? ' · '+e.Department : ''}${e.Position ? ' · '+e.Position : ''}</p>
                </div>
            </label>`).join('');
    };

    openModal(`เพิ่มสมาชิก — ${teamName}`, `
    <div class="space-y-4">
        <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">ประเภท <span class="text-red-500">*</span></label>
            <select id="pt-mem-type" class="form-input w-full text-sm">
                <option value="top">Top Management — เดิน 1 ครั้ง/เดือน</option>
                <option value="committee">คปอ. — เดิน 1 ครั้ง/เดือน</option>
                <option value="management">Management — เดิน 2 ครั้ง/เดือน</option>
            </select>
            <div class="text-[10px] text-slate-400 mt-1.5 flex gap-3 flex-wrap">
                <span><span class="font-bold text-rose-500">Top</span>: ผจก.ทั่วไป / ผช.ผจก. / ผู้อำนวยการ</span>
                <span><span class="font-bold text-amber-500">คปอ.</span>: คณะกรรมการความปลอดภัย</span>
                <span><span class="font-bold text-indigo-500">Management</span>: ผู้จัดการ / ผู้ชำนาญการพิเศษ</span>
            </div>
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เลือกพนักงาน</label>
            <div class="relative mb-2">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input id="pt-mem-search" type="text" placeholder="ค้นหาชื่อ รหัส หน่วยงาน..."
                    class="form-input w-full pl-9 text-sm" autocomplete="off">
            </div>
            <div class="border border-slate-200 rounded-xl overflow-hidden">
                <div class="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                    <label class="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
                        <input type="checkbox" id="pt-mem-selectall" class="w-4 h-4 rounded accent-emerald-600">
                        เลือกทั้งหมดที่แสดง
                    </label>
                    <span id="pt-mem-count" class="text-xs font-semibold text-emerald-600">เลือก 0 คน</span>
                </div>
                <div id="pt-mem-list" class="overflow-y-auto max-h-52 divide-y divide-slate-50">
                    ${renderList()}
                </div>
            </div>
        </div>
        <div id="pt-mem-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="px-5 py-2 rounded-xl text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">ยกเลิก</button>
            <button id="pt-mem-submit" class="px-5 py-2 rounded-xl text-sm font-bold text-white transition-colors" style="background:linear-gradient(135deg,#059669,#0d9488)">เพิ่มสมาชิก</button>
        </div>
    </div>`, 'max-w-lg');

    setTimeout(() => {
        const searchEl   = document.getElementById('pt-mem-search');
        const listEl     = document.getElementById('pt-mem-list');
        const countEl    = document.getElementById('pt-mem-count');
        const selectAll  = document.getElementById('pt-mem-selectall');
        const submitBtn  = document.getElementById('pt-mem-submit');
        const errEl      = document.getElementById('pt-mem-err');

        const updateCount = () => {
            if (countEl) countEl.textContent = `เลือก ${selected.size} คน`;
            const cbs = listEl.querySelectorAll('.pt-mem-cb');
            const checkedInView = listEl.querySelectorAll('.pt-mem-cb:checked').length;
            selectAll.indeterminate = checkedInView > 0 && checkedInView < cbs.length;
            selectAll.checked = cbs.length > 0 && checkedInView === cbs.length;
        };

        // sync checkbox change → selected Set
        const bindListEvents = () => {
            listEl.querySelectorAll('.pt-mem-cb').forEach(cb => {
                cb.addEventListener('change', () => {
                    cb.checked ? selected.add(cb.value) : selected.delete(cb.value);
                    updateCount();
                });
            });
        };
        bindListEvents();

        searchEl?.addEventListener('input', () => {
            listEl.innerHTML = renderList(searchEl.value);
            bindListEvents();
            updateCount();
        });

        selectAll?.addEventListener('change', () => {
            listEl.querySelectorAll('.pt-mem-cb').forEach(cb => {
                cb.checked = selectAll.checked;
                selectAll.checked ? selected.add(cb.value) : selected.delete(cb.value);
            });
            updateCount();
        });

        submitBtn?.addEventListener('click', async () => {
            const checked = [...selected];
            const patrolType = document.getElementById('pt-mem-type')?.value;
            if (checked.length === 0) { if (errEl) { errEl.textContent = 'กรุณาเลือกพนักงานอย่างน้อย 1 คน'; errEl.classList.remove('hidden'); } return; }
            submitBtn.disabled = true; submitBtn.textContent = 'กำลังเพิ่ม...';
            let ok = 0; const failMsgs = [];
            for (const empId of checked) {
                try {
                    await API.post(`/patrol/teams/${teamId}/members`, { EmployeeID: empId, PatrolType: patrolType });
                    ok++;
                } catch (e) { failMsgs.push(`${empId}: ${e?.message || 'ล้มเหลว'}`); }
            }
            if (failMsgs.length > 0 && ok === 0) {
                // all failed — stay in modal and show error
                submitBtn.disabled = false; submitBtn.textContent = 'เพิ่มสมาชิก';
                if (errEl) { errEl.textContent = failMsgs[0]; errEl.classList.remove('hidden'); }
                return;
            }
            closeModal();
            showToast(`เพิ่มสมาชิก ${ok} คนสำเร็จ${failMsgs.length ? ` (ล้มเหลว ${failMsgs.length})` : ''}`, failMsgs.length ? 'warning' : 'success');
            _ptLoadMembers(teamId);
            await _ptLoadTeams();
        });
    }, 50);
};

window._ptRemoveMember = async function(teamId, memberId) {
    if (!confirm('ลบสมาชิกออกจากทีม?')) return;
    try {
        await API.delete(`/patrol/teams/${teamId}/members/${memberId}`);
        showToast('ลบสมาชิกสำเร็จ', 'success');
        _ptLoadMembers(teamId);
        await _ptLoadTeams();
    } catch (err) { showError(err.message); }
};

// ── Toggle Cancel Session ──────────────────────────────────────────────────────
window._ptToggleCancel = async function(sessionId, btn) {
    if (!btn) return;
    const isCancelled = btn.title === 'เปิดใช้งานอีกครั้ง';
    const confirmMsg = isCancelled ? 'เปิดใช้งาน session นี้อีกครั้ง?' : 'ยกเลิก session นี้?';
    if (!confirm(confirmMsg)) return;
    const orig = _btnLoad(btn);
    try {
        const res = await API.patch(`/patrol/sessions/${sessionId}/toggle-cancel`);
        const newStatus = res.status || (isCancelled ? 'Pending' : 'Cancelled');
        showToast(newStatus === 'Cancelled' ? 'ยกเลิก session แล้ว' : 'เปิดใช้งาน session แล้ว', 'success');
        await loadSchedules();
    } catch (err) {
        _btnRestore(btn, orig);
        showError(err?.message || 'ไม่สามารถเปลี่ยนสถานะ session ได้');
    }
};

// ── Rotation Matrix ────────────────────────────────────────────────────────────
// _rotationData[teamId][month] = areaId
let _rotationData = {};

window._ptLoadRotation = async function() {
    const year = parseInt(document.getElementById('rotation-year')?.value || new Date().getFullYear());
    const wrap = document.getElementById('pt-rotation-wrap');
    if (!wrap) return;

    wrap.innerHTML = `<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div></div>`;

    try {
        // โหลด rotation ทุก 12 เดือน concurrently
        const [tRes, aRes] = await Promise.all([
            API.get('/patrol/teams'),
            API.get('/patrol/areas'),
        ]);
        _ptTeams = tRes.data || [];
        _ptAreas = aRes.data || [];

        const monthResults = await Promise.all(
            Array.from({length:12},(_,i) => i+1).map(m =>
                API.get(`/patrol/rotation?year=${year}&month=${m}`).catch(() => ({ data: [] }))
            )
        );

        // สร้าง lookup _rotationData[teamId][month] = { r1: areaId|null, r2: areaId|null }
        _rotationData = {};
        monthResults.forEach((res, idx) => {
            const month = idx + 1;
            (res.data || []).forEach(r => {
                if (!_rotationData[r.TeamID]) _rotationData[r.TeamID] = {};
                if (!_rotationData[r.TeamID][month]) _rotationData[r.TeamID][month] = { r1: null, r2: null };
                const rnd = Number(r.PatrolRound);
                if (rnd === 0) { // legacy: apply to both rounds
                    _rotationData[r.TeamID][month].r1 = r.AreaID;
                    _rotationData[r.TeamID][month].r2 = r.AreaID;
                } else if (rnd === 1) {
                    _rotationData[r.TeamID][month].r1 = r.AreaID;
                } else if (rnd === 2) {
                    _rotationData[r.TeamID][month].r2 = r.AreaID;
                }
            });
        });

        _ptRenderRotationMatrix(year);
    } catch (err) {
        wrap.innerHTML = `<div class="text-center py-10 text-red-500 text-sm">${escHtml(err.message)}</div>`;
    }
};

function _ptRenderRotationMatrix(year) {
    const wrap = document.getElementById('pt-rotation-wrap');
    if (!wrap || _ptTeams.length === 0) {
        if (wrap) wrap.innerHTML = `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีทีม กรุณาสร้างทีมก่อน</div>`;
        return;
    }

    const areaOptions = _ptAreas.map(a => `<option value="${a.id}">${a.Name}</option>`).join('');
    window._styleRotCell = (sel) => {
        const isNone = sel.value === '';
        sel.style.background   = isNone ? '#fef2f2' : '';
        sel.style.color        = isNone ? '#dc2626' : '';
        sel.style.borderColor  = isNone ? '#fca5a5' : '';
    };

    wrap.innerHTML = `
    <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse min-w-[900px]">
            <thead>
                <tr class="bg-slate-50 border-b-2 border-slate-200">
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50 z-10 whitespace-nowrap">ทีม</th>
                    <th class="px-2 py-3 text-xs font-semibold text-slate-400 text-center">กลุ่ม</th>
                    ${MONTHS_TH_SHORT.map((m,i) => `
                    <th class="px-2 py-3 text-xs font-semibold text-slate-500 text-center whitespace-nowrap">
                        ${m}<br><span class="text-[9px] text-slate-400 font-normal">${_getWednesdays(year, i+1)}</span>
                    </th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${_ptTeams.map(t => `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-2.5 sticky left-0 bg-white z-10">
                        <div class="flex items-center gap-2 whitespace-nowrap">
                            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${t.Color}"></span>
                            <span class="text-sm font-semibold text-slate-800">${t.Name}</span>
                        </div>
                    </td>
                    <td class="px-2 py-2.5 text-center">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${t.PatrolGroup==='A'?'bg-blue-100 text-blue-700':'bg-purple-100 text-purple-700'}">
                            ${t.PatrolGroup}
                        </span>
                    </td>
                    ${Array.from({length:12},(_,i)=>i+1).map(month =>
                        `<td class="px-1 py-1.5">${_ptRotCellHtml(t.id, month, year)}</td>`
                    ).join('')}
                </tr>`).join('')}
            </tbody>
        </table>
    </div>
    <div class="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
        <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        แต่ละเดือน ทีมเดินพื้นที่เดิมทั้ง 2 ครั้ง (2 วันพุธ) · Top Mgmt &amp; คปอ. เดินรอบ 2 เท่านั้น · Management เดินทั้ง 2 รอบ · กด "Auto-fill ทั้งปี" เพื่อ fill อัตโนมัติ
    </div>`;
}

// คืน string วันพุธของเดือน เช่น "A:7,21 B:14,28"
function _getWednesdays(year, month) {
    const d = new Date(year, month - 1, 1);
    while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
    const weeks = [];
    while (d.getMonth() === month - 1) { weeks.push(d.getDate()); d.setDate(d.getDate() + 7); }
    return `A:${weeks[0]||''},${weeks[2]||''} B:${weeks[1]||''},${weeks[3]||''}`;
}

// คืน array วันพุธจริง เช่น [7, 14, 21, 28]
function _getWednesdayDates(year, month) {
    const d = new Date(year, month - 1, 1);
    while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
    const dates = [];
    while (d.getMonth() === month - 1) { dates.push(d.getDate()); d.setDate(d.getDate() + 7); }
    return dates;
}

// สร้าง HTML ปุ่ม cell สำหรับ rotation matrix
function _ptRotCellHtml(teamId, month, year) {
    const rd = (_rotationData[teamId]||{})[month]; // undefined | {r1,r2}
    const getLabel = (areaId) => {
        if (!areaId) return null;
        const a = _ptAreas.find(x => x.id == areaId);
        return a ? (a.Code || a.Name) : '?';
    };

    let inner = '', btnCls = '';
    if (!rd) {
        inner = `<span class="text-slate-300 text-[10px]">ยังไม่ตั้ง</span>`;
        btnCls = 'border-dashed border-slate-200 bg-slate-50 hover:border-violet-300';
    } else {
        const l1 = getLabel(rd.r1), l2 = getLabel(rd.r2);
        if (!l1 && !l2) {
            inner = `<span class="text-red-500 text-[10px] font-semibold">ไม่มีเดิน</span>`;
            btnCls = 'border-red-200 bg-red-50 hover:border-red-300';
        } else if (l1 && l2 && rd.r1 == rd.r2) {
            inner = `<span class="text-emerald-800 text-[10px] font-semibold">${l1}</span>`;
            btnCls = 'border-emerald-200 bg-emerald-50 hover:border-violet-400';
        } else {
            const b1 = l1
                ? `<span class="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">1:${l1}</span>`
                : `<span class="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-500">1:✕</span>`;
            const b2 = l2
                ? `<span class="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">2:${l2}</span>`
                : `<span class="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-500">2:✕</span>`;
            inner = `<div class="flex flex-col gap-0.5">${b1}${b2}</div>`;
            btnCls = 'border-violet-200 bg-violet-50 hover:border-violet-400';
        }
    }
    return `<button onclick="window._ptOpenRoundModal(${teamId},${month},${year})"
        class="rot-cell-btn w-full rounded-lg px-2 py-1.5 border text-left transition-colors ${btnCls}"
        data-team="${teamId}" data-month="${month}" style="min-width:80px">${inner}</button>`;
}

// ── Per-round popup ────────────────────────────────────────────────────────────
window._ptOpenRoundModal = function(teamId, month, year) {
    const team = _ptTeams.find(t => t.id === teamId);
    if (!team) return;

    const monthName  = MONTHS_TH_SHORT[month - 1];
    const isA        = team.PatrolGroup === 'A';
    const weds       = _getWednesdayDates(year, month);  // [d1,d2,d3,d4]
    const r1Date     = isA ? weds[0] : weds[1];
    const r2Date     = isA ? weds[2] : weds[3];

    const rd         = (_rotationData[teamId]||{})[month] || { r1: null, r2: null };

    const areaOpts   = `<option value="">— ไม่มีเดิน —</option>` +
        _ptAreas.map(a => `<option value="${a.id}">${a.Code ? a.Code + ' — ' : ''}${a.Name}</option>`).join('');

    const sel = (val) => areaOpts.replace(`value="${val}"`, `value="${val}" selected`);

    openModal(`${team.Name} — ${monthName}`, `
    <div class="space-y-3">
        <div class="flex items-center gap-2 text-xs">
            <span class="px-2 py-0.5 rounded-full font-bold ${isA ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}">${team.PatrolGroup}</span>
            <span class="text-slate-400">เดินพุธ${isA ? 'ที่ 1 & 3' : 'ที่ 2 & 4'} ปี ${year}</span>
        </div>
        <div class="space-y-2.5">
            <div class="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <label class="block text-xs font-bold text-slate-600 mb-1.5">
                    รอบ 1 — พุธที่ ${r1Date} ${monthName}
                </label>
                <select id="rnd-r1" class="form-input w-full text-sm">${sel(rd.r1)}</select>
            </div>
            <div class="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <label class="block text-xs font-bold text-slate-600 mb-1.5">
                    รอบ 2 — พุธที่ ${r2Date} ${monthName}
                </label>
                <select id="rnd-r2" class="form-input w-full text-sm">${sel(rd.r2)}</select>
            </div>
        </div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button onclick="window.closeModal&&window.closeModal()" class="px-5 py-2 rounded-xl text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">ยกเลิก</button>
            <button id="rnd-save-btn" class="px-5 py-2 rounded-xl text-sm font-bold text-white" style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก</button>
        </div>
    </div>`, 'max-w-sm');

    setTimeout(() => {
        document.getElementById('rnd-save-btn')?.addEventListener('click', () => {
            const v1 = document.getElementById('rnd-r1')?.value;
            const v2 = document.getElementById('rnd-r2')?.value;
            if (!_rotationData[teamId]) _rotationData[teamId] = {};
            _rotationData[teamId][month] = { r1: v1 ? parseInt(v1) : null, r2: v2 ? parseInt(v2) : null };
            // update button in-place (no full re-render)
            const td = document.querySelector(`.rot-cell-btn[data-team="${teamId}"][data-month="${month}"]`)?.parentElement;
            if (td) td.innerHTML = _ptRotCellHtml(teamId, month, year);
            closeModal();
        });
    }, 50);
};

// ── Auto-fill Rotation Matrix ──────────────────────────────────────────────────
// กด "Auto-fill ทั้งปี" → ระบบวนพื้นที่ +1 ทุกเดือนอัตโนมัติ
// อัลกอริทึม:
//   • ทีม T เริ่มต้นที่ areas[startIdx[T]] ในเดือน 1
//   • เดือน M → area = areas[(startIdx[T] + M - 1) % areas.length]
//   • ทีมแต่ละทีมเริ่มต้น offset กัน 1 area เพื่อไม่ให้ชนกัน
//   • สมาชิกในทีมตามไปกับทีม (PatrolType top=รอบ1, management=ทั้ง2รอบ)

window._ptAutoFill = function() {
    if (_ptTeams.length === 0 || _ptAreas.length === 0) {
        showToast('ต้องมีทีมและพื้นที่ก่อน', 'error');
        return;
    }

    const areaIds = _ptAreas.map(a => a.id);

    // Build team rows for starting area selection
    const teamRows = _ptTeams.map((t, idx) => {
        // Default: spread teams across areas offset by index
        const defaultAreaId = areaIds[idx % areaIds.length];
        return `
        <div class="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${t.Color}"></span>
            <span class="text-sm font-semibold text-slate-700 w-32 truncate">${t.Name}</span>
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.PatrolGroup==='A'?'bg-blue-100 text-blue-700':'bg-purple-100 text-purple-700'}">${t.PatrolGroup}</span>
            <select data-autofill-team="${t.id}" class="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-violet-400">
                ${_ptAreas.map(a => `<option value="${a.id}" ${a.id==defaultAreaId?'selected':''}>${a.Code ? a.Code+' — ' : ''}${a.Name}</option>`).join('')}
            </select>
        </div>`;
    }).join('');

    const monthOpts = MONTHS_TH_SHORT.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');

    openModal('Auto-fill ตารางหมุนเวียนพื้นที่', `
    <div class="space-y-4">
        <div class="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-xs text-violet-700 space-y-1">
            <p class="font-bold">วิธีการหมุนเวียน</p>
            <p>• กำหนดพื้นที่เริ่มต้นของแต่ละทีม แล้วระบบเลื่อน +1 พื้นที่ทุกเดือน</p>
            <p>• เดือนนอกช่วงที่เลือกจะไม่ถูกเปลี่ยน</p>
        </div>
        <!-- Month range -->
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เดือนเริ่มต้น</label>
                <select id="af-rot-from" class="form-input w-full text-sm">${monthOpts}</select>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เดือนสิ้นสุด</label>
                <select id="af-rot-to" class="form-input w-full text-sm">${monthOpts.replace('value="12"', 'value="12" selected')}</select>
            </div>
        </div>
        <div>
            <p class="text-sm font-semibold text-slate-700 mb-2">พื้นที่เริ่มต้น (เดือนแรกที่เลือก)</p>
            <div class="border border-slate-200 rounded-xl overflow-hidden">
                ${teamRows}
            </div>
        </div>
        <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="button" onclick="window._ptDoAutoFill()" class="btn px-5 font-bold text-white" style="background:linear-gradient(135deg,#7c3aed,#6366f1)">
                <svg class="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                Fill
            </button>
        </div>
    </div>`, 'max-w-lg');
};

window._ptDoAutoFill = function() {
    const areaIds = _ptAreas.map(a => a.id);
    if (areaIds.length === 0) return;

    const fromMonth = parseInt(document.getElementById('af-rot-from')?.value || 1);
    const toMonth   = parseInt(document.getElementById('af-rot-to')?.value   || 12);
    if (fromMonth > toMonth) { showToast('เดือนเริ่มต้นต้องไม่เกินเดือนสิ้นสุด', 'warning'); return; }
    const year = parseInt(document.getElementById('rotation-year')?.value || new Date().getFullYear());

    document.querySelectorAll('[data-autofill-team]').forEach(sel => {
        const teamId   = parseInt(sel.dataset.autofillTeam);
        const startId  = parseInt(sel.value);
        const startIdx = areaIds.indexOf(startId);
        if (!_rotationData[teamId]) _rotationData[teamId] = {};

        for (let month = fromMonth; month <= toMonth; month++) {
            const areaId = areaIds[(startIdx + (month - fromMonth)) % areaIds.length];
            _rotationData[teamId][month] = { r1: areaId, r2: areaId };
        }
    });

    closeModal();
    // Re-render only the buttons in the affected month columns
    _ptTeams.forEach(t => {
        for (let month = fromMonth; month <= toMonth; month++) {
            const td = document.querySelector(`.rot-cell-btn[data-team="${t.id}"][data-month="${month}"]`)?.parentElement;
            if (td) td.innerHTML = _ptRotCellHtml(t.id, month, year);
        }
    });

    const rangeLabel = fromMonth === toMonth
        ? MONTHS_TH_SHORT[fromMonth - 1]
        : `${MONTHS_TH_SHORT[fromMonth - 1]} – ${MONTHS_TH_SHORT[toMonth - 1]}`;
    showToast(`Auto-fill ${rangeLabel} เรียบร้อย — กด "บันทึก Rotation" เพื่อยืนยัน`, 'success');
};

window._ptSaveRotation = async function(btn) {
    const year = parseInt(document.getElementById('rotation-year')?.value || new Date().getFullYear());

    // Only send cells that were explicitly set (exist in _rotationData)
    // Skip undefined cells (never opened/touched) to avoid inserting sentinels for everything
    const items = [];
    _ptTeams.forEach(t => {
        for (let month = 1; month <= 12; month++) {
            const rd = (_rotationData[t.id]||{})[month];
            if (rd === undefined) return; // never touched — leave DB unchanged
            items.push({ TeamID: t.id, r1: rd.r1 || null, r2: rd.r2 || null, Year: year, Month: month });
        }
    });
    if (!items.length) { showToast('ยังไม่มีข้อมูลที่แก้ไข', 'warning'); return; }

    // Loading state
    const saveBtn = btn || document.getElementById('pt-rot-save-btn');
    const origHtml = saveBtn?.innerHTML;
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> กำลังบันทึก...`;
    }
    try {
        const res = await API.post('/patrol/rotation', items);
        showToast(`บันทึก Rotation สำเร็จ (${res.saved} รายการ)`, 'success');
    } catch (err) {
        showError(err.message);
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = origHtml; }
    }
};

window._ptGenSessions = function() {
    const year = parseInt(document.getElementById('rotation-year')?.value || new Date().getFullYear());
    const curMonth = parseInt(document.getElementById('filter-month')?.value || new Date().getMonth() + 1);
    const monthOpts = MONTHS_TH_SHORT.map((m,i) => `<option value="${i+1}" ${i+1===curMonth?'selected':''}>${m} ${year}</option>`).join('');
    openModal('สร้าง Sessions อัตโนมัติ', `
    <div class="space-y-4">
        <p class="text-sm text-slate-600">ระบบจะสร้าง Patrol Sessions จากตารางหมุนเวียนที่ตั้งไว้ โดยอิงวันพุธตามกลุ่ม A / B อัตโนมัติ</p>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">เลือกเดือน</label>
            <select id="gen-month" class="form-input w-full">${monthOpts}</select>
        </div>
        <div id="gen-result" class="hidden text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2"></div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button id="gen-btn" onclick="window._ptDoGenerate(${year})" class="btn btn-primary px-5">สร้าง Sessions</button>
        </div>
    </div>`, 'max-w-sm');
};

window._ptDoGenerate = async function(year) {
    const month = parseInt(document.getElementById('gen-month')?.value);
    const btn   = document.getElementById('gen-btn');
    const res   = document.getElementById('gen-result');
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังสร้าง...'; }
    try {
        const r = await API.post('/patrol/generate-sessions', { year, month });
        if (res) { res.textContent = r.message || `สร้าง ${r.created} sessions สำเร็จ`; res.classList.remove('hidden'); }
        if (btn) { btn.disabled = false; btn.textContent = 'สร้าง Sessions'; }
        showToast(r.message || 'สร้าง Sessions สำเร็จ', 'success');
        loadSchedules(); // refresh calendar/list view
    } catch (err) {
        showError(err.message);
        if (btn) { btn.disabled = false; btn.textContent = 'สร้าง Sessions'; }
    }
};

// =============================================================================
// MEMBER ROTATION MATRIX
// =============================================================================

// _memberBase[employeeID] = { EmployeeID, TeamID, PatrolType, EmployeeName, TeamName, PatrolGroup, Color }
// _memberMonthly[employeeID][month] = TeamID
let _memberBase    = [];
let _memberMonthly = {};
let _lockedCells   = new Set(); // key = `${empId}_${month}`, persisted per year in localStorage

async function _ptLoadMemberRotation() {
    const year = parseInt(document.getElementById('rotation-year')?.value || new Date().getFullYear());
    const wrap = document.getElementById('pt-member-rotation-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div></div>`;
    try {
        const res = await API.get(`/patrol/member-rotation?year=${year}`);
        _memberBase    = res.base    || [];
        _memberMonthly = {};
        (res.monthly || []).forEach(r => {
            if (!_memberMonthly[r.EmployeeID]) _memberMonthly[r.EmployeeID] = {};
            _memberMonthly[r.EmployeeID][r.Month] = r.TeamID;
        });
        _ptRenderMemberMatrix(year);
    } catch (err) {
        wrap.innerHTML = `<div class="text-center py-10 text-red-500 text-sm">${escHtml(err.message)}</div>`;
    }
}

function _ptRenderMemberMatrix(year) {
    const wrap = document.getElementById('pt-member-rotation-wrap');
    if (!wrap) return;
    if (_memberBase.length === 0) {
        wrap.innerHTML = `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีสมาชิก กรุณาเพิ่มสมาชิกในทีมก่อน</div>`;
        return;
    }

    // Load lock state from localStorage
    const _lockKey = `patrol_rot_locks_${year}`;
    _lockedCells = new Set(JSON.parse(localStorage.getItem(_lockKey) || '[]'));

    const groupA = _memberBase.filter(m => m.PatrolGroup === 'A');
    const groupB = _memberBase.filter(m => m.PatrolGroup === 'B');

    const teamsA = _ptTeams.filter(t => t.PatrolGroup === 'A');
    const teamsB = _ptTeams.filter(t => t.PatrolGroup === 'B');

    // Feature 1: unified optgroup — ทุกทีมให้เลือกได้
    const teamOptsAll =
        (teamsA.length ? `<optgroup label="กลุ่ม A — พุธ 1&3">${teamsA.map(t => `<option value="${t.id}" data-group="A">${t.Name}</option>`).join('')}</optgroup>` : '') +
        (teamsB.length ? `<optgroup label="กลุ่ม B — พุธ 2&4">${teamsB.map(t => `<option value="${t.id}" data-group="B">${t.Name}</option>`).join('')}</optgroup>` : '');

    const typeColor = { top: 'rose', committee: 'amber', management: 'indigo' };
    const typeLabel = { top: 'Top', committee: 'คปอ.', management: 'Mgmt' };
    const lockSvgOn  = `<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>`;
    const lockSvgOff = `<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 018 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/></svg>`;

    const renderRows = (members) => members.map(m => {
        const tColor = typeColor[m.PatrolType] || 'slate';
        const tLabel = typeLabel[m.PatrolType] || m.PatrolType;
        const empId  = m.EmployeeID;

        const monthCells = Array.from({length:12},(_,i) => i+1).map(month => {
            const selected   = (_memberMonthly[empId] || {})[month] || m.TeamID;
            const isChanged  = selected !== m.TeamID;
            const crossTeam  = _ptTeams.find(t => t.id === selected);
            const isCross    = crossTeam && crossTeam.PatrolGroup !== m.PatrolGroup;
            const isLocked   = _lockedCells.has(`${empId}_${month}`);

            let selCls = 'border-slate-200';
            if (isLocked)       selCls = 'border-amber-300 bg-amber-50';
            else if (isCross)   selCls = 'border-amber-300 bg-amber-50 text-amber-700 font-semibold';
            else if (isChanged) selCls = 'border-violet-300 bg-violet-50 text-violet-700 font-semibold';

            return `<td class="px-0.5 py-1">
                <div class="flex items-center gap-0.5">
                    <select data-member="${empId}" data-month="${month}" data-default="${m.TeamID}" data-group="${m.PatrolGroup}"
                        class="member-rot-cell flex-1 text-[10px] border rounded-md px-1 py-0.5 outline-none focus:border-violet-400 bg-white transition-colors ${selCls}"
                        style="min-width:60px" onchange="window._ptMarkChanged(this)" ${isLocked ? 'disabled' : ''}>
                        ${teamOptsAll.replace(`value="${selected}"`, `value="${selected}" selected`)}
                    </select>
                    <button onclick="window._ptToggleLock('${empId}',${month},${year})"
                        class="flex-shrink-0 p-0.5 rounded transition-colors ${isLocked ? 'text-amber-500 hover:text-amber-600' : 'text-slate-200 hover:text-slate-400'}"
                        title="${isLocked ? 'ปลดล็อค' : 'ล็อค (Auto-fill จะข้าม)'}">
                        ${isLocked ? lockSvgOn : lockSvgOff}
                    </button>
                </div>
            </td>`;
        }).join('');

        return `
        <tr class="member-rot-row border-b border-slate-100 hover:bg-slate-50 transition-colors" data-name="${(m.EmployeeName||empId).toLowerCase()}">
            <td class="px-3 py-2 sticky left-0 bg-white z-10 whitespace-nowrap">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${m.Color}"></span>
                    <span class="text-xs font-semibold text-slate-800">${m.EmployeeName||empId}</span>
                </div>
            </td>
            <td class="px-2 py-2 text-center">
                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-${tColor}-100 text-${tColor}-700">${tLabel}</span>
            </td>
            <td class="px-2 py-2 text-center text-[10px] text-slate-400 whitespace-nowrap">${m.TeamName}</td>
            ${monthCells}
            <td class="px-1 py-2 whitespace-nowrap">
                <div class="flex items-center gap-0.5">
                    <button onclick="window._ptCopyRow('${empId}')" title="คัดลอก pattern ไปให้คนอื่น"
                        class="p-1 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    </button>
                    <button onclick="window._ptResetRow('${empId}')" title="รีเซ็ตกลับทีมเดิมทุกเดือน"
                        class="p-1 rounded-lg text-slate-300 hover:text-violet-500 hover:bg-violet-50 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    const headerCols = MONTHS_TH_SHORT.map((m, i) => `
        <th class="px-1 py-3 text-center whitespace-nowrap group cursor-pointer hover:bg-violet-50 transition-colors"
            onclick="window._ptAssignColumn(${i+1})" title="Assign ทุกคนในเดือน ${m}">
            <div class="text-[10px] font-semibold text-slate-500 group-hover:text-violet-600">${m}</div>
            <div class="text-[9px] text-slate-300 group-hover:text-violet-400 mt-0.5">▼</div>
        </th>`).join('');

    const section = (label, color, members) => members.length === 0 ? '' : `
        <tr class="bg-${color}-50">
            <td colspan="16" class="px-4 py-2 text-[10px] font-bold uppercase text-${color}-600 tracking-wider">กลุ่ม ${label}</td>
        </tr>
        ${renderRows(members)}`;

    wrap.innerHTML = `
    <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse" style="min-width:1150px">
            <thead>
                <tr class="bg-slate-50 border-b-2 border-slate-200">
                    <th class="px-3 py-3 text-xs font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 whitespace-nowrap">สมาชิก</th>
                    <th class="px-2 py-3 text-xs font-semibold text-slate-400 text-center">ประเภท</th>
                    <th class="px-2 py-3 text-xs font-semibold text-slate-400 whitespace-nowrap">ทีมเดิม</th>
                    ${headerCols}
                    <th class="px-1 py-3 text-[10px] text-slate-300 text-center whitespace-nowrap">คัดลอก/↺</th>
                </tr>
            </thead>
            <tbody>
                ${section('A — พุธที่ 1 & 3', 'blue', groupA)}
                ${section('B — พุธที่ 2 & 4', 'purple', groupB)}
            </tbody>
        </table>
    </div>
    <div class="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded border border-violet-300 bg-violet-50 inline-block"></span>เปลี่ยนจากทีมเดิม</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded border border-amber-300 bg-amber-50 inline-block"></span>ข้ามกลุ่ม (A↔B)</span>
        <span class="flex items-center gap-1.5"><svg class="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>ล็อค (Auto-fill ข้าม)</span>
    </div>`;
}

window._ptSaveMemberRotation = async function(btn) {
    const year  = parseInt(document.getElementById('rotation-year')?.value || new Date().getFullYear());
    const cells = document.querySelectorAll('.member-rot-cell');
    const items = [];
    cells.forEach(sel => {
        if (!sel.value) return;
        items.push({
            EmployeeID: sel.dataset.member,
            TeamID:     parseInt(sel.value),
            Year:       year,
            Month:      parseInt(sel.dataset.month),
        });
    });
    if (items.length === 0) { showToast('ไม่มีข้อมูล', 'error'); return; }
    const saveBtn = btn || document.getElementById('pt-mem-rot-save-btn');
    const orig = _btnLoad(saveBtn, 'กำลังบันทึก...');
    try {
        const res = await API.post('/patrol/member-rotation', items);
        showToast(`บันทึกการสลับสมาชิก ${res.saved} รายการสำเร็จ`, 'success');
    } catch (err) {
        showError(err.message);
    } finally {
        _btnRestore(saveBtn, orig);
    }
};

// ── Mark changed cell (Feature 1+2: cross-group amber, changed violet) ────────
window._ptMarkChanged = function(sel) {
    const isChanged   = sel.value !== sel.dataset.default;
    const memberGroup = sel.dataset.group;
    const crossTeam   = _ptTeams.find(t => String(t.id) === sel.value);
    const isCross     = crossTeam && memberGroup && crossTeam.PatrolGroup !== memberGroup;

    sel.classList.remove(
        'border-violet-300', 'bg-violet-50', 'text-violet-700',
        'border-amber-300',  'bg-amber-50',  'text-amber-700',
        'border-slate-200',  'font-semibold'
    );
    if (isCross) {
        sel.classList.add('border-amber-300', 'bg-amber-50', 'text-amber-700', 'font-semibold');
    } else if (isChanged) {
        sel.classList.add('border-violet-300', 'bg-violet-50', 'text-violet-700', 'font-semibold');
    } else {
        sel.classList.add('border-slate-200');
    }
};

// ── Search / filter rows ──────────────────────────────────────────────────────
window._ptFilterMemberMatrix = function(q) {
    const rows = document.querySelectorAll('.member-rot-row');
    const lower = q.toLowerCase().trim();
    rows.forEach(row => {
        row.style.display = (!lower || row.dataset.name.includes(lower)) ? '' : 'none';
    });
};

// ── Reset single row (skip locked cells) ─────────────────────────────────────
window._ptResetRow = function(empId) {
    const cells = document.querySelectorAll(`.member-rot-cell[data-member="${empId}"]`);
    cells.forEach(sel => {
        if (_lockedCells.has(`${empId}_${sel.dataset.month}`)) return;
        sel.value = sel.dataset.default;
        window._ptMarkChanged(sel);
    });
    showToast('รีเซ็ตเรียบร้อย — กด "บันทึก" เพื่อยืนยัน', 'success');
};

// ── Assign column — ทุกทีมเลือกได้ ไม่จำกัดกลุ่ม (Feature 1) ────────────────
window._ptAssignColumn = function(month) {
    if (!_ptTeams.length) { showToast('ยังไม่มีทีม', 'error'); return; }
    const monthName = MONTHS_TH_SHORT[month - 1];
    const teamsA = _ptTeams.filter(t => t.PatrolGroup === 'A');
    const teamsB = _ptTeams.filter(t => t.PatrolGroup === 'B');
    const teamOpts = `<option value="">— เลือกทีม —</option>` +
        (teamsA.length ? `<optgroup label="กลุ่ม A">${teamsA.map(t => `<option value="${t.id}">${t.Name}</option>`).join('')}</optgroup>` : '') +
        (teamsB.length ? `<optgroup label="กลุ่ม B">${teamsB.map(t => `<option value="${t.id}">${t.Name}</option>`).join('')}</optgroup>` : '');

    openModal(`Assign ทุกคน — ${monthName}`, `
    <div class="space-y-4">
        <p class="text-sm text-slate-500">Assign สมาชิกทุกคนที่มองเห็น (ไม่ล็อค) ในเดือน <strong>${monthName}</strong> ไปทีมเดียวกัน</p>
        <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">ทีมปลายทาง</label>
            <select id="col-assign-team" class="form-input w-full text-sm">${teamOpts}</select>
        </div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button onclick="window.closeModal&&window.closeModal()" class="px-5 py-2 rounded-xl text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">ยกเลิก</button>
            <button id="col-assign-ok" class="px-5 py-2 rounded-xl text-sm font-bold text-white transition-colors" style="background:linear-gradient(135deg,#7c3aed,#6d28d9)">Assign</button>
        </div>
    </div>`, 'max-w-sm');

    setTimeout(() => {
        document.getElementById('col-assign-ok')?.addEventListener('click', () => {
            const teamId = document.getElementById('col-assign-team')?.value;
            if (!teamId) { showToast('กรุณาเลือกทีม', 'warning'); return; }
            const team = _ptTeams.find(t => String(t.id) === String(teamId));
            let count = 0;
            document.querySelectorAll('.member-rot-row:not([style*="display: none"])').forEach(row => {
                const sel = row.querySelector(`.member-rot-cell[data-month="${month}"]`);
                if (!sel || sel.disabled) return; // skip locked
                sel.value = teamId;
                window._ptMarkChanged(sel);
                count++;
            });
            closeModal();
            showToast(`Assign ${count} คน → ${team?.Name || teamId} เดือน ${monthName} — กด "บันทึก" เพื่อยืนยัน`, 'success');
        });
    }, 50);
};

// ── Feature 5: Toggle lock per cell ───────────────────────────────────────────
window._ptToggleLock = function(empId, month, year) {
    const cellKey = `${empId}_${month}`;
    const lockKey = `patrol_rot_locks_${year}`;
    if (_lockedCells.has(cellKey)) _lockedCells.delete(cellKey);
    else _lockedCells.add(cellKey);
    localStorage.setItem(lockKey, JSON.stringify([..._lockedCells]));

    const isLocked = _lockedCells.has(cellKey);
    const sel = document.querySelector(`.member-rot-cell[data-member="${empId}"][data-month="${month}"]`);
    const btn = sel?.nextElementSibling; // lock button
    if (sel) { sel.disabled = isLocked; }
    if (btn) {
        btn.title = isLocked ? 'ปลดล็อค' : 'ล็อค (Auto-fill จะข้าม)';
        btn.className = `flex-shrink-0 p-0.5 rounded transition-colors ${isLocked ? 'text-amber-500 hover:text-amber-600' : 'text-slate-200 hover:text-slate-400'}`;
        const lockSvgOn  = `<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>`;
        const lockSvgOff = `<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 018 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/></svg>`;
        btn.innerHTML = isLocked ? lockSvgOn : lockSvgOff;
    }
    if (sel && isLocked) sel.classList.add('border-amber-300', 'bg-amber-50');
};

// ── Feature 3: Swap two members ───────────────────────────────────────────────
window._ptSwapTwoModal = function() {
    if (_memberBase.length < 2) { showToast('ต้องมีสมาชิกอย่างน้อย 2 คน', 'warning'); return; }
    const memberOpts = _memberBase.map(m => `<option value="${m.EmployeeID}">${m.EmployeeName||m.EmployeeID} (${m.TeamName})</option>`).join('');
    const monthOpts  = MONTHS_TH_SHORT.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');

    openModal('สลับ Rotation ของสองคน', `
    <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">คนที่ 1</label>
                <select id="swap-e1" class="form-input w-full text-sm">${memberOpts}</select>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">คนที่ 2</label>
                <select id="swap-e2" class="form-input w-full text-sm">${memberOpts}</select>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เดือนเริ่มต้น</label>
                <select id="swap-from" class="form-input w-full text-sm">${monthOpts}</select>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เดือนสิ้นสุด</label>
                <select id="swap-to" class="form-input w-full text-sm">${monthOpts.replace('value="12"', 'value="12" selected')}</select>
            </div>
        </div>
        <p class="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">เซลล์ที่ล็อคจะไม่ถูกสลับ</p>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button onclick="window.closeModal&&window.closeModal()" class="px-5 py-2 rounded-xl text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">ยกเลิก</button>
            <button id="swap-ok" class="px-5 py-2 rounded-xl text-sm font-bold text-white" style="background:linear-gradient(135deg,#f59e0b,#d97706)">สลับ</button>
        </div>
    </div>`, 'max-w-md');

    setTimeout(() => {
        document.getElementById('swap-ok')?.addEventListener('click', () => {
            const e1   = document.getElementById('swap-e1')?.value;
            const e2   = document.getElementById('swap-e2')?.value;
            const from = parseInt(document.getElementById('swap-from')?.value || 1);
            const to   = parseInt(document.getElementById('swap-to')?.value   || 12);
            if (e1 === e2) { showToast('กรุณาเลือกสมาชิกคนละคน', 'warning'); return; }
            if (from > to) { showToast('เดือนเริ่มต้นต้องไม่เกินเดือนสิ้นสุด', 'warning'); return; }

            const m1 = _memberBase.find(m => m.EmployeeID === e1);
            const m2 = _memberBase.find(m => m.EmployeeID === e2);
            if (!_memberMonthly[e1]) _memberMonthly[e1] = {};
            if (!_memberMonthly[e2]) _memberMonthly[e2] = {};
            let swapped = 0;
            for (let month = from; month <= to; month++) {
                if (_lockedCells.has(`${e1}_${month}`) || _lockedCells.has(`${e2}_${month}`)) continue;
                const v1 = (_memberMonthly[e1]||{})[month] || m1?.TeamID;
                const v2 = (_memberMonthly[e2]||{})[month] || m2?.TeamID;
                _memberMonthly[e1][month] = v2;
                _memberMonthly[e2][month] = v1;
                const s1 = document.querySelector(`.member-rot-cell[data-member="${e1}"][data-month="${month}"]`);
                const s2 = document.querySelector(`.member-rot-cell[data-member="${e2}"][data-month="${month}"]`);
                if (s1) { s1.value = v2; window._ptMarkChanged(s1); }
                if (s2) { s2.value = v1; window._ptMarkChanged(s2); }
                swapped++;
            }
            closeModal();
            const rng = from === to ? MONTHS_TH_SHORT[from-1] : `${MONTHS_TH_SHORT[from-1]}–${MONTHS_TH_SHORT[to-1]}`;
            showToast(`สลับ ${swapped} เดือน (${rng}) เรียบร้อย — กด "บันทึก" เพื่อยืนยัน`, 'success');
        });
    }, 50);
};

// ── Feature 4: Copy row pattern to another member ─────────────────────────────
window._ptCopyRow = function(sourceId) {
    const source  = _memberBase.find(m => m.EmployeeID === sourceId);
    if (!source) return;
    const targets = _memberBase.filter(m => m.EmployeeID !== sourceId);
    if (!targets.length) { showToast('ไม่มีสมาชิกคนอื่น', 'warning'); return; }

    const targetOpts = targets.map(m => `<option value="${m.EmployeeID}">${m.EmployeeName||m.EmployeeID} (${m.TeamName})</option>`).join('');
    const monthOpts  = MONTHS_TH_SHORT.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');

    openModal(`คัดลอก Pattern จาก ${source.EmployeeName||sourceId}`, `
    <div class="space-y-4">
        <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">คัดลอกไปให้</label>
            <select id="copy-target" class="form-input w-full text-sm">${targetOpts}</select>
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เดือนเริ่มต้น</label>
                <select id="copy-from" class="form-input w-full text-sm">${monthOpts}</select>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เดือนสิ้นสุด</label>
                <select id="copy-to" class="form-input w-full text-sm">${monthOpts.replace('value="12"', 'value="12" selected')}</select>
            </div>
        </div>
        <p class="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">เซลล์ที่ล็อคในแถวปลายทางจะไม่ถูกเปลี่ยน</p>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button onclick="window.closeModal&&window.closeModal()" class="px-5 py-2 rounded-xl text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">ยกเลิก</button>
            <button id="copy-ok" class="px-5 py-2 rounded-xl text-sm font-bold text-white" style="background:linear-gradient(135deg,#3b82f6,#6366f1)">คัดลอก</button>
        </div>
    </div>`, 'max-w-sm');

    setTimeout(() => {
        document.getElementById('copy-ok')?.addEventListener('click', () => {
            const targetId = document.getElementById('copy-target')?.value;
            const from = parseInt(document.getElementById('copy-from')?.value || 1);
            const to   = parseInt(document.getElementById('copy-to')?.value   || 12);
            if (from > to) { showToast('เดือนเริ่มต้นต้องไม่เกินเดือนสิ้นสุด', 'warning'); return; }
            if (!_memberMonthly[targetId]) _memberMonthly[targetId] = {};
            let copied = 0;
            for (let month = from; month <= to; month++) {
                if (_lockedCells.has(`${targetId}_${month}`)) continue;
                const srcVal = (_memberMonthly[sourceId]||{})[month] || source?.TeamID;
                _memberMonthly[targetId][month] = srcVal;
                const sel = document.querySelector(`.member-rot-cell[data-member="${targetId}"][data-month="${month}"]`);
                if (sel) { sel.value = srcVal; window._ptMarkChanged(sel); }
                copied++;
            }
            closeModal();
            const rng = from === to ? MONTHS_TH_SHORT[from-1] : `${MONTHS_TH_SHORT[from-1]}–${MONTHS_TH_SHORT[to-1]}`;
            showToast(`คัดลอก ${copied} เดือน (${rng}) เรียบร้อย — กด "บันทึก" เพื่อยืนยัน`, 'success');
        });
    }, 50);
};

// ── Auto-fill modal (month range + mode) ──────────────────────────────────────
window._ptAutoFillModal = function() {
    const teamsA = _ptTeams.filter(t => t.PatrolGroup === 'A');
    const teamsB = _ptTeams.filter(t => t.PatrolGroup === 'B');
    if (teamsA.length === 0 && teamsB.length === 0) { showToast('ยังไม่มีทีม', 'error'); return; }

    // Interleave A,B teams for diverse mode: [A1,B1,A2,B2,A3,B3]
    const teamsInterleaved = [];
    const maxLen = Math.max(teamsA.length, teamsB.length);
    for (let i = 0; i < maxLen; i++) {
        if (teamsA[i]) teamsInterleaved.push(teamsA[i]);
        if (teamsB[i]) teamsInterleaved.push(teamsB[i]);
    }

    const monthOpts = MONTHS_TH_SHORT.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');
    const teamListA = teamsA.map(t => `<span class="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">${t.Name}</span>`).join(' ');
    const teamListB = teamsB.map(t => `<span class="inline-block px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold">${t.Name}</span>`).join(' ');

    openModal('Auto-fill สมาชิก', `
    <div class="space-y-4">

        <!-- Mode selector -->
        <div class="space-y-2">
            <label class="block text-xs font-bold text-slate-500 uppercase">รูปแบบการสลับ</label>
            <label class="flex items-start gap-2.5 p-3 rounded-xl border-2 border-violet-400 bg-violet-50 cursor-pointer transition-all">
                <input type="radio" name="af-mode" value="diverse" checked class="mt-0.5 accent-violet-600">
                <div>
                    <p class="text-xs font-bold text-violet-800">ผสม A+B — หลากหลาย (แนะนำ)</p>
                    <p class="text-[11px] text-violet-600 mt-0.5">แต่ละคนหมุนผ่านทุกทีม (A+B) — เจอผู้บริหารหลากหลาย ไม่ซ้ำหน้า</p>
                </div>
            </label>
            <label class="flex items-start gap-2.5 p-3 rounded-xl border-2 border-slate-200 bg-white cursor-pointer transition-all">
                <input type="radio" name="af-mode" value="samegroup" class="mt-0.5 accent-violet-600">
                <div>
                    <p class="text-xs font-bold text-slate-700">เฉพาะกลุ่มเดิม (A หรือ B)</p>
                    <p class="text-[11px] text-slate-400 mt-0.5">หมุนเวียนภายในกลุ่ม A หรือ B ของตัวเองเท่านั้น</p>
                </div>
            </label>
        </div>

        <!-- Month range -->
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เดือนเริ่มต้น</label>
                <select id="af-month-from" class="form-input w-full text-sm">${monthOpts}</select>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เดือนสิ้นสุด</label>
                <select id="af-month-to" class="form-input w-full text-sm">${monthOpts.replace('value="12"', 'value="12" selected')}</select>
            </div>
        </div>

        <!-- Dynamic description -->
        <div id="af-desc" class="p-3 rounded-xl bg-violet-50 border border-violet-100 text-[11px] text-violet-700 space-y-1">
            <p class="font-semibold">วิธีการสลับ — ผสม A+B</p>
            <p>• แต่ละคนได้รับทีมที่ต่างกัน ทั้ง A และ B หมุนเวียนทุกเดือน</p>
            <p>• ลำดับทีม: ${teamsInterleaved.map(t=>`<span class="font-bold">${t.Name}</span>`).join(' → ')}</p>
            <p>• Top Mgmt &amp; คปอ. เดินรอบ 2 เท่านั้น · Management เดินทั้ง 2 รอบ (ตามประเภท)</p>
            <p>• เซลล์ที่ล็อคจะไม่ถูกเปลี่ยน</p>
        </div>

        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button onclick="window.closeModal&&window.closeModal()" class="px-5 py-2 rounded-xl text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">ยกเลิก</button>
            <button id="af-run-btn" class="px-5 py-2 rounded-xl text-sm font-bold text-white transition-colors" style="background:linear-gradient(135deg,#7c3aed,#6d28d9)">
                <svg class="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                Fill
            </button>
        </div>
    </div>`, 'max-w-md');

    setTimeout(() => {
        // Mode radio → update border + description
        document.querySelectorAll('input[name="af-mode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                document.querySelectorAll('label:has(input[name="af-mode"])').forEach(lbl => {
                    const isActive = lbl.querySelector('input')?.checked;
                    lbl.classList.toggle('border-violet-400', isActive);
                    lbl.classList.toggle('bg-violet-50', isActive);
                    lbl.classList.toggle('border-slate-200', !isActive);
                    lbl.classList.toggle('bg-white', !isActive);
                });
                const mode = document.querySelector('input[name="af-mode"]:checked')?.value;
                const descEl = document.getElementById('af-desc');
                if (!descEl) return;
                if (mode === 'diverse') {
                    descEl.innerHTML = `
                        <p class="font-semibold">วิธีการสลับ — ผสม A+B</p>
                        <p>• แต่ละคนได้รับทีมที่ต่างกัน ทั้ง A และ B หมุนเวียนทุกเดือน</p>
                        <p>• ลำดับทีม: ${teamsInterleaved.map(t=>`<span class="font-bold">${t.Name}</span>`).join(' → ')}</p>
                        <p>• Top Mgmt &amp; คปอ. เดินรอบ 2 เท่านั้น · Management เดินทั้ง 2 รอบ</p>
                        <p>• เซลล์ที่ล็อคจะไม่ถูกเปลี่ยน</p>`;
                    descEl.className = 'p-3 rounded-xl bg-violet-50 border border-violet-100 text-[11px] text-violet-700 space-y-1';
                } else {
                    descEl.innerHTML = `
                        <p class="font-semibold">วิธีการสลับ — เฉพาะกลุ่มเดิม</p>
                        <p>• กลุ่ม A หมุนเฉพาะ: ${teamListA}</p>
                        <p>• กลุ่ม B หมุนเฉพาะ: ${teamListB}</p>
                        <p>• เดือนเริ่มต้น = ทีมปัจจุบันของแต่ละคน, เลื่อน +1 ทีม/เดือน</p>`;
                    descEl.className = 'p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1';
                }
            });
        });

        document.getElementById('af-run-btn')?.addEventListener('click', () => {
            const fromMonth = parseInt(document.getElementById('af-month-from')?.value || 1);
            const toMonth   = parseInt(document.getElementById('af-month-to')?.value   || 12);
            const mode      = document.querySelector('input[name="af-mode"]:checked')?.value || 'diverse';
            if (fromMonth > toMonth) { showToast('เดือนเริ่มต้นต้องไม่เกินเดือนสิ้นสุด', 'warning'); return; }

            if (mode === 'diverse') {
                // ── Mode: ผสม A+B — staggered offsets per member index ──────────
                // All teams interleaved: [A1,B1,A2,B2,A3,B3]
                // Member i → base = i % totalTeams
                // Month offset → (base + monthOffset) % totalTeams
                // Result: in any given month, each person is in a DIFFERENT team
                const pool = teamsInterleaved;
                if (!pool.length) return;
                _memberBase.forEach((m, memberIdx) => {
                    const base = memberIdx % pool.length;
                    for (let month = fromMonth; month <= toMonth; month++) {
                        if (_lockedCells.has(`${m.EmployeeID}_${month}`)) continue;
                        const offset = month - fromMonth;
                        const teamId = pool[(base + offset) % pool.length].id;
                        const cell = document.querySelector(`.member-rot-cell[data-member="${m.EmployeeID}"][data-month="${month}"]`);
                        if (cell) { cell.value = String(teamId); window._ptMarkChanged(cell); }
                    }
                });
            } else {
                // ── Mode: เฉพาะกลุ่มเดิม — original algorithm ────────────────
                _memberBase.forEach(m => {
                    const groupTeams = m.PatrolGroup === 'A' ? teamsA : teamsB;
                    if (!groupTeams.length) return;
                    const startIdx = groupTeams.findIndex(t => t.id === m.TeamID);
                    const base = startIdx >= 0 ? startIdx : 0;
                    for (let month = fromMonth; month <= toMonth; month++) {
                        if (_lockedCells.has(`${m.EmployeeID}_${month}`)) continue;
                        const offset = month - fromMonth;
                        const teamId = groupTeams[(base + offset) % groupTeams.length].id;
                        const cell = document.querySelector(`.member-rot-cell[data-member="${m.EmployeeID}"][data-month="${month}"]`);
                        if (cell) { cell.value = String(teamId); window._ptMarkChanged(cell); }
                    }
                });
            }

            closeModal();
            const rangeLabel = fromMonth === toMonth
                ? MONTHS_TH_SHORT[fromMonth-1]
                : `${MONTHS_TH_SHORT[fromMonth-1]} – ${MONTHS_TH_SHORT[toMonth-1]}`;
            const modeLabel = mode === 'diverse' ? 'ผสม A+B' : 'เฉพาะกลุ่มเดิม';
            showToast(`Auto-fill [${modeLabel}] ${rangeLabel} เรียบร้อย — กด "บันทึก" เพื่อยืนยัน`, 'success');
        });
    }, 50);
};

// =============================================================================
// MONTHLY PATROL PDF (ตารางรายเดือน — grid 3×2 แบบ Safety Patrol Calendar)
// =============================================================================

window._ptDownloadMonthlyPDF = async function() {
    const month = parseInt(document.getElementById('filter-month')?.value || new Date().getMonth()+1);
    const year  = parseInt(document.getElementById('filter-year')?.value  || new Date().getFullYear());
    const thYear = year + 543;
    const monthNameTh = new Date(year, month-1, 1).toLocaleString('th-TH', { month: 'long' });
    const monthNameEn = new Date(year, month-1, 1).toLocaleString('en-US', { month: 'long' });
    const today = new Date().toLocaleDateString('th-TH', { dateStyle: 'long' });

    try {
        showToast('กำลังสร้าง PDF...', 'info');
        const res = await API.get(`/patrol/monthly-report?year=${year}&month=${month}`);
        const teams = res.data || [];
        if (teams.length === 0) { showToast('ไม่มีข้อมูล Sessions ของเดือนนี้', 'error'); return; }

        // Build one team card
        const buildCard = (team) => {
            const s1 = team.sessions.find(s => s.PatrolRound === 1);
            const s2 = team.sessions.find(s => s.PatrolRound === 2);
            const date1 = s1 ? new Date(s1.PatrolDate).getDate() : '—';
            const date2 = s2 ? new Date(s2.PatrolDate).getDate() : '—';
            const area  = (s1 || s2);
            const areaCode = area ? (area.AreaCode || area.AreaName || '') : '';

            const memberRows = team.members.map((m, idx) => {
                // top/committee → only round 2; management → both rounds
                const cell1 = m.PatrolType === 'management' ? `<td class="area-cell">${areaCode}</td>` : `<td class="area-cell" style="color:#cbd5e1">—</td>`;
                const cell2 = `<td class="area-cell">${areaCode}</td>`;
                const typeDot = m.PatrolType === 'top' ? '#f43f5e' : m.PatrolType === 'committee' ? '#f59e0b' : '#6366f1';
                return `<tr>
                    <td class="num-cell">${idx+1}</td>
                    <td class="prefix-cell">คุณ</td>
                    <td class="name-cell"><span class="type-dot" style="background:${typeDot}"></span>${m.EmployeeName||m.EmployeeID}</td>
                    ${cell1}${cell2}
                </tr>`;
            }).join('');

            // หัวหน้างานประจำพื้นที่ (section chief placeholder)
            const chiefRow = `<tr class="chief-row">
                <td class="num-cell">${team.members.length+1}</td>
                <td colspan="2" class="name-cell" style="font-style:italic;color:#64748b">หัวหน้างานประจำพื้นที่${areaCode}</td>
                <td class="area-cell" style="color:#64748b">${areaCode}</td>
                <td class="area-cell" style="color:#64748b">${areaCode}</td>
            </tr>`;

            return `<div class="team-card">
                <div class="team-header" style="background:${team.Color||'#065f46'}">
                    <div class="team-name">${team.TeamName}</div>
                    <div class="team-dates">
                        <div class="date-group">
                            <div class="date-label">วันพุธ</div>
                            <div class="date-num">${date1}</div>
                        </div>
                        <div class="date-group">
                            <div class="date-label">&nbsp;</div>
                            <div class="date-num">${date2}</div>
                        </div>
                    </div>
                </div>
                <table class="member-table">
                    <thead>
                        <tr>
                            <th class="num-cell">#</th>
                            <th class="prefix-cell"></th>
                            <th class="name-cell">ชื่อ-สกุล</th>
                            <th class="area-cell">${date1}</th>
                            <th class="area-cell">${date2}</th>
                        </tr>
                    </thead>
                    <tbody>${memberRows}${chiefRow}</tbody>
                </table>
            </div>`;
        };

        // Pair teams into rows of 2
        const rows = [];
        for (let i = 0; i < teams.length; i += 2) {
            const left  = buildCard(teams[i]);
            const right = teams[i+1] ? buildCard(teams[i+1]) : '<div class="team-card" style="border:none"></div>';
            rows.push(`<div class="team-row">${left}${right}</div>`);
        }

        const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
        <title>Safety Patrol ${monthNameEn} ${year}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600;700&display=swap');
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:'Kanit',sans-serif;background:#fff;color:#1e293b}
            .page{width:210mm;padding:0 0 12mm;min-height:297mm}

            /* ── Hero ── */
            .hero{background:linear-gradient(135deg,#14532d 0%,#166534 50%,#15803d 100%);padding:14px 20px 10px;position:relative;overflow:hidden}
            .hero::before{content:'';position:absolute;top:-20px;right:-20px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.06)}
            .hero-top{display:flex;align-items:center;justify-content:space-between}
            .hero-brand{color:rgba(255,255,255,0.7);font-size:8pt;letter-spacing:2px;font-weight:300;text-transform:uppercase}
            .hero-docref{color:rgba(255,255,255,0.6);font-size:7.5pt;text-align:right;line-height:1.7}
            .hero-title{text-align:center;margin:6px 0 4px}
            .hero-title .big{font-size:26pt;font-weight:700;color:#fff;letter-spacing:3px;line-height:1}
            .hero-title .sub{font-size:13pt;font-weight:300;color:rgba(255,255,255,0.85);letter-spacing:8px}
            .hero-month{text-align:center;margin-top:6px}
            .hero-month .month-th{font-size:18pt;font-weight:700;color:#fbbf24;letter-spacing:1px}
            .hero-month .month-en{font-size:9pt;color:rgba(255,255,255,0.6);font-weight:300;margin-top:1px}
            .hero-stripe{height:4px;background:linear-gradient(90deg,#fbbf24,#f59e0b,#fbbf24)}
            .team-subtitle{background:#1e3a2f;color:#86efac;font-size:8pt;font-weight:600;letter-spacing:2px;text-align:center;padding:5px;text-transform:uppercase}

            /* ── Grid ── */
            .grid-wrap{padding:8px 10px}
            .team-row{display:flex;gap:8px;margin-bottom:8px}
            .team-card{flex:1;border:1.5px solid #d1d5db;border-radius:6px;overflow:hidden;min-width:0}
            .team-header{display:flex;align-items:center;justify-content:space-between;padding:5px 10px;color:#fff}
            .team-name{font-size:10pt;font-weight:700;letter-spacing:.5px}
            .team-dates{display:flex;gap:12px}
            .date-group{text-align:center}
            .date-label{font-size:7pt;opacity:.8;font-weight:300}
            .date-num{font-size:13pt;font-weight:700;line-height:1}
            .member-table{width:100%;border-collapse:collapse;font-size:8.5pt}
            .member-table thead tr{background:#f1f5f9}
            .member-table th{padding:3px 5px;font-size:7.5pt;font-weight:600;color:#475569;border-bottom:1.5px solid #e2e8f0;text-align:left}
            .member-table td{padding:3px 5px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
            .member-table tbody tr:last-child td{border-bottom:none}
            .num-cell{width:18px;text-align:center;color:#94a3b8;font-size:7.5pt}
            .prefix-cell{width:22px;color:#64748b;font-size:8pt}
            .name-cell{min-width:90px}
            .area-cell{width:38px;text-align:center;font-size:8pt;font-weight:600;color:#065f46}
            .type-dot{display:inline-block;width:5px;height:5px;border-radius:50%;margin-right:4px;vertical-align:middle;flex-shrink:0}
            .chief-row td{background:#f8fafc;font-size:7.5pt}

            /* ── Footer ── */
            .footer{text-align:center;font-size:7pt;color:#94a3b8;margin-top:10px;border-top:1px solid #e2e8f0;padding-top:6px;margin:0 10px}
            .legend{display:flex;gap:16px;justify-content:center;padding:6px 10px 0;font-size:7.5pt;color:#64748b}
            .leg-item{display:flex;align-items:center;gap:4px}

            @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
        </style></head><body>
        <div class="page">
            <div class="hero">
                <div class="hero-top">
                    <div class="hero-brand">TSH Safety Core</div>
                    <div class="hero-docref">เลขที่: TSH-SP-${thYear}-${String(month).padStart(2,'0')}<br>วันที่ออก: ${today}</div>
                </div>
                <div class="hero-title">
                    <div class="big">SAFETY PATROL</div>
                    <div class="sub">C a l e n d a r</div>
                </div>
                <div class="hero-month">
                    <div class="month-th">${monthNameTh} พ.ศ. ${thYear}</div>
                    <div class="month-en">${monthNameEn} ${year}</div>
                </div>
            </div>
            <div class="hero-stripe"></div>
            <div class="team-subtitle">Top &amp; Management Safety Patrol Team</div>
            <div class="grid-wrap">${rows.join('')}</div>
            <div class="legend">
                <div class="leg-item"><span class="type-dot" style="background:#f43f5e"></span>Top Management — เดิน 1 ครั้ง (รอบ 2)</div>
                <div class="leg-item"><span class="type-dot" style="background:#f59e0b"></span>คปอ. — เดิน 1 ครั้ง (รอบ 2)</div>
                <div class="leg-item"><span class="type-dot" style="background:#6366f1"></span>Management — เดิน 2 ครั้ง (รอบ 1 &amp; 2)</div>
            </div>
            <div class="footer">TSH Safety Core System · สร้างอัตโนมัติ ${today} · เอกสารนี้ใช้สำหรับการเดินตรวจความปลอดภัยอย่างเป็นทางการ</div>
        </div>
        </body></html>`;

        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) { showToast('กรุณาอนุญาต Popup', 'error'); return; }
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 800);
    } catch (err) { showError(err.message); }
};

// =============================================================================
// MEMBER SCHEDULE REPORT
// =============================================================================

let _scheduleData = [];

window._ptLoadMemberSchedule = async function() {
    const year = parseInt(document.getElementById('rotation-year')?.value || new Date().getFullYear());
    const wrap = document.getElementById('pt-schedule-report-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-4 border-slate-800 border-t-transparent"></div></div>`;
    try {
        const res = await API.get(`/patrol/member-schedule?year=${year}`);
        _scheduleData = res.data || [];
        _ptRenderSchedulePreview(year);
    } catch (err) {
        wrap.innerHTML = `<div class="text-center py-10 text-red-500 text-sm">${escHtml(err.message)}</div>`;
    }
};

function _ptRenderSchedulePreview(year) {
    const wrap = document.getElementById('pt-schedule-report-wrap');
    if (!wrap) return;
    if (_scheduleData.length === 0) {
        wrap.innerHTML = `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีข้อมูล — กรุณากำหนด Rotation และสร้าง Sessions ก่อน</div>`;
        return;
    }
    const typeColor = { top:'rose', committee:'amber', management:'indigo' };
    const typeShort = { top:'Top', committee:'คปอ.', management:'Mgmt' };

    const rows = _scheduleData.map(m => {
        const tColor = typeColor[m.PatrolType] || 'slate';
        const cells = m.months.map(md => {
            if (md.sessions.length === 0) return `<td class="px-1 py-2 text-center text-[10px] text-slate-300">—</td>`;
            const dates = md.sessions.map(s =>
                new Date(s.PatrolDate).toLocaleDateString('th-TH', {day:'numeric', month:'short'})
            ).join(', ');
            const area = md.sessions[0]?.AreaCode || md.sessions[0]?.AreaName || '';
            return `<td class="px-1 py-2 text-center">
                <div class="text-[10px] font-semibold text-slate-700 leading-tight">${dates}</div>
                ${area ? `<div class="text-[9px] text-slate-400 leading-tight">${area}</div>` : ''}
            </td>`;
        }).join('');
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-3 py-2.5 sticky left-0 bg-white z-10 whitespace-nowrap min-w-[140px]">
                <p class="text-xs font-semibold text-slate-800">${m.EmployeeName||m.EmployeeID}</p>
                <p class="text-[10px] text-slate-400">${m.Department||''}</p>
            </td>
            <td class="px-2 py-2.5 text-center whitespace-nowrap">
                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-${tColor}-100 text-${tColor}-700">${typeShort[m.PatrolType]||m.PatrolType}</span>
            </td>
            <td class="px-2 py-2.5 text-[10px] text-slate-500 whitespace-nowrap">${m.BaseTeamName}</td>
            ${cells}
        </tr>`;
    }).join('');

    const hcols = MONTHS_TH_SHORT.map(m => `<th class="px-1 py-3 text-[10px] font-semibold text-slate-500 text-center whitespace-nowrap">${m}</th>`).join('');
    wrap.innerHTML = `
    <div class="overflow-x-auto">
        <table class="w-full border-collapse" style="min-width:1200px">
            <thead>
                <tr class="bg-slate-50 border-b-2 border-slate-200">
                    <th class="px-3 py-3 text-xs font-semibold text-slate-500 text-left sticky left-0 bg-slate-50 z-10">ชื่อ-สกุล</th>
                    <th class="px-2 py-3 text-[10px] font-semibold text-slate-400">ประเภท</th>
                    <th class="px-2 py-3 text-[10px] font-semibold text-slate-400 whitespace-nowrap">ทีมเดิม</th>
                    ${hcols}
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>
    <div class="px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between">
        <span>แสดง ${_scheduleData.length} คน · ปี ${year} (พ.ศ. ${year+543})</span>
        <span>Top Mgmt &amp; คปอ. = รอบ 2 เท่านั้น · Management = รอบ 1 &amp; 2</span>
    </div>`;
}

window._ptDownloadSchedulePDF = function() {
    if (_scheduleData.length === 0) { showToast('กรุณากด "โหลดข้อมูล" ก่อน', 'error'); return; }
    const year   = parseInt(document.getElementById('rotation-year')?.value || new Date().getFullYear());
    const thYear = year + 543;
    const today  = new Date().toLocaleDateString('th-TH', { dateStyle: 'long' });

    const typeLabel = { top: 'Top Management', committee: 'คณะกรรมการความปลอดภัย (คปอ.)', management: 'Management' };
    const typeFreq  = { top: 'เดิน 1 ครั้ง/เดือน (รอบที่ 2)', committee: 'เดิน 1 ครั้ง/เดือน (รอบที่ 2)', management: 'เดิน 2 ครั้ง/เดือน (รอบที่ 1 & 2)' };

    const pageHtml = _scheduleData.map((m, idx) => {
        const tableRows = m.months.map(md => {
            const mLabel = MONTHS_TH_SHORT[md.month - 1];
            if (md.sessions.length === 0) {
                return `<tr><td class="month-cell">${mLabel}</td><td colspan="3" style="color:#94a3b8;text-align:center;font-size:9pt">— ไม่มีกำหนดการ —</td><td style="color:#94a3b8;text-align:center">—</td></tr>`;
            }
            return md.sessions.map((s, si) => {
                const d = new Date(s.PatrolDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
                return `<tr>
                    ${si === 0 ? `<td class="month-cell" rowspan="${md.sessions.length}">${mLabel}</td>` : ''}
                    <td>${d}</td>
                    <td>${s.TeamName || '—'}</td>
                    <td>${s.AreaName || (s.AreaCode ? s.AreaCode : '—')}</td>
                    <td style="text-align:center">รอบ ${s.PatrolRound}</td>
                </tr>`;
            }).join('');
        }).join('');

        return `<div class="page" ${idx > 0 ? 'style="page-break-before:always"' : ''}>
            <div class="doc-header">
                <div class="header-left">
                    <div class="company-name">TSH Safety Core</div>
                    <div class="doc-title">ตารางเดินตรวจความปลอดภัย ประจำปี พ.ศ. ${thYear}</div>
                    <div class="doc-sub">Safety Patrol Schedule · Year ${year}</div>
                </div>
                <div class="header-right">
                    <div class="doc-no">เลขที่: TSH-PT-${thYear}-${String(idx+1).padStart(3,'0')}</div>
                    <div class="doc-date">วันที่ออกเอกสาร: ${today}</div>
                    <div class="doc-rev">ฉบับที่: 1</div>
                </div>
            </div>
            <div class="divider"></div>
            <table class="info-table">
                <tr>
                    <td><span class="info-label">ชื่อ-สกุล</span><span class="info-val">${m.EmployeeName||m.EmployeeID}</span></td>
                    <td><span class="info-label">รหัสพนักงาน</span><span class="info-val">${m.EmployeeID}</span></td>
                </tr>
                <tr>
                    <td><span class="info-label">แผนก/หน่วยงาน</span><span class="info-val">${m.Department||'—'}</span></td>
                    <td><span class="info-label">ทีม Patrol</span><span class="info-val">${m.BaseTeamName} (กลุ่ม ${m.PatrolGroup})</span></td>
                </tr>
                <tr>
                    <td colspan="2"><span class="info-label">ประเภท</span><span class="info-val">${typeLabel[m.PatrolType]||m.PatrolType} — ${typeFreq[m.PatrolType]||''}</span></td>
                </tr>
            </table>
            <table class="sch-table">
                <thead>
                    <tr>
                        <th style="width:52px">เดือน</th>
                        <th style="width:140px">วันที่เดินตรวจ</th>
                        <th>ทีม</th>
                        <th>พื้นที่ตรวจ</th>
                        <th style="width:52px">รอบ</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
            <div class="sig-section">
                <div class="sig-box">
                    <div class="sig-line"></div>
                    <div class="sig-name">(${m.EmployeeName||'............................'})</div>
                    <div class="sig-role">ผู้เดินตรวจ</div>
                </div>
                <div class="sig-box">
                    <div class="sig-line"></div>
                    <div class="sig-name">(............................)</div>
                    <div class="sig-role">หัวหน้าทีม / ผู้ตรวจสอบ</div>
                </div>
                <div class="sig-box">
                    <div class="sig-line"></div>
                    <div class="sig-name">(............................)</div>
                    <div class="sig-role">ผู้อนุมัติ</div>
                </div>
            </div>
            <div class="footer">TSH Safety Core System · สร้างอัตโนมัติ ${today} · เอกสารฉบับนี้ใช้สำหรับการเดินตรวจความปลอดภัยอย่างเป็นทางการ</div>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
    <title>ตารางเดินตรวจ ${thYear}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600;700&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Kanit',sans-serif;font-size:10pt;color:#1e293b;background:#fff}
        .page{width:210mm;padding:16mm 18mm 14mm;min-height:297mm;position:relative}
        .doc-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
        .company-name{font-size:10pt;font-weight:700;color:#065f46;letter-spacing:.5px;margin-bottom:3px}
        .doc-title{font-size:15pt;font-weight:700;color:#0f172a;line-height:1.2}
        .doc-sub{font-size:8.5pt;color:#64748b;margin-top:2px;font-weight:300}
        .header-right{text-align:right;font-size:8.5pt;color:#475569;line-height:1.8}
        .doc-no{font-weight:600;color:#0f172a}
        .divider{height:3px;background:linear-gradient(90deg,#065f46,#0d9488,transparent);margin-bottom:12px;border-radius:2px}
        .info-table{width:100%;border-collapse:collapse;margin-bottom:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
        .info-table td{padding:6px 14px;vertical-align:top;width:50%;font-size:9.5pt}
        .info-table tr:not(:last-child) td{border-bottom:1px solid #e2e8f0}
        .info-label{color:#64748b;font-size:8pt;display:block;margin-bottom:1px}
        .info-val{font-weight:600;color:#0f172a}
        .sch-table{width:100%;border-collapse:collapse;margin-bottom:22px}
        .sch-table thead tr{background:#064e3b}
        .sch-table th{color:#fff;padding:8px 10px;font-size:9pt;font-weight:600;text-align:left}
        .sch-table td{padding:6.5px 10px;border-bottom:1px solid #e2e8f0;font-size:9.5pt;vertical-align:middle}
        .sch-table tbody tr:nth-child(even){background:#f8fafc}
        .month-cell{font-weight:600;color:#065f46;white-space:nowrap}
        .sig-section{display:flex;gap:24px;margin-top:16px;page-break-inside:avoid}
        .sig-box{flex:1;text-align:center;padding-top:8px}
        .sig-line{border-bottom:1px solid #334155;margin:0 8px 6px;height:44px}
        .sig-name{font-size:9pt;color:#334155}
        .sig-role{font-size:8pt;color:#64748b;margin-top:3px;font-weight:600}
        .footer{position:absolute;bottom:10mm;left:18mm;right:18mm;text-align:center;font-size:7pt;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:5px}
        @media print{.page{page-break-after:always}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style>
    </head><body>${pageHtml}</body></html>`;

    const win = window.open('', '_blank', 'width=960,height=800');
    if (!win) { showToast('กรุณาอนุญาต Popup เพื่อดาวน์โหลด PDF', 'error'); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 800);
};

async function loadPositionsList() {
    const listEl  = document.getElementById('list-positions');
    const countEl = document.getElementById('count-positions');
    try {
        const res = await API.get('/master/positions');
        if (!res.success) throw new Error(res.message);
        _masterQuality.positions = res.data || [];
        _renderMasterQuality();
        if (countEl) countEl.textContent = res.data.length;
        if (!res.data.length) { listEl.innerHTML = `<li class="text-center text-xs text-slate-300 py-10">ยังไม่มีข้อมูล</li>`; return; }
        listEl.innerHTML = res.data.map((item, i) => `
            <li class="group flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                <span class="text-[10px] text-slate-400 w-4 font-mono shrink-0">${i+1}</span>
                <span class="text-xs font-medium text-slate-700 flex-1 truncate">${item.Name}</span>
                ${item.IsSupervisorPatrol
                    ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0 whitespace-nowrap">Self-Patrol</span>`
                    : ''}
                <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="toggleSupervisorPatrol(${item.id})"
                        title="${item.IsSupervisorPatrol ? 'ปิด Self-Patrol' : 'เปิด Self-Patrol (หัวหน้าส่วน/แผนก)'}"
                        class="p-1 rounded-md transition-colors ${item.IsSupervisorPatrol ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    </button>
                    <button onclick="editMasterData('positions',${item.id},'${(item.Name||'').replace(/'/g,"\\'")}')"
                        class="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button onclick="deleteMasterData('positions',${item.id},'${(item.Name||'').replace(/'/g,"\\'")}')"
                        class="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
            </li>`).join('');
    } catch { _masterQuality.positions = []; _renderMasterQuality(); listEl.innerHTML = `<li class="text-center text-red-400 text-xs py-4">โหลดไม่ได้</li>`; }
}

window.toggleSupervisorPatrol = async (id) => {
    try {
        const res = await API.put(`/master/positions/${id}/supervisor-toggle`, {});
        if (res.success) {
            showToast(res.data.IsSupervisorPatrol ? 'เปิด Self-Patrol สำหรับตำแหน่งนี้แล้ว' : 'ปิด Self-Patrol แล้ว', 'success');
            loadPositionsList();
        } else showError(res.message);
    } catch (err) { showError(err.message); }
};

async function loadAreasList() {
    const gridEl  = document.getElementById('areas-grid');
    const countEl = document.getElementById('count-areas');
    if (!gridEl) return;
    try {
        const res = await API.get('/master/areas');
        if (!res.success) throw new Error(res.message);
        const areas = res.data || [];
        _masterQuality.areas = areas;
        _renderMasterQuality();
        if (countEl) countEl.textContent = areas.length;
        if (!areas.length) {
            gridEl.innerHTML = `<div class="text-center text-xs text-slate-400 py-6 col-span-full">ยังไม่มีพื้นที่</div>`;
            return;
        }
        gridEl.innerHTML = areas.map(a => `
            <div class="group relative flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 bg-slate-50 hover:border-emerald-200 hover:bg-emerald-50 transition-all cursor-default">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-slate-100 shadow-sm">
                    <svg class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </div>
                <p class="text-[10px] font-bold text-slate-700 text-center leading-tight">${a.Name}</p>
                <span class="text-[9px] text-slate-400 font-mono">${a.Code}</span>
                <div class="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="window.editAreaModal(${a.id},'${(a.Name||'').replace(/'/g,"\\'")}','${a.Code}',${a.SortOrder||99})"
                        class="p-1 rounded-md bg-white shadow-sm border border-slate-100 text-slate-400 hover:text-indigo-600 transition-colors">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button onclick="window.deleteArea(${a.id},'${(a.Name||'').replace(/'/g,"\\'")}')"
                        class="p-1 rounded-md bg-white shadow-sm border border-slate-100 text-slate-400 hover:text-red-500 transition-colors">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
                <span class="absolute top-1 left-1 text-[8px] text-slate-300 font-mono">${a.SortOrder||'—'}</span>
            </div>`).join('');
    } catch {
        _masterQuality.areas = [];
        _renderMasterQuality();
        if (gridEl) gridEl.innerHTML = `<div class="text-center text-red-400 text-xs py-4 col-span-full">โหลดไม่ได้</div>`;
    }
}

function _areaFormHTML(data = {}) {
    return `
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">ชื่อพื้นที่ <span class="text-red-400">*</span></label>
              <input type="text" id="area-name" class="form-input w-full rounded-lg text-sm" value="${data.Name||''}" placeholder="เช่น โรงงาน 1" required autofocus>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">รหัส (Code) <span class="text-red-400">*</span></label>
              <input type="text" id="area-code" class="form-input w-full rounded-lg text-sm font-mono" value="${data.Code||''}" placeholder="เช่น Fac1">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">ลำดับ</label>
              <input type="number" id="area-sort" class="form-input w-full rounded-lg text-sm" value="${data.SortOrder||99}" min="1" max="99">
            </div>
          </div>
          <p class="text-[10px] text-slate-400">พื้นที่นี้จะปรากฏใน: ตาราง Rotation · ฟอร์มรายงานปัญหา · Self-Patrol check-in</p>
          <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="px-4 py-2 rounded-lg text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">ยกเลิก</button>
            <button id="area-submit-btn" type="button" class="px-5 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90" style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก</button>
          </div>
        </div>`;
}

window.openAddAreaModal = () => {
    openModal('เพิ่มพื้นที่โรงงาน', _areaFormHTML(), 'max-w-sm');
    setTimeout(() => {
        document.getElementById('area-submit-btn')?.addEventListener('click', async () => {
            const Name      = document.getElementById('area-name')?.value.trim();
            const Code      = document.getElementById('area-code')?.value.trim();
            const SortOrder = parseInt(document.getElementById('area-sort')?.value) || 99;
            if (!Name || !Code) { showToast('กรุณาระบุชื่อและรหัสพื้นที่', 'error'); return; }
            try {
                const res = await API.post('/master/areas', { Name, Code, SortOrder });
                if (res.success) { showToast('เพิ่มพื้นที่สำเร็จ', 'success'); closeModal(); loadAreasList(); }
                else showError(res.message);
            } catch (err) { showError(err.message); }
        });
    }, 50);
};

window.editAreaModal = (id, name, code, sort) => {
    openModal('แก้ไขพื้นที่', _areaFormHTML({ Name: name, Code: code, SortOrder: sort }), 'max-w-sm');
    setTimeout(() => {
        document.getElementById('area-submit-btn')?.addEventListener('click', async () => {
            const Name      = document.getElementById('area-name')?.value.trim();
            const Code      = document.getElementById('area-code')?.value.trim();
            const SortOrder = parseInt(document.getElementById('area-sort')?.value) || 99;
            if (!Name || !Code) { showToast('กรุณาระบุชื่อและรหัสพื้นที่', 'error'); return; }
            try {
                const res = await API.put(`/master/areas/${id}`, { Name, Code, SortOrder });
                if (res.success) { showToast('แก้ไขสำเร็จ', 'success'); closeModal(); loadAreasList(); }
                else showError(res.message);
            } catch (err) { showError(err.message); }
        });
    }, 50);
};

window.deleteArea = async (id, name) => {
    if (!confirm(`ลบพื้นที่ "${name}"?\nข้อมูล Rotation ที่ผูกกับพื้นที่นี้อาจได้รับผลกระทบ`)) return;
    try {
        const res = await API.delete(`/master/areas/${id}`);
        if (res.success) { showToast('ลบสำเร็จ', 'success'); loadAreasList(); }
        else showError(res.message);
    } catch (err) { showError(err.message); }
};

async function loadMasterList(type) {
    if (type === 'positions') return loadPositionsList();
    const listEl  = document.getElementById(`list-${type}`);
    const countEl = document.getElementById(`count-${type}`);
    if (listEl) listEl.innerHTML = `<li class="text-center text-xs text-slate-300 py-4 animate-pulse">กำลังโหลด...</li>`;
    try {
        const res = await API.get(`/master/${type}`);
        if (!res.success) throw new Error(res.message);
        _masterQuality[type] = res.data || [];
        _renderMasterQuality();
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
    } catch { _masterQuality[type] = []; _renderMasterQuality(); listEl.innerHTML = `<li class="text-center text-red-400 text-xs py-4">โหลดไม่ได้</li>`; }
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
            const name   = document.getElementById('edit-master-input')?.value.trim();
            if (!name) return;
            const subBtn = e.target.querySelector('[type=submit]');
            const orig   = _btnLoad(subBtn, 'กำลังบันทึก...');
            try {
                const res = await API.put(`/master/${type}/${id}`, { Name: name });
                if (res.success) { showToast('แก้ไขสำเร็จ', 'success'); closeModal(); loadMasterList(type); }
                else { _btnRestore(subBtn, orig); showError(res.message); }
            } catch (err) { _btnRestore(subBtn, orig); showError(err.message); }
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
        <div class="ds-filter-bar flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
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
        <div id="emp-quality-strip" class="grid grid-cols-2 lg:grid-cols-5 gap-3"></div>
        <div class="ds-table-wrap">
            <div id="emp-table-wrap">
                <div class="py-16 text-center text-slate-400 text-sm">กำลังโหลด...</div>
            </div>
        </div>
        <div id="emp-pagination" class="flex justify-between items-center"></div>
    </div>`;

    window._empSearch = (q) => { _empSearch = q.toLowerCase(); _empPage = 1; _renderEmpTable(); };

    const [empsRes, deptsRes, posRes, unitsRes] = await Promise.all([
        API.get('/employees').catch(() => ({ data: [] })),
        API.get('/master/departments').catch(() => ({ data: [] })),
        API.get('/master/positions').catch(() => ({ data: [] })),
        API.get('/admin/org/units').catch(() => ({ data: [] })),
    ]);
    _empCache  = empsRes?.data   || [];
    _deptCache = deptsRes?.data  || [];
    _posCache  = posRes?.data    || [];
    _unitCache = unitsRes?.data  || [];
    _renderEmpTable();
}

function _renderEmpTable() {
    const wrap   = document.getElementById('emp-table-wrap');
    const pagEl  = document.getElementById('emp-pagination');
    const qEl    = document.getElementById('emp-quality-strip');
    if (!wrap) return;

    const filtered = _empCache.filter(e =>
        !_empSearch ||
        (e.EmployeeName||'').toLowerCase().includes(_empSearch) ||
        (e.EmployeeID  ||'').toLowerCase().includes(_empSearch) ||
        (e.Department  ||'').toLowerCase().includes(_empSearch) ||
        (e.Position    ||'').toLowerCase().includes(_empSearch)
    );

    if (qEl) {
        const total = _empCache.length;
        const missingDept = _empCache.filter(e => !(e.Department || '').trim()).length;
        const missingPosition = _empCache.filter(e => !(e.Position || '').trim()).length;
        const missingName = _empCache.filter(e => !(e.EmployeeName || '').trim()).length;
        const missingCore = missingDept + missingPosition + missingName;
        const adminCount = _empCache.filter(e => String(e.Role || '').toLowerCase() === 'admin').length;
        const deptCount = new Set(_empCache.map(e => (e.Department || '').trim()).filter(Boolean)).size;
        const unitAssigned = _empCache.filter(e => (e.Unit || '').trim()).length;
        const unitPct = total ? Math.round(unitAssigned / total * 100) : 0;
        qEl.innerHTML = `
        <button type="button" onclick="document.getElementById('emp-search-input')?.focus()"
            class="text-left ds-metric-card ${missingCore ? 'is-warn' : 'is-good'} hover:shadow-sm transition-shadow">
            <p class="ds-metric-label">Data Quality</p>
            <p class="ds-metric-value">${missingCore ? 'Review' : 'Ready'}</p>
            <p class="ds-metric-hint">${missingCore} missing core fields</p>
        </button>
        ${metricCard('Employees', total.toLocaleString(), `${filtered.length.toLocaleString()} in current view`)}
        <button type="button" onclick="window._adminTab('reference')"
            class="text-left ds-metric-card ${missingDept ? 'is-warn' : ''} hover:shadow-sm transition-shadow">
            <p class="text-[10px] font-bold uppercase ${missingDept ? 'text-amber-600' : 'text-slate-500'}">Department Coverage</p>
            <p class="mt-1 text-sm font-black ${missingDept ? 'text-amber-700' : 'text-slate-700'}">${deptCount}</p>
            <p class="mt-1 text-[11px] text-slate-500">${missingDept} missing dept</p>
        </button>
        <button type="button" onclick="window._adminTab('reference')"
            class="text-left ds-metric-card ${missingPosition ? 'is-warn' : ''} hover:shadow-sm transition-shadow">
            <p class="text-[10px] font-bold uppercase ${missingPosition ? 'text-amber-600' : 'text-slate-500'}">Position Coverage</p>
            <p class="mt-1 text-sm font-black ${missingPosition ? 'text-amber-700' : 'text-slate-700'}">${missingPosition} gap</p>
            <p class="mt-1 text-[11px] text-slate-500">${unitPct}% unit assigned</p>
        </button>
        <button type="button" onclick="window._adminTab('permissions')"
            class="text-left ds-metric-card ${adminCount > 1 ? 'is-risk' : ''} hover:shadow-sm transition-shadow">
            <p class="text-[10px] font-bold uppercase ${adminCount > 1 ? 'text-red-600' : 'text-slate-500'}">Admin Accounts</p>
            <p class="mt-1 text-sm font-black ${adminCount > 1 ? 'text-red-700' : 'text-slate-700'}">${adminCount}</p>
            <p class="mt-1 text-[11px] text-slate-500">Review privilege scope</p>
        </button>`;
    }

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
        const label = role || 'User';
        const className = label === 'Admin' ? 'is-failed' : label === 'Viewer' ? 'is-info' : '';
        return dsStatusBadge(label, { className });
    };

    wrap.innerHTML = `
    <table class="ds-table text-sm">
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
                <p class="mt-1.5">ถ้า EmployeeID ซ้ำ จะอัปเดตข้อมูลเดิม (Upsert) · ค่าใน Department / Position / Team ต้องตรงกับ master</p>
            </div>
            <button onclick="window._downloadImportTemplate()" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-emerald-300 text-emerald-700 text-xs font-bold hover:bg-emerald-50 transition-all">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Download Template (พร้อมค่าอ้างอิงจาก master)
            </button>
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
        </div>`, 'max-w-lg');
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
    if (!window.XLSX) { showToast('ไม่พบ SheetJS library', 'error'); return; }
    btn.disabled = true; btn.textContent = 'กำลังนำเข้า...';
    try {
        const buf  = await input.files[0].arrayBuffer();
        const wb   = XLSX.read(buf, { type: 'array' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        if (data.length === 0) { showToast('ไฟล์ไม่มีข้อมูล', 'error'); return; }

        const fd = new FormData();
        fd.append('file', input.files[0]);
        const res = await API.post('/admin/employee/import', fd);

        // ── Build result UI ──────────────────────────────────────────────
        const ok   = res.successCount || 0;
        const err  = res.errorCount   || 0;
        const warn = res.warnCount    || 0;
        const details = res.details   || [];

        const statusBadge = (s) => {
            if (s === 'ok')    return `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">สำเร็จ</span>`;
            if (s === 'warn')  return `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">คำเตือน</span>`;
            if (s === 'error') return `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">ล้มเหลว</span>`;
            return `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">ข้าม</span>`;
        };

        const rows = details.map(d => `
            <tr class="${d.status === 'error' ? 'bg-red-50' : d.status === 'warn' ? 'bg-amber-50' : ''}">
                <td class="px-2 py-1.5 font-mono text-[10px] text-slate-500">${d.id}</td>
                <td class="px-2 py-1.5 text-[10px] text-slate-700">${d.name}</td>
                <td class="px-2 py-1.5">${statusBadge(d.status)}</td>
                <td class="px-2 py-1.5 text-[10px] text-slate-500">${d.reason || ''}</td>
            </tr>`).join('');

        resEl.innerHTML = `
            <div class="space-y-3">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">สำเร็จ ${ok}</span>
                    ${warn ? `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">คำเตือน ${warn}</span>` : ''}
                    ${err  ? `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">ล้มเหลว ${err}</span>` : ''}
                </div>
                ${details.length ? `
                <div class="overflow-auto max-h-52 rounded-xl border border-slate-200">
                    <table class="w-full text-left">
                        <thead class="bg-slate-50 sticky top-0">
                            <tr>
                                <th class="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase">ID</th>
                                <th class="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase">ชื่อ</th>
                                <th class="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase">สถานะ</th>
                                <th class="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase">หมายเหตุ</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">${rows}</tbody>
                    </table>
                </div>` : ''}
            </div>`;
        resEl.className = '';
        resEl.classList.remove('hidden');

        showToast(`Import สำเร็จ ${ok} รายการ${warn ? ` (คำเตือน ${warn})` : ''}`, err ? 'warning' : 'success');
        const empsRes = await API.get('/employees').catch(() => ({ data: [] }));
        _empCache = empsRes?.data || [];
        _renderEmpTable();
    } catch (err) {
        resEl.className = 'text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-200';
        resEl.textContent = err?.message || 'เกิดข้อผิดพลาด';
        resEl.classList.remove('hidden');
    } finally { btn.disabled = false; btn.textContent = 'นำเข้าข้อมูล'; }
};

window._downloadImportTemplate = async () => {
    if (!window.XLSX) { showToast('ไม่พบ SheetJS library', 'error'); return; }
    try {
        const tmpl = await API.get('/admin/employee/import-template-data');
        const wb   = XLSX.utils.book_new();

        // ── Sheet 1: Template ────────────────────────────────────────────
        const headers = ['EmployeeID', 'EmployeeName', 'Department', 'Unit', 'Position', 'Role'];
        const example = [
            '012345',
            'ชื่อ นามสกุล',
            tmpl.departments[0] || '',
            tmpl.units[0]       || '',
            tmpl.positions[0]   || '',
            'User',
        ];
        const ws1 = XLSX.utils.aoa_to_sheet([headers, example]);
        ws1['!cols'] = [14, 24, 30, 30, 24, 10].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws1, 'พนักงาน');

        // ── Sheet 2: Reference ───────────────────────────────────────────
        const refHeaders = ['Department', 'Position', 'Unit', 'Role'];
        const maxLen = Math.max(
            tmpl.departments.length, tmpl.positions.length,
            tmpl.units.length, tmpl.roles.length
        );
        const refRows = Array.from({ length: maxLen }, (_, i) => [
            tmpl.departments[i] || '',
            tmpl.positions[i]   || '',
            tmpl.units[i]       || '',
            tmpl.roles[i]       || '',
        ]);
        const ws2 = XLSX.utils.aoa_to_sheet([refHeaders, ...refRows]);
        ws2['!cols'] = [30, 24, 30, 10].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws2, 'ค่าอ้างอิง');

        XLSX.writeFile(wb, 'Employee_Import_Template.xlsx');
        showToast('ดาวน์โหลด Template สำเร็จ', 'success');
    } catch (err) {
        showToast('ดาวน์โหลดไม่สำเร็จ: ' + (err?.message || err), 'error');
    }
};

// =============================================================================
// TAB: SYSTEM HEALTH
// =============================================================================
async function renderSystemHealth(container) {
    container.innerHTML = _skelSpinner();
    try {
        const res = await API.get('/admin/system-health');
        const d   = res.data || {};
        const m   = d.modules || {};
        const al  = d.alerts  || {};
        const readiness = d.readiness || {};
        const audit = d.audit || {};

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
            <div class="ds-section border-l-4 ${colorClass[color]||colorClass.slate}">
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

        const readinessScore = Number(readiness.score ?? 0);
        const readinessTone = readinessScore >= 90
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : readinessScore >= 70
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-rose-200 bg-rose-50 text-rose-700';
        const staleWork = (al.staleChangeNotices?.length || 0) + (al.staleHiyari?.length || 0);
        const missingTables = readiness.missingTables || [];
        const activeSignals = (readiness.signals || []).filter(s => s.count > 0);
        const signalList = activeSignals.length
            ? activeSignals.map(s => `
                <div class="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
                    <div>
                        <p class="text-xs font-bold text-slate-700">${escHtml(s.label || s.key || 'Signal')}</p>
                        <p class="text-[11px] text-slate-400">${escHtml((s.detail || []).slice(0, 3).map(x => typeof x === 'string' ? x : (x.NoticeNo || x.Department || x.id || '')).filter(Boolean).join(', ') || 'Needs admin review')}</p>
                    </div>
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${s.severity === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}">${s.count}</span>
                </div>`).join('')
            : `<div class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3">No major readiness signals detected.</div>`;

        container.innerHTML = `
        <div class="animate-fade-in space-y-6">
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div class="xl:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    ${metricCard('Pre-production Readiness', `${readinessScore}%`, readiness.status || 'Unknown', readinessScore >= 90 ? 'good' : readinessScore >= 70 ? 'warn' : 'risk')}
                    ${metricCard('Failed API 24h', audit.failed24h ?? '-', 'From Admin AuditLogs', (audit.failed24h || 0) > 0 ? 'risk' : 'good')}
                    ${metricCard('Audit Activity 24h', audit.last24h ?? '-', 'Signed-in mutations', 'info')}
                    ${metricCard('Stale Work', staleWork, '4M + Hiyari alerts', staleWork > 0 ? 'warn' : 'good')}
                </div>
                <div class="ds-section">
                    <div class="flex items-center justify-between gap-3 mb-2">
                        <h3 class="font-bold text-slate-700 text-sm">Readiness Signals</h3>
                        <span class="text-[11px] font-bold px-2 py-0.5 rounded-full border ${readinessTone}">${escHtml(readiness.status || 'Unknown')}</span>
                    </div>
                    ${signalList}
                    ${missingTables.length ? `<p class="text-[11px] text-rose-500 mt-2">Missing tables: ${escHtml(missingTables.join(', '))}</p>` : ''}
                </div>
            </div>
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
                <div class="ds-section border-amber-200">
                    <h3 class="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
                        <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Change Notice ค้างนาน (&gt;30 วัน)
                    </h3>
                    ${alertRows(al.staleChangeNotices,
                        [{key:'NoticeNo',cls:'font-mono text-slate-500 w-32'},{key:'Department'},{key:'ChangeDate',cls:'text-slate-400'}],
                        'ไม่มีรายการค้าง — '
                    )}
                </div>
                <div class="ds-section border-rose-200">
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
        container.innerHTML = `<div class="text-center py-20 text-red-500 text-sm">โหลดข้อมูลไม่ได้: ${escHtml(err.message)}</div>`;
    }
}

// =============================================================================
// TAB: AUDIT LOG
// =============================================================================
async function renderAuditLogLegacy(container) {
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

async function loadAuditLogLegacy() {
    const wrap    = document.getElementById('audit-table-wrap');
    const pagEl   = document.getElementById('audit-pagination');
    const action  = document.getElementById('audit-filter-action')?.value || '';
    if (!wrap) return;
    wrap.innerHTML = _skelRows(6, 5);
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
            <table class="ds-table text-sm">
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
        wrap.innerHTML = `<div class="py-12 text-center text-red-400 text-sm">โหลดไม่ได้: ${escHtml(err.message)}</div>`;
    }
}

async function exportAuditCSV() {
    const params = new URLSearchParams({ page: '1', limit: '5000' });
    const filters = {
        q: document.getElementById('audit-filter-q')?.value?.trim() || '',
        module: document.getElementById('audit-filter-module')?.value || '',
        action: document.getElementById('audit-filter-action')?.value || '',
        dateFrom: document.getElementById('audit-date-from')?.value || '',
        dateTo: document.getElementById('audit-date-to')?.value || '',
    };
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    if (_auditFilterFailed) params.set('failed', '1');

    try {
        const res = await API.get(`/admin/audit-logs?${params.toString()}`);
        const rows = res.data || [];
        if (!rows.length) { showToast('ไม่มีข้อมูลให้ Export', 'error'); return; }

        const cols = ['id','ActionTime','AdminID','AdminName','Role','Department','Module','Action','Method','Path','StatusCode','TargetType','TargetID','Detail','IPAddress'];
        const escape = v => {
            const s = String(v == null ? '' : v).replace(/"/g, '""');
            return /[",\n\r]/.test(s) ? `"${s}"` : s;
        };
        const csv = [cols.join(','), ...rows.map(r => cols.map(c => escape(r[c])).join(','))].join('\r\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: `audit_log_${new Date().toISOString().slice(0,10)}.csv` });
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
        showToast(`Export สำเร็จ ${rows.length} รายการ`, 'success');
    } catch (err) {
        showToast('Export ไม่ได้: ' + err.message, 'error');
    }
}

async function renderAuditLog(container) {
    _auditPage = 1;
    _auditFilterFailed = false;
    container.innerHTML = `
    <div class="animate-fade-in space-y-4">
        <div class="ds-filter-bar">
            <div class="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                <div class="md:col-span-2">
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Search</label>
                    <input id="audit-filter-q" oninput="window._auditDebouncedLoad&&window._auditDebouncedLoad()" class="form-input w-full text-sm border-slate-200 rounded-lg py-2 px-3" placeholder="user, action, target, path">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Module</label>
                    <select id="audit-filter-module" onchange="window._loadAuditLog()" class="form-select w-full text-sm border-slate-200 rounded-lg py-2 pl-3 pr-8">
                        <option value="">All Modules</option>
                    </select>
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Action</label>
                    <select id="audit-filter-action" onchange="window._loadAuditLog()" class="form-select w-full text-sm border-slate-200 rounded-lg py-2 pl-3 pr-8">
                        <option value="">All Actions</option>
                    </select>
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">From</label>
                    <input id="audit-date-from" type="date" onchange="window._loadAuditLog()" class="form-input w-full text-sm border-slate-200 rounded-lg py-2 px-3">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">To</label>
                    <div class="flex gap-2">
                        <input id="audit-date-to" type="date" onchange="window._loadAuditLog()" class="form-input w-full text-sm border-slate-200 rounded-lg py-2 px-3">
                        <button onclick="window._loadAuditLog()" class="btn bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg font-medium flex items-center transition-colors" title="Refresh">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        </button>
                    </div>
                </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 mt-3">
                <span class="text-[11px] font-bold text-slate-400 uppercase">Quick:</span>
                <button id="audit-chip-failed" onclick="window._auditToggleFailed()"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                           bg-white border-slate-200 text-slate-500 hover:border-rose-300 hover:text-rose-600">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                    Failed Only
                </button>
                <button onclick="window._exportAuditCSV()"
                    class="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                           bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200
                           hover:border-emerald-200 transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Export CSV
                </button>
            </div>
        </div>
        <div id="audit-summary-strip" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <div class="ds-metric-card text-sm text-slate-400">Loading audit summary...</div>
        </div>
        <div class="ds-table-wrap">
            <div id="audit-table-wrap"><div class="py-16 text-center text-slate-400 text-sm">Loading...</div></div>
        </div>
        <div id="audit-pagination" class="flex justify-between items-center"></div>
    </div>`;

    let auditTimer = null;
    window._loadAuditLog = () => {
        _auditPage = 1;
        loadAuditLog();
    };
    window._auditDebouncedLoad = () => {
        clearTimeout(auditTimer);
        auditTimer = setTimeout(() => {
            _auditPage = 1;
            loadAuditLog();
        }, 350);
    };
    window._auditChangePage = (p) => { _auditPage = p; loadAuditLog(); };
    window._auditShowDetail = showAuditDetail;
    window._auditToggleFailed = () => {
        _auditFilterFailed = !_auditFilterFailed;
        const chip = document.getElementById('audit-chip-failed');
        if (chip) {
            chip.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                ${_auditFilterFailed
                    ? 'bg-rose-100 border-rose-300 text-rose-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-rose-300 hover:text-rose-600'}`;
        }
        _auditPage = 1;
        loadAuditLog();
    };
    window._exportAuditCSV = exportAuditCSV;
    loadAuditLog();
}

function updateAuditFacets(facets = {}) {
    const updateSelect = (id, items = [], label) => {
        const el = document.getElementById(id);
        if (!el) return;
        const current = el.value;
        const unique = [...new Set(items.filter(Boolean))];
        el.innerHTML = `<option value="">${label}</option>` + unique.map(item =>
            `<option value="${escHtml(item)}" ${item === current ? 'selected' : ''}>${escHtml(item)}</option>`
        ).join('');
    };
    updateSelect('audit-filter-module', facets.modules || [], 'All Modules');
    updateSelect('audit-filter-action', facets.actions || [], 'All Actions');
}

function auditActionClass(action = '') {
    if (action.startsWith('CREATE')) return 'bg-emerald-100 text-emerald-700';
    if (action.startsWith('UPDATE')) return 'bg-indigo-100 text-indigo-700';
    if (action.startsWith('DELETE')) return 'bg-red-100 text-red-600';
    if (action.startsWith('FAILED')) return 'bg-rose-100 text-rose-700';
    if (action.includes('PASSWORD')) return 'bg-amber-100 text-amber-700';
    if (action.includes('IMPORT')) return 'bg-sky-100 text-sky-700';
    return 'bg-slate-100 text-slate-600';
}

function auditInfoBlock(label, value) {
    return `
    <div class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
        <p class="text-[10px] font-bold uppercase text-slate-400">${escHtml(label)}</p>
        <p class="text-xs font-semibold text-slate-700 mt-1 break-words">${escHtml(value || '-')}</p>
    </div>`;
}

function parseAuditMetadata(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return null; }
}

function showAuditDetail(id) {
    const row = _auditRows.find(r => String(r.id) === String(id));
    if (!row) return;
    const metadata = parseAuditMetadata(row.Metadata);
    const metadataHtml = metadata
        ? `<pre class="text-[11px] leading-relaxed bg-slate-950 text-slate-100 rounded-lg p-3 overflow-auto max-h-64">${escHtml(JSON.stringify(metadata, null, 2))}</pre>`
        : `<div class="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg p-3">No metadata captured.</div>`;
    const status = Number(row.StatusCode || 0);
    const okStatus = !status || status < 400;
    const body = `
        <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                ${auditInfoBlock('User', [row.AdminName, row.AdminID].filter(Boolean).join(' / '))}
                ${auditInfoBlock('Role / Department', [row.Role, row.Department].filter(Boolean).join(' / '))}
                ${auditInfoBlock('Method / Path', [row.Method, row.Path].filter(Boolean).join(' '))}
                ${auditInfoBlock('Target', `${row.TargetType || '-'}${row.TargetID ? ' #' + row.TargetID : ''}`)}
                ${auditInfoBlock('IP Address', row.IPAddress)}
                ${auditInfoBlock('User Agent', row.UserAgent)}
            </div>
            <div>
                <p class="text-[11px] font-bold uppercase text-slate-400 mb-1">Detail</p>
                <div class="text-sm text-slate-700 bg-white border border-slate-100 rounded-lg p-3">${escHtml(row.Detail || '-')}</div>
            </div>
            <div>
                <p class="text-[11px] font-bold uppercase text-slate-400 mb-1">Metadata</p>
                ${metadataHtml}
            </div>
        </div>`;

    openDetailModal({
        title: escHtml(row.Action || 'Audit Activity'),
        subtitle: row.ActionTime ? new Date(row.ActionTime).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'medium' }) : '',
        meta: [
            { label: row.Module || 'system', className: 'bg-slate-50 text-slate-600 border-slate-200' },
            { label: row.StatusCode || 'OK', className: okStatus ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200' },
        ],
        body,
        size: 'max-w-3xl',
    });
}

function renderAuditSummary(rows = [], total = 0) {
    const el = document.getElementById('audit-summary-strip');
    if (!el) return;
    const failures = rows.filter(r => Number(r.StatusCode || 0) >= 400 || String(r.Action || '').startsWith('FAILED')).length;
    const mutations = rows.filter(r => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(r.Method || '').toUpperCase())).length;
    const modules = new Set(rows.map(r => r.Module).filter(Boolean)).size;
    const users = new Set(rows.map(r => r.AdminID || r.AdminName).filter(Boolean)).size;
    const latest = rows[0]?.ActionTime
        ? new Date(rows[0].ActionTime).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
        : '-';
    el.innerHTML = `
        ${metricCard('Matched Records', total, 'Current filters')}
        ${metricCard('Failures Shown', failures, 'On this page', failures ? 'risk' : 'good')}
        ${metricCard('Modules Touched', modules, 'On this page', 'info')}
        ${metricCard('Active Users', users, 'On this page', 'warn')}
        ${metricCard('Latest Activity', latest, `${mutations} mutations shown`)}
    `;
}

async function loadAuditLog() {
    const wrap = document.getElementById('audit-table-wrap');
    const pagEl = document.getElementById('audit-pagination');
    if (!wrap) return;

    const params = new URLSearchParams({
        page: String(_auditPage),
        limit: String(AUDIT_LIMIT),
    });
    const filters = {
        q: document.getElementById('audit-filter-q')?.value?.trim() || '',
        module: document.getElementById('audit-filter-module')?.value || '',
        action: document.getElementById('audit-filter-action')?.value || '',
        dateFrom: document.getElementById('audit-date-from')?.value || '',
        dateTo: document.getElementById('audit-date-to')?.value || '',
    };
    Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
    });
    if (_auditFilterFailed) params.set('failed', '1');

    wrap.innerHTML = _skelRows(6, 7);
    try {
        const res = await API.get(`/admin/audit-logs?${params.toString()}`);
        _auditTotal = res.total || 0;
        const rows = res.data || [];
        _auditRows = rows;
        const totalPages = Math.max(1, Math.ceil(_auditTotal / AUDIT_LIMIT));
        updateAuditFacets(res.facets || {});
        renderAuditSummary(rows, _auditTotal);

        if (rows.length === 0) {
            wrap.innerHTML = emptyState('No audit activity found', 'Try changing the module, action, date, or search filters.');
        } else {
            wrap.innerHTML = `
            <div class="overflow-x-auto">
            <table class="ds-table min-w-[980px]">
                <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-left">
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Time</th>
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">User</th>
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Module</th>
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Action</th>
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Target / Path</th>
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Status</th>
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Detail</th>
                        <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${rows.map(r => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap font-mono">
                            ${new Date(r.ActionTime).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'})}
                        </td>
                        <td class="px-4 py-3">
                            <div class="text-xs text-slate-700 font-semibold">${escHtml(r.AdminName||r.AdminID||'-')}</div>
                            <div class="text-[11px] text-slate-400">${escHtml([r.AdminID, r.Role, r.Department].filter(Boolean).join(' / ') || '-')}</div>
                        </td>
                        <td class="px-4 py-3 text-xs text-slate-600 font-mono">${escHtml(r.Module||'-')}</td>
                        <td class="px-4 py-3">
                            ${dsStatusBadge(r.Action || '-', { className: auditActionClass(r.Action || '') })}
                        </td>
                        <td class="px-4 py-3 text-xs text-slate-500">
                            <div class="font-mono">${escHtml(r.TargetType||'-')}${r.TargetID?` #${escHtml(r.TargetID)}`:''}</div>
                            <div class="text-[11px] text-slate-400 truncate max-w-[220px]">${escHtml(r.Path||'')}</div>
                        </td>
                        <td class="px-4 py-3 text-xs font-mono">${dsStatusBadge(Number(r.StatusCode) >= 400 ? 'Failed' : 'Approved', { label: r.StatusCode || 'OK' })}</td>
                        <td class="px-4 py-3 text-xs text-slate-600 max-w-xs truncate" title="${escHtml(r.Detail||'')}">${escHtml(r.Detail||'-')}</td>
                        <td class="px-4 py-3 text-right">
                            <button onclick="window._auditShowDetail&&window._auditShowDetail('${escHtml(r.id)}')" class="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Detail</button>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
            </div>
            <div class="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">
                Showing ${((_auditPage-1)*AUDIT_LIMIT)+1}-${Math.min(_auditPage*AUDIT_LIMIT,_auditTotal)} of ${_auditTotal} records
            </div>`;
        }

        if (pagEl) {
            pagEl.innerHTML = totalPages <= 1 ? '' : `
            <div class="flex items-center gap-2 text-xs text-slate-600">
                <button onclick="window._auditChangePage(${_auditPage-1})" ${_auditPage<=1?'disabled':''} class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Previous</button>
                <span class="px-3">Page <strong>${_auditPage}</strong> / ${totalPages}</span>
                <button onclick="window._auditChangePage(${_auditPage+1})" ${_auditPage>=totalPages?'disabled':''} class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next</button>
            </div>`;
        }
    } catch (err) {
        renderAuditSummary([], 0);
        wrap.innerHTML = `<div class="py-12 text-center text-red-400 text-sm">Load failed: ${escHtml(err.message)}</div>`;
    }
}

// =============================================================================
// TAB: เป้าหมายกิจกรรม (Activity Targets)
// =============================================================================
let _atActivities   = [];   // static list from /api/activity-targets/activities
let _atPositions    = [];   // master positions list
let _atSubTab       = 'template'; // 'template' | 'person'
let _atSelPosition  = '';
let _atEmpSearch    = '';
let _atEmpResults   = [];
let _atSelEmp       = null; // { EmployeeID, Name, Position }
let _atEmpTargets   = [];   // targets for selected employee

async function renderActivityTargets(container) {
    // fetch activities + positions in parallel
    try {
        const [actRes, posRes] = await Promise.all([
            API.get('/activity-targets/activities'),
            API.get('/master/positions'),
        ]);
        _atActivities = actRes.data || [];
        _atPositions  = (posRes.data || []).map(p => p.Name || p.PositionName || p.name || p).filter(Boolean);
    } catch (e) {
        container.innerHTML = `<div class="py-16 text-center text-red-400 text-sm">โหลดข้อมูลไม่ได้: ${e.message}</div>`;
        return;
    }

    _renderAtShell(container);
    _atSwitchSubTab(_atSubTab);
}

function _renderAtShell(container) {
    container.innerHTML = `
    <div class="animate-fade-in space-y-5">

        <!-- Header -->
        <div class="flex items-center justify-between">
            <div>
                <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <span class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#6366f1,#0284c7);box-shadow:0 2px 10px rgba(99,102,241,0.3)">
                        <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                    </span>
                    เป้าหมายกิจกรรมความปลอดภัย
                </h2>
                <p class="text-sm text-slate-500 mt-0.5 ml-10">กำหนดเกณฑ์รายปีสำหรับแต่ละกิจกรรม — ตามตำแหน่ง หรือรายบุคคล</p>
            </div>
        </div>

        <!-- Sub-tabs -->
        <div class="flex bg-slate-100 p-1 rounded-xl gap-1 w-fit">
            <button id="at-sub-template" onclick="window._atSwitchSubTab('template')"
                class="px-4 py-2 text-xs font-semibold rounded-lg transition-all bg-white shadow-sm text-slate-800">
                เทมเพลตตามตำแหน่ง
            </button>
            <button id="at-sub-person" onclick="window._atSwitchSubTab('person')"
                class="px-4 py-2 text-xs font-semibold rounded-lg transition-all text-slate-500 hover:text-slate-700">
                กำหนดรายบุคคล
            </button>
        </div>

        <!-- Content area -->
        <div id="at-content"></div>
    </div>`;

    window._atSwitchSubTab  = _atSwitchSubTab;
    window._atSaveTemplate  = _atSaveTemplate;
    window._atToggleTplNA   = _atToggleTplNA;
    window._atBulkApply     = _atBulkApply;
    window._atSearchEmp     = _atSearchEmp;
    window._atSelectEmp     = _atSelectEmp;
    window._atSaveOverride  = _atSaveOverride;
    window._atClearOverride = _atClearOverride;
    window._atToggleNA      = _atToggleNA;
}

function _atSwitchSubTab(key) {
    _atSubTab = key;
    const active   = 'px-4 py-2 text-xs font-semibold rounded-lg transition-all bg-white shadow-sm text-slate-800';
    const inactive = 'px-4 py-2 text-xs font-semibold rounded-lg transition-all text-slate-500 hover:text-slate-700';
    document.getElementById('at-sub-template')?.setAttribute('class', key === 'template' ? active : inactive);
    document.getElementById('at-sub-person')?.setAttribute('class',   key === 'person'   ? active : inactive);
    const area = document.getElementById('at-content');
    if (!area) return;
    if (key === 'template') _renderAtTemplate(area);
    else                    _renderAtPerson(area);
}

// ── Sub-tab 1: Position Template ─────────────────────────────────────────────
function _renderAtTemplate(area) {
    const posOptions = _atPositions.map(p =>
        `<option value="${p}" ${p === _atSelPosition ? 'selected' : ''}>${p}</option>`
    ).join('');

    area.innerHTML = `
    <div class="space-y-5">
        <!-- Position selector -->
        <div class="ds-filter-bar flex flex-wrap gap-3 items-center">
            <label class="text-sm font-semibold text-slate-700">ตำแหน่ง:</label>
            <select id="at-pos-sel" onchange="window._atLoadTemplate(this.value)"
                class="flex-1 min-w-[220px] px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                <option value="">-- เลือกตำแหน่ง --</option>
                ${posOptions}
            </select>
            <div id="at-bulk-btn-area">
                ${_atSelPosition ? `
                <button onclick="window._atBulkApply('${_atSelPosition.replace(/'/g,"\\'")}', this)"
                    class="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-white transition-all"
                    style="background:linear-gradient(135deg,#6366f1,#0284c7)">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                    ใช้เทมเพลตกับทุกคนในตำแหน่งนี้
                </button>` : ''}
            </div>
        </div>

        <!-- Activity grid -->
        <div id="at-tpl-grid">
            <div class="text-center py-16 text-slate-400">
                <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                </div>
                <p class="font-medium">เลือกตำแหน่งเพื่อจัดการเทมเพลต</p>
            </div>
        </div>
    </div>`;

    window._atLoadTemplate = async (pos) => {
        _atSelPosition = pos;
        // update bulk-apply button visibility without re-rendering the whole shell
        const btnArea = document.getElementById('at-bulk-btn-area');
        if (btnArea) {
            btnArea.innerHTML = pos ? `
            <button onclick="window._atBulkApply('${pos.replace(/'/g,"\\'")}', this)"
                class="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-white transition-all"
                style="background:linear-gradient(135deg,#6366f1,#0284c7)">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                ใช้เทมเพลตกับทุกคนในตำแหน่งนี้
            </button>` : '';
        }
        const grid = document.getElementById('at-tpl-grid');
        if (!grid) return;
        if (!pos) {
            grid.innerHTML = `
            <div class="text-center py-16 text-slate-400">
                <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                </div>
                <p class="font-medium">เลือกตำแหน่งเพื่อจัดการเทมเพลต</p>
            </div>`;
            return;
        }
        grid.innerHTML = `<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-9 w-9 border-4 border-indigo-500 border-t-transparent"></div></div>`;
        try {
            const res = await API.get(`/activity-targets/position-templates?position=${encodeURIComponent(pos)}`);
            const rows = res.data || [];
            const rowMap = {};
            rows.forEach(r => { rowMap[r.ActivityKey] = r; });
            grid.innerHTML = _atTemplateGridHtml(pos, rowMap);
        } catch (e) {
            grid.innerHTML = `<div class="py-8 text-center text-red-400 text-sm">โหลดไม่ได้: ${e.message}</div>`;
        }
    };

    if (_atSelPosition) window._atLoadTemplate(_atSelPosition);
}

function _atTemplateGridHtml(pos, rowMap) {
    const rows = _atActivities.map(a => {
        const d    = rowMap[a.key] || {};
        const isNA = d.IsNA === 1 || d.IsNA === true;
        const dimCls = isNA ? 'opacity-40 pointer-events-none select-none' : '';
        return `
        <tr class="hover:bg-slate-50 transition-colors ${isNA ? 'bg-slate-50/60' : ''}">
            <td class="px-4 py-3">
                <p class="text-sm font-semibold ${isNA ? 'line-through text-slate-400' : 'text-slate-800'}">${a.label}</p>
                <p class="text-xs text-slate-400 mt-0.5">${a.desc}</p>
            </td>
            <td class="px-4 py-3 text-center ${dimCls}">
                <input id="tgt-${a.key}-target" type="number" min="0" value="${isNA ? '' : (d.YearlyTarget ?? '')}"
                    placeholder="0" ${isNA ? 'disabled' : ''}
                    class="w-20 px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100">
            </td>
            <td class="px-4 py-3 text-center ${dimCls}">
                <div class="flex items-center gap-1 justify-center">
                    <input id="tgt-${a.key}-pct" type="number" min="0" max="100" value="${isNA ? '' : (d.PassPct ?? 80)}"
                        ${isNA ? 'disabled' : ''}
                        class="w-16 px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100">
                    <span class="text-xs text-slate-400">%</span>
                </div>
            </td>
            <td class="px-4 py-3 text-center">
                <div class="flex gap-1.5 justify-center">
                    ${!isNA ? `
                    <button onclick="window._atSaveTemplate('${pos.replace(/'/g,"\\'")}','${a.key}',this)"
                        class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                        บันทึก
                    </button>` : ''}
                    <button onclick="window._atToggleTplNA('${pos.replace(/'/g,"\\'")}','${a.key}',${isNA ? 0 : 1},this)"
                        title="${isNA ? 'ยกเลิก N/A' : 'ตั้งเป็น N/A (ไม่เกี่ยวข้อง)'}"
                        class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${isNA ? 'border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'border-slate-200 text-slate-500 bg-slate-50 hover:bg-slate-100'}">
                        ${isNA ? 'ยกเลิก N/A' : 'N/A'}
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    return `
    <div class="ds-table-wrap">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p class="text-sm font-bold text-slate-700">เทมเพลตสำหรับตำแหน่ง: <span class="text-indigo-600">${pos}</span></p>
            <p class="text-xs text-slate-400">วัดผลรายปี</p>
        </div>
        <table class="ds-table text-left">
            <thead class="bg-slate-50 border-b border-slate-100">
                <tr>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">กิจกรรม</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-32">เป้าหมาย/ปี</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-32">เกณฑ์ผ่าน</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-24"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">${rows}</tbody>
        </table>
    </div>`;
}

async function _atSaveTemplate(pos, actKey, btn) {
    const target = document.getElementById(`tgt-${actKey}-target`)?.value;
    const pct    = document.getElementById(`tgt-${actKey}-pct`)?.value;
    const orig   = btn.textContent;
    btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
    try {
        await API.put('/activity-targets/position-templates', { PositionName: pos, ActivityKey: actKey, YearlyTarget: Number(target)||0, PassPct: Number(pct)||80, IsNA: 0 });
        btn.textContent = 'บันทึกแล้ว';
        btn.className = btn.className.replace('border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100','border-emerald-200 text-emerald-700 bg-emerald-50');
        setTimeout(() => { btn.disabled = false; btn.textContent = orig; btn.className = btn.className.replace('border-emerald-200 text-emerald-700 bg-emerald-50','border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100'); }, 2000);
    } catch (e) {
        btn.disabled = false; btn.textContent = orig;
        alert('บันทึกไม่สำเร็จ: ' + e.message);
    }
}

async function _atToggleTplNA(pos, actKey, setNA, btn) {
    btn.disabled = true;
    try {
        await API.put('/activity-targets/position-templates', {
            PositionName: pos, ActivityKey: actKey,
            YearlyTarget: 0, PassPct: 0, IsNA: setNA ? 1 : 0,
        });
        // reload grid
        const res = await API.get(`/activity-targets/position-templates?position=${encodeURIComponent(pos)}`);
        const rowMap = {};
        (res.data || []).forEach(r => { rowMap[r.ActivityKey] = r; });
        const grid = document.getElementById('at-tpl-grid');
        if (grid) grid.innerHTML = _atTemplateGridHtml(pos, rowMap);
    } catch (e) {
        btn.disabled = false;
        alert('ไม่สำเร็จ: ' + e.message);
    }
}

async function _atBulkApply(pos, btn) {
    if (!confirm(`ใช้เทมเพลตนี้กับพนักงานทุกคนในตำแหน่ง "${pos}" ใช่หรือไม่?\n\nการดำเนินการนี้จะ override เป้าหมายรายบุคคลที่มีอยู่`)) return;
    const orig = btn.innerHTML;
    btn.disabled = true; btn.textContent = 'กำลังดำเนินการ...';
    try {
        const res = await API.post('/activity-targets/position-templates/bulk-apply', { PositionName: pos });
        alert(res.message || 'สำเร็จ');
    } catch (e) {
        alert('ไม่สำเร็จ: ' + e.message);
    } finally {
        btn.disabled = false; btn.innerHTML = orig;
    }
}

// ── Sub-tab 2: Per-person Override ───────────────────────────────────────────
async function _renderAtPerson(area) {
    area.innerHTML = `
    <div class="space-y-5">
        <!-- Employee search -->
        <div class="ds-filter-bar space-y-3">
            <p class="text-sm font-semibold text-slate-700">ค้นหาพนักงาน</p>
            <div class="flex gap-3">
                <div class="relative flex-1">
                    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                    <input id="at-emp-search" type="text" placeholder="ชื่อ หรือ รหัสพนักงาน..."
                        value="${_atEmpSearch}"
                        class="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                        oninput="window._atSearchEmp(this.value)">
                </div>
            </div>
            <div id="at-emp-results">
                <div class="text-xs text-slate-400 py-1">กำลังโหลดรายชื่อพนักงาน...</div>
            </div>
        </div>

        <!-- Selected employee targets -->
        <div id="at-person-grid"></div>
    </div>`;

    // pre-load employee cache then show initial list
    if (!_empCache.length) {
        try {
            const r = await API.get('/employees');
            _empCache = r?.data || [];
        } catch (e) {
            const el = document.getElementById('at-emp-results');
            if (el) el.innerHTML = `<div class="text-xs text-red-400 py-1">โหลดรายชื่อไม่ได้: ${e.message}</div>`;
        }
    }
    _atRenderEmpDropdown(_atEmpSearch);

    if (_atSelEmp) _renderAtPersonGrid(document.getElementById('at-person-grid'));
}

function _atRenderEmpDropdown(q) {
    const res_el = document.getElementById('at-emp-results');
    if (!res_el) return;
    const qLow = (q || '').toLowerCase().trim();
    const list = qLow.length === 0
        ? _empCache.slice(0, 15)
        : _empCache.filter(e =>
            (e.EmployeeName || '').toLowerCase().includes(qLow) ||
            (e.EmployeeID   || '').toLowerCase().includes(qLow)
          ).slice(0, 15);

    if (!list.length) {
        res_el.innerHTML = `<div class="text-xs text-slate-400 py-2">ไม่พบพนักงาน</div>`;
        return;
    }
    const hint = _empCache.length > 15 && !qLow
        ? `<div class="px-3 py-1.5 text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">แสดง 15 รายการแรก — พิมพ์เพื่อค้นหา</div>`
        : '';
    res_el.innerHTML = `
    <div class="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white shadow-sm mt-1 overflow-hidden max-h-60 overflow-y-auto">
        ${list.map(e => `
        <button onclick="window._atSelectEmp('${e.EmployeeID}','${(e.EmployeeName||'').replace(/'/g,"\\'")}','${(e.Position||'').replace(/'/g,"\\'")}',this)"
            class="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors">
            <span class="font-semibold text-sm text-slate-800">${e.EmployeeName || e.EmployeeID}</span>
            <span class="text-xs text-slate-400 ml-2">${e.EmployeeID}</span>
            ${e.Position ? `<span class="text-xs text-indigo-600 ml-2">· ${e.Position}</span>` : ''}
        </button>`).join('')}
        ${hint}
    </div>`;
}

function _atSearchEmp(q) {
    _atEmpSearch = q;
    _atRenderEmpDropdown(q);
}

async function _atSelectEmp(empId, name, position) {
    _atSelEmp = { EmployeeID: empId, Name: name, Position: position };
    _atEmpSearch = '';
    const searchEl = document.getElementById('at-emp-search');
    if (searchEl) searchEl.value = '';
    document.getElementById('at-emp-results').innerHTML = '';
    const grid = document.getElementById('at-person-grid');
    if (!grid) return;
    grid.innerHTML = `<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-9 w-9 border-4 border-indigo-500 border-t-transparent"></div></div>`;
    try {
        const res = await API.get(`/activity-targets/employee/${empId}`);
        _atEmpTargets = res.data?.targets || [];
        _renderAtPersonGrid(grid);
    } catch (e) {
        grid.innerHTML = `<div class="py-8 text-center text-red-400 text-sm">โหลดไม่ได้: ${e.message}</div>`;
    }
}

function _renderAtPersonGrid(grid) {
    if (!_atSelEmp) { grid.innerHTML = ''; return; }
    const tgtMap = {};
    _atEmpTargets.forEach(t => { tgtMap[t.activityKey] = t; });

    const sourceLabel = s => {
        if (s === 'override')  return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700">รายบุคคล</span>`;
        if (s === 'template')  return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">เทมเพลต</span>`;
        return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">ยังไม่กำหนด</span>`;
    };

    const rows = _atActivities.map(a => {
        const d    = tgtMap[a.key] || {};
        const isNA = d.isNA === 1 || d.isNA === true;
        const dimCls = isNA ? 'opacity-40 pointer-events-none select-none' : '';
        return `
        <tr class="hover:bg-slate-50 transition-colors ${isNA ? 'bg-slate-50/60' : ''}">
            <td class="px-4 py-3">
                <p class="text-sm font-semibold text-slate-800 ${isNA ? 'line-through text-slate-400' : ''}">${a.label}</p>
                <p class="text-xs text-slate-400 mt-0.5">${a.desc}</p>
            </td>
            <td class="px-4 py-3 text-center">
                ${isNA
                    ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-500">N/A</span>`
                    : sourceLabel(d.source || 'none')}
            </td>
            <td class="px-4 py-3 text-center ${dimCls}">
                <input id="per-${a.key}-target" type="number" min="0" value="${isNA ? '' : (d.yearlyTarget ?? '')}"
                    placeholder="${d.source === 'template' && !isNA ? d.yearlyTarget ?? '—' : '0'}"
                    ${isNA ? 'disabled' : ''}
                    class="w-20 px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100">
            </td>
            <td class="px-4 py-3 text-center ${dimCls}">
                <div class="flex items-center gap-1 justify-center">
                    <input id="per-${a.key}-pct" type="number" min="0" max="100" value="${isNA ? '' : (d.passPct ?? 80)}"
                        ${isNA ? 'disabled' : ''}
                        class="w-16 px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100">
                    <span class="text-xs text-slate-400">%</span>
                </div>
            </td>
            <td class="px-4 py-3">
                <div class="flex gap-1.5 justify-center flex-wrap">
                    ${!isNA ? `
                    <button onclick="window._atSaveOverride('${_atSelEmp.EmployeeID}','${a.key}',this)"
                        class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                        บันทึก
                    </button>` : ''}
                    <button onclick="window._atToggleNA('${_atSelEmp.EmployeeID}','${a.key}',${isNA ? 0 : 1},this)"
                        title="${isNA ? 'ยกเลิก N/A — กลับมากำหนดค่า' : 'ตั้งเป็น N/A (ไม่เกี่ยวข้อง)'}"
                        class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${isNA ? 'border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'border-slate-200 text-slate-500 bg-slate-50 hover:bg-slate-100'}">
                        ${isNA ? 'ยกเลิก N/A' : 'N/A'}
                    </button>
                    ${d.source === 'override' && !isNA ? `
                    <button onclick="window._atClearOverride('${_atSelEmp.EmployeeID}','${a.key}',this)"
                        title="ลบ override — คืนค่าเทมเพลตตำแหน่ง"
                        class="px-2 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');

    grid.innerHTML = `
    <div class="ds-table-wrap">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
                <p class="text-sm font-bold text-slate-700">${_atSelEmp.Name || _atSelEmp.EmployeeID}</p>
                <p class="text-xs text-slate-400">${_atSelEmp.EmployeeID}${_atSelEmp.Position ? ' · ' + _atSelEmp.Position : ''}</p>
            </div>
            <p class="text-xs text-slate-400">วัดผลรายปี · override มีลำดับสูงกว่าเทมเพลต</p>
        </div>
        <table class="ds-table text-left">
            <thead class="bg-slate-50 border-b border-slate-100">
                <tr>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">กิจกรรม</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-28">แหล่งที่มา</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-32">เป้าหมาย/ปี</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-32">เกณฑ์ผ่าน</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-32"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">${rows}</tbody>
        </table>
    </div>`;
}

async function _atSaveOverride(empId, actKey, btn) {
    const target = document.getElementById(`per-${actKey}-target`)?.value;
    const pct    = document.getElementById(`per-${actKey}-pct`)?.value;
    if (target === '' || target === null) { alert('กรุณาระบุเป้าหมาย'); return; }
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
    try {
        await API.put(`/activity-targets/employee/${empId}`, { ActivityKey: actKey, YearlyTarget: Number(target), PassPct: Number(pct)||80 });
        // refresh targets for this employee
        const res = await API.get(`/activity-targets/employee/${empId}`);
        _atEmpTargets = res.data?.targets || [];
        const grid = document.getElementById('at-person-grid');
        if (grid) _renderAtPersonGrid(grid);
    } catch (e) {
        btn.disabled = false; btn.textContent = orig;
        alert('บันทึกไม่สำเร็จ: ' + e.message);
    }
}

async function _atClearOverride(empId, actKey, btn) {
    if (!confirm('ลบ override นี้และคืนค่าเทมเพลตตำแหน่ง?')) return;
    btn.disabled = true;
    try {
        await API.put(`/activity-targets/employee/${empId}`, { ActivityKey: actKey, YearlyTarget: null });
        const res = await API.get(`/activity-targets/employee/${empId}`);
        _atEmpTargets = res.data?.targets || [];
        const grid = document.getElementById('at-person-grid');
        if (grid) _renderAtPersonGrid(grid);
    } catch (e) {
        btn.disabled = false;
        alert('ไม่สำเร็จ: ' + e.message);
    }
}

async function _atToggleNA(empId, actKey, setNA, btn) {
    btn.disabled = true;
    try {
        if (setNA) {
            // set N/A — store with IsNA=1, YearlyTarget=0
            await API.put(`/activity-targets/employee/${empId}`, { ActivityKey: actKey, YearlyTarget: 0, PassPct: 0, IsNA: 1 });
        } else {
            // clear N/A — remove override entirely → revert to template
            await API.put(`/activity-targets/employee/${empId}`, { ActivityKey: actKey, YearlyTarget: null });
        }
        const res = await API.get(`/activity-targets/employee/${empId}`);
        _atEmpTargets = res.data?.targets || [];
        const grid = document.getElementById('at-person-grid');
        if (grid) _renderAtPersonGrid(grid);
    } catch (e) {
        btn.disabled = false;
        alert('ไม่สำเร็จ: ' + e.message);
    }
}
