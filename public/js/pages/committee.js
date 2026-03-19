import { API } from '../api.js';
import {
  showLoading, hideLoading, showError, showToast,
  openModal, closeModal, showConfirmationModal, showDocumentModal
} from '../ui.js';

let allCommittees = [];
let committeeEventListenersInitialized = false;
let tempSubCommittees = [];

const getCommitteeId = (c) => c?.id ?? c?.CommitteeID;
const normalizeId   = (v) => String(v ?? '');

/* ─── helpers ─── */
function parseSubData(maybeJson) {
  if (!maybeJson) return [];
  if (Array.isArray(maybeJson)) return maybeJson;
  if (typeof maybeJson === 'string') {
    try { return JSON.parse(maybeJson); } catch { return []; }
  }
  return [];
}

function normalizeCommittee(raw) {
  if (!raw) return null;
  const c = { ...raw };
  c.id = getCommitteeId(raw);
  c.SubCommitteeData = parseSubData(raw.SubCommitteeData);
  return c;
}

function getDaysRemaining(endDate) {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return null;
  return Math.ceil((end - new Date()) / 864e5);
}

function getMonthsElapsed(startDate) {
  if (!startDate) return null;
  const s = new Date(startDate);
  if (isNaN(s.getTime())) return null;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth()));
}

function getTermTotalMonths(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const s = new Date(startDate), e = new Date(endDate);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24 * 30.44)));
}

function getTermProgressPct(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const s = new Date(startDate).getTime(), e = new Date(endDate).getTime(), n = Date.now();
  if (isNaN(s) || isNaN(e) || e <= s) return null;
  return Math.min(100, Math.max(0, Math.round((n - s) / (e - s) * 100)));
}

function fmtDate(d, short = false) {
  if (!d) return 'N/A';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('th-TH', {
    year: 'numeric', month: short ? 'short' : 'long', ...(short ? {} : { day: 'numeric' })
  });
}

