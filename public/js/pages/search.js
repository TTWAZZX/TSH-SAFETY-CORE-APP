// public/js/pages/search.js
// Employee Safety 360

import { API } from '../api.js';
import { closeModal, escHtml, openModal, showError, showToast } from '../ui.js';

let _searchReady = false;
let _currentUser = {};
let _isAdmin = false;
let _selectedEmployeeId = '';
let _selectedProfile = null;
let _year = new Date().getFullYear();
let _areas = [];

const moduleMeta = {
    patrol: ['Safety Patrol', '#059669'],
    training: ['Training', '#0284c7'],
    cccf: ['CCCF', '#7c3aed'],
    hiyari: ['Hiyari', '#f97316'],
    ky: ['KY', '#0d9488'],
    yokoten: ['Yokoten', '#2563eb'],
    accident: ['Accident', '#dc2626'],
    fourm: ['4M Change', '#6366f1'],
    policy: ['Policy', '#475569'],
    ppe: ['PPE', '#b45309'],
};

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
                    <h1 class="text-2xl font-bold text-white">ค้นหารายบุคคล</h1>
                    <p class="text-sm mt-1 max-w-2xl" style="color:rgba(209,250,229,0.82)">ดูประวัติ Safety รายคนแบบรวมศูนย์ และบันทึก Patrol เข้าระบบ Safety Patrol เดิมสำหรับ admin</p>
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
                <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                    <label class="text-xs font-bold text-slate-400 uppercase tracking-wider">Search</label>
                    <div class="relative mt-2">
                        <input id="people-search-input" class="form-input w-full pl-10" placeholder="ชื่อ / รหัส / แผนก / ตำแหน่ง">
                        <svg class="w-4 h-4 absolute left-3 top-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z"/>
                        </svg>
                    </div>
                    <div class="grid grid-cols-[1fr_96px] gap-2 mt-3">
                        <select id="people-dept-filter" class="form-input text-sm"><option value="all">ทุกแผนก</option></select>
                        <select id="people-year" class="form-input text-sm">
                            ${Array.from({ length: 5 }, (_, i) => {
                                const y = new Date().getFullYear() - i;
                                return `<option value="${y}" ${y === _year ? 'selected' : ''}>${y}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>

                <div id="people-results" class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"></div>
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
        const del = e.target.closest('[data-delete-patrol]');
        if (del) await deletePatrolRecord(del.dataset.deletePatrol);
    });
}

async function loadDepartments() {
    const sel = document.getElementById('people-dept-filter');
    if (!sel) return;
    const res = await API.get('/master/departments').catch(() => ({ data: [] }));
    const depts = (res?.data || []).map(d => d.Name || d.name || d).filter(Boolean);
    sel.innerHTML = `<option value="all">ทุกแผนก</option>${depts.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('')}`;
}

async function runSearch(q = '') {
    const wrap = document.getElementById('people-results');
    if (!wrap) return;
    const dept = document.getElementById('people-dept-filter')?.value || 'all';
    wrap.innerHTML = `<div class="p-5 text-sm text-slate-400">กำลังค้นหา...</div>`;
    try {
        const res = await API.get(`/person-search/employees?q=${encodeURIComponent(q)}&department=${encodeURIComponent(dept)}&limit=30`);
        const rows = res?.data || [];
        wrap.innerHTML = `
            <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p class="text-sm font-bold text-slate-700">ผลการค้นหา</p>
                <span class="text-xs text-slate-400">${rows.length} คน</span>
            </div>
            <div class="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
                ${rows.map(personRow).join('') || `<div class="p-5 text-sm text-slate-400">ไม่พบข้อมูล</div>`}
            </div>`;
    } catch (err) {
        wrap.innerHTML = `<div class="p-5 text-sm text-red-500">ค้นหาไม่สำเร็จ</div>`;
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
        wrap.innerHTML = `<div class="bg-white rounded-xl border border-red-100 p-8 text-center text-red-500">โหลดโปรไฟล์ไม่สำเร็จ</div>`;
        console.error(err);
    }
}

function profileLoading() {
    return `<div class="bg-white rounded-xl border border-slate-100 p-8 text-center text-slate-400">
        <div class="animate-spin rounded-full h-9 w-9 border-4 border-emerald-500 border-t-transparent mx-auto mb-3"></div>
        กำลังโหลด Safety 360...
    </div>`;
}

function renderProfile(data) {
    const emp = data.employee || {};
    const m = data.metrics || {};
    const score = data.complianceScore;
    const scoreColor = score == null ? '#64748b' : score >= 80 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626';
    return `
    <div class="space-y-5">
        <section class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
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
                    ${_isAdmin ? `<button id="btn-add-person-patrol" class="btn btn-primary px-4 py-2 text-sm">บันทึก Patrol</button>` : ''}
                    <a href="#patrol" class="btn btn-secondary px-4 py-2 text-sm">ไปหน้า Patrol</a>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-slate-100">
                ${kpiBox(score == null ? '-' : score + '%', 'Safety Compliance', scoreColor)}
                ${kpiBox(m.patrol, 'Patrol Records', '#059669')}
                ${kpiBox(`${m.trainingPassed}/${m.training}`, 'Training Passed', '#0284c7')}
                ${kpiBox(m.accidents, 'Accidents', m.accidents > 0 ? '#dc2626' : '#059669')}
            </div>
        </section>

        <section class="grid grid-cols-2 md:grid-cols-5 gap-3">
            ${moduleCard('patrol', m.patrol, `${m.patrolIssues} issues`)}
            ${moduleCard('cccf', m.cccfWorker + m.cccfPermanent, 'Worker / Permanent')}
            ${moduleCard('hiyari', m.hiyari, 'Near-miss')}
            ${moduleCard('ky', m.ky, 'KY Activity')}
            ${moduleCard('yokoten', m.yokoten, 'Responses')}
            ${moduleCard('fourm', m.fourmOwner + m.fourmCreated, 'Owner / Created')}
            ${moduleCard('policy', m.policyAck, 'Acknowledgements')}
            ${moduleCard('ppe', m.ppeViolations, 'PPE violations')}
            ${moduleCard('training', m.training, 'Training records')}
            ${moduleCard('accident', m.accidents, 'Reports')}
        </section>

        <section class="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 class="font-bold text-slate-800">ประวัติ Patrol</h3>
                    <span class="text-xs text-slate-400">${_year}</span>
                </div>
                <div class="divide-y divide-slate-100">${renderPatrolRows(data.patrolRecords || [])}</div>
            </div>
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="px-5 py-4 border-b border-slate-100"><h3 class="font-bold text-slate-800">Safety Timeline</h3></div>
                <div class="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">${renderTimeline(data.timeline || [])}</div>
            </div>
        </section>
    </div>`;
}

function kpiBox(value, label, color) {
    return `<div class="p-5 border-r border-slate-100 last:border-r-0">
        <p class="text-2xl font-extrabold" style="color:${color}">${escHtml(String(value ?? '-'))}</p>
        <p class="text-xs text-slate-500 mt-1">${escHtml(label)}</p>
    </div>`;
}

function moduleCard(key, value, sub) {
    const [label, color] = moduleMeta[key] || [key, '#64748b'];
    return `<div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <p class="text-[11px] font-bold text-slate-400 uppercase truncate">${escHtml(label)}</p>
        <p class="text-2xl font-extrabold mt-1" style="color:${color}">${escHtml(String(value ?? 0))}</p>
        <p class="text-xs text-slate-500 truncate">${escHtml(sub || '')}</p>
    </div>`;
}

function renderPatrolRows(rows) {
    if (!rows.length) return `<div class="p-5 text-sm text-slate-400">ยังไม่มีบันทึก Patrol ในปีนี้</div>`;
    return rows.map(r => `
    <div class="px-5 py-3 flex items-start justify-between gap-3">
        <div>
            <p class="font-semibold text-slate-700">${formatDate(r.PatrolDate)} · ${escHtml(r.Area || '-')}</p>
            <p class="text-xs text-slate-500">${escHtml(r.PatrolType || 'normal')} ${r.Notes ? '· ' + escHtml(r.Notes) : ''}</p>
        </div>
        ${_isAdmin ? `<button data-delete-patrol="${r.id}" class="text-xs text-red-500 hover:underline flex-shrink-0">ลบ</button>` : ''}
    </div>`).join('');
}

function renderTimeline(items) {
    if (!items.length) return `<div class="p-5 text-sm text-slate-400">ยังไม่มี activity timeline ในปีนี้</div>`;
    return items.map(i => `
    <div class="px-5 py-3 flex gap-3">
        <div class="w-2 h-2 rounded-full mt-2 flex-shrink-0" style="background:${typeColor(i.type)}"></div>
        <div class="min-w-0">
            <p class="text-sm font-semibold text-slate-700 truncate">${escHtml(i.title || i.type)}</p>
            <p class="text-xs text-slate-400">${formatDate(i.date)} · ${escHtml(i.type)} ${i.status ? '· ' + escHtml(i.status) : ''}</p>
        </div>
    </div>`).join('');
}

function typeColor(type) {
    const t = String(type || '').toLowerCase();
    if (t.includes('accident')) return '#dc2626';
    if (t.includes('training')) return '#0284c7';
    if (t.includes('patrol')) return '#059669';
    if (t.includes('4m')) return '#6366f1';
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
