// public/js/pages/ojt.js
// OJT tracked per DEPARTMENT (not per employee)
import { API, apiFetch } from '../api.js';
import * as UI from '../ui.js';

// ─── State ────────────────────────────────────────────────────────────────────
let _records      = [];   // one record per department (merged with master)
let _standard     = null;
let _docs         = [];   // SCW Documents
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

    // Expose closeModal for inline onclick handlers in modal HTML strings
    window.closeModal = UI.closeModal;

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400">
            <div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <p class="text-sm">กำลังโหลดข้อมูล...</p>
        </div>`;

    await Promise.all([_fetchRecords(), _fetchStandard(), _fetchDocs()]);
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

async function _fetchDocs() {
    try {
        const res = await API.get('/ojt/documents');
        _docs = res.data || [];
    } catch { _docs = []; }
}

// ─── Render Page ──────────────────────────────────────────────────────────────
function _renderPage(container) {
    const total   = _records.length;
    const valid   = _records.filter(r => _calcStatus(r.NextReviewDate) === 'valid').length;
    const dueSoon = _records.filter(r => _calcStatus(r.NextReviewDate) === 'due-soon').length;
    const overdue = _records.filter(r => _calcStatus(r.NextReviewDate) === 'overdue').length;
    const noData  = _records.filter(r => _calcStatus(r.NextReviewDate) === 'no-data').length;
    const pct     = (total - noData) ? Math.round(valid * 100 / (total - noData)) : 0;

    const circ   = (2 * Math.PI * 22).toFixed(1);
    const offset = ((1 - pct / 100) * 2 * Math.PI * 22).toFixed(1);
    const ringColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
    const pctColor  = pct >= 80 ? '#065f46' : pct >= 50 ? '#92400e' : '#991b1b';
    const barGrad   = pct >= 80
        ? 'linear-gradient(90deg,#10b981,#34d399)'
        : pct >= 50 ? 'linear-gradient(90deg,#f59e0b,#fcd34d)'
        : 'linear-gradient(90deg,#ef4444,#f87171)';

    container.innerHTML = `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="ojt-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#ojt-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>
            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                Stop · Call · Wait
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">OJT Department Status</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">มาตรฐานความปลอดภัยและสถานะการอบรม OJT รายแผนก</p>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap justify-end flex-shrink-0">
                        <button onclick="window._ojtExportExcel()" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-semibold transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                            Export Excel
                        </button>
                        ${_isAdmin ? `
                        <button onclick="window._ojtEditStandard()" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-semibold transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            แก้ไขมาตรฐาน SCW
                        </button>` : ''}
                    </div>
                </div>

                <!-- Stats strip -->
                <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
                    <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
                        <p class="text-2xl font-bold text-white">${total}</p>
                        <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">แผนกทั้งหมด</p>
                    </div>
                    <div class="rounded-xl px-4 py-3 text-center cursor-pointer hover:bg-white/20 transition-colors" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)" onclick="window._ojtSetFilter('valid')">
                        <p class="text-2xl font-bold" style="color:#6ee7b7">${valid}</p>
                        <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">Valid</p>
                    </div>
                    <div class="rounded-xl px-4 py-3 text-center cursor-pointer hover:bg-white/20 transition-colors" style="background:${dueSoon > 0 ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.12)'};backdrop-filter:blur(6px)" onclick="window._ojtSetFilter('due-soon')">
                        <p class="text-2xl font-bold" style="color:${dueSoon > 0 ? '#fcd34d' : 'rgba(167,243,208,0.85)'}">${dueSoon}</p>
                        <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">Due Soon</p>
                    </div>
                    <div class="rounded-xl px-4 py-3 text-center cursor-pointer hover:bg-white/20 transition-colors" style="background:${overdue > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.12)'};backdrop-filter:blur(6px)" onclick="window._ojtSetFilter('overdue')">
                        <p class="text-2xl font-bold" style="color:${overdue > 0 ? '#fca5a5' : 'rgba(167,243,208,0.85)'}">${overdue}</p>
                        <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">Overdue</p>
                    </div>
                    <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
                        <p class="text-2xl font-bold" style="color:${pct >= 80 ? '#6ee7b7' : pct >= 50 ? '#fcd34d' : '#fca5a5'}">${pct}%</p>
                        <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">Compliance</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Compliance Ring + Progress Bar -->
        ${total > 0 ? `
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
            <div class="flex-shrink-0">
                <div class="relative w-14 h-14">
                    <svg class="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                        <circle cx="28" cy="28" r="22" fill="none" stroke="#f1f5f9" stroke-width="6"/>
                        <circle cx="28" cy="28" r="22" fill="none"
                            stroke="${ringColor}" stroke-width="6" stroke-linecap="round"
                            stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
                            style="transition:stroke-dashoffset 1s ease"/>
                    </svg>
                    <div class="absolute inset-0 flex items-center justify-center">
                        <span class="text-xs font-bold" style="color:${pctColor}">${pct}%</span>
                    </div>
                </div>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center mb-1.5">
                    <span class="text-sm font-bold text-slate-700">OJT Compliance Rate</span>
                    <span class="text-xs text-slate-400">${valid} / ${total - noData} แผนก (ไม่นับที่ยังไม่มีข้อมูล)</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-1000" style="width:${pct}%;background:${barGrad}"></div>
                </div>
                <div class="flex flex-wrap gap-4 mt-2">
                    <span class="flex items-center gap-1.5 text-xs text-slate-500"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>Valid ${valid}</span>
                    <span class="flex items-center gap-1.5 text-xs text-slate-500"><span class="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>Due Soon ${dueSoon}</span>
                    <span class="flex items-center gap-1.5 text-xs text-slate-500"><span class="w-2 h-2 rounded-full bg-red-400 inline-block"></span>Overdue ${overdue}</span>
                    <span class="flex items-center gap-1.5 text-xs text-slate-500"><span class="w-2 h-2 rounded-full bg-slate-300 inline-block"></span>ไม่มีข้อมูล ${noData}</span>
                </div>
            </div>
        </div>` : ''}

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

        <!-- SCW Documents -->
        <div class="card overflow-hidden">
            <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                         style="background:linear-gradient(135deg,#dc2626,#ea580c)">
                        <svg class="w-4.5 h-4.5 text-white w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                    </div>
                    <div>
                        <p class="font-bold text-slate-800">เอกสาร SCW</p>
                        <p class="text-xs text-slate-400">${_docs.length} ไฟล์</p>
                    </div>
                </div>
                ${_isAdmin ? `
                <button onclick="window._ojtUploadDoc()"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                    style="background:linear-gradient(135deg,#dc2626,#ea580c);color:#fff">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                    อัปโหลดเอกสาร
                </button>` : ''}
            </div>
            <div class="p-4">
                ${_renderDocList()}
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

