// public/js/pages/fourm.js
// 4M Change — Man Record + Change Notice + External Systems
import { API } from '../api.js';
import {
    hideLoading, showError, showLoading,
    openModal, closeModal, showToast, showConfirmationModal, showDocumentModal
} from '../ui.js';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const CHANGE_TYPES = ['Man', 'Machine', 'Material', 'Method'];
const NOTICE_STATUSES = ['Open', 'Pending', 'Closed'];
const MAN_STATUSES    = ['Pass', 'Fail', 'Pending'];

const TYPE_BADGE = {
    Man:      'bg-blue-100 text-blue-700',
    Machine:  'bg-orange-100 text-orange-700',
    Material: 'bg-emerald-100 text-emerald-700',
    Method:   'bg-purple-100 text-purple-700',
};
const STATUS_BADGE = {
    'Open':    'bg-sky-100 text-sky-700',
    'Pending': 'bg-amber-100 text-amber-700',
    'Closed':  'bg-slate-100 text-slate-500',
};
const STATUS_LABEL = { Open: 'Open', Pending: 'รอดำเนินการ', Closed: 'ปิดแล้ว' };
const MAN_STATUS_BADGE = {
    Pass:    'bg-emerald-100 text-emerald-700',
    Fail:    'bg-red-100 text-red-700',
    Pending: 'bg-amber-100 text-amber-700',
};
const CHART_COLORS = ['#6366f1','#f97316','#10b981','#8b5cf6'];
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
let _noticeFilter   = { status:'all', type:'all', q:'' };
let _manFilter      = { q:'' };
let _listenersReady = false;
let _chartLine      = null;
let _chartPie       = null;
let _chartBar       = null;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadFourmPage() {
    const container = document.getElementById('fourm-page');
    if (!container) return;

    _currentUser = TSHSession.getUser() || {};
    _isAdmin = _currentUser.role === 'Admin' || _currentUser.Role === 'Admin';

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }
    switchTab(_activeTab);
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    const tabs = [
        { id: 'dashboard', label: 'Dashboard'      },
        { id: 'systems',   label: 'ระบบภายนอก'     },
        { id: 'man',       label: 'Man Record'      },
        { id: 'notices',   label: 'Change Notice'   },
    ];
    return `
    <div class="max-w-6xl mx-auto space-y-5 animate-fade-in pb-10">
        <!-- Header -->
        <div>
            <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
                <span class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style="background:linear-gradient(135deg,#6366f1,#0284c7);box-shadow:0 2px 10px rgba(99,102,241,0.3)">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                </span>
                4M Change
            </h1>
            <p class="text-sm text-slate-500 mt-1 ml-11">Man · Machine · Material · Method · Thai Summit Harness Co., Ltd.</p>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 p-1 rounded-xl w-fit" style="background:#f1f5f9">
            ${tabs.map(t => `
            <button data-tab="${t.id}"
                    class="fourm-tab px-4 py-2 rounded-lg text-sm font-medium transition-all
                           ${_activeTab === t.id ? 'bg-white shadow-sm text-indigo-600 font-semibold' : 'text-slate-500 hover:text-slate-700'}">
                ${t.label}
            </button>`).join('')}
        </div>

        <div id="fourm-tab-content"></div>
    </div>`;
}

