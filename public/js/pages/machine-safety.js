// public/js/pages/machine-safety.js
import { API, apiFetch } from '../api.js';
import * as UI from '../ui.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const RISK_META = {
    low:      { label: 'ต่ำ',       bg: 'bg-emerald-100', text: 'text-emerald-700', dot: '#10b981' },
    medium:   { label: 'ปานกลาง',  bg: 'bg-amber-100',   text: 'text-amber-700',   dot: '#f59e0b' },
    high:     { label: 'สูง',       bg: 'bg-orange-100',  text: 'text-orange-700',  dot: '#f97316' },
    critical: { label: 'วิกฤต',    bg: 'bg-red-100',     text: 'text-red-700',     dot: '#ef4444' },
};
const STATUS_META = {
    active:      { label: 'ใช้งาน',             bg: 'bg-emerald-100', text: 'text-emerald-700', dot: '#10b981' },
    maintenance: { label: 'ซ่อมบำรุง',         bg: 'bg-blue-100',    text: 'text-blue-700',    dot: '#3b82f6' },
    restricted:  { label: 'จำกัดการใช้งาน',   bg: 'bg-amber-100',   text: 'text-amber-700',   dot: '#f59e0b' },
    locked:      { label: 'ล็อคเอาต์/LOTO',   bg: 'bg-red-100',     text: 'text-red-700',     dot: '#ef4444' },
    inactive:    { label: 'หยุดใช้งาน',        bg: 'bg-slate-100',   text: 'text-slate-500',   dot: '#94a3b8' },
};

// ─── Compliance Requirements 5.1–5.8 ─────────────────────────────────────────
const COMPLIANCE_ITEMS = [
    { code: '5.1', label: 'การป้องกันจุดหนีบ / จุดตัด (Nip / Shear Point Guard)' },
    { code: '5.2', label: 'การป้องกันชิ้นส่วนหมุน (Rotating Part Guard)' },
    { code: '5.3', label: 'อุปกรณ์หยุดฉุกเฉิน (Emergency Stop)' },
    { code: '5.4', label: 'ป้ายเตือนและสัญญาณแจ้งเตือน (Warning Signs & Signals)' },
    { code: '5.5', label: 'ระบบ Lockout / Tagout (LOTO Procedure)' },
    { code: '5.6', label: 'การต่อลงดิน / ความปลอดภัยไฟฟ้า (Electrical Safety / Grounding)' },
    { code: '5.7', label: 'ความปลอดภัยด้านการยศาสตร์ (Ergonomic Safety)' },
    { code: '5.8', label: 'บันทึกการตรวจสอบและบำรุงรักษา (Inspection & Maintenance Log)' },
];

// ─── State ────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

let _machines      = [];
let _depts         = [];
let _search        = '';
let _filterDept    = '';
let _filterStatus  = '';
let _filterRisk    = '';
let _filterMStatus = '';
let _filterAudit   = '';
let _isAdmin       = false;
let _page          = 1;

