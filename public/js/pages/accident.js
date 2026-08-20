import { guardSubmitHandler, installWindowActionLocks } from '../utils/async-ui.js?v=20260715-phase32d-remaining-async-ux';
// public/js/pages/accident.js
// Accident Report — enterprise pattern (buildShell + switchTab)
import { API } from '../api.js';
import { openModal, openDetailModal, closeModal, showToast, showConfirmationModal, showLoading, hideLoading } from '../ui.js?v=20260602-mobile-nav-m53';
import { captureCardImage, isSharedCardImageExportEnabled } from '../utils/card-image-export.js?v=20260820-card-image-phase2a';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const ACCIDENT_TYPES = ['Near Miss', 'First Aid', 'Medical Treatment', 'Lost Time', 'Fatal'];
const SEVERITIES     = ['Minor', 'Moderate', 'Serious', 'Critical'];
const POTENTIAL_SEVERITIES = [
    { value: 'Low',      label: 'ต่ำ / Low' },
    { value: 'Medium',   label: 'ปานกลาง / Medium' },
    { value: 'High',     label: 'สูง / High' },
    { value: 'Critical', label: 'วิกฤต / Critical' },
];
const INVESTIGATION_STATUSES = [
    { value: 'Reported',            label: 'รับรายงาน / Reported' },
    { value: 'Under Investigation', label: 'อยู่ระหว่างสอบสวน / Under Investigation' },
    { value: 'CAPA Assigned',       label: 'มอบหมาย CAPA / CAPA Assigned' },
    { value: 'Verified',            label: 'ตรวจยืนยันแล้ว / Verified' },
    { value: 'Closed',              label: 'ปิดเคส / Closed' },
];
const ROOT_CAUSES    = [
    'พฤติกรรมไม่ปลอดภัย (Unsafe Act)',
    'สภาพแวดล้อมไม่ปลอดภัย (Unsafe Condition)',
    'ไม่ใช้อุปกรณ์ PPE',
    'ขาดการฝึกอบรม',
    'ความเหนื่อยล้า / ความประมาท',
    'ความบกพร่องของเครื่องจักร',
    'การจัดการไม่เหมาะสม',
    'อื่นๆ',
];
const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

const INJURY_TYPES = [
    'การตัด / บาด / ถลอก',
    'ฟกช้ำ / ฟกช้ำดำเขียว',
    'กระดูกหัก / เคลื่อน',
    'ไหม้ / ลวก',
    'ไฟฟ้าดูด',
    'ขาหัก / บาดเจ็บจากการหกล้ม',
    'สูดดมสารพิษ',
    'ตาได้รับบาดเจ็บ',
    'บาดเจ็บจากเครื่องจักร',
    'อื่นๆ',
];
const BODY_PARTS = [
    'ศีรษะ / หน้าผาก', 'ตา / ใบหน้า', 'คอ / บ่า', 'หน้าอก / ซี่โครง',
    'หลัง / เอว', 'แขน / ข้อศอก', 'มือ / นิ้วมือ', 'ขา / เข่า', 'เท้า / นิ้วเท้า',
    'ทั่วร่างกาย', 'อื่นๆ',
];
const ACC_OTHER_VALUE = 'อื่นๆ';
const ACC_OTHER_PLACEHOLDER = 'ระบุรายละเอียดอื่นๆ / Specify other';
const EMPLOYMENT_TYPES = ['พนักงานประจำ', 'พนักงานชั่วคราว', 'พนักงานรับเหมา', 'นักศึกษาฝึกงาน', ACC_OTHER_VALUE];

