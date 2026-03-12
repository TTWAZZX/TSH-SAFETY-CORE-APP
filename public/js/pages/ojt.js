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
    'valid':    { label: 'Valid',           bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-400 animate-pulse', row: '' },
    'due-soon': { label: 'Due Soon',        bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-400',               row: 'bg-amber-50/40' },
    'overdue':  { label: 'Overdue',         bg: 'bg-red-100',     text: 'text-red-600',     dot: 'bg-red-400',                 row: 'bg-red-50/40' },
    'no-data':  { label: 'ยังไม่มีข้อมูล', bg: 'bg-slate-100',   text: 'text-slate-500',   dot: 'bg-slate-300',               row: '' },
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
    <div class="max-w-5xl mx-auto space-y-6 animate-fade-in pb-10">

        <!-- Header -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
                    <span class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style="background:linear-gradient(135deg,#dc2626,#ea580c);box-shadow:0 2px 10px rgba(220,38,38,0.3)">
                        <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </span>
                    Stop · Call · Wait
                </h1>
                <p class="text-sm text-slate-500 mt-1 ml-11">มาตรฐานความปลอดภัยและสถานะการอบรม OJT รายแผนก</p>
            </div>
            ${_isAdmin ? `
            <button onclick="window._ojtEditStandard()" class="btn btn-secondary flex items-center gap-2 text-sm px-4 py-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                แก้ไขมาตรฐาน SCW
            </button>` : ''}
        </div>

        <!-- SCW Standard Panel -->
        <div class="card overflow-hidden">
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
            <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#f1f5f9">
                    <svg class="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                </div>
                <div>
                    <p class="text-2xl font-bold text-slate-800">${total}</p>
                    <p class="text-xs text-slate-500">แผนกทั้งหมด</p>
                </div>
            </div>
            <div class="bg-white rounded-xl p-4 border border-emerald-100 shadow-sm flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow" onclick="window._ojtSetFilter('valid')">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#d1fae5">
                    <svg class="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <div>
                    <p class="text-2xl font-bold text-emerald-600">${valid}</p>
                    <p class="text-xs text-slate-500">Valid</p>
                </div>
            </div>
            <div class="bg-white rounded-xl p-4 border border-amber-100 shadow-sm flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow" onclick="window._ojtSetFilter('due-soon')">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#fef3c7">
                    <svg class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <div>
                    <p class="text-2xl font-bold text-amber-600">${dueSoon}</p>
                    <p class="text-xs text-slate-500">Due Soon <span class="text-slate-400">(≤30 วัน)</span></p>
                </div>
            </div>
            <div class="bg-white rounded-xl p-4 border border-red-100 shadow-sm flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow" onclick="window._ojtSetFilter('overdue')">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#fee2e2">
                    <svg class="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                </div>
                <div>
                    <p class="text-2xl font-bold text-red-600">${overdue}</p>
                    <p class="text-xs text-slate-500">Overdue</p>
                </div>
            </div>
            <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#dbeafe">
                    <svg class="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                </div>
                <div class="flex-1">
                    <p class="text-2xl font-bold text-blue-600">${pct}%</p>
                    <p class="text-xs text-slate-500">Compliance</p>
                    <div class="mt-1.5 w-full bg-slate-100 rounded-full h-1.5">
                        <div class="h-1.5 rounded-full" style="width:${pct}%;background:linear-gradient(90deg,#10b981,#059669)"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Filters -->
        <div class="card p-4 flex flex-wrap gap-3 items-center">
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
                <option value="valid"    ${_filterStatus==='valid'?'selected':''}>Valid</option>
                <option value="due-soon" ${_filterStatus==='due-soon'?'selected':''}>Due Soon (≤30 วัน)</option>
                <option value="overdue"  ${_filterStatus==='overdue'?'selected':''}>Overdue</option>
                <option value="no-data"  ${_filterStatus==='no-data'?'selected':''}>ยังไม่มีข้อมูล</option>
            </select>
            ${_filterStatus || _search ? `
            <button onclick="window._ojtClearFilter()" class="text-xs text-slate-500 underline hover:text-slate-700">ล้างตัวกรอง</button>` : ''}
            <span id="ojt-count" class="text-xs text-slate-400 ml-auto"></span>
        </div>

        <!-- Table -->
        <div class="card overflow-hidden">
            <div id="ojt-table-wrap" class="overflow-x-auto">
                ${_renderTable()}
            </div>
        </div>

    </div>`;

    _updateCount();
}

// ─── SCW Cards ────────────────────────────────────────────────────────────────
const SCW_ICONS = [
    `<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>`,
    `<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>`,
    `<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
];
const SCW_GRADIENTS = [
    'linear-gradient(135deg,#dc2626,#ea580c)',
    'linear-gradient(135deg,#d97706,#f59e0b)',
    'linear-gradient(135deg,#2563eb,#0284c7)',
];

function _renderSCWCards() {
    const defaults = [
        { color: 'red',   title: 'STOP — หยุด', text: 'หยุดการทำงานทันทีเมื่อพบสิ่งผิดปกติหรือไม่แน่ใจในความปลอดภัย อย่าฝืนทำงานต่อ' },
        { color: 'amber', title: 'CALL — โทร',  text: 'แจ้งหัวหน้างานหรือผู้รับผิดชอบทันที อธิบายปัญหาที่พบให้ชัดเจน' },
        { color: 'blue',  title: 'WAIT — รอ',   text: 'รอการตอบสนองจากผู้รับผิดชอบ ห้ามเริ่มงานต่อจนกว่าจะได้รับอนุญาต' },
    ];
    const items = (_standard?.Content?.trim()) ? _parseStandardContent(_standard.Content) : defaults;

    return items.map((item, i) => {
        const c        = item.color || ['red','amber','blue'][i] || 'slate';
        const svgIcon  = SCW_ICONS[i]     || SCW_ICONS[0];
        const gradient = SCW_GRADIENTS[i] || SCW_GRADIENTS[0];
        return `
        <div class="rounded-xl p-5 border border-${c}-200 bg-${c}-50">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                     style="background:${gradient}">
                    ${svgIcon}
                </div>
                <h3 class="font-bold text-${c}-700">${item.title}</h3>
            </div>
            <p class="text-sm text-slate-700 leading-relaxed">${item.text}</p>
        </div>`;
    }).join('');
}

function _parseStandardContent(html) {
    const div    = document.createElement('div');
    div.innerHTML = html;
    const colors = ['red','amber','blue'];
    const result = [];
    let idx = 0;
    div.querySelectorAll('h3').forEach(h3 => {
        const p = h3.nextElementSibling;
        result.push({ color: colors[idx] || 'slate', title: h3.textContent, text: p?.textContent || '' });
        idx++;
    });
    if (result.length === 0) {
        result.push({ color: 'slate', title: 'มาตรฐาน SCW', text: div.textContent });
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
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
            </div>
            <p class="font-medium text-slate-500">ไม่พบข้อมูล</p>
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
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.bg} ${meta.text}">
                    <span class="w-1.5 h-1.5 rounded-full inline-block ${meta.dot}"></span>
                    ${meta.label}
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
        <div class="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <p class="text-xs text-emerald-700 font-medium">แผนก</p>
            <p class="text-base font-bold text-slate-800 mt-0.5">${department}</p>
            <input type="hidden" name="Department" value="${_esc(department)}">
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่จัดอบรม OJT <span class="text-red-500">*</span></label>
                <input name="OJTDate" type="date" required value="${r.OJTDate?.split('T')[0]||''}"
                    oninput="window._ojtCalcNextDate()"
                    class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รอบทบทวน</label>
                <select name="ReviewIntervalMonths" id="ojt-interval"
                    onchange="window._ojtCalcNextDate()"
                    class="form-input w-full">
                    <option value="6"  ${(r.ReviewIntervalMonths||12)==6 ?'selected':''}>6 เดือน</option>
                    <option value="12" ${(r.ReviewIntervalMonths||12)==12?'selected':''}>12 เดือน (1 ปี)</option>
                    <option value="24" ${(r.ReviewIntervalMonths||12)==24?'selected':''}>24 เดือน (2 ปี)</option>
                </select>
            </div>
        </div>

        <div id="ojt-next-preview" class="${r.OJTDate ? '' : 'hidden'} flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 border border-emerald-100">
            <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            วันที่ทวนสอบถัดไป: <strong id="ojt-next-date-text">${r.NextReviewDate ? new Date(r.NextReviewDate).toLocaleDateString('th-TH', {day:'2-digit',month:'long',year:'numeric'}) : ''}</strong>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้ฝึกสอน / วิทยากร</label>
                <input name="TrainerName" value="${r.TrainerName||''}"
                    placeholder="ชื่อผู้ฝึกสอน"
                    class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">จำนวนผู้เข้าร่วม (คน)</label>
                <input name="AttendeeCount" type="number" min="0" value="${r.AttendeeCount||''}"
                    placeholder="0"
                    class="form-input w-full">
            </div>
        </div>

        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
            <textarea name="Notes" rows="2" placeholder="หมายเหตุ (ถ้ามี)"
                class="form-textarea w-full resize-none">${r.Notes||''}</textarea>
        </div>

        <div id="ojt-form-error" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window._UI_closeModal()"
                class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
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
            <p class="text-xs text-emerald-700 bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                ใช้ <code>&lt;h3&gt;หัวข้อ&lt;/h3&gt;&lt;p&gt;เนื้อหา&lt;/p&gt;</code> จำนวน 3 ชุด (Stop / Call / Wait)
            </p>
            <textarea name="Content" rows="12"
                class="form-textarea w-full font-mono"
                style="resize:vertical">${current}</textarea>
            <div id="scw-edit-error" class="text-sm text-red-500 hidden"></div>
            <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onclick="window._UI_closeModal()"
                    class="btn btn-secondary px-5">ยกเลิก</button>
                <button type="submit" class="btn btn-primary px-5">บันทึก</button>
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
