import { guardActionHandler, guardSubmitHandler, installWindowActionLocks } from '../utils/async-ui.js?v=20260715-phase32d-remaining-async-ux';
// public/js/pages/machine-safety.js
import { API, apiFetch } from '../api.js';
import * as UI from '../ui.js?v=20260611-machine-doc-urlfix';

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
let _areas         = [];
let _employees     = [];
let _search        = '';
let _filterDept    = '';
let _filterStatus  = '';
let _filterRisk    = '';
let _filterMStatus = '';
let _filterAudit   = '';
let _filterInspection = '';
let _viewMode      = 'list';
let _isAdmin       = false;
let _page          = 1;
let _loadError     = '';
let _msdCardSaveHold = null;
let _msdCardSaveMenu = null;
let _msdCardImageListenersReady = false;

function _msdDefaultViewMode() {
    return window.matchMedia?.('(max-width: 767px)').matches ? 'card' : 'list';
}

function _errText(err, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง') {
    return err?.message || err?.error || fallback;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
export async function loadMachineSafetyPage() {
    const container = document.getElementById('machine-safety-page');
    if (!container) return;

    const user = TSHSession.getUser();
    _isAdmin = String(user?.role || user?.Role || '').toLowerCase() === 'admin';
    _viewMode = _msdDefaultViewMode();
    _setupCardImageExportListeners();

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400">
            <div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <p class="text-sm">กำลังโหลดข้อมูล...</p>
        </div>`;

    await Promise.all([_fetchMachines(), _fetchDepts(), _fetchAreas(), _fetchEmployees()]);
    try {
        const _inFilter = JSON.parse(sessionStorage.getItem('pending_filter_machine-safety') || 'null');
        if (_inFilter) {
            sessionStorage.removeItem('pending_filter_machine-safety');
            if (_inFilter.dept) _filterDept = _inFilter.dept;
            if (_inFilter.status) _filterMStatus = _inFilter.status;
            if (_inFilter.risk) _filterRisk = _inFilter.risk;
            if (_inFilter.audit) _filterAudit = _inFilter.audit;
            if (_inFilter.inspection) _filterInspection = _inFilter.inspection;
            _page = 1;
        }
    } catch (_) {}
    _renderPage(container);
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function _fetchMachines() {
    try {
        const res = await API.get('/machine-safety');
        _machines = res.data || [];
        _loadError = '';
    } catch (err) {
        _machines = [];
        _loadError = _errText(err, 'ไม่สามารถโหลดข้อมูลเครื่องจักรได้');
    }
}

async function _fetchDepts() {
    try {
        const res = await API.get('/master/departments');
        _depts = (res.data || []).map(d => d.Name);
    } catch { _depts = []; }
}

async function _fetchAreas() {
    try {
        const res = await API.get('/master/areas');
        _areas = (res.data || []).map(a => a.Name || a.AreaName || a.Code).filter(Boolean);
    } catch { _areas = []; }
}

async function _fetchEmployees() {
    try {
        const res = await API.get('/employees');
        _employees = (res.data || []).filter(e => e.EmployeeID || e.EmployeeName);
    } catch { _employees = []; }
}

function _setupCardImageExportListeners() {
    if (_msdCardImageListenersReady) return;
    _msdCardImageListenersReady = true;

    document.addEventListener('click', e => {
        const action = e.target?.closest?.('[data-msd-card-save-action]');
        if (action && _msdCardSaveMenu?.card) {
            const card = _msdCardSaveMenu.card;
            _hideCardImageMenu();
            _downloadCardImage(card);
            return;
        }
        if (!e.target?.closest?.('#msd-card-save-menu')) _hideCardImageMenu();
    });
    document.addEventListener('contextmenu', _showCardContextMenu);
    document.addEventListener('pointerdown', _startCardImageHold);
    document.addEventListener('pointermove', _moveCardImageHold);
    document.addEventListener('pointerup', _cancelCardImageHold);
    document.addEventListener('pointercancel', _cancelCardImageHold);
}

function _showCardContextMenu(event) {
    const card = event.target?.closest?.('[data-msd-card-image]');
    if (!card || !document.getElementById('machine-safety-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"]')) return;
    event.preventDefault();
    _showCardImageMenu(card, event.clientX, event.clientY);
}

function _startCardImageHold(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const card = event.target?.closest?.('[data-msd-card-image]');
    if (!card || !document.getElementById('machine-safety-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"]')) return;
    _cancelCardImageHold();
    _msdCardSaveHold = {
        card,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
            if (!_msdCardSaveHold || _msdCardSaveHold.card !== card) return;
            _showCardImageMenu(card, _msdCardSaveHold.x, _msdCardSaveHold.y);
        }, 800),
    };
}

function _moveCardImageHold(event) {
    if (!_msdCardSaveHold || event.pointerId !== _msdCardSaveHold.pointerId) return;
    if (Math.abs(event.clientX - _msdCardSaveHold.x) > 10 || Math.abs(event.clientY - _msdCardSaveHold.y) > 10) {
        _cancelCardImageHold();
    }
}

function _cancelCardImageHold() {
    if (_msdCardSaveHold?.timer) clearTimeout(_msdCardSaveHold.timer);
    _msdCardSaveHold = null;
}

function _showCardImageMenu(card, clientX, clientY) {
    _hideCardImageMenu();
    const menu = document.createElement('div');
    menu.id = 'msd-card-save-menu';
    menu.className = 'fixed z-[9999] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl';
    menu.style.minWidth = '170px';
    menu.innerHTML = `
        <button type="button" data-msd-card-save-action
            class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-black text-slate-700 hover:bg-emerald-50 hover:text-emerald-700">
            <svg class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m4 7H5a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2z"/>
            </svg>
            บันทึกเป็นรูปภาพ
        </button>`;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const left = Math.min(Math.max(8, clientX), window.innerWidth - rect.width - 8);
    const top = Math.min(Math.max(8, clientY), window.innerHeight - rect.height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    _msdCardSaveMenu = { card, menu };
}

function _hideCardImageMenu() {
    _msdCardSaveMenu?.menu?.remove?.();
    _msdCardSaveMenu = null;
}

async function _downloadCardImage(card) {
    if (typeof html2canvas === 'undefined') {
        UI.showToast('ไม่พบ library สำหรับบันทึกรูปภาพ', 'error');
        return;
    }
    const name = _safeFilePart(card.dataset.msdCardImage || 'machine-safety-card');
    try {
        UI.showLoading('Saving card image...');
        const canvas = await html2canvas(card, {
            backgroundColor: '#ffffff',
            scale: Math.min(2, window.devicePixelRatio || 1.5),
            useCORS: true,
            logging: false,
            onclone: doc => {
                doc.querySelectorAll('[data-msd-card-ignore]').forEach(el => { el.style.display = 'none'; });
                doc.querySelectorAll('[data-msd-card-image]').forEach(el => {
                    el.style.boxShadow = 'none';
                    el.style.transform = 'none';
                });
            },
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${name}-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        UI.showToast('บันทึกรูปภาพการ์ดแล้ว', 'success');
    } catch (err) {
        UI.showToast(_errText(err, 'บันทึกรูปภาพการ์ดไม่สำเร็จ'), 'error');
    } finally {
        UI.hideLoading();
    }
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
    if (_loadError) {
        container.innerHTML = `
        <div class="ds-section p-8 text-center">
            <div class="w-12 h-12 mx-auto rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-3">
                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
            </div>
            <p class="text-sm font-bold text-slate-700">โหลดข้อมูล Machine & Device Safety ไม่สำเร็จ</p>
            <p class="text-xs text-slate-400 mt-1">${UI.escHtml(_loadError)}</p>
            <button onclick="window._msdReload()" class="btn btn-primary mt-4 px-4">ลองโหลดใหม่</button>
        </div>`;
        return;
    }

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
    const highRisk = _machines.filter(m => ['high', 'critical'].includes(m.RiskLevel || '')).length;
    const restricted = _machines.filter(m => ['restricted', 'locked'].includes(m.Status || '')).length;
    const riskReady = _machines.filter(m => m.HasRiskAssessment).length;
    const openIssues = _machines.reduce((sum, m) => sum + (parseInt(m.OpenIssueCount) || 0), 0);
    const activeFilterCount = [
        _filterDept,
        _filterStatus,
        _filterMStatus,
        _filterRisk,
        _filterAudit,
        _filterInspection,
    ].filter(Boolean).length;

    // Audit readiness across all machines
    const auditMap  = _machines.reduce((acc, m) => { acc[_auditStatus(m).status]++; return acc; }, { pass: 0, warn: 0, fail: 0 });
    const auditPct  = total ? Math.round(auditMap.pass * 100 / total) : 0;
    // Top hints — aggregate hint messages by frequency
    const hintFreq  = {};
    _machines.forEach(m => _auditStatus(m).hints.forEach(h => { hintFreq[h.msg] = (hintFreq[h.msg] || 0) + 1; }));
    const topHints  = Object.entries(hintFreq).sort((a, b) => b[1] - a[1]).slice(0, 4);

    container.innerHTML = `
    <div class="msd-page-shell space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl mb-2" data-msd-card-image="machine-safety-hero" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
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
                    <div class="flex items-center gap-2 flex-wrap justify-end flex-shrink-0" data-msd-card-ignore>
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
        <div class="msd-compliance-summary ds-section p-4 flex items-center gap-4" data-msd-card-image="machine-safety-document-compliance">
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
        <div class="bg-white rounded-xl border shadow-sm p-4 ${auditPct >= 80 ? 'border-emerald-200' : auditPct >= 50 ? 'border-amber-200' : 'border-red-200'}" data-msd-card-image="machine-safety-audit-readiness">
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
                    <div class="flex flex-wrap gap-3 mb-2.5" data-msd-card-ignore>
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
        <div class="ds-section p-5" data-msd-card-image="machine-safety-dept-compliance-chart">
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
        <div class="msd-filter-grid ds-filter-bar">
            <div class="msd-filter-search relative">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                <input id="msd-search" type="text" placeholder="ค้นหาชื่อ / รหัสเครื่องจักร..."
                    value="${_search}"
                    class="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    oninput="window._msdFilter()">
            </div>
            <button type="button" class="msd-mobile-filter-toggle" aria-expanded="false"
                onclick="window._msdToggleFilters(this)">
                <span>ตัวกรองเพิ่มเติม${activeFilterCount ? ` (${activeFilterCount})` : ''}</span>
                <svg class="w-4 h-4 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </button>
            <select id="msd-dept" class="msd-filter-advanced msd-filter-control text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">ทุกแผนก</option>
                ${[...new Set(_machines.map(m => m.Department).filter(Boolean))].sort()
                    .map(d => `<option value="${UI.escHtml(d)}" ${_filterDept===d?'selected':''}>${UI.escHtml(d)}</option>`).join('')}
            </select>
            <select id="msd-status" class="msd-filter-advanced msd-filter-control text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">เอกสาร: ทุกสถานะ</option>
                <option value="full"    ${_filterStatus==='full'?'selected':''}>ครบทั้ง 2 รายการ</option>
                <option value="partial" ${_filterStatus==='partial'?'selected':''}>มีบางส่วน</option>
                <option value="none"    ${_filterStatus==='none'?'selected':''}>ยังไม่มีเลย</option>
            </select>
            <select id="msd-mstatus" class="msd-filter-advanced msd-filter-control text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">สถานะเครื่อง: ทั้งหมด</option>
                <option value="active"      ${_filterMStatus==='active'?'selected':''}>ใช้งาน</option>
                <option value="restricted"  ${_filterMStatus==='restricted'?'selected':''}>จำกัดการใช้งาน</option>
                <option value="locked"      ${_filterMStatus==='locked'?'selected':''}>ล็อคเอาต์/LOTO</option>
                <option value="maintenance" ${_filterMStatus==='maintenance'?'selected':''}>ซ่อมบำรุง</option>
                <option value="inactive"    ${_filterMStatus==='inactive'?'selected':''}>หยุดใช้งาน</option>
            </select>
            <select id="msd-risk" class="msd-filter-advanced msd-filter-control text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">ความเสี่ยง: ทั้งหมด</option>
                <option value="critical" ${_filterRisk==='critical'?'selected':''}>วิกฤต</option>
                <option value="high"     ${_filterRisk==='high'?'selected':''}>สูง</option>
                <option value="medium"   ${_filterRisk==='medium'?'selected':''}>ปานกลาง</option>
                <option value="low"      ${_filterRisk==='low'?'selected':''}>ต่ำ</option>
            </select>
            <select id="msd-audit" class="msd-filter-advanced msd-filter-control text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">Audit: ทั้งหมด</option>
                <option value="pass" ${_filterAudit==='pass'?'selected':''}>ผ่าน</option>
                <option value="warn" ${_filterAudit==='warn'?'selected':''}>เตือน</option>
                <option value="fail" ${_filterAudit==='fail'?'selected':''}>ไม่ผ่าน</option>
            </select>
            <select id="msd-inspection" class="msd-filter-advanced msd-filter-control text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">Inspection: ทั้งหมด</option>
                <option value="due" ${_filterInspection==='due'?'selected':''}>Due Soon</option>
                <option value="overdue" ${_filterInspection==='overdue'?'selected':''}>Overdue</option>
            </select>
            ${_isAdmin ? `<span class="msd-filter-docno inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700">
                ลำดับถัดไป <span class="font-mono">${_nextDocumentNo()}</span>
            </span>` : ''}
            <div class="msd-view-toggle inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
                <button type="button" onclick="window._msdSetView('list')"
                    aria-pressed="${_viewMode === 'list'}"
                    class="px-3 py-2 text-xs font-semibold ${_viewMode === 'list' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-slate-50'}">List</button>
                <button type="button" onclick="window._msdSetView('card')"
                    aria-pressed="${_viewMode === 'card'}"
                    class="px-3 py-2 text-xs font-semibold border-l border-slate-200 ${_viewMode === 'card' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-slate-50'}">Card</button>
            </div>
            <span id="msd-count" class="msd-filter-count text-xs text-slate-400"></span>
        </div>

        <!-- Table -->
        <div class="msd-results-shell ds-table-wrap" data-msd-card-image="machine-safety-document-list">
            <div id="msd-table-wrap" class="msd-results-scroll">
                ${_renderTable()}
            </div>
        </div>

    </div>`;

    _updateCount();
    requestAnimationFrame(_drawDeptChart);
}

window._msdReload = async function() {
    const container = document.getElementById('machine-safety-page');
    if (!container) return;
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400">
            <div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <p class="text-sm">กำลังโหลดข้อมูล...</p>
        </div>`;
    await Promise.all([_fetchMachines(), _fetchDepts(), _fetchAreas(), _fetchEmployees()]);
    _renderPage(container);
};

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

    if (_viewMode === 'card' && filtered.length > 0) {
        return _renderCardView(filtered, paginated, totalPages);
    }

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
            <button onclick="window._msdOpenDetail(${m.id}, ${_jsArg(m.MachineName)})"
                class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors text-xs font-semibold" title="จัดการรายละเอียด">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                <span>จัดการ</span>
            </button>`;

        // File buttons — linked together, open modal with both sections
        const fileBtn = `
            <button onclick="window._msdOpenFiles(${m.id}, ${_jsArg(m.MachineName)})"
                title="Safety Device Standard (${m.SafetyDeviceCount} ไฟล์)"
                class="inline-flex items-center gap-1 px-2 py-1 rounded-l-lg text-xs font-medium border-y border-l transition-colors
                ${hasSafety ? 'border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Std.${hasSafety ? ` (${m.SafetyDeviceCount})` : ''}
            </button><button onclick="window._msdOpenFiles(${m.id}, ${_jsArg(m.MachineName)}, 'LayoutCheckpoint')"
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
            <button onclick="window._msdDelete(${m.id}, ${_jsArg(m.MachineName)})"
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

        const documentPct = isFull ? 100 : isPartial ? 50 : 0;
        const documentTone = documentPct === 100
            ? 'bg-emerald-100 text-emerald-700'
            : documentPct > 0
            ? 'bg-amber-100 text-amber-700'
            : 'bg-slate-100 text-slate-500';
        const rowLabel = `ดูรายละเอียด ${m.MachineCode || ''} ${m.MachineName || ''}`.trim();

        return `<tr class="msd-clickable-row border-b border-slate-100 transition-colors ${(m.Status === 'inactive' || m.Status === 'locked') ? 'opacity-60' : ''}"
            tabindex="0" role="button" aria-label="${UI.escHtml(rowLabel)}"
            onclick="window._msdOpenDetail(${m.id}, ${_jsArg(m.MachineName)})"
            onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window._msdOpenDetail(${m.id}, ${_jsArg(m.MachineName)})}" ${rowBg}>
            <td class="msd-machine-cell px-3 py-3">
                <p class="text-xs font-mono font-semibold text-emerald-700 whitespace-nowrap">${UI.escHtml(m.MachineCode || '-')}</p>
                <p class="mt-0.5 text-sm font-semibold text-slate-800 truncate" title="${UI.escHtml(m.MachineName || '')}">${UI.escHtml(m.MachineName || '-')}</p>
                ${m.EffectiveDate ? `<p class="mt-0.5 text-[11px] text-emerald-600">บังคับใช้ ${_dateOnly(m.EffectiveDate)}</p>` : ''}
            </td>
            <td class="px-3 py-3 min-w-0">
                <p class="text-xs font-semibold text-slate-700 truncate" title="${UI.escHtml(m.Department || '')}">${UI.escHtml(m.Department || '-')}</p>
                <p class="mt-1 text-[11px] text-slate-400 truncate" title="${UI.escHtml(m.Area || '')}">${UI.escHtml(m.Area || 'ไม่ระบุพื้นที่')}</p>
            </td>
            <td class="px-3 py-3">
                <div class="flex flex-col items-start gap-1.5">${machineSBadge}${riskBadge}</div>
            </td>
            <td class="px-3 py-3">
                <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${documentTone}">เอกสาร ${documentPct}%</span>
                            ${auditBadge}
                            ${m.OpenIssueCount > 0 ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">${m.OpenIssueCount} ปัญหา</span>` : ''}
                        </div>
                        <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                            <span>ตรวจครั้งถัดไป: ${inspectionCell}</span>
                            <span>อัปเดต ${updated}</span>
                        </div>
                    </div>
                    <div class="msd-row-open-hint flex-shrink-0 text-right">
                        <svg class="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                        <span class="sr-only">เปิดรายละเอียด</span>
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');

    const pagination = totalPages > 1 ? `
    <div class="msd-pagination flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
        <span class="text-xs text-slate-500">
            แสดง ${(_page-1)*PAGE_SIZE+1}–${Math.min(_page*PAGE_SIZE, filtered.length)} จาก ${filtered.length} รายการ
        </span>
        <div class="flex items-center gap-1">
            <button onclick="window._msdGoPage(${_page-1})" ${_page<=1?'disabled':''} class="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <span class="px-3 py-1.5 text-xs font-semibold text-slate-500">Page ${_page} / ${totalPages}</span>
            <button onclick="window._msdGoPage(${_page+1})" ${_page>=totalPages?'disabled':''} class="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
        </div>
    </div>` : '';

    return `<table class="msd-data-table ds-table text-left border-collapse">
        <colgroup>
            <col style="width:32%">
            <col style="width:24%">
            <col style="width:17%">
            <col style="width:27%">
        </colgroup>
        <thead>
            <tr class="bg-slate-50 border-b-2 border-slate-200">
                <th class="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">เครื่องจักร</th>
                <th class="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก / พื้นที่</th>
                <th class="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">สถานะ / ความเสี่ยง</th>
                <th class="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ภาพรวมความพร้อม</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>${pagination}`;
}