// ─── Entry Point ──────────────────────────────────────────────────────────────
export async function loadMachineSafetyPage() {
    const container = document.getElementById('machine-safety-page');
    if (!container) return;

    const user = TSHSession.getUser();
    _isAdmin = user?.role === 'Admin' || user?.Role === 'Admin';

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400">
            <div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <p class="text-sm">กำลังโหลดข้อมูล...</p>
        </div>`;

    await Promise.all([_fetchMachines(), _fetchDepts()]);
    _renderPage(container);
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function _fetchMachines() {
    try {
        const res = await API.get('/machine-safety');
        _machines = res.data || [];
    } catch { _machines = []; }
}

async function _fetchDepts() {
    try {
        const res = await API.get('/master/departments');
        _depts = (res.data || []).map(d => d.Name);
    } catch { _depts = []; }
}

// ─── Audit Status per Machine ─────────────────────────────────────────────────
// Returns { status: 'pass'|'warn'|'fail', hints: [{type:'fail'|'warn', msg}] }
function _auditStatus(m) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const hints = [];

    if (!m.SafetyDeviceCount)     hints.push({ type: 'fail', msg: 'ขาด Safety Device Std.' });
    if (!m.LayoutCheckpointCount) hints.push({ type: 'fail', msg: 'ขาด Layout & Checkpoint' });
    if (!m.HasRiskAssessment)     hints.push({ type: 'warn', msg: 'ยังไม่ประเมินความเสี่ยง' });
    if (m.NextInspectionDate) {
        const diff = Math.ceil((new Date(m.NextInspectionDate) - today) / 86400000);
        if (diff < 0) hints.push({ type: 'fail', msg: `เกินกำหนดตรวจ ${Math.abs(diff)} วัน` });
    }
    if (m.OpenIssueCount > 0) hints.push({ type: 'warn', msg: `ปัญหาค้าง ${m.OpenIssueCount} รายการ` });
    if (m.ComplianceCheckedCount > 0) {
        const failCount = m.ComplianceCheckedCount - m.CompliancePassCount;
        if (failCount > 0) hints.push({ type: 'fail', msg: `Compliance ไม่ผ่าน ${failCount} ข้อ` });
    }

    const hasFail = hints.some(h => h.type === 'fail');
    const hasWarn = hints.some(h => h.type === 'warn');
    return { status: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass', hints };
}

// ─── Render Page ──────────────────────────────────────────────────────────────
function _renderPage(container) {
    const today     = new Date(); today.setHours(0,0,0,0);
    const total     = _machines.length;
    const compliant = _machines.filter(m => m.SafetyDeviceCount > 0 && m.LayoutCheckpointCount > 0).length;
    const partial   = _machines.filter(m => (m.SafetyDeviceCount > 0) !== (m.LayoutCheckpointCount > 0)).length;
    const none      = total - compliant - partial;
    const pct       = total ? Math.round(compliant * 100 / total) : 0;
    const overdue   = _machines.filter(m => m.NextInspectionDate && new Date(m.NextInspectionDate) < today).length;
    const dueSoon   = _machines.filter(m => {
        if (!m.NextInspectionDate) return false;
        const d = new Date(m.NextInspectionDate); const diff = Math.ceil((d - today) / 86400000);
        return diff >= 0 && diff <= 30;
    }).length;

    // Audit readiness across all machines
    const auditMap  = _machines.reduce((acc, m) => { acc[_auditStatus(m).status]++; return acc; }, { pass: 0, warn: 0, fail: 0 });
    const auditPct  = total ? Math.round(auditMap.pass * 100 / total) : 0;
    // Top hints — aggregate hint messages by frequency
    const hintFreq  = {};
    _machines.forEach(m => _auditStatus(m).hints.forEach(h => { hintFreq[h.msg] = (hintFreq[h.msg] || 0) + 1; }));
    const topHints  = Object.entries(hintFreq).sort((a, b) => b[1] - a[1]).slice(0, 4);

    container.innerHTML = `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl mb-2" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="msd-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#msd-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>
            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                ความปลอดภัยเครื่องจักร
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">Machine Safety Devices</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Safety Device Standard และ Layout &amp; Checkpoint ของเครื่องจักรทั้งหมด</p>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap justify-end flex-shrink-0">
                        <button onclick="window._msdExportExcel()" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-semibold transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                            Export Excel
                        </button>
                        ${_isAdmin ? `
                        <button onclick="window._msdOpenAdd()" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg" style="background:rgba(255,255,255,0.95);color:#065f46">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                            เพิ่มเครื่องจักร
                        </button>` : ''}
                    </div>
                </div>
                <!-- Stats strip -->
                <div class="grid grid-cols-2 md:grid-cols-${2 + (overdue>0?1:0) + (dueSoon>0?1:0) + 2} gap-3 mt-5">
                    <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
                        <p class="text-2xl font-bold text-white">${total}</p>
                        <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">ทั้งหมด</p>
                    </div>
                    <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
                        <p class="text-2xl font-bold" style="color:#6ee7b7">${compliant}</p>
                        <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">เอกสารครบ</p>
                    </div>
                    <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
                        <p class="text-2xl font-bold" style="color:${partial>0?'#fcd34d':'#6ee7b7'}">${partial}</p>
                        <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">บางส่วน</p>
                    </div>
                    <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
                        <p class="text-2xl font-bold" style="color:${pct>=80?'#6ee7b7':pct>=50?'#fcd34d':'#fca5a5'}">${pct}%</p>
                        <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">Compliance</p>
                    </div>
                    ${overdue > 0 ? `
                    <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(239,68,68,0.25);backdrop-filter:blur(6px)">
                        <p class="text-2xl font-bold" style="color:#fca5a5">${overdue}</p>
                        <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">เกินกำหนด</p>
                    </div>` : ''}
                    ${dueSoon > 0 ? `
                    <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(245,158,11,0.2);backdrop-filter:blur(6px)">
                        <p class="text-2xl font-bold" style="color:#fcd34d">${dueSoon}</p>
                        <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">ใกล้กำหนด</p>
                    </div>` : ''}
                </div>
            </div>
        </div>

        <!-- Compliance Bar -->
        ${total > 0 ? `
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
            <div class="flex-shrink-0">
                <div class="relative w-14 h-14">
                    <svg class="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                        <circle cx="28" cy="28" r="22" fill="none" stroke="#f1f5f9" stroke-width="6"/>
                        <circle cx="28" cy="28" r="22" fill="none"
                            stroke="${pct>=80?'#10b981':pct>=50?'#f59e0b':'#ef4444'}"
                            stroke-width="6" stroke-linecap="round"
                            stroke-dasharray="${(2*Math.PI*22).toFixed(1)}"
                            stroke-dashoffset="${((1-pct/100)*2*Math.PI*22).toFixed(1)}"
                            style="transition:stroke-dashoffset 1s ease"/>
                    </svg>
                    <div class="absolute inset-0 flex items-center justify-center">
                        <span class="text-xs font-bold" style="color:${pct>=80?'#065f46':pct>=50?'#92400e':'#991b1b'}">${pct}%</span>
                    </div>
                </div>
            </div>
            <div class="flex-1">
                <div class="flex justify-between items-center mb-1.5">
                    <span class="text-sm font-bold text-slate-700">อัตราเอกสารครบถ้วน (Document Compliance)</span>
                    <span class="text-xs text-slate-400">${compliant} / ${total} เครื่อง</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-1000"
                        style="width:${pct}%;background:${pct>=80?'linear-gradient(90deg,#10b981,#34d399)':pct>=50?'linear-gradient(90deg,#f59e0b,#fcd34d)':'linear-gradient(90deg,#ef4444,#f87171)'}">
                    </div>
                </div>
                <div class="flex gap-4 mt-2">
                    <span class="flex items-center gap-1.5 text-xs text-slate-500"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>เอกสารครบ ${compliant}</span>
                    <span class="flex items-center gap-1.5 text-xs text-slate-500"><span class="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>บางส่วน ${partial}</span>
                    <span class="flex items-center gap-1.5 text-xs text-slate-500"><span class="w-2 h-2 rounded-full bg-slate-300 inline-block"></span>ยังไม่มี ${none}</span>
                </div>
            </div>
        </div>` : ''}

        <!-- Audit Readiness Summary -->
        ${total > 0 ? `
        <div class="bg-white rounded-xl border shadow-sm p-4 ${auditPct >= 80 ? 'border-emerald-200' : auditPct >= 50 ? 'border-amber-200' : 'border-red-200'}">
            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div class="flex items-center gap-3 flex-shrink-0">
                    <div class="relative w-14 h-14">
                        <svg class="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                            <circle cx="28" cy="28" r="22" fill="none" stroke="#f1f5f9" stroke-width="6"/>
                            <circle cx="28" cy="28" r="22" fill="none"
                                stroke="${auditPct>=80?'#10b981':auditPct>=50?'#f59e0b':'#ef4444'}"
                                stroke-width="6" stroke-linecap="round"
                                stroke-dasharray="${(2*Math.PI*22).toFixed(1)}"
                                stroke-dashoffset="${((1-auditPct/100)*2*Math.PI*22).toFixed(1)}"/>
                        </svg>
                        <div class="absolute inset-0 flex items-center justify-center">
                            <span class="text-xs font-bold" style="color:${auditPct>=80?'#065f46':auditPct>=50?'#92400e':'#991b1b'}">${auditPct}%</span>
                        </div>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-slate-700">Audit Readiness</p>
                        <p class="text-xs text-slate-400 mt-0.5">ความพร้อมรับการตรวจสอบ</p>
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap gap-3 mb-2.5">
                        <button onclick="window._msdSetAuditFilter('pass')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors cursor-pointer">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>ผ่าน ${auditMap.pass} เครื่อง
                        </button>
                        <button onclick="window._msdSetAuditFilter('warn')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors cursor-pointer">
                            <span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>เตือน ${auditMap.warn} เครื่อง
                        </button>
                        <button onclick="window._msdSetAuditFilter('fail')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition-colors cursor-pointer">
                            <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>ไม่ผ่าน ${auditMap.fail} เครื่อง
                        </button>
                    </div>
                    ${topHints.length > 0 ? `
                    <div class="flex flex-wrap gap-2 items-center">
                        <span class="text-[10px] text-slate-400 font-medium">พบบ่อย:</span>
                        ${topHints.map(([msg, count]) => `
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                            ${msg} <span class="font-bold text-slate-400">(${count})</span>
                        </span>`).join('')}
                    </div>` : '<p class="text-xs text-emerald-600 font-medium">ทุกเครื่องจักรผ่านการตรวจสอบ</p>'}
                </div>
            </div>
        </div>` : ''}

        <!-- Dept Compliance Chart -->
        ${(() => {
            const depts = [...new Set(_machines.map(m => m.Department).filter(Boolean))].sort();
            if (depts.length === 0) return '';
            return `
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                    Compliance ตามแผนก
                </h3>
                <span class="text-xs text-slate-400">เปอร์เซ็นต์เครื่องจักรที่มีเอกสารครบ</span>
            </div>
            <div class="h-48"><canvas id="msd-dept-chart"></canvas></div>
        </div>`;
        })()}

        <!-- Legend -->
        <div class="flex flex-wrap gap-4 text-xs text-slate-500">
            <span class="flex items-center gap-1.5">
                <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 font-bold text-xs">✓</span>
                มีไฟล์แนบ
            </span>
            <span class="flex items-center gap-1.5">
                <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400 font-bold text-xs">✗</span>
                ยังไม่มีไฟล์
            </span>
            <span class="flex items-center gap-1.5">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-semibold">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    ไฟล์
                </span>
                กดเพื่อดู/ดาวน์โหลด/ปริ้น
            </span>
        </div>

        <!-- Filter Bar -->
        <div class="card p-4 flex flex-wrap gap-3 items-center">
            <div class="relative flex-1 min-w-[180px]">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                <input id="msd-search" type="text" placeholder="ค้นหาชื่อ / รหัสเครื่องจักร..."
                    value="${_search}"
                    class="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    oninput="window._msdFilter()">
            </div>
            <select id="msd-dept" class="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">ทุกแผนก</option>
                ${[...new Set(_machines.map(m => m.Department).filter(Boolean))].sort()
                    .map(d => `<option value="${d}" ${_filterDept===d?'selected':''}>${d}</option>`).join('')}
            </select>
            <select id="msd-status" class="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">เอกสาร: ทุกสถานะ</option>
                <option value="full"    ${_filterStatus==='full'?'selected':''}>ครบทั้ง 2 รายการ</option>
                <option value="partial" ${_filterStatus==='partial'?'selected':''}>มีบางส่วน</option>
                <option value="none"    ${_filterStatus==='none'?'selected':''}>ยังไม่มีเลย</option>
            </select>
            <select id="msd-mstatus" class="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">สถานะเครื่อง: ทั้งหมด</option>
                <option value="active"      ${_filterMStatus==='active'?'selected':''}>ใช้งาน</option>
                <option value="restricted"  ${_filterMStatus==='restricted'?'selected':''}>จำกัดการใช้งาน</option>
                <option value="locked"      ${_filterMStatus==='locked'?'selected':''}>ล็อคเอาต์/LOTO</option>
                <option value="maintenance" ${_filterMStatus==='maintenance'?'selected':''}>ซ่อมบำรุง</option>
                <option value="inactive"    ${_filterMStatus==='inactive'?'selected':''}>หยุดใช้งาน</option>
            </select>
            <select id="msd-risk" class="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">ความเสี่ยง: ทั้งหมด</option>
                <option value="critical" ${_filterRisk==='critical'?'selected':''}>วิกฤต</option>
                <option value="high"     ${_filterRisk==='high'?'selected':''}>สูง</option>
                <option value="medium"   ${_filterRisk==='medium'?'selected':''}>ปานกลาง</option>
                <option value="low"      ${_filterRisk==='low'?'selected':''}>ต่ำ</option>
            </select>
            <select id="msd-audit" class="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">Audit: ทั้งหมด</option>
                <option value="pass" ${_filterAudit==='pass'?'selected':''}>ผ่าน</option>
                <option value="warn" ${_filterAudit==='warn'?'selected':''}>เตือน</option>
                <option value="fail" ${_filterAudit==='fail'?'selected':''}>ไม่ผ่าน</option>
            </select>
            <span id="msd-count" class="text-xs text-slate-400 ml-auto"></span>
        </div>

        <!-- Table -->
        <div class="card overflow-hidden">
            <div id="msd-table-wrap" class="overflow-x-auto">
                ${_renderTable()}
            </div>
        </div>

    </div>`;

    _updateCount();
    requestAnimationFrame(_drawDeptChart);
}

// ─── Dept Chart ───────────────────────────────────────────────────────────────
let _deptChartInst = null;
function _drawDeptChart() {
    const ctx = document.getElementById('msd-dept-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (_deptChartInst) { _deptChartInst.destroy(); _deptChartInst = null; }

    const depts = [...new Set(_machines.map(m => m.Department).filter(Boolean))].sort();
    if (depts.length === 0) return;

    const compliantCounts = depts.map(d => _machines.filter(m => m.Department === d && m.SafetyDeviceCount > 0 && m.LayoutCheckpointCount > 0).length);
    const totalCounts     = depts.map(d => _machines.filter(m => m.Department === d).length);
    const pcts            = depts.map((_, i) => totalCounts[i] ? Math.round(compliantCounts[i] * 100 / totalCounts[i]) : 0);

    _deptChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: depts,
            datasets: [
                {
                    label: 'Compliance %',
                    data: pcts,
                    backgroundColor: pcts.map(p => p >= 80 ? 'rgba(16,185,129,0.75)' : p >= 50 ? 'rgba(245,158,11,0.75)' : 'rgba(239,68,68,0.75)'),
                    borderRadius: 6,
                    barPercentage: 0.6,
                },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%', font: { family: 'Kanit', size: 10 }, color: '#94a3b8' }, grid: { color: '#f8fafc' } },
                x: { grid: { display: false }, ticks: { font: { family: 'Kanit', size: 10 }, color: '#64748b' } },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.9)',
                    titleFont: { family: 'Kanit', size: 11 }, bodyFont: { family: 'Kanit', size: 11 },
                    padding: 10, cornerRadius: 8,
                    callbacks: {
                        label: c => ` Compliance: ${c.raw}% (${compliantCounts[c.dataIndex]}/${totalCounts[c.dataIndex]} เครื่อง)`,
                    },
                },
            },
        },
    });
}

// ─── Table ────────────────────────────────────────────────────────────────────
function _renderTable() {
    const filtered = _getFiltered();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (_page > totalPages) _page = Math.max(1, totalPages);
    const paginated = filtered.slice((_page - 1) * PAGE_SIZE, _page * PAGE_SIZE);

    if (filtered.length === 0) {
        return `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg class="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <p class="font-medium">ไม่พบข้อมูลเครื่องจักร</p>
        </div>`;
    }

    const rows = paginated.map(m => {
        const hasSafety  = m.SafetyDeviceCount > 0;
        const hasLayout  = m.LayoutCheckpointCount > 0;
        const isFull     = hasSafety && hasLayout;
        const isPartial  = hasSafety !== hasLayout;

        const statusBadge = isFull
            ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>ครบ</span>`
            : isPartial
            ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>บางส่วน</span>`
            : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500"><span class="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block"></span>ยังไม่มี</span>`;

        const sm = STATUS_META[m.Status || 'active'];
        const machineSBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sm.bg} ${sm.text}">${sm.label}</span>`;

        const rm = RISK_META[m.RiskLevel || 'low'];
        const riskBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${rm.bg} ${rm.text}">
            <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:${rm.dot}"></span>${rm.label}
        </span>`;

        const tick = (v) => v
            ? `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold">✓</span>`
            : `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-500 text-xs font-bold">✗</span>`;

        const tickRisk = m.HasRiskAssessment
            ? `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold">✓</span>`
            : `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-400 text-xs font-bold">✗</span>`;

        const updated = m.UpdatedAt
            ? new Date(m.UpdatedAt).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'2-digit' })
            : '—';

        const today = new Date(); today.setHours(0,0,0,0);
        let inspectionCell = '<span class="text-slate-300 text-xs">—</span>';
        if (m.NextInspectionDate) {
            const inspDate = new Date(m.NextInspectionDate);
            const diffDays = Math.ceil((inspDate - today) / 86400000);
            const dateStr  = inspDate.toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'2-digit' });
            if (diffDays < 0) {
                inspectionCell = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                    <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block"></span>
                    เกิน ${Math.abs(diffDays)} วัน
                </span>`;
            } else if (diffDays <= 30) {
                inspectionCell = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                    อีก ${diffDays} วัน
                </span>`;
            } else {
                inspectionCell = `<span class="text-xs text-slate-500">${dateStr}</span>`;
            }
        }

        // Compliance score badge
        const complianceScore = m.ComplianceCheckedCount > 0
            ? (() => {
                const p = m.CompliancePassCount, c = m.ComplianceCheckedCount, t = COMPLIANCE_ITEMS.length;
                const color = p === t ? 'teal' : p >= Math.ceil(t * 0.75) ? 'amber' : 'rose';
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${color}-100 text-${color}-700">${p}/${t}</span>`;
              })()
            : `<span class="text-slate-300 text-xs">—</span>`;

        // Open issues badge
        const openIssues = m.OpenIssueCount > 0
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">
                <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse inline-block"></span>${m.OpenIssueCount}
               </span>`
            : `<span class="text-slate-300 text-xs">—</span>`;

        // Detail button (all users)
        const detailBtn = `
            <button onclick="window._msdOpenDetail(${m.id}, '${_esc(m.MachineName)}')"
                class="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors" title="ดูรายละเอียด">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            </button>`;

        // File buttons — linked together, open modal with both sections
        const fileBtn = `
            <button onclick="window._msdOpenFiles(${m.id}, '${_esc(m.MachineName)}')"
                title="Safety Device Standard (${m.SafetyDeviceCount} ไฟล์)"
                class="inline-flex items-center gap-1 px-2 py-1 rounded-l-lg text-xs font-medium border-y border-l transition-colors
                ${hasSafety ? 'border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Std.${hasSafety ? ` (${m.SafetyDeviceCount})` : ''}
            </button><button onclick="window._msdOpenFiles(${m.id}, '${_esc(m.MachineName)}', 'LayoutCheckpoint')"
                title="Layout & Checkpoint (${m.LayoutCheckpointCount} ไฟล์)"
                class="inline-flex items-center gap-1 px-2 py-1 rounded-r-lg text-xs font-medium border transition-colors
                ${hasLayout ? 'border-purple-300 text-purple-600 bg-purple-50 hover:bg-purple-100' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/></svg>
                Layout${hasLayout ? ` (${m.LayoutCheckpointCount})` : ''}
            </button>`;

        const adminBtns = _isAdmin ? `
            <button onclick="window._msdOpenEdit(${m.id})"
                class="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="แก้ไข">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button onclick="window._msdDelete(${m.id}, '${_esc(m.MachineName)}')"
                class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="ลบ">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>` : '';

        const audit = _auditStatus(m);
        const auditBadge = audit.status === 'pass'
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>ผ่าน</span>`
            : audit.status === 'warn'
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700" title="${audit.hints.map(h=>h.msg).join(', ')}"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>เตือน</span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700" title="${audit.hints.map(h=>h.msg).join(', ')}"><span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block"></span>ไม่ผ่าน</span>`;
        const rowBg = audit.status === 'fail'
            ? 'style="background:rgba(254,242,242,0.55)"'
            : audit.status === 'warn'
            ? 'style="background:rgba(255,251,235,0.45)"'
            : '';

        return `<tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors ${(m.Status === 'inactive' || m.Status === 'locked') ? 'opacity-60' : ''}" ${rowBg}>
            <td class="px-4 py-3 text-sm font-mono text-slate-600 whitespace-nowrap">${m.MachineCode}</td>
            <td class="px-4 py-3 min-w-[160px]">
                <p class="text-sm font-medium text-slate-800">${m.MachineName}</p>
                ${m.Remark ? `<p class="text-xs text-slate-400 truncate max-w-[200px]">${m.Remark}</p>` : ''}
            </td>
            <td class="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">${m.Department || '—'}</td>
            <td class="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">${m.Area || '—'}</td>
            <td class="px-4 py-3 text-center">${machineSBadge}</td>
            <td class="px-4 py-3 text-center">${riskBadge}</td>
            <td class="px-4 py-3 text-center">${tickRisk}</td>
            <td class="px-4 py-3 text-center">${tick(hasSafety)}</td>
            <td class="px-4 py-3 text-center">${tick(hasLayout)}</td>
            <td class="px-4 py-3 text-center">${statusBadge}</td>
            <td class="px-4 py-3 whitespace-nowrap">${fileBtn}</td>
            <td class="px-4 py-3 text-center">${complianceScore}</td>
            <td class="px-4 py-3 text-center">${openIssues}</td>
            <td class="px-4 py-3 text-center">${auditBadge}</td>
            <td class="px-4 py-3 whitespace-nowrap">${inspectionCell}</td>
            <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">${updated}</td>
            <td class="px-4 py-3"><div class="flex items-center gap-1">${detailBtn}${adminBtns}</div></td>
        </tr>`;
    }).join('');

    const pagination = totalPages > 1 ? `
    <div class="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
        <span class="text-xs text-slate-500">
            แสดง ${(_page-1)*PAGE_SIZE+1}–${Math.min(_page*PAGE_SIZE, filtered.length)} จาก ${filtered.length} รายการ
        </span>
        <div class="flex items-center gap-1">
            <button onclick="window._msdGoPage(${_page-1})" ${_page<=1?'disabled':''} class="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            ${Array.from({length:totalPages},(_,i)=>i+1).map(p=>`
            <button onclick="window._msdGoPage(${p})"
                class="min-w-[28px] px-2 py-1.5 text-xs rounded-lg border transition-colors ${p===_page?'bg-emerald-500 text-white border-emerald-500':'border-slate-200 text-slate-500 hover:bg-slate-100'}">
                ${p}
            </button>`).join('')}
            <button onclick="window._msdGoPage(${_page+1})" ${_page>=totalPages?'disabled':''} class="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
        </div>
    </div>` : '';

    return `<table class="w-full text-left border-collapse">
        <thead>
            <tr class="bg-slate-50 border-b-2 border-slate-200">
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">รหัส</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ชื่อเครื่องจักร</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">พื้นที่</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">สถานะ</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">ความเสี่ยง</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">ประเมินความเสี่ยง</th>
                <th class="px-4 py-3 text-xs font-semibold text-blue-500 uppercase tracking-wide text-center whitespace-nowrap">Safety Device Std.</th>
                <th class="px-4 py-3 text-xs font-semibold text-purple-500 uppercase tracking-wide text-center whitespace-nowrap">Layout & Checkpoint</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">สถานะรวม</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">ไฟล์แนบ</th>
                <th class="px-4 py-3 text-xs font-semibold text-teal-500 uppercase tracking-wide text-center whitespace-nowrap">Compliance</th>
                <th class="px-4 py-3 text-xs font-semibold text-rose-500 uppercase tracking-wide text-center whitespace-nowrap">ปัญหาเปิด</th>
                <th class="px-4 py-3 text-xs font-semibold text-violet-500 uppercase tracking-wide text-center whitespace-nowrap">Audit</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">ตรวจสอบครั้งถัดไป</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">อัปเดต</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">จัดการ</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>${pagination}`;
}

