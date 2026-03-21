import { showToast, showError, openModal, closeModal } from '../ui.js';
import { API } from '../api.js';

// ─── Global State ─────────────────────────────────────────────────────────────
let _currentTab   = 'dashboard';
let _calInst      = null;
let _viewMode     = 'list';

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
    { key: 'reference',    label: 'ข้อมูลอ้างอิง',     icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>` },
    { key: 'permissions',  label: 'สิทธิ์การใช้งาน',   icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>` },
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
    else if (key === 'reference')    renderReference(area);
    else if (key === 'permissions')  renderPermissions(area);
    else if (key === 'health')       renderSystemHealth(area);
    else if (key === 'audit')        renderAuditLog(area);
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

          <!-- Filter Bar -->
          <div class="card p-4 flex flex-wrap gap-3 items-center mb-4">
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

          <div class="card overflow-hidden">
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
    _orgRenderTable();
    loadMasterList('teams');
    loadMasterList('positions');
    loadMasterList('roles');
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

    loadMasterList('roles');
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
                <button onclick="window._ptSaveRotation()" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm">
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
            <div class="flex items-center gap-2">
                <button onclick="window._ptAutoFillMembers()" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    Auto-fill สมาชิก
                </button>
                <button onclick="window._ptSaveMemberRotation()" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm">
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
        <div class="card overflow-hidden">
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
            const statusBg  = { Pending:'bg-amber-100 text-amber-700', Completed:'bg-emerald-100 text-emerald-700', Missed:'bg-red-100 text-red-600' };
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
                            const sc    = statusBg[item.Status] || 'bg-slate-100 text-slate-500';
                            const color = item.TeamColor || '#6366f1';
                            const round = roundLabel[item.PatrolRound] || '';
                            return `
                            <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex justify-between items-center gap-2">
                                <div class="flex items-center gap-2 flex-1 min-w-0">
                                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${color}"></span>
                                    <span class="font-semibold text-xs text-slate-700 truncate">${item.TeamName||'-'}</span>
                                    ${item.AreaName ? `<span class="text-[10px] text-slate-400 truncate hidden sm:inline">${item.AreaName}</span>` : ''}
                                </div>
                                <div class="flex items-center gap-1.5 flex-shrink-0">
                                    ${round ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">${round}</span>` : ''}
                                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${sc}">${item.Status||'Pending'}</span>
                                    <button onclick="window.editSchedule(${item.id},'${(item.ScheduledDate||'').split('T')[0]}','${item.TeamName||''}','${item.AreaName||''}',${item.PatrolRound||1})" class="text-slate-300 hover:text-blue-500 p-1 transition-colors" title="แก้ไขวันที่">
                                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                    </button>
                                    <button onclick="deleteSchedule(${item.id})" class="text-slate-300 hover:text-red-500 p-1 transition-colors" title="ลบ">
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
            <button type="button" onclick="window._doEditSchedule(${id})" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </div>`, 'max-w-sm');
};

window._doEditSchedule = async function(id) {
    const dateVal   = document.getElementById('edit-session-date')?.value;
    const statusVal = document.getElementById('edit-session-status')?.value;
    if (!dateVal) { showToast('กรุณาเลือกวันที่', 'error'); return; }
    try {
        await API.put(`/patrol/sessions/${id}`, { PatrolDate: dateVal, Status: statusVal });
        closeModal();
        showToast('แก้ไขเรียบร้อย', 'success');
        loadSchedules();
    } catch (err) { showError(err.message); }
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
                        class="p-1 text-slate-200 hover:text-red-500 flex-shrink-0 transition-colors">
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
    // โหลดพนักงานสำหรับ dropdown
    let empList = [];
    try { const r = await API.get('/employees'); empList = r.data || r || []; } catch { empList = []; }

    openModal(`เพิ่มสมาชิก — ${teamName}`, `
    <form id="pt-member-form" class="space-y-4">
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">พนักงาน <span class="text-red-500">*</span></label>
            <select name="EmployeeID" required class="form-input w-full">
                <option value="">— เลือกพนักงาน —</option>
                ${empList.map(e => `<option value="${e.EmployeeID}">${e.EmployeeName||e.EmployeeID} (${e.Department||''})</option>`).join('')}
            </select>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ประเภท <span class="text-red-500">*</span></label>
            <select name="PatrolType" class="form-input w-full">
                <option value="top">Top Management — เดิน 1 ครั้ง/เดือน</option>
                <option value="committee">คปอ. — เดิน 1 ครั้ง/เดือน</option>
                <option value="management">Management — เดิน 2 ครั้ง/เดือน</option>
            </select>
            <div class="text-xs text-slate-400 mt-1.5 space-y-0.5">
                <p><span class="font-semibold text-rose-500">Top</span>: ผจก.ทั่วไป / ผช.ผจก.ทั่วไป / ผู้อำนวยการ</p>
                <p><span class="font-semibold text-amber-500">คปอ.</span>: คณะกรรมการความปลอดภัย (มี 5 คน ไม่ต้องครบทุกทีม)</p>
                <p><span class="font-semibold text-indigo-500">Management</span>: ผู้จัดการ / ผู้ชำนาญการพิเศษ</p>
            </div>
        </div>
        <div id="pt-mem-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">เพิ่มสมาชิก</button>
        </div>
    </form>`, 'max-w-md');
    setTimeout(() => {
        document.getElementById('pt-member-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await API.post(`/patrol/teams/${teamId}/members`, { EmployeeID: fd.get('EmployeeID'), PatrolType: fd.get('PatrolType') });
                closeModal(); showToast('เพิ่มสมาชิกสำเร็จ', 'success');
                _ptLoadMembers(teamId);
                // refresh member count
                await _ptLoadTeams();
            } catch (err) {
                const el = document.getElementById('pt-mem-err');
                if (el) { el.textContent = err.message; el.classList.remove('hidden'); }
            }
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

        // สร้าง lookup _rotationData[teamId][month] = areaId
        _rotationData = {};
        monthResults.forEach((res, idx) => {
            const month = idx + 1;
            (res.data || []).forEach(r => {
                if (!_rotationData[r.TeamID]) _rotationData[r.TeamID] = {};
                _rotationData[r.TeamID][month] = r.AreaID;
            });
        });

        _ptRenderRotationMatrix(year);
    } catch (err) {
        wrap.innerHTML = `<div class="text-center py-10 text-red-500 text-sm">${err.message}</div>`;
    }
};

function _ptRenderRotationMatrix(year) {
    const wrap = document.getElementById('pt-rotation-wrap');
    if (!wrap || _ptTeams.length === 0) {
        if (wrap) wrap.innerHTML = `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีทีม กรุณาสร้างทีมก่อน</div>`;
        return;
    }

    const areaOptions = _ptAreas.map(a => `<option value="${a.id}">${a.Name}</option>`).join('');

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
                    ${Array.from({length:12},(_,i)=>i+1).map(month => {
                        const areaId = (_rotationData[t.id]||{})[month] || '';
                        return `
                        <td class="px-1.5 py-2">
                            <select data-team="${t.id}" data-month="${month}"
                                class="rotation-cell w-full text-xs border border-slate-200 rounded-lg px-1.5 py-1 outline-none focus:border-emerald-400 bg-white"
                                style="min-width:90px">
                                <option value="">—</option>
                                ${_ptAreas.map(a => `<option value="${a.id}" ${a.id==areaId?'selected':''}>${a.Code||a.Name}</option>`).join('')}
                            </select>
                        </td>`;
                    }).join('')}
                </tr>`).join('')}
            </tbody>
        </table>
    </div>
    <div class="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
        <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        แต่ละเดือน ทีมเดินพื้นที่เดิมทั้ง 2 ครั้ง (2 วันพุธ) · Top Mgmt &amp; คปอ. เดินรอบ 2 เท่านั้น · Management เดินทั้ง 2 รอบ · กด "Auto-fill ทั้งปี" เพื่อ fill อัตโนมัติ
    </div>`;
}

// คืน string วันพุธของเดือน เช่น "4,18" หรือ "11,25"
function _getWednesdays(year, month) {
    const d = new Date(year, month - 1, 1);
    while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
    const weeks = [];
    while (d.getMonth() === month - 1) { weeks.push(d.getDate()); d.setDate(d.getDate() + 7); }
    // A=พุธ1,3 B=พุธ2,4
    return `A:${weeks[0]||''},${weeks[2]||''} B:${weeks[1]||''},${weeks[3]||''}`;
}

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

    openModal('Auto-fill ตารางหมุนเวียนทั้งปี', `
    <div class="space-y-4">
        <div class="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-xs text-violet-700 space-y-1">
            <p class="font-bold">วิธีการหมุนเวียน</p>
            <p>• กำหนดพื้นที่เริ่มต้น (เดือน ม.ค.) ให้แต่ละทีม</p>
            <p>• ระบบเลื่อนพื้นที่ +1 ทุกเดือนอัตโนมัติ (หมุนวน 12 เดือน)</p>
            <p>• 1 ทีม เดิน 2 ครั้ง/เดือน ในพื้นที่เดิมทั้งสองครั้ง</p>
            <p class="pt-1 font-bold">ความถี่ตามตำแหน่ง</p>
            <p>• <span class="font-semibold">Top Management &amp; คปอ.</span> → เดินครั้งเดียว (รอบ 2 เท่านั้น)</p>
            <p>• <span class="font-semibold">Management</span> → เดินทั้ง 2 ครั้ง (รอบ 1 &amp; 2)</p>
        </div>
        <div>
            <p class="text-sm font-semibold text-slate-700 mb-2">พื้นที่เริ่มต้น เดือน ม.ค.</p>
            <div class="border border-slate-200 rounded-xl overflow-hidden">
                ${teamRows}
            </div>
        </div>
        <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="button" onclick="window._ptDoAutoFill()" class="btn px-5 font-bold text-white" style="background:linear-gradient(135deg,#7c3aed,#6366f1)">
                Auto-fill ทั้งปี
            </button>
        </div>
    </div>`, 'max-w-lg');
};

window._ptDoAutoFill = function() {
    const areaIds = _ptAreas.map(a => a.id);
    if (areaIds.length === 0) return;

    // Read starting area per team from modal
    document.querySelectorAll('[data-autofill-team]').forEach(sel => {
        const teamId   = parseInt(sel.dataset.autofillTeam);
        const startId  = parseInt(sel.value);
        const startIdx = areaIds.indexOf(startId);

        for (let month = 1; month <= 12; month++) {
            const areaId = areaIds[(startIdx + month - 1) % areaIds.length];
            const cell = document.querySelector(`.rotation-cell[data-team="${teamId}"][data-month="${month}"]`);
            if (cell) cell.value = areaId;
        }
    });

    closeModal();
    showToast('Auto-fill เรียบร้อย — ตรวจสอบแล้วกด "บันทึก Rotation"', 'success');
};

window._ptSaveRotation = async function() {
    const year = parseInt(document.getElementById('rotation-year')?.value || new Date().getFullYear());
    const cells = document.querySelectorAll('.rotation-cell');
    const items = [];
    cells.forEach(sel => {
        if (!sel.value) return;
        items.push({ TeamID: parseInt(sel.dataset.team), AreaID: parseInt(sel.value), Year: year, Month: parseInt(sel.dataset.month) });
    });
    if (items.length === 0) { showToast('ยังไม่ได้เลือกพื้นที่เลย', 'error'); return; }
    try {
        const res = await API.post('/patrol/rotation', items);
        showToast(`บันทึก Rotation ${res.saved} รายการสำเร็จ`, 'success');
    } catch (err) { showError(err.message); }
};

window._ptGenSessions = function() {
    const year = parseInt(document.getElementById('rotation-year')?.value || new Date().getFullYear());
    const monthOpts = MONTHS_TH_SHORT.map((m,i) => `<option value="${i+1}">${m} ${year}</option>`).join('');
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
        showToast(r.message || 'สร้าง Sessions สำเร็จ', 'success');
        loadSchedules(); // refresh calendar/list
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
        wrap.innerHTML = `<div class="text-center py-10 text-red-500 text-sm">${err.message}</div>`;
    }
}

function _ptRenderMemberMatrix(year) {
    const wrap = document.getElementById('pt-member-rotation-wrap');
    if (!wrap) return;
    if (_memberBase.length === 0) {
        wrap.innerHTML = `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีสมาชิก กรุณาเพิ่มสมาชิกในทีมก่อน</div>`;
        return;
    }

    // Group members by PatrolGroup
    const groupA = _memberBase.filter(m => m.PatrolGroup === 'A');
    const groupB = _memberBase.filter(m => m.PatrolGroup === 'B');

    // Build team options per group
    const teamsA = _ptTeams.filter(t => t.PatrolGroup === 'A');
    const teamsB = _ptTeams.filter(t => t.PatrolGroup === 'B');
    const teamOptsA = teamsA.map(t => `<option value="${t.id}">${t.Name}</option>`).join('');
    const teamOptsB = teamsB.map(t => `<option value="${t.id}">${t.Name}</option>`).join('');

    const typeColor = { top: 'rose', committee: 'amber', management: 'indigo' };
    const typeLabel = { top: 'Top', committee: 'คปอ.', management: 'Mgmt' };

    const renderRows = (members, teamOpts) => members.map(m => {
        const tColor = typeColor[m.PatrolType] || 'slate';
        const tLabel = typeLabel[m.PatrolType] || m.PatrolType;
        const monthCells = Array.from({length:12},(_,i) => i+1).map(month => {
            const selected = (_memberMonthly[m.EmployeeID] || {})[month] || m.TeamID;
            return `<td class="px-1 py-1.5">
                <select data-member="${m.EmployeeID}" data-month="${month}"
                    class="member-rot-cell w-full text-[10px] border border-slate-200 rounded-md px-1 py-0.5 outline-none focus:border-violet-400 bg-white"
                    style="min-width:72px">
                    ${teamOpts.replace(`value="${selected}"`, `value="${selected}" selected`)}
                </select>
            </td>`;
        }).join('');
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-3 py-2 sticky left-0 bg-white z-10 whitespace-nowrap">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${m.Color}"></span>
                    <span class="text-xs font-semibold text-slate-800">${m.EmployeeName||m.EmployeeID}</span>
                </div>
            </td>
            <td class="px-2 py-2 text-center">
                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-${tColor}-100 text-${tColor}-700">${tLabel}</span>
            </td>
            <td class="px-2 py-2 text-center text-[10px] text-slate-400 whitespace-nowrap">${m.TeamName}</td>
            ${monthCells}
        </tr>`;
    }).join('');

    const headerCols = MONTHS_TH_SHORT.map(m => `<th class="px-1 py-3 text-[10px] font-semibold text-slate-500 text-center whitespace-nowrap">${m}</th>`).join('');

    const section = (label, color, members, teamOpts) => members.length === 0 ? '' : `
        <tr class="bg-${color}-50">
            <td colspan="15" class="px-4 py-2 text-[10px] font-bold uppercase text-${color}-600 tracking-wider">กลุ่ม ${label}</td>
        </tr>
        ${renderRows(members, teamOpts)}`;

    wrap.innerHTML = `
    <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse" style="min-width:1100px">
            <thead>
                <tr class="bg-slate-50 border-b-2 border-slate-200">
                    <th class="px-3 py-3 text-xs font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 whitespace-nowrap">สมาชิก</th>
                    <th class="px-2 py-3 text-xs font-semibold text-slate-400 text-center">ประเภท</th>
                    <th class="px-2 py-3 text-xs font-semibold text-slate-400 whitespace-nowrap">ทีมเดิม</th>
                    ${headerCols}
                </tr>
            </thead>
            <tbody>
                ${section('A — พุธที่ 1 & 3', 'blue', groupA, teamOptsA)}
                ${section('B — พุธที่ 2 & 4', 'purple', groupB, teamOptsB)}
            </tbody>
        </table>
    </div>
    <div class="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        กำหนดว่าแต่ละเดือนสมาชิกอยู่ทีมไหน · ค่า default = ทีมเดิม · กลุ่ม A สลับเฉพาะทีม A · กลุ่ม B สลับเฉพาะทีม B
    </div>`;
}

