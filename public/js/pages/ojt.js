// public/js/pages/ojt.js
// OJT tracked per DEPARTMENT (not per employee)
import { API, apiFetch } from '../api.js';
import * as UI from '../ui.js';

// ─── State ────────────────────────────────────────────────────────────────────
let _records      = [];   // one record per department (merged with master)
let _standard     = null;
let _search       = '';
let _filterStatus = '';
let _isAdmin      = false;

// ─── Status Logic ─────────────────────────────────────────────────────────────
function _calcStatus(nextReviewDate) {
    if (!nextReviewDate) return 'no-data';
    const today  = new Date(); today.setHours(0,0,0,0);
    const review = new Date(nextReviewDate);
    const diff   = Math.ceil((review - today) / 86400000);
    if (diff < 0)   return 'overdue';
    if (diff <= 30) return 'due-soon';
    return 'valid';
}

const STATUS_META = {
    'valid':    { label: 'Valid',       bg: 'bg-emerald-100', text: 'text-emerald-700', icon: '✅', row: '' },
    'due-soon': { label: 'Due Soon',    bg: 'bg-amber-100',   text: 'text-amber-700',   icon: '⚠️', row: 'bg-amber-50/40' },
    'overdue':  { label: 'Overdue',     bg: 'bg-red-100',     text: 'text-red-600',     icon: '🔴', row: 'bg-red-50/40' },
    'no-data':  { label: 'ยังไม่มีข้อมูล', bg: 'bg-slate-100', text: 'text-slate-500', icon: '—',  row: '' },
};

// ─── Entry Point ──────────────────────────────────────────────────────────────
export async function loadOjtPage() {
    const container = document.getElementById('ojt-page');
    if (!container) return;

    const user = TSHSession.getUser();
    _isAdmin = user?.role === 'Admin' || user?.Role === 'Admin';

    container.innerHTML = `<div class="flex items-center justify-center h-64 text-slate-400">
        <div class="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent"></div>
    </div>`;

    await Promise.all([_fetchRecords(), _fetchStandard()]);
    _renderPage(container);
}

async function _fetchRecords() {
    try {
        const res = await API.get('/ojt/records');
        _records = res.data || [];
    } catch { _records = []; }
}

async function _fetchStandard() {
    try {
        const res = await API.get('/ojt/standard');
        _standard = res.data;
    } catch { _standard = null; }
}