// ─── Filter ───────────────────────────────────────────────────────────────────
function _getFiltered() {
    return _machines.filter(m => {
        if (_search) {
            const q = _search.toLowerCase();
            if (!m.MachineName.toLowerCase().includes(q) && !m.MachineCode.toLowerCase().includes(q)) return false;
        }
        if (_filterDept    && m.Department !== _filterDept)              return false;
        if (_filterMStatus && (m.Status || 'active') !== _filterMStatus) return false;
        if (_filterRisk    && (m.RiskLevel || 'low') !== _filterRisk)    return false;
        const hasSafety = m.SafetyDeviceCount > 0;
        const hasLayout = m.LayoutCheckpointCount > 0;
        if (_filterStatus === 'full'    && !(hasSafety && hasLayout)) return false;
        if (_filterStatus === 'partial' && hasSafety === hasLayout)   return false;
        if (_filterStatus === 'none'    && (hasSafety || hasLayout))  return false;
        if (_filterAudit && _auditStatus(m).status !== _filterAudit)  return false;
        return true;
    });
}

function _updateCount() {
    const el = document.getElementById('msd-count');
    if (el) el.textContent = `แสดง ${_getFiltered().length} / ${_machines.length} รายการ`;
}

window._msdFilter = function() {
    _search        = document.getElementById('msd-search')?.value   || '';
    _filterDept    = document.getElementById('msd-dept')?.value     || '';
    _filterStatus  = document.getElementById('msd-status')?.value   || '';
    _filterMStatus = document.getElementById('msd-mstatus')?.value  || '';
    _filterRisk    = document.getElementById('msd-risk')?.value     || '';
    _filterAudit   = document.getElementById('msd-audit')?.value    || '';
    _page = 1; // reset to first page on filter change
    const wrap = document.getElementById('msd-table-wrap');
    if (wrap) wrap.innerHTML = _renderTable();
    _updateCount();
};

