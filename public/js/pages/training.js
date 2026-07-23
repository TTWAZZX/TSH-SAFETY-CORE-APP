import { guardSubmitHandler, installWindowActionLocks } from '../utils/async-ui.js?v=20260715-phase32d-remaining-async-ux';
// public/js/pages/training.js
// Safety Training — department-based records (enterprise pattern)
import { API } from '../api.js';
import { openModal, closeModal, showToast, showConfirmationModal, showLoading, hideLoading } from '../ui.js?v=20260602-mobile-nav-m53';
import { buildActivityCard } from '../utils/activity-widget.js?v=20260602-activity-targets-at10';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _isAdmin        = false;
let _activeTab      = 'dashboard';
let _statsYear      = new Date().getFullYear();
let _deptRecords    = [];   // raw Training_Dept_Records rows
let _allDepts       = [];   // from master/departments
let _recYear        = new Date().getFullYear();
let _listenersReady = false;
let _chartBar       = null;
let _chartStatus    = null;
let _chartRisk      = null;
let _auditYear      = new Date().getFullYear();
let _auditRowsCache = [];
let _auditRequirements = [];
let _auditMappingEnabled = false;
let _trCardSaveHold = null;
let _trCardSaveMenu = null;
let _trTooltip = null;
const _loadGeneration = new Map();

function _beginLoad(key) {
    const next = (_loadGeneration.get(key) || 0) + 1;
    _loadGeneration.set(key, next);
    return next;
}

function _isCurrentLoad(key, generation) {
    return _loadGeneration.get(key) === generation;
}

