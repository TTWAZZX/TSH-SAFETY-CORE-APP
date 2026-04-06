// public/js/pages/accident.js
// Accident Report — enterprise pattern (buildShell + switchTab)
import { API } from '../api.js';
import { openModal, closeModal, showToast, showConfirmationModal } from '../ui.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const ACCIDENT_TYPES = ['Near Miss', 'First Aid', 'Medical Treatment', 'Lost Time', 'Fatal'];
const SEVERITIES     = ['Minor', 'Moderate', 'Serious', 'Critical'];
const ROOT_CAUSES    = [
    'พฤติกรรมไม่ปลอดภัย (Unsafe Act)',
    'สภาพแวดล้อมไม่ปลอดภัย (Unsafe Condition)',
    'ไม่ใช้อุปกรณ์ PPE',
    'ขาดการฝึกอบรม',
    'ความเหนื่อยล้า / ความประมาท',
    'ความบกพร่องของเครื่องจักร',
    'การจัดการไม่เหมาะสม',
    'อื่นๆ',
];
const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

const TYPE_COLOR = {
    'Near Miss':         { bg: 'bg-amber-100',  text: 'text-amber-700'  },
    'First Aid':         { bg: 'bg-blue-100',   text: 'text-blue-700'   },
    'Medical Treatment': { bg: 'bg-orange-100', text: 'text-orange-700' },
    'Lost Time':         { bg: 'bg-red-100',    text: 'text-red-700'    },
    'Fatal':             { bg: 'bg-slate-800',  text: 'text-white'      },
};
const SEV_COLOR = {
    'Minor':    { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    'Moderate': { bg: 'bg-amber-100',   text: 'text-amber-700'   },
    'Serious':  { bg: 'bg-orange-100',  text: 'text-orange-700'  },
    'Critical': { bg: 'bg-red-100',     text: 'text-red-700'     },
};

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _isAdmin        = false;
let _activeTab      = 'dashboard';
let _statsYear      = new Date().getFullYear();
let _summary        = null;
let _analytics      = null;
let _reports        = [];
let _filter         = { dept: '', type: '', status: '', year: new Date().getFullYear() };
let _listenersReady = false;
let _trendChart     = null;
let _accEmpTimer    = null;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadAccidentPage() {
    const container = document.getElementById('accident-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _isAdmin = user.role === 'Admin' || user.Role === 'Admin';

    window.closeModal = closeModal;

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    _activeTab = window._getTab?.('accident', _activeTab) || _activeTab;
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
        { id: 'analytics', label: 'วิเคราะห์',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/>` },
        { id: 'reports', label: 'รายงานทั้งหมด',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` },
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);

    const tabHtml = _getTabs().map(t => `
        <button id="acc-tab-btn-${t.id}" data-tab="${t.id}"
            class="acc-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="acc-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#acc-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                </svg>
                                Accident Report
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">รายงานอุบัติเหตุ &amp; Safety Analytics</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Accident Report · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-shrink-0 w-full md:w-auto">
                        <!-- Stats strip -->
                        <div id="acc-stats-strip" class="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full sm:w-auto">
                            ${['—','—','—','—'].map((v, i) => {
                                const labels = ['วันปลอดอุบัติ','รวมทั้งหมด','Recordable','Near Miss'];
                                return `<div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
                                    <p class="text-2xl font-bold text-white acc-stat-val" data-idx="${i}">${v}</p>
                                    <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${labels[i]}</p>
                                </div>`;
                            }).join('')}
                        </div>
                        <!-- Actions -->
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <select id="acc-year-sel" class="rounded-xl px-3 py-2 text-xs font-semibold text-white border border-white/30 bg-white/15 outline-none">
                                ${years.map(y => `<option value="${y}" ${y===_statsYear?'selected':''} class="text-slate-800 bg-white">${y}</option>`).join('')}
                            </select>
                            ${_isAdmin ? `
                            <button id="acc-btn-add" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white border border-white/30 bg-white/15 hover:bg-white/25 transition-all whitespace-nowrap">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                บันทึกอุบัติเหตุ
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
        <div id="acc-panel-dashboard" class="hidden"></div>
        <div id="acc-panel-analytics" class="hidden"></div>
        <div id="acc-panel-reports"   class="hidden"></div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS (once)
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', e => {
        const tabBtn = e.target.closest('.acc-tab');
        if (tabBtn?.dataset?.tab) { switchTab(tabBtn.dataset.tab); return; }

        if (e.target.closest('#acc-btn-add')) { openAccidentForm(null); return; }

        if (!e.target.closest('#acc-emp-dropdown') && !e.target.closest('#acc-emp-search')) {
            document.getElementById('acc-emp-dropdown')?.classList.add('hidden');
        }
    });

    document.addEventListener('change', e => {
        if (e.target?.id === 'acc-year-sel') {
            _statsYear = parseInt(e.target.value) || new Date().getFullYear();
            _filter.year = _statsYear;
            _loadHeroStats();
            if (_activeTab === 'dashboard') _renderDashboardPanel();
            else if (_activeTab === 'analytics') _renderAnalyticsPanel();
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SWITCH TAB
// ─────────────────────────────────────────────────────────────────────────────
function switchTab(tab) {
    _activeTab = tab;
    window._saveTab?.('accident', tab);

    _getTabs().forEach(t => {
        const btn = document.getElementById(`acc-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === tab
            ? 'acc-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white'
            : 'acc-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';
    });

    ['dashboard','analytics','reports'].forEach(id => {
        document.getElementById(`acc-panel-${id}`)?.classList.add('hidden');
    });
    document.getElementById(`acc-panel-${tab}`)?.classList.remove('hidden');

    if (tab === 'dashboard') _renderDashboardPanel();
    if (tab === 'analytics') _renderAnalyticsPanel();
    if (tab === 'reports')   _renderReportsPanel();
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO STATS (async)
// ─────────────────────────────────────────────────────────────────────────────
async function _loadHeroStats() {
    try {
        const res = await API.get(`/accident/summary?year=${_statsYear}`);
        _summary  = res.data || null;
        const kpi = _summary?.kpi || {};
        const ds  = _summary?.daysSince;
        const vals = [
            ds !== null ? ds : '—',
            kpi.total      ?? '—',
            kpi.recordable ?? '—',
            kpi.nearMiss   ?? '—',
        ];
        document.querySelectorAll('.acc-stat-val').forEach(el => {
            const i = parseInt(el.dataset.idx);
            if (vals[i] !== undefined) el.textContent = vals[i];
        });
    } catch { _summary = null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD PANEL
// ─────────────────────────────────────────────────────────────────────────────
async function _renderDashboardPanel() {
    const panel = document.getElementById('acc-panel-dashboard');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    if (!_summary) {
        try {
            const res = await API.get(`/accident/summary?year=${_statsYear}`);
            _summary  = res.data || null;
        } catch { _summary = null; }
    }

    const kpi      = _summary?.kpi      || {};
    const byType   = _summary?.byType   || [];
    const daysSince = _summary?.daysSince ?? null;

    const total      = parseInt(kpi.total)      || 0;
    const recordable = parseInt(kpi.recordable) || 0;
    const lostDays   = parseInt(kpi.lostDays)   || 0;
    const nearMiss   = parseInt(kpi.nearMiss)   || 0;
    const fatal      = parseInt(kpi.fatal)      || 0;

    const safeColor = daysSince === 0
        ? 'border-red-300'
        : daysSince !== null && daysSince < 30
            ? 'border-amber-200' : 'border-emerald-200';
    const safeText = daysSince === 0
        ? 'text-red-600'
        : daysSince !== null && daysSince < 30
            ? 'text-amber-600' : 'text-emerald-600';

    panel.innerHTML = `
    <div class="space-y-6">

        <!-- KPI Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div class="col-span-2 lg:col-span-1 bg-white rounded-xl p-5 border shadow-sm flex flex-col items-center justify-center text-center ${safeColor}"
                 style="box-shadow:0 4px 16px rgba(220,38,38,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <p class="text-xs font-semibold uppercase tracking-wide mb-1 ${safeText}">วันปลอดอุบัติเหตุ</p>
                <p class="text-4xl font-black ${safeText}">${daysSince !== null ? daysSince : '—'}</p>
                <p class="text-xs text-slate-400 mt-1">วัน (Recordable)</p>
            </div>
            ${[
                { label: 'รวมทั้งหมด',   val: total,      color: 'text-slate-800',   border: 'border-slate-100' },
                { label: 'Recordable',   val: recordable, color: 'text-orange-600',  border: 'border-orange-200' },
                { label: 'Lost Days',    val: lostDays,   color: 'text-red-600',     border: 'border-red-200' },
                { label: 'Near Miss',    val: nearMiss,   color: 'text-amber-600',   border: 'border-amber-200' },
            ].map(c => `
            <div class="bg-white rounded-xl p-5 border ${c.border} shadow-sm">
                <p class="text-xs text-slate-500 font-medium">${c.label}</p>
                <p class="text-3xl font-bold ${c.color} mt-1">${c.val}</p>
                <p class="text-xs text-slate-400 mt-1">รายการ</p>
            </div>`).join('')}
        </div>

        <!-- Trend Chart + Type Breakdown -->
        <div class="grid lg:grid-cols-3 gap-6">

            <!-- Trend Chart -->
            <div class="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
                 style="box-shadow:0 4px 16px rgba(220,38,38,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#dc2626,#f97316)"></div>
                <div class="p-5">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                            </svg>
                            <h3 class="text-sm font-bold text-slate-700">แนวโน้มอุบัติเหตุ (Safety Trend)</h3>
                        </div>
                        <span class="text-xs text-slate-400">ปี ${_statsYear}</span>
                    </div>
                    <div style="height:220px"><canvas id="acc-trend-chart"></canvas></div>
                </div>
            </div>

            <!-- Type Breakdown -->
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
                 style="box-shadow:0 4px 16px rgba(220,38,38,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#f97316,#eab308)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">ประเภทอุบัติเหตุ</h3>
                    </div>
                    ${byType.length === 0
                        ? `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>`
                        : `<div class="space-y-2.5">
                            ${byType.map(t => {
                                const pct = total ? Math.round(parseInt(t.cnt) * 100 / total) : 0;
                                const col = TYPE_COLOR[t.AccidentType] || { bg: 'bg-slate-100' };
                                return `
                                <div>
                                    <div class="flex items-center justify-between mb-1 text-xs">
                                        <span class="font-medium text-slate-700">${t.AccidentType}</span>
                                        <span class="font-semibold text-slate-600">${t.cnt} (${pct}%)</span>
                                    </div>
                                    <div class="w-full bg-slate-100 rounded-full h-2">
                                        <div class="h-2 rounded-full ${col.bg}" style="width:${pct}%"></div>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>`}
                    ${fatal > 0 ? `
                    <div class="mt-4 rounded-xl bg-slate-900 text-white p-3 text-xs font-semibold flex items-center gap-2">
                        <svg class="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        อุบัติเหตุถึงชีวิต: ${fatal} ราย
                    </div>` : ''}
                </div>
            </div>
        </div>
    </div>`;

    setTimeout(() => _drawTrendChart(), 0);
}

function _drawTrendChart() {
    const canvas = document.getElementById('acc-trend-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_trendChart) { _trendChart.destroy(); _trendChart = null; }

    const trend = _summary?.trend || [];
    if (trend.length === 0) {
        canvas.parentElement.innerHTML = `<p class="flex items-center justify-center h-full text-slate-400 text-sm">ยังไม่มีข้อมูล</p>`;
        return;
    }

    const labels = trend.map(t => t.period || MONTHS_TH[(parseInt(t.mo) - 1)] || t.mo);
    const totals = trend.map(t => parseInt(t.total)      || 0);
    const recs   = trend.map(t => parseInt(t.recordable) || 0);

    _trendChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'รวม',        data: totals, backgroundColor: 'rgba(220,38,38,0.2)', borderColor: '#dc2626', borderWidth: 2, borderRadius: 4, order: 2 },
                { label: 'Recordable', data: recs,   type: 'line', borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#f97316', tension: 0.3, fill: true, order: 1 },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true } } },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
            },
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS PANEL
// ─────────────────────────────────────────────────────────────────────────────
async function _renderAnalyticsPanel() {
    const panel = document.getElementById('acc-panel-analytics');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    try {
        const res  = await API.get(`/accident/analytics?year=${_statsYear}`);
        _analytics = res.data || null;
    } catch { _analytics = null; }

    const deptRank  = _analytics?.deptRank  || [];
    const hotspot   = _analytics?.hotspot   || [];
    const rootCauses = _analytics?.rootCauses || [];
    const maxHot    = parseInt(hotspot[0]?.cnt)   || 1;
    const maxRoot   = parseInt(rootCauses[0]?.cnt) || 1;

    const riskBadge = score => {
        if (score >= 10) return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700"><span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>High</span>`;
        if (score >= 5)  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700"><span class="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block"></span>Med</span>`;
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>Low</span>`;
    };

    panel.innerHTML = `
    <div class="space-y-6">

        <!-- Department Risk Ranking -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
             style="box-shadow:0 4px 16px rgba(220,38,38,0.08),0 1px 4px rgba(0,0,0,0.06)">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#dc2626,#7c3aed)"></div>
            <div class="p-5">
                <div class="flex items-center gap-2 mb-1">
                    <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">Department Risk Ranking</h3>
                </div>
                <p class="text-xs text-slate-400 mb-4 ml-6">คะแนนความเสี่ยง = Recordable×3 + LostDays×2 + รวม</p>
                ${deptRank.length === 0
                    ? `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>`
                    : `<div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr class="bg-slate-50 border-b-2 border-slate-200">
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">รวม</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-orange-500 uppercase tracking-wide text-center">Recordable</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-red-500 uppercase tracking-wide text-center">Lost Days</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-amber-500 uppercase tracking-wide text-center">Near Miss</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">ความเสี่ยง</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${deptRank.map((d, i) => {
                                    const score  = parseInt(d.recordable)*3 + parseInt(d.lostDays)*2 + parseInt(d.total);
                                    const isTop  = i === 0;
                                    return `
                                    <tr class="hover:bg-slate-50 transition-colors" style="${isTop?'background:rgba(254,242,242,0.5)':''}">
                                        <td class="px-3 py-3 font-bold ${isTop?'text-red-600':'text-slate-400'}">${i+1}</td>
                                        <td class="px-3 py-3 font-semibold text-slate-800">
                                            ${d.Department || '—'}
                                            ${d.fatal>0 ? `<span class="ml-1 text-xs text-white bg-slate-800 rounded px-1">Fatal</span>` : ''}
                                        </td>
                                        <td class="px-3 py-3 text-center font-bold text-slate-700">${d.total}</td>
                                        <td class="px-3 py-3 text-center text-orange-600 font-semibold">${d.recordable||0}</td>
                                        <td class="px-3 py-3 text-center text-red-600 font-semibold">${d.lostDays||0}</td>
                                        <td class="px-3 py-3 text-center text-amber-600">${d.nearMiss||0}</td>
                                        <td class="px-3 py-3 text-center">${riskBadge(score)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>`}
            </div>
        </div>

        <!-- Hotspot + Root Cause -->
        <div class="grid lg:grid-cols-2 gap-6">

            <!-- Accident Hotspot -->
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
                 style="box-shadow:0 4px 16px rgba(249,115,22,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#f97316,#eab308)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">Accident Hotspot</h3>
                        <span class="text-xs text-slate-400">(บริเวณที่เกิดบ่อย)</span>
                    </div>
                    ${hotspot.length === 0
                        ? `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>`
                        : `<div class="space-y-3">
                            ${hotspot.map((h, i) => {
                                const pct    = Math.round(parseInt(h.cnt) * 100 / maxHot);
                                const colors = ['bg-red-500','bg-orange-500','bg-amber-500','bg-yellow-400'];
                                const color  = colors[Math.min(i, colors.length - 1)];
                                return `
                                <div>
                                    <div class="flex items-center justify-between mb-1 text-xs">
                                        <span class="font-semibold text-slate-700 flex items-center gap-1.5">
                                            <span class="w-2 h-2 rounded-full ${color} flex-shrink-0"></span>
                                            ${h.area}
                                        </span>
                                        <span class="text-slate-500">${h.cnt} ครั้ง${h.recordable>0?` · <span class="text-orange-600">${h.recordable} rec.</span>`:''}</span>
                                    </div>
                                    <div class="w-full bg-slate-100 rounded-full h-2">
                                        <div class="h-2 rounded-full ${color} transition-all" style="width:${pct}%"></div>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>`}
                </div>
            </div>

            <!-- Root Causes -->
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
                 style="box-shadow:0 4px 16px rgba(139,92,246,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#8b5cf6,#6366f1)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">Top Root Cause</h3>
                        <span class="text-xs text-slate-400">(สาเหตุที่พบบ่อย)</span>
                    </div>
                    ${rootCauses.length === 0
                        ? `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>`
                        : `<div class="space-y-2.5">
                            ${rootCauses.map((r, i) => {
                                const pct  = Math.round(parseInt(r.cnt) * 100 / maxRoot);
                                const rank = ['text-purple-700 font-black','text-purple-600 font-bold','text-purple-500 font-semibold'];
                                const bar  = ['bg-purple-500','bg-purple-400','bg-purple-300'];
                                const ri   = Math.min(i, 2);
                                return `
                                <div class="flex items-center gap-3">
                                    <span class="text-sm w-5 text-center ${rank[ri]} flex-shrink-0">${i+1}</span>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center justify-between mb-0.5">
                                            <span class="text-xs font-medium text-slate-700 truncate" title="${_esc(r.cause)}">${r.cause}</span>
                                            <span class="text-xs text-slate-500 ml-2 flex-shrink-0">${r.cnt}</span>
                                        </div>
                                        <div class="w-full bg-slate-100 rounded-full h-1.5">
                                            <div class="h-1.5 rounded-full ${bar[ri]} transition-all" style="width:${pct}%"></div>
                                        </div>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>`}
                </div>
            </div>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS PANEL
// ─────────────────────────────────────────────────────────────────────────────
async function _renderReportsPanel() {
    const panel = document.getElementById('acc-panel-reports');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    await _fetchReports();

    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);
    const depts   = [...new Set(_reports.map(r => r.Department).filter(Boolean))].sort();

    panel.innerHTML = `
    <div class="space-y-4">
        <!-- Filter Bar -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div class="flex flex-wrap gap-3 items-center">
                <select id="acc-f-year" class="form-input text-sm">
                    ${years.map(y => `<option value="${y}" ${_filter.year==y?'selected':''}>${y}</option>`).join('')}
                </select>
                <select id="acc-f-dept" class="form-input text-sm">
                    <option value="">ทุกแผนก</option>
                    ${depts.map(d => `<option value="${d}" ${_filter.dept===d?'selected':''}>${d}</option>`).join('')}
                </select>
                <select id="acc-f-type" class="form-input text-sm">
                    <option value="">ทุกประเภท</option>
                    ${ACCIDENT_TYPES.map(t => `<option value="${t}" ${_filter.type===t?'selected':''}>${t}</option>`).join('')}
                </select>
                <select id="acc-f-status" class="form-input text-sm">
                    <option value="">ทุกสถานะ</option>
                    <option value="Open"   ${_filter.status==='Open'  ?'selected':''}>Open</option>
                    <option value="Closed" ${_filter.status==='Closed'?'selected':''}>Closed</option>
                </select>
                <span id="acc-rec-count" class="text-xs text-slate-400 ml-auto">${_reports.length} รายการ</span>
            </div>
        </div>

        <!-- Table -->
        <div id="acc-reports-wrap" class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            ${_buildReportsTable()}
        </div>
    </div>`;

    ['acc-f-year','acc-f-dept','acc-f-type','acc-f-status'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', async () => {
            _filter.year   = parseInt(document.getElementById('acc-f-year')?.value)   || curYear;
            _filter.dept   = document.getElementById('acc-f-dept')?.value   || '';
            _filter.type   = document.getElementById('acc-f-type')?.value   || '';
            _filter.status = document.getElementById('acc-f-status')?.value || '';
            await _fetchReports();
            const wrap = document.getElementById('acc-reports-wrap');
            if (wrap) wrap.innerHTML = _buildReportsTable();
            const cnt = document.getElementById('acc-rec-count');
            if (cnt)  cnt.textContent = `${_reports.length} รายการ`;
        });
    });
}

async function _fetchReports() {
    try {
        const p = new URLSearchParams();
        if (_filter.year)   p.set('year',       _filter.year);
        if (_filter.dept)   p.set('department', _filter.dept);
        if (_filter.type)   p.set('type',       _filter.type);
        if (_filter.status) p.set('status',     _filter.status);
        const res = await API.get(`/accident/reports?${p}`);
        _reports  = res.data || [];
    } catch { _reports = []; }
}

function _buildReportsTable() {
    if (_reports.length === 0) {
        return `
        <div class="text-center py-16 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <p class="font-medium">ไม่พบข้อมูลอุบัติเหตุ</p>
            <p class="text-sm mt-1">ลองเปลี่ยนตัวกรองหรือเพิ่มรายงานใหม่</p>
        </div>`;
    }

    const rows = _reports.map(r => {
        const dateStr    = r.AccidentDate
            ? new Date(r.AccidentDate).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
            : '—';
        const tc         = TYPE_COLOR[r.AccidentType] || { bg: 'bg-slate-100', text: 'text-slate-600' };
        const sc         = SEV_COLOR[r.Severity]      || { bg: 'bg-slate-100', text: 'text-slate-600' };
        const statusBadge = r.Status === 'Closed'
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500"><span class="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>Closed</span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block"></span>Open</span>`;
        const adminBtns = _isAdmin ? `
            <button onclick="window._accEditReport(${r.id})" title="แก้ไข"
                class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
            <button onclick="window._accDeleteReport(${r.id})" title="ลบ"
                class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>` : '';

        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-500">${dateStr}</td>
            <td class="px-4 py-3 min-w-[120px]">
                <p class="text-sm font-semibold text-slate-800">${r.EmployeeID}</p>
                <p class="text-xs text-slate-400">${r.EmployeeName || '—'}</p>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">${r.Department || '—'}</td>
            <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">${r.Area || '—'}</td>
            <td class="px-4 py-3 whitespace-nowrap">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${tc.bg} ${tc.text}">${r.AccidentType}</span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}">${r.Severity}</span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 max-w-[140px] truncate" title="${_esc(r.RootCause||'')}">${r.RootCause || '—'}</td>
            <td class="px-4 py-3 text-center text-sm ${r.LostDays>0?'text-red-600 font-semibold':'text-slate-400'}">${r.LostDays || 0}</td>
            <td class="px-4 py-3">${statusBadge}</td>
            ${_isAdmin ? `<td class="px-4 py-3"><div class="flex items-center gap-1">${adminBtns}</div></td>` : ''}
        </tr>`;
    }).join('');

    return `
    <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="bg-slate-50 border-b-2 border-slate-200">
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">วันที่เกิดเหตุ</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">พนักงาน</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">บริเวณ</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ประเภท</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ความรุนแรง</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">สาเหตุ</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">วันหยุด</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">สถานะ</th>
                    ${_isAdmin ? `<th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">จัดการ</th>` : ''}
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCIDENT FORM (add / edit)
// ─────────────────────────────────────────────────────────────────────────────
function openAccidentForm(r) {
    const isEdit = r && r.id;

    const html = `
    <form id="acc-form" class="space-y-4">
        ${isEdit ? `<input type="hidden" name="id" value="${r.id}">` : ''}

        <div class="bg-red-50 border border-red-100 rounded-xl p-3 flex gap-2 text-sm text-red-700">
            <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span>ต้องใช้รหัสพนักงานจาก Employee Master Data เท่านั้น · แผนกถูกกรอกอัตโนมัติจาก master</span>
        </div>

        <!-- Dates -->
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่เกิดเหตุ <span class="text-red-500">*</span></label>
                <input type="text" id="acc-accident-date" name="AccidentDate" required
                    value="${r?.AccidentDate ? r.AccidentDate.split('T')[0] : ''}"
                    class="form-input w-full bg-white">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่รายงาน <span class="text-red-500">*</span></label>
                <input type="text" id="acc-report-date" name="ReportDate" required
                    value="${r?.ReportDate ? r.ReportDate.split('T')[0] : ''}"
                    class="form-input w-full bg-white">
            </div>
        </div>

        <!-- Employee Search -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รหัสพนักงาน (ผู้บาดเจ็บ) <span class="text-red-500">*</span></label>
            <div class="relative">
                <input id="acc-emp-search" name="EmployeeID" required
                    value="${r?.EmployeeID || ''}"
                    placeholder="พิมพ์รหัสหรือชื่อพนักงาน..."
                    autocomplete="off"
                    class="form-input w-full"
                    oninput="window._accSearchEmp(this.value)">
                <div id="acc-emp-dropdown" class="hidden absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto"></div>
            </div>
            <div id="acc-emp-info" class="${r?.EmployeeID ? '' : 'hidden'} mt-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5 border border-emerald-100">
                ${r?.EmployeeName ? `<svg class="w-3.5 h-3.5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>${r.EmployeeName} · ${r.Department || ''}` : ''}
            </div>
        </div>

        <!-- Type + Severity -->
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทอุบัติเหตุ <span class="text-red-500">*</span></label>
                <select name="AccidentType" required class="form-input w-full">
                    <option value="">— เลือกประเภท —</option>
                    ${ACCIDENT_TYPES.map(t => `<option value="${t}" ${r?.AccidentType===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ความรุนแรง</label>
                <select name="Severity" class="form-input w-full">
                    ${SEVERITIES.map(s => `<option value="${s}" ${(r?.Severity||'Minor')===s?'selected':''}>${s}</option>`).join('')}
                </select>
            </div>
        </div>

        <!-- Area + Time -->
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">บริเวณที่เกิดเหตุ</label>
                <input name="Area" value="${r?.Area || ''}" placeholder="เช่น Line A, คลังสินค้า" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เวลาที่เกิดเหตุ</label>
                <input type="time" name="AccidentTime" value="${r?.AccidentTime || ''}" class="form-input w-full">
            </div>
        </div>

        <!-- Description -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดการเกิดเหตุ</label>
            <textarea name="Description" rows="2" class="form-textarea w-full resize-none"
                placeholder="อธิบายเหตุการณ์ที่เกิดขึ้น">${r?.Description || ''}</textarea>
        </div>

        <!-- Root Cause + Lost Days -->
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สาเหตุหลัก</label>
                <select name="RootCause" class="form-input w-full">
                    <option value="">— เลือกสาเหตุ —</option>
                    ${ROOT_CAUSES.map(rc => `<option value="${rc}" ${r?.RootCause===rc?'selected':''}>${rc}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันหยุดงาน (วัน)</label>
                <input type="number" name="LostDays" min="0" value="${r?.LostDays || 0}" class="form-input w-full">
            </div>
        </div>

        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดสาเหตุ</label>
            <textarea name="RootCauseDetail" rows="2" class="form-textarea w-full resize-none"
                placeholder="อธิบายสาเหตุเพิ่มเติม">${r?.RootCauseDetail || ''}</textarea>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">มาตรการแก้ไข / ป้องกัน</label>
            <textarea name="CorrectiveAction" rows="2" class="form-textarea w-full resize-none"
                placeholder="มาตรการที่ดำเนินการหรือวางแผน">${r?.CorrectiveAction || ''}</textarea>
        </div>

        <!-- Recordable + Status -->
        <div class="grid grid-cols-2 gap-4">
            <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" name="IsRecordable" ${r?.IsRecordable ? 'checked' : ''}
                        class="w-4 h-4 rounded accent-red-500">
                    <span class="text-sm text-slate-700">เป็น <span class="font-semibold text-red-600">Recordable Case</span></span>
                </label>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานะ</label>
                <select name="Status" class="form-input w-full">
                    <option value="Open"   ${(r?.Status||'Open')==='Open'  ?'selected':''}>Open</option>
                    <option value="Closed" ${r?.Status==='Closed'          ?'selected':''}>Closed</option>
                </select>
            </div>
        </div>

        <div id="acc-form-err" class="text-sm text-red-500 hidden"></div>

        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="acc-form-submit" class="btn btn-primary px-5"
                    style="background:linear-gradient(135deg,#dc2626,#b91c1c)">บันทึก</button>
        </div>
    </form>`;

    openModal(isEdit ? 'แก้ไขรายงานอุบัติเหตุ' : 'บันทึกรายงานอุบัติเหตุ', html, 'max-w-2xl');

    if (typeof flatpickr !== 'undefined') {
        flatpickr('#acc-accident-date', { locale: 'th', dateFormat: 'Y-m-d', defaultDate: r?.AccidentDate || 'today' });
        flatpickr('#acc-report-date',   { locale: 'th', dateFormat: 'Y-m-d', defaultDate: r?.ReportDate   || 'today' });
    }

    document.getElementById('acc-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const fd   = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        data.IsRecordable = fd.get('IsRecordable') === 'on' ? 1 : 0;
        const btn  = document.getElementById('acc-form-submit');
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>กำลังบันทึก...';

        try {
            if (data.id) {
                await API.put(`/accident/reports/${data.id}`, data);
            } else {
                await API.post('/accident/reports', data);
            }
            closeModal();
            showToast('บันทึกรายงานอุบัติเหตุสำเร็จ', 'success');
            _summary = null; // invalidate cache
            _loadHeroStats();
            if (_activeTab === 'reports') {
                await _fetchReports();
                const wrap = document.getElementById('acc-reports-wrap');
                if (wrap) wrap.innerHTML = _buildReportsTable();
                const cnt = document.getElementById('acc-rec-count');
                if (cnt)  cnt.textContent = `${_reports.length} รายการ`;
            }
        } catch (err) {
            const el = document.getElementById('acc-form-err');
            if (el) { el.textContent = err.message || 'เกิดข้อผิดพลาด'; el.classList.remove('hidden'); }
            btn.disabled = false;
            btn.textContent = 'บันทึก';
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW GLOBALS
// ─────────────────────────────────────────────────────────────────────────────
window._accEditReport = id => {
    const r = _reports.find(x => x.id === id);
    if (r) openAccidentForm(r);
};

window._accDeleteReport = async id => {
    const ok = await showConfirmationModal('ยืนยันการลบ', 'ต้องการลบรายงานอุบัติเหตุนี้ใช่หรือไม่?');
    if (!ok) return;
    try {
        await API.delete(`/accident/reports/${id}`);
        showToast('ลบรายงานสำเร็จ', 'success');
        _summary = null;
        _loadHeroStats();
        await _fetchReports();
        const wrap = document.getElementById('acc-reports-wrap');
        if (wrap) wrap.innerHTML = _buildReportsTable();
        const cnt = document.getElementById('acc-rec-count');
        if (cnt)  cnt.textContent = `${_reports.length} รายการ`;
    } catch (err) {
        showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

window._accSearchEmp = val => {
    clearTimeout(_accEmpTimer);
    const dd = document.getElementById('acc-emp-dropdown');
    if (!dd) return;
    if (!val || val.length < 1) { dd.classList.add('hidden'); return; }
    _accEmpTimer = setTimeout(async () => {
        try {
            const res  = await API.get(`/accident/employees?q=${encodeURIComponent(val)}`);
            const emps = res.data || [];
            dd.innerHTML = emps.length === 0
                ? `<div class="px-4 py-3 text-sm text-slate-400">ไม่พบพนักงาน</div>`
                : emps.map(e => `
                    <button type="button" onclick="window._accSelectEmp('${_esc(e.EmployeeID)}','${_esc(e.EmployeeName)}','${_esc(e.Department||'')}')"
                        class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-red-50 transition-colors">
                        <div class="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                            <span class="text-xs font-bold text-red-600">${(e.EmployeeName||'?').charAt(0)}</span>
                        </div>
                        <div>
                            <p class="text-sm font-semibold text-slate-800">${e.EmployeeID} · ${e.EmployeeName}</p>
                            <p class="text-xs text-slate-400">${e.Department||''} ${e.Team ? '· '+e.Team : ''}</p>
                        </div>
                    </button>`).join('');
            dd.classList.remove('hidden');
        } catch { dd.classList.add('hidden'); }
    }, 250);
};

window._accSelectEmp = (id, name, dept) => {
    const input = document.getElementById('acc-emp-search');
    const info  = document.getElementById('acc-emp-info');
    const dd    = document.getElementById('acc-emp-dropdown');
    if (input) input.value = id;
    if (info)  { info.innerHTML = `<svg class="w-3.5 h-3.5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>${name} · ${dept}`; info.classList.remove('hidden'); }
    if (dd)    dd.classList.add('hidden');
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function _spinnerHtml() {
    return `<div class="flex flex-col items-center justify-center h-64 text-slate-400">
        <div class="animate-spin rounded-full h-10 w-10 border-4 border-red-500 border-t-transparent mb-3"></div>
        <p class="text-sm">กำลังโหลดข้อมูล...</p>
    </div>`;
}

function _esc(str) {
    return String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