async function switchTab(tab) {
    _activeTab = tab;
    document.querySelectorAll('.fourm-tab').forEach(btn => {
        const a = btn.dataset.tab === tab;
        btn.className = `fourm-tab px-4 py-2 rounded-lg text-sm font-medium transition-all ${a ? 'bg-white shadow-sm text-indigo-600 font-semibold' : 'text-slate-500 hover:text-slate-700'}`;
    });
    const c = document.getElementById('fourm-tab-content');
    if (!c) return;
    switch (tab) {
        case 'dashboard': await renderDashboard(c);  break;
        case 'systems':   renderSystems(c);           break;
        case 'man':       await renderMan(c);         break;
        case 'notices':   await renderNotices(c);     break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
async function renderDashboard(container) {
    container.innerHTML = `
        <div class="space-y-5">
            <div class="flex justify-end">
                <select id="fourm-stats-year" class="form-input py-1.5 text-sm w-32">
                    ${[0,1,2].map(i => { const y = new Date().getFullYear()-i; return `<option value="${y}" ${y===_statsYear?'selected':''}>${y}</option>`; }).join('')}
                </select>
            </div>
            <!-- KPI -->
            <div id="fourm-kpi-row" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                ${Array(4).fill(0).map(() => `<div class="card p-4 animate-pulse"><div class="h-8 bg-slate-100 rounded mb-2"></div><div class="h-4 bg-slate-50 rounded w-2/3"></div></div>`).join('')}
            </div>
            <!-- Charts row 1 -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="lg:col-span-2 card p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">แนวโน้ม Change Notice รายเดือน</h3>
                    <div class="relative" style="height:220px"><canvas id="fourm-chart-line"></canvas></div>
                </div>
                <div class="card p-5">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">สัดส่วน Change Type</h3>
                    <div class="relative" style="height:220px"><canvas id="fourm-chart-pie"></canvas></div>
                </div>
            </div>
            <!-- Charts row 2 -->
            <div class="card p-5">
                <h3 class="text-sm font-bold text-slate-600 mb-4">Change Notice แยกตามแผนก</h3>
                <div class="relative" style="height:200px"><canvas id="fourm-chart-bar"></canvas></div>
            </div>
        </div>`;

    try {
        const res  = await API.get(`/fourm/stats?year=${_statsYear}`);
        const data = res?.data || {};
        renderKPI(data.noticeKpi || {});
        renderLineChart(data.monthly || []);
        renderPieChart(data.byType || []);
        renderBarChart(data.byDept || []);
    } catch (err) { console.error('4M stats error:', err); }
}

function renderKPI(kpi) {
    const cards = [
        { label:'Change Notice ทั้งหมด', value: kpi.total   || 0, color:'#6366f1', icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` },
        { label:'Open',                  value: kpi.open    || 0, color:'#0284c7', icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
        { label:'Pending',               value: kpi.pending || 0, color:'#d97706', icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>` },
        { label:'Closed',                value: kpi.closed  || 0, color:'#059669', icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
    ];
    const row = document.getElementById('fourm-kpi-row');
    if (!row) return;
    row.innerHTML = cards.map(c => `
        <div class="card p-5 flex items-center gap-4">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                 style="background:${c.color}18;color:${c.color}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${c.icon}</svg>
            </div>
            <div>
                <div class="text-2xl font-bold text-slate-800">${c.value}</div>
                <div class="text-xs text-slate-500 mt-0.5">${c.label}</div>
            </div>
        </div>`).join('');
}

function renderLineChart(monthly) {
    const ctx = document.getElementById('fourm-chart-line');
    if (!ctx) return;
    if (_chartLine) { _chartLine.destroy(); _chartLine = null; }
    const counts = Array(12).fill(0);
    monthly.forEach(r => { counts[(r.month||1)-1] = r.count||0; });
    _chartLine = new Chart(ctx, {
        type: 'line',
        data: {
            labels: MONTHS_TH,
            datasets: [{ label:'Change Notice', data: counts,
                borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.08)',
                tension:0.4, fill:true, pointBackgroundColor:'#6366f1', pointRadius:4 }]
        },
        options: { responsive:true, maintainAspectRatio:false,
            plugins:{legend:{display:false}},
            scales:{ y:{beginAtZero:true,ticks:{stepSize:1,font:{family:'Kanit'}},grid:{color:'#f1f5f9'}},
                     x:{ticks:{font:{family:'Kanit',size:11}},grid:{display:false}} } }
    });
}

function renderPieChart(data) {
    const ctx = document.getElementById('fourm-chart-pie');
    if (!ctx) return;
    if (_chartPie) { _chartPie.destroy(); _chartPie = null; }
    _chartPie = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: data.map(d=>d.label), datasets:[{
            data: data.map(d=>d.count), backgroundColor: CHART_COLORS,
            borderWidth:2, borderColor:'#fff' }] },
        options: { responsive:true, maintainAspectRatio:false, cutout:'55%',
            plugins:{legend:{position:'bottom',labels:{font:{family:'Kanit',size:11},padding:10,boxWidth:12}}} }
    });
}