window._msdSetAuditFilter = function(val) {
    _filterAudit = (_filterAudit === val) ? '' : val; // toggle off if same
    const sel = document.getElementById('msd-audit');
    if (sel) sel.value = _filterAudit;
    _page = 1;
    const wrap = document.getElementById('msd-table-wrap');
    if (wrap) wrap.innerHTML = _renderTable();
    _updateCount();
};

window._msdGoPage = function(p) {
    _page = p;
    const wrap = document.getElementById('msd-table-wrap');
    if (wrap) wrap.innerHTML = _renderTable();
    _updateCount();
};

// ─── Add / Edit Form ──────────────────────────────────────────────────────────
function _deptOptions(selected = '') {
    const all = [...new Set([..._depts, ...(_machines.map(m => m.Department).filter(Boolean))])].sort();
    return all.map(d => `<option value="${d}" ${d === selected ? 'selected' : ''}>${d}</option>`).join('');
}

function _machineFormHtml(m = {}) {
    const isEdit = !!m.id;

    const attachSection = isEdit
        ? `<div class="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3">
            <div>
                <p class="text-sm font-semibold text-slate-700">เอกสารแนบ</p>
                <p class="text-xs text-slate-400 mt-0.5">
                    Safety Device Std. <span class="font-semibold text-blue-600">${m.SafetyDeviceCount || 0}</span> ไฟล์
                    &nbsp;·&nbsp;
                    Layout & Checkpoint <span class="font-semibold text-purple-600">${m.LayoutCheckpointCount || 0}</span> ไฟล์
                </p>
            </div>
            <button type="button" onclick="window._msdOpenFiles(${m.id}, '${_esc(m.MachineName)}')"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors flex-shrink-0">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                จัดการไฟล์แนบ
            </button>
        </div>`
        : `<div class="border-t border-slate-100 pt-4 space-y-3">
            <p class="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                เอกสารแนบ <span class="text-slate-400 font-normal text-xs ml-1">(ไม่บังคับ)</span>
            </p>

            <!-- Safety Device Standard -->
            <div class="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-2">
                <p class="text-xs font-bold text-blue-600 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    Safety Device Standard
                </p>
                <input id="msd-std-label" type="text" placeholder="ชื่อ / คำอธิบายเอกสาร"
                    class="form-input w-full text-sm">
                <input id="msd-std-url" type="url" placeholder="URL ลิงก์เอกสาร (ถ้ามี)"
                    class="form-input w-full text-sm">
                <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-400 flex-shrink-0">หรืออัปโหลดไฟล์:</span>
                    <input id="msd-std-file" type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                        class="flex-1 text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-100 file:text-blue-600 hover:file:bg-blue-200 cursor-pointer">
                </div>
            </div>

            <!-- Layout & Checkpoint -->
            <div class="rounded-xl border border-purple-100 bg-purple-50/40 p-3 space-y-2">
                <p class="text-xs font-bold text-purple-600 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/></svg>
                    Layout & Checkpoint
                </p>
                <input id="msd-lay-label" type="text" placeholder="ชื่อ / คำอธิบายเอกสาร"
                    class="form-input w-full text-sm">
                <input id="msd-lay-url" type="url" placeholder="URL ลิงก์เอกสาร (ถ้ามี)"
                    class="form-input w-full text-sm">
                <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-400 flex-shrink-0">หรืออัปโหลดไฟล์:</span>
                    <input id="msd-lay-file" type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                        class="flex-1 text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-100 file:text-purple-600 hover:file:bg-purple-200 cursor-pointer">
                </div>
            </div>
        </div>`;

    return `
    <form id="msd-form" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รหัสเครื่องจักร <span class="text-red-500">*</span></label>
                <input name="MachineCode" required value="${m.MachineCode || ''}" placeholder="เช่น MC-001"
                    class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อเครื่องจักร <span class="text-red-500">*</span></label>
                <input name="MachineName" required value="${m.MachineName || ''}" placeholder="ชื่อเครื่องจักร"
                    class="form-input w-full">
            </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก</label>
                <select name="Department"
                    class="form-input w-full">
                    <option value="">— เลือกแผนก —</option>
                    ${_deptOptions(m.Department || '')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">พื้นที่ / Line</label>
                <input name="Area" value="${m.Area || ''}" placeholder="เช่น Line A, Zone 2"
                    class="form-input w-full">
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานะเครื่องจักร</label>
                <select name="Status" class="form-input w-full">
                    <option value="active"      ${(m.Status||'active')==='active'?'selected':''}>ใช้งาน</option>
                    <option value="restricted"  ${m.Status==='restricted'?'selected':''}>จำกัดการใช้งาน</option>
                    <option value="locked"      ${m.Status==='locked'?'selected':''}>ล็อคเอาต์/LOTO</option>
                    <option value="maintenance" ${m.Status==='maintenance'?'selected':''}>ซ่อมบำรุง</option>
                    <option value="inactive"    ${m.Status==='inactive'?'selected':''}>หยุดใช้งาน</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ระดับความเสี่ยง</label>
                <select name="RiskLevel" class="form-input w-full">
                    <option value="low"      ${(m.RiskLevel||'low')==='low'?'selected':''}>ต่ำ</option>
                    <option value="medium"   ${m.RiskLevel==='medium'?'selected':''}>ปานกลาง</option>
                    <option value="high"     ${m.RiskLevel==='high'?'selected':''}>สูง</option>
                    <option value="critical" ${m.RiskLevel==='critical'?'selected':''}>วิกฤต</option>
                </select>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันตรวจสอบครั้งถัดไป</label>
                <input type="date" name="NextInspectionDate"
                    value="${m.NextInspectionDate ? m.NextInspectionDate.split('T')[0] : ''}"
                    class="form-input w-full">
            </div>
            <div class="flex items-end pb-1">
                <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" name="HasRiskAssessment" ${m.HasRiskAssessment ? 'checked' : ''}
                        class="w-4 h-4 rounded accent-emerald-500">
                    <span class="text-sm text-slate-700">มีการประเมินความเสี่ยง</span>
                </label>
            </div>
        </div>

        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
            <textarea name="Remark" rows="2" placeholder="หมายเหตุเพิ่มเติม"
                class="form-textarea w-full resize-none">${m.Remark || ''}</textarea>
        </div>

        ${attachSection}

        <div id="msd-form-error" class="text-sm text-red-500 hidden"></div>

        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window._UI_closeModal()"
                class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`;
}