// ─── Render Page ──────────────────────────────────────────────────────────────
function _renderPage(container) {
    const total   = _records.length;
    const valid   = _records.filter(r => _calcStatus(r.NextReviewDate) === 'valid').length;
    const dueSoon = _records.filter(r => _calcStatus(r.NextReviewDate) === 'due-soon').length;
    const overdue = _records.filter(r => _calcStatus(r.NextReviewDate) === 'overdue').length;
    const noData  = _records.filter(r => _calcStatus(r.NextReviewDate) === 'no-data').length;
    const pct     = (total - noData) ? Math.round(valid * 100 / (total - noData)) : 0;

    container.innerHTML = `
    <div class="space-y-5">

        <!-- Header -->
        <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h2 class="text-xl font-bold text-slate-800">Stop · Call · Wait</h2>
                <p class="text-sm text-slate-500 mt-0.5">มาตรฐานความปลอดภัยและสถานะการอบรม OJT รายแผนก</p>
            </div>
            ${_isAdmin ? `
            <div class="flex gap-2">
                <button onclick="window._ojtEditStandard()"
                    class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    แก้ไขมาตรฐาน SCW
                </button>
            </div>` : ''}
        </div>

        <!-- SCW Standard Panel -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button onclick="window._ojtToggleStandard()" id="scw-toggle-btn"
                class="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style="background:linear-gradient(135deg,#dc2626,#ea580c)">
                        <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </div>
                    <div>
                        <p class="font-bold text-slate-800">มาตรฐาน Stop · Call · Wait</p>
                        <p class="text-xs text-slate-400">คลิกเพื่อดู/ซ่อนรายละเอียด</p>
                    </div>
                </div>
                <svg id="scw-chevron" class="w-5 h-5 text-slate-400 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
            </button>
            <div id="scw-panel" class="hidden border-t border-slate-200">
                <div class="p-5 grid md:grid-cols-3 gap-4">
                    ${_renderSCWCards()}
                </div>
                ${_standard?.UpdatedAt
                    ? `<p class="px-5 pb-3 text-xs text-slate-400">อัปเดตโดย ${_standard.UpdatedBy || '—'} เมื่อ ${new Date(_standard.UpdatedAt).toLocaleDateString('th-TH')}</p>`
                    : ''}
            </div>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <p class="text-xs text-slate-500 font-medium">แผนกทั้งหมด</p>
                <p class="text-3xl font-bold text-slate-800 mt-1">${total}</p>
            </div>
            <div class="bg-white rounded-xl p-4 border border-emerald-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onclick="window._ojtSetFilter('valid')">
                <p class="text-xs text-emerald-600 font-medium">✅ Valid</p>
                <p class="text-3xl font-bold text-emerald-600 mt-1">${valid}</p>
            </div>
            <div class="bg-white rounded-xl p-4 border border-amber-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onclick="window._ojtSetFilter('due-soon')">
                <p class="text-xs text-amber-600 font-medium">⚠️ Due Soon</p>
                <p class="text-3xl font-bold text-amber-600 mt-1">${dueSoon}</p>
                <p class="text-xs text-slate-400">≤ 30 วัน</p>
            </div>
            <div class="bg-white rounded-xl p-4 border border-red-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onclick="window._ojtSetFilter('overdue')">
                <p class="text-xs text-red-600 font-medium">🔴 Overdue</p>
                <p class="text-3xl font-bold text-red-600 mt-1">${overdue}</p>
            </div>
            <div class="bg-white rounded-xl p-4 border border-blue-200 shadow-sm">
                <p class="text-xs text-blue-600 font-medium">Compliance</p>
                <p class="text-3xl font-bold text-blue-600 mt-1">${pct}%</p>
                <div class="mt-2 w-full bg-slate-100 rounded-full h-1.5">
                    <div class="h-1.5 rounded-full" style="width:${pct}%; background:linear-gradient(90deg,#10b981,#059669)"></div>
                </div>
                <p class="text-xs text-slate-400 mt-1">จาก ${total - noData} แผนกที่มีข้อมูล</p>
            </div>
        </div>

        <!-- Filters -->
        <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3 items-center">
            <div class="relative flex-1 min-w-[180px]">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                <input id="ojt-search" type="text" placeholder="ค้นหาชื่อแผนก..."
                    value="${_search}"
                    class="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    oninput="window._ojtFilter()">
            </div>
            <select id="ojt-status" class="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._ojtFilter()">
                <option value="">ทุกสถานะ</option>
                <option value="valid"    ${_filterStatus==='valid'?'selected':''}>✅ Valid</option>
                <option value="due-soon" ${_filterStatus==='due-soon'?'selected':''}>⚠️ Due Soon</option>
                <option value="overdue"  ${_filterStatus==='overdue'?'selected':''}>🔴 Overdue</option>
                <option value="no-data"  ${_filterStatus==='no-data'?'selected':''}>— ยังไม่มีข้อมูล</option>
            </select>
            ${_filterStatus || _search ? `
            <button onclick="window._ojtClearFilter()" class="text-xs text-slate-500 underline hover:text-slate-700">ล้างตัวกรอง</button>` : ''}
            <span id="ojt-count" class="text-xs text-slate-400 ml-auto"></span>
        </div>

        <!-- Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div id="ojt-table-wrap" class="overflow-x-auto">
                ${_renderTable()}
            </div>
        </div>

    </div>`;

    _updateCount();
}

