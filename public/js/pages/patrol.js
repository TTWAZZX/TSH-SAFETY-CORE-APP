import { openModal, closeModal, showLoading, hideLoading, showToast, showError, escHtml, showConfirmationModal } from '../ui.js?v=20260602-mobile-nav-m53';
import { API } from '../api.js?v=20260902-patrol-checkin-v2';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';
import { createLatestRequestController, guardSubmitHandler, pageSkeleton, runFormBusy } from '../utils/async-ui.js?v=20260715-phase32c-residual-async';

// ─── Auth ─────────────────────────────────────────────────────────────────────
const PATROL_FALLBACK_USER = { name: 'Staff', id: '', department: '', team: 'Safety Team', role: 'User' };
let currentUser = TSHSession.getUser() || PATROL_FALLBACK_USER;

// ─── Backend URL helper (for local /uploads/ images) ─────────────────────────
const _backendBase = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : '';
function resolveFileUrl(url) {
    if (!url) return null;
    if (url.startsWith('/uploads/')) return _backendBase + url;
    try {
        const parsed = new URL(url, window.location.href);
        const host = parsed.hostname.toLowerCase();
        const currentHost = window.location.hostname.toLowerCase();
        const targetIsLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
        const currentIsLocal = currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost === '::1';
        const uploadIndex = parsed.pathname.indexOf('/uploads/');
        if (targetIsLocal && !currentIsLocal && uploadIndex >= 0) {
            const appPath = window.location.pathname || '/';
            const marker = '/index.html';
            const basePath = appPath.includes(marker)
                ? appPath.slice(0, appPath.indexOf(marker))
                : appPath.replace(/\/[^/]*$/, '');
            const base = basePath.replace(/\/+$/, '');
            return `${window.location.origin}${base}${parsed.pathname.slice(uploadIndex)}${parsed.search}${parsed.hash}`;
        }
    } catch {
        return url;
    }
    return url;
}
function getPatrolAreaName(area) {
    return area?.Name || area?.AreaName || area?.name || '';
}
function getPatrolAreaCode(area) {
    return area?.Code || area?.AreaCode || area?.code || '';
}
function patrolAreaMatches(area, value) {
    const wanted = String(value || '').trim();
    if (!wanted) return false;
    return [getPatrolAreaName(area), getPatrolAreaCode(area)]
        .map(v => String(v || '').trim())
        .some(v => v && v === wanted);
}
function patrolSetAreaSelectValue(select, areaName = '', areaCode = '') {
    if (!select) return false;
    const candidates = [areaName, areaCode].map(v => String(v || '').trim()).filter(Boolean);
    for (const value of candidates) {
        if (Array.from(select.options || []).some(opt => opt.value === value)) {
            select.value = value;
            return true;
        }
    }
    const option = Array.from(select.options || []).find(opt => {
        const optName = String(opt.dataset?.name || opt.value || '').trim();
        const optCode = String(opt.dataset?.code || '').trim();
        return candidates.some(v => v && (v === optName || v === optCode));
    });
    if (option) {
        select.value = option.value;
        return true;
    }
    return false;
}
function patrolPdfTimestamp(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
    ].join('');
}
function patrolSafePdfFilename(name) {
    return String(name || 'patrol-report')
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
let isAdmin = false;

function syncPatrolSessionUser() {
    currentUser = TSHSession.getUser() || PATROL_FALLBACK_USER;
    isAdmin = !!(
        (currentUser.role && currentUser.role.toLowerCase() === 'admin') ||
        (currentUser.Role && currentUser.Role.toLowerCase() === 'admin')
    );
}

syncPatrolSessionUser();

function canReviewPatrolLeaveUi() {
    const role = String(currentUser?.role || currentUser?.Role || '').toLowerCase();
    return isAdmin || role.includes('safety');
}

function setupPatrolCardImageExport() {
    if (_patrolCardSaveListenersReady) return;
    _patrolCardSaveListenersReady = true;
    document.addEventListener('click', event => {
        if (event.target?.closest?.('[data-patrol-card-save-action]')) {
            const card = _patrolCardSaveMenu?.card;
            _patrolHideCardImageMenu();
            if (card) _patrolDownloadCardImage(card);
            return;
        }
        if (!event.target?.closest?.('#patrol-card-save-menu')) _patrolHideCardImageMenu();
    });
    document.addEventListener('contextmenu', _patrolShowCardContextMenu);
    document.addEventListener('pointerdown', _patrolStartCardImageHold);
    document.addEventListener('pointermove', _patrolMoveCardImageHold);
    document.addEventListener('pointerup', _patrolCancelCardImageHold);
    document.addEventListener('pointercancel', _patrolCancelCardImageHold);
}

function _patrolCardFromEvent(event) {
    const card = event.target?.closest?.('[data-patrol-card-image]');
    if (!card || !document.getElementById('patrol-page')?.contains(card)) return null;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"],[data-patrol-card-ignore]')) return null;
    return card;
}

function _patrolShowCardContextMenu(event) {
    const card = _patrolCardFromEvent(event);
    if (!card) return;
    event.preventDefault();
    _patrolShowCardImageMenu(card, event.clientX, event.clientY);
}

function _patrolStartCardImageHold(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const card = _patrolCardFromEvent(event);
    if (!card) return;
    _patrolCancelCardImageHold();
    _patrolCardSaveHold = {
        card,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
            if (!_patrolCardSaveHold || _patrolCardSaveHold.card !== card) return;
            _patrolShowCardImageMenu(card, _patrolCardSaveHold.x, _patrolCardSaveHold.y);
        }, 800),
    };
}

function _patrolMoveCardImageHold(event) {
    if (!_patrolCardSaveHold || event.pointerId !== _patrolCardSaveHold.pointerId) return;
    if (Math.abs(event.clientX - _patrolCardSaveHold.x) > 10 || Math.abs(event.clientY - _patrolCardSaveHold.y) > 10) {
        _patrolCancelCardImageHold();
    }
}

function _patrolCancelCardImageHold() {
    if (_patrolCardSaveHold?.timer) clearTimeout(_patrolCardSaveHold.timer);
    _patrolCardSaveHold = null;
}

function _patrolShowCardImageMenu(card, clientX, clientY) {
    _patrolHideCardImageMenu();
    const menu = document.createElement('div');
    menu.id = 'patrol-card-save-menu';
    menu.className = 'fixed z-[9999] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl';
    menu.style.minWidth = '178px';
    menu.innerHTML = `
        <button type="button" data-patrol-card-save-action
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
    _patrolCardSaveMenu = { card, menu };
}

function _patrolHideCardImageMenu() {
    _patrolCardSaveMenu?.menu?.remove?.();
    _patrolCardSaveMenu = null;
}

async function _patrolWaitForCardAssets(card) {
    await document.fonts?.ready?.catch?.(() => {});
    const images = Array.from(card.querySelectorAll('img')).filter(img => !img.complete || img.naturalWidth === 0);
    if (!images.length) return;
    await Promise.race([
        Promise.all(images.map(img => new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        }))),
        new Promise(resolve => setTimeout(resolve, 2500)),
    ]);
}

async function _patrolDownloadCardImage(card) {
    if (typeof window.html2canvas === 'undefined') {
        showToast('ไม่พบ library สำหรับบันทึกรูปภาพ', 'error');
        return;
    }
    const rect = card.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) {
        showToast('ไม่สามารถบันทึกการ์ดที่ยังไม่แสดงผลได้', 'warning');
        return;
    }
    const name = patrolSafePdfFilename(card.dataset.patrolCardImage || 'patrol-card') || 'patrol-card';
    try {
        showLoading('Saving card image...');
        _patrolHideCardImageMenu();
        await _patrolWaitForCardAssets(card);
        const width = Math.ceil(rect.width);
        const height = Math.ceil(rect.height);
        const canvas = await window.html2canvas(card, {
            backgroundColor: '#ffffff',
            scale: Math.min(2, window.devicePixelRatio || 1.5),
            useCORS: true,
            logging: false,
            width,
            height,
            windowWidth: Math.max(document.documentElement.scrollWidth, width),
            windowHeight: Math.max(document.documentElement.scrollHeight, height),
            onclone: doc => {
                doc.querySelectorAll('[data-patrol-card-ignore], #patrol-card-save-menu').forEach(el => { el.style.display = 'none'; });
                const targetName = card.dataset.patrolCardImage || '';
                const clone = targetName
                    ? doc.querySelector(`[data-patrol-card-image="${CSS.escape(targetName)}"]`)
                    : null;
                if (clone) {
                    clone.style.width = `${width}px`;
                    clone.style.minWidth = `${width}px`;
                    clone.style.maxWidth = `${width}px`;
                    clone.style.height = `${height}px`;
                    clone.style.transform = 'none';
                    clone.style.animation = 'none';
                    clone.querySelectorAll('*').forEach(el => {
                        el.style.animation = 'none';
                        el.style.transition = 'none';
                    });
                }
            },
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${name}-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('บันทึกรูปภาพการ์ดแล้ว', 'success');
    } catch (err) {
        console.error(err);
        showToast('บันทึกรูปภาพการ์ดไม่สำเร็จ', 'error');
    } finally {
        hideLoading();
    }
}

window._patrolDownloadCardImage = _patrolDownloadCardImage;

// ─── CCCF Static Data (Rank & Stop Types) ────────────────────────────────────
const CCCF_RANKS = [
    { rank: 'A', label: 'Rank A', desc: 'เสียชีวิต, พิการ, สูญเสียอวัยวะ', detail: 'ระยะเวลา 7 วัน',   color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    { rank: 'B', label: 'Rank B', desc: 'บาดเจ็บหยุดงาน',                  detail: 'ระยะเวลา 15 วัน',  color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
    { rank: 'C', label: 'Rank C', desc: 'บาดเจ็บเล็กน้อย ไม่หยุดงาน',     detail: 'ระยะเวลา 30 วัน',  color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
];
const CCCF_STOP_TYPES = [
    { id: 1, code: 'Stop 1', label: 'อันตรายจากเครื่องจักร',         color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 2, code: 'Stop 2', label: 'อันตรายจากวัตถุหนักตกใส่',      color: '#f97316', bg: '#fff7ed', border: '#fed7aa', icon: 'M19 14l-7 7m0 0l-7-7m7 7V3' },
    { id: 3, code: 'Stop 3', label: 'อันตรายจากยานพาหนะ',             color: '#eab308', bg: '#fefce8', border: '#fef08a', icon: 'M8 17h8m-4-4v4M12 3L4 9v12h16V9l-8-6z' },
    { id: 4, code: 'Stop 4', label: 'อันตรายจากการตกจากที่สูง',       color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', icon: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6' },
    { id: 5, code: 'Stop 5', label: 'อันตรายจากไฟฟ้า',                color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 6, code: 'Stop 6', label: 'อันตรายอื่นๆ',                   color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
];

// ─── Static Data ──────────────────────────────────────────────────────────────
const SAFETY_IMAGES = [
    { id: 'A', src: 'https://lh3.googleusercontent.com/d/1TE2fjDinq-4lZ9HbKQI4mucsNbiwiDzO', title: 'A - Actuator (เครื่องจักร)', desc: 'ระวังอันตรายจากจุดหนีบ บด หรือส่วนหมุนของเครื่องจักร', tips: ['ตรวจสอบการ์ด (Guard) ครอบจุดหมุนเสมอ', 'ทำ LOTO (Lockout-Tagout) ก่อนซ่อมบำรุง', 'ห้ามสวมเครื่องประดับหรือเสื้อผ้าหลวม'] },
    { id: 'B', src: 'https://lh3.googleusercontent.com/d/1qCbUecLPJ45Og2msKwDPbt4lKAAxTiYG', title: 'B - Block (วัตถุตกทับ)', desc: 'ระวังอันตรายจากวัตถุหนักร่วงหล่นหรือล้มทับ', tips: ['สวมหมวกนิรภัย (Hard Hat) ในพื้นที่เสี่ยง', 'ตรวจสอบการจัดเก็บ (Stacking) ให้มั่นคง', 'ห้ามเดินผ่านใต้จุดที่มีการยกของหนัก'] },
    { id: 'C', src: 'https://lh3.googleusercontent.com/d/1-IsDYiBYVmhrQRC6M97dYY_qWV3rEpGS', title: 'C - Car (ยานพาหนะ)', desc: 'ระวังการเฉี่ยวชนจากรถโฟล์คลิฟท์และยานพาหนะ', tips: ['เดินในช่องทางที่กำหนด (Walkway) เท่านั้น', 'สวมเสื้อสะท้อนแสงเมื่อปฏิบัติงาน', 'สบตากับคนขับรถก่อนเดินตัดหน้า'] },
    { id: 'D', src: 'https://lh3.googleusercontent.com/d/1yrK1hjtwOALwHtOd_mZr77U-mNwaX_2H', title: 'D - Drop (ที่สูง)', desc: 'ระวังอันตรายจากการพลัดตกจากที่สูง', tips: ['สวมเข็มขัดนิรภัย (Full Body Harness) เมื่อสูงเกิน 2 เมตร', 'ตรวจสอบสภาพบันได/นั่งร้านก่อนใช้งาน', 'ต้องมีราวกั้นตกที่ได้มาตรฐาน'] },
    { id: 'E', src: 'https://lh3.googleusercontent.com/d/1E0xzqcIictAACEmHJ0QzxbjS71dVgcfi', title: 'E - Electric (ไฟฟ้า)', desc: 'ระวังอันตรายจากไฟฟ้าดูด ไฟฟ้าช็อต หรือลัดวงจร', tips: ['ตรวจสอบสภาพสายไฟและปลั๊กก่อนใช้งาน', 'ห้ามสัมผัสอุปกรณ์ไฟฟ้าขณะมือเปียก', 'งานระบบไฟฟ้าต้องทำโดยช่างผู้ชำนาญเท่านั้น'] },
    { id: 'F', src: 'https://lh3.googleusercontent.com/d/12b0as9ha0IjiFyeEzOdqkPswXpBXpRgd', title: 'F - Fire & Heat (ไฟและความร้อน)', desc: 'ระวังการสัมผัสวัตถุร้อนและอันตรายจากอัคคีภัย', tips: ['สวมถุงมือกันความร้อนเมื่อจับชิ้นงาน', 'เตรียมถังดับเพลิงให้พร้อมใช้งานเสมอ', 'ขอใบอนุญาต (Hot Work Permit) ก่อนเริ่มงานเชื่อม'] },
    { id: 'O', src: 'https://lh3.googleusercontent.com/d/1jGom0_FsxAtNIEeo4Q81b-xWUMlBlJZd', title: 'O - Oxygen (ที่อับอากาศ)', desc: 'ระวังอันตรายจากการขาดอากาศหายใจในพื้นที่จำกัด', tips: ['ตรวจวัดค่าอากาศก่อนเข้าทำงานทุกครั้ง', 'ต้องมีผู้เฝ้าระวัง (Watcher) อยู่ปากทางเข้า', 'สวมใส่อุปกรณ์ช่วยหายใจตามความเหมาะสม'] },
    { id: 'P', src: 'https://lh3.googleusercontent.com/d/1XoHyBrv0VyxEnXnO4xThNgpLoCmivWmP', title: 'P - Poison (สารเคมี)', desc: 'ระวังอันตรายจากการสัมผัสหรือสูดดมสารเคมี', tips: ['อ่านข้อมูลความปลอดภัย (SDS) ก่อนใช้งาน', 'สวมหน้ากากและถุงมือป้องกันสารเคมี', 'หากสัมผัสสารเคมีให้ล้างด้วยน้ำสะอาดทันที'] }
];

// ─── State ────────────────────────────────────────────────────────────────────
let _allIssues      = [];
let _issuesLoaded   = false;
let _issuesLoading  = null;
let _activeFilter   = 'all';
let _searchQuery    = '';
let _filterDept     = '';
let _filterUnit     = '';
let _filterDepts    = [];
let _filterUnits    = [];
let _monthlySummary = [];
let _myPlan         = null;  // personal monthly plan (team, sessions, compliance, roster)
let _currentEmployeeProfile = null; // authoritative Employee Master profile for personal UI
let _mySelfPatrol   = null;  // self-patrol data for supervisor positions
let _myTopManagementDetail = null; // full-year Top & Management schedule for persistent leave action
let _patrolLeaveCandidateCache = [];
let _patrolGreenHasNormalSchedule = false; // render-time guard for green-card dispatcher
let _patrolAreas    = [];    // master areas list — synced from Patrol_Areas table
let _masterDepts    = [];    // master departments for issue form responsible dept
let _masterUnits    = [];    // safety units per department (Master_SafetyUnits)
let _deptStatSel    = null;  // admin-saved dept stat selection (from DB)
let _unitStatSel    = null;  // admin-saved unit stat selection (from DB)
let _myYearlyStats       = null;  // yearly patrol stats for personal dashboard (Phase 3)
let _overviewYear   = new Date().getFullYear();
let _overviewData   = null;  // attendance overview cache
let _arsvCurrentDetail = null; // Sec. & Supervisor admin schedule/detail cache
let _filterRank     = '';    // active Rank filter on issues tab (A/B/C or '')
let _filterStop     = 0;     // active Stop filter on issues tab (1-6 or 0)
let _filterStops    = [];
let _filterArea     = '';    // active Area filter on issues tab
let _issueSubTab    = 'registry'; // registry | stats
let _issueYear      = 'all';
let _issuePage      = 1;
let _issuePageSize  = '10';
let _issueSort      = 'urgent';
let _areaStatSel    = null;  // admin-saved area stat selection (from DB)
let _spotlightMgmtId = null; // EmployeeID of spotlighted management member (from DB)
const ISSUE_FILTER_STATE_KEY = 'patrol_issue_filter_state';
const ISSUE_PAGE_SIZE_KEY = 'patrol_issue_page_size';
const JOHNNY_IMAGE_RISK_DRAFT_KEY = 'johnny_image_risk_draft';
// Phase 32C audit: retained for specialized multi-control actions whose exact UI restoration
// is broader than a single shared guarded button (leave review, issue delete, and hotspot saves).
const _patrolActionLocks = new Set();
let _patrolCardSaveListenersReady = false;
let _patrolCardSaveHold = null;
let _patrolCardSaveMenu = null;
const PATROL_RANK_A_LAYOUT_IMAGE = 'public/images/accident/tsh-factory-layout.jpg';
const PATROL_RANK_A_DEFAULT_POINTS = [
    { x: 42, y: 43 },
    { x: 42, y: 79 },
    { x: 72, y: 43 },
    { x: 72, y: 78 },
    { x: 25, y: 54 },
    { x: 54, y: 60 },
];
let _rankAHotspotPositions = {};
let _rankAHotspotIssuePositions = {};
let _rankAHotspotEditMode = false;
let _rankAHotspotIssueEditMode = false;
let _rankAHotspotEditArea = '';
let _rankAHotspotEditIssueId = '';
let _rankAHotspotDragArea = '';
let _rankAHotspotDragIssueId = '';
let _rankAHotspotDirtyIssueIds = new Set();
let _rankAHotspotSelectedIssueId = '';
let _rankAHotspotExpandedClusterKey = '';

async function ensurePatrolIssuesLoaded({ refresh = false } = {}) {
    if (_issuesLoaded && !refresh) return _allIssues;
    if (_issuesLoading && !refresh) return _issuesLoading;
    _issuesLoading = Promise.all([
        API.get('/patrol/issues').catch(() => ({ data: [] })),
        API.get('/patrol/rank-a-hotspot-positions').catch(() => ({ data: [] })),
        API.get('/patrol/rank-a-hotspot-issue-positions').catch(() => ({ data: [] })),
    ]).then(([issuesRes, rankAPosRes, rankAIssuePosRes]) => {
        _allIssues = normalizeApiArray(issuesRes);
        _setRankAHotspotPositions(normalizeApiArray(rankAPosRes));
        _setRankAHotspotIssuePositions(normalizeApiArray(rankAIssuePosRes));
        _issuesLoaded = true;
        _issuesLoading = null;
        return _allIssues;
    }).catch(err => {
        _issuesLoading = null;
        throw err;
    });
    return _issuesLoading;
}

function patrolIssueHeroStats() {
    const list = Array.isArray(_allIssues) ? _allIssues : [];
    const openIssues = list.filter(i => (i.CurrentStatus === 'Open') || ((i.Status || '').toUpperCase() === 'OPEN')).length;
    const tempIssues = list.filter(i => (i.CurrentStatus === 'Temporary') || ((i.Status || '').toUpperCase() === 'TEMP')).length;
    const closedIssues = list.filter(i => (i.CurrentStatus === 'Closed') || ((i.Status || '').toUpperCase() === 'CLOSE')).length;
    return [
        { label: 'Open', val: openIssues, color: openIssues > 0 ? '#fca5a5' : '#6ee7b7' },
        { label: 'Temporary', val: tempIssues, color: tempIssues > 0 ? '#fed7aa' : '#6ee7b7' },
        { label: 'Closed', val: closedIssues, color: '#6ee7b7' },
        { label: 'Total', val: list.length, color: '#a5f3fc' },
    ];
}

function _peekJohnnyImageRiskDraft(target) {
    try {
        const draft = JSON.parse(sessionStorage.getItem(JOHNNY_IMAGE_RISK_DRAFT_KEY) || 'null');
        return draft?.source === 'johnny_ai_image_analysis' && draft?.target === target ? draft : null;
    } catch {
        return null;
    }
}

function _consumeJohnnyImageRiskDraft(target) {
    const draft = _peekJohnnyImageRiskDraft(target);
    if (draft) sessionStorage.removeItem(JOHNNY_IMAGE_RISK_DRAFT_KEY);
    return draft;
}

function _johnnyDraftRank(answer = '') {
    if (/Critical|High|วิกฤต|สูง/i.test(String(answer || ''))) return 'A';
    if (/Medium|ปานกลาง/i.test(String(answer || ''))) return 'B';
    return 'C';
}
function _johnnyDraftStopCode(answer = '') {
    const text = String(answer || '').toLowerCase();
    if (/machine|เครื่องจักร|หนีบ|ตัด|หมุน|guard|loto/.test(text)) return 1;
    if (/ตกใส่|ของหนัก|crane|ยก|หล่น|falling object/.test(text)) return 2;
    if (/forklift|รถ|traffic|vehicle|ชน|ทางเดิน/.test(text)) return 3;
    if (/ตกจากที่สูง|บันได|นั่งร้าน|height|ladder|scaffold/.test(text)) return 4;
    if (/electric|ไฟฟ|สายไฟ|ปลั๊ก|ช็อต|shock/.test(text)) return 5;
    return 6;
}
function _johnnyDraftDueDate(rank) {
    const days = rank === 'A' ? 7 : rank === 'B' ? 14 : 30;
    const due = new Date();
    due.setDate(due.getDate() + days);
    return due.toISOString().slice(0, 10);
}

function _openJohnnyImageRiskDraftPatrolIssue() {
    const draft = _consumeJohnnyImageRiskDraft('patrol');
    if (!draft) return;

    const answer = String(draft.answer || '').trim();
    const rank = _johnnyDraftRank(answer);
    const stopCode = _johnnyDraftStopCode(answer);
    window.openIssueForm?.('OPEN', {
        DateFound: new Date().toISOString().slice(0, 10),
        MachineName: 'Johnny AI image risk draft',
        HazardDescription: `Draft from Johnny AI image risk analysis\n\n${answer}`,
        HazardType: '',
        Rank: rank,
        DueDate: _johnnyDraftDueDate(rank),
        CurrentStatus: 'Open',
    });
    setTimeout(() => {
        const input = document.getElementById('if-hazard-type-hidden');
        const checkbox = Array.from(document.querySelectorAll('#issue-form input[type="checkbox"]'))
            .find(item => String(item.value || '').startsWith(`STOP ${stopCode} `));
        if (!input || !checkbox) return;
        checkbox.checked = true;
        window._issueToggleMultiValue('if-hazard-type-hidden', checkbox.value, true);
    }, 0);
    showToast('เติม draft จาก Johnny AI แล้ว กรุณาตรวจสอบก่อนส่ง', 'success');
}

function patrolDateOnly(value) {
    if (!value) return '';
    if (value instanceof Date) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    return String(value).slice(0, 10);
}

function patrolCheckinTime(value) {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function patrolSessionId(item = {}) {
    return String(item.id || item.SessionID || item.ScheduledSessionID || item.sessionId || '');
}

function patrolSessionRecords(item = {}) {
    return Array.isArray(item.records) ? item.records : [];
}

function patrolSessionCompleted(item = {}) {
    const status = String(item.completionStatus || item.status || item.Status || '').toLowerCase();
    return item.isCompleted === true || ['completed', 'checked', 'makeup'].includes(status) || patrolSessionRecords(item).length > 0;
}

function patrolSessionLeave(item = {}) {
    const status = String(item.checkinStatus || item.completionStatus || item.status || item.Status || '').toLowerCase();
    return item.isLeave === true || status === 'leave' || String(item.leave?.Status || '').toLowerCase() === 'approved';
}

function patrolSessionLeavePending(item = {}) {
    const status = String(item.checkinStatus || item.completionStatus || item.status || item.Status || '').toLowerCase();
    return item.isLeavePending === true || status === 'leave_pending' || String(item.leave?.Status || '').toLowerCase() === 'pending';
}

function patrolSessionLeaveBlocking(item = {}) {
    return patrolSessionLeave(item) || patrolSessionLeavePending(item);
}

function patrolSessionMakeup(item = {}) {
    const status = String(item.completionStatus || item.status || item.Status || '').toLowerCase();
    if (item.isMakeup === true || status === 'makeup') return true;
    return patrolSessionRecords(item).some(r => r?.isMakeup === true || r?.PatrolType === 'compensation');
}

function patrolSessionActualDate(item = {}) {
    return item.actualDate || patrolSessionRecords(item)[0]?.actualDate || '';
}

function patrolScheduleDate(item = {}) {
    return patrolDateOnly(item.date || item.PatrolDate || item.ScheduledDate || item.scheduledDate);
}

function patrolScheduleArea(item = {}) {
    return item.areaName || item.AreaName || item.areaCode || item.AreaCode || item.Location || '';
}

function patrolScheduleRound(item = {}) {
    return item.patrolRound || item.PatrolRound || item.Round || '';
}

function patrolScheduleStatusLabel(item = {}) {
    const status = String(item.checkinStatus || item.completionStatus || item.status || '').toLowerCase();
    if (status === 'leave_pending' || patrolSessionLeavePending(item)) return 'Pending Leave';
    if (status === 'leave' || patrolSessionLeave(item)) return 'Leave';
    if (status === 'checked') return 'Checked';
    if (status === 'makeup') return 'Makeup';
    if (status === 'missed') return 'Missed';
    if (status === 'upcoming') return 'Upcoming';
    if (status === 'locked') return 'Locked';
    return patrolSessionCompleted(item) ? 'Checked' : 'Open';
}

function patrolTypeMeta(type) {
    if (type === 'compensation') return { label: 'เดินซ่อม', en: 'Makeup', cls: 'text-violet-600 bg-violet-50' };
    return { label: 'เดินปกติ', en: 'Routine', cls: 'text-emerald-600 bg-emerald-50' };
}

function patrolIsFlexibleSelfPatrol() {
    return _mySelfPatrol?.scheduleMode === 'flexible';
}

function patrolFlexibleDays() {
    return Array.isArray(_mySelfPatrol?.calendarDays) ? _mySelfPatrol.calendarDays : [];
}

function patrolFlexibleAllowedAreas() {
    const areas = Array.isArray(_mySelfPatrol?.allowedAreas) ? _mySelfPatrol.allowedAreas : [];
    return areas.length ? areas : _patrolAreas;
}

function patrolPersonalScheduleItems() {
    return patrolSelfScheduledYearItems();
}

function patrolPersonalOpenScheduleItems() {
    return patrolSelfScheduledYearOpenItems();
}

function patrolSelfScheduledMonthItems() {
    if (patrolIsFlexibleSelfPatrol()) return patrolFlexibleDays();
    const periodItems = Array.isArray(_mySelfPatrol?.currentPeriod?.items) ? _mySelfPatrol.currentPeriod.items : [];
    if (periodItems.length) return periodItems;
    return Array.isArray(_mySelfPatrol?.schedule) ? _mySelfPatrol.schedule : [];
}

function patrolSelfScheduledMonthOpenItems() {
    if (patrolIsFlexibleSelfPatrol()) {
        return patrolFlexibleDays().filter(item => String(item.status || '').toLowerCase() === 'open' && !item.isCompleted && !patrolSessionLeaveBlocking(item));
    }
    const monthOpen = Array.isArray(_mySelfPatrol?.openSchedule) ? _mySelfPatrol.openSchedule : [];
    if (monthOpen.length || Array.isArray(_mySelfPatrol?.openSchedule)) return monthOpen;
    return patrolSelfScheduledMonthItems().filter(item => !patrolSessionCompleted(item) && !patrolSessionLeaveBlocking(item));
}

function patrolSelfScheduledYearItems() {
    if (patrolIsFlexibleSelfPatrol()) return patrolFlexibleDays();
    const yearly = Array.isArray(_mySelfPatrol?.yearSchedule) ? _mySelfPatrol.yearSchedule : [];
    return yearly.length ? yearly : (Array.isArray(_mySelfPatrol?.schedule) ? _mySelfPatrol.schedule : []);
}

function patrolSelfScheduledYearOpenItems() {
    if (patrolIsFlexibleSelfPatrol()) {
        return patrolFlexibleDays().filter(item => String(item.status || '').toLowerCase() === 'open' && !item.isCompleted && !patrolSessionLeaveBlocking(item));
    }
    const yearlyOpen = Array.isArray(_mySelfPatrol?.openYearSchedule) ? _mySelfPatrol.openYearSchedule : [];
    if (yearlyOpen.length || Array.isArray(_mySelfPatrol?.openYearSchedule)) return yearlyOpen.filter(item => !patrolSessionLeaveBlocking(item));
    return Array.isArray(_mySelfPatrol?.openSchedule) ? _mySelfPatrol.openSchedule.filter(item => !patrolSessionLeaveBlocking(item)) : [];
}

function patrolSelfMakeupScheduleItems() {
    if (patrolIsFlexibleSelfPatrol()) return [];
    const today = patrolDateOnly(new Date());
    const openYear = patrolSelfScheduledYearOpenItems();
    const missed = openYear.filter(item => {
        const status = String(item.status || item.checkinStatus || '').toLowerCase();
        const date = patrolScheduleDate(item);
        return status === 'missed' || (!!date && date < today);
    });
    return missed;
}

function patrolSelfScheduleOptionItems(type = 'normal', preferredId = '') {
    const items = type === 'compensation' ? patrolSelfMakeupScheduleItems() : patrolSelfScheduledMonthOpenItems();
    if (!preferredId) return items;
    const exists = items.some(item => {
        const id = patrolSessionId(item);
        return id === String(preferredId) || String(item.ScheduledSessionID || '') === String(preferredId);
    });
    if (exists) return items;
    const preferred = patrolSelfScheduledYearItems().find(item => {
        const id = patrolSessionId(item);
        return id === String(preferredId) || String(item.ScheduledSessionID || '') === String(preferredId);
    });
    return preferred && !patrolSessionCompleted(preferred) ? [preferred, ...items] : items;
}

function patrolSelfScheduleOptionsHTML(items = [], selectedId = '') {
    return items.map((item, idx) => {
        const id = patrolSessionId(item);
        const sid = item.ScheduledSessionID || id;
        const date = patrolScheduleDate(item);
        const area = patrolScheduleArea(item);
        const round = patrolScheduleRound(item);
        const selected = String(id) === String(selectedId) || String(sid) === String(selectedId) || (!selectedId && idx === 0);
        return `<option value="${escHtml(sid)}" data-date="${escHtml(date)}" data-area="${escHtml(area)}" ${selected ? 'selected' : ''}>${escHtml(date)}${area ? ' · ' + escHtml(area) : ''}${round ? ' · R' + escHtml(round) : ''}</option>`;
    }).join('');
}

function patrolHasSelfPatrolDuty() {
    return _mySelfPatrol?.isSupervisorPatrol === true;
}

function patrolUseSelfPatrolGreenFallback() {
    return !_myPlan && !_patrolGreenHasNormalSchedule && patrolHasSelfPatrolDuty();
}

function patrolSelfPatrolProgress() {
    const sp = _mySelfPatrol || {};
    const checkins = Array.isArray(sp.checkins) ? sp.checkins : [];
    const completed = Number(sp.completed ?? checkins.length ?? 0);
    const target = Number(sp.monthlyRequirement ?? sp.target ?? 0);
    const remaining = Number(sp.remaining ?? Math.max(0, target - completed));
    const pct = target > 0 ? Math.min(Math.round((completed / target) * 100), 100) : 0;
    return { completed, target, remaining, pct, done: target > 0 && completed >= target };
}

function patrolLeaveCandidates() {
    const candidates = [];
    const seen = new Set();
    const add = (group, item) => {
        const sessionId = String(item?.ScheduledSessionID || patrolSessionId(item) || '');
        const date = patrolScheduleDate(item);
        const status = String(item?.status || item?.completionStatus || item?.checkinStatus || '').toLowerCase();
        const key = `${group}:${sessionId}`;
        if (!sessionId || !date || seen.has(key) || patrolSessionCompleted(item) || patrolSessionLeaveBlocking(item) || ['cancelled', 'completed', 'checked'].includes(status)) return;
        seen.add(key);
        candidates.push({
            group,
            sessionId,
            date,
            area: patrolScheduleArea(item),
            round: patrolScheduleRound(item),
            status: patrolScheduleStatusLabel(item),
        });
    };
    (Array.isArray(_myTopManagementDetail?.schedule) ? _myTopManagementDetail.schedule : []).forEach(item => add('top_management', item));
    patrolSelfScheduledYearItems().forEach(item => add('supervisor', item));
    const today = patrolDateOnly(new Date());
    return candidates.sort((a, b) => {
        const aFuture = a.date >= today;
        const bFuture = b.date >= today;
        if (aFuture !== bFuture) return aFuture ? -1 : 1;
        return aFuture ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
}

window.openPatrolLeavePicker = function() {
    _patrolLeaveCandidateCache = patrolLeaveCandidates();
    if (!_patrolLeaveCandidateCache.length) {
        openModal('ลา Safety Patrol', `
          <div class="py-5 text-center">
            <div class="mx-auto mb-3 w-12 h-12 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <p class="text-sm font-black text-slate-700">ไม่มีรอบที่สามารถยื่นลาได้</p>
            <p class="mt-1 text-xs text-slate-400">รอบที่ Check-in หรือยื่นลาแล้วจะไม่แสดงในรายการ</p>
          </div>`, 'max-w-sm');
        return;
    }
    const today = patrolDateOnly(new Date());
    openModal('เลือก รอบที่ต้องการลา', `
      <div class="space-y-3">
        <div class="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5">
          <p class="text-xs font-black text-sky-800">ลา Safety Patrol</p>
          <p class="mt-0.5 text-[11px] text-sky-700">เลือกรอบค้างหรือรอบล่วงหน้าที่ต้องการยื่นลา</p>
        </div>
        <div class="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
          ${_patrolLeaveCandidateCache.map((item, index) => {
              const groupLabel = item.group === 'top_management' ? 'Top & Management' : 'Sec. & Supervisor';
              const past = item.date < today;
              return `<button type="button" onclick="window.selectPatrolLeaveCandidate(${index})"
                class="w-full rounded-xl border ${past ? 'border-amber-100 bg-amber-50/50 hover:bg-amber-50' : 'border-sky-100 bg-white hover:bg-sky-50'} px-3 py-3 text-left transition-colors">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-xs font-black text-slate-700">${escHtml(item.date)}${item.area ? ` · ${escHtml(item.area)}` : ''}</p>
                    <p class="mt-1 text-[10px] text-slate-400">${escHtml(groupLabel)}${item.round ? ` · รอบ ${escHtml(item.round)}` : ''}</p>
                  </div>
                  <span class="flex-shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${past ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}">${past ? 'รอบค้าง' : 'รอบถัดไป'}</span>
                </div>
              </button>`;
          }).join('')}
        </div>
      </div>`, 'max-w-md');
};
window.selectPatrolLeaveCandidate = function(index) {
    const item = _patrolLeaveCandidateCache[Number(index)];
    if (!item) return;
    closeModal();
    setTimeout(() => openPatrolLeaveModal(item.group, item.sessionId, item.date, item.area), 80);
};

function openPersonalPatrolCheckin(selectedSessionId = '', source = 'auto') {
    if (source === 'self' || patrolUseSelfPatrolGreenFallback()) {
        openSelfCheckinModal(selectedSessionId);
        return;
    }
    openCheckInModal();
}

function patrolFlexibleDayTone(day = {}) {
    const status = String(day.status || '').toLowerCase();
    if (day.isCompleted || status === 'checked') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status === 'locked') return 'border-slate-100 bg-slate-50 text-slate-300';
    return 'border-amber-200 bg-white text-amber-700 hover:border-amber-400 hover:bg-amber-50';
}

function patrolDisplayUser() {
    const p = _currentEmployeeProfile || {};
    const name = p.EmployeeName || p.name || currentUser.name || currentUser.EmployeeName || currentUser.id || '';
    return {
        id: p.EmployeeID || currentUser.id || currentUser.EmployeeID || '',
        name,
        initial: (name || '?').trim().charAt(0).toUpperCase(),
        department: p.Department || currentUser.department || currentUser.Department || '',
        position: p.Position || currentUser.position || currentUser.Position || '',
        unit: p.Unit || currentUser.unit || currentUser.Unit || '',
        team: p.TeamName || currentUser.team || currentUser.Team || '',
        email: p.CompanyEmail || currentUser.CompanyEmail || '',
    };
}

function saveIssueFilterState() {
    try {
        sessionStorage.setItem(ISSUE_FILTER_STATE_KEY, JSON.stringify({
            activeFilter: _activeFilter,
            searchQuery: _searchQuery,
            filterDept: _filterDept,
            filterUnit: _filterUnit,
            filterDepts: _filterDepts,
            filterUnits: _filterUnits,
            filterRank: _filterRank,
            filterStop: _filterStop,
            filterStops: _filterStops,
            filterArea: _filterArea,
            issueSubTab: _issueSubTab,
            issueYear: _issueYear,
            issueSort: _issueSort,
        }));
    } catch (_) {}
}

function restoreIssueFilterState() {
    try {
        const state = JSON.parse(sessionStorage.getItem(ISSUE_FILTER_STATE_KEY) || 'null');
        if (state) {
            _activeFilter = state.activeFilter || 'all';
            _searchQuery = state.searchQuery || '';
            _filterDept = state.filterDept || '';
            _filterUnit = state.filterUnit || '';
            _filterDepts = Array.isArray(state.filterDepts)
                ? state.filterDepts.map(String).filter(Boolean)
                : (_filterDept ? [_filterDept] : []);
            _filterUnits = Array.isArray(state.filterUnits)
                ? state.filterUnits.map(String).filter(Boolean)
                : (_filterUnit ? [_filterUnit] : []);
            _filterRank = state.filterRank || '';
            _filterStop = Number(state.filterStop) || 0;
            _filterStops = Array.isArray(state.filterStops)
                ? [...new Set(state.filterStops.map(Number).filter(n => n >= 1 && n <= 6))]
                : (_filterStop ? [_filterStop] : []);
            _filterDept = _filterDepts[0] || '';
            _filterUnit = _filterUnits[0] || '';
            _filterStop = _filterStops[0] || 0;
            _filterArea = state.filterArea || '';
            _issueSubTab = state.issueSubTab === 'stats' ? 'stats' : 'registry';
            _issueYear = /^\d{4}$/.test(String(state.issueYear || '')) ? String(state.issueYear) : 'all';
            _issueSort = ['urgent', 'latest', 'oldest', 'due', 'id_desc', 'area'].includes(state.issueSort) ? state.issueSort : 'urgent';
        }
    } catch (_) {}
    try {
        const savedPageSize = localStorage.getItem(ISSUE_PAGE_SIZE_KEY);
        _issuePageSize = ['10', '20', '50', '100', 'all'].includes(savedPageSize) ? savedPageSize : '10';
    } catch (_) {
        _issuePageSize = '10';
    }
}

function getReadableError(err, fallback = 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง') {
    const raw = String(err?.message || err || '').trim();
    if (!raw) return fallback;
    if (/ER_|SQL|constraint|foreign key|duplicate|ECONN|Cannot|undefined|null/i.test(raw)) return fallback;
    return raw;
}

async function runOnce(key, fn) {
    if (_patrolActionLocks.has(key)) return null;
    _patrolActionLocks.add(key);
    try { return await fn(); }
    finally { _patrolActionLocks.delete(key); }
}

window._previewIssueFile = function(input) {
    const file = input?.files?.[0];
    const label = input?.closest('label');
    const textEl = input?.previousElementSibling;
    if (textEl) textEl.textContent = file ? file.name : 'คลิกเพื่อเลือกรูปภาพ';
    if (!label) return;
    let preview = label.querySelector('.issue-file-preview');
    if (!preview) {
        preview = document.createElement('div');
        preview.className = 'issue-file-preview mt-2 flex items-center gap-2 text-[11px] text-slate-500';
        label.appendChild(preview);
    }
    if (!file) { preview.innerHTML = ''; return; }
    preview.innerHTML = '';
    if (file.type && file.type.startsWith('image/')) {
        const url = window.URL?.createObjectURL?.(file);
        if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'w-12 h-12 rounded-lg object-cover border border-white shadow-sm';
            img.onload = () => window.URL?.revokeObjectURL?.(url);
            preview.appendChild(img);
        }
        const span = document.createElement('span');
        span.className = 'truncate max-w-[220px]';
        span.textContent = file.name;
        preview.appendChild(span);
    } else {
        const span = document.createElement('span');
        span.className = 'truncate max-w-[260px]';
        span.textContent = file.name;
        preview.appendChild(span);
    }
};

window._patrolCloseImageViewer = function() {
    document.getElementById('patrol-image-viewer')?.remove();
    if (window._patrolImageViewerEsc) document.removeEventListener('keydown', window._patrolImageViewerEsc);
    window._patrolImageViewerEsc = null;
};

window._patrolOpenImageViewer = function(url, title = 'Issue image') {
    if (!url) return;
    window._patrolCloseImageViewer?.();
    const safeUrl = escHtml(url);
    const safeTitle = escHtml(title || 'Issue image');
    const fileName = patrolSafePdfFilename(title || 'patrol-issue-image') + '.jpg';
    const viewer = document.createElement('div');
    viewer.id = 'patrol-image-viewer';
    viewer.className = 'fixed inset-0 z-[10000] bg-slate-950/90 backdrop-blur-sm flex flex-col';
    viewer.innerHTML = `
      <div class="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-white/10">
        <div class="min-w-0">
          <div class="text-sm font-bold text-white truncate">${safeTitle}</div>
          <div class="text-[11px] text-slate-400 truncate">${safeUrl}</div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <a href="${safeUrl}" download="${escHtml(fileName)}" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
            Download
          </a>
          <a href="${safeUrl}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7m0 0v7m0-7L10 14M5 5h5M5 5v14h14v-5"/></svg>
            Open
          </a>
          <button type="button" onclick="window._patrolCloseImageViewer()" class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white text-slate-700 hover:bg-slate-100 transition-colors" title="Close">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <button type="button" class="flex-1 min-h-0 p-3 sm:p-6 cursor-zoom-out" onclick="window._patrolCloseImageViewer()">
        <img src="${safeUrl}" alt="${safeTitle}" class="w-full h-full object-contain" onclick="event.stopPropagation()">
      </button>
    `;
    document.body.appendChild(viewer);
    window._patrolImageViewerEsc = (event) => {
        if (event.key === 'Escape') window._patrolCloseImageViewer();
    };
    document.addEventListener('keydown', window._patrolImageViewerEsc);
};

// ─── Main Load ────────────────────────────────────────────────────────────────
export async function loadPatrolPage() {
    syncPatrolSessionUser();
    setupPatrolCardImageExport();
    restoreIssueFilterState();
    window.closeModal = closeModal;
    window.loadPatrolPage = loadPatrolPage;
    window.openCheckInModal = openCheckInModal;
    window.openPersonalPatrolCheckin = openPersonalPatrolCheckin;
    window.openIssueForm = openIssueForm;
    window.handleCheckInSubmit = handleCheckInSubmit;
    window.openCarouselDetail = openCarouselDetail;
    window.openSelfCheckinModal = openSelfCheckinModal;
    window.deleteSelfCheckin = deleteSelfCheckin;
    window.switchOverviewYear = switchOverviewYear;
    window.openCalendarDay = openCalendarDay;
    window.exportIssuesToExcel = exportIssuesToExcel;
    window.exportPatrolOverviewExcel = exportPatrolOverviewExcel;
    window.exportIssuesToPDF   = exportIssuesToPDF;
    window.exportPatrolPDF     = window.exportPatrolPDF; // defined at module level
    window.openSpotlightPickerModal  = openSpotlightPickerModal;
    window.openSpotlightRecordsModal = openSpotlightRecordsModal;
    window._issueChangeDept = _issueChangeDept;
    window.deleteIssue = deleteIssue;
    window._issueFilterDept = _issueFilterDept;
    window._issueSwitchSubTab = _issueSwitchSubTab;
    window._issueSetYear = _issueSetYear;
    window._issueSetPageSize = _issueSetPageSize;
    window._issueGoPage = _issueGoPage;
    window._issueOpenById = _issueOpenById;
    window._issueSetSort = _issueSetSort;
    window._issueSetSearch = _issueSetSearch;
    window._issueToggleMobileFilters = _issueToggleMobileFilters;
    window._issueClearFilters = _issueClearFilters;
    window._issueSetMobileStatus = _issueSetMobileStatus;
    window._issueToggleExportMenu = _issueToggleExportMenu;
    window._issueExport = _issueExport;
    window._issueShowOnHotspot = _issueShowOnHotspot;
    window._issueShowInRegistry = _issueShowInRegistry;
    window._issueFilterRank    = (rank)   => { _filterRank = (_filterRank === rank) ? '' : rank; _filterStops = []; _filterStop = 0; saveIssueFilterState(); _applyIssueTableFilter(); };
    window._issueClearRankStop = ()       => { _filterRank = ''; _filterStops = []; _filterStop = 0; saveIssueFilterState(); _applyIssueTableFilter(); };
    window._issueUnitFilter    = (v)      => window._issueSetMultiFilter('unit', v ? [v] : []);
    window._issueFilterArea    = (area)   => {
        _filterArea = (_filterArea === area) ? '' : area;
        saveIssueFilterState();
        _applyIssueTableFilter();
        renderAreaStats();
        if (_filterArea) document.getElementById('dashboard-section-body')?.closest('.bg-white')?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    };
    window._rankAHotspotToggleEdit = _rankAHotspotToggleEdit;
    window._rankAHotspotToggleIssueEdit = _rankAHotspotToggleIssueEdit;
    window._rankAHotspotSetEditArea = _rankAHotspotSetEditArea;
    window._rankAHotspotSetEditIssue = _rankAHotspotSetEditIssue;
    window._rankAHotspotSelectPoint = _rankAHotspotSelectPoint;
    window._rankAHotspotOpenIssue = _rankAHotspotOpenIssue;
    window._rankAHotspotFocusIssue = _rankAHotspotFocusIssue;
    window._rankAHotspotOpenSelectedIssue = _rankAHotspotOpenSelectedIssue;
    window._rankAHotspotToggleCluster = _rankAHotspotToggleCluster;
    window._rankAHotspotMapClick = _rankAHotspotMapClick;
    window._rankAHotspotStartDrag = _rankAHotspotStartDrag;
    window._rankAHotspotStartIssueDrag = _rankAHotspotStartIssueDrag;
    window._rankAHotspotMapPointerMove = _rankAHotspotMapPointerMove;
    window._rankAHotspotMapPointerUp = _rankAHotspotMapPointerUp;
    window._rankAHotspotSavePositions = _rankAHotspotSavePositions;
    window._rankAHotspotSaveIssuePositions = _rankAHotspotSaveIssuePositions;

    const container = document.getElementById('patrol-page');
    if (!container) return;
    const request = createLatestRequestController('patrol:page-load');
    container.innerHTML = pageSkeleton({ label: 'กำลังโหลดข้อมูล Safety Patrol', cards: 4, rows: 6 });

    try {
        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curYear  = now.getFullYear();

        const [scheduleRes, profileRes, statsRes, summaryRes, planRes, selfPatrolRes, areasRes, deptsRes, unitsRes, deptSelRes, unitSelRes, areaSelRes, yearlyRes, topDetailRes, spotlightRes] = await Promise.all([
            API.get(`/patrol/my-schedule?month=${curMonth}&year=${curYear}`),
            currentUser.id ? API.get(`/employees/${encodeURIComponent(currentUser.id)}`).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
            API.get('/patrol/attendance-stats'),
            API.get(`/patrol/monthly-summary?year=${curYear}&month=${curMonth}`).catch(() => ({ data: [] })),
            API.get(`/patrol/my-monthly-plan?year=${curYear}&month=${curMonth}`).catch(() => ({ data: null })),
            API.get(`/patrol/my-self-patrol?year=${curYear}&month=${curMonth}`).catch(() => ({ data: null })),
            API.get('/master/areas').catch(() => ({ data: [] })),
            API.get('/master/departments').catch(() => ({ data: [] })),
            API.get('/master/safety-units').catch(() => ({ data: [] })),
            API.get('/settings/patrol_dept_stat_selection').catch(() => ({ value: null })),
            API.get('/settings/patrol_unit_stat_selection').catch(() => ({ value: null })),
            API.get('/settings/patrol_area_stat_selection').catch(() => ({ value: null })),
            API.get(`/patrol/my-yearly-stats?year=${curYear}`).catch(() => ({ data: null })),
            Promise.resolve({ data: null }),
            API.get('/settings/patrol_spotlight_mgmt_id').catch(() => ({ value: null })),
        ]);
        if (!request.isLatest()) return;

        let topDetailData = topDetailRes?.data || null;
        if (currentUser.id && planRes?.data) {
            topDetailData = (await API.get(`/patrol/attendance-detail?employeeId=${encodeURIComponent(currentUser.id)}&group=top_management&year=${curYear}`).catch(() => ({ data: null })))?.data || null;
        }
        if (!request.isLatest()) return;

        _currentEmployeeProfile = profileRes?.data || null;
        _monthlySummary = summaryRes.data || [];
        _myPlan         = planRes.data || null;
        _mySelfPatrol   = selfPatrolRes.data || null;
        _myTopManagementDetail = topDetailData;
        _patrolAreas    = areasRes.data || [];
        _masterDepts    = deptsRes.data || [];
        _masterUnits    = unitsRes.data || [];
        _myYearlyStats       = yearlyRes.data     || null;
        try { _deptStatSel = deptSelRes.value ? JSON.parse(deptSelRes.value) : null; } catch { _deptStatSel = null; }
        try { _unitStatSel = unitSelRes.value ? JSON.parse(unitSelRes.value) : null; } catch { _unitStatSel = null; }
        try { _areaStatSel = areaSelRes.value ? JSON.parse(areaSelRes.value) : null; } catch { _areaStatSel = null; }
        _spotlightMgmtId = spotlightRes.value || null;

        renderDashboard(container, {
            schedule: normalizeApiArray(scheduleRes),
            topManagementDetail: topDetailData,
            stats:    normalizeApiArray(statsRes),
            issues:   _allIssues,
            summary:  _monthlySummary,
        });

        setTimeout(() => initPromoCarousel(), 100);
        loadDashboardCharts();

        // Apply incoming filter from dashboard drill-down (overrides saved tab)
        let _dashFilterApplied = false;
        try {
            const _inFilter = JSON.parse(sessionStorage.getItem('pending_filter_patrol') || 'null');
            if (_inFilter) {
                sessionStorage.removeItem('pending_filter_patrol');
                if (_inFilter.tab) {
                    setTimeout(() => window.switchTab?.(_inFilter.tab), 0);
                    _dashFilterApplied = true;
                }
            }
        } catch (_) {}

        // Restore saved tab (patrol / overview / issues)
        if (!_dashFilterApplied) {
            const _savedTab = window._getTab?.('patrol', 'patrol');
            if (_savedTab && _savedTab !== 'patrol') {
                setTimeout(() => window.switchTab?.(_savedTab), 0);
            }
        }

        setTimeout(_openJohnnyImageRiskDraftPatrolIssue, 0);

    } catch (err) {
        if (!request.isLatest()) return;
        console.error(err);
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-[400px]">
              <div class="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              </div>
              <h3 class="text-lg font-bold text-slate-700">ไม่สามารถโหลดข้อมูลได้</h3>
              <p class="text-sm text-slate-400 mt-1 mb-4">ระบบขัดข้องชั่วคราว หรือ Server ยังไม่พร้อมใช้งาน</p>
              <button onclick="loadPatrolPage()" class="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style="background:linear-gradient(135deg,#059669,#0d9488)">ลองใหม่อีกครั้ง</button>
            </div>`;
    } finally {
        request.finish();
    }
}

// ─── Render Dashboard ─────────────────────────────────────────────────────────
function renderDashboard(container, data) {
    const today = new Date();
    const displayUser = patrolDisplayUser();
    const dateStr = today.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const issuesArray = _allIssues;
    const statsArray  = normalizeApiArray(data.stats);
    window._lastStatsData = data.stats; // cache for duplicate-checkin guard
    const myStats = statsArray.find(r => r.Name === displayUser.name || r.EmployeeID === displayUser.id || r.UserID === displayUser.id) || { Total: 0, Percent: 0 };

    // Smart CTA helpers
    const personalDetail = _myTopManagementDetail?.summary || null;
    const personalRecords = Array.isArray(_myTopManagementDetail?.records) ? _myTopManagementDetail.records : [];
    const todayCheckedIn = personalRecords.some(record => patrolDateOnly(record.PatrolDate) === patrolDateOnly(today))
        || (myStats.LastWalk ? patrolDateOnly(myStats.LastWalk) === patrolDateOnly(today) : false);
    const latestPersonalCheckin = personalRecords
        .filter(record => patrolDateOnly(record.PatrolDate) === patrolDateOnly(today))
        .sort((a, b) => String(b.CheckinAt || '').localeCompare(String(a.CheckinAt || '')))[0]?.CheckinAt
        || myStats.LastCheckinAt
        || '';
    const todaySessForCTA = _myPlan?.sessions?.find(s => new Date(s.PatrolDate).toDateString() === today.toDateString()) || null;
    const nextSess = _myPlan?.sessions?.find(s => new Date(s.PatrolDate) > today) || null;
    const nextDaysLeft = nextSess ? Math.ceil((new Date(nextSess.PatrolDate) - today) / 86400000) : null;
    const currentMonthScheduleRows = Array.isArray(data.schedule) ? data.schedule : [];
    const currentScheduleIds = new Set(currentMonthScheduleRows.map(item => String(item.ScheduledSessionID || patrolSessionId(item) || '')));
    const upcomingTopScheduleRows = (Array.isArray(data.topManagementDetail?.schedule) ? data.topManagementDetail.schedule : [])
        .filter(item => {
            const id = String(item.ScheduledSessionID || patrolSessionId(item) || '');
            const date = patrolDateOnly(item.PatrolDate || item.ScheduledDate || item.date);
            return id && !currentScheduleIds.has(id) && date >= patrolDateOnly(today) && !patrolSessionCompleted(item) && !patrolSessionLeaveBlocking(item);
        })
        .sort((a, b) => patrolDateOnly(a.PatrolDate || a.ScheduledDate || a.date).localeCompare(patrolDateOnly(b.PatrolDate || b.ScheduledDate || b.date)))
        .slice(0, 2)
        .map(item => ({
            ...item,
            PatrolDate: item.PatrolDate || item.ScheduledDate || item.date,
            ScheduledDate: item.ScheduledDate || item.PatrolDate || item.date,
            ScheduledSessionID: item.ScheduledSessionID || patrolSessionId(item),
            TeamName: item.TeamName || item.teamName || 'Top & Management',
            AreaName: item.AreaName || item.areaName || item.Area || '',
            AreaCode: item.AreaCode || item.areaCode || '',
            PatrolRound: item.PatrolRound || item.patrolRound || item.round || '',
            completionStatus: item.completionStatus || item.status || 'upcoming',
        }));
    const normalScheduleRows = [...currentMonthScheduleRows, ...upcomingTopScheduleRows];
    _patrolGreenHasNormalSchedule = normalScheduleRows.length > 0;
    const useSelfPatrolGreen = patrolUseSelfPatrolGreenFallback();
    const greenSelfScheduleItems = useSelfPatrolGreen ? patrolSelfScheduledMonthItems() : [];
    const greenSelfOpenSchedule = useSelfPatrolGreen ? patrolSelfScheduledMonthOpenItems() : [];
    const greenSelfMakeupSchedule = useSelfPatrolGreen ? patrolSelfMakeupScheduleItems() : [];
    const greenSelfActionableCount = patrolIsFlexibleSelfPatrol()
        ? greenSelfOpenSchedule.length
        : (greenSelfOpenSchedule.length + greenSelfMakeupSchedule.length);
    const greenSelfProgress = useSelfPatrolGreen ? patrolSelfPatrolProgress() : null;
    const greenSelfNext = greenSelfOpenSchedule[0] || null;
    const greenSelfMakeupNext = greenSelfMakeupSchedule[0] || null;
    const greenSelfModeLabel = patrolIsFlexibleSelfPatrol() ? 'ยืดหยุ่น' : 'ตามปฏิทิน';
    const openIssues   = issuesArray.filter(i => i.CurrentStatus === 'Open').length;
    const tempIssues   = issuesArray.filter(i => i.CurrentStatus === 'Temporary').length;
    const closedIssues = issuesArray.filter(i => i.CurrentStatus === 'Closed').length;
    const total = issuesArray.length;

    // Rank tiers
    const walks = myStats.Total || 0;
    const rankTiers = [
        { title: 'Safety Inspector',  min: 0,  max: 5,  color: '#64748b', bg: '#f1f5f9', nextLabel: 'Senior Inspector', needed: 6 },
        { title: 'Senior Inspector',  min: 6,  max: 15, color: '#6366f1', bg: '#eef2ff', nextLabel: 'Safety Master',    needed: 16 },
        { title: 'Safety Master',     min: 16, max: 999,color: '#f59e0b', bg: '#fffbeb', nextLabel: null,                needed: null },
    ];
    const rank = rankTiers.find(r => walks >= r.min && walks <= r.max) || rankTiers[0];
    const rankPct = rank.needed ? Math.min(Math.round((walks / rank.needed) * 100), 100) : 100;
    // ── Per-tab hero stats ───────────────────────────────────────────────────
    const _yearlyCount  = Number(personalDetail?.acceptedCoverageToDate ?? _myYearlyStats?.yearlyCount ?? walks);
    const _yearlyDue    = Number(personalDetail?.requiredToDate ?? 0);
    const _yearlyTarget = Number(personalDetail?.yearlyTarget ?? _myYearlyStats?.yearlyTarget ?? 0) || null;
    const _acceptedPct  = Number(personalDetail?.acceptedCoverageToDatePct ?? myStats.Percent ?? 0);
    const _personalStats = [
        { label: 'รวมปีนี้',         val: _yearlyDue ? `${_yearlyCount}/${_yearlyDue}${_yearlyTarget ? ` (${_yearlyTarget})` : ''}` : (_yearlyTarget ? `${_yearlyCount} (${_yearlyTarget})` : _yearlyCount), color: '#6ee7b7' },
        { label: 'Accepted %',       val: `${_acceptedPct}%`,                                                        color: '#6ee7b7' },
        { label: 'ทีมของฉัน',        val: _myPlan ? _myPlan.team.name.replace(/^ทีม\s*/,'') : rank.title,              color: '#a5f3fc' },
        { label: 'สถานะเดือนนี้',    val: _myPlan ? `${_myPlan.compliance.attended}/${_myPlan.compliance.required} รอบ` : '—',
          color: _myPlan?.compliance?.done ? '#6ee7b7' : '#fcd34d' },
    ];
    const _issueStats = [
        { label: 'รอแก้ไข',    val: openIssues,               color: openIssues > 0 ? '#fca5a5' : '#6ee7b7' },
        { label: 'แก้ชั่วคราว', val: tempIssues,               color: tempIssues > 0 ? '#fed7aa' : '#6ee7b7' },
        { label: 'เสร็จสิ้น',   val: closedIssues,             color: '#6ee7b7' },
        { label: 'ทั้งหมด',     val: total,                    color: '#a5f3fc' },
    ];

    function renderStatsStrip(stats) {
        const el = document.getElementById('hero-stats-strip');
        if (!el) return;
        el.innerHTML = stats.map(s => `
        <div class="rounded-xl px-4 py-3 text-center transition-all duration-300" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
          <p class="text-xl font-bold truncate" style="color:${s.color}">${s.val}</p>
          <p class="text-[11px] mt-0.5 text-white/70">${s.label}</p>
        </div>`).join('');
    }

    function getOverviewHeroStats() {
        if (!_overviewData) return [
            { label: 'ผู้เข้าร่วม',      val: '—', color: '#a5f3fc' },
            { label: 'เซสชันทั้งหมด',    val: '—', color: '#a5f3fc' },
            { label: 'เข้าร่วมจริง',     val: '—', color: '#6ee7b7' },
            { label: 'อัตราเข้าร่วม',    val: '—', color: '#6ee7b7' },
        ];
        const s = _overviewData.summary;
        const acceptedTotal = Number(s.acceptedCoverageToDateTotal ?? s.totalAttended ?? 0);
        const acceptedTotalPct = Number(s.acceptedCoverageToDatePct ?? s.percent ?? 0);
        s.totalAttended = acceptedTotal;
        s.percent = acceptedTotalPct;
        return [
            { label: 'ผู้เข้าร่วม',      val: _overviewData.members.length, color: '#a5f3fc' },
            { label: 'เซสชันทั้งหมด',    val: s.totalSessions,              color: '#a5f3fc' },
            { label: 'เข้าร่วมจริง',     val: s.totalAttended,              color: '#6ee7b7' },
            { label: 'อัตราเข้าร่วม',    val: `${s.percent}%`,              color: s.percent >= 80 ? '#6ee7b7' : '#fcd34d' },
        ];
    }

    // Tabs state
    window.switchTab = function(tab) {
        window._saveTab?.('patrol', tab);
        ['patrol','overview','issues'].forEach(t => {
            const btn = document.getElementById(`btn-tab-${t}`);
            const content = document.getElementById(`content-${t}`);
            const isActive = t === tab;
            if (btn) {
                btn.className = isActive
                    ? 'flex-1 py-2.5 text-sm font-bold text-white rounded-xl shadow-sm flex justify-center items-center gap-2 transition-all'
                    : 'flex-1 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 rounded-xl transition-all flex justify-center items-center gap-2';
                btn.style.background = isActive ? 'linear-gradient(135deg,#059669,#0d9488)' : '';
            }
            if (content) {
                content.classList.toggle('hidden', !isActive);
                if (isActive) content.classList.add('animate-fade-in');
            }
        });
        // Update hero stats per tab
        if (tab === 'patrol')   renderStatsStrip(_personalStats);
        else if (tab === 'overview') renderStatsStrip(getOverviewHeroStats());
        else if (tab === 'issues') {
            renderStatsStrip(patrolIssueHeroStats());
            if (!_issuesLoaded) {
                ensurePatrolIssuesLoaded()
                    .then(() => {
                        renderStatsStrip(patrolIssueHeroStats());
                        _renderIssueSubview();
                        _renderIssueRegistry();
                        renderAreaStats();
                        renderDeptStats();
                        renderStopRankStats();
                        renderRankStopSummary();
                    })
                    .catch(err => showToast(getReadableError(err, 'Unable to load issue data'), 'error'));
            } else {
                _renderIssueSubview();
                _renderIssueRegistry();
                if (_issueSubTab === 'stats') {
                    renderAreaStats();
                    renderDeptStats();
                    renderStopRankStats();
                    renderRankStopSummary();
                }
            }
        }
        // FAB: show only on issues tab
        const fab = document.getElementById('issue-fab');
        if (fab) fab.classList.toggle('hidden', tab !== 'issues');
        // lazy-load overview data on first switch
        if (tab === 'overview' && !_overviewData) {
            window._svLoaded = false;
            loadOverview(_overviewYear);
            // activate mgmt sub-tab by default
            setTimeout(() => window._switchOvSub?.('mgmt'), 0);
        }
    };
    // expose for loadOverview to refresh hero stats when overview is active
    window._refreshOverviewHero = () => renderStatsStrip(getOverviewHeroStats());

    // Sub-tab switcher for overview tab
    window._switchOvSub = function(sub) {
        const mgmtDiv  = document.getElementById('ov-sub-mgmt');
        const svDiv    = document.getElementById('ov-sub-sv');
        const btnMgmt  = document.getElementById('ov-sub-btn-mgmt');
        const btnSv    = document.getElementById('ov-sub-btn-sv');
        if (!mgmtDiv || !svDiv) return;

        const isMgmt = sub === 'mgmt';
        mgmtDiv.classList.toggle('hidden', !isMgmt);
        svDiv.classList.toggle('hidden',   isMgmt);

        // Style active/inactive buttons
        if (btnMgmt) {
            btnMgmt.removeAttribute('style');
            if (isMgmt) { btnMgmt.style.background = 'linear-gradient(135deg,#059669,#0d9488)'; btnMgmt.className = 'flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all text-white'; }
            else         { btnMgmt.className = 'flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all text-slate-500 hover:bg-slate-50'; }
        }
        if (btnSv) {
            btnSv.removeAttribute('style');
            if (!isMgmt) { btnSv.style.background = 'linear-gradient(135deg,#d97706,#f59e0b)'; btnSv.className = 'flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all text-white'; }
            else          { btnSv.className = 'flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all text-slate-500 hover:bg-slate-50'; }
        }

        // Lazy-load supervisor data on first switch
        if (!isMgmt && !window._svLoaded) {
            const now = new Date();
            const yr  = document.getElementById('sv-year-select')?.value || now.getFullYear();
            loadSupervisorOverview(parseInt(yr));
            window._svLoaded = true;
        }
        // Re-render charts after making visible (canvas needs to be visible to render correctly)
        if (isMgmt  && _overviewData) renderOverviewChart(_overviewData.summary.percent);
    };

    // Filter handler for Sec. & Supervisor sub-tab (annual view)
    window.switchSvFilter = function() {
        const yr = document.getElementById('sv-year-select')?.value;
        if (yr) { window._svLoaded = true; loadSupervisorOverview(parseInt(yr)); }
    };

    container.innerHTML = `
    <div class="pb-20 animate-fade-in">

      <!-- ═══ HERO BANNER ═══ -->
      <div class="relative overflow-hidden rounded-2xl mb-6" data-patrol-card-image="patrol-hero-summary" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
        <div class="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%"><defs><pattern id="p-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#p-dots)"/></svg>
        </div>
        <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

        <div class="relative z-10 p-6">
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse inline-block"></span>
                  System Live
                </span>
              </div>
              <h1 class="text-2xl font-bold text-white">Safety Patrol System</h1>
              <p class="text-sm mt-1" style="color:rgba(167,243,208,0.8)">${dateStr} · ${displayUser.name}</p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0" data-patrol-card-ignore>
              ${false ? `
              <button onclick="openThresholdSettings()" title="ตั้งค่าเกณฑ์ผ่านตามตำแหน่ง" class="p-2.5 rounded-xl bg-white/15 border border-white/20 text-white hover:bg-white/25 transition-colors flex items-center gap-1.5 text-xs font-semibold">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
                เกณฑ์ผ่าน
              </button>` : ''}
              <button onclick="loadPatrolPage()" class="p-2.5 rounded-xl bg-white/15 border border-white/20 text-white hover:bg-white/25 transition-colors flex-shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              </button>
            </div>
          </div>

          <!-- Dynamic stats strip — updated by switchTab -->
          <div id="hero-stats-strip" class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"></div>
        </div>
      </div>

      <!-- ═══ TABS ═══ -->
      <div class="bg-slate-100 p-1 rounded-xl flex gap-1 mb-6" data-patrol-card-ignore>
        <button id="btn-tab-patrol" onclick="switchTab('patrol')"
          class="flex-1 py-2.5 text-sm font-bold text-white rounded-xl shadow-sm flex justify-center items-center gap-2 transition-all"
          style="background:linear-gradient(135deg,#059669,#0d9488)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          ส่วนตัว
        </button>
        <button id="btn-tab-overview" onclick="switchTab('overview')"
          class="flex-1 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 rounded-xl transition-all flex justify-center items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
          ทีม & ภาพรวม
        </button>
        <button id="btn-tab-issues" onclick="switchTab('issues')"
          class="flex-1 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 rounded-xl transition-all flex justify-center items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          ปัญหา
          ${openIssues > 0 ? `<span class="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white bg-red-500">${openIssues}</span>` : ''}
        </button>
      </div>

      <div id="content-patrol" class="space-y-5 animate-fade-in">

      <!-- Quick Actions (mobile only) -->
      <div class="md:hidden grid grid-cols-4 gap-2">
        <button onclick="openPersonalPatrolCheckin()"
          class="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl text-center transition-all active:scale-95"
          style="background:linear-gradient(135deg,#064e3b,#065f46)">
          <svg class="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
          <span class="text-[10px] font-bold text-white leading-tight">เช็คอิน</span>
        </button>
        <button onclick="switchTab('overview')"
          class="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl text-center bg-white border border-slate-100 transition-all active:scale-95">
          <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          <span class="text-[10px] font-bold text-slate-500 leading-tight">ภาพรวม</span>
        </button>
        <button onclick="openIssueForm()"
          class="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl text-center bg-white border border-slate-100 transition-all active:scale-95">
          <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <span class="text-[10px] font-bold text-slate-500 leading-tight">รายงาน</span>
        </button>
        <button onclick="switchTab('issues')"
          class="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl text-center bg-white border border-slate-100 transition-all active:scale-95">
          <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
          <span class="text-[10px] font-bold text-slate-500 leading-tight">ปัญหา</span>
        </button>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div class="xl:col-span-2 space-y-5">

          <!-- Check-in Card -->
          <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100" data-patrol-card-image="patrol-personal-checkin" style="box-shadow:0 4px 24px rgba(5,150,105,0.07)">
            <div class="flex flex-col md:flex-row">
              <div class="md:w-5/12 p-5 flex flex-col justify-between relative overflow-hidden" style="background:linear-gradient(135deg,#064e3b,#065f46)">
                <div class="absolute -right-6 -top-6 w-28 h-28 rounded-full opacity-10" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>
                <div class="relative z-10 flex-1">
                  ${_myPlan ? `
                  <!-- My Plan -->
                  <div class="flex items-center gap-2 mb-3">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${_myPlan.team.color}"></span>
                    <span class="text-xs font-bold text-white/90">${_myPlan.team.name}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold ${_myPlan.team.group==='A'?'bg-blue-400/30 text-blue-200':'bg-purple-400/30 text-purple-200'}">กลุ่ม ${_myPlan.team.group}</span>
                  </div>
                  <div class="space-y-1.5 mb-4">
                    ${_myPlan.sessions.length === 0
                      ? `<p class="text-xs text-white/50 italic">ยังไม่มี Sessions เดือนนี้</p>`
                      : _myPlan.sessions.map(s => {
                          const d = new Date(s.PatrolDate);
                          const isRequired = _myPlan.required.some(r => patrolSessionId(r) === patrolSessionId(s));
                          const completed = patrolSessionCompleted(s);
                          const makeup = patrolSessionMakeup(s);
                          const isToday = d.toDateString() === new Date().toDateString();
                          const area = s.AreaCode || s.AreaName || '—';
                          return `<div class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${isToday ? 'bg-white/20' : 'bg-white/8'}" style="${isToday?'background:rgba(255,255,255,0.18)':'background:rgba(255,255,255,0.07)'}">
                            <div class="text-center flex-shrink-0 w-8">
                              <div class="text-sm font-bold ${isToday?'text-emerald-300':'text-white'}">${d.getDate()}</div>
                              <div class="text-[9px] text-white/50">${d.toLocaleString('th-TH',{month:'short'})}</div>
                            </div>
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-1.5">
                                <span class="text-[10px] font-bold text-white/80">${area}</span>
                                <span class="text-[9px] px-1 py-0.5 rounded bg-white/15 text-white/70">รอบ ${s.PatrolRound}</span>
                                ${completed ? `<span class="text-[8px] text-emerald-200 font-bold">${makeup ? 'Makeup' : 'Done'}</span>` : ''}
                                ${!isRequired ? `<span class="text-[8px] text-white/40 italic">ไม่บังคับ</span>` : ''}
                              </div>
                            </div>
                            ${isToday ? `<span class="text-[9px] font-bold text-emerald-300 flex-shrink-0">วันนี้</span>` : ''}
                          </div>`;
                        }).join('')}
                  </div>
                  <div class="text-[10px] text-white/50 mb-3">
                    ${{'top':'Top Mgmt','committee':'คปอ.','management':'Management'}[_myPlan.patrolType]||''} ·
                    เดิน ${_myPlan.compliance.attended}/${_myPlan.compliance.required} รอบ
                  </div>
                  ` : useSelfPatrolGreen ? `
                  <div class="flex items-center gap-2 mb-3">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/30">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse inline-block"></span>
                      งานตรวจของฉัน
                    </span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-400/25 text-amber-100">${greenSelfModeLabel}</span>
                  </div>
                  <h3 class="text-lg font-bold text-white">บันทึกการเดินตรวจ</h3>
                  <p class="text-xs mt-2 text-white/60">Sec. & Supervisor</p>
                  <div class="mt-4 space-y-2">
                    <div class="flex items-center justify-between text-[10px] text-white/70">
                      <span>ความคืบหน้าเดือนนี้</span>
                      <span class="font-bold text-white">${greenSelfProgress.completed}/${greenSelfProgress.target || 0} ครั้ง</span>
                    </div>
                    <div class="w-full bg-white/15 rounded-full h-2 overflow-hidden">
                      <div class="h-full rounded-full transition-all duration-700" style="width:${greenSelfProgress.pct}%;background:${greenSelfProgress.done ? 'linear-gradient(90deg,#6ee7b7,#34d399)' : 'linear-gradient(90deg,#fcd34d,#f59e0b)'}"></div>
                    </div>
                    <p class="text-[10px] text-white/45">${greenSelfActionableCount
                        ? `${greenSelfOpenSchedule.length ? 'ปกติ ' + greenSelfOpenSchedule.length + ' รายการ' : ''}${greenSelfOpenSchedule.length && greenSelfMakeupSchedule.length ? ' · ' : ''}${greenSelfMakeupSchedule.length ? 'เดินซ่อม ' + greenSelfMakeupSchedule.length + ' รายการ' : ''}`
                        : 'ยังไม่มีรอบที่เปิดให้บันทึก'}</p>
                  </div>
                  ` : `
                  <div class="flex items-center gap-2 mb-3">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/30">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse inline-block"></span>
                      พร้อมปฏิบัติงาน
                    </span>
                  </div>
                  <h3 class="text-lg font-bold text-white">บันทึกการเดินตรวจ</h3>
                  <p class="text-xs mt-2 text-white/50">ยังไม่ได้รับมอบหมายทีม</p>
                  `}
                </div>
                ${useSelfPatrolGreen
                  ? `<button onclick="openPersonalPatrolCheckin()" ${greenSelfActionableCount ? '' : 'disabled'} class="relative z-10 mt-3 w-full py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-55 disabled:cursor-not-allowed" style="background:rgba(255,255,255,0.95);color:#065f46">
                      ${greenSelfActionableCount ? 'บันทึกการเดินตรวจ' : 'ไม่มีรอบที่ต้องบันทึก'}
                    </button>
                    ${greenSelfNext ? `<p class="relative z-10 mt-1.5 text-center text-[10px]" style="color:rgba(255,255,255,0.45)">รอบถัดไป ${escHtml(patrolScheduleDate(greenSelfNext) || '-')}</p>` : greenSelfMakeupNext ? `<p class="relative z-10 mt-1.5 text-center text-[10px]" style="color:rgba(255,255,255,0.45)">มีรอบเดินซ่อม ${escHtml(patrolScheduleDate(greenSelfMakeupNext) || '-')}</p>` : ''}`
                  : todayCheckedIn
                  ? `<div class="relative z-10 mt-3 w-full py-2.5 rounded-xl font-bold text-sm text-center flex items-center justify-center gap-2" style="background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.2)">
                      <svg class="w-4 h-4 text-emerald-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                      เช็คอินแล้ว${patrolCheckinTime(latestPersonalCheckin) ? ` · ${patrolCheckinTime(latestPersonalCheckin)} น.` : ''}
                    </div>
                    <button onclick="openPersonalPatrolCheckin()" class="relative z-10 mt-2 w-full py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.5)">
                      บันทึกอีกครั้ง
                    </button>`
                  : todaySessForCTA
                  ? `<button onclick="openPersonalPatrolCheckin()" class="relative z-10 mt-3 w-full py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] hover:shadow-lg flex items-center justify-center gap-2" style="background:rgba(255,255,255,0.95);color:#065f46">
                      <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
                      เช็คอินเดินตรวจ วันนี้
                    </button>`
                  : nextSess
                  ? `<button onclick="openPersonalPatrolCheckin()" class="relative z-10 mt-3 w-full py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] hover:shadow-lg" style="background:rgba(255,255,255,0.95);color:#065f46">
                      เช็คอินเดินตรวจ
                    </button>
                    <p class="relative z-10 mt-1.5 text-center text-[10px]" style="color:rgba(255,255,255,0.45)">
                      ครั้งถัดไป ${new Date(nextSess.PatrolDate).toLocaleDateString('th-TH',{day:'numeric',month:'short'})} · อีก ${nextDaysLeft} วัน
                    </p>`
                  : `<button onclick="openPersonalPatrolCheckin()" class="relative z-10 mt-3 w-full py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] hover:shadow-lg" style="background:rgba(255,255,255,0.95);color:#065f46">
                      เช็คอินเดินตรวจ
                    </button>`
                }
                <button type="button" onclick="window.openPatrolLeavePicker()"
                  class="relative z-10 mt-2 w-full py-2.5 rounded-xl text-sm font-black transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 002 2v12a2 2 0 002 2z"/></svg>
                  ลา Safety Patrol
                </button>
              </div>
              <div class="md:w-7/12 flex flex-col bg-white">
                <div class="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h3 class="font-bold text-slate-700 text-sm">ตารางงาน (My Schedule)</h3>
                  <span class="text-[10px] text-slate-400">${today.toLocaleString('th-TH',{month:'long',year:'numeric'})}${upcomingTopScheduleRows.length ? ` · รอบถัดไป ${upcomingTopScheduleRows.length}` : ''}</span>
                </div>
                <div class="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50" style="max-height:200px">
                  ${normalScheduleRows.length > 0 ? normalScheduleRows.map(item => {
                    const d     = new Date(item.PatrolDate || item.ScheduledDate);
                    const isTd  = d.toDateString() === today.toDateString();
                    const completed = patrolSessionCompleted(item);
                    const isLeave = patrolSessionLeave(item);
                    const isLeavePending = patrolSessionLeavePending(item);
                    const actualDate = patrolSessionActualDate(item);
                    const makeup = patrolSessionMakeup(item);
                    // หา area info จาก monthly-summary (match วันที่ + TeamID หรือ TeamName)
                    const sumItem = _monthlySummary.find(s =>
                        new Date(s.ScheduledDate || s.PatrolDate).toDateString() === d.toDateString() &&
                        (s.TeamID === item.TeamID || s.TeamName === item.TeamName)
                    ) || item;
                    const areaLabel  = sumItem.AreaName || sumItem.AreaCode || 'Factory Area';
                    const teamColor  = sumItem.TeamColor || '#6366f1';
                    const round      = sumItem.PatrolRound;
                    const id = item.ScheduledSessionID || patrolSessionId(item);
                    const schedDate = patrolDateOnly(item.PatrolDate || item.ScheduledDate || item.date);
                    const statusText = isLeave ? 'Leave' : isLeavePending ? 'Pending Leave' : completed ? (makeup ? 'Makeup' : 'Completed') : (item.completionStatus === 'missing' ? 'Missing' : 'Pending');
                    const sc = isLeave ? 'bg-sky-100 text-sky-700' : isLeavePending ? 'bg-indigo-100 text-indigo-700' : completed ? 'bg-emerald-100 text-emerald-700' : item.completionStatus === 'missing' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700';
                    return `<div class="flex items-center px-4 py-3 hover:bg-slate-50 transition-colors ${isTd ? 'bg-emerald-50/40' : ''}">
                      <div class="w-10 text-center border-r border-slate-100 pr-3 mr-3 flex-shrink-0">
                        <div class="text-lg font-bold ${isTd ? 'text-emerald-600' : 'text-slate-700'}">${d.getDate()}</div>
                        <div class="text-[9px] font-bold text-slate-400 uppercase">${d.toLocaleString('en-US',{month:'short'})}</div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-0.5">
                          <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${teamColor}"></span>
                          <p class="text-xs font-bold text-slate-800 truncate">${item.TeamName}</p>
                        </div>
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="text-[9px] font-semibold text-slate-500">${areaLabel}</span>
                          ${round ? `<span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">รอบ ${round}</span>` : ''}
                          <span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full ${sc}">${statusText}</span>
                        </div>
                        ${completed && actualDate && actualDate !== patrolDateOnly(item.PatrolDate || item.ScheduledDate) ? `<p class="text-[9px] text-violet-500 mt-1">Actual: ${escHtml(actualDate)}</p>` : ''}
                        ${!completed && !isLeave && !isLeavePending ? `<button type="button" onclick="openPatrolLeaveModal('top_management', ${_patrolJsArg(id)}, ${_patrolJsArg(schedDate)}, ${_patrolJsArg(areaLabel)})" class="mt-1 px-2 py-1 rounded-lg bg-sky-50 text-[10px] font-black text-sky-700 border border-sky-100 hover:bg-sky-100">ลา</button>` : ''}
                      </div>
                      ${isTd ? `<span class="flex-shrink-0 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">วันนี้</span>` : ''}
                    </div>`;
                  }).join('') : useSelfPatrolGreen && greenSelfScheduleItems.length ? greenSelfScheduleItems.map(item => {
                    const date = patrolScheduleDate(item);
                    const d = date ? new Date(date) : today;
                    const isTd = date && d.toDateString() === today.toDateString();
                    const completed = patrolSessionCompleted(item);
                    const isLeave = patrolSessionLeave(item);
                    const isLeavePending = patrolSessionLeavePending(item);
                    const locked = String(item.status || '').toLowerCase() === 'locked';
                    const makeup = patrolSessionMakeup(item);
                    const areaLabel = patrolScheduleArea(item) || (patrolIsFlexibleSelfPatrol() ? 'Flexible area' : 'Self-Patrol');
                    const round = patrolScheduleRound(item);
                    const statusText = isLeave ? 'Leave' : isLeavePending ? 'Pending Leave' : completed ? (makeup ? 'Makeup' : 'Completed') : locked ? 'Locked' : 'Open';
                    const sc = isLeave ? 'bg-sky-100 text-sky-700' : isLeavePending ? 'bg-indigo-100 text-indigo-700' : completed ? 'bg-emerald-100 text-emerald-700' : locked ? 'bg-slate-100 text-slate-400' : 'bg-amber-100 text-amber-700';
                    const id = item.ScheduledSessionID || patrolSessionId(item);
                    return `<button type="button" ${locked ? 'disabled' : `onclick="openPersonalPatrolCheckin(${_patrolJsArg(id)}, 'self')"`} class="w-full flex items-center text-left px-4 py-3 hover:bg-emerald-50/40 transition-colors ${isTd ? 'bg-emerald-50/40' : ''} disabled:cursor-not-allowed disabled:hover:bg-transparent">
                      <div class="w-10 text-center border-r border-slate-100 pr-3 mr-3 flex-shrink-0">
                        <div class="text-lg font-bold ${isTd ? 'text-emerald-600' : 'text-slate-700'}">${date ? d.getDate() : '-'}</div>
                        <div class="text-[9px] font-bold text-slate-400 uppercase">${date ? d.toLocaleString('en-US',{month:'short'}) : ''}</div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-0.5">
                          <span class="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"></span>
                          <p class="text-xs font-bold text-slate-800 truncate">งานตรวจของฉัน</p>
                        </div>
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="text-[9px] font-semibold text-slate-500">${escHtml(areaLabel)}</span>
                          ${round ? `<span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">รอบ ${escHtml(round)}</span>` : ''}
                          <span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full ${sc}">${statusText}</span>
                        </div>
                        ${completed && patrolSessionActualDate(item) && patrolSessionActualDate(item) !== date ? `<p class="text-[9px] text-violet-500 mt-1">Actual: ${escHtml(patrolSessionActualDate(item))}</p>` : ''}
                      </div>
                      ${isTd ? `<span class="flex-shrink-0 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">วันนี้</span>` : ''}
                    </button>`;
                  }).join('') : `<div class="flex flex-col items-center justify-center py-8 text-slate-400">
                    <svg class="w-8 h-8 text-slate-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <p class="text-xs">ไม่มีตารางงานเดือนนี้</p>
                  </div>`}
                </div>
              </div>
            </div>
          </div>

          <!-- Mini Calendar -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div class="flex justify-between items-center mb-4">
              <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#ecfdf5">
                  <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>
                ปฏิทินประจำเดือน
              </h3>
              ${getCalendarLegendHTML()}
            </div>
            <div class="grid grid-cols-7 gap-1 text-center mb-2">
              ${['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=>`<div class="text-[9px] font-bold text-slate-400">${d}</div>`).join('')}
            </div>
            <div class="grid grid-cols-7 gap-1 text-center">${generateMiniCalendarHTML(data.schedule)}</div>
          </div>

          <!-- C: Next Patrol Callout -->
          ${nextSess ? (() => {
            const nd = new Date(nextSess.PatrolDate);
            const ndStr = nd.toLocaleDateString('th-TH', { weekday:'long', day:'numeric', month:'long' });
            const area  = nextSess.AreaCode || nextSess.AreaName || 'Factory Area';
            const urgentCls = nextDaysLeft <= 3 ? 'border-amber-200 bg-amber-50' : 'border-emerald-100 bg-emerald-50/40';
            const urgentDot = nextDaysLeft <= 3 ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse';
            const urgentText= nextDaysLeft <= 3 ? 'text-amber-700' : 'text-emerald-700';
            return `
          <div class="flex items-center gap-3 px-4 py-3 rounded-xl border ${urgentCls}">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#059669,#0d9488)">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-bold text-slate-700">เดินตรวจครั้งถัดไป</p>
              <p class="text-[11px] text-slate-500 truncate">${ndStr} · ${area} · รอบ ${nextSess.PatrolRound || '—'}</p>
            </div>
            <div class="text-right flex-shrink-0">
              <p class="text-lg font-bold ${urgentText}">${nextDaysLeft}</p>
              <p class="text-[10px] text-slate-400 -mt-0.5">วัน</p>
            </div>
            <span class="w-2 h-2 rounded-full flex-shrink-0 ${urgentDot}"></span>
          </div>`;
          })() : ''}

          <!-- A: Month Dot Tracker -->
          ${_myYearlyStats?.monthlyBreakdown ? (() => {
            const curM = new Date().getMonth() + 1;
            const curY = new Date().getFullYear();
            const bd   = _myYearlyStats.monthlyBreakdown;
            const monthNames = ['ม.ค','ก.พ','มี.ค','เม.ย','พ.ค','มิ.ย','ก.ค','ส.ค','ก.ย','ต.ค','พ.ย','ธ.ค'];
            const maxDots = 4; // max dots to show per month
            return `
          <div class="ds-filter-bar" data-patrol-card-image="patrol-year-activity-tracker">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-bold text-slate-700 flex items-center gap-2">
                <div class="w-5 h-5 rounded-lg flex items-center justify-center" style="background:#ecfdf5">
                  <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                </div>
                กิจกรรมตลอดปี ${_myYearlyStats.year || curY}
              </h3>
              <div class="flex items-center gap-3 text-[9px] text-slate-400">
                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>เข้าร่วม</span>
                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-slate-200 inline-block"></span>พลาด</span>
              </div>
            </div>
            <div class="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              ${bd.map(m => {
                const isFuture = _myYearlyStats.year === curY && m.month > curM;
                const isCurrent = _myYearlyStats.year === curY && m.month === curM;
                const dotCount  = Math.min(m.attended, maxDots);
                const missCount = isFuture ? 0 : Math.min(Math.max((m.scheduled || 0) - m.attended, 0), maxDots - dotCount);
                const dots = Array(dotCount).fill('<span class="w-2 h-2 rounded-full bg-emerald-400 inline-block flex-shrink-0"></span>').join('')
                           + Array(missCount).fill('<span class="w-2 h-2 rounded-full bg-slate-200 inline-block flex-shrink-0"></span>').join('');
                const hasActivity = m.attended > 0 || (m.scheduled > 0 && !isFuture);
                const cellBg = isCurrent ? 'ring-2 ring-emerald-400 ring-offset-1' : '';
                return `<div class="flex flex-col items-center gap-1 p-1.5 rounded-lg ${isFuture ? 'opacity-35' : hasActivity ? 'bg-emerald-50/60' : 'bg-slate-50'} ${cellBg}" title="${monthNames[m.month-1]}: เข้าร่วม ${m.attended} ครั้ง${m.scheduled ? ' / กำหนด ' + m.scheduled + ' ครั้ง' : ''}">
                  <span class="text-[9px] font-bold ${isCurrent ? 'text-emerald-600' : 'text-slate-400'}">${monthNames[m.month-1]}</span>
                  <div class="flex flex-wrap gap-0.5 justify-center min-h-[12px]">
                    ${dots || (isFuture ? '' : '<span class="w-2 h-2 rounded-full bg-slate-100 inline-block"></span>')}
                  </div>
                  <span class="text-[9px] font-bold ${m.attended > 0 ? 'text-emerald-600' : isFuture ? 'text-slate-300' : 'text-slate-300'}">${isFuture ? '' : m.attended || '0'}</span>
                </div>`;
              }).join('')}
            </div>
          </div>`;
          })() : ''}

          <!-- Monthly Session Tracker -->
          ${(() => {
            const sessions       = _myPlan?.sessions || [];
            const required       = _myPlan?.required || [];
            const reqIds         = new Set(required.map(r => patrolSessionId(r)));
            const attendedDates  = new Set(_myPlan?.attendanceDates || []);
            const today          = new Date();
            const todayStr       = today.toDateString();
            const monthLabel     = today.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
            const attended       = _myPlan?.compliance?.attended ?? 0;
            const total          = _myPlan?.compliance?.required ?? 0;
            const pct            = total > 0 ? Math.min(Math.round((attended / total) * 100), 100) : 0;
            const barColor       = pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#f43f5e';
            if (!sessions.length) return `
          <div class="ds-section p-5" data-patrol-card-image="patrol-monthly-session-tracker-empty">
            <div class="flex items-center gap-2 mb-3">
              <div class="w-6 h-6 rounded-lg flex items-center justify-center" style="background:#ecfdf5">
                <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <h3 class="text-xs font-bold text-slate-700">เซสชันเดือนนี้ · ${monthLabel}</h3>
            </div>
            <div class="text-center py-6 text-slate-300">
              <svg class="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <p class="text-xs font-medium text-slate-400">ยังไม่มีตารางงานเดือนนี้</p>
            </div>
          </div>`;
            return `
          <div class="ds-table-wrap" data-patrol-card-image="patrol-monthly-session-tracker">
            <!-- Header -->
            <div class="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
              <h3 class="text-xs font-bold text-slate-700 flex items-center gap-2">
                <div class="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style="background:#ecfdf5">
                  <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>
                เซสชันเดือนนี้ · ${monthLabel}
              </h3>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${pct >= 100 ? 'bg-emerald-100 text-emerald-700' : pct >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}">${attended}/${total} รอบ</span>
            </div>
            <!-- Progress bar -->
            <div class="px-4 pt-2.5 pb-1">
              <div class="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full rounded-full transition-all duration-700" style="width:${pct}%;background:${barColor}"></div>
              </div>
            </div>
            <!-- Session list -->
            <div class="divide-y divide-slate-50 px-1 pb-1">
              ${sessions.map(s => {
                const d        = new Date(s.PatrolDate);
                const dateKey  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const dStr     = d.toLocaleDateString('th-TH', { weekday:'short', day:'numeric', month:'short' });
                const isToday  = d.toDateString() === todayStr;
                const isPast   = d < today && !isToday;
                const isReq    = reqIds.has(patrolSessionId(s));
                const area     = s.AreaCode || s.AreaName || 'Factory Area';
                const didAttend = patrolSessionCompleted(s) || attendedDates.has(dateKey);
                const actualDate = patrolSessionActualDate(s);
                const isMakeup = patrolSessionMakeup(s);

                let iconHtml, badgeHtml, rowCls;
                if (isToday) {
                    iconHtml  = `<div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#059669,#0d9488)">
                      <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    </div>`;
                    badgeHtml = didAttend
                        ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">เช็คอินแล้ว</span>`
                        : `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white animate-pulse">วันนี้</span>`;
                    rowCls    = 'bg-emerald-50/50';
                } else if (didAttend) {
                    iconHtml  = `<div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-100">
                      <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    </div>`;
                    badgeHtml = `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">เข้าร่วมแล้ว</span>`;
                    rowCls    = '';
                } else if (isPast) {
                    iconHtml  = `<div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-red-50">
                      <svg class="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </div>`;
                    badgeHtml = isReq
                        ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">ขาด</span>`
                        : `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">ไม่บังคับ</span>`;
                    rowCls    = isReq ? 'opacity-80' : 'opacity-45';
                } else {
                    iconHtml  = `<div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-50 border border-dashed border-slate-200">
                      <svg class="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    </div>`;
                    badgeHtml = `<span class="text-[9px] text-slate-300 font-medium">กำลังมา</span>`;
                    rowCls    = 'opacity-55';
                }
                return `<div class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${rowCls}">
                  ${iconHtml}
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-semibold text-slate-700 truncate">${dStr}</p>
                    <p class="text-[10px] text-slate-400 truncate">${area}${s.PatrolRound ? ' · รอบ ' + s.PatrolRound : ''}${!isReq ? ' · <span class="text-slate-300">ไม่บังคับ</span>' : ''}</p>
                    ${didAttend && isMakeup && actualDate ? `<p class="text-[9px] text-violet-500 mt-0.5">Actual: ${escHtml(actualDate)}</p>` : ''}
                  </div>
                  ${badgeHtml}
                </div>`;
              }).join('')}
            </div>
          </div>`;
          })()}

          <!-- Team Roster Card — YTD stats + pass/fail -->
          ${_myPlan?.roster?.length > 0 ? (() => {
            const typeColor = { top:'rose', committee:'amber', management:'indigo' };
            const typeLabel = { top:'Top', committee:'คปอ.', management:'Mgmt' };
            const roster    = _myPlan.roster;
            const memberMap = {};
            (_myYearlyStats?.teamMemberStats || []).forEach(s => {
                memberMap[s.EmployeeID] = { yearlyCount: s.yearlyCount, position: s.position };
            });
            const thresholdMap = {};
            const yearlyTarget = _myYearlyStats?.yearlyTarget || null;
            const curYear = new Date().getFullYear();
            const maxCount = Math.max(1, ...Object.values(memberMap).map(m => m.yearlyCount ?? 0));
            return `
          <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden" data-patrol-card-image="patrol-team-roster-ytd">
            <div class="px-5 py-3 flex items-center justify-between border-b border-slate-50">
              <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${_myPlan.team.color}"></span>
                ทีมของฉัน · สถานะ YTD ${curYear}
              </h3>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-slate-400 font-semibold">${roster.length} คน</span>
                ${isAdmin ? `<button onclick="openThresholdSettings()" title="ตั้งค่าเกณฑ์ผ่าน"
                  class="hidden p-1.5 rounded-lg bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors border border-slate-100">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>` : ''}
              </div>
            </div>
            <div class="divide-y divide-slate-50">
              ${roster.map(m => {
                const tc        = typeColor[m.PatrolType] || 'slate';
                const tl        = typeLabel[m.PatrolType] || m.PatrolType;
                const isMe      = m.EmployeeID === currentUser.id;
                const mStats    = memberMap[m.EmployeeID] || null;
                const ytdCount  = mStats?.yearlyCount ?? null;
                const position  = mStats?.position || null;
                const threshold = null;
                const ytdPct    = yearlyTarget && ytdCount !== null
                    ? Math.min(Math.round((ytdCount / yearlyTarget) * 100), 100) : null;
                const barPct    = ytdCount !== null
                    ? Math.min(Math.round((ytdCount / maxCount) * 100), 100) : 0;
                const ytdDone   = yearlyTarget && ytdCount !== null && ytdCount >= yearlyTarget;
                const passed    = threshold !== null && ytdPct !== null && ytdPct >= threshold;
                const failing   = threshold !== null && ytdPct !== null && ytdPct < threshold;
                return `<div class="px-4 py-2.5 ${isMe ? 'bg-emerald-50/60' : 'hover:bg-slate-50'} transition-colors">
                  <div class="flex items-center gap-2.5 mb-1.5">
                    <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${isMe?'bg-emerald-500 text-white':'bg-slate-100 text-slate-600'}">
                      ${(m.EmployeeName||'?').charAt(0)}
                    </div>
                    <span class="text-xs font-medium text-slate-700 flex-1 truncate ${isMe?'font-bold':''}">${m.EmployeeName}${isMe?' (ฉัน)':''}</span>
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-${tc}-100 text-${tc}-700 flex-shrink-0">${tl}</span>
                    ${ytdCount !== null ? `
                    <span class="text-[10px] font-bold flex-shrink-0 ${ytdDone ? 'text-emerald-600' : 'text-slate-500'}">
                      ${ytdCount}${yearlyTarget ? `/${yearlyTarget}` : ''} ครั้ง
                    </span>` : ''}
                  </div>
                  ${ytdCount !== null ? `
                  <div class="ml-8">
                    <div class="flex items-center gap-2 mb-1">
                      <div class="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-700" style="width:${barPct}%;background:${ytdDone ? 'linear-gradient(90deg,#059669,#10b981)' : isMe ? 'linear-gradient(90deg,#6366f1,#8b5cf6)' : '#94a3b8'}"></div>
                      </div>
                      ${passed ? `<span class="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100 flex-shrink-0">ผ่าน</span>`
                        : failing ? `<span class="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-100 flex-shrink-0">ต่ำกว่าเกณฑ์ ${threshold}%</span>`
                        : ''}
                    </div>
                    ${ytdPct !== null ? `<p class="text-[8px] text-slate-400">${ytdPct}% ของเป้าหมายรายปี</p>` : ''}
                  </div>` : `<div class="ml-8"><div class="w-full bg-slate-100 rounded-full h-1.5"></div></div>`}
                </div>`;
              }).join('')}
            </div>
          </div>`;
          })() : ''}

          <!-- Self-Patrol Card (หัวหน้าส่วน/แผนก) — conditional -->
          ${_mySelfPatrol?.isSupervisorPatrol && !useSelfPatrolGreen ? (() => {
            const sp        = _mySelfPatrol;
            const isFlexible = sp.scheduleMode === 'flexible';
            const scheduleItems = patrolSelfScheduledMonthItems();
            const flexDays = Array.isArray(sp.calendarDays) ? sp.calendarDays : [];
            const checkins = Array.isArray(sp.checkins) ? sp.checkins : [];
            const attended  = Number(sp.completed ?? checkins.length);
            const target    = Number(sp.monthlyRequirement ?? sp.target ?? 0);
            const pct       = target > 0 ? Math.min(Math.round((attended / target) * 100), 100) : 0;
            const done      = target > 0 && attended >= target;
            const openSchedule   = patrolSelfScheduledMonthOpenItems();
            const makeupSchedule = patrolSelfMakeupScheduleItems();
            const actionableScheduleCount = isFlexible ? openSchedule.length : (openSchedule.length + makeupSchedule.length);
            const remaining = Number(sp.remaining ?? Math.max(0, target - attended));
            const modeLabel = isFlexible ? 'ยืดหยุ่น' : 'ตามปฏิทิน';
            const scheduleTotal = Number(scheduleItems.length || 0);
            const spYear         = _myYearlyStats?.selfPatrolYear;
            const yearlySpTarget = Number(sp.yearlyTarget || spYear?.target || 0);
            const yearlySpCount  = sp.yearlyCompleted ?? spYear?.count ?? 0;
            const yearlySpPct    = yearlySpTarget > 0 ? Math.min(Math.round((yearlySpCount / yearlySpTarget) * 100), 100) : 0;
            const yearlySpDone   = yearlySpTarget > 0 && yearlySpCount >= yearlySpTarget;
            const leaveStats     = sp.leave || {};
            const leaveYear      = Number(leaveStats.leaveYear || 0);
            const allowedLeave   = Number(leaveStats.allowedLeaveYear || 0);
            const acceptedCoveragePct = Number(sp.acceptedCoverageYearPct || leaveStats.acceptedCoverageYearPct || 0);
            return `
          <div class="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden" data-patrol-card-image="patrol-self-patrol-progress" style="box-shadow:0 4px 24px rgba(245,158,11,0.08)">
            <div class="px-5 py-3.5 border-b border-amber-100" style="background:linear-gradient(135deg,#fffbeb,#fef3c7)">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-amber-800 text-sm flex items-center gap-2">
                  <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-100">
                    <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                  </div>
                  งานตรวจของฉัน
                </h3>
                <span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-200 text-amber-800'}">${modeLabel} · ${attended}/${target} เดือนนี้</span>
              </div>
              ${spYear !== undefined ? `
              <div class="mt-3">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[10px] font-semibold text-amber-700/80">ความก้าวหน้ารายปี</span>
                  <span class="text-[10px] font-bold ${yearlySpDone ? 'text-emerald-600' : 'text-amber-700'}">${yearlySpCount}/${yearlySpTarget} ครั้ง · ${yearlySpPct}%</span>
                </div>
                <div class="w-full bg-amber-100/60 rounded-full h-2 overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-700" style="width:${yearlySpPct}%;background:${yearlySpDone ? 'linear-gradient(90deg,#059669,#10b981)' : 'linear-gradient(90deg,#d97706,#f59e0b)'}"></div>
                </div>
                <p class="text-[9px] text-amber-600/60 mt-0.5">${yearlySpDone ? 'ครบเป้าหมายแล้ว' : 'เหลือ ' + (yearlySpTarget - yearlySpCount) + ' ครั้งจะครบเป้า'}</p>
              </div>` : ''}
              ${allowedLeave || leaveYear ? `
              <div class="mt-3 grid grid-cols-3 gap-2">
                <div class="rounded-lg bg-white/70 border border-amber-100 px-2 py-1.5">
                  <p class="text-[8px] font-black uppercase text-slate-400">Leave</p>
                  <p class="text-xs font-black text-sky-700">${leaveYear}/${allowedLeave}</p>
                </div>
                <div class="rounded-lg bg-white/70 border border-amber-100 px-2 py-1.5">
                  <p class="text-[8px] font-black uppercase text-slate-400">Allowance</p>
                  <p class="text-xs font-black text-amber-700">${Number(leaveStats.leaveAllowancePct || 0)}%</p>
                </div>
                <div class="rounded-lg bg-white/70 border border-amber-100 px-2 py-1.5">
                  <p class="text-[8px] font-black uppercase text-slate-400">Accepted</p>
                  <p class="text-xs font-black text-emerald-700">${acceptedCoveragePct}%</p>
                </div>
              </div>` : ''}
            </div>
            <div class="p-5">
              ${isFlexible && flexDays.length ? `
              <div class="mb-4 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <p class="text-[10px] font-bold text-amber-700">ปฏิทินงานตรวจเดือนนี้</p>
                  <span class="text-[10px] font-bold text-amber-700">เหลือ ${remaining}</span>
                </div>
                <div class="grid grid-cols-7 gap-1">
                  ${flexDays.map(day => {
                    const date = patrolScheduleDate(day);
                    const dayNo = Number(date.slice(8, 10)) || '';
                    const status = String(day.status || '').toLowerCase();
                    const isChecked = day.isCompleted || status === 'checked';
                    const isLocked = status === 'locked';
                    const action = isChecked
                        ? `window.openSelfCheckinModal(${_patrolJsArg(day.ScheduledSessionID || '')})`
                        : !isLocked
                            ? `window.openSelfCheckinModal(${_patrolJsArg(day.ScheduledSessionID || '')})`
                            : '';
                    const label = isChecked ? 'Checked' : isLocked ? 'Locked' : 'Open';
                    return `<button type="button" ${action ? `onclick="${action}"` : 'disabled'}
                      class="aspect-square rounded-lg border px-1 text-center transition-all ${patrolFlexibleDayTone(day)} disabled:cursor-not-allowed">
                      <span class="block text-xs font-black leading-tight">${dayNo}</span>
                      <span class="block text-[8px] font-bold leading-tight truncate">${label}</span>
                    </button>`;
                  }).join('')}
                </div>
              </div>` : ''}
              ${!isFlexible && scheduleItems.length ? `
              <div class="mb-4 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <p class="text-[10px] font-bold text-amber-700">รอบตรวจตามปฏิทินเดือนนี้</p>
                  <span class="text-[10px] font-bold text-amber-700">เปิด ${openSchedule.length}/${scheduleTotal}${makeupSchedule.length ? ' · ซ่อม ' + makeupSchedule.length : ''}</span>
                </div>
                <div class="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  ${scheduleItems.map(item => {
                    const completed = patrolSessionCompleted(item);
                    const isLeave = patrolSessionLeave(item);
                    const isLeavePending = patrolSessionLeavePending(item);
                    const date = patrolScheduleDate(item);
                    const area = patrolScheduleArea(item);
                    const round = patrolScheduleRound(item);
                    const status = patrolScheduleStatusLabel(item);
                    const tone = isLeave ? 'text-sky-700 bg-sky-50 border-sky-100' : isLeavePending ? 'text-indigo-700 bg-indigo-50 border-indigo-100' : completed ? (patrolSessionMakeup(item) ? 'text-violet-600 bg-violet-50 border-violet-100' : 'text-emerald-600 bg-emerald-50 border-emerald-100') : 'text-amber-700 bg-white border-amber-100';
                    const canAct = !completed && !isLeave && !isLeavePending;
                    return `<div class="rounded-lg border ${tone} px-2 py-1.5">
                      <div class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <p class="text-[10px] font-bold truncate">${escHtml(date)}${area ? ' · ' + escHtml(area) : ''}${round ? ' · R' + escHtml(round) : ''}</p>
                          ${completed && patrolSessionActualDate(item) && patrolSessionActualDate(item) !== date ? `<p class="text-[9px] opacity-75 truncate">Actual: ${escHtml(patrolSessionActualDate(item))}</p>` : ''}
                        </div>
                        <button ${canAct ? `onclick="window.openSelfCheckinModal(${_patrolJsArg(patrolSessionId(item))})"` : 'disabled'}
                          class="flex-shrink-0 px-2 py-1 rounded-lg text-[9px] font-black bg-white/80 hover:bg-white border border-white/80 transition-colors">
                          ${completed ? status : 'เช็คอิน'}
                        </button>
                        ${canAct ? `<button onclick="window.openPatrolLeaveModal('supervisor', ${_patrolJsArg(patrolSessionId(item))}, ${_patrolJsArg(date)}, ${_patrolJsArg(area)})"
                          class="flex-shrink-0 px-2 py-1 rounded-lg text-[9px] font-black bg-sky-50 hover:bg-sky-100 border border-sky-100 text-sky-700 transition-colors">ลา</button>` : ''}
                      </div>
                    </div>`;
                  }).join('')}
                </div>
              </div>` : ''}
              <div class="w-full bg-slate-100 rounded-full h-2 mb-4 overflow-hidden">
                <div class="h-full rounded-full transition-all duration-700" style="width:${pct}%;background:${done?'linear-gradient(90deg,#059669,#10b981)':'linear-gradient(90deg,#f59e0b,#fbbf24)'}"></div>
              </div>
              ${checkins.length === 0
                ? `<p class="text-xs text-slate-400 text-center py-3 italic">ยังไม่มีการบันทึกเดือนนี้</p>`
                : checkins.map(c => {
                    const d = new Date(c.CheckinDate);
                    const notesPreview = c.Notes ? c.Notes.replace(/\[ตรวจแล้ว:[^\]]*\]\n?/, '').trim() : '';
                    const checkedItems = c.Notes?.match(/\[ตรวจแล้ว: ([^\]]+)\]/)?.[1] || '';
                    return `<div class="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                      <div class="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-50 flex-shrink-0">
                        <div class="text-center">
                          <div class="text-xs font-bold text-amber-700">${d.getDate()}</div>
                          <div class="text-[7px] text-amber-400">${d.toLocaleString('th-TH',{month:'short'})}</div>
                        </div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-slate-700 truncate">${c.Location || 'ไม่ระบุสถานที่'}</p>
                        ${checkedItems ? `<p class="text-[9px] text-slate-400 truncate">ตรวจ: ${checkedItems.replace(/ \/ /g,' · ')}</p>` : ''}
                        ${notesPreview ? `<p class="text-[9px] text-slate-400 truncate italic">${notesPreview}</p>` : ''}
                      </div>
                      <button onclick="deleteSelfCheckin(${c.id})" class="p-1 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>`;
                  }).join('')}
              <button onclick="openSelfCheckinModal()" ${actionableScheduleCount ? '' : 'disabled'} class="mt-4 w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed" style="background:linear-gradient(135deg,#d97706,#f59e0b)">
                <svg class="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                ${actionableScheduleCount ? 'บันทึกการเดินตรวจ' : 'ไม่มีรอบที่ต้องบันทึก'}
              </button>
            </div>
          </div>`;
          })() : ''}

        </div>

        <div class="xl:col-span-1 space-y-5">

          <!-- Performance Card — Compliance Ring (B+D) -->
          <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 overflow-hidden relative" data-patrol-card-image="patrol-personal-performance">
            <div class="absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-5" style="background:${rank.color}"></div>
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                ผลงานของฉัน
              </h3>
              <span class="text-[10px] font-bold px-2 py-1 rounded-full" style="background:${rank.bg};color:${rank.color}">${rank.title}</span>
            </div>

            <!-- Compliance Ring + Team Avg (B+D) -->
            ${(() => {
              const yc   = Number(personalDetail?.acceptedCoverageToDate ?? _myYearlyStats?.yearlyCount ?? walks);
              const yt   = Number(personalDetail?.requiredToDate ?? 0) || null;
              const yPct = personalDetail ? Number(personalDetail.acceptedCoverageToDatePct ?? 0) : (yt ? Math.min(Math.round((yc / yt) * 100), 100) : null);
              const yDone = yt ? yc >= yt : false;
              const tr   = _myYearlyStats?.teamRank;
              const circ = 2 * Math.PI * 42;
              const offset = yPct !== null ? circ * (1 - yPct / 100) : circ;
              const ringColor = yDone ? '#10b981' : yPct !== null && yPct >= 75 ? '#10b981' : yPct !== null && yPct >= 50 ? '#f59e0b' : yPct !== null ? '#f43f5e' : '#e2e8f0';
              let statusLabel, statusDotCls, statusTextCls;
              if (yPct === null)      { statusLabel = 'ยังไม่มีเป้าหมาย'; statusDotCls = 'bg-slate-300'; statusTextCls = 'bg-slate-100 text-slate-500'; }
              else if (yDone)         { statusLabel = 'ครบเป้าหมาย';       statusDotCls = 'bg-emerald-400 animate-pulse'; statusTextCls = 'bg-emerald-100 text-emerald-700'; }
              else if (yPct >= 75)   { statusLabel = 'On Track';           statusDotCls = 'bg-emerald-400 animate-pulse'; statusTextCls = 'bg-emerald-100 text-emerald-700'; }
              else if (yPct >= 50)   { statusLabel = 'At Risk';            statusDotCls = 'bg-amber-400'; statusTextCls = 'bg-amber-100 text-amber-700'; }
              else                    { statusLabel = 'Behind';             statusDotCls = 'bg-red-400'; statusTextCls = 'bg-red-100 text-red-700'; }

              // D: Team average
              const teamStats = _myYearlyStats?.teamMemberStats || [];
              let avgHtml = '';
              if (teamStats.length > 1 && yt && yPct !== null) {
                const sumCnt = teamStats.reduce((s, m) => s + (parseInt(m.yearlyCount) || 0), 0);
                const avgPct = Math.round((sumCnt / teamStats.length / yt) * 100);
                const diff   = yPct - avgPct;
                const diffStr   = diff >= 0 ? `+${diff}%` : `${diff}%`;
                const diffColor = diff >= 0 ? '#10b981' : '#f43f5e';
                avgHtml = `<p class="text-[10px] text-slate-400 text-center mt-1.5">เฉลี่ยทีม ${avgPct}% · <span class="font-bold" style="color:${diffColor}">${diffStr}</span> จากค่าเฉลี่ย</p>`;
              }
              if (tr) {
                avgHtml += `<p class="text-[10px] text-slate-400 text-center mt-0.5">อันดับ <span class="font-bold text-indigo-600">#${tr.rank}</span> จาก ${tr.total} คนในทีม</p>`;
              }

              return `
              <div class="flex flex-col items-center mb-4">
                <!-- SVG Ring -->
                <div class="relative w-32 h-32">
                  <svg viewBox="0 0 100 100" class="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" stroke-width="9"/>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="${ringColor}" stroke-width="9"
                      stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
                      stroke-linecap="round" style="transition:stroke-dashoffset 0.8s ease"/>
                  </svg>
                  <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <p class="text-2xl font-bold" style="color:${ringColor}">${yPct !== null ? yPct + '%' : walks}</p>
                    <p class="text-[9px] text-slate-400 mt-0.5">${yt ? yc + '/' + yt + (_yearlyTarget ? ' (' + _yearlyTarget + ')' : '') + ' ครั้ง' : yPct === null ? 'ครั้งรวม' : ''}</p>
                  </div>
                </div>
                <!-- Status badge -->
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mt-2 ${statusTextCls}">
                  <span class="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0 ${statusDotCls}"></span>
                  ${statusLabel}
                </span>
                ${avgHtml}
              </div>`;
            })()}

            <!-- Footer stats -->
            <div class="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
              <div>
                <p class="text-[10px] text-slate-400 font-medium">เดินตรวจรวม</p>
                <p class="text-xl font-bold" style="color:${rank.color}">${walks} <span class="text-xs font-normal text-slate-400">ครั้ง</span></p>
              </div>
              <div class="text-right">
                <p class="text-[10px] text-slate-400 font-medium">อัตราผ่าน</p>
                <p class="text-xl font-bold text-emerald-600">${_acceptedPct}%</p>
              </div>
            </div>
          </div>

          <!-- Recent Check-in Timeline (Phase 3) -->
          ${_myYearlyStats?.recentCheckins?.length > 0 ? `
          <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5" data-patrol-card-image="patrol-recent-checkins">
            <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2 mb-4">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-50 flex-shrink-0">
                <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              ประวัติล่าสุด
            </h3>
            <div class="relative">
              <div class="absolute left-[18px] top-0 bottom-0 w-px bg-slate-100"></div>
              <div class="space-y-3">
                ${_myYearlyStats.recentCheckins.map((c, i) => {
                  const d = new Date(c.PatrolDate);
                  const isFirst = i === 0;
                  const typeMeta = patrolTypeMeta(c.PatrolType);
                  const typeLabel = typeMeta.label;
                  const typeColor = typeMeta.cls;
                  const notesPreview = c.Notes ? c.Notes.replace(/\[ตรวจแล้ว:[^\]]*\]\n?/, '').trim() : '';
                  const checkedItems = c.Notes?.match(/\[ตรวจแล้ว: ([^\]]+)\]/)?.[1] || '';
                  return `<div class="flex items-start gap-3 pl-1">
                    <div class="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 z-10 ${isFirst ? 'bg-emerald-500' : 'bg-slate-200'}">
                      <div class="w-1.5 h-1.5 rounded-full ${isFirst ? 'bg-white' : 'bg-slate-400'}"></div>
                    </div>
                    <div class="flex-1 min-w-0 pb-2">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-bold ${isFirst ? 'text-slate-800' : 'text-slate-600'}">${d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'})}</span>
                        ${c.Area ? `<span class="text-[10px] font-semibold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded-full border border-slate-100">${c.Area}</span>` : ''}
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full ${typeColor}">${typeLabel}</span>
                      </div>
                      ${checkedItems ? `<p class="text-[9px] text-slate-400 mt-0.5 truncate">ตรวจ: ${checkedItems.replace(/ \/ /g,' · ')}</p>` : ''}
                      ${notesPreview ? `<p class="text-[10px] text-slate-500 mt-0.5 truncate italic">${notesPreview}</p>` : ''}
                    </div>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>` : ''}

          <!-- My Issues Mini-Panel -->
          ${(() => {
            const myTeam = currentUser.team || '';
            const teamIssues = myTeam
                ? issuesArray.filter(i => (i.FoundByTeam || '') === myTeam)
                : issuesArray;
            const myOpen   = teamIssues.filter(i => i.CurrentStatus === 'Open').length;
            const myTemp   = teamIssues.filter(i => i.CurrentStatus === 'Temporary').length;
            const myTotal  = teamIssues.length;
            const recent   = teamIssues
                .filter(i => i.CurrentStatus !== 'Closed')
                .slice(0, 2);
            if (!myTotal) return '';
            return `
          <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5" data-patrol-card-image="patrol-team-issues-mini">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-red-50 flex-shrink-0">
                  <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                ปัญหาของทีมฉัน
              </h3>
              <button onclick="switchTab('issues')" class="text-[10px] font-semibold text-emerald-600 hover:underline">ดูทั้งหมด</button>
            </div>
            <div class="grid grid-cols-3 gap-2 mb-3">
              <div class="rounded-xl p-2.5 text-center bg-red-50">
                <p class="text-lg font-bold text-red-600">${myOpen}</p>
                <p class="text-[9px] text-red-400 font-medium">รอแก้ไข</p>
              </div>
              <div class="rounded-xl p-2.5 text-center bg-amber-50">
                <p class="text-lg font-bold text-amber-600">${myTemp}</p>
                <p class="text-[9px] text-amber-400 font-medium">แก้ชั่วคราว</p>
              </div>
              <div class="rounded-xl p-2.5 text-center bg-slate-50">
                <p class="text-lg font-bold text-slate-500">${myTotal}</p>
                <p class="text-[9px] text-slate-400 font-medium">ทั้งหมด</p>
              </div>
            </div>
            ${recent.length ? `<div class="space-y-1.5">
              ${recent.map(i => {
                const isOpen = i.CurrentStatus === 'Open';
                return `<div class="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors" onclick="switchTab('issues')">
                  <span class="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${isOpen ? 'bg-red-400' : 'bg-amber-400'}"></span>
                  <div class="flex-1 min-w-0">
                    <p class="text-[10px] font-semibold text-slate-700 truncate">${i.HazardDescription || i.MachineName || 'ไม่มีรายละเอียด'}</p>
                    <p class="text-[9px] text-slate-400">${i.Area || '—'} · ${isOpen ? 'รอแก้ไข' : 'แก้ชั่วคราว'}</p>
                  </div>
                </div>`;
              }).join('')}
            </div>` : ''}
          </div>`;
          })()}

        </div><!-- /sidebar -->
      </div><!-- /grid -->

      <!-- Safety Tips Carousel — full width -->
      <div class="flex items-center gap-2 mt-1 mb-2">
        <div class="flex-1 h-px bg-slate-100"></div>
        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Safety Knowledge</span>
        <div class="flex-1 h-px bg-slate-100"></div>
      </div>
      <div id="promo-carousel" class="relative overflow-hidden rounded-2xl shadow-md bg-slate-900 group" data-patrol-card-image="patrol-safety-knowledge" style="height:200px">
        <div id="carousel-slides" class="relative w-full h-full">
          ${SAFETY_IMAGES.map((img, idx) => `
          <div class="carousel-item absolute inset-0 pointer-events-none transition-opacity duration-700 opacity-0 z-0" data-index="${idx}">
            <img src="${img.src}" class="w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-1000 ease-out">
            <div class="absolute inset-0" style="background:linear-gradient(to right,rgba(6,30,20,0.95) 0%,rgba(6,30,20,0.5) 50%,transparent 100%)"></div>
            <div class="absolute inset-0 flex items-center p-8">
              <div class="max-w-md">
                <span class="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold mb-3" style="background:rgba(16,185,129,0.3);color:#6ee7b7;border:1px solid rgba(16,185,129,0.4)">Safety Knowledge</span>
                <h3 class="text-lg font-bold text-white leading-tight mb-1">${img.title}</h3>
                <p class="text-[11px] line-clamp-2" style="color:rgba(167,243,208,0.7)">${img.desc}</p>
                <button onclick="openCarouselDetail(${idx})" class="mt-4 text-[10px] font-semibold px-4 py-1.5 rounded-full border border-white/30 text-white hover:bg-white/20 transition-colors pointer-events-auto backdrop-blur-sm">
                  ดูรายละเอียด →
                </button>
              </div>
            </div>
          </div>`).join('')}
        </div>
        <div class="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-black/30 backdrop-blur-sm px-2.5 py-1.5 rounded-full pointer-events-none">
          <span id="carousel-counter" class="text-[10px] font-bold text-white">1/${SAFETY_IMAGES.length}</span>
        </div>
        <div class="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-20 pointer-events-auto">
          ${SAFETY_IMAGES.map((_, idx) => `<button class="carousel-dot h-1 w-1.5 bg-white/30 rounded-full transition-all duration-300 hover:bg-white/60" data-index="${idx}"></button>`).join('')}
        </div>
      </div>
      </div><!-- /content-patrol -->

      <!-- ═══ OVERVIEW TAB ═══ -->
      <div id="content-overview" class="hidden space-y-5">

        <!-- Team overview this month (common) -->
        ${(() => {
          const seen = new Map();
          (data.summary || []).forEach(s => {
            if (!seen.has(s.TeamID || s.TeamName)) {
              seen.set(s.TeamID || s.TeamName, { name: s.TeamName, color: s.TeamColor || '#6366f1', area: s.AreaName || s.AreaCode || '—', dates: [] });
            }
            seen.get(s.TeamID || s.TeamName).dates.push(new Date(s.ScheduledDate).getDate());
          });
          const teams = [...seen.values()];
          if (teams.length === 0) return '';
          return `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5" data-patrol-card-image="patrol-month-team-overview">
          <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2 mb-4">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-50">
              <svg class="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            ทีมทั้งหมดเดือนนี้ · ${today.toLocaleString('th-TH',{month:'long',year:'numeric'})}
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${teams.map(t => `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${t.color}"></span>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-slate-800 truncate">${t.name}</p>
                <p class="text-[10px] text-slate-500 truncate">${t.area}</p>
              </div>
              <div class="flex gap-0.5 flex-shrink-0">
                ${t.dates.sort((a,b)=>a-b).map(d =>
                  `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">${d}</span>`
                ).join('')}
              </div>
            </div>`).join('')}
          </div>
        </div>`;
        })()}

        ${isAdmin ? `
        <!-- Admin: บันทึกการเดินตรวจให้พนักงานทุกคน -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" data-patrol-card-image="patrol-admin-record-panel">
          <div class="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <span class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style="background:linear-gradient(135deg,#059669,#0d9488)">
              <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
            </span>
            <div>
              <p class="text-sm font-bold text-slate-800">บันทึกการเดินตรวจ (Admin)</p>
              <p class="text-xs text-slate-500">ค้นหาพนักงานเพื่อเพิ่ม/แก้ไข/ลบรายการเดินตรวจแทน</p>
            </div>
          </div>
          <div class="p-4">
            <div class="relative">
              <div class="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </div>
              <input id="patrol-emp-search-input" type="text" placeholder="พิมพ์ชื่อ, รหัสพนักงาน, หรือแผนก..."
                     class="form-input w-full pl-9 pr-3 rounded-xl text-sm"
                     autocomplete="off" />
            </div>
            <div id="patrol-emp-search-results" class="mt-2 hidden"></div>
          </div>
        </div>
        ` : ''}

        <!-- Sub-tab toggle -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-1.5 flex gap-1" data-patrol-card-ignore>
          <button id="ov-sub-btn-mgmt" onclick="window._switchOvSub('mgmt')"
                  class="flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all text-white"
                  style="background:linear-gradient(135deg,#059669,#0d9488)">
            Top &amp; Management
          </button>
          <button id="ov-sub-btn-sv" onclick="window._switchOvSub('sv')"
                  class="flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all text-slate-500 hover:bg-slate-50">
            Sec. &amp; Supervisor
          </button>
        </div>

        <!-- ── Sub-tab 1: Top & Management ── -->
        <div id="ov-sub-mgmt" class="space-y-4">

          <!-- Spotlight Banner (full-width) -->
          <div id="spotlight-mgmt-wrap"></div>

          <!-- Main grid: table (primary) + sidebar -->
          <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">

            <!-- Table card — takes 3/4 -->
            <div class="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col" data-patrol-card-image="patrol-management-attendance-table">
              <!-- Card header: title + year + add button -->
              <div class="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-3">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <svg class="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                  <h3 class="font-bold text-slate-700 text-sm truncate">Summary of Top &amp; Management Safety Patrol Attendance</h3>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0" data-patrol-card-ignore>
                  <select id="overview-year-select" onchange="switchOverviewYear(this.value)"
                    class="text-xs font-bold rounded-xl border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:border-emerald-400 text-slate-700">
                    ${[new Date().getFullYear(), new Date().getFullYear()-1, new Date().getFullYear()-2].map(y =>
                      `<option value="${y}" ${y === _overviewYear ? 'selected' : ''}>${y}</option>`
                    ).join('')}
                  </select>
                  <span id="ov-table-subtitle" class="hidden"></span>
                  <button onclick="window.exportPatrolPDF('top_management')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex-shrink-0 border border-red-200 text-red-600 hover:bg-red-50">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    PDF
                  </button>
                  <button onclick="window.exportPatrolOverviewExcel('top_management')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex-shrink-0 border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4h10l6 6v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm9 1v6h6M8 13l2 3 2-3m-4 5h4"/></svg>
                    Excel
                  </button>
                  ${isAdmin ? `<button onclick="window.openRosterAddModal('top_management')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all flex-shrink-0"
                    style="background:linear-gradient(135deg,#059669,#0d9488)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
                    เพิ่มสมาชิก
                  </button>` : ''}
                </div>
              </div>
              <!-- Search bar -->
              <div class="px-4 py-2.5 border-b border-slate-100" data-patrol-card-ignore>
                <div class="relative">
                  <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/></svg>
                  <input type="text" id="ov-search-input" placeholder="ค้นหาชื่อ, ตำแหน่ง, แผนก..."
                    class="w-full text-xs rounded-xl border border-slate-200 pl-8 pr-3 py-1.5 focus:outline-none focus:border-emerald-400 bg-slate-50"
                    oninput="window._ovMgmtSearchInput(this.value)">
                </div>
              </div>
              <!-- Table -->
              <div class="hidden md:block overflow-x-auto flex-1">
                <table class="w-full text-xs text-left">
                  <thead class="text-[10px] uppercase bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th class="px-4 py-3 font-bold text-slate-400 w-8">#</th>
                      <th class="px-4 py-3 font-bold text-slate-600">ชื่อ-สกุล</th>
                      <th class="px-4 py-3 font-bold text-slate-400">ตำแหน่ง</th>
                      <th class="px-4 py-3 font-bold text-slate-400">แผนก</th>
                      <th class="px-4 py-3 font-bold text-slate-400 text-center">เป้า/ปี</th>
                      <th class="px-4 py-3 font-bold text-emerald-600 text-center">เข้าร่วม</th>
                      <th class="px-4 py-3 font-bold text-sky-600 text-center">Leave</th>
                      <th class="px-4 py-3 font-bold text-emerald-600 text-center">Accepted</th>
                      <th class="px-4 py-3 font-bold text-slate-400 text-center">%</th>
                      <th class="px-4 py-3 font-bold text-slate-400 text-center">Final</th>
                      ${isAdmin ? `<th class="px-4 py-3 font-bold text-slate-400 text-center">จัดการ</th>` : ''}
                    </tr>
                  </thead>
                  <tbody id="overview-table-body" class="divide-y divide-slate-50">
                    <tr><td colspan="${isAdmin ? 11 : 10}" class="text-center py-12 text-slate-300 text-xs">
                      <div class="inline-flex flex-col items-center gap-2">
                        <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
                        <span>กำลังโหลด...</span>
                      </div>
                    </td></tr>
                  </tbody>
                </table>
              </div>
              <div id="overview-mobile-cards" class="md:hidden space-y-2 p-3 bg-slate-50/50"></div>
              <!-- Pagination -->
              <div id="ov-mgmt-pagination" class="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between min-h-[40px]"></div>
              <!-- Evaluation Criteria -->
              <div class="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50">
                <p class="text-[10px] font-bold text-slate-500 uppercase mb-2">Evaluation Criteria</p>
                <div class="flex flex-wrap gap-2">
                  ${[['≥80%','5','bg-emerald-100 text-emerald-700'],['≥75%','4','bg-teal-100 text-teal-700'],['≥70%','3','bg-blue-100 text-blue-700'],['≥65%','2','bg-amber-100 text-amber-700'],['≥60%','1','bg-orange-100 text-orange-700']].map(([pct,r,cls])=>`
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${cls}">Rating ${r} · ${pct}</span>`).join('')}
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 ml-auto">Weight 0.4</span>
                </div>
              </div>
            </div>

            <!-- Sidebar: 1/4 width -->
            <div class="flex flex-col gap-3 h-full" data-patrol-card-image="patrol-management-kpi-sidebar">
              <!-- Card 1: เซสชันทั้งหมด -->
              <div class="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-4 flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                  <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>
                <div>
                  <p class="text-2xl font-bold text-slate-800 leading-none" id="ov-card-total">—</p>
                  <p class="text-[11px] text-slate-400 mt-0.5">เซสชันทั้งหมด</p>
                </div>
              </div>
              <!-- Card 2: เข้าร่วมรวม -->
              <div class="bg-white rounded-2xl shadow-sm border border-emerald-100 px-4 py-4 flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                  <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </div>
                <div>
                  <p class="text-2xl font-bold text-emerald-700 leading-none" id="ov-card-attended">—</p>
                  <p class="text-[11px] text-emerald-500 mt-0.5">เข้าร่วมรวม</p>
                </div>
              </div>
              <!-- Card 3: อัตราเข้าร่วม -->
              <div class="rounded-2xl px-4 py-4 flex items-center gap-3" style="background:linear-gradient(135deg,#059669,#0d9488)">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(255,255,255,0.15)">
                  <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                </div>
                <div>
                  <p class="text-2xl font-bold text-white leading-none" id="ov-card-pct">—%</p>
                  <p class="text-[11px] text-white/70 mt-0.5">อัตราเข้าร่วม</p>
                  <p class="text-[10px] text-white/50 mt-0.5" id="ov-card-date"></p>
                </div>
              </div>
              <!-- Pie chart — flex-1 fills remaining height -->
              <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col flex-1 min-h-0">
                <p class="text-[10px] font-bold text-slate-400 uppercase mb-3">สัดส่วน</p>
                <div class="relative flex-1 min-h-0">
                  <canvas id="ov-mgmt-pie"></canvas>
                  <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p class="text-2xl font-bold text-emerald-600" id="ov-mgmt-pie-pct">—%</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- ── Sub-tab 2: Sec. & Supervisor ── -->
        <div id="ov-sub-sv" class="hidden space-y-4">

          <!-- Main grid: table (primary) + sidebar -->
          <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">

            <!-- Table card — takes 3/4 -->
            <div class="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden flex flex-col" data-patrol-card-image="patrol-supervisor-attendance-table">
              <!-- Card header: title + year + add button -->
              <div class="px-5 py-3.5 border-b border-amber-100 bg-amber-50/40 flex flex-wrap items-center gap-3">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <div class="w-6 h-6 rounded-lg flex items-center justify-center bg-amber-100 flex-shrink-0">
                    <svg class="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                  </div>
                  <h3 class="font-bold text-slate-700 text-sm truncate">Summary of Sec. &amp; Supervisor Safety Patrol Attendance</h3>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0" data-patrol-card-ignore>
                  <select id="sv-year-select" onchange="window.switchSvFilter()"
                    class="text-xs font-bold rounded-xl border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:border-amber-400 text-slate-700">
                    ${[new Date().getFullYear(), new Date().getFullYear()-1, new Date().getFullYear()-2].map(y=>
                      `<option value="${y}" ${y===new Date().getFullYear()?'selected':''}>${y}</option>`
                    ).join('')}
                  </select>
                  <span class="hidden" id="sv-overview-subtitle"></span>
                  <button onclick="window.exportPatrolPDF('supervisor')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex-shrink-0 border border-red-200 text-red-600 hover:bg-red-50">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    PDF
                  </button>
                  <button onclick="window.exportPatrolOverviewExcel('supervisor')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex-shrink-0 border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4h10l6 6v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm9 1v6h6M8 13l2 3 2-3m-4 5h4"/></svg>
                    Excel
                  </button>
                  ${isAdmin ? `<button onclick="window.openRosterAddModal('supervisor')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all flex-shrink-0"
                    style="background:linear-gradient(135deg,#d97706,#f59e0b)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
                    เพิ่มสมาชิก
                  </button>` : ''}
                </div>
              </div>
              <!-- Search bar -->
              <div class="px-4 py-2.5 border-b border-amber-100" data-patrol-card-ignore>
                <div class="relative">
                  <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/></svg>
                  <input type="text" id="sv-search-input" placeholder="ค้นหาชื่อ, ตำแหน่ง, แผนก..."
                    class="w-full text-xs rounded-xl border border-slate-200 pl-8 pr-3 py-1.5 focus:outline-none focus:border-amber-400 bg-amber-50/30"
                    oninput="window._svSearchInput(this.value)">
                </div>
              </div>
              <!-- Table -->
              <div class="hidden md:block overflow-x-auto flex-1">
                <table class="w-full text-xs text-left">
                  <thead class="text-[10px] uppercase bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th class="px-4 py-3 font-bold text-slate-400 w-8">#</th>
                      <th class="px-4 py-3 font-bold text-slate-600">ชื่อ-สกุล</th>
                      <th class="px-4 py-3 font-bold text-slate-400">ตำแหน่ง</th>
                      <th class="px-4 py-3 font-bold text-slate-400">แผนก</th>
                      <th class="px-4 py-3 font-bold text-slate-400 text-center">เป้า/ปี</th>
                      <th class="px-4 py-3 font-bold text-amber-600 text-center">เดินแล้ว</th>
                      <th class="px-4 py-3 font-bold text-sky-600 text-center">Leave</th>
                      <th class="px-4 py-3 font-bold text-emerald-600 text-center">Accepted</th>
                      <th class="px-4 py-3 font-bold text-slate-400 text-center">%</th>
                      <th class="px-4 py-3 font-bold text-slate-400 text-center">สถานะ</th>
                      ${isAdmin ? `<th class="px-4 py-3 font-bold text-slate-400 text-center">จัดการ</th>` : ''}
                    </tr>
                  </thead>
                  <tbody id="sv-overview-body">
                    <tr><td colspan="${isAdmin ? 11 : 10}" class="text-center py-8 text-slate-300 text-xs">
                      <div class="inline-flex flex-col items-center gap-2">
                        <div class="animate-spin rounded-full h-6 w-6 border-2 border-amber-400 border-t-transparent"></div>
                        <span>กำลังโหลด...</span>
                      </div>
                    </td></tr>
                  </tbody>
                </table>
              </div>
              <div id="sv-overview-mobile-cards" class="md:hidden space-y-2 p-3 bg-amber-50/30"></div>
              <!-- Pagination -->
              <div id="sv-pagination" class="px-4 py-2.5 border-t border-amber-100 flex items-center justify-between min-h-[40px]"></div>
            </div>

            <!-- Sidebar: 1/4 width -->
            <div class="space-y-4" data-patrol-card-image="patrol-supervisor-kpi-sidebar">
              <!-- Stat chips -->
              <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-2">
                <p class="text-[10px] font-bold text-slate-400 uppercase">ภาพรวม</p>
                <div class="grid grid-cols-2 gap-2">
                  <div class="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-center">
                    <p class="text-lg font-bold text-slate-800" id="sv-card-total">—</p>
                    <p class="text-[10px] text-slate-400 leading-tight">ผู้ควบคุม</p>
                  </div>
                  <div class="rounded-xl bg-amber-50 border border-amber-100 p-2.5 text-center">
                    <p class="text-lg font-bold text-amber-700" id="sv-card-done">—</p>
                    <p class="text-[10px] text-amber-500 leading-tight">ครบเป้า</p>
                  </div>
                </div>
                <div class="rounded-xl p-2.5 text-center" style="background:linear-gradient(135deg,#d97706,#f59e0b)">
                  <p class="text-2xl font-bold text-white" id="sv-card-pct">—%</p>
                  <p class="text-[10px] text-white/70">อัตราครบเป้าหมาย</p>
                </div>
                <p class="text-[10px] text-slate-400 text-center" id="sv-card-subtitle"></p>
              </div>
              <!-- Pie chart -->
              <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
                <p class="text-[10px] font-bold text-slate-400 uppercase mb-3">สัดส่วน</p>
                <div class="relative h-40">
                  <canvas id="ov-sv-pie"></canvas>
                  <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p class="text-2xl font-bold text-amber-600" id="ov-sv-pie-pct">—%</p>
                  </div>
                </div>
              </div>
              <!-- Status breakdown -->
              <div id="sv-status-breakdown"></div>
            </div>

          </div>
        </div>

      </div>

      <!-- ═══ ISSUES TAB ═══ -->
      <div id="content-issues" class="hidden space-y-5">

        <div class="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-sm py-2" data-patrol-card-ignore>
          <div class="inline-flex w-full sm:w-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="มุมมองปัญหา Safety Patrol">
            <button id="issue-subtab-registry" type="button" role="tab" onclick="window._issueSwitchSubTab('registry')"
              class="flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-colors">
              ประเด็นปัญหา
            </button>
            <button id="issue-subtab-stats" type="button" role="tab" onclick="window._issueSwitchSubTab('stats')"
              class="flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-colors">
              สถิติและ Hotspot
            </button>
          </div>
        </div>

        <div id="issue-subview-stats" class="hidden space-y-5">
        <!-- Quick stats strip -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3" data-patrol-card-image="patrol-issue-status-summary">
          ${[
            { label:'รอแก้ไข',     val: openIssues,               bg:'bg-red-50',     icon:'text-red-500',    num:'text-red-600',  border:'border-red-100' },
            { label:'แก้ชั่วคราว', val: tempIssues,               bg:'bg-orange-50',  icon:'text-orange-400', num:'text-orange-600',border:'border-orange-100' },
            { label:'เสร็จสิ้น',   val: closedIssues,             bg:'bg-emerald-50', icon:'text-emerald-500',num:'text-emerald-700',border:'border-emerald-100' },
            { label:'ทั้งหมด',     val: total,                    bg:'bg-slate-50',   icon:'text-slate-400',  num:'text-slate-700', border:'border-slate-200' },
          ].map(s => `
          <div class="bg-white rounded-xl p-4 border ${s.border} shadow-sm flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}">
              <svg class="w-5 h-5 ${s.icon}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div>
              <p class="text-2xl font-bold ${s.num}">${s.val}</p>
              <p class="text-xs text-slate-500">${s.label}</p>
            </div>
          </div>`).join('')}
        </div>

        <!-- Charts row 1 — Area + Dept stats -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="flex flex-col gap-4">
          <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col" data-patrol-card-image="patrol-area-stats">
            <div class="flex items-center justify-between mb-1">
              <h3 class="font-bold text-slate-700 text-sm">สถิติแยกพื้นที่</h3>
              <div class="flex items-center gap-1.5" data-patrol-card-ignore>
                <span id="area-stat-filter-badge" class="hidden items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 cursor-pointer hover:bg-emerald-200 transition-colors" onclick="window._issueFilterArea('');">
                  <span id="area-stat-filter-label"></span>
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                </span>
                ${isAdmin ? `<button onclick="window.openAreaStatConfig()" title="ตั้งค่าพื้นที่ที่แสดง" class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>` : ''}
              </div>
            </div>
            <p class="text-[10px] text-slate-400 mb-2.5">คลิกแถวเพื่อกรองทะเบียนปัญหา</p>
            <div class="flex-1 overflow-y-auto custom-scrollbar">
              <table class="w-full text-xs text-left">
                <thead><tr class="border-b border-slate-100">
                  <th class="pb-2 font-bold text-slate-400 text-[10px] uppercase">พื้นที่</th>
                  <th class="pb-2 font-bold text-slate-500 text-[10px] uppercase text-center">พบ</th>
                  <th class="pb-2 font-bold text-emerald-600 text-[10px] uppercase text-center">เสร็จ</th>
                  <th class="pb-2 font-bold text-orange-500 text-[10px] uppercase text-center">รอ</th>
                </tr></thead>
                <tbody id="dashboard-section-body">
                  <tr><td colspan="4" class="text-center py-4 text-slate-300 text-xs">กำลังโหลด...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div id="patrol-area-followup"></div>

          </div><!-- /left column wrapper -->

          <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col" data-patrol-card-image="patrol-responsible-dept-stats" style="min-height:220px">
            <div class="flex items-center justify-between mb-1">
              <h3 class="font-bold text-slate-700 text-sm">สถิติแยกส่วนงานรับผิดชอบ</h3>
              <div class="flex items-center gap-1.5" data-patrol-card-ignore>
                <span id="dept-stat-filter-badge" class="hidden items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 cursor-pointer hover:bg-indigo-200 transition-colors" onclick="window._issueFilterDept('');window._issueUnitFilter('');window._issueClearRankStop();">
                  <span id="dept-stat-filter-label"></span>
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                </span>
                ${isAdmin ? `<button onclick="window.openDeptStatConfig()" title="ตั้งค่าส่วนงานที่แสดง"
                  class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>` : ''}
              </div>
            </div>
            <p class="text-[10px] text-slate-400 mb-2.5">คลิกแถวเพื่อกรองทะเบียนปัญหา${isAdmin ? ' · กด <svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg> เพื่อเลือกส่วนงานที่แสดง' : ''}</p>
            <div class="flex-1 overflow-y-auto custom-scrollbar">
              <table class="w-full text-xs text-left">
                <thead><tr class="border-b border-slate-100">
                  <th class="pb-2 font-bold text-slate-400 text-[10px] uppercase">ส่วนงาน</th>
                  <th class="pb-2 font-bold text-slate-500 text-[10px] uppercase text-center">พบ</th>
                  <th class="pb-2 font-bold text-emerald-600 text-[10px] uppercase text-center">เสร็จ</th>
                  <th class="pb-2 font-bold text-orange-500 text-[10px] uppercase text-center">รอ</th>
                  <th class="pb-2 font-bold text-sky-600 text-[10px] uppercase text-center">%</th>
                </tr></thead>
                <tbody id="dashboard-dept-body">
                  <tr><td colspan="5" class="text-center py-4 text-slate-300 text-xs">กำลังโหลด...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Rank A Hotspot (full width) -->
        <section class="bg-white rounded-xl shadow-sm border border-red-100 p-4 sm:p-5" data-patrol-card-image="patrol-rank-a-hotspot">
          <div id="rank-a-spotlight">
            <div class="flex items-center gap-2 mb-2">
              <span class="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span>
              <h3 class="font-bold text-slate-700 text-sm flex-1">Rank A Hotspot</h3>
            </div>
            <p class="text-xs text-center py-4 text-slate-300">กำลังโหลด...</p>
          </div>
        </section>

        <!-- Charts row 2 — STOP×Rank matrix (full width) -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden" data-patrol-card-image="patrol-stop-rank-matrix">
          <div class="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between" style="background:linear-gradient(135deg,#064e3b08,#065f4608)">
            <h3 class="font-bold text-slate-700 text-sm">ชนิดอันตราย (STOP) × ระดับความเร่งด่วน</h3>
            <div class="flex items-center gap-3 text-[10px] font-bold">
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500 inline-block"></span>Rank A</span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>Rank B</span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>Rank C</span>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left">
              <thead>
                <tr class="border-b border-slate-100 bg-slate-50">
                  <th class="px-4 py-2.5 font-bold text-slate-500 text-[10px] uppercase">ชนิดอันตราย</th>
                  <th class="px-4 py-2.5 font-bold text-red-500 text-[10px] uppercase text-center">Rank A</th>
                  <th class="px-4 py-2.5 font-bold text-orange-400 text-[10px] uppercase text-center">Rank B</th>
                  <th class="px-4 py-2.5 font-bold text-emerald-600 text-[10px] uppercase text-center">Rank C</th>
                  <th class="px-4 py-2.5 font-bold text-slate-500 text-[10px] uppercase text-center">รวม</th>
                </tr>
              </thead>
              <tbody id="stop-rank-tbody">
                <tr><td colspan="5" class="text-center py-6 text-slate-300 text-xs">กำลังโหลด...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Rank & Stop Summary (Patrol Issues) -->
        <div id="patrol-rank-stop-summary"></div>
        </div>

        <div id="issue-subview-registry" class="space-y-5">
        <!-- Issue Register -->
        <div id="issue-registry-card" class="ds-table-wrap scroll-mt-24" data-patrol-card-image="patrol-issue-registry">
          <div class="px-6 py-4 border-b border-slate-100">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-slate-700 text-sm">ทะเบียนปัญหา</h3>
                <span id="issue-count-badge" class="text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-400 font-mono">ทั้งหมด ${total}</span>
              </div>
              <div class="flex flex-wrap items-center justify-end gap-2" data-patrol-card-ignore>
                <div class="relative">
                  <button id="issue-export-button" type="button" onclick="window._issueToggleExportMenu()" aria-haspopup="menu" aria-controls="issue-export-menu" aria-busy="false" class="flex min-h-9 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-all disabled:pointer-events-none">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Export
                  </button>
                  <div id="issue-export-menu" class="absolute right-0 top-full z-30 mt-2 hidden w-64 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl">
                    <button type="button" data-issue-export-kind="pdf-summary" onclick="window._issueExport('pdf-summary')" class="block w-full border-b border-slate-100 px-3 py-2.5 text-left hover:bg-red-50 disabled:pointer-events-none">
                      <span class="block text-xs font-bold text-red-700">PDF รายงานสรุป</span>
                      <span class="mt-0.5 block text-[10px] font-medium text-slate-400">ไฟล์เล็ก · ไม่มีหน้ารายละเอียดและรูปภาพ</span>
                    </button>
                    <button type="button" data-issue-export-kind="pdf-full" onclick="window._issueExport('pdf-full')" class="block w-full border-b border-slate-100 px-3 py-2.5 text-left hover:bg-red-50 disabled:pointer-events-none">
                      <span class="block text-xs font-bold text-red-700">PDF รายงานฉบับเต็ม</span>
                      <span class="mt-0.5 block text-[10px] font-medium text-slate-400">รายละเอียดและรูปภาพครบทุกปัญหา</span>
                    </button>
                    <button type="button" data-issue-export-kind="excel" onclick="window._issueExport('excel')" class="block w-full px-3 py-2.5 text-left text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:pointer-events-none">Excel</button>
                  </div>
                </div>
                <span id="issue-export-status" class="hidden text-[10px] font-bold text-slate-500" role="status" aria-live="polite"></span>
                <button onclick="window.openIssueForm('OPEN')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all" style="background:linear-gradient(135deg,#dc2626,#ef4444)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                  รายงานปัญหาใหม่
                </button>
              </div>
            </div>
            <!-- Search + connected filters row -->
            <div class="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_auto_auto_auto_auto_auto] gap-2 mb-3" data-patrol-card-ignore>
              <div class="relative flex-1">
                <svg class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input id="issue-search-input" type="text" placeholder="ค้นหาพื้นที่ คำอธิบาย เครื่องจักร..." value="${_searchQuery}"
                  class="w-full min-h-11 md:min-h-0 pl-8 pr-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 bg-slate-50 transition-all">
              </div>
              <button type="button" onclick="window._issueToggleMobileFilters(true)" class="md:hidden min-h-11 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black text-emerald-700">ตัวกรอง</button>
              <select id="issue-dept-filter" onchange="window._issueSetMultiFilterFromSelect('dept',this)"
                class="hidden md:block px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 bg-slate-50 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all min-w-[150px]">
                <option value="">ทุกส่วนงาน</option>
                ${_masterDepts.map(d => `<option value="${d.Name}" ${_filterDepts.includes(d.Name) ? 'selected' : ''}>${d.Name}</option>`).join('')}
              </select>
              <select id="issue-unit-filter" onchange="window._issueSetMultiFilterFromSelect('unit',this)"
                class="hidden md:block px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 bg-slate-50 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all min-w-[130px] ${_filterDepts.length ? '' : 'opacity-50'}">
                <option value="">ทุก Unit</option>
                ${_issueFilterUnitOptions().map(u => `<option value="${u.name}" ${_filterUnits.includes(u.name) ? 'selected' : ''}>${u.name}</option>`).join('')}
              </select>
              <select id="issue-year-filter" onchange="window._issueSetYear(this.value)"
                class="hidden md:block px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 bg-slate-50 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all min-w-[110px]"
                aria-label="กรองปีที่พบปัญหา">
                <option value="all">ทุกปี</option>
                ${_issueAvailableYears().map(year => `<option value="${year}" ${_issueYear === year ? 'selected' : ''}>ปี ${year}</option>`).join('')}
              </select>
              <select id="issue-page-size" onchange="window._issueSetPageSize(this.value)"
                class="hidden md:block px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 bg-slate-50 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all min-w-[120px]"
                aria-label="จำนวนรายการต่อหน้า">
                <option value="10" ${_issuePageSize === '10' ? 'selected' : ''}>10 รายการ</option>
                <option value="20" ${_issuePageSize === '20' ? 'selected' : ''}>20 รายการ</option>
                <option value="50" ${_issuePageSize === '50' ? 'selected' : ''}>50 รายการ</option>
                <option value="100" ${_issuePageSize === '100' ? 'selected' : ''}>100 รายการ</option>
                <option value="all" ${_issuePageSize === 'all' ? 'selected' : ''}>ทั้งหมด</option>
              </select>
            </div>
            <div class="hidden md:flex items-center gap-2 mb-3" data-patrol-card-ignore>
              <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400">Sort</span>
              <select id="issue-sort-filter" onchange="window._issueSetSort(this.value)"
                class="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 bg-slate-50 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all min-w-[170px]"
                aria-label="เรียงลำดับรายการปัญหา">
                <option value="urgent" ${_issueSort === 'urgent' ? 'selected' : ''}>เร่งด่วนก่อน</option>
                <option value="latest" ${_issueSort === 'latest' ? 'selected' : ''}>ล่าสุด</option>
                <option value="oldest" ${_issueSort === 'oldest' ? 'selected' : ''}>เก่าสุด</option>
                <option value="due" ${_issueSort === 'due' ? 'selected' : ''}>กำหนดใกล้สุด</option>
                <option value="id_desc" ${_issueSort === 'id_desc' ? 'selected' : ''}>Issue ID มากไปน้อย</option>
                <option value="area" ${_issueSort === 'area' ? 'selected' : ''}>พื้นที่</option>
              </select>
            </div>
            ${_issueActiveFilterChipsHtml()}
            <div id="issue-today-focus-wrap">${_issueTodayFocusHtml()}</div>
            <!-- Filter pills (functional) -->
            <div class="hidden md:flex flex-wrap gap-2 mt-2" id="issue-filter-bar" data-patrol-card-ignore>
              ${[
                { key:'all',     label:'ทั้งหมด',      dot:'' },
                { key:'open',    label:'รอแก้ไข',      dot:'bg-red-500' },
                { key:'temp',    label:'แก้ชั่วคราว',   dot:'bg-orange-400' },
                { key:'closed',  label:'เสร็จสิ้น',     dot:'bg-emerald-500' },
                { key:'high',    label:'ความเสี่ยงสูง',  dot:'bg-rose-600' },
                { key:'overdue', label:'เกินกำหนด',     dot:'bg-red-700' },
                { key:'pending_close', label:'Pending approval', dot:'bg-sky-500' },
              ].map(f => `
              <button data-filter="${f.key}"
                class="issue-filter-btn px-3 py-1.5 rounded-full text-[10px] font-bold transition-all flex items-center gap-1.5
                  ${_activeFilter === f.key ? 'text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600'}"
                style="${_activeFilter === f.key ? 'background:linear-gradient(135deg,#059669,#0d9488)' : ''}">
                ${f.dot ? `<span class="w-1.5 h-1.5 rounded-full ${f.dot} inline-block"></span>` : ''}
                ${f.label}
              </button>`).join('')}
            </div>
          </div>
          <div class="hidden md:block overflow-x-auto">
            <table class="ds-table text-sm text-left">
              <thead class="text-[10px] text-slate-400 uppercase bg-slate-50 border-b border-slate-100">
                <tr>
                  <th class="px-5 py-3 font-bold">ID</th>
                  <th class="px-5 py-3 font-bold">ภาพ</th>
                  <th class="px-5 py-3 font-bold">รายละเอียด / พื้นที่</th>
                  <th class="px-5 py-3 font-bold text-center">สถานะ</th>
                  <th class="px-4 py-3 font-bold text-center">กำหนด</th>
                  <th class="px-5 py-3 font-bold text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody id="issue-table-body" class="divide-y divide-slate-50">
                ${renderIssueRows(issuesArray)}
              </tbody>
            </table>
          </div>
          <div id="issue-mobile-cards" class="md:hidden bg-slate-50/70 p-3 space-y-3"></div>
          <div id="issue-pagination" class="px-4 sm:px-6 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-patrol-card-ignore></div>
        </div>
        ${_issueMobileFilterSheetHtml()}
        </div>
      </div>

    </div>

    <!-- FAB — shown only on issues tab -->
    <button id="issue-fab" onclick="openIssueForm('OPEN')" title="รายงานปัญหาเร่งด่วน"
      class="hidden fixed bottom-8 right-8 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-50 group border-4 border-white transition-transform hover:scale-110 active:scale-95"
      style="background:linear-gradient(135deg,#dc2626,#ef4444)">
      <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
      <span class="absolute right-16 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">รายงานเร่งด่วน</span>
    </button>`;

    // Initialize hero stats and FAB for default tab (patrol)
    renderStatsStrip(_personalStats);
    document.getElementById('issue-fab')?.classList.add('hidden');
    _renderIssueSubview();
    _renderIssueRegistry();

    function applyIssueFilter() {
        _renderIssueRegistry({ resetPage: true });
    }

    // Status filter pills
    document.getElementById('issue-filter-bar')?.addEventListener('click', e => {
        const btn = e.target.closest('.issue-filter-btn');
        if (!btn) return;
        _activeFilter = btn.dataset.filter;
        saveIssueFilterState();
        document.querySelectorAll('.issue-filter-btn').forEach(b => {
            const isActive = b.dataset.filter === _activeFilter;
            b.className = `issue-filter-btn px-3 py-1.5 rounded-full text-[10px] font-bold transition-all flex items-center gap-1.5 ${isActive ? 'text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600'}`;
            b.style.background = isActive ? 'linear-gradient(135deg,#059669,#0d9488)' : '';
        });
        applyIssueFilter();
    });

    // Text search
    let _searchDebounce;
    document.getElementById('issue-search-input')?.addEventListener('input', e => {
        clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(() => {
            _searchQuery = e.target.value.trim();
            saveIssueFilterState();
            applyIssueFilter();
            _refreshIssueAnalyticsViews();
        }, 250);
    });

    // Admin patrol employee search (บันทึกการเดินตรวจให้พนักงานทุกคน)
    if (isAdmin) {
        let _empSearchDebounce;
        const empInput = document.getElementById('patrol-emp-search-input');
        const empResults = document.getElementById('patrol-emp-search-results');
        if (empInput && empResults) {
            empInput.addEventListener('input', () => {
                clearTimeout(_empSearchDebounce);
                _empSearchDebounce = setTimeout(async () => {
                    const q = empInput.value.trim();
                    if (!q) { empResults.classList.add('hidden'); empResults.innerHTML = ''; return; }
                    empResults.classList.remove('hidden');
                    empResults.innerHTML = `<div class="text-xs text-slate-400 px-3 py-2">กำลังค้นหา...</div>`;
                    try {
                        const res = await API.get(`/patrol/employee-search?q=${encodeURIComponent(q)}`);
                        const data = res?.data || [];
                        if (!data.length) {
                            empResults.innerHTML = `<div class="text-xs text-slate-400 px-3 py-2">ไม่พบพนักงาน</div>`;
                            return;
                        }
                        empResults.innerHTML = `
                          <div class="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-lg">
                            ${data.map(emp => `
                              <button class="patrol-emp-result-row w-full text-left px-4 py-2.5 hover:bg-emerald-50 transition-colors border-b border-slate-50 last:border-0"
                                      data-id="${escHtml(emp.EmployeeID)}"
                                      data-name="${escHtml(emp.EmployeeName)}"
                                      data-dept="${escHtml(emp.Department || '')}">
                                <span class="font-bold text-sm text-slate-800">${escHtml(emp.EmployeeName)}</span>
                                <span class="ml-2 text-xs text-slate-400">${escHtml(emp.EmployeeID)}</span>
                                <span class="ml-2 text-xs text-slate-500">${escHtml(emp.Department || '')}</span>
                              </button>`).join('')}
                          </div>`;
                    } catch (err) {
                        empResults.innerHTML = `<div class="text-xs text-red-400 px-3 py-2">เกิดข้อผิดพลาด: ${escHtml(err.message)}</div>`;
                    }
                }, 300);
            });
            empResults.addEventListener('click', e => {
                const row = e.target.closest('.patrol-emp-result-row');
                if (!row) return;
                empInput.value = '';
                empResults.classList.add('hidden');
                empResults.innerHTML = '';
                window.openAdminRecordModal(row.dataset.id, row.dataset.name, 0);
            });
            // Close dropdown when clicking outside
            document.addEventListener('click', e => {
                if (!empInput.contains(e.target) && !empResults.contains(e.target)) {
                    empResults.classList.add('hidden');
                }
            }, { once: false });
        }
    }
}

// ─── Dept filter → rebuild unit dropdown ──────────────────────────────────────
function _issueFilterDept(deptName) {
    _filterDepts = deptName
        ? (_filterDepts.includes(deptName) ? _filterDepts.filter(name => name !== deptName) : [..._filterDepts, deptName])
        : [];
    _filterDept = _filterDepts[0] || '';
    const allowedUnits = new Set(_issueFilterUnitOptions().map(unit => unit.name));
    _filterUnits = _filterUnits.filter(unit => allowedUnits.has(unit));
    _filterUnit = _filterUnits[0] || '';
    if (deptName) _issueSubTab = 'registry';
    saveIssueFilterState();

    // Sync the dropdown in ทะเบียนปัญหา filter bar
    const deptSel = document.getElementById('issue-dept-filter');
    if (deptSel) Array.from(deptSel.options).forEach(option => { option.selected = _filterDepts.includes(option.value); });

    // Rebuild unit dropdown
    const unitSel = document.getElementById('issue-unit-filter');
    if (unitSel) {
        const units = _issueFilterUnitOptions();
        unitSel.innerHTML = `<option value="">ทุก Unit</option>` +
            units.map(u => `<option value="${u.name}" ${_filterUnits.includes(u.name) ? 'selected' : ''}>${u.name}</option>`).join('');
        unitSel.className = unitSel.className.replace('opacity-50', '') + (units.length ? '' : ' opacity-50');
        unitSel.onchange = () => window._issueSetMultiFilterFromSelect('unit', unitSel);
    }

    // Refresh dept stats table (re-highlight active row + badge)
    renderDeptStats();

    _renderIssueRegistry({ resetPage: true });
    _renderIssueSubview();

    // Scroll to ทะเบียนปัญหา section smoothly
    if (deptName) {
        document.getElementById('issue-table-body')?.closest('.ds-table-wrap, .bg-white')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ─── Rank / Stop filter (from summary cards) ──────────────────────────────────
function _applyIssueTableFilter() {
    if (_filterRank || _filterStops.length || _filterArea) _issueSubTab = 'registry';
    saveIssueFilterState();
    _renderIssueSubview();
    _renderIssueRegistry({ resetPage: true });
    renderAreaStats();
    renderDeptStats();
    renderRankASpotlight();
    renderRankStopSummary();
    renderRankASpotlight();
}

function _issueFilterUnitOptions() {
    if (!_filterDepts.length) return _masterUnits;
    const deptIds = new Set(_masterDepts
        .filter(dept => _filterDepts.includes(dept.Name))
        .map(dept => String(dept.id || dept.ID)));
    return _masterUnits.filter(unit => deptIds.has(String(unit.department_id)));
}

window._issueSetMultiFilter = function(kind, values) {
    const clean = [...new Set((Array.isArray(values) ? values : [values]).map(String).filter(Boolean))];
    if (kind === 'dept') {
        _filterDepts = clean;
        _filterDept = clean[0] || '';
        const allowed = new Set(_issueFilterUnitOptions().map(unit => unit.name));
        _filterUnits = _filterUnits.filter(unit => allowed.has(unit));
        _filterUnit = _filterUnits[0] || '';
    } else if (kind === 'unit') {
        _filterUnits = clean;
        _filterUnit = clean[0] || '';
    } else if (kind === 'stop') {
        _filterStops = [...new Set(clean.map(Number).filter(n => n >= 1 && n <= 6))];
        _filterStop = _filterStops[0] || 0;
        _filterRank = '';
    }
    if (clean.length) _issueSubTab = 'registry';
    saveIssueFilterState();
    _applyIssueTableFilter();
};

window._issueSetMultiFilterFromSelect = function(kind, select) {
    window._issueSetMultiFilter(kind, Array.from(select?.selectedOptions || []).map(option => option.value));
};

window._issueFilterRank = function(rank) {
    _filterRank = (_filterRank === rank) ? '' : rank;
    _filterStops = [];
    _filterStop = 0;
    saveIssueFilterState();
    _applyIssueTableFilter();
    document.getElementById('patrol-rank-stop-summary')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window._issueFilterStop = function(stopId) {
    const id = Number(stopId);
    _filterStops = id
        ? (_filterStops.includes(id) ? _filterStops.filter(value => value !== id) : [..._filterStops, id])
        : [];
    _filterStop = _filterStops[0] || 0;
    _filterRank = '';
    saveIssueFilterState();
    _applyIssueTableFilter();
    document.getElementById('patrol-rank-stop-summary')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window._issueClearRankStop = function() {
    _filterRank = '';
    _filterStops = [];
    _filterStop = 0;
    saveIssueFilterState();
    _applyIssueTableFilter();
};

// Click on unit row in stats table → filter issues by that unit
window._issueFilterUnit = function(unitName) {
    _filterUnits = unitName
        ? (_filterUnits.includes(unitName) ? _filterUnits.filter(name => name !== unitName) : [..._filterUnits, unitName])
        : [];
    _filterUnit = _filterUnits[0] || '';
    if (unitName) _issueSubTab = 'registry';
    saveIssueFilterState();

    // Sync dropdowns
    const deptSel = document.getElementById('issue-dept-filter');
    if (deptSel) Array.from(deptSel.options).forEach(option => { option.selected = _filterDepts.includes(option.value); });
    const unitSel = document.getElementById('issue-unit-filter');
    if (unitSel) Array.from(unitSel.options).forEach(option => { option.selected = _filterUnits.includes(option.value); });

    renderDeptStats();

    _renderIssueRegistry({ resetPage: true });
    _renderIssueSubview();

    if (unitName) {
        document.getElementById('issue-table-body')?.closest('.ds-table-wrap, .bg-white')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

// ─── Filter Logic ─────────────────────────────────────────────────────────────
function _normalizeDept(raw) {
    return _issueMultiValues(raw);
}

function _issueMultiValues(raw) {
    if (Array.isArray(raw)) return raw.map(v => String(v || '').trim()).filter(Boolean);
    const text = String(raw || '').trim();
    if (!text) return [];
    if (text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed.map(v => String(v || '').trim()).filter(Boolean) : [text];
        } catch (_) {}
    }
    return text.split(/\s*(?:\|+|;)\s*/).map(v => v.trim()).filter(Boolean);
}

function _issueMultiJson(values) {
    return JSON.stringify([...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))]);
}

function _formatIssueMulti(raw, fallback = '-') {
    const values = _issueMultiValues(raw);
    return values.length ? values.join(', ') : fallback;
}

function _issueStopIds(raw) {
    const ids = [];
    _issueMultiValues(raw).forEach(value => {
        const m = String(value || '').match(/STOP\s*(\d)/i);
        if (m) ids.push(Number(m[1]));
    });
    return [...new Set(ids.filter(id => id >= 1 && id <= 6))];
}

function _formatIssueHazardTypes(raw, fallback = '-') {
    const ids = _issueStopIds(raw);
    if (!ids.length) return fallback;
    return ids.map(id => {
        const stop = CCCF_STOP_TYPES.find(item => item.id === id);
        return stop ? `STOP ${id} ${stop.label}` : `STOP ${id}`;
    }).join(', ');
}

function _issueMultiChipsHtml(raw, kind = 'dept') {
    const values = kind === 'stop'
        ? _issueStopIds(raw).map(id => `STOP ${id}`)
        : _issueMultiValues(raw);
    const cls = kind === 'stop'
        ? 'bg-rose-50 text-rose-700 border-rose-100'
        : kind === 'unit'
            ? 'bg-sky-50 text-sky-700 border-sky-100'
            : 'bg-blue-50 text-blue-700 border-blue-100';
    return values.map(value => `<span class="px-1.5 py-0.5 rounded border text-[9px] font-semibold ${cls}">${escHtml(value)}</span>`).join('');
}

window._issueToggleMultiValue = function(inputId, value, checked) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const values = new Set(_issueMultiValues(input.value));
    if (checked) values.add(value);
    else values.delete(value);
    input.value = _issueMultiJson([...values]);
    if (inputId === 'if-resp-dept-hidden') window._issueSyncDeptMulti();
};

window._issueSetUnitSelection = function(select) {
    const input = document.getElementById('if-resp-unit');
    if (!input) return;
    input.value = _issueMultiJson(Array.from(select?.selectedOptions || []).map(option => option.value).filter(Boolean));
};

function _issueUnitCheckboxesHtml(units = [], selectedUnits = [], disabled = false) {
    if (!units.length) return '';
    const selected = new Set((selectedUnits || []).map(String));
    const disabledAttr = disabled ? 'disabled' : '';
    const labelStateClass = disabled
        ? 'cursor-not-allowed opacity-70'
        : 'cursor-pointer hover:border-sky-300 hover:bg-sky-50';
    return `
      <div class="rounded-xl border border-sky-100 bg-sky-50/60 p-3">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="text-xs font-bold text-sky-700">Safety Unit</p>
          <span class="text-[10px] font-semibold text-sky-500">เลือกได้มากกว่า 1 Unit</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${units.map(unit => {
              const name = String(unit.name || '').trim();
              if (!name) return '';
              const label = unit.short_code ? `${name} · ${unit.short_code}` : name;
              return `<label class="flex items-center gap-2 rounded-lg border border-sky-100 bg-white px-2.5 py-2 text-xs font-semibold text-sky-700 ${labelStateClass}">
                <input type="checkbox" class="rounded border-sky-200 text-sky-600 focus:ring-sky-300 disabled:cursor-not-allowed" value="${escHtml(name)}" ${selected.has(name) ? 'checked' : ''} ${disabledAttr}
                  onchange="window._issueToggleMultiValue('if-resp-unit', this.value, this.checked)">
                <span class="min-w-0 flex-1 truncate">${escHtml(label)}</span>
              </label>`;
          }).join('')}
        </div>
      </div>`;
}

window._issueSyncDeptMulti = function() {
    const input = document.getElementById('if-resp-dept-hidden');
    const container = document.getElementById('if-unit-container');
    if (!input || !container) return;
    _issueChangeDept(_issueMultiValues(input.value));
}

function _issueFoundYear(issue) {
    const raw = _issueFoundDate(issue);
    if (!raw) return '';
    const direct = String(raw).match(/^(\d{4})[-/]/);
    if (direct) return direct[1];
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? '' : String(parsed.getFullYear());
}

function _issueFoundDate(issue) {
    return issue?.DateFound || issue?.FoundDate || issue?.dateFound || issue?.foundDate || '';
}

function _issueAvailableYears() {
    return [...new Set(_allIssues.map(_issueFoundYear).filter(Boolean))]
        .sort((a, b) => Number(b) - Number(a));
}

function htmlToElement(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '').trim();
    return template.content.firstElementChild || document.createElement('span');
}

function _issueIdValue(issue) {
    const value = Number(issue?.IssueID || issue?.issueid || 0);
    return Number.isFinite(value) ? value : 0;
}

function _issueDateValue(value) {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function _issueUrgencyScore(issue) {
    const status = String(issue?.CurrentStatus || '').toLowerCase();
    const closed = status === 'closed';
    const temporary = status === 'temporary';
    const rankScore = issue?.Rank === 'A' ? 300 : issue?.Rank === 'B' ? 200 : issue?.Rank === 'C' ? 100 : 0;
    const dueTime = _issueDateValue(issue?.DueDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdue = !closed && dueTime && dueTime < today.getTime();
    const dueSoon = !closed && dueTime ? Math.max(0, 30 - Math.ceil((dueTime - today.getTime()) / 86400000)) : 0;
    return (closed ? 0 : 1000) + (overdue ? 500 : 0) + (temporary ? 120 : 180) + rankScore + dueSoon;
}

function _issueTodayWindow(issue) {
    if (!issue?.DueDate || issue.CurrentStatus === 'Closed') return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(issue.DueDate); due.setHours(0, 0, 0, 0);
    if (Number.isNaN(due.getTime())) return null;
    return Math.round((due - today) / 86400000);
}

function _issueApprovalStatus(issue = {}) {
    return String(issue?.CloseApprovalStatus || 'None').trim() || 'None';
}

function _issueHasPendingClose(issue = {}) {
    return _issueApprovalStatus(issue).toLowerCase() === 'pending';
}

function _issueApprovalBadgeHtml(issue = {}, compact = false) {
    const status = _issueApprovalStatus(issue);
    const map = {
        Pending: { cls: 'bg-sky-50 text-sky-700 border-sky-200', label: 'Pending approval / รออนุมัติ' },
        Approved: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Approved / อนุมัติแล้ว' },
        Rejected: { cls: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Rejected / ไม่อนุมัติ' },
    };
    const meta = map[status];
    if (!meta) return '';
    return `<span class="inline-flex items-center gap-1 rounded-full border px-${compact ? '2' : '2.5'} py-1 text-[10px] font-black ${meta.cls}">
      <span class="h-1.5 w-1.5 rounded-full bg-current"></span>${meta.label}
    </span>`;
}

function _issueIsDueSoon(issue) {
    const days = _issueTodayWindow(issue);
    return days !== null && days >= 0 && days <= 3;
}

function _issueSortedItems(items) {
    const sorted = [...items];
    sorted.sort((a, b) => {
        switch (_issueSort) {
            case 'latest':
                return _issueDateValue(_issueFoundDate(b)) - _issueDateValue(_issueFoundDate(a)) || _issueIdValue(b) - _issueIdValue(a);
            case 'oldest':
                return _issueDateValue(_issueFoundDate(a)) - _issueDateValue(_issueFoundDate(b)) || _issueIdValue(a) - _issueIdValue(b);
            case 'due':
                return (_issueDateValue(a.DueDate) || Number.MAX_SAFE_INTEGER) - (_issueDateValue(b.DueDate) || Number.MAX_SAFE_INTEGER) || _issueIdValue(b) - _issueIdValue(a);
            case 'id_desc':
                return _issueIdValue(b) - _issueIdValue(a);
            case 'area':
                return String(a.Area || '').localeCompare(String(b.Area || ''), 'th') || _issueIdValue(b) - _issueIdValue(a);
            case 'urgent':
            default:
                return _issueUrgencyScore(b) - _issueUrgencyScore(a) || _issueIdValue(b) - _issueIdValue(a);
        }
    });
    return sorted;
}

function _issuePageData() {
    const filtered = _issueSortedItems(getFilteredIssues(_allIssues, _activeFilter));
    const requestedSize = _issuePageSize === 'all' ? filtered.length || 1 : Number(_issuePageSize) || 10;
    const totalPages = _issuePageSize === 'all' ? 1 : Math.max(1, Math.ceil(filtered.length / requestedSize));
    _issuePage = Math.min(Math.max(1, Number(_issuePage) || 1), totalPages);
    const startIndex = _issuePageSize === 'all' ? 0 : (_issuePage - 1) * requestedSize;
    const pageItems = _issuePageSize === 'all'
        ? filtered
        : filtered.slice(startIndex, startIndex + requestedSize);
    return {
        filtered,
        pageItems,
        totalPages,
        start: filtered.length ? startIndex + 1 : 0,
        end: filtered.length ? startIndex + pageItems.length : 0,
    };
}

function _issuePageButtons(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
    const pages = new Set([1, total, current - 1, current, current + 1]);
    const sorted = [...pages].filter(page => page >= 1 && page <= total).sort((a, b) => a - b);
    const result = [];
    sorted.forEach((page, index) => {
        if (index && page - sorted[index - 1] > 1) result.push('ellipsis');
        result.push(page);
    });
    return result;
}

function _renderIssuePagination(data) {
    const el = document.getElementById('issue-pagination');
    if (!el) return;
    const buttonClass = 'min-w-8 h-8 px-2 rounded-lg border text-xs font-bold transition-colors';
    const pageButtons = _issuePageSize === 'all' || data.totalPages <= 1
        ? ''
        : _issuePageButtons(_issuePage, data.totalPages).map(page => page === 'ellipsis'
            ? '<span class="px-1 text-slate-300">...</span>'
            : `<button type="button" onclick="window._issueGoPage(${page})" class="${buttonClass} ${page === _issuePage ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700'}">${page}</button>`
        ).join('');
    el.innerHTML = `
      <p class="text-xs text-slate-500">แสดง <span class="font-bold text-slate-700">${data.start}-${data.end}</span> จาก <span class="font-bold text-slate-700">${data.filtered.length}</span> รายการ</p>
      ${_issuePageSize === 'all' || data.totalPages <= 1 ? '' : `
      <div class="flex items-center gap-1">
        <button type="button" onclick="window._issueGoPage(${_issuePage - 1})" ${_issuePage <= 1 ? 'disabled' : ''} class="${buttonClass} bg-white border-slate-200 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:border-emerald-300">ก่อนหน้า</button>
        ${pageButtons}
        <button type="button" onclick="window._issueGoPage(${_issuePage + 1})" ${_issuePage >= data.totalPages ? 'disabled' : ''} class="${buttonClass} bg-white border-slate-200 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:border-emerald-300">ถัดไป</button>
      </div>`}`;
}

function _issueStatusLabel(key = _activeFilter) {
    if (key === 'due_soon') return 'Due in 3 days';
    if (key === 'rank_a_open') return 'Open Rank A';
    if (key === 'pending_close') return 'Pending approval';
    return ({
        all: 'ทั้งหมด',
        open: 'รอแก้ไข',
        temp: 'แก้ชั่วคราว',
        closed: 'เสร็จสิ้น',
        high: 'ความเสี่ยงสูง',
        overdue: 'เกินกำหนด',
    })[key] || 'ทั้งหมด';
}

function _issueSortLabel(key = _issueSort) {
    return ({
        urgent: 'เร่งด่วนก่อน',
        latest: 'ล่าสุด',
        oldest: 'เก่าสุด',
        due: 'กำหนดใกล้สุด',
        id_desc: 'Issue ID มากไปน้อย',
        area: 'พื้นที่',
    })[key] || 'เร่งด่วนก่อน';
}

function _issueActiveFilterChipsHtml() {
    const chips = [];
    if (_issueYear !== 'all') chips.push({ label: `ปี ${_issueYear}`, clear: "window._issueSetYear('all')" });
    if (_activeFilter !== 'all') chips.push({ label: _issueStatusLabel(), clear: "window._issueSetMobileStatus('all')" });
    _filterDepts.forEach(dept => chips.push({ label: dept, clear: `window._issueFilterDept(${JSON.stringify(dept)})` }));
    _filterUnits.forEach(unit => chips.push({ label: `Unit ${unit}`, clear: `window._issueFilterUnit(${JSON.stringify(unit)})` }));
    if (_filterArea) chips.push({ label: _filterArea, clear: "window._issueFilterArea('')" });
    if (_filterRank) chips.push({ label: `Rank ${_filterRank}`, clear: "window._issueFilterRank('')" });
    _filterStops.forEach(stop => chips.push({ label: `STOP ${stop}`, clear: `window._issueFilterStop(${stop})` }));
    if (_searchQuery) chips.push({ label: `ค้นหา: ${_searchQuery}`, clear: "document.getElementById('issue-search-input').value='';window._issueSetSearch?.('')" });
    chips.push({ label: `Sort: ${_issueSortLabel()}`, clear: '' });
    return `
      <div class="mt-2 flex flex-wrap items-center gap-2 md:hidden" id="issue-active-filter-chips">
        ${chips.map(chip => `
          <button type="button" ${chip.clear ? `onclick="${chip.clear}"` : ''}
            class="min-h-8 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 active:bg-emerald-100">
            ${escHtml(chip.label)} ${chip.clear ? '<span class="ml-1 text-emerald-500">×</span>' : ''}
          </button>`).join('')}
        ${chips.length > 1 ? `<button type="button" onclick="window._issueClearFilters()" class="min-h-8 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-500 active:bg-slate-50">ล้างตัวกรอง</button>` : ''}
      </div>`;
}

function _issueTodayFocusHtml() {
    const issues = Array.isArray(_allIssues) ? _allIssues : [];
    const overdue = issues.filter(issue => issue.CurrentStatus !== 'Closed' && _issueTodayWindow(issue) < 0);
    const dueSoon = issues.filter(_issueIsDueSoon);
    const rankAOpen = issues.filter(issue => issue.Rank === 'A' && issue.CurrentStatus !== 'Closed');
    const pendingClose = issues.filter(_issueHasPendingClose);
    const closed = issues.filter(issue => issue.CurrentStatus === 'Closed');
    const total = issues.length || 1;
    const closePct = Math.round((closed.length / total) * 100);
    const card = ({ key, label, value, hint, tone, icon }) => {
        const active = _activeFilter === key;
        const cls = active
            ? 'ring-2 ring-offset-1 ring-emerald-300 border-emerald-300'
            : 'border-slate-200 hover:border-emerald-200 hover:-translate-y-0.5';
        return `
          <button type="button" onclick="window._issueSetMobileStatus('${key}')"
            class="min-w-0 rounded-2xl border bg-white px-3 py-3 text-left shadow-sm transition-all ${cls}">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-[10px] font-black uppercase tracking-wide ${tone.text}">${label}</p>
                <p class="mt-1 text-2xl font-black text-slate-800">${value}</p>
              </div>
              <span class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${tone.bg} ${tone.text}">
                ${icon}
              </span>
            </div>
            <p class="mt-1 line-clamp-2 text-[11px] font-semibold text-slate-500">${hint}</p>
          </button>`;
    };
    return `
      <section id="issue-today-focus" class="mt-4 mb-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-3" data-patrol-card-ignore>
        <div class="mb-2 flex items-center justify-between gap-3">
          <div>
            <h4 class="text-xs font-black text-slate-700">Today focus / งานด่วนวันนี้</h4>
            <p class="text-[10px] font-semibold text-slate-400">Quick follow-up buckets / กลุ่มงานที่ต้องรีบติดตาม</p>
          </div>
          <button type="button" onclick="window._issueClearFilters()" class="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black text-slate-500 hover:text-emerald-700 sm:inline-flex">Reset</button>
        </div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          ${card({
              key: 'overdue',
              label: 'Overdue / เกินกำหนด',
              value: overdue.length,
              hint: 'Past due and not closed / ยังไม่ปิดงาน',
              tone: { bg: 'bg-rose-50', text: 'text-rose-700' },
              icon: '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M4.93 19h14.14L12 5 4.93 19z"/></svg>',
          })}
          ${card({
              key: 'due_soon',
              label: 'Due soon / ใกล้ครบกำหนด',
              value: dueSoon.length,
              hint: 'Due in next 3 days / ครบกำหนดใน 3 วัน',
              tone: { bg: 'bg-amber-50', text: 'text-amber-700' },
              icon: '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3M5 11h14M7 21h10a2 2 0 002-2V7H5v12a2 2 0 002 2z"/></svg>',
          })}
          ${card({
              key: 'rank_a_open',
              label: 'Open Rank A / Rank A ค้าง',
              value: rankAOpen.length,
              hint: 'High urgency still active / ความเสี่ยงสูงยังไม่ปิด',
              tone: { bg: 'bg-red-50', text: 'text-red-700' },
              icon: '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>',
          })}
          ${card({
              key: 'pending_close',
              label: 'Pending approval / รออนุมัติ',
              value: pendingClose.length,
              hint: 'Close requests waiting Admin / คำขอปิดงานรอแอดมิน',
              tone: { bg: 'bg-sky-50', text: 'text-sky-700' },
              icon: '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
          })}
          <div class="min-w-0 rounded-2xl border border-emerald-200 bg-white px-3 py-3 shadow-sm">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-[10px] font-black uppercase tracking-wide text-emerald-700">Close rate / อัตราปิดงาน</p>
                <p class="mt-1 text-2xl font-black text-slate-800">${closePct}%</p>
              </div>
              <span class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full bg-emerald-500" style="width:${Math.min(100, closePct)}%"></div>
            </div>
            <p class="mt-1 text-[11px] font-semibold text-slate-500">${closed.length}/${issues.length} closed / ปิดแล้ว</p>
          </div>
        </div>
      </section>`;
}

function _issueFilterDropdownLabel(allLabel, selected, options, max = 2) {
    const selectedLabels = (selected || [])
        .map(value => options.find(option => String(option.value) === String(value))?.label || value)
        .filter(Boolean);
    if (!selectedLabels.length) return allLabel;
    if (selectedLabels.length <= max) return selectedLabels.join(', ');
    return `${selectedLabels.slice(0, max).join(', ')} +${selectedLabels.length - max}`;
}

function _issueFilterDropdownHtml(kind, label, allLabel, options, selected = []) {
    const selectedSet = new Set((selected || []).map(String));
    const safeKind = escHtml(kind);
    const menuId = `issue-${safeKind}-dropdown`;
    return `
      <div class="relative hidden md:block min-w-[150px]">
        <button type="button" onclick="window._issueToggleFilterDropdown('${safeKind}')"
          class="w-full min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-bold text-slate-600 hover:border-emerald-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all">
          <span class="block text-[9px] uppercase tracking-wide text-slate-400">${escHtml(label)}</span>
          <span class="mt-0.5 flex items-center justify-between gap-2">
            <span class="truncate">${escHtml(_issueFilterDropdownLabel(allLabel, selected, options))}</span>
            <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </span>
        </button>
        <div id="${menuId}" class="issue-filter-dropdown-menu absolute left-0 top-full z-40 mt-2 hidden w-72 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl">
          <div class="max-h-72 overflow-y-auto p-2 custom-scrollbar">
            <label class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
              <input type="checkbox" class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-400" ${selectedSet.size ? '' : 'checked'}
                onchange="window._issueSetMultiFilter('${safeKind}', [])">
              <span>${escHtml(allLabel)}</span>
            </label>
            ${options.map(option => `
            <label class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <input type="checkbox" class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
                value="${escHtml(option.value)}" ${selectedSet.has(String(option.value)) ? 'checked' : ''}
                onchange="window._issueToggleMultiFilterValue('${safeKind}', this.value, this.checked)">
              <span class="truncate">${escHtml(option.label)}</span>
            </label>`).join('')}
          </div>
        </div>
      </div>`;
}

window._issueToggleFilterDropdown = function(kind) {
    const target = document.getElementById(`issue-${kind}-dropdown`);
    document.querySelectorAll('.issue-filter-dropdown-menu').forEach(menu => {
        if (menu !== target) menu.classList.add('hidden');
    });
    target?.classList.toggle('hidden');
};

window._issueToggleMultiFilterValue = function(kind, value, checked) {
    const current = kind === 'dept' ? _filterDepts : kind === 'unit' ? _filterUnits : _filterStops.map(String);
    const next = checked
        ? [...new Set([...current.map(String), String(value)])]
        : current.map(String).filter(item => item !== String(value));
    window._issueSetMultiFilter(kind, next);
};

function _issueMobileFilterSheetHtml() {
    const statusOptions = [
        ['all', 'ทั้งหมด'],
        ['open', 'รอแก้ไข'],
        ['temp', 'แก้ชั่วคราว'],
        ['closed', 'เสร็จสิ้น'],
        ['high', 'Rank A'],
        ['overdue', 'เกินกำหนด'],
        ['pending_close', 'Pending approval / ?????????'],
    ];
    const sortOptions = [
        ['urgent', 'เร่งด่วนก่อน'],
        ['latest', 'ล่าสุด'],
        ['oldest', 'เก่าสุด'],
        ['due', 'กำหนดใกล้สุด'],
        ['id_desc', 'Issue ID มากไปน้อย'],
        ['area', 'พื้นที่'],
    ];
    const mobileUnits = _issueFilterUnitOptions();
    return `
      <div id="issue-mobile-filter-sheet" class="fixed inset-0 z-[80] hidden md:hidden" aria-hidden="true">
        <button type="button" class="absolute inset-0 bg-slate-900/45" onclick="window._issueToggleMobileFilters(false)" aria-label="Close filters"></button>
        <section class="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white px-4 pt-4 shadow-2xl" style="padding-bottom:calc(env(safe-area-inset-bottom,0px) + 1rem)">
          <div class="mx-auto mb-3 h-1 w-12 rounded-full bg-slate-200"></div>
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-black text-slate-800">ตัวกรองปัญหา</p>
              <p class="text-[11px] font-bold text-slate-400">ใช้ร่วมกับทะเบียนและ Hotspot</p>
            </div>
            <button type="button" onclick="window._issueToggleMobileFilters(false)" class="min-h-10 min-w-10 rounded-full bg-slate-100 text-slate-500">×</button>
          </div>
          <div class="grid grid-cols-1 gap-3">
            <label class="text-xs font-bold text-slate-500">ปี
              <select onchange="window._issueSetYear(this.value)" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold">
                <option value="all">ทุกปี</option>
                ${_issueAvailableYears().map(year => `<option value="${year}" ${_issueYear === year ? 'selected' : ''}>ปี ${year}</option>`).join('')}
              </select>
            </label>
            <label class="text-xs font-bold text-slate-500">ส่วนงาน
              <select onchange="window._issueSetMultiFilterFromSelect('dept',this)" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold">
                <option value="">ทุกส่วนงาน</option>
                ${_masterDepts.map(d => `<option value="${escHtml(d.Name)}" ${_filterDepts.includes(d.Name) ? 'selected' : ''}>${escHtml(d.Name)}</option>`).join('')}
              </select>
            </label>
            <label class="text-xs font-bold text-slate-500">Unit
              <select onchange="window._issueSetMultiFilterFromSelect('unit',this)" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold">
                <option value="">ทุก Unit</option>
                ${mobileUnits.map(u => `<option value="${escHtml(u.name)}" ${_filterUnits.includes(u.name) ? 'selected' : ''}>${escHtml(u.name)}</option>`).join('')}
              </select>
            </label>
            <label class="text-xs font-bold text-slate-500">สถานะ
              <select onchange="window._issueSetMobileStatus(this.value)" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold">
                ${statusOptions.map(([value, label]) => `<option value="${value}" ${_activeFilter === value ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="text-xs font-bold text-slate-500">Rank
                <select onchange="window._issueFilterRank(this.value)" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold">
                  <option value="">ทุก Rank</option>
                  ${['A', 'B', 'C'].map(rank => `<option value="${rank}" ${_filterRank === rank ? 'selected' : ''}>Rank ${rank}</option>`).join('')}
                </select>
              </label>
              <label class="text-xs font-bold text-slate-500">STOP
                <select onchange="window._issueSetMultiFilterFromSelect('stop',this)" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold">
                  <option value="0">ทุก STOP</option>
                  ${[1, 2, 3, 4, 5, 6].map(stop => `<option value="${stop}" ${_filterStops.includes(stop) ? 'selected' : ''}>STOP ${stop}</option>`).join('')}
                </select>
              </label>
            </div>
            <label class="text-xs font-bold text-slate-500">Area
              <select onchange="window._issueFilterArea(this.value)" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold">
                <option value="">ทุกพื้นที่</option>
                ${_patrolAreas.map(area => getPatrolAreaName(area)).filter(Boolean).map(area => `<option value="${escHtml(area)}" ${_filterArea === area ? 'selected' : ''}>${escHtml(area)}</option>`).join('')}
              </select>
            </label>
            <label class="text-xs font-bold text-slate-500">การเรียงลำดับ
              <select onchange="window._issueSetSort(this.value)" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold">
                ${sortOptions.map(([value, label]) => `<option value="${value}" ${_issueSort === value ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </label>
            <label class="text-xs font-bold text-slate-500">แสดงต่อหน้า
              <select onchange="window._issueSetPageSize(this.value)" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold">
                ${['10', '20', '50', '100', 'all'].map(size => `<option value="${size}" ${_issuePageSize === size ? 'selected' : ''}>${size === 'all' ? 'ทั้งหมด' : `${size} รายการ`}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="sticky bottom-0 mt-4 grid grid-cols-2 gap-2 bg-white pt-3">
            <button type="button" onclick="window._issueClearFilters()" class="min-h-11 rounded-xl border border-slate-200 text-sm font-black text-slate-600">ล้างตัวกรอง</button>
            <button type="button" onclick="window._issueToggleMobileFilters(false)" class="min-h-11 rounded-xl bg-emerald-600 text-sm font-black text-white">แสดงผล</button>
          </div>
        </section>
      </div>`;
}

function _renderIssueRegistry({ resetPage = false } = {}) {
    if (resetPage) _issuePage = 1;
    const data = _issuePageData();
    const tbody = document.getElementById('issue-table-body');
    const mobileCards = document.getElementById('issue-mobile-cards');
    const badge = document.getElementById('issue-count-badge');
    if (tbody) tbody.innerHTML = renderIssueRows(data.pageItems);
    if (mobileCards) mobileCards.innerHTML = renderIssueMobileCards(data.pageItems);
    if (badge) badge.textContent = `${data.filtered.length} / ${_allIssues.length}`;
    document.getElementById('issue-active-filter-chips')?.replaceWith(htmlToElement(_issueActiveFilterChipsHtml()));
    const focusWrap = document.getElementById('issue-today-focus-wrap');
    if (focusWrap) focusWrap.innerHTML = _issueTodayFocusHtml();
    const oldSheet = document.getElementById('issue-mobile-filter-sheet');
    const keepSheetOpen = !!oldSheet && !oldSheet.classList.contains('hidden');
    oldSheet?.replaceWith(htmlToElement(_issueMobileFilterSheetHtml()));
    if (keepSheetOpen) _issueToggleMobileFilters(true);
    _renderIssuePagination(data);

    const yearSelect = document.getElementById('issue-year-filter');
    if (yearSelect) {
        const currentYear = _issueAvailableYears().includes(_issueYear) ? _issueYear : 'all';
        if (currentYear !== _issueYear) {
            _issueYear = currentYear;
            saveIssueFilterState();
        }
        yearSelect.innerHTML = '<option value="all">ทุกปี</option>' +
            _issueAvailableYears().map(year => `<option value="${year}" ${year === currentYear ? 'selected' : ''}>ปี ${year}</option>`).join('');
        yearSelect.value = currentYear;
    }
    const pageSizeSelect = document.getElementById('issue-page-size');
    if (pageSizeSelect) pageSizeSelect.value = _issuePageSize;
    const sortSelect = document.getElementById('issue-sort-filter');
    if (sortSelect) sortSelect.value = _issueSort;
}

function _renderIssueSubview() {
    const registry = document.getElementById('issue-subview-registry');
    const stats = document.getElementById('issue-subview-stats');
    const registryButton = document.getElementById('issue-subtab-registry');
    const statsButton = document.getElementById('issue-subtab-stats');
    const showRegistry = _issueSubTab !== 'stats';
    registry?.classList.toggle('hidden', !showRegistry);
    stats?.classList.toggle('hidden', showRegistry);
    registryButton?.classList.toggle('bg-emerald-600', showRegistry);
    registryButton?.classList.toggle('text-white', showRegistry);
    registryButton?.classList.toggle('text-slate-500', !showRegistry);
    statsButton?.classList.toggle('bg-emerald-600', !showRegistry);
    statsButton?.classList.toggle('text-white', !showRegistry);
    statsButton?.classList.toggle('text-slate-500', showRegistry);
    registryButton?.setAttribute('aria-selected', String(showRegistry));
    statsButton?.setAttribute('aria-selected', String(!showRegistry));
}

function _issueSwitchSubTab(tab) {
    _issueSubTab = tab === 'stats' ? 'stats' : 'registry';
    saveIssueFilterState();
    _renderIssueSubview();
    if (_issueSubTab === 'registry') {
        _renderIssueRegistry();
    } else {
        renderAreaStats();
        renderDeptStats();
        renderStopRankStats();
        renderRankStopSummary();
    }
}

function _refreshIssueAnalyticsViews() {
    renderAreaStats();
    renderDeptStats();
    renderRankASpotlight();
    renderStopRankStats();
    renderRankStopSummary();
    renderRankASpotlight();
}

function _issueSetYear(year) {
    _issueYear = /^\d{4}$/.test(String(year || '')) ? String(year) : 'all';
    saveIssueFilterState();
    _renderIssueRegistry({ resetPage: true });
    _refreshIssueAnalyticsViews();
}

function _issueSetPageSize(size) {
    _issuePageSize = ['10', '20', '50', '100', 'all'].includes(String(size)) ? String(size) : '10';
    try { localStorage.setItem(ISSUE_PAGE_SIZE_KEY, _issuePageSize); } catch (_) {}
    _renderIssueRegistry({ resetPage: true });
}

function _issueSetSort(sort) {
    _issueSort = ['urgent', 'latest', 'oldest', 'due', 'id_desc', 'area'].includes(String(sort)) ? String(sort) : 'urgent';
    saveIssueFilterState();
    _renderIssueRegistry({ resetPage: true });
}

function _issueSetSearch(value) {
    _searchQuery = String(value || '').trim();
    saveIssueFilterState();
    _renderIssueRegistry({ resetPage: true });
    _refreshIssueAnalyticsViews();
}

function _issueSetMobileStatus(status) {
    _activeFilter = ['all', 'open', 'temp', 'closed', 'high', 'overdue', 'due_soon', 'rank_a_open', 'pending_close'].includes(String(status)) ? String(status) : 'all';
    saveIssueFilterState();
    _renderIssueRegistry({ resetPage: true });
    _refreshIssueAnalyticsViews();
}

function _issueToggleMobileFilters(force) {
    const sheet = document.getElementById('issue-mobile-filter-sheet');
    if (!sheet) return;
    const open = typeof force === 'boolean' ? force : sheet.classList.contains('hidden');
    sheet.classList.toggle('hidden', !open);
    sheet.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('overflow-hidden', open);
}

function _issueToggleExportMenu(force) {
    const menu = document.getElementById('issue-export-menu');
    if (!menu) return;
    const open = typeof force === 'boolean' ? force : menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !open);
}

const ISSUE_EXPORT_LOCK_KEY = 'issue-export';

function _issueExportLabel(kind) {
    if (kind === 'pdf-summary') return 'PDF สรุป';
    if (kind === 'pdf-full' || kind === 'pdf') return 'PDF ฉบับเต็ม';
    return 'Excel';
}

function _setIssueExportBusy(kind, busy, detail = '') {
    const mainButton = document.getElementById('issue-export-button');
    const menuButtons = Array.from(document.querySelectorAll('[data-issue-export-kind]'));
    const status = document.getElementById('issue-export-status');
    const label = _issueExportLabel(kind);

    if (mainButton) {
        if (!mainButton.dataset.originalHtml) mainButton.dataset.originalHtml = mainButton.innerHTML;
        mainButton.disabled = busy;
        mainButton.setAttribute('aria-busy', String(busy));
        mainButton.classList.toggle('cursor-wait', busy);
        mainButton.classList.toggle('opacity-75', busy);
        mainButton.innerHTML = busy
            ? `<span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" aria-hidden="true"></span><span>กำลังสร้าง ${label}...</span>`
            : mainButton.dataset.originalHtml;
    }
    menuButtons.forEach(button => {
        button.disabled = busy;
        button.setAttribute('aria-disabled', String(busy));
        button.classList.toggle('cursor-wait', busy);
        button.classList.toggle('opacity-50', busy);
    });
    if (status) {
        status.textContent = busy ? (detail || `กำลังเตรียมไฟล์ ${label} กรุณารอสักครู่`) : '';
        status.classList.toggle('hidden', !busy);
    }
}

async function _runIssueExport(kind, worker) {
    if (_patrolActionLocks.has(ISSUE_EXPORT_LOCK_KEY)) {
        showToast('กำลังสร้างไฟล์ส่งออกอยู่ กรุณารอให้เสร็จก่อน', 'warning');
        return;
    }
    const label = _issueExportLabel(kind);
    _patrolActionLocks.add(ISSUE_EXPORT_LOCK_KEY);
    _setIssueExportBusy(kind, true);
    showLoading(`กำลังเตรียมข้อมูลสำหรับ ${label}...`);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
        return await worker();
    } catch (err) {
        console.error(`${label} export error:`, err);
        showToast(getReadableError(err, `ส่งออก ${label} ไม่สำเร็จ`), 'error');
    } finally {
        hideLoading();
        _setIssueExportBusy(kind, false);
        _patrolActionLocks.delete(ISSUE_EXPORT_LOCK_KEY);
    }
}

async function _issueExport(kind) {
    _issueToggleExportMenu(false);
    if (kind === 'pdf-summary') return exportIssuesToPDF('summary');
    if (kind === 'pdf-full' || kind === 'pdf') return exportIssuesToPDF('full');
    return exportIssuesToExcel();
}

function _issueClearFilters() {
    _activeFilter = 'all';
    _searchQuery = '';
    _filterDept = '';
    _filterUnit = '';
    _filterDepts = [];
    _filterUnits = [];
    _filterRank = '';
    _filterStop = 0;
    _filterStops = [];
    _filterArea = '';
    _issueYear = 'all';
    _issueSort = 'urgent';
    _issuePage = 1;
    saveIssueFilterState();
    const searchInput = document.getElementById('issue-search-input');
    if (searchInput) searchInput.value = '';
    _renderIssueRegistry({ resetPage: true });
    _refreshIssueAnalyticsViews();
    _issueToggleMobileFilters(false);
}

function _issueGoPage(page) {
    _issuePage = Number(page) || 1;
    _renderIssueRegistry();
    document.getElementById('issue-registry-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function _issueOpenById(issueId, mode = 'VIEW') {
    const issue = _allIssues.find(item => String(item.IssueID || item.issueid) === String(issueId));
    if (!issue) {
        showToast('ไม่พบข้อมูลปัญหานี้ กรุณารีเฟรชแล้วลองใหม่', 'error');
        return;
    }
    openIssueForm(mode === 'EDIT' ? 'EDIT' : 'VIEW', normalizeApiObject(issue));
}

function _issuePageForIssue(issueId) {
    const list = _issueSortedItems(getFilteredIssues(_allIssues, _activeFilter));
    const index = list.findIndex(item => String(item.IssueID || item.issueid) === String(issueId));
    if (index < 0 || _issuePageSize === 'all') return 1;
    const size = Number(_issuePageSize) || 10;
    return Math.floor(index / size) + 1;
}

function _issueShowInRegistry(issueId) {
    const normalizedId = String(issueId || '').trim();
    const issue = _allIssues.find(item => String(item.IssueID || item.issueid) === normalizedId);
    if (!issue) {
        showToast('Cannot find this Patrol issue.', 'warning');
        return;
    }
    _rankAHotspotSelectedIssueId = normalizedId;
    _issueSubTab = 'registry';
    _issuePage = _issuePageForIssue(normalizedId);
    saveIssueFilterState();
    _renderIssueSubview();
    _renderIssueRegistry();
    requestAnimationFrame(() => {
        const safeId = window.CSS?.escape ? CSS.escape(normalizedId) : normalizedId.replace(/"/g, '\\"');
        const target = document.querySelector(`[data-issue-row-id="${safeId}"], [data-issue-card-id="${safeId}"]`);
        target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    });
}

function _issueShowOnHotspot(issueId) {
    const normalizedId = String(issueId || '').trim();
    const issue = _allIssues.find(item => String(item.IssueID || item.issueid) === normalizedId);
    if (!issue) {
        showToast('Cannot find this Patrol issue.', 'warning');
        return;
    }
    if (String(issue.Rank || '').toUpperCase() !== 'A') {
        showToast('Hotspot แสดงเฉพาะปัญหา Rank A', 'warning');
        return;
    }
    _rankAHotspotSelectedIssueId = normalizedId;
    const collapsedCluster = _rankAHotspotVisualMarkers(_rankAHotspotData().issueMarkers)
        .find(visual => visual.type === 'cluster' && visual.entries.some(entry => entry.issueId === normalizedId));
    if (collapsedCluster) _rankAHotspotExpandedClusterKey = collapsedCluster.key;
    _issueSubTab = 'stats';
    saveIssueFilterState();
    _renderIssueSubview();
    _refreshIssueAnalyticsViews();
    requestAnimationFrame(() => {
        const safeId = window.CSS?.escape ? CSS.escape(normalizedId) : normalizedId.replace(/"/g, '\\"');
        document.getElementById('rank-a-spotlight')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        document.querySelector(`[data-rank-a-hotspot-issue-id="${safeId}"]`)?.focus?.({ preventScroll: true });
    });
}

function getFilteredIssues(issues, filter) {
    const today = new Date(); today.setHours(0,0,0,0);
    let result;
    switch (filter) {
        case 'open':    result = issues.filter(i => i.CurrentStatus === 'Open'); break;
        case 'temp':    result = issues.filter(i => i.CurrentStatus === 'Temporary'); break;
        case 'closed':  result = issues.filter(i => i.CurrentStatus === 'Closed'); break;
        case 'high':    result = issues.filter(i => i.Rank === 'A'); break;
        case 'overdue': result = issues.filter(i => i.CurrentStatus !== 'Closed' && i.DueDate && new Date(i.DueDate) < today); break;
        case 'due_soon': result = issues.filter(_issueIsDueSoon); break;
        case 'rank_a_open': result = issues.filter(i => i.Rank === 'A' && i.CurrentStatus !== 'Closed'); break;
        case 'pending_close': result = issues.filter(_issueHasPendingClose); break;
        default:        result = issues;
    }
    if (_issueYear !== 'all') {
        result = result.filter(issue => _issueFoundYear(issue) === _issueYear);
    }
    // Dept filter
    if (_filterDepts.length) {
        result = result.filter(i => _filterDepts.some(dept => _normalizeDept(i.ResponsibleDept).includes(dept)));
    }
    // Unit filter
    if (_filterUnits.length) {
        result = result.filter(i => _filterUnits.some(unit => _issueMultiValues(i.ResponsibleUnit).includes(unit)));
    }
    // Area filter (from area stats table)
    if (_filterArea) {
        result = result.filter(i => (i.Area || '') === _filterArea);
    }
    // Rank filter (from Rank/Stop summary cards)
    if (_filterRank) {
        result = result.filter(i => i.Rank === _filterRank);
    }
    // Stop filter (from Rank/Stop summary cards)
    if (_filterStops.length) {
        result = result.filter(i => _filterStops.some(stop => _issueStopIds(i.HazardType).includes(stop)));
    }
    // Text search
    if (_searchQuery) {
        const q = _searchQuery.toLowerCase();
        result = result.filter(i =>
            (i.HazardDescription||'').toLowerCase().includes(q) ||
            (i.Area||'').toLowerCase().includes(q) ||
            (i.MachineName||'').toLowerCase().includes(q) ||
            _formatIssueMulti(i.ResponsibleDept, '').toLowerCase().includes(q) ||
            _formatIssueHazardTypes(i.HazardType, '').toLowerCase().includes(q) ||
            _formatIssueMulti(i.ResponsibleUnit, '').toLowerCase().includes(q)
        );
    }
    return result;
}

function validateIssueFormData(formData) {
    const actionType = String(formData.get('ActionType') || '');
    const required = (name, label) => {
        const value = formData.get(name);
        if (name === 'HazardType') return _issueMultiValues(value).length ? '' : label;
        return String(value || '').trim() ? '' : label;
    };
    const errors = [];
    if (actionType === 'UPDATE' && !isAdmin) {
        if (!String(formData.get('IssueID') || '').trim()) {
            errors.push('ไม่พบรหัสรายการปัญหา');
        }
        const hasFinal = String(formData.get('ActionDescription') || '').trim();
        if (hasFinal && !String(formData.get('FinishDate') || '').trim()) {
            errors.push('กรุณาระบุวันที่แก้ไขเสร็จสิ้น');
        }
        return errors;
    }
    if (!['OPEN', 'UPDATE'].includes(actionType)) return errors;
    if (actionType === 'UPDATE' && !String(formData.get('IssueID') || '').trim()) {
        errors.push('ไม่พบรหัสรายการปัญหา');
    }
    ['DateFound:กรุณาระบุวันที่พบปัญหา', 'Area:กรุณาเลือกพื้นที่ตรวจ', 'HazardType:กรุณาเลือกประเภทอันตราย', 'HazardDescription:กรุณาระบุรายละเอียดปัญหา', 'Rank:กรุณาเลือก Rank'].forEach(rule => {
        const [name, label] = rule.split(':');
        const err = required(name, label);
        if (err) errors.push(err);
    });
    const hasFinal = String(formData.get('ActionDescription') || '').trim();
    if (hasFinal && !String(formData.get('FinishDate') || '').trim()) {
        errors.push('กรุณาระบุวันที่แก้ไขเสร็จสิ้น');
    }
    return errors;
}

function renderIssueRows(issues) {
    if (!issues.length) return `<tr><td colspan="6" class="text-center py-12">
        <div class="mx-auto max-w-sm">
          <div class="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <p class="text-sm font-semibold text-slate-500">ไม่พบรายการปัญหาตามเงื่อนไข</p>
          <p class="text-xs text-slate-400 mt-1">ลองล้างตัวกรองหรือรายงานปัญหาใหม่หากพบจุดเสี่ยงระหว่าง Patrol</p>
        </div>
      </td></tr>`;
    if (!issues.length) return `<tr><td colspan="6" class="text-center py-10 text-sm text-slate-400">ไม่พบรายการที่ตรงกัน</td></tr>`;
    return issues.map(rawItem => renderIssueRow(rawItem)).join('');
}

function getIssueReporterLabel(issue) {
    const reporter = [
        issue?.ReporterName || issue?.FoundBy || '',
        issue?.ReporterTeam || issue?.FoundByTeam || '',
    ].filter(Boolean).join(' / ');
    return reporter || issue?.ReporterID || '-';
}

function canCurrentUserUpdateIssue(issue) {
    if (isAdmin) return true;
    return (issue?.CurrentStatus || '') !== 'Closed';
}

function renderIssueMobileCards(issues) {
    if (!issues.length) {
        return `<div class="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center">
          <div class="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <p class="text-sm font-bold text-slate-500">ไม่พบรายการปัญหาตามเงื่อนไข</p>
          <p class="text-xs text-slate-400 mt-1">ลองเปลี่ยนตัวกรองหรือคำค้นหา</p>
        </div>`;
    }
    return issues.map(rawItem => {
        const item = normalizeApiObject(rawItem);
        const issueId = item.IssueID || item.issueid || '';
        const selected = String(issueId) === String(_rankAHotspotSelectedIssueId || '');
        const isClosed = item.CurrentStatus === 'Closed';
        const isTemp = item.CurrentStatus === 'Temporary';
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const isOverdue = !isClosed && item.DueDate && new Date(item.DueDate) < today;
        const statusMeta = isClosed
            ? { cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'เสร็จสิ้น', dot: '#10b981' }
            : isTemp
                ? { cls: 'bg-orange-50 text-orange-700 border-orange-100', label: 'แก้ชั่วคราว', dot: '#f97316' }
                : { cls: 'bg-red-50 text-red-700 border-red-100', label: 'รอแก้ไข', dot: '#ef4444' };
        const rankMeta = item.Rank === 'A'
            ? { cls: 'bg-red-100 text-red-700', border: '#f43f5e' }
            : item.Rank === 'B'
                ? { cls: 'bg-orange-100 text-orange-700', border: '#fb923c' }
                : { cls: 'bg-emerald-100 text-emerald-700', border: '#10b981' };
        const statusVisual = getIssueStatusVisualMeta(item);
        const deptDisplay = _formatIssueMulti(item.ResponsibleDept, '');
        const unitDisplay = _formatIssueMulti(item.ResponsibleUnit, '');
        const reporterLabel = getIssueReporterLabel(item);
        const imgUrl = resolveFileUrl(item.BeforeImage) || 'https://placehold.co/96x96?text=No+Img';
        const foundDate = _issueFoundDate(item);
        const foundDateText = foundDate
            ? new Date(foundDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
            : 'ไม่ระบุ';
        const dueDateText = item.DueDate
            ? new Date(item.DueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
            : 'ไม่ระบุ';
        const canEdit = isAdmin || (!isClosed && canCurrentUserUpdateIssue(item));
        const approvalBadge = _issueApprovalBadgeHtml(item, true);
        return `<article data-issue-card-id="${escHtml(issueId)}" class="patrol-issue-mobile-card overflow-hidden rounded-2xl border shadow-sm ${selected ? 'ring-2 ring-sky-300 border-sky-200' : ''}" style="border-left:5px solid ${statusVisual.border};border-color:${statusVisual.ring};background:linear-gradient(135deg,${statusVisual.rowBg} 0%,#ffffff 54%)">
          <button type="button" onclick="window._issueOpenById(${_patrolJsArg(issueId)},'VIEW')" class="w-full p-3 text-left active:bg-slate-50">
            <div class="flex items-start gap-3">
              <div class="relative h-24 w-24 flex-shrink-0 rounded-2xl bg-slate-100 p-1 shadow-sm" style="border:2px solid ${statusVisual.ring}">
                <img src="${escHtml(imgUrl)}" alt="ภาพปัญหา #${escHtml(issueId)}" class="w-full h-full object-cover" loading="lazy" onerror="this.src='https://placehold.co/96x96?text=No+Img'">
                <span class="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white" style="background:${statusVisual.border}"></span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="text-[11px] font-mono font-bold text-slate-500">#${escHtml(issueId || '?')}</p>
                    <h4 class="mt-0.5 text-sm font-black text-slate-800 line-clamp-1">${escHtml(item.Area || 'ไม่ระบุพื้นที่')}</h4>
                  </div>
                  <span class="px-2 py-1 rounded-lg text-[10px] font-black ${rankMeta.cls}">Rank ${escHtml(item.Rank || '-')}</span>
                </div>
                <p class="mt-1 text-xs leading-5 text-slate-500 line-clamp-2">${escHtml(item.HazardDescription || 'ไม่มีรายละเอียด')}</p>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black shadow-sm" style="background:${statusVisual.softBg};border-color:${statusVisual.ring};color:${statusVisual.text}">
                    <span class="h-2 w-2 rounded-full" style="background:${statusVisual.border}"></span>${statusVisual.label}
                  </span>
                  ${isOverdue ? '<span class="px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-black">เกินกำหนด</span>' : ''}
                </div>
              </div>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <div class="rounded-xl bg-slate-50 px-2.5 py-2"><span class="block text-slate-400">วันที่พบ</span><span class="font-bold text-slate-700">${foundDateText}</span></div>
              <div class="rounded-xl ${isOverdue ? 'bg-red-50' : 'bg-slate-50'} px-2.5 py-2"><span class="block ${isOverdue ? 'text-red-400' : 'text-slate-400'}">กำหนดแก้ไข</span><span class="font-bold ${isOverdue ? 'text-red-700' : 'text-slate-700'}">${dueDateText}</span></div>
            </div>
            <div class="mt-2 flex flex-wrap gap-1">${_issueMultiChipsHtml(item.HazardType, 'stop')}${approvalBadge}</div>
            ${deptDisplay || unitDisplay ? `<div class="mt-2 flex flex-wrap items-center gap-1"><span class="text-[10px] font-bold text-slate-600">ผู้รับผิดชอบ:</span>${_issueMultiChipsHtml(item.ResponsibleDept, 'dept')}${_issueMultiChipsHtml(item.ResponsibleUnit, 'unit')}</div>` : ''}
            <div class="mt-1 text-[10px] text-slate-500 line-clamp-1"><span class="font-bold text-slate-600">ผู้รายงาน:</span> ${escHtml(reporterLabel)}</div>
          </button>
          <div class="grid ${item.Rank === 'A' ? (isAdmin ? 'grid-cols-4' : canEdit ? 'grid-cols-3' : 'grid-cols-2') : (isAdmin ? 'grid-cols-3' : canEdit ? 'grid-cols-2' : 'grid-cols-1')} border-t border-slate-100 bg-slate-50/70">
            <button type="button" onclick="window._issueOpenById(${_patrolJsArg(issueId)},'VIEW')" class="min-h-11 flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700 active:bg-emerald-50">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.235 3.932-5.732 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              ดูรายละเอียด
            </button>
            ${item.Rank === 'A' ? `<button type="button" onclick="window._issueShowOnHotspot(${_patrolJsArg(issueId)})" class="min-h-11 border-l border-slate-100 flex items-center justify-center gap-1.5 text-xs font-bold text-sky-700 active:bg-sky-50">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
              Hotspot
            </button>` : ''}
            ${canEdit ? `<button type="button" onclick="window._issueOpenById(${_patrolJsArg(issueId)},'EDIT')" class="min-h-11 border-l border-slate-100 flex items-center justify-center gap-1.5 text-xs font-bold text-orange-700 active:bg-orange-50">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              อัปเดต
            </button>` : ''}
            ${isAdmin ? `<button type="button" onclick="deleteIssue(${_patrolJsArg(issueId)})" class="min-h-11 border-l border-slate-100 flex items-center justify-center gap-1.5 text-xs font-bold text-red-600 active:bg-red-50">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              ลบ
            </button>` : ''}
          </div>
        </article>`;
    }).join('');
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
function generateMiniCalendarHTML(scheduleData) {
    const today = new Date();
    const year = today.getFullYear(), month = today.getMonth();
    const firstDay  = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Build a day → sessions map from _monthlySummary (has Status + team + area)
    const dayMap = {};
    const allSessions = Array.isArray(_monthlySummary) && _monthlySummary.length
        ? _monthlySummary
        : (Array.isArray(scheduleData) ? scheduleData : []);
    allSessions.forEach(s => {
        const d = s?.PatrolDate || s?.ScheduledDate;
        if (!d) return;
        const day = new Date(d).getDate();
        if (!dayMap[day]) dayMap[day] = [];
        dayMap[day].push(s);
    });

    let html = '';
    for (let i = 0; i < firstDay; i++) html += `<div class="h-8"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday   = day === today.getDate();
        const sessions  = dayMap[day] || [];
        const hasSess   = sessions.length > 0;
        const isPast    = new Date(year, month, day) < today && !isToday;
        const hasCompleted = sessions.some(s => s.Status === 'Completed');
        const hasMissed    = isPast && hasSess && !hasCompleted;

        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

        let cls   = 'h-8 flex items-center justify-center rounded-lg text-xs font-medium transition-all relative';
        let style = '';

        if (isToday) {
            cls   += ' text-white font-bold shadow-sm';
            style  = 'background:linear-gradient(135deg,#059669,#0d9488)';
        } else if (hasCompleted) {
            cls   += ' bg-emerald-500 text-white font-bold shadow-sm cursor-pointer hover:bg-emerald-600';
        } else if (hasMissed) {
            cls   += ' bg-amber-50 text-amber-600 border border-amber-200 font-bold cursor-pointer hover:bg-amber-100';
        } else if (hasSess) {
            cls   += ' bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold cursor-pointer hover:bg-emerald-100';
        } else {
            cls   += ' text-slate-400 hover:bg-slate-50 cursor-default';
        }

        const onclick = hasSess ? `onclick="openCalendarDay('${dateStr}')"` : '';
        html += `<div class="${cls}" style="${style}" ${onclick} title="${hasSess ? sessions.length+' session(s)' : ''}">${day}</div>`;
    }
    return html;
}

// Also update the legend in the calendar card
function getCalendarLegendHTML() {
    return `
      <div class="flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-md inline-block" style="background:linear-gradient(135deg,#059669,#0d9488)"></span>วันนี้</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-md bg-emerald-500 inline-block"></span>เดินแล้ว</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-md bg-emerald-50 border border-emerald-200 inline-block"></span>กำหนดเดิน</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-md bg-amber-50 border border-amber-200 inline-block"></span>ยังไม่ได้เดิน</span>
      </div>`;
}

// ─── Calendar Day Detail Modal ────────────────────────────────────────────────
async function openCalendarDay(dateStr) {
    const d = new Date(dateStr);
    const label = d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    openModal(label, `<div class="flex justify-center py-6"><div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div></div>`, 'max-w-md');
    try {
        const res = await API.get(`/patrol/day-detail?date=${dateStr}`);
        if (!res.success) { showError(res.message); return; }
        const { sessions, totalExpected, totalAttended, overallPct } = res.data;

        const isPast = new Date(dateStr) < new Date(new Date().toDateString());
        const overallColor = overallPct >= 80 ? '#059669' : overallPct >= 50 ? '#f59e0b' : '#ef4444';

        const html = `
        <div class="space-y-4">
          <!-- Overall summary strip -->
          ${totalExpected > 0 ? `
          <div class="rounded-xl p-4" style="background:linear-gradient(135deg,#064e3b,#065f46)">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-white/80">ภาพรวมวันนี้</span>
              <span class="text-sm font-bold text-white">${totalAttended}/${totalExpected} คน · ${overallPct}%</span>
            </div>
            <div class="w-full bg-white/20 rounded-full h-2.5 overflow-hidden">
              <div class="h-full rounded-full transition-all duration-700" style="width:${overallPct}%;background:${overallColor}"></div>
            </div>
          </div>` : ''}

          <!-- Per-session cards -->
          ${sessions.length === 0
            ? `<div class="text-center py-8 text-slate-400">
                <svg class="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <p class="text-sm font-medium">ไม่มีตารางการเดินตรวจ</p>
               </div>`
            : sessions.map(s => {
                const attended = s.AttendedCount || 0;
                const members  = s.MemberCount  || 0;
                const pct      = members > 0 ? Math.round((attended / members) * 100) : 0;
                const color    = pct >= 80 ? '#059669' : pct >= 50 ? '#f59e0b' : (isPast ? '#ef4444' : '#94a3b8');
                const statusLabel = s.Status === 'Completed' ? 'เสร็จสิ้น'
                    : isPast ? 'ยังไม่สมบูรณ์' : 'กำหนดการ';
                const statusCls = s.Status === 'Completed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : isPast ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500';
                return `
                <div class="border border-slate-100 rounded-xl overflow-hidden">
                  <div class="px-4 py-3 flex items-center gap-3" style="background:${s.TeamColor ? s.TeamColor+'18' : '#f8fafc'}">
                    <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${s.TeamColor || '#94a3b8'}"></span>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-bold text-slate-800 truncate">${s.TeamName || 'ไม่ระบุทีม'}</p>
                      <p class="text-[10px] text-slate-400">${s.AreaName || s.AreaCode || 'ไม่ระบุพื้นที่'} · รอบ ${s.PatrolRound}</p>
                    </div>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${statusCls}">${statusLabel}</span>
                  </div>
                  <div class="px-4 py-3">
                    <div class="flex items-center justify-between mb-1.5">
                      <span class="text-[10px] text-slate-500 font-medium">ผู้เข้าร่วม</span>
                      <span class="text-xs font-bold" style="color:${color}">${attended}/${members} คน (${pct}%)</span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div class="h-full rounded-full transition-all duration-700" style="width:${pct}%;background:${color}"></div>
                    </div>
                  </div>
                </div>`;
              }).join('')}
        </div>`;

        // Re-render modal body (same title, new content)
        openModal(label, html, 'max-w-md');
    } catch (err) { showError(err.message); }
}

// ─── Admin: Position Pass Threshold Settings ──────────────────────────────────
function openThresholdSettings() {
    if (!isAdmin) return;
    if (!_positionThresholds.length) {
        showToast('ยังไม่มีข้อมูลตำแหน่ง', 'error');
        return;
    }
    openModal('ตั้งค่าเกณฑ์ผ่านตามตำแหน่ง', `
    <div class="space-y-3">
      <p class="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
        กำหนด % ขั้นต่ำที่แต่ละตำแหน่งต้องเดินตรวจผ่าน (คำนวณจากจำนวนครั้งที่เดิน ÷ เป้าหมายรายปี)
      </p>
      <div class="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
        ${_positionThresholds.map(p => `
        <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors">
          <span class="text-sm text-slate-700 flex-1 truncate">${p.Name}</span>
          <div class="flex items-center gap-2 flex-shrink-0">
            <input type="number" id="thr-${p.id}" value="${p.PatrolPassPct}" min="0" max="100"
              class="w-16 text-center rounded-lg border border-slate-200 text-sm px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 font-bold">
            <span class="text-xs text-slate-400">%</span>
            <button onclick="savePositionThreshold(${p.id})"
              class="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors hover:opacity-90"
              style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก</button>
          </div>
        </div>`).join('')}
      </div>
    </div>`, 'max-w-lg');
}

async function savePositionThreshold(positionId) {
    const val = parseInt(document.getElementById(`thr-${positionId}`)?.value);
    if (isNaN(val) || val < 0 || val > 100) { showToast('ค่าต้องอยู่ระหว่าง 0–100', 'error'); return; }
    try {
        const res = await API.put(`/patrol/position-thresholds/${positionId}`, { PatrolPassPct: val });
        if (res.success) {
            showToast('บันทึกสำเร็จ', 'success');
            // update local cache
            const idx = _positionThresholds.findIndex(p => p.id === positionId);
            if (idx !== -1) _positionThresholds[idx].PatrolPassPct = val;
        } else showError(res.message);
    } catch (err) { showError(err.message); }
}

// ─── Issue Row ────────────────────────────────────────────────────────────────
function getDueDateBadge(item) {
    if (item.CurrentStatus === 'Closed') return '';
    if (!item.DueDate) return '';
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(item.DueDate); due.setHours(0,0,0,0);
    const diff = Math.round((due - today) / 86400000);
    if (diff < 0) {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-700 animate-pulse">เกิน ${Math.abs(diff)} วัน</span>`;
    } else if (diff === 0) {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-600">วันนี้!</span>`;
    } else if (diff <= 3) {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-50 text-orange-600">เหลือ ${diff} วัน</span>`;
    } else {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-slate-50 text-slate-400">เหลือ ${diff} วัน</span>`;
    }
}

function getIssueStatusVisualMeta(item) {
    const status = String(item?.CurrentStatus || '').toLowerCase();
    const today = new Date(); today.setHours(0,0,0,0);
    const isClosed = status === 'closed';
    const isTemp = status === 'temporary';
    const isOverdue = !isClosed && item?.DueDate && new Date(item.DueDate) < today;
    if (isClosed) {
        return {
            key: 'closed',
            label: '&#3648;&#3626;&#3619;&#3655;&#3592;&#3626;&#3636;&#3657;&#3609;',
            rowBg: '#f0fdf4',
            softBg: '#ecfdf5',
            border: '#10b981',
            text: '#047857',
            ring: '#bbf7d0',
            icon: 'M9 12.75 11.25 15 15 9.75',
        };
    }
    if (isTemp) {
        return {
            key: 'temporary',
            label: '&#3649;&#3585;&#3657;&#3594;&#3633;&#3656;&#3623;&#3588;&#3619;&#3634;&#3623;',
            rowBg: '#fff7ed',
            softBg: '#fffbeb',
            border: '#f97316',
            text: '#c2410c',
            ring: '#fed7aa',
            icon: 'M12 6v6l4 2',
        };
    }
    return {
        key: isOverdue ? 'overdue' : 'open',
        label: isOverdue ? '&#3648;&#3585;&#3636;&#3609;&#3585;&#3635;&#3627;&#3609;&#3604;' : '&#3619;&#3629;&#3649;&#3585;&#3657;&#3652;&#3586;',
        rowBg: isOverdue ? '#fff1f2' : '#fff7f7',
        softBg: isOverdue ? '#ffe4e6' : '#fef2f2',
        border: isOverdue ? '#be123c' : '#ef4444',
        text: isOverdue ? '#be123c' : '#dc2626',
        ring: isOverdue ? '#fecdd3' : '#fecaca',
        icon: 'M12 8v4m0 4h.01',
    };
}

function renderIssueStatusPanel(meta, dueBadge = '') {
    return `
      <div class="mx-auto inline-flex min-w-[128px] flex-col items-center rounded-2xl border px-3 py-2 shadow-sm"
        style="background:${meta.softBg};border-color:${meta.ring};color:${meta.text}">
        <span class="inline-flex items-center gap-1.5 text-[11px] font-black leading-none">
          <span class="flex h-5 w-5 items-center justify-center rounded-full text-white" style="background:${meta.border}">
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${meta.icon}"/>
            </svg>
          </span>
          ${meta.label}
        </span>
        ${dueBadge ? `<span class="mt-1">${dueBadge}</span>` : ''}
      </div>`;
}

function renderIssueRow(rawItem) {
    const item = normalizeApiObject(rawItem);
    const isClosed = item.CurrentStatus === 'Closed';
    const isTemp = item.CurrentStatus === 'Temporary';
    const issueId = item.IssueID || item.issueid || '';
    const selected = String(issueId) === String(_rankAHotspotSelectedIssueId || '');

    const today = new Date(); today.setHours(0,0,0,0);
    const isOverdue = !isClosed && item.DueDate && new Date(item.DueDate) < today;

    const statusMeta = isClosed
        ? { cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'เสร็จสิ้น', border: '#10b981' }
        : isTemp
            ? { cls: 'bg-orange-50 text-orange-700 border-orange-100', label: 'แก้ชั่วคราว', border: '#f97316' }
            : { cls: 'bg-red-50 text-red-700 border-red-100', label: 'รอแก้ไข', border: '#ef4444' };

    // Use Rank (A/B/C) for border — the form saves Rank, not Risk
    const statusVisual = getIssueStatusVisualMeta(item);
    const rankBorder = item.Rank === 'A' ? '#f43f5e' : item.Rank === 'B' ? '#fb923c' : item.Rank === 'C' ? '#10b981' : 'transparent';
    const rowBg = isOverdue ? 'bg-red-50/30' : '';
    const imgUrl = resolveFileUrl(item.BeforeImage) || 'https://placehold.co/96x96?text=IMG';

    // Normalize ResponsibleDept (may be plain string or legacy JSON array)
    const deptDisplay = _formatIssueMulti(item.ResponsibleDept, '');
    const unitDisplay = _formatIssueMulti(item.ResponsibleUnit, '');
    const reporterLabel = getIssueReporterLabel(item);
    const rankLabel = { A: 'Rank A', B: 'Rank B', C: 'Rank C' }[item.Rank] || '';

    let actionBtns = '';
    if (isAdmin || (!isClosed && canCurrentUserUpdateIssue(item))) {
        actionBtns = `<button onclick='event.stopPropagation();openIssueForm("EDIT",${JSON.stringify(item)})' class="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-orange-600 hover:border-orange-200 shadow-sm transition-all" title="${isClosed ? 'แก้ไข (Admin)' : 'อัปเดต / ปิดงาน'}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
        </button>`;
    }
    actionBtns += `<button onclick='event.stopPropagation();openIssueForm("VIEW",${JSON.stringify(item)})' class="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 shadow-sm transition-all ml-1" title="ดูรายละเอียด">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.235 3.932-5.732 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
    </button>`;
    if (isAdmin) {
        actionBtns += `<button onclick='event.stopPropagation();deleteIssue(${item.IssueID})' class="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 shadow-sm transition-all ml-1" title="ลบ (Admin)">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>`;
    }

    const dueBadge = getDueDateBadge(item);
    const dueDateStr = item.DueDate ? new Date(item.DueDate).toLocaleDateString('th-TH', { day:'numeric', month:'short' }) : '—';
    const approvalBadge = _issueApprovalBadgeHtml(item, true);

    return `<tr data-issue-row-id="${escHtml(issueId)}" class="transition-colors group cursor-pointer border-l-4 ${rowBg} ${selected ? 'ring-2 ring-inset ring-sky-200' : ''}" style="border-left-color:${isOverdue ? '#ef4444' : statusVisual.border};background:linear-gradient(90deg,${statusVisual.rowBg} 0%,#ffffff 42%)" onclick='openIssueForm("VIEW",${JSON.stringify(item)})'>
        <td class="px-5 py-4 align-middle">
            <div class="text-[10px] text-slate-400 font-mono">#${item.IssueID || '?'}</div>
            ${rankLabel ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block ${item.Rank === 'A' ? 'bg-red-100 text-red-600' : item.Rank === 'B' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}">${rankLabel}</span>` : ''}
        </td>
        <td class="px-5 py-3 align-middle">
            <div class="relative h-16 w-16 rounded-2xl bg-slate-100 p-1 shadow-sm transition-transform group-hover:scale-[1.04]" style="border:2px solid ${statusVisual.ring}">
                <img src="${imgUrl}" class="h-full w-full rounded-xl object-cover" loading="lazy" onerror="this.src='https://placehold.co/96x96?text=No+Img'">
                <span class="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white" style="background:${statusVisual.border}"></span>
            </div>
        </td>
        <td class="px-5 py-3 align-middle">
            <div class="font-bold text-slate-700 text-xs mb-0.5">${item.Area || 'ไม่ระบุพื้นที่'}</div>
            <div class="text-[10px] text-slate-400 line-clamp-1 max-w-[200px]">${item.HazardDescription || '—'}</div>
            <div class="flex flex-wrap gap-1 mt-1">${_issueMultiChipsHtml(item.HazardType, 'stop')}${approvalBadge}</div>
            ${deptDisplay || unitDisplay ? `<div class="flex flex-wrap gap-1 mt-1">
                ${_issueMultiChipsHtml(item.ResponsibleDept, 'dept')}
                ${_issueMultiChipsHtml(item.ResponsibleUnit, 'unit')}
            </div>` : ''}
            <div class="text-[9px] text-slate-400 mt-1 line-clamp-1">ผู้รายงาน: ${escHtml(reporterLabel)}</div>
        </td>
        <td class="px-5 py-4 text-center align-middle">
            ${renderIssueStatusPanel(statusVisual)}
        </td>
        <td class="px-4 py-4 text-center align-middle">
            <div class="text-[10px] text-slate-500 mb-1">${dueDateStr}</div>
            ${dueBadge}
        </td>
        <td class="px-5 py-4 text-right align-middle" onclick="event.stopPropagation()">
            <div class="flex items-center justify-end gap-0.5">${actionBtns}</div>
        </td>
    </tr>`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function getSkeletonHTML() {
    return `<div class="space-y-5 animate-pulse">
        <div class="h-48 bg-slate-100 rounded-2xl"></div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">${Array(4).fill('<div class="h-24 bg-slate-100 rounded-xl"></div>').join('')}</div>
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div class="xl:col-span-2 h-64 bg-slate-100 rounded-2xl"></div>
            <div class="h-64 bg-slate-100 rounded-2xl"></div>
        </div>
    </div>`;
}

// ─── Check-in Modal (Smart) ───────────────────────────────────────────────────
function openCheckInModal() {
    const today    = new Date();
    const displayUser = patrolDisplayUser();
    const checkinV2Enabled = Boolean(_myPlan?.features?.checkinV2Enabled);

    // ── ป้องกันเช็คอินซ้ำวันเดียวกัน ──────────────────────────────────────────
    const statsArr  = normalizeApiArray(window._lastStatsData || []);
    const myStat    = statsArr.find(r => r.Name === displayUser.name || r.EmployeeID === displayUser.id || r.UserID === displayUser.id) || {};
    const alreadyToday = myStat.LastWalk
        ? new Date(myStat.LastWalk).toDateString() === today.toDateString()
        : false;

    if (!checkinV2Enabled && alreadyToday && !window._skipDuplicateCheck) {
        const timeStr = new Date(myStat.LastWalk).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        openModal('เช็คอินซ้ำ?', `
          <div class="text-center py-2 space-y-4">
            <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto" style="background:#ecfdf5">
              <svg class="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            </div>
            <div>
              <p class="font-bold text-slate-700">คุณเช็คอินแล้ววันนี้</p>
              <p class="text-sm text-slate-400 mt-1">เวลา ${timeStr} น.</p>
            </div>
            <p class="text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-2.5">ต้องการบันทึกการเดินตรวจเพิ่มอีกครั้งหรือไม่?</p>
            <div class="flex gap-3 justify-center pt-1">
              <button onclick="window.closeModal&&window.closeModal()" class="px-5 py-2 rounded-xl text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium">ปิด</button>
              <button onclick="window.closeModal&&window.closeModal();window._forceCheckin()" class="px-5 py-2 rounded-xl text-sm font-bold text-white transition-colors" style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึกอีกครั้ง</button>
            </div>
          </div>`, 'max-w-sm');
        return;
    }
    // ──────────────────────────────────────────────────────────────────────────

    const todaySessions = (_myPlan?.sessions || []).filter(s => {
        const d = new Date(s.PatrolDate);
        return d.toDateString() === today.toDateString() && !patrolSessionCompleted(s) && !patrolSessionLeave(s);
    });
    const todaySess = todaySessions[0] || null;
    const isPatrolDay = !!todaySess;
    const isRequired  = todaySess ? (_myPlan?.required?.some(r => r.id === todaySess.id) ?? true) : false;
    const areaLabel   = todaySess ? (todaySess.AreaName || todaySess.AreaCode || '') : '';
    const areaCode    = todaySess ? (todaySess.AreaCode || '') : '';
    const todaySessionId = todaySess ? patrolSessionId(todaySess) : '';
    const compliance  = _myPlan?.compliance;
    const initialMode = checkinV2Enabled ? (todaySessions.length ? 'scheduled' : 'extra') : 'normal';
    const todayLabel = today.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

    const planBanner = _myPlan ? `
    <div class="rounded-xl overflow-hidden border border-slate-100">
      <div class="px-4 py-2.5 flex items-center gap-3" style="background:linear-gradient(135deg,${_myPlan.team.color}22,transparent);border-bottom:1px solid #f1f5f9">
        <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${_myPlan.team.color}"></span>
        <div class="flex-1">
          <p class="text-xs font-bold text-slate-800">${_myPlan.team.name}</p>
          <p class="text-[10px] text-slate-400">${areaLabel || 'ไม่มี session วันนี้'} ${todaySess ? '· รอบ '+todaySess.PatrolRound : ''}</p>
        </div>
        ${isPatrolDay
          ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 animate-pulse">วันเดินตรวจ</span>`
          : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">ไม่ใช่วันเดิน</span>`}
      </div>
      ${compliance ? `
      <div class="px-4 py-2 flex items-center justify-between bg-slate-50">
        <span class="text-[10px] text-slate-500">ความครบถ้วนเดือนนี้</span>
        <div class="text-right">
          <span class="block text-[10px] font-bold ${compliance.done?'text-emerald-600':'text-amber-600'}">${compliance.attended}/${compliance.required} รอบ ${compliance.done?'✓':''}</span>
          ${_myPlan?.actualActivity ? `<span class="block text-[9px] text-violet-600">เดินจริง ${_myPlan.actualActivity.total || 0} · เดินเพิ่ม ${_myPlan.actualActivity.extra || 0}</span>` : ''}
        </div>
      </div>` : ''}
    </div>` : '';

    openModal('บันทึกการเดินตรวจ', `
      <form id="checkin-form" data-today-session-id="${escHtml(todaySessionId)}" onsubmit="handleCheckInSubmit(event)" class="relative space-y-4 max-[420px]:space-y-3">
        <div id="checkin-submit-busy" class="hidden absolute inset-0 z-20 flex min-h-[360px] items-center justify-center rounded-2xl bg-white/90 px-5 text-center backdrop-blur-sm">
          <div>
            <div class="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent"></div>
            <p class="text-sm font-black text-slate-800">กำลังบันทึกการเช็คอิน…</p>
            <p class="mt-1 text-xs font-medium text-slate-500">กรุณารอสักครู่ และอย่าปิดหน้านี้</p>
          </div>
        </div>
        <!-- User info -->
        <div class="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-100">
            <span class="text-emerald-700 font-bold text-sm">${escHtml(displayUser.initial)}</span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-bold text-slate-800 text-sm truncate">${escHtml(displayUser.name || displayUser.id || '-')}</p>
            <p class="text-[10px] text-slate-400 truncate">${escHtml([displayUser.position, displayUser.department].filter(Boolean).join(' · ') || '-')}</p>
            <p class="text-[10px] text-slate-400 mt-0.5">Actual date: <span class="font-bold text-slate-600">${todayLabel}</span></p>
          </div>
        </div>

        ${planBanner}

        ${!isPatrolDay && _myPlan ? `
        <div class="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700 flex items-start gap-2">
          <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>วันนี้ไม่ใช่วันเดินตรวจตามตาราง สามารถ Check-in ได้แต่จะนับเป็นการเดินนอกตาราง</span>
        </div>` : ''}

        ${checkinV2Enabled ? `
        <input type="hidden" name="PatrolType" value="${initialMode === 'makeup' ? 'compensation' : 'normal'}">
        <div class="grid grid-cols-3 gap-2">
          ${[
            { value:'scheduled', label:'ตามรอบ', en:'Scheduled', tone:'emerald', disabled:!todaySessions.length },
            { value:'makeup', label:'เดินซ่อม', en:'Makeup', tone:'amber', disabled:false },
            { value:'extra', label:'เดินเพิ่ม', en:'Extra', tone:'violet', disabled:false },
          ].map(option => `<label class="${option.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}">
            <input type="radio" name="CheckinMode" value="${option.value}" class="peer sr-only" ${initialMode === option.value ? 'checked' : ''} ${option.disabled ? 'disabled' : ''} onchange="window._onCheckinTypeChange(this.value)">
            <div class="p-3 rounded-xl border-2 border-slate-100 bg-white text-center peer-checked:border-${option.tone}-500 peer-checked:bg-${option.tone}-50 transition-all">
              <p class="text-[11px] font-bold text-slate-700">${option.label}</p>
              <p class="text-[9px] text-slate-400">${option.en}</p>
            </div>
          </label>`).join('')}
        </div>
        <div id="checkin-today-row" class="${initialMode === 'scheduled' ? '' : 'hidden'}">
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">รอบตามตารางวันนี้ <span class="text-emerald-500">*</span></label>
          <select name="TodayScheduledSessionID" id="checkin-today-select" onchange="window._onCheckinTodaySessionChange()" class="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
            ${todaySessions.map(s => `<option value="${escHtml(patrolSessionId(s))}" data-area="${escHtml(s.AreaName || s.AreaCode || '')}" data-area-code="${escHtml(s.AreaCode || '')}">${escHtml(`${patrolDateOnly(s.PatrolDate)} · รอบ ${s.PatrolRound || '-'}${s.AreaName || s.AreaCode ? ' · ' + (s.AreaName || s.AreaCode) : ''}`)}</option>`).join('')}
          </select>
        </div>` : `
        <div class="grid grid-cols-2 gap-2">
          <label class="cursor-pointer"><input type="radio" name="PatrolType" value="normal" class="peer sr-only" checked onchange="window._onCheckinTypeChange(this.value)"><div class="p-3 rounded-xl border-2 border-slate-100 bg-white text-center peer-checked:border-emerald-500 peer-checked:bg-emerald-50"><p class="text-[11px] font-bold text-slate-700">ปกติ</p><p class="text-[9px] text-slate-400">Routine</p></div></label>
          <label class="cursor-pointer"><input type="radio" name="PatrolType" value="compensation" class="peer sr-only" onchange="window._onCheckinTypeChange(this.value)"><div class="p-3 rounded-xl border-2 border-slate-100 bg-white text-center peer-checked:border-violet-500 peer-checked:bg-violet-50"><p class="text-[11px] font-bold text-slate-700">เดินซ่อม</p><p class="text-[9px] text-slate-400">Makeup</p></div></label>
        </div>`}

        <!-- Missed session picker: shown only when เดินซ่อม is selected -->
        <div id="checkin-date-row" class="hidden">
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">
            ชดเชยรอบไหน <span class="text-violet-500">*</span>
          </label>
          <div id="checkin-missed-wrap">
            <div class="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-400">
              <div class="animate-spin rounded-full h-3.5 w-3.5 border-2 border-violet-400 border-t-transparent flex-shrink-0"></div>
              กำลังโหลดรอบที่ขาด...
            </div>
          </div>
          <select name="ScheduledSessionID" id="checkin-missed-select" onchange="window._onCheckinSessionChange()" class="hidden w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-all">
            <option value="">— เลือกรอบที่ต้องการชดเชย —</option>
          </select>
        </div>

        <!-- Area confirmation (Phase 2.2) -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">พื้นที่ที่เดินตรวจ</label>
          <select name="Area" id="checkin-area-select" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all">
            <option value="">— ไม่ระบุ —</option>
            ${(_patrolAreas.length
              ? _patrolAreas
              : [{ Name:'โรงงาน 1' },{ Name:'โรงงาน 2' },{ Name:'รอบนอก' }]
            ).map(a => {
                const name = getPatrolAreaName(a);
                const code = getPatrolAreaCode(a);
                const selected = patrolAreaMatches(a, areaLabel) || patrolAreaMatches(a, areaCode);
                return name ? `<option value="${escHtml(name)}" data-name="${escHtml(name)}" data-code="${escHtml(code)}" ${selected ? 'selected' : ''}>${escHtml(name)}${code && code !== name ? ` (${escHtml(code)})` : ''}</option>` : '';
            }).join('')}
          </select>
        </div>

        <!-- Observation notes (Phase 2.1) -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">บันทึกการตรวจ <span class="text-slate-300">(ไม่บังคับ)</span></label>
          <textarea name="Notes" rows="2" placeholder="เช่น สภาพพื้นที่โดยรวม, จุดที่ให้ความสนใจ..." class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all resize-none placeholder:text-slate-300"></textarea>
        </div>

        <button type="submit" class="w-full py-3 rounded-xl font-bold text-sm text-white shadow-sm transition-all active:scale-[0.98]" style="background:linear-gradient(135deg,#059669,#0d9488)">
          ยืนยันเช็คอิน
        </button>
      </form>`, 'max-w-md');
}

async function handleCheckInSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const submitButton = form?.querySelector('button[type="submit"]');
    if (submitButton?.disabled) return;
    const fd    = new FormData(e.target);
    const checkinV2Enabled = Boolean(_myPlan?.features?.checkinV2Enabled);
    const mode = checkinV2Enabled ? String(fd.get('CheckinMode') || '') : (fd.get('PatrolType') === 'compensation' ? 'makeup' : 'normal');
    const type  = mode === 'makeup' ? 'compensation' : 'normal';
    const area  = fd.get('Area') || null;
    const notes = fd.get('Notes')?.trim() || null;
    const body  = { PatrolType: type, Area: area, Notes: notes };
    if (checkinV2Enabled) {
        body.CheckinMode = mode;
        if (!form.dataset.idempotencyKey) {
            form.dataset.idempotencyKey = globalThis.crypto?.randomUUID?.() || `patrol:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        }
        body.IdempotencyKey = form.dataset.idempotencyKey;
    }
    if (mode === 'makeup') {
        const dateVal = fd.get('ScheduledSessionID');
        if (!dateVal) { showToast('กรุณาเลือกรอบที่ต้องการชดเชย', 'error'); return; }
        body.ScheduledSessionID = dateVal;
    } else if (mode === 'scheduled') {
        const scheduledSessionId = fd.get('TodayScheduledSessionID') || e.target?.dataset?.todaySessionId || '';
        if (!scheduledSessionId) { showToast('กรุณาเลือกรอบตามตารางวันนี้', 'error'); return; }
        body.ScheduledSessionID = scheduledSessionId;
    } else {
        const todaySessionId = e.target?.dataset?.todaySessionId || '';
        if (!checkinV2Enabled && todaySessionId) body.ScheduledSessionID = todaySessionId;
    }
    const busyLayer = document.getElementById('checkin-submit-busy');
    await runFormBusy(form, 'กำลังบันทึก…', async () => {
        busyLayer?.classList.remove('hidden');
        try {
            const res = await API.post('/patrol/checkin', body);
            closeModal();
            showCheckinSuccessScreen(type, res?.data || {});
        } catch (err) {
            showError(err);
        } finally {
            busyLayer?.classList.add('hidden');
        }
    }, { submitter: submitButton, actionKey: `patrol:checkin:${form.dataset.idempotencyKey || 'new'}` });
}

window._onCheckinTypeChange = async function(val) {
    const row  = document.getElementById('checkin-date-row');
    const wrap = document.getElementById('checkin-missed-wrap');
    const sel  = document.getElementById('checkin-missed-select');
    const todayRow = document.getElementById('checkin-today-row');
    const hiddenType = document.querySelector('#checkin-form input[type="hidden"][name="PatrolType"]');
    if (!row) return;

    const isMakeup = val === 'compensation' || val === 'makeup';
    if (hiddenType) hiddenType.value = isMakeup ? 'compensation' : 'normal';
    if (todayRow) todayRow.classList.toggle('hidden', val !== 'scheduled');

    if (!isMakeup) {
        row.classList.add('hidden');
        if (sel) { sel.required = false; sel.value = ''; sel.classList.add('hidden'); }
        if (wrap) wrap.classList.remove('hidden');
        return;
    }

    // แสดง section + loading spinner
    row.classList.remove('hidden');
    if (wrap) wrap.classList.remove('hidden');
    if (sel) { sel.classList.add('hidden'); sel.required = false; }

    try {
        const year = new Date().getFullYear();
        const scope = _myPlan?.features?.checkinV2Enabled ? '&scope=all' : '';
        const res  = await API.get(`/patrol/my-missed-sessions?year=${year}${scope}`);
        const sessions = res.data || [];

        if (!wrap || !sel) return;
        wrap.classList.add('hidden');
        sel.classList.remove('hidden');
        sel.required = true;

        if (!sessions.length) {
            // ไม่มีรอบที่ขาด — แสดง info แทน select
            sel.classList.add('hidden');
            sel.required = false;
            wrap.classList.remove('hidden');
            wrap.innerHTML = `
              <div class="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-600">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                ไม่มีรอบที่ขาดซึ่งสามารถเดินซ่อมได้
              </div>`;
            return;
        }

        // populate dropdown
        const thMonth = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
        const thDay   = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
        sel.innerHTML = `<option value="">— เลือกรอบที่ต้องการชดเชย —</option>` +
            sessions.map(s => {
                const d     = new Date(s.PatrolDate);
                const dow   = thDay[d.getDay()];
                const day   = d.getDate();
                const mon   = thMonth[d.getMonth()];
                const yearLabel = d.getFullYear() + 543;
                const area  = s.AreaName || s.AreaCode || '';
                const areaCode = s.AreaCode || '';
                const round = `รอบ ${s.PatrolRound}`;
                const dateStr = d.toISOString().split('T')[0];
                const label = `${dow}ที่ ${day} ${mon} ${yearLabel} · ${round}${area ? ' · ' + area : ''}`;
                return `<option value="${escHtml(s.id || s.ScheduledSessionID || '')}" data-area="${escHtml(area)}" data-area-code="${escHtml(areaCode)}">${label}</option>`;
            }).join('');

    } catch {
        if (wrap) {
            wrap.classList.remove('hidden');
            wrap.innerHTML = `
              <div class="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-red-200 bg-red-50 text-xs text-red-500">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่
              </div>`;
        }
        if (sel) { sel.classList.add('hidden'); sel.required = false; }
    }
};

// ─── Post Check-in Success Screen ─────────────────────────────────────────────
window._onCheckinSessionChange = function() {
    const sel = document.getElementById('checkin-missed-select');
    const areaSel = document.getElementById('checkin-area-select');
    const area = sel?.selectedOptions?.[0]?.dataset?.area || '';
    const areaCode = sel?.selectedOptions?.[0]?.dataset?.areaCode || '';
    if (area && areaSel) patrolSetAreaSelectValue(areaSel, area, areaCode);
};

function showCheckinSuccessScreen(patrolType, result = {}) {
    const checkin     = result.checkin || {};
    const now         = new Date();
    const timeStr     = patrolCheckinTime(checkin.checkinAt) || now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const compliance  = result.group === 'supervisor' ? null : _myPlan?.compliance;
    const email       = result.email || {};
    const displayUser = patrolDisplayUser();
    const areaName    = checkin.area || null;
    const newAttended = (compliance?.attended || 0) + 1;
    const required    = compliance?.required || 0;
    const nowDone     = newAttended >= required && required > 0;
    const pct         = required > 0 ? Math.min(Math.round((newAttended / required) * 100), 100) : 0;
    const typeMeta    = checkin.mode === 'extra'
        ? { label: 'เดินเพิ่ม', en: 'Extra Patrol' }
        : patrolTypeMeta(checkin.type || patrolType);
    const actualDate  = checkin.actualDate || patrolDateOnly(now);
    const scheduledDate = checkin.scheduledDate || actualDate;
    const emailText   = email.sent ? 'ส่งอีเมลแล้ว' : email.queued ? 'บันทึกอีเมลเข้าคิวแล้ว' : 'ยังไม่มีอีเมลผู้ใช้';

    openModal('เช็คอินสำเร็จ', `
      <div class="space-y-4">
        <!-- Success banner -->
        <div class="rounded-2xl p-5 text-center" style="background:linear-gradient(135deg,#064e3b,#065f46)">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style="background:rgba(255,255,255,0.15)">
            <svg class="w-7 h-7 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          </div>
          <p class="font-bold text-white text-base">${escHtml(checkin.employeeName || displayUser.name || '-')}</p>
          <p class="text-emerald-300/80 text-xs mt-0.5">${typeMeta.label} · ${typeMeta.en} · ${timeStr} น.</p>
          ${areaName ? `<span class="inline-block mt-2 text-[10px] font-semibold px-2.5 py-1 rounded-full" style="background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.7)">${escHtml(areaName)}</span>` : ''}
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p class="text-[10px] font-bold text-slate-400 uppercase">Scheduled</p>
            <p class="text-sm font-black text-slate-800 mt-1">${escHtml(scheduledDate)}</p>
          </div>
          <div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p class="text-[10px] font-bold text-slate-400 uppercase">Actual</p>
            <p class="text-sm font-black text-slate-800 mt-1">${escHtml(actualDate)}</p>
          </div>
          <div class="rounded-xl border border-slate-100 bg-slate-50 p-3 col-span-2">
            <p class="text-[10px] font-bold text-slate-400 uppercase">Notification</p>
            <p class="text-xs font-bold ${email.sent || email.queued ? 'text-emerald-700' : 'text-slate-500'} mt-1">${escHtml(emailText)}</p>
          </div>
        </div>

        <!-- Compliance status -->
        ${compliance ? `
        <div class="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-slate-600">ความครบถ้วนเดือนนี้</span>
            <span class="text-xs font-bold ${nowDone ? 'text-emerald-600' : 'text-amber-600'}">${newAttended}/${required} รอบ</span>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div class="h-full rounded-full transition-all duration-700" style="width:${pct}%;background:${nowDone ? 'linear-gradient(90deg,#059669,#10b981)' : 'linear-gradient(90deg,#f59e0b,#fbbf24)'}"></div>
          </div>
          ${nowDone ? `<p class="text-[10px] text-emerald-600 font-semibold mt-2 text-center">ครบเป้าหมายเดือนนี้แล้ว</p>` : ''}
        </div>` : ''}

        <!-- CTA -->
        <div class="border border-amber-100 bg-amber-50/60 rounded-xl p-3.5 flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-bold text-slate-700">พบสิ่งผิดปกติระหว่างเดิน?</p>
            <p class="text-[10px] text-slate-400 mt-0.5">บันทึกปัญหาได้ทันที${areaName ? ` (พื้นที่ ${escHtml(areaName)} จะถูกกรอกให้)` : ''}</p>
          </div>
          <button onclick="window.closeModal&&window.closeModal();window._openIssueFromCheckin(${JSON.stringify(areaName || '')})"
            class="flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-[0.97]" style="background:linear-gradient(135deg,#dc2626,#ef4444)">
            รายงานปัญหา
          </button>
        </div>

        <button onclick="window.closeModal&&window.closeModal()" class="w-full py-2.5 rounded-xl text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium">
          ปิด
        </button>
      </div>`, 'max-w-md');

    // Reload page data in background so the CTA button updates
    setTimeout(() => loadPatrolPage(), 300);
}

window._openIssueFromCheckin = function(areaName) {
    openIssueForm('OPEN', areaName ? { Area: areaName } : null);
};

// _forceCheckin — เปิดฟอร์มต่อเลยโดยข้ามการตรวจซ้ำ
window._forceCheckin = function() {
    window._skipDuplicateCheck = true;
    openCheckInModal();
    window._skipDuplicateCheck = false;
};

// ─── Admin Record Manager — Management (Patrol_Attendance) ────────────────────
function _patrolAdminDateLabel(value) {
    if (!value) return '-';
    const d = new Date(value);
    return isNaN(d) ? String(value).slice(0, 10) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function _patrolAdminModeLabel(mode) {
    return mode === 'admin_recorded' ? 'Admin' : 'Self';
}

function _patrolAdminStatusClass(status) {
    if (['completed', 'checked'].includes(status)) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (status === 'makeup') return 'bg-violet-50 text-violet-700 border-violet-100';
    if (status === 'partial') return 'bg-amber-50 text-amber-700 border-amber-100';
    if (status === 'missed') return 'bg-red-50 text-red-600 border-red-100';
    return 'bg-slate-50 text-slate-500 border-slate-100';
}

function _patrolAdminSummaryCard(label, value, tone = 'slate') {
    const tones = {
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        amber: 'bg-amber-50 text-amber-700 border-amber-100',
        sky: 'bg-sky-50 text-sky-700 border-sky-100',
        red: 'bg-red-50 text-red-600 border-red-100',
        slate: 'bg-slate-50 text-slate-600 border-slate-100',
    };
    return `<div class="rounded-lg border ${tones[tone] || tones.slate} px-2.5 py-2">
      <div class="text-[9px] font-bold uppercase opacity-70">${escHtml(label)}</div>
      <div class="text-sm font-black mt-0.5">${escHtml(value)}</div>
    </div>`;
}

let _armCurrentDetail = null;

function _patrolJsArg(value) {
    return "'" + String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\x22')
        .replace(/&/g, '\\x26')
        .replace(/</g, '\\x3C')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n') + "'";
}

function _patrolSessionArea(session) {
    return session?.areaName || session?.AreaName || session?.areaCode || session?.AreaCode || '';
}

function _patrolSessionDate(session) {
    return String(session?.date || session?.PatrolDate || '').slice(0, 10);
}

function _patrolSessionId(session) {
    return String(session?.sessionId || session?.id || session?.ScheduledSessionID || '');
}

function _patrolSessionLabel(session) {
    const date = _patrolAdminDateLabel(_patrolSessionDate(session));
    const round = session?.patrolRound || session?.PatrolRound || '';
    const area = _patrolSessionArea(session) || '-';
    return `${date}${round ? ' · R' + round : ''} · ${area}`;
}

function _patrolUncompletedSessionsForMonth(detail, dateValue) {
    const ym = String(dateValue || '').slice(0, 7);
    const schedule = Array.isArray(detail?.schedule) ? detail.schedule : [];
    return schedule.filter(item => {
        const date = _patrolSessionDate(item);
        if (!date.startsWith(ym)) return false;
        const records = Array.isArray(item.records) ? item.records : [];
        return !records.length;
    });
}

function _armOpenScheduleItems(detail) {
    const today = new Date().toISOString().split('T')[0];
    const schedule = Array.isArray(detail?.schedule) ? detail.schedule : [];
    return schedule.filter(item => {
        const date = _patrolSessionDate(item);
        const records = Array.isArray(item.records) ? item.records : [];
        return date && date <= today && !records.length;
    });
}

window._armRefreshSessionPicker = function() {
    const sessionRow = document.getElementById('arm-session-row');
    const sessionSelect = document.getElementById('arm-session');
    const dateInput = document.getElementById('arm-date');
    const areaSelect = document.getElementById('arm-area');
    const hint = document.getElementById('arm-session-hint');
    if (!sessionRow || !sessionSelect || !_armCurrentDetail) {
        return;
    }
    const candidates = _armOpenScheduleItems(_armCurrentDetail);
    if (!candidates.length) {
        sessionSelect.innerHTML = '<option value="">No open scheduled round</option>';
        sessionSelect.disabled = true;
        if (dateInput) dateInput.value = '';
        if (hint) hint.textContent = 'Completed scheduled rounds are hidden from this list.';
        sessionRow.classList.remove('hidden');
        return;
    }
    sessionSelect.disabled = false;
    sessionSelect.innerHTML = candidates.map((item, idx) => {
        const area = _patrolSessionArea(item);
        const areaCode = item?.areaCode || item?.AreaCode || '';
        const date = _patrolSessionDate(item);
        return `<option value="${escHtml(_patrolSessionId(item))}" data-date="${escHtml(date)}" data-area="${escHtml(area)}" data-area-code="${escHtml(areaCode)}" ${idx === 0 ? 'selected' : ''}>${escHtml(_patrolSessionLabel(item))}</option>`;
    }).join('');
    window._armOnSessionChange();
    if (hint) hint.textContent = 'Select an open calendar schedule. Completed schedules are hidden.';
    sessionRow.classList.remove('hidden');
};

window._armOnSessionChange = function() {
    const sessionSelect = document.getElementById('arm-session');
    const dateInput = document.getElementById('arm-date');
    const areaSelect = document.getElementById('arm-area');
    const opt = sessionSelect?.selectedOptions?.[0];
    const area = opt?.dataset?.area || '';
    const areaCode = opt?.dataset?.areaCode || '';
    const date = opt?.dataset?.date || '';
    if (dateInput) dateInput.value = date;
    if (area && areaSelect) patrolSetAreaSelectValue(areaSelect, area, areaCode);
};

function _patrolYearForDetail(group) {
    if (group === 'supervisor') {
        return parseInt(document.getElementById('sv-year-select')?.value) || new Date().getFullYear();
    }
    return _overviewYear || new Date().getFullYear();
}

function _patrolDetailHeader(name, employeeId, group, year, targetPerYear) {
    const tone = group === 'supervisor' ? 'amber' : 'emerald';
    const target = targetPerYear ? `${targetPerYear}/year` : '-';
    return `<div class="rounded-xl border border-${tone}-100 bg-${tone}-50 px-4 py-3">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-black text-slate-800 truncate">${escHtml(name || employeeId)}</p>
          <p class="text-xs text-slate-500 mt-0.5">${escHtml(employeeId)} &middot; ${year} &middot; Target ${escHtml(target)}</p>
        </div>
        ${isAdmin ? `<button onclick="window._patrolOpenAdminFromDetail(${_patrolJsArg(employeeId)},${_patrolJsArg(name)},${_patrolJsArg(group)},${Number(targetPerYear || 0)})"
          class="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold text-white ${group === 'supervisor' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'} transition-colors">
          Manage
        </button>` : ''}
      </div>
    </div>`;
}

function _patrolDetailSummaryGrid(detail, group) {
    const summary = detail?.summary || {};
    const leave = summary.leave || {};
    const progress = summary.progressToDatePct || 0;
    const fullYear = summary.fullYearPct || 0;
    const done = group === 'supervisor' ? (summary.completedToDateCapped || 0) : (summary.completedScheduled || 0);
    const required = summary.requiredToDate || 0;
    const missing = summary.missingToDate || 0;
    const leaveYear = Number(summary.leaveYear ?? leave.leaveYear ?? 0);
    const allowedLeave = Number(summary.allowedLeaveYear ?? leave.allowedLeaveYear ?? 0);
    const acceptedCoverage = Number(summary.acceptedCoverageToDate ?? leave.acceptedCoverageToDate ?? done);
    const acceptedPct = Number(summary.acceptedCoverageToDatePct ?? leave.acceptedCoverageToDatePct ?? progress);
    const overLeave = Number(summary.overLeaveYear ?? leave.overLeaveYear ?? 0);
    const final = String(summary.finalStatus || (summary.actualPassToDate ? 'Pass' : summary.acceptedPassToDate ? 'Accepted by leave' : 'Below target'));
    const activity = detail?.actualActivity || {};
    const actualCards = group === 'top_management' ? `
      ${_patrolAdminSummaryCard('Actual Walks', String(activity.total ?? summary.actualWalks ?? 0), 'violet')}
      ${_patrolAdminSummaryCard('Scheduled Walks', String(activity.scheduledNormal ?? summary.scheduledNormalWalks ?? 0), 'emerald')}
      ${_patrolAdminSummaryCard('Makeup Walks', String(activity.makeup ?? summary.makeupWalks ?? 0), 'amber')}
      ${_patrolAdminSummaryCard('Extra Walks', String(activity.extra ?? summary.extraWalks ?? 0), 'violet')}` : '';
    return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      ${_patrolAdminSummaryCard('Progress To Date', `${progress}%`, progress >= 80 ? 'emerald' : (progress > 0 ? 'amber' : 'red'))}
      ${_patrolAdminSummaryCard('Full Year', `${fullYear}%`, 'slate')}
      ${_patrolAdminSummaryCard('Completed/Due', `${done}/${required}`, required > 0 && done >= required ? 'emerald' : 'slate')}
      ${_patrolAdminSummaryCard('Missing Due', String(missing), missing > 0 ? 'red' : 'emerald')}
      ${_patrolAdminSummaryCard('Leave Used/Allowed', `${leaveYear}/${allowedLeave}`, overLeave > 0 ? 'red' : 'sky')}
      ${_patrolAdminSummaryCard('Accepted Coverage', `${acceptedCoverage}/${required}`, acceptedPct >= progress ? 'emerald' : 'slate')}
      ${_patrolAdminSummaryCard('Accepted %', `${acceptedPct}%`, acceptedPct >= 80 ? 'emerald' : 'sky')}
      ${_patrolAdminSummaryCard('Final Status', final, final === 'Pass' ? 'emerald' : final === 'Accepted by leave' ? 'sky' : 'red')}
      ${actualCards}
    </div>`;
}

function _patrolLeaveRequestsPanel(detail = {}) {
    const rows = Array.isArray(detail.leaveRequests) ? detail.leaveRequests : [];
    const pending = rows.filter(row => String(row.Status || '').trim() === 'Pending');
    const ordered = [...pending, ...rows.filter(row => String(row.Status || '').trim() !== 'Pending')];
    const statusClass = status => status === 'Approved' ? 'bg-sky-100 text-sky-700 border-sky-200'
        : status === 'Pending' ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
        : status === 'Rejected' ? 'bg-red-100 text-red-600 border-red-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
    const actions = leave => {
        const status = String(leave.Status || '').trim();
        if (!canReviewPatrolLeaveUi() || !leave.id || !['Pending', 'Approved'].includes(status)) return '';
        return `<div class="mt-2 flex flex-wrap gap-1.5" data-patrol-card-ignore>
          ${status === 'Pending' ? `<button type="button" onclick="event.stopPropagation();window.reviewPatrolLeave(${Number(leave.id)}, 'approve')" class="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-[10px] font-black text-emerald-700 border border-emerald-100 hover:bg-emerald-100">Approve</button>
          <button type="button" onclick="event.stopPropagation();window.reviewPatrolLeave(${Number(leave.id)}, 'reject')" class="px-2.5 py-1.5 rounded-lg bg-red-50 text-[10px] font-black text-red-600 border border-red-100 hover:bg-red-100">Reject</button>` : ''}
          <button type="button" onclick="event.stopPropagation();window.reviewPatrolLeave(${Number(leave.id)}, 'cancel')" class="px-2.5 py-1.5 rounded-lg bg-slate-50 text-[10px] font-black text-slate-600 border border-slate-200 hover:bg-slate-100">Cancel</button>
        </div>`;
    };
    return `<div class="rounded-xl border border-sky-100 bg-sky-50/60">
      <div class="px-3 py-2 border-b border-sky-100 flex items-center justify-between gap-2">
        <p class="text-xs font-black text-sky-800">Leave Requests</p>
        <span class="text-[10px] font-black ${pending.length ? 'text-indigo-700' : 'text-slate-400'}">${pending.length} Pending</span>
      </div>
      <div class="p-3 space-y-2">
        ${ordered.length ? ordered.map(leave => {
            const status = String(leave.Status || '').trim() || 'Pending';
            const file = leave.AttachmentUrl
                ? `<a href="${escHtml(resolveFileUrl(leave.AttachmentUrl))}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="font-black text-sky-700 underline">Attachment</a>`
                : '';
            return `<div class="rounded-lg border border-white bg-white/85 px-3 py-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="inline-flex px-1.5 py-0.5 rounded-full border text-[10px] font-black ${statusClass(status)}">${escHtml(status)}</span>
                    <span class="text-[10px] font-black text-slate-700">${escHtml(leave.ScheduledDate || '-')}</span>
                    <span class="text-[10px] text-slate-400">#${Number(leave.id || leave.ID || 0) || '-'}</span>
                  </div>
                  <p class="mt-1 text-[10px] text-slate-600">${escHtml(leave.LeaveType || 'Leave')}${leave.Reason ? ' - ' + escHtml(leave.Reason) : ''}</p>
                  ${leave.Destination ? `<p class="mt-0.5 text-[10px] text-slate-400">${escHtml(leave.Destination)}</p>` : ''}
                  ${file ? `<p class="mt-1 text-[10px]">${file}</p>` : ''}
                  ${leave.ReviewNote ? `<p class="mt-1 text-[10px] text-red-500">Review note: ${escHtml(leave.ReviewNote)}</p>` : ''}
                  ${actions(leave)}
                </div>
              </div>
            </div>`;
        }).join('') : `<div class="rounded-lg border border-white bg-white/70 px-3 py-3 text-center text-xs text-slate-400">No leave requests for this year.</div>`}
      </div>
    </div>`;
}

function _patrolLeaveInline(item = {}) {
    const leave = item.leave || {};
    if (!patrolSessionLeave(item) && !leave.id) return '';
    const type = leave.LeaveType || 'Leave';
    const reason = leave.Reason ? ` - ${leave.Reason}` : '';
    const status = String(leave.Status || '').trim() || 'Pending';
    const statusCls = status === 'Approved' ? 'bg-sky-100 text-sky-700 border-sky-200'
        : status === 'Pending' ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
        : status === 'Rejected' ? 'bg-red-100 text-red-600 border-red-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
    const file = leave.AttachmentUrl
        ? ` <a href="${escHtml(resolveFileUrl(leave.AttachmentUrl))}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="font-black text-sky-700 underline">Attachment</a>`
        : '';
    const reviewButtons = canReviewPatrolLeaveUi() && leave.id && ['Pending', 'Approved'].includes(status)
        ? `<div class="mt-1.5 flex flex-wrap gap-1" data-patrol-card-ignore>
            ${status === 'Pending' ? `<button type="button" onclick="event.stopPropagation();window.reviewPatrolLeave(${Number(leave.id)}, 'approve')" class="px-2 py-1 rounded-lg bg-emerald-50 text-[10px] font-black text-emerald-700 border border-emerald-100">Approve</button>
            <button type="button" onclick="event.stopPropagation();window.reviewPatrolLeave(${Number(leave.id)}, 'reject')" class="px-2 py-1 rounded-lg bg-red-50 text-[10px] font-black text-red-600 border border-red-100">Reject</button>` : ''}
            <button type="button" onclick="event.stopPropagation();window.reviewPatrolLeave(${Number(leave.id)}, 'cancel')" class="px-2 py-1 rounded-lg bg-slate-50 text-[10px] font-black text-slate-600 border border-slate-200">Cancel</button>
          </div>`
        : '';
    return `<div class="mt-1.5 rounded-lg bg-white/80 border border-sky-100 px-2 py-1 text-[10px] text-slate-600">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="inline-flex px-1.5 py-0.5 rounded-full border font-black ${statusCls}">${escHtml(status)}</span>
          <span class="font-black text-sky-700">Leave:</span>
          <span>${escHtml(type)}${escHtml(reason)}</span>
          ${file}
        </div>
        ${leave.ReviewNote ? `<div class="mt-1 text-[10px] text-red-500">Review note: ${escHtml(leave.ReviewNote)}</div>` : ''}
        ${reviewButtons}
      </div>`;
}

function _patrolTopDetailList(detail) {
    const schedule = Array.isArray(detail?.schedule) ? detail.schedule : [];
    const extraRecords = Array.isArray(detail?.extraRecords) ? detail.extraRecords : [];
    const rows = schedule.map(item => {
        const status = item.status || 'upcoming';
        const recs = Array.isArray(item.records) ? item.records : [];
        return `<div class="rounded-xl border ${_patrolAdminStatusClass(status)} px-3 py-2">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-black">${_patrolAdminDateLabel(item.date)} &middot; ${escHtml(status)}</p>
              <p class="text-[10px] opacity-75 truncate">${escHtml(item.teamName || '-')}${item.areaName ? ' &middot; ' + escHtml(item.areaName) : ''}${item.patrolRound ? ' &middot; R' + item.patrolRound : ''}</p>
            </div>
            <span class="text-[10px] font-bold">${recs.length ? 'Completed' : (status === 'missed' ? 'Missing' : 'Not due')}</span>
          </div>
          ${recs.map(r => `<div class="mt-1.5 rounded-lg bg-white/70 px-2 py-1 text-[10px] text-slate-500 truncate">
            ${escHtml(_patrolAdminModeLabel(r.mode))}${r.Area ? ' &middot; ' + escHtml(r.Area) : ''}${r.Notes ? ' &middot; ' + escHtml(r.Notes) : ''}
          </div>`).join('')}
          ${_patrolLeaveInline(item)}
        </div>`;
    });
    extraRecords.forEach(r => rows.push(`<div class="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2">
      <p class="text-xs font-black text-violet-700">${_patrolAdminDateLabel(r.PatrolDate)} &middot; Extra</p>
      <p class="text-[10px] text-violet-500 truncate">${escHtml(_patrolAdminModeLabel(r.mode))}${r.Area ? ' &middot; ' + escHtml(r.Area) : ''}${r.Notes ? ' &middot; ' + escHtml(r.Notes) : ''}</p>
    </div>`));
    return rows.length ? rows.join('') : `<div class="text-center py-8 text-xs text-slate-400">No schedule or record for this year.</div>`;
}

function _patrolSupervisorDetailList(detail) {
    const periods = Array.isArray(detail?.periods) ? detail.periods : [];
    if (!periods.length) return `<div class="text-center py-8 text-xs text-slate-400">No quota data for this year.</div>`;
    return periods.map(p => {
        const status = p.status || 'upcoming';
        const recs = Array.isArray(p.records) ? p.records : [];
        const items = Array.isArray(p.items) ? p.items : [];
        return `<div class="rounded-xl border ${_patrolAdminStatusClass(status)} px-3 py-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-black">Month ${p.month} &middot; ${escHtml(status)}</p>
            <span class="text-[10px] font-bold">${p.completed || 0}/${p.monthlyRequirement || p.required || 0}</span>
          </div>
          ${items.length ? `<div class="mt-2 space-y-1">
            ${items.map(item => {
              const itemRecs = patrolSessionRecords(item);
              return `<div class="rounded-lg bg-white/70 px-2 py-1 text-[10px] text-slate-500">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate">${_patrolAdminDateLabel(item.date || item.PatrolDate)}${item.areaName ? ' &middot; ' + escHtml(item.areaName) : ''}${item.patrolRound ? ' &middot; R' + item.patrolRound : ''}</span>
                  <span class="font-bold ${itemRecs.length ? 'text-emerald-600' : 'text-slate-400'}">${itemRecs.length ? 'Done' : 'Open'}</span>
                </div>
                ${_patrolLeaveInline(item)}
              </div>`;
            }).join('')}
          </div>` : ''}
          ${recs.map(r => `<div class="mt-1.5 rounded-lg bg-white/70 px-2 py-1 text-[10px] text-slate-500 truncate">
            ${_patrolAdminDateLabel(r.CheckinDate)} &middot; ${escHtml(_patrolAdminModeLabel(r.mode))}${r.ScheduledSessionID ? ' &middot; Scheduled' : ''}${r.Location ? ' &middot; ' + escHtml(r.Location) : ''}${r.Notes ? ' &middot; ' + escHtml(r.Notes) : ''}
          </div>`).join('')}
        </div>`;
    }).join('');
}

window._patrolOpenAdminFromDetail = function(employeeId, name, group, targetPerYear) {
    closeModal();
    if (group === 'supervisor') {
        window.openAdminRecordSvModal(employeeId, name, targetPerYear);
        return;
    }
    window.openAdminRecordModal(employeeId, name, targetPerYear);
};

window.openPatrolAttendanceDetailModal = async function(employeeId, name, group, targetPerYear) {
    const year = _patrolYearForDetail(group);
    const groupLabel = group === 'supervisor' ? 'Sec. & Supervisor' : 'Top & Management';
    openModal(`Attendance Detail - ${name || employeeId}`, `
      <div class="space-y-3">
        ${_patrolDetailHeader(name, employeeId, group, year, targetPerYear)}
        <div class="flex flex-col items-center justify-center py-8 text-slate-400">
          <div class="animate-spin rounded-full h-8 w-8 border-4 ${group === 'supervisor' ? 'border-amber-500' : 'border-emerald-500'} border-t-transparent mb-3"></div>
          <span class="text-xs">Loading ${escHtml(groupLabel)} detail...</span>
        </div>
      </div>`, 'max-w-3xl');
    try {
        const res = await API.get(`/patrol/attendance-detail?employeeId=${encodeURIComponent(employeeId)}&group=${encodeURIComponent(group)}&year=${year}`);
        const detail = res.data || {};
        const list = group === 'supervisor' ? _patrolSupervisorDetailList(detail) : _patrolTopDetailList(detail);
        const body = document.getElementById('modal-body');
        if (!body) return;
        body.innerHTML = `
          <div class="space-y-3">
            ${_patrolDetailHeader(name, employeeId, group, year, targetPerYear)}
            ${_patrolDetailSummaryGrid(detail, group)}
            ${_patrolLeaveRequestsPanel(detail)}
            <div class="rounded-xl border border-slate-100 bg-white">
              <div class="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
                <p class="text-xs font-black text-slate-600">${escHtml(groupLabel)} detail</p>
                <p class="text-[10px] text-slate-400">${detail.mode === 'monthly_quota' ? 'Monthly quota' : 'Scheduled calendar'}</p>
              </div>
              <div class="space-y-2 max-h-[420px] overflow-y-auto p-3">${list}</div>
            </div>
          </div>`;
    } catch (err) {
        const body = document.getElementById('modal-body');
        if (body) body.innerHTML = `
          <div class="space-y-3">
            ${_patrolDetailHeader(name, employeeId, group, year, targetPerYear)}
            <div class="rounded-xl border border-red-100 bg-red-50 px-4 py-6 text-center text-sm text-red-500">
              ${escHtml(getReadableError(err, 'Unable to load attendance detail'))}
            </div>
          </div>`;
    }
};

function _armRenderTopDetail(detail, employeeId, year) {
    _armCurrentDetail = detail || null;
    const summary = detail?.summary || {};
    const schedule = Array.isArray(detail?.schedule) ? detail.schedule : [];
    const records = Array.isArray(detail?.records) ? detail.records : [];
    const extraRecords = Array.isArray(detail?.extraRecords) ? detail.extraRecords : [];
    const activity = detail?.actualActivity || {};
    const detailEl = document.getElementById('arm-detail');
    const listEl = document.getElementById('arm-list');
    const countEl = document.getElementById('arm-count');
    if (countEl) countEl.textContent = `${summary.completedScheduled || 0}/${summary.requiredToDate || 0} due`;
    window._armRefreshSessionPicker();
    if (detailEl) {
        detailEl.innerHTML = `
          <div class="grid grid-cols-2 gap-2">
            ${_patrolAdminSummaryCard('Progress To Date', `${summary.progressToDatePct || 0}%`, (summary.progressToDatePct || 0) >= 80 ? 'emerald' : 'amber')}
            ${_patrolAdminSummaryCard('Full Year', `${summary.fullYearPct || 0}%`, 'slate')}
            ${_patrolAdminSummaryCard('Required Due', String(summary.requiredToDate || 0), 'slate')}
            ${_patrolAdminSummaryCard('Missing Due', String(summary.missingToDate || 0), (summary.missingToDate || 0) > 0 ? 'red' : 'emerald')}
            ${_patrolAdminSummaryCard('Actual Walks', String(activity.total || 0), 'violet')}
            ${_patrolAdminSummaryCard('Makeup Walks', String(activity.makeup || 0), 'amber')}
            ${_patrolAdminSummaryCard('Extra Walks', String(activity.extra || 0), 'violet')}
          </div>`;
    }
    if (!listEl) return;
    const rows = [];
    schedule.forEach(item => {
        const status = item.status || 'upcoming';
        const itemRecords = Array.isArray(item.records) ? item.records : [];
        rows.push(`<div class="rounded-xl border ${_patrolAdminStatusClass(status)} px-3 py-2">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-xs font-black">${_patrolAdminDateLabel(item.date)} · ${escHtml(status)}</div>
              <div class="text-[10px] opacity-75 truncate">${escHtml(item.teamName || '')}${item.areaName ? ' · ' + escHtml(item.areaName) : ''}${item.patrolRound ? ' · R' + item.patrolRound : ''}</div>
            </div>
            <div class="text-[10px] font-bold">${itemRecords.length ? 'Done' : (status === 'missed' ? 'Missing' : 'Planned')}</div>
          </div>
          ${itemRecords.map(r => `<div class="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1">
            <span class="text-[10px] text-slate-500 truncate">${escHtml(_patrolAdminModeLabel(r.mode))}${r.Area ? ' · ' + escHtml(r.Area) : ''}${r.Notes ? ' · ' + escHtml(r.Notes) : ''}</span>
            <button onclick="window._armDeleteRecord(${r.id},'${employeeId}',${year})" class="flex-shrink-0 text-[10px] font-bold text-red-500 hover:text-red-600">Delete</button>
          </div>`).join('')}
        </div>`);
    });
    extraRecords.forEach(r => rows.push(`<div class="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-xs font-black text-violet-700">${_patrolAdminDateLabel(r.PatrolDate)} · Extra</div>
          <div class="text-[10px] text-violet-500 truncate">${escHtml(_patrolAdminModeLabel(r.mode))}${r.Area ? ' · ' + escHtml(r.Area) : ''}${r.Notes ? ' · ' + escHtml(r.Notes) : ''}</div>
        </div>
        <button onclick="window._armDeleteRecord(${r.id},'${employeeId}',${year})" class="flex-shrink-0 text-[10px] font-bold text-red-500 hover:text-red-600">Delete</button>
      </div>
    </div>`));
    if (!rows.length && !records.length) {
        listEl.innerHTML = `<div class="text-center py-6 text-slate-300 text-xs">No schedule or record for this year.</div>`;
        return;
    }
    listEl.innerHTML = rows.join('');
}

function _arsvRenderQuotaDetail(detail, employeeId, year) {
    _arsvCurrentDetail = detail || null;
    const summary = detail?.summary || {};
    const periods = Array.isArray(detail?.periods) ? detail.periods : [];
    const countEl = document.getElementById('arsv-count');
    const detailEl = document.getElementById('arsv-detail');
    const listEl = document.getElementById('arsv-list');
    if (countEl) countEl.textContent = `${summary.completedToDateCapped || 0}/${summary.requiredToDate || 0} due`;
    if (detailEl) {
        detailEl.innerHTML = `
          <div class="grid grid-cols-2 gap-2">
            ${_patrolAdminSummaryCard('Progress To Date', `${summary.progressToDatePct || 0}%`, (summary.progressToDatePct || 0) >= 80 ? 'emerald' : 'amber')}
            ${_patrolAdminSummaryCard('Full Year', `${summary.fullYearPct || 0}%`, 'slate')}
            ${_patrolAdminSummaryCard('Year Target', String(summary.yearlyTarget || 0), 'slate')}
            ${_patrolAdminSummaryCard('Missing Due', String(summary.missingToDate || 0), (summary.missingToDate || 0) > 0 ? 'red' : 'emerald')}
          </div>`;
    }
    if (!listEl) return;
    _arsvRenderSchedulePicker(detail);
    if (!periods.length) {
        listEl.innerHTML = `<div class="text-center py-6 text-slate-300 text-xs">No quota data for this year.</div>`;
        return;
    }
    listEl.innerHTML = periods.map(p => {
        const status = p.status || 'upcoming';
        const recs = Array.isArray(p.records) ? p.records : [];
        const items = Array.isArray(p.items) ? p.items : [];
        return `<div class="rounded-xl border ${_patrolAdminStatusClass(status)} px-3 py-2">
          <div class="flex items-center justify-between gap-2">
            <div class="text-xs font-black">Month ${p.month} · ${escHtml(status)}</div>
            <div class="text-[10px] font-bold">${p.completed || 0}/${p.monthlyRequirement || p.required || 0}</div>
          </div>
          ${items.length ? `<div class="mt-2 space-y-1">
            ${items.map(item => {
              const itemRecords = patrolSessionRecords(item);
              const itemStatus = patrolScheduleStatusLabel(item);
              return `<div class="rounded-lg bg-white/70 px-2 py-1 text-[10px] text-slate-500">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate">${_patrolAdminDateLabel(item.date || item.PatrolDate)}${item.areaName ? ' · ' + escHtml(item.areaName) : ''}${item.patrolRound ? ' · R' + item.patrolRound : ''}</span>
                  <span class="font-bold ${itemRecords.length ? 'text-emerald-600' : String(item.status || '').toLowerCase() === 'locked' ? 'text-slate-300' : 'text-slate-400'}">${escHtml(itemStatus)}</span>
                </div>
              </div>`;
            }).join('')}
          </div>` : ''}
          ${recs.map(r => `<div class="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1">
            <span class="text-[10px] text-slate-500 truncate">${_patrolAdminDateLabel(r.CheckinDate)} · ${escHtml(_patrolAdminModeLabel(r.mode))}${r.ScheduledSessionID ? ' · Scheduled' : ''}${r.Location ? ' · ' + escHtml(r.Location) : ''}${r.Notes ? ' · ' + escHtml(r.Notes) : ''}</span>
            <button onclick="window._arsvDeleteRecord(${r.id},'${employeeId}',${year})" class="flex-shrink-0 text-[10px] font-bold text-red-500 hover:text-red-600">Delete</button>
          </div>`).join('')}
        </div>`;
    }).join('');
}

function _arsvOpenScheduleItems(detail) {
    const today = patrolDateOnly(new Date());
    if (detail?.scheduleMode === 'flexible') {
        const periods = Array.isArray(detail?.periods) ? detail.periods : [];
        return periods.flatMap(p => Array.isArray(p.items) ? p.items : [])
            .filter(item => String(item.status || '').toLowerCase() === 'open' && !patrolSessionCompleted(item));
    }
    const periods = Array.isArray(detail?.periods) ? detail.periods : [];
    return periods.flatMap(p => Array.isArray(p.items) ? p.items : [])
        .filter(item => {
            const date = patrolScheduleDate(item);
            return date && date <= today && !patrolSessionCompleted(item);
        });
}

function _arsvRenderFlexibleAreaPicker(detail) {
    const current = document.getElementById('arsv-loc');
    if (!current || current.tagName === 'SELECT') return;
    const areas = Array.isArray(detail?.allowedAreas) ? detail.allowedAreas : [];
    current.outerHTML = `<select id="arsv-loc"
      class="w-full mt-0.5 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400">
      <option value="">Select area</option>
      ${areas.map(a => {
        const value = a.id || a.Code || a.Name || a.AreaName || a.name || '';
        const label = a.Name || a.AreaName || a.name || a.Code || value;
        return value ? `<option value="${escHtml(value)}">${escHtml(label)}</option>` : '';
      }).join('')}
    </select>`;
}

function _arsvSyncFlexibleModeControls(detail) {
    const isFlexible = detail?.scheduleMode === 'flexible';
    document.querySelectorAll('input[name="arsv-type"]').forEach(input => {
        input.disabled = isFlexible && input.value !== 'normal';
        if (isFlexible && input.value === 'normal') input.checked = true;
        const label = input.closest('label');
        if (label) label.classList.toggle('opacity-45', isFlexible && input.value !== 'normal');
    });
    if (isFlexible) _arsvRenderFlexibleAreaPicker(detail);
}

function _arsvRenderSchedulePicker(detail) {
    const select = document.getElementById('arsv-session');
    const dateInput = document.getElementById('arsv-date');
    const locInput = document.getElementById('arsv-loc');
    const hint = document.getElementById('arsv-session-hint');
    if (!select || !dateInput) return;
    _arsvSyncFlexibleModeControls(detail);
    const openItems = _arsvOpenScheduleItems(detail);
    if (!openItems.length) {
        select.innerHTML = '<option value="">ไม่มีรอบตามกำหนดการที่ยังเปิดอยู่</option>';
        select.disabled = true;
        dateInput.value = '';
        if (hint) hint.textContent = 'รอบที่ครบแล้วจะไม่แสดงในรายการให้เลือก';
        return;
    }
    select.disabled = false;
    select.innerHTML = openItems.map((item, idx) => {
        const id = patrolSessionId(item);
        const date = patrolScheduleDate(item) || String(item.date || item.PatrolDate || '').slice(0, 10);
        const area = item.areaName || item.AreaName || item.areaCode || item.AreaCode || '';
        const round = item.patrolRound || item.PatrolRound || '';
        return `<option value="${escHtml(id)}" data-date="${escHtml(date)}" data-area="${escHtml(area)}" ${idx === 0 ? 'selected' : ''}>${escHtml(date)}${area ? ' · ' + escHtml(area) : ''}${round ? ' · R' + escHtml(round) : ''}</option>`;
    }).join('');
    window._arsvOnSessionChange();
}

window._arsvOnSessionChange = function() {
    const select = document.getElementById('arsv-session');
    const opt = select?.selectedOptions?.[0];
    const dateInput = document.getElementById('arsv-date');
    const locInput = document.getElementById('arsv-loc');
    const hint = document.getElementById('arsv-session-hint');
    if (!opt) return;
    const date = opt.dataset.date || '';
    const area = opt.dataset.area || '';
    const type = document.querySelector('input[name="arsv-type"]:checked')?.value || 'normal';
    if (dateInput) dateInput.value = type === 'compensation' ? patrolDateOnly(new Date()) : date;
    if (locInput) locInput.value = area || locInput.value || '';
    if (hint) hint.textContent = date
        ? (type === 'compensation' ? `เดินซ่อมรอบวันที่ ${date} โดยบันทึกวันที่เดินจริงเป็นวันนี้` : `จะบันทึกตามกำหนดการวันที่ ${date}`)
        : '';
};

window._arsvOnTypeChange = function() {
    window._arsvOnSessionChange?.();
};

window.openAdminRecordModal = async function(employeeId, name, targetPerYear) {
    const year = _overviewYear || new Date().getFullYear();
    const topMembers = Array.isArray(_overviewData?.members) ? _overviewData.members : null;
    const isKnownTopMember = topMembers
        ? topMembers.some(member => String(member.EmployeeID || member.employeeId || '') === String(employeeId || ''))
        : true;
    if (!isKnownTopMember) {
        openModal(`รายการเดินตรวจ — ${name || employeeId}`, `
          <div class="space-y-4">
            <div class="rounded-xl border border-amber-100 bg-amber-50 px-4 py-4 text-center">
              <div class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-amber-600">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.5m0 3.5h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              </div>
              <p class="text-sm font-black text-slate-800">Employee is not in Top & Management roster.</p>
              <p class="mt-1 text-xs text-slate-500">กรุณาเพิ่มพนักงานเข้ารายชื่อ Top & Management ก่อน หรือใช้แท็บ Sec. & Supervisor สำหรับผู้ที่อยู่ในกลุ่มหัวหน้างาน</p>
            </div>
          </div>`, 'max-w-md');
        return;
    }
    openModal(`รายการเดินตรวจ — ${name}`, `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-xs text-slate-500">ปี ${year} · เป้าหมาย ${targetPerYear || '—'} ครั้ง/ปี</p>
          <span id="arm-count" class="text-xs font-bold text-emerald-600">กำลังโหลด...</span>
        </div>
        <div id="arm-detail" class="space-y-2">
          <div class="grid grid-cols-2 gap-2">
            ${_patrolAdminSummaryCard('Progress To Date', '...', 'emerald')}
            ${_patrolAdminSummaryCard('Full Year', '...', 'slate')}
          </div>
        </div>
        <div id="arm-list" class="space-y-1.5 max-h-60 overflow-y-auto">
          <div class="text-center py-6 text-slate-300 text-xs">
            <div class="animate-spin rounded-full h-6 w-6 border-2 border-emerald-400 border-t-transparent mx-auto mb-2"></div>
            กำลังโหลด...
          </div>
        </div>
        <div class="border-t border-slate-100 pt-4">
          <p class="text-xs font-bold text-slate-600 mb-2">เพิ่มรายการใหม่ (Admin)</p>
          <div class="space-y-2">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[10px] text-slate-400 font-semibold">วันที่ *</label>
                <input type="date" id="arm-date" max="${new Date().toISOString().split('T')[0]}" readonly
                  class="w-full mt-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400">
              </div>
              <div>
                <label class="text-[10px] text-slate-400 font-semibold">ประเภท</label>
                <select id="arm-type" class="w-full mt-0.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                  <option value="normal">ปกติ</option>
                  <option value="compensation">เดินซ่อม</option>
                  <option value="Re-inspection">ตรวจซ้ำ</option>
                </select>
              </div>
            </div>
            <div id="arm-session-row">
              <label class="text-[10px] text-slate-400 font-semibold">Scheduled round *</label>
              <select id="arm-session" onchange="window._armOnSessionChange()"
                class="w-full mt-0.5 rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-400">
                <option value="">Loading scheduled rounds...</option>
              </select>
              <p id="arm-session-hint" class="mt-1 text-[10px] text-slate-400"></p>
            </div>
            <div>
              <label class="text-[10px] text-slate-400 font-semibold">พื้นที่</label>
              <select id="arm-area" class="w-full mt-0.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                <option value="">— ไม่ระบุ —</option>
                ${(_patrolAreas||[]).map(a => {
                    const name = getPatrolAreaName(a);
                    return name ? `<option value="${escHtml(name)}">${escHtml(name)}</option>` : '';
                }).join('')}
              </select>
            </div>
            <div>
              <label class="text-[10px] text-slate-400 font-semibold">หมายเหตุ</label>
              <input type="text" id="arm-notes" placeholder="หมายเหตุ (ไม่บังคับ)"
                class="w-full mt-0.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400">
            </div>
            <button onclick="window._armAddRecord('${employeeId}','${(name||'').replace(/'/g,"\\'")}',${targetPerYear||12})"
              class="w-full py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-[0.97]"
              style="background:linear-gradient(135deg,#059669,#0d9488)">
              <svg class="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
              เพิ่มรายการ
            </button>
          </div>
        </div>
      </div>`, 'max-w-md');
    await _armLoadRecords(employeeId, year);
};

async function _armLoadRecords(employeeId, year) {
    try {
        const detailRes = await API.get(`/patrol/attendance-detail?employeeId=${encodeURIComponent(employeeId)}&group=top_management&year=${year}`);
        _armRenderTopDetail(detailRes.data || {}, employeeId, year);
        return;
        const res = await API.get(`/patrol/member-attendance?employeeId=${employeeId}&year=${year}`);
        const rows = res.data || [];
        const countEl = document.getElementById('arm-count');
        const listEl  = document.getElementById('arm-list');
        if (countEl) countEl.textContent = `${rows.length} รายการ`;
        if (!listEl) return;
        if (!rows.length) {
            listEl.innerHTML = `<div class="text-center py-6 text-slate-300 text-xs">ยังไม่มีรายการเดินตรวจปีนี้</div>`;
            return;
        }
        const thLbl = t => {
            if (t === 'compensation') return '<span class="text-violet-600">เดินซ่อม</span>';
            if (t === 'Re-inspection') return '<span class="text-amber-600">ตรวจซ้ำ</span>';
            return '<span class="text-emerald-600">ปกติ</span>';
        };
        listEl.innerHTML = rows.map(r => {
            const d = new Date(r.PatrolDate);
            const dateStr = d.toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' });
            return `<div class="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs text-slate-500 flex-shrink-0 font-mono">${dateStr}</span>
                <span class="text-[10px]">${thLbl(r.PatrolType)}</span>
                ${r.Area ? `<span class="text-[10px] text-slate-400 truncate">${r.Area}</span>` : ''}
              </div>
              <button onclick="window._armDeleteRecord(${r.id},'${employeeId}',${year})"
                class="flex-shrink-0 p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors" title="ลบ">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>`;
        }).join('');
    } catch (err) {
        const listEl = document.getElementById('arm-list');
        if (listEl) listEl.innerHTML = `<div class="text-center py-4 text-red-400 text-xs">โหลดข้อมูลไม่สำเร็จ</div>`;
    }
}

window._armAddRecord = async function(employeeId, name, targetPerYear) {
    const actionKey = `arm-add-${employeeId}`;
    if (_patrolActionLocks.has(actionKey)) return;
    const date  = document.getElementById('arm-date')?.value;
    const type  = document.getElementById('arm-type')?.value || 'normal';
    const area  = document.getElementById('arm-area')?.value || null;
    const notes = document.getElementById('arm-notes')?.value?.trim() || null;
    const scheduledSessionId = document.getElementById('arm-session')?.value || null;
    if (!date) { showToast('กรุณาเลือกวันที่', 'error'); return; }
    if (!scheduledSessionId) { showToast('กรุณาเลือกรอบตามกำหนดการ', 'error'); return; }
    _patrolActionLocks.add(actionKey);
    try {
        await API.post('/patrol/admin-record', { EmployeeID: employeeId, PatrolDate: date, PatrolType: type, Area: area, Notes: notes, ScheduledSessionID: scheduledSessionId });
        showToast('เพิ่มรายการสำเร็จ', 'success');
        const year = _overviewYear || new Date().getFullYear();
        await _armLoadRecords(employeeId, year);
        _overviewData = null;
        loadOverview(_overviewYear);
    } catch (err) { showError(getReadableError(err, 'เพิ่มรายการเดินตรวจไม่สำเร็จ')); }
    finally { _patrolActionLocks.delete(actionKey); }
};

window._armDeleteRecord = async function(id, employeeId, year) {
    const actionKey = `arm-delete-${id}`;
    if (_patrolActionLocks.has(actionKey)) return;
    const ok = await showConfirmationModal('ยืนยันการลบ', 'ต้องการลบรายการเดินตรวจนี้ใช่หรือไม่?');
    if (!ok) return;
    _patrolActionLocks.add(actionKey);
    try {
        await API.delete(`/patrol/admin-record/${id}`);
        showToast('ลบรายการสำเร็จ', 'success');
        await _armLoadRecords(employeeId, year);
        _overviewData = null;
        loadOverview(_overviewYear);
    } catch (err) { showError(getReadableError(err, 'ลบรายการเดินตรวจไม่สำเร็จ')); }
    finally { _patrolActionLocks.delete(actionKey); }
};

// ─── Admin Record Manager — Supervisor (Patrol_Self_Checkin) ──────────────────
window.openAdminRecordSvModal = async function(employeeId, name, targetPerYear) {
    const year = parseInt(document.getElementById('sv-year-select')?.value) || new Date().getFullYear();
    openModal(`รายการ Self-Patrol — ${name}`, `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-xs text-slate-500">ปี ${year} · เป้าหมาย ${targetPerYear || '—'} ครั้ง/ปี</p>
          <span id="arsv-count" class="text-xs font-bold text-amber-600">กำลังโหลด...</span>
        </div>
        <div id="arsv-detail" class="space-y-2">
          <div class="grid grid-cols-2 gap-2">
            ${_patrolAdminSummaryCard('Progress To Date', '...', 'amber')}
            ${_patrolAdminSummaryCard('Full Year', '...', 'slate')}
          </div>
        </div>
        <div id="arsv-list" class="space-y-1.5 max-h-60 overflow-y-auto">
          <div class="text-center py-6 text-slate-300 text-xs">
            <div class="animate-spin rounded-full h-6 w-6 border-2 border-amber-400 border-t-transparent mx-auto mb-2"></div>
            กำลังโหลด...
          </div>
        </div>
        <div class="border-t border-slate-100 pt-4">
          <p class="text-xs font-bold text-slate-600 mb-2">เพิ่มรายการใหม่ (Admin)</p>
            <div class="space-y-2">
            <div>
              <label class="text-[10px] text-slate-400 font-semibold">รอบตามกำหนดการ *</label>
              <select id="arsv-session" onchange="window._arsvOnSessionChange()"
                class="w-full mt-0.5 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400">
                <option value="">กำลังโหลดรอบตามกำหนดการ...</option>
              </select>
              <p id="arsv-session-hint" class="mt-1 text-[10px] text-slate-400">รอบที่เดินแล้วจะไม่แสดงให้เลือก</p>
            </div>
            <div>
              <label class="text-[10px] text-slate-400 font-semibold">รูปแบบการบันทึก</label>
              <div class="grid grid-cols-2 gap-2 mt-0.5">
                <label class="cursor-pointer rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2 has-[:checked]:ring-2 has-[:checked]:ring-emerald-400 transition-all">
                  <input type="radio" name="arsv-type" value="normal" class="sr-only" checked onchange="window._arsvOnTypeChange()">
                  <span class="block text-xs font-bold text-emerald-700">ปกติ</span>
                  <span class="block text-[9px] text-emerald-600/70">ตามรอบ</span>
                </label>
                <label class="cursor-pointer rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-2 has-[:checked]:ring-2 has-[:checked]:ring-violet-400 transition-all">
                  <input type="radio" name="arsv-type" value="compensation" class="sr-only" onchange="window._arsvOnTypeChange()">
                  <span class="block text-xs font-bold text-violet-700">เดินซ่อม</span>
                  <span class="block text-[9px] text-violet-600/70">วันที่จริงวันนี้</span>
                </label>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[10px] text-slate-400 font-semibold">วันที่ *</label>
                <input type="date" id="arsv-date" max="${new Date().toISOString().split('T')[0]}" readonly
                  class="w-full mt-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400">
              </div>
              <div>
                <label class="text-[10px] text-slate-400 font-semibold">สถานที่</label>
                <input type="text" id="arsv-loc" placeholder="เช่น โรงงาน 1"
                  class="w-full mt-0.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400">
              </div>
            </div>
            <div>
              <label class="text-[10px] text-slate-400 font-semibold">หมายเหตุ</label>
              <input type="text" id="arsv-notes" placeholder="หมายเหตุ (ไม่บังคับ)"
                class="w-full mt-0.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400">
            </div>
            <button onclick="window._arsvAddRecord('${employeeId}','${(name||'').replace(/'/g,"\\'")}',${targetPerYear||24})"
              class="w-full py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-[0.97]"
              style="background:linear-gradient(135deg,#d97706,#f59e0b)">
              <svg class="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
              เพิ่มรายการ
            </button>
          </div>
        </div>
      </div>`, 'max-w-md');
    await _arsvLoadRecords(employeeId, year);
};

async function _arsvLoadRecords(employeeId, year) {
    try {
        const detailRes = await API.get(`/patrol/attendance-detail?employeeId=${encodeURIComponent(employeeId)}&group=supervisor&year=${year}`);
        _arsvRenderQuotaDetail(detailRes.data || {}, employeeId, year);
        return;
        const res = await API.get(`/patrol/supervisor-checkins?employeeId=${employeeId}&year=${year}`);
        const rows = res.data || [];
        const countEl = document.getElementById('arsv-count');
        const listEl  = document.getElementById('arsv-list');
        if (countEl) countEl.textContent = `${rows.length} รายการ`;
        if (!listEl) return;
        if (!rows.length) {
            listEl.innerHTML = `<div class="text-center py-6 text-slate-300 text-xs">ยังไม่มีรายการ Self-Patrol ปีนี้</div>`;
            return;
        }
        listEl.innerHTML = rows.map(r => {
            const d = new Date(r.CheckinDate);
            const dateStr = d.toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' });
            return `<div class="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs text-slate-500 flex-shrink-0 font-mono">${dateStr}</span>
                ${r.Location ? `<span class="text-[10px] text-slate-400 truncate">${r.Location}</span>` : ''}
              </div>
              <button onclick="window._arsvDeleteRecord(${r.id},'${employeeId}',${year})"
                class="flex-shrink-0 p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors" title="ลบ">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>`;
        }).join('');
    } catch (err) {
        const listEl = document.getElementById('arsv-list');
        if (listEl) listEl.innerHTML = `<div class="text-center py-4 text-red-400 text-xs">โหลดข้อมูลไม่สำเร็จ</div>`;
    }
}

window._arsvAddRecord = async function(employeeId, name, targetPerYear) {
    const actionKey = `arsv-add-${employeeId}`;
    if (_patrolActionLocks.has(actionKey)) return;
    const date  = document.getElementById('arsv-date')?.value;
    const loc   = document.getElementById('arsv-loc')?.value?.trim() || null;
    const notes = document.getElementById('arsv-notes')?.value?.trim() || null;
    const scheduledSessionId = document.getElementById('arsv-session')?.value || null;
    const PatrolType = document.querySelector('input[name="arsv-type"]:checked')?.value || 'normal';
    if (!date) { showToast('กรุณาเลือกวันที่', 'error'); return; }
    if (!scheduledSessionId) { showToast('กรุณาเลือกรอบตามกำหนดการ', 'error'); return; }
    if (_arsvCurrentDetail?.scheduleMode === 'flexible' && !loc) { showToast('Please select area', 'error'); return; }
    _patrolActionLocks.add(actionKey);
    try {
        await API.post('/patrol/admin-record/supervisor', { EmployeeID: employeeId, CheckinDate: date, Location: loc, Notes: notes, ScheduledSessionID: scheduledSessionId, PatrolType });
        showToast('เพิ่มรายการสำเร็จ', 'success');
        const year = parseInt(document.getElementById('sv-year-select')?.value) || new Date().getFullYear();
        await _arsvLoadRecords(employeeId, year);
        loadSupervisorOverview(year);
    } catch (err) { showError(getReadableError(err, 'เพิ่มรายการ Self-Patrol ไม่สำเร็จ')); }
    finally { _patrolActionLocks.delete(actionKey); }
};

window._arsvDeleteRecord = async function(id, employeeId, year) {
    const actionKey = `arsv-delete-${id}`;
    if (_patrolActionLocks.has(actionKey)) return;
    const ok = await showConfirmationModal('ยืนยันการลบ', 'ต้องการลบรายการ Self-Patrol นี้ใช่หรือไม่?');
    if (!ok) return;
    _patrolActionLocks.add(actionKey);
    try {
        await API.delete(`/patrol/admin-record/supervisor/${id}`);
        showToast('ลบรายการสำเร็จ', 'success');
        await _arsvLoadRecords(employeeId, year);
        loadSupervisorOverview(year);
    } catch (err) { showError(getReadableError(err, 'ลบรายการ Self-Patrol ไม่สำเร็จ')); }
    finally { _patrolActionLocks.delete(actionKey); }
};

// ─── Issue Form ───────────────────────────────────────────────────────────────
// Auto-calculate DueDate from DateFound + Rank
window._calcDueDate = function() {
    const dateEl = document.getElementById('if-date-found');
    const rankEl = document.getElementById('if-rank');
    const dueEl  = document.getElementById('if-due-date');
    if (!dateEl || !rankEl || !dueEl) return;
    const date = dateEl.value;
    const rank = rankEl.value;
    if (!date || !rank) { dueEl.value = ''; return; }
    const days = rank === 'A' ? 7 : rank === 'B' ? 14 : 30;
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    dueEl.value = d.toISOString().split('T')[0];
};

function _issueDetailDate(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10) || '-';
    return parsed.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

function _issueTimelineHtml(issue = {}, urls = {}) {
    if (!issue?.IssueID && !issue?.DateFound) return '';
    const status = String(issue.CurrentStatus || 'Open');
    const steps = [
        {
            key: 'found',
            label: 'Reported',
            date: _issueDetailDate(issue.DateFound),
            detail: issue.HazardDescription || issue.Area || 'Issue reported',
            done: true,
            color: '#ef4444',
        },
        {
            key: 'assigned',
            label: 'Assigned',
            date: _issueDetailDate(issue.DueDate),
            detail: [_formatIssueMulti(issue.ResponsibleDept, ''), _formatIssueMulti(issue.ResponsibleUnit, '')].filter(Boolean).join(' / ') || 'Waiting owner',
            done: Boolean(issue.ResponsibleDept || issue.ResponsibleUnit || issue.DueDate),
            color: '#0ea5e9',
        },
        {
            key: 'temporary',
            label: 'Temporary fix',
            date: _issueDetailDate(issue.TempDate),
            detail: issue.TempDescription || (urls.tempUrl ? 'Temporary evidence attached' : 'Not recorded'),
            done: status === 'Temporary' || status === 'Closed' || Boolean(issue.TempDescription || urls.tempUrl),
            color: '#f97316',
        },
        {
            key: 'closed',
            label: 'Closed',
            date: _issueDetailDate(issue.FinishDate),
            detail: issue.ActionDescription || (urls.afterUrl ? 'After evidence attached' : 'Not closed yet'),
            done: status === 'Closed' || Boolean(issue.ActionDescription || issue.FinishDate || urls.afterUrl),
            color: '#10b981',
        },
        {
            key: 'approval',
            label: 'Admin approval',
            date: _issueDetailDate(issue.CloseApprovedAt || issue.CloseRejectedAt || issue.CloseRequestedAt),
            detail: _issueApprovalStatus(issue) === 'Pending'
                ? 'Waiting Admin approval'
                : (_issueApprovalStatus(issue) === 'Rejected' ? (issue.CloseRejectReason || 'Rejected by Admin') : (_issueApprovalStatus(issue) === 'Approved' ? 'Approved by Admin' : 'No approval request')),
            done: ['Pending', 'Approved', 'Rejected'].includes(_issueApprovalStatus(issue)),
            color: _issueApprovalStatus(issue) === 'Rejected' ? '#e11d48' : '#0284c7',
        },
    ];
    return `
      <section id="issue-detail-timeline" class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 class="text-xs font-black text-slate-700">Issue timeline</h4>
            <p class="text-[10px] font-semibold text-slate-400">From first report to permanent closure</p>
          </div>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">#${escHtml(issue.IssueID || '-')}</span>
        </div>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-5">
          ${steps.map((step, index) => `
            <div class="relative rounded-2xl border ${step.done ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-200 bg-white'} p-3">
              <div class="flex items-center gap-2">
                <span class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white" style="background:${step.done ? step.color : '#cbd5e1'}">${index + 1}</span>
                <div class="min-w-0">
                  <p class="truncate text-[11px] font-black text-slate-700">${step.label}</p>
                  <p class="text-[10px] font-semibold ${step.done ? 'text-slate-500' : 'text-slate-300'}">${escHtml(step.date)}</p>
                </div>
              </div>
              <p class="mt-2 line-clamp-2 text-[11px] leading-4 ${step.done ? 'text-slate-500' : 'text-slate-300'}">${escHtml(step.detail)}</p>
            </div>`).join('')}
        </div>
      </section>`;
}

function _issueEvidenceComparisonHtml(issue = {}, urls = {}) {
    const items = [
        { key: 'before', label: 'Before', url: urls.beforeUrl, color: '#dc2626', note: issue.HazardDescription || '' },
        { key: 'temp', label: 'Temporary', url: urls.tempUrl, color: '#f97316', note: issue.TempDescription || '' },
        { key: 'after', label: 'After', url: urls.afterUrl, color: '#059669', note: issue.ActionDescription || '' },
    ].filter(item => item.url);
    if (items.length < 2) return '';
    return `
      <section id="issue-before-after-comparison" class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 class="text-xs font-black text-slate-700">Before / After comparison</h4>
            <p class="text-[10px] font-semibold text-slate-400">Evidence view for closure confidence</p>
          </div>
          <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">${items.length} evidence</span>
        </div>
        <div class="grid grid-cols-1 gap-3 ${items.length >= 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2'}">
          ${items.map(item => `
            <button type="button" onclick='window._patrolOpenImageViewer(${JSON.stringify(item.url)}, ${JSON.stringify(item.label + ' evidence')})'
              class="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-left shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300">
              <div class="relative h-44">
                <img src="${escHtml(item.url)}" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy">
                <span class="absolute left-2 top-2 rounded-lg px-2 py-1 text-[10px] font-black text-white shadow-sm" style="background:${item.color}">${item.label}</span>
                <span class="absolute inset-0 bg-slate-950/0 transition-colors group-hover:bg-slate-950/25"></span>
              </div>
              <div class="bg-white px-3 py-2">
                <p class="line-clamp-2 min-h-[2rem] text-[11px] font-semibold leading-4 text-slate-500">${escHtml(item.note || 'Evidence attached')}</p>
              </div>
            </button>`).join('')}
        </div>
      </section>`;
}

function _issueApprovalPanelHtml(issue = {}, isView = false) {
    const status = _issueApprovalStatus(issue);
    if (!['Pending', 'Approved', 'Rejected'].includes(status)) return '';
    const requestedBy = issue.CloseRequesterName || issue.CloseRequestedBy || '-';
    const requestedAt = _issueDetailDate(issue.CloseRequestedAt);
    const reviewedBy = issue.CloseApprovedBy || issue.CloseRejectedBy || '-';
    const reviewedAt = _issueDetailDate(issue.CloseApprovedAt || issue.CloseRejectedAt);
    const tone = status === 'Pending'
        ? { box: 'border-sky-200 bg-sky-50', title: 'text-sky-800', sub: 'text-sky-600' }
        : status === 'Approved'
            ? { box: 'border-emerald-200 bg-emerald-50', title: 'text-emerald-800', sub: 'text-emerald-600' }
            : { box: 'border-rose-200 bg-rose-50', title: 'text-rose-800', sub: 'text-rose-600' };
    return `
      <section class="rounded-2xl border ${tone.box} p-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="min-w-0">
            <div class="mb-2">${_issueApprovalBadgeHtml(issue)}</div>
            <h4 class="text-sm font-black ${tone.title}">Close approval / อนุมัติปิดงาน</h4>
            <p class="mt-1 text-xs font-semibold ${tone.sub}">Requested by ${escHtml(requestedBy)} · ${escHtml(requestedAt)}</p>
            ${status === 'Rejected' ? `<p class="mt-2 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold text-rose-700">Reason: ${escHtml(issue.CloseRejectReason || '-')}</p>` : ''}
            ${status !== 'Pending' ? `<p class="mt-2 text-xs font-semibold ${tone.sub}">Reviewed by ${escHtml(reviewedBy)} · ${escHtml(reviewedAt)}</p>` : ''}
          </div>
          ${isAdmin && isView && status === 'Pending' ? `
          <div class="flex flex-shrink-0 gap-2">
            <button type="button" data-close-review-issue="${escHtml(issue.IssueID)}" onclick="window.reviewPatrolIssueClose(${JSON.stringify(issue.IssueID)}, 'reject')" class="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50">Reject</button>
            <button type="button" data-close-review-issue="${escHtml(issue.IssueID)}" onclick="window.reviewPatrolIssueClose(${JSON.stringify(issue.IssueID)}, 'approve')" class="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-50">Approve</button>
          </div>` : ''}
        </div>
      </section>`;
}

function _issueEventsHtml(events = []) {
    if (!events.length) {
        return `<p class="text-xs font-semibold text-slate-400">No backend events yet / ยังไม่มี event log</p>`;
    }
    const labels = {
        CREATED: 'Reported / พบปัญหา',
        TEMP_UPDATED: 'Temporary fix / แก้ชั่วคราว',
        CLOSE_REQUESTED: 'Close requested / ขอปิดงาน',
        CLOSE_APPROVED: 'Approved / อนุมัติ',
        CLOSE_REJECTED: 'Rejected / ไม่อนุมัติ',
        CLOSED: 'Closed / ปิดงาน',
        UPDATED: 'Updated / อัปเดต',
    };
    return events.map(event => `
      <div class="flex gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2">
        <span class="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${String(event.EventType || '').includes('REJECT') ? 'bg-rose-500' : String(event.EventType || '').includes('APPROV') ? 'bg-emerald-500' : 'bg-sky-500'}"></span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs font-black text-slate-700">${escHtml(labels[event.EventType] || event.EventType || 'Event')}</p>
            <span class="text-[10px] font-semibold text-slate-400">${escHtml(_issueDetailDate(event.CreatedAt))}</span>
          </div>
          <p class="mt-0.5 text-[11px] font-semibold text-slate-500">${escHtml(event.ActorName || event.ActorID || '-')} ${event.FromStatus || event.ToStatus ? `· ${escHtml(event.FromStatus || '-')} -> ${escHtml(event.ToStatus || '-')}` : ''}</p>
          ${event.Comment ? `<p class="mt-1 line-clamp-2 text-[11px] text-slate-500">${escHtml(event.Comment)}</p>` : ''}
        </div>
      </div>`).join('');
}

async function _loadIssueEventsIntoModal(issueId) {
    const holder = document.getElementById('issue-event-log-body');
    if (!holder || !issueId) return;
    try {
        const res = await API.get(`/patrol/issue/${issueId}/events`);
        const events = normalizeApiArray(res?.data || res || []);
        holder.innerHTML = _issueEventsHtml(events);
    } catch (err) {
        holder.innerHTML = `<p class="text-xs font-semibold text-rose-500">${escHtml(getReadableError(err, 'Cannot load event timeline.'))}</p>`;
    }
}

const _issueCloseReviewsInFlight = new Set();

window.reviewPatrolIssueClose = async function(issueId, action) {
    if (!isAdmin || !issueId) return;
    const normalized = String(action || '').toLowerCase();
    const reviewKey = String(issueId);
    if (_issueCloseReviewsInFlight.has(reviewKey)) return;
    let reason = '';
    if (normalized === 'reject') {
        reason = window.prompt('Reject reason / เหตุผลที่ไม่อนุมัติ') || '';
        if (!reason.trim()) {
            showToast('Reject reason is required.', 'warning');
            return;
        }
    }
    _issueCloseReviewsInFlight.add(reviewKey);
    const reviewButtons = [...document.querySelectorAll('[data-close-review-issue]')]
        .filter(button => button.dataset.closeReviewIssue === reviewKey);
    reviewButtons.forEach(button => { button.disabled = true; });
    try {
        showLoading(normalized === 'approve' ? 'Approving close request...' : 'Rejecting close request...');
        const res = await API.post(`/patrol/issue/${issueId}/close-review`, normalized === 'approve' ? { action: 'approve' } : { action: 'reject', reason });
        if (res?.success === false) throw new Error(res.message || 'Review failed');
        const email = res?.email || {};
        const emailNote = email.sent ? ' Email sent.' : (email.queued ? ' Email queued.' : '');
        showToast(`${res.message || 'Close request reviewed.'}${emailNote}`, 'success');
        closeModal();
        window._saveTab?.('patrol', 'issues');
        loadPatrolPage();
    } catch (err) {
        showError(getReadableError(err, 'Cannot review close request.'));
    } finally {
        _issueCloseReviewsInFlight.delete(reviewKey);
        reviewButtons.forEach(button => { button.disabled = false; });
        hideLoading();
    }
};

window._onCheckinTodaySessionChange = function() {
    const sel = document.getElementById('checkin-today-select');
    const areaSel = document.getElementById('checkin-area-select');
    const area = sel?.selectedOptions?.[0]?.dataset?.area || '';
    const areaCode = sel?.selectedOptions?.[0]?.dataset?.areaCode || '';
    if (area && areaSel) patrolSetAreaSelectValue(areaSel, area, areaCode);
};

window.openIssueForm = function(mode, rawIssueData = null) {
    const issueData = normalizeApiObject(rawIssueData);
    const requestedMode = mode;
    const isClosedIssue = issueData?.CurrentStatus === 'Closed';
    const canUpdateIssue = canCurrentUserUpdateIssue(issueData);
    const isView = requestedMode === 'VIEW'
        || (requestedMode === 'EDIT' && !isAdmin && isClosedIssue);
    const isEdit = requestedMode === 'EDIT' && !isView;
    const today = new Date().toISOString().split('T')[0];
    // Section 1: readonly for regular users editing, but admin can edit everything
    const s1r = (isView || (isEdit && !isAdmin)) ? 'readonly' : '';
    const s1d = (isView || (isEdit && !isAdmin)) ? 'disabled' : '';

    // ── Step indicator ──────────────────────────────────────────────────────
    const steps = [
        { label: 'รายงานปัญหา', icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>` },
        { label: 'แก้ชั่วคราว',  icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>` },
        { label: 'ปิดงาน',       icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>` },
    ];
    const stepIdx = requestedMode === 'OPEN' ? 0 : isEdit ? 1 : (issueData?.CurrentStatus === 'Closed' ? 2 : issueData?.CurrentStatus === 'Temporary' ? 1 : 0);
    const stepHtml = steps.map((s, i) => {
        const done   = i < stepIdx;
        const active = i === stepIdx;
        return `
        <div class="flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}">
            <div class="flex flex-col items-center gap-1">
                <div class="w-9 h-9 rounded-full flex items-center justify-center transition-all
                    ${active ? 'text-white shadow-lg shadow-emerald-200' : done ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-300'}"
                    style="${active ? 'background:linear-gradient(135deg,#059669,#0d9488)' : ''}">
                    ${done ? `<svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>` : s.icon}
                </div>
                <span class="text-[10px] font-semibold whitespace-nowrap ${active ? 'text-emerald-700' : done ? 'text-emerald-500' : 'text-slate-400'}">${s.label}</span>
            </div>
            ${i < steps.length - 1 ? `<div class="flex-1 h-0.5 mx-2 mb-5 ${i < stepIdx ? 'bg-emerald-300' : 'bg-slate-200'}"></div>` : ''}
        </div>`;
    }).join('');

    // ── Issue Detail Section (shown in all modes) ───────────────────────────
    const beforeUrl = resolveFileUrl(issueData?.BeforeImage);
    const afterUrl  = resolveFileUrl(issueData?.AfterImage);
    const tempUrl   = resolveFileUrl(issueData?.TempImage);
    const hasTempFix = Boolean(issueData?.TempDescription || tempUrl);
    const hasFinalSolution = Boolean(issueData?.ActionDescription || issueData?.FinishDate || afterUrl);
    const timelineHtml = (isView || isEdit) ? _issueTimelineHtml(issueData, { beforeUrl, tempUrl, afterUrl }) : '';
    const comparisonHtml = (isView || isEdit) ? _issueEvidenceComparisonHtml(issueData, { beforeUrl, tempUrl, afterUrl }) : '';
    const approvalPanelHtml = (isView || isEdit) ? _issueApprovalPanelHtml(issueData, isView) : '';

    // Responsible dept + unit helpers
    const deptList = (_masterDepts.length ? _masterDepts : [{ Name:'Maintenance' },{ Name:'Safety' },{ Name:'Production' }]);
    const selectedDeptNames = _normalizeDept(issueData?.ResponsibleDept);
    const selectedUnitNames = _issueMultiValues(issueData?.ResponsibleUnit);
    const initialDeptIds = new Set(deptList
        .filter(dept => selectedDeptNames.includes(dept.Name))
        .map(dept => String(dept.id || dept.ID)));
    const initialUnits = _masterUnits.filter(unit => initialDeptIds.has(String(unit.department_id)));
    const selectedHazardTypes = _issueMultiValues(issueData?.HazardType);
    const stopOptions = CCCF_STOP_TYPES.map(s => ({ value: `STOP ${s.id} ${s.label}`, ...s }));

    // Rank badge color
    const rankColor = issueData?.Rank === 'A' ? '#dc2626' : issueData?.Rank === 'B' ? '#f97316' : '#059669';
    const statusMeta = {
        Open: { label: 'Open', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
        Temporary: { label: 'Temporary', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
        Closed: { label: 'Closed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    };
    const fmtIssueDate = (value) => value ? new Date(value).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' }) : '-';
    const foundByLabel = [
        issueData?.ReporterName || issueData?.FoundBy || '',
        issueData?.ReporterTeam || issueData?.FoundByTeam || '',
    ].filter(Boolean).join(' / ') || issueData?.ReporterID || '-';
    const reporterProfile = patrolDisplayUser();
    const reporterPreviewLabel = requestedMode === 'OPEN'
        ? [reporterProfile.name, reporterProfile.department, reporterProfile.unit].filter(Boolean).join(' / ')
        : foundByLabel;
    const finishedLabel = issueData?.FinishDate
        ? fmtIssueDate(issueData.FinishDate)
        : ((issueData?.CurrentStatus || '') === 'Closed' ? '-' : 'ยังไม่ปิดงาน');
    const isIssueOverdue = isView && issueData?.CurrentStatus !== 'Closed' && issueData?.DueDate && new Date(issueData.DueDate) < new Date();
    const viewSummaryHtml = isView ? `
      <div class="mb-5 rounded-2xl border ${isIssueOverdue ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'} overflow-hidden">
        <div class="px-5 py-4 border-b ${isIssueOverdue ? 'border-rose-100' : 'border-slate-100'} flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">#${escHtml(issueData?.IssueID || '-')}</span>
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusMeta[issueData?.CurrentStatus]?.cls || 'bg-slate-50 text-slate-600 border-slate-200'}">${statusMeta[issueData?.CurrentStatus]?.label || escHtml(issueData?.CurrentStatus || '-')}</span>
              ${issueData?.Rank ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full text-white" style="background:${rankColor}">Rank ${escHtml(issueData.Rank)}</span>` : ''}
              ${isIssueOverdue ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white">Overdue</span>` : ''}
              ${_issueApprovalBadgeHtml(issueData)}
            </div>
            <h3 class="text-sm font-bold text-slate-800 truncate">${escHtml(issueData?.MachineName || issueData?.Area || 'Safety Patrol Issue')}</h3>
            <p class="text-xs text-slate-500 mt-0.5">${escHtml(_formatIssueHazardTypes(issueData?.HazardType))}</p>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center w-full md:w-auto">
            <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
              <p class="text-[10px] font-bold uppercase text-slate-400">Found</p>
              <p class="text-xs font-bold text-slate-700 whitespace-nowrap">${fmtIssueDate(issueData?.DateFound)}</p>
            </div>
            <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
              <p class="text-[10px] font-bold uppercase text-slate-400">Due</p>
              <p class="text-xs font-bold ${isIssueOverdue ? 'text-rose-700' : 'text-slate-700'} whitespace-nowrap">${fmtIssueDate(issueData?.DueDate)}</p>
            </div>
            <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
              <p class="text-[10px] font-bold uppercase text-slate-400">Area</p>
              <p class="text-xs font-bold text-slate-700 truncate max-w-[92px]">${escHtml(issueData?.Area || '-')}</p>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-0 text-xs">
          <div class="px-5 py-3 border-b md:border-b-0 md:border-r ${isIssueOverdue ? 'border-rose-100' : 'border-slate-100'}">
            <p class="text-[10px] font-bold uppercase text-slate-400">Responsible</p>
            <p class="font-semibold text-slate-700 mt-1">${escHtml([_formatIssueMulti(issueData?.ResponsibleDept, ''), _formatIssueMulti(issueData?.ResponsibleUnit, '')].filter(Boolean).join(' / ') || '-')}</p>
          </div>
          <div class="px-5 py-3 border-b md:border-b-0 md:border-r ${isIssueOverdue ? 'border-rose-100' : 'border-slate-100'}">
            <p class="text-[10px] font-bold uppercase text-slate-400">Found By</p>
            <p class="font-semibold text-slate-700 mt-1">${escHtml(foundByLabel)}</p>
          </div>
          <div class="px-5 py-3">
            <p class="text-[10px] font-bold uppercase text-slate-400">Finished</p>
            <p class="font-semibold text-slate-700 mt-1">${escHtml(finishedLabel)}</p>
          </div>
        </div>
      </div>` : '';

    const html = `
    <div class="text-sm">
      ${viewSummaryHtml}

      <!-- ── Stepper ── -->
      <div class="flex items-start px-1 mb-6">${stepHtml}</div>
      <div class="mb-5 space-y-4">
        ${approvalPanelHtml}
        ${timelineHtml}
        ${(isView || isEdit) && issueData?.IssueID ? `
        <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="mb-3">
            <h4 class="text-xs font-black text-slate-700">Backend event log / ประวัติระบบ</h4>
            <p class="text-[10px] font-semibold text-slate-400">Recorded actor, status and approval trail</p>
          </div>
          <div id="issue-event-log-body" class="space-y-2">
            <p class="text-xs font-semibold text-slate-400">Loading events...</p>
          </div>
        </section>` : ''}
        ${comparisonHtml}
      </div>

      <form id="issue-form" class="space-y-5">
        <input type="hidden" name="ActionType" value="${isEdit ? 'UPDATE' : requestedMode}">
        <input type="hidden" name="IssueID"    value="${issueData?.IssueID || ''}">

        <!-- ═══ SECTION 1: Issue Detail ═══ -->
        <div class="border border-slate-200 rounded-2xl overflow-hidden">
          <div class="flex items-center gap-3 px-5 py-3.5 bg-slate-50 border-b border-slate-200">
            <div class="w-7 h-7 rounded-xl flex items-center justify-center text-white flex-shrink-0" style="background:linear-gradient(135deg,#475569,#334155)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            </div>
            <div>
              <p class="font-bold text-slate-700 text-sm">รายละเอียดปัญหา</p>
              <p class="text-[10px] text-slate-400 font-medium">Issue Detail</p>
            </div>
            ${issueData?.IssueID ? `<span class="ml-auto font-mono text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">#${issueData.IssueID}</span>` : ''}
          </div>
          <div class="p-5 space-y-4">
            <div class="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
              <p class="text-[10px] font-bold uppercase tracking-wide text-emerald-600">ผู้รายงาน</p>
              <p class="mt-0.5 text-sm font-bold text-slate-700">${escHtml(reporterPreviewLabel || '-')}</p>
            </div>

            <!-- วันที่พบ + พื้นที่ -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-slate-500">วันที่พบปัญหา</label>
                <input type="date" id="if-date-found" name="DateFound"
                  class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
                  value="${issueData?.DateFound ? issueData.DateFound.split('T')[0] : today}"
                  oninput="window._calcDueDate()" ${s1r}>
              </div>
              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-slate-500">พื้นที่ตรวจ</label>
                <select name="Area" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all" ${s1d}>
                  ${(_patrolAreas.length ? _patrolAreas : [{ Name:'โรงงาน 1' },{ Name:'โรงงาน 2' },{ Name:'รอบนอก' }])
                    .map(a => {
                        const name = getPatrolAreaName(a);
                        return name ? `<option value="${escHtml(name)}" ${issueData?.Area === name ? 'selected':''}>${escHtml(name)}</option>` : '';
                    }).join('')}
                </select>
              </div>
            </div>

            <!-- ชื่อเครื่องจักร -->
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-500">ชื่อเครื่องมือ / เครื่องจักร</label>
              <input type="text" name="MachineName"
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all"
                value="${issueData?.MachineName || ''}"
                placeholder="ระบุชื่อเครื่องมือหรือเครื่องจักร (ถ้ามี)" ${s1r}>
            </div>

            <!-- ระบุอันตราย -->
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-500">รายละเอียดอันตราย / วิธีเกิด</label>
              <textarea name="HazardDescription" rows="3"
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all resize-none"
                placeholder="อธิบายลักษณะปัญหา สาเหตุ และความเสี่ยง..." ${s1r}>${issueData?.HazardDescription || ''}</textarea>
            </div>

            <!-- ชนิดอันตราย + Rank -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-slate-500">ชนิดอันตราย (STOP)</label>
                <input type="hidden" id="if-hazard-type-hidden" name="HazardType" value="${escHtml(_issueMultiJson(selectedHazardTypes))}">
                <div class="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-2">
                  ${stopOptions.map(h => {
                      const checked = selectedHazardTypes.includes(h.value) || _issueStopIds(selectedHazardTypes).includes(h.id);
                      return `<label class="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        <input type="checkbox" class="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400" value="${escHtml(h.value)}" ${checked ? 'checked' : ''} ${s1d}
                          onchange="window._issueToggleMultiValue('if-hazard-type-hidden', this.value, this.checked)">
                        <span><span class="font-black" style="color:${h.color}">STOP ${h.id}</span> ${escHtml(h.label)}</span>
                      </label>`;
                  }).join('')}
                </div>
              </div>
              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-slate-500">
                  ระดับความเร่งด่วน (Rank)
                  ${(isView || isEdit) && issueData?.Rank ? `<span class="ml-1 px-1.5 py-0.5 rounded text-white text-[10px] font-bold" style="background:${rankColor}">${issueData.Rank}</span>` : ''}
                </label>
                <select id="if-rank" name="Rank" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all" oninput="window._calcDueDate()" ${s1d}>
                  <option value="">-- เลือก Rank --</option>
                  <option value="A" ${issueData?.Rank === 'A' ? 'selected':''}>Rank A — แก้ไขภายใน 7 วัน (เร่งด่วนสูง)</option>
                  <option value="B" ${issueData?.Rank === 'B' ? 'selected':''}>Rank B — แก้ไขภายใน 14 วัน (เร่งด่วนปานกลาง)</option>
                  <option value="C" ${issueData?.Rank === 'C' ? 'selected':''}>Rank C — แก้ไขภายใน 30 วัน (ปกติ)</option>
                </select>
              </div>
            </div>

            <!-- Due Date -->
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-500">
                กำหนดเสร็จ
                <span class="text-emerald-500 font-normal">(คำนวณอัตโนมัติ)</span>
              </label>
              <input type="date" id="if-due-date" name="DueDate"
                class="w-full rounded-xl border border-slate-200 bg-emerald-50 px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all"
                value="${issueData?.DueDate ? issueData.DueDate.split('T')[0] : ''}" ${s1r}>
            </div>

            <!-- ส่วนงานรับผิดชอบ + Safety Unit -->
            <div class="space-y-2">
              <label class="block text-xs font-semibold text-slate-500">ส่วนงานรับผิดชอบ</label>
              ${isView
                ? `<div class="space-y-1.5">
                    <div class="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
                      <svg class="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                      <span class="text-sm font-medium text-blue-700">${escHtml(_formatIssueMulti(issueData?.ResponsibleDept, '—'))}</span>
                    </div>
                    ${selectedUnitNames.length ? `
                    <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-50 border border-sky-100">
                      <svg class="w-3.5 h-3.5 text-sky-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                      <span class="text-xs font-medium text-sky-700">${escHtml(selectedUnitNames.join(', '))}</span>
                      <span class="text-[10px] text-sky-400 ml-1">Safety Unit</span>
                    </div>` : ''}
                  </div>`
                : `<div class="space-y-2">
                    <input type="hidden" id="if-resp-dept-hidden" name="ResponsibleDept" value="${escHtml(_issueMultiJson(selectedDeptNames))}">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-2">
                      ${deptList.map(d => `<label class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        <input type="checkbox" class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-400" value="${escHtml(d.Name)}" ${selectedDeptNames.includes(d.Name) ? 'checked' : ''} ${s1d}
                          onchange="window._issueToggleMultiValue('if-resp-dept-hidden', this.value, this.checked)">
                        <span>${escHtml(d.Name)}</span>
                      </label>`).join('')}
                    </div>
                    <div id="if-unit-container" data-disabled="${s1d ? '1' : '0'}">${_issueUnitCheckboxesHtml(initialUnits, selectedUnitNames, Boolean(s1d))}</div>
                    <div class="hidden" aria-hidden="true">
                      ${initialUnits.length ? `
                      <select id="if-unit-select" multiple size="4"
                        class="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all"
                        onchange="window._issueSetUnitSelection(this)">
                        <option value="">— เลือก Safety Unit (ถ้ามี) —</option>
                        ${initialUnits.map(u => `<option value="${u.name}" ${selectedUnitNames.includes(u.name) ? 'selected' : ''}>${u.name}${u.short_code ? ' · '+u.short_code : ''}</option>`).join('')}
                      </select>` : ''}
                    </div>
                    <input type="hidden" id="if-resp-unit" name="ResponsibleUnit" value="${escHtml(_issueMultiJson(selectedUnitNames))}">
                  </div>`
              }
            </div>

            <!-- ภาพก่อนซ่อม (OPEN mode) -->
            ${requestedMode === 'OPEN' ? `
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-500">ภาพก่อนซ่อม <span class="text-slate-300 font-normal">(ไม่บังคับ)</span></label>
              <label class="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-6 px-4 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-all group">
                <svg class="w-8 h-8 text-slate-300 group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span class="text-xs text-slate-400 group-hover:text-emerald-600 transition-colors">คลิกเพื่อเลือกรูปภาพ</span>
                <input type="file" name="BeforeImage" accept="image/*" class="hidden" onchange="window._previewIssueFile(this)">
              </label>
            </div>` : ''}

            <!-- ภาพ Before (VIEW/EDIT) -->
            ${(isView || isEdit) && beforeUrl ? `
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-500">ภาพก่อนซ่อม</label>
              <button type="button" onclick='window._patrolOpenImageViewer(${JSON.stringify(beforeUrl)}, "ภาพก่อนซ่อม")' class="relative rounded-xl overflow-hidden h-40 bg-slate-900 block w-full group focus:outline-none focus:ring-2 focus:ring-red-400">
                <img src="${beforeUrl}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<div class=\\'flex items-center justify-center h-full text-slate-500 text-xs\\'>ไม่พบภาพ</div>'">
                <span class="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-red-600/90 text-white">BEFORE</span>
                <span class="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/35 transition-colors flex items-center justify-center">
                  <span class="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-slate-700 text-xs font-bold shadow">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-4.553M19.553 5.447V10m0-4.553H15M9 14l-4.553 4.553M4.447 18.553V14m0 4.553H9"/></svg>
                    ดูรูปเต็ม
                  </span>
                </span>
              </button>
            </div>` : ''}

          </div>
        </div>

        <!-- ═══ SECTION 2: Temp Fix ═══ -->
        ${(isEdit || (isView && hasTempFix)) ? `
        <div class="border border-orange-200 rounded-2xl overflow-hidden">
          <div class="flex items-center gap-3 px-5 py-3.5 bg-orange-50 border-b border-orange-200">
            <div class="w-7 h-7 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-orange-500">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </div>
            <div>
              <p class="font-bold text-orange-800 text-sm">การแก้ไขเบื้องต้น</p>
              <p class="text-[10px] text-orange-500 font-medium">Temporary Fix</p>
            </div>
          </div>
          <div class="p-5 space-y-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-orange-700">รายละเอียดการแก้ไขเบื้องต้น</label>
              <textarea name="TempDescription" rows="4"
                class="w-full rounded-xl border border-orange-200 bg-orange-50/40 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all resize-none"
                placeholder="อธิบายสิ่งที่ดำเนินการแก้ไขเบื้องต้นไปแล้ว..." ${isView ? 'readonly' : ''}>${issueData?.TempDescription || ''}</textarea>
            </div>
            ${isView && tempUrl ? `
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-orange-700">ภาพประกอบ</label>
              <button type="button" onclick='window._patrolOpenImageViewer(${JSON.stringify(tempUrl)}, "ภาพแก้ไขเบื้องต้น")' class="relative rounded-xl overflow-hidden h-36 bg-slate-900 block w-full group focus:outline-none focus:ring-2 focus:ring-orange-400">
                <img src="${tempUrl}" class="w-full h-full object-cover">
                <span class="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-orange-500/90 text-white">TEMP FIX</span>
                <span class="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/35 transition-colors flex items-center justify-center">
                  <span class="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-slate-700 text-xs font-bold shadow">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-4.553M19.553 5.447V10m0-4.553H15M9 14l-4.553 4.553M4.447 18.553V14m0 4.553H9"/></svg>
                    ดูรูปเต็ม
                  </span>
                </span>
              </button>
            </div>` : ''}
            ${!isView ? `
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-orange-700">ภาพประกอบการแก้ไข <span class="text-orange-300 font-normal">(ไม่บังคับ)</span></label>
              <label class="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-orange-200 rounded-xl py-5 px-4 cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-all group">
                <svg class="w-7 h-7 text-orange-300 group-hover:text-orange-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span class="text-xs text-orange-400 group-hover:text-orange-600 transition-colors">คลิกเพื่อเลือกรูปภาพ</span>
                <input type="file" name="TempImage" accept="image/*" class="hidden" onchange="window._previewIssueFile(this)">
              </label>
            </div>` : ''}
          </div>
        </div>` : ''}

        <!-- ═══ SECTION 3: Final Solution ═══ -->
        ${(isEdit || (isView && hasFinalSolution)) ? `
        <div class="border border-emerald-200 rounded-2xl overflow-hidden">
          <div class="flex items-center gap-3 px-5 py-3.5 bg-emerald-50 border-b border-emerald-200">
            <div class="w-7 h-7 rounded-xl flex items-center justify-center text-white flex-shrink-0" style="background:linear-gradient(135deg,#059669,#0d9488)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div>
              <p class="font-bold text-emerald-800 text-sm">การแก้ไขถาวร</p>
              <p class="text-[10px] text-emerald-500 font-medium">Final Solution</p>
            </div>
          </div>
          <div class="p-5 space-y-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-emerald-700">รายละเอียดการแก้ไขถาวร</label>
              <textarea name="ActionDescription" rows="4"
                class="w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all resize-none"
                placeholder="อธิบายการแก้ไขถาวรและมาตรการป้องกันการเกิดซ้ำ..." ${isView ? 'readonly' : ''}>${issueData?.ActionDescription || ''}</textarea>
            </div>
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-emerald-700">วันที่แก้ไขเสร็จสิ้น</label>
              <input type="date" name="FinishDate"
                class="w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                value="${issueData?.FinishDate ? issueData.FinishDate.split('T')[0] : today}" ${isView ? 'readonly' : ''}>
            </div>
            ${isView && afterUrl ? `
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-emerald-700">ภาพหลังแก้ไข</label>
              <button type="button" onclick='window._patrolOpenImageViewer(${JSON.stringify(afterUrl)}, "ภาพหลังแก้ไข")' class="relative rounded-xl overflow-hidden h-40 bg-slate-900 block w-full group focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <img src="${afterUrl}" class="w-full h-full object-cover">
                <span class="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-600/90 text-white">AFTER</span>
                <span class="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/35 transition-colors flex items-center justify-center">
                  <span class="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-slate-700 text-xs font-bold shadow">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-4.553M19.553 5.447V10m0-4.553H15M9 14l-4.553 4.553M4.447 18.553V14m0 4.553H9"/></svg>
                    ดูรูปเต็ม
                  </span>
                </span>
              </button>
            </div>` : ''}
            ${!isView ? `
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-emerald-700">ภาพหลังแก้ไข <span class="text-emerald-300 font-normal">(ไม่บังคับ)</span></label>
              <label class="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-emerald-200 rounded-xl py-5 px-4 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all group">
                <svg class="w-7 h-7 text-emerald-300 group-hover:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span class="text-xs text-emerald-400 group-hover:text-emerald-600 transition-colors">คลิกเพื่อเลือกรูปภาพ</span>
                <input type="file" name="AfterImage" accept="image/*" class="hidden" onchange="window._previewIssueFile(this)">
              </label>
            </div>` : ''}
          </div>
        </div>` : ''}

        <!-- Action buttons -->
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" onclick="window.closeModal&&window.closeModal()"
            class="px-6 py-2.5 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm font-semibold transition-colors">
            ${isView ? 'ปิด' : 'ยกเลิก'}
          </button>
          ${isView && !isClosedIssue && canUpdateIssue ? `
          <button type="button" onclick='window.openIssueForm("EDIT", ${JSON.stringify(issueData)})'
            class="px-7 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            style="background:linear-gradient(135deg,#f97316,#fb923c)">
            อัปเดตการแก้ไข
          </button>` : ''}
          ${!isView ? `
          <button type="submit" id="btn-issue-submit"
            class="px-7 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            style="background:linear-gradient(135deg,#059669,#0d9488)">
            ${isEdit ? 'บันทึกข้อมูล' : 'รายงานปัญหา'}
          </button>` : ''}
        </div>
      </form>
    </div>`;

    const titleMap = { OPEN: 'รายงานปัญหาใหม่', EDIT: 'อัปเดตการดำเนินการ', VIEW: 'รายละเอียดปัญหา' };
    openModal(titleMap[isView ? 'VIEW' : requestedMode], html, 'max-w-2xl');
    if ((isView || isEdit) && issueData?.IssueID) {
        _loadIssueEventsIntoModal(issueData.IssueID);
    }

    if (!isView) {
        const form = document.getElementById('issue-form');
        if (!form) return;
        form.addEventListener('submit', guardSubmitHandler(async (e) => {
            e.preventDefault();
            if (form.dataset.submitting === '1') return;
            form.dataset.submitting = '1';
            const btn = document.getElementById('btn-issue-submit');
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5 align-middle"></span>กำลังบันทึก...'; }
            const formData = new FormData(form);
            if (requestedMode === 'OPEN') {
                if (!formData.get('FoundByTeam')) formData.append('FoundByTeam', currentUser.team || '');
            }
            const validationErrors = validateIssueFormData(formData);
            if (validationErrors.length) {
                showToast(validationErrors[0], 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = isEdit ? 'บันทึกข้อมูล' : 'รายงานปัญหา';
                }
                form.dataset.submitting = '0';
                return;
            }
            showLoading('กำลังบันทึก...');
            try {
                const res = await API.post('/patrol/issue/save', formData);
                if (res?.success === false) throw new Error(res.message || 'บันทึกไม่สำเร็จ');
                const issueEmail = res?.email || {};
                const emailNote = issueEmail.sent
                    ? ' และส่งอีเมลแล้ว'
                    : issueEmail.queued
                        ? ' และบันทึกอีเมลเข้าคิวแล้ว'
                        : '';
                showToast(`บันทึกสำเร็จ${emailNote}`, 'success');
                closeModal();
                window._saveTab?.('patrol', 'issues');
                loadPatrolPage();
            } catch (err) { showError(getReadableError(err, 'บันทึกข้อมูล Patrol issue ไม่สำเร็จ')); }
            finally { form.dataset.submitting = '0'; hideLoading(); if (btn) { btn.disabled = false; btn.textContent = isEdit ? 'บันทึกข้อมูล' : 'รายงานปัญหา'; } }
        }));
    }
};

// ─── Dept → Units dynamic selector ───────────────────────────────────────────
function _issueChangeDept(deptNames) {
    const container = document.getElementById('if-unit-container');
    const unitInput  = document.getElementById('if-resp-unit');
    if (!container) return;
    const disabled = container.dataset.disabled === '1';
    const selectedDepts = Array.isArray(deptNames) ? deptNames : (deptNames ? [deptNames] : []);
    const deptIds = new Set(_masterDepts
        .filter(dept => selectedDepts.includes(dept.Name))
        .map(dept => String(dept.id || dept.ID)));
    const units = _masterUnits.filter(unit => deptIds.has(String(unit.department_id)));
    const selectedUnits = _issueMultiValues(unitInput?.value).filter(name => units.some(unit => unit.name === name));
    if (unitInput) unitInput.value = _issueMultiJson(selectedUnits);
    if (!units.length) {
        container.innerHTML = selectedDepts.length
            ? `<div class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400">ส่วนงานที่เลือกยังไม่มี Safety Unit ให้เลือก</div>`
            : '';
        return;
    }
    container.innerHTML = _issueUnitCheckboxesHtml(units, selectedUnits, disabled);
    return;

    container.innerHTML = `
        <select id="if-unit-select" multiple size="4"
          class="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all animate-fade-in"
          onchange="window._issueSetUnitSelection(this)">
          <option value="">— เลือก Safety Unit (ถ้ามี) —</option>
          ${units.map(u => `<option value="${u.name}">${u.name}${u.short_code ? ' · '+u.short_code : ''}</option>`).join('')}
        </select>`;
}

// ─── Carousel ─────────────────────────────────────────────────────────────────
function initPromoCarousel() {
    const slides = document.querySelectorAll('.carousel-item');
    const dots = document.querySelectorAll('.carousel-dot');
    const counter = document.getElementById('carousel-counter');
    if (!slides.length) return;

    let current = 0;
    const update = idx => {
        if (idx >= slides.length) idx = 0;
        else if (idx < 0) idx = slides.length - 1;
        current = idx;
        slides.forEach((s, i) => { s.style.opacity = i === current ? '1' : '0'; s.style.zIndex = i === current ? '10' : '0'; s.style.pointerEvents = i === current ? 'auto' : 'none'; });
        dots.forEach((dot, i) => { dot.style.width = i === current ? '20px' : '6px'; dot.style.background = i === current ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)'; });
        if (counter) counter.textContent = `${current + 1}/${slides.length}`;
    };

    if (window._carouselTimer) clearInterval(window._carouselTimer);
    update(0);
    window._carouselTimer = setInterval(() => update(current + 1), 5000);

    dots.forEach((dot, i) => dot.addEventListener('click', e => {
        e.stopPropagation();
        update(i);
        clearInterval(window._carouselTimer);
        window._carouselTimer = setInterval(() => update(current + 1), 5000);
    }));
}

// ─── Carousel Detail Modal ────────────────────────────────────────────────────
window.openCarouselDetail = function(index) {
    const img = SAFETY_IMAGES[index];
    if (!img) return;
    openModal(img.title, `
      <div class="space-y-4">
        <div class="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
          <img src="${img.src}" class="w-full h-auto" alt="${img.title}">
        </div>
        <p class="text-sm text-slate-600">${img.desc}</p>
        <div class="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <h4 class="text-xs font-bold text-emerald-800 uppercase mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            Safety Tips
          </h4>
          <ul class="space-y-2">
            ${(img.tips || []).map(t => `<li class="flex gap-2 text-xs text-slate-700"><svg class="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg><span>${t}</span></li>`).join('')}
          </ul>
        </div>
        <div class="flex justify-end pt-2 border-t border-slate-100">
          <button onclick="closeModal()" class="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors">ปิด</button>
        </div>
      </div>`, 'max-w-lg');
};

// ─── Overview Tab — pagination & search state ─────────────────────────────────
const OV_PAGE_SIZE = 10;
let _ovMgmtPage = 1;
let _ovMgmtQ    = '';
let _svPage      = 1;
let _svQ         = '';
let _svAllMembers = [];
let _svOverviewYear = new Date().getFullYear();

// ─── Overview Tab ─────────────────────────────────────────────────────────────
async function loadOverview(year) {
    _overviewYear = year;
    const tbody   = document.getElementById('overview-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-300 text-xs">
      <div class="inline-flex flex-col items-center gap-2">
        <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
        <span>กำลังโหลด...</span>
      </div>
    </td></tr>`;

    try {
        const res = await API.get(`/patrol/attendance-overview?year=${year}`);
        _overviewData = res?.data || null;
        if (!_overviewData) throw new Error('ไม่มีข้อมูล');

        const s = _overviewData.summary;
        const acceptedTotal = Number(s.acceptedCoverageToDateTotal ?? s.totalAttended ?? 0);
        const acceptedTotalPct = Number(s.acceptedCoverageToDatePct ?? s.percent ?? 0);
        s.totalAttended = acceptedTotal;
        s.percent = acceptedTotalPct;
        // Stats cards
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setEl('ov-stat-members', _overviewData.members.length);
        setEl('ov-stat-total', s.totalSessions);
        setEl('ov-stat-attended', acceptedTotal);
        setEl('ov-stat-pct', `${acceptedTotalPct}%`);
        setEl('ov-table-subtitle', `ปี ${year}`);
        // Summary card
        setEl('ov-card-total', s.totalSessions);
        setEl('ov-card-attended', acceptedTotal);
        setEl('ov-card-pct', `${acceptedTotalPct}%`);
        setEl('ov-mgmt-pie-pct', `${acceptedTotalPct}%`);
        if (s.latestDate) {
            const d = new Date(s.latestDate);
            setEl('ov-card-date', d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }));
        }

        // Refresh hero stats if overview tab is active
        window._refreshOverviewHero?.();
        // Table — reset search/page on fresh load
        _ovMgmtPage = 1; _ovMgmtQ = '';
        const ovSearchEl = document.getElementById('ov-search-input');
        if (ovSearchEl) ovSearchEl.value = '';
        renderOverviewTable(_overviewData.members);

        // Spotlight card
        renderSpotlightCard();

        // Pie chart
        renderOverviewChart(acceptedTotalPct);

    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-xs text-slate-400">ไม่สามารถโหลดข้อมูลได้: ${escHtml(err.message)}</td></tr>`;
    }
}

function patrolOverviewMobileCard(member, group, yearlyTarget, acceptedCoverage, actualAttended, acceptedPct, final, isMe) {
    const name = member.Name || member.EmployeeName || '-';
    const position = member.Position || '-';
    const department = member.Department || '-';
    const action = `window.openPatrolAttendanceDetailModal(${_patrolJsArg(member.EmployeeID)},${_patrolJsArg(name)},${_patrolJsArg(group)},${Number(yearlyTarget) || 0})`;
    return `<button type="button" onclick="${action}" class="w-full rounded-xl border border-slate-100 bg-white p-3 text-left shadow-sm transition-all active:scale-[0.99] active:bg-slate-50">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-black text-slate-800">${escHtml(name)}${isMe ? ' <span class="text-[10px] text-emerald-600">(ฉัน)</span>' : ''}</p>
          <p class="mt-0.5 truncate text-[11px] font-medium text-slate-400">${escHtml(position)} · ${escHtml(department)}</p>
        </div>
        <span class="shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${final.cls}">${escHtml(final.label)}</span>
      </div>
      <div class="mt-3 grid grid-cols-3 gap-2">
        <div class="rounded-lg bg-slate-50 px-2 py-2"><p class="text-[9px] font-bold uppercase text-slate-400">เป้าทั้งปี</p><p class="mt-0.5 text-sm font-black text-slate-700">${Number(yearlyTarget) || 0}</p></div>
        <div class="rounded-lg bg-emerald-50 px-2 py-2"><p class="text-[9px] font-bold uppercase text-emerald-600">Accepted</p><p class="mt-0.5 text-sm font-black text-emerald-700">${Number(acceptedCoverage) || 0}</p>${Number(acceptedCoverage) !== Number(actualAttended) ? `<p class="text-[9px] text-emerald-600/70">เดินจริง ${Number(actualAttended) || 0}</p>` : ''}</div>
        <div class="rounded-lg bg-sky-50 px-2 py-2"><p class="text-[9px] font-bold uppercase text-sky-600">Accepted %</p><p class="mt-0.5 text-sm font-black text-sky-700">${Number(acceptedPct) || 0}%</p></div>
      </div>
      <div class="mt-3 flex items-center justify-end gap-1 text-[11px] font-bold text-emerald-700">ดูรายละเอียด <span aria-hidden="true">›</span></div>
    </button>`;
}

function renderOverviewTable(members) {
    const tbody  = document.getElementById('overview-table-body');
    const pagEl  = document.getElementById('ov-mgmt-pagination');
    const mobileCards = document.getElementById('overview-mobile-cards');
    if (!tbody) return;

    // Sort: TargetPerYear ascending (12 before 24), then SortOrder
    const sorted = [...members].sort((a, b) => (a.Total || 0) - (b.Total || 0));

    // Apply search filter
    const q = _ovMgmtQ.toLowerCase();
    const filtered = q ? sorted.filter(m =>
        (m.Name||'').toLowerCase().includes(q) ||
        (m.Position||'').toLowerCase().includes(q) ||
        (m.Department||'').toLowerCase().includes(q) ||
        (m.EmployeeID||'').toLowerCase().includes(q)
    ) : sorted;

    const totalPages = Math.max(1, Math.ceil(filtered.length / OV_PAGE_SIZE));
    if (_ovMgmtPage > totalPages) _ovMgmtPage = totalPages;
    const start = (_ovMgmtPage - 1) * OV_PAGE_SIZE;
    const page  = filtered.slice(start, start + OV_PAGE_SIZE);

    const ratingOf = pct => {
        if (pct >= 80) return { r: 5, cls: 'bg-emerald-100 text-emerald-700' };
        if (pct >= 75) return { r: 4, cls: 'bg-teal-100 text-teal-700' };
        if (pct >= 70) return { r: 3, cls: 'bg-blue-100 text-blue-700' };
        if (pct >= 65) return { r: 2, cls: 'bg-amber-100 text-amber-700' };
        if (pct >= 60) return { r: 1, cls: 'bg-orange-100 text-orange-700' };
        return { r: 0, cls: 'bg-red-100 text-red-700' };
    };

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 11 : 10}" class="text-center py-14 text-xs text-slate-400">
          <div class="flex flex-col items-center gap-2">
            <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <svg class="w-6 h-6 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <p class="font-medium text-slate-400">${_ovMgmtQ ? 'ไม่พบผลการค้นหา' : 'ยังไม่มีสมาชิกในรายการ'}</p>
            ${!_ovMgmtQ && isAdmin ? '<p class="text-[10px] text-slate-300">กด "เพิ่มสมาชิก" เพื่อเพิ่มพนักงานเข้าตาราง</p>' : ''}
          </div>
        </td></tr>`;
        if (pagEl) pagEl.innerHTML = '';
        if (mobileCards) mobileCards.innerHTML = `<div class="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs font-medium text-slate-400">${_ovMgmtQ ? 'ไม่พบผลการค้นหา' : 'ยังไม่มีสมาชิกในรายการ'}</div>`;
        return;
    }

    tbody.innerHTML = page.map((m, i) => {
        const actualAttended = Number(m.Attended || 0);
        const acceptedCoverage = _patrolOverviewLeave(m, false, 'acceptedCoverageToDate', actualAttended);
        const acceptedPct = _patrolOverviewLeave(m, false, 'acceptedCoverageToDatePct', m.Percent || 0);
        const { r, cls } = ratingOf(acceptedPct);
        const barW = Math.min(acceptedPct, 100);
        const isMe = m.EmployeeID === currentUser.id;
        const rowNum = start + i + 1;
        const yearlyTarget = Number(m.YearlyTarget || m.TargetPerYear || m.yearlyTarget || m.Total || 0);
        const leaveYear = _patrolOverviewLeave(m, false, 'leaveYear');
        const allowedLeave = _patrolOverviewLeave(m, false, 'allowedLeaveYear');
        const overLeave = _patrolOverviewLeave(m, false, 'overLeaveYear');
        const final = _patrolOverviewFinalInfo(m, false);
        return `<tr onclick="window.openPatrolAttendanceDetailModal(${_patrolJsArg(m.EmployeeID)},${_patrolJsArg(m.Name)},'top_management',${yearlyTarget})"
          class="hover:bg-slate-50 transition-colors cursor-pointer ${isMe ? 'bg-emerald-50/40' : ''}"
          title="Open attendance detail">
          <td class="px-4 py-3 text-slate-400 font-mono text-xs">${rowNum}</td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              <div class="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${isMe ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}">
                ${(m.Name||'?').charAt(0)}
              </div>
              <span class="font-semibold text-slate-800 ${isMe ? 'font-bold' : ''}">${m.Name}${isMe ? ' <span class="text-[9px] text-emerald-500">(ฉัน)</span>' : ''}</span>
            </div>
          </td>
          <td class="px-4 py-3 text-xs text-slate-500 max-w-[120px] truncate" title="${m.Position||''}">${m.Position||'—'}</td>
          <td class="px-4 py-3 text-xs text-slate-500 max-w-[100px] truncate" title="${m.Department||''}">${m.Department||'—'}</td>
          <td class="px-4 py-3 text-center font-bold text-slate-700">${m.Total}</td>
          <td class="px-4 py-3 text-center">
            <span class="font-bold ${acceptedCoverage >= m.Total && m.Total > 0 ? 'text-emerald-600' : 'text-slate-700'}">${acceptedCoverage}</span>
            ${acceptedCoverage !== actualAttended ? `<span class="block text-[9px] text-slate-400">actual ${actualAttended}</span>` : ''}
          </td>
          <td class="px-4 py-3 text-center">
            <span class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold ${overLeave > 0 ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-700'}">${leaveYear}/${allowedLeave}</span>
          </td>
          <td class="px-4 py-3 text-center">
            <span class="font-bold ${acceptedCoverage >= _patrolOverviewPassThreshold(m, false) ? 'text-emerald-600' : 'text-slate-600'}">${acceptedCoverage}</span>
            <span class="block text-[9px] text-slate-400">${acceptedPct}%</span>
          </td>
          <td class="px-4 py-3 text-center">
            <div class="flex items-center gap-2 justify-end">
              <div class="w-16 h-1.5 rounded-full overflow-hidden bg-slate-100 flex-shrink-0">
                <div class="h-full rounded-full" style="width:${barW}%;background:${barW>=80?'#10b981':barW>=60?'#f59e0b':'#f43f5e'}"></div>
              </div>
              <span class="inline-flex items-center justify-center w-14 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${cls}">${acceptedPct}%${r>0?' ('+r+')':''}</span>
            </div>
          </td>
          <td class="px-4 py-3 text-center">
            <span class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold ${final.cls}">${final.label}</span>
          </td>
          ${isAdmin ? `<td class="px-4 py-3 text-center">
            <div class="flex items-center justify-center gap-1">
              <button onclick="event.stopPropagation();window.openAdminRecordModal(${_patrolJsArg(m.EmployeeID)},${_patrolJsArg(m.Name)},${yearlyTarget})"
                class="p-1 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="จัดการรายการ">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              </button>
              <button onclick="event.stopPropagation();window.editRosterTarget(${m.RosterID},'top_management',${yearlyTarget},${_patrolJsArg(m.Name)},true)"
                class="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="แก้ไขเป้าหมาย">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
              <button onclick="event.stopPropagation();window.deleteRosterMember(${m.RosterID},'top_management',${_patrolJsArg(m.Name)},true)"
                class="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="ลบออกจากรายการ">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </td>` : ''}
        </tr>`;
    }).join('');

    if (mobileCards) {
        mobileCards.innerHTML = page.map(m => {
            const actualAttended = Number(m.Attended || 0);
            const acceptedCoverage = _patrolOverviewLeave(m, false, 'acceptedCoverageToDate', actualAttended);
            const acceptedPct = _patrolOverviewLeave(m, false, 'acceptedCoverageToDatePct', m.Percent || 0);
            const yearlyTarget = Number(m.YearlyTarget || m.TargetPerYear || m.yearlyTarget || m.Total || 0);
            return patrolOverviewMobileCard(m, 'top_management', yearlyTarget, acceptedCoverage, actualAttended, acceptedPct, _patrolOverviewFinalInfo(m, false), m.EmployeeID === currentUser.id);
        }).join('');
    }

    // Render pagination controls
    if (pagEl) {
        pagEl.innerHTML = totalPages <= 1 ? '' : `
          <span class="text-xs text-slate-500">${start+1}–${Math.min(start+OV_PAGE_SIZE,filtered.length)} จาก ${filtered.length} คน</span>
          <div class="flex items-center gap-1">
            <button onclick="window._ovMgmtGoPage(${_ovMgmtPage-1})"
              class="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors"
              ${_ovMgmtPage <= 1 ? 'disabled' : ''}>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <span class="text-xs font-bold text-slate-600 px-1">${_ovMgmtPage} / ${totalPages}</span>
            <button onclick="window._ovMgmtGoPage(${_ovMgmtPage+1})"
              class="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors"
              ${_ovMgmtPage >= totalPages ? 'disabled' : ''}>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>`;
    }
}

window._ovMgmtGoPage = function(p) {
    _ovMgmtPage = p;
    if (_overviewData) renderOverviewTable(_overviewData.members);
};
window._ovMgmtSearchInput = function(q) {
    _ovMgmtQ = q.trim();
    _ovMgmtPage = 1;
    if (_overviewData) renderOverviewTable(_overviewData.members);
};

function renderOverviewChart(percent) {
    const ctx = document.getElementById('ov-mgmt-pie');
    if (!ctx) return;
    const attended = percent;
    const missed   = Math.max(0, 100 - percent);
    if (window._overviewPieChart) window._overviewPieChart.destroy();
    window._overviewPieChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['เข้าร่วม', 'ขาด'],
            datasets: [{ data: [attended, missed || 0.1], backgroundColor: ['#10b981', '#f1f5f9'], borderWidth: 0, hoverOffset: 4 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '72%',
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, usePointStyle: true, font: { size: 10, family: 'Kanit' } } } },
        },
    });
}

function renderSvPieChart(percent) {
    const ctx = document.getElementById('ov-sv-pie');
    if (!ctx) return;
    const done   = percent;
    const missed = Math.max(0, 100 - percent);
    if (window._svPieChart) window._svPieChart.destroy();
    window._svPieChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['เดินตรวจแล้ว', 'ยังไม่เดิน'],
            datasets: [{ data: [done, missed || 0.1], backgroundColor: ['#f59e0b', '#f1f5f9'], borderWidth: 0, hoverOffset: 4 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '72%',
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, usePointStyle: true, font: { size: 10, family: 'Kanit' } } } },
        },
    });
}

function switchOverviewYear(year) {
    _overviewYear = parseInt(year);
    _overviewData = null;
    loadOverview(_overviewYear);
}

window.filterOverviewTable = function() {
    if (_overviewData) renderOverviewTable(_overviewData.members);
};

// ─── Spotlight Card (Top & Management) ────────────────────────────────────────
function renderSpotlightCard() {
    const wrap = document.getElementById('spotlight-mgmt-wrap');
    if (!wrap) return;

    // ถ้ายังไม่เลือก spotlight
    if (!_spotlightMgmtId) {
        wrap.innerHTML = isAdmin
            ? `<div class="rounded-2xl border-2 border-dashed border-emerald-200 bg-white/60 px-6 py-5 flex items-center gap-4" data-patrol-card-image="patrol-management-spotlight-empty">
                <div class="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <svg class="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
                </div>
                <div class="flex-1">
                  <p class="text-sm font-bold text-slate-600">ยังไม่ได้เลือก Spotlight</p>
                  <p class="text-xs text-slate-400 mt-0.5">เลือกสมาชิก Top & Management เพื่อแสดง progress โดดเด่นที่นี่</p>
                </div>
                <button onclick="window.openSpotlightPickerModal()" data-patrol-card-ignore
                  class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white flex-shrink-0 transition-all"
                  style="background:linear-gradient(135deg,#059669,#0d9488)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
                  เลือกบุคคล
                </button>
              </div>`
            : '';
        return;
    }

    const members = _overviewData?.members || [];
    const m = members.find(x => x.EmployeeID === _spotlightMgmtId);
    if (!m) {
        wrap.innerHTML = '';
        return;
    }

    const pct       = m.Percent || 0;
    const barPct    = Math.min(pct, 100);
    const barColor  = pct >= 75 ? '#6ee7b7' : pct >= 60 ? '#fcd34d' : '#fca5a5';
    const initial   = (m.Name || '?').charAt(0);
    const statusCls = pct >= 80 ? 'bg-emerald-400/20 text-emerald-200' : pct >= 60 ? 'bg-amber-400/20 text-amber-200' : 'bg-red-400/20 text-red-200';
    const statusLbl = pct >= 80 ? 'On Track' : pct >= 60 ? 'At Risk' : 'Behind';
    const dotCls    = pct >= 80 ? 'bg-emerald-400 animate-pulse' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400';

    const empIdSafe = (m.EmployeeID || '').replace(/'/g, "\\'");
    const nameSafe  = (m.Name       || '').replace(/'/g, "\\'");

    // Full-width horizontal hero banner
    wrap.innerHTML = `
      <div class="relative overflow-hidden rounded-2xl" data-patrol-card-image="patrol-management-spotlight" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
        <!-- dot pattern -->
        <div class="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%"><defs><pattern id="sp-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1.2" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#sp-dots)"/></svg>
        </div>
        <div class="relative z-10 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <!-- Left: label + avatar + info -->
          <div class="flex items-center gap-4 flex-1 min-w-0">
            <div class="flex-shrink-0">
              <p class="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
                Spotlight ${_overviewYear}
              </p>
              <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl"
                   style="background:rgba(255,255,255,0.15);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.2)">${initial}</div>
            </div>
            <div class="min-w-0">
              <p class="text-lg font-bold text-white truncate">${m.Name}</p>
              <p class="text-xs text-white/60 truncate mt-0.5">${m.Position || '—'} · ${m.Department || '—'}</p>
              <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold mt-1.5 ${statusCls}">
                <span class="w-1.5 h-1.5 rounded-full inline-block ${dotCls}"></span>${statusLbl}
              </span>
            </div>
          </div>
          <!-- Center: progress -->
          <div class="w-full sm:w-64 flex-shrink-0">
            <div class="flex justify-between items-end mb-1.5">
              <span class="text-xs text-white/60">${m.Attended} / ${m.Total} ครั้ง</span>
              <span class="text-2xl font-bold text-white">${pct}%</span>
            </div>
            <div class="h-2.5 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.15)">
              <div class="h-full rounded-full transition-all duration-700" style="width:${barPct}%;background:${barColor}"></div>
            </div>
            <p class="text-[10px] text-white/40 mt-1">เป้าหมาย ${m.Total} ครั้ง / ปี</p>
          </div>
          <!-- Right: buttons -->
          <div class="flex sm:flex-col gap-2 flex-shrink-0 w-full sm:w-auto" data-patrol-card-ignore>
            <button onclick="window.openSpotlightRecordsModal('${empIdSafe}','${nameSafe}',${_overviewYear})"
              class="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style="background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.25)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              ดูรายการ
            </button>
            ${isAdmin ? `<button onclick="window.openSpotlightPickerModal()"
              class="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.12)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
              เปลี่ยน
            </button>` : ''}
          </div>
        </div>
      </div>`;
}

async function openSpotlightPickerModal() {
    const members = _overviewData?.members || [];
    if (!members.length) { showToast('ยังไม่มีสมาชิกในรายการ Top & Management', 'warning'); return; }

    const opts = members.map(m => `
      <label class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:border-emerald-300 ${m.EmployeeID === _spotlightMgmtId ? 'border-emerald-400 bg-emerald-50' : 'border-slate-100'}">
        <input type="radio" name="spotlight-pick" value="${m.EmployeeID}" class="accent-emerald-500" ${m.EmployeeID === _spotlightMgmtId ? 'checked' : ''}>
        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
             style="background:linear-gradient(135deg,#059669,#0d9488)">${(m.Name||'?').charAt(0)}</div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-slate-800 text-sm truncate">${m.Name}</p>
          <p class="text-xs text-slate-400 truncate">${m.Position||'—'} · ${m.Department||'—'}</p>
        </div>
        <span class="text-xs font-bold ${m.Percent>=75?'text-emerald-600':m.Percent>=60?'text-amber-500':'text-red-500'}">${m.Percent}%</span>
      </label>`).join('');

    openModal('เลือกบุคคลสำหรับ Spotlight', `
      <div class="space-y-3">
        <p class="text-xs text-slate-500">เลือก 1 คนจากสมาชิก Top & Management เพื่อแสดงสรุปด้านบน</p>
        <div class="space-y-2 max-h-72 overflow-y-auto pr-1">${opts}</div>
        <div class="flex gap-2 pt-2 border-t border-slate-100">
          <button onclick="window.closeModal&&window.closeModal()"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            ยกเลิก
          </button>
          <button onclick="window._confirmSpotlightPick()"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
            style="background:linear-gradient(135deg,#059669,#0d9488)">
            บันทึก
          </button>
        </div>
      </div>`, 'max-w-sm');
}

window._confirmSpotlightPick = async function() {
    const picked = document.querySelector('input[name="spotlight-pick"]:checked')?.value;
    if (!picked) { showToast('กรุณาเลือกบุคคล', 'warning'); return; }
    try {
        await API.put('/settings/patrol_spotlight_mgmt_id', { value: picked });
        _spotlightMgmtId = picked;
        closeModal();
        renderSpotlightCard();
        showToast('บันทึกการตั้งค่า Spotlight สำเร็จ', 'success');
    } catch (err) {
        showToast(err.message || 'บันทึกไม่สำเร็จ', 'error');
    }
};

async function openSpotlightRecordsModal(employeeId, name, year) {
    openModal(`รายการเดินตรวจ — ${name}`, `
      <div class="flex flex-col items-center justify-center py-8 text-slate-400">
        <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent mb-3"></div>
        <span class="text-xs">กำลังโหลด...</span>
      </div>`, 'max-w-lg');

    try {
        const res = await API.get(`/patrol/member-attendance?employeeId=${encodeURIComponent(employeeId)}&year=${year}`);
        const records = res.data || [];

        const listHtml = records.length
            ? records.map((r, i) => {
                const d = new Date(r.PatrolDate);
                const dateStr = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
                return `<div class="flex items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-slate-50' : ''}">
                  <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50 flex-shrink-0 text-xs font-bold text-emerald-600">${i+1}</div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-slate-800">${dateStr}</p>
                    ${r.Area ? `<p class="text-xs text-slate-400 truncate">${r.Area}</p>` : ''}
                    ${r.Notes ? `<p class="text-xs text-slate-400 truncate">${r.Notes}</p>` : ''}
                  </div>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">เข้าร่วม</span>
                </div>`;
              }).join('')
            : `<div class="text-center py-10 text-slate-400">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <svg class="w-6 h-6 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"/></svg>
                </div>
                <p class="text-xs font-medium">ยังไม่มีรายการเดินตรวจในปี ${year}</p>
              </div>`;

        // Find member data for header
        const members = _overviewData?.members || [];
        const m = members.find(x => x.EmployeeID === employeeId);
        const pct = m?.Percent || 0;
        const barColor = pct >= 75 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#f43f5e';

        const headerHtml = m ? `
          <div class="flex items-center gap-3 p-3 rounded-xl mb-4" style="background:linear-gradient(135deg,#f0fdf4,#ecfdf5)">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0"
                 style="background:linear-gradient(135deg,#059669,#0d9488)">${(m.Name||'?').charAt(0)}</div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-slate-500">${m.Position||'—'} · ${m.Department||'—'}</p>
              <div class="flex items-center gap-2 mt-1">
                <div class="flex-1 h-1.5 rounded-full bg-white/70 overflow-hidden">
                  <div class="h-full rounded-full" style="width:${Math.min(pct,100)}%;background:${barColor}"></div>
                </div>
                <span class="text-xs font-bold" style="color:${barColor}">${m.Attended}/${m.Total} ครั้ง (${pct}%)</span>
              </div>
            </div>
          </div>` : '';

        const modalBody = document.getElementById('modal-body');
        if (modalBody) {
            modalBody.innerHTML = `
              <div>
                ${headerHtml}
                <p class="text-xs font-bold text-slate-500 uppercase mb-2">รายการทั้งหมด ปี ${year} (${records.length} ครั้ง)</p>
                <div class="max-h-72 overflow-y-auto pr-1">${listHtml}</div>
                <div class="pt-3 border-t border-slate-100 mt-3">
                  <button onclick="window.closeModal&&window.closeModal()"
                    class="w-full px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
                    ปิด
                  </button>
                </div>
              </div>`;
        }
    } catch (err) {
        showToast(err.message || 'โหลดข้อมูลไม่สำเร็จ', 'error');
        closeModal();
    }
}

// ─── Supervisor Overview ───────────────────────────────────────────────────────
async function loadSupervisorOverview(year) {
    year = year || new Date().getFullYear();
    _svOverviewYear = year;
    const tbody = document.getElementById('sv-overview-body');
    const subEl = document.getElementById('sv-overview-subtitle');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${isAdmin ? 11 : 10}" class="text-center py-8 text-slate-300 text-xs">
      <div class="inline-flex flex-col items-center gap-2">
        <div class="animate-spin rounded-full h-6 w-6 border-3 border-amber-400 border-t-transparent"></div>
        <span>กำลังโหลด...</span>
      </div>
    </td></tr>`;
    try {
        const res = await API.get(`/patrol/supervisor-overview?year=${year}`);
        const members = res.data || [];

        if (subEl) subEl.textContent = `ปี ${year}`;
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        if (!members.length) {
            tbody.innerHTML = `<tr><td colspan="${isAdmin ? 11 : 10}" class="text-center py-12 text-xs text-slate-400">
              <div class="flex flex-col items-center gap-2">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <svg class="w-6 h-6 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </div>
                <p class="font-medium text-slate-400">ยังไม่มีสมาชิกในรายการ</p>
                ${isAdmin ? '<p class="text-[10px] text-slate-300">กด "เพิ่มสมาชิก" เพื่อเพิ่มหัวหน้าส่วน/แผนกเข้าตาราง</p>' : ''}
              </div>
            </td></tr>`;
            setEl('sv-card-total', '0'); setEl('sv-card-done', '0'); setEl('sv-card-pct', '0%'); setEl('ov-sv-pie-pct', '0%');
            return;
        }

        const totalMembers = members.length;
        const doneCount    = members.filter(m => _patrolOverviewLeave(m, true, 'acceptedCoverageToDate', m.attended || 0) >= m.target).length;
        const totalAtt     = members.reduce((s, m) => s + _patrolOverviewLeave(m, true, 'acceptedCoverageToDate', m.attended || 0), 0);
        const totalTgt     = members.reduce((s, m) => s + m.target,   0);
        const svPct        = totalTgt > 0 ? Math.round(totalAtt / totalTgt * 100) : 0;

        setEl('sv-card-total',    totalMembers);
        setEl('sv-card-done',     doneCount);
        setEl('sv-card-pct',      `${svPct}%`);
        setEl('ov-sv-pie-pct',    `${svPct}%`);
        setEl('sv-card-subtitle', `ปี ${year}`);
        renderSvPieChart(svPct);

        _svAllMembers = members;
        _svPage = 1;
        _svQ    = '';
        const searchEl = document.getElementById('sv-search-input');
        if (searchEl) searchEl.value = '';
        renderSvTable();
        renderSvStatusBreakdown(members);
    } catch {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 11 : 10}" class="text-center py-6 text-xs text-slate-400">โหลดไม่ได้</td></tr>`;
    }
}

function renderSvTable() {
    const tbody = document.getElementById('sv-overview-body');
    const pagEl = document.getElementById('sv-pagination');
    const mobileCards = document.getElementById('sv-overview-mobile-cards');
    if (!tbody) return;

    const q = _svQ.toLowerCase();
    const filtered = q ? _svAllMembers.filter(m =>
        (m.EmployeeName||'').toLowerCase().includes(q) ||
        (m.Position||'').toLowerCase().includes(q) ||
        (m.Department||'').toLowerCase().includes(q) ||
        (m.EmployeeID||'').toLowerCase().includes(q)
    ) : _svAllMembers;

    const totalPages = Math.max(1, Math.ceil(filtered.length / OV_PAGE_SIZE));
    if (_svPage > totalPages) _svPage = totalPages;
    const start = (_svPage - 1) * OV_PAGE_SIZE;
    const page  = filtered.slice(start, start + OV_PAGE_SIZE);

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 11 : 10}" class="text-center py-12 text-xs text-slate-400">
          <div class="flex flex-col items-center gap-2">
            <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <svg class="w-6 h-6 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <p class="font-medium text-slate-400">${_svQ ? 'ไม่พบผลการค้นหา' : 'ยังไม่มีสมาชิกในรายการ'}</p>
            ${!_svQ && isAdmin ? '<p class="text-[10px] text-slate-300">กด "เพิ่มสมาชิก" เพื่อเพิ่มหัวหน้าส่วน/แผนกเข้าตาราง</p>' : ''}
          </div>
        </td></tr>`;
        if (pagEl) pagEl.innerHTML = '';
        if (mobileCards) mobileCards.innerHTML = `<div class="rounded-xl border border-dashed border-amber-200 bg-white px-4 py-8 text-center text-xs font-medium text-slate-400">${_svQ ? 'ไม่พบผลการค้นหา' : 'ยังไม่มีสมาชิกในรายการ'}</div>`;
        return;
    }

    tbody.innerHTML = page.map((m, i) => {
        const final = _patrolOverviewFinalInfo(m, true);
        const done = final.label === 'Pass' || final.label === 'Accepted';
        const actualAttended = Number(m.attended || 0);
        const acceptedCoverage = _patrolOverviewLeave(m, true, 'acceptedCoverageToDate', actualAttended);
        const acceptedPct = _patrolOverviewLeave(m, true, 'acceptedCoverageToDatePct', m.percent || 0);
        const half = acceptedCoverage > 0 && acceptedCoverage < m.target;
        const statusCls = final.cls;
        const statusLbl = final.label;
        const isMe = m.EmployeeID === currentUser.id;
        const rowNum = start + i + 1;
        const yearlyTarget = Number(m.yearlyTarget || m.YearlyTarget || m.TargetPerYear || m.target || 0);
        const leaveYear = _patrolOverviewLeave(m, true, 'leaveYear');
        const allowedLeave = _patrolOverviewLeave(m, true, 'allowedLeaveYear');
        const overLeave = _patrolOverviewLeave(m, true, 'overLeaveYear');
        return `<tr onclick="window.openPatrolAttendanceDetailModal(${_patrolJsArg(m.EmployeeID)},${_patrolJsArg(m.EmployeeName)},'supervisor',${yearlyTarget})"
              class="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${isMe ? 'bg-amber-50/30' : ''}"
              title="Open attendance detail">
              <td class="px-4 py-3 text-slate-400 text-[10px] font-mono">${rowNum}</td>
              <td class="px-4 py-3 font-semibold text-slate-700">${m.EmployeeName}${isMe ? ' <span class="text-[9px] text-amber-500">(ฉัน)</span>' : ''}</td>
              <td class="px-4 py-3 text-xs text-slate-500 max-w-[120px] truncate" title="${m.Position||''}">${m.Position||'—'}</td>
              <td class="px-4 py-3 text-xs text-slate-500 max-w-[100px] truncate" title="${m.Department||''}">${m.Department||'—'}</td>
              <td class="px-4 py-3 text-center font-bold text-slate-600">${yearlyTarget || m.target || 0}</td>
              <td class="px-4 py-3 text-center font-bold ${done ? 'text-emerald-600' : half ? 'text-amber-600' : 'text-slate-400'}">
                ${acceptedCoverage}
                ${acceptedCoverage !== actualAttended ? `<span class="block text-[9px] text-slate-400">actual ${actualAttended}</span>` : ''}
              </td>
              <td class="px-4 py-3 text-center">
                <span class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold ${overLeave > 0 ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-700'}">${leaveYear}/${allowedLeave}</span>
              </td>
              <td class="px-4 py-3 text-center">
                <span class="font-bold ${acceptedCoverage >= _patrolOverviewPassThreshold(m, true) ? 'text-emerald-600' : 'text-slate-600'}">${acceptedCoverage}</span>
                <span class="block text-[9px] text-slate-400">${acceptedPct}%</span>
              </td>
              <td class="px-4 py-3 text-center">
                <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div class="h-full rounded-full" style="width:${acceptedPct}%;background:${done?'#10b981':half?'#f59e0b':'#fca5a5'}"></div>
                </div>
                <span class="text-[10px] text-slate-500">${acceptedPct}%</span>
              </td>
              <td class="px-4 py-3 text-center">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusCls}">
                  <span class="w-1.5 h-1.5 rounded-full inline-block ${done?'bg-emerald-400 animate-pulse':half?'bg-amber-400':'bg-red-300'}"></span>
                  ${statusLbl}
                </span>
              </td>
              ${isAdmin ? `<td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-1">
                  <button onclick="event.stopPropagation();window.openAdminRecordSvModal(${_patrolJsArg(m.EmployeeID)},${_patrolJsArg(m.EmployeeName)},${yearlyTarget})"
                    class="p-1 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors" title="จัดการรายการ">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                  </button>
                  <button onclick="event.stopPropagation();window.editRosterTarget(${m.RosterID},'supervisor',${yearlyTarget},${_patrolJsArg(m.EmployeeName)},false)"
                    class="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="แก้ไขเป้าหมาย">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button onclick="event.stopPropagation();window.deleteRosterMember(${m.RosterID},'supervisor',${_patrolJsArg(m.EmployeeName)},false)"
                    class="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="ลบออกจากรายการ">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </td>` : ''}
            </tr>`;
    }).join('');

    if (mobileCards) {
        mobileCards.innerHTML = page.map(m => {
            const actualAttended = Number(m.attended || 0);
            const acceptedCoverage = _patrolOverviewLeave(m, true, 'acceptedCoverageToDate', actualAttended);
            const acceptedPct = _patrolOverviewLeave(m, true, 'acceptedCoverageToDatePct', m.percent || 0);
            const yearlyTarget = Number(m.yearlyTarget || m.YearlyTarget || m.TargetPerYear || m.target || 0);
            return patrolOverviewMobileCard(m, 'supervisor', yearlyTarget, acceptedCoverage, actualAttended, acceptedPct, _patrolOverviewFinalInfo(m, true), m.EmployeeID === currentUser.id);
        }).join('');
    }

    if (pagEl) {
        pagEl.innerHTML = totalPages <= 1 ? '' : `
          <span class="text-xs text-slate-500">${start+1}–${Math.min(start+OV_PAGE_SIZE,filtered.length)} จาก ${filtered.length} คน</span>
          <div class="flex items-center gap-1">
            <button onclick="window._svGoPage(${_svPage-1})"
              class="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors"
              ${_svPage <= 1 ? 'disabled' : ''}>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <span class="text-xs font-bold text-slate-600 px-1">${_svPage} / ${totalPages}</span>
            <button onclick="window._svGoPage(${_svPage+1})"
              class="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors"
              ${_svPage >= totalPages ? 'disabled' : ''}>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>`;
    }
}

window._svGoPage = function(p) {
    _svPage = p;
    renderSvTable();
};
window._svSearchInput = function(q) {
    _svQ = q.trim();
    _svPage = 1;
    renderSvTable();
};

function renderSvStatusBreakdown(members) {
    const el = document.getElementById('sv-status-breakdown');
    if (!el) return;
    if (!members || !members.length) { el.innerHTML = ''; return; }

    const coverageOf = m => _patrolOverviewLeave(m, true, 'acceptedCoverageToDate', m.attended || 0);
    const pctOf = m => _patrolOverviewLeave(m, true, 'acceptedCoverageToDatePct', m.percent || 0);
    const done = members.filter(m => coverageOf(m) >= m.target).length;
    const half = members.filter(m => coverageOf(m) > 0 && coverageOf(m) < m.target).length;
    const none = members.filter(m => coverageOf(m) === 0).length;

    // Top performer (most attended, meeting or closest to target)
    const top = [...members].sort((a, b) => pctOf(b) - pctOf(a) || coverageOf(b) - coverageOf(a))[0];
    const topPct = pctOf(top);
    const topBarColor = topPct >= 75 ? '#10b981' : topPct >= 60 ? '#f59e0b' : '#f43f5e';
    const topInitial  = (top.EmployeeName || '?').charAt(0);

    el.innerHTML = `
      <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3" data-patrol-card-image="patrol-supervisor-status-breakdown">
        <p class="text-[10px] font-bold text-slate-400 uppercase">สถานะรวม</p>
        <!-- Status bars -->
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"></span>
            <span class="text-xs text-slate-600 flex-1">ครบแล้ว</span>
            <span class="text-xs font-bold text-emerald-700">${done} คน</span>
          </div>
          <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full bg-emerald-400" style="width:${members.length ? Math.round(done/members.length*100) : 0}%"></div>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"></span>
            <span class="text-xs text-slate-600 flex-1">บางส่วน</span>
            <span class="text-xs font-bold text-amber-600">${half} คน</span>
          </div>
          <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full bg-amber-400" style="width:${members.length ? Math.round(half/members.length*100) : 0}%"></div>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-red-300 flex-shrink-0"></span>
            <span class="text-xs text-slate-600 flex-1">ยังไม่เดิน</span>
            <span class="text-xs font-bold text-red-400">${none} คน</span>
          </div>
          <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full bg-red-300" style="width:${members.length ? Math.round(none/members.length*100) : 0}%"></div>
          </div>
        </div>
        <!-- Top performer -->
        <div class="pt-2 border-t border-slate-100">
          <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">อันดับ 1</p>
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                 style="background:linear-gradient(135deg,#d97706,#f59e0b)">${topInitial}</div>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-bold text-slate-700 truncate">${top.EmployeeName}</p>
              <div class="flex items-center gap-1 mt-0.5">
                <div class="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full" style="width:${Math.min(topPct,100)}%;background:${topBarColor}"></div>
                </div>
                <span class="text-[10px] font-bold flex-shrink-0" style="color:${topBarColor}">${topPct}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;
}

// ─── Patrol Roster Management (Admin) ─────────────────────────────────────────

// Position → suggested default target
function _rosterDefaultTarget(position, isMgmt) {
    if (!isMgmt) return 24; // supervisor always 24/year
    const pos = (position || '').toLowerCase();
    if (pos.includes('ผู้จัดการทั่วไป') || pos.includes('ผู้ช่วยผู้จัดการทั่วไป') || pos.includes('ผู้อำนวยการ')) return 12;
    return 24; // ผู้ชำนาญการพิเศษ, ผู้จัดการ
}

// Cache for employee master list
let _empMasterCache = null;
async function _getEmpMaster() {
    if (_empMasterCache) return _empMasterCache;
    try {
        const res = await API.get('/employees');
        _empMasterCache = (res.data || []).sort((a, b) => (a.EmployeeName||'').localeCompare(b.EmployeeName||'', 'th'));
        return _empMasterCache;
    } catch { return []; }
}

// Open modal to add employee to roster (multi-select)
window.openRosterAddModal = async function(group) {
    if (!isAdmin) return;
    const isMgmt = group === 'top_management';
    const groupLabel = isMgmt ? 'Top & Management' : 'Sec. & Supervisor';
    const accentColor = isMgmt ? '#059669' : '#d97706';
    const accentColor2 = isMgmt ? '#0d9488' : '#f59e0b';

    openModal(`เพิ่มสมาชิก — ${groupLabel}`, `
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">ค้นหาพนักงาน</label>
          <input type="text" id="roster-search-input" placeholder="พิมพ์ชื่อ, รหัส, ตำแหน่ง หรือแผนก..."
            class="form-input w-full rounded-xl text-sm border border-slate-200 px-3 py-2 focus:outline-none focus:border-emerald-400"
            oninput="window._filterRosterSearch()">
        </div>
        <div id="roster-emp-list" class="max-h-52 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50 bg-slate-50">
          <div class="text-center py-6 text-xs text-slate-400">
            <div class="animate-spin rounded-full h-5 w-5 border-2 border-emerald-500 border-t-transparent mx-auto mb-2"></div>
            กำลังโหลดรายชื่อพนักงาน...
          </div>
        </div>
        <div id="roster-selected-chips" class="hidden">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-bold text-slate-500 uppercase">เลือกแล้ว</span>
            <span id="roster-selected-count" class="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">0 คน</span>
          </div>
          <div id="roster-chips-wrap" class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto"></div>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เป้าหมายการเดินตรวจ (ครั้ง/ปี) — ใช้กับทุกคนที่เลือก</label>
          <input type="number" id="roster-target-input" min="1" max="365" value="${isMgmt ? 12 : 24}"
            class="form-input w-full rounded-xl text-sm border border-slate-200 px-3 py-2 focus:outline-none focus:border-emerald-400">
          <p class="text-[10px] text-slate-400 mt-1">
            ${isMgmt ? 'ผู้จัดการทั่วไป/ผอ. = 12 ครั้ง • ผู้ชำนาญการพิเศษ/ผจก. = 24 ครั้ง' : 'หัวหน้าส่วน/แผนก = 24 ครั้ง (2 ครั้ง/เดือน)'}
          </p>
        </div>
        <input type="hidden" id="roster-group-input" value="${group}">
        <div class="flex gap-2 pt-1">
          <button onclick="window.closeModal&&window.closeModal()"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            ยกเลิก
          </button>
          <button id="roster-confirm-btn" onclick="window.confirmRosterAdd()"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
            style="background:linear-gradient(135deg,${accentColor},${accentColor2})">
            เพิ่มสมาชิก
          </button>
        </div>
      </div>
    `, 'max-w-md');

    // Load employees AND both rosters — filter out anyone already in either group
    const otherGroup = group === 'top_management' ? 'supervisor' : 'top_management';
    const [emps, rosterRes, otherRosterRes] = await Promise.all([
        _getEmpMaster(),
        API.get(`/patrol/roster?group=${group}`).catch(() => ({ data: [] })),
        API.get(`/patrol/roster?group=${otherGroup}`).catch(() => ({ data: [] }))
    ]);
    const existingIds = new Set([
        ...(rosterRes.data || []).map(m => m.EmployeeID),
        ...(otherRosterRes.data || []).map(m => m.EmployeeID)
    ]);
    window._rosterEmpList = emps.filter(e => !existingIds.has(e.EmployeeID));
    window._rosterSelectedSet = new Map(); // EmployeeID → employee object
    window._filterRosterSearch();
};

window._filterRosterSearch = function() {
    const q = (document.getElementById('roster-search-input')?.value || '').toLowerCase();
    const emps = window._rosterEmpList || [];
    const filtered = q ? emps.filter(e =>
        (e.EmployeeName||'').toLowerCase().includes(q) ||
        (e.EmployeeID||'').toLowerCase().includes(q) ||
        (e.Position||'').toLowerCase().includes(q) ||
        (e.Department||'').toLowerCase().includes(q)
    ) : emps;

    const listEl = document.getElementById('roster-emp-list');
    if (!listEl) return;
    if (!filtered.length) {
        listEl.innerHTML = `<div class="text-center py-6 text-xs text-slate-400">ไม่พบพนักงาน</div>`;
        return;
    }
    const selected = window._rosterSelectedSet || new Map();
    listEl.innerHTML = filtered.slice(0, 80).map(e => {
        const isSelected = selected.has(e.EmployeeID);
        return `
        <button onclick="window._toggleRosterEmp('${e.EmployeeID}','${(e.EmployeeName||'').replace(/'/g,"\\'")}','${(e.Position||'').replace(/'/g,"\\'")}','${(e.Department||'').replace(/'/g,"\\'")}')"
          id="roster-row-${e.EmployeeID}"
          class="w-full text-left px-3 py-2.5 transition-colors flex items-center gap-3 group ${isSelected ? 'bg-emerald-50' : 'hover:bg-white'}">
          <div class="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'}">
            ${isSelected ? `<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>` : ''}
          </div>
          <div class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}">
            ${(e.EmployeeName||'?').charAt(0)}
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold ${isSelected ? 'text-emerald-700' : 'text-slate-700'} truncate">${e.EmployeeName}</p>
            <p class="text-[10px] text-slate-400 truncate">${e.Position||'—'} · ${e.Department||'—'} · ${e.EmployeeID}</p>
          </div>
        </button>`;
    }).join('');
};

window._toggleRosterEmp = function(id, name, position, dept) {
    const sel = window._rosterSelectedSet || new Map();
    if (sel.has(id)) {
        sel.delete(id);
    } else {
        sel.set(id, { id, name, position, dept });
        // Auto-suggest target when first employee is selected
        if (sel.size === 1) {
            const isMgmt = (document.getElementById('roster-group-input')?.value) === 'top_management';
            const suggested = _rosterDefaultTarget(position, isMgmt);
            const targetEl = document.getElementById('roster-target-input');
            if (targetEl) targetEl.value = suggested;
        }
    }
    window._rosterSelectedSet = sel;

    // Update checkbox row in list (without full re-render)
    const rowEl = document.getElementById(`roster-row-${id}`);
    if (rowEl) {
        const isNowSelected = sel.has(id);
        rowEl.className = `w-full text-left px-3 py-2.5 transition-colors flex items-center gap-3 group ${isNowSelected ? 'bg-emerald-50' : 'hover:bg-white'}`;
        const checkBox = rowEl.querySelector('div:first-child');
        if (checkBox) {
            checkBox.className = `w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${isNowSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'}`;
            checkBox.innerHTML = isNowSelected ? `<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>` : '';
        }
        const avatar = rowEl.querySelector('div:nth-child(2)');
        if (avatar) avatar.className = `w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isNowSelected ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`;
        const nameEl = rowEl.querySelector('p:first-child');
        if (nameEl) nameEl.className = `text-xs font-semibold ${isNowSelected ? 'text-emerald-700' : 'text-slate-700'} truncate`;
    }

    // Update chips area
    const chipsWrap = document.getElementById('roster-chips-wrap');
    const chipsBox  = document.getElementById('roster-selected-chips');
    const countEl   = document.getElementById('roster-selected-count');
    const btnEl     = document.getElementById('roster-confirm-btn');
    if (chipsWrap) {
        chipsWrap.innerHTML = [...sel.values()].map(e => `
          <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
            ${e.name}
            <button type="button" onclick="window._toggleRosterEmp('${e.id}','${e.name.replace(/'/g,"\\'")}','${(e.position||'').replace(/'/g,"\\'")}','${(e.dept||'').replace(/'/g,"\\'")}')"
              class="ml-0.5 hover:text-red-500 transition-colors">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </span>`).join('');
    }
    if (chipsBox)  chipsBox.classList.toggle('hidden', sel.size === 0);
    if (countEl)   countEl.textContent = `${sel.size} คน`;
    if (btnEl)     btnEl.textContent = sel.size > 0 ? `เพิ่ม ${sel.size} คน` : 'เพิ่มสมาชิก';
};

window.confirmRosterAdd = async function() {
    const sel    = window._rosterSelectedSet || new Map();
    const group  = document.getElementById('roster-group-input')?.value;
    const target = parseInt(document.getElementById('roster-target-input')?.value || '12');
    if (sel.size === 0) { showToast('กรุณาเลือกพนักงานอย่างน้อย 1 คน', 'warning'); return; }
    if (!target || target < 1) { showToast('กรุณาระบุเป้าหมายที่ถูกต้อง', 'warning'); return; }

    const btn = document.getElementById('roster-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังเพิ่ม...'; }

    let added = 0, failed = 0;
    for (const emp of sel.values()) {
        try {
            await API.post('/patrol/roster', { EmployeeID: emp.id, RosterGroup: group, TargetPerYear: target });
            added++;
        } catch { failed++; }
    }

    closeModal();
    if (added > 0) showToast(`เพิ่มสมาชิกสำเร็จ ${added} คน${failed > 0 ? ` (ล้มเหลว ${failed} คน)` : ''}`, failed > 0 ? 'warning' : 'success');
    else showToast('เพิ่มไม่สำเร็จ', 'error');

    if (group === 'top_management') {
        _overviewData = null;
        loadOverview(_overviewYear);
    } else {
        const yr = document.getElementById('sv-year-select')?.value || new Date().getFullYear();
        loadSupervisorOverview(parseInt(yr));
    }
};

window.editRosterTarget = function(rosterId, group, currentTarget, name, isMgmt) {
    openModal(`แก้ไขเป้าหมาย — ${name}`, `
      <div class="space-y-4">
        <p class="text-xs text-slate-500">ปรับจำนวนครั้งการเดินตรวจต่อปีสำหรับ <strong class="text-slate-700">${name}</strong></p>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เป้าหมาย (ครั้ง/ปี)</label>
          <input type="number" id="edit-target-input" min="1" max="365" value="${currentTarget}"
            class="form-input w-full rounded-xl text-sm border border-slate-200 px-3 py-2 focus:outline-none focus:border-emerald-400">
          <p class="text-[10px] text-slate-400 mt-1">
            ${isMgmt ? 'ผู้จัดการทั่วไป/ผอ. = 12 ครั้ง • ผู้ชำนาญการพิเศษ/ผจก. = 24 ครั้ง' : 'หัวหน้าส่วน/แผนก = 24 ครั้ง/ปี'}
          </p>
        </div>
        <div class="flex gap-2 pt-2">
          <button onclick="window.closeModal&&window.closeModal()"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            ยกเลิก
          </button>
          <button onclick="window._confirmEditTarget(${rosterId},'${group}')"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
            style="background:linear-gradient(135deg,#059669,#0d9488)">
            บันทึก
          </button>
        </div>
      </div>
    `, 'max-w-xs');
};

window._confirmEditTarget = async function(rosterId, group) {
    const target = parseInt(document.getElementById('edit-target-input')?.value || '0');
    if (!target || target < 1) { showToast('กรุณาระบุเป้าหมายที่ถูกต้อง', 'warning'); return; }
    try {
        await API.put(`/patrol/roster/${rosterId}`, { TargetPerYear: target });
        showToast('อัปเดตเป้าหมายสำเร็จ', 'success');
        closeModal();
        if (group === 'top_management') { _overviewData = null; loadOverview(_overviewYear); }
        else { const yr = document.getElementById('sv-year-select')?.value || new Date().getFullYear(); loadSupervisorOverview(parseInt(yr)); }
    } catch (err) {
        showToast(err.message || 'บันทึกไม่สำเร็จ', 'error');
    }
};

window.deleteRosterMember = function(rosterId, group, name) {
    openModal('ยืนยันการลบ', `
      <div class="space-y-4">
        <div class="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
          <svg class="w-8 h-8 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <div>
            <p class="text-sm font-bold text-red-700">ลบ <span>${name}</span> ออกจากตาราง?</p>
            <p class="text-xs text-red-500 mt-0.5">ข้อมูลการเดินตรวจที่บันทึกไว้จะยังคงอยู่ เพียงแต่ไม่แสดงในตารางภาพรวม</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="window.closeModal&&window.closeModal()"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            ยกเลิก
          </button>
          <button onclick="window._confirmDeleteRoster(${rosterId},'${group}')"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors">
            ลบออก
          </button>
        </div>
      </div>
    `, 'max-w-sm');
};

window._confirmDeleteRoster = async function(rosterId, group) {
    try {
        await API.delete(`/patrol/roster/${rosterId}`);
        showToast('ลบสมาชิกออกจากรายการสำเร็จ', 'success');
        closeModal();
        if (group === 'top_management') { _overviewData = null; loadOverview(_overviewYear); }
        else { const yr = document.getElementById('sv-year-select')?.value || new Date().getFullYear(); loadSupervisorOverview(parseInt(yr)); }
    } catch (err) {
        showToast(err.message || 'ลบไม่สำเร็จ', 'error');
    }
};

// ─── Self-Patrol Modal / Delete ───────────────────────────────────────────────
window._scOnScheduleChange = function() {
    const select = document.getElementById('sc-session');
    const opt = select?.selectedOptions?.[0];
    const dateInput = document.getElementById('sc-date');
    const type = document.querySelector('input[name="sc-type"]:checked')?.value || 'normal';
    if (dateInput && opt?.dataset?.date) dateInput.value = type === 'compensation' ? patrolDateOnly(new Date()) : opt.dataset.date;
    const area = opt?.dataset?.area || '';
    const areaValue = document.getElementById('sc-area-value');
    const areaText = document.getElementById('sc-area-text');
    if (areaValue) areaValue.value = area;
    if (areaText) areaText.textContent = area || 'ไม่ระบุพื้นที่';
    const hint = document.getElementById('sc-mode-hint');
    if (hint && opt?.dataset?.date) {
        hint.textContent = type === 'compensation'
            ? `เดินซ่อมรอบวันที่ ${opt.dataset.date} โดยบันทึกวันที่เดินจริงเป็นวันนี้`
            : `บันทึกตามรอบวันที่ ${opt.dataset.date}`;
    }
};

window._scOnTypeChange = function() {
    const select = document.getElementById('sc-session');
    if (select && !patrolIsFlexibleSelfPatrol()) {
        const type = document.querySelector('input[name="sc-type"]:checked')?.value || 'normal';
        const currentId = '';
        const items = patrolSelfScheduleOptionItems(type, currentId);
        select.innerHTML = patrolSelfScheduleOptionsHTML(items, currentId);
        select.disabled = items.length === 0;
        const submitBtn = document.querySelector('#self-checkin-form button[type="submit"]');
        if (submitBtn) submitBtn.disabled = items.length === 0;
    }
    window._scOnScheduleChange?.();
};

function openSelfPatrolScheduleDetail(item = {}) {
    const date = patrolScheduleDate(item);
    const area = patrolScheduleArea(item);
    const round = patrolScheduleRound(item);
    const records = patrolSessionRecords(item);
    const status = patrolScheduleStatusLabel(item);
    openModal('รายละเอียดงานตรวจ', `
      <div class="space-y-3">
        <div class="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3">
          <p class="text-xs font-black text-amber-800">${escHtml(date)}${round ? ' · R' + escHtml(round) : ''}</p>
          <p class="text-[11px] text-amber-700/80 mt-0.5">${area ? escHtml(area) : 'ไม่ระบุพื้นที่'} · ${escHtml(status)}</p>
        </div>
        ${records.length ? records.map(r => {
          const meta = patrolTypeMeta(r.PatrolType || (r.isMakeup ? 'compensation' : 'normal'));
          const actual = patrolDateOnly(r.actualDate || r.CheckinDate);
          const notes = r.Notes ? escHtml(String(r.Notes).replace(/\[ตรวจแล้ว:[^\]]*\]\n?/, '').trim()) : '';
          return `<div class="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-bold text-slate-700">${escHtml(actual || date)}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.cls}">${meta.en}</span>
            </div>
            ${r.Location ? `<p class="text-[11px] text-slate-500 mt-1">${escHtml(r.Location)}</p>` : ''}
            ${notes ? `<p class="text-[11px] text-slate-400 mt-1 italic">${notes}</p>` : ''}
          </div>`;
        }).join('') : `<div class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-5 text-center text-xs text-slate-400">ไม่พบ record ที่ผูกกับรอบนี้</div>`}
      </div>`, 'max-w-sm');
}

function openSelfCheckinModal(selectedSessionId = '') {
    const today = new Date().toISOString().split('T')[0];
    const isFlexible = patrolIsFlexibleSelfPatrol();
    const scheduleItems = patrolSelfScheduledYearItems();
    const selectedItem = scheduleItems.find(item => patrolSessionId(item) === String(selectedSessionId || '') || String(item.ScheduledSessionID || '') === String(selectedSessionId || '')) || null;
    if (selectedItem && patrolSessionCompleted(selectedItem)) {
        openSelfPatrolScheduleDetail(selectedItem);
        return;
    }
    const selectedId = selectedItem ? (selectedItem.ScheduledSessionID || patrolSessionId(selectedItem)) : '';
    const openSchedule = patrolSelfScheduleOptionItems('normal', selectedId);
    const makeupSchedule = patrolSelfScheduleOptionItems('compensation', selectedId);
    const hasOpenSchedule = isFlexible ? openSchedule.length > 0 : (openSchedule.length > 0 || makeupSchedule.length > 0);
    const initialPatrolType = !isFlexible && !openSchedule.length && makeupSchedule.length ? 'compensation' : 'normal';
    const initialScheduleOptions = initialPatrolType === 'compensation' ? makeupSchedule : openSchedule;
    const firstSchedule = (selectedItem && !patrolSessionCompleted(selectedItem)) ? selectedItem : (openSchedule[0] || makeupSchedule[0] || null);
    const firstDate = firstSchedule ? patrolScheduleDate(firstSchedule) : today;
    const flexibleAreaList = patrolFlexibleAllowedAreas();
    const firstScheduleId = firstSchedule ? (firstSchedule.ScheduledSessionID || patrolSessionId(firstSchedule)) : '';
    const getModalAreaList = () => (isFlexible && flexibleAreaList.length ? flexibleAreaList : areaList);
    const areaList = _patrolAreas.length
        ? _patrolAreas
        : [{ Name:'โรงงาน 1' },{ Name:'โรงงาน 2' },{ Name:'รอบนอก+พื้นที่ส่วนกลาง' }];

    openModal('บันทึกการเดินตรวจ', `
        <form id="self-checkin-form" class="relative space-y-4">
          <div id="self-checkin-submit-busy" class="hidden absolute inset-0 z-20 flex min-h-[360px] items-center justify-center rounded-2xl bg-white/90 px-5 text-center backdrop-blur-sm">
            <div>
              <div class="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"></div>
              <p class="text-sm font-black text-slate-800">กำลังบันทึกการเดินตรวจ…</p>
              <p class="mt-1 text-xs font-medium text-slate-500">กรุณารอสักครู่ และอย่าปิดหน้านี้</p>
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">รอบตามกำหนดการ</label>
            ${isFlexible ? `
            <input type="hidden" id="sc-session" value="${escHtml(firstScheduleId)}">
            <div class="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3">
              <p class="text-xs font-black text-amber-800">${escHtml(firstDate || '-')}</p>
              <p class="mt-0.5 text-[10px] font-semibold text-amber-600/80">งานตรวจแบบยืดหยุ่น</p>
            </div>` : hasOpenSchedule ? `
            <select id="sc-session" data-preferred-session="${escHtml(firstScheduleId)}" onchange="window._scOnScheduleChange()"
              class="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all">
              ${patrolSelfScheduleOptionsHTML(initialScheduleOptions, firstScheduleId)}
            </select>
            <p class="mt-1 text-[10px] text-amber-600/70">รอบที่เดินแล้วจะไม่แสดงในรายการ</p>` : `
            <div class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
              ไม่มีรอบตามกำหนดการที่เปิดให้เช็คอิน
            </div>`}
          </div>
          <div class="${isFlexible ? 'hidden' : ''}">
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">รูปแบบการเช็คอิน</label>
            <div class="grid grid-cols-2 gap-2">
              <label class="cursor-pointer rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 has-[:checked]:ring-2 has-[:checked]:ring-emerald-400 transition-all">
                <input type="radio" name="sc-type" id="sc-type-normal" value="normal" class="sr-only" ${initialPatrolType === 'normal' ? 'checked' : ''} onchange="window._scOnTypeChange()">
                <span class="block text-xs font-bold text-emerald-700">ปกติ</span>
                <span class="block text-[10px] text-emerald-600/70">ตรงรอบที่เลือก</span>
              </label>
              <label class="cursor-pointer rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 has-[:checked]:ring-2 has-[:checked]:ring-violet-400 transition-all">
                <input type="radio" name="sc-type" id="sc-type-comp" value="compensation" class="sr-only" ${initialPatrolType === 'compensation' ? 'checked' : ''} onchange="window._scOnTypeChange()">
                <span class="block text-xs font-bold text-violet-700">เดินซ่อม</span>
                <span class="block text-[10px] text-violet-600/70">ผูกกับรอบที่ค้าง</span>
              </label>
            </div>
            <p id="sc-mode-hint" class="mt-1 text-[10px] text-slate-400"></p>
          </div>
          <!-- Date -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">วันที่เดินตรวจ</label>
            <input type="date" id="sc-date" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all" value="${initialPatrolType === 'compensation' ? today : firstDate}" readonly required>
          </div>

          <!-- Multi-area checkboxes (Phase 2.3) -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">พื้นที่ที่เดินตรวจ ${isFlexible ? '<span class="text-red-400">*</span>' : ''}</label>
            ${isFlexible ? `
            <select id="sc-flex-area" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all" required>
              <option value="">Select area</option>
              ${getModalAreaList().map(a => {
                const value = a.Code || a.Name || a.AreaName || a.name || a.id || '';
                const label = a.Name || a.AreaName || a.name || a.Code || value;
                return `<option value="${escHtml(value)}">${escHtml(label)}</option>`;
              }).join('')}
            </select>` : `
            <input type="hidden" id="sc-area-value" value="${escHtml(firstSchedule ? patrolScheduleArea(firstSchedule) : '')}">
            <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p id="sc-area-text" class="text-sm font-semibold text-slate-700">${escHtml(firstSchedule ? (patrolScheduleArea(firstSchedule) || 'ไม่ระบุพื้นที่') : 'ไม่ระบุพื้นที่')}</p>
              <p class="mt-0.5 text-[10px] text-slate-400">ดึงจากรอบตามกำหนดการที่แอดมินตั้งค่า</p>
            </div>`}
            <p id="sc-area-err" class="text-xs text-red-500 mt-1 hidden">กรุณาเลือกอย่างน้อย 1 พื้นที่</p>
          </div>

          <!-- Notes -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">บันทึกเพิ่มเติม <span class="text-slate-300">(ไม่บังคับ)</span></label>
            <textarea id="sc-notes" rows="2" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all resize-none placeholder:text-slate-300" placeholder="สิ่งที่พบ หรือรายละเอียดเพิ่มเติม..."></textarea>
          </div>

          <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="px-4 py-2 rounded-xl text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">ยกเลิก</button>
            <button type="submit" ${hasOpenSchedule ? '' : 'disabled'} class="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed" style="background:linear-gradient(135deg,#d97706,#f59e0b)">บันทึก</button>
          </div>
        </form>`, 'max-w-sm');

    setTimeout(() => {
        window._scOnScheduleChange?.();
        document.getElementById('self-checkin-form')?.addEventListener('submit', guardSubmitHandler(async e => {
            e.preventDefault();
            const form = e.currentTarget;
            if (form.dataset.submitting === '1') return;
            const CheckinDate = document.getElementById('sc-date')?.value;
            const ScheduledSessionID = document.getElementById('sc-session')?.value || null;
            const PatrolType = document.querySelector('input[name="sc-type"]:checked')?.value || 'normal';
            if (!ScheduledSessionID) {
                showToast('ไม่มีรอบตามกำหนดการที่เปิดให้เช็คอิน', 'warning');
                return;
            }

            // Collect area selection
            const flexArea = document.getElementById('sc-flex-area')?.value || '';
            const scheduledArea = document.getElementById('sc-area-value')?.value || '';
            const checkedAreas = flexArea ? [flexArea] : (scheduledArea ? [scheduledArea] : []);
            if (!CheckinDate || (isFlexible && checkedAreas.length === 0)) {
                document.getElementById('sc-area-err')?.classList.remove('hidden');
                if (!CheckinDate) showToast('กรุณาระบุวันที่', 'error');
                return;
            }
            document.getElementById('sc-area-err')?.classList.add('hidden');
            const Location = checkedAreas.join(', ') || null;

            const manualNotes  = document.getElementById('sc-notes')?.value.trim() || '';
            const Notes = manualNotes || null;

            form.dataset.submitting = '1';
            const submitBtn = e.submitter || form.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;
            const busyLayer = document.getElementById('self-checkin-submit-busy');
            busyLayer?.classList.remove('hidden');
            try {
                const res = await API.post('/patrol/self-checkin', { CheckinDate, Location, Notes, ScheduledSessionID, PatrolType });
                if (res.success) {
                    closeModal();
                    showCheckinSuccessScreen(PatrolType, res?.data || { group: 'supervisor', email: res?.email || {} });
                }
                else showError(res.message);
            } catch (err) { showError(getReadableError(err, 'บันทึก Self-Patrol ไม่สำเร็จ')); }
            finally {
                busyLayer?.classList.add('hidden');
                form.dataset.submitting = '0';
                if (submitBtn) submitBtn.disabled = false;
            }
        }));
    }, 50);
}

function openPatrolLeaveModal(group = 'supervisor', scheduledSessionId = '', scheduledDate = '', area = '') {
    const groupLabel = group === 'top_management' ? 'Top & Management' : 'Sec. & Supervisor';
    const title = `บันทึกการลา Safety Patrol`;
    openModal(title, `
      <form id="patrol-leave-form" class="relative space-y-4" enctype="multipart/form-data">
        <div id="patrol-leave-busy" class="hidden absolute inset-0 z-10 rounded-xl bg-white/85 backdrop-blur-[2px]">
          <div class="flex h-full min-h-[220px] flex-col items-center justify-center px-4 text-center">
            <div class="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent"></div>
            <p class="text-sm font-black text-slate-700">กำลังบันทึกการลา...</p>
            <p class="mt-1 text-xs text-slate-400">กรุณารอสักครู่ ระบบกำลังอัปโหลดเอกสารและบันทึกคำขอ</p>
          </div>
        </div>
        <div class="rounded-xl border border-sky-100 bg-sky-50 px-3 py-3">
          <p class="text-xs font-black text-sky-800">${escHtml(groupLabel)}</p>
          <p class="mt-0.5 text-[11px] text-sky-700">${escHtml(scheduledDate || '-')} ${area ? '· ' + escHtml(area) : ''}</p>
          <p class="mt-1 text-[10px] text-sky-600/80">การลาจะถูกนับในสถิติตาม allowance จาก pass target ของกิจกรรม</p>
        </div>
        <input type="hidden" name="RosterGroup" value="${escHtml(group)}">
        <input type="hidden" name="ScheduledSessionID" value="${escHtml(scheduledSessionId)}">
        <input type="hidden" name="ScheduledDate" value="${escHtml(scheduledDate)}">
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">ประเภทการลา</label>
          <select name="LeaveType" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400">
            <option value="ลากิจ">ลากิจ</option>
            <option value="ลาป่วย">ลาป่วย</option>
            <option value="ลาพักร้อน">ลาพักร้อน</option>
            <option value="อบรม/ประชุม">อบรม/ประชุม</option>
            <option value="อื่น ๆ">อื่น ๆ</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">ไปที่ไหน / ทำอะไร</label>
          <input name="Destination" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400" placeholder="เช่น ไปพบแพทย์, ประชุม Supplier, อบรมภายนอก">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">เหตุผลการลา <span class="text-red-400">*</span></label>
          <textarea name="Reason" rows="3" required class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none" placeholder="อธิบายเหตุผลและรายละเอียดการลา"></textarea>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">เอกสารแนบ <span class="text-red-400">*</span></label>
          <input name="Attachment" type="file" required accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-sky-700">
          <p class="mt-1 text-[10px] text-slate-400">รองรับรูปภาพ, PDF, Word ขนาดไม่เกิน 10 MB</p>
        </div>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onclick="window.closeModal&&window.closeModal()" class="px-4 py-2 rounded-xl text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">ยกเลิก</button>
          <button type="submit" class="px-5 py-2 rounded-xl text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 transition-colors">บันทึกการลา</button>
        </div>
      </form>
    `, 'max-w-sm');
    setTimeout(() => {
        document.getElementById('patrol-leave-form')?.addEventListener('submit', guardSubmitHandler(async e => {
            e.preventDefault();
            const form = e.currentTarget;
            if (form.dataset.submitting === '1') return;
            const fd = new FormData(form);
            if (!String(fd.get('Reason') || '').trim()) {
                showToast('กรุณาระบุเหตุผลการลา', 'error');
                return;
            }
            if (!fd.get('Attachment') || !fd.get('Attachment').name) {
                showToast('กรุณาแนบเอกสารการลา', 'error');
                return;
            }
            form.dataset.submitting = '1';
            const submitBtn = e.submitter || form.querySelector('button[type="submit"]');
            const cancelBtn = form.querySelector('button[type="button"]');
            const busy = document.getElementById('patrol-leave-busy');
            const oldSubmitHtml = submitBtn?.innerHTML;
            if (busy) busy.classList.remove('hidden');
            if (cancelBtn) cancelBtn.disabled = true;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<span class="inline-flex items-center gap-2"><span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/80 border-t-transparent"></span>กำลังบันทึก...</span>`;
            }
            showLoading('กำลังบันทึกการลา...');
            try {
                const res = await API.post('/patrol/leave-request', fd);
                if (res.success) {
                    showToast('บันทึกการลาสำเร็จ', 'success');
                    closeModal();
                    loadPatrolPage();
                } else {
                    showError(res.message || 'บันทึกการลาไม่สำเร็จ');
                }
            } catch (err) {
                showError(getReadableError(err, 'บันทึกการลาไม่สำเร็จ'));
            } finally {
                form.dataset.submitting = '0';
                hideLoading();
                if (busy) busy.classList.add('hidden');
                if (cancelBtn) cancelBtn.disabled = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    if (oldSubmitHtml) submitBtn.innerHTML = oldSubmitHtml;
                }
            }
        }));
    }, 50);
}

window.openPatrolLeaveModal = openPatrolLeaveModal;

window.reviewPatrolLeave = async function(id, action) {
    if (!canReviewPatrolLeaveUi() || !id) return;
    const normalized = String(action || '').toLowerCase();
    let reason = '';
    if (normalized === 'reject' || normalized === 'cancel') {
        reason = prompt(normalized === 'reject' ? 'Reject reason' : 'Cancel note') || '';
        if (normalized === 'reject' && !reason.trim()) {
            showToast('Reject reason is required.', 'warning');
            return;
        }
    }
    const ok = normalized === 'approve' ? true : await showConfirmationModal('Confirm leave review', `Do you want to ${normalized} this leave request?`);
    if (!ok) return;
    const key = `leave-review-${id}-${normalized}`;
    if (_patrolActionLocks.has(key)) return;
    _patrolActionLocks.add(key);
    const buttons = Array.from(document.querySelectorAll(`button[onclick*="reviewPatrolLeave(${Number(id)}"]`));
    const clickedButton = buttons.find(btn => (btn.textContent || '').toLowerCase().includes(normalized))
        || buttons.find(btn => (btn.textContent || '').toLowerCase().includes(normalized === 'approve' ? 'approve' : normalized === 'reject' ? 'reject' : 'cancel'));
    const oldButtonHtml = clickedButton?.innerHTML;
    buttons.forEach(btn => { btn.disabled = true; btn.classList.add('opacity-60', 'cursor-wait'); });
    if (clickedButton) {
        clickedButton.innerHTML = `<span class="inline-flex items-center gap-1.5"><span class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>Processing...</span>`;
    }
    showLoading(normalized === 'approve' ? 'กำลังอนุมัติใบลา...' : normalized === 'reject' ? 'กำลังปฏิเสธใบลา...' : 'กำลังยกเลิกใบลา...');
    try {
        const res = await API.patch(`/patrol/leave-request/${id}/review`, { action: normalized, reviewNote: reason.trim() });
        if (res.success) {
            showToast(res.message || 'Leave request updated.', 'success');
            closeModal();
            loadPatrolPage();
        } else {
            showError(res.message || 'Cannot review leave request.');
        }
    } catch (err) {
        showError(getReadableError(err, 'Cannot review leave request.'));
    } finally {
        hideLoading();
        buttons.forEach(btn => { btn.disabled = false; btn.classList.remove('opacity-60', 'cursor-wait'); });
        if (clickedButton && oldButtonHtml) clickedButton.innerHTML = oldButtonHtml;
        _patrolActionLocks.delete(key);
    }
};

async function deleteSelfCheckin(id) {
    const actionKey = `self-delete-${id}`;
    if (_patrolActionLocks.has(actionKey)) return;
    const ok = await showConfirmationModal('ยืนยันการลบ', 'ต้องการลบบันทึก Self-Patrol นี้ใช่หรือไม่?');
    if (!ok) return;
    _patrolActionLocks.add(actionKey);
    try {
        const res = await API.delete(`/patrol/self-checkin/${id}`);
        if (res.success) { showToast('ลบสำเร็จ', 'success'); loadPatrolPage(); }
        else showError(res.message);
    } catch (err) { showError(getReadableError(err, 'ลบบันทึก Self-Patrol ไม่สำเร็จ')); }
    finally { _patrolActionLocks.delete(actionKey); }
}

// ─── Delete Issue (Admin only) ────────────────────────────────────────────────
async function deleteIssue(issueId) {
    if (!isAdmin) return;
    const actionKey = `issue-delete-${issueId}`;
    if (_patrolActionLocks.has(actionKey)) return;
    const confirmed = await new Promise(resolve => {
        openModal('ยืนยันการลบ', `
            <div class="text-center py-4">
              <div class="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <svg class="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </div>
              <p class="text-slate-700 font-semibold mb-1">ลบปัญหา #${issueId}?</p>
              <p class="text-sm text-slate-400 mb-6">ข้อมูลจะถูกลบถาวร ไม่สามารถกู้คืนได้</p>
              <div class="flex gap-3 justify-center">
                <button onclick="window._deleteResolve(false);window.closeModal&&window.closeModal()"
                  class="px-5 py-2 rounded-xl text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium">ยกเลิก</button>
                <button onclick="window._deleteResolve(true);window.closeModal&&window.closeModal()"
                  class="px-5 py-2 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors">ลบเลย</button>
              </div>
            </div>`, 'max-w-sm');
        window._deleteResolve = resolve;
    });
    if (!confirmed) return;
    _patrolActionLocks.add(actionKey);
    try {
        showLoading('กำลังลบ...');
        const res = await API.delete(`/patrol/issue/${issueId}`);
        if (res?.success === false) throw new Error(res.message || 'ลบไม่สำเร็จ');
        showToast(`ลบปัญหา #${issueId} สำเร็จ`, 'success');
        // Remove from local cache and re-render without full reload
        _allIssues = _allIssues.filter(i => (i.IssueID || i.issueid) != issueId);
        _renderIssueRegistry();
        renderDeptStats();
        renderStopRankStats();
        renderRankStopSummary();
    } catch (err) {
        showError(getReadableError(err, 'ลบปัญหาไม่สำเร็จ'));
    } finally {
        _patrolActionLocks.delete(actionKey);
        hideLoading();
    }
}

// ─── Export to PDF (A4 formal report) ────────────────────────────────────────
async function exportIssuesToPDF(mode = 'full') {
    const reportMode = mode === 'summary' ? 'summary' : 'full';
    const exportKind = reportMode === 'summary' ? 'pdf-summary' : 'pdf-full';
    return _runIssueExport(exportKind, () => _exportIssuesToPDF(reportMode));
}

async function _exportIssuesToPDF(mode = 'full') {
    if (!window.jspdf || !window.html2canvas) { showToast('ไม่พบ jsPDF หรือ html2canvas', 'error'); return; }

    const isFullReport = mode === 'full';
    const exportKind = isFullReport ? 'pdf-full' : 'pdf-summary';
    const reportLabel = isFullReport ? 'รายงานฉบับเต็ม' : 'รายงานสรุป';
    const filtered = _issueSortedItems(getFilteredIssues(_allIssues, _activeFilter));
    const now      = new Date();
    const dateStr  = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr  = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const stamp    = patrolPdfTimestamp(now);
    const docNo    = `SP-ISS-${now.getFullYear()}-${stamp.slice(4,8)}-${stamp.slice(8)}`;
    const pdfFileName = patrolSafePdfFilename(`patrol-issues-${isFullReport ? 'full' : 'summary'}-${docNo}`)+'.pdf';
    const approvalHistory = await _loadIssueApprovalHistory(filtered);

    // ── Step 1: Summary counts ──────────────────────────────────────────────
    const counts = { open: 0, temp: 0, closed: 0 };
    const approvalCounts = { pending: 0, approved: 0, rejected: 0 };
    const byRank = { A: 0, B: 0, C: 0 };
    const byStop = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    const matrix = {}; // matrix[stopId][rank] = count
    CCCF_STOP_TYPES.forEach(s => { matrix[s.id] = { A:0, B:0, C:0 }; });

    filtered.forEach(i => {
        if (i.CurrentStatus === 'Open')      counts.open++;
        else if (i.CurrentStatus === 'Temporary') counts.temp++;
        else if (i.CurrentStatus === 'Closed')    counts.closed++;
        const approval = _issueApprovalStatus(i).toLowerCase();
        if (approvalCounts[approval] !== undefined) approvalCounts[approval]++;
        if (byRank[i.Rank] !== undefined) byRank[i.Rank]++;
        _issueStopIds(i.HazardType).forEach(n => {
            if (byStop[n] !== undefined) byStop[n]++;
            if (matrix[n] && i.Rank && matrix[n][i.Rank] !== undefined) matrix[n][i.Rank]++;
        });
    });

    const closePct = filtered.length ? Math.round((counts.closed / filtered.length) * 100) : 0;

    // ── Step 2: Date range ──────────────────────────────────────────────────
    const dates = filtered.map(_issueFoundDate).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d));
    const minDate = dates.length ? new Date(Math.min(...dates)) : null;
    const maxDate = dates.length ? new Date(Math.max(...dates)) : null;
    const fmtDate = d => d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const dateRange = minDate && maxDate
        ? (minDate.toDateString() === maxDate.toDateString() ? fmtDate(minDate) : `${fmtDate(minDate)} – ${fmtDate(maxDate)}`)
        : '—';

    // ── Step 3: Filter label ────────────────────────────────────────────────
    const fParts = [];
    if (_activeFilter !== 'all') fParts.push({ open:'รอแก้ไข', temp:'แก้ชั่วคราว', closed:'เสร็จสิ้น', high:'Rank A', overdue:'เกินกำหนด' }[_activeFilter] || '');
    if (_filterDepts.length) fParts.push(`ส่วนงาน: ${_filterDepts.join(', ')}`);
    if (_filterUnits.length) fParts.push(`Unit: ${_filterUnits.join(', ')}`);
    if (_filterArea)  fParts.push(`พื้นที่: ${_filterArea}`);
    if (_filterRank)  fParts.push(`Rank ${_filterRank}`);
    if (_filterStops.length) fParts.push(`STOP ${_filterStops.join(', STOP ')}`);
    if (_issueYear !== 'all') fParts.push(`ปีที่พบ: ${_issueYear}`);
    if (_searchQuery) fParts.push(`ค้นหา: "${_searchQuery}"`);
    const filterLabel = fParts.length ? fParts.join(' · ') : 'แสดงทั้งหมด';

    // ── Step 4: Helper fns ──────────────────────────────────────────────────
    const sColor = s => s === 'Closed' ? '#059669' : s === 'Temporary' ? '#f97316' : '#dc2626';
    const sLabel = s => s === 'Closed' ? 'เสร็จสิ้น' : s === 'Temporary' ? 'แก้ชั่วคราว' : 'รอแก้ไข';
    const rColor = r => r === 'A' ? '#dc2626' : r === 'B' ? '#f97316' : '#059669';
    const K      = `font-family:'Kanit',sans-serif;`;

    const useFormalIssuePdf = true;
    if (useFormalIssuePdf) {
        const fmtShort = value => {
            const d = value ? new Date(value) : null;
            return d && !isNaN(d) ? d.toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' }) : '-';
        };
        const plainDept = value => _formatIssueMulti(value, '-');
        const stopLabelOf = issue => {
            const ids = _issueStopIds(issue.HazardType);
            return ids.length ? ids.map(id => `Stop ${id}`).join(', ') : '-';
        };
        const descShort = (value, len = 72) => {
            const s = String(value || '').replace(/\s+/g, ' ').trim();
            return escHtml(s.length > len ? s.slice(0, len) + '...' : (s || '-'));
        };
        const pdfText = (value, len = 72, fallback = '-') => descShort(String(value || '').trim() || fallback, len);
        const isOverdueIssue = issue => issue.CurrentStatus !== 'Closed' && issue.DueDate && new Date(issue.DueDate) < now;
        const page = body => '<div style="'+K+'width:794px;height:1122px;background:#fff;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;color:#1e293b;font-size:11px">'+body+'</div>';
        const footer = label => '<div style="margin-top:auto;padding:8px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">'
            +'<span style="'+K+'font-size:8.8px">Safety Patrol Issue Report / รายงานทะเบียนปัญหา · Thai Summit Harness Co., Ltd.</span>'
            +'<span style="'+K+'font-size:8.8px;font-weight:800">'+label+'</span>'
            +'</div>';
        const header = subtitle => '<div style="background:#065f46;color:#fff;padding:18px 28px;flex-shrink:0">'
            +'<div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start">'
            +'<div><p style="'+K+'font-size:10px;opacity:.82;margin:0 0 3px">Thai Summit Harness Co., Ltd. · Safety Patrol Audit Report</p>'
            +'<h1 style="'+K+'font-size:21px;font-weight:900;margin:0;line-height:1.18">Safety Patrol Issue Report / รายงานทะเบียนปัญหา</h1>'
            +'<p style="'+K+'font-size:11px;opacity:.9;margin:5px 0 0">'+subtitle+'</p></div>'
            +'<div style="'+K+'text-align:right;font-size:9.5px;line-height:1.55;opacity:.92"><div>Rank A SLA / กำหนด: 7 วัน</div><div>Rank B SLA / กำหนด: 14 วัน</div><div>Rank C SLA / กำหนด: 30 วัน</div><div style="margin-top:4px;font-size:8.5px;opacity:.75">'+docNo+'</div></div>'
            +'</div></div>';
        const kpi = (label, value, tone, sub = '') => '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:11px;text-align:center;min-height:72px">'
            +'<div style="'+K+'font-size:24px;font-weight:900;color:'+tone+';line-height:1">'+value+'</div>'
            +'<div style="'+K+'font-size:9.5px;color:#475569;margin-top:6px;font-weight:800">'+label+'</div>'
            +(sub ? '<div style="'+K+'font-size:8.5px;color:#94a3b8;margin-top:2px">'+sub+'</div>' : '')
            +'</div>';
        const sectionTitle = (title, sub = '') => '<div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px"><div><h2 style="'+K+'font-size:14px;font-weight:900;color:#065f46;margin:0">'+title+'</h2>'+(sub ? '<p style="'+K+'font-size:9.5px;color:#64748b;margin:2px 0 0">'+sub+'</p>' : '')+'</div></div>';
        const bar = (pct, color, h = 7) => '<div style="height:'+h+'px;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="height:100%;width:'+Math.max(0, Math.min(100, pct))+'%;background:'+color+';border-radius:999px"></div></div>';
        const statusBadge = status => '<span style="'+K+'display:inline-block;background:'+sColor(status)+'18;color:'+sColor(status)+';font-size:8px;font-weight:800;border-radius:999px;padding:2px 6px;white-space:nowrap">'+sLabel(status)+'</span>';
        const approvalColor = status => status === 'Pending' ? '#0284c7' : status === 'Approved' ? '#059669' : status === 'Rejected' ? '#e11d48' : '#94a3b8';
        const approvalLabel = status => status === 'Pending' ? 'Pending' : status === 'Approved' ? 'Approved' : status === 'Rejected' ? 'Rejected' : '-';
        const approvalBadge = issue => {
            const status = _issueApprovalStatus(issue);
            if (!['Pending', 'Approved', 'Rejected'].includes(status)) return '';
            const color = approvalColor(status);
            return '<span style="'+K+'display:inline-block;background:'+color+'18;color:'+color+';font-size:7.4px;font-weight:900;border-radius:999px;padding:1.5px 5px;white-space:nowrap;margin-top:2px">'+approvalLabel(status)+'</span>';
        };
        const rankBadge = rank => rank ? '<span style="'+K+'display:inline-block;background:'+rColor(rank)+';color:#fff;font-size:8px;font-weight:900;border-radius:5px;padding:2px 5px">'+rank+'</span>' : '<span style="'+K+'color:#cbd5e1;font-size:8px">-</span>';
        const issueRow = (issue, idx) => {
            const over = isOverdueIssue(issue);
            return '<tr style="background:'+(idx % 2 ? '#fff' : '#f8fafc')+';border-bottom:1px solid #e5e7eb">'
                +'<td style="'+K+'padding:6px 7px;font-size:8.6px;color:#64748b;text-align:center;width:28px">'+(idx + 1)+'</td>'
                +'<td style="'+K+'padding:6px 7px;font-size:8.5px;color:#475569;width:58px;white-space:nowrap">'+fmtShort(_issueFoundDate(issue))+'</td>'
                +'<td style="'+K+'padding:6px 7px;font-size:8.4px;color:#475569;width:58px;line-height:1.25">'+pdfText(issue.Area, 18)+'</td>'
                +'<td style="'+K+'padding:6px 7px;font-size:8.3px;color:#475569;width:62px">'+escHtml(stopLabelOf(issue))+'</td>'
                +'<td style="'+K+'padding:6px 7px;font-size:8.5px;color:#0f172a;line-height:1.25">'+descShort(issue.HazardDescription, 76)+'</td>'
                +'<td style="'+K+'padding:6px 7px;font-size:8.2px;color:#475569;width:76px;line-height:1.25">'+pdfText(plainDept(issue.ResponsibleDept), 28)+'</td>'
                +'<td style="padding:6px 7px;text-align:center;width:34px">'+rankBadge(issue.Rank)+'</td>'
                +'<td style="padding:6px 7px;text-align:center;width:66px">'+statusBadge(issue.CurrentStatus)+approvalBadge(issue)+'</td>'
                +'<td style="'+K+'padding:6px 7px;font-size:8.3px;text-align:center;width:50px;color:'+(over ? '#dc2626' : '#475569')+';font-weight:'+(over ? 800 : 500)+';white-space:nowrap">'+fmtShort(issue.DueDate)+'</td>'
                +'</tr>';
        };
        const tableHead = '<thead><tr style="background:#065f46;color:white">'
            +'<th style="'+K+'padding:8px 7px;font-size:8.2px;text-align:center;width:28px">No.</th>'
            +'<th style="'+K+'padding:8px 7px;font-size:8.2px;text-align:left;width:58px">Found / วันที่</th>'
            +'<th style="'+K+'padding:8px 7px;font-size:8.2px;text-align:left;width:58px">Area / พื้นที่</th>'
            +'<th style="'+K+'padding:8px 7px;font-size:8.2px;text-align:left;width:62px">Stop</th>'
            +'<th style="'+K+'padding:8px 7px;font-size:8.2px;text-align:left">Detail / รายละเอียด</th>'
            +'<th style="'+K+'padding:8px 7px;font-size:8.2px;text-align:left;width:76px">Owner / ผู้รับผิดชอบ</th>'
            +'<th style="'+K+'padding:8px 7px;font-size:8.2px;text-align:center;width:34px">Rank</th>'
            +'<th style="'+K+'padding:8px 7px;font-size:8.2px;text-align:center;width:66px">Status / สถานะ</th>'
            +'<th style="'+K+'padding:8px 7px;font-size:8.2px;text-align:center;width:50px">Due / กำหนด</th>'
            +'</tr></thead>';
        const matrixTable = '<table style="width:100%;border-collapse:collapse;font-size:9.5px"><thead><tr style="background:#065f46;color:#fff">'
            +'<th style="'+K+'padding:6px;text-align:left">Stop</th>'
            +'<th style="'+K+'padding:6px;text-align:center">A</th>'
            +'<th style="'+K+'padding:6px;text-align:center">B</th>'
            +'<th style="'+K+'padding:6px;text-align:center">C</th>'
            +'<th style="'+K+'padding:6px;text-align:center">Total</th></tr></thead><tbody>'
            +CCCF_STOP_TYPES.map((s, idx) => {
                const r = matrix[s.id] || { A:0, B:0, C:0 };
                const total = r.A + r.B + r.C;
                return '<tr style="background:#f8fafc">'
                    +'<td style="'+K+'padding:7px 8px;border-bottom:3px solid #fff;color:#334155"><b style="color:'+s.color+'">'+s.code+'</b><div style="font-size:8px;color:#64748b">'+s.label+'</div></td>'
                    +'<td style="'+K+'padding:7px;text-align:center;color:'+(r.A ? '#dc2626' : '#cbd5e1')+';font-weight:900;border-bottom:3px solid #fff">'+r.A+'</td>'
                    +'<td style="'+K+'padding:7px;text-align:center;color:'+(r.B ? '#ea580c' : '#cbd5e1')+';font-weight:900;border-bottom:3px solid #fff">'+r.B+'</td>'
                    +'<td style="'+K+'padding:7px;text-align:center;color:'+(r.C ? '#16a34a' : '#cbd5e1')+';font-weight:900;border-bottom:3px solid #fff">'+r.C+'</td>'
                    +'<td style="'+K+'padding:7px;text-align:center;color:'+(total ? '#334155' : '#cbd5e1')+';font-weight:900;border-bottom:3px solid #fff">'+total+'</td>'
                    +'</tr>';
            }).join('')+'</tbody></table>';
        const fullPdfText = (value, fallback = '-') => {
            const text = String(value || '').trim() || fallback;
            return escHtml(text).replace(/\r?\n/g, '<br>');
        };
        const detailField = (label, value, options = {}) => '<div style="min-width:0;background:'+(options.bg || '#f8fafc')+';border:1px solid '+(options.border || '#e2e8f0')+';border-radius:9px;padding:8px 9px">'
            +'<div style="'+K+'font-size:7.7px;font-weight:900;text-transform:uppercase;letter-spacing:.02em;color:'+(options.labelColor || '#64748b')+';margin-bottom:3px">'+label+'</div>'
            +'<div style="'+K+'font-size:'+(options.size || '9.2px')+';font-weight:'+(options.weight || 700)+';line-height:1.38;color:'+(options.color || '#1e293b')+';overflow-wrap:anywhere;word-break:break-word">'+fullPdfText(value)+'</div>'
            +'</div>';
        const detailNarrative = (label, value, tone = '#475569') => '<div style="border:1px solid '+tone+'33;border-left:4px solid '+tone+';border-radius:9px;padding:9px 11px;background:'+tone+'0b">'
            +'<div style="'+K+'font-size:8.2px;font-weight:900;color:'+tone+';margin-bottom:4px">'+label+'</div>'
            +'<div style="'+K+'font-size:9.5px;line-height:1.48;color:#334155;white-space:normal;overflow-wrap:anywhere;word-break:break-word">'+fullPdfText(value)+'</div>'
            +'</div>';
        const detailPhotoSlot = (url, label, color) => {
            const safeUrl = url ? escHtml(url) : '';
            return '<div style="flex:1;min-width:0">'
                +'<div style="'+K+'font-size:8px;font-weight:900;color:'+(safeUrl ? color : '#94a3b8')+';margin-bottom:3px">'+label+'</div>'
                +'<div style="position:relative;height:112px;border:1.5px '+(safeUrl ? 'solid '+color+'55' : 'dashed #cbd5e1')+';border-radius:8px;background:#f8fafc;overflow:hidden">'
                +'<div style="'+K+'position:absolute;inset:0;display:'+(safeUrl ? 'none' : 'flex')+';align-items:center;justify-content:center;text-align:center;padding:8px;color:#94a3b8;font-size:8.5px;font-weight:800">'+(safeUrl ? 'Image unavailable' : 'No image / ไม่มีรูป')+'<br>'+label+'</div>'
                +(safeUrl ? '<img src="'+safeUrl+'" loading="eager" decoding="sync" style="position:absolute;inset:0;width:100%;height:112px;object-fit:contain;background:#f8fafc" onerror="this.style.display=\'none\';this.previousElementSibling.style.display=\'flex\'">' : '')
                +'</div></div>';
        };
        const detailPageHtml = (issue, index) => {
            const approval = _issueApprovalStatus(issue);
            const reporter = [issue.ReporterName || issue.FoundBy || '', issue.ReporterTeam || issue.FoundByTeam || ''].filter(Boolean).join(' / ') || '-';
            const requestedBy = issue.CloseRequesterName || issue.CloseRequestedBy || '-';
            const approvedBy = issue.CloseApproverName || issue.CloseApprovedBy || '-';
            const rejectedBy = issue.CloseRejecterName || issue.CloseRejectedBy || '-';
            const evidence = [issue.BeforeImage ? 'Before' : '', issue.TempImage ? 'Temporary' : '', issue.AfterImage ? 'After' : ''].filter(Boolean).join(', ') || 'No image';
            return page(
                header('Detailed Issue Record / รายละเอียดครบรายปัญหา | #'+escHtml(issue.IssueID || (index + 1)))
                +'<div style="flex:1;padding:16px 28px 14px;display:flex;flex-direction:column;gap:10px;min-height:0">'
                +sectionTitle('7. Detailed Issue Record / รายละเอียดรายปัญหา', 'รายการที่ '+(index + 1)+' / '+filtered.length+' · ข้อมูลเต็มโดยไม่ตัดข้อความ')
                +'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:11px;padding:10px 12px">'
                +'<div><div style="'+K+'font-size:14px;font-weight:900;color:#065f46">Issue #'+escHtml(issue.IssueID || '-')+' · '+fullPdfText(issue.MachineName || issue.Area || 'Safety Patrol Issue')+'</div>'
                +'<div style="'+K+'font-size:8.8px;color:#64748b;margin-top:3px">'+fullPdfText(_formatIssueHazardTypes(issue.HazardType, '-'))+'</div></div>'
                +'<div style="display:flex;align-items:center;gap:6px">'+rankBadge(issue.Rank)+statusBadge(issue.CurrentStatus)+(approvalBadge(issue) || '')+'</div></div>'
                +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px">'
                +detailField('Found / วันที่พบ', fmtShort(_issueFoundDate(issue)))
                +detailField('Due / กำหนดเสร็จ', fmtShort(issue.DueDate), { color: isOverdueIssue(issue) ? '#dc2626' : '#1e293b' })
                +detailField('Temporary date', fmtShort(issue.TempDate))
                +detailField('Finished / ปิดงาน', fmtShort(issue.FinishDate))
                +'</div>'
                +'<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:7px">'
                +detailField('Area / พื้นที่', issue.Area)
                +detailField('Machine / เครื่องมือหรือเครื่องจักร', issue.MachineName)
                +detailField('Responsible department / ส่วนงาน', plainDept(issue.ResponsibleDept))
                +detailField('Safety Unit', _formatIssueMulti(issue.ResponsibleUnit, '-'))
                +detailField('Reporter / ผู้รายงาน', reporter)
                +detailField('STOP Type / ประเภทอันตราย', _formatIssueHazardTypes(issue.HazardType, '-'))
                +'</div>'
                +'<div style="display:grid;gap:7px">'
                +detailNarrative('Hazard detail / รายละเอียดอันตรายและวิธีเกิด', issue.HazardDescription, '#dc2626')
                +detailNarrative('Temporary action / การแก้ไขเบื้องต้น', issue.TempDescription, '#ea580c')
                +detailNarrative('Permanent action / การแก้ไขถาวร', issue.ActionDescription, '#059669')
                +'</div>'
                +'<div style="border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;background:#fff">'
                +'<div style="'+K+'font-size:8.5px;font-weight:900;color:#065f46;margin-bottom:5px">Evidence / Before - Temporary - After</div>'
                +'<div style="display:flex;gap:9px">'
                +detailPhotoSlot(resolveFileUrl(issue.BeforeImage), 'Before', '#dc2626')
                +detailPhotoSlot(resolveFileUrl(issue.TempImage), 'Temporary', '#f97316')
                +detailPhotoSlot(resolveFileUrl(issue.AfterImage), 'After', '#059669')
                +'</div></div>'
                +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:auto">'
                +detailField('Close request', requestedBy+'\n'+(_issueExportDateTime(issue.CloseRequestedAt) || '-'), { size:'8.5px' })
                +detailField('Approval', approval+'\n'+(approval === 'Rejected' ? rejectedBy : approvedBy)+'\n'+(_issueExportDateTime(issue.CloseRejectedAt || issue.CloseApprovedAt) || '-'), { size:'8.5px' })
                +detailField('Evidence / หลักฐานภาพ', evidence, { size:'8.5px' })
                +'</div>'
                +(issue.CloseRejectReason ? detailNarrative('Close reject reason / เหตุผลที่ไม่อนุมัติ', issue.CloseRejectReason, '#e11d48') : '')
                +'</div>'+footer('Detailed Issue '+(index + 1)+' / '+filtered.length)
            );
        };
        const formalPages = [];
        const priorityRows = 6;
        const rowsPerPage = 22;
        const overdueIssues = filtered.filter(isOverdueIssue);
        const dueSoonIssues = filtered.filter(_issueIsDueSoon);
        const rankAOpenIssues = filtered.filter(i => i.Rank === 'A' && i.CurrentStatus !== 'Closed');
        const activeIssues = counts.open + counts.temp;
        const auditReady = overdueIssues.length === 0 && rankAOpenIssues.length === 0;
        const auditStatus = auditReady ? 'Ready for audit / พร้อมตรวจ' : 'Follow-up needed / ต้องติดตาม';
        const priorityIssues = [...filtered]
            .sort((a, b) => Number(isOverdueIssue(b)) - Number(isOverdueIssue(a)) || (a.Rank || 'Z').localeCompare(b.Rank || 'Z'))
            .slice(0, priorityRows);
        const noIssueRow = '<tr><td colspan="9" style="'+K+'padding:42px 12px;text-align:center;font-size:10px;color:#94a3b8">ไม่มีข้อมูลประเด็นตามตัวกรองปัจจุบัน</td></tr>';
        const priorityEmpty = '<div style="'+K+'padding:38px 12px;text-align:center;font-size:10px;color:#94a3b8;background:#f8fafc;border-radius:10px">No priority item / ไม่มีประเด็นสำคัญตามตัวกรองปัจจุบัน</div>';
        const priorityRowsHtml = priorityIssues.length ? priorityIssues.map(issue => {
            const sourceNo = filtered.indexOf(issue) + 1;
            const over = isOverdueIssue(issue);
            return '<div style="display:grid;grid-template-columns:34px 1fr 52px;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #e2e8f0">'
                +'<div style="'+K+'font-size:10px;font-weight:900;color:#94a3b8;text-align:center">#'+sourceNo+'</div>'
                +'<div style="min-width:0"><div style="'+K+'font-size:9.4px;font-weight:900;color:#0f172a;line-height:1.25">'+descShort(issue.HazardDescription, 70)+'</div>'
                +'<div style="'+K+'font-size:8px;color:#64748b;margin-top:2px">'+pdfText(issue.Area, 20)+' · '+pdfText(plainDept(issue.ResponsibleDept), 34)+'</div></div>'
                +'<div style="text-align:right">'+rankBadge(issue.Rank)+'<div style="'+K+'font-size:8px;font-weight:800;color:'+(over ? '#dc2626' : sColor(issue.CurrentStatus))+';margin-top:4px">'+(over ? 'Overdue' : sLabel(issue.CurrentStatus))+'</div></div>'
                +'</div>';
        }).join('') : priorityEmpty;
        const rankRows = [
            ['Rank A', byRank.A, '#dc2626'],
            ['Rank B', byRank.B, '#ea580c'],
            ['Rank C', byRank.C, '#16a34a'],
        ].map(([label, count, color]) => {
            const pct = filtered.length ? Math.round((count / filtered.length) * 100) : 0;
            return '<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px"><b style="'+K+'color:'+color+'">'+label+'</b><span style="'+K+'color:#334155">'+count+' ('+pct+'%)</span></div>'+bar(pct, color, 7)+'</div>';
        }).join('');
        const stopRows = CCCF_STOP_TYPES.map(s => {
            const count = byStop[s.id] || 0;
            const pct = filtered.length ? Math.round((count / filtered.length) * 100) : 0;
            return '<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:9.5px;margin-bottom:2px"><b style="'+K+'color:'+s.color+'">'+s.code+'</b><span style="'+K+'color:#334155">'+count+' ('+pct+'%)</span></div>'+bar(pct, s.color, 6)+'</div>';
        }).join('');
        const keyNotes = [
            'Issue total '+filtered.length+' · Closed '+counts.closed+' · Open '+counts.open+' · Temporary '+counts.temp,
            'Audit focus: Overdue '+overdueIssues.length+' · Due soon '+dueSoonIssues.length+' · Open Rank A '+rankAOpenIssues.length,
            'Readiness: '+auditStatus+' · Close rate '+closePct+'% · Active '+activeIssues,
            'Scope / ตัวกรอง: '+filterLabel,
            'Period / ช่วงข้อมูล: '+dateRange+' · Generated '+dateStr+' '+timeStr,
        ].map(t => '<div style="'+K+'font-size:10.2px;color:#334155;margin-bottom:6px;display:flex;gap:6px"><span style="color:#f97316;font-weight:900">•</span><span>'+escHtml(t)+'</span></div>').join('');
        formalPages.push(page(
            header('Report summary / รายงานภาพรวมประเด็น Safety Patrol · สร้างรายงานเมื่อ '+dateStr)
            +'<div style="padding:18px 28px 14px;flex:1;display:flex;flex-direction:column;gap:12px;min-height:0">'
            +sectionTitle('1. ภาพรวมรายงาน / Report Summary', 'สรุปจำนวนประเด็น สถานะ และระดับความเร่งด่วนตาม Rank')
            +'<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">'
            +kpi('Total / ทั้งหมด', filtered.length, '#0f766e', 'Total Issues')
            +kpi('Open / รอแก้ไข', counts.open, counts.open ? '#dc2626' : '#64748b', 'Open')
            +kpi('Temporary / แก้ชั่วคราว', counts.temp, counts.temp ? '#ea580c' : '#64748b', 'Temporary')
            +kpi('Closed / เสร็จสิ้น', counts.closed, '#059669', 'Closed')
            +kpi('Rank A', byRank.A, byRank.A ? '#dc2626' : '#64748b', 'Critical')
            +kpi('Close rate / ปิดงาน', closePct+'%', closePct >= 80 ? '#059669' : '#dc2626', 'Close Rate')
            +'</div>'
            +'<div style="display:grid;grid-template-columns:1.1fr .9fr;gap:12px">'
            +'<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px"><div style="'+K+'font-size:12px;font-weight:900;color:#065f46;margin-bottom:8px">Key Notes / ประเด็นสำคัญ</div>'+keyNotes+'</div>'
            +'<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center"><div style="'+K+'font-size:12px;font-weight:900;color:#065f46;margin-bottom:7px">Close Rate / Audit readiness</div><div style="'+K+'font-size:48px;font-weight:900;line-height:1;color:'+(closePct >= 80 ? '#059669' : closePct >= 50 ? '#d97706' : '#dc2626')+'">'+closePct+'%</div><div style="'+K+'font-size:9.5px;color:#64748b;margin:8px 0 5px">Closed '+counts.closed+' · Active '+activeIssues+' · Overdue '+overdueIssues.length+'</div><div style="'+K+'font-size:8.7px;font-weight:900;color:'+(auditReady ? '#059669' : '#dc2626')+';margin-bottom:9px">'+auditStatus+'</div>'+bar(closePct, closePct >= 80 ? '#059669' : closePct >= 50 ? '#d97706' : '#dc2626', 8)+'</div>'
            +'</div>'
            +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
            +'<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">'+sectionTitle('2. Rank Distribution', 'จำนวนประเด็นแยกตามความเร่งด่วน')+rankRows+'</div>'
            +'<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">'+sectionTitle('3. STOP Distribution', 'จำนวนประเด็นแยกตาม Stop Type')+stopRows+'</div>'
            +'</div>'
            +'<div style="display:grid;grid-template-columns:.92fr 1.08fr;gap:12px;min-height:0">'
            +'<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;min-height:0">'+sectionTitle('4. STOP x Rank Matrix', 'รูปแบบความเสี่ยงซ้ำตามประเภทอันตราย')+matrixTable+'</div>'
            +'<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;min-height:0;overflow:hidden">'+sectionTitle('5. Priority Follow-up Snapshot', 'Overdue '+overdueIssues.length+' · Due soon '+dueSoonIssues.length+' · Open Rank A '+rankAOpenIssues.length)+priorityRowsHtml+'<div style="'+K+'font-size:8.2px;color:#94a3b8;margin-top:8px">Full Issue Register เริ่มในหน้าถัดไปและแสดงเต็มความกว้างเพื่อรองรับข้อมูลจำนวนมาก</div></div>'
            +'</div>'
            +'</div>'
            +footer('Page 1 · Summary')
        ));
        for (let start = 0; start < filtered.length; start += rowsPerPage) {
            const slice = filtered.slice(start, start + rowsPerPage);
            const rangeLabel = `${start + 1}-${Math.min(start + slice.length, filtered.length)} / ${filtered.length}`;
            formalPages.push(page(
                header('Issue Register / ทะเบียนประเด็นปัญหา | รายการที่ '+rangeLabel)
                +'<div style="flex:1;padding:18px 28px 14px;display:flex;flex-direction:column;gap:10px;min-height:0">'
                +sectionTitle('6. Full Issue Register / รายการประเด็นทั้งหมด', 'รายการที่ '+rangeLabel+' ตามตัวกรองปัจจุบัน')
                +'<div style="background:#fff;border:1px solid #e2e8f0;border-bottom:2px solid #065f46;border-radius:12px;overflow:hidden">'
                +'<table style="width:100%;border-collapse:collapse">'+tableHead+'<tbody>'+slice.map((i, idx) => issueRow(i, start + idx)).join('')+'</tbody></table>'
                +'</div>'
                +'<div style="'+K+'font-size:8.5px;color:#64748b">หมายเหตุ: กำหนดแก้ไขที่เป็นสีแดงคือรายการที่เกินกำหนดและยังไม่ปิดงาน</div>'
                +'</div>'
                +footer('Issue Register '+rangeLabel)
            ));
        }
        if (isFullReport) filtered.forEach((issue, index) => formalPages.push(detailPageHtml(issue, index)));
        const evidenceIssues = [...filtered]
            .filter(i => i.BeforeImage || i.TempImage || i.AfterImage)
            .sort((a, b) => Number(isOverdueIssue(b)) - Number(isOverdueIssue(a)) || (a.Rank || 'Z').localeCompare(b.Rank || 'Z'));
        const photoFallback = (label, text = 'No image / ไม่มีรูป') =>
            '<div style="'+K+'height:162px;border:1.5px dashed #cbd5e1;border-radius:8px;background:#f8fafc;color:#94a3b8;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px;box-sizing:border-box">'+text+'<br>'+label+'</div>';
        const photoSlot = (url, label, color) => {
            const safeUrl = url ? escHtml(url) : '';
            const fallback = photoFallback(label, safeUrl ? 'Image unavailable / โหลดรูปไม่ได้' : 'No image / ไม่มีรูป');
            return '<div style="flex:1;min-width:0">'
                +'<div style="'+K+'font-size:8.5px;font-weight:900;color:'+(safeUrl ? color : '#94a3b8')+';margin-bottom:4px">'+label+'</div>'
                +(safeUrl
                    ? '<div style="position:relative;height:162px">'+fallback.replace('display:flex', 'display:none')+'<img src="'+safeUrl+'" loading="eager" decoding="sync" style="position:absolute;inset:0;width:100%;height:162px;object-fit:contain;border:1.5px solid '+color+'55;border-radius:8px;background:#f8fafc" onerror="this.style.display=\'none\';this.previousElementSibling.style.display=\'flex\'"></div>'
                    : fallback)
                +'</div>';
        };
        for (let start = 0; isFullReport && start < evidenceIssues.length; start += 2) {
            const slice = evidenceIssues.slice(start, start + 2);
            formalPages.push(page(
                header('Evidence / ภาพประกอบการแก้ไข | รายการสำคัญ '+(start + 1)+'-'+Math.min(start + slice.length, evidenceIssues.length)+' / '+evidenceIssues.length)
                +'<div style="flex:1;padding:18px 28px 14px;display:flex;flex-direction:column;gap:10px;min-height:0">'
                +sectionTitle('8. Evidence / Before - Temporary - After', 'แสดงรูปประกอบครบทุกรายการที่มีหลักฐานภาพ พร้อม fallback เมื่อไฟล์รูปไม่พร้อมใช้งาน')
                +slice.map(issue => '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:13px 14px;flex:1;min-height:0;display:flex;flex-direction:column;box-shadow:0 1px 0 rgba(15,23,42,.03)">'
                    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
                    +'<div style="display:flex;align-items:center;gap:7px"><span style="'+K+'font-size:8.5px;color:#64748b">No. '+(filtered.indexOf(issue) + 1)+'</span>'+rankBadge(issue.Rank)+statusBadge(issue.CurrentStatus)+'</div>'
                    +'<span style="'+K+'font-size:8.5px;color:#64748b">'+fmtShort(_issueFoundDate(issue))+' | '+pdfText(issue.Area, 28)+'</span>'
                    +'</div>'
                    +'<div style="'+K+'font-size:9.8px;font-weight:900;color:#0f172a;line-height:1.35;margin-bottom:7px;min-height:28px">'+descShort(issue.HazardDescription, 132)+'</div>'
                    +'<div style="display:flex;gap:10px;margin-top:auto">'
                    +photoSlot(resolveFileUrl(issue.BeforeImage), 'Before', '#dc2626')
                    +photoSlot(resolveFileUrl(issue.TempImage), 'Temporary', '#f97316')
                    +photoSlot(resolveFileUrl(issue.AfterImage), 'After', '#059669')
                    +'</div>'
                    +'</div>').join('')
                +'</div>'
                +footer('Evidence '+(start + 1)+'-'+Math.min(start + slice.length, evidenceIssues.length))
            ));
        }
        if (approvalHistory.length) {
            const approvalEventLabel = type => ({
                CLOSE_REQUESTED: 'Close requested',
                CLOSE_APPROVED: 'Close approved',
                CLOSE_REJECTED: 'Close rejected',
                CLOSED: 'Closed',
            }[type] || type);
            const approvalRowsPerPage = 22;
            for (let start = 0; start < approvalHistory.length; start += approvalRowsPerPage) {
                const slice = approvalHistory.slice(start, start + approvalRowsPerPage);
                const rangeLabel = `${start + 1}-${Math.min(start + slice.length, approvalHistory.length)} / ${approvalHistory.length}`;
                const rows = slice.map((event, idx) => '<tr style="background:'+((start + idx) % 2 ? '#fff' : '#f8fafc')+';border-bottom:1px solid #e5e7eb">'
                    +'<td style="'+K+'padding:7px;text-align:center;font-size:8.5px;color:#64748b">'+(start + idx + 1)+'</td>'
                    +'<td style="'+K+'padding:7px;font-size:8.5px;font-weight:900;color:#0f172a">#'+escHtml(event.IssueID || '-')+'</td>'
                    +'<td style="'+K+'padding:7px;font-size:8.5px;color:#334155">'+escHtml(approvalEventLabel(event.EventType))+'</td>'
                    +'<td style="'+K+'padding:7px;font-size:8.5px;color:#475569">'+escHtml(event.ActorName || event.ActorID || '-')+'</td>'
                    +'<td style="'+K+'padding:7px;font-size:8.5px;color:#475569">'+escHtml(event.FromStatus || '-')+' &rarr; '+escHtml(event.ToStatus || '-')+'</td>'
                    +'<td style="'+K+'padding:7px;font-size:8.2px;color:#475569;line-height:1.3">'+pdfText(event.Comment, 90)+'</td>'
                    +'<td style="'+K+'padding:7px;font-size:8.2px;color:#64748b;white-space:nowrap">'+escHtml(_issueExportDateTime(event.CreatedAt))+'</td>'
                    +'</tr>').join('');
                formalPages.push(page(
                    header('Close Approval History / Audit Trail | '+rangeLabel)
                    +'<div style="flex:1;padding:18px 28px 14px;display:flex;flex-direction:column;gap:10px;min-height:0">'
                    +sectionTitle((isFullReport ? '9' : '7')+'. Close Approval History', 'Request, approval and rejection events from patrol_issue_events')
                    +'<div style="background:#fff;border:1px solid #e2e8f0;border-bottom:2px solid #065f46;border-radius:12px;overflow:hidden">'
                    +'<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#065f46;color:#fff">'
                    +'<th style="'+K+'padding:8px;font-size:8.2px;width:28px">No.</th><th style="'+K+'padding:8px;font-size:8.2px;text-align:left;width:48px">Issue</th>'
                    +'<th style="'+K+'padding:8px;font-size:8.2px;text-align:left;width:86px">Event</th><th style="'+K+'padding:8px;font-size:8.2px;text-align:left;width:90px">Actor</th>'
                    +'<th style="'+K+'padding:8px;font-size:8.2px;text-align:left;width:88px">Status change</th><th style="'+K+'padding:8px;font-size:8.2px;text-align:left">Comment / reason</th>'
                    +'<th style="'+K+'padding:8px;font-size:8.2px;text-align:left;width:92px">Date & time</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
                    +'</div>'+footer('Approval History '+rangeLabel)
                ));
            }
        }
        formalPages.push(page(
            header('Approval / สรุปเพื่อรับรองและลงนาม')
            +'<div style="flex:1;padding:18px 28px 18px;display:flex;flex-direction:column;gap:14px">'
            +sectionTitle((isFullReport ? '10' : '8')+'. Follow-up Notes / Approval', 'สรุปสถานะประเด็น Safety Patrol เพื่อรับรองและติดตามต่อ')
            +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">'
            +kpi('Open', counts.open, counts.open ? '#dc2626' : '#64748b', 'รอแก้ไข')
            +kpi('Temporary', counts.temp, counts.temp ? '#ea580c' : '#64748b', 'แก้ชั่วคราว')
            +kpi('Closed', counts.closed, '#059669', 'เสร็จสิ้น')
            +kpi('Rank A', byRank.A, byRank.A ? '#dc2626' : '#64748b', 'เร่งด่วนสูง')
            +'</div>'
            +'<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:15px 16px">'
            +'<div style="'+K+'font-size:12.5px;font-weight:900;color:#065f46;margin-bottom:8px">Approval Summary / สรุปเพื่อการรับรอง</div>'
            +'<div style="'+K+'font-size:10.8px;line-height:1.85;color:#334155">รายงานนี้ครอบคลุมประเด็นปัญหา '+filtered.length+' รายการ แบ่งเป็นรอแก้ไข '+counts.open+' รายการ แก้ชั่วคราว '+counts.temp+' รายการ และเสร็จสิ้น '+counts.closed+' รายการ คิดเป็นอัตราปิดงาน '+closePct+'% โดยมี Rank A '+byRank.A+' รายการ สถานะ Audit readiness คือ '+auditStatus+' จากรายการเกินกำหนด '+overdueIssues.length+' รายการ, ครบกำหนดใน 3 วัน '+dueSoonIssues.length+' รายการ และ Rank A ยังไม่ปิด '+rankAOpenIssues.length+' รายการ</div>'
            +'</div>'
            +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
            +'<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px"><div style="'+K+'font-size:11.5px;font-weight:900;color:#065f46;margin-bottom:7px">Key Follow-up / งานที่ต้องตาม</div><div style="'+K+'font-size:10px;line-height:1.7;color:#475569">ติดตามรายการที่ยังไม่ปิดงานทั้งหมด '+activeIssues+' รายการ โดยให้ความสำคัญกับ Overdue '+overdueIssues.length+', Due soon '+dueSoonIssues.length+', และ Open Rank A '+rankAOpenIssues.length+' รายการ</div></div>'
            +'<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px"><div style="'+K+'font-size:11.5px;font-weight:900;color:#065f46;margin-bottom:7px">Report Scope / ขอบเขตรายงาน</div><div style="'+K+'font-size:10px;line-height:1.7;color:#475569">ช่วงข้อมูล: '+escHtml(dateRange)+'<br>ตัวกรอง: '+escHtml(filterLabel)+'<br>Audit readiness: '+escHtml(auditStatus)+'<br>เลขที่เอกสาร: '+docNo+'</div></div>'
            +'</div>'
            +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:4px">'
            +['ผู้จัดทำรายงาน','ผู้ตรวจสอบ','ผู้อนุมัติ'].map(role => '<div style="background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:44px 14px 16px;text-align:center"><div style="border-bottom:1.2px solid #64748b;margin-bottom:12px;height:1px"></div><div style="'+K+'font-size:10px;color:#64748b">(........................................)</div><div style="'+K+'font-size:11px;font-weight:900;color:#334155;margin-top:8px">'+role+'</div><div style="'+K+'font-size:9px;color:#64748b;margin-top:8px">วันที่ ......../......../.........</div></div>').join('')
            +'</div>'
            +'<div style="margin-top:auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;color:#64748b;font-size:8.8px;line-height:1.6">เอกสารฉบับนี้สร้างจากระบบ TSH Safety Core Activity โดยอ้างอิงข้อมูลประเด็น Safety Patrol ตามตัวกรองในหน้าจอ ณ วันที่สร้างรายงาน เลขที่เอกสาร '+docNo+'</div>'
            +'</div>'
            +footer('Approval')
        ));
        const renderFormalPage = async html => {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1';
            el.innerHTML = html;
            document.body.appendChild(el);
            try {
                const pageEl = el.firstElementChild;
                const pageImages = Array.from(pageEl.querySelectorAll('img'));
                await Promise.all(pageImages.map(async img => {
                    if (!img.complete) {
                        await Promise.race([
                            new Promise(resolve => {
                                img.addEventListener('load', resolve, { once: true });
                                img.addEventListener('error', resolve, { once: true });
                            }),
                            new Promise(resolve => setTimeout(resolve, 7000)),
                        ]);
                    }
                    if (img.complete && img.naturalWidth > 0 && typeof img.decode === 'function') {
                        await Promise.race([
                            img.decode().catch(() => {}),
                            new Promise(resolve => setTimeout(resolve, 2500)),
                        ]);
                    }
                }));
                await new Promise(r => setTimeout(r, 80));
                return await html2canvas(pageEl, {
                    scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', windowWidth: 794, width: 794, height: 1122,
                });
            } finally {
                if (el.isConnected) el.remove();
            }
        };
        try {
            const totalPgs = formalPages.length;
            showLoading(`กำลังสร้าง PDF... (${totalPgs} หน้า)`);
            await document.fonts.ready;
            await new Promise(r => setTimeout(r, 300));
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            for (let pi = 0; pi < formalPages.length; pi++) {
                if (pi > 0) pdf.addPage();
                showLoading(`กำลังสร้าง PDF... หน้า ${pi + 1} / ${totalPgs}`);
                _setIssueExportBusy(exportKind, true, `กำลังสร้าง ${reportLabel} หน้า ${pi + 1} / ${totalPgs}`);
                const canvas = await renderFormalPage(formalPages[pi]);
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 210, 297);
            }
            for (let p = 1; p <= totalPgs; p++) {
                pdf.setPage(p);
                pdf.setFontSize(7.5); pdf.setTextColor(148,163,184);
                pdf.text('Page '+p+' / '+totalPgs, 200, 293, { align:'right' });
                pdf.text(docNo, 10, 293);
            }
            pdf.save(pdfFileName);
            showToast(`ส่งออก ${reportLabel} สำเร็จ: ${pdfFileName} (${filtered.length} ประเด็น, ${totalPgs} หน้า)`, 'success');
        } catch (err) {
            throw new Error(getReadableError(err, 'ส่งออก PDF ไม่สำเร็จ'));
        }
        return;
    }

}

// ─── Export to Excel ──────────────────────────────────────────────────────────
async function exportPatrolOverviewExcel(group = 'top_management') {
    if (!window.XLSX) { showToast('ไม่พบ SheetJS library / SheetJS library not found', 'error'); return; }
    const isSupervisor = group === 'supervisor';
    const year = isSupervisor
        ? parseInt(document.getElementById('sv-year-select')?.value || _svOverviewYear || new Date().getFullYear(), 10)
        : parseInt(document.getElementById('overview-year-select')?.value || _overviewYear || new Date().getFullYear(), 10);
    const groupLabel = isSupervisor ? 'Sec. & Supervisor' : 'Top & Management';

    try {
        showLoading(`กำลังเตรียม Excel ${groupLabel}... / Preparing Excel...`);
        let members = [];
        let summary = {};
        if (isSupervisor) {
            if (_svAllMembers.length && _svOverviewYear === year) members = _svAllMembers;
            else {
                const res = await API.get(`/patrol/supervisor-overview?year=${year}`);
                members = normalizeApiArray(res?.data ?? res) || [];
            }
            const totalRequired = members.reduce((sum, m) => sum + _patrolOverviewRequired(m, true), 0);
            const totalAttended = members.reduce((sum, m) => sum + _patrolOverviewAttended(m, true), 0);
            summary = {
                groupLabel,
                year,
                memberCount: members.length,
                totalRequired,
                totalAttended,
                completedMembers: members.filter(m => _patrolOverviewFinalInfo(m, true).label !== 'Below').length,
                percent: totalRequired > 0 ? Math.round(totalAttended * 100 / totalRequired) : 0,
                acceptedCoverage: members.reduce((sum, m) => sum + _patrolOverviewLeave(m, true, 'acceptedCoverageToDate', _patrolOverviewAttended(m, true)), 0),
                leaveUsed: members.reduce((sum, m) => sum + _patrolOverviewLeave(m, true, 'leaveYear'), 0),
                allowedLeave: members.reduce((sum, m) => sum + _patrolOverviewLeave(m, true, 'allowedLeaveYear'), 0),
                overLeave: members.reduce((sum, m) => sum + _patrolOverviewLeave(m, true, 'overLeaveYear'), 0),
            };
        } else {
            let overview = (_overviewData && _overviewYear === year) ? _overviewData : null;
            if (!overview) {
                const res = await API.get(`/patrol/attendance-overview?year=${year}`);
                overview = res?.data || null;
            }
            members = normalizeApiArray(overview?.members || []) || [];
            summary = {
                groupLabel,
                year,
                memberCount: members.length,
                totalRequired: Number(overview?.summary?.requiredToDate ?? overview?.summary?.totalSessions ?? 0),
                totalAttended: Number(overview?.summary?.completedToDate ?? overview?.summary?.totalAttended ?? 0),
                completedMembers: members.filter(m => _patrolOverviewFinalInfo(m, false).label !== 'Below').length,
                percent: Number(overview?.summary?.progressToDatePct ?? overview?.summary?.percent ?? 0),
                acceptedCoverage: Number(overview?.summary?.acceptedCoverageToDateTotal || members.reduce((sum, m) => sum + _patrolOverviewLeave(m, false, 'acceptedCoverageToDate', _patrolOverviewAttended(m, false)), 0)),
                leaveUsed: Number(overview?.summary?.leaveYearTotal || members.reduce((sum, m) => sum + _patrolOverviewLeave(m, false, 'leaveYear'), 0)),
                allowedLeave: Number(overview?.summary?.allowedLeaveYearTotal || members.reduce((sum, m) => sum + _patrolOverviewLeave(m, false, 'allowedLeaveYear'), 0)),
                overLeave: Number(overview?.summary?.overLeaveYearTotal || members.reduce((sum, m) => sum + _patrolOverviewLeave(m, false, 'overLeaveYear'), 0)),
            };
        }

        if (!members.length) {
            showToast(`ไม่มีข้อมูล ${groupLabel} สำหรับส่งออก / No records to export`, 'warning');
            return;
        }

        const rows = _patrolOverviewExcelRows(members, isSupervisor);
        const summaryRows = [
            { Field: 'Group', Value: groupLabel },
            { Field: 'Year', Value: year },
            { Field: 'Members', Value: summary.memberCount },
            { Field: 'Attended / Required to date', Value: `${summary.totalAttended}/${summary.totalRequired}` },
            { Field: 'Accepted coverage / Required to date', Value: `${summary.acceptedCoverage}/${summary.totalRequired}` },
            { Field: 'Leave used / Allowed leave', Value: `${summary.leaveUsed}/${summary.allowedLeave}` },
            { Field: 'Over leave', Value: summary.overLeave },
            { Field: 'Completion % to date', Value: `${summary.percent}%` },
            { Field: 'Members accepted/pass to-date target', Value: summary.completedMembers },
            { Field: 'Record format', Value: 'Checked + accepted leave is shown separately from actual checked count' },
        ];

        const wb = XLSX.utils.book_new();
        const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
        const wsRecords = XLSX.utils.json_to_sheet(rows);
        wsSummary['!cols'] = [{ wch: 30 }, { wch: 44 }];
        wsRecords['!cols'] = [
            { wch: 8 },
            { wch: 18 },
            { wch: 30 },
            { wch: 42 },
            { wch: 32 },
            { wch: 22 },
            { wch: 18 },
            { wch: 24 },
            { wch: 18 },
            { wch: 12 },
        ];
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
        XLSX.utils.book_append_sheet(wb, wsRecords, 'Records');
        XLSX.writeFile(wb, `Safety_Patrol_${isSupervisor ? 'Supervisor' : 'Top_Management'}_${year}.xlsx`);
        showToast(`ส่งออก Excel สำเร็จ / Exported ${rows.length} records`, 'success');
    } catch (err) {
        showToast(err?.message || 'ส่งออก Excel ไม่สำเร็จ / Cannot export Excel', 'error');
    } finally {
        hideLoading();
    }
}

function _patrolOverviewExcelRows(members, isSupervisor) {
    const sorted = [...members].sort((a, b) => {
        const deptCompare = String(a.Department || '').localeCompare(String(b.Department || ''), 'th');
        if (isSupervisor && deptCompare) return deptCompare;
        const requiredCompare = _patrolOverviewRequired(a, isSupervisor) - _patrolOverviewRequired(b, isSupervisor);
        if (requiredCompare) return requiredCompare;
        return String(_patrolOverviewName(a, isSupervisor)).localeCompare(String(_patrolOverviewName(b, isSupervisor)), 'th');
    });
    return sorted.map((m, index) => {
        const attended = _patrolOverviewAttended(m, isSupervisor);
        const required = _patrolOverviewRequired(m, isSupervisor);
        const yearlyTarget = _patrolOverviewYearlyTarget(m, isSupervisor);
        const percent = required > 0 ? Math.round(attended * 100 / required) : 0;
        const leaveYear = _patrolOverviewLeave(m, isSupervisor, 'leaveYear');
        const allowedLeave = _patrolOverviewLeave(m, isSupervisor, 'allowedLeaveYear');
        const acceptedLeave = _patrolOverviewLeave(m, isSupervisor, 'acceptedLeaveYear');
        const leaveRemaining = _patrolOverviewLeave(m, isSupervisor, 'leaveRemainingYear');
        const overLeave = _patrolOverviewLeave(m, isSupervisor, 'overLeaveYear');
        const acceptedCoverage = _patrolOverviewLeave(m, isSupervisor, 'acceptedCoverageToDate', attended);
        const acceptedPct = _patrolOverviewLeave(m, isSupervisor, 'acceptedCoverageToDatePct', percent);
        const passPct = _patrolOverviewPassPct(m, isSupervisor);
        const threshold = _patrolOverviewPassThreshold(m, isSupervisor);
        const final = _patrolOverviewFinalInfo(m, isSupervisor);
        return {
            'No.': index + 1,
            'รหัสพนักงาน / Employee ID': m.EmployeeID || '',
            'ชื่อ': _patrolOverviewName(m, isSupervisor),
            'ตำแหน่ง': m.Position || '',
            'แผนก': m.Department || '',
            'Safety Patrol Record': `${attended}/${required} (${yearlyTarget})`,
            'เข้าร่วม / Attended': attended,
            'ตารางถึงปัจจุบัน / Scheduled to date': required,
            'เป้าปี / Yearly Target': yearlyTarget,
            '% To Date': `${percent}%`,
            'Pass % Target': `${passPct}%`,
            'Pass Threshold To Date': threshold,
            'Leave Used': leaveYear,
            'Leave Allowed': allowedLeave,
            'Accepted Leave': acceptedLeave,
            'Leave Remaining': leaveRemaining,
            'Over Leave': overLeave,
            'Accepted Coverage': acceptedCoverage,
            'Accepted Coverage %': `${acceptedPct}%`,
            'Final Status': final.label,
        };
    });
}

function _patrolOverviewName(row, isSupervisor) {
    return isSupervisor ? (row.EmployeeName || row.Name || '') : (row.Name || row.EmployeeName || '');
}

function _patrolOverviewAttended(row, isSupervisor) {
    return Number(isSupervisor
        ? (row.attended ?? row.completedToDateCapped ?? row.CompletedToDate ?? 0)
        : (row.Attended ?? row.CompletedToDate ?? row.CompletedScheduled ?? 0)) || 0;
}

function _patrolOverviewRequired(row, isSupervisor) {
    return Number(isSupervisor
        ? (row.target ?? row.requiredToDate ?? row.RequiredToDate ?? 0)
        : (row.Total ?? row.RequiredToDate ?? row.requiredToDate ?? 0)) || 0;
}

function _patrolOverviewYearlyTarget(row, isSupervisor) {
    return Number(isSupervisor
        ? (row.yearlyTarget ?? row.YearlyTarget ?? row.TargetPerYear ?? row.target ?? 0)
        : (row.YearlyTarget ?? row.TargetPerYear ?? row.yearlyTarget ?? row.Total ?? 0)) || 0;
}

function _patrolOverviewPassPct(row, isSupervisor) {
    return Number(isSupervisor ? (row.passPct ?? row.PassPct ?? 80) : (row.PassPct ?? row.passPct ?? 80)) || 80;
}

function _patrolOverviewLeave(row, isSupervisor, key, fallback = 0) {
    const map = isSupervisor
        ? {
            leaveYear: ['leaveYear', 'LeaveYear'],
            allowedLeaveYear: ['allowedLeaveYear', 'AllowedLeaveYear'],
            acceptedLeaveYear: ['acceptedLeaveYear', 'AcceptedLeaveYear'],
            leaveRemainingYear: ['leaveRemainingYear', 'LeaveRemainingYear'],
            overLeaveYear: ['overLeaveYear', 'OverLeaveYear'],
            acceptedCoverageToDate: ['acceptedCoverageToDate', 'AcceptedCoverageToDate'],
            acceptedCoverageYear: ['acceptedCoverageYear', 'AcceptedCoverageYear'],
            acceptedCoverageToDatePct: ['acceptedCoverageToDatePct', 'AcceptedCoverageToDatePct'],
        }
        : {
            leaveYear: ['LeaveYear', 'leaveYear'],
            allowedLeaveYear: ['AllowedLeaveYear', 'allowedLeaveYear'],
            acceptedLeaveYear: ['AcceptedLeaveYear', 'acceptedLeaveYear'],
            leaveRemainingYear: ['LeaveRemainingYear', 'leaveRemainingYear'],
            overLeaveYear: ['OverLeaveYear', 'overLeaveYear'],
            acceptedCoverageToDate: ['AcceptedCoverageToDate', 'acceptedCoverageToDate'],
            acceptedCoverageYear: ['AcceptedCoverageYear', 'acceptedCoverageYear'],
            acceptedCoverageToDatePct: ['AcceptedCoverageToDatePct', 'acceptedCoverageToDatePct'],
        };
    const keys = map[key] || [key];
    for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && row[k] !== '') return Number(row[k]) || 0;
    }
    return fallback;
}

function _patrolOverviewPassThreshold(row, isSupervisor) {
    const explicit = Number(isSupervisor ? (row.passThresholdToDate ?? row.PassThresholdToDate) : (row.PassThresholdToDate ?? row.passThresholdToDate));
    if (explicit) return explicit;
    return Math.ceil(_patrolOverviewRequired(row, isSupervisor) * _patrolOverviewPassPct(row, isSupervisor) / 100);
}

function _patrolOverviewFinalInfo(row, isSupervisor) {
    const status = String(isSupervisor ? (row.finalStatus ?? row.FinalStatus ?? '') : (row.FinalStatus ?? row.finalStatus ?? '')).trim();
    const actualPass = Boolean(isSupervisor ? (row.actualPassToDate ?? row.ActualPassToDate) : (row.ActualPassToDate ?? row.actualPassToDate));
    const acceptedPass = Boolean(isSupervisor ? (row.acceptedPassToDate ?? row.AcceptedPassToDate) : (row.AcceptedPassToDate ?? row.acceptedPassToDate));
    const computed = status || (actualPass ? 'Pass' : acceptedPass ? 'Accepted by leave' : 'Below target');
    if (computed === 'Pass') return { label: 'Pass', cls: 'bg-emerald-100 text-emerald-700', color: '#047857', bg: '#d1fae5' };
    if (computed === 'Accepted by leave') return { label: 'Accepted', cls: 'bg-sky-100 text-sky-700', color: '#0369a1', bg: '#e0f2fe' };
    return { label: 'Below', cls: 'bg-red-50 text-red-600', color: '#991b1b', bg: '#fee2e2' };
}

function _issueExportDateTime(value) {
    if (!value) return '';
    const d = new Date(value);
    return isNaN(d) ? String(value) : d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

async function _loadIssueApprovalHistory(issues = []) {
    const approvalTypes = new Set(['CLOSE_REQUESTED', 'CLOSE_APPROVED', 'CLOSE_REJECTED', 'CLOSED']);
    const results = await Promise.all(issues.map(async issue => {
        const id = issue?.IssueID || issue?.issueid;
        if (!id) return [];
        try {
            const response = await API.get(`/patrol/issue/${encodeURIComponent(id)}/events`);
            return normalizeApiArray(response).filter(event => approvalTypes.has(String(event.EventType || '').toUpperCase()));
        } catch (_) {
            return [];
        }
    }));
    return results.flat().sort((a, b) => new Date(a.CreatedAt || 0) - new Date(b.CreatedAt || 0));
}

async function exportIssuesToExcel() {
    return _runIssueExport('excel', _exportIssuesToExcel);
}

async function _exportIssuesToExcel() {
    if (!window.XLSX) { showToast('ไม่พบ SheetJS library', 'error'); return; }
    const filtered = _issueSortedItems(getFilteredIssues(_allIssues, _activeFilter));
    if (!filtered.length) { showToast('ไม่มีข้อมูลที่จะส่งออก', 'error'); return; }
    showLoading('กำลังโหลดข้อมูลและประวัติอนุมัติสำหรับ Excel...');
    const approvalHistory = await _loadIssueApprovalHistory(filtered);

    const rows = filtered.map(raw => {
        const i = normalizeApiObject(raw);
        return {
            'ID':               i.IssueID || '',
            'วันที่พบ':          _issueFoundDate(i) ? new Date(_issueFoundDate(i)).toLocaleDateString('th-TH') : '',
            'พื้นที่':           i.Area || '',
            'เครื่องมือ / เครื่องจักร': i.MachineName || '',
            'ประเภทอันตราย':     _formatIssueHazardTypes(i.HazardType, ''),
            'คำอธิบาย':          i.HazardDescription || '',
            'Rank (A/B/C)':      i.Rank || '',
            'วันกำหนด':          i.DueDate ? new Date(i.DueDate).toLocaleDateString('th-TH') : '',
            'ส่วนงานรับผิดชอบ':  _formatIssueMulti(i.ResponsibleDept, ''),
            'Safety Unit':       _formatIssueMulti(i.ResponsibleUnit, ''),
            'การแก้ไขชั่วคราว':  i.TempDescription || '',
            'วันที่แก้ไขชั่วคราว': i.TempDate ? new Date(i.TempDate).toLocaleDateString('th-TH') : '',
            'การแก้ไขถาวร':      i.ActionDescription || '',
            'วันปิดงาน':         i.FinishDate ? new Date(i.FinishDate).toLocaleDateString('th-TH') : '',
            'สถานะ':             i.CurrentStatus === 'Closed' ? 'เสร็จสิ้น' : i.CurrentStatus === 'Temporary' ? 'แก้ชั่วคราว' : 'รอแก้ไข',
            'Close Approval Status': _issueApprovalStatus(i),
            'Close Requested By': i.CloseRequesterName || i.CloseRequestedBy || '',
            'Close Requested At': _issueExportDateTime(i.CloseRequestedAt),
            'Close Approved By': i.CloseApproverName || i.CloseApprovedBy || '',
            'Close Approved At': _issueExportDateTime(i.CloseApprovedAt),
            'Close Rejected By': i.CloseRejecterName || i.CloseRejectedBy || '',
            'Close Rejected At': _issueExportDateTime(i.CloseRejectedAt),
            'Close Reject Reason': i.CloseRejectReason || '',
            'ผู้รายงาน':         i.ReporterName || '',
            'ทีมผู้รายงาน':      i.ReporterTeam || i.FoundByTeam || '',
            'ส่วนงานผู้รายงาน':  i.ReporterDepartment || '',
            'ภาพก่อนแก้ไข':      i.BeforeImage || '',
            'ภาพแก้ไขชั่วคราว':  i.TempImage || '',
            'ภาพหลังแก้ไข':      i.AfterImage || '',
        };
    });

    showLoading('กำลังสร้างไฟล์ Excel...');
    _setIssueExportBusy('excel', true, `กำลังสร้าง Excel จำนวน ${filtered.length} รายการ`);
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    ws['!autofilter'] = { ref: ws['!ref'] };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ทะเบียนปัญหา');
    const approvalRows = approvalHistory.map(event => ({
        'Event ID': event.id || '',
        'Issue ID': event.IssueID || '',
        'Event': event.EventType || '',
        'Actor ID': event.ActorID || '',
        'Actor Name': event.ActorName || '',
        'Actor Role': event.ActorRole || '',
        'From Status': event.FromStatus || '',
        'To Status': event.ToStatus || '',
        'Comment / Reject Reason': event.Comment || '',
        'Date & Time': _issueExportDateTime(event.CreatedAt),
    }));
    const approvalSheet = approvalRows.length
        ? XLSX.utils.json_to_sheet(approvalRows)
        : XLSX.utils.aoa_to_sheet([['Close Approval History'], ['No approval events for the selected issues.']]);
    XLSX.utils.book_append_sheet(wb, approvalSheet, 'Approval History');
    const noteSheet = XLSX.utils.aoa_to_sheet([
        ['หมายเหตุ'],
        ['จำนวนปัญหารวมและสถานะนับตาม IssueID โดยไม่คูณรายการ'],
        ['STOP และส่วนงาน/Unit แบบหลายค่าอาจทำให้ IssueID เดียวถูกนับในหลายกลุ่มของรายงานแยกประเภท'],
    ]);
    XLSX.utils.book_append_sheet(wb, noteSheet, 'หมายเหตุ');
    const yearSuffix = _issueYear === 'all' ? 'all-years' : _issueYear;
    const fileName = `patrol_issues_${yearSuffix}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`ส่งออกสำเร็จ ${filtered.length} รายการ`, 'success');
}

// ─── Patrol Rank & Stop Summary (Issues Tab) ─────────────────────────────────
function renderRankStopSummary() {
    const el = document.getElementById('patrol-rank-stop-summary');
    if (!el) return;

    // Count from context pool (dept/unit/status/search filtered) but NOT rank/stop
    // so cards show counts matching the table context, and clicking further filters
    const savedRank = _filterRank;
    const savedStop = _filterStop;
    const savedStops = [..._filterStops];
    _filterRank = '';
    _filterStop = 0;
    _filterStops = [];
    const contextPool = getFilteredIssues(_allIssues, _activeFilter);
    _filterRank = savedRank;
    _filterStop = savedStop;
    _filterStops = savedStops;

    // Count Rank from context pool (respects dept/unit/status/search filters)
    const byRank = { A: 0, B: 0, C: 0 };
    contextPool.forEach(i => { if (byRank[i.Rank] !== undefined) byRank[i.Rank]++; });

    // Count StopType from context pool
    const byStop = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    contextPool.forEach(i => {
        _issueStopIds(i.HazardType).forEach(n => { if (byStop[n] !== undefined) byStop[n]++; });
    });

    const total = contextPool.length;
    const hasContextFilter = !!(_filterDepts.length || _filterUnits.length || _activeFilter !== 'all' || _searchQuery);
    const contextLabel = _filterDepts.length || _filterUnits.length
        ? `เฉพาะ: ${[..._filterDepts, ..._filterUnits].join(', ')}`
        : _activeFilter !== 'all'
            ? ({ open:'รอแก้ไข', temp:'แก้ชั่วคราว', closed:'เสร็จสิ้น', high:'Rank A', overdue:'เกินกำหนด' }[_activeFilter] || '')
            : '';

    el.innerHTML = `
    <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden" data-patrol-card-image="patrol-rank-stop-summary">
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-lg flex items-center justify-center" style="background:linear-gradient(135deg,#dc2626,#9f1239)">
            <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <span class="text-sm font-bold text-slate-700">สถิติปัญหาจากการตรวจ</span>
          ${hasContextFilter && contextLabel ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-semibold border border-indigo-100">${contextLabel}</span>` : ''}
        </div>
        <div class="flex items-center gap-2">
          ${(_filterRank || _filterStops.length) ? `<button onclick="window._issueClearRankStop()" data-patrol-card-ignore class="text-[10px] font-semibold text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>ล้างตัวกรอง</button>` : ''}
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${total === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'}">
            ${total} ประเด็น
          </span>
        </div>
      </div>
      <div class="p-4 space-y-4">

        <!-- Rank A/B/C -->
        <div>
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">ระดับความรุนแรง (Rank) · คลิกเพื่อกรอง</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            ${CCCF_RANKS.map(r => {
              const cnt = byRank[r.rank] || 0;
              const isActive = _filterRank === r.rank;
              return `
              <button onclick="window._issueFilterRank('${r.rank}')"
                class="rounded-xl p-3 border-2 flex items-center gap-2.5 text-left w-full transition-all hover:shadow-md active:scale-[0.98] ${isActive ? 'ring-2 ring-offset-1' : 'opacity-80 hover:opacity-100'}"
                style="background:${isActive ? r.bg : '#fafafa'};border-color:${isActive ? r.color : '#e2e8f0'};${isActive ? `ring-color:${r.color}` : ''}">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 text-white transition-all" style="background:${r.color};${isActive ? 'box-shadow:0 0 0 3px '+r.color+'40' : ''}">${r.rank}</div>
                <div class="min-w-0">
                  <p class="text-xl font-black leading-none" style="color:${isActive ? r.color : (cnt > 0 ? r.color : '#94a3b8')}">${cnt}</p>
                  <p class="text-[10px] font-semibold mt-0.5 leading-snug truncate" style="color:${isActive ? r.color : '#64748b'}">${r.desc}</p>
                  <p class="text-[9px] mt-0.5" style="color:${isActive ? r.color+'aa' : '#94a3b8'}">${r.detail}</p>
                </div>
              </button>`;
            }).join('')}
          </div>
        </div>

        <!-- Stop 1-6 -->
        <div>
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">อันตราย 6 ประการ (Stop 1–6) · คลิกเพื่อกรอง</p>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            ${CCCF_STOP_TYPES.map(s => {
              const cnt = byStop[s.id] || 0;
              const isActive = _filterStops.includes(s.id);
              return `
              <button onclick="window._issueFilterStop(${s.id})"
                class="rounded-xl p-3 border flex items-center gap-2.5 text-left w-full transition-all hover:shadow-md active:scale-[0.98] ${isActive ? 'ring-2 ring-offset-1' : 'opacity-80 hover:opacity-100'}"
                style="background:${isActive ? s.bg : '#fafafa'};border-color:${isActive ? s.color : '#e2e8f0'}">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all" style="background:${s.color}${isActive ? '33' : '18'}">
                  <svg class="w-4 h-4" fill="none" stroke="${s.color}" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="${s.icon}"/></svg>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-bold" style="color:${s.color}">${s.code}</span>
                    <span class="text-base font-black leading-none" style="color:${isActive || cnt > 0 ? s.color : '#94a3b8'}">${cnt}</span>
                  </div>
                  <p class="text-[9px] mt-0.5 leading-snug truncate" style="color:${isActive ? s.color : '#64748b'}">${s.label}</p>
                </div>
              </button>`;
            }).join('')}
          </div>
        </div>

      </div>
    </div>`;
}

function renderAreaFollowup() {
    const el = document.getElementById('patrol-area-followup');
    if (!el) return;

    const areaMap = new Map();
    _allIssues.forEach(issue => {
        const area = String(issue.Area || 'Unspecified').trim() || 'Unspecified';
        if (!areaMap.has(area)) {
            areaMap.set(area, { area, found: 0, closed: 0, open: 0, temp: 0, overdue: 0, rankA: 0 });
        }
        const row = areaMap.get(area);
        const status = String(issue.CurrentStatus || '').toLowerCase();
        row.found++;
        if (status === 'closed') row.closed++;
        else if (status === 'temporary') row.temp++;
        else row.open++;
        if ((issue.Rank || '').toUpperCase() === 'A') row.rankA++;
        if (_rankAHotspotIssueOverdue(issue)) row.overdue++;
    });

    const rows = Array.from(areaMap.values())
        .filter(row => row.found > 0)
        .sort((a, b) => (b.open + b.temp + b.overdue + b.rankA) - (a.open + a.temp + a.overdue + a.rankA) || b.found - a.found)
        .slice(0, 4);
    const totalOpen = rows.reduce((sum, row) => sum + row.open + row.temp, 0);
    const totalOverdue = rows.reduce((sum, row) => sum + row.overdue, 0);

    el.innerHTML = `
    <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-5" data-patrol-card-image="patrol-area-followup">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 class="font-bold text-slate-700 text-sm">Area Follow-up</h3>
          <p class="text-[10px] font-bold text-slate-400">Open, overdue and Rank A focus from Patrol issues</p>
        </div>
        <div class="flex gap-2">
          <span class="rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-1 text-[10px] font-black text-orange-700">${totalOpen} open</span>
          <span class="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-700">${totalOverdue} overdue</span>
        </div>
      </div>
      <div class="space-y-2">
        ${rows.length ? rows.map(row => {
            const closePct = row.found ? Math.round(row.closed * 100 / row.found) : 0;
            const riskTone = row.overdue || row.rankA ? 'border-red-100 bg-red-50/50' : (row.open + row.temp) ? 'border-orange-100 bg-orange-50/40' : 'border-emerald-100 bg-emerald-50/40';
            const barColor = row.overdue || row.rankA ? '#ef4444' : (row.open + row.temp) ? '#f97316' : '#10b981';
            return `
            <button type="button" onclick="window._issueFilterArea('${_rankAHotspotArg(row.area)}')" class="w-full rounded-xl border ${riskTone} px-3 py-2 text-left transition-transform hover:-translate-y-0.5 hover:shadow-sm">
              <div class="mb-1 flex items-center justify-between gap-2">
                <span class="min-w-0 truncate text-xs font-black text-slate-700">${escHtml(row.area)}</span>
                <span class="flex-shrink-0 text-[11px] font-black text-slate-500">${closePct}% closed</span>
              </div>
              <div class="mb-2 h-2 overflow-hidden rounded-full bg-white">
                <div class="h-full rounded-full" style="width:${closePct}%;background:${barColor}"></div>
              </div>
              <div class="flex flex-wrap gap-1 text-[9px] font-bold">
                <span class="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-500">Found ${row.found}</span>
                <span class="rounded-full bg-orange-100 px-1.5 py-0.5 text-orange-700">Open ${row.open + row.temp}</span>
                ${row.rankA ? `<span class="rounded-full bg-red-100 px-1.5 py-0.5 text-red-700">Rank A ${row.rankA}</span>` : ''}
                ${row.overdue ? `<span class="rounded-full bg-red-100 px-1.5 py-0.5 text-red-700">Overdue ${row.overdue}</span>` : ''}
              </div>
            </button>`;
        }).join('') : `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs font-bold text-slate-300">No Patrol issue area to follow up</div>`}
      </div>
    </div>`;
}

// ─── Area Stats (Issues Tab) ──────────────────────────────────────────────────
function renderAreaStats() {
    const tbody = document.getElementById('dashboard-section-body');
    if (!tbody) return;

    const allAreaNames = _patrolAreas.map(a => a.Name || a.AreaName).filter(Boolean);
    if (!allAreaNames.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-xs text-slate-300">ยังไม่มีพื้นที่ใน Master Data</td></tr>`;
        renderAreaFollowup();
        return;
    }

    const toShow = _areaStatSel ? allAreaNames.filter(n => _areaStatSel.includes(n)) : allAreaNames;
    if (!toShow.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-xs text-slate-300">ไม่มีข้อมูล — กด ⚙ เพื่อตั้งค่า</td></tr>`;
        _updateAreaBadge();
        renderAreaFollowup();
        return;
    }

    // Count from _allIssues
    const areaMap = {};
    for (const name of toShow) areaMap[name] = { found:0, achieved:0, onProcess:0 };
    _allIssues.forEach(issue => {
        const a = issue.Area || '';
        if (areaMap[a] !== undefined) {
            areaMap[a].found++;
            if (issue.CurrentStatus === 'Closed') areaMap[a].achieved++;
            else areaMap[a].onProcess++;
        }
    });

    tbody.innerHTML = toShow.map(area => {
        const r = areaMap[area];
        const isActive = _filterArea === area;
        return `<tr class="border-b border-slate-50 cursor-pointer transition-colors ${isActive ? 'bg-emerald-50 border-emerald-100' : 'hover:bg-slate-50'}"
            onclick="window._issueFilterArea('${area.replace(/'/g,"\\'")}')">
          <td class="px-3 py-2 text-[10px] font-medium max-w-[110px] truncate ${isActive ? 'text-emerald-700 font-bold' : 'text-slate-600'}" title="${area}">
            ${isActive ? `<span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 align-middle"></span>` : ''}${area}
          </td>
          <td class="px-2 py-2 text-center font-bold text-xs ${r.found === 0 ? 'text-slate-300' : isActive ? 'text-emerald-600' : 'text-slate-500'}">${r.found}</td>
          <td class="px-2 py-2 text-center font-bold text-xs ${r.achieved === 0 ? 'text-slate-300' : 'text-emerald-600'}">${r.achieved}</td>
          <td class="px-2 py-2 text-center font-bold text-xs ${r.onProcess === 0 ? 'text-slate-300' : 'text-orange-500'}">${r.onProcess}</td>
        </tr>`;
    }).join('');

    _updateAreaBadge();
    renderAreaFollowup();
    renderRankASpotlight();
}

function renderRankASpotlight() {
    const el = document.getElementById('rank-a-spotlight');
    if (!el) return;

    const rankAIssues = _allIssues.filter(i => (i.Rank || '').toUpperCase() === 'A');
    const total = rankAIssues.length;

    // All areas (same list as area stats, respect _areaStatSel)
    const allAreaNames = _patrolAreas.map(a => a.Name || a.AreaName).filter(Boolean);
    const areaList = (_areaStatSel && _areaStatSel.length) ? allAreaNames.filter(n => _areaStatSel.includes(n)) : allAreaNames;

    // Count Rank A per area
    const areaMap = {};
    for (const name of areaList) areaMap[name] = 0;
    rankAIssues.forEach(i => { const a = i.Area || ''; if (areaMap[a] !== undefined) areaMap[a]++; });
    const areaRows = areaList.map(name => [name, areaMap[name]]).sort((a, b) => b[1] - a[1]);
    const maxArea = Math.max(1, ...areaRows.map(r => r[1]));

    // Count Rank A per STOP (all 6 types always)
    const stopMap = {};
    STOP_TYPES.forEach(s => { stopMap[s.key] = 0; });
    rankAIssues.forEach(i => {
        const ids = _issueStopIds(i.HazardType);
        (ids.length ? ids : [6]).forEach(id => {
            const key = `STOP ${id}`;
            if (stopMap[key] !== undefined) stopMap[key]++;
        });
    });
    const maxStop = Math.max(1, ...STOP_TYPES.map(s => stopMap[s.key]));

    el.innerHTML = `
    <div class="flex items-center gap-2 mb-3">
      <span class="w-2 h-2 rounded-full ${total > 0 ? 'bg-red-500 animate-pulse' : 'bg-slate-300'} flex-shrink-0"></span>
      <h3 class="font-bold text-slate-700 text-sm flex-1">Rank A — จุดเฝ้าระวัง</h3>
      <span class="text-[10px] font-bold px-2 py-0.5 ${total > 0 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-slate-100 text-slate-400'} rounded-full">${total} รายการ</span>
    </div>

    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">แยกพื้นที่</p>
    <div class="space-y-1.5 mb-4">
      ${areaRows.length ? areaRows.map(([area, count]) => {
        const pct = Math.round((count / maxArea) * 100);
        const isActive = _filterArea === area;
        return `<div class="flex items-center gap-2 cursor-pointer rounded-lg px-1 py-0.5 hover:bg-red-50/60 transition-colors ${isActive ? 'bg-red-50' : ''}"
            onclick="window._issueFilterArea('${area.replace(/'/g, "\\'")}')">
          <span class="text-[10px] font-medium w-24 truncate flex-shrink-0 ${isActive ? 'font-bold text-red-700' : count > 0 ? 'text-slate-700' : 'text-slate-400'}" title="${area}">${area}</span>
          <div class="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div class="h-full rounded-full transition-all duration-500" style="width:${pct}%;background:linear-gradient(90deg,#ef4444,#f97316)"></div>
          </div>
          <span class="text-[11px] font-bold flex-shrink-0 w-4 text-right ${count > 0 ? 'text-red-600' : 'text-slate-300'}">${count}</span>
        </div>`;
      }).join('') : '<p class="text-xs text-slate-300 text-center py-2">ยังไม่มีพื้นที่ใน Master Data</p>'}
    </div>

    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">แยก STOP</p>
    <div class="space-y-1.5">
      ${STOP_TYPES.map(s => {
        const count = stopMap[s.key];
        const pct = Math.round((count / maxStop) * 100);
        return `<div class="flex items-center gap-2">
          <span class="text-[9px] font-bold w-7 flex-shrink-0 ${count > 0 ? 'text-slate-600' : 'text-slate-300'}">${s.key.replace('STOP ', 'ST')}</span>
          <div class="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div class="h-full rounded-full transition-all duration-500" style="width:${pct}%;background:linear-gradient(90deg,#dc2626,#ef4444)"></div>
          </div>
          <span class="text-[11px] font-bold flex-shrink-0 w-4 text-right ${count > 0 ? 'text-red-600' : 'text-slate-300'}">${count}</span>
        </div>`;
      }).join('')}
    </div>`;
}

function _setRankAHotspotPositions(rows) {
    _rankAHotspotPositions = {};
    (Array.isArray(rows) ? rows : []).forEach(row => {
        const key = _rankAHotspotKey(row.AreaName || row.areaName || row.area);
        if (key) _rankAHotspotPositions[key] = row;
    });
}

function _setRankAHotspotIssuePositions(rows) {
    _rankAHotspotIssuePositions = {};
    (Array.isArray(rows) ? rows : []).forEach(row => {
        const issueId = String(row.IssueID ?? row.issueId ?? '').trim();
        if (issueId) _rankAHotspotIssuePositions[issueId] = row;
    });
    _rankAHotspotDirtyIssueIds = new Set();
}

function _rankAHotspotIssuePositionValue(row, field) {
    if (!row) return NaN;
    if (field === 'x') return Number(row.MapXPercent ?? row.mapXPercent ?? row.x);
    return Number(row.MapYPercent ?? row.mapYPercent ?? row.y);
}

function _rankAHotspotIssuePositionsMatch(savedRows, expectedRows) {
    const savedMap = {};
    normalizeApiArray(savedRows).forEach(row => {
        const issueId = String(row.IssueID ?? row.issueId ?? '').trim();
        if (issueId) savedMap[issueId] = row;
    });
    return expectedRows.every(expected => {
        const issueId = String(expected.IssueID || '').trim();
        const saved = savedMap[issueId];
        if (!saved) return false;
        const dx = Math.abs(_rankAHotspotIssuePositionValue(saved, 'x') - Number(expected.MapXPercent));
        const dy = Math.abs(_rankAHotspotIssuePositionValue(saved, 'y') - Number(expected.MapYPercent));
        return dx <= 0.05 && dy <= 0.05;
    });
}

async function _rankAHotspotVerifyIssuePositionsAfterNetworkError(expectedRows) {
    try {
        const res = await API.get('/patrol/rank-a-hotspot-issue-positions');
        const rows = normalizeApiArray(res);
        if (!_rankAHotspotIssuePositionsMatch(rows, expectedRows)) return false;
        _setRankAHotspotIssuePositions(rows);
        _rankAHotspotIssueEditMode = false;
        _rankAHotspotDragIssueId = '';
        showToast('Saved Rank A issue positions. Network dropped after save, but read-back verified the latest positions.', 'success');
        renderRankASpotlight();
        return true;
    } catch (_) {
        return false;
    }
}

function _rankAHotspotKey(area) {
    return String(area || '').trim();
}

function _rankAHotspotArg(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function _rankAHotspotDefaultPoint(area, index) {
    const text = _rankAHotspotKey(area).toLowerCase();
    if (/\b1\b|factory 1|โรงงาน 1/.test(text)) return PATROL_RANK_A_DEFAULT_POINTS[0];
    if (/\b2\b|factory 2|โรงงาน 2/.test(text)) return PATROL_RANK_A_DEFAULT_POINTS[1];
    if (/\b3\b|factory 3|โรงงาน 3/.test(text)) return PATROL_RANK_A_DEFAULT_POINTS[2];
    if (/\b4\b|factory 4|โรงงาน 4/.test(text)) return PATROL_RANK_A_DEFAULT_POINTS[3];
    if (/รอบนอก|outside|external|ส่วนกลาง|common/.test(text)) return PATROL_RANK_A_DEFAULT_POINTS[4];
    return PATROL_RANK_A_DEFAULT_POINTS[index % PATROL_RANK_A_DEFAULT_POINTS.length];
}

function _rankAHotspotPosition(area, index) {
    const key = _rankAHotspotKey(area);
    const saved = _rankAHotspotPositions[key];
    if (saved) {
        const x = Number(saved.MapXPercent ?? saved.mapXPercent ?? saved.x);
        const y = Number(saved.MapYPercent ?? saved.mapYPercent ?? saved.y);
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y, saved: true };
    }
    return { ..._rankAHotspotDefaultPoint(area, index), saved: false };
}

function _rankAHotspotIssueOverdue(issue) {
    if ((issue.CurrentStatus || '') === 'Closed' || !issue.DueDate) return false;
    const due = new Date(issue.DueDate);
    if (Number.isNaN(due.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return due < today;
}

function _rankAHotspotIssueId(issue) {
    return String(issue?.IssueID ?? issue?.issueId ?? issue?.issueid ?? '').trim();
}

function _rankAHotspotIssuePoint(marker) {
    const issueId = _rankAHotspotIssueId(marker.issue);
    const saved = _rankAHotspotIssuePositions[issueId];
    if (saved) {
        const x = Number(saved.MapXPercent ?? saved.mapXPercent ?? saved.x);
        const y = Number(saved.MapYPercent ?? saved.mapYPercent ?? saved.y);
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y, saved: true };
    }
    const base = _rankAHotspotPosition(marker.area, marker.areaIndex);
    if (marker.areaCount <= 1) return base;

    const numericSeed = Array.from(issueId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const ring = Math.floor(Math.sqrt(marker.slot));
    const radius = 2.4 + (ring * 1.9);
    const angle = ((numericSeed * 29) + (marker.slot * 137.508)) * (Math.PI / 180);
    return {
        x: Math.max(3, Math.min(97, base.x + (Math.cos(angle) * radius))),
        y: Math.max(3, Math.min(97, base.y + (Math.sin(angle) * radius * 1.28))),
        saved: base.saved,
    };
}

function _rankAHotspotVisualMarkers(markers) {
    const entries = markers.map(marker => ({
        marker,
        issueId: _rankAHotspotIssueId(marker.issue),
        point: _rankAHotspotIssuePoint(marker),
    }));
    if (_rankAHotspotEditMode || _rankAHotspotIssueEditMode) {
        return entries.map(entry => ({ type: 'issue', ...entry }));
    }

    const groups = [];
    entries.forEach(entry => {
        const group = groups.find(item => Math.abs(item.x - entry.point.x) <= 2.4 && Math.abs(item.y - entry.point.y) <= 3.2);
        if (group) {
            group.entries.push(entry);
            group.x = group.entries.reduce((sum, item) => sum + item.point.x, 0) / group.entries.length;
            group.y = group.entries.reduce((sum, item) => sum + item.point.y, 0) / group.entries.length;
        } else {
            groups.push({ x: entry.point.x, y: entry.point.y, entries: [entry] });
        }
    });

    return groups.flatMap(group => {
        if (group.entries.length === 1) return [{ type: 'issue', ...group.entries[0] }];
        const key = group.entries.map(entry => entry.issueId).sort().join('-');
        if (_rankAHotspotExpandedClusterKey !== key) {
            return [{ type: 'cluster', key, point: { x: group.x, y: group.y }, entries: group.entries }];
        }
        const radius = Math.min(7.5, 4.2 + (group.entries.length * 0.35));
        return group.entries.map((entry, index) => {
            const angle = ((Math.PI * 2) / group.entries.length) * index - (Math.PI / 2);
            return {
                type: 'issue',
                ...entry,
                clusterKey: key,
                point: {
                    x: Math.max(3, Math.min(97, group.x + Math.cos(angle) * radius)),
                    y: Math.max(3, Math.min(97, group.y + Math.sin(angle) * radius * 1.2)),
                },
                origin: { x: group.x, y: group.y },
            };
        });
    });
}

function _rankAHotspotData() {
    const allAreaNames = _patrolAreas.map(a => a.Name || a.AreaName).filter(Boolean);
    const selectedAreas = (_areaStatSel && _areaStatSel.length) ? allAreaNames.filter(n => _areaStatSel.includes(n)) : allAreaNames;
    const areaNames = selectedAreas.length ? selectedAreas : allAreaNames;
    const areaMap = {};
    areaNames.forEach(area => {
        areaMap[area] = { area, total: 0, open: 0, temporary: 0, closed: 0, overdue: 0, issues: [] };
    });

    const rankAIssues = getFilteredIssues(_allIssues, _activeFilter).filter(i => (i.Rank || '').toUpperCase() === 'A');
    rankAIssues.forEach(issue => {
        const area = _rankAHotspotKey(issue.Area || 'Unspecified');
        if (!areaMap[area]) areaMap[area] = { area, total: 0, open: 0, temporary: 0, closed: 0, overdue: 0, issues: [] };
        const row = areaMap[area];
        row.total++;
        row.issues.push(issue);
        if (issue.CurrentStatus === 'Closed') row.closed++;
        else if (issue.CurrentStatus === 'Temporary') row.temporary++;
        else row.open++;
        if (_rankAHotspotIssueOverdue(issue)) row.overdue++;
    });

    const activeAreaRows = Object.values(areaMap)
        .filter(row => row.total > 0)
        .sort((a, b) => (b.open + b.temporary) - (a.open + a.temporary) || b.overdue - a.overdue || b.total - a.total || a.area.localeCompare(b.area));

    const stopMap = {};
    STOP_TYPES.forEach(s => { stopMap[s.key] = 0; });
    rankAIssues.forEach(issue => {
        const ids = _issueStopIds(issue.HazardType);
        (ids.length ? ids : [6]).forEach(id => {
            const key = `STOP ${id}`;
            if (stopMap[key] !== undefined) stopMap[key]++;
        });
    });

    const editAreaRows = Array.from(new Set([...areaNames, ...activeAreaRows.map(row => row.area)])).filter(Boolean);
    const issueMarkers = activeAreaRows.flatMap((row, areaIndex) => {
        const issues = [...row.issues].sort((a, b) => {
            const aId = Number(_rankAHotspotIssueId(a));
            const bId = Number(_rankAHotspotIssueId(b));
            if (Number.isFinite(aId) && Number.isFinite(bId)) return aId - bId;
            return _rankAHotspotIssueId(a).localeCompare(_rankAHotspotIssueId(b));
        });
        return issues.map((issue, slot) => ({
            issue,
            area: row.area,
            areaIndex,
            slot,
            areaCount: issues.length,
        }));
    });

    return {
        total: rankAIssues.length,
        open: activeAreaRows.reduce((sum, row) => sum + row.open, 0),
        temporary: activeAreaRows.reduce((sum, row) => sum + row.temporary, 0),
        closed: activeAreaRows.reduce((sum, row) => sum + row.closed, 0),
        overdue: activeAreaRows.reduce((sum, row) => sum + row.overdue, 0),
        hasRankA: rankAIssues.length > 0,
        activeAreaRows,
        issueMarkers,
        editAreaRows,
        stopMap,
        maxArea: Math.max(1, ...activeAreaRows.map(row => row.total)),
        maxStop: Math.max(1, ...Object.values(stopMap)),
    };
}

function _rankAHotspotAreaMarker(row, index, maxArea) {
    const point = _rankAHotspotPosition(row.area, index);
    const openCount = row.open + row.temporary;
    const color = row.overdue ? '#dc2626' : openCount ? '#f97316' : row.total ? '#10b981' : '#cbd5e1';
    const radius = row.total ? 10 + (row.total / Math.max(1, maxArea) * 11) : 8;
    const opacity = row.total ? 0.9 : (_rankAHotspotEditMode ? 0.42 : 0.18);
    const ring = _rankAHotspotEditMode && row.area === _rankAHotspotEditArea ? 'ring-4 ring-red-300' : '';
    const label = row.total || (index + 1);
    return `
      <button type="button" onclick="window._rankAHotspotSelectPoint(event,'${_rankAHotspotArg(row.area)}')"
        onpointerdown="window._rankAHotspotStartDrag(event,'${_rankAHotspotArg(row.area)}')"
        title="${escHtml(row.area)}"
        class="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white text-[11px] font-black text-white shadow-lg transition-transform hover:scale-110 ${ring}"
        data-rank-a-hotspot-marker="1"
        style="left:${point.x}%;top:${point.y}%;width:${radius * 2.15}px;height:${radius * 2.15}px;background:${color};opacity:${opacity}">
        ${label}
      </button>
      <span class="pointer-events-none absolute z-0 -translate-x-1/2 -translate-y-1/2 rounded-full" style="left:${point.x}%;top:${point.y}%;width:${(radius + 11) * 2}px;height:${(radius + 11) * 2}px;background:${color};opacity:${opacity * 0.14}"></span>
    `;
}

function _rankAHotspotIssueMarker(visual) {
    const marker = visual.marker;
    const issue = marker.issue;
    const point = visual.point || _rankAHotspotIssuePoint(marker);
    const issueId = _rankAHotspotIssueId(issue);
    const status = String(issue.CurrentStatus || '').toLowerCase();
    const overdue = _rankAHotspotIssueOverdue(issue);
    const color = overdue ? '#dc2626' : status === 'closed' ? '#10b981' : status === 'temporary' ? '#f97316' : '#ef4444';
    const zIndex = overdue ? 30 : status === 'closed' ? 10 : 20;
    const title = `#${issueId || '?'} · ${issue.Area || 'No area'} · ${issue.CurrentStatus || 'Open'}`;
    const selected = issueId === (_rankAHotspotIssueEditMode ? _rankAHotspotEditIssueId : _rankAHotspotSelectedIssueId);
    return `
      ${visual.origin ? `<span class="pointer-events-none absolute z-10 h-px origin-left bg-sky-300/80"
        style="left:${visual.origin.x}%;top:${visual.origin.y}%;width:${Math.hypot(point.x - visual.origin.x, point.y - visual.origin.y)}%;transform:rotate(${Math.atan2((point.y - visual.origin.y) * 0.75, point.x - visual.origin.x) * 180 / Math.PI}deg)"></span>` : ''}
      <button type="button"
        onclick="${_rankAHotspotIssueEditMode ? `window._rankAHotspotFocusIssue(event,'${_rankAHotspotArg(issueId)}')` : `window._issueShowInRegistry('${_rankAHotspotArg(issueId)}')`}"
        onpointerdown="window._rankAHotspotStartIssueDrag(event,'${_rankAHotspotArg(issueId)}')"
        title="${escHtml(title)}"
        aria-label="${escHtml(title)}"
        class="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white px-2 text-[9px] font-black leading-none text-white shadow-lg transition-all hover:scale-110 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-red-200 ${selected ? 'ring-4 ring-sky-300 scale-110' : ''} ${_rankAHotspotIssueEditMode ? 'cursor-grab active:cursor-grabbing' : ''}"
        data-rank-a-hotspot-marker="1"
        data-rank-a-hotspot-issue-id="${escHtml(issueId)}"
        style="left:${point.x}%;top:${point.y}%;z-index:${zIndex};min-width:42px;height:28px;background:${color}">
        #${escHtml(issueId || '?')}
      </button>
      <span class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style="left:${point.x}%;top:${point.y}%;z-index:${zIndex - 1};width:42px;height:42px;background:${color};opacity:${overdue ? 0.22 : 0.12}"></span>
    `;
}

function _rankAHotspotClusterMarker(cluster) {
    const overdue = cluster.entries.filter(entry => _rankAHotspotIssueOverdue(entry.marker.issue)).length;
    const active = cluster.entries.filter(entry => String(entry.marker.issue.CurrentStatus || '').toLowerCase() !== 'closed').length;
    const color = overdue ? '#dc2626' : active ? '#f97316' : '#10b981';
    const title = cluster.entries.map(entry => `#${entry.issueId}`).join(', ');
    return `
      <button type="button" onclick="window._rankAHotspotToggleCluster(event,'${_rankAHotspotArg(cluster.key)}')"
        title="${escHtml(title)}"
        aria-label="${cluster.entries.length} overlapping Rank A issues"
        class="absolute z-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white text-[10px] font-black text-white shadow-xl transition-transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-sky-200"
        data-rank-a-hotspot-marker="1"
        data-rank-a-hotspot-cluster="${escHtml(cluster.key)}"
        style="left:${cluster.point.x}%;top:${cluster.point.y}%;width:38px;height:38px;background:${color}">
        +${cluster.entries.length}
      </button>
      <span class="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full animate-pulse"
        style="left:${cluster.point.x}%;top:${cluster.point.y}%;width:54px;height:54px;background:${color};opacity:.16"></span>
    `;
}

function _rankAHotspotAreaRow(row, index, total, maxArea) {
    const share = total ? (row.total * 100 / total) : 0;
    const width = Math.max(6, Math.round(row.total * 100 / Math.max(1, maxArea)));
    const isActive = _filterArea === row.area;
    const color = row.overdue ? '#dc2626' : (row.open + row.temporary) ? '#f97316' : '#10b981';
    return `
      <div class="cursor-pointer rounded-xl border px-3 py-2 transition-colors ${isActive ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-white hover:bg-red-50/50'}" onclick="window._issueFilterArea('${_rankAHotspotArg(row.area)}')">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="min-w-0 inline-flex items-center gap-2 text-xs font-black text-slate-700">
            <span class="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-white" style="background:${color}">${index + 1}</span>
            <span class="truncate" title="${escHtml(row.area)}">${escHtml(row.area)}</span>
          </span>
          <span class="flex-shrink-0 text-[11px] font-black tabular-nums text-slate-500">${row.total} · ${share.toFixed(1)}%</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-slate-100">
          <div class="h-full rounded-full" style="width:${width}%;background:${color}"></div>
        </div>
        <div class="mt-1 flex flex-wrap gap-1 text-[9px] font-bold">
          <span class="rounded-full bg-red-50 px-1.5 py-0.5 text-red-600">Open ${row.open}</span>
          <span class="rounded-full bg-orange-50 px-1.5 py-0.5 text-orange-600">Temp ${row.temporary}</span>
          <span class="rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-600">Closed ${row.closed}</span>
          ${row.overdue ? `<span class="rounded-full bg-red-100 px-1.5 py-0.5 text-red-700">Overdue ${row.overdue}</span>` : ''}
        </div>
      </div>
    `;
}

function _rankAHotspotStopCell(stop, stopMap, maxStop) {
    const count = stopMap[stop.key] || 0;
    const pct = Math.round(count * 100 / Math.max(1, maxStop));
    return `
      <div class="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="text-[9px] font-black text-slate-500">${stop.key.replace('STOP ', 'ST')}</span>
          <span class="text-[11px] font-black ${count ? 'text-red-600' : 'text-slate-300'}">${count}</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-white">
          <div class="h-full rounded-full bg-red-500" style="width:${pct}%"></div>
        </div>
      </div>
    `;
}

function _rankAHotspotIssueItem(issue) {
    const status = String(issue.CurrentStatus || '').toLowerCase();
    const statusClass = status === 'closed'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
        : status === 'temporary'
            ? 'bg-orange-50 text-orange-700 border-orange-100'
            : 'bg-red-50 text-red-700 border-red-100';
    const dateText = patrolDateOnly(issue.FoundDate || issue.DateFound || issue.IssueDate || '');
    const dueText = patrolDateOnly(issue.DueDate || '');
    const issueId = _rankAHotspotIssueId(issue);
    const selected = issueId === _rankAHotspotSelectedIssueId;
    return `
      <button type="button" data-rank-a-hotspot-issue-card="${escHtml(issueId)}" class="w-full rounded-xl border px-3 py-2 text-left transition-all ${selected ? 'border-sky-300 bg-sky-50 ring-2 ring-sky-100' : 'border-slate-100 bg-white hover:border-red-100 hover:bg-red-50/40'}" onclick="window._rankAHotspotFocusIssue(event,'${_rankAHotspotArg(issueId)}')">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="min-w-0 inline-flex items-center gap-2">
            <span class="flex-shrink-0 font-mono text-[10px] font-black text-red-600">#${escHtml(issueId || '?')}</span>
            <span class="min-w-0 truncate text-xs font-black text-slate-700">${escHtml(issue.HazardDescription || issue.MachineName || issue.Area || 'Rank A issue')}</span>
          </span>
          <span class="flex-shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black ${statusClass}">${escHtml(issue.CurrentStatus || 'Open')}</span>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-slate-400">
          <span>${escHtml(issue.Area || 'No area')}</span>
          ${issue.HazardType ? `<span>${escHtml(_formatIssueHazardTypes(issue.HazardType, ''))}</span>` : ''}
          ${dateText ? `<span>Found ${escHtml(dateText)}</span>` : ''}
          ${dueText ? `<span>Due ${escHtml(dueText)}</span>` : ''}
        </div>
      </button>
    `;
}

function _rankAHotspotSelectedPreview() {
    const issue = _allIssues.find(item => _rankAHotspotIssueId(item) === _rankAHotspotSelectedIssueId);
    if (!issue) return '';
    const overdue = _rankAHotspotIssueOverdue(issue);
    const status = String(issue.CurrentStatus || 'Open');
    const tone = overdue ? 'border-red-200 bg-red-50' : status === 'Closed' ? 'border-emerald-200 bg-emerald-50' : 'border-orange-200 bg-orange-50';
    return `
      <div class="mt-3 rounded-xl border ${tone} p-3 shadow-sm" data-rank-a-hotspot-preview>
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="mb-1 flex flex-wrap items-center gap-2">
              <span class="font-mono text-xs font-black text-slate-800">#${escHtml(_rankAHotspotIssueId(issue))}</span>
              <span class="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-black text-slate-600">${escHtml(status)}</span>
              ${overdue ? '<span class="rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-black text-white">Overdue</span>' : ''}
            </div>
            <p class="line-clamp-2 text-xs font-black text-slate-800">${escHtml(issue.HazardDescription || issue.MachineName || 'Rank A issue')}</p>
            <p class="mt-1 text-[10px] font-bold text-slate-500">${escHtml(issue.Area || 'No area')}${issue.HazardType ? ` · ${escHtml(_formatIssueHazardTypes(issue.HazardType, ''))}` : ''}</p>
          </div>
          <button type="button" onclick="window._rankAHotspotOpenSelectedIssue(event)" class="min-h-[40px] flex-shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-[10px] font-black text-white hover:bg-slate-900">View detail</button>
        </div>
      </div>`;
}

renderRankASpotlight = function() {
    const el = document.getElementById('rank-a-spotlight');
    if (!el) return;
    const data = _rankAHotspotData();
    const markerRows = data.hasRankA ? data.activeAreaRows : data.editAreaRows.map(area => ({
        area,
        total: 0,
        open: 0,
        temporary: 0,
        closed: 0,
        overdue: 0,
        issues: [],
    }));
    const topRows = data.activeAreaRows.slice(0, 6);
    const latestIssues = data.issueMarkers
        .map(marker => marker.issue)
        .sort((a, b) => Number(_rankAHotspotIssueId(b)) - Number(_rankAHotspotIssueId(a)))
        .slice(0, 8);
    if (!_rankAHotspotEditArea && data.editAreaRows[0]) _rankAHotspotEditArea = data.editAreaRows[0];
    if (!_rankAHotspotEditIssueId && data.issueMarkers[0]) _rankAHotspotEditIssueId = _rankAHotspotIssueId(data.issueMarkers[0].issue);
    if (_rankAHotspotSelectedIssueId && !data.issueMarkers.some(marker => _rankAHotspotIssueId(marker.issue) === _rankAHotspotSelectedIssueId)) {
        _rankAHotspotSelectedIssueId = '';
    }
    const editing = _rankAHotspotEditMode || _rankAHotspotIssueEditMode;
    const visualMarkers = _rankAHotspotVisualMarkers(data.issueMarkers);

    el.innerHTML = `
    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div class="min-w-0">
        <div class="mb-1 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full ${data.total > 0 ? 'bg-red-500 animate-pulse' : 'bg-slate-300'} flex-shrink-0"></span>
          <h3 class="font-bold text-slate-800 text-base">Rank A Hotspot</h3>
          <span class="text-[10px] font-bold px-2 py-0.5 ${data.total > 0 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-slate-100 text-slate-400'} rounded-full">${data.total} items</span>
        </div>
        <p class="max-w-3xl text-[11px] font-bold leading-relaxed text-slate-400">
          One marker represents one existing Patrol IssueID. Click a point such as #90041 to view its details; Admin can save a precise position for each issue.
        </p>
      </div>
      <div class="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[310px]">
        <div class="rounded-xl border border-red-100 bg-red-50 px-3 py-2">
          <p class="text-[9px] font-black uppercase text-red-500">Open Rank A</p>
          <p class="text-lg font-black tabular-nums text-red-700">${data.open + data.temporary}</p>
        </div>
        <div class="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2">
          <p class="text-[9px] font-black uppercase text-orange-500">Overdue</p>
          <p class="text-lg font-black tabular-nums text-orange-700">${data.overdue}</p>
        </div>
      </div>
    </div>

    ${isAdmin ? `
    <div class="mb-4 rounded-xl border border-red-100 bg-red-50 px-3 py-3" data-patrol-hotspot-editor data-patrol-card-ignore>
      <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div class="min-w-0">
          <p class="text-xs font-black text-red-700">Rank A position editor</p>
          <p class="text-[11px] font-bold leading-relaxed text-red-500">${_rankAHotspotIssueEditMode
              ? 'Choose an IssueID, then click the layout or drag its marker to the exact location.'
              : _rankAHotspotEditMode
                  ? 'Choose an Area, then click the layout or drag its center marker. Unsaved issue points use this center.'
                  : 'Issue positions are saved by the existing IssueID. Area centers remain the fallback for new or unplaced issues.'}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          ${_rankAHotspotIssueEditMode ? `
            <select class="form-input h-9 min-w-[280px] py-0 text-xs font-bold" onchange="window._rankAHotspotSetEditIssue(this.value)">
              ${data.issueMarkers.map(marker => {
                  const issue = marker.issue;
                  const issueId = _rankAHotspotIssueId(issue);
                  return `<option value="${escHtml(issueId)}" ${issueId === _rankAHotspotEditIssueId ? 'selected' : ''}>#${escHtml(issueId)} · ${escHtml(issue.Area || 'No area')}</option>`;
              }).join('')}
            </select>` : `
            <select class="form-input h-9 min-w-[240px] py-0 text-xs font-bold" onchange="window._rankAHotspotSetEditArea(this.value)" ${_rankAHotspotEditMode ? '' : 'disabled'}>
              ${data.editAreaRows.map(area => `<option value="${escHtml(area)}" ${area === _rankAHotspotEditArea ? 'selected' : ''}>${escHtml(area)}</option>`).join('')}
            </select>`}
          <button type="button" onclick="window._rankAHotspotToggleIssueEdit()" class="rounded-lg border border-sky-200 px-3 py-2 text-xs font-black ${_rankAHotspotIssueEditMode ? 'bg-sky-600 text-white' : 'bg-white text-sky-700 hover:bg-sky-50'}">${_rankAHotspotIssueEditMode ? 'Done issue points' : 'Edit issue points'}</button>
          <button type="button" onclick="window._rankAHotspotToggleEdit()" class="rounded-lg border border-red-200 px-3 py-2 text-xs font-black ${_rankAHotspotEditMode ? 'bg-red-600 text-white' : 'bg-white text-red-700 hover:bg-red-100'}">${_rankAHotspotEditMode ? 'Done area centers' : 'Area centers'}</button>
          <button type="button" onclick="${_rankAHotspotIssueEditMode ? 'window._rankAHotspotSaveIssuePositions()' : 'window._rankAHotspotSavePositions()'}" class="rounded-lg bg-slate-800 px-3 py-2 text-xs font-black text-white hover:bg-slate-900" ${editing ? '' : 'disabled'}>Save</button>
        </div>
      </div>
    </div>` : ''}

    <div class="grid grid-cols-1 xl:grid-cols-[minmax(620px,1fr)_360px] gap-4">
      <div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[10px] font-black uppercase text-slate-400">Factory Layout</span>
          <span class="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">${data.hasRankA ? `${data.issueMarkers.length} issue points` : 'No Rank A'}</span>
        </div>
        <div id="rank-a-hotspot-map" onclick="window._rankAHotspotMapClick(event)" onpointermove="window._rankAHotspotMapPointerMove(event)" onpointerup="window._rankAHotspotMapPointerUp(event)" onpointerleave="window._rankAHotspotMapPointerUp(event)" class="relative overflow-hidden rounded-xl border border-slate-200 bg-white ${editing ? 'cursor-crosshair ring-2 ring-red-200' : ''}" style="aspect-ratio:4/3">
          <img src="${PATROL_RANK_A_LAYOUT_IMAGE}" alt="TSH factory layout" class="absolute inset-0 block h-full w-full select-none object-contain" draggable="false">
          ${_rankAHotspotEditMode
              ? markerRows.map((row, i) => _rankAHotspotAreaMarker(row, i, data.maxArea)).join('')
              : visualMarkers.map(visual => visual.type === 'cluster' ? _rankAHotspotClusterMarker(visual) : _rankAHotspotIssueMarker(visual)).join('')}
          ${!data.hasRankA && !_rankAHotspotEditMode ? `<div class="absolute inset-x-4 bottom-4 rounded-xl border border-slate-100 bg-white/90 px-3 py-2 text-center text-[11px] font-bold text-slate-400 shadow-sm">No Rank A in current Patrol issue data</div>` : ''}
          ${_rankAHotspotEditMode ? `<div class="absolute left-3 top-3 rounded-xl border border-red-100 bg-white/95 px-3 py-2 text-[11px] font-black text-red-600 shadow-sm">Placing: ${escHtml(_rankAHotspotEditArea || '-')}</div>` : ''}
          ${_rankAHotspotIssueEditMode ? `<div class="absolute left-3 top-3 z-40 rounded-xl border border-sky-100 bg-white/95 px-3 py-2 text-[11px] font-black text-sky-700 shadow-sm">Placing Issue: #${escHtml(_rankAHotspotEditIssueId || '-')}</div>` : ''}
        </div>
        ${_rankAHotspotSelectedPreview()}
      </div>

      <div class="min-w-0 space-y-4">
        <div>
          <p class="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Top Rank A Areas</p>
          <div class="space-y-2">
            ${topRows.length ? topRows.map((row, i) => _rankAHotspotAreaRow(row, i, data.total, data.maxArea)).join('') : `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-xs font-bold text-slate-300">No Rank A hotspot</div>`}
          </div>
          <div class="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px]">
            <span class="font-bold text-slate-500">Primary hotspot</span>
            <span class="ml-2 font-black text-slate-800">${escHtml(topRows[0]?.area || '-')}</span>
          </div>
        </div>

        <div>
          <p class="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Rank A Issues</p>
          <div class="max-h-[280px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
            ${latestIssues.length ? latestIssues.map(_rankAHotspotIssueItem).join('') : `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-xs font-bold text-slate-300">No Rank A issue in current data</div>`}
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p class="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">STOP Breakdown</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        ${STOP_TYPES.map(s => _rankAHotspotStopCell(s, data.stopMap, data.maxStop)).join('')}
      </div>
    </div>`;
};

function _rankAHotspotToggleEdit() {
    if (!isAdmin) return;
    const data = _rankAHotspotData();
    _rankAHotspotEditMode = !_rankAHotspotEditMode;
    if (_rankAHotspotEditMode) _rankAHotspotIssueEditMode = false;
    if (!_rankAHotspotEditArea && data.editAreaRows[0]) _rankAHotspotEditArea = data.editAreaRows[0];
    renderRankASpotlight();
}

function _rankAHotspotToggleIssueEdit() {
    if (!isAdmin) return;
    const data = _rankAHotspotData();
    _rankAHotspotIssueEditMode = !_rankAHotspotIssueEditMode;
    if (_rankAHotspotIssueEditMode) {
        _rankAHotspotEditMode = false;
        if (!_rankAHotspotEditIssueId && data.issueMarkers[0]) {
            _rankAHotspotEditIssueId = _rankAHotspotIssueId(data.issueMarkers[0].issue);
        }
    }
    _rankAHotspotDragIssueId = '';
    renderRankASpotlight();
}

function _rankAHotspotSetEditArea(value) {
    if (!isAdmin) return;
    _rankAHotspotEditArea = _rankAHotspotKey(value);
    renderRankASpotlight();
}

function _rankAHotspotSetEditIssue(value) {
    if (!isAdmin) return;
    _rankAHotspotEditIssueId = String(value || '').trim();
    renderRankASpotlight();
}

function _rankAHotspotSelectPoint(event, area) {
    event?.stopPropagation?.();
    if (!_rankAHotspotEditMode) {
        window._issueFilterArea?.(area);
        return;
    }
    if (!isAdmin) return;
    _rankAHotspotEditArea = _rankAHotspotKey(area);
    renderRankASpotlight();
}

function _rankAHotspotOpenIssue(event, issueId) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (_rankAHotspotIssueEditMode) {
        _rankAHotspotEditIssueId = String(issueId || '').trim();
        renderRankASpotlight();
        return;
    }
    const issue = _allIssues.find(item => _rankAHotspotIssueId(item) === String(issueId || '').trim());
    if (!issue) {
        showToast('Cannot find this Patrol issue.', 'warning');
        return;
    }
    openIssueForm('VIEW', issue);
}

function _rankAHotspotFocusIssue(event, issueId) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const normalizedId = String(issueId || '').trim();
    if (_rankAHotspotIssueEditMode) {
        _rankAHotspotEditIssueId = normalizedId;
        renderRankASpotlight();
        return;
    }
    _rankAHotspotSelectedIssueId = normalizedId;
    const collapsedCluster = _rankAHotspotVisualMarkers(_rankAHotspotData().issueMarkers)
        .find(visual => visual.type === 'cluster' && visual.entries.some(entry => entry.issueId === normalizedId));
    if (collapsedCluster) _rankAHotspotExpandedClusterKey = collapsedCluster.key;
    renderRankASpotlight();
    requestAnimationFrame(() => {
        const map = document.getElementById('rank-a-hotspot-map');
        const marker = map?.querySelector?.(`[data-rank-a-hotspot-issue-id="${normalizedId}"]`);
        const card = document.querySelector(`[data-rank-a-hotspot-issue-card="${normalizedId}"]`);
        marker?.focus?.({ preventScroll: true });
        if (window.matchMedia?.('(max-width: 767px)')?.matches) {
            document.querySelector('[data-rank-a-hotspot-preview]')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        } else {
            card?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        }
    });
}

function _rankAHotspotOpenSelectedIssue(event) {
    const issueId = _rankAHotspotSelectedIssueId;
    if (!issueId) return;
    _rankAHotspotOpenIssue(event, issueId);
    setTimeout(() => {
        const container = document.getElementById('modal-container');
        if (container) container.classList.add('patrol-hotspot-detail-modal');
    }, 0);
}

function _rankAHotspotToggleCluster(event, key) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    _rankAHotspotExpandedClusterKey = _rankAHotspotExpandedClusterKey === key ? '' : String(key || '');
    renderRankASpotlight();
}

function _rankAHotspotUpdateIssuePositionFromEvent(map, event, issueId) {
    if (!issueId || !map || !event) return false;
    const rect = map.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    _rankAHotspotIssuePositions[issueId] = {
        ...(_rankAHotspotIssuePositions[issueId] || {}),
        IssueID: Number(issueId),
        MapXPercent: Number(x.toFixed(3)),
        MapYPercent: Number(y.toFixed(3)),
    };
    _rankAHotspotDirtyIssueIds.add(issueId);
    return true;
}

function _rankAHotspotUpdatePositionFromEvent(map, event, area) {
    if (!area || !map || !event) return false;
    const rect = map.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    _rankAHotspotPositions[area] = {
        AreaName: area,
        DisplayName: area,
        MapXPercent: Number(x.toFixed(3)),
        MapYPercent: Number(y.toFixed(3)),
        IsPinned: 1,
    };
    return true;
}

function _rankAHotspotStartDrag(event, area) {
    if (!isAdmin || !_rankAHotspotEditMode) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    _rankAHotspotDragArea = _rankAHotspotKey(area);
    _rankAHotspotEditArea = _rankAHotspotDragArea;
}

function _rankAHotspotStartIssueDrag(event, issueId) {
    if (!isAdmin || !_rankAHotspotIssueEditMode) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    _rankAHotspotDragIssueId = String(issueId || '').trim();
    _rankAHotspotEditIssueId = _rankAHotspotDragIssueId;
}

function _rankAHotspotMapPointerMove(event) {
    if (isAdmin && _rankAHotspotIssueEditMode && _rankAHotspotDragIssueId) {
        if (_rankAHotspotUpdateIssuePositionFromEvent(event.currentTarget, event, _rankAHotspotDragIssueId)) {
            const row = _rankAHotspotIssuePositions[_rankAHotspotDragIssueId];
            const marker = event.currentTarget?.querySelector?.(`[data-rank-a-hotspot-issue-id="${_rankAHotspotDragIssueId}"]`);
            if (marker && row) {
                marker.style.left = `${row.MapXPercent}%`;
                marker.style.top = `${row.MapYPercent}%`;
                const halo = marker.nextElementSibling;
                if (halo) {
                    halo.style.left = marker.style.left;
                    halo.style.top = marker.style.top;
                }
            }
        }
        return;
    }
    if (!isAdmin || !_rankAHotspotEditMode || !_rankAHotspotDragArea) return;
    if (_rankAHotspotUpdatePositionFromEvent(event.currentTarget, event, _rankAHotspotDragArea)) {
        renderRankASpotlight();
    }
}

function _rankAHotspotMapPointerUp(event) {
    if (isAdmin && _rankAHotspotDragIssueId) {
        if (_rankAHotspotIssueEditMode && event?.currentTarget) {
            _rankAHotspotUpdateIssuePositionFromEvent(event.currentTarget, event, _rankAHotspotDragIssueId);
        }
        _rankAHotspotDragIssueId = '';
        renderRankASpotlight();
        return;
    }
    if (!isAdmin || !_rankAHotspotDragArea) return;
    if (_rankAHotspotEditMode && event?.currentTarget) {
        _rankAHotspotUpdatePositionFromEvent(event.currentTarget, event, _rankAHotspotDragArea);
    }
    _rankAHotspotDragArea = '';
    renderRankASpotlight();
}

function _rankAHotspotMapClick(event) {
    if (event.target?.closest?.('[data-rank-a-hotspot-marker]')) return;
    if (isAdmin && _rankAHotspotIssueEditMode) {
        const issueId = _rankAHotspotEditIssueId;
        if (!issueId) return;
        _rankAHotspotUpdateIssuePositionFromEvent(event.currentTarget, event, issueId);
        renderRankASpotlight();
        return;
    }
    if (!isAdmin || !_rankAHotspotEditMode) return;
    const area = _rankAHotspotEditArea;
    const map = event.currentTarget;
    if (!area || !map) return;
    _rankAHotspotUpdatePositionFromEvent(map, event, area);
    renderRankASpotlight();
}

async function _rankAHotspotSaveIssuePositions() {
    if (!isAdmin) return;
    const lockKey = 'rank-a-hotspot-save-issue-positions';
    if (_patrolActionLocks.has(lockKey)) return;
    const validIssueIds = new Set(_rankAHotspotData().issueMarkers.map(marker => _rankAHotspotIssueId(marker.issue)).filter(Boolean));
    const positions = Array.from(_rankAHotspotDirtyIssueIds)
        .filter(issueId => validIssueIds.has(issueId) && _rankAHotspotIssuePositions[issueId])
        .map(issueId => {
            const row = _rankAHotspotIssuePositions[issueId];
            return {
                IssueID: Number(issueId),
                MapXPercent: Number(row.MapXPercent ?? row.mapXPercent ?? row.x),
                MapYPercent: Number(row.MapYPercent ?? row.mapYPercent ?? row.y),
            };
        })
        .filter(row => Number.isSafeInteger(row.IssueID) && row.IssueID > 0 && Number.isFinite(row.MapXPercent) && Number.isFinite(row.MapYPercent));
    if (!positions.length) {
        showToast('Move or place at least one Issue marker before saving.', 'warning');
        return;
    }
    _patrolActionLocks.add(lockKey);
    try {
        showLoading('Saving Rank A issue positions...');
        const res = await API.put('/patrol/rank-a-hotspot-issue-positions', { positions });
        _setRankAHotspotIssuePositions(normalizeApiArray(res));
        _rankAHotspotIssueEditMode = false;
        _rankAHotspotDragIssueId = '';
        showToast('Saved Rank A issue positions.', 'success');
        renderRankASpotlight();
    } catch (err) {
        const looksLikeNetworkDrop = err instanceof TypeError || /failed to fetch|network|internet|disconnected/i.test(String(err?.message || err || ''));
        if (looksLikeNetworkDrop && await _rankAHotspotVerifyIssuePositionsAfterNetworkError(positions)) return;
        showError(looksLikeNetworkDrop
            ? 'Network disconnected while saving Rank A issue positions. Please reconnect and press Save again; if the point already moved after refresh, it was saved.'
            : (err.message || 'Cannot save Rank A issue positions.'));
    } finally {
        _patrolActionLocks.delete(lockKey);
        hideLoading();
    }
}

async function _rankAHotspotSavePositions() {
    if (!isAdmin) return;
    const validAreas = new Set(_rankAHotspotData().editAreaRows.map(_rankAHotspotKey).filter(Boolean));
    const positions = Object.values(_rankAHotspotPositions)
        .filter(row => validAreas.has(_rankAHotspotKey(row.AreaName || row.areaName || row.area)))
        .map(row => ({
            AreaName: _rankAHotspotKey(row.AreaName || row.areaName || row.area),
            DisplayName: _rankAHotspotKey(row.DisplayName || row.displayName || row.AreaName || row.areaName || row.area),
            MapXPercent: Number(row.MapXPercent ?? row.mapXPercent ?? row.x),
            MapYPercent: Number(row.MapYPercent ?? row.mapYPercent ?? row.y),
            IsPinned: 1,
        }))
        .filter(row => row.AreaName && Number.isFinite(row.MapXPercent) && Number.isFinite(row.MapYPercent));
    if (!positions.length) {
        showToast('No hotspot positions to save.', 'warning');
        return;
    }
    try {
        showLoading('Saving Rank A hotspot positions...');
        const res = await API.put('/patrol/rank-a-hotspot-positions', { positions });
        _setRankAHotspotPositions(normalizeApiArray(res));
        _rankAHotspotEditMode = false;
        showToast('Saved Rank A hotspot positions.', 'success');
        renderRankASpotlight();
    } catch (err) {
        showError(err.message || 'Cannot save Rank A hotspot positions.');
    } finally {
        hideLoading();
    }
}

function _updateAreaBadge() {
    const badge = document.getElementById('area-stat-filter-badge');
    const labelEl = document.getElementById('area-stat-filter-label');
    if (!badge || !labelEl) return;
    if (_filterArea) {
        labelEl.textContent = _filterArea;
        badge.classList.remove('hidden'); badge.classList.add('inline-flex');
    } else {
        badge.classList.add('hidden'); badge.classList.remove('inline-flex');
    }
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function renderDeptStats() {
    const tbody = document.getElementById('dashboard-dept-body');
    if (!tbody) return;

    const allDeptNames = _masterDepts.map(d => d.Name).filter(Boolean);
    if (!allDeptNames.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-xs text-slate-300">ยังไม่มีส่วนงานใน Master Data</td></tr>`;
        return;
    }
    const savedSel = _getDeptStatSelection();
    const deptNames = savedSel ? allDeptNames.filter(n => savedSel.includes(n)) : allDeptNames;

    const savedUnitSel = _getUnitStatSelection();
    const allUnitNames = _masterUnits.map(u => u.name).filter(Boolean);
    const selectedUnitNames = savedUnitSel ? allUnitNames.filter(n => savedUnitSel.includes(n)) : [];

    // Build dept count map
    const deptMap = {};
    for (const name of deptNames) deptMap[name] = { found:0, achieved:0, onProcess:0 };

    // Build unit count map
    const unitMap = {};
    for (const name of selectedUnitNames) unitMap[name] = { found:0, achieved:0, onProcess:0 };

    _allIssues.forEach(issue => {
        _normalizeDept(issue.ResponsibleDept).forEach(d => {
            if (deptMap[d] !== undefined) {
                deptMap[d].found++;
                if (issue.CurrentStatus === 'Closed') deptMap[d].achieved++;
                else                                   deptMap[d].onProcess++;
            }
        });
        _issueMultiValues(issue.ResponsibleUnit).forEach(unit => {
            if (unitMap[unit] !== undefined) {
                unitMap[unit].found++;
                if (issue.CurrentStatus === 'Closed') unitMap[unit].achieved++;
                else unitMap[unit].onProcess++;
            }
        });
    });

    const rows = [];
    const shownUnitNames = new Set();
    let orphanUnitNames = [];

    for (const dept of deptNames) {
        const r = deptMap[dept];
        const pct = r.found > 0 ? Math.round((r.achieved / r.found) * 100) : null;
        const pctColor = pct === null ? 'text-slate-300' : pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-orange-500' : 'text-red-500';
        const isActive = _filterDepts.includes(dept);
        rows.push(`<tr class="border-b border-slate-50 cursor-pointer transition-colors ${isActive ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-slate-50'}"
            onclick="window._issueFilterDept('${dept.replace(/'/g,"\\'")}')">
            <td class="px-3 py-2 text-[10px] font-medium max-w-[110px] truncate ${isActive ? 'text-indigo-700 font-bold' : 'text-slate-600'}" title="${dept}">
              ${isActive ? `<span class="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1 align-middle"></span>` : ''}${dept}
            </td>
            <td class="px-2 py-2 text-center font-bold text-xs ${r.found === 0 ? 'text-slate-300' : isActive ? 'text-indigo-600' : 'text-slate-500'}">${r.found}</td>
            <td class="px-2 py-2 text-center font-bold text-xs ${r.achieved === 0 ? 'text-slate-300' : 'text-emerald-600'}">${r.achieved}</td>
            <td class="px-2 py-2 text-center font-bold text-xs ${r.onProcess === 0 ? 'text-slate-300' : 'text-orange-500'}">${r.onProcess}</td>
            <td class="px-2 py-2 text-center font-bold text-xs ${pctColor}">${pct !== null ? pct+'%' : '—'}</td>
        </tr>`);

        // Unit rows indented directly below their parent dept
        if (selectedUnitNames.length) {
            const deptObj = _masterDepts.find(d => d.Name === dept);
            if (deptObj) {
                const deptId = deptObj.id || deptObj.ID;
                const deptUnits = _masterUnits.filter(u => u.department_id === deptId && selectedUnitNames.includes(u.name));
                for (const unit of deptUnits) {
                    shownUnitNames.add(unit.name);
                    const ur = unitMap[unit.name];
                    if (!ur) continue;
                    const upct = ur.found > 0 ? Math.round((ur.achieved / ur.found) * 100) : null;
                    const upctColor = upct === null ? 'text-slate-300' : upct >= 80 ? 'text-emerald-600' : upct >= 50 ? 'text-orange-500' : 'text-red-500';
                    const uActive = _filterUnits.includes(unit.name);
                    rows.push(`<tr class="border-b border-sky-50/80 cursor-pointer transition-colors ${uActive ? 'bg-sky-50 border-sky-100' : 'hover:bg-sky-50/40'}"
                        onclick="window._issueFilterUnit('${unit.name.replace(/'/g,"\\'")}')">
                        <td class="py-1.5 text-[10px] font-medium max-w-[110px] truncate ${uActive ? 'text-sky-700 font-bold' : 'text-slate-500'}" title="${unit.name}">
                          <span class="inline-block w-px h-4 bg-slate-200 ml-4 mr-2 align-middle"></span><span class="inline-block w-1.5 h-1.5 rounded-full bg-sky-300 mr-1 align-middle"></span>${uActive ? `<span class="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 mr-1 align-middle"></span>` : ''}${unit.name}
                        </td>
                        <td class="px-2 py-1.5 text-center font-bold text-xs ${ur.found === 0 ? 'text-slate-300' : uActive ? 'text-sky-600' : 'text-slate-400'}">${ur.found}</td>
                        <td class="px-2 py-1.5 text-center font-bold text-xs ${ur.achieved === 0 ? 'text-slate-300' : 'text-emerald-600'}">${ur.achieved}</td>
                        <td class="px-2 py-1.5 text-center font-bold text-xs ${ur.onProcess === 0 ? 'text-slate-300' : 'text-orange-500'}">${ur.onProcess}</td>
                        <td class="px-2 py-1.5 text-center font-bold text-xs ${upctColor}">${upct !== null ? upct+'%' : '—'}</td>
                    </tr>`);
                }
            }
        }
    }

    // Orphan units (selected but dept not in display list)
    if (selectedUnitNames.length) {
        orphanUnitNames = selectedUnitNames.filter(n => !shownUnitNames.has(n));
        if (orphanUnitNames.length) {
            rows.push(`<tr class="bg-sky-50/60"><td colspan="5" class="px-3 py-1.5 text-[9px] font-bold text-sky-600 uppercase tracking-wide border-t border-sky-100">Safety Unit (อื่นๆ)</td></tr>`);
            for (const unitName of orphanUnitNames) {
                const ur = unitMap[unitName];
                if (!ur) continue;
                const upct = ur.found > 0 ? Math.round((ur.achieved / ur.found) * 100) : null;
                const upctColor = upct === null ? 'text-slate-300' : upct >= 80 ? 'text-emerald-600' : upct >= 50 ? 'text-orange-500' : 'text-red-500';
                const uActive = _filterUnits.includes(unitName);
                rows.push(`<tr class="border-b border-sky-50 cursor-pointer transition-colors ${uActive ? 'bg-sky-50 border-sky-100' : 'hover:bg-sky-50/40'}"
                    onclick="window._issueFilterUnit('${unitName.replace(/'/g,"\\'")}')">
                    <td class="pl-5 pr-2 py-2 text-[10px] font-medium max-w-[110px] truncate ${uActive ? 'text-sky-700 font-bold' : 'text-slate-500'}" title="${unitName}">
                      <span class="inline-block w-1 h-3 rounded-full bg-sky-300 mr-1.5 align-middle"></span>${uActive ? `<span class="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 mr-1 align-middle"></span>` : ''}${unitName}
                    </td>
                    <td class="px-2 py-2 text-center font-bold text-xs ${ur.found === 0 ? 'text-slate-300' : uActive ? 'text-sky-600' : 'text-slate-500'}">${ur.found}</td>
                    <td class="px-2 py-2 text-center font-bold text-xs ${ur.achieved === 0 ? 'text-slate-300' : 'text-emerald-600'}">${ur.achieved}</td>
                    <td class="px-2 py-2 text-center font-bold text-xs ${ur.onProcess === 0 ? 'text-slate-300' : 'text-orange-500'}">${ur.onProcess}</td>
                    <td class="px-2 py-2 text-center font-bold text-xs ${upctColor}">${upct !== null ? upct+'%' : '—'}</td>
                </tr>`);
            }
        }
    }

    // Result uses only top-level department rows plus visible orphan units.
    // Child Safety Unit rows are already represented by their department and must not be double-counted.
    const resultSources = [
        ...deptNames.map(name => deptMap[name]).filter(Boolean),
        ...orphanUnitNames.map(name => unitMap[name]).filter(Boolean),
    ];
    const result = resultSources.reduce((sum, item) => ({
        found: sum.found + item.found,
        achieved: sum.achieved + item.achieved,
        onProcess: sum.onProcess + item.onProcess,
    }), { found:0, achieved:0, onProcess:0 });
    const resultPct = result.found > 0 ? Math.round((result.achieved / result.found) * 100) : null;
    const resultPctColor = resultPct === null ? 'text-slate-400' : resultPct >= 80 ? 'text-emerald-700' : resultPct >= 50 ? 'text-orange-600' : 'text-red-600';
    if (rows.length) rows.push(`<tr data-patrol-dept-result="true" class="sticky bottom-0 z-10 border-t-2 border-emerald-300 bg-emerald-50 shadow-[0_-2px_6px_rgba(15,118,110,0.08)]">
        <td class="px-3 py-2.5 text-[10px] font-black text-emerald-800">ผลรวม / Result</td>
        <td class="px-2 py-2.5 text-center text-xs font-black ${result.found === 0 ? 'text-slate-400' : 'text-slate-700'}">${result.found}</td>
        <td class="px-2 py-2.5 text-center text-xs font-black ${result.achieved === 0 ? 'text-slate-400' : 'text-emerald-700'}">${result.achieved}</td>
        <td class="px-2 py-2.5 text-center text-xs font-black ${result.onProcess === 0 ? 'text-slate-400' : 'text-orange-600'}">${result.onProcess}</td>
        <td class="px-2 py-2.5 text-center text-xs font-black ${resultPctColor}">${resultPct !== null ? resultPct+'%' : '—'}</td>
    </tr>`);

    tbody.innerHTML = rows.length
        ? rows.join('')
        : `<tr><td colspan="5" class="text-center py-6 text-xs text-slate-300">ไม่มีข้อมูล — กด ⚙ เพื่อตั้งค่า</td></tr>`;

    // Show/hide active filter badge above table
    const badge = document.getElementById('dept-stat-filter-badge');
    const labelEl = document.getElementById('dept-stat-filter-label');
    if (badge && labelEl) {
        const rankLabel = _filterRank ? `Rank ${_filterRank}` : '';
        const stopLabel = _filterStops.length ? `STOP ${_filterStops.join(', STOP ')}` : '';
        const activeLabel = _filterDepts.join(', ') || _filterUnits.join(', ') || rankLabel || stopLabel;
        if (activeLabel) {
            labelEl.textContent = activeLabel;
            badge.classList.remove('hidden');
            badge.classList.add('inline-flex');
        } else {
            badge.classList.add('hidden');
            badge.classList.remove('inline-flex');
        }
    }
}

// ─── Dept Stat Config (Admin: choose which depts to show) ─────────────────────
function _getDeptStatSelection() { return _deptStatSel; }
function _getUnitStatSelection() { return _unitStatSel; }

async function _saveDeptStatSelection(names) {
    _deptStatSel = (names && names.length) ? names : null;
    await API.put('/settings/patrol_dept_stat_selection', { value: _deptStatSel ? JSON.stringify(_deptStatSel) : null }).catch(() => {});
}
async function _saveUnitStatSelection(names) {
    _unitStatSel = (names && names.length) ? names : null;
    await API.put('/settings/patrol_unit_stat_selection', { value: _unitStatSel ? JSON.stringify(_unitStatSel) : null }).catch(() => {});
}

window.openAreaStatConfig = function() {
    if (!isAdmin) return;
    const allAreas = _patrolAreas.map(a => a.Name || a.AreaName).filter(Boolean);
    if (!allAreas.length) { showToast('ยังไม่มีพื้นที่ใน Master Data', 'error'); return; }

    const html = `
    <div class="space-y-3 text-sm">
      <p class="text-xs text-slate-500">เลือกพื้นที่ที่ต้องการแสดงในตารางสถิติ (ทุก user จะเห็นเหมือนกัน)</p>
      <div class="flex items-center justify-between mb-1">
        <span class="text-[10px] font-bold text-slate-400 uppercase">พื้นที่ทั้งหมด</span>
        <div class="flex gap-2">
          <button onclick="window._ascSelectAll(true)" class="text-[10px] text-emerald-600 font-semibold hover:underline">เลือกทั้งหมด</button>
          <span class="text-slate-300">|</span>
          <button onclick="window._ascSelectAll(false)" class="text-[10px] text-slate-400 font-semibold hover:underline">ล้าง</button>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1" id="area-stat-config-list">
        ${allAreas.map(name => {
            const checked = !_areaStatSel || _areaStatSel.includes(name);
            return `<label class="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-emerald-50 transition-colors ${checked ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200'}">
              <input type="checkbox" value="${name}" ${checked ? 'checked' : ''} class="asc-cb accent-emerald-600 w-3.5 h-3.5 flex-shrink-0">
              <span class="text-xs text-slate-700 truncate">${name}</span>
            </label>`;
        }).join('')}
      </div>
      <div class="flex gap-2 pt-2">
        <button onclick="window.closeModal()" class="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors">ยกเลิก</button>
        <button onclick="window._saveAreaStatConfig()" class="flex-1 py-2 rounded-xl text-sm font-bold text-white transition-all" style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก</button>
      </div>
    </div>`;
    openModal('ตั้งค่าพื้นที่ที่แสดง', html, 'max-w-md');
};

window._ascSelectAll = function(checked) {
    document.querySelectorAll('.asc-cb').forEach(cb => { cb.checked = checked; });
};

window._saveAreaStatConfig = async function() {
    const checked = [...document.querySelectorAll('.asc-cb:checked')].map(cb => cb.value);
    try {
        showToast('กำลังบันทึก...', 'info');
        await API.put('/settings/patrol_area_stat_selection', { value: checked.length ? JSON.stringify(checked) : null });
        _areaStatSel = checked.length ? checked : null;
        closeModal();
        renderAreaStats();
        showToast('บันทึกการตั้งค่าสำเร็จ', 'success');
    } catch { showToast('บันทึกไม่สำเร็จ', 'error'); }
};

window.openDeptStatConfig = function() {
    if (!isAdmin) return;
    const allDepts = _masterDepts.filter(d => d.Name);
    if (!allDepts.length) { showToast('ยังไม่มีส่วนงานใน Master Data', 'warning'); return; }
    const savedDept = _getDeptStatSelection();
    const savedUnit = _getUnitStatSelection();

    // Build tree: each dept with its units nested below
    const treeRows = allDepts.map(dept => {
        const deptId = dept.id || dept.ID;
        const deptChecked = !savedDept || savedDept.includes(dept.Name);
        const deptUnits = _masterUnits.filter(u => u.name && u.department_id === deptId);
        const unitRows = deptUnits.map(u => {
            const uChecked = !!(savedUnit && savedUnit.includes(u.name));
            return `<label class="flex items-center gap-2.5 pl-9 pr-4 py-1.5 cursor-pointer hover:bg-sky-50/70 transition-colors">
              <span class="inline-block w-px h-3.5 bg-slate-200 flex-shrink-0"></span>
              <input type="checkbox" class="unit-stat-chk w-3.5 h-3.5 rounded accent-sky-600 flex-shrink-0" value="${u.name.replace(/"/g,'&quot;')}" ${uChecked ? 'checked' : ''}>
              <span class="text-xs text-slate-600 truncate">${u.name}</span>
            </label>`;
        }).join('');
        return `<div class="border-b border-slate-50 last:border-0">
          <label class="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" class="dept-stat-chk w-4 h-4 rounded accent-emerald-600 flex-shrink-0" value="${dept.Name.replace(/"/g,'&quot;')}" ${deptChecked ? 'checked' : ''}>
            <span class="text-sm text-slate-700 font-semibold flex-1 truncate">${dept.Name}</span>
            ${deptUnits.length ? `<span class="text-[9px] text-slate-400 flex-shrink-0">${deptUnits.length} unit</span>` : ''}
          </label>
          ${unitRows}
        </div>`;
    }).join('');

    // Orphan units (no matching dept in master)
    const orphanUnits = _masterUnits.filter(u => u.name && !allDepts.some(d => (d.id||d.ID) === u.department_id));
    const orphanRows = orphanUnits.length ? `
      <div class="border-t border-sky-100 mt-1 pt-1">
        <p class="text-[9px] font-bold text-sky-500 uppercase px-4 py-1 tracking-wide">Safety Unit (ไม่มีส่วนงาน)</p>
        ${orphanUnits.map(u => {
            const uChecked = !!(savedUnit && savedUnit.includes(u.name));
            return `<label class="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-sky-50/60 transition-colors">
              <input type="checkbox" class="unit-stat-chk w-3.5 h-3.5 rounded accent-sky-600" value="${u.name.replace(/"/g,'&quot;')}" ${uChecked ? 'checked' : ''}>
              <span class="text-xs text-slate-600">${u.name}</span>
            </label>`;
        }).join('')}
      </div>` : '';

    openModal('ตั้งค่าที่แสดงในสถิติ', `
      <div class="space-y-3">
        <p class="text-xs text-slate-500">เลือกส่วนงาน/Safety Unit ที่แสดงในตาราง — Unit ที่เลือกจะเรียงแบบลำดับชั้นใต้ส่วนงานของตัวเอง</p>
        <div class="flex items-center justify-between">
          <button onclick="window._dscSelectAll('dept',true)" class="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 underline underline-offset-2">เลือกส่วนงานทั้งหมด</button>
          <button onclick="window._dscSelectAll('dept',false)" class="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline underline-offset-2">ล้างส่วนงาน</button>
        </div>
        <div class="max-h-72 overflow-y-auto rounded-xl border border-slate-100 bg-white">
          ${treeRows || '<p class="text-center py-6 text-xs text-slate-300">ยังไม่มีส่วนงาน</p>'}
          ${orphanRows}
        </div>
        <div class="flex gap-2 pt-1">
          <button onclick="window.closeModal&&window.closeModal()"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">ยกเลิก</button>
          <button onclick="window._saveDeptStatConfig()"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
            style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก</button>
        </div>
      </div>
    `, 'max-w-sm');
};

window._dscSelectAll = function(type, checked) {
    document.querySelectorAll(type === 'dept' ? '.dept-stat-chk' : '.unit-stat-chk').forEach(el => { el.checked = checked; });
};

window._deptStatSelectAll = (c) => window._dscSelectAll('dept', c);

window._saveDeptStatConfig = async function() {
    const deptChecked = [...document.querySelectorAll('.dept-stat-chk:checked')].map(el => el.value);
    const deptAll     = [...document.querySelectorAll('.dept-stat-chk')].map(el => el.value);
    const unitChecked = [...document.querySelectorAll('.unit-stat-chk:checked')].map(el => el.value);
    const unitAll     = [...document.querySelectorAll('.unit-stat-chk')].map(el => el.value);

    closeModal();
    showToast('กำลังบันทึก...', 'info');

    await Promise.all([
        _saveDeptStatSelection(deptChecked.length === deptAll.length ? null : deptChecked),
        _saveUnitStatSelection(unitChecked.length === 0 ? null : unitChecked),
    ]);

    renderDeptStats();
    showToast('บันทึกการตั้งค่าสำเร็จ', 'success');
};

const STOP_TYPES = [
    { key: 'STOP 1', labelTh: 'STOP 1 เครื่องจักร',   labelEn: 'ST1 Caught by Machine' },
    { key: 'STOP 2', labelTh: 'STOP 2 วัตถุหนักตกทับ', labelEn: 'ST2 Heavy Object' },
    { key: 'STOP 3', labelTh: 'STOP 3 ยานพาหนะ',       labelEn: 'ST3 Vehicle' },
    { key: 'STOP 4', labelTh: 'STOP 4 ตกจากที่สูง',    labelEn: 'ST4 Falls' },
    { key: 'STOP 5', labelTh: 'STOP 5 กระแสไฟฟ้า',     labelEn: 'ST5 Electrocution' },
    { key: 'STOP 6', labelTh: 'STOP 6 อื่นๆ',           labelEn: 'ST6 Other' },
];

function renderStopRankStats() {
    const tbody = document.getElementById('stop-rank-tbody');
    if (!tbody) return;

    // Build matrix: STOP type × Rank (A/B/C)
    const matrix = {};
    STOP_TYPES.forEach(s => { matrix[s.key] = { A:0, B:0, C:0 }; });
    // Issues without matching STOP go to STOP 6
    matrix['__other'] = { A:0, B:0, C:0 };

    _allIssues.forEach(issue => {
        const item = normalizeApiObject(issue);
        const rank  = item.Rank || '';
        if (!rank || !['A','B','C'].includes(rank)) return;
        const ids = _issueStopIds(item.HazardType);
        (ids.length ? ids : [6]).forEach(id => {
            const key = `STOP ${id}`;
            if (matrix[key]) matrix[key][rank]++;
        });
    });

    let totalA = 0, totalB = 0, totalC = 0;
    const rows = STOP_TYPES.map(s => {
        const r = matrix[s.key];
        totalA += r.A; totalB += r.B; totalC += r.C;
        const rowTotal = r.A + r.B + r.C;
        const rankA = r.A > 0 ? `<span class="font-bold text-red-500">${r.A}</span>` : `<span class="text-slate-300">0</span>`;
        const rankB = r.B > 0 ? `<span class="font-bold text-orange-400">${r.B}</span>` : `<span class="text-slate-300">0</span>`;
        const rankC = r.C > 0 ? `<span class="font-bold text-emerald-600">${r.C}</span>` : `<span class="text-slate-300">0</span>`;
        return `<tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-2.5 text-xs font-medium text-slate-700">${s.labelEn}</td>
            <td class="px-4 py-2.5 text-center text-xs">${rankA}</td>
            <td class="px-4 py-2.5 text-center text-xs">${rankB}</td>
            <td class="px-4 py-2.5 text-center text-xs">${rankC}</td>
            <td class="px-4 py-2.5 text-center text-xs font-bold ${rowTotal > 0 ? 'text-slate-600' : 'text-slate-300'}">${rowTotal || 0}</td>
        </tr>`;
    });

    const grandTotal = totalA + totalB + totalC;
    tbody.innerHTML = rows.join('') + `
        <tr class="border-t-2 border-slate-200 bg-slate-50">
            <td class="px-4 py-2.5 text-xs font-bold text-slate-700">Total</td>
            <td class="px-4 py-2.5 text-center"><span class="font-bold text-red-500">${totalA}</span></td>
            <td class="px-4 py-2.5 text-center"><span class="font-bold text-orange-400">${totalB}</span></td>
            <td class="px-4 py-2.5 text-center"><span class="font-bold text-emerald-600">${totalC}</span></td>
            <td class="px-4 py-2.5 text-center font-bold text-slate-700">${grandTotal}</td>
        </tr>`;
}


async function loadDashboardCharts() {
    try {
        renderAreaStats();
        renderDeptStats();
        renderStopRankStats();
        initPromoCarousel();
    } catch (e) { console.error('Chart error:', e); }
}

// ─── Patrol Attendance PDF Export ─────────────────────────────────────────────

window.exportPatrolPDF = async function(group) {
    if (!window.jspdf || !window.html2canvas) {
        showToast('ไม่พบ jsPDF หรือ html2canvas', 'error'); return;
    }
    const isMgmt = group === 'top_management';
    const rawMembers = isMgmt
        ? ([...(_overviewData?.members || [])].sort((a,b)=>(a.Total||0)-(b.Total||0)))
        : _svAllMembers;
    if (!rawMembers || !rawMembers.length) {
        showToast('ยังไม่มีข้อมูลสมาชิก', 'warning'); return;
    }

    const year = isMgmt
        ? (_overviewYear || new Date().getFullYear())
        : (parseInt(document.getElementById('sv-year-select')?.value) || new Date().getFullYear());
    const summary = isMgmt ? (_overviewData?.summary || {}) : (() => {
        const att = rawMembers.reduce((s,m)=>s+(m.attended||0),0);
        const required = rawMembers.reduce((s,m)=>s+(m.target||0),0);
        return { totalSessions: required, totalAttended: att, percent: required ? Math.round(att * 100 / required) : 0 };
    })();

    const now     = new Date();
    const dateStr = now.toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'});
    const stamp   = patrolPdfTimestamp(now);
    const docNo   = 'SP-'+(isMgmt?'MGT':'SUP')+'-'+year+'-'+stamp.slice(4,8)+'-'+stamp.slice(8);
    const fileName = patrolSafePdfFilename(docNo)+'.pdf';
    const groupLabel = isMgmt ? 'Top & Management' : 'Sec. & Supervisor';
    const K = "font-family:'Kanit',sans-serif;";

    const nameKey   = isMgmt ? 'Name'       : 'EmployeeName';
    const posKey    = isMgmt ? 'Position'   : 'position';
    const deptKey   = isMgmt ? 'Department' : 'department';
    const targetKey = isMgmt ? 'Total'      : 'target';
    const attendKey = isMgmt ? 'Attended'   : 'attended';
    const pctKey    = isMgmt ? 'Percent'    : 'percent';

    const ratingOf = pct => {
        if (pct>=80) return {r:5,bg:'#dcfce7',color:'#166534'};
        if (pct>=75) return {r:4,bg:'#d1fae5',color:'#065f46'};
        if (pct>=70) return {r:3,bg:'#dbeafe',color:'#1e40af'};
        if (pct>=65) return {r:2,bg:'#fef9c3',color:'#854d0e'};
        if (pct>=60) return {r:1,bg:'#ffedd5',color:'#9a3412'};
        return {r:0,bg:'#fee2e2',color:'#991b1b'};
    };
    const pctColor  = pct => pct>=75?'#059669':pct>=60?'#f59e0b':'#ef4444';
    const passCount = rawMembers.filter(m => _patrolOverviewFinalInfo(m, !isMgmt).label !== 'Below').length;
    const pdfRequiredToDate = rawMembers.reduce((sum, m) => sum + _patrolOverviewRequired(m, !isMgmt), 0);
    const pdfChecked = rawMembers.reduce((sum, m) => sum + _patrolOverviewAttended(m, !isMgmt), 0);
    const pdfAcceptedCoverage = rawMembers.reduce((sum, m) => sum + _patrolOverviewLeave(m, !isMgmt, 'acceptedCoverageToDate', _patrolOverviewAttended(m, !isMgmt)), 0);
    const pdfLeaveUsed = rawMembers.reduce((sum, m) => sum + _patrolOverviewLeave(m, !isMgmt, 'leaveYear'), 0);
    const pdfLeaveAllowed = rawMembers.reduce((sum, m) => sum + _patrolOverviewLeave(m, !isMgmt, 'allowedLeaveYear'), 0);
    const pdfOverLeave = rawMembers.reduce((sum, m) => sum + _patrolOverviewLeave(m, !isMgmt, 'overLeaveYear'), 0);
    const pdfAcceptedPct = pdfRequiredToDate > 0 ? Math.round(pdfAcceptedCoverage * 100 / pdfRequiredToDate) : 0;
    const spMember  = isMgmt && _spotlightMgmtId ? rawMembers.find(m=>m.EmployeeID===_spotlightMgmtId) : null;

    const totalPdfPages = isMgmt ? 2 : 3;
    const tablePageCount = totalPdfPages - 1;
    const rowsPerTablePage = Math.max(1, Math.ceil(rawMembers.length / tablePageCount));
    const rowPadY = rowsPerTablePage > 46 ? 2 : rowsPerTablePage > 36 ? 3 : 5;
    const nameFont = rowsPerTablePage > 46 ? 8.1 : rowsPerTablePage > 36 ? 8.7 : 9.5;
    const metaFont = rowsPerTablePage > 46 ? 7.6 : rowsPerTablePage > 36 ? 8.2 : 9;
    const headPadY = rowsPerTablePage > 46 ? 5 : 7;
    const progressHeight = rowsPerTablePage > 46 ? 4 : 5;

    // ── Shared HTML builders ──────────────────────────────────────────────────
    const THEAD = '<thead><tr style="background:linear-gradient(135deg,#064e3b,#0d9488)">'
        + '<th style="'+K+'padding:'+headPadY+'px 7px;color:rgba(255,255,255,.9);font-size:8.5px;text-align:center;width:24px">#</th>'
        + '<th style="'+K+'padding:'+headPadY+'px 7px;color:rgba(255,255,255,.9);font-size:8.5px;text-align:left">ชื่อ-สกุล</th>'
        + '<th style="'+K+'padding:'+headPadY+'px 7px;color:rgba(255,255,255,.9);font-size:8.5px;text-align:left">ตำแหน่ง</th>'
        + '<th style="'+K+'padding:'+headPadY+'px 7px;color:rgba(255,255,255,.9);font-size:8.5px;text-align:left">แผนก/ส่วนงาน</th>'
        + '<th style="'+K+'padding:'+headPadY+'px 7px;color:rgba(255,255,255,.9);font-size:8.5px;text-align:center">เป้า/ปี</th>'
        + '<th style="'+K+'padding:'+headPadY+'px 7px;color:rgba(255,255,255,.9);font-size:8.5px;text-align:center">เข้าร่วม</th>'
        + '<th style="'+K+'padding:'+headPadY+'px 7px;color:rgba(255,255,255,.9);font-size:8.5px;text-align:left;min-width:90px">ความคืบหน้า</th>'
        + '<th style="'+K+'padding:'+headPadY+'px 7px;color:rgba(255,255,255,.9);font-size:8.5px;text-align:center">Rating</th>'
        + '</tr></thead>';

    const makeRow = (m, idx) => {
        const pct=m[pctKey]||0, rt=ratingOf(pct), pc=pctColor(pct), bar=Math.min(pct,100);
        return '<tr style="background:'+(idx%2===0?'#f0fdf4':'#fff')+';border-bottom:1px solid #e8f5ee">'
            +'<td style="'+K+'padding:'+rowPadY+'px 7px;font-size:'+metaFont+'px;color:#94a3b8;text-align:center">'+(idx+1)+'</td>'
            +'<td style="'+K+'padding:'+rowPadY+'px 7px;font-size:'+nameFont+'px;font-weight:600;color:#1e293b;line-height:1.15">'+(m[nameKey]||'—')+'</td>'
            +'<td style="'+K+'padding:'+rowPadY+'px 7px;font-size:'+metaFont+'px;color:#475569;line-height:1.15">'+(m[posKey]||'—')+'</td>'
            +'<td style="'+K+'padding:'+rowPadY+'px 7px;font-size:'+metaFont+'px;color:#64748b;line-height:1.15">'+(m[deptKey]||'—')+'</td>'
            +'<td style="'+K+'padding:'+rowPadY+'px 7px;font-size:'+nameFont+'px;font-weight:700;color:#475569;text-align:center">'+(m[targetKey]||0)+'</td>'
            +'<td style="'+K+'padding:'+rowPadY+'px 7px;font-size:'+nameFont+'px;font-weight:700;color:#059669;text-align:center">'+(m[attendKey]||0)+'</td>'
            +'<td style="'+K+'padding:'+rowPadY+'px 9px"><div style="display:flex;align-items:center;gap:4px">'
            +'<div style="flex:1;height:'+progressHeight+'px;background:#e2e8f0;border-radius:3px;overflow:hidden"><div style="height:100%;width:'+bar+'%;background:'+pc+';border-radius:3px"></div></div>'
            +'<span style="'+K+'font-size:'+metaFont+'px;font-weight:700;color:'+pc+';min-width:25px;text-align:right">'+pct+'%</span>'
            +'</div></td>'
            +'<td style="padding:'+rowPadY+'px 7px;text-align:center">'
            +(rt.r>0?'<span style="'+K+'background:'+rt.bg+';color:'+rt.color+';font-size:7.5px;font-weight:700;padding:1px 6px;border-radius:20px">R'+rt.r+'</span>':'<span style="'+K+'color:#cbd5e1;font-size:'+metaFont+'px">—</span>')
            +'</td></tr>';
    };

    const HEADER_BLOCK = '<div style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%);padding:22px 36px 18px;position:relative;overflow:hidden">'
        +'<div style="position:absolute;top:-50px;right:-50px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.05)"></div>'
        +'<div style="position:relative;z-index:1">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">'
        +'<div>'
        +'<div style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.15);border-radius:20px;padding:3px 10px;margin-bottom:8px">'
        +'<span style="width:5px;height:5px;background:#34d399;border-radius:50%;display:inline-block"></span>'
        +'<span style="'+K+'color:rgba(255,255,255,.85);font-size:9px;font-weight:600;letter-spacing:1.2px">OFFICIAL REPORT</span>'
        +'</div>'
        +'<div style="'+K+'color:white;font-size:18px;font-weight:700;line-height:1.2;margin-bottom:3px">รายงานการเดินตรวจความปลอดภัย</div>'
        +'<div style="'+K+'color:rgba(255,255,255,.65);font-size:11px">'+groupLabel+' Safety Patrol · ประจำปี '+year+'</div>'
        +'</div>'
        +'<div style="text-align:right">'
        +'<div style="'+K+'color:rgba(255,255,255,.45);font-size:8.5px;margin-bottom:2px">เลขที่เอกสาร</div>'
        +'<div style="'+K+'color:white;font-size:11px;font-weight:700">'+docNo+'</div>'
        +'<div style="'+K+'color:rgba(255,255,255,.45);font-size:8.5px;margin-top:5px;margin-bottom:2px">วันที่สร้างรายงาน</div>'
        +'<div style="'+K+'color:rgba(255,255,255,.65);font-size:10px">'+dateStr+'</div>'
        +'</div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">'
        +'<div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px 12px;text-align:center"><div style="'+K+'color:white;font-size:20px;font-weight:700">'+(summary.totalSessions||'—')+'</div><div style="'+K+'color:rgba(255,255,255,.55);font-size:9px;margin-top:2px">เซสชันทั้งหมด</div></div>'
        +'<div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px 12px;text-align:center"><div style="'+K+'color:white;font-size:20px;font-weight:700">'+(summary.totalAttended||'—')+'</div><div style="'+K+'color:rgba(255,255,255,.55);font-size:9px;margin-top:2px">เข้าร่วมรวม</div></div>'
        +'<div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px 12px;text-align:center"><div style="'+K+'color:white;font-size:20px;font-weight:700">'+rawMembers.length+'</div><div style="'+K+'color:rgba(255,255,255,.55);font-size:9px;margin-top:2px">จำนวนสมาชิก</div></div>'
        +'<div style="background:rgba(255,255,255,.18);border-radius:10px;padding:10px 12px;text-align:center;border:1px solid rgba(255,255,255,.2)"><div style="'+K+'color:#6ee7b7;font-size:20px;font-weight:700">'+(summary.percent||0)+'%</div><div style="'+K+'color:rgba(255,255,255,.55);font-size:9px;margin-top:2px">อัตราเข้าร่วม</div></div>'
        +'</div></div></div>';

    const SPOTLIGHT_BLOCK = spMember ? (() => {
        const sp=spMember, spPct=sp[pctKey]||0, spBar=Math.min(spPct,100);
        const spBg=spPct>=80?'#dcfce7':spPct>=60?'#fef9c3':'#fee2e2';
        const spClr=spPct>=80?'#166534':spPct>=60?'#854d0e':'#991b1b';
        const spLbl=spPct>=80?'On Track':spPct>=60?'At Risk':'Behind';
        const spBarC=spPct>=75?'#059669':spPct>=60?'#f59e0b':'#ef4444';
        return '<div style="'+K+'background:#f8fafc;padding:11px 36px;border-left:4px solid #059669">'
            +'<div style="display:flex;align-items:center;gap:14px">'
            +'<div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,#059669,#0d9488);display:flex;align-items:center;justify-content:center;color:white;font-size:15px;font-weight:700;flex-shrink:0">'+(sp[nameKey]||'?').charAt(0)+'</div>'
            +'<div style="flex:1;min-width:0">'
            +'<div style="display:flex;align-items:center;gap:7px;margin-bottom:2px"><span style="'+K+'font-size:9px;font-weight:700;color:#059669;letter-spacing:1px">★ SPOTLIGHT</span><span style="'+K+'background:'+spBg+';color:'+spClr+';font-size:8.5px;font-weight:700;padding:2px 7px;border-radius:20px">'+spLbl+'</span></div>'
            +'<div style="'+K+'font-size:13px;font-weight:700;color:#1e293b">'+(sp[nameKey]||'—')+'</div>'
            +'<div style="'+K+'font-size:9.5px;color:#64748b">'+(sp[posKey]||'—')+' · '+(sp[deptKey]||'—')+'</div>'
            +'</div>'
            +'<div style="width:150px;flex-shrink:0">'
            +'<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="'+K+'font-size:9px;color:#94a3b8">'+(sp[attendKey]||0)+' / '+(sp[targetKey]||0)+' ครั้ง</span><span style="'+K+'font-size:11px;font-weight:700;color:'+spBarC+'">'+spPct+'%</span></div>'
            +'<div style="height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden"><div style="height:100%;width:'+spBar+'%;background:'+spBarC+';border-radius:3px"></div></div>'
            +'</div></div></div>';
    })() : '';

    const TABLE_LABEL = '<div style="'+K+'padding:10px 36px 0;display:flex;align-items:center;gap:6px">'
        +'<div style="width:3px;height:14px;background:#059669;border-radius:2px"></div>'
        +'<span style="'+K+'font-size:10px;font-weight:700;color:#334155">รายชื่อสมาชิก ('+rawMembers.length+' คน)</span></div>';

    const CONT_LABEL = '<div style="'+K+'padding:8px 36px 0;display:flex;justify-content:space-between;align-items:center">'
        +'<span style="'+K+'font-size:9px;color:#94a3b8;font-style:italic">รายชื่อสมาชิก (ต่อ)</span>'
        +'<span style="'+K+'font-size:9px;color:#94a3b8">'+groupLabel+' · ประจำปี '+year+'</span></div>';

    const PAGE_S = K+'width:794px;height:1122px;overflow:hidden;background:white;box-sizing:border-box;display:flex;flex-direction:column';

    const PAGE_FOOTER = '<div style="height:32px;background:linear-gradient(135deg,#064e3b,#0d9488);display:flex;align-items:center;justify-content:space-between;padding:0 36px;flex-shrink:0">'
        +'<span style="'+K+'color:rgba(255,255,255,.65);font-size:8px">TSH Safety Core Activity System · รายงานสร้างโดยระบบอัตโนมัติ</span>'
        +'<span style="'+K+'color:rgba(255,255,255,.65);font-size:8px">'+docNo+' · ประจำปี '+year+'</span>'
        +'</div>';

    // ── Build page HTML array ─────────────────────────────────────────────────
    const pageHTMLs = [];
    const useFormalAttendancePdf = true;
    if (useFormalAttendancePdf) {
        const mgmtDonePct = rawMembers.length ? Math.round(passCount / rawMembers.length * 100) : 0;
        const mgmtFirstRows = isMgmt ? 18 : 20;
        const mgmtRowsPerPage = isMgmt ? 24 : 20;
        const mgmtPage = body => '<div style="'+K+'width:794px;height:1122px;background:#fff;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;color:#1e293b;font-size:11px">'+body+'</div>';
        const mgmtFooter = label => '<div style="margin-top:auto;padding:8px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">'
            +'<span style="'+K+'font-size:8.8px">Safety Patrol Attendance Report · Thai Summit Harness Co., Ltd.</span>'
            +'<span style="'+K+'font-size:8.8px">'+docNo+' · '+label+'</span>'
            +'</div>';
        const mgmtHeader = subtitle => '<div style="background:#065f46;color:#fff;padding:18px 28px;flex-shrink:0">'
            +'<div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start">'
            +'<div><p style="'+K+'font-size:10px;opacity:.82;margin:0 0 3px">Thai Summit Harness Co., Ltd. · Safety Summary Report</p>'
            +'<h1 style="'+K+'font-size:21px;font-weight:900;margin:0;line-height:1.18">Safety Patrol Attendance Report</h1>'
            +'<p style="'+K+'font-size:11px;opacity:.9;margin:5px 0 0">'+subtitle+'</p></div>'
            +'<div style="'+K+'text-align:right;font-size:9.5px;line-height:1.55;opacity:.92"><div>'+groupLabel+'</div><div>Period: '+year+'</div><div>Generated: '+dateStr+'</div><div style="margin-top:4px;font-size:8.5px;opacity:.75">'+docNo+'</div></div>'
            +'</div></div>';
        const sectionTitle = (title, sub = '') => '<div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px"><div><h2 style="'+K+'font-size:14px;font-weight:900;color:#065f46;margin:0">'+title+'</h2>'+(sub ? '<p style="'+K+'font-size:9.5px;color:#64748b;margin:2px 0 0">'+sub+'</p>' : '')+'</div></div>';
        const bar = (pct, color, h = 7) => '<div style="height:'+h+'px;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="height:100%;width:'+Math.max(0, Math.min(100, pct))+'%;background:'+color+';border-radius:999px"></div></div>';
        const kpiCard = (label, value, tone, sub = '') => '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:11px;text-align:center;min-height:72px">'
            +'<div style="'+K+'font-size:24px;font-weight:900;color:'+tone+';line-height:1">'+value+'</div>'
            +'<div style="'+K+'font-size:9.5px;color:#475569;margin-top:6px;font-weight:800">'+label+'</div>'
            +(sub ? '<div style="'+K+'font-size:8.5px;color:#94a3b8;margin-top:2px">'+sub+'</div>' : '')
            +'</div>';
        const compactRow = (m, idx) => {
            const pct = m[pctKey] || 0;
            const rt = ratingOf(pct);
            const st = _patrolOverviewFinalInfo(m, !isMgmt);
            const leaveUsed = _patrolOverviewLeave(m, !isMgmt, 'leaveYear');
            const leaveAllowed = _patrolOverviewLeave(m, !isMgmt, 'allowedLeaveYear');
            const acceptedLeave = _patrolOverviewLeave(m, !isMgmt, 'acceptedLeaveYear');
            const leaveRemaining = _patrolOverviewLeave(m, !isMgmt, 'leaveRemainingYear');
            const overLeave = _patrolOverviewLeave(m, !isMgmt, 'overLeaveYear');
            const acceptedCoverage = _patrolOverviewLeave(m, !isMgmt, 'acceptedCoverageToDate', m[attendKey] || 0);
            return '<tr style="background:'+(idx % 2 ? '#fff' : '#f8fafc')+';border-bottom:1px solid #e5e7eb">'
                +'<td style="'+K+'padding:7px 8px;font-size:9px;color:#64748b;text-align:center">'+(idx+1)+'</td>'
                +'<td style="'+K+'padding:7px 8px;font-size:9.3px;font-weight:700;color:#0f172a">'+escHtml(m[nameKey] || '-')
                +'<div style="'+K+'font-size:8px;font-weight:500;color:#64748b;margin-top:1px">'+escHtml(m[posKey] || '-')+'</div></td>'
                +'<td style="'+K+'padding:7px 8px;font-size:8.6px;color:#475569">'+escHtml(m[deptKey] || '-')+'</td>'
                +'<td style="'+K+'padding:7px 8px;font-size:9px;font-weight:700;text-align:center;color:#334155">'+(m[targetKey] || 0)+'</td>'
                +'<td style="'+K+'padding:7px 8px;font-size:9px;font-weight:700;text-align:center;color:#047857">'+(m[attendKey] || 0)+'</td>'
                +'<td style="'+K+'padding:7px 8px;font-size:9px;font-weight:900;text-align:center;color:#0369a1">'+acceptedCoverage+'</td>'
                +'<td style="'+K+'padding:7px 8px;width:105px"><div style="display:flex;align-items:center;gap:5px"><div style="flex:1;height:5px;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="height:100%;width:'+Math.min(pct,100)+'%;background:'+pctColor(pct)+'"></div></div><span style="'+K+'font-size:8.5px;font-weight:800;color:'+pctColor(pct)+';width:30px;text-align:right">'+pct+'%</span></div></td>'
                +'<td style="'+K+'padding:7px 8px;text-align:center"><div style="'+K+'font-size:8.2px;font-weight:900;color:'+(overLeave > 0 ? '#dc2626' : '#0369a1')+'">'+leaveUsed+'/'+leaveAllowed+'</div><div style="'+K+'font-size:6.8px;color:#64748b;font-weight:700;margin-top:1px;white-space:nowrap">A '+acceptedLeave+' R '+leaveRemaining+(overLeave > 0 ? ' O '+overLeave : '')+'</div></td>'
                +'<td style="'+K+'padding:7px 8px;text-align:center"><span style="display:inline-block;min-width:28px;background:'+rt.bg+';color:'+rt.color+';border-radius:999px;padding:2px 6px;font-size:8px;font-weight:800">R'+rt.r+'</span></td>'
                +'<td style="'+K+'padding:7px 8px;text-align:center"><span style="display:inline-block;background:'+st.bg+';color:'+st.color+';border-radius:999px;padding:2px 7px;font-size:8px;font-weight:800;white-space:nowrap">'+st.label+'</span></td>'
                +'</tr>';
        };
        const mgmtTableHead = '<thead><tr style="background:#064e3b;color:white">'
            +'<th style="'+K+'padding:8px;font-size:8.6px;text-align:center;width:30px">#</th>'
            +'<th style="'+K+'padding:8px;font-size:8.6px;text-align:left">ชื่อ / ตำแหน่ง</th>'
            +'<th style="'+K+'padding:8px;font-size:8.6px;text-align:left;width:105px">แผนก</th>'
            +'<th style="'+K+'padding:8px;font-size:8.6px;text-align:center;width:42px">เป้า</th>'
            +'<th style="'+K+'padding:8px;font-size:8.6px;text-align:center;width:46px">Checked</th>'
            +'<th style="'+K+'padding:8px;font-size:8.6px;text-align:center;width:48px">Accepted</th>'
            +'<th style="'+K+'padding:8px;font-size:8.6px;text-align:left;width:105px">ความคืบหน้า</th>'
            +'<th style="'+K+'padding:8px;font-size:8.6px;text-align:center;width:62px">Leave</th>'
            +'<th style="'+K+'padding:8px;font-size:8.6px;text-align:center;width:44px">Rating</th>'
            +'<th style="'+K+'padding:8px;font-size:8.6px;text-align:center;width:72px">Final</th>'
            +'</tr></thead>';
        const approvalSummaryBlock = compact => '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:'+(compact ? '11px 13px' : '15px 16px')+'">'
            +'<div style="'+K+'font-size:'+(compact ? '11px' : '12.5px')+';font-weight:900;color:#065f46;margin-bottom:'+(compact ? '5px' : '8px')+'">Approval Summary / สรุปเพื่อการรับรอง</div>'
            +'<div style="'+K+'font-size:'+(compact ? '8.8px' : '11px')+';line-height:'+(compact ? '1.55' : '1.8')+';color:#334155">จำนวนสมาชิก '+groupLabel+' ทั้งหมด '+rawMembers.length+' คน รอบที่ต้องทำถึงปัจจุบัน '+pdfRequiredToDate+' ครั้ง เดินจริง '+pdfChecked+' ครั้ง ลา '+pdfLeaveUsed+'/'+pdfLeaveAllowed+' ครั้ง (เกินสิทธิ์ '+pdfOverLeave+') และ Accepted Coverage '+pdfAcceptedCoverage+'/'+pdfRequiredToDate+' ครั้ง ('+pdfAcceptedPct+'%) มีผู้ผ่านเกณฑ์หรือผ่านแบบยอมรับสิทธิ์ลา '+passCount+' คน คิดเป็น '+mgmtDonePct+'% ของสมาชิกทั้งหมด</div>'
            +'</div>';
        const approvalSignBlock = compact => '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:'+(compact ? '10px' : '16px')+';margin-top:'+(compact ? '10px' : '28px')+'">'
            +['ผู้จัดทำรายงาน','ผู้ตรวจสอบ','ผู้อนุมัติ'].map(role => '<div style="background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:'+(compact ? '27px 10px 10px' : '44px 14px 16px')+';text-align:center"><div style="border-bottom:1.2px solid #64748b;margin-bottom:'+(compact ? '7px' : '12px')+';height:1px"></div><div style="'+K+'font-size:'+(compact ? '8.2px' : '10px')+';color:#64748b">(........................................)</div><div style="'+K+'font-size:'+(compact ? '9px' : '11px')+';font-weight:900;color:#334155;margin-top:'+(compact ? '5px' : '8px')+'">'+role+'</div><div style="'+K+'font-size:'+(compact ? '7.8px' : '9px')+';color:#64748b;margin-top:'+(compact ? '5px' : '8px')+'">วันที่ ......../......../.........</div></div>').join('')
            +'</div>';
        const approvalNoteBlock = '<div style="margin-top:auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;color:#64748b;font-size:8.8px;line-height:1.6">เอกสารฉบับนี้สร้างจากระบบ TSH Safety Core Activity โดยอ้างอิงข้อมูลการบันทึก Safety Patrol ในระบบ ณ วันที่สร้างรายงาน เลขที่เอกสาร '+docNo+'</div>';
        let supervisorApprovalInlined = false;
        pageHTMLs.push(mgmtPage(
            mgmtHeader(groupLabel+' Safety Patrol · ประจำปี '+year)
            +'<div style="flex:1;padding:18px 28px 14px;display:flex;flex-direction:column;gap:12px;min-height:0">'
            +sectionTitle('1. Report Summary / ภาพรวมการเข้าร่วม', 'สรุปผล Safety Patrol ของกลุ่ม '+groupLabel+' ประจำปี '+year)
            +'<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:7px">'
            +kpiCard('สมาชิก', rawMembers.length, '#0f766e', 'Members')
            +kpiCard('รอบถึงปัจจุบัน', pdfRequiredToDate, '#2563eb', 'Required')
            +kpiCard('เดินจริง', pdfChecked, '#059669', 'Checked')
            +kpiCard('Accepted Coverage', pdfAcceptedCoverage, '#0f766e', pdfAcceptedPct+'%')
            +kpiCard('Leave', pdfLeaveUsed+'/'+pdfLeaveAllowed, pdfOverLeave > 0 ? '#dc2626' : '#0369a1', 'Used / Allowed')
            +kpiCard('Over Leave', pdfOverLeave, pdfOverLeave > 0 ? '#dc2626' : '#059669', 'Over allowance')
            +'</div>'
            +'<div style="display:grid;grid-template-columns:1.1fr .9fr;gap:12px">'
            +'<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px"><div style="'+K+'font-size:12px;font-weight:900;color:#065f46;margin-bottom:8px">Key Notes / ประเด็นสำคัญ</div><div style="'+K+'font-size:10px;color:#334155;line-height:1.75">แสดงผลการเข้าร่วม Safety Patrol ของกลุ่ม '+groupLabel+' พร้อมเป้าหมายรายบุคคล จำนวนครั้งที่เข้าร่วม อัตราความคืบหน้า Rating และสถานะการผ่านเกณฑ์</div></div>'
            +'<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center"><div style="'+K+'font-size:12px;font-weight:900;color:#065f46;margin-bottom:7px">Pass Rate</div><div style="'+K+'font-size:42px;font-weight:900;line-height:1;color:'+(mgmtDonePct >= 75 ? '#059669' : mgmtDonePct >= 50 ? '#d97706' : '#dc2626')+'">'+mgmtDonePct+'%</div><div style="'+K+'font-size:9.5px;color:#64748b;margin:8px 0 10px">Pass '+passCount+' / '+rawMembers.length+' members</div>'+bar(mgmtDonePct, mgmtDonePct >= 75 ? '#059669' : mgmtDonePct >= 50 ? '#d97706' : '#dc2626', 8)+'</div>'
            +'</div>'
            +sectionTitle('2. Member Attendance Register', 'รายการที่ 1-'+Math.min(mgmtFirstRows, rawMembers.length)+' / '+rawMembers.length)
            +'<div style="background:#fff;border:1px solid #e2e8f0;border-bottom:2px solid #065f46;border-radius:12px;overflow:hidden;flex:1;min-height:0">'
            +'<table style="width:100%;border-collapse:collapse">'+mgmtTableHead+'<tbody>'+rawMembers.slice(0, mgmtFirstRows).map((m, idx) => compactRow(m, idx)).join('')+'</tbody></table>'
            +'</div>'
            +'<div style="'+K+'font-size:8.5px;color:#64748b">หมายเหตุ: หน้านี้แสดงรายการที่ 1-'+Math.min(mgmtFirstRows, rawMembers.length)+' / '+rawMembers.length+' รายการ โดยหน้าถัดไปจะแสดงรายการต่อเนื่องตามลำดับ</div>'
            +'</div>'
            +mgmtFooter('Member Detail 1-'+Math.min(mgmtFirstRows, rawMembers.length)+' / '+rawMembers.length)
        ));

        for (let start = mgmtFirstRows; start < rawMembers.length; start += mgmtRowsPerPage) {
            const slice = rawMembers.slice(start, start + mgmtRowsPerPage);
            const rangeLabel = `${start + 1}-${Math.min(start + slice.length, rawMembers.length)} / ${rawMembers.length}`;
            const inlineSupervisorApproval = !isMgmt && start + slice.length >= rawMembers.length && slice.length <= 8;
            if (inlineSupervisorApproval) supervisorApprovalInlined = true;
            pageHTMLs.push(mgmtPage(
                mgmtHeader('รายละเอียดการเข้าร่วมรายบุคคล · รายการที่ '+rangeLabel)
                +'<div style="flex:1;padding:18px 28px 14px;min-height:0">'
                +sectionTitle('2. Member Attendance Register / รายการต่อเนื่อง', 'รายการที่ '+rangeLabel+' ตามลำดับรายชื่อ')
                +'<div style="background:#fff;border:1px solid #e2e8f0;border-bottom:2px solid #065f46;border-radius:12px;overflow:hidden">'
                +'<table style="width:100%;border-collapse:collapse">'+mgmtTableHead+'<tbody>'+slice.map((m, idx) => compactRow(m, start + idx)).join('')+'</tbody></table>'
                +'</div>'
                +'<div style="'+K+'font-size:8.5px;color:#64748b;margin-top:9px">หมายเหตุ: Rating คำนวณจากอัตราการเข้าร่วมจริง ส่วน Final Status ใช้ Pass % และสิทธิ์ลาที่ระบบกำหนด</div>'
                +(inlineSupervisorApproval ? '<div style="margin-top:12px">'+approvalSummaryBlock(true)+approvalSignBlock(true)+'</div>' : '')
                +'</div>'
                +mgmtFooter(inlineSupervisorApproval ? 'Member Detail & Approval '+rangeLabel : 'Member Detail '+rangeLabel)
            ));
        }

        if (isMgmt || !supervisorApprovalInlined) pageHTMLs.push(mgmtPage(
            mgmtHeader('รับรองผลและลงนาม · ประจำปี '+year)
            +'<div style="flex:1;padding:18px 28px 18px;display:flex;flex-direction:column;gap:14px">'
            +sectionTitle('3. Follow-up Notes / Approval', 'สรุปผลการเข้าร่วมเพื่อรับรองและติดตามต่อ')
            +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">'
            +kpiCard('Checked', pdfChecked, '#059669', 'เดินจริง')
            +kpiCard('Accepted Coverage', pdfAcceptedCoverage, '#0f766e', pdfAcceptedPct+'%')
            +kpiCard('Leave', pdfLeaveUsed+'/'+pdfLeaveAllowed, pdfOverLeave > 0 ? '#dc2626' : '#0369a1', 'Used / Allowed')
            +kpiCard('Over Leave', pdfOverLeave, pdfOverLeave > 0 ? '#dc2626' : '#059669', 'เกินสิทธิ์')
            +'</div>'
            +approvalSummaryBlock(false)
            +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
            +'<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px"><div style="'+K+'font-size:11.5px;font-weight:900;color:#065f46;margin-bottom:7px">Key Follow-up</div><div style="'+K+'font-size:10px;line-height:1.7;color:#475569">ติดตามสมาชิกที่ Final Status ยังต่ำกว่าเป้าหมาย และวางแผนเพิ่มรอบเข้าร่วม Safety Patrol โดยพิจารณาสิทธิ์ลาและจำนวนลาที่เกินสิทธิ์ร่วมด้วย</div></div>'
            +'<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px"><div style="'+K+'font-size:11.5px;font-weight:900;color:#065f46;margin-bottom:7px">Report Scope</div><div style="'+K+'font-size:10px;line-height:1.7;color:#475569">กลุ่ม: '+groupLabel+'<br>ปี: '+year+'<br>เลขที่เอกสาร: '+docNo+'</div></div>'
            +'</div>'
            +approvalSignBlock(false)
            +approvalNoteBlock
            +'</div>'
            +mgmtFooter('Approval')
        ));
    } else {
    const chunks = [];
    for (let i = 0; i < tablePageCount; i++) {
        const startIdx = i * rowsPerTablePage;
        chunks.push({
            rows: rawMembers.slice(startIdx, startIdx + rowsPerTablePage),
            isFirst: i === 0,
            startIdx,
        });
    }
    chunks.forEach(chunk => {
        const rowsHtml = chunk.rows.map((m,j) => makeRow(m, chunk.startIdx+j)).join('');
        if (chunk.isFirst) {
            pageHTMLs.push('<div style="'+PAGE_S+'">'
                +'<div style="flex:1;min-height:0">'
                +HEADER_BLOCK+SPOTLIGHT_BLOCK+TABLE_LABEL
                +'<div style="padding:4px 36px 0"><table style="width:100%;border-collapse:collapse">'+THEAD+'<tbody>'+rowsHtml+'</tbody></table></div>'
                +'</div>'
                +PAGE_FOOTER
                +'</div>');
        } else {
            pageHTMLs.push('<div style="'+PAGE_S+'">'
                +'<div style="flex:1;min-height:0">'
                +CONT_LABEL
                +'<div style="padding:4px 36px 0"><table style="width:100%;border-collapse:collapse">'+THEAD+'<tbody>'+rowsHtml+'</tbody></table></div>'
                +'</div>'
                +PAGE_FOOTER
                +'</div>');
        }
    });

    // ── Summary page (always last) ────────────────────────────────────────────
    const donePct = rawMembers.length ? Math.round(passCount/rawMembers.length*100) : 0;
    const barW75  = Math.min(donePct,100);
    const cRatings = [['5','≥80%','#dcfce7','#166534'],['4','≥75%','#d1fae5','#065f46'],['3','≥70%','#dbeafe','#1e40af'],['2','≥65%','#fef9c3','#854d0e'],['1','≥60%','#ffedd5','#9a3412'],['0','<60%','#fee2e2','#991b1b']];
    pageHTMLs.push('<div style="'+K+'width:794px;height:1122px;background:white;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden">'
        // ── Green header (same family as report header)
        +'<div style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%);padding:28px 60px 24px;position:relative;overflow:hidden;flex-shrink:0">'
        +'<div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.05)"></div>'
        +'<div style="position:relative;z-index:1">'
        +'<div style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.15);border-radius:20px;padding:3px 10px;margin-bottom:10px">'
        +'<span style="width:5px;height:5px;background:#34d399;border-radius:50%;display:inline-block"></span>'
        +'<span style="'+K+'color:rgba(255,255,255,.85);font-size:9px;font-weight:600;letter-spacing:1.2px">SUMMARY REPORT</span>'
        +'</div>'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-end">'
        +'<div>'
        +'<div style="'+K+'color:white;font-size:22px;font-weight:700;line-height:1.2;margin-bottom:4px">สรุปผลการประเมิน</div>'
        +'<div style="'+K+'color:rgba(255,255,255,.65);font-size:11px">'+groupLabel+' Safety Patrol · ประจำปี '+year+'</div>'
        +'</div>'
        +'<div style="text-align:right">'
        +'<div style="'+K+'color:rgba(255,255,255,.45);font-size:8px;margin-bottom:2px">เลขที่เอกสาร</div>'
        +'<div style="'+K+'color:white;font-size:11px;font-weight:700">'+docNo+'</div>'
        +'<div style="'+K+'color:rgba(255,255,255,.45);font-size:8px;margin-top:5px;margin-bottom:2px">วันที่สร้างรายงาน</div>'
        +'<div style="'+K+'color:rgba(255,255,255,.65);font-size:10px">'+dateStr+'</div>'
        +'</div></div></div></div>'
        // ── Main content — flex:1, evenly spaced sections
        +'<div style="flex:1;padding:40px 60px;display:flex;flex-direction:column;justify-content:space-evenly;min-height:0">'
        // Section A: Big pass number + progress bar
        +'<div style="display:flex;align-items:flex-end;gap:28px">'
        +'<div><div style="'+K+'font-size:76px;font-weight:700;color:#059669;line-height:1">'+passCount+'</div>'
        +'<div style="'+K+'font-size:13px;color:#64748b;margin-top:8px">จาก '+rawMembers.length+' คน ผ่านเกณฑ์ (≥75%)</div></div>'
        +'<div style="flex:1;padding-bottom:18px">'
        +'<div style="display:flex;justify-content:space-between;margin-bottom:10px">'
        +'<span style="'+K+'font-size:12px;color:#94a3b8">อัตราผ่านเกณฑ์</span>'
        +'<span style="'+K+'font-size:16px;font-weight:700;color:#059669">'+donePct+'%</span></div>'
        +'<div style="height:12px;background:#e2e8f0;border-radius:8px;overflow:hidden"><div style="height:100%;width:'+barW75+'%;background:linear-gradient(135deg,#059669,#0d9488);border-radius:8px"></div></div>'
        +'</div></div>'
        // Divider
        +'<div style="height:1px;background:#e2e8f0"></div>'
        // Section B: Criteria chips
        +'<div>'
        +'<div style="'+K+'font-size:10px;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px">Evaluation Criteria · Weight 0.4</div>'
        +'<div style="display:flex;gap:12px">'
        +cRatings.map(([r,p,bg,c])=>'<div style="'+K+'background:'+bg+';border-radius:12px;padding:16px 0;text-align:center;flex:1"><div style="font-size:22px;font-weight:700;color:'+c+'">R'+r+'</div><div style="font-size:10px;color:'+c+';margin-top:4px">'+p+'</div></div>').join('')
        +'</div></div>'
        // Divider
        +'<div style="height:1px;background:#e2e8f0"></div>'
        // Section C: Stats grid
        +'<div>'
        +'<div style="'+K+'font-size:10px;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px">สถิติรวม</div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">'
        +'<div style="background:#f8fafc;border-radius:14px;padding:20px;text-align:center;border:1px solid #e2e8f0"><div style="'+K+'font-size:30px;font-weight:700;color:#1e293b">'+(summary.totalSessions||'—')+'</div><div style="'+K+'font-size:10px;color:#94a3b8;margin-top:5px">เซสชันทั้งหมด</div></div>'
        +'<div style="background:#f0fdf4;border-radius:14px;padding:20px;text-align:center;border:1px solid #d1fae5"><div style="'+K+'font-size:30px;font-weight:700;color:#059669">'+(summary.totalAttended||'—')+'</div><div style="'+K+'font-size:10px;color:#6ee7b7;margin-top:5px">เข้าร่วมรวม</div></div>'
        +'<div style="background:linear-gradient(135deg,#064e3b,#0d9488);border-radius:14px;padding:20px;text-align:center"><div style="'+K+'font-size:30px;font-weight:700;color:#6ee7b7">'+(summary.percent||0)+'%</div><div style="'+K+'font-size:10px;color:rgba(255,255,255,.65);margin-top:5px">อัตราเข้าร่วม</div></div>'
        +'</div></div>'
        +'</div>'
        // ── Footer
        +'<div style="padding:14px 60px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">'
        +'<span style="'+K+'font-size:8px;color:#94a3b8">TSH Safety Core Activity System · รายงานสร้างโดยระบบอัตโนมัติ</span>'
        +'<span style="'+K+'font-size:8px;color:#94a3b8">'+dateStr+' · '+docNo+'</span>'
        +'</div></div>');
    }

    // ── Render each page as fixed A4 HTML → PDF ───────────────────────────────
    showLoading('กำลังสร้าง PDF...');
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 300));

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });

        const renderPage = async html => {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1';
            el.innerHTML = html;
            document.body.appendChild(el);
            const c = await window.html2canvas(el.firstElementChild, {
                scale:2, useCORS:true, logging:false, backgroundColor:'#ffffff', windowWidth:794
            });
            document.body.removeChild(el);
            return c;
        };

        for (let i = 0; i < pageHTMLs.length; i++) {
            if (i > 0) pdf.addPage();
            const canvas = await renderPage(pageHTMLs[i]);
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 210, 297);
        }

        const total = pdf.getNumberOfPages();
        for (let p = 1; p <= total; p++) {
            pdf.setPage(p);
            pdf.setFontSize(7.5); pdf.setTextColor(148,163,184);
            pdf.text('Page '+p+' / '+total, 200, 293, { align:'right' });
            pdf.text(docNo, 10, 293);
        }

        pdf.save(fileName);
        showToast(`ดาวน์โหลด PDF สำเร็จ: ${fileName}`, 'success');
    } catch (err) {
        console.error('PDF export error:', err);
        showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error');
    } finally {
        hideLoading();
    }
};