function _formBody(formEl) {
    const fd = new FormData(formEl);
    return {
        MachineCode:        fd.get('MachineCode'),
        MachineName:        fd.get('MachineName'),
        Department:         fd.get('Department'),
        Area:               fd.get('Area'),
        HasRiskAssessment:  fd.get('HasRiskAssessment') === 'on',
        Remark:             fd.get('Remark'),
        Status:             fd.get('Status') || 'active',
        RiskLevel:          fd.get('RiskLevel') || 'low',
        NextInspectionDate: fd.get('NextInspectionDate') || null,
    };
}

window._msdOpenAdd = function() {
    UI.openModal('เพิ่มเครื่องจักร', _machineFormHtml(), 'max-w-lg');
    setTimeout(() => {
        document.getElementById('msd-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type=submit]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'กำลังบันทึก...';
            try {
                const res = await API.post('/machine-safety', _formBody(e.target));
                const newId = res.id;

                if (newId) {
                    // Safety Device Standard — file takes priority over URL
                    const stdFile  = document.getElementById('msd-std-file')?.files?.[0];
                    const stdUrl   = document.getElementById('msd-std-url')?.value?.trim();
                    const stdLabel = document.getElementById('msd-std-label')?.value?.trim();
                    if (stdFile) {
                        submitBtn.textContent = 'กำลังอัปโหลดไฟล์ (1/2)...';
                        const fd = new FormData();
                        fd.append('file', stdFile);
                        fd.append('FileCategory', 'SafetyDeviceStandard');
                        fd.append('FileLabel', stdLabel || stdFile.name);
                        await apiFetch(`/machine-safety/${newId}/files`, { method: 'POST', body: fd });
                    } else if (stdUrl) {
                        await API.post(`/machine-safety/${newId}/links`, {
                            FileCategory: 'SafetyDeviceStandard',
                            FileLabel: stdLabel || stdUrl,
                            FileUrl: stdUrl,
                        });
                    }

                    // Layout & Checkpoint
                    const layFile  = document.getElementById('msd-lay-file')?.files?.[0];
                    const layUrl   = document.getElementById('msd-lay-url')?.value?.trim();
                    const layLabel = document.getElementById('msd-lay-label')?.value?.trim();
                    if (layFile) {
                        submitBtn.textContent = 'กำลังอัปโหลดไฟล์ (2/2)...';
                        const fd = new FormData();
                        fd.append('file', layFile);
                        fd.append('FileCategory', 'LayoutCheckpoint');
                        fd.append('FileLabel', layLabel || layFile.name);
                        await apiFetch(`/machine-safety/${newId}/files`, { method: 'POST', body: fd });
                    } else if (layUrl) {
                        await API.post(`/machine-safety/${newId}/links`, {
                            FileCategory: 'LayoutCheckpoint',
                            FileLabel: layLabel || layUrl,
                            FileUrl: layUrl,
                        });
                    }
                }

                UI.closeModal();
                UI.showToast('เพิ่มเครื่องจักรสำเร็จ', 'success');
                await _fetchMachines();
                _renderPage(document.getElementById('machine-safety-page'));
            } catch (err) {
                _showFormErr(err.message);
                submitBtn.disabled = false;
                submitBtn.textContent = 'บันทึก';
            }
        });
    }, 50);
};