// ─── SCW Cards ────────────────────────────────────────────────────────────────
function _renderSCWCards() {
    const defaults = [
        { icon: '🛑', color: 'red',   title: 'STOP — หยุด', text: 'หยุดการทำงานทันทีเมื่อพบสิ่งผิดปกติหรือไม่แน่ใจในความปลอดภัย อย่าฝืนทำงานต่อ' },
        { icon: '📞', color: 'amber', title: 'CALL — โทร',  text: 'แจ้งหัวหน้างานหรือผู้รับผิดชอบทันที อธิบายปัญหาที่พบให้ชัดเจน' },
        { icon: '⏳', color: 'blue',  title: 'WAIT — รอ',   text: 'รอการตอบสนองจากผู้รับผิดชอบ ห้ามเริ่มงานต่อจนกว่าจะได้รับอนุญาต' },
    ];
    const items = (_standard?.Content?.trim()) ? _parseStandardContent(_standard.Content) : defaults;

    return items.map((item, i) => {
        const c = item.color || ['red','amber','blue'][i] || 'slate';
        return `
        <div class="rounded-xl p-5 border border-${c}-200 bg-${c}-50">
            <div class="flex items-center gap-3 mb-3">
                <span class="text-2xl">${item.icon || ['🛑','📞','⏳'][i]}</span>
                <h3 class="font-bold text-${c}-700">${item.title}</h3>
            </div>
            <p class="text-sm text-slate-700 leading-relaxed">${item.text}</p>
        </div>`;
    }).join('');
}

function _parseStandardContent(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    const icons  = ['🛑','📞','⏳'];
    const colors = ['red','amber','blue'];
    const result = [];
    let idx = 0;
    div.querySelectorAll('h3').forEach(h3 => {
        const p = h3.nextElementSibling;
        result.push({ icon: icons[idx]||'📋', color: colors[idx]||'slate', title: h3.textContent, text: p?.textContent || '' });
        idx++;
    });
    if (result.length === 0) {
        result.push({ icon: '📋', color: 'slate', title: 'มาตรฐาน SCW', text: div.textContent });
    }
    return result;
}

window._ojtToggleStandard = function() {
    document.getElementById('scw-panel')?.classList.toggle('hidden');
    document.getElementById('scw-chevron')?.classList.toggle('rotate-180');
};