function _renderCardView(filtered, paginated, totalPages) {
    const pagination = totalPages > 1 ? `
    <div class="msd-pagination flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
        <span class="text-xs text-slate-500">
            แสดง ${(_page-1)*PAGE_SIZE+1}-${Math.min(_page*PAGE_SIZE, filtered.length)} จาก ${filtered.length} รายการ
        </span>
        <div class="flex items-center gap-1">
            <button onclick="window._msdGoPage(${_page-1})" ${_page<=1?'disabled':''} class="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <span class="px-3 py-1.5 text-xs font-semibold text-slate-500">Page ${_page} / ${totalPages}</span>
            <button onclick="window._msdGoPage(${_page+1})" ${_page>=totalPages?'disabled':''} class="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
        </div>
    </div>` : '';

    const cards = paginated.map(m => {
        const hasSafety = m.SafetyDeviceCount > 0;
        const hasLayout = m.LayoutCheckpointCount > 0;
        const sm = STATUS_META[m.Status || 'active'] || STATUS_META.active;
        const rm = RISK_META[m.RiskLevel || 'low'] || RISK_META.low;
        const audit = _auditStatus(m);
        const auditClass = audit.status === 'pass'
            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
            : audit.status === 'warn'
            ? 'bg-amber-100 text-amber-700 border-amber-200'
            : 'bg-red-100 text-red-700 border-red-200';
        const auditLabel = audit.status === 'pass' ? 'ผ่าน' : audit.status === 'warn' ? 'เตือน' : 'ไม่ผ่าน';
        const updated = m.UpdatedAt
            ? new Date(m.UpdatedAt).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'2-digit' })
            : '-';
        const completion = hasSafety && hasLayout ? 100 : hasSafety || hasLayout ? 50 : 0;
        const adminBtns = _isAdmin ? `
            <button onclick="window._msdOpenEdit(${m.id})" class="p-2 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="แก้ไข">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button onclick="window._msdDelete(${m.id}, ${_jsArg(m.MachineName)})" class="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="ลบ">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>` : '';

        return `<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all ${(m.Status === 'inactive' || m.Status === 'locked') ? 'opacity-70' : ''}"
            data-msd-card-image="machine-safety-${_safeFilePart(m.MachineCode || m.MachineName || 'document')}">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-xs font-mono font-semibold text-emerald-700">${UI.escHtml(m.MachineCode || '')}</p>
                    <h4 class="mt-1 text-sm font-bold text-slate-800 truncate">${UI.escHtml(m.MachineName || '-')}</h4>
                    <p class="mt-1 text-xs text-slate-500 truncate">${UI.escHtml([m.Department, m.Area].filter(Boolean).join(' / ') || '-')}</p>
                </div>
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border ${auditClass}">${auditLabel}</span>
            </div>
            <div class="mt-4 grid grid-cols-2 gap-2">
                <div class="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <p class="text-[10px] text-slate-400">Status</p>
                    <p class="mt-1 text-xs font-semibold ${sm.text}">${sm.label}</p>
                </div>
                <div class="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <p class="text-[10px] text-slate-400">Risk</p>
                    <p class="mt-1 text-xs font-semibold ${rm.text}">${rm.label}</p>
                </div>
                <div class="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <p class="text-[10px] text-slate-400">Issue by</p>
                    <p class="mt-1 text-xs font-semibold text-slate-700 truncate">${UI.escHtml(m.IssueByName || m.IssueBy || '-')}</p>
                </div>
                <div class="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <p class="text-[10px] text-slate-400">Verified by</p>
                    <p class="mt-1 text-xs font-semibold text-slate-700 truncate">${UI.escHtml(m.VerifiedByName || m.VerifiedBy || '-')}</p>
                </div>
            </div>
            <div class="mt-4">
                <div class="flex items-center justify-between text-xs mb-1.5">
                    <span class="font-semibold text-slate-600">Document completeness</span>
                    <span class="font-bold text-emerald-700">${completion}%</span>
                </div>
                <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full rounded-full" style="width:${completion}%;background:${completion === 100 ? '#10b981' : completion ? '#f59e0b' : '#cbd5e1'}"></div>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                    <button onclick="window._msdOpenFiles(${m.id}, ${_jsArg(m.MachineName)})" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${hasSafety ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-slate-200 bg-slate-50 text-slate-400'}">
                        Std.${hasSafety ? ` ${m.SafetyDeviceCount}` : ''}
                    </button>
                    <button onclick="window._msdOpenFiles(${m.id}, ${_jsArg(m.MachineName)}, 'LayoutCheckpoint')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${hasLayout ? 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100' : 'border-slate-200 bg-slate-50 text-slate-400'}">
                        Layout${hasLayout ? ` ${m.LayoutCheckpointCount}` : ''}
                    </button>
                </div>
            </div>
            <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <span class="text-[11px] text-slate-400">Updated ${updated}</span>
                <div class="flex items-center gap-1" data-msd-card-ignore>
                    <button onclick="window._msdOpenDetail(${m.id}, ${_jsArg(m.MachineName)})" class="p-2 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors" title="ดูรายละเอียด">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    </button>
                    ${adminBtns}
                </div>
            </div>
        </article>`;
    }).join('');

    return `<div class="msd-card-grid p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${cards}</div>${pagination}`;
}