const AUDIT_REQUIREMENTS = [
    {
        no: '7.1',
        course: 'หลักสูตร Six hazard 20 view point for safety Management patrol',
        target: 'ทีม Safety patrol',
        targetPct: 100,
        courseKeys: ['six hazard', '20 view', 'management patrol'],
        targetKeys: ['safety patrol', 'patrol'],
    },
    {
        no: '7.2',
        course: 'หลักสูตร Safety dojo',
        target: 'ทีม Safety patrol',
        targetPct: 100,
        courseKeys: ['safety dojo', 'dojo'],
        targetKeys: ['safety patrol', 'patrol'],
    },
    {
        no: '7.3',
        course: 'หลักสูตร CCCF',
        detail: '(Safety Awareness, Safety Theory, Stop 5s Hazard & Rank Identify, CCCF Complete Check)',
        target: 'T7',
        targetPct: 100,
        courseKeys: ['cccf', 'complete check', 'stop 5s', 'hazard'],
        targetKeys: ['t7'],
    },
    {
        no: '7.3',
        course: 'หลักสูตร CCCF',
        detail: '(Safety Awareness, Safety Theory, Stop 5s Hazard & Rank Identify, CCCF Complete Check)',
        target: 'Subcontract',
        targetPct: 100,
        courseKeys: ['cccf', 'complete check', 'stop 5s', 'hazard'],
        targetKeys: ['subcontract', 'contractor', 'supplier'],
    },
    {
        no: '7.4',
        course: 'หลักสูตรการประเมินความเสี่ยงด้านความปลอดภัยในการทำงาน',
        target: 'G, M, Leader ฝ่ายโรงงาน',
        targetPct: 100,
        courseKeys: ['ประเมินความเสี่ยง', 'risk assessment', 'risk'],
        targetKeys: ['g, m', 'g/m', 'g m', 'leader', 'ฝ่ายโรงงาน', 'factory'],
    },
    {
        no: '7.5',
        course: 'หลักสูตรการสร้างพฤติกรรมความปลอดภัย (Behavior Based Safety ; BBS)',
        target: 'G, M, Leader ฝ่ายโรงงาน',
        targetPct: 100,
        courseKeys: ['behavior based safety', 'bbs', 'พฤติกรรมความปลอดภัย'],
        targetKeys: ['g, m', 'g/m', 'g m', 'leader', 'ฝ่ายโรงงาน', 'factory'],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadTrainingPage() {
    const container = document.getElementById('training-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _isAdmin = String(user.role || user.Role || '').toLowerCase() === 'admin';

    window.closeModal = closeModal;

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    _activeTab = window._getTab?.('training', _activeTab) || _activeTab;
    switchTab(_activeTab);
    _loadHeroStats();
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB CONFIG
// ─────────────────────────────────────────────────────────────────────────────
function _getTabs() {
    return [
        { id: 'dashboard', label: 'ภาพรวม',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
        { id: 'records', label: 'บันทึกการอบรม',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` },
        { id: 'audit', label: 'Audit',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
        ...(_isAdmin ? [{
            id: 'courses', label: 'หลักสูตร',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>`
        }] : []),
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);

    const tabHtml = _getTabs().map(t => `
        <button id="tr-tab-btn-${t.id}" data-tab="${t.id}"
            class="tr-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" data-tr-card-image="training-hero" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="tr-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#tr-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                                </svg>
                                Safety Training
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">บันทึกและติดตามผลการอบรม</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Training Status รายแผนก · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-shrink-0 w-full md:w-auto">
                        <!-- Stats strip -->
                        <div id="tr-stats-strip" class="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full sm:w-auto">
                            ${['—','—','—','—'].map((v, i) => {
                                const labels = ['แผนกทั้งหมด','พนักงานเข้าอบรม','ผ่านการอบรม','Pass Rate'];
                                return `<div class="rounded-xl px-4 py-3 text-center" data-tr-card-image="training-stat-${i + 1}" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
                                    <p class="text-2xl font-bold text-white tr-stat-val" data-idx="${i}">${v}</p>
                                    <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${labels[i]}</p>
                                </div>`;
                            }).join('')}
                        </div>
                        <!-- Actions -->
                        <div class="flex items-center gap-2 flex-shrink-0" data-tr-card-ignore>
                            <select id="tr-year-sel" class="rounded-xl px-3 py-2 text-xs font-semibold text-white border border-white/30 bg-white/15 outline-none">
                                ${years.map(y => `<option value="${y}" ${y===_statsYear?'selected':''} class="text-slate-800 bg-white">${y}</option>`).join('')}
                            </select>
                            ${_isAdmin ? `
                            <button id="tr-btn-add-record" class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white border border-white/30 bg-white/15 hover:bg-white/25 transition-all whitespace-nowrap">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                บันทึกอบรม
                            </button>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Tab bar -->
                <div class="flex overflow-x-auto gap-0 -mb-px scrollbar-none">
                    ${tabHtml}
                </div>
            </div>
        </div>

        <!-- ═══ TAB PANELS ═══ -->
        <div id="tr-panel-dashboard" class="hidden"></div>
        <div id="tr-panel-records"   class="hidden"></div>
        <div id="tr-panel-audit"     class="hidden"></div>
        <div id="tr-panel-courses"   class="hidden"></div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS (once, document-level delegation)
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', e => {
        const tabBtn = e.target.closest('.tr-tab');
        if (tabBtn?.dataset?.tab) { switchTab(tabBtn.dataset.tab); return; }

        if (e.target.closest('#tr-btn-add-record')) { openDeptRecordForm(null); return; }
        if (e.target.closest('[data-tr-card-save-action]')) {
            const card = _trCardSaveMenu?.card;
            _trHideCardImageMenu();
            if (card) _trDownloadCardImage(card);
            return;
        }
        if (!e.target.closest('#tr-card-save-menu')) _trHideCardImageMenu();
    });

    document.addEventListener('change', e => {
        if (e.target?.id === 'tr-year-sel') {
            _statsYear = parseInt(e.target.value) || new Date().getFullYear();
            _loadHeroStats();
            if (_activeTab === 'dashboard') _renderDashboardPanel();
        }
    });

    document.addEventListener('contextmenu', _trShowCardContextMenu);
    document.addEventListener('pointerdown', _trStartCardImageHold);
    document.addEventListener('pointermove', _trMoveCardImageHold);
    document.addEventListener('pointerup', _trCancelCardImageHold);
    document.addEventListener('pointercancel', _trCancelCardImageHold);
    document.addEventListener('mouseover', _trShowTooltip);
    document.addEventListener('mousemove', _trMoveTooltip);
    document.addEventListener('mouseout', _trHideTooltip);
    document.addEventListener('focusin', _trShowTooltip);
    document.addEventListener('focusout', _trHideTooltip);
}

function _trShowCardContextMenu(event) {
    const card = event.target?.closest?.('[data-tr-card-image]');
    if (!card || !document.getElementById('training-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"]')) return;
    event.preventDefault();
    _trShowCardImageMenu(card, event.clientX, event.clientY);
}

function _trStartCardImageHold(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const card = event.target?.closest?.('[data-tr-card-image]');
    if (!card || !document.getElementById('training-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"]')) return;
    _trCancelCardImageHold();
    _trCardSaveHold = {
        card,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        fired: false,
        timer: setTimeout(() => {
            if (!_trCardSaveHold || _trCardSaveHold.card !== card) return;
            _trCardSaveHold.fired = true;
            _trShowCardImageMenu(card, _trCardSaveHold.x, _trCardSaveHold.y);
        }, 800),
    };
}

function _trMoveCardImageHold(event) {
    if (!_trCardSaveHold || event.pointerId !== _trCardSaveHold.pointerId) return;
    if (Math.abs(event.clientX - _trCardSaveHold.x) > 10 || Math.abs(event.clientY - _trCardSaveHold.y) > 10) {
        _trCancelCardImageHold();
    }
}

function _trCancelCardImageHold() {
    if (_trCardSaveHold?.timer) clearTimeout(_trCardSaveHold.timer);
    _trCardSaveHold = null;
}

function _trShowCardImageMenu(card, clientX, clientY) {
    _trHideCardImageMenu();
    const menu = document.createElement('div');
    menu.id = 'tr-card-save-menu';
    menu.className = 'fixed z-[9999] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl';
    menu.style.minWidth = '170px';
    menu.innerHTML = `
        <button type="button" data-tr-card-save-action
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
    _trCardSaveMenu = { card, menu };
}

function _trHideCardImageMenu() {
    _trCardSaveMenu?.menu?.remove?.();
    _trCardSaveMenu = null;
}

async function _trDownloadCardImage(card) {
    if (typeof html2canvas === 'undefined') {
        showToast('ไม่พบ library สำหรับบันทึกรูปภาพ', 'error');
        return;
    }
    const name = _trSafeFilePart(card.dataset.trCardImage || 'training-card');
    const year = card.closest('#tr-panel-audit')
        ? _auditYear
        : card.closest('#tr-panel-records')
            ? (_recYear || new Date().getFullYear())
            : _statsYear;
    try {
        showLoading('Saving card image...');
        const canvas = await html2canvas(card, {
            backgroundColor: '#ffffff',
            scale: Math.min(2, window.devicePixelRatio || 1.5),
            useCORS: true,
            onclone: doc => {
                doc.querySelectorAll('[data-tr-card-ignore]').forEach(el => { el.style.display = 'none'; });
            },
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${name}-${year || new Date().getFullYear()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('บันทึกรูปภาพการ์ดแล้ว', 'success');
    } catch (err) {
        showToast(_errText(err, 'บันทึกรูปภาพการ์ดไม่สำเร็จ'), 'error');
    } finally {
        hideLoading();
    }
}

function _trSafeFilePart(value) {
    return String(value || 'training-card')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'training-card';
}

function _trShowTooltip(event) {
    const target = event.target?.closest?.('[data-tr-tooltip]');
    if (!target || !document.getElementById('training-page')?.contains(target)) return;
    const text = target.dataset.trTooltip || '';
    if (!text.trim()) return;

    if (!_trTooltip) {
        _trTooltip = document.createElement('div');
        _trTooltip.id = 'tr-hover-tooltip';
        _trTooltip.className = 'fixed z-[10000] max-w-[320px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold leading-snug text-slate-700 shadow-xl pointer-events-none';
        document.body.appendChild(_trTooltip);
    }
    _trTooltip.textContent = text;
    _trTooltip.style.display = 'block';

    if (event.type === 'focusin') {
        const rect = target.getBoundingClientRect();
        _trPositionTooltip(rect.left + rect.width / 2, rect.bottom + 8);
    } else {
        _trPositionTooltip(event.clientX + 12, event.clientY + 14);
    }
}

function _trMoveTooltip(event) {
    if (!_trTooltip || _trTooltip.style.display === 'none') return;
    if (!event.target?.closest?.('[data-tr-tooltip]')) return;
    _trPositionTooltip(event.clientX + 12, event.clientY + 14);
}

function _trHideTooltip(event) {
    if (!_trTooltip) return;
    if (event.type === 'mouseout') {
        const target = event.target?.closest?.('[data-tr-tooltip]');
        if (target && event.relatedTarget && target.contains(event.relatedTarget)) return;
    }
    _trTooltip.style.display = 'none';
}

function _trPositionTooltip(x, y) {
    if (!_trTooltip) return;
    const rect = _trTooltip.getBoundingClientRect();
    const left = Math.min(Math.max(8, x), window.innerWidth - rect.width - 8);
    const top = Math.min(Math.max(8, y), window.innerHeight - rect.height - 8);
    _trTooltip.style.left = `${left}px`;
    _trTooltip.style.top = `${top}px`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SWITCH TAB
// ─────────────────────────────────────────────────────────────────────────────
function switchTab(tab) {
    _activeTab = tab;
    window._saveTab?.('training', tab);

    _getTabs().forEach(t => {
        const btn = document.getElementById(`tr-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === tab
            ? 'tr-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white'
            : 'tr-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';
    });

    ['dashboard','records','audit','courses'].forEach(id => {
        document.getElementById(`tr-panel-${id}`)?.classList.add('hidden');
    });
    document.getElementById(`tr-panel-${tab}`)?.classList.remove('hidden');

    if (tab === 'dashboard') _renderDashboardPanel();
    if (tab === 'records')   _renderRecordsPanel();
    if (tab === 'audit')     _renderAuditPanel();
    if (tab === 'courses')   _renderCoursesPanel();
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO STATS (async fill)
// ─────────────────────────────────────────────────────────────────────────────
async function _loadHeroStats() {
    const generation = _beginLoad('hero');
    try {
        const res = await API.get(`/training/dept-summary?year=${_statsYear}`);
        if (!_isCurrentLoad('hero', generation)) return;
        const o   = res?.data?.overall || {};
        const vals = [
            o.deptCount   ?? 0,
            o.totalEmp    ?? 0,
            o.totalPassed ?? 0,
            (o.passRate   ?? 0) + '%',
        ];
        document.querySelectorAll('.tr-stat-val').forEach(el => {
            const i = parseInt(el.dataset.idx);
            if (vals[i] !== undefined) el.textContent = vals[i];
        });
    } catch { /* silent */ }

    // Append personal activity target card (only once per page load)
    const strip = document.getElementById('tr-stats-strip');
    if (strip && !strip.querySelector('.at-card')) {
        const atCard = await buildActivityCard('training');
        if (!_isCurrentLoad('hero', generation)) return;
        if (atCard) {
            // Wrap with marker class so we don't append twice on year-change
            strip.insertAdjacentHTML('beforeend',
                atCard.replace('<div class="rounded-xl', '<div data-tr-card-image="training-activity-target-card" class="at-card rounded-xl'));
            strip.className = 'grid grid-cols-3 sm:grid-cols-5 gap-3 w-full sm:w-auto';
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA FETCHERS
// ─────────────────────────────────────────────────────────────────────────────
async function _fetchDepts() {
    try {
        const res = await API.get('/master/departments');
        const raw = res?.data ?? res;
        _allDepts = (Array.isArray(raw) ? raw : [])
            .map(d => d.Name || d.name || '')
            .filter(Boolean);
    } catch { _allDepts = []; }
}

async function _fetchDeptRecords(year, loadKey = null, generation = null) {
    try {
        const q = year ? `?year=${year}` : '';
        const res = await API.get(`/training/dept-records${q}`);
        if (loadKey && !_isCurrentLoad(loadKey, generation)) return _deptRecords;
        _deptRecords = res.data || [];
    } catch { _deptRecords = []; }
}

let _coursesCache = [];   // module-level cache so form doesn't refetch every open

async function _fetchCourses() {
    try {
        const res  = await API.get('/training/courses');
        _coursesCache = res.data || [];
        return _coursesCache;
    } catch { _coursesCache = []; return []; }
}

async function _fetchAuditRequirements(year, loadKey = null, generation = null) {
    try {
        const res = await API.get(`/training/audit-requirements?year=${year || _auditYear}`);
        if (loadKey && !_isCurrentLoad(loadKey, generation)) return _auditRequirements;
        const rows = res.data || [];
        _auditRequirements = rows.length ? rows : AUDIT_REQUIREMENTS.map((r, idx) => ({
            ...r,
            SortOrder: idx + 1,
            Year: year || _auditYear,
        }));
    } catch {
        _auditRequirements = AUDIT_REQUIREMENTS.map((r, idx) => ({
            ...r,
            SortOrder: idx + 1,
            Year: year || _auditYear,
        }));
    }
    return _auditRequirements;
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD PANEL
// ─────────────────────────────────────────────────────────────────────────────
async function _renderDashboardPanel() {
    const generation = _beginLoad('dashboard');
    const panel = document.getElementById('tr-panel-dashboard');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    let summary = null;
    let courses  = [];
    let courseCatalog = [];
    let allRecs  = [];
    try {
        const [sumRes, courseRes, recRes, catalogRes] = await Promise.all([
            API.get(`/training/dept-summary?year=${_statsYear}`),
            API.get(`/training/course-summary?year=${_statsYear}`),
            API.get(`/training/dept-records?year=${_statsYear}`),
            API.get('/training/courses'),
        ]);
        if (!_isCurrentLoad('dashboard', generation)) return;
        summary       = sumRes.data       || null;
        courses       = courseRes.data    || [];
        allRecs       = recRes.data       || [];
        courseCatalog = catalogRes.data   || [];
    } catch { /* silent */ }

    if (_chartStatus) { _chartStatus.destroy(); _chartStatus = null; }
    if (_chartRisk) { _chartRisk.destroy(); _chartRisk = null; }
    if (_chartBar) { _chartBar.destroy(); _chartBar = null; }

    const o        = summary?.overall || {};
    const byDept   = summary?.byDept  || [];
    const deptCnt  = parseInt(o.deptCount)   || 0;
    const totalEmp = parseInt(o.totalEmp)    || 0;
    const passed   = parseInt(o.totalPassed) || 0;
    const failed   = totalEmp - passed;
    const passRate = parseInt(o.passRate)    || 0;
    const lowDeptCount = byDept.filter(d => {
        const total = parseInt(d.TotalEmp) || 0;
        const deptPassed = parseInt(d.PassedCount) || 0;
        return total > 0 && Math.round(deptPassed * 100 / total) < 80;
    }).length;
    const noDataCount = allRecs.filter(r => !(parseInt(r.TotalEmp) > 0)).length;
    const activeCourseCount = courseCatalog.filter(c => c.IsActive).length || courseCatalog.length;
    const usedCourseCount = new Set(allRecs.map(r => r.CourseID || '__null__')).size;
    const followUpRows = byDept
        .map(d => {
            const total = parseInt(d.TotalEmp) || 0;
            const deptPassed = parseInt(d.PassedCount) || 0;
            return { dept: d.Department, pct: total ? Math.round(deptPassed * 100 / total) : null };
        })
        .filter(d => d.pct !== null)
        .sort((a, b) => a.pct - b.pct);
    const topFollowUp = followUpRows[0] || null;
    const recordStatus = allRecs.reduce((acc, r) => {
        const total = parseInt(r.TotalEmp) || 0;
        const recPassed = parseInt(r.PassedCount) || 0;
        if (total <= 0) acc.noData += 1;
        else {
            const pct = Math.round(recPassed * 100 / total);
            if (pct >= 80) acc.ready += 1;
            else if (pct >= 60) acc.watch += 1;
            else acc.gap += 1;
        }
        return acc;
    }, { ready: 0, watch: 0, gap: 0, noData: 0 });
    const riskRows = followUpRows.slice(0, 5);
    const bestRows = followUpRows.slice().reverse().slice(0, 5);

    const showMatrix = courses.length >= 2;

    panel.innerHTML = `
    <div class="space-y-6">

        <!-- Action Insights -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white rounded-xl p-5 border ${lowDeptCount ? 'border-red-100' : 'border-emerald-100'} shadow-sm" data-tr-card-image="training-low-compliance-card">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${lowDeptCount ? 'bg-red-50' : 'bg-emerald-50'}">
                        <svg class="w-4 h-4 ${lowDeptCount ? 'text-red-500' : 'text-emerald-600'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                        </svg>
                    </div>
                    <p class="text-xs ${lowDeptCount ? 'text-red-600' : 'text-emerald-700'} font-bold">ต่ำกว่าเกณฑ์</p>
                </div>
                <p class="text-3xl font-bold ${lowDeptCount ? 'text-red-600' : 'text-emerald-700'}">${lowDeptCount}</p>
                <p class="text-xs text-slate-400 mt-1">แผนกต่ำกว่า 80%</p>
            </div>

            <div class="bg-white rounded-xl p-5 border ${noDataCount ? 'border-amber-100' : 'border-slate-100'} shadow-sm" data-tr-card-image="training-no-data-card">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${noDataCount ? 'bg-amber-50' : 'bg-slate-50'}">
                        <svg class="w-4 h-4 ${noDataCount ? 'text-amber-600' : 'text-slate-500'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2a4 4 0 014-4h4m0 0l-3-3m3 3l-3 3M7 7h.01M7 11h.01M7 15h.01"/>
                        </svg>
                    </div>
                    <p class="text-xs ${noDataCount ? 'text-amber-700' : 'text-slate-500'} font-bold">ยังไม่มีข้อมูล</p>
                </div>
                <p class="text-3xl font-bold ${noDataCount ? 'text-amber-700' : 'text-slate-700'}">${noDataCount}</p>
                <p class="text-xs text-slate-400 mt-1">รายการที่ Total = 0</p>
            </div>

            <div class="bg-white rounded-xl p-5 border border-sky-100 shadow-sm" data-tr-card-image="training-course-coverage-card">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-sky-50">
                        <svg class="w-4 h-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                        </svg>
                    </div>
                    <p class="text-xs text-sky-700 font-bold">Course Coverage</p>
                </div>
                <p class="text-3xl font-bold text-sky-700">${usedCourseCount}/${activeCourseCount || 0}</p>
                <p class="text-xs text-slate-400 mt-1">หลักสูตรที่มีบันทึก / Active</p>
            </div>

            <div class="bg-white rounded-xl p-5 border ${topFollowUp && topFollowUp.pct < 80 ? 'border-red-100' : 'border-emerald-100'} shadow-sm" data-tr-card-image="training-follow-up-card">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${topFollowUp && topFollowUp.pct < 80 ? 'bg-red-50' : 'bg-emerald-50'}">
                        <svg class="w-4 h-4 ${topFollowUp && topFollowUp.pct < 80 ? 'text-red-500' : 'text-emerald-600'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </div>
                    <p class="text-xs ${topFollowUp && topFollowUp.pct < 80 ? 'text-red-600' : 'text-emerald-700'} font-bold">ติดตามก่อน</p>
                </div>
                <p class="text-2xl font-bold ${topFollowUp && topFollowUp.pct < 80 ? 'text-red-600' : 'text-emerald-700'}">${topFollowUp ? topFollowUp.pct + '%' : '-'}</p>
                <p class="text-xs text-slate-400 mt-1 truncate" title="${_esc(topFollowUp?.dept || '')}">${topFollowUp?.dept || 'ยังไม่มีข้อมูลให้ติดตาม'}</p>
            </div>
        </div>

        <!-- Overview Charts -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div class="ds-section overflow-hidden xl:col-span-1" data-tr-card-image="training-status-donut">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
                <div class="p-5">
                    <div class="flex items-center justify-between gap-3 mb-4">
                        <div class="flex items-center gap-2 min-w-0">
                            <svg class="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9 9 0 1020.945 13H11V3.055z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/>
                            </svg>
                            <h3 class="text-sm font-bold text-slate-700">สถานะการอบรม</h3>
                        </div>
                        <span class="text-[11px] font-bold text-slate-400">${allRecs.length} รายการ</span>
                    </div>
                    ${allRecs.length === 0
                        ? `<div class="text-center py-12 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูล</p></div>`
                        : `<div class="h-[220px]"><canvas id="tr-chart-status"></canvas></div>
                           <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                               <div class="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
                                   <div class="font-extrabold">พร้อม / ผ่านเกณฑ์ ${recordStatus.ready}</div>
                                   <div class="mt-0.5 text-emerald-600">ผลอบรมตั้งแต่ 80% ขึ้นไป</div>
                               </div>
                               <div class="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                                   <div class="font-extrabold">เฝ้าระวัง ${recordStatus.watch}</div>
                                   <div class="mt-0.5 text-amber-600">ผลอบรม 60-79% ควรติดตามเพิ่ม</div>
                               </div>
                               <div class="rounded-lg bg-red-50 px-3 py-2 text-red-600">
                                   <div class="font-extrabold">ต่ำกว่าเกณฑ์ ${recordStatus.gap}</div>
                                   <div class="mt-0.5 text-red-500">ผลอบรมต่ำกว่า 60% ต้องเร่งแก้ไข</div>
                               </div>
                               <div class="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">
                                   <div class="font-extrabold">ยังไม่มีข้อมูล ${recordStatus.noData}</div>
                                   <div class="mt-0.5 text-slate-400">ยังไม่ได้กรอกจำนวนพนักงาน</div>
                               </div>
                           </div>`}
                </div>
            </div>

            <div class="ds-section overflow-hidden xl:col-span-2" data-tr-card-image="training-risk-departments-chart">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#ef4444,#d97706,#059669)"></div>
                <div class="p-5">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                        <div class="flex items-center gap-2 min-w-0">
                            <svg class="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"/>
                            </svg>
                            <h3 class="text-sm font-bold text-slate-700">Top 5 Follow-up Departments</h3>
                        </div>
                        <span class="text-[11px] font-bold text-slate-400">เรียงจาก compliance ต่ำสุด</span>
                    </div>
                    ${riskRows.length === 0
                        ? `<div class="text-center py-12 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูลสำหรับติดตาม</p></div>`
                        : `<div class="h-[260px]"><canvas id="tr-chart-risk"></canvas></div>
                           <div class="mt-3 flex flex-wrap gap-2 text-[11px]">
                               ${bestRows.map(row => `<span class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">${_html(row.dept)} ${row.pct}%</span>`).join('')}
                           </div>`}
                </div>
                <p class="text-2xl font-bold ${topFollowUp && topFollowUp.pct < 80 ? 'text-red-600' : 'text-emerald-700'}">${topFollowUp ? topFollowUp.pct + '%' : '-'}</p>
                <p class="text-xs text-slate-400 mt-1 truncate" title="${_esc(topFollowUp?.dept || '')}">${topFollowUp?.dept || 'ยังไม่มีข้อมูลให้ติดตาม'}</p>
            </div>
        </div>

        <!-- Department Compliance Chart -->
        <div class="ds-section overflow-hidden" data-tr-card-image="training-department-compliance-chart">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
            <div class="p-5">
                <div class="flex items-center gap-2 mb-4">
                    <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">Compliance รายแผนก (${_statsYear})</h3>
                </div>
                ${byDept.length === 0
                    ? `<div class="text-center py-12 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูล</p></div>`
                    : `<div style="height:${Math.max(200, byDept.length * 36)}px"><canvas id="tr-chart-dept"></canvas></div>`}
            </div>
        </div>

        <!-- Course Summary + Dept Summary (2-col) -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

            <!-- Course Summary -->
            <div class="ds-section overflow-hidden" data-tr-card-image="training-course-summary">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">สรุปรายหลักสูตร</h3>
                    </div>
                    ${_buildCourseSummaryTable(courses)}
                </div>
            </div>

            <!-- Dept Summary -->
            <div class="ds-section overflow-hidden" data-tr-card-image="training-department-summary">
                <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
                <div class="p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">สรุปรายแผนก</h3>
                    </div>
                    ${_buildDeptSummaryTable(byDept)}
                </div>
            </div>

        </div>

        ${showMatrix ? `
        <!-- Dept × Course Matrix -->
        <div class="ds-section overflow-hidden" data-tr-card-image="training-dept-course-matrix">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
            <div class="p-5">
                <div class="flex items-center gap-2 mb-4">
                    <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18M10 3v18M14 3v18"/>
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">Progress Matrix: แผนก × หลักสูตร</h3>
                </div>
                ${_buildDeptCourseHeatMatrix(allRecs, courses)}
            </div>
        </div>` : ''}

    </div>`;

    if (allRecs.length > 0) setTimeout(() => _initStatusChart(recordStatus), 0);
    if (riskRows.length > 0) setTimeout(() => _initRiskChart(riskRows), 0);
    if (byDept.length > 0) setTimeout(() => _initDeptChart(byDept), 0);
}

function _buildDeptSummaryTable(byDept) {
    if (!byDept.length) {
        return `<div class="text-center py-10 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูล</p></div>`;
    }

    const rows = byDept.map(d => {
        const total  = parseInt(d.TotalEmp)    || 0;
        const passed = parseInt(d.PassedCount) || 0;
        const hasData = total > 0;
        const pct    = hasData ? Math.round(passed * 100 / total) : null;
        const barClr = pct === null ? '#e2e8f0' : pct >= 80 ? '#059669' : pct >= 60 ? '#d97706' : '#ef4444';

        const complianceCell = hasData
            ? `<div class="flex items-center gap-2">
                   <div class="flex-1 bg-slate-100 rounded-full h-1.5">
                       <div class="h-1.5 rounded-full" style="width:${pct}%;background:${barClr}"></div>
                   </div>
                   <span class="text-xs font-semibold w-9 text-right ${pct>=80?'text-emerald-700':pct>=60?'text-amber-600':'text-red-500'}">${pct}%</span>
               </div>`
            : `<span class="text-xs text-slate-300">ยังไม่มีข้อมูล</span>`;

        return `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="py-2.5 pr-3 font-medium text-sm text-slate-800">${d.Department}</td>
            <td class="py-2.5 px-2 text-center text-sm text-slate-600">${hasData ? total.toLocaleString() : '—'}</td>
            <td class="py-2.5 px-2 text-center text-sm ${hasData ? 'text-emerald-600 font-semibold' : 'text-slate-300'}">${hasData ? passed.toLocaleString() : '—'}</td>
            <td class="py-2.5 pl-2 min-w-[140px]">${complianceCell}</td>
        </tr>`;
    }).join('');

    return `
    <div class="overflow-x-auto">
        <table class="ds-table text-left border-collapse text-sm">
            <thead>
                <tr class="border-b border-slate-100">
                    <th class="pb-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                    <th class="pb-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">พนักงาน</th>
                    <th class="pb-2 px-2 text-xs font-semibold text-emerald-600 uppercase tracking-wide text-center">ผ่าน</th>
                    <th class="pb-2 pl-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Compliance</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

function _buildCourseSummaryTable(courses) {
    if (!courses.length) {
        return `<div class="text-center py-10 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูล</p></div>`;
    }

    const rows = courses.map(c => {
        const total  = parseInt(c.totalEmp)    || 0;
        const passed = parseInt(c.passedCount) || 0;
        const pct    = total > 0 ? Math.round(passed * 100 / total) : null;
        const barClr = pct === null ? '#e2e8f0' : pct >= 80 ? '#059669' : pct >= 60 ? '#d97706' : '#ef4444';
        const pctLabel = pct === null ? '—' : pct + '%';
        const pctCls   = pct === null ? 'text-slate-300' : pct >= 80 ? 'text-emerald-700' : pct >= 60 ? 'text-amber-600' : 'text-red-500';

        const codeChip = c.CourseCode
            ? `<span class="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-500 mr-1">${_html(c.CourseCode)}</span>`
            : '';

        return `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="py-2.5 pr-3 text-sm text-slate-800">${codeChip}${_html(c.CourseName)}</td>
            <td class="py-2.5 px-2 text-center text-xs text-slate-500">${parseInt(c.deptCount) || 0}</td>
            <td class="py-2.5 px-2 text-center text-sm text-slate-600">${total.toLocaleString()}</td>
            <td class="py-2.5 px-2 text-center text-sm text-emerald-600 font-semibold">${passed.toLocaleString()}</td>
            <td class="py-2.5 pl-2 min-w-[120px]">
                <div class="flex items-center gap-2">
                    <div class="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div class="h-1.5 rounded-full" style="width:${pct??0}%;background:${barClr}"></div>
                    </div>
                    <span class="text-xs font-semibold w-8 text-right ${pctCls}">${pctLabel}</span>
                </div>
            </td>
        </tr>`;
    }).join('');

    return `
    <div class="overflow-x-auto">
        <table class="ds-table text-left border-collapse text-sm">
            <thead>
                <tr class="border-b border-slate-100">
                    <th class="pb-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">หลักสูตร</th>
                    <th class="pb-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">แผนก</th>
                    <th class="pb-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">พนักงาน</th>
                    <th class="pb-2 px-2 text-xs font-semibold text-emerald-600 uppercase tracking-wide text-center">ผ่าน</th>
                    <th class="pb-2 pl-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pass Rate</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

function _buildDeptCourseMatrix(records, courses) {
    if (!records.length || !courses.length) {
        return `<div class="text-center py-10 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูล</p></div>`;
    }

    // Unique depts (sorted) from records
    const depts = [...new Set(records.map(r => r.Department))].sort();

    // Build lookup: dept+courseId → { total, passed }
    const lookup = new Map();
    for (const r of records) {
        const key = `${r.Department}::${r.CourseID ?? '__null__'}`;
        const cur = lookup.get(key) || { total: 0, passed: 0 };
        cur.total  += parseInt(r.TotalEmp)    || 0;
        cur.passed += parseInt(r.PassedCount) || 0;
        lookup.set(key, cur);
    }

    // Dept overall (across all courses in records)
    const deptTotals = new Map();
    for (const r of records) {
        const cur = deptTotals.get(r.Department) || { total: 0, passed: 0 };
        cur.total  += parseInt(r.TotalEmp)    || 0;
        cur.passed += parseInt(r.PassedCount) || 0;
        deptTotals.set(r.Department, cur);
    }

    function pctBadge(total, passed) {
        if (!total) return `<span class="text-xs text-slate-300">—</span>`;
        const pct = Math.round(passed * 100 / total);
        const bg  = pct >= 80 ? 'bg-emerald-100 text-emerald-700' : pct >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600';
        return `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${bg}">${pct}%</span>`;
    }

    const headerCols = courses.map(c => {
        const name = c.CourseName.length > 18 ? c.CourseName.slice(0, 17) + '…' : c.CourseName;
        return `<th class="pb-2 px-2 text-xs font-semibold text-slate-500 text-center whitespace-nowrap" title="${_html(c.CourseName)}">${_html(name)}</th>`;
    }).join('');

    const bodyRows = depts.map(dept => {
        const ov = deptTotals.get(dept) || { total: 0, passed: 0 };
        const courseCells = courses.map(c => {
            const key  = `${dept}::${c.CourseID ?? '__null__'}`;
            const data = lookup.get(key);
            return `<td class="py-2 px-2 text-center">${data ? pctBadge(data.total, data.passed) : '<span class="text-xs text-slate-200">—</span>'}</td>`;
        }).join('');

        return `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="py-2 pr-3 text-sm font-medium text-slate-700 whitespace-nowrap">${_html(dept)}</td>
            ${courseCells}
            <td class="py-2 pl-3 text-center border-l border-slate-100">${pctBadge(ov.total, ov.passed)}</td>
        </tr>`;
    }).join('');

    return `
    <div class="overflow-x-auto">
        <table class="ds-table text-left border-collapse text-sm">
            <thead>
                <tr class="border-b border-slate-100">
                    <th class="pb-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                    ${headerCols}
                    <th class="pb-2 pl-3 text-xs font-semibold text-emerald-600 uppercase tracking-wide text-center border-l border-slate-100">รวม</th>
                </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
        </table>
    </div>`;
}

function _buildDeptCourseHeatMatrix(records, courses) {
    if (!records.length || !courses.length) {
        return `<div class="text-center py-10 text-slate-400"><p class="text-sm">ยังไม่มีข้อมูล</p></div>`;
    }

    const depts = [...new Set(records.map(r => String(r.Department || '').trim()).filter(Boolean))].sort();
    const lookup = new Map();
    const deptTotals = new Map();

    for (const r of records) {
        const deptName = String(r.Department || '').trim();
        if (!deptName) continue;
        const key = `${deptName}::${r.CourseID ?? '__null__'}`;
        const cur = lookup.get(key) || { total: 0, passed: 0 };
        cur.total += parseInt(r.TotalEmp) || 0;
        cur.passed += parseInt(r.PassedCount) || 0;
        lookup.set(key, cur);

        const dept = deptTotals.get(deptName) || { total: 0, passed: 0 };
        dept.total += parseInt(r.TotalEmp) || 0;
        dept.passed += parseInt(r.PassedCount) || 0;
        deptTotals.set(deptName, dept);
    }

    const heatBadge = (total, passed) => {
        if (!total) {
            return `<span class="inline-flex min-w-[58px] justify-center rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-300">-</span>`;
        }
        const pct = Math.round(passed * 100 / total);
        const style = pct >= 80
            ? 'background:#d1fae5;color:#047857;border-color:#a7f3d0'
            : pct >= 60
                ? 'background:#fef3c7;color:#b45309;border-color:#fde68a'
                : 'background:#fee2e2;color:#dc2626;border-color:#fecaca';
        return `<span class="inline-flex min-w-[58px] justify-center rounded-md border px-2 py-1 text-xs font-extrabold" style="${style}">${pct}%</span>`;
    };

    const headerCols = courses.map(c => {
        const fullName = String(c.CourseName || '');
        const name = fullName.length > 18 ? fullName.slice(0, 17) + '...' : fullName;
        return `<th class="pb-2 px-2 text-xs font-semibold text-slate-500 text-center whitespace-nowrap">
            <span tabindex="0" data-tr-tooltip="${_html(fullName)}"
                class="inline-flex max-w-[140px] cursor-help items-center justify-center rounded px-1.5 py-1 outline-none hover:bg-slate-100 focus:bg-slate-100 focus:ring-2 focus:ring-emerald-100">
                ${_html(name)}
            </span>
        </th>`;
    }).join('');

    const bodyRows = depts.map(dept => {
        const ov = deptTotals.get(dept) || { total: 0, passed: 0 };
        const courseCells = courses.map(c => {
            const key = `${dept}::${c.CourseID ?? '__null__'}`;
            const data = lookup.get(key);
            return `<td class="py-2 px-2 text-center">${data ? heatBadge(data.total, data.passed) : '<span class="inline-flex min-w-[58px] justify-center rounded-md border border-slate-100 bg-white px-2 py-1 text-xs font-bold text-slate-200">-</span>'}</td>`;
        }).join('');

        return `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="py-2 pr-3 text-sm font-medium text-slate-700 whitespace-nowrap">${_html(dept)}</td>
            ${courseCells}
            <td class="py-2 pl-3 text-center border-l border-slate-100">${heatBadge(ov.total, ov.passed)}</td>
        </tr>`;
    }).join('');

    return `
    <div class="overflow-x-auto">
        <table class="ds-table text-left border-collapse text-sm">
            <thead>
                <tr class="border-b border-slate-100">
                    <th class="pb-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                    ${headerCols}
                    <th class="pb-2 pl-3 text-xs font-semibold text-emerald-600 uppercase tracking-wide text-center border-l border-slate-100">รวม</th>
                </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
        </table>
    </div>`;
}

function _initStatusChart(status) {
    const canvas = document.getElementById('tr-chart-status');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_chartStatus) { _chartStatus.destroy(); _chartStatus = null; }

    const labels = ['พร้อม / ผ่านเกณฑ์', 'เฝ้าระวัง', 'ต่ำกว่าเกณฑ์', 'ยังไม่มีข้อมูล'];
    const values = [status.ready, status.watch, status.gap, status.noData];
    _chartStatus = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: ['#059669', '#d97706', '#ef4444', '#cbd5e1'],
                borderColor: '#ffffff',
                borderWidth: 3,
                hoverOffset: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw} รายการ` } },
            },
        },
    });
}

function _initRiskChart(rows) {
    const canvas = document.getElementById('tr-chart-risk');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_chartRisk) { _chartRisk.destroy(); _chartRisk = null; }

    const labels = rows.map(r => String(r.dept || '').length > 24 ? String(r.dept).slice(0, 23) + '...' : r.dept);
    const values = rows.map(r => r.pct);
    const colors = values.map(v => v >= 80 ? 'rgba(5,150,105,0.75)' : v >= 60 ? 'rgba(217,119,6,0.75)' : 'rgba(239,68,68,0.75)');

    _chartRisk = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: 'Compliance (%)', data: values, backgroundColor: colors, borderRadius: 5, borderSkipped: false }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => `${ctx.raw}% compliance` } },
            },
            scales: {
                x: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => v + '%', font: { size: 10 } } },
                y: { grid: { display: false }, ticks: { font: { size: 10 } } },
            },
        },
    });
}

function _initDeptChart(byDept) {
    const canvas = document.getElementById('tr-chart-dept');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_chartBar) { _chartBar.destroy(); _chartBar = null; }

    const sorted = [...byDept].sort((a, b) => {
        const pctA = parseInt(a.TotalEmp) ? Math.round(parseInt(a.PassedCount)*100/parseInt(a.TotalEmp)) : 0;
        const pctB = parseInt(b.TotalEmp) ? Math.round(parseInt(b.PassedCount)*100/parseInt(b.TotalEmp)) : 0;
        return pctA - pctB;
    });

    const labels    = sorted.map(d => d.Department.length > 22 ? d.Department.slice(0,21)+'…' : d.Department);
    const passedPct = sorted.map(d => {
        const t = parseInt(d.TotalEmp) || 0;
        const p = parseInt(d.PassedCount) || 0;
        return t ? Math.round(p * 100 / t) : 0;
    });
    const failedPct = passedPct.map(p => 100 - p);

    _chartBar = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'ผ่าน (%)',    data: passedPct, backgroundColor: 'rgba(5,150,105,0.75)', borderRadius: 3, borderSkipped: false },
                { label: 'ไม่ผ่าน (%)', data: failedPct, backgroundColor: 'rgba(248,113,113,0.5)', borderRadius: 3, borderSkipped: false },
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
                        label: ctx => `${ctx.dataset.label}: ${ctx.raw}%`,
                    },
                },
            },
            scales: {
                x: { stacked: true, max: 100, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => v + '%', font: { size: 10 } } },
                y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
            },
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORDS PANEL — department-level records table
// ─────────────────────────────────────────────────────────────────────────────
async function _renderAuditPanel() {
    const generation = _beginLoad('audit');
    const panel = document.getElementById('tr-panel-audit');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    const curYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => curYear - i);

    await Promise.all([
        _fetchDeptRecords(_auditYear, 'audit', generation),
        _coursesCache.length === 0 ? _fetchCourses() : Promise.resolve(_coursesCache),
        _fetchAuditRequirements(_auditYear, 'audit', generation),
    ]);
    if (!_isCurrentLoad('audit', generation)) return;

    const rows = _buildAuditRows(_deptRecords, _auditRequirements, _auditMappingEnabled);
    _auditRowsCache = rows;
    const readyRows = rows.filter(r => r.total > 0 && r.pct >= r.targetPct).length;
    const missingRows = rows.filter(r => r.total <= 0).length;
    const gapRows = rows.filter(r => r.total > 0 && r.pct < r.targetPct).length;
    const overall = rows.length ? Math.round(readyRows * 100 / rows.length) : 0;

    panel.innerHTML = `
    <div class="space-y-4">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            ${_auditMetricCard('Audit Readiness', `${overall}%`, `${readyRows}/${rows.length} requirements`, overall >= 100 ? 'emerald' : 'amber')}
            ${_auditMetricCard('Ready', readyRows, 'ครบตาม target', 'emerald')}
            ${_auditMetricCard('Gap', gapRows, 'มีข้อมูลแต่ยังไม่ครบ', gapRows ? 'red' : 'slate')}
            ${_auditMetricCard('No Mapping', missingRows, 'ยังไม่พบ record ที่ตรงเงื่อนไข', missingRows ? 'amber' : 'slate')}
        </div>

        <div class="ds-section overflow-hidden" data-tr-card-image="training-audit-requirements">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#4f7f32,#2f6f42)"></div>
            <div class="p-5 space-y-4">
                <div class="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                    <div class="min-w-0">
                        <h3 class="text-base font-extrabold text-slate-800">Safety Training Audit Requirement</h3>
                        <p class="text-xs text-slate-500 mt-1">Audit view 7.1-7.5 อ้างอิงจาก Training Department Records ของปีที่เลือก</p>
                    </div>
                    <div class="w-full xl:w-auto xl:min-w-[360px]" data-tr-card-ignore>
                        <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <label for="tr-audit-mapping-toggle"
                                    class="group flex cursor-pointer items-center justify-between gap-3 rounded-lg border ${_auditMappingEnabled ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'} px-3 py-2 transition-colors">
                                    <span class="min-w-0">
                                        <span class="block text-xs font-extrabold ${_auditMappingEnabled ? 'text-emerald-800' : 'text-slate-700'}">Mapping</span>
                                        <span class="block text-[11px] ${_auditMappingEnabled ? 'text-emerald-700' : 'text-slate-500'}">
                                            ${_auditMappingEnabled ? 'เปิดอยู่ - ใช้ Training records ช่วยคำนวณ' : 'ปิดอยู่ - ใช้ค่า Audit ที่แอดมินกรอก'}
                                        </span>
                                    </span>
                                    <span class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full ${_auditMappingEnabled ? 'bg-emerald-600' : 'bg-slate-300'} transition-colors">
                                        <input id="tr-audit-mapping-toggle" type="checkbox" ${_auditMappingEnabled ? 'checked' : ''}
                                            class="sr-only">
                                        <span class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${_auditMappingEnabled ? 'translate-x-5' : 'translate-x-0.5'}"></span>
                                    </span>
                                </label>
                                <span class="inline-flex items-center justify-center rounded-full px-3 py-1 text-[11px] font-extrabold ${_auditMappingEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}">
                                    ${_auditMappingEnabled ? 'Mapping: เปิด' : 'Mapping: ปิด'}
                                </span>
                            </div>
                            <p class="mt-2 text-[11px] leading-relaxed text-slate-500">
                                ปุ่ม "ดู mapping" จะแสดงในแต่ละแถวเมื่อเปิด Mapping และมีรายการ Training record ที่ระบบจับคู่ได้
                            </p>
                        </div>
                        <div class="mt-2 flex flex-col sm:flex-row gap-2">
                            <select id="tr-audit-year" class="form-input text-sm sm:flex-1">
                                ${years.map(y => `<option value="${y}" ${y===_auditYear?'selected':''}>${y}</option>`).join('')}
                            </select>
                            ${_isAdmin ? `<button id="tr-audit-add"
                                class="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                เพิ่มแถว
                            </button>` : ''}
                            <button id="tr-audit-export"
                                class="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white shadow-sm"
                                style="background:linear-gradient(135deg,#4f7f32,#2f6f42)">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0 0l-4-4m4 4l4-4"/>
                                </svg>
                                Export CSV
                            </button>
                        </div>
                    </div>
                </div>

                <div class="rounded-xl border border-slate-200 bg-white max-w-full">
                    ${_buildAuditTable(rows)}
                </div>

                <div class="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 leading-relaxed">
                    Mapping ปิดไว้เป็นค่าเริ่มต้น เพื่อไม่ให้ข้อมูล Training records มาปนกับค่า Audit ที่แอดมินกรอก.
                    เมื่อเปิด Mapping ระบบจะใช้ Training records ช่วยคำนวณชั่วคราว และซ่อนรายการ match ไว้ในปุ่ม "ดู mapping" ในแต่ละแถว.
                </div>

                <div class="hidden rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800 leading-relaxed">
                    การ match ใช้ชื่อหลักสูตร/รหัสหลักสูตร/หมายเหตุ และชื่อกลุ่มใน Department หรือ Notes ของ record.
                    ถ้าแสดง No mapping ให้เพิ่มหรือแก้ Training record ให้มี course และกลุ่มเป้าหมายตรงกับข้อ audit นั้นก่อนนำไปยื่น.
                </div>
            </div>
        </div>
    </div>`;

    document.getElementById('tr-audit-year')?.addEventListener('change', e => {
        _auditYear = parseInt(e.target.value) || new Date().getFullYear();
        _renderAuditPanel();
    });
    document.getElementById('tr-audit-mapping-toggle')?.addEventListener('change', e => {
        _auditMappingEnabled = !!e.target.checked;
        _renderAuditPanel();
    });
    document.getElementById('tr-audit-add')?.addEventListener('click', () => openAuditRequirementForm(null));
    document.getElementById('tr-audit-export')?.addEventListener('click', _exportAuditCsv);
}

function _auditMetricCard(label, value, sub, tone = 'slate') {
    const map = {
        emerald: ['border-emerald-100', 'bg-emerald-50', 'text-emerald-700'],
        amber: ['border-amber-100', 'bg-amber-50', 'text-amber-700'],
        red: ['border-red-100', 'bg-red-50', 'text-red-600'],
        slate: ['border-slate-100', 'bg-slate-50', 'text-slate-600'],
    };
    const [border, bg, text] = map[tone] || map.slate;
    return `
    <div class="bg-white rounded-xl p-5 border ${border} shadow-sm" data-tr-card-image="training-audit-${_trSafeFilePart(label)}">
        <div class="w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3">
            <svg class="w-4 h-4 ${text}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
        </div>
        <p class="text-xs font-bold ${text}">${_html(label)}</p>
        <p class="text-3xl font-extrabold ${text} mt-1">${_html(value)}</p>
        <p class="text-xs text-slate-400 mt-1">${_html(sub)}</p>
    </div>`;
}

function _buildAuditRows(records, requirements = _auditRequirements, mappingEnabled = _auditMappingEnabled) {
    const source = requirements.length ? requirements : AUDIT_REQUIREMENTS;
    return source.map((raw, idx) => {
        const req = _normalizeAuditRequirement(raw, idx);
        const courseMatches = records.filter(r => _recordMatchesCourse(r, req));
        const targetMatches = courseMatches.filter(r => _recordMatchesTarget(r, req));
        const usable = targetMatches.length ? targetMatches : (req.no === '7.3' ? [] : courseMatches);
        const computedTotal = usable.reduce((sum, r) => sum + (parseInt(r.TotalEmp) || 0), 0);
        const passed = usable.reduce((sum, r) => sum + (parseInt(r.PassedCount) || 0), 0);
        const computedPct = computedTotal > 0 ? Math.round(Math.min(passed, computedTotal) * 100 / computedTotal) : 0;
        const manualAll = raw.AllCount !== undefined && raw.AllCount !== null && raw.AllCount !== '';
        const manualIssue = raw.IssuePct !== undefined && raw.IssuePct !== null && raw.IssuePct !== '';
        const total = manualAll ? (parseInt(raw.AllCount) || 0) : (mappingEnabled ? computedTotal : 0);
        const pct = manualIssue ? (parseInt(raw.IssuePct) || 0) : (mappingEnabled ? computedPct : 0);
        const statusText = String(raw.Status || '').trim();
        return {
            ...req,
            id: raw.id || raw.ID || null,
            Year: raw.Year || _auditYear,
            SortOrder: raw.SortOrder || idx + 1,
            manualAll,
            manualIssue,
            manualStatus: !!statusText,
            total,
            passed,
            pct,
            statusText,
            sourceMode: targetMatches.length ? 'target' : courseMatches.length ? 'course' : 'missing',
            sourceCount: usable.length,
            courseMatchCount: courseMatches.length,
            mappingEnabled,
            sourceNames: usable.map(r => `${r.Department}${r.CourseName ? ` / ${r.CourseName}` : ''}`),
        };
    });
}

function _normalizeAuditRequirement(raw, idx = 0) {
    const no = String(raw.no ?? raw.RequirementNo ?? '').trim() || `7.${idx + 1}`;
    const course = raw.course ?? raw.CourseName ?? raw.CourseTitle ?? '';
    const detail = raw.detail ?? raw.Detail ?? '';
    const target = raw.target ?? raw.TargetGroup ?? '';
    return {
        no,
        course,
        detail,
        target,
        targetPct: parseInt(raw.targetPct ?? raw.TargetPct ?? 100) || 100,
        courseKeys: _listKeys(raw.courseKeys ?? raw.CourseKeys, [course, detail]),
        targetKeys: _listKeys(raw.targetKeys ?? raw.TargetKeys, [target]),
    };
}

function _recordMatchesCourse(record, req) {
    const haystack = _norm(`${record.CourseName || ''} ${record.CourseCode || ''} ${record.Notes || ''}`);
    return req.courseKeys.some(key => haystack.includes(_norm(key)));
}

function _recordMatchesTarget(record, req) {
    const haystack = _norm(`${record.Department || ''} ${record.Notes || ''}`);
    return req.targetKeys.some(key => haystack.includes(_norm(key)));
}

function _buildAuditTable(rows) {
    const tableRows = rows.map(row => {
        const ready = row.total > 0 && row.pct >= row.targetPct;
        const computedStatus = row.total <= 0
            ? `<span class="inline-flex px-2 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">No mapping</span>`
            : ready
                ? `<span class="inline-flex px-2 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">Pass</span>`
                : `<span class="inline-flex px-2 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-100">Gap</span>`;
        const status = row.manualStatus
            ? `<span class="inline-flex px-2 py-1 rounded-full text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200">${_html(row.statusText)}</span>`
            : computedStatus;
        const issueClass = row.total > 0 && row.pct >= row.targetPct ? 'text-emerald-700' : row.total > 0 ? 'text-red-600' : 'text-amber-700';
        const mappingSummary = row.sourceMode === 'target'
            ? `${row.sourceCount} matched record(s)`
            : row.sourceMode === 'course'
                ? `${row.courseMatchCount} course match, target group not specified`
                : 'No matching training record';
        const mappingDetails = row.mappingEnabled && row.sourceNames.length
            ? `<details class="mt-1 max-w-full text-[11px] text-slate-400">
                   <summary class="inline-flex cursor-pointer select-none rounded-md bg-slate-50 px-2 py-0.5 font-bold text-slate-500 hover:bg-slate-100"
                       title="${_html(mappingSummary)}">ดู mapping (${row.sourceNames.length})</summary>
                   <div class="mt-1 max-h-24 max-w-full overflow-auto rounded-md border border-slate-100 bg-slate-50 p-2 leading-snug" style="overflow-wrap:anywhere;word-break:break-word">
                       ${_html(row.sourceNames.join(', '))}
                   </div>
               </details>`
            : '';
        return `
        <tr class="border-b border-slate-200 hover:bg-slate-50 align-top">
            <td class="px-3 py-3 text-sm font-bold text-slate-700 w-14">${_html(row.no)}</td>
            <td class="px-3 py-3 min-w-0">
                <p class="text-sm font-semibold text-slate-800 break-words leading-snug">${_html(row.course)}</p>
                ${row.detail ? `<p class="text-[11px] text-slate-500 mt-0.5 break-words leading-snug">${_html(row.detail)}</p>` : ''}
                ${mappingDetails}
            </td>
            <td class="px-3 py-3 text-sm text-slate-700 break-words leading-snug">${_html(row.target)}</td>
            <td class="px-2 py-3 text-center text-sm font-bold text-slate-700 whitespace-nowrap">${row.targetPct}%</td>
            <td class="px-2 py-3 text-center text-sm font-semibold text-slate-700 whitespace-nowrap">${row.total > 0 ? row.total.toLocaleString() : '-'}</td>
            <td class="px-2 py-3 text-center text-sm font-extrabold ${issueClass} whitespace-nowrap">${row.total > 0 ? row.pct + '%' : '-'}</td>
            <td class="px-2 py-3 text-center">${status}</td>
            ${_isAdmin ? `<td class="px-2 py-3 text-center" data-tr-card-ignore>
                <div class="inline-flex items-center gap-1">
                    <button onclick="window._trEditAuditRequirement(${row.id || 0}, ${row.SortOrder || 0})" title="แก้ไข"
                        class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button onclick="window._trDeleteAuditRequirement(${row.id || 0}, ${row.SortOrder || 0})" title="ลบ"
                        class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>` : ''}
        </tr>`;
    }).join('');

    return `
    <div class="max-w-full overflow-x-auto overscroll-x-contain">
        <table class="w-full min-w-[920px] border-collapse text-left table-fixed">
            <colgroup>
                <col style="width:48px">
                <col style="width:360px">
                <col style="width:150px">
                <col style="width:70px">
                <col style="width:70px">
                <col style="width:70px">
                <col style="width:104px">
                ${_isAdmin ? '<col style="width:72px">' : ''}
            </colgroup>
            <thead>
                <tr style="background:#4f7f32">
                    <th class="px-3 py-3 text-xs font-extrabold text-white">ข้อ</th>
                    <th class="px-3 py-3 text-xs font-extrabold text-white">หลักสูตร</th>
                    <th class="px-3 py-3 text-xs font-extrabold text-white">กลุ่มเป้าหมาย</th>
                    <th class="px-3 py-3 text-xs font-extrabold text-white text-center">Target</th>
                    <th class="px-3 py-3 text-xs font-extrabold text-white text-center">All</th>
                    <th class="px-3 py-3 text-xs font-extrabold text-white text-center">Issue</th>
                    <th class="px-3 py-3 text-xs font-extrabold text-white text-center">Status</th>
                    ${_isAdmin ? `<th class="px-3 py-3 text-xs font-extrabold text-white text-center">จัดการ</th>` : ''}
                </tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>
    </div>`;
}

function _exportAuditCsv() {
    const rows = _auditRowsCache.length ? _auditRowsCache : _buildAuditRows(_deptRecords);
    const header = ['No', 'Course', 'Target Group', 'Target', 'All', 'Issue', 'Status', 'Source'];
    const csvRows = [header, ...rows.map(row => [
        row.no,
        row.course,
        row.target,
        `${row.targetPct}%`,
        row.total || 0,
        row.total > 0 ? `${row.pct}%` : '',
        row.total <= 0 ? 'No mapping' : row.pct >= row.targetPct ? 'Pass' : 'Gap',
        row.sourceNames.join('; '),
    ])];
    const csv = csvRows.map(cols => cols.map(_csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `safety-training-audit-${_auditYear}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
    }, 0);
}

