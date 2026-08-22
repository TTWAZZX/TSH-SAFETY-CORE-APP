import { showToast, showError, openModal, openDetailModal, closeModal, escHtml, metricCard, emptyState, statusBadge as dsStatusBadge } from '../ui.js?v=20260602-mobile-nav-m53';
import { API } from '../api.js?v=20260723-onboarding-release';
import { createLatestRenderTarget, guardActionHandler, guardSubmitHandler, sectionSkeleton, withActionLock } from '../utils/async-ui.js?v=20260715-phase32c-residual-async';

// â”€â”€â”€ Button loading helper (disable + spinner, returns original HTML) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
function _adminInlineArg(value) {
    return escHtml(JSON.stringify(String(value ?? '')).replace(/</g, '\\u003c'));
}
const ADMIN_PHASE32C_INLINE_ACTIONS = [
    '_safetyCoreRefresh', '_safetyCoreReloadEmployees', '_safetyCoreRefreshRoster',
    '_orgViewUnits', '_orgDeleteUnit', '_permToggle', 'deleteSchedule', '_doEditSchedule',
    '_ptDeleteTeam', '_ptAddMember', '_ptRemoveMember', '_ptToggleCancel', '_ptLoadRotation',
    '_ptSaveRotation', '_ptDoGenerate', '_ptSaveMemberRotation', '_ptDownloadMonthlyPDF',
    '_ptLoadMemberSchedule', '_saveEmailRequirementRules', '_savePatrolFlexibleSettings',
    'toggleSupervisorPatrol', 'deleteArea', 'addMasterData', 'deleteMasterData',
    '_registrationApprove', '_registrationReject', '_deleteEmployee', '_doImport',
    '_downloadImportTemplate', '_atLoadTemplate', '_atSaveTemplate', '_atBulkApply',
    '_atLoadScope', '_atSaveScope', '_atClearScope', '_atToggleScopeNA', '_atSelectEmp',
    '_atSaveOverride', '_atClearOverride', '_atToggleNA', '_atMatrixExport',
];
function lockAdminInlineActions() {
    ADMIN_PHASE32C_INLINE_ACTIONS.forEach(name => {
        const original = window[name];
        if (typeof original !== 'function' || original.__phase32cLocked) return;
        const guarded = (...args) => {
            const recordKey = args.slice(0, 2)
                .filter(value => ['string', 'number', 'boolean'].includes(typeof value))
                .map(String).join(':') || 'global';
            return withActionLock(`admin:inline:${name}:${recordKey}`, () => original(...args));
        };
        guarded.__phase32cLocked = true;
        window[name] = guarded;
    });
}
// Skeleton rows for list/table areas
function _skelRows(n = 4, cols = 4) {
    return sectionSkeleton({ label: 'กำลังโหลดข้อมูล', rows: Math.max(n, cols) });
}
function _skelSpinner() {
    return sectionSkeleton({ label: 'กำลังโหลดข้อมูล', rows: 4 });
}

// â”€â”€â”€ Global State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _currentTab   = 'dashboard';
let _calInst      = null;
let _viewMode     = 'list';

// Employee tab state
let _empCache     = [];
let _empEmailReadiness = { summary: {}, rows: [], rule: {} };
let _deptCache    = [];
let _posCache     = [];
let _unitCache    = [];
let _empSearch    = '';
let _empDeptFilter = 'all';
let _empUnitFilter = 'all';
let _empSafetyUnitFilter = 'all';
let _empPage      = 1;
let _empEmailReviewSearch = '';
let _empEmailReviewDept = 'all';
let _empEmailReviewPosition = 'all';
let _empEmailReviewStatus = 'all';
const EMP_PER_PAGE = 25;

// Audit log state
let _auditPage         = 1;
let _auditTotal        = 0;
let _auditRows         = [];
let _auditFilterFailed = false;
const AUDIT_LIMIT      = 50;

const DEFAULT_BRANDING = {
    appName: 'TSH Safety Core',
    tagline: 'Activity System',
    loginHeroTitle: '',
    loginHeroSubtitle: '',
    logoUrl: ''
};
let _brandingState = { ...DEFAULT_BRANDING };
let _brandingUpdatedAt = '';

// Organization tab state
let _orgDepts      = [];   // { id, Name, is_safety_core, unit_count }
let _orgUnits      = [];   // { id, name, department_id, short_code }
let _orgSearch     = '';
let _orgFilter     = 'all'; // 'all' | 'safety' | 'general'
let _orgPage       = 1;
let _orgFetchError = false;
const ORG_PER_PAGE = 15;
let _masterQuality = { teams: [], positions: [], roles: [], areas: [] };
let _emailRequirementRule = { positions: [], requiredPositionIds: [], isUsingDefault: false };
let _patrolFlexibleSettings = { monthlyRequirement: 2, isUsingDefault: true };
let _safetyCoreData = { year: new Date().getFullYear(), month: new Date().getMonth() + 1, summary: {}, rows: [] };
let _safetyCoreYear = new Date().getFullYear();
let _adminHealthState = { raw: {}, filter: 'all', moduleHealth: [], signals: [], storageHealth: {}, securityHealth: {}, versionHealth: {} };
let _safetyCoreMonth = new Date().getMonth() + 1;
let _safetyCoreRoster = [];
let _safetyCoreRosterSearch = '';
let _safetyCoreRosterPick = new Set();
let _safetyCoreTablePage = 1;
let _safetyCoreTablePageSize = 10;
let _safetyCoreTableFilters = { department: '', position: '' };
let _registrationAdminState = { rows: [], summary: {}, status: 'Pending', department: '', dateFrom: '', dateTo: '', q: '' };
let _registrationLoadGeneration = 0;

// â”€â”€â”€ Tab Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TABS = [
    { key: 'dashboard',    label: 'ภาพรวม',           icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>` },
    { key: 'scheduler',    label: 'กำหนดการตรวจ',      icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>` },
    { key: 'employees',    label: 'ข้อมูลพนักงาน',     icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>` },
    { key: 'reference',    label: 'ข้อมูลอ้างอิง',     icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>` },
    { key: 'permissions',  label: 'สิทธิ์การใช้งาน',   icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>` },
    { key: 'health',       label: 'สุขภาพระบบ', icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>` },
    { key: 'audit',        label: 'Audit Log',         icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>` },
    { key: 'branding',     label: 'Branding',          icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4l2 2h8a2 2 0 012 2v4M7 21h10a4 4 0 004-4v-1M7 21a4 4 0 004-4v-1m4-4h10m-5-5v10"/></svg>` },
    { key: 'targets',      label: 'เป้าหมายกิจกรรม',   icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>` },
];

TABS.splice(3, 0, {
    key: 'safety-data',
    label: 'Safety Core Data',
    icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-6m4 6V7m4 10v-4M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H7.5L5 5.5V19a2 2 0 002 2z"/></svg>`,
});
TABS.splice(4, 0, {
    key: 'registrations',
    label: 'คำขอสมัคร',
    icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3M13 7a4 4 0 11-8 0 4 4 0 018 0zM3 21v-1a6 6 0 0112 0v1"/></svg>`,
});

// =============================================================================
// ENTRY POINT
// =============================================================================
export async function loadAdminPage() {
    const container = document.getElementById('admin-page');
    if (!container) return;

    // Tab buttons — underline style ใช้ใน tab bar ใต้ hero
    const tabHtml = TABS.map(t => `
        <button id="tab-btn-${t.key}" onclick="window._adminTab('${t.key}')"
            class="admin-console-tab">
            ${t.icon}${t.label}
            ${t.badge ? `<span class="ml-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-400/80 text-white leading-none">${t.badge}</span>` : ''}
        </button>`).join('');

    container.innerHTML = `
    <div class="admin-console-shell animate-fade-in pb-10">

        <!-- â•â•â• HERO HEADER â•â•â• -->
        <div class="admin-console-hero relative overflow-hidden" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <!-- dot pattern -->
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="adm-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#adm-dots)"/></svg>
            </div>
            <div class="relative z-10 w-full px-4 sm:px-6 xl:px-8 pt-6">
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
                <div class="admin-console-tabs mt-5 overflow-x-auto scrollbar-none">
                    ${tabHtml}
                </div>
            </div>
        </div>

        <!-- Content area -->
        <div class="admin-console-content w-full px-4 sm:px-6 xl:px-8 pt-6">
            <div id="admin-content-area" class="relative min-h-[500px]"></div>
        </div>

        <button type="button" id="admin-scroll-top-btn" onclick="window._adminScrollTop()"
            class="admin-scroll-top-btn hidden"
            title="Back to top"
            aria-label="Back to top">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M5 15l7-7 7 7"/>
            </svg>
            <span>Top</span>
        </button>

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
    window._adminScrollTop     = _adminScrollTop;

    _currentTab = window._getTab?.('admin', _currentTab) || _currentTab;
    switchTab(_currentTab);
    _setupAdminScrollTop();
    _loadHeroStats();   // async — fills stats strip without blocking tab render
}

// â”€â”€â”€ Hero Stats Strip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function _adminScrollTop() {
    const main = document.getElementById('main-content');
    main?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
}

function _setupAdminScrollTop() {
    const btn = document.getElementById('admin-scroll-top-btn');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    const main = document.getElementById('main-content');
    const sync = () => {
        const y = Math.max(window.scrollY || 0, main?.scrollTop || 0);
        btn.classList.toggle('hidden', y < 360);
    };
    window.addEventListener('scroll', sync, { passive: true });
    main?.addEventListener('scroll', sync, { passive: true });
    sync();
}

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

async function switchTab(key) {
    _currentTab = key;
    window._saveTab?.('admin', key);
    // Underline-style tab classes — active: white underline + white text; inactive: ghost
    const active   = 'admin-console-tab is-active';
    const inactive = 'admin-console-tab';
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
    const render = createLatestRenderTarget('admin:tab-render', area);
    area.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 text-slate-400">
            <div class="inline-block animate-spin rounded-full h-9 w-9 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <p class="text-sm">กำลังโหลด...</p>
        </div>`;

    const target = render.target;
    let renderTask;
    if      (key === 'dashboard')     renderTask = renderDashboard(target);
    else if (key === 'scheduler')     renderTask = renderScheduler(target);
    else if (key === 'employees')     renderTask = renderEmployeesTab(target);
    else if (key === 'registrations') renderTask = renderRegistrationRequestsTab(target);
    else if (key === 'safety-data')   renderTask = renderSafetyCoreData(target);
    else if (key === 'reference')     renderTask = renderReference(target);
    else if (key === 'permissions')   renderTask = renderPermissions(target);
    else if (key === 'health')        renderTask = renderSystemHealth(target);
    else if (key === 'audit')         renderTask = renderAuditLog(target);
    else if (key === 'branding')      renderTask = renderBranding(target);
    else if (key === 'targets')       renderTask = renderActivityTargets(target);
    lockAdminInlineActions();
    await renderTask;
    if (render.isCurrent()) lockAdminInlineActions();
}

async function renderSafetyCoreData(container) {
    const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)
        .map(year => `<option value="${year}" ${year === _safetyCoreYear ? 'selected' : ''}>${year}</option>`)
        .join('');
    const monthOptions = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        .map((label, index) => `<option value="${index + 1}" ${index + 1 === _safetyCoreMonth ? 'selected' : ''}>${label}</option>`)
        .join('');

    container.innerHTML = `
    <div class="animate-fade-in space-y-5">
        <section class="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div class="p-4 border-b border-slate-100 flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
                <div>
                    <p class="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Safety Core Data</p>
                    <h3 class="mt-1 text-sm font-bold text-slate-800">Employee safety export</h3>
                    <p class="mt-1 text-xs text-slate-500">Export one Excel sheet for downstream Google Sheet / LINE Bot work.</p>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-[130px_130px_auto_auto] gap-2 w-full xl:w-auto">
                    <select id="safety-core-year" class="form-input rounded-lg text-sm border-slate-200">${yearOptions}</select>
                    <select id="safety-core-month" class="form-input rounded-lg text-sm border-slate-200">${monthOptions}</select>
                    <button type="button" onclick="window._safetyCoreRefresh()"
                        class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50">
                        Refresh
                    </button>
                    <button type="button" onclick="window._exportSafetyCoreDataExcel()"
                        class="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">
                        Export Excel
                    </button>
                </div>
            </div>
            <div class="p-4 border-b border-slate-100 bg-white">
                <div class="grid grid-cols-1 xl:grid-cols-[minmax(320px,420px)_1fr] gap-4 xl:items-start">
                    <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <div>
                            <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400">Export Roster</p>
                            <h4 class="mt-1 text-sm font-bold text-slate-800">Add from Employee Master</h4>
                            <p class="mt-1 text-xs text-slate-500">Only selected employees will be included in this Excel export.</p>
                        </div>
                        <div class="mt-3 flex gap-2">
                            <input type="text" id="safety-core-roster-search"
                                class="form-input rounded-lg text-sm border-slate-200 flex-1"
                                placeholder="Search ID, name, department..."
                                oninput="window._safetyCoreRosterSearch(this.value)">
                            <button type="button" onclick="window._safetyCoreReloadEmployees()"
                                class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50">
                                Reload
                            </button>
                        </div>
                        <div class="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/70 p-3">
                            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                                <div>
                                    <p class="text-xs font-bold text-emerald-800">Paste Employee IDs</p>
                                    <p class="mt-0.5 text-[11px] text-emerald-700">Supports comma, space, or new line: 012611, SP-1234, AP-1234</p>
                                </div>
                                <button type="button" id="safety-core-add-batch-btn" onclick="window._safetyCoreAddRosterBatch()"
                                    class="shrink-0 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">
                                    Add IDs
                                </button>
                            </div>
                            <textarea id="safety-core-roster-paste" rows="4"
                                class="mt-3 form-input rounded-lg text-sm border-emerald-100 w-full resize-y"
                                oninput="window._safetyCoreUpdateRosterPickCount()"
                                placeholder="Example:\n012611\nSP-1234\nAP-1234"></textarea>
                        </div>
                        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <span id="safety-core-roster-pick-count" class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600">0 selected</span>
                            <div class="flex gap-2">
                                <button type="button" onclick="window._safetyCoreClearRosterPick()"
                                    class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50">
                                    Clear
                                </button>
                                <button type="button" id="safety-core-add-selected-btn" onclick="window._safetyCoreAddRosterBatch()"
                                    class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">
                                    Add Selected
                                </button>
                            </div>
                        </div>
                        <div id="safety-core-roster-results" class="mt-3 max-h-[360px] overflow-y-auto space-y-2"></div>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                        <div class="px-4 py-3 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                            <div>
                                <p class="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Selected for Export</p>
                                <p class="text-xs text-slate-500">Use Up/Down to control Excel row order.</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <span id="safety-core-roster-total" class="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black">0 rows</span>
                                <button type="button" onclick="window._safetyCoreRefreshRoster()"
                                    class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50">
                                    Refresh roster
                                </button>
                            </div>
                        </div>
                        <div id="safety-core-roster-wrap" class="max-h-[640px] overflow-y-auto">
                            <div class="py-12 text-center text-slate-400 text-sm">Loading roster...</div>
                        </div>
                        <div id="safety-core-roster-footer" class="px-4 py-2.5 border-t border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                            Selected rows will be exported in the order shown above.
                        </div>
                    </div>
                </div>
            </div>
            <div id="safety-core-summary" class="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-slate-50/70"></div>
            <div class="ds-table-wrap border-0 rounded-none">
                <div id="safety-core-table-wrap">
                    <div class="py-16 text-center text-slate-400 text-sm">Loading...</div>
                </div>
            </div>
        </section>
    </div>`;

    window._safetyCoreRefresh = async () => {
        _safetyCoreYear = Number(document.getElementById('safety-core-year')?.value || _safetyCoreYear);
        _safetyCoreMonth = Number(document.getElementById('safety-core-month')?.value || _safetyCoreMonth);
        await _loadSafetyCoreData();
    };
    window._exportSafetyCoreDataExcel = _exportSafetyCoreDataExcel;
    window._safetyCoreRosterSearch = (value) => {
        _safetyCoreRosterSearch = String(value || '').toLowerCase();
        _renderSafetyCoreRosterSearch();
    };
    window._safetyCoreReloadEmployees = async () => {
        _empCache = [];
        await _loadSafetyCoreEmployeeMaster();
        _renderSafetyCoreRosterSearch();
    };
    window._safetyCoreRefreshRoster = async () => {
        await _loadSafetyCoreRoster();
        _renderSafetyCoreRosterSearch();
        await _loadSafetyCoreData();
    };
    window._safetyCoreToggleRosterPick = _safetyCoreToggleRosterPick;
    window._safetyCoreClearRosterPick = _safetyCoreClearRosterPick;
    window._safetyCoreUpdateRosterPickCount = _renderSafetyCoreRosterPickCount;
    window._safetyCoreAddRosterBatch = _safetyCoreAddRosterBatch;
    window._safetyCoreAddRoster = _safetyCoreAddRoster;
    window._safetyCoreRemoveRoster = _safetyCoreRemoveRoster;
    window._safetyCoreMoveRoster = _safetyCoreMoveRoster;
    window._safetyCoreSetTableFilter = _safetyCoreSetTableFilter;
    window._safetyCoreSetTablePage = _safetyCoreSetTablePage;
    window._safetyCoreSetTablePageSize = _safetyCoreSetTablePageSize;

    await Promise.all([
        _loadSafetyCoreRoster(),
        _loadSafetyCoreEmployeeMaster(),
    ]);
    _renderSafetyCoreRosterSearch();
    await _loadSafetyCoreData();
}

async function _loadSafetyCoreRoster() {
    const wrap = document.getElementById('safety-core-roster-wrap');
    if (wrap) wrap.innerHTML = `<div class="py-12 text-center text-slate-400 text-sm">Loading roster...</div>`;
    try {
        const res = await API.get('/admin/safety-core-export-roster');
        _safetyCoreRoster = res?.data || [];
        _renderSafetyCoreRoster();
    } catch (err) {
        if (wrap) wrap.innerHTML = `<div class="py-12 text-center text-rose-500 text-sm">${escHtml(err.message || 'Cannot load export roster')}</div>`;
    }
}

async function _loadSafetyCoreEmployeeMaster() {
    if (_empCache.length) return;
    const res = await API.get('/employees').catch(() => ({ data: [] }));
    _empCache = res?.data || [];
}

function _renderSafetyCoreRosterSearch() {
    const el = document.getElementById('safety-core-roster-results');
    if (!el) return;
    const q = _safetyCoreRosterSearch;
    const selected = new Set(_safetyCoreRoster.map(row => String(row.EmployeeID || '')));
    _safetyCoreRosterPick = new Set([..._safetyCoreRosterPick].filter(id => !selected.has(id)));
    const rows = _empCache
        .filter(emp => {
            if (!q) return true;
            const haystack = [
                emp.EmployeeID,
                emp.EmployeeName,
                emp.Department,
                emp.Position,
            ].join(' ').toLowerCase();
            return haystack.includes(q);
        })
        .slice(0, 30);
    if (!rows.length) {
        el.innerHTML = `<div class="py-8 text-center text-slate-400 text-xs">No matching employees</div>`;
        _renderSafetyCoreRosterPickCount();
        return;
    }
    el.innerHTML = rows.map(emp => {
        const employeeId = String(emp.EmployeeID || '');
        const isSelected = selected.has(employeeId);
        return `
            <div class="rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between gap-3">
                <label class="min-w-0 flex flex-1 items-start gap-3 cursor-pointer">
                    <input type="checkbox" class="mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        ${isSelected ? 'disabled' : ''}
                        ${_safetyCoreRosterPick.has(employeeId) ? 'checked' : ''}
                        onchange="window._safetyCoreToggleRosterPick('${encodeURIComponent(employeeId)}', this.checked)">
                    <span class="min-w-0">
                        <span class="block text-xs font-mono text-slate-400">${escHtml(employeeId)}</span>
                        <span class="block mt-0.5 text-sm font-bold text-slate-800 truncate">${escHtml(emp.EmployeeName || employeeId)}</span>
                        <span class="block mt-0.5 text-[11px] text-slate-500 truncate">${escHtml(emp.Department || 'N/A')} / ${escHtml(emp.Position || 'N/A')}</span>
                    </span>
                </label>
                <button type="button" ${isSelected ? 'disabled' : `onclick="window._safetyCoreAddRoster('${encodeURIComponent(employeeId)}')"`}
                    class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold ${isSelected ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}">
                    ${isSelected ? 'Added' : 'Add'}
                </button>
            </div>`;
    }).join('');
    _renderSafetyCoreRosterPickCount();
}

function _parseSafetyCoreRosterIds(value) {
    return [...new Set(String(value || '')
        .split(/[\s,;]+/)
        .map(id => id.trim())
        .filter(Boolean))];
}

function _renderSafetyCoreRosterPickCount() {
    const countEl = document.getElementById('safety-core-roster-pick-count');
    const addSelectedBtn = document.getElementById('safety-core-add-selected-btn');
    if (countEl) countEl.textContent = `${_safetyCoreRosterPick.size} selected`;
    if (addSelectedBtn) addSelectedBtn.disabled = _safetyCoreRosterPick.size === 0 && !document.getElementById('safety-core-roster-paste')?.value?.trim();
}

function _safetyCoreToggleRosterPick(encodedEmployeeId, checked) {
    const employeeId = decodeURIComponent(String(encodedEmployeeId || ''));
    if (!employeeId) return;
    if (checked) _safetyCoreRosterPick.add(employeeId);
    else _safetyCoreRosterPick.delete(employeeId);
    _renderSafetyCoreRosterPickCount();
}

function _safetyCoreClearRosterPick() {
    _safetyCoreRosterPick = new Set();
    const paste = document.getElementById('safety-core-roster-paste');
    if (paste) paste.value = '';
    _renderSafetyCoreRosterSearch();
    _renderSafetyCoreRosterPickCount();
}

function _renderSafetyCoreRoster() {
    const wrap = document.getElementById('safety-core-roster-wrap');
    const totalEl = document.getElementById('safety-core-roster-total');
    const footerEl = document.getElementById('safety-core-roster-footer');
    if (!wrap) return;
    const rows = _safetyCoreRoster || [];
    if (totalEl) totalEl.textContent = `${rows.length.toLocaleString()} rows`;
    if (footerEl) footerEl.textContent = rows.length
        ? `${rows.length.toLocaleString()} selected employee${rows.length === 1 ? '' : 's'} will be included in the Excel export.`
        : 'Selected rows will be exported in the order shown above.';
    if (!rows.length) {
        wrap.innerHTML = `
            <div class="py-12 text-center text-slate-400 text-sm">
                <p class="font-semibold text-slate-500">No export roster yet</p>
                <p class="mt-1 text-xs">Add employees from Employee Master before exporting Excel.</p>
            </div>`;
        return;
    }
    wrap.innerHTML = `
        <table class="ds-table min-w-[780px] text-sm">
            <thead>
                <tr class="bg-slate-50 border-b border-slate-200 text-left">
                    <th class="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase w-16">Order</th>
                    <th class="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase">Employee</th>
                    <th class="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase">Department</th>
                    <th class="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase">Position</th>
                    <th class="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase text-right w-44">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                ${rows.map((row, index) => `
                    <tr class="hover:bg-slate-50">
                        <td class="px-3 py-2 text-xs font-bold text-slate-500">${index + 1}</td>
                        <td class="px-3 py-2">
                            <p class="text-xs font-mono text-slate-400">${escHtml(row.EmployeeID || '')}</p>
                            <p class="text-sm font-bold text-slate-800">${escHtml(row.EmployeeName || row.EmployeeID || '')}</p>
                        </td>
                        <td class="px-3 py-2 text-xs text-slate-600 leading-snug">${escHtml(row.Department || 'N/A')}</td>
                        <td class="px-3 py-2 text-xs text-slate-600 leading-snug">${escHtml(row.Position || 'N/A')}</td>
                        <td class="px-3 py-2">
                            <div class="flex flex-wrap justify-end gap-1.5">
                                <button type="button" ${index === 0 ? 'disabled' : `onclick="window._safetyCoreMoveRoster(${index}, -1)"`}
                                    class="px-2 py-1 rounded border border-slate-200 text-[11px] font-bold ${index === 0 ? 'text-slate-300 bg-slate-50 cursor-not-allowed' : 'text-slate-600 bg-white hover:bg-slate-50'}">Up</button>
                                <button type="button" ${index === rows.length - 1 ? 'disabled' : `onclick="window._safetyCoreMoveRoster(${index}, 1)"`}
                                    class="px-2 py-1 rounded border border-slate-200 text-[11px] font-bold ${index === rows.length - 1 ? 'text-slate-300 bg-slate-50 cursor-not-allowed' : 'text-slate-600 bg-white hover:bg-slate-50'}">Down</button>
                                <button type="button" onclick="window._safetyCoreRemoveRoster(${Number(row.RosterID || 0)})"
                                    class="px-2 py-1 rounded border border-rose-200 bg-white text-[11px] font-bold text-rose-600 hover:bg-rose-50">Remove</button>
                            </div>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
}

async function _safetyCoreAddRoster(encodedEmployeeId) {
    const employeeId = decodeURIComponent(String(encodedEmployeeId || ''));
    if (!employeeId) return;
    await _safetyCoreAddRosterIds([employeeId]);
}

async function _safetyCoreAddRosterBatch() {
    const paste = document.getElementById('safety-core-roster-paste');
    const ids = [..._safetyCoreRosterPick, ..._parseSafetyCoreRosterIds(paste?.value || '')];
    await _safetyCoreAddRosterIds(ids);
}

async function _safetyCoreAddRosterIds(ids) {
    const employeeIds = [...new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean))];
    if (!employeeIds.length) {
        showError('Select or paste at least one EmployeeID.');
        return;
    }
    try {
        const res = await API.post('/admin/safety-core-export-roster', {
            EmployeeID: employeeIds[0],
            EmployeeIDs: employeeIds,
        });
        _safetyCoreRoster = res?.data || [];
        const rosterIds = new Set(_safetyCoreRoster.map(row => String(row.EmployeeID || '')));
        _safetyCoreRosterPick = new Set([..._safetyCoreRosterPick].filter(id => !rosterIds.has(id)));
        const paste = document.getElementById('safety-core-roster-paste');
        if (paste) paste.value = '';
        _renderSafetyCoreRoster();
        _renderSafetyCoreRosterSearch();
        await _loadSafetyCoreData();
        showToast(res?.message || 'Employee added to export roster.', 'success');
    } catch (err) {
        showError(err.message || 'Cannot add employee to export roster');
    }
}

async function _safetyCoreRemoveRoster(id) {
    if (!id || !confirm('Remove this employee from the Safety Core export roster?')) return;
    try {
        const res = await API.delete(`/admin/safety-core-export-roster/${id}`);
        _safetyCoreRoster = res?.data || [];
        _renderSafetyCoreRoster();
        _renderSafetyCoreRosterSearch();
        await _loadSafetyCoreData();
        showToast(res?.message || 'Employee removed from export roster.', 'success');
    } catch (err) {
        showError(err.message || 'Cannot remove employee from export roster');
    }
}

async function _safetyCoreMoveRoster(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= _safetyCoreRoster.length) return;
    const nextRows = [..._safetyCoreRoster];
    const [moved] = nextRows.splice(index, 1);
    nextRows.splice(nextIndex, 0, moved);
    const items = nextRows.map((row, idx) => ({ id: Number(row.RosterID || row.id), SortOrder: (idx + 1) * 10 }));
    try {
        const res = await API.put('/admin/safety-core-export-roster/reorder', { items });
        _safetyCoreRoster = res?.data || nextRows;
        _renderSafetyCoreRoster();
        _renderSafetyCoreRosterSearch();
        await _loadSafetyCoreData();
    } catch (err) {
        showError(err.message || 'Cannot update export roster order');
    }
}

async function _loadSafetyCoreData() {
    const wrap = document.getElementById('safety-core-table-wrap');
    const summaryEl = document.getElementById('safety-core-summary');
    if (wrap) wrap.innerHTML = `<div class="py-16 text-center text-slate-400 text-sm">Loading...</div>`;
    if (summaryEl) summaryEl.innerHTML = [1, 2, 3, 4].map(() => `<div class="h-20 rounded-xl bg-white border border-slate-100 animate-pulse"></div>`).join('');

    try {
        const res = await API.get(`/admin/safety-core-data?year=${_safetyCoreYear}&month=${_safetyCoreMonth}`);
        _safetyCoreData = res.data || { year: _safetyCoreYear, month: _safetyCoreMonth, summary: {}, rows: [] };
        _renderSafetyCoreData();
    } catch (err) {
        if (summaryEl) summaryEl.innerHTML = '';
        if (wrap) wrap.innerHTML = `<div class="py-16 text-center text-rose-500 text-sm">${escHtml(err.message || 'Cannot load Safety Core Data')}</div>`;
    }
}

