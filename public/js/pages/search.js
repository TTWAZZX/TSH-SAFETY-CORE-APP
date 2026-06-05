// public/js/pages/search.js
// Employee Safety 360

import { API } from '../api.js';
import { closeModal, escHtml, openModal, showError, showToast } from '../ui.js?v=20260602-mobile-nav-m53';

let _searchReady = false;
let _currentUser = {};
let _isAdmin = false;
let _selectedEmployeeId = '';
let _selectedProfile = null;
let _year = new Date().getFullYear();
let _areas = [];
let _timelineFilter = 'all';

const moduleMeta = {
    patrol: ['Safety Patrol', '#059669'],
    training: ['Training', '#0284c7'],
    cccf: ['CCCF', '#7c3aed'],
    hiyari: ['Hiyari', '#f97316'],
    ky: ['KY', '#0d9488'],
    yokoten: ['Yokoten', '#2563eb'],
    accident: ['Accident', '#dc2626'],
    fourm: ['4M Change', '#6366f1'],
    fourmMatrix: ['4M Matrix', '#6366f1'],
    policy: ['Policy', '#475569'],
    ppe: ['PPE', '#b45309'],
    ppeInspection: ['PPE Inspection', '#b45309'],
    ppeViolation: ['PPE Violation', '#dc2626'],
};

const BI = {
    title: 'ค้นหารายบุคคล / Employee Search',
    subtitle: 'ดูภาพรวม Safety 360 รายบุคคล พร้อมประวัติกิจกรรม ความเสี่ยง และหลักฐานที่เกี่ยวข้อง / View each employee safety profile, activity history, risk signals, and linked evidence.',
    searchLabel: 'ค้นหา / Search',
    searchPlaceholder: 'ชื่อ / รหัส / แผนก / ตำแหน่ง · Name / ID / Department / Position',
    allDepartments: 'ทุกแผนก / All departments',
    results: 'ผลการค้นหา / Search Results',
    people: 'คน / people',
    loadingSearch: 'กำลังค้นหา... / Searching...',
    noEmployee: 'ไม่พบพนักงาน / No employee found',
    noEmployeeText: 'ลองเปลี่ยนคำค้นหา แผนก หรือปีที่ต้องการดูข้อมูล / Try another keyword, department, or year.',
    profileLoading: 'กำลังโหลด Safety 360... / Loading Safety 360...',
    profileLoadError: 'โหลดโปรไฟล์ไม่สำเร็จ / Could not load profile',
    profileLoadErrorText: 'ลองเลือกพนักงานอีกครั้ง หรือ refresh หน้า / Select another employee or refresh the page.',
};

function emptyState({ title, text = '' }) {
    return `
    <div class="p-8 text-center text-slate-400">
        <div class="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3">
            <svg class="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 17v-2a4 4 0 018 0v2m-9 4h10a2 2 0 002-2v-1a5 5 0 00-5-5h-2a5 5 0 00-5 5v1a2 2 0 002 2zm3-11a4 4 0 100-8 4 4 0 000 8z"/>
            </svg>
        </div>
        <p class="text-sm font-bold text-slate-600">${escHtml(title)}</p>
        ${text ? `<p class="text-xs text-slate-400 mt-1">${escHtml(text)}</p>` : ''}
    </div>`;
}

export async function loadSearchPage() {
    const container = document.getElementById('search-page');
    if (!container) return;

    _currentUser = TSHSession.getUser() || {};
    _isAdmin = _currentUser.role === 'Admin' || _currentUser.Role === 'Admin';
    _selectedEmployeeId = _selectedEmployeeId || _currentUser.id || '';
    _year = new Date().getFullYear();

    container.innerHTML = shell();
    bindEvents();
    await loadDepartments();
    await runSearch(_currentUser.name || _currentUser.id || '');
    if (_selectedEmployeeId) await loadProfile(_selectedEmployeeId);
}