function getDeptInitials(name) {
  if (!name) return '??';
  const w = name.trim().split(/\s+/);
  return w.length >= 2 ? (w[0][0] + w[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
}

const AVATAR_PALETTE = [
  { bg: '#d1fae5', fg: '#065f46' }, { bg: '#cffafe', fg: '#164e63' },
  { bg: '#ede9fe', fg: '#4c1d95' }, { bg: '#fce7f3', fg: '#831843' },
  { bg: '#fef3c7', fg: '#78350f' }, { bg: '#dbeafe', fg: '#1e3a8a' },
  { bg: '#fee2e2', fg: '#7f1d1d' }, { bg: '#ecfdf5', fg: '#14532d' },
];
const avatarColor = (i) => AVATAR_PALETTE[i % AVATAR_PALETTE.length];

/* ═══════════════════════════════════════════════
   MAIN LOADER
═══════════════════════════════════════════════ */
export async function loadCommitteePage() {
  const container = document.getElementById('committee-page');
  window.closeModal = closeModal;

  if (!committeeEventListenersInitialized) {
    setupCommitteeEventListeners();
    committeeEventListenersInitialized = true;
  }

  const currentUser = TSHSession.getUser();
  const isAdmin = currentUser && (
    currentUser.role?.toLowerCase() === 'admin' ||
    currentUser.Role?.toLowerCase() === 'admin' ||
    currentUser.id === 'admin'
  );

  container.innerHTML = `
    <div class="flex flex-col items-center justify-center h-64 text-slate-400">
      <div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-3"></div>
      <p class="text-sm">กำลังโหลดข้อมูล...</p>
    </div>`;

  try {
    const res  = await API.get('/pagedata/committees');
    if (res?.success === false) throw new Error(res.message || 'โหลดข้อมูลคณะกรรมการไม่สำเร็จ');

    const data = res.data ?? res;
    let items  = [];
    if (data.current || data.past) {
      if (data.current) items.push(data.current);
      if (Array.isArray(data.past)) items.push(...data.past);
    } else if (Array.isArray(data)) {
      items = data;
    } else if (data?.items) {
      items = data.items;
    }

    items = items.map(normalizeCommittee).filter(Boolean);
    const current   = items.find(x => Number(x.IsCurrent) === 1) || items[0];
    const currentId = normalizeId(getCommitteeId(current));
    const past      = items.filter(x => normalizeId(getCommitteeId(x)) !== currentId);

    allCommittees = [current, ...past].filter(Boolean);
    renderPage(container, { current, past }, isAdmin, items.length);

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="m-6 bg-red-50 text-red-600 p-4 rounded-xl text-center border border-red-100">${err.message}</div>`;
  }
}

/* ═══════════════════════════════════════════════
   PAGE RENDER
═══════════════════════════════════════════════ */
function renderPage(container, { current, past }, isAdmin, totalCount) {
  const subNow       = current?.SubCommitteeData?.length ?? 0;
  const daysLeft     = getDaysRemaining(current?.TermEndDate);
  const monthsNow    = getMonthsElapsed(current?.TermStartDate);

  /* ── expiry alert banner ── */
  let alertBanner = '';
  const warnSvg = `<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
  </svg>`;
  if (daysLeft !== null) {
    if (daysLeft < 0)
      alertBanner = `<div class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold bg-red-50 border border-red-200 text-red-700">${warnSvg}คณะกรรมการชุดปัจจุบันหมดวาระแล้ว — กรุณาแต่งตั้งคณะกรรมการชุดใหม่</div>`;
    else if (daysLeft <= 30)
      alertBanner = `<div class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold bg-red-50 border border-red-200 text-red-700">${warnSvg}วาระคณะกรรมการจะสิ้นสุดใน <strong>${daysLeft} วัน</strong> — กรุณาเตรียมการแต่งตั้งชุดใหม่โดยด่วน</div>`;
    else if (daysLeft <= 60)
      alertBanner = `<div class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold bg-amber-50 border border-amber-200 text-amber-700">${warnSvg}วาระคณะกรรมการจะสิ้นสุดใน <strong>${daysLeft} วัน</strong> — ควรเริ่มเตรียมการแต่งตั้งชุดใหม่</div>`;
  }

  /* ── days chip ── */
  let daysChip = '<span class="text-slate-400 text-lg font-bold">—</span>';
  if (daysLeft !== null) {
    if (daysLeft < 0)
      daysChip = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700"><span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>หมดวาระ</span>`;
    else if (daysLeft <= 90)
      daysChip = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>เหลือ ${daysLeft} วัน</span>`;
    else
      daysChip = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>เหลือ ${daysLeft} วัน</span>`;
  }

  container.innerHTML = `
  <div class="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in pb-10">

    <!-- ── HEADER ── -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
          <span class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 10px rgba(5,150,105,0.3)">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857
                   M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857
                   m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </span>
          คณะกรรมการความปลอดภัย
        </h1>
        <p class="text-sm text-slate-500 mt-1 ml-11">โครงสร้างคณะกรรมการและคณะทำงานด้านความปลอดภัยในการทำงาน</p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0 flex-wrap">
        ${allCommittees.length > 0 ? `
        <button id="btn-export-excel"
          class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200
                 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/>
          </svg>
          Export Excel
        </button>` : ''}
        ${isAdmin ? `
        <button id="btn-add-committee"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-lg active:scale-95"
          style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 12px rgba(5,150,105,0.25)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          เพิ่มคณะกรรมการ
        </button>` : ''}
      </div>
    </div>

    ${alertBanner}

    <!-- ── STATS BAR (4 cards) ── -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#ecfdf5">
          <svg class="w-5 h-5" style="color:#059669" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04
                 A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
        </div>
        <div>
          <p class="text-2xl font-bold text-slate-800">${totalCount}</p>
          <p class="text-xs text-slate-500">คณะกรรมการทั้งหมด</p>
        </div>
      </div>

      <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#f0fdfa">
          <svg class="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5
                 M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
          </svg>
        </div>
        <div>
          <p class="text-2xl font-bold text-slate-800">${subNow}</p>
          <p class="text-xs text-slate-500">คณะทำงานย่อย (ปัจจุบัน)</p>
        </div>
      </div>

      <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#fefce8">
          <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div>
          ${daysChip}
          <p class="text-xs text-slate-500 mt-0.5">วาระปัจจุบัน</p>
        </div>
      </div>

      <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#eff6ff">
          <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </div>
        <div>
          <p class="text-2xl font-bold text-slate-800">${monthsNow ?? '—'}</p>
          <p class="text-xs text-slate-500">เดือนที่ดำรงตำแหน่ง</p>
        </div>
      </div>
    </div>

    <!-- ── CURRENT HERO CARD ── -->
    <div id="current-committee-container">
      ${current
        ? createCurrentHeroCard(current, isAdmin)
        : `<div class="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
             <svg class="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                 d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857
                    M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857
                    m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
             </svg>
             <p>ยังไม่มีข้อมูลคณะกรรมการ</p>
           </div>`
      }
    </div>

    <!-- ── PAST COMMITTEES TIMELINE ── -->
    ${past.length > 0 ? `
    <div>
      <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div class="flex items-center gap-3 min-w-0">
          <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">ประวัติย้อนหลัง</h3>
          <span class="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-semibold rounded-full">${past.length} รายการ</span>
        </div>
        <span class="hidden sm:block flex-1 h-px bg-slate-200"></span>
        <input id="past-search" type="text" placeholder="ค้นหาชื่อคณะกรรมการ..."
               class="text-sm border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-full sm:w-56
                      focus:outline-none focus:border-emerald-400 transition-colors">
      </div>
      <div id="past-committee-container" class="relative">
        <div class="absolute left-5 top-5 bottom-5 w-0.5 bg-gradient-to-b from-slate-300 via-slate-200 to-transparent pointer-events-none"></div>
        <div class="space-y-3" id="past-timeline-list">
          ${past.map((c, i) => createTimelineItem(c, i, isAdmin)).join('')}
        </div>
      </div>
      <p id="past-empty-msg" class="hidden text-center text-sm text-slate-400 py-6">ไม่พบรายการที่ค้นหา</p>
    </div>` : ''}

  </div>`;

  /* past search */
  const searchInput = document.getElementById('past-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const items = document.querySelectorAll('#past-timeline-list > div[data-committee-item]');
      let visible = 0;
      items.forEach(el => {
        const title = el.querySelector('[data-title]')?.textContent?.toLowerCase() ?? '';
        const show  = !q || title.includes(q);
        el.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      document.getElementById('past-empty-msg')?.classList.toggle('hidden', visible > 0);
    });
  }
}

/* ═══════════════════════════════════════════════
   CURRENT COMMITTEE — HERO CARD
═══════════════════════════════════════════════ */
function createCurrentHeroCard(committee, isAdmin) {
  const subList    = committee.SubCommitteeData ?? [];
  const daysLeft   = getDaysRemaining(committee.TermEndDate);
  const pct        = getTermProgressPct(committee.TermStartDate, committee.TermEndDate);
  const totalMonths = getTermTotalMonths(committee.TermStartDate, committee.TermEndDate);
  const elapsedMonths = getMonthsElapsed(committee.TermStartDate);
  const withDoc    = subList.filter(s => s.activeLink).length;

  const dayColor = daysLeft === null ? '#a7f3d0' : daysLeft < 0 ? '#fca5a5' : daysLeft <= 90 ? '#fcd34d' : '#6ee7b7';
  const dayLabel = daysLeft === null ? '—' : daysLeft < 0 ? 'หมดแล้ว' : String(daysLeft);

  const barColor = pct === null ? '#6ee7b7' : pct >= 100 ? '#f87171' : pct >= 80 ? '#fbbf24' : '#34d399';
  const pctDisplay = pct !== null ? `${pct}%` : '—';

  return `
  <div class="bg-white rounded-2xl overflow-hidden border border-emerald-100"
       style="box-shadow:0 4px 30px rgba(5,150,105,0.1)">

    <!-- gradient banner -->
    <div class="relative p-6 pb-5 overflow-hidden"
         style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
      <div class="absolute inset-0 opacity-10 pointer-events-none">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs><pattern id="hero-dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="1.2" fill="white"/>
          </pattern></defs>
          <rect width="100%" height="100%" fill="url(#hero-dots)"/>
        </svg>
      </div>
      <div class="absolute -right-10 -top-10 w-48 h-48 rounded-full pointer-events-none"
           style="background:radial-gradient(circle,rgba(255,255,255,0.1),transparent 70%)"></div>

      <div class="relative z-10 flex justify-between items-start gap-4">
        <div class="flex-1 min-w-0">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3
                       border border-white/30 bg-white/20 text-white backdrop-blur-sm">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse inline-block"></span>
            ชุดปัจจุบัน
          </span>
          <h2 class="text-xl md:text-2xl font-bold text-white leading-snug" title="${committee.CommitteeTitle}">${committee.CommitteeTitle}</h2>
          <p class="flex items-center gap-1.5 mt-2 text-sm" style="color:rgba(167,243,208,0.9)">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            ${fmtDate(committee.TermStartDate)} — ${fmtDate(committee.TermEndDate)}
          </p>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button id="btn-copy-committee" data-id="${committee.id}"
            class="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors" title="คัดลอกข้อมูล">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          </button>
          <button id="btn-print-committee" data-id="${committee.id}"
            class="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors" title="พิมพ์">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
            </svg>
          </button>
          ${isAdmin ? `
          <button data-id="${committee.id}" class="btn-edit-committee p-2 rounded-lg text-white/70
                  hover:text-white hover:bg-white/20 transition-colors" title="แก้ไข">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
          </button>
          <button data-id="${committee.id}" class="btn-delete-committee p-2 rounded-lg text-white/70
                  hover:text-red-200 hover:bg-red-500/20 transition-colors" title="ลบ">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6
                   m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>` : ''}
        </div>
      </div>

      <!-- mini stats inside banner -->
      <div class="relative z-10 grid grid-cols-3 gap-3 mt-5">
        <div class="rounded-xl px-3 py-2.5 text-center"
             style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
          <p class="text-xl font-bold text-white">${subList.length}</p>
          <p class="text-xs mt-0.5" style="color:rgba(167,243,208,0.8)">คณะทำงานย่อย</p>
        </div>
        <div class="rounded-xl px-3 py-2.5 text-center"
             style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
          <p class="text-xl font-bold text-white">${withDoc}</p>
          <p class="text-xs mt-0.5" style="color:rgba(167,243,208,0.8)">มีเอกสารแนบ</p>
        </div>
        <div class="rounded-xl px-3 py-2.5 text-center"
             style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
          <p class="text-xl font-bold" style="color:${dayColor}">${dayLabel}</p>
          <p class="text-xs mt-0.5" style="color:rgba(167,243,208,0.8)">วันคงเหลือ</p>
        </div>
      </div>

      <!-- term progress bar -->
      ${pct !== null ? `
      <div class="relative z-10 mt-4">
        <div class="flex justify-between items-center mb-1.5">
          <span class="text-xs font-semibold" style="color:rgba(167,243,208,0.9)">ความคืบหน้าวาระ</span>
          <span class="text-xs font-bold" style="color:${barColor}">${pctDisplay} · ${elapsedMonths ?? 0} / ${totalMonths ?? '?'} เดือน</span>
        </div>
        <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.15)">
          <div class="h-full rounded-full transition-all duration-700"
               style="width:${Math.min(100, pct)}%;background:${barColor};box-shadow:0 0 8px ${barColor}80"></div>
        </div>
      </div>` : ''}
    </div>

    <!-- body -->
    <div class="p-6">
      <!-- document buttons -->
      <div class="flex flex-wrap gap-2 mb-6">
        ${committee.MainOrgChartLink ? `
        <a href="${committee.MainOrgChartLink}"
           data-action="view-doc" data-title="ผังองค์กรหลัก"
           class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white
                  transition-all hover:shadow-lg active:scale-95"
           style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 12px rgba(5,150,105,0.25)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2
                 a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14
                 a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
          ผังองค์กรหลัก
        </a>` : ''}
        ${committee.AppointmentDocLink ? `
        <a href="${committee.AppointmentDocLink}"
           data-action="view-doc" data-title="คำสั่งแต่งตั้ง"
           class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                  border border-slate-200 text-slate-600 bg-white transition-all hover:border-emerald-300
                  hover:text-emerald-700 hover:shadow-md active:scale-95">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414
                 A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/>
          </svg>
          คำสั่งแต่งตั้ง
        </a>` : ''}
      </div>

      <!-- sub-committees -->
      <div>
        <div class="flex items-center gap-3 mb-4">
          <span class="h-px flex-1 bg-slate-200"></span>
          <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
            คณะทำงานย่อย (Sub-Committees)
          </h4>
          <span class="h-px flex-1 bg-slate-200"></span>
        </div>

        ${subList.length > 0
          ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
               ${subList.map((sc, i) => subCard(sc, i)).join('')}
             </div>`
          : `<div class="text-center py-10 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
               ยังไม่มีข้อมูลคณะทำงานย่อย
             </div>`
        }
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════
   SUB-COMMITTEE CARD
═══════════════════════════════════════════════ */
function subCard(sc, i) {
  const c    = avatarColor(i);
  const init = getDeptInitials(sc.department);
  return `
  <div class="group bg-white rounded-xl p-4 border border-slate-100
              hover:border-emerald-200 hover:shadow-md transition-all duration-200">
    <div class="flex items-start gap-3">
      <div class="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
           style="background:${c.bg};color:${c.fg}">${init}</div>
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-slate-700 text-sm leading-snug truncate" title="${sc.department}">${sc.department}</p>
        ${sc.chairperson ? `
        <p class="text-xs text-slate-500 mt-1 flex items-center gap-1">
          <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
          <span>ประธาน: <span class="font-medium text-slate-600">${sc.chairperson}</span></span>
        </p>` : ''}
        ${sc.memberCount ? `
        <p class="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
          <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857
                 M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857
                 m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <span>${sc.memberCount} คน</span>
        </p>` : ''}
        ${sc.activeLink
          ? `<a href="${sc.activeLink}" data-action="view-doc" data-title="ผัง: ${sc.department}"
                class="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline">
               <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                   d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293
                      l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
               </svg>ดูเอกสาร
             </a>
             <div class="flex items-center gap-1 mt-1">
               <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
               <span class="text-xs text-slate-400">มีเอกสารแนบ</span>
             </div>`
          : `<span class="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-400">
               <span class="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block"></span>
               ยังไม่มีเอกสาร
             </span>`
        }
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════
   PAST COMMITTEE — TIMELINE ITEM
═══════════════════════════════════════════════ */
function createTimelineItem(committee, index, isAdmin) {
  const buddYear = committee.TermStartDate
    ? new Date(committee.TermStartDate).getFullYear() + 543
    : '—';
  const subList  = committee.SubCommitteeData ?? [];
  const bodyId   = `tl-body-${index}`;

  return `
  <div class="flex gap-4 group" data-committee-item>
    <!-- timeline dot -->
    <div class="flex-shrink-0 flex flex-col items-center" style="width:2.5rem">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold z-10 relative
                  border-2 border-white shadow-sm transition-all group-hover:shadow-md"
           style="background:#f1f5f9;color:#64748b">${buddYear}</div>
    </div>

    <!-- card -->
    <div class="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden
                transition-all duration-200 hover:border-slate-300 hover:shadow-sm mb-1">
      <!-- header (always visible) -->
      <div class="flex items-center justify-between px-4 py-3 cursor-pointer select-none timeline-toggle"
           data-target="${bodyId}">
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-slate-700 text-sm truncate" data-title>${committee.CommitteeTitle}</p>
          <p class="text-xs text-slate-400 mt-0.5">
            ${fmtDate(committee.TermStartDate, true)} — ${fmtDate(committee.TermEndDate, true)}
            · <span class="font-medium">${subList.length}</span> คณะทำงานย่อย
          </p>
        </div>

        <div class="flex items-center gap-1 flex-shrink-0 ml-3" onclick="event.stopPropagation()">
          ${isAdmin ? `
          <button data-id="${committee.id}" data-action="restore-committee"
            class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200
                   text-slate-500 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
            title="ตั้งเป็นชุดปัจจุบัน">
            <svg class="w-3.5 h-3.5 inline-block mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Restore
          </button>
          <button data-id="${committee.id}"
            class="btn-edit-committee p-1.5 text-slate-300 hover:text-emerald-600
                   hover:bg-emerald-50 rounded-lg transition-colors" title="แก้ไข">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
          </button>
          <button data-id="${committee.id}"
            class="btn-delete-committee p-1.5 text-slate-300 hover:text-red-600
                   hover:bg-red-50 rounded-lg transition-colors" title="ลบ">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6
                   m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>` : ''}
          <svg class="tl-icon w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0"
               fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </div>

      <!-- expandable body -->
      <div id="${bodyId}" class="hidden border-t border-slate-100">
        <div class="p-4">
          <div class="flex flex-wrap gap-2 mb-4">
            ${committee.MainOrgChartLink ? `
            <a href="${committee.MainOrgChartLink}" data-action="view-doc" data-title="ผังองค์กรหลัก"
               class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white
                      transition-all hover:shadow-md active:scale-95"
               style="background:linear-gradient(135deg,#059669,#0d9488)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2
                     a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14
                     a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
              ผังองค์กรหลัก
            </a>` : ''}
            ${committee.AppointmentDocLink ? `
            <a href="${committee.AppointmentDocLink}" data-action="view-doc" data-title="คำสั่งแต่งตั้ง"
               class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
                      border border-slate-200 text-slate-600 bg-white hover:border-emerald-300 hover:text-emerald-700 transition-all">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414
                     A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/>
              </svg>
              คำสั่งแต่งตั้ง
            </a>` : ''}
          </div>

          ${subList.length > 0
            ? `<div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                 ${subList.map((sc, i) => subCard(sc, i)).join('')}
               </div>`
            : `<p class="text-sm text-slate-400 text-center py-4">ไม่มีคณะทำงานย่อย</p>`
          }
        </div>
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════
   EXPORT EXCEL
═══════════════════════════════════════════════ */
function exportCommitteeExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('ไม่พบ XLSX library — กรุณารีเฟรชหน้าและลองใหม่', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();

  /* Sheet 1: committees */
  const committeeRows = allCommittees.map(c => ({
    'ชื่อคณะกรรมการ': c.CommitteeTitle || '',
    'วันเริ่มวาระ': c.TermStartDate ? fmtDate(c.TermStartDate) : '',
    'วันสิ้นสุดวาระ': c.TermEndDate ? fmtDate(c.TermEndDate) : '',
    'ชุดปัจจุบัน': Number(c.IsCurrent) === 1 ? 'ใช่' : 'ไม่',
    'จำนวนคณะทำงานย่อย': (c.SubCommitteeData ?? []).length,
    'ลิงก์ผังองค์กร': c.MainOrgChartLink || '',
    'ลิงก์คำสั่งแต่งตั้ง': c.AppointmentDocLink || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(committeeRows), 'คณะกรรมการ');

  /* Sheet 2: sub-committees */
  const subRows = [];
  allCommittees.forEach(c => {
    (c.SubCommitteeData ?? []).forEach(sc => {
      subRows.push({
        'คณะกรรมการหลัก': c.CommitteeTitle || '',
        'วาระ (พ.ศ.)': c.TermStartDate ? new Date(c.TermStartDate).getFullYear() + 543 : '',
        'ชุดปัจจุบัน': Number(c.IsCurrent) === 1 ? 'ใช่' : 'ไม่',
        'คณะทำงานย่อย': sc.department || '',
        'ประธาน': sc.chairperson || '',
        'จำนวนสมาชิก': sc.memberCount || '',
        'ลิงก์เอกสาร': sc.activeLink || '',
      });
    });
  });
  if (subRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subRows), 'คณะทำงานย่อย');
  }

  const today = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `committee_${today}.xlsx`);
  showToast('Export Excel สำเร็จ', 'success');
}

/* ═══════════════════════════════════════════════
   PRINT STRUCTURE
═══════════════════════════════════════════════ */
function printCommitteeStructure(committee) {
  const subList = committee.SubCommitteeData ?? [];
  const win = window.open('', '_blank', 'width=800,height=700');
  if (!win) { showToast('กรุณาอนุญาต popup สำหรับการพิมพ์', 'error'); return; }

  const subHtml = subList.length > 0
    ? subList.map((sc, i) => `
        <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#ffffff'}">
          <td style="padding:8px 12px;border:1px solid #e2e8f0">${sc.department || ''}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">${sc.chairperson || '—'}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center">${sc.memberCount || '—'}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">${sc.activeLink ? 'มีเอกสาร' : '—'}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" style="padding:12px;text-align:center;color:#94a3b8">ไม่มีคณะทำงานย่อย</td></tr>';

  win.document.open();
  win.document.write(`<!DOCTYPE html><html lang="th"><head>
    <meta charset="UTF-8">
    <title>คณะกรรมการความปลอดภัย</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Kanit', 'Sarabun', sans-serif; color: #1e293b; padding: 32px; font-size: 14px; }
      h1 { font-size: 18px; font-weight: 700; color: #065f46; margin-bottom: 4px; }
      .meta { font-size: 12px; color: #64748b; margin-bottom: 20px; }
      .section-title { font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase;
                       letter-spacing: 0.05em; margin: 20px 0 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { background: #064e3b; color: white; padding: 10px 12px; text-align: left; border: 1px solid #047857; }
      @media print {
        body { padding: 20px; }
        button { display: none; }
      }
    </style>
  </head><body>
    <h1>${committee.CommitteeTitle || ''}</h1>
    <p class="meta">วาระ: ${fmtDate(committee.TermStartDate)} — ${fmtDate(committee.TermEndDate)} &nbsp;|&nbsp; พิมพ์เมื่อ: ${new Date().toLocaleDateString('th-TH', { year:'numeric',month:'long',day:'numeric' })}</p>
    <div class="section-title">คณะทำงานย่อย (${subList.length} หน่วยงาน)</div>
    <table>
      <tr>
        <th>หน่วยงาน / คณะทำงาน</th>
        <th>ประธาน</th>
        <th style="text-align:center">จำนวนสมาชิก</th>
        <th>เอกสาร</th>
      </tr>
      ${subHtml}
    </table>
    <script>window.onload = function(){ window.print(); }<\/script>
  </body></html>`);
  win.document.close();
}

/* ═══════════════════════════════════════════════
   COPY TO CLIPBOARD
═══════════════════════════════════════════════ */
function copyCommitteeText(committee) {
  const subList = committee.SubCommitteeData ?? [];
  let text = `${committee.CommitteeTitle}\n`;
  text += `วาระ: ${fmtDate(committee.TermStartDate)} — ${fmtDate(committee.TermEndDate)}\n`;
  if (subList.length > 0) {
    text += `\nคณะทำงานย่อย (${subList.length} หน่วยงาน):\n`;
    subList.forEach((sc, i) => {
      text += `  ${i + 1}. ${sc.department}`;
      if (sc.chairperson) text += ` (ประธาน: ${sc.chairperson})`;
      if (sc.memberCount) text += ` — ${sc.memberCount} คน`;
      text += '\n';
    });
  }
  navigator.clipboard.writeText(text).then(
    () => showToast('คัดลอกข้อมูลสำเร็จ', 'success'),
    () => showToast('ไม่สามารถคัดลอกได้', 'error')
  );
}

/* ═══════════════════════════════════════════════
   FORM  (เพิ่ม / แก้ไข)
═══════════════════════════════════════════════ */
function openCommitteeForm(committee = null) {
  const isEditing = !!committee;
  tempSubCommittees = committee ? parseSubData(committee.SubCommitteeData) : [];

  const html = `
  <form id="committee-form" class="space-y-5 px-1" novalidate>
    <input type="hidden" name="id" value="${committee ? getCommitteeId(committee) : ''}">

    <div class="flex items-start gap-2.5 bg-emerald-50 text-emerald-800 p-3.5 rounded-xl
                text-sm border border-emerald-100">
      <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      กรุณากรอกข้อมูลวาระและลิงก์เอกสารให้ถูกต้อง
    </div>

    <!-- ชื่อคณะกรรมการ -->
    <div>
      <label class="block text-sm font-bold text-slate-700 mb-1.5">
        ชื่อคณะกรรมการ <span class="text-red-500">*</span>
      </label>
      <input type="text" name="CommitteeTitle" class="form-input w-full rounded-xl"
             value="${committee?.CommitteeTitle || ''}" required
             placeholder="เช่น คณะกรรมการความปลอดภัย วาระ 2567–2568">
    </div>

    <!-- วันวาระ -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-bold text-slate-700 mb-1.5">วันเริ่มวาระ</label>
        <input type="text" id="TermStartDate" name="TermStartDate"
               class="form-input w-full rounded-xl bg-white" placeholder="เลือกวันที่"
               value="${committee?.TermStartDate ? new Date(committee.TermStartDate).toISOString().split('T')[0] : ''}">
      </div>
      <div>
        <label class="block text-sm font-bold text-slate-700 mb-1.5">วันสิ้นสุดวาระ</label>
        <input type="text" id="TermEndDate" name="TermEndDate"
               class="form-input w-full rounded-xl bg-white" placeholder="เลือกวันที่"
               value="${committee?.TermEndDate ? new Date(committee.TermEndDate).toISOString().split('T')[0] : ''}">
      </div>
    </div>

    <!-- ผังองค์กรหลัก -->
    <div class="space-y-2">
      <label class="block text-sm font-bold text-slate-700">ผังองค์กรหลัก</label>
      <div class="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit text-xs font-semibold">
        <button type="button" id="org-tab-url"
                class="px-3 py-1.5 rounded-lg transition-all bg-white text-slate-700 shadow-sm">ลิงก์ URL</button>
        <button type="button" id="org-tab-file"
                class="px-3 py-1.5 rounded-lg transition-all text-slate-400 hover:text-slate-600">อัปโหลดไฟล์</button>
      </div>
      <div id="org-panel-url">
        <input type="text" name="MainOrgChartLink" id="org-link-input" class="form-input w-full rounded-xl text-sm"
               placeholder="วางลิงก์เอกสาร (URL)" value="${committee?.MainOrgChartLink || ''}">
      </div>
      <div id="org-panel-file" class="hidden">
        <input type="file" name="MainOrgChartFile" accept=".pdf,.png,.jpg,.jpeg"
               class="block w-full text-xs text-slate-500
                      file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                      file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700
                      hover:file:bg-emerald-100 transition-all">
        <p class="text-xs text-slate-400 mt-1">รองรับ PDF / PNG / JPG — สูงสุด 20 MB</p>
      </div>
    </div>

    <!-- คำสั่งแต่งตั้ง -->
    <div class="space-y-2">
      <label class="block text-sm font-bold text-slate-700">คำสั่งแต่งตั้ง (ไฟล์/ลิงก์)</label>
      <div class="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit text-xs font-semibold">
        <button type="button" id="apt-tab-url"
                class="px-3 py-1.5 rounded-lg transition-all bg-white text-slate-700 shadow-sm">ลิงก์ URL</button>
        <button type="button" id="apt-tab-file"
                class="px-3 py-1.5 rounded-lg transition-all text-slate-400 hover:text-slate-600">อัปโหลดไฟล์</button>
      </div>
      <div id="apt-panel-url">
        <input type="text" name="AppointmentDocLink" id="apt-link-input" class="form-input w-full rounded-xl text-sm"
               placeholder="วางลิงก์คำสั่งแต่งตั้ง (URL)" value="${committee?.AppointmentDocLink || ''}">
      </div>
      <div id="apt-panel-file" class="hidden">
        <input type="file" name="AppointmentDocFile" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
               class="block w-full text-xs text-slate-500
                      file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                      file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100 transition-all">
        <p class="text-xs text-slate-400 mt-1">รองรับ PDF / Word / PNG / JPG — สูงสุด 20 MB</p>
      </div>
    </div>

    <!-- เป็นชุดปัจจุบัน -->
    <div class="flex items-center gap-2.5">
      <input type="checkbox" id="IsCurrent" name="IsCurrent"
             class="w-4 h-4 rounded text-emerald-600 cursor-pointer"
             ${committee?.IsCurrent ? 'checked' : ''}>
      <label for="IsCurrent" class="text-sm font-medium text-slate-700 cursor-pointer">
        ตั้งเป็นชุดปัจจุบัน
      </label>
    </div>

    <!-- ── SUB-COMMITTEE INLINE EDITOR ── -->
    <div class="border-t border-slate-200 pt-5">
      <div class="flex justify-between items-center mb-3">
        <label class="text-sm font-bold text-slate-700">คณะทำงานย่อย</label>
        <span id="sub-count-badge" class="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-semibold rounded-full">
          ${tempSubCommittees.length} รายการ
        </span>
      </div>

      <div class="flex gap-2 mb-3">
        <input type="text" id="new-sub-name" class="form-input flex-1 rounded-xl text-sm"
               placeholder="ชื่อหน่วยงาน / แผนก...">
        <button type="button" id="btn-add-sub"
                class="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                style="background:#059669">+ เพิ่ม</button>
      </div>

      <div id="sub-committee-list" class="space-y-2 max-h-64 overflow-y-auto pr-1"></div>
    </div>

    <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
      <button type="button" onclick="window.closeModal&&window.closeModal()"
              class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">
        ยกเลิก
      </button>
      <button type="submit"
              class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-95"
              style="background:linear-gradient(135deg,#059669,#0d9488)">
        บันทึกข้อมูล
      </button>
    </div>
  </form>`;

  openModal(isEditing ? 'แก้ไขข้อมูลคณะกรรมการ' : 'เพิ่มคณะกรรมการใหม่', html, 'max-w-2xl');
  flatpickr('#TermStartDate', { locale: 'th', dateFormat: 'Y-m-d' });
  flatpickr('#TermEndDate',   { locale: 'th', dateFormat: 'Y-m-d' });
  renderSubCommitteeList();

  /* tab toggle helper */
  function setupDocTab(urlTabId, fileTabId, urlPanelId, filePanelId, linkInputId) {
    const tabUrl  = document.getElementById(urlTabId);
    const tabFile = document.getElementById(fileTabId);
    const panelUrl  = document.getElementById(urlPanelId);
    const panelFile = document.getElementById(filePanelId);
    const active   = 'bg-white text-slate-700 shadow-sm';
    const inactive = 'text-slate-400 hover:text-slate-600';
    tabUrl.addEventListener('click', () => {
      tabUrl.className  = `px-3 py-1.5 rounded-lg transition-all ${active}`;
      tabFile.className = `px-3 py-1.5 rounded-lg transition-all ${inactive}`;
      panelUrl.classList.remove('hidden'); panelFile.classList.add('hidden');
    });
    tabFile.addEventListener('click', () => {
      tabFile.className = `px-3 py-1.5 rounded-lg transition-all ${active}`;
      tabUrl.className  = `px-3 py-1.5 rounded-lg transition-all ${inactive}`;
      panelFile.classList.remove('hidden'); panelUrl.classList.add('hidden');
      if (linkInputId) document.getElementById(linkInputId).value = '';
    });
  }

  setupDocTab('org-tab-url', 'org-tab-file', 'org-panel-url', 'org-panel-file', 'org-link-input');
  setupDocTab('apt-tab-url', 'apt-tab-file', 'apt-panel-url', 'apt-panel-file', 'apt-link-input');

  /* inline add sub */
  const addBtn    = document.getElementById('btn-add-sub');
  const nameInput = document.getElementById('new-sub-name');
  addBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    tempSubCommittees.push({ department: name, activeLink: '', chairperson: '', memberCount: '' });
    nameInput.value = '';
    nameInput.focus();
    renderSubCommitteeList();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
  });

  /* submit */
  document.getElementById('committee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formEl   = e.target;
    const formData = new FormData(formEl);

    try {
      showLoading('กำลังบันทึก...');

      /* upload MainOrgChartFile if any */
      const orgFile = formData.get('MainOrgChartFile');
      if (orgFile && orgFile.size > 0) {
        const up = new FormData();
        up.append('document', orgFile);
        const upRes = await API.post('/upload/document', up, { headers: { 'Content-Type': 'multipart/form-data' } });
        if (!upRes?.url) throw new Error('อัปโหลดผังองค์กรไม่สำเร็จ');
        formData.set('MainOrgChartLink', upRes.url);
      }
      formData.delete('MainOrgChartFile');

      /* upload AppointmentDocFile if any */
      const aptFile = formData.get('AppointmentDocFile');
      if (aptFile && aptFile.size > 0) {
        const up2 = new FormData();
        up2.append('document', aptFile);
        const upRes2 = await API.post('/upload/document', up2, { headers: { 'Content-Type': 'multipart/form-data' } });
        if (!upRes2?.url) throw new Error('อัปโหลดคำสั่งแต่งตั้งไม่สำเร็จ');
        formData.set('AppointmentDocLink', upRes2.url);
      }
      formData.delete('AppointmentDocFile');

      const data = Object.fromEntries(formData.entries());
      data.IsCurrent        = formEl.querySelector('#IsCurrent').checked ? 1 : 0;
      data.SubCommitteeData = JSON.stringify(tempSubCommittees);

      if (data.id) {
        await API.put(`/committees/${data.id}`, data);
      } else {
        await API.post('/committees', data);
      }

      closeModal();
      await loadCommitteePage();
      showToast('บันทึกข้อมูลสำเร็จ', 'success');

    } catch (err) {
      showError(err);
    } finally {
      hideLoading();
    }
  });
}

/* ── sub-committee list renderer ── */
function renderSubCommitteeList() {
  const listEl = document.getElementById('sub-committee-list');
  const badge  = document.getElementById('sub-count-badge');
  if (!listEl) return;
  if (badge) badge.textContent = `${tempSubCommittees.length} รายการ`;

  if (tempSubCommittees.length === 0) {
    listEl.innerHTML = `
      <div class="text-center text-sm text-slate-400 py-5 bg-slate-50 rounded-xl border border-dashed border-slate-200">
        ยังไม่มีรายการ — เพิ่มชื่อหน่วยงานด้านบน
      </div>`;
    return;
  }

  listEl.innerHTML = tempSubCommittees.map((sub, i) => {
    const c    = avatarColor(i);
    const init = getDeptInitials(sub.department);
    const isFirst = i === 0;
    const isLast  = i === tempSubCommittees.length - 1;
    return `
    <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm" data-sub-idx="${i}">
      <div class="flex items-center gap-2 mb-2">
        <div class="flex flex-col gap-0.5 flex-shrink-0">
          <button type="button" data-action="sub-up" data-idx="${i}"
                  class="p-0.5 rounded text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors
                         ${isFirst ? 'invisible' : ''}">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/>
            </svg>
          </button>
          <button type="button" data-action="sub-down" data-idx="${i}"
                  class="p-0.5 rounded text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors
                         ${isLast ? 'invisible' : ''}">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
        </div>
        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
             style="background:${c.bg};color:${c.fg}">${init}</div>
        <span class="text-sm font-semibold text-slate-700 flex-1 min-w-0 truncate" title="${sub.department}">${sub.department}</span>
        <button type="button" data-action="sub-remove" data-idx="${i}"
                class="flex-shrink-0 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="grid grid-cols-3 gap-2 ml-10">
        <input type="text" placeholder="ประธาน..."
               class="sub-chairperson-input col-span-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50
                      focus:outline-none focus:border-emerald-400 transition-colors"
               data-idx="${i}" value="${sub.chairperson || ''}">
        <input type="number" placeholder="จำนวน คน" min="0"
               class="sub-membercount-input col-span-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50
                      focus:outline-none focus:border-emerald-400 transition-colors"
               data-idx="${i}" value="${sub.memberCount || ''}">
        <input type="text" placeholder="ลิงก์เอกสาร..."
               class="sub-link-input col-span-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50
                      focus:outline-none focus:border-emerald-400 transition-colors"
               data-idx="${i}" value="${sub.activeLink || ''}">
      </div>
      <p class="text-xs text-slate-400 mt-1 ml-10">ประธาน / จำนวนสมาชิก / ลิงก์เอกสาร</p>
    </div>`;
  }).join('');

  listEl.onclick = (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const idx = parseInt(btn.dataset.idx, 10);
    if (action === 'sub-remove') {
      tempSubCommittees.splice(idx, 1);
      renderSubCommitteeList();
    } else if (action === 'sub-up' && idx > 0) {
      [tempSubCommittees[idx - 1], tempSubCommittees[idx]] = [tempSubCommittees[idx], tempSubCommittees[idx - 1]];
      renderSubCommitteeList();
    } else if (action === 'sub-down' && idx < tempSubCommittees.length - 1) {
      [tempSubCommittees[idx], tempSubCommittees[idx + 1]] = [tempSubCommittees[idx + 1], tempSubCommittees[idx]];
      renderSubCommitteeList();
    }
  };
  listEl.onchange = (e) => {
    const idx = parseInt(e.target.dataset.idx, 10);
    if (isNaN(idx)) return;
    if (e.target.classList.contains('sub-link-input'))
      tempSubCommittees[idx].activeLink = e.target.value.trim();
    else if (e.target.classList.contains('sub-chairperson-input'))
      tempSubCommittees[idx].chairperson = e.target.value.trim();
    else if (e.target.classList.contains('sub-membercount-input'))
      tempSubCommittees[idx].memberCount = e.target.value.trim();
  };
}

/* ═══════════════════════════════════════════════
   EVENT LISTENERS (delegated, once)
═══════════════════════════════════════════════ */
function setupCommitteeEventListeners() {
  /* timeline expand/collapse */
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#committee-page')) return;
    const toggle = e.target.closest('.timeline-toggle');
    if (toggle && !e.target.closest('[data-action]') && !e.target.closest('.btn-edit-committee') && !e.target.closest('.btn-delete-committee')) {
      const bodyId = toggle.dataset.target;
      const body   = document.getElementById(bodyId);
      const icon   = toggle.querySelector('.tl-icon');
      if (!body) return;
      const closing = !body.classList.contains('hidden');
      body.classList.toggle('hidden', closing);
      if (icon) icon.style.transform = closing ? '' : 'rotate(180deg)';
    }
  });

  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#committee-page')) return;

    /* add committee */
    if (e.target.closest('#btn-add-committee')) { openCommitteeForm(); return; }

    /* export excel */
    if (e.target.closest('#btn-export-excel')) { exportCommitteeExcel(); return; }

    /* print */
    const printBtn = e.target.closest('#btn-print-committee');
    if (printBtn) {
      const id = printBtn.dataset.id;
      const c  = allCommittees.find(x => normalizeId(getCommitteeId(x)) === normalizeId(id));
      if (c) printCommitteeStructure(c);
      return;
    }

    /* copy */
    const copyBtn = e.target.closest('#btn-copy-committee');
    if (copyBtn) {
      const id = copyBtn.dataset.id;
      const c  = allCommittees.find(x => normalizeId(getCommitteeId(x)) === normalizeId(id));
      if (c) copyCommitteeText(c);
      return;
    }

    /* restore */
    const restoreBtn = e.target.closest('[data-action="restore-committee"]');
    if (restoreBtn) {
      const id  = restoreBtn.dataset.id;
      const c   = allCommittees.find(x => normalizeId(getCommitteeId(x)) === normalizeId(id));
      const ok  = await showConfirmationModal(
        'ตั้งเป็นชุดปัจจุบัน',
        `ต้องการตั้ง "${c?.CommitteeTitle || 'คณะกรรมการนี้'}" เป็นชุดปัจจุบันใช่หรือไม่?`
      );
      if (ok) {
        showLoading('กำลังอัปเดต...');
        try {
          const res = await API.put(`/committees/${id}/restore`, {});
          if (res?.success === false) throw new Error(res.message || 'ไม่สำเร็จ');
          await loadCommitteePage();
          showToast('ตั้งเป็นชุดปัจจุบันสำเร็จ', 'success');
        } catch (err) { showError(err); }
        finally { hideLoading(); }
      }
      return;
    }

    /* edit */
    const editBtn = e.target.closest('.btn-edit-committee');
    if (editBtn) {
      const id = editBtn.dataset.id;
      const c  = allCommittees.find(x => normalizeId(getCommitteeId(x)) === normalizeId(id));
      if (c) openCommitteeForm(c);
      return;
    }

    /* delete */
    const delBtn = e.target.closest('.btn-delete-committee');
    if (delBtn) {
      const id = delBtn.dataset.id;
      const ok = await showConfirmationModal('ยืนยันการลบ', 'คุณต้องการลบข้อมูลนี้ใช่หรือไม่?');
      if (ok) {
        showLoading('กำลังลบ...');
        try {
          const res = await API.delete(`/committees/${id}`);
          if (res?.success === false) throw new Error(res.message || 'ลบไม่สำเร็จ');
          await loadCommitteePage();
          showToast('ลบข้อมูลสำเร็จ', 'success');
        } catch (err) { showError(err); }
        finally { hideLoading(); }
      }
      return;
    }

    /* view doc */
    const docBtn = e.target.closest('[data-action="view-doc"]');
    if (docBtn) {
      e.preventDefault();
      showDocumentModal(docBtn.href, docBtn.dataset.title || 'เอกสาร');
    }
  });
}