// ─── Table ────────────────────────────────────────────────────────────────────
function _renderTable() {
    const filtered = _getFiltered();

    if (filtered.length === 0) {
        return `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
            <p class="font-medium">ไม่พบข้อมูล</p>
        </div>`;
    }

    const today = new Date(); today.setHours(0,0,0,0);

    const rows = filtered.map(r => {
        const status = _calcStatus(r.NextReviewDate);
        const meta   = STATUS_META[status];

        const ojtDate    = r.OJTDate    ? new Date(r.OJTDate).toLocaleDateString('th-TH', {day:'2-digit',month:'short',year:'2-digit'}) : '—';
        const reviewDate = r.NextReviewDate ? new Date(r.NextReviewDate).toLocaleDateString('th-TH', {day:'2-digit',month:'short',year:'2-digit'}) : '—';

        let daysLabel = '';
        if (r.NextReviewDate) {
            const diff = Math.ceil((new Date(r.NextReviewDate) - today) / 86400000);
            daysLabel  = diff < 0
                ? `<span class="text-xs text-red-500">เกิน ${Math.abs(diff)} วัน</span>`
                : `<span class="text-xs text-slate-400">เหลือ ${diff} วัน</span>`;
        }

        const editBtn = _isAdmin ? `
            <button onclick="window._ojtOpenEdit('${_esc(r.Department)}', ${r.id ? JSON.stringify(r).replace(/'/g,"\\'") : 'null'})"
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors
                ${r.id ? 'border-blue-200 text-blue-600 hover:bg-blue-50' : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50'}">
                ${r.id
                    ? `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> อัปเดต OJT`
                    : `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg> บันทึก OJT`}
            </button>
            ${r.id ? `<button onclick="window._ojtDelete(${r.id}, '${_esc(r.Department)}')"
                class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="ล้างข้อมูล OJT">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>` : ''}` : '';

        return `<tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors ${meta.row}">
            <td class="px-4 py-3">
                <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <span class="w-2 h-2 rounded-full flex-shrink-0 ${status === 'valid' ? 'bg-emerald-400' : status === 'due-soon' ? 'bg-amber-400' : status === 'overdue' ? 'bg-red-400' : 'bg-slate-300'}"></span>
                    ${r.Department}
                </span>
            </td>
            <td class="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">${ojtDate}</td>
            <td class="px-4 py-3 whitespace-nowrap">
                <p class="text-sm text-slate-600">${reviewDate}</p>
                ${daysLabel}
            </td>
            <td class="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">${r.TrainerName || '—'}</td>
            <td class="px-4 py-3 text-center text-sm text-slate-500">${r.AttendeeCount || '—'}</td>
            <td class="px-4 py-3 text-center text-sm text-slate-400">${r.ReviewIntervalMonths || 12} เดือน</td>
            <td class="px-4 py-3 text-center">
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.bg} ${meta.text}">
                    ${meta.icon} ${meta.label}
                </span>
            </td>
            ${_isAdmin ? `<td class="px-4 py-3"><div class="flex items-center gap-1">${editBtn}</div></td>` : ''}
        </tr>`;
    }).join('');

    return `<table class="w-full text-left border-collapse">
        <thead>
            <tr class="bg-slate-50 border-b-2 border-slate-200">
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">วันที่ OJT ล่าสุด</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">ทวนสอบถัดไป</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">ผู้ฝึกสอน</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">ผู้เข้าร่วม</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">รอบทบทวน</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">สถานะ</th>
                ${_isAdmin ? `<th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">จัดการ</th>` : ''}
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

// ─── Filters ──────────────────────────────────────────────────────────────────
function _getFiltered() {
    return _records.filter(r => {
        if (_search && !r.Department.toLowerCase().includes(_search.toLowerCase())) return false;
        if (_filterStatus && _calcStatus(r.NextReviewDate) !== _filterStatus) return false;
        return true;
    });
}

function _updateCount() {
    const el = document.getElementById('ojt-count');
    if (el) el.textContent = `แสดง ${_getFiltered().length} / ${_records.length} แผนก`;
}

window._ojtFilter = function() {
    _search       = document.getElementById('ojt-search')?.value  || '';
    _filterStatus = document.getElementById('ojt-status')?.value  || '';
    const wrap = document.getElementById('ojt-table-wrap');
    if (wrap) wrap.innerHTML = _renderTable();
    _updateCount();
};

window._ojtSetFilter = function(status) {
    _filterStatus = status;
    _renderPage(document.getElementById('ojt-page'));
};

window._ojtClearFilter = function() {
    _search = ''; _filterStatus = '';
    _renderPage(document.getElementById('ojt-page'));
};

// ─── Add / Edit Form (per Department) ─────────────────────────────────────────
function _ojtFormHtml(department, r = {}) {
    return `
    <form id="ojt-form" class="space-y-4">
        <div class="bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
            <p class="text-xs text-slate-500 font-medium">แผนก</p>
            <p class="text-base font-bold text-slate-800 mt-0.5">${department}</p>
            <input type="hidden" name="Department" value="${_esc(department)}">
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">วันที่จัดอบรม OJT <span class="text-red-500">*</span></label>
                <input name="OJTDate" type="date" required value="${r.OJTDate?.split('T')[0]||''}"
                    oninput="window._ojtCalcNextDate()"
                    class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">รอบทบทวน</label>
                <select name="ReviewIntervalMonths" id="ojt-interval"
                    onchange="window._ojtCalcNextDate()"
                    class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                    <option value="6"  ${(r.ReviewIntervalMonths||12)==6 ?'selected':''}>6 เดือน</option>
                    <option value="12" ${(r.ReviewIntervalMonths||12)==12?'selected':''}>12 เดือน (1 ปี)</option>
                    <option value="24" ${(r.ReviewIntervalMonths||12)==24?'selected':''}>24 เดือน (2 ปี)</option>
                </select>
            </div>
        </div>

        <div id="ojt-next-preview" class="${r.OJTDate ? '' : 'hidden'} text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200">
            📅 วันที่ทวนสอบถัดไป: <strong id="ojt-next-date-text">${r.NextReviewDate ? new Date(r.NextReviewDate).toLocaleDateString('th-TH', {day:'2-digit',month:'long',year:'numeric'}) : ''}</strong>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">ผู้ฝึกสอน / วิทยากร</label>
                <input name="TrainerName" value="${r.TrainerName||''}"
                    placeholder="ชื่อผู้ฝึกสอน"
                    class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">จำนวนผู้เข้าร่วม (คน)</label>
                <input name="AttendeeCount" type="number" min="0" value="${r.AttendeeCount||''}"
                    placeholder="0"
                    class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
            </div>
        </div>

        <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
            <textarea name="Notes" rows="2" placeholder="หมายเหตุ (ถ้ามี)"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 resize-none">${r.Notes||''}</textarea>
        </div>

        <div id="ojt-form-error" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onclick="window._UI_closeModal()"
                class="px-5 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">ยกเลิก</button>
            <button type="submit"
                class="px-5 py-2 text-sm font-semibold text-white rounded-lg transition-all"
                style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก</button>
        </div>
    </form>`;
}

window._ojtCalcNextDate = function() {
    const ojtDateEl  = document.querySelector('#ojt-form [name=OJTDate]');
    const intervalEl = document.getElementById('ojt-interval');
    if (!ojtDateEl?.value) return;
    const d = new Date(ojtDateEl.value);
    d.setMonth(d.getMonth() + parseInt(intervalEl?.value || 12));
    const preview = document.getElementById('ojt-next-preview');
    const text    = document.getElementById('ojt-next-date-text');
    if (preview && text) {
        preview.classList.remove('hidden');
        text.textContent = d.toLocaleDateString('th-TH', { day:'2-digit', month:'long', year:'numeric' });
    }
};

window._ojtOpenEdit = function(department, record) {
    const title = record ? `อัปเดต OJT — ${department}` : `บันทึก OJT — ${department}`;
    UI.openModal(title, _ojtFormHtml(department, record || {}));
    setTimeout(() => {
        if (record?.OJTDate) window._ojtCalcNextDate();
        document.getElementById('ojt-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = {
                Department:           fd.get('Department'),
                OJTDate:              fd.get('OJTDate'),
                ReviewIntervalMonths: fd.get('ReviewIntervalMonths'),
                TrainerName:          fd.get('TrainerName'),
                AttendeeCount:        fd.get('AttendeeCount'),
                Notes:                fd.get('Notes'),
            };
            try {
                await API.post('/ojt/records', body);
                UI.closeModal();
                UI.showToast(`บันทึก OJT แผนก ${department} สำเร็จ`, 'success');
                await _fetchRecords();
                _renderPage(document.getElementById('ojt-page'));
            } catch (err) {
                const el = document.getElementById('ojt-form-error');
                if (el) { el.textContent = err.message || 'เกิดข้อผิดพลาด'; el.classList.remove('hidden'); }
            }
        });
    }, 50);
};