function _renderSafetyCoreData() {
    const wrap = document.getElementById('safety-core-table-wrap');
    const summaryEl = document.getElementById('safety-core-summary');
    const rows = _safetyCoreData.rows || [];
    const summary = _safetyCoreData.summary || {};
    if (summaryEl) {
        summaryEl.innerHTML = [
            ['Employees', summary.employees ?? rows.length],
            ['Patrol scoped', summary.patrolScoped ?? 0],
            ['Hiyari scoped', summary.hiyariScoped ?? 0],
            ['CCCF Permanent', summary.cccfPermanentScoped ?? 0],
        ].map(([label, value]) => metricCard(label, Number(value || 0).toLocaleString(), `FY ${_safetyCoreData.year || _safetyCoreYear}`)).join('');
    }
    if (!wrap) return;
    if (!rows.length) {
        wrap.innerHTML = `<div class="py-16 text-center text-slate-400 text-sm">No export rows. Add employees to the roster first.</div>`;
        return;
    }
    const filtered = _safetyCoreFilteredRows();
    const totalPages = _safetyCoreTablePageSize === 'all' ? 1 : Math.max(1, Math.ceil(filtered.length / _safetyCoreTablePageSize));
    if (_safetyCoreTablePage > totalPages) _safetyCoreTablePage = totalPages;
    const start = _safetyCoreTablePageSize === 'all' ? 0 : (_safetyCoreTablePage - 1) * _safetyCoreTablePageSize;
    const pageRows = _safetyCoreTablePageSize === 'all' ? filtered : filtered.slice(start, start + _safetyCoreTablePageSize);
    const from = filtered.length ? start + 1 : 0;
    const to = _safetyCoreTablePageSize === 'all' ? filtered.length : Math.min(start + pageRows.length, filtered.length);
    wrap.innerHTML = `
    <div class="px-4 py-3 border-b border-slate-100 bg-white">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
            <select onchange="window._safetyCoreSetTableFilter('department',this.value)" class="form-input text-xs rounded-lg border-slate-200">
                ${_safetyCoreFilterOptions('department', 'ทุกฝ่าย / All departments')}
            </select>
            <select onchange="window._safetyCoreSetTableFilter('position',this.value)" class="form-input text-xs rounded-lg border-slate-200">
                ${_safetyCoreFilterOptions('position', 'ทุกตำแหน่ง / All positions')}
            </select>
            <select onchange="window._safetyCoreSetTablePageSize(this.value)" class="form-input text-xs rounded-lg border-slate-200">
                ${[10, 20, 50].map(n => `<option value="${n}" ${_safetyCoreTablePageSize === n ? 'selected' : ''}>แสดง ${n} แถว</option>`).join('')}
                <option value="all" ${_safetyCoreTablePageSize === 'all' ? 'selected' : ''}>แสดงทั้งหมด</option>
            </select>
            <div class="flex items-center justify-end text-xs font-bold text-slate-500">
                ${from.toLocaleString()}-${to.toLocaleString()} / ${filtered.length.toLocaleString()} แถว
            </div>
        </div>
    </div>
    <table class="ds-table min-w-[1320px] text-sm">
        <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-left">
                ${_safetyCoreExcelHeaders().map(h => `<th class="px-3 py-3 text-[11px] font-bold text-slate-500 uppercase">${escHtml(h)}</th>`).join('')}
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
            ${pageRows.length ? pageRows.map((row, index) => `
                <tr class="${index % 2 ? 'bg-slate-50/45' : 'bg-white'} hover:bg-emerald-50/45 transition-colors">
                    <td class="px-3 py-2 font-mono text-xs text-slate-500">${escHtml(row.EmployeeID || '')}</td>
                    <td class="px-3 py-2 font-semibold text-slate-800">${escHtml(row.EmployeeName || '')}</td>
                    <td class="px-3 py-2 text-xs text-slate-600">${escHtml(row.Department || '')}</td>
                    <td class="px-3 py-2 text-xs text-slate-600">${escHtml(row.Position || '')}</td>
                    <td class="px-3 py-2">${_safetyCoreMetricBadge(row.SafetyPatrolRecord || 'N/A')}</td>
                    <td class="px-3 py-2">${_safetyCoreMetricBadge(row.HiyariHatto || 'N/A')}</td>
                    <td class="px-3 py-2">${_safetyCoreMetricBadge(row.KYAbility || 'N/A')}</td>
                    <td class="px-3 py-2">${_safetyCoreMetricBadge(row.CCCFPermanent || 'N/A')}</td>
                    <td class="px-3 py-2">${_safetyCoreMetricBadge(row.CCCFFormA || 'N/A')}</td>
                    <td class="px-3 py-2">${_safetyCoreMetricBadge(row.PatrolSystem || 'N/A')}</td>
                    <td class="px-3 py-2">${_safetyCoreStatusBadge(row.Status || '')}</td>
                </tr>`).join('') : `<tr><td colspan="11" class="px-4 py-12 text-center text-sm text-slate-400">ไม่พบข้อมูลตามตัวกรอง</td></tr>`}
        </tbody>
    </table>
    ${_safetyCorePagerHtml(totalPages, filtered.length, from, to)}`;
}