function shell() {
    return `
    <div class="space-y-5 animate-fade-in pb-10">
        <div class="rounded-2xl overflow-hidden border border-emerald-100"
             style="background:linear-gradient(135deg,#064e3b 0%,#0f766e 58%,#0d9488 100%)">
            <div class="p-6 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
                <div>
                    <p class="text-xs font-bold uppercase tracking-wider mb-2" style="color:#a7f3d0">Employee Safety 360</p>
                    <h1 class="text-2xl font-bold text-white">${BI.title}</h1>
                    <p class="text-sm mt-1 max-w-2xl" style="color:rgba(209,250,229,0.82)">${BI.subtitle}</p>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    ${statShell('Profile', 'Safety 360')}
                    ${statShell('Patrol', 'Linked')}
                    ${statShell(_isAdmin ? 'Admin' : 'User', 'Access')}
                    ${statShell(String(_year), 'Year')}
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
            <aside class="space-y-4">
                <div class="ds-filter-bar">
                    <label class="text-xs font-bold text-slate-400 uppercase tracking-wider">${BI.searchLabel}</label>
                    <div class="relative mt-2">
                        <input id="people-search-input" class="form-input w-full pl-10" placeholder="${BI.searchPlaceholder}">
                        <svg class="w-4 h-4 absolute left-3 top-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z"/>
                        </svg>
                    </div>
                    <div class="grid grid-cols-[1fr_96px] gap-2 mt-3">
                        <select id="people-dept-filter" class="form-input text-sm"><option value="all">${BI.allDepartments}</option></select>
                        <select id="people-year" class="form-input text-sm">
                            ${Array.from({ length: 5 }, (_, i) => {
                                const y = new Date().getFullYear() - i;
                                return `<option value="${y}" ${y === _year ? 'selected' : ''}>${y}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>

                <div id="people-results" class="ds-table-wrap"></div>
            </aside>

            <main id="person-profile" class="min-h-[520px]"></main>
        </div>
    </div>`;
}

function statShell(value, label) {
    return `<div class="rounded-xl px-4 py-3 min-w-[92px]" style="background:rgba(255,255,255,0.12)">
        <p class="text-xl font-extrabold text-white">${escHtml(value)}</p>
        <p class="text-[11px]" style="color:#a7f3d0">${escHtml(label)}</p>
    </div>`;
}

function bindEvents() {
    if (_searchReady) return;
    _searchReady = true;
    let timer = null;
    document.addEventListener('input', (e) => {
        if (!e.target.closest('#search-page')) return;
        if (e.target.id === 'people-search-input') {
            clearTimeout(timer);
            timer = setTimeout(() => runSearch(e.target.value), 240);
        }
    });
    document.addEventListener('change', (e) => {
        if (!e.target.closest('#search-page')) return;
        if (e.target.id === 'people-dept-filter') runSearch(document.getElementById('people-search-input')?.value || '');
        if (e.target.id === 'people-year') {
            _year = parseInt(e.target.value, 10) || new Date().getFullYear();
            if (_selectedEmployeeId) loadProfile(_selectedEmployeeId);
        }
    });
    document.addEventListener('click', async (e) => {
        if (!e.target.closest('#search-page') && !e.target.closest('#modal-wrapper')) return;
        const row = e.target.closest('[data-person-id]');
        if (row) {
            _selectedEmployeeId = row.dataset.personId;
            await loadProfile(_selectedEmployeeId);
            return;
        }
        if (e.target.closest('#btn-add-person-patrol')) openPatrolRecordModal();
        if (e.target.closest('#btn-export-person-excel')) exportPersonExcel();
        if (e.target.closest('#btn-print-person-audit')) printPersonAuditView();
        const del = e.target.closest('[data-delete-patrol]');
        if (del) await deletePatrolRecord(del.dataset.deletePatrol);
        const timelineFilter = e.target.closest('[data-timeline-filter]');
        if (timelineFilter && _selectedProfile) {
            _timelineFilter = timelineFilter.dataset.timelineFilter || 'all';
            const host = document.getElementById('person-timeline-panel');
            if (host) host.innerHTML = renderTimelinePanel(_selectedProfile);
        }
    });
}

async function loadDepartments() {
    const sel = document.getElementById('people-dept-filter');
    if (!sel) return;
    const res = await API.get('/master/departments').catch(() => ({ data: [] }));
    const depts = (res?.data || []).map(d => d.Name || d.name || d).filter(Boolean);
    sel.innerHTML = `<option value="all">${BI.allDepartments}</option>${depts.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('')}`;
}

async function runSearch(q = '') {
    const wrap = document.getElementById('people-results');
    if (!wrap) return;
    const dept = document.getElementById('people-dept-filter')?.value || 'all';
    wrap.innerHTML = `<div class="p-5 text-sm text-slate-400">${BI.loadingSearch}</div>`;
    try {
        const res = await API.get(`/person-search/employees?q=${encodeURIComponent(q)}&department=${encodeURIComponent(dept)}&limit=30`);
        const rows = res?.data || [];
        wrap.innerHTML = `
            <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p class="text-sm font-bold text-slate-700">${BI.results}</p>
                <span class="text-xs text-slate-400">${rows.length} ${BI.people}</span>
            </div>
            <div class="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
                ${rows.map(personRow).join('') || emptyState({ title: BI.noEmployee, text: BI.noEmployeeText })}
            </div>`;
    } catch (err) {
        wrap.innerHTML = emptyState({ title: 'ค้นหาไม่สำเร็จ / Search failed', text: err.message || 'ระบบไม่สามารถโหลดรายชื่อพนักงานได้ในตอนนี้ / Employee list is not available right now.' });
        console.error(err);
    }
}

function personRow(p) {
    const active = String(p.EmployeeID) === String(_selectedEmployeeId);
    return `
    <button data-person-id="${escHtml(p.EmployeeID)}"
            class="w-full text-left px-4 py-3 hover:bg-emerald-50 transition-colors ${active ? 'bg-emerald-50' : 'bg-white'}">
        <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0"
                 style="background:linear-gradient(135deg,#059669,#0d9488)">${escHtml((p.EmployeeName || '?').charAt(0))}</div>
            <div class="min-w-0">
                <p class="font-bold text-slate-800 truncate">${escHtml(p.EmployeeName || '-')}</p>
                <p class="text-xs text-slate-500 truncate">${escHtml(p.EmployeeID)} · ${escHtml(p.Position || '-')}</p>
                <p class="text-xs text-slate-400 truncate">${escHtml(p.Department || '-')} ${p.Unit ? '· ' + escHtml(p.Unit) : ''}</p>
            </div>
        </div>
    </button>`;
}

async function loadProfile(employeeId) {
    const wrap = document.getElementById('person-profile');
    if (!wrap) return;
    wrap.innerHTML = profileLoading();
    try {
        const res = await API.get(`/person-search/profile/${encodeURIComponent(employeeId)}?year=${_year}`);
        _selectedProfile = res?.data || null;
        wrap.innerHTML = renderProfile(_selectedProfile);
    } catch (err) {
        wrap.innerHTML = `<div class="ds-section border-red-100">${emptyState({ title: BI.profileLoadError, text: err.message || BI.profileLoadErrorText })}</div>`;
        console.error(err);
    }
}

function profileLoading() {
    return `<div class="ds-section p-8 text-center text-slate-400">
        <div class="animate-spin rounded-full h-9 w-9 border-4 border-emerald-500 border-t-transparent mx-auto mb-3"></div>
        ${BI.profileLoading}
    </div>`;
}

function statusTone(status) {
    const s = String(status || '').toLowerCase();
    if (s.includes('action')) return { color: '#dc2626', bg: '#fff1f2', border: '#fecdd3' };
    if (s.includes('watch')) return { color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
    return { color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
}

function compactValue(value, fallback = '-') {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value);
}

function renderProfile(data) {
    const emp = data.employee || {};
    const m = data.metrics || {};
    const riskProfile = data.riskProfile || {};
    const score = riskProfile.score ?? data.complianceScore;
    const scoreColor = score == null ? '#64748b' : score >= 80 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626';
    const overall = riskProfile.status || data.overallStatus || 'Good';
    const overallTone = statusTone(overall);
    const activeFourm = (data.fourmScopes || []).filter(r => r.Status === 'Assigned');
    return `
    <div class="space-y-5">
        <section class="ds-section overflow-hidden">
            <div class="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl text-white font-extrabold"
                         style="background:linear-gradient(135deg,#064e3b,#0d9488)">${escHtml((emp.EmployeeName || '?').charAt(0))}</div>
                    <div>
                        <h2 class="text-xl font-bold text-slate-800">${escHtml(emp.EmployeeName || '-')}</h2>
                        <p class="text-sm text-slate-500">${escHtml(emp.EmployeeID || '-')} · ${escHtml(emp.Position || '-')}</p>
                        <p class="text-xs text-slate-400">${escHtml(emp.Department || '-')} ${emp.Unit ? '· ' + escHtml(emp.Unit) : ''} ${emp.Team ? '· ' + escHtml(emp.Team) : ''}</p>
                    </div>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${_isAdmin ? `<button id="btn-add-person-patrol" class="btn btn-primary px-4 py-2 text-sm">บันทึก Patrol / Add Patrol</button>` : ''}
                    <button id="btn-export-person-excel" class="btn btn-secondary px-4 py-2 text-sm">Excel</button>
                    <button id="btn-print-person-audit" class="btn btn-secondary px-4 py-2 text-sm">Print</button>
                    <a href="#patrol" class="btn btn-secondary px-4 py-2 text-sm">ไปหน้า Patrol / Open Patrol</a>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-slate-100">
                ${kpiBox(score == null ? '-' : score + '%', 'คะแนนความปลอดภัย / Safety Compliance', scoreColor)}
                ${kpiBox(overall, 'สถานะความเสี่ยง / Risk Status', overallTone.color)}
                ${kpiBox(`${m.trainingPassed}/${m.training}`, 'ผ่านอบรม / Training Passed', '#0284c7')}
                ${kpiBox(activeFourm.length, 'ขอบเขต 4M / 4M Scope', '#6366f1')}
            </div>
        </section>

        <section class="grid grid-cols-1 md:grid-cols-5 gap-3">
            ${renderSignalCards(data.complianceSignals || [])}
        </section>

        ${renderActivityTargets(data.activityTargets || [], data.activityTargetSummary || {})}

        <section class="ds-section overflow-hidden">
            ${renderRiskProfile(riskProfile, m)}
        </section>

        <section class="grid grid-cols-2 md:grid-cols-5 gap-3">
            ${moduleCard('patrol', m.patrol, `${m.patrolIssues} ประเด็น / issues`)}
            ${moduleCard('cccf', m.cccfWorker + m.cccfPermanent, 'พนักงาน / ถาวร · Worker / Permanent')}
            ${moduleCard('hiyari', m.hiyari, 'Near-miss')}
            ${moduleCard('ky', m.ky, 'KY Activity')}
            ${moduleCard('yokoten', m.yokoten, 'การตอบกลับ / Responses')}
            ${moduleCard('fourm', m.fourmOwner + m.fourmCreated, 'เจ้าของ / สร้าง · Owner / Created')}
            ${moduleCard('fourmMatrix', m.fourmScopes, 'Training Matrix')}
            ${moduleCard('ppe', m.ppeViolations, 'PPE violations')}
            ${moduleCard('training', m.training, `${m.trainingPassed} ผ่าน / passed`)}
            ${moduleCard('accident', m.accidents, 'Reports')}
        </section>

        <section class="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div class="ds-section overflow-hidden">
                <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div>
                        <h3 class="font-bold text-slate-800">ข้อมูลพนักงาน / Person Snapshot</h3>
                        <p class="text-xs text-slate-400">ข้อมูล Employee Master, OJT และขอบเขต 4M / Employee Master, OJT, and 4M scope</p>
                    </div>
                    <span class="text-xs text-slate-400">${_year}</span>
                </div>
                <div class="p-5 space-y-4">
                    ${renderProfileFacts(emp, m)}
                    ${renderFourmScopes(data.fourmScopes || [])}
                </div>
            </div>
            <div class="ds-section overflow-hidden">
                <div class="px-5 py-4 border-b border-slate-100">
                    <h3 class="font-bold text-slate-800">Training / PPE / CCCF</h3>
                    <p class="text-xs text-slate-400">รายการล่าสุดที่เชื่อมกับพนักงานนี้ / Recent records linked to this employee</p>
                </div>
                <div class="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                    ${renderTrainingRows(data.trainingRecords || [])}
                    ${renderPpeRows(data.ppeInspections || [], data.ppeViolations || [])}
                    ${renderCccfRows(data.cccfRecords || [])}
                </div>
            </div>
        </section>

        <section class="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div class="ds-section overflow-hidden">
                <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 class="font-bold text-slate-800">ประวัติ Patrol / Patrol History</h3>
                    <span class="text-xs text-slate-400">${_year}</span>
                </div>
                <div class="divide-y divide-slate-100">${renderPatrolRows(data.patrolRecords || [])}</div>
            </div>
            <div class="ds-section overflow-hidden">
                <div id="person-timeline-panel">${renderTimelinePanel(data)}</div>
            </div>
        </section>
    </div>`;
}

function renderActivityTargets(rows, summary) {
    if (!rows.length) return '';
    const evaluable = summary.evaluable ?? rows.filter(row => !row.noData && row.passed !== null).length;
    const passed = summary.passed ?? rows.filter(row => !row.noData && row.passed === true).length;
    const noData = summary.noData ?? Math.max(0, rows.length - evaluable);
    const sourceLabel = row => row.source === 'scope' ? 'Department/Unit Override' : row.source === 'override' ? 'Employee Override' : row.source === 'system' ? 'System Ratio · Department KPI' : row.source === 'module' ? 'Module Target' : 'Position Template';
    const calculationLabel = row => row.calculationScope
        ? `${row.calculationScope.type === 'employee' ? 'Personal KPI' : row.calculationScope.type === 'department_unit' ? 'Scope KPI · Department/Unit' : 'Scope KPI · Department'}${row.targetSource === 'patrol_roster' ? ' · Patrol Roster' : row.targetSource === 'ky_program_config' ? ' · KY Program Config' : ''}`
        : '';
    return `<section class="ds-section overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div><h3 class="font-bold text-slate-800">เป้าหมายกิจกรรม / Activity Targets</h3><p class="text-xs text-slate-400">Effective source after Employee > Department/Unit > Position priority</p></div>
            <span class="text-xs font-bold text-slate-500">${passed}/${evaluable} passed${noData ? ` · ${noData} no data` : ''}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-slate-100">
            ${rows.map(row => {
                const pct = row.completionPct ?? 0;
                const color = row.noData ? '#64748b' : row.passed ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626';
                return `<div class="bg-white p-4">
                    <div class="flex items-start justify-between gap-2"><p class="text-sm font-bold text-slate-700">${escHtml(row.label)}</p><span class="text-xs font-extrabold" style="color:${color}">${row.noData ? '-' : `${pct}%`}</span></div>
                    <p class="text-[11px] font-bold mt-1 ${row.source === 'scope' ? 'text-emerald-600' : row.source === 'override' ? 'text-violet-600' : row.source === 'system' ? 'text-amber-600' : row.source === 'module' ? 'text-teal-600' : 'text-sky-600'}">${sourceLabel(row)}${calculationLabel(row) ? ` · ${calculationLabel(row)}` : ''}</p>
                    <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-3"><div class="h-full rounded-full" style="width:${pct}%;background:${color}"></div></div>
                    <p class="text-xs text-slate-500 mt-2">${row.noData ? 'ไม่มีข้อมูลสำหรับคำนวณ' : `${row.actualCount || 0}/${row.yearlyTarget} ${row.unitLabel || 'records'} · pass ${row.passPct}%`}</p>
                </div>`;
            }).join('')}
        </div>
    </section>`;
}

function kpiBox(value, label, color) {
    return `<div class="p-5 border-r border-slate-100 last:border-r-0">
        <p class="text-2xl font-extrabold" style="color:${color}">${escHtml(String(value ?? '-'))}</p>
        <p class="text-xs text-slate-500 mt-1">${escHtml(label)}</p>
    </div>`;
}

function moduleCard(key, value, sub) {
    const [label, color] = moduleMeta[key] || [key, '#64748b'];
    return `<div class="ds-metric-card p-4">
        <p class="text-[11px] font-bold text-slate-400 uppercase truncate">${escHtml(label)}</p>
        <p class="text-2xl font-extrabold mt-1" style="color:${color}">${escHtml(String(value ?? 0))}</p>
        <p class="text-xs text-slate-500 truncate">${escHtml(sub || '')}</p>
    </div>`;
}

function renderSignalCards(signals) {
    if (!signals.length) return emptyState({ title: 'ยังไม่มีสัญญาณความครอบคลุม / No compliance signals yet' });
    return signals.map(item => {
        const tone = statusTone(item.status);
        return `<div class="rounded-lg border p-4 min-h-[126px]" style="background:${tone.bg};border-color:${tone.border}">
            <div class="flex items-start justify-between gap-2">
                <p class="text-[11px] font-extrabold uppercase text-slate-500">${escHtml(item.label || item.key || '-')}</p>
                <span class="text-[10px] font-extrabold px-2 py-1 rounded-md" style="color:${tone.color};background:#fff">${escHtml(item.status || 'Good')}</span>
            </div>
            <p class="text-xl font-extrabold mt-3" style="color:${tone.color}">${escHtml(item.value || '-')}</p>
            <p class="text-xs text-slate-500 mt-1 leading-snug">${escHtml(item.detail || '')}</p>
        </div>`;
    }).join('');
}

function renderRiskProfile(profile, metrics) {
    const status = profile.status || 'Watch';
    const tone = statusTone(status);
    const score = profile.score ?? '-';
    const factors = profile.factors || [];
    const reasons = profile.reasons || [];
    const actions = profile.nextActions || [];
    return `
        <div class="p-5 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div>
                <p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Risk & Compliance Signal</p>
                <h3 class="text-lg font-black text-slate-800 mt-1">สถานะความปลอดภัยรายบุคคล / Personal safety status: <span style="color:${tone.color}">${escHtml(status)}</span></h3>
                <p class="text-xs text-slate-500 mt-1">คำนวณจาก Training, 4M scope, risk events, proactive activity และ PPE evidence / Weighted safety indicators.</p>
            </div>
            <div class="flex items-center gap-3">
                <div class="w-20 h-20 rounded-2xl border flex flex-col items-center justify-center" style="background:${tone.bg};border-color:${tone.border}">
                    <p class="text-2xl font-black" style="color:${tone.color}">${escHtml(String(score))}</p>
                    <p class="text-[10px] font-bold text-slate-500">/ 100</p>
                </div>
                <div class="text-xs text-slate-500">
                    <p><span class="font-bold text-slate-700">${escHtml(String(metrics.accidents || 0))}</span> อุบัติเหตุ / accident</p>
                    <p><span class="font-bold text-slate-700">${escHtml(String(metrics.ppeViolations || 0))}</span> PPE violation</p>
                    <p><span class="font-bold text-slate-700">${escHtml(String(metrics.patrolIssues || 0))}</span> patrol issue</p>
                </div>
            </div>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-0">
            <div class="p-5 border-b xl:border-b-0 xl:border-r border-slate-100">
                <p class="text-sm font-extrabold text-slate-700 mb-3">คะแนนปัจจัย / Factor score</p>
                <div class="space-y-3">
                    ${factors.map(renderRiskFactor).join('') || emptyState({ title: 'No factor score available' })}
                </div>
            </div>
            <div class="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
                ${renderRiskList('เหตุผล / Reasons', reasons)}
                ${renderRiskList('สิ่งที่ควรทำต่อ / Next actions', actions)}
            </div>
        </div>`;
}

function renderRiskFactor(factor) {
    const score = Math.max(0, Math.min(100, Number(factor.score) || 0));
    const color = score >= 80 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626';
    return `<div>
        <div class="flex items-center justify-between gap-3 mb-1">
            <p class="text-xs font-bold text-slate-600">${escHtml(factor.label || factor.key || '-')}</p>
            <p class="text-xs font-extrabold" style="color:${color}">${score}% <span class="text-slate-400">w${escHtml(String(factor.weight || 0))}</span></p>
        </div>
        <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full rounded-full" style="width:${score}%;background:${color}"></div>
        </div>
    </div>`;
}

function renderRiskList(title, items) {
    const rows = (items || []).slice(0, 5);
    return `<div>
        <p class="text-sm font-extrabold text-slate-700 mb-2">${escHtml(title)}</p>
        <div class="space-y-2">
            ${rows.length ? rows.map(item => `<div class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">${escHtml(item)}</div>`).join('') : '<div class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-400">No item</div>'}
        </div>
    </div>`;
}

function renderProfileFacts(emp, m) {
    const facts = [
        ['แผนก / Department', emp.Department],
        ['ตำแหน่ง / Position', emp.Position],
        ['Unit / Team', [emp.Unit, emp.Team].filter(Boolean).join(' / ')],
        ['Company Email', emp.CompanyEmail],
        ['OJT แผนก / OJT Department Records', m.ojtDept],
        ['รับทราบนโยบาย / Policy Acknowledgements', m.policyAck],
    ];
    return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${facts.map(([label, value]) => `<div class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <p class="text-[11px] font-bold uppercase text-slate-400">${escHtml(label)}</p>
            <p class="text-sm font-bold text-slate-700 truncate mt-0.5">${escHtml(compactValue(value, '-'))}</p>
        </div>`).join('')}
    </div>`;
}