window._ptSaveMemberRotation = async function() {
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
    try {
        const res = await API.post('/patrol/member-rotation', items);
        showToast(`บันทึกการสลับสมาชิก ${res.saved} รายการสำเร็จ`, 'success');
    } catch (err) { showError(err.message); }
};

// Auto-fill: rotate members through teams in same PatrolGroup, +1 team per month
window._ptAutoFillMembers = function() {
    const teamsA = _ptTeams.filter(t => t.PatrolGroup === 'A');
    const teamsB = _ptTeams.filter(t => t.PatrolGroup === 'B');

    if (teamsA.length === 0 && teamsB.length === 0) {
        showToast('ยังไม่มีทีม', 'error'); return;
    }

    _memberBase.forEach(m => {
        const groupTeams = m.PatrolGroup === 'A' ? teamsA : teamsB;
        if (groupTeams.length === 0) return;
        const startIdx = groupTeams.findIndex(t => t.id === m.TeamID);
        const base = startIdx >= 0 ? startIdx : 0;

        for (let month = 1; month <= 12; month++) {
            const teamId = groupTeams[(base + month - 1) % groupTeams.length].id;
            const cell = document.querySelector(`.member-rot-cell[data-member="${m.EmployeeID}"][data-month="${month}"]`);
            if (cell) cell.value = teamId;
        }
    });

    showToast('Auto-fill สมาชิกเรียบร้อย — กด "บันทึก" เพื่อยืนยัน', 'success');
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
        wrap.innerHTML = `<div class="text-center py-10 text-red-500 text-sm">${err.message}</div>`;
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
    } catch { listEl.innerHTML = `<li class="text-center text-red-400 text-xs py-4">โหลดไม่ได้</li>`; }
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

async function loadMasterList(type) {
    if (type === 'positions') return loadPositionsList();
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