window._ojtDelete = async function(id, dept) {
    if (!confirm(`ล้างข้อมูล OJT ของแผนก "${dept}"?`)) return;
    try {
        await apiFetch(`/ojt/records/${id}`, { method: 'DELETE' });
        UI.showToast('ล้างข้อมูล OJT สำเร็จ', 'success');
        await _fetchRecords();
        _renderPage(document.getElementById('ojt-page'));
    } catch (err) {
        UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

// ─── Edit SCW Standard ────────────────────────────────────────────────────────
window._ojtEditStandard = function() {
    const current = _standard?.Content || '';
    UI.openModal('แก้ไขมาตรฐาน Stop · Call · Wait', `
        <form id="scw-edit-form" class="space-y-4">
            <p class="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
                ใช้ <code>&lt;h3&gt;หัวข้อ&lt;/h3&gt;&lt;p&gt;เนื้อหา&lt;/p&gt;</code> จำนวน 3 ชุด (Stop / Call / Wait)
            </p>
            <textarea name="Content" rows="12"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 font-mono"
                style="resize:vertical">${current}</textarea>
            <div id="scw-edit-error" class="text-sm text-red-500 hidden"></div>
            <div class="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button type="button" onclick="window._UI_closeModal()"
                    class="px-5 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">ยกเลิก</button>
                <button type="submit"
                    class="px-5 py-2 text-sm font-semibold text-white rounded-lg"
                    style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก</button>
            </div>
        </form>`);

    setTimeout(() => {
        document.getElementById('scw-edit-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = e.target.querySelector('[name=Content]').value;
            try {
                await apiFetch('/ojt/standard', { method: 'PUT', body: JSON.stringify({ Content: content }) });
                UI.closeModal();
                UI.showToast('บันทึกมาตรฐาน SCW สำเร็จ', 'success');
                await _fetchStandard();
                _renderPage(document.getElementById('ojt-page'));
            } catch (err) {
                const el = document.getElementById('scw-edit-error');
                if (el) { el.textContent = err.message || 'เกิดข้อผิดพลาด'; el.classList.remove('hidden'); }
            }
        });
    }, 50);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
window._UI_closeModal = () => UI.closeModal();

function _esc(str) {
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