const TYPE_COLOR = {
    'Near Miss':         { bg: 'bg-amber-100',  text: 'text-amber-700'  },
    'First Aid':         { bg: 'bg-blue-100',   text: 'text-blue-700'   },
    'Medical Treatment': { bg: 'bg-orange-100', text: 'text-orange-700' },
    'Lost Time':         { bg: 'bg-red-100',    text: 'text-red-700'    },
    'Fatal':             { bg: 'bg-slate-800',  text: 'text-white'      },
};
const SEV_COLOR = {
    'Minor':    { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    'Moderate': { bg: 'bg-amber-100',   text: 'text-amber-700'   },
    'Serious':  { bg: 'bg-orange-100',  text: 'text-orange-700'  },
    'Critical': { bg: 'bg-red-100',     text: 'text-red-700'     },
    'Fatal':    { bg: 'bg-red-900',     text: 'text-white'       },
};
const ACCIDENT_LAYOUT_IMAGE = 'public/images/accident/tsh-factory-layout.jpg';
const ACCIDENT_LAYOUT_DEFAULT_POINTS = [
    { x: 38, y: 36 }, // TSH Factory 1
    { x: 28, y: 68 }, // TSH Factory 2
    { x: 72, y: 36 }, // TSH Factory 3
    { x: 72, y: 70 }, // TSC Factory 4
    { x: 18, y: 29 }, // parking / guardhouse side
];
const ACCIDENT_HOTSPOT_POSITIONS_STORAGE_KEY = 'tsh_accident_hotspot_positions_v1';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _isAdmin        = false;
let _activeTab      = 'dashboard';
let _statsYear      = new Date().getFullYear();
let _summary        = null;
let _analytics      = null;
let _reports        = [];
let _allDepts       = [];
let _filter         = { dept: '', type: '', status: '', quick: '', year: new Date().getFullYear() };
let _listenersReady = false;
let _trendChart     = null;
let _deptChart      = null;
let _accEmpTimer    = null;
let _accPersonTimer = null;
let _accNearMissPeople = [];
let _accDetailDocCache = {};
let _pendingFiles   = [];   // File objects staged before submit
let _perfData       = null; // cached Safety Performance record
let _hotspotPositions = {};
let _hotspotEditMode = false;
let _hotspotEditArea = '';
let _lastHotspotRows = [];
let _accCardSaveHold = null;
let _accCardSaveMenu = null;
const _accActionLocks = new Set();
let _heroStatsRequest = 0;
let _heroKpiRequest = 0;
let _dashboardRequest = 0;
let _analyticsRequest = 0;
let _reportsRequest = 0;
let _reportsPanelRequest = 0;
let _employeeSearchRequest = 0;
let _personSearchRequest = 0;

function _accApiResponseFailed(res) {
    return res && typeof res === 'object' && 'ok' in res && 'status' in res && !res.ok;
}

function _accLoadLocalHotspotPositions() {
    try {
        const raw = localStorage.getItem(ACCIDENT_HOTSPOT_POSITIONS_STORAGE_KEY);
        const rows = raw ? JSON.parse(raw) : [];
        const map = {};
        (Array.isArray(rows) ? rows : []).forEach(row => {
            const key = _accHotspotKey(row.AreaName || row.areaName || row.area);
            if (key) map[key] = { ...row, AreaName: key };
        });
        return map;
    } catch (_) {
        return {};
    }
}

function _accSaveLocalHotspotPositions(positions) {
    try {
        localStorage.setItem(ACCIDENT_HOTSPOT_POSITIONS_STORAGE_KEY, JSON.stringify(positions || []));
    } catch (_) { /* local fallback is best effort only */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadAccidentPage() {
    const container = document.getElementById('accident-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _isAdmin = String(user.role || user.Role || '').toLowerCase() === 'admin';

    window.closeModal = closeModal;

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    _activeTab = window._getTab?.('accident', _activeTab) || _activeTab;
    try {
        const _inFilter = JSON.parse(sessionStorage.getItem('pending_filter_accident') || 'null');
        if (_inFilter) {
            sessionStorage.removeItem('pending_filter_accident');
            if (_inFilter.tab) _activeTab = _inFilter.tab;
            if (_inFilter.quick) _filter.quick = _inFilter.quick;
            if (_inFilter.status) _filter.status = _inFilter.status;
            if (_inFilter.year) _filter.year = parseInt(_inFilter.year, 10) || _filter.year;
            if (_inFilter.dept) _filter.dept = _inFilter.dept;
        }
    } catch (_) {}
    switchTab(_activeTab);
    _loadHeroStats();
    _loadHeroKpiSummary();
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB CONFIG
// ─────────────────────────────────────────────────────────────────────────────
function _getTabs() {
    return [
        { id: 'dashboard', label: 'ภาพรวม',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
        { id: 'analytics', label: 'วิเคราะห์',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/>` },
        { id: 'reports', label: 'รายงานทั้งหมด',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` },
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);

    const tabHtml = _getTabs().map(t => `
        <button id="acc-tab-btn-${t.id}" data-tab="${t.id}"
            class="acc-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="acc-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#acc-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                </svg>
                                Accident Report
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">รายงานอุบัติเหตุ &amp; Safety Analytics</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Accident Report · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-shrink-0 w-full md:w-auto">
                        <!-- Stats strip -->
                        <div id="acc-stats-strip" class="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full sm:w-auto">
                            ${['—','—','—','—'].map((v, i) => {
                                const labels = ['วันปลอดอุบัติ','รวมทั้งหมด','Recordable','Near Miss'];
                                return `<div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
                                    <p class="text-2xl font-bold text-white acc-stat-val" data-idx="${i}">${v}</p>
                                    <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${labels[i]}</p>
                                </div>`;
                            }).join('')}
                        </div>
                        <!-- Actions -->
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <select id="acc-year-sel" class="rounded-xl px-3 py-2 text-xs font-semibold text-white border border-white/30 bg-white/15 outline-none">
                                ${years.map(y => `<option value="${y}" ${y===_statsYear?'selected':''} class="text-slate-800 bg-white">${y}</option>`).join('')}
                            </select>
                            <button id="acc-dashboard-pdf" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white border border-white/30 bg-white/15 hover:bg-white/25 transition-all whitespace-nowrap">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/></svg>
                                PDF
                            </button>
                            ${_isAdmin ? `
                            <button id="acc-btn-add" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white border border-white/30 bg-white/15 hover:bg-white/25 transition-all whitespace-nowrap">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                บันทึกอุบัติเหตุ
                            </button>` : ''}
                        </div>
                    </div>
                </div>

                <div id="acc-hero-kpi-summary" class="mt-5 pt-5 border-t border-white/15"></div>

                <!-- Tab bar -->
                <div class="flex overflow-x-auto gap-0 -mb-px scrollbar-none">
                    ${tabHtml}
                </div>
            </div>
        </div>

        <!-- ═══ TAB PANELS ═══ -->
        <div id="acc-panel-dashboard"   class="hidden"></div>
        <div id="acc-panel-analytics"   class="hidden"></div>
        <div id="acc-panel-reports"     class="hidden"></div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS (once)
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', e => {
        const tabBtn = e.target.closest('.acc-tab');
        if (tabBtn?.dataset?.tab) { switchTab(tabBtn.dataset.tab); return; }

        if (e.target.closest('#acc-btn-add')) { openAccidentForm(null); return; }
        if (e.target.closest('#acc-dashboard-pdf')) { window._accExportDashboardPDF?.(); return; }
        if (e.target.closest('[data-acc-card-save-action]')) {
            const card = _accCardSaveMenu?.card;
            _accHideCardImageMenu();
            if (card) _accDownloadCardImage(card);
            return;
        }

        if (!e.target.closest('#acc-emp-dropdown') && !e.target.closest('#acc-emp-search')) {
            document.getElementById('acc-emp-dropdown')?.classList.add('hidden');
        }
        if (!e.target.closest('#acc-card-save-menu')) _accHideCardImageMenu();
    });

    document.addEventListener('change', e => {
        if (e.target?.id === 'acc-year-sel') {
            _statsYear = parseInt(e.target.value) || new Date().getFullYear();
            _filter.year = _statsYear;
            // Clear caches so panels always fetch fresh data for the new year
            _summary   = null;
            _analytics = null;
            _perfData  = null;
            _loadHeroStats();
            _loadHeroKpiSummary();
            if (_activeTab === 'dashboard')   _renderDashboardPanel();
            else if (_activeTab === 'analytics')   _renderAnalyticsPanel();
        }
    });

    document.addEventListener('contextmenu', _accShowCardContextMenu);
    document.addEventListener('pointerdown', _accStartCardImageHold);
    document.addEventListener('pointermove', _accMoveCardImageHold);
    document.addEventListener('pointerup', _accCancelCardImageHold);
    document.addEventListener('pointercancel', _accCancelCardImageHold);
}

function _accShowCardContextMenu(event) {
    const card = event.target?.closest?.('[data-acc-card-image]');
    if (!card || !document.getElementById('accident-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"]')) return;
    event.preventDefault();
    _accShowCardImageMenu(card, event.clientX, event.clientY);
}

function _accStartCardImageHold(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const card = event.target?.closest?.('[data-acc-card-image]');
    if (!card || !document.getElementById('accident-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"]')) return;
    _accCancelCardImageHold();
    _accCardSaveHold = {
        card,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        fired: false,
        timer: setTimeout(() => {
            if (!_accCardSaveHold || _accCardSaveHold.card !== card) return;
            _accCardSaveHold.fired = true;
            _accShowCardImageMenu(card, _accCardSaveHold.x, _accCardSaveHold.y);
        }, 800),
    };
}

function _accMoveCardImageHold(event) {
    if (!_accCardSaveHold || event.pointerId !== _accCardSaveHold.pointerId) return;
    if (Math.abs(event.clientX - _accCardSaveHold.x) > 10 || Math.abs(event.clientY - _accCardSaveHold.y) > 10) {
        _accCancelCardImageHold();
    }
}

function _accCancelCardImageHold() {
    if (_accCardSaveHold?.timer) clearTimeout(_accCardSaveHold.timer);
    _accCardSaveHold = null;
}

function _accShowCardImageMenu(card, clientX, clientY) {
    _accHideCardImageMenu();
    const menu = document.createElement('div');
    menu.id = 'acc-card-save-menu';
    menu.className = 'fixed z-[9999] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl';
    menu.style.minWidth = '170px';
    menu.innerHTML = `
        <button type="button" data-acc-card-save-action
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
    _accCardSaveMenu = { card, menu };
}

function _accHideCardImageMenu() {
    _accCardSaveMenu?.menu?.remove?.();
    _accCardSaveMenu = null;
}

async function _accDownloadCardImage(card) {
    const targetName = card?.dataset?.accCardImage || 'accident-card';
    const pilotEnabled = targetName === 'accident-performance-board'
        && isSharedCardImageExportEnabled(undefined, 'accident');
    if (!pilotEnabled) return _accDownloadCardImageLegacy(card);

    const name = _accSafeFilePart(targetName);
    try {
        showLoading('Saving card image...');
        const result = await captureCardImage(card, {
            filename: `${name}-${_statsYear}`,
            width: 1200,
            expandTruncatedText: true,
            prepareClone: clone => {
                clone.querySelectorAll('[data-acc-card-ignore]').forEach(element => {
                    element.style.setProperty('display', 'none', 'important');
                });
            },
        });
        document.dispatchEvent(new CustomEvent('tsh:card-image-export-complete', {
            detail: { module: 'accident', target: targetName, engine: 'shared', width: result.width, height: result.height },
        }));
        showToast('บันทึกรูปภาพการ์ดแล้ว', 'success');
    } catch (error) {
        console.warn('[CardImageExport] Accident shared capture failed; using legacy fallback.', error);
        document.dispatchEvent(new CustomEvent('tsh:card-image-export-complete', {
            detail: { module: 'accident', target: targetName, engine: 'legacy-fallback', errorCode: error?.code || 'CAPTURE_FAILED' },
        }));
        hideLoading();
        return _accDownloadCardImageLegacy(card);
    } finally {
        hideLoading();
    }
}

async function _accDownloadCardImageLegacy(card) {
    if (typeof html2canvas === 'undefined') {
        showToast('ไม่พบ library สำหรับบันทึกรูปภาพ', 'error');
        return;
    }
    const name = _accSafeFilePart(card.dataset.accCardImage || 'accident-card');
    try {
        showLoading('Saving card image...');
        const canvas = await html2canvas(card, {
            backgroundColor: '#ffffff',
            scale: Math.min(2, window.devicePixelRatio || 1.5),
            useCORS: true,
            onclone: doc => {
                doc.querySelectorAll('[data-acc-card-ignore]').forEach(el => { el.style.display = 'none'; });
            },
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${name}-${_statsYear}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('บันทึกรูปภาพการ์ดแล้ว', 'success');
    } catch (err) {
        showToast(_friendlyErr(err, 'บันทึกรูปภาพการ์ดไม่สำเร็จ'), 'error');
    } finally {
        hideLoading();
    }
}

function _accSafeFilePart(value) {
    return String(value || 'accident-card')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'accident-card';
}

// ─────────────────────────────────────────────────────────────────────────────
// SWITCH TAB
// ─────────────────────────────────────────────────────────────────────────────
function switchTab(tab) {
    if (tab === 'performance') tab = 'dashboard';
    _activeTab = tab;
    window._saveTab?.('accident', tab);

    _getTabs().forEach(t => {
        const btn = document.getElementById(`acc-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === tab
            ? 'acc-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white'
            : 'acc-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';
    });

    ['dashboard','analytics','reports'].forEach(id => {
        document.getElementById(`acc-panel-${id}`)?.classList.add('hidden');
    });
    document.getElementById(`acc-panel-${tab}`)?.classList.remove('hidden');

    if (tab === 'dashboard')   _renderDashboardPanel();
    if (tab === 'analytics')   _renderAnalyticsPanel();
    if (tab === 'reports')     _renderReportsPanel();
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO STATS (async)
// ─────────────────────────────────────────────────────────────────────────────
async function _loadHeroStats() {
    const requestId = ++_heroStatsRequest;
    const year = _statsYear;
    try {
        const res = await API.get(`/accident/summary?year=${year}`);
        if (requestId !== _heroStatsRequest || year !== _statsYear) return;
        _summary  = res.data || null;
        const kpi = _summary?.kpi || {};
        const ds  = _summary?.daysSince;
        const vals = [
            ds !== null ? ds : '—',
            kpi.total      ?? '—',
            kpi.recordable ?? '—',
            kpi.nearMiss   ?? '—',
        ];
        document.querySelectorAll('.acc-stat-val').forEach(el => {
            const i = parseInt(el.dataset.idx);
            if (vals[i] !== undefined) el.textContent = vals[i];
        });
    } catch {
        if (requestId === _heroStatsRequest && year === _statsYear) _summary = null;
    }
}

async function _loadHeroKpiSummary() {
    const requestId = ++_heroKpiRequest;
    const year = _statsYear;
    const el = document.getElementById('acc-hero-kpi-summary');
    if (!el) return;
    el.innerHTML = `<div class="h-20 rounded-xl bg-white/10 animate-pulse"></div>`;
    try {
        const res = await API.get(`/accident/performance?year=${year}`);
        if (requestId !== _heroKpiRequest || year !== _statsYear) return;
        _perfData = res.data || null;
    } catch {
        if (requestId === _heroKpiRequest && year === _statsYear) _perfData = null;
    }
    if (requestId !== _heroKpiRequest || year !== _statsYear) return;
    if (!_perfData) {
        el.innerHTML = '';
        return;
    }
    const p = _perfData;
    const isZero = (parseInt(p.recordableCount) || 0) === 0;
    el.innerHTML = `
        <div class="rounded-2xl border border-white/20 bg-white/10 p-4 md:p-5 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" data-acc-card-image="accident-hero-kpi-board">
            <div class="grid grid-cols-1 xl:grid-cols-[1fr_280px_190px] gap-4 items-stretch">
                <div class="min-w-0 flex flex-col justify-between">
                    <div>
                        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-white/20 text-white border border-white/30 mb-2">
                            <span class="w-2 h-2 rounded-full ${isZero ? 'bg-emerald-300' : 'bg-red-300'}"></span>
                            Safety KPI Board
                        </div>
                        <h2 class="text-xl md:text-2xl font-black text-white leading-tight">บอร์ดสถิติความปลอดภัยประจำปี ${year}</h2>
                        <p class="text-sm mt-1" style="color:rgba(209,250,229,0.92)">คำนวณจาก Accident Report + Man-hour · ไม่รวม First Aid / Near Miss</p>
                    </div>
                    <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-bold text-white">
                        <div class="rounded-xl bg-black/10 border border-white/15 px-3 py-2">
                            <p class="uppercase tracking-wide text-white/50">Case Source</p>
                            <p class="mt-0.5 inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-red-300"></span>Accident Report</p>
                        </div>
                        <div class="rounded-xl bg-black/10 border border-white/15 px-3 py-2">
                            <p class="uppercase tracking-wide text-white/50">Exposure Source</p>
                            <p class="mt-0.5 inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-300"></span>Man-hour</p>
                        </div>
                    </div>
                </div>
                <div class="rounded-2xl border ${isZero ? 'border-emerald-200/40 bg-emerald-300/15' : 'border-red-200/40 bg-red-300/15'} px-5 py-4 flex items-center justify-between gap-4">
                    <div>
                        <p class="text-[11px] font-black uppercase tracking-wide text-white/65">Current Status</p>
                        <p class="mt-1 text-2xl md:text-3xl font-black text-white leading-none">${isZero ? 'ZERO ACCIDENT' : 'ACTION REQUIRED'}</p>
                        <p class="text-xs mt-2 text-white/75">${parseInt(p.recordableCount) || 0} counted cases · FY ${_statsYear}</p>
                    </div>
                    <div class="w-12 h-12 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center flex-shrink-0">
                        <svg class="w-6 h-6 ${isZero ? 'text-emerald-100' : 'text-red-100'}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="${isZero ? 'M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z' : 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z'}"/></svg>
                    </div>
                </div>
                <div class="flex flex-col gap-2 justify-center" data-acc-card-ignore>
                    <button onclick="window._accShowCountedReports&&window._accShowCountedReports()"
                        class="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black text-white border border-white/30 bg-white/10 hover:bg-white/20 transition-all whitespace-nowrap">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2a4 4 0 014-4h6m0 0l-3-3m3 3l-3 3M5 5h7M5 9h4M5 13h2"/></svg>
                        ดูรายงานที่นำมาคิด
                    </button>
                    ${_isAdmin ? `
                    <button onclick="window._accEditPerformance()"
                        class="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black text-white border border-white/30 bg-white/15 hover:bg-white/25 transition-all whitespace-nowrap">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        แก้ไข Man-hour
                    </button>` : ''}
                    <p class="text-[10px] font-semibold text-white/55 text-center">${p.UpdatedBy ? `Updated by ${p.UpdatedBy}` : 'Man-hour not updated'}</p>
                </div>
            </div>
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA FETCHERS
// ─────────────────────────────────────────────────────────────────────────────
async function _fetchDepts() {
    if (_allDepts.length) return;          // already loaded — skip
    try {
        const res = await API.get('/master/departments');
        const raw = res?.data ?? res;
        const list = (Array.isArray(raw) ? raw : [])
            .map(d => d.Name || d.name || '')
            .filter(Boolean);
        // Only cache when master actually returned data; otherwise leave empty
        // so the next call retries (avoids permanent empty-cache on transient error)
        if (list.length) _allDepts = [...new Set(list)].sort();
    } catch { /* leave _allDepts = [] so next call retries */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD PANEL
// ─────────────────────────────────────────────────────────────────────────────
function _accShortDate(value) {
    return value ? new Date(value).toLocaleDateString('th-TH', { day:'2-digit', month:'short' }) : '-';
}

function _accDateOnly(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}

function _accDaysBetween(start, end = new Date()) {
    const a = _accDateOnly(start);
    const b = _accDateOnly(end);
    if (!a || !b) return null;
    return Math.max(0, Math.floor((b - a) / 86400000));
}

function _accStatusPill(status) {
    return status === 'Closed'
        ? 'bg-slate-100 text-slate-600 border-slate-200'
        : 'bg-amber-100 text-amber-700 border-amber-200';
}

function _accInvestigationBadge(status = 'Reported') {
    const map = {
        'Reported': 'bg-slate-100 text-slate-600 border-slate-200',
        'Under Investigation': 'bg-sky-100 text-sky-700 border-sky-200',
        'CAPA Assigned': 'bg-amber-100 text-amber-700 border-amber-200',
        'Verified': 'bg-emerald-100 text-emerald-700 border-emerald-200',
        'Closed': 'bg-slate-800 text-white border-slate-800',
    };
    const cls = map[status] || map.Reported;
    return `<span class="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${cls}">${_htmlEsc(status || 'Reported')}</span>`;
}

function _accAgingInfo(r) {
    const age = _accDaysBetween(r.CreatedAt || r.ReportDate || r.AccidentDate);
    const due = _accDateOnly(r.DueDate);
    const today = _accDateOnly(new Date());
    const overdue = r.Status !== 'Closed' && due && today && due < today
        ? Math.floor((today - due) / 86400000)
        : 0;
    return {
        age,
        overdue,
        label: overdue > 0 ? `${overdue}d overdue` : (age == null ? '-' : `${age}d open`),
        cls: overdue > 0 ? 'text-red-600 bg-red-50 border-red-100' : 'text-slate-600 bg-slate-50 border-slate-100',
    };
}

function _accReportList(rows, emptyText) {
    if (!rows || rows.length === 0) {
        return `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400">${emptyText}</div>`;
    }
    return `<div class="divide-y divide-slate-100">
        ${rows.map(r => {
            const tc = TYPE_COLOR[r.AccidentType] || { bg: 'bg-slate-100', text: 'text-slate-600' };
            const overdue = r.Status !== 'Closed' && r.DueDate && new Date(r.DueDate) < new Date(new Date().toDateString());
            return `
            <button type="button" onclick="window._accViewReport(${r.id})"
                class="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-slate-50 transition-colors">
                <div class="min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${tc.bg} ${tc.text}">${_htmlEsc(r.AccidentType || '-')}</span>
                        <span class="text-xs text-slate-400">${_accShortDate(r.AccidentDate)}</span>
                    </div>
                    <p class="mt-1 truncate text-sm font-bold text-slate-800">${_htmlEsc(r.Department || '-')} · ${_htmlEsc(r.Area || '-')}</p>
                    <p class="text-xs text-slate-400">${r.ResponsiblePerson ? `Owner: ${_htmlEsc(r.ResponsiblePerson)}` : _htmlEsc(r.ReportedBy || '')}</p>
                </div>
                <div class="text-right flex-shrink-0">
                    <span class="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${overdue ? 'bg-red-100 text-red-700 border-red-200' : _accStatusPill(r.Status)}">${overdue ? 'Overdue' : _htmlEsc(r.Status || 'Open')}</span>
                    ${r.DueDate ? `<p class="mt-1 text-[10px] text-slate-400">Due ${_accShortDate(r.DueDate)}</p>` : ''}
                </div>
            </button>`;
        }).join('')}
    </div>`;
}

function _accRankBars(rows, maxValue, colorClass, emptyText) {
    if (!rows || rows.length === 0) {
        return `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400">${emptyText}</div>`;
    }
    return `<div class="space-y-3">
        ${rows.map((r, i) => {
            const value = parseInt(r.cnt) || 0;
            const pct = Math.max(4, Math.round(value * 100 / (maxValue || 1)));
            return `
            <div>
                <div class="flex items-center justify-between gap-3 mb-1">
                    <span class="min-w-0 truncate text-xs font-bold text-slate-700">${i + 1}. ${_htmlEsc(r.label || '-')}</span>
                    <span class="text-xs font-bold text-slate-500">${value}</span>
                </div>
                <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full rounded-full ${colorClass}" style="width:${pct}%"></div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

function _accParetoChart(rows, emptyText) {
    const allRows = Array.isArray(rows) ? rows : [];
    const sourceRows = allRows.slice(0, 5);
    const hasRows = sourceRows.length > 0;
    const chartRows = hasRows
        ? sourceRows
        : Array.from({ length: 5 }, (_, i) => ({ label: `Type ${i + 1}`, cnt: 0 }));
    const top5Total = sourceRows.reduce((sum, row) => sum + (parseInt(row.cnt, 10) || 0), 0);
    const allTotal = allRows.reduce((sum, row) => sum + (parseInt(row.cnt, 10) || 0), 0);
    const total = allTotal || top5Total;
    const topRow = sourceRows[0] || null;
    const topCount = parseInt(topRow?.cnt, 10) || 0;
    const topShare = total ? (topCount * 100 / total) : 0;
    const coverage = total ? (top5Total * 100 / total) : 0;
    const maxValue = Math.max(1, ...chartRows.map(row => parseInt(row.cnt, 10) || 0));
    const yMax = Math.max(5, Math.ceil(maxValue / 5) * 5);
    const left = 50;
    const top = 30;
    const width = 540;
    const height = 210;
    const bottom = top + height;
    const barSlot = width / chartRows.length;
    const barWidth = Math.min(58, barSlot * 0.52);
    let running = 0;
    const points = chartRows.map((row, i) => {
        const value = parseInt(row.cnt, 10) || 0;
        running += value;
        const cumulative = total ? (running * 100 / total) : 0;
        const x = left + (barSlot * i) + (barSlot / 2);
        const barH = value ? Math.max(3, value / yMax * height) : 0;
        const y = bottom - barH;
        const lineY = bottom - (Math.max(0, Math.min(100, cumulative)) / 100 * height);
        return { row, value, cumulative, x, y, lineY, barH };
    });
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.lineY}`).join(' ');
    const paretoY = bottom - (0.8 * height);
    const grid = [0, 25, 50, 75, 100].map(pct => {
        const y = bottom - (pct / 100 * height);
        const countLabel = Math.round(yMax * pct / 100);
        return `
            <line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
            <text x="${left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${countLabel}</text>
            <text x="${left + width + 18}" y="${y + 4}" text-anchor="start" font-size="10" fill="#94a3b8">${pct}%</text>
        `;
    }).join('');

    return `
        <div class="rounded-xl border border-slate-100 bg-white p-3">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                <div class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-black uppercase text-slate-400">Top Type</p>
                    <p class="mt-0.5 truncate text-xs font-black text-slate-800" title="${_htmlEsc(topRow?.label || 'Waiting data')}">${_htmlEsc(topRow?.label || 'Waiting data')}</p>
                </div>
                <div class="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                    <p class="text-[10px] font-black uppercase text-indigo-400">Top 5 Total</p>
                    <p class="mt-0.5 text-sm font-black tabular-nums text-indigo-700">${top5Total.toLocaleString()}</p>
                </div>
                <div class="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                    <p class="text-[10px] font-black uppercase text-emerald-500">Coverage</p>
                    <p class="mt-0.5 text-sm font-black tabular-nums text-emerald-700">${coverage.toFixed(1)}%</p>
                </div>
            </div>
            <div class="flex flex-wrap items-center gap-4 px-1 mb-1 text-[11px] font-bold text-slate-500">
                <span class="inline-flex items-center gap-1.5"><span class="w-5 h-2 rounded bg-indigo-500 inline-block"></span>Total (Case)</span>
                <span class="inline-flex items-center gap-1.5"><span class="w-5 h-[2px] rounded bg-emerald-500 inline-block"></span>Cumulative (%)</span>
                <span class="inline-flex items-center gap-1.5"><span class="w-5 h-[1px] border-t border-dashed border-amber-500 inline-block"></span>80% Pareto</span>
            </div>
            <svg viewBox="0 0 640 310" style="width:100%;height:320px;display:block" role="img" aria-label="Top 5 accident type pareto chart">
                ${grid}
                <line x1="${left}" y1="${paretoY}" x2="${left + width}" y2="${paretoY}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="5 5"/>
                <text x="${left + width - 4}" y="${paretoY - 6}" text-anchor="end" font-size="10" font-weight="800" fill="#d97706">80%</text>
                <line x1="${left}" y1="${bottom}" x2="${left + width}" y2="${bottom}" stroke="#cbd5e1" stroke-width="1.2"/>
                <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#cbd5e1" stroke-width="1.2"/>
                <line x1="${left + width}" y1="${top}" x2="${left + width}" y2="${bottom}" stroke="#cbd5e1" stroke-width="1.2"/>
                ${points.map((p, i) => {
                    const label = String(p.row.label || '-');
                    const shortLabel = label.length > 14 ? `${label.slice(0, 13)}.` : label;
                    const barX = p.x - (barWidth / 2);
                    const fill = hasRows ? (i === 0 ? '#312e81' : '#4f46e5') : '#cbd5e1';
                    const ghostH = hasRows ? 0 : [72, 58, 44, 34, 26][i];
                    const displayH = p.barH || ghostH;
                    const displayY = bottom - displayH;
                    return `
                        <rect x="${barX}" y="${displayY}" width="${barWidth}" height="${displayH}" rx="5" fill="${fill}" opacity="${hasRows ? '0.92' : '0.35'}"/>
                        <text x="${p.x}" y="${displayY - 9}" text-anchor="middle" font-size="12" font-weight="800" fill="${hasRows ? '#1e293b' : '#94a3b8'}">${p.value}</text>
                        <text x="${p.x}" y="${bottom + 27}" text-anchor="middle" font-size="11" font-weight="700" fill="#475569">${_htmlEsc(shortLabel)}</text>
                        ${hasRows ? `<text x="${p.x}" y="${p.lineY - 13}" text-anchor="middle" font-size="11" font-weight="800" fill="#047857">${p.cumulative.toFixed(1)}%</text>` : ''}
                    `;
                }).join('')}
                ${hasRows ? `
                    <path d="${linePath}" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    ${points.map(p => `<circle cx="${p.x}" cy="${p.lineY}" r="4" fill="#10b981" stroke="#fff" stroke-width="2"/>`).join('')}
                ` : `
                    <path d="M ${left + 42} ${bottom - 34} L ${left + 126} ${bottom - 56} L ${left + 210} ${bottom - 48} L ${left + 294} ${bottom - 70} L ${left + 378} ${bottom - 62}" fill="none" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="5 5" stroke-linecap="round"/>
                    <text x="${left + width / 2}" y="${bottom - 118}" text-anchor="middle" font-size="12" font-weight="700" fill="#94a3b8">${_htmlEsc(emptyText || 'Waiting data')}</text>
                `}
            </svg>
            <div class="mt-1 flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px]">
                <span class="font-bold text-slate-500">Primary driver</span>
                <span class="min-w-0 truncate font-black text-slate-800">${_htmlEsc(topRow?.label || 'Waiting data')} ${hasRows ? `(${topShare.toFixed(1)}%)` : ''}</span>
            </div>
        </div>
    `;
}

function _accTrendLineChart(rows, emptyText, options = {}) {
    const cfg = {
        key: 'accidentCases',
        label: 'Accident Cases',
        ytdLabel: 'Accident Cases YTD',
        avgLabel: 'Accident Avg / Month',
        avgLegend: 'Accident Year Avg',
        peakLegend: 'Peak Accident Month',
        badge: 'Accident cases - Near Miss excluded',
        notePrefix: 'Accident cases',
        ariaLabel: 'Accident cases trend 12 months chart',
        line: '#2563eb',
        lineText: '#1d4ed8',
        softBg: 'bg-blue-50',
        softBorder: 'border-blue-100',
        softText: 'text-blue-700',
        mutedText: 'text-blue-400',
        avg: '#22c55e',
        peak: '#ef4444',
        badgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
        areaId: 'acc-trend-area',
        valueFromRow: row => Math.max(0, (parseInt(row.total, 10) || 0) - (parseInt(row.nearMiss, 10) || 0)),
        noteSuffix: 'Near Miss is shown in a separate card.',
        ...options,
    };
    const monthLabels = MONTHS_EN || ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const sourceRows = Array.isArray(rows) ? rows : [];
    const dataMap = {};
    sourceRows.forEach(row => {
        const mo = parseInt(row.mo || (row.period ? String(row.period).slice(5, 7) : ''), 10);
        if (mo >= 1 && mo <= 12) dataMap[mo] = Math.max(0, parseInt(cfg.valueFromRow(row), 10) || 0);
    });
    const values = monthLabels.map((_m, i) => dataMap[i + 1] || 0);
    const hasRows = sourceRows.length > 0 && values.some(v => v > 0);
    const maxValue = Math.max(5, ...values, hasRows ? 0 : 8);
    const yMax = Math.max(5, Math.ceil(maxValue / 5) * 5);
    const avg = values.reduce((sum, v) => sum + v, 0) / 12;
    const ytdTotal = values.reduce((sum, v) => sum + v, 0);
    const peakValue = Math.max(...values);
    const peakIndex = values.indexOf(peakValue);
    const lastIndex = values.reduce((last, value, i) => value > 0 ? i : last, -1);
    const currentValue = lastIndex >= 0 ? values[lastIndex] : 0;
    const previousValue = lastIndex > 0 ? values[lastIndex - 1] : 0;
    const change = currentValue - previousValue;
    const left = 54;
    const top = 30;
    const width = 850;
    const height = 210;
    const bottom = top + height;
    const step = width / 11;
    const pointFor = (value, i) => ({
        x: left + (step * i),
        y: bottom - ((value / yMax) * height),
        value,
    });
    const points = values.map(pointFor);
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const avgY = bottom - ((avg / yMax) * height);
    const grid = [0, 25, 50, 75, 100].map(pct => {
        const y = bottom - (pct / 100 * height);
        const label = Math.round(yMax * pct / 100);
        return `
            <line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
            <text x="${left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${label}</text>
        `;
    }).join('');

    return `
        <div class="rounded-xl border border-slate-100 bg-white p-3">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div class="rounded-lg border ${cfg.softBorder} ${cfg.softBg} px-3 py-2">
                    <p class="text-[10px] font-black uppercase ${cfg.mutedText}">${_htmlEsc(cfg.ytdLabel)}</p>
                    <p class="mt-0.5 text-sm font-black tabular-nums ${cfg.softText}">${ytdTotal.toLocaleString()}</p>
                </div>
                <div class="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                    <p class="text-[10px] font-black uppercase text-emerald-500">${_htmlEsc(cfg.avgLabel)}</p>
                    <p class="mt-0.5 text-sm font-black tabular-nums text-emerald-700">${avg.toFixed(1)}</p>
                </div>
                <div class="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                    <p class="text-[10px] font-black uppercase text-amber-500">Peak</p>
                    <p class="mt-0.5 truncate text-sm font-black text-amber-700">${hasRows ? `${monthLabels[peakIndex]} ${peakValue}` : '-'}</p>
                </div>
                <div class="rounded-lg border ${change > 0 ? 'border-red-100 bg-red-50' : 'border-slate-100 bg-slate-50'} px-3 py-2">
                    <p class="text-[10px] font-black uppercase ${change > 0 ? 'text-red-500' : 'text-slate-400'}">Vs Prev.</p>
                    <p class="mt-0.5 text-sm font-black tabular-nums ${change > 0 ? 'text-red-700' : 'text-slate-700'}">${hasRows ? `${change >= 0 ? '+' : ''}${change}` : '-'}</p>
                </div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3 px-1 mb-2 text-[11px] font-bold text-slate-500">
                <div class="flex flex-wrap items-center gap-4">
                    <span class="inline-flex items-center gap-1.5"><span class="w-5 h-[2px] rounded inline-block" style="background:${cfg.line}"></span>${_htmlEsc(cfg.label)}</span>
                    <span class="inline-flex items-center gap-1.5"><span class="w-5 h-[2px] rounded inline-block border-t border-dashed" style="background:${cfg.avg};border-color:${cfg.avg}"></span>${_htmlEsc(cfg.avgLegend)}</span>
                    <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full inline-block" style="background:${cfg.peak}"></span>${_htmlEsc(cfg.peakLegend)}</span>
                </div>
                <span class="rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-normal ${cfg.badgeClass}">${_htmlEsc(cfg.badge)}</span>
            </div>
            <svg viewBox="0 0 960 300" style="width:100%;height:320px;display:block" role="img" aria-label="${_htmlEsc(cfg.ariaLabel)}">
                <defs>
                    <linearGradient id="${_htmlEsc(cfg.areaId)}" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stop-color="${cfg.line}" stop-opacity="0.18"/>
                        <stop offset="100%" stop-color="${cfg.line}" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                ${grid}
                <line x1="${left}" y1="${bottom}" x2="${left + width}" y2="${bottom}" stroke="#cbd5e1" stroke-width="1.2"/>
                <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#cbd5e1" stroke-width="1.2"/>
                ${hasRows ? `<path d="${linePath} L ${left + width} ${bottom} L ${left} ${bottom} Z" fill="url(#${_htmlEsc(cfg.areaId)})"/>` : ''}
                <path d="${linePath}" fill="none" stroke="${hasRows ? cfg.line : '#cbd5e1'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ${hasRows ? '' : 'stroke-dasharray="5 5"'}/>
                ${hasRows ? `<line x1="${left}" y1="${avgY}" x2="${left + width}" y2="${avgY}" stroke="${cfg.avg}" stroke-width="2" stroke-dasharray="6 5"/>` : ''}
                ${points.map((p, i) => `
                    <circle cx="${p.x}" cy="${p.y}" r="${hasRows && i === peakIndex ? 6 : 4}" fill="${hasRows ? (i === peakIndex ? cfg.peak : cfg.line) : '#cbd5e1'}" stroke="#fff" stroke-width="2"/>
                    <text x="${p.x}" y="${p.y - 12}" text-anchor="middle" font-size="12" font-weight="800" fill="${hasRows ? (i === peakIndex ? '#b91c1c' : '#1e293b') : '#94a3b8'}">${p.value}</text>
                    <text x="${p.x}" y="${bottom + 26}" text-anchor="middle" font-size="11" font-weight="700" fill="#475569">${monthLabels[i]}</text>
                `).join('')}
                ${!hasRows ? `<text x="${left + width / 2}" y="${bottom - 82}" text-anchor="middle" font-size="12" font-weight="700" fill="#94a3b8">${_htmlEsc(emptyText || 'Waiting data')}</text>` : ''}
            </svg>
            <div class="mt-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
                ${hasRows ? `${_htmlEsc(cfg.notePrefix)}: peak month is <span class="text-slate-800">${monthLabels[peakIndex]}</span>, current movement <span class="${change > 0 ? 'text-red-600' : 'text-emerald-600'}">${change >= 0 ? '+' : ''}${change}</span> vs previous month. ${_htmlEsc(cfg.noteSuffix)}` : _htmlEsc(emptyText || 'Waiting data')}
            </div>
        </div>
    `;
}

function _accHotspotKey(area) {
    return String(area || '').trim();
}

function _accHotspotDefaultPoint(area, index) {
    const text = _accHotspotKey(area).toLowerCase();
    if (/\b1\b|factory 1/.test(text)) return ACCIDENT_LAYOUT_DEFAULT_POINTS[0];
    if (/\b2\b|factory 2/.test(text)) return ACCIDENT_LAYOUT_DEFAULT_POINTS[1];
    if (/\b3\b|factory 3/.test(text)) return ACCIDENT_LAYOUT_DEFAULT_POINTS[2];
    if (/\b4\b|factory 4/.test(text)) return ACCIDENT_LAYOUT_DEFAULT_POINTS[3];
    return ACCIDENT_LAYOUT_DEFAULT_POINTS[index % ACCIDENT_LAYOUT_DEFAULT_POINTS.length];
}

function _accHotspotPosition(area, index) {
    const key = _accHotspotKey(area);
    const saved = _hotspotPositions[key];
    if (saved) {
        const x = Number(saved.MapXPercent ?? saved.mapXPercent ?? saved.x);
        const y = Number(saved.MapYPercent ?? saved.mapYPercent ?? saved.y);
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y, saved: true };
    }
    return { ..._accHotspotDefaultPoint(area, index), saved: false };
}

function _accRenderHotspotOnly() {
    const el = document.getElementById('acc-hotspot-card');
    if (el) el.outerHTML = _accHotspotCard(_lastHotspotRows, 'Waiting for location data');
}

function _accHotspotCard(rows, emptyText) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const hasRows = sourceRows.length > 0;
    const displayRows = hasRows
        ? sourceRows.slice(0, 5)
        : Array.from({ length: 5 }, (_, i) => ({ area: `Zone ${i + 1}`, cnt: 0, recordable: 0 }));
    const total = sourceRows.reduce((sum, row) => sum + (parseInt(row.cnt, 10) || 0), 0);
    const topRow = sourceRows[0] || null;
    const topCount = parseInt(topRow?.cnt, 10) || 0;
    const topShare = total ? (topCount * 100 / total) : 0;
    const top3Total = sourceRows.slice(0, 3).reduce((sum, row) => sum + (parseInt(row.cnt, 10) || 0), 0);
    const concentration = total ? (top3Total * 100 / total) : 0;
    const maxValue = Math.max(1, ...displayRows.map(row => parseInt(row.cnt, 10) || 0));
    const colorSet = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#94a3b8'];
    if (!_hotspotEditArea && displayRows[0]?.area) _hotspotEditArea = _accHotspotKey(displayRows[0].area);

    return `
        <div id="acc-hotspot-card" class="rounded-xl border border-slate-100 bg-white p-3">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                <div class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-black uppercase text-slate-400">Top Area</p>
                    <p class="mt-0.5 truncate text-xs font-black text-slate-800" title="${_htmlEsc(topRow?.area || 'Waiting data')}">${_htmlEsc(topRow?.area || 'Waiting data')}</p>
                </div>
                <div class="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
                    <p class="text-[10px] font-black uppercase text-orange-500">Total Cases</p>
                    <p class="mt-0.5 text-sm font-black tabular-nums text-orange-700">${total.toLocaleString()}</p>
                </div>
                <div class="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                    <p class="text-[10px] font-black uppercase text-red-500">Concentration</p>
                    <p class="mt-0.5 text-sm font-black tabular-nums text-red-700">${concentration.toFixed(1)}%</p>
                </div>
            </div>

            ${_isAdmin ? `
            <div class="mb-3 flex flex-col gap-2 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between" data-acc-card-ignore>
                <div class="min-w-0">
                    <p class="text-xs font-black text-orange-700">Hotspot position editor</p>
                    <p class="text-[11px] font-bold text-orange-500">${_hotspotEditMode ? 'Select area, then click the factory layout to place the point.' : 'Admin can fine-tune map points for production accuracy.'}</p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <select class="form-input h-9 min-w-[220px] py-0 text-xs font-bold" onchange="window._accSetHotspotEditArea(this.value)" ${_hotspotEditMode ? '' : 'disabled'}>
                        ${displayRows.map(row => {
                            const area = _accHotspotKey(row.area);
                            return `<option value="${_htmlEsc(area)}" ${area === _hotspotEditArea ? 'selected' : ''}>${_htmlEsc(area || 'Waiting data')}</option>`;
                        }).join('')}
                    </select>
                    <button type="button" onclick="window._accToggleHotspotEdit()" class="rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-black text-orange-700 hover:bg-orange-100">${_hotspotEditMode ? 'Done editing' : 'Edit positions'}</button>
                    <button type="button" onclick="window._accSaveHotspotPositions()" class="rounded-lg bg-orange-600 px-3 py-2 text-xs font-black text-white hover:bg-orange-700" ${_hotspotEditMode ? '' : 'disabled'}>Save</button>
                </div>
            </div>` : ''}

            <div class="grid grid-cols-1 2xl:grid-cols-[minmax(560px,1.35fr)_minmax(300px,0.65fr)] gap-4 items-stretch">
                <div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div class="mb-2 flex items-center justify-between">
                        <span class="text-[10px] font-black uppercase text-slate-400">Factory Layout</span>
                        <span class="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">${hasRows ? `${displayRows.length} hotspots` : 'standby'}</span>
                    </div>
                    <div id="acc-hotspot-map" onclick="window._accHotspotMapClick(event)" class="relative overflow-hidden rounded-xl border border-slate-200 bg-white ${_hotspotEditMode ? 'cursor-crosshair ring-2 ring-orange-200' : ''}" style="min-height:420px">
                        <img src="${ACCIDENT_LAYOUT_IMAGE}" alt="TSH factory layout" class="block w-full select-none object-contain" draggable="false"
                            onerror="this.classList.add('hidden');this.nextElementSibling.classList.remove('hidden')">
                        <div class="hidden min-h-[420px] items-center justify-center px-6 text-center text-sm font-bold text-slate-400">Factory layout image is unavailable.</div>
                        ${displayRows.map((row, i) => {
                            const count = parseInt(row.cnt, 10) || 0;
                            const area = _accHotspotKey(row.area);
                            const point = _accHotspotPosition(area, i);
                            const radius = hasRows ? 7 + (count / maxValue * 11) : [12, 10, 8, 7, 6][i];
                            const color = hasRows ? colorSet[Math.min(i, colorSet.length - 1)] : '#cbd5e1';
                            const opacity = hasRows ? (i === 0 ? 0.9 : 0.68) : 0.28;
                            return `
                                <button type="button" onclick="window._accSelectHotspotPoint(event,'${_esc(area)}')"
                                    title="${_htmlEsc(area)}"
                                    class="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white text-[11px] font-black text-white shadow-lg transition-transform hover:scale-110 ${_hotspotEditMode && area === _hotspotEditArea ? 'ring-4 ring-orange-300' : ''}"
                                    style="left:${point.x}%;top:${point.y}%;width:${radius * 2.2}px;height:${radius * 2.2}px;background:${color};opacity:${opacity}">
                                    ${i + 1}
                                </button>
                                <span class="pointer-events-none absolute z-0 -translate-x-1/2 -translate-y-1/2 rounded-full" style="left:${point.x}%;top:${point.y}%;width:${(radius + 10) * 2}px;height:${(radius + 10) * 2}px;background:${color};opacity:${opacity * 0.14}"></span>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div class="min-w-0">
                    <div class="space-y-3">
                        ${displayRows.map((row, i) => {
                            const count = parseInt(row.cnt, 10) || 0;
                            const share = total ? (count * 100 / total) : 0;
                            const width = hasRows ? Math.max(6, Math.round(count * 100 / maxValue)) : [74, 58, 44, 32, 24][i];
                            const color = hasRows ? colorSet[Math.min(i, colorSet.length - 1)] : '#cbd5e1';
                            const recordable = parseInt(row.recordable, 10) || 0;
                            return `
                                <div>
                                    <div class="mb-1 flex items-center justify-between gap-3">
                                        <span class="min-w-0 inline-flex items-center gap-2 text-xs font-black text-slate-700">
                                            <span class="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full" style="background:${color};color:#fff">${i + 1}</span>
                                            <span class="truncate" title="${_htmlEsc(row.area || 'Waiting data')}">${_htmlEsc(row.area || 'Waiting data')}</span>
                                        </span>
                                        <span class="flex-shrink-0 text-xs font-bold tabular-nums text-slate-500">${count.toLocaleString()} case${count === 1 ? '' : 's'} · ${share.toFixed(1)}%</span>
                                    </div>
                                    <div class="h-2.5 overflow-hidden rounded-full bg-slate-100">
                                        <div class="h-full rounded-full transition-all" style="width:${width}%;background:${color}"></div>
                                    </div>
                                    ${recordable ? `<p class="mt-1 text-[10px] font-bold text-orange-600">${recordable} recordable</p>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px]">
                        <span class="font-bold text-slate-500">Primary hotspot</span>
                        <span class="ml-2 font-black text-slate-800">${_htmlEsc(topRow?.area || emptyText || 'Waiting data')} ${hasRows ? `(${topShare.toFixed(1)}%)` : ''}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

window._accToggleHotspotEdit = () => {
    if (!_isAdmin) return;
    _hotspotEditMode = !_hotspotEditMode;
    if (!_hotspotEditArea && _lastHotspotRows[0]?.area) _hotspotEditArea = _accHotspotKey(_lastHotspotRows[0].area);
    _accRenderHotspotOnly();
};

window._accSetHotspotEditArea = value => {
    if (!_isAdmin) return;
    _hotspotEditArea = _accHotspotKey(value);
    _accRenderHotspotOnly();
};

window._accSelectHotspotPoint = (event, area) => {
    event?.stopPropagation?.();
    if (!_isAdmin || !_hotspotEditMode) return;
    _hotspotEditArea = _accHotspotKey(area);
    _accRenderHotspotOnly();
};

window._accHotspotMapClick = event => {
    if (!_isAdmin || !_hotspotEditMode) return;
    const map = event.currentTarget;
    const area = _hotspotEditArea || _accHotspotKey(_lastHotspotRows[0]?.area);
    if (!map || !area) return;
    const rect = map.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    _hotspotEditArea = area;
    _hotspotPositions[area] = {
        AreaName: area,
        DisplayName: area,
        MapXPercent: Number(x.toFixed(3)),
        MapYPercent: Number(y.toFixed(3)),
        IsPinned: 1,
    };
    _accRenderHotspotOnly();
};

window._accSaveHotspotPositions = async () => {
    if (!_isAdmin) return;
    const areas = new Set(_lastHotspotRows.map(row => _accHotspotKey(row.area)).filter(Boolean));
    const positions = Object.values(_hotspotPositions)
        .filter(row => areas.has(_accHotspotKey(row.AreaName || row.areaName || row.area)))
        .map(row => ({
            AreaName: _accHotspotKey(row.AreaName || row.areaName || row.area),
            DisplayName: _accHotspotKey(row.DisplayName || row.displayName || row.AreaName || row.areaName || row.area),
            MapXPercent: Number(row.MapXPercent ?? row.mapXPercent ?? row.x),
            MapYPercent: Number(row.MapYPercent ?? row.mapYPercent ?? row.y),
            IsPinned: 1,
        }));
    if (!positions.length) {
        showToast('ยังไม่มีตำแหน่งให้บันทึก', 'warning');
        return;
    }
    try {
        showLoading('Saving hotspot positions...');
        const res = await API.put('/accident/hotspot-positions', { positions });
        if (_accApiResponseFailed(res)) throw new Error(`HTTP ${res.status}`);
        _hotspotPositions = {};
        (res.data || []).forEach(row => {
            const key = _accHotspotKey(row.AreaName);
            if (key) _hotspotPositions[key] = row;
        });
        _hotspotEditMode = false;
        showToast('บันทึกตำแหน่ง Hotspot แล้ว', 'success');
        _accRenderHotspotOnly();
    } catch (err) {
        showToast('บันทึกตำแหน่ง Hotspot ไม่สำเร็จ กรุณาลองใหม่', 'error');
    } finally {
        hideLoading();
    }
};

function _accBodyPartMap(rows, emptyText) {
    const hasRows = Array.isArray(rows) && rows.length > 0;
    const topRows = hasRows ? rows.slice(0, 5) : [];
    const topTotal = topRows.reduce((sum, row) => sum + (parseInt(row.cnt, 10) || 0), 0);
    const allTotal = hasRows ? rows.reduce((sum, row) => sum + (parseInt(row.cnt, 10) || 0), 0) : 0;
    const otherTotal = Math.max(0, allTotal - topTotal);
    const colors = ['#ef4444', '#f97316', '#eab308', '#10b981', '#6366f1'];
    const textOf = row => String(row?.label || '').toLowerCase();
    const hasPart = (...keywords) => topRows.some(row => keywords.some(keyword => textOf(row).includes(keyword)));
    const parts = {
        head: hasPart('head', 'face', 'eye', 'ear', 'mouth', 'nose', 'neck', 'ศีรษะ', 'หน้า', 'ตา', 'หู', 'ปาก', 'จมูก', 'คอ'),
        torso: hasPart('chest', 'body', 'back', 'waist', 'shoulder', 'ท้อง', 'อก', 'ลำตัว', 'หลัง', 'เอว', 'ไหล่'),
        arm: hasPart('arm', 'elbow', 'hand', 'finger', 'wrist', 'แขน', 'ศอก', 'มือ', 'นิ้วมือ', 'ข้อมือ'),
        leg: hasPart('leg', 'knee', 'foot', 'ankle', 'toe', 'ขา', 'เข่า', 'เท้า', 'ข้อเท้า', 'นิ้วเท้า'),
    };
    const hotspotCount = Object.values(parts).filter(Boolean).length;
    const topPart = topRows[0] || null;
    const topPartCount = parseInt(topPart?.cnt, 10) || 0;
    const topPartPct = allTotal ? (topPartCount * 100 / allTotal) : 0;
    const maxCount = Math.max(1, ...topRows.map(row => parseInt(row.cnt, 10) || 0));
    const bodyHotspots = `
        ${parts.head ? `
            <path d="M49 15 C53 8 67 8 71 15 C69 18 65 20 60 20 C55 20 51 18 49 15Z" fill="#ef4444" opacity="0.9"/>
        ` : ''}
        ${parts.torso ? `
            <path d="M48 78 C52 73 68 73 72 78 C71 86 68 92 60 92 C52 92 49 86 48 78Z" fill="#ef4444" opacity="0.82"/>
        ` : ''}
        ${parts.arm ? `
            <path d="M18 130 C15 136 17 146 24 148 C31 148 34 140 31 133 C28 126 22 125 18 130Z" fill="#ef4444" opacity="0.9"/>
            <path d="M102 130 C105 136 103 146 96 148 C89 148 86 140 89 133 C92 126 98 125 102 130Z" fill="#ef4444" opacity="0.9"/>
        ` : ''}
        ${parts.leg ? `
            <path d="M35 174 C31 184 31 197 37 202 C44 199 45 187 43 176 C41 169 38 168 35 174Z" fill="#ef4444" opacity="0.85"/>
            <path d="M77 174 C75 187 76 199 83 202 C89 197 89 184 85 174 C82 168 79 169 77 174Z" fill="#ef4444" opacity="0.85"/>
        ` : ''}
    `;
    const bodyRowHtml = hasRows ? topRows.map((row, i) => {
        const count = parseInt(row.cnt, 10) || 0;
        const pct = allTotal ? (count * 100 / allTotal) : 0;
        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="py-2 pr-2">
                    <span class="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                        <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-500">${i + 1}</span>
                        <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${colors[i]}"></span>
                        <span class="truncate max-w-[130px]" title="${_htmlEsc(row.label || '-')}">${_htmlEsc(row.label || '-')}</span>
                    </span>
                    <div class="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                        <div class="h-full rounded-full" style="width:${Math.max(8, Math.round(count * 100 / maxCount))}%;background:${colors[i]}"></div>
                    </div>
                </td>
                <td class="py-2 px-2 text-right text-xs font-black tabular-nums text-slate-700">${count.toLocaleString()}</td>
                <td class="py-2 pl-2 text-right text-xs font-bold tabular-nums text-slate-500">${pct.toFixed(1)}%</td>
            </tr>`;
    }).join('') : Array.from({ length: 5 }, (_, i) => `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="py-2 pr-2">
                    <span class="inline-flex items-center gap-2 text-xs font-bold text-slate-400">
                        <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-300">${i + 1}</span>
                        <span class="w-2 h-2 rounded-full flex-shrink-0 bg-slate-200"></span>
                        <span class="truncate max-w-[130px]">Waiting data</span>
                    </span>
                    <div class="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                        <div class="h-full rounded-full bg-slate-200" style="width:${[64, 52, 40, 30, 22][i]}%"></div>
                    </div>
                </td>
                <td class="py-2 px-2 text-right text-xs font-black tabular-nums text-slate-300">0</td>
                <td class="py-2 pl-2 text-right text-xs font-bold tabular-nums text-slate-300">0.0%</td>
            </tr>`).join('');
    const otherPct = allTotal ? (otherTotal * 100 / allTotal) : 0;
    return `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <div class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <p class="text-[10px] font-black uppercase text-slate-400">Top Area</p>
                <p class="mt-0.5 truncate text-xs font-black text-slate-800" title="${_htmlEsc(topPart?.label || 'Waiting data')}">${_htmlEsc(topPart?.label || 'Waiting data')}</p>
            </div>
            <div class="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                <p class="text-[10px] font-black uppercase text-red-400">Top Share</p>
                <p class="mt-0.5 text-sm font-black tabular-nums text-red-700">${topPartPct.toFixed(1)}%</p>
            </div>
            <div class="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                <p class="text-[10px] font-black uppercase text-emerald-500">Hotspots</p>
                <p class="mt-0.5 text-sm font-black tabular-nums text-emerald-700">${hotspotCount}/4</p>
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-4 items-center">
            <div class="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-center">
                <svg viewBox="0 0 120 220" class="w-[130px] h-[220px]" role="img" aria-label="Injury body map">
                    <defs>
                        <filter id="acc-body-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#0f172a" flood-opacity="0.08"/>
                        </filter>
                    </defs>
                    <g filter="url(#acc-body-soft-shadow)">
                        <path d="M60 8
                                 C50 8 43 16 43 27
                                 C43 37 50 45 60 45
                                 C70 45 77 37 77 27
                                 C77 16 70 8 60 8Z"
                              fill="#ffffff" stroke="#64748b" stroke-width="1.8" stroke-linejoin="round"/>
                        <path d="M50 48
                                 C53 51 56 53 60 53
                                 C64 53 67 51 70 48
                                 L78 56
                                 C84 65 87 82 90 103
                                 L99 141
                                 C100 147 93 150 89 145
                                 L78 110
                                 C75 99 72 82 68 68
                                 C72 92 73 118 69 143
                                 L82 205
                                 C84 214 72 217 69 208
                                 L60 153
                                 L51 208
                                 C48 217 36 214 38 205
                                 L51 143
                                 C47 118 48 92 52 68
                                 C48 82 45 99 42 110
                                 L31 145
                                 C27 150 20 147 21 141
                                 L30 103
                                 C33 82 36 65 42 56Z"
                              fill="#ffffff" stroke="#64748b" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
                        ${bodyHotspots}
                        <path d="M53 25 C56 27 64 27 67 25" fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round"/>
                        <path d="M45 63 C53 70 67 70 75 63" fill="none" stroke="#cbd5e1" stroke-width="1"/>
                        <path d="M60 72 L60 151" fill="none" stroke="#cbd5e1" stroke-width="1"/>
                        <path d="M51 143 C55 147 65 147 69 143" fill="none" stroke="#cbd5e1" stroke-width="1"/>
                    </g>
                </svg>
            </div>
            <div class="min-w-0">
                <div class="grid grid-cols-[1fr_54px_54px] gap-2 px-1 pb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    <span>Body Part</span><span class="text-right">Case</span><span class="text-right">%</span>
                </div>
                <table class="w-full table-fixed"><tbody>${bodyRowHtml}</tbody></table>
                ${otherTotal ? `
                <div class="grid grid-cols-[1fr_54px_54px] gap-2 px-1 pt-2 text-xs font-bold text-slate-500">
                    <span>Others</span><span class="text-right tabular-nums">${otherTotal.toLocaleString()}</span><span class="text-right tabular-nums">${otherPct.toFixed(1)}%</span>
                </div>` : ''}
                ${!hasRows ? `<div class="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-bold text-slate-400">${emptyText}</div>` : ''}
            </div>
        </div>`;
}

async function _renderDashboardPanel() {
    const requestId = ++_dashboardRequest;
    const year = _statsYear;
    const panel = document.getElementById('acc-panel-dashboard');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    let loadFailed = false;
    if (!_summary) {
        try {
            const res = await API.get(`/accident/summary?year=${year}`);
            if (requestId !== _dashboardRequest || year !== _statsYear || _activeTab !== 'dashboard') return;
            _summary  = res.data || null;
        } catch {
            if (requestId !== _dashboardRequest || year !== _statsYear || _activeTab !== 'dashboard') return;
            _summary = null;
            loadFailed = true;
        }
    }
    if (loadFailed) {
        panel.innerHTML = '<div class="text-center py-16 text-slate-400 text-sm">โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่</div>';
        return;
    }

    const kpi       = _summary?.kpi      || {};
    const byType    = _summary?.byType   || [];
    const byDept    = _summary?.byDept   || [];
    const recentReports = _summary?.recentReports || [];
    const openActions = _summary?.openActions || [];

    const total      = parseInt(kpi.total)      || 0;
    const lostDays   = parseInt(kpi.lostDays)   || 0;
    const fatal      = parseInt(kpi.fatal)      || 0;
    const typeMax    = Math.max(1, ...byType.map(t => parseInt(t.cnt, 10) || 0));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const followup = {
        open: openActions.length,
        overdue: openActions.filter(r => r.DueDate && new Date(r.DueDate) < today).length,
        dueSoon: openActions.filter(r => _followupState(r).key === 'dueSoon').length,
        noOwner: openActions.filter(r => _followupState(r).key === 'noOwner').length,
    };

    const kpiCards = [
        {
            label: 'รวมทั้งหมด', val: total, sub: 'รายการทั้งหมด',
            iclr: 'bg-slate-100', itext: 'text-slate-600',
            vclr: 'text-slate-800',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>',
        },
        {
            label: 'Lost Time Days', val: lostDays, sub: 'วันหยุดงานสะสม',
            iclr: 'bg-red-50', itext: 'text-red-600',
            vclr: 'text-red-600',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>',
        },
        {
            label: 'Open Follow-up', val: followup.open, sub: followup.overdue ? `${followup.overdue} overdue` : 'ไม่มีงานเกินกำหนด',
            iclr: followup.overdue ? 'bg-red-50' : 'bg-emerald-50',
            itext: followup.overdue ? 'text-red-600' : 'text-emerald-600',
            vclr: followup.overdue ? 'text-red-600' : 'text-emerald-600',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"/>',
        },
        {
            label: 'CAPA Watch', val: followup.dueSoon + followup.noOwner, sub: `${followup.dueSoon} due soon · ${followup.noOwner} no owner`,
            iclr: (followup.dueSoon + followup.noOwner) ? 'bg-amber-50' : 'bg-emerald-50',
            itext: (followup.dueSoon + followup.noOwner) ? 'text-amber-600' : 'text-emerald-600',
            vclr: (followup.dueSoon + followup.noOwner) ? 'text-amber-600' : 'text-emerald-600',
            icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>',
        },
    ];

    panel.innerHTML = `
    <div class="space-y-6">

        <div id="acc-dashboard-performance"></div>

        <!-- Accident Overview -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            ${kpiCards.map((c, idx) => `
            <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm" data-acc-card-image="accident-${['total-reports','lost-time-days','open-follow-up','capa-watch'][idx] || 'overview-card'}">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${c.iclr}">
                        <svg class="w-4 h-4 ${c.itext}" fill="none" viewBox="0 0 24 24" stroke="currentColor">${c.icon}</svg>
                    </div>
                    <p class="text-xs text-slate-500 font-medium">${c.label}</p>
                </div>
                <p class="text-3xl font-bold ${c.vclr}">${c.val}</p>
                <p class="text-xs text-slate-400 mt-1">${c.sub}</p>
            </div>`).join('')}
        </div>

        <div class="grid lg:grid-cols-2 gap-6">
            <div class="ds-section overflow-hidden">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0ea5e9)"></div>
                <div class="p-5">
                    <div class="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">Recent Safety Reports</h3>
                            <p class="text-xs text-slate-400">รายงานล่าสุดที่ถูกบันทึกเข้าระบบ</p>
                        </div>
                        <button onclick="window._accGoReports()" class="text-xs font-bold text-emerald-700 hover:underline">ดูทั้งหมด</button>
                    </div>
                    ${_accReportList(recentReports, 'ยังไม่มีรายงานล่าสุด')}
                </div>
            </div>
            <div class="ds-section overflow-hidden">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#f97316,#dc2626)"></div>
                <div class="p-5">
                    <div class="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">Open Action Tracker</h3>
                            <p class="text-xs text-slate-400">งานที่ยังไม่ปิดและรายการใกล้/เกินกำหนด</p>
                        </div>
                        <span class="text-xs font-bold ${followup.overdue ? 'text-red-600' : 'text-emerald-600'}">${followup.overdue} overdue</span>
                    </div>
                    ${_accReportList(openActions, 'ไม่มีงานค้างปิดเคส')}
                </div>
            </div>
        </div>

        ${fatal > 0 ? `
        <div class="rounded-xl bg-slate-900 text-white p-4 text-sm font-semibold flex items-center gap-2">
            <svg class="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            พบอุบัติเหตุถึงชีวิต ${fatal} รายในปี ${_statsYear}
        </div>` : ''}

        <!-- Trend Chart + Type Breakdown -->
        <div class="grid xl:grid-cols-[minmax(0,2fr)_minmax(280px,0.8fr)] gap-6">

            <!-- Trend Chart -->
            <div class="ds-section overflow-hidden" data-acc-card-image="accident-safety-trend"
                 style="box-shadow:0 4px 16px rgba(14,165,233,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#0ea5e9,#10b981)"></div>
                <div class="p-5">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                            </svg>
                            <h3 class="text-sm font-bold text-slate-700">แนวโน้มอุบัติเหตุ (Safety Trend)</h3>
                        </div>
                        <span class="text-xs text-slate-400">ปี ${_statsYear}</span>
                    </div>
                    <div style="height:320px"><canvas id="acc-trend-chart"></canvas></div>
                </div>
            </div>

            <!-- Type Breakdown -->
            <div class="ds-section overflow-hidden" data-acc-card-image="accident-case-mix"
                 style="box-shadow:0 4px 16px rgba(249,115,22,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#f97316,#eab308)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">ประเภทอุบัติเหตุ</h3>
                    </div>
                    <div class="mb-4 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3">
                        <p class="text-[10px] font-black uppercase text-orange-500">Case Mix</p>
                        <p class="mt-1 text-2xl font-black tabular-nums text-slate-800">${total.toLocaleString()}</p>
                        <p class="text-xs font-semibold text-slate-400">Total cases in ${_statsYear}</p>
                    </div>
                    ${byType.length === 0
                        ? `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>`
                        : `<div class="space-y-3">
                            ${byType.map(t => {
                                const count = parseInt(t.cnt, 10) || 0;
                                const pct = total ? Math.round(count * 100 / total) : 0;
                                const barPct = Math.max(6, Math.round(count * 100 / typeMax));
                                const col = TYPE_COLOR[t.AccidentType] || { bg: 'bg-slate-100' };
                                return `
                                <div>
                                    <div class="flex items-center justify-between mb-1 text-xs">
                                        <span class="min-w-0 truncate font-bold text-slate-700" title="${_htmlEsc(t.AccidentType || '-')}">${_htmlEsc(t.AccidentType || '-')}</span>
                                        <span class="flex-shrink-0 font-black tabular-nums text-slate-600">${count} (${pct}%)</span>
                                    </div>
                                    <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                        <div class="h-2.5 rounded-full ${col.bg}" style="width:${barPct}%"></div>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>`}
                    ${fatal > 0 ? `
                    <div class="mt-4 rounded-xl bg-slate-900 text-white p-3 text-xs font-semibold flex items-center gap-2">
                        <svg class="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        อุบัติเหตุถึงชีวิต: ${fatal} ราย
                    </div>` : ''}
                </div>
            </div>
        </div>

        <!-- Department Breakdown Chart -->
        <div class="ds-section overflow-hidden" data-acc-card-image="accident-department-breakdown"
             style="box-shadow:0 4px 16px rgba(220,38,38,0.08),0 1px 4px rgba(0,0,0,0.06)">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#dc2626,#9f1239)"></div>
            <div class="p-5">
                <div class="flex items-center gap-2 mb-4">
                    <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">อุบัติเหตุรายแผนก (${_statsYear})</h3>
                </div>
                ${byDept.length === 0
                    ? `<div class="text-center py-12 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูล</p></div>`
                    : `<div style="height:${Math.max(180, byDept.length * 36)}px"><canvas id="acc-dept-chart"></canvas></div>`}
            </div>
        </div>

    </div>`;

    setTimeout(() => { _drawTrendChart(); _drawDeptChart(byDept); }, 0);
    _renderPerformancePanel('acc-dashboard-performance');
}

function _drawTrendChart() {
    const canvas = document.getElementById('acc-trend-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_trendChart) { _trendChart.destroy(); _trendChart = null; }

    const trend = _summary?.trend || [];
    if (trend.length === 0) {
        canvas.parentElement.innerHTML = `<p class="flex items-center justify-center h-full text-slate-400 text-sm">ยังไม่มีข้อมูล</p>`;
        return;
    }

    const labels = trend.map(t => t.period || MONTHS_TH[(parseInt(t.mo) - 1)] || t.mo);
    const totals = trend.map(t => parseInt(t.total)      || 0);
    const recs   = trend.map(t => parseInt(t.recordable) || 0);
    const nearMiss = trend.map(t => parseInt(t.nearMiss) || 0);

    _trendChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'รวม', data: totals, backgroundColor: 'rgba(14,165,233,0.16)', borderColor: '#0ea5e9', borderWidth: 1.5, borderRadius: 6, maxBarThickness: 42, order: 3 },
                { label: 'Recordable', data: recs, type: 'line', borderColor: '#ef4444', backgroundColor: '#ef4444', borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#ef4444', tension: 0.32, fill: false, order: 1 },
                { label: 'Near Miss', data: nearMiss, type: 'line', borderColor: '#f59e0b', backgroundColor: '#f59e0b', borderWidth: 2.25, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#f59e0b', tension: 0.32, fill: false, order: 2 },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', align: 'end', labels: { font: { size: 11 }, usePointStyle: true, boxWidth: 8 } } },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#475569' } },
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 }, color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.22)' } },
            },
        },
    });
}

function _drawDeptChart(byDept) {
    const canvas = document.getElementById('acc-dept-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_deptChart) { _deptChart.destroy(); _deptChart = null; }
    if (!byDept || byDept.length === 0) return;

    const sorted    = [...byDept].sort((a, b) => parseInt(a.total) - parseInt(b.total));
    // Full names stored separately for tooltip; axis labels truncated for display
    const fullNames = sorted.map(d => d.Department);
    const labels    = sorted.map(d => d.Department.length > 22 ? d.Department.slice(0, 21) + '…' : d.Department);
    const totals    = sorted.map(d => parseInt(d.total)      || 0);
    const recs      = sorted.map(d => Math.min(parseInt(d.recordable) || 0, parseInt(d.total) || 0)); // cap at total
    const nonRecs   = totals.map((t, i) => Math.max(0, t - recs[i]));   // non-recordable = total − recordable

    // Stacked bars: non-recordable (green) + recordable (orange) → full bar = total
    // This makes it visually impossible for recordable to exceed total
    _deptChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Minor / Near Miss',
                    data: nonRecs,
                    backgroundColor: 'rgba(5,150,105,0.6)',
                    borderColor: '#059669',
                    borderWidth: 1,
                    borderRadius: 0,
                    borderSkipped: false,
                    stack: 'a',
                },
                {
                    label: 'Recordable',
                    data: recs,
                    backgroundColor: 'rgba(249,115,22,0.75)',
                    borderColor: '#f97316',
                    borderWidth: 1,
                    borderRadius: 3,
                    borderSkipped: false,
                    stack: 'a',
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } },
                tooltip: {
                    callbacks: {
                        title: ctx => fullNames[ctx[0].dataIndex] || labels[ctx[0].dataIndex],
                        footer: ctx => {
                            const idx = ctx[0].dataIndex;
                            return `รวม: ${totals[idx]}`;
                        },
                    },
                },
            },
            scales: {
                x: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
                y: { stacked: true, grid: { display: false }, ticks: {
                    font: { size: 10 },
                    callback: function(val) {
                        const name = this.getLabelForValue(val);
                        return name.length > 22 ? name.slice(0, 21) + '…' : name;
                    },
                }},
            },
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS PANEL
// ─────────────────────────────────────────────────────────────────────────────
async function _renderAnalyticsPanel() {
    const requestId = ++_analyticsRequest;
    const year = _statsYear;
    const panel = document.getElementById('acc-panel-analytics');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    let loadFailed = false;
    try {
        const res  = await API.get(`/accident/analytics?year=${year}`);
        if (requestId !== _analyticsRequest || year !== _statsYear || _activeTab !== 'analytics') return;
        _analytics = res.data || null;
    } catch {
        if (requestId !== _analyticsRequest || year !== _statsYear || _activeTab !== 'analytics') return;
        _analytics = null;
        loadFailed = true;
    }
    if (!_summary) {
        try {
            const summaryRes = await API.get(`/accident/summary?year=${year}`);
            if (requestId !== _analyticsRequest || year !== _statsYear || _activeTab !== 'analytics') return;
            _summary = summaryRes.data || null;
        } catch { _summary = null; }
    }
    try {
        const posRes = await API.get('/accident/hotspot-positions');
        if (requestId !== _analyticsRequest || year !== _statsYear || _activeTab !== 'analytics') return;
        if (_accApiResponseFailed(posRes)) throw new Error(`HTTP ${posRes.status}`);
        _hotspotPositions = {};
        (posRes.data || []).forEach(row => {
            const key = _accHotspotKey(row.AreaName);
            if (key) _hotspotPositions[key] = row;
        });
    } catch {
        if (requestId !== _analyticsRequest || year !== _statsYear || _activeTab !== 'analytics') return;
        _hotspotPositions = _accLoadLocalHotspotPositions();
    }
    if (loadFailed) {
        panel.innerHTML = '<div class="text-center py-16 text-slate-400 text-sm">โหลดข้อมูลวิเคราะห์ไม่สำเร็จ กรุณาลองใหม่</div>';
        return;
    }

    const deptRank  = _analytics?.deptRank  || [];
    const hotspot   = _analytics?.hotspot   || [];
    _lastHotspotRows = hotspot;
    const injuryTypeStats = _analytics?.injuryTypeStats || [];
    const bodyPartStats = _analytics?.bodyPartStats || [];
    const trendRows = _summary?.trend || [];

    const riskBadge = score => {
        if (score >= 10) return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700"><span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>High</span>`;
        if (score >= 5)  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700"><span class="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block"></span>Med</span>`;
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>Low</span>`;
    };

    panel.innerHTML = `
    <div class="flex flex-col gap-6">

        <!-- Department Risk Ranking -->
        <div class="order-4 ds-section overflow-hidden" data-acc-card-image="accident-department-risk-ranking"
             style="box-shadow:0 4px 16px rgba(220,38,38,0.08),0 1px 4px rgba(0,0,0,0.06)">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#dc2626,#7c3aed)"></div>
            <div class="p-5">
                <div class="flex items-center gap-2 mb-1">
                    <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">Department Risk Ranking</h3>
                </div>
                <p class="text-xs text-slate-400 mb-4 ml-6">คะแนนความเสี่ยง = Recordable×3 + LostDays×2 + รวม</p>
                ${deptRank.length === 0
                    ? `<div class="text-center py-10 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>`
                    : `<div class="overflow-x-auto">
                        <table class="ds-table text-left border-collapse text-sm">
                            <thead>
                                <tr class="bg-slate-50 border-b-2 border-slate-200">
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">รวม</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-orange-500 uppercase tracking-wide text-center">Recordable</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-red-500 uppercase tracking-wide text-center">Lost Days</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-amber-500 uppercase tracking-wide text-center">Near Miss</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">ความเสี่ยง</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${deptRank.map((d, i) => {
                                    const score  = parseInt(d.recordable)*3 + parseInt(d.lostDays)*2 + parseInt(d.total);
                                    const isTop  = i === 0;
                                    return `
                                    <tr class="hover:bg-slate-50 transition-colors" style="${isTop?'background:rgba(254,242,242,0.5)':''}">
                                        <td class="px-3 py-3 font-bold ${isTop?'text-red-600':'text-slate-400'}">${i+1}</td>
                                        <td class="px-3 py-3 font-semibold text-slate-800">
                                            ${d.Department || '—'}
                                            ${d.fatal>0 ? `<span class="ml-1 text-xs text-white bg-slate-800 rounded px-1">Fatal</span>` : ''}
                                        </td>
                                        <td class="px-3 py-3 text-center font-bold text-slate-700">${d.total}</td>
                                        <td class="px-3 py-3 text-center text-orange-600 font-semibold">${d.recordable||0}</td>
                                        <td class="px-3 py-3 text-center text-red-600 font-semibold">${d.lostDays||0}</td>
                                        <td class="px-3 py-3 text-center text-amber-600">${d.nearMiss||0}</td>
                                        <td class="px-3 py-3 text-center">${riskBadge(score)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>`}
            </div>
        </div>

        <div class="order-2 grid xl:grid-cols-2 gap-6">
            <div class="ds-section overflow-hidden" data-acc-card-image="accident-injury-type-breakdown"
                 style="box-shadow:0 4px 16px rgba(14,165,233,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#0ea5e9,#6366f1)"></div>
                <div class="p-5 h-full">
                    <div class="flex items-center gap-2 mb-3">
                        <svg class="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-6a2 2 0 012-2h2a2 2 0 012 2v6m-8 0h8m-9 4h10a2 2 0 002-2V7a2 2 0 00-2-2h-3.5a2 2 0 01-1.6-.8l-.8-1.066A2 2 0 0010.5 2H7a2 2 0 00-2 2v15a2 2 0 002 2z"/>
                        </svg>
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">Injury Type Breakdown</h3>
                            <p class="text-xs text-slate-400">นับเฉพาะเคสอุบัติเหตุที่ใช้ในสถิติ ไม่รวม Near Miss</p>
                        </div>
                    </div>
                    ${_accParetoChart(injuryTypeStats, 'Waiting for injury type data')}
                </div>
            </div>
            <div class="ds-section overflow-hidden" data-acc-card-image="accident-body-part-ranking"
                 style="box-shadow:0 4px 16px rgba(16,185,129,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#10b981,#14b8a6)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21s-6-4.35-6-10a6 6 0 1112 0c0 5.65-6 10-6 10z"/>
                        </svg>
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">Body Part Ranking</h3>
                            <p class="text-xs text-slate-400">ส่วนร่างกายที่บาดเจ็บบ่อย ใช้จัดลำดับมาตรการป้องกัน</p>
                        </div>
                    </div>
                    ${_accBodyPartMap(bodyPartStats, 'ยังไม่มีข้อมูลส่วนร่างกายที่บาดเจ็บ')}
                </div>
            </div>
        </div>

        <!-- Hotspot + Trend Cards -->
        <div class="order-1 grid grid-cols-1 gap-6">

            <!-- Accident Hotspot -->
            <div class="ds-section overflow-hidden" data-acc-card-image="accident-hotspot"
                 style="box-shadow:0 4px 16px rgba(249,115,22,0.08),0 1px 4px rgba(0,0,0,0.06)">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#f97316,#eab308)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">Accident Hotspot</h3>
                        <span class="text-xs text-slate-400">(บริเวณที่เกิดบ่อย)</span>
                    </div>
                    ${_accHotspotCard(hotspot, 'Waiting for location data')}
                </div>
            </div>

            <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <!-- Accident Trend -->
                <div class="ds-section overflow-hidden" data-acc-card-image="accident-cases-trend-12-months"
                     style="box-shadow:0 4px 16px rgba(37,99,235,0.08),0 1px 4px rgba(0,0,0,0.06)">
                    <div class="h-1 w-full" style="background:linear-gradient(90deg,#2563eb,#22c55e)"></div>
                    <div class="p-5">
                        <div class="flex items-center gap-2 mb-4">
                            <svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 17l6-6 4 4 8-8"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 7h7v7"/>
                            </svg>
                            <div>
                                <h3 class="text-sm font-bold text-slate-700">Accident Cases Trend (12 Months)</h3>
                                <p class="text-xs text-slate-400">All accident report types except Near Miss for ${_statsYear}</p>
                            </div>
                        </div>
                        ${_accTrendLineChart(trendRows, 'Waiting for accident trend data', {
                            key: 'accidentCases',
                            label: 'Accident Cases',
                            ytdLabel: 'Accident Cases YTD',
                            avgLabel: 'Accident Avg / Month',
                            avgLegend: 'Accident Year Avg',
                            peakLegend: 'Peak Accident Month',
                            badge: 'Accident cases - Near Miss excluded',
                            notePrefix: 'Accident cases',
                            ariaLabel: 'Accident cases trend 12 months chart, Near Miss excluded',
                            areaId: 'acc-cases-trend-area',
                            valueFromRow: row => Math.max(0, (parseInt(row.total, 10) || 0) - (parseInt(row.nearMiss, 10) || 0)),
                            noteSuffix: 'Near Miss is shown in the separate card.',
                        })}
                    </div>
                </div>

                <!-- Near Miss Trend -->
                <div class="ds-section overflow-hidden" data-acc-card-image="accident-nearmiss-trend-12-months"
                     style="box-shadow:0 4px 16px rgba(245,158,11,0.10),0 1px 4px rgba(0,0,0,0.06)">
                    <div class="h-1 w-full" style="background:linear-gradient(90deg,#f59e0b,#fb7185)"></div>
                    <div class="p-5">
                        <div class="flex items-center gap-2 mb-4">
                            <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                            </svg>
                            <div>
                                <h3 class="text-sm font-bold text-slate-700">Near Miss Trend (12 Months)</h3>
                                <p class="text-xs text-slate-400">Near Miss reports only for ${_statsYear}</p>
                            </div>
                        </div>
                        ${_accTrendLineChart(trendRows, 'Waiting for Near Miss trend data', {
                            key: 'nearMiss',
                            label: 'Near Miss Cases',
                            ytdLabel: 'Near Miss YTD',
                            avgLabel: 'Near Miss Avg / Month',
                            avgLegend: 'Near Miss Year Avg',
                            peakLegend: 'Peak Near Miss Month',
                            badge: 'Near Miss only',
                            notePrefix: 'Near Miss cases',
                            ariaLabel: 'Near Miss trend 12 months chart',
                            line: '#f59e0b',
                            lineText: '#b45309',
                            softBg: 'bg-amber-50',
                            softBorder: 'border-amber-100',
                            softText: 'text-amber-700',
                            mutedText: 'text-amber-500',
                            avg: '#14b8a6',
                            peak: '#fb7185',
                            badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
                            areaId: 'acc-nearmiss-trend-area',
                            valueFromRow: row => parseInt(row.nearMiss, 10) || 0,
                            noteSuffix: 'Accident cases are shown in the separate card.',
                        })}
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS PANEL
// ─────────────────────────────────────────────────────────────────────────────
async function _renderReportsPanel() {
    const panelRequestId = ++_reportsPanelRequest;
    const panel = document.getElementById('acc-panel-reports');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    const [reportsLoaded] = await Promise.all([_fetchReports(), _fetchDepts()]);
    if (panelRequestId !== _reportsPanelRequest || _activeTab !== 'reports') return;
    if (!reportsLoaded) {
        panel.innerHTML = '<div class="text-center py-16 text-slate-400 text-sm">โหลดรายการรายงานไม่สำเร็จ กรุณาลองใหม่</div>';
        return;
    }

    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);
    const depts   = _allDepts.length
        ? _allDepts
        : [...new Set(_reports.map(r => r.Department).filter(Boolean))].sort();

    panel.innerHTML = `
    <div class="space-y-4">
        <!-- Filter Bar -->
        <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div class="grid grid-cols-2 md:grid-cols-[92px_minmax(160px,1fr)_minmax(150px,1fr)_130px_150px_auto_auto] gap-2 items-center">
                <select id="acc-f-year" class="form-input text-sm h-10 py-0">
                    ${years.map(y => `<option value="${y}" ${_filter.year==y?'selected':''}>${y}</option>`).join('')}
                </select>
                <select id="acc-f-dept" class="form-input text-sm h-10 py-0 min-w-0">
                    <option value="">ทุกแผนก</option>
                    ${depts.map(d => `<option value="${_htmlEsc(d)}" ${_filter.dept===d?'selected':''}>${_htmlEsc(d)}</option>`).join('')}
                </select>
                <select id="acc-f-type" class="form-input text-sm h-10 py-0 min-w-0">
                    <option value="">ทุกประเภท</option>
                    ${ACCIDENT_TYPES.map(t => `<option value="${t}" ${_filter.type===t?'selected':''}>${t}</option>`).join('')}
                </select>
                <select id="acc-f-status" class="form-input text-sm h-10 py-0">
                    <option value="">ทุกสถานะ</option>
                    <option value="Open"   ${_filter.status==='Open'  ?'selected':''}>Open</option>
                    <option value="Closed" ${_filter.status==='Closed'?'selected':''}>Closed</option>
                </select>
                <select id="acc-f-quick" class="form-input text-sm h-10 py-0">
                    <option value="">ทุกงาน</option>
                    <option value="overdue" ${_filter.quick==='overdue'?'selected':''}>Overdue</option>
                    <option value="dueSoon" ${_filter.quick==='dueSoon'?'selected':''}>Due Soon</option>
                    <option value="noOwner" ${_filter.quick==='noOwner'?'selected':''}>No Owner</option>
                    <option value="counted" ${_filter.quick==='counted'?'selected':''}>นับสถิติ</option>
                    <option value="notCounted" ${_filter.quick==='notCounted'?'selected':''}>ไม่นับสถิติ</option>
                    <option value="recordable" ${_filter.quick==='recordable'?'selected':''}>Recordable</option>
                </select>
                <button type="button" onclick="window._accExportReportsExcel&&window._accExportReportsExcel()"
                    class="h-10 inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 hover:bg-emerald-100">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m4 7H5a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2z"/></svg>
                    Excel
                </button>
                <span id="acc-rec-count" class="col-span-2 md:col-span-1 md:justify-self-end rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">${_reports.length} รายการ</span>
            </div>
        </div>

        <!-- Table -->
        <div id="acc-reports-wrap" class="ds-table-wrap">
            ${_buildReportsTable(_visibleReports())}
        </div>
    </div>`;

    ['acc-f-year','acc-f-dept','acc-f-type','acc-f-status','acc-f-quick'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', async () => {
            _filter.year   = parseInt(document.getElementById('acc-f-year')?.value)   || curYear;
            _filter.dept   = document.getElementById('acc-f-dept')?.value   || '';
            _filter.type   = document.getElementById('acc-f-type')?.value   || '';
            _filter.status = document.getElementById('acc-f-status')?.value || '';
            _filter.quick  = document.getElementById('acc-f-quick')?.value  || '';
            const loaded = await _fetchReports();
            if (!loaded) {
                const wrap = document.getElementById('acc-reports-wrap');
                if (wrap) wrap.innerHTML = '<div class="text-center py-10 text-slate-400 text-sm">โหลดรายการรายงานไม่สำเร็จ กรุณาลองใหม่</div>';
                return;
            }
            const wrap = document.getElementById('acc-reports-wrap');
            const visibleReports = _visibleReports();
            if (wrap) wrap.innerHTML = _buildReportsTable(visibleReports);
            const cnt = document.getElementById('acc-rec-count');
            if (cnt)  cnt.textContent = `${visibleReports.length} รายการ`;
        });
    });
}

async function _fetchReports() {
    const requestId = ++_reportsRequest;
    try {
        const p = new URLSearchParams();
        if (_filter.year)   p.set('year',       _filter.year);
        if (_filter.dept)   p.set('department', _filter.dept);
        if (_filter.type)   p.set('type',       _filter.type);
        if (_filter.status) p.set('status',     _filter.status);
        const res = await API.get(`/accident/reports?${p}`);
        if (requestId !== _reportsRequest) return false;
        _reports  = res.data || [];
        return true;
    } catch {
        if (requestId === _reportsRequest) _reports = [];
        return false;
    }
}

function _followupState(r) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = r.DueDate ? new Date(r.DueDate) : null;
    if (due) due.setHours(0, 0, 0, 0);
    const isClosed = r.Status === 'Closed';
    const diffDays = due ? Math.ceil((due - today) / 86400000) : null;
    if (isClosed) return { key: 'closed', label: 'Closed', cls: 'bg-slate-100 text-slate-500' };
    if (!r.ResponsiblePerson && (r.CorrectiveAction || r.PreventiveAction || due)) return { key: 'noOwner', label: 'No Owner', cls: 'bg-rose-100 text-rose-700' };
    if (due && diffDays < 0) return { key: 'overdue', label: 'Overdue', cls: 'bg-red-100 text-red-700' };
    if (due && diffDays <= 7) return { key: 'dueSoon', label: 'Due Soon', cls: 'bg-amber-100 text-amber-700' };
    return { key: 'open', label: 'On Track', cls: 'bg-emerald-100 text-emerald-700' };
}

function _visibleReports() {
    if (!_filter.quick) return _reports;
    return _reports.filter(r => {
        const state = _followupState(r).key;
        if (_filter.quick === 'counted') return _accIsCountedStatReport(r);
        if (_filter.quick === 'notCounted') return !_accIsCountedStatReport(r);
        if (_filter.quick === 'recordable') return Number(r.IsRecordable) === 1;
        return state === _filter.quick;
    });
}

function _accIsCountedStatReport(r) {
    const type = String(r?.AccidentType || '');
    if (type === 'Near Miss' || type === 'First Aid') return false;
    return ['Medical Treatment', 'Lost Time', 'Fatal'].includes(type)
        || String(r?.Severity || '') === 'Critical'
        || Number(r?.IsRecordable) === 1
        || Number(r?.LostDays) > 0;
}

function _buildReportsTable(reports = _reports) {
    if (reports.length === 0) {
        return `
        <div class="text-center py-16 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <p class="font-medium">ไม่พบข้อมูลอุบัติเหตุ</p>
            <p class="text-sm mt-1">ลองเปลี่ยนตัวกรองหรือเพิ่มรายงานใหม่</p>
        </div>`;
    }

    const rows = reports.map(r => {
        const reportId = Number.parseInt(r.id, 10);
        const dateStr    = r.AccidentDate
            ? new Date(r.AccidentDate).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
            : '—';
        const tc         = TYPE_COLOR[r.AccidentType] || { bg: 'bg-slate-100', text: 'text-slate-600' };
        const sc         = SEV_COLOR[r.Severity]      || { bg: 'bg-slate-100', text: 'text-slate-600' };
        const statusBadge = r.Status === 'Closed'
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500"><span class="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>Closed</span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block"></span>Open</span>`;
        const follow = _followupState(r);
        const followBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${follow.cls}">${follow.label}</span>`;
        const investigationBadge = _accInvestigationBadge(r.InvestigationStatus || (r.Status === 'Closed' ? 'Closed' : 'Reported'));
        const aging = _accAgingInfo(r);
        const countedBadge = _accIsCountedStatReport(r)
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-red-50 text-red-700 border border-red-100">นับสถิติ</span>`
            : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-50 text-slate-500 border border-slate-100">ไม่นับสถิติ</span>`;
        const recordableBadge = Number(r.IsRecordable) === 1
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Recordable</span>`
            : '';
        const attCount   = parseInt(r.AttachmentCount) || 0;
        const attBadge   = attCount > 0
            ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 ml-1" title="${attCount} ไฟล์แนบ">
                   <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                   ${attCount}
               </span>`
            : '';
        const pdfBtn = `
            <button onclick="window._accViewReport(${reportId})" title="ดูรายละเอียด"
                class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
            </button>
            <button onclick="window._accExportPDF(${reportId})" title="ส่งออก PDF"
                class="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            </button>`;
        const adminBtns = _isAdmin ? `
            <button onclick="window._accEditReport(${reportId})" title="แก้ไข"
                class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
            <button onclick="window._accDeleteReport(${reportId})" title="ลบ"
                class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>` : '';

        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-500">${dateStr}</td>
            <td class="px-4 py-3 min-w-[120px]">
                <p class="text-sm font-semibold text-slate-800">${_htmlEsc(r.EmployeeID)}${attBadge}</p>
                <p class="text-xs text-slate-400">${_htmlEsc(r.EmployeeName || '—')}</p>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">${_htmlEsc(r.Department || '—')}</td>
            <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">${_htmlEsc(r.Area || '—')}</td>
            <td class="px-4 py-3 whitespace-nowrap">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${tc.bg} ${tc.text}">${_htmlEsc(r.AccidentType)}</span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}">${_htmlEsc(r.Severity)}</span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 max-w-[140px] truncate" title="${_htmlEsc(r.RootCause||'')}">${_htmlEsc(r.RootCause || '—')}</td>
            <td class="px-4 py-3 text-center text-sm ${r.LostDays>0?'text-red-600 font-semibold':'text-slate-400'}">${r.LostDays || 0}</td>
            <td class="px-4 py-3 whitespace-nowrap">
                <span class="inline-flex rounded-lg border px-2 py-1 text-[11px] font-black ${aging.cls}">${aging.label}</span>
            </td>
            <td class="px-4 py-3"><div class="flex flex-col gap-1">${statusBadge}${investigationBadge}${followBadge}${countedBadge}${recordableBadge}</div></td>
            <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                    ${pdfBtn}${adminBtns}
                </div>
            </td>
        </tr>`;
    }).join('');

    return `
    <div class="overflow-x-auto">
        <table class="ds-table text-left border-collapse">
            <thead>
                <tr class="bg-slate-50 border-b-2 border-slate-200">
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">วันที่เกิดเหตุ</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">พนักงาน</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">บริเวณ</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ประเภท</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ความรุนแรง</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">สาเหตุ</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">วันหยุด</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Aging</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">สถานะ</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">จัดการ</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

window._accExportReportsExcel = () => {
    const rows = _visibleReports();
    if (!rows.length) {
        showToast('ไม่มีข้อมูลสำหรับส่งออก / No records to export', 'warning');
        return;
    }
    const headers = [
        'Incident Date', 'Report Date', 'Employee ID', 'Employee Name', 'Department', 'Area',
        'Type', 'Severity', 'Potential Severity', 'Counted KPI', 'Recordable',
        'Lost Days', 'Status', 'Investigation Status', 'Responsible Person', 'Due Date',
        'Aging Days', 'Overdue Days', 'Verified By', 'Verified Date',
    ];
    const dateText = value => value ? String(value).slice(0, 10) : '';
    const formulaSafe = value => {
        const text = String(value ?? '');
        return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    };
    const esc = value => `"${formulaSafe(value).replace(/"/g, '""')}"`;
    const lines = rows.map(r => {
        const aging = _accAgingInfo(r);
        return [
            dateText(r.AccidentDate), dateText(r.ReportDate), r.EmployeeID, r.EmployeeName, r.Department, r.Area,
            r.AccidentType, r.Severity, r.PotentialSeverity,
            _accIsCountedStatReport(r) ? 'YES' : 'NO',
            Number(r.IsRecordable) === 1 ? 'YES' : 'NO',
            r.LostDays || 0, r.Status, r.InvestigationStatus || 'Reported', r.ResponsiblePerson, dateText(r.DueDate),
            aging.age ?? '', aging.overdue || 0, r.VerifiedBy, dateText(r.VerifiedAt),
        ].map(esc).join(',');
    });
    const csv = '\uFEFF' + [headers.map(esc).join(','), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accident_reports_${_filter.year || _statsYear}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('ส่งออก Excel สำเร็จ / Export completed', 'success');
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCIDENT FORM — full 6-section form with file attachments
// ─────────────────────────────────────────────────────────────────────────────
function _sectionHeader(label) {
    return `<div class="flex items-center gap-2 pt-1 pb-0.5 border-b border-slate-100">
                <span class="w-1 h-4 rounded-full bg-red-500 flex-shrink-0"></span>
                <p class="text-xs font-bold text-slate-600 uppercase tracking-wide">${label}</p>
            </div>`;
}

function _nearMissDetails(value) {
    return _accObject(value, {});
}

function _nearMissPeople(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
        } catch (_) {
            return value.trim()
                ? [{ EmployeeID: '', EmployeeName: value.trim(), Position: '', Department: '' }]
                : [];
        }
    }
    return [];
}

function _personCard(p, idx) {
    const title = [p.EmployeeID, p.EmployeeName].filter(Boolean).join(' · ') || 'Unknown';
    const meta = [p.Position, p.Department].filter(Boolean).join(' · ') || 'No master detail';
    return `
        <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2" data-person-index="${idx}">
            <div class="min-w-0">
                <p class="truncate text-sm font-bold text-slate-800">${_htmlEsc(title)}</p>
                <p class="truncate text-xs text-slate-400">${_htmlEsc(meta)}</p>
            </div>
            <button type="button" onclick="window._accRemoveNearMissPerson(${idx})"
                class="text-xs font-bold text-rose-500 hover:text-rose-700">Remove</button>
        </div>`;
}

function _accIsOtherValue(value) {
    return String(value || '').trim() === ACC_OTHER_VALUE;
}

function _accOtherSelectHtml(name, options, currentValue, placeholder = '— เลือก —') {
    const current = String(currentValue || '');
    const normalizedOptions = options.includes(ACC_OTHER_VALUE) ? options : [...options, ACC_OTHER_VALUE];
    const isKnown = !current || normalizedOptions.includes(current);
    const selectedValue = isKnown ? current : ACC_OTHER_VALUE;
    const otherValue = isKnown ? '' : current;
    return `
        <select name="${name}" class="form-input w-full" data-acc-other-select="${name}">
            <option value="">${placeholder}</option>
            ${normalizedOptions.map(option => `<option value="${_esc(option)}" ${selectedValue===option?'selected':''}>${_esc(option)}</option>`).join('')}
        </select>
        <input type="text"
            class="form-input w-full mt-2 ${selectedValue===ACC_OTHER_VALUE ? '' : 'hidden'}"
            data-acc-other-input="${name}"
            value="${_esc(otherValue)}"
            placeholder="${ACC_OTHER_PLACEHOLDER}">
    `;
}

function _accSyncOtherInputs(root = document) {
    root.querySelectorAll('[data-acc-other-select]').forEach(select => {
        const name = select.dataset.accOtherSelect;
        const input = root.querySelector(`[data-acc-other-input="${name}"]`);
        if (!input) return;
        input.classList.toggle('hidden', !_accIsOtherValue(select.value));
        if (!_accIsOtherValue(select.value)) input.value = '';
    });
}

function _accApplyOtherFormValues(form, fd) {
    form.querySelectorAll('[data-acc-other-select]').forEach(select => {
        const name = select.dataset.accOtherSelect;
        if (!_accIsOtherValue(select.value)) return;
        const input = form.querySelector(`[data-acc-other-input="${name}"]`);
        const customValue = String(input?.value || '').trim();
        if (customValue) fd.set(name, customValue);
    });
}

function _accOtherValidationMessage(form) {
    for (const select of form.querySelectorAll('[data-acc-other-select]')) {
        if (select.closest('.hidden')) continue;
        if (!_accIsOtherValue(select.value)) continue;
        const name = select.dataset.accOtherSelect;
        const input = form.querySelector(`[data-acc-other-input="${name}"]`);
        if (!String(input?.value || '').trim()) return 'กรุณาระบุรายละเอียดสำหรับช่องอื่นๆ / Please specify other detail';
    }
    return '';
}

function _nearMissSection(details = {}, isNearMiss = false, report = {}) {
    const v = key => _esc(details[key] || '');
    const relatedPeople = _nearMissPeople(details.NearMissRelatedPeople);
    return `
        <div id="acc-nearmiss-section" class="${isNearMiss ? '' : 'hidden'} space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-100 pb-3">
                <div>
                    <p class="text-xs font-black uppercase tracking-wide text-amber-600">Nearmiss Report Form</p>
                    <h3 class="text-sm font-black text-slate-800">รายงานเหตุการณ์เกือบเกิดอุบัติเหตุ / Near Miss Report</h3>
                </div>
                <span class="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-700">
                    FM04-SWI-SHE-14 Rev.05
                </span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ลำดับที่ / Report No.</label>
                    <input name="NearMissNo" value="${v('NearMissNo')}" class="form-input w-full" placeholder="Example: 02-2569">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทงาน / Work Type</label>
                    <input name="NearMissWorkType" value="${v('NearMissWorkType')}" class="form-input w-full" placeholder="Example: Warehouse operation">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">เบอร์โทรศัพท์ / Phone</label>
                    <input name="NearMissPhone" value="${v('NearMissPhone')}" class="form-input w-full" placeholder="Reporter contact number">
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">กะ / Shift</label>
                    ${_accOtherSelectHtml('NearMissShift', ['เช้า / Day', 'บ่าย / Afternoon', 'กลางคืน / Night', ACC_OTHER_VALUE], details.NearMissShift, '— เลือกกะ / Select Shift —')}
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ขณะกำลังทำอะไร / Work Being Performed</label>
                    <input name="NearMissWorkingOn" value="${v('NearMissWorkingOn')}" class="form-input w-full" placeholder="Example: moving cart / lifting / inspection">
                </div>
                <div class="sm:col-span-2">
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ระดับความรุนแรงที่อาจเกิดขึ้น / Potential Severity <span class="text-red-500">*</span></label>
                    <select name="PotentialSeverity" class="form-input w-full bg-white">
                        <option value="">— เลือกระดับ / Select Potential Severity —</option>
                        ${POTENTIAL_SEVERITIES.map(x => `<option value="${x.value}" ${report.PotentialSeverity===x.value?'selected':''}>${x.label}</option>`).join('')}
                    </select>
                    <p class="mt-1 text-xs text-slate-500">ใช้ประเมินความเสี่ยงของ Near Miss แม้ยังไม่เกิดการบาดเจ็บจริง / Evaluate what could have happened.</p>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">หัวข้อเหตุการณ์ / Event Title</label>
                    <input name="NearMissEventTitle" value="${v('NearMissEventTitle')}" class="form-input w-full" placeholder="Short event summary">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">Layout จุดเกิดเหตุ / Location Layout</label>
                    <input name="NearMissLayoutNote" value="${v('NearMissLayoutNote')}" class="form-input w-full" placeholder="Describe point or attach layout file">
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เหตุการณ์เกือบเกิดอุบัติเหตุ / Near Miss Event</label>
                <textarea name="NearMissEvent" rows="3" class="form-textarea w-full resize-none" placeholder="Describe what nearly happened">${v('NearMissEvent')}</textarea>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">จุดที่ต้องปรับปรุงแก้ไข / Improvement Point</label>
                    <textarea name="NearMissImprovementPoint" rows="3" class="form-textarea w-full resize-none" placeholder="Required improvement from this event">${v('NearMissImprovementPoint')}</textarea>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ข้อผิดพลาดและอันตรายที่ตรวจพบ / Hazard Findings</label>
                    <textarea name="NearMissHazardFinding" rows="3" class="form-textarea w-full resize-none" placeholder="Hazard / unsafe act / unsafe condition">${v('NearMissHazardFinding')}</textarea>
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้เกี่ยวข้องกับเหตุการณ์ / Involved Persons</label>
                <input type="hidden" name="NearMissRelatedPeople" id="acc-nearmiss-people-value"
                    value="${_esc(JSON.stringify(relatedPeople))}">
                <div class="relative">
                    <input id="acc-nearmiss-person-search" type="text" class="form-input w-full"
                        placeholder="ค้นหาจากรหัสหรือชื่อพนักงาน / Search employee ID or name"
                        autocomplete="off" oninput="window._accSearchPersonPicker('nearmiss', this.value)">
                    <div id="acc-nearmiss-person-dropdown" class="hidden absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto"></div>
                </div>
                <div id="acc-nearmiss-people-list" class="mt-2 space-y-1.5">
                    ${relatedPeople.length ? relatedPeople.map((p, i) => _personCard(p, i)).join('') : `<div class="rounded-xl border border-dashed border-amber-200 bg-white/70 px-3 py-2 text-xs text-slate-400">ยังไม่ได้เลือกผู้เกี่ยวข้อง / No involved person selected</div>`}
                </div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-3">
                <p class="text-xs font-bold text-slate-500">ส่วนปิดเคส / Case Closure Section</p>
                <p class="mt-1 text-xs text-slate-400">สำหรับ Admin/Safety กรอกหลังตรวจสอบหรือปิดเคส / For Admin/Safety completion after investigation or case closure.</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">มาตรการแก้ไขและป้องกัน / CAPA</label>
                    <textarea name="NearMissCAPA" rows="3" class="form-textarea w-full resize-none" placeholder="Corrective and Preventive Actions">${v('NearMissCAPA')}</textarea>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">สาเหตุที่แท้จริง / Root Cause</label>
                    <textarea name="NearMissRootCause" rows="3" class="form-textarea w-full resize-none" placeholder="Root cause after investigation">${v('NearMissRootCause')}</textarea>
                </div>
            </div>
        </div>`;
}

function openAccidentForm(r, existingAttachments = []) {
    const isEdit = r && r.id;
    _pendingFiles = [];

    const d = v => (v && String(v) !== 'null') ? String(v) : '';
    const nearMiss = _nearMissDetails(r?.NearMissDetails);
    const isNearMiss = d(r?.AccidentType) === 'Near Miss';
    _accNearMissPeople = _nearMissPeople(nearMiss.NearMissRelatedPeople);

    const html = `
    <form id="acc-form" class="space-y-5">
        ${isEdit ? `<input type="hidden" name="id" value="${r.id}">` : ''}

        <div class="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <label class="block text-sm font-black text-slate-800 mb-1.5">ประเภทฟอร์ม / Incident Form Type <span class="text-red-500">*</span></label>
            <select name="AccidentType" required class="form-input w-full bg-white">
                <option value="">— เลือกประเภท / Select Type —</option>
                ${ACCIDENT_TYPES.map(t => `<option value="${t}" ${d(r?.AccidentType)===t?'selected':''}>${t}</option>`).join('')}
            </select>
            <p class="mt-2 text-xs text-slate-500">กรุณาเลือกประเภทก่อนกรอก ระบบจะแสดงเฉพาะฟอร์มที่เกี่ยวข้อง / Select the type first to show the relevant form.</p>
        </div>

        <!-- ── Section 1: General Info ───────────────────────────────────── -->
        ${_sectionHeader('ข้อมูลทั่วไป')}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่เกิดเหตุ / Incident Date <span class="text-red-500">*</span></label>
                <input type="text" id="acc-accident-date" name="AccidentDate" required
                    value="${d(r?.AccidentDate).split('T')[0] || ''}" class="form-input w-full bg-white">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่รายงาน / Report Date <span class="text-red-500">*</span></label>
                <input type="text" id="acc-report-date" name="ReportDate" required
                    value="${d(r?.ReportDate).split('T')[0] || ''}" class="form-input w-full bg-white">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เวลาที่เกิดเหตุ / Incident Time</label>
                <input type="time" name="AccidentTime" value="${d(r?.AccidentTime)}" class="form-input w-full">
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานที่เกิดเหตุ (Location)</label>
                <input name="Location" value="${_esc(d(r?.Location))}"
                    placeholder="เช่น อาคาร A ชั้น 2" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">บริเวณ / พื้นที่ (Area)</label>
                <input name="Area" value="${_esc(d(r?.Area))}"
                    placeholder="เช่น Line 3, คลังสินค้า" class="form-input w-full">
            </div>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้รายงาน / Reported By</label>
            <input name="ReportedBy" value="${_esc(d(r?.ReportedBy))}"
                placeholder="ชื่อผู้กรอกรายงาน" class="form-input w-full">
        </div>

        <!-- ── Section 2: Person ─────────────────────────────────────────── -->
        ${_sectionHeader('ข้อมูลผู้ประสบเหตุ')}
        <div class="bg-red-50 border border-red-100 rounded-xl p-3 flex gap-2 text-xs text-red-700">
            <svg class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            รหัสพนักงานต้องมีอยู่ใน Employee Master Data · แผนกถูกกรอกอัตโนมัติ
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รหัสพนักงาน / Employee ID <span class="text-red-500">*</span></label>
            <div class="relative">
                <input id="acc-emp-search" name="EmployeeID" required
                    value="${d(r?.EmployeeID)}" placeholder="พิมพ์รหัสหรือชื่อพนักงาน..."
                    autocomplete="off" class="form-input w-full"
                    oninput="window._accSearchEmp(this.value)">
                <div id="acc-emp-dropdown" class="hidden absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto"></div>
            </div>
            <div id="acc-emp-info" class="${r?.EmployeeID ? '' : 'hidden'} mt-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5 border border-emerald-100">
                ${r?.EmployeeName ? `<svg class="w-3.5 h-3.5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>${_esc(r.EmployeeName)} · ${_esc(r.Department || '')}` : ''}
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ตำแหน่งงาน / Position</label>
                <input name="Position" value="${_esc(d(r?.Position))}"
                    placeholder="ตำแหน่ง (ดึงจาก master อัตโนมัติ)" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทการจ้าง / Employment Type</label>
                ${_accOtherSelectHtml('EmploymentType', EMPLOYMENT_TYPES, d(r?.EmploymentType))}
            </div>
        </div>

        <div class="acc-standard-section space-y-5">
        <!-- ── Section 3: Incident ───────────────────────────────────────── -->
        ${_sectionHeader('รายละเอียดเหตุการณ์')}
        <div class="acc-standard-section grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ระดับความรุนแรง</label>
                <select name="Severity" class="form-input w-full">
                    ${SEVERITIES.map(s => `<option value="${s}" ${(d(r?.Severity)||'Minor')===s?'selected':''}>${s}</option>`).join('')}
                </select>
            </div>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดการเกิดเหตุ</label>
            <textarea name="Description" rows="3" class="form-textarea w-full resize-none"
                placeholder="อธิบายเหตุการณ์ที่เกิดขึ้นโดยละเอียด">${_esc(d(r?.Description))}</textarea>
        </div>
        </div>
        ${_nearMissSection(nearMiss, isNearMiss, r || {})}

        <!-- ── Section 4: Injury ─────────────────────────────────────────── -->
        <div class="acc-standard-section space-y-5">
        ${_sectionHeader('รายละเอียดการบาดเจ็บ / Injury Details')}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ลักษณะการบาดเจ็บ / Injury Type</label>
                ${_accOtherSelectHtml('InjuryType', INJURY_TYPES, d(r?.InjuryType))}
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ส่วนร่างกายที่บาดเจ็บ / Body Part</label>
                ${_accOtherSelectHtml('BodyPart', BODY_PARTS, d(r?.BodyPart))}
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันหยุดงาน / Lost Time Days</label>
                <input type="number" name="LostDays" min="0" value="${d(r?.LostDays) || 0}" class="form-input w-full">
            </div>
            <div class="bg-slate-50 rounded-xl px-3 flex items-center border border-slate-100">
                <label class="flex items-center gap-3 cursor-pointer w-full">
                    <input type="checkbox" name="IsRecordable" ${r?.IsRecordable ? 'checked' : ''}
                        class="w-4 h-4 rounded accent-red-500 flex-shrink-0">
                    <span class="text-sm text-slate-700">เป็น <span class="font-semibold text-red-600">Recordable Case</span></span>
                </label>
            </div>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">การรักษาพยาบาล / Medical Treatment</label>
            <textarea name="MedicalTreatment" rows="2" class="form-textarea w-full resize-none"
                placeholder="รายละเอียดการรักษา / โรงพยาบาล">${_esc(d(r?.MedicalTreatment))}</textarea>
        </div>
        </div>

        <!-- ── Section 5: Cause Analysis ────────────────────────────────── -->
        <div class="acc-standard-section space-y-5">
        ${_sectionHeader('การวิเคราะห์สาเหตุ / Cause Analysis')}
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">สาเหตุทันที / Immediate Cause</label>
            <input name="ImmediateCause" value="${_esc(d(r?.ImmediateCause))}"
                placeholder="สาเหตุที่เกิดขึ้นทันที" class="form-input w-full">
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">การกระทำที่ไม่ปลอดภัย / Unsafe Act</label>
                <input name="UnsafeAct" value="${_esc(d(r?.UnsafeAct))}"
                    placeholder="พฤติกรรมที่เกี่ยวข้อง" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สภาพที่ไม่ปลอดภัย / Unsafe Condition</label>
                <input name="UnsafeCondition" value="${_esc(d(r?.UnsafeCondition))}"
                    placeholder="สภาพแวดล้อมที่เกี่ยวข้อง" class="form-input w-full">
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สาเหตุรากเหง้า / Root Cause</label>
                ${_accOtherSelectHtml('RootCause', ROOT_CAUSES, d(r?.RootCause), '— เลือกสาเหตุ —')}
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียดสาเหตุ / Cause Detail</label>
                <input name="RootCauseDetail" value="${_esc(d(r?.RootCauseDetail))}"
                    placeholder="อธิบายเพิ่มเติม" class="form-input w-full">
            </div>
        </div>
        </div>

        <!-- ── Section 6: Actions + Attachments ─────────────────────────── -->
        ${_sectionHeader('มาตรการแก้ไขและเอกสาร / Actions & Attachments')}
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p class="text-xs font-bold text-slate-600">ส่วนนี้สำหรับ Admin/Safety / Admin & Safety Completion</p>
            <p class="mt-1 text-xs text-slate-400">ใช้กรอกผู้รับผิดชอบ มาตรการ และสถานะหลังตรวจสอบหรือปิดเคส / Complete owner, actions and status after investigation or case closure.</p>
        </div>
        <div class="acc-standard-section grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">มาตรการแก้ไข / Corrective Action</label>
                <textarea name="CorrectiveAction" rows="2" class="form-textarea w-full resize-none"
                    placeholder="มาตรการที่ดำเนินการแล้ว">${_esc(d(r?.CorrectiveAction))}</textarea>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">มาตรการป้องกัน / Preventive Action</label>
                <textarea name="PreventiveAction" rows="2" class="form-textarea w-full resize-none"
                    placeholder="มาตรการเพื่อป้องกันการเกิดซ้ำ">${_esc(d(r?.PreventiveAction))}</textarea>
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้รับผิดชอบ / Responsible Person</label>
                <input type="hidden" name="ResponsiblePerson" value="${_esc(d(r?.ResponsiblePerson))}">
                <div class="relative">
                    <input id="acc-responsible-search" type="text" value="${_esc(d(r?.ResponsiblePerson))}"
                        placeholder="ค้นหาจาก Employee Master / Search employee"
                        autocomplete="off" class="form-input w-full"
                        oninput="window._accSearchPersonPicker('responsible', this.value)">
                    <div id="acc-responsible-person-dropdown" class="hidden absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto"></div>
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">กำหนดเสร็จ / Due Date</label>
                <input type="text" id="acc-due-date" name="DueDate"
                    value="${d(r?.DueDate).split('T')[0] || ''}" class="form-input w-full bg-white">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานะ / Status</label>
                <select name="Status" class="form-input w-full">
                    <option value="Open"   ${(d(r?.Status)||'Open')==='Open'  ?'selected':''}>Open</option>
                    <option value="Closed" ${d(r?.Status)==='Closed'          ?'selected':''}>Closed</option>
                </select>
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">สถานะการสอบสวน / Investigation Status</label>
                <select name="InvestigationStatus" class="form-input w-full">
                    ${INVESTIGATION_STATUSES.map(x => `<option value="${x.value}" ${(d(r?.InvestigationStatus) || (d(r?.Status)==='Closed' ? 'Closed' : 'Reported'))===x.value?'selected':''}>${x.label}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผู้ตรวจยืนยัน / Verified By</label>
                <input type="hidden" name="VerifiedBy" value="${_esc(d(r?.VerifiedBy))}">
                <div class="relative">
                    <input id="acc-verified-search" type="text" value="${_esc(d(r?.VerifiedBy))}"
                        placeholder="ค้นหาจาก Employee Master / Search employee"
                        autocomplete="off" class="form-input w-full"
                        oninput="window._accSearchPersonPicker('verified', this.value)">
                    <div id="acc-verified-person-dropdown" class="hidden absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto"></div>
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่ตรวจยืนยัน / Verified Date</label>
                <input type="text" id="acc-verified-at" name="VerifiedAt"
                    value="${d(r?.VerifiedAt).split('T')[0] || ''}" class="form-input w-full bg-white">
            </div>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ผลการตรวจยืนยัน CAPA / CAPA Verification Result</label>
            <textarea name="VerificationResult" rows="2" class="form-textarea w-full resize-none"
                placeholder="ยืนยันว่ามาตรการแล้วเสร็จและป้องกันการเกิดซ้ำได้อย่างไร / Confirm completion and effectiveness">${_esc(d(r?.VerificationResult))}</textarea>
        </div>

        <!-- Existing attachments (edit mode) -->
        ${existingAttachments.length > 0 ? `
        <div>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">ไฟล์แนบที่มีอยู่แล้ว / Existing Attachments</p>
            <div id="acc-existing-atts" class="space-y-1.5">
                ${existingAttachments.map(a => _buildExistingAttRow(a, r.id)).join('')}
            </div>
        </div>` : ''}

        <!-- New file upload zone -->
        <div>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">แนบไฟล์ใหม่ / New Attachments <span class="font-normal text-slate-400">(Image / PDF · max 10 files · 20 MB each)</span></p>
            <label id="acc-file-zone"
                class="flex flex-col items-center justify-center gap-2 w-full border-2 border-dashed border-slate-200 rounded-xl p-5 cursor-pointer hover:border-red-300 hover:bg-red-50 transition-colors">
                <svg class="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                <span class="text-sm text-slate-400">คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวาง</span>
                <input id="acc-file-input" type="file" multiple accept="image/*,.pdf"
                    class="hidden">
            </label>
            <div id="acc-pending-list" class="mt-2 space-y-1.5"></div>
        </div>

        <div id="acc-form-err" class="text-sm text-red-500 hidden"></div>

        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="acc-form-submit" class="btn btn-primary px-5"
                    style="background:linear-gradient(135deg,#dc2626,#b91c1c)">บันทึก</button>
        </div>
    </form>`;

    openModal(isEdit ? 'แก้ไขรายงานอุบัติเหตุ' : 'บันทึกรายงานอุบัติเหตุ', html, 'max-w-4xl');

    // Flatpickr
    if (typeof flatpickr !== 'undefined') {
        flatpickr('#acc-accident-date', { locale: 'th', dateFormat: 'Y-m-d', defaultDate: d(r?.AccidentDate).split('T')[0] || 'today', mobileNative: true });
        flatpickr('#acc-report-date',   { locale: 'th', dateFormat: 'Y-m-d', defaultDate: d(r?.ReportDate).split('T')[0]   || 'today', mobileNative: true });
        flatpickr('#acc-due-date',      { locale: 'th', dateFormat: 'Y-m-d', defaultDate: d(r?.DueDate).split('T')[0]      || null,    mobileNative: true });
        flatpickr('#acc-verified-at',   { locale: 'th', dateFormat: 'Y-m-d', defaultDate: d(r?.VerifiedAt).split('T')[0]   || null,    mobileNative: true });
    }

    const typeSelect = document.querySelector('#acc-form [name="AccidentType"]');
    const statusSelect = document.querySelector('#acc-form [name="Status"]');
    const investigationSelect = document.querySelector('#acc-form [name="InvestigationStatus"]');
    const syncNearMissSection = () => {
        const isNear = typeSelect?.value === 'Near Miss';
        const hasType = !!typeSelect?.value;
        document.getElementById('acc-nearmiss-section')?.classList.toggle('hidden', !isNear);
        document.querySelectorAll('#acc-form .acc-standard-section')
            .forEach(el => el.classList.toggle('hidden', !hasType || isNear));
        const recordable = document.querySelector('#acc-form [name="IsRecordable"]');
        const lostDays = document.querySelector('#acc-form [name="LostDays"]');
        const severity = document.querySelector('#acc-form [name="Severity"]');
        const injury = document.querySelector('#acc-form [name="InjuryType"]');
        const bodyPart = document.querySelector('#acc-form [name="BodyPart"]');
        if (isNear) {
            if (recordable) recordable.checked = false;
            if (lostDays) lostDays.value = 0;
            if (severity) severity.value = 'Minor';
            if (injury) injury.value = '';
            if (bodyPart) bodyPart.value = '';
        }
    };
    typeSelect?.addEventListener('change', syncNearMissSection);
    statusSelect?.addEventListener('change', () => {
        if (statusSelect.value === 'Closed' && investigationSelect) investigationSelect.value = 'Closed';
    });
    document.querySelectorAll('#acc-form [data-acc-other-select]').forEach(select => {
        select.addEventListener('change', () => _accSyncOtherInputs(document.getElementById('acc-form')));
    });
    _accSyncOtherInputs(document.getElementById('acc-form'));
    syncNearMissSection();

    // File input → validate + stage files
    document.getElementById('acc-file-input')?.addEventListener('change', e => {
        const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
        const files    = Array.from(e.target.files || []);
        const errs     = [];

        for (const f of files) {
            const allowed = f.type.startsWith('image/') || f.type === 'application/pdf';
            if (!allowed) {
                errs.push(`"${f.name}" ไม่รองรับ (รับเฉพาะรูปภาพ / PDF)`);
                continue;
            }
            if (f.size > MAX_SIZE) {
                errs.push(`"${f.name}" ขนาดเกิน 20 MB`);
                continue;
            }
            if (_pendingFiles.some(p => p.name === f.name && p.size === f.size)) {
                errs.push(`"${f.name}" ซ้ำ`);
                continue;
            }
            if (_pendingFiles.length >= 10) {
                errs.push('ไม่สามารถเพิ่มได้ — ครบ 10 ไฟล์แล้ว');
                break;
            }
            _pendingFiles.push(f);
        }

        e.target.value = ''; // reset so same file can be re-added after remove
        _renderPendingList();

        if (errs.length) {
            const errEl = document.getElementById('acc-form-err');
            if (errEl) {
                errEl.textContent = errs.join(' · ');
                errEl.classList.remove('hidden');
                setTimeout(() => errEl.classList.add('hidden'), 5000);
            }
        }
    });

    // Submit
    document.getElementById('acc-form')?.addEventListener('submit', guardSubmitHandler(async e => {
        e.preventDefault();
        const form = e.target;
        const btn  = document.getElementById('acc-form-submit');
        const errEl = document.getElementById('acc-form-err');
        const verifiedInput = document.getElementById('acc-verified-search');
        const verifiedHidden = form.querySelector('[name="VerifiedBy"]');
        if (verifiedInput && verifiedHidden && !verifiedHidden.value.trim()) verifiedHidden.value = verifiedInput.value.trim();
        const responsibleInput = document.getElementById('acc-responsible-search');
        const responsibleHidden = form.querySelector('[name="ResponsiblePerson"]');
        if (responsibleInput && responsibleHidden && !responsibleHidden.value.trim()) responsibleHidden.value = responsibleInput.value.trim();
        const validationMessage = _validateAccidentForm(form);
        if (validationMessage) {
            if (errEl) { errEl.textContent = validationMessage; errEl.classList.remove('hidden'); }
            return;
        }
        if (errEl) errEl.classList.add('hidden');
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>กำลังบันทึก...';

        try {
            const fd = new FormData(form);
            _accApplyOtherFormValues(form, fd);
            // Normalize checkbox → 1/0
            fd.set('IsRecordable', form.querySelector('[name="IsRecordable"]')?.checked ? '1' : '0');
            // Append staged files
            _pendingFiles.forEach(f => fd.append('files', f));

            const id = form.querySelector('[name="id"]')?.value;
            if (id) {
                await API.put(`/accident/reports/${id}`, fd);
            } else {
                await API.post('/accident/reports', fd);
            }

            _pendingFiles = [];
            closeModal();
            showToast('บันทึกรายงานอุบัติเหตุสำเร็จ', 'success');
            _summary   = null;
            _analytics = null;
            _perfData  = null;
            _loadHeroStats();
            _loadHeroKpiSummary();
            if (_activeTab === 'reports') {
                await _fetchReports();
                const wrap = document.getElementById('acc-reports-wrap');
                const visibleReports = _visibleReports();
                if (wrap) wrap.innerHTML = _buildReportsTable(visibleReports);
                const cnt  = document.getElementById('acc-rec-count');
                if (cnt)   cnt.textContent = `${visibleReports.length} รายการ`;
            } else if (_activeTab === 'dashboard') {
                _renderDashboardPanel();
            } else if (_activeTab === 'analytics') {
                _renderAnalyticsPanel();
            }
        } catch (err) {
            if (errEl) { errEl.textContent = _friendlyErr(err, 'ไม่สามารถบันทึกรายงานอุบัติเหตุได้'); errEl.classList.remove('hidden'); }
            btn.disabled = false;
            btn.textContent = 'บันทึก';
        }
    }));
}

function _buildExistingAttRow(a, accidentId) {
    const isImg = a.FileType?.startsWith('image/');
    const icon  = isImg
        ? `<svg class="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`
        : `<svg class="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`;
    return `
    <div id="acc-att-${a.id}" class="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
        ${icon}
        <a href="${_safeFileHref(a.FileURL)}" target="_blank" rel="noopener"
           class="flex-1 text-xs text-blue-600 hover:underline truncate" title="${_htmlEsc(a.FileName)}">${_htmlEsc(a.FileName)}</a>
        <button type="button" onclick="window._accDeleteAttachment(${Number.parseInt(a.id, 10)})"
            class="p-0.5 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0" title="ลบไฟล์">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
    </div>`;
}

function _renderPendingList() {
    const el = document.getElementById('acc-pending-list');
    if (!el) return;
    if (_pendingFiles.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = _pendingFiles.map((f, i) => {
        const size = f.size > 1048576 ? `${(f.size/1048576).toFixed(1)} MB` : `${Math.round(f.size/1024)} KB`;
        const isImg = f.type.startsWith('image/');
        const icon  = isImg
            ? `<svg class="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`
            : `<svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>`;
        return `
        <div class="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
            ${icon}
            <span class="flex-1 text-xs text-slate-700 truncate" title="${_esc(f.name)}">${_esc(f.name)}</span>
            <span class="text-[10px] text-slate-400 flex-shrink-0">${size}</span>
            <button type="button" onclick="window._accRemovePending(${i})"
                class="p-0.5 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0" title="ลบออก">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFETY PERFORMANCE PANEL
// ─────────────────────────────────────────────────────────────────────────────
const MONTHS_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function _accObject(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function _accNum(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function _accFmtMetric(value, digits = 2) {
    const n = _accNum(value, 0);
    return n.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

async function _renderPerformancePanel(targetId = 'acc-panel-performance') {
    const panel = document.getElementById(targetId);
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    try {
        const res = await API.get(`/accident/performance?year=${_statsYear}`);
        _perfData = res.data || null;
    } catch { _perfData = null; }

    if (!_perfData) {
        panel.innerHTML = `<div class="text-center py-16 text-slate-400 text-sm">โหลดข้อมูลไม่สำเร็จ</div>`;
        return;
    }

    const p        = _perfData;
    const today    = new Date();
    const lastDate = p.LastAccidentDate ? new Date(p.LastAccidentDate) : null;
    const tgtDays  = parseInt(p.TargetDays)   || 365;
    const tgtHours = parseInt(p.TargetHours)  || 1000000;
    const isZero   = parseInt(p.recordableCount) === 0;
    const rates = p.rates || {};
    const monthlyManHours = _accObject(rates.monthlyManHours || p.MonthlyManHours, {});
    const annualManHours = _accNum(rates.annualManHours || p.AnnualManHours, 0);
    const cumulativeManHours = _accNum(rates.cumulativeManHours || p.CumulativeManHours, 0);
    const manHourTotal = annualManHours || Object.values(monthlyManHours).reduce((sum, v) => sum + _accNum(v, 0), 0) || _accNum(p.TotalHours, 0);
    const hours = Math.round(manHourTotal);
    const daysSince = Number.isFinite(Number(_summary?.daysSince))
        ? Number(_summary.daysSince)
        : (lastDate ? _accDaysBetween(lastDate, today) : (parseInt(p.TotalDays) || 0));
    const daysPct  = tgtDays  > 0 ? Math.min(100, Math.round(daysSince * 100 / tgtDays))  : 0;
    const hoursPct = tgtHours > 0 ? Math.min(100, Math.round(hours * 100 / tgtHours)) : 0;
    const rateCards = [
        { label: 'ชั่วโมง/แสน', value: _accFmtMetric(rates.hoursPer100k || (manHourTotal / 100000), 3), sub: 'Man-hour / 100,000' },
        { label: 'Total man-hour', value: Math.round(manHourTotal).toLocaleString(), sub: 'รวมชั่วโมงการทำงาน' },
        { label: 'I.F.R', value: _accFmtMetric(rates.IFR, 3), sub: 'Injury x 1,000,000 / MH' },
        { label: 'TCIR', value: _accFmtMetric(rates.TCIR, 3), sub: 'Recordable x 200,000 / MH' },
        { label: 'LTIFR', value: _accFmtMetric(rates.LTIFR, 3), sub: 'Lost Time x 1,000,000 / MH' },
        { label: 'ISR', value: _accFmtMetric(rates.ISR, 3), sub: 'Lost Days x 1,000,000 / MH' },
        { label: 'TRIR', value: _accFmtMetric(rates.TRIR, 3), sub: 'Recordable x 200,000 / MH' },
    ];

    const fmtHours = h => {
        if (h >= 1000000) return (h / 1000000).toFixed(2) + 'M';
        return h.toLocaleString();
    };

    const monthlyStatus = (() => {
        try {
            return typeof p.MonthlyStatus === 'string'
                ? JSON.parse(p.MonthlyStatus)
                : (p.MonthlyStatus || {});
        } catch { return {}; }
    })();
    const monthlyReportRows = Array.isArray(p.monthlyReports) ? p.monthlyReports : [];
    const monthlyReportMap = Object.fromEntries(monthlyReportRows.map(row => [String(row.MonthNo), row]));
    const completedReportMonths = MONTHS_EN.filter((_m, i) => {
        const mo = String(i + 1);
        return (monthlyStatus[mo] === 'green' || monthlyStatus[mo] === 'red') && !!monthlyReportMap[mo]?.ReportFileUrl;
    }).length;
    const waitingReportMonths = MONTHS_EN.filter((_m, i) => {
        const mo = String(i + 1);
        return (monthlyStatus[mo] === 'green' || monthlyStatus[mo] === 'red') && !monthlyReportMap[mo]?.ReportFileUrl;
    }).length;
    const summaryKpi = _summary?.kpi || {};
    const typeRows = _summary?.byType || [];
    const typeCount = name => parseInt(typeRows.find(t => t.AccidentType === name)?.cnt) || 0;
    const statCounts = rates.statCounts || {};
    const boardCounters = [
        { label: 'ร้ายแรง', value: statCounts.severe || 0, color: '#7f1d1d' },
        { label: 'หยุดงาน > 3 วัน', value: statCounts.lostOver3 || 0, color: '#dc2626' },
        { label: 'หยุดงาน ≤ 3 วัน', value: statCounts.lostUnderEqual3 || 0, color: '#f97316' },
        { label: 'ไม่หยุดงาน (นับสถิติ)', value: statCounts.nonLostRecordable || 0, color: '#0f766e' },
        { label: 'ตัดออกจากสถิติ', value: (statCounts.excludedFirstAid || 0) + (statCounts.excludedNearMiss || 0), color: '#64748b' },
    ];
    const trendRows = _summary?.trend || [];
    const monthlyIncidentMap = {};
    trendRows.forEach(t => {
        const mo = String(t.mo || (t.period ? Number(String(t.period).slice(5, 7)) : ''));
        if (mo) monthlyIncidentMap[mo] = parseInt(t.recordable) || 0;
    });
    const maxMonthlyHours = Math.max(...Object.values(monthlyManHours).map(v => _accNum(v, 0)), 1);
    const maxMonthlyIncidents = Math.max(...Object.values(monthlyIncidentMap).map(v => _accNum(v, 0)), 1);
    const monthLegend = [
        { label: 'ปลอดภัย', color: '#059669' },
        { label: 'มีอุบัติเหตุ', color: '#dc2626' },
        { label: 'ยังไม่ถึง', color: '#e2e8f0' },
    ];

    const bannerGrad = isZero
        ? 'linear-gradient(135deg,#064e3b 0%,#059669 55%,#0d9488 100%)'
        : 'linear-gradient(135deg,#7f1d1d 0%,#dc2626 55%,#f97316 100%)';

    panel.innerHTML = `
    <div class="relative overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm" data-acc-card-image="accident-performance-board">
        <div class="absolute inset-0 opacity-[0.04] pointer-events-none">
            <svg width="100%" height="100%"><defs><pattern id="visual-board-grid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M 18 0 L 0 0 0 18" fill="none" stroke="#064e3b" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#visual-board-grid)"/></svg>
        </div>

        <div class="relative">
            <div class="${targetId === 'acc-dashboard-performance' ? 'hidden' : ''} px-5 py-4 text-white" style="background:${bannerGrad}">
                <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div class="min-w-0">
                        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-white/20 border border-white/30 mb-2">
                            <span class="w-2 h-2 rounded-full animate-pulse inline-block ${isZero ? 'bg-emerald-300' : 'bg-red-300'}"></span>
                            Safety KPI Board
                        </div>
                        <h2 class="text-xl md:text-2xl font-black leading-tight">บอร์ดสถิติความปลอดภัยประจำปี ${_statsYear}</h2>
                        <p class="text-sm mt-1" style="color:rgba(209,250,229,0.9)">คำนวณจาก Accident Report + Man-hour · ไม่รวม First Aid / Near Miss</p>
                        <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/20">
                                <span class="w-1.5 h-1.5 rounded-full bg-red-300"></span>Accident cases: รายงานอุบัติเหตุ
                            </span>
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/20">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-300"></span>Exposure: Man-hour
                            </span>
                        </div>
                    </div>
                    <div class="rounded-xl border border-white/30 bg-white/15 px-5 py-3 min-w-[240px]">
                        <div class="flex items-center justify-between gap-4">
                            <div>
                                <p class="text-xs font-bold uppercase opacity-80">Current Status</p>
                                <p class="mt-1 text-2xl font-black">${isZero ? 'ZERO ACCIDENT' : 'ACTION REQUIRED'}</p>
                                <p class="text-xs mt-1 opacity-80">${parseInt(p.recordableCount) || 0} counted cases</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-white/20 border border-white/25 flex items-center justify-center">
                                <svg class="w-5 h-5 ${isZero ? 'text-emerald-100' : 'text-red-100'}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="${isZero ? 'M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z' : 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z'}"/></svg>
                            </div>
                        </div>
                    </div>
                    <div class="flex flex-col sm:flex-row xl:flex-col gap-2" data-acc-card-ignore>
                        <button onclick="window._accShowCountedReports&&window._accShowCountedReports()"
                            class="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white border border-white/30 bg-white/10 hover:bg-white/20 transition-all whitespace-nowrap">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2a4 4 0 014-4h6m0 0l-3-3m3 3l-3 3M5 5h7M5 9h4M5 13h2"/></svg>
                            ดูรายงานที่นำมาคิด
                        </button>
                        ${_isAdmin ? `
                        <button onclick="window._accEditPerformance()"
                            class="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white border border-white/30 bg-white/15 hover:bg-white/25 transition-all whitespace-nowrap">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                            แก้ไข Man-hour
                        </button>` : ''}
                    </div>
                </div>
                <p class="mt-3 text-[11px] font-semibold text-white/70 text-right">${p.UpdatedBy ? `อัปเดต Man-hour โดย ${p.UpdatedBy}` : 'ยังไม่มีข้อมูลผู้แก้ไข Man-hour'}</p>
            </div>

            <div class="p-5 space-y-5 bg-slate-50/40">
                <div class="flex flex-col md:flex-row md:items-end justify-between gap-2">
                    <div>
                        <p class="text-xs font-black uppercase tracking-wide text-slate-400">Counted Case Classification</p>
                        <h3 class="text-lg font-black text-slate-800">กลุ่มอุบัติเหตุที่นำมาคิดสถิติ</h3>
                    </div>
                    <p class="text-xs text-slate-400">ตัด First Aid และ Near Miss ออกจาก KPI Board</p>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-5 gap-3" data-acc-card-image="accident-counted-case-classification">
                    ${boardCounters.map(c => `
                    <div class="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                        <div class="h-1 rounded-full mb-2" style="background:${c.color}"></div>
                        <p class="text-[11px] font-bold text-slate-500">${c.label}</p>
                        <p class="mt-1 text-2xl font-black tabular-nums" style="color:${c.color}">${Number(c.value).toLocaleString()}</p>
                    </div>`).join('')}
                </div>

                <div class="rounded-xl border border-slate-200 bg-white overflow-hidden" data-acc-card-image="accident-monthly-evidence">
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
                        <div>
                            <p class="text-xs font-black uppercase tracking-wide text-slate-400">Accident Report Monthly Evidence</p>
                            <h3 class="text-sm font-black text-slate-700">รายงานอุบัติเหตุประจำเดือน</h3>
                        </div>
                        <div class="flex flex-wrap gap-2 text-xs font-bold">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">${completedReportMonths} เดือนครบถ้วน</span>
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">${waitingReportMonths} เดือนรอไฟล์</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-12 gap-2 p-4">
                        ${MONTHS_EN.map((m, i) => {
                            const mo = String(i + 1);
                            const st = monthlyStatus[mo] || 'pending';
                            const report = monthlyReportMap[mo];
                            const hasFile = !!report?.ReportFileUrl;
                            const done = (st === 'green' || st === 'red') && hasFile;
                            const waiting = (st === 'green' || st === 'red') && !hasFile;
                            const color = done ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : waiting ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-slate-200 bg-slate-50 text-slate-500';
                            const label = done ? 'ครบถ้วน' : waiting ? 'รอไฟล์' : 'รอดำเนินการ';
                            return `
                            <button type="button" ${_isAdmin ? `onclick="window._accOpenMonthlyReport(${i + 1})"` : ''}
                                class="text-left rounded-xl border ${color} px-3 py-2 transition-all ${_isAdmin ? 'hover:shadow-sm active:scale-[0.99]' : 'cursor-default'}">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="text-xs font-black">${m}</span>
                                    <span class="w-2 h-2 rounded-full ${done ? 'bg-emerald-500' : waiting ? 'bg-amber-500' : 'bg-slate-300'}"></span>
                                </div>
                                <p class="mt-1 text-[11px] font-bold">${label}</p>
                            </button>`;
                        }).join('')}
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div class="lg:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden" data-acc-card-image="accident-monthly-safety-status">
                        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                            <h3 class="text-sm font-black text-slate-700">Monthly Safety Status</h3>
                            <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                ${monthLegend.map(l => `<span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded" style="background:${l.color}"></span>${l.label}</span>`).join('')}
                            </div>
                        </div>
                        <div class="p-4">
                            <div class="grid grid-cols-6 sm:grid-cols-12 gap-2">
                                ${MONTHS_EN.map((m, i) => {
                                    const mo  = String(i + 1);
                                    const st  = monthlyStatus[mo] || 'pending';
                                    const report = monthlyReportMap[mo];
                                    const hasFile = !!report?.ReportFileUrl;
                                    const yr  = parseInt(_statsYear);
                                    const now = new Date();
                                    const isCurrent = yr === now.getFullYear() && i === now.getMonth();
                                    const isPast    = yr < now.getFullYear() || (yr === now.getFullYear() && i < now.getMonth());

                                    let cellStyle, textCls, subLabel;
                                    if (st === 'green') {
                                        cellStyle = 'background:#059669';
                                        textCls   = 'text-white';
                                        subLabel  = hasFile ? 'OK' : 'FILE';
                                    } else if (st === 'red') {
                                        cellStyle = 'background:#dc2626';
                                        textCls   = 'text-white';
                                        subLabel  = hasFile ? 'ACC' : 'FILE';
                                    } else if (isCurrent) {
                                        cellStyle = 'background:rgba(2,132,199,0.1);border:2px solid #0284c7';
                                        textCls   = 'text-sky-700';
                                        subLabel  = 'NOW';
                                    } else {
                                        cellStyle = 'background:#f1f5f9';
                                        textCls   = isPast ? 'text-slate-400' : 'text-slate-300';
                                        subLabel  = '—';
                                    }

                                    const clickAttr = _isAdmin
                                        ? `onclick="window._accOpenMonthlyReport(${i+1})" style="${cellStyle};cursor:pointer"`
                                        : `style="${cellStyle}"`;

                                    return `
                                    <div ${clickAttr}
                                         class="rounded-lg py-3 text-center select-none transition-opacity relative ${_isAdmin ? 'hover:opacity-80' : ''} ${textCls}"
                                         title="${_isAdmin ? 'คลิกเพื่อจัดการสถานะและไฟล์รายงานประจำเดือน' : ''}">
                                        ${(st === 'green' || st === 'red') && !hasFile ? '<span class="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-white"></span>' : ''}
                                        ${hasFile ? '<span class="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-white/90 border border-white"></span>' : ''}
                                        <p class="text-xs font-black">${m}</p>
                                        <p class="text-[10px] mt-0.5 opacity-80">${subLabel}</p>
                                    </div>`;
                                }).join('')}
                            </div>
                            ${_isAdmin ? `<p class="mt-3 text-[11px] text-slate-400">คลิกเดือนเพื่อเลือกผลเดือนนั้นและอัปโหลด Accident Report Monthly ให้ครบขั้นตอน</p>` : ''}
                            <div class="mt-4 pt-4 border-t border-slate-100" data-acc-card-image="accident-monthly-exposure-counted-incidents">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                                    <div>
                                        <p class="text-xs font-black text-slate-600">Monthly Exposure & Counted Incidents</p>
                                        <p class="text-[11px] text-slate-400">แถบเขียวคือชั่วโมงทำงานรายเดือน ส่วนจุดแดงคือเคสนับสถิติ</p>
                                    </div>
                                    <div class="flex items-center gap-3 text-[11px] text-slate-500">
                                        <span class="inline-flex items-center gap-1.5"><span class="w-3 h-2 rounded bg-emerald-500"></span>Man-hour</span>
                                        <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>Incident</span>
                                    </div>
                                </div>
                                <div class="grid grid-cols-6 sm:grid-cols-12 gap-2 items-end min-h-[112px]">
                                    ${MONTHS_EN.map((m, i) => {
                                        const key = String(i + 1);
                                        const mh = _accNum(monthlyManHours[key], 0);
                                        const incidents = _accNum(monthlyIncidentMap[key], 0);
                                        const mhPct = mh > 0 ? Math.max(8, Math.round(mh * 100 / maxMonthlyHours)) : 0;
                                        const incPct = incidents > 0 ? Math.max(16, Math.round(incidents * 100 / maxMonthlyIncidents)) : 0;
                                        return `
                                        <div class="h-[112px] flex flex-col items-center justify-end gap-1">
                                            <div class="relative w-full h-[76px] flex items-end justify-center">
                                                ${incidents ? `<span class="absolute -top-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black shadow-sm">${incidents}</span>` : ''}
                                                <div class="w-full max-w-[34px] rounded-t-lg bg-emerald-500/90"
                                                    style="height:${mhPct}%"
                                                    title="${m}: ${Math.round(mh).toLocaleString()} man-hour"></div>
                                            </div>
                                            <p class="text-[10px] font-black text-slate-400">${m}</p>
                                        </div>`;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="rounded-xl border border-slate-200 bg-slate-50 p-4" data-acc-card-image="accident-current-record">
                        <h3 class="text-sm font-black text-slate-700">Current Record</h3>
                        <div class="mt-3 space-y-3">
                            <div>
                                <p class="text-[11px] font-bold text-slate-400 uppercase">ชั่วโมงการทำงานปัจจุบัน</p>
                                <p class="mt-1 text-3xl font-black text-emerald-700 tabular-nums">${hours.toLocaleString()}</p>
                                <p class="text-xs text-slate-400">เป้าหมาย ${tgtHours.toLocaleString()} ชั่วโมง · ${hoursPct}%</p>
                                <div class="mt-2 h-2 rounded-full bg-white overflow-hidden"><div class="h-full rounded-full bg-emerald-500" style="width:${hoursPct}%"></div></div>
                            </div>
                            <div>
                                <p class="text-[11px] font-bold text-slate-400 uppercase">วันปลอดอุบัติเหตุปัจจุบัน</p>
                                <p class="mt-1 text-3xl font-black text-sky-700 tabular-nums">${daysSince.toLocaleString()}</p>
                                <p class="text-xs text-slate-400">เป้าหมาย ${tgtDays.toLocaleString()} วัน · ${daysPct}%</p>
                                <div class="mt-2 h-2 rounded-full bg-white overflow-hidden"><div class="h-full rounded-full bg-sky-500" style="width:${daysPct}%"></div></div>
                            </div>
                            <div class="rounded-lg bg-white border border-slate-100 px-3 py-2">
                                <p class="text-[11px] font-bold text-slate-400 uppercase">อุบัติเหตุครั้งล่าสุด</p>
                                <p class="mt-1 text-lg font-black ${lastDate ? 'text-red-600' : 'text-slate-300'}">${lastDate ? lastDate.toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'2-digit'}) : '—'}</p>
                                <p class="text-xs text-slate-400">${lastDate ? `${daysSince.toLocaleString()} วันที่ผ่านมา` : 'ยังไม่มีข้อมูล'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="rounded-xl border border-slate-200 bg-white overflow-hidden" data-acc-card-image="accident-man-hour-incident-rates">
                    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
                        <div>
                            <h3 class="text-sm font-black text-slate-700">Man-hour & Incident Rates</h3>
                            <p class="text-xs text-slate-400">คำนวณเฉพาะเคสนับสถิติของปี ${_statsYear} ไม่รวม First Aid และ Near Miss</p>
                        </div>
                        <div class="text-xs text-slate-500">
                            สะสมทั้งหมด ${Math.round(cumulativeManHours || manHourTotal).toLocaleString()} ชั่วโมง
                        </div>
                    </div>
                    <div class="p-4">
                        <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
                            ${rateCards.map(card => `
                            <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <p class="text-[10px] font-black uppercase text-slate-400">${card.label}</p>
                                <p class="mt-1 text-lg font-black text-slate-800 tabular-nums">${card.value}</p>
                                <p class="text-[10px] text-slate-400 truncate" title="${card.sub}">${card.sub}</p>
                            </div>`).join('')}
                        </div>
                        <div class="mt-3 grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                            ${MONTHS_EN.map((m, i) => {
                                const val = _accNum(monthlyManHours[String(i + 1)], 0);
                                const max = Math.max(...Object.values(monthlyManHours).map(v => _accNum(v, 0)), 1);
                                const pct = Math.max(8, Math.round(val * 100 / max));
                                return `
                                <div class="rounded-lg border border-slate-100 bg-white p-2">
                                    <p class="text-[10px] font-black text-slate-400">${m}</p>
                                    <div class="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div class="h-full rounded-full bg-emerald-500" style="width:${val ? pct : 0}%"></div>
                                    </div>
                                    <p class="mt-1 text-[10px] font-bold text-slate-600 tabular-nums">${val ? Math.round(val).toLocaleString() : '-'}</p>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

function _refreshPerformanceBoard() {
    const targetId = document.getElementById('acc-dashboard-performance')
        ? 'acc-dashboard-performance'
        : 'acc-panel-performance';
    _renderPerformancePanel(targetId);
    _loadHeroKpiSummary();
}

window._accShowCountedReports = async () => {
    _filter.year = _statsYear;
    _filter.dept = '';
    _filter.type = '';
    _filter.status = '';
    _filter.quick = 'counted';
    switchTab('reports');
};

window._accGoReports = () => switchTab('reports');

window._accOpenMonthlyReport = month => {
    if (!_perfData || !_isAdmin) return;
    const mo = String(month);
    let monthlyStatus = {};
    try {
        monthlyStatus = typeof _perfData.MonthlyStatus === 'string'
            ? JSON.parse(_perfData.MonthlyStatus)
            : (_perfData.MonthlyStatus || {});
    } catch { monthlyStatus = {}; }
    const reports = Array.isArray(_perfData.monthlyReports) ? _perfData.monthlyReports : [];
    const report = reports.find(r => String(r.MonthNo) === mo) || {};
    const currentStatus = report.Status || monthlyStatus[mo] || 'pending';
    const monthName = MONTHS_TH[month - 1] || MONTHS_EN[month - 1] || mo;
    const fileUrl = report.ReportFileUrl || '';
    const fileName = report.ReportFileName || 'Accident Report Monthly';

    openModal(`รายงานอุบัติเหตุประจำเดือน ${monthName} ${_statsYear}`, `
      <form id="acc-monthly-report-form" class="space-y-4 px-1" enctype="multipart/form-data">
        <input type="hidden" name="Year" value="${_statsYear}">
        <input type="hidden" name="MonthNo" value="${month}">
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label class="block text-sm font-black text-slate-700 mb-2">ผลประจำเดือน</label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            ${[
                ['pending', 'รอดำเนินการ', 'bg-slate-50 text-slate-600 border-slate-200'],
                ['green', 'ไม่มีอุบัติเหตุ', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
                ['red', 'มีอุบัติเหตุ', 'bg-red-50 text-red-700 border-red-200'],
            ].map(([value, label, cls]) => `
              <label class="rounded-xl border ${cls} px-3 py-2 text-sm font-bold cursor-pointer">
                <input type="radio" name="Status" value="${value}" class="mr-2" ${currentStatus === value ? 'checked' : ''}>
                ${label}
              </label>`).join('')}
          </div>
        </div>
        <div>
          <label class="block text-sm font-black text-slate-700 mb-1.5">ไฟล์ Accident Report Monthly</label>
          ${fileUrl ? `
            <div class="mb-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
              <a href="${_safeFileHref(fileUrl)}" target="_blank" rel="noopener" class="min-w-0 truncate text-sm font-bold text-emerald-700 hover:underline">${_htmlEsc(fileName)}</a>
              <span class="text-[11px] font-bold text-emerald-600">มีไฟล์แล้ว</span>
            </div>` : `
            <div class="mb-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">ยังไม่มีไฟล์รายงานประจำเดือน</div>`}
          <input type="file" name="reportFile" accept=".pdf,.doc,.docx,.xls,.xlsx"
            class="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all">
          <p class="mt-1 text-xs text-slate-400">รองรับ PDF, Word, Excel ขนาดไม่เกิน 20 MB; เลือกไฟล์ใหม่เพื่อแทนที่ไฟล์เดิม</p>
        </div>
        <div>
          <label class="block text-sm font-black text-slate-700 mb-1.5">หมายเหตุ</label>
          <textarea name="Notes" rows="3" class="form-input w-full rounded-xl text-sm" placeholder="สรุปผลหรือหมายเหตุสำหรับเดือนนี้">${_htmlEsc(report.Notes || '')}</textarea>
        </div>
        <div id="acc-monthly-report-error" class="hidden rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600"></div>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div>${report.UpdatedAt ? `<p class="text-xs text-slate-400">อัปเดตล่าสุด ${_htmlEsc(new Date(report.UpdatedAt).toLocaleString('th-TH'))}</p>` : ''}</div>
          <div class="flex justify-end gap-2">
            ${report.id ? `<button type="button" onclick="window._accDeleteMonthlyReport(${report.id})" class="px-4 py-2 rounded-xl border border-red-100 text-sm font-bold text-red-500 hover:bg-red-50">ลบรายงาน</button>` : ''}
            <button type="button" onclick="closeModal()" class="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100">ยกเลิก</button>
            <button type="submit" id="acc-monthly-report-submit" class="px-5 py-2 rounded-xl text-sm font-bold text-white" style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึกรายงาน</button>
          </div>
        </div>
      </form>`, 'max-w-2xl');

    document.getElementById('acc-monthly-report-form')?.addEventListener('submit', guardSubmitHandler(async e => {
        e.preventDefault();
        const btn = document.getElementById('acc-monthly-report-submit');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>บันทึก...';
        }
        try {
            const fd = new FormData(e.target);
            await API.post('/accident/monthly-reports', fd);
            closeModal();
            showToast('บันทึกรายงานประจำเดือนสำเร็จ', 'success');
            _perfData = null;
            _refreshPerformanceBoard();
        } catch (err) {
            const el = document.getElementById('acc-monthly-report-error');
            if (el) {
                el.textContent = _friendlyErr(err, 'ไม่สามารถบันทึกรายงานประจำเดือนได้');
                el.classList.remove('hidden');
            }
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'บันทึกรายงาน';
            }
        }
    }));
};

window._accDeleteMonthlyReport = async id => {
    const ok = await showConfirmationModal('ยืนยันการลบ', 'ลบรายงานอุบัติเหตุประจำเดือนนี้ใช่หรือไม่? ไฟล์ที่อัปโหลดไว้จะถูกลบออกด้วย');
    if (!ok) return;
    try {
        await API.delete(`/accident/monthly-reports/${id}`);
        closeModal();
        showToast('ลบรายงานประจำเดือนสำเร็จ', 'success');
        _perfData = null;
        _refreshPerformanceBoard();
    } catch (err) {
        showToast(_friendlyErr(err, 'ไม่สามารถลบรายงานประจำเดือนได้'), 'error');
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW GLOBALS
// ─────────────────────────────────────────────────────────────────────────────
function _htmlEsc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _accInfoField(label, value) {
    return `<div>
        <p class="text-[10px] font-bold uppercase text-slate-400">${_htmlEsc(label)}</p>
        <p class="mt-1 text-sm font-semibold text-slate-700">${_htmlEsc(value || '-')}</p>
    </div>`;
}

function _safeFileHref(value) {
    const raw = String(value || '').trim();
    if (/^(\/|\.\.\/uploads\/|uploads\/|public\/)/.test(raw) || /^https?:\/\//i.test(raw)) return _htmlEsc(raw);
    return '#';
}

function _accDocText(value) {
    const raw = String(value || '').trim();
    if (!raw) return `<p class="text-sm text-slate-400">-</p>`;
    const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    return lines.map(line => {
        const isList = /^(\d+[\.)]|[-•])\s*/.test(line);
        return `<p class="${isList ? 'pl-4 -indent-4' : ''}">${_htmlEsc(line)}</p>`;
    }).join('');
}

function _accShortText(value, max = 48) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

function _accDocField(label, value, options = {}) {
    const accent = options.accent || 'slate';
    const color = {
        slate: 'text-slate-500 border-slate-200',
        amber: 'text-amber-600 border-amber-200',
        red: 'text-red-600 border-red-200',
        emerald: 'text-emerald-600 border-emerald-200',
        sky: 'text-sky-600 border-sky-200',
    }[accent] || 'text-slate-500 border-slate-200';
    return `
        <section class="border-l-4 ${color} pl-4 py-1">
            <h4 class="text-[11px] font-black uppercase tracking-wide ${color.split(' ')[0]}">${_htmlEsc(label)}</h4>
            <div class="mt-2 space-y-2 text-[14px] leading-7 text-slate-800 font-medium text-justify break-words">
                ${_accDocText(value)}
            </div>
        </section>`;
}

function _accDocumentPanel(title, subtitle, content, tone = 'slate') {
    const toneClass = {
        slate: 'border-slate-200 bg-white',
        amber: 'border-amber-200 bg-amber-50/55',
        red: 'border-red-200 bg-red-50/45',
        emerald: 'border-emerald-200 bg-emerald-50/45',
        sky: 'border-sky-200 bg-sky-50/45',
    }[tone] || 'border-slate-200 bg-white';
    return `
        <article class="rounded-xl border ${toneClass} px-5 py-4 shadow-sm">
            <div class="mb-4 border-b border-black/5 pb-3">
                <p class="text-xs font-black uppercase tracking-wide text-slate-500">${_htmlEsc(title)}</p>
                ${subtitle ? `<p class="mt-1 text-sm font-semibold text-slate-700">${_htmlEsc(subtitle)}</p>` : ''}
            </div>
            <div class="space-y-5">
                ${content}
            </div>
        </article>`;
}

window._accShowDocPopup = (title, content, accent = 'slate', subtitle = '') => {
    const html = _accDocumentPanel(title, subtitle, _accDocField(title, content, { accent }), accent);
    _accOpenReaderPopup(title, html, subtitle);
};

function _accOpenReaderPopup(title, contentHtml, subtitle = '') {
    document.getElementById('acc-reader-popup')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'acc-reader-popup';
    wrap.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4';
    wrap.innerHTML = `
        <div class="w-full max-w-3xl max-h-[84vh] overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl">
            <div class="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                    <h3 class="text-lg font-black text-slate-800">${_htmlEsc(title)}</h3>
                    ${subtitle ? `<p class="mt-1 text-xs font-semibold text-slate-500">${_htmlEsc(subtitle)}</p>` : ''}
                </div>
                <button type="button" onclick="document.getElementById('acc-reader-popup')?.remove()" class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="max-h-[70vh] overflow-y-auto p-5">
                ${contentHtml}
            </div>
        </div>`;
    wrap.addEventListener('click', e => {
        if (e.target === wrap) wrap.remove();
    });
    document.body.appendChild(wrap);
}

window._accShowRootCauseDetail = id => {
    const item = _accDetailDocCache[String(id)] || {};
    const content = item.rootCause || 'ยังไม่ระบุ / Not specified';
    const html = _accDocumentPanel(
        'Root Cause Analysis / การวิเคราะห์สาเหตุรากเหง้า',
        'อ่านรายละเอียดฉบับเต็มโดยไม่ทำให้ Timeline ยืดยาว',
        _accDocField('Root Cause / สาเหตุรากเหง้า', content, { accent: 'amber' }),
        'amber'
    );
    _accOpenReaderPopup('Root Cause / สาเหตุรากเหง้า', html, item.subtitle || '');
};

function _accClosureChecklist(r) {
    const isNear = r.AccidentType === 'Near Miss';
    const closeAction = isNear
        ? (_nearMissDetails(r.NearMissDetails).NearMissCAPA || r.CorrectiveAction)
        : r.CorrectiveAction;
    const items = [
        { label: 'CAPA / Corrective Action', done: !!closeAction },
        { label: 'Responsible Person', done: !!r.ResponsiblePerson },
        { label: 'Due Date', done: !!r.DueDate },
        { label: 'Verification Result', done: !!r.VerificationResult },
        { label: 'Verified By', done: !!r.VerifiedBy },
        { label: 'Attachment Evidence', done: Array.isArray(r.attachments) && r.attachments.length > 0 },
    ];
    const ready = items.every(x => x.done);
    return `
        <div class="rounded-xl border ${ready ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-amber-50'} p-3">
            <div class="flex items-center justify-between gap-3 mb-2">
                <p class="text-xs font-black uppercase ${ready ? 'text-emerald-700' : 'text-amber-700'}">Closure Checklist / เช็กลิสต์ปิดเคส</p>
                <span class="rounded-full px-2 py-0.5 text-[10px] font-black ${ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${ready ? 'Ready' : 'Action Required'}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                ${items.map(x => `
                    <div class="flex items-center gap-2 text-xs font-semibold ${x.done ? 'text-emerald-700' : 'text-slate-500'}">
                        <span class="w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${x.done ? 'bg-emerald-100' : 'bg-slate-100'}">${x.done ? '✓' : '•'}</span>
                        ${_htmlEsc(x.label)}
                    </div>`).join('')}
            </div>
        </div>`;
}

function _nearMissDetailPanel(details, report = {}) {
    const nm = _nearMissDetails(details);
    if (report.PotentialSeverity && !nm.PotentialSeverity) nm.PotentialSeverity = report.PotentialSeverity;
    if (!Object.keys(nm).length) return '';
    const people = _nearMissPeople(nm.NearMissRelatedPeople);
    const peopleHtml = people.length ? `
        <section class="border-l-4 border-amber-200 pl-4 py-1">
            <h4 class="text-[11px] font-black uppercase tracking-wide text-amber-600">ผู้เกี่ยวข้อง / Involved Persons</h4>
            <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                ${people.map((p, i) => _personCard(p, i).replace(/<button[\s\S]*?<\/button>/, '')).join('')}
            </div>
        </section>` : '';
    const meta = [
        ['ลำดับที่ / Report No.', nm.NearMissNo],
        ['ประเภทงาน / Work Type', nm.NearMissWorkType],
        ['เบอร์โทรศัพท์ / Phone', nm.NearMissPhone],
        ['กะ / Shift', nm.NearMissShift],
        ['Potential Severity', nm.PotentialSeverity],
        ['ขณะกำลังทำอะไร / Work Being Performed', nm.NearMissWorkingOn],
        ['Layout จุดเกิดเหตุ / Location Layout', nm.NearMissLayoutNote],
    ].filter(([, value]) => value);
    return _accDocumentPanel(
        'Nearmiss Report Form',
        'รายละเอียดเหตุการณ์เกือบเกิดอุบัติเหตุ / Near Miss Report Detail',
        `
            <div class="flex justify-end -mt-2">
                <span class="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-black text-amber-700">Rev.05</span>
            </div>
            ${meta.length ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                ${meta.map(([label, value]) => `
                <div class="rounded-lg border border-amber-100 bg-white/75 px-3 py-2">
                    <p class="text-[10px] font-black uppercase text-amber-600">${_htmlEsc(label)}</p>
                    <p class="mt-1 text-sm font-black text-slate-800 leading-6">${_htmlEsc(value)}</p>
                </div>`).join('')}
            </div>` : ''}
            ${_accDocField('หัวข้อเหตุการณ์ / Event Title', nm.NearMissEventTitle, { accent: 'amber' })}
            ${_accDocField('เหตุการณ์เกือบเกิดอุบัติเหตุ / Near Miss Event', nm.NearMissEvent, { accent: 'amber' })}
            ${_accDocField('จุดที่ต้องปรับปรุงแก้ไข / Improvement Point', nm.NearMissImprovementPoint, { accent: 'amber' })}
            ${_accDocField('ข้อผิดพลาดและอันตรายที่ตรวจพบ / Hazard Findings', nm.NearMissHazardFinding, { accent: 'amber' })}
            ${peopleHtml}
            ${_accDocField('CAPA / Corrective and Preventive Action', nm.NearMissCAPA, { accent: 'emerald' })}
            ${_accDocField('Root Cause / สาเหตุรากเหง้า', nm.NearMissRootCause, { accent: 'red' })}
        `,
        'amber'
    );
}

function _accStandardNarrativePanel(r) {
    const sections = [
        r.Description ? _accDocField('Incident Description / รายละเอียดเหตุการณ์', r.Description, { accent: 'red' }) : '',
        r.MedicalTreatment ? _accDocField('Medical Treatment / การรักษาพยาบาล', r.MedicalTreatment, { accent: 'sky' }) : '',
        (r.RootCause || r.RootCauseDetail || r.ImmediateCause || r.UnsafeAct || r.UnsafeCondition) ? `
            ${_accDocField('Immediate Cause / สาเหตุทันที', r.ImmediateCause, { accent: 'amber' })}
            ${_accDocField('Unsafe Act / การกระทำที่ไม่ปลอดภัย', r.UnsafeAct, { accent: 'amber' })}
            ${_accDocField('Unsafe Condition / สภาพที่ไม่ปลอดภัย', r.UnsafeCondition, { accent: 'amber' })}
            ${_accDocField('Root Cause / สาเหตุรากเหง้า', [r.RootCause, r.RootCauseDetail].filter(Boolean).join('\n'), { accent: 'red' })}
        ` : '',
        (r.CorrectiveAction || r.PreventiveAction) ? `
            ${_accDocField('Corrective Action / มาตรการแก้ไข', r.CorrectiveAction, { accent: 'emerald' })}
            ${_accDocField('Preventive Action / มาตรการป้องกัน', r.PreventiveAction, { accent: 'emerald' })}
        ` : '',
    ].filter(Boolean).join('');
    if (!sections) return '';
    return _accDocumentPanel(
        'Accident Investigation Narrative',
        'รายละเอียดการสอบสวนและมาตรการ / Investigation Detail and Action Plan',
        sections,
        'slate'
    );
}

function _accVerificationPanel(r) {
    if (!r.VerificationResult) return '';
    return _accDocumentPanel(
        'CAPA Verification',
        `ผลการตรวจยืนยัน / Verified by ${r.VerifiedBy || '-'}${r.VerifiedAt ? ' · ' + new Date(r.VerifiedAt).toLocaleDateString('th-TH') : ''}`,
        _accDocField('Verification Result / ผลการตรวจยืนยัน', r.VerificationResult, { accent: 'sky' }),
        'sky'
    );
}

function _accAuditTrailHtml(rows = []) {
    if (!_isAdmin) return '';
    const body = rows.length ? rows.map(a => `
        <div class="flex items-start gap-3 py-2 border-b border-slate-100 last:border-b-0">
            <div class="w-2 h-2 mt-2 rounded-full bg-slate-300 flex-shrink-0"></div>
            <div class="min-w-0 flex-1">
                <p class="text-xs font-black text-slate-700">${_htmlEsc(a.Action || '-')}</p>
                <p class="text-xs text-slate-500">${_htmlEsc(a.Detail || '')}</p>
                <p class="mt-0.5 text-[10px] text-slate-400">${_htmlEsc(a.AdminName || a.AdminID || 'System')} · ${a.ActionTime ? new Date(a.ActionTime).toLocaleString('th-TH') : '-'}</p>
            </div>
        </div>`).join('') : `<p class="text-sm text-slate-400">ยังไม่มี audit trail สำหรับรายงานนี้ / No audit trail yet.</p>`;
    return `
        <div class="rounded-xl border border-slate-200 bg-white p-3">
            <p class="text-xs font-black uppercase text-slate-500 mb-2">Audit Trail / ประวัติการดำเนินการ</p>
            ${body}
        </div>`;
}

function _renderAccidentDetail(r, auditRows = []) {
    const fmtDate = value => value ? new Date(value).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'numeric' }) : '-';
    const typeColor = TYPE_COLOR[r.AccidentType] || { bg: 'bg-slate-100', text: 'text-slate-600' };
    const sevColor = SEV_COLOR[r.Severity] || { bg: 'bg-slate-100', text: 'text-slate-600' };
    const statusClass = r.Status === 'Closed' ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-amber-100 text-amber-700 border-amber-200';
    const attachments = Array.isArray(r.attachments) ? r.attachments : [];
    const due = r.DueDate ? new Date(r.DueDate) : null;
    const overdue = r.Status !== 'Closed' && due && due < new Date();
    const follow = _followupState(r);
    const nearMissDetails = _nearMissDetails(r.NearMissDetails);
    const rootCauseText = r.AccidentType === 'Near Miss'
        ? (nearMissDetails.NearMissRootCause || r.RootCause || r.RootCauseDetail)
        : (r.RootCause || (r.RootCauseDetail ? 'ระบุรายละเอียดแล้ว' : ''));
    const detailKey = String(r.id || r.ReportID || r.AccidentID || 'current');
    _accDetailDocCache[detailKey] = {
        rootCause: rootCauseText || '',
        subtitle: `${r.ReportNo || r.id || '-'} · ${r.AccidentType || '-'} · ${fmtDate(r.AccidentDate)}`,
    };
    const attIcon = a => a.FileType?.startsWith('image/')
        ? `<svg class="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4-4a2 2 0 012.8 0l1.2 1.2L15 10a2 2 0 012.8 0L20 12.2M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`
        : `<svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.4a1 1 0 00-.3-.7l-5.4-5.4a1 1 0 00-.7-.3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`;
    const body = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Type</p>
                    <p class="mt-1 text-sm font-bold text-slate-700">${_htmlEsc(r.AccidentType || '-')}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Severity</p>
                    <p class="mt-1 text-sm font-bold text-slate-700">${_htmlEsc(r.Severity || '-')}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Lost Days</p>
                    <p class="mt-1 text-sm font-bold ${Number(r.LostDays) > 0 ? 'text-red-600' : 'text-slate-700'}">${Number(r.LostDays) || 0}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase text-slate-400">Due</p>
                    <p class="mt-1 text-sm font-bold ${overdue ? 'text-red-600' : 'text-slate-700'}">${_htmlEsc(fmtDate(r.DueDate))}</p>
                </div>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white p-4">
                <p class="text-xs font-bold uppercase text-slate-400 mb-3">Follow-up Timeline</p>
                <div class="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Incident</p>
                        <p class="mt-1 text-sm font-semibold text-slate-700">${_htmlEsc(fmtDate(r.AccidentDate))}</p>
                    </div>
                    <div class="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-amber-600">Root Cause</p>
                        <p class="mt-1 text-sm font-semibold text-slate-700">${rootCauseText ? 'ระบุแล้ว / Completed' : 'ยังไม่ระบุ / Not specified'}</p>
                        ${rootCauseText ? `<button type="button" onclick="window._accShowRootCauseDetail('${_esc(detailKey)}')" class="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-black text-amber-700 hover:bg-amber-100">ดูเพิ่มเติม / View detail</button>` : ''}
                    </div>
                    <div class="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-emerald-600">Action Owner</p>
                        <p class="mt-1 text-sm font-semibold text-slate-700">${_htmlEsc(r.ResponsiblePerson || 'ยังไม่ระบุ')}</p>
                    </div>
                    <div class="rounded-lg border px-3 py-2 ${overdue ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}">
                        <p class="text-[10px] font-bold uppercase ${overdue ? 'text-red-600' : 'text-slate-400'}">Due / Status</p>
                        <p class="mt-1 text-sm font-semibold ${overdue ? 'text-red-700' : 'text-slate-700'}">${_htmlEsc(fmtDate(r.DueDate))} · ${_htmlEsc(follow.label)}</p>
                    </div>
                    <div class="rounded-lg bg-sky-50 border border-sky-100 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-sky-600">Investigation</p>
                        <p class="mt-1 text-sm font-semibold text-slate-700">${_htmlEsc(r.InvestigationStatus || 'Reported')}</p>
                    </div>
                    <div class="rounded-lg border px-3 py-2 ${_accAgingInfo(r).cls}">
                        <p class="text-[10px] font-bold uppercase">Aging</p>
                        <p class="mt-1 text-sm font-semibold">${_htmlEsc(_accAgingInfo(r).label)}</p>
                    </div>
                </div>
            </div>
            ${_accClosureChecklist(r)}

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                ${_accInfoField('Accident Date', `${fmtDate(r.AccidentDate)} ${r.AccidentTime || ''}`.trim())}
                ${_accInfoField('Report Date', fmtDate(r.ReportDate))}
                ${_accInfoField('Employee', `${r.EmployeeID || '-'} ${r.EmployeeName ? '- ' + r.EmployeeName : ''}`)}
                ${_accInfoField('Department', r.Department)}
                ${_accInfoField('Area', r.Area)}
                ${_accInfoField('Reporter', r.ReporterName)}
                ${_accInfoField('Potential Severity', r.PotentialSeverity)}
                ${_accInfoField('Verified By', r.VerifiedBy)}
                ${_accInfoField('Verified Date', fmtDate(r.VerifiedAt))}
            </div>

            ${r.AccidentType === 'Near Miss' ? _nearMissDetailPanel(r.NearMissDetails, r) : _accStandardNarrativePanel(r)}
            ${attachments.length ? `<div>
                <p class="text-xs font-bold uppercase text-slate-400 mb-2">Attachments (${attachments.length})</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    ${attachments.map(a => `<a href="${_safeFileHref(a.FileURL)}" target="_blank" rel="noopener"
                        class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-50 border border-slate-100 text-slate-700 hover:bg-slate-100">
                        ${attIcon(a)}
                        <span class="min-w-0 flex-1 truncate">${_htmlEsc(a.FileName || 'Attachment')}</span>
                        <span class="text-[10px] text-slate-400">${a.FileSize ? Math.ceil(Number(a.FileSize) / 1024) + ' KB' : ''}</span>
                    </a>`).join('')}
                </div>
            </div>` : ''}
            ${_accVerificationPanel(r)}
            ${_accAuditTrailHtml(auditRows)}
        </div>`;

    openDetailModal({
        title: `ACC-${String(r.id || '').padStart(4, '0')}`,
        subtitle: `${fmtDate(r.AccidentDate)} · ${r.Department || '-'} · ${r.EmployeeName || r.EmployeeID || '-'}`,
        meta: [
            { label: r.Status || '-', className: statusClass },
            { label: follow.label, className: `${follow.cls} border-slate-200` },
            { label: r.AccidentType || '-', className: `${typeColor.bg} ${typeColor.text} border-slate-200` },
            { label: r.Severity || '-', className: `${sevColor.bg} ${sevColor.text} border-slate-200` },
            overdue ? { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-200' } : null,
        ],
        body,
        size: 'max-w-4xl'
    });
}

window._accViewReport = async id => {
    try {
        const [res, audit] = await Promise.all([
            API.get(`/accident/reports/${id}`),
            _isAdmin ? API.get(`/accident/reports/${id}/audit`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        ]);
        if (res?.data) _renderAccidentDetail(res.data, audit?.data || []);
    } catch {
        showToast('ไม่สามารถโหลดรายละเอียดอุบัติเหตุได้', 'error');
    }
};

window._accEditReport = async id => {
    try {
        const res = await API.get(`/accident/reports/${id}`);
        if (res?.data) openAccidentForm(res.data, res.data.attachments || []);
    } catch {
        showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
    }
};

window._accDeleteReport = async id => {
    const ok = await showConfirmationModal('ยืนยันการลบ', 'ต้องการลบรายงานอุบัติเหตุนี้ใช่หรือไม่?');
    if (!ok) return;
    return _withActionLock(`delete-report:${id}`, async () => {
      try {
        await API.delete(`/accident/reports/${id}`);
        showToast('ลบรายงานสำเร็จ', 'success');
        _summary   = null;
        _analytics = null;
        _perfData  = null;
        _loadHeroStats();
        _loadHeroKpiSummary();
        await _fetchReports();
        const wrap = document.getElementById('acc-reports-wrap');
        const visibleReports = _visibleReports();
        if (wrap) wrap.innerHTML = _buildReportsTable(visibleReports);
        const cnt = document.getElementById('acc-rec-count');
        if (cnt)  cnt.textContent = `${visibleReports.length} รายการ`;
      } catch (err) {
        showToast(_friendlyErr(err, 'ไม่สามารถลบรายงานอุบัติเหตุได้'), 'error');
      }
    });
};

window._accExportPDF = async id => {
    try {
        showLoading('กำลังสร้าง PDF...');
        const res = await API.get(`/accident/reports/${id}`);
        const r   = res?.data;
        if (!r) { showToast('ไม่พบรายงาน', 'error'); return; }

        const fmt = iso => iso ? new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const v   = val => val != null && val !== '' ? _esc(String(val)) : '—';

        // Hiyari-aligned 2-page case report path. Keep accident-case fields, split long content so it does not compress into one A4 page.
        {
            const pages = [];
            const docNo = `ACC-${String(r.id).padStart(4,'0')}`;
            const recordableText = r.IsRecordable ? 'Yes' : 'No';
            const isClosed = String(r.Status || '').toLowerCase() === 'closed';
            const dueDate = r.DueDate ? new Date(r.DueDate) : null;
            const overdue = !isClosed && dueDate && dueDate < new Date();
            const capaColor = isClosed ? '#059669' : overdue ? '#dc2626' : '#d97706';
            const pageShell = (title, sub, body, pageNo) => {
                const el = document.createElement('div');
                el.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1122px;background:#fff;font-family:Kanit,sans-serif;display:flex;flex-direction:column;color:#1e293b;overflow:hidden';
                el.innerHTML = `
                    <div style="background:#065f46;padding:18px 28px;color:#fff;flex-shrink:0">
                        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
                            <div>
                                <p style="font-size:10px;opacity:.82;margin:0 0 3px">Thai Summit Harness Co., Ltd. · Official Safety Case Report</p>
                                <h1 style="font-size:21px;font-weight:900;margin:0;line-height:1.18">${title}</h1>
                                <p style="font-size:11px;opacity:.9;margin:5px 0 0">${sub} · ${docNo}</p>
                            </div>
                            <div style="text-align:right;font-size:9.5px;line-height:1.55;opacity:.92">
                                <p style="margin:0">Generated: ${fmt(new Date().toISOString())}</p>
                                <p style="margin:4px 0 0">Status: ${v(r.Status)}</p>
                                <p style="margin:4px 0 0;font-size:8.5px;opacity:.75">${docNo}</p>
                            </div>
                        </div>
                    </div>
                    <div style="flex:1;padding:18px 28px 14px;display:flex;flex-direction:column;gap:12px;min-height:0">${body}</div>
                    <div style="margin-top:auto;padding:8px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
                        <p style="font-size:8.8px;margin:0">Accident Case Report · Thai Summit Harness Co., Ltd.</p>
                        <p style="font-size:8.8px;margin:0">Page ${pageNo} / 2 · ${docNo}</p>
                    </div>`;
                document.body.appendChild(el);
                pages.push(el);
                return el;
            };
            const section = (no, title, inner) => `
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff">
                    <p style="font-size:12px;font-weight:900;color:#065f46;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin:0 0 10px">${no}. ${title}</p>
                    ${inner}
                </div>`;
            const metric = (label, value, color = '#0f766e') => `
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center;min-height:64px">
                    <div style="font-size:17px;font-weight:900;color:${color};line-height:1.08">${value}</div>
                    <div style="font-size:8.5px;color:#475569;margin-top:6px;font-weight:800">${label}</div>
                </div>`;
            const approvalBox = label => `
                <div style="height:72px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:9px;text-align:center">
                    <div style="height:28px;border-bottom:1px solid #94a3b8;margin:0 8px 6px"></div>
                    <div style="font-size:8.5px;font-weight:900;color:#1e293b">${label}</div>
                    <div style="font-size:7.5px;color:#94a3b8;margin-top:2px">Date: ____ / ____ / ____</div>
                </div>`;
            const rootCauseCombined = [r.RootCause, r.RootCauseDetail].filter(Boolean).map(x => _esc(String(x))).join('\n') || '—';
            const page1 = pageShell(
                'Accident / Incident Case Report',
                'Case Summary & Incident Detail',
                `
                <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
                    ${metric('Type', v(r.AccidentType), '#0f766e')}
                    ${metric('Severity', v(r.Severity), '#dc2626')}
                    ${metric('Potential', v(r.PotentialSeverity), '#d97706')}
                    ${metric('Recordable', recordableText, r.IsRecordable ? '#dc2626' : '#059669')}
                    ${metric('Lost Days', r.LostDays > 0 ? r.LostDays : 0, r.LostDays > 0 ? '#dc2626' : '#64748b')}
                    ${metric('Status', v(r.Status), capaColor)}
                </div>
                ${section('1', 'General Information', `
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px">
                        ${_pdfField('Accident Date', fmt(r.AccidentDate))}
                        ${_pdfField('Report Date', fmt(r.ReportDate))}
                        ${_pdfField('Time', v(r.AccidentTime))}
                        ${_pdfField('Area', v(r.Area))}
                        ${_pdfField('Location', v(r.Location))}
                        ${_pdfField('Department', v(r.Department))}
                        ${_pdfField('Reported By', v(r.ReportedBy))}
                        ${_pdfField('Document No.', docNo)}
                        ${_pdfField('Investigation', v(r.InvestigationStatus))}
                    </div>`)}
                ${section('2', 'Person / Employee Involved', `
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px">
                        ${_pdfField('Employee ID', v(r.EmployeeID))}
                        ${_pdfField('Employee Name', v(r.EmployeeName))}
                        ${_pdfField('Position', v(r.Position))}
                        ${_pdfField('Employment Type', v(r.EmploymentType))}
                    </div>`)}
                ${section('3', 'Incident Narrative', `
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:9px">
                        ${_pdfField('Accident Type', v(r.AccidentType))}
                        ${_pdfField('Severity', v(r.Severity))}
                        ${_pdfField('Potential Severity', v(r.PotentialSeverity))}
                    </div>
                    ${_pdfFieldFull('Description', v(r.Description))}`)}
                ${section('4', 'Injury / Medical Information', `
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px">
                        ${_pdfField('Injury Type', v(r.InjuryType))}
                        ${_pdfField('Body Part', v(r.BodyPart))}
                        ${_pdfField('Lost Days', r.LostDays > 0 ? r.LostDays + ' day(s)' : '0 day(s)')}
                        ${_pdfField('Recordable', recordableText)}
                        ${_pdfField('Medical Treatment', v(r.MedicalTreatment))}
                    </div>`)}
                `,
                1
            );
            const page2 = pageShell(
                'Accident / Incident Follow-up',
                'Cause Analysis, CAPA & Verification',
                `
                ${section('5', 'Cause Analysis', `
                    ${_pdfFieldFull('Immediate Cause', v(r.ImmediateCause))}
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
                        ${_pdfFieldFull('Unsafe Act', v(r.UnsafeAct))}
                        ${_pdfFieldFull('Unsafe Condition', v(r.UnsafeCondition))}
                    </div>
                    ${_pdfFieldFull('Root Cause', rootCauseCombined)}`)}
                ${section('6', 'Corrective / Preventive Action', `
                    ${_pdfFieldFull('Corrective Action / CAPA', v(r.CorrectiveAction))}
                    ${_pdfFieldFull('Preventive Action', v(r.PreventiveAction))}
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px">
                        ${_pdfField('Responsible Person', v(r.ResponsiblePerson))}
                        ${_pdfField('Due Date', fmt(r.DueDate))}
                        ${_pdfField('CAPA Status', overdue ? 'Overdue' : v(r.Status))}
                    </div>`)}
                ${section('7', 'Verification / Closure', `
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:9px">
                        ${_pdfField('Investigation Status', v(r.InvestigationStatus))}
                        ${_pdfField('Verified By', v(r.VerifiedBy))}
                        ${_pdfField('Verified Date', fmt(r.VerifiedAt))}
                    </div>
                    ${_pdfFieldFull('CAPA Verification Result', v(r.VerificationResult))}`)}
                <div style="border:1px solid #d1fae5;background:#f0fdf4;border-radius:12px;padding:13px">
                    <div style="font-size:12px;font-weight:900;color:#065f46;margin-bottom:7px">8. Approval / Acknowledgement</div>
                    <div style="font-size:9.5px;color:#334155;line-height:1.55;margin-bottom:10px">This case report preserves the accident record, investigation detail, CAPA ownership, and verification status from the system for review and safety follow-up.</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                        ${approvalBox('Prepared By')}
                        ${approvalBox('Reviewed By')}
                        ${approvalBox('Approved By')}
                    </div>
                </div>
                `,
                2
            );
            try {
                const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                for (const [idx, el] of [page1, page2].entries()) {
                    const canvas = await html2canvas(el, { scale: 1.5, useCORS: true, logging: false, backgroundColor: '#ffffff' });
                    if (idx > 0) pdf.addPage();
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
                }
                const fn = `ACC-${String(r.id).padStart(4,'0')}-${(r.AccidentDate||'').slice(0,10).replace(/-/g,'')}.pdf`;
                pdf.save(fn);
                showToast('ส่งออก PDF สำเร็จ', 'success');
            } finally {
                pages.forEach(el => el?.parentNode?.removeChild(el));
            }
            return;
        }

        const page = document.createElement('div');
        page.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;min-height:1122px;background:#fff;font-family:Kanit,sans-serif;display:flex;flex-direction:column;color:#1e293b';
        page.innerHTML = `
        <div style="background:#065f46;padding:18px 28px;color:#fff;flex-shrink:0">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <div>
                    <p style="font-size:10px;opacity:.82;margin:0 0 3px">Thai Summit Harness Co., Ltd. · Safety Summary Report</p>
                    <h1 style="font-size:21px;font-weight:900;margin:0;line-height:1.18">Accident Report</h1>
                    <p style="font-size:11px;opacity:.9;margin:5px 0 0">รายงานอุบัติเหตุ / Incident Case Record · ACC-${String(r.id).padStart(4,'0')}</p>
                </div>
                <div style="text-align:right;font-size:9.5px;line-height:1.55;opacity:.92">
                    <p style="margin:0">Generated: ${fmt(new Date().toISOString())}</p>
                    <p style="margin:4px 0 0">Status: ${v(r.Status)}</p>
                    <p style="margin:4px 0 0;font-size:8.5px;opacity:.75">ACC-${String(r.id).padStart(4,'0')}</p>
                </div>
            </div>
        </div>

        <div style="flex:1;padding:18px 28px 14px;display:flex;flex-direction:column;gap:14px">
            <!-- Section 1: ข้อมูลทั่วไป -->
            <div>
                <p style="font-size:12px;font-weight:900;color:#065f46;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin:0 0 10px">1. ข้อมูลทั่วไป / General Information</p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                    ${_pdfField('วันที่เกิดเหตุ', fmt(r.AccidentDate))}
                    ${_pdfField('วันที่รายงาน', fmt(r.ReportDate))}
                    ${_pdfField('เวลา', v(r.AccidentTime))}
                    ${_pdfField('บริเวณ/สถานที่', v(r.Area || r.Location))}
                    ${_pdfField('ผู้รายงาน', v(r.ReportedBy))}
                    ${_pdfField('แผนก', v(r.Department))}
                </div>
            </div>
            <!-- Section 2: ผู้ประสบเหตุ -->
            <div>
                <p style="font-size:12px;font-weight:900;color:#065f46;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin:0 0 10px">2. ผู้ประสบเหตุ / Injured Person</p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                    ${_pdfField('รหัสพนักงาน', v(r.EmployeeID))}
                    ${_pdfField('ชื่อ', v(r.EmployeeName))}
                    ${_pdfField('ตำแหน่ง', v(r.Position))}
                    ${_pdfField('ประเภทการจ้าง', v(r.EmploymentType))}
                </div>
            </div>
            <!-- Section 3: รายละเอียด -->
            <div>
                <p style="font-size:12px;font-weight:900;color:#065f46;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin:0 0 10px">3. รายละเอียดเหตุการณ์ / Incident Detail</p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                    ${_pdfField('ประเภทอุบัติเหตุ', v(r.AccidentType))}
                    ${_pdfField('ความรุนแรง', v(r.Severity))}
                    ${_pdfField('Potential Severity', v(r.PotentialSeverity))}
                </div>
                ${_pdfFieldFull('คำอธิบาย', v(r.Description))}
            </div>
            <!-- Section 4: การบาดเจ็บ -->
            <div>
                <p style="font-size:12px;font-weight:900;color:#065f46;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin:0 0 10px">4. การบาดเจ็บ / Injury</p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                    ${_pdfField('ประเภทการบาดเจ็บ', v(r.InjuryType))}
                    ${_pdfField('ส่วนของร่างกาย', v(r.BodyPart))}
                    ${_pdfField('วันหยุดงาน', r.LostDays > 0 ? r.LostDays + ' วัน' : '0 วัน')}
                    ${_pdfField('Recordable', r.IsRecordable ? 'ใช่' : 'ไม่ใช่')}
                    ${_pdfField('การรักษา', v(r.MedicalTreatment))}
                </div>
            </div>
            <!-- Section 5: สาเหตุ -->
            <div>
                <p style="font-size:12px;font-weight:900;color:#065f46;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin:0 0 10px">5. วิเคราะห์สาเหตุ / Cause Analysis</p>
                ${_pdfFieldFull('สาเหตุทันที', v(r.ImmediateCause))}
                ${_pdfFieldFull('พฤติกรรมไม่ปลอดภัย', v(r.UnsafeAct))}
                ${_pdfFieldFull('สภาพไม่ปลอดภัย', v(r.UnsafeCondition))}
                ${_pdfFieldFull('สาเหตุรากเหง้า', v(r.RootCause))}
            </div>
            <!-- Section 6: มาตรการ -->
            <div>
                <p style="font-size:12px;font-weight:900;color:#065f46;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin:0 0 10px">6. มาตรการแก้ไข / Corrective Action</p>
                ${_pdfFieldFull('มาตรการแก้ไข', v(r.CorrectiveAction))}
                ${_pdfFieldFull('มาตรการป้องกัน', v(r.PreventiveAction))}
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px">
                    ${_pdfField('ผู้รับผิดชอบ', v(r.ResponsiblePerson))}
                    ${_pdfField('กำหนดเสร็จ', fmt(r.DueDate))}
                    ${_pdfField('สถานะ', v(r.Status))}
                    ${_pdfField('สถานะสอบสวน / Investigation', v(r.InvestigationStatus))}
                    ${_pdfField('ผู้ตรวจยืนยัน / Verified By', v(r.VerifiedBy))}
                    ${_pdfField('วันที่ตรวจยืนยัน / Verified Date', fmt(r.VerifiedAt))}
                </div>
                ${_pdfFieldFull('ผลการตรวจยืนยัน CAPA / CAPA Verification Result', v(r.VerificationResult))}
            </div>
        </div>

        <div style="margin-top:auto;padding:8px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
            <p style="font-size:8.8px;margin:0">Accident Report · Thai Summit Harness Co., Ltd.</p>
            <p style="font-size:8.8px;margin:0">ACC-${String(r.id).padStart(4,'0')}</p>
        </div>`;

        document.body.appendChild(page);
        const canvas = await html2canvas(page, { scale: 1.5, useCORS: true, logging: false });
        document.body.removeChild(page);

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        const fn = `ACC-${String(r.id).padStart(4,'0')}-${(r.AccidentDate||'').slice(0,10).replace(/-/g,'')}.pdf`;
        pdf.save(fn);
        showToast('ส่งออก PDF สำเร็จ', 'success');
    } catch (err) {
        showToast(_friendlyErr(err, 'ไม่สามารถส่งออก PDF ได้'), 'error');
    } finally {
        hideLoading();
    }
};

function _pdfField(label, val) {
    return `<div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px">
        <p style="font-size:9px;color:#94a3b8;margin:0 0 2px">${label}</p>
        <p style="font-size:11px;color:#1e293b;font-weight:600;margin:0">${val}</p>
    </div>`;
}
function _pdfFieldFull(label, val) {
    return `<div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px;margin-bottom:8px">
        <p style="font-size:9px;color:#94a3b8;margin:0 0 2px">${label}</p>
        <p style="font-size:11px;color:#1e293b;margin:0;white-space:pre-wrap;line-height:1.5">${val}</p>
    </div>`;
}

window._accExportDashboardPDF = async () => {
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        showToast('ไม่พบ library สำหรับสร้าง PDF', 'error');
        return;
    }
    const pages = [];
    try {
        showLoading('กำลังสร้าง PDF ภาพรวม...');
        const [summaryRes, perfRes, analyticsRes] = await Promise.all([
            API.get(`/accident/summary?year=${_statsYear}`),
            API.get(`/accident/performance?year=${_statsYear}`).catch(() => ({ data: null })),
            API.get(`/accident/analytics?year=${_statsYear}`).catch(() => ({ data: null })),
        ]);
        const summary = summaryRes?.data || {};
        const perf = perfRes?.data || {};
        const analytics = analyticsRes?.data || {};
        const kpi = summary.kpi || {};
        const rates = perf.rates || {};
        const today = new Date();
        const safe = val => _esc(String(val ?? '-'));
        const num = val => Number(val || 0);
        const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
        const docNo = `ACC-OV-${_statsYear}-${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const openActions = summary.openActions || [];
        const fmtNumber = val => num(val).toLocaleString('en-US', { maximumFractionDigits: 2 });
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const overdue = openActions.filter(r => r.DueDate && new Date(r.DueDate) < todayStart).length;
        const dueSoon = openActions.filter(r => _followupState(r).key === 'dueSoon').length;
        const health = overdue || num(kpi.fatal) ? 'Action' : num(kpi.recordable) ? 'Watch' : 'Stable';
        const healthColor = health === 'Stable' ? '#059669' : health === 'Watch' ? '#d97706' : '#dc2626';
        const maxMonthly = Math.max(1, ...(summary.trend || []).map(r => num(r.total)));
        const lastCountedDate = rates.lastStatAccidentDate || perf.LastAccidentDate || null;
        const annualManHours = num(rates.annualManHours || perf.AnnualManHours || perf.TotalHours);
        const cumulativeManHours = num(rates.cumulativeManHours || perf.CumulativeManHours || annualManHours);
        const targetDays = num(perf.TargetDays || 365);
        const targetHours = num(perf.TargetHours || 1000000);

        const pageShell = (title, sub, body, pageNo) => {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1122px;background:#fff;font-family:Kanit,sans-serif;display:flex;flex-direction:column;color:#1e293b;overflow:hidden';
            el.innerHTML = `
                <div style="background:#065f46;color:#fff;padding:18px 28px;flex-shrink:0">
                    <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start">
                        <div>
                            <p style="font-size:10px;opacity:.82;margin:0 0 3px">Thai Summit Harness Co., Ltd. · Safety Summary Report</p>
                            <h1 style="font-size:21px;font-weight:900;margin:0;line-height:1.18">${title}</h1>
                            <p style="font-size:11px;opacity:.9;margin:5px 0 0">${sub} · FY ${_statsYear}</p>
                        </div>
                        <div style="text-align:right;font-size:9.5px;line-height:1.55;opacity:.92">
                            <div>Document No: ${docNo}</div>
                            <div>Generated: ${fmtDate(today.toISOString())}</div>
                            <div>Classification: Internal Use Only</div>
                        </div>
                    </div>
                </div>
                <div style="flex:1;padding:18px 28px 14px;display:flex;flex-direction:column;gap:12px;min-height:0">${body}</div>
                <div style="margin-top:auto;padding:8px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:8.8px;display:flex;justify-content:space-between;flex-shrink:0">
                    <span>Accident Overview Report · Thai Summit Harness Co., Ltd.</span>
                    <span>Page ${pageNo} / 2</span>
                </div>`;
            document.body.appendChild(el);
            pages.push(el);
            return el;
        };
        const sectionTitle = (title, sub = '') => `
            <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px">
                <div><h2 style="font-size:14px;font-weight:900;color:#065f46;margin:0">${title}</h2>${sub ? `<p style="font-size:9.5px;color:#64748b;margin:2px 0 0">${sub}</p>` : ''}</div>
            </div>`;
        const metricCard = (label, value, color, sub = '') => `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:9px;text-align:center;min-height:70px;overflow:hidden">
                <div style="font-size:21px;font-weight:900;color:${color};line-height:1.12">${safe(value)}</div>
                <div style="font-size:8.8px;color:#475569;margin-top:6px;font-weight:800">${label}</div>
                ${sub ? `<div style="font-size:7.8px;color:#94a3b8;margin-top:2px">${safe(sub)}</div>` : ''}
            </div>`;
        const classificationCard = (label, value, color, sub = '') => `
            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:9px;background:#fff;min-height:64px">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                    <div style="font-size:8.6px;color:#475569;font-weight:900;line-height:1.18">${safe(label)}</div>
                    <div style="font-size:20px;font-weight:900;color:${color};line-height:1">${num(value)}</div>
                </div>
                ${sub ? `<div style="font-size:7.6px;color:#94a3b8;margin-top:6px;line-height:1.2">${safe(sub)}</div>` : ''}
            </div>`;
        const factRow = (label, value, color = '#334155') => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #e2e8f0;padding:4px 0">
                <span style="font-size:8.4px;color:#64748b;font-weight:800">${safe(label)}</span>
                <b style="font-size:9.2px;color:${color};text-align:right">${safe(value)}</b>
            </div>`;
        const bar = (pct, color, h = 7) => `<div style="height:${h}px;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(0, Math.min(100, pct))}%;background:${color};border-radius:999px"></div></div>`;
        const rowBar = (label, value, max, color = '#0f766e') => {
            const pct = Math.round(num(value) * 100 / Math.max(1, max));
            return `<div style="margin-bottom:8px;break-inside:avoid">
                <div style="display:grid;grid-template-columns:minmax(0,1fr) 34px;gap:8px;align-items:start;font-size:9px;margin-bottom:3px;min-height:18px">
                    <b style="color:#334155;line-height:1.18;word-break:break-word">${safe(label)}</b>
                    <span style="font-weight:900;color:${color};text-align:right;white-space:nowrap">${num(value)}</span>
                </div>
                ${bar(pct, color, 6)}
            </div>`;
        };
        const trendRowBar = row => {
            const totalCases = num(row.total);
            const pct = Math.round(totalCases * 100 / Math.max(1, maxMonthly));
            const label = row.period || MONTHS_TH[(num(row.mo) || 1) - 1] || '-';
            const recordable = num(row.recordable);
            const nearMiss = num(row.nearMiss);
            return `<div style="margin-bottom:8px;break-inside:avoid">
                <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:start;font-size:9px;margin-bottom:3px;min-height:18px">
                    <b style="color:#334155;line-height:1.18;word-break:break-word">${safe(label)}</b>
                    <span style="font-weight:900;color:#0ea5e9;text-align:right;white-space:nowrap">${totalCases}</span>
                </div>
                ${bar(pct, '#0ea5e9', 6)}
                <div style="display:flex;gap:8px;font-size:7.6px;color:#64748b;margin-top:2px">
                    <span>Total ${totalCases}</span><span style="color:#dc2626">Rec ${recordable}</span><span style="color:#d97706">NM ${nearMiss}</span>
                </div>
            </div>`;
        };
        const typeMax = Math.max(1, ...(summary.byType || []).map(r => num(r.cnt)));
        const deptMax = Math.max(1, ...(summary.byDept || []).map(r => num(r.total)));
        const rootMax = Math.max(1, ...(analytics.rootCauses || []).map(r => num(r.cnt)));
        const trendRows = (summary.trend || []).map(r => trendRowBar(r)).join('');
        const typeRows = (summary.byType || []).slice(0, 6).map(r => rowBar(r.AccidentType || '-', r.cnt, typeMax, '#d97706')).join('');
        const deptRows = (summary.byDept || []).slice(0, 8).map(r => rowBar(r.Department || '-', r.total, deptMax, num(r.recordable) ? '#dc2626' : '#0f766e')).join('');
        const rootRows = (analytics.rootCauses || []).slice(0, 7).map(r => rowBar(r.cause || '-', r.cnt, rootMax, '#64748b')).join('');
        const hotspotMax = Math.max(1, ...(analytics.hotspot || []).map(r => num(r.cnt)));
        const injuryMax = Math.max(1, ...(analytics.injuryTypeStats || []).map(r => num(r.cnt)));
        const bodyMax = Math.max(1, ...(analytics.bodyPartStats || []).map(r => num(r.cnt)));
        const hotspotRows = (analytics.hotspot || []).slice(0, 5).map(r => rowBar(r.area || '-', r.cnt, hotspotMax, num(r.recordable) ? '#dc2626' : '#0f766e')).join('');
        const injuryRows = (analytics.injuryTypeStats || []).slice(0, 4).map(r => rowBar(r.label || '-', r.cnt, injuryMax, '#d97706')).join('');
        const bodyRows = (analytics.bodyPartStats || []).slice(0, 4).map(r => rowBar(r.label || '-', r.cnt, bodyMax, '#7c3aed')).join('');
        const actionRows = openActions.slice(0, 6).map((r, idx) => {
            const state = _followupState(r);
            const color = state.key === 'overdue' ? '#dc2626' : state.key === 'dueSoon' ? '#d97706' : '#059669';
            return `<tr style="background:${idx % 2 ? '#fff' : '#f8fafc'}">
                <td style="padding:6px;text-align:center;color:#64748b;border-bottom:3px solid #fff">${idx + 1}</td>
                <td style="padding:6px;border-bottom:3px solid #fff"><b>${fmtDate(r.AccidentDate)}</b><div style="font-size:7.8px;color:#64748b">${safe(r.AccidentType)}</div></td>
                <td style="padding:6px;border-bottom:3px solid #fff;line-height:1.25;word-break:break-word">${safe(r.Department || '-')}</td>
                <td style="padding:6px;border-bottom:3px solid #fff;line-height:1.25;word-break:break-word">${safe(r.ResponsiblePerson || '-')}</td>
                <td style="padding:6px;text-align:right;font-weight:900;color:${color};border-bottom:3px solid #fff">${safe(state.label)}</td>
            </tr>`;
        }).join('');
        const rateCards = [
            ['IFR', rates.IFR || 0, '#0f766e', 'Injury x 1,000,000 MH'],
            ['TCIR', rates.TCIR || 0, '#d97706', 'Recordable x 200,000 MH'],
            ['LTIFR', rates.LTIFR || 0, '#dc2626', 'Lost time x 1,000,000 MH'],
            ['ISR', rates.ISR || 0, '#7c3aed', 'Lost days x 1,000,000 MH'],
            ['TRIR', rates.TRIR || 0, '#334155', 'Recordable x 200,000 MH'],
        ].map(([label, value, color, sub]) => metricCard(label, value, color, sub)).join('');
        const statCounts = rates.statCounts || {};
        const excludedCount = num(statCounts.excludedFirstAid) + num(statCounts.excludedNearMiss);
        const classificationCards = [
            ['Severe / Critical', statCounts.severe || 0, '#7f1d1d', 'Fatal or critical severity'],
            ['Lost > 3 Days', statCounts.lostOver3 || 0, '#dc2626', 'Recordable lost-time case'],
            ['Lost <= 3 Days', statCounts.lostUnderEqual3 || 0, '#f97316', 'Short lost-time case'],
            ['Non-lost Recordable', statCounts.nonLostRecordable || 0, '#0f766e', 'Counted, no lost day'],
            ['Excluded', excludedCount, '#64748b', 'First Aid + Near Miss'],
        ].map(([label, value, color, sub]) => classificationCard(label, value, color, sub)).join('');
        const manhourFacts = [
            ['Annual man-hour', fmtNumber(annualManHours), '#0f766e'],
            ['Cumulative man-hour', fmtNumber(cumulativeManHours), '#0f766e'],
            ['Hours / 100k', rates.hoursPer100k || (annualManHours / 100000), '#334155'],
            ['Target hours', fmtNumber(targetHours), '#64748b'],
            ['Counted cases', statCounts.total || kpi.recordable || 0, '#dc2626'],
            ['Lost days', kpi.lostDays || 0, '#dc2626'],
        ].map(([label, value, color]) => factRow(label, value, color)).join('');
        const recentRows = (summary.recentReports || []).slice(0, 4).map((r, idx) => {
            const statusColor = r.Status === 'Closed' ? '#059669' : '#d97706';
            return `<tr style="background:${idx % 2 ? '#fff' : '#f8fafc'}">
                <td style="padding:6px;text-align:center;color:#64748b;border-bottom:3px solid #fff">${idx + 1}</td>
                <td style="padding:6px;border-bottom:3px solid #fff"><b>${fmtDate(r.AccidentDate)}</b><div style="font-size:7.8px;color:#64748b">${safe(r.AccidentType)}</div></td>
                <td style="padding:6px;border-bottom:3px solid #fff;line-height:1.25;word-break:break-word">${safe(r.Department || '-')}</td>
                <td style="padding:6px;border-bottom:3px solid #fff;line-height:1.25;word-break:break-word">${safe(r.Area || '-')}</td>
                <td style="padding:6px;text-align:right;font-weight:900;color:${statusColor};border-bottom:3px solid #fff">${safe(r.Status || 'Open')}</td>
            </tr>`;
        }).join('');
        const keyNotes = [
            `Accident-free days: ${summary.daysSince ?? '-'} · Recordable: ${num(kpi.recordable)} · Fatal: ${num(kpi.fatal)}`,
            `Open follow-up: ${openActions.length} · Overdue: ${overdue} · Due soon: ${dueSoon}`,
            `Annual man-hours: ${safe(rates.annualManHours || 0)} · IFR ${safe(rates.IFR || 0)} · LTIFR ${safe(rates.LTIFR || 0)}`,
            (summary.byDept || [])[0] ? `Top department by cases: ${(summary.byDept || [])[0].Department} (${(summary.byDept || [])[0].total})` : 'No department case concentration in selected year',
        ];

        const page1 = pageShell('Accident Overview Report', 'Executive Summary', `
            ${sectionTitle('1. Report Summary / ภาพรวมรายงาน', 'สรุปจำนวนเคส สถิติความปลอดภัย และสถานะติดตาม')}
            <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
                ${metricCard('Accident-free', summary.daysSince ?? '-', '#059669', 'Days')}
                ${metricCard('Total Cases', num(kpi.total), '#0f766e', 'All reports')}
                ${metricCard('Recordable', num(kpi.recordable), num(kpi.recordable) ? '#dc2626' : '#64748b', 'Counted')}
                ${metricCard('Near Miss', num(kpi.nearMiss), '#d97706', 'Learning')}
                ${metricCard('Lost Days', num(kpi.lostDays), num(kpi.lostDays) ? '#dc2626' : '#64748b', 'Days')}
                ${metricCard('Open CAPA', openActions.length, openActions.length ? '#d97706' : '#059669', 'Follow-up')}
            </div>
            <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:12px">
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">
                    <div style="font-size:12px;font-weight:900;color:#065f46;margin-bottom:8px">Key Notes / ประเด็นสำคัญ</div>
                    ${keyNotes.map(t => `<div style="font-size:10px;color:#334155;margin-bottom:6px;display:flex;gap:6px"><span style="color:#f97316;font-weight:900">•</span><span>${safe(t)}</span></div>`).join('')}
                </div>
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center">
                    <div style="font-size:12px;font-weight:900;color:#065f46;margin-bottom:7px;text-align:left">Current Record</div>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;min-height:34px">
                        <div style="font-size:25px;font-weight:900;line-height:1.24;color:${healthColor};text-align:left;padding-bottom:2px">${health}</div>
                        <div style="font-size:8.2px;color:#64748b;text-align:right">Overdue ${overdue}<br>Recordable ${num(kpi.recordable)}</div>
                    </div>
                    <div style="margin-top:2px">${bar(health === 'Stable' ? 100 : health === 'Watch' ? 65 : 35, healthColor, 7)}</div>
                    <div style="margin-top:7px;text-align:left">
                        ${factRow('Last counted accident', fmtDate(lastCountedDate), healthColor)}
                        ${factRow('Accident-free days', summary.daysSince ?? '-', '#059669')}
                        ${factRow('Target days', targetDays || '-', '#64748b')}
                        ${factRow('Current man-hour', fmtNumber(cumulativeManHours || annualManHours), '#0f766e')}
                    </div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:12px">
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">${sectionTitle('2. Monthly Trend', 'Total / Recordable / Near Miss by month')}${trendRows || '<div style="font-size:10px;color:#94a3b8;text-align:center;padding:20px">No trend data</div>'}</div>
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">${sectionTitle('3. Case Mix', `Type breakdown &middot; Total ${num(kpi.total)}`)}${typeRows || '<div style="font-size:10px;color:#94a3b8;text-align:center;padding:20px">No type data</div>'}</div>
            </div>
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc">
                ${sectionTitle('4. Counted Case Classification', 'การจัดกลุ่มเคสที่นับสถิติและเคสที่ตัดออก')}
                <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">${classificationCards}</div>
                <div style="font-size:8.2px;color:#64748b;margin-top:7px;line-height:1.35">Counted total: ${num(statCounts.total || kpi.recordable)} · Excluded First Aid: ${num(statCounts.excludedFirstAid)} · Excluded Near Miss: ${num(statCounts.excludedNearMiss)}</div>
            </div>
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">
                ${sectionTitle('5. Recent Case Snapshot', 'รายการล่าสุดจาก Accident Register')}
                <table style="width:100%;border-collapse:collapse;font-size:8.7px">
                    <tr style="background:#065f46;color:#fff"><th style="padding:6px;text-align:center">#</th><th style="padding:6px;text-align:left">Date / Type</th><th style="padding:6px;text-align:left">Department</th><th style="padding:6px;text-align:left">Area</th><th style="padding:6px;text-align:right">Status</th></tr>
                    ${recentRows || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#94a3b8;font-weight:900">No recent accident records</td></tr>'}
                </table>
            </div>
        `, 1);
        const page2 = pageShell('Accident Follow-up Overview', 'Risk Focus & Action Tracking', `
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc">
                ${sectionTitle('6. Man-hour & Incident Rates', 'สถิติอุบัติเหตุเทียบกับชั่วโมงการทำงาน')}
                <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">
                    ${rateCards}
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0 14px;margin-top:8px">${manhourFacts}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;min-height:190px">${sectionTitle('7. Department Focus', 'แผนกที่มีรายงานสูงสุด')}${deptRows || '<div style="font-size:10px;color:#94a3b8;text-align:center;padding:20px">No department data</div>'}</div>
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;min-height:190px">${sectionTitle('8. Root Cause Pattern', 'รูปแบบสาเหตุหลัก')}${rootRows || '<div style="font-size:10px;color:#94a3b8;text-align:center;padding:20px">No root cause data</div>'}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">
                    ${sectionTitle('9. Area Hotspot', 'พื้นที่เกิดเหตุซ้ำ / จุดที่ต้องติดตาม')}
                    ${hotspotRows || '<div style="font-size:10px;color:#94a3b8;text-align:center;padding:18px">No area hotspot data</div>'}
                </div>
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">
                    ${sectionTitle('10. Injury & Body Part', 'รูปแบบการบาดเจ็บและอวัยวะที่เกี่ยวข้อง')}
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                        <div>${injuryRows || '<div style="font-size:9px;color:#94a3b8;text-align:center;padding:14px">No injury data</div>'}</div>
                        <div>${bodyRows || '<div style="font-size:9px;color:#94a3b8;text-align:center;padding:14px">No body-part data</div>'}</div>
                    </div>
                </div>
            </div>
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">
                ${sectionTitle('11. Open Action Tracker', 'รายการ CAPA / Follow-up ที่ยังไม่ปิด')}
                <table style="width:100%;border-collapse:collapse;font-size:8.7px">
                    <tr style="background:#065f46;color:#fff"><th style="padding:6px;text-align:center">#</th><th style="padding:6px;text-align:left">Date / Type</th><th style="padding:6px;text-align:left">Department</th><th style="padding:6px;text-align:left">Owner</th><th style="padding:6px;text-align:right">SLA</th></tr>
                    ${actionRows || '<tr><td colspan="5" style="padding:18px;text-align:center;color:#059669;font-weight:900">No open follow-up actions</td></tr>'}
                </table>
                ${openActions.length > 6 ? `<div style="font-size:8.2px;color:#64748b;margin-top:6px;text-align:right">Showing top 6 of ${openActions.length} open follow-up items</div>` : ''}
            </div>
            <div style="border:1px solid #d1fae5;background:#f0fdf4;border-radius:12px;padding:13px">
                <div style="font-size:12px;font-weight:900;color:#065f46;margin-bottom:6px">12. Follow-up Notes / ข้อเสนอแนะ</div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:9.4px;color:#334155;line-height:1.55">
                    <div><b style="color:#dc2626">1. Recordable</b><br>ทบทวนเคสที่นับสถิติและ Lost Time ก่อนประชุมติดตาม</div>
                    <div><b style="color:#d97706">2. CAPA SLA</b><br>เร่งปิดรายการ overdue / due soon และเติม owner ให้ครบ</div>
                    <div><b style="color:#0f766e">3. Prevention</b><br>ใช้ root cause pattern เพื่อกำหนด action ป้องกันซ้ำ</div>
                </div>
            </div>
        `, 2);

        const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        for (const [idx, el] of [page1, page2].entries()) {
            const canvas = await html2canvas(el, { scale: 1.5, useCORS: true, logging: false, backgroundColor: '#ffffff' });
            if (idx > 0) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
        }
        pdf.save(`Accident-Overview-${_statsYear}.pdf`);
        showToast('ส่งออก PDF ภาพรวมสำเร็จ', 'success');
    } catch (err) {
        console.error('Accident overview PDF error:', err);
        showToast(_friendlyErr(err, 'ไม่สามารถส่งออก PDF ภาพรวมได้'), 'error');
    } finally {
        pages.forEach(el => el?.parentNode?.removeChild(el));
        hideLoading();
    }
};

window._accDeleteAttachment = async attId => {
    const ok = await showConfirmationModal('ลบไฟล์แนบ', 'ต้องการลบไฟล์นี้ใช่หรือไม่?');
    if (!ok) return;
    return _withActionLock(`delete-attachment:${attId}`, async () => {
      try {
        await API.delete(`/accident/attachments/${attId}`);
        document.getElementById(`acc-att-${attId}`)?.remove();
        showToast('ลบไฟล์สำเร็จ', 'success');
      } catch (err) {
        showToast(_friendlyErr(err, 'ลบไฟล์ไม่สำเร็จ'), 'error');
      }
    });
};

window._accRemovePending = idx => {
    _pendingFiles.splice(idx, 1);
    _renderPendingList();
};

window._accEditPerformance = () => {
    const p = _perfData || {};
    const lastDateVal = p.LastAccidentDate
        ? String(p.LastAccidentDate).split('T')[0]
        : '';
    const monthlyManHours = _accObject(p.rates?.monthlyManHours || p.MonthlyManHours, {});
    const annualManHours = _accNum(p.rates?.annualManHours || p.AnnualManHours, 0);
    const cumulativeManHours = _accNum(p.rates?.cumulativeManHours || p.CumulativeManHours, 0);
    const calculatedAnnual = annualManHours || Object.values(monthlyManHours).reduce((sum, value) => sum + _accNum(value, 0), 0);
    const calculatedDays = Number.isFinite(Number(_summary?.daysSince)) ? Number(_summary.daysSince) : (_accNum(p.TotalDays, 0) || 0);
    const html = `
    <form id="perf-form" class="space-y-4">
        <input type="hidden" name="Year" value="${p.Year || new Date().getFullYear()}">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ปี (Year)</label>
                <input type="text" value="${p.Year || new Date().getFullYear()}"
                    class="form-input w-full bg-slate-50" readonly>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันเกิดอุบัติเหตุล่าสุดที่นับสถิติ</label>
                <input type="text" id="perf-last-date" name="LastAccidentDate"
                    value="${lastDateVal}" class="form-input w-full bg-white"
                    placeholder="ระบบจะใช้เคสล่าสุดของปีนี้ถ้ามีรายงาน">
                <p class="mt-1 text-xs text-slate-400">นับเฉพาะ Severe / Lost Time / Medical Treatment ไม่รวม First Aid และ Near Miss</p>
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    Man-Hours ปลอดอุบัติเหตุ
                    <span class="font-normal text-slate-400">(สะสม)</span>
                </label>
                <input type="number" name="TotalHours" min="0"
                    value="${p.TotalHours || 0}" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    วันปลอดอุบัติเหตุ
                    <span class="font-normal text-slate-400">(คำนวณจากวันล่าสุดถ้ามี)</span>
                </label>
                <input type="number" name="TotalDays" min="0"
                    value="${p.TotalDays || 0}" class="form-input w-full">
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เป้าหมาย Man-Hours</label>
                <input type="number" name="TargetHours" min="0"
                    value="${p.TargetHours || 1000000}" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">เป้าหมายวัน</label>
                <input type="number" name="TargetDays" min="0"
                    value="${p.TargetDays || 365}" class="form-input w-full">
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รวมชั่วโมงการทำงาน / Total man-hour</label>
                <input type="number" step="0.01" name="AnnualManHours" min="0"
                    value="${annualManHours || ''}" class="form-input w-full"
                    placeholder="ปล่อยว่างเพื่อรวมจากรายเดือน">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชั่วโมงการทำงานสะสม</label>
                <input type="number" step="0.01" name="CumulativeManHours" min="0"
                    value="${cumulativeManHours || ''}" class="form-input w-full"
                    placeholder="เช่น ยอดสะสมจากปี 2562">
            </div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div class="flex items-center justify-between gap-2 mb-2">
                <div>
                    <p class="text-sm font-black text-slate-700">ชั่วโมงการทำงานสะสมรายเดือน</p>
                    <p class="text-xs text-slate-400">ใช้คำนวณชั่วโมง/แสน, I.F.R, TCIR, LTIFR, ISR และ TRIR</p>
                </div>
                <span class="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-1">Monthly MH</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                ${MONTHS_EN.map((m, i) => `
                <label class="block">
                    <span class="block text-[10px] font-black text-slate-400 mb-1">${m}</span>
                    <input type="number" step="0.01" min="0" name="mh_${i + 1}"
                        value="${monthlyManHours[String(i + 1)] || ''}"
                        class="form-input w-full text-sm" placeholder="0">
                </label>`).join('')}
            </div>
        </div>
        <div id="perf-form-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()"
                class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="perf-submit" class="btn btn-primary px-5"
                style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก</button>
        </div>
    </form>`;

    openModal('แก้ไข Safety Performance', html, 'max-w-4xl');

    const perfForm = document.getElementById('perf-form');
    perfForm?.querySelector('input[name="Year"]')?.insertAdjacentHTML('afterend', `
        <div class="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                    <p class="text-[11px] font-black uppercase text-emerald-700">Year</p>
                    <p class="mt-1 text-lg font-black text-slate-800">${p.Year || new Date().getFullYear()}</p>
                </div>
                <div>
                    <p class="text-[11px] font-black uppercase text-emerald-700">Annual man-hour</p>
                    <p class="mt-1 text-lg font-black text-slate-800">${Math.round(calculatedAnnual).toLocaleString()}</p>
                </div>
                <div>
                    <p class="text-[11px] font-black uppercase text-emerald-700">Accident-free days</p>
                    <p class="mt-1 text-lg font-black text-slate-800">${calculatedDays.toLocaleString()}</p>
                </div>
                <div>
                    <p class="text-[11px] font-black uppercase text-emerald-700">Last counted case</p>
                    <p class="mt-1 text-lg font-black text-slate-800">${lastDateVal || '&mdash;'}</p>
                </div>
            </div>
            <p class="mt-2 text-xs text-emerald-700/80">ระบบคำนวณ Annual man-hour จากรายเดือน และคำนวณวันปลอดอุบัติเหตุ/เคสล่าสุดจาก Accident Report ของปีนี้อัตโนมัติ</p>
        </div>
    `);
    perfForm?.querySelector('[name="LastAccidentDate"]')?.closest('.grid')?.classList.add('hidden');
    perfForm?.querySelector('[name="TotalHours"]')?.closest('.grid')?.classList.add('hidden');
    perfForm?.querySelector('[name="AnnualManHours"]')?.closest('.grid')?.classList.add('hidden');

    if (typeof flatpickr !== 'undefined') {
        flatpickr('#perf-last-date', { locale: 'th', dateFormat: 'Y-m-d', mobileNative: true });
    }

    document.getElementById('perf-form')?.addEventListener('submit', guardSubmitHandler(async e => {
        e.preventDefault();
        const btn = document.getElementById('perf-submit');
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>บันทึก...';
        try {
            const fd   = new FormData(e.target);
            const body = Object.fromEntries(fd.entries());
            const perfYear = Number(body.Year);
            if (!Number.isInteger(perfYear) || perfYear < 2000 || perfYear > new Date().getFullYear() + 5) {
                throw new Error('ปีที่เลือกไม่ถูกต้อง');
            }
            if (!_isDateString(body.LastAccidentDate)) throw new Error('วันที่เกิดอุบัติเหตุล่าสุดไม่ถูกต้อง');
            ['TotalHours', 'TotalDays', 'TargetHours', 'TargetDays', 'AnnualManHours', 'CumulativeManHours'].forEach(key => {
                const value = Number(body[key] || 0);
                if (!Number.isFinite(value) || value < 0) throw new Error('ตัวเลขต้องไม่ติดลบ');
            });
            const monthlyManHours = {};
            for (let i = 1; i <= 12; i++) {
                const key = `mh_${i}`;
                const value = Number(body[key] || 0);
                if (!Number.isFinite(value) || value < 0) throw new Error('ชั่วโมงรายเดือนต้องไม่ติดลบ');
                if (value > 0) monthlyManHours[String(i)] = value;
                delete body[key];
            }
            body.MonthlyManHours = JSON.stringify(monthlyManHours);
            // Preserve existing monthly status (not edited here — use month grid)
            body.MonthlyStatus = (() => {
                try {
                    const ms = _perfData?.MonthlyStatus;
                    return typeof ms === 'string' ? ms : JSON.stringify(ms || {});
                } catch { return '{}'; }
            })();
            await API.put('/accident/performance', body);
            closeModal();
            showToast('บันทึกข้อมูลสำเร็จ', 'success');
            _perfData = null;
            _summary  = null;
            _loadHeroStats();
            _refreshPerformanceBoard();
        } catch (err) {
            const el = document.getElementById('perf-form-err');
            if (el) { el.textContent = _friendlyErr(err, 'ไม่สามารถบันทึกข้อมูล Safety Performance ได้'); el.classList.remove('hidden'); }
            btn.disabled = false;
            btn.textContent = 'บันทึก';
        }
    }));
};

window._accToggleMonth = async month => {
    if (!_perfData) return;
    if (_accActionLocks.has(`month:${month}`)) return;
    _accActionLocks.add(`month:${month}`);
    let ms = {};
    try {
        ms = typeof _perfData.MonthlyStatus === 'string'
            ? JSON.parse(_perfData.MonthlyStatus)
            : (_perfData.MonthlyStatus || {});
    } catch { ms = {}; }

    const mo = String(month);
    // Cycle: pending → green → red → pending
    if (!ms[mo] || ms[mo] === 'pending') ms[mo] = 'green';
    else if (ms[mo] === 'green')          ms[mo] = 'red';
    else                                  delete ms[mo];

    _perfData.MonthlyStatus = ms;

    try {
        await API.put('/accident/performance', {
            Year:            _perfData.Year,
            TotalHours:      _perfData.TotalHours,
            TotalDays:       _perfData.TotalDays,
            LastAccidentDate: _perfData.LastAccidentDate,
            TargetHours:     _perfData.TargetHours,
            TargetDays:      _perfData.TargetDays,
            MonthlyStatus:   JSON.stringify(ms),
            MonthlyManHours:  typeof _perfData.MonthlyManHours === 'string'
                ? _perfData.MonthlyManHours
                : JSON.stringify(_perfData.rates?.monthlyManHours || _perfData.MonthlyManHours || {}),
            AnnualManHours:   _perfData.rates?.annualManHours || _perfData.AnnualManHours || 0,
            CumulativeManHours: _perfData.rates?.cumulativeManHours || _perfData.CumulativeManHours || 0,
        });
        _refreshPerformanceBoard();
    } catch {
        showToast('บันทึกสถานะไม่สำเร็จ', 'error');
        // Revert optimistic update
        _perfData = null;
        _refreshPerformanceBoard();
    } finally {
        _accActionLocks.delete(`month:${month}`);
    }
};

function _accEmployeeButton(e, picker) {
    const employeeId = _htmlEsc(e.EmployeeID);
    const employeeName = _htmlEsc(e.EmployeeName);
    const department = _htmlEsc(e.Department || '');
    const team = _htmlEsc(e.Team || '');
    const position = _htmlEsc(e.Position || '');
    return `
        <button type="button" onclick="window._accSelectPersonPicker('${picker}','${_esc(e.EmployeeID)}','${_esc(e.EmployeeName)}','${_esc(e.Department||'')}','${_esc(e.Position||'')}')"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-emerald-50 transition-colors">
            <div class="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <span class="text-xs font-bold text-emerald-700">${_htmlEsc((e.EmployeeName||'?').charAt(0))}</span>
            </div>
            <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-slate-800">${employeeId} · ${employeeName}</p>
                <p class="truncate text-xs text-slate-400">${department} ${team ? '· '+team : ''}${position ? ' · '+position : ''}</p>
            </div>
        </button>`;
}

function _accSyncNearMissPeople() {
    const hidden = document.getElementById('acc-nearmiss-people-value');
    const list = document.getElementById('acc-nearmiss-people-list');
    if (hidden) hidden.value = JSON.stringify(_accNearMissPeople);
    if (list) {
        list.innerHTML = _accNearMissPeople.length
            ? _accNearMissPeople.map((p, i) => _personCard(p, i)).join('')
            : `<div class="rounded-xl border border-dashed border-amber-200 bg-white/70 px-3 py-2 text-xs text-slate-400">ยังไม่ได้เลือกผู้เกี่ยวข้อง / No involved person selected</div>`;
    }
}

window._accSearchPersonPicker = (picker, val) => {
    clearTimeout(_accPersonTimer);
    const requestId = ++_personSearchRequest;
    const dd = document.getElementById(`acc-${picker}-person-dropdown`);
    if (!dd) return;
    if (!val || val.length < 1) { dd.classList.add('hidden'); return; }
    const query = String(val);
    _accPersonTimer = setTimeout(async () => {
        try {
            const res = await API.get(`/accident/employees?q=${encodeURIComponent(query)}`);
            if (requestId !== _personSearchRequest) return;
            const emps = res.data || [];
            dd.innerHTML = emps.length === 0
                ? `<div class="px-4 py-3 text-sm text-slate-400">ไม่พบพนักงาน / No employee found</div>`
                : emps.map(e => _accEmployeeButton(e, picker)).join('');
            dd.classList.remove('hidden');
        } catch {
            if (requestId === _personSearchRequest) dd.classList.add('hidden');
        }
    }, 250);
};

window._accSelectPersonPicker = (picker, id, name, dept, pos) => {
    if (picker === 'nearmiss') {
        if (!_accNearMissPeople.some(p => p.EmployeeID === id)) {
            _accNearMissPeople.push({ EmployeeID: id, EmployeeName: name, Department: dept, Position: pos });
            _accSyncNearMissPeople();
        }
        const input = document.getElementById('acc-nearmiss-person-search');
        const dd = document.getElementById('acc-nearmiss-person-dropdown');
        if (input) input.value = '';
        if (dd) dd.classList.add('hidden');
        return;
    }
    if (picker === 'responsible') {
        const display = document.getElementById('acc-responsible-search');
        const hidden = document.querySelector('#acc-form [name="ResponsiblePerson"]');
        const dd = document.getElementById('acc-responsible-person-dropdown');
        const label = `${id} · ${name}${pos ? ' · ' + pos : ''}`;
        if (display) display.value = label;
        if (hidden) hidden.value = label;
        if (dd) dd.classList.add('hidden');
        return;
    }
    if (picker === 'verified') {
        const display = document.getElementById('acc-verified-search');
        const hidden = document.querySelector('#acc-form [name="VerifiedBy"]');
        const dd = document.getElementById('acc-verified-person-dropdown');
        const label = `${id} · ${name}${pos ? ' · ' + pos : ''}`;
        if (display) display.value = label;
        if (hidden) hidden.value = label;
        if (dd) dd.classList.add('hidden');
    }
};

window._accRemoveNearMissPerson = idx => {
    _accNearMissPeople.splice(idx, 1);
    _accSyncNearMissPeople();
};

window._accSearchEmp = val => {
    clearTimeout(_accEmpTimer);
    const requestId = ++_employeeSearchRequest;
    const dd = document.getElementById('acc-emp-dropdown');
    if (!dd) return;
    if (!val || val.length < 1) { dd.classList.add('hidden'); return; }
    const query = String(val);
    _accEmpTimer = setTimeout(async () => {
        try {
            const res  = await API.get(`/accident/employees?q=${encodeURIComponent(query)}`);
            if (requestId !== _employeeSearchRequest) return;
            const emps = res.data || [];
            dd.innerHTML = emps.length === 0
                ? `<div class="px-4 py-3 text-sm text-slate-400">ไม่พบพนักงาน</div>`
                : emps.map(e => `
                    <button type="button" onclick="window._accSelectEmp('${_esc(e.EmployeeID)}','${_esc(e.EmployeeName)}','${_esc(e.Department||'')}','${_esc(e.Position||'')}')"
                        class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-red-50 transition-colors">
                        <div class="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                            <span class="text-xs font-bold text-red-600">${_htmlEsc((e.EmployeeName||'?').charAt(0))}</span>
                        </div>
                        <div>
                            <p class="text-sm font-semibold text-slate-800">${_htmlEsc(e.EmployeeID)} · ${_htmlEsc(e.EmployeeName)}</p>
                            <p class="text-xs text-slate-400">${_htmlEsc(e.Department||'')} ${e.Team ? '· '+_htmlEsc(e.Team) : ''}${e.Position ? ' · '+_htmlEsc(e.Position) : ''}</p>
                        </div>
                    </button>`).join('');
            dd.classList.remove('hidden');
        } catch {
            if (requestId === _employeeSearchRequest) dd.classList.add('hidden');
        }
    }, 250);
};

window._accSelectEmp = (id, name, dept, pos) => {
    const input    = document.getElementById('acc-emp-search');
    const info     = document.getElementById('acc-emp-info');
    const dd       = document.getElementById('acc-emp-dropdown');
    const posInput = document.querySelector('#acc-form [name="Position"]');
    if (input)    input.value = id;
    if (info)     { info.innerHTML = `<svg class="w-3.5 h-3.5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>${_esc(name)} · ${_esc(dept)}`; info.classList.remove('hidden'); }
    if (dd)       dd.classList.add('hidden');
    if (posInput && pos && !posInput.value) posInput.value = pos;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function _friendlyErr(err, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง') {
    const msg = err?.message || err?.data?.message || '';
    if (!msg) return fallback;
    if (/ER_|SQL|constraint|duplicate|foreign key|Data too long|Cannot/i.test(msg)) return fallback;
    return msg;
}

function _isDateString(value) {
    return !value || /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function _validateAccidentForm(form) {
    const fd = new FormData(form);
    const otherMessage = _accOtherValidationMessage(form);
    if (otherMessage) return otherMessage;
    _accApplyOtherFormValues(form, fd);
    const required = [
        ['ReportDate', 'กรุณาระบุวันที่รายงาน'],
        ['AccidentDate', 'กรุณาระบุวันที่เกิดเหตุ'],
        ['EmployeeID', 'กรุณาระบุรหัสพนักงาน'],
        ['AccidentType', 'กรุณาเลือกประเภทอุบัติเหตุ'],
    ];
    for (const [key, message] of required) {
        if (!String(fd.get(key) || '').trim()) return message;
    }
    if (!_isDateString(fd.get('ReportDate')) || !_isDateString(fd.get('AccidentDate')) || !_isDateString(fd.get('DueDate')) || !_isDateString(fd.get('VerifiedAt'))) {
        return 'รูปแบบวันที่ไม่ถูกต้อง';
    }
    const lostDays = Number(fd.get('LostDays') || 0);
    if (!Number.isFinite(lostDays) || lostDays < 0) return 'จำนวนวันหยุดงานต้องไม่ติดลบ';
    const type = String(fd.get('AccidentType') || '').trim();
    const isRecordable = ['1', 'on', 'true', 'yes'].includes(String(fd.get('IsRecordable') || '').trim().toLowerCase());
    const rootCause = String(fd.get('RootCause') || '').trim();
    const rootCauseDetail = String(fd.get('RootCauseDetail') || '').trim();
    const correctiveAction = String(fd.get('CorrectiveAction') || '').trim();
    const nearMissCAPA = String(fd.get('NearMissCAPA') || '').trim();
    const closeAction = type === 'Near Miss' ? (nearMissCAPA || correctiveAction) : correctiveAction;
    const needsRootCause = isRecordable || ['Medical Treatment', 'Lost Time', 'Fatal'].includes(type);
    if (type === 'Near Miss' && !String(fd.get('NearMissEvent') || '').trim()) return 'กรุณาระบุเหตุการณ์ Near Miss / Please describe the Near Miss event';
    if (type === 'Near Miss' && !String(fd.get('PotentialSeverity') || '').trim()) return 'กรุณาระบุระดับความรุนแรงที่อาจเกิดขึ้น / Please select potential severity';
    if (type === 'Lost Time' && lostDays < 1) return 'Lost Time ต้องระบุจำนวนวันหยุดงานมากกว่า 0';
    if (type === 'Medical Treatment' && !String(fd.get('MedicalTreatment') || '').trim()) return 'Medical Treatment ต้องระบุรายละเอียดการรักษา';
    if (type === 'Fatal' && !isRecordable) return 'Fatal ต้องกำหนดเป็น Recordable';
    if (needsRootCause && !rootCause && !rootCauseDetail) return 'กรุณาระบุสาเหตุหรือรายละเอียดสาเหตุ';
    if (needsRootCause && !closeAction) return 'กรุณาระบุมาตรการแก้ไข';
    if (String(fd.get('Status') || '').trim() === 'Closed' && !closeAction) return 'ปิดรายงานได้เมื่อมีมาตรการแก้ไข/CAPA แล้ว';
    if (String(fd.get('Status') || '').trim() === 'Closed' && !String(fd.get('VerificationResult') || '').trim()) return 'ปิดรายงานได้เมื่อมีผลการตรวจยืนยัน CAPA / CAPA verification result is required before closing';
    if (String(fd.get('Status') || '').trim() === 'Closed' && !String(fd.get('VerifiedBy') || '').trim()) return 'กรุณาระบุผู้ตรวจยืนยันก่อนปิดรายงาน / Verified by is required before closing';
    return '';
}

function _withActionLock(key, fn) {
    if (_accActionLocks.has(key)) return Promise.resolve();
    _accActionLocks.add(key);
    return Promise.resolve()
        .then(fn)
        .finally(() => _accActionLocks.delete(key));
}

function _spinnerHtml() {
    return `<div class="flex flex-col items-center justify-center h-64 text-slate-400">
        <div class="animate-spin rounded-full h-10 w-10 border-4 border-red-500 border-t-transparent mb-3"></div>
        <p class="text-sm">กำลังโหลดข้อมูล...</p>
    </div>`;
}

function _esc(str) {
    return String(str ?? '')
        .replace(/[\r\n\u2028\u2029]/g, ' ')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;');
}

installWindowActionLocks('accident', [
  '_accSaveHotspotPositions', '_accShowCountedReports', '_accDeleteMonthlyReport', '_accViewReport', '_accEditReport', '_accDeleteReport', '_accExportPDF', '_accExportDashboardPDF', '_accDeleteAttachment', '_accToggleMonth'
]);