function renderFourmScopes(rows) {
    if (!rows.length) return emptyState({ title: 'ยังไม่มีขอบเขต 4M Training Matrix / No 4M Training Matrix scope', text: 'เมื่อมี active curriculum assignment จะแสดงที่นี่ / Active curriculum assignments will appear here.' });
    return `<div>
        <div class="flex items-center justify-between mb-2">
            <p class="text-sm font-extrabold text-slate-700">ขอบเขต 4M Training Matrix / 4M Training Matrix Scope</p>
            <span class="text-xs text-slate-400">${rows.length} scope(s)</span>
        </div>
        <div class="space-y-2">
            ${rows.map(r => {
                const active = r.Status === 'Assigned';
                const tone = active ? statusTone('Good') : statusTone('Watch');
                return `<div class="rounded-lg border p-3" style="background:${active ? '#fff' : '#f8fafc'};border-color:${tone.border}">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="font-bold text-slate-800 truncate">${escHtml(r.CurriculumTitle || r.CurriculumCode || '-')}</p>
                            <p class="text-xs text-slate-500 truncate">${escHtml(r.CurriculumCode || '-')} - ${escHtml(r.Department || '-')}</p>
                        </div>
                        <span class="text-[10px] font-extrabold px-2 py-1 rounded-md" style="color:${tone.color};background:${tone.bg}">${escHtml(r.Status || '-')}</span>
                    </div>
                    <p class="text-xs text-slate-400 mt-2">${escHtml(String(r.CourseCount || 0))} linked course(s) - assigned ${formatDate(r.AssignedAt)}</p>
                </div>`;
            }).join('')}
        </div>
    </div>`;
}