function _findAuditRequirement(id, sortOrder) {
    return _auditRequirements.find(r => Number(r.id || r.ID || 0) === Number(id))
        || _auditRequirements.find(r => Number(r.SortOrder || 0) === Number(sortOrder))
        || null;
}

function openAuditRequirementForm(row) {
    if (!_isAdmin) return;
    const isEdit = !!(row && (row.id || row.ID));
    const req = row || {
        Year: _auditYear,
        RequirementNo: '',
        CourseName: '',
        Detail: '',
        TargetGroup: '',
        TargetPct: 100,
        AllCount: '',
        IssuePct: '',
        Status: '',
        SortOrder: (_auditRequirements.length || 0) + 1,
    };
    const norm = _normalizeAuditRequirement(req, (_auditRequirements.length || 0));
    const html = `
    <form id="tr-audit-form" class="space-y-4">
        ${isEdit ? `<input type="hidden" name="id" value="${req.id || req.ID}">` : ''}
        <input type="hidden" name="Year" value="${_auditYear}">
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ข้อ</label>
                <input name="RequirementNo" class="form-input w-full" value="${_html(norm.no)}" placeholder="7.1">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ลำดับ</label>
                <input name="SortOrder" type="number" min="1" class="form-input w-full" value="${_html(req.SortOrder || '')}">
            </div>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">หลักสูตร</label>
            <input name="CourseName" class="form-input w-full" value="${_html(norm.course)}" placeholder="ชื่อหลักสูตร">
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียด</label>
            <textarea name="Detail" rows="2" class="form-textarea w-full resize-none">${_html(norm.detail || '')}</textarea>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">กลุ่มเป้าหมาย</label>
            <input name="TargetGroup" class="form-input w-full" value="${_html(norm.target)}" placeholder="เช่น ทีม Safety patrol">
        </div>
        <div class="grid grid-cols-3 gap-3">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Target %</label>
                <input name="TargetPct" type="number" min="0" max="100" class="form-input w-full" value="${_html(norm.targetPct)}">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">All</label>
                <input name="AllCount" type="number" min="0" class="form-input w-full" value="${_html(req.AllCount ?? '')}" placeholder="Auto">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Issue %</label>
                <input name="IssuePct" type="number" min="0" max="100" class="form-input w-full" value="${_html(req.IssuePct ?? '')}" placeholder="Auto">
            </div>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
            <input name="Status" class="form-input w-full" value="${_html(req.Status || '')}" placeholder="Auto / Pass / Gap / No mapping">
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">คำค้นสำหรับ match course</label>
            <input name="CourseKeys" class="form-input w-full" value="${_html(_displayKeys(req.CourseKeys, req.courseKeys))}" placeholder="cccf, safety dojo">
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">คำค้นสำหรับ match กลุ่มเป้าหมาย</label>
            <input name="TargetKeys" class="form-input w-full" value="${_html(_displayKeys(req.TargetKeys, req.targetKeys))}" placeholder="t7, subcontract">
        </div>
        <div id="tr-audit-form-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="tr-audit-submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`;
    openModal(isEdit ? 'แก้ไขแถว Audit' : 'เพิ่มแถว Audit', html, 'max-w-2xl');
    document.getElementById('tr-audit-form')?.addEventListener('submit', submitAuditRequirementForm);
}

