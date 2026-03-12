// public/js/pages/training.js
import { API, apiFetch } from '../api.js';
import * as UI from '../ui.js';

// ─── State ────────────────────────────────────────────────────────────────────
let _summary    = null;
let _courses    = [];
let _records    = [];
let _isAdmin    = false;
let _activeTab  = 'dashboard';
let _year       = new Date().getFullYear();
let _recFilter  = { courseId: '', dept: '', year: new Date().getFullYear() };

// ─── Entry Point ──────────────────────────────────────────────────────────────
export async function loadTrainingPage() {
    const container = document.getElementById('training-page');
    if (!container) return;

    const user = TSHSession.getUser();
    _isAdmin = user?.role === 'Admin' || user?.Role === 'Admin';

    container.innerHTML = _spinnerHtml();
    await Promise.all([_fetchSummary(), _fetchCourses()]);
    _renderPage(container);
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function _fetchSummary() {
    try {
        const res = await API.get(`/training/summary?year=${_year}`);
        _summary = res.data || null;
    } catch { _summary = null; }
}

async function _fetchCourses() {
    try {
        const res = await API.get('/training/courses');
        _courses = res.data || [];
    } catch { _courses = []; }
}

async function _fetchRecords() {
    try {
        const params = new URLSearchParams();
        if (_recFilter.courseId) params.set('courseId', _recFilter.courseId);
        if (_recFilter.dept)     params.set('department', _recFilter.dept);
        if (_recFilter.year)     params.set('year', _recFilter.year);
        const res = await API.get(`/training/records?${params}`);
        _records = res.data || [];
    } catch { _records = []; }
}

// ─── Render Page ──────────────────────────────────────────────────────────────
function _renderPage(container) {
    const overall = _summary?.overall || {};
    const total   = parseInt(overall.total)         || 0;
    const passed  = parseInt(overall.passed)        || 0;
    const failed  = total - passed;
    const pct     = total ? Math.round(passed * 100 / total) : 0;
    const trainees = parseInt(overall.uniqueTrainees) || 0;

    const years = [];
    const curYear = new Date().getFullYear();
    for (let y = curYear; y >= curYear - 4; y--) years.push(y);

    container.innerHTML = `
    <div class="max-w-5xl mx-auto space-y-6 animate-fade-in pb-10">

        <!-- Page Header -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
                    <span class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 10px rgba(5,150,105,0.3)">
                        <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                        </svg>
                    </span>
                    Safety Training
                </h1>
                <p class="text-sm text-slate-500 mt-1 ml-11">บันทึกและติดตามผลการอบรมความปลอดภัย</p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
                <!-- Year Filter -->
                <select id="tr-year-filter" onchange="window._trSetYear()"
                    class="form-input text-sm py-1.5 px-3">
                    ${years.map(y => `<option value="${y}" ${y === _year ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
                ${_isAdmin ? `
                <button onclick="window._trOpenRecordForm()" class="btn btn-primary flex items-center gap-2 text-sm px-4 py-2">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                    บันทึกผลอบรม
                </button>
                <button onclick="window._trOpenCourseForm()" class="btn btn-secondary flex items-center gap-2 text-sm px-4 py-2">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    </svg>
                    จัดการหลักสูตร
                </button>` : ''}
            </div>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-slate-200 gap-1">
            ${[
                { key: 'dashboard', label: 'ภาพรวม', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
                { key: 'records',   label: 'รายละเอียด', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            ].map(t => `
                <button onclick="window._trSetTab('${t.key}')"
                    class="tr-tab-btn flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${_activeTab === t.key
                        ? 'border-emerald-500 text-emerald-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'}"
                    data-tab="${t.key}">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${t.icon}"/>
                    </svg>
                    ${t.label}
                </button>`).join('')}
        </div>

        <!-- Tab Panels -->
        <div id="tr-panel-dashboard" class="${_activeTab === 'dashboard' ? '' : 'hidden'}">
            ${_renderDashboard()}
        </div>
        <div id="tr-panel-records" class="${_activeTab === 'records' ? '' : 'hidden'}">
            ${_renderRecordsPanel()}
        </div>

    </div>`;

    if (_activeTab === 'records') {
        _loadAndRenderRecords();
    }
}

// ─── Dashboard Panel ──────────────────────────────────────────────────────────
function _renderDashboard() {
    const overall  = _summary?.overall  || {};
    const byCourse = _summary?.byCourse || [];
    const byDept   = _summary?.byDept   || [];

    const total   = parseInt(overall.total)          || 0;
    const passed  = parseInt(overall.passed)         || 0;
    const failed  = total - passed;
    const pct     = total ? Math.round(passed * 100 / total) : 0;
    const trainees = parseInt(overall.uniqueTrainees) || 0;
    const courses  = parseInt(overall.coursesUsed)   || 0;

    return `
    <div class="space-y-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="card p-5">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                    </div>
                    <p class="text-xs text-slate-500 font-medium leading-tight">ผู้เข้าอบรม<br>(unique)</p>
                </div>
                <p class="text-3xl font-bold text-slate-800">${trainees}</p>
                <p class="text-xs text-slate-400 mt-1">รวม ${total} รายการ · ${courses} หลักสูตร</p>
            </div>
            <div class="card p-5 border-emerald-200">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <p class="text-xs text-emerald-600 font-medium">ผ่านการอบรม</p>
                </div>
                <p class="text-3xl font-bold text-emerald-600">${passed}</p>
                <p class="text-xs text-slate-400 mt-1">รายการ</p>
            </div>
            <div class="card p-5 border-red-200">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <p class="text-xs text-red-500 font-medium">ไม่ผ่าน / ยังไม่มีคะแนน</p>
                </div>
                <p class="text-3xl font-bold text-red-500">${failed}</p>
                <p class="text-xs text-slate-400 mt-1">รายการ</p>
            </div>
            <div class="card p-5 border-blue-200">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                        </svg>
                    </div>
                    <p class="text-xs text-blue-500 font-medium">Pass Rate</p>
                </div>
                <p class="text-3xl font-bold text-blue-600">${pct}%</p>
                <div class="mt-2 w-full bg-slate-100 rounded-full h-1.5">
                    <div class="h-1.5 rounded-full transition-all" style="width:${pct}%; background:linear-gradient(90deg,#059669,#0d9488)"></div>
                </div>
            </div>
        </div>

        <!-- By Course + By Dept side by side -->
        <div class="grid lg:grid-cols-2 gap-6">

            <!-- สรุปรายหลักสูตร -->
            <div class="card overflow-hidden">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">สรุปผลรายหลักสูตร</h3>
                    </div>
                    ${byCourse.length === 0
                        ? `<p class="text-center text-slate-400 text-sm py-8">ยังไม่มีข้อมูล</p>`
                        : `<div class="space-y-3">
                            ${byCourse.map(c => {
                                const t = parseInt(c.total) || 0;
                                const p = parseInt(c.passed) || 0;
                                const pctC = t ? Math.round(p * 100 / t) : 0;
                                const active = c.IsActive;
                                return `
                                <div class="group">
                                    <div class="flex items-center justify-between mb-1 gap-2">
                                        <div class="flex items-center gap-2 min-w-0">
                                            ${active
                                                ? `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"></span>`
                                                : `<span class="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0"></span>`}
                                            <span class="text-sm font-medium text-slate-700 truncate" title="${c.CourseName}">${c.CourseName}</span>
                                            ${c.CourseCode ? `<span class="text-xs text-slate-400 flex-shrink-0">(${c.CourseCode})</span>` : ''}
                                        </div>
                                        <span class="text-xs text-slate-500 flex-shrink-0">${p}/${t} · <span class="font-semibold text-slate-700">${pctC}%</span></span>
                                    </div>
                                    <div class="w-full bg-slate-100 rounded-full h-1.5">
                                        <div class="h-1.5 rounded-full transition-all" style="width:${pctC}%;background:${pctC>=70?'linear-gradient(90deg,#059669,#0d9488)':'linear-gradient(90deg,#f59e0b,#d97706)'}"></div>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>`}
                </div>
            </div>

            <!-- สรุปรายแผนก -->
            <div class="card overflow-hidden">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#3b82f6,#6366f1)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">สรุปผู้เข้าอบรมรายแผนก</h3>
                    </div>
                    ${byDept.length === 0
                        ? `<p class="text-center text-slate-400 text-sm py-8">ยังไม่มีข้อมูล</p>`
                        : `<div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr class="border-b border-slate-100">
                                        <th class="py-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                                        <th class="py-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">รายการ</th>
                                        <th class="py-2 px-2 text-xs font-semibold text-emerald-500 uppercase tracking-wide text-center">ผ่าน</th>
                                        <th class="py-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">คน</th>
                                        <th class="py-2 pl-2 text-xs font-semibold text-blue-500 uppercase tracking-wide text-center">%ผ่าน</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-50">
                                    ${byDept.map(d => {
                                        const t = parseInt(d.total) || 0;
                                        const p = parseInt(d.passed) || 0;
                                        const pctD = t ? Math.round(p * 100 / t) : 0;
                                        return `
                                        <tr class="hover:bg-slate-50 transition-colors">
                                            <td class="py-2 pr-3 font-medium text-slate-700 max-w-[120px] truncate">${d.Department || '—'}</td>
                                            <td class="py-2 px-2 text-center text-slate-500">${t}</td>
                                            <td class="py-2 px-2 text-center text-emerald-600 font-semibold">${p}</td>
                                            <td class="py-2 px-2 text-center text-slate-500">${d.uniqueTrainees || 0}</td>
                                            <td class="py-2 pl-2 text-center">
                                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold
                                                    ${pctD >= 80 ? 'bg-emerald-100 text-emerald-700' : pctD >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}">
                                                    ${pctD}%
                                                </span>
                                            </td>
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>`}
                </div>
            </div>
        </div>

        ${_isAdmin ? `
        <!-- Course Management Quick-List -->
        <div class="card overflow-hidden">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#8b5cf6,#6366f1)"></div>
            <div class="p-5">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">หลักสูตรทั้งหมด</h3>
                    </div>
                    <button onclick="window._trOpenCourseForm()" class="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        เพิ่มหลักสูตร
                    </button>
                </div>
                ${_courses.length === 0
                    ? `<p class="text-center text-slate-400 text-sm py-6">ยังไม่มีหลักสูตร</p>`
                    : `<div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr class="bg-slate-50 border-b-2 border-slate-200">
                                    <th class="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">รหัส</th>
                                    <th class="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">ชื่อหลักสูตร</th>
                                    <th class="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">ชั่วโมง</th>
                                    <th class="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">เกณฑ์ผ่าน</th>
                                    <th class="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">สถานะ</th>
                                    <th class="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${_courses.map(c => `
                                <tr class="hover:bg-slate-50 transition-colors">
                                    <td class="px-3 py-2.5 text-xs font-mono text-slate-500">${c.CourseCode || '—'}</td>
                                    <td class="px-3 py-2.5 font-medium text-slate-800">${c.CourseName}</td>
                                    <td class="px-3 py-2.5 text-center text-slate-500">${c.DurationHours || 0} ชม.</td>
                                    <td class="px-3 py-2.5 text-center text-slate-500">${c.PassScore || 70}%</td>
                                    <td class="px-3 py-2.5 text-center">
                                        ${c.IsActive
                                            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span> Active</span>`
                                            : `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">Inactive</span>`}
                                    </td>
                                    <td class="px-3 py-2.5">
                                        <div class="flex items-center gap-1">
                                            <button onclick="window._trOpenCourseForm(${c.id})"
                                                class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="แก้ไข">
                                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                                            </button>
                                            <button onclick="window._trDeleteCourse(${c.id}, '${_esc(c.CourseName)}')"
                                                class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="ลบ">
                                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>`}
            </div>
        </div>` : ''}
    </div>`;
}

// ─── Records Panel ────────────────────────────────────────────────────────────
function _renderRecordsPanel() {
    const years = [];
    const curYear = new Date().getFullYear();
    for (let y = curYear; y >= curYear - 4; y--) years.push(y);

    // Get unique departments from records
    const depts = [...new Set(_records.map(r => r.Department).filter(Boolean))].sort();

    return `
    <div class="space-y-4">
        <!-- Filter Bar -->
        <div class="card p-4 flex flex-wrap gap-3 items-center">
            <select id="tr-rec-course" class="form-input text-sm"
                    onchange="window._trRecFilter()">
                <option value="">ทุกหลักสูตร</option>
                ${_courses.map(c => `<option value="${c.id}" ${_recFilter.courseId==c.id?'selected':''}>${c.CourseName}</option>`).join('')}
            </select>
            <select id="tr-rec-dept" class="form-input text-sm"
                    onchange="window._trRecFilter()">
                <option value="">ทุกแผนก</option>
                ${depts.map(d => `<option value="${d}" ${_recFilter.dept===d?'selected':''}>${d}</option>`).join('')}
            </select>
            <select id="tr-rec-year" class="form-input text-sm"
                    onchange="window._trRecFilter()">
                ${years.map(y => `<option value="${y}" ${_recFilter.year==y?'selected':''}>${y}</option>`).join('')}
            </select>
            <span id="tr-rec-count" class="text-xs text-slate-400 ml-auto"></span>
        </div>

        <!-- Table -->
        <div class="card overflow-hidden">
            <div id="tr-records-table" class="overflow-x-auto">
                <div class="flex flex-col items-center justify-center py-16 text-slate-400">
                    <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-400 border-t-transparent mb-3"></div>
                    <p class="text-sm">กำลังโหลดข้อมูล...</p>
                </div>
            </div>
        </div>
    </div>`;
}

function _renderRecordsTable() {
    if (_records.length === 0) {
        return `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg class="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <p class="font-medium">ไม่พบข้อมูลการอบรม</p>
        </div>`;
    }

    const rows = _records.map(r => {
        const dateStr = r.TrainingDate
            ? new Date(r.TrainingDate).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
            : '—';
        const passed = r.IsPassed ?
            `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>ผ่าน</span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-500"><span class="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"></span>ไม่ผ่าน</span>`;
        const adminBtns = _isAdmin ? `
            <button onclick="window._trOpenRecordForm(${JSON.stringify(r).replace(/'/g,"\\'")})"
                class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="แก้ไข">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
            <button onclick="window._trDeleteRecord(${r.id})"
                class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="ลบ">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>` : '';

        return `<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-500">${dateStr}</td>
            <td class="px-4 py-3 min-w-[130px]">
                <p class="text-sm font-semibold text-slate-800">${r.EmployeeID}</p>
                <p class="text-xs text-slate-400">${r.EmployeeName || '—'}</p>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">${r.Department || '—'}</td>
            <td class="px-4 py-3 min-w-[160px]">
                <p class="text-sm font-medium text-slate-700">${r.CourseName}</p>
                ${r.CourseCode ? `<p class="text-xs text-slate-400">${r.CourseCode}</p>` : ''}
            </td>
            <td class="px-4 py-3 text-center text-sm text-slate-600">
                ${r.Score !== null && r.Score !== undefined ? `${r.Score}% <span class="text-xs text-slate-400">(เกณฑ์ ${r.PassScore}%)</span>` : '<span class="text-slate-300">—</span>'}
            </td>
            <td class="px-4 py-3 text-center">${passed}</td>
            <td class="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">${r.Trainer || '—'}</td>
            ${_isAdmin ? `<td class="px-4 py-3"><div class="flex items-center gap-1">${adminBtns}</div></td>` : ''}
        </tr>`;
    }).join('');

    return `<table class="w-full text-left border-collapse">
        <thead>
            <tr class="bg-slate-50 border-b-2 border-slate-200">
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">วันที่อบรม</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">รหัส / ชื่อพนักงาน</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">หลักสูตร</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">คะแนน</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">ผล</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">วิทยากร</th>
                ${_isAdmin ? `<th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">จัดการ</th>` : ''}
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

async function _loadAndRenderRecords() {
    await _fetchRecords();
    const wrap = document.getElementById('tr-records-table');
    if (wrap) wrap.innerHTML = _renderRecordsTable();
    const countEl = document.getElementById('tr-rec-count');
    if (countEl) countEl.textContent = `${_records.length} รายการ`;
}

// ─── Tab & Filter Handlers ─────────────────────────────────────────────────────
window._trSetTab = async function(tab) {
    _activeTab = tab;
    document.querySelectorAll('.tr-tab-btn').forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.className = btn.className.replace(
            /border-emerald-500 text-emerald-600|border-transparent text-slate-500 hover:text-slate-700/g, ''
        ).trim() + (isActive
            ? ' border-emerald-500 text-emerald-600'
            : ' border-transparent text-slate-500 hover:text-slate-700');
    });
    document.querySelectorAll('[id^="tr-panel-"]').forEach(p => p.classList.add('hidden'));
    const panel = document.getElementById(`tr-panel-${tab}`);
    if (panel) panel.classList.remove('hidden');

    if (tab === 'records' && _records.length === 0) {
        await _loadAndRenderRecords();
    }
};

window._trSetYear = async function() {
    _year = parseInt(document.getElementById('tr-year-filter')?.value) || new Date().getFullYear();
    await _fetchSummary();
    const panel = document.getElementById('tr-panel-dashboard');
    if (panel) panel.innerHTML = _renderDashboard();
};

window._trRecFilter = async function() {
    _recFilter.courseId = document.getElementById('tr-rec-course')?.value || '';
    _recFilter.dept     = document.getElementById('tr-rec-dept')?.value   || '';
    _recFilter.year     = parseInt(document.getElementById('tr-rec-year')?.value) || new Date().getFullYear();
    await _loadAndRenderRecords();
};

// ─── Record Form ──────────────────────────────────────────────────────────────
window._trOpenRecordForm = function(record = null) {
    const r = (typeof record === 'string') ? JSON.parse(record) : record;
    const isEdit = r && r.id;
    const activeCourses = _courses.filter(c => c.IsActive || (r && c.id == r.CourseID));

    const html = `
    <form id="tr-rec-form" class="space-y-4">
        ${isEdit ? `<input type="hidden" name="id" value="${r.id}">` : ''}

        <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex gap-2 text-sm text-emerald-700">
            <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span>ต้องใช้รหัสพนักงานจาก Employee Master Data เท่านั้น · ระบบจะคำนวณผลผ่าน/ไม่ผ่านจากคะแนนและเกณฑ์หลักสูตรอัตโนมัติ</span>
        </div>

        <!-- Course -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">หลักสูตร <span class="text-red-500">*</span></label>
            <select name="CourseID" id="tr-rec-course-sel" required class="form-input w-full" onchange="window._trUpdatePassScore()">
                <option value="">— เลือกหลักสูตร —</option>
                ${activeCourses.map(c => `<option value="${c.id}" ${r?.CourseID==c.id?'selected':''}
                    data-pass="${c.PassScore}">${c.CourseName}${c.CourseCode ? ` (${c.CourseCode})` : ''}</option>`).join('')}
            </select>
        </div>

        <!-- Employee ID + Search -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รหัสพนักงาน <span class="text-red-500">*</span></label>
            <div class="relative">
                <input id="tr-emp-search" name="EmployeeID" required
                    value="${r?.EmployeeID || ''}"
                    placeholder="พิมพ์รหัสหรือชื่อพนักงาน..."
                    autocomplete="off"
                    class="form-input w-full"
                    oninput="window._trSearchEmp(this.value)">
                <div id="tr-emp-dropdown" class="hidden absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto"></div>
            </div>
            <div id="tr-emp-info" class="${r?.EmployeeID ? '' : 'hidden'} mt-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5 border border-emerald-100">
                ${r?.EmployeeName ? `<svg class="w-3.5 h-3.5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>${r.EmployeeName} · ${r.Department || ''}` : ''}
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <!-- Training Date -->
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่อบรม <span class="text-red-500">*</span></label>
                <input type="text" id="tr-rec-date" name="TrainingDate" required
                    value="${r?.TrainingDate ? new Date(r.TrainingDate).toISOString().split('T')[0] : ''}"
                    class="form-input w-full bg-white">
            </div>
            <!-- Score -->
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    คะแนน (%)
                    <span id="tr-pass-hint" class="text-xs font-normal text-slate-400 ml-1">
                        ${r?.CourseID ? `เกณฑ์ผ่าน ${activeCourses.find(c=>c.id==r.CourseID)?.PassScore||70}%` : ''}
                    </span>
                </label>
                <input type="number" name="Score" min="0" max="100" step="0.1"
                    value="${r?.Score ?? ''}"
                    placeholder="0–100 (เว้นว่างถ้าไม่มีการสอบ)"
                    class="form-input w-full">
            </div>
        </div>

        <!-- Trainer -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">วิทยากร / ผู้สอน</label>
            <input type="text" name="Trainer" value="${r?.Trainer || ''}"
                placeholder="ชื่อวิทยากร" class="form-input w-full">
        </div>

        <!-- Notes -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
            <textarea name="Notes" rows="2" class="form-textarea w-full resize-none"
                placeholder="หมายเหตุเพิ่มเติม">${r?.Notes || ''}</textarea>
        </div>

        <div id="tr-rec-error" class="text-sm text-red-500 hidden"></div>

        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window._UI_closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="tr-rec-submit" class="btn btn-primary px-5">บันทึกข้อมูล</button>
        </div>
    </form>`;

    UI.openModal(isEdit ? 'แก้ไขผลการอบรม' : 'บันทึกผลการอบรม', html, 'max-w-2xl');

    flatpickr('#tr-rec-date', { locale: 'th', dateFormat: 'Y-m-d', defaultDate: r?.TrainingDate || 'today' });

    document.getElementById('tr-rec-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd   = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        const btn  = document.getElementById('tr-rec-submit');
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>กำลังบันทึก...';

        try {
            if (data.id) {
                await apiFetch(`/training/records/${data.id}`, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                await API.post('/training/records', data);
            }
            UI.closeModal();
            UI.showToast('บันทึกผลการอบรมสำเร็จ', 'success');
            await Promise.all([_fetchSummary(), _fetchCourses(), _fetchRecords()]);
            _renderPage(document.getElementById('training-page'));
        } catch (err) {
            const el = document.getElementById('tr-rec-error');
            if (el) { el.textContent = err.message || 'เกิดข้อผิดพลาด'; el.classList.remove('hidden'); }
            btn.disabled = false;
            btn.textContent = 'บันทึกข้อมูล';
        }
    });
};

// update pass hint when course changes
window._trUpdatePassScore = function() {
    const sel  = document.getElementById('tr-rec-course-sel');
    const opt  = sel?.options[sel.selectedIndex];
    const hint = document.getElementById('tr-pass-hint');
    if (hint && opt) {
        hint.textContent = opt.dataset.pass ? `เกณฑ์ผ่าน ${opt.dataset.pass}%` : '';
    }
};

// Employee search autocomplete
let _empSearchTimer = null;
window._trSearchEmp = function(val) {
    clearTimeout(_empSearchTimer);
    const dd = document.getElementById('tr-emp-dropdown');
    if (!val || val.length < 1) { dd.classList.add('hidden'); return; }
    _empSearchTimer = setTimeout(async () => {
        try {
            const res = await API.get(`/training/employees?q=${encodeURIComponent(val)}`);
            const emps = res.data || [];
            if (emps.length === 0) {
                dd.innerHTML = `<div class="px-4 py-3 text-sm text-slate-400">ไม่พบพนักงาน</div>`;
            } else {
                dd.innerHTML = emps.map(e => `
                    <button type="button" onclick="window._trSelectEmp('${_esc(e.EmployeeID)}','${_esc(e.EmployeeName)}','${_esc(e.Department||'')}')"
                        class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-emerald-50 transition-colors">
                        <div class="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <span class="text-xs font-bold text-emerald-600">${(e.EmployeeName||'?').charAt(0)}</span>
                        </div>
                        <div>
                            <p class="text-sm font-semibold text-slate-800">${e.EmployeeID} · ${e.EmployeeName}</p>
                            <p class="text-xs text-slate-400">${e.Department || ''} ${e.Team ? '· '+e.Team : ''}</p>
                        </div>
                    </button>`).join('');
            }
            dd.classList.remove('hidden');
        } catch { dd.classList.add('hidden'); }
    }, 250);
};

window._trSelectEmp = function(id, name, dept) {
    const input   = document.getElementById('tr-emp-search');
    const info    = document.getElementById('tr-emp-info');
    const dd      = document.getElementById('tr-emp-dropdown');
    if (input) input.value = id;
    if (info)  { info.textContent = `${name} · ${dept}`; info.classList.remove('hidden'); }
    if (dd)    dd.classList.add('hidden');
};

// ─── Course Form ──────────────────────────────────────────────────────────────
window._trOpenCourseForm = function(id = null) {
    const c = id ? _courses.find(x => x.id === id) : null;
    const isEdit = !!c;

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

        <div id="tr-course-error" class="text-sm text-red-500 hidden"></div>

        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window._UI_closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="tr-course-submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`;

    UI.openModal(isEdit ? `แก้ไขหลักสูตร — ${c.CourseName}` : 'เพิ่มหลักสูตรใหม่', html, 'max-w-xl');

    document.getElementById('tr-course-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd   = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        if (isEdit) data.IsActive = fd.get('IsActive') === 'on' ? 1 : 0;
        const btn  = document.getElementById('tr-course-submit');
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>กำลังบันทึก...';

        try {
            if (data.id) {
                await apiFetch(`/training/courses/${data.id}`, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                await API.post('/training/courses', data);
            }
            UI.closeModal();
            UI.showToast(isEdit ? 'อัปเดตหลักสูตรสำเร็จ' : 'เพิ่มหลักสูตรสำเร็จ', 'success');
            await Promise.all([_fetchSummary(), _fetchCourses()]);
            _renderPage(document.getElementById('training-page'));
        } catch (err) {
            const el = document.getElementById('tr-course-error');
            if (el) { el.textContent = err.message || 'เกิดข้อผิดพลาด'; el.classList.remove('hidden'); }
            btn.disabled = false;
            btn.textContent = 'บันทึก';
        }
    });
};

// ─── Delete Handlers ──────────────────────────────────────────────────────────
window._trDeleteRecord = async function(id) {
    const confirmed = await UI.showConfirmationModal('ยืนยันการลบ', 'ต้องการลบข้อมูลการอบรมนี้ใช่หรือไม่?');
    if (!confirmed) return;
    try {
        await apiFetch(`/training/records/${id}`, { method: 'DELETE' });
        UI.showToast('ลบข้อมูลสำเร็จ', 'success');
        await Promise.all([_fetchSummary(), _fetchCourses(), _fetchRecords()]);
        _renderPage(document.getElementById('training-page'));
    } catch (err) {
        UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

window._trDeleteCourse = async function(id, name) {
    const confirmed = await UI.showConfirmationModal('ยืนยันการลบ', `ต้องการลบหลักสูตร "${name}" ใช่หรือไม่?`);
    if (!confirmed) return;
    try {
        await apiFetch(`/training/courses/${id}`, { method: 'DELETE' });
        UI.showToast('ลบหลักสูตรสำเร็จ', 'success');
        await Promise.all([_fetchSummary(), _fetchCourses()]);
        _renderPage(document.getElementById('training-page'));
    } catch (err) {
        UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
window._UI_closeModal = () => UI.closeModal();

function _spinnerHtml() {
    return `<div class="flex flex-col items-center justify-center h-64 text-slate-400">
        <div class="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-3"></div>
        <p class="text-sm">กำลังโหลดข้อมูล...</p>
    </div>`;
}

function _esc(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