function _safetyCoreFilterOptions(field, label) {
    const prop = field === 'position' ? 'Position' : 'Department';
    const selected = _safetyCoreTableFilters[field] || '';
    const values = [...new Set((_safetyCoreData.rows || []).map(row => String(row[prop] || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'th'));
    return `<option value="" ${!selected ? 'selected' : ''}>${label}</option>${values.map(v => `<option value="${escHtml(v)}" ${selected === v ? 'selected' : ''}>${escHtml(v)}</option>`).join('')}`;
}

function _safetyCoreFilteredRows() {
    const f = _safetyCoreTableFilters;
    return (_safetyCoreData.rows || []).filter(row =>
        (!f.department || row.Department === f.department) &&
        (!f.position || row.Position === f.position)
    );
}

function _safetyCoreSetTableFilter(key, value) {
    _safetyCoreTableFilters[key] = value;
    _safetyCoreTablePage = 1;
    _renderSafetyCoreData();
}

function _safetyCoreSetTablePage(page) {
    _safetyCoreTablePage = Math.max(1, Number(page || 1));
    _renderSafetyCoreData();
}

function _safetyCoreSetTablePageSize(value) {
    _safetyCoreTablePageSize = value === 'all' ? 'all' : Number(value || 10);
    _safetyCoreTablePage = 1;
    _renderSafetyCoreData();
}

function _safetyCorePagerHtml(totalPages, totalRows, from, to) {
    if (_safetyCoreTablePageSize === 'all') {
        return `<div class="px-4 py-3 border-t border-slate-100 text-xs text-slate-400">แสดงทั้งหมด ${totalRows.toLocaleString()} แถว</div>`;
    }
    return `
    <div class="px-4 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white">
        <div class="text-xs text-slate-400">แสดง ${from.toLocaleString()}-${to.toLocaleString()} จาก ${totalRows.toLocaleString()} แถว</div>
        <div class="flex items-center justify-end gap-2">
            <button type="button" onclick="window._safetyCoreSetTablePage(${_safetyCoreTablePage - 1})" ${_safetyCoreTablePage <= 1 ? 'disabled' : ''}
                class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold ${_safetyCoreTablePage <= 1 ? 'bg-slate-50 text-slate-300 cursor-not-allowed' : 'bg-white text-slate-600 hover:bg-slate-50'}">ก่อนหน้า</button>
            <span class="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black">${_safetyCoreTablePage} / ${totalPages}</span>
            <button type="button" onclick="window._safetyCoreSetTablePage(${_safetyCoreTablePage + 1})" ${_safetyCoreTablePage >= totalPages ? 'disabled' : ''}
                class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold ${_safetyCoreTablePage >= totalPages ? 'bg-slate-50 text-slate-300 cursor-not-allowed' : 'bg-white text-slate-600 hover:bg-slate-50'}">ถัดไป</button>
        </div>
    </div>`;
}

function _safetyCoreValueBadge(value) {
    const text = String(value || 'N/A');
    const isNA = text.toUpperCase() === 'N/A' || text === '-';
    const hasDone = /done|complete|pass|yes|ผ่าน|สำเร็จ|[1-9]/i.test(text) && !/0\s*\/|0\s*%|not|fail/i.test(text);
    const cls = isNA
        ? 'bg-slate-100 text-slate-400'
        : hasDone
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-amber-50 text-amber-700 border-amber-100';
    return `<span class="inline-flex min-w-16 justify-center px-2 py-1 rounded-lg border text-[11px] font-bold ${cls}">${escHtml(text)}</span>`;
}

function _safetyCoreMetricBadge(value) {
    const text = String(value || 'N/A');
    const normalized = text.trim();
    const isNA = normalized.toUpperCase() === 'N/A' || normalized === '-';
    const isNoIssue = /^no\s+issue$/i.test(normalized) || /ไม่มีประเด็น|ไม่มีปัญหา/i.test(normalized);
    const ratio = normalized.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
    const pctMatch = !ratio ? normalized.match(/(-?\d+(?:\.\d+)?)\s*%/) : null;
    let tone = 'watch';

    if (isNA) {
        tone = 'na';
    } else if (isNoIssue) {
        tone = 'pass';
    } else if (ratio) {
        const done = Number(ratio[1] || 0);
        const target = Number(ratio[2] || 0);
        const pct = target > 0 ? (done * 100 / target) : 0;
        tone = target <= 0 ? 'na' : pct >= 80 ? 'pass' : pct >= 60 ? 'watch' : 'below';
    } else if (pctMatch) {
        const pct = Number(pctMatch[1] || 0);
        tone = pct >= 80 ? 'pass' : pct >= 60 ? 'watch' : 'below';
    } else if (/done|complete|pass|yes|ผ่าน|สำเร็จ/i.test(normalized)) {
        tone = 'pass';
    } else if (/not|fail|below|no|ไม่ผ่าน/i.test(normalized)) {
        tone = 'below';
    }

    const cls = {
        na: 'bg-slate-100 text-slate-400 border-slate-200',
        pass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        watch: 'bg-amber-50 text-amber-700 border-amber-100',
        below: 'bg-rose-50 text-rose-700 border-rose-100',
    }[tone] || 'bg-slate-100 text-slate-400 border-slate-200';

    return `<span class="inline-flex min-w-16 justify-center px-2 py-1 rounded-lg border text-[11px] font-bold ${cls}">${escHtml(text)}</span>`;
}

function _safetyCoreStatusBadge(value) {
    const text = String(value || '-');
    const isOk = /active|ok|ready|pass|ผ่าน|พร้อม/i.test(text);
    const cls = isOk ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200';
    return `<span class="inline-flex px-2 py-1 rounded-lg border text-[11px] font-bold ${cls}">${escHtml(text)}</span>`;
}

function _safetyCoreExcelHeaders() {
    const cccfWorkerLabel = _safetyCoreData.cccfWorkerSource === 'actual_department_worker'
        ? 'CCCF Form A Worker (Actual)'
        : 'CCCF Form A Worker (Manual)';
    return ['รหัส', 'ชื่อ-สกุล', 'ฝ่าย', 'ตำแหน่ง', 'Safety Patrol Record', 'Hiyari Hatto', 'KY ability', 'CCCF Permanent', cccfWorkerLabel, 'Patrol System', 'Status'];
}

function _safetyCoreExcelRow(row) {
    return [
        String(row.EmployeeID || ''),
        row.EmployeeName || '',
        row.Department || '',
        row.Position || '',
        row.SafetyPatrolRecord || 'N/A',
        row.HiyariHatto || 'N/A',
        row.KYAbility || 'N/A',
        row.CCCFPermanent || 'N/A',
        row.CCCFFormA || 'N/A',
        row.PatrolSystem || 'N/A',
        row.Status || '',
    ];
}

function _exportSafetyCoreDataExcel() {
    if (!window.XLSX) {
        showError('ไม่พบ SheetJS library');
        return;
    }
    const rows = _safetyCoreData.rows || [];
    if (!rows.length) {
        showToast('No export rows. Add employees to the roster first.', 'warning');
        return;
    }
    const headers = _safetyCoreExcelHeaders();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows.map(_safetyCoreExcelRow)]);
    ws['!cols'] = [
        { wch: 12 }, { wch: 28 }, { wch: 34 }, { wch: 28 }, { wch: 20 },
        { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
    ];
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    for (let r = 1; r <= rows.length; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
        if (cell) cell.t = 's';
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'employees');
    const year = _safetyCoreData.year || _safetyCoreYear;
    const status = _safetyCoreData.statusLabel || '';
    XLSX.writeFile(wb, `Safety_Core_Data_${year}_${status}.xlsx`);
    showToast(`Exported ${rows.length.toLocaleString()} rows`, 'success');
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
    <div class="animate-fade-in space-y-5">

        <!-- ─── Section 1: แผนก / หน่วยงาน ─── -->
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">แผนก / หน่วยงาน</p>

          <!-- Stats skeleton -->
          <div id="org-stats-row" class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              ${[1,2,3,4].map(() => `
              <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm animate-pulse">
                  <div class="h-8 bg-slate-100 rounded-lg w-12 mb-2"></div>
                  <div class="h-3 bg-slate-100 rounded w-20"></div>
              </div>`).join('')}
          </div>
          <div id="master-quality-row" class="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-3 mb-4">
              ${[1,2,3,4,5].map(() => `
              <div class="rounded-xl border border-slate-100 bg-white px-4 py-3 animate-pulse">
                  <div class="h-3 bg-slate-100 rounded w-20 mb-2"></div>
                  <div class="h-4 bg-slate-100 rounded w-14"></div>
              </div>`).join('')}
          </div>

          <!-- Filter Bar -->
          <div class="ds-filter-bar flex flex-col xl:flex-row gap-3 items-stretch xl:items-center mb-4">
              <div class="relative flex-1 min-w-[220px]">
                  <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
                  </svg>
                  <input id="org-search" type="text" placeholder="ค้นหาชื่อแผนก..."
                      value="${_orgSearch}"
                      class="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      oninput="window._orgFilter()">
              </div>
              <div class="flex bg-slate-100 p-1 rounded-lg gap-0.5 flex-shrink-0 overflow-x-auto scrollbar-none">
                  ${[{ v:'all', label:'ทั้งหมด' }, { v:'safety', label:'Safety Core' }, { v:'general', label:'หน่วยงานทั่วไป' }].map(o => `
                  <button onclick="window._orgSetFilter('${o.v}')" id="org-type-${o.v}"
                      class="px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${_orgFilter === o.v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}">
                      ${o.label}
                  </button>`).join('')}
              </div>
              <span id="org-clear-wrap" class="${_orgSearch || _orgFilter !== 'all' ? '' : 'hidden'}">
                  <button onclick="window._orgClearFilter()" class="text-xs text-slate-500 underline hover:text-slate-700">ล้างตัวกรอง</button>
              </span>
              <span id="org-count" class="text-xs text-slate-400 xl:ml-auto self-center"></span>
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

        <!-- â”€â”€â”€ Section 2: Teams / Positions / Roles â”€â”€â”€ -->
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">ข้อมูลอ้างอิง (Teams · Positions · Roles)</p>
          <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
            ${refTypes.map(rt => `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col" style="max-height:480px">
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

        <!-- Email Requirement Rule -->
        <div id="email-requirement-rules" class="bg-white rounded-xl border border-emerald-100 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white">
                <p class="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Email Requirement Rules</p>
                <div class="mt-1 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-2">
                    <div>
                        <h3 class="font-bold text-slate-800 text-sm">ตำแหน่งที่ควรมี Company Email</h3>
                        <p class="text-xs text-slate-500 mt-1">ใช้เป็นกติกากลางสำหรับ Email Readiness และการติดตามงานของ KY ในขั้นถัดไป โดยยังไม่บังคับตอนเพิ่มพนักงาน</p>
                    </div>
                    <span id="email-rule-count" class="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">กำลังโหลด...</span>
                </div>
            </div>
            <div id="email-rule-body" class="p-4">
                <div class="text-xs text-slate-400 animate-pulse">กำลังโหลดตำแหน่ง...</div>
            </div>
        </div>

        <!-- Legacy Flexible Self-Patrol Settings -->
        <div id="patrol-flexible-settings" class="bg-white rounded-xl border border-amber-100 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-white">
                <p class="text-[10px] font-bold uppercase tracking-widest text-amber-600">Legacy Flexible Self-Patrol</p>
                <div class="mt-1 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-2">
                    <div>
                        <h3 class="font-bold text-slate-800 text-sm">Legacy Flexible Fallback Quota</h3>
                        <p class="text-xs text-slate-500 mt-1">R7 uses the real admin Patrol Sessions schedule for position-based supervisor patrol. This value is kept only for legacy fallback compatibility.</p>
                    </div>
                    <span id="patrol-flex-count" class="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">Legacy</span>
                </div>
            </div>
            <div id="patrol-flex-body" class="p-4">
                <div class="text-xs text-slate-400 animate-pulse">Loading legacy fallback settings...</div>
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
              <div id="areas-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8 2xl:grid-cols-10 gap-2">
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
    loadEmailRequirementRules();
    loadPatrolFlexibleSettings();
    loadAreasList();
}

// â”€â”€â”€ Fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Stats Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Filter helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    <table class="ds-table min-w-[760px] text-left border-collapse">
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

// â”€â”€â”€ Modal: Add Department â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        document.getElementById('org-dept-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
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
        }));
    }, 50);
};

// â”€â”€â”€ Modal: Edit Department â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        document.getElementById('org-edit-dept-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
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
        }));
    }, 50);
};

// â”€â”€â”€ Modal: View/Manage Safety Units â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        document.getElementById('unit-add-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
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
        }));
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
        document.getElementById('unit-edit-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
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
        }));
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
PERM_LABELS.FOURM_TRAINING_MANAGE = { label: '4M Training PIC', desc: 'Manage 4M Training Matrix assignments in own department', color: 'violet' };

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
            USER:           { header: 'bg-teal-600 text-white',             pill: 'bg-teal-50 text-teal-700'        },
            VIEWER:         { header: 'bg-slate-400 text-white',            pill: 'bg-slate-100 text-slate-600'     },
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
    const totalActionCount = actionItems.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const actionRows = actionItems.map(item => `
        <button onclick="window._adminTab('${item.tab || 'health'}')"
            class="w-full text-left border ${severityClass[item.severity] || severityClass.ok} rounded-xl px-3 py-3 hover:shadow-sm transition-all">
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
    const readinessLabel = score >= 85 ? 'Operational' : score >= 65 ? 'Watch' : 'Action Needed';
    const shortcuts = [
        { tab: 'employees', label: 'Employee Master', hint: `${Number(d.totalEmployees || 0).toLocaleString()} employees` },
        { tab: 'health', label: 'System Health', hint: `${totalActionCount.toLocaleString()} action signals` },
        { tab: 'audit', label: 'Audit Log', hint: `${Number(d.auditToday || 0).toLocaleString()} today` },
        { tab: 'permissions', label: 'Permissions', hint: 'Role matrix' },
    ];

    return `
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div class="xl:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div class="flex items-center justify-between gap-3 mb-4">
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Admin Command Queue</p>
                    <h3 class="font-bold text-slate-800 text-sm mt-1">Action Required</h3>
                </div>
                <div class="text-right">
                    <p class="text-2xl font-black text-slate-800">${totalActionCount}</p>
                    <button onclick="window._adminTab('health')" class="text-xs font-bold text-slate-500 hover:text-slate-800">System Health</button>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${actionRequiredHtml}</div>
        </div>
        <div class="xl:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Readiness</p>
                    <h3 class="font-bold text-slate-800 text-sm mt-1">${readinessLabel}</h3>
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
        <div class="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Links</p>
            <div class="space-y-2">
                ${shortcuts.map(s => `
                    <button type="button" onclick="window._adminTab('${s.tab}')"
                        class="w-full text-left rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5 hover:bg-white hover:border-emerald-200 transition-colors">
                        <p class="text-xs font-black text-slate-700">${s.label}</p>
                        <p class="text-[11px] text-slate-400 mt-0.5">${s.hint}</p>
                    </button>
                `).join('')}
            </div>
        </div>
    </div>`;
}

function _adminHealthToneClass(status = '') {
    return status === 'critical'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : status === 'warning'
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function _adminHealthModuleDrilldown(key) {
    const mod = (_adminHealthState.moduleHealth || []).find(item => String(item.key || '') === String(key || ''));
    if (!mod) return;
    const tables = Array.isArray(mod.tables) ? mod.tables : [];
    const rootCauses = Array.isArray(mod.rootCauses) ? mod.rootCauses : [];
    const actions = Array.isArray(mod.recommendedActions) ? mod.recommendedActions : [];
    const failedPaths = Array.isArray(mod.failedPaths) ? mod.failedPaths : [];
    const tableRows = tables.map(table => {
        const missingCols = Array.isArray(table.missingColumns) ? table.missingColumns : [];
        const requirement = String(table.requirement || 'required');
        const requirementTone = requirement === 'required'
            ? 'bg-rose-50 text-rose-700 border-rose-100'
            : requirement === 'optional'
                ? 'bg-amber-50 text-amber-700 border-amber-100'
                : 'bg-slate-50 text-slate-500 border-slate-200';
        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="py-2 pr-3 font-mono text-[11px] text-slate-600">${escHtml(table.name || '-')}</td>
                <td class="py-2 pr-3"><span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${requirementTone}">${escHtml(requirement.toUpperCase())}</span></td>
                <td class="py-2 pr-3">
                    <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${table.exists ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}">${table.exists ? 'OK' : 'MISSING'}</span>
                </td>
                <td class="py-2 pr-3 text-[11px] font-bold text-slate-600">${table.count ?? '-'}</td>
                <td class="py-2 text-[11px] ${missingCols.length ? 'text-rose-600 font-bold' : 'text-slate-400'}">${escHtml(missingCols.join(', ') || '-')}</td>
            </tr>`;
    }).join('');
    const rootRows = rootCauses.length
        ? rootCauses.map(item => `
            <div class="rounded-lg border ${item.severity === 'high' ? 'border-rose-100 bg-rose-50' : 'border-amber-100 bg-amber-50'} px-3 py-2">
                <p class="text-xs font-black ${item.severity === 'high' ? 'text-rose-700' : 'text-amber-700'}">${escHtml(item.label || item.type || 'Root cause')}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">${escHtml(item.detail || '')}</p>
            </div>`).join('')
        : `<div class="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">ไม่พบสาเหตุผิดปกติจาก Phase 4 / No root cause detected.</div>`;
    const failedRows = failedPaths.length
        ? failedPaths.map(item => `
            <div class="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
                <span class="font-mono text-[11px] text-slate-600">${escHtml(item.path || '-')}</span>
                <span class="text-[11px] font-black text-rose-600">${Number(item.count || 0)}</span>
            </div>`).join('')
        : `<div class="text-[11px] text-slate-400">No failed API actions in the last 24 hours for this module.</div>`;
    const actionRows = actions.map(action => `
        <div class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">${escHtml(action)}</div>
    `).join('');
    const navKey = String(mod.nav || '').replace(/[^a-z0-9-]/gi, '');
    const content = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                ${metricCard('Status', String(mod.status || 'ok').toUpperCase(), mod.group || 'module', mod.status === 'critical' ? 'risk' : mod.status === 'warning' ? 'warn' : 'good')}
                ${metricCard('Tables', `${mod.existingTables ?? 0}/${mod.tableCount ?? 0}`, `${mod.missingTables?.length || 0} missing`, mod.missingTables?.length ? 'risk' : 'good')}
                ${metricCard('APIs', mod.apiCount ?? 0, `${mod.failedApi24h ?? 0} failed 24h`, mod.failedApi24h ? 'risk' : 'good')}
                ${metricCard('Rows', Number(mod.totalRows || 0).toLocaleString(), 'Readable module data', 'info')}
            </div>
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div class="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h4 class="text-xs font-black text-slate-700">ฐานข้อมูล / DB Schema</h4>
                        <span class="text-[10px] font-black px-2 py-1 rounded-full border ${_adminHealthToneClass(mod.status)}">${escHtml(String(mod.status || 'ok').toUpperCase())}</span>
                    </div>
                    <div class="p-4 overflow-x-auto">
                        <table class="w-full text-left">
                            <thead><tr class="text-[10px] uppercase text-slate-400"><th class="pb-2 pr-3">Table</th><th class="pb-2 pr-3">Policy</th><th class="pb-2 pr-3">State</th><th class="pb-2 pr-3">Rows</th><th class="pb-2">Missing columns</th></tr></thead>
                            <tbody>${tableRows || `<tr><td colspan="5" class="py-4 text-xs text-slate-400 text-center">No table coverage configured.</td></tr>`}</tbody>
                        </table>
                    </div>
                </div>
                <div class="space-y-4">
                    <div class="rounded-xl border border-slate-200 bg-white p-4">
                        <h4 class="text-xs font-black text-slate-700 mb-3">สาเหตุหลัก / Root Cause</h4>
                        <div class="space-y-2">${rootRows}</div>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-white p-4">
                        <h4 class="text-xs font-black text-slate-700 mb-3">API ที่ล้มเหลว / Failed Paths</h4>
                        ${failedRows}
                    </div>
                </div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-4">
                <h4 class="text-xs font-black text-slate-700 mb-3">แนวทางแก้ไข / Recommended Actions</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">${actionRows}</div>
            </div>
            <div class="flex flex-wrap justify-end gap-2 pt-1">
                ${mod.failedApi24h ? `<button type="button" onclick="window._adminHealthOpenFailedAudit()" class="px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-xs font-black text-rose-700">Open Failed Audit</button>` : ''}
                ${navKey ? `<button type="button" onclick="window._adminHealthGoModule('${navKey}')" class="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-700">Open Module</button>` : ''}
            </div>
        </div>`;
    openModal(`${escHtml(mod.label || mod.key || 'Module')} Health`, content, 'max-w-6xl');
}

function _adminHealthDrilldown(key) {
    const signal = (_adminHealthState.signals || []).find(item => String(item.key || '') === String(key || ''));
    const details = Array.isArray(signal?.detail) ? signal.detail : [];
    const detailRows = details.length
        ? details.slice(0, 80).map(item => {
            const text = typeof item === 'string' ? item : (item.NoticeNo || item.Department || item.ReportDate || item.id || JSON.stringify(item));
            return `<div class="py-1.5 border-b border-slate-100 last:border-0 text-[11px] text-slate-600">${escHtml(text)}</div>`;
        }).join('')
        : `<div class="text-xs text-slate-400">No detail rows were reported for this signal.</div>`;
    const affected = key === 'module_coverage'
        ? (_adminHealthState.moduleHealth || []).filter(item => item.status !== 'ok')
        : (_adminHealthState.moduleHealth || []).filter(item => {
            if (key === 'missing_required_tables') return (item.missingRequiredTables || []).length;
            if (key === 'missing_optional_tables') return (item.missingOptionalTables || []).length;
            if (key === 'backlog_tables') return (item.missingBacklogTables || []).length;
            if (key === 'missing_columns') return (item.missingColumns || []).length;
            if (key === 'failed_api_24h') return Number(item.failedApi24h || 0) > 0;
            if (signal?.module) return String(item.key || '') === String(signal.module);
            return false;
        });
    const affectedRows = affected.length
        ? affected.map(item => `
            <button type="button" onclick="window._adminHealthModuleDrilldown('${escHtml(item.key || '')}')"
                class="w-full text-left rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-white hover:border-emerald-200">
                <span class="text-xs font-black text-slate-700">${escHtml(item.label || item.key || 'Module')}</span>
                <span class="ml-2 text-[10px] font-black px-2 py-0.5 rounded-full border ${_adminHealthToneClass(item.status)}">${escHtml(String(item.status || 'ok').toUpperCase())}</span>
            </button>`).join('')
        : `<div class="text-xs text-slate-400">No directly affected module card was found.</div>`;
    openModal(escHtml(signal?.label || key || 'Health Signal'), `
        <div class="space-y-4">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="rounded-xl border border-slate-200 bg-white p-4">
                    <h4 class="text-xs font-black text-slate-700 mb-3">Signal Detail</h4>
                    <div class="max-h-80 overflow-y-auto pr-1">${detailRows}</div>
                </div>
                <div class="rounded-xl border border-slate-200 bg-white p-4">
                    <h4 class="text-xs font-black text-slate-700 mb-3">Affected Modules</h4>
                    <div class="space-y-2">${affectedRows}</div>
                </div>
            </div>
            <div class="flex flex-wrap justify-end gap-2">
                ${key === 'failed_api_24h' ? `<button type="button" onclick="window._adminHealthOpenFailedAudit()" class="px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-xs font-black text-rose-700">Open Failed Audit</button>` : ''}
            </div>
        </div>`, 'max-w-5xl');
}

function _adminStorageHealthDrilldown() {
    const storage = _adminHealthState.storageHealth || {};
    const config = storage.config || {};
    const missing = Array.isArray(storage.missingDetails) ? storage.missingDetails : [];
    const orphans = Array.isArray(storage.orphanDetails) ? storage.orphanDetails : [];
    const sources = Array.isArray(storage.sources) ? storage.sources : [];
    const sourceRows = sources.map(item => `
        <tr class="border-b border-slate-100 last:border-0">
            <td class="py-2 pr-3 text-xs font-bold text-slate-700">${escHtml(item.label || item.module || '-')}</td>
            <td class="py-2 pr-3 text-[11px] text-slate-500">${Number(item.references || 0)}</td>
            <td class="py-2 pr-3 text-[11px] font-bold ${item.missing ? 'text-rose-600' : 'text-emerald-600'}">${Number(item.missing || 0)}</td>
            <td class="py-2"><span class="text-[10px] font-black ${item.available ? 'text-emerald-600' : 'text-slate-400'}">${item.available ? 'AVAILABLE' : 'NOT AVAILABLE'}</span></td>
        </tr>`).join('');
    const missingRows = missing.length ? missing.map(item => `
        <div class="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
            <p class="text-xs font-black text-rose-700">${escHtml(item.source || item.module || 'File')} #${escHtml(item.recordId || '-')}</p>
            <p class="mt-0.5 break-all text-[11px] text-slate-500">${escHtml(item.filename || item.url || '-')}</p>
        </div>`).join('') : '<p class="text-xs font-bold text-emerald-700">ไม่พบไฟล์สูญหาย / No missing local files.</p>';
    const orphanRows = orphans.length ? orphans.map(name => `<div class="py-1.5 border-b border-slate-100 last:border-0 break-all font-mono text-[11px] text-slate-600">${escHtml(name)}</div>`).join('') : '<p class="text-xs font-bold text-emerald-700">ไม่พบไฟล์กำพร้า / No orphan files.</p>';
    openModal('สุขภาพพื้นที่จัดเก็บ / Storage & File Health', `
        <div class="space-y-4">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                ${metricCard('ไฟล์อ้างอิง / References', storage.referencesTotal ?? 0, `${storage.localReferences ?? 0} ไฟล์ในระบบ`, 'info')}
                ${metricCard('ไฟล์สูญหาย / Missing', storage.missingFiles ?? 0, 'มีข้อมูลอ้างอิงแต่ไม่พบไฟล์', storage.missingFiles ? 'risk' : 'good')}
                ${metricCard('ไฟล์กำพร้า / Orphans', storage.orphanFiles ?? 0, 'รอตรวจสอบก่อนจัดเก็บ', storage.orphanFiles ? 'warn' : 'good')}
                ${metricCard('ไฟล์บนดิสก์ / Disk', storage.diskFiles ?? 0, 'ตรวจแบบอ่านอย่างเดียว', 'info')}
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-4">
                <h4 class="text-xs font-black text-slate-700 mb-3">การตั้งค่าพื้นที่จัดเก็บ / Storage Configuration</h4>
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                    ${[['Public base URL', config.publicBaseUrlConfigured], ['Directory exists', config.directoryExists], ['Readable', config.directoryReadable], ['Writable', config.directoryWritable]].map(([label, ok]) => `<div class="rounded-lg border ${ok ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'} px-3 py-2"><p class="font-black">${label}</p><p>${ok ? 'OK' : 'CHECK'}</p></div>`).join('')}
                </div>
            </div>
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div class="rounded-xl border border-slate-200 bg-white p-4"><h4 class="text-xs font-black text-slate-700 mb-3">ไฟล์สูญหาย / Missing Local Files</h4><div class="space-y-2 max-h-80 overflow-y-auto">${missingRows}</div></div>
                <div class="rounded-xl border border-slate-200 bg-white p-4"><h4 class="text-xs font-black text-slate-700 mb-3">ไฟล์กำพร้าที่ควรตรวจ / Orphan Candidates</h4><div class="max-h-80 overflow-y-auto">${orphanRows}</div></div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white overflow-hidden"><div class="px-4 py-3 border-b border-slate-100"><h4 class="text-xs font-black text-slate-700">Attachment Sources</h4></div><div class="p-4 overflow-x-auto"><table class="w-full text-left"><thead><tr class="text-[10px] uppercase text-slate-400"><th class="pb-2 pr-3">Source</th><th class="pb-2 pr-3">References</th><th class="pb-2 pr-3">Missing</th><th class="pb-2">Probe</th></tr></thead><tbody>${sourceRows}</tbody></table></div></div>
            <p class="text-[11px] text-slate-400">ตรวจแบบอ่านอย่างเดียว / Read-only. ระบบจะไม่ลบไฟล์กำพร้าอัตโนมัติ</p>
        </div>`, 'max-w-6xl');
}

function _adminSecurityHealthDrilldown() {
    const security = _adminHealthState.securityHealth || {};
    const matrix = security.permissionMatrix || {};
    const users = security.users || {};
    const auth = security.auth || {};
    const guards = security.routeGuards || {};
    const findings = Array.isArray(security.findings) ? security.findings : [];
    const findingRows = findings.map(item => `
        <div class="flex items-center justify-between gap-3 rounded-lg border ${item.count ? (['critical','high'].includes(item.severity) ? 'border-rose-100 bg-rose-50' : 'border-amber-100 bg-amber-50') : 'border-emerald-100 bg-emerald-50'} px-3 py-2">
            <div><p class="text-xs font-black text-slate-700">${escHtml(item.label || item.key || 'Finding')}</p><p class="text-[10px] uppercase font-bold text-slate-400">${escHtml(item.severity || 'ok')}</p></div>
            <span class="text-sm font-black ${item.count ? 'text-rose-600' : 'text-emerald-600'}">${Number(item.count || 0)}</span>
        </div>`).join('');
    const guardRows = [['Admin API mount', guards.adminApiMountProtected], ['PHP Admin handler', guards.phpAdminHandlerProtected], ['System Health guard', guards.adminHealthRequiresAdmin]];
    openModal('สิทธิ์และความปลอดภัย / Permission & Security', `
        <div class="space-y-4">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                ${metricCard('Matrix', `${matrix.explicitEntries ?? 0}/${matrix.expectedEntries ?? 0}`, `${matrix.missingEntries ?? 0} implicit deny`, matrix.missingEntries ? 'warn' : 'good')}
                ${metricCard('Admin Users', users.admins ?? 0, `${users.total ?? 0} employees`, 'info')}
                ${metricCard('Legacy Passwords', auth.legacyPasswords ?? 0, `${auth.mustChangePassword ?? 0} must change`, auth.legacyPasswords ? 'risk' : 'good')}
                ${metricCard('Failed Login 24h', auth.failedLogins24h ?? 0, `${auth.passwordChanges24h ?? 0} password changes`, auth.failedLogins24h >= 20 ? 'risk' : auth.failedLogins24h ? 'warn' : 'good')}
            </div>
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div class="rounded-xl border border-slate-200 bg-white p-4"><h4 class="text-xs font-black text-slate-700 mb-3">ประเด็นความปลอดภัย / Security Findings</h4><div class="space-y-2">${findingRows}</div></div>
                <div class="space-y-4">
                    <div class="rounded-xl border border-slate-200 bg-white p-4">
                        <h4 class="text-xs font-black text-slate-700 mb-3">การตั้งค่ายืนยันตัวตน / Auth Configuration</h4>
                        <div class="grid grid-cols-2 gap-2 text-[11px]">
                            ${[['JWT secret', auth.jwtConfigured], ['Password minimum', Number(auth.passwordMinLength || 0) >= 4]].map(([label, ok]) => `<div class="rounded-lg border ${ok ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'} px-3 py-2"><p class="font-black">${label}</p><p>${ok ? 'OK' : 'CHECK'}</p></div>`).join('')}
                            <div class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-600"><p class="font-black">Missing Department</p><p>${users.missingDepartment ?? 0}</p></div>
                            <div class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-600"><p class="font-black">Missing Unit</p><p>${users.missingUnit ?? 0}</p></div>
                        </div>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-white p-4"><h4 class="text-xs font-black text-slate-700 mb-3">การป้องกันเส้นทาง / Route Guards</h4><div class="space-y-2">${guardRows.map(([label, ok]) => `<div class="flex justify-between text-xs"><span class="text-slate-600">${label}</span><span class="font-black ${ok ? 'text-emerald-600' : 'text-rose-600'}">${ok ? 'ป้องกันแล้ว / PROTECTED' : 'ตรวจสอบ / CHECK'}</span></div>`).join('')}</div></div>
                </div>
            </div>
            <div class="flex flex-wrap justify-end gap-2">
                <button type="button" onclick="closeModal();window._adminTab('permissions')" class="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-700">ตารางสิทธิ์ / Permission Matrix</button>
                <button type="button" onclick="window._adminHealthOpenFailedAudit()" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-700">บันทึกตรวจสอบ / Audit Log</button>
            </div>
            <p class="text-[11px] text-slate-400">Read-only aggregate check. No employee identity or secret value is included.</p>
        </div>`, 'max-w-6xl');
}

function _adminVersionHealthDrilldown() {
    const version = _adminHealthState.versionHealth || {};
    const manifest = version.manifest || {};
    const smoke = version.lastSmoke || {};
    const runtime = version.runtime || {};
    const files = Array.isArray(version.files) ? version.files : [];
    const markers = Array.isArray(version.parityMarkers) ? version.parityMarkers : [];
    const fileRows = files.map(file => `<tr class="border-b border-slate-100 last:border-0"><td class="py-2 pr-3 font-mono text-[11px] text-slate-600">${escHtml(file.path || file.key || '-')}</td><td class="py-2 pr-3 text-[11px] ${file.exists ? 'text-emerald-600' : 'text-rose-600'} font-black">${file.exists ? 'OK' : 'MISSING'}</td><td class="py-2 pr-3 text-[11px] text-slate-500">${Number(file.size || 0).toLocaleString()}</td><td class="py-2 pr-3 font-mono text-[11px] text-slate-500">${escHtml(file.sha256 || '-')}</td><td class="py-2 text-[11px] text-slate-400">${escHtml(file.modifiedAt || '-')}</td></tr>`).join('');
    const markerRows = markers.map(marker => `<div class="flex items-center justify-between gap-3 rounded-lg border ${marker.parity ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50'} px-3 py-2"><span class="text-xs font-black text-slate-700">${escHtml(String(marker.key || '').replace(/_/g, ' '))}</span><span class="text-[10px] font-black ${marker.parity ? 'text-emerald-600' : 'text-rose-600'}">${marker.parity ? 'PHP / NODE' : 'MISMATCH'}</span></div>`).join('');
    openModal('การติดตั้งและเวอร์ชัน / Deploy & Version', `
        <div class="space-y-4">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                ${metricCard('รุ่นระบบ / Build', manifest.buildId || '-', version.cacheBust || 'ไม่มี cache marker', 'info')}
                ${metricCard('ผลทดสอบ / Smoke', String(smoke.status || 'unknown').toUpperCase(), smoke.checkedAt || 'ยังไม่บันทึก', smoke.status === 'passed' ? 'good' : 'warn')}
                ${metricCard('ระบบทำงาน / Runtime', String(runtime.active || '-').toUpperCase(), runtime.phpVersion || runtime.nodeVersion || '-', 'info')}
                ${metricCard('ความเท่ากัน / Parity', `${markers.length - Number(version.parityMissing || 0)}/${markers.length}`, `${version.filesMissing || 0} ไฟล์สูญหาย`, version.parityMissing || version.filesMissing ? 'risk' : 'good')}
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-4"><h4 class="text-xs font-black text-slate-700 mb-2">ข้อมูลการติดตั้ง / Deployment Manifest</h4><div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]"><div><p class="font-bold text-slate-400">Cache Bust</p><p class="font-mono text-slate-700 break-all">${escHtml(manifest.cacheBust || '-')}</p></div><div><p class="font-bold text-slate-400">เวลาติดตั้ง / Deployed At</p><p class="text-slate-700">${escHtml(manifest.deployedAt || '-')}</p></div><div><p class="font-bold text-slate-400">ผลทดสอบล่าสุด / Last Smoke</p><p class="text-slate-700">${escHtml(smoke.summary || '-')}</p></div></div></div>
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-4"><div class="xl:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden"><div class="px-4 py-3 border-b border-slate-100"><h4 class="text-xs font-black text-slate-700">ไฟล์ระบบ / Runtime Files</h4></div><div class="p-4 overflow-x-auto"><table class="w-full text-left"><thead><tr class="text-[10px] uppercase text-slate-400"><th class="pb-2 pr-3">ไฟล์ / File</th><th class="pb-2 pr-3">สถานะ / State</th><th class="pb-2 pr-3">Bytes</th><th class="pb-2 pr-3">SHA-256</th><th class="pb-2">แก้ไขล่าสุด / Modified</th></tr></thead><tbody>${fileRows}</tbody></table></div></div><div class="rounded-xl border border-slate-200 bg-white p-4"><h4 class="text-xs font-black text-slate-700 mb-3">ความเท่ากัน PHP / Node</h4><div class="space-y-2">${markerRows}</div></div></div>
            <p class="text-[11px] text-slate-400">ข้อมูล runtime แบบอ่านอย่างเดียว / Read-only metadata. หน้าจอแสดง hash แบบย่อ แต่การ deploy ตรวจ SHA-256 เต็ม</p>
        </div>`, 'max-w-7xl');
}

function _adminHealthOpenFailedAudit() {
    closeModal();
    window._adminTab('audit');
    setTimeout(() => window._auditApplyPreset?.('failed'), 120);
}

function _adminHealthGoModule(tabKey) {
    closeModal();
    window._adminTab(String(tabKey || 'health').replace(/[^a-z0-9-]/gi, '') || 'health');
}

function _adminHealthStatusLabel(status = '') {
    const s = String(status || 'ok').toLowerCase();
    if (s === 'critical') return 'วิกฤต / Critical';
    if (s === 'warning') return 'เตือน / Warning';
    return 'ปกติ / OK';
}

function _adminHealthStatusTone(status = '') {
    const s = String(status || 'ok').toLowerCase();
    if (s === 'critical') return 'border-rose-200 bg-rose-50 text-rose-700';
    if (s === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function _decodeMojibakeText(text = '') {
    const raw = String(text || '');
    if (!/(?:Ã|Â|à¸|à¹|â)/.test(raw)) return raw;
    try {
        return decodeURIComponent(escape(raw));
    } catch (_) {
        return raw;
    }
}

function _repairHealthMojibakeDom(root) {
    if (!root || !document.createTreeWalker) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
        const fixed = _decodeMojibakeText(node.nodeValue || '');
        if (fixed !== node.nodeValue) node.nodeValue = fixed;
    });
}

function _adminHealthFilteredModules(filter = _adminHealthState.filter || 'all') {
    const modules = Array.isArray(_adminHealthState.moduleHealth) ? _adminHealthState.moduleHealth : [];
    const f = String(filter || 'all').toLowerCase();
    if (['critical', 'warning', 'ok'].includes(f)) return modules.filter(mod => String(mod.status || 'ok').toLowerCase() === f);
    return modules;
}

function _adminHealthModuleCardsHtml(modules = [], filter = 'all') {
    const rows = Array.isArray(modules) ? modules : [];
    if (!rows.length) {
        return `<div class="col-span-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs font-bold text-slate-400">ไม่พบโมดูลตามตัวกรอง / No modules match this filter.</div>`;
    }
    return rows.map(mod => {
        const navKey = String(mod.nav || '').replace(/[^a-z0-9-]/gi, '');
        const missing = [...(mod.missingTables || []), ...(mod.missingColumns || [])];
        const rootCauseCount = Array.isArray(mod.rootCauses) ? mod.rootCauses.length : missing.length + Number(mod.failedApi24h || 0);
        const subtitle = missing.length
            ? missing.slice(0, 2).join(', ')
            : rootCauseCount
                ? `${rootCauseCount} root cause item(s)`
                : `${mod.existingTables || 0}/${mod.tableCount || 0} tables · ${mod.apiCount || 0} APIs`;
        return `
        <button type="button" onclick="window._adminHealthModuleDrilldown&&window._adminHealthModuleDrilldown('${escHtml(mod.key || '')}')"
            class="text-left rounded-xl border bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">${escHtml(mod.group || 'module')}</p>
                    <h3 class="mt-1 text-sm font-black text-slate-800">${escHtml(mod.label || mod.key || 'Module')}</h3>
                </div>
                <span class="shrink-0 text-[10px] font-black px-2 py-1 rounded-full border ${_adminHealthStatusTone(mod.status)}">${_adminHealthStatusLabel(mod.status)}</span>
            </div>
            <div class="mt-3 grid grid-cols-3 gap-2 text-center">
                <div class="rounded-lg bg-slate-50 px-2 py-2">
                    <p class="text-sm font-black text-slate-800">${mod.existingTables ?? 0}/${mod.tableCount ?? 0}</p>
                    <p class="text-[10px] font-bold text-slate-400">ตาราง / Tables</p>
                </div>
                <div class="rounded-lg bg-slate-50 px-2 py-2">
                    <p class="text-sm font-black text-slate-800">${mod.apiCount ?? 0}</p>
                    <p class="text-[10px] font-bold text-slate-400">API</p>
                </div>
                <div class="rounded-lg bg-slate-50 px-2 py-2">
                    <p class="text-sm font-black ${(mod.failedApi24h || 0) ? 'text-rose-600' : 'text-slate-800'}">${mod.failedApi24h ?? 0}</p>
                    <p class="text-[10px] font-bold text-slate-400">ล้มเหลว 24 ชม.</p>
                </div>
            </div>
            <p class="mt-3 min-h-[2rem] text-[11px] font-semibold ${missing.length || rootCauseCount ? 'text-amber-700' : 'text-slate-500'}">${escHtml(subtitle)}</p>
            <div class="mt-3 flex items-center justify-between gap-2">
                <span class="text-[10px] font-bold text-slate-400">รายละเอียด / Drilldown</span>
                ${navKey ? `<span class="text-[10px] font-black text-emerald-700">ไปโมดูล / Jump</span>` : ''}
            </div>
        </button>`;
    }).join('');
}

function _adminHealthSetFilter(filter = 'all') {
    _adminHealthState.filter = String(filter || 'all').toLowerCase();
    const grid = document.getElementById('admin-health-module-grid');
    if (grid) grid.innerHTML = _adminHealthModuleCardsHtml(_adminHealthFilteredModules(), _adminHealthState.filter);
    document.querySelectorAll('[data-health-filter]').forEach(btn => {
        const active = btn.getAttribute('data-health-filter') === _adminHealthState.filter;
        btn.classList.toggle('bg-emerald-600', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('border-emerald-600', active);
        btn.classList.toggle('bg-white', !active);
        btn.classList.toggle('text-slate-600', !active);
        btn.classList.toggle('border-slate-200', !active);
    });
}

function _adminHealthReportRows() {
    const d = _adminHealthState.raw || {};
    const readiness = d.readiness || {};
    const coverage = d.coverage || {};
    const modules = Array.isArray(_adminHealthState.moduleHealth) ? _adminHealthState.moduleHealth : [];
    return modules.map(mod => ({
        Module: mod.label || mod.key || '',
        Key: mod.key || '',
        Group: mod.group || '',
        Status: String(mod.status || 'ok').toUpperCase(),
        Tables: `${mod.existingTables ?? 0}/${mod.tableCount ?? 0}`,
        MissingTables: (mod.missingTables || []).join(', '),
        MissingColumns: (mod.missingColumns || []).join(', '),
        ApiCount: mod.apiCount ?? 0,
        FailedApi24h: mod.failedApi24h ?? 0,
        TotalRows: mod.totalRows ?? 0,
        ReadinessScore: readiness.score ?? '',
        ReadinessStatus: readiness.status || '',
        ModulesTotal: coverage.modulesTotal ?? modules.length
    }));
}

function _adminHealthExportExcel() {
    const rows = _adminHealthReportRows();
    if (!rows.length) { showToast('ไม่มีข้อมูล Health ให้ export', 'error'); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    if (window.XLSX) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [24, 18, 16, 14, 12, 34, 34, 10, 14, 12, 14, 18, 12].map(wch => ({ wch }));
        XLSX.utils.book_append_sheet(wb, ws, 'System Health');
        XLSX.writeFile(wb, `System_Health_Report_${stamp}.xlsx`);
    } else {
        const headers = Object.keys(rows[0]);
        const csv = [headers.join(','), ...rows.map(row => headers.map(key => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: `System_Health_Report_${stamp}.csv` });
        a.click();
        URL.revokeObjectURL(url);
    }
    showToast('Export Health report สำเร็จ', 'success');
}

function _adminHealthExportPdf() {
    const d = _adminHealthState.raw || {};
    const readiness = d.readiness || {};
    const rows = _adminHealthReportRows();
    const win = window.open('', '_blank');
    if (!win) { showToast('เบราว์เซอร์บล็อก popup สำหรับ PDF', 'error'); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>System Health Report</title>
        <style>
            body{font-family:Arial,Tahoma,sans-serif;margin:24px;color:#0f172a}
            h1{font-size:22px;margin:0 0 4px}.muted{color:#64748b;font-size:12px}
            table{width:100%;border-collapse:collapse;margin-top:18px;font-size:11px}
            th,td{border:1px solid #e2e8f0;padding:6px;text-align:left;vertical-align:top}
            th{background:#f8fafc;text-transform:uppercase;font-size:10px}
            .pill{display:inline-block;border:1px solid #cbd5e1;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700}
            @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
        </style></head><body>
        <h1>รายงานสุขภาพระบบ / System Health Report</h1>
        <div class="muted">Generated: ${escHtml(new Date().toLocaleString())}</div>
        <p><span class="pill">Readiness: ${escHtml(String(readiness.score ?? '-'))}% · ${escHtml(readiness.status || 'Unknown')}</span></p>
        <table><thead><tr><th>Module</th><th>Status</th><th>Tables</th><th>Failed API 24h</th><th>Missing / Notes</th></tr></thead>
        <tbody>${rows.map(row => `<tr><td>${escHtml(row.Module)}</td><td>${escHtml(row.Status)}</td><td>${escHtml(row.Tables)}</td><td>${escHtml(String(row.FailedApi24h))}</td><td>${escHtml(row.MissingTables || row.MissingColumns || '-')}</td></tr>`).join('')}</tbody></table>
        <script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script>
        </body></html>`);
    win.document.close();
}

function _adminHealthSnapshotPanelHtml(snapshotHealth = {}) {
    const rows = Array.isArray(snapshotHealth.rows) ? snapshotHealth.rows : [];
    const latest = snapshotHealth.latest || rows[0] || null;
    const trend = snapshotHealth.trend || {};
    const deltaText = (value) => {
        const n = Number(value || 0);
        if (n > 0) return `+${n}`;
        return String(n);
    };
    const historyRows = rows.slice(0, 6).map(row => `
        <tr class="border-b border-slate-100 last:border-0">
            <td class="py-2 pr-3 text-[11px] text-slate-500">${escHtml(row.SnapshotAt || row.snapshotAt || '-')}</td>
            <td class="py-2 pr-3 text-xs font-black text-slate-800">${escHtml(String(row.ReadinessScore ?? row.readinessScore ?? '-'))}%</td>
            <td class="py-2 pr-3"><span class="text-[10px] font-black px-2 py-0.5 rounded-full border ${_adminHealthStatusTone((row.CriticalModules || row.criticalModules) > 0 ? 'critical' : (row.WarningModules || row.warningModules) > 0 ? 'warning' : 'ok')}">${escHtml(row.ReadinessStatus || row.readinessStatus || '-')}</span></td>
            <td class="py-2 pr-3 text-[11px] text-rose-600 font-bold">${Number(row.CriticalModules || row.criticalModules || 0)}</td>
            <td class="py-2 text-[11px] text-amber-600 font-bold">${Number(row.FailedApi24h || row.failedApi24h || 0)}</td>
        </tr>`).join('');
    return `
    <div class="ds-section border-l-4 border-l-violet-400">
        <div class="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3 mb-4">
            <div>
                <p class="text-[10px] font-black uppercase tracking-widest text-violet-600">Phase 10</p>
                <h3 class="mt-1 text-sm font-black text-slate-800">ประวัติสุขภาพระบบ / Health Snapshot History</h3>
                <p class="mt-1 text-xs text-slate-500">เก็บ snapshot เพื่อดู trend, compare ก่อน/หลัง deploy และใช้เป็น daily system check</p>
            </div>
            <button type="button" onclick="window._adminHealthSaveSnapshot&&window._adminHealthSaveSnapshot()"
                class="px-3 py-2 rounded-lg border border-violet-200 bg-violet-50 text-xs font-black text-violet-700 hover:bg-violet-100">
                บันทึก Snapshot ตอนนี้ / Save Now
            </button>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            ${metricCard('Latest Score', latest ? `${latest.ReadinessScore ?? latest.readinessScore ?? '-'}%` : '-', latest ? (latest.ReadinessStatus || latest.readinessStatus || '-') : 'No snapshot yet', latest ? 'info' : 'warn')}
            ${metricCard('Score Trend', deltaText(trend.scoreDelta), 'เทียบ snapshot ก่อนหน้า', Number(trend.scoreDelta || 0) >= 0 ? 'good' : 'risk')}
            ${metricCard('Critical Trend', deltaText(trend.criticalDelta), 'จำนวน critical module', Number(trend.criticalDelta || 0) > 0 ? 'risk' : 'good')}
            ${metricCard('Failed API Trend', deltaText(trend.failedApiDelta), 'failed API 24h', Number(trend.failedApiDelta || 0) > 0 ? 'risk' : 'good')}
        </div>
        <div class="mt-4 rounded-xl border border-slate-200 overflow-hidden">
            <table class="w-full text-left">
                <thead class="bg-slate-50"><tr class="text-[10px] uppercase text-slate-400"><th class="py-2 px-3">Snapshot</th><th class="py-2 px-3">Score</th><th class="py-2 px-3">Status</th><th class="py-2 px-3">Critical</th><th class="py-2 px-3">Failed API</th></tr></thead>
                <tbody>${historyRows || `<tr><td colspan="5" class="py-6 text-center text-xs text-slate-400">ยังไม่มี snapshot / No snapshot saved yet.</td></tr>`}</tbody>
            </table>
        </div>
    </div>`;
}

async function _adminHealthSaveSnapshot() {
    try {
        const health = _adminHealthState.raw || {};
        if (!health.readiness) { showToast('ยังไม่มีข้อมูล Health สำหรับบันทึก snapshot', 'error'); return; }
        const res = await API.post('/admin/system-health/snapshots', { health, source: 'manual' });
        _adminHealthState.raw.snapshotHealth = res?.data?.history || res?.history || {};
        showToast('บันทึก System Health snapshot แล้ว', 'success');
        const container = document.getElementById('admin-content-area');
        if (container) await renderSystemHealth(container);
    } catch (err) {
        showToast('บันทึก snapshot ไม่สำเร็จ: ' + (err?.message || err), 'error');
    }
}

function _normalizeBranding(raw = {}) {
    const appName = String(raw.appName || DEFAULT_BRANDING.appName).trim().slice(0, 80) || DEFAULT_BRANDING.appName;
    const tagline = String(raw.tagline || DEFAULT_BRANDING.tagline).trim().slice(0, 80) || DEFAULT_BRANDING.tagline;
    const loginHeroTitle = String(raw.loginHeroTitle || '').trim().slice(0, 140);
    const loginHeroSubtitle = String(raw.loginHeroSubtitle || '').trim().slice(0, 180);
    return {
        appName,
        tagline,
        loginHeroTitle,
        loginHeroSubtitle,
        logoUrl: String(raw.logoUrl || '').trim().slice(0, 1024)
    };
}

function _brandingPreviewLogo(logoUrl = '') {
    if (logoUrl) {
        return `<img src="${escHtml(logoUrl)}" alt="Current logo" class="w-full h-full object-contain">`;
    }
    return `
        <svg width="56" height="56" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill="#059669" fill-opacity="0.1"/>
            <path d="M20 10L12 14.5v7c0 6 4 11.5 8 13.5 4-2 8-7.5 8-13.5v-7z" fill="#059669"/>
            <path d="M15.5 21.5l3 3 6-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
}

async function _loadBrandingSetting() {
    const res = await API.get('/settings/app_branding');
    let raw = res?.value;
    if (typeof raw === 'string' && raw.trim()) {
        try { raw = JSON.parse(raw); } catch (_) { raw = {}; }
    }
    _brandingState = _normalizeBranding(raw || {});
    _brandingUpdatedAt = raw?.updatedAt || '';
}

async function renderBranding(container) {
    container.innerHTML = _skelSpinner();
    try {
        await _loadBrandingSetting();
    } catch (err) {
        showError('โหลดค่าตั้งค่าแบรนด์ไม่สำเร็จ', err);
        _brandingState = { ...DEFAULT_BRANDING };
    }

    container.innerHTML = `
    <div class="animate-fade-in space-y-5">
        <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
            <div>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">System Branding</p>
                <h2 class="text-xl font-black text-slate-800">ตั้งค่าแบรนด์ระบบ</h2>
                <p class="text-sm text-slate-500 mt-1">กำหนดชื่อระบบและโลโก้ที่ใช้ร่วมกันบน Sidebar, Mobile header และหน้า Login</p>
            </div>
            <span class="text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-3 py-1.5">
                ${_brandingUpdatedAt ? `Updated ${escHtml(_brandingUpdatedAt)}` : 'Using saved setting or default'}
            </span>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-[360px,1fr] gap-5">
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Preview</p>
                <div class="rounded-2xl p-5 text-white overflow-hidden" style="background:linear-gradient(160deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
                    <div class="flex items-center gap-3">
                        <div id="branding-preview-logo" class="w-14 h-14 rounded-xl bg-white/12 border border-white/15 p-1.5 flex items-center justify-center overflow-hidden">
                            ${_brandingPreviewLogo(_brandingState.logoUrl)}
                        </div>
                        <div class="min-w-0">
                            <p id="branding-preview-name" class="text-base font-black truncate">${escHtml(_brandingState.appName)}</p>
                            <p id="branding-preview-tagline" class="text-xs text-emerald-100/80 truncate">${escHtml(_brandingState.tagline)}</p>
                        </div>
                    </div>
                    <div class="mt-5 pt-4 border-t border-white/15">
                        <p class="text-[11px] font-bold uppercase tracking-widest text-emerald-100/70 mb-2">Login Hero</p>
                        <p id="branding-preview-login-title" class="text-lg font-black leading-tight">${escHtml(_brandingState.loginHeroTitle || _brandingState.appName)}</p>
                        <p id="branding-preview-login-subtitle" class="text-xs text-emerald-100/80 mt-1 leading-relaxed">${escHtml(_brandingState.loginHeroSubtitle || _brandingState.tagline)}</p>
                    </div>
                </div>
                <p class="text-xs text-slate-500 mt-3">ถ้าไม่มีโลโก้ที่อัปโหลด ระบบจะใช้โลโก้เดิมอัตโนมัติ</p>
            </div>

            <form id="branding-form" class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label class="block">
                        <span class="block text-xs font-bold text-slate-600 mt-1">Sidebar / Header Name</span>
                        <input id="branding-app-name" value="${escHtml(_brandingState.appName)}" maxlength="80"
                            class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
                    </label>
                    <label class="block">
                        <span class="text-xs font-bold text-slate-600">Sidebar / Header Tagline</span>
                        <input id="branding-tagline" value="${escHtml(_brandingState.tagline)}" maxlength="80"
                            class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
                    </label>
                </div>
                <div>
                    <p class="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Desktop Login Hero</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label class="block">
                            <span class="text-xs font-bold text-slate-600">Login Hero Title</span>
                            <input id="branding-login-title" value="${escHtml(_brandingState.loginHeroTitle)}" maxlength="140" placeholder="${escHtml(_brandingState.appName)}"
                                class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
                        </label>
                        <label class="block">
                            <span class="text-xs font-bold text-slate-600">Login Hero Subtitle</span>
                            <input id="branding-login-subtitle" value="${escHtml(_brandingState.loginHeroSubtitle)}" maxlength="180" placeholder="${escHtml(_brandingState.tagline)}"
                                class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
                        </label>
                    </div>
                    <p class="text-xs text-slate-500 mt-2">Leave Login Hero fields blank to reuse Sidebar / Header text.</p>
                </div>

                <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                    <div class="flex flex-col md:flex-row md:items-center gap-3">
                        <div class="flex-1">
                            <p class="text-xs font-bold text-slate-600">อัปโหลดโลโก้ใหม่</p>
                            <p class="text-xs text-slate-500 mt-1">รองรับ PNG, JPG, JPEG, WEBP ขนาดไม่เกิน 2 MB · แนะนำ 512 × 512 px</p>
                            <p id="branding-logo-url" class="text-[11px] text-slate-400 mt-2 break-all">${escHtml(_brandingState.logoUrl || 'Default logo')}</p>
                        </div>
                        <input id="branding-logo-input" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" class="hidden">
                        <button type="button" onclick="document.getElementById('branding-logo-input')?.click()"
                            class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold">เลือกไฟล์</button>
                    </div>
                </div>

                <div class="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <div class="flex flex-col lg:flex-row gap-4">
                        <div class="flex-1">
                            <p class="text-xs font-black text-emerald-800 uppercase tracking-wide">Logo Guide / คำแนะนำโลโก้</p>
                            <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                                <div class="rounded-lg bg-white/80 border border-emerald-100 p-3">
                                    <p class="font-bold text-slate-800">Recommended Size</p>
                                    <p class="mt-1">512 × 512 px แบบสี่เหลี่ยมจัตุรัส</p>
                                    <p class="text-slate-400 mt-1">Minimum 256 × 256 px</p>
                                </div>
                                <div class="rounded-lg bg-white/80 border border-emerald-100 p-3">
                                    <p class="font-bold text-slate-800">Best Format</p>
                                    <p class="mt-1">PNG หรือ WebP พื้นหลังโปร่งใส</p>
                                    <p class="text-slate-400 mt-1">JPG ใช้ได้ถ้าพื้นหลังเข้ากับสีระบบ</p>
                                </div>
                                <div class="rounded-lg bg-white/80 border border-emerald-100 p-3">
                                    <p class="font-bold text-slate-800">Safe Area</p>
                                    <p class="mt-1">เว้นขอบ 15-20% รอบโลโก้</p>
                                    <p class="text-slate-400 mt-1">ช่วยให้ไม่ชิดขอบเมื่อแสดงใน Sidebar/Login</p>
                                </div>
                                <div class="rounded-lg bg-white/80 border border-emerald-100 p-3">
                                    <p class="font-bold text-slate-800">Used In</p>
                                    <p class="mt-1">Sidebar 40px · Mobile 32px · Login 56px</p>
                                    <p class="text-slate-400 mt-1">ควรเป็น icon ชัดเจน ไม่ใช่ banner ยาว</p>
                                </div>
                            </div>
                        </div>
                        <div class="lg:w-80">
                            <p class="text-xs font-black text-emerald-800 uppercase tracking-wide">Color Palette / โทนสีระบบ</p>
                            <div class="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                                ${[
                                    ['Primary', '#059669'],
                                    ['Deep Green', '#064e3b'],
                                    ['Teal', '#0d9488'],
                                    ['Mint BG', '#ecfdf5'],
                                    ['Text', '#0f172a'],
                                    ['Warning', '#d97706']
                                ].map(([name, hex]) => `
                                    <div class="rounded-lg bg-white/80 border border-emerald-100 p-2 flex items-center gap-2">
                                        <span class="w-5 h-5 rounded-md border border-slate-200 shadow-sm" style="background:${hex}"></span>
                                        <span class="min-w-0">
                                            <span class="block font-bold text-slate-700 truncate">${name}</span>
                                            <span class="block text-slate-400">${hex}</span>
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                            <p class="text-[11px] text-slate-500 mt-3">Tip: ใช้โลโก้สีขาว/เขียวเข้มบนพื้นโปร่งใสจะเข้ากับ Sidebar และ Login ได้ดีที่สุด</p>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col sm:flex-row sm:justify-between gap-2 pt-2">
                    <button type="button" id="branding-reset-btn"
                        class="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold">รีเซ็ตกลับค่าเริ่มต้น</button>
                    <button type="submit" id="branding-save-btn"
                        class="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm">บันทึก Branding</button>
                </div>
            </form>
        </div>
    </div>`;

    const appName = document.getElementById('branding-app-name');
    const tagline = document.getElementById('branding-tagline');
    const loginTitle = document.getElementById('branding-login-title');
    const loginSubtitle = document.getElementById('branding-login-subtitle');
    const fileInput = document.getElementById('branding-logo-input');
    const updatePreview = () => {
        _brandingState.appName = String(appName?.value || '').trim() || DEFAULT_BRANDING.appName;
        _brandingState.tagline = String(tagline?.value || '').trim() || DEFAULT_BRANDING.tagline;
        _brandingState.loginHeroTitle = String(loginTitle?.value || '').trim();
        _brandingState.loginHeroSubtitle = String(loginSubtitle?.value || '').trim();
        document.getElementById('branding-preview-name').textContent = _brandingState.appName;
        document.getElementById('branding-preview-tagline').textContent = _brandingState.tagline;
        const loginPreviewTitle = document.getElementById('branding-preview-login-title');
        const loginPreviewSubtitle = document.getElementById('branding-preview-login-subtitle');
        if (loginPreviewTitle) loginPreviewTitle.textContent = _brandingState.loginHeroTitle || _brandingState.appName;
        if (loginPreviewSubtitle) loginPreviewSubtitle.textContent = _brandingState.loginHeroSubtitle || _brandingState.tagline;
    };
    appName?.addEventListener('input', updatePreview);
    tagline?.addEventListener('input', updatePreview);
    loginTitle?.addEventListener('input', updatePreview);
    loginSubtitle?.addEventListener('input', updatePreview);

    fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const allowed = ['image/png', 'image/jpeg', 'image/webp'];
        if (!allowed.includes(file.type) || !/\.(png|jpe?g|webp)$/i.test(file.name)) {
            showToast('รองรับเฉพาะไฟล์ PNG, JPG, JPEG หรือ WEBP', 'error');
            fileInput.value = '';
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            showToast('โลโก้ต้องมีขนาดไม่เกิน 2 MB', 'error');
            fileInput.value = '';
            return;
        }
        const fd = new FormData();
        fd.append('logo', file);
        try {
            const res = await API.post('/upload/branding-logo', fd);
            _brandingState.logoUrl = res.url || res.data?.url || '';
            document.getElementById('branding-preview-logo').innerHTML = _brandingPreviewLogo(_brandingState.logoUrl);
            document.getElementById('branding-logo-url').textContent = _brandingState.logoUrl || 'Default logo';
            showToast('อัปโหลดโลโก้แล้ว กดบันทึกเพื่อใช้งาน', 'success');
        } catch (err) {
            showError('อัปโหลดโลโก้ไม่สำเร็จ', err);
        } finally {
            fileInput.value = '';
        }
    });

    document.getElementById('branding-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
        e.preventDefault();
        updatePreview();
        const btn = document.getElementById('branding-save-btn');
        const orig = _btnLoad(btn, 'Saving...');
        try {
            const payload = { ..._normalizeBranding(_brandingState), updatedAt: new Date().toISOString() };
            await API.put('/settings/app_branding', { value: payload });
            await window._refreshAppBranding?.();
            _brandingState = _normalizeBranding(payload);
            showToast('บันทึก Branding สำเร็จ', 'success');
            renderBranding(container);
        } catch (err) {
            showError('บันทึก Branding ไม่สำเร็จ', err);
        } finally {
            _btnRestore(btn, orig);
        }
    }));

    document.getElementById('branding-reset-btn')?.addEventListener('click', guardActionHandler(async () => {
        if (!confirm('รีเซ็ต Branding กลับค่าเริ่มต้น?')) return;
        const btn = document.getElementById('branding-reset-btn');
        const orig = _btnLoad(btn, 'Resetting...');
        try {
            await API.put('/settings/app_branding', { value: null });
            _brandingState = { ...DEFAULT_BRANDING };
            await window._refreshAppBranding?.();
            showToast('รีเซ็ต Branding แล้ว', 'success');
            renderBranding(container);
        } catch (err) {
            showError('รีเซ็ต Branding ไม่สำเร็จ', err);
        } finally {
            _btnRestore(btn, orig);
        }
    }));
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
        <div class="animate-fade-in space-y-5">
            ${_adminActionCenterHtml(d)}
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Operational Snapshot</p>
                    <h2 class="text-base font-black text-slate-800 mt-1">System Console Dashboard</h2>
                </div>
                <div class="flex gap-2 overflow-x-auto scrollbar-none">
                    <button type="button" onclick="window._adminTab('employees')" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-200 hover:text-emerald-700">Employee</button>
                    <button type="button" onclick="window._adminTab('scheduler')" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-200 hover:text-emerald-700">Scheduler</button>
                    <button type="button" onclick="window._adminTab('reference')" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-200 hover:text-emerald-700">Reference</button>
                    <button type="button" onclick="window._adminTab('targets')" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-200 hover:text-emerald-700">Targets</button>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-4">
                ${cards.map(c => `
                <div class="bg-white rounded-xl border ${colorMap[c.color].split(' ')[2]} shadow-sm p-4 flex flex-col gap-2">
                    <div class="p-2 ${colorMap[c.color].split(' ').slice(0,2).join(' ')} rounded-lg w-fit border ${colorMap[c.color].split(' ')[2]}">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${c.icon}</svg>
                    </div>
                    <div class="text-2xl font-bold text-slate-800">${c.value}</div>
                    <div class="text-xs text-slate-500 leading-tight">${c.label}</div>
                </div>`).join('')}
            </div>

            <div class="grid grid-cols-1 xl:grid-cols-5 gap-5">
                <div class="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 class="font-bold text-slate-700 mb-4 text-sm">พนักงานแยกตามหน่วยงาน</h3>
                    <div class="space-y-2.5">${deptRows || '<div class="text-xs text-slate-400 py-4 text-center">ไม่มีข้อมูล</div>'}</div>
                </div>
                <div class="xl:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
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
                const d = _dateInputValue(cur.ScheduledDate || cur.PatrolDate);
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
                            const scheduleDate = _dateInputValue(item.ScheduledDate || item.PatrolDate);
                            const editArgs = [
                                item.id,
                                scheduleDate,
                                item.TeamName || '',
                                item.AreaName || '',
                                item.PatrolRound || 1,
                                item.Status || 'Pending',
                            ].map(v => escHtml(JSON.stringify(v))).join(',');
                            return `
                            <div class="p-2.5 rounded-lg border flex justify-between items-center gap-2 transition-all ${isCancelled ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-slate-50 border-slate-100'}">
                                <div class="flex items-center gap-2 flex-1 min-w-0">
                                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${color}"></span>
                                    <span class="font-semibold text-xs truncate ${isCancelled ? 'line-through text-slate-400' : 'text-slate-700'}">${escHtml(item.TeamName||'-')}</span>
                                    ${item.AreaName && !isCancelled ? `<span class="text-[10px] text-slate-400 truncate hidden sm:inline">${escHtml(item.AreaName)}</span>` : ''}
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
                                    <button onclick="window.editSchedule(${editArgs})" class="text-slate-300 hover:text-blue-500 p-1 transition-colors" title="แก้ไขวันที่">
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
            start: _dateInputValue(item.ScheduledDate || item.PatrolDate),
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

function _dateInputValue(value) {
    if (!value) return '';
    const raw = String(value).trim();
    const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    const thMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (thMatch) {
        const [, day, month, year] = thMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

window.editSchedule = function(id, currentDate, teamName, areaName, round, currentStatus = 'Pending') {
    const normalizedDate = _dateInputValue(currentDate);
    const statusOpts = ['Pending','Completed','Missed','Cancelled'].map(s =>
        `<option value="${s}" ${s === currentStatus ? 'selected' : ''}>${s}</option>`
    ).join('');
    openModal('แก้ไข Session', `
    <div class="space-y-4">
        <div class="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600 space-y-0.5">
            <p class="font-semibold text-slate-800">${escHtml(teamName)}</p>
            <p class="text-xs text-slate-400">${areaName ? `พื้นที่: ${escHtml(areaName)} · ` : ''}รอบ ${escHtml(round)}</p>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่เดิน <span class="text-red-500">*</span></label>
            <input type="date" id="edit-session-date" value="${normalizedDate}" class="form-input w-full">
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานะ</label>
            <select id="edit-session-status" class="form-input w-full">${statusOpts}</select>
        </div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="button" onclick="window._doEditSchedule(${escHtml(JSON.stringify(id))},this)" class="btn btn-primary px-5">บันทึก</button>
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
        document.getElementById('pt-team-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
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
        }));
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
        document.getElementById('pt-team-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
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
        }));
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

        submitBtn?.addEventListener('click', guardActionHandler(async () => {
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
        }));
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
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">คนที่ 1</label>
                <select id="swap-e1" class="form-input w-full text-sm">${memberOpts}</select>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">คนที่ 2</label>
                <select id="swap-e2" class="form-input w-full text-sm">${memberOpts}</select>
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                ${_emailRequirementRule.requiredPositionIds.includes(Number(item.id))
                    ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0 whitespace-nowrap">Email</span>`
                    : ''}
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

async function loadEmailRequirementRules() {
    const body = document.getElementById('email-rule-body');
    const count = document.getElementById('email-rule-count');
    if (!body) return;
    try {
        const res = await API.get('/admin/email-requirement-rules');
        if (!res.success) throw new Error(res.message);
        _emailRequirementRule = {
            positions: res.data?.positions || [],
            requiredPositionIds: (res.data?.requiredPositionIds || []).map(Number),
            isUsingDefault: !!res.data?.isUsingDefault,
        };
        renderEmailRequirementRules();
        loadPositionsList();
    } catch (err) {
        if (count) count.textContent = 'โหลดไม่ได้';
        body.innerHTML = `<div class="text-xs text-red-500">ไม่สามารถโหลด Email Requirement Rules ได้: ${escHtml(err?.message || err)}</div>`;
    }
}

function renderEmailRequirementRules() {
    const body = document.getElementById('email-rule-body');
    const count = document.getElementById('email-rule-count');
    if (!body) return;
    const positions = _emailRequirementRule.positions || [];
    const selected = new Set((_emailRequirementRule.requiredPositionIds || []).map(Number));
    if (count) count.textContent = `${selected.size} ตำแหน่งที่ควรมีอีเมล`;
    if (!positions.length) {
        body.innerHTML = emptyState('ยังไม่มี Master Position', 'เพิ่มตำแหน่งในข้อมูลอ้างอิงก่อนตั้งค่า Email Requirement Rules');
        return;
    }
    body.innerHTML = `
        <div class="flex flex-col gap-4">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p class="text-xs text-slate-500">
                    ${_emailRequirementRule.isUsingDefault
                        ? 'กำลังใช้ตำแหน่งเริ่มต้นที่ระบบแนะนำ กดบันทึกเพื่อยืนยันหรือปรับรายการได้'
                        : 'รายการนี้เป็น config กลางของระบบ Admin สามารถปรับตามโครงสร้างองค์กรได้'}
                </p>
                <button type="button" onclick="window._saveEmailRequirementRules()"
                    class="px-4 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
                    บันทึกกติกา
                </button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                ${positions.map(position => `
                    <label class="flex items-start gap-2 rounded-lg border ${selected.has(Number(position.id)) ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'} px-3 py-2 cursor-pointer hover:border-emerald-200 transition-colors">
                        <input type="checkbox" class="email-rule-position mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            value="${position.id}" ${selected.has(Number(position.id)) ? 'checked' : ''}>
                        <span class="text-xs font-medium text-slate-700 leading-snug">${escHtml(position.Name || '')}</span>
                    </label>`).join('')}
            </div>
        </div>`;
}

window._saveEmailRequirementRules = async () => {
    const positionIds = [...document.querySelectorAll('.email-rule-position:checked')]
        .map(input => Number(input.value))
        .filter(id => Number.isInteger(id) && id > 0);
    try {
        const res = await API.put('/admin/email-requirement-rules', { positionIds });
        if (!res.success) throw new Error(res.message);
        _emailRequirementRule = {
            positions: res.data?.positions || _emailRequirementRule.positions,
            requiredPositionIds: (res.data?.requiredPositionIds || positionIds).map(Number),
            isUsingDefault: !!res.data?.isUsingDefault,
        };
        showToast('บันทึกกติกาตำแหน่งที่ควรมีอีเมลแล้ว', 'success');
        renderEmailRequirementRules();
        loadPositionsList();
    } catch (err) {
        showError(err?.message || 'บันทึก Email Requirement Rules ไม่สำเร็จ');
    }
};

async function loadPatrolFlexibleSettings() {
    const body = document.getElementById('patrol-flex-body');
    const count = document.getElementById('patrol-flex-count');
    if (!body) return;
    try {
        const res = await API.get('/settings/patrol_flexible_monthly_requirement');
        const raw = res?.value;
        const n = parseInt(raw, 10);
        _patrolFlexibleSettings = {
            monthlyRequirement: Number.isInteger(n) && n >= 1 && n <= 10 ? n : 2,
            isUsingDefault: raw === null || raw === undefined || raw === '',
        };
        renderPatrolFlexibleSettings();
    } catch (err) {
        if (count) count.textContent = 'Load failed';
        body.innerHTML = `<div class="text-xs text-red-500">Cannot load legacy flexible fallback settings: ${escHtml(err?.message || err)}</div>`;
    }
}

function renderPatrolFlexibleSettings() {
    const body = document.getElementById('patrol-flex-body');
    const count = document.getElementById('patrol-flex-count');
    if (!body) return;
    const monthlyRequirement = Number(_patrolFlexibleSettings.monthlyRequirement || 2);
    if (count) count.textContent = `${monthlyRequirement} / month${_patrolFlexibleSettings.isUsingDefault ? ' (default)' : ''}`;
    body.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-4 items-end">
            <div class="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                <p class="text-xs font-bold text-slate-700">Legacy monthly requirement</p>
                <p class="text-xs text-slate-500 mt-1">Current R7 supervisor patrol uses real admin Patrol Sessions. This value is not used by the Personal green-card flow.</p>
                <p class="text-[11px] text-amber-700 mt-2">Kept for rollback/fallback compatibility. Default is 2. Saved range is 1-10.</p>
            </div>
            <div>
                <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Times per month</label>
                <div class="flex gap-2">
                    <input id="patrol-flex-monthly" type="number" min="1" max="10" step="1"
                        class="form-input w-full rounded-lg text-sm border-amber-200 focus:ring-1 focus:ring-amber-400"
                        value="${monthlyRequirement}">
                    <button type="button" onclick="window._savePatrolFlexibleSettings()"
                        class="px-4 py-2 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors">
                        Save
                    </button>
                </div>
            </div>
        </div>`;
}

window._savePatrolFlexibleSettings = async () => {
    const input = document.getElementById('patrol-flex-monthly');
    const monthlyRequirement = parseInt(input?.value, 10);
    if (!Number.isInteger(monthlyRequirement) || monthlyRequirement < 1 || monthlyRequirement > 10) {
        showToast('Legacy flexible fallback quota must be between 1 and 10.', 'error');
        return;
    }
    try {
        await API.put('/settings/patrol_flexible_monthly_requirement', { value: String(monthlyRequirement) });
        _patrolFlexibleSettings = { monthlyRequirement, isUsingDefault: false };
        renderPatrolFlexibleSettings();
        showToast('Legacy flexible fallback settings saved.', 'success');
    } catch (err) {
        showError(err?.message || 'Cannot save legacy flexible fallback settings.');
    }
};

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
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        document.getElementById('area-submit-btn')?.addEventListener('click', guardActionHandler(async () => {
            const Name      = document.getElementById('area-name')?.value.trim();
            const Code      = document.getElementById('area-code')?.value.trim();
            const SortOrder = parseInt(document.getElementById('area-sort')?.value) || 99;
            if (!Name || !Code) { showToast('กรุณาระบุชื่อและรหัสพื้นที่', 'error'); return; }
            try {
                const res = await API.post('/master/areas', { Name, Code, SortOrder });
                if (res.success) { showToast('เพิ่มพื้นที่สำเร็จ', 'success'); closeModal(); loadAreasList(); }
                else showError(res.message);
            } catch (err) { showError(err.message); }
        }));
    }, 50);
};

window.editAreaModal = (id, name, code, sort) => {
    openModal('แก้ไขพื้นที่', _areaFormHTML({ Name: name, Code: code, SortOrder: sort }), 'max-w-sm');
    setTimeout(() => {
        document.getElementById('area-submit-btn')?.addEventListener('click', guardActionHandler(async () => {
            const Name      = document.getElementById('area-name')?.value.trim();
            const Code      = document.getElementById('area-code')?.value.trim();
            const SortOrder = parseInt(document.getElementById('area-sort')?.value) || 99;
            if (!Name || !Code) { showToast('กรุณาระบุชื่อและรหัสพื้นที่', 'error'); return; }
            try {
                const res = await API.put(`/master/areas/${id}`, { Name, Code, SortOrder });
                if (res.success) { showToast('แก้ไขสำเร็จ', 'success'); closeModal(); loadAreasList(); }
                else showError(res.message);
            } catch (err) { showError(err.message); }
        }));
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
        document.getElementById('edit-master-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
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
        }));
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
async function renderRegistrationRequestsTab(container) {
    _registrationAdminState.status = 'Pending';
    _registrationAdminState.department = '';
    _registrationAdminState.dateFrom = '';
    _registrationAdminState.dateTo = '';
    _registrationAdminState.q = '';
    container.innerHTML = `
        <div class="animate-fade-in space-y-4">
            <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
                    <div>
                        <p class="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Account Registration</p>
                        <h2 class="mt-1 text-base font-black text-slate-800">คำขอสมัครบัญชีใหม่</h2>
                        <p class="mt-1 text-xs text-slate-500">ตรวจข้อมูลก่อนสร้าง Employee Master โดยบัญชีที่อนุมัติจะได้รับ Role User เท่านั้น</p>
                    </div>
                    <button type="button" onclick="window._registrationReload()" class="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">รีเฟรช</button>
                </div>
                <div id="registration-summary" class="grid grid-cols-2 lg:grid-cols-5 gap-2 mt-4"></div>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[150px,190px,150px,150px,minmax(200px,1fr),auto] gap-2 mt-4">
                    <select id="registration-status-filter" class="form-input rounded-lg text-sm" onchange="window._registrationFilterStatus(this.value)">
                        ${['Pending','Approved','Rejected','Cancelled','all'].map(value => `<option value="${value}" ${value==='Pending'?'selected':''}>${value==='all'?'ทุกสถานะ':value}</option>`).join('')}
                    </select>
                    <select id="registration-dept-filter" class="form-input rounded-lg text-sm" onchange="window._registrationFilterDepartment(this.value)">
                        <option value="">ทุกแผนก</option>
                    </select>
                    <input id="registration-date-from" type="date" class="form-input rounded-lg text-sm" onchange="window._registrationFilterDate(this.value,document.getElementById('registration-date-to').value)">
                    <input id="registration-date-to" type="date" class="form-input rounded-lg text-sm" onchange="window._registrationFilterDate(document.getElementById('registration-date-from').value,this.value)">
                    <input id="registration-search" class="form-input rounded-lg text-sm" placeholder="ค้นหารหัส ชื่อ เลขอ้างอิง หรืออีเมล" onkeydown="if(event.key==='Enter')window._registrationSearch(this.value)">
                    <div class="flex gap-1"><button type="button" onclick="window._registrationSearch(document.getElementById('registration-search').value)" class="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">ค้นหา</button>
                    <button type="button" onclick="window._registrationExportExcel()" class="px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-xs font-bold">Excel</button></div>
                </div>
            </section>
            <section class="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div id="registration-request-table">${_skelRows(5, 5)}</div>
            </section>
        </div>`;

    window._registrationReload = () => _loadRegistrationRequests();
    window._registrationFilterStatus = value => {
        _registrationAdminState.status = value || 'all';
        _loadRegistrationRequests();
    };
    window._registrationFilterDepartment = value => {
        _registrationAdminState.department = value || '';
        _loadRegistrationRequests();
    };
    window._registrationFilterDate = (from,to) => {
        _registrationAdminState.dateFrom = from || '';
        _registrationAdminState.dateTo = to || '';
        _loadRegistrationRequests();
    };
    window._registrationExportExcel = () => {
        if (!window.XLSX) { showError('ไม่พบ SheetJS library'); return; }
        const rows = (_registrationAdminState.rows || []).map(row => ({
            ReferenceCode: row.ReferenceCode, EmployeeID: row.EmployeeID, EmployeeName: row.EmployeeName,
            Department: row.Department, Unit: row.Unit, Position: row.Position, CompanyEmail: row.CompanyEmail,
            Status: row.Status, RejectionReason: row.RejectionReason, SubmittedAt: row.SubmittedAt,
            ReviewedAt: row.ReviewedAt, ReviewedBy: row.ReviewedBy,
            StatusViewedAt: row.StatusViewedAt, StatusViewCount: Number(row.StatusViewCount || 0),
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Registration');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([_registrationAdminState.summary || {}]), 'Summary');
        XLSX.writeFile(wb, `Registration_Audit_${new Date().toISOString().slice(0,10)}.xlsx`);
    };
    window._registrationSearch = value => {
        _registrationAdminState.q = String(value || '').trim();
        _loadRegistrationRequests();
    };
    window._registrationApprove = async (id, btn) => {
        if (!confirm('อนุมัติคำขอนี้และสร้างบัญชี Employee Role User ใช่หรือไม่?')) return;
        const original = _btnLoad(btn, 'กำลังอนุมัติ...');
        try {
            const response = await API.post(`/admin/registration-requests/${id}/approve`, {});
            showToast(response.message || 'อนุมัติคำขอแล้ว', 'success');
            await _loadRegistrationRequests();
        } catch (error) {
            showError(error.message || 'ไม่สามารถอนุมัติคำขอได้');
        } finally {
            _btnRestore(btn, original);
        }
    };
    window._registrationReject = async (id, btn) => {
        const reason = prompt('ระบุเหตุผลที่ปฏิเสธ (อย่างน้อย 3 ตัวอักษร)');
        if (reason === null) return;
        if (reason.trim().length < 3) return showError('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร');
        const original = _btnLoad(btn, 'กำลังปฏิเสธ...');
        try {
            const response = await API.post(`/admin/registration-requests/${id}/reject`, { reason: reason.trim() });
            showToast(response.message || 'ปฏิเสธคำขอแล้ว', 'success');
            await _loadRegistrationRequests();
        } catch (error) {
            showError(error.message || 'ไม่สามารถปฏิเสธคำขอได้');
        } finally {
            _btnRestore(btn, original);
        }
    };
    await _loadRegistrationRequests();
}

async function _loadRegistrationRequests() {
    const generation = ++_registrationLoadGeneration;
    const table = document.getElementById('registration-request-table');
    if (!table) return;
    table.innerHTML = _skelRows(5, 5);
    const query = new URLSearchParams({ status: _registrationAdminState.status || 'all' });
    if (_registrationAdminState.department) query.set('department', _registrationAdminState.department);
    if (_registrationAdminState.dateFrom) query.set('dateFrom', _registrationAdminState.dateFrom);
    if (_registrationAdminState.dateTo) query.set('dateTo', _registrationAdminState.dateTo);
    if (_registrationAdminState.q) query.set('q', _registrationAdminState.q);
    try {
        const response = await API.get(`/admin/registration-requests?${query}`);
        if (generation !== _registrationLoadGeneration) return;
        _registrationAdminState.rows = response.data || [];
        _registrationAdminState.summary = response.summary || {};
        _renderRegistrationSummary();
        _renderRegistrationDepartmentFilter();
        _renderRegistrationRows();
    } catch (error) {
        if (generation !== _registrationLoadGeneration) return;
        table.innerHTML = `<div class="p-8 text-center text-sm text-red-600">${escHtml(error.message || 'ไม่สามารถโหลดคำขอสมัครได้')}</div>`;
    }
}

function _renderRegistrationSummary() {
    const el = document.getElementById('registration-summary');
    if (!el) return;
    const summary = _registrationAdminState.summary || {};
    const items = [
        ['ทั้งหมด', summary.total, 'text-slate-800'],
        ['รอตรวจสอบ', summary.pending, 'text-amber-600'],
        ['อนุมัติ', summary.approved, 'text-emerald-600'],
        ['ปฏิเสธ', summary.rejected, 'text-rose-600'],
        ['ยกเลิก', summary.cancelled, 'text-slate-500'],
        ['ค้างเกิน 3 วัน', summary.stalePending, 'text-orange-600'],
        ['อนุมัติเฉลี่ย (ชม.)', summary.averageReviewHours, 'text-blue-600'],
        ['Master ไม่ครบ', summary.incompleteMaster, 'text-violet-600'],
        ['คำขอใหม่ 24 ชม.', summary.newLast24h, 'text-cyan-600'],
        ['Failed attempts 24 ชม.', summary.failedAttempts24h, 'text-red-600'],
    ];
    el.innerHTML = items.map(([label,value,color]) => `
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p class="text-lg font-black ${color}">${Number(value)||0}</p>
            <p class="text-[10px] text-slate-500">${label}</p>
        </div>`).join('');
}

function _renderRegistrationDepartmentFilter() {
    const select = document.getElementById('registration-dept-filter');
    if (!select) return;
    const selected = _registrationAdminState.department;
    const departments = [...new Set(_registrationAdminState.rows.map(row => String(row.Department || '').trim()).filter(Boolean))].sort();
    if (selected && !departments.includes(selected)) departments.unshift(selected);
    select.innerHTML = `<option value="">ทุกแผนก</option>${departments.map(dept => `<option value="${escHtml(dept)}" ${dept===selected?'selected':''}>${escHtml(dept)}</option>`).join('')}`;
}

function _renderRegistrationRows() {
    const el = document.getElementById('registration-request-table');
    if (!el) return;
    const rows = _registrationAdminState.rows || [];
    if (!rows.length) {
        el.innerHTML = `<div class="p-10 text-center text-sm text-slate-400">ไม่พบคำขอสมัครตามตัวกรอง</div>`;
        return;
    }
    const statusClass = status => ({
        Pending: 'bg-amber-50 text-amber-700 border-amber-200',
        Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
        Cancelled: 'bg-slate-50 text-slate-600 border-slate-200',
    }[status] || 'bg-slate-50 text-slate-600 border-slate-200');
    el.innerHTML = `<div class="overflow-x-auto"><table class="w-full text-xs">
        <thead><tr class="text-left text-slate-500 border-b bg-slate-50">
            <th class="p-3">ผู้สมัคร</th><th class="p-3">หน่วยงาน</th><th class="p-3">CompanyEmail</th>
            <th class="p-3">สถานะ</th><th class="p-3">วันที่ส่ง</th><th class="p-3 text-right">ดำเนินการ</th>
        </tr></thead>
        <tbody>${rows.map(row => `<tr class="border-b border-slate-100 align-top">
            <td class="p-3"><p class="font-bold text-slate-800">${escHtml(row.EmployeeName||'-')}</p><p class="text-slate-500">${escHtml(row.EmployeeID||'-')} · ${escHtml(row.ReferenceCode||'-')}</p></td>
            <td class="p-3"><p>${escHtml(row.Department||'-')}</p><p class="text-slate-500">${escHtml(row.Unit||'-')} · ${escHtml(row.Position||'-')}</p></td>
            <td class="p-3">${escHtml(row.CompanyEmail||'ไม่ระบุ')}</td>
            <td class="p-3"><span class="inline-flex px-2 py-1 rounded-full border font-bold ${statusClass(row.Status)}">${escHtml(row.Status||'-')}</span>${row.RejectionReason?`<p class="mt-1 text-rose-600">${escHtml(row.RejectionReason)}</p>`:''}
                ${Number(row.StatusViewCount||0)>0
                    ? `<p class="mt-1 text-emerald-600">ผู้สมัครดูผลแล้ว ${Number(row.StatusViewCount)} ครั้ง</p>`
                    : `<p class="mt-1 text-slate-400">ยังไม่เปิดดูสถานะ</p>`}
            </td>
            <td class="p-3 text-slate-500">${row.SubmittedAt?new Date(row.SubmittedAt).toLocaleString('th-TH'):'-'}</td>
            <td class="p-3 text-right">${row.Status==='Pending'?`<div class="flex justify-end gap-1">
                <button type="button" onclick="window._registrationApprove(${Number(row.ID)},this)" class="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold">อนุมัติ</button>
                <button type="button" onclick="window._registrationReject(${Number(row.ID)},this)" class="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 font-bold">ปฏิเสธ</button>
            </div>`:`<span class="text-slate-400">${escHtml(row.ReviewedBy||'-')}</span>`}</td>
        </tr>`).join('')}</tbody>
    </table></div>`;
}

const EMP_COMPANY_EMAIL_DOMAIN = '@thaisummit-harness.co.th';

function _normalizeEmpCompanyEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function _validateEmpCompanyEmail(body) {
    const email = _normalizeEmpCompanyEmail(body.CompanyEmail);
    body.CompanyEmail = email;
    if (!email) return true;
    const ok = /^[^\s@]+@thaisummit-harness\.co\.th$/i.test(email);
    if (!ok) showError(`Company Email ต้องลงท้ายด้วย ${EMP_COMPANY_EMAIL_DOMAIN}`);
    return ok;
}

async function renderEmployeesTab(container) {
    _empPage = 1; _empSearch = '';
    _empDeptFilter = 'all';
    _empUnitFilter = 'all';
    _empSafetyUnitFilter = 'all';
    _empEmailReviewSearch = '';
    _empEmailReviewDept = 'all';
    _empEmailReviewPosition = 'all';
    _empEmailReviewStatus = 'all';
    container.innerHTML = `
    <div class="animate-fade-in space-y-5">
        <div id="emp-email-readiness"></div>
        <section class="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div class="p-4 border-b border-slate-100">
                <div class="flex flex-col gap-1 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p class="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Employee Master</p>
                        <h3 class="mt-1 text-sm font-bold text-slate-800">ข้อมูลพนักงานทั้งหมด</h3>
                        <p class="mt-1 text-xs text-slate-500">ใช้เพิ่ม แก้ไข นำเข้า และส่งออกข้อมูลพนักงานหลักของระบบ</p>
                    </div>
                    <div id="emp-toolbar-summary" class="flex flex-wrap gap-2 text-[11px] text-slate-500"></div>
                </div>
                <div class="ds-filter-bar mt-4 flex flex-col xl:flex-row gap-3 items-stretch xl:items-center justify-between">
                    <div class="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr),200px,180px,210px,auto] gap-2 flex-1 w-full">
                        <input type="text" id="emp-search-input" placeholder="ค้นหาชื่อ / รหัส / หน่วยงาน..."
                            class="form-input w-full rounded-lg text-sm border-slate-200"
                            oninput="window._empSearch(this.value)">
                        <select id="emp-dept-filter" class="form-input w-full rounded-lg text-sm border-slate-200"
                            onchange="window._empDepartmentFilter(this.value)">
                            <option value="all">ทุกแผนก</option>
                        </select>
                        <select id="emp-unit-filter" class="form-input w-full rounded-lg text-sm border-slate-200"
                            onchange="window._empUnitFilterChange(this.value)">
                            <option value="all">ทุก Unit</option>
                        </select>
                        <select id="emp-safety-unit-filter" class="form-input w-full rounded-lg text-sm border-slate-200"
                            onchange="window._empSafetyUnitFilterChange(this.value)">
                            <option value="all">ทุกสถานะ Safety Unit</option>
                            <option value="missing">ยังไม่ระบุ Safety Unit</option>
                        </select>
                        <button type="button" onclick="window._empClearFilters()"
                            class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50">
                            ล้างตัวกรอง
                        </button>
                    </div>
                    <div class="flex gap-2 flex-wrap xl:justify-end">
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
            </div>
            <div class="ds-table-wrap border-0 rounded-none">
                <div id="emp-table-wrap">
                    <div class="py-16 text-center text-slate-400 text-sm">กำลังโหลด...</div>
                </div>
            </div>
        </section>
        <div id="emp-pagination" class="flex justify-between items-center"></div>
    </div>`;

    window._empSearch = (q) => { _empSearch = q.toLowerCase(); _empPage = 1; _renderEmpTable(); };
    window._empDepartmentFilter = (dept) => {
        _empDeptFilter = dept || 'all';
        _empUnitFilter = 'all';
        _empPage = 1;
        _renderEmpFilterControls();
        _renderEmpTable();
    };
    window._empUnitFilterChange = (unit) => {
        _empUnitFilter = unit || 'all';
        _empPage = 1;
        _renderEmpTable();
    };
    window._empSafetyUnitFilterChange = (status) => {
        _empSafetyUnitFilter = status || 'all';
        _empPage = 1;
        _renderEmpTable();
    };
    window._empClearFilters = () => {
        _empSearch = '';
        _empDeptFilter = 'all';
        _empUnitFilter = 'all';
        _empSafetyUnitFilter = 'all';
        _empPage = 1;
        const search = document.getElementById('emp-search-input');
        if (search) search.value = '';
        _renderEmpFilterControls();
        _renderEmpTable();
    };

    const [empsRes, deptsRes, posRes, unitsRes, emailReadinessRes] = await Promise.all([
        API.get('/employees').catch(() => ({ data: [] })),
        API.get('/master/departments').catch(() => ({ data: [] })),
        API.get('/master/positions').catch(() => ({ data: [] })),
        API.get('/admin/org/units').catch(() => ({ data: [] })),
        API.get('/admin/email-readiness').catch(() => ({ data: { summary: {}, rows: [], rule: {} } })),
    ]);
    _empCache  = empsRes?.data   || [];
    _deptCache = deptsRes?.data  || [];
    _posCache  = posRes?.data    || [];
    _unitCache = unitsRes?.data  || [];
    _empEmailReadiness = emailReadinessRes?.data || { summary: {}, rows: [], rule: {} };
    _syncEmpEmailReadinessRows();
    _renderEmpFilterControls();
    _renderEmpTable();
}

function _syncEmpEmailReadinessRows() {
    const readinessMap = new Map((_empEmailReadiness.rows || []).map(row => [String(row.EmployeeID), row]));
    _empCache = _empCache.map(emp => {
        const readiness = readinessMap.get(String(emp.EmployeeID));
        return readiness ? { ...emp, ...readiness } : emp;
    });
}

async function _reloadEmpEmailReadiness() {
    const res = await API.get('/admin/email-readiness').catch(() => ({ data: { summary: {}, rows: [], rule: {} } }));
    _empEmailReadiness = res?.data || { summary: {}, rows: [], rule: {} };
    _syncEmpEmailReadinessRows();
}

function _empEmailStatusMeta(emp) {
    const status = emp.EmailReadinessStatus || ((emp.CompanyEmail || '').trim() ? 'ready' : 'optional');
    if (status === 'missing_required') return { label: 'ยังไม่มีอีเมลที่จำเป็น', className: 'is-pending' };
    if (status === 'invalid_domain') return { label: 'โดเมนอีเมลไม่ถูกต้อง', className: 'is-failed' };
    if (status === 'ready') return { label: emp.IsEmailRequired ? 'พร้อมใช้งาน' : 'มีอีเมลแล้ว', className: 'is-approved' };
    return { label: 'ไม่บังคับ', className: '' };
}

function _renderEmpEmailReadiness() {
    const el = document.getElementById('emp-email-readiness');
    if (!el) return;
    const summary = _empEmailReadiness.summary || {};
    const rows = _empEmailReadiness.rows || [];
    const missing = rows.filter(row => row.EmailReadinessStatus === 'missing_required');
    const invalid = rows.filter(row => row.EmailReadinessStatus === 'invalid_domain');
    const attention = [...missing, ...invalid];
    const departments = [...new Set(attention.map(row => (row.Department || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    const positions = [...new Set(attention.map(row => (row.Position || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    const reviewSearch = _empEmailReviewSearch.trim().toLowerCase();
    const filteredAttention = attention.filter(row => {
        const statusMatch = _empEmailReviewStatus === 'all' || row.EmailReadinessStatus === _empEmailReviewStatus;
        const deptMatch = _empEmailReviewDept === 'all' || (row.Department || '') === _empEmailReviewDept;
        const positionMatch = _empEmailReviewPosition === 'all' || (row.Position || '') === _empEmailReviewPosition;
        const searchText = [
            row.EmployeeID,
            row.EmployeeName,
            row.Department,
            row.Unit,
            row.Position,
            row.CompanyEmail,
        ].filter(Boolean).join(' ').toLowerCase();
        return statusMatch && deptMatch && positionMatch && (!reviewSearch || searchText.includes(reviewSearch));
    });
    const requiredEmployees = Number(summary.requiredEmployees || 0);
    const readyRequired = Number(summary.readyRequired || 0);
    const readinessPct = requiredEmployees ? Math.round(readyRequired / requiredEmployees * 100) : 100;
    const positionCount = (_empEmailReadiness.rule?.requiredPositions || []).length;
    el.innerHTML = `
        <section class="rounded-xl border border-emerald-100 bg-white overflow-hidden">
            <div class="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                    <p class="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Email Readiness</p>
                    <h3 class="text-sm font-bold text-slate-800 mt-1">ความพร้อมอีเมลของตำแหน่งที่ต้องติดตาม</h3>
                    <p class="text-xs text-slate-500 mt-1">อิงจาก Employee Master และ Email Requirement Rules ${positionCount ? `จำนวน ${positionCount} ตำแหน่ง` : ''}</p>
                </div>
                <button type="button" onclick="window._adminTab('reference')"
                    class="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">
                    จัดการกติกาตำแหน่ง
                </button>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-slate-50/70">
                ${metricCard('Readiness', `${readinessPct}%`, `${readyRequired}/${requiredEmployees || 0} พร้อมใช้งาน`)}
                ${metricCard('Required Employees', requiredEmployees, 'พนักงานตามตำแหน่งที่เลือก')}
                ${metricCard('Missing Email', Number(summary.missingRequired || 0), 'ตำแหน่งที่ควรมีแต่ยังว่าง')}
                ${metricCard('Invalid Domain', Number(summary.invalidDomain || 0), 'ข้อมูลเดิมที่ต้องแก้')}
            </div>
            <div class="p-4">
                ${attention.length ? `
                    <div class="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,220px)_minmax(180px,220px)_minmax(170px,190px)_auto] mb-3">
                        <input type="search" value="${escHtml(_empEmailReviewSearch)}"
                            placeholder="ค้นหาชื่อ รหัส หน่วยงาน ตำแหน่ง..."
                            oninput="window._empEmailReviewSearchChange(this.value)"
                            class="form-input w-full rounded-lg text-xs border-slate-200">
                        <select onchange="window._empEmailReviewDepartmentChange(this.value)"
                            class="form-input w-full rounded-lg text-xs border-slate-200">
                            <option value="all">ทุกหน่วยงาน</option>
                            ${departments.map(dept => `<option value="${escHtml(dept)}" ${dept === _empEmailReviewDept ? 'selected' : ''}>${escHtml(dept)}</option>`).join('')}
                        </select>
                        <select onchange="window._empEmailReviewPositionChange(this.value)"
                            class="form-input w-full rounded-lg text-xs border-slate-200">
                            <option value="all">ทุกตำแหน่ง</option>
                            ${positions.map(position => `<option value="${escHtml(position)}" ${position === _empEmailReviewPosition ? 'selected' : ''}>${escHtml(position)}</option>`).join('')}
                        </select>
                        <select onchange="window._empEmailReviewStatusChange(this.value)"
                            class="form-input w-full rounded-lg text-xs border-slate-200">
                            <option value="all" ${_empEmailReviewStatus === 'all' ? 'selected' : ''}>ทุกสถานะ</option>
                            <option value="missing_required" ${_empEmailReviewStatus === 'missing_required' ? 'selected' : ''}>ยังไม่มีอีเมล</option>
                            <option value="invalid_domain" ${_empEmailReviewStatus === 'invalid_domain' ? 'selected' : ''}>โดเมนไม่ถูกต้อง</option>
                        </select>
                        <button type="button" onclick="window._clearEmpEmailReviewFilters()"
                            class="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">
                            ล้างตัวกรอง
                        </button>
                    </div>
                    <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-2 text-[11px] text-slate-500">
                        <p>คิวติดตามอีเมลตำแหน่งที่กำหนด</p>
                        <p>แสดง ${filteredAttention.length.toLocaleString()} จาก ${attention.length.toLocaleString()} รายการที่ต้องตรวจสอบ</p>
                    </div>
                    <div class="overflow-auto max-h-[32rem] rounded-lg border border-slate-200">
                        <table class="w-full text-left text-xs">
                            <thead class="bg-slate-50 text-slate-400 uppercase">
                                <tr>
                                    <th class="px-3 py-2 font-bold">พนักงาน</th>
                                    <th class="px-3 py-2 font-bold">ตำแหน่ง</th>
                                    <th class="px-3 py-2 font-bold">หน่วยงาน</th>
                                    <th class="px-3 py-2 font-bold">สถานะ</th>
                                    <th class="px-3 py-2 font-bold text-right">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${filteredAttention.map(row => `
                                    <tr>
                                        <td class="px-3 py-2">
                                            <p class="font-semibold text-slate-700">${escHtml(row.EmployeeName || '—')}</p>
                                            <p class="font-mono text-[10px] text-slate-400">${escHtml(row.EmployeeID || '')}</p>
                                        </td>
                                        <td class="px-3 py-2 text-slate-600">${escHtml(row.Position || '—')}</td>
                                        <td class="px-3 py-2 text-slate-600">${escHtml(row.Department || '—')}</td>
                                        <td class="px-3 py-2">${dsStatusBadge(_empEmailStatusMeta(row).label, { className: _empEmailStatusMeta(row).className })}</td>
                                        <td class="px-3 py-2 text-right">
                                            <button type="button" onclick="window._openEditEmpModal('${escHtml(String(row.EmployeeID || ''))}')"
                                                class="px-2.5 py-1.5 rounded-md border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50">
                                                แก้ไข
                                            </button>
                                        </td>
                                    </tr>`).join('') || `
                                    <tr>
                                        <td colspan="5" class="px-3 py-8 text-center text-slate-400">
                                            ไม่พบรายการตามตัวกรองที่เลือก
                                        </td>
                                    </tr>`}
                            </tbody>
                        </table>
                    </div>
                ` : `<div class="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">ตำแหน่งที่กำหนดไว้พร้อมใช้อีเมลแล้ว</div>`}
            </div>
        </section>`;
}

window._empEmailReviewSearchChange = (value) => {
    _empEmailReviewSearch = value || '';
    _renderEmpEmailReadiness();
};
window._empEmailReviewDepartmentChange = (value) => {
    _empEmailReviewDept = value || 'all';
    _renderEmpEmailReadiness();
};
window._empEmailReviewPositionChange = (value) => {
    _empEmailReviewPosition = value || 'all';
    _renderEmpEmailReadiness();
};
window._empEmailReviewStatusChange = (value) => {
    _empEmailReviewStatus = value || 'all';
    _renderEmpEmailReadiness();
};
window._clearEmpEmailReviewFilters = () => {
    _empEmailReviewSearch = '';
    _empEmailReviewDept = 'all';
    _empEmailReviewPosition = 'all';
    _empEmailReviewStatus = 'all';
    _renderEmpEmailReadiness();
};

function _empUniqueValues(field, rows = _empCache) {
    return [...new Set((rows || []).map(row => String(row[field] || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'th'));
}

function _empAllUnitNamesForScope(deptName = 'all') {
    const masterUnits = (deptName && deptName !== 'all')
        ? _empUnitsForDept(deptName).map(unit => unit.name)
        : (_unitCache || []).map(unit => unit.name);
    const employeeUnits = (_empCache || [])
        .filter(row => deptName === 'all' || String(row.Department || '').trim() === deptName)
        .map(row => row.Unit);
    return [...new Set([...masterUnits, ...employeeUnits]
        .map(unit => String(unit || '').trim())
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'th'));
}

function _empDeptByName(deptName) {
    const name = String(deptName || '').trim();
    if (!name) return null;
    return (_deptCache || []).find(dept => String(dept.Name || '').trim() === name) || null;
}

function _empUnitsForDept(deptName) {
    const dept = _empDeptByName(deptName);
    if (!dept) return [];
    return (_unitCache || [])
        .filter(unit => Number(unit.department_id) === Number(dept.id))
        .filter(unit => String(unit.name || '').trim())
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
}

function _empMissingSafetyUnit(emp) {
    return _empUnitsForDept(emp?.Department).length > 0 && !String(emp?.Unit || '').trim();
}

function _empUnitCellHtml(emp) {
    if (!_empMissingSafetyUnit(emp)) {
        return emp?.Unit ? escHtml(emp.Unit) : '&mdash;';
    }
    const empId = _adminInlineArg(emp?.EmployeeID);
    const unitCount = _empUnitsForDept(emp?.Department).length;
    return `
        <div class="flex flex-col gap-1">
            <span class="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">ยังไม่ระบุ Safety Unit</span>
            <button type="button" onclick="window._openEditEmpModal(${empId})"
                class="w-fit rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100">
                ตั้งค่า Unit
            </button>
            <span class="text-[10px] text-slate-400">มี ${unitCount} Unit ในแผนกนี้</span>
        </div>`;
}

function _renderEmpFilterControls() {
    const deptSel = document.getElementById('emp-dept-filter');
    const unitSel = document.getElementById('emp-unit-filter');
    const safetyUnitSel = document.getElementById('emp-safety-unit-filter');
    if (deptSel) {
        const depts = _empUniqueValues('Department');
        deptSel.innerHTML = `<option value="all">ทุกแผนก</option>${depts.map(dept => `<option value="${escHtml(dept)}" ${_empDeptFilter === dept ? 'selected' : ''}>${escHtml(dept)}</option>`).join('')}`;
        deptSel.value = _empDeptFilter;
    }
    if (unitSel) {
        const units = _empAllUnitNamesForScope(_empDeptFilter);
        unitSel.innerHTML = `<option value="all">ทุก Unit</option>${units.map(unit => `<option value="${escHtml(unit)}" ${_empUnitFilter === unit ? 'selected' : ''}>${escHtml(unit)}</option>`).join('')}`;
        unitSel.value = units.includes(_empUnitFilter) ? _empUnitFilter : 'all';
        _empUnitFilter = unitSel.value;
        unitSel.disabled = !units.length;
    }
    if (safetyUnitSel) {
        safetyUnitSel.value = _empSafetyUnitFilter;
    }
}

function _empFilteredRows() {
    return _empCache.filter(e => {
        const textMatch = !_empSearch ||
            (e.EmployeeName||'').toLowerCase().includes(_empSearch) ||
            (e.EmployeeID  ||'').toLowerCase().includes(_empSearch) ||
            (e.Department  ||'').toLowerCase().includes(_empSearch) ||
            (e.Unit        ||'').toLowerCase().includes(_empSearch) ||
            (e.CompanyEmail ||'').toLowerCase().includes(_empSearch) ||
            (e.Position    ||'').toLowerCase().includes(_empSearch);
        const deptMatch = _empDeptFilter === 'all' || String(e.Department || '').trim() === _empDeptFilter;
        const unitMatch = _empUnitFilter === 'all' || String(e.Unit || '').trim() === _empUnitFilter;
        const safetyUnitMatch = _empSafetyUnitFilter !== 'missing' || _empMissingSafetyUnit(e);
        return textMatch && deptMatch && unitMatch && safetyUnitMatch;
    });
}

function _renderEmpTable() {
    const wrap   = document.getElementById('emp-table-wrap');
    const pagEl  = document.getElementById('emp-pagination');
    if (!wrap) return;
    _renderEmpEmailReadiness();

    const filtered = _empFilteredRows();
    const toolbarSummary = document.getElementById('emp-toolbar-summary');
    if (toolbarSummary) {
        const adminCount = _empCache.filter(e => String(e.Role || '').toLowerCase() === 'admin').length;
        const missingCore = _empCache.filter(e => !(e.Department || '').trim() || !(e.Position || '').trim()).length;
        const emailIssues = _empCache.filter(e => ['missing_required', 'invalid_domain'].includes(e.EmailReadinessStatus)).length;
        const missingSafetyUnits = _empCache.filter(_empMissingSafetyUnit).length;
        toolbarSummary.innerHTML = [
            ['พนักงาน', _empCache.length.toLocaleString()],
            ['ตามตัวกรอง', filtered.length.toLocaleString()],
            ['ยังไม่มี Unit', missingSafetyUnits.toLocaleString()],
            ['ตรวจอีเมล', emailIssues.toLocaleString()],
            ['Admin', adminCount.toLocaleString()],
            ['ข้อมูลไม่ครบ', missingCore.toLocaleString()],
        ].map(([label, value]) => `
            <span class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                <strong class="text-slate-700">${value}</strong>${label}
            </span>
        `).join('');
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
    <table class="ds-table min-w-[1200px] text-sm">
        <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-left">
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">รหัส</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">ชื่อ-นามสกุล</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">หน่วยงาน</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">ตำแหน่ง</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Unit</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Company Email</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Email Readiness</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Role</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-right">จัดการ</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
            ${paged.map(emp => `
            <tr class="hover:bg-slate-50 transition-colors group">
                <td class="px-4 py-3 font-mono text-xs text-slate-500">${escHtml(emp.EmployeeID)}</td>
                <td class="px-4 py-3 font-semibold text-slate-800 text-sm">${escHtml(emp.EmployeeName||'—')}</td>
                <td class="px-4 py-3 text-slate-600 text-xs">${escHtml(emp.Department||'—')}</td>
                <td class="px-4 py-3 text-slate-600 text-xs">${escHtml(emp.Position||'—')}</td>
                <td class="px-4 py-3 text-slate-600 text-xs">${_empUnitCellHtml(emp)}</td>
                <td class="px-4 py-3 text-slate-600 text-xs">${emp.CompanyEmail ? `<span class="font-mono">${escHtml(emp.CompanyEmail)}</span>` : '<span class="text-slate-300">Optional</span>'}</td>
                <td class="px-4 py-3">${dsStatusBadge(_empEmailStatusMeta(emp).label, { className: _empEmailStatusMeta(emp).className })}</td>
                <td class="px-4 py-3">${roleBadge(emp.Role)}</td>
                <td class="px-4 py-3 text-right">
                    <div class="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="window._openEditEmpModal(${_adminInlineArg(emp.EmployeeID)})" title="แก้ไข"
                            class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button onclick="window._openResetPwModal(${_adminInlineArg(emp.EmployeeID)},${_adminInlineArg(emp.EmployeeName)})" title="รีเซ็ตรหัสผ่าน"
                            class="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
                        </button>
                        <button onclick="window._deleteEmployee(${_adminInlineArg(emp.EmployeeID)},${_adminInlineArg(emp.EmployeeName)})" title="ลบ"
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
    const data = _empFilteredRows().map(e => ({
        'รหัสพนักงาน': e.EmployeeID,
        'ชื่อ-นามสกุล': e.EmployeeName,
        'หน่วยงาน':    e.Department,
        'Unit':        e.Unit,
        'SafetyUnitStatus': _empMissingSafetyUnit(e) ? 'ยังไม่ระบุ Safety Unit' : (String(e.Unit || '').trim() ? 'ระบุแล้ว' : 'ไม่บังคับ'),
        'SafetyUnitOptions': _empUnitsForDept(e.Department).map(unit => unit.name).join(' | '),
        'ตำแหน่ง':     e.Position,
        'CompanyEmail': e.CompanyEmail || '',
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
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div class="sm:col-span-2">
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Company Email</label>
            <input type="email" name="CompanyEmail" class="form-input w-full rounded-lg text-sm"
                value="${emp.CompanyEmail || ''}" placeholder="name@thaisummit-harness.co.th" autocomplete="email">
            <p class="mt-1 text-[11px] text-slate-400">
                เว้นว่างได้ หากกรอกต้องใช้อีเมลบริษัทที่ลงท้ายด้วย ${EMP_COMPANY_EMAIL_DOMAIN}
            </p>
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
        document.getElementById('emp-add-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(e.target).entries());
            if (!_validateEmpCompanyEmail(body)) return;
            try {
                await API.post('/admin/employee/create', body);
                showToast('เพิ่มพนักงานสำเร็จ', 'success');
                closeModal();
                const res = await API.get('/employees').catch(() => ({ data: [] }));
                _empCache = res?.data || [];
                await _reloadEmpEmailReadiness();
                _renderEmpTable();
            } catch (err) { showError(err?.message || 'ไม่สามารถเพิ่มพนักงานได้'); }
        }));
    }, 50);
};

window._openEditEmpModal = (empId) => {
    const emp = _empCache.find(e => e.EmployeeID === empId);
    if (!emp) return;
    openModal(`แก้ไขพนักงาน: ${escHtml(emp.EmployeeName)}`, `
        <form id="emp-edit-form" class="space-y-4">
            ${_empFormFields(emp)}
            <div class="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button type="submit" class="btn bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium">บันทึก</button>
            </div>
        </form>`, 'max-w-lg');
    setTimeout(() => {
        document.getElementById('emp-edit-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(e.target).entries());
            if (!_validateEmpCompanyEmail(body)) return;
            try {
                await API.put(`/admin/employee/${empId}`, body);
                showToast('อัปเดตข้อมูลสำเร็จ', 'success');
                closeModal();
                const idx = _empCache.findIndex(e => e.EmployeeID === empId);
                if (idx !== -1) _empCache[idx] = { ..._empCache[idx], ...body };
                await _reloadEmpEmailReadiness();
                _renderEmpTable();
            } catch (err) { showError(err?.message || 'ไม่สามารถอัปเดตข้อมูลได้'); }
        }));
    }, 50);
};

window._openResetPwModal = (empId, empName) => {
    openModal(`รีเซ็ตรหัสผ่าน: ${escHtml(empName)}`, `
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
        document.getElementById('reset-pw-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
            e.preventDefault();
            if (pw?.value !== confirm?.value) { showToast('รหัสผ่านไม่ตรงกัน', 'error'); return; }
            if (String(pw?.value || '').length < 4) { showToast('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร', 'error'); return; }
            const submitBtn = e.submitter || e.target.querySelector('button[type="submit"]');
            const original = _btnLoad(submitBtn, 'กำลังรีเซ็ต...');
            try {
                await API.post(`/admin/employee/${empId}/reset-password`, { newPassword: pw.value });
                showToast(`รีเซ็ตรหัสผ่านของ ${empName} สำเร็จ`, 'success');
                closeModal();
            } catch (err) {
                showError(err?.message || 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
            } finally {
                _btnRestore(submitBtn, original);
            }
        }));
    }, 50);
};

window._deleteEmployee = async (empId, empName) => {
    openModal('ยืนยันการลบ', `
            <div class="space-y-4">
                <div class="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p class="font-bold text-red-700 text-sm mb-1">กำลังจะลบพนักงานต่อไปนี้</p>
                    <p class="text-sm text-slate-700"><strong>${escHtml(empName)}</strong> <span class="font-mono text-xs text-slate-500">(${escHtml(empId)})</span></p>
                    <p class="text-xs text-red-600 mt-2">ข้อมูลทั้งหมดที่เชื่อมกับพนักงานคนนี้อาจได้รับผลกระทบ</p>
                </div>
                <div class="flex justify-end gap-2">
                    <button onclick="window.closeModal&&window.closeModal()" class="btn bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm">ยกเลิก</button>
                    <button id="confirm-delete-emp-btn" class="btn bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg text-sm font-medium">ลบข้อมูล</button>
                </div>
            </div>`, 'max-w-sm');
    setTimeout(() => {
        document.getElementById('confirm-delete-emp-btn')?.addEventListener('click', guardActionHandler(async () => {
            try {
                await API.delete(`/admin/employee/${empId}`);
                showToast('ลบข้อมูลสำเร็จ', 'success');
                closeModal();
                _empCache = _empCache.filter(e => e.EmployeeID !== empId);
                _renderEmpTable();
            } catch (err) { showError(err?.message || 'ลบไม่สำเร็จ'); }
        }));
    }, 50);
};

window._openImportModal = () => {
    openModal('Import พนักงานจาก Excel', `
        <div class="space-y-4">
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <p class="font-bold mb-1">คอลัมน์ที่รองรับ:</p>
                <code class="block bg-amber-100 px-2 py-1 rounded">EmployeeID, EmployeeName, Department, Unit, Position, Team, CompanyEmail, Role</code>
                <p class="mt-1">CompanyEmail เว้นว่างได้ หากกรอกต้องใช้อีเมลบริษัทที่ลงท้ายด้วย ${EMP_COMPANY_EMAIL_DOMAIN}</p>
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
        fd.append('rows', JSON.stringify(data));
        fd.append('rowsBase64', btoa(unescape(encodeURIComponent(JSON.stringify(data)))));
        const res = await API.post('/admin/employee/import', fd);

        // â”€â”€ Build result UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        await _reloadEmpEmailReadiness();
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

        // â”€â”€ Sheet 1: Template â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const headers = ['EmployeeID', 'EmployeeName', 'Department', 'Unit', 'Position', 'CompanyEmail', 'Role'];
        const example = [
            '012345',
            'ชื่อ นามสกุล',
            tmpl.departments[0] || '',
            tmpl.units[0]       || '',
            tmpl.positions[0]   || '',
            'name@thaisummit-harness.co.th',
            'User',
        ];
        const ws1 = XLSX.utils.aoa_to_sheet([headers, example]);
        ws1['!cols'] = [14, 24, 30, 30, 24, 34, 10].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws1, 'พนักงาน');

        // â”€â”€ Sheet 2: Reference â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        const coverage = d.coverage || {};
        const moduleHealth = Array.isArray(d.moduleHealth) ? d.moduleHealth : [];
        const apiHealth = d.apiHealth || {};
        const workflowHealth = d.workflowHealth || {};
        const storageHealth = d.storageHealth || {};
        const securityHealth = d.securityHealth || {};
        const versionHealth = d.versionHealth || {};
        const snapshotHealth = d.snapshotHealth || {};
        _adminHealthState = { raw: d, filter: 'all', moduleHealth, signals: readiness.signals || [], storageHealth, securityHealth, versionHealth };

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
        const scoreBreakdown = Array.isArray(readiness.scoreBreakdown) ? readiness.scoreBreakdown : [];
        const signalList = activeSignals.length
            ? activeSignals.map(s => `
                <button type="button" onclick="window._adminHealthDrilldown&&window._adminHealthDrilldown('${escHtml(s.key || '')}')"
                    class="w-full text-left flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 rounded-lg px-2 transition-colors">
                    <div>
                        <p class="text-xs font-bold text-slate-700">${escHtml(s.label || s.key || 'Signal')}</p>
                        <p class="text-[11px] text-slate-400">${escHtml((s.detail || []).slice(0, 3).map(x => typeof x === 'string' ? x : (x.NoticeNo || x.Department || x.id || '')).filter(Boolean).join(', ') || 'Needs admin review')}</p>
                    </div>
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${s.severity === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}">${s.count}</span>
                </button>`).join('')
            : `<div class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3">ไม่พบสัญญาณเสี่ยงสำคัญ / No major readiness signals.</div>`;
        const moduleTone = (status) => status === 'critical'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : status === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700';
        const moduleGrid = moduleHealth.length
            ? moduleHealth.map(mod => {
                const navKey = String(mod.nav || '').replace(/[^a-z0-9-]/gi, '');
                const missing = [...(mod.missingTables || []), ...(mod.missingColumns || [])];
                const rootCauseCount = Array.isArray(mod.rootCauses) ? mod.rootCauses.length : missing.length + Number(mod.failedApi24h || 0);
                const subtitle = missing.length
                    ? missing.slice(0, 2).join(', ')
                    : rootCauseCount
                        ? `${rootCauseCount} root cause item(s)`
                        : `${mod.existingTables || 0}/${mod.tableCount || 0} tables / ${mod.apiCount || 0} APIs`;
                return `
                <button type="button" onclick="window._adminHealthModuleDrilldown&&window._adminHealthModuleDrilldown('${escHtml(mod.key || '')}')"
                    class="text-left rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">${escHtml(mod.group || 'module')}</p>
                            <h3 class="mt-1 text-sm font-black text-slate-800">${escHtml(mod.label || mod.key || 'Module')}</h3>
                        </div>
                        <span class="shrink-0 text-[10px] font-black px-2 py-1 rounded-full border ${moduleTone(mod.status)}">${escHtml((mod.status || 'ok').toUpperCase())}</span>
                    </div>
                    <div class="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div class="rounded-lg bg-slate-50 px-2 py-2">
                            <p class="text-sm font-black text-slate-800">${mod.existingTables ?? 0}/${mod.tableCount ?? 0}</p>
                            <p class="text-[10px] font-bold text-slate-400">ตาราง / Tables</p>
                        </div>
                        <div class="rounded-lg bg-slate-50 px-2 py-2">
                            <p class="text-sm font-black text-slate-800">${mod.apiCount ?? 0}</p>
                            <p class="text-[10px] font-bold text-slate-400">APIs</p>
                        </div>
                        <div class="rounded-lg bg-slate-50 px-2 py-2">
                            <p class="text-sm font-black ${(mod.failedApi24h || 0) ? 'text-rose-600' : 'text-slate-800'}">${mod.failedApi24h ?? 0}</p>
                            <p class="text-[10px] font-bold text-slate-400">ล้มเหลว 24 ชม.</p>
                        </div>
                    </div>
                    <p class="mt-3 min-h-[2rem] text-[11px] font-semibold ${missing.length || rootCauseCount ? 'text-amber-700' : 'text-slate-500'}">${escHtml(subtitle)}</p>
                    <div class="mt-3 flex items-center justify-between gap-2">
                        <span class="text-[10px] font-bold text-slate-400">รายละเอียดสาเหตุ / Root cause</span>
                        ${navKey ? `<span class="text-[10px] font-black text-emerald-700">เปิดดู / Open</span>` : ''}
                    </div>
                </button>`;
            }).join('')
            : '';
        const phase9ModuleGrid = _adminHealthModuleCardsHtml(moduleHealth, 'all');
        const healthFilterButton = (key, label, count) => `
            <button type="button" data-health-filter="${key}" onclick="window._adminHealthSetFilter&&window._adminHealthSetFilter('${key}')"
                class="px-3 py-2 rounded-lg border text-xs font-black transition-colors ${key === 'all' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-200 hover:text-emerald-700'}">
                ${label} <span class="ml-1 opacity-75">${count}</span>
            </button>`;

        container.innerHTML = `
        <div class="animate-fade-in space-y-5">
            <div class="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-3">
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">การรับรองระบบ / System Assurance</p>
                    <h2 class="text-base font-black text-slate-800 mt-1">สุขภาพและความพร้อมระบบ / System Health</h2>
                    <p class="text-xs text-slate-500 mt-1">ภาพรวม schema, SLA, API, storage, security และคะแนนความพร้อมของทั้งระบบ</p>
                </div>
                <div class="flex gap-2 overflow-x-auto scrollbar-none">
                    <button type="button" onclick="window._adminTab('audit')" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-200 hover:text-emerald-700">บันทึกตรวจสอบ / Audit</button>
                    <button type="button" onclick="window._adminTab('dashboard')" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-200 hover:text-emerald-700">ภาพรวม / Dashboard</button>
                    <button type="button" onclick="window._adminTab('employees')" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-200 hover:text-emerald-700">ข้อมูลพนักงาน / Employees</button>
                </div>
            </div>
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div class="xl:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    ${metricCard('ความพร้อมระบบ / Readiness', `${readinessScore}%`, `${readiness.status || 'Unknown'} · คะแนนต่ำสุด ${readiness.scoreFloor ?? 25}`, readinessScore >= 90 ? 'good' : readinessScore >= 70 ? 'warn' : 'risk')}
                    ${metricCard('API ล้มเหลว 24 ชม.', audit.failed24h ?? '-', 'จาก Admin AuditLogs', (audit.failed24h || 0) > 0 ? 'risk' : 'good')}
                    ${metricCard('กิจกรรมตรวจสอบ 24 ชม.', audit.last24h ?? '-', 'รายการเปลี่ยนแปลงหลังลงชื่อเข้าใช้', 'info')}
                    ${metricCard('งานค้าง / Stale Work', staleWork, 'การแจ้งเตือน 4M + Hiyari', staleWork > 0 ? 'warn' : 'good')}
                </div>
                <div class="ds-section">
                    <div class="flex items-center justify-between gap-3 mb-2">
                        <h3 class="font-bold text-slate-700 text-sm">สัญญาณความพร้อม / Readiness Signals</h3>
                        <span class="text-[11px] font-bold px-2 py-0.5 rounded-full border ${readinessTone}">${escHtml(readiness.status || 'Unknown')}</span>
                    </div>
                    ${signalList}
                    ${missingTables.length ? `<p class="text-[11px] text-rose-500 mt-2">ตารางที่หาย / Missing: ${escHtml(missingTables.join(', '))}</p>` : ''}
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                ${metricCard('โมดูลที่ครอบคลุม / Modules', `${coverage.modulesOk ?? 0}/${coverage.modulesTotal ?? moduleHealth.length}`, `${coverage.modulesWarning ?? 0} เตือน · ${coverage.modulesCritical ?? 0} วิกฤต`, (coverage.modulesCritical || 0) ? 'risk' : (coverage.modulesWarning || 0) ? 'warn' : 'good')}
                ${metricCard('ตาราง DB ที่ตรวจ', `${coverage.tablesOk ?? 0}/${coverage.tablesTotal ?? 0}`, `${coverage.requiredTablesMissing ?? 0} จำเป็น · ${coverage.optionalTablesMissing ?? 0} เสริม · ${coverage.backlogTablesMissing ?? 0} backlog`, (coverage.requiredTablesMissing || 0) ? 'risk' : (coverage.optionalTablesMissing || 0) ? 'warn' : 'good')}
                ${metricCard('พื้นผิว API / Surfaces', `${coverage.apiSurfacesTotal ?? apiHealth.surfacesTotal ?? 0}`, `${apiHealth.failed24h ?? coverage.failedApiByModule24h ?? 0} ล้มเหลวใน 24 ชม.`, (apiHealth.failed24h || coverage.failedApiByModule24h || 0) ? 'risk' : 'good')}
                ${(() => {
                    const scoreDeduction = scoreBreakdown.reduce((sum, row) => sum + Number(row.deduction || 0), 0);
                    return metricCard('ผลกระทบคะแนน / Score Impact', scoreDeduction ? `-${scoreDeduction}` : '0', `${workflowHealth.active ?? 0} กฎ/SLA ทำงาน · floor ${readiness.scoreFloor ?? 25}`, scoreDeduction ? 'warn' : 'good');
                })()}
            </div>
            ${workflowHealth.phase4Complete === false ? `
            <div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p class="text-xs font-black text-amber-800">Phase 4 ยังครอบคลุม workflow ไม่ครบ / Coverage incomplete</p>
                <p class="mt-1 text-[11px] text-amber-700">${escHtml((workflowHealth.phase4Gaps || []).join(' · ') || 'Additional workflow rules still need coverage.')}</p>
            </div>` : ''}
            ${_adminHealthSnapshotPanelHtml(snapshotHealth)}
            <button type="button" onclick="window._adminStorageHealthDrilldown&&window._adminStorageHealthDrilldown()"
                class="w-full text-left rounded-xl border ${storageHealth.status === 'critical' ? 'border-rose-200 bg-rose-50' : storageHealth.status === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'} px-4 py-4 hover:shadow-sm transition-shadow">
                <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                        <p class="text-[10px] font-black uppercase text-slate-400">Phase 6</p>
                        <h3 class="mt-1 text-sm font-black text-slate-800">พื้นที่จัดเก็บและไฟล์ / Storage Health</h3>
                        <p class="mt-1 text-[11px] text-slate-500">ตรวจ ${storageHealth.referencesTotal ?? 0} รายการอ้างอิงจาก CCCF, Hiyari, Contractor, Accident, Forklift และโมดูลที่เกี่ยวข้อง</p>
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-center min-w-[280px]">
                        <div class="rounded-lg bg-white/70 px-3 py-2"><p class="text-sm font-black text-slate-800">${storageHealth.localReferences ?? 0}</p><p class="text-[10px] font-bold text-slate-400">อ้างอิงในระบบ</p></div>
                        <div class="rounded-lg bg-white/70 px-3 py-2"><p class="text-sm font-black ${storageHealth.missingFiles ? 'text-rose-600' : 'text-emerald-600'}">${storageHealth.missingFiles ?? 0}</p><p class="text-[10px] font-bold text-slate-400">ไฟล์สูญหาย</p></div>
                        <div class="rounded-lg bg-white/70 px-3 py-2"><p class="text-sm font-black ${storageHealth.orphanFiles ? 'text-amber-600' : 'text-emerald-600'}">${storageHealth.orphanFiles ?? 0}</p><p class="text-[10px] font-bold text-slate-400">ไฟล์กำพร้า</p></div>
                    </div>
                </div>
            </button>
            <button type="button" onclick="window._adminSecurityHealthDrilldown&&window._adminSecurityHealthDrilldown()"
                class="w-full text-left rounded-xl border ${securityHealth.status === 'critical' ? 'border-rose-200 bg-rose-50' : securityHealth.status === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'} px-4 py-4 hover:shadow-sm transition-shadow">
                <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                        <p class="text-[10px] font-black uppercase text-slate-400">Phase 7</p>
                        <h3 class="mt-1 text-sm font-black text-slate-800">สิทธิ์และความปลอดภัย / Security Health</h3>
                        <p class="mt-1 text-[11px] text-slate-500">ตารางสิทธิ์, route guards, ความครบถ้วนโปรไฟล์, auth policy และเหตุการณ์ 24 ชั่วโมง</p>
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-center min-w-[280px]">
                        <div class="rounded-lg bg-white/70 px-3 py-2"><p class="text-sm font-black text-slate-800">${securityHealth.permissionMatrix?.explicitEntries ?? 0}/${securityHealth.permissionMatrix?.expectedEntries ?? 0}</p><p class="text-[10px] font-bold text-slate-400">ตารางสิทธิ์</p></div>
                        <div class="rounded-lg bg-white/70 px-3 py-2"><p class="text-sm font-black ${securityHealth.auth?.legacyPasswords ? 'text-rose-600' : 'text-emerald-600'}">${securityHealth.auth?.legacyPasswords ?? 0}</p><p class="text-[10px] font-bold text-slate-400">รหัสผ่านเดิม</p></div>
                        <div class="rounded-lg bg-white/70 px-3 py-2"><p class="text-sm font-black ${securityHealth.auth?.failedLogins24h >= 20 ? 'text-rose-600' : 'text-slate-800'}">${securityHealth.auth?.failedLogins24h ?? 0}</p><p class="text-[10px] font-bold text-slate-400">เข้าสู่ระบบล้มเหลว</p></div>
                    </div>
                </div>
            </button>
            <button type="button" onclick="window._adminVersionHealthDrilldown&&window._adminVersionHealthDrilldown()"
                class="w-full text-left rounded-xl border ${versionHealth.status === 'critical' ? 'border-rose-200 bg-rose-50' : versionHealth.status === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'} px-4 py-4 hover:shadow-sm transition-shadow">
                <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div><p class="text-[10px] font-black uppercase text-slate-400">Phase 8</p><h3 class="mt-1 text-sm font-black text-slate-800">การติดตั้งและเวอร์ชัน / Deploy Health</h3><p class="mt-1 text-[11px] text-slate-500">Build ID, cache bust, smoke ล่าสุด, ไฟล์ runtime และความเท่ากัน PHP/Node</p></div>
                    <div class="grid grid-cols-3 gap-2 text-center min-w-[280px]">
                        <div class="rounded-lg bg-white/70 px-3 py-2"><p class="text-xs font-black text-slate-800 truncate">${escHtml(versionHealth.manifest?.buildId || '-')}</p><p class="text-[10px] font-bold text-slate-400">Build</p></div>
                        <div class="rounded-lg bg-white/70 px-3 py-2"><p class="text-sm font-black ${versionHealth.lastSmoke?.status === 'passed' ? 'text-emerald-600' : 'text-amber-600'}">${escHtml(String(versionHealth.lastSmoke?.status || 'unknown').toUpperCase())}</p><p class="text-[10px] font-bold text-slate-400">Smoke</p></div>
                        <div class="rounded-lg bg-white/70 px-3 py-2"><p class="text-sm font-black ${versionHealth.parityMissing ? 'text-rose-600' : 'text-emerald-600'}">${(versionHealth.parityMarkers?.length || 0) - Number(versionHealth.parityMissing || 0)}/${versionHealth.parityMarkers?.length || 0}</p><p class="text-[10px] font-bold text-slate-400">Parity</p></div>
                    </div>
                </div>
            </button>
            ${moduleHealth.length ? `
            <div class="ds-section">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                    <div>
                        <h3 class="font-black text-slate-800 text-sm">สุขภาพโมดูลโครงการ / Module Health</h3>
                        <p class="text-xs text-slate-500 mt-1">ตารางจำเป็นกระทบ readiness, ตารางเสริมแสดงคำเตือน และ backlog ใช้เป็นข้อมูลประกอบ</p>
                    </div>
                    <span class="text-[11px] font-black px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600">${moduleHealth.length} โมดูล / modules</span>
                </div>
                <div class="flex flex-wrap items-center gap-2 mb-4">
                    ${healthFilterButton('all', 'ทั้งหมด / All', moduleHealth.length)}
                    ${healthFilterButton('critical', 'วิกฤต / Critical', coverage.modulesCritical ?? moduleHealth.filter(m => m.status === 'critical').length)}
                    ${healthFilterButton('warning', 'เตือน / Warning', coverage.modulesWarning ?? moduleHealth.filter(m => m.status === 'warning').length)}
                    ${healthFilterButton('ok', 'ปกติ / OK', coverage.modulesOk ?? moduleHealth.filter(m => m.status === 'ok').length)}
                    <button type="button" onclick="window._adminHealthExportExcel&&window._adminHealthExportExcel()" class="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-700 hover:bg-emerald-100">Export Excel</button>
                    <button type="button" onclick="window._adminHealthExportPdf&&window._adminHealthExportPdf()" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-600 hover:border-emerald-200 hover:text-emerald-700">Export PDF</button>
                </div>
                <div id="admin-health-module-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                    ${phase9ModuleGrid}
                </div>
            </div>` : ''}
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
        window._adminHealthDrilldown = _adminHealthDrilldown;
        window._adminHealthModuleDrilldown = _adminHealthModuleDrilldown;
        window._adminStorageHealthDrilldown = _adminStorageHealthDrilldown;
        window._adminSecurityHealthDrilldown = _adminSecurityHealthDrilldown;
        window._adminVersionHealthDrilldown = _adminVersionHealthDrilldown;
        window._adminHealthOpenFailedAudit = _adminHealthOpenFailedAudit;
        window._adminHealthGoModule = _adminHealthGoModule;
        window._adminHealthSetFilter = _adminHealthSetFilter;
        window._adminHealthExportExcel = _adminHealthExportExcel;
        window._adminHealthExportPdf = _adminHealthExportPdf;
        window._adminHealthSaveSnapshot = _adminHealthSaveSnapshot;
        _repairHealthMojibakeDom(container);
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
        const blob = new Blob(['ï»¿' + csv], { type: 'text/csv;charset=utf-8;' });
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
    <div class="animate-fade-in space-y-5">
        <div class="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-3">
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Audit Trail</p>
                <h2 class="text-base font-black text-slate-800 mt-1">Admin Audit Log</h2>
                <p class="text-xs text-slate-500 mt-1">Trace admin mutations, failed actions, request path, target records, and safe metadata.</p>
            </div>
            <div class="flex gap-2 overflow-x-auto scrollbar-none">
                <button type="button" onclick="window._auditToggleFailed()" class="px-3 py-2 rounded-lg border border-rose-200 bg-white text-xs font-bold text-rose-600 hover:bg-rose-50">Failed Only</button>
                <button type="button" onclick="window._auditApplyPreset&&window._auditApplyPreset('today')" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-200 hover:text-emerald-700">Today</button>
                <button type="button" onclick="window._auditApplyPreset&&window._auditApplyPreset('7d')" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-200 hover:text-emerald-700">7 Days</button>
                <button type="button" onclick="window._exportAuditCSV()" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-200 hover:text-emerald-700">Export CSV</button>
                <button type="button" onclick="window._adminTab('health')" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-200 hover:text-emerald-700">System Health</button>
            </div>
        </div>
        <div class="ds-filter-bar">
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-8 gap-3 items-end">
                <div class="md:col-span-2 xl:col-span-3">
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Search</label>
                    <input id="audit-filter-q" oninput="window._auditDebouncedLoad&&window._auditDebouncedLoad()" class="form-input w-full text-sm border-slate-200 rounded-lg py-2 px-3" placeholder="user, action, target, path">
                </div>
                <div class="xl:col-span-1">
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Module</label>
                    <select id="audit-filter-module" onchange="window._loadAuditLog()" class="form-select w-full text-sm border-slate-200 rounded-lg py-2 pl-3 pr-8">
                        <option value="">All Modules</option>
                    </select>
                </div>
                <div class="xl:col-span-1">
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Action</label>
                    <select id="audit-filter-action" onchange="window._loadAuditLog()" class="form-select w-full text-sm border-slate-200 rounded-lg py-2 pl-3 pr-8">
                        <option value="">All Actions</option>
                    </select>
                </div>
                <div class="xl:col-span-1">
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">From</label>
                    <input id="audit-date-from" type="date" onchange="window._loadAuditLog()" class="form-input w-full text-sm border-slate-200 rounded-lg py-2 px-3">
                </div>
                <div class="xl:col-span-2">
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
                <button onclick="window._auditApplyPreset&&window._auditApplyPreset('today')"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700">
                    Today
                </button>
                <button onclick="window._auditApplyPreset&&window._auditApplyPreset('7d')"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700">
                    Last 7 days
                </button>
                <button onclick="window._auditApplyPreset&&window._auditApplyPreset('employee')"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-700">
                    Employee changes
                </button>
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
        <div id="audit-summary-strip" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3">
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
    window._auditApplyPreset = (preset) => {
        const q = document.getElementById('audit-filter-q');
        const module = document.getElementById('audit-filter-module');
        const action = document.getElementById('audit-filter-action');
        const from = document.getElementById('audit-date-from');
        const to = document.getElementById('audit-date-to');
        const isoDate = (date) => date.toISOString().slice(0, 10);
        const today = new Date();
        if (q) q.value = '';
        if (module) module.value = '';
        if (action) action.value = '';
        if (from) from.value = '';
        if (to) to.value = '';
        _auditFilterFailed = false;

        if (preset === 'today') {
            if (from) from.value = isoDate(today);
            if (to) to.value = isoDate(today);
        } else if (preset === '7d') {
            const sevenDaysAgo = new Date(today);
            sevenDaysAgo.setDate(today.getDate() - 6);
            if (from) from.value = isoDate(sevenDaysAgo);
            if (to) to.value = isoDate(today);
        } else if (preset === 'employee') {
            if (q) q.value = 'EMPLOYEE';
        } else if (preset === 'failed') {
            _auditFilterFailed = true;
        }
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
            <table class="ds-table min-w-[1180px]">
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
                            <div class="text-[11px] text-slate-400 truncate max-w-[320px]">${escHtml(r.Path||'')}</div>
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
let _atDepartments  = [];
let _atDeptRows     = [];
let _atUnits        = [];
let _atSubTab       = 'matrix'; // 'matrix' | 'template' | 'scope' | 'person'
let _atSelPosition  = '';
let _atTemplateFocusActivity = '';
let _atSelDept      = '';
let _atSelUnit      = '';
let _atEmpSearch    = '';
let _atEmpResults   = [];
let _atSelEmp       = null; // { EmployeeID, Name, Position }
let _atEmpTargets   = [];   // targets for selected employee
let _atAllTemplates = [];
let _atCoverage     = null;
let _atMatrixRows   = [];
let _atMatrixSummary = {};
let _atSafetyCoreRoster = [];
let _atSafetyCoreRosterIds = new Set();
let _atPersonRosterOnly = false;
let _atMatrixPage = 1;
let _atMatrixPageSize = 10;
let _atMatrixFilters = { department: '', unit: '', position: '', activity: '', source: '', issue: '', review: false, roster: '' };
let _atTargetYear = new Date().getFullYear();

const AT_SOURCE_LABELS = {
    override: 'รายบุคคล / Employee',
    scope: 'แผนก/Unit / Scope',
    template: 'ตำแหน่ง / Template',
    system: 'ระบบคำนวณ / System',
    missing: 'ยังไม่กำหนด / Missing',
};

const AT_ISSUE_LABELS = {
    review: 'ต้องทบทวน / Review',
    missing: 'ยังไม่กำหนด / Missing',
    zero: 'เป้า 0 / Zero',
    na: 'ไม่เกี่ยวข้อง / N/A',
};

function _atSourceLabel(source) {
    return AT_SOURCE_LABELS[source] || source || '-';
}

function _atIssueLabel(issue) {
    return AT_ISSUE_LABELS[issue] || issue || '-';
}

function _atTargetYearValue() {
    const year = Number(_atTargetYear || new Date().getFullYear());
    return year >= 2000 && year <= 2100 ? year : new Date().getFullYear();
}

function _atTargetYearParam() {
    return String(_atTargetYearValue());
}

function _atTargetYearPayload() {
    return { TargetYear: _atTargetYearValue() };
}

function _atYearSelectorHtml() {
    const current = new Date().getFullYear();
    const years = [];
    for (let y = current - 1; y <= current + 2; y += 1) years.push(y);
    if (!years.includes(_atTargetYearValue())) years.push(_atTargetYearValue());
    years.sort((a, b) => a - b);
    return `
    <label class="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-100 bg-white shadow-sm">
        <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Year</span>
        <select id="at-target-year" onchange="window._atSetTargetYear(this.value)"
            class="px-2 py-1 text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg outline-none focus:border-indigo-400">
            ${years.map(y => `<option value="${y}" ${y === _atTargetYearValue() ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
    </label>`;
}

function _atYearBadgeHtml(extra = '') {
    return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-indigo-100 bg-indigo-50 text-[11px] font-black text-indigo-700">TargetYear ${_atTargetYearValue()}${extra}</span>`;
}

async function renderActivityTargets(container) {
    // fetch activities + positions in parallel
    try {
        const [actRes, posRes, tplRes, deptRes, unitRes, rosterRes] = await Promise.all([
            API.get('/activity-targets/activities'),
            API.get('/master/positions'),
            API.get(`/activity-targets/position-templates?TargetYear=${_atTargetYearParam()}`).catch(() => ({ data: [] })),
            API.get('/admin/org/departments').catch(() => API.get('/master/departments')).catch(() => ({ data: [] })),
            API.get('/admin/org/units').catch(() => ({ data: [] })),
            API.get('/admin/safety-core-export-roster').catch(() => ({ data: [] })),
        ]);
        _atActivities = actRes.data || [];
        _atPositions  = (posRes.data || []).map(p => p.Name || p.PositionName || p.name || p).filter(Boolean);
        _atDeptRows = deptRes.data || [];
        _atDepartments = _atDeptRows.map(d => d.Name || d.Department || d.name || d).filter(Boolean);
        _atUnits = unitRes.data || [];
        _atSafetyCoreRoster = rosterRes.data || [];
        _atSafetyCoreRosterIds = new Set(_atSafetyCoreRoster.map(row => String(row.EmployeeID || '').trim()).filter(Boolean));
        _atAllTemplates = tplRes.data || [];
        _atCoverage = _atBuildCoverage(_atAllTemplates);
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
            <div class="flex items-center gap-2">
                ${_atYearSelectorHtml()}
                <button type="button" onclick="window._adminTab && window._adminTab('safety-data')"
                    class="hidden md:inline-flex items-center px-3 py-2 rounded-lg border border-emerald-200 bg-white text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                    Safety Core Data
                </button>
            </div>
        </div>

        ${_atGuideHtml()}
        ${_atCoverageHtml(_atCoverage)}

        <!-- Sub-tabs -->
        <div class="flex bg-slate-100 p-1 rounded-xl gap-1 w-fit">
            <button id="at-sub-matrix" onclick="window._atSwitchSubTab('matrix')"
                class="px-4 py-2 text-xs font-semibold rounded-lg transition-all bg-white shadow-sm text-slate-800">
                ภาพรวมรายคน / Matrix
            </button>
            <button id="at-sub-template" onclick="window._atSwitchSubTab('template')"
                class="px-4 py-2 text-xs font-semibold rounded-lg transition-all text-slate-500 hover:text-slate-700">
                เทมเพลตตามตำแหน่ง
            </button>
            <button id="at-sub-scope" onclick="window._atSwitchSubTab('scope')"
                class="px-4 py-2 text-xs font-semibold rounded-lg transition-all text-slate-500 hover:text-slate-700">
                ตามแผนก/หน่วยงาน
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
    window._atLoadScope     = _atLoadScope;
    window._atSaveScope     = _atSaveScope;
    window._atClearScope    = _atClearScope;
    window._atToggleScopeNA = _atToggleScopeNA;
    window._atSearchEmp     = _atSearchEmp;
    window._atSelectEmp     = _atSelectEmp;
    window._atSaveOverride  = _atSaveOverride;
    window._atClearOverride = _atClearOverride;
    window._atToggleNA      = _atToggleNA;
    window._atMatrixFilter  = _atMatrixFilter;
    window._atMatrixEdit    = _atMatrixEdit;
    window._atMatrixQuick   = _atMatrixQuick;
    window._atMatrixExport  = _atMatrixExport;
    window._atGuideTemplate = _atGuideTemplate;
    window._atSetPersonRosterOnly = _atSetPersonRosterOnly;
    window._atMatrixSetPage = _atMatrixSetPage;
    window._atMatrixSetPageSize = _atMatrixSetPageSize;
    window._atSetTargetYear = _atSetTargetYear;
}

async function _atSetTargetYear(year) {
    const parsed = Number(year || new Date().getFullYear());
    _atTargetYear = parsed >= 2000 && parsed <= 2100 ? parsed : new Date().getFullYear();
    await _atRefreshCoverage();
    const content = document.getElementById('at-content');
    if (content) _atSwitchSubTab(_atSubTab);
}

function _atBuildCoverage(rows = []) {
    const activities = _atActivities || [];
    const positions = _atPositions || [];
    const totalSlots = positions.length * activities.length;
    const byPosAct = {};
    const byPosition = {};
    const byActivity = {};
    activities.forEach(a => { byActivity[a.key] = { ...a, configured: 0, na: 0, zero: 0, missing: positions.length }; });

    (rows || []).forEach(r => {
        const pos = String(r.PositionName || '').trim();
        const key = String(r.ActivityKey || '').trim();
        if (!pos || !key) return;
        byPosAct[`${pos}::${key}`] = r;
    });

    positions.forEach(pos => {
        let configured = 0;
        let na = 0;
        let zero = 0;
        let missing = 0;
        activities.forEach(a => {
            const r = byPosAct[`${pos}::${a.key}`];
            const isNA = r && (r.IsNA === 1 || r.IsNA === true || r.IsNA === '1');
            const target = Number(r?.YearlyTarget || 0);
            if (_atIsDynamic(a) && !isNA) {
                configured += 1;
                if (byActivity[a.key]) byActivity[a.key].configured += 1;
                return;
            }
            if (!r) {
                missing += 1;
                return;
            }
            if (isNA) {
                na += 1;
                if (byActivity[a.key]) byActivity[a.key].na += 1;
                return;
            }
            if (target > 0) {
                configured += 1;
                if (byActivity[a.key]) byActivity[a.key].configured += 1;
            } else {
                zero += 1;
                if (byActivity[a.key]) byActivity[a.key].zero += 1;
            }
        });
        byPosition[pos] = { position: pos, configured, na, zero, missing, total: activities.length };
    });

    Object.values(byActivity).forEach(a => {
        a.missing = Math.max(0, positions.length - a.configured - a.na - a.zero);
    });

    const configuredSlots = Object.values(byPosition).reduce((sum, r) => sum + r.configured, 0);
    const naSlots = Object.values(byPosition).reduce((sum, r) => sum + r.na, 0);
    const zeroSlots = Object.values(byPosition).reduce((sum, r) => sum + r.zero, 0);
    const missingSlots = Object.values(byPosition).reduce((sum, r) => sum + r.missing, 0);
    const completePositions = Object.values(byPosition).filter(r => r.missing === 0 && r.zero === 0).length;
    const coveragePct = totalSlots ? Math.round(((configuredSlots + naSlots) / totalSlots) * 100) : 0;
    const reviewPositions = Object.values(byPosition)
        .filter(r => r.missing > 0 || r.zero > 0)
        .sort((a, b) => (b.missing + b.zero) - (a.missing + a.zero))
        .slice(0, 6);

    return {
        totalSlots,
        configuredSlots,
        naSlots,
        zeroSlots,
        missingSlots,
        coveragePct,
        completePositions,
        totalPositions: positions.length,
        totalActivities: activities.length,
        reviewPositions,
        byActivity: Object.values(byActivity),
    };
}

function _atGuideHtml() {
    const examples = [
        ['นับจำนวน / Fixed Count', 'นับจำนวนกิจกรรมเทียบเป้ารายปี', 'Safety Patrol, KY Activity'],
        ['ครอบคลุมคน / People Coverage', 'นับจำนวนผู้เกี่ยวข้องที่ดำเนินการครบ', 'CCCF, OJT, Training, Hiyari'],
        ['สัดส่วนระบบ / Dynamic Ratio', 'ใช้ตัวหารจากข้อมูลจริงของระบบ', 'Patrol Issues, Yokoten Response'],
        ['N/A', 'ไม่นับในเป้าหมายของ scope นี้', 'ใช้เมื่อกิจกรรมนั้นไม่เกี่ยวข้อง'],
    ];
    return `
    <div class="grid grid-cols-1 xl:grid-cols-[1.25fr,0.75fr] gap-4">
        <div class="rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
            <div class="p-4 border-b border-indigo-50 bg-gradient-to-r from-indigo-50 to-white">
                <p class="text-[10px] font-black uppercase tracking-widest text-indigo-500">วิธีตั้งเป้าหมาย / How to Set Targets</p>
                <h3 class="mt-1 text-sm font-black text-slate-800">วิธีตั้งเป้าหมายให้แอดมินเข้าใจตรงกัน</h3>
                <p class="text-xs text-slate-500 mt-1">กิจกรรมแต่ละชนิดมีสูตรวัดผลต่างกัน ช่องเป้าหมาย/ปีใช้กับ Fixed Count และ People Coverage ส่วน Dynamic Ratio จะใช้ตัวหารจากข้อมูลจริงของระบบ</p>
            </div>
            <div class="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                ${examples.map(([label, meaning, use]) => `
                <div class="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <p class="text-sm font-black text-slate-800">${label}</p>
                    <p class="text-xs text-slate-600 mt-1">${meaning}</p>
                    <p class="text-[11px] text-slate-400 mt-2">${use}</p>
                </div>`).join('')}
            </div>
        </div>
        <div class="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
            <p class="text-[10px] font-black uppercase tracking-widest text-amber-600">หมายเหตุสำคัญ / Important Note</p>
            <h3 class="mt-1 text-sm font-black text-slate-800">ลำดับการใช้ค่าปัจจุบัน</h3>
            <div class="mt-3 space-y-2 text-xs text-slate-600">
                <p><span class="font-bold text-violet-700">1. รายบุคคล / Employee Override</span> ใช้ก่อนเสมอถ้ากำหนดรายบุคคลไว้</p>
                <p><span class="font-bold text-emerald-700">2. แผนก/Unit / Department-Unit Override</span> ใช้เมื่อแผนกหรือ unit มีเป้าหมายต่างจากตำแหน่งกลาง</p>
                <p><span class="font-bold text-sky-700">3. ตำแหน่ง / Position Template</span> ใช้เป็นค่า default ของทุกคนในตำแหน่ง</p>
                <p class="pt-2 border-t border-amber-100 text-amber-700">กิจกรรมแบบ event-based เช่น Issue/Hiyari ควรตั้งอย่างระวัง เพื่อไม่สร้างแรงจูงใจให้แจ้งเพื่อให้ครบจำนวน</p>
                <p class="text-amber-700">Phase AT-6 แสดงชนิด KPI เพื่อเตรียมข้อมูล ส่วนสูตร Dynamic Ratio และ People Coverage แบบใหม่จะเชื่อมใน Phase ถัดไป</p>
            </div>
        </div>
    </div>`;
}

function _atActivityMeta(a = {}) {
    const meta = {
        fixed_count:     { label:'นับจำนวน / Fixed Count',     cls:'bg-indigo-50 text-indigo-700 border-indigo-100' },
        people_coverage: { label:'ครอบคลุมคน / People Coverage', cls:'bg-emerald-50 text-emerald-700 border-emerald-100' },
        dynamic_ratio:   { label:'สัดส่วนระบบ / Dynamic Ratio',   cls:'bg-amber-50 text-amber-700 border-amber-100' },
    }[a.metricType] || { label:'นับแบบเดิม / Legacy Count', cls:'bg-slate-50 text-slate-600 border-slate-100' };
    const unit = a.unitLabel ? ` · ${escHtml(a.unitLabel)}` : '';
    return `<span class="inline-flex mt-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${meta.cls}">${meta.label}${unit}</span>`;
}

function _atIsDynamic(a = {}) {
    return a.metricType === 'dynamic_ratio';
}

function _atStoredTarget(actKey, rawValue) {
    const activity = _atActivities.find(a => a.key === actKey) || {};
    if (_atIsDynamic(activity)) return 1;
    if (rawValue === '' || rawValue === null || rawValue === undefined) return null;
    const target = Number(rawValue);
    return Number.isFinite(target) && target >= 0 ? target : null;
}

function _atTargetEditor(a, id, value, placeholder, isNA, accent = 'indigo') {
    if (_atIsDynamic(a)) {
        const formula = a.key === 'patrol_issue'
            ? 'ปิดแล้ว / ประเด็นรับผิดชอบ'
            : a.key === 'yokoten'
                ? 'ตอบแล้ว / หัวข้อที่มอบหมาย'
                : 'ผลสำเร็จ / รายการทั้งหมด';
        return `<div class="inline-flex flex-col items-center gap-0.5">
            <span class="px-2.5 py-1 rounded-lg border border-amber-100 bg-amber-50 text-[11px] font-bold text-amber-700">ระบบคำนวณ / System</span>
            <span class="text-[10px] text-slate-400">${formula}</span>
        </div>`;
    }
    const focus = accent === 'emerald'
        ? 'focus:border-emerald-400 focus:ring-emerald-100'
        : 'focus:border-indigo-400 focus:ring-indigo-100';
    return `<div class="inline-flex items-center gap-1">
        <input id="${id}" type="number" min="0" value="${isNA ? '' : (value ?? '')}"
            placeholder="${placeholder}" ${isNA ? 'disabled' : ''}
            class="w-24 px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg outline-none focus:ring-2 ${focus} disabled:bg-slate-100">
        <span class="text-[11px] text-slate-400">${escHtml(a.unitLabel || '')}</span>
    </div>`;
}

function _atCoverageHtml(c = {}) {
    const pct = Number(c?.coveragePct || 0);
    const statusCls = pct >= 90 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
        : pct >= 60 ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-rose-700 bg-rose-50 border-rose-200';
    const reviewRows = (c?.reviewPositions || []).length
        ? c.reviewPositions.map(r => `
            <button type="button" onclick="window._atSwitchSubTab('template'); setTimeout(()=>window._atLoadTemplate&&window._atLoadTemplate('${String(r.position).replace(/'/g,"\\'")}'),0)"
                class="w-full text-left rounded-lg border border-slate-100 bg-white px-3 py-2 hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-bold text-slate-700 truncate">${escHtml(r.position)}</span>
                    <span class="text-[11px] font-bold text-amber-700">${r.missing + r.zero} ต้องทบทวน</span>
                </div>
                <p class="text-[11px] text-slate-400 mt-1">ยังไม่กำหนด ${r.missing} · เป้าเป็นศูนย์ ${r.zero} · N/A ${r.na}</p>
            </button>`).join('')
        : `<div class="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">ทุกตำแหน่งมี template ครบ และไม่มี target เป็น 0 แล้ว</div>`;
    const activityRows = (c?.byActivity || []).map(a => `
        <div class="rounded-lg border border-slate-100 bg-white p-2">
            <div class="flex items-center justify-between gap-2">
                <span class="text-[11px] font-bold text-slate-700 truncate">${escHtml(a.label || a.key)}</span>
                <span class="text-[10px] text-slate-400">${a.configured}/${c.totalPositions || 0}</span>
            </div>
            ${_atActivityMeta(a)}
            <div class="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full bg-indigo-500" style="width:${c.totalPositions ? Math.round(((a.configured + a.na) / c.totalPositions) * 100) : 0}%"></div>
            </div>
            <p class="text-[10px] text-slate-400 mt-1">N/A ${a.na} · missing ${a.missing} · zero ${a.zero}</p>
        </div>`).join('');
    return `
    <div id="at-coverage-panel" class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div class="p-4 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div>
                <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">สรุปความครอบคลุม / Coverage Summary</p>
                <h3 class="mt-1 text-sm font-black text-slate-800">ภาพรวมความครอบคลุมของเป้าหมายตามตำแหน่ง</h3>
                <p class="text-xs text-slate-500 mt-1">สรุปจาก Position Template ที่ใช้เป็นค่า default ให้ผู้ใช้งานทั้งระบบ ก่อนถูก override รายบุคคล</p>
            </div>
            <span class="w-fit px-3 py-1.5 rounded-full border text-xs font-black ${statusCls}">${pct}% ครอบคลุม</span>
        </div>
        <div class="p-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            ${_atMetricCard('ตำแหน่ง / Positions', c.totalPositions || 0, 'ตำแหน่งทั้งหมด')}
            ${_atMetricCard('กิจกรรม / Activities', c.totalActivities || 0, 'กิจกรรมที่นับเป้า')}
            ${_atMetricCard('ตั้งแล้ว / Configured', c.configuredSlots || 0, 'ตั้งเป้าแล้ว')}
            ${_atMetricCard('N/A', c.naSlots || 0, 'ตั้งว่าไม่เกี่ยวข้อง')}
            ${_atMetricCard('ยังไม่กำหนด / Missing', c.missingSlots || 0, 'ยังไม่กำหนด')}
            ${_atMetricCard('เป้า 0 / Zero', c.zeroSlots || 0, 'ตั้งเป็น 0 ต้องทบทวน')}
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-[360px,1fr] gap-4 px-4 pb-4">
            <div>
                <p class="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">ตำแหน่งที่ต้องทบทวน / Positions Needing Review</p>
                <div class="space-y-2">${reviewRows}</div>
            </div>
            <div>
                <p class="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">ความครอบคลุมรายกิจกรรม / Activity Coverage</p>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">${activityRows}</div>
            </div>
        </div>
    </div>`;
}

function _atMetricCard(label, value, hint) {
    return `
    <div class="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
        <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">${label}</p>
        <p class="mt-1 text-xl font-black text-slate-800">${Number(value || 0).toLocaleString()}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">${hint}</p>
    </div>`;
}

async function _atRefreshCoverage() {
    try {
        const res = await API.get(`/activity-targets/position-templates?TargetYear=${_atTargetYearParam()}`);
        _atAllTemplates = res.data || [];
        _atCoverage = _atBuildCoverage(_atAllTemplates);
        const panel = document.getElementById('at-coverage-panel');
        if (panel) panel.outerHTML = _atCoverageHtml(_atCoverage);
    } catch (_) { /* keep current coverage if refresh fails */ }
}

function _atSwitchSubTab(key) {
    _atSubTab = key;
    const active   = 'px-4 py-2 text-xs font-semibold rounded-lg transition-all bg-white shadow-sm text-slate-800';
    const inactive = 'px-4 py-2 text-xs font-semibold rounded-lg transition-all text-slate-500 hover:text-slate-700';
    document.getElementById('at-sub-matrix')?.setAttribute('class', key === 'matrix' ? active : inactive);
    document.getElementById('at-sub-template')?.setAttribute('class', key === 'template' ? active : inactive);
    document.getElementById('at-sub-scope')?.setAttribute('class', key === 'scope' ? active : inactive);
    document.getElementById('at-sub-person')?.setAttribute('class',   key === 'person'   ? active : inactive);
    const area = document.getElementById('at-content');
    if (!area) return;
    if (key === 'matrix') _renderAtMatrix(area);
    else if (key === 'template') _renderAtTemplate(area);
    else if (key === 'scope') _renderAtScope(area);
    else                    _renderAtPerson(area);
}

async function _renderAtMatrix(area) {
    area.innerHTML = `<div class="flex justify-center py-12"><div class="animate-spin rounded-full h-9 w-9 border-4 border-indigo-500 border-t-transparent"></div></div>`;
    try {
        const res = await API.get(`/activity-targets/coverage-matrix?TargetYear=${_atTargetYearParam()}`);
        _atMatrixRows = res.data?.rows || [];
        _atMatrixSummary = res.data?.summary || {};
        _atRenderMatrixInner(area);
    } catch (e) {
        area.innerHTML = `<div class="py-10 text-center text-red-400 text-sm">โหลด Coverage Matrix ไม่ได้: ${escHtml(e.message)}</div>`;
    }
}

function _atMatrixOptions(field, label) {
    const values = [...new Set(_atMatrixRows.map(r => String(r[field] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
    return `<option value="">${label}</option>${values.map(v => `<option value="${escHtml(v)}" ${_atMatrixFilters[field] === v ? 'selected' : ''}>${escHtml(v)}</option>`).join('')}`;
}

function _atUnitName(row = {}) {
    return String(row.name || row.Name || row.UnitName || row.unit || row.SafetyUnit || '').trim();
}

function _atMatrixUnitOptions(label) {
    const values = _atMatrixUnitValues();
    return `<option value="">${label}</option>${values.map(v => `<option value="${escHtml(v)}" ${_atMatrixFilters.unit === v ? 'selected' : ''}>${escHtml(v)}</option>`).join('')}`;
}

function _atMatrixUnitValues() {
    const selectedDept = String(_atMatrixFilters.department || '').trim();
    const masterUnits = selectedDept
        ? _atUnitsForDeptName(selectedDept).map(_atUnitName)
        : (_atUnits || []).map(_atUnitName);
    const rowUnits = _atMatrixRows
        .filter(r => !selectedDept || r.department === selectedDept)
        .map(r => String(r.unit || '').trim());
    return [...new Set([...masterUnits, ...rowUnits].filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'th'));
}

function _atMatrixRosterOptions() {
    return `
        <option value="" ${!_atMatrixFilters.roster ? 'selected' : ''}>ทุกคน / All employees</option>
        <option value="safety_core" ${_atMatrixFilters.roster === 'safety_core' ? 'selected' : ''}>เฉพาะ Safety Core Data</option>`;
}

function _atSafetyCoreRosterOrderMap() {
    const map = new Map();
    (_atSafetyCoreRoster || []).forEach((row, index) => {
        const employeeId = String(row.EmployeeID || '').trim();
        if (employeeId) map.set(employeeId, Number(row.SortOrder || ((index + 1) * 10)));
    });
    return map;
}

function _atSortedMatrixRows(rows) {
    const orderMap = _atSafetyCoreRosterOrderMap();
    return [...(rows || [])].sort((a, b) => {
        const aId = String(a.employeeId || '').trim();
        const bId = String(b.employeeId || '').trim();
        const aOrder = orderMap.has(aId) ? orderMap.get(aId) : 999999;
        const bOrder = orderMap.has(bId) ? orderMap.get(bId) : 999999;
        return aOrder - bOrder
            || String(a.employeeName || aId).localeCompare(String(b.employeeName || bId), 'th')
            || String(a.activityLabel || '').localeCompare(String(b.activityLabel || ''), 'th');
    });
}

function _atMatrixSourceBadge(row) {
    if (row.isNA) return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">N/A</span>`;
    if (row.source === 'system') return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">${_atSourceLabel('system')}</span>`;
    if (row.source === 'override') return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700">${_atSourceLabel('override')}</span>`;
    if (row.source === 'scope') return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">${_atSourceLabel('scope')}</span>`;
    if (row.source === 'template') return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">${_atSourceLabel('template')}</span>`;
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">${_atSourceLabel('missing')}</span>`;
}

function _atMatrixIssueMatches(row, issue) {
    if (!issue) return true;
    if (issue === 'missing') return row.source === 'missing';
    if (issue === 'zero') return !!row.isZero;
    if (issue === 'na') return !!row.isNA;
    if (issue === 'review') return !!row.reviewNeeded;
    return true;
}

function _atFilteredMatrixRows() {
    const f = _atMatrixFilters;
    return _atSortedMatrixRows(_atMatrixRows.filter(r =>
        !r.isNA &&
        (!f.department || r.department === f.department) &&
        (!f.unit || r.unit === f.unit) &&
        (!f.position || r.position === f.position) &&
        (!f.activity || r.activityKey === f.activity) &&
        (!f.source || r.source === f.source) &&
        (!f.roster || (f.roster === 'safety_core' && _atSafetyCoreRosterIds.has(String(r.employeeId || '').trim()))) &&
        _atMatrixIssueMatches(r, f.issue) &&
        (!f.review || r.reviewNeeded)
    ));
}

function _atTopCounts(rows, key, limit = 5) {
    const counts = {};
    rows.forEach(row => {
        const value = String(row[key] || '').trim() || '-';
        counts[value] = (counts[value] || 0) + 1;
    });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))
        .slice(0, limit);
}

function _atMissingTemplateSuggestions(rows, limit = 6) {
    const groups = {};
    rows.filter(row => row.source === 'missing' && row.position && row.activityKey).forEach(row => {
        const id = `${row.position}::${row.activityKey}`;
        if (!groups[id]) {
            groups[id] = {
                position: row.position,
                activityKey: row.activityKey,
                activityLabel: row.activityLabel || row.activityKey,
                metricType: row.metricType || '',
                unitLabel: row.unitLabel || '',
                employees: new Set(),
                departments: new Set(),
            };
        }
        groups[id].employees.add(row.employeeId || '');
        groups[id].departments.add(row.department || '');
    });
    return Object.values(groups)
        .map(group => ({
            ...group,
            employeeCount: [...group.employees].filter(Boolean).length,
            departmentCount: [...group.departments].filter(Boolean).length,
        }))
        .sort((a, b) => b.employeeCount - a.employeeCount || a.position.localeCompare(b.position, 'th') || a.activityLabel.localeCompare(b.activityLabel, 'th'))
        .slice(0, limit);
}

function _atQualityPanelHtml(rows) {
    const reviewRows = _atMatrixRows.filter(r => r.reviewNeeded);
    const currentReviewRows = rows.filter(r => r.reviewNeeded);
    const missingRows = rows.filter(r => r.source === 'missing');
    const zeroRows = rows.filter(r => r.isZero);
    const topDepartments = _atTopCounts(currentReviewRows, 'department', 5);
    const topActivities = _atTopCounts(currentReviewRows, 'activityLabel', 5);
    const suggestions = _atMissingTemplateSuggestions(rows, 6);
    const line = ([label, count]) => `<div class="flex items-center justify-between gap-3 text-xs"><span class="truncate text-slate-600">${escHtml(label)}</span><span class="font-black text-slate-800">${Number(count || 0).toLocaleString()}</span></div>`;
    const suggestionHtml = suggestions.length
        ? suggestions.map(item => `
            <button type="button" onclick="window._atGuideTemplate('${String(item.position).replace(/'/g,"\\'")}','${String(item.activityKey).replace(/'/g,"\\'")}')"
                class="text-left rounded-xl border border-slate-100 bg-white p-3 hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="text-xs font-black text-slate-800 truncate">${escHtml(item.position)}</p>
                        <p class="text-[11px] text-slate-500 truncate">${escHtml(item.activityLabel)}${item.unitLabel ? ` · ${escHtml(item.unitLabel)}` : ''}</p>
                    </div>
                    <span class="text-[11px] font-black text-rose-600">${item.employeeCount.toLocaleString()}</span>
                </div>
                    <p class="mt-2 text-[10px] text-slate-400">กระทบ ${item.departmentCount.toLocaleString()} แผนก · เปิดไปตั้งค่า Template</p>
            </button>`).join('')
        : '<p class="text-xs text-slate-400">ไม่มีข้อเสนอแนะ Template ที่ยังขาดในตัวกรองนี้</p>';
    return `
    <div class="rounded-2xl border border-amber-100 bg-white shadow-sm overflow-hidden">
        <div class="p-4 border-b border-amber-50 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3" style="background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(255,255,255,0.9))">
            <div>
                <p class="text-[10px] font-black uppercase tracking-widest text-amber-600">คิวตรวจคุณภาพ / Data Quality Queue</p>
                <h3 class="mt-1 text-sm font-black text-slate-800">รายการเป้าหมายที่แอดมินควรทบทวน</h3>
                <p class="text-xs text-slate-500 mt-1">เริ่มจากรายการที่ยังไม่กำหนดและเป้าเป็น 0 ก่อน ส่วน N/A และระบบคำนวณถือว่าถูกต้องเมื่อกำหนดไว้โดยตั้งใจ</p>
            </div>
            <div class="flex flex-wrap gap-2">
                <button type="button" onclick="window._atMatrixQuick('review')" class="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700">คิวทบทวน</button>
                <button type="button" onclick="window._atMatrixQuick('missing')" class="px-3 py-2 rounded-lg border border-rose-200 bg-white text-rose-700 text-xs font-bold hover:bg-rose-50">ยังไม่กำหนด</button>
                <button type="button" onclick="window._atMatrixQuick('zero')" class="px-3 py-2 rounded-lg border border-orange-200 bg-white text-orange-700 text-xs font-bold hover:bg-orange-50">เป้า 0</button>
                <button type="button" onclick="window._atMatrixExport()" class="px-3 py-2 rounded-lg border border-emerald-200 bg-white text-emerald-700 text-xs font-bold hover:bg-emerald-50">Export มุมมองนี้</button>
            </div>
        </div>
        <div class="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            ${_atMetricCard('ทั้งหมดที่ต้องทบทวน', reviewRows.length, 'missing + zero')}
            ${_atMetricCard('ตามตัวกรองนี้', currentReviewRows.length, 'after filters')}
            ${_atMetricCard('ยังไม่กำหนด', missingRows.length, 'no effective target')}
            ${_atMetricCard('เป้า 0', zeroRows.length, 'target = 0')}
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 px-4 pb-4">
            <div class="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <p class="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">แผนกที่ต้องทบทวนสูงสุด</p>
                <div class="space-y-1.5">${topDepartments.length ? topDepartments.map(line).join('') : '<p class="text-xs text-slate-400">ไม่มีรายการต้องทบทวนในตัวกรองนี้</p>'}</div>
            </div>
            <div class="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <p class="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">กิจกรรมที่ต้องทบทวนสูงสุด</p>
                <div class="space-y-1.5">${topActivities.length ? topActivities.map(line).join('') : '<p class="text-xs text-slate-400">ไม่มีรายการต้องทบทวนในตัวกรองนี้</p>'}</div>
            </div>
        </div>
        <div class="px-4 pb-4">
            <div class="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                <div class="flex items-center justify-between gap-3 mb-3">
                    <div>
                        <p class="text-[11px] font-black uppercase tracking-wider text-indigo-500">คำแนะนำการแก้ไข / Guided Cleanup</p>
                        <p class="text-xs text-slate-500 mt-0.5">จับคู่ตำแหน่งกับกิจกรรมที่ยังขาด เรียงตามจำนวนพนักงานที่ได้รับผลกระทบ</p>
                    </div>
                    <button type="button" onclick="window._atMatrixQuick('missing')" class="px-2.5 py-1.5 rounded-lg bg-white border border-indigo-100 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50">ดูเฉพาะที่ยังขาด</button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">${suggestionHtml}</div>
            </div>
        </div>
    </div>`;
}

function _atRenderMatrixInner(area) {
    const f = _atMatrixFilters;
    if (f.issue === 'na') f.issue = '';
    const rows = _atFilteredMatrixRows();
    const totalPages = _atMatrixPageSize === 'all' ? 1 : Math.max(1, Math.ceil(rows.length / _atMatrixPageSize));
    if (_atMatrixPage > totalPages) _atMatrixPage = totalPages;
    const start = _atMatrixPageSize === 'all' ? 0 : (_atMatrixPage - 1) * _atMatrixPageSize;
    const shown = _atMatrixPageSize === 'all' ? rows : rows.slice(start, start + _atMatrixPageSize);
    const from = rows.length ? start + 1 : 0;
    const to = _atMatrixPageSize === 'all' ? rows.length : Math.min(start + shown.length, rows.length);
    const rosterRows = _atMatrixRows.filter(r => _atSafetyCoreRosterIds.has(String(r.employeeId || '').trim()));
    area.innerHTML = `
    <div class="space-y-4">
        <div class="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
            <div>
                <p class="text-xs font-black text-indigo-800">Year-scoped target matrix</p>
                <p class="text-[11px] text-indigo-700/80">Position Template, Scope Override, and Employee Override are loaded for the selected year with TargetYear=0/legacy fallback.</p>
            </div>
            ${_atYearBadgeHtml()}
        </div>
        <div class="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-10 gap-2">
            ${_atMetricCard('พนักงาน', _atMatrixSummary.employees, 'employees')}
            ${_atMetricCard('Safety Core', new Set(rosterRows.map(r => r.employeeId).filter(Boolean)).size, 'target roster')}
            ${_atMetricCard('จุดตรวจ', _atMatrixSummary.slots, 'slots')}
            ${_atMetricCard('รายบุคคล', _atMatrixSummary.override, 'employee override')}
            ${_atMetricCard('แผนก/Unit', _atMatrixSummary.scope, 'scope override')}
            ${_atMetricCard('ตำแหน่ง', _atMatrixSummary.template, 'position template')}
            ${_atMetricCard('ระบบ', _atMatrixSummary.system, 'dynamic ratio')}
            ${_atMetricCard('ยังไม่กำหนด', _atMatrixSummary.missing, 'missing')}
            ${_atMetricCard('N/A', _atMatrixSummary.na, 'ไม่เกี่ยวข้อง')}
            ${_atMetricCard('เป้า 0', _atMatrixSummary.zero, 'ต้องทบทวน')}
        </div>
        ${_atQualityPanelHtml(rows)}
        <div class="ds-filter-bar grid grid-cols-1 md:grid-cols-3 xl:grid-cols-10 gap-2">
            <select onchange="window._atMatrixFilter('department',this.value)" class="form-input text-xs">${_atMatrixOptions('department','ทุกแผนก')}</select>
            <select onchange="window._atMatrixFilter('unit',this.value)" class="form-input text-xs">${_atMatrixUnitOptions('ทุก Unit')}</select>
            <select onchange="window._atMatrixFilter('position',this.value)" class="form-input text-xs">${_atMatrixOptions('position','ทุกตำแหน่ง')}</select>
            <select onchange="window._atMatrixFilter('activity',this.value)" class="form-input text-xs">
                <option value="">ทุกกิจกรรม</option>${_atActivities.map(a => `<option value="${a.key}" ${f.activity === a.key ? 'selected' : ''}>${escHtml(a.label)}</option>`).join('')}
            </select>
            <select onchange="window._atMatrixFilter('roster',this.value)" class="form-input text-xs">${_atMatrixRosterOptions()}</select>
            <select onchange="window._atMatrixFilter('source',this.value)" class="form-input text-xs">
                <option value="">ทุกแหล่งที่มา</option>${['override','scope','template','system','missing'].map(s => `<option value="${s}" ${f.source === s ? 'selected' : ''}>${escHtml(_atSourceLabel(s))}</option>`).join('')}
            </select>
            <select onchange="window._atMatrixFilter('issue',this.value)" class="form-input text-xs">
                <option value="">ทุกประเด็น</option>${['review','missing','zero'].map(s => `<option value="${s}" ${f.issue === s ? 'selected' : ''}>${escHtml(_atIssueLabel(s))}</option>`).join('')}
            </select>
            <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
                <input type="checkbox" ${f.review ? 'checked' : ''} onchange="window._atMatrixFilter('review',this.checked)"> ต้องทบทวน
            </label>
            <select onchange="window._atMatrixSetPageSize(this.value)" class="form-input text-xs">
                ${[10, 20, 50].map(n => `<option value="${n}" ${_atMatrixPageSize === n ? 'selected' : ''}>แสดง ${n}</option>`).join('')}
                <option value="all" ${_atMatrixPageSize === 'all' ? 'selected' : ''}>ทั้งหมด</option>
            </select>
            <div class="flex items-center justify-end text-xs text-slate-400">${from.toLocaleString()}-${to.toLocaleString()} / ${rows.length.toLocaleString()} รายการ</div>
        </div>
        <div class="ds-table-wrap overflow-x-auto">
            <table class="ds-table text-left">
                <thead class="bg-slate-50 border-b border-slate-100"><tr>
                    <th class="px-3 py-3 text-xs font-bold text-slate-500">พนักงาน</th><th class="px-3 py-3 text-xs font-bold text-slate-500">แผนก / Unit</th>
                    <th class="px-3 py-3 text-xs font-bold text-slate-500">ตำแหน่ง</th><th class="px-3 py-3 text-xs font-bold text-slate-500">กิจกรรม</th>
                    <th class="px-3 py-3 text-xs font-bold text-slate-500 text-center">แหล่งที่มา</th><th class="px-3 py-3 text-xs font-bold text-slate-500 text-center">เป้าหมาย</th>
                    <th class="px-3 py-3 text-xs font-bold text-slate-500 text-center"></th>
                </tr></thead>
                <tbody class="divide-y divide-slate-50">${shown.map((r, i) => `
                    <tr class="${r.reviewNeeded ? 'bg-amber-50/50' : 'hover:bg-slate-50'}">
                        <td class="px-3 py-2"><p class="text-xs font-bold text-slate-700">${escHtml(r.employeeName || r.employeeId)}</p><p class="text-[11px] text-slate-400">${escHtml(r.employeeId)}</p></td>
                        <td class="px-3 py-2 text-xs text-slate-600">${escHtml(r.department || '-')}<p class="text-[11px] text-slate-400">${escHtml(r.unit || 'ทั้งแผนก')}</p></td>
                        <td class="px-3 py-2 text-xs text-slate-600">${escHtml(r.position || '-')}</td>
                        <td class="px-3 py-2 text-xs font-bold text-slate-700">${escHtml(r.activityLabel)}<div>${_atActivityMeta(r)}</div></td>
                        <td class="px-3 py-2 text-center">${_atMatrixSourceBadge(r)}</td>
                        <td class="px-3 py-2 text-center text-xs font-bold ${r.isZero ? 'text-rose-600' : 'text-slate-700'}">${r.isNA ? 'N/A' : r.metricType === 'dynamic_ratio' ? 'ระบบคำนวณ' : `${r.yearlyTarget ?? '-'} ${escHtml(r.unitLabel || '')}`}</td>
                        <td class="px-3 py-2 text-center"><button onclick="window._atMatrixEdit(${_atMatrixRows.indexOf(r)})" class="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:border-indigo-200 hover:text-indigo-700">แก้ไข</button></td>
                    </tr>`).join('') || `<tr><td colspan="7" class="px-4 py-12 text-center text-sm text-slate-400">ไม่พบรายการตามตัวกรอง</td></tr>`}</tbody>
            </table>
        </div>
        ${_atMatrixPagerHtml(totalPages, rows.length, from, to)}
    </div>`;
}

function _atMatrixFilter(key, value) {
    _atMatrixFilters[key] = value;
    _atMatrixPage = 1;
    if (key === 'department') {
        const validUnits = new Set(_atMatrixUnitValues());
        if (_atMatrixFilters.unit && !validUnits.has(_atMatrixFilters.unit)) _atMatrixFilters.unit = '';
    }
    const area = document.getElementById('at-content');
    if (area) _atRenderMatrixInner(area);
}

function _atMatrixQuick(issue) {
    _atMatrixFilters.issue = issue === 'all' ? '' : issue;
    _atMatrixFilters.review = issue === 'review';
    if (issue === 'missing') _atMatrixFilters.source = 'missing';
    else if (_atMatrixFilters.source === 'missing') _atMatrixFilters.source = '';
    _atMatrixPage = 1;
    const area = document.getElementById('at-content');
    if (area) _atRenderMatrixInner(area);
}

function _atMatrixSetPage(page) {
    _atMatrixPage = Math.max(1, Number(page || 1));
    const area = document.getElementById('at-content');
    if (area) _atRenderMatrixInner(area);
}

function _atMatrixSetPageSize(value) {
    _atMatrixPageSize = value === 'all' ? 'all' : Number(value || 10);
    _atMatrixPage = 1;
    const area = document.getElementById('at-content');
    if (area) _atRenderMatrixInner(area);
}

function _atMatrixPagerHtml(totalPages, totalRows, from, to) {
    if (_atMatrixPageSize === 'all') {
        return `<div class="px-4 py-3 border border-slate-100 rounded-xl bg-white text-xs text-slate-400">แสดงทั้งหมด ${totalRows.toLocaleString()} รายการ โดยซ่อน N/A แล้ว</div>`;
    }
    return `
    <div class="px-4 py-3 border border-slate-100 rounded-xl bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="text-xs text-slate-400">แสดง ${from.toLocaleString()}-${to.toLocaleString()} จาก ${totalRows.toLocaleString()} รายการ · ซ่อน N/A แล้ว · เรียงตาม Safety Core Data</div>
        <div class="flex items-center justify-end gap-2">
            <button type="button" onclick="window._atMatrixSetPage(${_atMatrixPage - 1})" ${_atMatrixPage <= 1 ? 'disabled' : ''}
                class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold ${_atMatrixPage <= 1 ? 'bg-slate-50 text-slate-300 cursor-not-allowed' : 'bg-white text-slate-600 hover:bg-slate-50'}">ก่อนหน้า</button>
            <span class="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-black">${_atMatrixPage} / ${totalPages}</span>
            <button type="button" onclick="window._atMatrixSetPage(${_atMatrixPage + 1})" ${_atMatrixPage >= totalPages ? 'disabled' : ''}
                class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold ${_atMatrixPage >= totalPages ? 'bg-slate-50 text-slate-300 cursor-not-allowed' : 'bg-white text-slate-600 hover:bg-slate-50'}">ถัดไป</button>
        </div>
    </div>`;
}

function _atMatrixExport() {
    const rows = _atFilteredMatrixRows();
    if (!rows.length) {
        showToast('ไม่มีข้อมูลสำหรับ export', 'warning');
        return;
    }
    const data = rows.map(r => ({
        EmployeeID: r.employeeId || '',
        EmployeeName: r.employeeName || '',
        Department: r.department || '',
        Unit: r.unit || '',
        Position: r.position || '',
        SafetyCoreData: _atSafetyCoreRosterIds.has(String(r.employeeId || '').trim()) ? 'Yes' : 'No',
        ActivityKey: r.activityKey || '',
        Activity: r.activityLabel || '',
        MetricType: r.metricType || '',
        Source: _atSourceLabel(r.source),
        Issue: r.reviewNeeded ? (r.source === 'missing' ? _atIssueLabel('missing') : r.isZero ? _atIssueLabel('zero') : _atIssueLabel('review')) : (r.isNA ? _atIssueLabel('na') : ''),
        YearlyTarget: r.isNA ? 'N/A' : r.metricType === 'dynamic_ratio' ? 'ระบบคำนวณ / System Ratio' : (r.yearlyTarget ?? ''),
        UnitLabel: r.unitLabel || '',
        PassPct: r.passPct ?? '',
    }));
    const date = new Date().toISOString().slice(0, 10);
    if (window.XLSX) {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Activity Target Quality');
        XLSX.writeFile(wb, `Activity_Target_Quality_${date}.xlsx`);
    } else {
        const headers = Object.keys(data[0]);
        const csv = [headers.join(','), ...data.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: `Activity_Target_Quality_${date}.csv` });
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        a.remove();
    }
    showToast(`Export เป้าหมายกิจกรรม ${rows.length.toLocaleString()} รายการสำเร็จ`, 'success');
}

function _atGuideTemplate(position, activityKey = '') {
    _atSelPosition = position || '';
    _atTemplateFocusActivity = activityKey || '';
    _atSwitchSubTab('template');
}

async function _atMatrixEdit(index) {
    const row = _atMatrixRows[index];
    if (!row) return;
    if (row.source === 'override') {
        _atSwitchSubTab('person');
        await _atSelectEmp(row.employeeId, row.employeeName, row.position);
        return;
    }
    if (row.source === 'scope') {
        _atSelDept = row.scope?.department || row.department;
        _atSelUnit = row.scope?.unit || '';
        _atSwitchSubTab('scope');
        return;
    }
    if (row.source === 'system') {
        _atSelDept = row.department || '';
        _atSelUnit = '';
        _atSwitchSubTab('scope');
        return;
    }
    _atSelPosition = row.position || '';
    _atSwitchSubTab('template');
}

// ── Sub-tab 2: Department / Unit Override ───────────────────────────────────
function _atDeptIdByName(name) {
    const row = (_atDeptRows || []).find(d => (d.Name || d.Department || d.name || d) === name) || {};
    return row.id || row.ID || row.department_id || null;
}

function _atUnitsForDeptName(name) {
    const deptId = _atDeptIdByName(name);
    if (!deptId) return [];
    return (_atUnits || []).filter(u => Number(u.department_id) === Number(deptId));
}

function _renderAtScope(area) {
    const deptOptions = _atDepartments.map(d =>
        `<option value="${escHtml(d)}" ${d === _atSelDept ? 'selected' : ''}>${escHtml(d)}</option>`
    ).join('');

    area.innerHTML = `
    <div class="space-y-5">
        <div class="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <div>
                <p class="text-xs font-black text-emerald-800">Year-scoped scope overrides</p>
                <p class="text-[11px] text-emerald-700/80">Saved values apply to the selected TargetYear only.</p>
            </div>
            ${_atYearBadgeHtml()}
        </div>
        <div class="ds-filter-bar space-y-3">
            <div>
                <p class="text-sm font-bold text-slate-700">ตั้งเป้าหมายตามแผนก/หน่วยงาน</p>
                <p class="text-xs text-slate-500 mt-1">ใช้เมื่อแผนกหรือ Safety Unit มี target ต่างจาก Position Template กลาง เช่น Production ต้องทำ KY มากกว่า Office</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-3 items-end">
                <label class="block">
                    <span class="text-xs font-bold text-slate-500 uppercase">แผนก / Department</span>
                    <select id="at-scope-dept" onchange="window._atScopeDeptChanged(this.value)"
                        class="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                        <option value="">-- เลือกแผนก --</option>
                        ${deptOptions}
                    </select>
                </label>
                <label class="block">
                    <span class="text-xs font-bold text-slate-500 uppercase">ขอบเขต Unit / Unit Scope</span>
                    <select id="at-scope-unit" onchange="window._atLoadScope(document.getElementById('at-scope-dept')?.value || '', this.value)"
                        class="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                        ${_atScopeUnitOptions(_atSelDept, _atSelUnit)}
                    </select>
                </label>
                <button type="button" onclick="window._atLoadScope(document.getElementById('at-scope-dept')?.value || '', document.getElementById('at-scope-unit')?.value || '')"
                    class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">โหลดค่า</button>
            </div>
            <div class="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-800">
                ลำดับการใช้ค่า: รายบุคคล > แผนก/Unit > ตำแหน่ง. ถ้าเลือก Unit เป็น “ทั้งแผนก” ระบบจะใช้กับทุกคนในแผนกที่ไม่มี override เฉพาะ Unit.
            </div>
        </div>
        <div id="at-scope-grid">
            <div class="text-center py-16 text-slate-400">
                <p class="font-medium">เลือก Department และ Unit Scope เพื่อจัดการเป้าหมาย</p>
            </div>
        </div>
    </div>`;

    window._atScopeDeptChanged = (dept) => {
        _atSelDept = dept;
        _atSelUnit = '';
        const unitSel = document.getElementById('at-scope-unit');
        if (unitSel) unitSel.innerHTML = _atScopeUnitOptions(dept, '');
        _atLoadScope(dept, '');
    };

    if (_atSelDept) _atLoadScope(_atSelDept, _atSelUnit);
}

function _atScopeUnitOptions(dept, selected) {
    const units = _atUnitsForDeptName(dept);
    return `
        <option value="" ${selected === '' ? 'selected' : ''}>ทั้งแผนก / Department-wide</option>
        ${units.map(u => {
            const name = u.name || u.Name || '';
            return `<option value="${escHtml(name)}" ${name === selected ? 'selected' : ''}>${escHtml(name)}</option>`;
        }).join('')}`;
}

async function _atLoadScope(dept, unit = '') {
    _atSelDept = String(dept || '').trim();
    _atSelUnit = String(unit || '').trim();
    const grid = document.getElementById('at-scope-grid');
    if (!grid) return;
    if (!_atSelDept) {
        grid.innerHTML = `<div class="text-center py-16 text-slate-400"><p class="font-medium">เลือก Department เพื่อจัดการเป้าหมาย</p></div>`;
        return;
    }
    grid.innerHTML = `<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-9 w-9 border-4 border-emerald-500 border-t-transparent"></div></div>`;
    try {
        const qs = new URLSearchParams({ department: _atSelDept, unit: _atSelUnit, TargetYear: _atTargetYearParam() });
        const res = await API.get(`/activity-targets/scope-overrides?${qs.toString()}`);
        const rowMap = {};
        (res.data || []).forEach(r => { rowMap[r.ActivityKey] = r; });
        grid.innerHTML = _atScopeGridHtml(_atSelDept, _atSelUnit, rowMap);
    } catch (e) {
        grid.innerHTML = `<div class="py-8 text-center text-red-400 text-sm">โหลดไม่ได้: ${e.message}</div>`;
    }
}

function _atScopeGridHtml(dept, unit, rowMap) {
    const scopeLabel = unit ? `${dept} · ${unit}` : `${dept} · ทั้งแผนก`;
    const rows = _atActivities.map(a => {
        const d = rowMap[a.key] || {};
        const exists = Boolean(d.ActivityKey);
        const isNA = d.IsNA === 1 || d.IsNA === true || d.IsNA === '1';
        const dimCls = isNA ? 'opacity-40 pointer-events-none select-none' : '';
        return `
        <tr class="hover:bg-slate-50 transition-colors ${isNA ? 'bg-slate-50/60' : ''}">
            <td class="px-4 py-3">
                <p class="text-sm font-semibold ${isNA ? 'line-through text-slate-400' : 'text-slate-800'}">${a.label}</p>
                <p class="text-xs text-slate-400 mt-0.5">${a.desc}</p>
                ${_atActivityMeta(a)}
            </td>
            <td class="px-4 py-3 text-center">
                ${exists ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">${_atSourceLabel('scope')}</span>` : _atIsDynamic(a) ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">${_atSourceLabel('system')}</span>` : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">ใช้ค่าตำแหน่ง / Position</span>`}
            </td>
            <td class="px-4 py-3 text-center ${dimCls}">
                ${_atTargetEditor(a, `scope-${a.key}-target`, d.YearlyTarget, 'ว่าง = ใช้ Position', isNA, 'emerald')}
            </td>
            <td class="px-4 py-3 text-center ${dimCls}">
                <div class="flex items-center gap-1 justify-center">
                    <input id="scope-${a.key}-pct" type="number" min="0" max="100" value="${isNA ? '' : (d.PassPct ?? 80)}"
                        ${isNA ? 'disabled' : ''}
                        class="w-16 px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100">
                    <span class="text-xs text-slate-400">%</span>
                </div>
            </td>
            <td class="px-4 py-3">
                <div class="flex gap-1.5 justify-center flex-wrap">
                    ${!isNA ? `
                    <button onclick="window._atSaveScope('${dept.replace(/'/g,"\\'")}','${unit.replace(/'/g,"\\'")}','${a.key}',this)"
                        class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors">บันทึก</button>` : ''}
                    <button onclick="window._atToggleScopeNA('${dept.replace(/'/g,"\\'")}','${unit.replace(/'/g,"\\'")}','${a.key}',${isNA ? 0 : 1},this)"
                        class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${isNA ? 'border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'border-slate-200 text-slate-500 bg-slate-50 hover:bg-slate-100'}">
                        ${isNA ? 'ยกเลิก N/A' : 'N/A'}
                    </button>
                    ${exists ? `
                    <button onclick="window._atClearScope('${dept.replace(/'/g,"\\'")}','${unit.replace(/'/g,"\\'")}','${a.key}',this)"
                        title="ลบ scope override และกลับไปใช้ Position Template"
                        class="px-2 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">ลบ</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
    return `
    <div class="ds-table-wrap">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
                <p class="text-sm font-bold text-slate-700">ตั้งตามแผนก/Unit: <span class="text-emerald-700">${escHtml(scopeLabel)}</span></p>
                <p class="text-xs text-slate-400 mt-0.5">ช่องที่ไม่บันทึก override จะ fallback ไปใช้ Position Template</p>
            </div>
        </div>
        <div class="px-4 pb-3">${_atYearBadgeHtml()}</div>
        <table class="ds-table text-left">
            <thead class="bg-slate-50 border-b border-slate-100">
                <tr>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">กิจกรรม</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-28">แหล่งที่มา</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-40">เป้าหมาย / ตัวหาร</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-32">เกณฑ์ผ่าน</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-36"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">${rows}</tbody>
        </table>
    </div>`;
}

async function _atSaveScope(dept, unit, actKey, btn) {
    const target = document.getElementById(`scope-${actKey}-target`)?.value;
    const pct = document.getElementById(`scope-${actKey}-pct`)?.value;
    const storedTarget = _atStoredTarget(actKey, target);
    if (storedTarget === null) { alert('กรุณาระบุเป้าหมาย หรือกดลบเพื่อ fallback ไปใช้ Position Template'); return; }
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
    try {
        await API.put('/activity-targets/scope-overrides', { Department: dept, Unit: unit, ActivityKey: actKey, YearlyTarget: storedTarget, PassPct: Number(pct) || 80, IsNA: 0, ..._atTargetYearPayload() });
        await _atLoadScope(dept, unit);
    } catch (e) {
        btn.disabled = false; btn.textContent = orig;
        alert('บันทึกไม่สำเร็จ: ' + e.message);
    }
}

async function _atToggleScopeNA(dept, unit, actKey, setNA, btn) {
    btn.disabled = true;
    try {
        if (setNA) {
            await API.put('/activity-targets/scope-overrides', { Department: dept, Unit: unit, ActivityKey: actKey, YearlyTarget: 0, PassPct: 0, IsNA: 1, ..._atTargetYearPayload() });
        } else {
            await API.put('/activity-targets/scope-overrides', { Department: dept, Unit: unit, ActivityKey: actKey, YearlyTarget: null, ..._atTargetYearPayload() });
        }
        await _atLoadScope(dept, unit);
    } catch (e) {
        btn.disabled = false;
        alert('ไม่สำเร็จ: ' + e.message);
    }
}

async function _atClearScope(dept, unit, actKey, btn) {
    if (!confirm('ลบ scope override นี้ และกลับไปใช้ Position Template?')) return;
    btn.disabled = true;
    try {
        await API.put('/activity-targets/scope-overrides', { Department: dept, Unit: unit, ActivityKey: actKey, YearlyTarget: null, ..._atTargetYearPayload() });
        await _atLoadScope(dept, unit);
    } catch (e) {
        btn.disabled = false;
        alert('ไม่สำเร็จ: ' + e.message);
    }
}

// ── Sub-tab 1: Position Template ─────────────────────────────────────────────
function _renderAtTemplate(area) {
    const posOptions = _atPositions.map(p =>
        `<option value="${p}" ${p === _atSelPosition ? 'selected' : ''}>${p}</option>`
    ).join('');

    area.innerHTML = `
    <div class="space-y-5">
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
            ${_atYearBadgeHtml()}
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
        const sel = document.getElementById('at-pos-sel');
        if (sel && sel.value !== pos) sel.value = pos;
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
            const res = await API.get(`/activity-targets/position-templates?position=${encodeURIComponent(pos)}&TargetYear=${_atTargetYearParam()}`);
            const rows = res.data || [];
            const rowMap = {};
            rows.forEach(r => { rowMap[r.ActivityKey] = r; });
            grid.innerHTML = _atTemplateGridHtml(pos, rowMap);
            if (_atTemplateFocusActivity) {
                setTimeout(() => {
                    document.getElementById(`at-template-row-${_atTemplateFocusActivity}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 80);
            }
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
        const focus = _atTemplateFocusActivity === a.key;
        return `
        <tr id="at-template-row-${escHtml(a.key)}" class="hover:bg-slate-50 transition-colors ${isNA ? 'bg-slate-50/60' : ''} ${focus ? 'bg-indigo-50 ring-2 ring-indigo-200' : ''}">
            <td class="px-4 py-3">
                <p class="text-sm font-semibold ${isNA ? 'line-through text-slate-400' : 'text-slate-800'}">${a.label}${focus ? '<span class="ml-2 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-black">Suggested</span>' : ''}</p>
                <p class="text-xs text-slate-400 mt-0.5">${a.desc}</p>
                ${_atActivityMeta(a)}
            </td>
            <td class="px-4 py-3 text-center ${dimCls}">
                ${_atTargetEditor(a, `tgt-${a.key}-target`, d.YearlyTarget, '0', isNA)}
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
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-40">เป้าหมาย / ตัวหาร</th>
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
    const storedTarget = _atStoredTarget(actKey, target);
    if (storedTarget === null) { alert('กรุณาระบุเป้าหมาย'); return; }
    const orig   = btn.textContent;
    btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
    try {
        await API.put('/activity-targets/position-templates', { PositionName: pos, ActivityKey: actKey, YearlyTarget: storedTarget, PassPct: Number(pct)||80, IsNA: 0, ..._atTargetYearPayload() });
        _atRefreshCoverage();
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
            YearlyTarget: 0, PassPct: 0, IsNA: setNA ? 1 : 0, ..._atTargetYearPayload(),
        });
        // reload grid
        const res = await API.get(`/activity-targets/position-templates?position=${encodeURIComponent(pos)}&TargetYear=${_atTargetYearParam()}`);
        const rowMap = {};
        (res.data || []).forEach(r => { rowMap[r.ActivityKey] = r; });
        const grid = document.getElementById('at-tpl-grid');
        if (grid) grid.innerHTML = _atTemplateGridHtml(pos, rowMap);
        _atRefreshCoverage();
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
        const res = await API.post('/activity-targets/position-templates/bulk-apply', { PositionName: pos, ..._atTargetYearPayload() });
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
        <div class="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
            <div>
                <p class="text-xs font-black text-violet-800">Year-scoped employee overrides</p>
                <p class="text-[11px] text-violet-700/80">Search and save personal targets for the selected TargetYear only.</p>
            </div>
            ${_atYearBadgeHtml()}
        </div>
        <!-- Employee search -->
        <div class="ds-filter-bar space-y-3">
            <p class="text-sm font-semibold text-slate-700">ค้นหาพนักงาน</p>
            <div class="flex flex-col lg:flex-row gap-3">
                <div class="relative flex-1">
                    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                    <input id="at-emp-search" type="text" placeholder="ชื่อ หรือ รหัสพนักงาน..."
                        value="${_atEmpSearch}"
                        class="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                        oninput="window._atSearchEmp(this.value)">
                </div>
                <select onchange="window._atSetPersonRosterOnly(this.value === 'safety_core')"
                    class="form-input text-sm rounded-lg border-slate-200 lg:w-56">
                    <option value="" ${!_atPersonRosterOnly ? 'selected' : ''}>ทุกคน / All employees</option>
                    <option value="safety_core" ${_atPersonRosterOnly ? 'selected' : ''}>เฉพาะ Safety Core Data</option>
                </select>
            </div>
            <p class="text-[11px] text-slate-400">Safety Core Data roster: ${_atSafetyCoreRosterIds.size.toLocaleString()} คน</p>
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

    if (_atSelEmp) {
        const grid = document.getElementById('at-person-grid');
        if (grid) {
            grid.innerHTML = `<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-9 w-9 border-4 border-indigo-500 border-t-transparent"></div></div>`;
            _atReloadSelectedEmpTargets().then(() => _renderAtPersonGrid(grid)).catch(e => {
                grid.innerHTML = `<div class="py-8 text-center text-red-400 text-sm">Load failed: ${escHtml(e.message)}</div>`;
            });
        }
    }
}

function _atRenderEmpDropdown(q) {
    const res_el = document.getElementById('at-emp-results');
    if (!res_el) return;
    const qLow = (q || '').toLowerCase().trim();
    const sourceRows = _atPersonRosterOnly
        ? _empCache.filter(e => _atSafetyCoreRosterIds.has(String(e.EmployeeID || '').trim()))
        : _empCache;
    const list = qLow.length === 0
        ? sourceRows.slice(0, 15)
        : sourceRows.filter(e =>
            (e.EmployeeName || '').toLowerCase().includes(qLow) ||
            (e.EmployeeID   || '').toLowerCase().includes(qLow)
          ).slice(0, 15);

    if (!list.length) {
        res_el.innerHTML = `<div class="text-xs text-slate-400 py-2">ไม่พบพนักงาน</div>`;
        return;
    }
    const hint = sourceRows.length > 15 && !qLow
        ? `<div class="px-3 py-1.5 text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">แสดง 15 รายการแรก — พิมพ์เพื่อค้นหา${_atPersonRosterOnly ? ' จาก Safety Core Data' : ''}</div>`
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

function _atSetPersonRosterOnly(enabled) {
    _atPersonRosterOnly = !!enabled;
    _atRenderEmpDropdown(_atEmpSearch);
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
        const res = await API.get(`/activity-targets/employee/${empId}?TargetYear=${_atTargetYearParam()}`);
        _atEmpTargets = res.data?.targets || [];
        _atSelEmp.Department = res.data?.department || _atSelEmp.Department || '';
        _atSelEmp.Unit = res.data?.unit || _atSelEmp.Unit || '';
        _renderAtPersonGrid(grid);
    } catch (e) {
        grid.innerHTML = `<div class="py-8 text-center text-red-400 text-sm">โหลดไม่ได้: ${e.message}</div>`;
    }
}

async function _atReloadSelectedEmpTargets() {
    if (!_atSelEmp?.EmployeeID) return;
    const res = await API.get(`/activity-targets/employee/${_atSelEmp.EmployeeID}?TargetYear=${_atTargetYearParam()}`);
    _atEmpTargets = res.data?.targets || [];
    _atSelEmp.Department = res.data?.department || _atSelEmp.Department || '';
    _atSelEmp.Unit = res.data?.unit || _atSelEmp.Unit || '';
}

function _renderAtPersonGrid(grid) {
    if (!_atSelEmp) { grid.innerHTML = ''; return; }
    const tgtMap = {};
    _atEmpTargets.forEach(t => { tgtMap[t.activityKey] = t; });

    const sourceLabel = s => {
        if (s === 'override')  return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700">รายบุคคล</span>`;
        if (s === 'scope')     return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">แผนก/Unit</span>`;
        if (s === 'template')  return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">เทมเพลต</span>`;
        if (s === 'system')    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">ระบบคำนวณ</span>`;
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
                ${_atActivityMeta(a)}
            </td>
            <td class="px-4 py-3 text-center">
                ${isNA
                    ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-500">N/A</span>`
                    : sourceLabel(d.source || 'none')}
            </td>
            <td class="px-4 py-3 text-center ${dimCls}">
                ${_atTargetEditor(a, `per-${a.key}-target`, d.yearlyTarget, d.source === 'template' && !isNA ? d.yearlyTarget ?? '-' : '0', isNA)}
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
                <p class="text-xs text-slate-400">${_atSelEmp.EmployeeID}${_atSelEmp.Position ? ' · ' + _atSelEmp.Position : ''}${_atSelEmp.Department ? ' · ' + _atSelEmp.Department : ''}${_atSelEmp.Unit ? ' · ' + _atSelEmp.Unit : ''}</p>
            </div>
            <p class="text-xs text-slate-400">วัดผลรายปี · รายบุคคล > แผนก/Unit > เทมเพลต</p>
        </div>
        <table class="ds-table text-left">
            <thead class="bg-slate-50 border-b border-slate-100">
                <tr>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">กิจกรรม</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-28">แหล่งที่มา</th>
                    <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center w-40">เป้าหมาย / ตัวหาร</th>
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
    const storedTarget = _atStoredTarget(actKey, target);
    if (storedTarget === null) { alert('กรุณาระบุเป้าหมาย'); return; }
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
    try {
        await API.put(`/activity-targets/employee/${empId}`, { ActivityKey: actKey, YearlyTarget: storedTarget, PassPct: Number(pct)||80, ..._atTargetYearPayload() });
        // refresh targets for this employee
        const res = await API.get(`/activity-targets/employee/${empId}?TargetYear=${_atTargetYearParam()}`);
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
        await API.put(`/activity-targets/employee/${empId}`, { ActivityKey: actKey, YearlyTarget: null, ..._atTargetYearPayload() });
        const res = await API.get(`/activity-targets/employee/${empId}?TargetYear=${_atTargetYearParam()}`);
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
            await API.put(`/activity-targets/employee/${empId}`, { ActivityKey: actKey, YearlyTarget: 0, PassPct: 0, IsNA: 1, ..._atTargetYearPayload() });
        } else {
            // clear N/A — remove override entirely → revert to template
            await API.put(`/activity-targets/employee/${empId}`, { ActivityKey: actKey, YearlyTarget: null, ..._atTargetYearPayload() });
        }
        const res = await API.get(`/activity-targets/employee/${empId}?TargetYear=${_atTargetYearParam()}`);
        _atEmpTargets = res.data?.targets || [];
        const grid = document.getElementById('at-person-grid');
        if (grid) _renderAtPersonGrid(grid);
    } catch (e) {
        btn.disabled = false;
        alert('ไม่สำเร็จ: ' + e.message);
    }
}