function renderBarChart(data) {
    const ctx = document.getElementById('fourm-chart-bar');
    if (!ctx) return;
    if (_chartBar) { _chartBar.destroy(); _chartBar = null; }
    _chartBar = new Chart(ctx, {
        type:'bar',
        data:{ labels:data.map(d=>d.label), datasets:[{
            label:'Change Notice', data:data.map(d=>d.count),
            backgroundColor:'#6366f199', borderColor:'#6366f1',
            borderWidth:2, borderRadius:6 }] },
        options:{ responsive:true, maintainAspectRatio:false,
            plugins:{legend:{display:false}},
            scales:{ y:{beginAtZero:true,ticks:{stepSize:1,font:{family:'Kanit'}},grid:{color:'#f1f5f9'}},
                     x:{ticks:{font:{family:'Kanit',size:10},maxRotation:40},grid:{display:false}} } }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: EXTERNAL SYSTEMS
// ─────────────────────────────────────────────────────────────────────────────
function renderSystems(container) {
    container.innerHTML = `
        <div class="space-y-4">
            <p class="text-sm text-slate-500">เชื่อมต่อไปยังระบบ 4M Change ภายนอก</p>
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
                               class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                               style="background:linear-gradient(135deg,${s.color},${s.color}cc);box-shadow:0 2px 8px ${s.color}40;"
                               onmouseover="this.style.transform='translateY(-1px)'"
                               onmouseout="this.style.transform=''">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                                </svg>
                                เปิดระบบ
                            </a>
                        </div>
                    </div>
                </div>`).join('')}
            </div>
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: MAN RECORD
// ─────────────────────────────────────────────────────────────────────────────
async function renderMan(container) {
    container.innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-wrap gap-3 items-center justify-between">
                <div class="relative w-full sm:w-64">
                    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input id="man-search" type="text" placeholder="ค้นหาแผนก..."
                           value="${_manFilter.q}" class="form-input w-full pl-9 text-sm py-2">
                </div>
                ${_isAdmin ? `
                <button id="btn-add-man"
                        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                        style="background:linear-gradient(135deg,#6366f1,#8b5cf6);box-shadow:0 2px 8px rgba(99,102,241,0.3)"
                        onmouseover="this.style.transform='translateY(-1px)'"
                        onmouseout="this.style.transform=''">
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
                        <tbody id="man-tbody" class="divide-y divide-slate-100">
                            ${loadingRow(_isAdmin ? 8 : 7)}
                        </tbody>
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
        const params = new URLSearchParams();
        if (_manFilter.q.trim()) params.set('q', _manFilter.q.trim());
        const res  = await API.get(`/fourm/man-records?${params}`);
        const rows = normalizeApiArray(res?.data ?? res);

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="${_isAdmin?8:7}" class="text-center py-10 text-slate-400 text-sm">ยังไม่มีผลสอบ</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const rate = r.TotalAttendance > 0 ? Math.round((r.Pass / r.TotalAttendance) * 100) : 0;
            const date = r.ExamDate ? new Date(r.ExamDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            return `
            <tr class="hover:bg-slate-50 transition-colors group">
                <td class="px-4 py-3 font-medium text-slate-800">${r.Department || '-'}</td>
                <td class="px-4 py-3 text-center text-slate-700">${r.TotalAttendance || 0}</td>
                <td class="px-4 py-3 text-center text-emerald-600 font-semibold">${r.Pass || 0}</td>
                <td class="px-4 py-3 text-center text-red-500 font-semibold">${r.Fail || 0}</td>
                <td class="px-4 py-3 text-center">
                    <div class="flex items-center gap-2">
                        <div class="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div class="h-full rounded-full ${rate>=80?'bg-emerald-500':rate>=60?'bg-amber-500':'bg-red-400'}"
                                 style="width:${rate}%"></div>
                        </div>
                        <span class="text-xs font-bold ${rate>=80?'text-emerald-600':rate>=60?'text-amber-600':'text-red-500'} w-8">${rate}%</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${MAN_STATUS_BADGE[r.Status]||'bg-slate-100 text-slate-500'}">
                        ${r.Status || '-'}
                    </span>
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${date}</td>
                ${_isAdmin ? `
                <td class="px-4 py-3 text-right">
                    <div class="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="btn-man-edit p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                data-id="${r.id}" title="แก้ไข">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                            </svg>
                        </button>
                        <button class="btn-man-delete p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                data-id="${r.id}" data-dept="${r.Department}" title="ลบ">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </td>` : ''}
            </tr>`;
        }).join('');
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="${_isAdmin?8:7}" class="text-center py-6 text-red-500 text-sm">${err.message}</td></tr>`;
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
                           value="${r?.Department||''}" placeholder="ชื่อแผนก">
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
                <textarea name="Notes" rows="2" class="form-input w-full resize-none">${r?.Notes||''}</textarea>
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4"
                        onclick="document.getElementById('modal-close-btn').click()">ยกเลิก</button>
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
// TAB 4: CHANGE NOTICES
// ─────────────────────────────────────────────────────────────────────────────
async function renderNotices(container) {
    container.innerHTML = `
        <div class="space-y-4">
            <div class="card p-4 flex flex-wrap gap-3 items-center justify-between">
                <div class="flex flex-wrap gap-2">
                    ${buildSelect('notice-filter-status','ทุกสถานะ',[
                        {v:'all',l:'ทุกสถานะ'},
                        ...NOTICE_STATUSES.map(s=>({v:s,l:STATUS_LABEL[s]||s}))
                    ], _noticeFilter.status)}
                    ${buildSelect('notice-filter-type','ทุก Type',[
                        {v:'all',l:'ทุก Type'},
                        ...CHANGE_TYPES.map(t=>({v:t,l:t}))
                    ], _noticeFilter.type)}
                </div>
                <div class="flex items-center gap-2">
                    <div class="relative w-56">
                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input id="notice-search" type="text" placeholder="ค้นหา Notice No / หัวข้อ..."
                               value="${_noticeFilter.q}" class="form-input w-full pl-9 text-sm py-2">
                    </div>
                    ${_isAdmin ? `
                    <button id="btn-add-notice"
                            class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all whitespace-nowrap"
                            style="background:linear-gradient(135deg,#6366f1,#8b5cf6);box-shadow:0 2px 8px rgba(99,102,241,0.3)"
                            onmouseover="this.style.transform='translateY(-1px)'"
                            onmouseout="this.style.transform=''">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        เพิ่ม Notice
                    </button>` : ''}
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
                        <tbody id="notice-tbody" class="divide-y divide-slate-100">
                            ${loadingRow(8)}
                        </tbody>
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
        const params = new URLSearchParams();
        if (_noticeFilter.status !== 'all') params.set('status', _noticeFilter.status);
        if (_noticeFilter.type   !== 'all') params.set('type',   _noticeFilter.type);
        if (_noticeFilter.q.trim())         params.set('q',      _noticeFilter.q.trim());
        const res   = await API.get(`/fourm/notices?${params}`);
        const rows  = normalizeApiArray(res?.data ?? res);

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400 text-sm">ยังไม่มี Change Notice</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const reqDate   = r.RequestDate ? new Date(r.RequestDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            const closeDate = r.ClosedDate  ? new Date(r.ClosedDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            const canClose  = r.Status !== 'Closed' && (r.CreatedByID === _currentUser.id || _isAdmin);
            return `
            <tr class="hover:bg-slate-50 transition-colors group">
                <td class="px-4 py-3">
                    <span class="font-mono text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">${r.NoticeNo||'-'}</span>
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${reqDate}</td>
                <td class="px-4 py-3">
                    <div class="font-medium text-slate-800 max-w-[180px] truncate">${r.Title||'-'}</div>
                    ${r.Department ? `<div class="text-xs text-slate-400">${r.Department}</div>` : ''}
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_BADGE[r.ChangeType]||'bg-slate-100 text-slate-500'}">
                        ${r.ChangeType||'-'}
                    </span>
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${r.ResponsiblePerson||'-'}</td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.Status]||'bg-slate-100 text-slate-500'}">
                        ${STATUS_LABEL[r.Status]||r.Status}
                    </span>
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${closeDate}</td>
                <td class="px-4 py-3 text-right">
                    <div class="flex items-center gap-1 justify-end">
                        <button class="btn-notice-view px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                data-id="${r.id}">ดู</button>
                        ${canClose ? `
                        <button class="btn-notice-close px-2 py-1 rounded-lg text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors"
                                data-id="${r.id}" data-no="${r.NoticeNo}">ปิด</button>` : ''}
                        ${_isAdmin ? `
                        <button class="btn-notice-edit px-2 py-1 rounded-lg text-xs font-semibold text-indigo-500 hover:bg-indigo-50 transition-colors"
                                data-id="${r.id}">แก้ไข</button>
                        <button class="btn-notice-delete p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                data-id="${r.id}" data-no="${r.NoticeNo}" title="ลบ">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500 text-sm">${err.message}</td></tr>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTICE FORMS
// ─────────────────────────────────────────────────────────────────────────────
function showNoticeForm(existing = null) {
    const r    = normalizeApiObject(existing);
    const today = new Date().toISOString().split('T')[0];
    const html = `
        <form id="notice-form" class="space-y-4" enctype="multipart/form-data">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">Notice No <span class="text-red-500">*</span></label>
                    <input type="text" name="NoticeNo" class="form-input w-full" required
                           value="${r?.NoticeNo||''}" placeholder="เช่น 4M-2024-001" ${existing?'readonly':''}>
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
                       value="${r?.Title||''}" placeholder="ระบุหัวข้อการเปลี่ยนแปลง">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียด</label>
                <textarea name="Description" rows="3" class="form-input w-full resize-none"
                          placeholder="รายละเอียดการเปลี่ยนแปลง...">${r?.Description||''}</textarea>
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
                    <input type="text" name="Department" class="form-input w-full"
                           value="${r?.Department||''}" placeholder="แผนก">
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้รับผิดชอบ</label>
                <input type="text" name="ResponsiblePerson" class="form-input w-full"
                       value="${r?.ResponsiblePerson||''}" placeholder="ชื่อผู้รับผิดชอบ">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ไฟล์แนบ</label>
                <input type="file" name="attachment" class="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all"
                       accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp">
                ${r?.AttachmentUrl ? `<p class="text-xs text-indigo-600 mt-1">ไฟล์ปัจจุบัน: <a href="${r.AttachmentUrl}" target="_blank" class="underline">ดูไฟล์เดิม</a></p>` : ''}
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4"
                        onclick="document.getElementById('modal-close-btn').click()">ยกเลิก</button>
                <button type="submit" id="notice-save-btn" class="btn btn-primary px-5">บันทึก</button>
            </div>
        </form>`;

    openModal(existing ? 'แก้ไข Change Notice' : 'สร้าง Change Notice', html, 'max-w-xl');

    document.getElementById('notice-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('notice-save-btn');
        btn.disabled = true; btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> กำลังบันทึก...`;
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

        const html = `
            <div class="space-y-4 text-sm">
                <div class="flex flex-wrap gap-2">
                    <span class="font-mono text-xs font-semibold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">${r.NoticeNo}</span>
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_BADGE[r.ChangeType]||'bg-slate-100 text-slate-500'}">${r.ChangeType}</span>
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.Status]||'bg-slate-100 text-slate-500'}">${STATUS_LABEL[r.Status]||r.Status}</span>
                </div>

                <h3 class="text-base font-bold text-slate-800">${r.Title}</h3>

                <div class="grid grid-cols-2 gap-3 text-xs">
                    ${infoBlock('วันที่ขอ', fmtDate(r.RequestDate))}
                    ${infoBlock('ผู้รับผิดชอบ', r.ResponsiblePerson||'-')}
                    ${infoBlock('แผนก', r.Department||'-')}
                    ${infoBlock('สร้างโดย', r.CreatedBy||'-')}
                </div>

                ${r.Description ? `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">รายละเอียด</p>
                    <p class="text-slate-700 leading-relaxed whitespace-pre-wrap">${r.Description}</p>
                </div>` : ''}

                ${r.ClosingComment ? `
                <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">ความคิดเห็นปิด Notice</p>
                    <p class="text-slate-700 leading-relaxed">${r.ClosingComment}</p>
                    <p class="text-xs text-slate-400 mt-1.5">ปิดโดย ${r.ClosedBy||'-'} · ${fmtDate(r.ClosedDate)}</p>
                </div>` : ''}

                ${(r.AttachmentUrl||r.ClosingDocUrl) ? `
                <div>
                    <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">ไฟล์แนบ</p>
                    <div class="flex flex-wrap gap-2">
                        ${r.AttachmentUrl ? buildFileChip(r.AttachmentUrl, 'ไฟล์แนบ (Notice)', isImage(r.AttachmentUrl)) : ''}
                        ${r.ClosingDocUrl  ? buildFileChip(r.ClosingDocUrl, 'เอกสารปิด Notice', isImage(r.ClosingDocUrl)) : ''}
                    </div>
                </div>` : ''}
            </div>`;

        openModal('รายละเอียด Change Notice', html, 'max-w-xl');
    } catch (err) { hideLoading(); showError(err); }
}

function showCloseForm(id, noticeNo) {
    const today = new Date().toISOString().split('T')[0];
    const html = `
        <form id="close-form" class="space-y-4">
            <div class="flex gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
                <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <span>การปิด Notice <strong>${noticeNo}</strong> ไม่สามารถย้อนกลับได้</span>
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
                <button type="button" class="btn btn-secondary px-4"
                        onclick="document.getElementById('modal-close-btn').click()">ยกเลิก</button>
                <button type="submit" id="close-save-btn"
                        class="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white"
                        style="background:linear-gradient(135deg,#059669,#0d9488)">ปิด Change Notice</button>
            </div>
        </form>`;

    openModal(`ปิด Change Notice — ${noticeNo}`, html, 'max-w-lg');

    document.getElementById('close-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('close-save-btn');
        btn.disabled = true; btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> กำลังปิด...`;
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
// EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', async (e) => {
        if (!e.target.closest('#fourm-page')) return;

        // Tab
        const tabBtn = e.target.closest('.fourm-tab');
        if (tabBtn) { await switchTab(tabBtn.dataset.tab); return; }

        // Man record
        if (e.target.closest('#btn-add-man')) { showManForm(); return; }
        const manEdit = e.target.closest('.btn-man-edit');
        if (manEdit) {
            showLoading('กำลังโหลด...');
            try {
                const res = await API.get(`/fourm/man-records`);
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

        // Notice
        if (e.target.closest('#btn-add-notice'))            { showNoticeForm();  return; }
        if (e.target.closest('.btn-notice-view'))           { await showNoticeDetail(e.target.closest('.btn-notice-view').dataset.id); return; }
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
        if (e.target.id === 'notice-filter-status') { _noticeFilter.status = e.target.value; await fetchAndRenderNotices(); return; }
        if (e.target.id === 'notice-filter-type')   { _noticeFilter.type   = e.target.value; await fetchAndRenderNotices(); return; }
        if (e.target.id === 'fourm-stats-year')      { _statsYear = parseInt(e.target.value); const c = document.getElementById('fourm-tab-content'); if(c) await renderDashboard(c); return; }
    });

    document.addEventListener('input', debounce(async (e) => {
        if (!e.target.closest('#fourm-page')) return;
        if (e.target.id === 'notice-search') { _noticeFilter.q = e.target.value; await fetchAndRenderNotices(); return; }
        if (e.target.id === 'man-search')    { _manFilter.q    = e.target.value; await fetchAndRenderMan();     return; }
    }, 350));
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
function buildSelect(id, placeholder, opts, current) {
    return `<select id="${id}" class="form-input py-1.5 text-sm">
        ${opts.map(o => `<option value="${o.v}" ${o.v===current?'selected':''}>${o.l}</option>`).join('')}
    </select>`;
}

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