// ─── Filter ───────────────────────────────────────────────────────────────────
function _getFiltered() {
    return _machines.filter(m => {
        if (_search) {
            const q = _search.toLowerCase();
            const haystack = [
                m.MachineName, m.MachineCode, m.Area, m.IssueByName, m.VerifiedByName
            ].map(v => String(v || '').toLowerCase()).join(' ');
            if (!haystack.includes(q)) return false;
        }
        if (_filterDept    && m.Department !== _filterDept)              return false;
        if (_filterMStatus && (m.Status || 'active') !== _filterMStatus) return false;
        if (_filterRisk === 'high-risk' && !['high', 'critical'].includes(m.RiskLevel || '')) return false;
        if (_filterRisk && _filterRisk !== 'high-risk' && (m.RiskLevel || 'low') !== _filterRisk) return false;
        const hasSafety = m.SafetyDeviceCount > 0;
        const hasLayout = m.LayoutCheckpointCount > 0;
        if (_filterStatus === 'full'    && !(hasSafety && hasLayout)) return false;
        if (_filterStatus === 'partial' && hasSafety === hasLayout)   return false;
        if (_filterStatus === 'none'    && (hasSafety || hasLayout))  return false;
        if (_filterAudit && _auditStatus(m).status !== _filterAudit)  return false;
        if (_filterInspection) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const next = m.NextInspectionDate ? new Date(m.NextInspectionDate) : null;
            const diff = next ? Math.ceil((next - today) / 86400000) : null;
            if (_filterInspection === 'due' && !(next && diff >= 0 && diff <= 30)) return false;
            if (_filterInspection === 'overdue' && !(next && diff < 0)) return false;
        }
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
    _filterInspection = document.getElementById('msd-inspection')?.value || _filterInspection || '';
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

window._msdSetRiskFilter = function(val) {
    _filterRisk = (_filterRisk === val) ? '' : val;
    const sel = document.getElementById('msd-risk');
    if (sel) sel.value = ['low', 'medium', 'high', 'critical'].includes(_filterRisk) ? _filterRisk : '';
    _page = 1;
    const wrap = document.getElementById('msd-table-wrap');
    if (wrap) wrap.innerHTML = _renderTable();
    _updateCount();
};

window._msdSetInspectionFilter = function(val) {
    _filterInspection = (_filterInspection === val) ? '' : val;
    _page = 1;
    const wrap = document.getElementById('msd-table-wrap');
    if (wrap) wrap.innerHTML = _renderTable();
    _updateCount();
};

window._msdToggleFilters = function(button) {
    const grid = button?.closest('.msd-filter-grid');
    if (!grid) return;
    const isOpen = grid.classList.toggle('msd-filters-open');
    button.setAttribute('aria-expanded', String(isOpen));
};

window._msdSetView = function(mode) {
    _viewMode = mode === 'card' ? 'card' : 'list';
    _page = 1;
    const container = document.getElementById('machine-safety-page');
    if (container) _renderPage(container);
};

window._msdGoPage = function(p) {
    _page = p;
    const wrap = document.getElementById('msd-table-wrap');
    if (wrap) wrap.innerHTML = _renderTable();
    _updateCount();
};

// ─── Add / Edit Form ──────────────────────────────────────────────────────────
function _deptNames() {
    return [...new Set([..._depts, ...(_machines.map(m => m.Department).filter(Boolean))])].sort();
}

function _deptDatalistHtml(selected = '') {
    return `<input list="msd-dept-options" name="Department" value="${UI.escHtml(selected || '')}" placeholder="พิมพ์ค้นหาแผนก" class="form-input w-full">
        <datalist id="msd-dept-options">
            ${_deptNames().map(d => `<option value="${UI.escHtml(d)}"></option>`).join('')}
        </datalist>`;
}

function _splitAreaValues(value = '') {
    return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
}

function _areaNames() {
    return [...new Set([..._areas, ..._machines.flatMap(m => _splitAreaValues(m.Area))])].sort();
}

function _areaPickerHtml(selectedValue = '') {
    const selected = new Set(_splitAreaValues(selectedValue));
    const areas = _areaNames();
    if (!areas.length) {
        return `<input name="Area" value="${UI.escHtml(selectedValue || '')}" placeholder="เช่น Line A, Zone 2" class="form-input w-full">`;
    }
    return `<div class="rounded-xl border border-slate-200 bg-slate-50/60 p-3 max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
        ${areas.map(area => `<label class="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="Areas" value="${UI.escHtml(area)}" ${selected.has(area) ? 'checked' : ''} class="w-4 h-4 rounded accent-emerald-500">
            <span class="truncate">${UI.escHtml(area)}</span>
        </label>`).join('')}
    </div>`;
}

function _employeeLookupValue(e) {
    const id = e.EmployeeID || '';
    const name = e.EmployeeName || id;
    const meta = [id, e.Department, e.Position].filter(Boolean).join(' · ');
    return `${name}${meta ? ` (${meta})` : ''}`;
}

function _employeeLookupInitial(id = '', name = '') {
    const row = _employees.find(e => String(e.EmployeeID || '') === String(id || ''));
    return row ? _employeeLookupValue(row) : (name || id || '');
}

function _employeeDatalistHtml(fieldName, selectedId = '', selectedName = '') {
    const listId = `msd-${fieldName}-options`;
    return `<input list="${listId}" name="${fieldName}" value="${UI.escHtml(_employeeLookupInitial(selectedId, selectedName))}" placeholder="ค้นหาจากรหัสหรือชื่อพนักงาน" class="form-input w-full">
        <datalist id="${listId}">
            ${_employees.map(e => `<option value="${UI.escHtml(_employeeLookupValue(e))}"></option>`).join('')}
        </datalist>`;
}

function _employeeFromLookup(value = '') {
    const text = String(value || '').trim();
    if (!text) return { id: '', name: '' };
    const lower = text.toLowerCase();
    const parenId = text.match(/\(([^)]*)\)/)?.[1]?.split('·')?.[0]?.trim();
    const match = _employees.find(e => {
        const id = String(e.EmployeeID || '').trim();
        const name = String(e.EmployeeName || '').trim();
        return _employeeLookupValue(e).toLowerCase() === lower
            || id.toLowerCase() === lower
            || name.toLowerCase() === lower
            || (parenId && id.toLowerCase() === parenId.toLowerCase());
    });
    if (!match) return { id: text, name: text };
    return { id: match.EmployeeID || '', name: match.EmployeeName || match.EmployeeID || '' };
}

function _dateOnly(value) {
    if (!value) return '';
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text.split('T')[0] || '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function _nextDocumentNo() {
    const year = new Date().getFullYear();
    const prefix = `MSD-${year}-`;
    const max = _machines.reduce((acc, m) => {
        const code = String(m.MachineCode || '');
        if (!code.startsWith(prefix)) return acc;
        const n = parseInt(code.slice(prefix.length), 10);
        return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
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
            <button type="button" onclick="window._msdOpenFiles(${m.id}, ${_jsArg(m.MachineName)})"
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
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ลำดับเอกสาร</label>
                <div class="form-input w-full bg-slate-50 text-slate-500 flex items-center">${UI.escHtml(m.MachineCode || `ถัดไป: ${_nextDocumentNo()}`)}</div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อเอกสารเครื่องจักร <span class="text-red-500">*</span></label>
                <input name="MachineName" required value="${UI.escHtml(m.MachineName || '')}" placeholder="ชื่อเอกสารเครื่องจักร"
                    class="form-input w-full">
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก</label>
                ${_deptDatalistHtml(m.Department || '')}
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">พื้นที่ / Line</label>
                ${_areaPickerHtml(m.Area || '')}
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Issue by</label>
                ${_employeeDatalistHtml('IssueByLookup', m.IssueBy || '', m.IssueByName || '')}
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Verified by</label>
                ${_employeeDatalistHtml('VerifiedByLookup', m.VerifiedBy || '', m.VerifiedByName || '')}
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันบังคับใช้ <span class="text-red-500">*</span></label>
                <input type="date" name="EffectiveDate" required
                    value="${_dateOnly(m.EffectiveDate)}"
                    class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันตรวจสอบครั้งถัดไป</label>
                <input type="date" name="NextInspectionDate"
                    value="${_dateOnly(m.NextInspectionDate)}"
                    class="form-input w-full">
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                class="form-textarea w-full resize-none">${UI.escHtml(m.Remark || '')}</textarea>
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
    const areas = fd.getAll('Areas').map(v => String(v || '').trim()).filter(Boolean);
    const issueBy = _employeeFromLookup(fd.get('IssueByLookup'));
    const verifiedBy = _employeeFromLookup(fd.get('VerifiedByLookup'));
    return {
        MachineName:        fd.get('MachineName'),
        Department:         fd.get('Department'),
        Area:               areas.length ? areas.join(', ') : fd.get('Area'),
        Areas:              areas,
        IssueBy:            issueBy.id,
        IssueByName:        issueBy.name,
        VerifiedBy:         verifiedBy.id,
        VerifiedByName:     verifiedBy.name,
        EffectiveDate:      fd.get('EffectiveDate') || null,
        HasRiskAssessment:  fd.get('HasRiskAssessment') === 'on',
        Remark:             fd.get('Remark'),
        Status:             fd.get('Status') || 'active',
        RiskLevel:          fd.get('RiskLevel') || 'low',
        NextInspectionDate: fd.get('NextInspectionDate') || null,
    };
}

window._msdOpenAdd = function() {
    UI.openModal('เพิ่มเอกสารเครื่องจักร', _machineFormHtml(), 'max-w-2xl');
    setTimeout(() => {
        document.getElementById('msd-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
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
                UI.showToast('เพิ่มเอกสารเครื่องจักรสำเร็จ', 'success');
                await _fetchMachines();
                _renderPage(document.getElementById('machine-safety-page'));
            } catch (err) {
                _showFormErr(_errText(err));
                submitBtn.disabled = false;
                submitBtn.textContent = 'บันทึก';
            }
        }));
    }, 50);
};