// ─── SCW Document List ────────────────────────────────────────────────────────
const DOC_TYPE_META = {
    pdf:  { label: 'PDF',   bg: 'bg-red-100',    text: 'text-red-700'    },
    doc:  { label: 'Word',  bg: 'bg-blue-100',   text: 'text-blue-700'   },
    docx: { label: 'Word',  bg: 'bg-blue-100',   text: 'text-blue-700'   },
    xls:  { label: 'Excel', bg: 'bg-emerald-100',text: 'text-emerald-700'},
    xlsx: { label: 'Excel', bg: 'bg-emerald-100',text: 'text-emerald-700'},
    ppt:  { label: 'PPT',   bg: 'bg-orange-100', text: 'text-orange-700' },
    pptx: { label: 'PPT',   bg: 'bg-orange-100', text: 'text-orange-700' },
    png:  { label: 'รูปภาพ', bg: 'bg-violet-100', text: 'text-violet-700' },
    jpg:  { label: 'รูปภาพ', bg: 'bg-violet-100', text: 'text-violet-700' },
    jpeg: { label: 'รูปภาพ', bg: 'bg-violet-100', text: 'text-violet-700' },
};

function _renderDocList() {
    if (_docs.length === 0) {
        return `<div class="text-center py-10 text-slate-400">
            <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg class="w-7 h-7 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
            </div>
            <p class="font-medium text-sm">ยังไม่มีเอกสาร SCW</p>
            ${_isAdmin ? `<p class="text-xs mt-1">คลิก "อัปโหลดเอกสาร" เพื่อเพิ่มไฟล์</p>` : ''}
        </div>`;
    }

    return `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${_docs.map(doc => {
            const ext  = (doc.FileType || doc.FileURL?.split('.').pop() || '').toLowerCase().replace(/\?.*/, '');
            const meta = DOC_TYPE_META[ext] || { label: ext.toUpperCase() || 'ไฟล์', bg: 'bg-slate-100', text: 'text-slate-600' };
            const kb   = doc.FileSizeKB ? (doc.FileSizeKB >= 1024 ? `${(doc.FileSizeKB/1024).toFixed(1)} MB` : `${doc.FileSizeKB} KB`) : '';
            const dt   = doc.UploadedAt ? new Date(doc.UploadedAt).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'2-digit' }) : '';
            return `
            <div class="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all bg-white group">
                <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100">
                    <svg class="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-slate-800 truncate">${_esc(doc.Title)}</p>
                    <div class="flex items-center gap-2 mt-1 flex-wrap">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${meta.bg} ${meta.text}">${meta.label}</span>
                        ${kb ? `<span class="text-[10px] text-slate-400">${kb}</span>` : ''}
                        ${dt ? `<span class="text-[10px] text-slate-400">${dt}</span>` : ''}
                    </div>
                    <p class="text-[10px] text-slate-400 mt-0.5">โดย ${doc.UploadedBy || '—'}</p>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                    <a href="${doc.FileURL}" target="_blank" rel="noopener"
                        class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="เปิดไฟล์">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                    </a>
                    ${_isAdmin ? `
                    <button onclick="window._ojtDeleteDoc(${doc.id}, '${_esc(doc.Title)}')"
                        class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="ลบเอกสาร">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>` : ''}
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

// Upload SCW Document
window._ojtUploadDoc = function() {
    UI.openModal('อัปโหลดเอกสาร SCW', `
        <form id="scw-doc-form" class="space-y-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อเอกสาร <span class="text-red-500">*</span></label>
                <input name="Title" type="text" required placeholder="เช่น คู่มือ Stop Call Wait ฉบับปรับปรุง"
                    class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ไฟล์ <span class="text-red-500">*</span></label>
                <input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                    class="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100">
                <p class="text-xs text-slate-400 mt-1">PDF, Word, Excel, PowerPoint, รูปภาพ (สูงสุด 20 MB)</p>
            </div>
            <div id="scw-doc-progress" class="hidden">
                <div class="flex items-center gap-2 text-xs text-slate-500">
                    <div class="animate-spin rounded-full h-4 w-4 border-2 border-emerald-500 border-t-transparent"></div>
                    กำลังอัปโหลด...
                </div>
            </div>
            <div id="scw-doc-error" class="text-sm text-red-500 hidden"></div>
            <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
                <button type="submit" id="scw-doc-submit" class="btn btn-primary px-5">อัปโหลด</button>
            </div>
        </form>`);

    setTimeout(() => {
        document.getElementById('scw-doc-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form     = e.target;
            const titleVal = form.querySelector('[name=Title]').value.trim();
            const fileEl   = form.querySelector('[name=file]');
            const file     = fileEl?.files?.[0];
            if (!file) return;

            const errEl  = document.getElementById('scw-doc-error');
            const prog   = document.getElementById('scw-doc-progress');
            const submit = document.getElementById('scw-doc-submit');
            errEl.classList.add('hidden');
            prog.classList.remove('hidden');
            submit.disabled = true;

            try {
                // Step 1: upload to Cloudinary
                const fd = new FormData();
                fd.append('document', file);
                const uploadData = await API.post('/upload/document', fd);
                if (!uploadData.url && !uploadData.secure_url) throw new Error(uploadData.message || 'อัปโหลดไฟล์ไม่สำเร็จ');

                // Step 2: save metadata
                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                await API.post('/ojt/documents', {
                    Title:      titleVal,
                    FileURL:    uploadData.secure_url || uploadData.url,
                    FileType:   ext,
                    FileSizeKB: Math.round(file.size / 1024),
                });

                UI.closeModal();
                UI.showToast('อัปโหลดเอกสาร SCW สำเร็จ', 'success');
                await _fetchDocs();
                _renderPage(document.getElementById('ojt-page'));
            } catch (err) {
                prog.classList.add('hidden');
                submit.disabled = false;
                errEl.textContent = err.message || 'เกิดข้อผิดพลาด';
                errEl.classList.remove('hidden');
            }
        });
    }, 50);
};