function renderTrainingRows(rows) {
    if (!rows.length) return emptyState({ title: 'ยังไม่มีประวัติ Training รายบุคคล / No individual training records', text: 'Training records for selected year will appear here.' });
    return rows.map(r => `<div class="px-5 py-3 flex items-start justify-between gap-3">
        <div class="min-w-0">
            <p class="font-semibold text-slate-700 truncate">${escHtml(r.CourseName || r.CourseCode || 'Training')}</p>
            <p class="text-xs text-slate-500">${formatDate(r.TrainingDate)} - Score ${escHtml(compactValue(r.Score, '-'))}</p>
        </div>
        <span class="text-xs font-bold ${r.IsPassed ? 'text-emerald-600' : 'text-red-600'}">${r.IsPassed ? 'Passed' : 'Not passed'}</span>
    </div>`).join('');
}

function renderPpeRows(inspections, violations) {
    const items = [
        ...inspections.map(r => ({ kind: 'Inspection', date: r.InspectionDate, title: r.WorkTypeName || r.Area || 'PPE inspection', status: r.IsPass ? 'Pass' : 'Issue', detail: r.CompliancePct == null ? '' : `${Math.round(Number(r.CompliancePct))}% compliance` })),
        ...violations.map(r => ({ kind: 'Violation', date: r.ViolationDate, title: r.WarningLevel || 'PPE violation', status: r.ViolationNo ? `No. ${r.ViolationNo}` : '', detail: r.Note || r.InspectorName || '' })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
    if (!items.length) return emptyState({ title: 'ยังไม่มีข้อมูล PPE / No PPE records', text: 'PPE inspections and violations will appear here.' });
    return items.map(r => `<div class="px-5 py-3">
        <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
                <p class="font-semibold text-slate-700 truncate">${escHtml(r.title)}</p>
                <p class="text-xs text-slate-500">${formatDate(r.date)} - ${escHtml(r.kind)} ${r.detail ? '- ' + escHtml(r.detail) : ''}</p>
            </div>
            <span class="text-xs font-bold ${r.kind === 'Violation' || r.status === 'Issue' ? 'text-red-600' : 'text-emerald-600'}">${escHtml(r.status || '-')}</span>
        </div>
    </div>`).join('');
}

function renderCccfRows(rows) {
    if (!rows.length) return emptyState({ title: 'ยังไม่มีข้อมูล CCCF / No CCCF records', text: 'Worker and permanent Form A records will appear here.' });
    return rows
        .sort((a, b) => new Date(b.SubmitDate) - new Date(a.SubmitDate))
        .slice(0, 8)
        .map(r => `<div class="px-5 py-3">
            <p class="font-semibold text-slate-700 truncate">${escHtml(r.JobArea || r.Equipment || r.Summary || 'CCCF Form A')}</p>
            <p class="text-xs text-slate-500">${formatDate(r.SubmitDate)} ${r.SafetyUnit ? '- ' + escHtml(r.SafetyUnit) : ''} ${r.Rank ? '- Rank ' + escHtml(r.Rank) : ''}</p>
        </div>`).join('');
}

function renderPatrolRows(rows) {
    if (!rows.length) return emptyState({
        title: 'ยังไม่มีบันทึก Patrol ในปีนี้ / No Patrol records this year',
        text: _isAdmin ? 'แอดมินสามารถเพิ่มบันทึก Patrol ให้พนักงานคนนี้ได้จากปุ่มด้านบน / Admin can add a Patrol record from the action button.' : 'ข้อมูลจะแสดงเมื่อมีการเดิน Patrol / Records will appear after Patrol activity.'
    });
    return rows.map(r => `
    <div class="px-5 py-3 flex items-start justify-between gap-3">
        <div>
            <p class="font-semibold text-slate-700">${formatDate(r.PatrolDate)} · ${escHtml(r.Area || '-')}</p>
            <p class="text-xs text-slate-500">${escHtml(r.PatrolType || 'normal')} ${r.Notes ? '· ' + escHtml(r.Notes) : ''}</p>
        </div>
        ${_isAdmin ? `<button data-delete-patrol="${r.id}" class="text-xs text-red-500 hover:underline flex-shrink-0">ลบ / Delete</button>` : ''}
    </div>`).join('');
}

function renderTimelineLegacyOld(items) {
    if (!items.length) return emptyState({ title: 'ยังไม่มี activity timeline ในปีนี้', text: 'เมื่อมี Training, Patrol, 4M, Hiyari หรือกิจกรรมอื่น ระบบจะแสดงที่นี่' });
    return items.map(i => `
    <div class="px-5 py-3 flex gap-3">
        <div class="w-2 h-2 rounded-full mt-2 flex-shrink-0" style="background:${typeColor(i.type)}"></div>
        <div class="min-w-0">
            <p class="text-sm font-semibold text-slate-700 truncate">${escHtml(i.title || i.type)}</p>
            <p class="text-xs text-slate-400">${formatDate(i.date)} · ${escHtml(i.type)} ${i.status ? '· ' + escHtml(i.status) : ''}</p>
        </div>
    </div>`).join('');
}

function timelineModuleOptions(items) {
    const seen = new Set(items.map(i => i.module || moduleKeyFromType(i.type)).filter(Boolean));
    const preferred = ['training', 'fourm', 'patrol', 'cccf', 'ppe', 'accident', 'ky', 'hiyari', 'yokoten'];
    return preferred.filter(key => seen.has(key));
}

function timelineFilterButton(key, label, count) {
    const active = _timelineFilter === key;
    const color = typeColor(key);
    return `<button type="button" data-timeline-filter="${escHtml(key)}"
        class="px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}">
        <span>${escHtml(label)}</span>
        <span class="ml-1" style="color:${active ? '#fff' : color}">${escHtml(String(count))}</span>
    </button>`;
}

function renderTimelinePanel(data) {
    const items = data.timeline || [];
    const summary = data.timelineSummary || {};
    const moduleCounts = summary.byModule || items.reduce((acc, item) => {
        const key = item.module || moduleKeyFromType(item.type);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const moduleOptions = timelineModuleOptions(items);
    if (_timelineFilter !== 'all' && !moduleOptions.includes(_timelineFilter)) _timelineFilter = 'all';
    const filtered = _timelineFilter === 'all'
        ? items
        : items.filter(item => (item.module || moduleKeyFromType(item.type)) === _timelineFilter);

    return `
        <div class="px-5 py-4 border-b border-slate-100">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                    <h3 class="font-bold text-slate-800">ไทม์ไลน์ความปลอดภัย / Safety Timeline</h3>
                    <p class="text-xs text-slate-400">${escHtml(String(items.length))} รายการ / records - latest first</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${timelineFilterButton('all', 'ทั้งหมด / All', items.length)}
                    ${moduleOptions.map(key => timelineFilterButton(key, timelineLabel(key), moduleCounts[key] || 0)).join('')}
                </div>
            </div>
        </div>
        <div class="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">${renderTimeline(filtered)}</div>`;
}

function renderTimeline(items) {
    if (!items.length) return emptyState({ title: 'ไม่พบไทม์ไลน์ในตัวกรองนี้ / No timeline records for this filter', text: 'เลือกโมดูลหรือปีอื่นเพื่อดู Safety activity / Choose another module or year to view linked safety activity.' });
    return items.map(i => `
    <div class="px-5 py-3 flex gap-3">
        <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style="background:${timelineBg(i)};color:${typeColor(i.module || i.type)}">
            ${timelineIcon(i.module || i.type)}
        </div>
        <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-slate-700 truncate">${escHtml(i.title || i.type)}</p>
                <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md" style="background:${timelineBg(i)};color:${typeColor(i.module || i.type)}">${escHtml(i.type || '-')}</span>
                ${i.severity === 'risk' ? '<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-red-50 text-red-600">Risk</span>' : ''}
            </div>
            <p class="text-xs text-slate-400 mt-0.5">${formatDate(i.date)} ${i.status ? '- ' + escHtml(i.status) : ''} ${i.detail ? '- ' + escHtml(i.detail) : ''}</p>
        </div>
    </div>`).join('');
}

function moduleKeyFromType(type) {
    const t = String(type || '').toLowerCase();
    if (t.includes('4m')) return 'fourm';
    if (t.includes('ppe')) return 'ppe';
    if (t.includes('patrol')) return 'patrol';
    if (t.includes('training')) return 'training';
    if (t.includes('cccf')) return 'cccf';
    if (t.includes('accident')) return 'accident';
    if (t.includes('hiyari')) return 'hiyari';
    if (t.includes('ky')) return 'ky';
    if (t.includes('yokoten')) return 'yokoten';
    return 'other';
}

function timelineLabel(key) {
    const labels = {
        fourm: '4M',
        ppe: 'PPE',
        patrol: 'Patrol',
        training: 'Training',
        cccf: 'CCCF',
        accident: 'Accident',
        hiyari: 'Hiyari',
        ky: 'KY',
        yokoten: 'Yokoten',
    };
    return labels[key] || key;
}

function timelineBg(item) {
    return item?.severity === 'risk' ? '#fff1f2' : '#f8fafc';
}

function timelineIcon(type) {
    const t = moduleKeyFromType(type);
    const icons = {
        training: 'T',
        fourm: '4M',
        patrol: 'P',
        cccf: 'C',
        ppe: 'PPE',
        accident: '!',
        ky: 'KY',
        hiyari: 'H',
        yokoten: 'Y',
    };
    return `<span class="text-[11px] font-black">${escHtml(icons[t] || '*')}</span>`;
}

function typeColor(type) {
    const t = String(type || '').toLowerCase();
    if (t.includes('accident')) return '#dc2626';
    if (t.includes('training')) return '#0284c7';
    if (t.includes('patrol')) return '#059669';
    if (t.includes('ppe')) return t.includes('violation') ? '#dc2626' : '#b45309';
    if (t.includes('cccf')) return '#7c3aed';
    if (t.includes('4m') || t === 'fourm') return '#6366f1';
    if (t.includes('ky')) return '#0d9488';
    if (t.includes('hiyari')) return '#f97316';
    return '#64748b';
}

function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function openPatrolRecordModal() {
    if (!_isAdmin || !_selectedProfile) return;
    if (!_areas.length) {
        const res = await API.get('/patrol/areas').catch(() => ({ data: [] }));
        _areas = res?.data || [];
    }
    const emp = _selectedProfile.employee;
    const areaOptions = (_areas.length ? _areas : [{ Name: 'โรงงาน' }, { Name: 'พื้นที่ผลิต' }, { Name: 'รอบนอก' }])
        .map(a => `<option value="${escHtml(a.Name || a.AreaName || '')}">${escHtml(a.Name || a.AreaName || '')}</option>`).join('');
    openModal('บันทึก Patrol รายบุคคล', `
        <form id="person-patrol-form" class="space-y-4">
            <div class="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p class="font-bold text-slate-800">${escHtml(emp.EmployeeName)}</p>
                <p class="text-xs text-slate-500">${escHtml(emp.EmployeeID)} · ${escHtml(emp.Department || '-')}</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1">วันที่</label>
                    <input type="date" name="PatrolDate" class="form-input w-full" value="${new Date().toISOString().slice(0,10)}" required>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1">ประเภท</label>
                    <select name="PatrolType" class="form-input w-full">
                        <option value="normal">เดินตรวจปกติ</option>
                        <option value="compensation">เดินซ่อม</option>
                        <option value="Re-inspection">ตรวจซ้ำ/ติดตาม</option>
                    </select>
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1">พื้นที่</label>
                <select name="Area" class="form-input w-full">${areaOptions}</select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1">หมายเหตุ</label>
                <textarea name="Notes" rows="3" class="form-input w-full"></textarea>
            </div>
            <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4" id="person-patrol-cancel">ยกเลิก</button>
                <button type="submit" class="btn btn-primary px-5">บันทึก</button>
            </div>
        </form>`, 'max-w-xl');

    document.getElementById('person-patrol-cancel')?.addEventListener('click', closeModal);
    document.getElementById('person-patrol-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await API.post('/patrol/admin-record', {
                EmployeeID: emp.EmployeeID,
                PatrolDate: fd.get('PatrolDate'),
                PatrolType: fd.get('PatrolType'),
                Area: fd.get('Area'),
                Notes: fd.get('Notes'),
            });
            closeModal();
            showToast('บันทึก Patrol สำเร็จ', 'success');
            await loadProfile(emp.EmployeeID);
        } catch (err) {
            showError(err);
        }
    });
}

