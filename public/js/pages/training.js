// public/js/pages/training.js
// Safety Training — department-based records (enterprise pattern)
import { API } from '../api.js';
import { openModal, closeModal, showToast, showConfirmationModal } from '../ui.js';
import { buildActivityCard } from '../utils/activity-widget.js';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _isAdmin        = false;
let _activeTab      = 'dashboard';
let _statsYear      = new Date().getFullYear();
let _deptRecords    = [];   // raw Training_Dept_Records rows
let _allDepts       = [];   // from master/departments
let _recYear        = new Date().getFullYear();
let _listenersReady = false;
let _chartBar       = null;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadTrainingPage() {
    const container = document.getElementById('training-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _isAdmin = user.role === 'Admin' || user.Role === 'Admin';

    window.closeModal = closeModal;

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    _activeTab = window._getTab?.('training', _activeTab) || _activeTab;
    switchTab(_activeTab);
    _loadHeroStats();
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB CONFIG
// ─────────────────────────────────────────────────────────────────────────────
function _getTabs() {
    return [
        { id: 'dashboard', label: 'ภาพรวม',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
        { id: 'records', label: 'บันทึกการอบรม',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` },
        ...(_isAdmin ? [{
            id: 'courses', label: 'หลักสูตร',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>`
        }] : []),
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);

    const tabHtml = _getTabs().map(t => `
        <button id="tr-tab-btn-${t.id}" data-tab="${t.id}"
            class="tr-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="tr-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#tr-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                                </svg>
                                Safety Training
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">บันทึกและติดตามผลการอบรม</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Training Status รายแผนก · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-shrink-0 w-full md:w-auto">
                        <!-- Stats strip -->
                        <div id="tr-stats-strip" class="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full sm:w-auto">
                            ${['—','—','—','—'].map((v, i) => {
                                const labels = ['แผนกทั้งหมด','พนักงานเข้าอบรม','ผ่านการอบรม','Pass Rate'];
                                return `<div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
                                    <p class="text-2xl font-bold text-white tr-stat-val" data-idx="${i}">${v}</p>
                                    <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${labels[i]}</p>
                                </div>`;
                            }).join('')}
                        </div>
                        <!-- Actions -->
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <select id="tr-year-sel" class="rounded-xl px-3 py-2 text-xs font-semibold text-white border border-white/30 bg-white/15 outline-none">
                                ${years.map(y => `<option value="${y}" ${y===_statsYear?'selected':''} class="text-slate-800 bg-white">${y}</option>`).join('')}
                            </select>
                            ${_isAdmin ? `
                            <button id="tr-btn-add-record" class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white border border-white/30 bg-white/15 hover:bg-white/25 transition-all whitespace-nowrap">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                บันทึกอบรม
                            </button>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Tab bar -->
                <div class="flex overflow-x-auto gap-0 -mb-px scrollbar-none">
                    ${tabHtml}
                </div>
            </div>
        </div>

        <!-- ═══ TAB PANELS ═══ -->
        <div id="tr-panel-dashboard" class="hidden"></div>
        <div id="tr-panel-records"   class="hidden"></div>
        <div id="tr-panel-courses"   class="hidden"></div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS (once, document-level delegation)
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', e => {
        const tabBtn = e.target.closest('.tr-tab');
        if (tabBtn?.dataset?.tab) { switchTab(tabBtn.dataset.tab); return; }

        if (e.target.closest('#tr-btn-add-record')) { openDeptRecordForm(null); return; }
    });

    document.addEventListener('change', e => {
        if (e.target?.id === 'tr-year-sel') {
            _statsYear = parseInt(e.target.value) || new Date().getFullYear();
            _loadHeroStats();
            if (_activeTab === 'dashboard') _renderDashboardPanel();
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SWITCH TAB
// ─────────────────────────────────────────────────────────────────────────────
function switchTab(tab) {
    _activeTab = tab;
    window._saveTab?.('training', tab);

    _getTabs().forEach(t => {
        const btn = document.getElementById(`tr-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === tab
            ? 'tr-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white'
            : 'tr-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';
    });

    ['dashboard','records','courses'].forEach(id => {
        document.getElementById(`tr-panel-${id}`)?.classList.add('hidden');
    });
    document.getElementById(`tr-panel-${tab}`)?.classList.remove('hidden');

    if (tab === 'dashboard') _renderDashboardPanel();
    if (tab === 'records')   _renderRecordsPanel();
    if (tab === 'courses')   _renderCoursesPanel();
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO STATS (async fill)
// ─────────────────────────────────────────────────────────────────────────────
async function _loadHeroStats() {
    try {
        const res = await API.get(`/training/dept-summary?year=${_statsYear}`);
        const o   = res?.data?.overall || {};
        const vals = [
            o.deptCount   ?? 0,
            o.totalEmp    ?? 0,
            o.totalPassed ?? 0,
            (o.passRate   ?? 0) + '%',
        ];
        document.querySelectorAll('.tr-stat-val').forEach(el => {
            const i = parseInt(el.dataset.idx);
            if (vals[i] !== undefined) el.textContent = vals[i];
        });
    } catch { /* silent */ }

    // Append personal activity target card (only once per page load)
    const strip = document.getElementById('tr-stats-strip');
    if (strip && !strip.querySelector('.at-card')) {
        const atCard = await buildActivityCard('training');
        if (atCard) {
            // Wrap with marker class so we don't append twice on year-change
            strip.insertAdjacentHTML('beforeend',
                atCard.replace('<div class="rounded-xl', '<div class="at-card rounded-xl'));
            strip.className = 'grid grid-cols-3 sm:grid-cols-5 gap-3 w-full sm:w-auto';
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA FETCHERS
// ─────────────────────────────────────────────────────────────────────────────
async function _fetchDepts() {
    try {
        const res = await API.get('/master/departments');
        const raw = res?.data ?? res;
        _allDepts = (Array.isArray(raw) ? raw : [])
            .map(d => d.Name || d.name || '')
            .filter(Boolean);
    } catch { _allDepts = []; }
}

async function _fetchDeptRecords(year) {
    try {
        const q = year ? `?year=${year}` : '';
        const res = await API.get(`/training/dept-records${q}`);
        _deptRecords = res.data || [];
    } catch { _deptRecords = []; }
}

let _coursesCache = [];   // module-level cache so form doesn't refetch every open

async function _fetchCourses() {
    try {
        const res  = await API.get('/training/courses');
        _coursesCache = res.data || [];
        return _coursesCache;
    } catch { _coursesCache = []; return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD PANEL
// ─────────────────────────────────────────────────────────────────────────────
async function _renderDashboardPanel() {
    const panel = document.getElementById('tr-panel-dashboard');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    let summary = null;
    let courses  = [];
    let allRecs  = [];
    try {
        const [sumRes, courseRes, recRes] = await Promise.all([
            API.get(`/training/dept-summary?year=${_statsYear}`),
            API.get(`/training/course-summary?year=${_statsYear}`),
            API.get(`/training/dept-records?year=${_statsYear}`),
        ]);
        summary  = sumRes.data    || null;
        courses  = courseRes.data || [];
        allRecs  = recRes.data    || [];
    } catch { /* silent */ }

    const o        = summary?.overall || {};
    const byDept   = summary?.byDept  || [];
    const deptCnt  = parseInt(o.deptCount)   || 0;
    const totalEmp = parseInt(o.totalEmp)    || 0;
    const passed   = parseInt(o.totalPassed) || 0;
    const failed   = totalEmp - passed;
    const passRate = parseInt(o.passRate)    || 0;

    const showMatrix = courses.length >= 2;

    panel.innerHTML = `
    <div class="space-y-6">

        <!-- KPI Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                        <svg class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                        </svg>
                    </div>
                    <p class="text-xs text-slate-500 font-medium">แผนกที่บันทึก</p>
                </div>
                <p class="text-3xl font-bold text-slate-800">${deptCnt}</p>
                <p class="text-xs text-slate-400 mt-1">แผนก · ปี ${_statsYear}</p>
            </div>

            <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                        <svg class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                    </div>
                    <p class="text-xs text-slate-500 font-medium">พนักงานเข้าอบรม</p>
                </div>
                <p class="text-3xl font-bold text-slate-800">${totalEmp.toLocaleString()}</p>
                <p class="text-xs text-slate-400 mt-1">คน</p>
            </div>

            <div class="bg-white rounded-xl p-5 border border-emerald-200 shadow-sm">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                        <svg class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <p class="text-xs text-emerald-600 font-medium">ผ่านการอบรม</p>
                </div>
                <p class="text-3xl font-bold text-emerald-600">${passed.toLocaleString()}</p>
                <p class="text-xs text-slate-400 mt-1">ไม่ผ่าน ${failed.toLocaleString()} คน</p>
            </div>

            <div class="bg-white rounded-xl p-5 border border-emerald-200 shadow-sm">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                        <svg class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                        </svg>
                    </div>
                    <p class="text-xs text-emerald-600 font-medium">Pass Rate</p>
                </div>
                <p class="text-3xl font-bold text-emerald-700">${passRate}%</p>
                <div class="mt-2 w-full bg-slate-100 rounded-full h-1.5">
                    <div class="h-1.5 rounded-full transition-all" style="width:${passRate}%;background:linear-gradient(90deg,#059669,#0d9488)"></div>
                </div>
            </div>
        </div>

        <!-- Department Compliance Chart -->
        <div class="ds-section overflow-hidden">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
            <div class="p-5">
                <div class="flex items-center gap-2 mb-4">
                    <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">Compliance รายแผนก (${_statsYear})</h3>
                </div>
                ${byDept.length === 0
                    ? `<div class="text-center py-12 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูล</p></div>`
                    : `<div style="height:${Math.max(200, byDept.length * 36)}px"><canvas id="tr-chart-dept"></canvas></div>`}
            </div>
        </div>

        <!-- Course Summary + Dept Summary (2-col) -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

            <!-- Course Summary -->
            <div class="ds-section overflow-hidden">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">สรุปรายหลักสูตร</h3>
                    </div>
                    ${_buildCourseSummaryTable(courses)}
                </div>
            </div>

            <!-- Dept Summary -->
            <div class="ds-section overflow-hidden">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">สรุปรายแผนก</h3>
                    </div>
                    ${_buildDeptSummaryTable(byDept)}
                </div>
            </div>

        </div>

        ${showMatrix ? `
        <!-- Dept × Course Matrix -->
        <div class="ds-section overflow-hidden">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
            <div class="p-5">
                <div class="flex items-center gap-2 mb-4">
                    <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18M10 3v18M14 3v18"/>
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">Progress Matrix: แผนก × หลักสูตร</h3>
                </div>
                ${_buildDeptCourseMatrix(allRecs, courses)}
            </div>
        </div>` : ''}

    </div>`;

    if (byDept.length > 0) setTimeout(() => _initDeptChart(byDept), 0);
}

function _buildDeptSummaryTable(byDept) {
    if (!byDept.length) {
        return `<div class="text-center py-10 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูล</p></div>`;
    }

    const rows = byDept.map(d => {
        const total  = parseInt(d.TotalEmp)    || 0;
        const passed = parseInt(d.PassedCount) || 0;
        const hasData = total > 0;
        const pct    = hasData ? Math.round(passed * 100 / total) : null;
        const barClr = pct === null ? '#e2e8f0' : pct >= 80 ? '#059669' : pct >= 60 ? '#d97706' : '#ef4444';

        const complianceCell = hasData
            ? `<div class="flex items-center gap-2">
                   <div class="flex-1 bg-slate-100 rounded-full h-1.5">
                       <div class="h-1.5 rounded-full" style="width:${pct}%;background:${barClr}"></div>
                   </div>
                   <span class="text-xs font-semibold w-9 text-right ${pct>=80?'text-emerald-700':pct>=60?'text-amber-600':'text-red-500'}">${pct}%</span>
               </div>`
            : `<span class="text-xs text-slate-300">ยังไม่มีข้อมูล</span>`;

        return `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="py-2.5 pr-3 font-medium text-sm text-slate-800">${d.Department}</td>
            <td class="py-2.5 px-2 text-center text-sm text-slate-600">${hasData ? total.toLocaleString() : '—'}</td>
            <td class="py-2.5 px-2 text-center text-sm ${hasData ? 'text-emerald-600 font-semibold' : 'text-slate-300'}">${hasData ? passed.toLocaleString() : '—'}</td>
            <td class="py-2.5 pl-2 min-w-[140px]">${complianceCell}</td>
        </tr>`;
    }).join('');

    return `
    <div class="overflow-x-auto">
        <table class="ds-table text-left border-collapse text-sm">
            <thead>
                <tr class="border-b border-slate-100">
                    <th class="pb-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                    <th class="pb-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">พนักงาน</th>
                    <th class="pb-2 px-2 text-xs font-semibold text-emerald-600 uppercase tracking-wide text-center">ผ่าน</th>
                    <th class="pb-2 pl-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Compliance</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

function _buildCourseSummaryTable(courses) {
    if (!courses.length) {
        return `<div class="text-center py-10 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูล</p></div>`;
    }

    const rows = courses.map(c => {
        const total  = parseInt(c.totalEmp)    || 0;
        const passed = parseInt(c.passedCount) || 0;
        const pct    = total > 0 ? Math.round(passed * 100 / total) : null;
        const barClr = pct === null ? '#e2e8f0' : pct >= 80 ? '#059669' : pct >= 60 ? '#d97706' : '#ef4444';
        const pctLabel = pct === null ? '—' : pct + '%';
        const pctCls   = pct === null ? 'text-slate-300' : pct >= 80 ? 'text-emerald-700' : pct >= 60 ? 'text-amber-600' : 'text-red-500';

        const codeChip = c.CourseCode
            ? `<span class="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-500 mr-1">${c.CourseCode}</span>`
            : '';

        return `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="py-2.5 pr-3 text-sm text-slate-800">${codeChip}${c.CourseName}</td>
            <td class="py-2.5 px-2 text-center text-xs text-slate-500">${parseInt(c.deptCount) || 0}</td>
            <td class="py-2.5 px-2 text-center text-sm text-slate-600">${total.toLocaleString()}</td>
            <td class="py-2.5 px-2 text-center text-sm text-emerald-600 font-semibold">${passed.toLocaleString()}</td>
            <td class="py-2.5 pl-2 min-w-[120px]">
                <div class="flex items-center gap-2">
                    <div class="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div class="h-1.5 rounded-full" style="width:${pct??0}%;background:${barClr}"></div>
                    </div>
                    <span class="text-xs font-semibold w-8 text-right ${pctCls}">${pctLabel}</span>
                </div>
            </td>
        </tr>`;
    }).join('');

    return `
    <div class="overflow-x-auto">
        <table class="ds-table text-left border-collapse text-sm">
            <thead>
                <tr class="border-b border-slate-100">
                    <th class="pb-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">หลักสูตร</th>
                    <th class="pb-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">แผนก</th>
                    <th class="pb-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">พนักงาน</th>
                    <th class="pb-2 px-2 text-xs font-semibold text-emerald-600 uppercase tracking-wide text-center">ผ่าน</th>
                    <th class="pb-2 pl-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pass Rate</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

function _buildDeptCourseMatrix(records, courses) {
    if (!records.length || !courses.length) {
        return `<div class="text-center py-10 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูล</p></div>`;
    }

    // Unique depts (sorted) from records
    const depts = [...new Set(records.map(r => r.Department))].sort();

    // Build lookup: dept+courseId → { total, passed }
    const lookup = new Map();
    for (const r of records) {
        const key = `${r.Department}::${r.CourseID ?? '__null__'}`;
        const cur = lookup.get(key) || { total: 0, passed: 0 };
        cur.total  += parseInt(r.TotalEmp)    || 0;
        cur.passed += parseInt(r.PassedCount) || 0;
        lookup.set(key, cur);
    }

    // Dept overall (across all courses in records)
    const deptTotals = new Map();
    for (const r of records) {
        const cur = deptTotals.get(r.Department) || { total: 0, passed: 0 };
        cur.total  += parseInt(r.TotalEmp)    || 0;
        cur.passed += parseInt(r.PassedCount) || 0;
        deptTotals.set(r.Department, cur);
    }

    function pctBadge(total, passed) {
        if (!total) return `<span class="text-xs text-slate-300">—</span>`;
        const pct = Math.round(passed * 100 / total);
        const bg  = pct >= 80 ? 'bg-emerald-100 text-emerald-700' : pct >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600';
        return `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${bg}">${pct}%</span>`;
    }

    const headerCols = courses.map(c => {
        const name = c.CourseName.length > 18 ? c.CourseName.slice(0, 17) + '…' : c.CourseName;
        return `<th class="pb-2 px-2 text-xs font-semibold text-slate-500 text-center whitespace-nowrap" title="${c.CourseName}">${name}</th>`;
    }).join('');

    const bodyRows = depts.map(dept => {
        const ov = deptTotals.get(dept) || { total: 0, passed: 0 };
        const courseCells = courses.map(c => {
            const key  = `${dept}::${c.CourseID ?? '__null__'}`;
            const data = lookup.get(key);
            return `<td class="py-2 px-2 text-center">${data ? pctBadge(data.total, data.passed) : '<span class="text-xs text-slate-200">—</span>'}</td>`;
        }).join('');

        return `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="py-2 pr-3 text-sm font-medium text-slate-700 whitespace-nowrap">${dept}</td>
            ${courseCells}
            <td class="py-2 pl-3 text-center border-l border-slate-100">${pctBadge(ov.total, ov.passed)}</td>
        </tr>`;
    }).join('');

    return `
    <div class="overflow-x-auto">
        <table class="ds-table text-left border-collapse text-sm">
            <thead>
                <tr class="border-b border-slate-100">
                    <th class="pb-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                    ${headerCols}
                    <th class="pb-2 pl-3 text-xs font-semibold text-emerald-600 uppercase tracking-wide text-center border-l border-slate-100">รวม</th>
                </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
        </table>
    </div>`;
}

function _initDeptChart(byDept) {
    const canvas = document.getElementById('tr-chart-dept');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_chartBar) { _chartBar.destroy(); _chartBar = null; }

    const sorted = [...byDept].sort((a, b) => {
        const pctA = parseInt(a.TotalEmp) ? Math.round(parseInt(a.PassedCount)*100/parseInt(a.TotalEmp)) : 0;
        const pctB = parseInt(b.TotalEmp) ? Math.round(parseInt(b.PassedCount)*100/parseInt(b.TotalEmp)) : 0;
        return pctA - pctB;
    });

    const labels    = sorted.map(d => d.Department.length > 22 ? d.Department.slice(0,21)+'…' : d.Department);
    const passedPct = sorted.map(d => {
        const t = parseInt(d.TotalEmp) || 0;
        const p = parseInt(d.PassedCount) || 0;
        return t ? Math.round(p * 100 / t) : 0;
    });
    const failedPct = passedPct.map(p => 100 - p);

    _chartBar = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'ผ่าน (%)',    data: passedPct, backgroundColor: 'rgba(5,150,105,0.75)', borderRadius: 3, borderSkipped: false },
                { label: 'ไม่ผ่าน (%)', data: failedPct, backgroundColor: 'rgba(248,113,113,0.5)', borderRadius: 3, borderSkipped: false },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.raw}%`,
                    },
                },
            },
            scales: {
                x: { stacked: true, max: 100, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => v + '%', font: { size: 10 } } },
                y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
            },
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORDS PANEL — department-level records table
// ─────────────────────────────────────────────────────────────────────────────
async function _renderRecordsPanel() {
    const panel = document.getElementById('tr-panel-records');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);

    await Promise.all([_fetchDepts(), _fetchDeptRecords(_recYear)]);

    panel.innerHTML = `
    <div class="space-y-4">
        <!-- Filter Bar -->
        <div class="ds-filter-bar">
            <div class="flex flex-wrap gap-3 items-center">
                <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">ปีงบประมาณ</label>
                <select id="tr-rec-year" class="form-input text-sm">
                    <option value="">ทุกปี</option>
                    ${years.map(y => `<option value="${y}" ${y===_recYear?'selected':''}>${y}</option>`).join('')}
                </select>
                <span id="tr-rec-count" class="text-xs text-slate-400 ml-auto"></span>
                ${_isAdmin ? `
                <button id="tr-rec-add-btn"
                    class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm"
                    style="background:linear-gradient(135deg,#059669,#0d9488)">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    เพิ่มบันทึก
                </button>` : ''}
            </div>
        </div>

        <div id="tr-rec-summary">${_buildRecordsSummary()}</div>

        <!-- Records Table -->
        <div id="tr-dept-wrap" class="ds-table-wrap">
            ${_buildRecordsTable()}
        </div>
    </div>`;

    // year filter
    document.getElementById('tr-rec-year')?.addEventListener('change', async e => {
        _recYear = parseInt(e.target.value) || null;
        await _fetchDeptRecords(_recYear);
        const summary = document.getElementById('tr-rec-summary');
        if (summary) summary.innerHTML = _buildRecordsSummary();
        const wrap = document.getElementById('tr-dept-wrap');
        if (wrap) wrap.innerHTML = _buildRecordsTable();
        _updateRecCount();
    });

    // add button in filter bar
    document.getElementById('tr-rec-add-btn')?.addEventListener('click', () => openDeptRecordForm(null));

    _updateRecCount();
}

function _updateRecCount() {
    const el = document.getElementById('tr-rec-count');
    if (el) el.textContent = `${_deptRecords.length} รายการ`;
}

function _buildRecordsSummary() {
    const records = _deptRecords || [];
    const totalEmployees = records.reduce((sum, r) => sum + (parseInt(r.TotalEmp) || 0), 0);
    const totalPassed = records.reduce((sum, r) => sum + (parseInt(r.PassedCount) || 0), 0);
    const avgCompliance = totalEmployees > 0 ? Math.round(totalPassed * 100 / totalEmployees) : null;
    const lowCompliance = records.filter(r => {
        const total = parseInt(r.TotalEmp) || 0;
        const passed = parseInt(r.PassedCount) || 0;
        return total > 0 && Math.round(passed * 100 / total) < 80;
    }).length;
    const noData = records.filter(r => !(parseInt(r.TotalEmp) > 0)).length;
    const avgClass = avgCompliance === null ? 'text-slate-600 bg-slate-50 border-slate-200'
        : avgCompliance >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
        : avgCompliance >= 60 ? 'text-amber-700 bg-amber-50 border-amber-100'
        : 'text-red-700 bg-red-50 border-red-100';

    return `
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div class="ds-metric-card px-4 py-3">
            <p class="text-[10px] font-bold uppercase text-slate-400">Records</p>
            <p class="mt-1 text-sm font-black text-slate-700">${records.length.toLocaleString()}</p>
        </div>
        <div class="ds-metric-card px-4 py-3">
            <p class="text-[10px] font-bold uppercase text-slate-400">Employees</p>
            <p class="mt-1 text-sm font-black text-slate-700">${totalEmployees.toLocaleString()}</p>
        </div>
        <div class="ds-metric-card is-good px-4 py-3">
            <p class="text-[10px] font-bold uppercase text-emerald-500">Passed</p>
            <p class="mt-1 text-sm font-black text-emerald-700">${totalPassed.toLocaleString()}</p>
        </div>
        <div class="rounded-xl border ${avgClass} px-4 py-3">
            <p class="text-[10px] font-bold uppercase opacity-70">Avg Compliance</p>
            <p class="mt-1 text-sm font-black">${avgCompliance === null ? '-' : avgCompliance + '%'}</p>
        </div>
        <div class="rounded-xl border ${lowCompliance ? 'border-red-100 bg-red-50' : 'border-slate-200 bg-white'} px-4 py-3">
            <p class="text-[10px] font-bold uppercase ${lowCompliance ? 'text-red-500' : 'text-slate-400'}">Needs Follow-up</p>
            <p class="mt-1 text-sm font-black ${lowCompliance ? 'text-red-700' : 'text-slate-700'}">${lowCompliance} low / ${noData} no data</p>
        </div>
    </div>`;
}

function _buildRecordsTable() {
    if (_deptRecords.length === 0) {
        return `
        <div class="text-center py-16 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
            </div>
            <p class="font-medium">ยังไม่มีบันทึกการอบรม</p>
            <p class="text-sm mt-1">${_isAdmin ? 'กดปุ่ม "เพิ่มบันทึก" เพื่อเริ่มต้น' : 'ยังไม่มีข้อมูลในปีที่เลือก'}</p>
        </div>`;
    }

    const rows = _deptRecords.map(r => {
        const total  = parseInt(r.TotalEmp)    || 0;
        const passed = parseInt(r.PassedCount) || 0;
        const hasData = total > 0;
        const pct    = hasData ? Math.round(passed * 100 / total) : null;
        const barClr = pct === null ? '#e2e8f0' : pct >= 80 ? '#059669' : pct >= 60 ? '#d97706' : '#ef4444';
        const pctBadge = pct === null
            ? `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">—</span>`
            : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${pct>=80?'bg-emerald-100 text-emerald-700':pct>=60?'bg-amber-100 text-amber-700':'bg-red-100 text-red-600'}">${pct}%</span>`;

        const adminCols = _isAdmin ? `
            <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                    <button onclick="window._trEditDeptRecord(${r.id})" title="แก้ไข"
                        class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button onclick="window._trDeleteDeptRecord(${r.id},'${_esc(r.Department)}')" title="ลบ"
                        class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>` : '';

        const courseLabel = r.CourseName
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">${r.CourseName}${r.CourseCode ? ` · ${r.CourseCode}` : ''}</span>`
            : `<span class="text-xs text-slate-300">—</span>`;

        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full flex-shrink-0 ${pct===null?'bg-slate-300':pct>=80?'bg-emerald-400':pct>=60?'bg-amber-400':'bg-red-400'}"></span>
                    <span class="text-sm font-medium text-slate-800">${r.Department}</span>
                </div>
            </td>
            <td class="px-4 py-3">${courseLabel}</td>
            <td class="px-4 py-3 text-center text-sm font-semibold text-slate-600">${r.Year}</td>
            <td class="px-4 py-3 text-center text-sm text-slate-600">${total.toLocaleString()}</td>
            <td class="px-4 py-3 text-center text-sm text-emerald-600 font-semibold">${passed.toLocaleString()}</td>
            <td class="px-4 py-3 min-w-[160px]">
                ${pct === null
                    ? pctBadge
                    : `<div class="flex items-center gap-2">
                           <div class="flex-1 bg-slate-100 rounded-full h-1.5">
                               <div class="h-1.5 rounded-full transition-all" style="width:${pct}%;background:${barClr}"></div>
                           </div>
                           ${pctBadge}
                       </div>`}
            </td>
            ${r.Notes ? `<td class="px-4 py-3 text-xs text-slate-400 max-w-[140px] truncate" title="${_esc(r.Notes)}">${r.Notes}</td>` : `<td class="px-4 py-3 text-slate-300 text-xs">—</td>`}
            ${adminCols}
        </tr>`;
    }).join('');

    return `
    <div class="overflow-x-auto">
        <table class="ds-table text-left border-collapse">
            <thead>
                <tr class="bg-slate-50 border-b-2 border-slate-200">
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">หลักสูตร</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">ปี</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">พนักงาน</th>
                    <th class="px-4 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wide text-center">ผ่าน</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Compliance</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">หมายเหตุ</th>
                    ${_isAdmin ? `<th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">จัดการ</th>` : ''}
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPT RECORD FORM (add / edit)
// ─────────────────────────────────────────────────────────────────────────────
async function openDeptRecordForm(r) {
    // Ensure departments and courses loaded
    const [, courses] = await Promise.all([
        _allDepts.length === 0 ? _fetchDepts() : Promise.resolve(),
        _coursesCache.length === 0 ? _fetchCourses() : Promise.resolve(_coursesCache),
    ]);
    const activeCourses = (_coursesCache.length ? _coursesCache : courses).filter(c => c.IsActive || (r && c.id == r.CourseID));

    const isEdit  = r && r.id;
    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);
    const recYear = r?.Year || _recYear || curYear;

    const deptOptions = _allDepts.map(name =>
        `<option value="${_esc(name)}" ${r?.Department===name?'selected':''}>${name}</option>`
    ).join('');

    const html = `
    <form id="tr-dept-rec-form" class="space-y-4">
        ${isEdit ? `<input type="hidden" name="id" value="${r.id}">` : ''}

        <!-- Department -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก <span class="text-red-500">*</span></label>
            ${_allDepts.length > 0
                ? `<select name="Department" required class="form-input w-full">
                       <option value="">— เลือกแผนก —</option>
                       ${deptOptions}
                   </select>`
                : `<input type="text" name="Department" required value="${_esc(r?.Department||'')}"
                       placeholder="ชื่อแผนก" class="form-input w-full">`}
        </div>

        <!-- Year -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ปี <span class="text-red-500">*</span></label>
            <select name="Year" required class="form-input w-full">
                ${years.map(y => `<option value="${y}" ${y==recYear?'selected':''}>${y}</option>`).join('')}
            </select>
        </div>

        <!-- Course (optional) -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">หลักสูตร</label>
            <select name="CourseID" class="form-input w-full">
                <option value="">— ไม่ระบุหลักสูตร —</option>
                ${activeCourses.map(c =>
                    `<option value="${c.id}" ${r?.CourseID==c.id?'selected':''}>
                        ${c.CourseName}${c.CourseCode ? ` (${c.CourseCode})` : ''}
                    </option>`
                ).join('')}
            </select>
            <p class="text-xs text-slate-400 mt-1">แผนกเดียวกัน ปีเดียวกัน สามารถเพิ่มได้หลายหลักสูตร</p>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <!-- TotalEmp -->
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    จำนวนพนักงานเข้าอบรม <span class="text-red-500">*</span>
                </label>
                <input type="number" name="TotalEmp" required min="0"
                    id="tr-total-emp"
                    value="${r?.TotalEmp ?? ''}"
                    placeholder="0"
                    oninput="window._trUpdateCompliance()"
                    class="form-input w-full">
            </div>
            <!-- PassedCount -->
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    จำนวนที่ผ่าน <span class="text-red-500">*</span>
                </label>
                <input type="number" name="PassedCount" required min="0"
                    id="tr-passed-count"
                    value="${r?.PassedCount ?? ''}"
                    placeholder="0"
                    oninput="window._trUpdateCompliance()"
                    class="form-input w-full">
            </div>
        </div>

        <!-- Compliance (auto-calculated) -->
        <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-3">
            <svg class="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span class="text-sm text-emerald-700">Compliance: <strong id="tr-compliance-pct">
                ${r?.TotalEmp ? Math.round(parseInt(r.PassedCount)*100/parseInt(r.TotalEmp))+'%' : '—'}
            </strong></span>
        </div>

        <!-- Notes -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
            <textarea name="Notes" rows="2" class="form-textarea w-full resize-none"
                placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)">${_esc(r?.Notes||'')}</textarea>
        </div>

        <div id="tr-dept-rec-err" class="text-sm text-red-500 hidden"></div>

        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="tr-dept-rec-submit" class="btn btn-primary px-5">บันทึกข้อมูล</button>
        </div>
    </form>`;

    openModal(isEdit ? 'แก้ไขบันทึกการอบรม' : 'เพิ่มบันทึกการอบรม', html, 'max-w-lg');

    document.getElementById('tr-dept-rec-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const fd   = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        const btn  = document.getElementById('tr-dept-rec-submit');
        const errEl = document.getElementById('tr-dept-rec-err');
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>กำลังบันทึก...';

        try {
            if (data.id) {
                await API.put(`/training/dept-records/${data.id}`, data);
            } else {
                await API.post('/training/dept-records', data);
            }
            closeModal();
            showToast(data.id ? 'อัปเดตข้อมูลสำเร็จ' : 'บันทึกข้อมูลสำเร็จ', 'success');
            await _fetchDeptRecords(_recYear);
            if (_activeTab === 'records') {
                const wrap = document.getElementById('tr-dept-wrap');
                if (wrap) wrap.innerHTML = _buildRecordsTable();
                _updateRecCount();
            }
            _loadHeroStats();
            if (_activeTab === 'dashboard') _renderDashboardPanel();
        } catch (err) {
            if (errEl) { errEl.textContent = err.message || 'เกิดข้อผิดพลาด'; errEl.classList.remove('hidden'); }
            btn.disabled = false;
            btn.textContent = 'บันทึกข้อมูล';
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// COURSES PANEL (admin only — unchanged structure)
// ─────────────────────────────────────────────────────────────────────────────
async function _renderCoursesPanel() {
    const panel = document.getElementById('tr-panel-courses');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();
    const courses = await _fetchCourses();
    panel.innerHTML = _buildCoursesPanel(courses);
}

function _buildCoursesPanel(courses) {
    return `
    <div class="space-y-4">
        <div class="ds-table-wrap">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
            <div class="p-5">
                <div class="flex items-center justify-between mb-5">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">หลักสูตรทั้งหมด</h3>
                        <span class="text-xs text-slate-400">(${courses.length} หลักสูตร)</span>
                    </div>
                    <button onclick="window._trOpenCourseForm(null)"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                        เพิ่มหลักสูตร
                    </button>
                </div>

                ${courses.length === 0
                    ? `<div class="text-center py-12 text-slate-400">
                        <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                            <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                            </svg>
                        </div>
                        <p class="font-medium">ยังไม่มีหลักสูตร</p>
                        <p class="text-sm mt-1">กดปุ่ม "เพิ่มหลักสูตร" เพื่อเริ่มต้น</p>
                    </div>`
                    : `<div class="overflow-x-auto">
                        <table class="ds-table text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 border-b-2 border-slate-200">
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">รหัส</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">ชื่อหลักสูตร</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">ระยะเวลา</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">เกณฑ์ผ่าน</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">สถานะ</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${courses.map(c => `
                                <tr class="hover:bg-slate-50 transition-colors">
                                    <td class="px-3 py-3 text-xs font-mono text-slate-500">${c.CourseCode || '—'}</td>
                                    <td class="px-3 py-3">
                                        <p class="text-sm font-medium text-slate-800">${c.CourseName}</p>
                                        ${c.Description ? `<p class="text-xs text-slate-400 mt-0.5 truncate max-w-xs" title="${_esc(c.Description)}">${c.Description}</p>` : ''}
                                    </td>
                                    <td class="px-3 py-3 text-center text-sm text-slate-500 whitespace-nowrap">${c.DurationHours || 0} ชม.</td>
                                    <td class="px-3 py-3 text-center text-sm text-slate-500">${c.PassScore || 70}%</td>
                                    <td class="px-3 py-3 text-center">
                                        ${c.IsActive
                                            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>Active</span>`
                                            : `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">Inactive</span>`}
                                    </td>
                                    <td class="px-3 py-3">
                                        <div class="flex items-center gap-1">
                                            <button onclick="window._trOpenCourseForm(${c.id})" title="แก้ไข"
                                                class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                                            </button>
                                            <button onclick="window._trDeleteCourse(${c.id},'${_esc(c.CourseName)}')" title="ลบ"
                                                class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>`}
            </div>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// COURSE FORM (add / edit — no employee fields)
// ─────────────────────────────────────────────────────────────────────────────
async function openCourseForm(id) {
    const courses = await _fetchCourses();
    const c       = id ? courses.find(x => x.id === id) : null;
    const isEdit  = !!c;

    const html = `
    <form id="tr-course-form" class="space-y-4">
        ${isEdit ? `<input type="hidden" name="id" value="${c.id}">` : ''}

        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รหัสหลักสูตร</label>
                <input name="CourseCode" value="${c?.CourseCode || ''}" placeholder="เช่น ST-001"
                    class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อหลักสูตร <span class="text-red-500">*</span></label>
                <input name="CourseName" required value="${c?.CourseName || ''}" placeholder="ชื่อหลักสูตร"
                    class="form-input w-full">
            </div>
        </div>

        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียด</label>
            <textarea name="Description" rows="2" class="form-textarea w-full resize-none"
                placeholder="รายละเอียดหลักสูตร">${c?.Description || ''}</textarea>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ระยะเวลา (ชั่วโมง)</label>
                <input type="number" name="DurationHours" min="0" step="0.5"
                    value="${c?.DurationHours || 0}" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เกณฑ์คะแนนผ่าน (%)</label>
                <input type="number" name="PassScore" min="0" max="100" step="0.5"
                    value="${c?.PassScore || 70}" class="form-input w-full">
            </div>
        </div>

        ${isEdit ? `
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="IsActive" ${c.IsActive ? 'checked' : ''}
                    class="w-4 h-4 rounded accent-emerald-500">
                <span class="text-sm text-slate-700">หลักสูตรนี้ <span class="font-semibold text-emerald-700">Active</span> (เปิดใช้งาน)</span>
            </label>
        </div>` : ''}

        <div id="tr-course-err" class="text-sm text-red-500 hidden"></div>

        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="tr-course-submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`;

    openModal(isEdit ? `แก้ไขหลักสูตร — ${c.CourseName}` : 'เพิ่มหลักสูตรใหม่', html, 'max-w-xl');

    document.getElementById('tr-course-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const fd   = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        if (isEdit) data.IsActive = fd.get('IsActive') === 'on' ? 1 : 0;
        const btn  = document.getElementById('tr-course-submit');
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>กำลังบันทึก...';

        try {
            if (data.id) {
                await API.put(`/training/courses/${data.id}`, data);
            } else {
                await API.post('/training/courses', data);
            }
            closeModal();
            showToast(isEdit ? 'อัปเดตหลักสูตรสำเร็จ' : 'เพิ่มหลักสูตรสำเร็จ', 'success');
            _renderCoursesPanel();
        } catch (err) {
            const el = document.getElementById('tr-course-err');
            if (el) { el.textContent = err.message || 'เกิดข้อผิดพลาด'; el.classList.remove('hidden'); }
            btn.disabled = false;
            btn.textContent = 'บันทึก';
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW GLOBALS (inline onclick)
// ─────────────────────────────────────────────────────────────────────────────
window._trEditDeptRecord = id => {
    const r = _deptRecords.find(x => x.id === id);
    if (r) openDeptRecordForm(r);
};

window._trDeleteDeptRecord = async (id, dept) => {
    const ok = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบบันทึกการอบรมของแผนก "${dept}" ใช่หรือไม่?`);
    if (!ok) return;
    try {
        await API.delete(`/training/dept-records/${id}`);
        showToast('ลบข้อมูลสำเร็จ', 'success');
        await _fetchDeptRecords(_recYear);
        const wrap = document.getElementById('tr-dept-wrap');
        if (wrap) wrap.innerHTML = _buildRecordsTable();
        _updateRecCount();
        _loadHeroStats();
    } catch (err) {
        showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

window._trOpenCourseForm = id => openCourseForm(id || null);

window._trDeleteCourse = async (id, name) => {
    const ok = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบหลักสูตร "${name}" ใช่หรือไม่?`);
    if (!ok) return;
    try {
        await API.delete(`/training/courses/${id}`);
        showToast('ลบหลักสูตรสำเร็จ', 'success');
        _renderCoursesPanel();
    } catch (err) {
        showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

// Live compliance calc in form
window._trUpdateCompliance = () => {
    const total  = parseInt(document.getElementById('tr-total-emp')?.value)    || 0;
    const passed = parseInt(document.getElementById('tr-passed-count')?.value) || 0;
    const el     = document.getElementById('tr-compliance-pct');
    if (!el) return;
    el.textContent = total > 0 ? Math.round(Math.min(passed, total) * 100 / total) + '%' : '—';
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function _spinnerHtml() {
    return `<div class="flex flex-col items-center justify-center h-64 text-slate-400">
        <div class="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-3"></div>
        <p class="text-sm">กำลังโหลดข้อมูล...</p>
    </div>`;
}

function _esc(str) {
    return String(str ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;');
}