async function submitAuditRequirementForm(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    const btn = document.getElementById('tr-audit-submit');
    const errEl = document.getElementById('tr-audit-form-err');
    const showErr = msg => {
        if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
    };
    if (errEl) errEl.classList.add('hidden');
    if (!String(data.RequirementNo || '').trim() || !String(data.CourseName || '').trim()) {
        showErr('กรุณากรอกข้อและหลักสูตร');
        return;
    }
    ['Year', 'TargetPct', 'AllCount', 'IssuePct', 'SortOrder'].forEach(key => {
        if (data[key] === '') data[key] = null;
        else if (data[key] !== null && data[key] !== undefined) data[key] = Number(data[key]);
    });
    btn.disabled = true;
    try {
        if (data.id) await API.put(`/training/audit-requirements/${data.id}`, data);
        else await API.post('/training/audit-requirements', data);
        closeModal();
        showToast('บันทึกแถว Audit สำเร็จ', 'success');
        await _renderAuditPanel();
    } catch (err) {
        showErr(_errText(err));
        btn.disabled = false;
    }
}

async function _renderRecordsPanel() {
    const generation = _beginLoad('records');
    const panel = document.getElementById('tr-panel-records');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();

    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);

    await Promise.all([_fetchDepts(), _fetchDeptRecords(_recYear, 'records', generation)]);
    if (!_isCurrentLoad('records', generation)) return;

    panel.innerHTML = `
    <div class="space-y-4">
        <!-- Filter Bar -->
        <div class="ds-filter-bar" data-tr-card-ignore>
            <div class="flex flex-wrap gap-3 items-center">
                <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">ปีงบประมาณ</label>
                <select id="tr-rec-year" class="form-input text-sm">
                    <option value="">ทุกปี</option>
                    ${years.map(y => `<option value="${y}" ${y===_recYear?'selected':''}>${y}</option>`).join('')}
                </select>
                <span id="tr-rec-count" class="text-xs text-slate-400 ml-auto"></span>
                ${_isAdmin ? `
                <button id="tr-rec-add-btn"
                    class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm"
                    style="background:linear-gradient(135deg,#059669,#0d9488)">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    เพิ่มบันทึก
                </button>` : ''}
            </div>
        </div>

        <!-- Records Table -->
        <div id="tr-dept-wrap" class="ds-table-wrap" data-tr-card-image="training-records-table">
            ${_buildRecordsTable()}
        </div>
    </div>`;

    // year filter
    document.getElementById('tr-rec-year')?.addEventListener('change', async e => {
        _recYear = parseInt(e.target.value) || null;
        const filterGeneration = _beginLoad('records-filter');
        await _fetchDeptRecords(_recYear, 'records-filter', filterGeneration);
        if (!_isCurrentLoad('records-filter', filterGeneration)) return;
        const wrap = document.getElementById('tr-dept-wrap');
        if (wrap) wrap.innerHTML = _buildRecordsTable();
        _updateRecCount();
    });

    // add button in filter bar
    document.getElementById('tr-rec-add-btn')?.addEventListener('click', () => openDeptRecordForm(null));

    _updateRecCount();
}