function auditRows(profile) {
    const emp = profile?.employee || {};
    const metrics = profile?.metrics || {};
    const risk = profile?.riskProfile || {};
    return [
        ['Employee ID', emp.EmployeeID || ''],
        ['Employee Name', emp.EmployeeName || ''],
        ['Department', emp.Department || ''],
        ['Unit', emp.Unit || ''],
        ['Team', emp.Team || ''],
        ['Position', emp.Position || ''],
        ['Company Email', emp.CompanyEmail || ''],
        ['Year', profile?.year || _year],
        ['Risk Status', risk.status || profile?.overallStatus || ''],
        ['Risk Score', risk.score ?? profile?.complianceScore ?? ''],
        ['Training Passed / Total', `${metrics.trainingPassed || 0}/${metrics.training || 0}`],
        ['4M Active Scope', metrics.fourmScopes || 0],
        ['Accidents', metrics.accidents || 0],
        ['PPE Violations', metrics.ppeViolations || 0],
        ['Patrol Issues', metrics.patrolIssues || 0],
        ['KY Records', metrics.ky || 0],
        ['Hiyari Records', metrics.hiyari || 0],
        ['CCCF Records', (metrics.cccfWorker || 0) + (metrics.cccfPermanent || 0)],
    ];
}

function exportPersonExcel() {
    if (!_selectedProfile) return;
    if (!window.XLSX) {
        showToast('Excel library is not available on this page', 'error');
        return;
    }
    const emp = _selectedProfile.employee || {};
    const risk = _selectedProfile.riskProfile || {};
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Person Profile 360 Audit Export'],
        ['Generated At', new Date().toLocaleString('th-TH')],
        [],
        ...auditRows(_selectedProfile),
    ]), 'Profile');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Factor', 'Score', 'Weight'],
        ...(risk.factors || []).map(f => [f.label || f.key || '', f.score ?? '', f.weight ?? '']),
        [],
        ['Reasons'],
        ...(risk.reasons || []).map(item => [item]),
        [],
        ['Next Actions'],
        ...(risk.nextActions || []).map(item => [item]),
    ]), 'Risk Signal');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Date', 'Module', 'Type', 'Title', 'Status', 'Detail', 'Severity', 'Ref ID'],
        ...(_selectedProfile.timeline || []).map(item => [
            formatDate(item.date),
            item.module || '',
            item.type || '',
            item.title || '',
            item.status || '',
            item.detail || '',
            item.severity || '',
            item.refId || '',
        ]),
    ]), 'Timeline');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Curriculum Code', 'Curriculum Title', 'Department', 'Status', 'Course Count', 'Assigned At'],
        ...(_selectedProfile.fourmScopes || []).map(row => [
            row.CurriculumCode || '',
            row.CurriculumTitle || '',
            row.Department || '',
            row.Status || '',
            row.CourseCount || 0,
            formatDate(row.AssignedAt),
        ]),
    ]), '4M Scope');

    const safeId = String(emp.EmployeeID || 'person').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `Person_Profile_360_${safeId}_${_year}.xlsx`);
    showToast('Exported person audit workbook', 'success');
}