window._msdOpenEdit = function(id) {
    const m = _machines.find(x => x.id === id);
    if (!m) return;
    UI.openModal('แก้ไขเอกสารเครื่องจักร', _machineFormHtml(m), 'max-w-2xl');
    setTimeout(() => {
        document.getElementById('msd-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type=submit]');
            if (submitBtn?.disabled) return;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'กำลังบันทึก...';
            }
            try {
                await apiFetch(`/machine-safety/${id}`, { method: 'PUT', body: JSON.stringify(_formBody(e.target)) });
                UI.closeModal();
                UI.showToast('อัปเดตสำเร็จ', 'success');
                await _fetchMachines();
                _renderPage(document.getElementById('machine-safety-page'));
            } catch (err) {
                _showFormErr(_errText(err));
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'บันทึก';
                }
            }
        }));
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
        UI.showToast(_errText(err), 'error');
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

    let files = [];
    try {
        const filesRes = await API.get(`/machine-safety/${machineId}/files`);
        files = filesRes.data || [];
    } catch (err) {
        const body = document.getElementById('msd-files-body');
        if (body) {
            body.innerHTML = `<p class="text-red-500 text-sm text-center py-8">${UI.escHtml(_errText(err, 'ไม่สามารถโหลดไฟล์แนบได้'))}</p>`;
        }
        return;
    }

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
                        <p class="text-sm font-medium text-slate-700 truncate">${UI.escHtml(f.FileLabel || 'ไฟล์')}</p>
                        <p class="text-xs text-slate-400">${UI.escHtml(f.UploadedBy || '—')} · ${new Date(f.UploadedAt).toLocaleDateString('th-TH')}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <button onclick="window._msdPreviewFile(${_jsArg(f.FileUrl)}, ${_jsArg(f.FileLabel || 'ไฟล์')})"
                        class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-slate-50 text-slate-600 hover:bg-slate-100">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        ดูตัวอย่าง
                    </button>
                    <button type="button" onclick="window._msdDownloadFile(${_jsArg(f.FileUrl)}, ${_jsArg(f.FileLabel || 'ไฟล์')})"
                        class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-${color}-50 text-${color}-600 hover:bg-${color}-100">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        ดาวน์โหลด
                    </button>
                    ${_isAdmin ? `<button onclick="window._msdDeleteFile(${f.id}, ${machineId}, ${_jsArg(machineName)}, ${_jsArg(category)})"
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
        form.addEventListener('submit', guardSubmitHandler(async (e) => {
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
                if (errEl) { errEl.textContent = _errText(err); errEl.classList.remove('hidden'); }
                btn.disabled = false; btn.textContent = 'อัปโหลด';
            }
        }));
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
        UI.showToast(_errText(err), 'error');
    }
};

// ─── File Preview ─────────────────────────────────────────────────────────────
window._msdPreviewFile = async function(url, label) {
    const safeUrl = await _resolveDocumentUrl(url);
    if (!safeUrl) {
        UI.showToast('ลิงก์เอกสารไม่ปลอดภัยหรือไม่ถูกต้อง', 'error');
        return;
    }
    UI.showDocumentModal(safeUrl, label || 'เอกสารเครื่องจักร');
};

window._msdDownloadFile = async function(url, label) {
    const safeUrl = await _resolveDocumentUrl(url);
    if (!safeUrl) {
        UI.showToast('ลิงก์เอกสารไม่ปลอดภัยหรือไม่ถูกต้อง', 'error');
        return;
    }
    const filename = _fileNameFromUrl(safeUrl) || label || 'machine-safety-document';
    try {
        const res = await fetch(safeUrl, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
        window.open(safeUrl, '_blank', 'noopener');
    }
};

// ─── Machine Detail Modal (Compliance | Issues | Files) ───────────────────────
window._msdEditFromDetail = function(machineId) {
    UI.closeModal();
    setTimeout(() => window._msdOpenEdit(machineId), 80);
};

window._msdDeleteFromDetail = function(machineId, machineName) {
    UI.closeModal();
    setTimeout(() => window._msdDelete(machineId, machineName), 80);
};

window._msdOpenDetail = async function(machineId, machineName) {
    UI.openModal(`รายละเอียด — ${machineName}`, `
        <div id="msd-detail-body">
            <div class="flex justify-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
            </div>
        </div>`, 'max-w-4xl');

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
        const machine        = _machines.find(m => String(m.id) === String(machineId)) || {};
        const detailAudit    = _auditStatus(machine);
        const metaItems      = [
            ['ลำดับเอกสาร', machine.MachineCode],
            ['แผนก', machine.Department],
            ['วันบังคับใช้', _dateOnly(machine.EffectiveDate)],
            ['พื้นที่', machine.Area],
            ['สถานะเครื่องจักร', (STATUS_META[machine.Status || 'active'] || STATUS_META.active).label],
            ['ระดับความเสี่ยง', (RISK_META[machine.RiskLevel || 'low'] || RISK_META.low).label],
            ['Safety Device Standard', `${Number(machine.SafetyDeviceCount || 0)} ไฟล์`],
            ['Layout & Checkpoint', `${Number(machine.LayoutCheckpointCount || 0)} ไฟล์`],
            ['Risk Assessment', machine.HasRiskAssessment ? 'มีข้อมูล' : 'ยังไม่มีข้อมูล'],
            ['Compliance', `${Number(machine.CompliancePassCount || 0)}/${COMPLIANCE_ITEMS.length} ข้อ`],
            ['Audit Readiness', detailAudit.status === 'pass' ? 'ผ่าน' : detailAudit.status === 'warn' ? 'เฝ้าระวัง' : 'ไม่ผ่าน'],
            ['ปัญหาที่ยังเปิด', `${openCount} รายการ`],
            ['ตรวจครั้งถัดไป', _dateOnly(machine.NextInspectionDate)],
            ['อัปเดตล่าสุด', machine.UpdatedAt ? new Date(machine.UpdatedAt).toLocaleString('th-TH') : null],
            ['Issue by', machine.IssueByName || machine.IssueBy],
            ['Verified by', machine.VerifiedByName || machine.VerifiedBy],
            ['หมายเหตุ', machine.Remark],
        ].filter(([, value]) => value);

        const body = document.getElementById('msd-detail-body');
        if (!body) return;

        body.innerHTML = `
            ${_isAdmin ? `<div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-100 bg-teal-50/70 px-3 py-2.5">
                <p class="text-xs text-teal-700">จัดการข้อมูลเครื่องจักรและรายละเอียดทั้งหมดจากหน้าต่างนี้</p>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="window._msdEditFromDetail(${machineId})"
                        class="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                        แก้ไขข้อมูล
                    </button>
                    <button type="button" onclick="window._msdDeleteFromDetail(${machineId}, ${_jsArg(machineName)})"
                        class="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                        ลบรายการ
                    </button>
                </div>
            </div>` : ''}
            ${metaItems.length ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                ${metaItems.map(([label, value]) => `<div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[11px] font-semibold uppercase text-slate-400">${label}</p>
                    <p class="text-sm font-semibold text-slate-700">${UI.escHtml(value)}</p>
                </div>`).join('')}
            </div>` : ''}
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
        if (body) body.innerHTML = `<p class="text-red-500 text-sm text-center py-8">${UI.escHtml(_errText(err, 'ไม่สามารถโหลดรายละเอียดได้'))}</p>`;
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
            ? `<span class="text-[10px] text-slate-400 ml-2">${UI.escHtml(row.UpdatedBy)}</span>`
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
    btn.addEventListener('click', guardActionHandler(async () => {
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
            UI.showToast(_errText(err), 'error');
        } finally {
            btn.disabled = false; btn.textContent = 'บันทึก Compliance';
        }
    }));
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
                        <button onclick="window._msdResolveIssue(${iss.id}, ${machineId}, ${_jsArg(machineName)})"
                            class="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors whitespace-nowrap">
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                            แก้ไขแล้ว
                        </button>
                        <button onclick="window._msdDeleteIssue(${iss.id}, ${machineId}, ${_jsArg(machineName)})"
                            class="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="ลบ">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>` : '';
                return `<li class="py-3 space-y-1">
                    <div class="flex items-start justify-between gap-2">
                        <p class="text-sm text-slate-800 flex-1">${UI.escHtml(iss.Description || '')}</p>
                        <div class="flex items-center gap-1.5 flex-shrink-0">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${rc}-100 text-${rc}-700">${SEV_LABEL[iss.Severity] || iss.Severity}</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${sc}-100 text-${sc}-700">${iss.Status === 'open' ? 'เปิด' : 'แก้ไขแล้ว'}</span>
                        </div>
                    </div>
                    ${iss.Resolution ? `<p class="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">การแก้ไข: ${UI.escHtml(iss.Resolution)}</p>` : ''}
                    <p class="text-[10px] text-slate-400">${UI.escHtml(iss.CreatedBy || '—')} · ${new Date(iss.CreatedAt).toLocaleDateString('th-TH')}</p>
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
    btn.addEventListener('click', guardActionHandler(async () => {
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
            if (errEl) { errEl.textContent = _errText(err); errEl.classList.remove('hidden'); }
            btn.disabled = false;
        }
    }));
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
        UI.showToast(_errText(err), 'error');
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
        UI.showToast(_errText(err), 'error');
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
            'ลำดับเอกสาร':       m.MachineCode,
            'ชื่อเอกสารเครื่องจักร': m.MachineName,
            'แผนก':              m.Department || '',
            'พื้นที่':            m.Area || '',
            'วันบังคับใช้':       _dateOnly(m.EffectiveDate),
            'Issue by':          m.IssueByName || m.IssueBy || '',
            'Verified by':       m.VerifiedByName || m.VerifiedBy || '',
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

function _jsArg(value) {
    return JSON.stringify(String(value || ''))
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function _fileNameFromUrl(url) {
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.searchParams.get('filename') || decodeURIComponent(parsed.pathname.split('/').pop() || '');
    } catch {
        return decodeURIComponent(String(url || '').split('?')[0].split('/').pop() || '');
    }
}

function _safeFilePart(value) {
    return String(value || 'machine-safety-card')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'machine-safety-card';
}

async function _resolveDocumentUrl(url) {
    const candidates = _documentUrlCandidates(url);
    for (const candidate of candidates) {
        try {
            const res = await fetch(candidate, { method: 'HEAD', mode: 'cors' });
            if (res.ok) return candidate;
        } catch {
            // Try the next local/prod candidate.
        }
    }
    return candidates[0] || '';
}

function _documentUrlCandidates(url) {
    const normalized = UI.normalizeDocumentUrl(url);
    const out = [];
    const add = (value) => {
        if (value && _isSafeDocumentUrl(value) && !out.includes(value)) out.push(value);
    };
    add(normalized);

    try {
        const currentHost = window.location.hostname.toLowerCase();
        const currentIsLocal = ['localhost', '127.0.0.1', '::1'].includes(currentHost);
        if (!currentIsLocal) return out;

        const parsed = new URL(url, window.location.href);
        const uploadIndex = parsed.pathname.indexOf('/uploads/');
        if (uploadIndex < 0) return out;
        const uploadPath = parsed.pathname.slice(uploadIndex);
        add(`http://localhost:5000${uploadPath}${parsed.search}${parsed.hash}`);
        add(`http://localhost:5001${uploadPath}${parsed.search}${parsed.hash}`);
        add(`http://127.0.0.1:5000${uploadPath}${parsed.search}${parsed.hash}`);
        add(`http://127.0.0.1:5001${uploadPath}${parsed.search}${parsed.hash}`);
    } catch {
        // Keep the normalized URL as the fallback.
    }
    return out;
}

function _isSafeDocumentUrl(value) {
    try {
        const parsed = new URL(String(value || ''), window.location.href);
        return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
    } catch {
        return false;
    }
}

installWindowActionLocks('machine-safety', [
  '_msdReload', '_msdDelete', '_msdOpenFiles', '_msdDeleteFile', '_msdPreviewFile', '_msdDownloadFile', '_msdOpenDetail', '_msdResolveIssue', '_msdDeleteIssue'
]);