window._msdOpenEdit = function(id) {
    const m = _machines.find(x => x.id === id);
    if (!m) return;
    UI.openModal('แก้ไขข้อมูลเครื่องจักร', _machineFormHtml(m));
    setTimeout(() => {
        document.getElementById('msd-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await apiFetch(`/machine-safety/${id}`, { method: 'PUT', body: JSON.stringify(_formBody(e.target)) });
                UI.closeModal();
                UI.showToast('อัปเดตสำเร็จ', 'success');
                await _fetchMachines();
                _renderPage(document.getElementById('machine-safety-page'));
            } catch (err) {
                _showFormErr(err.message);
            }
        });
    }, 50);
};

function _showFormErr(msg) {
    const el = document.getElementById('msd-form-error');
    if (el) { el.textContent = msg || 'เกิดข้อผิดพลาด'; el.classList.remove('hidden'); }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
window._msdDelete = async function(id, name) {
    const ok = await UI.showConfirmationModal('ยืนยันการลบ', `ลบเครื่องจักร "${name}" และไฟล์แนบทั้งหมดใช่หรือไม่?`);
    if (!ok) return;
    try {
        await apiFetch(`/machine-safety/${id}`, { method: 'DELETE' });
        UI.showToast('ลบสำเร็จ', 'success');
        await _fetchMachines();
        _renderPage(document.getElementById('machine-safety-page'));
    } catch (err) {
        UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

// ─── Files Modal ──────────────────────────────────────────────────────────────
// defaultTab: 'SafetyDeviceStandard' | 'LayoutCheckpoint'
window._msdOpenFiles = async function(machineId, machineName, defaultTab = 'SafetyDeviceStandard') {
    UI.openModal(`ไฟล์แนบ — ${machineName}`, `
        <div id="msd-files-body">
            <div class="flex justify-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
            </div>
        </div>`);

    const filesRes = await API.get(`/machine-safety/${machineId}/files`);
    const files    = filesRes.data || [];

    const safetyFiles  = files.filter(f => f.FileCategory === 'SafetyDeviceStandard');
    const layoutFiles  = files.filter(f => f.FileCategory === 'LayoutCheckpoint');

    const body = document.getElementById('msd-files-body');
    if (!body) return;

    body.innerHTML = `
        <!-- Tabs -->
        <div class="flex border-b border-slate-200 mb-4">
            <button id="tab-safety" onclick="window._msdSwitchTab('SafetyDeviceStandard')"
                class="px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors
                ${defaultTab==='SafetyDeviceStandard' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">
                <span class="flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    Safety Device Standard
                    <span class="ml-1 px-1.5 py-0.5 rounded-full text-xs ${safetyFiles.length ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}">${safetyFiles.length}</span>
                </span>
            </button>
            <button id="tab-layout" onclick="window._msdSwitchTab('LayoutCheckpoint')"
                class="px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors
                ${defaultTab==='LayoutCheckpoint' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">
                <span class="flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/></svg>
                    Layout & Checkpoint
                    <span class="ml-1 px-1.5 py-0.5 rounded-full text-xs ${layoutFiles.length ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-400'}">${layoutFiles.length}</span>
                </span>
            </button>
        </div>

        <!-- Tab panels -->
        <div id="panel-SafetyDeviceStandard" class="${defaultTab==='SafetyDeviceStandard'?'':'hidden'}">
            ${_fileList(safetyFiles, machineId, machineName, 'SafetyDeviceStandard')}
        </div>
        <div id="panel-LayoutCheckpoint" class="${defaultTab==='LayoutCheckpoint'?'':'hidden'}">
            ${_fileList(layoutFiles, machineId, machineName, 'LayoutCheckpoint')}
        </div>
    `;

    if (_isAdmin) _attachUploadHandlers(machineId, machineName);
};

window._msdSwitchTab = function(tab) {
    ['SafetyDeviceStandard','LayoutCheckpoint'].forEach(t => {
        const btn   = document.getElementById(t === 'SafetyDeviceStandard' ? 'tab-safety' : 'tab-layout');
        const panel = document.getElementById(`panel-${t}`);
        if (btn && panel) {
            const active = t === tab;
            panel.classList.toggle('hidden', !active);
            const color = t === 'SafetyDeviceStandard' ? 'blue' : 'purple';
            btn.className = `px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${active
                ? `border-${color}-500 text-${color}-600`
                : 'border-transparent text-slate-500 hover:text-slate-700'}`;
        }
    });
};

function _fileList(files, machineId, machineName, category) {
    const color   = category === 'SafetyDeviceStandard' ? 'blue' : 'purple';
    const catLabel = category === 'SafetyDeviceStandard' ? 'Safety Device Standard' : 'Layout & Checkpoint';

    const list = files.length === 0
        ? `<p class="text-center text-slate-400 py-6 text-sm">ยังไม่มีไฟล์ ${catLabel}</p>`
        : `<ul class="divide-y divide-slate-100 mb-4">
            ${files.map(f => `
            <li class="flex items-center justify-between py-3 gap-3">
                <div class="flex items-center gap-2 min-w-0">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-${color}-50">
                        <svg class="w-4 h-4 text-${color}-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    </div>
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-slate-700 truncate">${f.FileLabel || 'ไฟล์'}</p>
                        <p class="text-xs text-slate-400">${f.UploadedBy} · ${new Date(f.UploadedAt).toLocaleDateString('th-TH')}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <button onclick="window._msdPreviewFile('${_esc(f.FileUrl)}', '${_esc(f.FileLabel || 'ไฟล์')}')"
                        class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-slate-50 text-slate-600 hover:bg-slate-100">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        ดูตัวอย่าง
                    </button>
                    <a href="${f.FileUrl}" target="_blank" rel="noopener"
                        class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-${color}-50 text-${color}-600 hover:bg-${color}-100">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        ดาวน์โหลด
                    </a>
                    ${_isAdmin ? `<button onclick="window._msdDeleteFile(${f.id}, ${machineId}, '${_esc(machineName)}', '${category}')"
                        class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="ลบไฟล์">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>` : ''}
                </div>
            </li>`).join('')}
        </ul>`;

    const uploadForm = _isAdmin ? `
        <div class="border-t border-slate-200 pt-4">
            <p class="text-sm font-semibold text-slate-700 mb-3">อัปโหลดไฟล์ ${catLabel}</p>
            <form id="upload-form-${category}" data-category="${category}" class="space-y-3">
                <input name="FileLabel" placeholder="ชื่อ / คำอธิบาย เช่น Standard v2.1"
                    class="form-input w-full">
                <input type="file" name="file" required
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                    class="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-${color}-50 file:text-${color}-600 hover:file:bg-${color}-100">
                <div class="upload-error-${category} text-sm text-red-500 hidden"></div>
                <div class="flex justify-end">
                    <button type="submit" class="btn btn-primary px-4">อัปโหลด</button>
                </div>
            </form>
        </div>` : '';

    return list + uploadForm;
}

function _attachUploadHandlers(machineId, machineName) {
    ['SafetyDeviceStandard', 'LayoutCheckpoint'].forEach(cat => {
        const form = document.getElementById(`upload-form-${cat}`);
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            fd.append('FileCategory', cat);
            const btn = e.target.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'กำลังอัปโหลด...';
            try {
                await apiFetch(`/machine-safety/${machineId}/files`, { method: 'POST', body: fd });
                UI.showToast('อัปโหลดสำเร็จ', 'success');
                await _fetchMachines();
                window._msdOpenFiles(machineId, machineName, cat);
            } catch (err) {
                const errEl = form.querySelector(`.upload-error-${cat}`);
                if (errEl) { errEl.textContent = err.message || 'เกิดข้อผิดพลาด'; errEl.classList.remove('hidden'); }
                btn.disabled = false; btn.textContent = 'อัปโหลด';
            }
        });
    });
}

window._msdDeleteFile = async function(fileId, machineId, machineName, category) {
    const ok = await UI.showConfirmationModal('ยืนยันการลบไฟล์', 'ลบไฟล์นี้ใช่หรือไม่?');
    if (!ok) return;
    try {
        await apiFetch(`/machine-safety/files/${fileId}`, { method: 'DELETE' });
        UI.showToast('ลบไฟล์สำเร็จ', 'success');
        await _fetchMachines();
        window._msdOpenFiles(machineId, machineName, category);
    } catch (err) {
        UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

// ─── File Preview ─────────────────────────────────────────────────────────────
window._msdPreviewFile = function(url, label) {
    const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
    const isPdf   = /\.pdf(\?|$)/i.test(url) || url.includes('image/upload') && url.includes('.pdf');
    let content;
    if (isImage) {
        content = `<div class="text-center"><img src="${url}" alt="${label}" class="max-w-full rounded-lg border border-slate-200 mx-auto"></div>`;
    } else if (isPdf) {
        content = `<iframe src="${url}" class="w-full rounded-lg border border-slate-200" style="height:70vh" title="${label}"></iframe>`;
    } else {
        content = `<div class="text-center py-10 text-slate-500">
            <svg class="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <p class="text-sm mb-4">ไม่สามารถแสดงตัวอย่างไฟล์ประเภทนี้</p>
            <a href="${url}" target="_blank" rel="noopener"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style="background:linear-gradient(135deg,#059669,#0d9488)">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                ดาวน์โหลด / เปิดในแท็บใหม่
            </a>
        </div>`;
    }
    UI.openModal(label, content, 'max-w-3xl');
};

// ─── Machine Detail Modal (Compliance | Issues | Files) ───────────────────────
window._msdOpenDetail = async function(machineId, machineName) {
    UI.openModal(`รายละเอียด — ${machineName}`, `
        <div id="msd-detail-body">
            <div class="flex justify-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
            </div>
        </div>`, 'max-w-2xl');

    try {
        const [compRes, issueRes, filesRes] = await Promise.all([
            API.get(`/machine-safety/${machineId}/compliance`),
            API.get(`/machine-safety/${machineId}/issues`),
            API.get(`/machine-safety/${machineId}/files`),
        ]);
        const complianceData = compRes.data  || [];
        const issuesData     = issueRes.data || [];
        const filesData      = filesRes.data || [];
        const openCount      = issuesData.filter(i => i.Status === 'open').length;

        const body = document.getElementById('msd-detail-body');
        if (!body) return;

        body.innerHTML = `
            <div class="flex border-b border-slate-200 mb-4">
                <button id="dtab-compliance" onclick="window._msdDetailTab('compliance')"
                    class="px-4 py-2.5 text-sm font-semibold border-b-2 border-teal-500 text-teal-600 transition-colors">
                    Compliance (5.1–5.8)
                </button>
                <button id="dtab-issues" onclick="window._msdDetailTab('issues')"
                    class="px-4 py-2.5 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition-colors">
                    ปัญหา${openCount > 0 ? `<span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-600">${openCount}</span>` : ''}
                </button>
                <button id="dtab-files" onclick="window._msdDetailTab('files')"
                    class="px-4 py-2.5 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition-colors">
                    ไฟล์แนบ<span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-500">${filesData.length}</span>
                </button>
            </div>
            <div id="dpanel-compliance">${_renderCompliancePanel(machineId, complianceData)}</div>
            <div id="dpanel-issues" class="hidden">${_renderIssuesPanel(machineId, machineName, issuesData)}</div>
            <div id="dpanel-files" class="hidden">${_renderDetailFilesPanel(machineId, machineName, filesData)}</div>
        `;

        if (_isAdmin) {
            _attachComplianceSave(machineId);
            _attachIssueAddHandler(machineId, machineName);
        }
        _attachUploadHandlers(machineId, machineName);
    } catch (err) {
        const body = document.getElementById('msd-detail-body');
        if (body) body.innerHTML = `<p class="text-red-500 text-sm text-center py-8">${err.message}</p>`;
    }
};

window._msdDetailTab = function(tab) {
    ['compliance', 'issues', 'files'].forEach(t => {
        const btn   = document.getElementById(`dtab-${t}`);
        const panel = document.getElementById(`dpanel-${t}`);
        if (!btn || !panel) return;
        const active = t === tab;
        panel.classList.toggle('hidden', !active);
        btn.className = `px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${active
            ? 'border-teal-500 text-teal-600'
            : 'border-transparent text-slate-500 hover:text-slate-700'}`;
    });
};

function _renderCompliancePanel(machineId, items) {
    const compMap = Object.fromEntries(items.map(r => [r.ItemCode, r]));
    const passCount = items.filter(r => r.Status === 'pass').length;
    const totalCount = COMPLIANCE_ITEMS.length;

    const summary = passCount === totalCount
        ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>ผ่านทุกข้อ (${totalCount}/${totalCount})</span>`
        : `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">${passCount}/${totalCount} ข้อผ่าน</span>`;

    const rows = COMPLIANCE_ITEMS.map(ci => {
        const row    = compMap[ci.code] || { ItemCode: ci.code, Status: 'na' };
        const sc     = row.Status === 'pass' ? 'emerald' : row.Status === 'fail' ? 'red' : 'slate';
        const slabel = row.Status === 'pass' ? 'ผ่าน' : row.Status === 'fail' ? 'ไม่ผ่าน' : 'N/A';
        const checkedInfo = row.UpdatedBy
            ? `<span class="text-[10px] text-slate-400 ml-2">${row.UpdatedBy}</span>`
            : '';
        const adminInputs = _isAdmin
            ? `<div class="flex items-center gap-3 flex-shrink-0">
                ${['pass', 'fail', 'na'].map(s => `
                <label class="flex items-center gap-1 cursor-pointer text-xs">
                    <input type="radio" name="comp-${ci.code}" value="${s}" ${row.Status === s ? 'checked' : ''}
                        class="accent-${s === 'pass' ? 'emerald' : s === 'fail' ? 'red' : 'slate'}-500">
                    <span class="${s === 'pass' ? 'text-emerald-600' : s === 'fail' ? 'text-red-600' : 'text-slate-400'}">${s === 'pass' ? 'ผ่าน' : s === 'fail' ? 'ไม่ผ่าน' : 'N/A'}</span>
                </label>`).join('')}
               </div>`
            : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${sc}-100 text-${sc}-700 flex-shrink-0">${slabel}</span>`;
        return `<li class="flex items-center py-2.5 gap-3 border-b border-slate-100 last:border-0">
            <span class="text-[11px] font-bold text-teal-600 w-8 flex-shrink-0">${ci.code}</span>
            <span class="text-sm text-slate-700 flex-1 min-w-0">${ci.label}${checkedInfo}</span>
            ${adminInputs}
        </li>`;
    }).join('');

    const saveBtn = _isAdmin
        ? `<div class="mt-4 flex items-center justify-between">
              <span class="text-xs text-slate-400">เลือกสถานะแต่ละข้อแล้วกดบันทึก</span>
              <button id="btn-save-compliance" class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
                  style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก Compliance</button>
           </div>`
        : '';

    return `<div class="flex items-center justify-between mb-3"><span class="text-sm font-semibold text-slate-700">ข้อกำหนดความปลอดภัยเครื่องจักร</span>${summary}</div>
        <ul class="divide-y divide-slate-100">${rows}</ul>${saveBtn}`;
}

function _attachComplianceSave(machineId) {
    const btn = document.getElementById('btn-save-compliance');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const items = COMPLIANCE_ITEMS.map(ci => {
            const sel = document.querySelector(`input[name="comp-${ci.code}"]:checked`);
            return { ItemCode: ci.code, Status: sel ? sel.value : 'na' };
        });
        btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
        try {
            await API.put(`/machine-safety/${machineId}/compliance`, { items });
            UI.showToast('บันทึก Compliance สำเร็จ', 'success');
            await _fetchMachines();
            const wrap = document.getElementById('msd-table-wrap');
            if (wrap) wrap.innerHTML = _renderTable();
        } catch (err) {
            UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
        } finally {
            btn.disabled = false; btn.textContent = 'บันทึก Compliance';
        }
    });
}

function _renderIssuesPanel(machineId, machineName, issues) {
    const SEV_COLOR = { low: 'slate', medium: 'amber', high: 'orange', critical: 'red' };
    const SEV_LABEL = { low: 'ต่ำ', medium: 'ปานกลาง', high: 'สูง', critical: 'วิกฤต' };

    const list = issues.length === 0
        ? `<p class="text-center text-slate-400 py-6 text-sm">ยังไม่มีปัญหาที่บันทึก</p>`
        : `<ul class="divide-y divide-slate-100 mb-4">
            ${issues.map(iss => {
                const sc = iss.Status === 'open' ? 'rose' : 'emerald';
                const rc = SEV_COLOR[iss.Severity] || 'slate';
                const resolveRow = (_isAdmin && iss.Status === 'open') ? `
                    <div class="flex items-center gap-2 mt-2">
                        <input id="res-text-${iss.id}" type="text" placeholder="บันทึกวิธีแก้ไข (ไม่บังคับ)..."
                            class="form-input flex-1 text-xs py-1">
                        <button onclick="window._msdResolveIssue(${iss.id}, ${machineId}, '${_esc(machineName)}')"
                            class="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors whitespace-nowrap">
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                            แก้ไขแล้ว
                        </button>
                        <button onclick="window._msdDeleteIssue(${iss.id}, ${machineId}, '${_esc(machineName)}')"
                            class="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="ลบ">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>` : '';
                return `<li class="py-3 space-y-1">
                    <div class="flex items-start justify-between gap-2">
                        <p class="text-sm text-slate-800 flex-1">${iss.Description}</p>
                        <div class="flex items-center gap-1.5 flex-shrink-0">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${rc}-100 text-${rc}-700">${SEV_LABEL[iss.Severity] || iss.Severity}</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${sc}-100 text-${sc}-700">${iss.Status === 'open' ? 'เปิด' : 'แก้ไขแล้ว'}</span>
                        </div>
                    </div>
                    ${iss.Resolution ? `<p class="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">การแก้ไข: ${iss.Resolution}</p>` : ''}
                    <p class="text-[10px] text-slate-400">${iss.CreatedBy || '—'} · ${new Date(iss.CreatedAt).toLocaleDateString('th-TH')}</p>
                    ${resolveRow}
                </li>`;
            }).join('')}
           </ul>`;

    const addForm = _isAdmin ? `
        <div class="border-t border-slate-200 pt-4 space-y-2">
            <p class="text-sm font-semibold text-slate-700">เพิ่มปัญหาใหม่</p>
            <textarea id="new-issue-desc" rows="2" placeholder="รายละเอียดปัญหา..."
                class="form-textarea w-full resize-none text-sm"></textarea>
            <div class="flex items-center gap-2">
                <select id="new-issue-sev" class="form-input text-sm flex-1">
                    <option value="low">ต่ำ</option>
                    <option value="medium" selected>ปานกลาง</option>
                    <option value="high">สูง</option>
                    <option value="critical">วิกฤต</option>
                </select>
                <button id="btn-add-issue" class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
                    style="background:linear-gradient(135deg,#059669,#0d9488)">เพิ่มปัญหา</button>
            </div>
            <div id="issue-add-error" class="text-sm text-red-500 hidden"></div>
        </div>` : '';

    return list + addForm;
}

function _attachIssueAddHandler(machineId, machineName) {
    const btn = document.getElementById('btn-add-issue');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const desc  = document.getElementById('new-issue-desc')?.value?.trim();
        const sev   = document.getElementById('new-issue-sev')?.value || 'medium';
        const errEl = document.getElementById('issue-add-error');
        if (!desc) {
            if (errEl) { errEl.textContent = 'กรุณาระบุรายละเอียด'; errEl.classList.remove('hidden'); }
            return;
        }
        btn.disabled = true;
        try {
            await API.post(`/machine-safety/${machineId}/issues`, { Description: desc, Severity: sev });
            UI.showToast('เพิ่มปัญหาสำเร็จ', 'success');
            await _fetchMachines();
            window._msdOpenDetail(machineId, machineName);
        } catch (err) {
            if (errEl) { errEl.textContent = err.message || 'เกิดข้อผิดพลาด'; errEl.classList.remove('hidden'); }
            btn.disabled = false;
        }
    });
}

window._msdResolveIssue = async function(issueId, machineId, machineName) {
    const resolution = document.getElementById(`res-text-${issueId}`)?.value?.trim() || '';
    try {
        await apiFetch(`/machine-safety/issues/${issueId}`, {
            method: 'PUT',
            body: JSON.stringify({ Status: 'resolved', Resolution: resolution }),
        });
        UI.showToast('อัปเดตสำเร็จ', 'success');
        await _fetchMachines();
        window._msdOpenDetail(machineId, machineName);
    } catch (err) {
        UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

window._msdDeleteIssue = async function(issueId, machineId, machineName) {
    const ok = await UI.showConfirmationModal('ยืนยันการลบ', 'ลบรายการปัญหานี้ใช่หรือไม่?');
    if (!ok) return;
    try {
        await apiFetch(`/machine-safety/issues/${issueId}`, { method: 'DELETE' });
        UI.showToast('ลบสำเร็จ', 'success');
        await _fetchMachines();
        window._msdOpenDetail(machineId, machineName);
    } catch (err) {
        UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

function _renderDetailFilesPanel(machineId, machineName, files) {
    const safetyFiles = files.filter(f => f.FileCategory === 'SafetyDeviceStandard');
    const layoutFiles = files.filter(f => f.FileCategory === 'LayoutCheckpoint');
    return `
        <p class="text-xs font-bold text-blue-600 mb-2">Safety Device Standard (${safetyFiles.length})</p>
        ${_fileList(safetyFiles, machineId, machineName, 'SafetyDeviceStandard')}
        <p class="text-xs font-bold text-purple-600 mb-2 mt-5">Layout &amp; Checkpoint (${layoutFiles.length})</p>
        ${_fileList(layoutFiles, machineId, machineName, 'LayoutCheckpoint')}
    `;
}

// ─── Export Excel ─────────────────────────────────────────────────────────────
window._msdExportExcel = function() {
    if (typeof XLSX === 'undefined') { UI.showToast('ไลบรารี Excel ยังโหลดไม่เสร็จ', 'error'); return; }
    const today = new Date(); today.setHours(0,0,0,0);
    const rows = _getFiltered().map(m => {
        const inspDate = m.NextInspectionDate ? new Date(m.NextInspectionDate) : null;
        const diffDays = inspDate ? Math.ceil((inspDate - today) / 86400000) : null;
        return {
            'รหัส':              m.MachineCode,
            'ชื่อเครื่องจักร':    m.MachineName,
            'แผนก':              m.Department || '',
            'พื้นที่':            m.Area || '',
            'สถานะ':             STATUS_META[m.Status || 'active']?.label || '',
            'ระดับความเสี่ยง':   RISK_META[m.RiskLevel || 'low']?.label || '',
            'ประเมินความเสี่ยง': m.HasRiskAssessment ? 'มี' : 'ไม่มี',
            'Safety Device Std.': m.SafetyDeviceCount || 0,
            'Layout & Checkpoint': m.LayoutCheckpointCount || 0,
            'สถานะเอกสาร':      (m.SafetyDeviceCount > 0 && m.LayoutCheckpointCount > 0) ? 'ครบ' : (m.SafetyDeviceCount > 0 || m.LayoutCheckpointCount > 0) ? 'บางส่วน' : 'ยังไม่มี',
            'Compliance (5.1-5.8)': m.CompliancePassCount != null ? `${m.CompliancePassCount}/${COMPLIANCE_ITEMS.length}` : '—',
            'ปัญหาเปิด':         m.OpenIssueCount || 0,
            'วันตรวจสอบถัดไป':   m.NextInspectionDate ? m.NextInspectionDate.split('T')[0] : '',
            'สถานะการตรวจสอบ':   diffDays === null ? '' : diffDays < 0 ? `เกิน ${Math.abs(diffDays)} วัน` : diffDays <= 30 ? `อีก ${diffDays} วัน` : 'ปกติ',
            'หมายเหตุ':          m.Remark || '',
        };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Machine_Safety');
    XLSX.writeFile(wb, `MachineSafety_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    UI.showToast(`ส่งออก ${rows.length} รายการสำเร็จ`, 'success');
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
window._UI_closeModal = () => UI.closeModal();

function _esc(str) {
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