function printPersonAuditView() {
    if (!_selectedProfile) return;
    const emp = _selectedProfile.employee || {};
    const risk = _selectedProfile.riskProfile || {};
    const rows = auditRows(_selectedProfile);
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) {
        showToast('Popup blocked. Allow popups to open print view.', 'error');
        return;
    }
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Person Profile 360 Audit</title>
  <style>
    body{font-family:Kanit,Arial,sans-serif;color:#0f172a;margin:28px}
    h1{font-size:22px;margin:0 0 4px}
    h2{font-size:15px;margin:22px 0 8px}
    table{border-collapse:collapse;width:100%;font-size:12px}
    th,td{border:1px solid #e2e8f0;padding:7px;text-align:left;vertical-align:top}
    th{background:#f8fafc}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .badge{display:inline-block;padding:4px 8px;border-radius:8px;background:#ecfdf5;color:#047857;font-weight:700}
    @media print{button{display:none}body{margin:14mm}}
  </style>
</head>
<body>
  <button onclick="window.print()" style="float:right;padding:8px 12px">Print</button>
  <h1>Person Profile 360 Audit</h1>
  <div>${escHtml(emp.EmployeeName || '-')} (${escHtml(emp.EmployeeID || '-')}) - ${escHtml(String(_year))}</div>
  <p><span class="badge">${escHtml(risk.status || _selectedProfile.overallStatus || '-')}</span> Score: ${escHtml(String(risk.score ?? _selectedProfile.complianceScore ?? '-'))}/100</p>
  <div class="grid">
    <section>
      <h2>Profile Snapshot</h2>
      <table>${rows.map(([k, v]) => `<tr><th>${escHtml(k)}</th><td>${escHtml(String(v ?? ''))}</td></tr>`).join('')}</table>
    </section>
    <section>
      <h2>Reasons / Next Actions</h2>
      <table>
        <tr><th>Reasons</th></tr>
        ${(risk.reasons || []).map(item => `<tr><td>${escHtml(item)}</td></tr>`).join('') || '<tr><td>-</td></tr>'}
      </table>
      <br>
      <table>
        <tr><th>Next Actions</th></tr>
        ${(risk.nextActions || []).map(item => `<tr><td>${escHtml(item)}</td></tr>`).join('') || '<tr><td>-</td></tr>'}
      </table>
    </section>
  </div>
  <h2>Factor Score</h2>
  <table>
    <tr><th>Factor</th><th>Score</th><th>Weight</th></tr>
    ${(risk.factors || []).map(f => `<tr><td>${escHtml(f.label || f.key || '')}</td><td>${escHtml(String(f.score ?? ''))}</td><td>${escHtml(String(f.weight ?? ''))}</td></tr>`).join('')}
  </table>
  <h2>Timeline</h2>
  <table>
    <tr><th>Date</th><th>Module</th><th>Type</th><th>Title</th><th>Status</th><th>Detail</th></tr>
    ${(_selectedProfile.timeline || []).map(item => `<tr><td>${escHtml(formatDate(item.date))}</td><td>${escHtml(item.module || '')}</td><td>${escHtml(item.type || '')}</td><td>${escHtml(item.title || '')}</td><td>${escHtml(item.status || '')}</td><td>${escHtml(item.detail || '')}</td></tr>`).join('')}
  </table>
</body>
</html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
}

async function deletePatrolRecord(id) {
    if (!_isAdmin || !id || !_selectedEmployeeId) return;
    if (!confirm('ลบบันทึก Patrol รายการนี้?')) return;
    try {
        await API.delete(`/patrol/admin-record/${id}`);
        showToast('ลบบันทึก Patrol แล้ว', 'success');
        await loadProfile(_selectedEmployeeId);
    } catch (err) {
        showError(err);
    }
}