function _updateRecCount() {
    const el = document.getElementById('tr-rec-count');
    const records = _deptRecords || [];
    const lowCompliance = records.filter(r => {
        const total = parseInt(r.TotalEmp) || 0;
        const passed = parseInt(r.PassedCount) || 0;
        return total > 0 && Math.round(passed * 100 / total) < 80;
    }).length;
    const noData = records.filter(r => !(parseInt(r.TotalEmp) > 0)).length;
    if (el) {
        const lowBadge = lowCompliance
            ? `<span class="text-red-500 font-semibold">${lowCompliance} ต่ำกว่าเกณฑ์</span>`
            : `<span class="text-emerald-600 font-semibold">ไม่มีต่ำกว่าเกณฑ์</span>`;
        const noDataBadge = noData
            ? `<span class="text-amber-600 font-semibold">${noData} ไม่มีข้อมูล</span>`
            : `<span class="text-slate-400">0 ไม่มีข้อมูล</span>`;
        el.innerHTML = `${records.length} รายการ · ${lowBadge} · ${noDataBadge}`;
    }
}

function _buildRecordsTable() {
    if (_deptRecords.length === 0) {
        return `
        <div class="text-center py-16 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
            </div>
            <p class="font-medium">ยังไม่มีบันทึกการอบรม</p>
            <p class="text-sm mt-1">${_isAdmin ? 'กดปุ่ม "เพิ่มบันทึก" เพื่อเริ่มต้น' : 'ยังไม่มีข้อมูลในปีที่เลือก'}</p>
        </div>`;
    }

    const rows = _deptRecords.map(r => {
        const total  = parseInt(r.TotalEmp)    || 0;
        const passed = parseInt(r.PassedCount) || 0;
        const hasData = total > 0;
        const pct    = hasData ? Math.round(passed * 100 / total) : null;
        const barClr = pct === null ? '#e2e8f0' : pct >= 80 ? '#059669' : pct >= 60 ? '#d97706' : '#ef4444';
        const pctBadge = pct === null
            ? `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">—</span>`
            : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${pct>=80?'bg-emerald-100 text-emerald-700':pct>=60?'bg-amber-100 text-amber-700':'bg-red-100 text-red-600'}">${pct}%</span>`;

        const adminCols = _isAdmin ? `
            <td class="px-4 py-3" data-tr-card-ignore>
                <div class="flex items-center gap-1">
                    <button onclick="window._trEditDeptRecord(${r.id})" title="แก้ไข"
                        class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button onclick="window._trDeleteDeptRecord(${r.id},${_inlineArg(r.Department)})" title="ลบ"
                        class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>` : '';

        const courseLabel = r.CourseName
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">${_html(r.CourseName)}${r.CourseCode ? ` · ${_html(r.CourseCode)}` : ''}</span>`
            : `<span class="text-xs text-slate-300">—</span>`;

        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full flex-shrink-0 ${pct===null?'bg-slate-300':pct>=80?'bg-emerald-400':pct>=60?'bg-amber-400':'bg-red-400'}"></span>
                    <span class="text-sm font-medium text-slate-800">${_html(r.Department)}</span>
                </div>
            </td>
            <td class="px-4 py-3">${courseLabel}</td>
            <td class="px-4 py-3 text-center text-sm font-semibold text-slate-600">${r.Year}</td>
            <td class="px-4 py-3 text-center text-sm text-slate-600">${total.toLocaleString()}</td>
            <td class="px-4 py-3 text-center text-sm text-emerald-600 font-semibold">${passed.toLocaleString()}</td>
            <td class="px-4 py-3 min-w-[160px]">
                ${pct === null
                    ? pctBadge
                    : `<div class="flex items-center gap-2">
                           <div class="flex-1 bg-slate-100 rounded-full h-1.5">
                               <div class="h-1.5 rounded-full transition-all" style="width:${pct}%;background:${barClr}"></div>
                           </div>
                           ${pctBadge}
                       </div>`}
            </td>
            ${r.Notes ? `<td class="px-4 py-3 text-xs text-slate-400 max-w-[140px] truncate" title="${_html(r.Notes)}">${_html(r.Notes)}</td>` : `<td class="px-4 py-3 text-slate-300 text-xs">—</td>`}
            ${adminCols}
        </tr>`;
    }).join('');

    return `
    <div class="overflow-x-auto">
        <table class="ds-table text-left border-collapse">
            <thead>
                <tr class="bg-slate-50 border-b-2 border-slate-200">
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">หลักสูตร</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">ปี</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">พนักงาน</th>
                    <th class="px-4 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wide text-center">ผ่าน</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Compliance</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">หมายเหตุ</th>
                    ${_isAdmin ? `<th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">จัดการ</th>` : ''}
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPT RECORD FORM (add / edit)
// ─────────────────────────────────────────────────────────────────────────────
async function openDeptRecordForm(r) {
    // Ensure departments and courses loaded
    const [, courses] = await Promise.all([
        _allDepts.length === 0 ? _fetchDepts() : Promise.resolve(),
        _coursesCache.length === 0 ? _fetchCourses() : Promise.resolve(_coursesCache),
    ]);
    const activeCourses = (_coursesCache.length ? _coursesCache : courses).filter(c => c.IsActive || (r && c.id == r.CourseID));

    const isEdit  = r && r.id;
    const curYear = new Date().getFullYear();
    const years   = Array.from({ length: 5 }, (_, i) => curYear - i);
    const recYear = r?.Year || _recYear || curYear;

    const deptOptions = _allDepts.map(name =>
        `<option value="${_esc(name)}" ${r?.Department===name?'selected':''}>${name}</option>`
    ).join('');

    const html = `
    <form id="tr-dept-rec-form" class="space-y-4">
        ${isEdit ? `<input type="hidden" name="id" value="${r.id}">` : ''}

        <!-- Department -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก <span class="text-red-500">*</span></label>
            ${_allDepts.length > 0
                ? `<select name="Department" required class="form-input w-full">
                       <option value="">— เลือกแผนก —</option>
                       ${deptOptions}
                   </select>`
                : `<input type="text" name="Department" required value="${_esc(r?.Department||'')}"
                       placeholder="ชื่อแผนก" class="form-input w-full">`}
        </div>

        <!-- Year -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ปี <span class="text-red-500">*</span></label>
            <select name="Year" required class="form-input w-full">
                ${years.map(y => `<option value="${y}" ${y==recYear?'selected':''}>${y}</option>`).join('')}
            </select>
        </div>

        <!-- Course (optional) -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">หลักสูตร</label>
            <select name="CourseID" class="form-input w-full">
                <option value="">— ไม่ระบุหลักสูตร —</option>
                ${activeCourses.map(c =>
                    `<option value="${c.id}" ${r?.CourseID==c.id?'selected':''}>
                        ${_html(c.CourseName)}${c.CourseCode ? ` (${_html(c.CourseCode)})` : ''}
                    </option>`
                ).join('')}
            </select>
            <p class="text-xs text-slate-400 mt-1">แผนกเดียวกัน ปีเดียวกัน สามารถเพิ่มได้หลายหลักสูตร</p>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <!-- TotalEmp -->
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    จำนวนพนักงานเข้าอบรม <span class="text-red-500">*</span>
                </label>
                <input type="number" name="TotalEmp" required min="0"
                    id="tr-total-emp"
                    value="${r?.TotalEmp ?? ''}"
                    placeholder="0"
                    oninput="window._trUpdateCompliance()"
                    class="form-input w-full">
            </div>
            <!-- PassedCount -->
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    จำนวนที่ผ่าน <span class="text-red-500">*</span>
                </label>
                <input type="number" name="PassedCount" required min="0"
                    id="tr-passed-count"
                    value="${r?.PassedCount ?? ''}"
                    placeholder="0"
                    oninput="window._trUpdateCompliance()"
                    class="form-input w-full">
            </div>
        </div>

        <!-- Compliance (auto-calculated) -->
        <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-3">
            <svg class="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span class="text-sm text-emerald-700">Compliance: <strong id="tr-compliance-pct">
                ${r?.TotalEmp ? Math.round(parseInt(r.PassedCount)*100/parseInt(r.TotalEmp))+'%' : '—'}
            </strong></span>
        </div>

        <!-- Notes -->
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
            <textarea name="Notes" rows="2" class="form-textarea w-full resize-none"
                placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)">${_esc(r?.Notes||'')}</textarea>
        </div>

        <div id="tr-dept-rec-err" class="text-sm text-red-500 hidden"></div>

        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="tr-dept-rec-submit" class="btn btn-primary px-5">บันทึกข้อมูล</button>
        </div>
    </form>`;

    openModal(isEdit ? 'แก้ไขบันทึกการอบรม' : 'เพิ่มบันทึกการอบรม', html, 'max-w-lg');

    document.getElementById('tr-dept-rec-form')?.addEventListener('submit', guardSubmitHandler(async e => {
        e.preventDefault();
        const fd   = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        const btn  = document.getElementById('tr-dept-rec-submit');
        const errEl = document.getElementById('tr-dept-rec-err');
        const totalEmp = data.TotalEmp === '' ? 0 : Number(data.TotalEmp);
        const passedCount = data.PassedCount === '' ? 0 : Number(data.PassedCount);
        const showErr = msg => {
            if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
        };
        if (errEl) errEl.classList.add('hidden');
        if (!data.Department || !data.Year) {
            showErr('กรุณาเลือกแผนกและปี');
            return;
        }
        if (!Number.isInteger(totalEmp) || totalEmp < 0 || !Number.isInteger(passedCount) || passedCount < 0) {
            showErr('จำนวนพนักงานและจำนวนที่ผ่านต้องเป็นตัวเลข 0 ขึ้นไป');
            return;
        }
        if (passedCount > totalEmp) {
            showErr('จำนวนผ่านต้องไม่มากกว่าจำนวนพนักงาน');
            return;
        }
        data.TotalEmp = totalEmp;
        data.PassedCount = passedCount;
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>กำลังบันทึก...';

        try {
            if (data.id) {
                await API.put(`/training/dept-records/${data.id}`, data);
            } else {
                await API.post('/training/dept-records', data);
            }
            closeModal();
            showToast(data.id ? 'อัปเดตข้อมูลสำเร็จ' : 'บันทึกข้อมูลสำเร็จ', 'success');
            await _fetchDeptRecords(_recYear);
            if (_activeTab === 'records') {
                const wrap = document.getElementById('tr-dept-wrap');
                if (wrap) wrap.innerHTML = _buildRecordsTable();
                _updateRecCount();
            }
            _loadHeroStats();
            if (_activeTab === 'dashboard') _renderDashboardPanel();
        } catch (err) {
            showErr(_errText(err));
            btn.disabled = false;
            btn.textContent = 'บันทึกข้อมูล';
        }
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// COURSES PANEL (admin only — unchanged structure)
// ─────────────────────────────────────────────────────────────────────────────
async function _renderCoursesPanel() {
    const generation = _beginLoad('courses');
    const panel = document.getElementById('tr-panel-courses');
    if (!panel) return;
    panel.innerHTML = _spinnerHtml();
    const courses = await _fetchCourses();
    if (!_isCurrentLoad('courses', generation)) return;
    panel.innerHTML = _buildCoursesPanel(courses);
}

function _buildCoursesPanel(courses) {
    return `
    <div class="space-y-4">
        <div class="ds-table-wrap" data-tr-card-image="training-courses-table">
            <div class="h-1 w-full" style="background:linear-gradient(90deg,#059669,#0d9488)"></div>
            <div class="p-5">
                <div class="flex items-center justify-between mb-5">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                        </svg>
                        <h3 class="text-sm font-bold text-slate-700">หลักสูตรทั้งหมด</h3>
                        <span class="text-xs text-slate-400">(${courses.length} หลักสูตร)</span>
                    </div>
                    <button onclick="window._trOpenCourseForm(null)" data-tr-card-ignore
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                        เพิ่มหลักสูตร
                    </button>
                </div>

                ${courses.length === 0
                    ? `<div class="text-center py-12 text-slate-400">
                        <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                            <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                            </svg>
                        </div>
                        <p class="font-medium">ยังไม่มีหลักสูตร</p>
                        <p class="text-sm mt-1">กดปุ่ม "เพิ่มหลักสูตร" เพื่อเริ่มต้น</p>
                    </div>`
                    : `<div class="overflow-x-auto">
                        <table class="ds-table text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 border-b-2 border-slate-200">
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">รหัส</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">ชื่อหลักสูตร</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">ระยะเวลา</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">เกณฑ์ผ่าน</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">สถานะ</th>
                                    <th class="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${courses.map(c => `
                                <tr class="hover:bg-slate-50 transition-colors">
                                    <td class="px-3 py-3 text-xs font-mono text-slate-500">${_html(c.CourseCode || '—')}</td>
                                    <td class="px-3 py-3">
                                        <p class="text-sm font-medium text-slate-800">${_html(c.CourseName)}</p>
                                        ${c.Description ? `<p class="text-xs text-slate-400 mt-0.5 truncate max-w-xs" title="${_html(c.Description)}">${_html(c.Description)}</p>` : ''}
                                    </td>
                                    <td class="px-3 py-3 text-center text-sm text-slate-500 whitespace-nowrap">${c.DurationHours || 0} ชม.</td>
                                    <td class="px-3 py-3 text-center text-sm text-slate-500">${c.PassScore || 70}%</td>
                                    <td class="px-3 py-3 text-center">
                                        ${c.IsActive
                                            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>Active</span>`
                                            : `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">Inactive</span>`}
                                    </td>
                                    <td class="px-3 py-3" data-tr-card-ignore>
                                        <div class="flex items-center gap-1">
                                            <button onclick="window._trOpenCourseForm(${c.id})" title="แก้ไข"
                                                class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                                            </button>
                                            <button onclick="window._trDeleteCourse(${c.id},${_inlineArg(c.CourseName)})" title="ลบ"
                                                class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>`}
            </div>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// COURSE FORM (add / edit — no employee fields)
// ─────────────────────────────────────────────────────────────────────────────
async function openCourseForm(id) {
    const courses = await _fetchCourses();
    const c       = id ? courses.find(x => x.id === id) : null;
    const isEdit  = !!c;

    const html = `
    <form id="tr-course-form" class="space-y-4">
        ${isEdit ? `<input type="hidden" name="id" value="${c.id}">` : ''}

        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รหัสหลักสูตร</label>
                <input name="CourseCode" value="${_html(c?.CourseCode || '')}" placeholder="เช่น ST-001"
                    class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อหลักสูตร <span class="text-red-500">*</span></label>
                <input name="CourseName" required value="${_html(c?.CourseName || '')}" placeholder="ชื่อหลักสูตร"
                    class="form-input w-full">
            </div>
        </div>

        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียด</label>
            <textarea name="Description" rows="2" class="form-textarea w-full resize-none"
                placeholder="รายละเอียดหลักสูตร">${_html(c?.Description || '')}</textarea>
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

        <div id="tr-course-err" class="text-sm text-red-500 hidden"></div>

        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="tr-course-submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`;

    openModal(isEdit ? `แก้ไขหลักสูตร — ${_html(c.CourseName)}` : 'เพิ่มหลักสูตรใหม่', html, 'max-w-xl');

    document.getElementById('tr-course-form')?.addEventListener('submit', guardSubmitHandler(async e => {
        e.preventDefault();
        const fd   = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        if (isEdit) data.IsActive = fd.get('IsActive') === 'on' ? 1 : 0;
        const btn  = document.getElementById('tr-course-submit');
        const errEl = document.getElementById('tr-course-err');
        const duration = data.DurationHours === '' ? 0 : Number(data.DurationHours);
        const passScore = data.PassScore === '' ? 70 : Number(data.PassScore);
        const showErr = msg => {
            if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
        };
        if (errEl) errEl.classList.add('hidden');
        if (!String(data.CourseName || '').trim()) {
            showErr('กรุณากรอกชื่อหลักสูตร');
            return;
        }
        if (!Number.isFinite(duration) || duration < 0) {
            showErr('ระยะเวลาต้องเป็นตัวเลข 0 ขึ้นไป');
            return;
        }
        if (!Number.isFinite(passScore) || passScore < 0 || passScore > 100) {
            showErr('เกณฑ์ผ่านต้องอยู่ระหว่าง 0-100');
            return;
        }
        data.DurationHours = duration;
        data.PassScore = passScore;
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>กำลังบันทึก...';

        try {
            if (data.id) {
                await API.put(`/training/courses/${data.id}`, data);
            } else {
                await API.post('/training/courses', data);
            }
            closeModal();
            showToast(isEdit ? 'อัปเดตหลักสูตรสำเร็จ' : 'เพิ่มหลักสูตรสำเร็จ', 'success');
            _renderCoursesPanel();
        } catch (err) {
            showErr(_errText(err));
            btn.disabled = false;
            btn.textContent = 'บันทึก';
        }
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW GLOBALS (inline onclick)
// ─────────────────────────────────────────────────────────────────────────────
window._trEditDeptRecord = id => {
    const r = _deptRecords.find(x => x.id === id);
    if (r) openDeptRecordForm(r);
};

window._trDeleteDeptRecord = async (id, dept) => {
    const ok = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบบันทึกการอบรมของแผนก "${dept}" ใช่หรือไม่?`);
    if (!ok) return;
    try {
        await API.delete(`/training/dept-records/${id}`);
        showToast('ลบข้อมูลสำเร็จ', 'success');
        await _fetchDeptRecords(_recYear);
        const wrap = document.getElementById('tr-dept-wrap');
        if (wrap) wrap.innerHTML = _buildRecordsTable();
        _updateRecCount();
        _loadHeroStats();
    } catch (err) {
        showToast(_errText(err), 'error');
    }
};

window._trOpenCourseForm = id => openCourseForm(id || null);

window._trDeleteCourse = async (id, name) => {
    const ok = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบหลักสูตร "${name}" ใช่หรือไม่?`);
    if (!ok) return;
    try {
        await API.delete(`/training/courses/${id}`);
        showToast('ลบหลักสูตรสำเร็จ', 'success');
        _renderCoursesPanel();
    } catch (err) {
        showToast(_errText(err), 'error');
    }
};

window._trEditAuditRequirement = (id, sortOrder) => {
    const row = _findAuditRequirement(id, sortOrder);
    if (row) openAuditRequirementForm(row);
};

window._trDeleteAuditRequirement = async (id, sortOrder) => {
    const row = _findAuditRequirement(id, sortOrder);
    if (!row?.id && !row?.ID) return;
    const ok = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบแถว Audit "${row.RequirementNo || row.no || ''}" ใช่หรือไม่?`);
    if (!ok) return;
    try {
        await API.delete(`/training/audit-requirements/${row.id || row.ID}`);
        showToast('ลบแถว Audit สำเร็จ', 'success');
        await _renderAuditPanel();
    } catch (err) {
        showToast(_errText(err), 'error');
    }
};

// Live compliance calc in form
window._trUpdateCompliance = () => {
    const total  = parseInt(document.getElementById('tr-total-emp')?.value)    || 0;
    const passed = parseInt(document.getElementById('tr-passed-count')?.value) || 0;
    const el     = document.getElementById('tr-compliance-pct');
    if (!el) return;
    el.textContent = total > 0 ? Math.round(Math.min(passed, total) * 100 / total) + '%' : '—';
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function _spinnerHtml() {
    return `<div class="flex flex-col items-center justify-center h-64 text-slate-400">
        <div class="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-3"></div>
        <p class="text-sm">กำลังโหลดข้อมูล...</p>
    </div>`;
}

function _esc(str) {
    return String(str ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;');
}

function _errText(err, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง') {
    const msg = String(err?.message || err?.response?.message || '').trim();
    if (!msg) return fallback;
    if (/sql|database|constraint|foreign key|duplicate|syntax|undefined|null|internal server/i.test(msg)) {
        return fallback;
    }
    return msg;
}

function _html(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _inlineArg(value) {
    return _html(JSON.stringify(String(value ?? '')).replace(/</g, '\\u003c'));
}

function _norm(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function _csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function _listKeys(value, fallback = []) {
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
    const text = String(value || '').trim();
    if (text) return text.split(',').map(v => v.trim()).filter(Boolean);
    return fallback.map(v => String(v || '').trim()).filter(Boolean);
}

function _displayKeys(primary, legacy) {
    const values = _listKeys(primary, legacy || []);
    return values.join(', ');
}

installWindowActionLocks('training', [
  '_trDeleteDeptRecord', '_trDeleteCourse', '_trDeleteAuditRequirement'
]);