window._ojtDeleteDoc = function(id, title) {
    _confirm(`ลบเอกสาร "<strong>${title}</strong>" ใช่หรือไม่?`, async () => {
        try {
            await apiFetch(`/ojt/documents/${id}`, { method: 'DELETE' });
            UI.showToast('ลบเอกสารสำเร็จ', 'success');
            await _fetchDocs();
            _renderPage(document.getElementById('ojt-page'));
        } catch (err) {
            UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
        }
    }, { confirmLabel: 'ลบเอกสาร' });
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
                <button onclick="window._ojtDrillDown('${_esc(r.Department)}')"
                    class="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800 hover:text-emerald-700 transition-colors text-left">
                    <span class="w-2 h-2 rounded-full flex-shrink-0 ${status === 'valid' ? 'bg-emerald-400' : status === 'due-soon' ? 'bg-amber-400' : status === 'overdue' ? 'bg-red-400' : 'bg-slate-300'}"></span>
                    ${r.Department}
                    <svg class="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                </button>
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
            <button type="button" onclick="window.closeModal&&window.closeModal()"
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

window._ojtDelete = function(id, dept) {
    _confirm(`ล้างข้อมูล OJT ของแผนก "<strong>${dept}</strong>" ใช่หรือไม่?`, async () => {
        try {
            await apiFetch(`/ojt/records/${id}`, { method: 'DELETE' });
            UI.showToast('ล้างข้อมูล OJT สำเร็จ', 'success');
            await _fetchRecords();
            _renderPage(document.getElementById('ojt-page'));
        } catch (err) {
            UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
        }
    }, { confirmLabel: 'ล้างข้อมูล' });
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
                <button type="button" onclick="window.closeModal&&window.closeModal()"
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

// ─── Export Excel ─────────────────────────────────────────────────────────────
window._ojtExportExcel = function() {
    if (!window.XLSX) { UI.showToast('ไม่พบ SheetJS library', 'error'); return; }

    const today = new Date(); today.setHours(0,0,0,0);
    const rows  = _records.map(r => {
        const status = _calcStatus(r.NextReviewDate);
        const diff   = r.NextReviewDate
            ? Math.ceil((new Date(r.NextReviewDate) - today) / 86400000)
            : null;
        return {
            'แผนก':              r.Department,
            'วันที่ OJT ล่าสุด':  r.OJTDate    ? new Date(r.OJTDate).toLocaleDateString('th-TH') : '—',
            'ทวนสอบถัดไป':       r.NextReviewDate ? new Date(r.NextReviewDate).toLocaleDateString('th-TH') : '—',
            'เหลือ/เกินกำหนด (วัน)': diff !== null ? diff : '',
            'รอบทบทวน (เดือน)':  r.ReviewIntervalMonths || 12,
            'ผู้ฝึกสอน':          r.TrainerName || '—',
            'ผู้เข้าร่วม (คน)':   r.AttendeeCount ?? '',
            'สถานะ':              STATUS_META[status]?.label || status,
            'หมายเหตุ':           r.Notes || '',
        };
    });

    const ws  = XLSX.utils.json_to_sheet(rows);
    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'OJT Status');

    // Column widths
    ws['!cols'] = [
        { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 20 },
        { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 30 },
    ];

    const fname = `OJT_Status_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fname);
    UI.showToast('Export Excel สำเร็จ', 'success');
};

// ─── Drill-down Modal ─────────────────────────────────────────────────────────
window._ojtDrillDown = async function(department) {
    // Show loading modal first
    UI.openModal(`ประวัติ OJT — ${department}`, `
        <div class="flex items-center justify-center py-10">
            <div class="animate-spin rounded-full h-8 w-8 border-3 border-emerald-500 border-t-transparent"></div>
        </div>`, 'max-w-xl');

    let history = [];
    try {
        const res = await API.get(`/ojt/history/${encodeURIComponent(department)}`);
        history = res.data || [];
    } catch { history = []; }

    // Find current record
    const current = _records.find(r => r.Department === department) || {};
    const status  = _calcStatus(current.NextReviewDate);
    const meta    = STATUS_META[status];

    const timelineHtml = history.length === 0
        ? `<div class="text-center py-8 text-slate-400">
               <p class="text-sm">ยังไม่มีประวัติการอบรม</p>
           </div>`
        : `<div class="relative pl-5">
               <div class="absolute left-2 top-0 bottom-0 w-0.5 bg-slate-200"></div>
               ${history.map((h, i) => {
                   const d  = h.OJTDate    ? new Date(h.OJTDate).toLocaleDateString('th-TH', {day:'2-digit',month:'long',year:'numeric'}) : '—';
                   const rv = h.NextReviewDate ? new Date(h.NextReviewDate).toLocaleDateString('th-TH', {day:'2-digit',month:'long',year:'numeric'}) : '—';
                   const at = h.RecordedAt  ? new Date(h.RecordedAt).toLocaleString('th-TH', {day:'2-digit',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
                   return `
                   <div class="relative mb-4 last:mb-0">
                       <span class="absolute -left-3 top-1 w-2.5 h-2.5 rounded-full border-2 border-white ${i === 0 ? 'bg-emerald-500' : 'bg-slate-300'}"></span>
                       <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
                           <div class="flex items-center justify-between mb-1">
                               <span class="text-xs font-bold text-slate-700">อบรม: ${d}</span>
                               ${i === 0 ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">ล่าสุด</span>` : ''}
                           </div>
                           <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
                               <span>ทวนสอบถัดไป: <strong class="text-slate-700">${rv}</strong></span>
                               <span>รอบ: <strong class="text-slate-700">${h.ReviewIntervalMonths || 12} เดือน</strong></span>
                               <span>วิทยากร: <strong class="text-slate-700">${h.TrainerName || '—'}</strong></span>
                               <span>ผู้เข้าร่วม: <strong class="text-slate-700">${h.AttendeeCount ?? '—'} คน</strong></span>
                           </div>
                           ${h.Notes ? `<p class="text-xs text-slate-400 mt-1.5 italic">${h.Notes}</p>` : ''}
                           <p class="text-[10px] text-slate-300 mt-1">บันทึกโดย ${h.RecordedBy || '—'} · ${at}</p>
                       </div>
                   </div>`;
               }).join('')}
           </div>`;

    const bodyHtml = `
        <div class="space-y-4">
            <!-- Current status card -->
            <div class="flex items-center gap-3 p-3 rounded-xl border ${status === 'valid' ? 'border-emerald-200 bg-emerald-50' : status === 'overdue' ? 'border-red-200 bg-red-50' : status === 'due-soon' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}">
                <div>
                    <p class="text-xs text-slate-500 font-medium">สถานะปัจจุบัน</p>
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.bg} ${meta.text} mt-1">
                        <span class="w-1.5 h-1.5 rounded-full inline-block ${meta.dot}"></span>
                        ${meta.label}
                    </span>
                </div>
                <div class="ml-auto text-right">
                    <p class="text-xs text-slate-400">วันทวนสอบถัดไป</p>
                    <p class="text-sm font-bold text-slate-700">${current.NextReviewDate ? new Date(current.NextReviewDate).toLocaleDateString('th-TH',{day:'2-digit',month:'long',year:'numeric'}) : '—'}</p>
                </div>
            </div>
            <!-- Timeline -->
            <div>
                <p class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">ประวัติการอบรม</p>
                ${timelineHtml}
            </div>
            <div class="flex justify-end pt-2 border-t border-slate-100">
                <button onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5 text-sm">ปิด</button>
            </div>
        </div>`;

    // Re-open modal with real content
    UI.openModal(`ประวัติ OJT — ${department}`, bodyHtml, 'max-w-xl');
};

// ─── Custom Confirm Dialog ────────────────────────────────────────────────────
function _confirm(message, onConfirm, { danger = true, confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก' } = {}) {
    const btnClass = danger
        ? 'bg-red-600 hover:bg-red-700 text-white'
        : 'bg-emerald-600 hover:bg-emerald-700 text-white';
    UI.openModal('ยืนยันการดำเนินการ', `
        <div class="space-y-4">
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${danger ? 'bg-red-100' : 'bg-emerald-100'}">
                    <svg class="w-5 h-5 ${danger ? 'text-red-500' : 'text-emerald-600'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${danger
                            ? 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
                            : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'}"/>
                    </svg>
                </div>
                <p class="text-sm text-slate-700 leading-relaxed pt-1.5">${message}</p>
            </div>
            <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button onclick="window.closeModal&&window.closeModal()"
                    class="btn btn-secondary px-5 text-sm">${cancelLabel}</button>
                <button id="confirm-ok-btn"
                    class="px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${btnClass}">${confirmLabel}</button>
            </div>
        </div>`, 'max-w-sm');

    setTimeout(() => {
        document.getElementById('confirm-ok-btn')?.addEventListener('click', () => {
            UI.closeModal();
            onConfirm();
        });
    }, 50);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// window.closeModal is set in loadOjtPage() → used by inline onclick in modal HTML strings

function _esc(str) {
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
