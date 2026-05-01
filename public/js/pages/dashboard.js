// public/js/pages/dashboard.js
// Cross-module KPI Dashboard — ภาพรวมทุก module (all authenticated users)
import { API } from '../api.js';
import { closeModal, escHtml, openModal, showError, showToast } from '../ui.js';

let _dashboardConfig = null;
let _currentUser = {};
let _isAdmin = false;
let _dashboardEventsReady = false;

const DASHBOARD_MODULES = [
    { hash:'patrol', label:'Safety Patrol' },
    { hash:'hiyari', label:'Hiyari Near-Miss' },
    { hash:'ky', label:'KY Activity' },
    { hash:'cccf', label:'CCCF Activity' },
    { hash:'yokoten', label:'Yokoten' },
    { hash:'training', label:'Safety Training' },
    { hash:'accident', label:'Accident Report' },
    { hash:'fourm', label:'4M Change' },
    { hash:'kpi', label:'KPI' },
    { hash:'policy', label:'Policy' },
    { hash:'committee', label:'Committee' },
    { hash:'machine-safety', label:'Machine Safety' },
    { hash:'ojt', label:'OJT / SCW' },
    { hash:'contractor', label:'Contractor' },
    { hash:'safety-culture', label:'Safety Culture' },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadDashboardPage() {
    const container = document.getElementById('dashboard-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _currentUser = user;
    _isAdmin = user.role === 'Admin' || user.Role === 'Admin';
    const year = new Date().getFullYear();

    container.innerHTML = buildShell(user, year);
    setupDashboardEvents();
    _loadKpis(year);
    _loadAlerts();
    _loadMyTargets();
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell(user, year) {
    const greeting = _greeting();
    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl"
             style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="db-dots" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="12" cy="12" r="1.3" fill="white"/>
                </pattern></defs><rect width="100%" height="100%" fill="url(#db-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none"
                 style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div>
                        <p class="text-sm font-medium mb-1" style="color:rgba(167,243,208,0.85)">${greeting}</p>
                        <h1 class="text-2xl font-bold text-white">${escHtml(user.name || '—')}</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.75)">
                            ${escHtml(user.department || '')}
                            ${user.department && user.role ? ' · ' : ''}
                            ${escHtml(user.role || '')} · ${year}
                        </p>
                    </div>
                    <!-- Hero stats strip -->
                    <div id="db-hero-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 w-full md:w-auto flex-shrink-0">
                        ${[1,2,3,4].map(() => `
                        <div class="rounded-xl px-4 py-3 text-center animate-pulse"
                             style="background:rgba(255,255,255,0.12);min-width:80px">
                            <div class="h-7 bg-white/20 rounded-lg mb-1.5 mx-auto w-10"></div>
                            <div class="h-3 bg-white/15 rounded w-14 mx-auto"></div>
                        </div>`).join('')}
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ MODULE KPI CARDS ═══ -->
        <div id="db-health-wrap"></div>

        <div id="db-compliance-wrap"></div>

        <div>
            <h2 class="text-base font-bold text-slate-700 mb-3 flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style="background:linear-gradient(135deg,#059669,#0d9488)">
                    <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                </span>
                ภาพรวมระบบ ${year}
            </h2>
            <div id="db-module-cards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                ${_skeletonCards(DASHBOARD_MODULES.length)}
            </div>
        </div>

        <!-- ═══ ALERTS ═══ -->
        <div id="db-alerts-wrap"></div>

        <!-- ═══ MY ACTIVITY TARGETS ═══ -->
        <div>
            <h2 class="text-base font-bold text-slate-700 mb-3 flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style="background:linear-gradient(135deg,#0284c7,#0891b2)">
                    <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                    </svg>
                </span>
                เป้าหมายกิจกรรมส่วนตัว ${year}
            </h2>
            <div id="db-my-targets">
                <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                    <div class="flex flex-col items-center py-6 text-slate-400">
                        <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent mb-3"></div>
                        <p class="text-sm">กำลังโหลด...</p>
                    </div>
                </div>
            </div>
        </div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
function setupDashboardEvents() {
    if (_dashboardEventsReady) return;
    _dashboardEventsReady = true;
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#dashboard-page')) return;
        if (e.target.closest('#btn-dashboard-config')) openDashboardConfigModal();
    });
}

async function openDashboardConfigModal() {
    if (!_isAdmin) return;
    const cfg = { healthGreen: 85, healthAmber: 65, alertDueSoonDays: 7, hiddenModules: [], pinnedDepartments: [], ...(_dashboardConfig || {}) };
    const deptRes = await API.get('/master/departments').catch(() => ({ data: [] }));
    const departments = (deptRes?.data || []).map(d => d.Name || d.name || d).filter(Boolean);
    const pinnedSet = new Set(cfg.pinnedDepartments || []);
    const hiddenSet = new Set(cfg.hiddenModules || []);
    const html = `
    <form id="dashboard-config-form" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Green threshold</label>
                <input type="number" name="healthGreen" min="1" max="100" class="form-input w-full" value="${cfg.healthGreen}">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Amber threshold</label>
                <input type="number" name="healthAmber" min="1" max="100" class="form-input w-full" value="${cfg.healthAmber}">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Due soon days</label>
                <input type="number" name="alertDueSoonDays" min="1" max="60" class="form-input w-full" value="${cfg.alertDueSoonDays}">
            </div>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">Pinned departments</label>
            <div class="max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50">
                ${departments.map(dept => `
                <label class="flex items-center gap-2 text-sm text-slate-700 bg-white rounded-lg px-3 py-2 border border-slate-100">
                    <input type="checkbox" name="pinnedDepartments" value="${escHtml(dept)}" class="accent-emerald-600" ${pinnedSet.has(dept) ? 'checked' : ''}>
                    <span class="truncate">${escHtml(dept)}</span>
                </label>`).join('') || `<p class="text-sm text-slate-400">ไม่พบ Master Departments</p>`}
            </div>
            <p class="text-xs text-slate-400 mt-1">ถ้าไม่เลือก ระบบจะแสดงแผนก 12 รายการแรกจาก Master Departments</p>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">Modules visible on Overview</label>
            <div class="max-h-44 overflow-y-auto rounded-xl border border-slate-200 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50">
                ${DASHBOARD_MODULES.map(m => `
                <label class="flex items-center gap-2 text-sm text-slate-700 bg-white rounded-lg px-3 py-2 border border-slate-100">
                    <input type="checkbox" name="visibleModules" value="${m.hash}" class="accent-emerald-600" ${hiddenSet.has(m.hash) ? '' : 'checked'}>
                    <span>${escHtml(m.label)}</span>
                </label>`).join('')}
            </div>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" class="btn btn-secondary px-4" onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
            <button type="submit" id="dashboard-config-save" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`;
    window.closeModal = closeModal;
    openModal('ตั้งค่า Enterprise Dashboard', html, 'max-w-2xl');

    document.getElementById('dashboard-config-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('dashboard-config-save');
        btn.disabled = true;
        btn.textContent = 'กำลังบันทึก...';
        try {
            const fd = new FormData(e.target);
            const body = {
                healthGreen: parseInt(fd.get('healthGreen'), 10),
                healthAmber: parseInt(fd.get('healthAmber'), 10),
                alertDueSoonDays: parseInt(fd.get('alertDueSoonDays'), 10),
                pinnedDepartments: fd.getAll('pinnedDepartments').map(s => String(s).trim()).filter(Boolean),
                hiddenModules: DASHBOARD_MODULES.map(m => m.hash).filter(hash => !fd.getAll('visibleModules').includes(hash)),
            };
            const res = await API.put('/dashboard/config', body);
            _dashboardConfig = res?.data || body;
            closeModal();
            showToast('อัปเดต Dashboard config สำเร็จ', 'success');
            await _loadKpis(new Date().getFullYear());
            await _loadAlerts();
        } catch (err) {
            showError(err);
        } finally {
            btn.disabled = false;
            btn.textContent = 'บันทึก';
        }
    });
}

// LOAD MODULE KPIs
// ─────────────────────────────────────────────────────────────────────────────
async function _loadKpis(year) {
    try {
        const res = await API.get('/dashboard/overview');
        const d   = res?.data;
        if (!d) return;

        _dashboardConfig = d.config || null;
        _renderHeroStats(d);
        _renderHealthIndex(d);
        _renderComplianceMatrix(d);
        _renderModuleCards(d);
    } catch {
        document.getElementById('db-hero-stats').innerHTML = '';
        document.getElementById('db-module-cards').innerHTML = `
            <div class="col-span-full text-center py-8 text-slate-400 text-sm">ไม่สามารถโหลดข้อมูลได้</div>`;
    }
}

function _renderHeroStats(d) {
    const strip = document.getElementById('db-hero-stats');
    if (!strip) return;

    const hiyariAlert = d.hiyari?.open > 0;
    const accAlert    = d.accident?.recordable > 0;

    const stats = [
        { value: d.patrol?.attended   ?? '—', label: 'การเดินตรวจ',    color: '#6ee7b7' },
        { value: d.hiyari?.open       ?? '—', label: 'Hiyari ค้างอยู่', color: hiyariAlert ? '#fca5a5' : '#6ee7b7' },
        { value: d.cccf?.workerYear   ?? '—', label: 'CCCF Worker',     color: '#6ee7b7' },
        { value: d.training?.passRate != null ? d.training.passRate + '%' : '—', label: 'อบรมผ่านเกณฑ์', color: (d.training?.passRate ?? 0) >= 80 ? '#6ee7b7' : '#fde68a' },
    ];

    strip.innerHTML = stats.map(s => `
        <div class="rounded-xl px-4 py-3 text-center"
             style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
            <p class="text-2xl font-bold" style="color:${s.color}">${s.value}</p>
            <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${s.label}</p>
        </div>`).join('');
}

function _renderHealthIndex(d) {
    const wrap = document.getElementById('db-health-wrap');
    if (!wrap) return;
    const h = d.healthIndex || { score: 0, status: 'Watch', penalty: 0, base: 0, thresholds: { green: 85, amber: 65 } };
    const statusMeta = {
        Good: { label: 'Good', color: '#059669', bg: '#ecfdf5', text: 'ระบบอยู่ในเกณฑ์ดี' },
        Watch: { label: 'Watch', color: '#d97706', bg: '#fffbeb', text: 'มีประเด็นที่ควรติดตาม' },
        Critical: { label: 'Critical', color: '#dc2626', bg: '#fef2f2', text: 'ต้องเร่งดำเนินการ' },
    }[h.status] || { label: h.status, color: '#64748b', bg: '#f8fafc', text: 'กำลังประเมิน' };

    const score = Math.max(0, Math.min(100, parseInt(h.score) || 0));
    const circ = Math.round(2 * Math.PI * 42);
    const dash = Math.round(circ * score / 100);
    const hiddenCount = d.config?.hiddenModules?.length || 0;

    wrap.innerHTML = `
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-5 xl:col-span-1">
            <div class="flex items-start justify-between gap-3 mb-4">
                <div>
                    <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Enterprise Safety Health</p>
                    <h2 class="text-base font-bold text-slate-800 mt-1">ดัชนีสุขภาพระบบความปลอดภัย</h2>
                </div>
                ${_isAdmin ? `
                <button id="btn-dashboard-config"
                        class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                        style="background:linear-gradient(135deg,#064e3b,#0d9488)">ตั้งค่า</button>` : ''}
            </div>
            <div class="flex items-center gap-5">
                <div class="relative w-28 h-28 flex-shrink-0">
                    <svg width="112" height="112" viewBox="0 0 104 104" style="transform:rotate(-90deg)">
                        <circle cx="52" cy="52" r="42" fill="none" stroke="#e2e8f0" stroke-width="10"/>
                        <circle cx="52" cy="52" r="42" fill="none" stroke="${statusMeta.color}" stroke-width="10"
                                stroke-linecap="round" stroke-dasharray="${dash} ${circ - dash}"/>
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="text-3xl font-extrabold" style="color:${statusMeta.color}">${score}</span>
                        <span class="text-[10px] text-slate-400 font-semibold">/100</span>
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-bold"
                          style="background:${statusMeta.bg};color:${statusMeta.color}">${statusMeta.label}</span>
                    <p class="text-sm text-slate-600 mt-2">${statusMeta.text}</p>
                    <div class="grid grid-cols-3 gap-2 mt-4">
                        ${_miniMetric('Base', h.base ?? '-', '#0284c7')}
                        ${_miniMetric('Penalty', h.penalty ?? '-', '#dc2626')}
                        ${_miniMetric('Hidden', hiddenCount, '#64748b')}
                    </div>
                </div>
            </div>
        </div>
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-5 xl:col-span-2">
            <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Executive Signal</p>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                ${_signalCard('Training', d.training?.passRate != null ? d.training.passRate + '%' : '-', d.training?.passRate ?? 0)}
                ${_signalCard('CCCF Permanent', d.cccf?.permPct != null ? d.cccf.permPct + '%' : '-', d.cccf?.permPct ?? 0)}
                ${_signalCard('Yokoten Response', d.yokoten?.pct != null ? d.yokoten.pct + '%' : '-', d.yokoten?.pct ?? 0)}
                ${_signalCard('Open Risk', `${(d.hiyari?.open || 0) + (d.fourm?.open || 0) + (d.patrol?.openIssues || 0)}`, 100 - Math.min(100, ((d.hiyari?.open || 0) + (d.fourm?.open || 0) + (d.patrol?.openIssues || 0)) * 5))}
            </div>
        </div>
    </div>`;
}

function _miniMetric(label, value, color) {
    return `<div class="rounded-lg bg-slate-50 px-3 py-2">
        <p class="text-[10px] text-slate-400 font-semibold">${label}</p>
        <p class="text-lg font-bold" style="color:${color}">${value}</p>
    </div>`;
}

function _signalCard(label, value, pct) {
    const color = pct >= 80 ? '#059669' : pct >= 60 ? '#d97706' : '#dc2626';
    return `<div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div class="flex items-center justify-between gap-2 mb-2">
            <p class="text-xs font-semibold text-slate-500 truncate">${label}</p>
            <p class="text-sm font-bold" style="color:${color}">${value}</p>
        </div>
        <div class="h-1.5 rounded-full bg-white overflow-hidden">
            <div class="h-full rounded-full" style="width:${Math.max(0, Math.min(100, pct || 0))}%;background:${color}"></div>
        </div>
    </div>`;
}

function _renderComplianceMatrix(d) {
    const wrap = document.getElementById('db-compliance-wrap');
    if (!wrap) return;
    const rows = d.complianceMatrix || [];
    if (!rows.length) {
        wrap.innerHTML = '';
        return;
    }
    const cols = [
        ['patrol', 'Patrol'],
        ['hiyari', 'Hiyari'],
        ['ky', 'KY'],
        ['yokoten', 'Yokoten'],
        ['training', 'Training'],
        ['fourm', '4M'],
    ];
    const cell = (v) => {
        if (v === null || v === undefined) return `<span class="text-slate-300">-</span>`;
        const color = v >= 80 ? '#059669' : v >= 50 ? '#d97706' : '#dc2626';
        return `<span class="inline-flex justify-center min-w-10 px-2 py-1 rounded-lg text-xs font-bold"
                      style="background:${color}12;color:${color}">${v}%</span>`;
    };

    wrap.innerHTML = `
    <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
                <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Department × Module Compliance</p>
                <h2 class="text-base font-bold text-slate-800 mt-1">ภาพรวมความครอบคลุมรายแผนก</h2>
            </div>
            <p class="text-xs text-slate-400">${rows.length} แผนกที่แสดง</p>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <th class="px-4 py-3">Department</th>
                        ${cols.map(([,label]) => `<th class="px-3 py-3 text-center">${label}</th>`).join('')}
                        <th class="px-4 py-3 text-center">Score</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${rows.map(r => {
                        const scoreColor = r.score >= 80 ? '#059669' : r.score >= 50 ? '#d97706' : '#dc2626';
                        return `
                        <tr class="hover:bg-slate-50">
                            <td class="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">${escHtml(r.department)}</td>
                            ${cols.map(([key]) => `<td class="px-3 py-3 text-center">${cell(r[key])}</td>`).join('')}
                            <td class="px-4 py-3 text-center">
                                <span class="inline-flex justify-center min-w-12 px-2.5 py-1 rounded-full text-xs font-extrabold text-white"
                                      style="background:${scoreColor}">${r.score}%</span>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    </div>`;
}

function _renderModuleCards(d) {
    const wrap = document.getElementById('db-module-cards');
    if (!wrap) return;

    const modules = [
        {
            hash: 'patrol',
            label: 'Safety Patrol',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>`,
            grad: 'linear-gradient(135deg,#059669,#0d9488)',
            shadow: 'rgba(5,150,105,0.3)',
            primary: d.patrol?.attended ?? '—',
            primaryLabel: 'การเข้าร่วมปีนี้',
            secondary: d.patrol?.openIssues > 0
                ? `<span class="text-amber-600 font-semibold">${d.patrol.openIssues} ประเด็นค้าง</span>`
                : `<span class="text-emerald-600">ไม่มีประเด็นค้าง</span>`,
            pct: d.patrol?.rate,
        },
        {
            hash: 'hiyari',
            label: 'Hiyari Near-Miss',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>`,
            grad: 'linear-gradient(135deg,#f97316,#ef4444)',
            shadow: 'rgba(249,115,22,0.3)',
            primary: d.hiyari?.year ?? '—',
            primaryLabel: `รายงานปี ${d.year}`,
            secondary: d.hiyari?.open > 0
                ? `<span class="text-red-600 font-semibold">${d.hiyari.open} รอดำเนินการ</span>`
                : `<span class="text-emerald-600">ดำเนินการครบแล้ว</span>`,
            alert: d.hiyari?.open > 0,
        },
        {
            hash: 'ky',
            label: 'KY Activity',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>`,
            grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            shadow: 'rgba(99,102,241,0.3)',
            primary: d.ky?.year ?? '—',
            primaryLabel: `กิจกรรมปี ${d.year}`,
            secondary: `<span class="text-slate-500">ทำนายอันตราย (Kiken Yochi)</span>`,
        },
        {
            hash: 'cccf',
            label: 'CCCF Activity',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>`,
            grad: 'linear-gradient(135deg,#059669,#0d9488)',
            shadow: 'rgba(5,150,105,0.3)',
            primary: d.cccf?.workerYear ?? '—',
            primaryLabel: 'CCCF Worker ปีนี้',
            secondary: d.cccf?.permPct != null
                ? `<span class="${d.cccf.permPct >= 80 ? 'text-emerald-600' : 'text-amber-600'} font-semibold">Permanent ${d.cccf.permPct}%</span>`
                : `<span class="text-slate-400">ยังไม่มีข้อมูล</span>`,
            pct: d.cccf?.permPct,
        },
        {
            hash: 'yokoten',
            label: 'Yokoten',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>`,
            grad: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
            shadow: 'rgba(14,165,233,0.3)',
            primary: d.yokoten?.responded ?? '—',
            primaryLabel: 'แผนกตอบกลับแล้ว',
            secondary: d.yokoten?.pct != null
                ? `<span class="${d.yokoten.pct >= 80 ? 'text-emerald-600' : 'text-amber-600'} font-semibold">${d.yokoten.pct}% ของ ${d.yokoten.topics} หัวข้อ</span>`
                : `<span class="text-slate-400">ยังไม่มีหัวข้อ</span>`,
            pct: d.yokoten?.pct,
        },
        {
            hash: 'training',
            label: 'Safety Training',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>`,
            grad: 'linear-gradient(135deg,#0284c7,#0891b2)',
            shadow: 'rgba(2,132,199,0.3)',
            primary: d.training?.passRate != null ? d.training.passRate + '%' : '—',
            primaryLabel: 'Pass Rate ปีนี้',
            secondary: d.training?.totalEmp
                ? `<span class="text-slate-600">${d.training.passed}/${d.training.totalEmp} คน</span>`
                : `<span class="text-slate-400">ยังไม่มีข้อมูล</span>`,
            pct: d.training?.passRate,
        },
        {
            hash: 'accident',
            label: 'รายงานอุบัติเหตุ',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/>`,
            grad: 'linear-gradient(135deg,#dc2626,#9f1239)',
            shadow: 'rgba(220,38,38,0.3)',
            primary: d.accident?.year ?? '—',
            primaryLabel: `รายงานปี ${d.year}`,
            secondary: d.accident?.recordable === 0
                ? `<span class="text-emerald-600 font-bold">Zero Recordable</span>`
                : d.accident?.recordable > 0
                    ? `<span class="text-red-600 font-semibold">${d.accident.recordable} Recordable</span>`
                    : `<span class="text-slate-400">—</span>`,
            alert: d.accident?.recordable > 0,
        },
        {
            hash: 'fourm',
            label: '4M Change',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>`,
            grad: 'linear-gradient(135deg,#6366f1,#0284c7)',
            shadow: 'rgba(99,102,241,0.3)',
            primary: d.fourm?.open ?? '—',
            primaryLabel: 'Change Notice ค้างอยู่',
            secondary: d.fourm?.open === 0
                ? `<span class="text-emerald-600">ไม่มีรายการค้าง</span>`
                : `<span class="text-amber-600 font-semibold">รอดำเนินการ ${d.fourm?.open} รายการ</span>`,
            alert: d.fourm?.open > 0,
        },
        {
            hash: 'kpi',
            label: 'KPI',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3v18m4-14v14m4-10v10M7 13v8M3 17v4"/>`,
            grad: 'linear-gradient(135deg,#0f766e,#14b8a6)',
            shadow: 'rgba(20,184,166,0.28)',
            primary: d.kpi?.metrics ?? '—',
            primaryLabel: `KPI metrics ปี ${d.year}`,
            secondary: `<span class="text-slate-600">${d.kpi?.announcements ?? 0} ประกาศ KPI</span>`,
        },
        {
            hash: 'policy',
            label: 'Policy',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V7.5L13.5 2H7a2 2 0 00-2 2v15a2 2 0 002 2zM13 2v6h6M9 13h6M9 17h6"/>`,
            grad: 'linear-gradient(135deg,#475569,#0f766e)',
            shadow: 'rgba(15,118,110,0.24)',
            primary: d.policy?.total ?? '—',
            primaryLabel: 'นโยบายทั้งหมด',
            secondary: `<span class="text-slate-600">${d.policy?.acknowledged ?? 0} การรับทราบฉบับปัจจุบัน</span>`,
        },
        {
            hash: 'committee',
            label: 'Committee',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m0-4a4 4 0 118 0 4 4 0 01-8 0zm10 0a3 3 0 100-6M5 10a3 3 0 110-6"/>`,
            grad: 'linear-gradient(135deg,#2563eb,#0891b2)',
            shadow: 'rgba(37,99,235,0.24)',
            primary: d.committee?.total ?? '—',
            primaryLabel: 'คณะกรรมการ / คณะทำงาน',
            secondary: `<span class="text-slate-600">โครงสร้างกำกับด้านความปลอดภัย</span>`,
        },
        {
            hash: 'machine-safety',
            label: 'Machine Safety',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317a1 1 0 011.35-.936l1.586.686a1 1 0 00.97-.104l1.398-.932a1 1 0 011.386.33l1.106 1.914a1 1 0 00.755.493l1.64.18a1 1 0 01.884 1.114l-.2 1.656a1 1 0 00.271.822l1.156 1.185a1 1 0 010 1.396l-1.156 1.185a1 1 0 00-.27.822l.199 1.656a1 1 0 01-.884 1.114l-1.64.18a1 1 0 00-.755.493l-1.106 1.914a1 1 0 01-1.386.33l-1.398-.932a1 1 0 00-.97-.104l-1.586.686a1 1 0 01-1.35-.936v-1.71a1 1 0 00-.5-.866l-1.48-.855a1 1 0 010-1.732l1.48-.855a1 1 0 00.5-.866v-1.71zM15 12a3 3 0 11-6 0 3 3 0 016 0z"/>`,
            grad: 'linear-gradient(135deg,#334155,#64748b)',
            shadow: 'rgba(51,65,85,0.24)',
            primary: d.machineSafety?.total ?? '—',
            primaryLabel: 'เครื่องจักร Active',
            secondary: (d.machineSafety?.openIssues > 0 || d.machineSafety?.critical > 0)
                ? `<span class="text-red-600 font-semibold">${d.machineSafety?.openIssues ?? 0} issue ค้าง / ${d.machineSafety?.critical ?? 0} critical</span>`
                : `<span class="text-emerald-600">ไม่พบ issue ค้าง</span>`,
            alert: (d.machineSafety?.openIssues > 0 || d.machineSafety?.critical > 0),
        },
        {
            hash: 'ojt',
            label: 'OJT / SCW',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0v7m-5-4l5 3 5-3"/>`,
            grad: 'linear-gradient(135deg,#7c3aed,#2563eb)',
            shadow: 'rgba(124,58,237,0.22)',
            primary: d.ojt?.records ?? '—',
            primaryLabel: 'OJT records',
            secondary: `<span class="text-slate-600">${d.ojt?.docs ?? 0} SCW documents</span>`,
        },
        {
            hash: 'contractor',
            label: 'Contractor',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7h18M5 7l1.5 12h11L19 7M9 7V5a3 3 0 116 0v2M10 11v4m4-4v4"/>`,
            grad: 'linear-gradient(135deg,#b45309,#ea580c)',
            shadow: 'rgba(180,83,9,0.22)',
            primary: d.contractor?.docs ?? '—',
            primaryLabel: 'เอกสาร Contractor',
            secondary: `<span class="text-slate-600">${d.contractor?.recent ?? 0} อัปโหลดใน 30 วัน</span>`,
        },
        {
            hash: 'safety-culture',
            label: 'Safety Culture',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 12.75l6 6 9-13.5M12 3a9 9 0 100 18 9 9 0 000-18z"/>`,
            grad: 'linear-gradient(135deg,#059669,#84cc16)',
            shadow: 'rgba(132,204,22,0.22)',
            primary: d.safetyCulture?.year ?? '—',
            primaryLabel: `assessment ปี ${d.year}`,
            secondary: `<span class="text-slate-600">Culture / PPE Control</span>`,
        },
    ];

    const hiddenModules = new Set(d.config?.hiddenModules || []);
    const visibleModules = modules.filter(m => !hiddenModules.has(m.hash));

    wrap.innerHTML = visibleModules.map(m => {
        const hasPct  = m.pct != null;
        const pctBar  = hasPct ? `
            <div class="mt-3">
                <div class="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>ความคืบหน้า</span><span>${m.pct}%</span>
                </div>
                <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-700"
                         style="width:${m.pct}%;background:${m.pct>=80?'#10b981':m.pct>=50?'#f59e0b':'#ef4444'}"></div>
                </div>
            </div>` : '';

        return `
        <a href="#${m.hash}"
           class="bg-white rounded-xl border ${m.alert ? 'border-red-200' : 'border-slate-100'}
                  shadow-sm p-5 hover:shadow-md transition-all group cursor-pointer
                  ${m.alert ? 'ring-1 ring-red-200' : ''}">
            <div class="flex items-start justify-between mb-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                     style="background:${m.grad};box-shadow:0 2px 10px ${m.shadow}">
                    <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        ${m.icon}
                    </svg>
                </div>
                <svg class="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors mt-1"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
            </div>
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">${m.label}</p>
            <p class="text-3xl font-bold text-slate-800 leading-none">${m.primary}</p>
            <p class="text-xs text-slate-500 mt-1">${m.primaryLabel}</p>
            <div class="mt-2 text-xs">${m.secondary}</div>
            ${pctBar}
        </a>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// MY ACTIVITY TARGETS
// ─────────────────────────────────────────────────────────────────────────────
async function _loadMyTargets() {
    const wrap = document.getElementById('db-my-targets');
    if (!wrap) return;

    try {
        const res = await API.get('/activity-targets/me');
        const targets = res?.data?.targets ?? [];
        const year    = res?.data?.year ?? new Date().getFullYear();

        if (!targets.length) {
            wrap.innerHTML = `
                <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                    <div class="text-center py-8 text-slate-400">
                        <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                            <svg class="w-6 h-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138z"/>
                            </svg>
                        </div>
                        <p class="font-medium text-slate-500">ยังไม่มีเป้าหมายกิจกรรม</p>
                        <p class="text-sm mt-1">ติดต่อ Admin เพื่อตั้งเป้าหมายของคุณ</p>
                    </div>
                </div>`;
            return;
        }

        const passed  = targets.filter(t => t.passed === true).length;
        const total   = targets.length;
        const overallPct = total ? Math.round(passed / total * 100) : 0;

        wrap.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <!-- summary bar -->
                <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100"
                     style="background:linear-gradient(135deg,rgba(5,150,105,0.05),rgba(13,148,136,0.04))">
                    <div class="flex items-center gap-3">
                        <div class="text-2xl font-bold text-slate-800">${passed}<span class="text-base font-normal text-slate-400">/${total}</span></div>
                        <div>
                            <p class="text-xs font-semibold text-slate-600">กิจกรรมที่ผ่านเกณฑ์</p>
                            <p class="text-[11px] text-slate-400">ปี ${year}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-xl font-bold ${overallPct >= 80 ? 'text-emerald-600' : overallPct >= 50 ? 'text-amber-500' : 'text-red-500'}">${overallPct}%</p>
                        <p class="text-[11px] text-slate-400">ภาพรวม</p>
                    </div>
                </div>
                <!-- activity rows -->
                <div class="divide-y divide-slate-50">
                    ${targets.map(t => {
                        const pct    = t.completionPct ?? 0;
                        const passed = t.passed === true;
                        const barBg  = passed ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
                        const badge  = passed
                            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                   <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>ผ่าน
                               </span>`
                            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                                   <span class="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block"></span>ยังไม่ผ่าน
                               </span>`;
                        return `
                        <div class="px-5 py-3 flex items-center gap-4">
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between mb-1 gap-2">
                                    <p class="text-sm font-medium text-slate-700 truncate">${escHtml(t.label)}</p>
                                    ${badge}
                                </div>
                                <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div class="h-full rounded-full transition-all duration-700"
                                         style="width:${pct}%;background:${barBg}"></div>
                                </div>
                            </div>
                            <div class="text-right flex-shrink-0 w-16">
                                <p class="text-sm font-bold text-slate-700">${t.actualCount ?? 0}<span class="text-slate-400 font-normal">/${t.yearlyTarget}</span></p>
                                <p class="text-[10px] text-slate-400">${pct}%</p>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    } catch {
        wrap.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-5 text-center text-slate-400 text-sm">
                ไม่สามารถโหลดเป้าหมายส่วนตัวได้
            </div>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS WIDGET
// ─────────────────────────────────────────────────────────────────────────────
async function _loadAlerts() {
    const wrap = document.getElementById('db-alerts-wrap');
    if (!wrap) return;
    try {
        const res = await API.get('/dashboard/alerts');
        const d   = res?.data;
        if (!d) return;

        const total = (d.overdueAccident?.length || 0) + (d.dueSoonAccident?.length || 0)
                    + (d.machineOverdue?.length || 0) + (d.yokotenOverdue?.length || 0)
                    + (d.openPatrolIssues?.length || 0) + (d.fourmOverdue?.length || 0);
        if (!total) return; // no alerts — leave section empty

        wrap.innerHTML = _renderAlerts(d);
    } catch { /* silent — alerts non-critical */ }
}

function _renderAlerts(d) {
    const fmt = iso => iso ? new Date(iso).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' }) : '—';

    const groups = [
        {
            key: 'overdueAccident',
            title: 'Corrective Action เกินกำหนด',
            hash: 'accident',
            color: '#dc2626',
            bg: 'rgba(254,242,242,0.7)',
            border: '#fecaca',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/>`,
            rows: (d.overdueAccident || []).map(r => ({
                label: escHtml(r.AccidentType || '—'),
                sub:   escHtml(r.Department || ''),
                date:  fmt(r.DueDate),
                dateLabel: 'ครบกำหนด',
            })),
        },
        {
            key: 'dueSoonAccident',
            title: `Corrective Action ใกล้ครบกำหนด (${d.dueSoonDays || 7} วัน)`,
            hash: 'accident',
            color: '#d97706',
            bg: 'rgba(255,251,235,0.7)',
            border: '#fde68a',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>`,
            rows: (d.dueSoonAccident || []).map(r => ({
                label: escHtml(r.AccidentType || '—'),
                sub:   escHtml(r.Department || ''),
                date:  fmt(r.DueDate),
                dateLabel: 'Due',
            })),
        },
        {
            key: 'machineOverdue',
            title: 'เครื่องจักรเกินกำหนดตรวจ',
            hash: 'machine-safety',
            color: '#d97706',
            bg: 'rgba(255,251,235,0.7)',
            border: '#fde68a',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>`,
            rows: (d.machineOverdue || []).map(r => ({
                label: escHtml(r.MachineName || '—'),
                sub:   escHtml(r.Department || ''),
                date:  fmt(r.NextInspectionDate),
                dateLabel: 'ตรวจล่าสุด',
            })),
        },
        {
            key: 'yokotenOverdue',
            title: 'Yokoten เกินกำหนด',
            hash: 'yokoten',
            color: '#6366f1',
            bg: 'rgba(238,242,255,0.7)',
            border: '#c7d2fe',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>`,
            rows: (d.yokotenOverdue || []).map(r => ({
                label: escHtml(r.Title || '—'),
                sub:   `${r.respondedCount ?? 0} แผนกตอบแล้ว`,
                date:  fmt(r.Deadline),
                dateLabel: 'Deadline',
            })),
        },
        {
            key: 'openPatrolIssues',
            title: 'ประเด็น Patrol ค้างอยู่',
            hash: 'patrol',
            color: '#059669',
            bg: 'rgba(240,253,244,0.7)',
            border: '#bbf7d0',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>`,
            rows: (d.openPatrolIssues || []).map(r => ({
                label: escHtml(r.HazardType || '—'),
                sub:   escHtml(r.Area || ''),
                date:  fmt(r.DateFound),
                dateLabel: 'พบเมื่อ',
            })),
        },
        {
            key: 'fourmOverdue',
            title: '4M Change Notice ค้างนาน',
            hash: 'fourm',
            color: '#6366f1',
            bg: 'rgba(238,242,255,0.7)',
            border: '#c7d2fe',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>`,
            rows: (d.fourmOverdue || []).map(r => ({
                label: escHtml(r.NoticeNo || r.Title || '—'),
                sub:   escHtml(r.ResponsiblePerson || r.Department || ''),
                date:  fmt(r.RequestDate),
                dateLabel: 'เปิดเมื่อ',
            })),
        },
    ].filter(g => g.rows.length > 0);

    if (!groups.length) return '';

    const totalCount = groups.reduce((s, g) => s + g.rows.length, 0);

    return `
    <div>
        <h2 class="text-base font-bold text-slate-700 mb-3 flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style="background:linear-gradient(135deg,#dc2626,#f97316)">
                <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </span>
            รายการที่ต้องดำเนินการ
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">${totalCount}</span>
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            ${groups.map(g => `
            <a href="#${g.hash}"
               class="bg-white rounded-xl border shadow-sm hover:shadow-md transition-all overflow-hidden"
               style="border-color:${g.border}">
                <div class="flex items-center gap-2.5 px-4 py-3 border-b"
                     style="background:${g.bg};border-color:${g.border}">
                    <span class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style="background:${g.color}20">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                             style="color:${g.color}">${g.icon}</svg>
                    </span>
                    <p class="text-xs font-bold text-slate-700 flex-1">${g.title}</p>
                    <span class="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                          style="background:${g.color}">${g.rows.length}</span>
                </div>
                <div class="divide-y divide-slate-50">
                    ${g.rows.map(r => `
                    <div class="px-4 py-2.5">
                        <p class="text-xs font-semibold text-slate-700 truncate">${r.label}</p>
                        <div class="flex items-center justify-between mt-0.5">
                            <p class="text-[10px] text-slate-400 truncate">${r.sub}</p>
                            <p class="text-[10px] font-medium flex-shrink-0 ml-2" style="color:${g.color}">
                                ${r.dateLabel} ${r.date}
                            </p>
                        </div>
                    </div>`).join('')}
                </div>
            </a>`).join('')}
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function _greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'สวัสดีตอนเช้า';
    if (h < 17) return 'สวัสดีตอนบ่าย';
    return 'สวัสดีตอนเย็น';
}

function _skeletonCards(n) {
    return Array(n).fill(0).map(() => `
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-5 animate-pulse">
            <div class="flex items-start justify-between mb-3">
                <div class="w-10 h-10 rounded-xl bg-slate-100"></div>
                <div class="w-4 h-4 rounded bg-slate-100 mt-1"></div>
            </div>
            <div class="h-3 bg-slate-100 rounded w-20 mb-2"></div>
            <div class="h-8 bg-slate-100 rounded w-14 mb-2"></div>
            <div class="h-3 bg-slate-100 rounded w-28"></div>
        </div>`).join('');
}
